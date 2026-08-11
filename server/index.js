// HTTP + WebSocket entry point.
//
//   GET  /health   -> 200 JSON, what Render polls
//   GET  /stats    -> 200 JSON, room/connection detail (same data, more of it)
//   WS   /ws       -> the game protocol (see README.md)
//
// Everything else 404s. Binds 0.0.0.0 on process.env.PORT.

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Room, CAPACITY, TICK_HZ } from './room.js';

const PORT = Number(process.env.PORT) || 8787;
const HOST = '0.0.0.0';
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 24;
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS) || 160;
const MAX_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP) || 8;
const MAX_PAYLOAD = 8 * 1024;
const MSGS_PER_SEC = 90;                 // 20 Hz state + pings + slack
const HELLO_TIMEOUT_MS = 10000;
const HEARTBEAT_MS = 15000;
const TICK_MS = 1000 / TICK_HZ;
const QUIET = process.env.QUIET === '1';

const STATIC_ORIGINS = new Set([
  'https://twalkerallenii-spec.github.io',
  'https://twalkerallenii-spec.github.io/hide-and-seek-arena',
]);
for (const o of (process.env.ALLOWED_ORIGINS || '').split(',')) {
  const t = o.trim();
  if (t) STATIC_ORIGINS.add(t);
}

const started = Date.now();
function log(...a) { if (!QUIET) console.log(new Date().toISOString().slice(11, 19), ...a); }

// ----------------------------------------------------------------------------
// origin / CORS
// ----------------------------------------------------------------------------

const LOCAL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function originAllowed(origin) {
  // No Origin header at all: a non-browser client (our own test harness,
  // curl, a native build). Browsers always send one, so this cannot be used
  // to bypass anything a browser would be stopped by.
  if (!origin) return true;
  if (LOCAL_RE.test(origin)) return true;
  if (STATIC_ORIGINS.has(origin)) return true;
  // Tolerate a trailing slash / path on a configured origin.
  for (const o of STATIC_ORIGINS) if (origin.startsWith(o)) return true;
  return false;
}

function corsHeaders(origin) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (origin && originAllowed(origin)) h['Access-Control-Allow-Origin'] = origin;
  else h['Access-Control-Allow-Origin'] = '*';
  return h;
}

// ----------------------------------------------------------------------------
// rooms
// ----------------------------------------------------------------------------

/** @type {Map<string, Room>} */
const rooms = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
    if (!rooms.has(c)) return c;
  }
  return 'R' + (Date.now() % 100000);
}

function normalizeCode(s) {
  if (typeof s !== 'string') return '';
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function createRoom(code, isPublic, arenaId) {
  if (rooms.size >= MAX_ROOMS) return null;
  const r = new Room(code, { isPublic, arenaId, log });
  rooms.set(code, r);
  log(`room ${code}: created (${isPublic ? 'public' : 'code'}, ${rooms.size}/${MAX_ROOMS} rooms)`);
  return r;
}

/** Public matchmaking: the fullest lobby that still has space, else a new room. */
function matchmake(arenaId) {
  let best = null;
  for (const r of rooms.values()) {
    if (!r.isPublic || r.dead) continue;
    if (r.phase !== 'lobby') continue;
    if (!r.canAcceptHuman()) continue;
    if (!best || r.humanCount > best.humanCount) best = r;
  }
  return best || createRoom(makeCode(), true, arenaId);
}

// ----------------------------------------------------------------------------
// http
// ----------------------------------------------------------------------------

function health() {
  let humans = 0, participants = 0;
  for (const r of rooms.values()) { humans += r.humanCount; participants += r.parts.length; }
  return {
    ok: true,
    service: 'hide-and-seek-arena-server',
    proto: 1,
    uptimeSec: Math.round((Date.now() - started) / 1000),
    rooms: rooms.size,
    maxRooms: MAX_ROOMS,
    connections: sockets.size,
    maxConnections: MAX_CONNECTIONS,
    humans,
    participants,
    tickHz: TICK_HZ,
    tickMsAvg: +tickAvgMs.toFixed(4),
    tickMsPeak: +tickPeakMs.toFixed(4),
    rss: Math.round(process.memoryUsage().rss / 1048576),
  };
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const url = (req.url || '/').split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(origin)); res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(405, corsHeaders(origin)); res.end('{"error":"method"}'); return; }

  if (url === '/health' || url === '/healthz' || url === '/') {
    res.writeHead(200, corsHeaders(origin));
    res.end(JSON.stringify(health()));
    return;
  }
  if (url === '/stats') {
    res.writeHead(200, corsHeaders(origin));
    res.end(JSON.stringify({ ...health(), detail: [...rooms.values()].map(r => r.stats()) }));
    return;
  }
  res.writeHead(404, corsHeaders(origin));
  res.end('{"error":"not_found"}');
});

// ----------------------------------------------------------------------------
// websocket
// ----------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

/** @type {Set<import('ws').WebSocket>} */
const sockets = new Set();
const perIp = new Map();

