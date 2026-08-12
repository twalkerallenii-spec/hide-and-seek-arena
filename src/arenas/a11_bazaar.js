// =============================================================================
// DUST BAZAAR — a sun-blasted desert market town at high noon.
//
// Two full maps stacked: a warren of mud-brick alleys at ground level, and a
// complete walkable rooftop city above it, plus a cool blue cistern below.
//
// Everything here is generated from ctx.rng / ctx.noise — no Math.random(),
// no network, no DOM.
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'bazaar',
  name: 'DUST BAZAAR',
  tagline: 'Blinding noon over the medina. The roofs are a second city.',
  order: 11,
  difficulty: 3,
  biome: 'outdoor',
  seed: 110711,
  spawn: [0, 0.05, 80],
  bounds: 110,
  colors: ['#e6c47a', '#2b3a7a'],
  music: 'arcade',
};

// -----------------------------------------------------------------------------
// Map constants — one place to retune the whole town.
// -----------------------------------------------------------------------------

const WALL_X = 90;          // town wall half-extent, X
const WALL_Z = 86;          // town wall half-extent, Z
const WALL_H = 10;
const GATE_HALF = 3.6;      // gate opening half-width (south wall, x = 0)

// Cistern stair shaft — a real hole punched through the ground plane.
const SHAFT = { x0: -28, x1: -20, z0: 20, z1: 34 };
const CISTERN = { x0: -44, x1: -8, z0: -2, z1: 20, floor: -6, ceil: -2 };

// The Grand Souk Hall (covered market street).
const HALL = { x0: -48, x1: -6, zc: 20, half: 5.5, apex: 9.6 };

// The caravanserai.
const SERAI = { x0: 28, x1: 72, z0: -58, z1: -14, wing: 8, gallery: 4.4, roof: 8.8 };

// Plazas.
const PLAZA_A = { x: 0, z: 44, r: 17 };    // fountain plaza + minaret + big tree
const PLAZA_B = { x: -52, z: -4, r: 12 };  // spice square
const PLAZA_C = { x: 6, z: -64, r: 13 };   // north square

const MINARET = { x: 15, z: 52, r: 3.4, top: 22, balcony: 18, door2: 12.0 };

// Street graph nodes.
const NODES = {
  gate: [0, 80], plazaA: [PLAZA_A.x, PLAZA_A.z], hallE: [-6, HALL.zc], hallW: [-48, HALL.zc],
  plazaB: [PLAZA_B.x, PLAZA_B.z], plazaC: [PLAZA_C.x, PLAZA_C.z], serai: [24, -36],
  eastJ: [62, 20], neJ: [64, -8], swJ: [-64, -46], nwJ: [-30, -70], seJ: [58, 58],
  westJ: [-70, 34], nwGate: [-44, 66], midJ: [-14, 2], eMid: [34, 4], nMid: [-6, -34],
};

const EDGES = [
  ['gate', 'plazaA', 6.5], ['plazaA', 'hallE', 4.2], ['hallE', 'hallW', 10.0],
  ['hallW', 'plazaB', 3.6], ['plazaA', 'seJ', 3.6], ['seJ', 'eastJ', 3.4],
  ['eastJ', 'neJ', 3.4], ['neJ', 'eMid', 3.2], ['serai', 'plazaC', 4.0],
  ['plazaC', 'nwJ', 3.4], ['nwJ', 'swJ', 3.2], ['swJ', 'plazaB', 3.2],
  ['plazaA', 'midJ', 3.4], ['midJ', 'nMid', 3.0], ['nMid', 'plazaC', 3.4],
  ['midJ', 'plazaB', 3.0], ['hallW', 'westJ', 3.0], ['westJ', 'nwGate', 3.0],
  ['nwGate', 'gate', 3.6], ['plazaA', 'eMid', 3.2], ['nMid', 'serai', 3.6],
  ['eMid', 'eastJ', 3.0], ['nMid', 'swJ', 3.0], ['gate', 'seJ', 3.4],
];

// Areas no procedural building may occupy.
const RESERVED = [
  { x0: -19, x1: 19, z0: 25, z1: 63 },      // fountain plaza + minaret
  { x0: -51, x1: -3, z0: 12, z1: 29 },      // grand souk hall
  { x0: -66, x1: -38, z0: -18, z1: 9 },     // spice square
  { x0: -8, x1: 20, z0: -79, z1: -50 },     // north square
  { x0: 26, x1: 74, z0: -60, z1: -12 },     // caravanserai
  { x0: -31, x1: -17, z0: 17, z1: 37 },     // cistern stair head
  { x0: -12, x1: 12, z0: 64, z1: 88 },      // gate approach
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const inRect = (r, x, z, pad = 0) =>
  x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const rectGap = (a, b) => Math.hypot(
  Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1)),
  Math.max(0, Math.max(a.z0 - b.z1, b.z0 - a.z1)));

