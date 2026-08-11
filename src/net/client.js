// Browser-side network client for the authoritative room server.
//
// Three rules this file exists to enforce:
//
//   1. OFFLINE-FIRST. The server lives on Render's free tier, which sleeps and
//      takes 30-60 s to wake. `connect()` never throws, never blocks, and never
//      rejects. If the socket does not come up, `status` goes to 'offline' and
//      the game carries on with its local Round and local AI. A late-arriving
//      connection fires 'online' and the game may hand off then — or ignore it.
//
//   2. SMOOTH REMOTES. Snapshots arrive at 10-15 Hz. Remote participants are
//      rendered from a ~100 ms interpolation buffer, so they move continuously
//      at whatever framerate the renderer runs at.
//
//   3. INVISIBLE CORRECTIONS. The local player is simulated locally by
//      src/engine/controller.js. When the server disagrees, the error is
//      absorbed over ~250 ms instead of snapped, unless it is large enough that
//      smoothing would look worse than a cut.
//
// No DOM, no three.js. Vectors are plain {x,y,z}.

export const FLAGS = { CROUCH: 1, SPRINT: 2, LIGHT: 4, MOVING: 8 };

const DEFAULT_INTERP_MS = 100;
const BUFFER_KEEP_MS = 1200;
const SEND_HZ = 20;
const SOFT_CORRECTION_MS = 250;
const HARD_CORRECTION_M = 4.0;
const PING_MS = 4000;

const now = () => (typeof performance !== 'undefined' && performance.now
  ? performance.now()
  : Date.now());

/**
 * Events (subscribe with `on(name, fn)`, unsubscribe with the returned fn):
 *
 *   status      (status)                     'offline'|'connecting'|'connected'|'error'
 *   online      ({ you, room, arena })       handshake finished, authoritative from here
 *   offline     ({ reason })                 gave up / disconnected / never connected
 *   participants(list)                       [{id,name,isLocal,isAI,role,alive,ready}]
 *   phase       ({ phase, round, endsAt, remaining, seeker })
 *   wheel       ({ seeker, order, seed, spinMs })
 *   kill        ({ s, v, sn, vn, at })
 *   feed        (items[])
 *   roundover   ({ winner, reason, survivors, scoreboard })
 *   correction  ({ x, y, z, hard })          local player was corrected
 *   note        ({ kind, id })               e.g. a player dropped to AI
 *   error       ({ code, msg })
 */
export class NetClient {
  constructor(opts = {}) {
    this.status = 'offline';
    this.you = -1;
    this.room = null;
    this.arena = null;
    this.phase = 'lobby';
    this.round = 0;
    this.seekerId = -1;
    this.participants = [];
    this.rtt = 0;

    this.interpMs = opts.interpMs ?? DEFAULT_INTERP_MS;
    this.sendHz = opts.sendHz ?? SEND_HZ;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 8000;
    this.retries = opts.retries ?? 2;          // cold-start friendly, in the background
    this.retryDelayMs = opts.retryDelayMs ?? 6000;
    this.WebSocketImpl = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);

