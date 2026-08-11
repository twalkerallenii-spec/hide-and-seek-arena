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
  // Procedural texture generation is the most expensive thing an arena does on
  // the main thread, and surface() regenerates the whole set when only 'repeat'
  // changes. So: generate a handful of base sets and derive the other scales
  // and tints by cloning the material and re-tiling the shared canvas.
  function reScale(base, repeat, o = {}) {
    const m = base.clone();
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      if (base[k]) {
        m[k] = base[k].clone();
        m[k].repeat.set(repeat, repeat);
        m[k].needsUpdate = true;
      }
    }
    if (o.color !== undefined) m.color = new THREE.Color(o.color);
    if (o.roughness !== undefined) m.roughness = o.roughness;
    if (o.side !== undefined) m.side = o.side;
    return m;
  }

  const BASE = {
    concrete: M.surface('concrete', { color: 0x2b3138, repeat: 5, size: 256, seed: 7 }),
    metal: M.surface('metalPanel', { color: 0x232830, repeat: 3, size: 256, panels: 3, roughness: 0.55 }),
  };

  const MAT = {
    // wet black concrete at five scales, one texture generation between them
    wall: BASE.concrete,
    wallBig: reScale(BASE.concrete, 11, { color: 0xe4e8ec }),
    floor: reScale(BASE.concrete, 20, { color: 0xb4b8be }),
    ceil: reScale(BASE.concrete, 9, { color: 0x8f949a }),
    vault: reScale(BASE.concrete, 14, { color: 0xd0d4d8, side: THREE.DoubleSide }),
    // the Well is the same concrete, gone violet and wet
    wellWall: reScale(BASE.concrete, 4, { color: 0x9a86d8 }),
    wellFloor: reScale(BASE.concrete, 16, { color: 0x5d5480 }),
    // black iron
    iron: BASE.metal,
    ironBig: reScale(BASE.metal, 8, { color: 0xc0c4c8, roughness: 0.6 }),
    rock: M.surface('rock', { color: 0x1b1e23, repeat: 5, size: 128, seed: 31 }),
    rust: M.surface('rustMetal', { color: 0x39312c, rust: 0x6a3316, repeat: 2, size: 128, seed: 5 }),
    corr: M.surface('corrugated', { color: 0x2c3238, repeat: 2, size: 128, ribs: 16 }),
    tileWall: M.surface('tile', { color: 0x53646b, grout: 0x161b1f, tiles: 10, repeat: 5, size: 128 }),
    coreSkin: M.surface('hexPanel', { color: 0x2a1c18, line: 0xff5a22, repeat: 5, size: 128, scale: 9 }),
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
  };

  const GLASS = M.glassCheap({ color: 0x16323c, opacity: 0.30 });
  const WATER = M.water({ color: 0x05040c, opacity: 0.95, transmission: 0, repeat: 14 });
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

  // Instanced-box bucket. Hundreds of railing posts, stair treads, vault rib
  // segments and hangers all collapse into one draw call per material.
  const IBOX = new Map();
  function iBox(material, w, h, d, x, y, z, ry = 0, rz = 0, rx = 0) {
    let a = IBOX.get(material);
    if (!a) IBOX.set(material, a = []);
    a.push([w, h, d, x, y, z, rx, ry, rz]);
  }
  function flushIBoxes() {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    let seed = 400;
    for (const [material, arr] of IBOX) {
      const inst = P.scatter(unit, material, arr.length, (i, d) => {
        const a = arr[i];
        d.position.set(a[3], a[4], a[5]);
        d.rotation.set(a[6], a[7], a[8]);
        d.scale.set(a[0], a[1], a[2]);
      }, seed++);
      inst.castShadow = false;
      ctx.addDecor(inst);
    }
  }

  /**
   * Bake a prop group into frozen decor plus one invisible AABB proxy, so a
   * locker bank costs zero draw calls and twelve collision triangles instead
   * of sixteen draw calls.
   */
  const _b3 = new THREE.Box3(), _sz = new THREE.Vector3(), _ct = new THREE.Vector3();
  function bake(obj, dec, o = {}) {
    obj.updateMatrixWorld(true);
    _b3.setFromObject(obj);
    _b3.getSize(_sz); _b3.getCenter(_ct);
    if (o.solid !== false && _sz.x > 0.05 && _sz.y > 0.05 && _sz.z > 0.05) {
      proxy(Math.max(0.12, _sz.x - (o.shrink ?? 0)), _sz.y,
        Math.max(0.12, _sz.z - (o.shrink ?? 0)), _ct.x, _ct.y, _ct.z);
    }
    dec.add(obj);
    return obj;
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
        boardFaces.push({ ax: bx, az: bz, bx: ax, bz: az, y0: ya, h: cap, off: t / 2 + 0.025 });
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
   * Industrial stair flight from (x0,z0,y0) to (x1,z1,y1). Treads, risers and
   * stringers go into the instanced-box bucket; collision is one invisible
   * ramp box, so a whole switchback costs nothing to draw and 12 tris to walk.
   */
  function stairFlight(x0, z0, y0, x1, z1, y1, width, dec, material) {
    const dx = x1 - x0, dz = z1 - z0;
    const run = Math.hypot(dx, dz);
    const rise = y1 - y0;
    const ang = -Math.atan2(dz, dx);
    const n = Math.max(6, Math.round(Math.abs(rise) / 0.19));
    const mtl = material ?? MAT.iron;
    const ux = dx / run, uz = dz / run;
    const px = -uz, pz = ux;                 // perpendicular, in XZ
    for (let i = 0; i < n; i++) {
      const tt = (i + 0.5) / n;
      const topY = y0 + rise * ((i + 1) / n);
      iBox(mtl, run / n + 0.02, 0.1, width, x0 + dx * tt, topY - 0.05, z0 + dz * tt, ang);
      const back = (rise < 0 ? -0.5 : 0.5) * (run / n);
      iBox(mtl, 0.05, Math.abs(rise) / n, width * 0.94,
        x0 + dx * tt + ux * back, topY - Math.abs(rise) / (2 * n) - 0.05,
        z0 + dz * tt + uz * back, ang);
    }
    const pitchZ = Math.atan2(rise, run);
    for (const sgn of [-1, 1]) {
      iBox(mtl, Math.hypot(run, rise), 0.34, 0.09,
        x0 + dx * 0.5 + px * sgn * width / 2, y0 + rise / 2 - 0.26,
        z0 + dz * 0.5 + pz * sgn * width / 2, ang, pitchZ);
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
    const n = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      iBox(mtl, 0.06, h, 0.06, x0 + dx * t, y + h / 2, z0 + dz * t);
    }
    iBox(mtl, len, 0.07, 0.06, x0 + dx * 0.5, y + h, z0 + dz * 0.5, ang);
    iBox(mtl, len, 0.045, 0.05, x0 + dx * 0.5, y + h * 0.52, z0 + dz * 0.5, ang);
    iBox(mtl, len, 0.12, 0.04, x0 + dx * 0.5, y + 0.07, z0 + dz * 0.5, ang);
    // Rails are visual by default — a collidable rail on a catwalk ring blocks
    // every stair landing and spur that lands on it. Only the shaft ledge, with
    // a twenty-metre drop behind it, gets a real barrier.
    if (o.collide === true) proxy(len, h + 0.2, 0.1, x0 + dx * 0.5, y + (h + 0.2) / 2, z0 + dz * 0.5, ang);
  }

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
  room({
    x0: 12, z0: -34, x1: 40, z1: -30, y: 0, h: CH, sides: 's', board: 1, floorT: 0.35,
    s: [DOOR(12, 16, 0)],
  });
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
    x0: 46, z0: -24, x1: 70, z1: 2, y: 0, h: 4.4,
    w: [DOOR(-2, 2, 0)], board: 1, boardMax: 4.6,
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
  const curtainData = [];
  for (const [cz, cx0] of [[-52.5, -29.4], [-47.5, -29.4]]) {
    iBox(MAT.iron, 13.4, 0.12, 0.12, -23, 2.5, cz);
    for (let i = 0; i < 46; i++) {
      curtainData.push({
        x: cx0 + i * 0.29, y: 1.35, z: cz,
        ry: rDetail.range(-0.06, 0.06), phase: rDetail.range(0, 6.28),
      });
    }
  }
  const curtainMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.28, 2.3, 0.012), curtainMat, curtainData.length);
  curtainMesh.castShadow = false;
  curtainMesh.userData.collide = false;
  curtainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G_LIVE.add(curtainMesh);
  const _cdum = new THREE.Object3D();
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
    bake(bank, G_DEC_A);
  }
  // a free-standing back-to-back island, doors hanging open
  for (const [lx, lz, lr] of [[-55, 20.4, 0], [-55, 21.4, Math.PI]]) {
    const bank = P.lockers(4, lockerMat);
    bank.position.set(lx, 0, lz);
    bank.rotation.y = lr;
    bake(bank, G_DEC_A);
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
      bake(t, G_DEC_A);
      for (let s = 0; s < 4; s++) {
        const ch = P.chair(M.solid({ color: 0x2b3239, roughness: 0.8 }));
        ch.position.set(-65 + c * 8 - 1.1 + (s % 2) * 2.2, 0, -14 + r * 5.5 + (s < 2 ? -1.0 : 1.0));
        ch.rotation.y = (s < 2 ? 0 : Math.PI) + rClutter.range(-0.35, 0.35);
        if (rClutter.chance(0.18)) ch.rotation.y += 1.2;
        bake(ch, G_DEC_A);
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
  const glyphMat = M.painted(512, 256, (c2, W, H) => {
    c2.fillStyle = '#03080a'; c2.fillRect(0, 0, W, H);
    const rg = R.fork('glyph');
    c2.font = 'bold 15px monospace';
    for (let y = 12; y < H; y += 17) {
      let line = '';
      const n = rg.int(38, 52);
      for (let i = 0; i < n; i++) line += rg.pick('0123456789ABCDEF·▮▯/\\|-_=<>'.split(''));
      c2.fillStyle = rg.chance(0.1) ? '#ff5a3a' : (rg.chance(0.2) ? '#8ef7ff' : '#2fd6b0');
      c2.globalAlpha = rg.range(0.45, 1.0);
      c2.fillText(line, 6, y);
    }
    c2.globalAlpha = 1;
    c2.fillStyle = '#39ffd0';
    c2.font = 'bold 22px monospace';
    c2.fillText('L0_SUBTERRENE_RING', 8, 30);
    c2.fillText('SEC-07  COOLANT  OK', 8, 238);
  }, { transparent: false, emissive: 0x2ad8c8, emissiveIntensity: 2.4, roughness: 0.35 });
  glyphMat.map.wrapS = glyphMat.map.wrapT = THREE.RepeatWrapping;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const d = P.deskComputer({ screen: 0x2ad8c8 });
      d.position.set(50.5 + c * 4.6, 0, -20 + r * 7);
      d.rotation.y = Math.PI + rClutter.range(-0.04, 0.04);
      if (d.userData.screen) d.userData.screen.material = glyphMat;
      bake(d, G_DEC_A);
      const ch = P.chair(M.solid({ color: 0x22282e, roughness: 0.8 }));
      ch.position.set(50.5 + c * 4.6 + rClutter.range(-0.4, 0.4), 0, -20 + r * 7 - 1.1);
      ch.rotation.y = rClutter.range(-0.6, 0.6);
      bake(ch, G_DEC_A);
    }
  }
  // mimic board on the back wall: big screen + blinking LED array
  const mimic = P.boxC(7.2, 2.6, 0.14, glyphMat, { shadow: false });
  mimic.position.set(58, 2.6, -23.4);
  G_LIVE.add(mimic);
  const ledMats = [EM.ledA, EM.ledB, EM.ledC, EM.ledD];
  for (let k = 0; k < 4; k++) {
    const idx = [];
    for (let i = k; i < 28; i += 4) idx.push(i);
    const li = P.scatter(new THREE.BoxGeometry(0.12, 0.12, 0.05), ledMats[k], idx.length, (j, d) => {
      const i = idx[j];
      d.position.set(52 + (i % 14) * 0.92, 1.0 + Math.floor(i / 14) * 0.34, -23.4);
    }, 300 + k);
    li.castShadow = false;
    G_LIVE.add(li);
  }
  for (let i = 0; i < 3; i++) {
    const rack = P.machine(1.6, 2.2, 0.9, 300 + i);
    rack.position.set(68.6, 0, -18 + i * 6);
    rack.rotation.y = -Math.PI / 2;
    bake(rack, G_DEC_A);
  }

  // --- plant room -----------------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const m = P.machine(2.6, 2.4, 1.6, 500 + i);
    m.position.set(33.5 + i * 3.6, 0, -47);
    bake(m, G_DEC_A);
  }
  for (let i = 0; i < 6; i++) {
    const b = P.barrel(0.34, 0.95, MAT.rust);
    b.position.set(44 + rClutter.range(-2.4, 2.4), 0, -38 + rClutter.range(-2.4, 2.4));
    b.rotation.y = rClutter.range(0, 3);
    bake(b, G_DEC_A);
  }
  const rack1 = P.shelfRack(3, 3, 2.4, 1.1, 1.8, M.solid({ color: 0x6a3a18, roughness: 0.7, metalness: 0.35 }));
  rack1.position.set(38, 0, -35.4);
  bake(rack1, G_DEC_A);
  for (let i = 0; i < 5; i++) {
    const cr = P.crate(0.9, MAT.corr);
    cr.position.set(31.6 + rClutter.range(0, 1.2), rClutter.chance(0.3) ? 0.9 : 0, -42 + i * 1.3);
    cr.rotation.y = rClutter.range(0, 3);
    bake(cr, G_DEC_A);
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
    }
  }

  // --- freight elevator: stopped car you climb over -------------------------
  {
    // grated ledge at y=0 just inside shaft R
    const ledge = P.boxC(3.0, 0.28, 7.0, MAT.iron, { shadow: false });
    ledge.position.set(47.0, -0.14, 26.5);
    G_SOLID.add(ledge);
    railLine(48.5, 23.2, 48.5, 25.6, 0, G_DEC_B, { collide: true });
    railLine(48.5, 27.6, 48.5, 29.8, 0, G_DEC_B, { collide: true });
    railLine(45.9, 23.1, 48.5, 23.1, 0, G_DEC_B, { collide: true });
    railLine(45.9, 29.9, 48.5, 29.9, 0, G_DEC_B, { collide: true });

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
    bake(lad1, G_DEC_B);
    const lad2 = P.ladder(10.4, MAT.rust); lad2.position.set(53.4, -20, 27.0); lad2.rotation.y = Math.PI;
    bake(lad2, G_DEC_B);
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
    const vault = new THREE.Mesh(vg, MAT.vault);
    vault.userData.collide = false;
    vault.castShadow = false;
    vault.receiveShadow = true;
    ctx.addDecor(vault);

    // ribs springing from the wall heads — the "cathedral" read
    for (let i = 0; i < 9; i++) {
      const x = -18 + i * 4.5;
      for (let s = 0; s <= 20; s++) {
        const th = (s / 20) * Math.PI;
        iBox(MAT.wallBig, 0.9, 0.55, 0.62, x, 7 + 5.8 * Math.sin(th), 19.4 * Math.cos(th),
          0, 0, -th + Math.PI / 2);
      }
      for (const sz of [-19.6, 19.6]) iBox(MAT.wallBig, 1.4, 1.1, 1.1, x, 6.6, sz);
    }
    // clerestory slots high on the side walls — cyan bleed from service ducts
    for (let i = 0; i < 8; i++) {
      const x = -17.5 + i * 5;
      for (const sz of [-20.0, 20.0]) iBox(EM.cyanSoft, 2.6, 0.5, 0.12, x, 5.6, sz);
    }
  }

  // --- wall piers: brutalist buttresses inside the hall ---------------------
  for (let i = 0; i < 7; i++) {
    const x = -18 + i * 6;
    for (const sz of [-19.2, 19.2]) iBox(MAT.wallBig, 1.8, 15.6, 0.8, x, BY + 7.8, sz);
  }
  for (let i = 0; i < 5; i++) {
    const z = -14 + i * 7;
    for (const sx of [-19.2, 19.2]) iBox(MAT.wallBig, 0.8, 15.6, 1.8, sx, BY + 7.8, z);
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
    deck(0, -17, 36, 2.0, y);
    deck(0, 17, 36, 2.0, y);
    deck(-17, 0, 2.0, 32, y);
    deck(17, 0, 2.0, 32, y);
    // ...railed on both edges, broken where the radial spurs land
    for (const zEdge of [-18, -16, 16, 18]) {
      railLine(-18, zEdge, -1.8, zEdge, y, G_DEC_B);
      railLine(1.8, zEdge, 18, zEdge, y, G_DEC_B);
    }
    for (const xEdge of [-18, -16, 16, 18]) {
      railLine(xEdge, -16, xEdge, -1.8, y, G_DEC_B);
      railLine(xEdge, 1.8, xEdge, 16, y, G_DEC_B);
    }
    // ring hugging the core (open on the spur side, kick-plate only)
    deck(0, -8.5, 18.8, 1.8, y);
    deck(0, 8.5, 18.8, 1.8, y);
    deck(-8.5, 0, 1.8, 17.2, y);
    deck(8.5, 0, 1.8, 17.2, y);
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
        iBox(MAT.iron, hw, 0.14, hd, hx, y - 0.3, hz);
        iBox(MAT.iron, 0.12, 1.5, 0.12, hx, y - 0.9, hz, 0, 0.5);
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
    bake(l, G_DEC_B);
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
  for (const y of [BY + 2.0]) {
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
    bake(b, G_DEC_B);
  }
  for (let i = 0; i < 4; i++) {
    const c = P.container(6.06, [0x2c4a52, 0x4a2c2c, 0x3a3f2c, 0x2c3350][i], 700 + i);
    c.position.set([-16, 15.5, -15.5, 16][i], BY, [8, -9, -13, 12][i]);
    c.rotation.y = [0.1, Math.PI / 2 + 0.08, -0.05, Math.PI / 2 - 0.06][i];
    bake(c, G_DEC_B);
  }
  for (let i = 0; i < 4; i++) {
    const r = P.rubble(1.6, 9, MAT.rock, 800 + i);
    r.position.set(rClutter.range(-18, 18), BY, rClutter.range(-18, 18));
    G_DEC_B.add(r);
  }
  for (let i = 0; i < 3; i++) {
    const g = P.machine(2.2, 1.8, 1.4, 900 + i);
    g.position.set([-18.4, 18.4, -18.4][i], BY, [-6, 4, 14][i]);
    g.rotation.y = [Math.PI / 2, -Math.PI / 2, Math.PI / 2][i];
    bake(g, G_DEC_B);
  }

  // ===========================================================================
  // 8. STRATUM C — THE WELL  (y = -20)
  //    Reality lags. Light bends inward. Fifteen centimetres of black water.
  // ===========================================================================
  const CY = -20;

  // --- C0 sump vestibule (foot of the shaft) --------------------------------
  room({
    x0: 24, z0: 20, x1: 36, z1: 34, y: CY, h: 6.0, sides: 'nsw',
    wall: MAT.wellWall, floorMat: MAT.wellFloor,
    w: [{ from: 23.5, to: 30.5, y0: CY, y1: CY + 5.5 }],
    board: 1, boardMax: 6,
  });

  // --- C1 the narrowing corridor (real, tapered geometry) -------------------
  {
    const xA = 24, xB = -8, zc = 27;
    const hwA = 3.5, hwB = 1.1;         // half widths
    const hA = 5.5, hB = 2.4;           // heights
    slab(-8, 21, 24, 33, CY, MAT.wellFloor);
    // slanted side walls, single boxes each — true false-perspective
    wallRun(xA, zc + hwA, xB, zc + hwB, CY, 6.2, 0.6, MAT.wellWall, [], { board: 1, boardMax: 6 });
    wallRun(xB, zc - hwB, xA, zc - hwA, CY, 6.2, 0.6, MAT.wellWall, [], { board: 1, boardMax: 6 });
    // raked ceiling
    const run = xA - xB, dyC = hA - hB;
    const cw = new THREE.Group();
    cw.position.set((xA + xB) / 2, CY + (hA + hB) / 2, zc);
    const cbox = P.boxC(Math.hypot(run, dyC) + 0.4, 0.4, 8.4, MAT.ceil, { shadow: false });
    cbox.position.set(0, 0.2, 0);
    cbox.rotation.z = Math.atan2(dyC, run);
    cw.add(cbox);
    G_SOLID.add(cw);
    // seal the leftover slots either side of the taper
    wallX(21.2, -8, 24, CY, 6.2, 0.5, MAT.wellWall, []);
    wallX(32.8, -8, 24, CY, 6.2, 0.5, MAT.wellWall, []);
    // wall lamps that also shrink, to sell the trick
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = xA + (xB - xA) * t;
      const hw = hwA + (hwB - hwA) * t;
      const h = hA + (hB - hA) * t;
      const s = 1 - t * 0.62;
      const lamp = P.boxC(0.5 * s, 0.14 * s, 0.08, EM.violet, { shadow: false, collide: false });
      lamp.position.set(x, CY + h * 0.72, zc - hw + 0.35);
      G_DEC_C.add(lamp);
    }
  }

  // --- C2 the arch hall -----------------------------------------------------
  room({
    x0: -60, z0: 6, x1: -8, z1: 52, y: CY, h: 6.5, sides: 'nsew',
    wall: MAT.wellWall, floorMat: MAT.wellFloor,
    e: [{ from: 25.9, to: 28.1, y0: CY, y1: CY + 2.4 }],
    n: [{ from: -44, to: -40, y0: CY, y1: CY + 2.6 }],
    board: 1, boardMax: 6.5,
  });
  // twenty-five identical arches, receding
  const archProto = P.archway(4.6, 4.4, 1.3, MAT.wellWall);
  for (let cxi = 0; cxi < 5; cxi++) {
    for (let czi = 0; czi < 5; czi++) {
      const ax = -54 + cxi * 10.5;
      const az = 12 + czi * 9;
      const arch = archProto.clone();
      arch.position.set(ax, CY, az);
      G_DEC_C.add(arch);
      proxy(0.7, 4.6, 1.5, ax - 2.45, CY + 2.3, az);
      proxy(0.7, 4.6, 1.5, ax + 2.45, CY + 2.3, az);
    }
  }

  // --- C3 the door room -----------------------------------------------------
  room({
    x0: -60, z0: -34, x1: -20, z1: 0, y: CY, h: 5.5, sides: 'nsew',
    wall: MAT.wellWall, floorMat: MAT.wellFloor,
    s: [{ from: -44, to: -40, y0: CY, y1: CY + 2.6 }],
    board: 1, boardMax: 5.5,
  });
  room({
    x0: -44, z0: 0, x1: -40, z1: 6, y: CY, h: 2.9, sides: 'we',
    wall: MAT.wellWall, floorMat: MAT.wellFloor, board: 1,
  });
  // one door, standing free, with nothing behind it
  {
    const plinth = P.boxC(2.6, 0.18, 0.9, MAT.wellWall, { shadow: false });
    plinth.position.set(-40, CY + 0.09, -17);
    G_SOLID.add(plinth);
    const frame = P.door(1.1, 2.3, MAT.iron, MAT.wellWall);
    frame.position.set(-40, CY + 0.18, -17);
    frame.rotation.y = 0.22;
    frame.userData.open?.(0.16);
    G_SOLID.add(frame);
    const glow = P.boxC(1.3, 0.05, 0.05, EM.violet, { shadow: false, collide: false });
    glow.position.set(-40, CY + 2.6, -17);
    glow.rotation.y = 0.22;
    G_DEC_C.add(glow);
  }

  // --- black water ----------------------------------------------------------
  for (const [wx0, wz0, wx1, wz1] of [
    [-60, 6, -8, 52], [-60, -34, -20, 0], [-44, 0, -40, 6],
    [-8, 21.2, 24, 32.8], [24, 20, 36, 34], [36, 20, 45.5, 34], [45.5, 22, 56, 32],
  ]) {
    const w = P.ground(wx1 - wx0, wz1 - wz0, WATER, { collide: false });
    w.position.set((wx0 + wx1) / 2, CY + 0.15, (wz0 + wz1) / 2);
    w.castShadow = false;
    w.receiveShadow = false;
    ctx.addDecor(w);
  }
  // debris breaking the water surface
  for (let i = 0; i < 18; i++) {
    const r = P.rubble(0.8, 5, MAT.rock, 1200 + i);
    const zone = rWell.int(0, 2);
    if (zone === 0) r.position.set(rWell.range(-58, -10), CY, rWell.range(8, 50));
    else if (zone === 1) r.position.set(rWell.range(-58, -22), CY, rWell.range(-32, -2));
    else r.position.set(rWell.range(-6, 22), CY, rWell.range(24, 30));
    G_DEC_C.add(r);
  }
  // dead cabling hanging from the ceiling penetrations
  for (let i = 0; i < 16; i++) {
    const cx = rWell.range(-58, -10), cz = rWell.range(8, 50);
    const len = rWell.range(1.2, 4.4);
    const c = P.cyl(0.03, 0.035, len, MET.black, { seg: 5, collide: false, shadow: false });
    c.position.set(cx, CY + 6.5 - len, cz);
    G_DEC_C.add(c);
  }

  // ===========================================================================
  // 9. DETAIL PASS — board-formed concrete, wear, signage, strip lighting.
  //    Everything here is instanced: eight extra draw calls for the whole map.
  // ===========================================================================

  // --- 9a. shutter lines + tie-bolt holes -----------------------------------
  {
    const lines = [], holes = [];
    for (const f of boardFaces) {
      const dx = f.bx - f.ax, dz = f.bz - f.az;
      const len = Math.hypot(dx, dz);
      if (len < 1.2) continue;
      const ang = -Math.atan2(dz, dx);
      const nx = Math.sin(ang), nz = Math.cos(ang);
      const cx = (f.ax + f.bx) / 2 + nx * f.off;
      const cz = (f.az + f.bz) / 2 + nz * f.off;
      for (let y = f.y0 + 0.9; y < f.y0 + f.h - 0.15; y += 0.9) {
        lines.push([cx, y, cz, ang, len - 0.06]);
      }
      for (let d = 1.4; d < len - 0.4; d += 1.4) {
        const t = d / len;
        const hx = f.ax + dx * t + nx * (f.off + 0.01);
        const hz = f.az + dz * t + nz * (f.off + 0.01);
        for (let y = f.y0 + 1.35; y < f.y0 + f.h - 0.4; y += 2.7) holes.push([hx, y, hz, ang]);
      }
    }
    const lineGeo = new THREE.BoxGeometry(1, 0.055, 0.05);
    const lineMat = M.solid({ color: 0x0d1013, roughness: 0.95 });
    const li = P.scatter(lineGeo, lineMat, lines.length, (i, d) => {
      const a = lines[i];
      d.position.set(a[0], a[1], a[2]);
      d.rotation.y = a[3];
      d.scale.set(a[4], 1, 1);
    }, 11);
    li.castShadow = false;
    ctx.addDecor(li);

    const holeGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.06, 8);
    holeGeo.rotateX(Math.PI / 2);
    const holeMat = M.solid({ color: 0x090b0d, roughness: 1.0 });
    const hi = P.scatter(holeGeo, holeMat, holes.length, (i, d) => {
      const a = holes[i];
      d.position.set(a[0], a[1], a[2]);
      d.rotation.y = a[3];
    }, 12);
    hi.castShadow = false;
    ctx.addDecor(hi);

    // --- 9b. water staining + rust bleed, hung off the same faces ----------
    const stainMat = M.painted(64, 256, (c2, W, H) => {
      c2.clearRect(0, 0, W, H);
      const rg = R.fork('stain');
      for (let i = 0; i < 26; i++) {
        const x = rg.range(2, W - 2);
        const w = rg.range(1.5, 7);
        const g = c2.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(24,20,14,0.72)');
        g.addColorStop(rg.range(0.3, 0.7), 'rgba(46,36,22,0.34)');
        g.addColorStop(1, 'rgba(30,28,26,0)');
        c2.fillStyle = g;
        c2.fillRect(x, 0, w, H * rg.range(0.4, 1.0));
      }
      for (let i = 0; i < 5; i++) {
        const g = c2.createRadialGradient(rg.range(0, W), rg.range(0, H * 0.5), 1,
          rg.range(0, W), rg.range(0, H * 0.5), rg.range(8, 22));
        g.addColorStop(0, 'rgba(96,44,14,0.5)');
        g.addColorStop(1, 'rgba(96,44,14,0)');
        c2.fillStyle = g;
        c2.fillRect(0, 0, W, H);
      }
    }, { transparent: true, alphaTest: 0.03, roughness: 0.95, depthWrite: false });

    const stainGeo = new THREE.PlaneGeometry(1, 1);
    stainGeo.translate(0, -0.5, 0);
    const rs = R.fork('stainPlace');
    const usable = boardFaces.filter(f => Math.hypot(f.bx - f.ax, f.bz - f.az) > 3);
    const si = P.scatter(stainGeo, stainMat, 220, (i, d) => {
      if (!usable.length) return false;
      const f = usable[rs.int(0, usable.length - 1)];
      const dx = f.bx - f.ax, dz = f.bz - f.az;
      const len = Math.hypot(dx, dz);
      const ang = -Math.atan2(dz, dx);
      const t = rs.range(0.06, 0.94);
      const nx = Math.sin(ang), nz = Math.cos(ang);
      d.position.set(f.ax + dx * t + nx * (f.off + 0.03), f.y0 + f.h - 0.02,
        f.az + dz * t + nz * (f.off + 0.03));
      d.rotation.y = ang;
      d.scale.set(rs.range(0.6, 2.4), rs.range(1.0, Math.max(1.2, f.h * 0.9)), 1);
    }, 13);
    si.castShadow = false;
    si.receiveShadow = false;
    ctx.addDecor(si);
  }

  // --- 9c. efflorescence + cracked-floor cable weeds ------------------------
  {
    const weedGeo = new THREE.CylinderGeometry(0.018, 0.024, 1, 4);
    weedGeo.translate(0, 0.5, 0);
    const rw = R.fork('weeds');
    const wi = P.scatter(weedGeo, MET.black, 420, (i, d) => {
      const zone = rw.int(0, 3);
      let x, y, z;
      if (zone === 0) { // ring corridor
        const s = rw.int(0, 3);
        const a = rw.range(-24, 24);
        x = s === 0 ? a : s === 1 ? a : (s === 2 ? -23.4 : 23.4);
        z = s === 0 ? -23.4 : s === 1 ? 23.4 : a;
        if (Math.abs(x) < 21 && Math.abs(z) < 21) return false;
        y = 0;
      } else if (zone === 1) { x = rw.range(-19, 19); z = rw.range(-19, 19); y = BY; if (Math.hypot(x, z) < 10) return false; }
      else if (zone === 2) { x = rw.range(-58, -10); z = rw.range(8, 50); y = CY; }
      else { x = rw.range(-58, -22); z = rw.range(-32, -2); y = CY; }
      d.position.set(x, y, z);
      d.rotation.set(rw.range(-0.5, 0.5), rw.range(0, 6.28), rw.range(-0.5, 0.5));
      d.scale.setScalar(rw.range(0.3, 1.1));
      return true;
    }, 14);
    wi.castShadow = false;
    ctx.addDecor(wi);
  }

  // --- 9d. cyan strip lighting (Stratum A) ----------------------------------
  {
    const strips = [];
    const runX = (z, x0, x1, y, step = 6) => { for (let x = x0; x <= x1 + 0.01; x += step) strips.push([x, y, z, 0]); };
    const runZ = (x, z0, z1, y, step = 6) => { for (let z = z0; z <= z1 + 0.01; z += step) strips.push([x, y, z, Math.PI / 2]); };
    runX(-23.5, -24, 24, AH - 0.14);
    runX(23.5, -24, 24, AH - 0.14);
    runZ(-23.5, -18, 18, AH - 0.14);
    runZ(23.5, -18, 18, AH - 0.14);
    runX(0, -46, -28, CH - 0.14);            // P1
    runX(0, 28, 44, CH - 0.14);              // P3
    runZ(-18, -42, -28, CH - 0.14);          // P2
    runZ(0, 28, 32, CH - 0.14);              // P4a
    runX(36, 0, 44, CH - 0.14);              // P4b
    runX(-32, 14, 38, CH - 0.14);            // P5
    runZ(-54, 4, 10, CH - 0.14);             // P6a
    runX(20, -44, -28, CH - 0.14);           // P6b
    for (let i = 0; i < 6; i++) { strips.push([-66 + (i % 3) * 7, 4.0, -13 + Math.floor(i / 3) * 10, 0]); }
    for (let i = 0; i < 6; i++) { strips.push([-59 + (i % 3) * 5, 3.2, 15 + Math.floor(i / 3) * 8, 0]); }
    for (let i = 0; i < 8; i++) { strips.push([50 + (i % 4) * 6, 4.2, -19 + Math.floor(i / 4) * 12, 0]); }
    for (let i = 0; i < 6; i++) { strips.push([33 + (i % 3) * 6, 4.4, -46 + Math.floor(i / 3) * 8, 0]); }
    for (let i = 0; i < 4; i++) { strips.push([-27 + (i % 2) * 8, 3.0, -54 + Math.floor(i / 2) * 7, 0]); }
    strips.push([41, SH_TOP - 0.2, 26, 0], [41, SH_TOP - 0.2, 31, 0]);

    const sGeo = new THREE.BoxGeometry(2.6, 0.05, 0.2);
    const sInst = P.scatter(sGeo, EM.cyanStrip, strips.length, (i, d) => {
      const a = strips[i];
      d.position.set(a[0], a[1], a[2]);
      d.rotation.y = a[3];
    }, 15);
    sInst.castShadow = false;
    ctx.addDecor(sInst);
    const hGeo = new THREE.BoxGeometry(2.9, 0.12, 0.32);
    const hInst = P.scatter(hGeo, MAT.iron, strips.length, (i, d) => {
      const a = strips[i];
      d.position.set(a[0], a[1] + 0.08, a[2]);
      d.rotation.y = a[3];
    }, 16);
    hInst.castShadow = false;
    ctx.addDecor(hInst);
  }

  // --- 9e. painted wayfinding on the floor + hazard chevrons ----------------
  {
    const arrowMat = M.painted(256, 128, (c2, W, H) => {
      c2.clearRect(0, 0, W, H);
      c2.fillStyle = 'rgba(226,236,90,0.86)';
      c2.beginPath();
      c2.moveTo(210, 64); c2.lineTo(140, 22); c2.lineTo(140, 48);
      c2.lineTo(38, 48); c2.lineTo(38, 80); c2.lineTo(140, 80); c2.lineTo(140, 106);
      c2.closePath(); c2.fill();
    }, { transparent: true, alphaTest: 0.06, roughness: 0.95, depthWrite: false });
    const aGeo = new THREE.PlaneGeometry(2.6, 1.3);
    aGeo.rotateX(-Math.PI / 2);
    const arrows = [
      [-23.4, 0.03, -12, 0], [-23.4, 0.03, 6, Math.PI], [23.4, 0.03, -12, 0], [23.4, 0.03, 8, Math.PI],
      [-12, 0.03, -23.4, -Math.PI / 2], [10, 0.03, -23.4, Math.PI / 2], [-10, 0.03, 23.4, Math.PI / 2],
      [-36, 0.03, 0, Math.PI], [36, 0.03, 0, 0], [-18, 0.03, -34, -Math.PI / 2],
      [0, 0.03, 30, Math.PI / 2], [22, 0.03, 36, 0], [40, 0.03, 36, 0], [-36, 0.03, 20, Math.PI],
      [14, 0.03, -32, 0], [41, -19.97, 27, Math.PI], [16, -19.97, 27, Math.PI],
    ];
    const ai = P.scatter(aGeo, arrowMat, arrows.length, (i, d) => {
      const a = arrows[i];
      d.position.set(a[0], a[1], a[2]);
      d.rotation.y = a[3];
    }, 17);
    ai.castShadow = false;
    ctx.addDecor(ai);

    const chevMat = M.painted(128, 64, (c2, W, H) => {
      c2.fillStyle = '#181a12'; c2.fillRect(0, 0, W, H);
      c2.fillStyle = '#d3c24a';
      for (let i = -2; i < 8; i++) {
        c2.save();
        c2.beginPath();
        c2.moveTo(i * 20, H); c2.lineTo(i * 20 + 12, H); c2.lineTo(i * 20 + 12 + H, 0); c2.lineTo(i * 20 + H, 0);
        c2.closePath(); c2.fill();
        c2.restore();
      }
    }, { transparent: false, roughness: 0.9 });
    const cGeo = new THREE.BoxGeometry(1.6, 0.55, 0.06);
    const chevs = [];
    for (let i = 0; i < 7; i++) {
      chevs.push([-18 + i * 6, BY + 0.35, -18.7, 0], [-18 + i * 6, BY + 0.35, 18.7, Math.PI]);
    }
    for (let i = 0; i < 5; i++) {
      chevs.push([-18.7, BY + 0.35, -14 + i * 7, Math.PI / 2], [18.7, BY + 0.35, -14 + i * 7, -Math.PI / 2]);
    }
    chevs.push([-16, 0.35, -25.6, 0], [12, 0.35, -25.6, 0], [-25.6, 0.35, 20, Math.PI / 2]);
    const ci = P.scatter(cGeo, chevMat, chevs.length, (i, d) => {
      const a = chevs[i];
      d.position.set(a[0], a[1], a[2]);
      d.rotation.y = a[3];
    }, 18);
    ci.castShadow = false;
    ctx.addDecor(ci);
  }

  // --- 9e2. named fixtures that pair with a real light ----------------------
  {
    // the failing fluorescent in the west corridor
    for (const fx of [-39, -35]) {
      const hous = P.boxC(2.6, 0.14, 0.34, MAT.iron, { shadow: false });
      hous.position.set(fx, CH - 0.06, 0);
      G_DEC_A.add(hous);
      const tube = P.boxC(2.4, 0.06, 0.2, EM.flick, { shadow: false, collide: false });
      tube.position.set(fx, CH - 0.16, 0);
      G_LIVE.add(tube);
    }
    // tripod work lamps in the reactor hall — the only white light down there
    for (const [wx, wy, wz] of [[-14, L1 + 1.4, 8], [12, BY + 2.0, -12]]) {
      const stand = P.cyl(0.05, 0.09, 1.4, MET.dark, { seg: 8, collide: false, shadow: false });
      stand.position.set(wx, wy - 1.4, wz);
      G_DEC_B.add(stand);
      const head = P.cyl(0.3, 0.22, 0.3, MET.dark, { seg: 12, open: true, collide: false, shadow: false });
      head.position.set(wx, wy, wz);
      G_DEC_B.add(head);
      const lens = P.boxC(0.42, 0.05, 0.42, EM.white, { shadow: false, collide: false });
      lens.position.set(wx, wy + 0.02, wz);
      G_DEC_B.add(lens);
    }
    // red door lamps either side of every hall opening
    for (const [rx, rz] of [[-2.6, -20.1], [2.6, -20.1], [-2.6, 20.1], [2.6, 20.1],
    [-20.1, -2.6], [-20.1, 2.6], [20.1, -2.6], [20.1, 2.6]]) {
      const lamp = P.sphere(0.11, EM.red, { seg: 8, collide: false, shadow: false });
      lamp.position.set(rx, 2.5, rz);
      G_DEC_B.add(lamp);
    }
    // cyan status lamps in the decon airlock
    for (const [ax, az] of [[-29.6, -50], [-16.4, -50], [-23, -57.6]]) {
      const lamp = P.boxC(0.3, 0.3, 0.08, EM.cyan, { shadow: false, collide: false });
      lamp.position.set(ax, 2.4, az);
      lamp.rotation.y = az === -57.6 ? 0 : Math.PI / 2;
      G_DEC_A.add(lamp);
    }
  }

  // --- 9f. stencilled signage ----------------------------------------------
  function stencil(text, x, y, z, ry, height, o = {}) {
    const s = P.sign(text, {
      color: o.color ?? 0xc9d6dd,
      background: o.background,
      fontSize: o.fontSize ?? 110,
      height,
      emissive: o.emissive,
      emissiveIntensity: o.emissiveIntensity ?? 1.4,
      frame: o.frame ?? false,
    });
    s.position.set(x, y, z);
    s.rotation.y = ry;
    (o.group ?? G_DEC_A).add(s);
    return s;
  }
  stencil('UNDERCROFT', -0.0, 2.9, -25.6, 0, 1.05, { color: 0x8fa7b4 });
  stencil('SEC-07', 20, 2.6, -25.6, 0, 0.8, { color: 0x8fa7b4 });
  stencil('L0 · SUBTERRENE RING', -23.4, 2.7, 6, Math.PI / 2, 0.55, { color: 0x7d94a2 });
  stencil('COOLANT — LEVEL 2', 23.4, 2.7, -8, -Math.PI / 2, 0.6, { color: 0xd0b46a });
  stencil('DECON · REMOVE SUITS', -23, 2.6, -57.6, 0, 0.55, { color: 0xbfd6dd });
  stencil('MESS', -47.7, 2.9, -8, -Math.PI / 2, 0.9, { color: 0x8fa7b4 });
  stencil('LOCKERS', -46.2, 2.7, 20, -Math.PI / 2, 0.6, { color: 0x8fa7b4 });
  stencil('CONTROL', 46.4, 3.3, -12, Math.PI / 2, 0.85, { color: 0x8fa7b4 });
  stencil('PLANT SEC-07', 33, 3.6, -49.6, 0, 0.7, { color: 0xd0b46a });
  stencil('SHAFT 3 ▼ WELL', 44.9, 2.9, 30, -Math.PI / 2, 0.6, { color: 0xd0b46a });
  stencil('NO ENTRY BEYOND\nTHIS POINT', 24.2, -17.4, 27, Math.PI / 2, 0.75,
    { color: 0x9a7ad0, emissive: 0x6a3fd0, group: G_DEC_C });
  stencil('CORE 1', -0.0, -1.2, -19.6, 0, 1.3, { color: 0xd06a3a, group: G_DEC_B });
  stencil('LEVEL 3', 19.6, 6.6, 0, -Math.PI / 2, 0.7, { color: 0xd06a3a, group: G_DEC_B });
  stencil('COOLANT — LEVEL 2', -19.6, 1.2, 0, Math.PI / 2, 0.7, { color: 0xd06a3a, group: G_DEC_B });
  stencil('▲ SERVICE', -19.6, -6.6, -8, Math.PI / 2, 0.6, { color: 0xd06a3a, group: G_DEC_B });
  stencil('EXIT', -20, 2.55, -43.7, 0, 0.34, { color: 0x0a1a12, background: 0x1fd07a, emissive: 0x1fd07a, frame: true });
  stencil('EXIT', 23.4, 2.55, 2, -Math.PI / 2, 0.34, { color: 0x0a1a12, background: 0x1fd07a, emissive: 0x1fd07a, frame: true });

  // ===========================================================================
  // 10. LIGHTING — dark by default; 23 real lights, 2 shadow casters.
  // ===========================================================================
  ctx.light(new THREE.HemisphereLight(0x0e1a22, 0x040407, 0.30));
  ctx.light(new THREE.AmbientLight(0x0a1016, 0.42));

  const CYAN = 0x36e6ff, WARM = 0xffe6c0, VIOLET = 0x7a3cff;
  const pt = (color, intensity, dist, x, y, z, o = {}) => {
    const l = new THREE.PointLight(color, intensity, dist, o.decay ?? 1.6);
    l.position.set(x, y, z);
    return ctx.light(l, { shadow: false });
  };

  // Stratum A — coolant cyan
  pt(CYAN, 11, 26, 0, 3.1, -23.5);
  pt(CYAN, 9, 24, -23.5, 3.1, 0);
  pt(CYAN, 9, 24, 23.5, 3.1, 0);
  pt(CYAN, 7, 20, 0, 3.1, 23.5);
  pt(CYAN, 8, 20, -54, 3.0, 20);         // lockers
  pt(WARM, 9, 24, -60, 3.7, -8);         // mess
  pt(CYAN, 10, 26, 58, 3.9, -12);        // control
  pt(0xffb44a, 9, 22, 39, 4.0, -42);     // plant
  pt(CYAN, 7, 20, 41, 2.6, 31);          // shaft head
  const flickLight = pt(0xdfeaff, 10, 18, -37, 3.0, 0);   // the bad strip
  const airlockSpot = new THREE.SpotLight(0xe8f6ff, 26, 20, Math.PI / 3.4, 0.5, 1.5);
  airlockSpot.position.set(-23, 3.1, -51);
  airlockSpot.target.position.set(-23, 0, -50);
  ctx.light(airlockSpot, { shadow: true, far: 24 });

  // Stratum B — forge red
  const coreLight = pt(0xff3a12, 60, 44, 0, BY + 6, 0);
  const hallSpot = new THREE.SpotLight(0xfff0d8, 90, 44, Math.PI / 3.6, 0.65, 1.5);
  hallSpot.position.set(0, 11.5, 0);
  hallSpot.target.position.set(0, BY, 0);
  ctx.light(hallSpot, { shadow: true, far: 46 });
  pt(0xfff2dc, 14, 16, -14, L1 + 1.6, 8);
  pt(0xfff2dc, 12, 15, 12, BY + 2.2, -12);

  // Stratum C — void violet
  pt(VIOLET, 7, 26, -34, CY + 4.5, 20);
  pt(VIOLET, 5, 20, -40, CY + 3.6, -17);
  pt(VIOLET, 4, 16, 14, CY + 3.0, 27);
  pt(0x4fa8d8, 5, 16, 40, CY + 2.4, 27);

  // ===========================================================================
  // 11. GAMEPLAY — 40 coins, 5 batteries, 3 powerups, 1 pup, 23 hiding spots
  // ===========================================================================
  const COINS = [
    // Stratum A (13)
    [-23, 1, -48], [-27, 1, -55], [-18, 1, -35], [0, 1, -23.5], [-23.5, 1, 10],
    [-54, 1, 15], [-58, 1, 25], [-60, 1, -10], [-64, 1, -3], [-37, 1, 0],
    [23.5, 1, -10], [55, 1, -18], [39, 1, -46],
    // Stratum B (14)
    [-15, -8, -15], [15, -8, 15], [0, -8, -16], [-16, -8, 6], [16, -8, -6], [10, -8, 12],
    [-17, -3.5, -10], [0, -3.5, -8.5], [12.75, -3.5, 0],
    [17, 1, 10], [-8.5, 1, 6],
    [0, 6.5, -17], [-17, 6.5, 0], [8.5, 6.5, -8.5],
    // Stratum C (13)
    [-30, -19, 30], [-40, -19, 12], [-54, -19, 20], [-14, -19, 44], [-50, -19, 46],
    [-25, -19, 10], [-30, -19, -10], [-52, -19, -28], [-24, -19, -30], [-40, -19, -24],
    [8, -19, 27], [30, -19, 27], [50, -19, 27],
  ];
  for (const [x, y, z] of COINS) ctx.pickup(x, y, z, 'coin');

  for (const [x, y, z] of [
    [-19, 1, -40], [-17, -3.5, 14], [-46, -19, 36], [-33, -19, -20], [52, -19, 27],
  ]) ctx.pickup(x, y, z, 'battery');

  ctx.pickup(41.7, 1, 32.6, 'powerup:nightvision');
  ctx.pickup(0, 6.5, 17, 'powerup:dash');
  ctx.pickup(-56, -19, 10, 'powerup:ghost');

  // the dog, behind the door that leads nowhere
  ctx.pickup(-40.7, -19, -15.3, 'pup');

  const HIDE = [
    [-60.4, 0, 14, 1.1, 1.0], [-56, 0, 14, 1.1, 1.0], [-51.6, 0, 14, 1.1, 1.0],
    [-55, 0, 21, 1.3, 0.95], [-47.4, 0, 18.5, 1.1, 0.9],
    [-27, 0, -55, 1.4, 0.85], [-19, 0, -47, 1.2, 0.8],
    [-65, 0, -14, 1.4, 0.75], [-57, 0, -3, 1.2, 0.8],
    [68, 0, -15, 1.3, 0.85],
    [44, 0, -38, 1.5, 0.85], [31.6, 0, -40, 1.4, 0.9],
    [-9.5, -9, -9.5, 1.8, 1.0], [9.5, -9, 9.5, 1.8, 1.0],
    [-16, -9, 8, 1.6, 0.9], [15.5, -9, -9, 1.6, 0.9],
    [-17, -9, -12, 1.4, 0.8], [17, -9, 12, 1.4, 0.8],
    [49, -12, 27, 1.5, 1.0],
    [-54, -20, 12, 1.6, 0.95], [-24, -20, 48, 1.6, 0.95],
    [-40, -20, -17, 1.4, 1.0], [-58, -20, -32, 1.6, 0.9],
  ];
  for (const [x, y, z, r, q] of HIDE) ctx.hidingSpot(x, y, z, r, q);

  // ===========================================================================
  // 12. MOTION
  // ===========================================================================
  // dripping water
  const drips = [];
  {
    const dripMat = M.emissive(0x9fd8ff, 0.5, { transparent: true, opacity: 0.5 });
    const dg = new THREE.SphereGeometry(0.035, 6, 5);
    for (const [dx, dy, dz, fall] of [
      [-14, 3.4, -23.5, 3.4], [18, 3.4, 23.5, 3.4], [-23.5, 3.4, -14, 3.4],
      [6, BY + 8, -12, 17], [-8, BY + 6, 14, 15],
      [-30, CY + 6.4, 24, 6.4], [-44, CY + 6.4, 38, 6.4], [-26, CY + 5.4, -18, 5.4],
    ]) {
      const m = new THREE.Mesh(dg, dripMat);
      m.position.set(dx, dy, dz);
      m.userData = { x: dx, y0: dy, z: dz, fall, t: rDetail.range(0, 1) };
      m.castShadow = false;
      G_LIVE.add(m);
      drips.push(m);
    }
  }

  const ledPhase = [0, 0.9, 1.8, 2.7];
  let flickSeed = 0;

  ctx.onUpdate((dt, t) => {
    // black water
    WATER.userData.tick?.(dt);

    // the core breathes
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.55);
    coreVentMat.emissiveIntensity = 3.4 + pulse * 2.6;
    coreLight.intensity = 44 + pulse * 30;

    // rotating hazard beacons
    for (const b of beacons) {
      const a = t * 1.5 + b.phase;
      b.light.target.position.set(b.x + Math.cos(a) * 10, L2 + 0.4, b.z + Math.sin(a) * 10);
      b.light.intensity = 20 + 10 * Math.max(0, Math.sin(a * 2));
    }

    // steam
    for (const c of steamCones) {
      const p = (t * 0.35 + c.userData.phase) % 1;
      const s = c.userData.base * (0.5 + p * 1.1);
      c.scale.set(s, s * (0.7 + p * 0.9), s);
      c.position.y = c.userData.y0 + 1.2 + p * 2.6;
    }
    STEAM.opacity = 0.10 + 0.05 * Math.sin(t * 0.8);

    // scrolling glyphs on every screen in the control room
    if (glyphMat.map) glyphMat.map.offset.y = (glyphMat.map.offset.y - dt * 0.07) % 1;

    // LED chase
    for (let i = 0; i < 4; i++) {
      ledMats[i].emissiveIntensity = 0.25 + 3.2 * Math.pow(Math.max(0, Math.sin(t * 1.7 - ledPhase[i])), 6);
    }

    // the failing strip in the west corridor
    flickSeed += dt;
    const f = Math.sin(flickSeed * 37.1) * Math.sin(flickSeed * 11.7) * Math.sin(flickSeed * 3.3);
    const on = f > -0.35 ? 1 : 0.06;
    flickLight.intensity = 10 * on * (0.85 + 0.3 * Math.sin(flickSeed * 60));
    EM.flick.emissiveIntensity = 3.6 * on;

    // plastic strip curtains
    for (let i = 0; i < curtainData.length; i++) {
      const c = curtainData[i];
      _cdum.position.set(c.x, c.y, c.z);
      _cdum.rotation.set(Math.sin(t * 0.9 + c.phase) * 0.05, c.ry, 0);
      _cdum.updateMatrix();
      curtainMesh.setMatrixAt(i, _cdum.matrix);
    }
    curtainMesh.instanceMatrix.needsUpdate = true;

    // drips
    for (const d of drips) {
      d.userData.t += dt * 0.5;
      if (d.userData.t > 1) d.userData.t -= 1 + rDetail.range(0, 0.8);
      const p = Math.max(0, d.userData.t);
      d.position.y = d.userData.y0 - p * p * d.userData.fall;
      d.visible = p > 0;
    }
  });

  // ===========================================================================
  // 13. ASSEMBLY — freeze the static decor, keep the shells collidable.
  // ===========================================================================
  flushIBoxes();
  ctx.add(G_SOLID);
  ctx.addSolid(G_PROXY);
  ctx.addDecor(P.freeze(G_DEC_A));
  ctx.addDecor(P.freeze(G_DEC_B));
  ctx.addDecor(P.freeze(G_DEC_C));
  ctx.addDecor(G_LIVE);

  // ===========================================================================
  // 14. AUTHORED PROPS — the dungeon kit suits this arena better than any
  //     other: black iron, barrels, crates and chests belong in a buried
  //     facility. Instanced, with one merged collision proxy for the lot.
  //     Silently does nothing if assets/ is absent.
  // ===========================================================================
  const inService = (x, z) => Math.abs(x) < 62 && Math.abs(z) < 56;
  await ctx.kits.scatterKit(ctx, {
    kit: 'COVER', count: 16, seed: 'uc-cover',
    area: (r) => ({ x: r.range(-58, 58), y: 0, z: r.range(-52, 52) }),
    accept: (p) => inService(p.x, p.z) && Math.hypot(p.x + 23, p.z + 51) > 6,
  });
  await ctx.kits.scatterKit(ctx, {
    kit: 'CONTAINERS', count: 10, seed: 'uc-cont',
    area: (r) => ({ x: r.range(-56, 56), y: -9, z: r.range(-20, 20) }),
    accept: (p) => Math.hypot(p.x, p.z) > 11,     // clear of the reactor core
  });
  await ctx.kits.scatterKit(ctx, {
    kit: 'DEBRIS', count: 12, seed: 'uc-debris', hide: false,
    area: (r) => ({ x: r.range(-58, 58), y: r.chance(0.5) ? 0 : -20, z: r.range(-52, 52) }),
  });
  await ctx.kits.scatterKit(ctx, {
    kit: 'CLUTTER', count: 8, seed: 'uc-clutter', hide: false, collide: false,
    area: (r) => ({ x: r.range(-56, 56), y: 0, z: r.range(-50, 50) }),
  });
}
