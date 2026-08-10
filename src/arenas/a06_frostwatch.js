// =============================================================================
// FROSTWATCH — abandoned polar research station, whiteout blizzard.
//
// Five stilted modules linked by enclosed walkway tubes, a buried ice-tunnel
// level at y = -4, and a crevasse you can climb down into. Outside is a flat
// white void with ~25 m of visibility; inside is warm, cramped and quiet.
// You navigate the storm by glowing windows and a line of orange route flags.
//
//   1  meta + layout tables
//   2  terrain height field (drifts, tunnel berms, flattened pads)
//   3  materials / atmosphere / lighting
//   4  terrain, boundary ice ridge, opening kerbs
//   5  module shells (frozen) + invisible collision proxies
//   6  module interiors (HAB / LAB / COMMS / GENERATOR / STORAGE)
//   7  elevated walkway tubes
//   8  exterior stairs + the under-module layer
//   9  ice tunnels, stairwells, the ice cave
//  10  crevasse
//  11  outdoor landmarks
//  12  detail pass — snow caps, drifts, icicles, cable runs, route flags
//  13  blizzard + animation
//  14  surfaces + gameplay placement
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

// -----------------------------------------------------------------------------
// 1. LAYOUT TABLES  (module-scope so the height field can read them)
// -----------------------------------------------------------------------------

const DECK_Y = 3.0;                 // structural deck height
const ROOM_H = 2.9;                 // interior clear height
const ROOF_Y = DECK_Y + ROOM_H;
const FLOOR_Y = DECK_Y + 0.1;       // the surface you actually stand on indoors
const TUN_Y = -4.0;                 // ice tunnel floor
const TUN_HW = 1.7;                 // tunnel half width
const TUN_TOP = -2.6;               // where the vertical wall meets the arch
const CREV_FLOOR = -6.2;
const CAVE_FLOOR = -5.2;
const PAD = 4.2;                    // kerb width around every hole in the snow

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

// Buried tunnel centre-lines. The height field raises a snow berm over each one
// so the arch crown is never poking out of the drift field.
const TUNNELS = [
  [5, 17.8, 5, 13],        // up from the ice stairwell
  [5, 13, -6, 13],         // west, under Stores
  [-6, 13, -6, -26],       // the spine
  [-6, 13, -6, 26],        // north, to the ice cave
  [-6, -6, 26.5, -6],      // east branch
  [26.5, -6, 26.5, -8.8],  // spur to the collapsed hatch pit
  [-6, -26, -16.6, -26],   // west, to the Lab stair
];

// Rectangles where the snow plane is cut away. Each gets a kerb ring.
const HOLE_CREVASSE = { x0: -46, x1: 24, z0: 41, z1: 47 };
const HOLE_STAIRWELL = { x0: 2, x1: 8, z0: 18, z1: 26 };
const HOLE_LABSTAIR = { x0: -19, x1: -13, z0: -34, z1: -25 };
const HOLE_PIT = { x0: 24, x1: 29, z0: -14, z1: -9 };
const HOLES = [HOLE_CREVASSE, HOLE_STAIRWELL, HOLE_LABSTAIR, HOLE_PIT];

// Rectangles where the drift field flattens to y = 0 (pads and shaft aprons).
const FLATS = [
  { x0: -52, x1: 30, z0: 27, z1: 54, f: 11 },   // crevasse apron + ice-cave roof cover
  { x0: -21, x1: -4, z0: 3, z1: 19, f: 8 },     // under Stores
  { x0: -1, x1: 12, z0: 14, z1: 30, f: 8 },     // ice stairwell
  { x0: -23, x1: -9, z0: -37, z1: -22, f: 8 },  // Lab stair
  { x0: 21, x1: 32, z0: -18, z1: -5, f: 8 },    // hatch pit
  { x0: -50, x1: -34, z0: -4, z1: 10, f: 12 },  // spawn apron
];

const BOUND_X = 88, BOUND_Z = 80;

const smoothstep = (a, b, t) => {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

function distToSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const L2 = dx * dx + dz * dz || 1;
  let u = ((px - x1) * dx + (pz - z1) * dz) / L2;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - (x1 + dx * u), pz - (z1 + dz * u));
}

