import { installDOM } from '/home/camusxconnor/hide-and-seek-arena/tools/dom-stub.mjs';
installDOM();
import * as THREE from 'three';
import { World } from '/home/camusxconnor/hide-and-seek-arena/src/engine/world.js';
import { FirstPersonController } from '/home/camusxconnor/hide-and-seek-arena/src/engine/controller.js';

const fake = { roomEnv: null, quality: 'medium', setGrade(){}, setDamage(){},
  camera: new THREE.PerspectiveCamera(75, 16/9, 0.05, 900) };

const id = process.argv[2] || 'backrooms';
const FILES = { backrooms:'a01_backrooms.js', neonmetro:'a02_neonmetro.js', undercroft:'a04_undercroft.js', abbadon:'a10_abbadon.js' };

const world = new World(fake);
const ctl = new FirstPersonController(fake.camera, { requestPointerLock(){} });
const mod = await import(`/home/camusxconnor/hide-and-seek-arena/src/arenas/${FILES[id]}`);
await world.load(mod.meta, mod.build, 'medium');

// --- triangle area histogram over the collision set -----------------------
const areas = [];
const box = new THREE.Box3();
world.root.updateMatrixWorld(true);
world.root.traverse(o => {
  if (!o.isMesh || o.isInstancedMesh || o.userData.collide !== true) return;
  const g = o.geometry, pos = g.attributes.position;
  const idx = g.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = idx ? idx.count : pos.count;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i+1) : i+1, i2 = idx ? idx.getX(i+2) : i+2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
    b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
    c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
    areas.push(new THREE.Triangle(a,b,c).getArea());
    box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  }
});
areas.sort((x,y)=>y-x);
const total = areas.reduce((s,v)=>s+v,0);
const size = box.getSize(new THREE.Vector3());
console.log(`${id}: ${areas.length} collision triangles, world box ${size.x.toFixed(0)}x${size.y.toFixed(0)}x${size.z.toFixed(0)} m`);
console.log(`  total area ${total.toFixed(0)} m2   largest: ${areas.slice(0,8).map(v=>v.toFixed(0)).join(', ')}`);
const big = areas.filter(v => v > 200).length;
const huge = areas.filter(v => v > 2000).length;
console.log(`  ${big} triangles > 200 m2, ${huge} > 2000 m2`);

// --- build the octree and measure it ---------------------------------------
let t0 = Date.now();
const n = ctl.buildCollision(world.root);
const buildMs = Date.now() - t0;

function walk(tree, depth = 0, acc = { nodes: 0, refs: 0, maxDepth: 0, leaves: 0 }) {
  acc.nodes++;
  acc.maxDepth = Math.max(acc.maxDepth, depth);
  acc.refs += tree.triangles.length;
  if (!tree.subTrees.length) acc.leaves++;
  for (const s of tree.subTrees) walk(s, depth + 1, acc);
  return acc;
}
const st = walk(ctl.octree);
console.log(`  octree: built in ${buildMs}ms, ${st.nodes} nodes, ${st.leaves} leaves, depth ${st.maxDepth}, ${st.refs} triangle refs`);
console.log(`  duplication factor: ${(st.refs / areas.length).toFixed(1)}x`);

// --- query cost -------------------------------------------------------------
const sp = mod.meta.spawn;
ctl.teleport(sp[0], sp[1], sp[2]);
const N = 200;
t0 = Date.now();
for (let i = 0; i < N; i++) {
  ctl.collider.translate(new THREE.Vector3(0.001, 0, 0));
  ctl.octree.capsuleIntersect(ctl.collider);
}
const per = (Date.now() - t0) / N;
console.log(`  capsuleIntersect: ${per.toFixed(2)} ms/query  -> ~${(per * 6).toFixed(1)} ms/frame at 6 queries`);
