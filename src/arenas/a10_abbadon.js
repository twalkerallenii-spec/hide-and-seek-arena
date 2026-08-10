// =============================================================================
// ABBADON MANOR — a Victorian gothic pile on a moonlit night, its overgrown
// formal gardens, a family graveyard, and a hedge maze you can get lost in.
//
// Named for DANIEL ABBADON, whose portrait hangs in the entrance hall and whose
// headstone leans in the chapel yard.
//
// Structure of this file:
//   1.  meta
//   2.  layout constants
//   3.  local builders (banks, proxies, walls, slabs, stairs, windows, dressing)
//   4.  build()
//         A. atmosphere            F. manor shell + windows
//         B. lights                G. cellar
//         C. ground + perimeter    H. ground floor
//         D. gardens               I. first floor
//         E. hedge maze            J. attic + servants' warren
//                                  K. roof
//                                  L. detail pass (candles, webs, portraits)
//                                  M. gameplay placement
//                                  N. motion
// =============================================================================

import * as THREE from 'three';

// -----------------------------------------------------------------------------
// 1. meta
// -----------------------------------------------------------------------------

export const meta = {
  id: 'abbadon',
  name: 'ABBADON MANOR',
  tagline: 'Forty rooms, one hedge maze, and nobody left to answer the bell.',
  order: 10,
  difficulty: 3,
  biome: 'indoor',
  seed: 18871031,
  spawn: [0, 0.05, -2],         // gravel forecourt, fountain and front door due north
  bounds: 100,
  colors: ['#1f3a2c', '#4a121a'],
  music: 'dread',
};

// -----------------------------------------------------------------------------
// 2. Layout constants — every magic number in the arena lives here.
// -----------------------------------------------------------------------------

// Manor block footprint (outer face of the stone).
const MX0 = -35, MX1 = 35, MZ0 = -68, MZ1 = -23;
const WT = 1.0;                     // exterior wall thickness
const IT = 0.35;                    // interior partition thickness

// Storey heights.
const Y_CELLAR = -4.6;
const Y_G = 0.0;
const Y_1 = 4.6;
const Y_A = 9.2;
const Y_EAVE = 10.8;               // parapet deck / leaded valley level
const Y_PARAPET = 12.1;
const Y_RIDGE = 17.8;              // widow's walk deck sits on the flat ridge

const CEIL_G = 4.35;               // ground-floor ceiling soffit
const CEIL_1 = 8.95;

// Interior grid lines.
const HALL_X0 = -12, HALL_X1 = 12; // entrance hall / landing void band
const BAND_FRONT_Z = -47;          // front band ends here
const BAND_CORR_Z = -50;           // service corridor is z -47..-50
const SHAFT_W_X = -27;             // west service shaft is x -35..-27
const SHAFT_E_X = 27;              // east service shaft is x  27..35

// Cellar vault extents.
const CX0 = -33, CX1 = 33, CZ0 = -64, CZ1 = -27;

// Hedge maze.
const MAZE_N = 20, MAZE_CELL = 3.0, MAZE_X0 = 12, MAZE_Z0 = 12;
const HEDGE_H = 2.6, HEDGE_T = 0.95;

// Gardens.
const LAKE_X = -56, LAKE_Z = 56, LAKE_R = 17;
const CHAPEL_X = -60, CHAPEL_Z = -40;
const KG_X0 = 44, KG_X1 = 82, KG_Z0 = -62, KG_Z1 = -24;   // walled kitchen garden
const CONS_X0 = 35, CONS_X1 = 50, CONS_Z0 = -54, CONS_Z1 = -38; // conservatory wing
const WALL_X = 92, WALL_Z = 84;    // perimeter estate wall

// Shared unit geometry for invisible collision proxies.
const UNIT = new THREE.BoxGeometry(1, 1, 1);
let PXM = null;                    // proxy material, set at build time

// -----------------------------------------------------------------------------
// 3. Local builders
// -----------------------------------------------------------------------------

/** A "bank" pairs a visual group (frozen at the end) with an invisible
 *  collision group. Detail geometry goes in .vis only and costs nothing. */
function newBank() { return { vis: new THREE.Group(), col: new THREE.Group() }; }

/** Invisible collision box. x/y/z are the CENTRE. */
function px(bank, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(UNIT, PXM);
  m.scale.set(Math.max(0.02, w), Math.max(0.02, h), Math.max(0.02, d));
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  m.visible = false;
  m.castShadow = false; m.receiveShadow = false;
  m.userData.collide = true;
  bank.col.add(m);
  return m;
}

/** Visible box, origin at centre, into the freeze bank. */
function vbox(bank, w, h, d, x, y, z, mat, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  m.userData.collide = false;
  bank.vis.add(m);
  return m;
}

/** Solid visible box that also gets a collision proxy. */
function sbox(bank, w, h, d, x, y, z, mat, ry = 0) {
  vbox(bank, w, h, d, x, y, z, mat, ry);
  px(bank, w, h, d, x, y, z, ry);
}

/**
 * A wall from (ax,az) to (bx,bz) with rectangular openings punched in it.
 * openings: [{ c, w, y0, y1 }] where c is metres along the run from A.
 */
function wallRun(bank, ax, az, bx, bz, yBase, h, t, mat, openings = [], solid = true) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const ux = dx / len, uz = dz / len;
  const ry = -Math.atan2(dz, dx);
  const emit = (l0, l1, yLo, yHi) => {
    const L = l1 - l0, H = yHi - yLo;
    if (L < 0.02 || H < 0.02) return;
    const cx = ax + ux * (l0 + l1) / 2, cz = az + uz * (l0 + l1) / 2;
    const cy = (yLo + yHi) / 2;
    if (solid) sbox(bank, L, H, t, cx, cy, cz, mat, ry);
    else vbox(bank, L, H, t, cx, cy, cz, mat, ry);
  };
  const ops = openings.slice().sort((p, q) => p.c - q.c);
  let cursor = 0;
  for (const o of ops) {
    const lo = Math.max(0, o.c - o.w / 2), hi = Math.min(len, o.c + o.w / 2);
    if (hi <= cursor) continue;
    if (lo > cursor) emit(cursor, lo, yBase, yBase + h);
    const y0 = yBase + (o.y0 ?? 0), y1 = yBase + (o.y1 ?? h);
    if (y0 > yBase) emit(lo, hi, yBase, y0);
    if (y1 < yBase + h) emit(lo, hi, y1, yBase + h);
    cursor = hi;
  }
  if (cursor < len) emit(cursor, len, yBase, yBase + h);
}

/** Horizontal slab whose walking surface is at yTop. */
function slab(bank, x0, x1, z0, z1, yTop, mat, thick = 0.4, collide = true) {
  const w = x1 - x0, d = z1 - z0;
  if (w <= 0 || d <= 0) return;
  const y = yTop - thick / 2;
  vbox(bank, w, thick, d, (x0 + x1) / 2, y, (z0 + z1) / 2, mat);
  if (collide) px(bank, w, thick, d, (x0 + x1) / 2, y, (z0 + z1) / 2);
}

/** Sloped collision plate between two points in the ZY plane. */
function rampZ(bank, x0, x1, z0, z1, y0, y1, thick = 0.7) {
  const dz = z1 - z0, dy = y1 - y0;
  const len = Math.hypot(dz, dy);
  const a = Math.atan2(-dy, dz);
  const mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
  const m = new THREE.Mesh(UNIT, PXM);
  m.scale.set(x1 - x0, thick, len);
  m.position.set((x0 + x1) / 2, my - (thick / 2) * Math.cos(a), mz - (thick / 2) * Math.sin(a));
  m.rotation.x = a;
  m.visible = false; m.userData.collide = true;
  bank.col.add(m);
}

/** Sloped collision plate in the XY plane. */
function rampX(bank, x0, x1, z0, z1, y0, y1, thick = 0.7) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const c = Math.atan2(dy, dx);
  const m = new THREE.Mesh(UNIT, PXM);
  m.scale.set(len, thick, z1 - z0);
  m.position.set((x0 + x1) / 2 + (thick / 2) * Math.sin(c),
    (y0 + y1) / 2 - (thick / 2) * Math.cos(c), (z0 + z1) / 2);
  m.rotation.z = c;
  m.visible = false; m.userData.collide = true;
  bank.col.add(m);
}

/** Visible treads + a single collision ramp. Runs along Z. */
function stairZ(bank, x0, x1, z0, z1, y0, y1, mat, steps = 0) {
  const n = steps || Math.max(4, Math.round(Math.abs(y1 - y0) / 0.19));
  const dz = (z1 - z0) / n, dy = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const zc = z0 + dz * (i + 0.5), yc = y0 + dy * (i + 1);
    vbox(bank, x1 - x0, 0.07, Math.abs(dz) + 0.06, (x0 + x1) / 2, yc - 0.035, zc, mat);
    vbox(bank, x1 - x0, Math.abs(dy), 0.05, (x0 + x1) / 2, yc - Math.abs(dy) / 2,
      zc + (dz > 0 ? -Math.abs(dz) / 2 : Math.abs(dz) / 2), mat);
  }
  rampZ(bank, x0, x1, z0, z1, y0, y1);
}

/** Visible treads + a single collision ramp. Runs along X. */
function stairX(bank, x0, x1, z0, z1, y0, y1, mat, steps = 0) {
  const n = steps || Math.max(4, Math.round(Math.abs(y1 - y0) / 0.19));
  const dx = (x1 - x0) / n, dy = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const xc = x0 + dx * (i + 0.5), yc = y0 + dy * (i + 1);
    vbox(bank, Math.abs(dx) + 0.06, 0.07, z1 - z0, xc, yc - 0.035, (z0 + z1) / 2, mat);
    vbox(bank, 0.05, Math.abs(dy), z1 - z0, xc + (dx > 0 ? -Math.abs(dx) / 2 : Math.abs(dx) / 2),
      yc - Math.abs(dy) / 2, (z0 + z1) / 2, mat);
  }
  rampX(bank, x0, x1, z0, z1, y0, y1);
}

/**
 * Tall gothic window joinery dropped into a wall opening. The mullions and
 * transoms are real geometry and they cast the shadow pattern that is this
 * arena's signature, so they live in the shadow-casting bank.
 */
function gothicWindow(bank, glassBank, x, z, ry, w, h, sill, frameMat, glassMat, lights = 2) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const gg = new THREE.Group();
  gg.position.set(x, 0, z);
  gg.rotation.y = ry;
  const add = (grp, W, H, D, px_, py, pz, m, cast) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), m);
    b.position.set(px_, py, pz);
    b.castShadow = !!cast; b.receiveShadow = true; b.userData.collide = false;
    grp.add(b);
  };
  // outer frame
  add(g, w + 0.16, 0.14, 0.22, 0, sill - 0.05, 0, frameMat, true);
  add(g, w + 0.16, 0.14, 0.22, 0, sill + h + 0.05, 0, frameMat, true);
  add(g, 0.13, h, 0.22, -w / 2 - 0.05, sill + h / 2, 0, frameMat, true);
  add(g, 0.13, h, 0.22, w / 2 + 0.05, sill + h / 2, 0, frameMat, true);
  // mullions
  for (let i = 1; i < lights; i++) {
    const mx = -w / 2 + (w * i) / lights;
    add(g, 0.085, h, 0.19, mx, sill + h / 2, 0, frameMat, true);
  }
  // transoms
  add(g, w, 0.075, 0.17, 0, sill + h * 0.62, 0, frameMat, true);
  add(g, w, 0.06, 0.15, 0, sill + h * 0.31, 0, frameMat, true);
  // leaded glazing bars — fine grid, the thing that dapples the floor
  const cols = lights * 2, rows = Math.max(4, Math.round(h / 0.46));
  for (let i = 1; i < cols; i++)
    add(g, 0.028, h - 0.05, 0.05, -w / 2 + (w * i) / cols, sill + h / 2, 0.02, frameMat, true);
  for (let j = 1; j < rows; j++)
    add(g, w - 0.05, 0.026, 0.05, 0, sill + (h * j) / rows, 0.02, frameMat, true);
  // pane (no shadow — light must pass)
  add(gg, w - 0.02, h - 0.02, 0.02, 0, sill + h / 2, 0, glassMat, false);
  bank.vis.add(g);
  glassBank.vis.add(gg);
}

/** A lumpy white cloth thrown over a piece of furniture. */
function dustSheet(bank, w, h, d, x, y, z, mat, rnd) {
  const g = new THREE.BoxGeometry(w, h, d, 4, 3, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vy = p.getY(i);
    const s = 1 + (vy > 0 ? 0.06 : 0.14);
    p.setXYZ(i,
      p.getX(i) * s + rnd.range(-0.05, 0.05),
      vy + (vy > 0 ? rnd.range(-0.05, 0.09) : rnd.range(-0.03, 0.02)),
      p.getZ(i) * s + rnd.range(-0.05, 0.05));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = rnd.range(-0.1, 0.1);
  m.castShadow = true; m.receiveShadow = true; m.userData.collide = false;
  bank.vis.add(m);
  px(bank, w * 0.94, h, d * 0.94, x, y + h / 2, z);
}

/** Raised-and-fielded panelling on a wall face. Pure decoration. */
function panelling(bank, x0, x1, z0, z1, yBase, h, mat, trimMat, faceSign) {
  const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(1, Math.round(len / 1.1));
  const pw = len / n;
  const ry = horiz ? 0 : Math.PI / 2;
  const nx = horiz ? 0 : faceSign * 0.03, nz = horiz ? faceSign * 0.03 : 0;
  const base = horiz ? Math.min(x0, x1) : Math.min(z0, z1);
  const other = horiz ? (z0 + z1) / 2 : (x0 + x1) / 2;
  for (let i = 0; i < n; i++) {
    const c = base + pw * (i + 0.5);
    const cx = horiz ? c : other, cz = horiz ? other : c;
    // stile / rail surround then the fielded centre, three nested boxes deep
    vbox(bank, pw - 0.04, h, 0.05, cx + nx, yBase + h / 2, cz + nz, mat, ry);
    vbox(bank, pw - 0.30, h - 0.34, 0.09, cx + nx * 2, yBase + h / 2, cz + nz * 2, mat, ry);
    vbox(bank, pw - 0.44, h - 0.50, 0.12, cx + nx * 3, yBase + h / 2, cz + nz * 3, mat, ry);
  }
  // dado rail, skirting, cornice
  const railY = [yBase + 0.09, yBase + h - 0.07];
  for (const ry2 of railY) {
    if (horiz) vbox(bank, len, 0.16, 0.14, (x0 + x1) / 2, ry2, other + faceSign * 0.07, trimMat);
    else vbox(bank, 0.14, 0.16, len, other + faceSign * 0.07, ry2, (z0 + z1) / 2, trimMat);
  }
}

/** Skirting + dado + cornice for a papered room, cheap and eye-level. */
function roomTrim(bank, x0, x1, z0, z1, yBase, h, trimMat) {
  const runs = [
    [x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1],
  ];
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = -Math.atan2(bz - az, bx - ax);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const inward = 0.09;
    const ox = (cx === x0 ? inward : cx === x1 ? -inward : 0);
    const oz = (cz === z0 ? inward : cz === z1 ? -inward : 0);
    vbox(bank, len, 0.22, 0.09, cx + ox, yBase + 0.11, cz + oz, trimMat, ry);     // skirting
    vbox(bank, len, 0.10, 0.07, cx + ox, yBase + 1.02, cz + oz, trimMat, ry);     // dado rail
    vbox(bank, len, 0.26, 0.20, cx + ox, yBase + h - 0.13, cz + oz, trimMat, ry); // cornice
  }
}

/** One of the fourteen portraits. Returns { frameAdded, canvasMesh }. */
function portraitCanvas(ctx, seed, label) {
  const R = ctx.rng.fork('portrait' + seed);
  return ctx.mat.painted(220, 300, (c, W, H) => {
    // gloomy varnished ground
    const g = c.createRadialGradient(W * 0.5, H * 0.35, 10, W * 0.5, H * 0.5, H * 0.8);
    g.addColorStop(0, `rgb(${38 + R.int(0, 24)},${30 + R.int(0, 18)},${22 + R.int(0, 14)})`);
    g.addColorStop(1, 'rgb(9,8,7)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // shoulders
    c.fillStyle = `rgb(${16 + R.int(0, 18)},${13 + R.int(0, 14)},${14 + R.int(0, 16)})`;
    c.beginPath();
    c.moveTo(W * 0.14, H);
    c.quadraticCurveTo(W * 0.5, H * 0.52, W * 0.86, H);
    c.closePath(); c.fill();
    // collar
    c.fillStyle = 'rgba(226,222,208,0.85)';
    c.beginPath();
    c.moveTo(W * 0.38, H * 0.72); c.lineTo(W * 0.5, H * 0.86); c.lineTo(W * 0.62, H * 0.72);
    c.lineTo(W * 0.5, H * 0.68); c.closePath(); c.fill();
    // face
    const fy = H * 0.42, fr = H * 0.15;
    const fg = c.createRadialGradient(W * 0.47, fy - fr * 0.3, 2, W * 0.5, fy, fr * 1.5);
    fg.addColorStop(0, `rgb(${214 + R.int(0, 30)},${200 + R.int(0, 24)},${186 + R.int(0, 22)})`);
    fg.addColorStop(1, 'rgb(72,58,52)');
    c.fillStyle = fg;
    c.beginPath(); c.ellipse(W * 0.5, fy, fr * 0.78, fr, 0, 0, 7); c.fill();
    // hair / bonnet
    c.fillStyle = `rgb(${20 + R.int(0, 26)},${17 + R.int(0, 20)},${15 + R.int(0, 16)})`;
    c.beginPath(); c.ellipse(W * 0.5, fy - fr * 0.45, fr * 0.95, fr * 0.78, 0, Math.PI, 0); c.fill();
    if (R.chance(0.4)) { // sideburns / beard
      c.beginPath(); c.ellipse(W * 0.5, fy + fr * 0.62, fr * 0.6, fr * 0.42, 0, 0, Math.PI); c.fill();
    }
    // eyes — flat, dark, following you
    c.fillStyle = 'rgb(14,12,12)';
    for (const ex of [0.44, 0.56]) {
      c.beginPath(); c.ellipse(W * ex, fy - fr * 0.08, fr * 0.11, fr * 0.075, 0, 0, 7); c.fill();
    }
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(W * 0.46, fy + fr * 0.42); c.lineTo(W * 0.54, fy + fr * 0.42); c.stroke();
    // craquelure
    c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      let px_ = R.range(0, W), py = R.range(0, H);
      c.moveTo(px_, py);
      for (let k = 0; k < 3; k++) { px_ += R.range(-16, 16); py += R.range(-16, 16); c.lineTo(px_, py); }
      c.stroke();
    }
    // varnish darkening at the edges
    const v = c.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(20,14,6,0.45)');
    v.addColorStop(0.5, 'rgba(20,14,6,0.0)');
    v.addColorStop(1, 'rgba(10,8,4,0.55)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    if (label) {
      c.fillStyle = 'rgba(206,178,104,0.92)';
      c.font = 'bold 15px Georgia, serif';
      c.textAlign = 'center';
      c.fillText(label, W / 2, H - 12);
    }
  }, { transparent: false, roughness: 0.72, side: THREE.FrontSide });
}

// =============================================================================
// 4. build
// =============================================================================

