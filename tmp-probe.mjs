import { installDOM } from './tools/dom-stub.mjs';
installDOM();
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
THREE.ImageLoader.prototype.load = function (url, onLoad) { const i = { width: 1, height: 1, src: url }; onLoad?.(i); return i; };
THREE.TextureLoader.prototype.load = function (url, onLoad) { const t = new THREE.Texture(); t.name = String(url).split('/').pop(); onLoad?.(t); return t; };
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
const f = 'assets/models/monster/monster.fbx';
const buf = readFileSync(f);
const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'assets/models/monster/');
obj.updateMatrixWorld(true);
const bones = [];
obj.traverse(o => { if (o.isBone) bones.push(o); });
console.log('bone names:', bones.map(b=>b.name).join(', '));
console.log('root children:', obj.children.map(c=>`${c.name}[${c.type}]`).join(', '));
for (const b of bones) {
  const w = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  console.log(`  ${b.name.padEnd(28)} ${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}`);
}
let sm=null; obj.traverse(o=>{ if(o.isSkinnedMesh) sm=o; });
console.log('skinnedmesh', sm.name, 'scale', sm.scale.toArray(), 'pos', sm.position.toArray());
const g = sm.geometry; g.computeBoundingBox();
console.log('geom bbox', g.boundingBox.min.toArray().map(n=>n.toFixed(1)), g.boundingBox.max.toArray().map(n=>n.toFixed(1)));
console.log('groups', JSON.stringify(g.groups));
console.log('materials', (Array.isArray(sm.material)?sm.material:[sm.material]).map(m=>`${m.name}:${m.type} col=${m.color?.getHexString()} emis=${m.emissive?.getHexString()} map=${!!m.map}`));
