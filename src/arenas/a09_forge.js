// =============================================================================
// A09 — THE FORGE
// A still-running steel foundry at night. A cathedral of black steel lit almost
// entirely by molten orange: silhouettes against glow.
//
// Areas:  MAIN HALL / CASTING FLOOR / FURNACE ROW / CATWALK LABYRINTH (5 levels)
//         ROLLING MILL / CONTROL PULPIT / SCRAP YARD / SERVICE UNDERCROFT
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'forge',
  name: 'THE FORGE',
  tagline: 'The heat never sleeps. Neither does what walks the catwalks.',
  order: 9,
  difficulty: 4,
  biome: 'indoor',
  seed: 905010,
  spawn: [8, 0.2, 6],
  bounds: 120,
  colors: ['#ff5a10', '#140b06'],
  music: 'heroic',
};

// -----------------------------------------------------------------------------
// Site plan (metres). One giant shed plus two annexes and an undercroft.
// -----------------------------------------------------------------------------
const HALL = { x0: -50, x1: 40, z0: -45, z1: 45, h: 45 };
const MILL = { x0: 40, x1: 86, z0: -30, z1: 40, h: 16 };
const YARD = { x0: -96, x1: -50, z0: -72, z1: 72, h: 9 };
const UNDER = { x0: -44, x1: 34, z0: -38, z1: 10, y: -5, ceil: -0.7 };

const FURNACES = [
  { x: -30, z: -30, r: 6.0, h: 18 },
  { x: -6, z: -32, r: 6.2, h: 19 },
  { x: 18, z: -30, r: 5.8, h: 17 },
];

const PITS = [
  { x0: -37, x1: -23, z0: 16, z1: 26, d: 1.6 },
  { x0: -12, x1: 4, z0: 22, z1: 33, d: 1.7 },
  { x0: 14, x1: 26, z0: 15, z1: 24, d: 1.5 },
];

// Stair shafts + light-leak grates punched through the casting floor slab.
const SHAFT_A = { x0: -38, x1: -32, z0: -6, z1: 4 };
const SHAFT_B = { x0: 24, x1: 30, z0: -34, z1: -26 };
const LEAK_GRATES = [
  { x0: -21.5, x1: -18.5, z0: -15.5, z1: -12.5 },
  { x0: 6.5, x1: 9.5, z0: -25.5, z1: -22.5 },
  { x0: -7.5, x1: -4.5, z0: 0.5, z1: 3.5 },
  { x0: 18.7, x1: 21.3, z0: -20.3, z1: -17.7 },
];

const HOT = { white: 0xffd070, molten: 0xff5a10, dull: 0x8c1f06, cold: 0x6fd8ff };

