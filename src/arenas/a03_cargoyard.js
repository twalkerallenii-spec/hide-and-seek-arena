// =============================================================================
// PORT NINE  —  src/arenas/a03_cargoyard.js
// -----------------------------------------------------------------------------
// A working container port at golden hour, seen from inside the stacks.
//
// The signature is a genuine 3D maze of stacked ISO containers with a fully
// walkable rooftop layer, two enormous gantry cranes, a moored feeder ship, and
// a corrugated warehouse. Everything is generated from ctx.rng — no Math.random.
//
// Layout (world units = metres, ground plane at y = 0):
//
//        z = -100  ....... open sea (invisible boundary) .......
//        z = -78 ..-64     MV KESTREL NINE  (walkable deck at y = 3)
//        z = -62           quay edge / kerb / slipway
//        z = -62 ..-38     QUAYSIDE apron + STS gantry crane "PN-1"
//        z = -32 .. 51.5   CONTAINER MAZE (9 bands, alleys 2 m .. 7 m)
//        z =  58 .. 80     GATE / WEIGHBRIDGE / PORTACABINS  (spawn)
//        x = -104 ..-70    WAREHOUSE SHED  (z -16 .. 44)
//        x =  74 .. 96     east clutter strip + perimeter wall
//
// Vertical routes to the rooftop layer (container tops at 2.59 / 5.18 / 7.77 /
// 10.36 m):
//   1. scaffold stair tower on the west edge of the maze  -> 10.36 m
//   2. stepped container ramp with checkerplate gangways  -> 10.36 m
//   3. inclined caged ladder-stair up a floodlight mast   ->  8.00 m
//   4. crane PN-1 service stair                           -> 26.40 m catwalk
//   5. warehouse mezzanine stair                          ->  4.20 m
// A generated bridge/gangway pass then stitches the block tops into one
// connected second map.
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'cargoyard',
  name: 'PORT NINE',
  tagline: 'A maze you can climb on top of, at the hour when every shadow is a mile long.',
  order: 3,
  difficulty: 2,
  biome: 'outdoor',
  seed: 90311,
  spawn: [0, 0, 68],
  bounds: 130,
  colors: ['#f0a860', '#2c4d7a'],
  music: 'tense',
};

// --- ISO container module ----------------------------------------------------
const CL = 6.06;   // length (x)
const CH = 2.59;   // height
const CW = 2.44;   // width  (z)

// --- yard extents ------------------------------------------------------------
const MAZE = { x0: -46, x1: 74 };

// Bands of container rows running along X. Gaps between them are the alleys.
const BANDS = [
  { z0: -32.0, rows: 2 },
  { z0: -24.9, rows: 3 },
  { z0: -11.2, rows: 2 },
  { z0: -4.30, rows: 3 },
  { z0: 5.400, rows: 2 },
  { z0: 16.90, rows: 3 },
  { z0: 26.40, rows: 2 },
  { z0: 37.10, rows: 3 },
  { z0: 46.60, rows: 2 },
];

// Rectangles the procedural maze must leave alone — hand-built set pieces live
// here (stair tower, stepped ramp, mast bridge, collapsed stack).
const RESERVED = [
  { x0: -47.0, x1: -26.0, z0: -5.4, z1: 3.8 },   // stair tower + anchor block
  { x0: 16.0, x1: 63.0, z0: 16.2, z1: 24.9 },    // stepped container ramp
  { x0: -16.0, x1: -0.5, z0: -11.9, z1: -5.8 },  // mast bridge anchor block
  { x0: 50.0, x1: 74.5, z0: -5.0, z1: 3.8 },     // collapsed stack
];

// Sun-bleached container livery. One procedural corrugated material per entry,
// so this array length IS the container material count. Keep it short.
const LIVERY = [
  0xa8402e, 0x8c3527, 0x2f5f86, 0x24486b, 0x2e6b4a,
  0x7d6a2e, 0xb06a24, 0xc0562c, 0x8d8a84, 0xd6ccb6,
];

const SHIPPING_LINES = [
  'MAERSA\nPNU 4471820',
  'HANWA\nHWLU 903 116',
  'EVERSTAR\nESRU 22 4180',
  'COSCA LINE\nCSLU 771 049',
  'TRITON\nTRTU 118 6603',
  'OOCA\nOOLU 4 052 991',
  'NORDHAVN\nNHVU 66 0214',
  'PORT NINE\nPN9U 000 013',
];

// =============================================================================
// Small local helpers
// =============================================================================

/** Push an oriented box description onto a proxy list. */
function pbox(list, cx, cy, cz, w, h, d, ry = 0, rx = 0, rz = 0) {
  list.push({ cx, cy, cz, w, h, d, ry, rx, rz });
  return list;
}

/**
 * Collapse a list of oriented boxes into ONE invisible collidable mesh.
 * Keeps the octree fed with exact geometry while costing a single object.
 */
function mergeProxy(ctx, boxes, name) {
  if (!boxes.length) return null;
  const geos = boxes.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    const e = new THREE.Euler(b.rx || 0, b.ry || 0, b.rz || 0, 'YXZ');
    const m = new THREE.Matrix4().makeRotationFromEuler(e);
    m.setPosition(b.cx, b.cy, b.cz);
    g.applyMatrix4(m);
    return g;
  });
  const merged = ctx.props.mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const m = new THREE.Mesh(merged, ctx.mat.solid({ color: 0x101010 }));
  m.visible = false;
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.collide = true;
  m.name = name || 'proxy';
  ctx.add(m);
  return m;
}

/** Bake a hand-built group (already in world coordinates) into few draw calls. */
function bake(ctx, group) {
  const frozen = ctx.props.freeze(group);
  ctx.addDecor(frozen);
  return frozen;
}

/** Rotate a block-local XZ offset into world space. */
function blockToWorld(b, lx, lz) {
  const c = Math.cos(b.ry), s = Math.sin(b.ry);
  return [b.cx + lx * c + lz * s, b.cz - lx * s + lz * c];
}

function overlaps1D(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/**
 * Enclosed switchback stair tower.
 *
 * Visible steps / stringers / rails are decor; walking is done on invisible
 * sloped ramp proxies plus landings, and the shaft is boxed in by invisible
 * walls so the player cannot walk off the side. Returns the exit landing so the
 * caller can bridge out of the top.
 *
 * Local space: origin at the base centre of the footprint, flights run along Z.
 */
function stairTower(ctx, o) {
  const P = ctx.props;
  const rise = o.rise;
  const run = o.run ?? 3.4;
  const width = o.width ?? 1.35;
  const flights = Math.max(1, Math.round(rise / (o.flightRise ?? 2.4)));
  const fr = rise / flights;
  const W = width * 2 + 0.14;
  const laneA = -(width + 0.07) / 2;
  const laneB = (width + 0.07) / 2;
  const land = 1.35;
  const steel = o.mat ?? ctx.mat.metal(0x6a6259, 0.62);
  const tread = o.treadMat ?? steel;

  const vis = new THREE.Group();
  const boxes = [];

  // ground landing (entry)
  pbox(boxes, 0, -0.06, -land / 2, W, 0.12, land);
  const g0 = P.boxC(W, 0.1, land, tread, { collide: false, shadow: false });
  g0.position.set(0, -0.05, -land / 2); vis.add(g0);

  for (let i = 0; i < flights; i++) {
    const even = (i % 2) === 0;
    const lx = even ? laneA : laneB;
    const y0 = i * fr, y1 = (i + 1) * fr;
    const len = Math.hypot(run, fr);
    const pitch = Math.atan2(fr, run);

    // invisible ramp: top face flush with the step noses
    pbox(boxes, lx, (y0 + y1) / 2 - 0.09, run / 2, width, 0.30, len,
      even ? 0 : Math.PI, even ? -pitch : -pitch);

    // visible treads
    const steps = 9;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const zz = even ? run * t : run * (1 - t);
      const tr = P.boxC(width, 0.05, run / steps * 0.92, tread, { collide: false });
      tr.position.set(lx, y0 + (y1 - y0) * t, zz);
      tr.castShadow = false;
      vis.add(tr);
    }
    // stringers
    for (const sx of [-1, 1]) {
      const st = P.boxC(0.06, 0.28, len, steel, { collide: false, shadow: false });
      st.position.set(lx + sx * (width / 2 + 0.03), (y0 + y1) / 2 - 0.19, run / 2);
      st.rotation.x = even ? -pitch : pitch;
      vis.add(st);
    }
    // landing at the turn
    const lz = even ? run + land / 2 : -land / 2;
    pbox(boxes, 0, y1 - 0.06, lz, W, 0.12, land);
    const ld = P.boxC(W, 0.1, land, tread, { collide: false, shadow: false });
    ld.position.set(0, y1 - 0.05, lz); vis.add(ld);
    // rail posts around the landing (decor)
    for (const sx of [-1, 1]) {
      const r = P.railing(land, 1.05, steel, { postEvery: 0.9 });
      r.rotation.y = Math.PI / 2;
      r.position.set(sx * (W / 2 - 0.04), y1, lz);
      P.NOCOLLIDE(r); vis.add(r);
    }
  }

  // corner posts + cross bracing, so the tower reads as scaffold from outside
  const topY = rise + 1.25;
  for (const sx of [-1, 1]) for (const sz of [-land, run + land]) {
    const p = P.boxC(0.14, topY, 0.14, steel, { collide: false });
    p.position.set(sx * (W / 2 + 0.05), topY / 2, sz);
    vis.add(p);
  }
  for (let y = 1.2; y < rise; y += 2.4) {
    for (const sx of [-1, 1]) {
      const br = P.boxC(0.08, 0.08, Math.hypot(run + land * 2, 2.4), steel, { collide: false, shadow: false });
      br.position.set(sx * (W / 2 + 0.05), y + 1.2, (run) / 2);
      br.rotation.x = Math.atan2(2.4, run + land * 2) * (y % 4.8 < 2.4 ? 1 : -1);
      vis.add(br);
    }
  }

  // Invisible shaft walls (entry gap on the -Z face, lane A). They stop just
  // below the top landing so the exit — whichever end it lands on — is clear.
  const wallH = Math.max(0.6, rise - 0.15);
  pbox(boxes, -W / 2 - 0.12, wallH / 2, run / 2, 0.24, wallH, run + land * 2 + 0.5);
  pbox(boxes, W / 2 + 0.12, wallH / 2, run / 2, 0.24, wallH, run + land * 2 + 0.5);
  pbox(boxes, 0, wallH / 2, run + land + 0.12, W + 0.5, wallH, 0.24);
  pbox(boxes, (laneA + 0.62 + W / 2) / 2 + 0.05, wallH / 2, -land - 0.12,
    W / 2 - laneA - 0.62, wallH, 0.24);

  // top landing guard rail, gap left on the exit side
  const lastEven = ((flights - 1) % 2) === 0;
  const exitZ = lastEven ? run + land / 2 : -land / 2;
  const exitDir = lastEven ? 1 : -1;
  for (const sx of [-1, 1]) {
    pbox(boxes, sx * (W / 2 - 0.05), rise + 0.6, exitZ, 0.1, 1.2, land);
    const r = P.railing(land, 1.1, steel, { postEvery: 0.8 });
    r.rotation.y = Math.PI / 2;
    r.position.set(sx * (W / 2 - 0.05), rise, exitZ);
    P.NOCOLLIDE(r); vis.add(r);
  }

  return { vis, boxes, exit: { x: 0, y: rise, z: exitZ + exitDir * (land / 2) }, exitDir, width: W };
}

/** Sloped or flat checkerplate walkway plate between two rooftop levels. */
function walkPlate(ctx, vis, boxes, ax, ay, az, bx, by, bz, w, plateMat) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const flat = Math.hypot(dx, dz);
  const len = Math.hypot(flat, dy) + 0.7;
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.atan2(dy, flat);
  const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
  const plate = ctx.props.boxC(w, 0.14, len, plateMat, { collide: false });
  plate.position.set(cx, cy - 0.07, cz);
  plate.rotation.set(pitch, yaw, 0, 'YXZ');
  vis.add(plate);
  pbox(boxes, cx, cy - 0.07, cz, w, 0.14, len, yaw, pitch);
  // kick rails
  for (const s of [-1, 1]) {
    const kr = ctx.props.boxC(0.06, 0.34, len, plateMat, { collide: false, shadow: false });
    kr.position.set(cx, cy + 0.1, cz);
    kr.rotation.set(pitch, yaw, 0, 'YXZ');
    kr.translateX(s * (w / 2 - 0.03));
    vis.add(kr);
  }
  return plate;
}

/** Hollow 20 ft container you can walk into. Doors on the +X end. */
function openContainer(ctx, vis, boxes, x, z, ry, colorIdx, ajar) {
  const P = ctx.props;
  const shellMat = ctx.mat.surface('corrugated', {
    color: LIVERY[colorIdx], repeat: 1, size: 256, ribs: 12, seed: colorIdx,
  });
  const innerMat = ctx.mat.solid({ color: 0x2a2622, roughness: 0.95 });
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const t = 0.11;
  const floor = P.boxC(CL, t, CW, innerMat, { collide: false }); floor.position.y = t / 2; g.add(floor);
  const roof = P.boxC(CL, t, CW, shellMat, { collide: false }); roof.position.y = CH - t / 2; g.add(roof);
  for (const sz of [-1, 1]) {
    const wl = P.boxC(CL, CH, t, shellMat, { collide: false });
    wl.position.set(0, CH / 2, sz * (CW / 2 - t / 2)); g.add(wl);
  }
  const back = P.boxC(t, CH, CW, shellMat, { collide: false });
  back.position.set(-CL / 2 + t / 2, CH / 2, 0); g.add(back);
  // door leaves
  const doorMat = ctx.mat.solid({ color: LIVERY[colorIdx], roughness: 0.72, metalness: 0.25 });
  const swing = ajar ? 0.22 : 1.9;
  for (const sz of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(CL / 2 - t, 0, sz * (CW / 2 - t));
    const leaf = P.boxC(0.07, CH - 0.16, CW / 2 - t, doorMat, { collide: false });
    leaf.position.set(0, CH / 2, -sz * (CW / 4 - t / 2));
    hinge.add(leaf);
    for (let i = 0; i < 2; i++) {
      const bar = P.cyl(0.035, 0.035, CH - 0.3, ctx.mat.metal(0x53595e, 0.5), { seg: 6, collide: false });
      bar.position.set(0.05, 0.14, -sz * (0.22 + i * 0.5));
      hinge.add(bar);
    }
    hinge.rotation.y = sz * swing;
    g.add(hinge);
  }
  // corner posts
  const frameM = ctx.mat.metal(0x3a3f43, 0.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = P.boxC(0.13, CH, 0.13, frameM, { collide: false });
    p.position.set(sx * (CL / 2 - 0.06), CH / 2, sz * (CW / 2 - 0.06)); g.add(p);
  }
  vis.add(g);
  // collision: floor, roof, two long walls, back wall, and door jambs
  const c = Math.cos(ry), s = Math.sin(ry);
  const put = (lx, ly, lz, w, h, d) =>
    pbox(boxes, x + lx * c + lz * s, ly, z - lx * s + lz * c, w, h, d, ry);
  put(0, CH + 0.08, 0, CL, 0.16, CW);
  for (const sz of [-1, 1]) put(0, CH / 2, sz * (CW / 2 - 0.06), CL, CH, 0.12);
  put(-CL / 2 + 0.06, CH / 2, 0, 0.12, CH, CW);
  if (ajar) {
    for (const sz of [-1, 1]) put(CL / 2 - 0.05, CH / 2, sz * (CW / 2 - 0.42), 0.14, CH, 0.7);
  }
  return g;
}