    this._ws = null;
    this._listeners = new Map();
    this._buffers = new Map();                 // id -> { samples: [], last }
    this._seq = 0;
    this._sendAcc = 0;
    this._pingAcc = 0;
    this._pingId = 0;
    this._pingSentAt = 0;
    this._clockOffset = 0;                     // serverNow - localNow (ms)
    this._phaseEndsAt = 0;
    this._token = null;
    this._url = null;
    this._joinOpts = null;
    this._attempt = 0;
    this._timeoutTimer = null;
    this._retryTimer = null;
    this._closedByUs = false;
    this._corr = null;                         // { x, y, z, t, dur }
    this._localState = { x: 0, y: 0, z: 0, yaw: 0, flags: 0 };
    this._dirty = false;
    this._netTime = 0;                         // ms, our own monotonic clock
  }

  // --------------------------------------------------------------------------
  // events
  // --------------------------------------------------------------------------

  on(event, fn) {
    let a = this._listeners.get(event);
    if (!a) { a = []; this._listeners.set(event, a); }
    a.push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const a = this._listeners.get(event);
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }

  _emit(event, payload) {
    const a = this._listeners.get(event);
    if (!a) return;
    for (let i = 0; i < a.length; i++) {
      try { a[i](payload); } catch (e) { console.warn(`[net] listener for "${event}" threw`, e); }
    }
  }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this._emit('status', s);
  }

  // --------------------------------------------------------------------------
  // connection
  // --------------------------------------------------------------------------

  /**
   * Try to connect. Returns a promise that ALWAYS resolves — `true` if the
   * handshake completed, `false` if we are staying offline. Callers are free to
   * ignore the promise entirely and just listen for 'online'.
   *
   * @param {string} url  ws:// or wss:// URL ending in /ws. Falsy = stay offline.
   * @param {{room?:string,name?:string,arena?:string,hidingSpots?:Array}} opts
   */
  connect(url, opts = {}) {
    this.disconnect(true);
    this._closedByUs = false;
    this._attempt = 0;

    if (!url || typeof url !== 'string') {
      this._setStatus('offline');
      this._emit('offline', { reason: 'no_url' });
      return Promise.resolve(false);
    }
    if (!this.WebSocketImpl) {
      this._setStatus('offline');
      this._emit('offline', { reason: 'no_websocket' });
      return Promise.resolve(false);
    }

    this._url = url;
    this._joinOpts = {
      room: opts.room || null,
      name: opts.name || 'OPERATIVE',
      arena: opts.arena || null,
      hidingSpots: compactSpots(opts.hidingSpots),
    };

    return new Promise((resolve) => {
      this._resolveConnect = resolve;
      this._open();
    });
  }

  _finish(ok, reason) {
    const r = this._resolveConnect;
    this._resolveConnect = null;
    if (r) r(ok);
    if (!ok) this._emit('offline', { reason });
  }

  _open() {
    this._attempt++;
    this._setStatus('connecting');
    let ws;
    try {
      ws = new this.WebSocketImpl(this._url);
    } catch (e) {
      this._giveUpOrRetry('construct_failed');
      return;
    }
    this._ws = ws;

    this._timeoutTimer = setTimeout(() => {
      if (this.status === 'connecting') {
        try { ws.close(); } catch { /* ignore */ }
        this._giveUpOrRetry('timeout');
      }
    }, this.connectTimeoutMs);

    ws.onopen = () => {
      const j = this._joinOpts;
      this._sendRaw({
        t: 'hello',
        proto: 1,
        name: j.name,
        room: j.room || undefined,
        token: this._token || undefined,
        arena: j.arena || undefined,
        hidingSpots: j.hidingSpots || undefined,
      });
    };

    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      this._handle(m);
    };

    ws.onerror = () => { /* onclose always follows; handle it there */ };

    ws.onclose = () => {
      const wasConnected = this.status === 'connected';
      this._ws = null;
      clearTimeout(this._timeoutTimer);
      this._buffers.clear();
      if (this._closedByUs) { this._setStatus('offline'); return; }
      if (wasConnected) {
        // Mid-session drop. One quick reconnect using the resume token, then
        // fall back to local play — the round must not stall on the network.
        this._setStatus('connecting');
        this._attempt = 0;
        clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => this._open(), 1200);
        this._emit('note', { kind: 'reconnecting' });
        return;
      }
      this._giveUpOrRetry('closed');
    };
  }

  _giveUpOrRetry(reason) {
    clearTimeout(this._timeoutTimer);
    if (!this._closedByUs && this._attempt <= this.retries) {
      this._setStatus('connecting');
      clearTimeout(this._retryTimer);
      // Backs off; a free-tier cold start needs 30-60 s and the game is already
      // playing locally while this happens.
      this._retryTimer = setTimeout(() => this._open(), this.retryDelayMs * this._attempt);
      return;
    }
    this._setStatus('offline');
    this._finish(false, reason);
  }

  disconnect(quiet = false) {
    this._closedByUs = true;
    clearTimeout(this._timeoutTimer);
    clearTimeout(this._retryTimer);
    const ws = this._ws;
    this._ws = null;
    if (ws) {
      try { if (ws.readyState === 1) ws.send('{"t":"leave"}'); } catch { /* ignore */ }
      try { ws.close(1000, 'client'); } catch { /* ignore */ }
    }
    this._buffers.clear();
    this.you = -1;
    if (!quiet) { this._setStatus('offline'); this._emit('offline', { reason: 'disconnect' }); }
    else this.status = 'offline';
  }

  get connected() { return this.status === 'connected'; }

  // --------------------------------------------------------------------------
  // outbound
  // --------------------------------------------------------------------------

  _sendRaw(obj) {
    const ws = this._ws;
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  /**
   * Generic escape hatch: `send('ready', { ready: true })` or `send({t:'ready'})`.
   * Silently no-ops while offline, which is the whole point.
   */
  send(type, payload) {
    if (typeof type === 'object' && type) return this._sendRaw(type);
    return this._sendRaw({ t: type, ...(payload || {}) });
  }

  ready(v = true) { return this.send('ready', { ready: !!v }); }
  setName(name) { return this.send('name', { name }); }

  /** Tell the server the arena and its hiding spots (AI waypoints). */
  sendArena(arenaId, hidingSpots) {
    return this.send('arena', { arena: arenaId, hidingSpots: compactSpots(hidingSpots) });
  }

  /** Seeker-side hint that a hider was touched. The server still verifies. */
  claim(id) { return this.send('claim', { id }); }

  /**
   * Feed the local player's transform in. Cheap to call every frame — it is
   * rate-limited to `sendHz` inside `update()`.
   */
  setLocalState(x, y, z, yaw, flags = 0) {
    const s = this._localState;
    s.x = x; s.y = y; s.z = z; s.yaw = yaw; s.flags = flags | 0;
    this._dirty = true;
  }

  // --------------------------------------------------------------------------
  // inbound
  // --------------------------------------------------------------------------

  _handle(m) {
    switch (m.t) {
      case 'welcome': {
        clearTimeout(this._timeoutTimer);
        this.you = m.you;
        this._token = m.token || this._token;
        this.room = m.room ? m.room.code : null;
        this.arena = m.room ? m.room.arena : null;
        this._joinOpts.room = this.room;
        if (typeof m.now === 'number') this._clockOffset = m.now - Date.now();
        this._setStatus('connected');
        this._emit('online', { you: this.you, room: this.room, arena: this.arena, resumed: !!m.resumed });
        this._finish(true, null);
        break;
      }
      case 'roster':
        this.participants = m.p || [];
        for (const p of this.participants) p.isLocal = p.id === this.you;
        this._emit('participants', this.participants);
        break;
      case 'phase':
        this.phase = m.phase;
        this.round = m.round;
        this.seekerId = m.seeker;
        if (typeof m.now === 'number') this._clockOffset = m.now - Date.now();
        this._phaseEndsAt = m.endsAt || 0;
        this._emit('phase', {
          phase: m.phase, round: m.round, seeker: m.seeker, arena: m.arena,
          endsAt: m.endsAt, remaining: m.remaining,
        });
        break;
      case 'wheel':
        this._emit('wheel', m);
        break;
      case 's':
        this._ingestSnapshot(m);
        break;
      case 'kill':
        this._emit('kill', m);
        break;
      case 'feed':
        this._emit('feed', m.items || []);
        break;
      case 'roundover':
        this._emit('roundover', m);
        break;
      case 'correct':
        this._applyCorrection(m);
        break;
      case 'note':
        this._emit('note', m);
        break;
      case 'pong':
        if (m.id === this._pingId) this.rtt = Math.round(now() - this._pingSentAt);
        if (typeof m.now === 'number') this._clockOffset = m.now + this.rtt / 2 - Date.now();
        break;
      case 'error':
        this._emit('error', m);
        break;
      case 'bye':
        this._closedByUs = true;
        this._setStatus('offline');
        this._emit('offline', { reason: m.reason || 'bye' });
        break;
      default:
        break;
    }
  }

  _ingestSnapshot(m) {
    const t = this._netTime;
    const list = m.p || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const id = e[0];
      if (id === this.you) { this._serverEcho = e; continue; }
      let b = this._buffers.get(id);
      if (!b) { b = { samples: [] }; this._buffers.set(id, b); }
      b.samples.push({ t, x: e[1], y: e[2], z: e[3], yaw: e[4], f: e[5] });
      if (b.samples.length > 40) b.samples.shift();
    }
  }

  _applyCorrection(m) {
    const s = this._localState;
    const dx = m.x - s.x, dy = m.y - s.y, dz = m.z - s.z;
    const err = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const hard = err > HARD_CORRECTION_M;
    // Accumulate rather than replace: two corrections in flight should sum.
    if (hard) {
      this._corr = null;
    } else if (this._corr) {
      this._corr.x += dx; this._corr.y += dy; this._corr.z += dz;
    } else {
      this._corr = { x: dx, y: dy, z: dz };
    }
    this._emit('correction', { x: m.x, y: m.y, z: m.z, dx, dy, dz, error: err, hard });
  }

  /**
   * Per-frame pump. Call this once per frame with the frame delta in seconds,
   * whether connected or not — it is a no-op offline.
   */
  update(dt) {
    this._netTime += dt * 1000;
    if (this.status !== 'connected') return;

    // Outbound state at a fixed rate.
    this._sendAcc += dt;
    const interval = 1 / this.sendHz;
    if (this._sendAcc >= interval) {
      this._sendAcc = 0;
      if (this._dirty) {
        const s = this._localState;
        this._sendRaw({
          t: 'state', seq: ++this._seq,
          x: r3(s.x), y: r3(s.y), z: r3(s.z), yaw: r3(s.yaw), f: s.flags,
        });
        this._dirty = false;
      }
    }

    this._pingAcc += dt * 1000;
    if (this._pingAcc >= PING_MS) {
      this._pingAcc = 0;
      this._pingId = (this._pingId + 1) & 0xffff;
      this._pingSentAt = now();
      this._sendRaw({ t: 'ping', id: this._pingId });
    }

    // Retire interpolation samples we can never need again.
    const cutoff = this._netTime - this.interpMs - BUFFER_KEEP_MS;
    for (const b of this._buffers.values()) {
      while (b.samples.length > 2 && b.samples[1].t < cutoff) b.samples.shift();
    }

  }

  /**
   * The smoothed position offset to add to the local player this frame, so a
   * server correction is walked off instead of snapped. Returns null when there
   * is nothing to apply.
   *
   * Typical use, once per frame, after controller.update():
   *   const n = net.consumeCorrection(dt);
   *   if (n) controller.collider.translate(new THREE.Vector3(n.x, n.y, n.z));
   */
  consumeCorrection(dt) {
    const c = this._corr;
    if (!c) return null;
    // Exponential approach with a ~SOFT_CORRECTION_MS time constant: a 1 m error
    // is gone in a quarter second and never reads as a snap.
    const k = 1 - Math.exp(-(dt * 1000) / SOFT_CORRECTION_MS * 3);
    const out = { x: c.x * k, y: c.y * k, z: c.z * k };
    c.x -= out.x; c.y -= out.y; c.z -= out.z;
    if (Math.abs(c.x) + Math.abs(c.y) + Math.abs(c.z) < 0.005) this._corr = null;
    return out;
  }

  /**
   * Interpolated transform for a remote participant, or null if we have never
   * heard about them. `{ x, y, z, yaw, flags, moving, sprinting, crouching }`.
   */
  getTransform(id) {
    const b = this._buffers.get(id);
    if (!b || !b.samples.length) return null;
    const target = this._netTime - this.interpMs;
    const s = b.samples;

    if (s.length === 1 || target <= s[0].t) return decorate(s[0]);

    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].t <= target) {
        const a = s[i], c = s[i + 1];
        if (!c) {
          // Ahead of the newest sample: extrapolate briefly, then hold. Holding
          // beats rubber-banding when a client stops sending.
          const prev = s[i - 1];
          if (prev && target - a.t < 250) {
            const span = a.t - prev.t || 1;
            const k = Math.min(1.5, (target - a.t) / span);
            return decorate({
              x: a.x + (a.x - prev.x) * k,
              y: a.y + (a.y - prev.y) * k,
              z: a.z + (a.z - prev.z) * k,
              yaw: a.yaw, f: a.f,
            });
          }
          return decorate(a);
        }
        const span = c.t - a.t || 1;
        const k = Math.max(0, Math.min(1, (target - a.t) / span));
        return decorate({
          x: a.x + (c.x - a.x) * k,
          y: a.y + (c.y - a.y) * k,
          z: a.z + (c.z - a.z) * k,
          yaw: a.yaw + shortestAngle(a.yaw, c.yaw) * k,
          f: k > 0.5 ? c.f : a.f,
        });
      }
    }
    return decorate(s[0]);
  }

  /** Every remote participant's interpolated transform, as a Map id -> transform. */
  getTransforms(out = new Map()) {
    out.clear();
    for (const id of this._buffers.keys()) {
      const t = this.getTransform(id);
      if (t) out.set(id, t);
    }
    return out;
  }

  /** Milliseconds left in the current phase, from the server's clock. */
  phaseRemaining() {
    if (!this._phaseEndsAt) return 0;
    return Math.max(0, this._phaseEndsAt - (Date.now() + this._clockOffset));
  }

  /** The local participant record, or null. */
  get me() {
    for (const p of this.participants) if (p.id === this.you) return p;
    return null;
  }

  get role() { const m = this.me; return m ? m.role : null; }
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function decorate(s) {
  return {
    x: s.x, y: s.y, z: s.z, yaw: s.yaw, flags: s.f,
    crouching: !!(s.f & FLAGS.CROUCH),
    sprinting: !!(s.f & FLAGS.SPRINT),
    light: !!(s.f & FLAGS.LIGHT),
    moving: !!(s.f & FLAGS.MOVING),
  };
}

function shortestAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function r3(v) { return Math.round(v * 1000) / 1000; }

/**
 * Turn `world.hidingSpots` ([{ pos: Vector3, radius, quality }]) into the
 * compact wire form, capped so a big arena cannot bloat the handshake.
 */
function compactSpots(spots) {
  if (!Array.isArray(spots) || !spots.length) return null;
  const out = [];
  const stride = Math.max(1, Math.ceil(spots.length / 48));
  for (let i = 0; i < spots.length && out.length < 48; i += stride) {
    const s = spots[i];
    const p = s && (s.pos || s);
    if (!p || !Number.isFinite(p.x)) continue;
    out.push({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      z: Math.round(p.z * 10) / 10,
      q: Math.round((s.quality ?? s.q ?? 1) * 100) / 100,
    });
  }
  return out.length >= 4 ? out : null;
}

export default NetClient;
