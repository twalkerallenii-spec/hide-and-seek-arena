// Integration test. Boots the real server as a child process, opens real
// WebSocket connections, plays a full round through every phase, and asserts
// the things that would actually break the game.
//
//   node test-client.mjs            # ~100 s, shortened hunt/reconnect timers
//   node test-client.mjs --verbose  # stream the server log too
//
// Timers: HIDE stays at its real 30 s (that is one of the assertions). HUNT and
// the reconnect grace are shortened via env so the run is bounded.

import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { performance } from 'node:perf_hooks';
import { Room } from './room.js';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/ws`;
const VERBOSE = process.argv.includes('--verbose');

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}
function section(s) { console.log(`\n=== ${s} ===`); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ----------------------------------------------------------------------------
// a scriptable client
// ----------------------------------------------------------------------------

class TestClient {
  constructor(name) {
    this.name = name;
    this.ws = null;
    this.you = -1;
    this.room = null;
    this.token = null;
    this.phase = null;
    this.participants = [];
    this.phases = [];              // [{ phase, at, endsAt }]
    this.kills = [];
    this.roundover = null;
    this.corrections = 0;
    this.errors = [];
    this.snapBytes = [];
    this.snapCount = 0;
    this.deltaCount = 0;
    this.fullCount = 0;
    this.closed = false;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this._waits = [];
  }

  connect(opts = {}) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS, { headers: { Origin: 'https://twalkerallenii-spec.github.io' } });
      this.ws = ws;
      this.closed = false;
      const to = setTimeout(() => reject(new Error(`${this.name}: connect timeout`)), 8000);
      ws.on('open', () => {
        ws.send(JSON.stringify({
          t: 'hello', proto: 1, name: this.name,
          room: opts.room, token: opts.token,
          arena: opts.arena, hidingSpots: opts.hidingSpots,
        }));
      });
      ws.on('message', (buf) => {
        const bytes = buf.length;
        let m;
        try { m = JSON.parse(buf.toString()); } catch { return; }
        if (m.t === 's') {
          this.snapCount++;
          this.snapBytes.push(bytes);
          if (m.f) this.fullCount++; else this.deltaCount++;
        }
        if (m.t === 'welcome') {
          clearTimeout(to);
          this.you = m.you; this.token = m.token; this.room = m.room.code;
          resolve(this);
        }
        if (m.t === 'roster') this.participants = m.p;
        if (m.t === 'phase') {
          this.phase = m.phase;
          this.phases.push({ phase: m.phase, at: Date.now(), endsAt: m.endsAt, remaining: m.remaining });
        }
        if (m.t === 'kill') this.kills.push(m);
        if (m.t === 'roundover') this.roundover = m;
        if (m.t === 'correct') this.corrections++;
        if (m.t === 'error') this.errors.push(m);
        this._resolveWaits(m);
      });
      ws.on('close', () => {
        this.closed = true;
        clearTimeout(to);
        if (this.you < 0) reject(new Error(`${this.name}: closed before welcome`));
      });
      ws.on('error', (e) => { clearTimeout(to); reject(e); });
    });
  }

  _resolveWaits(m) {
    for (let i = this._waits.length - 1; i >= 0; i--) {
      const w = this._waits[i];
      if (w.pred(m)) { this._waits.splice(i, 1); clearTimeout(w.timer); w.resolve(m); }
    }
  }

  waitFor(pred, ms, label = 'message') {
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      w.timer = setTimeout(() => {
        const i = this._waits.indexOf(w);
        if (i >= 0) this._waits.splice(i, 1);
        reject(new Error(`${this.name}: timed out waiting for ${label} (${ms} ms)`));
      }, ms);
      this._waits.push(w);
    });
  }

  waitPhase(phase, ms) {
    if (this.phase === phase) return Promise.resolve({ t: 'phase', phase });
    return this.waitFor(m => m.t === 'phase' && m.phase === phase, ms, `phase=${phase}`);
  }

  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  ready() { this.send({ t: 'ready', ready: true }); }
  state(x, y, z, yaw = 0, f = 0) {
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.send({ t: 'state', seq: ++this._seq || (this._seq = 1), x, y, z, yaw, f });
  }
  me() { return this.participants.find(p => p.id === this.you) || null; }
  kill() { try { this.ws.terminate(); } catch { /* ignore */ } }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

// ----------------------------------------------------------------------------
// server lifecycle
// ----------------------------------------------------------------------------

let child = null;

async function bootServer() {
  child = spawn(process.execPath, ['index.js'], {
    cwd: new URL('.', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(PORT),
      HUNT_SECONDS: '40',
      OVER_SECONDS: '4',
      RECONNECT_SECONDS: '6',
      MAX_CONNECTIONS_PER_IP: '64',   // the whole harness is one IP
      QUIET: VERBOSE ? '0' : '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => { if (VERBOSE) process.stdout.write(`  [srv] ${d}`); });
  child.stderr.on('data', d => process.stderr.write(`  [srv!] ${d}`));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('server did not come up');
}

async function stats() { return (await fetch(`${BASE}/stats`)).json(); }

// ----------------------------------------------------------------------------
// scenarios
// ----------------------------------------------------------------------------

/** Fake hiding spots, as a real client would derive them from world.hidingSpots. */
function fakeSpots(n, bounds) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = bounds * (0.3 + 0.6 * ((i * 7) % 5) / 5);
    out.push({ x: +(Math.cos(a) * r).toFixed(1), y: 0, z: +(Math.sin(a) * r).toFixed(1), q: 0.8 });
  }
  return out;
}

/** Room A: three humans ready up, play a whole round, one drops mid-hunt. */
async function scenarioFullRound() {
  section('ROOM A — full round with 3 humans + 8 AI');
  const clients = [];
  for (let i = 0; i < 3; i++) {
    const c = new TestClient(`HUMAN${i + 1}`);
    await c.connect({
      room: 'AAAA',
      arena: 'cargoyard',
      hidingSpots: i === 0 ? fakeSpots(22, 130) : undefined,
    });
    clients.push(c);
  }
  check('three clients joined the same room', clients.every(c => c.room === 'AAAA'),
    `ids ${clients.map(c => c.you).join(',')}`);
  check('roster has 3 humans pre-start', clients[0].participants.length === 3,
    `${clients[0].participants.length} participants`);
  check('isLocal is set per socket',
    clients.every(c => c.participants.filter(p => p.isLocal).length === 1 && c.me().isLocal));

  const s0 = await stats();
  const roomA = s0.detail.find(r => r.code === 'AAAA');
  check('client-supplied hiding spots adopted', roomA.spotsFromClient === true, `${roomA.spots} spots`);
  check('arena taken from the client', roomA.arena === 'cargoyard', roomA.arena);

  // Ready up -> wheel should start within a tick or two, not after the 20 s wait.
  const t0 = Date.now();
  const wheelP = clients[0].waitFor(m => m.t === 'wheel', 5000, 'wheel');
  for (const c of clients) c.ready();
  const wheel = await wheelP;
  check('ready-up starts the round immediately', Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
  check('AI backfilled the empty slots', wheel.backfilled === 8, `backfilled=${wheel.backfilled}`);

  await clients[0].waitPhase('wheel', 2000).catch(() => {});
  const roster = clients[0].participants;
  const seekers = roster.filter(p => p.role === 'seeker');
  const hiders = roster.filter(p => p.role === 'hider');
  check('roster is 11 participants', roster.length === 11, `${roster.length}`);
  check('exactly 1 seeker', seekers.length === 1, `${seekers.length}`);
  check('exactly 10 hiders', hiders.length === 10, `${hiders.length}`);
  check('exactly 8 AI', roster.filter(p => p.isAI).length === 8);
  check('wheel names the same seeker as the roster', wheel.seeker === seekers[0].id);

  // --- hide phase ----------------------------------------------------------
  await clients[0].waitPhase('hide', WHEEL_TIMEOUT);
  const hideAt = Date.now();
  const hideMsg = clients[0].phases.find(p => p.phase === 'hide');
  const hideLen = hideMsg.endsAt - (hideMsg.at);
  check('hide phase is 30 s', Math.abs(hideLen - 30000) < 400, `${hideLen} ms announced`);

  // Drive the humans around like a real client would (20 Hz).
  // 6 m/s on a 30 m circle — legal under the movement model, so this must
  // never trip the validator.
  const driver = setInterval(() => {
    for (const c of clients) {
      if (c.closed) continue;
      const t = Date.now() / 1000;
      c.state(Math.cos(t * 0.2 + c.you) * 30, 0, Math.sin(t * 0.2 + c.you) * 30, t % 6.28, 8);
    }
  }, 50);

  // A teleport attempt: 400 m across the map in one update.
  clients[2].state(0, 0, 0);
  await sleep(120);
  const before = clients[2].corrections;
  clients[2].state(400, 0, 400);
  await sleep(400);
  check('teleport is rejected and corrected', clients[2].corrections > before,
    `${clients[2].corrections - before} correction(s)`);

  await clients[0].waitPhase('hunt', 34000);
  const huntAt = Date.now();
  check('hide lasted ~30 s in wall-clock', Math.abs(huntAt - hideAt - 30000) < 700,
    `${huntAt - hideAt} ms`);

  // --- disconnect mid-hunt -> AI -------------------------------------------
  await sleep(1500);
  const victimId = clients[1].you;
  const victimToken = clients[1].token;
  clients[1].kill();
  await clients[0].waitFor(m => m.t === 'roster' && m.p.some(p => p.id === victimId && p.isAI), 4000,
    'dropped human to become AI');
  const conv = clients[0].participants.find(p => p.id === victimId);
  check('mid-round disconnect converts the slot to AI', conv && conv.isAI === true);
  check('round did not end when a player dropped', clients[0].phase === 'hunt', clients[0].phase);
  check('roster is still 11 after the drop', clients[0].participants.length === 11);

  // --- reconnect within the grace window -----------------------------------
  const back = new TestClient('HUMAN2');
  await back.connect({ room: 'AAAA', token: victimToken });
  check('reconnect resumes the same slot', back.you === victimId, `#${back.you} vs #${victimId}`);
  await back.waitFor(m => m.t === 'roster', 3000, 'roster after resume');
  const resumed = back.participants.find(p => p.id === victimId);
  check('resumed slot is human again', resumed && resumed.isAI === false);
  check('resumed player kept their role', resumed.role === conv.role, resumed.role);
  clients[1] = back;

  // --- play it out ----------------------------------------------------------
  const over = await clients[0].waitFor(m => m.t === 'roundover', 40000, 'roundover');
  clearInterval(driver);
  check('round ended', !!over, `${over.winner} by ${over.reason}`);
  console.log(`  (kill feed: ${clients[0].kills.length} catches by the AI seeker in the shortened hunt)`);
  check('every kill was made by the seeker',
    clients[0].kills.every(k => k.s === wheel.seeker));
  check('survivors + caught === 10 hiders',
    over.survivors.length + clients[0].kills.length === 10,
    `${over.survivors.length} survived, ${clients[0].kills.length} caught`);

  await clients[0].waitPhase('lobby', 12000);
  check('room returns to lobby after roundover', clients[0].phase === 'lobby');
  const s1 = await stats();
  const rA = s1.detail.find(r => r.code === 'AAAA');
  check('AI are dropped when the room returns to lobby', rA.total === rA.humans,
    `${rA.total} participants, ${rA.humans} human`);

  const allBytes = clients[0].snapBytes;
  return { clients, snapBytes: allBytes, kills: clients[0].kills.length, over,
    full: clients[0].fullCount, delta: clients[0].deltaCount };
}

