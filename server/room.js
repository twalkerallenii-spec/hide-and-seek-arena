// One game room: participants, phases, authoritative simulation.
//
// The phase model here is deliberately identical to the client's local
// src/game/round.js so the same UI can be driven by either:
//
//   lobby -> wheel -> hide (30 s) -> hunt -> roundover -> lobby
//
// 11 participants, exactly 1 seeker and 10 hiders. Participants are broadcast as
// { id, name, isLocal, isAI, role, alive } — the same record shape the local
// Round produces.
//
// AUTHORITY MODEL — trust but verify.
// The server owns: phase, all timers, role assignment, who is caught, and the
// roster. The server does NOT own physics: there is no collision geometry here
// (see ai.js for why). Clients integrate their own capsule controller and send
// the result; the server checks each update against the movement model in
// src/engine/controller.js (walk 4.4, sprint 8.1, jump 8.2, gravity 26) and
// against the arena bounds, rejects impossible deltas, and rebroadcasts.

import {
  updateAI, initBrain, clearBrain, claimSpot, releaseSpot, fallbackSpots,
} from './ai.js';

export const CAPACITY = 11;

export const TICK_HZ = 20;
export const SNAP_HZ = 12;
const SNAP_MS = 1000 / SNAP_HZ;
const FULL_SNAP_EVERY = 24;          // a keyframe every ~2 s

// Phase durations. The defaults are the game; the env overrides exist so
// test-client.mjs can run a whole round without waiting three minutes for the
// hunt timer. Production leaves them unset.
const secs = (key, dflt) => {
  const v = Number(process.env[key]);
  return (Number.isFinite(v) && v > 0 ? v : dflt) * 1000;
};
export const LOBBY_MAX_WAIT_MS = secs('LOBBY_WAIT_SECONDS', 20);
// The canonical rule lives with the client so the two can never drift.
export { JOIN_WINDOW } from '../src/game/round.js';
import { JOIN_WINDOW } from '../src/game/round.js';
export const WHEEL_MS = secs('WHEEL_SECONDS', 3);
export const HIDE_MS = secs('HIDE_SECONDS', 30);
export const HUNT_MS = secs('HUNT_SECONDS', 180);
export const OVER_MS = secs('OVER_SECONDS', 8);
export const RECONNECT_GRACE_MS = secs('RECONNECT_SECONDS', 30);

const CATCH_RADIUS = 2.2;
const CATCH_DY = 2.6;
const CLAIM_RADIUS = 3.0;            // slightly looser for a client-sent claim

// Movement validation. Generous on purpose — a false positive on a laggy player
// is worse than letting a cheater gain half a metre.
const MAX_H_SPEED = 12.0;            // sprint 8.1 + slopes/powerups/jitter
const MAX_UP_SPEED = 11.0;           // jump 8.2 + a little
const MAX_DOWN_SPEED = 70.0;         // long falls are not capped in-engine
const POS_SLACK = 0.6;               // metres of free jitter per update
const RESYNC_GAP_MS = 1200;          // a gap this long is lag, not a teleport
const VIOLATION_KICK = 40;           // violations inside VIOLATION_WINDOW
const VIOLATION_WINDOW_MS = 10000;

// Movement/appearance flag bits, shared with ai.js and src/net/client.js.
export const FLAGS = { CROUCH: 1, SPRINT: 2, LIGHT: 4, MOVING: 8 };

// Per-arena table. Only bounds + spawn: the two things authority depends on.
// These mirror `meta` in src/arenas/a*.js. Hiding spots are NOT here — see
// `adoptArena` below for why they come from the client instead.
export const ARENAS = {
  backrooms: { bounds: 100, spawn: [0, 0, 0] },
  neonmetro: { bounds: 100, spawn: [-34, 0, -6] },
  cargoyard: { bounds: 130, spawn: [0, 0, 68] },
  undercroft: { bounds: 96, spawn: [-23, 0, -51] },
  aqueducts: { bounds: 104, spawn: [-8, 0, -36] },
  frostwatch: { bounds: 92, spawn: [-42, 0.05, 4] },
  orbital: { bounds: 92, spawn: [39.66, 1.0, 5.22] },
  palisade: { bounds: 100, spawn: [0, 0, 26] },
  forge: { bounds: 120, spawn: [8, 0.2, 6] },
  abbadon: { bounds: 100, spawn: [0, 0.05, -2] },
  bazaar: { bounds: 110, spawn: [0, 0.05, 80] },
  static: { bounds: 110, spawn: [0, 14, 12] },
};
const DEFAULT_ARENA = 'backrooms';

