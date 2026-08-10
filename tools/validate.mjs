#!/usr/bin/env node
// Headless arena validator.
//
//   node tools/validate.mjs            every arena
//   node tools/validate.mjs backrooms  one (comma-separate for several)
//
// Runs the REAL engine under Node with a canvas shim: builds each arena, walks
// the resulting scene graph, bakes the collision octree, drops a player capsule
// at the spawn point and simulates until it lands. Catches the class of bug you
// otherwise only find by walking around for ten minutes.

import { installDOM } from './dom-stub.mjs';
installDOM();

import * as THREE from 'three';
import { World } from '../src/engine/world.js';
import { FirstPersonController } from '../src/engine/controller.js';
import { ARENA_LIST } from '../src/arenas/index.js';

const C = {
  g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, d: s => `\x1b[90m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`, c: s => `\x1b[36m${s}\x1b[0m`,
};

// The World only touches renderer.roomEnv and renderer.setGrade during a build.
const fakeRenderer = {
  roomEnv: null,
  quality: 'medium',
  setGrade() { },
  setDamage() { },
  camera: new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 900),
};

function sceneStats(root) {
  let meshes = 0, tris = 0, instances = 0, lights = 0, shadowLights = 0, dirLights = 0;
  let collideMeshes = 0, collideTris = 0, emissive = 0;
  const materials = new Set();
  const textures = new Set();
  root.traverse(o => {
    if (o.isLight) {
      lights++;
      if (o.castShadow) shadowLights++;
      if (o.isDirectionalLight) dirLights++;
    }
    if (!o.isMesh && !o.isInstancedMesh) return;
    meshes++;
    const g = o.geometry;
    const n = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count || 0) / 3;
    const mult = o.isInstancedMesh ? o.count : 1;
    if (o.isInstancedMesh) instances += o.count;
    tris += n * mult;
    if (o.userData.collide === true) { collideMeshes++; collideTris += n; }
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      materials.add(m.uuid);
      if (m.emissiveIntensity > 0.5 && m.emissive && m.emissive.getHex() !== 0) emissive++;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) {
        if (m[k]) textures.add(m[k].uuid);
      }
    }
  });
  return {
    meshes, tris: Math.round(tris), instances, lights, shadowLights, dirLights,
    collideMeshes, collideTris: Math.round(collideTris),
    materials: materials.size, textures: textures.size, emissive,
  };
}