const WHEEL_TIMEOUT = 6000;

/** Room B: one human who never readies. The 20 s lobby timer must start it. */
async function scenarioLobbyTimeout() {
  section('ROOM B — lobby timeout backfills with AI');
  const c = new TestClient('AFK');
  await c.connect({ room: 'BBBB' });
  const t0 = Date.now();
  const wheel = await c.waitFor(m => m.t === 'wheel', 26000, 'wheel from lobby timeout');
  const waited = Date.now() - t0;
  check('lobby starts by itself after ~20 s', waited > 19000 && waited < 22000, `${waited} ms`);
  check('backfilled to 11 with AI', wheel.backfilled === 10, `backfilled=${wheel.backfilled}`);
  await c.waitPhase('hide', WHEEL_TIMEOUT);
  const roster = c.participants;
  check('room B: 1 seeker / 10 hiders', roster.filter(p => p.role === 'seeker').length === 1
    && roster.filter(p => p.role === 'hider').length === 10);
  return c;
}

/** Room C: everybody leaves; the room must be reaped after the grace window. */
async function scenarioCleanup() {
  section('ROOM C — room cleanup');
  const c = new TestClient('GHOST');
  await c.connect({ room: 'CCCC' });
  let s = await stats();
  check('room C exists while occupied', !!s.detail.find(r => r.code === 'CCCC'));
  c.close();
  await sleep(500);
  s = await stats();
  const stillThere = !!s.detail.find(r => r.code === 'CCCC');
  // Leaving from the lobby removes the participant, so the room empties at once
  // and is reaped one grace window later (RECONNECT_SECONDS=6 in this run).
  await sleep(8000);
  s = await stats();
  check('empty room is reaped after the grace window',
    !s.detail.find(r => r.code === 'CCCC'),
    `was ${stillThere ? 'still present' : 'already gone'} right after close`);
  return s;
}

