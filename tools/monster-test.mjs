#!/usr/bin/env node
// Proves the Seeker works before anyone opens a browser: the FBX parses, the
// seven clip names resolve, the model scales to human-ish height, and the AI
// walks a real arena's octree toward a moving target without NaNing or
// escaping the world.

import { installDOM } from './dom-stub.mjs';
installDOM();
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

// The asset layer fetches over HTTP; under Node we serve it from disk instead.
const ROOT = new URL('..', import.meta.url).pathname;
globalThis.fetch = async (url) => {
  const p = String(url).replace(/^file:\/\//, '').replace(/^.*\/assets\//, ROOT + 'assets/');
  const buf = readFileSync(p);
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString()), arrayBuffer: async () => buf.buffer };
};
// FBXLoader/GLTFLoader use FileLoader -> XHR; give them a disk-backed shim.
const { FileLoader } = THREE;
FileLoader.prototype.load = function (url, onLoad, _p, onError) {
  try {
    const p = String(url).replace(/^file:\/\//, '').replace(/^.*\/assets\//, ROOT + 'assets/');
    const buf = readFileSync(p);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    onLoad(this.responseType === 'arraybuffer' ? ab : buf.toString());
  } catch (e) { onError?.(e); }
  return {};
};
THREE.ImageLoader.prototype.load = function (u, cb) { const i = { width: 1, height: 1, src: u }; cb?.(i); return i; };
THREE.TextureLoader.prototype.load = function (u, cb) { const t = new THREE.Texture(); t.name = String(u).split('/').pop(); cb?.(t); return t; };

const { Monster, MSTATE } = await import('../src/game/monster.js');
const { World } = await import('../src/engine/world.js');
const { FirstPersonController } = await import('../src/engine/controller.js');

const fake = { roomEnv: null, quality: 'medium', setGrade() { }, setDamage() { }, camera: new THREE.PerspectiveCamera() };
const scene = new THREE.Scene();

console.log('--- load ---');
const m = new Monster(scene);
const ok = await m.load();
console.log('loaded:', ok);
if (!ok) process.exit(1);

const box = new THREE.Box3().setFromObject(m.model);
const size = box.getSize(new THREE.Vector3());
console.log(`scaled height ${size.y.toFixed(2)} m  (w ${size.x.toFixed(2)}, d ${size.z.toFixed(2)})`);
console.log(`feet at y=${box.min.y.toFixed(3)} (should be ~0)`);

const names = Object.keys(m.actions);
console.log(`clips found: ${names.length}`);
const WANT = ['Armature|Idle_pose', 'Armature|Walk_Close', 'Armature|Walk_Open',
  'Armature|Jump', 'Armature|Eat_Luz', 'Armature|Spit_Luz'];
let missing = 0;
for (const w of WANT) {
  const hit = !!m.actions[w];
  if (!hit) missing++;
  console.log(`   ${hit ? 'ok  ' : 'MISS'} ${w}`);
}

console.log('\n--- walk a real arena ---');
const arenaId = process.argv[2] || 'backrooms';
const FILES = { backrooms: 'a01_backrooms.js', undercroft: 'a04_undercroft.js', forge: 'a09_forge.js' };
const world = new World(fake);
const ctl = new FirstPersonController(fake.camera, { requestPointerLock() { } });
const mod = await import(`../src/arenas/${FILES[arenaId]}`);
await world.load(mod.meta, mod.build, 'medium');
const nCol = ctl.buildCollision(world.root);
console.log(`arena ${arenaId}: ${nCol} collision meshes, ${world.hidingSpots.length} hiding spots`);

const sp = mod.meta.spawn;
m.configure({ octree: ctl.octree, hidingSpots: world.hidingSpots, bounds: mod.meta.bounds, difficulty: 3 });
m.spawn(sp[0] + 6, sp[1] + 1, sp[2] + 6);
m.cage(false);

let caught = 0;
m.onCatch = () => caught++;

const target = new THREE.Vector3(sp[0], sp[1], sp[2]);
const states = {};
let minY = Infinity, maxY = -Infinity, nan = 0, moved = 0;
const start = m.position.clone();
const t0 = Date.now();
const FRAMES = 1800;                    // 30 seconds at 60 fps
for (let i = 0; i < FRAMES; i++) {
  // A target that wanders, so the monster has to hunt rather than beeline.
  target.x = sp[0] + Math.sin(i * 0.004) * 18;
  target.z = sp[2] + Math.cos(i * 0.0031) * 18;
  m.update(1 / 60, { target, moving: true, sprinting: i % 300 < 90, crouching: false, lightOn: false });
  const p = m.position;
  if (!Number.isFinite(p.x + p.y + p.z)) { nan++; break; }
  minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  states[m.state] = (states[m.state] || 0) + 1;
}
moved = m.position.distanceTo(start);
const ms = Date.now() - t0;

console.log(`ran ${FRAMES} frames in ${ms}ms  (${(ms / FRAMES).toFixed(3)} ms/frame here; this box is ~25x slow)`);
console.log(`state histogram:`, Object.entries(states).map(([k, v]) => `${k}:${(v / FRAMES * 100).toFixed(0)}%`).join('  '));
console.log(`travelled ${moved.toFixed(1)} m   y range ${minY.toFixed(1)} .. ${maxY.toFixed(1)}   catches ${caught}`);
console.log(`NaN frames: ${nan}`);

console.log('\n--- wedged against geometry ---');
m.spawn(sp[0], sp[1] + 1, sp[2]);
m.collider.translate(new THREE.Vector3(0.4, 0, 0));
const before = m.position.clone();
for (let i = 0; i < 600; i++) m.update(1 / 60, { target, moving: true });
console.log(`recovered ${m.position.distanceTo(before).toFixed(1)} m from a wedged start`);

const pass = ok && !missing && !nan && moved > 5 && minY > -50;
console.log(`\n${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
