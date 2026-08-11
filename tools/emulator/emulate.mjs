#!/usr/bin/env node
// The emulator.
//
// Boots the ACTUAL game — index.html, main.js, the whole stack — inside a real
// DOM with a stubbed WebGL2 context, then plays it: clicks the menu, starts an
// arena, walks the player around, presses keys, runs a full hunt round, and
// reports every error, unhandled rejection, NaN and stuck state it finds.
//
// It cannot see pixels. It can see everything else, which is where the bugs are.
//
//   node tools/emulator/emulate.mjs                 default script, backrooms
//   node tools/emulator/emulate.mjs forge 90        arena + seconds to play
//   node tools/emulator/emulate.mjs --all           a short run through all 12

import { parseHTML } from 'linkedom';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve as pres } from 'node:path';
import { createGL2Stub } from './gl2-stub.mjs';

const ROOT = pres(new URL('../..', import.meta.url).pathname);
const C = {
  g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, d: s => `\x1b[90m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`,
};

const problems = [];
const warnings = [];
const note = (m) => console.log(C.d('   · ' + m));
const bad = (m) => { problems.push(m); console.log(C.r('   ✗ ' + m)); };
const warn = (m) => { warnings.push(m); console.log(C.y('   ! ' + m)); };

// ---------------------------------------------------------------- the DOM --
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const { window, document } = parseHTML(html);

const gl = createGL2Stub(1600, 900);

// linkedom has no canvas; give every canvas a 2D shim and the one <canvas id=gl>
// the WebGL2 stub, so both the texture foundry and the renderer come up.
function make2D() {
  const store = new Map();
  const base = {
    createImageData: (w, h) => ({ width: w, height: h ?? w, data: new Uint8ClampedArray((w * (h ?? w)) * 4) }),
    putImageData: (img) => store.set('img', img),
    getImageData: (x, y, w, h) => store.get('img') || { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) },
    measureText: (t) => ({ width: String(t).length * 18, actualBoundingBoxAscent: 24, actualBoundingBoxDescent: 6 }),
    createLinearGradient: () => ({ addColorStop() { } }),
    createRadialGradient: () => ({ addColorStop() { } }),
    createPattern: () => null, getLineDash: () => [], drawImage() { },
  };
  return new Proxy(base, {
    get: (t, p) => (p in t ? t[p] : (typeof p === 'symbol' ? undefined : () => { })),
    set: (t, p, v) => { t[p] = v; return true; },
    has: () => true,
  });
}

// linkedom exposes `value` on form elements as a getter only. Real browsers let
// you assign it, and the game does, so patch it to behave like a browser.
for (const proto of [window.HTMLInputElement, window.HTMLSelectElement, window.HTMLTextAreaElement]) {
  if (!proto) continue;
  const d = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
  if (d && !d.set) {
    Object.defineProperty(proto.prototype, 'value', {
      configurable: true,
      get() { return this.getAttribute('value') ?? ''; },
      set(v) { this.setAttribute('value', String(v)); },
    });
  }
  const c = Object.getOwnPropertyDescriptor(proto.prototype, 'checked');
  if (c && !c.set) {
    Object.defineProperty(proto.prototype, 'checked', {
      configurable: true,
      get() { return this.hasAttribute('checked'); },
      set(v) { v ? this.setAttribute('checked', '') : this.removeAttribute('checked'); },
    });
  }
}

globalThis.location = window.location = {
  href: 'http://localhost:8080/', search: '', hostname: 'localhost',
  protocol: 'http:', host: 'localhost:8080', origin: 'http://localhost:8080',
};

const origCreate = document.createElement.bind(document);
document.createElement = (tag, ...rest) => {
  const el = origCreate(tag, ...rest);
  if (String(tag).toLowerCase() === 'canvas') attachCanvas(el);
  return el;
};
function attachCanvas(el) {
  el.width = el.width || 300; el.height = el.height || 150;
  let c2d = null;
  el.getContext = (kind) => {
    if (kind === '2d') return (c2d ||= make2D());
    if (kind === 'webgl2' || kind === 'experimental-webgl2') { gl.canvas = el; return gl; }
    return null;
  };
  el.toDataURL = () => 'data:image/png;base64,';
  return el;
}
for (const el of document.querySelectorAll('canvas')) attachCanvas(el);