/** Caps: a code room only takes 11 humans. */
async function scenarioCapacity() {
  section('ROOM D — capacity cap');
  const made = [];
  let rejected = null;
  for (let i = 0; i < 12; i++) {
    const c = new TestClient(`CAP${i}`);
    try { await c.connect({ room: 'DDDD' }); made.push(c); }
    catch (e) { rejected = e; break; }
  }
  await sleep(300);
  const full = made[0] ? made[0].participants.length : 0;
  check('room caps at 11 humans', made.length === 11 && full === 11,
    `${made.length} joined, roster ${full}${rejected ? ', 12th refused' : ''}`);
  for (const c of made) c.close();
  return made;
}

/** Build a headless room already in the hunt, with 11 AI. No sockets. */
function headlessHuntRoom(code) {
  const room = new Room(code, { isPublic: false, arenaId: 'cargoyard' });
  room.nowMs = Date.now();
  room.lastTick = room.nowMs;
  room._startRound(true);              // backfills 11 AI and spins the wheel
  room.phase = 'hunt';
  room.phaseStart = room.nowMs;
  room.phaseEnd = room.nowMs + 3600e3;
  for (const p of room.parts) { if (p.isAI && p.ai) p.ai.state = 'goto'; }
  return room;
}

/** Deterministic proof that the catch rule and the round-end rule work. */
function scenarioCatchLogic() {
  section('HEADLESS — catch rule and round end');
  const room = headlessHuntRoom('CTCH');
  const sent = [];
  room.broadcast = (s) => { try { sent.push(JSON.parse(s)); } catch { /* ignore */ } };

  const seeker = room.parts.find(p => p.role === 'seeker');
  const hiders = room.parts.filter(p => p.role === 'hider');
  check('headless room is 1 seeker / 10 hiders', !!seeker && hiders.length === 10);

  // One hider just out of reach, one inside it.
  hiders[0].x = seeker.x + 2.0; hiders[0].y = seeker.y; hiders[0].z = seeker.z;
  hiders[1].x = seeker.x + 40;  hiders[1].y = seeker.y; hiders[1].z = seeker.z;
  for (let i = 2; i < hiders.length; i++) { hiders[i].x = seeker.x + 300; hiders[i].z = seeker.z + 300; }
  for (const p of room.parts) p.isAI = false;   // freeze the AI so positions hold

  room.tick(room.nowMs + 50);
  const kills = sent.filter(m => m.t === 'kill');
  check('a hider inside the catch radius is caught', kills.length === 1 && kills[0].v === hiders[0].id,
    `${kills.length} kill(s)`);
  check('a hider 40 m away is not caught', hiders[1].alive === true);

  // Now walk the seeker onto everybody.
  for (const h of hiders) { h.x = seeker.x; h.y = seeker.y; h.z = seeker.z; }
  room.tick(room.nowMs + 100);
  const over = sent.find(m => m.t === 'roundover');
  check('round ends when every hider is caught', !!over && over.winner === 'seeker',
    over ? `${over.winner} / ${over.reason}` : 'no roundover');
  check('roundover reports 0 survivors', over && over.survivors.length === 0);
  check('phase advanced to roundover', room.phase === 'roundover', room.phase);
}