async function validate(id, world, controller) {
  const r = { id, errors: [], warnings: [], notes: [] };
  const t0 = Date.now();

  let mod;
  try {
    mod = await import(`../src/arenas/${fileFor(id)}`);
  } catch (e) {
    r.errors.push('IMPORT FAILED: ' + String(e.message || e).split('\n')[0]);
    r.ok = false;
    return r;
  }

  if (!mod.meta) { r.errors.push('no `meta` export'); r.ok = false; return r; }
  if (typeof mod.build !== 'function') { r.errors.push('no `build` export'); r.ok = false; return r; }

  const meta = mod.meta;
  r.name = meta.name;

  // ---- meta contract -------------------------------------------------------
  for (const k of ['id', 'name', 'spawn', 'bounds', 'difficulty']) {
    if (meta[k] === undefined) r.errors.push(`meta.${k} missing`);
  }
  if (meta.id !== id) r.warnings.push(`meta.id "${meta.id}" != registry id "${id}"`);
  if (!Array.isArray(meta.spawn) || meta.spawn.length !== 3 || meta.spawn.some(v => !Number.isFinite(v))) {
    r.errors.push('meta.spawn must be three finite numbers');
    r.ok = false;
    return r;
  }

  // ---- build ---------------------------------------------------------------
  try {
    await world.load(meta, mod.build, 'medium');
  } catch (e) {
    r.errors.push('BUILD THREW: ' + String(e.stack || e.message || e).split('\n').slice(0, 2).join(' | '));
    r.ok = false;
    return r;
  }
  r.buildMs = Date.now() - t0;

  // ---- scene ---------------------------------------------------------------
  r.scene = sceneStats(world.root);
  if (r.scene.meshes === 0) r.errors.push('arena produced no meshes');
  if (r.scene.shadowLights > 4) r.warnings.push(`${r.scene.shadowLights} shadow casters (budget 4)`);
  if (r.scene.dirLights > 1) r.warnings.push(`${r.scene.dirLights} directional lights (budget 1)`);
  if (r.scene.lights > 30) r.warnings.push(`${r.scene.lights} lights (budget ~24)`);
  if (r.scene.tris > 6_000_000) r.warnings.push(`${(r.scene.tris / 1e6).toFixed(1)}M triangles`);
  if (r.scene.collideTris > 25_000) r.warnings.push(`${r.scene.collideTris} collidable triangles — octree build may be slow`);
  // Distinct materials is the best proxy for draw calls we can measure without
  // a GL context: three cannot batch across materials.
  if (r.scene.materials > 400) r.warnings.push(`${r.scene.materials} distinct materials — likely ${r.scene.materials}+ draw calls, budget ~900 total`);
  if (r.scene.textures > 260) r.warnings.push(`${r.scene.textures} distinct textures — VRAM and build time risk`);

  // non-finite transforms are a classic silent killer (NaN propagates to all)
  let bad = 0;
  world.root.traverse(o => {
    const p = o.position, s = o.scale;
    if (!Number.isFinite(p.x + p.y + p.z + s.x + s.y + s.z)) bad++;
  });
  if (bad) r.errors.push(`${bad} objects have NaN/Infinity in position or scale`);

  // ---- gameplay contract ---------------------------------------------------
  const P = world.pickups;
  const n = (t) => P.filter(x => x.type === t).length;
  const powerups = P.filter(x => String(x.type).startsWith('powerup:'));
  r.pickups = { coins: n('coin'), batteries: n('battery'), powerups: powerups.length, pups: n('pup') };
  r.hides = world.hidingSpots.length;
  r.updates = world.updates.length;

  if (r.pickups.pups !== 1) r.errors.push(`expected exactly 1 pup, found ${r.pickups.pups}`);
  if (r.pickups.coins < 25) r.warnings.push(`${r.pickups.coins} coins (spec 25-45)`);
  if (r.pickups.batteries < 3) r.warnings.push(`${r.pickups.batteries} batteries (spec 3-6)`);
  if (powerups.length < 2) r.warnings.push(`${powerups.length} power-ups (spec 2-5)`);
  if (r.hides < 10) r.warnings.push(`${r.hides} hiding spots (spec 10+)`);
  if (r.updates === 0) r.warnings.push('no onUpdate callbacks — nothing in this arena moves');

  const KNOWN = ['ghost', 'dash', 'pulse', 'decoy', 'nightvision', 'silence', 'timefreeze', 'jumpjet'];
  for (const p of powerups) {
    const key = p.type.slice(8);
    if (!KNOWN.includes(key)) r.errors.push(`unknown power-up id "${key}"`);
  }
  for (const p of P) {
    if (!p.pos || !Number.isFinite(p.pos.x + p.pos.y + p.pos.z)) {
      r.errors.push('a pickup has a non-finite position'); break;
    }
  }
  if (!world.surfaceResolver) r.warnings.push('setSurface() never called — footsteps default to concrete');
  if (!world.scene.fog) r.warnings.push('no fog set');

  // ---- onUpdate crash test -------------------------------------------------
  const uerr = new Set();
  const rawUpdates = world.updates.slice();
  for (const fn of rawUpdates) {
    for (const [dt, el] of [[0.016, 0.016], [0.016, 3.2], [0.05, 61.7]]) {
      try { fn(dt, el); } catch (e) { uerr.add(String(e.message || e).slice(0, 120)); }
    }
  }
  if (uerr.size) r.errors.push('onUpdate threw: ' + [...uerr].slice(0, 2).join(' | '));

  // ---- collision -----------------------------------------------------------
  const t1 = Date.now();
  try {
    r.collisionMeshes = controller.buildCollision(world.root);
  } catch (e) {
    r.errors.push('octree build threw: ' + String(e.message || e).slice(0, 120));
    r.ok = false;
    return r;
  }
  r.collisionMs = Date.now() - t1;
  if (!r.collisionMeshes) r.errors.push('no collidable meshes — the player falls forever');
  if (r.collisionMs > 2500) r.warnings.push(`octree build ${r.collisionMs}ms`);

  // ---- spawn: embedded in geometry? ---------------------------------------
  controller.teleport(meta.spawn[0], meta.spawn[1], meta.spawn[2]);
  const stuck = controller.octree.capsuleIntersect(controller.collider.clone());
  if (stuck && stuck.depth > 0.3) {
    r.errors.push(`spawn embedded in geometry (${stuck.depth.toFixed(2)}m penetration)`);
  } else if (stuck && stuck.depth > 0.05) {
    r.warnings.push(`spawn touching geometry (${stuck.depth.toFixed(2)}m)`);
  }

  // ---- spawn: does the player land? ---------------------------------------
  controller.enabled = true;
  controller.frozen = false;
  controller.velocity.set(0, 0, 0);
  let landed = false, steps = 0;
  for (; steps < 600; steps++) {
    controller.update(1 / 60);
    if (controller.onGround) { landed = true; break; }
  }
  controller.enabled = false;
  const rest = controller.position;
  r.landed = landed;
  r.fell = +(meta.spawn[1] - rest.y).toFixed(2);
  if (!landed) {
    r.errors.push(`player never landed after 10s (y went ${meta.spawn[1]} -> ${rest.y.toFixed(1)})`);
  } else if (r.fell > 8) {
    r.warnings.push(`spawn is ${r.fell}m above the floor`);
  } else if (r.fell < -0.6) {
    r.warnings.push(`spawn pushed UP ${(-r.fell).toFixed(2)}m — probably inside a floor slab`);
  }

  // ---- can the player walk off the world from spawn? ----------------------
  // Fire eight capsule probes outward and check every one lands on something.
  let voids = 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const probe = controller.collider.clone();
    probe.translate(new THREE.Vector3(Math.cos(a) * 6, 0.4, Math.sin(a) * 6));
    let hit = false;
    for (let d = 0; d < 40; d++) {
      probe.translate(new THREE.Vector3(0, -0.5, 0));
      if (controller.octree.capsuleIntersect(probe)) { hit = true; break; }
    }
    if (!hit) voids++;
  }
  r.voidProbes = voids;
  if (voids >= 6) r.warnings.push(`${voids}/8 directions around spawn have no floor within 20m`);

  r.ok = r.errors.length === 0;
  return r;
}