export async function build(ctx) {
  const { props, mat, rng } = ctx;
  PXM = mat.solid({ color: 0x0a0a0c });

  // ---- material palette (23 surface() calls, everything else is solid) ------
  const M = {
    marbleL: mat.surface('marble', { color: 0xe4e0d6, vein: 0x9c9488, repeat: 1, size: 256 }),
    marbleD: mat.surface('marble', { color: 0x201e28, vein: 0x4a4658, repeat: 1, size: 256 }),
    oak: mat.surface('wood', { color: 0x4c3420, repeat: 16, planks: 9, size: 256 }),
    atticBoard: mat.surface('wood', { color: 0x6a5638, repeat: 22, planks: 12, size: 128 }),
    flag: mat.surface('tile', { color: 0x4b4741, grout: 0x24211e, tiles: 5, rough: 0.85, repeat: 12, size: 256 }),
    carpetRed: mat.surface('carpet', { color: 0x5c1f26, repeat: 8, size: 128 }),
    paperGreen: mat.surface('wallpaper', { color: 0x1d3126, motif: 0x8e7c46, rep: 5, repeat: 5, size: 256 }),
    paperOx: mat.surface('wallpaper', { color: 0x3d1418, motif: 0x7d5f36, rep: 6, repeat: 5, size: 256 }),
    paperBlue: mat.surface('wallpaper', { color: 0x25313d, motif: 0x6d7a86, rep: 4, repeat: 5, size: 256 }),
    walnut: mat.surface('wood', { color: 0x2e1d13, repeat: 3, planks: 4, size: 256 }),
    plaster: mat.surface('plaster', { color: 0xc4b9a3, repeat: 5, size: 256 }),
    brickCellar: mat.surface('brick', { color: 0x5c3a2c, mortar: 0x6d665c, rows: 9, repeat: 7, size: 256 }),
    ashlar: mat.surface('rock', { color: 0x565258, repeat: 12, size: 256 }),
    stoneTrim: mat.surface('rock', { color: 0x6e6a70, repeat: 2, size: 128 }),
    grass: mat.surface('grass', { color: 0x2b3c21, dry: 0x4c4829, repeat: 90, size: 128 }),
    gravel: mat.surface('dirt', { color: 0x6f665a, repeat: 55, size: 128 }),
    soil: mat.surface('dirt', { color: 0x372a1c, repeat: 26, size: 128 }),
    slate: mat.surface('tile', { color: 0x323942, grout: 0x1b1f25, tiles: 14, rough: 0.6, repeat: 9, size: 128 }),
    // same texture set as brickCellar (only `side` differs) so it comes free from the cache
    brickVault: mat.surface('brick', { color: 0x5c3a2c, mortar: 0x6d665c, rows: 9, repeat: 7, size: 256, side: THREE.DoubleSide }),
    brickGarden: mat.surface('brick', { color: 0x6a3b2a, mortar: 0x7a736a, rows: 12, repeat: 16, size: 128 }),
    sheet: mat.surface('fabric', { color: 0xcbc5b7, repeat: 2, size: 128 }),
    curtain: mat.surface('fabric', { color: 0x46141e, repeat: 2, size: 128 }),
    lead: mat.surface('metalPanel', { color: 0x50575e, panels: 3, rough: 0.55, repeat: 6, size: 128 }),
    // untextured / special
    trim: mat.solid({ color: 0x21150d, roughness: 0.55 }),
    gold: mat.solid({ color: 0xa5854a, roughness: 0.34, metalness: 0.85 }),
    iron: mat.metal(0x2b2d31, 0.62),
    brass: mat.metal(0xa08046, 0.3),
    darkWood: mat.solid({ color: 0x25180f, roughness: 0.72 }),
    glass: mat.glassCheap({ color: 0x8fa8d8, opacity: 0.15 }),
    glassDirty: mat.glassCheap({ color: 0x6f8a70, opacity: 0.26 }),
    leaf: mat.solid({ color: 0x1a2a16, roughness: 0.96, flat: true }),
    leafDead: mat.solid({ color: 0x39301c, roughness: 0.97, flat: true }),
    bark: mat.solid({ color: 0x2a2018, roughness: 0.95, flat: true }),
    stoneProp: mat.solid({ color: 0x5b5860, roughness: 0.9, flat: true }),
    candleWax: mat.solid({ color: 0xe8dcc0, roughness: 0.55 }),
    flame: mat.emissive(0xffb45a, 6.5, { transparent: true, opacity: 0.92 }),
    ember: mat.emissive(0xff6a22, 4.0),
    lampGlow: mat.emissive(0xffc27a, 3.2),
    water: mat.water({ color: 0x121e26, opacity: 0.86, repeat: 10 }),
  };

  // Cobweb / mist / dust alphas -------------------------------------------------
  const webMat = mat.painted(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(214,214,206,0.55)';
    for (let i = 0; i < 14; i++) {
      c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(0, 0);
      c.lineTo(W * (i / 13), H); c.stroke();
    }
    for (let r = 12; r < W * 1.4; r += 13) {
      c.beginPath();
      for (let a = 0; a <= 1.58; a += 0.1) {
        const rr = r * (1 + Math.sin(a * 6) * 0.05);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        a === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
  }, { transparent: true, alphaTest: 0.06, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });

  const mistMat = mat.painted(128, 128, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(168,186,208,0.30)');
    g.addColorStop(0.55, 'rgba(150,168,192,0.14)');
    g.addColorStop(1, 'rgba(140,160,190,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, { transparent: true, alphaTest: 0.001, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
  mistMat.opacity = 0.85;

  const shaftMat = mat.emissive(0x9fb8e4, 0.55, { transparent: true, opacity: 0.055 });
  shaftMat.depthWrite = false;

  const grassBlade = mat.painted(48, 48, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      const x = 3 + i * 3.2;
      c.strokeStyle = `rgba(${44 + i * 3},${76 + i * 4},${34 + i * 2},0.95)`;
      c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(x, H); c.quadraticCurveTo(x + 3, H * 0.5, x + 7, H * 0.12); c.stroke();
    }
  }, { transparent: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1 });

  /** Park a prop-library object into a freeze bank and give it a box proxy. */
  function stow(bank, obj, x, y, z, ry, cw, ch, cd) {
    obj.position.set(x, y, z);
    if (ry) obj.rotation.y = ry;
    obj.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.collide = false; }
    });
    bank.vis.add(obj);
    if (cw) px(bank, cw, ch, cd, x, y + ch / 2, z, ry || 0);
    return obj;
  }

  // ---------------------------------------------------------------------------
  // A. Atmosphere
  // ---------------------------------------------------------------------------
  ctx.sky({ top: 0x070c18, bottom: 0x18202e, radius: 470 });
  ctx.fog(0x141a24, 15, 120);
  ctx.useEnvironment(0.35);
  ctx.grade({
    saturation: 0.95, exposure: 1.0, contrast: 1.12,
    lift: [-0.008, 0.0, 0.02], gain: [1.05, 1.0, 0.94],
    bloom: 0.45, bloomRadius: 0.85, bloomThreshold: 0.72,
    vignette: 1.15, grain: 0.045, aberration: 0.0018, scanline: 0,
  });
  ctx.soundscape('wind', 'dread', { size: 0.8, dark: 0.5, wet: 0.3 });

  const insideManor = (x, z) => x > MX0 - 1 && x < MX1 + 1 && z > MZ0 - 1 && z < MZ1 + 1;
  ctx.setSurface((x, z) => {
    if (insideManor(x, z)) return 'wood';
    if (x > CONS_X0 && x < CONS_X1 && z > CONS_Z0 && z < CONS_Z1) return 'tile';
    if (Math.abs(x) < 32 && z > MZ1 - 1 && z < 8) return 'gravel';
    if (Math.hypot(x - LAKE_X, z - LAKE_Z) < LAKE_R + 1) return 'water';
    if (x > KG_X0 && x < KG_X1 && z > KG_Z0 && z < KG_Z1) return 'dirt';
    return 'grass';
  });

  // ---------------------------------------------------------------------------
  // B. Lights — 1 directional (shadowed), 2 shadowed points, 16 unshadowed
  // ---------------------------------------------------------------------------
  ctx.light(new THREE.HemisphereLight(0x2c3c58, 0x0b0d10, 0.30));
  ctx.light(new THREE.AmbientLight(0x1b2230, 0.55));

  const moon = new THREE.DirectionalLight(0x8fa8d8, 0.9);
  moon.position.set(58, 62, 2);
  moon.target.position.set(0, 5, -45);
  ctx.light(moon, { shadow: true, range: 60, far: 260, normalBias: 0.05 });

  // visible moon disc
  const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 12),
    mat.emissive(0xdce7ff, 2.6));
  moonDisc.position.set(250, 190, 40);
  moonDisc.userData.collide = false;
  ctx.addDecor(moonDisc);

  const warmPoints = [];
  const pt = (x, y, z, colour, inten, dist, shadow) => {
    const l = new THREE.PointLight(colour, inten, dist, 1.8);
    l.position.set(x, y, z);
    ctx.light(l, shadow ? { shadow: true, far: dist } : {});
    warmPoints.push({ l, base: inten, ph: rng.range(0, 6.28), sp: rng.range(1.4, 3.6) });
    return l;
  };
  pt(0, 6.4, -33, 0xffb46a, 16, 26, true);      // hall chandelier  (shadowed)
  pt(-20, 6.9, -60, 0xffc98e, 7, 15, true);     // nursery          (shadowed)
  pt(-11.2, 1.1, -30, 0xff6f28, 9, 12);         // hall fireplace
  pt(-24, 3.0, -34, 0xffb066, 8, 16);           // library
  pt(-19, 2.9, -58, 0xffab5e, 8, 16);           // dining room
  pt(24, 2.9, -34, 0xffb877, 7, 15);            // drawing room
  pt(0, 3.1, -58, 0xffa95c, 7, 16);             // long gallery
  pt(0, 2.9, -48.5, 0xffa24e, 6, 18);           // service corridor
  pt(30.5, 6.2, -55, 0xff9c46, 5, 12);          // back stairs (candles do the rest)
  pt(-18, -3.0, -40, 0xff8c3a, 6, 14);          // cellar wine vault
  pt(22, -3.1, -46, 0xff5f22, 7, 13);           // cellar boiler
  pt(25, 6.9, -41, 0xffbe86, 6, 14);            // master bedroom
  pt(0, 11.2, -45, 0xffb877, 5, 16);            // attic
  pt(CHAPEL_X, 3.0, CHAPEL_Z, 0xffc07a, 6, 16); // chapel
  pt(0, 3.2, -10, 0xffcf96, 5, 14);             // forecourt lantern
  pt(42, 2.6, 42, 0xffb768, 6, 15);             // maze folly

  // ---------------------------------------------------------------------------
  // C. Ground plane, estate perimeter, woods
  // ---------------------------------------------------------------------------
  const groundMesh = props.ground(230, 210, M.grass, { segs: 1 });
  groundMesh.position.set(0, -0.02, 0);
  groundMesh.receiveShadow = true;
  ctx.addDecor(groundMesh);       // visual only — collision comes from proxies

  const ext = newBank();          // gardens + everything outdoors at ground level
  const glassB = newBank();       // all transparent glazing (no shadow casting)

  // Ground collision in four plates, leaving a hole for the coal chute so the
  // player can actually slide down it into the cellar.
  px(ext, 230, 1.0, 43.5, 0, -0.52, -83.25);
  px(ext, 230, 1.0, 159.5, 0, -0.52, 25.25);
  px(ext, 148, 1.0, 7.0, -41, -0.52, -58);
  px(ext, 73.5, 1.0, 7.0, 78.25, -0.52, -58);

  // Estate wall — sealed box, 4 m of rubble stone with a coping.
  for (const [ax, az, bx, bz] of [
    [-WALL_X, -WALL_Z, WALL_X, -WALL_Z],
    [-WALL_X, WALL_Z, WALL_X, WALL_Z],
    [-WALL_X, -WALL_Z, -WALL_X, WALL_Z],
    [WALL_X, -WALL_Z, WALL_X, WALL_Z],
  ]) {
    wallRun(ext, ax, az, bx, bz, 0, 4.0, 0.9, M.ashlar, []);
    const len = Math.hypot(bx - ax, bz - az);
    const ry = -Math.atan2(bz - az, bx - ax);
    vbox(ext, len, 0.22, 1.2, (ax + bx) / 2, 4.1, (az + bz) / 2, M.stoneTrim, ry);
  }
  // gate piers on the south drive
  for (const sx of [-4.5, 4.5]) {
    sbox(ext, 1.6, 5.2, 1.6, sx, 2.6, WALL_Z, M.stoneTrim);
    vbox(ext, 1.9, 0.4, 1.9, sx, 5.4, WALL_Z, M.stoneTrim);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), M.stoneProp);
    ball.position.set(sx, 5.95, WALL_Z); ball.castShadow = true; ball.userData.collide = false;
    ext.vis.add(ball);
  }

  // Woods — two instanced meshes for ~210 trees fill the estate margins.
  {
    const R = rng.fork('woods');
    const spots = [];
    for (let i = 0; i < 900 && spots.length < 210; i++) {
      const x = R.range(-WALL_X + 3, WALL_X - 3), z = R.range(-WALL_Z + 3, WALL_Z - 3);
      const edge = Math.min(WALL_X - Math.abs(x), WALL_Z - Math.abs(z));
      if (edge > 26) continue;                                  // only the margins
      if (insideManor(x, z)) continue;
      if (Math.hypot(x - LAKE_X, z - LAKE_Z) < LAKE_R + 6) continue;
      if (x > MAZE_X0 - 6 && x < MAZE_X0 + 66 && z > MAZE_Z0 - 6 && z < MAZE_Z0 + 66) continue;
      if (x > KG_X0 - 4 && x < KG_X1 + 4 && z > KG_Z0 - 4 && z < KG_Z1 + 4) continue;
      if (Math.abs(x) < 34 && z > -24 && z < 10) continue;
      spots.push([x, z, R.range(7, 15), R.range(0, 6.3)]);
    }
    const trunkG = new THREE.CylinderGeometry(0.16, 0.34, 1, 6);
    trunkG.translate(0, 0.5, 0);
    ctx.addDecor(props.scatter(trunkG, M.bark, spots.length, (i, d) => {
      const s = spots[i];
      d.position.set(s[0], 0, s[1]);
      d.scale.set(1, s[2] * 0.55, 1);
      d.rotation.y = s[3];
    }, 91));
    const canopyG = new THREE.IcosahedronGeometry(1, 1);
    ctx.addDecor(props.scatter(canopyG, M.leaf, spots.length * 3, (i, d, r) => {
      const s = spots[(i / 3) | 0];
      const h = s[2];
      d.position.set(s[0] + r.gauss(0, h * 0.1), h * 0.55 + r.range(0, h * 0.35), s[1] + r.gauss(0, h * 0.1));
      d.scale.setScalar(h * r.range(0.16, 0.26));
      d.rotation.set(r() * 3, r() * 3, r() * 3);
    }, 92));
    // collision: one slim trunk proxy per tree
    for (const s of spots) px(ext, 0.7, 6, 0.7, s[0], 3, s[1]);
  }

  // Grass tufts across the lawns.
  {
    const tuft = props.billboardCross(0.5, 0.62);
    ctx.addDecor(props.scatter(tuft, grassBlade, 5200, (i, d, r) => {
      const x = r.range(-WALL_X, WALL_X), z = r.range(-WALL_Z, WALL_Z);
      if (insideManor(x, z)) return false;
      if (Math.abs(x) < 32 && z > -24 && z < 8) return false;
      if (Math.hypot(x - LAKE_X, z - LAKE_Z) < LAKE_R) return false;
      d.position.set(x, 0, z);
      d.rotation.y = r() * 6.28;
      d.scale.setScalar(r.range(0.7, 1.9));
    }, 77));
  }

  // ---------------------------------------------------------------------------
  // D. Gardens
  // ---------------------------------------------------------------------------

  // --- gravel forecourt + drive ---------------------------------------------
  slab(ext, -32, 32, -23, 8, 0.02, M.gravel, 0.24);
  slab(ext, -5, 5, 8, WALL_Z, 0.02, M.gravel, 0.24);
  {
    const chip = new THREE.IcosahedronGeometry(0.09, 0);
    ctx.addDecor(props.scatter(chip, M.stoneProp, 2600, (i, d, r) => {
      const drive = r.chance(0.25);
      const x = drive ? r.range(-4.4, 4.4) : r.range(-31, 31);
      const z = drive ? r.range(8, WALL_Z - 2) : r.range(-22.5, 7.5);
      if (Math.hypot(x, z + 8) < 4.6) return false;
      d.position.set(x, 0.03, z);
      d.scale.set(r.range(0.6, 1.5), r.range(0.3, 0.7), r.range(0.6, 1.5));
      d.rotation.set(r() * 3, r() * 3, r() * 3);
    }, 55));
  }

  // --- fountain --------------------------------------------------------------
  {
    const fx = 0, fz = -8;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const na = ((i + 1) / 16) * Math.PI * 2;
      const r0 = 4.3;
      const ax = fx + Math.cos(a) * r0, az = fz + Math.sin(a) * r0;
      const bx = fx + Math.cos(na) * r0, bz = fz + Math.sin(na) * r0;
      wallRun(ext, ax, az, bx, bz, 0, 0.75, 0.5, M.stoneTrim, []);
    }
    const pool = props.ground(8.2, 8.2, M.water);
    pool.position.set(fx, 0.5, fz);
    pool.userData.collide = false;
    ctx.addDecor(pool);
    vbox(ext, 1.5, 0.5, 1.5, fx, 0.75, fz, M.stoneTrim);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 1.7, 12), M.stoneProp);
    stem.position.set(fx, 1.85, fz); stem.castShadow = true; stem.userData.collide = false;
    ext.vis.add(stem);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.5, 0.5, 16), M.stoneProp);
    bowl.position.set(fx, 2.9, fz); bowl.castShadow = true; bowl.userData.collide = false;
    ext.vis.add(bowl);
    const angel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), M.stoneProp);
    angel.position.set(fx, 3.6, fz); angel.scale.set(0.7, 1.35, 0.7);
    angel.castShadow = true; angel.userData.collide = false;
    ext.vis.add(angel);
    px(ext, 1.6, 4.2, 1.6, fx, 2.1, fz);
    // lantern on a post beside the fountain (the point light lives here)
    sbox(ext, 0.22, 3.0, 0.22, 5.6, 1.5, -10, M.iron);
    vbox(ext, 0.5, 0.6, 0.5, 5.6, 3.25, -10, M.lampGlow);
  }

  // --- the abandoned carriage ------------------------------------------------
  {
    const cx = -18, cz = -5;
    sbox(ext, 3.4, 1.2, 1.9, cx, 1.5, cz, M.darkWood, 0.35);
    vbox(ext, 3.0, 1.4, 1.7, cx, 2.6, cz, M.darkWood, 0.35);
    vbox(ext, 1.1, 0.9, 1.72, cx + 0.2, 2.6, cz, M.glassDirty, 0.35);
    for (const [dx, dz, r] of [[1.5, 1.0, 0.85], [1.5, -1.0, 0.85], [-1.5, 1.0, 0.6], [-1.5, -1.0, 0.6]]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 16), M.iron);
      const ca = Math.cos(0.35), sa = Math.sin(0.35);
      w.position.set(cx + dx * ca - dz * sa, r, cz + dx * sa + dz * ca);
      w.castShadow = true; w.userData.collide = false;
      ext.vis.add(w);
      for (let s = 0; s < 8; s++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, r * 2, 0.05), M.darkWood);
        sp.position.copy(w.position); sp.rotation.z = (s / 8) * Math.PI;
        sp.userData.collide = false; ext.vis.add(sp);
      }
    }
    vbox(ext, 2.6, 0.16, 0.16, cx - 3.0, 0.9, cz, M.darkWood, 0.35);
  }

  // --- formal parterre with clipped topiary ----------------------------------
  {
    const px0 = -70, px1 = -14, pz0 = 6, pz1 = 40;
    slab(ext, px0, px1, pz0, pz1, 0.03, M.gravel, 0.2);
    const beds = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const bx = px0 + 5 + i * 13.5, bz = pz0 + 4 + j * 10.5;
      beds.push([bx, bz]);
      slab(ext, bx, bx + 9.5, bz, bz + 7, 0.16, M.soil, 0.2);
      // low box hedging around each bed
      for (const [ax, az, cx2, cz2] of [
        [bx, bz, bx + 9.5, bz], [bx, bz + 7, bx + 9.5, bz + 7],
        [bx, bz, bx, bz + 7], [bx + 9.5, bz, bx + 9.5, bz + 7]]) {
        wallRun(ext, ax, az, cx2, cz2, 0, 0.55, 0.5, M.leaf, [], false);
      }
    }
    // instanced topiary cones + spheres, all one draw call each
    const coneG = new THREE.ConeGeometry(0.85, 2.6, 7);
    coneG.translate(0, 1.3, 0);
    ctx.addDecor(props.scatter(coneG, M.leaf, 24, (i, d, r) => {
      const b = beds[i % beds.length];
      d.position.set(b[0] + (i % 2 ? 1.4 : 8.1), 0.16, b[1] + (i < 12 ? 1.4 : 5.6));
      d.rotation.y = r() * 6.28;
      d.scale.setScalar(r.range(0.85, 1.2));
    }, 33));
    const ballG = new THREE.IcosahedronGeometry(0.95, 1);
    ctx.addDecor(props.scatter(ballG, M.leaf, 26, (i, d, r) => {
      d.position.set(-68 + (i % 13) * 4.4, 0.9, i < 13 ? 7.6 : 38.4);
      d.scale.setScalar(r.range(0.8, 1.15));
      d.rotation.set(r() * 3, r() * 3, r() * 3);
    }, 34));
    for (let i = 0; i < 26; i++) px(ext, 1.7, 1.9, 1.7, -68 + (i % 13) * 4.4, 0.95, i < 13 ? 7.6 : 38.4);
    // urns along the central walk
    for (let i = 0; i < 6; i++) {
      const ux = px0 + 6 + i * 10;
      const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 1.1, 10), M.stoneProp);
      urn.position.set(ux, 0.55, 23); urn.castShadow = true; urn.userData.collide = false;
      ext.vis.add(urn);
      px(ext, 1.1, 1.3, 1.1, ux, 0.65, 23);
    }
  }

  // --- walled kitchen garden + broken greenhouses -----------------------------
  {
    wallRun(ext, KG_X0, KG_Z0, KG_X1, KG_Z0, 0, 2.8, 0.6, M.brickGarden, [{ c: 20, w: 2.4 }]);
    wallRun(ext, KG_X0, KG_Z1, KG_X1, KG_Z1, 0, 2.8, 0.6, M.brickGarden, [{ c: 18, w: 2.4 }]);
    wallRun(ext, KG_X0, KG_Z0, KG_X0, KG_Z1, 0, 2.8, 0.6, M.brickGarden, [{ c: 19, w: 2.4 }]);
    wallRun(ext, KG_X1, KG_Z0, KG_X1, KG_Z1, 0, 2.8, 0.6, M.brickGarden, []);
    // vegetable beds
    for (let i = 0; i < 6; i++) {
      const bz = KG_Z0 + 5 + i * 5.6;
      slab(ext, KG_X0 + 4, KG_X0 + 30, bz, bz + 3.4, 0.22, M.soil, 0.24);
    }
    // two lean-to greenhouses against the north wall, glass mostly gone
    for (const gx of [KG_X0 + 5, KG_X0 + 21]) {
      const gz = KG_Z1 - 5.4;
      wallRun(ext, gx, gz, gx + 12, gz, 0, 0.7, 0.3, M.brickGarden, []);
      for (let i = 0; i <= 12; i += 1.5) sbox(ext, 0.12, 3.0, 0.12, gx + i, 1.5, gz, M.iron);
      for (let i = 0; i <= 12; i += 1.5) vbox(ext, 0.12, 0.12, 5.4, gx + i, 3.1, gz + 2.7, M.iron, 0);
      // pitched glass with panes missing
      const R = rng.fork('greenhouse' + gx);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
        if (R.chance(0.34)) continue;
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 1.7), M.glassDirty);
        p.position.set(gx + 0.8 + i * 1.5, 3.35 - j * 0.16, gz + 0.9 + j * 1.8);
        p.rotation.x = 0.09;
        p.userData.collide = false;
        glassB.vis.add(p);
      }
      px(ext, 12.4, 3.2, 0.4, gx + 6, 1.6, gz);
      px(ext, 0.4, 3.2, 5.4, gx, 1.6, gz + 2.7);
      px(ext, 0.4, 3.2, 5.4, gx + 12, 1.6, gz + 2.7);
      // shards on the floor
      stow(ext, props.rubble(3.2, 12, M.glassDirty, 7), gx + 6, 0.02, gz + 3.6);
    }
    // cold frames and a water butt
    for (let i = 0; i < 4; i++) sbox(ext, 1.8, 0.5, 1.2, KG_X0 + 34, 0.25, KG_Z0 + 6 + i * 3.4, M.darkWood);
    stow(ext, props.barrel(0.6, 1.5, M.darkWood), KG_X0 + 2.5, 0, KG_Z1 - 2.5, 0, 1.3, 1.5, 1.3);
  }

  // --- chapel and family graveyard -------------------------------------------
  {
    const cx = CHAPEL_X, cz = CHAPEL_Z, cw = 11, cd = 18;
    wallRun(ext, cx - cw / 2, cz - cd / 2, cx + cw / 2, cz - cd / 2, 0, 6.5, 0.8, M.ashlar, []);
    wallRun(ext, cx - cw / 2, cz + cd / 2, cx + cw / 2, cz + cd / 2, 0, 6.5, 0.8, M.ashlar,
      [{ c: cw / 2, w: 2.0, y0: 0, y1: 3.0 }]);
    wallRun(ext, cx - cw / 2, cz - cd / 2, cx - cw / 2, cz + cd / 2, 0, 6.5, 0.8, M.ashlar,
      [{ c: 5, w: 1.6, y0: 1.6, y1: 4.6 }, { c: 12, w: 1.6, y0: 1.6, y1: 4.6 }]);
    wallRun(ext, cx + cw / 2, cz - cd / 2, cx + cw / 2, cz + cd / 2, 0, 6.5, 0.8, M.ashlar,
      [{ c: 5, w: 1.6, y0: 1.6, y1: 4.6 }, { c: 12, w: 1.6, y0: 1.6, y1: 4.6 }]);
    slab(ext, cx - cw / 2, cx + cw / 2, cz - cd / 2, cz + cd / 2, 0.06, M.flag, 0.3);
    // steep roof
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(cw / 2 + 0.6, 0.3, cd + 0.8), M.slate);
      r.position.set(cx + s * cw * 0.26, 7.9, cz);
      r.rotation.z = s * -0.62;
      r.castShadow = true; r.receiveShadow = true; r.userData.collide = false;
      ext.vis.add(r);
    }
    px(ext, cw + 1, 0.6, cd + 1, cx, 7.3, cz);
    // little tower
    for (const [ax, az, bx, bz] of [
      [cx - 2, cz - cd / 2 - 4, cx + 2, cz - cd / 2 - 4],
      [cx - 2, cz - cd / 2, cx + 2, cz - cd / 2],
      [cx - 2, cz - cd / 2 - 4, cx - 2, cz - cd / 2],
      [cx + 2, cz - cd / 2 - 4, cx + 2, cz - cd / 2]])
      wallRun(ext, ax, az, bx, bz, 0, 12, 0.6, M.ashlar, []);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.1, 6, 4), M.slate);
    spire.position.set(cx, 15, cz - cd / 2 - 2); spire.rotation.y = Math.PI / 4;
    spire.castShadow = true; spire.userData.collide = false;
    ext.vis.add(spire);
    // pews
    for (let i = 0; i < 7; i++) for (const s of [-1, 1])
      sbox(ext, 4.0, 0.95, 0.5, cx + s * 2.6, 0.55, cz - 6 + i * 2.0, M.darkWood);
    sbox(ext, 2.4, 1.1, 0.9, cx, 0.6, cz - 7.5, M.darkWood);  // altar
    // headstones — one instanced mesh for forty, plus the ABBADON stone
    const R = rng.fork('graves');
    const stoneG = new THREE.BoxGeometry(0.7, 1.2, 0.16);
    stoneG.translate(0, 0.6, 0);
    const gpos = [];
    for (let i = 0; i < 46; i++) {
      const gx = cx + R.range(-16, 16), gz = cz + R.range(-16, 20);
      if (Math.abs(gx - cx) < cw / 2 + 2 && Math.abs(gz - cz) < cd / 2 + 5) continue;
      gpos.push([gx, gz, R.range(-0.3, 0.3), R.range(-0.16, 0.16)]);
    }
    ctx.addDecor(props.scatter(stoneG, M.stoneProp, gpos.length, (i, d, r) => {
      const g = gpos[i];
      d.position.set(g[0], 0, g[1]);
      d.rotation.set(g[3], g[2], r.range(-0.1, 0.1));
      d.scale.set(r.range(0.8, 1.5), r.range(0.8, 1.6), 1);
    }, 66));
    for (const g of gpos) px(ext, 0.9, 1.3, 0.5, g[0], 0.65, g[1], g[2]);
    // DANIEL ABBADON's grave — bigger, chest tomb, name cut into the face
    const tx = cx + 7, tz = cz + 12;
    sbox(ext, 2.6, 1.0, 1.4, tx, 0.5, tz, M.stoneProp);
    vbox(ext, 3.0, 0.22, 1.8, tx, 1.11, tz, M.stoneTrim);
    const nameMat = mat.textMaterial('DANIEL ABBADON\n1804 — 1871\nHE IS NOT DEPARTED', {
      color: 0x2a2622, background: 0x8b8880, fontSize: 46,
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3 / nameMat.aspect), nameMat.material);
    plate.position.set(tx, 0.58, tz + 0.72);
    plate.userData.collide = false;
    ext.vis.add(plate);
    // a cross leaning against it
    vbox(ext, 0.22, 2.4, 0.22, tx + 2.2, 1.2, tz, M.stoneProp, 0);
    vbox(ext, 1.2, 0.22, 0.22, tx + 2.2, 1.9, tz, M.stoneProp, 0);
    px(ext, 0.6, 2.4, 0.6, tx + 2.2, 1.2, tz);
  }

  // --- ornamental lake, shelving beach, boathouse, rowing boat ---------------
  {
    // The lake is a shallow ornamental sheet: silted bed just under the
    // surface, so it is wadeable everywhere and the player can never get
    // stuck below a shoreline. No hole in the ground collision is needed.
    const bed = new THREE.Mesh(new THREE.CircleGeometry(LAKE_R + 0.4, 30), M.soil);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(LAKE_X, 0.03, LAKE_Z);
    bed.receiveShadow = true; bed.userData.collide = false;
    ctx.addDecor(bed);
    const surf = new THREE.Mesh(new THREE.CircleGeometry(LAKE_R, 34), M.water);
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(LAKE_X, 0.30, LAKE_Z);
    surf.userData.collide = false;
    ctx.addDecor(surf);
    // stone kerb, broken in places, so the sheet of water reads as a rim
    for (let i = 0; i < 24; i++) {
      if (rng.chance(0.22)) continue;
      const a = (i / 24) * Math.PI * 2;
      vbox(ext, 4.7, 0.34, 0.7,
        LAKE_X + Math.cos(a) * (LAKE_R + 0.55), 0.17, LAKE_Z + Math.sin(a) * (LAKE_R + 0.55),
        M.stoneTrim, -a + Math.PI / 2);
    }
    // reed fringe
    const reed = props.billboardCross(0.4, 1.5);
    ctx.addDecor(props.scatter(reed, grassBlade, 700, (i, d, r) => {
      const a = r() * 6.28, rr = LAKE_R + r.range(-2.2, 1.6);
      d.position.set(LAKE_X + Math.cos(a) * rr, 0.05, LAKE_Z + Math.sin(a) * rr);
      d.scale.setScalar(r.range(0.8, 1.9));
      d.rotation.y = r() * 6.28;
    }, 78));
    // boathouse on the near shore
    const bx = LAKE_X + 2, bz = LAKE_Z - LAKE_R - 2.5;
    wallRun(ext, bx - 5, bz - 5, bx + 5, bz - 5, 0, 3.2, 0.3, M.darkWood, [{ c: 5, w: 2.2, y0: 0, y1: 2.3 }]);
    wallRun(ext, bx - 5, bz + 5, bx + 5, bz + 5, 0, 3.2, 0.3, M.darkWood, [{ c: 5, w: 4.0, y0: 0, y1: 2.6 }]);
    wallRun(ext, bx - 5, bz - 5, bx - 5, bz + 5, 0, 3.2, 0.3, M.darkWood, []);
    wallRun(ext, bx + 5, bz - 5, bx + 5, bz + 5, 0, 3.2, 0.3, M.darkWood, []);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.22, 10.6), M.slate);
      r.position.set(bx + s * 2.6, 4.0, bz); r.rotation.z = s * -0.5;
      r.castShadow = true; r.userData.collide = false; ext.vis.add(r);
    }
    px(ext, 11, 0.5, 11, bx, 3.7, bz);
    slab(ext, bx - 4.7, bx + 4.7, bz - 4.7, bz + 4.7, 0.12, M.darkWood, 0.3);
    // jetty out over the water, with a ramp up onto it
    slab(ext, bx - 1.6, bx + 1.6, bz + 5.6, bz + 13, 0.45, M.darkWood, 0.25);
    rampZ(ext, bx - 1.6, bx + 1.6, bz + 4.2, bz + 5.7, 0.02, 0.45, 0.4);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1])
      vbox(ext, 0.22, 1.0, 0.22, bx + s * 1.4, 0.0, bz + 6.4 + i * 1.5, M.darkWood);
    // rowing boat, half sunk
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.65, 4.2, 8, 1, false, 0, Math.PI), M.darkWood);
    hull.rotation.set(Math.PI / 2, 0, Math.PI);
    hull.castShadow = true; hull.userData.collide = false;
    boat.add(hull);
    for (const t of [-1.1, 0.4]) {
      const th = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.3), M.darkWood);
      th.position.set(0, 0.35, t); th.userData.collide = false; boat.add(th);
    }
    boat.position.set(bx + 3.4, 0.16, bz + 9);
    boat.rotation.y = 0.4;
    ctx.addDecor(boat);
    px(ext, 2.0, 0.9, 4.4, bx + 3.4, 0.48, bz + 9, 0.4);
  }

  // ---------------------------------------------------------------------------
  // E. The hedge maze — recursive-backtracker (iterative, explicit stack) on a
  //    20 x 20 grid of 3 m cells, then ~11% of interior walls knocked through to
  //    create loops. A backtracker carves a spanning tree, so EVERY cell is
  //    reachable from the start cell; the start cell is the centre chamber, so
  //    the folly is guaranteed solvable from any entrance. Knocking walls out
  //    can only add connectivity, never remove it.
  // ---------------------------------------------------------------------------
  const mazeDeadEnds = [];
  {
    const n = MAZE_N, cell = MAZE_CELL, x0 = MAZE_X0, z0 = MAZE_Z0;
    const R = rng.fork('maze');
    // V[i][j] = wall at x = x0+i*cell spanning z0+j*cell .. z0+(j+1)*cell
    // H[i][j] = wall at z = z0+j*cell spanning x0+i*cell .. x0+(i+1)*cell
    const V = [], H = [];
    for (let i = 0; i <= n; i++) { V.push(new Array(n).fill(true)); }
    for (let i = 0; i < n; i++) { H.push(new Array(n + 1).fill(true)); }
    const seen = [];
    for (let i = 0; i < n; i++) seen.push(new Array(n).fill(false));

    const stack = [[10, 10]];
    seen[10][10] = true;
    let visited = 1;
    while (stack.length) {
      const [ci, cj] = stack[stack.length - 1];
      const cand = [];
      if (ci > 0 && !seen[ci - 1][cj]) cand.push(0);
      if (ci < n - 1 && !seen[ci + 1][cj]) cand.push(1);
      if (cj > 0 && !seen[ci][cj - 1]) cand.push(2);
      if (cj < n - 1 && !seen[ci][cj + 1]) cand.push(3);
      if (!cand.length) { stack.pop(); continue; }
      const dir = R.pick(cand);
      let ni = ci, nj = cj;
      if (dir === 0) { ni = ci - 1; V[ci][cj] = false; }
      if (dir === 1) { ni = ci + 1; V[ci + 1][cj] = false; }
      if (dir === 2) { nj = cj - 1; H[ci][cj] = false; }
      if (dir === 3) { nj = cj + 1; H[ci][cj + 1] = false; }
      seen[ni][nj] = true; visited++;
      stack.push([ni, nj]);
    }
    // Safety net: if any cell were somehow unvisited, punch it through to a
    // visited neighbour. (With a full backtracker this never fires.)
    if (visited < n * n) {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (seen[i][j]) continue;
        if (i > 0) { V[i][j] = false; seen[i][j] = true; }
        else { V[i + 1][j] = false; seen[i][j] = true; }
      }
    }

    // Loops — thin out interior walls so the maze is not a pure tree.
    for (let i = 1; i < n; i++) for (let j = 0; j < n; j++)
      if (V[i][j] && R.chance(0.11)) V[i][j] = false;
    for (let i = 0; i < n; i++) for (let j = 1; j < n; j++)
      if (H[i][j] && R.chance(0.11)) H[i][j] = false;

    // Centre chamber for the folly: cells 8..10 in both axes, cleared out.
    for (let i = 8; i <= 10; i++) for (let j = 8; j <= 10; j++) {
      if (i > 8) V[i][j] = false;
      if (j > 8) H[i][j] = false;
    }
    // Entrances: south (facing the manor), north, east, west.
    H[10][0] = false; H[9][0] = false;
    H[4][n] = false;
    V[0][6] = false;
    V[n][14] = false;

    // Dead ends make excellent hiding spots — find a few.
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const open = (V[i][j] ? 0 : 1) + (V[i + 1][j] ? 0 : 1) + (H[i][j] ? 0 : 1) + (H[i][j + 1] ? 0 : 1);
      if (open === 1 && (i < 7 || i > 11 || j < 7 || j > 11))
        mazeDeadEnds.push([x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell]);
    }
    rng.fork('deadend').shuffle(mazeDeadEnds);

    // --- merge collinear runs so the collision set stays small ---------------
    const runs = [];
    for (let i = 0; i <= n; i++) {
      let j = 0;
      while (j < n) {
        if (!V[i][j]) { j++; continue; }
        let k = j; while (k < n && V[i][k]) k++;
        runs.push([x0 + i * cell, z0 + j * cell, x0 + i * cell, z0 + k * cell]);
        j = k;
      }
    }
    for (let j = 0; j <= n; j++) {
      let i = 0;
      while (i < n) {
        if (!H[i][j]) { i++; continue; }
        let k = i; while (k < n && H[k][j]) k++;
        runs.push([x0 + i * cell, z0 + j * cell, x0 + k * cell, z0 + j * cell]);
        i = k;
      }
    }

    // Invisible collision walls + one instanced mesh of foliage blobs on top.
    const hedgeBank = newBank();
    const blobs = [];
    const RF = rng.fork('hedgefoliage');
    for (const [ax, az, bx, bz] of runs) {
      const len = Math.hypot(bx - ax, bz - az);
      const ry = -Math.atan2(bz - az, bx - ax);
      px(hedgeBank, len, HEDGE_H, HEDGE_T, (ax + bx) / 2, HEDGE_H / 2, (az + bz) / 2, ry);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const steps = Math.max(2, Math.round(len / 0.62));
      for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * len;
        for (const tier of [0.55, 1.25, 1.9, 2.42]) {
          const off = RF.range(-0.42, 0.42);
          blobs.push([
            ax + ux * t - uz * off + RF.range(-0.12, 0.12),
            tier + RF.range(-0.12, 0.12),
            az + uz * t + ux * off + RF.range(-0.12, 0.12),
            RF.range(0.34, 0.62),
          ]);
        }
      }
    }
    const blobG = new THREE.IcosahedronGeometry(1, 0);
    const hedgeFoliage = props.scatter(blobG, M.leaf, blobs.length, (i, d, r) => {
      const b = blobs[i];
      d.position.set(b[0], b[1], b[2]);
      d.scale.set(b[3] * r.range(0.9, 1.3), b[3] * r.range(0.8, 1.1), b[3] * r.range(0.9, 1.3));
      d.rotation.set(r() * 3, r() * 3, r() * 3);
    }, 101);
    ctx.addDecor(hedgeFoliage);
    ctx.addSolid(hedgeBank.col);

    // Trodden-earth floor inside the maze so it reads as a separate place.
    slab(ext, x0, x0 + n * cell, z0, z0 + n * cell, 0.02, M.soil, 0.18);

    // --- the folly at the centre ---------------------------------------------
    const fx = x0 + 10 * cell, fz = z0 + 10 * cell;   // (42, 42)
    slab(ext, fx - 4.2, fx + 4.2, fz - 4.2, fz + 4.2, 0.24, M.flag, 0.3);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cxp = fx + Math.cos(a) * 3.4, czp = fz + Math.sin(a) * 3.4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 3.2, 10), M.stoneProp);
      col.position.set(cxp, 1.84, czp); col.castShadow = true; col.userData.collide = false;
      ext.vis.add(col);
      px(ext, 0.5, 3.2, 0.5, cxp, 1.84, czp);
    }
    const dome = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.6, 8), M.lead);
    dome.position.set(fx, 4.9, fz); dome.rotation.y = Math.PI / 8;
    dome.castShadow = true; dome.userData.collide = false;
    ext.vis.add(dome);
    px(ext, 8.4, 0.5, 8.4, fx, 3.6, fz);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), M.gold);
    finial.position.set(fx, 6.4, fz); finial.userData.collide = false; ext.vis.add(finial);
    // a stone bench and a stopped sundial
    sbox(ext, 2.4, 0.45, 0.6, fx, 0.46, fz - 2.6, M.stoneProp);
    sbox(ext, 0.5, 1.0, 0.5, fx, 0.74, fz, M.stoneProp);
    vbox(ext, 1.0, 0.08, 1.0, fx, 1.28, fz, M.brass);
    vbox(ext, 0.06, 0.5, 0.5, fx, 1.55, fz, M.brass, 0.4);

    ctx.onUpdate((dt, t) => {
      hedgeFoliage.rotation.y = Math.sin(t * 0.31) * 0.0035;
      hedgeFoliage.position.x = Math.sin(t * 0.47) * 0.05;
    });
  }

  // ---------------------------------------------------------------------------
  // F. Manor shell — stone carcass, tall mullioned windows, porch, conservatory
  // ---------------------------------------------------------------------------
  const shellB = newBank();   // exterior masonry + roof carcass
  const cellarB = newBank();
  const groundB = newBank();
  const firstB = newBank();
  const atticB = newBank();
  const roofB = newBank();

  const winW = 2.2;
  const WIN_G = { y0: 1.10, y1: 3.90 };
  const WIN_1 = { y0: 5.70, y1: 8.50 };
  const winSpots = [];   // { x, z, ry, sill, h } — reused for curtains + shafts

  const facadeWindows = (ax, az, bx, bz, xs, mapC, ry) => {
    const ops = [];
    for (const s of xs) {
      ops.push({ c: mapC(s), w: winW, y0: WIN_G.y0, y1: WIN_G.y1 });
      ops.push({ c: mapC(s), w: winW, y0: WIN_1.y0, y1: WIN_1.y1 });
    }
    return ops;
  };

  // --- south (front) façade ---------------------------------------------------
  {
    const xs = [-32, -26, -20, -14, -8, 8, 14, 20, 26, 32];
    const ops = facadeWindows(MX0, MZ1, MX1, MZ1, xs, (x) => x - MX0, 0);
    ops.push({ c: 35, w: 3.2, y0: 0, y1: 4.2 });                 // front door
    ops.push({ c: 35, w: winW, y0: WIN_1.y0, y1: WIN_1.y1 });     // window over it
    wallRun(shellB, MX0, MZ1, MX1, MZ1, 0, Y_EAVE, WT, M.ashlar, ops);
    for (const x of xs) {
      winSpots.push({ x, z: MZ1, ry: 0, sill: WIN_G.y0, h: WIN_G.y1 - WIN_G.y0, floor: Y_G });
      winSpots.push({ x, z: MZ1, ry: 0, sill: WIN_1.y0, h: WIN_1.y1 - WIN_1.y0, floor: Y_1 });
    }
    winSpots.push({ x: 0, z: MZ1, ry: 0, sill: WIN_1.y0, h: WIN_1.y1 - WIN_1.y0, floor: Y_1 });
  }
  // --- north (rear) façade -----------------------------------------------------
  {
    const xs = [-32, -26, -20, -14, -8, -2, 4, 10, 16, 22, 28];
    const ops = facadeWindows(MX0, MZ0, MX1, MZ0, xs, (x) => x - MX0, 0);
    ops.push({ c: 68.5, w: 2.2, y0: 0, y1: 2.5 });                // rear service door
    wallRun(shellB, MX0, MZ0, MX1, MZ0, 0, Y_EAVE, WT, M.ashlar, ops);
    for (const x of xs) {
      winSpots.push({ x, z: MZ0, ry: Math.PI, sill: WIN_G.y0, h: WIN_G.y1 - WIN_G.y0, floor: Y_G });
      winSpots.push({ x, z: MZ0, ry: Math.PI, sill: WIN_1.y0, h: WIN_1.y1 - WIN_1.y0, floor: Y_1 });
    }
  }
  // --- west façade --------------------------------------------------------------
  {
    const zs = [-28, -34, -40, -46, -52, -58];
    const ops = facadeWindows(MX0, MZ0, MX0, MZ1, zs, (z) => z - MZ0, 0);
    ops.push({ c: 5, w: 2.2, y0: 0, y1: 2.5 });                   // scullery door
    wallRun(shellB, MX0, MZ0, MX0, MZ1, 0, Y_EAVE, WT, M.ashlar, ops);
    for (const z of zs) {
      winSpots.push({ x: MX0, z, ry: -Math.PI / 2, sill: WIN_G.y0, h: WIN_G.y1 - WIN_G.y0, floor: Y_G });
      winSpots.push({ x: MX0, z, ry: -Math.PI / 2, sill: WIN_1.y0, h: WIN_1.y1 - WIN_1.y0, floor: Y_1 });
    }
  }
  // --- east façade --------------------------------------------------------------
  {
    const zs = [-28, -34, -60, -64];
    const ops = facadeWindows(MX1, MZ0, MX1, MZ1, zs, (z) => z - MZ0, 0);
    ops.push({ c: -44 - MZ0, w: 3.0, y0: 0, y1: 3.2 });           // into the conservatory
    ops.push({ c: -58 - MZ0, w: 2.2, y0: WIN_1.y0, y1: WIN_1.y1 });
    wallRun(shellB, MX1, MZ0, MX1, MZ1, 0, Y_EAVE, WT, M.ashlar, ops);
    for (const z of zs) {
      winSpots.push({ x: MX1, z, ry: Math.PI / 2, sill: WIN_G.y0, h: WIN_G.y1 - WIN_G.y0, floor: Y_G });
      winSpots.push({ x: MX1, z, ry: Math.PI / 2, sill: WIN_1.y0, h: WIN_1.y1 - WIN_1.y0, floor: Y_1 });
    }
    winSpots.push({ x: MX1, z: -58, ry: Math.PI / 2, sill: WIN_1.y0, h: WIN_1.y1 - WIN_1.y0, floor: Y_1 });
  }

  // Drop the joinery into every opening. These mullions are what throw the
  // long barred shadows across the floors — the signature of the arena.
  for (const w of winSpots) {
    gothicWindow(shellB, glassB, w.x, w.z, w.ry, winW, w.h, w.sill, M.stoneTrim, M.glass, 2);
    // hood mould / label stop above each opening
    const ry = w.ry;
    vbox(shellB, winW + 0.9, 0.24, 0.34,
      w.x + Math.sin(ry) * 0.55, w.sill + w.h + 0.34, w.z + Math.cos(ry) * 0.55, M.stoneTrim, ry);
  }

  // Quoins, plinth and string courses.
  for (const [cx, cz] of [[MX0, MZ0], [MX0, MZ1], [MX1, MZ0], [MX1, MZ1]]) {
    for (let y = 0.4; y < Y_EAVE; y += 0.8)
      vbox(shellB, 1.9, 0.7, 1.9, cx, y, cz, M.stoneTrim);
  }
  for (const [ax, az, bx, bz] of [
    [MX0, MZ0, MX1, MZ0], [MX0, MZ1, MX1, MZ1], [MX0, MZ0, MX0, MZ1], [MX1, MZ0, MX1, MZ1]]) {
    const len = Math.hypot(bx - ax, bz - az) + 1.2;
    const ry = -Math.atan2(bz - az, bx - ax);
    const ox = (az === bz) ? 0 : (ax < 0 ? -0.22 : 0.22);
    const oz = (ax === bx) ? 0 : (az < -45 ? -0.22 : 0.22);
    vbox(shellB, len, 0.9, WT + 0.5, (ax + bx) / 2 + ox, 0.45, (az + bz) / 2 + oz, M.stoneTrim, ry);
    vbox(shellB, len, 0.34, WT + 0.34, (ax + bx) / 2 + ox, 4.75, (az + bz) / 2 + oz, M.stoneTrim, ry);
    vbox(shellB, len, 0.5, WT + 0.7, (ax + bx) / 2 + ox, Y_EAVE + 0.25, (az + bz) / 2 + oz, M.stoneTrim, ry);
  }

  // --- porch --------------------------------------------------------------------
  {
    slab(shellB, -6, 6, MZ1 - 0.5, MZ1 + 4.0, 0.08, M.flag, 0.3);
    for (const sx of [-4.2, -1.7, 1.7, 4.2]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 5.2, 12), M.stoneTrim);
      c.position.set(sx, 2.6, MZ1 + 3.2); c.castShadow = true; c.userData.collide = false;
      shellB.vis.add(c);
      px(shellB, 1.0, 5.2, 1.0, sx, 2.6, MZ1 + 3.2);
    }
    vbox(shellB, 11.2, 1.1, 4.8, 0, 5.75, MZ1 + 2.2, M.stoneTrim);
    px(shellB, 11.2, 1.1, 4.8, 0, 5.75, MZ1 + 2.2);
    // pediment
    const ped = new THREE.Mesh(new THREE.ConeGeometry(6.2, 2.0, 4), M.stoneTrim);
    ped.position.set(0, 7.3, MZ1 + 2.2); ped.rotation.y = Math.PI / 4;
    ped.scale.set(1, 1, 0.5); ped.castShadow = true; ped.userData.collide = false;
    shellB.vis.add(ped);
    // the front doors, standing open
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.0, 0.12), M.walnut);
      leaf.position.set(s * (1.5 + 0.62 * 0.75), 2.0, MZ1 + 0.62 * (s ? 0.6 : 0.6));
      leaf.rotation.y = s * -0.62;
      leaf.castShadow = true; leaf.userData.collide = false;
      shellB.vis.add(leaf);
      const knock = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 14), M.brass);
      knock.position.copy(leaf.position); knock.position.y = 2.3;
      knock.userData.collide = false; shellB.vis.add(knock);
    }
    // lamps flanking the door
    for (const s of [-1, 1]) {
      vbox(shellB, 0.34, 0.6, 0.34, s * 2.6, 3.1, MZ1 + 0.55, M.iron);
      vbox(shellB, 0.26, 0.4, 0.26, s * 2.6, 3.1, MZ1 + 0.55, M.lampGlow);
    }
  }

  // --- conservatory wing (single storey, cracked glass roof) -------------------
  {
    const dw = 1.0;
    wallRun(shellB, CONS_X0, CONS_Z0, CONS_X1, CONS_Z0, 0, dw, 0.4, M.brickGarden, []);
    wallRun(shellB, CONS_X0, CONS_Z1, CONS_X1, CONS_Z1, 0, dw, 0.4, M.brickGarden, []);
    wallRun(shellB, CONS_X1, CONS_Z0, CONS_X1, CONS_Z1, 0, dw, 0.4, M.brickGarden,
      [{ c: 8, w: 2.2, y0: 0, y1: 1.0 }]);
    slab(shellB, CONS_X0, CONS_X1, CONS_Z0, CONS_Z1, 0.04, M.flag, 0.3);
    // cast-iron frame
    const R = rng.fork('conservatory');
    for (let x = CONS_X0; x <= CONS_X1; x += 2.5) {
      sbox(shellB, 0.14, 4.0, 0.14, x, 2.0, CONS_Z0, M.iron);
      sbox(shellB, 0.14, 4.0, 0.14, x, 2.0, CONS_Z1, M.iron);
    }
    for (let z = CONS_Z0; z <= CONS_Z1; z += 2.0) {
      sbox(shellB, 0.14, 4.0, 0.14, CONS_X1, 2.0, z, M.iron);
      vbox(shellB, 15.5, 0.12, 0.12, (CONS_X0 + CONS_X1) / 2, 4.2, z, M.iron);
    }
    vbox(shellB, 0.16, 0.16, 16.4, (CONS_X0 + CONS_X1) / 2, 5.7, (CONS_Z0 + CONS_Z1) / 2, M.iron);
    // walls of glass + the broken pitched roof
    for (let x = CONS_X0; x < CONS_X1; x += 2.5) {
      for (const z of [CONS_Z0, CONS_Z1]) {
        if (R.chance(0.12)) continue;
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 0.03), M.glassDirty);
        p.position.set(x + 1.25, 2.5, z); p.userData.collide = false; glassB.vis.add(p);
      }
    }
    for (let x = CONS_X0; x < CONS_X1; x += 2.5) for (let j = 0; j < 4; j++) {
      if (R.chance(0.22)) continue;
      const s = j < 2 ? -1 : 1, k = j % 2;
      const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.03, 4.4), M.glassDirty);
      p.position.set(x + 1.25, 4.35 + (1 - k) * 0.62, (CONS_Z0 + CONS_Z1) / 2 + s * (2.1 + k * 4.2));
      p.rotation.x = s * -0.28;
      p.userData.collide = false; glassB.vis.add(p);
    }
    px(shellB, 16, 0.4, 17, (CONS_X0 + CONS_X1) / 2, 5.5, (CONS_Z0 + CONS_Z1) / 2);
    // dead palms in tubs
    for (let i = 0; i < 7; i++) {
      const tx = CONS_X0 + 2.5 + R.range(0, 11), tz = CONS_Z0 + 2.5 + R.range(0, 11);
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.8, 10), M.brickGarden);
      tub.position.set(tx, 0.4, tz); tub.castShadow = true; tub.userData.collide = false;
      shellB.vis.add(tub);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, R.range(1.6, 2.8), 6), M.bark);
      stem.position.set(tx, 0.8 + stem.geometry.parameters.height / 2, tz);
      stem.rotation.z = R.range(-0.14, 0.14);
      stem.castShadow = true; stem.userData.collide = false; shellB.vis.add(stem);
      for (let f = 0; f < 6; f++) {
        const frond = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.22), M.leafDead);
        frond.position.set(tx, 0.8 + stem.geometry.parameters.height, tz);
        frond.rotation.set(R.range(0.5, 1.1), (f / 6) * 6.28, 0);
        frond.castShadow = true; frond.userData.collide = false; shellB.vis.add(frond);
      }
      px(shellB, 1.1, 1.0, 1.1, tx, 0.4, tz);
    }
    stow(shellB, props.rubble(4.5, 16, M.glassDirty, 12),
      (CONS_X0 + CONS_X1) / 2, 0.06, (CONS_Z0 + CONS_Z1) / 2);
  }

  // --- coal chute: a genuine slide from the forecourt down into the cellar ----
  {
    const mouthX = 39.5, cz = -58;
    // stone hood at the top
    wallRun(shellB, mouthX - 0.2, cz - 1.6, 41.6, cz - 1.6, 0, 1.2, 0.4, M.stoneTrim, []);
    wallRun(shellB, mouthX - 0.2, cz + 1.6, 41.6, cz + 1.6, 0, 1.2, 0.4, M.stoneTrim, []);
    wallRun(shellB, 41.6, cz - 1.6, 41.6, cz + 1.6, 0, 1.2, 0.4, M.stoneTrim, []);
    vbox(shellB, 2.6, 0.3, 3.6, 40.4, 1.35, cz, M.stoneTrim);
    // the chute itself: from (39.5, -0.1) down to (29.5, -4.4)
    rampX(shellB, 29.0, mouthX, cz - 1.5, cz + 1.5, -4.35, -0.05, 0.8);
    const chute = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(10.5, 4.3), 0.3, 3.0), M.lead);
    chute.position.set(34.25, -2.2, cz);
    chute.rotation.z = Math.atan2(4.3, 10.5);
    chute.castShadow = false; chute.receiveShadow = true; chute.userData.collide = false;
    shellB.vis.add(chute);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(10.5, 4.3), 1.4, 0.25), M.stoneProp);
      side.position.set(34.25, -1.7, cz + s * 1.6);
      side.rotation.z = Math.atan2(4.3, 10.5);
      side.userData.collide = false; shellB.vis.add(side);
      px(shellB, 11.4, 1.8, 0.5, 34.25, -1.6, cz + s * 1.75, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // G. The cellar (y = -4.6) — brick vaults, wine, boiler, coal, iron door
  // ---------------------------------------------------------------------------
  {
    const B = cellarB, Y = Y_CELLAR, H = 4.2;
    slab(B, CX0, CX1, CZ0, CZ1, Y, M.flag, 0.5);
    wallRun(B, CX0, CZ0, CX1, CZ0, Y, H, 0.7, M.brickCellar, []);
    wallRun(B, CX0, CZ1, CX1, CZ1, Y, H, 0.7, M.brickCellar, []);
    wallRun(B, CX0, CZ0, CX0, CZ1, Y, H, 0.7, M.brickCellar, []);
    wallRun(B, CX1, CZ0, CX1, CZ1, Y, H, 0.7, M.brickCellar,
      [{ c: 6, w: 3.0, y0: 0, y1: 4.0 }]);   // coal chute mouth

    // piers + barrel vaulting under the ground floor
    for (const x of [-22, -11, 0, 11, 22]) for (const z of [-57, -46.5, -36]) {
      sbox(B, 1.3, 3.0, 1.3, x, Y + 1.5, z, M.brickCellar);
      // springing corbels
      vbox(B, 1.8, 0.3, 1.8, x, Y + 3.05, z, M.brickCellar);
    }
    for (let z = CZ0 + 1.85; z < CZ1; z += 3.7) {
      const v = new THREE.Mesh(
        new THREE.CylinderGeometry(1.85, 1.85, CX1 - CX0, 12, 1, true, 0, Math.PI), M.brickVault);
      v.rotation.z = Math.PI / 2;
      v.position.set(0, Y + 2.35, z);
      v.castShadow = false; v.receiveShadow = true; v.userData.collide = false;
      B.vis.add(v);
    }

    // partition walls: wine vault / boiler house / coal store
    wallRun(B, -12, CZ0, -12, -40, Y, H, 0.5, M.brickCellar, [{ c: 10, w: 2.2, y0: 0, y1: 2.6 }]);
    wallRun(B, -12, -40, 16, -40, Y, H, 0.5, M.brickCellar,
      [{ c: 6, w: 2.2, y0: 0, y1: 2.6 }, { c: 22, w: 2.2, y0: 0, y1: 2.6 }]);
    wallRun(B, 16, -52, 16, -33, Y, H, 0.5, M.brickCellar, [{ c: 12, w: 2.2, y0: 0, y1: 2.6 }]);
    wallRun(B, 16, -52, CX1, -52, Y, H, 0.5, M.brickCellar, [{ c: 9, w: 2.4, y0: 0, y1: 2.6 }]);

    // --- wine racks (x -33..-13) ------------------------------------------------
    const RW = rng.fork('wine');
    const bottleG = new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6);
    const bottles = [];
    for (let r = 0; r < 5; r++) {
      const rx = -30 + r * 4.2;
      for (const zz of [-58, -50]) {
        for (let i = 0; i < 5; i++)
          vbox(B, 1.1, 0.06, 5.5, rx, Y + 0.35 + i * 0.42, zz, M.darkWood);
        for (const sx of [-0.5, 0.5]) vbox(B, 0.08, 2.3, 5.5, rx + sx, Y + 1.15, zz, M.darkWood);
        px(B, 1.2, 2.3, 5.6, rx, Y + 1.15, zz);
        for (let i = 0; i < 5; i++) for (let k = 0; k < 16; k++) {
          if (RW.chance(0.3)) continue;
          bottles.push([rx + RW.range(-0.3, 0.3), Y + 0.44 + i * 0.42, zz - 2.6 + k * 0.35]);
        }
      }
    }
    ctx.addDecor(props.scatter(bottleG, mat.solid({ color: 0x14261a, roughness: 0.35 }),
      bottles.length, (i, d, r) => {
        d.position.set(bottles[i][0], bottles[i][1], bottles[i][2]);
        d.rotation.z = Math.PI / 2;
        d.rotation.y = r.range(-0.06, 0.06);
      }, 44));

    // --- boiler + pipes ----------------------------------------------------------
    {
      const bx = 22, bz = -46;
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.2, 16), M.iron);
      drum.position.set(bx, Y + 1.6, bz); drum.castShadow = true; drum.userData.collide = false;
      B.vis.add(drum);
      px(B, 3.2, 3.2, 3.2, bx, Y + 1.6, bz);
      vbox(B, 1.0, 0.9, 0.1, bx, Y + 0.7, bz + 1.55, M.ember);   // fire door, glowing
      const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.0, 10), M.iron);
      flue.position.set(bx, Y + 4.2, bz - 0.6); flue.userData.collide = false; B.vis.add(flue);
      stow(B, props.pipes(16, 4, 0.11, M.iron), bx - 8, Y + 3.4, bz + 2.2);
      for (let i = 0; i < 5; i++)
        stow(B, props.barrel(0.35, 0.95, M.iron), bx - 4 + i * 1.2, Y, bz - 4.5, 0, 0.8, 0.95, 0.8);
    }

    // --- coal store, fed by the chute -------------------------------------------
    {
      const heapM = mat.solid({ color: 0x121214, roughness: 0.95, flat: true });
      stow(B, props.rubble(4.0, 26, heapM, 9), 28, Y, -57);
      px(B, 7, 1.2, 7, 28, Y + 0.6, -57);
      for (let i = 0; i < 4; i++)
        stow(B, props.crate(0.9, M.darkWood), 19 + i * 1.4, Y, -60 + (i % 2) * 1.6, 0, 0.9, 0.9, 0.9);
    }

    // --- the locked iron door ----------------------------------------------------
    {
      wallRun(B, -4, -30, 5, -30, Y, H, 0.5, M.brickCellar, [{ c: 4.5, w: 2.2, y0: 0, y1: 2.6 }]);
      // barred gate filling the opening — solid, and it is not opening tonight
      for (let i = 0; i < 7; i++)
        vbox(B, 0.07, 2.5, 0.07, -0.6 + i * 0.36, Y + 1.25, -30, M.iron);
      vbox(B, 2.3, 0.12, 0.12, 0.5, Y + 2.5, -30, M.iron);
      vbox(B, 2.3, 0.12, 0.12, 0.5, Y + 0.1, -30, M.iron);
      px(B, 2.3, 2.6, 0.3, 0.5, Y + 1.3, -30);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.16), M.brass);
      lock.position.set(1.3, Y + 1.2, -29.85); lock.userData.collide = false; B.vis.add(lock);
      vbox(B, 0.3, 0.3, 0.3, 0.5, Y + 0.5, -28.6, M.ember);      // something glowing beyond
    }

    // --- the secret stair from the library arrives here --------------------------
    stairZ(cellarB, -32.6, -30.8, -36, -46.5, Y_G, Y_CELLAR, M.stoneProp, 24);
    // shaft walls around the descent so you can't fall off the side
    wallRun(cellarB, -32.7, -36, -32.7, -46.5, Y_CELLAR, 4.6, 0.25, M.brickCellar, []);
    wallRun(cellarB, -30.7, -36, -30.7, -46.5, Y_CELLAR, 4.6, 0.25, M.brickCellar, []);

    // servants' back stairs, cellar → ground, both ends of the house
    stairZ(cellarB, -32.6, -30.6, -53, -58.6, Y, Y + 2.3, M.stoneProp, 12);
    slab(cellarB, -33, -27, -61, -58.6, Y + 2.3, M.stoneProp, 0.35);
    stairZ(cellarB, -30.0, -28.0, -61, -55.4, Y + 2.3, Y + 4.6, M.stoneProp, 12);
    stairZ(cellarB, 30.6, 32.6, -53, -58.6, Y, Y + 2.3, M.stoneProp, 12);
    slab(cellarB, 27, 33, -61, -58.6, Y + 2.3, M.stoneProp, 0.35);
    stairZ(cellarB, 28.0, 30.0, -61, -55.4, Y + 2.3, Y + 4.6, M.stoneProp, 12);

    // dressing: barrels, a stopped clock face, cobwebby corners
    for (let i = 0; i < 8; i++)
      stow(B, props.barrel(0.36, 0.95, M.darkWood),
        -28 + i * 1.3, Y, -31 + (i % 3) * 1.4, 0, 0.8, 0.95, 0.8);
    stow(B, props.shelfRack(2, 3, 2.2, 0.9, 1.2, M.darkWood), 6, Y, -34, 0, 4.6, 3.6, 1.2);
    stow(B, props.shelfRack(2, 3, 2.2, 0.9, 1.2, M.darkWood), 6, Y, -55, 0, 4.6, 3.6, 1.2);
  }

  // ---------------------------------------------------------------------------
  // H. Ground floor (y = 0)
  // ---------------------------------------------------------------------------
  const bookSlots = [];   // filled by shelfWall(), instanced at the end
  const candleSlots = []; // { x, y, z, h }
  const cobwebSlots = []; // { x, y, z, ry, s }
  const portraitSlots = [];
  let secretDoorRef = null, rockingHorseRef = null;

  /**
   * A run of fitted bookcases from (ax,az) to (bx,bz). `faceSign` says which
   * way the shelves open: +1 is +z for an east-west run, +x for a north-south
   * run. Books are pushed into bookSlots and instanced once at the very end.
   */
  function shelfWall(bank, ax, az, bx, bz, faceSign, h = 3.4) {
    const horiz = Math.abs(bx - ax) > Math.abs(bz - az);
    const len = horiz ? Math.abs(bx - ax) : Math.abs(bz - az);
    if (len < 0.4) return;
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const nx = horiz ? 0 : faceSign, nz = horiz ? faceSign : 0;
    const W = horiz ? len : 0.36, D = horiz ? 0.36 : len;
    vbox(bank, W, h, D, cx, h / 2, cz, M.walnut);
    px(bank, horiz ? len : 0.42, h, horiz ? 0.42 : len, cx, h / 2, cz);
    const shelves = 6;
    for (let s = 1; s <= shelves; s++) {
      const y = (h / (shelves + 1)) * s;
      vbox(bank, horiz ? len - 0.1 : 0.32, 0.05, horiz ? 0.32 : len - 0.1,
        cx + nx * 0.03, y, cz + nz * 0.03, M.walnut);
      const n = Math.floor(len / 0.078);
      for (let i = 0; i < n; i++) {
        if (rng.chance(0.14)) continue;
        const t = -len / 2 + 0.06 + i * 0.078;
        bookSlots.push([
          cx + (horiz ? t : nx * 0.07),
          y + 0.14,
          cz + (horiz ? nz * 0.07 : t),
          rng.range(0.2, 0.32), rng.int(0, 2), horiz ? 0 : Math.PI / 2,
        ]);
      }
    }
  }

  {
    const B = groundB, Y = Y_G, CH = CEIL_G;

    // --- floor slabs (hall left out — it gets a chequerboard) ----------------
    slab(B, -34, 34, -67, -47, Y, M.oak, 0.45);
    slab(B, -34, -32.6, -47, -24, Y, M.oak, 0.45);
    slab(B, -32.6, -30.8, -36, -24, Y, M.oak, 0.45);
    slab(B, -30.8, -12, -47, -24, Y, M.oak, 0.45);
    slab(B, 12, 34, -47, -24, Y, M.oak, 0.45);
    slab(B, -12, 12, -47, -24, Y - 0.06, M.marbleD, 0.45);

    // chequerboard marble, two instanced meshes
    {
      const tileG = new THREE.BoxGeometry(1.58, 0.06, 1.58);
      const lightP = [], darkP = [];
      for (let i = 0; i < 15; i++) for (let j = 0; j < 14; j++) {
        const x = -11.2 + i * 1.6, z = -46.2 + j * 1.6;
        ((i + j) % 2 ? darkP : lightP).push([x, z]);
      }
      for (const [arr, m] of [[lightP, M.marbleL], [darkP, M.marbleD]]) {
        ctx.addDecor(props.scatter(tileG, m, arr.length, (i, d) => {
          d.position.set(arr[i][0], -0.03, arr[i][1]);
        }, 21));
      }
    }

    // --- partitions ----------------------------------------------------------
    // hall side walls
    wallRun(B, -12.5, -47, -12.5, -24, Y, CH, IT, M.walnut, [{ c: 13, w: 2.2, y0: 0, y1: 3.0 }]);
    wallRun(B, 12.5, -47, 12.5, -24, Y, CH, IT, M.walnut, [{ c: 13, w: 2.2, y0: 0, y1: 3.0 }]);
    // hall rear wall (below the landing) with the arch to the corridor
    wallRun(B, -12.5, -47, 12.5, -47, Y, CH, IT, M.walnut, [{ c: 12.5, w: 3.2, y0: 0, y1: 3.2 }]);
    // service corridor walls
    // doors at x = -30 (west stair), -15 (dining), 0 (gallery), 14 (garden
    // room), 29 (east stair) — each clear of the partition lines
    wallRun(B, -34, -50, 34, -50, Y, CH, IT, M.plaster, [
      { c: 4, w: 1.6, y0: 0, y1: 2.3 }, { c: 19, w: 1.6, y0: 0, y1: 2.3 },
      { c: 34, w: 2.4, y0: 0, y1: 2.6 }, { c: 48, w: 1.6, y0: 0, y1: 2.3 },
      { c: 63, w: 1.6, y0: 0, y1: 2.3 }]);
    wallRun(B, -34, -47, -12.5, -47, Y, CH, IT, M.plaster, [{ c: 12, w: 1.6, y0: 0, y1: 2.3 }]);
    wallRun(B, 12.5, -47, 34, -47, Y, CH, IT, M.plaster, [{ c: 10, w: 1.6, y0: 0, y1: 2.3 }]);
    // rear band partitions
    wallRun(B, -27, -67, -27, -50, Y, CH, IT, M.plaster, [{ c: 9, w: 1.4, y0: 0, y1: 2.3 }]);
    wallRun(B, -12.5, -67, -12.5, -50, Y, CH, IT, M.paperOx, [{ c: 8, w: 2.2, y0: 0, y1: 2.8 }]);
    wallRun(B, 12.5, -67, 12.5, -50, Y, CH, IT, M.paperOx, [{ c: 8, w: 2.2, y0: 0, y1: 2.8 }]);
    wallRun(B, 27, -67, 27, -50, Y, CH, IT, M.plaster, [{ c: 9, w: 1.4, y0: 0, y1: 2.3 }]);
    // secret passage walls behind the library bookcases
    wallRun(B, -32.6, -47, -32.6, -26, Y, CH, 0.22, M.plaster, []);
    wallRun(B, -30.8, -47, -30.8, -26, Y, CH, 0.22, M.plaster, [{ c: 17, w: 1.7, y0: 0, y1: 2.4 }]);
    wallRun(B, -32.6, -26, -30.8, -26, Y, CH, 0.22, M.plaster, []);

    // --- ceilings (non-colliding; the slab above does the work) --------------
    const ceilAt = (x0, x1, z0, z1, m) => {
      vbox(B, x1 - x0, 0.08, z1 - z0, (x0 + x1) / 2, CH, (z0 + z1) / 2, m);
    };
    ceilAt(-34, -12.5, -47, -24, M.plaster);
    ceilAt(12.5, 34, -47, -24, M.plaster);
    ceilAt(-34, 34, -50, -47, M.plaster);
    ceilAt(-34, 34, -67, -50, M.plaster);
    for (const [cx, cz] of [[-22, -35], [23, -35], [-20, -58], [0, -58], [20, -58]]) {
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.16, 18), M.plaster);
      rose.position.set(cx, CH - 0.1, cz); rose.userData.collide = false; B.vis.add(rose);
    }

    // --- ENTRANCE HALL --------------------------------------------------------
    panelling(B, -12, 12, -47, -47, Y, 4.2, M.walnut, M.trim, 1);
    panelling(B, -12.3, -12.3, -47, -24, Y, 4.2, M.walnut, M.trim, 1);
    panelling(B, 12.3, 12.3, -47, -24, Y, 4.2, M.walnut, M.trim, -1);
    // grand split staircase
    stairZ(B, -5, 5, -38, -43, Y, 2.3, M.walnut, 12);
    slab(B, -11, 11, -46.5, -43, 2.3, M.walnut, 0.4);
    stairZ(B, -11, -7, -43, -38, 2.3, 4.6, M.walnut, 12);
    stairZ(B, 7, 11, -43, -38, 2.3, 4.6, M.walnut, 12);
    // newels + balustrade (instanced balusters collected here)
    const balusters = [];
    const addRail = (x0, z0, x1, z1, y0, y1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.round(len / 0.28));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        balusters.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t]);
      }
      const ry = -Math.atan2(z1 - z0, x1 - x0);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(len, y1 - y0), 0.1, 0.13), M.walnut);
      rail.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.98, (z0 + z1) / 2);
      rail.rotation.y = ry; rail.rotation.z = Math.atan2(y1 - y0, len);
      rail.castShadow = true; rail.userData.collide = false;
      B.vis.add(rail);
      px(B, len, 1.1, 0.2, (x0 + x1) / 2, (y0 + y1) / 2 + 0.55, (z0 + z1) / 2, ry);
    };
    addRail(-5.1, -38, -5.1, -43, 0, 2.3);
    addRail(5.1, -38, 5.1, -43, 0, 2.3);
    addRail(-6.9, -43, -6.9, -38, 2.3, 4.6);
    addRail(6.9, -43, 6.9, -38, 2.3, 4.6);
    addRail(-11, -43.1, -5, -43.1, 2.3, 2.3);
    addRail(5, -43.1, 11, -43.1, 2.3, 2.3);
    // landing balustrade at first-floor level
    addRail(-7, -38, 7, -38, 4.6, 4.6);
    addRail(-7, -38, -7, -26, 4.6, 4.6);
    addRail(7, -38, 7, -26, 4.6, 4.6);
    addRail(-7, -26, 7, -26, 4.6, 4.6);
    {
      const balG = new THREE.CylinderGeometry(0.045, 0.06, 0.95, 8);
      balG.translate(0, 0.475, 0);
      ctx.addDecor(props.scatter(balG, M.walnut, balusters.length, (i, d) => {
        d.position.set(balusters[i][0], balusters[i][1], balusters[i][2]);
      }, 23));
    }
    // columns carrying the landing
    for (const sx of [-9.5, 9.5]) for (const cz of [-27, -31.5, -36]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 4.15, 12), M.walnut);
      c.position.set(sx, 2.07, cz); c.castShadow = true; c.userData.collide = false;
      B.vis.add(c);
      px(B, 0.8, 4.15, 0.8, sx, 2.07, cz);
    }
    // inglenook fireplace on the west wall + DANIEL ABBADON above it
    {
      const fx = -11.9, fz = -30;
      vbox(B, 1.1, 4.6, 4.6, fx, 2.3, fz, M.stoneTrim);
      vbox(B, 1.3, 0.4, 3.4, fx - 0.2, 2.2, fz, M.stoneTrim);
      vbox(B, 0.9, 1.6, 2.2, fx - 0.35, 0.8, fz, mat.solid({ color: 0x0a0808, roughness: 1 }));
      px(B, 1.4, 4.6, 4.6, fx - 0.1, 2.3, fz);
      // embers
      vbox(B, 0.5, 0.3, 1.4, fx - 0.4, 0.2, fz, M.ember);
      candleSlots.push({ x: fx - 0.5, y: 2.45, z: fz - 1.2, h: 0.4 });
      candleSlots.push({ x: fx - 0.5, y: 2.45, z: fz + 1.2, h: 0.4 });
      portraitSlots.push({ x: fx - 0.62, y: 4.4, z: fz, ry: Math.PI / 2, w: 2.5, h: 3.4, label: 'DANIEL ABBADON' });
    }
    // hall furniture
    stow(B, props.table(2.4, 0.8, 0.9, M.walnut), 11.4, 0, -28, 0, 2.4, 0.8, 0.9);
    for (const s of [-1, 1]) stow(B, props.chair(M.walnut), s * 10.6, 0, -44.5, 0, 0.5, 0.9, 0.5);
    // a longcase clock, stopped
    vbox(B, 0.7, 2.4, 0.45, 11.6, 1.2, -41, M.walnut);
    px(B, 0.8, 2.4, 0.5, 11.6, 1.2, -41);
    {
      const face = mat.textMaterial('XII\n— XI:47 —', { color: 0x2b2419, background: 0xd8cfae, fontSize: 44 });
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5 / face.aspect), face.material);
      fm.position.set(11.35, 2.05, -41); fm.rotation.y = -Math.PI / 2;
      fm.userData.collide = false; B.vis.add(fm);
    }
    cobwebSlots.push({ x: -11.6, y: 4.0, z: -46.4, ry: 0.8, s: 1.6 });
    cobwebSlots.push({ x: 11.6, y: 4.0, z: -46.4, ry: -0.8, s: 1.6 });

    // --- LIBRARY (x -30.8..-12.5) ---------------------------------------------
    // west wall of bookcases, broken by the hinged one at z = -30
    shelfWall(B, -30.5, -46.2, -30.5, -32.2, 1);
    shelfWall(B, -30.5, -29.4, -30.5, -25.0, 1);
    // east wall, and two runs on the north wall either side of the door
    shelfWall(B, -13.1, -46.2, -13.1, -25.0, -1);
    shelfWall(B, -29.0, -46.5, -23.6, -46.5, 1);
    shelfWall(B, -20.4, -46.5, -14.0, -46.5, 1);
    roomTrim(B, -30.6, -12.8, -46.8, -24.2, Y, CH, M.trim);
    // rolling ladder
    {
      const lad = new THREE.Group();
      for (const s of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.4, 0.07), M.walnut);
        r.position.set(s * 0.28, 1.7, 0); r.userData.collide = false; lad.add(r);
      }
      for (let i = 0; i < 10; i++) {
        const rg = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.07), M.walnut);
        rg.position.set(0, 0.35 + i * 0.32, 0); rg.userData.collide = false; lad.add(rg);
      }
      lad.position.set(-29.6, 0, -38); lad.rotation.z = 0.16;
      lad.traverse(o => { o.castShadow = true; });
      B.vis.add(lad);
      px(B, 0.8, 3.4, 0.4, -29.6, 1.7, -38);
    }
    // reading desk + globe + a chair pushed back
    stow(B, props.table(2.6, 0.78, 1.3, M.walnut), -21, 0, -34, 0, 2.6, 0.78, 1.3);
    stow(B, props.chair(M.walnut), -21, 0, -32.4, 0, 0.5, 0.9, 0.5);
    {
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12),
        mat.solid({ color: 0x6b5a34, roughness: 0.7 }));
      globe.position.set(-24.5, 1.1, -40); globe.rotation.z = 0.4;
      globe.castShadow = true; globe.userData.collide = false; B.vis.add(globe);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 20), M.brass);
      ring.position.copy(globe.position); ring.rotation.y = 0.4;
      ring.userData.collide = false; B.vis.add(ring);
      for (const s of [-1, 1]) vbox(B, 0.07, 0.7, 0.07, -24.5 + s * 0.3, 0.35, -40, M.walnut);
      px(B, 1.1, 1.4, 1.1, -24.5, 0.7, -40);
    }
    candleSlots.push({ x: -21.8, y: 0.78, z: -34.4, h: 0.26 });
    candleSlots.push({ x: -20.2, y: 0.78, z: -33.6, h: 0.2 });
    // the SECRET BOOKCASE — hinged, standing ajar, no collider in the opening
    const secretDoor = new THREE.Group();
    {
      const leaf = new THREE.Group();
      const carcass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 1.7), M.walnut);
      carcass.position.set(0, 1.2, 0.85);
      carcass.castShadow = true; carcass.userData.collide = false;
      leaf.add(carcass);
      for (let s = 1; s <= 5; s++) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 1.6), M.walnut);
        sh.position.set(0.02, s * 0.4, 0.85); sh.userData.collide = false; leaf.add(sh);
        for (let i = 0; i < 20; i++) {
          if (rng.chance(0.2)) continue;
          const bk = new THREE.Mesh(new THREE.BoxGeometry(0.16, rng.range(0.2, 0.3), 0.06),
            [M.walnut, M.trim, M.darkWood][rng.int(0, 2)]);
          bk.position.set(0.05, s * 0.4 + 0.14, 0.1 + i * 0.078);
          bk.userData.collide = false; leaf.add(bk);
        }
      }
      secretDoor.add(leaf);
      secretDoor.position.set(-30.75, 0, -30.85);
      secretDoor.rotation.y = -0.85;
      ctx.addDecor(secretDoor);
      secretDoorRef = secretDoor;
      // candle burning in the passage beyond, so the sliver of light gives it away
      candleSlots.push({ x: -31.7, y: 0.9, z: -33, h: 0.32 });
      candleSlots.push({ x: -31.7, y: 0.9, z: -28, h: 0.24 });
    }
    // the passage's dead end, right at the south stop
    stow(B, props.chair(M.darkWood), -31.7, 0, -26.8, 0.4, 0.5, 0.9, 0.5);
    cobwebSlots.push({ x: -31.7, y: 3.6, z: -26.4, ry: 0, s: 1.4 });

    // --- DRAWING ROOM (x 12.5..34) ---------------------------------------------
    roomTrim(B, 12.8, 33.8, -46.8, -24.2, Y, CH, M.trim);
    for (const [ax, az, bx, bz] of [
      [12.8, -46.8, 12.8, -24.2], [33.8, -46.8, 33.8, -24.2]])
      wallRun(B, ax, az, bx, bz, Y, 3.2, 0.06, M.paperGreen, [], false);
    {
      const R = rng.fork('drawing');
      dustSheet(B, 2.4, 0.95, 1.1, 18, Y, -30, M.sheet, R);       // sofa
      dustSheet(B, 1.2, 1.0, 1.1, 22.5, Y, -28.5, M.sheet, R);    // armchair
      dustSheet(B, 1.2, 1.0, 1.1, 25.5, Y, -31.5, M.sheet, R);    // armchair
      dustSheet(B, 1.6, 0.8, 0.9, 30, Y, -43, M.sheet, R);        // side table
      // a grand piano with three keys pressed
      const pbody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 1.7),
        mat.solid({ color: 0x0e0c0c, roughness: 0.24, metalness: 0.1 }));
      pbody.position.set(22, 0.85, -41); pbody.castShadow = true; pbody.userData.collide = false;
      B.vis.add(pbody);
      for (const [dx, dz] of [[-1.1, -0.7], [1.1, -0.7], [0, 0.7]])
        vbox(B, 0.09, 0.68, 0.09, 22 + dx, 0.34, -41 + dz, M.darkWood);
      vbox(B, 1.5, 0.05, 0.24, 21.4, 1.05, -40.1, M.marbleL);
      for (let i = 0; i < 4; i++)
        vbox(B, 0.06, 0.05, 0.22, 21.0 + i * 0.24, 1.07, -40.1, M.marbleD);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 1.5),
        mat.solid({ color: 0x0e0c0c, roughness: 0.24, metalness: 0.1 }));
      lid.position.set(22.1, 1.35, -41.3); lid.rotation.z = 0.24;
      lid.castShadow = true; lid.userData.collide = false; B.vis.add(lid);
      px(B, 2.8, 1.3, 1.9, 22, 0.65, -41);
      candleSlots.push({ x: 21.4, y: 1.08, z: -41.6, h: 0.3 });
      candleSlots.push({ x: 22.6, y: 1.08, z: -41.6, h: 0.26 });
      // marble chimneypiece
      vbox(B, 0.5, 2.4, 2.6, 33.5, 1.2, -34, M.marbleL);
      vbox(B, 0.4, 1.6, 1.4, 33.35, 0.8, -34, mat.solid({ color: 0x0a0808, roughness: 1 }));
      px(B, 0.6, 2.4, 2.6, 33.5, 1.2, -34);
      portraitSlots.push({ x: 33.4, y: 3.9, z: -34, ry: -Math.PI / 2, w: 1.3, h: 1.7 });
    }

    // --- DINING ROOM (x -27..-12.5, z -67..-50) ---------------------------------
    roomTrim(B, -26.8, -12.8, -66.8, -50.2, Y, CH, M.trim);
    wallRun(B, -26.8, -66.8, -26.8, -50.2, Y, 3.2, 0.06, M.paperOx, [], false);
    wallRun(B, -12.8, -66.8, -12.8, -50.2, Y, 3.2, 0.06, M.paperOx, [], false);
    {
      const R = rng.fork('dining');
      dustSheet(B, 3.0, 0.82, 9.5, -20, Y, -58, M.sheet, R);   // the 12-seat table
      for (let i = 0; i < 6; i++) for (const s of [-1, 1])
        stow(B, props.chair(M.walnut), -20 + s * 2.2, 0, -62.4 + i * 1.75,
          s > 0 ? -Math.PI / 2 : Math.PI / 2, 0.5, 0.9, 0.5);
      dustSheet(B, 2.6, 1.7, 0.7, -25.4, Y, -54, M.sheet, R);  // sideboard
      for (let i = 0; i < 7; i++)
        candleSlots.push({ x: -20 + (i % 2 ? 0.45 : -0.45), y: 0.86, z: -62 + i * 1.4, h: 0.44 });
      cobwebSlots.push({ x: -26.4, y: 3.9, z: -66.2, ry: 0.7, s: 1.9 });
      // dead flowers in an urn
      const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.5, 10), M.stoneProp);
      urn.position.set(-25.4, 1.95, -54); urn.userData.collide = false; B.vis.add(urn);
      for (let i = 0; i < 9; i++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, R.range(0.4, 0.8), 0.02), M.leafDead);
        st.position.set(-25.4 + R.gauss(0, 0.1), 2.4, -54 + R.gauss(0, 0.1));
        st.rotation.set(R.range(-0.4, 0.4), 0, R.range(-0.4, 0.4));
        st.userData.collide = false; B.vis.add(st);
      }
    }

    // --- LONG GALLERY (x -12.5..12.5, z -67..-50) -------------------------------
    roomTrim(B, -12.3, 12.3, -66.8, -50.2, Y, CH, M.trim);
    wallRun(B, -12.3, -66.8, -12.3, -50.2, Y, 3.4, 0.06, M.paperGreen, [], false);
    wallRun(B, 12.3, -66.8, 12.3, -50.2, Y, 3.4, 0.06, M.paperGreen, [], false);
    for (let i = 0; i < 5; i++) {
      portraitSlots.push({ x: -12.1, y: 3.4, z: -64 + i * 3.3, ry: Math.PI / 2, w: 1.2, h: 1.6 });
      portraitSlots.push({ x: 12.1, y: 3.4, z: -64 + i * 3.3, ry: -Math.PI / 2, w: 1.2, h: 1.6 });
    }
    slab(B, -3, 3, -66.5, -50.5, Y + 0.02, M.carpetRed, 0.06, false);
    for (let i = 0; i < 4; i++) {
      candleSlots.push({ x: -11.5, y: 1.5, z: -63 + i * 4, h: 0.34 });
      candleSlots.push({ x: 11.5, y: 1.5, z: -63 + i * 4, h: 0.34 });
    }

    // --- GARDEN ROOM (x 12.5..27) -----------------------------------------------
    roomTrim(B, 12.8, 26.8, -66.8, -50.2, Y, CH, M.trim);
    for (let i = 0; i < 5; i++) {
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.7, 10), M.brickGarden);
      tub.position.set(14.5 + i * 2.6, 0.35, -52.5); tub.castShadow = true;
      tub.userData.collide = false; B.vis.add(tub);
      const bushM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), M.leafDead);
      bushM.position.set(14.5 + i * 2.6, 1.1, -52.5); bushM.userData.collide = false; B.vis.add(bushM);
      px(B, 1.1, 1.6, 1.1, 14.5 + i * 2.6, 0.8, -52.5);
    }
    stow(B, props.table(1.8, 0.75, 0.9, M.darkWood), 20, 0, -60, 0, 1.8, 0.75, 0.9);

    // --- SERVICE CORRIDOR (z -50..-47) ------------------------------------------
    slab(B, -34, 34, -50, -47, Y + 0.02, M.carpetRed, 0.06, false);
    for (let i = 0; i < 9; i++)
      candleSlots.push({ x: -30 + i * 7.6, y: 1.6, z: -49.85, h: 0.3 });
    // muddy footprints leading from the rear door to the cellar stair
    {
      const stepM = mat.solid({ color: 0x2b2116, roughness: 1 });
      const fp = new THREE.BoxGeometry(0.28, 0.012, 0.42);
      const pts = [];
      for (let i = 0; i < 26; i++)
        pts.push([28 - i * 1.5, -48.5 + (i % 2 ? 0.32 : -0.32)]);
      ctx.addDecor(props.scatter(fp, stepM, pts.length, (i, d, r) => {
        d.position.set(pts[i][0], 0.055, pts[i][1]);
        d.rotation.y = r.range(-0.25, 0.25) + Math.PI / 2;
        d.scale.setScalar(1 - i * 0.02);
      }, 61));
    }

    // --- servants' back stairs, ground → first ----------------------------------
    stairZ(B, -32.6, -30.6, -53, -58.6, Y, Y + 2.3, M.darkWood, 12);
    slab(B, -33, -27, -61, -58.6, Y + 2.3, M.darkWood, 0.35);
    stairZ(B, -30.0, -28.0, -61, -55.4, Y + 2.3, Y + 4.6, M.darkWood, 12);
    stairZ(B, 30.6, 32.6, -53, -58.6, Y, Y + 2.3, M.darkWood, 12);
    slab(B, 27, 33, -61, -58.6, Y + 2.3, M.darkWood, 0.35);
    stairZ(B, 28.0, 30.0, -61, -55.4, Y + 2.3, Y + 4.6, M.darkWood, 12);
    // stair-shaft partitions
    wallRun(B, -27, -67, -27, -50, Y + 4.6, 4.6, IT, M.plaster, [], false);
    wallRun(B, 27, -67, 27, -50, Y + 4.6, 4.6, IT, M.plaster, [], false);
  }

  // ---------------------------------------------------------------------------
  // I. First floor (y = 4.6)
  // ---------------------------------------------------------------------------
  {
    const B = firstB, Y = Y_1, CH = 4.15, CEILY = Y + 4.12;

    // --- slabs (hall void + stairwell left open) -----------------------------
    slab(B, -34, 34, -67, -47, Y, M.oak, 0.45);       // rear band + corridor
    slab(B, -34, -12.5, -47, -24, Y, M.oak, 0.45);    // west front band
    slab(B, 12.5, 34, -47, -24, Y, M.oak, 0.45);      // east front band
    slab(B, -12.5, -7, -38, -24, Y, M.oak, 0.45);     // landing, west strip
    slab(B, 7, 12.5, -38, -24, Y, M.oak, 0.45);       // landing, east strip
    slab(B, -7, 7, -26, -24, Y, M.oak, 0.45);         // landing, front strip

    // --- partitions ------------------------------------------------------------
    // hall side walls continue up as the landing balustrade wall
    wallRun(B, -12.5, -47, -12.5, -24, Y, CH, IT, M.paperBlue, [{ c: 17, w: 1.5, y0: 0, y1: 2.3 }]);
    wallRun(B, 12.5, -47, 12.5, -24, Y, CH, IT, M.paperBlue, [{ c: 17, w: 1.5, y0: 0, y1: 2.3 }]);
    wallRun(B, -12.5, -47, 12.5, -47, Y, CH, IT, M.paperBlue, []);
    // bedroom corridors
    wallRun(B, -16, -47, -16, -24, Y, CH, IT, M.paperBlue, [
      { c: 5, w: 1.1, y0: 0, y1: 2.2 }, { c: 16, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, 16, -47, 16, -24, Y, CH, IT, M.paperBlue, [
      { c: 6, w: 1.1, y0: 0, y1: 2.2 }, { c: 17, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, -34, -37, -16, -37, Y, CH, IT, M.paperBlue, []);
    wallRun(B, 16, -36, 34, -36, Y, CH, IT, M.paperBlue, []);
    // corridor walls
    // x = -30 (west stair), -26 (linen), -13 (bedroom C), 7 (bedroom D),
    // 18 and 26 (servants' rooms), 31 (east stair)
    wallRun(B, -34, -50, 34, -50, Y, CH, IT, M.plaster, [
      { c: 4, w: 1.1, y0: 0, y1: 2.2 }, { c: 8, w: 1.1, y0: 0, y1: 2.2 },
      { c: 21, w: 1.1, y0: 0, y1: 2.2 }, { c: 41, w: 1.1, y0: 0, y1: 2.2 },
      { c: 52, w: 1.1, y0: 0, y1: 2.2 }, { c: 60, w: 1.1, y0: 0, y1: 2.2 },
      { c: 65, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, -34, -47, -12.5, -47, Y, CH, IT, M.plaster, [{ c: 19.5, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, 12.5, -47, 34, -47, Y, CH, IT, M.plaster, [{ c: 2, w: 1.1, y0: 0, y1: 2.2 }]);
    // rear-band partitions
    wallRun(B, -27, -67, -27, -50, Y, CH, IT, M.plaster, [{ c: 4, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, -27, -58, -15, -58, Y, CH, IT, M.paperBlue, [{ c: 6, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, -15, -67, -15, -50, Y, CH, IT, M.paperBlue, [{ c: 4, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, -1, -67, -1, -50, Y, CH, IT, M.paperBlue, [{ c: 4, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, 13, -67, 13, -50, Y, CH, IT, M.plaster, [{ c: 4, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, 20, -67, 20, -50, Y, CH, IT, M.plaster, [{ c: 4, w: 1.1, y0: 0, y1: 2.2 }]);
    wallRun(B, 27, -67, 27, -50, Y, CH, IT, M.plaster, [{ c: 4, w: 1.1, y0: 0, y1: 2.2 }]);

    // --- ceilings ---------------------------------------------------------------
    vbox(B, 68, 0.08, 20, 0, CEILY, -57, M.plaster);
    vbox(B, 21.5, 0.08, 23, -23.25, CEILY, -35.5, M.plaster);
    vbox(B, 21.5, 0.08, 23, 23.25, CEILY, -35.5, M.plaster);
    vbox(B, 25, 0.08, 3, 0, CEILY, -48.5, M.plaster);

    // --- BEDROOMS ---------------------------------------------------------------
    const RB = rng.fork('bedrooms');
    const bedrooms = [
      [-25, -42], [-25, -30.5], [25, -41.5], [-8, -58], [6, -58],
    ];
    for (const [bx, bz] of bedrooms) {
      // four-poster
      const bw = 2.0, bd = 2.4;
      dustSheet(B, bw, 0.62, bd, bx, Y, bz, M.sheet, RB);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        vbox(B, 0.11, 2.6, 0.11, bx + sx * (bw / 2 - 0.1), Y + 1.3, bz + sz * (bd / 2 - 0.1), M.walnut);
      }
      vbox(B, bw, 0.14, bd, bx, Y + 2.62, bz, M.walnut);
      for (const sx of [-1, 1]) {
        const drape = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, bd * 0.9), M.curtain);
        drape.position.set(bx + sx * (bw / 2 - 0.06), Y + 1.42, bz);
        drape.castShadow = true; drape.userData.collide = false; B.vis.add(drape);
      }
      px(B, bw + 0.3, 2.7, bd + 0.3, bx, Y + 1.35, bz);
      // dresser + a mirror gone black
      const dx = bx + RB.range(-4.5, 4.5), dz = bz + RB.range(-4, 4);
      vbox(B, 1.5, 1.0, 0.6, dx, Y + 0.5, dz, M.walnut);
      px(B, 1.5, 1.0, 0.6, dx, Y + 0.5, dz);
      const mir = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 0.05),
        mat.solid({ color: 0x14161c, roughness: 0.12, metalness: 0.8 }));
      mir.position.set(dx, Y + 1.7, dz - 0.24); mir.userData.collide = false; B.vis.add(mir);
      vbox(B, 1.14, 1.44, 0.05, dx, Y + 1.7, dz - 0.3, M.gold);
      // wardrobe — a classic place to hide
      const wx = bx + (bx < 0 ? -6.5 : 6.5);
      vbox(B, 1.7, 2.3, 0.75, wx, Y + 1.15, bz - 2.6, M.walnut);
      px(B, 1.7, 2.3, 0.2, wx, Y + 1.15, bz - 2.95);
      px(B, 0.2, 2.3, 0.75, wx - 0.75, Y + 1.15, bz - 2.6);
      px(B, 0.2, 2.3, 0.75, wx + 0.75, Y + 1.15, bz - 2.6);
      px(B, 1.7, 0.2, 0.75, wx, Y + 2.2, bz - 2.6);
      ctx.hidingSpot(wx, Y, bz - 2.6, 1.0, 1.0);
      candleSlots.push({ x: dx - 0.4, y: Y + 1.0, z: dz, h: 0.3 });
      if (Math.abs(bx) > 20)
        portraitSlots.push({ x: bx < 0 ? -33.7 : 33.7, y: Y + 3.1, z: bz,
          ry: bx < 0 ? Math.PI / 2 : -Math.PI / 2, w: 1.0, h: 1.35 });
      roomTrim(B, bx - 7, bx + 7, bz - 5, bz + 5, Y, CH, M.trim);
    }

    // --- NURSERY (x -27..-15, z -67..-58) — quietly wrong ----------------------
    const rockingHorse = new THREE.Group();
    {
      const nx = -21, nz = -62.5;
      roomTrim(B, -26.8, -15.2, -66.8, -58.2, Y, CH, M.trim);
      wallRun(B, -26.8, -66.8, -26.8, -58.2, Y, 3.0, 0.06, M.paperBlue, [], false);
      // rocking horse
      const rock = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 20, Math.PI), M.darkWood);
      rock.rotation.z = Math.PI; rock.position.set(0, 0.75, 0);
      rock.userData.collide = false; rockingHorse.add(rock);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.35),
        mat.solid({ color: 0xc9bda6, roughness: 0.8 }));
      body.position.set(0, 1.05, 0); body.castShadow = true;
      body.userData.collide = false; rockingHorse.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.28),
        mat.solid({ color: 0xc9bda6, roughness: 0.8 }));
      head.position.set(0.6, 1.4, 0); head.rotation.z = -0.35;
      head.castShadow = true; head.userData.collide = false; rockingHorse.add(head);
      rockingHorse.position.set(nx + 2.5, Y, nz + 2);
      ctx.addDecor(rockingHorse);
      rockingHorseRef = rockingHorse;
      px(B, 1.6, 1.6, 0.8, nx + 2.5, Y + 0.8, nz + 2);
      // the dollhouse — a scale model of Abbadon Manor, and something is inside
      const dh = nx - 3.2, dz2 = nz - 2.4;
      vbox(B, 1.6, 0.7, 1.6, dh, Y + 0.35, dz2, M.darkWood);
      vbox(B, 1.4, 1.5, 1.1, dh, Y + 1.45, dz2, M.brickGarden);
      for (const s of [-1, 1]) {
        const rf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.85), M.slate);
        rf.position.set(dh, Y + 2.4, dz2 + s * 0.3); rf.rotation.x = s * 0.62;
        rf.castShadow = true; rf.userData.collide = false; B.vis.add(rf);
      }
      for (let i = 0; i < 6; i++) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02), M.lampGlow);
        w.position.set(dh - 0.5 + (i % 3) * 0.5, Y + 1.1 + ((i / 3) | 0) * 0.55, dz2 + 0.56);
        w.userData.collide = false; B.vis.add(w);
      }
      px(B, 1.8, 2.6, 1.8, dh, Y + 1.3, dz2);
      // a rank of dolls, all facing the door
      for (let i = 0; i < 9; i++) {
        const dxx = nx - 5 + i * 1.1;
        const d1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.34, 7), M.curtain);
        d1.position.set(dxx, Y + 0.17, nz + 4.0); d1.userData.collide = false; B.vis.add(d1);
        const d2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6),
          mat.solid({ color: 0xe4dbc8, roughness: 0.7 }));
        d2.position.set(dxx, Y + 0.4, nz + 4.0); d2.userData.collide = false; B.vis.add(d2);
      }
      candleSlots.push({ x: nx, y: Y + 1.0, z: nz + 3.6, h: 0.24 });
      cobwebSlots.push({ x: -26.4, y: Y + 3.7, z: -66.2, ry: 0.7, s: 1.5 });
    }

    // --- LINEN STORE (x -27..-15, z -58..-50) ------------------------------------
    for (let i = 0; i < 3; i++) {
      const sx = -25 + i * 4;
      for (let l = 0; l < 4; l++) vbox(B, 3.4, 0.06, 1.0, sx, Y + 0.6 + l * 0.6, -54, M.darkWood);
      px(B, 3.4, 2.5, 1.0, sx, Y + 1.25, -54);
      const RL = rng.fork('linen' + i);
      for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++)
        dustSheet(B, 0.7, 0.34, 0.8, sx - 1.3 + k * 0.85, Y + 0.63 + l * 0.6, -54, M.sheet, RL);
    }
    ctx.hidingSpot(-21, Y, -56, 1.4, 1.0);

    // --- BATHROOM (x 16..34, z -36..-24) -----------------------------------------
    {
      slab(B, 16.2, 33.8, -35.8, -24.2, Y + 0.02, M.flag, 0.06, false);
      roomTrim(B, 16.2, 33.8, -35.8, -24.2, Y, CH, M.trim);
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.72, 0.75, 16),
        mat.solid({ color: 0xd6d2c6, roughness: 0.24 }));
      tub.scale.set(1, 1, 1.9); tub.position.set(26, Y + 0.55, -30);
      tub.castShadow = true; tub.userData.collide = false; B.vis.add(tub);
      for (const [fx, fz] of [[-0.6, -1.1], [0.6, -1.1], [-0.6, 1.1], [0.6, 1.1]]) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), M.brass);
        f.position.set(26 + fx, Y + 0.16, -30 + fz); f.userData.collide = false; B.vis.add(f);
      }
      px(B, 1.9, 1.0, 3.4, 26, Y + 0.5, -30);
      ctx.hidingSpot(26, Y, -30, 1.1, 0.75);
      vbox(B, 1.0, 0.9, 0.6, 32.5, Y + 0.45, -26, M.marbleL);   // washstand
      px(B, 1.0, 0.9, 0.6, 32.5, Y + 0.45, -26);
      candleSlots.push({ x: 32.5, y: Y + 0.92, z: -26, h: 0.3 });
      cobwebSlots.push({ x: 33.4, y: Y + 3.7, z: -35.2, ry: -0.7, s: 1.3 });
    }

    // --- SERVANTS' ROOMS (x 13..27) — three cells off the corridor ---------------
    for (const sx of [16.5, 23.5]) {
      dustSheet(B, 1.0, 0.5, 2.0, sx, Y, -62, M.sheet, rng.fork('cell' + sx));
      vbox(B, 0.7, 1.6, 0.5, sx + 1.4, Y + 0.8, -65, M.darkWood);
      px(B, 0.7, 1.6, 0.5, sx + 1.4, Y + 0.8, -65);
      candleSlots.push({ x: sx - 1.2, y: Y + 0.9, z: -65.5, h: 0.22 });
    }

    // --- landing dressing ---------------------------------------------------------
    slab(B, -12.3, -7.2, -38, -24.3, Y + 0.02, M.carpetRed, 0.06, false);
    slab(B, 7.2, 12.3, -38, -24.3, Y + 0.02, M.carpetRed, 0.06, false);
    for (let i = 0; i < 3; i++) {
      portraitSlots.push({ x: -12.3, y: Y + 3.0, z: -34 + i * 4, ry: Math.PI / 2, w: 1.0, h: 1.35 });
      portraitSlots.push({ x: 12.3, y: Y + 3.0, z: -34 + i * 4, ry: -Math.PI / 2, w: 1.0, h: 1.35 });
    }
    for (let i = 0; i < 6; i++)
      candleSlots.push({ x: i < 3 ? -12.1 : 12.1, y: Y + 1.7, z: -36 + (i % 3) * 5, h: 0.34 });

    // --- servants' back stairs, first → attic --------------------------------------
    stairZ(B, -32.6, -30.6, -53, -58.6, Y, Y + 2.3, M.darkWood, 12);
    slab(B, -33, -27, -61, -58.6, Y + 2.3, M.darkWood, 0.35);
    stairZ(B, -30.0, -28.0, -61, -55.4, Y + 2.3, Y + 4.6, M.darkWood, 12);
    stairZ(B, 30.6, 32.6, -53, -58.6, Y, Y + 2.3, M.darkWood, 12);
    slab(B, 27, 33, -61, -58.6, Y + 2.3, M.darkWood, 0.35);
    stairZ(B, 28.0, 30.0, -61, -55.4, Y + 2.3, Y + 4.6, M.darkWood, 12);
    for (let i = 0; i < 4; i++) {
      candleSlots.push({ x: -33.4 + 0.6, y: Y + 1.3 + i * 0.9, z: -54 - i * 1.6, h: 0.2 });
      candleSlots.push({ x: 33.4 - 0.6, y: Y + 1.3 + i * 0.9, z: -54 - i * 1.6, h: 0.2 });
    }
  }

  // ---------------------------------------------------------------------------
  // J. Attic (y = 9.2) and the roof
  // ---------------------------------------------------------------------------
  const RIDGE_F_Z = -34.8, RIDGE_R_Z = -56.2, RIDGE_Y = 17.4;
  const VAL_Z0 = -47, VAL_Z1 = -44;

  /** Sloped roof plane: visual slate + a walkable collision plate. */
  function roofPlane(bank, x0, x1, z0, z1, y0, y1, thick, material, collide = true) {
    const dz = z1 - z0, dy = y1 - y0;
    const len = Math.hypot(dz, dy);
    const a = Math.atan2(-dy, dz);
    const cz = (z0 + z1) / 2 - (thick / 2) * Math.sin(a);
    const cy = (y0 + y1) / 2 - (thick / 2) * Math.cos(a);
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, thick, len), material);
    m.position.set((x0 + x1) / 2, cy, cz);
    m.rotation.x = a;
    m.castShadow = true; m.receiveShadow = true; m.userData.collide = false;
    bank.vis.add(m);
    if (collide) {
      const p = new THREE.Mesh(UNIT, PXM);
      p.scale.set(x1 - x0, thick, len);
      p.position.set((x0 + x1) / 2, cy, cz);
      p.rotation.x = a;
      p.visible = false; p.userData.collide = true;
      bank.col.add(p);
    }
  }

  {
    const B = atticB, Y = Y_A;
    slab(B, -34, 34, -67, -24, Y, M.atticBoard, 0.45);

    // knee walls
    wallRun(B, -32.4, -65.4, -32.4, -25.6, Y, Y_EAVE - Y, 0.3, M.plaster, [], true);
    wallRun(B, 32.4, -65.4, 32.4, -25.6, Y, Y_EAVE - Y, 0.3, M.plaster, [], true);
    wallRun(B, -32.4, -25.6, 32.4, -25.6, Y, Y_EAVE - Y, 0.3, M.plaster, [], true);
    wallRun(B, -32.4, -65.4, 32.4, -65.4, Y, Y_EAVE - Y, 0.3, M.plaster, [], true);
    // the two attic ranges are divided by the valley
    wallRun(B, -32.4, VAL_Z1, 32.4, VAL_Z1, Y, Y_EAVE - Y + 0.4, 0.3, M.plaster,
      [{ c: 32.4, w: 3.6, y0: 0, y1: 1.7 }], true);
    wallRun(B, -32.4, VAL_Z0, 32.4, VAL_Z0, Y, Y_EAVE - Y + 0.4, 0.3, M.plaster,
      [{ c: 32.4, w: 3.6, y0: 0, y1: 1.7 }], true);
    // a few board partitions make it a warren rather than a shed
    wallRun(B, -18, -65.4, -18, -52, Y, 2.6, 0.16, M.atticBoard, [{ c: 6, w: 1.1, y0: 0, y1: 2.1 }]);
    wallRun(B, 14, -65.4, 14, -52, Y, 2.6, 0.16, M.atticBoard, [{ c: 5, w: 1.1, y0: 0, y1: 2.1 }]);
    wallRun(B, -24, -40, -24, -25.6, Y, 2.6, 0.16, M.atticBoard, [{ c: 7, w: 1.1, y0: 0, y1: 2.1 }]);
    wallRun(B, 22, -40, 22, -25.6, Y, 2.6, 0.16, M.atticBoard, [{ c: 7, w: 1.1, y0: 0, y1: 2.1 }]);

    // rafters, purlins and collars — instanced, one draw call
    {
      const raft = [];
      const push = (z0, z1, y0, y1, x) => {
        const len = Math.hypot(z1 - z0, y1 - y0);
        raft.push([x, (y0 + y1) / 2, (z0 + z1) / 2, len, Math.atan2(-(y1 - y0), z1 - z0)]);
      };
      for (let x = -31; x <= 31; x += 1.55) {
        push(-25.6, RIDGE_F_Z, Y_EAVE, RIDGE_Y, x);
        push(RIDGE_F_Z, VAL_Z1, RIDGE_Y, Y_EAVE, x);
        push(VAL_Z0, RIDGE_R_Z, Y_EAVE, RIDGE_Y, x);
        push(RIDGE_R_Z, -65.4, RIDGE_Y, Y_EAVE, x);
      }
      const rg = new THREE.BoxGeometry(0.11, 0.2, 1);
      ctx.addDecor(props.scatter(rg, M.atticBoard, raft.length, (i, d) => {
        const r = raft[i];
        d.position.set(r[0], r[1], r[2]);
        d.rotation.x = r[4];
        d.scale.set(1, 1, r[3]);
      }, 88));
      // collar ties
      for (let x = -30; x <= 30; x += 3.1) {
        vbox(B, 0.1, 0.16, 7.6, x, 14.6, RIDGE_F_Z, M.atticBoard);
        vbox(B, 0.1, 0.16, 7.6, x, 14.6, RIDGE_R_Z, M.atticBoard);
      }
    }

    // attic clutter
    {
      const RA = rng.fork('attic');
      for (let i = 0; i < 16; i++) {
        const tx = RA.range(-30, 30), tz = RA.range(-64, -26);
        if (Math.abs(tz + 45.5) < 3.5) continue;
        const w = RA.range(0.8, 1.5), h = RA.range(0.5, 0.8), d = RA.range(0.5, 0.9);
        vbox(B, w, h, d, tx, Y + h / 2, tz, M.darkWood, RA.range(0, 3));
        vbox(B, w * 1.05, 0.06, d * 1.05, tx, Y + h, tz, M.iron, RA.range(0, 3));
        px(B, w, h, d, tx, Y + h / 2, tz);
        if (RA.chance(0.4)) dustSheet(B, w + 0.3, h + 0.15, d + 0.3, tx, Y, tz, M.sheet, RA);
      }
      // dressmaker's dummy
      const dm = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.75, 12),
        mat.solid({ color: 0xb5a68c, roughness: 0.9 }));
      torso.position.y = 1.1; torso.castShadow = true; torso.userData.collide = false; dm.add(torso);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), M.darkWood);
      post.position.y = 0.38; post.userData.collide = false; dm.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10), M.darkWood);
      foot.position.y = 0.03; foot.userData.collide = false; dm.add(foot);
      dm.position.set(-8, Y, -30);
      ctx.addDecor(dm);
      px(B, 0.6, 1.6, 0.6, -8, Y + 0.8, -30);
      // broken telescope pointing at nothing
      const tel = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.5, 12), M.brass);
      tube.rotation.z = 0.9; tube.position.set(0, 1.3, 0);
      tube.castShadow = true; tube.userData.collide = false; tel.add(tube);
      for (let i = 0; i < 3; i++) {
        const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), M.darkWood);
        lg.position.set(Math.cos(i * 2.1) * 0.3, 0.65, Math.sin(i * 2.1) * 0.3);
        lg.rotation.set(Math.sin(i * 2.1) * 0.4, 0, -Math.cos(i * 2.1) * 0.4);
        lg.userData.collide = false; tel.add(lg);
      }
      tel.position.set(9, Y, -29);
      ctx.addDecor(tel);
      px(B, 0.9, 1.6, 0.9, 9, Y, -29);
      cobwebSlots.push({ x: -31.8, y: Y + 1.3, z: -30, ry: 0, s: 2.0 });
      cobwebSlots.push({ x: 31.8, y: Y + 1.3, z: -60, ry: Math.PI, s: 2.0 });
      cobwebSlots.push({ x: 0, y: 13.6, z: RIDGE_F_Z, ry: 0.4, s: 2.4 });
      candleSlots.push({ x: -2, y: Y + 0.0, z: -38, h: 0.3 });
      candleSlots.push({ x: 12, y: Y + 0.0, z: -60, h: 0.24 });
    }

    // stair up through the hatch into the leaded valley
    stairZ(B, -1.5, 1.5, -42, -45.3, Y, Y_EAVE, M.atticBoard, 10);
    // servants' stairs terminate on the attic landing
    slab(B, -33, -27, -61, -58.6, Y, M.atticBoard, 0.35, false);
    slab(B, 27, 33, -61, -58.6, Y, M.atticBoard, 0.35, false);
  }

  // ---- the roof --------------------------------------------------------------
  {
    const B = roofB;
    // parapet walls on the perimeter, with the deck inside them
    for (const [ax, az, bx, bz] of [
      [MX0, MZ1, MX1, MZ1], [MX0, MZ0, MX1, MZ0], [MX0, MZ0, MX0, MZ1], [MX1, MZ0, MX1, MZ1]]) {
      wallRun(B, ax, az, bx, bz, Y_EAVE, Y_PARAPET - Y_EAVE, WT, M.ashlar, []);
      const len = Math.hypot(bx - ax, bz - az);
      const ry = -Math.atan2(bz - az, bx - ax);
      vbox(B, len, 0.24, WT + 0.4, (ax + bx) / 2, Y_PARAPET + 0.12, (az + bz) / 2, M.stoneTrim, ry);
    }
    // perimeter deck + leaded valley
    slab(B, MX0, MX1, -25.6, MZ1 + 0.5, Y_EAVE, M.lead, 0.35);
    slab(B, MX0, MX1, MZ0 - 0.5, -65.4, Y_EAVE, M.lead, 0.35);
    slab(B, MX0, -32.4, -65.4, -25.6, Y_EAVE, M.lead, 0.35);
    slab(B, 32.4, MX1, -65.4, -25.6, Y_EAVE, M.lead, 0.35);
    slab(B, -32.4, -1.8, VAL_Z0, VAL_Z1, Y_EAVE, M.lead, 0.35);
    slab(B, 1.8, 32.4, VAL_Z0, VAL_Z1, Y_EAVE, M.lead, 0.35);
    slab(B, -1.8, 1.8, VAL_Z0, -46.0, Y_EAVE, M.lead, 0.35);
    slab(B, -1.8, 1.8, -44.6, VAL_Z1, Y_EAVE, M.lead, 0.35);
    // a low kerb around the open hatch so you don't step straight in
    for (const s of [-1, 1]) vbox(B, 0.16, 0.3, 1.4, s * 1.9, Y_EAVE + 0.15, -45.3, M.lead);

    // the four roof slopes
    roofPlane(B, -32.4, 32.4, -25.6, RIDGE_F_Z, Y_EAVE, RIDGE_Y, 0.4, M.slate);
    roofPlane(B, -32.4, 32.4, RIDGE_F_Z, VAL_Z1, RIDGE_Y, Y_EAVE, 0.4, M.slate);
    roofPlane(B, -32.4, 32.4, VAL_Z0, RIDGE_R_Z, Y_EAVE, RIDGE_Y, 0.4, M.slate);
    roofPlane(B, -32.4, 32.4, RIDGE_R_Z, -65.4, RIDGE_Y, Y_EAVE, 0.4, M.slate);
    // ridge caps
    vbox(B, 64.8, 0.35, 0.7, 0, RIDGE_Y + 0.16, RIDGE_F_Z, M.lead);
    vbox(B, 64.8, 0.35, 0.7, 0, RIDGE_Y + 0.16, RIDGE_R_Z, M.lead);

    // gable ends
    for (const [zA, zB, zR] of [[-25.6, VAL_Z1, RIDGE_F_Z], [VAL_Z0, -65.4, RIDGE_R_Z]]) {
      for (const sx of [-32.4, 32.4]) {
        const sh = new THREE.Shape();
        sh.moveTo(zA, Y_EAVE); sh.lineTo(zB, Y_EAVE); sh.lineTo(zR, RIDGE_Y); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false });
        const m = new THREE.Mesh(g, M.ashlar);
        m.rotation.y = -Math.PI / 2;
        m.position.set(sx + (sx < 0 ? 0.25 : -0.25), 0, 0);
        m.castShadow = true; m.receiveShadow = true; m.userData.collide = false;
        B.vis.add(m);
        px(B, 0.6, RIDGE_Y - Y_EAVE, Math.abs(zB - zA), sx, (Y_EAVE + RIDGE_Y) / 2, (zA + zB) / 2);
      }
    }

    // the stepped climb out of the valley, up the north pitch to the ridge
    const WW_Y = RIDGE_Y + 0.35;          // walk deck sits directly on the ridge
    const WW_Z0 = -36.3, WW_Z1 = -33.3;
    stairZ(B, -1.6, 1.6, VAL_Z1, WW_Z0, Y_EAVE, WW_Y, M.lead, 30);
    // the widow's walk itself: a leaded promenade along the flat of the ridge
    slab(B, -12, 12, WW_Z0, WW_Z1, WW_Y, M.lead, 0.35);
    for (const [ax, az, bx, bz, gap] of [
      [-12, WW_Z0, 12, WW_Z0, true], [-12, WW_Z1, 12, WW_Z1, false],
      [-12, WW_Z0, -12, WW_Z1, false], [12, WW_Z0, 12, WW_Z1, false]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const ry = -Math.atan2(bz - az, bx - ax);
      const cxm = (ax + bx) / 2, czm = (az + bz) / 2;
      vbox(B, len, 0.08, 0.08, cxm, WW_Y + 1.1, czm, M.iron, ry);
      vbox(B, len, 0.06, 0.06, cxm, WW_Y + 0.62, czm, M.iron, ry);
      const n = Math.max(2, Math.round(len / 0.85));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const bxp = ax + (bx - ax) * t, bzp = az + (bz - az) * t;
        if (gap && Math.abs(bxp) < 2.0) continue;
        vbox(B, 0.05, 1.1, 0.05, bxp, WW_Y + 0.55, bzp, M.iron);
      }
      // collision: leave the stair mouth open
      if (gap) {
        px(B, 10, 1.1, 0.2, -7, WW_Y + 0.55, czm, ry);
        px(B, 10, 1.1, 0.2, 7, WW_Y + 0.55, czm, ry);
      } else {
        px(B, len, 1.1, 0.2, cxm, WW_Y + 0.55, czm, ry);
      }
    }

    // chimney stacks
    for (const [cx, cz] of [[-24, RIDGE_F_Z], [24, RIDGE_F_Z], [-18, RIDGE_R_Z], [0, RIDGE_R_Z], [18, RIDGE_R_Z]]) {
      sbox(B, 2.6, 8.4, 1.6, cx, 13.4, cz, M.brickGarden);
      vbox(B, 3.0, 0.35, 2.0, cx, 17.75, cz, M.stoneTrim);
      for (let i = 0; i < 3; i++) {
        const potM = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.9, 10), M.brickGarden);
        potM.position.set(cx - 0.8 + i * 0.8, 18.35, cz);
        potM.castShadow = true; potM.userData.collide = false; B.vis.add(potM);
      }
    }

    // dormers on the south slope, glowing faintly
    for (const dx of [-24, -12, 0, 12, 24]) {
      const dz = -28.6;
      const dy = Y_EAVE + (RIDGE_Y - Y_EAVE) * ((dz + 25.6) / (RIDGE_F_Z + 25.6));
      vbox(B, 2.0, 1.9, 1.9, dx, dy + 0.4, dz, M.ashlar);
      vbox(B, 1.4, 1.2, 0.06, dx, dy + 0.5, dz + 0.98, M.lampGlow);
      for (const s of [-1, 1]) {
        const rf = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, 1.5), M.slate);
        rf.position.set(dx + s * 0.55, dy + 1.7, dz - 0.15); rf.rotation.z = s * 0.75;
        rf.castShadow = true; rf.userData.collide = false; B.vis.add(rf);
      }
      px(B, 2.2, 2.4, 2.0, dx, dy + 0.6, dz);
    }

    // gargoyles at the parapet — instanced
    {
      const gpos = [];
      for (const x of [-34, -20, -6, 6, 20, 34]) { gpos.push([x, MZ1 + 0.4, 0]); gpos.push([x, MZ0 - 0.4, Math.PI]); }
      for (const z of [-30, -40, -50, -60]) { gpos.push([MX0 - 0.4, z, -Math.PI / 2]); gpos.push([MX1 + 0.4, z, Math.PI / 2]); }
      const gg = new THREE.ConeGeometry(0.3, 1.3, 5);
      gg.rotateX(Math.PI / 2);
      ctx.addDecor(props.scatter(gg, M.stoneProp, gpos.length, (i, d, r) => {
        d.position.set(gpos[i][0], Y_PARAPET - 0.35, gpos[i][1]);
        d.rotation.y = gpos[i][2];
        d.rotation.x = r.range(-0.12, 0.12);
      }, 71));
    }

    // loose slates for silhouette on the south pitch
    {
      const sg = new THREE.BoxGeometry(0.42, 0.04, 0.3);
      const ang = Math.atan2(-(RIDGE_Y - Y_EAVE), RIDGE_F_Z + 25.6);
      ctx.addDecor(props.scatter(sg, M.slate, 900, (i, d, r) => {
        const t = r();
        const z = -25.6 + (RIDGE_F_Z + 25.6) * t;
        const y = Y_EAVE + (RIDGE_Y - Y_EAVE) * t + 0.22;
        d.position.set(r.range(-32, 32), y, z);
        d.rotation.x = ang + r.range(-0.05, 0.05);
        d.rotation.y = r.range(-0.05, 0.05);
      }, 73));
    }
  }

  // ---------------------------------------------------------------------------
  // L. Detail pass — candles, chandelier, cobwebs, portraits, curtains, mist
  // ---------------------------------------------------------------------------

  // hall ceiling + its rose (the hall is double height, so it belongs up here)
  vbox(atticB, 25, 0.1, 23, 0, 8.70, -35.5, M.plaster);
  {
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.22, 22), M.plaster);
    rose.position.set(0, 8.55, -32); rose.userData.collide = false; atticB.vis.add(rose);
  }

  // --- the chandelier ---------------------------------------------------------
  const chandelier = new THREE.Group();
  {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 5), M.iron);
    chain.position.y = -0.8; chain.userData.collide = false; chandelier.add(chain);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), M.brass);
    hub.position.y = -1.7; hub.castShadow = true; hub.userData.collide = false; chandelier.add(hub);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 26), M.brass);
    ring.rotation.x = Math.PI / 2; ring.position.y = -1.9;
    ring.castShadow = true; ring.userData.collide = false; chandelier.add(ring);
    const flames = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const ax = Math.cos(a) * 1.15, az = Math.sin(a) * 1.15;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 5), M.brass);
      arm.position.set(ax * 0.5, -1.78, az * 0.5);
      arm.rotation.z = -Math.atan2(ax, 0.22) * 0.35;
      arm.userData.collide = false; chandelier.add(arm);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.07, 8), M.brass);
      cup.position.set(ax, -1.82, az); cup.userData.collide = false; chandelier.add(cup);
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.34, 7), M.candleWax);
      wax.position.set(ax, -1.62, az); wax.userData.collide = false; chandelier.add(wax);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 6), M.flame);
      fl.position.set(ax, -1.36, az); fl.userData.collide = false; chandelier.add(fl);
      flames.push(fl);
    }
    // crystal drops
    for (let i = 0; i < 26; i++) {
      const a = rng() * 6.28, r = rng.range(0.5, 1.2);
      const dr = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), M.glass);
      dr.position.set(Math.cos(a) * r, -2.1 - rng.range(0, 0.5), Math.sin(a) * r);
      dr.userData.collide = false; chandelier.add(dr);
    }
    chandelier.position.set(0, 8.5, -32);
    ctx.addDecor(chandelier);
    chandelier.userData.flames = flames;
  }

  // --- instanced candles + flames --------------------------------------------
  {
    const waxG = new THREE.CylinderGeometry(0.032, 0.04, 1, 7);
    waxG.translate(0, 0.5, 0);
    ctx.addDecor(props.scatter(waxG, M.candleWax, candleSlots.length, (i, d, r) => {
      const c = candleSlots[i];
      d.position.set(c.x, c.y, c.z);
      d.scale.set(1, c.h, 1);
      d.rotation.y = r() * 6.28;
    }, 121));
    const flG = new THREE.ConeGeometry(0.04, 0.15, 6);
    flG.translate(0, 0.075, 0);
    const flameInst = props.scatter(flG, M.flame, candleSlots.length, (i, d, r) => {
      const c = candleSlots[i];
      d.position.set(c.x, c.y + c.h + 0.01, c.z);
      d.scale.setScalar(r.range(0.8, 1.3));
    }, 122);
    flameInst.castShadow = false;
    ctx.addDecor(flameInst);
    // a candelabrum or two, taller than the rest
    for (const [cx, cy, cz] of [[-21, 0.78, -35.4], [22, 1.08, -40.4], [-20, 0.86, -55]]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.14, 0.5, 8), M.brass);
      st.position.set(cx, cy + 0.25, cz); st.userData.collide = false; groundB.vis.add(st);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * 6.28;
        const arm = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 5, 10, Math.PI), M.brass);
        arm.position.set(cx + Math.cos(a) * 0.07, cy + 0.55, cz + Math.sin(a) * 0.07);
        arm.rotation.set(0, -a, 0); arm.userData.collide = false; groundB.vis.add(arm);
        candleSlots.push({ x: cx + Math.cos(a) * 0.2, y: cy + 0.55, z: cz + Math.sin(a) * 0.2, h: 0.3 });
      }
    }
  }

  // --- cobwebs ---------------------------------------------------------------
  {
    const webBank = new THREE.Group();
    for (const w of cobwebSlots) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w.s, w.s), webMat);
      q.position.set(w.x, w.y, w.z);
      q.rotation.set(-Math.PI / 4, w.ry, 0);
      q.userData.collide = false;
      webBank.add(q);
    }
    // scatter a few more into every ceiling corner of the main rooms
    const RW = rng.fork('webs');
    for (let i = 0; i < 40; i++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(RW.range(0.8, 1.8), RW.range(0.8, 1.8)), webMat);
      const floor = RW.pick([0.0, 4.6, 9.2, -4.6]);
      q.position.set(RW.range(-32, 32), floor + (floor === 9.2 ? 2.2 : 3.7), RW.range(-66, -25));
      q.rotation.set(-Math.PI / 4, RW.range(0, 6.28), 0);
      q.userData.collide = false;
      webBank.add(q);
    }
    const frozenWebs = props.freeze(webBank);
    frozenWebs.traverse(o => { o.castShadow = false; });
    ctx.addDecor(frozenWebs);
  }

  // --- portraits --------------------------------------------------------------
  {
    const frames = [];
    portraitSlots.forEach((p, i) => {
      const canvasMat = portraitCanvas(ctx, i, p.label || null);
      const cv = new THREE.Mesh(new THREE.PlaneGeometry(p.w * 0.86, p.h * 0.86), canvasMat);
      cv.position.set(p.x + Math.sin(p.ry) * 0.07, p.y - p.h / 2, p.z + Math.cos(p.ry) * 0.07);
      cv.rotation.y = p.ry;
      cv.userData.collide = false;
      ctx.addDecor(cv);
      frames.push([p.x, p.y - p.h / 2, p.z, p.ry, p.w, p.h]);
      if (p.label) {
        const np = mat.textMaterial(p.label, { color: 0x120e08, background: 0xa5854a, fontSize: 40 });
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1 / np.aspect), np.material);
        plate.position.set(p.x + Math.sin(p.ry) * 0.1, p.y - p.h - 0.22, p.z + Math.cos(p.ry) * 0.1);
        plate.rotation.y = p.ry;
        plate.userData.collide = false;
        ctx.addDecor(plate);
      }
    });
    // instanced gilt frames — one draw call for all fourteen
    const fg = new THREE.BoxGeometry(1, 1, 0.09);
    ctx.addDecor(props.scatter(fg, M.gold, frames.length * 4, (i, d) => {
      const f = frames[(i / 4) | 0], k = i % 4;
      const [fx, fy, fz, ry, w, h] = f;
      const nx = Math.sin(ry) * 0.04, nz = Math.cos(ry) * 0.04;
      const ox = [0, 0, -w / 2, w / 2][k], oy = [h / 2, -h / 2, 0, 0][k];
      const sw = [w + 0.16, w + 0.16, 0.16, 0.16][k], sh = [0.16, 0.16, h, h][k];
      d.position.set(fx + nx + Math.cos(ry) * ox, fy + oy, fz + nz - Math.sin(ry) * ox);
      d.rotation.y = ry;
      d.scale.set(sw, sh, 1);
    }, 131));
  }

  // --- curtains, one pair per ground-floor front window; one breathing --------
  const breathingCurtains = [];
  {
    for (const w of winSpots) {
      if (w.sill !== WIN_G.y0) continue;
      if (rng.chance(0.35)) continue;
      const inward = -0.62;   // negative = into the room
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(0.85, w.h + 0.5, 3, 4), M.curtain);
        const gpos = c.geometry.attributes.position;
        for (let i = 0; i < gpos.count; i++)
          gpos.setZ(i, Math.sin(gpos.getX(i) * 7 + gpos.getY(i)) * 0.05);
        c.geometry.computeVertexNormals();
        c.material.side = THREE.DoubleSide;
        const ox = Math.cos(w.ry) * s * 1.25, oz = -Math.sin(w.ry) * s * 1.25;
        c.position.set(w.x + ox + Math.sin(w.ry) * inward, w.sill + w.h / 2 - 0.18, w.z + oz + Math.cos(w.ry) * inward);
        c.rotation.y = w.ry;
        c.castShadow = true; c.userData.collide = false;
        (rng.chance(0.12) ? (breathingCurtains.push(c), ctx.addDecor(c)) : shellB.vis.add(c));
      }
      // pelmet
      vbox(shellB, winW + 1.3, 0.28, 0.22,
        w.x + Math.sin(w.ry) * inward, w.sill + w.h + 0.22, w.z + Math.cos(w.ry) * inward, M.curtain, w.ry);
    }
    if (!breathingCurtains.length) {
      // guarantee at least one open window with a curtain that stirs
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.2, 3, 4), M.curtain);
      c.material.side = THREE.DoubleSide;
      c.position.set(-8.0, 2.4, MZ1 - 0.5);
      c.castShadow = true; c.userData.collide = false;
      ctx.addDecor(c);
      breathingCurtains.push(c);
    }
  }

  // --- moonbeams and dust motes ------------------------------------------------
  {
    const beams = new THREE.Group();
    for (const w of winSpots) {
      if (w.z !== MZ1) continue;                 // only the moonlit south front
      if (Math.abs(w.x) > 27) continue;
      const len = 9;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(winW * 1.15, w.h * 1.1, len), shaftMat);
      beam.position.set(w.x + 1.6, w.sill + w.h / 2 - 1.4, w.z - len / 2 + 0.4);
      beam.rotation.x = 0.30; beam.rotation.y = -0.16;
      beam.userData.collide = false;
      beams.add(beam);
    }
    ctx.addDecor(beams);
    // motes
    const moteG = new THREE.PlaneGeometry(0.035, 0.035);
    const moteM = mat.emissive(0xcfe0ff, 1.5, { transparent: true, opacity: 0.55 });
    moteM.depthWrite = false;
    const motes = props.scatter(moteG, moteM, 900, (i, d, r) => {
      d.position.set(r.range(-30, 30), r.range(0.3, 8.4), r.range(-66, -25));
      d.rotation.set(r() * 3, r() * 3, r() * 3);
    }, 141);
    motes.castShadow = false;
    ctx.addDecor(motes);
    // ground mist outside
    const mistGroup = new THREE.Group();
    const RM = rng.fork('mist');
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(RM.range(26, 52), RM.range(7, 13)), mistMat);
      m.position.set(RM.range(-85, 85), RM.range(0.4, 2.4), RM.range(-20, 80));
      m.rotation.y = RM.range(0, 6.28);
      m.userData.collide = false;
      m.userData.drift = RM.range(0.15, 0.5) * (RM.chance(0.5) ? 1 : -1);
      mistGroup.add(m);
    }
    ctx.addDecor(mistGroup);

    ctx.onUpdate((dt, t) => {
      motes.rotation.y = t * 0.006;
      motes.position.y = Math.sin(t * 0.13) * 0.35;
      for (const m of mistGroup.children) {
        m.position.x += m.userData.drift * dt;
        if (m.position.x > 92) m.position.x = -92;
        if (m.position.x < -92) m.position.x = 92;
        m.position.y = 1.2 + Math.sin(t * 0.11 + m.position.z * 0.05) * 0.7;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // M. Gameplay placement
  // ---------------------------------------------------------------------------
  const COINS = [
    // ground floor
    [0, 1.0, -28], [-6, 1.0, -45], [6, 1.0, -45], [-20, 1.0, -30], [-28, 1.0, -44],
    [20, 1.0, -28], [30, 1.0, -44], [-20, 1.0, -54], [-24, 1.0, -64], [0, 1.0, -54],
    [0, 1.0, -64], [20, 1.0, -64], [-10, 1.0, -48.5], [16, 1.0, -48.5],
    // cellar
    [-28, -3.6, -58], [-20, -3.6, -34], [-6, -3.6, -46], [8, -3.6, -58],
    [22, -3.6, -36], [28, -3.6, -50],
    // first floor
    [-25, 5.6, -42], [-25, 5.6, -30], [25, 5.6, -41], [26, 5.6, -30],
    [-8, 5.6, -58], [6, 5.6, -58], [20, 5.6, -62], [-10, 5.6, -30], [10, 5.6, -48.5],
    // attic
    [-20, 10.2, -30], [14, 10.2, -32], [-10, 10.2, -60], [20, 10.2, -58],
    // roof
    [0, 11.8, -24.4], [-33.5, 11.8, -45], [33.5, 11.8, -60], [-8, 18.15, -34.8],
    // gardens
    [-40, 1.0, 20], [58, 1.0, -45], [CHAPEL_X, 1.0, CHAPEL_Z + 4], [-54, 1.0, 38],
    // maze
    [43.5, 1.0, 13.5], [42, 1.0, 42],
  ];
  for (const c of COINS) ctx.pickup(c[0], c[1], c[2], 'coin');

  const BATTERIES = [
    [22, -3.6, -49], [-21, 1.0, -34], [0, 10.2, -45], [-54, 1.0, 33],
    [-2, 1.0, -48.5], [KG_X0 + 18, 1.0, KG_Z1 - 4],
  ];
  for (const b of BATTERIES) ctx.pickup(b[0], b[1], b[2], 'battery');

  ctx.pickup(-31.7, 1.0, -26.9, 'powerup:ghost');        // secret passage dead end
  ctx.pickup(-24, -3.6, -40, 'powerup:nightvision');     // wine vault
  ctx.pickup(42, 1.2, 43.5, 'powerup:dash');             // heart of the maze
  ctx.pickup(8, 18.15, -34.8, 'powerup:silence');         // widow's walk

  // the dog, inside the nursery dollhouse
  ctx.pickup(-24.2, 5.95, -64.9, 'pup');

  // hiding spots (wardrobes, linen and the bathtub were registered inline)
  const HIDES = [
    [-20, 0, -58, 1.8, 1.0],        // under the 12-seat dining table
    [-31.7, 0, -30, 1.0, 1.0],      // the secret passage
    [-31.7, 0, -40, 1.2, 1.0],      // the secret stair
    [-30, 0, -48.5, 1.2, 0.9],      // west end of the servants' corridor
    [30, 0, -48.5, 1.2, 0.9],       // east end
    [-30.5, 2.3, -60, 1.2, 0.9],    // west back-stair half landing
    [30.5, 2.3, -60, 1.2, 0.9],     // east back-stair half landing
    [-26, -4.6, -58, 1.6, 1.0],     // wine vault
    [-6, -4.6, -34, 1.6, 1.0],      // north vault
    [28, -4.6, -57, 1.8, 1.0],      // the coal heap
    [22, -4.6, -52, 1.4, 0.9],      // behind the boiler
    [-11.9, 0, -30, 1.1, 0.8],      // the inglenook
    [18, 0, -30, 1.3, 0.8],         // behind the sheeted sofa
    [-8, 9.2, -30, 1.4, 0.9],       // attic, behind the dummy
    [20, 9.2, -58, 1.6, 1.0],       // attic trunks
    [-21, 4.6, -66, 1.4, 0.9],      // nursery corner
    [LAKE_X + 2, 0, LAKE_Z - LAKE_R - 2.5, 2.0, 1.0],   // the boathouse
    [42, 0, 40, 1.6, 0.85],         // the folly
    [CONS_X0 + 7, 0, CONS_Z0 + 4, 1.6, 0.8],            // the conservatory
    [KG_X0 + 11, 0, KG_Z1 - 4.5, 1.6, 0.85],            // a greenhouse
    [CHAPEL_X, 0, CHAPEL_Z + 6, 1.6, 0.8],              // the chapel pews
  ];
  for (const h of HIDES) ctx.hidingSpot(h[0], h[1], h[2], h[3], h[4]);
  for (let i = 0; i < Math.min(5, mazeDeadEnds.length); i++)
    ctx.hidingSpot(mazeDeadEnds[i][0], 0, mazeDeadEnds[i][1], 1.3, 1.0);
  if (mazeDeadEnds.length > 5)
    ctx.pickup(mazeDeadEnds[5][0], 1.0, mazeDeadEnds[5][1], 'coin');

  // ---------------------------------------------------------------------------
  // N. Motion
  // ---------------------------------------------------------------------------
  {
    const flameBase = M.flame.emissiveIntensity;
    const curtainBase = breathingCurtains.map(c => c.rotation.x);
    ctx.onUpdate((dt, t) => {
      // candle + chandelier flicker
      const f = 1 + Math.sin(t * 11.3) * 0.10 + Math.sin(t * 27.7) * 0.06 + Math.sin(t * 4.1) * 0.05;
      M.flame.emissiveIntensity = flameBase * f;
      // the chandelier turns very slowly and breathes
      chandelier.rotation.z = Math.sin(t * 0.42) * 0.014;
      chandelier.rotation.x = Math.cos(t * 0.33) * 0.011;
      chandelier.rotation.y = t * 0.02;
      // real lights flicker out of phase
      for (const w of warmPoints)
        w.l.intensity = w.base * (0.86 + 0.14 * Math.sin(t * w.sp + w.ph) + 0.05 * Math.sin(t * w.sp * 3.7));
      // curtains breathe at the open window
      breathingCurtains.forEach((c, i) => {
        c.rotation.x = curtainBase[i] + Math.sin(t * 0.9 + i) * 0.12;
        c.scale.x = 1 + Math.sin(t * 1.3 + i) * 0.09;
      });
      // the rocking horse rocks, on its own
      if (rockingHorseRef) {
        const gate = Math.max(0, Math.sin(t * 0.11));
        rockingHorseRef.rotation.z = Math.sin(t * 1.9) * 0.10 * gate;
        rockingHorseRef.position.y = Y_1 + Math.abs(Math.sin(t * 1.9)) * 0.03 * gate;
      }
      // the bookcase swings a little wider now and then, and creaks
      if (secretDoorRef)
        secretDoorRef.rotation.y = -0.85 + Math.sin(t * 0.17) * 0.22;
      // water
      M.water.userData.tick?.(dt);
    });
  }

  // ---------------------------------------------------------------------------
  // O. Bake — one merged mesh per material per floor, plus invisible collision
  // ---------------------------------------------------------------------------
  for (const bank of [ext, shellB, cellarB, groundB, firstB, atticB, roofB]) {
    ctx.addDecor(props.freeze(bank.vis));
    ctx.addSolid(bank.col);
  }
  {
    const g = props.freeze(glassB.vis);
    g.traverse(o => { o.castShadow = false; });
    ctx.addDecor(g);
  }

  // instanced books, last, so every shelf in the house is one draw call
  if (bookSlots.length) {
    const bookG = new THREE.BoxGeometry(0.06, 1, 0.19);
    bookG.translate(0, 0.5, 0);
    const bookMats = [
      mat.solid({ color: 0x4a1d1a, roughness: 0.9 }),
      mat.solid({ color: 0x1d3324, roughness: 0.9 }),
      mat.solid({ color: 0x3a2c18, roughness: 0.9 }),
    ];
    for (let k = 0; k < 3; k++) {
      const subset = bookSlots.filter(b => b[4] === k);
      if (!subset.length) continue;
      ctx.addDecor(props.scatter(bookG, bookMats[k], subset.length, (i, d, r) => {
        const b = subset[i];
        d.position.set(b[0], b[1] - 0.14, b[2]);
        d.rotation.y = b[5] + (r.chance(0.05) ? r.range(0.1, 0.3) : 0);
        d.scale.set(r.range(0.8, 1.25), b[3], 1);
      }, 150 + k));
    }
  }
}
