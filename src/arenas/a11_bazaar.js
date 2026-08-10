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
  ['eastJ', 'neJ', 3.4], ['neJ', 'serai', 3.6], ['serai', 'plazaC', 4.0],
  ['plazaC', 'nwJ', 3.4], ['nwJ', 'swJ', 3.2], ['swJ', 'plazaB', 3.2],
  ['plazaA', 'midJ', 3.4], ['midJ', 'nMid', 3.0], ['nMid', 'plazaC', 3.4],
  ['midJ', 'plazaB', 3.0], ['hallW', 'westJ', 3.0], ['westJ', 'nwGate', 3.0],
  ['nwGate', 'gate', 3.6], ['plazaA', 'eMid', 3.2], ['eMid', 'serai', 3.2],
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

  const WALLMATS = [matOchre, matWhite, matTerra, matPale, matGrey, matMud];
  const FABRICS = [fabIndigo, fabCrimson, fabSaffron, fabCream];

  const matBrass = M.metal(0xb08b3a, 0.34);
  const matIron = M.metal(0x3b3833, 0.62);
  const matGalv = M.metal(0x9aa2a6, 0.45);
  const matWater = M.water({ color: 0x2c6a86, repeat: 6 });
  const matWaterDark = M.water({ color: 0x123murk = 0x12333f, repeat: 5 });

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
    c.strokeStyle = '#4a3venue'.slice(0, 0) + '#4a3320';
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
  }, { transparent: true, alphaTest: 0.4, roughness: 0.9, side: THREE.DoubleSide });

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
  }, { transparent: true, alphaTest: 0.4, roughness: 0.9, side: THREE.DoubleSide });

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
      const k = slab(
        V3(ax - Math.sin(yaw) * 0, ay + 0.25, az), V3(bx, by + 0.25, bz), 0.18, 0.5, material, { collide: false });
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

  // Safety floor far below/outside — nothing can fall out of the world.
  ctx.add(groundQuad(0, 0, 520, 520, matSand, 26, -0.6));

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
    ctx.add(wall);

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
    ctx.add(g);
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

  // --- anchors: each one is a guaranteed ground→roof route ------------------
  const A_STAIR = pushBlock(19, 68, 13, 11, 6.2, 'anchor');
  const A_MINARET = pushBlock(25, 52, 11, 11, MINARET.door2, 'anchor');
  const A_RAMP = pushBlock(-36, -16, 11, 10, 4.4, 'anchor');
  const A_SERAI = pushBlock(20, -40, 12, 11, 5.8, 'anchor');
  const A_NORTH = pushBlock(26, -66, 12, 11, 5.0, 'anchor');

  // --- caravanserai wings double as roof nodes ------------------------------
  const SW_W = { cx: SERAI.x0 + SERAI.wing / 2, cz: (SERAI.z0 + SERAI.z1) / 2, w: SERAI.wing, d: SERAI.z1 - SERAI.z0 };
  const SW_E = { cx: SERAI.x1 - SERAI.wing / 2, cz: SW_W.cz, w: SERAI.wing, d: SW_W.d };
  const SW_N = { cx: (SERAI.x0 + SERAI.x1) / 2, cz: SERAI.z0 + SERAI.wing / 2, w: SERAI.x1 - SERAI.x0 - 2 * SERAI.wing, d: SERAI.wing };
  const SW_S = { cx: SW_N.cx, cz: SERAI.z1 - SERAI.wing / 2, w: SW_N.w, d: SERAI.wing };
  const seraiWings = [SW_W, SW_E, SW_N, SW_S].map(s => pushBlock(s.cx, s.cz, s.w, s.d, SERAI.roof, 'serai'));

  // --- procedural infill -----------------------------------------------------
  const br = R.fork('blocks');
  for (let gz = -76; gz <= 76; gz += 13.5) {
    for (let gx = -80; gx <= 80; gx += 13.5) {
      const cx = gx + br.gauss(0, 2.6), cz = gz + br.gauss(0, 2.6);
      if (Math.abs(cx) > 80 || Math.abs(cz) > 76) continue;
      let w = br.range(7.5, 13.5), d = br.range(7.5, 13.5);
      let placed = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
        let bad = rectHitsStreet(r, 1.1);
        if (!bad) for (const rv of RESERVED) {
          if (r.x0 < rv.x1 + 1 && r.x1 > rv.x0 - 1 && r.z0 < rv.z1 + 1 && r.z1 > rv.z0 - 1) { bad = true; break; }
        }
        if (!bad) for (const o of blocks) { if (rectGap(r, o) < 0.8) { bad = true; break; } }
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
    const slabM = bg.chance(0.25) ? matRoofTile : wm;
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
      if (bg.chance(0.55)) {
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
  ctx.add(bridgeGroup);

  // --- parapets (skipping the edges a bridge lands on) ----------------------
  for (const b of blocks) {
    const pm = b.kind === 'serai' ? matWhite : WALLMATS[(Math.abs(Math.round(b.cx + b.cz)) % WALLMATS.length)];
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
  ctx.add(parapetGroup);

  // --- the four+ ground→roof routes -----------------------------------------
  const routeGroup = new THREE.Group();
  {
    // 1. grand external stair off the gate street
    stairRun(11.6, 76, 0.0, 11.6, 63, A_STAIR.h, 2.2, matStone, routeGroup);
    const land = P.boxC(3.6, 0.3, 2.4, matStone);
    land.position.set(12.0, A_STAIR.h - 0.15, 62.4);
    routeGroup.add(land);
    A_STAIR.noParapet.add('w');

    // 2. plank ramp off a crate stack by the spice square
    stairRun(-29.3, -22, 0.0, -29.3, -11, A_RAMP.h, 1.9, matWoodL, routeGroup);
    const land2 = P.boxC(2.6, 0.26, 2.2, matWoodL);
    land2.position.set(-30.2, A_RAMP.h - 0.13, -11.2);
    routeGroup.add(land2);
    A_RAMP.noParapet.add('e');
    for (let i = 0; i < 7; i++) {
      const c = P.crate(R.range(0.7, 1.05), matWoodL);
      c.position.set(-27.2 + R.range(-1.4, 1.4), i < 4 ? 0 : 0.9, -24 + R.range(-2, 2));
      c.rotation.y = R.range(0, 3.14);
      routeGroup.add(c);
    }

    // 3. north square stair
    stairRun(19.4, -72, 0.0, 19.4, -61, A_NORTH.h, 2.0, matStone, routeGroup);
    const land3 = P.boxC(2.6, 0.3, 2.2, matStone);
    land3.position.set(20.2, A_NORTH.h - 0.15, -61.2);
    routeGroup.add(land3);
    A_NORTH.noParapet.add('w');

    // 4. the minaret (built in §9) exits onto A_MINARET at 12 m.
    // 5. the caravanserai stair (built in §10) reaches its roof at 8.8 m.

    // decorative ladders that read as climbable and mark the routes
    for (const [x, z, h, ry] of [[-30.9, -6.5, 4.4, 0], [12.2, 74.5, 6.2, Math.PI],
    [30.4, -18.6, 8.8, Math.PI / 2], [20.4, -34.2, 5.8, 0]]) {
      const l = P.ladder(h + 0.7, matWoodD);
      l.position.set(x, 0, z); l.rotation.y = ry;
      P.NOCOLLIDE(l);
      routeGroup.add(l);
    }
  }
  ctx.add(routeGroup);
}
