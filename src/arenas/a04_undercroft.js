// =============================================================================
// A04 — THE UNDERCROFT
// L0_SUBTERRENE_RING. A cathedral-industrial brutalist research facility, 60 m
// down. Three strata, each with its own light, palette and sound:
//
//   STRATUM A  y =   0   "Service Level"   coolant-cyan  / board-formed concrete
//   STRATUM B  y =  -9   "The Reactor Hall" forge-red    / black iron + steam
//   STRATUM C  y = -20   "The Well"        void-violet   / black water, no logic
//
// The transition between them is meant to read as a hard CUT — you leave the
// cyan strip lighting, you step into red, you descend into violet and silence.
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'undercroft',
  name: 'THE UNDERCROFT',
  tagline: 'Sixty metres down, the light bends inward.',
  order: 4,
  difficulty: 4,
  biome: 'underground',
  seed: 40704,
  spawn: [-23, 0, -51],
  bounds: 96,
  colors: ['#2ff0ff', '#2a0a1c'],
  music: 'dread',
};

export async function build(ctx) {
  const P = ctx.props;
  const M = ctx.mat;
  const R = ctx.rng;

  const rDetail = R.fork('detail');
  const rWear = R.fork('wear');
  const rClutter = R.fork('clutter');
  const rWell = R.fork('well');

  // ---------------------------------------------------------------------------
  // 0. ATMOSPHERE — dark, near-black, exp2 fog. Let the emissives scream.
  // ---------------------------------------------------------------------------
  ctx.sky({ color: 0x03050a });
  ctx.fog(0x05070a, 0.028, 0, 'exp2');
  ctx.useEnvironment(0.22);
  ctx.grade({
    exposure: 0.95,
    saturation: 0.86,
    contrast: 1.15,
    lift: [-0.004, 0.0, 0.012],
    gain: [0.97, 1.0, 1.06],
    vignette: 1.15,
    grain: 0.045,
    bloom: 0.65,
    bloomRadius: 0.85,
    bloomThreshold: 0.62,
    aberration: 0.0022,
    scanline: 0.0,
  });
  ctx.soundscape('machine', 'dread', { size: 0.9, dark: 0.65, wet: 0.34 });
  // Footsteps: metal across the reactor-hall gantry band, water in the deep
  // flooded hall (its XZ footprint does not overlap anything on Stratum A).
  ctx.setSurface((x, z) => {
    if (Math.abs(x) < 20.5 && Math.abs(z) < 20.5) {
      return (Math.abs(x) > 7 || Math.abs(z) > 7) ? 'metal' : 'concrete';
    }
    if (x > -60 && x < -8 && z > 34 && z < 52) return 'water';
    return 'concrete';
  });

  // ---------------------------------------------------------------------------
  // 1. MATERIALS — 13 surface() calls, everything else solid/emissive/painted.
  // ---------------------------------------------------------------------------
  const MAT = {
    // wet black concrete, three scales so nothing stretches too badly
    wall: M.surface('concrete', { color: 0x2b3138, repeat: 5, size: 512, seed: 7 }),
    wallBig: M.surface('concrete', { color: 0x272c33, repeat: 11, size: 512, seed: 13 }),
    floor: M.surface('concrete', { color: 0x1e2228, repeat: 20, size: 512, seed: 3 }),
    ceil: M.surface('concrete', { color: 0x161a1e, repeat: 9, size: 512, seed: 9 }),
    // the Well is the same concrete, gone violet and wet
    wellWall: M.surface('concrete', { color: 0x252036, repeat: 4, size: 512, seed: 21 }),
    wellFloor: M.surface('concrete', { color: 0x121019, repeat: 16, size: 512, seed: 22 }),
    rock: M.surface('rock', { color: 0x1b1e23, repeat: 5, size: 512, seed: 31 }),
    iron: M.surface('metalPanel', { color: 0x232830, repeat: 3, size: 256, panels: 3, roughness: 0.55 }),
    ironBig: M.surface('metalPanel', { color: 0x1d2228, repeat: 8, size: 256, panels: 4, roughness: 0.6 }),
    rust: M.surface('rustMetal', { color: 0x39312c, rust: 0x6a3316, repeat: 2, size: 256, seed: 5 }),
    corr: M.surface('corrugated', { color: 0x2c3238, repeat: 2, size: 256, ribs: 16 }),
    tileWall: M.surface('tile', { color: 0x53646b, grout: 0x161b1f, tiles: 10, repeat: 5, size: 512 }),
    coreSkin: M.surface('hexPanel', { color: 0x2a1c18, line: 0xff5a22, repeat: 5, size: 512, scale: 9 }),
  };

  const EM = {
    cyan: M.emissive(0x2ff0ff, 3.0),
    cyanSoft: M.emissive(0x1ea6c6, 1.5),
    cyanStrip: M.emissive(0x35f2ff, 4.2, { toneMapped: true }),
    flick: M.emissive(0xdfeaff, 3.6, { base: 0x101214 }),
    red: M.emissive(0xff2d12, 3.4),
    coreRed: M.emissive(0xff3c10, 5.5),
    amber: M.emissive(0xffa424, 4.4),
    violet: M.emissive(0x8f4dff, 2.0),
    violetDim: M.emissive(0x5c2fb0, 0.9),
    white: M.emissive(0xdfe8ff, 3.8),
    green: M.emissive(0x37ffa2, 2.2),
    ledA: M.emissive(0xff2a1a, 2.4, { base: 0x0a0304 }),
    ledB: M.emissive(0xff2a1a, 2.41, { base: 0x0a0304 }),
    ledC: M.emissive(0xff2a1a, 2.42, { base: 0x0a0304 }),
    ledD: M.emissive(0xff2a1a, 2.43, { base: 0x0a0304 }),
  };

  const MET = {
    dark: M.metal(0x3c4249, 0.5),
    pipe: M.metal(0x5b6167, 0.45),
    pipeHot: M.metal(0x7a5642, 0.6),
    brass: M.metal(0x9b7b3a, 0.35),
    black: M.solid({ color: 0x0b0d10, roughness: 0.85 }),
    lag: M.solid({ color: 0x8d8a7e, roughness: 0.95 }),
    rubber: M.solid({ color: 0x101214, roughness: 0.95 }),
  };

  const GLASS = M.glassCheap({ color: 0x16323c, opacity: 0.30 });
  const WATER = M.water({ color: 0x05040c, opacity: 0.94, transmission: 0.22, repeat: 14 });
  const STEAM = M.emissive(0xbfe6ff, 0.55, { transparent: true, opacity: 0.14, toneMapped: true, side: THREE.DoubleSide });

  // ---------------------------------------------------------------------------
  // 2. GROUPS — colliding architecture, invisible proxies, frozen decor.
  // ---------------------------------------------------------------------------
  const G_SOLID = new THREE.Group();   // real, visible, collidable
  const G_PROXY = new THREE.Group();   // invisible collision boxes (zero draws)
  const G_DEC_A = new THREE.Group();   // frozen at the end — one mesh/material
  const G_DEC_B = new THREE.Group();
  const G_DEC_C = new THREE.Group();
  const G_LIVE = new THREE.Group();    // animated / emissive, stays live

  const boardFaces = [];               // board-formed shutter lines + tie holes

  // ---------------------------------------------------------------------------
  // 3. BUILD HELPERS
  // ---------------------------------------------------------------------------

  /** Floor slab: top surface sits exactly at y. */
  function slab(x0, z0, x1, z1, y, material, t = 0.45, g = G_SOLID) {
    const m = P.boxC(Math.abs(x1 - x0), t, Math.abs(z1 - z0), material, { shadow: false });
    m.position.set((x0 + x1) / 2, y - t / 2, (z0 + z1) / 2);
    g.add(m);
    return m;
  }

  /** Ceiling slab: underside sits exactly at y. */
  function lid(x0, z0, x1, z1, y, material, t = 0.4, g = G_SOLID) {
    const m = P.boxC(Math.abs(x1 - x0), t, Math.abs(z1 - z0), material, { shadow: false });
    m.position.set((x0 + x1) / 2, y + t / 2, (z0 + z1) / 2);
    g.add(m);
    return m;
  }

  /** Invisible collision proxy box (centre origin). */
  function proxy(w, h, d, x, y, z, ry = 0) {
    const m = P.boxC(w, h, d, MET.black, { shadow: false, receive: false });
    m.visible = false;
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.userData.collide = true;
    G_PROXY.add(m);
    return m;
  }

  /**
   * Wall along an arbitrary XZ segment, with rectangular openings punched out.
   * gaps: [{ at, w, y0, y1 }]  (at = metres from the run start)
   * When `board` is set, every full-height pier registers both of its faces for
   * the board-formed shutter-line instancing pass — so lines never cross a door.
   */
  function wallRun(x0, z0, x1, z1, yBase, h, t, material, gaps = [], o = {}) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const ang = -Math.atan2(dz, dx);
    const top = yBase + h;
    const g = o.group || G_SOLID;
    const put = (a, b, ya, yb) => {
      const w = b - a, hh = yb - ya;
      if (w < 0.03 || hh < 0.03) return;
      const t0 = (a + b) / 2 / len;
      const m = P.boxC(w, hh, t, material, { shadow: o.shadow ?? false });
      m.position.set(x0 + dx * t0, (ya + yb) / 2, z0 + dz * t0);
      m.rotation.y = ang;
      g.add(m);
      if (o.board && Math.abs(ya - yBase) < 1e-6 && w > 1.2 && hh > 1.2) {
        const ax = x0 + dx * (a / len), az = z0 + dz * (a / len);
        const bx = x0 + dx * (b / len), bz = z0 + dz * (b / len);
        const cap = Math.min(hh, o.boardMax ?? 8);
        boardFaces.push({ ax, az, bx, bz, y0: ya, h: cap, off: t / 2 + 0.025 });
        if (o.board !== 1) boardFaces.push({ ax: bx, az: bz, bx: ax, bz: az, y0: ya, h: cap, off: t / 2 + 0.025 });
      }
    };
    const gs = gaps.slice().sort((p, q) => p.at - q.at);
    let cursor = 0;
    for (const gp of gs) {
      const a = Math.max(0, gp.at), b = Math.min(len, gp.at + gp.w);
      if (b <= a) continue;
      if (a > cursor) put(cursor, a, yBase, top);
      const gy0 = gp.y0 ?? yBase, gy1 = gp.y1 ?? top;
      if (gy0 > yBase) put(a, b, yBase, gy0);
      if (gy1 < top) put(a, b, gy1, top);
      cursor = Math.max(cursor, b);
    }
    if (cursor < len) put(cursor, len, yBase, top);
  }

  /** Wall running along X at fixed z. gaps as { from, to, y0, y1 } in world X. */
  function wallX(z, xA, xB, yBase, h, t, material, gaps = [], o = {}) {
    wallRun(xA, z, xB, z, yBase, h, t, material,
      gaps.map(q => ({ at: q.from - xA, w: q.to - q.from, y0: q.y0, y1: q.y1 })), o);
  }
  /** Wall running along Z at fixed x. gaps as { from, to, y0, y1 } in world Z. */
  function wallZ(x, zA, zB, yBase, h, t, material, gaps = [], o = {}) {
    wallRun(x, zA, x, zB, yBase, h, t, material,
      gaps.map(q => ({ at: q.from - zA, w: q.to - q.from, y0: q.y0, y1: q.y1 })), o);
  }

  /**
   * A sealed rectangular volume: floor, ceiling and any subset of its four
   * walls, each with door/window openings.
   *   sides: 'n' = -Z, 's' = +Z, 'w' = -X, 'e' = +X
   */
  function room(o) {
    const { x0, z0, x1, z1, y, h } = o;
    const t = o.t ?? 0.5;
    const wm = o.wall ?? MAT.wall;
    const sides = o.sides ?? 'nsew';
    if (o.floor !== false) slab(x0, z0, x1, z1, y, o.floorMat ?? MAT.floor, o.floorT ?? 0.45);
    if (o.ceil !== false) lid(x0, z0, x1, z1, y + h, o.ceilMat ?? MAT.ceil);
    const wo = { board: o.board, boardMax: o.boardMax, shadow: o.shadow };
    if (sides.includes('n')) wallX(z0, x0, x1, y, h, t, wm, o.n ?? [], wo);
    if (sides.includes('s')) wallX(z1, x0, x1, y, h, t, wm, o.s ?? [], wo);
    if (sides.includes('w')) wallZ(x0, z0, z1, y, h, t, wm, o.w ?? [], wo);
    if (sides.includes('e')) wallZ(x1, z0, z1, y, h, t, wm, o.e ?? [], wo);
  }

  const DOOR = (from, to, y) => ({ from, to, y0: y, y1: y + 2.4 });
  const WIN = (from, to, y) => ({ from, to, y0: y + 1.1, y1: y + 2.7 });

  /**
   * Industrial stair flight from (x0,z0,y0) to (x1,z1,y1).
   * Steps are frozen decor; collision is a single invisible ramp box.
   */
  function stairFlight(x0, z0, y0, x1, z1, y1, width, dec, material) {
    const dx = x1 - x0, dz = z1 - z0;
    const run = Math.hypot(dx, dz);
    const rise = y1 - y0;
    const ang = -Math.atan2(dz, dx);
    const n = Math.max(6, Math.round(Math.abs(rise) / 0.19));
    const mtl = material ?? MAT.iron;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const topY = y0 + rise * ((i + 1) / n);
      const s = P.boxC(run / n + 0.02, 0.1, width, mtl, { shadow: false });
      s.position.set(x0 + dx * t, topY - 0.05, z0 + dz * t);
      s.rotation.y = ang;
      dec.add(s);
      // riser
      const r = P.boxC(0.05, Math.abs(rise) / n, width * 0.96, mtl, { shadow: false });
      r.position.set(x0 + dx * ((i + (rise < 0 ? 0 : 1)) / n), topY - Math.abs(rise) / (2 * n) - 0.05,
        z0 + dz * ((i + (rise < 0 ? 0 : 1)) / n));
      r.rotation.y = ang;
      dec.add(r);
    }
    // stringers
    for (const sgn of [-1, 1]) {
      const wrap = new THREE.Group();
      wrap.position.set(x0, y0, z0);
      wrap.rotation.y = ang;
      const b = P.boxC(Math.hypot(run, rise), 0.34, 0.09, mtl, { shadow: false });
      b.position.set(run / 2, rise / 2 - 0.26, sgn * width / 2);
      b.rotation.z = Math.atan2(rise, run);
      wrap.add(b);
      dec.add(wrap);
    }
    // ramp collider
    const wrap = new THREE.Group();
    wrap.position.set(x0, y0, z0);
    wrap.rotation.y = ang;
    const ramp = P.boxC(Math.hypot(run, rise), 0.5, width, MET.black, { shadow: false, receive: false });
    ramp.position.set(run / 2, rise / 2 - 0.25, 0);
    ramp.rotation.z = Math.atan2(rise, run);
    ramp.visible = false;
    ramp.userData.collide = true;
    wrap.add(ramp);
    G_PROXY.add(wrap);
  }

  /** Visual railing (frozen) plus an invisible barrier so you can't walk off. */
  function railLine(x0, z0, x1, z1, y, dec, o = {}) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const ang = -Math.atan2(dz, dx);
    const h = o.h ?? 1.05;
    const mtl = o.mat ?? MAT.iron;
    const n = Math.max(2, Math.round(len / 1.7));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = P.boxC(0.06, h, 0.06, mtl, { shadow: false });
      p.position.set(x0 + dx * t, y + h / 2, z0 + dz * t);
      dec.add(p);
    }
    for (const yy of [y + h, y + h * 0.52]) {
      const b = P.boxC(len, yy === y + h ? 0.07 : 0.045, 0.06, mtl, { shadow: false });
      b.position.set(x0 + dx * 0.5, yy, z0 + dz * 0.5);
      b.rotation.y = ang;
      dec.add(b);
    }
    // toe board
    const toe = P.boxC(len, 0.12, 0.04, mtl, { shadow: false });
    toe.position.set(x0 + dx * 0.5, y + 0.07, z0 + dz * 0.5);
    toe.rotation.y = ang;
    dec.add(toe);
    if (o.collide !== false) proxy(len, h + 0.2, 0.1, x0 + dx * 0.5, y + (h + 0.2) / 2, z0 + dz * 0.5, ang);
  }

  /** Board-formed face registration helpers for walls not built by wallRun. */
  const bfN = (z, xA, xB, y0, h, off = 0.03) => boardFaces.push({ ax: xA, az: z, bx: xB, bz: z, y0, h, off });
  const bfS = (z, xA, xB, y0, h, off = 0.03) => boardFaces.push({ ax: xB, az: z, bx: xA, bz: z, y0, h, off });
  const bfW = (x, zA, zB, y0, h, off = 0.03) => boardFaces.push({ ax: x, az: zB, bx: x, bz: zA, y0, h, off });
  const bfE = (x, zA, zB, y0, h, off = 0.03) => boardFaces.push({ ax: x, az: zA, bx: x, bz: zB, y0, h, off });

  /** Heavy round-cornered pressure hatch, hinged open against the wall. */
  function pressureDoor(x, y, z, ry, open = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const leaf = new THREE.Group();
    leaf.rotation.y = -open * 1.9;
    const body = P.boxC(1.9, 2.35, 0.16, MAT.iron, { shadow: false });
    body.position.set(0.95, 1.2, 0);
    leaf.add(body);
    for (const [ox, oy] of [[0.28, 0.24], [1.62, 0.24], [0.28, 2.16], [1.62, 2.16]]) {
      const c = P.cyl(0.26, 0.26, 0.17, MAT.iron, { seg: 12, collide: false, shadow: false });
      c.rotation.x = Math.PI / 2; c.position.set(ox, oy, 0);
      leaf.add(c);
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 6, 18), MET.dark);
    wheel.position.set(0.95, 1.2, 0.14);
    leaf.add(wheel);
    for (let i = 0; i < 4; i++) {
      const sp = P.boxC(0.62, 0.05, 0.05, MET.dark, { shadow: false });
      sp.position.set(0.95, 1.2, 0.14);
      sp.rotation.z = i * Math.PI / 4;
      leaf.add(sp);
    }
    const hinge = P.cyl(0.09, 0.09, 2.4, MET.dark, { seg: 8, collide: false, shadow: false });
    g.add(hinge);
    g.add(leaf);
    return g;
  }

  // ===========================================================================
  // 4. STRATUM A — SERVICE LEVEL (y = 0)
  //    A brutalist ring corridor wrapped around the reactor-hall vault, with
  //    the locker room, mess, control room, plant room and decon airlock hung
  //    off it on spurs.
  // ===========================================================================
  const AH = 3.8;            // ring corridor headroom
  const HW = 20.5;           // hall wall centreline
  const RING_OUT = 26;       // ring corridor outer wall centreline

  // --- ring corridor floor + ceiling (four plates forming an annulus) --------
  slab(-RING_OUT, -RING_OUT, RING_OUT, -21, 0, MAT.floor);
  slab(-RING_OUT, 21, RING_OUT, RING_OUT, 0, MAT.floor);
  slab(-RING_OUT, -21, -21, 21, 0, MAT.floor);
  slab(21, -21, RING_OUT, 21, 0, MAT.floor);
  lid(-RING_OUT, -RING_OUT, RING_OUT, -21, AH, MAT.ceil);
  lid(-RING_OUT, 21, RING_OUT, RING_OUT, AH, MAT.ceil);
  lid(-RING_OUT, -21, -21, 21, AH, MAT.ceil);
  lid(21, -21, RING_OUT, 21, AH, MAT.ceil);

  // --- ring outer wall (the board-formed signature wall) --------------------
  const ringWallOpts = { board: 1, boardMax: 4.2 };
  wallX(-RING_OUT, -RING_OUT, RING_OUT, 0, 4.2, 0.6, MAT.wall,
    [DOOR(-20, -16, 0), DOOR(12, 16, 0)], ringWallOpts);
  wallX(RING_OUT, -RING_OUT, RING_OUT, 0, 4.2, 0.6, MAT.wall,
    [DOOR(-2, 2, 0)], ringWallOpts);
  wallZ(-RING_OUT, -RING_OUT, RING_OUT, 0, 4.2, 0.6, MAT.wall,
    [DOOR(-2, 2, 0), DOOR(18, 22, 0)], ringWallOpts);
  wallZ(RING_OUT, -RING_OUT, RING_OUT, 0, 4.2, 0.6, MAT.wall,
    [DOOR(-2, 2, 0)], ringWallOpts);

  // --- the reactor-hall wall: shared between Stratum A and Stratum B --------
  // 16 m tall (y -9 .. +7) where it springs into the vault. Doors at y=0 open
  // straight onto catwalk level 2; slot windows let the red glow into the ring.
  const hallWallOpts = { board: true, boardMax: 8, shadow: false };
  wallX(-HW, -HW, HW, -9, 16, 1.0, MAT.wallBig, [
    { from: 8.5, to: 12.5, y0: -9, y1: -6.2 },      // diagonal service tunnel
    DOOR(-2, 2, 0),                                   // to catwalk L2
    WIN(-16, -12, 0), WIN(12, 16, 0),
  ], hallWallOpts);
  wallX(HW, -HW, HW, -9, 16, 1.0, MAT.wallBig, [
    DOOR(-2, 2, 0), WIN(-16, -12, 0), WIN(12, 16, 0),
  ], hallWallOpts);
  wallZ(-HW, -HW, HW, -9, 16, 1.0, MAT.wallBig, [
    DOOR(-2, 2, 0), WIN(-16, -12, 0), WIN(12, 16, 0),
  ], hallWallOpts);
  wallZ(HW, -HW, HW, -9, 16, 1.0, MAT.wallBig, [
    { from: 14, to: 18, y0: -9, y1: -6.2 },          // from the shaft, at -9
    DOOR(-2, 2, 0), WIN(-16, -12, 0),
  ], hallWallOpts);
  // tympanum walls closing the vault ends
  wallZ(-HW, -HW, HW, 7, 6.4, 1.0, MAT.wallBig, []);
  wallZ(HW, -HW, HW, 7, 6.4, 1.0, MAT.wallBig, []);

  // observation glazing (collides, so nobody vaults a 1.1 m sill into the hall)
  for (const [wx, wz, ry] of [
    [-14, -HW, 0], [14, -HW, 0], [-14, HW, 0], [14, HW, 0],
    [-HW, -14, Math.PI / 2], [-HW, 14, Math.PI / 2], [HW, -14, Math.PI / 2],
  ]) {
    const pane = P.boxC(4, 1.6, 0.07, GLASS, { shadow: false });
    pane.position.set(wx, 1.9, wz);
    pane.rotation.y = ry;
    pane.userData.collide = true;
    G_SOLID.add(pane);
    const fr = P.boxC(4.3, 1.9, 0.12, MAT.iron, { shadow: false });
    fr.position.set(wx, 1.9, wz);
    fr.rotation.y = ry;
    G_DEC_A.add(fr);
  }

  // --- spur corridors -------------------------------------------------------
  const CH = 3.3;                                     // spur headroom
  // P1  west  ring -> mess hall
  room({ x0: -48, z0: -2, x1: -26, z1: 2, y: 0, h: CH, sides: 'ns', board: 1 });
  // P2  north-west  ring -> decon airlock
  room({ x0: -20, z0: -44, x1: -16, z1: -26, y: 0, h: CH, sides: 'we', board: 1 });
  // P3  east  ring -> control room
  room({ x0: 26, z0: -2, x1: 46, z1: 2, y: 0, h: CH, sides: 'ns', board: 1 });
  // P4  south  ring -> shaft head (two legs)
  room({ x0: -2, z0: 26, x1: 2, z1: 34, y: 0, h: CH, sides: 'we', board: 1 });
  room({
    x0: -2, z0: 34, x1: 45, z1: 38, y: 0, h: CH, sides: 'we', board: 1,
    // north wall only as far as the shaft, which brings its own
  });
  wallX(34, -2, 36, 0, CH, 0.5, MAT.wall, [DOOR(-2, 2, 0)], { board: 1 });
  wallX(38, -2, 45, 0, CH, 0.5, MAT.wall, [], { board: 1 });
  // P5  north-east  ring -> plant room
  room({ x0: 12, z0: -30, x1: 16, z1: -26, y: 0, h: CH, sides: 'we', board: 1 });
  room({ x0: 12, z0: -34, x1: 40, z1: -30, y: 0, h: CH, sides: 's', board: 1, floorT: 0.35 });
  wallX(-34, 12, 40, 0, CH, 0.5, MAT.wall, [DOOR(36, 40, 0)], { board: 1 });
  wallZ(12, -34, -30, 0, CH, 0.5, MAT.wall, [], { board: 1 });
  wallZ(40, -34, -30, 0, CH, 0.5, MAT.wall, [], { board: 1 });
  // P6  mess -> lockers -> ring, closing the loop on the west side
  room({ x0: -56, z0: 2, x1: -52, z1: 12, y: 0, h: CH, sides: 'we', board: 1 });
  room({ x0: -46, z0: 18, x1: -26, z1: 22, y: 0, h: CH, sides: 'ns', board: 1 });

  // --- R1 DECON AIRLOCK (spawn) --------------------------------------------
  room({
    x0: -30, z0: -58, x1: -16, z1: -44, y: 0, h: 3.2, wall: MAT.tileWall,
    s: [DOOR(-20, -16, 0)], board: false, t: 0.5,
  });

  // --- R2 LOCKER ROOM -------------------------------------------------------
  room({
    x0: -62, z0: 12, x1: -46, z1: 28, y: 0, h: 3.4,
    e: [DOOR(18, 22, 0)], n: [DOOR(-56, -52, 0)], board: 1,
  });

  // --- R3 MESS HALL ---------------------------------------------------------
  room({
    x0: -70, z0: -18, x1: -48, z1: 2, y: 0, h: 4.2,
    e: [DOOR(-2, 2, 0)], s: [DOOR(-56, -52, 0)], board: 1, boardMax: 4.4,
  });

  // --- R4 CONTROL ROOM ------------------------------------------------------
  room({
    x0: 46, z0: -24, x1: 70, z1: 0, y: 0, h: 4.4,
    w: [DOOR(-4, 0, 0)], board: 1, boardMax: 4.6,
  });

  // --- R5 PLANT ROOM "SEC-07" ----------------------------------------------
  room({
    x0: 30, z0: -50, x1: 48, z1: -34, y: 0, h: 4.6,
    s: [DOOR(36, 40, 0)],
    w: [{ from: -46, to: -42, y0: 0, y1: 2.6 }],   // diagonal service tunnel
    board: 1, boardMax: 4.8,
  });

  // ---------------------------------------------------------------------------
  // 4b. STRATUM A DRESSING
  // ---------------------------------------------------------------------------

  // --- decon airlock: hanging plastic strip curtains, showers, stencils -----
  const curtainMat = M.solid({
    color: 0xbfc9c4, roughness: 0.35, transparent: true, opacity: 0.34,
    side: THREE.DoubleSide,
  });
  const curtains = [];
  for (const [cz, cx0] of [[-52.5, -29.4], [-47.5, -29.4]]) {
    const bar = P.boxC(13.4, 0.12, 0.12, MAT.iron, { shadow: false });
    bar.position.set(-23, 2.5, cz);
    G_DEC_A.add(bar);
    for (let i = 0; i < 46; i++) {
      const s = P.boxC(0.28, 2.3, 0.012, curtainMat, { shadow: false, collide: false });
      s.position.set(cx0 + i * 0.29, 1.35, cz);
      s.rotation.y = rDetail.range(-0.06, 0.06);
      s.userData.phase = rDetail.range(0, 6.28);
      s.userData.baseZ = cz;
      curtains.push(s);
      G_LIVE.add(s);
    }
  }
  for (const sx of [-28.6, -17.4]) {
    for (const sz of [-55, -50, -46]) {
      const head = P.cyl(0.11, 0.06, 0.16, MET.dark, { seg: 10, collide: false, shadow: false });
      head.position.set(sx, 2.85, sz);
      G_DEC_A.add(head);
      const drop = P.cyl(0.035, 0.035, 0.5, MET.pipe, { seg: 6, collide: false, shadow: false });
      drop.position.set(sx, 2.85, sz);
      G_DEC_A.add(drop);
    }
  }
  G_DEC_A.add(pressureDoor(-20.1, 0, -44, 0, 0.85));
  G_DEC_A.add(pressureDoor(-16, 0, -26.2, Math.PI, 0.8));
  G_DEC_A.add(pressureDoor(-26.2, 0, -2, -Math.PI / 2, 0.9));
  G_DEC_A.add(pressureDoor(26.2, 0, 2, Math.PI / 2, 0.75));
  G_DEC_A.add(pressureDoor(-2, 0, 26.2, 0, 0.9));

  // --- locker room ----------------------------------------------------------
  const lockerMat = M.surface('metalPanel', { color: 0x2c4a4c, repeat: 1, size: 256, panels: 2, roughness: 0.5 });
  const lockerRows = [
    [-60.4, 13.2, 0], [-56.0, 13.2, 0], [-51.6, 13.2, 0],
    [-60.4, 26.6, Math.PI], [-56.0, 26.6, Math.PI],
    [-47.4, 16.0, -Math.PI / 2], [-47.4, 20.8, -Math.PI / 2],
  ];
  for (const [lx, lz, lr] of lockerRows) {
    const bank = P.lockers(5, lockerMat);
    bank.position.set(lx, 0, lz);
    bank.rotation.y = lr;
    G_SOLID.add(bank);
  }
  // a free-standing back-to-back island, doors hanging open
  for (const [lx, lz, lr] of [[-55, 20.4, 0], [-55, 21.4, Math.PI]]) {
    const bank = P.lockers(4, lockerMat);
    bank.position.set(lx, 0, lz);
    bank.rotation.y = lr;
    G_SOLID.add(bank);
  }
  for (let i = 0; i < 3; i++) {
    const b = P.boxC(2.2, 0.42, 0.5, MAT.iron, { shadow: false });
    b.position.set(-53 + i * 0.1, 0.42, 16 + i * 3.2);
    b.rotation.y = rClutter.range(-0.1, 0.1);
    G_SOLID.add(b);
  }

  // --- mess hall ------------------------------------------------------------
  const messTop = M.surface('metalPanel', { color: 0x545a52, repeat: 1, size: 256, panels: 2, roughness: 0.5 });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const t = P.table(3.2, 0.76, 1.0, messTop);
      t.position.set(-65 + c * 8, 0, -14 + r * 5.5);
      t.rotation.y = rClutter.range(-0.05, 0.05);
      G_SOLID.add(t);
      for (let s = 0; s < 4; s++) {
        const ch = P.chair(M.solid({ color: 0x2b3239, roughness: 0.8 }));
        ch.position.set(-65 + c * 8 - 1.1 + (s % 2) * 2.2, 0, -14 + r * 5.5 + (s < 2 ? -1.0 : 1.0));
        ch.rotation.y = (s < 2 ? 0 : Math.PI) + rClutter.range(-0.35, 0.35);
        if (rClutter.chance(0.18)) ch.rotation.y += 1.2;
        G_SOLID.add(ch);
      }
    }
  }
  // serving counter + urns
  const counter = P.boxC(9, 1.05, 0.9, MAT.iron, { shadow: false });
  counter.position.set(-64, 0.525, 0.5);
  G_SOLID.add(counter);
  for (let i = 0; i < 4; i++) {
    const urn = P.cyl(0.24, 0.26, 0.6, MET.dark, { seg: 12, collide: false, shadow: false });
    urn.position.set(-67.5 + i * 2.1, 1.05, 0.4);
    G_DEC_A.add(urn);
  }
  for (let i = 0; i < 5; i++) {
    const tray = P.boxC(0.5, 0.04, 0.36, M.solid({ color: 0x5c3b2a, roughness: 0.9 }), { shadow: false });
    tray.position.set(-66 + rClutter.range(-1.5, 5), 0.79, -13 + rClutter.range(0, 11));
    tray.rotation.y = rClutter.range(0, 3);
    G_DEC_A.add(tray);
  }

  // --- control room: banks of screens all scrolling the same glyphs ---------
  const glyphMat = M.painted(256, 512, (c2, W, H) => {
    c2.fillStyle = '#03080a'; c2.fillRect(0, 0, W, H);
    const rg = R.fork('glyph');
    c2.font = 'bold 15px monospace';
    for (let y = 12; y < H; y += 17) {
      let line = '';
      const n = rg.int(18, 26);
      for (let i = 0; i < n; i++) line += rg.pick('0123456789ABCDEF·▮▯/\\|-_=<>'.split(''));
      c2.fillStyle = rg.chance(0.1) ? '#ff5a3a' : (rg.chance(0.2) ? '#8ef7ff' : '#2fd6b0');
      c2.globalAlpha = rg.range(0.45, 1.0);
      c2.fillText(line, 6, y);
    }
    c2.globalAlpha = 1;
    c2.fillStyle = '#39ffd0';
    c2.font = 'bold 22px monospace';
    c2.fillText('L0_SUBTERRENE_RING', 8, 30);
    c2.fillText('SEC-07  COOLANT  OK', 8, 268);
  }, { transparent: false, emissive: 0x2ad8c8, emissiveIntensity: 2.4, roughness: 0.35 });
  glyphMat.map.wrapS = glyphMat.map.wrapT = THREE.RepeatWrapping;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const d = P.deskComputer({ screen: 0x2ad8c8 });
      d.position.set(50.5 + c * 4.6, 0, -20 + r * 7);
      d.rotation.y = Math.PI + rClutter.range(-0.04, 0.04);
      if (d.userData.screen) d.userData.screen.material = glyphMat;
      G_SOLID.add(d);
      const ch = P.chair(M.solid({ color: 0x22282e, roughness: 0.8 }));
      ch.position.set(50.5 + c * 4.6 + rClutter.range(-0.4, 0.4), 0, -20 + r * 7 - 1.1);
      ch.rotation.y = rClutter.range(-0.6, 0.6);
      G_SOLID.add(ch);
    }
  }
  // mimic board on the back wall: big screen + blinking LED array
  const mimic = P.boxC(7.2, 2.6, 0.14, glyphMat, { shadow: false });
  mimic.position.set(58, 2.6, -23.4);
  G_LIVE.add(mimic);
  const ledMats = [EM.ledA, EM.ledB, EM.ledC, EM.ledD];
  for (let i = 0; i < 28; i++) {
    const led = P.boxC(0.12, 0.12, 0.05, ledMats[i % 4], { shadow: false, collide: false });
    led.position.set(52 + (i % 14) * 0.92, 1.0 + Math.floor(i / 14) * 0.34, -23.4);
    G_LIVE.add(led);
  }
  for (let i = 0; i < 3; i++) {
    const rack = P.machine(1.6, 2.2, 0.9, 300 + i);
    rack.position.set(68.6, 0, -18 + i * 6);
    rack.rotation.y = -Math.PI / 2;
    G_SOLID.add(rack);
  }

  // --- plant room -----------------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const m = P.machine(2.6, 2.4, 1.6, 500 + i);
    m.position.set(33.5 + i * 3.6, 0, -47);
    G_SOLID.add(m);
  }
  for (let i = 0; i < 6; i++) {
    const b = P.barrel(0.34, 0.95, MAT.rust);
    b.position.set(44 + rClutter.range(-2.4, 2.4), 0, -38 + rClutter.range(-2.4, 2.4));
    b.rotation.y = rClutter.range(0, 3);
    G_SOLID.add(b);
  }
  const rack1 = P.shelfRack(3, 3, 2.4, 1.1, 1.8, M.solid({ color: 0x6a3a18, roughness: 0.7, metalness: 0.35 }));
  rack1.position.set(38, 0, -35.4);
  G_SOLID.add(rack1);
  for (let i = 0; i < 5; i++) {
    const cr = P.crate(0.9, MAT.corr);
    cr.position.set(31.6 + rClutter.range(0, 1.2), rClutter.chance(0.3) ? 0.9 : 0, -42 + i * 1.3);
    cr.rotation.y = rClutter.range(0, 3);
    G_SOLID.add(cr);
  }

  // ===========================================================================
  // 5. THE DIAGONAL SERVICE TUNNEL  (Stratum A -> Stratum B, 17° descent)
  // ===========================================================================
  {
    const sx = 30, sz = -42, ex = 10.5, ez = -21;
    const dx = ex - sx, dz = ez - sz;
    const run = Math.hypot(dx, dz);
    const drop = -9;
    const ang = -Math.atan2(dz, dx);
    const pitch = Math.atan2(drop, run);
    const W = 4.0, HH = 2.9;
    const wrap = new THREE.Group();
    wrap.position.set(sx, 0, sz);
    wrap.rotation.y = ang;
    const L = Math.hypot(run, drop);
    // floor
    const fl = P.boxC(L + 0.6, 0.5, W, MAT.floor, { shadow: false });
    fl.position.set(run / 2, drop / 2 - 0.25, 0);
    fl.rotation.z = pitch;
    wrap.add(fl);
    // ceiling
    const cl = P.boxC(L + 0.6, 0.4, W, MAT.ceil, { shadow: false });
    cl.position.set(run / 2, drop / 2 + HH + 0.2, 0);
    cl.rotation.z = pitch;
    wrap.add(cl);
    // side walls
    for (const sgn of [-1, 1]) {
      const w = P.boxC(L + 0.6, HH + 0.6, 0.5, MAT.wall, { shadow: false });
      w.position.set(run / 2, drop / 2 + HH / 2, sgn * (W / 2 + 0.25));
      w.rotation.z = pitch;
      wrap.add(w);
    }
    G_SOLID.add(wrap);
    // cyan handrail down one side + a cable tray overhead, as decor
    const dwrap = new THREE.Group();
    dwrap.position.copy(wrap.position);
    dwrap.rotation.y = ang;
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      const p = P.boxC(0.07, 1.0, 0.07, MAT.iron, { shadow: false });
      p.position.set(run * t, drop * t + 0.5, -W / 2 + 0.25);
      dwrap.add(p);
    }
    const rail = P.boxC(L, 0.08, 0.08, MAT.iron, { shadow: false });
    rail.position.set(run / 2, drop / 2 + 1.0, -W / 2 + 0.25);
    rail.rotation.z = pitch;
    dwrap.add(rail);
    const tray = P.boxC(L, 0.1, 0.55, MAT.rust, { shadow: false });
    tray.position.set(run / 2, drop / 2 + HH - 0.25, W / 2 - 0.6);
    tray.rotation.z = pitch;
    dwrap.add(tray);
    G_DEC_A.add(dwrap);
    // strip lights along the descent — the last of the cyan before the red
    const lwrap = new THREE.Group();
    lwrap.position.copy(wrap.position);
    lwrap.rotation.y = ang;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const s = P.boxC(1.6, 0.05, 0.16, EM.cyanStrip, { shadow: false, collide: false });
      s.position.set(run * t, drop * t + HH - 0.1, 0);
      s.rotation.z = pitch;
      lwrap.add(s);
    }
    G_LIVE.add(lwrap);
  }

  // ===========================================================================
  // 6. THE DESCENT — stair shaft (L) + freight elevator shaft (R)
  //    Shaft L:  x 36 .. 45.5,  z 20 .. 34   switchback, y  0 -> -20
  //    Shaft R:  x 45.5 .. 56,  z 22 .. 32   caged ladder + stopped car
  // ===========================================================================
  const SH_TOP = 4.6, SH_BOT = -20;

  // shaft L shell
  slab(36, 20, 45.5, 34, SH_BOT, MAT.floor);
  lid(36, 20, 45.5, 34, SH_TOP, MAT.ceil);
  wallZ(36, 20, 34, SH_BOT, SH_TOP - SH_BOT, 0.6, MAT.wall, [
    { from: 20.5, to: 23.3, y0: -9, y1: -6.6 },       // to the reactor hall
    { from: 24, to: 28, y0: SH_BOT, y1: SH_BOT + 2.6 }, // to The Well
  ], { board: true, boardMax: 8 });
  wallX(20, 36, 45.5, SH_BOT, SH_TOP - SH_BOT, 0.6, MAT.wall, [], { board: 1, boardMax: 8 });
  wallX(34, 36, 45.5, SH_BOT, SH_TOP - SH_BOT, 0.6, MAT.wall,
    [DOOR(38, 42, 0)], { board: 1, boardMax: 8 });
  // shared wall between the two shafts
  wallZ(45.5, 20, 34, SH_BOT, SH_TOP - SH_BOT, 0.6, MAT.wall, [
    DOOR(24, 28, 0),
    { from: 26, to: 30, y0: SH_BOT, y1: SH_BOT + 2.6 },
  ], { board: true, boardMax: 8 });

  // shaft R shell
  slab(45.5, 22, 56, 32, SH_BOT, MAT.floor);
  lid(45.5, 22, 56, 32, SH_TOP, MAT.ceil);
  wallZ(56, 22, 32, SH_BOT, SH_TOP - SH_BOT, 0.6, MAT.rock, [], { board: false });
  wallX(22, 45.5, 56, SH_BOT, SH_TOP - SH_BOT, 0.6, MAT.rock, []);
  wallX(32, 45.5, 56, SH_BOT, SH_TOP - SH_BOT, 0.6, MAT.rock, []);

  // --- switchback stair: landings alternate S(top) / N, 7 flights -----------
  {
    const runA = 38.4, runB = 43.0, wFlight = 3.9;
    const zS0 = 31.5, zS1 = 33.7, zN0 = 20.3, zN1 = 23.5;
    const levels = [0, -3, -6, -9, -12, -15, -18, -20];
    for (let i = 0; i < levels.length; i++) {
      const south = (i % 2) === 0;
      const y = levels[i];
      if (y > SH_BOT + 0.01) {
        const land = P.boxC(8.6, 0.32, south ? (zS1 - zS0) : (zN1 - zN0), MAT.iron, { shadow: false });
        land.position.set(41.7, y - 0.16, south ? (zS0 + zS1) / 2 : (zN0 + zN1) / 2);
        G_SOLID.add(land);
        railLine(37.4, south ? zS1 - 0.1 : zN0 + 0.1, 46.0, south ? zS1 - 0.1 : zN0 + 0.1, y, G_DEC_B, { collide: false });
      }
      if (i === levels.length - 1) break;
      const x = (i % 2 === 0) ? runB : runA;
      const from = south ? zS0 : zN1;
      const to = south ? zN1 : zS0;
      stairFlight(x, from, y, x, to, levels[i + 1], wFlight, G_DEC_B, MAT.iron);
      // open side of each flight gets a rail
      railLine(x + wFlight / 2 * (i % 2 === 0 ? -1 : 1), from, x + wFlight / 2 * (i % 2 === 0 ? -1 : 1), to,
        y - 0.4, G_DEC_B, { collide: false, h: 1.4 });
    }
    // stairwell void guard rails so you cannot walk off a landing edge
    for (const y of levels) {
      if (y <= SH_BOT + 0.01) continue;
      proxy(0.2, 1.3, 3.4, 40.7, y + 0.65, 27, 0);
      proxy(0.2, 1.3, 3.4, 42.7, y + 0.65, 27, 0);
    }
  }

  // --- freight elevator: stopped car you climb over -------------------------
  {
    // grated ledge at y=0 just inside shaft R
    const ledge = P.boxC(3.0, 0.28, 7.0, MAT.iron, { shadow: false });
    ledge.position.set(47.0, -0.14, 26.5);
    G_SOLID.add(ledge);
    railLine(48.5, 23.2, 48.5, 25.6, 0, G_DEC_B);
    railLine(48.5, 27.6, 48.5, 29.8, 0, G_DEC_B);
    railLine(45.9, 23.1, 48.5, 23.1, 0, G_DEC_B);
    railLine(45.9, 29.9, 48.5, 29.9, 0, G_DEC_B);

    // the car: roof at -9.6, floor at -12.2, door hanging open on the +X face
    const carY = -12.2, carH = 2.6;
    slab(46.2, 23.8, 52.2, 30.2, carY + 0.2, MAT.iron, 0.2);
    wallX(23.8, 46.2, 52.2, carY, carH, 0.14, MAT.corr, []);
    wallX(30.2, 46.2, 52.2, carY, carH, 0.14, MAT.corr, []);
    wallZ(46.2, 23.8, 30.2, carY, carH, 0.14, MAT.corr, []);
    wallZ(52.2, 23.8, 30.2, carY, carH, 0.14, MAT.corr,
      [{ from: 25.4, to: 28.6, y0: carY, y1: carY + 2.2 }]);
    // roof with an open hatch
    lid(46.2, 23.8, 52.2, 26.0, carY + carH, MAT.iron, 0.22);
    lid(46.2, 28.0, 52.2, 30.2, carY + carH, MAT.iron, 0.22);
    lid(46.2, 26.0, 48.4, 28.0, carY + carH, MAT.iron, 0.22);
    // hoist gear + slack cables above the car
    const gear = P.cyl(0.55, 0.55, 0.4, MET.dark, { seg: 14, collide: false, shadow: false });
    gear.rotation.z = Math.PI / 2;
    gear.position.set(49.2, 3.4, 27);
    G_DEC_B.add(gear);
    for (const cz of [26.2, 27.8]) {
      const cable = P.cyl(0.035, 0.035, 12.6, MET.dark, { seg: 5, collide: false, shadow: false });
      cable.position.set(49.2, -9.4, cz);
      G_DEC_B.add(cable);
    }
    // caged ladders: ledge -> car roof, car roof -> pit floor
    const lad1 = P.ladder(9.6, MAT.rust); lad1.position.set(48.3, -9.6, 26.6); lad1.rotation.y = Math.PI;
    G_SOLID.add(lad1);
    const lad2 = P.ladder(10.4, MAT.rust); lad2.position.set(53.4, -20, 27.0); lad2.rotation.y = Math.PI;
    G_SOLID.add(lad2);
    for (let y = -19; y < 0; y += 0.9) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 5, 12, Math.PI * 1.3), MAT.rust);
      hoop.rotation.y = Math.PI / 2;
      hoop.position.set(y < -9.6 ? 53.4 : 48.3, y, y < -9.6 ? 27.0 : 26.6);
      G_DEC_B.add(hoop);
    }
    // guide rails running the full shaft
    for (const gx of [46.6, 51.8]) {
      const gr = P.boxC(0.16, 24, 0.16, MET.dark, { shadow: false, collide: false });
      gr.position.set(gx, -8, 27);
      G_DEC_B.add(gr);
    }
  }

  // ===========================================================================
  // 7. STRATUM B — THE REACTOR HALL  (y = -9, 40 x 40 x 22)
  // ===========================================================================
  const BY = -9;

  // --- floor + the connecting corridor from the stair shaft -----------------
  slab(-21, -21, 21, 21, BY, MAT.floor);
  // leg 1: shaft -> south-east
  room({
    x0: 21, z0: 20.5, x1: 36, z1: 24.5, y: BY, h: 3.0, sides: 'nsw',
    n: [{ from: 21, to: 25, y0: BY, y1: BY + 2.6 }], board: 1,
  });
  // leg 2: north along the hall's east flank
  room({
    x0: 21, z0: 8, x1: 25, z1: 20.5, y: BY, h: 3.0, sides: 'ne', board: 1,
  });

  // --- the barrel vault -----------------------------------------------------
  {
    const vg = new THREE.CylinderGeometry(20, 20, 41, 48, 1, true, Math.PI, Math.PI);
    vg.rotateZ(-Math.PI / 2);
    vg.scale(1, 0.3, 1);
    vg.translate(0, 7, 0);
    const vaultMat = M.surface('concrete', {
      color: 0x22262c, repeat: 14, size: 512, seed: 13, side: THREE.DoubleSide,
    });
    const vault = new THREE.Mesh(vg, vaultMat);
    vault.userData.collide = false;
    vault.castShadow = false;
    vault.receiveShadow = true;
    ctx.addDecor(vault);

    // ribs springing from the wall heads — the "cathedral" read
    for (let i = 0; i < 9; i++) {
      const x = -18 + i * 4.5;
      for (let s = 0; s <= 22; s++) {
        const t = (s / 22) * Math.PI;
        const z = 19.4 * Math.cos(t);
        const y = 7 + 5.8 * Math.sin(t);
        const seg = P.boxC(0.9, 0.55, 0.5, MAT.wallBig, { shadow: false });
        seg.position.set(x, y, z);
        seg.rotation.x = -t + Math.PI / 2;
        G_DEC_B.add(seg);
      }
      // corbel where the rib lands
      for (const sz of [-19.6, 19.6]) {
        const cb = P.boxC(1.4, 1.1, 1.1, MAT.wallBig, { shadow: false });
        cb.position.set(x, 6.6, sz);
        G_DEC_B.add(cb);
      }
    }
    // clerestory slots high on the side walls — cyan bleed from service ducts
    for (let i = 0; i < 8; i++) {
      const x = -17.5 + i * 5;
      for (const sz of [-20.0, 20.0]) {
        const slot = P.boxC(2.6, 0.5, 0.12, EM.cyanSoft, { shadow: false, collide: false });
        slot.position.set(x, 5.6, sz);
        G_DEC_B.add(slot);
      }
    }
  }

  // --- wall piers: brutalist buttresses inside the hall ---------------------
  for (let i = 0; i < 7; i++) {
    const x = -18 + i * 6;
    for (const sz of [-19.2, 19.2]) {
      const pier = P.boxC(1.8, 15.6, 0.8, MAT.wallBig, { shadow: false });
      pier.position.set(x, BY + 7.8, sz);
      G_DEC_B.add(pier);
    }
  }
  for (let i = 0; i < 5; i++) {
    const z = -14 + i * 7;
    for (const sx of [-19.2, 19.2]) {
      const pier = P.boxC(0.8, 15.6, 1.8, MAT.wallBig, { shadow: false });
      pier.position.set(sx, BY + 7.8, z);
      G_DEC_B.add(pier);
    }
  }

  // --- THE CORE -------------------------------------------------------------
  const coreVentMat = M.emissive(0xff3410, 4.6, { base: 0x120503 });
  {
    const plinth = P.cyl(9.2, 9.6, 1.3, MAT.ironBig, { seg: 28 });
    plinth.position.set(0, BY, 0);
    G_SOLID.add(plinth);
    const lower = P.cyl(6.5, 6.8, 6.4, MAT.coreSkin, { seg: 28 });
    lower.position.set(0, BY + 1.3, 0);
    G_SOLID.add(lower);
    const upper = P.cyl(6.2, 6.5, 6.2, MAT.coreSkin, { seg: 28 });
    upper.position.set(0, BY + 7.7, 0);
    G_SOLID.add(upper);
    const taper = P.cyl(4.2, 6.2, 2.4, MAT.ironBig, { seg: 28, collide: false, shadow: false });
    taper.position.set(0, BY + 13.9, 0);
    G_DEC_B.add(taper);
    const mast = P.cyl(1.1, 1.5, 4.6, MAT.ironBig, { seg: 16, collide: false, shadow: false });
    mast.position.set(0, BY + 16.3, 0);
    G_DEC_B.add(mast);
    for (const ry of [1.4, 4.6, 7.9, 11.0, 13.6]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(6.75, 0.22, 8, 32), MAT.ironBig);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, BY + ry, 0);
      G_DEC_B.add(band);
    }
    // cooling vents — instanced, and the thing that pulses
    const ventGeo = new THREE.BoxGeometry(0.55, 0.9, 0.3);
    const vents = [];
    for (const vy of [2.6, 6.1, 9.4, 12.3]) {
      for (let i = 0; i < 24; i++) vents.push([i / 24 * Math.PI * 2, BY + vy]);
    }
    const ventInst = P.scatter(ventGeo, coreVentMat, vents.length, (i, d) => {
      const [a, y] = vents[i];
      d.position.set(Math.cos(a) * 6.55, y, Math.sin(a) * 6.55);
      d.rotation.y = -a;
    }, 91);
    ventInst.castShadow = false;
    G_LIVE.add(ventInst);
    // collision proxy: octagonal cage around the core
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      proxy(5.6, 17, 1.0, Math.cos(a) * 7.1, BY + 8.5, Math.sin(a) * 7.1, -a);
    }
    // coolant trunks diving into the plinth
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const trunk = P.cyl(0.5, 0.5, 3.4, MET.pipeHot, { seg: 10, collide: false, shadow: false });
      trunk.position.set(Math.cos(a) * 8.6, BY, Math.sin(a) * 8.6);
      G_DEC_B.add(trunk);
      const elbow = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.5, 8, 12, Math.PI / 2), MET.pipeHot);
      elbow.position.set(Math.cos(a) * 8.6, BY + 3.4, Math.sin(a) * 8.6);
      elbow.rotation.y = -a;
      elbow.rotation.x = Math.PI / 2;
      G_DEC_B.add(elbow);
    }
  }

  // --- catwalk levels -------------------------------------------------------
  const L1 = -4.5, L2 = 0, L3 = 5.5;

  function deck(cx, cz, w, d, y, rails = '', dec = G_DEC_B) {
    const m = P.boxC(w, 0.14, d, MAT.ironBig, { shadow: false });
    m.position.set(cx, y - 0.07, cz);
    G_SOLID.add(m);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    if (rails.includes('n')) railLine(x0, z0, x1, z0, y, dec);
    if (rails.includes('s')) railLine(x0, z1, x1, z1, y, dec);
    if (rails.includes('w')) railLine(x0, z0, x0, z1, y, dec);
    if (rails.includes('e')) railLine(x1, z0, x1, z1, y, dec);
    return m;
  }

  for (const y of [L1, L2, L3]) {
    // perimeter gantry
    deck(0, -17, 36, 2.0, y, 'n');
    deck(0, 17, 36, 2.0, y, 's');
    deck(-17, 0, 2.0, 32, y, 'w');
    deck(17, 0, 2.0, 32, y, 'e');
    // ring hugging the core
    deck(0, -8.5, 18.8, 1.8, y, 'ns');
    deck(0, 8.5, 18.8, 1.8, y, 'ns');
    deck(-8.5, 0, 1.8, 17.2, y, 'we');
    deck(8.5, 0, 1.8, 17.2, y, 'we');
    // radial spurs
    deck(0, -12.75, 1.6, 6.5, y, 'we');
    deck(0, 12.75, 1.6, 6.5, y, 'we');
    deck(-12.75, 0, 6.5, 1.6, y, 'ns');
    deck(12.75, 0, 6.5, 1.6, y, 'ns');
    // hangers back to the wall piers
    for (let i = 0; i < 6; i++) {
      const t = -15 + i * 6;
      for (const [hx, hz, hw, hd] of [[t, -18.6, 0.14, 1.4], [t, 18.6, 0.14, 1.4],
      [-18.6, t, 1.4, 0.14], [18.6, t, 1.4, 0.14]]) {
        const br = P.boxC(hw === 0.14 ? 0.14 : hw, 0.14, hd === 0.14 ? 0.14 : hd, MAT.iron, { shadow: false });
        br.position.set(hx, y - 0.3, hz);
        G_DEC_B.add(br);
        const diag = P.boxC(0.12, 1.5, 0.12, MAT.iron, { shadow: false });
        diag.position.set(hx, y - 0.9, hz);
        diag.rotation.z = 0.5;
        G_DEC_B.add(diag);
      }
    }
  }
  // support columns under L1
  for (const [cx, cz] of [[-17, -17], [17, -17], [-17, 17], [17, 17], [-17, 0], [17, 0], [0, -17], [0, 17]]) {
    const col = P.cyl(0.3, 0.34, 4.5, MAT.iron, { seg: 10, collide: false, shadow: false });
    col.position.set(cx, BY, cz);
    G_DEC_B.add(col);
    proxy(0.7, 4.5, 0.7, cx, BY + 2.25, cz);
  }
  // wall spurs at L2 — you walk straight out of the cyan corridor onto red iron
  deck(0, -19, 3.2, 2.2, L2, 'we');
  deck(0, 19, 3.2, 2.2, L2, 'we');
  deck(-19, 0, 2.2, 3.2, L2, 'ns');
  deck(19, 0, 2.2, 3.2, L2, 'ns');

  // --- stairs between levels ------------------------------------------------
  stairFlight(-14, 6, BY, -14, -6, L1, 2.4, G_DEC_B);
  deck(-15.6, -6.8, 4.6, 2.4, L1, 'n');
  stairFlight(14, -6, L1, 14, 6, L2, 2.4, G_DEC_B);
  deck(15.6, 6.8, 4.6, 2.4, L2, 's');
  stairFlight(-6, -14, L2, 8, -14, L3, 2.4, G_DEC_B);
  deck(9.6, -15.6, 2.4, 4.6, L3, 'e');
  // service ladders
  for (const [lx, lz, ly, lh, lr] of [
    [-16.2, -12, L1, 4.5, 0], [16.2, 12, L2, 5.5, Math.PI], [-3.5, -16.2, L3, 5.5, Math.PI / 2],
  ]) {
    const l = P.ladder(lh, MAT.rust);
    l.position.set(lx, ly - lh, lz);
    l.rotation.y = lr;
    G_SOLID.add(l);
  }

  // --- pipework converging on the core --------------------------------------
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2 + Math.PI / 4;
    const y = q % 2 === 0 ? BY + 2.6 : BY + 9.4;
    const run = P.pipes(11, 4, 0.34, MET.pipe);
    run.position.set(Math.cos(a) * 13.5, y, Math.sin(a) * 13.5);
    run.rotation.y = -a;
    G_DEC_B.add(run);
    // lagging on half the run
    for (let i = 0; i < 4; i++) {
      const lag = P.cyl(0.46, 0.46, 3.4, MET.lag, { seg: 10, collide: false, shadow: false });
      lag.rotation.z = Math.PI / 2;
      lag.position.set(Math.cos(a) * 16, y + (i - 1.5) * 0.02, Math.sin(a) * 16);
      lag.rotation.y = -a;
      G_DEC_B.add(lag);
    }
    // valve + wheel + gauge
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 16), MET.brass);
    wheel.position.set(Math.cos(a) * 12.2, y + 0.7, Math.sin(a) * 12.2);
    G_DEC_B.add(wheel);
    const stem = P.cyl(0.07, 0.07, 0.7, MET.brass, { seg: 6, collide: false, shadow: false });
    stem.position.set(Math.cos(a) * 12.2, y, Math.sin(a) * 12.2);
    G_DEC_B.add(stem);
    const gauge = P.cyl(0.16, 0.16, 0.06, EM.green, { seg: 12, collide: false, shadow: false });
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(Math.cos(a) * 11.4, y + 0.45, Math.sin(a) * 11.4);
    G_DEC_B.add(gauge);
  }
  // wall-hugging trunk mains + cable trays at three heights
  for (const y of [BY + 1.2, BY + 6.5, BY + 12.0]) {
    for (let s = 0; s < 4; s++) {
      const a = s * Math.PI / 2;
      const run = P.pipes(36, 3, 0.26, MET.pipe);
      run.position.set(Math.cos(a) * 19.2, y, Math.sin(a) * 19.2);
      run.rotation.y = -a - Math.PI / 2;
      G_DEC_B.add(run);
      const tray = P.boxC(36, 0.12, 0.6, MAT.rust, { shadow: false });
      tray.position.set(Math.cos(a) * 19.0, y + 0.9, Math.sin(a) * 19.0);
      tray.rotation.y = -a - Math.PI / 2;
      G_DEC_B.add(tray);
    }
  }

  // --- rotating hazard beacons ---------------------------------------------
  const beacons = [];
  for (const [bx, bz] of [[-16, -16], [16, 16], [16, -16]]) {
    const post = P.cyl(0.09, 0.09, 1.1, MET.dark, { seg: 8, collide: false, shadow: false });
    post.position.set(bx, L2 + 1.05, bz);
    G_DEC_B.add(post);
    const cage = P.cyl(0.32, 0.32, 0.42, MET.dark, { seg: 10, open: true, collide: false, shadow: false });
    cage.position.set(bx, L2 + 2.15, bz);
    G_DEC_B.add(cage);
    const dome = P.sphere(0.26, EM.amber, { seg: 12, collide: false, shadow: false });
    dome.position.set(bx, L2 + 2.3, bz);
    G_LIVE.add(dome);
    const sp = new THREE.SpotLight(0xffa424, 26, 30, Math.PI / 9, 0.55, 1.4);
    sp.position.set(bx, L2 + 2.36, bz);
    sp.target.position.set(bx + 8, L2 + 1.2, bz);
    ctx.light(sp, { shadow: false });
    beacons.push({ light: sp, x: bx, z: bz, phase: rDetail.range(0, 6.28) });
  }

  // --- steam vents ----------------------------------------------------------
  const steamCones = [];
  {
    const coneGeo = new THREE.ConeGeometry(0.9, 3.2, 12, 1, true);
    for (const [sx, sy, sz, sc] of [
      [-9.5, BY, -6.5, 1.0], [9.5, BY, 6.5, 1.2], [6.5, BY, -9.5, 0.85],
      [-6.5, BY, 9.5, 1.1], [-14.5, L1, 3, 0.7], [13.5, L1, -3, 0.75],
      [0, BY, -13.5, 0.9], [0, L2, 13.5, 0.6],
    ]) {
      const c = new THREE.Mesh(coneGeo, STEAM);
      c.position.set(sx, sy + 1.6, sz);
      c.userData.collide = false;
      c.castShadow = false;
      c.scale.setScalar(sc);
      c.userData.base = sc;
      c.userData.phase = rDetail.range(0, 6.28);
      c.userData.y0 = sy;
      G_LIVE.add(c);
      steamCones.push(c);
      // the nozzle it comes out of
      const noz = P.cyl(0.2, 0.28, 0.5, MET.pipeHot, { seg: 10, collide: false, shadow: false });
      noz.position.set(sx, sy, sz);
      G_DEC_B.add(noz);
    }
  }

  // --- hall floor dressing --------------------------------------------------
  for (let i = 0; i < 10; i++) {
    const b = P.barrel(0.34, 0.95, MAT.rust);
    b.position.set(rClutter.range(-18, 18), BY, rClutter.range(-18, 18));
    if (Math.hypot(b.position.x, b.position.z) < 10.5) { b.position.x *= 1.9; b.position.z *= 1.9; }
    b.rotation.y = rClutter.range(0, 3);
    G_SOLID.add(b);
  }
  for (let i = 0; i < 4; i++) {
    const c = P.container(6.06, [0x2c4a52, 0x4a2c2c, 0x3a3f2c, 0x2c3350][i], 700 + i);
    c.position.set([-16, 15.5, -15.5, 16][i], BY, [8, -9, -13, 12][i]);
    c.rotation.y = [0.1, Math.PI / 2 + 0.08, -0.05, Math.PI / 2 - 0.06][i];
    G_SOLID.add(c);
  }
  for (let i = 0; i < 6; i++) {
    const r = P.rubble(1.6, 11, MAT.rock, 800 + i);
    r.position.set(rClutter.range(-18, 18), BY, rClutter.range(-18, 18));
    G_DEC_B.add(r);
  }
  for (let i = 0; i < 3; i++) {
    const g = P.machine(2.2, 1.8, 1.4, 900 + i);
    g.position.set([-18.4, 18.4, -18.4][i], BY, [-6, 4, 14][i]);
    g.rotation.y = [Math.PI / 2, -Math.PI / 2, Math.PI / 2][i];
    G_SOLID.add(g);
  }