// =============================================================================
export async function build(ctx) {
  const { props, mat, rng, noise } = ctx;
  const R = {
    ridge: rng.fork('ridge'), inner: rng.fork('inner'), tun: rng.fork('tun'),
    out: rng.fork('out'), detail: rng.fork('detail'), snow: rng.fork('snow'),
  };

  // ---------------------------------------------------------------------------
  // 2. TERRAIN HEIGHT FIELD — sampled by every prop so nothing floats or sinks.
  // ---------------------------------------------------------------------------
  function flatMask(x, z) {
    let m = 0;
    for (const f of FLATS) {
      const dx = Math.max(f.x0 - x, 0, x - f.x1);
      const dz = Math.max(f.z0 - z, 0, z - f.z1);
      m = Math.max(m, 1 - smoothstep(0, f.f, Math.hypot(dx, dz)));
      if (m >= 0.999) return 1;
    }
    return m;
  }
  function tunnelBerm(x, z) {
    let best = 1e9;
    for (const t of TUNNELS) {
      const d = distToSeg(x, z, t[0], t[1], t[2], t[3]);
      if (d < best) best = d;
      if (best < 0.2) break;
    }
    if (best > 6.5) return 0;
    return (1 - smoothstep(0, 6.5, best)) * 0.95;
  }
  function gy(x, z) {
    const m = flatMask(x, z);
    let h = 0;
    if (m < 0.999) {
      h = noise.fbm(x * 0.013, z * 0.013, 4) * 1.55
        + noise.fbm(x * 0.045 + 21, z * 0.045 - 9, 3) * 0.40;
      h += Math.sin(x * 0.09 + noise.fbm(x * 0.02, z * 0.02, 2) * 3.0) * 0.11;
      h *= (1 - m);
    }
    const berm = tunnelBerm(x, z);
    if (berm > 0) h = Math.max(h, -0.15) + berm;
    return h;
  }
  function inHole(x, z) {
    for (const h of HOLES) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // 3. MATERIALS
  // ---------------------------------------------------------------------------
  // Nine procedural texture sets and nothing above 256 px. Each set is three
  // full per-pixel generations on the main thread, so this is the single
  // biggest lever on build time — the arena reuses these everywhere rather
  // than asking for a bespoke tint per prop. Everything small is
  // solid()/emissive()/painted(), which cost nothing.
  const M = {
    snow:       mat.surface('snow', { color: 0xe9f2fb, repeat: 72, size: 256 }),
    ice:        mat.surface('snow', { color: 0x9fc3e2, repeat: 8, size: 256, roughness: 0.5, normalScale: 1.5, side: THREE.DoubleSide }),
    cladA:      mat.surface('corrugated', { color: 0xc05320, repeat: 3, size: 256, ribs: 16 }),
    cladB:      mat.surface('corrugated', { color: 0x8d3a17, repeat: 3, size: 256, ribs: 16 }),
    rust:       mat.surface('rustMetal', { color: 0x4a4038, repeat: 2, size: 256 }),
    steel:      mat.surface('metalPanel', { color: 0x8d949b, repeat: 2, size: 256 }),
    innerWall:  mat.surface('metalPanel', { color: 0xd6c8ac, repeat: 4, size: 256, panels: 3, rough: 0.7 }),
    innerFloor: mat.surface('tile', { color: 0x6d7278, repeat: 8, size: 256, tiles: 6, grout: 0x33363a }),
    wood:       mat.surface('wood', { color: 0x7a5a34, repeat: 1, size: 256, planks: 4 }),
  };
  M.grate = M.steel;
  M.ridgeIce = mat.solid({ color: 0xb8d0e6, roughness: 0.55, flat: true });
  M.fabric = mat.solid({ color: 0x2e4a63, roughness: 0.92 });
  const clads = [M.cladA, M.cladB];

  const packedSnow = mat.solid({ color: 0xf1f7ff, roughness: 0.72 });
  const deepIce = mat.solid({ color: 0x7fa8cc, roughness: 0.28, metalness: 0.05 });
  const darkMetal = mat.metal(0x3b4046, 0.55);
  const paleMetal = mat.solid({ color: 0x9aa2a8, roughness: 0.5, metalness: 0.35 });
  const cableMat = mat.solid({ color: 0x14161a, roughness: 0.85 });
  const ceilMat = mat.solid({ color: 0xbdb096, roughness: 0.85 });
  const invis = mat.solid({ color: 0x808080 });

  // Animated emissives get their own material objects — ctx.mat caches globally,
  // so mutating a shared one would flicker half the arena.
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
    return m;
  }
  const beaconMat = animEmissive(0xffc07a, 2.6, { side: THREE.DoubleSide });
  const innerPaneMat = mat.emissive(0xffd7a4, 0.55, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const LED = {
    green: animEmissive(0x44ff88, 4.0),
    amber: animEmissive(0xffb020, 4.0),
    red: animEmissive(0xff3a2a, 4.0),
    cyan: animEmissive(0x7ad8ff, 2.3),
    scrGreen: animEmissive(0x4be08a, 2.4),
    scrBlue: animEmissive(0x59d6ff, 2.4),
    scrDead: animEmissive(0x1a2a34, 0.4),
    panel: animEmissive(0xff2f22, 3.4),
    heater: animEmissive(0xff5a1e, 5.0),
    beaconTop: animEmissive(0xff2a1a, 6.0),
  };
  const blinkers = [
    { m: LED.green, sp: 3.1, ph: 0.0, mode: 'blink' },
    { m: LED.amber, sp: 1.7, ph: 1.3, mode: 'blink' },
    { m: LED.red, sp: 5.3, ph: 2.6, mode: 'blink' },
    { m: LED.cyan, sp: 0.8, ph: 0.4, mode: 'pulse' },
    { m: LED.scrGreen, sp: 1.1, ph: 0.9, mode: 'pulse' },
    { m: LED.scrBlue, sp: 0.7, ph: 2.2, mode: 'pulse' },
    { m: LED.panel, sp: 3.4, ph: 0.0, mode: 'pulse' },
    { m: LED.heater, sp: 0.9, ph: 1.7, mode: 'pulse' },
    { m: LED.beaconTop, sp: 2.4, ph: 0.0, mode: 'strobe' },
  ];

  // Painted decals -------------------------------------------------------------
  const frostMat = mat.painted(192, 192, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (const [ox, oy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const g = c.createRadialGradient(ox, oy, 2, ox, oy, W * 0.62);
      g.addColorStop(0, 'rgba(238,248,255,0.95)');
      g.addColorStop(0.45, 'rgba(220,238,252,0.42)');
      g.addColorStop(1, 'rgba(220,238,252,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(248,253,255,0.8)'; c.lineWidth = 1.6;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.2;
        const len = 22 + ((i * 37) % 60);
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
    for (let i = -H; i < W; i += 26) {
      c.beginPath(); c.moveTo(i, H); c.lineTo(i + 13, H); c.lineTo(i + 13 + H, 0); c.lineTo(i + H, 0); c.fill();
    }
    c.globalAlpha = 0.35; c.fillStyle = '#2a2016';
    for (let i = 0; i < 40; i++) c.fillRect((i * 53) % W, (i * 29) % H, 6, 3);
  }, { transparent: false, roughness: 0.8 });

  const scrawlMat = mat.painted(256, 160, (c, W, H) => {
    c.fillStyle = '#e9ecec'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(30,40,60,0.8)'; c.lineWidth = 2;
    for (let r = 0; r < 8; r++) {
      let x = 12 + (r % 2) * 8; const y = 18 + r * 17;
      c.beginPath(); c.moveTo(x, y);
      const n = 10 + (r * 3) % 9;
      for (let i = 0; i < n; i++) { x += 9 + ((i * 17 + r * 5) % 11); c.lineTo(x, y + Math.sin(i * 2.3 + r) * 4); }
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

  const flagCloth = mat.painted(48, 32, (c, W, H) => {
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
  // 3c. LIGHTS — 24 real lights, 3 shadow casters, no sun disc.
  // ---------------------------------------------------------------------------
  ctx.light(new THREE.HemisphereLight(0xd8e8f8, 0xa8bcd0, 1.1));            // 1
  ctx.light(new THREE.AmbientLight(0xbfd2e4, 0.28));                         // 2
  const key = new THREE.DirectionalLight(0xeef5ff, 0.85);                    // 3  (shadow)
  key.position.set(-40, 70, 55);
  key.target.position.set(0, 0, -6);
  ctx.light(key, { shadow: true, range: 62, far: 190 });

  let lightCount = 3;
  function pointLight(x, y, z, i, dist, color, shadow) {
    const l = new THREE.PointLight(color ?? 0xffc98a, i, dist, 1.8);
    l.position.set(x, y, z);
    lightCount++;
    return ctx.light(l, shadow ? { shadow: true, far: dist + 2 } : {});
  }

  // ---------------------------------------------------------------------------
  // 4. TERRAIN, KERBS, BOUNDARY RIDGE
  // ---------------------------------------------------------------------------
  const terrain = props.ground(200, 190, M.snow, { segs: 56 });
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

  // Backstop far below so a cut edge never shows raw sky.
  {
    const capMat = mat.solid({ color: 0x6f93b4, roughness: 0.6, side: THREE.DoubleSide });
    const cap = props.ground(210, 200, capMat, { segs: 1, collide: false });
    cap.position.y = -11;
    ctx.addDecor(cap);
  }

  /**
   * Ring of collidable snow kerb around a cut-out. Face removal is a centroid
   * test on a 3.1 m grid, so the real opening can wander up to one cell past
   * the nominal rect — the kerb guarantees solid ground out to rect + PAD.
   */
  function kerbRing(h) {
    const g = new THREE.Group();
    const slab = (ax, bx, az, bz) => {
      if (bx - ax < 0.05 || bz - az < 0.05) return;
      const b = props.boxC(bx - ax, 0.6, bz - az, packedSnow);
      b.position.set((ax + bx) / 2, -0.15, (az + bz) / 2);
      g.add(b);
    };
    slab(h.x0 - PAD, h.x1 + PAD, h.z0 - PAD, h.z0);
    slab(h.x0 - PAD, h.x1 + PAD, h.z1, h.z1 + PAD);
    slab(h.x0 - PAD, h.x0, h.z0, h.z1);
    slab(h.x1, h.x1 + PAD, h.z0, h.z1);
    return g;
  }
  {
    const kerbs = new THREE.Group();
    for (const h of HOLES) kerbs.add(kerbRing(h));
    bakeSplit(kerbs);
  }

  // Invisible sealing wall — an unbroken ring, nothing escapes.
  for (const [x, z, w, d] of [
    [0, -BOUND_Z, BOUND_X * 2 + 8, 3], [0, BOUND_Z, BOUND_X * 2 + 8, 3],
    [-BOUND_X, 0, 3, BOUND_Z * 2 + 8], [BOUND_X, 0, 3, BOUND_Z * 2 + 8],
  ]) {
    const w0 = props.boxC(w, 30, d, invis, { shadow: false });
    w0.position.set(x, 11, z);
    w0.visible = false; w0.userData.collide = true;
    ctx.add(w0);
  }

  // Pressure-ridge ice: instanced slabs along the perimeter + interior sastrugi.
  {
    const slabGeo = new THREE.IcosahedronGeometry(1, 0);
    const p = slabGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) * (1 + R.ridge.range(-0.3, 0.3)),
                  p.getY(i) * (1 + R.ridge.range(-0.2, 0.5)),
                  p.getZ(i) * (1 + R.ridge.range(-0.3, 0.3)));
    }
    slabGeo.computeVertexNormals();

    const ridge = props.scatter(slabGeo, M.ridgeIce, 460, (i, dm, r) => {
      const side = i % 4, t = r();
      let x, z;
      if (side === 0) { x = -BOUND_X + BOUND_X * 2 * t; z = -BOUND_Z + r.range(-5, 7); }
      else if (side === 1) { x = -BOUND_X + BOUND_X * 2 * t; z = BOUND_Z + r.range(-7, 5); }
      else if (side === 2) { x = -BOUND_X + r.range(-5, 7); z = -BOUND_Z + BOUND_Z * 2 * t; }
      else { x = BOUND_X + r.range(-7, 5); z = -BOUND_Z + BOUND_Z * 2 * t; }
      const h = r.range(3.5, 11);
      dm.position.set(x, gy(x, z) + h * 0.15, z);
      dm.rotation.set(r.range(-0.3, 0.3), r() * 6.28, r.range(-0.3, 0.3));
      dm.scale.set(r.range(2.2, 5.5), h * 0.5, r.range(2.0, 4.5));
    }, 811);
    ridge.castShadow = false;
    ctx.addDecor(ridge);

    const sastrugi = props.scatter(slabGeo, M.ridgeIce, 240, (i, dm, r) => {
      const x = r.range(-BOUND_X + 6, BOUND_X - 6), z = r.range(-BOUND_Z + 6, BOUND_Z - 6);
      if (inHole(x, z)) return false;
      for (const m of MODULES) {
        if (Math.abs(x - m.cx) < m.w / 2 + 5 && Math.abs(z - m.cz) < m.d / 2 + 5) return false;
      }
      const h = r.range(0.5, 2.6);
      dm.position.set(x, gy(x, z) - 0.15, z);
      dm.rotation.set(r.range(-0.35, 0.35), r() * 6.28, r.range(-0.35, 0.35));
      dm.scale.set(r.range(0.8, 2.6), h * 0.5, r.range(0.7, 2.2));
    }, 812);
    sastrugi.castShadow = false;
    ctx.addDecor(sastrugi);
  }

  // ---------------------------------------------------------------------------
  // 5. MODULE SHELLS
  // ---------------------------------------------------------------------------
  const eaveLines = [];    // [x1,z1,x2,z2,y] — icicles hang off these
  const snowCapJobs = [];  // [x,y,z,w,d,ang?] — snow slabs on flat tops
  const glassGroup = new THREE.Group();   // every window pane, frozen in one go

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

  for (const m of MODULES) m.doors = [];
  for (const [ai, bi] of LINKS) {
    const A = MOD[ai], B = MOD[bi];
    const ea = exitPoint(A, B), eb = exitPoint(B, A);
    A.doors.push({ side: ea.side, at: ea.at, width: 2.5, top: 2.5 });
    B.doors.push({ side: eb.side, at: eb.at, width: 2.5, top: 2.5 });
  }
  // Exterior airlocks — an outside stair climbs to each of these.
  MOD.hab.extDoor = { side: 's', at: 0.30, x: -46 };
  MOD.gen.extDoor = { side: 's', at: 0.78, x: 38.5 };
  MOD.store.extDoor = { side: 's', at: 0.62, x: -5.24 };
  for (const m of MODULES) {
    if (m.extDoor) m.doors.push({ side: m.extDoor.side, at: m.extDoor.at, width: 1.5, top: 2.3 });
  }
  // The generator roof is holed; the ceiling and roof slabs are built around it.
  MOD.gen.roofHole = [-5.4, -1.6, 1.1, 4.9];

  /** Flat slab, optionally with a rectangular void punched through it. */
  function slabWithHole(w, d, y, th, material, hole) {
    const g = new THREE.Group();
    if (!hole) {
      const b = props.boxC(w, th, d, material); b.position.y = y; g.add(b); return g;
    }
    const [hx0, hx1, hz0, hz1] = hole;
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    for (const [a, b2, c, e] of [
      [x0, hx0, z0, z1], [hx1, x1, z0, z1], [hx0, hx1, z0, hz0], [hx0, hx1, hz1, z1],
    ]) {
      if (b2 - a < 0.05 || e - c < 0.05) continue;
      const bx = props.boxC(b2 - a, th, e - c, material);
      bx.position.set((a + b2) / 2, y, (c + e) / 2);
      g.add(bx);
    }
    return g;
  }

  /** Framed window; the pane meshes go into glassGroup so they can be frozen. */
  function windowUnit(shell, m, side, u, sillY, w, h) {
    const horiz = side === 'n' || side === 's';
    const nz = side === 's' ? 1 : side === 'n' ? -1 : 0;
    const nx = side === 'e' ? 1 : side === 'w' ? -1 : 0;
    const lx = horiz ? u : (m.w / 2) * nx;
    const lz = horiz ? (m.d / 2) * nz : u;
    const rotY = horiz ? 0 : Math.PI / 2;
    const outward = (side === 'n' || side === 'w') ? -1 : 1;

    const frame = new THREE.Group();
    frame.position.set(lx, DECK_Y, lz);
    frame.rotation.y = rotY;
    const fm = mat.metal(0x3d4247, 0.6);
    for (const oy of [sillY - 0.05, sillY + h + 0.05]) {
      const b = props.boxC(w + 0.22, 0.11, 0.42, fm); b.position.set(0, oy, 0); frame.add(b);
    }
    for (const sx of [-1, 1]) {
      const b = props.boxC(0.11, h + 0.2, 0.42, fm);
      b.position.set(sx * (w / 2 + 0.05), sillY + h / 2, 0); frame.add(b);
    }
    const mull = props.boxC(0.06, h, 0.3, fm);
    mull.position.set(0, sillY + h / 2, 0); frame.add(mull);
    shell.add(frame);

    const panes = new THREE.Group();
    panes.position.set(m.cx + lx, DECK_Y, m.cz + lz);
    panes.rotation.y = rotY;
    const out = props.boxC(w, h, 0.02, beaconMat, { collide: false, shadow: false });
    out.position.set(0, sillY + h / 2, outward * 0.19); panes.add(out);
    const inn = props.boxC(w - 0.05, h - 0.05, 0.02, innerPaneMat, { collide: false, shadow: false });
    inn.position.set(0, sillY + h / 2, -outward * 0.19); panes.add(inn);
    for (const sgn of [-1, 1]) {
      const fr = props.boxC(w, h, 0.005, frostMat, { collide: false, shadow: false });
      fr.position.set(0, sillY + h / 2, sgn * 0.215); panes.add(fr);
    }
    glassGroup.add(panes);
  }

  function buildModule(m) {
    const shell = new THREE.Group();
    shell.position.set(m.cx, 0, m.cz);
    const clad = clads[m.clad];

    const deck = props.boxC(m.w + 0.7, 0.28, m.d + 0.7, M.steel);
    deck.position.y = DECK_Y - 0.14; shell.add(deck);
    const skirt = props.boxC(m.w + 0.72, 0.5, m.d + 0.72, M.rust);
    skirt.position.y = DECK_Y - 0.42; shell.add(skirt);

    const walls = props.roomShell({ w: m.w, d: m.d, h: ROOM_H, thickness: 0.3, material: clad, doors: m.doors });
    walls.position.y = DECK_Y; shell.add(walls);
    const liner = props.roomShell({ w: m.w - 0.62, d: m.d - 0.62, h: ROOM_H - 0.04, thickness: 0.12, material: M.innerWall, doors: m.doors });
    liner.position.y = DECK_Y; shell.add(liner);

    const floor = props.boxC(m.w - 0.6, 0.1, m.d - 0.6, M.innerFloor);
    floor.position.y = DECK_Y + 0.05; shell.add(floor);
    shell.add(slabWithHole(m.w - 0.6, m.d - 0.6, ROOF_Y - 0.12, 0.1, ceilMat, m.roofHole));
    shell.add(slabWithHole(m.w + 0.5, m.d + 0.5, ROOF_Y + 0.05, 0.26, M.rust, m.roofHole));

    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = props.boxC(0.34, ROOM_H + 0.3, 0.34, M.rust);
      p.position.set(sx * (m.w / 2 - 0.05), DECK_Y + ROOM_H / 2, sz * (m.d / 2 - 0.05));
      shell.add(p);
    }
    for (const sz of [-1, 1]) {
      const strap = props.boxC(m.w + 0.16, 0.14, 0.1, M.rust);
      strap.position.set(0, DECK_Y + 1.9, sz * (m.d / 2 + 0.08)); shell.add(strap);
    }

    for (const s of ['n', 's']) for (const f of [-0.28, 0.24]) windowUnit(shell, m, s, m.w * f, 1.05, 2.1, 1.15);
    windowUnit(shell, m, 'e', m.d * 0.1, 1.05, 1.5, 1.15);

    // Legs: length sampled from the real terrain, so they always reach.
    const legXs = [-m.w / 2 + 1.2, 0, m.w / 2 - 1.2];
    const legZs = [-m.d / 2 + 1.2, m.d / 2 - 1.2];
    for (const lx of legXs) for (const lz of legZs) {
      const g0 = gy(m.cx + lx, m.cz + lz);
      const legH = DECK_Y - 0.55 - g0;
      const leg = props.cyl(0.19, 0.24, legH, M.steel, { seg: 10 });
      leg.position.set(lx, g0, lz); shell.add(leg);
      const pad = props.cyl(0.55, 0.62, 0.22, darkMetal, { seg: 10 });
      pad.position.set(lx, g0 - 0.12, lz); shell.add(pad);
      if (lz < 0) {
        const other = m.d / 2 - 1.2;
        const gb = gy(m.cx + lx, m.cz + other);
        const dy = (DECK_Y - 0.55 - gb) - (g0 + 0.4);
        const br = props.boxC(0.1, 0.1, Math.hypot(other - lz, dy), darkMetal);
        br.position.set(lx, (g0 + 0.4 + DECK_Y - 0.55 - gb + g0 + 0.4) / 2, (lz + other) / 2);
        br.position.y = g0 + 0.4 + dy / 2;
        br.rotation.x = -Math.atan2(dy, other - lz);
        shell.add(br);
      }
    }

    const v1 = props.vent(0.8, 0.5, darkMetal);
    v1.position.set(m.w * 0.3, ROOF_Y + 0.6, -m.d / 2 - 0.02); shell.add(v1);
    const stack = props.cyl(0.16, 0.2, 1.5, darkMetal, { seg: 10 });
    stack.position.set(-m.w * 0.32, ROOF_Y + 0.18, m.d * 0.2); shell.add(stack);
    const cowl = props.cyl(0.3, 0.16, 0.24, darkMetal, { seg: 10 });
    cowl.position.set(-m.w * 0.32, ROOF_Y + 1.66, m.d * 0.2); shell.add(cowl);

    ctx.addDecor(props.freeze(shell));

    // Invisible collision proxy: the same wall layout plus floor and roof.
    const proxy = new THREE.Group();
    proxy.position.set(m.cx, 0, m.cz);
    const pw = props.roomShell({ w: m.w, d: m.d, h: ROOM_H, thickness: 0.34, material: invis, doors: m.doors });
    pw.position.y = DECK_Y; proxy.add(pw);
    const pf = props.boxC(m.w + 0.7, 0.4, m.d + 0.7, invis);
    pf.position.y = FLOOR_Y - 0.2; proxy.add(pf);
    proxy.add(slabWithHole(m.w + 0.5, m.d + 0.5, ROOF_Y + 0.05, 0.3, invis, m.roofHole));
    proxy.traverse(o => { if (o.isMesh) { o.visible = false; o.castShadow = false; o.receiveShadow = false; } });
    ctx.addSolid(proxy);

    eaveLines.push([m.cx - m.w / 2 - 0.2, m.cz - m.d / 2 - 0.2, m.cx + m.w / 2 + 0.2, m.cz - m.d / 2 - 0.2, ROOF_Y]);
    eaveLines.push([m.cx - m.w / 2 - 0.2, m.cz + m.d / 2 + 0.2, m.cx + m.w / 2 + 0.2, m.cz + m.d / 2 + 0.2, ROOF_Y]);
    eaveLines.push([m.cx - m.w / 2 - 0.2, m.cz - m.d / 2, m.cx - m.w / 2 - 0.2, m.cz + m.d / 2, ROOF_Y]);
    eaveLines.push([m.cx + m.w / 2 + 0.2, m.cz - m.d / 2, m.cx + m.w / 2 + 0.2, m.cz + m.d / 2, ROOF_Y]);
    snowCapJobs.push([m.cx, ROOF_Y + 0.24, m.cz, m.w + 0.5, m.d + 0.5]);
  }
  for (const m of MODULES) buildModule(m);

  {
    const frozenGlass = props.freeze(glassGroup);
    frozenGlass.traverse(o => { if (o.isMesh) o.castShadow = false; });
    ctx.addDecor(frozenGlass);
  }

  // Hand-painted module numbers and hazard stencils.
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
  //    Each is split into `sol` (real props, collidable) and `dec` (clutter,
  //    frozen into a handful of draw calls — animated materials survive the
  //    merge because freeze keeps the material reference).
  // ---------------------------------------------------------------------------
  const F = FLOOR_Y;
  const swingers = [];
  const genShake = [];

  /**
   * Merge a group down to one mesh per (material, collide-flag) pair. Same
   * triangles as before for both the renderer and the octree, but a hundred
   * little props collapse into a handful of draw calls — and greebles that
   * were tagged non-colliding stay non-colliding, which keeps the octree lean.
   */
  function bakeSplit(group, opts = {}) {
    group.updateMatrixWorld(true);
    const solidB = new Map(), decorB = new Map();
    group.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const bucket = o.userData.collide === true ? solidB : decorB;
      if (!bucket.has(o.material.uuid)) bucket.set(o.material.uuid, { m: o.material, geos: [] });
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      bucket.get(o.material.uuid).geos.push(g);
    });
    const out = new THREE.Group();
    for (const [bucket, collide] of [[solidB, true], [decorB, false]]) {
      for (const { m, geos } of bucket.values()) {
        const mm = new THREE.Mesh(props.mergeGeometries(geos), m);
        mm.castShadow = collide && (opts.shadow !== false);
        mm.receiveShadow = true;
        mm.userData.collide = collide;
        out.add(mm);
        geos.forEach(g => g.dispose());
      }
    }
    ctx.add(out);
    return out;
  }

  function commit(sol, dec) { bakeSplit(sol); bakeSplit(dec, { shadow: false }); }

  /** Sagging festoon of bulbs between two points. Goes in a `dec` group. */
  function festoon(dec, x1, z1, x2, z2, y, n, material) {
    const bulbG = new THREE.SphereGeometry(0.045, 6, 5);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bx = x1 + (x2 - x1) * t, bz = z1 + (z2 - z1) * t;
      const by = y - Math.sin((i % 3) / 3 * Math.PI) * 0.28;
      const b = new THREE.Mesh(bulbG, material);
      b.position.set(bx, by - 0.08, bz);
      b.userData.collide = false; b.castShadow = false;
      dec.add(b);
      if (prev) {
        const len = Math.hypot(bx - prev[0], by - prev[1], bz - prev[2]);
        const seg = props.boxC(0.014, 0.014, len, cableMat, { collide: false, shadow: false });
        seg.position.set((bx + prev[0]) / 2, (by + prev[1]) / 2, (bz + prev[2]) / 2);
        seg.lookAt(bx, by, bz);
        dec.add(seg);
      }
      prev = [bx, by, bz];
    }
  }

  // -- 6a. HAB — bunks, lockers, mess table, dead TV, string lights -----------
  {
    const m = MOD.hab, sol = new THREE.Group(), dec = new THREE.Group();
    const blanketMat = M.fabric;
    for (let i = 0; i < 4; i++) {
      const bx = m.cx - m.w / 2 + 2.6 + i * 4.1, bz = m.cz - m.d / 2 + 1.9;
      for (const by of [F + 0.5, F + 1.55]) {
        const bed = props.boxC(1.95, 0.12, 1.0, paleMetal);
        bed.position.set(bx, by, bz); sol.add(bed);
        const mattress = props.boxC(1.85, 0.16, 0.9, blanketMat);
        mattress.position.set(bx, by + 0.14, bz); mattress.userData.collide = false; dec.add(mattress);
        const blanket = props.boxC(1.86, 0.1, 0.6, blanketMat);
        blanket.position.set(bx, by + 0.26, bz + 0.12); blanket.userData.collide = false; dec.add(blanket);
      }
      for (const sx of [-0.9, 0.9]) {
        const post = props.boxC(0.07, 2.1, 0.07, paleMetal);
        post.position.set(bx + sx, F + 1.05, bz); post.userData.collide = false; dec.add(post);
      }
      const cur = props.boxC(0.02, 1.0, 1.0, blanketMat);
      cur.position.set(bx + 0.95, F + 1.0, bz + 0.2); cur.userData.collide = false; dec.add(cur);
    }

    const lk = props.lockers(6, M.steel);
    lk.position.set(m.cx + m.w / 2 - 0.45, F, m.cz + m.d / 2 - 1.6);
    lk.rotation.y = -Math.PI / 2; sol.add(lk);

    const tbl = props.table(2.6, 0.76, 1.1, M.wood);
    tbl.position.set(m.cx + 1.5, F, m.cz + 2.4); sol.add(tbl);
    for (let i = 0; i < 4; i++) {
      const ch = props.chair(mat.solid({ color: 0x4a4a4e, roughness: 0.75 }));
      ch.position.set(m.cx + 0.2 + i * 0.9, F, m.cz + (i % 2 ? 3.5 : 1.3));
      ch.rotation.y = (i % 2 ? 0 : Math.PI) + R.inner.range(-0.3, 0.3);
      sol.add(ch);
    }
    const mugMat = mat.solid({ color: 0xe4e0d6, roughness: 0.55 });
    for (let i = 0; i < 5; i++) {
      const mg = props.cyl(0.045, 0.04, 0.1, mugMat, { seg: 8, collide: false, shadow: false });
      mg.position.set(m.cx + 0.6 + R.inner.range(0, 2.2), F + 0.76, m.cz + 2.4 + R.inner.range(-0.4, 0.4));
      dec.add(mg);
    }
    const chess = props.boxC(0.42, 0.03, 0.42, mat.solid({ color: 0x2b2b2e, roughness: 0.5 }), { collide: false, shadow: false });
    chess.position.set(m.cx + 2.4, F + 0.79, m.cz + 2.4); dec.add(chess);
    for (let i = 0; i < 9; i++) {
      const pc = props.cyl(0.014, 0.02, 0.06, mat.solid({ color: i % 2 ? 0xe8e4da : 0x1c1c1e, roughness: 0.4 }), { seg: 6, collide: false, shadow: false });
      pc.position.set(m.cx + 2.24 + (i % 3) * 0.16, F + 0.8, m.cz + 2.24 + Math.floor(i / 3) * 0.16);
      dec.add(pc);
    }

    const tv = props.boxC(0.12, 0.62, 1.0, mat.solid({ color: 0x1a1b1d, roughness: 0.4 }), { collide: false });
    tv.position.set(m.cx - m.w / 2 + 1.1, F + 1.9, m.cz + 3.4); dec.add(tv);
    const tvScreen = props.boxC(0.02, 0.5, 0.86, mat.solid({ color: 0x14181c, roughness: 0.15, metalness: 0.25 }), { collide: false, shadow: false });
    tvScreen.position.set(m.cx - m.w / 2 + 1.02, F + 1.9, m.cz + 3.4); dec.add(tvScreen);

    for (let i = 0; i < 4; i++) {
      const boot = props.boxC(0.14, 0.3, 0.32, mat.solid({ color: 0x23262a, roughness: 0.9 }), { collide: false });
      boot.position.set(m.cx - m.w / 2 + 1.6 + i * 0.22, F + 0.15, m.cz + m.d / 2 - 1.0);
      boot.rotation.y = R.inner.range(-0.4, 0.4); dec.add(boot);
    }
    const heater = props.boxC(0.7, 0.5, 0.28, darkMetal);
    heater.position.set(m.cx + 2.0, F + 0.25, m.cz + m.d / 2 - 0.9); sol.add(heater);
    const coil = props.boxC(0.58, 0.3, 0.03, LED.heater, { collide: false, shadow: false });
    coil.position.set(m.cx + 2.0, F + 0.28, m.cz + m.d / 2 - 1.06); dec.add(coil);

    festoon(dec, m.cx - m.w / 2 + 1.5, m.cz + m.d / 2 - 1.2, m.cx + m.w / 2 - 1.5, m.cz + m.d / 2 - 1.2, ROOF_Y - 0.35, 12, LED.amber);

    const pend = props.pendant(0.7, { color: 0xffcb92, intensity: 7 });
    pend.position.set(m.cx + 1.5, ROOF_Y - 0.2, m.cz + 2.4);
    ctx.addDecor(pend);
    swingers.push({ o: pend, amp: 0.045, sp: 0.72 });

    commit(sol, dec);
    pointLight(m.cx + 1.5, F + 2.1, m.cz + 2.2, 4.0, 13, 0xffc98a, true);   // 4  (shadow)
    pointLight(m.cx - 6.5, F + 2.0, m.cz - 1.0, 2.4, 10);                   // 5
    pointLight(m.cx + 7.5, F + 2.0, m.cz + 1.0, 2.0, 9);                    // 6
    ctx.hidingSpot(m.cx + m.w / 2 - 1.4, F, m.cz + m.d / 2 - 1.6, 1.3, 1.0);
  }

  // -- 6b. LAB — benches, glassware, monitor wall, specimen cabinets ---------
  {
    const m = MOD.lab, sol = new THREE.Group(), dec = new THREE.Group();
    const benchTop = mat.solid({ color: 0x8f9499, roughness: 0.4, metalness: 0.4 });
    const benchBody = mat.solid({ color: 0x5d6469, roughness: 0.7 });
    const glassware = mat.glassCheap({ color: 0xbcd8e0, opacity: 0.45 });
    for (const [bz, len] of [[m.cz - 3.6, m.w - 4], [m.cz - 0.5, 9]]) {
      const b = props.boxC(len, 0.08, 1.0, benchTop);
      b.position.set(m.cx, F + 0.9, bz); sol.add(b);
      const under = props.boxC(len - 0.4, 0.85, 0.9, benchBody);
      under.position.set(m.cx, F + 0.44, bz); sol.add(under);
      for (let i = 0; i < 9; i++) {
        const r0 = 0.035 + R.inner.range(0, 0.03);
        const gl = props.cyl(r0, r0, R.inner.range(0.12, 0.3), glassware, { seg: 8, collide: false, shadow: false });
        gl.position.set(m.cx - len / 2 + 0.8 + i * ((len - 1.6) / 8), F + 0.94, bz + R.inner.range(-0.3, 0.3));
        dec.add(gl);
      }
    }
    const monBez = mat.solid({ color: 0x191b1e, roughness: 0.5 });
    for (let i = 0; i < 8; i++) {
      const mx = m.cx - m.w / 2 + 2.4 + (i % 4) * 1.6;
      const my = F + 1.5 + Math.floor(i / 4) * 0.85;
      const bez = props.boxC(1.3, 0.75, 0.1, monBez, { collide: false, shadow: false });
      bez.position.set(mx, my, m.cz - m.d / 2 + 0.45); dec.add(bez);
      const sm = i % 3 === 0 ? LED.scrDead : (i % 3 === 1 ? LED.scrBlue : LED.scrGreen);
      const sc = props.boxC(1.18, 0.64, 0.02, sm, { collide: false, shadow: false });
      sc.position.set(mx, my, m.cz - m.d / 2 + 0.51); dec.add(sc);
      if (i % 3 === 0) {                                     // cracked glass
        for (let k = 0; k < 4; k++) {
          const cr = props.boxC(R.inner.range(0.2, 0.9), 0.012, 0.01, mat.solid({ color: 0x0a0c0e }), { collide: false, shadow: false });
          cr.position.set(mx + R.inner.range(-0.4, 0.4), my + R.inner.range(-0.25, 0.25), m.cz - m.d / 2 + 0.53);
          cr.rotation.z = R.inner.range(-1.2, 1.2); dec.add(cr);
        }
      }
    }
    const cabMat = mat.solid({ color: 0xa8aeb2, roughness: 0.45, metalness: 0.3 });
    for (let i = 0; i < 2; i++) {
      const cz2 = m.cz - 2.5 - i * 2.4;
      const cab = props.boxC(0.6, 2.0, 1.1, cabMat);
      cab.position.set(m.cx + m.w / 2 - 1.4, F + 1.0, cz2); sol.add(cab);
      const gl = props.boxC(0.02, 1.1, 0.9, glassware, { collide: false, shadow: false });
      gl.position.set(m.cx + m.w / 2 - 1.72, F + 1.35, cz2); dec.add(gl);
    }
    const frz = props.boxC(1.8, 0.95, 0.8, mat.solid({ color: 0xdfe3e6, roughness: 0.5 }));
    frz.position.set(m.cx - 2, F + 0.48, m.cz + 0.2); sol.add(frz);
    const frzCap = props.boxC(1.86, 0.1, 0.86, packedSnow, { collide: false, shadow: false });
    frzCap.position.set(m.cx - 2, F + 1.0, m.cz + 0.2); dec.add(frzCap);
    const stool = props.chair(mat.solid({ color: 0x3f4348, roughness: 0.7 }));
    stool.position.set(m.cx + 2, F, m.cz + 1.6); sol.add(stool);

    commit(sol, dec);
    pointLight(m.cx, F + 2.3, m.cz - 2, 2.6, 12, 0xffd0a0);                 // 7
    pointLight(m.cx - 4, F + 1.9, m.cz - 4.4, 2.0, 9, 0x5fc8ff);            // 8
    ctx.hidingSpot(m.cx, F, m.cz - 0.5, 1.3, 0.8);
  }

  // -- 6c. COMMS — radio racks, dish desk, printouts, whiteboard -------------
  {
    const m = MOD.comms, sol = new THREE.Group(), dec = new THREE.Group();
    const rackMat = mat.solid({ color: 0x2d3237, roughness: 0.5, metalness: 0.4 });
    const ledCols = [LED.green, LED.amber, LED.red];
    for (let i = 0; i < 4; i++) {
      const rx = m.cx - m.w / 2 + 2.0 + i * 1.3;
      const rack = props.boxC(1.1, 2.1, 0.7, rackMat);
      rack.position.set(rx, F + 1.05, m.cz - m.d / 2 + 0.7); sol.add(rack);
      for (let j = 0; j < 9; j++) {
        const led = props.boxC(0.06, 0.03, 0.02, ledCols[(i + j) % 3], { collide: false, shadow: false });
        led.position.set(rx - 0.4 + (j % 3) * 0.16, F + 0.5 + Math.floor(j / 3) * 0.45, m.cz - m.d / 2 + 1.06);
        dec.add(led);
      }
      const slot = props.boxC(0.9, 0.05, 0.02, mat.solid({ color: 0x101214 }), { collide: false, shadow: false });
      slot.position.set(rx, F + 1.75, m.cz - m.d / 2 + 1.06); dec.add(slot);
    }
    const desk = props.boxC(3.4, 0.9, 1.2, mat.solid({ color: 0x4d5359, roughness: 0.55 }));
    desk.position.set(m.cx + 2.5, F + 0.45, m.cz + 1.2); sol.add(desk);
    const deskTop = props.boxC(3.5, 0.08, 1.3, M.wood, { collide: false });
    deskTop.position.set(m.cx + 2.5, F + 0.93, m.cz + 1.2); dec.add(deskTop);
    for (let i = 0; i < 3; i++) {
      const bz2 = props.boxC(0.78, 0.52, 0.08, mat.solid({ color: 0x1b1d20, roughness: 0.5 }), { collide: false, shadow: false });
      bz2.position.set(m.cx + 1.4 + i * 1.1, F + 1.27, m.cz + 0.72); bz2.rotation.x = -0.16; dec.add(bz2);
      const sc = props.boxC(0.7, 0.44, 0.03, LED.cyan, { collide: false, shadow: false });
      sc.position.set(m.cx + 1.4 + i * 1.1, F + 1.28, m.cz + 0.75); sc.rotation.x = -0.16; dec.add(sc);
    }
    const ch = props.chair(mat.solid({ color: 0x45494e, roughness: 0.7 }));
    ch.position.set(m.cx + 2.4, F, m.cz + 2.6); ch.rotation.y = Math.PI + 0.4; sol.add(ch);

    const wbFrame = props.boxC(2.55, 1.65, 0.06, darkMetal, { collide: false, shadow: false });
    wbFrame.position.set(m.cx - 1.0, F + 1.8, m.cz + m.d / 2 - 0.98); dec.add(wbFrame);
    const wb = props.boxC(2.4, 1.5, 0.05, scrawlMat, { collide: false, shadow: false });
    wb.position.set(m.cx - 1.0, F + 1.8, m.cz + m.d / 2 - 1.02); dec.add(wb);

    for (let i = 0; i < 24; i++) {
      const p = props.boxC(0.21, 0.005, 0.28, paperMat, { collide: false, shadow: false });
      p.position.set(m.cx + R.inner.range(-5.5, 5.5), F + 0.008 + i * 0.0008, m.cz + R.inner.range(-3.4, 3.6));
      p.rotation.y = R.inner.range(0, 6.28);
      dec.add(p);
    }

    commit(sol, dec);
    pointLight(m.cx, F + 2.3, m.cz, 2.4, 11, 0xffc98a);                     // 9
    pointLight(m.cx + 2.5, F + 1.7, m.cz + 1.0, 1.8, 8, 0x63c8ff);          // 10
    ctx.hidingSpot(m.cx - 4.5, F, m.cz - m.d / 2 + 2.4, 1.4, 0.9);
  }

  // -- 6d. GENERATOR — diesels, drums, pipework, red panel, holed roof -------
  {
    const m = MOD.gen, sol = new THREE.Group(), dec = new THREE.Group();
    // Built here rather than with props.machine: that helper spins up its own
    // 256px metalPanel set, which was the single most expensive thing in the
    // whole build. M.steel reads the same and is already paid for.
    const greebleMat = mat.metal(0x6a7078, 0.45);
    function dieselGen(seed) {
      const gg = new THREE.Group();
      const rr = { i: seed };
      const rnd = () => { rr.i = (rr.i * 1103515245 + 12345) & 0x7fffffff; return (rr.i % 1000) / 1000; };
      const body = props.boxC(2.6, 1.5, 1.4, M.steel);
      body.position.y = 0.75; gg.add(body);
      for (let k = 0; k < 8; k++) {
        const gw = 0.1 + rnd() * 0.28, gh = 0.08 + rnd() * 0.2, gd = 0.06 + rnd() * 0.14;
        const gb = props.boxC(gw, gh, gd, greebleMat, { collide: false });
        gb.position.set(-1.2 + rnd() * 2.4, 0.25 + rnd() * 1.1, 0.7 + gd / 2);
        gg.add(gb);
      }
      const rad = props.boxC(0.35, 1.1, 1.3, darkMetal, { collide: false });
      rad.position.set(-1.45, 0.7, 0); gg.add(rad);
      const stack = props.cyl(0.09, 0.11, 0.6, darkMetal, { seg: 8, collide: false });
      stack.position.set(0.8, 1.5, -0.35); gg.add(stack);
      const led = props.sphere(0.03, LED.green, { seg: 8, collide: false, shadow: false });
      led.position.set(-0.95, 1.15, 0.72); gg.add(led);
      return gg;
    }
    for (let i = 0; i < 3; i++) {
      const gen = dieselGen(90 + i);
      gen.position.set(m.cx - m.w / 2 + 2.6 + i * 3.4, F, m.cz - 2.6);
      ctx.add(gen);   // left live so it can shudder
      genShake.push({ o: gen, x: gen.position.x, y: gen.position.y, ph: i * 1.7, live: i < 2 });
      const exh = props.cyl(0.11, 0.13, 1.1, darkMetal, { seg: 8, collide: false });
      exh.position.set(m.cx - m.w / 2 + 3.4 + i * 3.4, F + 1.5, m.cz - 3.0); dec.add(exh);
    }
    const drumOrange = M.rust;
    for (let i = 0; i < 6; i++) {
      const b = props.barrel(0.32, 0.9, drumOrange);
      b.position.set(m.cx + m.w / 2 - 1.6 - (i % 3) * 0.8, F, m.cz + 3.4 - Math.floor(i / 3) * 0.8);
      sol.add(b);
    }
    const pipeRun = props.pipes(m.w - 3, 3, 0.1, mat.metal(0x7a7f85, 0.45));
    pipeRun.position.set(m.cx, F + 2.35, m.cz - m.d / 2 + 0.95); dec.add(pipeRun);
    const pipeDrop = props.cyl(0.1, 0.1, 2.0, mat.metal(0x7a7f85, 0.45), { seg: 8, collide: false });
    pipeDrop.position.set(m.cx + 5, F + 0.4, m.cz - m.d / 2 + 0.95); dec.add(pipeDrop);

    const panel = props.boxC(2.2, 1.7, 0.4, mat.solid({ color: 0x3a2222, roughness: 0.6, metalness: 0.3 }));
    panel.position.set(m.cx + 3.5, F + 0.85, m.cz - m.d / 2 + 0.7); sol.add(panel);
    for (let i = 0; i < 6; i++) {
      const d0 = props.boxC(0.24, 0.14, 0.02, LED.panel, { collide: false, shadow: false });
      d0.position.set(m.cx + 2.7 + (i % 3) * 0.8, F + 1.4 - Math.floor(i / 3) * 0.4, m.cz - m.d / 2 + 0.91);
      dec.add(d0);
    }

    // The hole: a rim on the roof, a cold shaft of light, a snow pile below.
    const HX = m.cx - 3.5, HZ = m.cz + 3.0;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.16, 6, 20), M.rust);
    rim.rotation.x = Math.PI / 2; rim.position.set(HX, ROOF_Y + 0.2, HZ);
    rim.userData.collide = false; dec.add(rim);
    const shaft = props.cyl(1.7, 1.0, ROOF_Y - F, mat.emissive(0xcfe4f6, 0.3, { transparent: true, opacity: 0.15, side: THREE.DoubleSide }), { seg: 14, collide: false, shadow: false });
    shaft.position.set(HX, F, HZ); ctx.addDecor(shaft);
    const pile = props.sphere(1.5, packedSnow, { seg: 14, collide: false, shadow: false });
    pile.position.set(HX, F - 0.54, HZ); pile.scale.set(1.15, 0.36, 1.0); dec.add(pile);

    const tarpPivot = new THREE.Group();
    tarpPivot.position.set(HX - 2.0, ROOF_Y + 1.7, HZ);
    const tarp = props.boxC(2.2, 1.6, 0.02, tarpMat, { collide: false, shadow: false });
    tarp.position.set(0, -0.8, 0); tarpPivot.add(tarp);
    ctx.addDecor(tarpPivot);
    swingers.push({ o: tarpPivot, amp: 0.22, sp: 2.4, axis: 'x' });

    commit(sol, dec);
    pointLight(m.cx + 4, F + 2.2, m.cz + 5, 3.4, 12, 0xffb277, true);       // 11 (shadow)
    pointLight(m.cx + 3.5, F + 1.6, m.cz - m.d / 2 + 1.6, 3.0, 9, 0xff3826);// 12
    ctx.hidingSpot(m.cx - m.w / 2 + 2.2, F, m.cz + 4.0, 1.4, 0.9);
  }

  // -- 6e. STORAGE — racking, crates, snowmobile, jammed door, blown-in snow -
  {
    const m = MOD.store, sol = new THREE.Group(), dec = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const rz = m.cz - 3.6 + i * 5.2;
      const rack = props.shelfRack(4, 2, 2.4, 1.2, 1.3, mat.solid({ color: 0xc85f1c, roughness: 0.6, metalness: 0.4 }));
      rack.position.set(m.cx + 3.5, F, rz); sol.add(rack);
      for (let j = 0; j < 7; j++) {
        const cr = props.crate(R.inner.range(0.6, 0.95), M.wood);
        cr.position.set(m.cx - 0.8 + R.inner.range(0, 8.2), F + (j % 2 ? 1.28 : 0.02), rz + R.inner.range(-0.3, 0.3));
        cr.rotation.y = R.inner.range(-0.2, 0.2);
        sol.add(cr);
      }
    }
    for (let i = 0; i < 5; i++) {
      const pl = props.pallet(1.2, 0.9);
      pl.position.set(m.cx - 11 + R.inner.range(0, 4), F, m.cz + R.inner.range(-4.5, 4.5));
      pl.rotation.y = R.inner.range(0, 3); sol.add(pl);
    }

    const sm = new THREE.Group();
    sm.position.set(m.cx - 7.5, F, m.cz + 3.0); sm.rotation.y = 0.5;
    const body = props.boxC(1.1, 0.55, 2.5, mat.solid({ color: 0xd8d2c4, roughness: 0.4, metalness: 0.2 }));
    body.position.y = 0.72; sm.add(body);
    const nose = props.boxC(1.0, 0.35, 0.8, mat.solid({ color: 0xc03a1c, roughness: 0.4 }));
    nose.position.set(0, 0.9, -1.35); sm.add(nose);
    const track = props.boxC(0.85, 0.42, 2.0, mat.solid({ color: 0x1a1c1e, roughness: 0.95 }));
    track.position.set(0, 0.24, 0.35); sm.add(track);
    for (const sx of [-0.55, 0.55]) {
      const ski = props.boxC(0.22, 0.08, 1.3, mat.solid({ color: 0x2a2d31, roughness: 0.6 }), { collide: false });
      ski.position.set(sx, 0.06, -1.2); sm.add(ski);
      const strut = props.cyl(0.04, 0.04, 0.6, darkMetal, { seg: 6, collide: false });
      strut.position.set(sx, 0.1, -1.2); sm.add(strut);
    }
    const bar = props.boxC(0.9, 0.05, 0.05, darkMetal, { collide: false });
    bar.position.set(0, 1.25, -0.6); sm.add(bar);
    const wind = props.boxC(0.7, 0.4, 0.03, mat.glassCheap({ color: 0xa8c4d4, opacity: 0.35 }), { collide: false, shadow: false });
    wind.position.set(0, 1.4, -0.95); wind.rotation.x = 0.3; sm.add(wind);
    sol.add(sm);

    // The jammed-open exterior door and the drift that has blown through it.
    const jam = props.door(1.5, 2.3, M.rust, darkMetal);
    jam.position.set(m.extDoor.x, F, m.cz + m.d / 2 - 0.22);
    jam.rotation.y = Math.PI;
    jam.userData.open(0.75); ctx.add(jam);
    const blown = props.sphere(2.4, packedSnow, { seg: 14, collide: false, shadow: false });
    blown.position.set(m.extDoor.x, F - 0.672, m.cz + m.d / 2 - 1.9);
    blown.scale.set(1.2, 0.28, 1.0); dec.add(blown);
    const tongue = props.boxC(2.2, 0.1, 3.0, packedSnow, { collide: false, shadow: false });
    tongue.position.set(m.extDoor.x, F + 0.05, m.cz + m.d / 2 - 2.6); dec.add(tongue);

    commit(sol, dec);
    pointLight(m.cx - 8, F + 2.3, m.cz, 2.4, 13, 0xffc07a);                 // 13
    pointLight(m.cx + 6, F + 2.3, m.cz - 1, 2.0, 11, 0xffc07a);             // 14
    ctx.hidingSpot(m.cx + 3.5, F, m.cz - 3.6, 1.6, 1.0);
  }

  // ---------------------------------------------------------------------------
  // 7. ELEVATED WALKWAY TUBES
  // ---------------------------------------------------------------------------
  const tubeSegs = [];
  const TUBE_W = 2.7, TUBE_H = 2.5;

  function buildTube(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    tubeSegs.push({ ax, az, bx, bz, cx, cz, ang, len });

    const shell = new THREE.Group();
    shell.position.set(cx, 0, cz); shell.rotation.y = ang;
    for (const sx of [-1, 1]) {
      const wall = props.boxC(0.18, TUBE_H, len, M.cladA);
      wall.position.set(sx * TUBE_W / 2, FLOOR_Y + TUBE_H / 2, 0); shell.add(wall);
      for (let t = -len / 2 + 1.6; t < len / 2 - 1; t += 2.4) {
        const fr = props.boxC(0.1, 0.9, 1.4, mat.metal(0x3d4247, 0.6));
        fr.position.set(sx * (TUBE_W / 2 + 0.04), FLOOR_Y + 1.5, t); shell.add(fr);
      }
    }
    const roof = props.boxC(TUBE_W + 0.3, 0.2, len, M.rust);
    roof.position.set(0, FLOOR_Y + TUBE_H + 0.06, 0); shell.add(roof);
    const deck = props.boxC(TUBE_W, 0.22, len, M.grate);
    deck.position.set(0, FLOOR_Y - 0.11, 0); shell.add(deck);
    for (let t = -len / 2 + 0.4; t < len / 2; t += 1.6) {
      const rib = props.boxC(TUBE_W + 0.34, 0.12, 0.12, M.rust);
      rib.position.set(0, FLOOR_Y + TUBE_H + 0.02, t); shell.add(rib);
      for (const sx of [-1, 1]) {
        const side = props.boxC(0.1, TUBE_H, 0.12, M.rust);
        side.position.set(sx * (TUBE_W / 2 + 0.11), FLOOR_Y + TUBE_H / 2, t); shell.add(side);
      }
    }
    for (let t = -len / 2 + 3; t < len / 2 - 1; t += 6.5) {
      const wx = cx + Math.sin(ang) * t, wz = cz + Math.cos(ang) * t;
      const g0 = gy(wx, wz);
      const lh = FLOOR_Y - 0.24 - g0;
      for (const sx of [-1, 1]) {
        const leg = props.boxC(0.18, lh, 0.18, M.steel);
        leg.position.set(sx * (TUBE_W / 2 - 0.2), g0 + lh / 2, t); shell.add(leg);
      }
      const tie = props.boxC(TUBE_W - 0.3, 0.12, 0.12, M.steel);
      tie.position.set(0, g0 + lh * 0.35, t); shell.add(tie);
    }
    ctx.addDecor(props.freeze(shell));

    const proxy = new THREE.Group();
    proxy.position.set(cx, 0, cz); proxy.rotation.y = ang;
    const pf = props.boxC(TUBE_W + 0.4, 0.3, len + 0.6, invis);
    pf.position.set(0, FLOOR_Y - 0.15, 0); proxy.add(pf);
    for (const sx of [-1, 1]) {
      const pwl = props.boxC(0.3, TUBE_H, len + 0.6, invis);
      pwl.position.set(sx * (TUBE_W / 2 + 0.05), FLOOR_Y + TUBE_H / 2, 0); proxy.add(pwl);
    }
    const pr = props.boxC(TUBE_W + 0.4, 0.24, len + 0.6, invis);
    pr.position.set(0, FLOOR_Y + TUBE_H + 0.1, 0); proxy.add(pr);
    proxy.traverse(o => { if (o.isMesh) { o.visible = false; o.castShadow = false; o.receiveShadow = false; } });
    ctx.addSolid(proxy);

    const nx = Math.cos(ang), nz = -Math.sin(ang);   // tube-space +X in world
    eaveLines.push([ax - nx * (TUBE_W / 2 + 0.2), az - nz * (TUBE_W / 2 + 0.2),
                    bx - nx * (TUBE_W / 2 + 0.2), bz - nz * (TUBE_W / 2 + 0.2), FLOOR_Y + TUBE_H]);
    eaveLines.push([ax + nx * (TUBE_W / 2 + 0.2), az + nz * (TUBE_W / 2 + 0.2),
                    bx + nx * (TUBE_W / 2 + 0.2), bz + nz * (TUBE_W / 2 + 0.2), FLOOR_Y + TUBE_H]);
    snowCapJobs.push([cx, FLOOR_Y + TUBE_H + 0.22, cz, TUBE_W + 0.3, len, ang]);
    return tubeSegs[tubeSegs.length - 1];
  }

  {
    const glow = new THREE.Group();
    const strips = new THREE.Group();
    let ti = 0;
    for (const [ai, bi] of LINKS) {
      const A = MOD[ai], B = MOD[bi];
      const ea = exitPoint(A, B), eb = exitPoint(B, A);
      const t = buildTube(ea.x, ea.z, eb.x, eb.z);

      const gg = new THREE.Group();
      gg.position.set(t.cx, 0, t.cz); gg.rotation.y = t.ang;
      const ss = new THREE.Group();
      ss.position.set(t.cx, 0, t.cz); ss.rotation.y = t.ang;
      for (const sx of [-1, 1]) {
        for (let s = -t.len / 2 + 1.6; s < t.len / 2 - 1; s += 2.4) {
          const p = props.boxC(0.02, 0.72, 1.2, beaconMat, { collide: false, shadow: false });
          p.position.set(sx * (TUBE_W / 2 + 0.02), FLOOR_Y + 1.5, s);
          gg.add(p);
        }
      }
      for (let s = -t.len / 2 + 2; s < t.len / 2 - 1; s += 4.5) {
        const fl = props.fluorescent(1.1, { color: 0xffd7a8, intensity: 3.4 });
        fl.position.set(0, FLOOR_Y + TUBE_H - 0.22, s);
        fl.rotation.y = Math.PI / 2;
        ss.add(fl);
      }
      glow.add(gg); strips.add(ss);
      if (ti % 3 === 0) pointLight(t.cx, FLOOR_Y + 1.9, t.cz, 2.0, 12, 0xffbb84);  // 15, 16
      ti++;
    }
    const fg = props.freeze(glow); fg.traverse(o => { if (o.isMesh) o.castShadow = false; });
    ctx.addDecor(fg);
    const fs = props.freeze(strips); fs.traverse(o => { if (o.isMesh) o.castShadow = false; });
    ctx.addDecor(fs);
  }

  // ---------------------------------------------------------------------------
  // 8. EXTERIOR STAIRS + THE UNDER-MODULE LAYER
  // ---------------------------------------------------------------------------
  /**
   * Grated flight rising along +Z from (x, baseY, z) to topY.
   * The treads are frozen into one draw call and made non-colliding; the
   * capsule rides a single invisible ramp instead, which is both far cheaper
   * and smoother than climbing forty separate slabs.
   * Add with ctx.add() — the group tags its own collision.
   */
  function metalStair(x, z, baseY, topY, width = 1.5) {
    const g = new THREE.Group();
    const vis = new THREE.Group();
    const rise = topY - baseY;
    const n = Math.max(4, Math.round(Math.abs(rise) / 0.18));
    const sh = rise / n, sd = 0.29;
    const run = n * sd;
    const diag = Math.hypot(rise, run);
    const slope = Math.atan2(rise, run);
    for (let i = 0; i < n; i++) {
      const tread = props.boxC(width, 0.07, sd + 0.03, M.grate);
      tread.position.set(0, sh * (i + 1) - 0.035, sd * (i + 0.5));
      vis.add(tread);
      const riser = props.boxC(width, Math.abs(sh), 0.03, darkMetal);
      riser.position.set(0, sh * (i + 0.5), sd * i);
      vis.add(riser);
    }
    for (const sx of [-1, 1]) {
      const str = props.boxC(0.08, 0.26, diag, darkMetal);
      str.position.set(sx * (width / 2 + 0.05), rise / 2 - 0.16, run / 2);
      str.rotation.x = -slope; vis.add(str);
      for (let i = 0; i <= 3; i++) {
        const p = props.cyl(0.025, 0.025, 1.0, darkMetal, { seg: 6, collide: false });
        p.position.set(sx * (width / 2 + 0.05), (rise * i) / 3, (run * i) / 3);
        vis.add(p);
      }
      const rail = props.boxC(0.05, 0.05, diag, darkMetal);
      rail.position.set(sx * (width / 2 + 0.05), rise / 2 + 1.0, run / 2);
      rail.rotation.x = -slope; vis.add(rail);
    }
    const frozen = props.freeze(vis);
    frozen.traverse(o => { if (o.isMesh) { o.userData.collide = false; o.castShadow = false; } });
    g.add(frozen);

    const ramp = props.boxC(width, 0.3, diag, invis, { shadow: false });
    ramp.position.set(0, rise / 2 - 0.15, run / 2);
    ramp.rotation.x = -slope;
    ramp.visible = false; ramp.userData.collide = true;
    g.add(ramp);

    g.position.set(x, baseY, z);
    g.userData.run = run;
    return g;
  }

  for (const m of MODULES) {
    if (!m.extDoor) continue;
    const bx = m.extDoor.x, bz = m.cz + m.d / 2 + 5.4;
    const st = metalStair(bx, bz, gy(bx, bz), FLOOR_Y, 1.5);
    st.rotation.y = Math.PI;
    ctx.add(st);
    const land = props.boxC(2.4, 0.16, 1.8, M.grate);
    land.position.set(bx, FLOOR_Y - 0.08, m.cz + m.d / 2 + 0.9);
    ctx.addSolid(land);
    const rl = props.railing(2.4, 1.0, darkMetal);
    rl.position.set(bx, FLOOR_Y, m.cz + m.d / 2 + 1.75);
    ctx.addDecor(rl);
    if (m.id !== 'store') {
      const dr = props.door(1.4, 2.3, M.rust, darkMetal);
      dr.position.set(bx, FLOOR_Y, m.cz + m.d / 2 - 0.1);
      dr.userData.open(m.id === 'gen' ? 0.35 : 0.0);
      ctx.add(dr);
      if (m.id === 'gen') ctx.onUpdate((dt, t) => dr.userData.open(0.30 + Math.max(0, Math.sin(t * 0.9)) * 0.55));
    }
    const spill = props.boxC(1.2, 2.1, 0.02, mat.emissive(0xffb877, 1.4, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }), { collide: false, shadow: false });
    spill.position.set(bx, FLOOR_Y + 1.05, m.cz + m.d / 2 + 0.06);
    ctx.addDecor(spill);
  }

  // Stored gear packed under every module — the arena's best hiding layer.
  {
    const drumGreen = mat.solid({ color: 0x2f6a3f, roughness: 0.85, metalness: 0.25 });
    const ropeMat = mat.solid({ color: 0xc4a24a, roughness: 0.95 });
    const gear = new THREE.Group(), gearDec = new THREE.Group();
    for (const m of MODULES) {
      for (let i = 0; i < 8; i++) {
        const ux = m.cx + R.out.range(-m.w / 2 + 1, m.w / 2 - 1);
        const uz = m.cz + R.out.range(-m.d / 2 + 1, m.d / 2 - 1);
        const yy = gy(ux, uz);
        const kind = R.out.int(0, 3);
        let o;
        if (kind === 0) o = props.crate(R.out.range(0.7, 1.1), M.wood);
        else if (kind === 1) o = props.barrel(0.32, 0.9, drumGreen);
        else if (kind === 2) o = props.pallet(1.2, 0.9);
        else o = props.box(1.6, 0.5, 0.9, M.wood);
        o.position.set(ux, yy, uz);
        o.rotation.y = R.out.range(0, 6.28);
        gear.add(o);
      }
      const sledX = m.cx + R.out.range(-3, 3), sledZ = m.cz + R.out.range(-2, 2);
      const sled = props.box(0.9, 0.14, 2.4, M.wood);
      sled.position.set(sledX, gy(sledX, sledZ) + 0.16, sledZ);
      sled.rotation.y = R.out.range(0, 3); gear.add(sled);
      const cx2 = m.cx + R.out.range(-4, 4), cz2 = m.cz + R.out.range(-3, 3);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.07, 6, 16), ropeMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(cx2, gy(cx2, cz2) + 0.08, cz2);
      gearDec.add(coil);

      ctx.hidingSpot(m.cx - m.w * 0.28, gy(m.cx - m.w * 0.28, m.cz), m.cz, 1.9, 1.0);
    }
    bakeSplit(gear);
    bakeSplit(gearDec, { shadow: false });
  }

  // ---------------------------------------------------------------------------
  // 9. ICE TUNNELS (y = -4), STAIRWELLS, ICE CAVE
  // ---------------------------------------------------------------------------
  const tunnelBulbMat = animEmissive(0xffc078, 3.6);
  const tunnelBulbFlick = animEmissive(0xffc078, 3.6);
  blinkers.push({ m: tunnelBulbMat, sp: 1.3, ph: 0.2, mode: 'pulse' });
  blinkers.push({ m: tunnelBulbFlick, sp: 11.0, ph: 1.4, mode: 'fault' });

  {
    const lights = new THREE.Group();
    const stores = new THREE.Group();
    const shells = new THREE.Group();
    const ribMat = mat.solid({ color: 0x8fb6d6, roughness: 0.5 });
    let runIdx = 0;
    for (const [x1, z1, x2, z2] of TUNNELS) {
      const len = Math.hypot(x2 - x1, z2 - z1) + 0.4;
      const ang = Math.atan2(x2 - x1, z2 - z1);
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;

      const g = new THREE.Group();
      g.position.set(cx, 0, cz); g.rotation.y = ang;
      const floor = props.boxC(TUN_HW * 2 + 0.4, 0.4, len, M.ice);
      floor.position.set(0, TUN_Y - 0.2, 0); g.add(floor);
      for (const sx of [-1, 1]) {
        const w = props.boxC(0.4, TUN_TOP - TUN_Y, len, M.ice);
        w.position.set(sx * (TUN_HW + 0.2), (TUN_Y + TUN_TOP) / 2, 0); g.add(w);
      }
      // carved arch: half a cylinder, axis along the run, open side down
      const ag = new THREE.CylinderGeometry(TUN_HW, TUN_HW, len, 12, 1, true, 0, Math.PI);
      ag.rotateX(Math.PI / 2); ag.rotateZ(Math.PI / 2);
      const arch = new THREE.Mesh(ag, M.ice);
      arch.position.set(0, TUN_TOP, 0);
      arch.castShadow = false; arch.receiveShadow = true; arch.userData.collide = true;
      g.add(arch);
      // solid snow above the crown so no daylight leaks through the drift
      const cap = props.boxC(TUN_HW * 2 + 0.9, 0.5, len, packedSnow);
      cap.position.set(0, TUN_TOP + TUN_HW + 0.25, 0); g.add(cap);
      for (let t = -len / 2 + 1; t < len / 2; t += 2.4) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(TUN_HW + 0.04, 0.06, 5, 14, Math.PI), ribMat);
        rib.position.set(0, TUN_TOP, t);
        rib.userData.collide = false; rib.castShadow = false; g.add(rib);
      }
      shells.add(g);

      const lg = new THREE.Group();
      lg.position.set(cx, 0, cz); lg.rotation.y = ang;
      festoon(lg, 0.75, -len / 2 + 0.6, 0.75, len / 2 - 0.6, TUN_TOP + 0.75,
        Math.max(2, Math.round(len / 3.2)), runIdx % 3 === 1 ? tunnelBulbFlick : tunnelBulbMat);
      lights.add(lg);

      for (let i = 0; i < Math.floor(len / 7); i++) {
        const t = R.tun.range(-len / 2 + 1.5, len / 2 - 1.5);
        const sx = R.tun.sign() * 1.05;
        const wx = cx + Math.sin(ang) * t + Math.cos(ang) * sx;
        const wz = cz + Math.cos(ang) * t - Math.sin(ang) * sx;
        const cr = props.crate(R.tun.range(0.6, 0.95), M.wood);
        cr.position.set(wx, TUN_Y, wz); cr.rotation.y = R.tun.range(0, 6.28);
        stores.add(cr);
        const crust = props.boxC(1.0, 0.1, 1.0, packedSnow, { collide: false, shadow: false });
        crust.position.set(wx, TUN_Y + 0.82, wz); stores.add(crust);
      }
      runIdx++;
    }
    bakeSplit(stores);
    bakeSplit(shells);
    const fl = props.freeze(lights);
    fl.traverse(o => { if (o.isMesh) o.castShadow = false; });
    ctx.addDecor(fl);

    pointLight(-6, TUN_Y + 2.0, 6, 2.6, 13, 0xffb877);                      // 17
    pointLight(-6, TUN_Y + 2.0, -18, 2.2, 12, 0xffb877);                    // 18
    pointLight(10, TUN_Y + 2.0, -6, 2.0, 12, 0xffb877);                     // 19
    ctx.hidingSpot(-6, TUN_Y, -16, 1.6, 1.0);
    ctx.hidingSpot(14, TUN_Y, -6, 1.6, 1.0);
  }

  /** Vertical ice/steel shaft lining a snow cut-out, with an optional floor. */
  function shaftWalls(h, floorY, material, skip = []) {
    const g = new THREE.Group();
    const top = -0.4, hh = top - floorY;
    const wall = (ax, bx, az, bz) => {
      if (bx - ax < 0.05 || bz - az < 0.05) return;
      const b = props.boxC(bx - ax, hh, bz - az, material);
      b.position.set((ax + bx) / 2, (top + floorY) / 2, (az + bz) / 2);
      g.add(b);
    };
    if (!skip.includes('n')) wall(h.x0 - 0.4, h.x1 + 0.4, h.z0 - 0.4, h.z0);
    if (!skip.includes('s')) wall(h.x0 - 0.4, h.x1 + 0.4, h.z1, h.z1 + 0.4);
    if (!skip.includes('w')) wall(h.x0 - 0.4, h.x0, h.z0, h.z1);
    if (!skip.includes('e')) wall(h.x1, h.x1 + 0.4, h.z0, h.z1);
    const fl = props.boxC(h.x1 - h.x0 + 0.8, 0.4, h.z1 - h.z0 + 0.8, material);
    fl.position.set((h.x0 + h.x1) / 2, floorY - 0.2, (h.z0 + h.z1) / 2);
    g.add(fl);
    bakeSplit(g);
    return g;
  }

  // -- 9a. Ice stairwell beside Stores — the main way down ---------------------
  {
    const h = HOLE_STAIRWELL;
    shaftWalls(h, -4.2, M.ice, ['n']);
    // seal the shoulders either side of the tunnel mouth
    const shoulders = new THREE.Group();
    for (const [ax, bx] of [[h.x0 - 0.4, 2.9], [7.1, h.x1 + 0.4]]) {
      const b = props.boxC(bx - ax, 3.8, 0.4, M.ice);
      b.position.set((ax + bx) / 2, -2.3, h.z0 - 0.2);
      shoulders.add(b);
    }
    bakeSplit(shoulders);
    ctx.add(metalStair(5, 19.2, -4, 0, 2.0));
    const rail = props.railing(5.6, 1.0, darkMetal);
    rail.position.set(5, 0.15, h.z1 + 0.4); rail.rotation.y = 0;
    ctx.addDecor(rail);
    const sign = props.sign('ICE TUNNEL\n-4 m', { background: 0x1c2a34, color: 0x8fd8ff, height: 0.62, fontSize: 64, emissive: 0x2f6f9c });
    sign.position.set(7.6, -1.4, 22); sign.rotation.y = -Math.PI / 2;
    ctx.addDecor(sign);
    pointLight(5, -1.5, 21, 2.2, 11, 0xffbe86);                             // 20
    ctx.hidingSpot(3.2, -4.0, 24.5, 1.4, 0.9);
  }

  // -- 9b. Lab stair — comes up into the dark under the LAB --------------------
  {
    const h = HOLE_LABSTAIR;
    const g = new THREE.Group();
    const wall = (ax, bx, az, bz) => {
      const b = props.boxC(bx - ax, 4.0, bz - az, M.ice);
      b.position.set((ax + bx) / 2, -2.4, (az + bz) / 2); g.add(b);
    };
    wall(h.x0 - 0.4, h.x0, h.z0, h.z1);            // west
    wall(h.x0 - 0.4, h.x1 + 0.4, h.z0 - 0.4, h.z0); // south
    wall(h.x1, h.x1 + 0.4, h.z0, -28.2);            // east, below the tunnel
    wall(h.x0 - 0.4, -16.9, h.z1, h.z1 + 0.4);      // north shoulder
    const fl = props.boxC(h.x1 - h.x0 + 0.8, 0.4, h.z1 - h.z0 + 0.8, M.ice);
    fl.position.set((h.x0 + h.x1) / 2, -4.4, (h.z0 + h.z1) / 2); g.add(fl);
    bakeSplit(g);

    const st = metalStair(-16, -26.4, -4, 0, 1.8);
    st.rotation.y = Math.PI;
    ctx.add(st);
    const rail = props.railing(5.0, 1.0, darkMetal);
    rail.position.set(-16, 0.15, -34.2);
    ctx.addDecor(rail);
    ctx.hidingSpot(-17.5, -4.0, -31, 1.4, 1.0);
  }

  // -- 9c. Collapsed hatch pit + ladder ---------------------------------------
  {
    const h = HOLE_PIT;
    shaftWalls(h, -4.2, M.ice, ['n']);
    const pitBits = new THREE.Group();
    for (const [ax, bx] of [[h.x0 - 0.4, 24.4], [28.6, h.x1 + 0.4]]) {
      const b = props.boxC(bx - ax, 3.8, 0.4, M.ice);
      b.position.set((ax + bx) / 2, -2.3, h.z0 - 0.2);
      pitBits.add(b);
    }
    const lad = props.ladder(4.4, darkMetal);
    lad.position.set(26.5, -4.0, -13.2);
    props.COLLIDE(lad); pitBits.add(lad);
    // fallen ice blocks double as steps, so the pit works in both directions
    for (let i = 0; i < 4; i++) {
      const b = props.boxC(1.7, 1.05, 1.2, M.ice);
      b.position.set(25.4 + i * 0.2, -3.5 + i * 1.0, -13.4 + i * 0.95);
      pitBits.add(b);
    }
    bakeSplit(pitBits);
    // hazard rim, four bars so the pit mouth stays open
    for (const [bx, bz, bw, bd] of [
      [26.5, h.z0 - 0.9, 6.6, 0.5], [26.5, h.z1 + 0.9, 6.6, 0.5],
      [h.x0 - 0.9, -11.5, 0.5, 5.0], [h.x1 + 0.9, -11.5, 0.5, 5.0],
    ]) {
      const bar = props.boxC(bw, 0.26, bd, hazardMat, { collide: false, shadow: false });
      bar.position.set(bx, 0.28, bz); ctx.addDecor(bar);
    }
    ctx.hidingSpot(26.5, -4.0, -12.5, 1.6, 1.0);
  }

  // -- 9d. Ice cave — the tunnel breaks into a natural void ---------------------
  {
    const CCX = -6, CCZ = 34.5;
    const cave = new THREE.Group();
    cave.position.set(CCX, 0, CCZ);
    const floor = props.boxC(15, 0.6, 14, M.ice);
    floor.position.set(0, CAVE_FLOOR - 0.3, 0); cave.add(floor);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dn = Math.min(Math.abs(a), Math.abs(a - Math.PI * 2));
      if (dn < 0.5) continue;                        // north — opens on the crevasse
      if (Math.abs(a - Math.PI) < 0.42) continue;    // south — the tunnel arrives
      const r0 = 6.4 + R.tun.range(-0.5, 0.9);
      const wl = props.boxC(3.2, 5.0, 1.2, M.ice);
      wl.position.set(Math.sin(a) * r0, -3.0, Math.cos(a) * r0);
      wl.rotation.y = -a + R.tun.range(-0.2, 0.2);
      wl.rotation.z = R.tun.range(-0.12, 0.12);
      cave.add(wl);
    }
    const roof = props.boxC(15, 0.8, 14, M.ice);
    roof.position.set(0, -0.6, 0); cave.add(roof);
    bakeSplit(cave);

    const slot = props.boxC(1.4, 0.1, 7.0, mat.emissive(0x9fd6ff, 2.6), { collide: false, shadow: false });
    slot.position.set(CCX + 1.5, -1.05, CCZ); ctx.addDecor(slot);
    const beam = props.boxC(2.2, 4.2, 7.0, mat.emissive(0x8ec8f0, 0.5, { transparent: true, opacity: 0.13, side: THREE.DoubleSide }), { collide: false, shadow: false });
    beam.position.set(CCX + 1.5, -3.1, CCZ); ctx.addDecor(beam);
    pointLight(CCX + 1.5, -2.6, CCZ, 3.4, 16, 0x86c8f4);                    // 21
    pointLight(CCX, CAVE_FLOOR + 1.5, CCZ + 4, 1.8, 14, 0x4f8fc4);          // 22

    const pillars = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = R.tun.range(0, 6.28), r0 = R.tun.range(2.6, 4.8);
      const pil = props.cyl(R.tun.range(0.25, 0.6), R.tun.range(0.4, 0.9), 4.4, deepIce, { seg: 8 });
      pil.position.set(CCX + Math.sin(a) * r0, CAVE_FLOOR, CCZ + Math.cos(a) * r0);
      pillars.add(pil);
    }
    bakeSplit(pillars);
    // ramps: tunnel (-4) -> cave (-5.2) -> crevasse floor (-6.2)
    const rampIn = props.boxC(3.4, 0.5, 4.2, M.ice);
    rampIn.position.set(CCX, -4.85, 28); rampIn.rotation.x = 0.29;
    ctx.addSolid(rampIn);
    const rampOut = props.boxC(4.0, 0.5, 3.9, M.ice);
    rampOut.position.set(CCX, -5.95, 40.75); rampOut.rotation.x = 0.259;
    ctx.addSolid(rampOut);

    ctx.hidingSpot(CCX - 4.5, CAVE_FLOOR, CCZ - 2, 1.9, 1.0);
  }

  // ---------------------------------------------------------------------------
  // 10. CREVASSE — hazard, landmark, and the best hiding place on the map
  // ---------------------------------------------------------------------------
  {
    const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = HOLE_CREVASSE;
    const wallH = -0.4 - CREV_FLOOR;           // -0.4 .. -6.2
    const wallY = (-0.4 + CREV_FLOOR) / 2;
    const g = new THREE.Group();
    // north face, split so the ice cave can break through around x = -6
    for (const [ax, bx] of [[X0 - 0.6, -9.5], [-2.5, X1 + 0.6]]) {
      const w = props.boxC(bx - ax, wallH, 0.6, M.ice);
      w.position.set((ax + bx) / 2, wallY, Z0 - 0.3); g.add(w);
    }
    const sWall = props.boxC(X1 - X0 + 1.2, wallH, 0.6, M.ice);
    sWall.position.set((X0 + X1) / 2, wallY, Z1 + 0.3); g.add(sWall);
    for (const [wx, sgn] of [[X0, -1], [X1, 1]]) {
      const w = props.boxC(0.6, wallH, Z1 - Z0, M.ice);
      w.position.set(wx + sgn * 0.3, wallY, (Z0 + Z1) / 2); g.add(w);
    }
    const floor = props.boxC(X1 - X0 + 1.2, 0.8, Z1 - Z0 + 1.2, M.ice);
    floor.position.set((X0 + X1) / 2, CREV_FLOOR - 0.4, (Z0 + Z1) / 2); g.add(floor);
    bakeSplit(g);

    // Cornices — overhanging snow lips that narrow the crack and give the
    // edge somewhere to stand. Skipped over the west ramp so you can get in.
    const corn = new THREE.Group();
    for (let x = X0 + 2; x < X1 - 2; x += 3.4) {
      if (x < -26) continue;
      for (const [zEdge, dir] of [[Z0, 1], [Z1, -1]]) {
        const depth = 1.1 + (noise.fbm(x * 0.12, zEdge * 0.1, 3) * 0.5 + 0.5) * 1.3;
        const lip = props.boxC(3.5, 0.5, depth, packedSnow);
        lip.position.set(x, -0.1, zEdge + dir * depth / 2);
        lip.rotation.x = dir * 0.05;
        corn.add(lip);
      }
    }
    bakeSplit(corn);

    // West entry ramp: snow slope from the lip down to the floor.
    const ramp = props.boxC(18.1, 0.6, 5.0, packedSnow);
    ramp.position.set(X0 + 8.5, CREV_FLOOR / 2 + 0.05, 44);
    ramp.rotation.z = -Math.atan2(6.2, 17);
    ctx.addSolid(ramp);

    // The ledge, tucked under the south lip 3.6 m down.
    const ledge = props.boxC(15, 0.6, 3.0, M.ice);
    ledge.position.set(-4, -2.9, Z1 - 1.5); ctx.addSolid(ledge);
    const ledgeRamp = props.boxC(9.23, 0.5, 2.8, M.ice);
    ledgeRamp.position.set(-16, -4.4, Z1 - 1.6);
    ledgeRamp.rotation.z = Math.atan2(3.6, 8.5);
    ctx.addSolid(ledgeRamp);
    const ledgeBack = props.boxC(15, 2.4, 0.3, M.ice);
    ledgeBack.position.set(-4, -1.6, Z1 - 0.15); ctx.addSolid(ledgeBack);
    ctx.hidingSpot(-4, -2.6, Z1 - 1.6, 2.5, 1.0);
    ctx.hidingSpot(-26, CREV_FLOOR, 44, 2.2, 1.0);

    // Plank bridge, ropes, and a warning board.
    {
      const br = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const p = props.boxC(0.34, 0.09, 9.4, M.wood);
        p.position.set(10 - 1.05 + i * 0.35, 0.2, 44);
        p.rotation.z = R.out.range(-0.012, 0.012);
        br.add(p);
      }
      for (const sx of [-1.4, 1.4]) {
        const beam = props.boxC(0.16, 0.2, 9.6, darkMetal);
        beam.position.set(10 + sx, 0.08, 44); br.add(beam);
      }
      bakeSplit(br);
      for (const sx of [-1.5, 1.5]) {
        for (let i = 0; i <= 4; i++) {
          const post = props.cyl(0.035, 0.035, 1.0, darkMetal, { seg: 6, collide: false });
          post.position.set(10 + sx, 0.25, 39.9 + i * 2.05);
          ctx.addDecor(post);
        }
        const rope = props.boxC(0.03, 0.03, 8.4, mat.solid({ color: 0xd8c07a, roughness: 0.95 }), { collide: false, shadow: false });
        rope.position.set(10 + sx, 1.15, 44); ctx.addDecor(rope);
      }
      const warn = props.sign('CREVASSE\nROPE UP', { background: 0xe8b32a, color: 0x1a1a1a, height: 0.7, fontSize: 72 });
      warn.position.set(10, 1.5, 37.2); ctx.addDecor(warn);
    }

    // Deep blue glow so the crack reads from above through the whiteout.
    const glow = props.boxC(X1 - X0 - 2, 0.1, Z1 - Z0 - 1, mat.emissive(0x2f6f9c, 1.2), { collide: false, shadow: false });
    glow.position.set((X0 + X1) / 2, CREV_FLOOR + 0.4, (Z0 + Z1) / 2);
    ctx.addDecor(glow);
    pointLight(-6, -3.5, 44, 3.0, 26, 0x6fb4e4);                            // 23
  }

  // ---------------------------------------------------------------------------
  // 11. OUTDOOR LANDMARKS
  // ---------------------------------------------------------------------------
  const turbines = [];

  /** Taut cable between two world points. */
  function wire(ax, ay, az, bx, by, bz, r = 0.03) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const s = props.boxC(r, r, len, cableMat, { collide: false, shadow: false });
    s.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    s.lookAt(bx, by, bz);
    return s;
  }

  // -- 11a. Mast, guy wires, service platform, wind turbine -------------------
  const MX = 58, MZ = -34, MBASE = gy(MX, MZ);
  {
    const mast = new THREE.Group();
    mast.position.set(MX, MBASE, MZ);
    for (let i = 0; i < 3; i++) {
      const sec = props.cyl(0.16 - i * 0.03, 0.2 - i * 0.03, 6, darkMetal, { seg: 8 });
      sec.position.y = i * 6; mast.add(sec);
      for (let j = 0; j < 4; j++) {
        const br = props.boxC(0.06, 0.06, 1.5, darkMetal, { collide: false });
        br.position.set(0, i * 6 + 1.4 + j * 1.4, 0);
        br.rotation.set(0, (j * Math.PI) / 2, 0.5);
        mast.add(br);
      }
    }
    ctx.add(mast);

    const st = metalStair(56.5, MZ + 7.0, MBASE, MBASE + 6.5, 1.2);
    st.rotation.y = Math.PI;
    ctx.add(st);
    const plat = props.boxC(5.0, 0.16, 4.0, M.grate);
    plat.position.set(MX, MBASE + 6.42, MZ - 4.5);
    ctx.addSolid(plat);
    for (const [rx, rz, ry] of [[0, -2.0, 0], [0, 2.0, 0], [-2.5, 0, Math.PI / 2], [2.5, 0, Math.PI / 2]]) {
      const rl = props.railing(rz === 0 ? 4.0 : 5.0, 1.05, darkMetal);
      rl.position.set(MX + rx, MBASE + 6.5, MZ - 4.5 + rz); rl.rotation.y = ry;
      ctx.addDecor(rl);
    }

    const bl = props.sphere(0.16, LED.beaconTop, { seg: 10, collide: false, shadow: false });
    bl.position.set(MX, MBASE + 17.9, MZ); ctx.addDecor(bl);

    const guys = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const ax = MX + Math.cos(a) * 13, az = MZ + Math.sin(a) * 13;
      const ay = gy(ax, az);
      guys.add(wire(MX, MBASE + 15, MZ, ax, ay + 0.4, az));
      const anchor = props.boxC(0.5, 0.5, 0.5, darkMetal);
      anchor.position.set(ax, ay + 0.2, az); ctx.add(anchor);
    }
    ctx.addDecor(props.freeze(guys));

    const TX = 50, TZ = -26, TB = gy(TX, TZ);
    const tower = props.cyl(0.22, 0.34, 9, M.steel, { seg: 10 });
    tower.position.set(TX, TB, TZ); ctx.addSolid(tower);
    const nac = props.boxC(0.7, 0.6, 1.6, mat.solid({ color: 0xd8dce0, roughness: 0.5 }), { collide: false });
    nac.position.set(TX, TB + 9.2, TZ); ctx.addDecor(nac);
    const rotor = new THREE.Group();
    rotor.position.set(TX, TB + 9.25, TZ - 0.95);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 3) * Math.PI * 2;
      const blade = props.boxC(0.16, 3.4, 0.05, mat.solid({ color: 0xeef2f5, roughness: 0.4 }), { collide: false, shadow: false });
      blade.position.set(0, 1.7, 0);
      arm.add(blade); rotor.add(arm);
    }
    const hub = props.sphere(0.22, mat.solid({ color: 0xc8ccd0, roughness: 0.5 }), { seg: 10, collide: false, shadow: false });
    hub.position.y = -0.22; rotor.add(hub);
    ctx.addDecor(rotor);
    turbines.push(rotor);
  }

  // -- 11b. Antenna array ------------------------------------------------------
  {
    const AX = 46, AZ = 34;
    const arr = new THREE.Group(), poles = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const ax = AX + (i % 3) * 6, az = AZ + Math.floor(i / 3) * 7;
      const ay = gy(ax, az);
      const pole = props.cyl(0.08, 0.11, 5 + (i % 3), darkMetal, { seg: 8 });
      pole.position.set(ax, ay, az); poles.add(pole);
      for (let j = 0; j < 5; j++) {
        const el = props.boxC(1.6 - j * 0.2, 0.04, 0.04, darkMetal, { collide: false, shadow: false });
        el.position.set(ax, ay + 2.2 + j * 0.6, az); arr.add(el);
      }
      if (i % 2 === 0) {
        const dish = props.cyl(0.9, 0.15, 0.35, mat.solid({ color: 0xdde2e6, roughness: 0.55 }), { seg: 14, open: true, collide: false, shadow: false });
        dish.position.set(ax, ay + 3.4, az); dish.rotation.x = -0.9; arr.add(dish);
      }
    }
    bakeSplit(arr, { shadow: false });
    bakeSplit(poles);
  }

  // -- 11c. Buried Snowcat -----------------------------------------------------
  {
    const SX = -66, SZ = 22, sy = gy(SX, SZ);
    const cat = new THREE.Group();
    cat.position.set(SX, sy - 0.9, SZ); cat.rotation.y = 0.7;
    const body = props.boxC(3.2, 1.6, 6.0, mat.solid({ color: 0xc0521e, roughness: 0.55, metalness: 0.3 }));
    body.position.y = 1.3; cat.add(body);
    const cab = props.boxC(2.6, 1.5, 2.4, mat.solid({ color: 0xa8441a, roughness: 0.5 }));
    cab.position.set(0, 2.7, -0.8); cat.add(cab);
    const glassM = mat.glassCheap({ color: 0x1c2a34, opacity: 0.5 });
    for (const [gx, gz, gw, gd] of [[0, -2.02, 2.2, 0.05], [-1.32, -0.8, 0.05, 2.0], [1.32, -0.8, 0.05, 2.0]]) {
      const gl = props.boxC(gw, 1.0, gd, glassM, { collide: false, shadow: false });
      gl.position.set(gx, 2.8, gz); cat.add(gl);
    }
    for (const sx of [-1.7, 1.7]) {
      const tr = props.boxC(0.9, 1.1, 5.6, mat.solid({ color: 0x25282b, roughness: 0.95 }));
      tr.position.set(sx, 0.55, 0.2); cat.add(tr);
    }
    const blade = props.boxC(4.2, 1.0, 0.3, M.rust);
    blade.position.set(0, 0.9, -3.4); blade.rotation.x = 0.2; cat.add(blade);
    bakeSplit(cat);
    const bury = props.sphere(4.2, packedSnow, { seg: 16, collide: false, shadow: false });
    bury.position.set(SX + 1.5, sy - 3.4, SZ + 1.2); bury.scale.set(1.4, 0.55, 1.1);
    ctx.addDecor(bury);
    ctx.hidingSpot(SX - 2.6, sy, SZ + 2, 1.9, 1.0);
  }

  // -- 11d. Collapsed geodesic dome --------------------------------------------
  {
    const DX = -68, DZ = -46, DY = gy(DX, DZ);
    const strutM = mat.metal(0x9aa4ad, 0.5);
    const panelM = mat.solid({ color: 0xe4ecf2, roughness: 0.6, transparent: true, opacity: 0.55 });
    const dome = new THREE.Group();
    dome.position.set(DX, DY, DZ);
    const pts = [];
    for (let ring = 0; ring < 3; ring++) {
      const phi = ((ring + 1) / 4) * (Math.PI / 2);
      const n = 8 + ring * 2;
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2;
        const collapse = (ring >= 1 && th > 2.2 && th < 4.6) ? 0.22 : 1.0;
        pts.push([Math.cos(th) * Math.cos(phi) * 8, Math.sin(phi) * 6 * collapse, Math.sin(th) * Math.cos(phi) * 8]);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (len > 7) continue;
      const s = props.boxC(0.09, 0.09, len, strutM, { collide: false });
      s.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      s.lookAt(b[0], b[1], b[2]);
      dome.add(s);
      if (i % 3 === 0 && a[1] > 0.8) {
        const panel = props.boxC(2.2, 2.2, 0.05, panelM, { collide: false, shadow: false });
        panel.position.set(a[0] * 0.92, a[1] * 0.92, a[2] * 0.92);
        panel.lookAt(0, 0, 0);
        dome.add(panel);
      }
    }
    ctx.addDecor(dome);
    const rb = props.rubble(5, 16, mat.solid({ color: 0xcfdae6, roughness: 0.7, flat: true }), 77);
    rb.position.set(DX, DY, DZ); ctx.add(rb);
    ctx.hidingSpot(DX, DY, DZ, 2.8, 1.0);
  }

  // -- 11e. Fuel bladders + the drum graveyard ---------------------------------
  {
    for (let i = 0; i < 4; i++) {
      const bx = 62 + (i % 2) * 9, bz = 12 + Math.floor(i / 2) * 8;
      const by = gy(bx, bz);
      const bl = props.sphere(2.6, mat.solid({ color: 0x1f2a30, roughness: 0.85 }), { seg: 16, collide: false });
      bl.position.set(bx, by - 0.68, bz); bl.scale.set(1.5, 0.32, 1.1);
      ctx.addDecor(bl);
      const blProxy = props.boxC(7.4, 1.7, 5.4, invis, { shadow: false });
      blProxy.position.set(bx, by + 0.15, bz);
      blProxy.visible = false; blProxy.userData.collide = true;
      ctx.add(blProxy);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.05, 5, 18), darkMetal);
      strap.rotation.x = Math.PI / 2; strap.position.set(bx, by + 0.4, bz);
      strap.scale.set(1.6, 1.15, 1); strap.castShadow = false;
      ctx.addDecor(strap);
    }
    const drumGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.88, 12);
    drumGeo.translate(0, 0.44, 0);
    const drumMat = M.rust;
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
    const solidDrums = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const a = R.out.range(0, 6.28), d0 = Math.sqrt(R.out()) * 12;
      const x = -66 + Math.cos(a) * d0, z = -12 + Math.sin(a) * d0 * 0.8;
      const b = props.barrel(0.31, 0.88, drumMat);
      b.position.set(x, gy(x, z), z); solidDrums.add(b);
    }
    bakeSplit(solidDrums);
    ctx.hidingSpot(-66, gy(-66, -12), -12, 2.8, 1.0);
  }

  // -- 11f. Swinging exterior lamp + a torn tarp on a frame --------------------
  {
    const lx = -30, lz = 2, ly = gy(lx, lz);
    const post = props.cyl(0.1, 0.13, 4.6, darkMetal, { seg: 8 });
    post.position.set(lx, ly, lz); ctx.addSolid(post);
    const arm = props.boxC(1.4, 0.08, 0.08, darkMetal, { collide: false });
    arm.position.set(lx + 0.7, ly + 4.5, lz); ctx.addDecor(arm);
    const pivot = new THREE.Group();
    pivot.position.set(lx + 1.35, ly + 4.45, lz);
    const shade = props.cyl(0.3, 0.14, 0.3, darkMetal, { seg: 12, open: true, collide: false });
    shade.position.y = -0.3; shade.rotation.x = Math.PI; pivot.add(shade);
    const bulb = props.sphere(0.1, mat.emissive(0xffcf8a, 7.0), { seg: 10, collide: false, shadow: false });
    bulb.position.y = -0.38; pivot.add(bulb);
    ctx.addDecor(pivot);
    const lamp = new THREE.PointLight(0xffc182, 3.0, 15, 1.7);
    lamp.position.set(lx + 1.35, ly + 4.05, lz);
    ctx.light(lamp); lightCount++;                                          // 24
    swingers.push({ o: pivot, amp: 0.28, sp: 1.35, light: lamp, ox: lx + 1.35, oy: ly + 4.05, oz: lz });

    const fx = 16, fz = 24, fy = gy(fx, fz);
    for (const sx of [-2.2, 2.2]) {
      const p = props.cyl(0.07, 0.09, 2.4, darkMetal, { seg: 6 });
      p.position.set(fx + sx, fy, fz); ctx.addSolid(p);
    }
    const beam = props.boxC(4.6, 0.09, 0.09, darkMetal, { collide: false });
    beam.position.set(fx, fy + 2.4, fz); ctx.addDecor(beam);
    const tp = new THREE.Group();
    tp.position.set(fx, fy + 2.38, fz);
    const cloth = props.boxC(4.2, 2.0, 0.02, tarpMat, { collide: false, shadow: false });
    cloth.position.set(0, -1.0, 0); tp.add(cloth);
    ctx.addDecor(tp);
    swingers.push({ o: tp, amp: 0.16, sp: 2.6, axis: 'x' });
  }

  // -- 11g. Orange route flags — the only wayfinding in a whiteout ------------
  {
    const route = [
      [-43.5, 5.5], [-41, -1], [-35, -6], [-27, -4], [-19, 0], [-13, 4], [-9, 12],
      [-2, 16], [6, 18], [14, 16], [22, 12], [30, 8], [35, 1], [30, -6], [24, -12],
      [16, -14], [8, -18], [0, -22], [-8, -26], [-16, -28], [-24, -26], [-32, -22],
      [-38, -16], [-41, -8], [-2, 24], [-4, 30], [-6, 36], [4, 38], [14, 34],
      [-52, 10], [-58, 16], [-63, 21], [-70, -6], [-66, -15], [40, -20], [48, -26],
      [54, -30], [52, 4], [58, 10], [64, 15],
    ];
    const poleGeo = new THREE.CylinderGeometry(0.028, 0.028, 2.1, 5);
    poleGeo.translate(0, 1.05, 0);
    const poles = props.scatter(poleGeo, mat.solid({ color: 0x2b2f33, roughness: 0.8 }), route.length, (i, dm) => {
      const [x, z] = route[i];
      dm.position.set(x, gy(x, z) - 0.1, z);
      dm.rotation.z = noise.fbm(x * 0.3, z * 0.3, 2) * 0.14;
    }, 55);
    poles.castShadow = false;
    ctx.addDecor(poles);
    const flagGeo = new THREE.PlaneGeometry(0.44, 0.3);
    flagGeo.translate(0.22, 0, 0);
    const flags = props.scatter(flagGeo, flagCloth, route.length, (i, dm, r) => {
      const [x, z] = route[i];
      dm.position.set(x + 0.02, gy(x, z) + 1.82, z);
      dm.rotation.y = 1.9 + r.range(-0.5, 0.5);
    }, 56);
    flags.castShadow = false;
    ctx.addDecor(flags);
  }

  // ---------------------------------------------------------------------------
  // 12. DETAIL PASS — snow accumulation, drifts, icicles, cable runs
  // ---------------------------------------------------------------------------

  // 12a. A slab of snow on every roof and tube top, plus a wind-sculpted lump.
  {
    const caps = new THREE.Group();
    for (const [x, y, z, w, d, ang] of snowCapJobs) {
      const cap = props.boxC(w, 0.24, d, packedSnow, { collide: false, shadow: false });
      cap.position.set(x, y, z);
      if (ang !== undefined) cap.rotation.y = ang;
      caps.add(cap);
      const lump = props.sphere(1.0, packedSnow, { seg: 12, collide: false, shadow: false });
      lump.position.set(x + w * 0.12, y - 0.1, z);
      lump.scale.set(w * 0.26, 0.5, Math.min(d, 6) * 0.26);
      if (ang !== undefined) lump.rotation.y = ang;
      caps.add(lump);
    }
    ctx.addDecor(props.freeze(caps));
  }

  // 12b. Drifts — instanced half-ellipsoids banked against every windward face.
  {
    const driftGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const anchors = [];
    for (const m of MODULES) {
      for (let i = 0; i <= 8; i++) {
        anchors.push([m.cx + m.w / 2 + 0.7, m.cz - m.d / 2 + (i / 8) * m.d, 0]);
        anchors.push([m.cx - m.w / 2 + (i / 8) * m.w, m.cz - m.d / 2 - 0.7, 1]);
      }
    }
    for (const t of tubeSegs) {
      for (let i = 0; i <= 6; i++) {
        const q = i / 6;
        anchors.push([t.ax + (t.bx - t.ax) * q + 2.4, t.az + (t.bz - t.az) * q, 0]);
      }
    }
    const drifts = props.scatter(driftGeo, packedSnow, anchors.length + 240, (i, dm, r) => {
      let x, z, along;
      if (i < anchors.length) {
        const a = anchors[i];
        x = a[0] + r.range(-1.0, 1.0); z = a[1] + r.range(-1.0, 1.0); along = a[2];
      } else {
        x = r.range(-BOUND_X + 5, BOUND_X - 5); z = r.range(-BOUND_Z + 5, BOUND_Z - 5);
        along = r.int(0, 1);
      }
      if (inHole(x, z)) return false;
      const sx = r.range(2.5, 7.0), sz = r.range(1.6, 4.0), sy = r.range(0.5, 1.5);
      dm.position.set(x, gy(x, z) - sy * 0.35, z);
      dm.rotation.y = (along ? 0 : Math.PI / 2) + r.range(-0.35, 0.35);
      dm.scale.set(sx, sy, sz);
    }, 909);
    ctx.addDecor(drifts);

    // Three drifts big enough — and solid enough — to actually hide behind.
    for (let i = 0; i < 3; i++) {
      const a = 1.1 + i * 2.1, d0 = 30 + i * 14;
      const x = Math.cos(a) * d0, z = Math.sin(a) * d0 * 0.8;
      if (inHole(x, z)) continue;
      const rot = R.detail.range(0, 3);
      const dr = props.sphere(3.4, packedSnow, { seg: 14, collide: false });
      dr.position.set(x, gy(x, z) - 1.53, z);
      dr.scale.set(1.8, 0.45, 1.1);
      dr.rotation.y = rot;
      ctx.addDecor(dr);
      const drProxy = props.boxC(11.0, 1.5, 6.6, invis, { shadow: false });
      drProxy.position.set(x, gy(x, z) + 0.2, z);
      drProxy.rotation.y = rot;
      drProxy.visible = false; drProxy.userData.collide = true;
      ctx.add(drProxy);
      ctx.hidingSpot(x - 2.6, gy(x - 2.6, z), z, 2.0, 0.9);
    }
  }

  // 12c. Icicles off every eave.
  {
    const ic = new THREE.ConeGeometry(0.055, 0.62, 5);
    ic.rotateX(Math.PI);
    ic.translate(0, -0.31, 0);
    const icicleMat = mat.solid({ color: 0xcfe6f7, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.85 });
    const icicles = props.scatter(ic, icicleMat, 560, (i, dm, r) => {
      const e = eaveLines[i % eaveLines.length];
      const t = r();
      dm.position.set(e[0] + (e[2] - e[0]) * t, e[4] + 0.1, e[1] + (e[3] - e[1]) * t);
      dm.scale.set(r.range(0.6, 1.5), r.range(0.5, 2.4), r.range(0.6, 1.5));
      dm.rotation.y = r() * 6.28;
    }, 1212);
    icicles.castShadow = false;
    ctx.addDecor(icicles);
  }

  // 12d. Cable runs stapled along the flanks, plus rust weeping from the seams.
  {
    const trim = new THREE.Group();
    const streakMat = mat.solid({ color: 0x5a3418, roughness: 0.95, transparent: true, opacity: 0.5 });
    for (const m of MODULES) {
      const run = props.boxC(m.w + 0.4, 0.06, 0.06, cableMat, { collide: false, shadow: false });
      run.position.set(m.cx, DECK_Y + 2.55, m.cz + m.d / 2 + 0.22); trim.add(run);
      for (let i = 0; i < 6; i++) {
        const drop = props.boxC(0.05, 0.9, 0.05, cableMat, { collide: false, shadow: false });
        drop.position.set(m.cx - m.w / 2 + 1.5 + i * (m.w - 3) / 5, DECK_Y + 2.1, m.cz + m.d / 2 + 0.22);
        trim.add(drop);
      }
      for (let i = 0; i < 6; i++) {
        const st = props.boxC(0.22, R.detail.range(0.8, 2.2), 0.01, streakMat, { collide: false, shadow: false });
        st.position.set(m.cx + R.detail.range(-m.w / 2 + 1, m.w / 2 - 1), DECK_Y + 1.6, m.cz + m.d / 2 + 0.17);
        trim.add(st);
      }
    }
    ctx.addDecor(props.freeze(trim));
  }

  // ---------------------------------------------------------------------------
  // 13. BLIZZARD
  //     Instanced streaks in a box that follows the camera and wraps. The
  //     camera is captured in onBeforeRender because ctx has no handle on it.
  // ---------------------------------------------------------------------------
  const WIND = new THREE.Vector3(-11.5, -1.4, 5.0);
  const camPos = new THREE.Vector3(-42, 1.6, 4);
  let camReady = false;
  const flakeGeo = props.billboardCross(0.05, 0.7);
  flakeGeo.rotateZ(1.18);                                  // lay the streak over
  flakeGeo.rotateY(Math.atan2(WIND.x, WIND.z));            // align it with the wind
  const flakeMat = mat.painted(32, 32, (c, W, H) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.4, 'rgba(246,251,255,0.95)');
    g.addColorStop(0.65, 'rgba(240,248,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(W * 0.28, 0, W * 0.44, H);
  }, { transparent: true, alphaTest: 0.04, depthWrite: false, roughness: 1, emissive: 0xa8c0d8, emissiveIntensity: 0.55 });

  {
    const FULL = ctx.lod >= 2 ? 3000 : (ctx.lod >= 1 ? 1900 : 1100);
    const CX = 46, CY = 30, CZ = 46, HX = CX / 2, HY = CY / 2, HZ = CZ / 2;
    const snowMesh = new THREE.InstancedMesh(flakeGeo, flakeMat, FULL);
    snowMesh.frustumCulled = false;
    snowMesh.castShadow = false; snowMesh.receiveShadow = false;
    snowMesh.userData.collide = false;
    snowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const px = new Float32Array(FULL), py = new Float32Array(FULL), pz = new Float32Array(FULL);
    const pw = new Float32Array(FULL);
    const arr = snowMesh.instanceMatrix.array;
    for (let i = 0; i < FULL; i++) {
      px[i] = camPos.x + R.snow.range(-HX, HX);
      py[i] = camPos.y + R.snow.range(-HY, HY);
      pz[i] = camPos.z + R.snow.range(-HZ, HZ);
      pw[i] = R.snow.range(0.75, 1.35);
      const s = R.snow.range(0.5, 2.1), o = i * 16;
      arr[o] = s; arr[o + 5] = s; arr[o + 10] = s; arr[o + 15] = 1;
      arr[o + 12] = px[i]; arr[o + 13] = py[i]; arr[o + 14] = pz[i];
    }
    snowMesh.instanceMatrix.needsUpdate = true;
    snowMesh.onBeforeRender = (r, s, cam) => {
      if (cam && cam.isPerspectiveCamera) { camPos.setFromMatrixPosition(cam.matrixWorld); camReady = true; }
    };
    ctx.add(snowMesh);

    /** Inside a module, inside a tube, or below the ice — thin the storm out. */
    function sheltered(p) {
      if (p.y < -1.4) return true;
      if (p.y > DECK_Y - 0.4 && p.y < ROOF_Y + 0.4) {
        for (const m of MODULES) {
          if (Math.abs(p.x - m.cx) < m.w / 2 && Math.abs(p.z - m.cz) < m.d / 2) return true;
        }
        for (const t of tubeSegs) {
          if (distToSeg(p.x, p.z, t.ax, t.az, t.bx, t.bz) < 1.7) return true;
        }
      }
      return false;
    }

    ctx.onUpdate((dt, t) => {
      if (!camReady) return;
      const gust = 1 + Math.sin(t * 0.31) * 0.42 + Math.sin(t * 1.63 + 1.1) * 0.16;
      const wx = WIND.x * gust, wz = WIND.z * gust, wy = WIND.y;
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
      snowMesh.count = sheltered(camPos) ? Math.floor(FULL * 0.08) : FULL;
      snowMesh.instanceMatrix.needsUpdate = true;
    });
  }

  // A separate column of snow pouring through the generator roof hole.
  {
    const HX2 = MOD.gen.cx - 3.5, HZ2 = MOD.gen.cz + 3.0;
    const holeSnow = props.scatter(flakeGeo, flakeMat, 110, (i, dm, r) => {
      dm.position.set(HX2 + r.range(-1.5, 1.5), F + r.range(0, ROOM_H + 0.6), HZ2 + r.range(-1.5, 1.5));
      dm.scale.setScalar(r.range(0.6, 1.4));
    }, 1717);
    holeSnow.castShadow = false;
    ctx.addDecor(holeSnow);
    const base = [];
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < holeSnow.count; i++) {
      holeSnow.getMatrixAt(i, mtx);
      base.push([mtx.elements[12], mtx.elements[13], mtx.elements[14]]);
    }
    const span = ROOM_H + 0.6;
    ctx.onUpdate((dt, t) => {
      const a = holeSnow.instanceMatrix.array;
      for (let i = 0; i < base.length; i++) {
        const b = base[i];
        let yy = (b[1] - F) - t * 1.5 * (0.6 + (i % 7) * 0.1);
        yy = ((yy % span) + span) % span;
        const o = i * 16;
        a[o + 12] = b[0] + Math.sin(t * 0.8 + i) * 0.3;
        a[o + 13] = F + yy;
        a[o + 14] = b[2] + Math.cos(t * 0.7 + i) * 0.3;
      }
      holeSnow.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------------------
  // 13b. MOTION — turbine, swings, blinks, generator shudder, window pulse
  // ---------------------------------------------------------------------------
  ctx.onUpdate((dt, t) => {
    for (const r of turbines) r.rotation.z += dt * 1.9;
    for (const s of swingers) {
      const v = Math.sin(t * s.sp) * s.amp + Math.sin(t * s.sp * 2.3) * s.amp * 0.25;
      if (s.o) { if (s.axis === 'x') s.o.rotation.x = v; else s.o.rotation.z = v; }
      if (s.light) s.light.position.set(s.ox + v * 1.1, s.oy, s.oz);
    }
    for (const b of blinkers) {
      const base = b.m.userData.base;
      if (b.mode === 'blink') {
        b.m.emissiveIntensity = base * (Math.sin(t * b.sp + b.ph) > 0.1 ? 1.0 : 0.14);
      } else if (b.mode === 'strobe') {
        b.m.emissiveIntensity = base * (Math.sin(t * b.sp + b.ph) > 0.65 ? 1.7 : 0.1);
      } else if (b.mode === 'fault') {
        const alive = Math.sin(t * 1.7 + b.ph) > -0.7 ? 1 : 0.14;
        b.m.emissiveIntensity = base * alive * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * b.sp + b.ph)));
      } else {
        b.m.emissiveIntensity = base * (0.86 + 0.14 * Math.sin(t * b.sp + b.ph));
      }
    }
    for (const g of genShake) {
      const a = g.live ? 1 : 0;
      g.o.position.x = g.x + Math.sin(t * 34 + g.ph) * 0.012 * a;
      g.o.position.y = g.y + Math.sin(t * 41 + g.ph) * 0.008 * a;
    }
    beaconMat.emissiveIntensity = 2.6 * (0.94 + 0.06 * Math.sin(t * 0.9));
  });

  // ---------------------------------------------------------------------------
  // 14. SURFACES + GAMEPLAY PLACEMENT
  // ---------------------------------------------------------------------------
  ctx.setSurface((x, z) => {
    for (const m of MODULES) {
      if (Math.abs(x - m.cx) < m.w / 2 + 0.4 && Math.abs(z - m.cz) < m.d / 2 + 0.4) return 'metal';
    }
    for (const t of tubeSegs) {
      if (distToSeg(x, z, t.ax, t.az, t.bx, t.bz) < 1.8) return 'metal';
    }
    return 'snow';
  });

  // -- 40 coins, spread over every layer of the station -----------------------
  const coins = [];
  const coin = (x, y, z) => coins.push([x, y, z]);
  // interiors (20)
  coin(MOD.hab.cx - 7, F + 1, MOD.hab.cz + 3);
  coin(MOD.hab.cx + 1.5, F + 1, MOD.hab.cz - 3.4);
  coin(MOD.hab.cx + 7.6, F + 1, MOD.hab.cz + 3.6);
  coin(MOD.hab.cx - 2.5, F + 1.9, MOD.hab.cz - 4.2);
  coin(MOD.lab.cx - 5, F + 1, MOD.lab.cz + 3.4);
  coin(MOD.lab.cx + 4, F + 1, MOD.lab.cz - 4.2);
  coin(MOD.lab.cx + 6.5, F + 1, MOD.lab.cz + 2.8);
  coin(MOD.lab.cx - 6.8, F + 1, MOD.lab.cz - 1.6);
  coin(MOD.comms.cx - 5, F + 1, MOD.comms.cz + 3.0);
  coin(MOD.comms.cx + 4.5, F + 1, MOD.comms.cz - 3.2);
  coin(MOD.comms.cx + 5.8, F + 1, MOD.comms.cz + 3.4);
  coin(MOD.comms.cx - 2, F + 1, MOD.comms.cz + 0.4);
  coin(MOD.gen.cx - 5.5, F + 1, MOD.gen.cz + 4.6);
  coin(MOD.gen.cx + 5.5, F + 1, MOD.gen.cz - 4.0);
  coin(MOD.gen.cx + 6.0, F + 1, MOD.gen.cz + 4.4);
  coin(MOD.gen.cx - 3.5, F + 1, MOD.gen.cz + 0.4);
  coin(MOD.store.cx - 9, F + 1, MOD.store.cz - 4.5);
  coin(MOD.store.cx + 3.5, F + 1.6, MOD.store.cz - 3.6);
  coin(MOD.store.cx + 9.5, F + 1, MOD.store.cz + 4.4);
  coin(MOD.store.cx - 4, F + 1, MOD.store.cz + 4.6);
  // walkway tubes (3)
  for (const i of [0, 2, 4]) {
    const t = tubeSegs[i];
    coin(t.cx, FLOOR_Y + 1.0, t.cz);
  }
  // under the modules (5)
  for (const m of MODULES) {
    const ux = m.cx + m.w * 0.22, uz = m.cz - 2;
    coin(ux, gy(ux, uz) + 1.0, uz);
  }
  // ice tunnels (5)
  coin(-6, TUN_Y + 1, 8); coin(-6, TUN_Y + 1, -14); coin(6, TUN_Y + 1, -6);
  coin(24, TUN_Y + 1, -6); coin(-12, TUN_Y + 1, -26);
  // ice cave (2)
  coin(-9.5, CAVE_FLOOR + 1, 33); coin(-2.5, CAVE_FLOOR + 1, 36.5);
  // crevasse: ledge and floor (3)
  coin(-2, -1.6, 45.4); coin(4, -1.6, 45.4); coin(-30, CREV_FLOOR + 1, 44);
  // outside (2)
  coin(MX, MBASE + 7.5, MZ - 4.5);                       // the mast platform
  coin(-63, gy(-63, 25) + 1.0, 25);                      // beside the Snowcat
  for (const c of coins) ctx.pickup(c[0], c[1], c[2], 'coin');

  // -- 6 batteries ------------------------------------------------------------
  ctx.pickup(MOD.hab.cx - 6.8, F + 1, MOD.hab.cz + 4.0, 'battery');
  ctx.pickup(MOD.comms.cx + 5.0, F + 1, MOD.comms.cz + 3.9, 'battery');
  ctx.pickup(MOD.gen.cx - 6.5, F + 1, MOD.gen.cz - 4.4, 'battery');
  ctx.pickup(MOD.store.cx + 8.0, F + 1, MOD.store.cz - 4.8, 'battery');
  ctx.pickup(-6, TUN_Y + 1, 20, 'battery');
  ctx.pickup(-8, -1.6, 45.4, 'battery');                 // crevasse ledge

  // -- 3 powerups and exactly one pup -----------------------------------------
  ctx.pickup(MOD.comms.cx - 5.5, F + 1, MOD.comms.cz - 3.6, 'powerup:ghost');
  ctx.pickup(MX - 1.5, MBASE + 7.5, MZ - 5.5, 'powerup:dash');
  ctx.pickup(26.5, TUN_Y + 1, -12.5, 'powerup:nightvision');
  ctx.pickup(-10.5, CAVE_FLOOR + 0.9, 37.4, 'pup');      // behind an ice pillar

  // 24 real lights, 3 shadow casters, 465 visible draw calls, 9 texture sets.
  void lightCount;
}
