// =============================================================================
// NEON METRO — a flooded, abandoned cyberpunk subway interchange, three levels
// deep. Street (y=+9) → concourse (y=0) → platforms (y=-7) → flooded tunnels.
// Lit almost entirely by failing neon, holo ad boards and sodium emergency
// strips. Rain pours in through a collapsed street-level ceiling.
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'neonmetro',
  name: 'NEON METRO',
  tagline: 'Three levels down, the rain still finds you.',
  order: 2,
  difficulty: 3,
  biome: 'underground',
  seed: 20260209,
  spawn: [-34, 0, -6],
  bounds: 100,
  colors: ['#ff2ad0', '#0a1220'],
  music: 'tense',
};

// -----------------------------------------------------------------------------
// World metrics. Every number below is referenced by name so levels stay glued.
// -----------------------------------------------------------------------------
const L = {
  // Level 0 — street slice
  streetY: 9, streetTop: 31,
  SX: 38, SZ: 18,                     // street half-extents
  // Level 1 — concourse
  conY: 0, conCeil: 8,
  CX: 62, CZ: 40,                     // concourse half-extents
  mezzY: 4.2, mezzW: 3.6,
  // Level 2 — platforms
  platY: -7, trenchY: -8, waterY: -7.65,
  PX: 55, PZ: 19,                     // platform-hall half-extents
  platCeil: -0.9,                     // underside of the concourse floor slab
  // Tunnels
  tunE0: 55, tunE1: 95,
  tunW0: -68, tunW1: -55,
  tunCeil: -2.2,
  boreA: [-8, -2], boreB: [2, 8],     // z-bands of the two running tunnels
};

// Holes punched through the concourse floor slab (y -0.9 .. 0).
const FLOOR_HOLES = [
  [17, 23, -4.4, 2],        // escalator E2 down to platform A
  [-27, -21, -4, 0],        // fixed stair S1 down to platform A
  [-41.5, -38.5, 12.5, 15.5], // service ladder shaft
  [-8, 6, 9, 15],           // light well over platform B
];
// Holes through the street deck / ceiling panel layer (y 7.9 .. 9).
const CEIL_HOLES = [
  [0, 14, -8, 4],           // the collapse
  [-19, -13, -8.8, -4],     // escalator E1 up to the street
];

// -----------------------------------------------------------------------------
// Tiny deterministic utilities (no Math.random anywhere in this file).
// -----------------------------------------------------------------------------
function hash01(n) {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();

/** A thin cylinder spanning two points — cables, conduits, catenary links. */
function strut(a, b, r, material) {
  _d.subVectors(b, a);
  const len = _d.length() || 0.001;
  const m = new THREE.Mesh(UNIT_CYL, material);
  m.position.copy(a).addScaledVector(_d, 0.5);
  m.quaternion.setFromUnitVectors(UP, _d.normalize());
  m.scale.set(r, len, r);
  m.userData.collide = false;
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

/**
 * Grid-decompose a rectangle minus a set of axis-aligned holes.
 * @returns array of [cx, cz, w, d]
 */
function slabCells(x0, x1, z0, z1, holes = [], panel = 0) {
  const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
  for (const h of holes) {
    if (h[0] > x0 && h[0] < x1) xs.add(h[0]);
    if (h[1] > x0 && h[1] < x1) xs.add(h[1]);
    if (h[2] > z0 && h[2] < z1) zs.add(h[2]);
    if (h[3] > z0 && h[3] < z1) zs.add(h[3]);
  }
  if (panel > 0) {
    for (let v = x0 + panel; v < x1 - 0.05; v += panel) xs.add(Math.round(v * 100) / 100);
    for (let v = z0 + panel; v < z1 - 0.05; v += panel) zs.add(Math.round(v * 100) / 100);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < X.length - 1; i++) {
    for (let j = 0; j < Z.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      let inHole = false;
      for (const h of holes) {
        if (cx > h[0] && cx < h[1] && cz > h[2] && cz < h[3]) { inHole = true; break; }
      }
      if (inHole) continue;
      out.push([cx, cz, X[i + 1] - X[i], Z[j + 1] - Z[j]]);
    }
  }
  return out;
}

// Filled in by build(); module-scope so the helpers below can reach them.
let M = null;      // material palette
let CTX = null;    // arena context
let TICKS = null;  // array of per-frame closures

/** Visible slab (panelised for sane UV density) + a coarse invisible collider. */
function emitSlab(visGroup, x0, x1, z0, z1, yTop, thick, material, holes = [], opts = {}) {
  const P = CTX.props;
  for (const [cx, cz, w, d] of slabCells(x0, x1, z0, z1, holes, opts.panel ?? 8)) {
    const m = P.boxC(w, thick, d, material, { collide: false, shadow: opts.shadow ?? false });
    m.position.set(cx, yTop - thick / 2, cz);
    visGroup.add(m);
  }
  if (opts.collide === false) return;
  for (const [cx, cz, w, d] of slabCells(x0, x1, z0, z1, holes, 0)) {
    proxyBox(w, thick + 0.1, d, cx, yTop - thick / 2, cz);
  }
}

/** Invisible collision proxy box (origin at centre). */
function proxyBox(w, h, d, x, y, z, ry = 0) {
  const m = CTX.props.boxC(w, h, d, M.invis, { collide: true, shadow: false, receive: false });
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.visible = false;
  CTX.add(m);
  return m;
}

/**
 * A wall run built from fixed-length panels (so the texture never stretches),
 * with optional openings expressed as [distanceStart, distanceEnd, yBottom, yTop].
 * Emits visuals into `visGroup` and coarse invisible colliders into the world.
 */
function wallStrip(visGroup, x1, z1, x2, z2, yBot, yTop, thick, material, gaps = [], opts = {}) {
  const P = CTX.props;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ry = -Math.atan2(dz, dx);
  const ux = dx / len, uz = dz / len;
  const panel = opts.panel ?? 8;
  const H = yTop - yBot;

  // Vertical cut lines from the gaps, so panels never straddle an opening.
  const cuts = new Set([0, len]);
  for (const g of gaps) { cuts.add(Math.max(0, g[0])); cuts.add(Math.min(len, g[1])); }
  for (let v = panel; v < len - 0.05; v += panel) cuts.add(Math.round(v * 100) / 100);
  const C = [...cuts].sort((a, b) => a - b);

  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i], b = C[i + 1], mid = (a + b) / 2, w = b - a;
    if (w < 0.02) continue;
    const gap = gaps.find(g => mid > g[0] && mid < g[1]);
    const px = x1 + ux * mid, pz = z1 + uz * mid;
    const put = (y0, y1) => {
      if (y1 - y0 < 0.02) return;
      const m = P.boxC(w, y1 - y0, thick, material, { collide: false, shadow: opts.shadow ?? false });
      m.position.set(px, (y0 + y1) / 2, pz);
      m.rotation.y = ry;
      visGroup.add(m);
      if (opts.collide !== false) proxyBox(w, y1 - y0, thick + 0.12, px, (y0 + y1) / 2, pz, ry);
    };
    if (!gap) { put(yBot, yTop); continue; }
    put(yBot, gap[2]);          // sill below the opening
    put(gap[3], yTop);          // lintel above it
  }
  return { len, ry, H };
}

// -----------------------------------------------------------------------------
// THE NEON SIGN — this arena's signature prop.
//
// Each sign is: a dim backing box (shared material, frozen later) + an emissive
// text face + two emissive "tube" bars top and bottom + an additive halo card,
// and optionally one real point light. A per-sign flicker profile drives the
// text emissiveIntensity, the tube emissiveIntensity, the halo opacity and the
// light intensity together, so a stuttering tube really does strobe the room.
// -----------------------------------------------------------------------------
function flickerValue(profile, t, phase) {
  switch (profile) {
    case 'pulse':   // slow neon breathe
      return 0.42 + 0.58 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.05 + phase), 1.4);
    case 'stutter': { // broken starter: dropouts and over-bright surges
      const n = Math.floor(t * 13 + phase * 17);
      const r = hash01(n);
      if (r < 0.15) return 0.04 + hash01(n * 7 + 3) * 0.22;
      if (r < 0.21) return 1.55;
      return 0.9 + 0.1 * Math.sin(t * 47 + phase);
    }
    case 'dying': {   // mostly dead, wakes up for a second at a time
      const s = Math.sin(t * 0.47 + phase);
      const base = s > 0.62 ? 1.0 : 0.14;
      return base * (0.78 + 0.22 * hash01(Math.floor(t * 21 + phase * 5)));
    }
    default:        // steady, with the faintest mains hum
      return 0.94 + 0.06 * Math.sin(t * 2.7 + phase);
  }
}

function neonSign(text, o = {}) {
  const ctx = CTX, P = ctx.props;
  const color = o.color ?? 0xff2ad0;
  const h = o.height ?? 0.55;
  const profile = o.profile ?? 'steady';
  const phase = o.phase ?? 0;

  const { material: face, aspect } = ctx.mat.textMaterial(text, {
    color: 0xffffff, emissive: color, emissiveIntensity: 2.6, fontSize: 80,
  });
  const w = Math.min(9, h * aspect);
  const g = new THREE.Group();

  if (o.backing !== false) {
    const back = P.boxC(w + 0.34, h + 0.34, 0.16, M.neonBack, { collide: false, shadow: false });
    back.position.z = -0.11;
    g.add(back);
  }

  const plate = P.boxC(w, h, 0.03, face, { collide: false, shadow: false });
  g.add(plate);

  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0x050506, emissive: new THREE.Color(color), emissiveIntensity: 3.4,
    roughness: 0.35, metalness: 0, toneMapped: true,
  });
  const barTop = P.boxC(w + 0.24, 0.055, 0.055, tubeMat, { collide: false, shadow: false });
  barTop.position.y = h / 2 + 0.13; g.add(barTop);
  const barBot = barTop.clone(); barBot.position.y = -h / 2 - 0.13; g.add(barBot);

  const haloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity: 0.17,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.5, h + 1.5), haloMat);
  halo.position.z = 0.06; halo.userData.collide = false; halo.castShadow = false;
  g.add(halo);

  let light = null;
  if (o.light) {
    light = new THREE.PointLight(color, o.intensity ?? 9, o.distance ?? 15, 2);
    light.position.set(0, 0, 0.55);
  }

  const baseFace = 2.6, baseTube = 3.4, baseHalo = 0.17, baseLight = o.intensity ?? 9;
  TICKS.push((dt, t) => {
    const f = flickerValue(profile, t, phase);
    face.emissiveIntensity = baseFace * f;
    tubeMat.emissiveIntensity = baseTube * f;
    haloMat.opacity = baseHalo * Math.min(1.4, f);
    if (light) light.intensity = baseLight * f;
  });

  return { group: g, light, width: w, height: h };
}

/** Place a neon sign flush to a wall. `face` is the outward normal direction. */
function placeNeon(list, text, x, y, z, ry, o = {}) {
  const s = neonSign(text, o);
  s.group.position.set(x, y, z);
  s.group.rotation.y = ry;
  CTX.addDecor(s.group);
  if (s.light) {
    s.light.position.set(x + Math.sin(ry) * 0.55, y, z + Math.cos(ry) * 0.55);
    CTX.light(s.light);
  }
  list.push(s);
  return s;
}

