// Where the multiplayer server lives.
//
// The client is offline-first: if this host is unreachable, asleep, or simply
// wrong, the game falls back to a local round against AI and never blocks. The
// Render free tier sleeps after ~15 minutes idle and cold-starts take 30-60 s,
// so the first connection of the day will usually time out — that is expected
// and handled, not a bug.

export const SERVER_URL = 'wss://hide-and-seek-arena-server.onrender.com/ws';
export const HEALTH_URL = 'https://hide-and-seek-arena-server.onrender.com/health';

/** Let a local dev server override it: ?server=ws://localhost:8137/ws */
export function resolveServerUrl() {
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q === 'off') return null;
    if (q) return q;
  } catch { }
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return `ws://${location.hostname}:8137/ws`;
  }
  return SERVER_URL;
}

/**
 * Nudge the free-tier dyno awake with a cheap HTTP hit before opening a socket.
 * Fire and forget — the WebSocket attempt does not wait on it.
 */
export function wakeServer() {
  try { fetch(HEALTH_URL, { mode: 'cors', cache: 'no-store' }).catch(() => { }); }
  catch { }
}
