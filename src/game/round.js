// The round.
//
// Eleven slots. Everyone readies up, a wheel spins, one player is the SEEKER
// and ten are HIDERS. Hiders get thirty seconds. Then the monster is released.
//
// This file is deliberately dependency-free — no DOM, no three.js, no browser
// globals — because it runs in two places: in the browser to drive an offline
// round against AI, and on the Render server as the authority for a real one.
// Keep it that way. If you need a vector, use the tiny one below.

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const dist2 = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};
const dist = (a, b) => Math.sqrt(dist2(a, b));
const lerp = (a, b, t) => a + (b - a) * t;

export const PHASE = {
  LOBBY: 'lobby',
  WHEEL: 'wheel',
  HIDE: 'hide',
  HUNT: 'hunt',
  OVER: 'roundover',
};

export const ROLE = { SEEKER: 'seeker', HIDER: 'hider' };

export const SLOTS = 11;
export const HIDE_SECONDS = 30;
/** Four minutes. Long enough to search a 200 m arena twice, short enough that a
 *  stalemate against a hider who found a genuinely good spot still resolves. */
export const HUNT_SECONDS = 240;
const WHEEL_SECONDS = 6.5;
/** How long the room stays open for other people once you hit START. */
export const JOIN_WINDOW = 30;

const BOT_NAMES = [
  'VESSEL', 'HALLOW', 'NINEPIN', 'MOTH', 'CANDLE', 'TALLY', 'GRIN', 'SEVEN',
  'PALE', 'RUNT', 'ECHO', 'SPINDLE', 'WICK', 'HUSH', 'BRAMBLE', 'COIN',
  'LANTERN', 'SOOT', 'FERAL', 'QUIET', 'STITCH', 'MARROW', 'DUSK', 'RATTLE',
];

/**
 * @param {Function} rng seeded RNG returning 0..1 (see engine/rng.js makeRNG)
 */
