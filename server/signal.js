// WebRTC signalling relay for proximity voice.
//
// This does NOT open a socket. It rides the game socket that server/index.js
// already owns, as five extra message types on the same JSON envelope. The
// server never touches audio: it forwards SDP and ICE between two participants
// of the same room and nothing else. All media is peer-to-peer.
//
// index.js needs exactly two lines (see README of this file at the bottom):
//
//     if (handleVoice(ws._room, ws._part, msg)) return;     // in ws.on('message')
//     voicePeerLeft(ws._room, ws._part);                    // in cleanup(ws)
//
// ---------------------------------------------------------------------------
// PROTOCOL
//
//  client -> server                          server -> client
//  ----------------------------------------  --------------------------------
//  { t:'voice-join', ch? }                   { t:'voice-peers', you, peers:[
//                                              { id, ch, mic, muted } ] }
//                                            ...and to everyone else:
//                                            { t:'voice-peer-join', id, ch,
//                                              mic, muted }
//
//  { t:'voice-leave' }                       { t:'voice-peer-leave', id }
//
//  { t:'voice-offer',  to, sdp }             { t:'voice-offer',  from, sdp }
//  { t:'voice-answer', to, sdp }             { t:'voice-answer', from, sdp }
//  { t:'voice-ice',    to, cands:[c,...] }   { t:'voice-ice',    from, cands }
//
//  { t:'voice-state', mic, muted, ch? }      { t:'voice-peer-state', id, mic,
//                                              muted, ch }
//
//  errors (never fatal, the game keeps running):
//                                            { t:'voice-error', code, to? }
//
//  `c` in `cands` is { candidate, sdpMid, sdpMLineIndex, usernameFragment? }.
//  Candidates are BATCHED on purpose — see NOTE ON RATE LIMITS below.
// ---------------------------------------------------------------------------

/** Every type this module claims. Anything else is left for room.handle(). */
export const VOICE_TYPES = new Set([
  'voice-join', 'voice-leave', 'voice-offer', 'voice-answer', 'voice-ice', 'voice-state',
]);

// Hard limits. index.js caps a frame at MAX_PAYLOAD (8 KiB) already; these are
// the semantic caps on top of that, so one client cannot use the relay as an
// amplifier or a chat channel.
const MAX_SDP_CHARS = 6000;      // a single-audio-m-line offer is ~1.5-2.5 KB
const MAX_CAND_CHARS = 400;
const MAX_CANDS_PER_MSG = 12;
const MAX_MEMBERS = 11;          // == room CAPACITY
const MAX_CH_CHARS = 16;

// Per-participant voice budget. This is a SUB-budget of index.js's
// MSGS_PER_SEC (90) — see NOTE ON RATE LIMITS.
const VOICE_MSGS_PER_SEC = 40;

/** Room -> { members: Map<partId, {ch, mic, muted}> }. Weak so rooms still GC. */
const rooms = new WeakMap();
/** participant -> { n, since } rate window. */
const budget = new WeakMap();

function stateOf(room) {
  let s = rooms.get(room);
  if (!s) { s = { members: new Map(), relayed: 0, dropped: 0 }; rooms.set(room, s); }
  return s;
}

function withinBudget(part, now) {
  let b = budget.get(part);
  if (!b) { b = { n: 0, since: now }; budget.set(part, b); }
  if (now - b.since > 1000) { b.n = 0; b.since = now; }
  return ++b.n <= VOICE_MSGS_PER_SEC;
}

function findPart(room, id) {
  const parts = room.parts;
  for (let i = 0; i < parts.length; i++) if (parts[i].id === id) return parts[i];
  return null;
}

function send(room, part, obj) {
  // Room.send already guards readyState and swallows throws.
  room.send(part, obj);
}

function bcast(room, st, obj, exceptId) {
  const json = JSON.stringify(obj);
  for (const id of st.members.keys()) {
    if (id === exceptId) continue;
    const p = findPart(room, id);
    if (p) room.send(p, json);
  }
}

function cleanChannel(v) {
  if (typeof v !== 'string') return 'all';
  const c = v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, MAX_CH_CHARS);
  return c || 'all';
}

function cleanCandidate(c) {
  if (!c || typeof c !== 'object') return null;
  // An end-of-candidates signal is the empty string; it is legal and useful.
  const cand = typeof c.candidate === 'string' ? c.candidate : '';
  if (cand.length > MAX_CAND_CHARS) return null;
  const out = { candidate: cand };
  if (typeof c.sdpMid === 'string' && c.sdpMid.length <= 16) out.sdpMid = c.sdpMid;
  if (Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 8) {
    out.sdpMLineIndex = c.sdpMLineIndex;
  }
  if (typeof c.usernameFragment === 'string' && c.usernameFragment.length <= 64) {
    out.usernameFragment = c.usernameFragment;
  }
  if (out.sdpMid === undefined && out.sdpMLineIndex === undefined && cand) return null;
  return out;
}

/**
 * Relay one voice message.
 *
 * @param {object} room  the Room the sender is in
 * @param {object} part  the sending participant (already authenticated by hello)
 * @param {object} msg   the parsed envelope
 * @returns {boolean}    true when this module owns the message — the caller
 *                       must then NOT pass it on to room.handle()
 */