let ROOM_SEQ = 0;

export class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.isPublic = opts.isPublic !== false;
    this.seq = ++ROOM_SEQ;
    this.log = opts.log || (() => {});

    this.arenaId = ARENAS[opts.arenaId] ? opts.arenaId : DEFAULT_ARENA;
    this.arena = {
      id: this.arenaId,
      bounds: ARENAS[this.arenaId].bounds,
      spawn: ARENAS[this.arenaId].spawn.slice(),
      spots: fallbackSpots(this.arenaId, ARENAS[this.arenaId].bounds),
      fromClient: false,
    };
    this.spotOwner = new Int16Array(64).fill(-1);
    this._sizeSpotOwner();

    this.parts = [];
    this.freeIds = [];
    for (let i = CAPACITY - 1; i >= 0; i--) this.freeIds.push(i);

    this.phase = 'lobby';
    this.phaseStart = Date.now();
    this.phaseEnd = 0;                 // 0 = no deadline (lobby waits on ready)
    this.lobbySince = Date.now();
    this.round = 0;
    this.feed = [];
    this.seekerId = -1;

    this.nowMs = Date.now();
    this.lastTick = this.nowMs;
    this.tickIndex = 0;
    this.snapIndex = 0;
    this.nextSnapAt = 0;
    this.lastSent = new Map();         // id -> Int32Array(5) quantised
    this.lastSnapBytes = 0;
    this.peakSnapBytes = 0;
    this.dead = false;
    this.emptySince = 0;
  }

  _sizeSpotOwner() {
    if (this.spotOwner.length < this.arena.spots.length) {
      this.spotOwner = new Int16Array(this.arena.spots.length).fill(-1);
    } else {
      this.spotOwner.fill(-1);
    }
  }

  // ------------------------------------------------------------------------
  // arena
  // ------------------------------------------------------------------------

  /**
   * Adopt the hiding-spot list the first joining client reports.
   *
   * WHY THE CLIENT AND NOT A SERVER TABLE: hiding spots are emitted by
   * `ctx.hidingSpot()` while an arena *builds*, deep inside three.js geometry
   * code. Reproducing them server-side means either shipping three.js and the
   * whole arena pipeline to Render's free tier (hundreds of MB of build and
   * seconds of CPU per room) or hand-maintaining ~200 coordinates that would
   * silently drift the moment an arena is edited. Neither is worth it, because
   * hiding spots are *only* used as AI waypoints: they are not part of
   * authority. The worst a malicious client can do by lying here is make the
   * bots walk to silly places in its own room. Bounds and spawn — the values
   * authority actually depends on — stay in the server-side ARENAS table above,
   * and every submitted spot is clamped to them.
   */
  adoptArena(arenaId, spots) {
    if (this.arena.fromClient) return;
    if (arenaId && ARENAS[arenaId] && this.phase === 'lobby' && this.parts.length <= 1) {
      this.arenaId = arenaId;
      this.arena.id = arenaId;
      this.arena.bounds = ARENAS[arenaId].bounds;
      this.arena.spawn = ARENAS[arenaId].spawn.slice();
      this.arena.spots = fallbackSpots(arenaId, this.arena.bounds);
    }
    if (Array.isArray(spots) && spots.length >= 4) {
      const b = this.arena.bounds + 4;
      const out = [];
      for (let i = 0; i < spots.length && out.length < 64; i++) {
        const s = spots[i];
        if (!s) continue;
        const x = +s.x, y = +s.y, z = +s.z;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        if (Math.abs(x) > b || Math.abs(z) > b || y < -80 || y > 260) continue;
        out.push({ x, y, z, q: Number.isFinite(+s.q) ? Math.max(0, Math.min(1, +s.q)) : 1 });
      }
      if (out.length >= 4) {
        this.arena.spots = out;
        this.arena.fromClient = true;
      }
    }
    this._sizeSpotOwner();
  }

  // ------------------------------------------------------------------------
  // membership
  // ------------------------------------------------------------------------

  get humanCount() {
    let n = 0;
    for (const p of this.parts) if (!p.isAI && p.sock) n++;
    return n;
  }

  get openSlots() { return CAPACITY - this.parts.length; }

  canAcceptHuman() {
    if (this.dead) return false;
    if (this.parts.length < CAPACITY) return true;
    // A slot held by an AI backfill is reclaimable while we are still in lobby.
    return this.phase === 'lobby' && this.parts.some(p => p.isAI && !p.token);
  }

  join(sock, { name, token }) {
    if (this.dead) return { error: 'room_closed' };

    // --- reconnect -----------------------------------------------------------
    if (token) {
      const p = this.parts.find(q => q.token === token);
      if (p) {
        if (p.sock && p.sock !== sock) return { error: 'slot_in_use' };
        p.sock = sock;
        p.isAI = false;
        p.disconnectAt = 0;
        clearBrain(p);
        releaseSpot(p, this);
        p.lastStateAt = this.nowMs;
        this.log(`room ${this.code}: ${p.name} (#${p.id}) reconnected`);
        this._sendWelcome(p, true);
        this.broadcastRoster();
        return { participant: p, resumed: true };
      }
      // Token expired or unknown — fall through and treat as a fresh join.
    }

    if (!this.canAcceptHuman()) return { error: 'room_full' };

    // Reclaim an AI backfill slot if the roster is nominally full.
    if (this.parts.length >= CAPACITY) {
      const bot = this.parts.find(q => q.isAI && !q.token);
      if (bot) this._removeParticipant(bot);
      else return { error: 'room_full' };
    }

    const p = this._makeParticipant({ name, sock });
    this.parts.push(p);
    if (this.phase !== 'lobby') {
      // Joined mid-round: wait it out, then take a slot at the next lobby.
      // Arriving mid-round drops you in at the start area as a hider, already
      // marked found so you do not extend the seeker's win condition.
      p.role = 'hider';
      p.alive = true;
      p.wasCaught = true;
      p.lateJoin = true;
      p.alive = false;
    }
    this.log(`room ${this.code}: ${p.name} (#${p.id}) joined (${this.humanCount} human / ${this.parts.length} total)`);
    this._sendWelcome(p, false);
    this.broadcastRoster();
    this.emptySince = 0;
    return { participant: p, resumed: false };
  }

  _makeParticipant({ name, sock, isAI = false }) {
    const id = this.freeIds.pop();
    const sp = this.arena.spawn;
    return {
      id,
      name: sanitizeName(name) || (isAI ? botName(id) : `PLAYER ${id + 1}`),
      isAI,
      role: null,
      alive: true,
      ready: false,
      sock: sock || null,
      token: isAI ? null : makeToken(),
      x: sp[0], y: sp[1], z: sp[2], yaw: 0, flags: 0,
      seq: 0,
      lastStateAt: this.nowMs,
      disconnectAt: 0,
      violations: 0,
      violationSince: this.nowMs,
      claimAt: 0,
      catches: 0,
      survivedMs: 0,
      ai: null,
    };
  }

  _removeParticipant(p) {
    const i = this.parts.indexOf(p);
    if (i >= 0) this.parts.splice(i, 1);
    releaseSpot(p, this);
    this.lastSent.delete(p.id);
    if (p.id >= 0) this.freeIds.push(p.id);
  }

  /** A socket went away. Mid-round this converts the slot to AI. */
  drop(p, reason = 'closed') {
    if (!p || p.gone) return;
    p.sock = null;
    if (this.phase === 'lobby' || this.phase === 'roundover' || p.role === 'spectator') {
      p.gone = true;
      this._removeParticipant(p);
      this.log(`room ${this.code}: #${p.id} left in ${this.phase} (${reason})`);
    } else {
      p.isAI = true;
      p.disconnectAt = this.nowMs;
      initBrain(p, this.arena);
      if (p.alive && p.role === 'hider') claimSpot(p, this.arena.spots, this, p.x, p.z);
      this.log(`room ${this.code}: #${p.id} dropped mid-${this.phase} -> AI (${reason})`);
      this.broadcast(JSON.stringify({ t: 'note', kind: 'dropped', id: p.id }));
    }
    this.broadcastRoster();
    if (this.humanCount === 0 && !this.emptySince) this.emptySince = this.nowMs;
  }

  /** True when this room can be reaped: no humans and nobody can still come back. */
  isDisposable(now) {
    if (this.dead) return true;
    if (this.humanCount > 0) return false;
    if (!this.emptySince) this.emptySince = now;
    // Someone may still reconnect into an AI-held slot.
    const pending = this.parts.some(p => p.token && p.disconnectAt && now - p.disconnectAt < RECONNECT_GRACE_MS);
    if (pending) return false;
    return now - this.emptySince > RECONNECT_GRACE_MS;
  }

  destroy(reason = 'empty') {
    if (this.dead) return;
    this.dead = true;
    const bye = JSON.stringify({ t: 'bye', reason });
    for (const p of this.parts) { try { p.sock?.send(bye); p.sock?.close(1000, reason); } catch { /* ignore */ } }
    this.parts.length = 0;
    this.lastSent.clear();
    this.log(`room ${this.code}: destroyed (${reason})`);
  }

  // ------------------------------------------------------------------------
  // outbound
  // ------------------------------------------------------------------------

  send(p, obj) {
    const s = p.sock;
    if (!s || s.readyState !== 1) return;
    try { s.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* ignore */ }
  }

  broadcast(str, except = null) {
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p === except) continue;
      const s = p.sock;
      if (!s || s.readyState !== 1) continue;
      try { s.send(str); } catch { /* ignore */ }
    }
  }

  _sendWelcome(p, resumed) {
    this.send(p, {
      t: 'welcome',
      proto: 1,
      you: p.id,
      token: p.token,
      resumed,
      room: { code: this.code, arena: this.arena.id, capacity: CAPACITY, public: this.isPublic },
      rates: { tick: TICK_HZ, snap: SNAP_HZ },
      now: Date.now(),
      hideSeconds: HIDE_MS / 1000,
    });
    this.send(p, this.rosterMessage(p.id));
    this.send(p, this.phaseMessage());
    if (this.feed.length) this.send(p, { t: 'feed', items: this.feed.slice(-8) });
    this._forceFullSnapshot = true;
  }

  rosterMessage(youId) {
    const list = new Array(this.parts.length);
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      list[i] = {
        id: p.id,
        name: p.name,
        isLocal: p.id === youId,
        isAI: p.isAI,
        role: p.role,
        alive: p.alive,
        ready: p.ready,
      };
    }
    return { t: 'roster', p: list, humans: this.humanCount };
  }

  broadcastRoster() {
    for (const p of this.parts) {
      if (!p.sock || p.sock.readyState !== 1) continue;
      this.send(p, this.rosterMessage(p.id));
    }
  }

  phaseMessage() {
    return {
      t: 'phase',
      phase: this.phase,
      round: this.round,
      now: Date.now(),
      endsAt: this.phaseEnd || 0,
      remaining: this.phaseEnd ? Math.max(0, this.phaseEnd - Date.now()) : 0,
      arena: this.arena.id,
      seeker: this.seekerId,
    };
  }

  setPhase(phase, durationMs) {
    this.phase = phase;
    this.phaseStart = this.nowMs;
    this.phaseEnd = durationMs ? this.nowMs + durationMs : 0;
    this.broadcast(JSON.stringify(this.phaseMessage()));
    this._forceFullSnapshot = true;
  }

  // ------------------------------------------------------------------------
  // inbound
  // ------------------------------------------------------------------------

  handle(p, msg) {
    switch (msg.t) {
      case 'ready':
        if (this.phase !== 'lobby' || p.role === 'spectator') return;
        p.ready = msg.ready !== false;
        this.broadcastRoster();
        break;

      case 'state':
        this._applyState(p, msg);
        break;

      case 'claim':
        this._handleClaim(p, msg);
        break;

      case 'arena':
        this.adoptArena(msg.arena, msg.hidingSpots);
        break;

      case 'name':
        if (this.phase === 'lobby') {
          const n = sanitizeName(msg.name);
          if (n) { p.name = n; this.broadcastRoster(); }
        }
        break;

      case 'ping':
        this.send(p, { t: 'pong', id: msg.id, now: Date.now() });
        break;

      case 'leave':
        this.drop(p, 'left');
        break;

      default:
        break;
    }
  }

  _applyState(p, m) {
    const x = +m.x, y = +m.y, z = +m.z;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const yaw = Number.isFinite(+m.yaw) ? +m.yaw : p.yaw;
    const flags = (m.f | 0) & 15;
    const now = this.nowMs;

    if (typeof m.seq === 'number') {
      if (m.seq <= p.seq && p.seq - m.seq < 1000) return;   // stale/out of order
      p.seq = m.seq;
    }

    // Bounds clamp is unconditional and silent — it is a correctness rail, not
    // an accusation. Falling out of the world is legal (the controller
    // respawns), so the Y range is wide.
    const lim = this.arena.bounds + 8;
    let cx = Math.max(-lim, Math.min(lim, x));
    let cy = Math.max(-90, Math.min(280, y));
    let cz = Math.max(-lim, Math.min(lim, z));

    const dtMs = now - p.lastStateAt;
    p.lastStateAt = now;

    let rejected = false;
    if (dtMs > 0 && dtMs < RESYNC_GAP_MS) {
      const dt = dtMs / 1000;
      const dx = cx - p.x, dz = cz - p.z, dy = cy - p.y;
      const h = Math.sqrt(dx * dx + dz * dz);
      const maxH = MAX_H_SPEED * dt + POS_SLACK;
      const maxUp = MAX_UP_SPEED * dt + POS_SLACK;
      const maxDown = MAX_DOWN_SPEED * dt + POS_SLACK;
      if (h > maxH) {
        const k = maxH / h;
        cx = p.x + dx * k; cz = p.z + dz * k;
        rejected = true;
      }
      if (dy > maxUp) { cy = p.y + maxUp; rejected = true; }
      else if (-dy > maxDown) { cy = p.y - maxDown; rejected = true; }
    }

    // During hide the seeker is caged at spawn. This is enforced, not asked.
    if (this.phase === 'hide' && p.role === 'seeker') {
      const sp = this.arena.spawn;
      const dx = cx - sp[0], dz = cz - sp[2];
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 2.0) {
        const k = 2.0 / d;
        cx = sp[0] + dx * k; cz = sp[2] + dz * k;
        rejected = true;
      }
    }

    p.x = cx; p.y = cy; p.z = cz; p.yaw = yaw; p.flags = flags;

    if (rejected) {
      if (now - p.violationSince > VIOLATION_WINDOW_MS) { p.violations = 0; p.violationSince = now; }
      p.violations++;
      this.send(p, { t: 'correct', seq: p.seq, x: r2(cx), y: r2(cy), z: r2(cz) });
      if (p.violations > VIOLATION_KICK) {
        this.log(`room ${this.code}: kicking #${p.id} for ${p.violations} movement violations`);
        this.send(p, { t: 'error', code: 'movement', msg: 'movement rejected too often' });
        try { p.sock?.close(1008, 'movement'); } catch { /* ignore */ }
      }
    }
  }

  _handleClaim(p, m) {
    if (this.phase !== 'hunt' || p.role !== 'seeker' || !p.alive) return;
    if (this.nowMs - p.claimAt < 150) return;
    p.claimAt = this.nowMs;
    const v = this.parts.find(q => q.id === (m.id | 0));
    if (!v || v.role !== 'hider' || !v.alive) return;
    const dx = v.x - p.x, dz = v.z - p.z, dy = v.y - p.y;
    if (Math.abs(dy) > CATCH_DY) return;
    if (dx * dx + dz * dz > CLAIM_RADIUS * CLAIM_RADIUS) return;
    this._catch(p, v);
  }

  // ------------------------------------------------------------------------
  // simulation
  // ------------------------------------------------------------------------

  tick(now) {
    if (this.dead) return;
    const dt = Math.min(0.25, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    this.nowMs = now;
    this.tickIndex++;

    this._reapStale(now);
    this._respawnTick(now);
    this._phaseMachine(now);
    updateAI(this, dt);
    if (this.phase === 'hunt') this._catches(dt);

    if (now >= this.nextSnapAt) {
      this.nextSnapAt = now + SNAP_MS;
      this._snapshot();
    }
  }

  _reapStale(now) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.sock || !p.disconnectAt) continue;
      if (now - p.disconnectAt < RECONNECT_GRACE_MS) continue;
      // Grace expired. Mid-round the bot keeps playing to the end of the round
      // (removing it would break "1 seeker / 10 hiders"); in lobby it goes.
      if (this.phase === 'lobby' || this.phase === 'roundover') {
        this._removeParticipant(p);
        this.broadcastRoster();
      } else {
        p.token = null;      // no longer reclaimable, but still a live bot
      }
    }
  }

  /**
   * Being found is a setback, not an ejection. Three seconds after a catch the
   * hider is back at the start area and in the round again — but `wasCaught`
   * stays set, so they no longer hold up the seeker's win condition.
   */
  _respawnTick(now) {
    if (this.phase !== 'hunt') return;
    const sp = this.spawn || [0, 1, 0];
    for (const p of this.parts) {
      if (p.role !== 'hider' || p.alive || !p.caughtAt) continue;
      if (now - p.caughtAt < 3000) continue;
      p.alive = true;
      p.x = sp[0]; p.y = sp[1]; p.z = sp[2];
      p.caughtAt = 0;
      // Grace period. Without it a seeker loitering at the start area catches
      // the same hider every three seconds indefinitely.
      p.safeUntil = now + 6000;
      this.broadcast({ type: 'respawn', id: p.id, safeFor: 6 });
    }
  }

  _phaseMachine(now) {
    switch (this.phase) {
      case 'lobby': {
        const humans = this.humanCount;
        if (humans === 0) { this.lobbySince = now; return; }
        // START opens a fixed 30 s window for other people to arrive, rather
        // than waiting on everyone to tick ready. Matches JOIN_WINDOW in
        // src/game/round.js, which is the canonical rule.
        const players = this.parts.filter(p => !p.isAI && p.sock && p.role !== 'spectator');
        const allReady = players.length > 0 && players.every(p => p.ready);
        // Someone pressing START latches `joinDeadline`; from then on the
        // round begins when the window closes, regardless of who is ready.
        const anyStarted = this.parts.some(p => !p.isAI && p.ready);
        if (anyStarted && !this.joinDeadline) {
          this.joinDeadline = now + JOIN_WINDOW * 1000;
          this.broadcast({ type: 'joinOpen', seconds: JOIN_WINDOW });
        }
        const windowClosed = this.joinDeadline && now >= this.joinDeadline;
        // The window runs its full term once START is pressed. The only early
        // exit is a full room — nobody else can join, so there is nothing to
        // wait for. "Everyone here is ready" is NOT an early exit: the whole
        // point of the window is that people who are not here yet can arrive.
        const roomFull = players.length >= CAPACITY;
        const waited = !this.joinDeadline && now - this.lobbySince > LOBBY_MAX_WAIT_MS;
        if (windowClosed || roomFull || waited) {
          this.joinDeadline = 0;
          this._startRound(waited && !allReady);
        }
        break;
      }
      case 'wheel':
        if (now >= this.phaseEnd) {
          this._beginHide();
        }
        break;
      case 'hide':
        if (now >= this.phaseEnd) this.setPhase('hunt', HUNT_MS);
        break;
      case 'hunt':
        if (now >= this.phaseEnd) this._endRound('hiders', 'time');
        break;
      case 'roundover':
        if (now >= this.phaseEnd) this._toLobby();
        break;
      default:
        break;
    }
  }

  _startRound(byTimeout) {
    this.secretClaimed = false;
    this.joinDeadline = 0;
    for (const p of this.parts) { p.wasCaught = false; p.caughtAt = 0; p.lateJoin = false; p.safeUntil = 0; }
    this.round++;
    this.feed.length = 0;
    this._sizeSpotOwner();

    // Promote anyone who joined mid-round, then backfill AI to 11.
    for (const p of this.parts) { p.role = null; p.alive = true; p.gone = false; }
    let added = 0;
    while (this.parts.length < CAPACITY) {
      const bot = this._makeParticipant({ name: null, isAI: true });
      initBrain(bot, this.arena);
      this.parts.push(bot);
      added++;
    }

    // The wheel: one seeker, ten hiders.
    const seed = (Math.random() * 0x7fffffff) | 0;
    // Only real people can be the seeker. An AI monster is a worse opponent
    // and a worse story, so the mask goes to a human whenever one is present.
    const humanIdx = this.parts
      .map((p, i) => ({ p, i }))
      .filter(x => !x.p.isAI && x.p.sock)
      .map(x => x.i);
    // No fallback to bots: if there is nobody human to wear the mask, the round
    // does not start. An AI seeker is explicitly not allowed.
    if (!humanIdx.length) return false;
    const idx = humanIdx[Math.floor(Math.random() * humanIdx.length)];
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.role = i === idx ? 'seeker' : 'hider';
      p.alive = true;
      p.ready = false;
      p.catches = 0;
      const sp = this.arena.spawn;
      p.x = sp[0] + (Math.random() - 0.5) * 3;
      p.y = sp[1];
      p.z = sp[2] + (Math.random() - 0.5) * 3;
      p.lastStateAt = this.nowMs;
      if (p.isAI) { initBrain(p, this.arena); p.ai.state = 'idle'; }
    }
    this.seekerId = this.parts[idx].id;

    this.log(`room ${this.code}: round ${this.round} start (${this.humanCount} human, ${added} AI backfill${byTimeout ? ', lobby timeout' : ''}) seeker=#${this.seekerId}`);
    this.broadcastRoster();
    this.setPhase('wheel', WHEEL_MS);
    this.broadcast(JSON.stringify({
      t: 'wheel',
      seeker: this.seekerId,
      order: this.parts.map(p => p.id),
      seed,
      spinMs: WHEEL_MS,
      backfilled: added,
    }));
  }

  _beginHide() {
    // Hiders scatter from spawn toward cover; the seeker is caged.
    this.spotOwner.fill(-1);
    for (const p of this.parts) {
      if (p.isAI && p.role === 'hider') {
        if (!p.ai) initBrain(p, this.arena);
        p.ai.state = 'idle';
        claimSpot(p, this.arena.spots, this, p.x, p.z);
        p.ai.state = 'goto';
      }
    }
    this.setPhase('hide', HIDE_MS);
  }

  _catches() {
    let seeker = null;
    for (const p of this.parts) if (p.role === 'seeker') { seeker = p; break; }
    if (!seeker) return;
    const r2v = CATCH_RADIUS * CATCH_RADIUS;
    let aliveHiders = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const h = this.parts[i];
      if (h.role !== 'hider' || !h.alive) continue;
      const dx = h.x - seeker.x, dz = h.z - seeker.z, dy = h.y - seeker.y;
      if (dx * dx + dz * dz <= r2v && Math.abs(dy) <= CATCH_DY) { this._catch(seeker, h); continue; }
      aliveHiders++;
    }
    // The round ends when every hider has been FOUND ONCE — not when they all
    // happen to be dead at the same instant, because death is temporary now.
    const hiders = this.parts.filter(x => x.role === 'hider');
    const allFoundOnce = hiders.length > 0 && hiders.every(x => x.wasCaught);
    if (allFoundOnce) this._endRound('seeker', 'all_found');
  }

  /**
   * The hidden dog. Only the client can see the pickup collide, so the client
   * reports it and the server sanity-checks the claim. A cheating client could
   * fake this; that is a known and accepted hole for now.
   */
  claimSecret(p) {
    if (this.phase !== 'hunt') return false;
    if (!p || p.role !== 'hider' || this.secretClaimed) return false;
    this.secretClaimed = true;
    this.broadcast({ type: 'secret', by: p.name, id: p.id });
    this._endRound('hiders', 'secret_found');
    return true;
  }

  _catch(seeker, victim) {
    if (!victim.alive) return;
    if (victim.safeUntil && this.nowMs < victim.safeUntil) return;   // just respawned
    victim.alive = false;
    // `wasCaught` is permanent for the round and drives the seeker's win;
    // `caughtAt` is what the respawn timer counts from.
    victim.wasCaught = true;
    victim.caughtAt = this.nowMs;
    victim.survivedMs = this.nowMs - this.phaseStart;
    seeker.catches++;
    releaseSpot(victim, this);
    const item = { s: seeker.id, v: victim.id, sn: seeker.name, vn: victim.name, at: Date.now() };
    this.feed.push(item);
    if (this.feed.length > 16) this.feed.shift();
    this.broadcast(JSON.stringify({ t: 'kill', ...item }));
    this.broadcastRoster();
  }

  _endRound(winner, reason) {
    const survivors = this.parts.filter(p => p.role === 'hider' && p.alive).map(p => p.id);
    this.setPhase('roundover', OVER_MS);
    this.broadcast(JSON.stringify({
      t: 'roundover',
      winner,                       // 'seeker' | 'hiders'
      reason,                       // 'all_caught' | 'time'
      survivors,
      seeker: this.seekerId,
      catches: this.parts.filter(p => p.role === 'seeker').map(p => p.catches)[0] || 0,
      // Scores are advisory. The client's own save (coins/XP) is authoritative
      // locally — the server never dictates it. See README.
      scoreboard: this.parts.map(p => ({ id: p.id, role: p.role, alive: p.alive, catches: p.catches })),
    }));
    this.log(`room ${this.code}: round ${this.round} over — ${winner} (${reason}), ${survivors.length} survived`);
  }

  _toLobby() {
    // Drop the bots and anyone whose reconnect window closed; keep the humans.
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.isAI) { this._removeParticipant(p); continue; }
      p.role = null;
      p.alive = true;
      p.ready = false;
      p.catches = 0;
      const sp = this.arena.spawn;
      p.x = sp[0]; p.y = sp[1]; p.z = sp[2];
    }
    this.seekerId = -1;
    this.feed.length = 0;
    this.lobbySince = this.nowMs;
    this.setPhase('lobby', 0);
    this.broadcastRoster();
  }

  // ------------------------------------------------------------------------
  // snapshots
  // ------------------------------------------------------------------------

  /**
   * Delta-encoded snapshot.
   *
   *   { t:'s', k:<snapIndex>, f:0|1, p:[[id,x,y,z,yaw,flags], ...] }
   *
   * Positions are quantised to 2 cm and yaw to ~0.6°, which is finer than the
   * 100 ms interpolation buffer can show. A participant is omitted when nothing
   * quantised about it changed; every FULL_SNAP_EVERY snapshots (and after any
   * phase change or join) a keyframe with everyone is sent so a client that
   * missed a delta cannot stay wrong for more than 2 seconds.
   */
  _snapshot() {
    if (!this.parts.length) return;
    this.snapIndex++;
    const full = this._forceFullSnapshot || (this.snapIndex % FULL_SNAP_EVERY === 0);
    this._forceFullSnapshot = false;

    let out = '{"t":"s","k":' + this.snapIndex + (full ? ',"f":1' : '') + ',"p":[';
    let n = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      const qx = Math.round(p.x * 50), qy = Math.round(p.y * 50), qz = Math.round(p.z * 50);
      const qw = Math.round(p.yaw * 100), fl = p.flags | 0;
      let prev = this.lastSent.get(p.id);
      if (!prev) { prev = new Int32Array(5); prev[0] = 0x7fffffff; this.lastSent.set(p.id, prev); }
      const same = prev[0] === qx && prev[1] === qy && prev[2] === qz && prev[3] === qw && prev[4] === fl;
      if (same && !full) continue;
      prev[0] = qx; prev[1] = qy; prev[2] = qz; prev[3] = qw; prev[4] = fl;
      if (n++) out += ',';
      out += '[' + p.id + ',' + (qx / 50) + ',' + (qy / 50) + ',' + (qz / 50) + ',' + (qw / 100) + ',' + fl + ']';
    }
    out += ']}';
    if (n === 0 && !full) return;                   // nothing moved; say nothing

    this.lastSnapBytes = Buffer.byteLength(out);
    if (this.lastSnapBytes > this.peakSnapBytes) this.peakSnapBytes = this.lastSnapBytes;
    this.broadcast(out);
  }

  stats() {
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      humans: this.humanCount,
      total: this.parts.length,
      arena: this.arena.id,
      spots: this.arena.spots.length,
      spotsFromClient: this.arena.fromClient,
      lastSnapBytes: this.lastSnapBytes,
      peakSnapBytes: this.peakSnapBytes,
    };
  }
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

const BOT_NAMES = [
  'HOLLOW', 'CINDER', 'MAGPIE', 'VESPER', 'TALLOW', 'QUARRY', 'BRAMBLE',
  'FLINT', 'MARROW', 'SABLE', 'THISTLE', 'WICK', 'GRIST', 'HALLOW',
];
function botName(id) { return BOT_NAMES[id % BOT_NAMES.length]; }

const NAME_STRIP = new RegExp('[\\u0000-\\u001f\\u007f<>]', 'g');
function sanitizeName(n) {
  if (typeof n !== 'string') return '';
  return n.replace(NAME_STRIP, '').trim().slice(0, 16);
}

function makeToken() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ((Math.random() * 0xffffffff) >>> 0).toString(36);
  return s;
}

function r2(v) { return Math.round(v * 100) / 100; }