function ipOf(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

server.on('upgrade', (req, socket, head) => {
  const url = (req.url || '').split('?')[0];
  if (url !== '/ws') { socket.destroy(); return; }
  if (!originAllowed(req.headers.origin)) {
    log(`upgrade rejected: origin ${req.headers.origin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  if (sockets.size >= MAX_CONNECTIONS) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }
  const ip = ipOf(req);
  if ((perIp.get(ip) || 0) >= MAX_PER_IP) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws._ip = ip;
    ws._query = (req.url || '').split('?')[1] || '';
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  sockets.add(ws);
  perIp.set(ws._ip, (perIp.get(ws._ip) || 0) + 1);

  ws._alive = true;
  ws._room = null;
  ws._part = null;
  ws._msgs = 0;
  ws._msgWindow = Date.now();
  ws._helloTimer = setTimeout(() => {
    if (!ws._part) { fail(ws, 'no_hello'); }
  }, HELLO_TIMEOUT_MS);

  ws.on('pong', () => { ws._alive = true; });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const now = Date.now();
    if (now - ws._msgWindow > 1000) { ws._msgWindow = now; ws._msgs = 0; }
    if (++ws._msgs > MSGS_PER_SEC) { fail(ws, 'flood'); return; }

    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

    if (!ws._part) {
      if (msg.t !== 'hello') return;
      clearTimeout(ws._helloTimer);
      doHello(ws, msg);
      return;
    }
    if (ws._room && !ws._room.dead) ws._room.handle(ws._part, msg);
  });

  ws.on('close', () => cleanup(ws));
  ws.on('error', () => cleanup(ws));
});

function fail(ws, code) {
  try { ws.send(JSON.stringify({ t: 'error', code })); } catch { /* ignore */ }
  try { ws.close(1008, code); } catch { /* ignore */ }
  setTimeout(() => { try { ws.terminate(); } catch { /* ignore */ } }, 250);
}

function doHello(ws, msg) {
  const wanted = normalizeCode(msg.room);
  const arenaId = typeof msg.arena === 'string' ? msg.arena : undefined;
  let room = null;

  if (msg.token && wanted && rooms.has(wanted)) {
    room = rooms.get(wanted);                     // reconnect to a known room
  } else if (wanted) {
    room = rooms.get(wanted) || createRoom(wanted, false, arenaId);
  } else {
    room = matchmake(arenaId);
  }

  if (!room) { fail(ws, 'server_full'); return; }

  const res = room.join(ws, { name: msg.name, token: msg.token });
  if (res.error) {
    // A full code-room is terminal; a full matchmade room just means "try again".
    if (!wanted && res.error === 'room_full') {
      const fresh = createRoom(makeCode(), true, arenaId);
      if (fresh) {
        const r2 = fresh.join(ws, { name: msg.name });
        if (!r2.error) { attach(ws, fresh, r2.participant, msg); return; }
      }
    }
    fail(ws, res.error);
    return;
  }
  attach(ws, room, res.participant, msg);
}

function attach(ws, room, part, msg) {
  ws._room = room;
  ws._part = part;
  if (msg.arena || msg.hidingSpots) room.adoptArena(msg.arena, msg.hidingSpots);
}

function cleanup(ws) {
  if (ws._cleaned) return;
  ws._cleaned = true;
  clearTimeout(ws._helloTimer);
  sockets.delete(ws);
  const n = (perIp.get(ws._ip) || 1) - 1;
  if (n <= 0) perIp.delete(ws._ip); else perIp.set(ws._ip, n);
  if (ws._room && ws._part && !ws._room.dead) ws._room.drop(ws._part, 'socket_closed');
  ws._room = null;
  ws._part = null;
}

// ----------------------------------------------------------------------------
// clocks
// ----------------------------------------------------------------------------

let tickAvgMs = 0;
let tickPeakMs = 0;

const tickTimer = setInterval(() => {
  const t0 = process.hrtime.bigint();
  const now = Date.now();
  for (const room of rooms.values()) {
    try { room.tick(now); } catch (e) { console.error(`room ${room.code} tick error:`, e); }
  }
  for (const [code, room] of rooms) {
    if (room.isDisposable(now)) { room.destroy('empty'); rooms.delete(code); }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  tickAvgMs = tickAvgMs * 0.98 + ms * 0.02;
  if (ms > tickPeakMs) tickPeakMs = ms;
}, TICK_MS);

const beatTimer = setInterval(() => {
  for (const ws of sockets) {
    if (!ws._alive) { try { ws.terminate(); } catch { /* ignore */ } cleanup(ws); continue; }
    ws._alive = false;
    try { ws.ping(); } catch { /* ignore */ }
  }
}, HEARTBEAT_MS);

// ----------------------------------------------------------------------------
// boot / shutdown
// ----------------------------------------------------------------------------

server.listen(PORT, HOST, () => {
  log(`hide-and-seek-arena-server listening on ${HOST}:${PORT}`);
  log(`  health   http://${HOST}:${PORT}/health`);
  log(`  ws       ws://${HOST}:${PORT}/ws`);
  log(`  capacity ${CAPACITY}/room, ${MAX_ROOMS} rooms, ${MAX_CONNECTIONS} sockets`);
  log(`  origins  ${[...STATIC_ORIGINS].join(', ')} + localhost`);
});

function shutdown(sig) {
  log(`${sig} — shutting down`);
  clearInterval(tickTimer);
  clearInterval(beatTimer);
  for (const room of rooms.values()) room.destroy('shutdown');
  rooms.clear();
  for (const ws of sockets) { try { ws.close(1001, 'shutdown'); } catch { /* ignore */ } }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => console.error('uncaught:', e));
process.on('unhandledRejection', (e) => console.error('unhandled:', e));

export { server, wss, rooms };
