// Server-side AI for unfilled slots and for players who drop mid-round.
//
// Design constraints:
//   * There is NO collision geometry on the server. The arenas are built by
//     three.js in the browser and baking an octree per arena server-side would
//     cost more memory than the whole free tier has. So AI here is pure
//     kinematics on the XZ plane, steering between hiding-spot waypoints and
//     lerping Y toward the waypoint's height. AI will occasionally cut a corner
//     through a wall. Everyone sees the same (wrong) position, so it is
//     consistent, and a hider standing inside a pillar still gets caught by the
//     same proximity rule as anyone else.
//   * Cost matters. A room of 11 AI must be far under 1 ms/tick. Everything
//     below is scalar math on plain numbers, no allocation in the hot path, no
//     sorting, no closures created per tick. The only per-tick loops are
//     O(participants) and one O(spots) scan that runs at most a couple of times
//     a second per agent (re-targeting is rate-limited).
//
// Speeds are deliberately a little under the human caps from
// src/engine/controller.js (walk 4.4, sprint 8.1) so the AI never trips the
// server's own movement validator and never out-runs a human.

const WALK = 4.2;
const SPRINT = 7.6;
const SEEKER_SPEED = 7.9;      // the monster is fast; hiders need the 30 s

const ARRIVE = 0.7;            // metres — "I'm at my waypoint"
const FLEE_RADIUS = 13.0;      // hider bolts when the seeker gets this close
const CALM_RADIUS = 24.0;      // ...and settles again past this
const SEEKER_SENSE = 22.0;     // seeker locks on to a hider within this
const RETARGET_MS = 400;       // minimum gap between waypoint re-scans

// Flag bits shared with the wire protocol (see room.js / src/net/client.js).
export const F_CROUCH = 1;
export const F_SPRINT = 2;
export const F_LIGHT = 4;
export const F_MOVING = 8;

/**
 * Give a participant a brain. Safe to call on a human who just disconnected —
 * the agent picks up from wherever they were standing.
 */
export function initBrain(p, world) {
  p.ai = {
    state: 'idle',            // idle | goto | hidden | flee | chase | patrol
    tx: p.x, ty: p.y, tz: p.z,
    spot: -1,
    nextRetarget: 0,
    wanderPhase: Math.random() * Math.PI * 2,
    order: (Math.random() * 1e6) | 0,
  };
  if (world) p.ai.spot = -1;
  return p.ai;
}

export function clearBrain(p) {
  p.ai = null;
}

/**
 * One AI step for a whole room.
 *
 * `room` only needs: { parts, phase, arena:{ spots, spawn, bounds }, nowMs }.
 * Participants need { isAI, alive, role, x, y, z, yaw, flags, ai }.
 */
export function updateAI(room, dt) {
  const parts = room.parts;
  const spots = room.arena.spots;
  const now = room.nowMs;
  const phase = room.phase;
  if (phase === 'lobby' || phase === 'roundover') return;

  // Locate the seeker once (there is exactly one).
  let sx = 0, sy = 0, sz = 0, hasSeeker = false;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.role === 'seeker') { sx = p.x; sy = p.y; sz = p.z; hasSeeker = true; break; }
  }

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.isAI || !p.alive) continue;
    if (!p.ai) initBrain(p, room.arena);
    if (p.role === 'seeker') stepSeeker(p, parts, spots, room, dt, now, phase);
    else stepHider(p, spots, room, dt, now, phase, hasSeeker, sx, sy, sz);
  }
}

// --------------------------------------------------------------------------
// hiders
// --------------------------------------------------------------------------

function stepHider(p, spots, room, dt, now, phase, hasSeeker, sx, sy, sz) {
  const a = p.ai;
  const dsx = p.x - sx, dsz = p.z - sz;
  const dSeek = hasSeeker ? Math.sqrt(dsx * dsx + dsz * dsz) : 1e9;

  if (a.state === 'idle') {
    claimSpot(p, spots, room, p.x, p.z);
    a.state = 'goto';
  }

  if (phase === 'hunt' && dSeek < FLEE_RADIUS && a.state !== 'flee' && now >= a.nextRetarget) {
    // Bolt. Pick a spot that is far from the seeker but not absurdly far from us.
    a.nextRetarget = now + RETARGET_MS;
    releaseSpot(p, room);
    let best = -1, bestScore = -1e9;
    for (let i = 0; i < spots.length; i++) {
      if (room.spotOwner[i] !== -1 && room.spotOwner[i] !== p.id) continue;
      const s = spots[i];
      const dx = s.x - sx, dz = s.z - sz;
      const fromSeeker = Math.sqrt(dx * dx + dz * dz);
      const mx = s.x - p.x, mz = s.z - p.z;
      const fromMe = Math.sqrt(mx * mx + mz * mz);
      // Prefer distance from the monster, penalise a long run, and reject
      // anything that would make us run *through* it.
      const towardSeeker = (mx * (sx - p.x) + mz * (sz - p.z)) / (fromMe * dSeek + 1e-6);
      const score = fromSeeker - fromMe * 0.55 - Math.max(0, towardSeeker) * 30;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) {
      room.spotOwner[best] = p.id;
      a.spot = best;
      a.tx = spots[best].x; a.ty = spots[best].y; a.tz = spots[best].z;
    } else {
      // No spot available — run directly away from the seeker.
      const inv = 1 / (dSeek + 1e-6);
      a.tx = p.x + dsx * inv * 18; a.tz = p.z + dsz * inv * 18; a.ty = p.y;
    }
    a.state = 'flee';
  } else if (a.state === 'flee' && dSeek > CALM_RADIUS) {
    a.state = 'goto';
  }

  const sprinting = a.state === 'flee';
  const speed = sprinting ? SPRINT : WALK;
  const arrived = moveToward(p, a.tx, a.ty, a.tz, speed, dt, room.arena.bounds);

  if (arrived) {
    if (a.state !== 'hidden') a.state = 'hidden';
    // Breathe: a tiny sway so hidden AI does not read as a frozen prop.
    a.wanderPhase += dt * 1.1;
    p.x += Math.sin(a.wanderPhase) * 0.08 * dt;
    p.z += Math.cos(a.wanderPhase * 0.7) * 0.08 * dt;
    p.yaw = hasSeeker ? Math.atan2(sx - p.x, sz - p.z) : p.yaw;
    p.flags = F_CROUCH;
  } else {
    p.flags = F_MOVING | (sprinting ? F_SPRINT : 0);
  }
}

