// End-to-end test against a running server: several real clients play a round.
//   node livetest.mjs                      -> live Render deployment
//   node livetest.mjs ws://127.0.0.1:PORT/ws
import { WebSocket } from 'ws';

const URL = process.argv[2] || 'wss://hide-and-seek-arena-server.onrender.com/ws';
const ROOM = 'T' + Math.floor(Math.random() * 90000 + 10000);
const N = Number(process.argv[3] || 3);

const log = (...a) => console.log(...a);
const clients = [];
let bytes = 0, snaps = 0;
const phases = [];

function mk(i) {
  return new Promise((res) => {
    const ws = new WebSocket(URL, { headers: { Origin: 'https://twalkerallenii-spec.github.io' } });
    const c = { ws, i, id: null, role: null, alive: true, msgs: 0 };
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hello', name: 'P' + i, room: ROOM, proto: 1 }));
      res(c);
    });
    ws.on('message', (raw) => {
      bytes += raw.length; c.msgs++;
      let m; try { m = JSON.parse(raw); } catch { return; }
      const t = m.t || m.type;
      if (t === 'welcome' || t === 'hello') c.id = m.id ?? m.you ?? c.id;
      if (t === 's' || t === 'snapshot') snaps++;
      if (t === 'phase' && i === 0) { phases.push(`${m.phase}@${Date.now() - t0}ms`); log('  phase ->', m.phase); }
      if (t === 'roster' && i === 0 && m.parts) {
        const seek = m.parts.find(p => p.role === 'seeker');
        if (seek && !c._sawRoles) {
          c._sawRoles = true;
          const ai = m.parts.filter(p => p.isAI).length;
          log(`  roles: seeker=${seek.name} isAI=${!!seek.isAI}  participants=${m.parts.length} (${ai} AI)`);
        }
      }
      if (t === 'joinOpen' && i === 0) log('  join window opened:', m.seconds + 's');
      if (t === 'kill' && i === 0) log('  kill:', m.sn, '>', m.vn);
      if (t === 'respawn' && i === 0) log('  respawn:', m.id);
      if (t === 'secret' && i === 0) log('  SECRET FOUND by', m.by);
      if (t === 'over' || t === 'roundover') log('  round over:', JSON.stringify(m).slice(0, 120));
    });
    ws.on('error', (e) => log(`  client ${i} error:`, e.message));
  });
}

const t0 = Date.now();
log(`connecting ${N} clients to ${URL}  room=${ROOM}`);
for (let i = 0; i < N; i++) { clients.push(await mk(i)); await new Promise(r => setTimeout(r, 250)); }
log(`connected ${clients.filter(c => c.ws.readyState === 1).length}/${N}`);

await new Promise(r => setTimeout(r, 1500));
log('pressing START on client 0');
clients[0].ws.send(JSON.stringify({ t: 'ready', ready: true }));
await new Promise(r => setTimeout(r, 1200));
for (let i = 1; i < N; i++) clients[i].ws.send(JSON.stringify({ t: 'ready', ready: true }));

// keep them alive and moving for a while
const mover = setInterval(() => {
  for (const c of clients) {
    if (c.ws.readyState !== 1) continue;
    c.ws.send(JSON.stringify({ t: 'pos', x: Math.random() * 30 - 15, y: 1, z: Math.random() * 30 - 15, yaw: 0 }));
  }
}, 400);

const WATCH = Number(process.env.WATCH_SEC || 75);
log(`watching ${WATCH}s…`);
await new Promise(r => setTimeout(r, WATCH * 1000));

log('\n--- disconnect mid-round (client 1) ---');
clients[1].ws.close();
await new Promise(r => setTimeout(r, 4000));
log('  remaining sockets:', clients.filter(c => c.ws.readyState === 1).length);

clearInterval(mover);
for (const c of clients) { try { c.ws.close(); } catch { } }

log('\n--- numbers ---');
log(`snapshots received : ${snaps}`);
log(`total bytes        : ${(bytes / 1024).toFixed(1)} KB across ${N} clients`);
log(`bytes/snapshot     : ${snaps ? (bytes / snaps).toFixed(0) : 'n/a'}`);
log(`phase timeline     : ${phases.join('  ')}`);
process.exit(0);