export function handleVoice(room, part, msg) {
  if (!msg || typeof msg.t !== 'string' || !VOICE_TYPES.has(msg.t)) return false;
  if (!room || room.dead || !part) return true;              // owned, dropped

  const st = stateOf(room);
  const now = Date.now();
  if (!withinBudget(part, now)) { st.dropped++; return true; }

  switch (msg.t) {
    case 'voice-join': {
      if (!st.members.has(part.id)) {
        if (st.members.size >= MAX_MEMBERS) {
          send(room, part, { t: 'voice-error', code: 'voice_full' });
          return true;
        }
        st.members.set(part.id, { ch: cleanChannel(msg.ch), mic: !!msg.mic, muted: !!msg.muted });
      } else {
        const m = st.members.get(part.id);
        if (msg.ch !== undefined) m.ch = cleanChannel(msg.ch);
      }
      const me = st.members.get(part.id);

      // The joiner gets the current roster; everybody else gets one arrival.
      const peers = [];
      for (const [id, m] of st.members) {
        if (id === part.id) continue;
        peers.push({ id, ch: m.ch, mic: m.mic, muted: m.muted });
      }
      send(room, part, { t: 'voice-peers', you: part.id, peers });
      bcast(room, st, {
        t: 'voice-peer-join', id: part.id, ch: me.ch, mic: me.mic, muted: me.muted,
      }, part.id);
      return true;
    }

    case 'voice-leave': {
      voicePeerLeft(room, part);
      return true;
    }

    case 'voice-state': {
      const m = st.members.get(part.id);
      if (!m) return true;
      if (msg.mic !== undefined) m.mic = !!msg.mic;
      if (msg.muted !== undefined) m.muted = !!msg.muted;
      if (msg.ch !== undefined) m.ch = cleanChannel(msg.ch);
      bcast(room, st, {
        t: 'voice-peer-state', id: part.id, mic: m.mic, muted: m.muted, ch: m.ch,
      }, part.id);
      return true;
    }

    case 'voice-offer':
    case 'voice-answer': {
      if (!st.members.has(part.id)) return true;             // must join first
      const to = msg.to | 0;
      const target = st.members.has(to) ? findPart(room, to) : null;
      if (!target || target === part) {
        send(room, part, { t: 'voice-error', code: 'no_peer', to });
        return true;
      }
      const sdp = typeof msg.sdp === 'string' ? msg.sdp : null;
      if (!sdp || sdp.length > MAX_SDP_CHARS) {
        send(room, part, { t: 'voice-error', code: 'bad_sdp', to });
        return true;
      }
      st.relayed++;
      send(room, target, { t: msg.t, from: part.id, sdp });
      return true;
    }

    case 'voice-ice': {
      if (!st.members.has(part.id)) return true;
      const to = msg.to | 0;
      const target = st.members.has(to) ? findPart(room, to) : null;
      if (!target || target === part) return true;           // silent: ICE races leaves
      const src = Array.isArray(msg.cands) ? msg.cands : (msg.cand ? [msg.cand] : []);
      const cands = [];
      for (let i = 0; i < src.length && cands.length < MAX_CANDS_PER_MSG; i++) {
        const c = cleanCandidate(src[i]);
        if (c) cands.push(c);
      }
      if (!cands.length) return true;
      st.relayed++;
      send(room, target, { t: 'voice-ice', from: part.id, cands });
      return true;
    }

    default:
      return true;
  }
}

/**
 * A participant left the room (socket closed, kicked, dropped to AI, or an
 * explicit voice-leave). Idempotent — safe to call on every disconnect path.
 */
export function voicePeerLeft(room, part) {
  if (!room || !part) return;
  const st = rooms.get(room);
  if (!st || !st.members.has(part.id)) return;
  st.members.delete(part.id);
  bcast(room, st, { t: 'voice-peer-leave', id: part.id }, part.id);
}

/** Optional: fold into /stats so mesh health is observable in production. */
export function voiceStats(room) {
  const st = rooms.get(room);
  if (!st) return { members: 0, relayed: 0, dropped: 0 };
  return { members: st.members.size, relayed: st.relayed, dropped: st.dropped };
}

/** Test seam — lets a harness assert membership without reaching into WeakMaps. */
export function voiceMembers(room) {
  const st = rooms.get(room);
  return st ? [...st.members.keys()] : [];
}

// ---------------------------------------------------------------------------
// NOTE ON RATE LIMITS
//
// index.js kicks a socket at MSGS_PER_SEC = 90. A cold join into a full mesh is
// the worst burst in the whole protocol: 10 offers/answers plus every host,
// srflx and (if it existed) relay candidate for 10 peer connections. Untrickled
// that is comfortably 150+ frames inside two seconds and the joining player
// would be disconnected from the GAME for the crime of saying hello.
//
// Two mitigations, and both matter:
//   1. src/net/voice.js coalesces ICE candidates into one `voice-ice` frame per
//      peer per ~160 ms and holds itself to a 12 msg/s voice budget, staggering
//      peer setup so the burst is spread over a couple of seconds.
//   2. This module independently caps a participant at VOICE_MSGS_PER_SEC (40),
//      so a client that ignores rule 1 gets its voice traffic dropped rather
//      than its game socket closed.
//
// If you would still rather have headroom, raising MSGS_PER_SEC in index.js
// from 90 to 140 costs nothing — it is a flood guard, not a bandwidth budget.
// ---------------------------------------------------------------------------