// --------------------------------------------------------------------------
// seeker
// --------------------------------------------------------------------------

function stepSeeker(p, parts, spots, room, dt, now, phase) {
  const a = p.ai;

  if (phase === 'hide') {
    // Caged at spawn, staring at nothing.
    a.wanderPhase += dt * 0.6;
    p.yaw = a.wanderPhase;
    p.flags = 0;
    return;
  }

  // Nearest live hider inside sensing range wins; otherwise keep patrolling.
  let target = -1, bestD = SEEKER_SENSE;
  for (let i = 0; i < parts.length; i++) {
    const h = parts[i];
    if (h.role !== 'hider' || !h.alive) continue;
    const dx = h.x - p.x, dz = h.z - p.z, dy = h.y - p.y;
    if (Math.abs(dy) > 6) continue;               // different floor — ignore
    const d = Math.sqrt(dx * dx + dz * dz);
    // Sprinting hiders are loud: effectively doubles the sensing range.
    const range = (h.flags & F_SPRINT) ? SEEKER_SENSE * 1.9
      : (h.flags & F_MOVING) ? SEEKER_SENSE * 1.25 : SEEKER_SENSE * 0.75;
    if (d < range && d < bestD) { bestD = d; target = i; }
  }

  if (target >= 0) {
    const h = parts[target];
    a.state = 'chase';
    a.tx = h.x; a.ty = h.y; a.tz = h.z;
  } else if (a.state !== 'patrol' || now >= a.nextRetarget) {
    a.state = 'patrol';
    a.nextRetarget = now + RETARGET_MS * 3;
    if (spots.length) {
      // Walk the spot list in a fixed per-seeker stride so it sweeps the map
      // instead of ping-ponging between two neighbours.
      a.order = (a.order + 1 + ((spots.length * 0.37) | 0)) % spots.length;
      const s = spots[a.order];
      a.tx = s.x; a.ty = s.y; a.tz = s.z;
    }
  }

  const arrived = moveToward(p, a.tx, a.ty, a.tz, SEEKER_SPEED, dt, room.arena.bounds);
  if (arrived && a.state === 'patrol') a.nextRetarget = 0;
  p.flags = arrived ? 0 : (F_MOVING | F_SPRINT);
}

// --------------------------------------------------------------------------
// shared steering
// --------------------------------------------------------------------------

function moveToward(p, tx, ty, tz, speed, dt, bounds) {
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= ARRIVE) {
    p.y += (ty - p.y) * Math.min(1, dt * 4);
    return true;
  }
  const step = Math.min(d, speed * dt);
  const inv = step / d;
  p.x += dx * inv;
  p.z += dz * inv;
  p.y += (ty - p.y) * Math.min(1, dt * 3);
  p.yaw = Math.atan2(dx, dz);
  // Never let a brain walk out of the world; the validator would reject it.
  const lim = bounds + 2;
  if (p.x > lim) p.x = lim; else if (p.x < -lim) p.x = -lim;
  if (p.z > lim) p.z = lim; else if (p.z < -lim) p.z = -lim;
  return false;
}

/** Claim the nearest free hiding spot for this participant. */
export function claimSpot(p, spots, room, fromX, fromZ) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < spots.length; i++) {
    if (room.spotOwner[i] !== -1 && room.spotOwner[i] !== p.id) continue;
    const s = spots[i];
    const dx = s.x - fromX, dz = s.z - fromZ;
    // Bias by spot quality so AI prefers genuinely concealing cover.
    const d = dx * dx + dz * dz - (s.q || 1) * 120;
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best >= 0) {
    room.spotOwner[best] = p.id;
    p.ai.spot = best;
    p.ai.tx = spots[best].x; p.ai.ty = spots[best].y; p.ai.tz = spots[best].z;
  } else {
    p.ai.tx = p.x; p.ai.ty = p.y; p.ai.tz = p.z;
  }
  return best;
}

export function releaseSpot(p, room) {
  const i = p.ai ? p.ai.spot : -1;
  if (i >= 0 && room.spotOwner[i] === p.id) room.spotOwner[i] = -1;
  if (p.ai) p.ai.spot = -1;
}

/**
 * Deterministic fallback hiding spots for an arena we have never been told
 * about. Two rings plus a centre cluster inside `bounds`. Ugly but it keeps AI
 * spread out instead of piling on the spawn point.
 */
export function fallbackSpots(seedStr, bounds) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const out = [];
  const rings = [0.32, 0.62, 0.86];
  for (let r = 0; r < rings.length; r++) {
    const n = 5 + r * 2;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rnd() * 0.5;
      const rad = bounds * rings[r] * (0.85 + rnd() * 0.3);
      out.push({ x: +(Math.cos(ang) * rad).toFixed(2), y: 0, z: +(Math.sin(ang) * rad).toFixed(2), q: 0.6 + rnd() * 0.4 });
    }
  }
  return out;
}