/** Pure CPU benchmark: 11 AI in a room, no sockets, nobody ever dies. */
function benchmarkTick() {
  section('BENCHMARK — 11 AI, no sockets');
  const room = headlessHuntRoom('BNCH');
  room._catch = () => {};              // keep all 11 agents alive for the whole run
  room.broadcast = () => {};           // but still build every snapshot string

  const N = 20000;
  let t = Date.now();
  for (let i = 0; i < 2000; i++) { t += 50; room.tick(t); }        // warm up
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    t += 50;
    if (room.phase !== 'hunt') { room.phase = 'hunt'; room.phaseEnd = t + 3600e3; }
    room.tick(t);
  }
  const total = performance.now() - t0;
  const per = total / N;
  const alive = room.parts.filter(p => p.alive).length;
  console.log(`  ${N} ticks in ${total.toFixed(1)} ms  ->  ${(per * 1000).toFixed(1)} µs/tick`);
  console.log(`  ${room.parts.length} participants (${alive} alive), ${room.arena.spots.length} hiding spots`);
  console.log(`  simulated ${(N * 0.05 / 60).toFixed(1)} minutes of a full 11-AI room`);
  console.log(`  last snapshot ${room.lastSnapBytes} B, peak ${room.peakSnapBytes} B`);
  check('a full-AI room costs well under 1 ms/tick', per < 1.0, `${(per * 1000).toFixed(1)} µs`);
  check('the 20 Hz budget is spent by < 2%', per / 50 < 0.02,
    `${((per / 50) * 100).toFixed(3)} % of a 50 ms tick`);
  check('headless snapshot also fits the budget', room.peakSnapBytes < 1024, `${room.peakSnapBytes} B`);
  return per;
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------

