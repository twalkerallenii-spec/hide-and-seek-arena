// =============================================================================
// PALISADE MALL — a dead 1994 shopping centre at 3am.
//
// Two retail floors wrapped around a skylit atrium, a food court staring out at
// an empty car park, and a service level underneath that nobody has swept since
// the receivers came. Mauve and teal tile, brass trim, dead ficus, half the
// lights off, moonlight pooling on the floor of the atrium.
//
// Layout (metres, +X east, +Z south):
//   Main hall     x -76..76,  z -30..30      two floors
//   Food court    x -46..46,  z -62..-30     single tall volume
//   Promenade     x -18..18,  z  30..62      single tall volume
//   Car park      x -60..60,  z -88..-62     sealed, seen through glass
//   Service level y = -5, x -66..66, z -46..46
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'palisade',
  name: 'PALISADE MALL',
  tagline: 'Everything must go. Everything went.',
  order: 8,
  difficulty: 2,
  biome: 'indoor',
  seed: 19940812,
  spawn: [0, 0, 26],
  bounds: 100,
  colors: ['#c39aa9', '#26383c'],
  music: 'calm',
};

// --- level datums ------------------------------------------------------------
const Y_SVC = -5.0;         // service level floor
const Y_SVC_C = -1.6;       // service level ceiling underside
const Y_LOW = 0.0;          // lower concourse
const Y_LOW_C = 5.2;        // lower suspended ceiling
const Y_UPP = 6.2;          // upper concourse deck
const Y_UPP_C = 10.4;       // upper suspended ceiling
const Y_ROOF = 10.8;        // main hall roof underside
const Y_CLER = 13.6;        // clerestory head / vault springing
const Y_CROWN = 16.4;       // barrel vault crown

const U = 2.4;              // world metres per floor-tile texture repeat

