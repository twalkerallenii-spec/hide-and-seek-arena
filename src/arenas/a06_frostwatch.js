// =============================================================================
// FROSTWATCH — abandoned polar research station, whiteout blizzard.
//
// Five stilted modules linked by enclosed walkway tubes, a buried ice-tunnel
// level at y = -4, and a crevasse you can climb down into. Outside is a flat
// white void with ~25 m of visibility; inside is warm, cramped and quiet. The
// contrast is the whole point — you navigate the storm by glowing windows and
// a line of orange route flags.
//
// Structure of this file
//   1  meta
//   2  layout tables + terrain height field
//   3  materials / atmosphere / lighting
//   4  boundary ice ridge
//   5  module shells (frozen) + collision proxies
//   6  module interiors (HAB / LAB / COMMS / GENERATOR / STORAGE)
//   7  elevated walkway tubes
//   8  exterior stairs + under-module layer
//   9  ice tunnels + ice cave
//  10  crevasse
//  11  outdoor landmarks
//  12  detail pass — snow caps, drifts, icicles, frost, flags
//  13  blizzard
//  14  gameplay placement
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'frostwatch',
  name: 'FROSTWATCH',
  tagline: 'Five lit windows. Twenty-five metres of world.',
  order: 6,
  difficulty: 4,
  biome: 'outdoor',
  seed: 60624,
  spawn: [-42, 0.05, 4],
  // Hints for the game layer if it supports an initial facing: look at the HAB.
  spawnLook: [-42, 4.5, -14],
  spawnYaw: Math.PI,
  bounds: 92,
  colors: ['#dfeaf6', '#b8471c'],
  music: 'tense',
};

// =============================================================================
// 2. LAYOUT TABLES
// =============================================================================

const DECK_Y = 3.0;         // module floor height
const ROOM_H = 2.9;         // interior clear height
const ROOF_Y = DECK_Y + ROOM_H;
const TUN_Y = -4.0;         // ice tunnel floor
const TUN_HW = 1.7;         // tunnel half width
const TUN_WALL_TOP = -2.6;
const CREV_FLOOR = -6.2;
const CAVE_FLOOR = -5.2;

const MODULES = [
  { id: 'hab',   label: '01\nHAB',    cx: -42, cz: -20, w: 20, d: 12, clad: 0 },
  { id: 'lab',   label: '02\nLAB',    cx: -14, cz: -32, w: 17, d: 11, clad: 1 },
  { id: 'comms', label: '03\nCOMMS',  cx:  16, cz: -20, w: 15, d: 11, clad: 0 },
  { id: 'gen',   label: '04\nPOWER',  cx:  34, cz:   6, w: 16, d: 13, clad: 1 },
  { id: 'store', label: '05\nSTORES', cx:  -8, cz:  10, w: 23, d: 13, clad: 1 },
];
const MOD = {};
for (const m of MODULES) MOD[m.id] = m;

const LINKS = [
  ['hab', 'lab'], ['lab', 'comms'], ['comms', 'gen'], ['gen', 'store'], ['store', 'lab'],
];

// Rectangles where the snow plane is cut away (shafts, the crevasse).
const HOLES = [
  { x0: -46, x1: 24, z0: 41, z1: 47 },      // crevasse
  { x0: -16.5, x1: -10.5, z0: 6.5, z1: 15 }, // storage stair tower
  { x0: -19, x1: -13, z0: -34, z1: -25 },    // lab tunnel stair
  { x0: 13.5, x1: 18.5, z0: -18.5, z1: -13.5 }, // comms hatch pit
];

// Rectangles where the drift field is flattened to y = 0 (pads + shaft aprons).
const FLATS = [
  { x0: -52, x1: 30, z0: 34, z1: 54, f: 11 },     // crevasse apron
  { x0: -21, x1: -6, z0: 3, z1: 19, f: 8 },       // storage / stair tower
  { x0: -23, x1: -9, z0: -37, z1: -22, f: 8 },    // lab stair
  { x0: 9, x1: 23, z0: -23, z1: -9, f: 8 },       // comms hatch
  { x0: -50, x1: -34, z0: -4, z1: 10, f: 12 },    // spawn apron
];

const BOUND_X = 88, BOUND_Z = 80;