async function main() {
  section('BOOT');
  const h = await bootServer();
  check('GET /health returns 200 JSON', h.ok === true, `proto ${h.proto}, tick ${h.tickHz} Hz`);

  const [a, b] = await Promise.all([scenarioFullRound(), scenarioLobbyTimeout()]);

  section('SNAPSHOTS');
  const bytes = a.snapBytes;
  bytes.sort((x, y) => x - y);
  const max = bytes[bytes.length - 1];
  const p50 = bytes[Math.floor(bytes.length * 0.5)];
  const p95 = bytes[Math.floor(bytes.length * 0.95)];
  const avg = bytes.reduce((s, v) => s + v, 0) / bytes.length;
  console.log(`  ${bytes.length} snapshots   avg ${avg.toFixed(0)} B   p50 ${p50} B   p95 ${p95} B   max ${max} B`);
  console.log(`  ${a.full} keyframes / ${a.delta} deltas`);
  check('snapshots stay under the 1 KB budget', max < 1024, `max ${max} B for 11 participants`);
  check('deltas are actually smaller than keyframes', p50 < max, `p50 ${p50} B vs max ${max} B`);

  b.close();
  await scenarioCapacity();
  await scenarioCleanup();
  for (const c of a.clients) c.close();

  scenarioCatchLogic();
  const per = benchmarkTick();

  section('SERVER HEALTH AFTER THE RUN');
  const fin = await stats();
  console.log(`  rooms ${fin.rooms}  connections ${fin.connections}  rss ${fin.rss} MB`);
  console.log(`  tick avg ${fin.tickMsAvg} ms  peak ${fin.tickMsPeak} ms (all rooms, includes I/O)`);
  check('no leaked connections', fin.connections <= 1, `${fin.connections} open`);

  section('SUMMARY');
  console.log(`  ${results.length - failures}/${results.length} checks passed`);
  console.log(`  max snapshot ${max} B, AI tick ${(per * 1000).toFixed(1)} µs`);
  if (failures) console.log(`  FAILURES:\n${results.filter(r => !r.ok).map(r => `    - ${r.name} ${r.detail}`).join('\n')}`);

  child.kill('SIGTERM');
  await sleep(400);
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error('\nTEST HARNESS ERROR:', e);
  try { child?.kill('SIGKILL'); } catch { /* ignore */ }
  process.exit(2);
});
