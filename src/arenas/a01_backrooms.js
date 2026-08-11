// =============================================================================
// A01 — THE BACKROOMS
// -----------------------------------------------------------------------------
// A ~198 x 197 m sealed mono-yellow office labyrinth. Seven zones, each with its
// own wall tint, carpet tint and ceiling height, carved out of a non-uniform
// cell grid (hand-authored cell widths, so the grid never reads as procedural).
//
// Structure of this file:
//   1. Grid + zone tables (module scope, so `meta.spawn` can be computed)
//   2. meta
//   3. build(): materials -> atmosphere -> maze -> geometry -> landmarks ->
//      dressing -> lighting -> motion -> gameplay
//
// Performance strategy: every static surface is merged into per-zone batches
// (one mesh per material), ceiling tiles are one InstancedMesh, and ALL
// collision lives in a single invisible merged proxy mesh.
// =============================================================================

import * as THREE from 'three';

// =============================================================================
// 1. GRID
// =============================================================================

// Hand-authored, deliberately irregular cell sizes. Indices 13..19 are a
// palindrome (6.6 8.0 6.8 | 7.2 | 6.8 8.0 6.6) so the "wrongness" corridor can
// be perfectly mirror-symmetric about the centre of cell 16.
const CELLW = [
  5.2, 4.4, 6.0, 4.8, 5.6, 4.2, 6.4, 5.0, 4.6, 5.8, 4.4, 6.2, // 0..11  warren band (tight)
  7.2,                                                        // 12
  6.6, 8.0, 6.8, 7.2, 6.8, 8.0, 6.6,                          // 13..19 palindrome span
  7.4, 6.6,                                                   // 20..21
  8.2, 7.4, 9.0, 7.8, 8.6, 7.2, 8.4, 7.6,                     // 22..29 rooms band (wide)
];
const CELLD = [
  5.0, 6.8, 4.6, 7.2, 5.4, 6.2, 4.8, 7.6, 5.2, 6.6,           // 0..9
  7.0, 6.4, 7.8, 6.0, 8.2, 6.6, 7.4, 6.2, 7.8, 6.8,           // 10..19
  6.4, 7.2, 5.8, 7.8, 6.6, 8.0, 6.2, 7.4, 5.6, 6.8,           // 20..29
];
const NX = CELLW.length, NZ = CELLD.length;

function edgeList(widths) {
  const out = [0];
  for (let i = 0; i < widths.length; i++) out.push(out[i] + widths[i]);
  const half = out[out.length - 1] / 2;
  return out.map(v => v - half);
}
const XS = edgeList(CELLW);   // NX+1 boundary coordinates
const ZS = edgeList(CELLD);   // NZ+1
const CXC = (i) => (XS[i] + XS[i + 1]) / 2;
const CZC = (j) => (ZS[j] + ZS[j + 1]) / 2;

// --- zones (rect partitions of the cell grid; together they tile it exactly) --
const ZONES = [
  { id: 'warren',    x0: 0,  x1: 11, z0: 0,  z1: 9,  h: 2.90, wall: 0xd9c98c, floor: 0xb59a4a, door: 0.72, loop: 0.10 },
  { id: 'corridors', x0: 12, x1: 29, z0: 0,  z1: 9,  h: 3.20, wall: 0xd0bf80, floor: 0xb59a4a, door: 0.34, loop: 0.17 },
  { id: 'collapsed', x0: 0,  x1: 11, z0: 10, z1: 19, h: 3.50, wall: 0xc6b477, floor: 0xa78e42, door: 0.48, loop: 0.22 },
  { id: 'hall',      x0: 12, x1: 21, z0: 10, z1: 19, h: 5.20, wall: 0xe2d59f, floor: 0xa78e42, door: 0.00, loop: 1.00 },
  { id: 'rooms',     x0: 22, x1: 29, z0: 10, z1: 29, h: 3.90, wall: 0xe2d59f, floor: 0xc0a758, door: 0.88, loop: 0.06 },
  { id: 'damp',      x0: 0,  x1: 11, z0: 20, z1: 29, h: 3.00, wall: 0x9c9060, floor: 0x6b5b2e, door: 0.60, loop: 0.14 },
  { id: 'service',   x0: 12, x1: 21, z0: 20, z1: 29, h: 4.00, wall: 0xd0bf80, floor: 0xc0a758, door: 0.30, loop: 0.18 },
];

// --- named features, in cell coordinates -------------------------------------
const PAL = { x0: 13, x1: 19, z: 1, mid: 16 };            // palindrome corridor
const SHAFT = { x: 28, z0: 6, z1: 8, h: 8.0 };            // 8 m tall dead end
const TALLY = { x0: 24, x1: 25, z0: 16, z1: 17 };         // the tally-mark room
const PIT = { x0: 15, x1: 18, z0: 24, z1: 27 };           // sunken sub-level
const PIT_Y = -3.0;
const STAIR_CELL = 16;                                    // pit entry column
const COLLAPSE = { x0: 4, x1: 7, z0: 13, z1: 16 };        // torn-open ceiling
const ALCOVE = { x0: 1, x1: 3, z0: 25, z1: 26 };          // flooded alcove

const SPAWN_CELL = { x: 16, z: 3 };

const WALL_T = 0.30;
const WALL_OVER = 0.9;   // walls continue this far above the suspended ceiling
                         // (also keeps wall tops out of jump range from a crate stack)
const TILE = 1.2;        // suspended-ceiling module

// =============================================================================
// 2. META
// =============================================================================

export const meta = {
  id: 'backrooms',
  name: 'THE BACKROOMS',
  // tagline / colors / biome kept identical to src/arenas/index.js metaIndex
  tagline: 'Six hundred million square miles of damp carpet, and the hum of fluorescent light.',
  order: 1,
  difficulty: 2,
  biome: 'surreal',
  seed: 19960624,
  spawn: [CXC(SPAWN_CELL.x), 0, CZC(SPAWN_CELL.z)],
  bounds: 100,
  colors: ['#d9c98c', '#4a3d1c'],
  music: 'dread',
};

// =============================================================================
// 3. BUILD
// =============================================================================