const FILES = {
  backrooms: 'a01_backrooms.js', neonmetro: 'a02_neonmetro.js', cargoyard: 'a03_cargoyard.js',
  undercroft: 'a04_undercroft.js', aqueducts: 'a05_aqueducts.js', frostwatch: 'a06_frostwatch.js',
  orbital: 'a07_orbital.js', palisade: 'a08_palisade.js', forge: 'a09_forge.js',
  abbadon: 'a10_abbadon.js', bazaar: 'a11_bazaar.js', static: 'a12_static.js',
};
function fileFor(id) { return FILES[id] || `${id}.js`; }

(async () => {
  const arg = process.argv[2];
  const ids = arg && !arg.startsWith('-') ? arg.split(',') : ARENA_LIST.map(a => a.id);

  const world = new World(fakeRenderer);
  const controller = new FirstPersonController(fakeRenderer.camera, { requestPointerLock() { } });

  const all = [];
  for (const id of ids) {
    process.stdout.write(C.d(`  building ${id}…\r`));
    let r;
    try {
      r = await validate(id, world, controller);
    } catch (e) {
      r = { id, ok: false, errors: ['VALIDATOR CRASH: ' + String(e.stack || e).split('\n').slice(0, 2).join(' | ')] };
    }
    all.push(r);

    const head = r.ok ? C.g('PASS') : C.r('FAIL');
    const s = r.scene || {};
    console.log(`${head} ${C.b(String(r.id).padEnd(11))} ${String(r.name || '').padEnd(16)} ` + C.d(
      `${String(r.buildMs ?? '-').padStart(5)}ms ` +
      `${String(s.meshes ?? '-').padStart(5)}m ` +
      `${((s.tris ?? 0) / 1000).toFixed(0).padStart(5)}kt ` +
      `${String(s.materials ?? '-').padStart(3)}mat ` +
      `${String(s.textures ?? '-').padStart(3)}tex ` +
      `${String(s.lights ?? '-').padStart(3)}L/${s.shadowLights ?? '-'}S ` +
      `${String(r.collisionMeshes ?? '-').padStart(5)}col/${String(r.collisionMs ?? '-').padStart(4)}ms`));
    if (r.pickups) {
      console.log(C.d(`     ${r.pickups.coins}c ${r.pickups.batteries}b ${r.pickups.powerups}p ` +
        `${r.pickups.pups}pup ${r.hides}hide ${r.updates}anim  ` +
        `land:${r.landed ? C.g('yes') : C.r('NO')} drop:${r.fell}m void:${r.voidProbes}/8`));
    }
    for (const e of r.errors || []) console.log('     ' + C.r('x ') + e);
    for (const w of r.warnings || []) console.log('     ' + C.y('! ') + w);
  }

  const pass = all.filter(r => r.ok).length;
  console.log('');
  console.log(C.b(`${pass}/${all.length} arenas pass`) +
    C.d(`   (${all.reduce((n, r) => n + (r.warnings?.length || 0), 0)} warnings)`));
  process.exit(pass === all.length ? 0 : 1);
})();