// -----------------------------------------------------------------------------
// Inclined runs — escalators and fixed stairs. Visible treads are decor; the
// player actually walks on a single invisible inclined slab so the capsule
// never snags on a step nose.
// -----------------------------------------------------------------------------
function inclineRun(visGroup, o) {
  const P = CTX.props;
  const rise = o.yTop - o.yBot;
  // Either give zTop (run along ±Z) or yaw + runLen (run along an arbitrary heading).
  const runLen = o.runLen ?? Math.abs(o.zTop - o.zBot);
  const yaw = o.yaw !== undefined ? o.yaw : ((o.zTop - o.zBot) < 0 ? Math.PI : 0);
  const w = o.width ?? 3.0;
  const steps = Math.max(4, Math.round(rise / 0.235));
  const stepH = rise / steps, stepD = runLen / steps;
  const alpha = Math.atan2(rise, runLen);
  const Lh = Math.hypot(rise, runLen);
  const esc = o.kind === 'escalator';

  const G = new THREE.Group(), GC = new THREE.Group();
  for (const g of [G, GC]) { g.position.set(o.x, o.yBot, o.zBot); g.rotation.y = yaw; }

  for (let i = 0; i < steps; i++) {
    const s = P.boxC(w, stepH, stepD, esc ? M.escStep : M.stairStep, { collide: false, shadow: false });
    s.position.set(0, stepH / 2 + i * stepH, stepD / 2 + i * stepD);
    G.add(s);
    if (esc) {
      const cl = P.boxC(w * 0.9, 0.014, stepD * 0.74, M.escCleat, { collide: false, shadow: false });
      cl.position.set(0, stepH + 0.008 + i * stepH, stepD / 2 + i * stepD);
      G.add(cl);
    } else if (i % 4 === 0) {
      const nose = P.boxC(w, 0.02, 0.06, M.hazard, { collide: false, shadow: false });
      nose.position.set(0, stepH + 0.011 + i * stepH, i * stepD + 0.04);
      G.add(nose);
    }
  }

  for (const sx of [-1, 1]) {
    const px = sx * (w / 2 + 0.22);
    const truss = P.boxC(0.4, 1.15, Lh, M.escSide, { collide: false, shadow: false });
    truss.position.set(px, rise / 2 - 0.3, runLen / 2);
    truss.rotation.x = -alpha; G.add(truss);

    const balus = P.boxC(0.06, 1.0, Lh, esc ? M.escGlass : M.escSide, { collide: false, shadow: false });
    balus.position.set(px, rise / 2 + 0.72, runLen / 2);
    balus.rotation.x = -alpha; G.add(balus);

    const rail = P.boxC(0.17, 0.13, Lh, o.handrailMat ?? M.rubberRail, { collide: false, shadow: false });
    rail.position.set(px, rise / 2 + 1.26, runLen / 2);
    rail.rotation.x = -alpha; G.add(rail);

    // underside soffit — reads as a proper escalator truss from the level below
    const soffit = P.boxC(0.1, 0.9, Lh, M.escSide, { collide: false, shadow: false });
    soffit.position.set(px, rise / 2 - 1.1, runLen / 2);
    soffit.rotation.x = -alpha; G.add(soffit);
  }
  const belly = P.boxC(w + 0.5, 0.14, Lh, M.escSide, { collide: false, shadow: false });
  belly.position.set(0, rise / 2 - 1.5, runLen / 2);
  belly.rotation.x = -alpha; G.add(belly);

  // --- colliders: one ramp slab + two invisible cheek walls + two landings
  const up = new THREE.Vector3(0, Math.cos(alpha), -Math.sin(alpha));
  const ramp = P.boxC(w, 0.6, Lh, M.invis, { collide: true, shadow: false, receive: false });
  ramp.position.set(0, rise / 2 + stepH * 0.5, runLen / 2).addScaledVector(up, -0.3);
  ramp.rotation.x = -alpha; ramp.visible = false; GC.add(ramp);
  for (const sx of [-1, 1]) {
    const cheek = P.boxC(0.3, 1.6, Lh, M.invis, { collide: true, shadow: false, receive: false });
    cheek.position.set(sx * (w / 2 + 0.15), rise / 2 + 0.8, runLen / 2);
    cheek.rotation.x = -alpha; cheek.visible = false; GC.add(cheek);
  }
  const landA = P.boxC(w + 0.8, 0.5, 1.6, M.invis, { collide: true, shadow: false, receive: false });
  landA.position.set(0, -0.25, -0.6); landA.visible = false; GC.add(landA);
  const landB = P.boxC(w + 0.8, 0.5, 1.6, M.invis, { collide: true, shadow: false, receive: false });
  landB.position.set(0, rise - 0.25, runLen + 0.6); landB.visible = false; GC.add(landB);

  visGroup.add(G);
  CTX.add(GC);
  return { alpha, steps, group: G };
}

/** Sagging catenary cable bundle along +X. */
function cableRun(group, x0, x1, y, z, sag, segs, r, material) {
  let prev = new THREE.Vector3(x0, y, z);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3(x0 + (x1 - x0) * t, y - sag * Math.sin(Math.PI * t), z);
    group.add(strut(prev, p, r, material));
    prev = p;
  }
}

/** Rust bleed under a metal fixture — a stained quad hugging a wall. */
function rustStreak(group, x, y, z, ry, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.rustDecal);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.userData.collide = false; m.castShadow = false;
  group.add(m);
}