export async function build(ctx) {
  const P = ctx.props;
  const MAT = ctx.mat;
  const rng = ctx.rng;

  const rStore = rng.fork('storefronts');
  const rSvc = rng.fork('service');
  const rTrash = rng.fork('litter');
  const rFood = rng.fork('foodcourt');

  // ===========================================================================
  // 1. MATERIALS  (18 surface() calls — everything else is solid/emissive)
  // ===========================================================================
  const M = {
    // the hero palette: five floor tiles, all sharing world-space UVs
    tMauve: MAT.surface('tile', { color: 0xb28f9d, grout: 0x6a5560, tiles: 4, rough: 0.22, seed: 11 }),
    tTeal: MAT.surface('tile', { color: 0x6ea59d, grout: 0x44605c, tiles: 4, rough: 0.22, seed: 12 }),
    tCream: MAT.surface('tile', { color: 0xd7cbb5, grout: 0x847a6b, tiles: 4, rough: 0.24, seed: 13 }),
    tSalmon: MAT.surface('tile', { color: 0xc78a6f, grout: 0x6c4f45, tiles: 4, rough: 0.22, seed: 14 }),
    tNavy: MAT.surface('tile', { color: 0x494354, grout: 0x2b2733, tiles: 4, rough: 0.26, seed: 15 }),

    wallCream: MAT.surface('plaster', { color: 0xcdc0a9, repeat: 6 }),
    wallMauve: MAT.surface('plaster', { color: 0x8a6b78, repeat: 5, seed: 7 }),
    wallTeal: MAT.surface('plaster', { color: 0x4b6d6a, repeat: 4, seed: 8 }),
    ceilTile: MAT.surface('ceilingTile', { color: 0xccc5b3, repeat: 1, size: 256 }),
    conc: MAT.surface('concrete', { color: 0x6d6964, repeat: 10 }),
    concDark: MAT.surface('concrete', { color: 0x3a3840, repeat: 8, seed: 4 }),
    carpTeal: MAT.surface('carpet', { color: 0x345c5a, repeat: 4, size: 256 }),
    carpRose: MAT.surface('carpet', { color: 0x7b4e5a, repeat: 4, size: 256, seed: 6 }),
    shutter: MAT.surface('corrugated', { color: 0x9a9d9f, ribs: 30, repeat: 1, size: 256 }),
    rusty: MAT.surface('rustMetal', { color: 0x4c524e, repeat: 1, size: 256 }),
    asphalt: MAT.surface('asphalt', { color: 0x2b2d30, repeat: 18 }),
    marble: MAT.surface('marble', { color: 0xc7bac0, vein: 0x6a5e6c, repeat: 2, size: 256 }),
    wood: MAT.surface('wood', { color: 0x6a4a2c, repeat: 2, size: 256 }),
  };

  const S = {
    brass: MAT.metal(0xb59152, 0.32),
    brassDull: MAT.solid({ color: 0x6d5630, metalness: 1, roughness: 0.58 }),
    mirror: MAT.solid({ color: 0xa8b1bc, metalness: 1, roughness: 0.07, envMapIntensity: 1.7 }),
    steel: MAT.metal(0x8a9098, 0.4),
    steelDark: MAT.metal(0x4a4f55, 0.55),
    dark: MAT.solid({ color: 0x1b1a1e, roughness: 0.85 }),
    black: MAT.solid({ color: 0x0d0d10, roughness: 0.55 }),
    plastic: MAT.solid({ color: 0xd6d0c2, roughness: 0.55 }),
    plasticDirty: MAT.solid({ color: 0x9c968a, roughness: 0.75 }),
    salmon: MAT.solid({ color: 0xc4795f, roughness: 0.7 }),
    teal: MAT.solid({ color: 0x3d7c78, roughness: 0.7 }),
    mauve: MAT.solid({ color: 0x9a7b8a, roughness: 0.75 }),
    cream: MAT.solid({ color: 0xc9bda6, roughness: 0.8 }),
    glass: MAT.glassCheap({ color: 0x8fb0bc, opacity: 0.14 }),
    glassDark: MAT.glassCheap({ color: 0x223038, opacity: 0.3 }),
    leaf: MAT.solid({ color: 0x6a6034, roughness: 0.95, flat: true }),
    trunk: MAT.solid({ color: 0x493a2b, roughness: 0.95 }),
    soil: MAT.solid({ color: 0x2a231c, roughness: 1 }),
    card: MAT.solid({ color: 0x8a7050, roughness: 0.95 }),
    tarp: MAT.solid({ color: 0x2f3a3a, roughness: 0.9 }),
  };

  const E = {
    warm: MAT.emissive(0xffb15c, 2.2),
    warmSoft: MAT.emissive(0xffc98a, 1.1),
    cold: MAT.emissive(0xcfe4ff, 2.4),
    tube: MAT.emissive(0xe6f2ff, 3.0),
    tubeDead: MAT.solid({ color: 0x2b2d33, roughness: 0.35 }),
    neonPink: MAT.emissive(0xff5aa0, 3.2),
    neonTeal: MAT.emissive(0x49efd6, 3.0),
    exit: MAT.emissive(0x37d268, 2.6),
    menu: MAT.emissive(0xffd9a0, 1.9),
    sodium: MAT.emissive(0xffa244, 3.2),
    crtDead: MAT.solid({ color: 0x14161a, roughness: 0.25, metalness: 0.1 }),
  };

  // ===========================================================================
  // 2. ATMOSPHERE
  // ===========================================================================
  ctx.sky({ color: 0x0a0c13 });
  ctx.fog(0x2a2630, 20, 130);
  ctx.useEnvironment(0.55);
  ctx.grade({
    saturation: 1.0, exposure: 1.0, contrast: 1.05,
    lift: [0.012, -0.002, 0.014], gain: [1.01, 0.995, 1.02],
    bloom: 0.5, bloomRadius: 0.85, bloomThreshold: 0.72,
    vignette: 1.0, grain: 0.04, aberration: 0.0018, scanline: 0,
  });
  ctx.soundscape('hum', 'calm', { size: 0.85, dark: 0.45, wet: 0.3 });

  // ===========================================================================
  // 3. BUILD SCAFFOLDING — freeze buckets, collision list, helpers
  // ===========================================================================
  const G = {
    shell: new THREE.Group(),    // walls / slabs / ceilings, both floors
    atrium: new THREE.Group(),   // fountain, escalators, balconies, vault
    stores: new THREE.Group(),   // all 20 retail units
    food: new THREE.Group(),     // food court
    prom: new THREE.Group(),     // south promenade
    svc: new THREE.Group(),      // service level
    ext: new THREE.Group(),      // car park beyond the glass
  };
  const LIVE = new THREE.Group();   // anything that animates — never frozen
  const ticks = [];                 // per-frame callbacks

  // -- invisible collision proxies -------------------------------------------
  const COLB = [];
  const col = (w, h, d, x, y, z, ry = 0, rx = 0) => COLB.push([w, h, d, x, y, z, ry, rx]);

  /** Floor slab: collision box under a rect, top face at y. */
  const slab = (x0, z0, x1, z1, y, t = 0.6) =>
    col(Math.abs(x1 - x0), t, Math.abs(z1 - z0), (x0 + x1) / 2, y - t / 2, (z0 + z1) / 2);

  /** Walkable ramp collider between two points (stairs, escalators). */
  function ramp(x0, z0, y0, x1, z1, y1, width, thick = 0.6) {
    const dx = x1 - x0, dz = z1 - z0, dy = y1 - y0;
    const run = Math.hypot(dx, dz);
    const len = Math.hypot(run, dy);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, run);
    col(width, thick, len,
      (x0 + x1) / 2, (y0 + y1) / 2 - (thick / 2) * Math.cos(pitch), (z0 + z1) / 2,
      yaw, -pitch);
  }

  /** Wall run between two XZ points; visual into `g`, collision separately. */
  function wall(g, x1, z1, x2, z2, y0, h, t, material) {
    const w = P.wallBetween(x1, z1, x2, z2, h, t, material);
    w.position.y += y0;
    g.add(w);
    const len = Math.hypot(x2 - x1, z2 - z1);
    col(len, h, t, (x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2, -Math.atan2(z2 - z1, x2 - x1));
    return w;
  }

  /** Flat slab of geometry used as a ceiling / soffit (visual only). */
  function plate(g, x0, z0, x1, z1, y, t, material) {
    const b = P.boxC(Math.abs(x1 - x0), t, Math.abs(z1 - z0), material, { collide: false, shadow: true });
    b.position.set((x0 + x1) / 2, y + t / 2, (z0 + z1) / 2);
    g.add(b);
    return b;
  }

  /** Box helper straight into a freeze bucket. */
  function bx(g, w, h, d, x, y, z, material, ry = 0, shadow = true) {
    const b = P.boxC(w, h, d, material, { collide: false, shadow });
    b.position.set(x, y, z);
    if (ry) b.rotation.y = ry;
    g.add(b);
    return b;
  }

  function cy(g, r, h, x, y, z, material, seg = 14) {
    const c = P.cyl(r, r, h, material, { seg, collide: false });
    c.position.set(x, y, z);
    g.add(c);
    return c;
  }

  /** Inclined box along an arbitrary 3D run — escalator trusses, handrails. */
  function inclined(g, x0, z0, y0, x1, z1, y1, w, h, material, off = 0) {
    const dx = x1 - x0, dz = z1 - z0, dy = y1 - y0;
    const run = Math.hypot(dx, dz), len = Math.hypot(run, dy);
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, run);
    const b = P.boxC(w, h, len, material, { collide: false, shadow: true });
    b.rotation.order = 'YXZ';
    b.position.set(
      (x0 + x1) / 2 + Math.cos(yaw) * off,
      (y0 + y1) / 2,
      (z0 + z1) / 2 - Math.sin(yaw) * off
    );
    b.rotation.y = yaw;
    b.rotation.x = -pitch;
    g.add(b);
    return b;
  }

  /** Fascia / poster panel from generated text. */
  function textPanel(g, text, x, y, z, ry, h, o = {}) {
    const t = MAT.textMaterial(text, {
      color: o.color ?? 0xf2e8d8,
      background: o.bg,
      fontSize: o.fontSize ?? 84,
      emissive: o.emissive,
      emissiveIntensity: o.ei ?? 1.5,
      stroke: o.stroke,
    });
    const w = h * t.aspect;
    const p = P.boxC(w, h, 0.06, t.material, { collide: false, shadow: false });
    p.position.set(x, y, z);
    p.rotation.y = ry;
    g.add(p);
    p.userData.size = [w, h];
    return p;
  }

  // ===========================================================================
  // 4. FLOOR SYSTEM — decorative tile laid as world-UV quads, merged per colour
  // ===========================================================================
  const floorBuckets = new Map();

  function quad(material, x0, z0, x1, z1, y) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1,
    ]), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    ]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      x0 / U, z0 / U, x1 / U, z0 / U, x1 / U, z1 / U, x0 / U, z1 / U,
    ]), 2));
    g.setIndex([0, 3, 2, 0, 2, 1]);
    if (!floorBuckets.has(material)) floorBuckets.set(material, []);
    floorBuckets.get(material).push(g);
  }

  /** Tile a rectangle with `cell`-metre modules, colour chosen by `pattern`. */
  function tileRect(x0, z0, x1, z1, y, cell, pattern, skip) {
    const nx = Math.max(1, Math.round((x1 - x0) / cell));
    const nz = Math.max(1, Math.round((z1 - z0) / cell));
    const cw = (x1 - x0) / nx, cd = (z1 - z0) / nz;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const ax = x0 + i * cw, az = z0 + j * cd;
        const mx = ax + cw / 2, mz = az + cd / 2;
        if (skip && skip(mx, mz)) continue;
        quad(pattern(mx, mz), ax, az, ax + cw, az + cd, y);
      }
    }
  }

  // --- pattern functions -----------------------------------------------------
  // Compass-rose medallion under the atrium, then concentric bands.
  function patAtrium(x, z) {
    const r = Math.hypot(x, z);
    if (r < 1.1) return M.tNavy;
    if (r < 1.9) return M.tSalmon;
    if (r < 13.6) {
      const a = Math.atan2(z, x);
      const star = 3.1 + Math.pow(Math.abs(Math.cos(a * 4)), 0.65) * 5.4;
      if (r < star) return M.tCream;
      if (r < 9.4) return M.tMauve;
      if (r < 10.2) return M.tNavy;
      if (r < 11.4) return M.tTeal;
      if (r < 12.2) return M.tNavy;
      return M.tCream;
    }
    // surround: mauve field with cream diamond insets, teal edge band
    if (Math.abs(x) > 21.5 || Math.abs(z) > 19.5) return M.tTeal;
    return diamondField(x, z);
  }

  function diamondField(x, z) {
    const gx = ((x % 6) + 6) % 6 - 3, gz = ((z % 6) + 6) % 6 - 3;
    if (Math.abs(gx) + Math.abs(gz) < 1.2) return M.tCream;
    return M.tMauve;
  }

  // Wing concourses: dark border at the shopfronts, teal guard band,
  // cream runner down the middle with a salmon pinstripe.
  function bandPattern(t, lim) {
    const edge = lim - t;
    if (edge < 1.3) return M.tNavy;
    if (edge < 2.7) return M.tTeal;
    if (t < 2.6) return M.tCream;
    if (t < 3.5) return M.tSalmon;
    return null;
  }
  function patWingEW(x, z) { return bandPattern(Math.abs(z), 13) ?? diamondField(x, z); }
  function patWingNS(x, z) { return bandPattern(Math.abs(x), 18) ?? diamondField(x, z); }
  function patFood(x, z) {
    if (z < -58.5 || Math.abs(x) > 43) return M.tNavy;
    if (z < -56.5) return M.tSalmon;
    const gx = ((x % 4) + 4) % 4 - 2, gz = ((z % 4) + 4) % 4 - 2;
    return (Math.abs(gx) < 1) === (Math.abs(gz) < 1) ? M.tCream : M.tTeal;
  }
  function patProm(x, z) {
    if (Math.abs(x) > 15.5) return M.tNavy;
    if (Math.abs(x) > 14) return M.tSalmon;
    return diamondField(x, z);
  }
  function patUpper(x, z) {
    const inWing = Math.abs(x) > 24;
    const t = inWing ? Math.abs(z) : 0;
    if (inWing) {
      const b = bandPattern(t, 13);
      if (b) return b;
      return diamondField(x, z);
    }
    // atrium balconies get the teal border, mauve field
    const r = Math.max(Math.abs(x) / 24, Math.abs(z) / 22);
    if (r > 0.93) return M.tTeal;
    return diamondField(x, z);
  }

  // ===========================================================================
  // 5. LOWER CONCOURSE FLOOR + SLABS
  // ===========================================================================
  // Two stairwell voids punched through the lower slab.
  const HOLE_W = [-58, 2, -50, 13];        // west wing service stair
  const HOLE_P = [10, 30, 17, 42];         // promenade fire stair
  const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
  const lowSkip = (x, z) => inRect(HOLE_W, x, z) || inRect(HOLE_P, x, z);

  // atrium core at 1.5 m modules so the rose reads crisply
  tileRect(-18, -18, 18, 18, Y_LOW, 1.5, patAtrium);
  tileRect(-24, -30, 24, -18, Y_LOW, 3, patAtrium);
  tileRect(-24, 18, 24, 30, Y_LOW, 3, patAtrium);
  tileRect(-24, -18, -18, 18, Y_LOW, 3, patAtrium);
  tileRect(18, -18, 24, 18, Y_LOW, 3, patAtrium);
  // east + west wing concourses
  tileRect(24, -13, 76, 13, Y_LOW, 3, patWingEW, lowSkip);
  tileRect(-76, -13, -24, 13, Y_LOW, 3, patWingEW, lowSkip);
  // north junction into the food court, south junction into the promenade
  tileRect(-18, -34, 18, -30, Y_LOW, 2, patWingNS);
  tileRect(-18, 30, 18, 34, Y_LOW, 2, patWingNS);
  // food court + promenade
  tileRect(-46, -62, 46, -34, Y_LOW, 3, patFood);
  tileRect(-18, 34, 18, 62, Y_LOW, 3, patProm, lowSkip);

  // collision slabs for the lower floor (kept to a handful of big boxes)
  slab(-24, -30, 24, 30, Y_LOW);
  slab(24, -13, 76, 2, Y_LOW);
  slab(24, 2, 76, 13, Y_LOW);
  slab(-50, -13, -24, 13, Y_LOW);
  slab(-76, -13, -50, 2, Y_LOW);
  slab(-76, 2, -58, 13, Y_LOW);     // leaves the stairwell hole open
  slab(-50, 2, -24, 13, Y_LOW);
  slab(-46, -62, 46, -30, Y_LOW);
  slab(-18, 30, 10, 62, Y_LOW);
  slab(10, 30, 18, 30.001, Y_LOW);
  slab(17, 30, 18, 62, Y_LOW);
  slab(10, 42, 17, 62, Y_LOW);

  // ===========================================================================
  // 6. UPPER DECK — balconies, bridges, wing decks, light wells
  // ===========================================================================
  const UPPER_DECKS = [
    [-24, -22, 24, -14],   // north balcony
    [-24, 14, 24, 22],     // south balcony
    [-24, -14, -16, 2],    // west balcony (stairwell to the south of it)
    [16, -14, 24, -3],     // east balcony, north of the lift
    [16, 3, 24, 14],       // east balcony, south of the lift
    [-12, -14, 0, -3],     // north escalator bridge
    [0, 3, 12, 14],        // south escalator bridge
    // east wing deck, wrapped around a light well at x 42..58, z -8..8
    [24, -13, 42, 13], [58, -13, 76, 13], [42, -13, 58, -8], [42, 8, 58, 13],
    // west wing deck, light well at x -58..-42
    [-42, -13, -24, 13], [-76, -13, -58, 13], [-58, -13, -42, -8], [-58, 8, -42, 13],
    // atrium corner returns into the wings
    [-24, -30, 24, -22], [-24, 22, 24, 30],
  ];
  for (const [x0, z0, x1, z1] of UPPER_DECKS) {
    plate(G.shell, x0, z0, x1, z1, Y_UPP - 0.55, 0.55, M.wallCream);
    tileRect(x0, z0, x1, z1, Y_UPP + 0.002, 3, patUpper);
    slab(x0, z0, x1, z1, Y_UPP, 0.55);
  }

  // ===========================================================================
  // 7. RAILINGS — brass top rail, glass infill, instanced balusters
  // ===========================================================================
  const railRuns = [];
  const rail = (x1, z1, x2, z2, y) => railRuns.push([x1, z1, x2, z2, y]);

  // atrium void edges
  rail(-24, -14, -12, -14, Y_UPP); rail(0, -14, 24, -14, Y_UPP);
  rail(-24, 14, 0, 14, Y_UPP); rail(12, 14, 24, 14, Y_UPP);
  rail(-16, -14, -16, 2, Y_UPP);
  rail(-24, 2, -21.2, 2, Y_UPP); rail(-18.8, 2, -16, 2, Y_UPP);
  rail(16, -14, 16, -3, Y_UPP); rail(16, 3, 16, 14, Y_UPP);
  rail(16, -3, 17.2, -3, Y_UPP); rail(22.8, -3, 24, -3, Y_UPP);
  rail(16, 3, 17.2, 3, Y_UPP); rail(22.8, 3, 24, 3, Y_UPP);
  // escalator bridges
  rail(-12, -14, -12, -3, Y_UPP); rail(0, -14, 0, -3, Y_UPP);
  rail(-12, -3, -6.4, -3, Y_UPP); rail(-3.6, -3, 0, -3, Y_UPP);
  rail(12, 3, 12, 14, Y_UPP); rail(0, 3, 0, 14, Y_UPP);
  rail(0, 3, 3.6, 3, Y_UPP); rail(6.4, 3, 12, 3, Y_UPP);
  // wing light wells
  for (const sx of [1, -1]) {
    const a = sx * 42, b = sx * 58;
    rail(a, -8, b, -8, Y_UPP); rail(a, 8, b, 8, Y_UPP);
    rail(a, -8, a, 8, Y_UPP); rail(b, -8, b, 8, Y_UPP);
  }
  // lower-floor stairwell guards
  rail(-58, 2, -50, 2, Y_LOW); rail(-58, 2, -58, 13, Y_LOW); rail(-50, 2, -50, 13, Y_LOW);
  rail(10, 30, 10, 42, Y_LOW); rail(17, 30, 17, 42, Y_LOW); rail(10, 42, 17, 42, Y_LOW);
  // food court mezzanine lip looking down from the north wing
  rail(-18, -30, -6, -30, Y_UPP); rail(6, -30, 18, -30, Y_UPP);

  const balusterPts = [];
  for (const [x1, z1, x2, z2, y] of railRuns) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.3) continue;
    const ang = -Math.atan2(z2 - z1, x2 - x1);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    bx(G.atrium, len, 0.07, 0.09, mx, y + 1.07, mz, S.brass, ang, false);
    bx(G.atrium, len, 0.05, 0.05, mx, y + 0.12, mz, S.brassDull, ang, false);
    bx(G.atrium, len, 0.88, 0.02, mx, y + 0.58, mz, S.glass, ang, false);
    col(len, 1.15, 0.16, mx, y + 0.575, mz, ang);
    const n = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      balusterPts.push([x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t]);
    }
  }
  {
    const g = new THREE.CylinderGeometry(0.032, 0.038, 1.07, 8);
    g.translate(0, 0.535, 0);
    const inst = P.scatter(g, S.brass, balusterPts.length, (i, d) => {
      const p = balusterPts[i];
      d.position.set(p[0], p[1], p[2]);
    }, 5);
    inst.castShadow = false;
    ctx.addDecor(inst);
  }

  // ===========================================================================
  // 8. SHELL — perimeter walls, roof slabs, clerestory, barrel vault
  // ===========================================================================
  const W = wall.bind(null, G.shell);

  // main hall perimeter (0 -> roof)
  W(-76, -30, -76, 30, 0, Y_ROOF, 0.7, M.wallCream);
  W(76, -30, 76, 30, 0, Y_ROOF, 0.7, M.wallCream);
  W(-76, -30, -46, -30, 0, Y_ROOF, 0.7, M.wallCream);
  W(46, -30, 76, -30, 0, Y_ROOF, 0.7, M.wallCream);
  W(-76, 30, -18, 30, 0, Y_ROOF, 0.7, M.wallCream);
  W(18, 30, 76, 30, 0, Y_ROOF, 0.7, M.wallCream);
  // food court south wall, with the 36 m opening onto the atrium junction
  W(-46, -30, -18, -30, 0, 10.0, 0.7, M.wallCream);
  W(18, -30, 46, -30, 0, 10.0, 0.7, M.wallCream);
  // food court + promenade perimeter
  W(-46, -62, -46, -30, 0, 10.0, 0.7, M.wallCream);
  W(46, -62, 46, -30, 0, 10.0, 0.7, M.wallCream);
  W(-18, 30, -18, 62, 0, 8.6, 0.7, M.wallMauve);
  W(18, 30, 18, 62, 0, 8.6, 0.7, M.wallMauve);
  W(-18, 62, 18, 62, 0, 8.6, 0.7, M.wallMauve);

  // dado rail + skirting at eye level around the big public walls
  for (const [x1, z1, x2, z2, h] of [
    [-76, -30, -76, 30, Y_ROOF], [76, -30, 76, 30, Y_ROOF],
    [-46, -62, -46, -30, 10], [46, -62, 46, -30, 10],
    [-18, 30, -18, 62, 8.6], [18, 30, 18, 62, 8.6], [-18, 62, 18, 62, 8.6],
  ]) {
    const len = Math.hypot(x2 - x1, z2 - z1), ang = -Math.atan2(z2 - z1, x2 - x1);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const nx = Math.sign(mx) * -0.4, nz = Math.sign(mz) * -0.4;
    const ox = Math.abs(x2 - x1) < 0.1 ? nx : 0, oz = Math.abs(z2 - z1) < 0.1 ? nz : 0;
    bx(G.shell, len, 0.22, 0.08, mx + ox, 0.11, mz + oz, S.dark, ang, false);
    bx(G.shell, len, 0.13, 0.07, mx + ox, 1.12, mz + oz, S.brassDull, ang, false);
    bx(G.shell, len, 0.5, 0.06, mx + ox, 1.4, mz + oz, M.wallMauve, ang, false);
    if (h > 9) bx(G.shell, len, 0.16, 0.07, mx + ox, 5.6, mz + oz, S.brassDull, ang, false);
  }

  // roof slabs: main hall (with the atrium clerestory punched out)
  plate(G.shell, -76, -30, -24, 30, Y_ROOF, 0.5, M.wallCream);
  plate(G.shell, 24, -30, 76, 30, Y_ROOF, 0.5, M.wallCream);
  plate(G.shell, -24, -30, 24, -22, Y_ROOF, 0.5, M.wallCream);
  plate(G.shell, -24, 22, 24, 30, Y_ROOF, 0.5, M.wallCream);
  plate(G.food, -46, -62, 46, -30, 10.0, 0.5, M.wallCream);
  plate(G.prom, -18, 30, 18, 62, 8.6, 0.5, M.wallCream);

  // clerestory drum around the atrium void
  for (const [x1, z1, x2, z2] of [
    [-24, -22, 24, -22], [-24, 22, 24, 22], [-24, -22, -24, 22], [24, -22, 24, 22],
  ]) {
    const len = Math.hypot(x2 - x1, z2 - z1), ang = -Math.atan2(z2 - z1, x2 - x1);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    bx(G.atrium, len, Y_CLER - Y_ROOF, 0.6, mx, (Y_ROOF + Y_CLER) / 2, mz, M.wallCream, ang);
    col(len, Y_CLER - Y_ROOF, 0.6, mx, (Y_ROOF + Y_CLER) / 2, mz, ang);
    bx(G.atrium, len, 0.28, 0.72, mx, Y_ROOF + 0.5, mz, S.brassDull, ang, false);
    bx(G.atrium, len, 0.2, 0.72, mx, Y_CLER - 0.2, mz, S.brassDull, ang, false);
  }

  // --- glazed barrel vault: a shallow parabolic arch of panes on brass ribs ---
  {
    const HW = 22, RISE = Y_CROWN - Y_CLER, N = 14;
    const arcY = (t) => Y_CLER + RISE * (1 - t * t);   // t = z / HW
    for (let i = 0; i < N; i++) {
      const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
      const z0 = t0 * HW, z1 = t1 * HW;
      const y0 = arcY(t0), y1 = arcY(t1);
      const pane = inclined(G.atrium, 0, z0, y0, 0, z1, y1, 47.5, 0.06, S.glass);
      pane.castShadow = false;
      const rib = inclined(G.atrium, 0, z0, y0 + 0.09, 0, z1, y1 + 0.09, 48, 0.14, S.brassDull);
      rib.castShadow = false;
      // longitudinal purlins every 8 m so the vault reads as a frame
      for (const px of [-24, -16, -8, 0, 8, 16, 24]) {
        const p = inclined(G.atrium, px, z0, y0 + 0.1, px, z1, y1 + 0.1, 0.16, 0.16, S.brassDull);
        p.castShadow = false;
      }
    }
    // gable infill at each end of the vault
    for (const sx of [-1, 1]) {
      bx(G.atrium, 0.5, RISE, HW * 2, sx * 23.8, Y_CLER + RISE / 2, 0, M.wallCream);
      col(0.5, RISE, HW * 2, sx * 23.8, Y_CLER + RISE / 2, 0);
    }
  }

  // ===========================================================================
  // 9. SUSPENDED CEILINGS — instanced mineral-fibre tiles with gaps
  // ===========================================================================
  {
    const plenum = [
      [-76, -13, -24, 13, Y_LOW_C], [24, -13, 76, 13, Y_LOW_C],
      [-24, -30, 24, 30, Y_LOW_C],
      [-76, -13, -24, 13, Y_UPP_C], [24, -13, 76, 13, Y_UPP_C],
      [-24, -30, 24, -22, Y_UPP_C], [-24, 22, 24, 30, Y_UPP_C],
    ];
    // dark plenum backing so missing tiles read as holes
    for (const [x0, z0, x1, z1, y] of plenum) plate(G.shell, x0, z0, x1, z1, y + 0.05, 0.12, M.concDark);

    const pts = [];
    const rC = rng.fork('ceiling');
    for (const [x0, z0, x1, z1, y] of plenum) {
      for (let x = x0 + 0.6; x < x1; x += 1.2) {
        for (let z = z0 + 0.6; z < z1; z += 1.2) {
          // the atrium void has no ceiling above it
          if (Math.abs(x) < 24.5 && Math.abs(z) < 22.5) continue;
          if (y === Y_LOW_C && (Math.abs(x) < 25 || Math.abs(z) > 13.5)) {
            if (!(Math.abs(x) < 24.5 && Math.abs(z) <= 30)) continue;
          }
          if (rC.chance(0.055)) continue;                    // missing tile
          pts.push([x, y, z, rC.chance(0.06) ? rC.range(-0.09, 0.09) : 0]);
        }
      }
    }
    const tileGeo = new THREE.PlaneGeometry(1.16, 1.16);
    tileGeo.rotateX(Math.PI / 2);
    const inst = P.scatter(tileGeo, M.ceilTile, pts.length, (i, d) => {
      const p = pts[i];
      d.position.set(p[0], p[1], p[2]);
      if (p[3]) { d.rotation.z = p[3]; d.position.y -= 0.05; }
    }, 9);
    inst.castShadow = false;
    ctx.addDecor(inst);
    // T-bar grid: one instanced runner per row keeps it to a single draw call
    const barGeo = new THREE.BoxGeometry(1.2, 0.04, 0.05);
    const bars = [];
    for (const [x0, z0, x1, z1, y] of plenum) {
      for (let z = z0; z <= z1 + 0.01; z += 1.2) {
        for (let x = x0 + 0.6; x < x1; x += 1.2) {
          if (Math.abs(x) < 24.5 && Math.abs(z) < 22.5) continue;
          bars.push([x, y + 0.03, z]);
        }
      }
    }
    const binst = P.scatter(barGeo, S.plasticDirty, bars.length, (i, d) => {
      d.position.set(bars[i][0], bars[i][1], bars[i][2]);
    }, 10);
    binst.castShadow = false;
    ctx.addDecor(binst);
  }

  // recessed downlights — 95% dead, instanced in two buckets
  {
    const dead = [], liveL = [];
    const rD = rng.fork('downlights');
    for (const [x0, z0, x1, z1, y] of [
      [-74, -12, -26, 12, Y_LOW_C], [26, -12, 74, 12, Y_LOW_C],
      [-74, -12, -26, 12, Y_UPP_C], [26, -12, 74, 12, Y_UPP_C],
      [-44, -60, 44, -32, 9.98], [-16, 32, 16, 60, 8.58],
    ]) {
      for (let x = x0; x < x1; x += 5.6) {
        for (let z = z0; z < z1; z += 5.6) {
          (rD.chance(0.09) ? liveL : dead).push([x, y - 0.02, z]);
        }
      }
    }
    const disc = new THREE.CylinderGeometry(0.15, 0.19, 0.06, 12);
    const i1 = P.scatter(disc, S.plasticDirty, dead.length, (i, d) => d.position.set(...dead[i]), 11);
    const i2 = P.scatter(disc, E.warmSoft, liveL.length, (i, d) => d.position.set(...liveL[i]), 12);
    i1.castShadow = false; i2.castShadow = false;
    ctx.addDecor(i1, i2);
  }

  // ===========================================================================
  // 10. STOREFRONTS — 20 units across two floors, nine dressing recipes
  // ===========================================================================
  const carpetRects = [];       // for setSurface()
  const storeLights = [];       // { pos, color } for the lit beacons
  const crtScreens = [];        // animated CRTs
  const neonBuzz = [];          // animated neon tubes

  const SHOP_DEPTH = 12;

  function buildStore(bay, band) {
    const { x: cx, w, kind, name, seed } = bay;
    const { line, facing, floorY, openH, bulkTop } = band;
    const g = G.stores;
    const r = ctx.rng.fork('shop' + seed);
    const dir = facing;                       // +1: interior toward -Z, else +Z
    const z0 = line - dir * SHOP_DEPTH;       // back wall
    const zi = (t) => line - dir * t;         // depth t into the shop
    const zMin = Math.min(line, z0), zMax = Math.max(line, z0);
    const enter = kind !== 'shutter' && kind !== 'papered';

    // --- shell -------------------------------------------------------------
    const carp = (seed & 1) ? M.carpTeal : M.carpRose;
    const useCarpet = kind === 'clothing' || kind === 'books' || kind === 'lit' || kind === 'toys';
    quad(useCarpet ? carp : M.tCream, cx - w / 2, zMin, cx + w / 2, zMax, floorY + 0.004);
    if (useCarpet) carpetRects.push([cx - w / 2, zMin, cx + w / 2, zMax, floorY]);
    slab(cx - w / 2 - 0.3, zMin - 0.3, cx + w / 2 + 0.3, zMax + 0.3, floorY);

    const iw = kind === 'lit' ? M.wallCream : M.wallMauve;
    for (const sx of [-1, 1]) {
      bx(g, 0.3, openH, SHOP_DEPTH, cx + sx * w / 2, floorY + openH / 2, zi(SHOP_DEPTH / 2), iw);
      col(0.3, openH, SHOP_DEPTH, cx + sx * w / 2, floorY + openH / 2, zi(SHOP_DEPTH / 2));
    }
    bx(g, w, openH, 0.4, cx, floorY + openH / 2, zi(SHOP_DEPTH), iw);
    col(w, openH, 0.4, cx, floorY + openH / 2, zi(SHOP_DEPTH));
    plate(g, cx - w / 2, zMin, cx + w / 2, zMax, floorY + openH, 0.25, M.concDark);
    // shopfront reveal: brass threshold strip + a stub of glass side-return
    bx(g, w, 0.05, 0.5, cx, floorY + 0.03, line, S.brassDull, 0, false);
    for (const sx of [-1, 1]) {
      bx(g, 0.14, openH, 0.5, cx + sx * (w / 2 - 0.2), floorY + openH / 2, zi(0.25), S.brassDull);
    }

    // --- bulkhead + fascia --------------------------------------------------
    const bandH = bulkTop - floorY - openH;
    bx(g, w + 1.0, bandH, 1.1, cx, floorY + openH + bandH / 2, zi(-0.25), M.wallCream);
    col(w + 1.0, bandH, 1.1, cx, floorY + openH + bandH / 2, zi(-0.25));
    const litSign = kind === 'lit';
    textPanel(g, name, cx, floorY + openH + bandH * 0.5, line + dir * 0.85,
      dir > 0 ? 0 : Math.PI, bandH * 0.56, {
      color: litSign ? 0xfff2dc : 0xd9cdb8,
      bg: r.pick([0x3a2f38, 0x243634, 0x40303a, 0x2b2b34]),
      emissive: litSign ? r.pick([0xff5aa0, 0x49efd6, 0xffb15c]) : undefined,
      ei: 2.0,
    });
    // dead neon accent tube tracing the fascia
    bx(g, w * 0.94, 0.07, 0.07, cx, floorY + openH + 0.18, line + dir * 0.9,
      litSign ? E.neonTeal : E.tubeDead, 0, false);

    // --- opening treatment --------------------------------------------------
    if (kind === 'shutter') {
      bx(g, w, openH, 0.12, cx, floorY + openH / 2, line + dir * 0.1, M.shutter);
      col(w, openH, 0.3, cx, floorY + openH / 2, line + dir * 0.1);
      bx(g, w, 0.16, 0.24, cx, floorY + 0.08, line + dir * 0.1, S.steelDark, 0, false);
      if (r.chance(0.5)) {
        textPanel(g, 'CLOSED\nFOR GOOD', cx + r.range(-2, 2), floorY + 1.7, line + dir * 0.22,
          dir > 0 ? 0 : Math.PI, 0.5, { color: 0x1a1a1e, bg: 0xc9bda6 });
      }
    } else if (kind === 'shutterOpen') {
      const gap = 1.06;
      bx(g, w, openH - gap, 0.12, cx, floorY + gap + (openH - gap) / 2, line + dir * 0.1, M.shutter);
      col(w, openH - gap, 0.3, cx, floorY + gap + (openH - gap) / 2, line + dir * 0.1);
      bx(g, w, 0.12, 0.22, cx, floorY + gap, line + dir * 0.1, S.steelDark, 0, false);
      ctx.hidingSpot(cx, floorY, zi(4), 3.0, 1.0);
      ctx.hidingSpot(cx + w * 0.3, floorY, zi(9), 2.4, 1.0);
    } else if (kind === 'papered') {
      bx(g, w, openH, 0.06, cx, floorY + openH / 2, line + dir * 0.06, S.glassDark);
      col(w, openH, 0.2, cx, floorY + openH / 2, line + dir * 0.06);
      for (let i = 0; i < 5; i++) {
        bx(g, w / 5 * 0.94, openH * r.range(0.5, 0.8), 0.02,
          cx - w / 2 + w / 5 * (i + 0.5), floorY + openH * r.range(0.3, 0.45),
          line + dir * 0.12, S.cream, r.range(-0.03, 0.03), false);
      }
      textPanel(g, 'RETAIL UNIT\nAVAILABLE\n555-0148', cx, floorY + 2.0, line + dir * 0.16,
        dir > 0 ? 0 : Math.PI, 0.9, { color: 0x2a2530, bg: 0xd8cdb6 });
    }

    if (enter) {
      // a hiding spot deep in every open unit
      ctx.hidingSpot(cx + r.range(-w * 0.3, w * 0.3), floorY, zi(r.range(7, 10.5)), 2.6, 0.95);
    }

    // --- dressing -----------------------------------------------------------
    if (kind === 'electronics') {
      // a wall of dead CRTs on shelving; one still hissing static
      const cols = Math.floor(w / 1.15), rows = 4;
      const liveI = r.int(0, cols - 1), liveJ = r.int(1, 2);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const px = cx - (cols - 1) * 0.575 + i * 1.15;
          const py = floorY + 0.55 + j * 0.82;
          bx(g, 0.92, 0.72, 0.72, px, py, zi(SHOP_DEPTH - 0.65), S.plasticDirty);
          const screen = P.boxC(0.72, 0.54, 0.03, E.crtDead, { collide: false, shadow: false });
          screen.position.set(px, py + 0.02, zi(SHOP_DEPTH - 1.02));
          if (i === liveI && j === liveJ) { crtScreens.push(screen); LIVE.add(screen); }
          else g.add(screen);
        }
        bx(g, 1.1, 0.06, 0.9, cx - (cols - 1) * 0.575 + i * 1.15, floorY + 0.16,
          zi(SHOP_DEPTH - 0.65), S.steelDark, 0, false);
      }
      for (let i = 0; i < 3; i++) {
        const sh = P.shelfRack(2, 2, 1.8, 0.7, 1.1, S.steelDark);
        sh.position.set(cx + r.range(-w * 0.3, w * 0.3), floorY, zi(r.range(3, 7)));
        sh.rotation.y = r.range(-0.3, 0.3) + (r.chance(0.4) ? Math.PI / 2 : 0);
        P.NOCOLLIDE(sh); g.add(sh);
      }
      textPanel(g, 'HI-FI  ·  VIDEO  ·  CAR AUDIO', cx, floorY + 3.6, zi(SHOP_DEPTH - 0.22),
        dir > 0 ? 0 : Math.PI, 0.34, { color: 0xd8c8a8 });
    } else if (kind === 'clothing') {
      for (let i = 0; i < 7; i++) {
        const px = cx + r.range(-w * 0.4, w * 0.4), pz = zi(r.range(2.5, 10));
        // empty circular rack: base disc, column, hoop
        cy(g, 0.34, 0.05, px, floorY + 0.03, pz, S.steelDark, 12);
        cy(g, 0.035, 1.5, px, floorY + 0.75, pz, S.steel, 8);
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.022, 5, 18), S.steel);
        hoop.rotation.x = Math.PI / 2; hoop.position.set(px, floorY + 1.48, pz);
        hoop.castShadow = false; g.add(hoop);
      }
      for (let i = 0; i < 4; i++) {
        const px = cx + r.range(-w * 0.35, w * 0.35), pz = zi(r.range(3, 9));
        const fallen = r.chance(0.3);
        cy(g, 0.26, 0.04, px, floorY + 0.02, pz, S.dark, 10);
        const post = P.boxC(0.09, 1.05, 0.09, S.plasticDirty, { collide: false });
        post.position.set(px, floorY + (fallen ? 0.1 : 0.55), pz);
        if (fallen) post.rotation.x = Math.PI / 2 * (dir > 0 ? 1 : -1);
        g.add(post);
        if (!fallen) bx(g, 0.34, 0.5, 0.2, px, floorY + 1.34, pz, S.plasticDirty, r.range(0, 3));
      }
      bx(g, w * 0.5, 2.2, 0.06, cx, floorY + 1.3, zi(SHOP_DEPTH - 0.28), S.mirror);
      bx(g, 2.2, 1.0, 0.7, cx + w * 0.28, floorY + 0.5, zi(2.4), M.wood);
      col(2.2, 1.0, 0.7, cx + w * 0.28, floorY + 0.5, zi(2.4));
    } else if (kind === 'toys') {
      const disp = P.shelfRack(3, 3, 1.6, 0.8, 0.9, S.salmon);
      disp.position.set(cx - w * 0.15, floorY + 0.9, zi(4.5));
      disp.rotation.z = 1.35; disp.rotation.y = 0.4;
      P.NOCOLLIDE(disp); g.add(disp);
      const cube = new THREE.BoxGeometry(0.24, 0.24, 0.24);
      const spill = P.scatter(cube, S.salmon, 60, (i, d, rr) => {
        d.position.set(cx + rr.range(-w * 0.45, w * 0.45), floorY + 0.12, zi(rr.range(1.5, 9)));
        d.rotation.set(rr() * 3, rr() * 3, rr() * 3);
        d.scale.setScalar(rr.range(0.6, 1.5));
      }, 33);
      ctx.addDecor(spill);
      for (let i = 0; i < 3; i++) {
        const sh = P.shelfRack(2, 3, 1.7, 0.7, 0.85, S.teal);
        sh.position.set(cx + r.range(-w * 0.35, w * 0.35), floorY, zi(r.range(6, 10.5)));
        P.NOCOLLIDE(sh); g.add(sh);
      }
      // a lonely rocking unicorn left on the shop floor
      bx(g, 1.1, 0.5, 0.35, cx + w * 0.3, floorY + 0.7, zi(2.2), S.plastic, 0.2);
      cy(g, 0.06, 0.7, cx + w * 0.3, floorY + 0.35, zi(2.2), S.steel, 8);
    } else if (kind === 'books') {
      const tipped = P.bookshelf(2.6, 2.1, 0.34, seed);
      tipped.position.set(cx - w * 0.2, floorY + 0.1, zi(4.0));
      tipped.rotation.z = -1.42; tipped.rotation.y = 0.25;
      P.NOCOLLIDE(tipped); g.add(tipped);
      for (let i = 0; i < 4; i++) {
        const sh = P.bookshelf(2.4, 2.1, 0.34, seed + i * 7);
        sh.position.set(cx + r.range(-w * 0.4, w * 0.4), floorY, zi(r.range(6, 11)));
        sh.rotation.y = r.chance(0.5) ? Math.PI / 2 : 0;
        P.NOCOLLIDE(sh); g.add(sh);
        col(2.4, 2.0, 0.4, sh.position.x, floorY + 1.0, sh.position.z, sh.rotation.y);
      }
      const bookGeo = new THREE.BoxGeometry(0.16, 0.05, 0.22);
      ctx.addDecor(P.scatter(bookGeo, M.wood, 90, (i, d, rr) => {
        d.position.set(cx + rr.range(-w * 0.45, w * 0.45), floorY + 0.03, zi(rr.range(2, 11)));
        d.rotation.set(0, rr() * 3, rr.chance(0.2) ? 1.4 : 0);
      }, 44));
    } else if (kind === 'smashed') {
      // frame stubs where the glass used to be
      for (let i = 0; i < 5; i++) {
        bx(g, 0.08, openH, 0.1, cx - w / 2 + w * (i + 0.5) / 5, floorY + openH / 2,
          line + dir * 0.05, S.steelDark);
      }
      bx(g, w, 0.5, 0.1, cx, floorY + openH - 0.25, line + dir * 0.05, S.glass, 0, false);
      const shard = new THREE.BoxGeometry(0.2, 0.012, 0.3);
      ctx.addDecor(P.scatter(shard, S.glass, 120, (i, d, rr) => {
        d.position.set(cx + rr.range(-w * 0.55, w * 0.55), floorY + 0.008, zi(rr.range(-1.5, 6)));
        d.rotation.y = rr() * 3.14;
        d.scale.setScalar(rr.range(0.4, 1.3));
      }, 55));
      for (let i = 0; i < 5; i++) {
        const gd = P.shelfRack(2, 2, 1.8, 0.8, 1.0, S.plasticDirty);
        gd.position.set(cx + r.range(-w * 0.4, w * 0.4), floorY, zi(r.range(3, 10)));
        gd.rotation.y = r.range(-0.4, 0.4);
        if (r.chance(0.3)) gd.rotation.z = 1.4;
        P.NOCOLLIDE(gd); g.add(gd);
      }
      const rb = P.rubble(2.2, 12, M.concDark, seed);
      rb.position.set(cx + r.range(-3, 3), floorY, zi(r.range(4, 9)));
      ctx.addDecor(rb);
    } else if (kind === 'lit') {
      // the beacon: still-lit interior, warm and wrong
      for (let i = 0; i < 4; i++) {
        bx(g, w * 0.8, 0.08, 0.16, cx, floorY + openH - 0.2, zi(1.6 + i * 3), E.tube, 0, false);
      }
      bx(g, w * 0.75, 1.05, 0.75, cx, floorY + 0.52, zi(2.6), M.wood);
      col(w * 0.75, 1.05, 0.75, cx, floorY + 0.52, zi(2.6));
      bx(g, w * 0.75, 0.06, 0.85, cx, floorY + 1.08, zi(2.6), S.brass, 0, false);
      bx(g, w * 0.85, 2.4, 0.45, cx, floorY + 1.4, zi(SHOP_DEPTH - 0.6), S.mauve);
      for (let j = 0; j < 4; j++) {
        bx(g, w * 0.8, 0.05, 0.4, cx, floorY + 0.6 + j * 0.55, zi(SHOP_DEPTH - 0.75), S.brass, 0, false);
      }
      textPanel(g, name, cx, floorY + 2.6, zi(SHOP_DEPTH - 0.9), dir > 0 ? 0 : Math.PI, 0.5,
        { color: 0xfff0d4, emissive: 0xffc27a, ei: 2.2 });
      storeLights.push([cx, floorY + openH - 0.6, zi(3.5)]);
      // buzzing neon in the window
      const tube = P.boxC(w * 0.6, 0.09, 0.09, E.neonPink, { collide: false, shadow: false });
      tube.position.set(cx, floorY + openH - 0.55, line + dir * 0.35);
      LIVE.add(tube); neonBuzz.push(tube);
    }
  }

  function buildBand(band) {
    const { line, facing, floorY, openH, bulkTop, from, to, bays } = band;
    const g = G.stores;
    const dir = facing;
    const sorted = [...bays].sort((a, b) => a.x - b.x);
    let cursor = from;
    const fill = (a, b) => {
      if (b - a < 0.05) return;
      bx(g, b - a, bulkTop - floorY, 1.0, (a + b) / 2, floorY + (bulkTop - floorY) / 2,
        line - dir * 0.2, M.wallCream);
      col(b - a, bulkTop - floorY, 1.0, (a + b) / 2, floorY + (bulkTop - floorY) / 2, line - dir * 0.2);
      // mirrored pier cladding at eye level — very 1994
      bx(g, b - a - 0.1, 2.6, 0.06, (a + b) / 2, floorY + 1.9, line + dir * 0.32, S.mirror, 0, false);
      bx(g, b - a, 0.2, 0.14, (a + b) / 2, floorY + 3.3, line + dir * 0.32, S.brassDull, 0, false);
      bx(g, b - a, 0.24, 0.14, (a + b) / 2, floorY + 0.12, line + dir * 0.32, S.dark, 0, false);
    };
    for (const bay of sorted) {
      fill(cursor, bay.x - bay.w / 2);
      cursor = bay.x + bay.w / 2;
      buildStore(bay, band);
    }
    fill(cursor, to);
  }

  // --- the twenty units ------------------------------------------------------
  const BANDS = [
    { line: -13, facing: 1, floorY: 0, openH: 4.2, bulkTop: 5.6, from: 24, to: 76, bays: [
      { x: 32, w: 15, kind: 'electronics', name: 'RADIOWAVE', seed: 1 },
      { x: 48, w: 15, kind: 'shutter', name: 'HAIRPORT', seed: 2 },
      { x: 64, w: 15, kind: 'lit', name: 'CASSIOPEIA', seed: 3 } ] },
    { line: 13, facing: -1, floorY: 0, openH: 4.2, bulkTop: 5.6, from: 24, to: 76, bays: [
      { x: 32, w: 15, kind: 'clothing', name: 'DENIM VAULT', seed: 4 },
      { x: 48, w: 15, kind: 'smashed', name: 'FUTURA OPTICAL', seed: 5 },
      { x: 64, w: 15, kind: 'shutterOpen', name: 'THE SOCK DRAWER', seed: 6 } ] },
    { line: -13, facing: 1, floorY: 0, openH: 4.2, bulkTop: 5.6, from: -76, to: -24, bays: [
      { x: -32, w: 15, kind: 'books', name: 'PAGETURNER BOOKS', seed: 7 },
      { x: -48, w: 15, kind: 'lit', name: 'PRETZEL BARON', seed: 8 },
      { x: -64, w: 15, kind: 'shutter', name: 'NAIL BAR 2000', seed: 9 } ] },
    { line: 13, facing: -1, floorY: 0, openH: 4.2, bulkTop: 5.6, from: -76, to: -24, bays: [
      { x: -32, w: 15, kind: 'toys', name: 'TOY GALAXY', seed: 10 },
      { x: -48, w: 15, kind: 'smashed', name: 'CARD & PARTY', seed: 11 },
      { x: -64, w: 15, kind: 'papered', name: 'UNIT 114', seed: 12 } ] },
    { line: -13, facing: 1, floorY: Y_UPP, openH: 3.4, bulkTop: 4.4, from: 24, to: 76, bays: [
      { x: 38, w: 20, kind: 'shutter', name: 'ORBIT ATHLETIC', seed: 13 },
      { x: 62, w: 20, kind: 'smashed', name: 'GLAMOUR SHOTZ', seed: 14 } ] },
    { line: 13, facing: -1, floorY: Y_UPP, openH: 3.4, bulkTop: 4.4, from: 24, to: 76, bays: [
      { x: 38, w: 20, kind: 'lit', name: 'VIDEO VAULT', seed: 15 },
      { x: 62, w: 20, kind: 'papered', name: 'UNIT 218', seed: 16 } ] },
    { line: -13, facing: 1, floorY: Y_UPP, openH: 3.4, bulkTop: 4.4, from: -76, to: -24, bays: [
      { x: -38, w: 20, kind: 'clothing', name: 'MERIDIAN', seed: 17 },
      { x: -62, w: 20, kind: 'shutterOpen', name: 'CANDLE GROVE', seed: 18 } ] },
    { line: 13, facing: -1, floorY: Y_UPP, openH: 3.4, bulkTop: 4.4, from: -76, to: -24, bays: [
      { x: -38, w: 20, kind: 'shutter', name: 'PAPER MOON', seed: 19 },
      { x: -62, w: 20, kind: 'lit', name: 'SUNGLASS ISLE', seed: 20 } ] },
  ];
  // bulkTop is an absolute height; the upper band tops out under its ceiling
  for (const b of BANDS) { if (b.floorY === Y_UPP) { b.openH = 3.2; b.bulkTop = Y_UPP_C; } }
  for (const b of BANDS) buildBand(b);
