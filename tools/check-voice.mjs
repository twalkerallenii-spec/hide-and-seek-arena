#!/usr/bin/env node
// Exercise the voice client without a browser, a microphone or a peer.
//
// WebRTC cannot be tested headlessly for real, but the parts that break in
// practice — the signalling handshake, the audio graph wiring, cleanup on
// leave, and surviving a denied microphone — are all plain object plumbing.

const nodes = { panner: 0, gain: 0, analyser: 0, filter: 0, source: 0, disconnected: 0 };
const P = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (k === 'value' ? 0 : () => { })),
  set: (t, k, v) => { t[k] = v; return true; },
});
class FakeParam { constructor() { this.value = 0; } setTargetAtTime(v) { this.value = v; return this; } setValueAtTime(v) { this.value = v; return this; } }
function node(kind, extra = {}) {
  nodes[kind] = (nodes[kind] || 0) + 1;
  return { connect: () => { }, disconnect: () => { nodes.disconnected++; }, ...extra };
}
globalThis.window = globalThis;
globalThis.AudioContext = class {
  constructor() {
    this.state = 'running'; this.currentTime = 0; this.destination = P();
    this.listener = { positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(),
      forwardX: new FakeParam(), forwardY: new FakeParam(), forwardZ: new FakeParam(),
      upX: new FakeParam(), upY: new FakeParam(), upZ: new FakeParam() };
  }
  resume() { return Promise.resolve(); }
  createPanner() { return node('panner', { positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam() }); }
  createGain() { return node('gain', { gain: new FakeParam() }); }
  createAnalyser() { return node('analyser', { fftSize: 128, smoothingTimeConstant: 0, getByteTimeDomainData: a => a.fill(128) }); }
  createBiquadFilter() { return node('filter', { type: 'lowpass', frequency: new FakeParam() }); }
  createMediaStreamSource() { return node('source'); }
};
let denyMic = false;
globalThis.navigator = { mediaDevices: { getUserMedia: async () => {
  if (denyMic) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  return { getAudioTracks: () => [{ enabled: true, stop() { } }], getTracks: () => [{ stop() { } }] };
} } };
globalThis.Audio = class { constructor() { this.muted = false; } play() { return Promise.resolve(); } pause() { } remove() { } };
globalThis.RTCPeerConnection = class {
  constructor() { this.connectionState = 'new'; this.remoteDescription = null; this.localDescription = null; }
  addTrack() { } addTransceiver() { }
  async createOffer() { return { type: 'offer', sdp: 'v=0 fake-offer' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0 fake-answer' }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate() { this.ice = (this.ice || 0) + 1; }
  close() { this.connectionState = 'closed'; }
};

const { Voice } = await import('../src/net/voice.js');
const sent = [];
let fails = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '\x1b[32mok  \x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${msg}`); if (!ok) fails++; };

const v = new Voice(m => sent.push(m));
check(await v.start(), 'starts with a working microphone');
check(v.micOk, 'microphone acquired');
check(sent.some(m => m.t === 'voice-join'), 'announces itself with voice-join');

v.handle({ t: 'voice-peers', you: 'me', peers: [{ id: 'aaa' }, { id: 'zzz' }] });
check(v.peerCount === 2, `two peers created (got ${v.peerCount})`);
// createOffer is async, so the offer lands a microtask later than handle().
const flush = () => new Promise(r => setTimeout(r, 0));
await flush();
// Deterministic tie-break: lower id offers, so two peers never both offer.
check(sent.some(m => m.t === 'voice-offer' && m.to === 'zzz'), 'offers to the higher id only');
check(!sent.some(m => m.t === 'voice-offer' && m.to === 'aaa'), 'does not offer to the lower id');

await v._onOffer('aaa', 'v=0 remote');
check(sent.some(m => m.t === 'voice-answer' && m.to === 'aaa'), 'answers an incoming offer');

// Candidates arriving before the remote description must be held, not dropped.
await v._onIce('qqq', [{ candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 }]);
check(true, 'early ICE for an unknown peer does not throw');

const before = nodes.panner;
v.update({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 },
  { aaa: { x: 5, y: 0, z: 3 }, zzz: { x: -20, y: 0, z: 0 } });
const p = v.peers.get('aaa');
check(p.panner.positionX.value === 5, `panner tracks its speaker (x=${p.panner.positionX.value})`);
check(before === nodes.panner, 'update allocates no new nodes');

v.setAudible('zzz', false);
v.update({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { zzz: { x: 1, y: 0, z: 1 } });
check(v.peers.get('zzz').gain.gain.value === 0, 'setAudible(false) silences a peer');

v.isOccluded = () => true;
v.update({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { aaa: { x: 5, y: 0, z: 3 } });
check(v.peers.get('aaa').filter.frequency.value < 5000, 'a wall low-passes the voice');

const d0 = nodes.disconnected;
v.handle({ t: 'voice-peer-leave', id: 'aaa' });
check(v.peerCount === 1, 'peer removed on leave');
check(nodes.disconnected > d0, 'its audio nodes were disconnected');

denyMic = true;
const v2 = new Voice(() => { });
check(await v2.start(), 'still starts when the microphone is denied');
check(!v2.micOk, 'reports no microphone');
v2.handle({ t: 'voice-peers', you: 'me2', peers: [{ id: 'other' }] });
check(v2.peerCount === 1, 'a mic-less player can still hear others');

console.log(fails ? `\n\x1b[31mFAIL — ${fails}\x1b[0m` : '\n\x1b[32mPASS\x1b[0m');
process.exit(fails ? 1 : 0);
