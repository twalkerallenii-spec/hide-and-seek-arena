// Shared prop library.
//
// Every builder returns a THREE.Object3D positioned with its ORIGIN AT THE BASE
// CENTRE (so `obj.position.y = groundY` just works) unless noted. Anything solid
// is tagged `userData.collide = true`; the world walks the tree at build time and
// feeds those meshes to the collision octree.
//
// Geometry is aggressively shared: the same crate requested twice reuses one
// BufferGeometry. Prefer `scatter()` for anything appearing more than ~30 times.

import * as THREE from 'three';
import { mat } from './materials.js';
import { makeRNG } from './rng.js';

const GEO = new Map();
function geo(key, make) {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
}

export const COLLIDE = (o) => { o.traverse(c => { if (c.isMesh) c.userData.collide = true; }); return o; };
export const NOCOLLIDE = (o) => { o.traverse(c => { if (c.isMesh) c.userData.collide = false; }); return o; };

function mesh(g, m, { collide = true, shadow = true, receive = true, name } = {}) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  o.receiveShadow = receive;
  o.userData.collide = collide;
  if (name) o.name = name;
  return o;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Axis-aligned box, origin at base centre. */
export function box(w, h, d, material, opts = {}) {
  const g = geo(`box:${w}:${h}:${d}:${opts.segs || 1}`, () =>
    new THREE.BoxGeometry(w, h, d, opts.segs || 1, opts.segs || 1, opts.segs || 1));
  const m = mesh(g, material, opts);
  m.position.y = h / 2;
  const wrap = new THREE.Group();
  wrap.add(m);
  wrap.userData.size = [w, h, d];
  return wrap;
}

/** Box whose origin is its own centre — for walls you place by centre. */
export function boxC(w, h, d, material, opts = {}) {
  const g = geo(`box:${w}:${h}:${d}:1`, () => new THREE.BoxGeometry(w, h, d));
  return mesh(g, material, opts);
}

export function cyl(rTop, rBot, h, material, opts = {}) {
  const seg = opts.seg ?? 20;
  const g = geo(`cyl:${rTop}:${rBot}:${h}:${seg}:${!!opts.open}`, () =>
    new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!opts.open));
  const m = mesh(g, material, opts);
  m.position.y = h / 2;
  const wrap = new THREE.Group();
  wrap.add(m);
  return wrap;
}

