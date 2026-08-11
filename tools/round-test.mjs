#!/usr/bin/env node
// Drives a complete round headlessly: eleven slots ready up, the wheel assigns
// one seeker and ten hiders, hiders scatter for thirty seconds, then the hunt
// runs until everyone is caught or the clock expires.

import { installDOM } from './dom-stub.mjs';
installDOM();
import { Round, PHASE, ROLE, SLOTS, HIDE_SECONDS } from '../src/game/round.js';
import { makeRNG } from '../src/engine/rng.js';

const C = { g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, d: s => `\x1b[90m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m` };
let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? C.g('ok  ') : C.r('FAIL')} ${name}${detail ? C.d('  ' + detail) : ''}`);
  if (!cond) failures++;
};

// A ring of plausible hiding spots, as an arena would supply.
const spots = [];
for (let i = 0; i < 30; i++) {
  const a = (i / 30) * Math.PI * 2, r = 12 + (i % 5) * 9;
  spots.push({ pos: { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r }, radius: 1.4, quality: 0.5 + (i % 3) * 0.25 });
}

function run(seed, { firstRound = true, autoReady = true } = {}) {
  const round = new Round(makeRNG(seed));
  round.configure({ arenaId: 'test', hidingSpots: spots, bounds: 100, spawn: [0, 0, 0], localName: 'YOU' });
  if (!firstRound) round.roundNumber = 1;   // so start() makes it round 2

  const timeline = [];
  const kills = [];
  round.on('phase', (p) => timeline.push({ phase: p, t: +t.toFixed(1) }));
  round.on('caught', (p, e) => kills.push(`${e.by} > ${e.name}`));

  let t = 0;
  round.start();
  if (autoReady) round.toggleReady();

  const DT = 1 / 30;
  let seekerCatchTimer = 0;
  while (t < 400 && round.phase !== PHASE.OVER) {
    round.update(DT);
    t += DT;
    // Stand in for the monster: during the hunt, catch the nearest hider on a timer.
    if (round.phase === PHASE.HUNT) {
      const s = round.seeker;
      seekerCatchTimer -= DT;
      if (s && seekerCatchTimer <= 0) {
        seekerCatchTimer = 6;
        const alive = round.aliveHiders;
        if (alive.length) {
          let best = alive[0], bd = Infinity;
          for (const h of alive) {
            const dx = h.pos.x - s.pos.x, dz = h.pos.z - s.pos.z;
            const d = dx * dx + dz * dz;
            if (d < bd) { bd = d; best = h; }
          }
          round.catchParticipant(best.id, s.name);
        }
      }
    }
  }
  return { round, timeline, kills, t };
}

console.log(C.b('\nround 1 (first ever — should be rigged HIDER)'));
let { round, timeline, kills, t } = run('seed-a');
check('11 participants', round.participants.length === SLOTS, `${round.participants.length}`);
check('exactly one seeker', round.participants.filter(p => p.role === ROLE.SEEKER).length === 1);
check('exactly ten hiders', round.participants.filter(p => p.role === ROLE.HIDER).length === 10);
check('local is a HIDER on round 1', round.local.role === ROLE.HIDER, round.local.role);
check('reached roundover', round.phase === PHASE.OVER, `after ${t.toFixed(0)}s`);
check('every phase visited',
  ['lobby', 'wheel', 'hide', 'hunt', 'roundover'].every(p => timeline.some(x => x.phase === p)),
  timeline.map(x => x.phase).join(' -> '));

const hideStart = timeline.find(x => x.phase === 'hide')?.t ?? 0;
const huntStart = timeline.find(x => x.phase === 'hunt')?.t ?? 0;
check('hide phase is 30s', Math.abs((huntStart - hideStart) - HIDE_SECONDS) < 0.5,
  `${(huntStart - hideStart).toFixed(1)}s`);

check('hiders claimed distinct spots', (() => {
  const ids = round.participants.filter(p => p.isAI && p.spotId != null).map(p => p.spotId);
  return new Set(ids).size === ids.length;
})());
check('kill feed populated', kills.length > 0, `${kills.length} caught`);
console.log(C.d('    ' + kills.slice(0, 4).join(' | ')));

console.log(C.b('\nlater rounds — the player can draw SEEKER'));
let sawSeeker = 0, sawHider = 0;
for (let i = 0; i < 40; i++) {
  const r = new Round(makeRNG('s' + i));
  r.configure({ arenaId: 't', hidingSpots: spots, bounds: 100, spawn: [0, 0, 0] });
  r.roundNumber = 1;
  r.start();
  r.toggleReady();
  let tt = 0;
  while (tt < 40 && r.phase === PHASE.LOBBY) { r.update(1 / 30); tt += 1 / 30; }
  while (tt < 60 && r.phase === PHASE.WHEEL) { r.update(1 / 30); tt += 1 / 30; }
  if (r.local.role === ROLE.SEEKER) sawSeeker++; else sawHider++;
}
check('player draws seeker sometimes', sawSeeker > 0, `${sawSeeker}/40 seeker, ${sawHider}/40 hider`);
check('roughly 1-in-11', sawSeeker >= 1 && sawSeeker <= 12, `${(sawSeeker / 40 * 100).toFixed(0)}%`);

console.log(C.b('\nauthoritative driving (server path)'));
const client = new Round(makeRNG('client'));
client.configure({ arenaId: 't', hidingSpots: spots, bounds: 100, spawn: [0, 0, 0] });
const server = run('seed-b').round;
const full = server.snapshot({ full: true });
client.applyState(Round.inflate(full));
const snap = server.snapshot();          // the per-tick packet
check('applyState adopts phase', client.phase === full.p, client.phase);
check('applyState marks driven', client.driven === true);
const before = client.phaseTime;
client.update(10);
check('update() is inert once driven', client.phaseTime === before);
check('snapshot is JSON-safe', (() => { try { JSON.parse(JSON.stringify(snap)); return true; } catch { return false; } })());
const bytes = Buffer.byteLength(JSON.stringify(snap));
check('per-tick packet under 1 KB', bytes < 1024,
  `${bytes} B/tick (${(bytes * 15 / 1024).toFixed(1)} KB/s at 15 Hz)  ` +
  `full roster ${Buffer.byteLength(JSON.stringify(full))} B`);
check('inflate round-trips', (() => {
  const back = Round.inflate(full);
  return back.participants.length === SLOTS && back.participants[0].name;
})());

console.log(C.b('\ndeterminism'));
const a = run('same-seed').round.snapshot({ full: true });
const b = run('same-seed').round.snapshot({ full: true });
check('same seed, same roles',
  JSON.stringify(a.roster.map(p => p.role)) === JSON.stringify(b.roster.map(p => p.role)));
check('same seed, same names',
  JSON.stringify(a.roster.map(p => p.name)) === JSON.stringify(b.roster.map(p => p.name)));

console.log('');
console.log(failures ? C.r(`${failures} FAILED`) : C.g('ALL ROUND TESTS PASS'));
process.exit(failures ? 1 : 0);