// =============================================================================
// BUILD
// =============================================================================
export async function build(ctx) {
  CTX = ctx;
  TICKS = [];
  const P = ctx.props;
  const R = ctx.rng;
  const rDress = R.fork('dressing');
  const rDebris = R.fork('debris');
  const rTun = R.fork('tunnel');

  // ---------------------------------------------------------------------------
  // 1. MATERIAL PALETTE — 16 procedural surfaces, everything else solid/painted.
  //    Wet black-blue concrete and tile: low roughness, high envMapIntensity so
  //    the neon smears across every floor.
  // ---------------------------------------------------------------------------
  M = {
    tileWall: ctx.mat.surface('tile', {
      color: 0x36414f, grout: 0x121820, tiles: 6, repeat: 4, size: 512, seed: 11,
      roughness: 0.26, metalness: 0.06, envMapIntensity: 1.7,
    }),
    tileWallDeep: ctx.mat.surface('tile', {
      color: 0x1f2b37, grout: 0x0d1218, tiles: 5, repeat: 4, size: 512, seed: 12,
      roughness: 0.3, metalness: 0.05, envMapIntensity: 1.5,
    }),
    tileFloor: ctx.mat.surface('tile', {
      color: 0x2b323c, grout: 0x0f1319, tiles: 4, repeat: 4, size: 512, seed: 13,
      roughness: 0.17, metalness: 0.14, envMapIntensity: 2.1,
    }),
    platFloor: ctx.mat.surface('tile', {
      color: 0x242b33, grout: 0x0e1116, tiles: 8, repeat: 4, size: 512, seed: 14,
      roughness: 0.2, metalness: 0.12, envMapIntensity: 1.9,
    }),
    concrete: ctx.mat.surface('concrete', { color: 0x474d55, repeat: 3, size: 512, seed: 21 }),
    concreteDark: ctx.mat.surface('concrete', {
      color: 0x1f242b, repeat: 3, size: 512, seed: 22, roughness: 0.7, envMapIntensity: 0.9,
    }),
    concreteWet: ctx.mat.surface('concrete', {
      color: 0x2a3038, repeat: 3, size: 512, seed: 23,
      roughness: 0.3, metalness: 0.1, envMapIntensity: 1.6,
    }),
    asphalt: ctx.mat.surface('asphalt', {
      color: 0x1b1e23, repeat: 4, size: 512, seed: 31,
      roughness: 0.21, metalness: 0.06, envMapIntensity: 2.0,
    }),
    facade: ctx.mat.surface('brick', {
      color: 0x2c292e, mortar: 0x1e2026, rows: 14, repeat: 3, size: 512, seed: 41,
      roughness: 0.55, envMapIntensity: 1.1,
    }),
    panelMetal: ctx.mat.surface('metalPanel', {
      color: 0x47515b, panels: 4, repeat: 2, size: 256, seed: 51,
      roughness: 0.34, metalness: 0.8, envMapIntensity: 1.5,
    }),
    shutter: ctx.mat.surface('corrugated', {
      color: 0x333a43, ribs: 18, repeat: 2, size: 256, seed: 52,
      roughness: 0.42, metalness: 0.7, envMapIntensity: 1.2,
    }),
    rust: ctx.mat.surface('rustMetal', {
      color: 0x363c44, rust: 0x6d3a1a, repeat: 2, size: 256, seed: 53,
      roughness: 0.7, metalness: 0.6,
    }),
    trainSkin: ctx.mat.surface('corrugated', {
      color: 0x6b7683, ribs: 44, repeat: 2, size: 512, seed: 54,
      roughness: 0.31, metalness: 0.75, envMapIntensity: 1.7,
    }),
    ceilPanel: ctx.mat.surface('metalPanel', {
      color: 0x262c34, panels: 6, repeat: 3, size: 256, seed: 55,
      roughness: 0.62, metalness: 0.35,
    }),
    rockDark: ctx.mat.surface('rock', { color: 0x363b42, repeat: 1, size: 256, seed: 61 }),
    grimeFlat: ctx.mat.surface('flat', { color: 0x171b21, repeat: 1, size: 128, rough: 0.75 }),
  };

  // Untextured helpers (cached by argument, free to repeat).
  Object.assign(M, {
    invis: ctx.mat.solid({ color: 0x000000 }),
    neonBack: ctx.mat.solid({ color: 0x0a0b0f, roughness: 0.55, metalness: 0.3 }),
    darkSteel: ctx.mat.metal(0x2f353c, 0.45),
    brightSteel: ctx.mat.metal(0x8e979f, 0.28),
    escStep: ctx.mat.solid({ color: 0x3b434c, roughness: 0.4, metalness: 0.7, envMapIntensity: 1.4 }),
    escCleat: ctx.mat.solid({ color: 0x585f68, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.6 }),
    escSide: ctx.mat.solid({ color: 0x272d34, roughness: 0.35, metalness: 0.65, envMapIntensity: 1.3 }),
    escGlass: ctx.mat.glassCheap({ color: 0x2c4a56, opacity: 0.3 }),
    rubberRail: ctx.mat.solid({ color: 0x131417, roughness: 0.65, metalness: 0.1 }),
    stairStep: ctx.mat.solid({ color: 0x343a41, roughness: 0.42, metalness: 0.25, envMapIntensity: 1.2 }),
    hazard: ctx.mat.solid({ color: 0xd8b22a, roughness: 0.5, emissive: 0x2a2004, emissiveIntensity: 1 }),
    tactile: ctx.mat.solid({ color: 0xd9a516, roughness: 0.55, emissive: 0x3a2803, emissiveIntensity: 1.4 }),
    railSteel: ctx.mat.metal(0x9aa3ab, 0.22),
    sleeper: ctx.mat.solid({ color: 0x241f1c, roughness: 0.95 }),
    cable: ctx.mat.solid({ color: 0x0e1013, roughness: 0.85 }),
    wetSheen: ctx.mat.solid({
      color: 0x04070b, roughness: 0.05, metalness: 0.55,
      transparent: true, opacity: 0.5, envMapIntensity: 2.6,
    }),
    seatFab: ctx.mat.surface('fabric', { color: 0x27334a, repeat: 2, size: 128, seed: 71 }),
  });

  // Painted decals / animated maps.
  M.rustDecal = ctx.mat.painted(64, 128, (c2, W, H) => {
    c2.clearRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = hash01(i * 13 + 1) * W;
      const w = 1 + hash01(i * 31 + 5) * 5;
      const len = H * (0.25 + hash01(i * 7 + 2) * 0.75);
      const g = c2.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(120,58,20,0.85)');
      g.addColorStop(0.5, 'rgba(96,48,18,0.42)');
      g.addColorStop(1, 'rgba(70,36,14,0)');
      c2.fillStyle = g;
      c2.fillRect(x, 0, w, len);
    }
  }, { transparent: true, roughness: 0.9, depthWrite: false, alphaTest: 0.01 });

  M.puddleDecal = ctx.mat.painted(256, 256, (c2, W, H) => {
    c2.clearRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const x = hash01(i * 91 + 3) * W, y = hash01(i * 17 + 9) * H;
      const r = 18 + hash01(i * 5 + 4) * 62;
      const g = c2.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(4,8,13,0.9)');
      g.addColorStop(0.7, 'rgba(6,11,17,0.55)');
      g.addColorStop(1, 'rgba(8,14,20,0)');
      c2.fillStyle = g; c2.beginPath(); c2.arc(x, y, r, 0, 6.283); c2.fill();
    }
  }, { transparent: true, roughness: 0.06, depthWrite: false, alphaTest: 0.01 });

  M.crackDecal = ctx.mat.painted(256, 128, (c2, W, H) => {
    c2.clearRect(0, 0, W, H);
    c2.strokeStyle = 'rgba(214,232,244,0.75)'; c2.lineWidth = 1.6;
    const hx = W * 0.42, hy = H * 0.45;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.283 + hash01(i * 5) * 0.4;
      let px = hx, py = hy;
      c2.beginPath(); c2.moveTo(px, py);
      for (let s = 0; s < 5; s++) {
        px += Math.cos(a + hash01(i * 9 + s) * 0.7 - 0.35) * (10 + s * 9);
        py += Math.sin(a + hash01(i * 3 + s) * 0.7 - 0.35) * (8 + s * 7);
        c2.lineTo(px, py);
      }
      c2.stroke();
    }
    for (let r = 12; r < 60; r += 16) {
      c2.beginPath(); c2.arc(hx, hy, r, 0, 6.283); c2.stroke();
    }
  }, { transparent: true, roughness: 0.1, depthWrite: false, alphaTest: 0.02 });

  M.handrailAnim = ctx.mat.painted(128, 16, (c2, W, H) => {
    c2.fillStyle = '#121317'; c2.fillRect(0, 0, W, H);
    c2.strokeStyle = 'rgba(80,86,96,0.9)'; c2.lineWidth = 2;
    for (let x = -H; x < W + H; x += 16) {
      c2.beginPath(); c2.moveTo(x, 0); c2.lineTo(x + H, H); c2.stroke();
    }
  }, { transparent: false, roughness: 0.6 });
  M.handrailAnim.map.wrapS = M.handrailAnim.map.wrapT = THREE.RepeatWrapping;
  M.handrailAnim.map.repeat.set(24, 1);

  const graffiti = (text, color, seed) => ctx.mat.painted(256, 128, (c2, W, H) => {
    c2.clearRect(0, 0, W, H);
    c2.font = 'bold 74px "Arial Black", Impact, sans-serif';
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.lineWidth = 12; c2.strokeStyle = 'rgba(6,8,12,0.85)';
    c2.strokeText(text, W / 2, H / 2);
    c2.fillStyle = new THREE.Color(color).getStyle();
    c2.fillText(text, W / 2, H / 2);
    for (let i = 0; i < 40; i++) {
      c2.fillRect(hash01(i * 3 + seed) * W, hash01(i * 29 + seed) * H,
        1 + hash01(i * 11 + seed) * 3, 1 + hash01(i * 13 + seed) * 9);
    }
  }, { transparent: true, roughness: 0.85, depthWrite: false, alphaTest: 0.02 });

  // ---------------------------------------------------------------------------
  // 2. ATMOSPHERE
  // ---------------------------------------------------------------------------
  ctx.sky({ color: 0x080c14 });
  ctx.fog(0x080c14, 0.018, 0, 'exp2');
  ctx.useEnvironment(0.9);
  ctx.grade({
    exposure: 1.05, saturation: 1.3, contrast: 1.12,
    lift: [0.0, 0.006, 0.02], gain: [0.97, 1.0, 1.07],
    vignette: 1.28, grain: 0.06, scanline: 0.15,
    bloom: 0.8, bloomRadius: 0.85, bloomThreshold: 0.6, aberration: 0.0024,
  });
  ctx.soundscape('rain', 'tense', { size: 0.75, dark: 0.4, wet: 0.32 });

  const inBore = (x, z) => x > L.tunW0 && x < L.tunE1 &&
    ((z > L.boreA[0] && z < L.boreA[1]) || (z > L.boreB[0] && z < L.boreB[1]));
  const PUDDLES = [[-46, -30, 9], [-20, 26, 8], [24, 30, 10], [50, -22, 9], [6, -14, 7], [-56, 8, 7]];
  ctx.setSurface((x, z) => {
    if (inBore(x, z)) return 'water';
    for (const p of PUDDLES) if ((x - p[0]) ** 2 + (z - p[1]) ** 2 < p[2] * p[2]) return 'water';
    if (Math.abs(x) > L.PX) return 'concrete';
    return 'tile';
  });

  // ---------------------------------------------------------------------------
  // 3. KEY LIGHTING — 3 shadow casters, everything else emissive + bloom.
  // ---------------------------------------------------------------------------
  ctx.light(new THREE.HemisphereLight(0x14203a, 0x04070b, 0.34));
  ctx.light(new THREE.AmbientLight(0x0b1522, 0.55));

  const cityGlow = new THREE.DirectionalLight(0x7fa6d8, 1.15);
  cityGlow.position.set(30, 70, -40);
  cityGlow.target.position.set(4, 0, -2);
  ctx.light(cityGlow, { shadow: true, range: 46, far: 200 });

  const shaft = new THREE.SpotLight(0xffb055, 26, 30, Math.PI / 5.2, 0.55, 1.7);
  shaft.position.set(7, 12.5, -2);
  shaft.target.position.set(7, 0, -2);
  ctx.light(shaft, { shadow: true, far: 34 });

  const hallKey = new THREE.SpotLight(0x9fd8ff, 18, 26, Math.PI / 4.4, 0.6, 1.6);
  hallKey.position.set(-14, 7.4, 0);
  hallKey.target.position.set(-14, 0, 0);
  ctx.light(hallKey, { shadow: true, far: 28 });

  // Static visual groups, frozen at the end of the build into one mesh/material.
  const gStreet = new THREE.Group();
  const gConcourse = new THREE.Group();
  const gPlatform = new THREE.Group();
  const gTunnel = new THREE.Group();
  const gTrain = new THREE.Group();
  const gDecal = new THREE.Group();

  // ===========================================================================
  // 4. LEVEL 2 — PLATFORMS (y = -7) AND THE FLOODED TRACK BEDS (y = -8)
  // ===========================================================================
  // Trench floor runs unbroken from the west stub, under the station, all the
  // way to the far end of the east tunnel — nothing to fall through.
  emitSlab(gPlatform, L.tunW0, L.tunE1, -8, 8, L.trenchY, 0.8, M.concreteWet, [], { panel: 8 });

  // Two island-less side platforms, 11 m wide, flanking the two tracks.
  emitSlab(gPlatform, -L.PX, L.PX, -L.PZ, -8, L.platY, 1.0, M.platFloor, [], { panel: 8 });
  emitSlab(gPlatform, -L.PX, L.PX, 8, L.PZ, L.platY, 1.0, M.platFloor, [], { panel: 8 });
  // Central pier plinth between the two tracks.
  emitSlab(gPlatform, -L.PX, L.PX, -2, 2, -7.4, 0.6, M.concreteWet, [], { panel: 8 });

  // Platform fascia (dark concrete lip) + yellow tactile edge strip.
  for (const [z, sgn] of [[-8, -1], [8, 1]]) {
    for (let x = -L.PX; x < L.PX; x += 8) {
      const w = Math.min(8, L.PX - x);
      const fas = P.boxC(w, 1.0, 0.14, M.concreteDark, { collide: false, shadow: false });
      fas.position.set(x + w / 2, -7.5, z + sgn * 0.07);
      gPlatform.add(fas);
    }
    const strip = P.boxC(L.PX * 2, 0.03, 0.55, M.tactile, { collide: false, shadow: false });
    strip.position.set(0, -6.985, z - sgn * 0.34);
    gPlatform.add(strip);
  }

  // Instanced tactile studs along both platform edges — one draw call.
  const studGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.022, 6);
  ctx.addDecor(P.scatter(studGeo, M.tactile, 560, (i, d) => {
    const per = 280;
    const side = i < per ? -1 : 1;
    const k = i % per;
    const x = -L.PX + 0.4 + k * ((L.PX * 2 - 0.8) / (per - 1));
    d.position.set(x, -6.96, side === -1 ? -8.34 : 8.34);
    return true;
  }, 4201));

  // --- Platform hall shell -------------------------------------------------
  wallStrip(gPlatform, -L.PX, -L.PZ, L.PX, -L.PZ, L.trenchY, L.platCeil, 0.6, M.tileWallDeep);
  wallStrip(gPlatform, -L.PX, L.PZ, L.PX, L.PZ, L.trenchY, L.platCeil, 0.6, M.tileWallDeep);
  // End walls with the tunnel portals punched through them.
  const portalGaps = [[11, 17, L.trenchY, L.tunCeil], [21, 27, L.trenchY, L.tunCeil]];
  wallStrip(gPlatform, L.PX, -L.PZ, L.PX, L.PZ, L.trenchY, L.platCeil, 0.9, M.concreteDark, portalGaps);
  wallStrip(gPlatform, -L.PX, -L.PZ, -L.PX, L.PZ, L.trenchY, L.platCeil, 0.9, M.concreteDark, portalGaps);

  // Portal surrounds — heavy concrete lintels that read as tunnel mouths.
  for (const sx of [-1, 1]) {
    for (const bore of [L.boreA, L.boreB]) {
      const cz = (bore[0] + bore[1]) / 2;
      const ring = P.boxC(1.2, 6.4, 7.4, M.concreteDark, { collide: false, shadow: false });
      ring.position.set(sx * (L.PX + 0.1), -4.8, cz);
      gPlatform.add(ring);
      const mouth = P.boxC(1.35, 5.8, 6.0, M.grimeFlat, { collide: false, shadow: false });
      mouth.position.set(sx * (L.PX + 0.1), -5.1, cz);
      gPlatform.add(mouth);
      const hazardBar = P.boxC(1.3, 0.22, 6.0, M.hazard, { collide: false, shadow: false });
      hazardBar.position.set(sx * (L.PX + 0.1), -2.35, cz);
      gPlatform.add(hazardBar);
    }
  }

  // Roof columns down the pier, tying the platform ceiling to the plinth.
  for (let x = -48; x <= 48; x += 8) {
    const col = P.column(4.5, 0.42, M.concreteDark, { seg: 12 });
    col.position.set(x, -7.4, 0);
    gPlatform.add(col);
    proxyBox(1.0, 4.6, 1.0, x, -5.1, 0);
    rustStreak(gDecal, x, -5.6, 0.46, 0, 0.9, 2.6);
  }

  // ===========================================================================
  // 5. RUNNING TRACK — rails, sleepers, third rail, and the standing water
  // ===========================================================================
  const trackZ = [-5, 5];
  for (const cz of trackZ) {
    for (const off of [-0.7175, 0.7175]) {
      const rail = P.boxC(L.tunE1 - L.tunW0, 0.16, 0.075, M.railSteel, { collide: false, shadow: false });
      rail.position.set((L.tunW0 + L.tunE1) / 2, -7.86, cz + off);
      gPlatform.add(rail);
    }
    const third = P.boxC(L.tunE1 - L.tunW0, 0.1, 0.13, M.rust, { collide: false, shadow: false });
    third.position.set((L.tunW0 + L.tunE1) / 2, -7.6, cz + 1.5);
    gPlatform.add(third);
  }
  const sleeperGeo = new THREE.BoxGeometry(0.24, 0.14, 2.5);
  ctx.addDecor(P.scatter(sleeperGeo, M.sleeper, 460, (i, d, r) => {
    const per = 230;
    const cz = i < per ? trackZ[0] : trackZ[1];
    const k = i % per;
    const x = L.tunW0 + 0.6 + k * ((L.tunE1 - L.tunW0 - 1.2) / (per - 1));
    d.position.set(x, -7.98, cz + r.range(-0.06, 0.06));
    d.rotation.y = r.range(-0.02, 0.02);
    return true;
  }, 5150));

  // Standing water: 0.35 m in the trench, one animated material, two planes.
  const waterMat = ctx.mat.water({ repeat: 44, color: 0x0d2430, opacity: 0.88, transmission: 0.0 });
  for (const bore of [L.boreA, L.boreB]) {
    const wp = P.ground(L.tunE1 - L.tunW0, bore[1] - bore[0], waterMat, { collide: false });
    wp.position.set((L.tunW0 + L.tunE1) / 2, L.waterY, (bore[0] + bore[1]) / 2);
    wp.renderOrder = 2;
    ctx.addDecor(wp);
  }

  // ===========================================================================
  // 6. TUNNELS — 40 m of walkable bore east, a short dark stub west
  // ===========================================================================
  function buildTunnel(x0, x1, crossPassages) {
    const gaps = crossPassages.map(([a, b]) => [a - x0, b - x0, L.trenchY, -3.6]);
    // outer walls
    wallStrip(gTunnel, x0, L.boreA[0], x1, L.boreA[0], L.trenchY, L.tunCeil, 0.6, M.concreteDark);
    wallStrip(gTunnel, x0, L.boreB[1], x1, L.boreB[1], L.trenchY, L.tunCeil, 0.6, M.concreteDark);
    // central pier, pierced by the cross passages
    wallStrip(gTunnel, x0, L.boreA[1], x1, L.boreA[1], L.trenchY, L.tunCeil, 0.5, M.concreteDark, gaps);
    wallStrip(gTunnel, x0, L.boreB[0], x1, L.boreB[0], L.trenchY, L.tunCeil, 0.5, M.concreteDark, gaps);
    // ceiling
    emitSlab(gTunnel, x0, x1, L.boreA[0], L.boreB[1], L.tunCeil + 0.4, 0.4, M.concreteDark, [], { panel: 8 });
    // ribbed segment rings every 4 m — sells the bored-tunnel read
    for (let x = x0 + 2; x < x1; x += 4) {
      for (const bore of [L.boreA, L.boreB]) {
        const cz = (bore[0] + bore[1]) / 2;
        const ring = P.boxC(0.22, 5.9, 6.3, M.concrete, { collide: false, shadow: false });
        ring.position.set(x, -5.05, cz); gTunnel.add(ring);
        const hollow = P.boxC(0.3, 5.5, 5.85, M.grimeFlat, { collide: false, shadow: false });
        hollow.position.set(x, -5.15, cz); gTunnel.add(hollow);
      }
    }
    // sagging cable bundles + cable trays along both outer walls
    for (const [cz, sgn] of [[L.boreA[0], 1], [L.boreB[1], -1]]) {
      const zc = cz + sgn * 0.36;
      const tray = P.boxC(x1 - x0, 0.1, 0.42, M.rust, { collide: false, shadow: false });
      tray.position.set((x0 + x1) / 2, -3.1, zc); gTunnel.add(tray);
      for (let x = x0; x < x1 - 4; x += 6) {
        for (let c = 0; c < 3; c++) {
          cableRun(gTunnel, x, x + 6, -3.35 - c * 0.11, zc + (c - 1) * 0.1, 0.34, 5, 0.028, M.cable);
        }
      }
    }
  }
  buildTunnel(L.tunE0, L.tunE1, [[66, 70], [79, 83]]);
  buildTunnel(L.tunW0, L.tunW1, [[-63, -60]]);
  // Hard caps at both far ends — the world is sealed.
  wallStrip(gTunnel, L.tunE1, L.boreA[0], L.tunE1, L.boreB[1], L.trenchY, L.tunCeil, 1.2, M.concreteDark);
  wallStrip(gTunnel, L.tunW0, L.boreA[0], L.tunW0, L.boreB[1], L.trenchY, L.tunCeil, 1.2, M.concreteDark);

  // Instanced conduits: four parallel runs of pipe down each tunnel wall.
  const conduitGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.9, 7);
  conduitGeo.rotateZ(Math.PI / 2);
  ctx.addDecor(P.scatter(conduitGeo, M.rust, 420, (i, d, r) => {
    const lane = i % 4;
    const seg = Math.floor(i / 4);
    const walls = [[L.boreA[0] + 0.28, 1], [L.boreB[1] - 0.28, -1]];
    const total = 105;
    if (seg >= total) return false;
    const wall = walls[seg % 2];
    const s = Math.floor(seg / 2);
    let x = L.tunW0 + 1.95 + s * 4;
    if (x > L.tunW1 - 1 && x < L.tunE0 + 1) return false;
    if (x > L.tunE1 - 1) return false;
    d.position.set(x, -2.85 - lane * 0.17, wall[0] + (lane % 2) * 0.09);
    d.rotation.z = r.range(-0.01, 0.01);
    return true;
  }, 6120));

  // Caved-in rubble wall at the end of the north bore — the deep hiding pocket.
  const caveIn = P.rubble(4.2, 34, M.rockDark, 909);
  caveIn.position.set(87, -8, -5);
  ctx.addDecor(caveIn);
  proxyBox(3.0, 6.0, 6.2, 88.4, -5, -5);
  for (let i = 0; i < 9; i++) {
    const slab = P.boxC(rDebris.range(0.6, 2.2), rDebris.range(0.2, 0.5), rDebris.range(0.8, 2.4),
      M.concrete, { collide: false, shadow: true });
    slab.position.set(85 + rDebris.range(-2.5, 2.5), -7.4 + i * 0.42, -5 + rDebris.range(-2.4, 2.4));
    slab.rotation.set(rDebris.range(-0.5, 0.5), rDebris.range(0, 3.1), rDebris.range(-0.5, 0.5));
    ctx.addDecor(slab);
  }
  // South bore dead-ends against the cap; a collapsed steel arch leans across it.
  for (let i = 0; i < 5; i++) {
    const arch = P.boxC(0.3, 5.2, 0.3, M.rust, { collide: false, shadow: true });
    arch.position.set(90 + i * 0.9, -5.3, 4 + rTun.range(-2, 2));
    arch.rotation.z = rTun.range(-0.7, 0.7); arch.rotation.x = rTun.range(-0.3, 0.3);
    ctx.addDecor(arch);
  }
  // West stub rubble cap.
  const westCave = P.rubble(3.4, 22, M.rockDark, 313);
  westCave.position.set(-66, -8, 5);
  ctx.addDecor(westCave);

  // Widely spaced emergency lamps: geometry everywhere, three real lights.
  const lampPositions = [
    [58, -7.7, -2.4], [66, -7.7, 7.6], [74, -7.7, -2.4], [82, -7.7, 7.6], [90, -7.7, -2.4],
    [-58, -7.7, 7.6], [-64, -7.7, -2.4],
  ];
  lampPositions.forEach((p, i) => {
    const cage = P.boxC(0.26, 0.3, 0.16, M.rust, { collide: false, shadow: false });
    cage.position.set(p[0], -3.4, p[2]);
    gTunnel.add(cage);
    const bulb = P.boxC(0.18, 0.2, 0.06, ctx.mat.emissive(0xffa23a, 5.5), { collide: false, shadow: false });
    bulb.position.set(p[0], -3.4, p[2] + (p[2] > 0 ? -0.11 : 0.11));
    ctx.addDecor(bulb);
    rustStreak(gDecal, p[0], -4.4, p[2] + (p[2] > 0 ? -0.16 : 0.16), 0, 0.5, 1.8);
    if (i === 0 || i === 2 || i === 4) {
      const pl = new THREE.PointLight(0xffa23a, 6.5, 16, 2);
      pl.position.set(p[0], -3.5, p[2] + (p[2] > 0 ? -0.5 : 0.5));
      ctx.light(pl);
    }
  });

  // ===========================================================================
  // 7. THE DERAILED CARRIAGE — a walk-through shell shoved against platform B
  // ===========================================================================
  const CAR = { len: 22, halfW: 1.5, floorY: -6.95, cx: 19, cz: 6.2, yaw: 0.032 };
  const carVis = new THREE.Group();
  const carCol = new THREE.Group();
  for (const g of [carVis, carCol]) {
    g.position.set(CAR.cx, CAR.floorY, CAR.cz);
    g.rotation.y = CAR.yaw;
  }
  const HL = CAR.len / 2;
  const doorsAt = [-7.5, 0, 7.5], doorW = 1.45;
  // wall segments between the doors, per side
  const segs = [];
  {
    let cursor = -HL;
    for (const d of doorsAt) {
      segs.push([cursor, d - doorW / 2]);
      cursor = d + doorW / 2;
    }
    segs.push([cursor, HL]);
  }

  const carGlass = ctx.mat.glassCheap({ color: 0x14232c, opacity: 0.34 });
  for (const sz of [-1, 1]) {
    const zw = sz * CAR.halfW;
    for (const [a, b] of segs) {
      const w = b - a, mid = (a + b) / 2;
      if (w < 0.05) continue;
      const lower = P.boxC(w, 0.95, 0.1, M.trainSkin, { collide: false, shadow: true });
      lower.position.set(mid, 0.475, zw); carVis.add(lower);
      const upper = P.boxC(w, 0.5, 0.1, M.trainSkin, { collide: false, shadow: true });
      upper.position.set(mid, 2.2, zw); carVis.add(upper);
      // window band: glass + mullions
      const glass = P.boxC(w - 0.12, 0.95, 0.03, carGlass, { collide: false, shadow: false });
      glass.position.set(mid, 1.45, zw); carVis.add(glass);
      const nMull = Math.max(1, Math.round(w / 1.6));
      for (let k = 0; k <= nMull; k++) {
        const mu = P.boxC(0.09, 1.0, 0.12, M.darkSteel, { collide: false, shadow: false });
        mu.position.set(a + (w * k) / nMull, 1.45, zw); carVis.add(mu);
      }
      // cracked pane — a spidered overlay on one bay per side
      if (Math.abs(mid) > 6) {
        const crack = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, 0.9), M.crackDecal);
        crack.position.set(mid, 1.45, zw + sz * 0.05);
        crack.rotation.y = sz > 0 ? 0 : Math.PI;
        crack.userData.collide = false; crack.castShadow = false;
        carVis.add(crack);
      }
      // collider for this panel
      const col = P.boxC(w, 2.6, 0.2, M.invis, { collide: true, shadow: false, receive: false });
      col.position.set(mid, 1.3, zw); col.visible = false; carCol.add(col);
    }
    // door pockets: recessed jambs left open
    for (const d of doorsAt) {
      for (const s2 of [-1, 1]) {
        const jamb = P.boxC(0.1, 2.0, 0.16, M.darkSteel, { collide: false, shadow: false });
        jamb.position.set(d + s2 * (doorW / 2 + 0.05), 1.0, zw); carVis.add(jamb);
      }
      const head = P.boxC(doorW + 0.2, 0.14, 0.16, M.darkSteel, { collide: false, shadow: false });
      head.position.set(d, 2.07, zw); carVis.add(head);
    }
    // skirt + bogie fairing
    const skirt = P.boxC(CAR.len, 0.5, 0.12, M.rust, { collide: false, shadow: false });
    skirt.position.set(0, -0.3, zw * 0.96); carVis.add(skirt);
  }

  // Underframe, roof, ends.
  const under = P.boxC(CAR.len, 0.42, 2.86, M.rust, { collide: false, shadow: true });
  under.position.set(0, -0.33, 0); carVis.add(under);
  const floorPan = P.boxC(CAR.len, 0.12, 2.86, M.panelMetal, { collide: false, shadow: false });
  floorPan.position.set(0, -0.06, 0); carVis.add(floorPan);
  const floorCol = P.boxC(CAR.len, 0.5, 2.9, M.invis, { collide: true, shadow: false, receive: false });
  floorCol.position.set(0, -0.25, 0); floorCol.visible = false; carCol.add(floorCol);

  const roof = P.boxC(CAR.len, 0.16, 3.02, M.trainSkin, { collide: false, shadow: true });
  roof.position.set(0, 2.53, 0); carVis.add(roof);
  const roofCrown = P.boxC(CAR.len, 0.22, 2.3, M.trainSkin, { collide: false, shadow: true });
  roofCrown.position.set(0, 2.68, 0); carVis.add(roofCrown);
  const roofCol = P.boxC(CAR.len, 0.3, 3.05, M.invis, { collide: true, shadow: false, receive: false });
  roofCol.position.set(0, 2.6, 0); roofCol.visible = false; carCol.add(roofCol);
  for (let i = 0; i < 7; i++) {   // roof-mounted equipment boxes
    const eq = P.boxC(1.4, 0.28, 1.1, M.panelMetal, { collide: false, shadow: true });
    eq.position.set(-8.5 + i * 3, 2.9, rDress.range(-0.5, 0.5)); carVis.add(eq);
  }

  // Cab end (east) and open gangway end (west, player can walk straight in).
  const cab = P.boxC(0.18, 2.5, 2.9, M.trainSkin, { collide: false, shadow: true });
  cab.position.set(HL, 1.25, 0); carVis.add(cab);
  const cabGlass = P.boxC(0.06, 1.0, 2.2, carGlass, { collide: false, shadow: false });
  cabGlass.position.set(HL - 0.1, 1.7, 0); carVis.add(cabGlass);
  const cabCol = P.boxC(0.4, 2.8, 2.9, M.invis, { collide: true, shadow: false, receive: false });
  cabCol.position.set(HL, 1.4, 0); cabCol.visible = false; carCol.add(cabCol);
  const gangway = P.boxC(0.18, 2.5, 0.8, M.trainSkin, { collide: false, shadow: true });
  for (const sz of [-1, 1]) {
    const gw = gangway.clone();
    gw.position.set(-HL, 1.25, sz * 1.05); carVis.add(gw);
    const gc = P.boxC(0.4, 2.8, 0.9, M.invis, { collide: true, shadow: false, receive: false });
    gc.position.set(-HL, 1.4, sz * 1.05); gc.visible = false; carCol.add(gc);
  }

  // Interior: seat bays, grab poles, litter.
  for (let i = 0; i < 8; i++) {
    for (const sz of [-1, 1]) {
      const x = -9 + i * 2.6;
      if (doorsAt.some(d => Math.abs(x - d) < 1.3)) continue;
      const base = P.boxC(2.0, 0.42, 0.6, M.darkSteel, { collide: false, shadow: false });
      base.position.set(x, 0.21, sz * 1.05); carVis.add(base);
      const cush = P.boxC(1.95, 0.1, 0.58, M.seatFab, { collide: false, shadow: false });
      cush.position.set(x, 0.47, sz * 1.05); carVis.add(cush);
      const backr = P.boxC(1.95, 0.55, 0.1, M.seatFab, { collide: false, shadow: false });
      backr.position.set(x, 0.75, sz * 1.4); carVis.add(backr);
    }
  }
  for (let i = 0; i < 10; i++) {
    const pole = P.boxC(0.05, 2.5, 0.05, M.brightSteel, { collide: false, shadow: false });
    pole.position.set(-9.5 + i * 2.1, 1.25, rDress.chance(0.5) ? 0.55 : -0.55);
    carVis.add(pole);
  }
  const spine = P.boxC(CAR.len - 1, 0.06, 0.06, M.brightSteel, { collide: false, shadow: false });
  spine.position.set(0, 2.35, 0); carVis.add(spine);

  // Two interior strip lights: one dead, one badly failing.
  const carLampMat = new THREE.MeshStandardMaterial({
    color: 0x08090b, emissive: new THREE.Color(0xbfe6ff), emissiveIntensity: 3.0, toneMapped: true,
  });
  const carLampDead = ctx.mat.emissive(0x1a2028, 0.25);
  for (const sz of [-1, 1]) {
    const lamp = P.boxC(CAR.len - 2, 0.06, 0.22, sz < 0 ? carLampMat : carLampDead,
      { collide: false, shadow: false });
    lamp.position.set(0, 2.42, sz * 0.85);
    (sz < 0 ? carVis : carVis).add(lamp);
  }
  const carLight = new THREE.PointLight(0xbfe6ff, 5, 13, 2);
  carLight.position.set(CAR.cx - 4, CAR.floorY + 2.1, CAR.cz);
  ctx.light(carLight);
  TICKS.push((dt, t) => {
    const f = flickerValue('stutter', t, 3.7);
    carLampMat.emissiveIntensity = 3.0 * f;
    carLight.intensity = 5 * f;
  });

  // Bogies, half-buried in the flood, and the derailment scar.
  for (const bx of [-7.2, 7.2]) {
    const bogie = P.boxC(2.6, 0.5, 2.2, M.rust, { collide: false, shadow: true });
    bogie.position.set(bx, -0.85, 0); carVis.add(bogie);
    for (const wz of [-1.05, 1.05]) for (const wx of [-0.9, 0.9]) {
      const wheel = P.cyl(0.42, 0.42, 0.12, M.railSteel, { seg: 14, collide: false, shadow: false });
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(bx + wx, -0.95, wz + 0.06);
      carVis.add(wheel);
    }
  }
  carVis.add(strut(new THREE.Vector3(-HL, -0.6, -1.3), new THREE.Vector3(-HL - 2.6, -1.0, -2.4), 0.05, M.cable));
  ctx.addDecor(P.rubble(2.6, 16, M.rockDark, 771).translateX(6).translateZ(3.4).translateY(-8));
  gTrain.add(carVis);
  ctx.add(carCol);

  // Torn-off door leaf lying in the water beside the carriage.
  const leaf = P.boxC(1.4, 0.08, 2.0, M.trainSkin, { collide: false, shadow: true });
  leaf.position.set(4.5, -7.55, 3.4); leaf.rotation.set(0.1, 0.4, 0.06);
  ctx.addDecor(leaf);

  // ===========================================================================
  // 8. LEVEL 1 — THE CONCOURSE (y = 0). Shell, ceiling, columns, mezzanine.
  // ===========================================================================
  emitSlab(gConcourse, -L.CX, L.CX, -L.CZ, L.CZ, L.conY, 0.9, M.tileFloor, FLOOR_HOLES, { panel: 8 });
  wallStrip(gConcourse, -L.CX, -L.CZ, L.CX, -L.CZ, L.conY, 9, 0.8, M.tileWall);
  wallStrip(gConcourse, -L.CX, L.CZ, L.CX, L.CZ, L.conY, 9, 0.8, M.tileWall);
  wallStrip(gConcourse, -L.CX, -L.CZ, -L.CX, L.CZ, L.conY, 9, 0.8, M.tileWall);
  wallStrip(gConcourse, L.CX, -L.CZ, L.CX, L.CZ, L.conY, 9, 0.8, M.tileWall);
  // Suspended ceiling plane (the street deck sits on top of it in the middle).
  emitSlab(gConcourse, -L.CX, L.CX, -L.CZ, L.CZ, L.conCeil, 0.35, M.ceilPanel, CEIL_HOLES,
    { panel: 8, collide: false });
  // Deep structural beams every 9 m — breaks up the ceiling, catches the bloom.
  for (let x = -58.5; x <= 58.5; x += 9) {
    const beam = P.boxC(0.7, 0.85, L.CZ * 2, M.concrete, { collide: false, shadow: false });
    beam.position.set(x, 7.3, 0); gConcourse.add(beam);
  }

  // --- column grid ---------------------------------------------------------
  const nearHole = (x, z, pad) => FLOOR_HOLES.some(h =>
    x > h[0] - pad && x < h[1] + pad && z > h[2] - pad && z < h[3] + pad);
  for (let x = -54; x <= 54.1; x += 13.5) {
    for (let z = -33; z <= 33.1; z += 13.2) {
      if (nearHole(x, z, 3.5)) continue;
      if (Math.hypot(x + 14, z) < 6) continue;              // ad pillar
      if (Math.hypot(x + 34, z + 6) < 4) continue;          // spawn
      const col = P.column(L.conCeil, 0.5, M.concrete, { seg: 14 });
      col.position.set(x, 0, z); gConcourse.add(col);
      proxyBox(1.15, L.conCeil, 1.15, x, L.conCeil / 2, z);
      // wet grime skirt + a strip of missing tiles at eye level
      const skirt = P.boxC(1.4, 0.5, 1.4, M.concreteDark, { collide: false, shadow: false });
      skirt.position.set(x, 0.25, z); gConcourse.add(skirt);
      if (hash01(Math.round(x * 7 + z * 3)) < 0.35) {
        rustStreak(gDecal, x, 2.4, z + 0.52, 0, 0.8, 3.0);
      }
    }
  }

  // --- partition walls carving the hall into north/south service strips ----
  const partGap = (c) => [[c - 2.1, c + 2.1, 0, 2.9]];
  const PW = 56;  // partitions stop short of the walls so the mezzanine ring is continuous
  for (const pz of [-24, 24]) {
    const gaps = [];
    for (const c of [-46, -18, 6, 34]) gaps.push(...partGap(c + PW));
    wallStrip(gConcourse, -PW, pz, PW, pz, 0, 5.4, 0.45, M.tileWall, gaps);
    // glazed clerestory above the partition
    for (let x = -PW; x < PW; x += 8) {
      const w = Math.min(8, PW - x);
      const gl = P.boxC(w, 1.4, 0.1, M.escGlass, { collide: false, shadow: false });
      gl.position.set(x + w / 2, 6.2, pz);
      gConcourse.add(gl);
    }
  }

  // --- mezzanine ring ------------------------------------------------------
  const mi = L.CX - L.mezzW, mj = L.CZ - L.mezzW;
  emitSlab(gConcourse, -L.CX, L.CX, -L.CZ, -mj, L.mezzY, 0.4, M.concreteWet, [], { panel: 8 });
  emitSlab(gConcourse, -L.CX, L.CX, mj, L.CZ, L.mezzY, 0.4, M.concreteWet, [], { panel: 8 });
  emitSlab(gConcourse, -L.CX, -mi, -mj, mj, L.mezzY, 0.4, M.concreteWet, [], { panel: 8 });
  emitSlab(gConcourse, mi, L.CX, -mj, mj, L.mezzY, 0.4, M.concreteWet, [], { panel: 8 });
  {
    const rail = (len, x, z, ry) => {
      const r = P.railing(len, 1.06, M.darkSteel, { postEvery: 2.6 });
      r.position.set(x, L.mezzY, z); r.rotation.y = ry;
      P.NOCOLLIDE(r); gConcourse.add(r);
      proxyBox(ry === 0 ? len : 0.2, 1.15, ry === 0 ? 0.2 : len, x, L.mezzY + 0.6, z);
    };
    rail(L.CX * 2, 0, -mj, 0);
    rail(L.CX * 2, 0, mj, 0);
    rail(4.9, -mi, -33.95, Math.PI / 2);   // split for the mezzanine stair landing
    rail(64.9, -mi, 3.95, Math.PI / 2);
    rail(mj * 2, mi, 0, Math.PI / 2);
    // props holding the walkway up
    for (let x = -58; x <= 58; x += 9.7) for (const z of [-mj + 0.4, mj - 0.4]) {
      const s = P.boxC(0.3, L.mezzY, 0.3, M.darkSteel, { collide: false, shadow: false });
      s.position.set(x, L.mezzY / 2, z); gConcourse.add(s);
    }
    for (let z = -32; z <= 32; z += 9.6) for (const x of [-mi + 0.4, mi - 0.4]) {
      const s = P.boxC(0.3, L.mezzY, 0.3, M.darkSteel, { collide: false, shadow: false });
      s.position.set(x, L.mezzY / 2, z); gConcourse.add(s);
    }
  }

  // ===========================================================================
  // 9. CIRCULATION — two escalators, a fixed stair, a mezzanine stair, a ladder
  // ===========================================================================
  // E1: concourse → street, rising north-to-south through the ceiling.
  inclineRun(gConcourse, {
    x: -16, zBot: -20, yBot: 0, zTop: -4, yTop: L.streetY, width: 3.0, kind: 'escalator',
  });
  // E2: concourse → platform A. This is the one with the crawling handrail.
  inclineRun(gConcourse, {
    x: 20, zBot: -11, yBot: L.platY, zTop: 2, yTop: 0, width: 3.0, kind: 'escalator',
    handrailMat: M.handrailAnim,
  });
  // S1: fixed stair, concourse → platform A.
  inclineRun(gConcourse, {
    x: -24, zBot: -12, yBot: L.platY, zTop: 0, yTop: 0, width: 2.6, kind: 'stair',
  });
  // Mezzanine stair, running west along the south-west wall.
  inclineRun(gConcourse, {
    x: -49, zBot: -30, yBot: 0, yaw: -Math.PI / 2, runLen: 9, yTop: L.mezzY,
    width: 2.2, kind: 'stair',
  });
  // Piers carrying E2 and S1 across the flooded trench.
  for (const [px, pz] of [[20, -5], [20, -8], [-24, -5], [-24, -8]]) {
    const pier = P.boxC(3.6, 4.4, 0.6, M.concreteDark, { collide: false, shadow: false });
    pier.position.set(px, -5.8, pz); gPlatform.add(pier);
    proxyBox(3.6, 4.4, 0.6, px, -5.8, pz);
  }

  // Service ladder in a tiled shaft, platform B → concourse.
  {
    const lad = P.ladder(8.2, M.brightSteel);
    lad.position.set(-40, L.platY, 14.2);
    ctx.addSolid(lad);
    for (const [sx, sz] of [[-41.6, 14], [-38.4, 14], [-40, 15.6]]) {
      const w = P.boxC(sx === -40 ? 3.4 : 0.3, 6.2, sx === -40 ? 0.3 : 3.4, M.tileWallDeep,
        { collide: false, shadow: false });
      w.position.set(sx, -3.9, sz); gPlatform.add(w);
      proxyBox(sx === -40 ? 3.4 : 0.3, 6.2, sx === -40 ? 0.3 : 3.4, sx, -3.9, sz);
    }
    const hatch = P.boxC(3.4, 0.12, 3.4, M.hazard, { collide: false, shadow: false });
    hatch.position.set(-40, 0.06, 14); gConcourse.add(hatch);
  }

  // Guard rails around every floor opening so the hall reads as a real station.
  for (const h of FLOOR_HOLES) {
    const w = h[1] - h[0], d = h[3] - h[2], cx = (h[0] + h[1]) / 2, cz = (h[2] + h[3]) / 2;
    const edges = [
      [w, cx, h[2], 0], [w, cx, h[3], 0], [d, h[0], cz, Math.PI / 2], [d, h[1], cz, Math.PI / 2],
    ];
    for (const [len, ex, ez, ry] of edges) {
      // leave the mouth of each escalator / stair open
      if (h === FLOOR_HOLES[0] && ez === h[3]) continue;
      if (h === FLOOR_HOLES[1] && ez === h[3]) continue;
      const r = P.railing(len, 1.06, M.brightSteel, { postEvery: 2.0 });
      r.position.set(ex, 0, ez); r.rotation.y = ry;
      P.NOCOLLIDE(r); gConcourse.add(r);
      proxyBox(ry === 0 ? len : 0.18, 1.15, ry === 0 ? 0.18 : len, ex, 0.6, ez);
    }
  }

  // ===========================================================================
  // 10. THE HOLOGRAPHIC AD PILLAR — the hall's landmark, cycling three ads
  // ===========================================================================
  {
    const PX0 = -14, PZ0 = 0;
    const plinth = P.boxC(4.6, 0.6, 4.6, M.concreteDark, { collide: false, shadow: false });
    plinth.position.set(PX0, 0.3, PZ0); gConcourse.add(plinth);
    const shaft = P.boxC(3.3, 7.4, 3.3, M.panelMetal, { collide: false, shadow: true });
    shaft.position.set(PX0, 4.0, PZ0); gConcourse.add(shaft);
    const crown = P.boxC(4.0, 0.35, 4.0, M.darkSteel, { collide: false, shadow: false });
    crown.position.set(PX0, 7.85, PZ0); gConcourse.add(crown);
    proxyBox(3.5, 8.0, 3.5, PX0, 4.0, PZ0);

    const adSpecs = [
      ['夜光\nNIGHTGLOW\n— 24H —', 0xff2ad0],
      ['SYNTH\nNOODLE BAR\nLEVEL 3', 0xffa62a],
      ['都市交通\nORBITAL LINE\nSUSPENDED', 0x2ae0ff],
    ];
    const adMats = adSpecs.map(([t, c]) => ctx.mat.textMaterial(t, {
      color: 0xffffff, background: 0x05070c, emissive: c, emissiveIntensity: 2.2, fontSize: 74,
    }).material);
    const adColors = adSpecs.map(s => new THREE.Color(s[1]));
    const screens = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const s = P.boxC(2.7, 4.6, 0.06, adMats[0], { collide: false, shadow: false });
      s.position.set(PX0 + Math.sin(a) * 1.69, 4.3, PZ0 + Math.cos(a) * 1.69);
      s.rotation.y = a;
      ctx.addDecor(s);
      screens.push(s);
      const bezel = P.boxC(3.0, 5.0, 0.04, M.darkSteel, { collide: false, shadow: false });
      bezel.position.set(PX0 + Math.sin(a) * 1.66, 4.3, PZ0 + Math.cos(a) * 1.66);
      bezel.rotation.y = a; gConcourse.add(bezel);
    }
    const adGlow = new THREE.PointLight(adColors[0].getHex(), 14, 22, 2);
    adGlow.position.set(PX0, 4.4, PZ0);
    ctx.light(adGlow);

    let adIdx = 0, adT = 0;
    TICKS.push((dt, t) => {
      adT += dt;
      const dwell = 6.5;
      if (adT > dwell) { adT -= dwell; adIdx = (adIdx + 1) % 3; for (const s of screens) s.material = adMats[adIdx]; }
      // hard wipe at the swap, then a settle, plus a constant hologram jitter
      const k = adT < 0.45 ? (0.15 + 2.2 * Math.abs(Math.sin(adT * 26))) : 1;
      const jit = 0.92 + 0.08 * Math.sin(t * 9.3) + 0.04 * Math.sin(t * 31.7);
      adMats[adIdx].emissiveIntensity = 2.2 * k * jit;
      adGlow.color.copy(adColors[adIdx]);
      adGlow.intensity = 14 * k * jit;
      hallKey.color.lerpColors(adColors[adIdx], new THREE.Color(0x9fd8ff), 0.55);
    });
  }

  // ===========================================================================
  // 11. CONCOURSE FURNITURE — barriers, vending, kiosk, hanging signage
  // ===========================================================================
  // Ticket barrier line: ten gates across the western throat of the hall.
  for (let i = 0; i < 10; i++) {
    const z = -19 + i * 4.2;
    for (const sz of [-1, 1]) {
      const body = P.boxC(1.5, 1.0, 0.62, M.panelMetal, { collide: false, shadow: true });
      body.position.set(-30, 0.5, z + sz * 0.78); gConcourse.add(body);
      const top = P.boxC(1.55, 0.06, 0.66, M.darkSteel, { collide: false, shadow: false });
      top.position.set(-30, 1.03, z + sz * 0.78); gConcourse.add(top);
      proxyBox(1.5, 1.05, 0.66, -30, 0.52, z + sz * 0.78);
      const flap = P.boxC(0.05, 0.75, 0.5, M.escGlass, { collide: false, shadow: false });
      flap.position.set(-30 + (i % 3 === 0 ? 0.4 : 0), 0.85, z + sz * 0.78);
      flap.rotation.y = i % 3 === 0 ? 0.9 : 0; gConcourse.add(flap);
      const led = P.boxC(0.3, 0.06, 0.06,
        ctx.mat.emissive(i % 3 === 0 ? 0xff3a2a : 0x25ff8f, i % 4 === 1 ? 0.2 : 4.0),
        { collide: false, shadow: false });
      led.position.set(-30, 1.08, z + sz * 0.78); ctx.addDecor(led);
    }
    rustStreak(gDecal, -30, 0.4, z + 1.12, 0, 0.7, 0.9);
  }

  // Dead vending machines and ticket machines along the east retail wall.
  for (let i = 0; i < 7; i++) {
    const z = -16 + i * 5.4;
    const body = P.boxC(1.1, 1.95, 0.8, M.panelMetal, { collide: false, shadow: true });
    body.position.set(58.6, 0.98, z); gConcourse.add(body);
    const front = P.boxC(0.9, 1.35, 0.06, i === 2 || i === 5 ? M.escGlass : M.grimeFlat,
      { collide: false, shadow: false });
    front.position.set(58.15, 1.25, z); gConcourse.add(front);
    proxyBox(1.15, 2.0, 0.85, 58.6, 1.0, z);
    if (i === 2 || i === 5) {
      const glowPanel = P.boxC(0.86, 1.3, 0.03, ctx.mat.emissive(i === 2 ? 0x2ae0ff : 0xff5aa0, 2.4),
        { collide: false, shadow: false });
      glowPanel.position.set(58.1, 1.25, z); ctx.addDecor(glowPanel);
    }
    rustStreak(gDecal, 58.1, 0.4, z, -Math.PI / 2, 0.9, 1.1);
  }
  // A machine dragged out of line — asymmetry.
  {
    const tipped = P.boxC(1.1, 1.95, 0.8, M.panelMetal, { collide: false, shadow: true });
    tipped.position.set(53.5, 0.42, 21); tipped.rotation.set(0, 0.6, Math.PI / 2 - 0.1);
    ctx.addDecor(tipped);
    proxyBox(2.1, 1.2, 1.4, 53.5, 0.5, 21, 0.6);
  }

  // Boarded-up kiosk in the south-east quarter — you can hide behind it.
  {
    const kx = 38, kz = 20;
    const shell = P.roomShell({
      w: 7, d: 4.6, h: 3.0, thickness: 0.24, material: M.tileWall,
      doors: [{ side: 's', at: 0.5, width: 1.6 }],
    });
    shell.position.set(kx, 0, kz);
    P.NOCOLLIDE(shell); gConcourse.add(shell);
    proxyBox(7, 3, 0.24, kx, 1.5, kz - 2.3);
    proxyBox(0.24, 3, 4.6, kx - 3.5, 1.5, kz);
    proxyBox(0.24, 3, 4.6, kx + 3.5, 1.5, kz);
    proxyBox(2.5, 3, 0.24, kx - 2.25, 1.5, kz + 2.3);
    proxyBox(2.5, 3, 0.24, kx + 2.25, 1.5, kz + 2.3);
    const roofK = P.boxC(7.6, 0.24, 5.2, M.concreteDark, { collide: false, shadow: true });
    roofK.position.set(kx, 3.1, kz); gConcourse.add(roofK);
    proxyBox(7.6, 0.3, 5.2, kx, 3.1, kz);
    for (let i = 0; i < 7; i++) {   // nailed-up boards over the serving hatch
      const b = P.boxC(6.4, 0.28, 0.05, ctx.mat.surface('wood', {
        color: 0x4a3826, planks: 3, repeat: 1, size: 128, seed: 81,
      }), { collide: false, shadow: false });
      b.position.set(kx, 0.5 + i * 0.34, kz - 2.45);
      b.rotation.z = rDress.range(-0.03, 0.03); gConcourse.add(b);
    }
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), graffiti('SEEK', 0x2ae0ff, 3));
    tag.position.set(kx + 0.4, 1.6, kz - 2.55); tag.userData.collide = false;
    gDecal.add(tag);
  }

  // Hanging directional signage — the eye-level wayfinding layer.
  const wayfind = [
    ['◀ PLATFORMS 1–2   出口 ▶', -6, 5.6, -14, 0, 0x2ae0ff],
    ['▼ ORBITAL LINE', 20, 5.6, 6, 0, 0xffa62a],
    ['WAY OUT  ▲  出口', -40, 5.6, 8, 0, 0x38ff9a],
    ['NO SERVICE — 回送', 30, 5.6, -28, 0, 0xff3a2a],
    ['▼ MEZZANINE', -52, 5.6, -18, Math.PI / 2, 0x2ae0ff],
  ];
  for (const [txt, x, y, z, ry, col] of wayfind) {
    const { material, aspect } = ctx.mat.textMaterial(txt, {
      color: 0xffffff, background: 0x070a10, emissive: col, emissiveIntensity: 1.9, fontSize: 64,
    });
    const h = 0.85, w = Math.min(9, h * aspect);
    const panel = P.boxC(w, h, 0.07, material, { collide: false, shadow: false });
    panel.position.set(x, y, z); panel.rotation.y = ry;
    ctx.addDecor(panel);
    for (const sx of [-1, 1]) {
      const rod = P.boxC(0.04, 2.2, 0.04, M.darkSteel, { collide: false, shadow: false });
      rod.position.set(x + Math.cos(ry) * sx * (w / 2 - 0.3), y + 1.1, z - Math.sin(ry) * sx * (w / 2 - 0.3));
      gConcourse.add(rod);
    }
  }

  // ===========================================================================
  // 12. THE COLLAPSE — the road has fallen into the concourse
  // ===========================================================================
  {
    const mound = P.rubble(7.5, 46, M.rockDark, 4242);
    mound.position.set(7, 0, -2); ctx.addDecor(mound);
    for (let i = 0; i < 14; i++) {
      const s = P.boxC(rDebris.range(1.2, 4.0), rDebris.range(0.25, 0.6), rDebris.range(1.2, 3.6),
        M.asphalt, { collide: false, shadow: true });
      s.position.set(7 + rDebris.range(-5.5, 5.5), 0.3 + i * 0.22, -2 + rDebris.range(-5, 5));
      s.rotation.set(rDebris.range(-0.45, 0.45), rDebris.range(0, 3.14), rDebris.range(-0.45, 0.45));
      ctx.addDecor(s);
    }
    proxyBox(9, 2.4, 8, 7, 1.0, -2);
    proxyBox(5, 3.6, 4.5, 6, 1.6, -2);
    // twisted rebar reaching up into the shaft
    for (let i = 0; i < 22; i++) {
      const a = rDebris.range(0, 6.28), r = rDebris.range(0.5, 6.5);
      const b0 = new THREE.Vector3(7 + Math.cos(a) * r, 1.2, -2 + Math.sin(a) * r);
      const b1 = b0.clone().add(new THREE.Vector3(rDebris.range(-1.4, 1.4), rDebris.range(1.2, 3.4), rDebris.range(-1.4, 1.4)));
      ctx.addDecor(strut(b0, b1, 0.028, M.rust));
    }
    // broken slab edge hanging from the hole
    for (const [ex, ez, w, d] of [[0.2, -2, 0.4, 12], [13.8, -2, 0.4, 12], [7, -7.8, 14, 0.4], [7, 3.8, 14, 0.4]]) {
      const lip = P.boxC(w, 1.1, d, M.concrete, { collide: false, shadow: true });
      lip.position.set(ex, 8.45, ez); gConcourse.add(lip);
    }
  }

  // ===========================================================================
  // 13. CEILING LIGHTING — instanced strips, mostly dead
  // ===========================================================================
  const stripGeo = new THREE.BoxGeometry(2.6, 0.07, 0.24);
  const litStrip = ctx.mat.emissive(0xbfe0ff, 3.2);
  const deadStrip = ctx.mat.solid({ color: 0x161a20, roughness: 0.6 });
  const stripPlaces = [];
  for (let x = -56; x <= 56; x += 7) for (const z of [-32, -20, -8, 8, 20, 32]) stripPlaces.push([x, z]);
  ctx.addDecor(P.scatter(stripGeo, litStrip, stripPlaces.length, (i, d) => {
    const p = stripPlaces[i];
    if (hash01(i * 17 + 5) > 0.3) return false;
    if (p[0] > -1 && p[0] < 15 && p[1] > -9 && p[1] < 5) return false;
    d.position.set(p[0], 7.55, p[1]);
    return true;
  }, 3001));
  ctx.addDecor(P.scatter(stripGeo, deadStrip, stripPlaces.length, (i, d) => {
    const p = stripPlaces[i];
    if (hash01(i * 17 + 5) <= 0.3) return false;
    if (p[0] > -1 && p[0] < 15 && p[1] > -9 && p[1] < 5) return false;
    d.position.set(p[0], 7.55, p[1]);
    d.rotation.z = hash01(i * 31) < 0.12 ? 0.35 : 0;
    return true;
  }, 3002));
  // Emergency sodium strips on the platform level, plus three real lights.
  const emerGeo = new THREE.BoxGeometry(1.8, 0.06, 0.16);
  const emerMat = ctx.mat.emissive(0xff9a3c, 3.6);
  ctx.addDecor(P.scatter(emerGeo, emerMat, 30, (i, d) => {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    d.position.set(-50 + k * 7, -1.35, side * (L.PZ - 0.5));
    return true;
  }, 3003));
  for (const [ex, ez] of [[-36, -18.4], [8, 18.4], [42, -18.4]]) {
    const pl = new THREE.PointLight(0xff9a3c, 7, 20, 2);
    pl.position.set(ex, -2.0, ez * 0.94);
    ctx.light(pl);
  }

  // ===========================================================================
  // 14. WET PASS — sheen planes, painted puddles, graffiti, missing tiles
  // ===========================================================================
  for (const [px, pz, pr] of PUDDLES) {
    const sheen = P.ground(pr * 2.1, pr * 2.1, M.wetSheen, { collide: false });
    sheen.position.set(px, 0.014, pz); sheen.renderOrder = 1;
    ctx.addDecor(sheen);
    const dec = P.ground(pr * 2.4, pr * 2.4, M.puddleDecal, { collide: false });
    dec.position.set(px, 0.02, pz); dec.renderOrder = 2;
    ctx.addDecor(dec);
  }
  for (const [px, pz, pr] of [[-30, -13, 8], [22, 14, 9], [-8, 3, 7]]) {
    const sheen = P.ground(pr * 2, pr * 2, M.wetSheen, { collide: false });
    sheen.position.set(px, -6.984, pz); sheen.renderOrder = 1;
    ctx.addDecor(sheen);
  }
  const tags = [
    ['七', 0xff2ad0, -61.4, 2.2, -12, Math.PI / 2, 4.0],
    ['GHOST', 0x2ae0ff, 12, 2.4, -39.4, 0, 5.0],
    ['NO EXIT', 0xffa62a, -20, 2.1, 39.4, Math.PI, 4.4],
    ['夢', 0x38ff9a, 61.4, 2.6, 30, -Math.PI / 2, 3.6],
    ['RUN', 0xff3a2a, -14, -4.2, -18.4, 0, 4.2],
    ['深', 0x2ae0ff, 34, -4.0, 18.4, Math.PI, 3.8],
  ];
  tags.forEach(([t, c, x, y, z, ry, w], i) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), graffiti(t, c, i * 7 + 1));
    g.position.set(x, y, z); g.rotation.y = ry; g.userData.collide = false;
    gDecal.add(g);
  });
  // A wall of missing tiles baring the concrete behind it.
  for (const [mx, my, mz, mry] of [[-52, 2.6, -39.4, 0], [26, 2.4, 39.4, Math.PI], [-6, -3.6, -18.4, 0]]) {
    const patch = P.boxC(6.5, 3.2, 0.1, M.concreteDark, { collide: false, shadow: false });
    patch.position.set(mx, my, mz); patch.rotation.y = mry;
    gConcourse.add(patch);
    for (let i = 0; i < 16; i++) {   // loose tiles on the floor beneath
      const tl = P.boxC(0.34, 0.02, 0.34, M.tileWall, { collide: false, shadow: false });
      tl.position.set(mx + rDebris.range(-3.4, 3.4), my > 0 ? 0.03 : -6.96,
        mz + (mry === 0 ? rDebris.range(0.3, 2.2) : rDebris.range(-2.2, -0.3)));
      tl.rotation.set(rDebris.range(-0.1, 0.1), rDebris.range(0, 3), rDebris.range(-0.1, 0.1));
      gDecal.add(tl);
    }
  }

  // Extractor fan in a wall vent — something is still running down here.
  {
    const vx = -46, vy = 5.6, vz = -39.4;
    const housing = P.boxC(2.2, 2.2, 0.5, M.rust, { collide: false, shadow: false });
    housing.position.set(vx, vy, vz); gConcourse.add(housing);
    const bladeGroup = new THREE.Group();
    bladeGroup.position.set(vx, vy, vz + 0.3);
    for (let i = 0; i < 5; i++) {
      const b = P.boxC(1.7, 0.05, 0.22, M.darkSteel, { collide: false, shadow: false });
      b.rotation.z = (i / 5) * Math.PI * 2; b.rotation.x = 0.35;
      bladeGroup.add(b);
    }
    ctx.addDecor(bladeGroup);
    const hub = P.boxC(0.3, 0.3, 0.3, M.darkSteel, { collide: false, shadow: false });
    hub.position.set(vx, vy, vz + 0.3); gConcourse.add(hub);
    rustStreak(gDecal, vx, vy - 2.0, vz + 0.28, 0, 2.0, 3.4);
    TICKS.push((dt) => { bladeGroup.rotation.z += dt * 2.1; });
  }

  // ===========================================================================
  // 15. LEVEL 0 — A RAIN-LASHED SLICE OF STREET (y = +9)
  // ===========================================================================
  emitSlab(gStreet, -L.SX, L.SX, -L.SZ, L.SZ, L.streetY, 1.0, M.asphalt, CEIL_HOLES, { panel: 8 });
  // Kerbs and pavements down both sides.
  for (const [z0, z1] of [[-L.SZ, -12], [12, L.SZ]]) {
    emitSlab(gStreet, -L.SX, L.SX, z0, z1, L.streetY + 0.16, 0.4, M.concreteWet,
      CEIL_HOLES, { panel: 8 });
    const kerb = P.boxC(L.SX * 2, 0.2, 0.25, M.concrete, { collide: false, shadow: false });
    kerb.position.set(0, L.streetY + 0.06, z0 === -L.SZ ? -12 : 12);
    gStreet.add(kerb);
  }
  // Lane markings — dashes, broken by the collapse.
  for (let x = -36; x < 36; x += 4.5) {
    if (x > -1 && x < 15) continue;
    const dash = P.boxC(2.4, 0.02, 0.2, ctx.mat.solid({ color: 0xb9b39a, roughness: 0.5 }),
      { collide: false, shadow: false });
    dash.position.set(x, L.streetY + 0.012, 0); gStreet.add(dash);
  }

  // Building facades boxing the street in — the player cannot leave.
  wallStrip(gStreet, -L.SX, -L.SZ, L.SX, -L.SZ, L.streetY, L.streetTop, 1.2, M.facade);
  wallStrip(gStreet, -L.SX, L.SZ, L.SX, L.SZ, L.streetY, L.streetTop, 1.2, M.facade);
  wallStrip(gStreet, -L.SX, -L.SZ, -L.SX, L.SZ, L.streetY, L.streetTop, 1.2, M.facade);
  wallStrip(gStreet, L.SX, -L.SZ, L.SX, L.SZ, L.streetY, L.streetTop, 1.2, M.facade);

  // Shuttered shopfronts at eye level, with awnings and AC units above.
  const shopXs = [-32, -24, -16, -4, 6, 16, 26, 34];
  for (const sz of [-1, 1]) {
    for (const sx of shopXs) {
      const z = sz * (L.SZ - 0.62);
      const recess = P.boxC(5.6, 3.1, 0.5, M.grimeFlat, { collide: false, shadow: false });
      recess.position.set(sx, L.streetY + 1.75, z); gStreet.add(recess);
      const shut = P.boxC(5.2, 2.7 * (0.55 + hash01(Math.round(sx * 3 + sz * 11)) * 0.45), 0.12,
        M.shutter, { collide: false, shadow: false });
      shut.position.set(sx, L.streetY + 3.15 - shut.geometry.parameters.height / 2, z - sz * 0.28);
      gStreet.add(shut);
      const lintel = P.boxC(6.0, 0.4, 0.7, M.concreteDark, { collide: false, shadow: false });
      lintel.position.set(sx, L.streetY + 3.5, z - sz * 0.2); gStreet.add(lintel);
      rustStreak(gDecal, sx, L.streetY + 2.4, z - sz * 0.62, sz > 0 ? Math.PI : 0, 4.4, 2.4);
      if (hash01(Math.round(sx * 5 + sz * 7)) < 0.5) {
        const ac = P.acUnit(0.9, 0.7, 0.7);
        ac.position.set(sx + 2.0, L.streetY + 5.2, z - sz * 0.7);
        P.NOCOLLIDE(ac); gStreet.add(ac);
      }
    }
  }
  // Upper-storey window grid on the facades, instanced.
  const winGeo = new THREE.PlaneGeometry(1.0, 1.4);
  const winLit = ctx.mat.emissive(0xffc27a, 1.5);
  const winDark = ctx.mat.solid({ color: 0x0c1017, roughness: 0.35, metalness: 0.4 });
  const facadeWindows = [];
  for (const sz of [-1, 1]) for (let x = -35; x <= 35; x += 3.2) for (let y = 14; y <= 29; y += 3.4) {
    facadeWindows.push([x, y, sz * (L.SZ - 0.65), sz > 0 ? Math.PI : 0]);
  }
  for (const sx of [-1, 1]) for (let z = -15; z <= 15; z += 3.2) for (let y = 14; y <= 29; y += 3.4) {
    facadeWindows.push([sx * (L.SX - 0.65), y, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2]);
  }
  for (const [mat_, want] of [[winLit, true], [winDark, false]]) {
    ctx.addDecor(P.scatter(winGeo, mat_, facadeWindows.length, (i, d) => {
      const w = facadeWindows[i];
      if ((hash01(i * 23 + 7) < 0.18) !== want) return false;
      d.position.set(w[0], w[1], w[2]); d.rotation.y = w[3];
      return true;
    }, want ? 3101 : 3102));
  }

  // Distant tower silhouettes above the facades — depth beyond the box.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    const dist = 95 + hash01(i * 37) * 60;
    const hgt = 40 + hash01(i * 61) * 70;
    const tower = P.boxC(16 + hash01(i * 13) * 20, hgt, 16 + hash01(i * 17) * 18,
      ctx.mat.solid({ color: 0x0b0f16, roughness: 0.9 }), { collide: false, shadow: false });
    tower.position.set(Math.cos(a) * dist, L.streetY + hgt / 2 - 6, Math.sin(a) * dist);
    tower.rotation.y = hash01(i * 5) * 1.5;
    ctx.addDecor(tower);
    const beacon = P.boxC(0.9, 0.9, 0.9, ctx.mat.emissive(0xff2a2a, 4), { collide: false, shadow: false });
    beacon.position.set(tower.position.x, L.streetY + hgt - 6, tower.position.z);
    ctx.addDecor(beacon);
    TICKS.push((dt, t) => { beacon.visible = Math.sin(t * 1.4 + i) > 0.2; });
  }

  // Street furniture: two parked cars, a lamp column, bins, cones, a fence.
  {
    const c1 = P.car(0x1d2b3f, 7); c1.position.set(-27, L.streetY, 6.5); c1.rotation.y = 0.06;
    ctx.addSolid(c1);
    const c2 = P.car(0x3a1d24, 12); c2.position.set(24, L.streetY, -6.2); c2.rotation.y = Math.PI - 0.09;
    ctx.addSolid(c2);
    const c3 = P.car(0x14231c, 19); c3.position.set(-6, L.streetY + 0.1, -6.8); c3.rotation.y = 0.5;
    c3.rotation.z = -0.07; ctx.addSolid(c3);   // half-swallowed by the collapse edge

    for (const [lx, lz] of [[-33, 13.4], [16, -13.4]]) {
      const sl = P.streetLight(7, { color: 0xffb35a, intensity: 4.5 });
      sl.position.set(lx, L.streetY + 0.16, lz);
      sl.rotation.y = lz > 0 ? Math.PI : 0;
      P.NOCOLLIDE(sl); gStreet.add(sl);
      proxyBox(0.35, 7, 0.35, lx, L.streetY + 3.5, lz);
    }
    for (const [bx, bz] of [[-20, 14], [8, -14.5], [31, 14.2]]) {
      const bin = P.trashBin(0.32, 0.85);
      bin.position.set(bx, L.streetY + 0.16, bz); ctx.addSolid(bin);
    }
    const fen = P.fence(15, 1.9, 'chain', M.brightSteel);
    fen.position.set(7, L.streetY, 5.4); ctx.addSolid(fen);
    const fen2 = P.fence(12, 1.9, 'chain', M.brightSteel);
    fen2.position.set(-0.6, L.streetY, -2); fen2.rotation.y = Math.PI / 2; ctx.addSolid(fen2);
    for (let i = 0; i < 7; i++) {
      const cone = P.cyl(0.04, 0.22, 0.6, ctx.mat.solid({ color: 0xd85a1c, roughness: 0.7 }),
        { seg: 8, collide: false, shadow: false });
      cone.position.set(-2 + rDress.range(-2, 2), L.streetY + 0.01, -9 + rDress.range(-3, 3));
      gStreet.add(cone);
    }
  }

  // ===========================================================================
  // 16. RAIN — instanced streaks, wrapped by translating the whole lattice
  // ===========================================================================
  function rainLayer(x0, x1, z0, z1, yTop, H, spacing, perLevel, speed, len, opacity, seed) {
    const levels = Math.ceil((H + spacing) / spacing);
    const geoR = new THREE.PlaneGeometry(0.03, len);
    const matR = new THREE.MeshBasicMaterial({
      color: 0xa9d4ff, transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const inst = P.scatter(geoR, matR, levels * perLevel, (i, d, r) => {
      const lv = Math.floor(i / perLevel);
      d.position.set(r.range(x0, x1), spacing - lv * spacing + r.range(-0.35, 0.35), r.range(z0, z1));
      d.rotation.z = r.range(-0.07, 0.07);
      d.scale.y = r.range(0.65, 1.6);
      return true;
    }, seed);
    inst.castShadow = false; inst.receiveShadow = false; inst.frustumCulled = false;
    const grp = new THREE.Group();
    grp.add(inst);
    ctx.addDecor(grp);
    TICKS.push((dt, t) => { grp.position.y = yTop - ((t * speed) % spacing); });
  }
  rainLayer(-37, 37, -17, 17, L.streetY + 0.2, 22, 2.6, 150, 17, 1.15, 0.4, 7701);
  rainLayer(-37, 37, -17, 17, L.streetY + 0.2, 22, 3.4, 70, 26, 1.9, 0.22, 7702);
  rainLayer(0.6, 13.4, -7.4, 3.4, 0.1, 9.0, 2.2, 42, 15, 1.0, 0.5, 7703);

  // Slow drips off the broken slab edge, straight down the light shaft.
  const dripMat = ctx.mat.emissive(0x9fd0ff, 2.2);
  for (let i = 0; i < 6; i++) {
    const drop = P.cyl(0.02, 0.02, 0.22, dripMat, { seg: 5, collide: false, shadow: false });
    const dx = 1.5 + hash01(i * 41) * 11, dz = -7 + hash01(i * 17) * 10;
    ctx.addDecor(drop);
    const ph = hash01(i * 7) * 3;
    TICKS.push((dt, t) => {
      const u = ((t * 0.55 + ph) % 1);
      drop.position.set(dx, 8.3 - u * u * 8.0, dz);
      drop.scale.y = 1 + u * 2.4;
    });
  }

  // ===========================================================================
  // 17. NEON PASS — 23 signs across all three levels; 12 carry a real light
  // ===========================================================================
  const NEON = [];
  const N = (t, x, y, z, ry, color, profile, light, h) =>
    placeNeon(NEON, t, x, y, z, ry, {
      color, profile, light, height: h ?? 0.6,
      phase: NEON.length * 1.37, intensity: 9, distance: 16,
    });
  const FN = -(L.SZ - 0.68), FS = L.SZ - 0.68, FE = L.SX - 0.68, FW = -(L.SX - 0.68);
  // -- street
  N('ネオン\nNEON BAR', -26, 12.4, FN, 0, 0xff2ad0, 'stutter', true, 0.72);
  N('拉麺 RAMEN', -12, 13.6, FN, 0, 0xffa62a, 'steady', true, 0.8);
  N('24H', 4, 12.0, FN, 0, 0x2ae0ff, 'pulse', true, 0.9);
  N('電気 ELECTRIC', 20, 13.2, FN, 0, 0x2ae0ff, 'steady', false, 0.66);
  N('KIYOMI', 32, 11.7, FN, 0, 0xff2ad0, 'dying', false, 0.7);
  N('SAKURA\nHOTEL', -30, 12.9, FS, Math.PI, 0xffa62a, 'pulse', true, 0.75);
  N('無限 LOOP', -8, 11.9, FS, Math.PI, 0x2ae0ff, 'stutter', false, 0.64);
  N('パチ\nPACHI', 10, 13.8, FS, Math.PI, 0xff2ad0, 'steady', true, 0.8);
  N('OPEN', 28, 12.3, FS, Math.PI, 0xff4a2a, 'dying', false, 0.62);
  N('出口 EXIT', FE, 12.5, -6, -Math.PI / 2, 0x38ff9a, 'steady', false, 0.6);
  N('地下鉄\nMETRO', FW, 12.6, 6, Math.PI / 2, 0x2ae0ff, 'steady', true, 0.9);
  // -- concourse
  N('切符 TICKETS', -52, 3.3, -39.5, 0, 0x2ae0ff, 'steady', true, 0.75);
  N('立入禁止\nNO ENTRY', -40, 2.9, -39.5, 0, 0xff3a2a, 'dying', false, 0.6);
  N('KIOSK 24', 30, 3.5, -39.5, 0, 0xffa62a, 'stutter', true, 0.7);
  N('PLATFORM 1–4 ▼', 0, 5.3, 39.5, Math.PI, 0x2ae0ff, 'pulse', true, 0.8);
  N('自動販売機', 44, 4.1, 39.5, Math.PI, 0xff2ad0, 'stutter', false, 0.66);
  N('WAY OUT', -61.4, 3.7, -10, Math.PI / 2, 0x38ff9a, 'steady', false, 0.62);
  N('回送 OUT OF SERVICE', 61.4, 3.7, 12, -Math.PI / 2, 0xffa62a, 'dying', false, 0.58);
  // -- platforms and tunnel mouth
  N('1 番線', -30, -4.2, -18.5, 0, 0x2ae0ff, 'steady', true, 0.8);
  N('ORBITAL LINE', 30, -4.2, -18.5, 0, 0xff2ad0, 'stutter', true, 0.7);
  N('2 番線', -20, -4.2, 18.5, Math.PI, 0x2ae0ff, 'steady', false, 0.8);
  N('危険 DANGER', 24, -4.2, 18.5, Math.PI, 0xff3020, 'dying', true, 0.66);
  N('TUNNEL — NO ACCESS', 54.4, -3.4, -5, -Math.PI / 2, 0xffa62a, 'stutter', false, 0.55);

  // ===========================================================================
  // 18. GAMEPLAY — 40 coins, 5 batteries, 3 powerups, 1 pup, 21 hiding spots
  // ===========================================================================
  const COINS = [
    // street
    [-30, 10, -12], [-6, 10, 14], [22, 10, -13], [33, 10, 8], [12, 10, 16], [-20, 10, 4],
    // concourse
    [-52, 1, -30], [-45, 1, 20], [-33, 1, -14], [-14, 1, -8], [-2, 1, -27], [8, 1, 28],
    [26, 1, -20], [40, 1, 10], [52, 1, -34], [57, 1, 30],
    // mezzanine
    [-60, 5.2, -30], [-60, 5.2, 32], [60, 5.2, -30], [60, 5.2, 34], [0, 5.2, -38.2],
    // platform A
    [-46, -6, -13], [-20, -6, -16], [6, -6, -12], [40, -6, -15],
    // platform B
    [-40, -6, 13], [-12, -6, 16], [34, -6, 11], [48, -6, 15],
    // flooded trench
    [-30, -7, -5], [2, -7, 5], [46, -7, -4],
    // deep tunnel cluster
    [60, -7, -5], [68.5, -7, 0], [74, -7, 5], [82, -7, -5], [88, -7, 5],
    // inside the carriage
    [11, -6, 6.2], [19, -6, 6.2], [27, -6, 6.2],
  ];
  for (const [x, y, z] of COINS) ctx.pickup(x, y, z, 'coin');

  ctx.pickup(-56, 1, -36, 'battery');
  ctx.pickup(30, -6, 10, 'battery');
  ctx.pickup(-60, 5.2, -10, 'battery');
  ctx.pickup(4, 1, -6, 'battery');
  ctx.pickup(66, -7, 5, 'battery');

  ctx.pickup(57, -7, -5, 'powerup:nightvision');
  ctx.pickup(60, 5.2, 20, 'powerup:ghost');
  ctx.pickup(-16, 10, 10, 'powerup:dash');

  // The dog, wedged behind the last seat bay in the derailed carriage.
  ctx.pickup(26.5, -6, 6.7, 'pup');

  const HIDES = [
    [11, -6.9, 6.2, 1.8, 1.0], [19, -6.9, 6.2, 1.8, 1.0], [26.5, -6.9, 6.4, 1.8, 1.0],
    [84, -7.9, -5, 3.0, 1.0], [90, -7.9, 5, 3.0, 1.0],
    [68.5, -7.9, 0, 1.8, 0.95], [81.5, -7.9, 0, 1.8, 0.95],
    [-62, -7.9, -5, 2.4, 1.0], [-62, -7.9, 5, 2.4, 1.0],
    [38, 0, 22.5, 2.4, 0.85],            // behind the kiosk
    [20, -7.9, -6, 2.2, 0.9],            // under escalator E2, in the trench
    [-24, -7.9, -6, 2.2, 0.9],           // under the fixed stair
    [-17.5, 0, 0, 1.6, 0.75],            // behind the ad pillar
    [-50, -7.9, -5, 2.4, 0.9],           // west end of the trench
    [0, -7.9, 5, 2.4, 0.85],             // trench beneath the light well
    [58.6, 0, -8, 1.6, 0.7],             // in the vending row gap
    [-60, 4.2, -20, 2.0, 0.8],           // dark mezzanine corner, west
    [60, 4.2, 26, 2.0, 0.8],             // dark mezzanine corner, east
    [-27, 9.2, 6.5, 2.0, 0.75],          // street, behind the parked car
    [7, 0, -2, 3.2, 0.8],                // in the collapse rubble
    [-40, -6.9, 14.5, 1.4, 0.8],         // in the ladder shaft
  ];
  for (const [x, y, z, r, q] of HIDES) ctx.hidingSpot(x, y, z, r, q);

  // ===========================================================================
  // 19. BAKE — collapse the static architecture into one mesh per material
  // ===========================================================================
  P.NOCOLLIDE(gDecal);
  for (const g of [gStreet, gConcourse, gPlatform, gTunnel, gTrain, gDecal]) {
    ctx.addDecor(P.freeze(g));
  }

  // ===========================================================================
  // 20. MOTION — one update pump for every animated thing in the arena
  // ===========================================================================
  ctx.onUpdate((dt, t) => {
    waterMat.userData.tick(dt);
    M.handrailAnim.map.offset.x -= dt * 0.055;      // the crawling escalator handrail
    M.wetSheen.opacity = 0.46 + 0.06 * Math.sin(t * 0.35);
    for (let i = 0; i < TICKS.length; i++) TICKS[i](dt, t);
  });
}






}



