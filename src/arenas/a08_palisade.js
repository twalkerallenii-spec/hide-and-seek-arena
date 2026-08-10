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
    panelDark: MAT.surface('metalPanel', { color: 0x2c3037, panels: 3, repeat: 1, size: 256 }),
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
    dirtWhite: MAT.solid({ color: 0xb8b2a4, roughness: 0.9 }),
    tarp: MAT.solid({ color: 0x2f3a3a, roughness: 0.9 }),
  };

  const E = {
    warmSoft: MAT.emissive(0xffc98a, 1.1),
    tube: MAT.emissive(0xe6f2ff, 3.0),
    tubeDead: MAT.solid({ color: 0x2b2d33, roughness: 0.35 }),
    neonPink: MAT.emissive(0xff5aa0, 3.2),
    neonTeal: MAT.emissive(0x49efd6, 3.0),
    exit: MAT.emissive(0x37d268, 2.6),
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

  /**
   * Fascia / poster panel from generated text. textMaterial() is not cached by
   * the engine — every call builds a canvas, a texture and a material — so we
   * memoise on the exact arguments. Repeated signage ('CLOSED FOR GOOD', the
   * poster set, unit-to-let boards) then costs one material, not one per copy.
   */
  const textCache = new Map();
  function textPanel(g, text, x, y, z, ry, h, o = {}) {
    const key = text + '|' + (o.color ?? 0) + '|' + (o.bg ?? 'x') + '|' + (o.fontSize ?? 84)
      + '|' + (o.emissive ?? 'x') + '|' + (o.ei ?? 1.5) + '|' + (o.stroke ?? 'x');
    let t = textCache.get(key);
    if (!t) {
      t = MAT.textMaterial(text, {
        color: o.color ?? 0xf2e8d8,
        background: o.bg,
        fontSize: o.fontSize ?? 84,
        emissive: o.emissive,
        emissiveIntensity: o.ei ?? 1.5,
        stroke: o.stroke,
      });
      textCache.set(key, t);
    }
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

  function quad(material, x0, z0, x1, z1, y, uscale) {
    const U2 = uscale ?? U;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1,
    ]), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    ]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      x0 / U2, z0 / U2, x1 / U2, z0 / U2, x1 / U2, z1 / U2, x0 / U2, z1 / U2,
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
  // lower-floor stairwell guards (the head of each flight is left open)
  rail(-58, 13, -50, 13, Y_LOW); rail(-58, 2, -58, 13, Y_LOW); rail(-50, 2, -50, 13, Y_LOW);
  rail(10, 30, 10, 42, Y_LOW); rail(17, 30, 17, 42, Y_LOW); rail(10, 42, 17, 42, Y_LOW);
  // food court mezzanine lip looking down from the north wing
  rail(-18, -30, 18, -30, Y_UPP);

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

  // roof slabs: main hall (clerestory punched out, plus one failed skylight
  // over the west upper concourse that has brought the ceiling down with it)
  const SKY = [-38, -3.5, -31, 3.5];
  plate(G.shell, -76, -30, -24, SKY[1], Y_ROOF, 0.5, M.wallCream);
  plate(G.shell, -76, SKY[3], -24, 30, Y_ROOF, 0.5, M.wallCream);
  plate(G.shell, -76, SKY[1], SKY[0], SKY[3], Y_ROOF, 0.5, M.wallCream);
  plate(G.shell, SKY[2], SKY[1], -24, SKY[3], Y_ROOF, 0.5, M.wallCream);
  {
    const pane = P.boxC(SKY[2] - SKY[0], 0.05, SKY[3] - SKY[1], S.glass, { collide: false, shadow: false });
    pane.position.set((SKY[0] + SKY[2]) / 2, Y_ROOF + 0.28, (SKY[1] + SKY[3]) / 2);
    G.shell.add(pane);
    for (const gx of [SKY[0], -34.5, SKY[2]]) {
      bx(G.shell, 0.18, 0.36, SKY[3] - SKY[1], gx, Y_ROOF + 0.3, 0, S.brassDull, 0, false);
    }
    for (const gz of [SKY[1], SKY[3]]) {
      bx(G.shell, SKY[2] - SKY[0], 0.36, 0.18, (SKY[0] + SKY[2]) / 2, Y_ROOF + 0.3, gz, S.brassDull, 0, false);
    }
    // upstand kerb so the opening reads as a light well
    for (const [a, b, c, d] of [
      [SKY[0] - 0.3, SKY[1] - 0.3, SKY[2] + 0.3, SKY[1]], [SKY[0] - 0.3, SKY[3], SKY[2] + 0.3, SKY[3] + 0.3],
      [SKY[0] - 0.3, SKY[1], SKY[0], SKY[3]], [SKY[2], SKY[1], SKY[2] + 0.3, SKY[3]],
    ]) bx(G.shell, c - a, 0.9, d - b, (a + c) / 2, Y_ROOF - 0.45, (b + d) / 2, M.wallCream);
  }
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
    // dark plenum backing so missing tiles read as holes — split around the
    // collapsed bay so the failed skylight is visible from the upper concourse
    for (const [x0, z0, x1, z1, y] of plenum) {
      if (y !== Y_UPP_C || x0 !== -76) { plate(G.shell, x0, z0, x1, z1, y + 0.05, 0.12, M.concDark); continue; }
      plate(G.shell, -76, -13, -40.5, 13, y + 0.05, 0.12, M.concDark);
      plate(G.shell, -28.5, -13, -24, 13, y + 0.05, 0.12, M.concDark);
      plate(G.shell, -40.5, -13, -28.5, -5.5, y + 0.05, 0.12, M.concDark);
      plate(G.shell, -40.5, 5.5, -28.5, 13, y + 0.05, 0.12, M.concDark);
    }
    const collapsed = (x, z, y) => y === Y_UPP_C && x > -40.5 && x < -28.5 && z > -5.5 && z < 5.5;

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
          if (collapsed(x, z, y)) continue;                  // brought down by the leak
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
          if (collapsed(x, z, y)) continue;
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

  // Shelving with books blocked in rather than modelled spine by spine.
  // props.bookshelf() mints a fresh material per book (~1000 of them across
  // five racks), which three.js cannot batch — four shared colours read the
  // same at 2 m and collapse into four draw calls after freeze().
  const bookMats = [0x7a3a3a, 0x2f4a5e, 0x6b5a2e, 0x4a3a52]
    .map(c => MAT.solid({ color: c, roughness: 0.88 }));
  const BK_RUN = [0.18, 0.26, 0.34, 0.44], BK_H = [0.18, 0.22, 0.27];
  function shelving(w2, h2, d2, sd) {
    const r2 = ctx.rng.fork('shelf' + sd);
    const gg = new THREE.Group();
    const back = P.boxC(w2, h2, 0.04, M.wood, { collide: false });
    back.position.set(0, h2 / 2, -d2 / 2); gg.add(back);
    for (const sx of [-1, 1]) {
      const side = P.boxC(0.05, h2, d2, M.wood, { collide: false });
      side.position.set(sx * w2 / 2, h2 / 2, 0); gg.add(side);
    }
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h2;
      const sh = P.boxC(w2, 0.04, d2, M.wood, { collide: false });
      sh.position.set(0, y, 0); gg.add(sh);
      if (i === 4) break;
      let x2 = -w2 / 2 + 0.06;
      while (x2 < w2 / 2 - 0.24) {
        if (r2.chance(0.2)) { x2 += r2.range(0.1, 0.3); continue; }   // gaps where stock walked
        const run = r2.pick(BK_RUN), bh = r2.pick(BK_H);
        const blk = P.boxC(run, bh, d2 * 0.7, r2.pick(bookMats), { collide: false, shadow: false });
        blk.position.set(x2 + run / 2, y + bh / 2 + 0.02, 0);
        blk.rotation.z = r2.chance(0.07) ? r2.range(0.12, 0.3) : 0;
        gg.add(blk);
        x2 += run + 0.02;
      }
    }
    return gg;
  }

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
      const tipped = shelving(2.6, 2.1, 0.34, seed);
      tipped.position.set(cx - w * 0.2, floorY + 0.1, zi(4.0));
      tipped.rotation.z = -1.42; tipped.rotation.y = 0.25;
      P.NOCOLLIDE(tipped); g.add(tipped);
      for (let i = 0; i < 4; i++) {
        const sh = shelving(2.4, 2.1, 0.34, seed + i * 7);
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

  // ===========================================================================
  // 11. THE ATRIUM — landmark #1
  // ===========================================================================
  const A = G.atrium;

  // --- mirrored columns at the corners of the void --------------------------
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * 20, pz = sz * 18;
    bx(A, 1.5, Y_ROOF, 1.5, px, Y_ROOF / 2, pz, S.mirror);
    col(1.6, Y_ROOF, 1.6, px, Y_ROOF / 2, pz);
    for (const y of [0.35, Y_UPP - 0.4, Y_UPP + 0.4, Y_ROOF - 0.5]) {
      bx(A, 1.75, 0.22, 1.75, px, y, pz, S.brassDull, 0, false);
    }
    bx(A, 1.7, 0.12, 1.7, px, 0.06, pz, S.dark, 0, false);
  }

  // --- dry two-tier fountain -------------------------------------------------
  {
    const R0 = 5.4, WALLT = 0.45;
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + Math.PI / seg;
      const px = Math.cos(a) * R0, pz = Math.sin(a) * R0;
      const segLen = 2 * R0 * Math.tan(Math.PI / seg) + 0.1;
      bx(A, segLen, 0.62, WALLT, px, 0.31, pz, M.marble, -a + Math.PI / 2);
      col(segLen, 0.62, WALLT, px, 0.31, pz, -a + Math.PI / 2);
      bx(A, segLen + 0.16, 0.08, WALLT + 0.18, px, 0.66, pz, S.brassDull, -a + Math.PI / 2, false);
    }
    quad(M.tNavy, -R0, -R0, R0, R0, 0.06);       // stained basin floor
    cy(A, 2.3, 0.62, 0, 0.31, 0, M.marble, 16);
    col(4.6, 0.62, 4.6, 0, 0.31, 0);
    cy(A, 2.9, 0.22, 0, 0.73, 0, M.marble, 20);
    cy(A, 0.85, 1.5, 0, 1.59, 0, M.marble, 14);
    cy(A, 1.9, 0.18, 0, 2.43, 0, M.marble, 18);
    cy(A, 0.22, 0.9, 0, 2.97, 0, S.brassDull, 10);
    const finial = P.sphere(0.34, S.brass, { collide: false, seg: 14 });
    finial.position.set(0, 3.4, 0); A.add(finial);
    col(1.8, 3.4, 1.8, 0, 1.7, 0);

    // coins and leaves in the dead pool
    const coinGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.006, 8);
    ctx.addDecor(P.scatter(coinGeo, S.brass, 260, (i, d, rr) => {
      const a = rr() * 6.283, rad = 2.5 + Math.sqrt(rr()) * 2.6;
      d.position.set(Math.cos(a) * rad, 0.065, Math.sin(a) * rad);
      d.rotation.set(rr.chance(0.15) ? 1.4 : 0, rr() * 3, 0);
    }, 21));
    const leafGeo = new THREE.PlaneGeometry(0.2, 0.11);
    leafGeo.rotateX(-Math.PI / 2);
    ctx.addDecor(P.scatter(leafGeo, S.leaf, 420, (i, d, rr) => {
      const a = rr() * 6.283, rad = Math.sqrt(rr()) * 9.5;
      d.position.set(Math.cos(a) * rad, rad < 5.0 ? 0.07 : 0.012, Math.sin(a) * rad);
      d.rotation.y = rr() * 3.14;
      d.scale.setScalar(rr.range(0.7, 1.5));
    }, 22));
    ctx.hidingSpot(0, 0, 6.6, 2.0, 0.8);
    ctx.hidingSpot(-4.4, 0, -4.4, 1.8, 0.7);
  }

  // --- dead ficus planters ---------------------------------------------------
  function deadFicus(g, x, z, y, seed) {
    const r = ctx.rng.fork('ficus' + seed);
    cy(g, 1.15, 0.72, x, 0.36 + y, z, M.marble, 12);
    col(2.3, 0.72, 2.3, x, y + 0.36, z);
    cy(g, 1.2, 0.1, x, y + 0.75, z, S.brassDull, 12);
    cy(g, 1.02, 0.12, x, y + 0.66, z, S.soil, 12);
    const h = r.range(2.4, 3.6);
    cy(g, 0.09, h, x, y + 0.72 + h / 2, z, S.trunk, 7);
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.283, rad = r.range(0.3, 0.9);
      const b = P.sphere(r.range(0.32, 0.62), S.leaf, { collide: false, seg: 8 });
      b.position.set(x + Math.cos(a) * rad, y + 0.72 + h * r.range(0.45, 0.95), z + Math.sin(a) * rad);
      b.scale.y = 0.7;
      g.add(b);
    }
    // shed leaves at the base
    const lg = new THREE.PlaneGeometry(0.18, 0.1); lg.rotateX(-Math.PI / 2);
    const s = P.scatter(lg, S.leaf, 40, (i, d, rr) => {
      const a = rr() * 6.283, rad = 1.1 + rr() * 1.5;
      d.position.set(x + Math.cos(a) * rad, y + 0.012, z + Math.sin(a) * rad);
      d.rotation.y = rr() * 3.14;
    }, seed + 300);
    ctx.addDecor(s);
  }
  const PLANTERS = [
    [-10, 12, 0], [10, 12, 0], [-10, -12, 0], [10, -12, 0],
    [-20, 0, 0], [20, -18, 0],
    [-20, -18, Y_UPP], [20, 18, Y_UPP], [-20, 18, Y_UPP],
  ];
  PLANTERS.forEach((p, i) => deadFicus(A, p[0], p[1], p[2], i + 1));

  // --- escalators (a scissor pair) + the fixed west stair ---------------------
  function escalator(g, x, zA, zB, yA, yB, width = 1.6) {
    const steps = 22;
    const dz = (zB - zA) / steps, dy = (yB - yA) / steps;
    for (let i = 0; i < steps; i++) {
      const cz = zA + dz * (i + 0.5);
      const top = yA + dy * (i + 1);
      bx(g, width, 0.26, Math.abs(dz) + 0.02, x, top - 0.13, cz, S.steelDark, 0, false);
      bx(g, width - 0.16, 0.04, Math.abs(dz) * 0.55, x, top + 0.01, cz, S.steel, 0, false);
    }
    // truss + soffit
    inclined(g, x, zA, yA - 0.85, x, zB, yB - 0.85, width + 0.9, 1.1, M.panelDark);
    // balustrades: glass with a black rubber handrail
    for (const sx of [-1, 1]) {
      inclined(g, x, zA, yA + 0.52, x, zB, yB + 0.52, 0.06, 1.05, S.glass, sx * (width / 2 + 0.09));
      inclined(g, x, zA, yA + 1.09, x, zB, yB + 1.09, 0.16, 0.11, S.dark, sx * (width / 2 + 0.09));
      inclined(g, x, zA, yA - 0.06, x, zB, yB - 0.06, 0.1, 0.24, S.brassDull, sx * (width / 2 + 0.09));
    }
    // comb plates at both ends
    for (const [cz, cy2] of [[zA, yA], [zB, yB]]) {
      bx(g, width + 0.5, 0.1, 1.0, x, cy2 + 0.02, cz + Math.sign(zA - zB) * 0.5, S.brass, 0, false);
    }
    ramp(x, zA + Math.sign(zB - zA) * 0.2, yA, x, zB, yB, width + 0.2);
    ctx.hidingSpot(x, Math.min(yA, yB), (zA + zB) / 2, 1.6, 0.85);
  }
  escalator(A, -5, 8, -3, 0, Y_UPP);      // ascending north
  escalator(A, 5, -8, 3, 0, Y_UPP);       // ascending south

  {   // fixed stair in the west balcony stairwell: z 14 (bottom) -> z 2 (top)
    const x0 = -20, wS = 2.6, steps = 26;
    const zA = 14, zB = 2;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const cz = zA + (zB - zA) * (t0 + t1) / 2;
      const top = Y_UPP * t1;
      bx(A, wS, top, Math.abs(zB - zA) / steps + 0.01, x0, top / 2, cz, M.marble, 0, false);
    }
    ramp(x0, zA, 0, x0, zB, Y_UPP, wS);
    for (const sx of [-1, 1]) {
      const off = sx * (wS / 2 + 0.05);
      inclined(A, x0, zA, 0.6, x0, zB, Y_UPP + 0.6, 0.08, 0.9, S.glass, off);
      inclined(A, x0, zA, 1.1, x0, zB, Y_UPP + 1.1, 0.09, 0.09, S.brass, off);
      col(0.16, 1.15, 13.5, x0 + off, 3.68, 8, Math.PI, -0.476);
    }
    ctx.hidingSpot(x0, 0, 12.5, 1.8, 0.85);
  }

  // --- defunct glass lift ----------------------------------------------------
  {
    const cxs = 20, czs = 0, hw = 3.0, hd = 3.0, top = 13.2;
    for (const [ox, oz, w2, d2] of [
      [0, -hd, hw * 2, 0.18], [hw, 0, 0.18, hd * 2],
    ]) {
      bx(A, w2, top, d2, cxs + ox, top / 2, czs + oz, S.glass);
      col(w2, top, Math.max(d2, 0.2), cxs + ox, top / 2, czs + oz);
    }
    // south face: glazed except for a maintenance hatch at the upper level, so
    // the service ladder inside the shaft is a real route up to the balcony
    for (const [gx0, gx1, gy0, gy1] of [
      [17, 20.6, 0, top], [22.6, 23, 0, top],
      [20.6, 22.6, 0, Y_UPP], [20.6, 22.6, Y_UPP + 2.2, top],
    ]) {
      bx(A, gx1 - gx0, gy1 - gy0, 0.18, (gx0 + gx1) / 2, (gy0 + gy1) / 2, czs + hd, S.glass);
      col(gx1 - gx0, gy1 - gy0, 0.22, (gx0 + gx1) / 2, (gy0 + gy1) / 2, czs + hd);
    }
    bx(A, 2.2, 0.14, 0.3, 21.6, Y_UPP + 2.28, czs + hd, S.brassDull, 0, false);
    // atrium face: glazed above a doorway you can step through on the lower floor
    bx(A, 0.18, top - 2.3, hd * 2, cxs - hw, 2.3 + (top - 2.3) / 2, czs, S.glass);
    col(0.25, top - 2.3, hd * 2, cxs - hw, 2.3 + (top - 2.3) / 2, czs);
    for (const sz of [-1, 1]) {
      bx(A, 0.2, 2.3, 2.1, cxs - hw, 1.15, czs + sz * 1.95, S.glass);
      col(0.25, 2.3, 2.1, cxs - hw, 1.15, czs + sz * 1.95);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      bx(A, 0.22, top, 0.22, cxs + sx * hw, top / 2, czs + sz * hd, S.brassDull);
    }
    for (let y = 1.2; y < top; y += 2.6) {
      bx(A, hw * 2, 0.12, hd * 2 + 0.05, cxs, y, czs, S.brassDull, 0, false);
    }
    // the car, dead on the ground floor
    quad(M.tNavy, cxs - hw + 0.2, czs - hd + 0.2, cxs + hw - 0.2, czs + hd - 0.2, 0.02);
    // the car roof is long gone — only the ceiling fitting and its rails remain
    bx(A, 4.6, 0.06, 0.14, cxs, 2.28, czs - 1.4, M.panelDark, 0, false);
    bx(A, 4.6, 0.06, 0.14, cxs, 2.28, czs + 1.4, M.panelDark, 0, false);
    bx(A, 1.4, 0.06, 0.2, cxs, 2.2, czs, E.tubeDead, 0, false);
    bx(A, 0.35, 1.1, 0.08, cxs + hw - 0.5, 1.3, czs - hd + 0.4, S.brassDull, 0, false);
    // service ladder, floor to headhouse — kept out of the frozen bucket so the
    // engine still sees userData.climbable and turns it into a real climb zone
    const lad = P.ladder(top - 0.4, S.steelDark);
    lad.position.set(cxs + hw - 0.45, 0.05, czs);
    lad.rotation.y = Math.PI / 2;
    P.NOCOLLIDE(lad); LIVE.add(lad);
    slab(cxs - hw, czs - hd, cxs + hw, czs + hd, 0.02, 0.4);
    ctx.hidingSpot(cxs, 0, czs, 2.2, 1.0);
  }

  // --- directory board + 'YOU ARE HERE' --------------------------------------
  {
    const dx = -6, dz = 24;
    bx(A, 3.4, 2.5, 0.3, dx, 1.6, dz, M.panelDark);
    col(3.4, 2.5, 0.4, dx, 1.6, dz);
    bx(A, 3.7, 0.16, 0.42, dx, 2.94, dz, S.brassDull, 0, false);
    for (const sx of [-1, 1]) cy(A, 0.09, 0.4, dx + sx * 1.6, 0.2, dz, S.brassDull, 8);
    textPanel(A, 'PALISADE MALL', dx, 2.62, dz + 0.18, Math.PI, 0.34,
      { color: 0xffe6bd, emissive: 0xffb15c, ei: 1.8 });
    textPanel(A,
      'LEVEL 1   RADIOWAVE · DENIM VAULT · PAGETURNER\n' +
      'LEVEL 1   TOY GALAXY · CASSIOPEIA · PRETZEL BARON\n' +
      'LEVEL 2   VIDEO VAULT · MERIDIAN · SUNGLASS ISLE\n' +
      'NORTH     FOOD COURT & CAR PARK\n' +
      'SOUTH     THE PROMENADE\n' +
      '\n              ★ YOU ARE HERE',
      dx, 1.5, dz + 0.18, Math.PI, 1.9, { color: 0xcdc0a2, fontSize: 40 });
  }

  // --- moonlight shafts, dust, and the drifting bag --------------------------
  {
    const beamMat = MAT.emissive(0xbcd6ff, 0.55, { transparent: true, opacity: 0.045 });
    beamMat.depthWrite = false;
    beamMat.side = THREE.DoubleSide;
    for (const [bx0, bz0] of [[-7, -5], [6, 4], [-2, 11]]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 6.0, Y_CLER, 10, 1, true), beamMat);
      beam.position.set(bx0, Y_CLER / 2, bz0);
      beam.rotation.z = 0.16; beam.rotation.x = -0.1;
      beam.userData.collide = false; beam.castShadow = false; beam.renderOrder = 3;
      A.add(beam);
    }
    // slow-turning dust in the shafts
    const dustGroup = new THREE.Group();
    const mote = new THREE.SphereGeometry(0.028, 4, 3);
    dustGroup.add(P.scatter(mote, MAT.emissive(0xd8e6ff, 0.9), 500, (i, d, rr) => {
      const a = rr() * 6.283, rad = Math.sqrt(rr()) * 13;
      d.position.set(Math.cos(a) * rad, rr.range(0.4, 13), Math.sin(a) * rad);
    }, 77));
    dustGroup.children[0].castShadow = false;
    LIVE.add(dustGroup);
    ticks.push((dt, t) => {
      dustGroup.rotation.y = t * 0.014;
      dustGroup.position.y = Math.sin(t * 0.11) * 0.35;
    });

    // a carrier bag creeping across the tile
    const bag = new THREE.Group();
    const bagMat = MAT.solid({ color: 0xcfd4d8, roughness: 0.6, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const p = P.boxC(0.42, 0.34, 0.02, bagMat, { collide: false, shadow: false });
      p.rotation.set(ctx.rng.range(-1, 1), ctx.rng.range(-1, 1), ctx.rng.range(-1, 1));
      p.position.set(ctx.rng.range(-0.1, 0.1), 0.17, ctx.rng.range(-0.1, 0.1));
      bag.add(p);
    }
    LIVE.add(bag);
    ticks.push((dt, t) => {
      const u = (t * 0.055) % 1;
      bag.position.set(-19 + u * 38, 0.06 + Math.abs(Math.sin(u * 11)) * 0.35, 14 - u * 26 + Math.sin(u * 7) * 3);
      bag.rotation.y = u * 9;
      bag.rotation.z = Math.sin(t * 2.2) * 0.4;
    });
  }

  // ===========================================================================
  // 12. FOOD COURT — landmark #2
  // ===========================================================================
  const FC = G.food;
  const menuBoards = [];
  tileRect(-46, -34, -18, -30, Y_LOW, 3, patFood);
  tileRect(18, -34, 46, -30, Y_LOW, 3, patFood);

  // --- window wall onto the car park ----------------------------------------
  {
    const zg = -62;
    bx(FC, 92, 4.0, 0.5, 0, 8.0, zg, M.wallCream);           // spandrel
    col(92, 4.0, 0.5, 0, 8.0, zg);
    bx(FC, 92, 6.0, 0.1, 0, 3.0, zg, S.glassDark);
    col(92, 6.0, 0.35, 0, 3.0, zg);
    bx(FC, 92, 0.3, 0.6, 0, 6.1, zg, S.brassDull, 0, false);
    bx(FC, 92, 0.35, 0.7, 0, 0.18, zg, S.dark, 0, false);
    for (let x = -45; x <= 45; x += 3) {
      bx(FC, 0.16, 6.0, 0.3, x, 3.0, zg, S.brassDull, 0, false);
    }
    bx(FC, 92, 0.12, 0.3, 0, 2.6, zg, S.brassDull, 0, false);
    // dead vertical blinds hanging in front of a couple of bays
    for (const bxx of [-33, -30, 21, 24, 27]) {
      for (let i = 0; i < 12; i++) {
        bx(FC, 0.2, 3.4, 0.02, bxx + i * 0.22 - 1.3, 4.2, zg + 0.45, S.plasticDirty,
          rFood.range(-0.5, 0.5), false);
      }
    }
  }

  // --- six counter units, two still lit --------------------------------------
  const COUNTERS = [
    { x: -43, z: -55, ry: Math.PI / 2, name: 'WOK EXPRESS', lit: false },
    { x: -43, z: -46, ry: Math.PI / 2, name: 'SBARRO STYLE', lit: true },
    { x: -43, z: -37, ry: Math.PI / 2, name: 'ORANGE JULEP', lit: false },
    { x: 43, z: -55, ry: -Math.PI / 2, name: 'BURGER RANCH', lit: true },
    { x: 43, z: -46, ry: -Math.PI / 2, name: 'THE GYRO HUT', lit: false },
    { x: 43, z: -37, ry: -Math.PI / 2, name: 'CINNA-SWIRL', lit: false },
  ];
  for (const c of COUNTERS) {
    const s = Math.sign(c.x);            // -1 = west bank, faces +X
    const fx = c.x - s * 1.4;            // counter front plane
    // back wall + overhead bulkhead
    bx(FC, 1.6, 5.6, 8.2, c.x + s * 0.4, 2.8, c.z, M.wallTeal);
    col(1.6, 5.6, 8.2, c.x + s * 0.4, 2.8, c.z);
    bx(FC, 2.6, 1.4, 8.6, c.x - s * 0.6, 4.9, c.z, M.wallCream);
    col(2.6, 1.4, 8.6, c.x - s * 0.6, 4.9, c.z);
    // servery counter
    bx(FC, 1.5, 1.05, 7.4, fx, 0.52, c.z, M.marble);
    col(1.5, 1.05, 7.4, fx, 0.52, c.z);
    bx(FC, 1.9, 0.08, 7.6, fx, 1.09, c.z, S.brassDull, 0, false);
    bx(FC, 0.06, 0.5, 7.4, fx - s * 0.85, 1.6, c.z, S.glass, 0, false);
    for (const dz of [-2.4, 0, 2.4]) {
      bx(FC, 0.12, 0.55, 0.12, fx - s * 0.85, 1.35, c.z + dz, S.steel, 0, false);
    }
    // menu board
    const boardMat = c.lit
      ? MAT.emissive(0xffd6a0, 1.9).clone()
      : MAT.solid({ color: 0x2a2a30, roughness: 0.4 });
    const board = P.boxC(0.1, 1.5, 6.6, boardMat, { collide: false, shadow: false });
    board.position.set(c.x - s * 0.42, 3.6, c.z);
    if (c.lit) { menuBoards.push(board); LIVE.add(board); } else FC.add(board);
    for (const dz of [-2.2, 0, 2.2]) {
      bx(FC, 0.14, 1.6, 0.12, c.x - s * 0.45, 3.6, c.z + dz, S.dark, 0, false);
    }
    textPanel(FC, c.name, c.x - s * 1.9, 5.0, c.z, c.ry, 0.7, {
      color: c.lit ? 0xfff2d8 : 0xa89c8a,
      bg: rFood.pick([0x8a3140, 0x2c5a52, 0x7a4a24]),
      emissive: c.lit ? 0xffb15c : undefined, ei: 1.9,
    });
    // back-of-counter clutter
    for (let i = 0; i < 3; i++) {
      bx(FC, 0.7, 0.7, 0.7, c.x + s * 0.1, 0.35, c.z + rFood.range(-3, 3), S.steel,
        rFood.range(0, 1), true);
    }
    ctx.hidingSpot(c.x - s * 0.5, 0, c.z, 1.5, 0.9);
  }

  // dead soda fountain + tray return, marooned in the middle of the hall
  {
    bx(FC, 3.2, 1.1, 1.0, -6, 0.55, -36.5, S.steel);
    col(3.2, 1.1, 1.0, -6, 0.55, -36.5);
    bx(FC, 3.2, 1.3, 0.45, -6, 1.75, -36.9, M.panelDark);
    for (let i = 0; i < 6; i++) {
      bx(FC, 0.1, 0.3, 0.16, -7.4 + i * 0.56, 1.35, -36.2, S.dark, 0, false);
    }
    textPanel(FC, 'SELF SERVE', -6, 2.3, -36.65, 0, 0.24, { color: 0x9c9080 });
    bx(FC, 2.0, 1.0, 0.9, 8, 0.5, -36.5, S.plasticDirty);
    col(2.0, 1.0, 0.9, 8, 0.5, -36.5);
    textPanel(FC, 'TRAY RETURN', 8, 1.3, -36.02, 0, 0.2, { color: 0x2a2530, bg: 0xb8926a });
    for (let i = 0; i < 7; i++) {
      bx(FC, 0.55, 0.03, 0.42, 8 + rFood.range(-0.2, 0.2), 1.02 + i * 0.045, -36.5,
        S.salmon, rFood.range(-0.2, 0.2), false);
    }
  }

  // --- bolted tables + stacked chairs (instanced) ----------------------------
  {
    const tGeos = [];
    const topG = new THREE.CylinderGeometry(0.62, 0.62, 0.06, 14); topG.translate(0, 0.74, 0);
    const colG = new THREE.CylinderGeometry(0.07, 0.07, 0.72, 8); colG.translate(0, 0.36, 0);
    const baseG = new THREE.CylinderGeometry(0.34, 0.38, 0.05, 12); baseG.translate(0, 0.025, 0);
    tGeos.push(topG, colG, baseG);
    const tableGeo = P.mergeGeometries(tGeos);
    const spots = [];
    for (let x = -30; x <= 30; x += 6.5) {
      for (let z = -58; z <= -40; z += 6.0) {
        if (x > -36 && x < -18 && z > -57 && z < -41) continue;   // play area
        spots.push([x + rFood.range(-0.7, 0.7), z + rFood.range(-0.7, 0.7)]);
      }
    }
    ctx.addDecor(P.scatter(tableGeo, S.plasticDirty, spots.length, (i, d) => {
      d.position.set(spots[i][0], 0, spots[i][1]);
      d.rotation.y = rFood.range(0, 3.1);
    }, 66));
    for (const sp of spots) col(1.3, 0.8, 1.3, sp[0], 0.4, sp[1]);

    // stacks of six chairs, tipped and shoved to the edges
    const cg = [];
    for (let i = 0; i < 6; i++) {
      const seat = new THREE.BoxGeometry(0.44, 0.05, 0.44);
      seat.translate(0.02 * i, 0.42 + i * 0.11, 0.01 * i);
      const back = new THREE.BoxGeometry(0.44, 0.46, 0.05);
      back.translate(0.02 * i, 0.66 + i * 0.11, -0.2 + 0.01 * i);
      const l1 = new THREE.BoxGeometry(0.04, 0.42, 0.04); l1.translate(-0.18, 0.21 + i * 0.11, -0.18);
      const l2 = new THREE.BoxGeometry(0.04, 0.42, 0.04); l2.translate(0.18, 0.21 + i * 0.11, 0.18);
      cg.push(seat, back, l1, l2);
    }
    const stackGeo = P.mergeGeometries(cg);
    const stacks = [];
    for (let i = 0; i < 44; i++) {
      const edge = rFood.int(0, 3);
      let x, z;
      if (edge === 0) { x = rFood.range(-40, 40); z = rFood.range(-61, -59); }
      else if (edge === 1) { x = rFood.range(-40, -20); z = rFood.range(-38, -33); }
      else if (edge === 2) { x = rFood.range(12, 38); z = rFood.range(-38, -33); }
      else { x = rFood.range(-14, 14); z = rFood.range(-52, -42); }
      stacks.push([x, z]);
    }
    ctx.addDecor(P.scatter(stackGeo, S.teal, stacks.length, (i, d) => {
      d.position.set(stacks[i][0], 0, stacks[i][1]);
      d.rotation.y = rFood.range(0, 6.28);
    }, 67));
    for (const s2 of stacks) col(0.6, 1.3, 0.6, s2[0], 0.65, s2[1]);
    ctx.hidingSpot(stacks[3][0], 0, stacks[3][1], 2.2, 0.9);
    ctx.hidingSpot(stacks[19][0], 0, stacks[19][1], 2.2, 0.9);
  }

  // --- children's soft play ---------------------------------------------------
  {
    const px = -27, pz = -49;
    quad(M.tSalmon, px - 8, pz - 7, px + 8, pz + 7, 0.02);
    for (const [x1, z1, x2, z2] of [
      [px - 8, pz - 7, px + 8, pz - 6.7], [px - 8, pz + 6.7, px + 8, pz + 7],
      [px - 8, pz - 7, px - 7.7, pz + 7], [px + 7.7, pz - 7, px + 8, pz + 7],
    ]) {
      const len = Math.max(x2 - x1, z2 - z1);
      const vert = (z2 - z1) > (x2 - x1);
      bx(FC, vert ? 0.3 : len, 0.55, vert ? len : 0.3, (x1 + x2) / 2, 0.28, (z1 + z2) / 2, S.teal);
      col(vert ? 0.3 : len, 0.55, vert ? len : 0.3, (x1 + x2) / 2, 0.28, (z1 + z2) / 2);
    }
    const shapes = [
      [0, 0, 'block'], [-4, -3, 'cyl'], [3.5, -3.5, 'block'], [-3, 3.5, 'wedge'],
      [4.5, 3, 'cyl'], [0, -4.5, 'wedge'], [-5.5, 1.5, 'block'], [5.5, 0.5, 'block'],
    ];
    const cols = [S.salmon, S.teal, S.mauve, S.cream];
    shapes.forEach((sh, i) => {
      const m = cols[i % cols.length];
      if (sh[2] === 'cyl') cy(FC, 0.9, 0.9, px + sh[0], 0.45, pz + sh[1], m, 12);
      else if (sh[2] === 'wedge') {
        const b = bx(FC, 1.8, 1.2, 1.8, px + sh[0], 0.6, pz + sh[1], m, 0.7);
        b.rotation.z = 0.5;
      } else bx(FC, 1.6, 0.8, 1.6, px + sh[0], 0.4, pz + sh[1], m, rFood.range(0, 1));
      col(1.8, 1.0, 1.8, px + sh[0], 0.5, pz + sh[1]);
    });
    textPanel(FC, "PALISADE PLAY ZONE\nUNDER 8s ONLY", px, 2.4, pz - 7.2, 0, 0.8,
      { color: 0xfff0d8, bg: 0xb84a6a });
    ctx.hidingSpot(px + 3, 0, pz + 5, 2.4, 1.0);
    ctx.hidingSpot(px - 5, 0, pz - 4.5, 2.0, 0.95);
    // a lone ball pit, drained
    cy(FC, 2.2, 0.7, px + 6, 0.35, pz + 5, S.mauve, 14);
    col(4.4, 0.7, 4.4, px + 6, 0.35, pz + 5);
    const ball = new THREE.SphereGeometry(0.12, 7, 5);
    ctx.addDecor(P.scatter(ball, S.salmon, 90, (i, d, rr) => {
      const a = rr() * 6.283, rad = Math.sqrt(rr()) * 1.9;
      d.position.set(px + 6 + Math.cos(a) * rad, 0.12, pz + 5 + Math.sin(a) * rad);
    }, 68));
  }

  // slow ceiling fan over the seating
  {
    const fan = new THREE.Group();
    cy(fan, 0.06, 0.7, 0, -0.35, 0, S.steelDark, 8);
    cy(fan, 0.28, 0.24, 0, -0.82, 0, S.plasticDirty, 12);
    for (let i = 0; i < 4; i++) {
      const b = P.boxC(2.4, 0.03, 0.34, M.wood, { collide: false, shadow: false });
      b.position.set(Math.cos(i * 1.5708) * 1.3, -0.9, Math.sin(i * 1.5708) * 1.3);
      b.rotation.y = i * 1.5708; b.rotation.z = 0.12;
      fan.add(b);
    }
    fan.position.set(4, 9.9, -48);
    LIVE.add(fan);
    ticks.push((dt, t) => { fan.rotation.y = t * 0.42; });
  }

  // ===========================================================================
  // 13. CAR PARK EDGE — seen, never reached
  // ===========================================================================
  {
    const X = G.ext;
    quad(M.asphalt, -62, -90, 62, -62.4, -0.12);
    bx(X, 124, 0.3, 0.5, 0, -0.03, -62.4, S.dirtWhite, 0, false);   // kerb
    // painted bays
    const lineGeo = new THREE.PlaneGeometry(0.14, 4.8); lineGeo.rotateX(-Math.PI / 2);
    const lines = [];
    for (let x = -54; x <= 54; x += 2.7) for (const z of [-70, -80]) lines.push([x, z]);
    const li = P.scatter(lineGeo, S.dirtWhite, lines.length, (i, d) => {
      d.position.set(lines[i][0], -0.11, lines[i][1]);
    }, 88);
    li.castShadow = false; li.receiveShadow = false;
    ctx.addDecor(li);
    // three dead cars and a lamp
    const carSpecs = [[-22, -71, 0.4, 0x5a3a3a], [9, -69, 2.9, 0x2f3f52], [31, -80, 1.2, 0x4a4a3c]];
    carSpecs.forEach((c, i) => {
      const v = P.car(c[3], i + 3);
      v.position.set(c[0], -0.12, c[1]); v.rotation.y = c[2];
      P.NOCOLLIDE(v); X.add(v);
    });
    const lamp = P.streetLight(9, { color: 0xffa244, intensity: 4 });
    lamp.position.set(-8, -0.12, -75); lamp.rotation.y = 1.9;
    P.NOCOLLIDE(lamp); X.add(lamp);
    const lamp2 = P.streetLight(9, { color: 0xffa244, intensity: 0.05 });
    lamp2.position.set(38, -0.12, -78); lamp2.rotation.y = -1.2;
    P.NOCOLLIDE(lamp2); X.add(lamp2);
    // perimeter fence + a black treeline so the void has an edge
    const f = P.fence(120, 2.2, 'chain', S.steelDark);
    f.position.set(0, -0.12, -89); P.NOCOLLIDE(f); X.add(f);
    for (let i = 0; i < 14; i++) {
      const t = P.tree(rTrash.range(7, 11), 'broad', i + 40);
      t.position.set(rTrash.range(-60, 60), -0.4, -92 - rTrash.range(0, 6));
      P.NOCOLLIDE(t); X.add(t);
    }
    // trolley bay + a stray trolley
    bx(X, 6, 2.4, 3, 44, 1.1, -70, S.steelDark, 0, false);
    textPanel(X, 'TROLLEY BAY', 44, 2.6, -68.4, 0, 0.34, { color: 0xd8d2c0, bg: 0x2b4a6a });
  }

  // ===========================================================================
  // 14. THE PROMENADE — payphones, photo booth, arcade, the kiddie ride
  // ===========================================================================
  const PR = G.prom;
  const kiddieRide = new THREE.Group();
  const flickerTubes = [];

  // --- payphone bank ---------------------------------------------------------
  {
    const wx = -17.4;
    bx(PR, 0.5, 2.6, 6.2, wx, 1.3, 40, M.wallTeal);
    col(0.5, 2.6, 6.2, wx, 1.3, 40);
    for (let i = 0; i < 4; i++) {
      const z = 37.4 + i * 1.5;
      bx(PR, 0.7, 1.5, 1.1, wx + 0.6, 2.0, z, S.plasticDirty);       // acoustic hood
      bx(PR, 0.22, 0.62, 0.34, wx + 0.42, 1.35, z, S.steelDark);     // phone body
      bx(PR, 0.1, 0.24, 0.09, wx + 0.58, 1.45, z + 0.2, S.dark, 0, false);
      cy(PR, 0.012, 0.5, wx + 0.55, 1.05, z + 0.16, S.dark, 5);      // dangling cord
      bx(PR, 0.6, 0.35, 0.5, wx + 0.6, 1.05, z, S.dark, 0, false);   // shelf
      col(0.9, 2.2, 1.2, wx + 0.6, 1.1, z);
    }
    textPanel(PR, 'TELEPHONES', wx + 0.72, 3.0, 40, Math.PI / 2, 0.34,
      { color: 0xfff0d0, bg: 0x1e4a8a });
    ctx.hidingSpot(wx + 1.6, 0, 40, 1.6, 0.75);
  }

  // --- photo booth -----------------------------------------------------------
  {
    const bxp = -13, bzp = 50;
    bx(PR, 1.7, 2.4, 2.2, bxp, 1.2, bzp, M.panelDark);
    col(1.7, 2.4, 2.2, bxp, 1.2, bzp);
    bx(PR, 1.9, 0.5, 2.4, bxp, 2.6, bzp, S.salmon, 0, false);
    textPanel(PR, 'PHOTO·4·U', bxp, 2.62, bzp + 1.24, 0, 0.34,
      { color: 0xfff4de, emissive: 0xff5aa0, ei: 2.4 });
    // curtain
    for (let i = 0; i < 8; i++) {
      bx(PR, 0.16, 1.9, 0.03, bxp - 0.7 + i * 0.2, 1.05, bzp + 1.12, S.mauve,
        rTrash.range(-0.3, 0.3), false);
    }
    bx(PR, 0.42, 0.3, 0.06, bxp + 0.55, 0.9, bzp + 1.14, S.steelDark, 0, false);
    ctx.hidingSpot(bxp, 0, bzp, 1.4, 1.0);
  }

  // --- massage chair + mall map pylon ----------------------------------------
  {
    bx(PR, 0.9, 0.45, 1.5, 14, 0.4, 47, S.salmon);
    bx(PR, 0.9, 1.1, 0.35, 14, 1.0, 46.4, S.salmon, -0.18);
    bx(PR, 0.85, 0.3, 0.5, 14, 0.32, 48.0, S.salmon, 0.4);
    bx(PR, 1.05, 0.2, 1.7, 14, 0.1, 47, S.dark, 0, false);
    col(1.1, 1.6, 1.9, 14, 0.8, 47);
    textPanel(PR, '$1 · 3 MINUTES', 14, 1.7, 46.2, 0, 0.18, { color: 0xffe0c0, bg: 0x2a2530 });

    const mx = 6, mz = 33;
    cy(PR, 0.16, 2.2, mx, 1.1, mz, S.brassDull, 8);
    bx(PR, 2.4, 1.6, 0.16, mx, 1.9, mz, M.panelDark, 0.4);
    col(2.4, 2.4, 0.6, mx, 1.2, mz, 0.4);
    textPanel(PR, 'MALL MAP\n★ YOU ARE HERE', mx, 1.95, mz - 0.12, 0.4 + Math.PI, 0.55,
      { color: 0xd8ccae, fontSize: 56 });
  }

  // --- two arcade cabinets ---------------------------------------------------
  {
    const cabs = [[-8, 57, 0.25, true], [-5.4, 57.3, -0.1, false]];
    for (const [ax, az, ar, alive] of cabs) {
      bx(PR, 0.85, 1.9, 0.8, ax, 0.95, az, S.black, ar);
      col(0.9, 1.9, 0.9, ax, 0.95, az, ar);
      bx(PR, 0.8, 0.42, 0.1, ax + Math.sin(ar) * 0.36, 1.72, az + Math.cos(ar) * 0.36,
        alive ? E.neonTeal : S.dark, ar, false);
      bx(PR, 0.68, 0.52, 0.05, ax + Math.sin(ar) * 0.33, 1.24, az + Math.cos(ar) * 0.33,
        E.crtDead, ar, false);
      bx(PR, 0.78, 0.1, 0.34, ax + Math.sin(ar) * 0.3, 0.94, az + Math.cos(ar) * 0.3,
        S.salmon, ar, false);
      for (let i = 0; i < 3; i++) {
        cy(PR, 0.03, 0.05, ax + Math.sin(ar) * 0.28 - 0.2 + i * 0.2, 1.0,
          az + Math.cos(ar) * 0.28, S.salmon, 6);
      }
    }
    textPanel(PR, 'OUT OF ORDER', -5.4, 2.35, 57.9, -0.1, 0.2, { color: 0x2a2530, bg: 0xd8cdb6 });
  }

  // --- coin-op kiddie ride (the pup lives in here) ---------------------------
  {
    const kx = 2.5, kz = 52;
    bx(PR, 1.9, 0.24, 1.3, kx, 0.12, kz, S.dark, 0, false);
    cy(PR, 0.14, 0.6, kx, 0.3, kz, S.steelDark, 8);
    const body = new THREE.Group();
    const rocket = P.cyl(0.34, 0.42, 1.5, S.salmon, { seg: 14, collide: false });
    rocket.rotation.z = Math.PI / 2; rocket.position.set(-0.75, 0, 0);
    body.add(rocket);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 14), S.cream);
    nose.rotation.z = -Math.PI / 2; nose.position.set(1.05, 0, 0);
    nose.castShadow = true; nose.userData.collide = false;
    body.add(nose);
    for (let i = 0; i < 3; i++) {
      const fin = P.boxC(0.4, 0.42, 0.05, S.teal, { collide: false });
      fin.position.set(-0.6, 0, 0);
      fin.rotation.x = i * 2.094;
      const holder = new THREE.Group(); holder.rotation.x = i * 2.094;
      const f2 = P.boxC(0.4, 0.44, 0.05, S.teal, { collide: false });
      f2.position.set(-0.6, 0.28, 0);
      holder.add(f2); body.add(holder);
    }
    const seat = P.boxC(0.42, 0.1, 0.34, S.mauve, { collide: false });
    seat.position.set(0.05, 0.42, 0); body.add(seat);
    const bar = P.cyl(0.03, 0.03, 0.44, S.brass, { seg: 6, collide: false });
    bar.rotation.z = Math.PI / 2; bar.position.set(0.55, 0.5, -0.22); body.add(bar);
    body.position.set(kx, 0.95, kz);
    kiddieRide.add(body);
    kiddieRide.userData.body = body;
    LIVE.add(kiddieRide);
    col(2.0, 1.7, 1.4, kx, 0.85, kz);
    bx(PR, 0.28, 0.5, 0.2, kx - 1.15, 0.7, kz, S.steelDark);
    textPanel(PR, 'ROCKET\nRANGER\n50¢', kx - 1.16, 0.72, kz + 0.11, 0, 0.34,
      { color: 0xfff0d0, bg: 0x1e2a6a, fontSize: 44 });
    ctx.hidingSpot(kx, 0, kz + 1.6, 1.6, 1.0);
  }

  // --- fire stair down to the service level -----------------------------------
  {
    const sx = 13.5, steps = 22, zTop = 30, zBot = 41;
    for (let i = 0; i < steps; i++) {
      const t1 = (i + 1) / steps;
      const cz = zTop + (zBot - zTop) * (i + 0.5) / steps;
      const y = -5 * t1;                      // tread height
      bx(PR, 2.6, 5 + y, (zBot - zTop) / steps + 0.01, sx, (y - 5) / 2, cz, M.conc, 0, false);
    }
    ramp(sx, zTop, 0, sx, zBot, Y_SVC, 2.8);
    for (const s2 of [-1, 1]) {
      col(0.2, 1.15, 12.08, sx + s2 * 1.45, -1.93, 35.5, 0, 0.4266);
      inclined(PR, sx + s2 * 1.45, zTop, 1.0, sx + s2 * 1.45, zBot, -4.0, 0.06, 0.9, S.steelDark);
    }
    textPanel(PR, 'FIRE EXIT\nSTAIR 3', sx, 2.4, zTop - 0.3, 0, 0.5,
      { color: 0xd8f0dd, emissive: 0x37d268, ei: 1.6 });
    // exit sign over the head of the stair
    bx(PR, 0.8, 0.28, 0.08, sx, 2.9, zTop - 0.5, E.exit, 0, false);
  }

  // --- benches, barriers, a fallen banner --------------------------------------
  {
    for (const [bxp, bzp, br] of [[-6, 44, 0], [7, 40, Math.PI / 2], [-2, 60, 0.4]]) {
      bx(PR, 2.2, 0.12, 0.55, bxp, 0.44, bzp, M.wood, br);
      for (const s2 of [-1, 1]) {
        bx(PR, 0.12, 0.44, 0.5, bxp + Math.cos(br) * s2 * 0.9, 0.22,
          bzp - Math.sin(br) * s2 * 0.9, S.brassDull, br, false);
      }
      col(2.4, 0.6, 0.7, bxp, 0.3, bzp, br);
    }
    // 'CLOSING DOWN' banner, half torn off the ceiling and lying on the floor
    const ban = P.banner(9, 2.2, 0xa8354c, 'CLOSING DOWN · EVERYTHING MUST GO');
    ban.position.set(-4, 0.62, 36);
    ban.rotation.set(-1.42, 0.22, 0.1);
    P.NOCOLLIDE(ban); PR.add(ban);
    cy(PR, 0.01, 3.4, 0.6, 6.9, 36, S.dark, 4);
    // yellow safety barriers around a hole in the tiling
    for (let i = 0; i < 4; i++) {
      const a = i * 1.5708;
      bx(PR, 1.6, 0.9, 0.1, -10 + Math.cos(a) * 1.4, 0.45, 56 + Math.sin(a) * 1.4,
        MAT.solid({ color: 0xc8a63a, roughness: 0.7 }), -a, false);
    }
    quad(M.concDark, -11.4, 54.6, -8.6, 57.4, 0.005);
    ctx.hidingSpot(-6, 0, 44, 1.4, 0.6);
  }

  // promenade fluorescents — one run flickers
  for (let i = 0; i < 7; i++) {
    const fz = 33 + i * 4.2;
    const f = P.fluorescent(2.4, { color: 0xe6f2ff, intensity: i === 3 ? 3.2 : 0.05 });
    f.position.set(0, 8.45, fz);
    P.NOCOLLIDE(f);
    if (i === 3) {
      f.userData.emissivePanel.material = MAT.emissive(0xe6f2ff, 3.2).clone();
      flickerTubes.push(f.userData.emissivePanel);
      LIVE.add(f);
    } else PR.add(f);
  }

  // ===========================================================================
  // 15. SERVICE LEVEL (y = -5) — bare concrete, mazy, unglamorous
  // ===========================================================================
  const SV = G.svc;
  const SVX = 66, SVZ = 46, SVH = 3.4;
  const CONC_U = 60;   // world metres per UV unit for the repeat-10 concrete map

  quad(M.conc, -SVX, -SVZ, SVX, SVZ, Y_SVC, CONC_U);
  slab(-SVX, -SVZ, SVX, SVZ, Y_SVC, 0.8);
  // the soffit doubles as the lower concourse slab, with the two stairwells cut out
  for (const [a, b, c, d] of [
    [-SVX, -SVZ, SVX, 2], [-SVX, 2, -58, 13], [-50, 2, SVX, 13],
    [-SVX, 13, SVX, 30], [-SVX, 30, 10, 42], [17, 30, SVX, 42], [-SVX, 42, SVX, SVZ],
  ]) plate(SV, a, b, c, d, Y_SVC_C, 1.6, M.concDark);
  for (const [x1, z1, x2, z2] of [
    [-SVX, -SVZ, SVX, -SVZ], [-SVX, SVZ, SVX, SVZ],
    [-SVX, -SVZ, -SVX, SVZ], [SVX, -SVZ, SVX, SVZ],
  ]) wall(SV, x1, z1, x2, z2, Y_SVC, SVH, 0.6, M.conc);

  /** Wall run on the service level with gaps punched for doorways. */
  function svcWall(x1, z1, x2, z2, gaps = []) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
    const segs = [];
    let cursor = 0;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > cursor) segs.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < len - 0.01) segs.push([cursor, len]);
    for (const [a, b] of segs) {
      if (b - a < 0.05) continue;
      wall(SV, x1 + ux * a, z1 + uz * a, x1 + ux * b, z1 + uz * b, Y_SVC, SVH, 0.34, M.conc);
    }
    // lintels over the openings so the doorways read as doorways
    for (const [a, b] of gaps) {
      const mx = x1 + ux * (a + b) / 2, mz = z1 + uz * (a + b) / 2;
      bx(SV, b - a, SVH - 2.2, 0.34, mx, Y_SVC + 2.2 + (SVH - 2.2) / 2, mz,
        M.conc, -Math.atan2(uz, ux), false);
    }
  }

  const XB = [[-66, -42.5], [-37.5, -22.5], [-17.5, -2.5], [2.5, 17.5], [22.5, 37.5], [42.5, 66]];
  const ZB = [[-46, -24.5], [-19.5, -2.5], [2.5, 19.5], [24.5, 46]];

  // kind per block: 'mass' solid, 'room' enterable, 'mech', 'dock', 'open'
  const BLOCK = XB.map(() => ZB.map(() => 'mass'));
  BLOCK[0][1] = 'mech';                       // mechanical room, west end
  BLOCK[0][2] = 'room';                       // west stair landing
  BLOCK[3][3] = 'room';                       // promenade stair landing
  BLOCK[5][1] = 'dock'; BLOCK[5][2] = 'dock'; // loading dock, east end
  for (let i = 0; i < XB.length; i++) {
    for (let j = 0; j < ZB.length; j++) {
      if (BLOCK[i][j] === 'mass' && rSvc.chance(0.45)) BLOCK[i][j] = 'room';
    }
  }

  const cages = [];
  for (let i = 0; i < XB.length; i++) {
    for (let j = 0; j < ZB.length; j++) {
      const [x0, x1] = XB[i], [z0, z1] = ZB[j];
      const kind = BLOCK[i][j];
      const cxb = (x0 + x1) / 2, czb = (z0 + z1) / 2;
      const wB = x1 - x0, dB = z1 - z0;
      if (kind === 'dock') continue;
      if (kind === 'mass') {
        bx(SV, wB, SVH, dB, cxb, Y_SVC + SVH / 2, czb, M.conc);
        col(wB, SVH, dB, cxb, Y_SVC + SVH / 2, czb);
        continue;
      }
      // --- enterable room: four walls, one or two doorways -------------------
      const doors = [];
      if (i > 0) doors.push('w');
      if (i < XB.length - 1) doors.push('e');
      if (j > 0) doors.push('n');
      if (j < ZB.length - 1) doors.push('s');
      rSvc.shuffle(doors);
      const chosen = doors.slice(0, kind === 'mech' ? 1 : rSvc.int(1, 2));
      if (i === 0 && j === 2) { chosen.length = 0; chosen.push('e'); }   // stair landing
      if (i === 3 && j === 3) { chosen.length = 0; chosen.push('w'); }
      const gapOf = (side, len) => {
        if (!chosen.includes(side)) return [];
        const c = len * 0.5;
        return [[c - 0.85, c + 0.85]];
      };
      svcWall(x0, z0, x1, z0, gapOf('n', wB));
      svcWall(x0, z1, x1, z1, gapOf('s', wB));
      svcWall(x0, z0, x0, z1, gapOf('w', dB));
      svcWall(x1, z0, x1, z1, gapOf('e', dB));

      // hand-painted unit number stencilled by the door
      textPanel(SV, 'UNIT ' + (100 + i * 10 + j), cxb, Y_SVC + 2.35,
        z0 + 0.25, 0, 0.36, { color: 0x9aa08f });

      if (kind === 'mech') {
        for (let k = 0; k < 5; k++) {
          const m = P.machine(2.2, 1.8, 1.4, k + 2);
          m.position.set(x0 + 4 + k * 3.6, Y_SVC, czb + rSvc.range(-4, 4));
          m.rotation.y = rSvc.range(-0.3, 0.3);
          P.NOCOLLIDE(m); SV.add(m);
          col(2.4, 1.9, 1.6, m.position.x, Y_SVC + 0.95, m.position.z);
        }
        for (const dz of [-5, 0, 5]) {
          const pp = P.pipes(wB - 2, 4, 0.11, S.steelDark);
          pp.position.set(cxb, Y_SVC + 2.5, czb + dz);
          P.NOCOLLIDE(pp); SV.add(pp);
        }
        const boiler = P.cyl(1.1, 1.1, 2.6, M.rusty, { seg: 14, collide: false });
        boiler.position.set(x1 - 3, Y_SVC, z1 - 3.5); SV.add(boiler);
        col(2.2, 2.6, 2.2, x1 - 3, Y_SVC + 1.3, z1 - 3.5);
        textPanel(SV, 'PLANT ROOM\nAUTHORISED ENTRY ONLY', cxb, Y_SVC + 2.2, z0 + 0.25, 0, 0.6,
          { color: 0xf0e4c0, bg: 0x8a2a2a });
        ctx.hidingSpot(x1 - 6, Y_SVC, czb, 2.6, 1.0);
      } else {
        // storeroom dressing: roll cages, bales, racking, pallets
        const n = rSvc.int(2, 4);
        for (let k = 0; k < n; k++) {
          const px = rSvc.range(x0 + 2.5, x1 - 2.5), pz = rSvc.range(z0 + 2.5, z1 - 2.5);
          const pick = rSvc.int(0, 3);
          if (pick === 0) { cages.push([px, pz, rSvc.range(0, 3.1)]); }
          else if (pick === 1) {
            for (let b = 0; b < rSvc.int(2, 4); b++) {
              bx(SV, 1.2, 0.85, 1.0, px + rSvc.range(-0.1, 0.1), Y_SVC + 0.43 + b * 0.86,
                pz + rSvc.range(-0.1, 0.1), S.card, rSvc.range(-0.15, 0.15));
            }
            col(1.4, 2.6, 1.2, px, Y_SVC + 1.3, pz);
          } else if (pick === 2) {
            const sr = P.shelfRack(2, 3, 2.2, 1.0, 1.0, S.steelDark);
            sr.position.set(px, Y_SVC, pz); sr.rotation.y = rSvc.chance(0.5) ? 1.5708 : 0;
            P.NOCOLLIDE(sr); SV.add(sr);
            col(4.4, 3.0, 1.2, px, Y_SVC + 1.5, pz, sr.rotation.y);
          } else {
            const pl = P.pallet(1.3, 1.0, M.wood);
            pl.position.set(px, Y_SVC, pz); pl.rotation.y = rSvc.range(0, 3.1);
            P.NOCOLLIDE(pl); SV.add(pl);
          }
        }
        if (rSvc.chance(0.6)) ctx.hidingSpot(cxb, Y_SVC, czb, 3.0, 1.0);
      }
    }
  }

  // --- roll cages (merged into one instanced draw) ---------------------------
  {
    const parts = [];
    const addP = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g);
    };
    addP(0.9, 0.1, 0.7, 0, 0.13, 0);
    for (const sx of [-0.43, 0.43]) for (const sz of [-0.33, 0.33]) addP(0.05, 1.7, 0.05, sx, 0.85, sz);
    for (let y = 0.35; y < 1.7; y += 0.28) { addP(0.9, 0.03, 0.03, 0, y, -0.33); addP(0.9, 0.03, 0.03, 0, y, 0.33); }
    for (const sz of [-0.33, 0.33]) for (let x = -0.4; x <= 0.4; x += 0.2) addP(0.03, 1.6, 0.03, x, 0.9, sz);
    addP(0.9, 0.04, 0.7, 0, 0.9, 0);
    const cageGeo = P.mergeGeometries(parts);
    ctx.addDecor(P.scatter(cageGeo, S.steelDark, cages.length, (i, d) => {
      d.position.set(cages[i][0], Y_SVC, cages[i][1]);
      d.rotation.y = cages[i][2];
    }, 99));
    for (const c of cages) col(1.0, 1.8, 0.8, c[0], Y_SVC + 0.9, c[1], c[2]);
    for (let i = 0; i < cages.length; i += 4) ctx.hidingSpot(cages[i][0], Y_SVC, cages[i][1], 1.4, 0.95);
  }

  // --- loading dock -----------------------------------------------------------
  {
    const px0 = 52, px1 = 65.6;
    bx(SV, px1 - px0, 1.2, 30, (px0 + px1) / 2, Y_SVC + 0.6, 0, M.conc);
    col(px1 - px0, 1.2, 30, (px0 + px1) / 2, Y_SVC + 0.6, 0);
    quad(M.conc, px0, -15, px1, 15, Y_SVC + 1.2, CONC_U);
    bx(SV, 0.4, 0.35, 30, px0, Y_SVC + 1.03, 0, MAT.solid({ color: 0xc8a63a, roughness: 0.8 }), 0, false);
    ramp(px0 - 3.6, 10, Y_SVC, px0 + 0.2, 10, Y_SVC + 1.2, 3.4);
    bx(SV, 3.8, 0.12, 3.4, px0 - 1.7, Y_SVC + 0.6, 10, M.conc, 0, false).rotation.x = -0.32;
    for (const dz of [-9, -3, 3, 9]) {
      bx(SV, 0.3, 0.5, 1.4, px1 - 0.2, Y_SVC + 1.0, dz, S.dark, 0, false);   // dock bumpers
    }
    // shuttered goods door
    bx(SV, 0.2, 3.0, 5.0, 65.9, Y_SVC + 1.2 + 1.5, -6, M.shutter);
    col(0.3, 3.0, 5.0, 65.9, Y_SVC + 2.7, -6);
    bx(SV, 0.3, 0.2, 5.4, 65.85, Y_SVC + 1.25, -6, S.steelDark, 0, false);
    textPanel(SV, 'GOODS IN  ·  BAY 2', 65.6, Y_SVC + 3.1, -6, -Math.PI / 2, 0.4,
      { color: 0xd8cdb0 });
    // cardboard bales strapped and stacked
    for (let i = 0; i < 7; i++) {
      const bxp = rSvc.range(px0 + 2, px1 - 2), bzp = rSvc.range(-14, 14);
      bx(SV, 1.5, 1.3, 1.2, bxp, Y_SVC + 1.85, bzp, S.card, rSvc.range(0, 1));
      bx(SV, 1.55, 0.06, 0.1, bxp, Y_SVC + 2.2, bzp, S.dark, rSvc.range(0, 1), false);
      col(1.6, 1.4, 1.3, bxp, Y_SVC + 1.85, bzp);
    }
    ctx.hidingSpot(px0 + 4, Y_SVC + 1.2, -12, 2.6, 1.0);
    ctx.hidingSpot(px0 + 4, Y_SVC + 1.2, 12, 2.6, 1.0);
    // a compactor and a wheelie-bin row on the apron
    const comp = P.machine(3.0, 2.2, 2.0, 12);
    comp.position.set(46, Y_SVC, -14); P.NOCOLLIDE(comp); SV.add(comp);
    col(3.2, 2.3, 2.2, 46, Y_SVC + 1.15, -14);
    for (let i = 0; i < 5; i++) {
      const b = P.trashBin(0.42, 1.1);
      b.position.set(46 + i * 1.1, Y_SVC, 12); P.NOCOLLIDE(b); SV.add(b);
    }
  }

  // --- goods lift shaft (dead) -------------------------------------------------
  {
    const gx = 10, gz = -22;
    for (const [ox, oz, w2, d2] of [[0, -2.2, 4.4, 0.3], [0, 2.2, 4.4, 0.3], [2.2, 0, 0.3, 4.4]]) {
      bx(SV, w2, SVH, d2, gx + ox, Y_SVC + SVH / 2, gz + oz, M.conc);
      col(w2, SVH, Math.max(d2, 0.3), gx + ox, Y_SVC + SVH / 2, gz + oz);
    }
    bx(SV, 0.25, 2.6, 4.4, gx - 2.2, Y_SVC + 1.3 + 0.9, gz, S.steelDark);
    col(0.3, 2.6, 4.4, gx - 2.2, Y_SVC + 2.2, gz);
    textPanel(SV, 'GOODS LIFT\nOUT OF SERVICE', gx - 2.36, Y_SVC + 2.0, gz, -Math.PI / 2, 0.55,
      { color: 0xf0dcb0, bg: 0x7a2a2a });
    const lad = P.ladder(SVH - 0.3, S.steelDark);
    lad.position.set(gx + 1.9, Y_SVC, gz + 1.6); lad.rotation.y = Math.PI / 2;
    P.NOCOLLIDE(lad); SV.add(lad);
  }

  // --- corridor services: conduit, cable tray, dead fluorescents ---------------
  {
    const runs = [];
    for (const cz of [-22, 0, 22]) runs.push([-64, cz, 64, cz]);
    for (const cx of [-40, -20, 0, 20, 40]) runs.push([cx, -44, cx, 44]);
    for (const [x1, z1, x2, z2] of runs) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ang = Math.abs(x2 - x1) > 0.1 ? 0 : Math.PI / 2;
      const pp = P.pipes(len, 3, 0.07, S.steelDark);
      pp.position.set((x1 + x2) / 2, Y_SVC_C - 0.35, (z1 + z2) / 2);
      pp.rotation.y = ang;
      P.NOCOLLIDE(pp); SV.add(pp);
      bx(SV, ang ? 0.3 : len, 0.08, ang ? len : 0.3, (x1 + x2) / 2, Y_SVC_C - 0.62,
        (z1 + z2) / 2, S.steelDark, 0, false);
      // one dead tube every 6 m; a single flickering one on the main spine
      for (let t = 4; t < len - 2; t += 6) {
        const fx = x1 + (x2 - x1) * (t / len), fz = z1 + (z2 - z1) * (t / len);
        const alive = (z1 === 0 && Math.abs(fx + 20) < 3);
        const f = P.fluorescent(1.5, { color: 0xdfeaff, intensity: alive ? 3.4 : 0.04 });
        f.position.set(fx, Y_SVC_C - 0.15, fz);
        f.rotation.y = ang;
        P.NOCOLLIDE(f);
        if (alive) {
          f.userData.emissivePanel.material = MAT.emissive(0xdfeaff, 3.4).clone();
          flickerTubes.push(f.userData.emissivePanel);
          LIVE.add(f);
        } else SV.add(f);
      }
    }
    // arrows and mould stencilled on the corridor walls
    for (const [tx, tz, tr, label] of [
      [-2.6, -30, -Math.PI / 2, '← DOCK   MALL ↑'],
      [-2.6, 30, -Math.PI / 2, 'STAIR 3 ↑'],
      [-40, -19.7, 0, 'PLANT ←'],
      [22.6, 10, Math.PI / 2, 'UNITS 130-142 →'],
    ]) textPanel(SV, label, tx, Y_SVC + 1.9, tz, tr, 0.34, { color: 0x8f9a86 });
  }

  // --- the two stairs arriving from above --------------------------------------
  {
    const sx = -54, steps = 20, zTop = 2, zBot = 12;
    for (let i = 0; i < steps; i++) {
      const t1 = (i + 1) / steps;
      const cz = zTop + (zBot - zTop) * (i + 0.5) / steps;
      const y = -5 * t1;
      bx(SV, 2.4, 5 + y, (zBot - zTop) / steps + 0.01, sx, (y - 5) / 2, cz, M.conc, 0, false);
    }
    ramp(sx, zTop, 0, sx, zBot, Y_SVC, 2.6);
    for (const s2 of [-1, 1]) col(0.2, 1.15, 11.18, sx + s2 * 1.35, -1.93, 7, 0, 0.4636);
    bx(SV, 0.8, 0.28, 0.08, sx, 2.9, zTop - 0.5, E.exit, 0, false);
    textPanel(G.shell, 'STAIR 1  ·  SERVICE', sx, 2.3, zTop - 0.6, 0, 0.34,
      { color: 0xd8f0dd });
  }

  // ===========================================================================
  // 16. DECAY PASS — the collapse, the leak, stains, mould, litter
  // ===========================================================================
  const dripBits = { drop: null, ripple: null };
  {
    const D = G.shell;
    const cx0 = -34.5, cz0 = 0;

    // exposed structure where the grid came down
    for (let i = 0; i < 5; i++) {
      const gd = P.girder(12, S.steelDark, { scale: 1.6 });
      gd.position.set(cx0, Y_UPP_C + 0.35, -5 + i * 2.5);
      P.NOCOLLIDE(gd); D.add(gd);
    }
    for (const dz of [-3.5, 3.5]) {
      const duct = P.boxC(11, 0.7, 0.9, S.steelDark, { collide: false, shadow: true });
      duct.position.set(cx0, Y_UPP_C - 0.1, dz);
      D.add(duct);
    }
    // fallen tiles, sodden and buckled
    const shard = new THREE.PlaneGeometry(1.1, 1.1); shard.rotateX(-Math.PI / 2);
    ctx.addDecor(P.scatter(shard, M.ceilTile, 70, (i, d, rr) => {
      d.position.set(cx0 + rr.range(-7, 7), Y_UPP + 0.03 + rr() * 0.1, cz0 + rr.range(-6, 6));
      d.rotation.set(rr.range(-0.5, 0.5), rr() * 3, rr.range(-0.5, 0.5));
      d.scale.setScalar(rr.range(0.4, 1.0));
    }, 121));
    const rub = P.rubble(4.5, 22, M.concDark, 8);
    rub.position.set(cx0, Y_UPP, cz0); ctx.addDecor(rub);

    // the puddle, and the bucket that never stood a chance
    const puddleMat = MAT.water({ opacity: 0.85, repeat: 4 });
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(3.6, 22), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(cx0, Y_UPP + 0.015, cz0);
    puddle.userData.collide = false; puddle.receiveShadow = true;
    LIVE.add(puddle);
    ticks.push((dt) => puddleMat.userData.tick?.(dt));

    const bk = P.cyl(0.26, 0.32, 0.4, MAT.solid({ color: 0x9c8f5a, roughness: 0.7 }),
      { seg: 12, collide: false });
    bk.position.set(cx0 + 0.7, Y_UPP, cz0 - 0.4); D.add(bk);
    const bw = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), puddleMat);
    bw.rotation.x = -Math.PI / 2; bw.position.set(cx0 + 0.7, Y_UPP + 0.3, cz0 - 0.4);
    bw.userData.collide = false;
    LIVE.add(bw); dripBits.ripple = bw;

    const drop = P.sphere(0.035, MAT.emissive(0xbcd6ff, 0.4, { transparent: true, opacity: 0.55 }),
      { collide: false, seg: 6 });
    drop.position.set(cx0 + 0.7, Y_ROOF, cz0 - 0.4);
    LIVE.add(drop); dripBits.drop = drop;
    ticks.push((dt, t) => {
      const u = (t * 0.55) % 1;
      drop.position.y = Y_ROOF - u * (Y_ROOF - Y_UPP - 0.32);
      const k = Math.max(0, 1 - ((t * 0.55) % 1) * 6);
      bw.scale.setScalar(1 + k * 0.12);
    });
    ctx.hidingSpot(cx0 - 5, Y_UPP, cz0 + 4, 2.2, 0.7);

    // water staining running down the walls under the leak and in the corners
    const stainMat = MAT.solid({ color: 0x2f2a26, roughness: 0.95, transparent: true, opacity: 0.42 });
    const mouldMat = MAT.solid({ color: 0x232a1e, roughness: 1, transparent: true, opacity: 0.5 });
    for (const [sx, sy, sz, sw, sh, sr, mm] of [
      [-75.5, 3.0, 0, 14, 5.6, Math.PI / 2, stainMat],
      [-75.5, 8.4, -6, 9, 4.4, Math.PI / 2, stainMat],
      [75.5, 2.6, 8, 11, 5.0, Math.PI / 2, stainMat],
      [-45.5, 3.0, -50, 12, 5.8, Math.PI / 2, mouldMat],
      [45.5, 2.4, -44, 9, 4.6, Math.PI / 2, mouldMat],
      [-17.5, 2.6, 48, 10, 5.0, Math.PI / 2, mouldMat],
      [0, 2.4, -29.6, 16, 4.6, 0, stainMat],
    ]) {
      const q = P.boxC(sw, sh, 0.02, mm, { collide: false, shadow: false });
      q.position.set(sx, sy, sz); q.rotation.y = sr; D.add(q);
    }
    // floor stains beneath them
    for (const [fx, fz, fr] of [[-73, 0, 5], [-73, -6, 3.5], [73, 8, 4], [-43, -50, 4.5], [0, -28, 5]]) {
      const q = new THREE.Mesh(new THREE.CircleGeometry(fr, 14), stainMat);
      q.rotation.x = -Math.PI / 2; q.position.set(fx, 0.008, fz);
      q.userData.collide = false; D.add(q);
    }

    // peeling posters on the piers, and a drift of flyers on the tile
    const posters = ['SALE\n50% OFF', 'NOW HIRING\nAPPLY WITHIN', 'GRAND\nRE-OPENING', 'THANK YOU\nPALISADE'];
    for (let i = 0; i < 10; i++) {
      const side = rTrash.chance(0.5) ? 1 : -1;
      const px = rTrash.range(26, 74) * (rTrash.chance(0.5) ? 1 : -1);
      textPanel(D, rTrash.pick(posters), px, rTrash.range(1.5, 2.6), side * 12.6,
        side > 0 ? Math.PI : 0, rTrash.range(0.5, 0.9),
        { color: 0x2a2530, bg: rTrash.pick([0xc9b98e, 0xb8a0a8, 0xa8b4a4]) })
        .rotation.z = rTrash.range(-0.14, 0.14);
    }
    const flyer = new THREE.PlaneGeometry(0.3, 0.42); flyer.rotateX(-Math.PI / 2);
    const flyerMat = MAT.solid({ color: 0xc4bda8, roughness: 0.9, side: THREE.DoubleSide });
    ctx.addDecor(P.scatter(flyer, flyerMat, 460, (i, d, rr) => {
      const zone = rr.int(0, 3);
      let x, z, y = 0.01;
      if (zone === 0) { x = rr.range(-74, 74); z = rr.range(-12, 12); }
      else if (zone === 1) { x = rr.range(-22, 22); z = rr.range(-26, 28); }
      else if (zone === 2) { x = rr.range(-44, 44); z = rr.range(-60, -34); }
      else { x = rr.range(-16, 16); z = rr.range(32, 60); }
      if (Math.abs(x) < 6 && Math.abs(z) < 6) return false;
      d.position.set(x, y, z);
      d.rotation.set(rr.range(-0.08, 0.08), rr() * 3.14, rr.range(-0.08, 0.08));
    }, 131));
    ctx.addDecor(P.scatter(flyer, flyerMat, 180, (i, d, rr) => {
      d.position.set(rr.range(-64, 64), Y_SVC + 0.01, rr.range(-44, 44));
      d.rotation.set(0, rr() * 3.14, 0);
    }, 132));
    // upper-deck litter
    ctx.addDecor(P.scatter(flyer, flyerMat, 200, (i, d, rr) => {
      const x = rr.range(-74, 74), z = rr.range(-12, 12);
      if (Math.abs(x) < 26) return false;
      d.position.set(x, Y_UPP + 0.01, z);
      d.rotation.set(0, rr() * 3.14, 0);
    }, 133));

    // bins, trolleys and a-boards left where they stopped
    for (let i = 0; i < 12; i++) {
      const b = P.trashBin(0.32, 0.85);
      const a = rTrash() * 6.283;
      const rr = rTrash.range(14, 70);
      b.position.set(Math.cos(a) * rr, rTrash.chance(0.25) ? Y_UPP : 0,
        Math.sin(a) * Math.min(Math.abs(Math.sin(a) * rr), 11) * (rTrash.chance(0.5) ? 1 : -1));
      if (Math.abs(b.position.x) < 24) b.position.z = rTrash.range(-24, 28);
      P.NOCOLLIDE(b); D.add(b);
      col(0.7, 0.9, 0.7, b.position.x, b.position.y + 0.45, b.position.z);
    }
  }

  // ===========================================================================
  // 17. LIGHTING — 1 shadowed directional, 1 shadowed spot, 20 unshadowed
  // ===========================================================================
  ctx.light(new THREE.HemisphereLight(0x39435c, 0x1a171c, 0.30));
  ctx.light(new THREE.AmbientLight(0x2a2733, 0.55));

  const moon = new THREE.DirectionalLight(0xa9c6ee, 3.1);
  moon.position.set(38, 78, 52);
  moon.target.position.set(-2, 0, -4);
  ctx.light(moon, { shadow: true, range: 56, far: 220, normalBias: 0.05 });

  // one shadowed spot picks the fountain out of the dark
  const fSpot = new THREE.SpotLight(0xbcd4f2, 26, 30, Math.PI / 4.5, 0.55, 1.4);
  fSpot.position.set(2, 15, 3);
  fSpot.target.position.set(0, 0, 0);
  ctx.light(fSpot, { shadow: true, far: 34 });

  // warm sodium security lights, unshadowed
  const SECURITY = [
    [-52, 3.6, 0], [52, 3.6, 0], [-30, 3.6, 6], [30, 3.6, -6],
    [0, 3.6, 27], [0, 5.2, -27], [-24, 4.2, -48], [24, 4.2, -48],
    [0, 4.0, 46], [-52, Y_UPP + 3.0, 0], [52, Y_UPP + 3.0, 0],
  ];
  for (const [lx, ly, lz] of SECURITY) {
    const l = new THREE.PointLight(0xffa855, 7.5, 22, 1.7);
    l.position.set(lx, ly, lz);
    ctx.light(l);
    bx(G.shell, 0.5, 0.12, 0.5, lx, ly + 0.18, lz, E.sodium, 0, false);
  }
  // the four lit storefronts read as beacons
  for (const [lx, ly, lz] of storeLights) {
    const l = new THREE.PointLight(0xffd9a8, 11, 20, 1.6);
    l.position.set(lx, ly, lz);
    ctx.light(l);
  }
  // service level: three sallow pools plus the flickering spine tube
  for (const [lx, lz] of [[-20, 0], [22, 0], [56, 4]]) {
    const l = new THREE.PointLight(0xcfe0ff, 6, 20, 1.8);
    l.position.set(lx, Y_SVC_C - 0.6, lz);
    ctx.light(l);
  }
  const flickLight = new THREE.PointLight(0xdfeaff, 9, 18, 1.7);
  flickLight.position.set(-20, Y_SVC_C - 0.6, 0);
  ctx.light(flickLight);
  // car park sodium wash
  const carPark = new THREE.PointLight(0xff9a3c, 30, 46, 1.5);
  carPark.position.set(-8, 8.6, -75);
  ctx.light(carPark);
  // cold spill from the food court glazing
  const fcGlow = new THREE.PointLight(0x8fb6e0, 9, 34, 1.6);
  fcGlow.position.set(0, 4.5, -58);
  ctx.light(fcGlow);
  // total real lights: 2 ambient-ish + 1 dir + 1 spot + 11 + 4 + 3 + 1 + 1 + 1 = 24

  // ===========================================================================
  // 18. MOTION
  // ===========================================================================
  // CRT static — one canvas of noise, scrolled and gain-modulated
  {
    const rN = rng.fork('static');
    const crtMat = MAT.painted(96, 96, (c, Wd, Ht) => {
      const img = c.createImageData(Wd, Ht);
      for (let i = 0; i < Wd * Ht; i++) {
        const v = rN() * 255 | 0;
        img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = Math.min(255, v * 1.12);
        img.data[i * 4 + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }, { emissive: 0xa8d4ff, emissiveIntensity: 1.6, transparent: false, roughness: 0.3 });
    crtMat.map.wrapS = crtMat.map.wrapT = THREE.RepeatWrapping;
    crtMat.map.repeat.set(2.2, 1.6);
    for (const s of crtScreens) s.material = crtMat;
    const hash = (n) => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
    ticks.push((dt, t) => {
      const f = Math.floor(t * 24);
      crtMat.map.offset.set(hash(f), hash(f + 91));
      crtMat.emissiveIntensity = 1.15 + hash(f * 1.7) * 1.1;
    });
  }

  // flickering fluorescents (promenade + the service spine)
  {
    for (const p of flickerTubes) p.material = p.material.clone();
    const base = flickerTubes.map(p => p.material.emissiveIntensity);
    ticks.push((dt, t) => {
      const n = Math.sin(t * 31.3) * Math.sin(t * 7.1) * Math.sin(t * 2.3);
      const on = n > -0.28 ? 1 : (Math.sin(t * 120) > 0 ? 0.35 : 0.04);
      flickerTubes.forEach((p, i) => { p.material.emissiveIntensity = base[i] * on; });
      flickLight.intensity = 9 * on;
    });
  }

  // backlit menu boards, guttering
  {
    for (const b of menuBoards) b.material = b.material.clone();
    ticks.push((dt, t) => {
      menuBoards.forEach((b, i) => {
        const s = 0.72 + Math.sin(t * (2.1 + i * 0.7)) * 0.1
          + (Math.sin(t * 44 + i) > 0.94 ? -0.55 : 0);
        b.material.emissiveIntensity = 1.9 * Math.max(0.15, s);
      });
    });
  }

  // neon buzzing in the lit shop windows
  {
    for (const n of neonBuzz) n.material = n.material.clone();
    ticks.push((dt, t) => {
      neonBuzz.forEach((n, i) => {
        const b = 2.4 + Math.sin(t * 60 + i * 2) * 0.35 + (Math.sin(t * 9 + i) > 0.97 ? -1.9 : 0);
        n.material.emissiveIntensity = Math.max(0.2, b);
      });
    });
  }

  // the kiddie ride, still rocking on a coin nobody put in
  ticks.push((dt, t) => {
    const b = kiddieRide.userData.body;
    if (b) { b.rotation.z = Math.sin(t * 1.05) * 0.055; b.position.y = 0.95 + Math.sin(t * 2.1) * 0.02; }
  });

  ctx.onUpdate((dt, t) => { for (let i = 0; i < ticks.length; i++) ticks[i](dt, t); });

  // ===========================================================================
  // 19. GAMEPLAY — 42 coins, 5 batteries, 3 powerups, 1 pup, 24 hiding spots
  // ===========================================================================
  const COINS = [
    // atrium floor + fountain
    [0, 0, 4.2], [3.6, 0, -3.2], [-3.8, 0, -3.4], [4.6, 0, 4.4], [-8, 0, 9], [9, 0, -9],
    [-14, 0, 16], [15, 0, 15], [-16, 0, -15], [17, 0, -16],
    // lower wings
    [30, 0, 0], [44, 0, 7], [58, 0, -7], [70, 0, 3],
    [-30, 0, -5], [-44, 0, 8], [-58, 0, -8], [-70, 0, 2],
    // inside lower stores
    [32, 0, -20], [48, 0, 20], [64, 0, -19], [64, 0, 21],
    [-32, 0, -21], [-32, 0, 19], [-48, 0, -20], [-48, 0, 20],
    // upper concourse + stores
    [38, Y_UPP, -19], [38, Y_UPP, 18], [62, Y_UPP, -20],
    [-38, Y_UPP, -19], [-62, Y_UPP, -20], [-62, Y_UPP, 19],
    [-20, Y_UPP, -18], [20, Y_UPP, 18], [-35, Y_UPP, 3],
    // food court + promenade
    [-40, 0, -50], [12, 0, -52], [0, 0, -40], [-27, 0, -49], [-6, 0, 44],
    // service level
    [-54, Y_SVC, 14], [-20, Y_SVC, -30], [0, Y_SVC, 30],
    [30, Y_SVC, -10], [56, Y_SVC + 1.2, 0], [-58, Y_SVC, -10],
  ];
  for (const c of COINS) ctx.pickup(c[0], c[1] + 1.0, c[2], 'coin');

  ctx.pickup(-46, Y_SVC + 1.0, 32, 'battery');
  ctx.pickup(38, Y_SVC + 1.0, 30, 'battery');
  ctx.pickup(10, Y_SVC + 1.0, -38, 'battery');
  ctx.pickup(60, Y_SVC + 2.2, -12, 'battery');
  ctx.pickup(-64, Y_UPP + 1.0, 19, 'battery');

  ctx.pickup(20, 1.0, 0, 'powerup:nightvision');       // in the dead lift car
  ctx.pickup(-27, 1.0, -49, 'powerup:silence');        // the play zone
  ctx.pickup(-40, Y_SVC + 1.0, -34, 'powerup:ghost');  // deep back-of-house

  // the dog: curled up in the seat of the Rocket Ranger
  ctx.pickup(2.5, 1.45, 52, 'pup');

  // hiding spots not already registered by the builders above
  ctx.hidingSpot(0, 0, -8, 2.4, 0.75);            // behind the fountain
  ctx.hidingSpot(-20, 0, 18, 2.0, 0.9);           // under the west stair
  ctx.hidingSpot(-5, 0, 10, 1.8, 0.9);            // under escalator A
  ctx.hidingSpot(5, 0, -10, 1.8, 0.9);            // under escalator B
  ctx.hidingSpot(-35, 0, 0, 2.4, 0.8);            // west concourse
  ctx.hidingSpot(50, 0, 0, 2.4, 0.7);
  ctx.hidingSpot(-13, 0, 50, 1.4, 1.0);           // photo booth
  ctx.hidingSpot(-54, Y_SVC, 14, 2.6, 1.0);       // service stair foot
  ctx.hidingSpot(0, Y_SVC, 0, 2.4, 0.9);          // spine crossroads
  ctx.hidingSpot(-30, Y_SVC, 30, 3.0, 1.0);
  ctx.hidingSpot(30, Y_SVC, -32, 3.0, 1.0);
  ctx.hidingSpot(10, Y_SVC, -22, 1.8, 1.0);       // goods lift shaft

  // footstep surfaces
  ctx.setSurface((x, z) => {
    for (const [x0, z0, x1, z1] of carpetRects) {
      if (x > x0 && x < x1 && z > z0 && z < z1) return 'carpet';
    }
    if (z < -62.4) return 'asphalt';
    if (Math.abs(x) > 46 && z < -30) return 'concrete';
    return 'tile';
  });

  // ===========================================================================
  // 20. BAKE — freeze the static shells, emit one merged collision proxy
  // ===========================================================================
  for (const mat2 of floorBuckets.keys()) {
    const merged = P.mergeGeometries(floorBuckets.get(mat2));
    const m = new THREE.Mesh(merged, mat2);
    m.castShadow = false; m.receiveShadow = true; m.userData.collide = false;
    ctx.addDecor(m);
  }
  for (const key of Object.keys(G)) ctx.addDecor(P.freeze(G[key]));
  ctx.addDecor(LIVE);

  {
    const geos = [];
    for (const [w, h, d, x, y, z, ry, rx] of COLB) {
      if (w <= 0 || h <= 0 || d <= 0) continue;
      const g = new THREE.BoxGeometry(w, h, d);
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')),
        new THREE.Vector3(1, 1, 1)));
      geos.push(g);
    }
    const proxy = new THREE.Mesh(P.mergeGeometries(geos), MAT.solid({ color: 0x000000 }));
    proxy.visible = false;
    proxy.castShadow = false; proxy.receiveShadow = false;
    proxy.userData.collide = true;
    ctx.add(proxy);
  }
}

