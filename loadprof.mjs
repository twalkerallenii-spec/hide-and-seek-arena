// Time every phase of a cold boot + arena load, so the next optimisation goes
// where the time is instead of where I assume it is.
import { installDOM } from './tools/dom-stub.mjs';
installDOM();
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
const ROOT = new URL('.', import.meta.url).pathname;
THREE.FileLoader.prototype.load=function(u,ok,_p,e){try{const p=String(u).replace(/^file:\/\//,'').replace(/^.*\/assets\//,ROOT+'assets/');const b=readFileSync(p);ok(this.responseType==='arraybuffer'?b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength):b.toString());}catch(x){e?.(x);}return{};};
THREE.ImageLoader.prototype.load=(u,cb)=>{const i={width:1,height:1};cb?.(i);return i;};
THREE.TextureLoader.prototype.load=(u,cb)=>{const t=new THREE.Texture();cb?.(t);return t;};
globalThis.fetch = async (u) => {
  const p = String(u).replace(/^.*\/assets\//, ROOT + 'assets/');
  const b = readFileSync(p);
  return { ok: true, status: 200, json: async () => JSON.parse(b.toString()) };
};

const T = [];
const mark = (label, ms) => { T.push([label, ms]); };
async function time(label, fn) { const t = Date.now(); const r = await fn(); mark(label, Date.now() - t); return r; }

const { World } = await import('./src/engine/world.js');
const { FirstPersonController } = await import('./src/engine/controller.js');
const fake = { roomEnv: null, quality: 'medium', setGrade(){}, setDamage(){}, camera: new THREE.PerspectiveCamera() };

const id = process.argv[2] || 'backrooms';
const FILES = { backrooms:'a01_backrooms.js', bazaar:'a11_bazaar.js', forge:'a09_forge.js', abbadon:'a10_abbadon.js' };

const world = new World(fake);
const ctl = new FirstPersonController(fake.camera, { requestPointerLock(){} });

const mod = await time('import arena module', () => import(`./src/arenas/${FILES[id]}`));
await time('world.load (geometry+textures)', () => world.load(mod.meta, mod.build, 'medium'));
await time('buildCollision (octree)', async () => ctl.buildCollision(world.root));

const { ProximityGrid } = await import('./src/engine/proximity.js');
const grid = new ProximityGrid({ cell: 24, radius: 90 });
await time('proximity.build', async () => grid.build(world.root));

const { Monster } = await import('./src/game/monster.js');
const m = new Monster(new THREE.Scene());
await time('monster.load (FBX)', () => m.load());

const { preloadAvatars } = await import('./src/game/avatar.js');
await time('preloadAvatars (3 chars + clips)', () => preloadAvatars(3));

const { Avatar } = await import('./src/game/avatar.js');
await time('instance 10 crowd avatars', async () => {
  const sc = new THREE.Scene();
  await Promise.all(Array.from({length:10}, (_,i) => new Avatar(sc, ['Rogue','Knight','Mage'][i%3]).load()));
});

const total = T.reduce((s,[,ms]) => s+ms, 0);
console.log(`\nARENA ${id} — total ${total} ms (this box is ~25x slower than a laptop)\n`);
for (const [k, ms] of T.sort((a,b)=>b[1]-a[1])) {
  const pct = (ms/total*100).toFixed(0);
  console.log(`  ${String(ms).padStart(7)} ms  ${pct.padStart(3)}%  ${'#'.repeat(Math.round(ms/total*40))} ${k}`);
}
console.log(`\n  ~${(total/25/1000).toFixed(1)}s equivalent on real hardware`);
