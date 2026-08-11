// Proximity voice.
//
// Always-on open mic, spatialised in 3D: a voice arrives from the direction
// that player's character actually is, and fades with distance. Two people
// standing together can hold a conversation; someone across the arena is
// inaudible. No push-to-talk, no channels to join — you just talk.
//
// Transport is a WebRTC mesh. Rooms cap at eleven, so each peer holds up to ten
// connections, which is acceptable without an SFU (and the free tier could not
// host one anyway). Signalling rides the game socket — see server/signal.js.
//
// WHAT WILL NOT WORK, stated plainly:
//   - STUN only, no TURN. Players behind symmetric NAT (some corporate and
//     mobile-carrier networks) will fail to connect to some peers. They still
//     hear everyone whose connection succeeded, and the game is unaffected.
//   - A mesh at eleven peers is ~10 encodes worth of upstream. On a weak
//     laptop or a phone that is real CPU. `maxPeers` exists for that reason.
//   - Browsers will not start audio without a user gesture. `start()` must be
//     called from a click.

const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

const MIC_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
  video: false,
};

export class Voice {
  /**
   * @param {(msg:object)=>void} send  puts a message on the game socket
   */
  constructor(send, opts = {}) {
    this.send = send;
    this.peers = new Map();       // id -> { pc, stream, panner, gain, filter, analyser, el, ... }
    this.selfId = null;
    this.ctx = null;
    this.micStream = null;
    this.micOk = false;
    this.muted = false;
    this.deafened = false;
    this.enabled = false;
    this.maxPeers = opts.maxPeers ?? 10;
    this.refDistance = opts.refDistance ?? 4;
    this.maxDistance = opts.maxDistance ?? 35;
    this.rolloff = opts.rolloff ?? 1.6;
    /** Supplied by the game: does geometry sit between these two points? */
    this.isOccluded = null;
    this.onPeerState = null;
    this._levels = new Map();
    this._buf = new Uint8Array(64);
    this._pendingIce = new Map();
  }

  // ------------------------------------------------------------------- setup
  /** Must be called from a user gesture. Safe to call twice. */
  async start(sharedCtx = null) {
    if (this.enabled) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !window.RTCPeerConnection) return false;
      this.ctx = sharedCtx || new AC();
      if (this.ctx.state === 'suspended') await this.ctx.resume();

      // The listener is the player's head; positions are set every frame.
      this.listener = this.ctx.listener;

      try {
        this.micStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
        this.micOk = true;
        this._watchLocalLevel();
      } catch (e) {
        // A denied mic is not a failure: you can still hear everyone.
        console.warn('voice: microphone unavailable —', e?.name || e);
        this.micOk = false;
      }

