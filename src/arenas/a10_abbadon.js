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
  spawn: [0, 0.0, -6],          // gravel forecourt, manor's front door due north
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
const CX0 = -30, CX1 = 30, CZ0 = -64, CZ1 = -27;

// Hedge maze.
const MAZE_N = 20, MAZE_CELL = 3.0, MAZE_X0 = 12, MAZE_Z0 = 12;
const HEDGE_H = 2.6, HEDGE_T = 0.95;

// Gardens.
const LAKE_X = -56, LAKE_Z = 56, LAKE_R = 17;
const CHAPEL_X = -60, CHAPEL_Z = -40;
const KG_X0 = 44, KG_X1 = 82, KG_Z0 = -62, KG_Z1 = -24;   // walled kitchen garden
const CONS_X0 = 35, CONS_X1 = 50, CONS_Z0 = -60, CONS_Z1 = -44; // conservatory wing
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
    oak: mat.surface('wood', { color: 0x4c3420, repeat: 16, planks: 9, size: 512 }),
    atticBoard: mat.surface('wood', { color: 0x6a5638, repeat: 22, planks: 12, size: 256 }),
    flag: mat.surface('tile', { color: 0x4b4741, grout: 0x24211e, tiles: 5, rough: 0.85, repeat: 12, size: 512 }),
    carpetRed: mat.surface('carpet', { color: 0x5c1f26, repeat: 8, size: 256 }),
    paperGreen: mat.surface('wallpaper', { color: 0x1d3126, motif: 0x8e7c46, rep: 5, repeat: 5, size: 512 }),
    paperOx: mat.surface('wallpaper', { color: 0x3d1418, motif: 0x7d5f36, rep: 6, repeat: 5, size: 512 }),
    paperBlue: mat.surface('wallpaper', { color: 0x25313d, motif: 0x6d7a86, rep: 4, repeat: 5, size: 512 }),
    walnut: mat.surface('wood', { color: 0x2e1d13, repeat: 3, planks: 4, size: 512 }),
    plaster: mat.surface('plaster', { color: 0xc4b9a3, repeat: 5, size: 512 }),
    brickCellar: mat.surface('brick', { color: 0x5c3a2c, mortar: 0x6d665c, rows: 9, repeat: 7, size: 512 }),
    ashlar: mat.surface('rock', { color: 0x565258, repeat: 12, size: 512 }),
    stoneTrim: mat.surface('rock', { color: 0x6e6a70, repeat: 2, size: 256 }),
    grass: mat.surface('grass', { color: 0x2b3c21, dry: 0x4c4829, repeat: 90, size: 512 }),
    gravel: mat.surface('dirt', { color: 0x6f665a, repeat: 55, size: 512 }),
    soil: mat.surface('dirt', { color: 0x372a1c, repeat: 26, size: 256 }),
    slate: mat.surface('tile', { color: 0x323942, grout: 0x1b1f25, tiles: 14, rough: 0.6, repeat: 9, size: 512 }),
    brickGarden: mat.surface('brick', { color: 0x6a3b2a, mortar: 0x7a736a, rows: 12, repeat: 16, size: 512 }),
    sheet: mat.surface('fabric', { color: 0xcbc5b7, repeat: 2, size: 256 }),
    curtain: mat.surface('fabric', { color: 0x46141e, repeat: 2, size: 256 }),
    lead: mat.surface('metalPanel', { color: 0x50575e, panels: 3, rough: 0.55, repeat: 6, size: 256 }),
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
  pt(20, 3.1, -56, 0xbfd6b0, 5, 14);            // garden room
  pt(0, 2.9, -48.5, 0xffa24e, 6, 18);           // service corridor
  pt(-30.5, 1.6, -55, 0xff9c46, 5, 12);         // west back stair
  pt(30.5, 6.2, -55, 0xff9c46, 5, 12);          // east back stair
  pt(-18, -3.0, -40, 0xff8c3a, 6, 14);          // cellar wine vault
  pt(22, -3.1, -46, 0xff5f22, 7, 13);           // cellar boiler
  pt(25, 6.9, -41, 0xffbe86, 6, 14);            // master bedroom
  pt(0, 11.2, -45, 0xffb877, 5, 16);            // attic
  pt(42, 3.4, -46, 0xd8b98a, 5, 15);            // conservatory wing
  pt(CHAPEL_X, 3.0, CHAPEL_Z, 0xffc07a, 6, 16); // chapel
  pt(-54, 2.0, 40, 0xffa860, 5, 13);            // boathouse
  pt(0, 3.2, -10, 0xffcf96, 5, 14);             // forecourt lantern
  pt(42, 2.6, 42, 0xffb768, 6, 15);             // maze folly

  // ---------------------------------------------------------------------------
  // C. Ground plane, estate perimeter, woods
  // ---------------------------------------------------------------------------
  const groundMesh = props.ground(230, 210, M.grass, { segs: 1 });
  groundMesh.position.set(0, -0.02, 0);
  groundMesh.receiveShadow = true;
  ctx.addSolid(groundMesh);

  const ext = newBank();          // gardens + everything outdoors at ground level
  const glassB = newBank();       // all transparent glazing (no shadow casting)

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
      ctx.addDecor(props.rubble(3.2, 12, M.glassDirty, 7))
        .position.set(gx + 6, 0.02, gz + 3.6);
    }
    // cold frames and a water butt
    for (let i = 0; i < 4; i++) sbox(ext, 1.8, 0.5, 1.2, KG_X0 + 34, 0.25, KG_Z0 + 6 + i * 3.4, M.darkWood);
    ctx.add(props.barrel(0.6, 1.5, M.darkWood)).position.set(KG_X0 + 2.5, 0, KG_Z1 - 2.5);
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
    // shelving ring so the player can always walk out again
    const segs = 20;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const ox = LAKE_X + Math.cos(am) * (LAKE_R - 2.0);
      const oz = LAKE_Z + Math.sin(am) * (LAKE_R - 2.0);
      const seg = new THREE.Mesh(UNIT, PXM);
      const w = (2 * Math.PI * LAKE_R) / segs + 1.2;
      seg.scale.set(w, 0.6, 4.6);
      seg.position.set(ox, -0.55, oz);
      seg.rotation.y = -am + Math.PI / 2;
      seg.rotation.x = 0.24;
      seg.visible = false; seg.userData.collide = true;
      ext.col.add(seg);
    }
    // lake bed
    const bed = new THREE.Mesh(new THREE.CircleGeometry(LAKE_R - 1.6, 26), M.soil);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(LAKE_X, -1.1, LAKE_Z);
    bed.receiveShadow = true; bed.userData.collide = true;
    ctx.add(bed);
    // water surface
    const surf = new THREE.Mesh(new THREE.CircleGeometry(LAKE_R, 34), M.water);
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(LAKE_X, -0.28, LAKE_Z);
    surf.userData.collide = false;
    ctx.addDecor(surf);
    // reed fringe
    const reed = props.billboardCross(0.4, 1.5);
    ctx.addDecor(props.scatter(reed, grassBlade, 700, (i, d, r) => {
      const a = r() * 6.28, rr = LAKE_R + r.range(-2.2, 1.6);
      d.position.set(LAKE_X + Math.cos(a) * rr, -0.3, LAKE_Z + Math.sin(a) * rr);
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
    // jetty out over the water
    slab(ext, bx - 1.6, bx + 1.6, bz + 5, bz + 13, 0.35, M.darkWood, 0.25);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1])
      vbox(ext, 0.22, 1.6, 0.22, bx + s * 1.4, -0.5, bz + 6 + i * 1.7, M.darkWood);
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
    boat.position.set(bx + 3.4, -0.42, bz + 9);
    boat.rotation.y = 0.4;
    ctx.addDecor(boat);
    px(ext, 2.0, 0.9, 4.4, bx + 3.4, -0.1, bz + 9, 0.4);
  }

  // @@TAIL@@