/** Blocky counterbalance forklift. */
function forklift(ctx, vis, boxes, x, z, ry, seed) {
  const P = ctx.props;
  const R = ctx.rng.fork('fork' + seed);
  const body = ctx.mat.solid({ color: 0xd8a41c, roughness: 0.55, metalness: 0.3 });
  const dark = ctx.mat.solid({ color: 0x24262a, roughness: 0.9 });
  const steel = ctx.mat.metal(0x8b9096, 0.45);
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = ry;
  const chassis = P.boxC(1.15, 0.72, 2.25, body); chassis.position.set(0, 0.62, -0.1); g.add(chassis);
  const counter = P.boxC(1.05, 0.55, 0.6, dark); counter.position.set(0, 0.62, -1.35); g.add(counter);
  const seat = P.boxC(0.6, 0.42, 0.5, dark); seat.position.set(0, 1.2, -0.6); g.add(seat);
  for (const sx of [-1, 1]) {
    const post = P.boxC(0.07, 1.35, 0.07, steel);
    post.position.set(sx * 0.5, 1.7, -0.5); g.add(post);
  }
  const canopy = P.boxC(1.15, 0.08, 1.1, steel); canopy.position.set(0, 2.35, -0.5); g.add(canopy);
  // mast + forks
  for (const sx of [-1, 1]) {
    const m = P.boxC(0.11, 2.5, 0.14, steel); m.position.set(sx * 0.36, 1.3, 1.0); g.add(m);
  }
  const carriage = P.boxC(0.9, 0.4, 0.1, steel); carriage.position.set(0, 0.55, 1.1); g.add(carriage);
  for (const sx of [-1, 1]) {
    const f = P.boxC(0.11, 0.05, 1.0, steel); f.position.set(sx * 0.3, 0.09, 1.6); g.add(f);
  }
  const tyre = ctx.mat.solid({ color: 0x141516, roughness: 0.96 });
  for (const [sx, sz, r] of [[-1, 0.75, 0.34], [1, 0.75, 0.34], [-1, -1.15, 0.24], [1, -1.15, 0.24]]) {
    const w = P.cyl(r, r, 0.2, tyre, { seg: 12, collide: false });
    w.rotation.z = Math.PI / 2; w.position.set(sx * 0.56, r, sz); g.add(w);
  }
  const beacon = P.sphere(0.07, ctx.mat.emissive(0xffa514, R.chance(0.5) ? 5 : 1.2), { collide: false, seg: 8 });
  beacon.position.set(0, 2.43, -0.5); g.add(beacon);
  vis.add(g);
  const c = Math.cos(ry), s = Math.sin(ry);
  pbox(boxes, x + 0.0 * c - 0.2 * s, 0.75, z - 0.0 * s - 0.2 * c, 1.3, 1.5, 3.2, ry);
  return g;
}

/** Portacabin / site office box. */
function portacabin(ctx, vis, boxes, x, z, ry, w, d, o = {}) {
  const P = ctx.props;
  const h = 2.7;
  const skin = o.mat ?? ctx.mat.surface('metalPanel', { color: 0xd7d2c4, repeat: 1, size: 256, panels: 5 });
  const trim = ctx.mat.solid({ color: 0x3f4a52, roughness: 0.7 });
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = ry;
  const skid = P.boxC(w, 0.22, d, trim); skid.position.y = 0.11; g.add(skid);
  const body = P.boxC(w, h, d, skin); body.position.y = 0.22 + h / 2; g.add(body);
  const roof = P.boxC(w + 0.2, 0.14, d + 0.2, trim); roof.position.y = 0.22 + h + 0.07; g.add(roof);
  const glow = ctx.mat.emissive(o.lit ? 0xffe0a8 : 0x2a3138, o.lit ? 2.4 : 0.2);
  for (let i = 0; i < Math.max(1, Math.floor(w / 1.8)); i++) {
    const win = P.boxC(1.0, 0.85, 0.06, glow, { collide: false, shadow: false });
    win.position.set(-w / 2 + 1.0 + i * 1.8, 1.75, d / 2 + 0.02); g.add(win);
    const fr = P.boxC(1.12, 0.97, 0.05, trim, { collide: false, shadow: false });
    fr.position.set(-w / 2 + 1.0 + i * 1.8, 1.75, d / 2 + 0.005); g.add(fr);
  }
  const dr = P.boxC(0.9, 2.05, 0.07, trim, { collide: false });
  dr.position.set(w / 2 - 0.9, 1.25, d / 2 + 0.03); g.add(dr);
  const stp = P.boxC(1.2, 0.22, 0.7, trim, { collide: false });
  stp.position.set(w / 2 - 0.9, 0.11, d / 2 + 0.42); g.add(stp);
  vis.add(g);
  pbox(boxes, x, (h + 0.22) / 2, z, w, h + 0.22, d, ry);
  return g;
}

// =============================================================================
// BUILD
// =============================================================================