export async function build(ctx) {
  const { props, mat } = ctx;
  const R = {
    maze: ctx.rng.fork('maze'),
    door: ctx.rng.fork('door'),
    light: ctx.rng.fork('light'),
    dress: ctx.rng.fork('dress'),
    decal: ctx.rng.fork('decal'),
    place: ctx.rng.fork('place'),
  };

  // ---------------------------------------------------------------------------
  // 3.1 Materials — 14 surface() calls total, all 256 px for build speed.
  // ---------------------------------------------------------------------------
  const S = (t, o) => mat.surface(t, { size: 256, repeat: 1, ...o });

  const M = {
    wallWarren:    S('plaster', { color: 0xd9c98c, normalScale: 0.7 }),
    wallCorridor:  S('plaster', { color: 0xd0bf80, normalScale: 0.7 }),
    wallCollapse:  S('plaster', { color: 0xc6b477, normalScale: 0.9 }),
    wallBright:    S('plaster', { color: 0xe2d59f, normalScale: 0.7 }),
    wallDamp:      S('plaster', { color: 0x9c9060, normalScale: 1.2, roughness: 0.85 }),
    carpetA:       S('carpet',  { color: 0xb59a4a }),
    carpetB:       S('carpet',  { color: 0xa78e42 }),
    carpetC:       S('carpet',  { color: 0xc0a758 }),
    carpetWet:     S('carpet',  { color: 0x6b5b2e, roughness: 0.6 }),
    ceilTile:      S('ceilingTile', { color: 0xe6e1d2, repeat: 0.5 }),
    concrete:      S('concrete', { color: 0x7c766a }),
    panelMetal:    S('metalPanel', { color: 0x8b9096, panels: 2, roughness: 0.55, metalness: 0.6 }),
    rust:          S('rustMetal', { color: 0x5a5750 }),
    ply:           S('wood', { color: 0x8a6238, planks: 4 }),
  };
  // untextured helpers (cheap, no texture generation)
  const M2 = {
    skirt:   mat.solid({ color: 0x4a3f26, roughness: 0.72 }),
    plenum:  mat.solid({ color: 0x090a08, roughness: 1.0 }),
    tbar:    mat.solid({ color: 0xa8a49a, roughness: 0.55, metalness: 0.25 }),
    frame:   mat.solid({ color: 0x6a5a3c, roughness: 0.7 }),
    housing: mat.solid({ color: 0xcfcfc6, roughness: 0.55, metalness: 0.15 }),
    dead:    mat.solid({ color: 0x2b2b25, roughness: 0.6 }),
    steel:   mat.metal(0x777c81, 0.45),
    dark:    mat.solid({ color: 0x14140f, roughness: 0.95 }),
    partition: mat.solid({ color: 0x9a9174, roughness: 0.95 }),
    card:    mat.solid({ color: 0x8b7147, roughness: 1.0 }),
    invis:   mat.solid({ color: 0x000000 }),
  };
  const emitOn     = mat.emissive(0xfff2c8, 3.6);
  const emitSickly = mat.emissive(0xe8f0c0, 2.5);
  const waterMat   = mat.water({ color: 0x2a3320, opacity: 0.82, repeat: 5 });

  const zoneWallMat = {
    warren: M.wallWarren, corridors: M.wallCorridor, collapsed: M.wallCollapse,
    hall: M.wallBright, rooms: M.wallBright, damp: M.wallDamp, service: M.wallCorridor,
  };
  const zoneFloorMat = {
    warren: M.carpetA, corridors: M.carpetA, collapsed: M.carpetB,
    hall: M.carpetB, rooms: M.carpetC, damp: M.carpetWet, service: M.carpetC,
  };

  // ---------------------------------------------------------------------------
  // 3.2 Geometry plumbing: world-space UVs + per-material merge batches.
  // ---------------------------------------------------------------------------
  const UV_WALL = 1.8, UV_FLOOR = 1.5, UV_CONC = 2.2;

  /** Box-triplanar world UVs so shared materials keep a constant texel density. */
  function worldUV(g, s) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = pos.getX(i); v = pos.getZ(i); }
      else if (ax >= az) { u = pos.getZ(i); v = pos.getY(i); }
      else { u = pos.getX(i); v = pos.getY(i); }
      uv.setXY(i, u / s, v / s);
    }
    uv.needsUpdate = true;
    return g;
  }

  function boxAt(x, y, z, sx, sy, sz) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    return g;
  }
  function planeAt(x, y, z, sx, sz, faceDown) {
    const g = new THREE.PlaneGeometry(sx, sz);
    g.rotateX(faceDown ? Math.PI / 2 : -Math.PI / 2);
    g.translate(x, y, z);
    return g;
  }

  /** Accumulates geometry per material, then emits one merged mesh per material. */
  class Batch {
    constructor() { this.map = new Map(); }
    add(material, geometry) {
      let a = this.map.get(material);
      if (!a) { a = []; this.map.set(material, a); }
      a.push(geometry);
      return this;
    }
    build(castShadow = false) {
      const g = new THREE.Group();
      for (const [material, list] of this.map) {
        if (!list.length) continue;
        const mesh = new THREE.Mesh(props.mergeGeometries(list), material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        mesh.userData.collide = false;
        g.add(mesh);
        list.forEach(x => x.dispose());
      }
      this.map.clear();
      return g;
    }
  }

  const zoneBatch = {};          // per zone -> Batch (walls, skirting, floor)
  for (const z of ZONES) zoneBatch[z.id] = new Batch();
  const ceilBatch = new Batch(); // plenum + T-bar lattice
  const decalBatch = new Batch();
  const collGeos = [];           // everything collidable, merged at the end

  const proxy = (x, y, z, sx, sy, sz) => { collGeos.push(boxAt(x, y, z, sx, sy, sz)); };

  /**
   * A run of parallel pipes with periodic collars, built at geometry level so
   * it merges straight into a batch (and so the origin is exactly where I say).
   * axis 'x': run spans a..b in X at Z = fixed. axis 'z': spans a..b in Z at X = fixed.
   */
  function pipeRun(batch, material, axis, a, b, y, fixed, count = 3, r = 0.09) {
    const len = b - a, mid = (a + b) / 2;
    if (len < 0.5) return;
    for (let k = 0; k < count; k++) {
      const off = (k - (count - 1) / 2) * (r * 2.9);
      const place = (g, along) => {
        g.rotateZ(Math.PI / 2);
        if (axis === 'z') g.rotateY(Math.PI / 2);
        if (axis === 'x') g.translate(along, y + (k % 2) * 0.025, fixed + off);
        else g.translate(fixed + off, y + (k % 2) * 0.025, along);
        batch.add(material, g);
      };
      place(new THREE.CylinderGeometry(r, r, len, 10, 1), mid);
      for (let t = a + 2.5; t < b - 0.5; t += 4.5) {
        place(new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.09, 10, 1), t);
      }
    }
  }

  /** Fixed-rung ladder (props.ladder offsets its rungs), climbable-flagged. */
  function makeLadder(batch, material, x, z, h, facing) {
    const w = 0.44;
    for (const s of [-1, 1]) {
      const g = facing === 'z'
        ? boxAt(x + s * w / 2, h / 2, z, 0.05, h, 0.05)
        : boxAt(x, h / 2, z + s * w / 2, 0.05, h, 0.05);
      batch.add(material, g);
    }
    for (let y = 0.3; y < h; y += 0.32) {
      const g = new THREE.CylinderGeometry(0.022, 0.022, w, 6, 1);
      g.rotateZ(Math.PI / 2);
      if (facing === 'x') g.rotateY(Math.PI / 2);
      g.translate(x, y, z);
      batch.add(material, g);
    }
  }

  const STATIC = new THREE.Group();   // props that get frozen at the end
  const LIVE = new THREE.Group();     // animated things (never frozen)
  ctx.add(LIVE);

  // ---------------------------------------------------------------------------
  // 3.3 Zone / cell lookup tables
  // ---------------------------------------------------------------------------
  const ZIDX = new Int8Array(NX * NZ).fill(-1);
  const CH = new Float32Array(NX * NZ);
  for (let zi = 0; zi < ZONES.length; zi++) {
    const z = ZONES[zi];
    for (let i = z.x0; i <= z.x1; i++) {
      for (let j = z.z0; j <= z.z1; j++) { ZIDX[i * NZ + j] = zi; CH[i * NZ + j] = z.h; }
    }
  }
  const zoneAt = (i, j) => ZONES[ZIDX[i * NZ + j]];
  const inRect = (r, i, j) => i >= r.x0 && i <= r.x1 && j >= r.z0 && j <= r.z1;
  const isPit = (i, j) => inRect(PIT, i, j);
  const isShaft = (i, j) => i === SHAFT.x && j >= SHAFT.z0 && j <= SHAFT.z1;
  const floorYAt = (i, j) => (isPit(i, j) ? PIT_Y : 0);

  for (let j = SHAFT.z0; j <= SHAFT.z1; j++) CH[SHAFT.x * NZ + j] = SHAFT.h;

  // world rects
  const rectOf = (r) => ({ x0: XS[r.x0], x1: XS[r.x1 + 1], z0: ZS[r.z0], z1: ZS[r.z1 + 1] });
  const RPIT = rectOf(PIT);
  const RPAL = { x0: XS[PAL.x0], x1: XS[PAL.x1 + 1], z0: ZS[PAL.z], z1: ZS[PAL.z + 1] };
  const RSHAFT = { x0: XS[SHAFT.x], x1: XS[SHAFT.x + 1], z0: ZS[SHAFT.z0], z1: ZS[SHAFT.z1 + 1] };
  const RALC = rectOf(ALCOVE);
  const inWorldRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

  // =========================================================================
  // 3.4 MAZE
  //   VW[i][j] : edge on the WEST side of cell (i,j), i in 0..NX
  //   HW[i][j] : edge on the NORTH side of cell (i,j), j in 0..NZ
  //   value 0 = solid, 1 = passable.  L* arrays lock an edge against later passes.
  // =========================================================================
  const VW = new Uint8Array((NX + 1) * NZ);
  const HW = new Uint8Array(NX * (NZ + 1));
  const VL = new Uint8Array((NX + 1) * NZ);
  const HL = new Uint8Array(NX * (NZ + 1));
  const vI = (i, j) => i * NZ + j;
  const hI = (i, j) => i * (NZ + 1) + j;

  const setV = (i, j, v, lock) => { if (!VL[vI(i, j)]) VW[vI(i, j)] = v; if (lock) VL[vI(i, j)] = 1; };
  const setH = (i, j, v, lock) => { if (!HL[hI(i, j)]) HW[hI(i, j)] = v; if (lock) HL[hI(i, j)] = 1; };
  // authored landmarks always win, even over an earlier lock
  const forceV = (i, j, v) => { VW[vI(i, j)] = v; VL[vI(i, j)] = 1; };
  const forceH = (i, j, v) => { HW[hI(i, j)] = v; HL[hI(i, j)] = 1; };

  // ---- 3.4.a randomized DFS spanning tree (with a bias to run straight) -----
  {
    const seen = new Uint8Array(NX * NZ);
    const stack = [[SPAWN_CELL.x, SPAWN_CELL.z, -1]];
    seen[SPAWN_CELL.x * NZ + SPAWN_CELL.z] = 1;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [x, z, lastDir] = top;
      const opts = [];
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
        if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
        if (seen[nx * NZ + nz]) continue;
        opts.push(d);
      }
      if (!opts.length) { stack.pop(); continue; }
      let d;
      if (lastDir >= 0 && opts.includes(lastDir) && R.maze.chance(0.62)) d = lastDir;
      else d = R.maze.pick(opts);
      const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
      if (d === 0) VW[vI(x + 1, z)] = 1;
      else if (d === 1) VW[vI(x, z)] = 1;
      else if (d === 2) HW[hI(x, z + 1)] = 1;
      else HW[hI(x, z)] = 1;
      seen[nx * NZ + nz] = 1;
      top[2] = d;
      stack.push([nx, nz, d]);
    }
  }

  // ---- 3.4.b loops: knock extra holes, weighted per zone --------------------
  for (let i = 1; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (VW[vI(i, j)]) continue;
    if (R.maze.chance(zoneAt(i, j).loop)) VW[vI(i, j)] = 1;
  }
  for (let i = 0; i < NX; i++) for (let j = 1; j < NZ; j++) {
    if (HW[hI(i, j)]) continue;
    if (R.maze.chance(zoneAt(i, j).loop)) HW[hI(i, j)] = 1;
  }

  // ---- 3.4.c zone character overrides ---------------------------------------

  // HALL — one continuous room, all interior walls gone.
  {
    const h = ZONES.find(z => z.id === 'hall');
    for (let i = h.x0; i <= h.x1; i++) for (let j = h.z0; j <= h.z1; j++) {
      if (i > h.x0) setV(i, j, 1, true);
      if (j > h.z0) setH(i, j, 1, true);
    }
    // generous openings on every side so the hall is easy to stumble into
    setH(14, h.z0, 1, false); setH(19, h.z0, 1, false);
    setH(13, h.z1 + 1, 1, false); setH(17, h.z1 + 1, 1, false);
    setV(h.x0, 13, 1, false); setV(h.x0, 17, 1, false);
    setV(h.x1 + 1, 12, 1, false); setV(h.x1 + 1, 16, 1, false);
  }

  // WARREN — re-solidify a third of the openings: a genuinely tight cubicle maze.
  {
    const w = ZONES[0];
    for (let i = w.x0 + 1; i <= w.x1; i++) for (let j = w.z0; j <= w.z1; j++)
      if (VW[vI(i, j)] && R.maze.chance(0.34)) setV(i, j, 0, false);
    for (let i = w.x0; i <= w.x1; i++) for (let j = w.z0 + 1; j <= w.z1; j++)
      if (HW[hI(i, j)] && R.maze.chance(0.34)) setH(i, j, 0, false);
  }

  // CORRIDORS — long uninterrupted runs along the narrow rows / columns.
  const LONG_ROWS = [2, 6, 8];
  const LONG_COLS = [15, 22, 27];
  for (const j of LONG_ROWS) for (let i = 13; i <= 29; i++) setV(i, j, 1, true);
  for (const i of LONG_COLS) for (let j = 1; j <= 9; j++) setH(i, j, 1, true);

  // ROOMS — 2x2-cell rooms, sealed except for a couple of offset doorways.
  const roomBlocks = [];
  {
    const rz = ZONES.find(z => z.id === 'rooms');
    for (let bx = rz.x0; bx <= rz.x1; bx += 2) {
      for (let bz = rz.z0; bz <= rz.z1; bz += 2) {
        const b = { x0: bx, x1: Math.min(bx + 1, rz.x1), z0: bz, z1: Math.min(bz + 1, rz.z1) };
        if (b.x0 === TALLY.x0 && b.z0 === TALLY.z0) continue;   // the tally room is authored by hand
        roomBlocks.push(b);
        for (let i = b.x0; i <= b.x1; i++) for (let j = b.z0; j <= b.z1; j++) {
          if (i > b.x0) setV(i, j, 1, true);
          if (j > b.z0) setH(i, j, 1, true);
        }
        // seal perimeter
        for (let j = b.z0; j <= b.z1; j++) { setV(b.x0, j, 0, false); setV(b.x1 + 1, j, 0, false); }
        for (let i = b.x0; i <= b.x1; i++) { setH(i, b.z0, 0, false); setH(i, b.z1 + 1, 0, false); }
        // punch 2 doorways on different sides, at deliberately mismatched offsets
        const sides = R.maze.shuffle([0, 1, 2, 3]).slice(0, R.maze.int(2, 3));
        for (const s of sides) {
          const jj = R.maze.int(b.z0, b.z1), ii = R.maze.int(b.x0, b.x1);
          if (s === 0 && b.x0 > 0) setV(b.x0, jj, 1, false);
          if (s === 1 && b.x1 + 1 < NX) setV(b.x1 + 1, jj, 1, false);
          if (s === 2 && b.z0 > 0) setH(ii, b.z0, 1, false);
          if (s === 3 && b.z1 + 1 < NZ) setH(ii, b.z1 + 1, 1, false);
        }
      }
    }
  }

  // DAMP — open the flooded alcove out into one soggy room.
  for (let i = ALCOVE.x0; i <= ALCOVE.x1; i++) for (let j = ALCOVE.z0; j <= ALCOVE.z1; j++) {
    if (i > ALCOVE.x0) setV(i, j, 1, true);
    if (j > ALCOVE.z0) setH(i, j, 1, true);
  }
  setH(ALCOVE.x0 + 1, ALCOVE.z0, 1, false);

  // ---- 3.4.d authored landmarks --------------------------------------------
  const forcedGap = new Map();   // edge key -> { c, w, lint }

  // (i) THE PALINDROME CORRIDOR — identical dead ends, entered dead centre.
  for (let i = PAL.x0; i <= PAL.x1; i++) {
    forceH(i, PAL.z, 0);
    forceH(i, PAL.z + 1, 0);
    if (i > PAL.x0) forceV(i, PAL.z, 1);
  }
  forceV(PAL.x0, PAL.z, 0);
  forceV(PAL.x1 + 1, PAL.z, 0);
  forceH(PAL.mid, PAL.z + 1, 1);
  forcedGap.set(`h:${PAL.mid}:${PAL.z + 1}`, { c: CXC(PAL.mid), w: 1.8, lint: false });

  // (ii) THE SHAFT — a dead-end corridor that is inexplicably 8 m tall.
  for (let j = SHAFT.z0; j <= SHAFT.z1; j++) {
    forceV(SHAFT.x, j, 0);
    forceV(SHAFT.x + 1, j, 0);
    if (j > SHAFT.z0) forceH(SHAFT.x, j, 1);
  }
  forceH(SHAFT.x, SHAFT.z0, 0);
  forceH(SHAFT.x, SHAFT.z1 + 1, 1);
  forcedGap.set(`h:${SHAFT.x}:${SHAFT.z1 + 1}`, { c: CXC(SHAFT.x), w: 1.7, lint: true });

  // (iii) THE TALLY ROOM — sealed but for a single doorway.
  for (let i = TALLY.x0; i <= TALLY.x1; i++) for (let j = TALLY.z0; j <= TALLY.z1; j++) {
    if (i > TALLY.x0) forceV(i, j, 1);
    if (j > TALLY.z0) forceH(i, j, 1);
  }
  for (let j = TALLY.z0; j <= TALLY.z1; j++) { forceV(TALLY.x0, j, 0); forceV(TALLY.x1 + 1, j, 0); }
  for (let i = TALLY.x0; i <= TALLY.x1; i++) { forceH(i, TALLY.z0, 0); forceH(i, TALLY.z1 + 1, 0); }
  forceV(TALLY.x0, TALLY.z0, 1);
  forcedGap.set(`v:${TALLY.x0}:${TALLY.z0}`, { c: CZC(TALLY.z0), w: 1.5, lint: true });

  // (iv) THE SUNKEN SUB-LEVEL — sealed pit, one stair, low parapet on the north.
  const parapet = new Set();
  for (let i = PIT.x0; i <= PIT.x1; i++) for (let j = PIT.z0; j <= PIT.z1; j++) {
    if (i > PIT.x0) forceV(i, j, 1);
    if (j > PIT.z0) forceH(i, j, 1);
  }
  for (let j = PIT.z0; j <= PIT.z1; j++) { forceV(PIT.x0, j, 0); forceV(PIT.x1 + 1, j, 0); }
  for (let i = PIT.x0; i <= PIT.x1; i++) { forceH(i, PIT.z0, 0); forceH(i, PIT.z1 + 1, 0); }
  forceH(STAIR_CELL, PIT.z0, 1);
  forcedGap.set(`h:${STAIR_CELL}:${PIT.z0}`, { c: CXC(STAIR_CELL), w: 3.0, lint: false });
  for (let i = PIT.x0; i <= PIT.x1; i++) if (i !== STAIR_CELL) parapet.add(`h:${i}:${PIT.z0}`);

  // ---- 3.4.e guarantee connectivity (locked edges are never touched) --------
  const reach = new Uint8Array(NX * NZ);
  function flood(sx, sz) {
    const q = [sx * NZ + sz];
    reach[sx * NZ + sz] = 1;
    while (q.length) {
      const c = q.pop(), x = (c / NZ) | 0, z = c % NZ;
      if (x > 0 && VW[vI(x, z)] && !reach[c - NZ]) { reach[c - NZ] = 1; q.push(c - NZ); }
      if (x < NX - 1 && VW[vI(x + 1, z)] && !reach[c + NZ]) { reach[c + NZ] = 1; q.push(c + NZ); }
      if (z > 0 && HW[hI(x, z)] && !reach[c - 1]) { reach[c - 1] = 1; q.push(c - 1); }
      if (z < NZ - 1 && HW[hI(x, z + 1)] && !reach[c + 1]) { reach[c + 1] = 1; q.push(c + 1); }
    }
  }
  flood(SPAWN_CELL.x, SPAWN_CELL.z);
  for (let guard = 0; guard < 40; guard++) {
    let opened = 0, missing = 0;
    for (let x = 0; x < NX; x++) for (let z = 0; z < NZ; z++) {
      if (reach[x * NZ + z]) continue;
      missing++;
      // find a reached neighbour across an unlocked edge and punch through
      if (x > 0 && reach[(x - 1) * NZ + z] && !VL[vI(x, z)]) { VW[vI(x, z)] = 1; opened++; continue; }
      if (x < NX - 1 && reach[(x + 1) * NZ + z] && !VL[vI(x + 1, z)]) { VW[vI(x + 1, z)] = 1; opened++; continue; }
      if (z > 0 && reach[x * NZ + z - 1] && !HL[hI(x, z)]) { HW[hI(x, z)] = 1; opened++; continue; }
      if (z < NZ - 1 && reach[x * NZ + z + 1] && !HL[hI(x, z + 1)]) { HW[hI(x, z + 1)] = 1; opened++; continue; }
    }
    if (!missing) break;
    if (!opened) {
      // last resort: ignore locks on one edge so nothing is ever stranded
      outer: for (let x = 0; x < NX; x++) for (let z = 0; z < NZ; z++) {
        if (reach[x * NZ + z]) continue;
        if (x > 0 && reach[(x - 1) * NZ + z]) { VW[vI(x, z)] = 1; break outer; }
        if (z > 0 && reach[x * NZ + z - 1]) { HW[hI(x, z)] = 1; break outer; }
      }
    }
    reach.fill(0);
    flood(SPAWN_CELL.x, SPAWN_CELL.z);
  }

  // ---- 3.4.f doorway styling: full gap, narrow doorway, or doorway + lintel --
  // 0 solid | 1 wide open | 2 doorway gap | 3 doorway gap with lintel
  const VSTYLE = new Uint8Array((NX + 1) * NZ);
  const HSTYLE = new Uint8Array(NX * (NZ + 1));
  const gapInfo = new Map();

  function styleEdge(key, passable, zone, lo, hi) {
    if (!passable) return 0;
    const forced = forcedGap.get(key);
    if (forced) {
      gapInfo.set(key, { c: forced.c, w: forced.w });
      return forced.lint ? 3 : 2;
    }
    if (!R.door.chance(zone.door)) return 1;
    const w = R.door.range(1.25, 2.0);
    const span = hi - lo;
    if (span < w + 1.0) return 1;
    const c = R.door.range(lo + w / 2 + 0.45, hi - w / 2 - 0.45);
    gapInfo.set(key, { c, w });
    // lintelled doorways are the minority: they read better sparingly and each
    // one costs an extra collision box.
    return R.door.chance(0.15) ? 3 : 2;
  }
  for (let i = 1; i < NX; i++) for (let j = 0; j < NZ; j++)
    VSTYLE[vI(i, j)] = styleEdge(`v:${i}:${j}`, VW[vI(i, j)], zoneAt(i - 1, j), ZS[j], ZS[j + 1]);
  for (let i = 0; i < NX; i++) for (let j = 1; j < NZ; j++)
    HSTYLE[hI(i, j)] = styleEdge(`h:${i}:${j}`, HW[hI(i, j)], zoneAt(i, j - 1), XS[i], XS[i + 1]);

  // =========================================================================
  // 3.5 WALL EMISSION — 1D interval merge per wall line, then chunked visuals,
  //     merged collision proxies, skirting, and a face list for decals.
  // =========================================================================
  const faces = [];   // { axis, fixed, a, b, yb, yt, zone }
  const lintels = [];

  function pushRun(runs, a, b, yb, yt, zid) {
    if (b - a < 0.06) return;
    const last = runs[runs.length - 1];
    if (last && last.yb === yb && last.yt === yt && last.zid === zid && Math.abs(last.b - a) < 1e-6) last.b = b;
    else runs.push({ a, b, yb, yt, zid });
  }

  function emitRuns(axis, fixed, runs) {
    for (const r of runs) {
      const len = r.b - r.a;
      const mid = (r.a + r.b) / 2;
      const h = r.yt - r.yb, cy = r.yb + h / 2;
      const wm = zoneWallMat[r.zid];
      // collision: one merged box for the whole run
      if (axis === 'v') proxy(fixed, cy, mid, WALL_T, h, len);
      else proxy(mid, cy, fixed, len, h, WALL_T);
      // visuals: ~5.5 m chunks so texel density stays even
      const n = Math.max(1, Math.round(len / 5.5));
      for (let k = 0; k < n; k++) {
        const a = r.a + (len * k) / n, b = r.a + (len * (k + 1)) / n;
        const cm = (a + b) / 2, cl = b - a;
        const g = axis === 'v' ? boxAt(fixed, cy, cm, WALL_T, h, cl) : boxAt(cm, cy, fixed, cl, h, WALL_T);
        zoneBatch[r.zid].add(wm, worldUV(g, UV_WALL));
      }
      // skirting board — the single detail that sells an interior
      const sk = axis === 'v'
        ? boxAt(fixed, r.yb + 0.085, mid, WALL_T + 0.06, 0.17, len)
        : boxAt(mid, r.yb + 0.085, fixed, len, 0.17, WALL_T + 0.06);
      zoneBatch[r.zid].add(M2.skirt, sk);
      faces.push({ axis, fixed, a: r.a, b: r.b, yb: r.yb, yt: r.yt, zid: r.zid });
    }
  }

  // --- vertical wall lines (constant x) ---
  for (let i = 0; i <= NX; i++) {
    const runs = [];
    for (let j = 0; j < NZ; j++) {
      const boundary = (i === 0 || i === NX);
      const L = i > 0 ? i - 1 : i, Rr = i < NX ? i : i - 1;
      const zid = zoneAt(L, j).id;
      const style = boundary ? 0 : VSTYLE[vI(i, j)];
      if (style === 1) continue;
      const pit = (i > 0 && isPit(i - 1, j)) !== (i < NX && isPit(i, j));
      const yb = pit ? PIT_Y : 0;
      const yt = Math.max(CH[L * NZ + j], CH[Rr * NZ + j]) + WALL_OVER;
      const a = ZS[j], b = ZS[j + 1];
      if (style === 0) { pushRun(runs, a, b, yb, yt, zid); continue; }
      const gi = gapInfo.get(`v:${i}:${j}`) || { c: (a + b) / 2, w: 1.6 };
      pushRun(runs, a, gi.c - gi.w / 2, yb, yt, zid);
      pushRun(runs, gi.c + gi.w / 2, b, yb, yt, zid);
      if (style === 3) lintels.push({ axis: 'v', fixed: XS[i], c: gi.c, w: gi.w, y0: 2.2, y1: yt, zid });
    }
    emitRuns('v', XS[i], runs);
  }
  // --- horizontal wall lines (constant z) ---
  for (let j = 0; j <= NZ; j++) {
    const runs = [];
    for (let i = 0; i < NX; i++) {
      const boundary = (j === 0 || j === NZ);
      const N = j > 0 ? j - 1 : j, Sx = j < NZ ? j : j - 1;
      const zid = zoneAt(i, N).id;
      const style = boundary ? 0 : HSTYLE[hI(i, j)];
      if (style === 1) continue;
      const pit = (j > 0 && isPit(i, j - 1)) !== (j < NZ && isPit(i, j));
      const yb = pit ? PIT_Y : 0;
      const para = parapet.has(`h:${i}:${j}`);
      const yt = para ? 1.05 : Math.max(CH[i * NZ + N], CH[i * NZ + Sx]) + WALL_OVER;
      const a = XS[i], b = XS[i + 1];
      if (style === 0) { pushRun(runs, a, b, yb, yt, zid); continue; }
      const gi = gapInfo.get(`h:${i}:${j}`) || { c: (a + b) / 2, w: 1.6 };
      pushRun(runs, a, gi.c - gi.w / 2, yb, yt, zid);
      pushRun(runs, gi.c + gi.w / 2, b, yb, yt, zid);
      if (style === 3) lintels.push({ axis: 'h', fixed: ZS[j], c: gi.c, w: gi.w, y0: 2.2, y1: yt, zid });
    }
    emitRuns('h', ZS[j], runs);
  }
  // lintels above the doorways that have them
  for (const L of lintels) {
    const h = L.y1 - L.y0, cy = L.y0 + h / 2;
    const g = L.axis === 'v' ? boxAt(L.fixed, cy, L.c, WALL_T, h, L.w) : boxAt(L.c, cy, L.fixed, L.w, h, WALL_T);
    zoneBatch[L.zid].add(zoneWallMat[L.zid], worldUV(g, UV_WALL));
    if (L.axis === 'v') proxy(L.fixed, cy, L.c, WALL_T, h, L.w); else proxy(L.c, cy, L.fixed, L.w, h, WALL_T);
    // a real doorframe on some of them
    if (R.dress.chance(0.4)) {
      const t = 0.1, fh = L.y0 + 0.06;
      for (const s of [-1, 1]) {
        const jamb = L.axis === 'v'
          ? boxAt(L.fixed, fh / 2, L.c + s * (L.w / 2 + t / 2), WALL_T + 0.07, fh, t)
          : boxAt(L.c + s * (L.w / 2 + t / 2), fh / 2, L.fixed, t, fh, WALL_T + 0.07);
        zoneBatch[L.zid].add(M2.frame, jamb);
      }
      const head = L.axis === 'v'
        ? boxAt(L.fixed, fh, L.c, WALL_T + 0.07, t, L.w + t * 2)
        : boxAt(L.c, fh, L.fixed, L.w + t * 2, t, WALL_T + 0.07);
      zoneBatch[L.zid].add(M2.frame, head);
    }
  }

  // =========================================================================
  // 3.6 FLOORS
  // =========================================================================
  function floorSlab(zid, material, x0, z0, x1, z1, y, uvS) {
    const g = boxAt((x0 + x1) / 2, y - 0.2, (z0 + z1) / 2, x1 - x0, 0.4, z1 - z0);
    zoneBatch[zid].add(material, worldUV(g, uvS));
    proxy((x0 + x1) / 2, y - 0.2, (z0 + z1) / 2, x1 - x0, 0.4, z1 - z0);
  }
  for (const z of ZONES) {
    const r = rectOf(z);
    if (z.id !== 'service') { floorSlab(z.id, zoneFloorMat[z.id], r.x0, r.z0, r.x1, r.z1, 0, UV_FLOOR); continue; }
    // service zone: four strips around the pit, plus the pit floor 3 m down
    floorSlab(z.id, M.carpetC, r.x0, r.z0, r.x1, RPIT.z0, 0, UV_FLOOR);
    floorSlab(z.id, M.carpetC, r.x0, RPIT.z1, r.x1, r.z1, 0, UV_FLOOR);
    floorSlab(z.id, M.carpetC, r.x0, RPIT.z0, RPIT.x0, RPIT.z1, 0, UV_FLOOR);
    floorSlab(z.id, M.carpetC, RPIT.x1, RPIT.z0, r.x1, RPIT.z1, 0, UV_FLOOR);
    floorSlab(z.id, M.concrete, RPIT.x0, RPIT.z0, RPIT.x1, RPIT.z1, PIT_Y, UV_CONC);
  }

  // =========================================================================
  // 3.7 SUSPENDED CEILING — plenum void, T-bar lattice, instanced tiles
  // =========================================================================
  const noCeilRects = [RSHAFT];
  const clipsRect = (x0, x1, z0, z1) =>
    noCeilRects.some(r => x1 > r.x0 && x0 < r.x1 && z1 > r.z0 && z0 < r.z1);

  // plenum: a dark plane per cell, 0.34 m above the tile plane
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (isShaft(i, j)) continue;
    const h = CH[i * NZ + j];
    ceilBatch.add(M2.plenum, planeAt(CXC(i), h + 0.34, CZC(j), CELLW[i] + 0.02, CELLD[j] + 0.02, true));
  }
  // the shaft gets its own lid 8 m up
  ceilBatch.add(M2.plenum, planeAt(CXC(SHAFT.x), SHAFT.h + 0.34, (RSHAFT.z0 + RSHAFT.z1) / 2,
    CELLW[SHAFT.x] + 0.02, RSHAFT.z1 - RSHAFT.z0 + 0.02, true));

  // T-bar lattice + tile positions, per zone (so heights stay consistent)
  const tilePos = [];
  const RCOLLAPSE = rectOf(COLLAPSE);
  for (const z of ZONES) {
    const r = rectOf(z);
    const h = z.h;
    const missBase = z.id === 'collapsed' ? 0.085 : z.id === 'damp' ? 0.035 : z.id === 'service' ? 0.022 : 0.006;
    // bars running along X
    for (let zz = r.z0; zz <= r.z1 + 0.001; zz += TILE) {
      const segs = [[r.x0, r.x1]];
      const out = [];
      for (const [a, b] of segs) {
        if (!clipsRect(a, b, zz - 0.05, zz + 0.05)) { out.push([a, b]); continue; }
        if (a < RSHAFT.x0) out.push([a, RSHAFT.x0]);
        if (b > RSHAFT.x1) out.push([RSHAFT.x1, b]);
      }
      for (const [a, b] of out) if (b - a > 0.2)
        ceilBatch.add(M2.tbar, boxAt((a + b) / 2, h + 0.015, zz, b - a, 0.03, 0.055));
    }
    // bars running along Z
    for (let xx = r.x0; xx <= r.x1 + 0.001; xx += TILE) {
      const out = [];
      if (!clipsRect(xx - 0.05, xx + 0.05, r.z0, r.z1)) out.push([r.z0, r.z1]);
      else {
        if (r.z0 < RSHAFT.z0) out.push([r.z0, RSHAFT.z0]);
        if (r.z1 > RSHAFT.z1) out.push([RSHAFT.z1, r.z1]);
      }
      for (const [a, b] of out) if (b - a > 0.2)
        ceilBatch.add(M2.tbar, boxAt(xx, h + 0.015, (a + b) / 2, 0.055, 0.03, b - a));
    }
    // tiles
    for (let xx = r.x0 + TILE / 2; xx < r.x1; xx += TILE) {
      for (let zz = r.z0 + TILE / 2; zz < r.z1; zz += TILE) {
        if (inWorldRect(RSHAFT, xx, zz)) continue;
        const collapsedHere = inWorldRect(RCOLLAPSE, xx, zz);
        const palin = inWorldRect(RPAL, xx, zz);
        let miss = missBase;
        if (collapsedHere) miss = 0.55;
        if (palin) miss = 0;
        if (!palin && R.light.chance(miss)) continue;
        tilePos.push(xx, h, zz);
      }
    }
  }
  {
    const tileGeo = new THREE.PlaneGeometry(TILE - 0.07, TILE - 0.07);
    tileGeo.rotateX(Math.PI / 2);
    const n = tilePos.length / 3;
    const tiles = props.scatter(tileGeo, M.ceilTile, n, (i, d) => {
      d.position.set(tilePos[i * 3], tilePos[i * 3 + 1], tilePos[i * 3 + 2]);
    }, 4021);
    tiles.castShadow = false;
    tiles.receiveShadow = true;
    ctx.addDecor(tiles);
  }

  ctx.addDecor(ceilBatch.build(false));

  // =========================================================================
  // 3.8 LANDMARK CONSTRUCTION
  // =========================================================================
  const hallZ = ZONES.find(z => z.id === 'hall');
  const RHALL = rectOf(hallZ);

  // --- (a) THE PILLAR HALL --------------------------------------------------
  const MEZ = { x0: RHALL.x0 + 0.8, x1: RHALL.x0 + 25.0, z0: ZS[11], z1: ZS[11] + 6.6, y: 3.0 };
  for (let x = RHALL.x0 + 5.5; x < RHALL.x1 - 3.5; x += 8.6) {
    for (let z = RHALL.z0 + 5.0; z < RHALL.z1 - 3.5; z += 8.9) {
      const jx = x + ctx.noise.fbm(x * 0.13, z * 0.13, 2) * 1.1;
      const jz = z + ctx.noise.fbm(x * 0.09 + 31, z * 0.09, 2) * 1.1;
      if (jx > MEZ.x0 - 1.4 && jx < MEZ.x1 + 1.4 && jz > MEZ.z0 - 1.4 && jz < MEZ.z1 + 1.4) continue;
      const col = props.column(hallZ.h, 0.40, M.concrete, { seg: 12 });
      col.position.set(jx, 0, jz);
      STATIC.add(col);
      proxy(jx, hallZ.h / 2, jz, 0.94, hallZ.h, 0.94);
    }
  }

  // --- (b) THE MAINTENANCE MEZZANINE ---------------------------------------
  {
    const w = MEZ.x1 - MEZ.x0, d = MEZ.z1 - MEZ.z0, cxm = (MEZ.x0 + MEZ.x1) / 2, czm = (MEZ.z0 + MEZ.z1) / 2;
    zoneBatch.hall.add(M.panelMetal, worldUV(boxAt(cxm, MEZ.y - 0.06, czm, w, 0.12, d), UV_CONC));
    proxy(cxm, MEZ.y - 0.06, czm, w, 0.12, d);
    // support posts + a girder under the free edge
    for (let x = MEZ.x0 + 2.0; x < MEZ.x1; x += 5.2) {
      zoneBatch.hall.add(M2.steel, boxAt(x, MEZ.y / 2, MEZ.z1 - 0.4, 0.16, MEZ.y, 0.16));
      proxy(x, MEZ.y / 2, MEZ.z1 - 0.4, 0.2, MEZ.y, 0.2);
    }
    // south railing, with a deliberate 4.4 m gap at the east end so the crate
    // stair actually gets you onto the deck
    const gapW = 4.4;
    const railLen = w - 0.4 - gapW;
    const railCx = MEZ.x0 + 0.2 + railLen / 2;
    const rail = props.railing(railLen, 1.05, M2.steel);
    rail.position.set(railCx, MEZ.y, MEZ.z1 - 0.12);
    STATIC.add(rail);
    proxy(railCx, MEZ.y + 0.55, MEZ.z1 - 0.12, railLen, 1.1, 0.1);
    const railE = props.railing(d - 0.4, 1.05, M2.steel);
    railE.rotation.y = Math.PI / 2;
    railE.position.set(MEZ.x1 - 0.12, MEZ.y, czm);
    STATIC.add(railE);
    proxy(MEZ.x1 - 0.12, MEZ.y + 0.55, czm, 0.1, 1.1, d);
    // ladder (flavour) and a crate stair (the guaranteed route up)
    makeLadder(zoneBatch.hall, M2.steel, MEZ.x1 - 3.6, MEZ.z1 + 0.24, MEZ.y + 0.9, 'z');
    for (let k = 0; k < 3; k++) {
      const c = props.crate(0.9, M.ply);
      c.position.set(MEZ.x1 - 0.9 - k * 0.95, k * 0.9, MEZ.z1 + 1.1);
      c.rotation.y = (k * 0.17) - 0.1;
      STATIC.add(c);
      proxy(MEZ.x1 - 0.9 - k * 0.95, k * 0.9 + 0.45, MEZ.z1 + 1.1, 0.92, 0.9, 0.92);
    }
    // stacked spare ceiling tiles hiding the pup's decoy spot / a powerup
    for (let k = 0; k < 6; k++) {
      zoneBatch.hall.add(M.ceilTile, boxAt(MEZ.x0 + 2.2 + (k % 2) * 0.1, MEZ.y + 0.03 + k * 0.05, MEZ.z0 + 1.6, 1.15, 0.05, 1.15));
    }
  }

  // --- (c) THE COLLAPSED SECTION -------------------------------------------
  {
    const rc = rectOf(COLLAPSE);
    const zc = ZONES.find(z => z.id === 'collapsed');
    for (let k = 0; k < 26; k++) {
      const x = R.dress.range(rc.x0 + 1, rc.x1 - 1), z = R.dress.range(rc.z0 + 1, rc.z1 - 1);
      // dangling wires from the torn grid
      const len = R.dress.range(0.5, 1.9);
      zoneBatch.collapsed.add(M2.dark, boxAt(x, zc.h - len / 2, z, 0.035, len, 0.035));
    }
    for (let k = 0; k < 5; k++) {
      const z = rc.z0 + 1.5 + k * ((rc.z1 - rc.z0 - 3) / 4);
      pipeRun(zoneBatch.collapsed, M.rust, 'x', rc.x0 + 0.8, rc.x1 - 0.8,
        zc.h - R.dress.range(0.18, 0.45), z, 3, 0.085);
    }
    for (let k = 0; k < 5; k++) {
      const rb = props.rubble(R.dress.range(1.0, 2.0), 12, M.concrete, 700 + k);
      rb.position.set(R.dress.range(rc.x0 + 1, rc.x1 - 1), 0, R.dress.range(rc.z0 + 1, rc.z1 - 1));
      STATIC.add(rb);
    }
    // fallen ceiling tiles, instanced
    const tileFall = new THREE.BoxGeometry(1.1, 0.04, 1.1);
    const fallen = props.scatter(tileFall, M.ceilTile, 120, (i, d, r) => {
      const inCollapse = i < 70;
      const rr = inCollapse ? rc : rectOf(ZONES.find(z => z.id === 'damp'));
      d.position.set(r.range(rr.x0 + 1, rr.x1 - 1), 0.03 + (i % 3) * 0.04, r.range(rr.z0 + 1, rr.z1 - 1));
      d.rotation.set(r.range(-0.09, 0.09), r() * 6.28, r.range(-0.09, 0.09));
    }, 8821);
    fallen.castShadow = false;
    ctx.addDecor(fallen);
    // the swinging pendant
    const pend = props.pendant(1.15, { color: 0xffe0a2, intensity: 9, swing: 0.0 });
    pend.position.set((rc.x0 + rc.x1) / 2 + 1.4, zc.h + 0.1, (rc.z0 + rc.z1) / 2);
    LIVE.add(pend);
    const pl = new THREE.PointLight(0xffdba0, 10, 13, 1.8);
    pl.position.set(pend.position.x, zc.h - 1.2, pend.position.z);
    ctx.light(pl);
    ctx.onUpdate((dt, t) => {
      pend.rotation.z = Math.sin(t * 0.85) * 0.11;
      pend.rotation.x = Math.cos(t * 0.61) * 0.055;
      pl.position.x = pend.position.x + Math.sin(t * 0.85) * 0.11 * -1.2;
      pl.position.z = pend.position.z + Math.cos(t * 0.61) * 0.055 * 1.2;
    });
  }

  // --- (d) THE WET SECTION --------------------------------------------------
  {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(RALC.x1 - RALC.x0 - 0.6, RALC.z1 - RALC.z0 - 0.6), waterMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set((RALC.x0 + RALC.x1) / 2, 0.055, (RALC.z0 + RALC.z1) / 2);
    w.userData.collide = false;
    w.receiveShadow = true;
    LIVE.add(w);
    ctx.onUpdate((dt) => waterMat.userData.tick(dt));
    // a mop bucket and a floating tile
    const bucket = props.trashBin(0.24, 0.34);
    bucket.position.set(RALC.x0 + 1.6, 0, RALC.z0 + 1.4);
    STATIC.add(bucket);
    const mop = props.cyl(0.025, 0.025, 1.5, M.ply, { seg: 6, collide: false });
    mop.position.set(RALC.x0 + 1.7, 0.2, RALC.z0 + 1.5);
    mop.rotation.z = 0.5;
    STATIC.add(mop);
    for (let k = 0; k < 3; k++) {
      zoneBatch.damp.add(M.ceilTile, boxAt(RALC.x0 + 2.6 + k * 1.4, 0.09, RALC.z1 - 1.8 - k * 0.7, 1.1, 0.04, 1.1));
    }
  }

  // --- (e) THE TALLY ROOM ---------------------------------------------------
  const tallyCentre = new THREE.Vector3((XS[TALLY.x0] + XS[TALLY.x1 + 1]) / 2, 0, (ZS[TALLY.z0] + ZS[TALLY.z1 + 1]) / 2);
  {
    const ch = props.chair(mat.solid({ color: 0x3a3a3e, roughness: 0.7 }));
    ch.position.copy(tallyCentre);
    ch.rotation.y = 2.35;
    STATIC.add(ch);
    proxy(tallyCentre.x, 0.4, tallyCentre.z, 0.5, 0.8, 0.5);
    const spot = new THREE.SpotLight(0xfff4d2, 26, 11, Math.PI / 3.6, 0.55, 1.7);
    spot.position.set(tallyCentre.x, 3.7, tallyCentre.z);
    spot.target.position.set(tallyCentre.x, 0, tallyCentre.z);
    ctx.light(spot, { shadow: true, far: 14 });
    const fix = props.lightPanel(1.2, { color: 0xfff2c8, intensity: 4.2 });
    fix.position.set(tallyCentre.x, 3.86, tallyCentre.z);
    STATIC.add(fix);
  }

  // --- (f) THE SUNKEN SUB-LEVEL --------------------------------------------
  const stairX = CXC(STAIR_CELL);
  {
    const steps = 16, sh = 3.0 / steps, sd = 0.40, sw = 2.6;
    for (let k = 0; k < steps; k++) {
      const y = PIT_Y + sh / 2 + k * sh;
      const z = RPIT.z0 + 6.6 - 0.2 - k * sd;
      zoneBatch.service.add(M.concrete, worldUV(boxAt(stairX, y, z, sw, sh, sd), UV_CONC));
      proxy(stairX, y, z, sw, sh, sd);
    }
    // raking side cheeks — visual only, and deliberately shallow so the void
    // under the flight stays open (that is where the pup lives)
    for (let k = 0; k < steps; k++) {
      const y = PIT_Y + sh / 2 + k * sh;
      const z = RPIT.z0 + 6.6 - 0.2 - k * sd;
      for (const s of [-1, 1]) {
        zoneBatch.service.add(M.concrete,
          worldUV(boxAt(stairX + s * (sw / 2 + 0.08), y - 0.14, z, 0.16, 0.34, sd + 0.02), UV_CONC));
      }
    }
    // railing along the parapet lip
    const railLen = RPIT.x1 - RPIT.x0;
    const pr = props.railing(railLen - 0.4, 0.95, M2.steel);
    pr.position.set((RPIT.x0 + RPIT.x1) / 2, 1.05, RPIT.z0);
    STATIC.add(pr);
    // sub-level dressing: shelf racks, lockers, pipes overhead
    const rack = props.shelfRack(3, 3, 2.4, 1.1, 1.8, mat.solid({ color: 0x6d5f3d, roughness: 0.7, metalness: 0.3 }));
    rack.position.set(RPIT.x0 + 5.0, PIT_Y, RPIT.z1 - 4.0);
    STATIC.add(rack);
    proxy(RPIT.x0 + 5.0, PIT_Y + 1.4, RPIT.z1 - 4.0, 7.2, 2.8, 1.2);
    const lk = props.lockers(4, M.panelMetal);
    lk.position.set(RPIT.x1 - 3.4, PIT_Y, RPIT.z0 + 2.2);
    lk.rotation.y = -Math.PI / 2;
    STATIC.add(lk);
    proxy(RPIT.x1 - 3.4, PIT_Y + 0.93, RPIT.z0 + 2.2, 0.5, 1.86, 1.7);
    for (let k = 0; k < 4; k++) {
      pipeRun(zoneBatch.service, M.rust, 'x', RPIT.x0 + 1, RPIT.x1 - 1, 3.35, RPIT.z0 + 4 + k * 6.2, 4, 0.1);
    }
  }

  // --- (g) THE 8 M SHAFT ----------------------------------------------------
  {
    const cxs = CXC(SHAFT.x), cz0 = RSHAFT.z0, cz1 = RSHAFT.z1;
    for (let k = 0; k < 6; k++) {
      const y = 1.9 + k * 1.15;
      const f = props.fluorescent(1.3, { color: k === 3 ? 0xe8f0c0 : 0xfff2c8, intensity: 3.4 - k * 0.35 });
      f.position.set(cxs, y, cz0 + 0.55 + (k % 2) * 0.5);
      f.rotation.x = Math.PI / 2.1;
      STATIC.add(f);
      const f2 = props.fluorescent(1.3, { color: 0xfff2c8, intensity: 3.0 - k * 0.3 });
      f2.position.set(cxs, y + 0.55, cz1 - 0.55 - (k % 2) * 0.5);
      f2.rotation.x = -Math.PI / 2.1;
      STATIC.add(f2);
    }
    const shl = new THREE.PointLight(0xfff0c4, 12, 16, 1.7);
    shl.position.set(cxs, 3.4, (cz0 + cz1) / 2);
    ctx.light(shl);
  }

  // --- (h) THE PALINDROME CORRIDOR -----------------------------------------
  {
    const axis = CXC(PAL.mid), zc = CZC(PAL.z), h = ZONES[1].h;
    const chairMat = mat.solid({ color: 0x3a3a3e, roughness: 0.7 });
    for (const s of [-1, 1]) {
      for (const d of [5.4, 12.6, 19.8]) {
        const dead = Math.abs(d - 12.6) < 0.01;
        const f = props.lightPanel(1.2, { color: 0xfff2c8, intensity: dead ? 0.0 : 3.6 });
        f.position.set(axis + s * d, h - 0.05, zc);
        STATIC.add(f);
        if (!dead && s > 0) {
          const l = new THREE.PointLight(0xfff0c8, 9, 14, 1.7);
          l.position.set(axis + s * d, h - 0.4, zc);
          ctx.light(l);
        }
      }
      const c = props.chair(chairMat);
      c.position.set(axis + s * 22.4, 0.42, zc + 1.1);
      c.rotation.set(Math.PI / 2 * 0.92, s > 0 ? 0.7 : Math.PI - 0.7, 0.15);
      STATIC.add(c);
      zoneBatch.corridors.add(M.ceilTile, boxAt(axis + s * 16.2, 0.03, zc - 1.5, 1.1, 0.04, 1.1));
      // identical dead-end plates, hung flat on each identical end wall
      const dz = props.sign('DO NOT\nEXIT', { background: 0x3a3222, color: 0xd9c98c, height: 0.42, fontSize: 72 });
      dz.position.set(axis + s * 24.82, 1.85, zc);
      dz.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      STATIC.add(dz);
    }
  }

  // =========================================================================
  // 3.9 DECALS — painted planes floated 1.2 cm off the wall face
  // =========================================================================
  const decal = (w, h, draw) => mat.painted(w, h, draw, { transparent: false, alphaTest: 0.34, roughness: 0.92 });

  const D_STAIN = decal(160, 200, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(84,64,28,0.95)');
    g.addColorStop(0.5, 'rgba(122,98,46,0.8)');
    g.addColorStop(1, 'rgba(150,132,74,0.0)');
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = (0.26 + 0.13 * Math.sin(a * 3.1) + 0.07 * Math.sin(a * 6.7 + 1.2)) * W;
      const x = W / 2 + Math.cos(a) * r, y = H * 0.36 + Math.sin(a) * r * 1.5;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.fill();
    c.strokeStyle = 'rgba(72,54,22,0.85)';
    for (let i = 0; i < 11; i++) {
      const x = W * (0.16 + 0.68 * (i / 10));
      c.lineWidth = 1.5 + (i % 3);
      c.beginPath(); c.moveTo(x, H * 0.2);
      c.lineTo(x + (i % 2 ? 4 : -5), H * (0.55 + 0.4 * (((i * 7) % 5) / 5)));
      c.stroke();
    }
  });
  const D_MOULD = decal(160, 160, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let k = 0; k < 90; k++) {
      const t = k / 90;
      const x = W * (0.5 + 0.42 * Math.sin(k * 2.399) * (1 - t * 0.3));
      const y = H * (1 - t * t * 0.92);
      const r = (1 - t) * 22 + 4;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(28,34,20,${0.85 - t * 0.5})`);
      g.addColorStop(1, 'rgba(40,48,26,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
    }
  });
  const D_PATCH = decal(160, 160, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#8e8a7e';
    c.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = (0.3 + 0.09 * Math.sin(a * 5.3) + 0.05 * Math.cos(a * 9.1)) * W;
      const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r * 1.15;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.fill();
    c.strokeStyle = 'rgba(60,55,46,0.9)'; c.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.moveTo(W * 0.3 + i * 5, H * 0.32);
      c.lineTo(W * 0.34 + i * 6, H * 0.7);
      c.stroke();
    }
    c.fillStyle = 'rgba(226,214,170,0.75)';
    c.beginPath(); c.moveTo(W * 0.2, H * 0.3); c.lineTo(W * 0.42, H * 0.24);
    c.lineTo(W * 0.36, H * 0.52); c.lineTo(W * 0.18, H * 0.46); c.fill();
  });
  const D_SCUFF = decal(128, 96, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const y = H * (0.25 + 0.5 * ((i * 13) % 11) / 11);
      c.strokeStyle = `rgba(48,42,30,${0.18 + 0.3 * ((i * 7) % 5) / 5})`;
      c.lineWidth = 1 + (i % 4);
      c.beginPath();
      c.moveTo(W * 0.08 + (i % 5) * 6, y);
      c.lineTo(W * 0.55 + (i % 7) * 8, y + ((i % 3) - 1) * 3);
      c.stroke();
    }
  });
  const D_TALLY = decal(256, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(30,24,14,0.92)';
    for (let row = 0; row < 9; row++) {
      for (let grp = 0; grp < 6; grp++) {
        const ox = 10 + grp * 40, oy = 14 + row * 27;
        c.lineWidth = 2.2;
        for (let k = 0; k < 4; k++) {
          c.beginPath();
          c.moveTo(ox + k * 6 + Math.sin(row * 3 + k) * 1.4, oy);
          c.lineTo(ox + k * 6 + Math.cos(grp * 2 + k) * 2.0, oy + 19);
          c.stroke();
        }
        c.beginPath(); c.moveTo(ox - 3, oy + 17); c.lineTo(ox + 22, oy + 2); c.stroke();
      }
    }
  });
  const D_WET = decal(160, 96, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const g = c.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, 'rgba(38,40,26,0.9)');
    g.addColorStop(0.55, 'rgba(64,64,38,0.55)');
    g.addColorStop(1, 'rgba(90,88,54,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });

  function addDecal(face, material, w, h, tAlong, y, side) {
    const g = new THREE.PlaneGeometry(w, h);
    if (face.axis === 'v') {
      g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.translate(face.fixed + side * (WALL_T / 2 + 0.013), y, tAlong);
    } else {
      if (side < 0) g.rotateY(Math.PI);
      g.translate(tAlong, y, face.fixed + side * (WALL_T / 2 + 0.013));
    }
    decalBatch.add(material, g);
  }

  for (const f of faces) {
    if (f.yt - f.yb < 1.4 || f.b - f.a < 1.2) continue;
    const zid = f.zid;
    const density = zid === 'damp' ? 1.35 : zid === 'collapsed' ? 1.0 : 0.45;
    const n = Math.min(4, Math.floor((f.b - f.a) / 6.0 * density) + (R.decal.chance(density * 0.4) ? 1 : 0));
    for (let k = 0; k < n; k++) {
      const t = R.decal.range(f.a + 0.9, f.b - 0.9);
      const side = R.decal.chance(0.5) ? 1 : -1;
      if (inWorldRect(RPAL, f.axis === 'v' ? f.fixed : t, f.axis === 'v' ? t : f.fixed)) continue;
      const roll = R.decal();
      if (zid === 'damp' && roll < 0.45) {
        addDecal(f, D_MOULD, R.decal.range(1.2, 2.4), R.decal.range(1.0, 1.9), t, f.yb + 0.75, side);
      } else if (roll < 0.34) {
        addDecal(f, D_STAIN, R.decal.range(1.1, 2.3), R.decal.range(1.4, 2.4), t, f.yb + Math.min(2.0, (f.yt - f.yb) * 0.62), side);
      } else if (roll < 0.55) {
        addDecal(f, D_SCUFF, R.decal.range(0.9, 1.8), 0.6, t, f.yb + R.decal.range(0.35, 0.9), side);
      } else if (roll < 0.68) {
        addDecal(f, D_PATCH, R.decal.range(0.7, 1.5), R.decal.range(0.7, 1.4), t, f.yb + R.decal.range(0.7, 1.5), side);
      }
    }
    // damp band along the skirting in the wet zone
    if (zid === 'damp' && R.decal.chance(0.75)) {
      const side = R.decal.chance(0.5) ? 1 : -1;
      addDecal(f, D_WET, f.b - f.a - 0.1, 0.85, (f.a + f.b) / 2, f.yb + 0.42, side);
    }
  }
  // the scrawl in the tally room — every interior face, floor to ceiling
  {
    const rt = rectOf(TALLY);
    // addDecal already pushes out by WALL_T/2 + 1.3 cm along `side`, so the
    // face coordinate is the wall centre line, not the wall surface.
    for (const [ax, fx, side, a, b] of [
      ['v', rt.x0, 1, rt.z0, rt.z1], ['v', rt.x1, -1, rt.z0, rt.z1],
      ['h', rt.z0, 1, rt.x0, rt.x1], ['h', rt.z1, -1, rt.x0, rt.x1],
    ]) {
      const face = { axis: ax, fixed: fx };
      const span = b - a;
      const cols = Math.max(2, Math.round(span / 3.0));
      for (let k = 0; k < cols; k++) {
        for (let row = 0; row < 3; row++) {
          addDecal(face, D_TALLY, span / cols - 0.2, 0.95, a + span * (k + 0.5) / cols, 0.7 + row * 1.0, side);
        }
      }
    }
  }
  ctx.addDecor(decalBatch.build(false));

  // =========================================================================
  // 3.10 SET DRESSING — the Backrooms is mostly empty; emptiness is the point.
  // =========================================================================

  // cubicle partitions in the warren
  {
    const wz = ZONES[0];
    for (let i = wz.x0; i <= wz.x1; i++) for (let j = wz.z0; j <= wz.z1; j++) {
      if (!R.dress.chance(0.30)) continue;
      const horiz = R.dress.chance(0.5);
      const len = Math.min(horiz ? CELLW[i] : CELLD[j], 3.2) * R.dress.range(0.5, 0.85);
      const x = CXC(i) + R.dress.range(-0.9, 0.9), z = CZC(j) + R.dress.range(-0.9, 0.9);
      const g = horiz ? boxAt(x, 0.68, z, len, 1.36, 0.09) : boxAt(x, 0.68, z, 0.09, 1.36, len);
      zoneBatch.warren.add(M2.partition, g);
      if (horiz) proxy(x, 0.68, z, len, 1.36, 0.12); else proxy(x, 0.68, z, 0.12, 1.36, len);
    }
  }

  // scattered clutter, placed on open cells picked per zone
  function randomCellIn(zone, rng) {
    for (let tries = 0; tries < 24; tries++) {
      const i = rng.int(zone.x0, zone.x1), j = rng.int(zone.z0, zone.z1);
      if (i === SPAWN_CELL.x && j === SPAWN_CELL.z) continue;
      if (isShaft(i, j)) continue;
      return { i, j, x: CXC(i), z: CZC(j), y: floorYAt(i, j) };
    }
    return { i: zone.x0, j: zone.z0, x: CXC(zone.x0), z: CZC(zone.z0), y: 0 };
  }

  const chairMat = mat.solid({ color: 0x3a3a3e, roughness: 0.7 });
  const crateStacks = [];
  for (const zid of ['warren', 'corridors', 'collapsed', 'rooms', 'damp', 'service']) {
    const zone = ZONES.find(z => z.id === zid);
    // one tipped office chair per couple of zones
    if (R.dress.chance(0.6)) {
      const p = randomCellIn(zone, R.dress);
      const c = props.chair(chairMat);
      c.position.set(p.x, p.y + 0.4, p.z);
      c.rotation.set(Math.PI / 2 * 0.9, R.dress() * 6.28, 0.2);
      STATIC.add(c);
    }
    // a stack of three damp cardboard boxes
    {
      const p = randomCellIn(zone, R.dress);
      for (let k = 0; k < 3; k++) {
        const s = 0.62 - k * 0.05;
        const bx = p.x + R.dress.range(-0.12, 0.12), bz = p.z + R.dress.range(-0.12, 0.12);
        zoneBatch[zid].add(M2.card, boxAt(bx, p.y + s / 2 + k * 0.62, bz, s, s, s * 0.9));
        proxy(bx, p.y + s / 2 + k * 0.62, bz, s, s, s * 0.9);
      }
      crateStacks.push({ x: p.x, y: p.y, z: p.z });
    }
    // wooden crate stack (climbable, hideable). Capped at 2 high: 3 would put
    // the top at 2.7 m, and a 1.29 m jump from there clears a 2.9 m wall.
    if (R.dress.chance(0.7)) {
      const p = randomCellIn(zone, R.dress);
      const n = 2;
      for (let k = 0; k < n; k++) {
        const c = props.crate(0.9, M.ply);
        c.position.set(p.x + k * 0.1, p.y + k * 0.9, p.z - k * 0.08);
        c.rotation.y = R.dress.range(-0.25, 0.25);
        STATIC.add(c);
        proxy(p.x + k * 0.1, p.y + k * 0.9 + 0.45, p.z - k * 0.08, 0.92, 0.9, 0.92);
      }
      crateStacks.push({ x: p.x, y: p.y, z: p.z });
    }
    // a bank of lockers against something
    if (R.dress.chance(0.5)) {
      const p = randomCellIn(zone, R.dress);
      const lk = props.lockers(3, M.panelMetal);
      lk.position.set(p.x, p.y, p.z);
      lk.rotation.y = R.dress.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      STATIC.add(lk);
      proxy(p.x, p.y + 0.93, p.z, 1.3, 1.86, 1.3);
      crateStacks.push({ x: p.x, y: p.y, z: p.z });
    }
  }

  // the lone shopping trolley, built from primitives
  {
    const p = randomCellIn(ZONES.find(z => z.id === 'corridors'), R.dress);
    const g = new THREE.Group();
    const wire = M2.steel;
    const bw = 0.56, bd = 0.86, bh = 0.5, by = 0.52;
    for (const [dx, dz, sx, sz] of [[0, -bd / 2, bw, 0.03], [0, bd / 2, bw, 0.03], [-bw / 2, 0, 0.03, bd], [bw / 2, 0, 0.03, bd]]) {
      const side = props.boxC(sx, bh, sz, wire, { collide: false, shadow: true });
      side.position.set(dx, by + bh / 2, dz);
      g.add(side);
    }
    const base = props.boxC(bw, 0.03, bd, wire, { collide: false }); base.position.set(0, by, 0); g.add(base);
    for (let k = -3; k <= 3; k++) {
      const bar = props.boxC(0.012, bh * 0.9, 0.012, wire, { collide: false });
      bar.position.set(k * 0.075, by + bh / 2, -bd / 2 - 0.01); g.add(bar);
    }
    // cyl() puts its mesh at local +h/2, so rotating by +90deg about Z moves it
    // to -h/2 in X: offset the group by +h/2 to land it centred.
    const handle = props.cyl(0.018, 0.018, bw, wire, { seg: 8, collide: false });
    handle.rotation.z = Math.PI / 2; handle.position.set(bw / 2, by + bh + 0.12, bd / 2 + 0.05); g.add(handle);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = props.cyl(0.014, 0.014, by, wire, { seg: 6, collide: false });
      leg.position.set(sx * bw * 0.42, 0.06, sz * bd * 0.42); g.add(leg);
      const w = props.cyl(0.055, 0.055, 0.03, M2.dark, { seg: 8, collide: false });
      w.rotation.x = Math.PI / 2; w.position.set(sx * bw * 0.42, 0.055, sz * bd * 0.42); g.add(w);
    }
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = 0.9;
    STATIC.add(g);
    proxy(p.x, p.y + 0.5, p.z, 0.7, 1.0, 0.95);
  }

  // the wall phone with a cut cord
  {
    // pick a 'h' face so the box lies flat against the wall without rotating
    const f = faces.find(ff => ff.axis === 'h' && ff.zid === 'corridors' && ff.b - ff.a > 6 && ff.yt > 3);
    if (f) {
      const px = (f.a + f.b) / 2;
      const pz = f.fixed + (WALL_T / 2 + 0.05);
      const body = props.boxC(0.16, 0.28, 0.1, mat.solid({ color: 0xd8cfae, roughness: 0.65 }), { collide: false });
      body.position.set(px, 1.42, pz); STATIC.add(body);
      const rec = props.boxC(0.06, 0.2, 0.06, mat.solid({ color: 0x24241f, roughness: 0.7 }), { collide: false });
      rec.position.set(px + 0.09, 1.44, pz + 0.03);
      STATIC.add(rec);
      for (let k = 0; k < 5; k++) {
        const c = props.cyl(0.008, 0.008, 0.09, M2.dark, { seg: 5, collide: false });
        c.position.set(px + 0.02 * (k % 2), 1.28 - k * 0.085, pz + 0.01 * k);
        c.rotation.z = 0.3 * ((k % 2) ? 1 : -1);
        STATIC.add(c);
      }
    }
  }

  // fire-exit signs that point nowhere
  {
    const cands = faces.filter(f => f.yt - f.yb > 2.6 && f.b - f.a > 4).slice(0, 400);
    R.dress.shuffle(cands);
    for (let k = 0; k < 5 && k < cands.length; k++) {
      const f = cands[k * 37 % cands.length];
      const t = (f.a + f.b) / 2, side = R.dress.chance(0.5) ? 1 : -1;
      const s = props.sign(k % 2 ? 'EXIT  >' : '<  EXIT', {
        background: 0x0d3f22, color: 0xbdffd8, height: 0.26, fontSize: 72,
        emissive: 0x2bff8a, emissiveIntensity: 1.6,
      });
      if (f.axis === 'v') { s.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; s.position.set(f.fixed + side * 0.2, 2.15, t); }
      else { s.rotation.y = side > 0 ? 0 : Math.PI; s.position.set(t, 2.15, f.fixed + side * 0.2); }
      STATIC.add(s);
    }
  }

  // =========================================================================
  // 3.11 LIGHTING — emissive troffers everywhere, <= 18 real lights.
  // =========================================================================
  ctx.light(new THREE.AmbientLight(0x3f3a25, 0.9));
  ctx.light(new THREE.HemisphereLight(0x7d7248, 0x241f12, 0.42));

  const panelOn = [], panelSick = [], panelDead = [], housings = [], flickers = [];

  function addPanel(x, y, z, kind, rotY = 0) {
    housings.push({ x, y: y + 0.045, z, r: rotY });
    if (kind === 'on') panelOn.push({ x, y, z, r: rotY });
    else if (kind === 'sick') panelSick.push({ x, y, z, r: rotY });
    else if (kind === 'dead') panelDead.push({ x, y, z, r: rotY });
    else {
      const m = (kind === 'strobe' ? mat.emissive(0xfff8e0, 5.0) : emitOn).clone();
      const g = new THREE.PlaneGeometry(1.18, 0.6);
      g.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.y = rotY;
      mesh.position.set(x, y, z);
      mesh.userData.collide = false;
      mesh.castShadow = false;
      LIVE.add(mesh);
      flickers.push({ m, base: m.emissiveIntensity, s: flickers.length * 1.618, mode: kind, light: null, baseI: 0 });
    }
  }

  function cellIndexFor(v, arr, n) {
    let lo = 0, hi = n - 1;
    if (v <= arr[0] || v >= arr[n]) return -1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid - 1; }
    return lo;
  }

  // (a) dedicated light lines down the long corridors — the "endless" money shot
  for (const j of LONG_ROWS) {
    const z = CZC(j), h = ZONES[1].h;
    for (let x = XS[13] + 3; x < XS[30] - 2; x += 6.4) {
      if (inWorldRect(RSHAFT, x, z)) continue;
      const roll = R.light();
      addPanel(x, h - 0.05, z, roll < 0.72 ? 'on' : roll < 0.84 ? 'sick' : roll < 0.94 ? 'dead' : 'flicker');
    }
  }

  // (b) general grid across the whole map
  for (let x = XS[0] + 6; x < XS[NX] - 4; x += 11.5) {
    for (let z = ZS[0] + 6; z < ZS[NZ] - 4; z += 11.0) {
      const jx = x + ctx.noise.fbm(x * 0.07, z * 0.07, 2) * 2.6;
      const jz = z + ctx.noise.fbm(x * 0.05 + 17, z * 0.05, 2) * 2.6;
      const i = cellIndexFor(jx, XS, NX), j = cellIndexFor(jz, ZS, NZ);
      if (i < 0 || j < 0) continue;
      if (isShaft(i, j)) continue;
      if (inWorldRect(RPAL, jx, jz)) continue;
      const h = CH[i * NZ + j];
      const zone = zoneAt(i, j);
      const roll = R.light();
      let kind = 'on';
      if (zone.id === 'collapsed') kind = roll < 0.30 ? 'on' : roll < 0.48 ? 'sick' : roll < 0.86 ? 'dead' : 'flicker';
      else if (zone.id === 'damp') kind = roll < 0.42 ? 'on' : roll < 0.62 ? 'sick' : roll < 0.9 ? 'dead' : 'flicker';
      else kind = roll < 0.66 ? 'on' : roll < 0.80 ? 'sick' : roll < 0.92 ? 'dead' : 'flicker';
      addPanel(jx, h - 0.05, jz, kind, R.light.chance(0.5) ? Math.PI / 2 : 0);
    }
  }

  // (c) extra lights in the hall and over the pit
  for (let x = RHALL.x0 + 7; x < RHALL.x1 - 5; x += 12.5) {
    for (let z = RHALL.z0 + 7; z < RHALL.z1 - 5; z += 12.0) {
      addPanel(x, hallZ.h - 0.06, z, R.light.chance(0.78) ? 'on' : 'sick');
    }
  }
  for (let x = RPIT.x0 + 6; x < RPIT.x1 - 3; x += 9.5) {
    for (let z = RPIT.z0 + 6; z < RPIT.z1 - 3; z += 9.5) {
      addPanel(x, ZONES[6].h - 0.06, z, R.light.chance(0.55) ? 'on' : 'dead');
    }
  }
  // the one strobing panel — in the damp zone, where it hurts most
  addPanel(CXC(6), ZONES[5].h - 0.05, CZC(22), 'strobe');

  // instanced fixtures
  {
    const housingGeo = new THREE.BoxGeometry(1.28, 0.09, 0.68);
    const panelGeo = new THREE.PlaneGeometry(1.18, 0.6);
    panelGeo.rotateX(Math.PI / 2);
    const mk = (list, material, geo, dy) => {
      if (!list.length) return;
      const inst = props.scatter(geo, material, list.length, (i, d) => {
        d.position.set(list[i].x, list[i].y + dy, list[i].z);
        d.rotation.y = list[i].r;
      }, 991);
      inst.castShadow = false;
      ctx.addDecor(inst);
    };
    mk(housings, M2.housing, housingGeo, 0);
    mk(panelOn, emitOn, panelGeo, 0);
    mk(panelSick, emitSickly, panelGeo, 0);
    mk(panelDead, M2.dead, panelGeo, 0);
  }

  // real point lights: at most 2 per zone, 11 total
  {
    const shuffled = panelOn.slice();
    R.light.shuffle(shuffled);
    const perZone = {};
    let placed = 0;
    // Budget: 11 here + 1 pendant + 1 shaft + 2 palindrome + 1 tally spot
    //         + 1 hall spot + 3 flicker = 20 real lights, 2 of them shadowed.
    for (const p of shuffled) {
      if (placed >= 11) break;
      const i = cellIndexFor(p.x, XS, NX), j = cellIndexFor(p.z, ZS, NZ);
      if (i < 0 || j < 0) continue;
      const zid = zoneAt(i, j).id;
      perZone[zid] = perZone[zid] || 0;
      if (perZone[zid] >= 2) continue;
      perZone[zid]++;
      placed++;
      const l = new THREE.PointLight(0xfff0c8, 11, 15, 1.75);
      l.position.set(p.x, p.y - 0.25, p.z);
      ctx.light(l);
    }
    // one shadow-casting spot in the hall to give the columns real shadows
    const hs = new THREE.SpotLight(0xfff4d0, 40, 30, Math.PI / 3.2, 0.6, 1.6);
    hs.position.set((RHALL.x0 + RHALL.x1) / 2 + 6, hallZ.h - 0.4, (RHALL.z0 + RHALL.z1) / 2 + 4);
    hs.target.position.set((RHALL.x0 + RHALL.x1) / 2 + 6, 0, (RHALL.z0 + RHALL.z1) / 2 + 4);
    ctx.light(hs, { shadow: true, far: 34 });
  }

  // give three of the flicker panels a matching real light
  {
    let n = 0;
    for (const f of flickers) {
      if (n >= 3) break;
      const mesh = LIVE.children.find(c => c.material === f.m);
      if (!mesh) continue;
      const l = new THREE.PointLight(0xfff0c8, 10, 13, 1.75);
      l.position.set(mesh.position.x, mesh.position.y - 0.25, mesh.position.z);
      ctx.light(l);
      f.light = l; f.baseI = 10;
      n++;
    }
  }

  // =========================================================================
  // 3.12 MOTION — flicker, strobe, dust
  // =========================================================================
  ctx.onUpdate((dt, t) => {
    for (const f of flickers) {
      let k;
      if (f.mode === 'strobe') {
        k = Math.sin(t * 19.0) > 0.15 ? 1 : 0.03;
      } else {
        const slow = ctx.noise.fbm(t * 1.9 + f.s * 13.7, f.s * 7.1, 3);
        const fast = ctx.noise.fbm(t * 13.0 + f.s * 3.3, 11.0, 2);
        k = slow > 0.05 ? 1 : (slow > -0.03 ? 0.16 : 0.85);
        if (fast > 0.32) k *= 0.22;
        if (fast < -0.42) k = Math.min(1.25, k * 1.2);
      }
      f.m.emissiveIntensity = f.base * k;
      if (f.light) f.light.intensity = f.baseI * k;
    }
  });

  // slow dust-mote fields
  {
    const moteGeo = props.billboardCross(0.035, 0.035);
    const moteMat = mat.emissive(0xfff3d2, 0.9, { transparent: true, opacity: 0.42 });
    const fields = [
      { c: [(RHALL.x0 + RHALL.x1) / 2, 2.4, (RHALL.z0 + RHALL.z1) / 2], r: 32, h: 4.6, n: 520 },
      { c: [0, 1.7, CZC(2)], r: 46, h: 2.8, n: 420 },
      { c: [CXC(SHAFT.x), 4.0, (RSHAFT.z0 + RSHAFT.z1) / 2], r: 2.4, h: 7.0, n: 180 },
    ];
    fields.forEach((F, fi) => {
      const inst = props.scatter(moteGeo, moteMat, F.n, (i, d, r) => {
        const a = r() * 6.283, rad = Math.sqrt(r()) * F.r;
        d.position.set(Math.cos(a) * rad, r.range(-F.h / 2, F.h / 2), Math.sin(a) * rad);
        d.scale.setScalar(r.range(0.6, 1.7));
      }, 3300 + fi);
      inst.castShadow = false;
      inst.receiveShadow = false;
      const holder = new THREE.Group();
      holder.position.set(F.c[0], F.c[1], F.c[2]);
      holder.add(inst);
      holder.userData.collide = false;
      LIVE.add(holder);
      ctx.onUpdate((dt, t) => {
        holder.rotation.y = t * (0.0035 + fi * 0.0011);
        holder.position.y = F.c[1] + Math.sin(t * 0.13 + fi) * 0.28;
      });
    });
  }

  // =========================================================================
  // 3.13 BAKE — freeze props, emit zone batches, build the collision proxy
  // =========================================================================
  for (const z of ZONES) ctx.addDecor(zoneBatch[z.id].build(false));
  const frozen = props.freeze(STATIC);
  frozen.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ctx.addDecor(frozen);
  props.NOCOLLIDE(LIVE);

  {
    const merged = props.mergeGeometries(collGeos);
    collGeos.forEach(g => g.dispose());
    const collider = new THREE.Mesh(merged, M2.invis);
    collider.visible = false;
    collider.castShadow = false;
    collider.receiveShadow = false;
    collider.userData.collide = true;
    ctx.add(collider);
  }

  // =========================================================================
  // 3.14 ATMOSPHERE
  // =========================================================================
  ctx.sky({ color: 0x8d8158 });
  ctx.fog(0x968a5c, 5, 56);
  ctx.useEnvironment(0.35);
  ctx.grade({
    exposure: 1.0,
    saturation: 0.80,
    contrast: 0.90,
    lift: [0.014, 0.011, -0.008],
    gain: [1.06, 1.02, 0.85],
    vignette: 1.38,
    grain: 0.085,
    aberration: 0.0012,
    scanline: 0.0,
    bloom: 0.74,
    bloomRadius: 0.88,
    bloomThreshold: 0.60,
  });
  ctx.soundscape('hum', 'dread', { size: 0.8, dark: 0.55, wet: 0.3 });
  ctx.setSurface((x, z) => {
    if (inWorldRect(RALC, x, z)) return 'water';
    if (inWorldRect(RPIT, x, z)) return 'concrete';
    return 'carpet';
  });

  // =========================================================================
  // 3.15 GAMEPLAY PLACEMENT
  // =========================================================================
  const degree = (i, j) => (
    (i > 0 && VW[vI(i, j)] ? 1 : 0) +
    (i < NX - 1 && VW[vI(i + 1, j)] ? 1 : 0) +
    (j > 0 && HW[hI(i, j)] ? 1 : 0) +
    (j < NZ - 1 && HW[hI(i, j + 1)] ? 1 : 0)
  );
  const deadEnds = [];
  const openCells = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (i === SPAWN_CELL.x && j === SPAWN_CELL.z) continue;
    const d = degree(i, j);
    if (d === 1) deadEnds.push([i, j]);
    if (d >= 1) openCells.push([i, j]);
  }
  R.place.shuffle(deadEnds);
  R.place.shuffle(openCells);

  const coinAt = (x, y, z) => ctx.pickup(x, y + 1.0, z, 'coin');
  let coins = 0;

  // 14 coins in dead ends
  for (let k = 0; k < 14 && k < deadEnds.length; k++) {
    const [i, j] = deadEnds[k];
    coinAt(CXC(i) + R.place.range(-1, 1), floorYAt(i, j), CZC(j) + R.place.range(-1, 1));
    coins++;
  }
  // 18 spread across every zone (at least 2 per zone)
  {
    const perZone = {};
    for (const [i, j] of openCells) {
      if (coins >= 32) break;
      const zid = zoneAt(i, j).id;
      perZone[zid] = perZone[zid] || 0;
      if (perZone[zid] >= 3) continue;
      perZone[zid]++;
      coinAt(CXC(i) + R.place.range(-1.4, 1.4), floorYAt(i, j), CZC(j) + R.place.range(-1.4, 1.4));
      coins++;
    }
    for (const [i, j] of openCells) {
      if (coins >= 32) break;
      coinAt(CXC(i), floorYAt(i, j), CZC(j));
      coins++;
    }
  }
  // 5 in the sub-level, 3 on the mezzanine — the reward for climbing/descending
  for (let k = 0; k < 5; k++)
    coinAt(RPIT.x0 + 4 + k * 4.6, PIT_Y, RPIT.z0 + 6 + ((k * 5) % 16)), coins++;
  for (let k = 0; k < 3; k++)
    coinAt(MEZ.x0 + 4 + k * 7.0, MEZ.y, (MEZ.z0 + MEZ.z1) / 2), coins++;
  // top up to exactly 40 in the pillar hall
  for (let k = coins; k < 40; k++)
    coinAt(RHALL.x0 + 8 + ((k * 11) % 50), 0, RHALL.z0 + 9 + ((k * 17) % 48));

  // batteries — one per major zone
  ctx.pickup(CXC(3), 1.0, CZC(6), 'battery');                       // warren
  ctx.pickup(CXC(24), 1.0, CZC(4), 'battery');                      // corridors
  ctx.pickup(CXC(6), 1.0, CZC(17), 'battery');                      // collapsed
  ctx.pickup(CXC(5), 1.0, CZC(28), 'battery');                      // damp
  ctx.pickup(RPIT.x1 - 3.0, PIT_Y + 1.0, RPIT.z1 - 3.0, 'battery'); // sub-level

  // powerups
  ctx.pickup(CXC(6), 1.0, CZC(14), 'powerup:nightvision');          // collapsed section
  ctx.pickup(MEZ.x0 + 2.2, MEZ.y + 1.2, MEZ.z0 + 1.6, 'powerup:ghost');
  ctx.pickup((RALC.x0 + RALC.x1) / 2, 1.0, (RALC.z0 + RALC.z1) / 2, 'powerup:silence');

  // THE PUP — under the high end of the sub-level stairs, approached from the side
  ctx.pickup(stairX, PIT_Y + 1.0, RPIT.z0 + 2.2, 'pup');

  // hiding spots
  const hide = (x, y, z, r, q) => ctx.hidingSpot(x, y, z, r, q);
  // cubicle warren
  for (let k = 0; k < 5; k++) {
    const p = randomCellIn(ZONES[0], R.place);
    hide(p.x, 0.9, p.z, 1.5, 0.9);
  }
  // behind crate / locker stacks
  for (let k = 0; k < Math.min(6, crateStacks.length); k++) {
    const c = crateStacks[(k * 3) % crateStacks.length];
    hide(c.x + 1.1, c.y + 0.9, c.z + 1.1, 1.3, 0.85);
  }
  // under the mezzanine
  hide(MEZ.x0 + 5.0, 0.9, (MEZ.z0 + MEZ.z1) / 2, 2.0, 1.0);
  hide(MEZ.x0 + 15.0, 0.9, (MEZ.z0 + MEZ.z1) / 2, 2.0, 1.0);
  hide(MEZ.x0 + 2.4, MEZ.y + 0.9, MEZ.z0 + 1.6, 1.5, 0.95);
  // flooded alcove
  hide(RALC.x0 + 1.8, 0.9, RALC.z1 - 1.8, 1.6, 1.0);
  hide(RALC.x1 - 1.8, 0.9, RALC.z0 + 1.8, 1.6, 0.9);
  // sub-level
  hide(RPIT.x0 + 5.0, PIT_Y + 0.9, RPIT.z1 - 4.0, 1.8, 1.0);
  hide(stairX + 2.0, PIT_Y + 0.9, RPIT.z0 + 3.0, 1.7, 1.0);
  hide(RPIT.x1 - 3.4, PIT_Y + 0.9, RPIT.z0 + 2.2, 1.5, 0.95);
  // shaft + tally room + dead ends
  hide(CXC(SHAFT.x), 0.9, (RSHAFT.z0 + RSHAFT.z1) / 2 - 1.5, 1.4, 0.8);
  hide(tallyCentre.x + 2.4, 0.9, tallyCentre.z + 2.4, 1.4, 0.7);
  for (let k = 14; k < 19 && k < deadEnds.length; k++) {
    const [i, j] = deadEnds[k];
    hide(CXC(i), floorYAt(i, j) + 0.9, CZC(j), 1.5, 0.85);
  }
  // collapsed rubble
  hide(CXC(5), 0.9, CZC(15), 1.6, 0.8);

  // ===========================================================================
  // AUTHORED PROPS — deliberately almost nothing.
  //
  // Emptiness IS the Backrooms. A handful of objects that have no business
  // being here reads as far more wrong than a room full of clutter, so this is
  // a dozen items across 200 m and no more.
  // ===========================================================================
  const B = 92;
  await ctx.kits.scatterKit(ctx, {
    kit: 'CONTAINERS', count: 9, seed: 'br-boxes',
    area: (r) => ({ x: r.range(-B, B), y: 0, z: r.range(-B, B) }),
  });
  await ctx.kits.scatterKit(ctx, {
    kit: 'CLUTTER', count: 14, seed: 'br-clutter', hide: false, collide: false,
    area: (r) => ({ x: r.range(-B, B), y: 0, z: r.range(-B, B) }),
  });

}