export async function build(ctx) {
  const P = ctx.props, M = ctx.mat, R = ctx.rng, N = ctx.noise;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ===========================================================================
  // §1  ATMOSPHERE — the hard noon light is the whole look.
  // ===========================================================================

  ctx.sky({ top: 0x2f6fc0, bottom: 0xe8dcc0, radius: 520 });
  ctx.fog(0xd8c8a0, 80, 400);
  ctx.useEnvironment(0.55);
  ctx.grade({
    exposure: 1.15, saturation: 1.15, contrast: 1.12,
    lift: [0.005, 0.002, -0.008], gain: [1.06, 1.0, 0.9],
    bloom: 0.4, bloomThreshold: 0.8, bloomRadius: 0.7,
    vignette: 0.85, grain: 0.03, aberration: 0.0012, scanline: 0,
  });
  ctx.soundscape('wind', 'arcade', { size: 0.45, dark: 0.25, wet: 0.12 });

  const sun = new THREE.DirectionalLight(0xfff0d0, 4.0);
  sun.position.set(34, 150, 52);
  sun.target.position.set(0, 0, 0);
  ctx.light(sun, {
    shadow: true,
    mapSize: ctx.lod >= 2 ? 4096 : 2048,
    range: 112, far: 420, bias: -0.0004, normalBias: 0.05,
  });
  ctx.light(new THREE.HemisphereLight(0xa8c8ff, 0xc8a068, 0.8));
  ctx.light(new THREE.AmbientLight(0x2a3550, 0.22));

  let lampBudget = 18;
  const warmLamp = (x, y, z, color = 0xffb45a, intensity = 6, dist = 10) => {
    if (lampBudget <= 0) return null;
    lampBudget--;
    const l = new THREE.PointLight(color, intensity, dist, 1.8);
    l.position.set(x, y, z);
    return ctx.light(l);
  };

  // ===========================================================================
  // §2  MATERIALS — 20 procedural surfaces, everything else painted or solid.
  // ===========================================================================

  const matSand = M.surface('sand', { color: 0xd9c49a, repeat: 1, size: 512 });
  const matPave = M.surface('concrete', { color: 0xcfc2a4, repeat: 1, size: 512, rough: 0.9 });
  const matOchre = M.surface('plaster', { color: 0xcaa476, repeat: 1, size: 512 });
  const matWhite = M.surface('plaster', { color: 0xe8e0cc, repeat: 1, size: 256 });
  const matTerra = M.surface('plaster', { color: 0xb87a4e, repeat: 1, size: 256 });
  const matPale = M.surface('plaster', { color: 0xd9c093, repeat: 1, size: 256, seed: 7 });
  const matGrey = M.surface('plaster', { color: 0xb59b78, repeat: 1, size: 256, seed: 13 });
  const matMud = M.surface('brick', { color: 0xb98a5c, mortar: 0xd3bb92, rows: 12, repeat: 1, size: 256 });
  const matWoodD = M.surface('wood', { color: 0x6b4a28, planks: 3, repeat: 1, size: 256 });
  const matWoodL = M.surface('wood', { color: 0x9a7a4c, planks: 5, repeat: 1, size: 256 });
  const matStone = M.surface('rock', { color: 0xb2a184, repeat: 1, size: 256 });
  const matCistern = M.surface('rock', { color: 0x5d6f80, repeat: 1, size: 256, seed: 21 });
  const matMarble = M.surface('marble', { color: 0xe6e2d4, vein: 0x8a7f6a, repeat: 1, size: 256 });
  const matDirt = M.surface('dirt', { color: 0xc6a97c, repeat: 1, size: 256 });
  const matCorr = M.surface('corrugated', { color: 0x9a8f7a, ribs: 10, repeat: 1, size: 256 });
  const matRoofTile = M.surface('tile', { color: 0xc9b48c, grout: 0x9a8a6a, tiles: 6, repeat: 1, size: 256 });
  const fabIndigo = M.surface('fabric', { color: 0x2b3a7a, repeat: 1, size: 256 });
  const fabCrimson = M.surface('fabric', { color: 0xa82a2a, repeat: 1, size: 256 });
  const fabSaffron = M.surface('fabric', { color: 0xe0a02a, repeat: 1, size: 256 });
  const fabCream = M.surface('fabric', { color: 0xe4d8bc, repeat: 1, size: 256 });

  // Double-sided variants (shells and rings are seen from both faces). These
  // reuse the cached texture set — only the material object is new.
  const DS = THREE.DoubleSide;
  const matStoneDS = M.surface('rock', { color: 0xb2a184, repeat: 1, size: 256, side: DS });
  const matWhiteDS = M.surface('plaster', { color: 0xe8e0cc, repeat: 1, size: 256, side: DS });
  const matOchreDS = M.surface('plaster', { color: 0xcaa476, repeat: 1, size: 512, side: DS });
  const matPaleDS = M.surface('plaster', { color: 0xd9c093, repeat: 1, size: 256, seed: 7, side: DS });
  const matCisternDS = M.surface('rock', { color: 0x5d6f80, repeat: 1, size: 256, seed: 21, side: DS });

  const WALLMATS = [matOchre, matWhite, matTerra, matPale, matGrey, matMud];
  const FABRICS = [fabIndigo, fabCrimson, fabSaffron, fabCream];

  const matBrass = M.metal(0xb08b3a, 0.34);
  const matIron = M.metal(0x3b3833, 0.62);
  const matGalv = M.metal(0x9aa2a6, 0.45);
  const matWater = M.water({ color: 0x2c6a86, repeat: 6 });
  const matWaterDark = M.water({ color: 0x12333f, repeat: 5, opacity: 0.85 });

  // --- painted canvas materials (cheap, and where the jewellery lives) -------

  /** Moroccan zellige: interlocking 8-point stars in saturated glaze. */
  const zellige = (cols, seed) => M.painted(256, 256, (c, W, H) => {
    const rr = ctx.rng.fork('zel' + seed);
    c.fillStyle = '#efe6d2'; c.fillRect(0, 0, W, H);
    const n = 4, s = W / n;
    for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
      const cx = (ix + 0.5) * s, cy = (iy + 0.5) * s;
      const col = cols[(ix + iy * 3 + rr.int(0, 1)) % cols.length];
      c.save(); c.translate(cx, cy);
      for (const rot of [0, Math.PI / 4]) {
        c.save(); c.rotate(rot);
        c.fillStyle = col;
        c.fillRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.68);
        c.restore();
      }
      c.strokeStyle = 'rgba(30,26,20,0.55)'; c.lineWidth = 2.2;
      for (const rot of [0, Math.PI / 4]) {
        c.save(); c.rotate(rot);
        c.strokeRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.68);
        c.restore();
      }
      c.fillStyle = cols[(ix * 2 + iy) % cols.length];
      c.beginPath(); c.arc(0, 0, s * 0.13, 0, 6.283); c.fill();
      c.restore();
      // corner lozenges knit the stars together
      c.fillStyle = '#1c2a55';
      c.save(); c.translate(ix * s, iy * s); c.rotate(Math.PI / 4);
      c.fillRect(-s * 0.09, -s * 0.09, s * 0.18, s * 0.18); c.restore();
    }
  }, { transparent: false, roughness: 0.28, alphaTest: 0 });

  const matZelligeA = zellige(['#1f4fa8', '#0f8f86', '#d9a227', '#b8321f'], 1);
  const matZelligeB = zellige(['#12736c', '#2b3a7a', '#e2ba3a'], 2);

  /** Mashrabiya lattice — alpha-cut turned-wood screen over a dark interior. */
  const matMashrabiya = M.painted(256, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = '#4a3320';
    c.lineWidth = 9; c.lineCap = 'round';
    const step = W / 6;
    for (let i = -6; i <= 12; i++) {
      c.beginPath(); c.moveTo(i * step, 0); c.lineTo(i * step + H, H); c.stroke();
      c.beginPath(); c.moveTo(i * step, H); c.lineTo(i * step + H, 0); c.stroke();
    }
    c.fillStyle = '#5a412a';
    for (let iy = 0; iy <= 6; iy++) for (let ix = 0; ix <= 6; ix++) {
      c.beginPath(); c.arc(ix * step, iy * step, 8, 0, 6.283); c.fill();
    }
    c.strokeStyle = '#3a2a18'; c.lineWidth = 16;
    c.strokeRect(0, 0, W, H);
  }, { transparent: true, alphaTest: 0.45, roughness: 0.85, side: THREE.DoubleSide });

  /** Painted rug / kilim faces, used flat and hung. */
  const kilim = (a, b, cc, seed) => M.painted(128, 192, (c, W, H) => {
    const rr = ctx.rng.fork('kilim' + seed);
    c.fillStyle = a; c.fillRect(0, 0, W, H);
    c.fillStyle = b; c.fillRect(6, 6, W - 12, H - 12);
    for (let y = 16; y < H - 16; y += 22) {
      c.fillStyle = rr.chance(0.5) ? cc : a;
      for (let x = 12; x < W - 12; x += 20) {
        c.beginPath();
        c.moveTo(x, y + 10); c.lineTo(x + 10, y); c.lineTo(x + 20, y + 10); c.lineTo(x + 10, y + 20);
        c.closePath(); c.fill();
      }
    }
    c.strokeStyle = cc; c.lineWidth = 3;
    c.strokeRect(10, 10, W - 20, H - 20);
  }, { transparent: false, roughness: 0.95, side: THREE.DoubleSide });

  const matRugA = kilim('#7a1f2a', '#a83a2a', '#e0b23a', 1);
  const matRugB = kilim('#1c2a55', '#2b4a8a', '#d9a227', 2);
  const matRugC = kilim('#2b5a3a', '#0f8f86', '#efe6d2', 3);
  const RUGS = [matRugA, matRugB, matRugC];

  /** Chalk graffiti / shop hand-lettering. */
  const matChalk = M.painted(256, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(245,240,225,0.75)'; c.lineWidth = 4; c.lineCap = 'round';
    const rr = ctx.rng.fork('chalk');
    for (let i = 0; i < 7; i++) {
      const y = 22 + i * 14;
      let x = 14 + rr.range(0, 20);
      c.beginPath(); c.moveTo(x, y);
      while (x < W - 24) {
        const nx = x + rr.range(8, 22);
        c.quadraticCurveTo(x + 6, y + rr.range(-8, 8), nx, y + rr.range(-3, 3));
        x = nx;
      }
      c.stroke();
    }
  }, { transparent: true, alphaTest: 0.06, roughness: 0.95 });

  /** Soft radial mote used for dust and light shafts. */
  const dustTex = M.painted(64, 64, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,244,214,1)');
    g.addColorStop(0.35, 'rgba(255,238,196,0.5)');
    g.addColorStop(1, 'rgba(255,230,180,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, {}).map;

  /** Star-hole light pattern thrown on the souk hall floor. */
  const starTex = M.painted(256, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, W * 0.5);
    g.addColorStop(0, 'rgba(255,246,214,0.95)');
    g.addColorStop(1, 'rgba(255,236,190,0)');
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const r = (i % 2 === 0) ? W * 0.46 : W * 0.19;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath(); c.fill();
  }, {}).map;

  /** Palm frond blade with alpha. */
  const frondTex = M.painted(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = '#4e6b2e'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(6, H / 2); c.quadraticCurveTo(W * 0.5, H * 0.18, W - 6, H * 0.42); c.stroke();
    c.strokeStyle = '#5f7f36'; c.lineWidth = 3.5;
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const bx = 6 + (W - 12) * t;
      const by = H / 2 + (H * 0.18 - H / 2) * 2 * t * (1 - t) + (H * 0.42 - H / 2) * t * t;
      const l = 30 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 6;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + l * 0.35, by - l); c.stroke();
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + l * 0.35, by + l); c.stroke();
    }
  }, { transparent: true, alphaTest: 0.4, roughness: 0.9, side: THREE.DoubleSide }).map;

  /** Pigeon silhouette. */
  const pigeonTex = M.painted(64, 64, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#6d6f78';
    c.beginPath(); c.ellipse(30, 36, 16, 9, -0.2, 0, 6.283); c.fill();
    c.beginPath(); c.arc(46, 28, 7, 0, 6.283); c.fill();
    c.fillStyle = '#8f929b';
    c.beginPath(); c.moveTo(26, 30); c.lineTo(12, 12); c.lineTo(34, 26); c.closePath(); c.fill();
    c.fillStyle = '#4a4c52';
    c.beginPath(); c.moveTo(14, 38); c.lineTo(2, 44); c.lineTo(16, 44); c.closePath(); c.fill();
  }, { transparent: true, alphaTest: 0.4, roughness: 0.9, side: THREE.DoubleSide }).map;

  const addMat = (tex, opacity = 1, color = 0xffffff) => new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });

  // ===========================================================================
  // §3  GEOMETRY HELPERS
  // ===========================================================================

  /** Ground quad with world-scale UVs so tiling matches across split slabs. */
  function groundQuad(cx, cz, w, d, material, tile = 8, y = 0, collide = true) {
    const g = new THREE.PlaneGeometry(w, d, 1, 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
    uv.needsUpdate = true;
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true; m.castShadow = false;
    m.userData.collide = collide;
    m.position.set(cx, y, cz);
    return m;
  }

  /** A box swept from a→b: the workhorse for ramps, bridges and spiral stairs. */
  function slab(a, b, width, thick, material, opts = {}) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const hor = Math.hypot(dx, dz) || 0.001;
    const len = Math.hypot(hor, dy);
    const m = P.boxC(len, thick, width, material, {
      collide: opts.collide !== false, shadow: opts.shadow !== false,
    });
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.rotation.order = 'YXZ';
    m.rotation.y = Math.atan2(-dz, dx);
    m.rotation.z = Math.atan2(dy, hor);
    return m;
  }

  /**
   * A flight of stairs: visible treads (decor) plus an invisible ramp proxy so
   * the capsule controller never snags on a step edge.
   */
  function stairRun(ax, az, ay, bx, bz, by, width, material, out) {
    const hor = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(3, Math.round((by - ay) / 0.24));
    const ux = (bx - ax) / steps, uz = (bz - az) / steps, uy = (by - ay) / steps;
    const yaw = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i < steps; i++) {
      const t = P.boxC(hor / steps + 0.06, uy + 0.05, width, material, { collide: false });
      t.position.set(ax + ux * (i + 0.5), ay + uy * (i + 0.5) - uy * 0.5, az + uz * (i + 0.5));
      t.rotation.y = yaw;
      t.receiveShadow = true;
      out.add(t);
    }
    const ramp = slab(V3(ax, ay - 0.12, az), V3(bx, by - 0.12, bz), width, 0.3, material);
    ramp.visible = false;
    ctx.add(ramp);
    // low kerbs so you cannot walk off the side of the flight
    for (const s of [-1, 1]) {
      const k = slab(V3(ax, ay + 0.25, az), V3(bx, by + 0.25, bz), 0.18, 0.5, material, { collide: false });
      k.position.x += Math.sin(yaw) * s * width * 0.5;
      k.position.z += Math.cos(yaw) * s * width * 0.5;
      out.add(k);
    }
    return { yaw, steps };
  }

  /** Gently sagging cloth panel lying in XZ — awnings, canopies, hung rugs. */
  function clothGeo(w, d, sag, sx = 8, sz = 4) {
    const g = new THREE.PlaneGeometry(w, d, sx, sz);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (2 * p.getX(i)) / w, v = (2 * p.getZ(i)) / d;
      p.setY(i, -sag * (1 - u * u) * (0.55 + 0.45 * (1 - v * v)));
    }
    g.computeVertexNormals();
    return g;
  }

  /** Open cylinder arc — minaret drums, vaults, tank walls. Both-side collide. */
  function shellArc(r, h, seg, thetaStart, thetaLength, material, collide) {
    const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, thetaStart, thetaLength);
    const m = new THREE.Mesh(g, material);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.collide = !!collide;
    return m;
  }

  /**
   * Collapse a hand-built group to one mesh per material, keeping the collidable
   * and non-collidable halves separate so collision survives the merge.
   * Anything that animates by transform must be kept OUT of a baked group.
   */
  function bake(group) {
    group.updateMatrixWorld(true);
    const solidG = new THREE.Group(), decorG = new THREE.Group();
    const list = [];
    group.traverse(o => { if (o.isMesh && !o.isInstancedMesh) list.push(o); });
    for (const o of list) {
      const c = new THREE.Mesh(o.geometry, o.material);
      c.matrixAutoUpdate = false;
      c.matrix.copy(o.matrixWorld);
      c.castShadow = o.castShadow; c.receiveShadow = o.receiveShadow;
      (o.userData.collide ? solidG : decorG).add(c);
    }
    if (solidG.children.length) ctx.addSolid(P.freeze(solidG));
    if (decorG.children.length) ctx.addDecor(P.freeze(decorG));
  }

  const districts = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  const districtOf = (x, z) => (x > 0 ? 1 : 0) + (z > 0 ? 2 : 0);
  const deco = (x, z, obj) => { districts[districtOf(x, z)].add(obj); return obj; };

  // ===========================================================================
  // §4  TERRAIN — ground slabs (with the cistern hole), dunes, wall, gate.
  // ===========================================================================

  // Ground is split into four slabs so the cistern stair shaft is a real hole.
  ctx.add(groundQuad(0, (-92 + SHAFT.z0) / 2, 192, SHAFT.z0 + 92, matSand, 9));
  ctx.add(groundQuad(0, (SHAFT.z1 + 92) / 2, 192, 92 - SHAFT.z1, matSand, 9));
  ctx.add(groundQuad((-96 + SHAFT.x0) / 2, (SHAFT.z0 + SHAFT.z1) / 2,
    SHAFT.x0 + 96, SHAFT.z1 - SHAFT.z0, matSand, 9));
  ctx.add(groundQuad((SHAFT.x1 + 96) / 2, (SHAFT.z0 + SHAFT.z1) / 2,
    96 - SHAFT.x1, SHAFT.z1 - SHAFT.z0, matSand, 9));

  // Safety floor OUTSIDE the wall only — four quads, so the cistern shaft in
  // the middle of town stays a real hole.
  for (const [cx, cz, w, d] of [
    [0, -(260 + WALL_Z) / 2, 520, 260 - WALL_Z],
    [0, (260 + WALL_Z) / 2, 520, 260 - WALL_Z],
    [-(260 + WALL_X) / 2, 0, 260 - WALL_X, 2 * WALL_Z],
    [(260 + WALL_X) / 2, 0, 260 - WALL_X, 2 * WALL_Z]]) {
    ctx.add(groundQuad(cx, cz, w, d, matSand, 14, -0.5));
  }

  // Undulating dunes beyond the wall, flattened over the town footprint.
  {
    const g = new THREE.PlaneGeometry(520, 520, 90, 90);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const mask = clamp((Math.max(Math.abs(x) / (WALL_X + 6), Math.abs(z) / (WALL_Z + 6)) - 1) * 0.9, 0, 1);
      const hgt = (N.fbm(x * 0.006, z * 0.006, 4) * 7 + N.ridged(x * 0.017, z * 0.017, 3) * 2.4);
      p.setY(i, hgt * mask * mask);
    }
    g.computeVertexNormals();
    const dunes = new THREE.Mesh(g, matSand);
    dunes.position.y = -0.45;
    dunes.receiveShadow = true;
    ctx.addDecor(dunes);
  }

  // Distant mesas so the horizon is not empty.
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const mesas = P.scatter(rockGeo, matStone, 46, (i, d, r) => {
      const a = r() * Math.PI * 2, dist = r.range(150, 250);
      d.position.set(Math.cos(a) * dist, r.range(-4, 2), Math.sin(a) * dist);
      d.scale.set(r.range(10, 34), r.range(5, 16), r.range(10, 30));
      d.rotation.y = r() * 6.28;
    }, 9001);
    mesas.castShadow = false;
    ctx.addDecor(mesas);
  }

  // Worn earth where the alleys spill into the open — breaks up the sand.
  {
    const wr = R.fork('wear');
    for (let i = 0; i < 16; i++) {
      const pl = wr.pick([PLAZA_A, PLAZA_B, PLAZA_C]);
      const a = wr.range(0, 6.28), rad = wr.range(pl.r * 0.4, pl.r * 1.25);
      const patch = new THREE.Mesh(new THREE.CircleGeometry(wr.range(3.5, 8), 12), matDirt);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = wr.range(0, 6.28);
      patch.position.set(pl.x + Math.cos(a) * rad, 0.012, pl.z + Math.sin(a) * rad);
      patch.receiveShadow = true;
      ctx.addDecor(patch);
    }
  }

  // --- the town wall ---------------------------------------------------------
  {
    const wall = new THREE.Group();
    const seg = (x1, z1, x2, z2) => wall.add(P.wallBetween(x1, z1, x2, z2, WALL_H, 1.8, matMud));
    seg(-WALL_X, WALL_Z, -GATE_HALF, WALL_Z);
    seg(GATE_HALF, WALL_Z, WALL_X, WALL_Z);
    seg(-WALL_X, -WALL_Z, WALL_X, -WALL_Z);
    seg(-WALL_X, -WALL_Z, -WALL_X, WALL_Z);
    seg(WALL_X, -WALL_Z, WALL_X, WALL_Z);
    // crenellated coping
    for (const [ax, az, bx, bz] of [
      [-WALL_X, WALL_Z, WALL_X, WALL_Z], [-WALL_X, -WALL_Z, WALL_X, -WALL_Z],
      [-WALL_X, -WALL_Z, -WALL_X, WALL_Z], [WALL_X, -WALL_Z, WALL_X, WALL_Z]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(len / 2.4);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (Math.abs(z - WALL_Z) < 0.5 && Math.abs(x) < GATE_HALF + 1) continue;
        const c = P.boxC(1.1, 1.3, 1.1, matMud, { collide: false });
        c.position.set(x, WALL_H + 0.65, z);
        c.rotation.y = R.range(-0.05, 0.05);
        wall.add(c);
      }
    }
    // corner towers
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const t = P.cyl(3.6, 4.2, 13, matMud, { seg: 14 });
      t.position.set(sx * WALL_X, 0, sz * WALL_Z);
      wall.add(t);
      const cap = P.cyl(4.6, 4.6, 0.5, matStone, { seg: 14, collide: false });
      cap.position.set(sx * WALL_X, 13, sz * WALL_Z);
      wall.add(cap);
    }
    bake(wall);

    // Invisible parapet extension: roofs are 12 m, the wall must not be a ramp out.
    for (const [x, z, w, d] of [
      [0, WALL_Z, 2 * WALL_X, 1.8], [0, -WALL_Z, 2 * WALL_X, 1.8],
      [-WALL_X, 0, 1.8, 2 * WALL_Z], [WALL_X, 0, 1.8, 2 * WALL_Z]]) {
      const b = P.boxC(w, 18, d, matMud, { shadow: false });
      b.position.set(x, WALL_H + 9, z);
      b.visible = false; b.userData.collide = true;
      ctx.add(b);
    }
  }

  // --- the gate --------------------------------------------------------------
  {
    const g = new THREE.Group();
    const arch = P.archway(GATE_HALF * 2, 6.2, 2.4, matStone);
    arch.position.set(0, 0, WALL_Z);
    g.add(arch);
    const lintel = P.boxC(GATE_HALF * 2 + 1.6, 3.4, 2.0, matMud);
    lintel.position.set(0, 8.2, WALL_Z);
    g.add(lintel);
    // studded timber doors, shut — this is what seals the town
    for (const s of [-1, 1]) {
      const leaf = P.boxC(GATE_HALF - 0.1, 6.0, 0.3, matWoodD);
      leaf.position.set(s * GATE_HALF / 2, 3.0, WALL_Z - 0.2);
      g.add(leaf);
      for (let i = 0; i < 12; i++) {
        const st = P.sphere(0.09, matIron, { seg: 6, collide: false });
        st.position.set(s * GATE_HALF / 2 + R.range(-1.2, 1.2), 0.6 + i * 0.45, WALL_Z - 0.36);
        g.add(st);
      }
    }
    const band = P.boxC(GATE_HALF * 2 + 2.2, 1.5, 0.25, matZelligeA, { collide: false });
    band.position.set(0, 7.0, WALL_Z - 0.95);
    g.add(band);
    bake(g);
  }

  // ===========================================================================
  // §5  ORGANIC STREET NETWORK
  //     Three plaza nodes seeded by hand; every street between them is grown by
  //     recursive midpoint displacement driven by fbm, so nothing is a grid.
  // ===========================================================================

  const streetPts = [];   // {x, z, hw} — dense samples, used for everything
  const streetSegs = [];

  function windingPath(a, b, jitter) {
    let pts = [[a[0], a[1]], [b[0], b[1]]];
    for (let it = 0; it < 3; it++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        const dx = q[0] - p[0], dz = q[1] - p[1];
        const L = Math.hypot(dx, dz) || 1;
        const amt = N.fbm(mx * 0.031 + it * 4.1, mz * 0.031 - it * 2.7, 3) * jitter * (L / 34);
        out.push([mx - (dz / L) * amt, mz + (dx / L) * amt]);
        out.push(q);
      }
      pts = out;
    }
    return pts;
  }

  function layStreet(pts, width) {
    const hw = width / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      streetSegs.push({ ax, az, bx, bz, hw });
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 1.1));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        streetPts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, hw, dir: Math.atan2(bz - az, bx - ax) });
      }
    }
  }

  for (const [a, b, w] of EDGES) layStreet(windingPath(NODES[a], NODES[b], w > 6 ? 3.5 : 7.0), w);

  // Dead-end stubs — the medina must punish confident navigation.
  {
    const sr = R.fork('stubs');
    for (let i = 0; i < 11; i++) {
      const src = streetPts[sr.int(0, streetPts.length - 1)];
      if (Math.abs(src.x) > 74 || Math.abs(src.z) > 70) continue;
      const a = src.dir + Math.PI / 2 * sr.sign() + sr.range(-0.5, 0.5);
      const len = sr.range(9, 17);
      const end = [src.x + Math.cos(a) * len, src.z + Math.sin(a) * len];
      if (Math.abs(end[0]) > 80 || Math.abs(end[1]) > 76) continue;
      layStreet(windingPath([src.x, src.z], end, 9), sr.range(2.4, 3.2));
    }
  }

  const nearStreet = (x, z, pad) => {
    for (let i = 0; i < streetPts.length; i++) {
      const s = streetPts[i];
      const dx = Math.abs(s.x - x), dz = Math.abs(s.z - z);
      if (dx < pad + s.hw && dz < pad + s.hw) {
        if (Math.hypot(Math.max(0, dx - pad), Math.max(0, dz - pad)) < s.hw) return true;
      }
    }
    return false;
  };

  const rectHitsStreet = (r, clear) => {
    for (let i = 0; i < streetPts.length; i++) {
      const s = streetPts[i];
      if (s.x > r.x0 - s.hw - clear && s.x < r.x1 + s.hw + clear &&
        s.z > r.z0 - s.hw - clear && s.z < r.z1 + s.hw + clear) return true;
    }
    return false;
  };

  // ===========================================================================
  // §6  BUILDING PLACEMENT — anchors first, then organic infill in the gaps.
  // ===========================================================================

  /** roof node: {x0,x1,z0,z1,cx,cz,h,base,kind,noParapet:Set} */
  const blocks = [];
  const pushBlock = (cx, cz, w, d, h, kind, base = 0) => {
    const b = {
      x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2,
      cx, cz, w, d, h, base, kind, noParapet: new Set(),
    };
    blocks.push(b);
    return b;
  };

  // --- caravanserai wings double as roof nodes ------------------------------
  const SW_W = { cx: SERAI.x0 + SERAI.wing / 2, cz: (SERAI.z0 + SERAI.z1) / 2, w: SERAI.wing, d: SERAI.z1 - SERAI.z0 };
  const SW_E = { cx: SERAI.x1 - SERAI.wing / 2, cz: SW_W.cz, w: SERAI.wing, d: SW_W.d };
  const SW_N = { cx: (SERAI.x0 + SERAI.x1) / 2, cz: SERAI.z0 + SERAI.wing / 2, w: SERAI.x1 - SERAI.x0 - 2 * SERAI.wing, d: SERAI.wing };
  const SW_S = { cx: SW_N.cx, cz: SERAI.z1 - SERAI.wing / 2, w: SW_N.w, d: SERAI.wing };
  const seraiWings = [SW_W, SW_E, SW_N, SW_S].map(s => pushBlock(s.cx, s.cz, s.w, s.d, SERAI.roof, 'serai'));

  // --- anchors: each one carries a guaranteed ground→roof route -------------
  // Streets are grown before buildings, so an anchor cannot simply be dropped
  // at a hand-picked coordinate — it spirals outward until it finds air.
  function placeAnchor(px, pz, w, d, h, maxR, filter) {
    for (const clear of [1.0, 0.3]) {
      for (let r = 0; r <= maxR; r += 1.5) {
        const steps = r < 0.1 ? 1 : 12;
        for (let a = 0; a < steps; a++) {
          const th = (a / steps) * Math.PI * 2 + r * 0.35;
          const cx = px + Math.cos(th) * r, cz = pz + Math.sin(th) * r;
          if (Math.abs(cx) > 78 || Math.abs(cz) > 76) continue;
          if (filter && !filter(cx, cz)) continue;
          const rc = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
          if (rectHitsStreet(rc, clear)) continue;
          let bad = false;
          for (const rv of RESERVED) {
            if (rc.x0 < rv.x1 + 1 && rc.x1 > rv.x0 - 1 && rc.z0 < rv.z1 + 1 && rc.z1 > rv.z0 - 1) { bad = true; break; }
          }
          if (!bad) for (const o of blocks) { if (rectGap(rc, o) < 0.8) { bad = true; break; } }
          if (bad) continue;
          return pushBlock(cx, cz, w, d, h, 'anchor');
        }
      }
    }
    return pushBlock(px, pz, w, d, h, 'anchor');
  }
  // The minaret's upper door can only be where the helical ramp reaches 12 m,
  // which is due +Z of the tower — so this anchor is constrained to that side.
  const A_MINARET = placeAnchor(26, 62, 10, 10, MINARET.door2, 24,
    (x, z) => x > 18 && x < 46 && z > 54 && z < 76);
  const A_STAIR = placeAnchor(44, 58, 12, 11, 6.2, 26, (x, z) => x > 26 && x < 72 && z > 36 && z < 76);
  const A_RAMP = placeAnchor(-36, -16, 11, 10, 4.4, 20);
  const A_SERAI = placeAnchor(18, -40, 11, 10, 5.8, 22, (x, z) => x > 4 && x < 26.5 && z > -58 && z < -18);
  const A_NORTH = placeAnchor(26, -66, 12, 11, 5.0, 20);

  // --- procedural infill -----------------------------------------------------
  const br = R.fork('blocks');
  for (let gz = -76; gz <= 76; gz += 12.0) {
    for (let gx = -80; gx <= 80; gx += 12.0) {
      const cx = gx + br.gauss(0, 2.6), cz = gz + br.gauss(0, 2.6);
      if (Math.abs(cx) > 80 || Math.abs(cz) > 76) continue;
      let w = br.range(7.0, 12.5), d = br.range(7.0, 12.5);
      let placed = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
        let bad = rectHitsStreet(r, 1.1);
        if (!bad) for (const rv of RESERVED) {
          if (r.x0 < rv.x1 + 1 && r.x1 > rv.x0 - 1 && r.z0 < rv.z1 + 1 && r.z1 > rv.z0 - 1) { bad = true; break; }
        }
        if (!bad) for (const o of blocks) { if (rectGap(r, o) < 0.5) { bad = true; break; } }
        if (!bad) { placed = r; break; }
        w -= 1.6; d -= 1.6;
        if (w < 6 || d < 6) break;
      }
      if (!placed) continue;
      const hn = N.fbm(cx * 0.021 + 3.3, cz * 0.021 - 1.7, 3) * 0.5 + 0.5;
      let h = 3.2 + hn * 8.0 + br.range(-0.7, 1.0);
      h = clamp(Math.round(h * 4) / 4, 3.0, 12.0);
      pushBlock(cx, cz, w, d, h, 'block');
    }
  }

  // --- covered tunnels: blocks that bridge over an alley ---------------------
  const tunnels = [];
  {
    const tr = R.fork('tunnels');
    let tries = 0;
    while (tunnels.length < 6 && tries++ < 400) {
      const s = streetPts[tr.int(0, streetPts.length - 1)];
      if (Math.abs(s.x) > 66 || Math.abs(s.z) > 62) continue;
      if (Math.hypot(s.x - PLAZA_A.x, s.z - PLAZA_A.z) < 26) continue;
      if (Math.hypot(s.x - PLAZA_B.x, s.z - PLAZA_B.z) < 20) continue;
      if (Math.hypot(s.x - PLAZA_C.x, s.z - PLAZA_C.z) < 20) continue;
      if (inRect(SERAI, s.x, s.z, 6)) continue;
      if (tunnels.some(t => Math.hypot(t.cx - s.x, t.cz - s.z) < 24)) continue;
      const w = tr.range(10, 14), d = tr.range(10, 14);
      const top = 3.6 + tr.range(2.6, 5.4);
      const b = pushBlock(s.x, s.z, w, d, clamp(top, 6.2, 11.5), 'tunnel', 3.6);
      tunnels.push(b);
    }
  }

  // ===========================================================================
  // §7  BUILDING CONSTRUCTION — irregular masses, beam ends, mashrabiya, doors.
  // ===========================================================================

  const beamEnds = [];   // {x,y,z,ry}
  const lanternSpots = []; // {x,y,z}
  const roofProps = [];  // {x,z,h,kind}
  const parapetGroup = new THREE.Group();

  const bg = R.fork('mass');
  for (const b of blocks) {
    if (b.kind === 'serai') continue;               // built by hand in §10
    const dg = districts[districtOf(b.cx, b.cz)];
    const wm = WALLMATS[bg.int(0, WALLMATS.length - 1)];
    const base = b.base;
    const bodyH = b.h - base;

    // collision proxy: one invisible box whose top IS the walkable roof
    const proxy = P.boxC(b.w, bodyH, b.d, wm, { shadow: false });
    proxy.position.set(b.cx, base + bodyH / 2, b.cz);
    proxy.visible = false; proxy.userData.collide = true;
    ctx.add(proxy);

    // main mass
    const mass = P.boxC(b.w, bodyH, b.d, wm, { collide: false });
    mass.position.set(b.cx, base + bodyH / 2, b.cz);
    dg.add(mass);

    // broken silhouette: setbacks and bump-outs, never perfect cuboids
    if (bg.chance(0.75) && bodyH > 4) {
      const sw = b.w * bg.range(0.35, 0.7), sd = b.d * bg.range(0.35, 0.7);
      const sh = bg.range(1.2, 2.6);
      const sb = P.boxC(sw, sh, sd, wm, { collide: false });
      sb.position.set(b.cx + bg.gauss(0, b.w * 0.14), b.h + sh / 2 - 0.05, b.cz + bg.gauss(0, b.d * 0.14));
      dg.add(sb);
      // the setback is a small penthouse — make its top standable too
      const sp = P.boxC(sw, sh, sd, wm, { shadow: false });
      sp.position.copy(sb.position); sp.visible = false; sp.userData.collide = true;
      ctx.add(sp);
      roofProps.push({ x: sb.position.x, z: sb.position.z, h: b.h + sh, kind: 'penthouse' });
    }
    if (bg.chance(0.5)) {
      const side = bg.int(0, 3);
      const ow = bg.range(2.0, 4.2), oh = bg.range(1.6, Math.max(2.0, bodyH * 0.55));
      const ob = P.boxC(side < 2 ? ow : 0.7, oh, side < 2 ? 0.7 : ow, wm, { collide: false });
      const oy = base + bg.range(1.6, Math.max(2.0, bodyH - oh - 0.4));
      ob.position.set(
        b.cx + (side === 0 ? bg.gauss(0, 1.5) : side === 1 ? bg.gauss(0, 1.5) : (side === 2 ? -1 : 1) * (b.w / 2 + 0.3)),
        oy + oh / 2,
        b.cz + (side === 0 ? -(b.d / 2 + 0.3) : side === 1 ? (b.d / 2 + 0.3) : bg.gauss(0, 1.5)));
      dg.add(ob);
    }

    // roof slab: overhanging lip whose top sits exactly on the proxy top
    const slabM = bg.chance(0.25) ? matRoofTile : (bg.chance(0.22) ? matCorr : wm);
    const roof = P.boxC(b.w + 0.55, 0.3, b.d + 0.55, slabM, { collide: false });
    roof.position.set(b.cx, b.h - 0.15, b.cz);
    dg.add(roof);

    // protruding beam ends — the signature of the style
    const rows = bodyH > 7 ? 2 : 1;
    for (let r0 = 0; r0 < rows; r0++) {
      const y = base + bodyH * (rows === 1 ? 0.62 : 0.42 + r0 * 0.34);
      const nx = Math.max(2, Math.floor(b.w / 2.1));
      for (let i = 0; i < nx; i++) {
        const x = b.x0 + (i + 0.5) * (b.w / nx);
        beamEnds.push({ x, y, z: b.z0 - 0.16, ry: 0 });
        beamEnds.push({ x, y, z: b.z1 + 0.16, ry: 0 });
      }
      const nz = Math.max(2, Math.floor(b.d / 2.1));
      for (let i = 0; i < nz; i++) {
        const z = b.z0 + (i + 0.5) * (b.d / nz);
        beamEnds.push({ x: b.x0 - 0.16, y, z, ry: Math.PI / 2 });
        beamEnds.push({ x: b.x1 + 0.16, y, z, ry: Math.PI / 2 });
      }
    }

    // openings: recessed windows behind mashrabiya screens, coloured glass
    const faces = [
      { nx: 0, nz: -1, len: b.w, cx: b.cx, cz: b.z0, ry: 0 },
      { nx: 0, nz: 1, len: b.w, cx: b.cx, cz: b.z1, ry: Math.PI },
      { nx: -1, nz: 0, len: b.d, cx: b.x0, cz: b.cz, ry: -Math.PI / 2 },
      { nx: 1, nz: 0, len: b.d, cx: b.x1, cz: b.cz, ry: Math.PI / 2 },
    ];
    for (const f of faces) {
      if (!nearStreet(f.cx + f.nx * 2.6, f.cz + f.nz * 2.6, 2.4)) continue;
      const count = bg.int(2, 4);
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count + bg.range(-0.1, 0.1);
        const ox = f.nz !== 0 ? (t - 0.5) * f.len * 0.82 : 0;
        const oz = f.nx !== 0 ? (t - 0.5) * f.len * 0.82 : 0;
        const wy = base + bg.range(1.9, Math.max(2.4, bodyH - 1.6));
        const ww = bg.range(0.7, 1.05), wh = bg.range(0.9, 1.4);
        const rec = P.boxC(f.nz !== 0 ? ww : 0.2, wh, f.nx !== 0 ? ww : 0.2,
          M.solid({ color: 0x140f0a, roughness: 1 }), { collide: false, shadow: false });
        rec.position.set(f.cx + ox + f.nx * 0.02, wy, f.cz + oz + f.nz * 0.02);
        dg.add(rec);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(ww * 1.25, wh * 1.2), matMashrabiya);
        scr.position.set(f.cx + ox + f.nx * 0.14, wy, f.cz + oz + f.nz * 0.14);
        scr.rotation.y = f.ry;
        scr.castShadow = true; scr.userData.collide = false;
        dg.add(scr);
        if (bg.chance(0.2)) {
          const glass = P.boxC(f.nz !== 0 ? ww * 0.5 : 0.05, wh * 0.3, f.nx !== 0 ? ww * 0.5 : 0.05,
            M.emissive(bg.pick([0x2f6fc0, 0x18a08a, 0xc03a2a]), 1.4), { collide: false, shadow: false });
          glass.position.set(f.cx + ox + f.nx * 0.08, wy + wh * 0.32, f.cz + oz + f.nz * 0.08);
          dg.add(glass);
        }
        // wooden sill + a lantern bracket now and then
        const sill = P.boxC(f.nz !== 0 ? ww * 1.5 : 0.4, 0.1, f.nx !== 0 ? ww * 1.5 : 0.4, matWoodD, { collide: false });
        sill.position.set(f.cx + ox + f.nx * 0.2, wy - wh * 0.62, f.cz + oz + f.nz * 0.2);
        dg.add(sill);
      }
      // a keyhole door on the ground floor
      if (b.kind !== 'tunnel' && bg.chance(0.55)) {
        const t = bg.range(0.25, 0.75);
        const ox = f.nz !== 0 ? (t - 0.5) * f.len * 0.7 : 0;
        const oz = f.nx !== 0 ? (t - 0.5) * f.len * 0.7 : 0;
        const arch = P.archway(1.35, 2.25, 0.5, matWhite);
        arch.position.set(f.cx + ox + f.nx * 0.26, base, f.cz + oz + f.nz * 0.26);
        arch.rotation.y = f.ry;
        dg.add(arch);
        const leaf = P.boxC(1.3, 2.2, 0.12, matWoodD, { collide: false });
        leaf.position.set(f.cx + ox + f.nx * 0.1, base + 1.1, f.cz + oz + f.nz * 0.1);
        leaf.rotation.y = f.ry;
        dg.add(leaf);
        const band = P.boxC(1.9, 0.55, 0.1, matZelligeB, { collide: false, shadow: false });
        band.position.set(f.cx + ox + f.nx * 0.34, base + 3.05, f.cz + oz + f.nz * 0.34);
        band.rotation.y = f.ry;
        dg.add(band);
        lanternSpots.push({ x: f.cx + ox + f.nx * 0.55, y: base + 2.7, z: f.cz + oz + f.nz * 0.55 });
        if (bg.chance(0.28)) {
          const gr = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), matChalk);
          gr.position.set(f.cx + ox + f.nx * 0.18 + (f.nz !== 0 ? 1.8 : 0), base + 1.5,
            f.cz + oz + f.nz * 0.18 + (f.nx !== 0 ? 1.8 : 0));
          gr.rotation.y = f.ry;
          gr.userData.collide = false;
          dg.add(gr);
        }
      }
    }

    // pick roof furniture for later
    roofProps.push({ x: b.cx, z: b.cz, h: b.h, kind: 'main', b });
  }

  // ===========================================================================
  // §8  ROOFTOP NETWORK — a minimum spanning tree over the roofs, bridged.
  // ===========================================================================

  const bridgeGroup = new THREE.Group();
  const bridgeEnds = [];  // {x, z} — parapet gaps go here

  function edgeOf(b, x, z) {
    const dl = Math.abs(x - b.x0), dr = Math.abs(x - b.x1);
    const dn = Math.abs(z - b.z0), ds = Math.abs(z - b.z1);
    const m = Math.min(dl, dr, dn, ds);
    return m === dl ? 'w' : m === dr ? 'e' : m === dn ? 'n' : 's';
  }

  function makeBridge(A, B) {
    const p1 = [clamp(B.cx, A.x0, A.x1), clamp(B.cz, A.z0, A.z1)];
    const p2 = [clamp(A.cx, B.x0, B.x1), clamp(A.cz, B.z0, B.z1)];
    let dx = p2[0] - p1[0], dz = p2[1] - p1[1];
    let gap = Math.hypot(dx, dz);
    if (gap < 0.001) { dx = B.cx - A.cx; dz = B.cz - A.cz; gap = Math.hypot(dx, dz) || 1; }
    const ux = dx / Math.max(gap, 0.001), uz = dz / Math.max(gap, 0.001);
    const dh = Math.abs(A.h - B.h);
    if (gap < 1.5 && dh < 0.55) return false;          // just step across
    const need = Math.max(gap + 1.8, dh / 0.5);
    const extra = need - (gap + 1.8);
    const hiIsA = A.h >= B.h;
    const hi = hiIsA ? A : B, lo = hiIsA ? B : A;
    const hiP = hiIsA ? p1 : p2, loP = hiIsA ? p2 : p1;
    const sgn = hiIsA ? -1 : 1;                        // inward on the high roof
    const sx = hiP[0] + ux * sgn * (extra + 0.9);
    const sz = hiP[1] + uz * sgn * (extra + 0.9);
    const ex = loP[0] - ux * sgn * 0.9;
    const ez = loP[1] - uz * sgn * 0.9;
    const deck = slab(V3(sx, hi.h + 0.09, sz), V3(ex, lo.h + 0.09, ez), 1.75, 0.18, matWoodL);
    bridgeGroup.add(deck);
    // plank ribs + rope handline, purely decorative
    const L = Math.hypot(ex - sx, ez - sz);
    const ribs = Math.max(2, Math.floor(L / 0.55));
    for (let i = 0; i < ribs; i++) {
      const t = (i + 0.5) / ribs;
      const rib = P.boxC(0.16, 0.07, 1.85, matWoodD, { collide: false });
      rib.position.set(sx + (ex - sx) * t, hi.h + 0.22 + (lo.h - hi.h) * t, sz + (ez - sz) * t);
      rib.rotation.y = Math.atan2(-(ez - sz), ex - sx);
      deco((sx + ex) / 2, (sz + ez) / 2, rib);
    }
    for (const s of [-1, 1]) {
      const rope = slab(V3(sx, hi.h + 0.85, sz), V3(ex, lo.h + 0.85, ez), 0.05, 0.05, matWoodD, { collide: false });
      rope.position.x += -uz * s * 0.85;
      rope.position.z += ux * s * 0.85;
      deco((sx + ex) / 2, (sz + ez) / 2, rope);
    }
    if (L > 12) {                                       // long spans get props
      const posts = Math.floor(L / 6);
      for (let i = 1; i <= posts; i++) {
        const t = i / (posts + 1);
        const py = hi.h + (lo.h - hi.h) * t;
        const post = P.boxC(0.22, py, 0.22, matWoodD, { collide: false });
        post.position.set(sx + (ex - sx) * t, py / 2, sz + (ez - sz) * t);
        deco((sx + ex) / 2, (sz + ez) / 2, post);
      }
    }
    hi.noParapet.add(edgeOf(hi, hiP[0], hiP[1]));
    lo.noParapet.add(edgeOf(lo, loP[0], loP[1]));
    bridgeEnds.push({ x: hiP[0], z: hiP[1] }, { x: loP[0], z: loP[1] });
    return true;
  }

  // Prim's algorithm over the roof set, cost = gap + 2·height difference.
  {
    const n = blocks.length;
    const inTree = new Array(n).fill(false);
    const best = new Array(n).fill(Infinity);
    const from = new Array(n).fill(-1);
    inTree[0] = true;
    for (let i = 1; i < n; i++) {
      best[i] = rectGap(blocks[0], blocks[i]) + 2 * Math.abs(blocks[0].h - blocks[i].h);
      from[i] = 0;
    }
    for (let k = 1; k < n; k++) {
      let pick = -1, pc = Infinity;
      for (let i = 0; i < n; i++) if (!inTree[i] && best[i] < pc) { pc = best[i]; pick = i; }
      if (pick < 0) break;
      inTree[pick] = true;
      makeBridge(blocks[from[pick]], blocks[pick]);
      for (let i = 0; i < n; i++) {
        if (inTree[i]) continue;
        const c = rectGap(blocks[pick], blocks[i]) + 2 * Math.abs(blocks[pick].h - blocks[i].h);
        if (c < best[i]) { best[i] = c; from[i] = pick; }
      }
    }
    // extra loops so the rooftop map is a network, not a tree
    const lr = R.fork('loops');
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const g = rectGap(blocks[i], blocks[j]);
      if (g > 0.6 && g < 5.5 && Math.abs(blocks[i].h - blocks[j].h) < 2.4 && lr.chance(0.16)) {
        makeBridge(blocks[i], blocks[j]);
      }
    }
  }
  bake(bridgeGroup);

  // (parapets are raised in §12, once every bridge and stair has claimed its
  //  landing edge — otherwise we would wall the routes off.)

  // --- the four+ ground→roof routes -----------------------------------------
  const routeGroup = new THREE.Group();
  {
    /**
     * A flight climbing the flank of a block, ending in a landing that overlaps
     * the roof slab. Derived from the block so it follows the anchor wherever
     * the street layout pushed it.
     */
    const externalStair = (b, side, material) => {
      const run = Math.max(7.0, b.d - 1.0);
      const x = side === 'w' ? b.x0 - 1.05 : b.x1 + 1.05;
      const z0 = b.cz + run / 2, z1 = b.cz - run / 2;
      stairRun(x, z0, 0.0, x, z1, b.h, 1.5, material, routeGroup);
      const land = P.boxC(3.4, 0.3, 2.2, material);
      land.position.set(side === 'w' ? b.x0 - 0.5 : b.x1 + 0.5, b.h - 0.15, z1);
      routeGroup.add(land);
      // brackets carrying the flight, plus a hand-line
      for (let i = 0; i < 5; i++) {
        const t = (i + 0.5) / 5;
        const brk = P.boxC(0.9, 0.22, 0.22, material, { collide: false });
        brk.position.set(x + (side === 'w' ? 0.55 : -0.55), b.h * t - 0.35, z0 - run * t);
        routeGroup.add(brk);
      }
      b.noParapet.add(side);
      return { x, z1 };
    };

    // 1. grand external stone stair in the east district
    externalStair(A_STAIR, 'w', matStone);
    // 2. timber flight off a crate stack by the spice square
    const rampTop = externalStair(A_RAMP, 'e', matWoodL);
    for (let i = 0; i < 7; i++) {
      const c = P.crate(R.range(0.7, 1.05), matWoodL);
      c.position.set(rampTop.x + R.range(-1.2, 1.2), i < 4 ? 0 : 0.9,
        A_RAMP.cz + (A_RAMP.d / 2) + R.range(0.5, 3.0));
      c.rotation.y = R.range(0, 3.14);
      routeGroup.add(c);
    }
    // 3. north square stair
    externalStair(A_NORTH, 'w', matStone);
    // 4. the minaret's 12 m door bridges onto A_MINARET (§10).
    // 5. the caravanserai's two flights reach its roof at 8.8 m (§11).

    // ladders alongside the routes — read as climbable, never load-bearing
    for (const [b, side] of [[A_RAMP, 1], [A_STAIR, -1], [A_NORTH, -1], [A_SERAI, 1]]) {
      const l = P.ladder(b.h + 0.7, matWoodD);
      l.position.set(side > 0 ? b.x1 + 0.25 : b.x0 - 0.25, 0, b.cz + b.d * 0.3);
      l.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      P.NOCOLLIDE(l);
      routeGroup.add(l);
    }
  }
  bake(routeGroup);

  // ===========================================================================
  // §9  LANDMARK 1 — THE GRAND SOUK HALL
  //     A long vaulted market street. The roof is pierced by star holes that
  //     throw patterned light on the floor (painted decals + additive shafts).
  // ===========================================================================

  const animShafts = [];
  {
    const hall = new THREE.Group();
    const len = HALL.x1 - HALL.x0, mid = (HALL.x0 + HALL.x1) / 2;

    hall.add(groundQuad(mid, HALL.zc, len, HALL.half * 2, matPave, 3.2, 0.02, false));

    // piers down both sides
    const piers = Math.floor(len / 4.2);
    for (let i = 0; i <= piers; i++) {
      const x = HALL.x0 + (i * len) / piers;
      for (const s of [-1, 1]) {
        const col = P.boxC(0.85, 4.6, 0.85, matWhite);
        col.position.set(x, 2.3, HALL.zc + s * HALL.half);
        hall.add(col);
        const cap = P.boxC(1.25, 0.4, 1.25, matZelligeB, { collide: false });
        cap.position.set(x, 4.75, HALL.zc + s * HALL.half);
        hall.add(cap);
        if (i < piers) {
          // springing arches between piers
          const ar = P.archway(3.0, 4.4, 0.7, matWhite);
          ar.position.set(x + len / piers / 2, 0, HALL.zc + s * HALL.half);
          ar.rotation.y = Math.PI / 2;
          P.NOCOLLIDE(ar);
          hall.add(ar);
        }
      }
    }

    // the vault: an open half-cylinder lying along X. Collidable, so from the
    // rooftops it reads (and behaves) as a real curved roof you can slide off.
    const vault = shellArc(HALL.half + 0.5, len, 18, 0, Math.PI, matWhiteDS, true);
    vault.geometry.rotateZ(Math.PI / 2);
    vault.position.set(mid, 4.9, HALL.zc);
    hall.add(vault);
    const vaultIn = shellArc(HALL.half + 0.34, len, 18, 0, Math.PI, matOchreDS, false);
    vaultIn.geometry.rotateZ(Math.PI / 2);
    vaultIn.position.set(mid, 4.9, HALL.zc);
    hall.add(vaultIn);

    // gable ends with keyhole openings
    for (const [x, ry] of [[HALL.x0 - 0.3, -Math.PI / 2], [HALL.x1 + 0.3, Math.PI / 2]]) {
      for (const s of [-1, 1]) {
        const w = P.boxC(0.6, 9.2, HALL.half - 1.4, matWhite);
        w.position.set(x, 4.6, HALL.zc + s * (HALL.half / 2 + 0.7));
        hall.add(w);
      }
      const top = P.boxC(0.6, 4.6, HALL.half * 2 + 1.2, matWhite);
      top.position.set(x, 8.4, HALL.zc);
      hall.add(top);
      const ar = P.archway(2.8, 4.2, 0.8, matStone);
      ar.position.set(x, 0, HALL.zc); ar.rotation.y = ry;
      P.NOCOLLIDE(ar);
      hall.add(ar);
      const zb = P.boxC(0.12, 1.1, HALL.half * 2, matZelligeA, { collide: false });
      zb.position.set(x + (ry > 0 ? 0.36 : -0.36), 6.5, HALL.zc);
      hall.add(zb);
    }

    // star holes: painted floor decals + additive shafts + emissive apertures
    const shaftMat = addMat(dustTex, 0.28, 0xfff0c8);
    const starDecalMat = addMat(starTex, 0.85, 0xfff4d2);
    for (let i = 0; i < 9; i++) {
      const x = HALL.x0 + 3 + (i / 8) * (len - 6);
      const z = HALL.zc + (i % 2 ? 1.6 : -1.6);
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), starDecalMat);
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(x, 0.05, z);
      decal.userData.collide = false;
      ctx.addDecor(decal);

      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 1.5, 10.4, 10, 1, true), shaftMat);
      cone.position.set(x, 5.2, z);
      cone.userData.collide = false;
      ctx.addDecor(cone);
      animShafts.push(cone);

      const ap = P.boxC(0.7, 0.06, 0.7, M.emissive(0xfff2cc, 6), { collide: false, shadow: false });
      ap.position.set(x, 10.35, z);
      hall.add(ap);
    }

    // stalls, hung rugs and lanterns down the length of the hall
    const hr = R.fork('hall');
    for (let i = 0; i < 16; i++) {
      const x = HALL.x0 + 3 + hr.range(0, len - 6);
      const s = hr.sign();
      const z = HALL.zc + s * hr.range(3.2, 4.4);
      const t = P.table(hr.range(1.6, 2.4), 0.78, 1.0, matWoodL);
      t.position.set(x, 0.02, z);
      t.rotation.y = s > 0 ? 0 : Math.PI;
      P.NOCOLLIDE(t);
      hall.add(t);
      if (hr.chance(0.6)) {
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), RUGS[hr.int(0, 2)]);
        rug.position.set(x, 2.6, HALL.zc + s * (HALL.half - 0.35));
        rug.rotation.y = s > 0 ? Math.PI : 0;
        rug.userData.collide = false;
        hall.add(rug);
      }
      if (hr.chance(0.5)) lanternSpots.push({ x, y: 3.9, z: HALL.zc + s * (HALL.half - 0.6) });
    }
    warmLamp(HALL.x0 + len * 0.25, 3.6, HALL.zc, 0xffb45a, 7, 13);
    warmLamp(HALL.x0 + len * 0.75, 3.6, HALL.zc, 0xffb45a, 7, 13);

    bake(hall);
    ctx.hidingSpot(HALL.x0 + 6, 0.2, HALL.zc + 4.2, 1.6, 0.9);
    ctx.hidingSpot(HALL.x1 - 6, 0.2, HALL.zc - 4.2, 1.6, 0.9);
  }

  // ===========================================================================
  // §10 LANDMARK 2 — THE PLAZA: fountain, gnarled tree, climbable minaret
  // ===========================================================================

  const fountainMats = [];
  const animFans = [];
  {
    const plaza = new THREE.Group();

    // stone paving disc with a zellige compass at its centre
    const disc = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_A.r, 48), matPave);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(PLAZA_A.x, 0.02, PLAZA_A.z);
    disc.receiveShadow = true; disc.userData.collide = false;
    {
      const uv = disc.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 9);
    }
    plaza.add(disc);
    const rose = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), matZelligeA);
    rose.rotation.x = -Math.PI / 2;
    rose.position.set(PLAZA_A.x - 7, 0.035, PLAZA_A.z + 8);
    rose.userData.collide = false;
    plaza.add(rose);

    // --- the fountain --------------------------------------------------------
    const fx = PLAZA_A.x, fz = PLAZA_A.z;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const w = P.boxC(2.7, 0.72, 0.45, matZelligeA);
      w.position.set(fx + Math.cos(a) * 3.25, 0.36, fz + Math.sin(a) * 3.25);
      w.rotation.y = -a + Math.PI / 2;
      plaza.add(w);
      const cop = P.boxC(2.8, 0.14, 0.62, matMarble, { collide: false });
      cop.position.set(fx + Math.cos(a) * 3.25, 0.78, fz + Math.sin(a) * 3.25);
      cop.rotation.y = -a + Math.PI / 2;
      plaza.add(cop);
    }
    const basin = new THREE.Mesh(new THREE.CircleGeometry(3.1, 32), matWater);
    basin.rotation.x = -Math.PI / 2;
    basin.position.set(fx, 0.5, fz);
    basin.userData.collide = false;
    ctx.addDecor(basin);
    fountainMats.push(matWater);
    const pedestal = P.cyl(0.55, 0.8, 1.5, matMarble, { seg: 12 });
    pedestal.position.set(fx, 0.1, fz);
    plaza.add(pedestal);
    const bowl = P.cyl(1.15, 0.5, 0.32, matMarble, { seg: 16, collide: false });
    bowl.position.set(fx, 1.6, fz);
    plaza.add(bowl);
    const jet = P.cyl(0.05, 0.12, 1.1, M.glassCheap({ color: 0xbfe6f2, opacity: 0.5 }), { seg: 8, collide: false, shadow: false });
    jet.position.set(fx, 1.9, fz);
    plaza.add(jet);
    for (let i = 0; i < 4; i++) {
      const spout = P.cyl(0.06, 0.06, 0.35, matBrass, { seg: 8, collide: false });
      const a = (i / 4) * Math.PI * 2;
      spout.position.set(fx + Math.cos(a) * 0.6, 1.55, fz + Math.sin(a) * 0.6);
      spout.rotation.z = Math.PI / 2;
      spout.rotation.y = -a;
      plaza.add(spout);
    }

    // --- the gnarled shade tree ---------------------------------------------
    {
      const tx = PLAZA_A.x - 10.5, tz = PLAZA_A.z - 4;
      const trunkM = M.surface('wood', { color: 0x4a3524, planks: 2, repeat: 1, size: 256 });
      const trunk = P.cyl(0.55, 1.0, 3.2, trunkM, { seg: 10 });
      trunk.position.set(tx, 0, tz);
      plaza.add(trunk);
      const tr = R.fork('tree');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + tr.range(-0.3, 0.3);
        const lim = slab(V3(tx, 2.9, tz), V3(tx + Math.cos(a) * tr.range(2.6, 4.4), 3.2 + tr.range(1.2, 2.6), tz + Math.sin(a) * tr.range(2.6, 4.4)),
          0.32, 0.32, trunkM, { collide: false });
        plaza.add(lim);
      }
      const canopyM = M.solid({ color: 0x4c6b34, roughness: 0.95, flat: true });
      for (let i = 0; i < 7; i++) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(tr.range(2.2, 3.4), 1), canopyM);
        blob.position.set(tx + tr.gauss(0, 2.6), 6.0 + tr.gauss(0, 0.9), tz + tr.gauss(0, 2.6));
        blob.scale.y = 0.68;
        blob.castShadow = true; blob.receiveShadow = true; blob.userData.collide = false;
        plaza.add(blob);
      }
      ctx.hidingSpot(tx, 0.1, tz + 1.6, 2.2, 0.7);
    }

    // stone benches, a shaded café, a rotating shop fan
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const b = P.boxC(2.6, 0.45, 0.7, matStone);
      b.position.set(PLAZA_A.x + Math.cos(a) * 12.5, 0.24, PLAZA_A.z + Math.sin(a) * 12.5);
      b.rotation.y = -a;
      plaza.add(b);
    }
    {
      const fanHub = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const bl = P.boxC(0.9, 0.03, 0.22, matWoodD, { collide: false, shadow: false });
        bl.rotation.y = (i / 4) * Math.PI * 2;
        bl.rotation.x = 0.24;
        fanHub.add(bl);
      }
      fanHub.position.set(PLAZA_A.x + 12.5, 3.1, PLAZA_A.z + 9);
      ctx.addDecor(fanHub);
      animFans.push(fanHub);
    }

    bake(plaza);

    // --- THE MINARET ---------------------------------------------------------
    const tower = new THREE.Group();
    tower.position.set(MINARET.x, 0.28, MINARET.z);
    const rr = MINARET.r;

    // plinth (one shallow step, walkable)
    const plinth = P.boxC(9.6, 0.28, 9.6, matStone);
    plinth.position.set(MINARET.x, 0.14, MINARET.z);
    ctx.add(plinth);
    for (let i = 0; i < 4; i++) {
      const c = P.boxC(1.1, 0.55, 1.1, matZelligeB, { collide: false });
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      c.position.set(MINARET.x + Math.cos(a) * 4.2, 0.55, MINARET.z + Math.sin(a) * 4.2);
      ctx.add(c);
    }

    // shell drums: two of them carry real door openings
    const doorLow = Math.atan2(PLAZA_A.x - MINARET.x, PLAZA_A.z - MINARET.z);
    // The helix crosses y = 12 m at azimuth 0, i.e. the tower's +Z face — the
    // upper door has to be exactly there or it opens onto nothing.
    const doorHigh = 0;
    const gapLow = 0.30, gapHigh = 0.28;
    const drum = (y0, y1, radius, tStart, tLen, m) => {
      const s = shellArc(radius, y1 - y0, 20, tStart, tLen, m, true);
      s.position.y = (y0 + y1) / 2;
      tower.add(s);
      return s;
    };
    drum(0, 3.3, rr, doorLow + gapLow, Math.PI * 2 - gapLow * 2, matPaleDS);
    drum(3.3, 11.9, rr, 0, Math.PI * 2, matPaleDS);
    drum(11.9, 14.5, rr, doorHigh + gapHigh, Math.PI * 2 - gapHigh * 2, matPaleDS);
    drum(14.5, MINARET.balcony + 0.2, rr, 0, Math.PI * 2, matPaleDS);
    drum(MINARET.balcony + 0.4, MINARET.top, 2.6, 0, Math.PI * 2, matWhiteDS);
    for (const y of [3.3, 11.9, 14.5]) {
      const band = shellArc(rr + 0.08, 0.9, 20, 0, Math.PI * 2, matZelligeA, false);
      band.position.y = y + 0.2;
      tower.add(band);
    }

    // central newel so nobody falls down the middle
    const newel = P.cyl(1.05, 1.05, MINARET.balcony, matStone, { seg: 12 });
    tower.add(newel);

    // the helical ramp: overlapping slabs, ~25° — a real climb
    {
      const turns = 3, segs = 36, rMid = 2.1;
      const da = (turns * Math.PI * 2) / segs;
      for (let i = 0; i < segs; i++) {
        const a0 = i * da - da * 0.18, a1 = (i + 1) * da + da * 0.18;
        const y0 = (i / segs) * MINARET.balcony, y1 = ((i + 1) / segs) * MINARET.balcony;
        const p0 = V3(Math.sin(a0) * rMid, y0 + 0.1, Math.cos(a0) * rMid);
        const p1 = V3(Math.sin(a1) * rMid, y1 + 0.1, Math.cos(a1) * rMid);
        tower.add(slab(p0, p1, 1.75, 0.24, matStone));
      }
      // landing at the 12 m door (the ramp crosses azimuth 0 exactly at 2 turns)
      const land = new THREE.Mesh(new THREE.RingGeometry(1.05, rr + 0.25, 16, 1,
        doorHigh - Math.PI / 2 - 0.55, 1.1), matStoneDS);
      land.rotation.x = -Math.PI / 2;
      land.position.y = MINARET.door2 + 0.02;
      land.userData.collide = true;
      land.receiveShadow = true;
      tower.add(land);
    }

    // balcony ring + railing, the best vantage point in the arena
    {
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.5, 5.0, 28), matStoneDS);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = MINARET.balcony;
      ring.userData.collide = true;
      ring.receiveShadow = true;
      tower.add(ring);
      const rail = shellArc(4.95, 1.05, 24, 0, Math.PI * 2, matWhiteDS, true);
      rail.position.y = MINARET.balcony + 0.52;
      tower.add(rail);
      const soffit = P.cyl(5.2, 4.2, 0.4, matWoodD, { seg: 24, collide: false });
      soffit.position.y = MINARET.balcony - 0.42;
      tower.add(soffit);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const br2 = P.boxC(0.18, 0.5, 0.7, matWoodD, { collide: false });
        br2.position.set(Math.sin(a) * 4.0, MINARET.balcony - 0.7, Math.cos(a) * 4.0);
        br2.rotation.y = a;
        tower.add(br2);
      }
    }

    // cap, finial and a lantern that reads from anywhere in town
    {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.1, 3.4, 16), matZelligeB);
      cap.position.y = MINARET.top + 1.7;
      cap.castShadow = true; cap.userData.collide = false;
      tower.add(cap);
      const fin = P.cyl(0.06, 0.12, 1.6, matBrass, { seg: 8, collide: false });
      fin.position.y = MINARET.top + 3.3;
      tower.add(fin);
      for (let i = 0; i < 3; i++) {
        const ball = P.sphere(0.34 - i * 0.08, matBrass, { seg: 10, collide: false });
        ball.position.y = MINARET.top + 3.5 + i * 0.6;
        tower.add(ball);
      }
      const lamp = P.sphere(0.3, M.emissive(0xffc46a, 5), { seg: 10, collide: false });
      lamp.position.y = MINARET.balcony + 1.4;
      tower.add(lamp);
      warmLamp(MINARET.x, MINARET.balcony + 1.6, MINARET.z, 0xffc46a, 9, 16);
    }

    bake(tower);

    // bridge from the 12 m door onto the anchor roof
    {
      const sx = MINARET.x + Math.sin(doorHigh) * (rr + 0.1);
      const sz = MINARET.z + Math.cos(doorHigh) * (rr + 0.1);
      const ex = clamp(sx, A_MINARET.x0, A_MINARET.x1);
      const ez = clamp(sz, A_MINARET.z0, A_MINARET.z1);
      const ux = ex - sx, uz = ez - sz, ul = Math.hypot(ux, uz) || 1;
      const deck = slab(
        V3(sx, MINARET.door2 + 0.32, sz),
        V3(ex + (ux / ul) * 0.9, A_MINARET.h + 0.09, ez + (uz / ul) * 0.9),
        1.8, 0.2, matWoodL);
      ctx.add(deck);
      for (const s of [-1, 1]) {           // rope handlines
        const rope = slab(V3(sx, MINARET.door2 + 1.05, sz), V3(ex, A_MINARET.h + 0.85, ez),
          0.05, 0.05, matWoodD, { collide: false });
        rope.position.x += (-uz / ul) * s * 0.85;
        rope.position.z += (ux / ul) * s * 0.85;
        ctx.add(rope);
      }
      A_MINARET.noParapet.add(edgeOf(A_MINARET, ex, ez));
    }
    ctx.hidingSpot(MINARET.x, MINARET.balcony, MINARET.z + 4.0, 1.4, 0.8);
  }

  // ===========================================================================
  // §11 THE CARAVANSERAI — walled courtyard, two levels of arcaded gallery,
  //     stabling, water troughs, bales and a well.
  // ===========================================================================

  {
    const cs = new THREE.Group();
    const cx0 = SERAI.x0, cx1 = SERAI.x1, cz0 = SERAI.z0, cz1 = SERAI.z1;
    const wing = SERAI.wing, gy = SERAI.gallery, ry = SERAI.roof;
    const courtX0 = cx0 + wing, courtX1 = cx1 - wing;
    const courtZ0 = cz0 + wing, courtZ1 = cz1 - wing;
    const gateZ = -36;

    cs.add(groundQuad((courtX0 + courtX1) / 2, (courtZ0 + courtZ1) / 2,
      courtX1 - courtX0, courtZ1 - courtZ0, matPave, 3.5, 0.02, false));

    // --- outer walls (the west one carries the gate) --------------------------
    const outer = (x1, z1, x2, z2) => {
      const w = P.wallBetween(x1, z1, x2, z2, ry + 0.9, 0.9, matOchre);
      cs.add(w);
    };
    outer(cx0, cz0, cx0, gateZ - 2.2);
    outer(cx0, gateZ + 2.2, cx0, cz1);
    outer(cx1, cz0, cx1, cz1);
    outer(cx0, cz0, cx1, cz0);
    outer(cx0, cz1, cx1, cz1);
    {
      const lint = P.boxC(0.9, 3.6, 4.4, matOchre);
      lint.position.set(cx0, ry - 1.0, gateZ);
      cs.add(lint);
      const ar = P.archway(4.0, 5.0, 1.2, matStone);
      ar.position.set(cx0, 0, gateZ); ar.rotation.y = Math.PI / 2;
      P.NOCOLLIDE(ar);
      cs.add(ar);
      const band = P.boxC(0.14, 1.2, 6.2, matZelligeB, { collide: false });
      band.position.set(cx0 - 0.5, ry - 0.4, gateZ);
      cs.add(band);
    }

    // --- the four wings: gallery deck at 4.4, roof deck at 8.8 ---------------
    const wings = [
      { x: (cx0 + courtX0) / 2, z: (cz0 + cz1) / 2, w: wing, d: cz1 - cz0, ax: 1, az: 0 },
      { x: (courtX1 + cx1) / 2, z: (cz0 + cz1) / 2, w: wing, d: cz1 - cz0, ax: -1, az: 0 },
      { x: (courtX0 + courtX1) / 2, z: (cz0 + courtZ0) / 2, w: courtX1 - courtX0, d: wing, ax: 0, az: 1 },
      { x: (courtX0 + courtX1) / 2, z: (courtZ1 + cz1) / 2, w: courtX1 - courtX0, d: wing, ax: 0, az: -1 },
    ];
    for (const wg of wings) {
      // first-floor gallery deck (walkable), set back from the courtyard edge
      const gdW = wg.ax ? wing : wg.w, gdD = wg.ax ? wg.d : wing;
      const deck = P.boxC(gdW, 0.32, gdD, matStone);
      deck.position.set(wg.x, gy, wg.z);
      cs.add(deck);
      // roof deck
      const roof = P.boxC(gdW + 0.4, 0.4, gdD + 0.4, matStone);
      roof.position.set(wg.x, ry - 0.2, wg.z);
      cs.add(roof);
      // back partition walls make the stabling cells
      const nCell = Math.max(3, Math.round((wg.ax ? wg.d : wg.w) / 4.4));
      for (let i = 0; i <= nCell; i++) {
        const t = i / nCell - 0.5;
        const px = wg.x + (wg.ax ? 0 : t * wg.w);
        const pz = wg.z + (wg.ax ? t * wg.d : 0);
        const part = P.boxC(wg.ax ? wing * 0.8 : 0.4, gy - 0.2, wg.ax ? 0.4 : wing * 0.8, matWhite, { collide: false });
        part.position.set(px, (gy - 0.2) / 2, pz);
        cs.add(part);
      }
      // arcade: columns + arches on both levels, facing the courtyard
      const nCol = Math.max(4, Math.round((wg.ax ? wg.d : wg.w) / 3.6));
      for (let i = 0; i <= nCol; i++) {
        const t = i / nCol - 0.5;
        const px = wg.x + (wg.ax ? wg.ax * (wing / 2 - 0.5) : t * wg.w);
        const pz = wg.z + (wg.ax ? t * wg.d : wg.az * (wing / 2 - 0.5));
        for (const [base, h] of [[0, gy - 0.1], [gy + 0.32, ry - gy - 0.6]]) {
          const col = P.column(h, 0.28, matWhite, { seg: 6, base: false });
          col.position.set(px, base, pz);
          cs.add(col);
          for (const [oy, th] of [[0.04, 0.16], [h - 0.14, 0.22]]) {
            const cap = P.boxC(0.78, th, 0.78, matWhite, { collide: false });
            cap.position.set(px, base + oy + th / 2, pz);
            cs.add(cap);
          }
        }
        if (i < nCol) {
          const step = 1 / nCol;
          const mx = wg.x + (wg.ax ? wg.ax * (wing / 2 - 0.5) : (t + step / 2) * wg.w);
          const mz = wg.z + (wg.ax ? (t + step / 2) * wg.d : wg.az * (wing / 2 - 0.5));
          for (const base of [0, gy + 0.32]) {
            const ar = P.archway(2.2, base === 0 ? gy - 1.1 : ry - gy - 1.6, 0.5, matWhite);
            ar.position.set(mx, base, mz);
            ar.rotation.y = wg.ax ? Math.PI / 2 : 0;
            P.NOCOLLIDE(ar);
            cs.add(ar);
          }
        }
      }
      // gallery railing — decor only, so the stair landings are never walled in
      const rl = P.railing(wg.ax ? wg.d : wg.w, 0.95, matWoodD);
      rl.position.set(
        wg.x + (wg.ax ? wg.ax * (wing / 2 - 0.2) : 0),
        gy + 0.16,
        wg.z + (wg.ax ? 0 : wg.az * (wing / 2 - 0.2)));
      if (wg.ax) rl.rotation.y = Math.PI / 2;
      P.NOCOLLIDE(rl);
      cs.add(rl);
    }

    // --- stairs: courtyard → west gallery → east roof ------------------------
    // lower flight, hugging the west gallery
    stairRun(courtX0 + 1.6, courtZ0 + 1.0, 0, courtX0 + 1.6, courtZ0 + 11.0, gy + 0.16, 2.0, matStone, cs);
    const gl = P.boxC(3.6, 0.32, 2.6, matStone);          // overlaps the gallery deck
    gl.position.set(courtX0 - 0.4, gy, courtZ0 + 12.3);
    cs.add(gl);
    // upper flight, carried on brackets over the courtyard, landing on the roof
    const upX = courtX1 - 1.6;
    const bl = P.boxC(3.4, 0.32, 2.6, matStone);
    bl.position.set(courtX1 - 0.6, gy, courtZ1 - 0.2);
    cs.add(bl);
    stairRun(upX, courtZ1 - 1.6, gy + 0.16, upX, courtZ1 - 11.6, ry + 0.06, 2.0, matStone, cs);
    const rl2 = P.boxC(4.2, 0.4, 2.8, matStone);
    rl2.position.set(courtX1 + 0.6, ry - 0.2, courtZ1 - 12.9);
    cs.add(rl2);
    for (let i = 0; i < 5; i++) {                          // brackets under the flight
      const brk = P.boxC(0.3, 1.2, 0.3, matStone, { collide: false });
      brk.position.set(upX, gy + 0.6 + i * 0.85, courtZ1 - 2.6 - i * 2.1);
      cs.add(brk);
    }
    seraiWings[1].noParapet.add('w');

    // --- courtyard dressing ---------------------------------------------------
    const sr = R.fork('serai');
    {
      // the well
      const wellX = (courtX0 + courtX1) / 2, wellZ = (courtZ0 + courtZ1) / 2;
      const ring = P.cyl(1.25, 1.35, 0.95, matStone, { seg: 16 });
      ring.position.set(wellX, 0, wellZ);
      cs.add(ring);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0, 16), M.solid({ color: 0x090c10, roughness: 1 }));
      hole.rotation.x = -Math.PI / 2; hole.position.set(wellX, 0.94, wellZ);
      hole.userData.collide = false;
      cs.add(hole);
      for (const s of [-1, 1]) {
        const post = P.boxC(0.16, 2.4, 0.16, matWoodD);
        post.position.set(wellX + s * 1.3, 1.2, wellZ);
        cs.add(post);
      }
      const beam = P.boxC(3.0, 0.18, 0.18, matWoodD, { collide: false });
      beam.position.set(wellX, 2.4, wellZ);
      cs.add(beam);
      const bucket = P.cyl(0.22, 0.18, 0.3, matIron, { seg: 10, collide: false });
      bucket.position.set(wellX, 1.5, wellZ);
      cs.add(bucket);
      ctx.hidingSpot(wellX + 2.2, 0.1, wellZ, 1.2, 0.6);
    }
    for (let i = 0; i < 5; i++) {
      const tx = sr.range(courtX0 + 3, courtX1 - 3), tz = sr.range(courtZ0 + 3, courtZ1 - 3);
      const tr2 = P.boxC(3.0, 0.62, 1.0, matStone);
      tr2.position.set(tx, 0.31, tz);
      tr2.rotation.y = sr.chance(0.5) ? 0 : Math.PI / 2;
      cs.add(tr2);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.8), matWater);
      w.rotation.x = -Math.PI / 2; w.rotation.z = tr2.rotation.y;
      w.position.set(tx, 0.52, tz); w.userData.collide = false;
      cs.add(w);
    }
    for (let i = 0; i < 22; i++) {
      const bx = sr.range(courtX0 + 2, courtX1 - 2), bz = sr.range(courtZ0 + 2, courtZ1 - 2);
      const bale = P.boxC(1.3, 0.62, 0.9, FABRICS[i % FABRICS.length]);
      bale.position.set(bx, 0.31 + (sr.chance(0.35) ? 0.64 : 0), bz);
      bale.rotation.y = sr.range(0, 3.14);
      cs.add(bale);
      if (i % 11 === 0) ctx.hidingSpot(bx, 0.1, bz, 1.3, 0.75);
    }
    // stabling straw + a cart
    for (let i = 0; i < 8; i++) {
      const s = sr.pick([-1, 1]);
      const px = s > 0 ? cx1 - wing / 2 : cx0 + wing / 2;
      const pz = sr.range(cz0 + 4, cz1 - 4);
      const straw = P.boxC(2.2, 0.2, 1.6, matWoodL, { collide: false });
      straw.position.set(px, 0.1, pz);
      cs.add(straw);
      if (i % 3 === 0) ctx.hidingSpot(px, 0.1, pz, 1.4, 0.95);
    }
    {
      const cart = new THREE.Group();
      const bed = P.boxC(2.8, 0.28, 1.5, matWoodL);
      bed.position.y = 0.95; cart.add(bed);
      for (const s of [-1, 1]) {
        const side = P.boxC(2.8, 0.6, 0.1, matWoodL, { collide: false });
        side.position.set(0, 1.35, s * 0.7); cart.add(side);
      }
      for (const s of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 6, 18), matWoodD);
        wheel.position.set(-0.4, 0.78, s * 0.82);
        wheel.userData.collide = false; wheel.castShadow = true;
        cart.add(wheel);
      }
      for (const s of [-1, 1]) {
        const shaft = P.boxC(2.2, 0.1, 0.1, matWoodD, { collide: false });
        shaft.position.set(2.2, 0.95, s * 0.5); cart.add(shaft);
      }
      cart.position.set(courtX0 + 6, 0, courtZ1 - 5);
      cart.rotation.y = 0.6;
      cs.add(cart);
      ctx.hidingSpot(courtX0 + 6, 0.1, courtZ1 - 5, 1.4, 0.85);
    }
    // a chained goat pen against the north wing
    {
      const pen = new THREE.Group();
      for (const [len, dx, dz, ryy] of [[6, 0, -2.5, 0], [6, 0, 2.5, 0], [5, -3, 0, Math.PI / 2], [5, 3, 0, Math.PI / 2]]) {
        const f = P.fence(len, 1.15, 'wood', matWoodL);
        f.position.set(dx, 0, dz); f.rotation.y = ryy;
        pen.add(f);
      }
      for (let i = 0; i < 3; i++) {
        const goat = P.boxC(0.9, 0.5, 0.35, M.solid({ color: sr.pick([0xd8cdb8, 0x6b5a48]), roughness: 0.95 }));
        goat.position.set(sr.range(-2, 2), 0.62, sr.range(-1.6, 1.6));
        goat.rotation.y = sr.range(0, 3.14);
        pen.add(goat);
        const head = P.boxC(0.3, 0.28, 0.26, M.solid({ color: 0x5a4a3a, roughness: 0.95 }), { collide: false });
        head.position.set(goat.position.x + Math.cos(goat.rotation.y) * 0.55, 0.82, goat.position.z - Math.sin(goat.rotation.y) * 0.55);
        pen.add(head);
      }
      pen.position.set(courtX1 - 7, 0, courtZ0 + 5);
      cs.add(pen);
    }
    warmLamp(cx0 + 3, 3.2, gateZ, 0xffb45a, 6, 12);
    warmLamp((courtX0 + courtX1) / 2, 5.0, (courtZ0 + courtZ1) / 2, 0xffc078, 7, 20);

    bake(cs);
    ctx.hidingSpot(courtX0 + 1.4, gy + 0.2, courtZ0 + 4, 1.4, 0.8);
    ctx.hidingSpot(cx1 - wing / 2, 0.1, cz0 + 6, 1.6, 0.9);
    ctx.hidingSpot(cx0 + wing / 2, 0.1, cz1 - 6, 1.6, 0.9);
  }

  // ===========================================================================
  // §12 THE CISTERN (y = -6) — cool, blue, columned, ankle-deep. Total tonal
  //     contrast with the surface. Reached by steps from the plaza edge.
  // ===========================================================================

  const animCaustics = [];
  {
    const cis = new THREE.Group();
    const F = CISTERN.floor, C = CISTERN.ceil;
    const cw = CISTERN.x1 - CISTERN.x0, cd = CISTERN.z1 - CISTERN.z0;
    const ccx = (CISTERN.x0 + CISTERN.x1) / 2, ccz = (CISTERN.z0 + CISTERN.z1) / 2;

    // --- the stair shaft down from the plaza edge ---------------------------
    {
      const sx = (SHAFT.x0 + SHAFT.x1) / 2;
      stairRun(sx, SHAFT.z1 - 0.5, -0.1, sx, SHAFT.z0 + 0.5, F + 0.1, 3.4, matCistern, cis);
      for (const [x, w] of [[SHAFT.x0 - 0.4, 0.8], [SHAFT.x1 + 0.4, 0.8]]) {
        const wall = P.boxC(w, 7.4, SHAFT.z1 - SHAFT.z0 + 1.6, matCistern);
        wall.position.set(x, F + 3.7 - 0.4, (SHAFT.z0 + SHAFT.z1) / 2);
        cis.add(wall);
      }
      const back = P.boxC(SHAFT.x1 - SHAFT.x0 + 1.6, 7.4, 0.8, matCistern);
      back.position.set(sx, F + 3.3, SHAFT.z1 + 0.4);
      cis.add(back);
      // a domed kiosk marks the entrance from the surface
      const kiosk = new THREE.Group();
      for (const s of [-1, 1]) {
        const p = P.boxC(0.7, 3.2, 0.7, matWhite);
        p.position.set(s * 2.6, 1.6, 0.6);
        kiosk.add(p);
      }
      const lint = P.boxC(6.6, 0.7, 1.2, matWhite);
      lint.position.set(0, 3.5, 0.6);
      kiosk.add(lint);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), matZelligeB);
      dome.position.set(0, 3.8, 0.6);
      dome.castShadow = true; dome.userData.collide = false;
      kiosk.add(dome);
      kiosk.position.set(sx, 0, SHAFT.z1 + 0.6);
      cis.add(kiosk);
      const sgn = P.sign('CISTERN', { background: 0x1c2a55, color: 0xe0c47a, height: 0.42 });
      sgn.position.set(sx, 2.7, SHAFT.z1 - 0.1);
      P.NOCOLLIDE(sgn);
      cis.add(sgn);
    }

    // --- chamber shell --------------------------------------------------------
    const floor = P.boxC(cw + 1.6, 0.6, cd + 1.6, matCistern);
    floor.position.set(ccx, F - 0.3, ccz);
    cis.add(floor);
    const ceilSlab = P.boxC(cw + 1.6, 0.7, cd + 1.6, matCistern);
    ceilSlab.position.set(ccx, C + 0.35, ccz);
    cis.add(ceilSlab);
    const cwall = (x, z, w, d) => {
      const m = P.boxC(w, C - F, d, matCistern);
      m.position.set(x, (C + F) / 2, z);
      cis.add(m);
    };
    cwall(ccx, CISTERN.z0 - 0.4, cw + 1.6, 0.8);
    cwall(CISTERN.x0 - 0.4, ccz, 0.8, cd);
    cwall(CISTERN.x1 + 0.4, ccz, 0.8, cd);
    // south wall, split for the stair mouth
    cwall((CISTERN.x0 + SHAFT.x0) / 2, CISTERN.z1 + 0.4, SHAFT.x0 - CISTERN.x0, 0.8);
    cwall((SHAFT.x1 + CISTERN.x1) / 2, CISTERN.z1 + 0.4, CISTERN.x1 - SHAFT.x1, 0.8);

    // --- columns and cross vaults ---------------------------------------------
    const colsX = 5, colsZ = 3;
    for (let i = 0; i < colsX; i++) for (let j = 0; j < colsZ; j++) {
      const x = CISTERN.x0 + ((i + 0.5) / colsX) * cw;
      const z = CISTERN.z0 + ((j + 0.5) / colsZ) * cd;
      const col = P.cyl(0.62, 0.72, C - F - 0.9, matCistern, { seg: 10 });
      col.position.set(x, F, z);
      cis.add(col);
      const cap = P.boxC(1.5, 0.5, 1.5, matCistern, { collide: false });
      cap.position.set(x, C - 0.7, z);
      cis.add(cap);
      const base = P.boxC(1.6, 0.35, 1.6, matCistern, { collide: false });
      base.position.set(x, F + 0.17, z);
      cis.add(base);
      // little vault caps between the columns
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), matCisternDS);
      dome.position.set(x, C - 0.35, z);
      dome.scale.y = -0.32;
      dome.userData.collide = false;
      cis.add(dome);
    }

    // --- shallow water, light grates, cold emissives --------------------------
    const water = new THREE.Mesh(new THREE.PlaneGeometry(cw, cd, 1, 1), matWaterDark);
    water.rotation.x = -Math.PI / 2;
    water.position.set(ccx, F + 0.22, ccz);
    water.userData.collide = false;
    ctx.addDecor(water);
    fountainMats.push(matWaterDark);

    const grateShaft = addMat(dustTex, 0.34, 0xbcd8ff);
    for (let i = 0; i < 4; i++) {
      const x = CISTERN.x0 + ((i + 0.5) / 4) * cw;
      const z = ccz + (i % 2 ? 4.5 : -4.5);
      const grate = P.boxC(1.3, 0.08, 1.3, M.emissive(0xdcecff, 4), { collide: false, shadow: false });
      grate.position.set(x, C - 0.05, z);
      cis.add(grate);
      for (let b = 0; b < 4; b++) {
        const bar = P.boxC(1.3, 0.06, 0.06, matIron, { collide: false, shadow: false });
        bar.position.set(x, C - 0.12, z - 0.5 + b * 0.33);
        cis.add(bar);
      }
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.6, C - F, 10, 1, true), grateShaft);
      cone.position.set(x, (C + F) / 2, z);
      cone.userData.collide = false;
      ctx.addDecor(cone);
      animShafts.push(cone);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.7, 18), addMat(dustTex, 0.5, 0x9ec8ff));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, F + 0.26, z);
      pool.userData.collide = false;
      ctx.addDecor(pool);
      animCaustics.push(pool);
    }
    warmLamp(CISTERN.x0 + 7, F + 2.4, ccz, 0x6f9fd8, 7, 16);
    warmLamp(ccx, F + 2.4, ccz, 0x6f9fd8, 7, 16);
    warmLamp(CISTERN.x1 - 7, F + 2.4, ccz, 0x6f9fd8, 7, 16);

    // sunken amphorae and a drowned stall for cover
    const cr = R.fork('cistern');
    for (let i = 0; i < 14; i++) {
      const x = cr.range(CISTERN.x0 + 2, CISTERN.x1 - 2);
      const z = cr.range(CISTERN.z0 + 2, CISTERN.z1 - 2);
      const amp = P.cyl(0.16, 0.34, cr.range(0.6, 1.0), matTerra, { seg: 10 });
      amp.position.set(x, F + 0.1, z);
      amp.rotation.z = cr.chance(0.35) ? cr.range(0.6, 1.4) : 0;
      cis.add(amp);
    }
    for (let i = 0; i < 3; i++) {
      const x = cr.range(CISTERN.x0 + 3, CISTERN.x1 - 3);
      const z = cr.range(CISTERN.z0 + 3, CISTERN.z1 - 3);
      ctx.hidingSpot(x, F + 0.2, z, 1.8, 1.0);
    }

    bake(cis);
  }

  // ===========================================================================
  // §13 PARAPETS + THE ROOFTOP CITY
  //     Parapets go up last so no bridge, stair or minaret door gets walled in.
  // ===========================================================================

  for (const b of blocks) {
    const pm = b.kind === 'serai' ? matWhite
      : WALLMATS[Math.abs(Math.round(b.cx * 3 + b.cz)) % WALLMATS.length];
    const W = b.w + 0.55, D = b.d + 0.55, ph = 0.62, pt = 0.3;
    const put = (side, w, d, x, z) => {
      if (b.noParapet.has(side)) {
        const kerb = P.boxC(w, 0.14, d, pm, { collide: false });
        kerb.position.set(x, b.h + 0.07, z);
        parapetGroup.add(kerb);
        return;
      }
      const p = P.boxC(w, ph, d, pm);
      p.position.set(x, b.h + ph / 2, z);
      p.castShadow = true; p.receiveShadow = true;
      p.userData.collide = true;
      parapetGroup.add(p);
    };
    put('n', W, pt, b.cx, b.cz - D / 2);
    put('s', W, pt, b.cx, b.cz + D / 2);
    put('w', pt, D, b.cx - W / 2, b.cz);
    put('e', pt, D, b.cx + W / 2, b.cz);
  }
  bake(parapetGroup);

  // --- instanced roof furniture ---------------------------------------------
  const tankSpots = [], coopSpots = [], dishSpots = [], gardenSpots = [], rackSpots = [];
  const laundry = [];   // {x, y, z, dir, len}
  const pigeonHomes = [];
  {
    const rp = R.fork('roofcity');
    for (const b of blocks) {
      if (b.kind === 'tunnel' && rp.chance(0.4)) continue;
      const inset = 1.5;
      const px = () => rp.range(b.x0 + inset, b.x1 - inset);
      const pz = () => rp.range(b.z0 + inset, b.z1 - inset);
      const area = b.w * b.d;

      if (rp.chance(0.55)) {
        const x = px(), z = pz();
        tankSpots.push({ x, y: b.h, z, s: rp.range(0.85, 1.35), r: rp.range(0, 3.14) });
        if (rp.chance(0.15)) ctx.hidingSpot(x, b.h + 0.1, z, 1.3, 0.9);
      }
      if (rp.chance(0.3)) {
        const x = px(), z = pz();
        coopSpots.push({ x, y: b.h, z, r: rp.range(0, 3.14) });
        pigeonHomes.push({ x, y: b.h + 1.4, z });
      }
      if (rp.chance(0.4)) dishSpots.push({ x: px(), y: b.h, z: pz(), r: rp.range(0, 3.14) });
      if (rp.chance(0.35)) {
        for (let i = 0; i < rp.int(2, 5); i++) gardenSpots.push({ x: px(), y: b.h, z: pz(), s: rp.range(0.5, 1.0) });
      }
      if (rp.chance(0.35)) rackSpots.push({ x: px(), y: b.h, z: pz(), r: rp.range(0, 3.14) });

      // washing line strung across the roof
      if (area > 70 && rp.chance(0.6)) {
        const along = rp.chance(0.5);
        const len = (along ? b.w : b.d) - 3.0;
        if (len > 3) {
          const x = along ? b.cx : px(), z = along ? pz() : b.cz;
          laundry.push({ x, y: b.h, z, dir: along ? 0 : Math.PI / 2, len });
        }
      }
      // skylight down into the souk
      if (rp.chance(0.3)) {
        const sk = P.boxC(1.2, 0.12, 1.2, M.emissive(0x1a1208, 0.6), { collide: false, shadow: false });
        sk.position.set(px(), b.h + 0.06, pz());
        deco(b.cx, b.cz, sk);
        const frame = P.boxC(1.5, 0.22, 1.5, matWoodD, { collide: false });
        frame.position.set(sk.position.x, b.h + 0.05, sk.position.z);
        deco(b.cx, b.cz, frame);
      }
      // stacked crates and pots so roofs have silhouette at eye level
      if (rp.chance(0.5)) {
        const x = px(), z = pz(), n = rp.int(1, 3);
        for (let i = 0; i < n; i++) {
          const c = P.crate(rp.range(0.55, 0.85), matWoodL);
          c.position.set(x + rp.gauss(0, 0.5), b.h + i * 0.7, z + rp.gauss(0, 0.5));
          c.rotation.y = rp.range(0, 3.14);
          P.NOCOLLIDE(c);
          deco(b.cx, b.cz, c);
        }
      }
    }
  }

  // water tanks
  if (tankSpots.length) {
    const tg = P.mergeGeometries([
      new THREE.CylinderGeometry(0.85, 0.85, 1.5, 12).translate(0, 0.75, 0),
      new THREE.CylinderGeometry(0.9, 0.9, 0.12, 12).translate(0, 1.55, 0),
      new THREE.BoxGeometry(2.0, 0.18, 0.5).translate(0, 0.09, 0),
    ]);
    ctx.addDecor(P.scatter(tg, matGalv, tankSpots.length, (i, d) => {
      const s = tankSpots[i];
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r; d.scale.setScalar(s.s);
    }, 51));
  }
  // pigeon coops
  if (coopSpots.length) {
    const cg = P.mergeGeometries([
      new THREE.BoxGeometry(1.6, 1.1, 1.0).translate(0, 0.75, 0),
      new THREE.BoxGeometry(1.8, 0.12, 1.2).translate(0, 1.36, 0),
      new THREE.BoxGeometry(1.7, 0.5, 0.08).translate(0, 0.2, 0.6),
      new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 0.1, 0),
    ]);
    ctx.addDecor(P.scatter(cg, matWoodL, coopSpots.length, (i, d) => {
      const s = coopSpots[i];
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r;
    }, 52));
    coopSpots.forEach((s, i) => { if (i % 4 === 0) ctx.hidingSpot(s.x, s.y + 0.1, s.z + 1.0, 1.0, 0.7); });
  }
  // satellite dishes
  if (dishSpots.length) {
    const dg = P.mergeGeometries([
      new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6)
        .rotateX(2.1).translate(0, 1.1, 0),
      new THREE.CylinderGeometry(0.05, 0.07, 1.1, 6).translate(0, 0.55, 0),
      new THREE.BoxGeometry(0.4, 0.08, 0.4).translate(0, 0.04, 0),
    ]);
    ctx.addDecor(P.scatter(dg, matGalv, dishSpots.length, (i, d) => {
      const s = dishSpots[i];
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r;
    }, 53));
  }
  // roof gardens
  if (gardenSpots.length) {
    const gg = P.mergeGeometries([
      new THREE.CylinderGeometry(0.34, 0.28, 0.4, 8).translate(0, 0.2, 0),
      new THREE.IcosahedronGeometry(0.42, 0).translate(0, 0.65, 0),
    ]);
    ctx.addDecor(P.scatter(gg, M.solid({ color: 0x4f6b34, roughness: 0.95, flat: true }),
      gardenSpots.length, (i, d) => {
        const s = gardenSpots[i];
        d.position.set(s.x, s.y, s.z); d.scale.setScalar(s.s); d.rotation.y = i * 1.7;
      }, 54));
  }
  // drying racks hung with chillies
  if (rackSpots.length) {
    const rg = P.mergeGeometries([
      new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0, 1.2, 0),
      new THREE.BoxGeometry(0.08, 1.2, 0.08).translate(-0.76, 0.6, 0),
      new THREE.BoxGeometry(0.08, 1.2, 0.08).translate(0.76, 0.6, 0),
    ]);
    ctx.addDecor(P.scatter(rg, matWoodD, rackSpots.length, (i, d) => {
      const s = rackSpots[i];
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r;
    }, 55));
    const chilli = new THREE.ConeGeometry(0.055, 0.34, 5).translate(0, -0.17, 0);
    ctx.addDecor(P.scatter(chilli, M.solid({ color: 0xc22c18, roughness: 0.6 }),
      rackSpots.length * 12, (i, d, r) => {
        const s = rackSpots[(i / 12) | 0];
        if (!s) return false;
        const t = r.range(-0.7, 0.7);
        d.position.set(s.x + Math.cos(s.r) * t, s.y + 1.02 - r.range(0, 0.25), s.z - Math.sin(s.r) * t);
        d.rotation.set(r.range(-0.3, 0.3), r() * 6.28, r.range(-0.3, 0.3));
      }, 56));
  }

  // --- washing lines: posts + animated hanging cloth -------------------------
  const laundryAnim = [];
  {
    const lg = new THREE.Group();
    for (const l of laundry) {
      const ux = Math.cos(l.dir), uz = -Math.sin(l.dir);
      for (const s of [-1, 1]) {
        const post = P.boxC(0.1, 1.7, 0.1, matWoodD, { collide: false });
        post.position.set(l.x + ux * s * l.len / 2, l.y + 0.85, l.z + uz * s * l.len / 2);
        deco(l.x, l.z, post);
      }
      const line = P.boxC(l.len, 0.035, 0.035, matWoodD, { collide: false, shadow: false });
      line.position.set(l.x, l.y + 1.62, l.z);
      line.rotation.y = l.dir;
      deco(l.x, l.z, line);
    }
    // one instanced cloth mesh per fabric colour, animated as a group
    const clothG = new THREE.PlaneGeometry(0.72, 0.9, 1, 2);
    clothG.translate(0, -0.45, 0);
    const perColour = [[], [], [], []];
    const lr = R.fork('laundry');
    for (const l of laundry) {
      const ux = Math.cos(l.dir), uz = -Math.sin(l.dir);
      const n = Math.max(2, Math.floor(l.len / 1.05));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        perColour[lr.int(0, 3)].push({
          x: l.x + ux * t * l.len, y: l.y + 1.6, z: l.z + uz * t * l.len,
          ry: l.dir, ph: lr.range(0, 6.28), amp: lr.range(0.05, 0.18),
        });
      }
    }
    for (let ci = 0; ci < 4; ci++) {
      const list = perColour[ci];
      if (!list.length) continue;
      const mat2 = M.surface('fabric', {
        color: [0xe4d8bc, 0x2b3a7a, 0xa82a2a, 0xe0a02a][ci],
        repeat: 1, size: 256, side: DS,
      });
      const im = P.scatter(clothG, mat2, list.length, (i, d) => {
        const s = list[i];
        d.position.set(s.x, s.y, s.z); d.rotation.y = s.ry;
      }, 60 + ci);
      im.castShadow = true;
      ctx.addDecor(im);
      laundryAnim.push({ mesh: im, list });
    }
    ctx.add(lg);
  }

  // ===========================================================================
  // §14 THE MARKET — dozens of stalls, awnings across the alleys, goods.
  //     Everything here is instanced off the street-point list.
  // ===========================================================================

  const stallSpots = [], awningSpots = [], canopySpots = [];
  const potSpots = [], basketSpots = [], sackSpots = [], spiceSpots = [];
  {
    const mr = R.fork('market');
    const used = [];
    const farEnough = (x, z, d) => !used.some(u => Math.hypot(u[0] - x, u[1] - z) < d);
    for (let tries = 0; tries < 1400 && stallSpots.length < 74; tries++) {
      const s = streetPts[mr.int(0, streetPts.length - 1)];
      if (s.hw < 1.4) continue;
      const side = mr.sign();
      const off = s.hw - 0.55;
      const x = s.x - Math.sin(s.dir) * side * off;
      const z = s.z + Math.cos(s.dir) * side * off;
      if (!farEnough(x, z, 3.4)) continue;
      if (Math.abs(x) > 84 || Math.abs(z) > 80) continue;
      used.push([x, z]);
      const ry = -s.dir + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      stallSpots.push({ x, z, ry, sc: mr.range(0.9, 1.15) });
      if (mr.chance(0.8)) awningSpots.push({ x, z, ry, c: mr.int(0, 3), sc: mr.range(0.9, 1.2) });
      const gx = x + Math.sin(s.dir) * side * 0.1, gz = z - Math.cos(s.dir) * side * 0.1;
      const goods = mr.int(0, 3);
      if (goods === 0) for (let i = 0; i < 5; i++) spiceSpots.push({ x: gx + mr.gauss(0, 0.5), y: 0.8, z: gz + mr.gauss(0, 0.4), c: mr.int(0, 5) });
      else if (goods === 1) for (let i = 0; i < 4; i++) potSpots.push({ x: gx + mr.gauss(0, 0.55), y: 0.8, z: gz + mr.gauss(0, 0.4), s: mr.range(0.7, 1.1) });
      else if (goods === 2) for (let i = 0; i < 4; i++) basketSpots.push({ x: gx + mr.gauss(0, 0.55), y: 0.8, z: gz + mr.gauss(0, 0.4), s: mr.range(0.8, 1.2) });
      else for (let i = 0; i < 3; i++) sackSpots.push({ x: gx + mr.gauss(0, 0.5), y: 0, z: gz + mr.gauss(0, 0.4), s: mr.range(0.8, 1.15) });
      if (mr.chance(0.35)) lanternSpots.push({ x, y: 2.3, z });
      if (stallSpots.length % 10 === 0) ctx.hidingSpot(x, 0.15, z, 1.15, 0.85);
    }
    // canopies strung right across the alleys
    for (let tries = 0; tries < 700 && canopySpots.length < 46; tries++) {
      const s = streetPts[mr.int(0, streetPts.length - 1)];
      if (s.hw < 1.5) continue;
      if (canopySpots.some(c => Math.hypot(c.x - s.x, c.z - s.z) < 7)) continue;
      canopySpots.push({
        x: s.x, z: s.z, ry: -s.dir, w: s.hw * 2 + 1.6,
        y: mr.range(3.1, 4.6), c: mr.int(0, 3), sag: mr.range(0.25, 0.6),
      });
    }
    // ground clutter along every alley: pots, baskets, bicycles, bins
    for (let i = 0; i < 150; i++) {
      const s = streetPts[mr.int(0, streetPts.length - 1)];
      const side = mr.sign();
      const off = s.hw - mr.range(0.15, 0.5);
      const x = s.x - Math.sin(s.dir) * side * off;
      const z = s.z + Math.cos(s.dir) * side * off;
      if (Math.abs(x) > 86 || Math.abs(z) > 82) continue;
      const k = mr.int(0, 2);
      if (k === 0) potSpots.push({ x, y: 0, z, s: mr.range(0.9, 1.5) });
      else if (k === 1) basketSpots.push({ x, y: 0, z, s: mr.range(0.9, 1.4) });
      else sackSpots.push({ x, y: 0, z, s: mr.range(0.9, 1.3) });
    }
  }

  // stall frames + tables, one draw call
  {
    const sg = P.mergeGeometries([
      new THREE.BoxGeometry(2.3, 0.1, 1.1).translate(0, 0.76, 0),
      new THREE.BoxGeometry(0.09, 0.76, 0.09).translate(-1.05, 0.38, -0.45),
      new THREE.BoxGeometry(0.09, 0.76, 0.09).translate(1.05, 0.38, -0.45),
      new THREE.BoxGeometry(0.09, 0.76, 0.09).translate(-1.05, 0.38, 0.45),
      new THREE.BoxGeometry(0.09, 0.76, 0.09).translate(1.05, 0.38, 0.45),
      new THREE.BoxGeometry(0.08, 2.35, 0.08).translate(-1.15, 1.17, -0.5),
      new THREE.BoxGeometry(0.08, 2.35, 0.08).translate(1.15, 1.17, -0.5),
      new THREE.BoxGeometry(0.08, 2.35, 0.08).translate(-1.15, 1.17, 0.55),
      new THREE.BoxGeometry(0.08, 2.35, 0.08).translate(1.15, 1.17, 0.55),
      new THREE.BoxGeometry(2.5, 0.09, 0.09).translate(0, 2.32, -0.5),
      new THREE.BoxGeometry(2.5, 0.09, 0.09).translate(0, 2.32, 0.55),
      new THREE.BoxGeometry(2.4, 0.55, 0.06).translate(0, 0.45, -0.5),
    ]);
    ctx.addDecor(P.scatter(sg, matWoodL, stallSpots.length, (i, d) => {
      const s = stallSpots[i];
      d.position.set(s.x, 0, s.z); d.rotation.y = s.ry; d.scale.setScalar(s.sc);
    }, 70));
  }
  // striped awnings over the stalls
  {
    const ag = clothGeo(2.7, 1.7, 0.32, 6, 3);
    for (let c = 0; c < 4; c++) {
      const list = awningSpots.filter(a => a.c === c);
      if (!list.length) continue;
      const mat2 = M.surface('fabric', {
        color: [0xa82a2a, 0x2b3a7a, 0xe0a02a, 0xe4d8bc][c], repeat: 1, size: 256, side: DS,
      });
      const im = P.scatter(ag, mat2, list.length, (i, d) => {
        const s = list[i];
        d.position.set(s.x, 2.42, s.z); d.rotation.y = s.ry; d.scale.setScalar(s.sc);
      }, 80 + c);
      ctx.addDecor(im);
    }
  }
  // canopies strung across the alleys — the roof of the souk
  const canopyAnim = [];
  {
    for (let c = 0; c < 4; c++) {
      const list = canopySpots.filter(a => a.c === c);
      if (!list.length) continue;
      const cgw = clothGeo(4.4, 3.2, 0.5, 8, 4);
      const mat2 = M.surface('fabric', {
        color: [0xa82a2a, 0x2b3a7a, 0xe0a02a, 0x1e7a72][c], repeat: 1, size: 256, side: DS,
      });
      const im = P.scatter(cgw, mat2, list.length, (i, d) => {
        const s = list[i];
        d.position.set(s.x, s.y, s.z);
        d.rotation.y = s.ry;
        d.scale.set(s.w / 4.4, 1, 1);
      }, 90 + c);
      ctx.addDecor(im);
      canopyAnim.push({ mesh: im, list });
    }
  }
  // goods: pots, baskets, sacks, spice cones
  {
    const potG = P.mergeGeometries([
      new THREE.CylinderGeometry(0.11, 0.19, 0.42, 9).translate(0, 0.21, 0),
      new THREE.CylinderGeometry(0.16, 0.11, 0.16, 9).translate(0, 0.5, 0),
    ]);
    ctx.addDecor(P.scatter(potG, matTerra, potSpots.length, (i, d, r) => {
      const s = potSpots[i];
      d.position.set(s.x, s.y, s.z); d.scale.setScalar(s.s); d.rotation.y = r() * 6.28;
    }, 100));
    const baskG = new THREE.CylinderGeometry(0.28, 0.2, 0.34, 10).translate(0, 0.17, 0);
    ctx.addDecor(P.scatter(baskG, matWoodL, basketSpots.length, (i, d, r) => {
      const s = basketSpots[i];
      d.position.set(s.x, s.y, s.z); d.scale.setScalar(s.s); d.rotation.y = r() * 6.28;
    }, 101));
    const sackG = new THREE.SphereGeometry(0.3, 8, 6).scale(1, 0.85, 1).translate(0, 0.26, 0);
    ctx.addDecor(P.scatter(sackG, fabCream, sackSpots.length, (i, d, r) => {
      const s = sackSpots[i];
      d.position.set(s.x, s.y, s.z); d.scale.setScalar(s.s); d.rotation.y = r() * 6.28;
    }, 102));
    const coneG = new THREE.ConeGeometry(0.17, 0.28, 10).translate(0, 0.14, 0);
    const SPICE = [0xd94f16, 0xe0b019, 0x8f2f1c, 0x6f8f22, 0xb0143a, 0x4a2a12];
    for (let c = 0; c < 6; c++) {
      const list = spiceSpots.filter(s => s.c === c);
      if (!list.length) continue;
      ctx.addDecor(P.scatter(coneG, M.solid({ color: SPICE[c], roughness: 0.95 }),
        list.length, (i, d) => {
          const s = list[i];
          d.position.set(s.x, s.y, s.z);
        }, 110 + c));
    }
  }
  // hanging rugs and bolts of cloth against the walls
  {
    const hr = R.fork('rugs');
    const rg = new THREE.Group();
    for (let i = 0; i < 40; i++) {
      const s = streetPts[hr.int(0, streetPts.length - 1)];
      const side = hr.sign();
      const off = s.hw + 0.15;
      const x = s.x - Math.sin(s.dir) * side * off;
      const z = s.z + Math.cos(s.dir) * side * off;
      if (Math.abs(x) > 84 || Math.abs(z) > 80) continue;
      const w = hr.range(1.3, 2.1), h = hr.range(1.8, 2.8);
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, h), RUGS[hr.int(0, 2)]);
      rug.position.set(x, hr.range(1.6, 2.6) + h / 2 - 0.4, z);
      rug.rotation.y = -s.dir + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      rug.castShadow = true; rug.userData.collide = false;
      deco(x, z, rug);
      if (i % 8 === 0) ctx.hidingSpot(x, 0.1, z, 1.1, 0.95);
    }
    ctx.add(rg);
  }

  // ===========================================================================
  // §15 DETAIL PASS — beam ends, brass lanterns, palms, birdcages, dust.
  // ===========================================================================

  // protruding beam ends: the single most characteristic detail, ~1200 of them
  {
    const beamG = new THREE.CylinderGeometry(0.085, 0.095, 0.5, 6);
    beamG.rotateZ(Math.PI / 2);
    ctx.addDecor(P.scatter(beamG, matWoodD, beamEnds.length, (i, d, r) => {
      const b = beamEnds[i];
      d.position.set(b.x, b.y, b.z);
      d.rotation.set(0, b.ry + r.range(-0.05, 0.05), r.range(-0.04, 0.04));
      d.scale.setScalar(r.range(0.85, 1.2));
    }, 120));
  }

  // brass lanterns — emissive geometry everywhere, only a handful of real lights
  {
    const lanG = P.mergeGeometries([
      new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5).translate(0, 0.175, 0),
      new THREE.SphereGeometry(0.13, 8, 6).scale(1, 1.25, 1).translate(0, -0.1, 0),
      new THREE.ConeGeometry(0.14, 0.12, 8).translate(0, 0.04, 0),
    ]);
    ctx.addDecor(P.scatter(lanG, matBrass, lanternSpots.length, (i, d) => {
      const s = lanternSpots[i];
      d.position.set(s.x, s.y, s.z);
    }, 130));
    const glowG = new THREE.SphereGeometry(0.085, 8, 6);
    const glow = P.scatter(glowG, M.emissive(0xffb45a, 7), lanternSpots.length, (i, d) => {
      const s = lanternSpots[i];
      d.position.set(s.x, s.y - 0.1, s.z);
    }, 131);
    glow.castShadow = false;
    ctx.addDecor(glow);
    // a few of them get an actual point light
    const lr = R.fork('lamps');
    const picks = lr.shuffle(lanternSpots.slice()).slice(0, 8);
    for (const s of picks) warmLamp(s.x, s.y - 0.1, s.z, 0xffb45a, 5, 8);
  }

  // birdcages hung from beams
  {
    const cageG = P.mergeGeometries([
      new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8).translate(0, 0.02, 0),
      new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8).translate(0, 0.42, 0),
      new THREE.CylinderGeometry(0.03, 0.03, 0.44, 5).translate(0.15, 0.22, 0),
      new THREE.CylinderGeometry(0.03, 0.03, 0.44, 5).translate(-0.15, 0.22, 0),
      new THREE.CylinderGeometry(0.03, 0.03, 0.44, 5).translate(0, 0.22, 0.15),
      new THREE.CylinderGeometry(0.03, 0.03, 0.44, 5).translate(0, 0.22, -0.15),
      new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4).translate(0, 0.68, 0),
    ]);
    const cr = R.fork('cages');
    ctx.addDecor(P.scatter(cageG, matBrass, 26, (i, d, r) => {
      const s = streetPts[cr.int(0, streetPts.length - 1)];
      if (s.hw < 1.4) return false;
      const side = cr.sign();
      d.position.set(s.x - Math.sin(s.dir) * side * (s.hw - 0.3), r.range(2.4, 3.2),
        s.z + Math.cos(s.dir) * side * (s.hw - 0.3));
      d.rotation.y = r() * 6.28;
    }, 140));
  }

  // date palms along the wall and in the plazas
  {
    const palms = [];
    const pr = R.fork('palms');
    for (let i = 0; i < 26; i++) {
      let x, z, ok = false;
      for (let t = 0; t < 30 && !ok; t++) {
        if (i < 14) {
          const a = pr.range(0, Math.PI * 2), d = pr.range(96, 150);
          x = Math.cos(a) * d; z = Math.sin(a) * d;
          ok = true;
        } else {
          const pl = pr.pick([PLAZA_A, PLAZA_B, PLAZA_C]);
          const a = pr.range(0, Math.PI * 2);
          x = pl.x + Math.cos(a) * (pl.r - 2.5);
          z = pl.z + Math.sin(a) * (pl.r - 2.5);
          ok = !nearStreet(x, z, 1.6);
        }
      }
      if (!ok) continue;
      palms.push({ x, z, h: pr.range(6.5, 11.5), r: pr.range(0, 6.28) });
    }
    const pg = new THREE.Group();
    for (const p of palms) {
      const trunk = P.cyl(0.22, 0.34, p.h, matWoodD, { seg: 8 });
      trunk.position.set(p.x, 0, p.z);
      trunk.rotation.z = Math.sin(p.r) * 0.06;
      pg.add(trunk);
    }
    ctx.add(pg);
    const frondG = new THREE.PlaneGeometry(2.9, 1.5).translate(1.45, 0, 0);
    ctx.addDecor(P.scatter(frondG, frondTex && new THREE.MeshStandardMaterial({
      map: frondTex, transparent: true, alphaTest: 0.4, roughness: 0.9, side: DS,
    }), palms.length * 9, (i, d, r) => {
      const p = palms[(i / 9) | 0];
      if (!p) return false;
      const k = i % 9;
      d.position.set(p.x, p.h - 0.2, p.z);
      d.rotation.y = p.r + (k / 9) * Math.PI * 2;
      d.rotation.z = -0.5 + r.range(-0.25, 0.25);
      d.scale.setScalar(r.range(0.85, 1.25));
    }, 150));
    // dates
    ctx.addDecor(P.scatter(new THREE.IcosahedronGeometry(0.28, 0),
      M.solid({ color: 0x8a5a22, roughness: 0.85 }), palms.length * 2, (i, d, r) => {
        const p = palms[(i / 2) | 0];
        if (!p) return false;
        const a = r() * 6.28;
        d.position.set(p.x + Math.cos(a) * 0.6, p.h - 0.5, p.z + Math.sin(a) * 0.6);
        d.scale.set(1, 0.7, 1);
      }, 151));
  }

  // bicycles leaning in alleys
  {
    const bikeG = P.mergeGeometries([
      new THREE.TorusGeometry(0.34, 0.035, 5, 14).translate(-0.5, 0.34, 0),
      new THREE.TorusGeometry(0.34, 0.035, 5, 14).translate(0.5, 0.34, 0),
      new THREE.BoxGeometry(0.9, 0.04, 0.04).translate(0, 0.55, 0),
      new THREE.BoxGeometry(0.04, 0.42, 0.04).translate(0.42, 0.62, 0),
      new THREE.BoxGeometry(0.04, 0.04, 0.42).translate(0.42, 0.85, 0),
      new THREE.BoxGeometry(0.22, 0.05, 0.12).translate(-0.34, 0.78, 0),
    ]);
    const br2 = R.fork('bikes');
    ctx.addDecor(P.scatter(bikeG, matIron, 12, (i, d, r) => {
      const s = streetPts[br2.int(0, streetPts.length - 1)];
      if (s.hw < 1.5) return false;
      const side = br2.sign();
      d.position.set(s.x - Math.sin(s.dir) * side * (s.hw - 0.45), 0,
        s.z + Math.cos(s.dir) * side * (s.hw - 0.45));
      d.rotation.set(0, -s.dir, r.range(0.12, 0.2) * side);
    }, 160));
  }

  // --- DUST: heavy motes in the sunbeams, low drift in the open -------------
  const dustSets = [];
  {
    const moteG = new THREE.PlaneGeometry(0.1, 0.1);
    const moteM = addMat(dustTex, 0.5, 0xfff0cc);
    const hi = [];
    const dr = R.fork('dust');
    const im = P.scatter(moteG, moteM, 900, (i, d) => {
      const s = streetPts[dr.int(0, streetPts.length - 1)];
      const p = {
        x: s.x + dr.gauss(0, 2.2), y: dr.range(0.4, 7.5), z: s.z + dr.gauss(0, 2.2),
        ph: dr.range(0, 6.28), sp: dr.range(0.18, 0.6), sc: dr.range(0.5, 1.7),
      };
      hi.push(p);
      d.position.set(p.x, p.y, p.z);
      d.scale.setScalar(p.sc);
    }, 170);
    im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false;
    ctx.addDecor(im);
    dustSets.push({ mesh: im, list: hi, rise: 0.35, swirl: 1.0 });

    const lo = [];
    const im2 = P.scatter(new THREE.PlaneGeometry(1.6, 1.6), addMat(dustTex, 0.11, 0xe8d8b0),
      340, (i, d) => {
        const pl = dr.pick([PLAZA_A, PLAZA_B, PLAZA_C, { x: 0, z: 70, r: 14 }, { x: 50, z: -36, r: 18 }]);
        const a = dr.range(0, 6.28), rr2 = Math.sqrt(dr()) * pl.r * 1.3;
        const p = {
          x: pl.x + Math.cos(a) * rr2, y: dr.range(0.15, 1.2), z: pl.z + Math.sin(a) * rr2,
          ph: dr.range(0, 6.28), sp: dr.range(0.05, 0.2), sc: dr.range(0.7, 2.0),
        };
        lo.push(p);
        d.position.set(p.x, p.y, p.z);
        d.scale.setScalar(p.sc);
      }, 171);
    im2.castShadow = false; im2.frustumCulled = false;
    ctx.addDecor(im2);
    dustSets.push({ mesh: im2, list: lo, rise: 0.03, swirl: 2.6 });
  }

  // pigeons that burst off the coops
  const pigeonSet = (() => {
    if (!pigeonHomes.length) return null;
    const pg = new THREE.PlaneGeometry(0.42, 0.42);
    const pm = new THREE.MeshStandardMaterial({
      map: pigeonTex, transparent: true, alphaTest: 0.4, roughness: 0.9, side: DS,
    });
    const list = [];
    const prg = R.fork('pigeons');
    const im = P.scatter(pg, pm, Math.min(48, pigeonHomes.length * 4), (i, d) => {
      const h = pigeonHomes[i % pigeonHomes.length];
      const p = {
        x: h.x + prg.gauss(0, 0.7), y: h.y, z: h.z + prg.gauss(0, 0.7),
        base: h.y, ph: prg.range(0, 30), period: prg.range(14, 26), r: prg.range(0, 6.28),
      };
      list.push(p);
      d.position.set(p.x, p.y, p.z);
      d.rotation.y = p.r;
    }, 180);
    im.castShadow = false;
    ctx.addDecor(im);
    return { mesh: im, list };
  })();

  // ===========================================================================
  // §16 MOTION — cloth ripple, laundry flap, dust drift, pigeons, water, fan.
  // ===========================================================================

  const dummy = new THREE.Object3D();
  ctx.onUpdate((dt, t) => {
    for (const m of fountainMats) m.userData.tick?.(dt);

    for (const f of animFans) f.rotation.y += dt * 2.4;

    for (let i = 0; i < animShafts.length; i++) {
      const s = animShafts[i];
      s.material.opacity = (i < 9 ? 0.28 : 0.34) * (0.82 + 0.18 * Math.sin(t * 0.6 + i));
    }
    for (let i = 0; i < animCaustics.length; i++) {
      const c = animCaustics[i];
      c.material.opacity = 0.42 + 0.16 * Math.sin(t * 0.9 + i * 1.7);
      c.scale.setScalar(1 + 0.05 * Math.sin(t * 0.7 + i));
    }

    // canopies and awnings ripple by breathing their instance scale/tilt
    for (const c of canopyAnim) {
      for (let i = 0; i < c.list.length; i++) {
        const s = c.list[i];
        dummy.position.set(s.x, s.y + Math.sin(t * 0.9 + i * 0.7) * 0.06, s.z);
        dummy.rotation.set(Math.sin(t * 0.7 + i) * 0.035, s.ry, Math.cos(t * 0.55 + i * 1.3) * 0.045);
        dummy.scale.set(s.w / 4.4, 1 + Math.sin(t * 1.1 + i) * 0.03, 1);
        dummy.updateMatrix();
        c.mesh.setMatrixAt(i, dummy.matrix);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
    }

    // laundry flapping on the lines
    for (const l of laundryAnim) {
      for (let i = 0; i < l.list.length; i++) {
        const s = l.list[i];
        const sw = Math.sin(t * 1.7 + s.ph) * s.amp + Math.sin(t * 3.1 + s.ph * 2) * s.amp * 0.4;
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(sw * 0.8, s.ry + sw * 0.35, sw);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        l.mesh.setMatrixAt(i, dummy.matrix);
      }
      l.mesh.instanceMatrix.needsUpdate = true;
    }

    // dust
    for (const ds of dustSets) {
      const L = ds.list;
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        const y = p.y + ((t * p.sp * ds.rise + p.ph) % 3.2) - 1.6;
        dummy.position.set(
          p.x + Math.sin(t * 0.23 * p.sp + p.ph) * ds.swirl,
          y,
          p.z + Math.cos(t * 0.19 * p.sp + p.ph * 1.7) * ds.swirl);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(p.sc * (0.8 + 0.2 * Math.sin(t * 2 + p.ph)));
        dummy.updateMatrix();
        ds.mesh.setMatrixAt(i, dummy.matrix);
      }
      ds.mesh.instanceMatrix.needsUpdate = true;
    }

    // pigeons: settle, then burst upward on their own cycle
    if (pigeonSet) {
      const L = pigeonSet.list;
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        const ph = ((t + p.ph) % p.period) / p.period;
        const fly = ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) : 0;
        dummy.position.set(
          p.x + fly * Math.cos(p.r) * 5.5,
          p.base + fly * 6.0 + Math.sin(t * 8 + i) * fly * 0.35,
          p.z + fly * Math.sin(p.r) * 5.5);
        dummy.rotation.set(0, p.r + fly * 0.6, fly * 0.25);
        dummy.scale.setScalar(1 + fly * 0.15);
        dummy.updateMatrix();
        pigeonSet.mesh.setMatrixAt(i, dummy.matrix);
      }
      pigeonSet.mesh.instanceMatrix.needsUpdate = true;
    }
  });

  // ===========================================================================
  // §17 BAKE + GAMEPLAY
  // ===========================================================================

  // Collapse every static hand-built mass into one mesh per material.
  for (const d of districts) {
    if (d.children.length) ctx.addDecor(P.freeze(d));
  }

  // --- footstep surfaces -----------------------------------------------------
  ctx.setSurface((x, z) => {
    if (inRect(CISTERN, x, z, 1)) return 'water';
    if (Math.hypot(x - PLAZA_A.x, z - PLAZA_A.z) < PLAZA_A.r) {
      return Math.hypot(x - PLAZA_A.x, z - PLAZA_A.z) < 4.2 ? 'tile' : 'concrete';
    }
    if (Math.hypot(x - PLAZA_B.x, z - PLAZA_B.z) < PLAZA_B.r) return 'concrete';
    if (Math.hypot(x - PLAZA_C.x, z - PLAZA_C.z) < PLAZA_C.r) return 'concrete';
    if (x > HALL.x0 && x < HALL.x1 && Math.abs(z - HALL.zc) < HALL.half) return 'concrete';
    if (inRect(SERAI, x, z, 0)) return 'concrete';
    if (inRect(SHAFT, x, z, 1)) return 'concrete';
    return 'sand';
  });

  // --- pickups ---------------------------------------------------------------
  const gr = R.fork('gameplay');
  let coins = 0;
  const coin = (x, y, z) => { if (coins < 44) { ctx.pickup(x, y, z, 'coin'); coins++; } };

  // 12 threaded along the alleys, spread by rejection so no quarter is dead
  {
    const used = [];
    for (let t = 0; t < 900 && coins < 12; t++) {
      const s = streetPts[gr.int(0, streetPts.length - 1)];
      if (used.some(u => Math.hypot(u[0] - s.x, u[1] - s.z) < 26)) continue;
      used.push([s.x, s.z]);
      coin(s.x, 1.0, s.z);
    }
  }
  // 14 on the rooftops — the reward for learning the upper map
  {
    const rs = gr.shuffle(blocks.slice()).filter(b => b.kind !== 'serai');
    for (let i = 0; i < rs.length && coins < 26; i++) {
      const b = rs[i];
      coin(b.cx + gr.gauss(0, b.w * 0.2), b.h + 1.0, b.cz + gr.gauss(0, b.d * 0.2));
    }
  }
  // 4 up the clocktower: three on the helix itself, one on the balcony.
  // The ramp rises `balcony` metres over three turns, so azimuth = height/rate.
  {
    const rate = MINARET.balcony / (3 * Math.PI * 2);
    for (const t of [0.22, 0.5, 0.78]) {
      const y = t * MINARET.balcony;
      const a = y / rate;
      coin(MINARET.x + Math.sin(a) * 2.1, 0.38 + y + 1.0, MINARET.z + Math.cos(a) * 2.1);
    }
    coin(MINARET.x + 3.9, 0.28 + MINARET.balcony + 1.0, MINARET.z);
  }
  // 6 in the caravanserai
  {
    const cX = (SERAI.x0 + SERAI.x1) / 2, cZ = (SERAI.z0 + SERAI.z1) / 2;
    coin(cX, 1.0, cZ + 6);
    coin(cX - 8, 1.0, cZ - 8);
    coin(SERAI.x0 + SERAI.wing / 2, 1.0, cZ + 12);
    coin(SERAI.x0 + SERAI.wing / 2, SERAI.gallery + 1.16, cZ - 10);
    coin(SERAI.x1 - SERAI.wing / 2, SERAI.gallery + 1.16, cZ + 10);
    coin(cX + 6, SERAI.roof + 1.0, SERAI.z0 + SERAI.wing / 2);
  }
  // 6 in the cistern
  for (let i = 0; i < 6; i++) {
    coin(CISTERN.x0 + 3 + (i / 5) * (CISTERN.x1 - CISTERN.x0 - 6),
      CISTERN.floor + 1.0,
      CISTERN.z0 + 3 + gr.range(0, CISTERN.z1 - CISTERN.z0 - 6));
  }
  // the remainder in the souk hall and the plazas
  {
    const len = HALL.x1 - HALL.x0;
    for (let i = 0; coins < 44 && i < 20; i++) {
      if (i < 5) coin(HALL.x0 + 4 + (i / 4) * (len - 8), 1.0, HALL.zc + (i % 2 ? 2.2 : -2.2));
      else if (i < 9) {
        const pl = [PLAZA_A, PLAZA_B, PLAZA_C, PLAZA_A][i - 5];
        const a = gr.range(0, 6.28);
        coin(pl.x + Math.cos(a) * pl.r * 0.7, 1.0, pl.z + Math.sin(a) * pl.r * 0.7);
      } else {
        const b = blocks[gr.int(0, blocks.length - 1)];
        coin(b.cx + gr.gauss(0, b.w * 0.2), b.h + 1.0, b.cz + gr.gauss(0, b.d * 0.2));
      }
    }
  }

  // batteries — weighted to the dark places
  ctx.pickup(CISTERN.x0 + 5, CISTERN.floor + 1.0, CISTERN.z0 + 4, 'battery');
  ctx.pickup((CISTERN.x0 + CISTERN.x1) / 2 + 6, CISTERN.floor + 1.0, CISTERN.z1 - 4, 'battery');
  ctx.pickup(CISTERN.x1 - 4, CISTERN.floor + 1.0, (CISTERN.z0 + CISTERN.z1) / 2, 'battery');
  if (tunnels.length) ctx.pickup(tunnels[0].cx, 1.0, tunnels[0].cz, 'battery');
  ctx.pickup(SERAI.x1 - SERAI.wing / 2, 1.0, SERAI.z0 + 6, 'battery');

  // powerups
  ctx.pickup(PLAZA_A.x - 6, 1.0, PLAZA_A.z - 10, 'powerup:dash');
  ctx.pickup(HALL.x0 + 8, 1.0, HALL.zc, 'powerup:silence');
  ctx.pickup(CISTERN.x1 - 6, CISTERN.floor + 1.0, CISTERN.z0 + 5, 'powerup:nightvision');
  {
    const hiRoof = blocks.slice().sort((a, b) => b.h - a.h)[0];
    ctx.pickup(hiRoof.cx, hiRoof.h + 1.0, hiRoof.cz, 'powerup:jumpjet');
  }

  // exactly one pup — inside a pigeon coop on the highest coop roof
  {
    const nest = coopSpots.length
      ? coopSpots.slice().sort((a, b) => b.y - a.y)[0]
      : { x: CISTERN.x0 + 2, y: CISTERN.floor, z: CISTERN.z0 + 2 };
    ctx.pickup(nest.x, nest.y + 0.75, nest.z, 'pup');
  }

  // --- a handful of hand-placed hiding spots the generator cannot infer -----
  tunnels.slice(0, 4).forEach(t => ctx.hidingSpot(t.cx, 0.15, t.cz, 2.0, 1.0));
  ctx.hidingSpot(PLAZA_A.x, 0.4, PLAZA_A.z + 3.6, 1.2, 0.5);
  ctx.hidingSpot(A_STAIR.x0 - 0.5, A_STAIR.h + 0.2, A_STAIR.cz - (Math.max(7, A_STAIR.d - 1)) / 2, 1.2, 0.7);
}