export class Round {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.phase = PHASE.LOBBY;
    this.phaseTime = 0;          // seconds spent in the current phase
    this.phaseLimit = 0;         // 0 = no limit
    this.participants = [];
    this.killFeed = [];
    this.hidingSpots = [];
    this.bounds = 100;
    this.arenaId = null;
    this.roundNumber = 0;
    this.driven = false;         // true when a server is the authority
    this.wheelResult = null;
    this.startCountdown = 0;
    this._listeners = new Map();
    this._elapsed = 0;
  }

  // ------------------------------------------------------------------ events
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }
  _emit(event, ...args) {
    for (const fn of this._listeners.get(event) || []) {
      try { fn(...args); } catch (e) { console.error(`round:${event}`, e); }
    }
  }

  // ------------------------------------------------------------------- setup
  configure({ arenaId, hidingSpots = [], bounds = 100, spawn = [0, 0, 0], localName = 'YOU' } = {}) {
    this.arenaId = arenaId;
    this.bounds = bounds;
    this.spawn = V(spawn[0], spawn[1], spawn[2]);
    // Store as plain objects so this module never depends on THREE.Vector3.
    this.hidingSpots = hidingSpots.map((s, i) => ({
      id: i,
      pos: V(s.pos.x, s.pos.y, s.pos.z),
      radius: s.radius ?? 1.2,
      quality: s.quality ?? 1,
      claimedBy: null,
    }));
    this.localName = localName;
    this._buildParticipants();
    return this;
  }

  _buildParticipants() {
    const names = [...BOT_NAMES];
    // Fisher-Yates with the seeded stream so bot line-ups are reproducible.
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    this.participants = [];
    for (let i = 0; i < SLOTS; i++) {
      const isLocal = i === 0;
      this.participants.push({
        id: isLocal ? 'local' : `bot${i}`,
        name: isLocal ? this.localName : names[i - 1],
        isLocal,
        isAI: !isLocal,
        ready: false,
        role: null,
        alive: true,
        pos: V(this.spawn.x, this.spawn.y, this.spawn.z),
        // --- AI-only fields, ignored for humans ---
        target: null,
        spotId: null,
        speed: 0,
        nerve: 0.35 + this.rng() * 0.6,   // bold bots relocate under pressure
        readyAt: isLocal ? Infinity : 0.4 + this.rng() * 6.5,
      });
    }
  }

  get local() { return this.participants.find(p => p.isLocal); }
  get seeker() { return this.participants.find(p => p.role === ROLE.SEEKER); }
  get hiders() { return this.participants.filter(p => p.role === ROLE.HIDER); }
  get aliveHiders() { return this.participants.filter(p => p.role === ROLE.HIDER && p.alive); }
  get localIsSeeker() { return this.local?.role === ROLE.SEEKER; }
  get timeLeft() { return this.phaseLimit ? Math.max(0, this.phaseLimit - this.phaseTime) : 0; }

  // ------------------------------------------------------------------ phases
  _setPhase(phase, limit = 0, data = {}) {
    this.phase = phase;
    this.phaseTime = 0;
    this.phaseLimit = limit;
    this._emit('phase', phase, data);
  }

  start() {
    this.roundNumber++;
    this.killFeed.length = 0;
    for (const s of this.hidingSpots) s.claimedBy = null;
    for (const p of this.participants) {
      p.ready = p.isLocal ? false : false;
      p.role = null;
      p.alive = true;
      p.wasCaught = false;
      p.spotId = null;
      p.target = null;
    }
    this.secretBy = null;
    this.startCountdown = 0;
    this.joinOpen = false;
    this.joinTimer = 0;
    this._lastJoinTick = null;
    this._setPhase(PHASE.LOBBY);
  }

  /** The local player hitting READY. */
  toggleReady() {
    const p = this.local;
    if (!p || this.phase !== PHASE.LOBBY) return false;
    p.ready = !p.ready;
    this._emit('ready', p);
    // Hitting START opens the doors: thirty seconds for anyone else to walk in.
    if (p.ready && !this.joinOpen) {
      this.joinOpen = true;
      this.joinTimer = JOIN_WINDOW;
      this._emit('joinOpen', JOIN_WINDOW);
    } else if (!p.ready) {
      this.joinOpen = false;
      this.joinTimer = 0;
      this._emit('joinClosed');
    }
    return p.ready;
  }

  /** Seconds left in the join window, 0 when it is not open. */
  get joinLeft() { return this.joinOpen ? Math.max(0, this.joinTimer) : 0; }

  /** How many of the eleven slots are real people. */
  get humanCount() { return this.participants.filter(p => !p.isAI).length; }

  /**
   * Decide roles, then hand the UI a spin to present. The outcome is settled
   * before the wheel starts turning — the wheel is theatre over a done deal,
   * which is the only way to guarantee it lands where it should.
   */
  _spinWheel() {
    const n = this.participants.length;
    // Only real people wear the mask. No AI fallback and no rigging: the wheel
    // draws uniformly from the humans in the room and that is the whole rule.
    //
    // Consequence worth knowing: with one human in the room, that human is the
    // Seeker every round. That is the honest reading of "AI can't be seeker".
    const humans = this.participants
      .map((p, i) => ({ p, i }))
      .filter(x => !x.p.isAI)
      .map(x => x.i);
    if (!humans.length) return false;          // nothing to draw from
    const seekerIdx = humans[Math.floor(this.rng() * humans.length)];

    this.participants.forEach((p, i) => {
      p.role = i === seekerIdx ? ROLE.SEEKER : ROLE.HIDER;
    });
    this.wheelResult = {
      seekerIdx,
      seekerName: this.participants[seekerIdx].name,
      localRole: this.local.role,
      // Enough turns that it reads as a spin rather than a jump.
      turns: 4 + Math.floor(this.rng() * 3),
      duration: WHEEL_SECONDS,
    };
    this._setPhase(PHASE.WHEEL, WHEEL_SECONDS, this.wheelResult);
    this._emit('roles', this.participants.map(p => ({ id: p.id, role: p.role })));
  }

  _beginHide() {
    // Every hider claims a distinct spot up front. Claiming here rather than on
    // arrival stops two bots walking into the same wardrobe.
    const spots = [...this.hidingSpots];
    for (const p of this.aliveHiders) {
      if (!p.isAI) continue;
      let best = null, bestScore = -Infinity;
      for (const s of spots) {
        if (s.claimedBy) continue;
        const d = dist(s.pos, p.pos);
        // Cautious bots go far and hide well; bold ones stay close to the action.
        const score = s.quality * 2
          + (p.nerve > 0.6 ? -d * 0.02 : d * 0.015)
          + this.rng() * 1.5;
        if (score > bestScore) { bestScore = score; best = s; }
      }
      if (best) {
        best.claimedBy = p.id;
        p.spotId = best.id;
        p.target = V(best.pos.x, best.pos.y, best.pos.z);
        p.speed = 3.2 + this.rng() * 1.6;
      }
    }
    this._setPhase(PHASE.HIDE, HIDE_SECONDS, { seconds: HIDE_SECONDS });
  }

  _beginHunt() {
    this._setPhase(PHASE.HUNT, HUNT_SECONDS, {});
    this._emit('release');
  }

  /** Mark a hider caught. Called by the monster, by the server, or by AI. */
  catchParticipant(id, byName = 'THE SEEKER') {
    const p = this.participants.find(x => x.id === id);
    if (!p || !p.alive || p.role !== ROLE.HIDER) return false;
    p.alive = false;
    if (p.spotId != null) {
      const s = this.hidingSpots[p.spotId];
      if (s) s.claimedBy = null;
    }
    const entry = { name: p.name, by: byName, isLocal: p.isLocal, at: this._elapsed };
    this.killFeed.push(entry);
    this._emit('caught', p, entry);
    if (p.isLocal) this._emit('localCaught', p);
    if (this.allFoundOnce) this._end('seeker');
    return true;
  }

  /**
   * Someone arrived after the wheel had already spun. They join as a hider,
   * alive, at the start area — no waiting out the round in a menu.
   */
  addLateJoiner({ id, name, isAI = false, pos = null }) {
    if (this.participants.some(p => p.id === id)) return null;
    const p = {
      id, name, isAI, isLocal: false, ready: true,
      role: ROLE.HIDER, alive: true,
      pos: pos ? V(pos.x, pos.y, pos.z) : V(this.spawn.x, this.spawn.y, this.spawn.z),
      target: null, spotId: null, speed: 3.4, nerve: 0.5,
      readyAt: 0, lateJoin: true,
    };
    this.participants.push(p);
    this._emit('join', p);
    return p;
  }

  /**
   * Back in after being caught. The round keeps going, so a death is a setback
   * rather than a spectator sentence — but you are marked as already-found, so
   * you no longer count toward the seeker's win condition.
   */
  respawn(id) {
    const p = this.participants.find(x => x.id === id);
    if (!p || p.alive || this.phase !== PHASE.HUNT) return false;
    p.alive = true;
    p.wasCaught = true;
    p.pos.x = this.spawn.x; p.pos.y = this.spawn.y; p.pos.z = this.spawn.z;
    this._emit('respawn', p);
    return true;
  }

  /**
   * The hiders' escape hatch. Every arena hides exactly one dog; find it and
   * the round ends in the hiders' favour no matter how many have been caught.
   */
  secretFound(byName = 'SOMEONE') {
    if (this.phase !== PHASE.HUNT) return false;
    this.secretBy = byName;
    this._emit('secret', byName);
    this._end('secret');
    return true;
  }

  /** Everyone has been found at least once — the seeker's win. */
  get allFoundOnce() {
    const hs = this.hiders;
    return hs.length > 0 && hs.every(h => !h.alive || h.wasCaught);
  }

  _end(winner) {
    if (this.phase === PHASE.OVER) return;
    const survivors = this.aliveHiders.map(p => p.name);
    this._setPhase(PHASE.OVER, 0, { winner, survivors, killFeed: [...this.killFeed] });
  }

  // -------------------------------------------------------------------- tick
  update(dt) {
    if (this.driven) return;    // a server owns the clock in multiplayer
    this._elapsed += dt;
    this.phaseTime += dt;

    switch (this.phase) {
      case PHASE.LOBBY: this._tickLobby(dt); break;
      case PHASE.WHEEL:
        if (this.phaseTime >= this.phaseLimit) this._beginHide();
        break;
      case PHASE.HIDE:
        this._tickHiders(dt, false);
        if (this.phaseTime >= this.phaseLimit) this._beginHunt();
        break;
      case PHASE.HUNT:
        this._tickHiders(dt, true);
        if (this.phaseTime >= this.phaseLimit) this._end('hiders');
        break;
    }
  }

  _tickLobby(dt) {
    if (!this.joinOpen) return;

    this.joinTimer -= dt;
    const whole = Math.ceil(this.joinTimer);
    if (whole !== this._lastJoinTick) {
      this._lastJoinTick = whole;
      this._emit('joinTick', Math.max(0, whole));
    }

    if (this.joinTimer <= 0) {
      // Doors close. Everything still empty becomes AI, and we spin.
      for (const p of this.participants) p.ready = true;
      this.joinOpen = false;
      this._emit('lobby', this.participants);
      this._spinWheel();
    }
  }

  /**
   * Position-level AI. Bots walk to their spot, and once the hunt starts a
   * bold one will bolt to a new spot if the seeker gets close. There is no
   * collision here — bots take the straight line and the arena's hiding spots
   * are, by construction, in sensible places.
   */
  _tickHiders(dt, hunting) {
    const seeker = this.seeker;
    for (const p of this.participants) {
      if (!p.isAI || !p.alive || p.role !== ROLE.HIDER) continue;

      if (hunting && seeker && p.spotId != null) {
        const d = dist(p.pos, seeker.pos);
        const panicRange = 9 + p.nerve * 14;
        if (d < panicRange && this.rng() < dt * (0.55 * p.nerve)) {
          const away = this.hidingSpots
            .filter(s => !s.claimedBy && dist(s.pos, seeker.pos) > d + 12);
          if (away.length) {
            const pick = away[Math.floor(this.rng() * away.length)];
            const old = this.hidingSpots[p.spotId];
            if (old) old.claimedBy = null;
            pick.claimedBy = p.id;
            p.spotId = pick.id;
            p.target = V(pick.pos.x, pick.pos.y, pick.pos.z);
            p.speed = 4.6 + this.rng() * 2.0;
            this._emit('bolt', p);
          }
        }
      }

      if (!p.target) continue;
      const d = dist(p.pos, p.target);
      if (d < 0.4) { p.target = null; continue; }
      const step = Math.min(d, p.speed * dt);
      p.pos.x = lerp(p.pos.x, p.target.x, step / d);
      p.pos.y = lerp(p.pos.y, p.target.y, step / d);
      p.pos.z = lerp(p.pos.z, p.target.z, step / d);
    }
  }

  // --------------------------------------------------- authoritative driving
  /**
   * Adopt a server snapshot. When this is used the local clock stops mattering
   * and `update()` becomes a no-op — see `driven`.
   */
  applyState(snap) {
    this.driven = true;
    if (snap.phase && snap.phase !== this.phase) {
      this.phase = snap.phase;
      this.phaseTime = 0;
      this._emit('phase', snap.phase, snap.phaseData || {});
    }
    if (typeof snap.phaseTime === 'number') this.phaseTime = snap.phaseTime;
    if (typeof snap.phaseLimit === 'number') this.phaseLimit = snap.phaseLimit;

    if (Array.isArray(snap.participants)) {
      for (const rec of snap.participants) {
        let p = this.participants.find(x => x.id === rec.id);
        if (!p) {
          p = { ...rec, pos: V(), isLocal: false, isAI: true };
          this.participants.push(p);
        }
        const wasAlive = p.alive;
        Object.assign(p, {
          name: rec.name ?? p.name,
          role: rec.role ?? p.role,
          ready: rec.ready ?? p.ready,
          alive: rec.alive ?? p.alive,
          isAI: rec.isAI ?? p.isAI,
        });
        if (rec.pos && !p.isLocal) {
          p.pos.x = rec.pos.x; p.pos.y = rec.pos.y; p.pos.z = rec.pos.z;
        }
        if (wasAlive && !p.alive) {
          const entry = { name: p.name, by: snap.lastCatcher || 'THE SEEKER', isLocal: p.isLocal, at: this._elapsed };
          this.killFeed.push(entry);
          this._emit('caught', p, entry);
          if (p.isLocal) this._emit('localCaught', p);
        }
      }
    }
    this._emit('sync', snap);
  }

  /**
   * The wire format.
   *
   * Names, roles and AI flags do not change within a round, so the default
   * per-tick packet omits them and carries only what moves: index, position,
   * and the alive bit. A `full` snapshot (sent on join and on every phase
   * change) carries the roster and establishes the index order everything
   * else refers to.
   *
   * Positions are decimetre-rounded — at 15 Hz over a 200 m arena nobody can
   * see the difference, and it roughly halves the packet.
   */
  snapshot({ full = false } = {}) {
    const base = {
      p: this.phase,
      t: +this.phaseTime.toFixed(1),
      l: this.phaseLimit,
      r: this.roundNumber,
    };
    if (full) {
      base.roster = this.participants.map(p => ({
        id: p.id, name: p.name, role: p.role, ready: p.ready, isAI: p.isAI,
      }));
    }
    // [x, y, z, alive] per participant, in roster order.
    base.s = this.participants.map(p => [
      Math.round(p.pos.x * 10) / 10,
      Math.round(p.pos.y * 10) / 10,
      Math.round(p.pos.z * 10) / 10,
      p.alive ? 1 : 0,
    ]);
    return base;
  }

  /** Inflate a wire snapshot back into the shape applyState() expects. */
  static inflate(snap, roster) {
    const list = snap.roster || roster || [];
    return {
      phase: snap.p ?? snap.phase,
      phaseTime: snap.t ?? snap.phaseTime,
      phaseLimit: snap.l ?? snap.phaseLimit,
      participants: (snap.s || []).map((v, i) => ({
        ...(list[i] || { id: 'p' + i }),
        pos: { x: v[0], y: v[1], z: v[2] },
        alive: !!v[3],
      })),
    };
  }
}

export const roundUtils = { V, dist, dist2 };