// --------------------------------------------------------------- globals ---
const raf = [];
let frameId = 1;
globalThis.window = window;
globalThis.document = document;
globalThis.self = globalThis;
globalThis.navigator = window.navigator || { userAgent: 'emulator' };
globalThis.HTMLCanvasElement = window.HTMLCanvasElement || class { };
globalThis.HTMLElement = window.HTMLElement;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Image = class { constructor() { this.width = 1; this.height = 1; } };
globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
globalThis.requestAnimationFrame = (cb) => { raf.push(cb); return frameId++; };
globalThis.cancelAnimationFrame = () => { };
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
window.devicePixelRatio = 1;
Object.defineProperty(window, 'innerWidth', { value: 1600, writable: true });
Object.defineProperty(window, 'innerHeight', { value: 900, writable: true });
globalThis.innerWidth = 1600; globalThis.innerHeight = 900;
globalThis.devicePixelRatio = 1;

const store = new Map();
globalThis.localStorage = window.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};

// No audio device: record instead of playing, so audio bugs still surface.
const audioCalls = { osc: 0, gain: 0, buffers: 0 };
class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime(v) { this.value = v; return this; }
  setTargetAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) {
    if (!(v > 0)) bad(`WebAudio: exponentialRampToValueAtTime(${v}) — must be > 0, this throws in a browser`);
    this.value = v; return this;
  }
  cancelScheduledValues() { return this; }
}
const fakeNode = (extra = {}) => new Proxy({
  connect: () => fakeNode(), disconnect: F0, start: F0, stop: F0,
  gain: new FakeParam(), frequency: new FakeParam(), detune: new FakeParam(),
  Q: new FakeParam(), pan: new FakeParam(), ...extra,
}, { get: (t, p) => (p in t ? t[p] : (typeof p === 'symbol' ? undefined : () => fakeNode())), set: (t, p, v) => { t[p] = v; return true; }, has: () => true });
function F0() { }
globalThis.AudioContext = window.AudioContext = class {
  constructor() { this.sampleRate = 48000; this.currentTime = 0; this.state = 'running'; this.destination = fakeNode(); this.listener = fakeNode(); }
  createGain() { audioCalls.gain++; return fakeNode(); }
  createOscillator() { audioCalls.osc++; return fakeNode(); }
  createBufferSource() { return fakeNode({ buffer: null, loop: false }); }
  createBiquadFilter() { return fakeNode({ type: 'lowpass' }); }
  createConvolver() { return fakeNode({ buffer: null }); }
  createStereoPanner() { return fakeNode(); }
  createPanner() { return fakeNode(); }
  createAnalyser() { return fakeNode({ fftSize: 128, getByteTimeDomainData: (a) => a.fill(128) }); }
  createDynamicsCompressor() { return fakeNode(); }
  createMediaStreamSource() { return fakeNode(); }
  createBuffer(ch, len, rate) { audioCalls.buffers++; return { numberOfChannels: ch, length: len, sampleRate: rate, getChannelData: () => new Float32Array(len) }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
};
globalThis.RTCPeerConnection = undefined;   // voice off in the emulator
globalThis.WebSocket = undefined;           // offline: exercise the local round
globalThis.fetch = async (url) => {
  const p = String(url).replace(/^file:\/\//, '').replace(/^https?:\/\/[^/]+/, '');
  const f = join(ROOT, p.replace(/^.*\/assets\//, 'assets/'));
  if (!existsSync(f)) return { ok: false, status: 404, json: async () => ({}) };
  const b = readFileSync(f);
  return { ok: true, status: 200, json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b.buffer };
};

document.pointerLockElement = null;
for (const el of document.querySelectorAll('canvas')) {
  el.requestPointerLock = () => { document.pointerLockElement = el; };
}
document.exitPointerLock = () => { document.pointerLockElement = null; };

// --------------------------------------------------------- error capture ---
const seen = new Set();
process.on('uncaughtException', e => bad('uncaught: ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' | ')));
process.on('unhandledRejection', e => bad('unhandled rejection: ' + String(e?.stack || e).split('\n').slice(0, 2).join(' | ')));
const realErr = console.error;
console.error = (...a) => {
  const m = a.map(x => (x?.stack || String(x))).join(' ').slice(0, 240);
  if (!seen.has(m)) { seen.add(m); bad('console.error: ' + m); }
};
const realWarn = console.warn;
console.warn = (...a) => {
  const m = a.map(String).join(' ').slice(0, 200);
  if (/three|shader|program/i.test(m) && !seen.has(m)) { seen.add(m); warn('console.warn: ' + m); }
};

// ------------------------------------------------------------ the driver ---
function pump(frames = 1, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) {
    const batch = raf.splice(0, raf.length);
    for (const cb of batch) {
      try { cb(performance.now()); } catch (e) { bad('frame threw: ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' | ')); }
    }
  }
}
// setImmediate alone never lets a setTimeout fire, and the boot sequence uses
// one. Alternate between microtask drain and a real 0ms timer so both kinds of
// pending work make progress.
const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) {
    await new Promise(r => (i % 3 === 2 ? setTimeout(r, 1) : setImmediate(r)));
    pump(1);
  }
};

/** Pump frames and timers until `pred()` or `ms` of real time has passed. */
async function waitFor(pred, ms, label) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (pred()) return true;
    await settle(3);
  }
  if (label) warn(`timed out waiting for ${label} (${ms}ms)`);
  return pred();
}

function key(code, down = true) {
  const e = new window.Event(down ? 'keydown' : 'keyup');
  e.code = code; e.key = code; e.preventDefault = F0; e.shiftKey = false;
  document.dispatchEvent(e);
}
function click(el) {
  if (!el) return false;
  const e = new window.Event('click', { bubbles: true });
  el.dispatchEvent(e);
  return true;
}
function mouse(dx, dy) {
  const e = new window.Event('mousemove');
  e.movementX = dx; e.movementY = dy;
  document.dispatchEvent(e);
}

// ------------------------------------------------------------------ run ----
const arg = process.argv.slice(2);
const ALL = arg.includes('--all');
const arena = arg.find(a => !a.startsWith('-')) || 'backrooms';
const seconds = Number(arg.find(a => /^\d+$/.test(a)) || 60);

console.log(C.b('\n=== BOOT ==='));
const t0 = Date.now();
await import(pres(ROOT, 'src/main.js'));
await settle(40);

const game = globalThis.window.__game || globalThis.__game;
if (!game) { bad('window.__game never appeared — the game did not boot'); finish(); }
note(`booted in ${Date.now() - t0}ms, state=${game.state}`);

// Wait for the boot sequence to reach the menu.
await waitFor(() => game.state !== 'boot', 30000, 'boot to finish');
if (game.state !== 'menu') bad(`stuck in state "${game.state}" after boot`);
else note(`reached the menu`);

const glStats = gl.__stats;
note(`gl: ${glStats.programs} programs, ${glStats.textures} textures, ${glStats.calls} calls`);

console.log(C.b('\n=== MENU ==='));
// The menu must actually be visible and its buttons reachable.
const menuEl = document.getElementById('menu');
if (!menuEl?.classList.contains('active')) bad('#menu is not active at the menu state');
for (const id of ['btnPlay', 'btnCredits']) {
  if (!document.getElementById(id)) bad(`#${id} missing from the DOM`);
}
// Tab switching
for (const t of document.querySelectorAll('.tab')) { click(t); await settle(2); }
note(`clicked ${document.querySelectorAll('.tab').length} tabs without error`);

// Settings must not silence the game — the historical bug.
const { save } = await import(pres(ROOT, 'src/game/state.js'));
if (save.settings.volMaster <= 0.02) bad(`volMaster collapsed to ${save.settings.volMaster} after menu init`);
else note(`volMaster survived menu init at ${save.settings.volMaster}`);
if (save.settings.volMusic <= 0.02) bad(`volMusic collapsed to ${save.settings.volMusic}`);
if (Number.isNaN(save.settings.quality) || typeof save.settings.quality !== 'string') {
  bad(`quality is ${JSON.stringify(save.settings.quality)}, expected a string`);
}

const arenas = ALL ? (await import(pres(ROOT, 'src/arenas/index.js'))).ARENA_LIST.map(a => a.id) : [arena];

for (const id of arenas) {
  console.log(C.b(`\n=== PLAY: ${id} ===`));
  const before = problems.length;
  const tA = Date.now();
  game.startArena(id);
  await waitFor(() => game.state === 'play', 180000, `${id} to load`);
  if (game.state !== 'play') { bad(`${id}: never reached play (stuck in ${game.state})`); continue; }
  note(`loaded in ${((Date.now() - tA) / 1000).toFixed(1)}s (this box is ~25x slow)`);

  const roundMode = !!game.roundMode;
  note(`mode: ${roundMode ? 'HUNT (round)' : 'solo explore'}`);

  if (roundMode) {
    // The lobby must be reachable: its START button has to be clickable.
    const lb = document.querySelector('.lb-screen');
    if (!lb?.classList.contains('on')) bad('lobby screen never opened in round mode');
    else note('lobby is up');
    if (document.pointerLockElement) bad('pointer is locked during the lobby — START would be unclickable');
    const readyBtn = [...document.querySelectorAll('.lb-wrap .btn')].pop();
    if (!readyBtn) bad('no READY button in the lobby');
    else { click(readyBtn); note('pressed READY'); }
  }

  // Play. Walk, look, sprint, crouch, jump, torch, powerup, scan.
  const frames = Math.round(seconds * 60);
  const start = game.controller.position.clone();
  let nan = 0, maxFall = 0, stuckFor = 0, lastPos = start.clone();
  const phases = new Set();
  key('KeyW');
  for (let f = 0; f < frames; f++) {
    if (f % 137 === 0) { key('KeyW', false); key(['KeyW', 'KeyA', 'KeyS', 'KeyD'][(f / 137 | 0) % 4]); }
    if (f % 91 === 0) mouse(60, 0);
    if (f % 233 === 0) key('Space');
    if (f % 311 === 0) key('KeyF');
    if (f % 419 === 0) key('KeyQ');
    if (f % 523 === 0) key('Tab');
    if (f % 601 === 0) key('KeyC');
    if (f % 601 === 300) key('KeyC', false);
    pump(1);
    if (f % 30 === 0) await new Promise(r => setImmediate(r));

    const p = game.controller.position;
    if (!Number.isFinite(p.x + p.y + p.z)) { nan++; if (nan === 1) bad(`${id}: player position went NaN at frame ${f}`); break; }
    maxFall = Math.min(maxFall, p.y);
    if (p.distanceTo(lastPos) < 0.002) stuckFor++; else stuckFor = 0;
    lastPos = p.clone();
    if (roundMode) phases.add(game.round.phase);
  }
  key('KeyW', false);

  const end = game.controller.position;
  note(`walked ${end.distanceTo(start).toFixed(1)}m, lowest y ${maxFall.toFixed(1)}`);
  if (maxFall < -50) bad(`${id}: player fell out of the world (y ${maxFall.toFixed(0)})`);
  if (stuckFor > frames * 0.5) warn(`${id}: player was immobile for ${(stuckFor / 60).toFixed(0)}s — possibly wedged`);
  if (roundMode) note(`phases seen: ${[...phases].join(' -> ')}`);
  if (roundMode && !phases.has('hide')) warn(`${id}: never reached the hide phase in ${seconds}s`);

  // Pause / resume / back to menu must all work.
  key('Escape'); await settle(4);
  if (game.state !== 'pause') warn(`${id}: Escape did not pause (state=${game.state})`);
  key('Escape'); await settle(4);
  if (game.state !== 'play') warn(`${id}: Escape did not resume (state=${game.state})`);

  game.toMenu(); await settle(10);
  if (game.state !== 'menu') bad(`${id}: could not return to the menu (state=${game.state})`);

  console.log(problems.length === before ? C.g(`   ${id}: clean`) : C.r(`   ${id}: ${problems.length - before} problem(s)`));
}

finish();

function finish() {
  console.log(C.b('\n=== SUMMARY ==='));
  console.log(`gl: ${gl.__stats.programs} programs, ${gl.__stats.textures} textures, ${gl.__stats.draws} draws`);
  console.log(`audio: ${audioCalls.osc} oscillators, ${audioCalls.buffers} buffers`);
  console.log(problems.length ? C.r(`${problems.length} problem(s)`) : C.g('no problems found'));
  console.log(warnings.length ? C.y(`${warnings.length} warning(s)`) : C.d('no warnings'));
  process.exit(problems.length ? 1 : 0);
}