export async function build(ctx) {
  const P = ctx.props;
  const M = ctx.mat;
  const R = ctx.rng;
  const rMaze = R.fork('maze');
  const rDress = R.fork('dressing');
  const rGround = R.fork('groundpaint');
  const rAtmo = R.fork('atmosphere');
  const rShip = R.fork('ship');
  const rWare = R.fork('warehouse');
  const rLoot = R.fork('loot');

  // ---------------------------------------------------------------------------
  // 1. ATMOSPHERE
  // ---------------------------------------------------------------------------
  ctx.sky({ top: 0x2c4d7a, bottom: 0xf0a860, radius: 500 });
  ctx.fog(0xc9a074, 60, 320);
  ctx.useEnvironment(0.8);
  ctx.grade({
    exposure: 1.10, saturation: 1.12, contrast: 1.08,
    lift: [0.014, 0.005, -0.010], gain: [1.07, 1.00, 0.89],
    vignette: 0.95, grain: 0.045, aberration: 0.0014,
    bloom: 0.50, bloomRadius: 0.82, bloomThreshold: 0.76, scanline: 0.0,
  });
  ctx.soundscape('wind', 'calm', { size: 0.55, dark: 0.3, wet: 0.14 });

  // Footstep surface lookup. The resolver only gets (x, z) so we bake a coarse
  // grid: anything standing over a container-block footprint must be ON TOP of
  // it (you cannot be inside one), which gives us metal roofs for free.
  const SG = { c: 2.5, x0: -114, z0: -102, nx: 92, nz: 78 };
  const surfGrid = new Uint8Array(SG.nx * SG.nz);       // 0 gravel
  const paintSurf = (x0, x1, z0, z1, code) => {
    const i0 = Math.max(0, Math.floor((x0 - SG.x0) / SG.c));
    const i1 = Math.min(SG.nx - 1, Math.ceil((x1 - SG.x0) / SG.c));
    const j0 = Math.max(0, Math.floor((z0 - SG.z0) / SG.c));
    const j1 = Math.min(SG.nz - 1, Math.ceil((z1 - SG.z0) / SG.c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) surfGrid[j * SG.nx + i] = code;
  };
  const SURF = ['gravel', 'metal', 'concrete', 'water', 'wood'];
  paintSurf(-114, 100, -102, -63, 3);      // sea
  paintSurf(-114, 100, -62, -38, 2);       // quay apron
  paintSurf(-106, -68, -18, 46, 2);        // warehouse
  paintSurf(-32, 32, 56, 82, 2);           // gate apron
  ctx.setSurface((x, z) => {
    const i = Math.floor((x - SG.x0) / SG.c), j = Math.floor((z - SG.z0) / SG.c);
    if (i < 0 || j < 0 || i >= SG.nx || j >= SG.nz) return 'gravel';
    return SURF[surfGrid[j * SG.nx + i]];
  });

  // ---------------------------------------------------------------------------
  // 2. LIGHT
  // ---------------------------------------------------------------------------
  ctx.light(new THREE.HemisphereLight(0x8fb0d8, 0x4a3b2a, 0.55));
  ctx.light(new THREE.AmbientLight(0x2b2519, 0.30));

  const sun = new THREE.DirectionalLight(0xffb066, 3.2);
  sun.position.set(-176, 45, -104);          // elevation ~11.9 deg, WNW
  sun.target.position.set(6, 0, 8);
  ctx.light(sun, { shadow: true, range: 96, far: 470, bias: -0.0009, normalBias: 0.06 });

  // ---------------------------------------------------------------------------
  // 3. MATERIALS  (kept deliberately few — see header budget note)
  // ---------------------------------------------------------------------------
  const matAsphalt = M.surface('asphalt', { color: 0x4c4844, repeat: 52, size: 512 });
  const matQuay = M.surface('concrete', { color: 0x8e8a80, repeat: 26, size: 256 });
  const matSlab = M.surface('concrete', { color: 0x7c7972, repeat: 14, size: 256 });
  const matClad = M.surface('corrugated', { color: 0x6f7b74, repeat: 6, size: 256, ribs: 26 });
  const matHull = M.surface('rustMetal', { color: 0x1d3550, rust: 0x6f3a1a, repeat: 8, size: 256 });
  const matSteel = M.surface('rustMetal', { color: 0x9a5f2c, rust: 0x7a3d1c, repeat: 3, size: 256 });
  const matPlate = M.surface('metalPanel', { color: 0x6d6a63, repeat: 2, size: 256, panels: 6, rough: 0.6 });
  const matCabin = M.surface('metalPanel', { color: 0xd7d2c4, repeat: 1, size: 256, panels: 5 });
  const matGravel = M.surface('dirt', { color: 0x6b6459, repeat: 8, size: 256 });
  const matRock = M.surface('rock', { color: 0x5d5952, repeat: 4, size: 256 });
  const matWood = M.surface('wood', { color: 0x8a6238, repeat: 1, size: 256, planks: 5 });
  const matTarp = M.surface('fabric', { color: 0x2c5a6e, repeat: 3, size: 256 });

  const mSteelDark = M.metal(0x4a4c50, 0.62);
  const mSteelLight = M.metal(0x8a8f94, 0.45);
  const mPaintYellow = M.solid({ color: 0xd8a41c, roughness: 0.6, metalness: 0.25 });
  const mRubber = M.solid({ color: 0x161718, roughness: 0.96 });
  const mSodium = M.emissive(0xffb04c, 6.5);
  const mLampWarm = M.emissive(0xffd7a0, 3.4);
  const mGlassLit = M.emissive(0xffe2ac, 2.2);

  // Painted canvas materials (cheap 2D decals — one draw call each via instancing)
  const mLanePaint = M.painted(64, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(226,208,150,0.85)';
    for (let y = 0; y < H; y += 64) c.fillRect(W * 0.32, y, W * 0.36, 40);
  }, { transparent: true, alphaTest: 0.35, roughness: 0.9 });

  const mOilStain = M.painted(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(12,10,9,0.85)');
    g.addColorStop(0.55, 'rgba(24,20,16,0.45)');
    g.addColorStop(1, 'rgba(30,26,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, { transparent: true, alphaTest: 0.02, roughness: 0.35, depthWrite: false });

  const mPuddle = M.painted(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(120,140,160,0.85)');
    g.addColorStop(0.7, 'rgba(90,110,130,0.55)');
    g.addColorStop(1, 'rgba(90,110,130,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, { transparent: true, alphaTest: 0.02, roughness: 0.05, depthWrite: false });

  const mWeed = M.painted(64, 64, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 22; i++) {
      const x = 6 + (i * 37) % (W - 12);
      const hgt = 22 + ((i * 53) % 34);
      c.strokeStyle = i % 3 ? 'rgba(96,104,52,0.95)' : 'rgba(128,124,64,0.95)';
      c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(x, H);
      c.quadraticCurveTo(x + ((i % 5) - 2) * 5, H - hgt * 0.6, x + ((i % 7) - 3) * 6, H - hgt);
      c.stroke();
    }
  }, { transparent: true, alphaTest: 0.42, roughness: 0.95, side: THREE.DoubleSide });

  const mDoorEnd = M.painted(128, 128, (c, W, H) => {
    c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(20,18,16,0.6)'; c.lineWidth = 5;
    c.strokeRect(3, 3, W - 6, H - 6);
    c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke();
    c.lineWidth = 7; c.strokeStyle = 'rgba(28,24,20,0.55)';
    for (const x of [W * 0.18, W * 0.32, W * 0.68, W * 0.82]) {
      c.beginPath(); c.moveTo(x, 8); c.lineTo(x, H - 8); c.stroke();
    }
    c.fillStyle = 'rgba(40,34,28,0.7)';
    c.fillRect(W * 0.44, H * 0.42, W * 0.05, H * 0.16);
    c.fillRect(W * 0.51, H * 0.42, W * 0.05, H * 0.16);
  }, { transparent: true, alphaTest: 0.05, roughness: 0.8 });

  const mDust = M.painted(32, 32, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,232,190,1)');
    g.addColorStop(1, 'rgba(255,214,150,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, { transparent: true });

  const mGull = M.painted(64, 32, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(238,238,232,0.95)';
    c.beginPath();
    c.moveTo(2, 10); c.quadraticCurveTo(W * 0.3, 2, W / 2, 14);
    c.quadraticCurveTo(W * 0.7, 2, W - 2, 10);
    c.quadraticCurveTo(W * 0.7, 12, W / 2, 20);
    c.quadraticCurveTo(W * 0.3, 12, 2, 10);
    c.fill();
  }, { transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });

  // Shipping-line stencils, reused across the whole yard.
  const stencils = SHIPPING_LINES.map((t, i) => M.textMaterial(t, {
    color: i % 3 === 0 ? 0xe8e2d2 : 0xf2ead6, fontSize: 72,
  }));
  const slotNumbers = ['A 04', 'B 11', 'C 07', 'D 22', 'E 15', 'F 09'].map((t) =>
    M.textMaterial(t, { color: 0xe4d49a, fontSize: 88 }));

  // ---------------------------------------------------------------------------
  // 4. GROUND
  // ---------------------------------------------------------------------------
  const ground = P.ground(244, 178, matAsphalt, { segs: 12 });
  ground.position.set(-7, 0, 27);   // x -129..115, z -62..116 (stops at the quay face)
  ground.receiveShadow = true;
  ctx.add(ground);

  // Gravel patches & tarmac repairs
  const gdec = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const gx = rGround.range(-100, 90), gz = rGround.range(-58, 76);
    const gw = rGround.range(6, 20), gd = rGround.range(5, 16);
    const patch = P.ground(gw, gd, i % 3 === 0 ? matGravel : matSlab, { collide: false });
    patch.position.set(gx, 0.012 + i * 0.0006, gz);
    patch.rotation.y = rGround.range(0, 3.14);
    patch.receiveShadow = true;
    gdec.add(patch);
  }
  bake(ctx, gdec);

  // Lane markings — one instanced mesh
  const laneGeo = new THREE.PlaneGeometry(0.42, 10);
  laneGeo.rotateX(-Math.PI / 2);
  ctx.addDecor(P.scatter(laneGeo, mLanePaint, 120, (i, d, r) => {
    const lane = i % 6;
    const along = Math.floor(i / 6);
    if (lane < 3) {
      d.position.set(-46 + lane * 40 + r.range(-0.4, 0.4), 0.02, -34 + along * 5.6);
      d.rotation.y = 0;
    } else {
      d.position.set(-52 + along * 6.4, 0.02, -36 + (lane - 3) * 30);
      d.rotation.y = Math.PI / 2;
    }
    if (d.position.x > 92 || d.position.z > 74) return false;
  }, 4110));

  // Painted slot numbers on the tarmac
  slotNumbers.forEach((sn, k) => {
    const g = new THREE.PlaneGeometry(2.6, 2.6 / sn.aspect);
    g.rotateX(-Math.PI / 2);
    ctx.addDecor(P.scatter(g, sn.material, 14, (i, d, r) => {
      d.position.set(r.range(-44, 72), 0.024, r.range(-30, 50));
      d.rotation.y = Math.PI / 2 + r.range(-0.05, 0.05);
    }, 5200 + k * 7));
  });

  // Oil stains + puddles
  const stainGeo = new THREE.PlaneGeometry(3.2, 3.2); stainGeo.rotateX(-Math.PI / 2);
  ctx.addDecor(P.scatter(stainGeo, mOilStain, 70, (i, d, r) => {
    d.position.set(r.range(-102, 92), 0.018, r.range(-58, 76));
    d.rotation.y = r() * 6.28;
    d.scale.setScalar(r.range(0.5, 2.1));
  }, 771));
  ctx.addDecor(P.scatter(stainGeo, mPuddle, 46, (i, d, r) => {
    d.position.set(r.range(-100, 90), 0.022, r.range(-56, 74));
    d.rotation.y = r() * 6.28;
    d.scale.set(r.range(0.6, 2.4), 1, r.range(0.4, 1.5));
  }, 993));

  // Weeds pushing through the cracks
  const tuft = P.billboardCross(0.38, 0.5);
  ctx.addDecor(P.scatter(tuft, mWeed, 2600, (i, d, r) => {
    const x = r.range(-106, 94), z = r.range(-60, 78);
    // cluster along noise ridges so they read as cracks, not confetti
    const n = ctx.noise.fbm(x * 0.06, z * 0.06, 3);
    if (Math.abs(n) > 0.16 && !r.chance(0.08)) return false;
    d.position.set(x, 0, z);
    d.rotation.y = r() * 6.28;
    d.scale.setScalar(r.range(0.6, 1.7));
  }, 313));

  // ---------------------------------------------------------------------------
  // 5. PERIMETER  (fully sealed: wall + invisible over-height barrier)
  // ---------------------------------------------------------------------------
  const perimVis = new THREE.Group();
  const perimBox = [];
  const WALL_H = 3.3;
  const runs = [
    [-110, -62, -110, 80],   // west
    [-110, 80, 96, 80],      // south (gate is a closed sliding gate)
    [96, 80, 96, -62],       // east
  ];
  for (const [x1, z1, x2, z2] of runs) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const segs = Math.ceil(len / 12);
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const ax = x1 + (x2 - x1) * t0, az = z1 + (z2 - z1) * t0;
      const bx = x1 + (x2 - x1) * t1, bz = z1 + (z2 - z1) * t1;
      const w = P.wallBetween(ax, az, bx, bz, WALL_H, 0.34, matSlab);
      P.NOCOLLIDE(w); perimVis.add(w);
      // pilaster
      const pil = P.boxC(0.6, WALL_H + 0.25, 0.6, matSlab, { collide: false });
      pil.position.set(ax, (WALL_H + 0.25) / 2, az); perimVis.add(pil);
    }
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const yaw = -Math.atan2(z2 - z1, x2 - x1);
    // real barrier is 14 m tall so nothing reachable lets you leave the world
    pbox(perimBox, cx, 7, cz, len, 14, 0.6, yaw);
  }
  // razor-wire coil suggestion along the top
  const coilGeo = new THREE.TorusGeometry(0.28, 0.02, 4, 10);
  ctx.addDecor(P.scatter(coilGeo, mSteelLight, 180, (i, d, r) => {
    const t = i / 180;
    if (t < 0.34) { d.position.set(-109.6, WALL_H + 0.34, -62 + (t / 0.34) * 142); d.rotation.y = 0; }
    else if (t < 0.68) { d.position.set(-110 + ((t - 0.34) / 0.34) * 206, WALL_H + 0.34, 79.6); d.rotation.y = Math.PI / 2; }
    else { d.position.set(95.6, WALL_H + 0.34, 80 - ((t - 0.68) / 0.32) * 142); d.rotation.y = 0; }
    d.rotation.x = Math.PI / 2;
  }, 6001));

  // Chain-link fence sections in front of the east wall for depth
  for (let i = 0; i < 5; i++) {
    const f = P.fence(18, 2.2, 'chain', mSteelLight);
    f.position.set(88, 0, -40 + i * 26);
    f.rotation.y = Math.PI / 2;
    P.NOCOLLIDE(f);
    ctx.addDecor(f);
  }

  bake(ctx, perimVis);
  mergeProxy(ctx, perimBox, 'perimeter');

  // ---------------------------------------------------------------------------
  // 6. QUAYSIDE + SEA + MV KESTREL NINE
  // ---------------------------------------------------------------------------
  const SEA_Y = -2.2;
  const BED_Y = -2.85;
  const quayVis = new THREE.Group();
  const quayBox = [];

  // apron slab
  const apron = P.ground(212, 24, matQuay, { collide: false });
  apron.position.set(-7, 0.015, -50); apron.receiveShadow = true; quayVis.add(apron);

  // quay face down to the water, split for the slipway
  for (const [ax, bx] of [[-112, 62], [78, 98]]) {
    const w = P.boxC(bx - ax, 3.2, 1.2, matQuay, { collide: false });
    w.position.set((ax + bx) / 2, -1.6, -62.6); quayVis.add(w);
    pbox(quayBox, (ax + bx) / 2, -1.6, -62.6, bx - ax, 3.2, 1.2);
    // fender timbers
    for (let x = ax + 3; x < bx; x += 9) {
      const fd = P.boxC(0.35, 2.4, 0.3, matWood, { collide: false });
      fd.position.set(x, -1.2, -63.3); quayVis.add(fd);
    }
  }
  // kerb (0.5 m — you have to want to go in)
  for (const [ax, bx] of [[-112, -30], [-26, 62], [78, 98]]) {
    const k = P.boxC(bx - ax, 0.5, 0.45, matQuay, { collide: false });
    k.position.set((ax + bx) / 2, 0.25, -61.9); quayVis.add(k);
    pbox(quayBox, (ax + bx) / 2, 0.25, -61.9, bx - ax, 0.5, 0.45);
    const stripe = P.boxC(bx - ax, 0.02, 0.45, mPaintYellow, { collide: false, shadow: false });
    stripe.position.set((ax + bx) / 2, 0.51, -61.9); quayVis.add(stripe);
  }

  // slipway (the way back out if you go for a swim)
  const slipLen = Math.hypot(12.4, 2.85);
  const slip = P.boxC(15, 0.4, slipLen, matQuay, { collide: false });
  slip.position.set(70, -1.42, -68.3);
  slip.rotation.x = Math.atan2(2.85, 12.4);
  quayVis.add(slip);
  pbox(quayBox, 70, -1.42, -68.3, 15, 0.4, slipLen, 0, Math.atan2(2.85, 12.4));
  for (const sx of [-1, 1]) {
    const rip = P.boulder(2.2, 900 + sx, matRock);
    rip.position.set(70 + sx * 9.4, -2.4, -66); P.NOCOLLIDE(rip); quayVis.add(rip);
  }

  // seabed (0.65 m of water — a fall in is survivable and escapable)
  const bed = P.ground(216, 42, matRock, { collide: false });
  bed.position.set(-7, BED_Y, -83); quayVis.add(bed);
  pbox(quayBox, -7, BED_Y - 0.3, -83, 216, 0.6, 42);
  // outer sea boundary
  pbox(quayBox, -7, 8, -102, 220, 24, 1.0);
  pbox(quayBox, -112, 8, -82, 1.0, 24, 42);
  pbox(quayBox, 98, 8, -82, 1.0, 24, 42);

  // bollards + mooring ropes
  const bollGeo = P.mergeGeometries([
    new THREE.CylinderGeometry(0.24, 0.3, 0.75, 12).translate(0, 0.375, 0),
    new THREE.SphereGeometry(0.26, 12, 8).translate(0, 0.78, 0),
  ]);
  ctx.addDecor(P.scatter(bollGeo, mSteelDark, 24, (i, d, r) => {
    d.position.set(-98 + i * 8.2, 0, -60.4);
    if (d.position.x > 92) return false;
  }, 88));
  for (let i = 0; i < 24; i++) {
    const bx = -98 + i * 8.2;
    if (bx > 92) break;
    pbox(quayBox, bx, 0.4, -60.4, 0.6, 0.8, 0.6);
  }

  bake(ctx, quayVis);
  mergeProxy(ctx, quayBox, 'quay');

  // The ship: MV KESTREL NINE, alongside from x -72 .. 20
  const shipVis = new THREE.Group();
  const shipBox = [];
  const SHIP = { x0: -72, x1: 20, z0: -78.5, z1: -64.2, deck: 3.0 };
  const shipLen = SHIP.x1 - SHIP.x0, shipBeam = SHIP.z1 - SHIP.z0;
  const shipCX = (SHIP.x0 + SHIP.x1) / 2, shipCZ = (SHIP.z0 + SHIP.z1) / 2;
  const hull = P.boxC(shipLen, 6.6, shipBeam, matHull, { collide: false });
  hull.position.set(shipCX, -0.3, shipCZ); shipVis.add(hull);
  const boot = P.boxC(shipLen + 0.1, 0.7, shipBeam + 0.1, M.solid({ color: 0x6d2018, roughness: 0.85 }), { collide: false });
  boot.position.set(shipCX, -2.0, shipCZ); shipVis.add(boot);
  // bow wedge
  const bow = P.boxC(7, 6.6, shipBeam * 0.62, matHull, { collide: false });
  bow.position.set(SHIP.x0 - 2.6, -0.3, shipCZ); bow.rotation.y = 0.0; shipVis.add(bow);
  // main deck + hatch coamings
  const deck = P.boxC(shipLen, 0.4, shipBeam - 0.9, matPlate, { collide: false });
  deck.position.set(shipCX, SHIP.deck - 0.2, shipCZ); shipVis.add(deck);
  pbox(shipBox, shipCX, SHIP.deck - 0.2, shipCZ, shipLen, 0.4, shipBeam - 0.9);
  pbox(shipBox, shipCX, 0.4, shipCZ, shipLen, 7.4, shipBeam);   // hull volume (blocks the water gap)
  for (let i = 0; i < 5; i++) {
    const hx = SHIP.x0 + 12 + i * 15;
    const co = P.boxC(12, 0.65, shipBeam - 3.4, mSteelDark, { collide: false });
    co.position.set(hx, SHIP.deck + 0.32, shipCZ); shipVis.add(co);
    pbox(shipBox, hx, SHIP.deck + 0.32, shipCZ, 12, 0.65, shipBeam - 3.4);
    const lid = P.boxC(11.4, 0.16, shipBeam - 3.9, matPlate, { collide: false });
    lid.position.set(hx, SHIP.deck + 0.72, shipCZ); shipVis.add(lid);
    pbox(shipBox, hx, SHIP.deck + 0.72, shipCZ, 11.4, 0.16, shipBeam - 3.9);
  }
  // bulwarks (invisible over-height so you cannot fall into deep water)
  for (const sz of [-1, 1]) {
    const bw = P.boxC(shipLen, 1.25, 0.22, matHull, { collide: false });
    bw.position.set(shipCX, SHIP.deck + 0.6, shipCZ + sz * (shipBeam / 2 - 0.2)); shipVis.add(bw);
    pbox(shipBox, shipCX, SHIP.deck + 2.0, shipCZ + sz * (shipBeam / 2 - 0.2), shipLen, 4.0, 0.22);
  }
  pbox(shipBox, SHIP.x0 + 0.2, SHIP.deck + 2.0, shipCZ, 0.3, 4.0, shipBeam);
  // superstructure aft
  const ss = new THREE.Group();
  for (let l = 0; l < 4; l++) {
    const w = 11 - l * 1.1, d = shipBeam - 2.6 - l * 0.5;
    const b = P.boxC(w, 2.7, d, matClad, { collide: false });
    b.position.set(SHIP.x1 - 6, SHIP.deck + 1.35 + l * 2.7, shipCZ); ss.add(b);
    pbox(shipBox, SHIP.x1 - 6, SHIP.deck + 1.35 + l * 2.7, shipCZ, w, 2.7, d);
    for (let k = 0; k < 4; k++) {
      const win = P.boxC(1.3, 0.7, 0.06, l === 3 ? mGlassLit : M.glassCheap({ color: 0x2b3a44, opacity: 0.6 }),
        { collide: false, shadow: false });
      win.position.set(SHIP.x1 - 10.2 + k * 2.6, SHIP.deck + 1.9 + l * 2.7, shipCZ + d / 2 + 0.04);
      ss.add(win);
    }
  }
  const funnel = P.boxC(3.4, 4.2, 3.0, M.solid({ color: 0x9c3722, roughness: 0.7 }), { collide: false });
  funnel.position.set(SHIP.x1 - 3.4, SHIP.deck + 12.9, shipCZ); ss.add(funnel);
  const mast = P.cyl(0.12, 0.18, 8, mSteelLight, { seg: 8, collide: false });
  mast.position.set(SHIP.x1 - 9, SHIP.deck + 11.2, shipCZ); ss.add(mast);
  const navLamp = P.sphere(0.14, M.emissive(0xff4a3a, 8), { collide: false, seg: 8 });
  navLamp.position.set(SHIP.x1 - 9, SHIP.deck + 19.1, shipCZ); ss.add(navLamp);
  shipVis.add(ss);
  // name on the bow
  const nameTag = M.textMaterial('KESTREL  NINE', { color: 0xe8e0cc, fontSize: 90 });
  const np = P.boxC(9, 9 / nameTag.aspect, 0.05, nameTag.material, { collide: false, shadow: false });
  np.position.set(SHIP.x0 + 9, 1.6, SHIP.z1 + 0.06); shipVis.add(np);

  // gangway from quay to deck
  const gw = P.boxC(1.5, 0.14, Math.hypot(3.4, 3.0), matPlate, { collide: false });
  gw.position.set(-40, 1.5, -62.9);
  gw.rotation.x = -Math.atan2(3.0, 3.4);
  shipVis.add(gw);
  pbox(shipBox, -40, 1.5, -62.9, 1.5, 0.16, Math.hypot(3.4, 3.0), 0, -Math.atan2(3.0, 3.4));
  for (const sx of [-1, 1]) {
    const r = P.railing(4.6, 1.0, mSteelLight);
    r.rotation.y = Math.PI / 2; r.rotation.z = Math.atan2(3.0, 3.4) * sx * 0;
    r.position.set(-40 + sx * 0.78, 1.6, -62.9);
    P.NOCOLLIDE(r); shipVis.add(r);
  }
  // mooring ropes: catenary tubes quay <-> ship
  for (const [bx, sx2] of [[-90.2 + 8.2 * 3, SHIP.x0 + 4], [-90.2 + 8.2 * 9, SHIP.x0 + 26], [-90.2 + 8.2 * 13, SHIP.x1 - 12]]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(
        bx + (sx2 - bx) * t,
        0.7 + (SHIP.deck + 0.6 - 0.7) * t - Math.sin(t * Math.PI) * 1.7,
        -60.4 + (SHIP.z1 - 0.4 - -60.4) * t));
    }
    const rope = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.055, 5, false),
      M.solid({ color: 0x6d6353, roughness: 0.95 }));
    rope.castShadow = true; rope.userData.collide = false;
    shipVis.add(rope);
  }
  bake(ctx, shipVis);
  mergeProxy(ctx, shipBox, 'ship');
  paintSurf(SHIP.x0, SHIP.x1, SHIP.z0, SHIP.z1, 1);

  // the sea itself
  const waterMat = M.water({ color: 0x1c3c4e, repeat: 26, opacity: 0.94 });
  const seaGeo = new THREE.PlaneGeometry(700, 420, 1, 1);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, waterMat);
  sea.position.set(0, SEA_Y, -272);
  sea.userData.collide = false;
  sea.receiveShadow = false;
  ctx.addDecor(sea);

  // distant harbour arm so the horizon is not empty
  const farVis = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const b = P.boxC(rDress.range(18, 46), rDress.range(6, 22), rDress.range(10, 20), matSlab, { collide: false });
    b.position.set(-260 + i * 46, rDress.range(2, 8), -178 - rDress.range(0, 40));
    farVis.add(b);
  }
  for (let i = 0; i < 5; i++) {
    const c = P.cyl(3, 3.6, rDress.range(22, 40), matSlab, { seg: 10, collide: false });
    c.position.set(-150 + i * 70, 0, -196); farVis.add(c);
  }
  bake(ctx, farVis);

  // ---------------------------------------------------------------------------
  // 7. THE CONTAINER MAZE
  // ---------------------------------------------------------------------------
  // Blocks are axis-aligned cuboids of stacked 20 ft boxes. Because a whole
  // block shares one height, its roof is a flat, predictable platform and its
  // collision is ONE oriented box — cheap and exact.
  const blocks = [];
  const CONTAINER_CAP = 620;
  let containerCount = 0;

  const reservedHit = (x0, x1, z0, z1) => RESERVED.find(
    (r) => overlaps1D(x0, x1, r.x0, r.x1) > 0 && overlaps1D(z0, z1, r.z0, r.z1) > 0);

  for (let bi = 0; bi < BANDS.length; bi++) {
    const band = BANDS[bi];
    const bz0 = band.z0, bz1 = band.z0 + band.rows * CW;
    let x = MAZE.x0 + rMaze.range(0, 4.5);
    let guard = 0;
    while (x < MAZE.x1 - CL && guard++ < 60) {
      const segN = rMaze.pick([1, 1, 2, 2, 2, 3]);
      const w = segN * CL;
      if (x + w > MAZE.x1) break;
      const res = reservedHit(x, x + w, bz0, bz1);
      if (res) { x = res.x1 + rMaze.range(1.8, 3.4); continue; }
      if (rMaze.chance(0.82) && containerCount < CONTAINER_CAP) {
        // Stack height comes from a smooth noise field, so the yard reads as
        // terraces rather than random spikes — and, critically, neighbouring
        // stacks usually differ by 0 or 1 tier, which is what makes the roof
        // layer stitchable into a real second map.
        const qx = x + w / 2, qz = band.z0 + band.rows * CW / 2;
        let tn = Math.round(2.35 + ctx.noise.fbm(qx * 0.030, qz * 0.042, 3) * 3.4);
        if (rMaze.chance(0.18)) tn += rMaze.pick([-1, 1]);
        const tiers = Math.max(1, Math.min(4, tn));
        const rows = band.rows;
        const b = {
          x0: x, x1: x + w, z0: bz0, z1: bz0 + rows * CW,
          tiers, rows, cols: segN,
          cx: x + w / 2, cz: bz0 + rows * CW / 2,
          ry: rMaze.chance(0.16) ? rMaze.range(-0.028, 0.028) : 0,
          top: tiers * CH,
          links: 0,
        };
        blocks.push(b);
        containerCount += segN * rows * tiers;
        // occasionally shave the outermost row down a tier: makes a ledge and
        // breaks the "extruded rectangle" read of the block
        if (rows === 3 && tiers >= 3 && rMaze.chance(0.30)) {
          b.z1 -= CW; b.rows = 2; b.cz = b.z0 + b.rows * CW / 2;
          const low = {
            x0: b.x0, x1: b.x1, z0: b.z1, z1: b.z1 + CW,
            tiers: tiers - 1, rows: 1, cols: segN,
            cx: b.cx, cz: b.z1 + CW / 2, ry: b.ry, top: (tiers - 1) * CH, links: 0,
          };
          blocks.push(low);
          containerCount -= segN * 1;
        }
      }
      x += w + rMaze.pick([2.1, 2.4, 3.0, 3.8, 5.0, 6.4, 10.5]);
    }
  }

  // --- hand-built set pieces (inside the RESERVED rects) ---------------------
  const anchorTower = { x0: -40.6, x1: -28.5, z0: -4.30, z1: 3.02, tiers: 4, rows: 3, cols: 2,
    cx: -34.55, cz: -0.64, ry: 0, top: 4 * CH, links: 0 };
  const anchorMast = { x0: -13.4, x1: -1.3, z0: -11.20, z1: -6.32, tiers: 3, rows: 2, cols: 2,
    cx: -7.35, cz: -8.76, ry: 0, top: 3 * CH, links: 0 };
  blocks.push(anchorTower, anchorMast);
  containerCount += 2 * 3 * 4 + 2 * 2 * 3;

  // stepped ramp: 1 / 2 / 3 / 4 high, joined by checkerplate gangways
  const rampSteps = [];
  for (let s = 0; s < 4; s++) {
    const bx0 = 24 + s * 10.26;
    const b = {
      x0: bx0, x1: bx0 + CL, z0: 16.90, z1: 16.90 + 3 * CW,
      tiers: s + 1, rows: 3, cols: 1,
      cx: bx0 + CL / 2, cz: 16.90 + 3 * CW / 2, ry: 0, top: (s + 1) * CH, links: 0,
    };
    blocks.push(b); rampSteps.push(b);
    containerCount += 3 * (s + 1);
  }

  // Guarantee the hand-built climbs actually lead somewhere: force the nearest
  // procedural stacks beside each entry hub to a matching (or one-tier-down)
  // height, so the link pass below is certain to bridge them into the network.
  {
    const hubs = [anchorTower, anchorMast, rampSteps[3]];
    const hubSet = new Set([anchorTower, anchorMast, ...rampSteps]);
    for (const hub of hubs) {
      const near = [];
      for (const b of blocks) {
        if (hubSet.has(b)) continue;
        const ovZ = overlaps1D(b.z0, b.z1, hub.z0, hub.z1);
        const ovX = overlaps1D(b.x0, b.x1, hub.x0, hub.x1);
        let gap = Infinity;
        if (ovZ > 1.5) gap = b.x0 > hub.x1 ? b.x0 - hub.x1 : hub.x0 - b.x1;
        else if (ovX > 1.5) gap = b.z0 > hub.z1 ? b.z0 - hub.z1 : hub.z0 - b.z1;
        if (!(gap >= 1.4 && gap <= 8.6)) continue;
        near.push({ b, gap });
      }
      near.sort((p, q) => p.gap - q.gap);
      for (const n of near.slice(0, 2)) {
        const t = n.gap >= CH * 0.95 ? Math.max(1, hub.tiers - 1) : hub.tiers;
        containerCount += (t - n.b.tiers) * n.b.cols * n.b.rows;
        n.b.tiers = t;
        n.b.top = t * CH;
      }
    }
  }

  // Fill the blocks with actual containers, chunked so the GPU can cull.
  const CHUNKS = 4;
  const chunkGroups = [];
  for (let i = 0; i < CHUNKS; i++) chunkGroups.push(new THREE.Group());
  const decalGroup = new THREE.Group();
  const mazeBox = [];

  for (const b of blocks) {
    const ci = Math.min(CHUNKS - 1, Math.floor(((b.cx - MAZE.x0) / (MAZE.x1 - MAZE.x0)) * CHUNKS));
    const grp = new THREE.Group();
    grp.position.set(b.cx, 0, b.cz);
    grp.rotation.y = b.ry;
    const nx = b.cols, nz = b.rows;
    for (let t = 0; t < b.tiers; t++) {
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          const li = rMaze.int(0, LIVERY.length - 1);
          const c = P.container(CL, LIVERY[li], li);
          const lx = -(nx * CL) / 2 + CL * (ix + 0.5);
          const lz = -(nz * CW) / 2 + CW * (iz + 0.5);
          c.position.set(lx, t * CH, lz);
          grp.add(c);

          // long-face stencil on exposed rows, mostly at eye level
          const faceZ = iz === 0 ? -1 : (iz === nz - 1 ? 1 : 0);
          if (faceZ !== 0 && rMaze.chance(t === 0 ? 0.42 : 0.14)) {
            const st = stencils[rMaze.int(0, stencils.length - 1)];
            const h = 0.72;
            const pl = P.boxC(h * st.aspect, h, 0.03, st.material, { collide: false, shadow: false });
            const [wx, wz] = blockToWorld(b, lx + rMaze.range(-1.1, 1.1), lz + faceZ * (CW / 2 + 0.03));
            pl.position.set(wx, t * CH + 1.72, wz);
            pl.rotation.y = b.ry + (faceZ > 0 ? 0 : Math.PI);
            decalGroup.add(pl);
          }
          // door end plate on exposed X ends
          const faceX = ix === 0 ? -1 : (ix === nx - 1 ? 1 : 0);
          if (faceX !== 0 && rMaze.chance(0.5)) {
            const pl = P.boxC(CW - 0.28, CH - 0.26, 0.03, mDoorEnd, { collide: false, shadow: false });
            const [wx, wz] = blockToWorld(b, lx + faceX * (CL / 2 + 0.03), lz);
            pl.position.set(wx, t * CH + CH / 2, wz);
            pl.rotation.y = b.ry + faceX * Math.PI / 2;
            decalGroup.add(pl);
          }
        }
      }
    }
    chunkGroups[ci].add(grp);
    pbox(mazeBox, b.cx, (b.tiers * CH) / 2, b.cz, nx * CL, b.tiers * CH, nz * CW, b.ry);
    paintSurf(b.x0 - 0.4, b.x1 + 0.4, b.z0 - 0.4, b.z1 + 0.4, 1);
  }
  for (const g of chunkGroups) bake(ctx, g);
  bake(ctx, decalGroup);
  mergeProxy(ctx, mazeBox, 'maze');

  // --- rooftop connectivity pass ---------------------------------------------
  // Stitch block tops into one continuous second map: flat plates across narrow
  // alleys at equal height, sloped gangways where the tops differ by one tier.
  const linkVis = new THREE.Group();
  const linkBox = [];
  const cands = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.top < 2.5 || b.top < 2.5) continue;
      const dh = Math.abs(a.top - b.top);
      if (dh > 2 * CH + 0.05) continue;
      let axis = null, gap = 0, mid = 0;
      const ovZ = overlaps1D(a.z0, a.z1, b.z0, b.z1);
      const ovX = overlaps1D(a.x0, a.x1, b.x0, b.x1);
      if (ovZ > 1.5) {
        gap = a.x1 < b.x0 ? b.x0 - a.x1 : a.x0 - b.x1;
        axis = 'x'; mid = (Math.max(a.z0, b.z0) + Math.min(a.z1, b.z1)) / 2;
      } else if (ovX > 1.5) {
        gap = a.z1 < b.z0 ? b.z0 - a.z1 : a.z0 - b.z1;
        axis = 'z'; mid = (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2;
      }
      if (!axis || gap < 1.4 || gap > 8.6) continue;
      if (gap < dh * 0.95) continue;            // cap gangway pitch at ~46 deg
      cands.push({ a, b, axis, gap, mid, dh, key: (a.cx + b.cx) * 7.13 + (a.cz + b.cz) * 3.31 });
    }
  }
  cands.sort((p, q) => p.key - q.key);
  let flatMade = 0, slopeMade = 0;
  for (const c of cands) {
    const wantSlope = c.dh > 0.05;
    if (wantSlope && slopeMade >= 40) continue;
    if (!wantSlope && flatMade >= 44) continue;
    if (c.a.links >= 5 || c.b.links >= 5) continue;
    if (!wantSlope && rDress.chance(0.10)) continue;   // leave holes in the roof net
    const a = c.a, b = c.b;
    let ax, az, bx, bz;
    if (c.axis === 'x') {
      const left = a.x1 < b.x0 ? a : b, right = a.x1 < b.x0 ? b : a;
      ax = left.x1 - 0.25; bx = right.x0 + 0.25; az = c.mid; bz = c.mid;
      walkPlate(ctx, linkVis, linkBox, ax, left.top, az, bx, right.top, bz, 1.7, matPlate);
    } else {
      const near = a.z1 < b.z0 ? a : b, far = a.z1 < b.z0 ? b : a;
      az = near.z1 - 0.25; bz = far.z0 + 0.25; ax = c.mid; bx = c.mid;
      walkPlate(ctx, linkVis, linkBox, ax, near.top, az, bx, far.top, bz, 1.7, matPlate);
    }
    a.links++; b.links++;
    if (wantSlope) slopeMade++; else flatMade++;
  }

  // stepped-ramp gangways (ground -> 1 -> 2 -> 3 -> 4)
  const rampRun = new THREE.Group();
  walkPlate(ctx, rampRun, linkBox, 18.4, 0.05, 20.56, 24.4, CH, 20.56, 2.2, matPlate);
  for (let s = 0; s < 3; s++) {
    const lo = rampSteps[s], hi = rampSteps[s + 1];
    walkPlate(ctx, rampRun, linkBox, lo.x1 - 0.3, lo.top, 20.56, hi.x0 + 0.3, hi.top, 20.56, 2.2, matPlate);
  }
  linkVis.add(rampRun);
  bake(ctx, linkVis);

  // ---------------------------------------------------------------------------
  // 8. VERTICAL ROUTES
  // ---------------------------------------------------------------------------
  const climbVis = new THREE.Group();
  const climbBox = [];

  // Route 1 — scaffold stair tower against the west anchor block.
  {
    const t = stairTower(ctx, { rise: anchorTower.top, flightRise: 2.59, run: 3.5, width: 1.4, mat: matSteel, treadMat: matPlate });
    const ox = -44.6, oz = -3.2, oy = 0;
    t.vis.position.set(ox, oy, oz);
    t.vis.rotation.y = 0;
    for (const b of t.boxes) {
      pbox(climbBox, ox + b.cx, oy + b.cy, oz + b.cz, b.w, b.h, b.d, b.ry, b.rx, b.rz);
    }
    climbVis.add(t.vis);
    // bridge from the top landing onto the 4-high anchor block
    walkPlate(ctx, climbVis, climbBox,
      ox + t.exit.x, anchorTower.top, oz + t.exit.z,
      anchorTower.x0 + 0.4, anchorTower.top, oz + t.exit.z, 1.8, matPlate);
  }

  // Route 3 — floodlight mast with an inclined caged ladder-stair to a platform
  // that bridges onto the 3-high anchor block.
  {
    const mx = -7.35, mz = -14.2, platY = 8.0;
    const mast = P.cyl(0.16, 0.30, 17.5, mSteelDark, { seg: 10, collide: false });
    mast.position.set(mx, 0, mz); climbVis.add(mast);
    pbox(climbBox, mx, 8.75, mz, 0.62, 17.5, 0.62);
    // service platform
    const plat = P.boxC(3.0, 0.14, 2.6, matPlate, { collide: false });
    plat.position.set(mx, platY, mz); climbVis.add(plat);
    pbox(climbBox, mx, platY, mz, 3.0, 0.16, 2.6);
    for (const [dx, dz, w2, d2] of [[0, -1.3, 3.0, 0.1], [-1.5, 0, 0.1, 2.6], [1.5, 0, 0.1, 2.6]]) {
      pbox(climbBox, mx + dx, platY + 0.62, mz + dz, w2, 1.2, d2);
      const r = P.railing(w2 > d2 ? 3.0 : 2.6, 1.1, mSteelLight);
      r.rotation.y = w2 > d2 ? 0 : Math.PI / 2;
      r.position.set(mx + dx, platY + 0.07, mz + dz);
      P.NOCOLLIDE(r); climbVis.add(r);
    }
    // 60 deg caged ladder-stair
    const lrun = 4.62, lrise = platY;
    const llen = Math.hypot(lrun, lrise);
    const lpitch = Math.atan2(lrise, lrun);
    const lcx = mx + 1.5 + lrun / 2;
    // slope runs along +X, so the proxy is pitched about Z
    pbox(climbBox, lcx, lrise / 2 - 0.12, mz, llen, 0.3, 0.95, 0, 0, -lpitch);
    // side walls hug the slope so you cannot step off sideways mid-climb
    for (const sz of [-1, 1]) {
      pbox(climbBox, lcx, lrise / 2 + 0.45, mz + sz * 0.58, llen, 1.5, 0.12, 0, 0, -lpitch);
    }
    for (let s = 0; s < 22; s++) {
      const t2 = (s + 0.5) / 22;
      const st = P.boxC(0.34, 0.05, 0.82, matPlate, { collide: false, shadow: false });
      st.position.set(mx + 1.5 + lrun * (1 - t2), lrise * t2, mz);
      climbVis.add(st);
    }
    for (const sz of [-1, 1]) {
      const sr = P.boxC(0.08, 0.2, llen, mSteelDark, { collide: false });
      sr.position.set(lcx, lrise / 2 - 0.16, mz + sz * 0.48);
      sr.rotation.set(0, Math.PI / 2, -lpitch, 'YXZ');
      climbVis.add(sr);
    }
    // cage hoops
    for (let s = 1; s < 9; s++) {
      const t2 = s / 9;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.02, 4, 12), mSteelLight);
      hoop.position.set(mx + 1.5 + lrun * (1 - t2), lrise * t2 + 0.6, mz);
      hoop.rotation.y = Math.PI / 2; hoop.rotation.z = lpitch;
      hoop.userData.collide = false; climbVis.add(hoop);
    }
    // floodlight heads
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const head = P.boxC(0.9, 0.28, 0.5, mSteelDark, { collide: false });
      head.position.set(mx + Math.cos(a) * 0.95, 17.2, mz + Math.sin(a) * 0.95);
      head.rotation.y = -a; climbVis.add(head);
      const lens = P.boxC(0.8, 0.06, 0.42, mSodium, { collide: false, shadow: false });
      lens.position.set(mx + Math.cos(a) * 0.95, 17.03, mz + Math.sin(a) * 0.95);
      lens.rotation.y = -a; climbVis.add(lens);
    }
    // bridge from platform to the 3-high anchor block
    walkPlate(ctx, climbVis, climbBox, mx, platY, mz + 1.3, mx, anchorMast.top, anchorMast.z0 + 0.4, 1.8, matPlate);
  }

  // Extra floodlight masts around the yard (geometry + emissive only)
  const mastSpots = [[-58, -46], [-58, 62], [86, -46], [86, 62], [30, 68], [-24, 56]];
  for (const [mx, mz] of mastSpots) {
    const mast = P.cyl(0.16, 0.30, 17.5, mSteelDark, { seg: 8, collide: false });
    mast.position.set(mx, 0, mz); climbVis.add(mast);
    pbox(climbBox, mx, 8.75, mz, 0.62, 17.5, 0.62);
    const lad = P.ladder(16.5, mSteelLight);
    lad.position.set(mx, 0.4, mz + 0.34); P.NOCOLLIDE(lad); climbVis.add(lad);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const head = P.boxC(0.9, 0.28, 0.5, mSteelDark, { collide: false });
      head.position.set(mx + Math.cos(a) * 0.95, 17.2, mz + Math.sin(a) * 0.95);
      head.rotation.y = -a; climbVis.add(head);
      const lens = P.boxC(0.8, 0.06, 0.42, mSodium, { collide: false, shadow: false });
      lens.position.set(mx + Math.cos(a) * 0.95, 17.03, mz + Math.sin(a) * 0.95);
      lens.rotation.y = -a; climbVis.add(lens);
    }
  }
  // A handful of real sodium pools (unshadowed) under the masts
  for (const [mx, mz] of [[-58, -46], [86, 62], [30, 68], [-7.35, -14.2]]) {
    const pl = new THREE.PointLight(0xffb257, 34, 42, 2.0);
    pl.position.set(mx, 16.4, mz);
    ctx.light(pl, { shadow: false });
  }

  // ---------------------------------------------------------------------------
  // 9. THE COLLAPSED STACK
  // ---------------------------------------------------------------------------
  {
    const cvis = new THREE.Group();
    const base = { x0: 52, x1: 64.12, z0: -4.30, z1: 0.58, tiers: 2, cx: 58.06, cz: -1.86 };
    for (let t = 0; t < 2; t++) for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) {
      const li = rDress.int(0, LIVERY.length - 1);
      const c = P.container(CL, LIVERY[li], li);
      c.position.set(base.x0 + CL * (ix + 0.5), t * CH, base.z0 + CW * (iz + 0.5));
      cvis.add(c);
    }
    pbox(climbBox, base.cx, CH, base.cz, 2 * CL, 2 * CH, 2 * CW);
    blocks.push({ ...base, rows: 2, cols: 2, ry: 0, top: 2 * CH, links: 3 });
    containerCount += 8;
    // toppled boxes
    const fallen = [
      [67.2, 1.3, -2.2, 0.0, 0.12, Math.PI / 2],
      [69.8, 1.28, 2.4, 0.35, -0.06, Math.PI / 2],
      [64.0, 0.62, 4.9, 1.1, 0.0, 0.0],
      [71.6, 3.6, -1.0, 0.2, 0.5, Math.PI / 2],
      [60.2, 5.3, 1.4, 0.05, -0.22, 0.0],
      [73.0, 0.6, 5.2, 0.8, 0.04, 0.0],
    ];
    for (const [fx, fy, fz, ry, rz, extra] of fallen) {
      const li = rDress.int(0, LIVERY.length - 1);
      const c = P.container(CL, LIVERY[li], li);
      c.position.set(fx, fy - CH / 2, fz);
      c.rotation.set(0, ry + extra, rz, 'YXZ');
      cvis.add(c);
      pbox(climbBox, fx, fy, fz, CL, CH, CW, ry + extra, 0, rz);
      containerCount += 1;
    }
    const rb0 = P.rubble(4.5, 22, matSlab, 77); rb0.position.set(64.5, 0, -3.6);
    P.NOCOLLIDE(rb0); cvis.add(rb0);
    const rb = P.rubble(3.4, 16, matSlab, 91); rb.position.set(69, 0, 2.4);
    P.NOCOLLIDE(rb); cvis.add(rb);
    for (let i = 0; i < 7; i++) {
      const cr = P.crate(rDress.range(0.7, 1.15), matWood);
      cr.position.set(rDress.range(63, 73), 0, rDress.range(-4, 6));
      cr.rotation.y = rDress.range(0, 3.1);
      P.NOCOLLIDE(cr); cvis.add(cr);
    }
    // flapping loose tarpaulin over the wreck
    const tarpGeo = new THREE.PlaneGeometry(7.2, 4.4, 14, 8);
    const tarp = new THREE.Mesh(tarpGeo, matTarp);
    tarp.material.side = THREE.DoubleSide;
    tarp.position.set(66.4, 3.1, -2.0);
    tarp.rotation.set(-1.25, 0.4, 0.1);
    tarp.castShadow = true; tarp.userData.collide = false;
    ctx.addDecor(tarp);
    ctx.onUpdate((dt, el) => {
      const pos = tarpGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        pos.setZ(i, Math.sin(el * 2.4 + x * 0.9 + y * 0.4) * 0.14 * (0.35 + (x + 3.6) / 7.2));
      }
      pos.needsUpdate = true;
    });
    // a buckled deck plate leans against the wreck — the fourth way up
    walkPlate(ctx, climbVis, climbBox, 59, 0.05, 8.6, 59, 2 * CH, 1.2, 2.0, matPlate);
    bake(ctx, cvis);
    ctx.hidingSpot(67.6, 0.9, 0.4, 1.6, 1.0);
  }

  // ---------------------------------------------------------------------------
  // 10. LOOSE / OPEN CONTAINERS  (enterable, the best hiding places)
  // ---------------------------------------------------------------------------
  const openVis = new THREE.Group();
  const openBox = [];
  const openSpots = [
    [-33.0, 13.6, 0.02, 2, false],
    [12.4, -20.6, Math.PI, 4, false],
    [50.5, 42.0, 0.0, 6, false],
    [-19.0, 33.2, Math.PI * 0.5, 0, false],
    [63.0, 12.4, Math.PI, 8, false],
    [-3.4, 44.0, 0.04, 3, false],
    [33.6, -28.4, Math.PI, 5, true],      // the "closed" one — pup lives here
    [78.0, -8.0, Math.PI * 0.5, 7, false],
  ];
  for (const [ox, oz, ory, li, ajar] of openSpots) {
    openContainer(ctx, openVis, openBox, ox, oz, ory, li, ajar);
    ctx.hidingSpot(ox, 1.0, oz, 1.9, 1.0);
    paintSurf(ox - 3.4, ox + 3.4, oz - 1.6, oz + 1.6, 1);
  }
  // one of them is full of crates
  for (let i = 0; i < 6; i++) {
    const cr = P.crate(0.86, matWood);
    cr.position.set(48.4 + (i % 3) * 0.95, Math.floor(i / 3) * 0.88 + 0.12, 41.4 + ((i % 2) * 0.9));
    P.NOCOLLIDE(cr); openVis.add(cr);
  }
  bake(ctx, openVis);
  mergeProxy(ctx, openBox, 'opencontainers');

  // ---------------------------------------------------------------------------
  // 11. GANTRY CRANES
  // ---------------------------------------------------------------------------
  // --- PN-1: ship-to-shore crane on the quay, with the service climb ---------
  const CRANE_X = -25;
  const BOOM_Y = 26.4;
  let trolleyA = null, cabA = null;
  {
    const legZ = [-57, -42];
    const legX = [CRANE_X - 8, CRANE_X + 8];
    for (const lz of legZ) for (const lx of legX) {
      const col = P.boxC(1.5, BOOM_Y, 1.5, matSteel, { collide: false });
      col.position.set(lx, BOOM_Y / 2, lz); climbVis.add(col);
      pbox(climbBox, lx, BOOM_Y / 2, lz, 1.6, BOOM_Y, 1.6);
      // bogie
      const bg = P.boxC(2.2, 1.1, 3.4, mSteelDark, { collide: false });
      bg.position.set(lx, 0.55, lz); climbVis.add(bg);
      pbox(climbBox, lx, 0.55, lz, 2.2, 1.1, 3.4);
      // lattice bracing
      for (let y = 3; y < BOOM_Y - 2; y += 4.2) {
        const br = P.boxC(0.24, 0.24, 5.6, matSteel, { collide: false, shadow: false });
        br.position.set(lx, y + 2.1, (legZ[0] + legZ[1]) / 2);
        br.rotation.x = Math.atan2(4.2, 15) * (Math.floor(y / 4.2) % 2 ? 1 : -1);
        br.scale.z = 15 / 5.6;
        climbVis.add(br);
      }
    }
    // portal beams
    for (const lz of legZ) {
      for (const y of [15.5, BOOM_Y - 0.9]) {
        const bm = P.girder(17.5, matSteel, { scale: 4 });
        bm.position.set(CRANE_X, y, lz); P.NOCOLLIDE(bm); climbVis.add(bm);
      }
    }
    for (const lx of legX) {
      const bm = P.girder(16, matSteel, { scale: 4 });
      bm.rotation.y = Math.PI / 2;
      bm.position.set(lx, BOOM_Y - 0.9, (legZ[0] + legZ[1]) / 2);
      P.NOCOLLIDE(bm); climbVis.add(bm);
    }
    // the boom: seaward reach + landside backreach
    const boomZ0 = -92, boomZ1 = -31;
    for (const lx of [CRANE_X - 3.4, CRANE_X + 3.4]) {
      const bm = P.boxC(1.5, 1.9, boomZ1 - boomZ0, matSteel, { collide: false });
      bm.position.set(lx, BOOM_Y + 1.0, (boomZ0 + boomZ1) / 2); climbVis.add(bm);
    }
    for (let z = boomZ0 + 3; z < boomZ1; z += 6) {
      const tie = P.boxC(7.8, 0.3, 0.3, matSteel, { collide: false, shadow: false });
      tie.position.set(CRANE_X, BOOM_Y + 1.95, z); climbVis.add(tie);
      const dia = P.boxC(9.4, 0.22, 0.22, matSteel, { collide: false, shadow: false });
      dia.position.set(CRANE_X, BOOM_Y + 0.2, z + 3);
      dia.rotation.y = 0.6 * ((z / 6) % 2 ? 1 : -1); climbVis.add(dia);
    }
    // A-frame + tie-back stays
    const apex = new THREE.Vector3(CRANE_X, 42, -49.5);
    for (const lx of legX) {
      const leg = P.boxC(0.9, 17, 0.9, matSteel, { collide: false });
      leg.position.set((lx + apex.x) / 2, (BOOM_Y + apex.y) / 2, -49.5);
      leg.rotation.z = Math.atan2(lx - apex.x, apex.y - BOOM_Y);
      leg.scale.y = Math.hypot(apex.y - BOOM_Y, lx - apex.x) / 17;
      climbVis.add(leg);
    }
    for (const tz of [boomZ0 + 4, boomZ1 - 3]) {
      const d = Math.hypot(apex.y - BOOM_Y - 2, tz + 49.5);
      const stay = P.cyl(0.09, 0.09, d, mSteelDark, { seg: 6, collide: false });
      stay.position.set(CRANE_X, BOOM_Y + 2, tz);
      stay.rotation.x = -Math.atan2(tz + 49.5, apex.y - BOOM_Y - 2);
      climbVis.add(stay);
    }
    const apexCap = P.boxC(17, 1.0, 1.6, matSteel, { collide: false });
    apexCap.position.copy(apex); climbVis.add(apexCap);
    const beacon = P.sphere(0.2, M.emissive(0xff3b2a, 9), { collide: false, seg: 8 });
    beacon.position.set(CRANE_X, 42.9, -49.5); climbVis.add(beacon);

    // machinery house
    const mh = P.boxC(9, 5.4, 6.4, matClad, { collide: false });
    mh.position.set(CRANE_X, BOOM_Y + 4.6, -35.5); climbVis.add(mh);
    pbox(climbBox, CRANE_X, BOOM_Y + 4.6, -35.5, 9, 5.4, 6.4);
    for (let i = 0; i < 3; i++) {
      const w = P.boxC(1.1, 0.8, 0.06, mGlassLit, { collide: false, shadow: false });
      w.position.set(CRANE_X - 2.6 + i * 2.6, BOOM_Y + 5.0, -32.28); climbVis.add(w);
    }

    // service stair tower up the landside leg
    const st = stairTower(ctx, { rise: BOOM_Y, flightRise: 2.4, run: 3.5, width: 1.4, mat: matSteel, treadMat: matPlate });
    const sx = CRANE_X - 11.6, sz = -44.4;
    st.vis.position.set(sx, 0, sz);
    climbVis.add(st.vis);
    for (const b of st.boxes) pbox(climbBox, sx + b.cx, b.cy, sz + b.cz, b.w, b.h, b.d, b.ry, b.rx, b.rz);
    const exZ = sz + st.exit.z;
    // connector from the stair top across to the boom catwalk
    walkPlate(ctx, climbVis, climbBox, sx, BOOM_Y, exZ, CRANE_X - 4.6, BOOM_Y, exZ, 1.7, matPlate);

    // boom catwalk — the vantage point
    const cwZ0 = -88, cwZ1 = -32;
    const cw = P.boxC(1.9, 0.14, cwZ1 - cwZ0, matPlate, { collide: false });
    cw.position.set(CRANE_X - 4.6, BOOM_Y - 0.07, (cwZ0 + cwZ1) / 2); climbVis.add(cw);
    pbox(climbBox, CRANE_X - 4.6, BOOM_Y - 0.07, (cwZ0 + cwZ1) / 2, 1.9, 0.16, cwZ1 - cwZ0);
    for (const sxo of [-1, 1]) {
      if (sxo < 0) {
        // leave a doorway where the stair connector arrives
        pbox(climbBox, CRANE_X - 5.58, BOOM_Y + 1.0, (cwZ0 - 41.5) / 2, 0.12, 2.0, -41.5 - cwZ0);
        pbox(climbBox, CRANE_X - 5.58, BOOM_Y + 1.0, (-37.6 + cwZ1) / 2, 0.12, 2.0, cwZ1 + 37.6);
      } else {
        pbox(climbBox, CRANE_X - 3.62, BOOM_Y + 1.0, (cwZ0 + cwZ1) / 2, 0.12, 2.0, cwZ1 - cwZ0);
      }
      for (let z = cwZ0; z < cwZ1; z += 8) {
        if (sxo < 0 && z === -40) continue;   // the doorway
        const r = P.railing(8, 1.1, mSteelLight, { postEvery: 1.6 });
        r.rotation.y = Math.PI / 2;
        r.position.set(CRANE_X - 4.6 + sxo * 0.95, BOOM_Y, z + 4);
        P.NOCOLLIDE(r); climbVis.add(r);
      }
    }
    pbox(climbBox, CRANE_X - 4.6, BOOM_Y + 1.0, cwZ0 - 0.1, 2.1, 2.0, 0.14);
    pbox(climbBox, CRANE_X - 4.6, BOOM_Y + 1.0, cwZ1 + 0.1, 2.1, 2.0, 0.14);

    // trolley + cab (animated)
    trolleyA = new THREE.Group();
    const tr = P.boxC(6.4, 1.4, 3.4, mSteelDark, { collide: false });
    tr.position.y = BOOM_Y - 0.6; trolleyA.add(tr);
    cabA = P.boxC(2.6, 2.2, 2.4, mSteelDark, { collide: false });
    cabA.position.set(CRANE_X * 0, BOOM_Y - 2.6, 1.6); trolleyA.add(cabA);
    const cabGlass = P.boxC(2.4, 1.1, 0.06, mGlassLit, { collide: false, shadow: false });
    cabGlass.position.set(0, BOOM_Y - 2.3, 2.83); trolleyA.add(cabGlass);
    // hoist ropes + spreader
    for (const sxo of [-1, 1]) for (const szo of [-1, 1]) {
      const rope = P.cyl(0.04, 0.04, 15, mSteelDark, { seg: 4, collide: false });
      rope.position.set(sxo * 1.6, BOOM_Y - 16.3, szo * 1.0); trolleyA.add(rope);
    }
    const spreader = P.boxC(6.4, 0.7, 2.5, mPaintYellow, { collide: false });
    spreader.position.set(0, BOOM_Y - 16.6, 0); trolleyA.add(spreader);
    trolleyA.position.set(CRANE_X, 0, -60);
    ctx.addDecor(trolleyA);
    const cabLight = new THREE.PointLight(0xffd9a0, 12, 18, 2);
    cabLight.position.set(CRANE_X, BOOM_Y - 2.4, -58);
    ctx.light(cabLight, { shadow: false });

    // tucked on the catwalk under the machinery house
    ctx.hidingSpot(CRANE_X - 4.6, BOOM_Y + 1.0, -35.5, 2.0, 0.9);
  }

  // --- PN-2: rail-mounted gantry straddling the yard -------------------------
  let trolleyB = null;
  {
    const gx = 42, gy = 30;
    const legsZ = [-14.4, 34.2];
    for (const lz of legsZ) {
      for (const sx of [-3.7, 3.7]) {
        const col = P.boxC(1.15, gy, 1.15, matSteel, { collide: false });
        col.position.set(gx + sx, gy / 2, lz); climbVis.add(col);
        pbox(climbBox, gx + sx, gy / 2, lz, 1.25, gy, 1.25);
        const bogie = P.boxC(1.7, 0.9, 2.8, mSteelDark, { collide: false });
        bogie.position.set(gx + sx, 0.45, lz); climbVis.add(bogie);
        pbox(climbBox, gx + sx, 0.45, lz, 1.7, 0.9, 2.8);
      }
      const cap = P.girder(9.4, matSteel, { scale: 3.4 });
      cap.position.set(gx, gy - 0.6, lz); P.NOCOLLIDE(cap); climbVis.add(cap);
      const lad = P.ladder(gy - 1, mSteelLight);
      lad.position.set(gx - 3.7, 0.4, lz + 0.66); P.NOCOLLIDE(lad); climbVis.add(lad);
    }
    for (const sx of [-3.7, 3.7]) {
      const gir = P.boxC(1.3, 2.2, 58, matSteel, { collide: false });
      gir.position.set(gx + sx, gy + 1.1, (legsZ[0] + legsZ[1]) / 2); climbVis.add(gir);
      for (let z = legsZ[0] - 4; z < legsZ[1] + 4; z += 5.5) {
        const d = P.boxC(0.2, 0.2, 6.2, matSteel, { collide: false, shadow: false });
        d.position.set(gx + sx, gy + 1.1, z);
        d.rotation.x = 0.55 * ((Math.round(z) % 11) ? 1 : -1);
        climbVis.add(d);
      }
    }
    for (let z = legsZ[0]; z <= legsZ[1]; z += 7.2) {
      const tie = P.boxC(8.6, 0.28, 0.28, matSteel, { collide: false, shadow: false });
      tie.position.set(gx, gy + 2.3, z); climbVis.add(tie);
    }
    const house = P.boxC(6.2, 3.2, 4.4, matClad, { collide: false });
    house.position.set(gx, gy + 3.9, legsZ[0] + 6); climbVis.add(house);
    const bcn = P.sphere(0.18, M.emissive(0xff3b2a, 9), { collide: false, seg: 8 });
    bcn.position.set(gx, gy + 5.8, legsZ[0] + 6); climbVis.add(bcn);

    trolleyB = new THREE.Group();
    const t2 = P.boxC(8.6, 1.2, 3.0, mSteelDark, { collide: false });
    t2.position.y = gy + 0.2; trolleyB.add(t2);
    for (const sxo of [-1, 1]) for (const szo of [-1, 1]) {
      const rope = P.cyl(0.035, 0.035, 14, mSteelDark, { seg: 4, collide: false });
      rope.position.set(sxo * 2.6, gy - 7.4, szo * 0.9); trolleyB.add(rope);
    }
    const sp2 = P.boxC(6.4, 0.7, 2.5, mPaintYellow, { collide: false });
    sp2.position.set(0, gy - 7.6, 0); trolleyB.add(sp2);
    trolleyB.position.set(gx, 0, 6);
    ctx.addDecor(trolleyB);
  }

  bake(ctx, climbVis);
  mergeProxy(ctx, climbBox, 'structures');
  mergeProxy(ctx, linkBox, 'rooflinks');

  // ---------------------------------------------------------------------------
  // 12. THE WAREHOUSE SHED
  // ---------------------------------------------------------------------------
  const WH = { x0: -104, x1: -70, z0: -16, z1: 44, h: 11 };
  const whVis = new THREE.Group();
  const whBox = [];
  const shafts = [];
  {
    const cx = (WH.x0 + WH.x1) / 2, cz = (WH.z0 + WH.z1) / 2;
    const w = WH.x1 - WH.x0, d = WH.z1 - WH.z0;
    const floor = P.ground(w - 0.6, d - 0.6, matSlab, { collide: false });
    floor.position.set(cx, 0.02, cz); floor.receiveShadow = true; whVis.add(floor);

    const wallT = 0.4;
    // west + east long walls
    for (const sx of [-1, 1]) {
      const wl = P.boxC(wallT, WH.h, d, matClad, { collide: false });
      wl.position.set(cx + sx * (w / 2), WH.h / 2, cz); whVis.add(wl);
      pbox(whBox, cx + sx * (w / 2), WH.h / 2, cz, wallT, WH.h, d);
    }
    // south gable wall
    const sw = P.boxC(w + wallT, WH.h, wallT, matClad, { collide: false });
    sw.position.set(cx, WH.h / 2, WH.z1); whVis.add(sw);
    pbox(whBox, cx, WH.h / 2, WH.z1, w + wallT, WH.h, wallT);
    // north wall with the big roller-door opening
    for (const [ax, bx] of [[WH.x0, cx - 10], [cx + 10, WH.x1]]) {
      const nw = P.boxC(bx - ax, WH.h, wallT, matClad, { collide: false });
      nw.position.set((ax + bx) / 2, WH.h / 2, WH.z0); whVis.add(nw);
      pbox(whBox, (ax + bx) / 2, WH.h / 2, WH.z0, bx - ax, WH.h, wallT);
    }
    const lintel = P.boxC(20, WH.h - 8, wallT, matClad, { collide: false });
    lintel.position.set(cx, 8 + (WH.h - 8) / 2, WH.z0); whVis.add(lintel);
    pbox(whBox, cx, 8 + (WH.h - 8) / 2, WH.z0, 20, WH.h - 8, wallT);
    // gable + roof
    for (const sx of [-1, 1]) {
      const slope = Math.atan2(2.4, w / 2);
      const rf = P.boxC(Math.hypot(w / 2, 2.4) + 0.5, 0.28, d + 0.8, matClad, { collide: false });
      rf.position.set(cx + sx * (w / 4), WH.h + 1.2, cz);
      rf.rotation.z = -sx * slope; whVis.add(rf);
      pbox(whBox, cx + sx * (w / 4), WH.h + 1.2, cz, Math.hypot(w / 2, 2.4) + 0.5, 0.4, d + 0.8, 0, 0, -sx * slope);
    }
    const ridge = P.boxC(0.6, 0.6, d + 0.8, mSteelDark, { collide: false });
    ridge.position.set(cx, WH.h + 2.6, cz); whVis.add(ridge);
    // gable infill triangles (kept as simple boxes — reads fine at this scale)
    for (const gz of [WH.z0, WH.z1]) {
      for (let i = 0; i < 5; i++) {
        const ww = w * (1 - i / 5);
        const gb = P.boxC(ww, 0.5, wallT, matClad, { collide: false });
        gb.position.set(cx, WH.h + 0.25 + i * 0.5, gz); whVis.add(gb);
      }
    }
    // portal frames inside
    for (let z = WH.z0 + 6; z < WH.z1; z += 8) {
      for (const sx of [-1, 1]) {
        const col = P.boxC(0.5, WH.h, 0.5, mSteelDark, { collide: false });
        col.position.set(cx + sx * (w / 2 - 0.7), WH.h / 2, z); whVis.add(col);
        pbox(whBox, cx + sx * (w / 2 - 0.7), WH.h / 2, z, 0.5, WH.h, 0.5);
      }
      const rafter = P.girder(w - 1.4, mSteelDark, { scale: 3 });
      rafter.position.set(cx, WH.h + 0.4, z); P.NOCOLLIDE(rafter); whVis.add(rafter);
    }
    // clerestory strip on the sun (west) wall — this is where the shafts enter
    for (let z = WH.z0 + 5; z < WH.z1 - 3; z += 7) {
      const gl = P.boxC(0.1, 1.5, 4.6, M.emissive(0xffd39a, 3.0), { collide: false, shadow: false });
      gl.position.set(WH.x0 + 0.02, 8.4, z); whVis.add(gl);
      // additive shaft raking down-sun (sun is WNW, low)
      const shaftGeo = new THREE.PlaneGeometry(4.4, 30);
      const shaftMat = new THREE.MeshBasicMaterial({
        color: 0xffca85, transparent: true, opacity: 0.075,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      const sh = new THREE.Mesh(shaftGeo, shaftMat);
      sh.position.set(WH.x0 + 11.5, 5.6, z + 6.6);
      sh.rotation.set(-Math.PI / 2 + 0.21, 0, -0.55, 'YXZ');
      sh.rotation.y = -1.05;
      sh.userData.collide = false;
      sh.renderOrder = 4;
      ctx.addDecor(sh);
      shafts.push(shaftMat);
    }
    // roof skylights (weak, near-horizontal at this sun angle)
    for (let z = WH.z0 + 9; z < WH.z1 - 6; z += 12) {
      const sk = P.boxC(3.0, 0.1, 5.0, M.emissive(0xfff0cf, 2.2), { collide: false, shadow: false });
      sk.position.set(cx - 5, WH.h + 1.9, z); sk.rotation.z = -Math.atan2(2.4, w / 2);
      whVis.add(sk);
    }

    // pallet racking — proxies leave the middle of each run open to hide in
    for (let rowi = 0; rowi < 3; rowi++) {
      const rx = WH.x0 + 7.5 + rowi * 9.5;
      for (const pair of [-1, 1]) {
        const rack = P.shelfRack(6, 4, 2.6, 1.15, 2.3, M.solid({ color: 0xc0561a, roughness: 0.55, metalness: 0.45 }));
        rack.rotation.y = Math.PI / 2;
        rack.position.set(rx + pair * 0.65, 0, cz - 4);
        P.NOCOLLIDE(rack); whVis.add(rack);
        pbox(whBox, rx + pair * 0.65, 4.6, cz - 4, 0.55, 9.2, 15.6);
      }
      if (rowi < 2) ctx.hidingSpot(rx, 1.0, cz - 10.5, 1.5, 0.9);
      // palletised goods on the racks
      for (let l = 0; l < 3; l++) for (let s = 0; s < 5; s++) {
        if (rDress.chance(0.34)) continue;
        const bale = P.boxC(1.9, 1.2, 2.0, rDress.chance(0.5) ? matWood : M.solid({ color: 0x6d7a63, roughness: 0.9 }),
          { collide: false });
        bale.position.set(rx, 2.3 * l + 0.75, cz - 11.2 + s * 3.1); whVis.add(bale);
      }
    }
    // loose pallets and crates near the door
    for (let i = 0; i < 16; i++) {
      const pl = P.pallet(1.2, 0.9);
      pl.position.set(rWare.range(WH.x0 + 3, WH.x1 - 3), (i % 4) * 0.14, rWare.range(WH.z0 + 3, WH.z0 + 15));
      pl.rotation.y = rWare.range(0, 3.1); P.NOCOLLIDE(pl); whVis.add(pl);
    }
    for (let i = 0; i < 10; i++) {
      const cr = P.crate(rWare.range(0.7, 1.2), matWood);
      cr.position.set(rWare.range(WH.x0 + 3, WH.x1 - 3), 0, rWare.range(WH.z0 + 4, WH.z0 + 18));
      cr.rotation.y = rWare.range(0, 3.1); P.NOCOLLIDE(cr); whVis.add(cr);
    }
    forklift(ctx, whVis, whBox, WH.x0 + 6, WH.z0 + 8, 0.7, 1);
    forklift(ctx, whVis, whBox, WH.x1 - 7, cz + 12, -2.2, 2);
    forklift(ctx, whVis, whBox, 16, 58, 1.9, 3);

    // mezzanine office at the south end
    const MZ = { x0: WH.x0 + 1, x1: WH.x0 + 15, z0: WH.z1 - 12, z1: WH.z1 - 1, y: 4.2 };
    const mzW = MZ.x1 - MZ.x0, mzD = MZ.z1 - MZ.z0;
    const mzCX = (MZ.x0 + MZ.x1) / 2, mzCZ = (MZ.z0 + MZ.z1) / 2;
    const deckM = P.boxC(mzW, 0.3, mzD, matPlate, { collide: false });
    deckM.position.set(mzCX, MZ.y - 0.15, mzCZ); whVis.add(deckM);
    pbox(whBox, mzCX, MZ.y - 0.15, mzCZ, mzW, 0.3, mzD);
    for (const sx of [-1, 1]) {
      const col = P.boxC(0.28, MZ.y, 0.28, mSteelDark, { collide: false });
      col.position.set(mzCX + sx * (mzW / 2 - 0.4), MZ.y / 2, MZ.z0 + 0.4); whVis.add(col);
    }
    // office box on the deck
    const off = P.boxC(mzW - 1, 2.7, mzD - 1, matCabin, { collide: false });
    off.position.set(mzCX, MZ.y + 1.35, mzCZ); whVis.add(off);
    pbox(whBox, mzCX, MZ.y + 1.35, mzCZ, mzW - 1, 2.7, mzD - 1);
    for (let i = 0; i < 4; i++) {
      const win = P.boxC(2.0, 1.1, 0.07, mGlassLit, { collide: false, shadow: false });
      win.position.set(MZ.x0 + 2.4 + i * 3.1, MZ.y + 1.7, MZ.z0 + 0.52); whVis.add(win);
    }
    const mzRail = P.railing(mzW, 1.1, mSteelLight);
    mzRail.position.set(mzCX, MZ.y, MZ.z0 + 0.15); P.NOCOLLIDE(mzRail); whVis.add(mzRail);
    pbox(whBox, mzCX, MZ.y + 0.6, MZ.z0 + 0.15, mzW, 1.2, 0.1);
    // stair up to the mezzanine
    const mst = stairTower(ctx, { rise: MZ.y, flightRise: 2.1, run: 3.0, width: 1.2, mat: mSteelDark, treadMat: matPlate });
    const msx = MZ.x1 + 2.6, msz = MZ.z0 + 1.2;
    mst.vis.position.set(msx, 0, msz); whVis.add(mst.vis);
    for (const b of mst.boxes) pbox(whBox, msx + b.cx, b.cy, msz + b.cz, b.w, b.h, b.d, b.ry, b.rx, b.rz);
    walkPlate(ctx, whVis, whBox, msx, MZ.y, msz + mst.exit.z, MZ.x1 - 0.6, MZ.y, msz + mst.exit.z, 1.6, matPlate);

    // interior lighting: emissive strips + two real lamps
    for (let z = WH.z0 + 8; z < WH.z1; z += 11) {
      for (const sx of [-1, 1]) {
        const fl = P.fluorescent(4.0, { color: 0xfff0cc, intensity: 3.2 });
        fl.position.set(cx + sx * 7.5, WH.h - 0.6, z);
        P.NOCOLLIDE(fl); whVis.add(fl);
      }
    }
    const whLamp = new THREE.PointLight(0xffe0b4, 26, 40, 2);
    whLamp.position.set(cx, 8.6, cz - 6); ctx.light(whLamp, { shadow: false });
    const mzLamp = new THREE.PointLight(0xffd9a8, 12, 16, 2);
    mzLamp.position.set(mzCX, MZ.y + 2.0, mzCZ); ctx.light(mzLamp, { shadow: false });

    // signage
    const whSign = P.sign('SHED 4  —  BREAKBULK', { background: 0x1d4a6b, color: 0xf0e6cc, height: 1.1 });
    whSign.position.set(cx + 12, 6.2, WH.z0 - 0.25); P.NOCOLLIDE(whSign); whVis.add(whSign);

    ctx.hidingSpot(WH.x0 + 3.4, 1.0, WH.z1 - 3, 1.6, 1.0);
    ctx.hidingSpot(mzCX, MZ.y + 1.0, mzCZ, 1.8, 0.85);
  }
  bake(ctx, whVis);
  mergeProxy(ctx, whBox, 'warehouse');

  // ---------------------------------------------------------------------------
  // 13. GATE, WEIGHBRIDGE AND OFFICES  (the spawn end)
  // ---------------------------------------------------------------------------
  const gateVis = new THREE.Group();
  const gateBox = [];
  {
    // apron slab
    const ap = P.ground(70, 26, matSlab, { collide: false });
    ap.position.set(0, 0.016, 68); ap.receiveShadow = true; gateVis.add(ap);

    // sliding gate leaf in the south wall
    const leaf = P.boxC(16, 3.0, 0.2, mSteelLight, { collide: false });
    leaf.position.set(0, 1.5, 79.6); gateVis.add(leaf);
    for (let i = 0; i < 17; i++) {
      const bar = P.boxC(0.09, 2.7, 0.09, mSteelDark, { collide: false, shadow: false });
      bar.position.set(-7.6 + i * 0.95, 1.5, 79.45); gateVis.add(bar);
    }
    const gateSign = P.sign('PORT NINE  ·  GATE 3\nNO UNAUTHORISED ENTRY', {
      background: 0x14364f, color: 0xf2e8cf, height: 1.5, fontSize: 82,
    });
    gateSign.position.set(0, 4.5, 79.2); P.NOCOLLIDE(gateSign); gateVis.add(gateSign);

    // guard hut (lit interior)
    portacabin(ctx, gateVis, gateBox, -13, 73, Math.PI, 3.2, 3.0, { lit: true, mat: matCabin });
    const hutLight = new THREE.PointLight(0xffd39a, 9, 12, 2);
    hutLight.position.set(-13, 2.0, 73); ctx.light(hutLight, { shadow: false });
    // portacabin cluster
    portacabin(ctx, gateVis, gateBox, -26, 66.5, 0, 7.2, 3.0, { lit: true, mat: matCabin });
    portacabin(ctx, gateVis, gateBox, -26, 61.6, 0, 7.2, 3.0, { lit: false, mat: matCabin });
    portacabin(ctx, gateVis, gateBox, 24, 72.0, Math.PI * 0.5, 6.0, 3.0, { lit: false, mat: matCabin });
    const cabLight2 = new THREE.PointLight(0xffdcb0, 10, 14, 2);
    cabLight2.position.set(-26, 2.0, 66.5); ctx.light(cabLight2, { shadow: false });

    // weighbridge — deck on plinths, crouch height underneath
    const WBX = 7, WBZ = 62, WBH = 1.15;
    const deckW = P.boxC(4.2, 0.3, 14, matPlate, { collide: false });
    deckW.position.set(WBX, WBH, WBZ); gateVis.add(deckW);
    pbox(gateBox, WBX, WBH, WBZ, 4.2, 0.3, 14);
    for (const sz of [-1, 1]) {
      const ramp = P.boxC(4.2, 0.25, 4.4, matSlab, { collide: false });
      ramp.position.set(WBX, WBH - 0.5, WBZ + sz * 9.1);
      ramp.rotation.x = sz * Math.atan2(1.0, 4.4);
      gateVis.add(ramp);
      pbox(gateBox, WBX, WBH - 0.5, WBZ + sz * 9.1, 4.2, 0.3, 4.4, 0, sz * Math.atan2(1.0, 4.4));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pl = P.boxC(0.5, WBH, 0.5, matSlab, { collide: false });
      pl.position.set(WBX + sx * 1.7, WBH / 2, WBZ + sz * 6.2); gateVis.add(pl);
      pbox(gateBox, WBX + sx * 1.7, WBH / 2, WBZ + sz * 6.2, 0.5, WBH, 0.5);
    }
    const kiosk = P.boxC(1.1, 1.9, 1.1, matCabin, { collide: false });
    kiosk.position.set(WBX + 3.4, 0.95, WBZ + 3); gateVis.add(kiosk);
    pbox(gateBox, WBX + 3.4, 0.95, WBZ + 3, 1.1, 1.9, 1.1);
    const kioskScreen = P.boxC(0.6, 0.45, 0.05, M.emissive(0x63d4ff, 2.6), { collide: false, shadow: false });
    kioskScreen.position.set(WBX + 3.4, 1.45, WBZ + 3.58); gateVis.add(kioskScreen);
    ctx.hidingSpot(WBX, 0.6, WBZ, 1.7, 1.0);

    // boom barrier
    const bpost = P.boxC(0.28, 1.3, 0.28, mPaintYellow, { collide: false });
    bpost.position.set(-7, 0.65, 64); gateVis.add(bpost);
    pbox(gateBox, -7, 0.65, 64, 0.32, 1.3, 0.32);
    const boom = P.cyl(0.08, 0.08, 8.2, mPaintYellow, { seg: 8, collide: false });
    boom.rotation.z = Math.PI / 2; boom.position.set(-7, 1.15, 64); gateVis.add(boom);
    for (let i = 0; i < 8; i++) {
      const band = P.boxC(0.5, 0.19, 0.19, M.solid({ color: 0xb8241c, roughness: 0.7 }), { collide: false, shadow: false });
      band.position.set(-6.4 + i * 1.02, 1.15, 64); gateVis.add(band);
    }

    // traffic island + signage
    const isl = P.boxC(2.4, 0.16, 9, matSlab, { collide: false });
    isl.position.set(-2, 0.08, 66); gateVis.add(isl);
    pbox(gateBox, -2, 0.08, 66, 2.4, 0.16, 9);
    const dirSign = P.sign('QUAY  <—\nSHED 4  <—\nSTACKS  A-F', {
      background: 0x123a2a, color: 0xdfeed2, height: 1.3, fontSize: 76,
    });
    dirSign.position.set(-2, 3.0, 61.4); P.NOCOLLIDE(dirSign); gateVis.add(dirSign);
    const dsPost = P.boxC(0.14, 3.0, 0.14, mSteelDark, { collide: false });
    dsPost.position.set(-2, 1.5, 61.5); gateVis.add(dsPost);
  }
  bake(ctx, gateVis);
  mergeProxy(ctx, gateBox, 'gate');

  // ---------------------------------------------------------------------------
  // 14. CLUTTER PASS
  // ---------------------------------------------------------------------------
  const junkVis = new THREE.Group();
  const junkBox = [];
  {
    // tyre stacks — one instanced mesh for ~150 tyres
    const tyreGeo = new THREE.TorusGeometry(0.52, 0.19, 6, 14);
    tyreGeo.rotateX(Math.PI / 2);
    const tyreSpots = [[82, -30], [85.5, -27], [80, 4], [83.5, 7], [-56, 24], [-53, 27], [58, 56], [61, 58]];
    ctx.addDecor(P.scatter(tyreGeo, mRubber, 160, (i, d, r) => {
      const s = tyreSpots[i % tyreSpots.length];
      const layer = Math.floor(i / tyreSpots.length);
      if (layer > 19) return false;
      d.position.set(s[0] + r.range(-0.1, 0.1), 0.2 + layer * 0.36, s[1] + r.range(-0.1, 0.1));
      d.rotation.y = r() * 6.28;
    }, 4242));
    for (const s of tyreSpots) {
      pbox(junkBox, s[0], 1.8, s[1], 1.25, 3.6, 1.25);
    }
    ctx.hidingSpot(83.7, 0.9, -28.5, 1.6, 1.0);

    // traffic cones
    const coneGeo = P.mergeGeometries([
      new THREE.ConeGeometry(0.19, 0.62, 8).translate(0, 0.31, 0),
      new THREE.BoxGeometry(0.44, 0.05, 0.44).translate(0, 0.025, 0),
    ]);
    ctx.addDecor(P.scatter(coneGeo, M.solid({ color: 0xd8541c, roughness: 0.75 }), 60, (i, d, r) => {
      d.position.set(r.range(-100, 92), 0, r.range(-58, 76));
      d.rotation.y = r() * 6.28;
      d.scale.setScalar(r.range(0.9, 1.15));
    }, 5150));

    // cable drums
    for (let i = 0; i < 6; i++) {
      const dx = [80, 86, 91, -60, -64, 68][i], dz = [30, 33, 28, -30, -26, 66][i];
      const g = new THREE.Group();
      for (const sz of [-1, 1]) {
        const cheek = P.cyl(1.05, 1.05, 0.14, matWood, { seg: 16, collide: false });
        cheek.rotation.z = Math.PI / 2; cheek.position.set(sz * 0.6, 1.05, 0); g.add(cheek);
      }
      const hubm = P.cyl(0.62, 0.62, 1.1, M.solid({ color: 0x3b3630, roughness: 0.9 }), { seg: 14, collide: false });
      hubm.rotation.z = Math.PI / 2; hubm.position.set(-0.55, 1.05, 0); g.add(hubm);
      g.position.set(dx, 0, dz); g.rotation.y = rDress.range(0, 3.1);
      junkVis.add(g);
      pbox(junkBox, dx, 1.05, dz, 2.1, 2.1, 1.5, g.rotation.y);
    }

    // gas bottle cage
    for (const [gx, gz] of [[-62, 8], [74, 64]]) {
      const cage = P.boxC(3.2, 2.2, 1.6, mSteelLight, { collide: false });
      cage.position.set(gx, 1.1, gz); cage.material = mSteelLight; junkVis.add(cage);
      pbox(junkBox, gx, 1.1, gz, 3.2, 2.2, 1.6);
      for (let i = 0; i < 8; i++) {
        const b = P.cyl(0.16, 0.16, 1.35, M.solid({ color: i % 3 ? 0xb8341c : 0x2f6a8f, roughness: 0.6, metalness: 0.4 }),
          { seg: 10, collide: false });
        b.position.set(gx - 1.3 + (i % 4) * 0.85, 0.05, gz - 0.3 + Math.floor(i / 4) * 0.6);
        junkVis.add(b);
      }
    }

    // skip full of scrap
    for (const [sx, sz, sry] of [[88, 48, 0.3], [-58, -12, -0.5]]) {
      const skip = new THREE.Group();
      const bodyM = M.solid({ color: 0x8a5a1e, roughness: 0.85, metalness: 0.3 });
      const fl = P.boxC(5.4, 0.16, 2.2, bodyM, { collide: false }); fl.position.y = 0.4; skip.add(fl);
      for (const sz2 of [-1, 1]) {
        const wl = P.boxC(5.4, 1.5, 0.14, bodyM, { collide: false });
        wl.position.set(0, 1.15, sz2 * 1.1); skip.add(wl);
      }
      for (const sx2 of [-1, 1]) {
        const wl = P.boxC(0.14, 1.5, 2.2, bodyM, { collide: false });
        wl.position.set(sx2 * 2.7, 1.15, 0); skip.add(wl);
      }
      const scrap = P.rubble(2.0, 18, mSteelDark, 300 + sx);
      scrap.position.y = 0.55; P.NOCOLLIDE(scrap); skip.add(scrap);
      skip.position.set(sx, 0, sz); skip.rotation.y = sry;
      junkVis.add(skip);
      pbox(junkBox, sx, 1.0, sz, 5.4, 2.0, 2.2, sry);
      if (sx > 0) ctx.hidingSpot(sx, 1.2, sz, 1.5, 0.9);
    }

    // row of portaloos
    for (let i = 0; i < 5; i++) {
      const lz = 52 + i * 1.35;
      const body = P.boxC(1.2, 2.3, 1.2, M.solid({ color: 0x2f5fa8, roughness: 0.6 }), { collide: false });
      body.position.set(-52, 1.15, lz); junkVis.add(body);
      const roof = P.boxC(1.3, 0.1, 1.3, M.solid({ color: 0xd8d4c8, roughness: 0.7 }), { collide: false });
      roof.position.set(-52, 2.32, lz); junkVis.add(roof);
      const dr = P.boxC(0.06, 1.9, 0.7, M.solid({ color: 0x22447d, roughness: 0.6 }), { collide: false });
      dr.position.set(-51.4, 1.1, lz); junkVis.add(dr);
      pbox(junkBox, -52, 1.15, lz, 1.2, 2.3, 1.2);
    }
    ctx.hidingSpot(-53.6, 0.9, 54.7, 1.4, 1.0);

    // abandoned spreader beam on the ground
    const spr = new THREE.Group();
    const sbeam = P.boxC(12.2, 0.85, 2.5, mPaintYellow, { collide: false });
    sbeam.position.y = 0.45; spr.add(sbeam);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tw = P.boxC(0.4, 0.5, 0.4, mSteelDark, { collide: false });
      tw.position.set(sx * 5.9, 0.15, sz * 1.05); spr.add(tw);
    }
    spr.position.set(-38, 0, -46); spr.rotation.y = 0.22;
    junkVis.add(spr);
    pbox(junkBox, -38, 0.45, -46, 12.2, 0.9, 2.5, 0.22);

    // barrels and drums scattered along the alleys
    for (let i = 0; i < 22; i++) {
      const bx = rDress.range(-44, 72), bz = rDress.range(-30, 50);
      const br = P.barrel(0.32, 0.9, M.surface('rustMetal', { repeat: 1, size: 256, color: 0x2f6a3f }));
      br.position.set(bx, 0, bz); br.rotation.y = rDress.range(0, 3.1);
      P.NOCOLLIDE(br); junkVis.add(br);
      if (i % 3 === 0) pbox(junkBox, bx, 0.45, bz, 0.7, 0.9, 0.7);
    }
    // pallets stacked in the alleys
    for (let i = 0; i < 14; i++) {
      const bx = rDress.range(-42, 70), bz = rDress.range(-28, 48);
      for (let k = 0; k < rDress.int(2, 5); k++) {
        const pl = P.pallet(1.2, 0.9);
        pl.position.set(bx, k * 0.14, bz);
        pl.rotation.y = rDress.range(-0.1, 0.1) + (k % 2) * 0.02;
        P.NOCOLLIDE(pl); junkVis.add(pl);
      }
    }
    // parked trucks / cars near the gate
    for (const [vx, vz, vc, vr] of [[-36, 62, 0x9c3722, 1.6], [-30, 56, 0x2f4b6d, 1.6], [40, 70, 0x6a6f74, -1.5]]) {
      const car = P.car(vc, Math.round(vx));
      car.position.set(vx, 0, vz); car.rotation.y = vr;
      P.NOCOLLIDE(car); junkVis.add(car);
      pbox(junkBox, vx, 0.85, vz, 4.4, 1.7, 2.0, vr);
    }
  }
  bake(ctx, junkVis);
  mergeProxy(ctx, junkBox, 'clutter');

  // ---------------------------------------------------------------------------
  // 15. ATMOSPHERE — dust, gulls, haze cards
  // ---------------------------------------------------------------------------
  // Drifting dust in the sun. One THREE.Points draw call; the whole field is
  // advected by moving its parent, which is free.
  const dustRoot = new THREE.Group();
  {
    const N = 1500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rAtmo.range(-70, 90);
      pos[i * 3 + 1] = rAtmo.range(0.4, 16);
      pos[i * 3 + 2] = rAtmo.range(-56, 66);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({
      size: 0.09, map: mDust.map, color: 0xffdcae, transparent: true,
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: true, fog: true,
    });
    const pts = new THREE.Points(g, pm);
    pts.frustumCulled = false;
    pts.userData.collide = false;
    dustRoot.add(pts);
    ctx.addDecor(dustRoot);
  }

  // Wheeling flock of gulls, high up
  const GULLS = 26;
  const gullGeo = new THREE.PlaneGeometry(0.85, 0.4);
  const gulls = new THREE.InstancedMesh(gullGeo, mGull, GULLS);
  gulls.userData.collide = false;
  gulls.castShadow = false;
  gulls.frustumCulled = false;
  const gullSeed = [];
  for (let i = 0; i < GULLS; i++) {
    gullSeed.push({
      r: rAtmo.range(34, 88),
      y: rAtmo.range(26, 52),
      p: rAtmo.range(0, Math.PI * 2),
      s: rAtmo.range(0.055, 0.11) * (rAtmo.chance(0.5) ? 1 : -1),
      f: rAtmo.range(3.2, 5.4),
    });
  }
  ctx.addDecor(gulls);

  // haze cards to thicken the distance behind the stacks
  const hazeMat = new THREE.MeshBasicMaterial({
    color: 0xd8ab74, transparent: true, opacity: 0.16, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  });
  for (let i = 0; i < 6; i++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(220, 34), hazeMat);
    card.position.set(rAtmo.range(-40, 40), 12 + i * 2.5, -150 - i * 22);
    card.userData.collide = false;
    card.renderOrder = -1;
    ctx.addDecor(card);
  }

  // ---------------------------------------------------------------------------
  // 16. GAMEPLAY PLACEMENT
  // ---------------------------------------------------------------------------
  const insideAnyBlock = (x, z, pad = 1.0) => blocks.some(
    (b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);

  // -- coins: ground maze (14)
  let placed = 0, tries = 0;
  while (placed < 14 && tries++ < 900) {
    const x = rLoot.range(MAZE.x0 - 2, MAZE.x1 + 2);
    const z = rLoot.range(-32, 51);
    if (insideAnyBlock(x, z, 0.9)) continue;
    if (!insideAnyBlock(x, z, 3.2)) continue;   // must be in an alley, not open tarmac
    ctx.pickup(x, 1.0, z, 'coin');
    placed++;
  }
  // -- coins: container tops (10)
  const tall = blocks.filter((b) => b.tiers >= 2).sort((a, b) => (a.cx * 3.7 + a.cz) - (b.cx * 3.7 + b.cz));
  for (let i = 0; i < 10 && tall.length; i++) {
    const b = tall[Math.floor((i / 10) * tall.length)];
    ctx.pickup(b.cx + rLoot.range(-1.6, 1.6), b.top + 1.0, b.cz + rLoot.range(-0.8, 0.8), 'coin');
  }
  // -- coins: warehouse (6)
  for (const [cxp, cyp, czp] of [
    [-100, 1.0, -8], [-92, 1.0, 6], [-78, 1.0, 20], [-96, 1.0, 34],
    [-97, 5.2, 34], [-74, 1.0, -10],
  ]) ctx.pickup(cxp, cyp, czp, 'coin');
  // -- coins: quay + ship (6)
  for (const [cxp, cyp, czp] of [
    [-66, 1.0, -50], [-12, 1.0, -54], [44, 1.0, -52], [82, 1.0, -50],
    [-50, 4.9, -71], [-6, 4.9, -71],
  ]) ctx.pickup(cxp, cyp, czp, 'coin');
  // -- coins: the crane catwalk (6) — pay the player for the climb
  for (let i = 0; i < 6; i++) {
    ctx.pickup(CRANE_X - 4.6, BOOM_Y + 1.0, -44 - i * 7.5, 'coin');
  }

  // -- batteries (5)
  ctx.pickup(-13, 1.0, 70.6, 'battery');                     // guard hut doorstep
  ctx.pickup(-97, 5.2, 30, 'battery');                       // mezzanine
  ctx.pickup(-25.5, 13.2, -44.4, 'battery');                 // crane stair mid-landing
  ctx.pickup(rampSteps[1].cx, rampSteps[1].top + 1.0, rampSteps[1].cz, 'battery');
  ctx.pickup(70, -1.6, -66.5, 'battery');                    // down the slipway

  // -- powerups (4)
  ctx.pickup(anchorTower.cx, anchorTower.top + 1.0, anchorTower.cz, 'powerup:ghost');
  ctx.pickup(-88, 1.0, 26, 'powerup:dash');
  ctx.pickup(rampSteps[3].cx, rampSteps[3].top + 1.0, rampSteps[3].cz, 'powerup:jumpjet');
  ctx.pickup(-40, 4.9, -71, 'powerup:nightvision');

  // -- the pup: inside the container whose doors only LOOK shut
  ctx.pickup(33.6, 1.15, -28.4, 'pup');

  // -- hiding spots in the tight alleys
  let hid = 0;
  for (const c of cands) {
    if (hid >= 3) break;
    if (c.gap > 2.7) continue;
    if (c.axis === 'x') {
      const left = c.a.x1 < c.b.x0 ? c.a : c.b;
      ctx.hidingSpot(left.x1 + c.gap / 2, 0.9, c.mid, 1.3, 1.0);
    } else {
      const near = c.a.z1 < c.b.z0 ? c.a : c.b;
      ctx.hidingSpot(c.mid, 0.9, near.z1 + c.gap / 2, 1.3, 1.0);
    }
    hid++;
  }
  // a couple up top, where the Seeker rarely looks first
  ctx.hidingSpot(rampSteps[3].cx, rampSteps[3].top + 0.9, rampSteps[3].cz, 1.5, 0.8);
  ctx.hidingSpot(CRANE_X - 4.6, BOOM_Y + 0.9, -70, 2.0, 0.9);
  ctx.hidingSpot(-7.35, 8.9, -14.2, 1.4, 0.8);

  // ---------------------------------------------------------------------------
  // 17. MOTION
  // ---------------------------------------------------------------------------
  const gullDummy = new THREE.Object3D();
  ctx.onUpdate((dt, el) => {
    // sea
    waterMat.userData.tick?.(dt);

    // crane trolleys traversing their booms
    if (trolleyA) {
      trolleyA.position.z = -60 + Math.sin(el * 0.055) * 24;
      trolleyA.position.y = Math.sin(el * 0.11) * 0.05;
    }
    if (trolleyB) {
      trolleyB.position.z = 6 + Math.sin(el * 0.07 + 1.2) * 20;
    }

    // gulls
    for (let i = 0; i < GULLS; i++) {
      const g = gullSeed[i];
      const a = g.p + el * g.s;
      const x = 6 + Math.cos(a) * g.r;
      const z = -18 + Math.sin(a) * g.r * 0.72;
      gullDummy.position.set(x, g.y + Math.sin(el * 0.4 + g.p) * 1.8, z);
      gullDummy.rotation.set(0, -a + (g.s > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
      const flap = 0.35 + Math.abs(Math.sin(el * g.f + g.p)) * 0.75;
      gullDummy.scale.set(1, 1, flap);
      gullDummy.rotateX(-Math.PI / 2);
      gullDummy.scale.set(1, flap, 1);
      gullDummy.updateMatrix();
      gulls.setMatrixAt(i, gullDummy.matrix);
    }
    gulls.instanceMatrix.needsUpdate = true;

    // dust drift
    dustRoot.position.set(
      Math.sin(el * 0.045) * 3.2,
      Math.sin(el * 0.031) * 0.9,
      Math.cos(el * 0.038) * 2.6);
    dustRoot.rotation.y = el * 0.004;

    // light shafts breathe as dust crosses them
    for (let i = 0; i < shafts.length; i++) {
      shafts[i].opacity = 0.055 + Math.sin(el * 0.35 + i * 1.7) * 0.022;
    }
  });

  // ===========================================================================
  // AUTHORED PROPS — dockside clutter around the warehouse and the quay.
  // Kept out of the container maze itself, which already has all the cover it
  // needs, and off the water.
  // ===========================================================================
  await ctx.kits.scatterKit(ctx, {
    kit: 'CONTAINERS', count: 30, seed: 'cy-cont',
    area: (r) => ({ x: r.range(-100, 100), y: 0, z: r.range(-40, 90) }),
    accept: (p) => p.z > -35 && Math.hypot(p.x, p.z - 68) > 7,
  });
  await ctx.kits.scatterKit(ctx, {
    kit: 'DEBRIS', count: 34, seed: 'cy-debris', hide: false,
    area: (r) => ({ x: r.range(-100, 100), y: 0, z: r.range(-30, 90) }),
  });

}