      this.enabled = true;
      this.send({ t: 'voice-join' });
      return true;
    } catch (e) {
      console.warn('voice: disabled', e);
      return false;
    }
  }

  stop() {
    for (const id of [...this.peers.keys()]) this._dropPeer(id);
    this.micStream?.getTracks().forEach(t => t.stop());
    this.micStream = null;
    if (this.enabled) this.send({ t: 'voice-leave' });
    this.enabled = false;
  }

  // ---------------------------------------------------------------- messages
  /** Feed every socket message here; returns true if it was a voice message. */
  handle(msg) {
    if (!msg || typeof msg.t !== 'string' || !msg.t.startsWith('voice-')) return false;
    if (!this.enabled) return true;
    switch (msg.t) {
      case 'voice-peers': {
        this.selfId = msg.you;
        // Deterministic tie-break: the lower id makes the offer, so two peers
        // never both offer and collide.
        for (const p of msg.peers || []) {
          if (p.id === this.selfId) continue;
          this._ensurePeer(p.id, String(this.selfId) < String(p.id));
        }
        break;
      }
      case 'voice-peer-join':
        this._ensurePeer(msg.id, String(this.selfId) < String(msg.id));
        break;
      case 'voice-peer-leave':
        this._dropPeer(msg.id);
        break;
      case 'voice-offer': this._onOffer(msg.from, msg.sdp); break;
      case 'voice-answer': this._onAnswer(msg.from, msg.sdp); break;
      case 'voice-ice': this._onIce(msg.from, msg.cands); break;
      case 'voice-peer-state':
        this.onPeerState?.(msg.id, { mic: msg.mic, muted: msg.muted });
        break;
      case 'voice-error':
        console.warn('voice: server said', msg.code, msg.to || '');
        break;
    }
    return true;
  }

  // -------------------------------------------------------------------- peer
  _ensurePeer(id, weOffer) {
    if (!id || id === this.selfId || this.peers.has(id)) return this.peers.get(id);
    if (this.peers.size >= this.maxPeers) return null;

    const pc = new RTCPeerConnection({ iceServers: ICE });
    const node = this._buildAudioChain();
    const peer = { pc, ...node, id, cands: [], flushTimer: 0, speaking: false };
    this.peers.set(id, peer);

    if (this.micStream) {
      for (const track of this.micStream.getAudioTracks()) pc.addTrack(track, this.micStream);
    } else {
      // No mic, but we still need the transceiver to receive theirs.
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.ontrack = (e) => this._attachRemote(peer, e.streams[0]);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      // Batched: the relay rate-limits, and one candidate per message wastes it.
      peer.cands.push({
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
        usernameFragment: e.candidate.usernameFragment,
      });
      clearTimeout(peer.flushTimer);
      peer.flushTimer = setTimeout(() => {
        if (!peer.cands.length) return;
        this.send({ t: 'voice-ice', to: id, cands: peer.cands.splice(0, 12) });
      }, 120);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // Almost always symmetric NAT with no TURN to fall back on.
        console.warn(`voice: peer ${id} ${pc.connectionState}`);
      }
    };

    if (weOffer) this._makeOffer(peer);
    return peer;
  }

  async _makeOffer(peer) {
    try {
      const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
      await peer.pc.setLocalDescription(offer);
      this.send({ t: 'voice-offer', to: peer.id, sdp: peer.pc.localDescription.sdp });
    } catch (e) { console.warn('voice: offer failed', e); }
  }

  async _onOffer(from, sdp) {
    const peer = this._ensurePeer(from, false);
    if (!peer) return;
    try {
      await peer.pc.setRemoteDescription({ type: 'offer', sdp });
      await this._drainIce(peer);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.send({ t: 'voice-answer', to: from, sdp: peer.pc.localDescription.sdp });
    } catch (e) { console.warn('voice: answer failed', e); }
  }

  async _onAnswer(from, sdp) {
    const peer = this.peers.get(from);
    if (!peer) return;
    try {
      await peer.pc.setRemoteDescription({ type: 'answer', sdp });
      await this._drainIce(peer);
    } catch (e) { console.warn('voice: setRemote failed', e); }
  }

  async _onIce(from, cands) {
    const peer = this.peers.get(from);
    if (!peer || !Array.isArray(cands)) return;
    for (const c of cands) {
      // Candidates can arrive before the remote description; hold them.
      if (!peer.pc.remoteDescription) {
        const q = this._pendingIce.get(from) || [];
        q.push(c);
        this._pendingIce.set(from, q);
        continue;
      }
      try { await peer.pc.addIceCandidate(c); } catch { /* stale candidate */ }
    }
  }

  async _drainIce(peer) {
    const q = this._pendingIce.get(peer.id);
    if (!q) return;
    this._pendingIce.delete(peer.id);
    for (const c of q) {
      try { await peer.pc.addIceCandidate(c); } catch { /* ignore */ }
    }
  }

  _dropPeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    clearTimeout(p.flushTimer);
    try { p.pc.close(); } catch { }
    try { p.el?.pause(); p.el && (p.el.srcObject = null); p.el?.remove(); } catch { }
    for (const n of [p.source, p.filter, p.gain, p.panner, p.analyser]) {
      try { n?.disconnect(); } catch { }
    }
    this.peers.delete(id);
    this._pendingIce.delete(id);
    this._levels.delete(id);
  }

  // ------------------------------------------------------------- audio graph
  /**
   *   MediaStreamSource -> BiquadFilter (occlusion) -> Gain -> Panner -> out
   *                                                  \-> Analyser (VAD)
   */
  _buildAudioChain() {
    const ctx = this.ctx;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = this.refDistance;
    panner.maxDistance = this.maxDistance;
    panner.rolloffFactor = this.rolloff;
    panner.coneInnerAngle = 360;

    const gain = ctx.createGain();
    gain.gain.value = 1;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;      // open until told otherwise

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.7;

    filter.connect(gain);
    gain.connect(panner);
    gain.connect(analyser);
    panner.connect(ctx.destination);
    return { panner, gain, filter, analyser, source: null, el: null };
  }

  _attachRemote(peer, stream) {
    if (!stream || peer.source) return;
    peer.stream = stream;
    // Chrome will not pull audio through WebAudio from a WebRTC MediaStream
    // unless the stream is ALSO attached to a media element. The element stays
    // muted; everything audible comes out of the panner.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    el.autoplay = true;
    el.play?.().catch(() => { });
    peer.el = el;

    peer.source = this.ctx.createMediaStreamSource(stream);
    peer.source.connect(peer.filter);
  }

  // ------------------------------------------------------------------ per-frame
  /**
   * Move the listener to the player's head and every peer's voice to their
   * character. Call once a frame.
   *
   * @param {{x,y,z}} pos      camera world position
   * @param {{x,y,z}} forward  camera forward vector
   * @param {{x,y,z}} up       camera up vector
   * @param {Map|object} peerPositions  id -> {x,y,z}
   */
  update(pos, forward, up, peerPositions) {
    if (!this.enabled || !this.ctx) return;
    const L = this.listener;
    const t = this.ctx.currentTime;

    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02);
      L.positionY.setTargetAtTime(pos.y, t, 0.02);
      L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(forward.x, t, 0.02);
      L.forwardY.setTargetAtTime(forward.y, t, 0.02);
      L.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02);
      L.upY.setTargetAtTime(up.y, t, 0.02);
      L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else if (L.setPosition) {
      L.setPosition(pos.x, pos.y, pos.z);            // deprecated, still needed
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }

    const get = peerPositions instanceof Map
      ? (id) => peerPositions.get(id)
      : (id) => peerPositions?.[id];

    for (const [id, peer] of this.peers) {
      const p = get(id);
      if (!p) continue;
      const pan = peer.panner;
      if (pan.positionX) {
        pan.positionX.setTargetAtTime(p.x, t, 0.03);
        pan.positionY.setTargetAtTime(p.y, t, 0.03);
        pan.positionZ.setTargetAtTime(p.z, t, 0.03);
      } else if (pan.setPosition) {
        pan.setPosition(p.x, p.y, p.z);
      }

      // A voice through a wall should sound like it.
      if (this.isOccluded) {
        const blocked = this.isOccluded(pos, p);
        const target = blocked ? 900 : 20000;
        if (peer.filter.frequency.value !== target) {
          peer.filter.frequency.setTargetAtTime(target, t, 0.08);
        }
      }

      peer.gain.gain.value = this.deafened ? 0 : (peer.audible === false ? 0 : 1);
      this._sampleLevel(id, peer);
    }
  }

  // -------------------------------------------------------------------- state
  setAudible(peerId, on) {
    const p = this.peers.get(peerId);
    if (p) p.audible = on;
  }
  setMuted(on) {
    this.muted = on;
    this.micStream?.getAudioTracks().forEach(t => (t.enabled = !on));
    if (this.enabled) this.send({ t: 'voice-state', mic: this.micOk, muted: on });
  }
  setDeafened(on) { this.deafened = on; }

  _sampleLevel(id, peer) {
    const a = peer.analyser;
    if (!a) return;
    a.getByteTimeDomainData(this._buf);
    let peak = 0;
    for (let i = 0; i < this._buf.length; i++) {
      peak = Math.max(peak, Math.abs(this._buf[i] - 128));
    }
    const level = Math.min(1, peak / 40);
    this._levels.set(id, level);
    peer.speaking = level > 0.12;
  }

  _watchLocalLevel() {
    const src = this.ctx.createMediaStreamSource(this.micStream);
    const a = this.ctx.createAnalyser();
    a.fftSize = 128;
    src.connect(a);
    this._localAnalyser = a;
    this._localSource = src;
  }

  /** 0..1, for a speaking indicator. Pass no id for your own mic. */
  level(id) {
    if (id == null) {
      if (!this._localAnalyser) return 0;
      this._localAnalyser.getByteTimeDomainData(this._buf);
      let peak = 0;
      for (let i = 0; i < this._buf.length; i++) peak = Math.max(peak, Math.abs(this._buf[i] - 128));
      return this.muted ? 0 : Math.min(1, peak / 40);
    }
    return this._levels.get(id) || 0;
  }

  isSpeaking(id) { return this.level(id) > 0.12; }
  get peerCount() { return this.peers.size; }
}
