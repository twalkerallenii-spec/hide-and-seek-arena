// Procedural audio. Everything is synthesised with WebAudio — no sample files,
// so the whole game stays a single static bundle. Each arena can request an
// ambience bed and a reverb character.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.ambienceGain = null;
    this.convolver = null;
    this.wetGain = null;
    this.started = false;
    this.volume = { master: 0.8, music: 0.5, sfx: 0.9, ambience: 0.65 };
    this._ambienceNodes = [];
    this._musicNodes = [];
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume.master;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.volume.sfx;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.volume.music;
    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = this.volume.ambience;

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this._impulse(2.2, 2.6);
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.22;
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.master);

    for (const g of [this.sfxGain, this.musicGain, this.ambienceGain]) {
      g.connect(this.master);
      g.connect(this.convolver);
    }
    this.started = true;
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  setVolume(kind, v) {
    this.volume[kind] = v;
    if (!this.started) return;
    ({ master: this.master, music: this.musicGain, sfx: this.sfxGain, ambience: this.ambienceGain })[kind]
      ?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Exponentially decaying noise burst — a serviceable reverb tail. */
  _impulse(seconds = 2, decay = 2.5, damp = 0.4) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        last = last * damp + n * (1 - damp);   // one-pole LPF darkens the tail
        d[i] = last;
      }
    }
    return buf;
  }

  /** Swap the reverb character. size 0..1, dark 0..1, wet 0..1 */
  setSpace(size = 0.5, dark = 0.4, wet = 0.22) {
    if (!this.started) return;
    this.convolver.buffer = this._impulse(0.35 + size * 4.5, 1.6 + (1 - size) * 3, 0.15 + dark * 0.7);
    this.wetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.2);
  }

  _noiseBuffer(seconds = 1) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(rate * seconds), rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * One-shot synth voice.
   * @param {object} o { type, freq, freqEnd, dur, gain, attack, decay,
   *                     filter, filterEnd, q, noise, detune, pan, dest }
   */
  play(o = {}) {
    if (!this.started) return;
    const t = this.ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.2;
    const dest = o.dest ?? this.sfxGain;

    let src;
    if (o.noise) {
      src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer(Math.max(0.05, dur));
    } else {
      src = this.ctx.createOscillator();
      src.type = o.type ?? 'sine';
      src.frequency.setValueAtTime(o.freq ?? 220, t);
      if (o.freqEnd !== undefined) {
        src.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + dur);
      }
      if (o.detune) src.detune.setValueAtTime(o.detune, t);
    }

    let node = src;
    if (o.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = o.filterType ?? 'lowpass';
      f.frequency.setValueAtTime(o.filter, t);
      if (o.filterEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filterEnd), t + dur);
      f.Q.value = o.q ?? 1;
      node.connect(f); node = f;
    }

    const g = this.ctx.createGain();
    const peak = o.gain ?? 0.3;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g);

    if (o.pan !== undefined && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p); p.connect(dest);
    } else {
      g.connect(dest);
    }

    src.start(t);
    src.stop(t + dur + 0.05);
    return src;
  }

  // -------------------------------------------------------------------------
  // Named SFX
  // -------------------------------------------------------------------------

  footstep(surface = 'concrete', speed = 4) {
    const v = clamp(0.04 + speed * 0.014, 0.03, 0.16);
    const P = {
      concrete: { filter: 1500, q: 1.1, dur: 0.11, tone: 130 },
      carpet:   { filter: 520,  q: 0.7, dur: 0.13, tone: 90 },
      metal:    { filter: 3200, q: 3.5, dur: 0.16, tone: 420 },
      wood:     { filter: 1100, q: 2.0, dur: 0.12, tone: 180 },
      grass:    { filter: 2600, q: 0.8, dur: 0.14, tone: 100 },
      gravel:   { filter: 3800, q: 0.6, dur: 0.15, tone: 150 },
      water:    { filter: 900,  q: 0.5, dur: 0.22, tone: 70 },
      snow:     { filter: 2000, q: 0.5, dur: 0.17, tone: 80 },
      sand:     { filter: 1700, q: 0.4, dur: 0.15, tone: 90 },
      tile:     { filter: 2800, q: 2.4, dur: 0.10, tone: 260 },
    }[surface] ?? { filter: 1500, q: 1, dur: 0.12, tone: 130 };
    const jitter = 0.85 + Math.random() * 0.3;
    this.play({ noise: true, dur: P.dur * jitter, gain: v, filter: P.filter * jitter, filterEnd: P.filter * 0.4, q: P.q, pan: (Math.random() - 0.5) * 0.4 });
    this.play({ type: 'sine', freq: P.tone * jitter, freqEnd: P.tone * 0.55, dur: P.dur * 0.8, gain: v * 0.55 });
  }

  jump() { this.play({ noise: true, dur: 0.12, gain: 0.07, filter: 900, filterEnd: 300, q: 1 }); }

  land(impact = 6) {
    const v = clamp(impact * 0.014, 0.05, 0.22);
    this.play({ noise: true, dur: 0.2, gain: v, filter: 1200, filterEnd: 180, q: 1.2 });
    this.play({ type: 'sine', freq: 90, freqEnd: 45, dur: 0.24, gain: v * 0.8 });
  }

  pickup(kind = 'coin') {
    if (kind === 'coin') {
      this.play({ type: 'triangle', freq: 880, dur: 0.09, gain: 0.14 });
      this.play({ type: 'triangle', freq: 1320, dur: 0.16, gain: 0.12, delay: 0.06 });
    } else {
      this.play({ type: 'square', freq: 420, freqEnd: 1400, dur: 0.22, gain: 0.1, filter: 4000 });
      this.play({ type: 'sine', freq: 1760, dur: 0.3, gain: 0.08, delay: 0.1 });
    }
  }

  ui(kind = 'hover') {
    const P = {
      hover:   { freq: 620,  dur: 0.05, gain: 0.05, type: 'sine' },
      click:   { freq: 340,  dur: 0.09, gain: 0.11, type: 'triangle' },
      back:    { freq: 240,  dur: 0.11, gain: 0.1,  type: 'triangle' },
      confirm: { freq: 520,  dur: 0.14, gain: 0.12, type: 'square' },
      error:   { freq: 150,  dur: 0.2,  gain: 0.13, type: 'sawtooth' },
    }[kind] ?? { freq: 400, dur: 0.08, gain: 0.08, type: 'sine' };
    this.play({ ...P, filter: 5200 });
    if (kind === 'confirm') this.play({ type: 'square', freq: 780, dur: 0.16, gain: 0.09, delay: 0.07, filter: 5200 });
  }

  /** Rising alarm sting used when the Seeker sweep locks on. */
  spotted() {
    this.play({ type: 'sawtooth', freq: 180, freqEnd: 1200, dur: 0.55, gain: 0.16, filter: 2600, q: 4 });
    this.play({ type: 'square', freq: 90, dur: 0.7, gain: 0.1 });
  }

  /** Low pulse the Seeker emits on each scan. */
  ping(distance01 = 0.5) {
    const f = 300 + (1 - distance01) * 500;
    this.play({ type: 'sine', freq: f, freqEnd: f * 0.5, dur: 0.9, gain: 0.05 + (1 - distance01) * 0.08, filter: 1800 });
  }

  doorCreak() {
    this.play({ type: 'sawtooth', freq: 110, freqEnd: 190, dur: 0.9, gain: 0.05, filter: 700, q: 6 });
  }

  /** The dog easter egg. */
  bark() {
    this.play({ type: 'sawtooth', freq: 340, freqEnd: 180, dur: 0.13, gain: 0.16, filter: 2200, q: 2 });
    this.play({ type: 'sawtooth', freq: 300, freqEnd: 150, dur: 0.16, gain: 0.13, filter: 1800, q: 2, delay: 0.18 });
  }

  // -------------------------------------------------------------------------
  // Ambience beds
  // -------------------------------------------------------------------------

  stopAmbience() {
    for (const n of this._ambienceNodes) { try { n.stop?.(); n.disconnect?.(); } catch { } }
    this._ambienceNodes = [];
  }

  /**
   * @param {string} kind hum | wind | rain | cave | machine | forest | ocean | void | electric
   */
  ambience(kind = 'hum', level = 1) {
    if (!this.started) return;
    this.stopAmbience();
    const t = this.ctx.currentTime;
    const out = this.ambienceGain;
    const keep = (n) => { this._ambienceNodes.push(n); return n; };

    const noiseLoop = (filterType, freq, q, gain) => {
      const src = keep(this.ctx.createBufferSource());
      src.buffer = this._noiseBuffer(4);
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(gain * level, t, 1.5);
      src.connect(f); f.connect(g); g.connect(out);
      src.start();
      return { src, f, g };
    };

    const drone = (freq, gain, type = 'sine', detune = 0) => {
      const o = keep(this.ctx.createOscillator());
      o.type = type; o.frequency.value = freq; o.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(gain * level, t, 2.0);
      o.connect(g); g.connect(out);
      o.start();
      return { o, g };
    };

    switch (kind) {
      case 'hum': {  // fluorescent buzz — the Backrooms signature
        drone(60, 0.035, 'sawtooth');
        drone(120, 0.018, 'sine', 6);
        const n = noiseLoop('bandpass', 3200, 6, 0.012);
        // slow flicker in the buzz
        const lfo = keep(this.ctx.createOscillator());
        lfo.frequency.value = 0.13;
        const lg = this.ctx.createGain(); lg.gain.value = 0.008;
        lfo.connect(lg); lg.connect(n.g.gain); lfo.start();
        break;
      }
      case 'wind': {
        const n = noiseLoop('lowpass', 420, 0.7, 0.13);
        const lfo = keep(this.ctx.createOscillator());
        lfo.frequency.value = 0.07;
        const lg = this.ctx.createGain(); lg.gain.value = 260;
        lfo.connect(lg); lg.connect(n.f.frequency); lfo.start();
        break;
      }
      case 'rain': {
        noiseLoop('highpass', 1400, 0.6, 0.1);
        noiseLoop('bandpass', 600, 1.2, 0.05);
        drone(48, 0.02, 'sine');
        break;
      }
      case 'cave': {
        drone(38, 0.045, 'sine');
        drone(57, 0.02, 'sine', -8);
        noiseLoop('lowpass', 240, 1.0, 0.05);
        break;
      }
      case 'machine': {
        drone(44, 0.05, 'square');
        drone(88, 0.02, 'sawtooth', 4);
        const n = noiseLoop('bandpass', 900, 2, 0.03);
        const lfo = keep(this.ctx.createOscillator());
        lfo.frequency.value = 2.4;
        const lg = this.ctx.createGain(); lg.gain.value = 0.015;
        lfo.connect(lg); lg.connect(n.g.gain); lfo.start();
        break;
      }
      case 'forest': {
        noiseLoop('bandpass', 1800, 0.8, 0.05);
        noiseLoop('lowpass', 300, 0.6, 0.05);
        break;
      }
      case 'ocean': {
        const n = noiseLoop('lowpass', 700, 0.5, 0.12);
        const lfo = keep(this.ctx.createOscillator());
        lfo.frequency.value = 0.11;
        const lg = this.ctx.createGain(); lg.gain.value = 380;
        lfo.connect(lg); lg.connect(n.f.frequency); lfo.start();
        break;
      }
      case 'electric': {
        drone(50, 0.03, 'sawtooth');
        const n = noiseLoop('bandpass', 5200, 10, 0.02);
        const lfo = keep(this.ctx.createOscillator());
        lfo.type = 'square'; lfo.frequency.value = 7.3;
        const lg = this.ctx.createGain(); lg.gain.value = 0.02;
        lfo.connect(lg); lg.connect(n.g.gain); lfo.start();
        break;
      }
      case 'void':
      default: {
        drone(32, 0.05, 'sine');
        drone(48.5, 0.025, 'sine');
        noiseLoop('lowpass', 160, 0.8, 0.03);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Music — a slow generative pad, one chord progression per arena mood.
  // -------------------------------------------------------------------------

  stopMusic() {
    for (const n of this._musicNodes) { try { n.stop?.(); n.disconnect?.(); } catch { } }
    this._musicNodes = [];
    clearInterval(this._musicTimer);
    this._musicTimer = null;
  }

  music(mood = 'menu') {
    if (!this.started) return;
    this.stopMusic();
    const PROG = {
      menu:     [[0, 3, 7, 10], [-2, 3, 5, 10], [-4, 0, 3, 7], [-5, 2, 7, 11]],
      tense:    [[0, 1, 7, 8], [0, 3, 6, 10], [-1, 2, 5, 11], [0, 1, 7, 8]],
      calm:     [[0, 4, 7, 11], [-3, 2, 5, 9], [-5, 0, 4, 7], [-1, 2, 6, 9]],
      dread:    [[0, 1, 6, 7], [-1, 0, 5, 6], [-3, 1, 4, 8], [0, 1, 6, 13]],
      heroic:   [[0, 4, 7, 12], [-3, 4, 9, 12], [-5, 2, 7, 11], [2, 5, 9, 14]],
      arcade:   [[0, 4, 7, 12], [2, 5, 9, 14], [-3, 0, 4, 7], [-1, 3, 6, 10]],
    }[mood] ?? PROGDEFAULT();
    function PROGDEFAULT() { return [[0, 3, 7, 10]]; }

    const root = 55;   // A1
    let step = 0;
    const playChord = () => {
      const chord = PROG[step % PROG.length];
      step++;
      const t = this.ctx.currentTime;
      for (const semi of chord) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = root * Math.pow(2, semi / 12) * 2;
        o.detune.value = (Math.random() - 0.5) * 12;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 1.2;
        f.frequency.setTargetAtTime(900, t, 2.2);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + 2.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 7.5);
        o.connect(f); f.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + 8);
        this._musicNodes.push(o);
      }
      this._musicNodes = this._musicNodes.slice(-40);
    };
    playChord();
    this._musicTimer = setInterval(playChord, 6800);
  }
}

export const audio = new AudioEngine();
