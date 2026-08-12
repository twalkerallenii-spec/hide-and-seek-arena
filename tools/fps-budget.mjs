#!/usr/bin/env node
// Frame-budget estimator.
//
// We cannot run WebGL here, so this does the next best thing: it builds each
// arena for real, then models the per-frame cost from what the scene graph
// actually contains. The model is crude in absolute terms but honest in
// relative terms, which is what you need to answer "which arena will chug?".

import { installDOM } from './dom-stub.mjs';
installDOM();

import * as THREE from 'three';
import { World } from '../src/engine/world.js';
import { ARENA_LIST } from '../src/arenas/index.js';

const FILES = {
  backrooms: 'a01_backrooms.js', neonmetro: 'a02_neonmetro.js', cargoyard: 'a03_cargoyard.js',
  undercroft: 'a04_undercroft.js', aqueducts: 'a05_aqueducts.js', frostwatch: 'a06_frostwatch.js',
  orbital: 'a07_orbital.js', palisade: 'a08_palisade.js', forge: 'a09_forge.js',
  abbadon: 'a10_abbadon.js', bazaar: 'a11_bazaar.js', static: 'a12_static.js',
};

const C = {
  g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, d: s => `\x1b[90m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`,
};

const fakeRenderer = {
  roomEnv: null, quality: 'medium',
  setGrade() { }, setDamage() { },
  camera: new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 900),
};

function analyse(root) {
  const mats = new Map();          // uuid -> { count, transparent, isPhysical }
  let opaque = 0, transparent = 0, instanced = 0, tris = 0, shadowCasters = 0;
  let shadowLights = 0, lights = 0, physical = 0, bigTextures = 0;
  const textures = new Set();

  root.traverse(o => {
    if (o.isLight) { lights++; if (o.castShadow) shadowLights++; return; }
    if (!o.isMesh && !o.isInstancedMesh) return;

    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m) continue;
      const rec = mats.get(m.uuid) || { count: 0, transparent: !!m.transparent, physical: !!m.isMeshPhysicalMaterial };
      rec.count++;
      mats.set(m.uuid, rec);
      if (m.isMeshPhysicalMaterial) physical++;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) {
        const t = m[k];
        if (!t) continue;
        textures.add(t.uuid);
        const w = t.image?.width || 0;
        if (w >= 512) bigTextures++;
      }
      if (m.transparent) transparent++; else opaque++;
    }
    if (o.castShadow) shadowCasters++;
    if (o.isInstancedMesh) instanced++;
    const g = o.geometry;
    const n = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count || 0) / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
  });

  // Draw calls: three batches nothing, so it is one call per mesh, and each
  // shadow-casting light re-draws every shadow caster into its map.
  const baseCalls = opaque + transparent;
  const shadowCalls = shadowLights * shadowCasters;

  return {
    materials: mats.size, textures: textures.size, bigTextures,
    opaque, transparent, instanced, physical,
    tris: Math.round(tris), lights, shadowLights, shadowCasters,
    baseCalls, shadowCalls, totalCalls: baseCalls + shadowCalls,
  };
}

/** Very rough ms/frame at 1080p on a mid-range laptop GPU. */
function estimate(a) {
  const ms =
    a.totalCalls * 0.012 +            // CPU-side draw submission
    (a.tris / 1e6) * 1.6 +            // vertex throughput
    a.transparent * 0.02 +            // overdraw / sorting
    a.physical * 0.10 +               // transmission is expensive
    a.shadowLights * 0.9 +            // shadow map passes
    4.2;                              // fixed post chain: SSAO + bloom + grade + SMAA
  return ms;
}

(async () => {
  const arg = process.argv[2];
  const ids = arg && !arg.startsWith('-') ? arg.split(',') : ARENA_LIST.map(a => a.id);
  const world = new World(fakeRenderer);
  const rows = [];

  for (const id of ids) {
    process.stdout.write(C.d(`  building ${id}…\r`));
    let a;
    try {
      const mod = await import(`../src/arenas/${FILES[id]}`);
      await world.load(mod.meta, mod.build, 'medium');
      a = analyse(world.root);
    } catch (e) {
      console.log(C.r(`FAIL ${id}: ${String(e.message || e).slice(0, 110)}`));
      continue;
    }
    const cap = world.shadowCap;
    const ms = estimate(a);
    const fps = 1000 / ms;
    rows.push({ id, ...a, ms, fps });

    const tag = fps >= 60 ? C.g('  OK  ') : fps >= 40 ? C.y(' TIGHT') : C.r(' HEAVY');
    console.log(`${tag} ${C.b(id.padEnd(11))} ` + C.d(
      `${String(a.totalCalls).padStart(5)} calls (${String(a.baseCalls).padStart(4)}+${String(a.shadowCalls).padStart(4)} shadow)  ` +
      `${((a.tris) / 1000).toFixed(0).padStart(5)}kt  ` +
      `${String(a.materials).padStart(4)}mat  ${String(a.transparent).padStart(3)}tr  ` +
      `${String(a.physical).padStart(2)}phys  ${a.shadowLights}S x ${a.shadowCasters}casters  ` +
      `~${ms.toFixed(1)}ms  ~${fps.toFixed(0)}fps`));

    const warn = [];
    if (a.totalCalls > 1200) warn.push(`${a.totalCalls} draw calls — budget ~900`);
    if (a.shadowCasters > 900 && a.shadowLights > 1) {
      warn.push(`${a.shadowCasters} shadow casters x ${a.shadowLights} lights = ${a.shadowCalls} extra calls`);
    }
    if (a.materials > 400) warn.push(`${a.materials} materials — nothing can batch`);
    if (a.physical > 12) warn.push(`${a.physical} MeshPhysicalMaterial meshes — transmission is a full extra pass`);
    if (a.tris > 1.5e6) warn.push(`${(a.tris / 1e6).toFixed(1)}M triangles`);
    if (cap?.dropped) console.log(C.d(`       shadow cap: kept ${cap.total - cap.dropped} of ${cap.total} casters`));
    for (const w of warn) console.log('       ' + C.y('! ') + w);
  }

  rows.sort((x, y) => x.fps - y.fps);
  console.log('\n' + C.b('slowest first:'));
  for (const r of rows.slice(0, 5)) {
    console.log(C.d(`  ${r.id.padEnd(11)} ~${r.fps.toFixed(0)}fps   ` +
      `biggest cost: ${r.shadowCalls > r.baseCalls ? 'shadow passes' : r.totalCalls > 900 ? 'draw calls' : 'post chain'}`));
  }
  console.log(C.d('\nEstimates only — no GL context here. Treat the ordering as real and the absolute numbers as indicative.'));
})();
