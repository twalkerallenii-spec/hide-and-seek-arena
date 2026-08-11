#!/usr/bin/env node
// Inspect an FBX/GLB/GLTF file headlessly: bounds, mesh/tri/bone counts,
// materials, textures and animation clips. Lets us plan asset integration
// without a browser.
//
//   node tools/asset-inspect.mjs <file> [...more]

import { installDOM } from './dom-stub.mjs';
installDOM();
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { basename, extname, dirname } from 'node:path';

// Loaders reach for images; stub them so parsing never stalls on I/O.
THREE.ImageLoader.prototype.load = function (url, onLoad) {
  const i = { width: 1, height: 1, src: url };
  onLoad?.(i);
  return i;
};
THREE.TextureLoader.prototype.load = function (url, onLoad) {
  const t = new THREE.Texture();
  t.name = String(url).split('/').pop();
  onLoad?.(t);
  return t;
};

const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

async function parse(file) {
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const ext = extname(file).toLowerCase();
  if (ext === '.fbx') return new FBXLoader().parse(ab, dirname(file) + '/');
  const gltf = await new Promise((res, rej) =>
    new GLTFLoader().parse(ab, dirname(file) + '/', res, rej));
  const root = gltf.scene;
  root.animations = gltf.animations || [];
  return root;
}

for (const file of process.argv.slice(2)) {
  console.log('\n' + basename(file));
  let obj;
  try { obj = await parse(file); }
  catch (e) { console.log('  PARSE FAILED: ' + (e.message || e)); continue; }

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  console.log(`  bounds ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}` +
    `   (y ${box.min.y.toFixed(2)} .. ${box.max.y.toFixed(2)})`);

  let meshes = 0, skinned = 0, tris = 0, bones = 0;
  const mats = new Set(), texs = new Set();
  obj.traverse(o => {
    if (o.isBone) bones++;
    if (!o.isMesh && !o.isSkinnedMesh) return;
    meshes++;
    if (o.isSkinnedMesh) skinned++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      mats.add(m.name || m.type);
      for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (m[k]) texs.add(`${k}=${m[k].name || '(embedded)'}`);
      }
    }
  });
  console.log(`  meshes ${meshes} (skinned ${skinned})  tris ${Math.round(tris)}  bones ${bones}`);
  console.log(`  materials: ${[...mats].join(', ').slice(0, 200) || '(none)'}`);
  console.log(`  textures : ${[...texs].join(', ').slice(0, 240) || '(none)'}`);
  const clips = obj.animations || [];
  console.log(`  animations: ${clips.length}`);
  for (const c of clips.slice(0, 40)) {
    console.log(`     ${c.duration.toFixed(2).padStart(6)}s  ${String(c.tracks.length).padStart(3)} tracks  "${c.name}"`);
  }
}