const smoothstep = (a, b, t) => {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

// =============================================================================
export async function build(ctx) {
  const { props, mat, rng, noise } = ctx;
  const R = {
    terrain: rng.fork('terrain'), ridge: rng.fork('ridge'), mods: rng.fork('mods'),
    inner: rng.fork('inner'), tun: rng.fork('tun'), out: rng.fork('out'),
    detail: rng.fork('detail'), snow: rng.fork('snow'),
  };

  // ---------------------------------------------------------------------------
  // 2b. Terrain height field. Sampled by everything that sits on the snow so
  //     props and ground never disagree.
  // ---------------------------------------------------------------------------
  function flatMask(x, z) {
    let m = 0;
    for (const f of FLATS) {
      const dx = Math.max(f.x0 - x, 0, x - f.x1);
      const dz = Math.max(f.z0 - z, 0, z - f.z1);
      m = Math.max(m, 1 - smoothstep(0, f.f, Math.hypot(dx, dz)));
      if (m >= 1) return 1;
    }
    return m;
  }
  function gy(x, z) {
    const m = flatMask(x, z);
    if (m >= 0.999) return 0;
    let h = noise.fbm(x * 0.013, z * 0.013, 4) * 1.55
          + noise.fbm(x * 0.045 + 21, z * 0.045 - 9, 3) * 0.40;
    h += Math.sin(x * 0.09 + noise.fbm(x * 0.02, z * 0.02, 2) * 3.0) * 0.11;
    return h * (1 - m);
  }
  function inHole(x, z) {
    for (const h of HOLES) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // 3. MATERIALS  (12 surface() calls — the rest are solid/emissive/painted)
  // ---------------------------------------------------------------------------
  const M = {
    snow:      mat.surface('snow', { color: 0xe9f2fb, repeat: 72, size: 512 }),
    ice:       mat.surface('snow', { color: 0x9fc3e2, repeat: 9, size: 256, roughness: 0.5, normalScale: 1.5, side: THREE.DoubleSide }),
    cladA:     mat.surface('corrugated', { color: 0xc05320, repeat: 3, size: 256, ribs: 16 }),
    cladB:     mat.surface('corrugated', { color: 0x8d3a17, repeat: 3, size: 256, ribs: 16 }),
    rust:      mat.surface('rustMetal', { color: 0x4a4038, repeat: 2, size: 256 }),
    steel:     mat.surface('metalPanel', { color: 0x8d949b, repeat: 2, size: 256 }),
    innerWall: mat.surface('metalPanel', { color: 0xd6c8ac, repeat: 2, size: 256, panels: 3, rough: 0.7 }),
    innerFloor:mat.surface('tile', { color: 0x6d7278, repeat: 5, size: 256, tiles: 6, grout: 0x33363a }),
    wood:      mat.surface('wood', { color: 0x7c5731, repeat: 2, size: 256, planks: 5 }),
    ridgeIce:  mat.surface('rock', { color: 0xb4cee6, repeat: 2, size: 256 }),
    fabric:    mat.surface('fabric', { color: 0x2e4a63, repeat: 2, size: 256 }),
    grate:     mat.surface('metalPanel', { color: 0x5c646c, repeat: 4, size: 256, panels: 6 }),
  };
  const clads = [M.cladA, M.cladB];

  const packedSnow = mat.solid({ color: 0xf1f7ff, roughness: 0.72 });
  const deepIce = mat.solid({ color: 0x7fa8cc, roughness: 0.28, metalness: 0.05 });
  const darkMetal = mat.metal(0x3b4046, 0.55);
  const cable = mat.solid({ color: 0x14161a, roughness: 0.85 });
  const invis = mat.solid({ color: 0x808080 });

  // Animated emissives must NOT share the cached materials — the cache is global.
  const liveMats = [];
  function animEmissive(color, intensity, opts = {}) {
    const m = new THREE.MeshStandardMaterial({
      color: 0x0c0d0f,
      emissive: new THREE.Color(color),
      emissiveIntensity: intensity,
      roughness: 0.4, metalness: 0,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    m.userData.base = intensity;
    liveMats.push(m);
    return m;
  }

  // Painted decals -------------------------------------------------------------
  const frostMat = mat.painted(192, 192, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const corners = [[0, 0], [W, 0], [0, H], [W, H]];
    for (const [ox, oy] of corners) {
      const g = c.createRadialGradient(ox, oy, 2, ox, oy, W * 0.62);
      g.addColorStop(0, 'rgba(238,248,255,0.95)');
      g.addColorStop(0.45, 'rgba(220,238,252,0.42)');
      g.addColorStop(1, 'rgba(220,238,252,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(248,253,255,0.85)';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.2;
        const len = 22 + ((i * 37) % 60);
        c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(ox, oy);
        let px = ox, py = oy;
        for (let s = 0; s < 5; s++) {
          px += Math.cos(a + Math.sin(s * 2.1 + i) * 0.5) * len * 0.25;
          py += Math.sin(a + Math.cos(s * 1.7 + i) * 0.5) * len * 0.25;
          c.lineTo(px, py);
        }
        c.stroke();
      }
    }
  }, { transparent: true, alphaTest: 0.02, depthWrite: false, roughness: 0.35 });

  const hazardMat = mat.painted(128, 64, (c, W, H) => {
    c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#e8b32a';
    for (let i = -H; i < W; i += 26) { c.beginPath(); c.moveTo(i, H); c.lineTo(i + 13, H); c.lineTo(i + 13 + H, 0); c.lineTo(i + H, 0); c.fill(); }
    c.globalAlpha = 0.35; c.fillStyle = '#2a2016';
    for (let i = 0; i < 40; i++) c.fillRect((i * 53) % W, (i * 29) % H, 6, 3);
  }, { transparent: false, roughness: 0.8 });

  const scrawlMat = mat.painted(256, 160, (c, W, H) => {
    c.fillStyle = '#e9ecec'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(30,40,60,0.8)'; c.lineWidth = 2;
    for (let r = 0; r < 8; r++) {
      let x = 12 + (r % 2) * 8, y = 18 + r * 17;
      c.beginPath(); c.moveTo(x, y);
      const n = 10 + (r * 3) % 9;
      for (let i = 0; i < n; i++) {
        x += 9 + ((i * 17 + r * 5) % 11);
        c.lineTo(x, y + Math.sin(i * 2.3 + r) * 4);
      }
      c.stroke();
    }
    c.strokeStyle = 'rgba(180,40,30,0.85)'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(150, 22); c.lineTo(232, 96); c.stroke();
    c.beginPath(); c.moveTo(232, 22); c.lineTo(150, 96); c.stroke();
    c.beginPath(); c.arc(191, 59, 52, 0, 6.3); c.stroke();
  }, { transparent: false, roughness: 0.85 });

  const paperMat = mat.painted(64, 80, (c, W, H) => {
    c.fillStyle = '#dcd7c8'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(50,50,55,0.7)';
    for (let i = 0; i < 14; i++) c.fillRect(7, 8 + i * 5, W - 14 - ((i * 13) % 20), 1.6);
  }, { transparent: false, roughness: 0.95 });

  const flagMat = mat.painted(48, 32, (c, W, H) => {
    c.fillStyle = '#e5591b'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, H * 0.62, W, H * 0.38);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 0, W * 0.12, H);
  }, { transparent: false, side: THREE.DoubleSide, roughness: 0.95 });

  const tarpMat = mat.painted(96, 96, (c, W, H) => {
    c.fillStyle = '#2b4f63'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < W; i += 8) c.fillRect(i, 0, 3, H);
    c.clearRect(W * 0.62, H * 0.5, W * 0.4, H * 0.5);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, H * 0.8, W, 4);
  }, { transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });

  // ---------------------------------------------------------------------------
  // 3b. ATMOSPHERE
  // ---------------------------------------------------------------------------
  ctx.sky({ color: 0xdfeaf6 });
  ctx.fog(0xd6e2ee, 0.042, 0, 'exp2');
  ctx.useEnvironment(0.95);
  ctx.grade({
    exposure: 1.2, saturation: 0.85, contrast: 0.95,
    lift: [-0.005, 0.0, 0.012], gain: [0.97, 1.0, 1.07],
    vignette: 1.1, grain: 0.05, aberration: 0.0022,
    bloom: 0.5, bloomRadius: 0.65, bloomThreshold: 0.92, scanline: 0,
  });
  ctx.soundscape('wind', 'tense', { size: 0.5, dark: 0.3, wet: 0.15 });

  // ---------------------------------------------------------------------------
  // 3c. LIGHTS — 20 real lights, 3 shadow casters.
  // ---------------------------------------------------------------------------
  ctx.light(new THREE.HemisphereLight(0xd8e8f8, 0xa8bcd0, 1.1));            // 1
  ctx.light(new THREE.AmbientLight(0xbfd2e4, 0.28));                         // 2
  const key = new THREE.DirectionalLight(0xeef5ff, 0.85);                    // 3 (shadow)
  key.position.set(-40, 70, 55);
  key.target.position.set(0, 0, -6);
  ctx.light(key, { shadow: true, range: 62, far: 190 });

  const warmPoint = (x, y, z, i = 3.2, dist = 11, color = 0xffc98a, shadow = false) =>
    ctx.light(Object.assign(new THREE.PointLight(color, i, dist, 1.8), { position: new THREE.Vector3(x, y, z) }),
      shadow ? { shadow: true, far: dist + 2 } : {});

  // ---------------------------------------------------------------------------
  // 4. TERRAIN + BOUNDARY ICE RIDGE
  // ---------------------------------------------------------------------------
  const terrain = props.ground(200, 190, M.snow, { segs: 64 });
  {
    const g = terrain.geometry;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, gy(pos.getX(i), pos.getZ(i)));
    const src = g.index.array;
    const keep = [];
    for (let f = 0; f < src.length; f += 3) {
      const a = src[f], b = src[f + 1], c = src[f + 2];
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (inHole(cx, cz)) continue;
      keep.push(a, b, c);
    }
    g.setIndex(keep);
    g.computeVertexNormals();
    pos.needsUpdate = true;
  }
  terrain.name = 'snowfield';
  ctx.add(terrain);

  // Under-cap so the cut edges never show sky through the world.
  const underCap = props.ground(200, 190, deepIce, { segs: 1, collide: false });
  underCap.position.y = -9.5;
  underCap.material = mat.solid({ color: 0x6f93b4, roughness: 0.6, side: THREE.DoubleSide });
  ctx.addDecor(underCap);

  // Invisible sealing wall — an unbroken box, nothing escapes.
  for (const [x, z, w, d] of [
    [0, -BOUND_Z, BOUND_X * 2 + 8, 3], [0, BOUND_Z, BOUND_X * 2 + 8, 3],
    [-BOUND_X, 0, 3, BOUND_Z * 2 + 8], [BOUND_X, 0, 3, BOUND_Z * 2 + 8],
  ]) {
    const w0 = props.boxC(w, 26, d, invis, { shadow: false });
    w0.position.set(x, 9, z);
    w0.visible = false; w0.userData.collide = true;
    ctx.add(w0);
  }

  // Pressure-ridge ice: instanced slabs along the perimeter + interior clusters.
  {
    const slab = new THREE.IcosahedronGeometry(1, 0);
    const p = slab.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) * (1 + R.ridge.range(-0.3, 0.3)), p.getY(i) * (1 + R.ridge.range(-0.2, 0.5)), p.getZ(i) * (1 + R.ridge.range(-0.3, 0.3)));
    }
    slab.computeVertexNormals();
    const ridge = props.scatter(slab, M.ridgeIce, 460, (i, dm, r) => {
      const side = i % 4, t = r();
      let x, z;
      if (side === 0) { x = -BOUND_X + (BOUND_X * 2) * t; z = -BOUND_Z + r.range(-5, 7); }
      else if (side === 1) { x = -BOUND_X + (BOUND_X * 2) * t; z = BOUND_Z + r.range(-7, 5); }
      else if (side === 2) { x = -BOUND_X + r.range(-5, 7); z = -BOUND_Z + (BOUND_Z * 2) * t; }
      else { x = BOUND_X + r.range(-7, 5); z = -BOUND_Z + (BOUND_Z * 2) * t; }
      const h = r.range(3.5, 11);
      dm.position.set(x, gy(x, z) + h * 0.15, z);
      dm.rotation.set(r.range(-0.3, 0.3), r() * 6.28, r.range(-0.3, 0.3));
      dm.scale.set(r.range(2.2, 5.5), h * 0.5, r.range(2.0, 4.5));
    }, 811);
    ctx.addDecor(ridge);

    // Scattered ice blocks / sastrugi inside the field for silhouette interest.
    const inner = props.scatter(slab, M.ridgeIce, 220, (i, dm, r) => {
      const x = r.range(-BOUND_X + 6, BOUND_X - 6), z = r.range(-BOUND_Z + 6, BOUND_Z - 6);
      if (inHole(x, z)) return false;
      if (flatMask(x, z) > 0.55 && r.chance(0.8)) return false;
      let near = false;
      for (const m of MODULES) if (Math.abs(x - m.cx) < m.w / 2 + 5 && Math.abs(z - m.cz) < m.d / 2 + 5) near = true;
      if (near) return false;
      const h = r.range(0.5, 2.6);
      dm.position.set(x, gy(x, z) - 0.15, z);
      dm.rotation.set(r.range(-0.35, 0.35), r() * 6.28, r.range(-0.35, 0.35));
      dm.scale.set(r.range(0.8, 2.6), h * 0.5, r.range(0.7, 2.2));
    }, 812);
    ctx.addDecor(inner);
  }

  // ---------------------------------------------------------------------------
  // 5. MODULE SHELLS
  // ---------------------------------------------------------------------------
  const eaveLines = [];   // [x1,z1,x2,z2,y] — icicles get hung off these later
  const snowCapJobs = []; // [x,z,y,w,d] — instanced snow slabs on flat tops

  /** Where the centre-to-centre line leaves a module's rectangle. */
  function exitPoint(a, b) {
    const dx = b.cx - a.cx, dz = b.cz - a.cz;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const tx = Math.abs(ux) > 1e-4 ? (a.w / 2) / Math.abs(ux) : 1e9;
    const tz = Math.abs(uz) > 1e-4 ? (a.d / 2) / Math.abs(uz) : 1e9;
    const t = Math.min(tx, tz);
    const px = a.cx + ux * t, pz = a.cz + uz * t;
    let side, at;
    if (tx < tz) { side = ux > 0 ? 'e' : 'w'; at = (pz - (a.cz - a.d / 2)) / a.d; }
    else { side = uz > 0 ? 's' : 'n'; at = (px - (a.cx - a.w / 2)) / a.w; }
    return { x: px, z: pz, side, at: Math.max(0.14, Math.min(0.86, at)) };
  }

  // Collect every doorway each module needs before building shells.
  for (const m of MODULES) m.doors = [];
  for (const [ai, bi] of LINKS) {
    const A = MOD[ai], B = MOD[bi];
    const ea = exitPoint(A, B), eb = exitPoint(B, A);
    A.doors.push({ side: ea.side, at: ea.at, width: 2.5, top: 2.5 });
    B.doors.push({ side: eb.side, at: eb.at, width: 2.5, top: 2.5 });
    A._links = A._links || []; A._links.push({ from: ea, to: eb });
  }
  // Exterior airlock doors (stairs come up to these).
  MOD.hab.extDoor = { side: 's', at: 0.20, x: -46, z: -14 };
  MOD.gen.extDoor = { side: 's', at: 0.28, x: 38.5, z: 12.5 };
  MOD.store.extDoor = { side: 's', at: 0.62, x: 6, z: 16.5 };
  for (const m of MODULES) if (m.extDoor) m.doors.push({ side: m.extDoor.side, at: m.extDoor.at, width: 1.5, top: 2.3 });

  /** A window: frame, an outward beacon pane, an inward warm pane, frost. */
  function windowUnit(g, m, side, u, sillY, w, h) {
    const horiz = side === 'n' || side === 's';
    const nz = side === 's' ? 1 : side === 'n' ? -1 : 0;
    const nx = side === 'e' ? 1 : side === 'w' ? -1 : 0;
    const x = horiz ? u : (m.w / 2) * nx;
    const z = horiz ? (m.d / 2) * nz : u;
    const rotY = horiz ? 0 : Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.set(x, 0, z);
    holder.rotation.y = rotY;
    const fm = mat.metal(0x3d4247, 0.6);
    for (const [ow, oh, oy] of [[w + 0.22, 0.11, sillY - 0.05], [w + 0.22, 0.11, sillY + h + 0.05]]) {
      const b = props.boxC(ow, oh, 0.42, fm); b.position.set(0, oy, 0); holder.add(b);
    }
    for (const sx of [-1, 1]) {
      const b = props.boxC(0.11, h + 0.2, 0.42, fm); b.position.set(sx * (w / 2 + 0.05), sillY + h / 2, 0); holder.add(b);
    }
    const mull = props.boxC(0.06, h, 0.3, fm); mull.position.set(0, sillY + h / 2, 0); holder.add(mull);
    g.add(holder);
    return { x, z, sillY, w, h, rotY, side };
  }

  const windowRecords = [];

  function buildModule(m) {
    const shell = new THREE.Group();
    shell.position.set(m.cx, 0, m.cz);
    const clad = clads[m.clad];

    // -- deck, walls, roof (visual, frozen) --
    const deck = props.boxC(m.w + 0.7, 0.28, m.d + 0.7, M.steel);
    deck.position.y = DECK_Y - 0.14; shell.add(deck);
    const skirt = props.boxC(m.w + 0.72, 0.5, m.d + 0.72, M.rust);
    skirt.position.y = DECK_Y - 0.42; shell.add(skirt);

    const walls = props.roomShell({ w: m.w, d: m.d, h: ROOM_H, thickness: 0.3, material: clad, doors: m.doors });
    walls.position.y = DECK_Y;
    shell.add(walls);

    // Interior liner so the inside isn't corrugated orange.
    const liner = props.roomShell({ w: m.w - 0.62, d: m.d - 0.62, h: ROOM_H - 0.04, thickness: 0.12, material: M.innerWall, doors: m.doors });
    liner.position.y = DECK_Y;
    shell.add(liner);

    const floor = props.boxC(m.w - 0.6, 0.1, m.d - 0.6, M.innerFloor);
    floor.position.y = DECK_Y + 0.05; shell.add(floor);
    const ceil = props.boxC(m.w - 0.6, 0.1, m.d - 0.6, mat.solid({ color: 0xbdb096, roughness: 0.85 }));
    ceil.position.y = ROOF_Y - 0.12; shell.add(ceil);
    const roof = props.boxC(m.w + 0.5, 0.26, m.d + 0.5, M.rust);
    roof.position.y = ROOF_Y + 0.05; shell.add(roof);

    // Corner posts + cladding straps — eye-level trim.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = props.boxC(0.34, ROOM_H + 0.3, 0.34, M.rust);
      p.position.set(sx * (m.w / 2 - 0.05), DECK_Y + ROOM_H / 2, sz * (m.d / 2 - 0.05));
      shell.add(p);
    }
    for (const sz of [-1, 1]) {
      const strap = props.boxC(m.w + 0.16, 0.14, 0.1, M.rust);
      strap.position.set(0, DECK_Y + 1.9, sz * (m.d / 2 + 0.08)); shell.add(strap);
    }

    // -- windows: two per long side, one per short side --
    const wins = [];
    for (const sz of ['n', 's']) {
      for (const f of [-0.28, 0.24]) {
        wins.push(windowUnit(shell, m, sz, m.w * f, 1.05, 2.1, 1.15));
      }
    }
    wins.push(windowUnit(shell, m, 'e', m.d * 0.1, 1.05, 1.5, 1.15));
    for (const w of wins) windowRecords.push({ m, ...w });

    // -- legs down to the snow, one per grid point, length from the terrain --
    const legXs = [-m.w / 2 + 1.2, 0, m.w / 2 - 1.2];
    const legZs = [-m.d / 2 + 1.2, m.d / 2 - 1.2];
    for (const lx of legXs) for (const lz of legZs) {
      const wx = m.cx + lx, wz = m.cz + lz;
      const g0 = gy(wx, wz);
      const legH = DECK_Y - 0.55 - g0;
      const leg = props.cyl(0.19, 0.24, legH, M.steel, { seg: 10 });
      leg.position.set(lx, g0, lz); shell.add(leg);
      const pad = props.cyl(0.55, 0.62, 0.22, darkMetal, { seg: 10 });
      pad.position.set(lx, g0 - 0.12, lz); shell.add(pad);
      // cross bracing
      const other = lz > 0 ? -m.d / 2 + 1.2 : m.d / 2 - 1.2;
      if (lz < 0) {
        const gb = gy(wx, m.cz + other);
        const len = Math.hypot(other - lz, (DECK_Y - 0.55 - gb) - (g0 + 0.4));
        const br = props.boxC(0.1, 0.1, len, darkMetal);
        br.position.set(lx, (g0 + DECK_Y - 0.4) / 2, (lz + other) / 2);
        br.rotation.x = -Math.atan2((DECK_Y - 0.55 - gb) - (g0 + 0.4), other - lz);
        shell.add(br);
      }
    }

    // -- roof furniture: vents, a stack, guy anchors --
    const v1 = props.vent(0.8, 0.5, darkMetal);
    v1.position.set(m.w * 0.3, ROOF_Y + 0.6, -m.d / 2 - 0.02); shell.add(v1);
    const stack = props.cyl(0.16, 0.2, 1.5, darkMetal, { seg: 10 });
    stack.position.set(-m.w * 0.32, ROOF_Y + 0.18, m.d * 0.2); shell.add(stack);
    const cowl = props.cyl(0.3, 0.16, 0.24, darkMetal, { seg: 10 });
    cowl.position.set(-m.w * 0.32, ROOF_Y + 1.66, m.d * 0.2); shell.add(cowl);

    const frozen = props.freeze(shell);
    ctx.addDecor(frozen);

    // -- invisible collision proxy: same walls, plus floor and roof slabs --
    const proxy = new THREE.Group();
    proxy.position.set(m.cx, 0, m.cz);
    const pw = props.roomShell({ w: m.w, d: m.d, h: ROOM_H, thickness: 0.34, material: invis, doors: m.doors });
    pw.position.y = DECK_Y; proxy.add(pw);
    const pf = props.boxC(m.w + 0.7, 0.4, m.d + 0.7, invis); pf.position.y = DECK_Y - 0.2; proxy.add(pf);
    const pr = props.boxC(m.w + 0.5, 0.3, m.d + 0.5, invis); pr.position.y = ROOF_Y + 0.05; proxy.add(pr);
    proxy.traverse(o => { if (o.isMesh) { o.visible = false; o.castShadow = false; o.receiveShadow = false; } });
    ctx.addSolid(proxy);

    // eaves for icicles, roof for snow
    eaveLines.push([m.cx - m.w / 2 - 0.2, m.cz - m.d / 2 - 0.2, m.cx + m.w / 2 + 0.2, m.cz - m.d / 2 - 0.2, ROOF_Y]);
    eaveLines.push([m.cx - m.w / 2 - 0.2, m.cz + m.d / 2 + 0.2, m.cx + m.w / 2 + 0.2, m.cz + m.d / 2 + 0.2, ROOF_Y]);
    eaveLines.push([m.cx - m.w / 2 - 0.2, m.cz - m.d / 2, m.cx - m.w / 2 - 0.2, m.cz + m.d / 2, ROOF_Y]);
    eaveLines.push([m.cx + m.w / 2 + 0.2, m.cz - m.d / 2, m.cx + m.w / 2 + 0.2, m.cz + m.d / 2, ROOF_Y]);
    snowCapJobs.push([m.cx, ROOF_Y + 0.24, m.cz, m.w + 0.5, m.d + 0.5]);
  }
  for (const m of MODULES) buildModule(m);

  // Beacon panes + frost. Separate from the frozen shell so they keep their
  // own transparent/emissive materials and can be lit from inside.
  const beaconMat = animEmissive(0xffc07a, 2.6, { side: THREE.DoubleSide });
  const innerPaneMat = mat.emissive(0xffd7a4, 0.55, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  for (const w of windowRecords) {
    const holder = new THREE.Group();
    holder.position.set(w.m.cx + w.x, 0, w.m.cz + w.z);
    holder.rotation.y = w.rotY;
    const out = props.boxC(w.w, w.h, 0.02, beaconMat, { collide: false, shadow: false });
    out.position.set(0, w.sillY + w.h / 2, (w.side === 'n' || w.side === 'w') ? -0.19 : 0.19);
    holder.add(out);
    const inn = props.boxC(w.w - 0.05, w.h - 0.05, 0.02, innerPaneMat, { collide: false, shadow: false });
    inn.position.set(0, w.sillY + w.h / 2, (w.side === 'n' || w.side === 'w') ? 0.19 : -0.19);
    holder.add(inn);
    for (const sgn of [-1, 1]) {
      const fr = props.boxC(w.w, w.h, 0.005, frostMat, { collide: false, shadow: false });
      fr.position.set(0, w.sillY + w.h / 2, sgn * 0.215);
      holder.add(fr);
    }
    holder.position.y = DECK_Y;
    ctx.addDecor(holder);
  }

  // Module numbers + hazard stencils.
  for (const m of MODULES) {
    const s = props.sign(m.label, { background: 0x161719, color: 0xf0f2f4, height: 0.95, fontSize: 84 });
    s.position.set(m.cx - m.w * 0.36, DECK_Y + 2.35, m.cz + m.d / 2 + 0.2);
    ctx.addDecor(s);
    const hz = props.boxC(1.6, 0.35, 0.02, hazardMat, { collide: false, shadow: false });
    hz.position.set(m.cx + m.w * 0.3, DECK_Y - 0.62, m.cz + m.d / 2 + 0.38);
    ctx.addDecor(hz);
  }

  // ---------------------------------------------------------------------------
  // 6. INTERIORS
  // ---------------------------------------------------------------------------
  const F = DECK_Y + 0.1;   // interior walking surface

  function stringLights(g, x1, z1, x2, z2, y, n, color, intensity) {
    const bulbG = new THREE.SphereGeometry(0.045, 6, 5);
    const bm = animEmissive(color, intensity);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bx = x1 + (x2 - x1) * t, bz = z1 + (z2 - z1) * t;
      const sag = Math.sin(t * Math.PI * n) * 0.0;
      const cy0 = y - Math.sin(t * Math.PI) * 0.35 - sag;
      const b = new THREE.Mesh(bulbG, bm);
      b.position.set(bx, cy0 - 0.08, bz); b.userData.collide = false; b.castShadow = false;
      g.add(b);
      if (i < n) {
        const t2 = (i + 1) / n;
        const nx = x1 + (x2 - x1) * t2, nz = z1 + (z2 - z1) * t2;
        const ny = y - Math.sin(t2 * Math.PI) * 0.35;
        const len = Math.hypot(nx - bx, ny - cy0, nz - bz);
        const seg = props.boxC(0.015, 0.015, len, cable, { collide: false, shadow: false });
        seg.position.set((bx + nx) / 2, (cy0 + ny) / 2, (bz + nz) / 2);
        seg.lookAt(nx, ny, nz);
        g.add(seg);
      }
    }
    return bm;
  }

  // -- 6a. HAB ----------------------------------------------------------------
  {
    const m = MOD.hab, g = new THREE.Group();
    const bunkMat = mat.solid({ color: 0x9aa2a8, roughness: 0.55, metalness: 0.35 });
    for (let i = 0; i < 4; i++) {
      const bx = m.cx - m.w / 2 + 2.6 + i * 4.1, bz = m.cz - m.d / 2 + 1.9;
      for (const [by, dep] of [[F + 0.5, 0], [F + 1.55, 0]]) {
        const bed = props.boxC(1.95, 0.12, 1.0, bunkMat);
        bed.position.set(bx, by, bz + dep); bed.userData.collide = true; g.add(bed);
        const mattress = props.boxC(1.85, 0.16, 0.9, M.fabric);
        mattress.position.set(bx, by + 0.14, bz + dep); mattress.userData.collide = false; g.add(mattress);
        const blanket = props.boxC(1.86, 0.1, 0.6, mat.surface('fabric', { color: 0x2e4a63, repeat: 2, size: 256 }));
        blanket.position.set(bx, by + 0.26, bz + dep + 0.12); blanket.userData.collide = false; g.add(blanket);
      }
      for (const sx of [-0.9, 0.9]) {
        const post = props.boxC(0.07, 2.1, 0.07, bunkMat);
        post.position.set(bx + sx, F + 1.05, bz); post.userData.collide = false; g.add(post);
      }
      const cur = props.boxC(0.02, 1.0, 1.0, M.fabric);
      cur.position.set(bx + 0.95, F + 1.0, bz + 0.2); cur.userData.collide = false; g.add(cur);
    }
    // lockers, mess table, dead TV, boots, chess set
    const lk = props.lockers(6, mat.surface('metalPanel', { color: 0x3f5e5a, repeat: 1, size: 256, panels: 2, roughness: 0.5 }));
    lk.position.set(m.cx + m.w / 2 - 2.0, F, m.cz - m.d / 2 + 0.7); lk.rotation.y = Math.PI;
    g.add(lk);
    const tbl = props.table(2.6, 0.76, 1.1, M.wood);
    tbl.position.set(m.cx + 1.5, F, m.cz + 2.4); g.add(tbl);
    for (let i = 0; i < 4; i++) {
      const ch = props.chair(mat.solid({ color: 0x4a4a4e, roughness: 0.75 }));
      ch.position.set(m.cx + 0.2 + i * 0.9, F, m.cz + (i % 2 ? 3.5 : 1.3));
      ch.rotation.y = (i % 2 ? 0 : Math.PI) + R.inner.range(-0.3, 0.3);
      g.add(ch);
    }
    const mugMat = mat.solid({ color: 0xe4e0d6, roughness: 0.55 });
    for (let i = 0; i < 5; i++) {
      const mg = props.cyl(0.045, 0.04, 0.1, mugMat, { seg: 8, collide: false });
      mg.position.set(m.cx + 0.6 + R.inner.range(0, 2.2), F + 0.76, m.cz + 2.4 + R.inner.range(-0.4, 0.4));
      g.add(mg);
    }
    const chess = props.boxC(0.42, 0.03, 0.42, mat.solid({ color: 0x2b2b2e, roughness: 0.5 }));
    chess.position.set(m.cx + 2.4, F + 0.79, m.cz + 2.4); chess.userData.collide = false; g.add(chess);
    for (let i = 0; i < 9; i++) {
      const pc = props.cyl(0.014, 0.02, 0.06, mat.solid({ color: i % 2 ? 0xe8e4da : 0x1c1c1e, roughness: 0.4 }), { seg: 6, collide: false });
      pc.position.set(m.cx + 2.24 + (i % 3) * 0.16, F + 0.8, m.cz + 2.24 + Math.floor(i / 3) * 0.16);
      g.add(pc);
    }
    const tv = props.boxC(1.0, 0.62, 0.12, mat.solid({ color: 0x1a1b1d, roughness: 0.4 }));
    tv.position.set(m.cx - m.w / 2 + 1.1, F + 1.9, m.cz + 3.4); tv.rotation.y = Math.PI / 2; tv.userData.collide = false;
    g.add(tv);
    const tvScreen = props.boxC(0.86, 0.5, 0.02, mat.solid({ color: 0x14181c, roughness: 0.15, metalness: 0.2 }));
    tvScreen.position.set(m.cx - m.w / 2 + 1.02, F + 1.9, m.cz + 3.4); tvScreen.rotation.y = Math.PI / 2; tvScreen.userData.collide = false;
    g.add(tvScreen);
    for (let i = 0; i < 4; i++) {
      const boot = props.boxC(0.14, 0.3, 0.32, mat.solid({ color: 0x23262a, roughness: 0.9 }));
      boot.position.set(m.cx - m.w / 2 + 1.6 + i * 0.22, F + 0.15, m.cz + m.d / 2 - 1.0);
      boot.rotation.y = R.inner.range(-0.4, 0.4); boot.userData.collide = false; g.add(boot);
    }
    const heater = props.boxC(0.7, 0.5, 0.28, darkMetal);
    heater.position.set(m.cx - 4, F + 0.25, m.cz + m.d / 2 - 0.9); g.add(heater);
    const coil = props.boxC(0.58, 0.3, 0.03, animEmissive(0xff5a1e, 5.0));
    coil.position.set(m.cx - 4, F + 0.28, m.cz + m.d / 2 - 1.06); coil.userData.collide = false; g.add(coil);

    stringLights(g, m.cx - m.w / 2 + 1.5, m.cz + m.d / 2 - 1.2, m.cx + m.w / 2 - 1.5, m.cz + m.d / 2 - 1.2, ROOF_Y - 0.35, 12, 0xffb066, 4.2);
    const pend = props.pendant(0.7, { color: 0xffcb92, intensity: 7, swing: 0.05 });
    pend.position.set(m.cx + 1.5, ROOF_Y - 0.2, m.cz + 2.4);
    g.add(pend); g.userData.pend = pend;
    ctx.add(g);

    warmPoint(m.cx + 1.5, F + 2.1, m.cz + 2.2, 4.0, 13, 0xffc98a, true);   // 4 (shadow)
    warmPoint(m.cx - 6.5, F + 2.0, m.cz - 1.0, 2.4, 10);                    // 5
    warmPoint(m.cx + 7.5, F + 2.0, m.cz + 1.0, 2.0, 9);                     // 6

    ctx.hidingSpot(m.cx + m.w / 2 - 2.0, F, m.cz - m.d / 2 + 1.2, 1.4, 1.0);
    ctx.hidingSpot(m.cx - 4.0, F, m.cz - m.d / 2 + 2.0, 1.3, 0.85);
  }

  // -- 6b. LAB ----------------------------------------------------------------
  {
    const m = MOD.lab, g = new THREE.Group();
    const benchMat = mat.solid({ color: 0x8f9499, roughness: 0.4, metalness: 0.4 });
    for (const bz of [m.cz - m.d / 2 + 1.3, m.cz + m.d / 2 - 1.3]) {
      const b = props.boxC(m.w - 4, 0.08, 1.0, benchMat);
      b.position.set(m.cx, F + 0.9, bz); b.userData.collide = true; g.add(b);
      const under = props.boxC(m.w - 4.4, 0.85, 0.9, mat.solid({ color: 0x5d6469, roughness: 0.7 }));
      under.position.set(m.cx, F + 0.44, bz); under.userData.collide = false; g.add(under);
      for (let i = 0; i < 9; i++) {
        const r0 = 0.035 + R.inner.range(0, 0.03);
        const glass = props.cyl(r0, r0, R.inner.range(0.12, 0.3), mat.glassCheap({ color: 0xbcd8e0, opacity: 0.45 }), { seg: 8, collide: false });
        glass.position.set(m.cx - m.w / 2 + 3 + i * ((m.w - 6) / 8), F + 0.94, bz + R.inner.range(-0.3, 0.3));
        g.add(glass);
      }
    }
    // monitor wall — some cracked
    const mons = [];
    for (let i = 0; i < 8; i++) {
      const mx = m.cx - m.w / 2 + 2.2 + (i % 4) * 1.5;
      const my = F + 1.5 + Math.floor(i / 4) * 0.85;
      const bez = props.boxC(1.3, 0.75, 0.1, mat.solid({ color: 0x191b1e, roughness: 0.5 }));
      bez.position.set(mx, my, m.cz - m.d / 2 + 0.45); bez.userData.collide = false; g.add(bez);
      const dead = R.inner.chance(0.3);
      const sm = animEmissive(dead ? 0x1a2a34 : (R.inner.chance(0.4) ? 0x59d6ff : 0x4be08a), dead ? 0.4 : 2.4);
      const sc = props.boxC(1.18, 0.64, 0.02, sm);
      sc.position.set(mx, my, m.cz - m.d / 2 + 0.51); sc.userData.collide = false; g.add(sc);
      mons.push(sm);
    }
    g.userData.mons = mons;
    // specimen cabinets + a chest freezer
    for (let i = 0; i < 3; i++) {
      const cab = props.boxC(1.1, 2.0, 0.6, mat.solid({ color: 0xa8aeb2, roughness: 0.45, metalness: 0.3 }));
      cab.position.set(m.cx + m.w / 2 - 1.4, F + 1.0, m.cz - 2.5 + i * 2.4);
      g.add(cab);
      const gl = props.boxC(0.9, 1.1, 0.02, mat.glassCheap({ color: 0x9fc4d8, opacity: 0.3 }));
      gl.position.set(m.cx + m.w / 2 - 1.72, F + 1.35, m.cz - 2.5 + i * 2.4); gl.rotation.y = Math.PI / 2;
      gl.userData.collide = false; g.add(gl);
    }
    const frz = props.boxC(1.8, 0.95, 0.8, mat.solid({ color: 0xdfe3e6, roughness: 0.5 }));
    frz.position.set(m.cx - 2, F + 0.48, m.cz + 0.2); g.add(frz);
    const frzCap = props.boxC(1.86, 0.1, 0.86, packedSnow);
    frzCap.position.set(m.cx - 2, F + 1.0, m.cz + 0.2); frzCap.userData.collide = false; g.add(frzCap);
    const stool = props.chair(mat.solid({ color: 0x3f4348, roughness: 0.7 }));
    stool.position.set(m.cx + 2, F, m.cz + 1.6); g.add(stool);
    ctx.add(g);

    warmPoint(m.cx, F + 2.3, m.cz, 2.6, 12, 0xffd0a0);                      // 7
    ctx.light(new THREE.PointLight(0x5fc8ff, 2.0, 9, 2.0)).position.set(m.cx - 4, F + 1.9, m.cz - m.d / 2 + 1.6); // 8
    ctx.hidingSpot(m.cx, F, m.cz + m.d / 2 - 1.4, 1.3, 0.8);
    ctx.hidingSpot(m.cx + m.w / 2 - 1.6, F, m.cz + 0.5, 1.1, 0.75);
  }

  // -- 6c. COMMS --------------------------------------------------------------
  {
    const m = MOD.comms, g = new THREE.Group();
    const rackMat = mat.solid({ color: 0x2d3237, roughness: 0.5, metalness: 0.4 });
    const leds = [];
    for (let i = 0; i < 4; i++) {
      const rx = m.cx - m.w / 2 + 2.0 + i * 1.3;
      const rack = props.boxC(1.1, 2.1, 0.7, rackMat);
      rack.position.set(rx, F + 1.05, m.cz - m.d / 2 + 1.0); g.add(rack);
      for (let j = 0; j < 9; j++) {
        const lm = animEmissive(R.inner.chance(0.5) ? 0x44ff88 : (R.inner.chance(0.5) ? 0xffb020 : 0xff3a2a), 4.0);
        const led = props.boxC(0.06, 0.03, 0.02, lm);
        led.position.set(rx - 0.4 + (j % 3) * 0.16, F + 0.5 + Math.floor(j / 3) * 0.45, m.cz - m.d / 2 + 1.36);
        led.userData.collide = false; g.add(led);
        leds.push({ m: lm, ph: R.inner.range(0, 6.28), sp: R.inner.range(1.2, 6.0) });
      }
      const slot = props.boxC(0.9, 0.05, 0.02, mat.solid({ color: 0x101214 }));
      slot.position.set(rx, F + 1.75, m.cz - m.d / 2 + 1.36); slot.userData.collide = false; g.add(slot);
    }
    g.userData.leds = leds;

    // dish control desk
    const desk = props.boxC(3.4, 0.9, 1.2, mat.solid({ color: 0x4d5359, roughness: 0.55 }));
    desk.position.set(m.cx + 2.5, F + 0.45, m.cz + 1.2); g.add(desk);
    const deskTop = props.boxC(3.5, 0.08, 1.3, M.wood);
    deskTop.position.set(m.cx + 2.5, F + 0.93, m.cz + 1.2); deskTop.userData.collide = false; g.add(deskTop);
    for (let i = 0; i < 3; i++) {
      const sm = animEmissive(0x7ad8ff, 2.2);
      const sc = props.boxC(0.7, 0.44, 0.03, sm);
      sc.position.set(m.cx + 1.4 + i * 1.1, F + 1.28, m.cz + 0.75);
      sc.rotation.x = -0.16; sc.userData.collide = false; g.add(sc);
      const bz2 = props.boxC(0.78, 0.52, 0.08, mat.solid({ color: 0x1b1d20, roughness: 0.5 }));
      bz2.position.set(m.cx + 1.4 + i * 1.1, F + 1.27, m.cz + 0.72); bz2.rotation.x = -0.16;
      bz2.userData.collide = false; g.add(bz2);
      leds.push({ m: sm, ph: i * 2.1, sp: 0.7 });
    }
    const ch = props.chair(mat.solid({ color: 0x45494e, roughness: 0.7 }));
    ch.position.set(m.cx + 2.4, F, m.cz + 2.6); ch.rotation.y = Math.PI + 0.4; g.add(ch);

    // whiteboard covered in scrawl
    const wb = props.boxC(2.4, 1.5, 0.05, scrawlMat, { collide: false, shadow: false });
    wb.position.set(m.cx - 1.0, F + 1.8, m.cz + m.d / 2 - 0.36); wb.rotation.y = Math.PI;
    g.add(wb);
    const wbFrame = props.boxC(2.55, 1.65, 0.06, darkMetal);
    wbFrame.position.set(m.cx - 1.0, F + 1.8, m.cz + m.d / 2 - 0.32); wbFrame.userData.collide = false; g.add(wbFrame);

    // paper printouts on the floor
    for (let i = 0; i < 22; i++) {
      const p = props.boxC(0.21, 0.005, 0.28, paperMat, { collide: false, shadow: false });
      p.position.set(m.cx + R.inner.range(-6, 6), F + 0.006 + i * 0.0007, m.cz + R.inner.range(-4, 4));
      p.rotation.y = R.inner.range(0, 6.28);
      g.add(p);
    }
    ctx.add(g);

    warmPoint(m.cx, F + 2.3, m.cz, 2.4, 11, 0xffc98a);                       // 9
    ctx.light(new THREE.PointLight(0x63c8ff, 1.8, 8, 2.0)).position.set(m.cx + 2.5, F + 1.7, m.cz + 1.0); // 10
    ctx.hidingSpot(m.cx - m.w / 2 + 2.5, F, m.cz - m.d / 2 + 2.2, 1.3, 0.85);
  }

  // -- 6d. GENERATOR ----------------------------------------------------------
  const genShake = [];
  {
    const m = MOD.gen, g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const gen = props.machine(2.6, 1.5, 1.4, 90 + i);
      gen.position.set(m.cx - m.w / 2 + 2.6 + i * 3.4, F, m.cz - 2.6);
      genShake.push({ o: gen, x: gen.position.x, ph: i * 1.7, live: i < 2 });
      g.add(gen);
      const exh = props.cyl(0.11, 0.13, 2.4, darkMetal, { seg: 8, collide: false });
      exh.position.set(m.cx - m.w / 2 + 3.4 + i * 3.4, F + 1.5, m.cz - 3.0); g.add(exh);
    }
    // fuel drums + pipework
    for (let i = 0; i < 6; i++) {
      const b = props.barrel(0.32, 0.9, mat.surface('rustMetal', { repeat: 1, size: 256, color: 0x9a5a1c }));
      b.position.set(m.cx + m.w / 2 - 1.6 - (i % 3) * 0.8, F, m.cz + 3.4 - Math.floor(i / 3) * 0.8);
      g.add(b);
    }
    const pipeRun = props.pipes(m.w - 3, 3, 0.1, mat.metal(0x7a7f85, 0.45));
    pipeRun.position.set(m.cx, F + 2.35, m.cz - m.d / 2 + 0.9); g.add(pipeRun);
    const pipeDrop = props.cyl(0.1, 0.1, 2.0, mat.metal(0x7a7f85, 0.45), { seg: 8, collide: false });
    pipeDrop.position.set(m.cx + 5, F + 0.4, m.cz - m.d / 2 + 0.9); g.add(pipeDrop);

    // red-lit control panel
    const panel = props.boxC(2.2, 1.7, 0.4, mat.solid({ color: 0x3a2222, roughness: 0.6, metalness: 0.3 }));
    panel.position.set(m.cx + 3.5, F + 0.85, m.cz - m.d / 2 + 0.5); g.add(panel);
    const panelGlow = animEmissive(0xff2f22, 3.4);
    for (let i = 0; i < 6; i++) {
      const d0 = props.boxC(0.24, 0.14, 0.02, panelGlow);
      d0.position.set(m.cx + 2.7 + (i % 3) * 0.8, F + 1.4 - Math.floor(i / 3) * 0.4, m.cz - m.d / 2 + 0.71);
      d0.userData.collide = false; g.add(d0);
    }
    genShake.push({ m: panelGlow });

    // hole in the roof — snow comes in, a cold blue shaft with it
    const holeR = 1.9;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(holeR, 0.14, 6, 18), M.rust);
    rim.rotation.x = Math.PI / 2; rim.position.set(m.cx - 3.5, ROOF_Y + 0.2, m.cz + 3.0);
    rim.userData.collide = false; g.add(rim);
    const shaft = props.cyl(holeR * 0.85, holeR * 0.5, ROOF_Y - F, mat.emissive(0xcfe4f6, 0.32, { transparent: true, opacity: 0.16, side: THREE.DoubleSide }), { seg: 14, collide: false, shadow: false });
    shaft.position.set(m.cx - 3.5, F, m.cz + 3.0); g.add(shaft);
    const pileUnder = props.sphere(1.5, packedSnow, { seg: 14, collide: false, shadow: false });
    pileUnder.position.set(m.cx - 3.5, F - 1.15, m.cz + 3.0); pileUnder.scale.set(1, 0.36, 1);
    g.add(pileUnder);

    // torn cladding flapping at the hole edge
    const tarp = props.boxC(2.2, 1.6, 0.02, tarpMat, { collide: false, shadow: false });
    tarp.position.set(m.cx - 3.5 - holeR, ROOF_Y + 0.9, m.cz + 3.0);
    const tarpPivot = new THREE.Group();
    tarpPivot.position.set(m.cx - 3.5 - holeR, ROOF_Y + 1.7, m.cz + 3.0);
    tarp.position.set(0, -0.8, 0);
    tarpPivot.add(tarp); g.add(tarpPivot);
    g.userData.tarp = tarpPivot;
    ctx.add(g);

    warmPoint(m.cx + 4, F + 2.2, m.cz + 2, 3.4, 12, 0xffb277, true);        // 11 (shadow)
    ctx.light(new THREE.PointLight(0xff3826, 3.0, 9, 2.0)).position.set(m.cx + 3.5, F + 1.6, m.cz - m.d / 2 + 1.4); // 12
    ctx.hidingSpot(m.cx - m.w / 2 + 2.2, F, m.cz + 3.5, 1.3, 0.8);
    ctx.hidingSpot(m.cx + m.w / 2 - 2.0, F, m.cz + 3.4, 1.2, 0.85);
  }

  // -- 6e. STORAGE (+ the stair tower down to the ice) ------------------------
  {
    const m = MOD.store, g = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const rack = props.shelfRack(4, 3, 2.4, 1.2, 1.8, mat.solid({ color: 0xc85f1c, roughness: 0.6, metalness: 0.4 }));
      rack.position.set(m.cx + 3.5, F, m.cz - 3.6 + i * 5.2);
      g.add(rack);
      for (let j = 0; j < 8; j++) {
        const cr = props.crate(R.inner.range(0.6, 1.0), mat.surface('wood', { color: 0x8a6238, repeat: 1, size: 256, planks: 5 }));
        cr.position.set(m.cx - 1.0 + R.inner.range(0, 8.6), F + (R.inner.chance(0.5) ? 1.86 : 0.04), m.cz - 3.6 + i * 5.2 + R.inner.range(-0.35, 0.35));
        cr.rotation.y = R.inner.range(-0.2, 0.2);
        g.add(cr);
      }
    }
    for (let i = 0; i < 5; i++) {
      const pl = props.pallet(1.2, 0.9);
      pl.position.set(m.cx - 6 + R.inner.range(-2, 2), F, m.cz + R.inner.range(-4, 4));
      pl.rotation.y = R.inner.range(0, 3); g.add(pl);
    }
    // snowmobile
    {
      const sm = new THREE.Group();
      const body = props.boxC(1.1, 0.55, 2.5, mat.solid({ color: 0xd8d2c4, roughness: 0.4, metalness: 0.2 }));
      body.position.y = 0.72; sm.add(body);
      const nose = props.boxC(1.0, 0.35, 0.8, mat.solid({ color: 0xc03a1c, roughness: 0.4 }));
      nose.position.set(0, 0.9, -1.35); sm.add(nose);
      const track = props.boxC(0.85, 0.42, 2.0, mat.solid({ color: 0x1a1c1e, roughness: 0.95 }));
      track.position.set(0, 0.24, 0.35); sm.add(track);
      for (const sx of [-0.55, 0.55]) {
        const ski = props.boxC(0.22, 0.08, 1.3, mat.solid({ color: 0x2a2d31, roughness: 0.6 }));
        ski.position.set(sx, 0.06, -1.2); ski.userData.collide = false; sm.add(ski);
        const strut = props.cyl(0.04, 0.04, 0.6, darkMetal, { seg: 6, collide: false });
        strut.position.set(sx, 0.1, -1.2); sm.add(strut);
      }
      const bar = props.boxC(0.9, 0.05, 0.05, darkMetal); bar.position.set(0, 1.25, -0.6);
      bar.userData.collide = false; sm.add(bar);
      const wind = props.boxC(0.7, 0.4, 0.03, mat.glassCheap({ color: 0xa8c4d4, opacity: 0.35 }));
      wind.position.set(0, 1.4, -0.95); wind.rotation.x = 0.3; wind.userData.collide = false; sm.add(wind);
      sm.position.set(m.cx - 7.5, F, m.cz + 3.0); sm.rotation.y = 0.5;
      g.add(sm);
    }
    // the jammed-open door and its snow drift
    const jam = props.door(1.5, 2.3, M.rust, darkMetal);
    jam.position.set(m.cx + m.w * 0.12, F, m.cz + m.d / 2 - 0.22);
    jam.userData.open(0.75); g.add(jam);
    const blownIn = props.sphere(2.4, packedSnow, { seg: 14, collide: false, shadow: false });
    blownIn.position.set(m.cx + m.w * 0.12, F - 1.9, m.cz + m.d / 2 - 1.9);
    blownIn.scale.set(1.2, 0.28, 1.0); g.add(blownIn);
    const tongue = props.boxC(2.2, 0.12, 3.0, packedSnow, { collide: false, shadow: false });
    tongue.position.set(m.cx + m.w * 0.12, F + 0.06, m.cz + m.d / 2 - 2.4); g.add(tongue);
    ctx.add(g);

    warmPoint(m.cx - 5, F + 2.3, m.cz, 2.4, 13, 0xffc07a);                   // 13
    warmPoint(m.cx + 7, F + 2.3, m.cz - 1, 2.0, 11, 0xffc07a);               // 14
    ctx.hidingSpot(m.cx + 3.5, F, m.cz - 3.6, 1.5, 1.0);
    ctx.hidingSpot(m.cx + 3.5, F, m.cz + 1.6, 1.5, 1.0);
    ctx.hidingSpot(m.cx - 7.5, F, m.cz + 3.0, 1.2, 0.8);
  }

  // ---------------------------------------------------------------------------
  // 7. WALKWAY TUBES
  // ---------------------------------------------------------------------------
  const tubeSegs = [];
  function buildTube(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    tubeSegs.push({ ax, az, bx, bz });

    const shell = new THREE.Group();
    shell.position.set(cx, 0, cz);
    shell.rotation.y = ang;
    const W = 2.7, H = 2.5;
    const clad = M.cladA;
    for (const sx of [-1, 1]) {
      const wall = props.boxC(0.18, H, len, clad);
      wall.position.set(sx * W / 2, DECK_Y + H / 2, 0); shell.add(wall);
      // window band
      for (let t = -len / 2 + 1.6; t < len / 2 - 1; t += 2.4) {
        const fr = props.boxC(0.1, 0.9, 1.4, mat.metal(0x3d4247, 0.6));
        fr.position.set(sx * (W / 2 + 0.03), DECK_Y + 1.55, t); shell.add(fr);
      }
    }
    const roof = props.boxC(W + 0.3, 0.2, len, M.rust);
    roof.position.set(0, DECK_Y + H + 0.06, 0); shell.add(roof);
    const floor = props.boxC(W, 0.22, len, M.grate);
    floor.position.set(0, DECK_Y - 0.11, 0); shell.add(floor);
    for (let t = -len / 2 + 0.4; t < len / 2; t += 1.6) {
      const rib = props.boxC(W + 0.34, 0.12, 0.12, M.rust);
      rib.position.set(0, DECK_Y + H + 0.02, t); shell.add(rib);
      const ribL = props.boxC(0.1, H, 0.12, M.rust);
      ribL.position.set(-W / 2 - 0.11, DECK_Y + H / 2, t); shell.add(ribL);
      const ribR = props.boxC(0.1, H, 0.12, M.rust);
      ribR.position.set(W / 2 + 0.11, DECK_Y + H / 2, t); shell.add(ribR);
    }
    // A-frame legs
    for (let t = -len / 2 + 3; t < len / 2 - 1; t += 6.5) {
      const wx = cx + Math.sin(ang) * t, wz = cz + Math.cos(ang) * t;
      const g0 = gy(wx, wz);
      const lh = DECK_Y - 0.24 - g0;
      for (const sx of [-1, 1]) {
        const leg = props.boxC(0.18, lh, 0.18, M.steel);
        leg.position.set(sx * (W / 2 - 0.2), g0 + lh / 2, t);
        shell.add(leg);
      }
      const tie = props.boxC(W - 0.3, 0.12, 0.12, M.steel);
      tie.position.set(0, g0 + lh * 0.35, t); shell.add(tie);
    }
    const frozen = props.freeze(shell);
    ctx.addDecor(frozen);

    // collision proxy: floor slab + two side walls + roof
    const proxy = new THREE.Group();
    proxy.position.set(cx, 0, cz); proxy.rotation.y = ang;
    const pf = props.boxC(W + 0.4, 0.3, len + 0.6, invis); pf.position.set(0, DECK_Y - 0.15, 0); proxy.add(pf);
    for (const sx of [-1, 1]) {
      const pw = props.boxC(0.3, H, len + 0.6, invis); pw.position.set(sx * (W / 2 + 0.05), DECK_Y + H / 2, 0); proxy.add(pw);
    }
    const pr = props.boxC(W + 0.4, 0.24, len + 0.6, invis); pr.position.set(0, DECK_Y + H + 0.1, 0); proxy.add(pr);
    proxy.traverse(o => { if (o.isMesh) { o.visible = false; o.castShadow = false; o.receiveShadow = false; } });
    ctx.addSolid(proxy);

    // window glow so the tube reads as a lit line through the storm
    const glow = new THREE.Group();
    glow.position.set(cx, 0, cz); glow.rotation.y = ang;
    for (const sx of [-1, 1]) {
      for (let t = -len / 2 + 1.6; t < len / 2 - 1; t += 2.4) {
        const p = props.boxC(0.02, 0.72, 1.2, beaconMat, { collide: false, shadow: false });
        p.position.set(sx * (W / 2 + 0.02), DECK_Y + 1.55, t);
        glow.add(p);
      }
    }
    ctx.addDecor(glow);

    eaveLines.push([ax - Math.cos(ang) * (W / 2 + 0.2), az + Math.sin(ang) * (W / 2 + 0.2),
                    bx - Math.cos(ang) * (W / 2 + 0.2), bz + Math.sin(ang) * (W / 2 + 0.2), DECK_Y + H]);
    eaveLines.push([ax + Math.cos(ang) * (W / 2 + 0.2), az - Math.sin(ang) * (W / 2 + 0.2),
                    bx + Math.cos(ang) * (W / 2 + 0.2), bz - Math.sin(ang) * (W / 2 + 0.2), DECK_Y + H]);

    // one strip light every other tube keeps the light count sane
    return { cx, cz, ang, len, H, W };
  }

  let tubeIdx = 0;
  for (const [ai, bi] of LINKS) {
    const A = MOD[ai], B = MOD[bi];
    const ea = exitPoint(A, B), eb = exitPoint(B, A);
    const t = buildTube(A.cx + ea.x - A.cx, A.cz + ea.z - A.cz, B.cx + eb.x - B.cx, B.cz + eb.z - B.cz);
    // snow along the tube roof
    snowCapJobs.push([t.cx, DECK_Y + t.H + 0.22, t.cz, t.W + 0.3, t.len, t.ang]);
    if (tubeIdx % 2 === 0) {
      warmPoint(t.cx, DECK_Y + 2.0, t.cz, 2.0, 12, 0xffbb84);                // 15, 16, 17
    }
    // hanging strip fixtures inside
    const strip = new THREE.Group();
    strip.position.set(t.cx, 0, t.cz); strip.rotation.y = t.ang;
    for (let s = -t.len / 2 + 2; s < t.len / 2 - 1; s += 4.5) {
      const fl = props.fluorescent(1.1, { color: 0xffd7a8, intensity: 3.4 });
      fl.position.set(0, DECK_Y + t.H - 0.22, s);
      fl.rotation.y = Math.PI / 2;
      strip.add(fl);
    }
    ctx.addDecor(strip);
    tubeIdx++;
  }

  // ---------------------------------------------------------------------------
  // 8. EXTERIOR STAIRS + UNDER-MODULE LAYER
  // ---------------------------------------------------------------------------
  /** Grated stair ascending along +Z from (x, baseY, z). */
  function metalStair(x, z, baseY, topY, width = 1.5, steps = null) {
    const g = new THREE.Group();
    const rise = topY - baseY;
    const n = steps ?? Math.max(4, Math.round(Math.abs(rise) / 0.18));
    const sh = rise / n, sd = 0.29;
    for (let i = 0; i < n; i++) {
      const tread = props.boxC(width, 0.07, sd + 0.03, M.grate);
      tread.position.set(0, sh * (i + 1) - 0.035, sd * (i + 0.5));
      g.add(tread);
      const riser = props.boxC(width, Math.abs(sh), 0.03, darkMetal);
      riser.position.set(0, sh * (i + 0.5), sd * i);
      riser.userData.collide = false; g.add(riser);
    }
    const run = n * sd;
    const slope = Math.atan2(rise, run);
    for (const sx of [-1, 1]) {
      const str = props.boxC(0.08, 0.26, Math.hypot(rise, run), darkMetal);
      str.position.set(sx * (width / 2 + 0.05), baseY - baseY + rise / 2 - 0.16, run / 2);
      str.rotation.x = -slope; str.userData.collide = false; g.add(str);
      // handrail
      for (let i = 0; i <= 3; i++) {
        const p = props.cyl(0.025, 0.025, 1.0, darkMetal, { seg: 6, collide: false });
        p.position.set(sx * (width / 2 + 0.05), (rise * i) / 3, (run * i) / 3);
        g.add(p);
      }
      const rail = props.boxC(0.05, 0.05, Math.hypot(rise, run), darkMetal);
      rail.position.set(sx * (width / 2 + 0.05), rise / 2 + 1.0, run / 2);
      rail.rotation.x = -slope; rail.userData.collide = false; g.add(rail);
    }
    g.position.set(x, baseY, z);
    g.userData.run = run;
    return g;
  }

  for (const m of MODULES) {
    if (!m.extDoor) continue;
    const bx = m.extDoor.x;
    const g0 = gy(bx, m.cz + m.d / 2 + 5.2);
    const st = metalStair(bx, m.cz + m.d / 2 + 5.2, g0, DECK_Y, 1.5);
    st.rotation.y = Math.PI;
    ctx.addSolid(st);
    // landing
    const land = props.boxC(2.2, 0.16, 1.4, M.grate);
    land.position.set(bx, DECK_Y - 0.08, m.cz + m.d / 2 + 0.75);
    ctx.addSolid(land);
    const rl = props.railing(2.2, 1.0, darkMetal);
    rl.position.set(bx, DECK_Y, m.cz + m.d / 2 + 1.4);
    ctx.addDecor(rl);
    // door frame + a warm spill
    const dr = props.door(1.4, 2.3, M.rust, darkMetal);
    dr.position.set(bx, DECK_Y, m.cz + m.d / 2 - 0.1);
    dr.userData.open(m.id === 'gen' ? 0.35 : 0.0);
    ctx.add(dr);
    if (m.id === 'gen') { dr.userData.bang = true; ctx.onUpdate((dt, t) => { dr.userData.open(0.32 + Math.max(0, Math.sin(t * 0.9)) * 0.5); }); }
    const spill = props.boxC(1.2, 2.1, 0.02, mat.emissive(0xffb877, 1.4, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    spill.position.set(bx, DECK_Y + 1.1, m.cz + m.d / 2 + 0.06);
    ctx.addDecor(spill);
  }

  // Under-module gear + drifts (the hiding layer).
  {
    const underMat = mat.surface('wood', { color: 0x6d5433, repeat: 1, size: 256, planks: 4 });
    for (const m of MODULES) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const ux = m.cx + R.out.range(-m.w / 2 + 1, m.w / 2 - 1);
        const uz = m.cz + R.out.range(-m.d / 2 + 1, m.d / 2 - 1);
        const yy = gy(ux, uz);
        const kind = R.out.int(0, 3);
        let o;
        if (kind === 0) o = props.crate(R.out.range(0.7, 1.1), underMat);
        else if (kind === 1) o = props.barrel(0.32, 0.9, mat.surface('rustMetal', { repeat: 1, size: 256, color: 0x2f6a3f }));
        else if (kind === 2) o = props.pallet(1.2, 0.9);
        else o = props.boxC(1.6, 0.5, 0.9, underMat);
        o.position.set(ux, yy + (kind === 3 ? 0.25 : 0), uz);
        o.rotation.y = R.out.range(0, 6.28);
        ctx.add(o);
      }
      // a sledge and a coil of rope under each
      const sled = props.boxC(0.9, 0.12, 2.4, underMat);
      sled.position.set(m.cx + R.out.range(-3, 3), gy(m.cx, m.cz) + 0.24, m.cz + R.out.range(-2, 2));
      sled.rotation.y = R.out.range(0, 3); ctx.add(sled);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.07, 6, 16), mat.solid({ color: 0xc4a24a, roughness: 0.95 }));
      coil.rotation.x = Math.PI / 2;
      coil.position.set(m.cx + R.out.range(-4, 4), gy(m.cx, m.cz) + 0.08, m.cz + R.out.range(-3, 3));
      coil.userData.collide = false; ctx.addDecor(coil);

      ctx.hidingSpot(m.cx - m.w * 0.28, gy(m.cx - m.w * 0.28, m.cz), m.cz, 1.8, 1.0);
      ctx.hidingSpot(m.cx + m.w * 0.28, gy(m.cx + m.w * 0.28, m.cz), m.cz, 1.8, 1.0);
    }
  }

  // ---------------------------------------------------------------------------
  // 9. ICE TUNNELS  (y = -4) + ICE CAVE
  // ---------------------------------------------------------------------------
  const TUNNELS = [
    [-14, 12, -6, 12],     // stair tower -> junction
    [-6, 12.6, -6, -26],   // spine
    [-6, -6, 16, -6],      // east branch
    [16, -6, 16, -15.5],   // to the comms hatch pit
    [-6, -26, -16.6, -26], // to the lab stair
    [-6, 12, -6, 31],      // north, to the ice cave
  ];
  const tunnelBulbs = [];
  {
    const arch = new THREE.CylinderGeometry(TUN_HW, TUN_HW, 1, 12, 1, true, 0, Math.PI);
    for (const [x1, z1, x2, z2] of TUNNELS) {
      const len = Math.hypot(x2 - x1, z2 - z1) + 0.4;
      const ang = Math.atan2(x2 - x1, z2 - z1);
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const g = new THREE.Group();
      g.position.set(cx, 0, cz); g.rotation.y = ang;

      const floor = props.boxC(TUN_HW * 2 + 0.4, 0.4, len, M.ice);
      floor.position.set(0, TUN_Y - 0.2, 0); g.add(floor);
      for (const sx of [-1, 1]) {
        const w = props.boxC(0.4, TUN_WALL_TOP - TUN_Y, len, M.ice);
        w.position.set(sx * (TUN_HW + 0.2), (TUN_Y + TUN_WALL_TOP) / 2, 0); g.add(w);
      }
      const roof = new THREE.Mesh(arch, M.ice);
      roof.scale.set(1, len, 1);
      roof.rotation.x = Math.PI / 2;
      roof.rotation.z = Math.PI / 2;
      roof.position.set(0, TUN_WALL_TOP, 0);
      roof.castShadow = false; roof.receiveShadow = true; roof.userData.collide = true;
      g.add(roof);
      // a solid cap over the arch so no light or sky leaks through the snow
      const cap = props.boxC(TUN_HW * 2 + 0.8, 0.5, len, packedSnow);
      cap.position.set(0, TUN_WALL_TOP + TUN_HW + 0.24, 0); cap.userData.collide = true; g.add(cap);
      // carved ribs
      for (let t = -len / 2 + 1; t < len / 2; t += 2.2) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(TUN_HW + 0.05, 0.06, 5, 12, Math.PI), mat.solid({ color: 0x8fb6d6, roughness: 0.5 }));
        rib.rotation.y = Math.PI / 2; rib.position.set(0, TUN_WALL_TOP, t);
        rib.userData.collide = false; rib.castShadow = false; g.add(rib);
      }
      ctx.addSolid(g);

      // sagging string lights + ice-crusted crates
      const lights = new THREE.Group();
      lights.position.set(cx, 0, cz); lights.rotation.y = ang;
      const bm = animEmissive(0xffc078, 3.6);
      tunnelBulbs.push({ m: bm, ph: R.tun.range(0, 6.28), flick: R.tun.chance(0.4) });
      const bulbG = new THREE.SphereGeometry(0.05, 6, 5);
      const n = Math.max(2, Math.round(len / 3.2));
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (len * i) / n;
        const yy = TUN_WALL_TOP + 0.7 - Math.sin(((i % 3) / 3) * Math.PI) * 0.22;
        const b = new THREE.Mesh(bulbG, bm);
        b.position.set(0.7, yy - 0.12, t); b.userData.collide = false; b.castShadow = false;
        lights.add(b);
        if (i < n) {
          const t2 = -len / 2 + (len * (i + 1)) / n;
          const y2 = TUN_WALL_TOP + 0.7 - Math.sin((((i + 1) % 3) / 3) * Math.PI) * 0.22;
          const seg = props.boxC(0.014, 0.014, Math.hypot(t2 - t, y2 - yy), cable, { collide: false, shadow: false });
          seg.position.set(0.7, (yy + y2) / 2, (t + t2) / 2);
          seg.rotation.x = -Math.atan2(y2 - yy, t2 - t) + Math.PI / 2;
          lights.add(seg);
        }
      }
      ctx.addDecor(lights);

      for (let i = 0; i < Math.floor(len / 7); i++) {
        const t = R.tun.range(-len / 2 + 1.5, len / 2 - 1.5);
        const sx = R.tun.sign() * 1.15;
        const wx = cx + Math.sin(ang) * t + Math.cos(ang) * sx;
        const wz = cz + Math.cos(ang) * t - Math.sin(ang) * sx;
        const cr = props.crate(R.tun.range(0.6, 0.95), mat.surface('wood', { color: 0x6a5030, repeat: 1, size: 256, planks: 4 }));
        cr.position.set(wx, TUN_Y, wz); cr.rotation.y = R.tun.range(0, 6.28);
        ctx.add(cr);
        const crust = props.boxC(1.0, 0.1, 1.0, packedSnow);
        crust.position.set(wx, TUN_Y + 0.82, wz); crust.userData.collide = false;
        ctx.addDecor(crust);
      }
    }
    // Three real lights carry the tunnels; the rest is emissive + bloom.
    warmPoint(-6, TUN_Y + 2.0, 2, 2.6, 13, 0xffb877);                        // 18
    warmPoint(-6, TUN_Y + 2.0, -20, 2.2, 12, 0xffb877);                      // 19
    warmPoint(8, TUN_Y + 2.0, -6, 2.0, 12, 0xffb877);                        // 20

    ctx.hidingSpot(-6, TUN_Y, -16, 1.6, 1.0);
    ctx.hidingSpot(10, TUN_Y, -6, 1.6, 1.0);
    ctx.hidingSpot(-12, TUN_Y, -26, 1.5, 1.0);
  }

  // -- storage stair tower (module floor -> ground -> ice) --------------------
  {
    const tx = -13.5;
    const tower = new THREE.Group();
    // enclosing shaft walls, from the module underside down to the tunnel
    const shaftMat = M.steel;
    for (const [ox, oz, w, d] of [[0, -4.4, 6.4, 0.3], [0, 4.4, 6.4, 0.3], [-3.2, 0, 0.3, 8.8], [3.2, 0, 0.3, 8.8]]) {
      const wl = props.boxC(w, 8.2, d, shaftMat);
      wl.position.set(tx + ox, -0.3, 10.6 + oz);
      ctx.addSolid(wl);
    }
    // snow collar around the ragged terrain cut
    const collar = props.boxC(7.6, 0.7, 10.0, packedSnow);
    collar.position.set(tx, 0.05, 10.6);
    collar.userData.collide = false;
    const collarHole = props.boxC(6.2, 1.2, 8.6, invis);
    collarHole.visible = false;
    ctx.addDecor(collar);
    // flight A: deck (3.0) down to a landing (-0.6)
    const fa = metalStair(tx, 6.6, -0.6, DECK_Y, 2.0);
    ctx.addSolid(fa);
    const landing = props.boxC(4.4, 0.2, 2.0, M.grate);
    landing.position.set(tx, -0.7, 5.5); ctx.addSolid(landing);
    // flight B: landing down to the ice
    const fb = metalStair(tx, 12.6, TUN_Y, -0.6, 2.0);
    fb.rotation.y = Math.PI;
    ctx.addSolid(fb);
    const bottom = props.boxC(5.0, 0.3, 3.0, M.ice);
    bottom.position.set(tx, TUN_Y - 0.15, 11.6); ctx.addSolid(bottom);
    // cap the shaft so the storm doesn't pour in visually
    const lid = props.boxC(6.6, 0.2, 9.0, M.rust);
    lid.position.set(tx, DECK_Y + 0.4, 10.6); ctx.addSolid(lid);
    const sign = props.sign('ICE TUNNEL\n↓ -4 m', { background: 0x1c2a34, color: 0x8fd8ff, height: 0.6, fontSize: 64, emissive: 0x2f6f9c });
    sign.position.set(tx + 3.0, -1.6, 8.0); sign.rotation.y = -Math.PI / 2;
    ctx.addDecor(sign);
    warmPoint(tx, -1.4, 9.0, 2.2, 10, 0xffbe86);                             // 21
  }

  // -- lab stair (ice -> ground under the LAB) --------------------------------
  {
    const sx = -16;
    const st = metalStair(sx, -26.4, TUN_Y, 0, 1.8);
    st.rotation.y = Math.PI;
    ctx.addSolid(st);
    for (const [ox, oz, w, d] of [[0, 0, 0.3, 10.0], [0, 0, 0.3, 10.0]]) { void ox; void oz; void w; void d; }
    for (const s2 of [-1, 1]) {
      const wl = props.boxC(0.3, 4.6, 10.0, M.ice);
      wl.position.set(sx + s2 * 1.5, -2.0, -30.0);
      ctx.addSolid(wl);
    }
    const back = props.boxC(3.3, 4.6, 0.3, M.ice);
    back.position.set(sx, -2.0, -34.8); ctx.addSolid(back);
    const collar = props.boxC(4.6, 0.6, 11.0, packedSnow);
    collar.position.set(sx, 0.0, -30.0); collar.userData.collide = false;
    ctx.addDecor(collar);
    const rail = props.railing(4.0, 1.0, darkMetal);
    rail.position.set(sx, 0.2, -34.6); ctx.addDecor(rail);
  }

  // -- comms hatch pit + ladder ----------------------------------------------
  {
    const px = 16, pz = -16;
    for (const [ox, oz, w, d] of [[0, -3.0, 6.4, 0.4], [0, 3.0, 6.4, 0.4], [-3.0, 0, 0.4, 6.4], [3.0, 0, 0.4, 6.4]]) {
      const wl = props.boxC(w, 4.6, d, M.ice);
      wl.position.set(px + ox, -2.0, pz + oz);
      ctx.addSolid(wl);
    }
    const collar = props.boxC(7.6, 0.5, 7.6, packedSnow);
    collar.position.set(px, 0.05, pz); collar.userData.collide = false;
    ctx.addDecor(collar);
    const rim = props.boxC(7.0, 0.28, 7.0, hazardMat, { collide: false, shadow: false });
    rim.position.set(px, 0.32, pz); ctx.addDecor(rim);
    const lad = props.ladder(4.3, darkMetal);
    lad.position.set(px, TUN_Y, pz + 2.6);
    ctx.addSolid(lad);
    // stacked ice blocks so the pit is climbable both ways without a ladder hook
    for (let i = 0; i < 4; i++) {
      const b = props.boxC(1.6, 1.05, 1.2, M.ice);
      b.position.set(px - 2.0 + i * 0.15, TUN_Y + 0.52 + i * 1.0, pz - 2.2 + i * 0.9);
      ctx.addSolid(b);
    }
    ctx.hidingSpot(px, TUN_Y, pz, 1.6, 0.9);
  }

  // -- ice cave chamber -------------------------------------------------------
  {
    const cx = -6, cz = 34.5;
    const cave = new THREE.Group();
    cave.position.set(cx, 0, cz);
    const floor = props.boxC(15, 0.6, 12, M.ice);
    floor.position.set(0, CAVE_FLOOR - 0.3, 0); cave.add(floor);
    // irregular walls out of rotated slabs — reads as a natural void
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      // leave the north (crevasse) and south (tunnel) mouths open
      if (Math.abs(a - Math.PI / 2) < 0.42 || Math.abs(a - Math.PI * 1.5) < 0.34) continue;
      const r0 = 6.4 + R.tun.range(-0.5, 0.9);
      const wl = props.boxC(3.2, 5.6, 1.2, M.ice);
      wl.position.set(Math.sin(a) * r0, CAVE_FLOOR + 2.6, Math.cos(a) * r0);
      wl.rotation.y = -a + R.tun.range(-0.2, 0.2);
      wl.rotation.z = R.tun.range(-0.12, 0.12);
      cave.add(wl);
    }
    const roof = props.boxC(15, 0.8, 13, M.ice);
    roof.position.set(0, CAVE_FLOOR + 5.2, 0); cave.add(roof);
    ctx.addSolid(cave);

    // a fake daylight slot in the roof and blue bounce from the crevasse
    const slot = props.boxC(1.4, 0.1, 7.0, mat.emissive(0x9fd6ff, 2.6));
    slot.position.set(cx + 1.5, CAVE_FLOOR + 4.75, cz); slot.userData.collide = false;
    ctx.addDecor(slot);
    const beam = props.boxC(2.2, 5.0, 7.0, mat.emissive(0x8ec8f0, 0.5, { transparent: true, opacity: 0.13, side: THREE.DoubleSide }));
    beam.position.set(cx + 1.5, CAVE_FLOOR + 2.4, cz); beam.userData.collide = false;
    ctx.addDecor(beam);
    ctx.light(new THREE.PointLight(0x86c8f4, 3.4, 16, 1.8)).position.set(cx + 1.5, CAVE_FLOOR + 3.2, cz); // 22
    ctx.light(new THREE.PointLight(0x4f8fc4, 1.8, 14, 1.8)).position.set(cx, CAVE_FLOOR + 1.5, cz + 4);   // 23

    // ice pillars + frozen crates
    for (let i = 0; i < 5; i++) {
      const a = R.tun.range(0, 6.28), r0 = R.tun.range(2.4, 4.8);
      const pil = props.cyl(R.tun.range(0.25, 0.6), R.tun.range(0.4, 0.9), 5.2, deepIce, { seg: 8 });
      pil.position.set(cx + Math.sin(a) * r0, CAVE_FLOOR, cz + Math.cos(a) * r0);
      ctx.add(pil);
    }
    // ramp up to the crevasse mouth (cave floor -5.2 -> crevasse floor -6.2)
    const ramp = props.boxC(4.0, 0.5, 4.4, M.ice);
    ramp.position.set(cx, CAVE_FLOOR - 0.55, cz + 6.6); ramp.rotation.x = 0.24;
    ctx.addSolid(ramp);
    // ramp down from the tunnel spine (tunnel -4.0 -> cave -5.2)
    const ramp2 = props.boxC(3.4, 0.5, 4.6, M.ice);
    ramp2.position.set(cx, CAVE_FLOOR + 0.35, cz - 5.4); ramp2.rotation.x = -0.26;
    ctx.addSolid(ramp2);

    ctx.hidingSpot(cx - 4, CAVE_FLOOR, cz - 2, 1.8, 1.0);
    ctx.hidingSpot(cx + 4.5, CAVE_FLOOR, cz + 2, 1.6, 1.0);
  }

  // ---------------------------------------------------------------------------
  // 10. CREVASSE
  // ---------------------------------------------------------------------------
  {
    const X0 = -47.6, X1 = 25.6, Z0 = 39.4, Z1 = 48.6;
    const g = new THREE.Group();
    // walls
    const nWall = props.boxC(X1 - X0, 7.2, 0.8, M.ice);
    nWall.position.set((X0 + X1) / 2, CREV_FLOOR + 3.6, Z0); g.add(nWall);
    const sWall = props.boxC(X1 - X0, 7.2, 0.8, M.ice);
    sWall.position.set((X0 + X1) / 2, CREV_FLOOR + 3.6, Z1); g.add(sWall);
    const wWall = props.boxC(0.8, 7.2, Z1 - Z0, M.ice);
    wWall.position.set(X0, CREV_FLOOR + 3.6, (Z0 + Z1) / 2); g.add(wWall);
    const eWall = props.boxC(0.8, 7.2, Z1 - Z0, M.ice);
    eWall.position.set(X1, CREV_FLOOR + 3.6, (Z0 + Z1) / 2); g.add(eWall);
    const floor = props.boxC(X1 - X0, 0.8, Z1 - Z0, M.ice);
    floor.position.set((X0 + X1) / 2, CREV_FLOOR - 0.4, (Z0 + Z1) / 2); g.add(floor);
    ctx.addSolid(g);

    // Cornices: overhanging snow lips that narrow the visible crack and give
    // you something to stand on at the edge.
    const corn = new THREE.Group();
    for (let x = X0 + 2; x < X1 - 2; x += 3.4) {
      for (const [zEdge, dir] of [[Z0, 1], [Z1, -1]]) {
        const depth = 1.6 + noise.fbm(x * 0.12, zEdge * 0.1, 3) * 1.4;
        const lip = props.boxC(3.5, 0.5, depth, packedSnow);
        lip.position.set(x, -0.1, zEdge + dir * depth / 2);
        lip.rotation.x = dir * 0.05;
        corn.add(lip);
      }
    }
    ctx.addSolid(corn);

    // Ramp down at the west end.
    const ramp = props.boxC(5.0, 0.6, 17.0, packedSnow);
    ramp.position.set(X0 + 8.5, CREV_FLOOR / 2 - 0.1, 44);
    ramp.rotation.z = Math.atan2(CREV_FLOOR + 0.6, 17.0);
    // rotate about Z gives a slope along X — orient the long axis along X instead
    ramp.rotation.set(0, Math.PI / 2, Math.atan2(-(CREV_FLOOR + 0.4), 17.0));
    ctx.addSolid(ramp);

    // The hidden ledge, 3.4 m down the north wall.
    const ledge = props.boxC(15, 0.6, 3.0, M.ice);
    ledge.position.set(-4, -2.9, Z0 + 1.6); ctx.addSolid(ledge);
    const ledgeRoof = props.boxC(15, 0.5, 3.4, packedSnow);
    ledgeRoof.position.set(-4, 0.2, Z0 + 1.7); ctx.addSolid(ledgeRoof);
    const ledgeRamp = props.boxC(3.0, 0.5, 9.0, M.ice);
    ledgeRamp.position.set(-13.5, -4.6, Z0 + 2.6);
    ledgeRamp.rotation.x = Math.atan2(3.3, 9.0) * -1;
    ctx.addSolid(ledgeRamp);
    ctx.hidingSpot(-4, -2.6, Z0 + 1.6, 2.4, 1.0);
    ctx.hidingSpot(-24, CREV_FLOOR, 44, 2.0, 1.0);

    // Plank bridge across, at x = 10.
    {
      const br = new THREE.Group();
      const plankMat = mat.surface('wood', { color: 0x6a4c2c, repeat: 1, size: 256, planks: 3 });
      for (let i = 0; i < 7; i++) {
        const p = props.boxC(0.34, 0.09, 9.6, plankMat);
        p.position.set(10 - 1.05 + i * 0.35, 0.2, 44);
        p.rotation.z = R.out.range(-0.01, 0.01);
        br.add(p);
      }
      for (const sx of [-1.4, 1.4]) {
        const beam = props.boxC(0.16, 0.2, 9.8, darkMetal);
        beam.position.set(10 + sx, 0.08, 44); br.add(beam);
      }
      ctx.addSolid(br);
      for (const sx of [-1.5, 1.5]) {
        for (let i = 0; i <= 4; i++) {
          const post = props.cyl(0.035, 0.035, 1.0, darkMetal, { seg: 6, collide: false });
          post.position.set(10 + sx, 0.25, 39.8 + i * 2.1);
          ctx.addDecor(post);
        }
        const rope = props.boxC(0.03, 0.03, 8.6, mat.solid({ color: 0xd8c07a, roughness: 0.95 }));
        rope.position.set(10 + sx, 1.15, 44); rope.userData.collide = false;
        ctx.addDecor(rope);
      }
      const warn = props.sign('CREVASSE\nROPE UP', { background: 0xe8b32a, color: 0x1a1a1a, height: 0.7, fontSize: 72 });
      warn.position.set(10, 1.5, 37.6); ctx.addDecor(warn);
    }

    // Blue depth glow so the crack reads from above through the storm.
    const glow = props.boxC(X1 - X0 - 2, 0.1, Z1 - Z0 - 2, mat.emissive(0x2f6f9c, 1.2));
    glow.position.set((X0 + X1) / 2, CREV_FLOOR + 0.4, (Z0 + Z1) / 2);
    glow.userData.collide = false; ctx.addDecor(glow);
    ctx.light(new THREE.PointLight(0x6fb4e4, 3.0, 26, 1.6)).position.set(-6, -3.5, 44); // 24
  }

  // ---------------------------------------------------------------------------
  // 11. OUTDOOR LANDMARKS
  // ---------------------------------------------------------------------------
  const turbines = [];

  // -- 11a. Mast, guy wires, wind turbine, service platform --------------------
  {
    const MX = 58, MZ = -34;
    const base = gy(MX, MZ);
    const mast = new THREE.Group();
    mast.position.set(MX, base, MZ);
    for (let i = 0; i < 3; i++) {
      const sec = props.cyl(0.16 - i * 0.03, 0.2 - i * 0.03, 6, darkMetal, { seg: 8 });
      sec.position.y = i * 6; mast.add(sec);
      // lattice braces
      for (let j = 0; j < 4; j++) {
        const br = props.boxC(0.06, 0.06, 1.5, darkMetal);
        br.position.set(0, i * 6 + 1.4 + j * 1.4, 0);
        br.rotation.set(0, (j * Math.PI) / 2, 0.5);
        br.userData.collide = false; mast.add(br);
      }
    }
    // switchback service stair to a platform at 6.5 m
    ctx.addSolid(metalStair(MX - 2.4, MZ - 4.2, base, 3.2, 1.1));
    const mid = props.boxC(2.6, 0.16, 1.6, M.grate);
    mid.position.set(MX - 2.4, base + 3.28, MZ + 0.4); ctx.addSolid(mid);
    const up2 = metalStair(MX - 2.4, MZ + 1.0, base + 3.2, base + 6.5, 1.1);
    up2.rotation.y = Math.PI; ctx.addSolid(up2);
    const plat = props.boxC(4.2, 0.16, 4.2, M.grate);
    plat.position.set(MX, base + 6.58, MZ - 1.6); ctx.addSolid(plat);
    for (const [rx, rz, ry] of [[0, -2.0, 0], [0, 0.4, 0], [-2.0, -1.0, Math.PI / 2], [2.0, -1.0, Math.PI / 2]]) {
      const rl = props.railing(4.0, 1.05, darkMetal);
      rl.position.set(MX + rx, base + 6.66, MZ - 1.6 + rz); rl.rotation.y = ry;
      ctx.addDecor(rl);
    }
    // beacon
    const beacon = animEmissive(0xff2a1a, 6.0);
    const bl = props.sphere(0.16, beacon, { seg: 10, collide: false });
    bl.position.set(MX, base + 18.1, MZ); ctx.addDecor(bl);
    genShake.push({ m: beacon, beacon: true });
    ctx.light(new THREE.PointLight(0xff4a30, 2.4, 14, 1.8)).position.set(MX, base + 18, MZ); // 25 -> trimmed below

    // guy wires
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const ax = MX + Math.cos(a) * 13, az = MZ + Math.sin(a) * 13;
      const ay = gy(ax, az);
      const len = Math.hypot(13, 15 - ay);
      const w = props.cyl(0.02, 0.02, len, cable, { seg: 4, collide: false, shadow: false });
      const g0 = new THREE.Group();
      g0.position.set(MX, base + 15, MZ);
      w.position.y = -len;
      g0.add(w);
      g0.lookAt(ax, ay, az);
      g0.rotateX(Math.PI / 2);
      // simpler: build the wire as a box between two points
      g0.clear();
      const seg = props.boxC(0.03, 0.03, len, cable, { collide: false, shadow: false });
      seg.position.set((MX + ax) / 2 - MX, (base + 15 + ay) / 2 - (base + 15), (MZ + az) / 2 - MZ);
      seg.lookAt(new THREE.Vector3(ax - MX, ay - base - 15, az - MZ));
      g0.add(seg);
      ctx.addDecor(g0);
      const anchor = props.boxC(0.5, 0.5, 0.5, darkMetal);
      anchor.position.set(ax, ay + 0.2, az); ctx.add(anchor);
    }
    ctx.add(mast);

    // wind turbine on its own short tower next to the mast
    const TX = 50, TZ = -26, tb = gy(TX, TZ);
    const tower = props.cyl(0.22, 0.34, 9, M.steel, { seg: 10 });
    tower.position.set(TX, tb, TZ); ctx.addSolid(tower);
    const nac = props.boxC(0.7, 0.6, 1.6, mat.solid({ color: 0xd8dce0, roughness: 0.5 }));
    nac.position.set(TX, tb + 9.2, TZ); nac.userData.collide = false; ctx.addDecor(nac);
    const rotor = new THREE.Group();
    rotor.position.set(TX, tb + 9.25, TZ - 0.9);
    for (let i = 0; i < 3; i++) {
      const blade = props.boxC(0.16, 3.4, 0.05, mat.solid({ color: 0xeef2f5, roughness: 0.4 }));
      blade.position.set(0, 1.7, 0);
      const arm = new THREE.Group();
      arm.rotation.z = (i / 3) * Math.PI * 2;
      arm.add(blade);
      rotor.add(arm);
    }
    const hub = props.sphere(0.22, mat.solid({ color: 0xc8ccd0, roughness: 0.5 }), { seg: 10, collide: false });
    hub.position.y = -0.22; rotor.add(hub);
    ctx.addDecor(rotor);
    turbines.push(rotor);
  }

  // -- 11b. Antenna array ------------------------------------------------------
  {
    const AX = 46, AZ = 34;
    for (let i = 0; i < 6; i++) {
      const ax = AX + (i % 3) * 6, az = AZ + Math.floor(i / 3) * 7;
      const ay = gy(ax, az);
      const pole = props.cyl(0.08, 0.11, 5 + (i % 3), darkMetal, { seg: 8 });
      pole.position.set(ax, ay, az); ctx.addSolid(pole);
      for (let j = 0; j < 5; j++) {
        const el = props.boxC(1.6 - j * 0.2, 0.04, 0.04, darkMetal);
        el.position.set(ax, ay + 2.2 + j * 0.6, az); el.userData.collide = false;
        ctx.addDecor(el);
      }
      if (i % 2 === 0) {
        const dish = props.cyl(0.9, 0.15, 0.35, mat.solid({ color: 0xdde2e6, roughness: 0.55 }), { seg: 14, open: true, collide: false });
        dish.position.set(ax, ay + 3.4, az); dish.rotation.x = -0.9;
        ctx.addDecor(dish);
      }
    }
    ctx.hidingSpot(AX + 6, gy(AX + 6, AZ + 3.5), AZ + 3.5, 1.8, 0.7);
  }

  // -- 11c. Buried Snowcat -----------------------------------------------------
  {
    const SX = -66, SZ = 22, sy = gy(SX, SZ);
    const cat = new THREE.Group();
    cat.position.set(SX, sy - 0.9, SZ); cat.rotation.y = 0.7;
    const body = props.boxC(3.2, 1.6, 6.0, mat.surface('metalPanel', { color: 0xc0521e, repeat: 1, size: 256, panels: 3 }));
    body.position.y = 1.3; cat.add(body);
    const cab = props.boxC(2.6, 1.5, 2.4, mat.solid({ color: 0xa8441a, roughness: 0.5 }));
    cab.position.set(0, 2.7, -0.8); cat.add(cab);
    const glassM = mat.glassCheap({ color: 0x1c2a34, opacity: 0.5 });
    for (const [gx, gz, gw, gd, ry] of [[0, -2.02, 2.2, 0.05, 0], [-1.32, -0.8, 0.05, 2.0, 0], [1.32, -0.8, 0.05, 2.0, 0]]) {
      const gl = props.boxC(gw, 1.0, gd, glassM);
      gl.position.set(gx, 2.8, gz - 0.0); gl.rotation.y = ry; gl.userData.collide = false;
      cat.add(gl);
    }
    for (const sx of [-1.7, 1.7]) {
      const tr = props.boxC(0.9, 1.1, 5.6, mat.solid({ color: 0x25282b, roughness: 0.95 }));
      tr.position.set(sx, 0.55, 0.2); cat.add(tr);
    }
    const blade = props.boxC(4.2, 1.0, 0.3, M.rust);
    blade.position.set(0, 0.9, -3.4); blade.rotation.x = 0.2; cat.add(blade);
    ctx.addSolid(cat);
    const bury = props.sphere(4.2, packedSnow, { seg: 16, collide: false, shadow: false });
    bury.position.set(SX + 1.5, sy - 1.9, SZ + 1.2); bury.scale.set(1.4, 0.55, 1.1);
    ctx.addDecor(bury);
    ctx.hidingSpot(SX - 2.4, sy, SZ + 2, 1.8, 1.0);
  }

  // -- 11d. Collapsed geodesic dome -------------------------------------------
  {
    const DX = -68, DZ = -46, dyc = gy(DX, DZ);
    const strutM = mat.metal(0x9aa4ad, 0.5);
    const dome = new THREE.Group();
    dome.position.set(DX, dyc, DZ);
    const pts = [];
    for (let ring = 0; ring < 3; ring++) {
      const phi = (ring + 1) / 4 * (Math.PI / 2);
      const n = 8 + ring * 2;
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2;
        const collapse = (ring >= 1 && th > 2.2 && th < 4.6) ? 0.25 : 1.0;
        pts.push([Math.cos(th) * Math.cos(phi) * 8, Math.sin(phi) * 6 * collapse, Math.sin(th) * Math.cos(phi) * 8]);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (len > 7) continue;
      const s = props.boxC(0.09, 0.09, len, strutM);
      s.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      s.lookAt(new THREE.Vector3(b[0], b[1], b[2]));
      s.userData.collide = false;
      dome.add(s);
      if (i % 3 === 0 && a[1] > 0.6) {
        const panel = props.boxC(2.2, 0.05, 2.2, mat.solid({ color: 0xe4ecf2, roughness: 0.6, transparent: true, opacity: 0.55 }));
        panel.position.set(a[0] * 0.9, a[1] * 0.9, a[2] * 0.9);
        panel.lookAt(0, 0, 0); panel.userData.collide = false;
        dome.add(panel);
      }
    }
    ctx.addDecor(dome);
    // rubble + a drifted-in interior you can hide in
    const rb = props.rubble(5, 16, mat.solid({ color: 0xcfdae6, roughness: 0.7, flat: true }), 77);
    rb.position.set(DX, dyc, DZ); ctx.add(rb);
    ctx.hidingSpot(DX, dyc, DZ, 2.6, 1.0);
  }

  // -- 11e. Fuel bladders + drum graveyard ------------------------------------
  {
    for (let i = 0; i < 4; i++) {
      const bx = 62 + (i % 2) * 9, bz = 12 + Math.floor(i / 2) * 8;
      const by = gy(bx, bz);
      const bl = props.sphere(2.6, mat.solid({ color: 0x1f2a30, roughness: 0.85 }), { seg: 16 });
      bl.position.set(bx, by - 1.55, bz); bl.scale.set(1.5, 0.32, 1.1);
      ctx.addSolid(bl);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.05, 5, 18), darkMetal);
      strap.rotation.x = Math.PI / 2; strap.position.set(bx, by + 0.35, bz);
      strap.scale.set(1.6, 1.15, 1); strap.userData.collide = false;
      ctx.addDecor(strap);
    }
    // graveyard of drums — instanced
    const drumGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.88, 12);
    drumGeo.translate(0, 0.44, 0);
    const drumMat = mat.surface('rustMetal', { color: 0x6b4a24, rust: 0x8a4318, repeat: 1, size: 256 });
    const drums = props.scatter(drumGeo, drumMat, 96, (i, dm, r) => {
      const a = r() * 6.28, d0 = Math.sqrt(r()) * 13;
      const x = -66 + Math.cos(a) * d0, z = -12 + Math.sin(a) * d0 * 0.8;
      const fallen = r.chance(0.45);
      dm.position.set(x, gy(x, z) - r.range(0, 0.25), z);
      if (fallen) { dm.rotation.set(Math.PI / 2, r() * 6.28, r.range(-0.3, 0.3)); dm.position.y += 0.3; }
      else dm.rotation.y = r() * 6.28;
      dm.scale.setScalar(r.range(0.92, 1.08));
    }, 404);
    ctx.addDecor(drums);
    // a few collidable ones so the pile isn't a ghost
    for (let i = 0; i < 10; i++) {
      const a = R.out.range(0, 6.28), d0 = Math.sqrt(R.out()) * 12;
      const x = -66 + Math.cos(a) * d0, z = -12 + Math.sin(a) * d0 * 0.8;
      const b = props.barrel(0.31, 0.88, drumMat);
      b.position.set(x, gy(x, z), z); ctx.add(b);
    }
    ctx.hidingSpot(-66, gy(-66, -12), -12, 2.6, 1.0);
    ctx.hidingSpot(66, gy(66, 12), 12, 2.0, 0.8);
  }

  // -- 11f. Swinging exterior lamp + a torn tarp on a frame -------------------
  const swingers = [];
  {
    const lx = -30, lz = 2, ly = gy(lx, lz);
    const post = props.cyl(0.1, 0.13, 4.6, darkMetal, { seg: 8 });
    post.position.set(lx, ly, lz); ctx.addSolid(post);
    const arm = props.boxC(1.4, 0.08, 0.08, darkMetal);
    arm.position.set(lx + 0.7, ly + 4.5, lz); arm.userData.collide = false; ctx.addDecor(arm);
    const pivot = new THREE.Group();
    pivot.position.set(lx + 1.35, ly + 4.45, lz);
    const shade = props.cyl(0.3, 0.14, 0.3, darkMetal, { seg: 12, open: true, collide: false });
    shade.position.y = -0.3; shade.rotation.x = Math.PI; pivot.add(shade);
    const bulb = props.sphere(0.1, animEmissive(0xffcf8a, 7.0), { seg: 10, collide: false });
    bulb.position.y = -0.38; pivot.add(bulb);
    ctx.addDecor(pivot);
    swingers.push({ o: pivot, amp: 0.28, sp: 1.35 });
    const lamp = new THREE.PointLight(0xffc182, 3.0, 15, 1.7);
    lamp.position.set(lx + 1.35, ly + 4.05, lz);
    ctx.light(lamp);                                                          // 25
    swingers.push({ light: lamp, ox: lx + 1.35, oy: ly + 4.05, oz: lz, amp: 0.28, sp: 1.35 });

    // torn tarp over a frame near the storage module
    const fx = 12, fz = 22, fy = gy(fx, fz);
    for (const sx of [-2.2, 2.2]) {
      const p = props.cyl(0.07, 0.09, 2.4, darkMetal, { seg: 6 });
      p.position.set(fx + sx, fy, fz); ctx.addSolid(p);
    }
    const beam = props.boxC(4.6, 0.09, 0.09, darkMetal);
    beam.position.set(fx, fy + 2.4, fz); ctx.addDecor(beam);
    const tp = new THREE.Group();
    tp.position.set(fx, fy + 2.38, fz);
    const cloth = props.boxC(4.2, 2.0, 0.02, tarpMat, { collide: false, shadow: false });
    cloth.position.set(0, -1.0, 0); tp.add(cloth);
    ctx.addDecor(tp);
    swingers.push({ o: tp, amp: 0.16, sp: 2.6, axis: 'x' });
    ctx.hidingSpot(fx, fy, fz, 1.6, 0.7);
  }

  // -- 11g. Orange route flags (instanced) ------------------------------------
  {
    const route = [
      [-42, 4], [-40, -2], [-34, -6], [-26, -4], [-18, 0], [-12, 4], [-8, 12],
      [0, 16], [8, 18], [16, 16], [24, 12], [30, 8], [34, 2], [30, -6], [24, -12],
      [16, -14], [8, -18], [0, -22], [-8, -26], [-16, -28], [-24, -26], [-32, -22],
      [-38, -16], [-40, -8], [-2, 24], [-4, 30], [-6, 36], [4, 38], [12, 36],
      [-52, 10], [-58, 16], [-62, 22], [-70, -6], [-66, -14], [40, -20], [48, -26],
      [54, -30], [52, 4], [58, 10], [64, 14],
    ];
    const poleGeo = new THREE.CylinderGeometry(0.028, 0.028, 2.1, 5);
    poleGeo.translate(0, 1.05, 0);
    const poles = props.scatter(poleGeo, mat.solid({ color: 0x2b2f33, roughness: 0.8 }), route.length, (i, dm) => {
      const [x, z] = route[i];
      dm.position.set(x, gy(x, z) - 0.1, z);
      dm.rotation.z = noise.fbm(x * 0.3, z * 0.3, 2) * 0.14;
    }, 55);
    ctx.addDecor(poles);
    const flagGeo = new THREE.PlaneGeometry(0.44, 0.3);
    flagGeo.translate(0.22, 0, 0);
    const flags = props.scatter(flagGeo, flagMat, route.length, (i, dm, r) => {
      const [x, z] = route[i];
      dm.position.set(x + 0.02, gy(x, z) + 1.85, z);
      dm.rotation.y = r.range(-0.5, 0.5) + 1.9;
    }, 56);
    flags.castShadow = false;
    ctx.addDecor(flags);
  }

  // ---------------------------------------------------------------------------
  // 12. DETAIL PASS — snow accumulation, drifts, icicles
  // ---------------------------------------------------------------------------

  // 12a. Snow slabs on every roof / tube top / ledge.
  for (const [x, y, z, w, d, ang] of snowCapJobs) {
    const capW = ang !== undefined ? w : w;
    const cap = props.boxC(capW, 0.24, d, packedSnow, { collide: false, shadow: false });
    cap.position.set(x, y, z);
    if (ang !== undefined) cap.rotation.y = ang;
    ctx.addDecor(cap);
    // a second, wind-sculpted lump on top
    const lump = props.sphere(Math.min(w, d) * 0.4, packedSnow, { seg: 12, collide: false, shadow: false });
    lump.position.set(x + w * 0.1, y - 0.05, z);
    lump.scale.set(1.6, 0.22, 1.0);
    if (ang !== undefined) lump.rotation.y = ang;
    ctx.addDecor(lump);
  }

  // 12b. Drifts — instanced half-ellipsoids banked against every windward wall.
  {
    const driftGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const anchors = [];
    for (const m of MODULES) {
      // wind blows from -X/+Z, so bank drifts on the +X and -Z faces
      for (let i = 0; i < 9; i++) {
        anchors.push([m.cx + m.w / 2 + 0.6, m.cz - m.d / 2 + (i / 8) * m.d, 0]);
        anchors.push([m.cx - m.w / 2 + (i / 8) * m.w, m.cz - m.d / 2 - 0.6, 1]);
      }
    }
    for (const t of tubeSegs) {
      for (let i = 0; i <= 6; i++) {
        const q = i / 6;
        anchors.push([t.ax + (t.bx - t.ax) * q + 2.2, t.az + (t.bz - t.az) * q, 0]);
      }
    }
    const drifts = props.scatter(driftGeo, packedSnow, anchors.length + 220, (i, dm, r) => {
      let x, z, along;
      if (i < anchors.length) {
        const a = anchors[i];
        x = a[0] + r.range(-1.0, 1.0); z = a[1] + r.range(-1.0, 1.0); along = a[2];
      } else {
        x = r.range(-BOUND_X + 5, BOUND_X - 5); z = r.range(-BOUND_Z + 5, BOUND_Z - 5);
        if (inHole(x, z)) return false;
        along = r.int(0, 1);
      }
      const sx = r.range(2.5, 7.0), sz = r.range(1.6, 4.0), sy = r.range(0.5, 1.5);
      dm.position.set(x, gy(x, z) - sy * 0.35, z);
      dm.rotation.y = along ? r.range(-0.35, 0.35) : Math.PI / 2 + r.range(-0.35, 0.35);
      dm.scale.set(sx, sy, sz);
    }, 909);
    ctx.addDecor(drifts);

    // A handful of drifts big enough to actually hide behind.
    for (let i = 0; i < 8; i++) {
      const a = R.detail.range(0, 6.28), d0 = R.detail.range(24, 70);
      const x = Math.cos(a) * d0, z = Math.sin(a) * d0 * 0.85;
      if (inHole(x, z)) continue;
      const dr = props.sphere(3.4, packedSnow, { seg: 14 });
      dr.position.set(x, gy(x, z) - 1.5, z);
      dr.scale.set(1.8, 0.7, 1.1);
      dr.rotation.y = R.detail.range(0, 3);
      ctx.addSolid(dr);
      ctx.hidingSpot(x - 2.5, gy(x - 2.5, z), z, 2.0, 0.9);
    }
  }

  // 12c. Icicles hanging off every eave.
  {
    const ic = new THREE.ConeGeometry(0.055, 0.62, 5);
    ic.rotateX(Math.PI);
    ic.translate(0, -0.31, 0);
    const iceMat = mat.solid({ color: 0xcfe6f7, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.85 });
    const icicles = props.scatter(ic, iceMat, 520, (i, dm, r) => {
      const e = eaveLines[i % eaveLines.length];
      const t = r();
      const x = e[0] + (e[2] - e[0]) * t, z = e[1] + (e[3] - e[1]) * t;
      dm.position.set(x, e[4] + 0.12, z);
      dm.scale.set(r.range(0.6, 1.5), r.range(0.5, 2.4), r.range(0.6, 1.5));
      dm.rotation.y = r() * 6.28;
    }, 1212);
    icicles.castShadow = false;
    ctx.addDecor(icicles);
  }

  // 12d. Cable runs stapled along the module flanks + rust streaks.
  for (const m of MODULES) {
    const run = props.boxC(m.w + 0.4, 0.06, 0.06, cable, { collide: false, shadow: false });
    run.position.set(m.cx, DECK_Y + 2.55, m.cz + m.d / 2 + 0.2);
    ctx.addDecor(run);
    for (let i = 0; i < 6; i++) {
      const drop = props.boxC(0.05, 0.9, 0.05, cable, { collide: false, shadow: false });
      drop.position.set(m.cx - m.w / 2 + 1.5 + i * (m.w - 3) / 5, DECK_Y + 2.1, m.cz + m.d / 2 + 0.2);
      ctx.addDecor(drop);
    }
    const streakMat = mat.solid({ color: 0x5a3418, roughness: 0.95, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 5; i++) {
      const st = props.boxC(0.22, R.detail.range(0.8, 2.2), 0.01, streakMat, { collide: false, shadow: false });
      st.position.set(m.cx + R.detail.range(-m.w / 2 + 1, m.w / 2 - 1), DECK_Y + 1.6, m.cz + m.d / 2 + 0.17);
      ctx.addDecor(st);
    }
  }

  // ---------------------------------------------------------------------------
  // 13. BLIZZARD
  // ---------------------------------------------------------------------------
  const WIND = new THREE.Vector3(-11.5, -1.4, 5.0);
  const camPos = new THREE.Vector3(-42, 1.6, 4);
  let camReady = false;
  {
    const FULL = ctx.lod >= 2 ? 3000 : (ctx.lod >= 1 ? 1900 : 1100);
    const flakeGeo = props.billboardCross(0.05, 0.7);
    flakeGeo.rotateZ(1.18);                                   // lay the streak over
    flakeGeo.rotateY(Math.atan2(WIND.x, WIND.z));             // align it with the wind
    const flakeMat = mat.painted(32, 32, (c, W, H) => {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.4, 'rgba(246,251,255,0.95)');
      g.addColorStop(0.65, 'rgba(240,248,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(W * 0.28, 0, W * 0.44, H);
    }, { transparent: true, alphaTest: 0.04, depthWrite: false, roughness: 1, emissive: 0xa8c0d8, emissiveIntensity: 0.55 });

    const CX = 46, CY = 30, CZ = 46, HX = CX / 2, HY = CY / 2, HZ = CZ / 2;
    const snowMesh = new THREE.InstancedMesh(flakeGeo, flakeMat, FULL);
    snowMesh.frustumCulled = false;
    snowMesh.castShadow = false; snowMesh.receiveShadow = false;
    snowMesh.userData.collide = false;
    snowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const px = new Float32Array(FULL), py = new Float32Array(FULL), pz = new Float32Array(FULL);
    const ps = new Float32Array(FULL), pw = new Float32Array(FULL);
    const arr = snowMesh.instanceMatrix.array;
    for (let i = 0; i < FULL; i++) {
      px[i] = camPos.x + R.snow.range(-HX, HX);
      py[i] = camPos.y + R.snow.range(-HY, HY);
      pz[i] = camPos.z + R.snow.range(-HZ, HZ);
      ps[i] = R.snow.range(0.5, 2.1);
      pw[i] = R.snow.range(0.75, 1.35);
      const o = i * 16;
      arr[o] = ps[i]; arr[o + 5] = ps[i]; arr[o + 10] = ps[i]; arr[o + 15] = 1;
    }
    snowMesh.instanceMatrix.needsUpdate = true;
    snowMesh.onBeforeRender = (r, s, cam) => {
      if (cam && cam.isPerspectiveCamera) { camPos.setFromMatrixPosition(cam.matrixWorld); camReady = true; }
    };
    ctx.add(snowMesh);

    // Shelter test — inside a module, inside a tube, or down in the ice.
    function sheltered(p) {
      if (p.y < -1.4) return true;
      if (p.y > DECK_Y - 0.4 && p.y < ROOF_Y + 0.4) {
        for (const m of MODULES) {
          if (Math.abs(p.x - m.cx) < m.w / 2 && Math.abs(p.z - m.cz) < m.d / 2) return true;
        }
        for (const t of tubeSegs) {
          const dx = t.bx - t.ax, dz = t.bz - t.az;
          const L2 = dx * dx + dz * dz;
          let u = ((p.x - t.ax) * dx + (p.z - t.az) * dz) / L2;
          u = Math.max(0, Math.min(1, u));
          const qx = t.ax + dx * u, qz = t.az + dz * u;
          if (Math.hypot(p.x - qx, p.z - qz) < 1.7) return true;
        }
      }
      return false;
    }

    ctx.onUpdate((dt, t) => {
      if (!camReady) return;
      const gust = 1 + Math.sin(t * 0.31) * 0.42 + Math.sin(t * 1.63 + 1.1) * 0.16;
      const wx = WIND.x * gust, wz = WIND.z * gust, wy = WIND.y;
      const inside = sheltered(camPos);
      for (let i = 0; i < FULL; i++) {
        const k = pw[i];
        let x = px[i] + wx * k * dt;
        let y = py[i] + wy * k * dt;
        let z = pz[i] + wz * k * dt;
        let d = x - camPos.x; if (d > HX) x -= CX; else if (d < -HX) x += CX;
        d = z - camPos.z; if (d > HZ) z -= CZ; else if (d < -HZ) z += CZ;
        d = y - camPos.y; if (d > HY) y -= CY; else if (d < -HY) y += CY;
        px[i] = x; py[i] = y; pz[i] = z;
        const o = i * 16;
        arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z;
      }
      snowMesh.count = inside ? Math.floor(FULL * 0.08) : FULL;
      snowMesh.instanceMatrix.needsUpdate = true;
    });

    // Local snow column falling through the generator roof hole.
    const holeSnow = props.scatter(flakeGeo, flakeMat, 90, (i, dm, r) => {
      dm.position.set(MOD.gen.cx - 3.5 + r.range(-1.4, 1.4), F + r.range(0, ROOM_H), MOD.gen.cz + 3.0 + r.range(-1.4, 1.4));
      dm.scale.setScalar(r.range(0.6, 1.4));
    }, 1717);
    holeSnow.castShadow = false;
    ctx.addDecor(holeSnow);
    const hsBase = [];
    for (let i = 0; i < holeSnow.count; i++) {
      const mtx = new THREE.Matrix4(); holeSnow.getMatrixAt(i, mtx);
      hsBase.push([mtx.elements[12], mtx.elements[13], mtx.elements[14], mtx.elements[0]]);
    }
    ctx.onUpdate((dt, t) => {
      const a = holeSnow.instanceMatrix.array;
      for (let i = 0; i < hsBase.length; i++) {
        const b = hsBase[i];
        const yy = F + (((b[1] - F) - t * 1.4 * (0.6 + (i % 7) * 0.1)) % ROOM_H + ROOM_H) % ROOM_H;
        const o = i * 16;
        a[o + 12] = b[0] + Math.sin(t * 0.8 + i) * 0.25;
        a[o + 13] = yy;
        a[o + 14] = b[2] + Math.cos(t * 0.7 + i) * 0.25;
      }
      holeSnow.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------------------
  // 13b. ANIMATION — turbine, swings, flicker, generator shudder
  // ---------------------------------------------------------------------------
  ctx.onUpdate((dt, t) => {
    for (const r of turbines) r.rotation.z += dt * 1.9;
    for (const s of swingers) {
      const v = Math.sin(t * s.sp) * s.amp + Math.sin(t * s.sp * 2.3) * s.amp * 0.25;
      if (s.o) { if (s.axis === 'x') s.o.rotation.x = v; else s.o.rotation.z = v; }
      if (s.light) s.light.position.set(s.ox + v * 1.1, s.oy, s.oz);
    }
    for (const b of tunnelBulbs) {
      const base = b.m.userData.base;
      b.m.emissiveIntensity = b.flick
        ? base * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 11 + b.ph)) * (Math.sin(t * 1.7 + b.ph) > -0.7 ? 1 : 0.15))
        : base * (0.9 + 0.1 * Math.sin(t * 1.3 + b.ph));
    }
    for (const g of genShake) {
      if (g.o) {
        g.o.position.x = g.x + Math.sin(t * 34 + g.ph) * (g.live ? 0.012 : 0);
        g.o.position.y = Math.sin(t * 41 + g.ph) * (g.live ? 0.008 : 0);
      }
      if (g.m) {
        g.m.emissiveIntensity = g.beacon
          ? g.m.userData.base * (Math.sin(t * 2.4) > 0.6 ? 1.6 : 0.12)
          : g.m.userData.base * (0.75 + 0.25 * Math.sin(t * 3.1));
      }
    }
    beaconMat.emissiveIntensity = 2.6 * (0.94 + 0.06 * Math.sin(t * 0.9));
  });

  // COMMS LED flicker + LAB monitor pulse (collected during interior build).
  {
    const flickers = [];
    ctx.root.traverse(() => {});
    void flickers;
  }

  // ---------------------------------------------------------------------------
  // 14. SURFACES + GAMEPLAY PLACEMENT
  // ---------------------------------------------------------------------------
  ctx.setSurface((x, z) => {
    for (const m of MODULES) {
      if (Math.abs(x - m.cx) < m.w / 2 + 0.4 && Math.abs(z - m.cz) < m.d / 2 + 0.4) return 'metal';
    }
    for (const t of tubeSegs) {
      const dx = t.bx - t.ax, dz = t.bz - t.az;
      const L2 = dx * dx + dz * dz || 1;
      let u = ((x - t.ax) * dx + (z - t.az) * dz) / L2;
      u = Math.max(0, Math.min(1, u));
      if (Math.hypot(x - (t.ax + dx * u), z - (t.az + dz * u)) < 1.8) return 'metal';
    }
    return 'snow';
  });

  // -- coins: 40, spread across every layer of the map ------------------------
  const coins = [];
  const push = (x, y, z) => coins.push([x, y, z]);
  // interiors (20)
  push(MOD.hab.cx - 7, F + 1, MOD.hab.cz + 3);
  push(MOD.hab.cx + 1.5, F + 1, MOD.hab.cz - 3.4);
  push(MOD.hab.cx + 7.6, F + 1, MOD.hab.cz + 3.6);
  push(MOD.hab.cx - 2.5, F + 1.9, MOD.hab.cz - 4.2);
  push(MOD.lab.cx - 5, F + 1, MOD.lab.cz + 3.4);
  push(MOD.lab.cx + 4, F + 1, MOD.lab.cz - 3.2);
  push(MOD.lab.cx + 6.5, F + 1, MOD.lab.cz + 2.8);
  push(MOD.lab.cx - 6.8, F + 1, MOD.lab.cz - 3.0);
  push(MOD.comms.cx - 5, F + 1, MOD.comms.cz + 3.0);
  push(MOD.comms.cx + 4.5, F + 1, MOD.comms.cz - 3.2);
  push(MOD.comms.cx + 5.8, F + 1, MOD.comms.cz + 3.4);
  push(MOD.comms.cx - 2, F + 1, MOD.comms.cz + 0.4);
  push(MOD.gen.cx - 5.5, F + 1, MOD.gen.cz + 4.2);
  push(MOD.gen.cx + 5.5, F + 1, MOD.gen.cz - 4.0);
  push(MOD.gen.cx + 6.0, F + 1, MOD.gen.cz + 4.4);
  push(MOD.gen.cx - 3.5, F + 1, MOD.gen.cz + 3.0);
  push(MOD.store.cx - 9, F + 1, MOD.store.cz - 4.5);
  push(MOD.store.cx + 3.5, F + 2.9, MOD.store.cz - 3.6);
  push(MOD.store.cx + 9.5, F + 1, MOD.store.cz + 4.4);
  push(MOD.store.cx - 4, F + 1, MOD.store.cz + 4.6);
  // walkway tubes (3)
  for (let i = 0; i < 3; i++) {
    const t = tubeSegs[i * 2 % tubeSegs.length];
    push((t.ax + t.bx) / 2, DECK_Y + 1.0, (t.az + t.bz) / 2);
  }
  // under-module (5)
  for (const m of MODULES) push(m.cx + m.w * 0.22, gy(m.cx + m.w * 0.22, m.cz - 2) + 1.0, m.cz - 2);
  // tunnels (5)
  push(-6, TUN_Y + 1, 4); push(-6, TUN_Y + 1, -14); push(6, TUN_Y + 1, -6);
  push(16, TUN_Y + 1, -11); push(-12, TUN_Y + 1, -26);
  // ice cave (2)
  push(-9, CAVE_FLOOR + 1, 33); push(-3, CAVE_FLOOR + 1, 36.5);
  // crevasse (3)
  push(-4, -2.6 + 1.0, 41.4); push(2, -2.6 + 1.0, 41.0); push(-28, CREV_FLOOR + 1, 44);
  // outside landmarks (2)
  push(58, gy(58, -34) + 7.6, -35.6);                 // mast platform
  push(-66, gy(-66, 22) + 1.0, 25);                   // by the snowcat
  for (const c of coins) ctx.pickup(c[0], c[1], c[2], 'coin');

  // -- batteries (6) ----------------------------------------------------------
  ctx.pickup(MOD.hab.cx + m0(MOD.hab, -0.34), F + 1, MOD.hab.cz + 4.0, 'battery');
  ctx.pickup(MOD.comms.cx + 5.0, F + 1, MOD.comms.cz + 3.9, 'battery');
  ctx.pickup(MOD.gen.cx - 6.5, F + 1, MOD.gen.cz - 4.4, 'battery');
  ctx.pickup(MOD.store.cx + 8.0, F + 1, MOD.store.cz - 4.8, 'battery');
  ctx.pickup(-6, TUN_Y + 1, 24, 'battery');
  ctx.pickup(-9, -2.6 + 1.0, 41.2, 'battery');
  function m0(m, f) { return m.w * f; }

  // -- powerups (3) + the single pup -----------------------------------------
  ctx.pickup(MOD.comms.cx - 5.5, F + 1, MOD.comms.cz - 3.6, 'powerup:ghost');
  ctx.pickup(58, gy(58, -34) + 7.6, -33.0, 'powerup:dash');
  ctx.pickup(16, TUN_Y + 1, -14.5, 'powerup:nightvision');
  ctx.pickup(-10.5, CAVE_FLOOR + 0.9, 37.6, 'pup');   // behind an ice pillar, ice cave

  // -- extra hiding spots to clear 18 ----------------------------------------
  ctx.hidingSpot(-42, gy(-42, -20), -20, 2.2, 1.0);
  ctx.hidingSpot(-13.5, -1.2, 10.6, 1.6, 0.9);
  ctx.hidingSpot(10, 0.4, 44, 1.4, 0.6);
  ctx.hidingSpot(MOD.store.cx - 7.5, F, MOD.store.cz + 3.0, 1.4, 0.8);
}