export async function build(ctx) {
  const T = THREE;
  const P = ctx.props;
  const M = ctx.mat;
  const noise = ctx.noise;
  const R = {
    scrap: ctx.rng.fork('scrap'),
    ingot: ctx.rng.fork('ingot'),
    grime: ctx.rng.fork('grime'),
    part: ctx.rng.fork('particles'),
    truss: ctx.rng.fork('truss'),
    mill: ctx.rng.fork('mill'),
    under: ctx.rng.fork('under'),
  };

  // ===========================================================================
  // 0. MATERIALS — 17 surface() calls, everything else solid/painted/emissive.
  // ===========================================================================
  const brickSoot = M.surface('brick', { color: 0x2c211a, mortar: 0x2a2723, rows: 12, repeat: 12, seed: 9 });
  const brickYard = M.surface('brick', { color: 0x231c18, mortar: 0x242220, rows: 9, repeat: 10, seed: 13 });
  const steelDark = M.surface('metalPanel', { color: 0x1e2226, repeat: 6, panels: 5, metalness: 0.85, roughness: 0.62 });
  const steelPlate = M.surface('metalPanel', { color: 0x2b3036, repeat: 2, size: 256, panels: 3, metalness: 0.8, roughness: 0.55 });
  const rustPlate = M.surface('rustMetal', { color: 0x2d2722, rust: 0x7a3a16, repeat: 5, metalness: 0.75, roughness: 0.78 });
  const rustProp = M.surface('rustMetal', { color: 0x2a2320, rust: 0x6e3413, repeat: 1, size: 256, metalness: 0.7, roughness: 0.8 });
  const furnaceSkin = M.surface('metalPanel', { color: 0x2a1c14, repeat: 8, panels: 7, metalness: 0.72, roughness: 0.72 });
  const sandFloor = M.surface('sand', { color: 0x3a2d20, repeat: 34 });
  const concreteDark = M.surface('concrete', { color: 0x2f2e2b, repeat: 18, seed: 21 });
  const millFloor = M.surface('concrete', { color: 0x3d3c37, repeat: 24, seed: 4 });
  const roofSheet = M.surface('corrugated', { color: 0x181b1e, repeat: 16, ribs: 16, metalness: 0.6, roughness: 0.8 });
  const cladUpper = M.surface('corrugated', { color: 0x1d2023, repeat: 13, ribs: 14, metalness: 0.65, roughness: 0.74 });
  const yardGround = M.surface('asphalt', { color: 0x15171a, repeat: 24, roughness: 0.4, metalness: 0.18, envMapIntensity: 1.6 });
  const coilSteel = M.surface('metalPanel', { color: 0x4c463f, repeat: 2, size: 256, panels: 3, metalness: 0.9, roughness: 0.42 });
  const woodDirty = M.surface('wood', { color: 0x453120, repeat: 2, size: 256, planks: 4 });
  const lockerSkin = M.surface('metalPanel', { color: 0x273634, repeat: 1, size: 256, panels: 2, metalness: 0.5, roughness: 0.6 });
  const slagRock = M.surface('rock', { color: 0x221a15, repeat: 1, size: 256 });

  const blackMetal = M.metal(0x121417, 0.62);
  const greyMetal = M.metal(0x3a4046, 0.5);
  const cableMat = M.solid({ color: 0x0b0c0d, roughness: 0.95 });
  const invisMat = M.solid({ color: 0x000000 });
  const glassMat = M.glassCheap({ color: 0x2a2418, opacity: 0.3 });

  // --- painted: grated catwalk decking (genuinely see-through) ---------------
  const grateMat = M.painted(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const cell = W / 8;
    c.fillStyle = '#39332c';
    for (let i = 0; i < 8; i++) {
      c.fillRect(i * cell, 0, cell * 0.34, H);
      c.fillRect(0, i * cell + cell * 0.72, W, cell * 0.20);
    }
    c.fillStyle = 'rgba(150,138,120,0.5)';
    for (let i = 0; i < 8; i++) c.fillRect(i * cell, 0, cell * 0.10, H);
    c.fillStyle = 'rgba(18,14,10,0.6)';
    for (let i = 0; i < 8; i++) c.fillRect(i * cell + cell * 0.26, 0, cell * 0.08, H);
  }, { transparent: true, alphaTest: 0.45, side: T.DoubleSide, roughness: 0.72 });
  grateMat.metalness = 0.6;
  grateMat.map.wrapS = grateMat.map.wrapT = T.RepeatWrapping;

  // --- painted: hazard chevrons ----------------------------------------------
  const chevronMat = M.painted(128, 32, (c, W, H) => {
    c.fillStyle = '#191512'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#a8801a';
    for (let i = -2; i < 12; i++) {
      c.beginPath();
      c.moveTo(i * 18, H); c.lineTo(i * 18 + 10, H);
      c.lineTo(i * 18 + 26, 0); c.lineTo(i * 18 + 16, 0);
      c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(10,8,6,0.4)';
    for (let i = 0; i < 260; i++) c.fillRect((i * 37) % W, (i * 61) % H, 2, 2);
  }, { transparent: false, roughness: 0.85 });
  chevronMat.map.wrapS = chevronMat.map.wrapT = T.RepeatWrapping;

  // --- painted: soft smoke / steam puff ---------------------------------------
  const smokeMat = M.painted(96, 96, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(196,152,110,0.5)');
    g.addColorStop(0.45, 'rgba(118,84,58,0.2)');
    g.addColorStop(1, 'rgba(34,22,14,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, { transparent: true, alphaTest: 0.008, side: T.DoubleSide, roughness: 1 });
  smokeMat.depthWrite = false;

  // --- painted: heat shimmer (animated offset) --------------------------------
  const shimmerMat = M.painted(128, 128, (c, W, H) => {
    const img = c.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = noise.fbm(x / 14, y / 14, 3) * 0.5 + 0.5;
      const i = (y * W + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 190; img.data[i + 2] = 130;
      img.data[i + 3] = Math.max(0, (n - 0.45)) * 90;
    }
    c.putImageData(img, 0, 0);
  }, { transparent: true, alphaTest: 0.004, side: T.DoubleSide, roughness: 1 });
  shimmerMat.depthWrite = false;
  shimmerMat.map.wrapS = shimmerMat.map.wrapT = T.RepeatWrapping;
  shimmerMat.map.repeat.set(3, 2);

  // --- painted: crew rota pinned in the pulpit ---------------------------------
  const rotaMat = M.painted(128, 96, (c, W, H) => {
    c.fillStyle = '#c9bda0'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#3c3226';
    c.fillRect(6, 6, W - 12, 8);
    for (let r = 0; r < 7; r++) {
      c.fillStyle = r % 2 ? '#b8ab8e' : '#c2b596';
      c.fillRect(6, 18 + r * 10, W - 12, 9);
      c.fillStyle = '#4a3d2c';
      for (let k = 0; k < 4; k++) c.fillRect(12 + k * 28, 21 + r * 10, 16 + (r * 5 + k * 3) % 8, 3);
    }
    c.strokeStyle = '#8a2b16'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(14, 40); c.lineTo(W - 18, 62); c.stroke();
  }, { transparent: false, roughness: 0.9 });

  // ===========================================================================
  // 1. BUILD GROUPS + LOW-LEVEL HELPERS
  // ===========================================================================
  const SHELL = new T.Group();   // brick, cladding, roof   -> freeze
  const STEEL = new T.Group();   // structure, rails, stairs -> freeze
  const GRATE = new T.Group();   // alpha-tested decking     -> freeze
  const DETAIL = new T.Group();  // props and greebles       -> freeze
  const COL = new T.Group();     // invisible collision proxies
  const LIVE = new T.Group();    // animated / emissive things (not frozen)

  const put = (parent, w, h, d, x, y, z, m, ry) => {
    const b = P.boxC(w, h, d, m, { shadow: false, receive: true });
    b.position.set(x, y, z);
    if (ry) b.rotation.y = ry;
    parent.add(b);
    return b;
  };
  const proxy = (w, h, d, x, y, z, ry) => {
    const b = P.boxC(w, h, d, invisMat, { shadow: false, receive: false });
    b.position.set(x, y, z);
    if (ry) b.rotation.y = ry;
    b.visible = false;
    b.userData.collide = true;
    COL.add(b);
    return b;
  };
  const uvScale = (g, su, sv) => {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
    return g;
  };
  /** Horizontal see-through grating quad, world-placed. */
  const grateQuad = (len, wid, x, y, z, alongZ) => {
    const g = new T.PlaneGeometry(len, wid);
    g.rotateX(-Math.PI / 2);
    uvScale(g, len / 1.1, wid / 1.1);
    const m = new T.Mesh(g, grateMat);
    m.castShadow = false; m.receiveShadow = true;
    m.position.set(x, y, z);
    if (alongZ) m.rotation.y = Math.PI / 2;
    GRATE.add(m);
    return m;
  };
  /** Chevron-striped hazard strip. */
  const chevron = (len, x, y, z, alongZ, hgt) => {
    const h = hgt ?? 0.22;
    const g = new T.BoxGeometry(len, h, 0.05);
    uvScale(g, len / 1.2, 1);
    const m = new T.Mesh(g, chevronMat);
    m.castShadow = false; m.receiveShadow = true;
    m.position.set(x, y, z);
    if (alongZ) m.rotation.y = Math.PI / 2;
    DETAIL.add(m);
    return m;
  };

  // ===========================================================================
  // 2. ATMOSPHERE
  // ===========================================================================
  ctx.sky({ top: 0x05070c, bottom: 0x140c06, radius: 460 });
  ctx.fog(0x2a1408, 0.022, 0, 'exp2');
  ctx.useEnvironment(0.22);
  ctx.grade({
    exposure: 0.95, saturation: 1.2, contrast: 1.2,
    lift: [0.006, -0.002, -0.008], gain: [1.06, 0.98, 0.9],
    vignette: 1.15, grain: 0.05, aberration: 0.0022,
    bloom: 0.85, bloomRadius: 0.82, bloomThreshold: 0.7, scanline: 0,
  });
  ctx.soundscape('machine', 'heroic', { size: 0.95, dark: 0.5, wet: 0.28 });
  ctx.setSurface((x, z) => {
    if (x < HALL.x0) return 'gravel';                     // scrap yard
    if (x > MILL.x0) return 'concrete';                   // rolling mill
    if (z > 10 && x > -40 && x < 32) return 'sand';       // casting floor sand
    return 'metal';
  });

  // ===========================================================================
  // 3. THE MOLTEN SYSTEM
  //    A reusable rig: emissive material (own clone) whose intensity rides slow
  //    fbm noise, an optional real point light pulsing in lockstep, and an
  //    optional heat-particle emitter feeding one global instanced buffer.
  // ===========================================================================
  const RIGS = [];
  const SWAY = [];             // things that hang and swing
  const SPIN = [];             // things that turn
  const TICKERS = [];          // materials with their own userData.tick(dt)
  let lightCount = 0;
  const HEAT_EMIT = [];
  const SPARK_EMIT = [];

  /** Cached-but-unique emissive material so rigs can pulse independently. */
  const hotMat = (color, intensity, opts) => M.emissive(color, intensity, opts).clone();

  /**
   * @param {object} o
   *  mats      [Material]   materials to pulse (already cloned)
   *  color/at/power/dist/shadow  optional real light
   *  heat      {r, rise, size, n}  optional rising heat particles
   *  amp/speed pulse shape
   */
  const molten = (o) => {
    const rig = {
      mats: o.mats || [],
      base: (o.mats || []).map(m => m.emissiveIntensity),
      amp: o.amp ?? 0.34,
      speed: o.speed ?? 0.33,
      phase: o.phase ?? R.part.range(0, 40),
      light: null, lightBase: 0,
    };
    if (o.at && o.power && lightCount < 22) {
      const L = new T.PointLight(o.color ?? HOT.molten, o.power, o.dist ?? 30, 2);
      L.position.set(o.at[0], o.at[1], o.at[2]);
      ctx.light(L, { shadow: !!o.shadow, far: o.dist ?? 30 });
      lightCount++;
      rig.light = L; rig.lightBase = o.power;
    }
    if (o.heat) {
      HEAT_EMIT.push({
        x: o.at ? o.at[0] : o.heat.x, y: o.heat.y ?? (o.at ? o.at[1] : 0), z: o.at ? o.at[2] : o.heat.z,
        r: o.heat.r ?? 1.2, rise: o.heat.rise ?? 8, size: o.heat.size ?? 0.3, n: o.heat.n ?? 24,
      });
    }
    RIGS.push(rig);
    return rig;
  };

  // ===========================================================================
  // 4. CATWALK PRIMITIVES — deck, railing, ramp, stair flight
  // ===========================================================================
  const DECKS = [];   // bookkeeping so we can sanity-place pickups

  /** Railing along one edge. Visuals are decor; one invisible box does the work. */
  const railEdge = (len, cx, y, cz, alongZ, hazard) => {
    const H = 1.08;
    const n = Math.max(2, Math.round(len / 2.6));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (len * i) / n;
      put(STEEL, 0.07, H, 0.07, alongZ ? cx : cx + t, y + H / 2, alongZ ? cz + t : cz, blackMetal);
    }
    put(STEEL, alongZ ? 0.06 : len, 0.07, alongZ ? len : 0.06, cx, y + H, cz, greyMetal);
    put(STEEL, alongZ ? 0.05 : len, 0.05, alongZ ? len : 0.05, cx, y + H * 0.55, cz, blackMetal);
    if (hazard) chevron(len, cx, y + 0.13, cz, alongZ, 0.2);
    else put(STEEL, alongZ ? 0.04 : len, 0.2, alongZ ? len : 0.04, cx, y + 0.12, cz, blackMetal);
    proxy(alongZ ? 0.1 : len, 1.16, alongZ ? len : 0.1, cx, y + 0.58, cz);
  };

  /**
   * A catwalk span.
   * axis 'x' | 'z', from a..b, at the fixed cross coordinate, at height y.
   * rails: 'both' | 'left' | 'right' | 'none'   (left = -cross side)
   */
  const deck = (axis, a, b, fixed, y, o = {}) => {
    const w = o.w ?? 1.9;
    const len = Math.abs(b - a);
    if (len < 0.4) return;
    const mid = (a + b) / 2;
    const alongZ = axis === 'z';
    const cx = alongZ ? fixed : mid;
    const cz = alongZ ? mid : fixed;

    grateQuad(len, w, cx, y + 0.01, cz, alongZ);
    // stringers + underslung support brackets
    for (const s of [-1, 1]) {
      put(STEEL, alongZ ? 0.09 : len, 0.34, alongZ ? len : 0.09,
        alongZ ? cx + s * (w / 2 - 0.05) : cx, y - 0.18, alongZ ? cz : cz + s * (w / 2 - 0.05), steelPlate);
    }
    const brackets = Math.max(1, Math.floor(len / 8));
    for (let i = 0; i <= brackets; i++) {
      const t = -len / 2 + (len * i) / brackets;
      put(STEEL, alongZ ? w + 0.3 : 0.16, 0.16, alongZ ? 0.16 : w + 0.3,
        alongZ ? cx : cx + t, y - 0.38, alongZ ? cz + t : cz, blackMetal);
    }
    proxy(alongZ ? w : len, 0.2, alongZ ? len : w, cx, y - 0.1, cz);

    const rails = o.rails ?? 'both';
    if (rails === 'both' || rails === 'left') {
      railEdge(len, alongZ ? cx - w / 2 : cx, y, alongZ ? cz : cz - w / 2, alongZ, o.hazard);
    }
    if (rails === 'both' || rails === 'right') {
      railEdge(len, alongZ ? cx + w / 2 : cx, y, alongZ ? cz : cz + w / 2, alongZ, o.hazard);
    }
    DECKS.push({ axis, a, b, fixed, y, w });
  };

  /**
   * Inclined collision ramp with open-tread industrial stairs on top.
   * axis 'x'|'z', sign +1/-1 = direction of ascent. Returns the top coordinate.
   */
  const SLOPE = Math.PI / 180 * 35;
  const stairFlight = (x, z, y0, y1, axis, sign, w = 1.7) => {
    const dy = y1 - y0;
    const run = dy / Math.tan(SLOPE);
    const L = Math.hypot(run, dy);
    const alongZ = axis === 'z';
    const mx = alongZ ? x : x + sign * run / 2;
    const mz = alongZ ? z + sign * run / 2 : z;
    const my = (y0 + y1) / 2;

    const g = new T.Group();                 // visuals   -> frozen into STEEL
    const cg = new T.Group();                // colliders -> live in COL
    for (const grp of [g, cg]) {
      grp.position.set(mx, my, mz);
      if (alongZ) grp.rotation.x = -sign * SLOPE; else grp.rotation.z = sign * SLOPE;
    }

    // hidden walking surface
    const ramp = P.boxC(alongZ ? w : L, 0.4, alongZ ? L : w, invisMat, { shadow: false, receive: false });
    ramp.position.y = -0.2; ramp.visible = false; ramp.userData.collide = true;
    cg.add(ramp);
    // stringers + handrails, all in the tilted frame
    for (const s of [-1, 1]) {
      const st = P.boxC(alongZ ? 0.09 : L, 0.36, alongZ ? L : 0.09, steelPlate, { shadow: false });
      st.position.set(alongZ ? s * w / 2 : 0, -0.2, alongZ ? 0 : s * w / 2);
      g.add(st);
      const hr = P.boxC(alongZ ? 0.07 : L, 0.07, alongZ ? L : 0.07, greyMetal, { shadow: false });
      hr.position.set(alongZ ? s * w / 2 : 0, 1.02, alongZ ? 0 : s * w / 2);
      g.add(hr);
      const mr = P.boxC(alongZ ? 0.05 : L, 0.05, alongZ ? L : 0.05, blackMetal, { shadow: false });
      mr.position.set(alongZ ? s * w / 2 : 0, 0.56, alongZ ? 0 : s * w / 2);
      g.add(mr);
      const guard = P.boxC(alongZ ? 0.1 : L, 1.14, alongZ ? L : 0.1, invisMat, { shadow: false });
      guard.position.set(alongZ ? s * w / 2 : 0, 0.57, alongZ ? 0 : s * w / 2);
      guard.visible = false; guard.userData.collide = true;
      cg.add(guard);
    }
    COL.add(cg);
    // posts
    const posts = Math.max(2, Math.round(L / 2.4));
    for (let i = 0; i <= posts; i++) {
      const t = -L / 2 + (L * i) / posts;
      for (const s of [-1, 1]) {
        const pst = P.boxC(alongZ ? 0.06 : 0.06, 1.05, 0.06, blackMetal, { shadow: false });
        pst.position.set(alongZ ? s * w / 2 : t, 0.52, alongZ ? t : s * w / 2);
        g.add(pst);
      }
    }
    STEEL.add(g);

    // open grate treads, placed in world space so they stay level
    const steps = Math.max(5, Math.round(dy / 0.21));
    const sh = dy / steps, sd = run / steps;
    for (let i = 0; i < steps; i++) {
      const cx = alongZ ? x : x + sign * (i + 0.5) * sd;
      const cz = alongZ ? z + sign * (i + 0.5) * sd : z;
      grateQuad(alongZ ? w : sd * 1.05, alongZ ? sd * 1.05 : w, cx, y0 + (i + 1) * sh, cz, false);
    }
    chevron(w, alongZ ? x : x + sign * run, y1 + 0.03, alongZ ? z + sign * run : z, !alongZ, 0.18);
    return alongZ ? { x, z: z + sign * run } : { x: x + sign * run, z };
  };

  /** Bare inclined collision ramp (pit escapes, loading slopes). */
  const rampOnly = (x, z, y0, y1, axis, sign, w, mtl) => {
    const dy = y1 - y0;
    const run = dy / Math.tan(Math.PI / 180 * 30);
    const L = Math.hypot(run, dy);
    const alongZ = axis === 'z';
    const g = new T.Group();
    g.position.set(alongZ ? x : x + sign * run / 2, (y0 + y1) / 2, alongZ ? z + sign * run / 2 : z);
    if (alongZ) g.rotation.x = -sign * (Math.PI / 180 * 30); else g.rotation.z = sign * (Math.PI / 180 * 30);
    const slab = P.boxC(alongZ ? w : L, 0.3, alongZ ? L : w, mtl || concreteDark, { shadow: false });
    slab.position.y = -0.15; slab.userData.collide = true;
    g.add(slab);
    ctx.add(P.COLLIDE(g));
    return g;
  };

  // ===========================================================================
  // 5. SLAB WITH HOLES — the casting floor, punched for pits/shafts/grates
  // ===========================================================================
  const slabWithHoles = (x0, x1, z0, z1, holes) => {
    const zs = new Set([z0, z1]);
    for (const h of holes) {
      if (h.z0 > z0 && h.z0 < z1) zs.add(h.z0);
      if (h.z1 > z0 && h.z1 < z1) zs.add(h.z1);
    }
    const zl = [...zs].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < zl.length - 1; i++) {
      const za = zl[i], zb = zl[i + 1], zm = (za + zb) / 2;
      const band = holes.filter(h => h.z0 < zm && h.z1 > zm).sort((p, q) => p.x0 - q.x0);
      let cur = x0;
      for (const h of band) {
        const lo = Math.max(x0, h.x0), hi = Math.min(x1, h.x1);
        if (lo > cur + 0.01) out.push([cur, lo, za, zb]);
        cur = Math.max(cur, hi);
      }
      if (cur < x1 - 0.01) out.push([cur, x1, za, zb]);
    }
    return out;
  };

  // ===========================================================================
  // 6. THE SHELL — main hall, mill annex, scrap-yard perimeter, roofs
  // ===========================================================================
  const wallSeg = (x0, z0, x1, z1, y0, y1, t, m) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05 || y1 - y0 < 0.05) return;
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    put(SHELL, len, y1 - y0, t, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, m, ry);
    proxy(len, y1 - y0, t, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, ry);
  };

  // --- hall: brick to 10 m, corrugated cladding above -------------------------
  const BRICK_TOP = 10;
  const hallWall = (x0, z0, x1, z1, gaps) => {
    // gaps: [{a, b, top}] measured along the run parameter 0..len
    const len = Math.hypot(x1 - x0, z1 - z0);
    const lerp = (t) => [x0 + (x1 - x0) * (t / len), z0 + (z1 - z0) * (t / len)];
    const segs = [];
    let cur = 0;
    for (const g of (gaps || []).sort((a, b) => a.a - b.a)) {
      if (g.a > cur) segs.push([cur, g.a, 0]);
      segs.push([g.a, g.b, g.top]);
      cur = g.b;
    }
    if (cur < len) segs.push([cur, len, 0]);
    for (const [a, b, top] of segs) {
      const p = lerp(a), q = lerp(b);
      if (top > 0) {
        wallSeg(p[0], p[1], q[0], q[1], top, HALL.h, 0.7, cladUpper);
      } else {
        wallSeg(p[0], p[1], q[0], q[1], 0, BRICK_TOP, 0.9, brickSoot);
        wallSeg(p[0], p[1], q[0], q[1], BRICK_TOP, HALL.h, 0.6, cladUpper);
      }
    }
  };
  // west wall — the great shed doors face the scrap yard
  hallWall(HALL.x0, HALL.z0, HALL.x0, HALL.z1, [{ a: 33, b: 57, top: 14 }]);
  // east wall — opening into the rolling mill
  hallWall(HALL.x1, HALL.z0, HALL.x1, HALL.z1, [{ a: 37, b: 53, top: 12 }]);
  hallWall(HALL.x0, HALL.z0, HALL.x1, HALL.z0, null);
  hallWall(HALL.x0, HALL.z1, HALL.x1, HALL.z1, null);

  // hall roof — a deck plus a raised ridge lantern along the centre
  put(SHELL, 92, 0.5, 92, -5, HALL.h + 0.25, 0, roofSheet);
  proxy(92, 0.6, 92, -5, HALL.h + 0.3, 0);
  put(SHELL, 92, 2.4, 6, -5, HALL.h + 1.6, 0, cladUpper);

  // clerestory of broken windows — cold night bleeding in near the eaves
  const clerMat = M.emissive(0x2a5f8c, 0.55, { transparent: true, opacity: 0.85 });
  for (let i = 0; i < 14; i++) {
    const x = -46 + i * 6.4;
    for (const z of [HALL.z0 + 0.5, HALL.z1 - 0.5]) {
      const brk = (i * 7 + (z > 0 ? 3 : 0)) % 5;
      const h = brk === 0 ? 2.2 : 4.4;
      const pane = put(DETAIL, 4.6, h, 0.12, x, 37.5, z, clerMat);
      pane.castShadow = false;
      put(STEEL, 4.9, 0.16, 0.2, x, 37.5 - h / 2 - 0.1, z, blackMetal);
      put(STEEL, 4.9, 0.16, 0.2, x, 37.5 + h / 2 + 0.1, z, blackMetal);
      put(STEEL, 0.14, h, 0.2, x, 37.5, z, blackMetal);
    }
  }

  // hall columns + roof trusses (instanced)
  const colXs = [-48.6, 38.6], colZs = [-43.6, 43.6];
  for (const cx of colXs) for (let i = 0; i < 9; i++) {
    const z = -43 + i * 10.8;
    put(STEEL, 1.1, HALL.h, 1.1, cx, HALL.h / 2, z, steelDark);
    put(STEEL, 2.0, 0.5, 2.0, cx, 0.25, z, concreteDark);
    chevron(2.1, cx, 0.9, z + 1.02, false, 1.2);
  }
  for (const cz of colZs) for (let i = 0; i < 8; i++) {
    const x = -42 + i * 11.2;
    put(STEEL, 1.1, HALL.h, 1.1, x, HALL.h / 2, cz, steelDark);
    put(STEEL, 2.0, 0.5, 2.0, x, 0.25, cz, concreteDark);
  }

  // ===========================================================================
  // 7. ROOF TRUSSES — instanced lattice, 8 trusses spanning Z at y ≈ 41
  // ===========================================================================
  {
    const xf = [];
    const unit = new T.BoxGeometry(1, 1, 1);
    for (let t = 0; t < 8; t++) {
      const x = -44 + t * 11.4;
      const y = 41.2;
      // top + bottom chords
      xf.push({ p: [x, y + 1.7, 0], r: [0, 0, 0], s: [0.42, 0.42, 88] });
      xf.push({ p: [x, y - 1.7, 0], r: [0, 0, 0], s: [0.42, 0.42, 88] });
      // verticals + diagonals
      for (let i = 0; i < 20; i++) {
        const z = -42 + i * 4.42;
        xf.push({ p: [x, y, z], r: [0, 0, 0], s: [0.26, 3.4, 0.26] });
        const dl = Math.hypot(4.42, 3.4);
        xf.push({
          p: [x, y, z + 2.21], r: [(i % 2 ? 1 : -1) * Math.atan2(3.4, 4.42), 0, 0],
          s: [0.22, 0.22, dl],
        });
      }
      // purlins between trusses
      if (t < 7) for (let i = 0; i < 9; i++) {
        xf.push({ p: [x + 5.7, y + 1.7, -40 + i * 10], r: [0, 0, 0], s: [11.4, 0.24, 0.24] });
      }
    }
    // longitudinal wind bracing
    for (let i = 0; i < 16; i++) {
      xf.push({ p: [-5, 43.2, -42 + i * 5.6], r: [0, 0, 0], s: [90, 0.18, 0.18] });
    }
    const inst = P.scatter(unit, steelDark, xf.length, (i, d) => {
      const t = xf[i];
      d.position.set(t.p[0], t.p[1], t.p[2]);
      d.rotation.set(t.r[0], t.r[1], t.r[2]);
      d.scale.set(t.s[0], t.s[1], t.s[2]);
    }, 7);
    inst.castShadow = false;
    ctx.addDecor(inst);
  }

  // ===========================================================================
  // 8. THE CASTING FLOOR — sand slab punched for pits, shafts and light grates
  // ===========================================================================
  {
    const holes = [
      ...PITS.map(p => ({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 })),
      SHAFT_A, SHAFT_B, ...LEAK_GRATES,
    ];
    const parts = slabWithHoles(HALL.x0, HALL.x1, HALL.z0, HALL.z1, holes);
    for (const [ax0, ax1, az0, az1] of parts) {
      const w = ax1 - ax0, d = az1 - az0;
      const s = P.boxC(w, 0.7, d, sandFloor, { shadow: false, receive: true });
      s.position.set((ax0 + ax1) / 2, -0.35, (az0 + az1) / 2);
      s.userData.collide = true;
      ctx.add(s);
    }
  }
  // the light-leak grates: you can see the undercroft through them, but not fall
  for (const g of LEAK_GRATES) {
    const w = g.x1 - g.x0, d = g.z1 - g.z0;
    grateQuad(w, d, (g.x0 + g.x1) / 2, 0.02, (g.z0 + g.z1) / 2, false);
    proxy(w, 0.12, d, (g.x0 + g.x1) / 2, -0.06, (g.z0 + g.z1) / 2);
    for (const s of [-1, 1]) {
      chevron(w, (g.x0 + g.x1) / 2, 0.09, (g.z0 + g.z1) / 2 + s * d / 2, false, 0.16);
    }
  }

  // --- casting pits: cooling ingots at four temperatures ----------------------
  const ingotGeo = new T.BoxGeometry(1, 1, 1);
  // Four temperatures per pit: white-hot, orange, dull red, black. `hot` marks
  // which of them the molten rig is allowed to pulse.
  const pitTemps = [
    { mats: [hotMat(HOT.white, 5.2), hotMat(HOT.molten, 3.4), hotMat(HOT.dull, 1.5), M.solid({ color: 0x14100e, roughness: 0.85 })], hot: 3 },
    { mats: [hotMat(HOT.molten, 4.0), hotMat(HOT.dull, 1.8), M.solid({ color: 0x1a120e, roughness: 0.9 }), M.solid({ color: 0x100d0b, roughness: 0.92 })], hot: 2 },
    { mats: [hotMat(HOT.dull, 2.2), M.solid({ color: 0x1d1410, roughness: 0.9 }), M.solid({ color: 0x121010, roughness: 0.95 }), M.solid({ color: 0x0e0c0b, roughness: 0.95 })], hot: 1 },
  ];
  PITS.forEach((pit, pi) => {
    const w = pit.x1 - pit.x0, d = pit.z1 - pit.z0;
    const cx = (pit.x0 + pit.x1) / 2, cz = (pit.z0 + pit.z1) / 2;
    // pit floor + walls
    put(SHELL, w + 1.4, 0.5, d + 1.4, cx, -pit.d - 0.25, cz, concreteDark);
    proxy(w + 1.4, 0.5, d + 1.4, cx, -pit.d - 0.25, cz);
    for (const s of [-1, 1]) {
      put(SHELL, w, pit.d, 0.5, cx, -pit.d / 2, cz + s * (d / 2 + 0.25), rustPlate);
      proxy(w, pit.d, 0.5, cx, -pit.d / 2, cz + s * (d / 2 + 0.25));
      put(SHELL, 0.5, pit.d, d, cx + s * (w / 2 + 0.25), -pit.d / 2, cz, rustPlate);
      proxy(0.5, pit.d, d, cx + s * (w / 2 + 0.25), -pit.d / 2, cz);
      chevron(w, cx, 0.12, cz + s * (d / 2 + 0.3), false, 0.22);
    }
    // escape ramp at the +x end so the pit is enterable, not a trap
    rampOnly(pit.x1 - 0.2, cz, 0, -pit.d, 'x', -1, 2.4, concreteDark);
    // ingots, hottest to coldest across the pit — one instanced batch per grade
    const temps = pitTemps[pi];
    const rows = Math.floor(d / 1.5), cols = Math.floor(w / 1.9);
    const buckets = [[], [], [], []];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (R.ingot.chance(0.12)) continue;
      const t = Math.min(3, Math.floor((c / cols) * 3.4 + R.ingot.range(0, 0.9)));
      const sy = R.ingot.range(0.4, 0.7);
      buckets[t].push({
        p: [pit.x0 + 1.0 + c * 1.9 + R.ingot.range(-0.15, 0.15), -pit.d + sy / 2 + 0.26,
        pit.z0 + 0.9 + r * 1.5 + R.ingot.range(-0.12, 0.12)],
        s: [R.ingot.range(1.4, 1.7), sy, R.ingot.range(0.9, 1.2)],
        ry: R.ingot.range(-0.09, 0.09),
      });
    }
    buckets.forEach((list, t) => {
      if (!list.length) return;
      const im = P.scatter(ingotGeo, temps.mats[t], list.length, (i, d2) => {
        d2.position.set(list[i].p[0], list[i].p[1], list[i].p[2]);
        d2.scale.set(list[i].s[0], list[i].s[1], list[i].s[2]);
        d2.rotation.y = list[i].ry;
      }, 600 + pi * 7 + t);
      im.castShadow = false;
      ctx.addDecor(im);
    });
    molten({
      mats: temps.mats.slice(0, temps.hot),
      at: [cx - w * 0.28, -pit.d + 0.6, cz], color: pi === 0 ? HOT.white : HOT.molten,
      power: pi === 0 ? 16 : 10, dist: pi === 0 ? 34 : 24, shadow: pi === 1,
      heat: { r: Math.min(w, d) * 0.35, rise: 11, size: 0.34, n: 26, y: -pit.d + 0.5 },
      amp: 0.3, speed: 0.24,
    });
    if (pi !== 1) ctx.hidingSpot(cx + w * 0.32, -pit.d, cz + d * 0.3, 1.6, 0.8);
  });

  // --- rails and ingot bogies -------------------------------------------------
  for (const rz of [-2.75, -1.25]) {
    put(DETAIL, 86, 0.16, 0.14, -5, 0.08, rz, greyMetal);
  }
  for (let i = 0; i < 24; i++) put(DETAIL, 0.5, 0.1, 1.9, -46 + i * 3.6, 0.05, -2, woodDirty);
  const bogies = [];
  for (let i = 0; i < 3; i++) {
    const g = new T.Group();
    put(g, 3.6, 0.35, 2.3, 0, 0.62, 0, rustProp);
    for (const sx of [-1.3, 1.3]) for (const sz of [-0.75, 0.75]) {
      const wl = P.cyl(0.32, 0.32, 0.16, blackMetal, { seg: 12, collide: false, shadow: false });
      wl.rotation.x = Math.PI / 2; wl.position.set(sx, 0.32, sz + 0.08);
      g.add(wl);
    }
    const glowM = hotMat(i === 0 ? HOT.molten : HOT.dull, i === 0 ? 3.6 : 1.4);
    put(g, 2.6, 0.9, 1.5, 0, 1.25, 0, glowM);
    g.position.set(-34 + i * 24, 0, -2);
    LIVE.add(g);
    bogies.push({ g, m: glowM, speed: i === 0 ? 1.4 : 0, base: -34 + i * 24 });
    if (i !== 0) proxy(3.6, 1.8, 2.3, -34 + i * 24, 0.9, -2);
    if (i === 0) molten({ mats: [glowM], at: [-34, 1.9, -2], color: HOT.molten, power: 7, dist: 16, amp: 0.2, speed: 0.5 });
  }

  // --- slag heaps -------------------------------------------------------------
  const slagGeo = new T.IcosahedronGeometry(1, 0);
  const slagHeaps = [{ x: -44, z: 8, r: 4.2, h: 3.0 }, { x: 31, z: -40, r: 3.6, h: 2.6 }];
  {
    const hot = hotMat(HOT.dull, 2.4);
    for (const heap of slagHeaps) {
      const cold = P.scatter(slagGeo, slagRock, 130, (i, d, r) => {
        const a = r() * 6.283, rr = Math.sqrt(r()) * heap.r;
        const y = heap.h * (1 - rr / heap.r) * r.range(0.3, 1.0);
        d.position.set(heap.x + Math.cos(a) * rr, y * 0.5 + 0.15, heap.z + Math.sin(a) * rr);
        d.rotation.set(r() * 3, r() * 3, r() * 3);
        d.scale.setScalar(r.range(0.22, 0.65));
      }, 300 + heap.x);
      cold.castShadow = false;
      ctx.addDecor(cold);
      const embers = P.scatter(slagGeo, hot, 26, (i, d, r) => {
        const a = r() * 6.283, rr = Math.sqrt(r()) * heap.r * 0.7;
        d.position.set(heap.x + Math.cos(a) * rr, r.range(0.2, heap.h * 0.6), heap.z + Math.sin(a) * rr);
        d.rotation.set(r() * 3, r() * 3, r() * 3);
        d.scale.setScalar(r.range(0.14, 0.34));
      }, 301 + heap.x);
      embers.castShadow = false;
      ctx.addDecor(embers);
      proxy(heap.r * 1.5, heap.h, heap.r * 1.5, heap.x, heap.h / 2, heap.z);
      if (heap.x < 0) ctx.hidingSpot(heap.x + heap.r * 0.9, 0, heap.z + heap.r * 0.7, 1.6, 0.75);
    }
    molten({
      mats: [hot], at: [slagHeaps[0].x, 1.4, slagHeaps[0].z], color: HOT.dull, power: 9, dist: 20,
      heat: { r: 3.0, rise: 7, size: 0.4, n: 20, y: 1.0 }, amp: 0.45, speed: 0.5,
    });
  }

  // ===========================================================================
  // 9. THE FURNACES — riveted cylinders with glowing seams and roaring tapholes
  // ===========================================================================
  const rivetGeo = new T.SphereGeometry(0.075, 6, 4);
  const rivetXf = [];
  FURNACES.forEach((f, fi) => {
    const body = P.cyl(f.r * 0.94, f.r, f.h, furnaceSkin, { seg: 22, shadow: true });
    body.position.set(f.x, 0, f.z);
    P.COLLIDE(body);
    ctx.add(body);

    // hood + offtake stack
    const hood = P.cyl(f.r * 0.42, f.r * 0.94, 3.6, rustPlate, { seg: 20, collide: false, shadow: false });
    hood.position.set(f.x, f.h, f.z); DETAIL.add(hood);
    const stack = P.cyl(1.35, 1.7, 40 - f.h, rustPlate, { seg: 14, collide: false, shadow: false });
    stack.position.set(f.x, f.h + 3.4, f.z); DETAIL.add(stack);
    put(DETAIL, 3.6, 0.4, 3.6, f.x, 40.4, f.z, blackMetal);

    // bustle main + tuyere pipes
    const bustle = new T.Mesh(new T.TorusGeometry(f.r + 0.55, 0.42, 8, 26), rustPlate);
    bustle.rotation.x = Math.PI / 2; bustle.position.set(f.x, 11.5, f.z);
    bustle.castShadow = false; DETAIL.add(bustle);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = P.cyl(0.16, 0.16, 1.4, greyMetal, { seg: 8, collide: false, shadow: false });
      p.rotation.z = Math.PI / 2; p.rotation.y = -a;
      p.position.set(f.x + Math.cos(a) * (f.r + 0.1), 9.8, f.z + Math.sin(a) * (f.r + 0.1));
      DETAIL.add(p);
    }

    // glowing seams and inspection vents
    const seamM = hotMat(HOT.dull, 1.7 + fi * 0.2);
    for (const y of [4.2, 8.6, 13.4]) {
      const ring = new T.Mesh(new T.TorusGeometry(f.r + 0.06, 0.075, 5, 30), seamM);
      ring.rotation.x = Math.PI / 2; ring.position.set(f.x, y, f.z);
      ring.castShadow = false; LIVE.add(ring);
    }
    const ventM = hotMat(HOT.molten, 3.6);
    for (let i = 0; i < 7; i++) {
      const a = 0.3 + (i / 7) * Math.PI * 2;
      const v = put(LIVE, 0.7, 0.24, 0.14, f.x + Math.cos(a) * (f.r + 0.02), 6.4 + (i % 3) * 2.1,
        f.z + Math.sin(a) * (f.r + 0.02), ventM, -a);
      v.castShadow = false;
    }

    // tap hole facing the casting floor — the roar
    const tz = f.z + f.r + 0.05;
    const tapM = hotMat(HOT.white, 6.5);
    const tap = put(LIVE, 1.5, 1.05, 0.2, f.x, 2.4, tz, tapM);
    tap.castShadow = false;
    put(DETAIL, 2.6, 2.1, 0.5, f.x, 2.4, tz - 0.2, blackMetal);
    // runner channel of molten metal spilling toward the floor
    const runM = hotMat(HOT.molten, 4.6);
    const runner = put(LIVE, 1.0, 0.14, 7.0, f.x, 0.45, tz + 3.4, runM);
    runner.castShadow = false;
    put(DETAIL, 1.9, 0.55, 7.4, f.x, 0.28, tz + 3.4, slagRock);

    molten({
      mats: [tapM, runM, ventM, seamM],
      at: [f.x, 2.6, tz + 1.4], color: HOT.molten,
      power: 22, dist: 42, shadow: fi === 1,
      heat: { r: 1.6, rise: 16, size: 0.42, n: 34, y: 1.4 },
      amp: 0.4, speed: 0.4, phase: fi * 11.3,
    });
    if (fi === 1) SPARK_EMIT.push({ x: f.x, y: 2.4, z: tz + 0.6, n: 90, spread: 3.2, up: 5.5, size: 0.1, color: 0 });

    // rivet courses
    for (let ring = 0; ring < 6; ring++) {
      const y = 1.4 + ring * 2.9;
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2;
        rivetXf.push([f.x + Math.cos(a) * (f.r + 0.04), y, f.z + Math.sin(a) * (f.r + 0.04)]);
      }
    }
    // charging conveyor climbing to the throat
    const conv = new T.Group();
    const cl = 26;
    conv.position.set(f.x, 0, f.z - f.r - 1.2);
    const belt = new T.Group();
    belt.rotation.x = Math.atan2(f.h, 14);
    put(belt, 2.2, 0.3, cl, 0, 0, -cl / 2 + 1, steelPlate);
    for (const s of [-1, 1]) put(belt, 0.14, 1.0, cl, s * 1.1, 0.6, -cl / 2 + 1, blackMetal);
    conv.add(belt);
    DETAIL.add(conv);
    if (fi !== 1) ctx.hidingSpot(f.x - f.r - 1.6, 0, f.z - f.r - 1.2, 1.8, 0.9);
  });
  {
    const rv = P.scatter(rivetGeo, greyMetal, rivetXf.length, (i, d) => {
      d.position.set(rivetXf[i][0], rivetXf[i][1], rivetXf[i][2]);
    }, 12);
    rv.castShadow = false;
    ctx.addDecor(rv);
  }

  // ===========================================================================
  // 10. THE POUR STATION — a tilting ladle on a hook, dripping
  // ===========================================================================
  const pour = { x: -14, z: -6 };
  const ladlePivot = new T.Group();
  ladlePivot.position.set(pour.x, 15.5, pour.z);
  {
    const body = P.cyl(3.0, 2.5, 4.4, rustPlate, { seg: 20, collide: false, shadow: true });
    body.position.y = -6.2; ladlePivot.add(body);
    const lipM = hotMat(HOT.white, 7.5);
    const lip = P.cyl(2.95, 2.95, 0.28, lipM, { seg: 20, collide: false, shadow: false });
    lip.position.y = -1.9; ladlePivot.add(lip);
    // trunnion ring + bail
    const ring = new T.Mesh(new T.TorusGeometry(3.1, 0.24, 6, 22), blackMetal);
    ring.rotation.x = Math.PI / 2; ring.position.y = -3.6; ring.castShadow = false;
    ladlePivot.add(ring);
    for (const s of [-1, 1]) {
      const arm = P.boxC(0.26, 3.4, 0.5, blackMetal, { shadow: false });
      arm.position.set(s * 3.0, -2.0, 0); ladlePivot.add(arm);
    }
    const hook = P.boxC(0.4, 1.3, 0.4, greyMetal, { shadow: false });
    hook.position.y = -0.4; ladlePivot.add(hook);
    for (const s of [-1, 1]) {
      const cbl = P.cyl(0.07, 0.07, 4.6, cableMat, { seg: 6, collide: false, shadow: false });
      cbl.position.set(s * 0.5, 0, 0); ladlePivot.add(cbl);
    }
    LIVE.add(ladlePivot);

    // supporting gantry over the pour station
    for (const s of [-1, 1]) {
      put(STEEL, 1.0, 20, 1.0, pour.x + s * 7.5, 10, pour.z, steelDark);
      proxy(1.0, 20, 1.0, pour.x + s * 7.5, 10, pour.z);
    }
    put(STEEL, 16, 1.3, 1.4, pour.x, 20.4, pour.z, steelDark);

    // the mould below, white hot
    const mouldM = hotMat(HOT.white, 8.0);
    put(DETAIL, 5.6, 1.2, 4.2, pour.x, 0.6, pour.z, blackMetal);
    const pool = put(LIVE, 4.6, 0.2, 3.2, pour.x, 1.22, pour.z, mouldM);
    pool.castShadow = false;
    // the pour stream itself
    const streamM = hotMat(HOT.white, 9.0, { transparent: true, opacity: 0.9 });
    const stream = P.cyl(0.16, 0.3, 6.6, streamM, { seg: 8, collide: false, shadow: false });
    stream.position.set(pour.x + 0.4, 1.3, pour.z);
    LIVE.add(stream);

    molten({
      mats: [lipM, mouldM, streamM],
      at: [pour.x, 2.4, pour.z], color: HOT.white, power: 26, dist: 38, shadow: true,
      heat: { r: 2.2, rise: 18, size: 0.5, n: 40, y: 1.4 },
      amp: 0.22, speed: 0.6,
    });
    SPARK_EMIT.push({ x: pour.x, y: 1.5, z: pour.z, n: 110, spread: 4.4, up: 7.0, size: 0.11, color: 0 });
    ctx.hidingSpot(pour.x - 5.2, 0, pour.z + 2.4, 1.5, 0.7);
  }

  // dripping molten slag from the ladle underside
  const dripM = hotMat(HOT.molten, 6.0);
  const drips = [];
  for (let i = 0; i < 5; i++) {
    const d = P.sphere(0.14, dripM, { seg: 8, collide: false, shadow: false });
    LIVE.add(d);
    drips.push({ o: d, ph: i * 0.37, x: pour.x + R.part.range(-1.6, 1.6), z: pour.z + R.part.range(-1.4, 1.4) });
  }

  // ===========================================================================
  // 11. THE CATWALK LABYRINTH — five levels, threaded, gapped, collapsed
  // ===========================================================================
  // -- L1  y = 4 : perimeter gallery (one collapsed span on the south run) -----
  deck('x', -46.5, 36, -41, 4);
  deck('z', -41, 41, -46.5, 4);
  deck('x', -46.5, 6, 41, 4, { hazard: true });
  deck('x', 14, 36, 41, 4, { hazard: true });                 // <- GAP x 6..14
  deck('z', -41, 41, 36, 4);
  // the collapsed span, hanging by one stringer
  {
    const wreck = new T.Group();
    wreck.position.set(10, 4, 41);
    wreck.rotation.z = -0.55; wreck.rotation.x = 0.16;
    put(wreck, 7.4, 0.2, 1.9, 0, 0, 0, steelPlate);
    put(wreck, 7.4, 0.06, 0.06, 0, 1.05, -0.9, greyMetal);
    DETAIL.add(wreck);
    for (let i = 0; i < 3; i++) {
      const ch = P.cyl(0.05, 0.05, 3.4, blackMetal, { seg: 6, collide: false, shadow: false });
      ch.position.set(7 + i * 1.4, 4.2, 41 + (i - 1) * 0.6);
      DETAIL.add(ch);
    }
  }
  // floor -> L1 (two independent routes)
  stairFlight(-2, 38.5, 0, 4, 'x', 1);
  deck('z', 37.3, 41.6, 3.71, 4, { w: 1.8 });
  stairFlight(32.5, -30, 0, 4, 'z', 1);
  deck('x', 31.4, 36.6, -24.29, 4, { w: 1.8 });

  // -- L2  y = 9 : the charging gallery in front of the furnace row ------------
  const L2G = -19.5;                       // charging gallery centreline
  deck('x', -46, 36, L2G, 9, { w: 2.6, hazard: true });
  deck('z', -20.5, -13, -40, 9);
  deck('z', -20.5, 10, 32, 9);
  deck('x', 22, 32.6, -6, 9);
  // furnace tapping platforms, set back from the gallery and spurred to it
  FURNACES.forEach((f) => {
    deck('x', f.x - 7, f.x + 7, f.z + 7.4, 9, { w: 2.8 });
    deck('z', f.z + 7.4, L2G, f.x, 9, { w: 1.8 });
  });
  // L1 -> L2, at the two gaps between furnaces
  for (const sx of [-18, 6]) {
    deck('z', -40.6, -36.5, sx, 4, { w: 1.8 });
    stairFlight(sx, -37, 4, 9, 'z', 1);
    deck('z', -30.4, -19.0, sx, 9, { w: 1.8 });
  }

  // -- L3  y = 15 : the spine + upper furnace walk (spine broken at x 6..14) ---
  deck('x', -46, 6, 0, 15, { w: 2.2 });
  deck('x', 14, 36, 0, 15, { w: 2.2 });                        // <- GAP x 6..14
  deck('x', -44, 30, -19, 15, { w: 2.0 });
  for (const cx of [-24, 10, 28]) deck('z', -19, 0, cx, 15, { w: 1.8 });
  deck('z', -6.5, 7, -40, 15);
  deck('z', -21.5, -14, 24.5, 15, { w: 1.8 });
  for (const f of [FURNACES[0], FURNACES[2]]) deck('z', -23.5, -19, f.x, 15, { w: 1.8 });
  // F2 gets a full square inspection ring at the top of its shell
  deck('x', -14, 2, -40, 15, { w: 1.8 });
  deck('x', -14, 2, -24, 15, { w: 1.8 });
  deck('z', -40, -24, -14, 15, { w: 1.8 });
  deck('z', -40, -24, 2, 15, { w: 1.8 });
  deck('z', -24, -19, -6, 15, { w: 1.8 });
  // L2 -> L3, west stair tower and an east flight
  deck('x', -44.6, -39, -14, 9, { w: 1.8 });
  stairFlight(-43.5, -14, 9, 15, 'z', 1);
  deck('x', -44.6, -39, -5.43, 15, { w: 1.8 });
  stairFlight(24.5, -6, 9, 15, 'z', -1);

  // -- L4  y = 22 : above the furnace tops -------------------------------------
  deck('x', -44, 32, -34, 22, { w: 2.0 });
  deck('x', -44, 32, 30, 22, { w: 2.0 });
  deck('z', -34, 30, -40, 22, { w: 2.0 });
  deck('z', -34, 30, 30, 22, { w: 2.0 });
  deck('x', -44.6, -39, 6, 15, { w: 1.8 });
  stairFlight(-43.5, 6, 15, 22, 'z', 1);
  deck('x', -44.6, -39, 16, 22, { w: 1.8 });
  stairFlight(24.5, -20, 15, 22, 'z', -1);
  deck('x', 23.4, 34.6, -30, 22, { w: 1.8 });

  // -- L5  y = 30 : high gantries under the trusses (east spine broken) --------
  deck('x', -40, 30, -18.6, 30, { w: 2.0 });
  deck('x', -40.6, 30, 33.4, 30, { w: 2.0 });
  deck('z', -18.6, 33.4, -40, 30, { w: 2.0 });
  deck('z', -18.6, 4, 30, 30, { w: 2.0 });
  deck('z', 10, 33.4, 30, 30, { w: 2.0 });                     // <- GAP z 4..10
  deck('x', -44.6, -39, 22, 22, { w: 1.8 });
  stairFlight(-43.5, 22, 22, 30, 'z', 1);
  deck('x', -44.6, -40, 33.43, 30, { w: 1.8 });
  stairFlight(33.5, -30, 22, 30, 'z', 1);
  deck('x', 29, 34.6, -18.57, 30, { w: 1.8 });

  // -- ROOF LEVEL  y = 36 : the crane runway walkways --------------------------
  deck('x', -46, 36, -40, 36, { w: 1.9, hazard: true });
  deck('x', -46, 36, 40, 36, { w: 1.9, hazard: true });
  deck('z', -40, 40, -44, 36, { w: 1.9 });
  deck('z', 29, 34.4, 6, 30, { w: 1.8 });
  stairFlight(6, 30, 30, 36, 'x', 1);
  deck('z', 29.5, 39, 14.57, 36, { w: 1.8 });

  // decorative ladders — shortcuts for anyone the engine lets climb
  for (const L of [[-46.0, 4, 20, 5.0], [35.6, 9, 20, 6.0], [-39.6, 15, -10, 7.0], [29.6, 22, 12, 8.0]]) {
    const ld = P.ladder(L[3], greyMetal);
    ld.position.set(L[0], L[1], L[2]);
    P.NOCOLLIDE(ld);
    DETAIL.add(ld);
  }

  // ===========================================================================
  // 12. OVERHEAD TRAVELLING CRANES
  // ===========================================================================
  const cranes = [];
  for (const rz of [-38, 38]) {
    put(STEEL, 90, 1.1, 0.9, -5, 37.3, rz, steelDark);
    put(STEEL, 90, 0.18, 0.16, -5, 37.9, rz, greyMetal);
  }
  for (let c = 0; c < 2; c++) {
    const g = new T.Group();
    put(g, 2.0, 1.5, 78, 0, 38.8, 0, steelPlate);
    put(g, 1.2, 0.5, 78, 0, 39.7, 0, blackMetal);
    for (const s of [-1, 1]) {
      put(g, 3.4, 1.3, 2.6, 0, 38.2, s * 38, blackMetal);
      for (const q of [-1, 1]) {
        const wl = P.cyl(0.45, 0.45, 0.3, greyMetal, { seg: 10, collide: false, shadow: false });
        wl.rotation.z = Math.PI / 2; wl.position.set(q * 1.1, 37.75, s * 38);
        g.add(wl);
      }
      const cab = put(g, 2.2, 2.0, 2.6, 2.6, 37.4, s * 30, steelPlate);
      cab.castShadow = false;
    }
    const trolley = new T.Group();
    put(trolley, 3.0, 1.2, 3.0, 0, 40.2, 0, steelPlate);
    for (const s of [-1, 1]) {
      const cbl = P.cyl(0.06, 0.06, 6.4, cableMat, { seg: 5, collide: false, shadow: false });
      cbl.position.set(s * 0.6, 33.4, 0); trolley.add(cbl);
    }
    const hookBlock = put(trolley, 1.5, 1.1, 1.5, 0, 33.0, 0, blackMetal);
    hookBlock.castShadow = false;
    const hookLamp = put(trolley, 0.5, 0.14, 0.5, 0, 32.4, 0, M.emissive(HOT.cold, 3.2));
    hookLamp.castShadow = false;
    g.add(trolley);
    g.position.x = c === 0 ? -20 : 18;
    LIVE.add(g);
    cranes.push({ g, trolley, phase: c * 3.1, dir: c === 0 ? 1 : -1 });
  }

  // ===========================================================================
  // 13. THE CONTROL PULPIT — glazed box on stilts over the casting floor
  // ===========================================================================
  const PUL = { x0: 27, x1: 39, z0: 10, z1: 18, y: 9, h: 4.4 };
  {
    const cx = (PUL.x0 + PUL.x1) / 2, cz = (PUL.z0 + PUL.z1) / 2;
    const w = PUL.x1 - PUL.x0, d = PUL.z1 - PUL.z0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(STEEL, 0.7, PUL.y, 0.7, cx + sx * (w / 2 - 1), PUL.y / 2, cz + sz * (d / 2 - 1), steelDark);
      proxy(0.7, PUL.y, 0.7, cx + sx * (w / 2 - 1), PUL.y / 2, cz + sz * (d / 2 - 1));
      chevron(1.2, cx + sx * (w / 2 - 1), 1.0, cz + sz * (d / 2 - 1) + 0.37, false, 1.4);
    }
    // floor + roof
    put(SHELL, w, 0.4, d, cx, PUL.y - 0.2, cz, steelPlate);
    proxy(w, 0.4, d, cx, PUL.y - 0.2, cz);
    put(SHELL, w + 0.8, 0.4, d + 0.8, cx, PUL.y + PUL.h, cz, rustPlate);
    proxy(w + 0.8, 0.4, d + 0.8, cx, PUL.y + PUL.h, cz);
    // solid south + east walls, glazing north + west, doorway at north-west
    wallSeg(PUL.x0, PUL.z1, PUL.x1, PUL.z1, PUL.y, PUL.y + PUL.h, 0.25, steelPlate);
    wallSeg(PUL.x1, PUL.z0, PUL.x1, PUL.z1, PUL.y, PUL.y + PUL.h, 0.25, steelPlate);
    // glazing (non-colliding pane + framed collision below/above the sill)
    // [ax, az, bx, bz, hasSill] — the north face is split around the doorway
    const panes = [
      [PUL.x0, PUL.z0, 31, PUL.z0], [33, PUL.z0, PUL.x1, PUL.z0],
      [PUL.x0, PUL.z0, PUL.x0, PUL.z1],
    ];
    for (const [ax, az, bx, bz] of panes) {
      const len = Math.hypot(bx - ax, bz - az);
      const ry = -Math.atan2(bz - az, bx - ax);
      const mxx = (ax + bx) / 2, mzz = (az + bz) / 2;
      const pane = put(DETAIL, len - 0.2, 2.4, 0.06, mxx, PUL.y + 2.4, mzz, glassMat, ry);
      pane.castShadow = false;
      put(SHELL, len, 0.9, 0.22, mxx, PUL.y + 0.45, mzz, steelPlate, ry);
      put(SHELL, len, 1.1, 0.22, mxx, PUL.y + PUL.h - 0.55, mzz, steelPlate, ry);
      // mullions
      for (let i = 1; i < 3; i++) {
        const t = i / 3;
        put(DETAIL, 0.1, 2.4, 0.16, ax + (bx - ax) * t, PUL.y + 2.4, az + (bz - az) * t, blackMetal, ry);
      }
    }
    // Sill collision splits around the doorway; the header is above head height
    // so it can run the full width.
    proxy(4.0, 0.9, 0.22, PUL.x0 + 2.0, PUL.y + 0.45, PUL.z0);
    proxy(6.0, 0.9, 0.22, PUL.x1 - 3.0, PUL.y + 0.45, PUL.z0);
    proxy(w, 1.1, 0.22, cx, PUL.y + PUL.h - 0.55, PUL.z0);
    proxy(0.22, 0.9, d, PUL.x0, PUL.y + 0.45, cz);
    proxy(0.22, 1.1, d, PUL.x0, PUL.y + PUL.h - 0.55, cz);
    // Glazing needs collision so nobody walks out of the window. The north face
    // keeps a 2 m doorway at x 31..33, where the L2 spur arrives.
    proxy(0.2, 2.6, d, PUL.x0, PUL.y + 2.4, cz);
    proxy(4.0, 2.6, 0.2, PUL.x0 + 2.0, PUL.y + 2.4, PUL.z0);
    proxy(6.0, 2.6, 0.2, PUL.x1 - 3.0, PUL.y + 2.4, PUL.z0);
    for (const jx of [31, 33]) {
      put(DETAIL, 0.16, PUL.h, 0.32, jx, PUL.y + PUL.h / 2, PUL.z0, blackMetal);
    }
    chevron(2.0, 32, PUL.y + 0.12, PUL.z0, false, 0.2);

    // interior: console, levers, CRTs, coffee, rota
    const desk = put(DETAIL, w - 1.6, 0.16, 0.9, cx, PUL.y + 0.95, PUL.z0 + 1.0, steelPlate);
    desk.castShadow = false;
    put(DETAIL, w - 1.8, 0.9, 0.16, cx, PUL.y + 0.45, PUL.z0 + 1.4, steelPlate);
    for (let i = 0; i < 9; i++) {
      const lx = cx - w / 2 + 1.4 + i * ((w - 2.8) / 8);
      const lev = P.cyl(0.035, 0.035, 0.5, greyMetal, { seg: 6, collide: false, shadow: false });
      lev.position.set(lx, PUL.y + 1.03, PUL.z0 + 0.75);
      lev.rotation.x = (i % 3 - 1) * 0.35;
      DETAIL.add(lev);
      const knob = P.sphere(0.055, M.solid({ color: i % 3 === 0 ? 0x8c2a1c : 0x1c1c1e, roughness: 0.6 }), { seg: 8, collide: false, shadow: false });
      knob.position.set(lx, PUL.y + 1.5, PUL.z0 + 0.75);
      DETAIL.add(knob);
      const led = put(LIVE, 0.05, 0.05, 0.03, lx, PUL.y + 1.1, PUL.z0 + 1.32,
        M.emissive(i % 4 === 0 ? 0x4dff88 : 0xff5533, 5));
      led.castShadow = false;
    }
    const crtMats = [];
    for (let i = 0; i < 3; i++) {
      const sx = cx - 3.6 + i * 3.6;
      put(DETAIL, 1.0, 0.85, 0.8, sx, PUL.y + 1.55, PUL.z0 + 1.1, M.solid({ color: 0x2a2823, roughness: 0.65 }));
      const cm = hotMat(0x63d4a0, 2.0);
      crtMats.push(cm);
      const scr = put(LIVE, 0.8, 0.62, 0.04, sx, PUL.y + 1.58, PUL.z0 + 0.69, cm);
      scr.castShadow = false;
    }
    molten({ mats: crtMats, amp: 0.22, speed: 1.9 });
    // coffee cup, forgotten
    const cup = P.cyl(0.045, 0.038, 0.1, M.solid({ color: 0xd8cdb6, roughness: 0.55 }), { seg: 10, collide: false, shadow: false });
    cup.position.set(cx + 4.6, PUL.y + 1.03, PUL.z0 + 0.9);
    DETAIL.add(cup);
    // rota pinned to the back wall
    const rota = put(DETAIL, 1.2, 0.9, 0.03, cx + 2.0, PUL.y + 2.4, PUL.z1 - 0.14, rotaMat);
    rota.castShadow = false;
    const ch = P.chair(M.solid({ color: 0x33302b, roughness: 0.8 }));
    ch.position.set(cx - 1.2, PUL.y, PUL.z0 + 2.2);
    ch.rotation.y = 2.7; P.NOCOLLIDE(ch); DETAIL.add(ch);

    const pl = new T.PointLight(0xffb066, 6.5, 16, 2);
    pl.position.set(cx, PUL.y + 3.4, cz);
    ctx.light(pl); lightCount++;
    const fix = put(LIVE, 2.4, 0.1, 0.4, cx, PUL.y + 3.9, cz, M.emissive(0xffc98a, 3.0));
    fix.castShadow = false;
    ctx.hidingSpot(cx + 3.4, PUL.y, PUL.z1 - 1.4, 1.4, 0.9);
  }

  // ===========================================================================
  // 14. THE ROLLING MILL — annex of roller tables, stands and a coil yard
  // ===========================================================================
  {
    // shell
    const mfl = P.boxC(MILL.x1 - MILL.x0, 0.7, MILL.z1 - MILL.z0, millFloor, { shadow: false });
    mfl.position.set((MILL.x0 + MILL.x1) / 2, -0.35, (MILL.z0 + MILL.z1) / 2);
    mfl.userData.collide = true; ctx.add(mfl);
    wallSeg(MILL.x0, MILL.z0, MILL.x1, MILL.z0, 0, MILL.h, 0.7, cladUpper);
    wallSeg(MILL.x0, MILL.z1, MILL.x1, MILL.z1, 0, MILL.h, 0.7, cladUpper);
    wallSeg(MILL.x1, MILL.z0, MILL.x1, MILL.z1, 0, MILL.h, 0.7, cladUpper);
    put(SHELL, MILL.x1 - MILL.x0, 0.5, MILL.z1 - MILL.z0, (MILL.x0 + MILL.x1) / 2, MILL.h, (MILL.z0 + MILL.z1) / 2, roofSheet);
    proxy(MILL.x1 - MILL.x0, 0.5, MILL.z1 - MILL.z0, (MILL.x0 + MILL.x1) / 2, MILL.h, (MILL.z0 + MILL.z1) / 2);
    for (let i = 0; i < 5; i++) {
      const x = 46 + i * 9.6;
      put(STEEL, 0.9, MILL.h, 0.9, x, MILL.h / 2, MILL.z0 + 1.2, steelDark);
      put(STEEL, 0.9, MILL.h, 0.9, x, MILL.h / 2, MILL.z1 - 1.2, steelDark);
      put(STEEL, MILL.z1 - MILL.z0, 0.8, 0.5, x, MILL.h - 0.6, (MILL.z0 + MILL.z1) / 2, steelDark, Math.PI / 2);
    }

    // roller line
    const rollGeo = new T.CylinderGeometry(0.34, 0.34, 2.4, 10);
    rollGeo.rotateZ(Math.PI / 2);
    const rollers = P.scatter(rollGeo, greyMetal, 150, (i, d) => {
      d.position.set(45 + i * 0.26, 0.86, 2);
      return 45 + i * 0.26 < 83;
    }, 55);
    rollers.castShadow = false;
    ctx.addDecor(rollers);
    for (const s of [-1, 1]) put(DETAIL, 38, 0.7, 0.4, 64, 0.5, 2 + s * 1.4, rustPlate);
    proxy(38, 1.1, 3.2, 64, 0.55, 2);
    // a hot slab creeping down the line
    const slabM = hotMat(HOT.molten, 4.2);
    const hotSlab = put(LIVE, 4.6, 0.3, 2.0, 52, 1.28, 2, slabM);
    hotSlab.castShadow = false;
    molten({
      mats: [slabM], at: [52, 1.6, 2], color: HOT.molten, power: 12, dist: 22,
      heat: { r: 1.8, rise: 9, size: 0.32, n: 22, y: 1.5 }, amp: 0.2, speed: 0.5,
    });

    // mill stands
    for (let i = 0; i < 4; i++) {
      const x = 50 + i * 8.4;
      const st = P.machine(4.2, 5.2, 3.4, 100 + i);
      st.position.set(x, 0, 2);
      P.NOCOLLIDE(st); DETAIL.add(st);
      proxy(4.2, 5.2, 3.4, x, 2.6, 2);
      for (const s of [-1, 1]) put(DETAIL, 0.5, 5.6, 0.5, x + s * 2.4, 2.8, 2, steelDark);
      chevron(4.4, x, 0.3, 3.75, false, 0.5);
    }

    // coil yard — stacked coils, prime cover
    {
      const coilGeo = new T.CylinderGeometry(1.15, 1.15, 1.5, 18, 1, false);
      coilGeo.rotateZ(Math.PI / 2);
      const spots = [];
      for (let row = 0; row < 5; row++) {
        for (let c = 0; c < 8; c++) {
          const bx = 48 + c * 4.1, bz = 16 + row * 4.2;
          spots.push([bx, 1.15, bz]);
          if ((c + row) % 3 !== 2) spots.push([bx + 1.2, 1.15, bz]);
          if ((c * 2 + row) % 4 === 1) spots.push([bx + 0.6, 3.15, bz]);
        }
      }
      const coils = P.scatter(coilGeo, coilSteel, spots.length, (i, d) => {
        d.position.set(spots[i][0], spots[i][1], spots[i][2]);
      }, 66);
      ctx.addDecor(coils);
      // eyes of the coils, dark holes
      for (let row = 0; row < 5; row++) {
        proxy(34, 4.4, 2.6, 63, 2.2, 16 + row * 4.2);
        if (row % 2 === 0) ctx.hidingSpot(50 + row * 6, 0, 18.4 + row * 4.2, 1.7, 0.95);
      }
      ctx.hidingSpot(78, 0, 26, 1.8, 1.0);
    }

    // north mezzanine + stair (verticality inside the annex)
    deck('x', 44, 82, -26, 6, { w: 2.4, rails: 'right' });
    stairFlight(46, -20, 0, 6, 'z', -1);
    deck('z', -26.6, -21.5, 46, 6, { w: 1.8 });
    for (let i = 0; i < 5; i++) {
      const sr = P.shelfRack(2, 3, 2.4, 1.1, 1.8, M.solid({ color: 0x6a3a18, roughness: 0.7, metalness: 0.3 }));
      sr.position.set(50 + i * 7, 6.1, -26);
      P.NOCOLLIDE(sr); DETAIL.add(sr);
    }

    // cold cyan work lamps — the mill reads cooler than the hall
    for (let i = 0; i < 4; i++) {
      const x = 48 + i * 10;
      const fl = P.fluorescent(3.4, { color: 0xbfe9ff, intensity: 4.2 });
      fl.position.set(x, 13.4, 2);
      P.NOCOLLIDE(fl); LIVE.add(fl);
      if (i % 2 === 0 && lightCount < 22) {
        const l = new T.PointLight(HOT.cold, 5.5, 24, 2);
        l.position.set(x, 12.6, 2);
        ctx.light(l); lightCount++;
      }
    }
    // grinding station: a shower of sparks in the corner
    put(DETAIL, 2.2, 1.4, 1.4, 78, 0.7, -20, steelPlate);
    const grindWheel = P.cyl(0.7, 0.7, 0.14, greyMetal, { seg: 16, collide: false, shadow: false });
    grindWheel.rotation.z = Math.PI / 2; grindWheel.position.set(78, 1.9, -20);
    LIVE.add(grindWheel);
    SPIN.push({ o: grindWheel, axis: 'y', speed: 24 });
    SPARK_EMIT.push({ x: 78, y: 1.7, z: -19.4, n: 70, spread: 3.6, up: 4.0, size: 0.08, color: 1 });
    if (lightCount < 22) {
      const gl = new T.PointLight(0xfff0d0, 3.0, 14, 2);
      gl.position.set(78, 2.0, -19.6);
      ctx.light(gl); lightCount++;
      RIGS.push({ mats: [], base: [], amp: 1.2, speed: 6.5, phase: 3.7, light: gl, lightBase: 3.0 });
    }
  }

  // ===========================================================================
  // 15. THE SCRAP YARD — outdoor annex, rain-slick, sealed by a perimeter wall
  // ===========================================================================
  {
    const g = P.ground(YARD.x1 - YARD.x0, YARD.z1 - YARD.z0, yardGround);
    g.position.set((YARD.x0 + YARD.x1) / 2, 0.01, (YARD.z0 + YARD.z1) / 2);
    g.userData.collide = true;
    ctx.add(g);
    proxy(YARD.x1 - YARD.x0, 0.6, YARD.z1 - YARD.z0, (YARD.x0 + YARD.x1) / 2, -0.3, (YARD.z0 + YARD.z1) / 2);

    // perimeter — sealed on every side, closing against the hall's west face
    wallSeg(YARD.x0, YARD.z0, YARD.x0, YARD.z1, 0, YARD.h, 0.8, brickYard);
    wallSeg(YARD.x0, YARD.z0, YARD.x1, YARD.z0, 0, YARD.h, 0.8, brickYard);
    wallSeg(YARD.x0, YARD.z1, YARD.x1, YARD.z1, 0, YARD.h, 0.8, brickYard);
    wallSeg(YARD.x1, YARD.z0, YARD.x1, HALL.z0, 0, YARD.h, 0.8, brickYard);
    wallSeg(YARD.x1, HALL.z1, YARD.x1, YARD.z1, 0, YARD.h, 0.8, brickYard);
    // razor wire silhouette
    for (let i = 0; i < 30; i++) {
      put(DETAIL, 0.08, 1.0, 0.08, YARD.x0 + 0.4, YARD.h + 0.5, YARD.z0 + 2 + i * 4.8, blackMetal);
    }

    // the great shed doors, half open, spilling forge light into the rain
    for (const s of [-1, 1]) {
      const leaf = put(DETAIL, 0.35, 13.4, 7.5, HALL.x0 - 0.4, 6.7, s * 8.2, rustPlate);
      leaf.castShadow = false;
      proxy(0.4, 13.4, 7.5, HALL.x0 - 0.4, 6.7, s * 8.2);
      chevron(7.4, HALL.x0 - 0.6, 1.2, s * 8.2, true, 1.6);
    }
    put(STEEL, 1.0, 1.0, 26, HALL.x0 - 0.4, 14.2, 0, steelDark);
    if (lightCount < 22) {
      const spill = new T.PointLight(HOT.molten, 13, 34, 2);
      spill.position.set(HALL.x0 - 6, 4.5, 0);
      ctx.light(spill); lightCount++;
      RIGS.push({ mats: [], base: [], amp: 0.3, speed: 0.4, phase: 21, light: spill, lightBase: 13 });
    }

    // mountains of scrap
    const twist = P.mergeGeometries([
      new T.BoxGeometry(1.6, 0.22, 0.22),
      new T.BoxGeometry(0.22, 1.4, 0.3).translate(0.6, 0.6, 0),
      new T.IcosahedronGeometry(0.42, 0),
    ]);
    const scrapMat = M.solid({ color: 0x2b2823, roughness: 0.62, metalness: 0.75, flat: true });
    const heaps = [[-70, -50, 9, 6], [-85, -20, 8, 5.4], [-64, 10, 9.5, 6.4], [-88, 35, 7.5, 5], [-70, 58, 8.5, 5.6]];
    const scr = P.scatter(twist, scrapMat, 1500, (i, d, r) => {
      const h = heaps[i % heaps.length];
      const a = r() * 6.283, rr = Math.pow(r(), 0.65) * h[2];
      const fall = 1 - rr / h[2];
      d.position.set(h[0] + Math.cos(a) * rr, Math.max(0.15, h[3] * fall * r.range(0.15, 1.0)), h[1] + Math.sin(a) * rr);
      d.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28);
      d.scale.setScalar(r.range(0.6, 1.6));
    }, 909);
    scr.castShadow = false;
    ctx.addDecor(scr);
    heaps.forEach((h, hi) => {
      proxy(h[2] * 1.25, h[3], h[2] * 1.25, h[0], h[3] / 2, h[1]);
      if (hi % 2 === 0) ctx.hidingSpot(h[0] + h[2] * 0.85, 0, h[1] + h[2] * 0.5, 1.8, 0.9);
    });

    // magnet crane
    const mc = new T.Group();
    for (const s of [-1, 1]) {
      put(mc, 1.0, 15, 1.0, -73, 7.5, s * 12, steelDark);
      proxy(1.0, 15, 1.0, -73, 7.5, s * 12);
    }
    put(mc, 1.4, 1.2, 26, -73, 15.4, 0, steelDark);
    // magnet hangs from a pivot at the gantry beam so it swings properly
    const magnet = new T.Group();
    magnet.position.set(-73, 14.8, -2);
    const cbl = P.cyl(0.09, 0.09, 6.4, cableMat, { seg: 6, collide: false, shadow: false });
    cbl.position.set(0, -6.4, 0); magnet.add(cbl);
    const disc = P.cyl(2.2, 2.2, 0.8, blackMetal, { seg: 20, collide: false, shadow: false });
    disc.position.set(0, -7.2, 0); magnet.add(disc);
    DETAIL.add(mc);
    LIVE.add(magnet);
    SWAY.push({ o: magnet, amp: 0.07, speed: 0.42, phase: 1.1, travel: 8, tSpeed: 0.06, base: -2 });

    // containers + puddles
    const conts = [[-58, -64, 0x5a2a22, 0], [-92, -60, 0x24483f, 1], [-56, 52, 0x3a3a44, 2],
    [-90, 62, 0x5a2a22, 0], [-60, 30, 0x24483f, 1], [-80, -38, 0x3a3a44, 2],
    [-58, -30, 0x5a2a22, 0], [-92, 8, 0x24483f, 1]];
    conts.forEach(([x, z, col, kind], i) => {
      const c = P.container(6.06, col, kind);
      c.position.set(x, i % 3 === 2 ? 2.62 : 0, z);
      c.rotation.y = (i % 4) * 0.42;
      P.NOCOLLIDE(c);
      DETAIL.add(c);
      proxy(6.2, 2.62, 2.5, x, (i % 3 === 2 ? 2.62 : 0) + 1.31, z, (i % 4) * 0.42);
      if (i % 4 === 0) ctx.hidingSpot(x + 3.6, 0, z + 1.8, 1.5, 0.85);
    });
    const puddleMat = M.solid({ color: 0x0c0f12, roughness: 0.04, metalness: 0.5, envMapIntensity: 2.4 });
    const puddleGeo = new T.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
    const puddles = P.scatter(puddleGeo, puddleMat, 70, (i, d, r) => {
      d.position.set(r.range(YARD.x0 + 4, YARD.x1 - 3), 0.03, r.range(YARD.z0 + 4, YARD.z1 - 4));
      d.scale.set(r.range(1.2, 4.2), 1, r.range(1.0, 3.4));
      d.rotation.y = r() * 3;
    }, 771);
    puddles.castShadow = false;
    ctx.addDecor(puddles);

    // two cold yard lamps
    for (const [lx, lz] of [[-80, -60], [-78, 44]]) {
      const sl = P.streetLight(9, { color: HOT.cold, intensity: 5 });
      sl.position.set(lx, 0, lz);
      P.NOCOLLIDE(sl); DETAIL.add(sl);
      proxy(0.4, 9, 0.4, lx, 4.5, lz);
      if (lightCount < 22) {
        const l = new T.PointLight(HOT.cold, 5.5, 26, 2);
        l.position.set(lx + 1.35, 8.6, lz);
        ctx.light(l); lightCount++;
      }
    }
  }

  // ===========================================================================
  // 16. THE UNDERCROFT — y = -5, cable tunnels, cooling water, near-total dark
  // ===========================================================================
  {
    const uw = UNDER.x1 - UNDER.x0, ud = UNDER.z1 - UNDER.z0;
    const ucx = (UNDER.x0 + UNDER.x1) / 2, ucz = (UNDER.z0 + UNDER.z1) / 2;
    const fl = P.boxC(uw, 0.6, ud, concreteDark, { shadow: false });
    fl.position.set(ucx, UNDER.y - 0.3, ucz);
    fl.userData.collide = true;
    ctx.add(fl);
    // walls + ceiling slab (the underside of the casting floor)
    for (const s of [-1, 1]) {
      wallSeg(UNDER.x0, ucz + s * ud / 2, UNDER.x1, ucz + s * ud / 2, UNDER.y, UNDER.ceil, 0.6, concreteDark);
      wallSeg(ucx + s * uw / 2, UNDER.z0, ucx + s * uw / 2, UNDER.z1, UNDER.y, UNDER.ceil, 0.6, concreteDark);
    }
    put(SHELL, uw, 0.3, ud, ucx, UNDER.ceil - 0.15, ucz, concreteDark);

    // stair shafts down from the casting floor
    const shafts = [
      { s: SHAFT_A, axis: 'z', sign: 1, x: -35, z: SHAFT_A.z0 },
      { s: SHAFT_B, axis: 'z', sign: -1, x: 27, z: SHAFT_B.z1 },
    ];
    for (const sh of shafts) {
      stairFlight(sh.x, sh.z, 0, UNDER.y, sh.axis, sh.sign, 2.4);
      // Guard rail round the open hole above — three sides only; the edge you
      // walk in over is left open.
      const s = sh.s;
      const w = s.x1 - s.x0, d = s.z1 - s.z0;
      const mxs = (s.x0 + s.x1) / 2, mzs = (s.z0 + s.z1) / 2;
      const entry = sh.sign > 0 ? -1 : 1;
      for (const q of [-1, 1]) {
        if (q === entry) continue;
        railEdge(w, mxs, 0, mzs + q * d / 2, false, true);
      }
      railEdge(d, s.x0, 0, mzs, true, true);
      railEdge(d, s.x1, 0, mzs, true, true);
    }

    // support columns
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
      if ((i + j) % 5 === 3) continue;
      const x = -36 + i * 17, z = -32 + j * 13;
      put(STEEL, 1.0, 4.4, 1.0, x, UNDER.y + 2.2, z, concreteDark);
      proxy(1.0, 4.4, 1.0, x, UNDER.y + 2.2, z);
    }

    // cooling water channels
    const waterMat = M.water({ color: 0x102028, opacity: 0.85, repeat: 12 });
    TICKERS.push(waterMat.userData.tick);
    for (const cz of [-30, -4]) {
      const wpl = P.ground(74, 3.4, waterMat, { collide: false });
      wpl.position.set(-5, UNDER.y + 0.32, cz);
      wpl.userData.collide = false;
      LIVE.add(wpl);
      for (const s of [-1, 1]) put(DETAIL, 74, 0.5, 0.4, -5, UNDER.y + 0.25, cz + s * 1.9, concreteDark);
    }

    // hot pipework + cable trays hugging the ceiling
    const hotPipeM = hotMat(HOT.dull, 1.3);
    for (const pz of [-34, -18, 6]) {
      const pr = P.pipes(74, 3, 0.22, rustProp);
      pr.position.set(-5, UNDER.ceil - 1.1, pz);
      P.NOCOLLIDE(pr); DETAIL.add(pr);
      const hp = P.cyl(0.16, 0.16, 74, hotPipeM, { seg: 10, collide: false, shadow: false });
      hp.rotation.z = Math.PI / 2; hp.position.set(-42, UNDER.ceil - 1.7, pz + 0.8);
      LIVE.add(hp);
      for (let i = 0; i < 9; i++) {
        put(DETAIL, 7, 0.1, 0.7, -40 + i * 8.6, UNDER.ceil - 0.5, pz - 1.2, blackMetal);
        for (let k = 0; k < 4; k++) {
          const cb = P.cyl(0.05, 0.05, 8, cableMat, { seg: 5, collide: false, shadow: false });
          cb.rotation.z = Math.PI / 2;
          cb.position.set(-44 + i * 8.6, UNDER.ceil - 0.42, pz - 1.45 + k * 0.16);
          DETAIL.add(cb);
        }
      }
    }
    molten({ mats: [hotPipeM], amp: 0.3, speed: 0.28 });

    // light leaking down through the floor grates above
    const leakM = M.emissive(HOT.molten, 1.1, { transparent: true, opacity: 0.24, side: T.DoubleSide });
    for (const g of LEAK_GRATES) {
      const w = g.x1 - g.x0, d = g.z1 - g.z0;
      const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
      const shaft = P.cyl(w * 0.5, w * 0.95, 4.2, leakM, { seg: 8, collide: false, shadow: false });
      shaft.position.set(cx, UNDER.y, cz);
      shaft.children[0].material.depthWrite = false;
      LIVE.add(shaft);
      const pool = P.ground(w * 2.0, d * 2.0, leakM, { collide: false });
      pool.position.set(cx, UNDER.y + 0.05, cz);
      pool.userData.collide = false;
      LIVE.add(pool);
    }
    for (const [lx, lz, pw] of [[-20, -14, 3.4], [8, -24, 2.6], [-6, 2, 3.0]]) {
      if (lightCount >= 22) break;
      const l = new T.PointLight(HOT.molten, pw, 17, 2);
      l.position.set(lx, UNDER.y + 2.6, lz);
      ctx.light(l); lightCount++;
      RIGS.push({ mats: [], base: [], amp: 0.4, speed: 0.45, phase: lx, light: l, lightBase: pw });
    }

    // undercroft clutter + hiding
    for (let i = 0; i < 14; i++) {
      const x = R.under.range(UNDER.x0 + 3, UNDER.x1 - 3);
      const z = R.under.range(UNDER.z0 + 3, UNDER.z1 - 3);
      if (R.under.chance(0.5)) {
        const b = P.barrel(0.34, 0.95, rustProp);
        b.position.set(x, UNDER.y, z); P.NOCOLLIDE(b); DETAIL.add(b);
        proxy(0.7, 0.95, 0.7, x, UNDER.y + 0.48, z);
      } else {
        const c = P.crate(1.0, woodDirty);
        c.position.set(x, UNDER.y, z); c.rotation.y = R.under.range(0, 3);
        P.NOCOLLIDE(c); DETAIL.add(c);
        proxy(1.1, 1.0, 1.1, x, UNDER.y + 0.5, z, c.rotation.y);
      }
    }
    const rub = P.rubble(3.0, 26, concreteDark, 55);
    rub.position.set(-24, UNDER.y, -22); P.NOCOLLIDE(rub); DETAIL.add(rub);
    ctx.hidingSpot(-40, UNDER.y, -34, 2.0, 1.0);
    ctx.hidingSpot(30, UNDER.y, 6, 2.0, 1.0);
    ctx.hidingSpot(-24, UNDER.y, -22, 1.8, 0.9);
  }

  // ===========================================================================
  // 17. LOCKER ROOM + DETAIL PASS
  // ===========================================================================
  {
    const LR = { x0: -45, x1: -36, z0: 26, z1: 38, h: 4.0 };
    const cx = (LR.x0 + LR.x1) / 2, cz = (LR.z0 + LR.z1) / 2;
    wallSeg(LR.x0, LR.z0, LR.x1, LR.z0, 0, LR.h, 0.4, brickSoot);
    wallSeg(LR.x0, LR.z1, LR.x1, LR.z1, 0, LR.h, 0.4, brickSoot);
    wallSeg(LR.x0, LR.z0, LR.x0, LR.z1, 0, LR.h, 0.4, brickSoot);
    // east wall with a doorway
    wallSeg(LR.x1, LR.z0, LR.x1, 30.2, 0, LR.h, 0.4, brickSoot);
    wallSeg(LR.x1, 32.4, LR.x1, LR.z1, 0, LR.h, 0.4, brickSoot);
    wallSeg(LR.x1, 30.2, LR.x1, 32.4, 2.2, LR.h, 0.4, brickSoot);
    put(SHELL, LR.x1 - LR.x0 + 0.5, 0.3, LR.z1 - LR.z0 + 0.5, cx, LR.h, cz, concreteDark);
    proxy(LR.x1 - LR.x0 + 0.5, 0.3, LR.z1 - LR.z0 + 0.5, cx, LR.h, cz);

    const lk1 = P.lockers(6, lockerSkin); lk1.position.set(cx - 1.4, 0, LR.z0 + 0.5); DETAIL.add(P.NOCOLLIDE(lk1));
    proxy(2.6, 1.85, 0.5, cx - 1.4, 0.93, LR.z0 + 0.5);
    const lk2 = P.lockers(5, lockerSkin); lk2.position.set(cx, 0, LR.z1 - 0.5); lk2.rotation.y = Math.PI;
    DETAIL.add(P.NOCOLLIDE(lk2));
    proxy(2.2, 1.85, 0.5, cx, 0.93, LR.z1 - 0.5);
    put(DETAIL, 0.4, 0.45, 4.0, LR.x0 + 1.0, 0.45, cz, woodDirty);
    // hard hats on pegs
    for (let i = 0; i < 6; i++) {
      const hat = P.sphere(0.16, M.solid({ color: i % 2 ? 0xc8a018 : 0xb04a1c, roughness: 0.5 }), { seg: 10, collide: false, shadow: false });
      hat.position.set(LR.x0 + 0.35, 2.1 - 0.32, LR.z0 + 2 + i * 1.5);
      hat.scale.y = 0.7;
      DETAIL.add(hat);
      put(DETAIL, 0.16, 0.05, 0.05, LR.x0 + 0.3, 2.15, LR.z0 + 2 + i * 1.5, greyMetal);
    }
    const bulb = P.pendant(1.0, { color: 0xffbb70, intensity: 6 });
    bulb.position.set(cx, LR.h - 0.1, cz); P.NOCOLLIDE(bulb); LIVE.add(bulb);
    if (lightCount < 22) {
      const l = new T.PointLight(0xffb066, 4.0, 13, 2);
      l.position.set(cx, LR.h - 1.2, cz);
      ctx.light(l); lightCount++;
    }
    const rota2 = put(DETAIL, 1.1, 0.85, 0.03, LR.x1 - 0.24, 2.1, LR.z1 - 3.0, rotaMat, -Math.PI / 2);
    rota2.castShadow = false;
    ctx.hidingSpot(cx - 2.4, 0, cz, 1.8, 1.0);
  }

  // scattered floor grime: wheelbarrows, tool boards, spilled sand, chains
  {
    for (const [x, z, ry] of [[-20, 12, 0.4], [12, -14, 2.2], [26, 34, 1.1]]) {
      const wb = new T.Group();
      put(wb, 1.0, 0.45, 0.8, 0, 0.6, 0, rustProp);
      const wl = P.cyl(0.28, 0.28, 0.12, blackMetal, { seg: 10, collide: false, shadow: false });
      wl.rotation.z = Math.PI / 2; wl.position.set(0, 0.28, 0.62); wb.add(wl);
      for (const s of [-1, 1]) put(wb, 0.06, 0.06, 1.7, s * 0.4, 0.72, -0.6, greyMetal);
      wb.position.set(x, 0, z); wb.rotation.y = ry;
      DETAIL.add(wb);
      proxy(1.2, 1.0, 1.4, x, 0.5, z, ry);
    }
    for (const [x, z, ry] of [[-49.2, -20, Math.PI / 2], [39.2, 24, -Math.PI / 2], [-49.2, 20, Math.PI / 2]]) {
      put(DETAIL, 2.6, 1.6, 0.1, x, 1.9, z, woodDirty, ry);
      for (let i = 0; i < 8; i++) {
        const dx = -1.1 + i * 0.3;
        put(DETAIL, 0.06, 0.7 + (i % 3) * 0.2, 0.06,
          x + dx * Math.cos(ry), 1.9 + (i % 2) * 0.3, z - dx * Math.sin(ry), greyMetal);
      }
    }
    // hanging chains and hooks in the roof space
    for (let i = 0; i < 16; i++) {
      const x = -44 + (i * 5.7) % 80, z = -36 + ((i * 13) % 70);
      const len = 3 + (i % 4) * 2.4;
      const ch = P.cyl(0.045, 0.045, len, blackMetal, { seg: 5, collide: false, shadow: false });
      ch.position.set(x, 40 - len, z);
      DETAIL.add(ch);
      const hk = new T.Mesh(new T.TorusGeometry(0.22, 0.05, 5, 12), greyMetal);
      hk.position.set(x, 40 - len - 0.2, z); hk.castShadow = false;
      DETAIL.add(hk);
    }
    // spilled sand and slag underfoot
    const spillGeo = new T.CircleGeometry(1, 8).rotateX(-Math.PI / 2);
    const spillMat = M.solid({ color: 0x2c2116, roughness: 0.98 });
    const spills = P.scatter(spillGeo, spillMat, 110, (i, d, r) => {
      const x = r.range(HALL.x0 + 3, HALL.x1 - 3), z = r.range(HALL.z0 + 3, HALL.z1 - 3);
      d.position.set(x, 0.045, z);
      d.scale.set(r.range(0.8, 3.2), 1, r.range(0.7, 2.6));
      d.rotation.y = r() * 3;
    }, 414);
    spills.castShadow = false;
    ctx.addDecor(spills);
    // loose slag chunks
    const chunks = P.scatter(slagGeo, slagRock, 260, (i, d, r) => {
      const x = r.range(HALL.x0 + 2, HALL.x1 - 2), z = r.range(HALL.z0 + 2, HALL.z1 - 2);
      d.position.set(x, 0.1, z);
      d.rotation.set(r() * 3, r() * 3, r() * 3);
      d.scale.setScalar(r.range(0.1, 0.34));
    }, 515);
    chunks.castShadow = false;
    ctx.addDecor(chunks);
    // extractor fans turning in the north wall, high up
    for (const [fx, fy] of [[-34, 30], [4, 30], [26, 30]]) {
      const ring = new T.Mesh(new T.TorusGeometry(2.4, 0.22, 6, 22), blackMetal);
      ring.position.set(fx, fy, HALL.z0 + 0.9); ring.castShadow = false;
      DETAIL.add(ring);
      put(DETAIL, 5.4, 5.4, 0.16, fx, fy, HALL.z0 + 1.2, M.emissive(0x24506e, 0.5));
      const blades = new T.Group();
      blades.position.set(fx, fy, HALL.z0 + 1.0);
      for (let b = 0; b < 5; b++) {
        const bl = P.boxC(4.2, 0.06, 0.42, blackMetal, { shadow: false });
        bl.rotation.z = (b / 5) * Math.PI * 2;
        bl.rotation.y = 0.35;
        blades.add(bl);
      }
      LIVE.add(blades);
      SPIN.push({ o: blades, axis: 'z', speed: 1.9 + fx * 0.01 });
    }

    // signage at eye level
    const sg = P.sign('DANGER\nMOLTEN METAL', { background: 0x8a1a10, color: 0xffe4b0, height: 0.7, emissive: 0x521008 });
    sg.position.set(-49.0, 2.0, -12); sg.rotation.y = Math.PI / 2;
    P.NOCOLLIDE(sg); DETAIL.add(sg);
    const sg2 = P.sign('BAY 3 — CASTING', { background: 0x1b2a3a, color: 0xd8e6f0, height: 0.6 });
    sg2.position.set(39.0, 2.6, 0); sg2.rotation.y = -Math.PI / 2;
    P.NOCOLLIDE(sg2); DETAIL.add(sg2);
    const sg3 = P.sign('HARD HATS\nBEYOND THIS POINT', { background: 0xb08a12, color: 0x1a1408, height: 0.55 });
    sg3.position.set(-35.6, 2.4, 32); sg3.rotation.y = Math.PI / 2;
    P.NOCOLLIDE(sg3); DETAIL.add(sg3);
  }

  // ===========================================================================
  // 18. PARTICLES — heat shimmer, rising embers, sparks, steam
  // ===========================================================================
  // heat shimmer in front of the furnace row
  const shimmers = [];
  for (const f of FURNACES) {
    const g = new T.PlaneGeometry(15, 15);
    const m = new T.Mesh(g, shimmerMat);
    m.position.set(f.x, 7.5, f.z + f.r + 2.4);
    m.castShadow = false; m.userData.collide = false;
    LIVE.add(m);
    shimmers.push(m);
  }

  // rising heat particles — one instanced buffer for every emitter
  let heatInst = null; const heatP = [];
  {
    let total = 0;
    for (const e of HEAT_EMIT) total += e.n;
    const geo = P.billboardCross(0.3, 0.36);
    const hm = M.emissive(0xff7a22, 2.6, { transparent: true, opacity: 0.55 }).clone();
    hm.depthWrite = false;
    hm.blending = T.AdditiveBlending;
    for (const e of HEAT_EMIT) {
      for (let i = 0; i < e.n; i++) {
        heatP.push({
          e, a: R.part.range(0, 6.283), rr: Math.sqrt(R.part()) * e.r,
          sp: R.part.range(0.06, 0.16), ph: R.part(), wob: R.part.range(0.3, 1.1),
        });
      }
    }
    heatInst = P.scatter(geo, hm, total, (i, d) => { d.position.set(0, -999, 0); }, 88);
    heatInst.castShadow = false; heatInst.receiveShadow = false;
    heatInst.frustumCulled = false;
    ctx.addDecor(heatInst);
  }

  // sparks — short bright arcs at the pour station, tap hole and grinder
  let sparkInst = null; const sparkP = [];
  {
    let total = 0;
    for (const e of SPARK_EMIT) total += e.n;
    const geo = new T.BoxGeometry(0.07, 0.07, 0.28);
    const sm = M.emissive(0xffe0a0, 8, { transparent: true, opacity: 0.95 }).clone();
    sm.depthWrite = false;
    sm.blending = T.AdditiveBlending;
    for (const e of SPARK_EMIT) {
      for (let i = 0; i < e.n; i++) {
        const a = R.part.range(0, 6.283);
        sparkP.push({
          e, vx: Math.cos(a) * R.part.range(0.3, 1) * e.spread,
          vz: Math.sin(a) * R.part.range(0.3, 1) * e.spread,
          vy: R.part.range(0.55, 1) * e.up,
          sp: R.part.range(0.7, 1.5), ph: R.part(),
        });
      }
    }
    sparkInst = P.scatter(geo, sm, total, (i, d) => { d.position.set(0, -999, 0); }, 99);
    sparkInst.castShadow = false; sparkInst.receiveShadow = false;
    sparkInst.frustumCulled = false;
    ctx.addDecor(sparkInst);
  }

  // steam / smoke columns off the pits and the water channels
  let steamInst = null; const steamP = [];
  {
    const cols = [];
    for (const p of PITS) cols.push([(p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2, 5.5]);
    cols.push([pour.x, 1.2, pour.z, 4.0]);
    for (const f of FURNACES) cols.push([f.x, 2.0, f.z + f.r + 3, 4.5]);
    cols.push([-5, -4.6, -30, 3.0], [-5, -4.6, -4, 3.0]);
    const geo = P.billboardCross(5.2, 6.4);
    for (const c of cols) {
      for (let i = 0; i < 5; i++) {
        steamP.push({ c, ph: i / 5 + R.part.range(-0.05, 0.05), sp: R.part.range(0.05, 0.1), dx: R.part.range(-1, 1), dz: R.part.range(-1, 1) });
      }
    }
    steamInst = P.scatter(geo, smokeMat, steamP.length, (i, d) => { d.position.set(0, -999, 0); }, 77);
    steamInst.castShadow = false; steamInst.receiveShadow = false;
    steamInst.frustumCulled = false;
    ctx.addDecor(steamInst);
  }

  // ===========================================================================
  // 19. THE REST OF THE LIGHT RIG — cold work lamps high in the hall
  // ===========================================================================
  ctx.light(new T.HemisphereLight(0x16222e, 0x0d0704, 0.12));
  ctx.light(new T.AmbientLight(0x0e0a07, 0.3));
  for (const [lx, ly, lz] of [[-38, 26, -34], [12, 26, 34], [34, 20, -38], [-30, 30, 26]]) {
    if (lightCount >= 22) break;
    const l = new T.PointLight(HOT.cold, 4.2, 30, 2);
    l.position.set(lx, ly, lz);
    ctx.light(l); lightCount++;
    const hood = P.cyl(0.45, 0.22, 0.5, blackMetal, { seg: 10, collide: false, shadow: false });
    hood.position.set(lx, ly + 0.5, lz); hood.rotation.x = Math.PI;
    DETAIL.add(hood);
    const lens = put(LIVE, 0.7, 0.1, 0.7, lx, ly + 0.16, lz, M.emissive(HOT.cold, 5.0));
    lens.castShadow = false;
  }

  // ===========================================================================
  // 20. COMMIT — freeze the static shell and steel, add the collision proxies
  // ===========================================================================
  ctx.addDecor(P.freeze(SHELL));
  ctx.addDecor(P.freeze(STEEL));
  ctx.addDecor(P.freeze(GRATE));
  ctx.addDecor(P.freeze(DETAIL));
  ctx.addSolid(COL);
  ctx.addDecor(LIVE);

  // ===========================================================================
  // 21. GAMEPLAY PLACEMENT
  // ===========================================================================
  const COINS = [
    // L1  y = 4 (6)
    [-30, 5, -41], [10, 5, -41], [-46.5, 5, -22], [-46.5, 5, 26], [-24, 5, 41], [36, 5, 14],
    // L2  y = 9 (5)
    [-38, 10, -19.5], [-16, 10, -19.5], [8, 10, -19.5], [-6, 10, -24.6], [32, 10, -2],
    // L3  y = 15 (7)
    [-42, 16, 0], [-24, 16, 0], [2, 16, 0], [22, 16, 0], [-30, 16, -19], [8, 16, -19], [-6, 16, -40],
    // L4  y = 22 (4)
    [-40, 23, -20], [-40, 23, 22], [0, 23, -34], [30, 23, 8],
    // L5  y = 30 (4)
    [-40, 31, 6], [-12, 31, -18.6], [16, 31, 33.4], [30, 31, -12],
    // roof walkways y = 36 (2)
    [-22, 37, -40], [4, 37, 40],
    // casting floor (5)
    [-42, 1, -12], [-2, 1, 10], [24, 1, 36], [34, 1, -20], [-20, 1, 38],
    // rolling mill (3, one on the mezzanine)
    [56, 1, 8], [74, 1, 38], [62, 7, -26],
    // scrap yard (2)
    [-70, 1, -44], [-88, 1, 24],
    // undercroft (4)
    [-38, -4, -30], [-12, -4, -18], [16, -4, 4], [28, -4, -32],
  ];
  for (const c of COINS) ctx.pickup(c[0], c[1], c[2], 'coin');

  // batteries — weighted to the dark
  ctx.pickup(-40, -4, -6, 'battery');
  ctx.pickup(6, -4, -34, 'battery');
  ctx.pickup(30, -4, -20, 'battery');
  ctx.pickup(-84, 1, -8, 'battery');
  ctx.pickup(82, 1, 6, 'battery');

  // powerups
  ctx.pickup(-24, -4, 4, 'powerup:ghost');
  ctx.pickup(-40, 23, -34, 'powerup:nightvision');
  ctx.pickup(66, 1, 8, 'powerup:dash');
  ctx.pickup(-64, 1, 58, 'powerup:jumpjet');

  // the dog, tucked under the pulpit console where nobody looks
  ctx.pickup(31.4, 9.45, 10.9, 'pup');

  // spots under and behind the catwalk network, not registered inline
  ctx.hidingSpot(-46.5, 4, -30, 1.6, 0.8);
  ctx.hidingSpot(-40, 15, -19, 1.6, 0.85);
  ctx.hidingSpot(-6, 15, -38, 1.8, 0.9);
  ctx.hidingSpot(-46, 0, 44, 1.8, 0.85);
  ctx.hidingSpot(38, 0, 43, 1.8, 0.85);

  // ===========================================================================
  // 22. MOTION
  // ===========================================================================
  const dummy = new T.Object3D();
  ctx.onUpdate((dt, t) => {
    // --- molten pulse -------------------------------------------------------
    for (let i = 0; i < RIGS.length; i++) {
      const r = RIGS[i];
      const n = noise.fbm(t * r.speed + r.phase, r.phase * 0.61, 3);
      const k = 1 + n * r.amp;
      for (let j = 0; j < r.mats.length; j++) r.mats[j].emissiveIntensity = r.base[j] * k;
      if (r.light) r.light.intensity = r.lightBase * Math.max(0.15, k);
    }

    // --- ladle swings, drips fall -------------------------------------------
    ladlePivot.rotation.z = Math.sin(t * 0.42) * 0.035;
    ladlePivot.rotation.x = Math.cos(t * 0.31) * 0.025;
    for (const d of drips) {
      const u = (t * 0.5 + d.ph) % 1;
      d.o.position.set(d.x, 9.5 - u * u * 9.0, d.z);
      d.o.scale.setScalar(u > 0.94 ? 0.01 : 1);
    }

    // --- cranes traverse, trolleys creep -------------------------------------
    for (const c of cranes) {
      c.g.position.x = -6 + Math.sin(t * 0.055 * c.dir + c.phase) * 32;
      c.trolley.position.z = Math.sin(t * 0.13 + c.phase) * 24;
    }
    // --- hanging things swing, turning things turn ---------------------------
    for (const s of SWAY) {
      s.o.rotation.z = Math.sin(t * s.speed + s.phase) * s.amp;
      s.o.rotation.x = Math.cos(t * s.speed * 0.77 + s.phase) * s.amp * 0.7;
      if (s.travel) s.o.position.z = s.base + Math.sin(t * s.tSpeed) * s.travel;
    }
    for (const s of SPIN) s.o.rotation[s.axis] = t * s.speed;

    // --- bogie rolls along the rail ------------------------------------------
    for (const b of bogies) {
      if (!b.speed) continue;
      const span = 70;
      const u = ((t * b.speed) % (span * 2));
      b.g.position.x = -40 + (u < span ? u : span * 2 - u);
    }

    // --- shimmer -------------------------------------------------------------
    shimmerMat.map.offset.set(Math.sin(t * 0.11) * 0.1, -t * 0.055);
    for (let i = 0; i < shimmers.length; i++) {
      shimmers[i].scale.set(1 + Math.sin(t * 0.7 + i) * 0.03, 1 + Math.cos(t * 0.5 + i) * 0.04, 1);
    }

    // --- rising heat ---------------------------------------------------------
    if (heatInst) {
      for (let i = 0; i < heatP.length; i++) {
        const p = heatP[i], e = p.e;
        const u = (t * p.sp + p.ph) % 1;
        const spread = 1 + u * 0.9;
        dummy.position.set(
          e.x + Math.cos(p.a) * p.rr * spread + Math.sin(t * 0.9 + p.ph * 6.3) * 0.3 * p.wob,
          e.y + u * e.rise,
          e.z + Math.sin(p.a) * p.rr * spread + Math.cos(t * 0.8 + p.ph * 5.1) * 0.3 * p.wob
        );
        const s = e.size * Math.sin(Math.PI * u) * 1.5;
        dummy.scale.setScalar(Math.max(0.001, s));
        dummy.rotation.y = p.ph * 6.283 + t * 0.4;
        dummy.updateMatrix();
        heatInst.setMatrixAt(i, dummy.matrix);
      }
      heatInst.instanceMatrix.needsUpdate = true;
    }

    // --- sparks --------------------------------------------------------------
    if (sparkInst) {
      for (let i = 0; i < sparkP.length; i++) {
        const p = sparkP[i], e = p.e;
        const u = (t * p.sp + p.ph) % 1;
        const life = u * 1.1;
        dummy.position.set(
          e.x + p.vx * life,
          e.y + p.vy * life - 9.8 * life * life * 0.55,
          e.z + p.vz * life
        );
        if (dummy.position.y < e.y - 1.4) dummy.position.y = -999;
        const s = Math.max(0.001, (1 - u) * (e.size / 0.1));
        dummy.scale.set(s, s, s * (1 + u * 2.4));
        dummy.rotation.set(p.ph * 6.0, Math.atan2(p.vx, p.vz), 0);
        dummy.updateMatrix();
        sparkInst.setMatrixAt(i, dummy.matrix);
      }
      sparkInst.instanceMatrix.needsUpdate = true;
    }

    // --- steam ---------------------------------------------------------------
    if (steamInst) {
      for (let i = 0; i < steamP.length; i++) {
        const p = steamP[i], c = p.c;
        const u = (t * p.sp + p.ph) % 1;
        dummy.position.set(c[0] + p.dx * u * 4.5, c[1] + u * c[3] * 2.6, c[2] + p.dz * u * 4.5);
        const s = 0.35 + u * 1.5;
        dummy.scale.setScalar(s * (1 - u * 0.15));
        dummy.rotation.y = p.ph * 6.283 + u * 0.7;
        dummy.updateMatrix();
        steamInst.setMatrixAt(i, dummy.matrix);
      }
      steamInst.instanceMatrix.needsUpdate = true;
    }

    // --- water ---------------------------------------------------------------
    for (let i = 0; i < TICKERS.length; i++) TICKERS[i](dt);
  });

  // ===========================================================================
  // AUTHORED PROPS — barrels, crates and scrap around the casting floor.
  // A foundry is the one place a rusted iron barrel needs no excuse.
  // ===========================================================================
  await ctx.kits.scatterKit(ctx, {
    kit: 'COVER', count: 14, seed: 'fg-cover',
    area: (r) => ({ x: r.range(-70, 70), y: 0, z: r.range(-60, 60) }),
    accept: (p) => Math.hypot(p.x - 8, p.z - 6) > 6,
  });
  await ctx.kits.scatterKit(ctx, {
    kit: 'DEBRIS', count: 12, seed: 'fg-debris', hide: false,
    area: (r) => ({ x: r.range(-72, 72), y: r.chance(0.25) ? -5 : 0, z: r.range(-62, 62) }),
  });
  await ctx.kits.scatterKit(ctx, {
    kit: 'CONTAINERS', count: 8, seed: 'fg-cont',
    area: (r) => ({ x: r.range(-68, 68), y: 0, z: r.range(-58, 58) }),
  });

}
