// Find materials whose texture slots hold something that is not a Texture.
// three reads `texture.matrix` when refreshing transform uniforms, so a Promise
// or a plain object in a map slot throws deep inside the renderer with no clue
// as to which material caused it.
import { installDOM } from './dom-stub.mjs';
installDOM();
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
THREE.FileLoader.prototype.load=function(u,ok,_p,e){try{const p=String(u).replace(/^file:\/\//,'').replace(/^.*\/assets\//,ROOT+'assets/');const b=readFileSync(p);ok(this.responseType==='arraybuffer'?b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength):b.toString());}catch(x){e?.(x);}return{};};
THREE.ImageLoader.prototype.load=(u,cb)=>{const i={width:1,height:1};cb?.(i);return i;};
THREE.TextureLoader.prototype.load=(u,cb)=>{const t=new THREE.Texture();cb?.(t);return t;};
globalThis.fetch=async(u)=>{const p=String(u).replace(/^.*\/assets\//,ROOT+'assets/');const b=readFileSync(p);return{ok:true,status:200,json:async()=>JSON.parse(b.toString())};};

const { World } = await import('../src/engine/world.js');
const fake={roomEnv:null,quality:'medium',setGrade(){},setDamage(){},camera:new THREE.PerspectiveCamera()};
const FILES={backrooms:'a01_backrooms.js',neonmetro:'a02_neonmetro.js',cargoyard:'a03_cargoyard.js',
 undercroft:'a04_undercroft.js',aqueducts:'a05_aqueducts.js',frostwatch:'a06_frostwatch.js',
 orbital:'a07_orbital.js',palisade:'a08_palisade.js',forge:'a09_forge.js',abbadon:'a10_abbadon.js',
 bazaar:'a11_bazaar.js',static:'a12_static.js'};

const SLOTS=['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','alphaMap',
             'bumpMap','displacementMap','envMap','lightMap','specularMap','clearcoatMap',
             'transmissionMap','thicknessMap','sheenColorMap','iridescenceMap'];

const ids = process.argv[2] ? process.argv[2].split(',') : Object.keys(FILES);
let total = 0;
for (const id of ids) {
  const world = new World(fake);
  const mod = await import(`../src/arenas/${FILES[id]}`);
  await world.load(mod.meta, mod.build, 'medium');
  const bad = [];
  const seen = new Set();
  world.root.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isSprite && !o.isPoints) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      for (const slot of SLOTS) {
        const t = m[slot];
        if (t == null) continue;
        if (t.isTexture) continue;
        bad.push(`${o.name || o.type} · ${m.type}${m.name ? '("' + m.name + '")' : ''} · ${slot} = ${
          t instanceof Promise ? 'Promise (un-awaited!)' : Object.prototype.toString.call(t)}`);
      }
    }
  });
  total += bad.length;
  console.log(`${bad.length ? 'BAD ' : 'ok  '} ${id.padEnd(11)} ${bad.length} bad texture slot(s)`);
  for (const b of bad.slice(0, 6)) console.log('       ' + b);
}
console.log(total ? `\nFAIL — ${total} bad slots` : '\nPASS — every texture slot holds a real Texture');
process.exit(total ? 1 : 0);