export function sphere(r, material, opts = {}) {
  const seg = opts.seg ?? 24;
  const g = geo(`sph:${r}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)));
  const m = mesh(g, material, opts);
  m.position.y = r;
  const wrap = new THREE.Group();
  wrap.add(m);
  return wrap;
}

/** Flat plane lying in XZ. Origin at centre. */
export function ground(w, d, material, opts = {}) {
  const segs = opts.segs ?? 1;
  const g = new THREE.PlaneGeometry(w, d, segs, segs);
  g.rotateX(-Math.PI / 2);
  const m = mesh(g, material, { collide: opts.collide ?? true, shadow: false, receive: true });
  return m;
}

/** Vertical wall plane facing +Z. Origin at base centre. */
export function wallPlane(w, h, material, opts = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  const m = mesh(g, material, { collide: opts.collide ?? true, shadow: opts.shadow ?? true });
  m.position.y = h / 2;
  const wrap = new THREE.Group();
  wrap.add(m);
  return wrap;
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

/**
 * A solid wall segment between two XZ points.
 * @returns Group with origin at world origin (mesh placed absolutely).
 */
export function wallBetween(x1, z1, x2, z2, h, thickness, material) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const m = boxC(len, h, thickness, material);
  m.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
  m.rotation.y = -Math.atan2(dz, dx);
  return m;
}

/**
 * Four walls around a rectangular room, with optional door gaps.
 * @param {object} o { w, d, h, thickness, material, doors:[{side:'n'|'s'|'e'|'w', at:0..1, width}] }
 */
export function roomShell(o) {
  const { w, d, h = 4, thickness = 0.35, material } = o;
  const doors = o.doors ?? [];
  const g = new THREE.Group();
  const sides = [
    { k: 'n', a: [-w / 2, -d / 2], b: [w / 2, -d / 2] },
    { k: 's', a: [-w / 2, d / 2], b: [w / 2, d / 2] },
    { k: 'w', a: [-w / 2, -d / 2], b: [-w / 2, d / 2] },
    { k: 'e', a: [w / 2, -d / 2], b: [w / 2, d / 2] },
  ];
  for (const s of sides) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const cuts = doors.filter(x => x.side === s.k)
      .map(x => ({ c: (x.at ?? 0.5) * len, w: x.width ?? 1.6, top: x.top ?? h }))
      .sort((p, q) => p.c - q.c);
    let cursor = 0;
    const lerp = (t) => [s.a[0] + (s.b[0] - s.a[0]) * (t / len), s.a[1] + (s.b[1] - s.a[1]) * (t / len)];
    for (const cut of cuts) {
      const lo = Math.max(0, cut.c - cut.w / 2), hi = Math.min(len, cut.c + cut.w / 2);
      if (lo > cursor) { const p = lerp(cursor), q = lerp(lo); g.add(wallBetween(p[0], p[1], q[0], q[1], h, thickness, material)); }
      // lintel above the opening
      if (cut.top < h) {
        const p = lerp(lo), q = lerp(hi);
        const lint = wallBetween(p[0], p[1], q[0], q[1], h - cut.top, thickness, material);
        lint.position.y = cut.top + (h - cut.top) / 2;
        g.add(lint);
      }
      cursor = hi;
    }
    if (cursor < len) { const p = lerp(cursor), q = lerp(len); g.add(wallBetween(p[0], p[1], q[0], q[1], h, thickness, material)); }
  }
  return g;
}

/** Flat ceiling slab. Origin at room centre, sits at height h. */
export function ceiling(w, d, h, material, thickness = 0.25) {
  const m = boxC(w, thickness, d, material, { shadow: false });
  m.position.y = h + thickness / 2;
  return m;
}

/** Straight run of stairs from (0,0,0) going +Z and up. */
export function stairs(steps, stepW, stepH, stepD, material) {
  const g = new THREE.Group();
  for (let i = 0; i < steps; i++) {
    const s = boxC(stepW, stepH, stepD, material);
    s.position.set(0, stepH / 2 + i * stepH, stepD / 2 + i * stepD);
    g.add(s);
  }
  g.userData.rise = steps * stepH;
  g.userData.run = steps * stepD;
  return g;
}

/** Handrail along +X of given length. */
export function railing(length, height, material, opts = {}) {
  const g = new THREE.Group();
  const postEvery = opts.postEvery ?? 1.6;
  const n = Math.max(2, Math.round(length / postEvery));
  const railM = material;
  for (let i = 0; i <= n; i++) {
    const p = cyl(0.035, 0.035, height, railM, { seg: 8, collide: false });
    p.position.set(-length / 2 + (length * i) / n, 0, 0);
    g.add(p);
  }
  const top = boxC(length, 0.07, 0.07, railM, { collide: true });
  top.position.y = height;
  g.add(top);
  const mid = boxC(length, 0.04, 0.04, railM, { collide: false });
  mid.position.y = height * 0.55;
  g.add(mid);
  return g;
}

/** Door in a frame. Swings on `group.userData.open(t)` if you want to animate. */
export function door(w = 1.0, h = 2.1, material, frameMat) {
  const g = new THREE.Group();
  const jambT = 0.09;
  const fm = frameMat ?? material;
  const l = boxC(jambT, h + jambT, 0.16, fm); l.position.set(-w / 2 - jambT / 2, (h + jambT) / 2, 0); g.add(l);
  const r = boxC(jambT, h + jambT, 0.16, fm); r.position.set(w / 2 + jambT / 2, (h + jambT) / 2, 0); g.add(r);
  const t = boxC(w + jambT * 2, jambT, 0.16, fm); t.position.set(0, h + jambT / 2, 0); g.add(t);
  const pivot = new THREE.Group();
  pivot.position.set(-w / 2, 0, 0);
  const leaf = boxC(w, h, 0.05, material); leaf.position.set(w / 2, h / 2, 0); pivot.add(leaf);
  const knob = sphere(0.045, mat.metal(0xb9a06a, 0.25), { collide: false, seg: 12 });
  knob.position.set(w - 0.12, h * 0.48, 0.06); pivot.add(knob);
  g.add(pivot);
  g.userData.open = (t01) => { pivot.rotation.y = -t01 * Math.PI * 0.55; };
  return g;
}

/** Window opening with a pane. Origin at base centre of the opening. */
export function window_(w = 1.4, h = 1.2, sill = 1.0, frameMat, paneMat) {
  const g = new THREE.Group();
  const t = 0.08;
  const fm = frameMat ?? mat.solid({ color: 0x4a4744, roughness: 0.7 });
  const pm = paneMat ?? mat.glassCheap({ opacity: 0.22 });
  const l = boxC(t, h, 0.14, fm); l.position.set(-w / 2, sill + h / 2, 0); g.add(l);
  const r = boxC(t, h, 0.14, fm); r.position.set(w / 2, sill + h / 2, 0); g.add(r);
  const b = boxC(w, t, 0.16, fm); b.position.set(0, sill, 0); g.add(b);
  const tp = boxC(w, t, 0.16, fm); tp.position.set(0, sill + h, 0); g.add(tp);
  const mull = boxC(0.05, h, 0.08, fm); mull.position.set(0, sill + h / 2, 0); mull.userData.collide = false; g.add(mull);
  const pane = boxC(w - t, h - t, 0.02, pm, { collide: false, shadow: false });
  pane.position.set(0, sill + h / 2, 0);
  g.add(pane);
  return g;
}

/** Structural column with a base and capital. */
export function column(h, r, material, opts = {}) {
  const g = new THREE.Group();
  const shaft = cyl(r, r * 1.06, h, material, { seg: opts.seg ?? 16 });
  g.add(shaft);
  if (opts.base !== false) {
    const b = boxC(r * 2.7, 0.22, r * 2.7, material); b.position.y = 0.11; g.add(b);
    const c = boxC(r * 2.7, 0.26, r * 2.7, material); c.position.y = h - 0.13; g.add(c);
  }
  return g;
}

/** I-beam girder running along +X. Origin at centre. */
export function girder(length, material, opts = {}) {
  const s = opts.scale ?? 1;
  const g = new THREE.Group();
  const web = boxC(length, 0.30 * s, 0.03 * s, material); g.add(web);
  const top = boxC(length, 0.035 * s, 0.20 * s, material); top.position.y = 0.16 * s; g.add(top);
  const bot = boxC(length, 0.035 * s, 0.20 * s, material); bot.position.y = -0.16 * s; g.add(bot);
  return g;
}

/** Catwalk / gantry along +X with grating floor and rails. */
export function catwalk(length, width, material, railMat) {
  const g = new THREE.Group();
  const deck = boxC(length, 0.08, width, material);
  g.add(deck);
  const rL = railing(length, 1.0, railMat ?? material); rL.position.set(0, 0.04, -width / 2 + 0.05); g.add(rL);
  const rR = railing(length, 1.0, railMat ?? material); rR.position.set(0, 0.04, width / 2 - 0.05); g.add(rR);
  return g;
}

/** Vertical ladder along +Y, rungs facing -Z. */
export function ladder(h, material) {
  const g = new THREE.Group();
  const w = 0.42;
  const a = boxC(0.05, h, 0.05, material); a.position.set(-w / 2, h / 2, 0); g.add(a);
  const b = boxC(0.05, h, 0.05, material); b.position.set(w / 2, h / 2, 0); g.add(b);
  for (let y = 0.3; y < h; y += 0.32) {
    const r = cyl(0.022, 0.022, w, material, { seg: 6, collide: false });
    r.rotation.z = Math.PI / 2; r.position.set(w / 2, y, 0);
    g.add(r);
  }
  g.userData.climbable = true;
  return g;
}

/** Arch / doorway opening frame. */
export function archway(w, h, depth, material) {
  const g = new THREE.Group();
  const t = 0.3;
  const l = boxC(t, h, depth, material); l.position.set(-w / 2 - t / 2, h / 2, 0); g.add(l);
  const r = boxC(t, h, depth, material); r.position.set(w / 2 + t / 2, h / 2, 0); g.add(r);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - t, h);
  shape.lineTo(-w / 2 - t, h + t * 1.6);
  shape.lineTo(w / 2 + t, h + t * 1.6);
  shape.lineTo(w / 2 + t, h);
  shape.absarc(0, h, w / 2 + t, 0, Math.PI, true);
  const eg = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  eg.translate(0, 0, -depth / 2);
  const cap = mesh(eg, material);
  g.add(cap);
  return g;
}

// ---------------------------------------------------------------------------
// Lighting fixtures (geometry only — pair with a real light where it matters)
// ---------------------------------------------------------------------------

/** Recessed / surface fluorescent tube fixture. Faces down. */
export function fluorescent(length = 1.2, o = {}) {
  const g = new THREE.Group();
  const housing = boxC(length, 0.09, 0.30, mat.solid({ color: 0xd8d8d2, roughness: 0.5, metalness: 0.2 }));
  housing.userData.collide = false; housing.castShadow = false;
  g.add(housing);
  const tint = o.color ?? 0xfff4d6;
  const panel = boxC(length * 0.94, 0.03, 0.24, mat.emissive(tint, o.intensity ?? 4, { toneMapped: true }));
  panel.position.y = -0.06;
  panel.userData.collide = false; panel.castShadow = false;
  g.add(panel);
  g.userData.emissivePanel = panel;
  g.userData.lightColor = tint;
  return g;
}

/** 2x2 troffer light panel — offices, backrooms. */
export function lightPanel(size = 1.2, o = {}) {
  const g = new THREE.Group();
  const frame = boxC(size, 0.06, size, mat.solid({ color: 0xcfcfc8, roughness: 0.6 }));
  frame.userData.collide = false; frame.castShadow = false;
  g.add(frame);
  const panel = boxC(size * 0.92, 0.02, size * 0.92, mat.emissive(o.color ?? 0xffeec2, o.intensity ?? 3.2));
  panel.position.y = -0.04; panel.userData.collide = false; panel.castShadow = false;
  g.add(panel);
  g.userData.emissivePanel = panel;
  return g;
}

/** Caged industrial wall lamp. */
export function wallLamp(o = {}) {
  const g = new THREE.Group();
  const arm = cyl(0.03, 0.03, 0.28, mat.metal(0x3b3f44, 0.6), { collide: false, seg: 8 });
  arm.rotation.x = Math.PI / 2; arm.position.set(0, 0, 0.14); g.add(arm);
  const shade = cyl(0.16, 0.09, 0.16, mat.metal(0x2f3338, 0.7), { open: true, collide: false, seg: 14 });
  shade.position.set(0, -0.02, 0.3); shade.rotation.x = Math.PI; g.add(shade);
  const bulb = sphere(0.06, mat.emissive(o.color ?? 0xffcf8a, o.intensity ?? 6), { collide: false, seg: 10 });
  bulb.position.set(0, -0.06, 0.3); g.add(bulb);
  g.userData.bulb = bulb;
  return g;
}

/** Hanging pendant / bare bulb on a cord. */
export function pendant(cordLen = 0.8, o = {}) {
  const g = new THREE.Group();
  const cord = cyl(0.006, 0.006, cordLen, mat.solid({ color: 0x111111 }), { collide: false, seg: 5 });
  cord.position.y = -cordLen; g.add(cord);
  const bulb = sphere(0.055, mat.emissive(o.color ?? 0xffd79a, o.intensity ?? 8), { collide: false, seg: 12 });
  bulb.position.y = -cordLen - 0.05; g.add(bulb);
  g.userData.bulb = bulb;
  g.userData.swing = (t) => { g.rotation.z = Math.sin(t * 0.7) * (o.swing ?? 0.03); };
  return g;
}

/** Street light — tall pole with a downward head. */
export function streetLight(h = 6, o = {}) {
  const g = new THREE.Group();
  const m = mat.metal(0x33383d, 0.65);
  const pole = cyl(0.09, 0.13, h, m, { seg: 10 }); g.add(pole);
  const arm = boxC(1.4, 0.1, 0.1, m); arm.position.set(0.7, h - 0.1, 0); g.add(arm);
  const head = boxC(0.55, 0.14, 0.28, m); head.position.set(1.35, h - 0.22, 0); g.add(head);
  const lens = boxC(0.45, 0.03, 0.2, mat.emissive(o.color ?? 0xffca7a, o.intensity ?? 5));
  lens.position.set(1.35, h - 0.30, 0); lens.userData.collide = false; g.add(lens);
  g.userData.lensPos = new THREE.Vector3(1.35, h - 0.32, 0);
  return g;
}

/** Wall torch with a flickering flame. Register update via userData.tick. */
export function torch(o = {}) {
  const g = new THREE.Group();
  const bracket = boxC(0.07, 0.3, 0.07, mat.metal(0x2b2723, 0.8)); bracket.position.y = 0.15; g.add(bracket);
  const bowl = cyl(0.11, 0.06, 0.13, mat.metal(0x33291f, 0.85), { seg: 10, collide: false });
  bowl.position.y = 0.28; g.add(bowl);
  const flame = cyl(0.005, 0.075, 0.30, mat.emissive(o.color ?? 0xff8c2a, 7, { transparent: true, opacity: 0.85 }), { seg: 10, collide: false });
  flame.position.y = 0.36; g.add(flame);
  g.userData.flame = flame;
  return g;
}

// ---------------------------------------------------------------------------
// Industrial / clutter
// ---------------------------------------------------------------------------

export function crate(size = 0.9, material, o = {}) {
  const g = new THREE.Group();
  const m = material ?? mat.surface('wood', { color: 0x8a6238, repeat: 1, size: 256, planks: 5 });
  const body = boxC(size, size, size, m); body.position.y = size / 2; g.add(body);
  const t = size * 0.06;
  const trimM = o.trimMat ?? mat.solid({ color: 0x5c4325, roughness: 0.85 });
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (const y of [size * 0.14, size * 0.86]) {
      const b = boxC(dz ? size * 1.01 : t, t, dz ? t : size * 1.01, trimM);
      b.position.set(dx * size / 2, y, dz * size / 2);
      b.userData.collide = false;
      g.add(b);
    }
  }
  return g;
}

export function barrel(r = 0.32, h = 0.9, material) {
  const g = new THREE.Group();
  const m = material ?? mat.surface('rustMetal', { repeat: 1, size: 256, color: 0x2f6a3f });
  const body = cyl(r, r, h, m, { seg: 18 }); g.add(body);
  const ringM = mat.metal(0x4b4f53, 0.55);
  for (const y of [h * 0.25, h * 0.75]) {
    const ring = new THREE.Mesh(
      geo(`tor:${r}`, () => new THREE.TorusGeometry(r * 1.01, 0.018, 6, 20)), ringM);
    ring.rotation.x = Math.PI / 2; ring.position.y = y; ring.userData.collide = false;
    ring.castShadow = true;
    g.add(ring);
  }
  return g;
}

export function pallet(w = 1.2, d = 0.9, material) {
  const g = new THREE.Group();
  const m = material ?? mat.solid({ color: 0x9a7c4e, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const b = boxC(0.1, 0.1, d, m); b.position.set(-w / 2 + 0.05 + i * (w - 0.1) / 2, 0.05, 0); g.add(b);
  }
  for (let i = 0; i < 6; i++) {
    const s = boxC(w, 0.03, d / 8, m);
    s.position.set(0, 0.115, -d / 2 + d / 16 + i * (d - d / 8) / 5);
    s.userData.collide = false;
    g.add(s);
  }
  return g;
}

/** Warehouse pallet racking, N bays wide. */
export function shelfRack(bays = 3, levels = 3, bayW = 2.4, depth = 1.1, levelH = 1.9, material) {
  const g = new THREE.Group();
  const m = material ?? mat.solid({ color: 0xd0621f, roughness: 0.6, metalness: 0.4 });
  const W = bays * bayW;
  for (let i = 0; i <= bays; i++) {
    for (const dz of [-depth / 2, depth / 2]) {
      const p = boxC(0.09, levels * levelH, 0.09, m);
      p.position.set(-W / 2 + i * bayW, levels * levelH / 2, dz);
      g.add(p);
    }
  }
  for (let l = 1; l <= levels; l++) {
    const beamY = l * levelH - levelH * 0.08;
    for (const dz of [-depth / 2, depth / 2]) {
      const b = boxC(W, 0.09, 0.07, m); b.position.set(0, beamY, dz); g.add(b);
    }
    if (l < levels) {
      const deck = boxC(W, 0.04, depth, mat.solid({ color: 0x6b6b68, roughness: 0.85 }));
      deck.position.set(0, beamY + 0.06, 0); g.add(deck);
    }
  }
  return g;
}

/** Tall metal locker bank. */
export function lockers(count = 4, material) {
  const g = new THREE.Group();
  const w = 0.42, h = 1.85, d = 0.45;
  const m = material ?? mat.surface('metalPanel', { color: 0x3f5e5a, repeat: 1, size: 256, panels: 2, roughness: 0.5 });
  const body = boxC(w * count, h, d, m); body.position.y = h / 2; g.add(body);
  const lineM = mat.solid({ color: 0x1b2b29, roughness: 0.7 });
  for (let i = 1; i < count; i++) {
    const s = boxC(0.015, h * 0.98, 0.01, lineM);
    s.position.set(-w * count / 2 + i * w, h / 2, d / 2 + 0.005);
    s.userData.collide = false; g.add(s);
  }
  for (let i = 0; i < count; i++) {
    const v = boxC(w * 0.5, 0.02, 0.01, lineM);
    v.position.set(-w * count / 2 + w * (i + 0.5), h * 0.86, d / 2 + 0.006);
    v.userData.collide = false; g.add(v);
    const handle = boxC(0.03, 0.14, 0.03, mat.metal(0xa8adb2, 0.35));
    handle.position.set(-w * count / 2 + w * (i + 0.85), h * 0.5, d / 2 + 0.02);
    handle.userData.collide = false; g.add(handle);
  }
  g.userData.hide = true;
  return g;
}

/** Pipe run along +X, with brackets. */
export function pipes(length, count = 3, r = 0.09, material, o = {}) {
  const g = new THREE.Group();
  const m = material ?? mat.metal(0x6c6f73, 0.5);
  for (let i = 0; i < count; i++) {
    // cyl() puts its mesh at local +h/2; a +90 deg Z rotation maps that to
    // -h/2 on X, so the group must sit at +len/2 to centre the run on origin.
    const p = cyl(r, r, length, m, { seg: 12, collide: o.collide ?? false });
    p.rotation.z = Math.PI / 2;
    p.position.set(length / 2, 0, (i - (count - 1) / 2) * (r * 2.8));
    g.add(p);
    // flanges
    for (let x = -length / 2 + 2; x < length / 2; x += 3.5) {
      const f = cyl(r * 1.35, r * 1.35, 0.08, m, { seg: 12, collide: false });
      f.rotation.z = Math.PI / 2;
      f.position.set(x + 0.04, 0, (i - (count - 1) / 2) * (r * 2.8));
      g.add(f);
    }
  }
  return g;
}

/** Wall / ceiling air vent grille. Faces +Z. */
export function vent(w = 0.6, h = 0.35, material) {
  const g = new THREE.Group();
  const m = material ?? mat.metal(0x8b9096, 0.55);
  const frame = boxC(w, h, 0.04, m); g.add(frame);
  const slatM = mat.solid({ color: 0x1a1c1e, roughness: 0.9 });
  const n = Math.max(3, Math.floor(h / 0.06));
  for (let i = 0; i < n; i++) {
    const s = boxC(w * 0.9, 0.022, 0.03, slatM);
    s.position.set(0, -h / 2 + (i + 0.5) * (h / n), 0.03);
    s.rotation.x = -0.4;
    s.userData.collide = false;
    g.add(s);
  }
  return g;
}

/** Rooftop / alley AC condenser unit. */
export function acUnit(w = 1.1, h = 0.9, d = 1.1) {
  const g = new THREE.Group();
  const m = mat.surface('metalPanel', { color: 0x9aa0a4, repeat: 1, size: 256, panels: 3 });
  const body = boxC(w, h, d, m); body.position.y = h / 2; g.add(body);
  const fanRing = new THREE.Mesh(new THREE.TorusGeometry(w * 0.32, 0.03, 6, 24), mat.metal(0x55595d, 0.6));
  fanRing.rotation.x = Math.PI / 2; fanRing.position.y = h + 0.01; fanRing.userData.collide = false;
  g.add(fanRing);
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = boxC(w * 0.55, 0.012, 0.1, mat.solid({ color: 0x2a2d30 }));
    b.rotation.y = (i / 4) * Math.PI * 2; b.rotation.x = 0.3; b.userData.collide = false;
    blades.add(b);
  }
  blades.position.y = h + 0.01; g.add(blades);
  g.userData.fan = blades;
  return g;
}

/** Diesel generator / machine block with greebles. */
export function machine(w = 1.6, h = 1.3, d = 1.0, seed = 1) {
  const R = makeRNG(seed);
  const g = new THREE.Group();
  const body = boxC(w, h, d, mat.surface('metalPanel', { color: 0x4d5560, repeat: 1, size: 256 }));
  body.position.y = h / 2; g.add(body);
  const gm = mat.metal(0x6a7078, 0.45);
  for (let i = 0; i < 8; i++) {
    const gw = R.range(0.08, 0.3), gh = R.range(0.06, 0.25), gd = R.range(0.05, 0.18);
    const gb = boxC(gw, gh, gd, gm);
    gb.position.set(R.range(-w / 2 + gw, w / 2 - gw), R.range(0.2, h - 0.1), d / 2 + gd / 2);
    gb.userData.collide = false;
    g.add(gb);
  }
  const stack = cyl(0.07, 0.09, 0.55, mat.metal(0x3a3d40, 0.75), { seg: 10, collide: false });
  stack.position.set(w * 0.3, h, -d * 0.25); g.add(stack);
  const led = sphere(0.025, mat.emissive(R.chance(0.6) ? 0x4dff88 : 0xff5544, 6), { collide: false, seg: 8 });
  led.position.set(-w * 0.35, h * 0.75, d / 2 + 0.02); g.add(led);
  return g;
}

/** Loose rubble pile / debris. */
export function rubble(radius = 1.2, count = 14, material, seed = 1) {
  const R = makeRNG(seed);
  const g = new THREE.Group();
  const m = material ?? mat.surface('concrete', { repeat: 1, size: 256, color: 0x7d7a74 });
  for (let i = 0; i < count; i++) {
    const s = R.range(0.1, 0.45);
    const chunk = new THREE.Mesh(
      geo(`ico:${Math.round(s * 20)}`, () => new THREE.IcosahedronGeometry(1, 0)), m);
    chunk.scale.set(s * R.range(0.7, 1.4), s * R.range(0.5, 1.0), s * R.range(0.7, 1.4));
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * radius;
    chunk.position.set(Math.cos(a) * d, s * 0.35, Math.sin(a) * d);
    chunk.rotation.set(R() * 3, R() * 3, R() * 3);
    chunk.castShadow = true; chunk.receiveShadow = true;
    chunk.userData.collide = s > 0.3;
    g.add(chunk);
  }
  return g;
}

/** Chain-link or picket fence run along +X. */
export function fence(length, h = 2.0, style = 'chain', material) {
  const g = new THREE.Group();
  const m = material ?? mat.metal(0x6e7276, 0.6);
  const posts = Math.max(2, Math.round(length / 2.4));
  for (let i = 0; i <= posts; i++) {
    const p = cyl(0.045, 0.045, h, m, { seg: 8 });
    p.position.set(-length / 2 + (length * i) / posts, 0, 0);
    g.add(p);
  }
  if (style === 'chain') {
    const meshM = mat.painted(64, 64, (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(190,195,200,0.95)'; ctx.lineWidth = 3;
      for (let i = -W; i < W * 2; i += 12) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke();
      }
    }, { transparent: true, roughness: 0.6, alphaTest: 0.3 });
    meshM.map.repeat.set(length * 2.2, h * 2.2);
    meshM.map.wrapS = meshM.map.wrapT = THREE.RepeatWrapping;
    const panel = boxC(length, h - 0.06, 0.01, meshM, { shadow: false });
    panel.position.y = h / 2; panel.userData.collide = true;
    g.add(panel);
    const top = cyl(0.03, 0.03, length, m, { seg: 6, collide: false });
    top.rotation.z = Math.PI / 2; top.position.set(length / 2, h - 0.05, 0); g.add(top);
  } else {
    const boards = Math.floor(length / 0.16);
    const wm = material ?? mat.surface('wood', { repeat: 1, size: 128, color: 0x6f5636, planks: 2 });
    for (let i = 0; i < boards; i++) {
      const b = boxC(0.13, h, 0.04, wm);
      b.position.set(-length / 2 + 0.08 + i * 0.16, h / 2, 0);
      b.userData.collide = i % 6 === 0;
      g.add(b);
    }
    const solidBlock = boxC(length, h, 0.06, wm, { shadow: false });
    solidBlock.position.y = h / 2; solidBlock.visible = false; solidBlock.userData.collide = true;
    g.add(solidBlock);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Furniture / set dressing
// ---------------------------------------------------------------------------

export function table(w = 1.6, h = 0.75, d = 0.8, material) {
  const g = new THREE.Group();
  const m = material ?? mat.surface('wood', { repeat: 1, size: 256, color: 0x6b4a2a, planks: 4 });
  const top = boxC(w, 0.06, d, m); top.position.y = h; g.add(top);
  const legM = mat.solid({ color: 0x3f2d1a, roughness: 0.8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = boxC(0.07, h, 0.07, legM);
    l.position.set(sx * (w / 2 - 0.09), h / 2, sz * (d / 2 - 0.09));
    l.userData.collide = false; g.add(l);
  }
  g.userData.hide = true;
  return g;
}

export function chair(material) {
  const g = new THREE.Group();
  const m = material ?? mat.solid({ color: 0x4a4a4e, roughness: 0.75 });
  const seat = boxC(0.45, 0.05, 0.45, m); seat.position.y = 0.45; g.add(seat);
  const back = boxC(0.45, 0.5, 0.05, m); back.position.set(0, 0.7, -0.2); g.add(back);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = boxC(0.04, 0.45, 0.04, m);
    l.position.set(sx * 0.19, 0.225, sz * 0.19); l.userData.collide = false; g.add(l);
  }
  return g;
}

export function deskComputer(o = {}) {
  const g = new THREE.Group();
  const t = table(1.4, 0.74, 0.7, mat.solid({ color: 0x3a3f45, roughness: 0.6 }));
  g.add(t);
  const monM = mat.solid({ color: 0x18191b, roughness: 0.5 });
  const stand = boxC(0.12, 0.16, 0.1, monM); stand.position.set(0, 0.82, -0.1); g.add(stand);
  const bezel = boxC(0.62, 0.38, 0.03, monM); bezel.position.set(0, 1.06, -0.1); g.add(bezel);
  const screen = boxC(0.58, 0.34, 0.005, mat.emissive(o.screen ?? 0x3fa8ff, o.intensity ?? 1.6));
  screen.position.set(0, 1.06, -0.082); screen.userData.collide = false; g.add(screen);
  const kb = boxC(0.42, 0.02, 0.14, monM); kb.position.set(0, 0.78, 0.16); kb.userData.collide = false; g.add(kb);
  g.userData.screen = screen;
  return g;
}

export function bookshelf(w = 1.0, h = 2.0, d = 0.32, seed = 1) {
  const R = makeRNG(seed);
  const g = new THREE.Group();
  const m = mat.surface('wood', { repeat: 1, size: 256, color: 0x4d3620, planks: 3 });
  const back = boxC(w, h, 0.03, m); back.position.set(0, h / 2, -d / 2); g.add(back);
  for (const sx of [-1, 1]) { const s = boxC(0.04, h, d, m); s.position.set(sx * w / 2, h / 2, 0); g.add(s); }
  const shelves = 5;
  for (let i = 0; i <= shelves; i++) {
    const y = (i / shelves) * h;
    const s = boxC(w, 0.035, d, m); s.position.set(0, y, 0); g.add(s);
    if (i === shelves) break;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.08) {
      const bw = R.range(0.025, 0.06), bh = R.range(0.18, 0.28);
      if (R.chance(0.12)) { x += R.range(0.04, 0.12); continue; }
      const bk = boxC(bw, bh, d * R.range(0.6, 0.85),
        mat.solid({ color: new THREE.Color().setHSL(R(), 0.35, R.range(0.18, 0.45)).getHex(), roughness: 0.85 }));
      bk.position.set(x + bw / 2, y + bh / 2 + 0.02, 0);
      bk.rotation.z = R.chance(0.08) ? R.range(0.1, 0.3) : 0;
      bk.userData.collide = false;
      g.add(bk);
      x += bw + 0.004;
    }
  }
  g.userData.hide = true;
  return g;
}

/** Freestanding sign / poster board. Faces +Z. */
export function sign(text, o = {}) {
  const g = new THREE.Group();
  const { material, aspect } = mat.textMaterial(text, {
    color: o.color ?? 0xffffff,
    background: o.background ?? 0x1b6b3a,
    fontSize: o.fontSize ?? 96,
    emissive: o.emissive,
    emissiveIntensity: o.emissiveIntensity ?? 1.2,
  });
  const h = o.height ?? 0.4;
  const w = h * aspect;
  const plate = boxC(w, h, 0.03, material, { collide: false, shadow: false });
  g.add(plate);
  if (o.frame !== false) {
    const f = boxC(w + 0.05, h + 0.05, 0.02, mat.metal(0x3a3d40, 0.5), { collide: false });
    f.position.z = -0.02; g.add(f);
  }
  g.userData.size = [w, h];
  return g;
}

/** Hanging cloth banner. Faces +Z, hangs down from y=0. */
export function banner(w = 1.2, h = 3.0, color = 0x6d2436, emblem) {
  const g = new THREE.Group();
  const m = mat.surface('fabric', { color, repeat: 1, size: 256 });
  const seg = 10;
  const geoP = new THREE.PlaneGeometry(w, h, 4, seg);
  const pos = geoP.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i);
    pos.setZ(i, Math.sin((y / h) * 6 + x) * 0.04);
  }
  geoP.computeVertexNormals();
  const cloth = new THREE.Mesh(geoP, m);
  cloth.position.y = -h / 2;
  cloth.castShadow = true; cloth.receiveShadow = true;
  cloth.material.side = THREE.DoubleSide;
  cloth.userData.collide = false;
  g.add(cloth);
  const rod = cyl(0.03, 0.03, w * 1.1, mat.metal(0x6a5a3a, 0.5), { seg: 8, collide: false });
  rod.rotation.z = Math.PI / 2; rod.position.set(w * 0.55, 0, 0); g.add(rod);
  if (emblem) {
    const { material: em, aspect } = mat.textMaterial(emblem, { color: 0xd9c07a, fontSize: 128 });
    const p = boxC(w * 0.6, (w * 0.6) / aspect, 0.005, em, { collide: false, shadow: false });
    p.position.set(0, -h * 0.35, 0.03); g.add(p);
  }
  return g;
}

export function trashBin(r = 0.28, h = 0.75) {
  const g = new THREE.Group();
  const m = mat.metal(0x4a4d51, 0.6);
  const body = cyl(r, r * 0.85, h, m, { seg: 14, open: true }); g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 18), m);
  rim.rotation.x = Math.PI / 2; rim.position.y = h; rim.userData.collide = false; g.add(rim);
  return g;
}

/** Simple parked vehicle silhouette — blocky but readable at distance. */
export function car(color = 0x8a2b2b, seed = 1) {
  const R = makeRNG(seed);
  const g = new THREE.Group();
  const body = mat.solid({ color, roughness: 0.35, metalness: 0.55, envMapIntensity: 1.4 });
  const glassM = mat.glassCheap({ color: 0x1a2430, opacity: 0.55 });
  const tyre = mat.solid({ color: 0x141516, roughness: 0.95 });
  const lower = boxC(4.3, 0.62, 1.85, body); lower.position.y = 0.72; g.add(lower);
  const cabin = boxC(2.35, 0.62, 1.72, body); cabin.position.set(-0.2, 1.32, 0); g.add(cabin);
  const wind = boxC(2.2, 0.5, 1.74, glassM); wind.position.set(-0.2, 1.34, 0);
  wind.userData.collide = false; g.add(wind);
  for (const sx of [1.45, -1.45]) for (const sz of [0.93, -0.93]) {
    const w = cyl(0.36, 0.36, 0.24, tyre, { seg: 14, collide: false });
    w.rotation.x = Math.PI / 2; w.position.set(sx, 0.36, sz - 0.12); g.add(w);
  }
  for (const sz of [0.6, -0.6]) {
    const hl = boxC(0.06, 0.14, 0.3, mat.emissive(0xfff0c0, R.chance(0.3) ? 2.5 : 0.15));
    hl.position.set(2.14, 0.85, sz); hl.userData.collide = false; g.add(hl);
    const tl = boxC(0.06, 0.12, 0.26, mat.emissive(0xff2a1a, 1.2));
    tl.position.set(-2.14, 0.88, sz); tl.userData.collide = false; g.add(tl);
  }
  g.userData.hide = true;
  return g;
}

/** ISO shipping container. */
export function container(len = 6.06, color = 0x2f6f8f, seed = 1) {
  const g = new THREE.Group();
  const h = 2.59, d = 2.44;
  const m = mat.surface('corrugated', { color, repeat: 1, size: 256, ribs: Math.round(len * 2), seed });
  const body = boxC(len, h, d, m); body.position.y = h / 2; g.add(body);
  const frameM = mat.metal(0x3a3f43, 0.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = boxC(0.12, h, 0.12, frameM);
    p.position.set(sx * (len / 2 - 0.06), h / 2, sz * (d / 2 - 0.06));
    p.userData.collide = false; g.add(p);
  }
  for (const y of [0.06, h - 0.06]) for (const sz of [-1, 1]) {
    const r = boxC(len, 0.12, 0.12, frameM);
    r.position.set(0, y, sz * (d / 2 - 0.06)); r.userData.collide = false; g.add(r);
  }
  g.userData.hide = true;
  return g;
}

// ---------------------------------------------------------------------------
// Nature
// ---------------------------------------------------------------------------

/** Low-poly conifer or broadleaf tree. */
export function tree(h = 7, kind = 'pine', seed = 1) {
  const R = makeRNG(seed);
  const g = new THREE.Group();
  const barkM = mat.surface('wood', { color: 0x4a3524, repeat: 1, size: 256, planks: 2, rough: 0.95 });
  const trunkH = kind === 'pine' ? h * 0.35 : h * 0.5;
  const trunk = cyl(h * 0.022, h * 0.045, trunkH, barkM, { seg: 8 });
  g.add(trunk);
  const leafColor = new THREE.Color().setHSL(0.27 + R.range(-0.04, 0.04), 0.45, R.range(0.16, 0.28)).getHex();
  const leafM = mat.solid({ color: leafColor, roughness: 0.9, flat: true });
  if (kind === 'pine') {
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const r = h * 0.24 * (1 - t * 0.75);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.30, 7), leafM);
      cone.position.y = trunkH * 0.75 + t * h * 0.52 + h * 0.15;
      cone.rotation.y = R() * 3;
      cone.castShadow = true; cone.receiveShadow = true; cone.userData.collide = false;
      g.add(cone);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const r = h * R.range(0.14, 0.24);
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafM);
      blob.position.set(R.gauss(0, h * 0.08), trunkH + h * 0.18 + R.gauss(0, h * 0.07), R.gauss(0, h * 0.08));
      blob.scale.y = 0.8;
      blob.castShadow = true; blob.receiveShadow = true; blob.userData.collide = false;
      g.add(blob);
    }
  }
  return g;
}

export function bush(r = 0.7, color = 0x2f4a22, seed = 1) {
  const R = makeRNG(seed);
  const g = new THREE.Group();
  const m = mat.solid({ color, roughness: 0.95, flat: true });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * R.range(0.6, 1.0), 1), m);
    b.position.set(R.gauss(0, r * 0.3), r * R.range(0.4, 0.7), R.gauss(0, r * 0.3));
    b.scale.y = 0.75;
    b.castShadow = true; b.receiveShadow = true; b.userData.collide = false;
    g.add(b);
  }
  g.userData.hide = true;
  return g;
}

/** Jagged boulder. */
export function boulder(r = 1.2, seed = 1, material) {
  const R = makeRNG(seed);
  const gm = new THREE.IcosahedronGeometry(r, 1);
  const pos = gm.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const f = 1 + R.range(-0.28, 0.28);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.8, pos.getZ(i) * f);
  }
  gm.computeVertexNormals();
  const m = material ?? mat.surface('rock', { repeat: 1, size: 256 });
  const o = mesh(gm, m);
  o.position.y = r * 0.6;
  const wrap = new THREE.Group(); wrap.add(o);
  return wrap;
}

// ---------------------------------------------------------------------------
// Scatter / instancing
// ---------------------------------------------------------------------------

/**
 * Instanced scatter — the workhorse for grass tufts, rocks, debris, crowds of
 * anything. Returns an InstancedMesh (non-colliding by default: instanced
 * geometry is not fed to the octree).
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {number} count
 * @param {(i:number, dummy:THREE.Object3D, rng:Function)=>boolean|void} place
 *        Position `dummy`; return false to skip the instance.
 */
export function scatter(geometry, material, count, place, seed = 1) {
  const R = makeRNG(seed);
  const dummy = new THREE.Object3D();
  const inst = new THREE.InstancedMesh(geometry, material, count);
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.userData.collide = false;
  let n = 0;
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    if (place(i, dummy, R) === false) continue;
    dummy.updateMatrix();
    inst.setMatrixAt(n++, dummy.matrix);
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = true;
  return inst;
}

/** Cross-quad grass/foliage geometry for scatter(). */
export function billboardCross(w = 0.5, h = 0.6) {
  const a = new THREE.PlaneGeometry(w, h);
  a.translate(0, h / 2, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const c = a.clone(); c.rotateY(Math.PI / 4);
  const merged = mergeGeometries([a, b, c]);
  return merged;
}

/** Minimal geometry merge (avoids pulling in BufferGeometryUtils). */
export function mergeGeometries(list) {
  const out = new THREE.BufferGeometry();
  let vCount = 0, iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo; }
    else { for (let i = 0; i < p.count; i++) idx[io++] = i + vo; }
    vo += p.count;
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Bake a whole Group down to a single merged mesh per material (fast draw). */
export function freeze(group) {
  const buckets = new Map();
  group.updateMatrixWorld(true);
  group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] });
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    buckets.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  for (const { mat: m, geos } of buckets.values()) {
    const merged = mergeGeometries(geos);
    const mm = new THREE.Mesh(merged, m);
    mm.castShadow = true; mm.receiveShadow = true;
    mm.userData.collide = false;
    out.add(mm);
    geos.forEach(g => g.dispose());
  }
  return out;
}

export const props = {
  box, boxC, cyl, sphere, ground, wallPlane,
  wallBetween, roomShell, ceiling, stairs, railing, door, window: window_, column,
  girder, catwalk, ladder, archway,
  fluorescent, lightPanel, wallLamp, pendant, streetLight, torch,
  crate, barrel, pallet, shelfRack, lockers, pipes, vent, acUnit, machine, rubble, fence,
  table, chair, deskComputer, bookshelf, sign, banner, trashBin, car, container,
  tree, bush, boulder,
  scatter, billboardCross, mergeGeometries, freeze,
  COLLIDE, NOCOLLIDE,
};
