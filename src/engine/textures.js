// Procedural PBR texture foundry.
//
// Everything in this game is generated at runtime — there are no image files to
// download, which keeps the repo self-contained and lets every arena request an
// arbitrary tint/scale without shipping a new texture. Each generator returns a
// { map, normalMap, roughnessMap, aoMap } set of THREE.CanvasTexture.
//
// The normal map is derived from a height buffer with a Sobel filter, so bumps
// line up exactly with the albedo detail that produced them.

import * as THREE from 'three';
import { makeNoise, makeRNG } from './rng.js';

const CACHE = new Map();
let RENDERER = null;
export function setTextureRenderer(r) { RENDERER = r; }

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(cnv, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(cnv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = RENDERER ? Math.min(aniso, RENDERER.capabilities.getMaxAnisotropy()) : aniso;
  t.needsUpdate = true;
  return t;
}

/** Sobel a float height array (size*size, 0..1) into a tangent-space normal map. */
function heightToNormal(height, size, strength = 2.0) {
  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

/** Pack a float array (0..1) into a greyscale canvas — used for roughness/AO. */
function floatToCanvas(arr, size) {
  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, arr[i] * 255)) | 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

function rgbCanvas(rgb, size) {
  const cnv = canvas(size);
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = rgb[i * 3] * 255;
    img.data[i * 4 + 1] = rgb[i * 3 + 1] * 255;
    img.data[i * 4 + 2] = rgb[i * 3 + 2] * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

// ---------------------------------------------------------------------------
// Generators. Each fills three parallel buffers: colour (rgb), height, rough.
// ---------------------------------------------------------------------------

const GEN = {};

/** Poured concrete: broad blotches, aggregate speckle, hairline cracks. */
GEN.concrete = (size, o, N, R) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x8f8d88);
  const s = 6 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const blotch = N.fbm(x * s, y * s, 5) * 0.5 + 0.5;
    const grain = N.fbm(x * s * 14, y * s * 14, 3) * 0.5 + 0.5;
    const cell = N.worley(x * s * 0.9, y * s * 0.9, 4);
    const crack = Math.pow(1 - Math.min(1, (cell.f2 - cell.f1) * 4), 8);
    const stain = Math.pow(N.fbm(x * s * 0.4 + 11, y * s * 0.4, 4) * 0.5 + 0.5, 3);
    let v = 0.78 + blotch * 0.22 + grain * 0.1 - stain * 0.28 - crack * 0.35;
    v = Math.max(0.15, Math.min(1.3, v));
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v;
    h[i] = blotch * 0.4 + grain * 0.25 - crack * 0.9;
    rough[i] = 0.86 + grain * 0.12 - stain * 0.1;
  }
  return { rgb, h, rough, normalStrength: 1.6 };
};

/** Painted plaster / drywall — the Backrooms wall. Subtle, slightly dirty. */
GEN.plaster = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0xd9c98c);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const wide = N.fbm(x * s * 0.3, y * s * 0.3, 4) * 0.5 + 0.5;
    const fine = N.fbm(x * s * 20, y * s * 20, 2) * 0.5 + 0.5;
    const streak = N.fbm(x * s * 0.15, y * s * 3.0, 3) * 0.5 + 0.5;
    const damp = Math.pow(N.fbm(x * s * 0.25 + 40, y * s * 0.25, 4) * 0.5 + 0.5, 4);
    let v = 0.88 + wide * 0.14 + fine * 0.06 - streak * 0.08 - damp * 0.45;
    v = Math.max(0.2, v);
    rgb[i * 3] = base[0] * v;
    rgb[i * 3 + 1] = base[1] * v * (1 - damp * 0.15);
    rgb[i * 3 + 2] = base[2] * v * (1 - damp * 0.3);
    h[i] = wide * 0.3 + fine * 0.5;
    rough[i] = 0.9 + fine * 0.08 - damp * 0.25;
  }
  return { rgb, h, rough, normalStrength: 0.7 };
};

/** Cheap commercial loop carpet — the other half of the Backrooms. */
GEN.carpet = (size, o, N, R) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0xb59a4a);
  const s = 10 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    // Loop pile: high-frequency dotted pattern with a woven row offset.
    const row = Math.floor(y * 0.5);
    const off = (row & 1) ? 1 : 0;
    const lx = ((x + off) % 4) / 4, ly = (y % 4) / 4;
    const loop = Math.exp(-(((lx - 0.5) ** 2 + (ly - 0.5) ** 2) * 14));
    const fibre = N.fbm(x * s * 30, y * s * 30, 2) * 0.5 + 0.5;
    const wear = Math.pow(N.fbm(x * s * 0.3, y * s * 0.3, 4) * 0.5 + 0.5, 2);
    const stain = Math.pow(N.fbm(x * s * 0.6 + 90, y * s * 0.6, 5) * 0.5 + 0.5, 6);
    let v = 0.62 + loop * 0.35 + fibre * 0.22 - wear * 0.12 - stain * 0.4;
    rgb[i * 3] = base[0] * v;
    rgb[i * 3 + 1] = base[1] * v;
    rgb[i * 3 + 2] = base[2] * v * (1 - stain * 0.2);
    h[i] = loop * 0.8 + fibre * 0.4;
    rough[i] = 0.97 - stain * 0.15;
  }
  return { rgb, h, rough, normalStrength: 1.1 };
};

/** Grid ceiling tile — mineral fibre with the classic pinhole speckle. */
GEN.ceilingTile = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0xe6e1d2);
  const s = 8 / size;
  const half = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const gx = Math.min(x % half, half - (x % half));
    const gy = Math.min(y % half, half - (y % half));
    const gap = Math.min(gx, gy);
    const groove = gap < 3 ? 1 - gap / 3 : 0;
    const pin = (N.fbm(x * s * 40, y * s * 40, 1) * 0.5 + 0.5);
    const speck = pin > 0.62 ? 1 : 0;
    const dirt = Math.pow(N.fbm(x * s * 0.35 + 7, y * s * 0.35, 4) * 0.5 + 0.5, 3);
    let v = 1.0 - speck * 0.28 - groove * 0.55 - dirt * 0.35;
    rgb[i * 3] = base[0] * v;
    rgb[i * 3 + 1] = base[1] * v * (1 - dirt * 0.1);
    rgb[i * 3 + 2] = base[2] * v * (1 - dirt * 0.22);
    h[i] = -groove * 1.0 - speck * 0.4 + 0.5;
    rough[i] = 0.95;
  }
  return { rgb, h, rough, normalStrength: 1.8 };
};

/** Square/rect tile with grout. o.tiles = tiles across, o.grout = colour. */
GEN.tile = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0xdcdcd6);
  const grout = hexToRgb(o.grout ?? 0x55534e);
  const n = o.tiles ?? 8;
  const cell = size / n;
  const gw = Math.max(1.5, cell * 0.045);
  const s = 8 / size;
  const R2 = makeRNG(o.seed ?? 5);
  const tileShade = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) tileShade[i] = 0.9 + R2() * 0.18;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const tx = Math.floor(x / cell), ty = Math.floor(y / cell);
    const fx = x - tx * cell, fy = y - ty * cell;
    const edge = Math.min(fx, cell - fx, fy, cell - fy);
    const isGrout = edge < gw;
    const bevel = Math.min(1, Math.max(0, (edge - gw) / (cell * 0.06)));
    const marble = N.fbm(x * s * 1.6 + tx * 3, y * s * 1.6 + ty * 5, 5) * 0.5 + 0.5;
    const grime = Math.pow(N.fbm(x * s * 0.5 + 3, y * s * 0.5, 4) * 0.5 + 0.5, 3);
    if (isGrout) {
      const g = 0.8 + N.fbm(x * s * 20, y * s * 20, 2) * 0.3;
      rgb[i * 3] = grout[0] * g; rgb[i * 3 + 1] = grout[1] * g; rgb[i * 3 + 2] = grout[2] * g;
      h[i] = 0.0;
      rough[i] = 0.95;
    } else {
      const v = tileShade[ty * n + tx] * (0.9 + marble * 0.22) * (1 - grime * 0.25);
      rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v;
      h[i] = 0.55 + bevel * 0.45;
      rough[i] = (o.rough ?? 0.28) + grime * 0.35 + marble * 0.05;
    }
  }
  return { rgb, h, rough, normalStrength: 2.2 };
};

/** Running-bond brick. o.rows, o.color, o.mortar. */
GEN.brick = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x8a4436);
  const mortar = hexToRgb(o.mortar ?? 0x9a9489);
  const rows = o.rows ?? 8;
  const bh = size / rows, bw = bh * 2.2;
  const gap = Math.max(1.5, bh * 0.11);
  const s = 8 / size;
  const R2 = makeRNG(o.seed ?? 11);
  const shade = new Float32Array(rows * 64);
  for (let i = 0; i < shade.length; i++) shade[i] = 0.72 + R2() * 0.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const ry = Math.floor(y / bh);
    const xo = (ry & 1) ? bw * 0.5 : 0;
    const rx = Math.floor((x + xo) / bw);
    const fy = y - ry * bh;
    const fx = (x + xo) - rx * bw;
    const edge = Math.min(fx, bw - fx, fy, bh - fy);
    const jitter = N.fbm(x * s * 8, y * s * 8, 2) * gap * 0.4;
    if (edge < gap + jitter) {
      const g = 0.85 + N.fbm(x * s * 25, y * s * 25, 2) * 0.3;
      rgb[i * 3] = mortar[0] * g; rgb[i * 3 + 1] = mortar[1] * g; rgb[i * 3 + 2] = mortar[2] * g;
      h[i] = 0.05;
      rough[i] = 0.98;
    } else {
      const sh = shade[(ry * 37 + rx * 13) % shade.length];
      const spot = N.fbm(x * s * 12 + rx, y * s * 12 + ry, 3) * 0.5 + 0.5;
      const v = sh * (0.82 + spot * 0.35);
      rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v * 0.98; rgb[i * 3 + 2] = base[2] * v * 0.95;
      h[i] = 0.75 + spot * 0.25;
      rough[i] = 0.88 + spot * 0.1;
    }
  }
  return { rgb, h, rough, normalStrength: 2.6 };
};

/** Painted / brushed metal panel with rivets and seams. */
GEN.metalPanel = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x6d757c);
  const panels = o.panels ?? 4;
  const cell = size / panels;
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const fx = x % cell, fy = y % cell;
    const edge = Math.min(fx, cell - fx, fy, cell - fy);
    const seam = edge < 2 ? 1 : 0;
    // rivets near panel corners
    const rx = Math.min(fx, cell - fx), ry = Math.min(fy, cell - fy);
    const rd = Math.hypot(rx - 6, ry - 6);
    const rivet = rd < 3.2 ? 1 - rd / 3.2 : 0;
    const brush = N.fbm(x * s * 60, y * s * 3, 2) * 0.5 + 0.5;
    const wear = Math.pow(N.fbm(x * s * 0.6 + 20, y * s * 0.6, 5) * 0.5 + 0.5, 3);
    const v = (0.85 + brush * 0.2) * (1 - seam * 0.45) * (1 - wear * 0.3) + rivet * 0.25;
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v;
    h[i] = 0.6 - seam * 0.7 + rivet * 0.8 + brush * 0.1;
    rough[i] = (o.rough ?? 0.42) + brush * 0.14 + wear * 0.4;
  }
  return { rgb, h, rough, normalStrength: 2.0, metal: true };
};

/** Corroded steel — heavy rust blooms eating a painted base. */
GEN.rustMetal = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x4a5158);
  const rust = hexToRgb(o.rust ?? 0x7a3d1c);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const m = N.fbm(x * s * 1.2, y * s * 1.2, 6) * 0.5 + 0.5;
    const drip = N.fbm(x * s * 3.0, y * s * 0.35, 4) * 0.5 + 0.5;
    const amt = Math.min(1, Math.pow(Math.max(0, m * 0.7 + drip * 0.5 - 0.42) * 2.6, 1.5));
    const pit = N.fbm(x * s * 22, y * s * 22, 3) * 0.5 + 0.5;
    const v = 0.85 + pit * 0.25;
    for (let c = 0; c < 3; c++) {
      rgb[i * 3 + c] = (base[c] * (1 - amt) + rust[c] * amt * (0.7 + pit * 0.6)) * v;
    }
    h[i] = 0.5 + pit * 0.5 - amt * 0.5;
    rough[i] = 0.35 + amt * 0.6 + pit * 0.08;
  }
  return { rgb, h, rough, normalStrength: 2.2, metal: true };
};

/** Plank wood with grain and knots. */
GEN.wood = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x7b542f);
  const planks = o.planks ?? 6;
  const pw = size / planks;
  const s = 8 / size;
  const R2 = makeRNG(o.seed ?? 3);
  const tint = new Float32Array(planks);
  const offs = new Float32Array(planks);
  for (let i = 0; i < planks; i++) { tint[i] = 0.78 + R2() * 0.44; offs[i] = R2() * 40; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const p = Math.floor(x / pw);
    const fx = x - p * pw;
    const edge = Math.min(fx, pw - fx);
    const seam = edge < 1.5 ? 1 : 0;
    const gy = y * s * 0.6 + offs[p];
    const warp = N.fbm(x * s * 2, y * s * 0.3, 3) * 2.2;
    const rings = Math.abs(Math.sin((gy + warp) * 3.1)) ;
    const grain = N.fbm(x * s * 30, y * s * 2, 2) * 0.5 + 0.5;
    const v = tint[p] * (0.72 + rings * 0.35 + grain * 0.16) * (1 - seam * 0.55);
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v * 0.97; rgb[i * 3 + 2] = base[2] * v * 0.9;
    h[i] = 0.6 + rings * 0.25 + grain * 0.2 - seam * 1.0;
    rough[i] = (o.rough ?? 0.62) + rings * 0.14 + grain * 0.1;
  }
  return { rgb, h, rough, normalStrength: 1.4 };
};

/** Grass / meadow ground with clumping. */
GEN.grass = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x4a6b30);
  const dry = hexToRgb(o.dry ?? 0x8a8443);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const clump = N.fbm(x * s * 1.4, y * s * 1.4, 5) * 0.5 + 0.5;
    const blade = N.fbm(x * s * 45, y * s * 45, 2) * 0.5 + 0.5;
    const patch = Math.pow(N.fbm(x * s * 0.5 + 60, y * s * 0.5, 4) * 0.5 + 0.5, 2);
    const v = 0.68 + clump * 0.35 + blade * 0.22;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = (base[c] * (1 - patch) + dry[c] * patch) * v;
    h[i] = clump * 0.5 + blade * 0.6;
    rough[i] = 0.93 + blade * 0.06;
  }
  return { rgb, h, rough, normalStrength: 1.0 };
};

/** Dry cracked dirt / desert hardpan. */
GEN.dirt = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x8a6a45);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const c1 = N.worley(x * s * 0.8, y * s * 0.8, 5);
    const crack = Math.pow(1 - Math.min(1, (c1.f2 - c1.f1) * 5), 6);
    const grit = N.fbm(x * s * 30, y * s * 30, 3) * 0.5 + 0.5;
    const wide = N.fbm(x * s * 0.7, y * s * 0.7, 4) * 0.5 + 0.5;
    const v = 0.75 + wide * 0.28 + grit * 0.18 - crack * 0.45;
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v * 0.95;
    h[i] = 0.6 + grit * 0.3 - crack * 1.0;
    rough[i] = 0.95 + grit * 0.04;
  }
  return { rgb, h, rough, normalStrength: 1.9 };
};

/** Wind-rippled sand. */
GEN.sand = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0xd8bd8a);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const warp = N.fbm(x * s * 0.8, y * s * 0.8, 4) * 3.0;
    const ripple = Math.sin((y * s * 9 + warp)) * 0.5 + 0.5;
    const grit = N.fbm(x * s * 55, y * s * 55, 2) * 0.5 + 0.5;
    const v = 0.86 + ripple * 0.16 + grit * 0.12;
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v;
    h[i] = ripple * 0.7 + grit * 0.3;
    rough[i] = 0.9 + grit * 0.06;
  }
  return { rgb, h, rough, normalStrength: 1.2 };
};

/** Rough stone / cliff rock. */
GEN.rock = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x6e6a64);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const ridge = N.ridged(x * s * 1.5, y * s * 1.5, 5);
    const cell = N.worley(x * s * 1.1, y * s * 1.1, 3);
    const frac = Math.pow(1 - Math.min(1, (cell.f2 - cell.f1) * 3.5), 5);
    const grit = N.fbm(x * s * 26, y * s * 26, 3) * 0.5 + 0.5;
    const v = 0.66 + ridge * 0.4 + grit * 0.2 - frac * 0.3;
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v;
    h[i] = ridge * 0.8 + grit * 0.25 - frac * 0.7;
    rough[i] = 0.9 + grit * 0.08;
  }
  return { rgb, h, rough, normalStrength: 2.4 };
};

/** Polished marble with veining — lobbies, museums, temples. */
GEN.marble = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0xe9e6df);
  const vein = hexToRgb(o.vein ?? 0x5b5f6b);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const warp = N.fbm(x * s * 0.9, y * s * 0.9, 5) * 4.5;
    const v1 = Math.abs(Math.sin(x * s * 1.4 + y * s * 0.7 + warp));
    const v2 = Math.abs(Math.sin(x * s * 3.1 - y * s * 1.9 + warp * 1.7));
    const veinAmt = Math.pow(1 - v1, 9) * 0.8 + Math.pow(1 - v2, 14) * 0.4;
    const mottle = N.fbm(x * s * 6, y * s * 6, 3) * 0.5 + 0.5;
    const shade = 0.94 + mottle * 0.1;
    for (let c = 0; c < 3; c++) {
      rgb[i * 3 + c] = (base[c] * (1 - veinAmt) + vein[c] * veinAmt) * shade;
    }
    h[i] = 0.5 + veinAmt * 0.12;
    rough[i] = (o.rough ?? 0.14) + veinAmt * 0.12;
  }
  return { rgb, h, rough, normalStrength: 0.5 };
};

/** Asphalt / tarmac with aggregate and lane wear. */
GEN.asphalt = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x3a3b3e);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const agg = N.worley(x * s * 6, y * s * 6, 8);
    const chip = 1 - Math.min(1, agg.f1 * 3);
    const grit = N.fbm(x * s * 40, y * s * 40, 3) * 0.5 + 0.5;
    const wear = N.fbm(x * s * 0.4, y * s * 0.4, 4) * 0.5 + 0.5;
    const v = 0.78 + chip * 0.35 + grit * 0.2 + wear * 0.12;
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v * 1.02;
    h[i] = chip * 0.55 + grit * 0.45;
    rough[i] = 0.9 + grit * 0.07 - wear * 0.12;
  }
  return { rgb, h, rough, normalStrength: 1.7 };
};

/** Woven fabric — curtains, banners, upholstery. */
GEN.fabric = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x6d2436);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
    const thread = N.fbm(x * s * 34, y * s * 34, 2) * 0.5 + 0.5;
    const fold = N.fbm(x * s * 0.7, y * s * 0.7, 4) * 0.5 + 0.5;
    const v = 0.7 + weave * 0.25 + thread * 0.18 + fold * 0.15;
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v;
    h[i] = weave * 0.7 + thread * 0.3;
    rough[i] = 0.92;
  }
  return { rgb, h, rough, normalStrength: 1.0 };
};

/** Hex / sci-fi tech panel — greebled, emissive-ready. */
GEN.hexPanel = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x2c3440);
  const line = hexToRgb(o.line ?? 0x63d4ff);
  const s = 8 / size;
  const scale = o.scale ?? 7;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    // hex distance field
    const hx = x / size * scale, hy = y / size * scale * 1.1547;
    const q = hx - Math.floor(hx) - 0.5, r = hy - Math.floor(hy) - 0.5;
    const hexd = Math.max(Math.abs(q) * 0.866 + Math.abs(r) * 0.5, Math.abs(r));
    const edge = Math.pow(Math.max(0, hexd - 0.34) * 6, 2);
    const glow = Math.min(1, edge);
    const grime = N.fbm(x * s * 3, y * s * 3, 4) * 0.5 + 0.5;
    const micro = N.fbm(x * s * 50, y * s * 50, 2) * 0.5 + 0.5;
    const v = 0.75 + grime * 0.3 + micro * 0.1;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = base[c] * v + line[c] * glow * 0.85;
    h[i] = 0.6 - glow * 0.5 + micro * 0.15;
    rough[i] = 0.35 + grime * 0.3 - glow * 0.2;
  }
  return { rgb, h, rough, normalStrength: 1.5, metal: true };
};

/** Snow / ice sheet. */
GEN.snow = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0xe8f0f8);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const drift = N.fbm(x * s * 1.1, y * s * 1.1, 5) * 0.5 + 0.5;
    const sparkle = N.fbm(x * s * 70, y * s * 70, 1) * 0.5 + 0.5;
    const spec = sparkle > 0.78 ? 1 : 0;
    const v = 0.9 + drift * 0.12 + spec * 0.1;
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * Math.min(1.2, v * 1.02);
    h[i] = drift * 0.7 + sparkle * 0.2;
    rough[i] = 0.55 + drift * 0.3 - spec * 0.4;
  }
  return { rgb, h, rough, normalStrength: 0.9 };
};

/** Wallpaper with a repeating damask-ish motif — mansions, hotels. */
GEN.wallpaper = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x36402f);
  const motif = hexToRgb(o.motif ?? 0x8f8352);
  const s = 8 / size;
  const rep = o.rep ?? 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const u = (x / size) * rep, v0 = (y / size) * rep;
    const fu = u - Math.floor(u) - 0.5, fv = v0 - Math.floor(v0) - 0.5;
    const petal = Math.abs(Math.sin(Math.atan2(fv, fu) * 6)) * 0.28;
    const d = Math.hypot(fu, fv);
    const shape = Math.max(0, 1 - Math.abs(d - petal - 0.16) * 14);
    const stripe = (Math.sin(x * 0.35) * 0.5 + 0.5) * 0.12;
    const age = Math.pow(N.fbm(x * s * 0.4 + 12, y * s * 0.4, 4) * 0.5 + 0.5, 3);
    const fibre = N.fbm(x * s * 26, y * s * 26, 2) * 0.5 + 0.5;
    const vv = (0.9 + stripe + fibre * 0.1) * (1 - age * 0.4);
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = (base[c] * (1 - shape) + motif[c] * shape) * vv;
    h[i] = 0.5 + shape * 0.35 + fibre * 0.15;
    rough[i] = 0.85 + fibre * 0.1;
  }
  return { rgb, h, rough, normalStrength: 0.9 };
};

/** Corrugated / ribbed metal — warehouses, shipping containers, silos. */
GEN.corrugated = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x76808a);
  const ribs = o.ribs ?? 12;
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const w = Math.sin((x / size) * ribs * Math.PI * 2) * 0.5 + 0.5;
    const streak = N.fbm(x * s * 4, y * s * 0.4, 3) * 0.5 + 0.5;
    const rust = Math.pow(N.fbm(x * s * 0.9 + 33, y * s * 0.9, 5) * 0.5 + 0.5, 4);
    const v = (0.72 + w * 0.4 + streak * 0.14) * (1 - rust * 0.45);
    rgb[i * 3] = base[0] * v + rust * 0.24;
    rgb[i * 3 + 1] = base[1] * v + rust * 0.11;
    rgb[i * 3 + 2] = base[2] * v + rust * 0.04;
    h[i] = w;
    rough[i] = 0.45 + rust * 0.5 + streak * 0.08;
  }
  return { rgb, h, rough, normalStrength: 3.0, metal: true };
};

/** Wet cave / organic slime wall. */
GEN.organic = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x3d3a33);
  const wet = hexToRgb(o.wet ?? 0x1d2a22);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const lump = N.fbm(x * s * 2.2, y * s * 2.2, 5) * 0.5 + 0.5;
    const vein = Math.pow(1 - Math.abs(N.fbm(x * s * 4, y * s * 4, 4)), 6);
    const drip = Math.pow(N.fbm(x * s * 5, y * s * 0.5, 4) * 0.5 + 0.5, 3);
    const v = 0.6 + lump * 0.5 + vein * 0.3;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = (base[c] * (1 - drip) + wet[c] * drip) * v;
    h[i] = lump * 0.8 + vein * 0.3;
    rough[i] = 0.85 - drip * 0.6;
  }
  return { rgb, h, rough, normalStrength: 2.2 };
};

/** Flat colour with a whisper of grain — for props that shouldn't draw the eye. */
GEN.flat = (size, o, N) => {
  const rgb = new Float32Array(size * size * 3);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const base = hexToRgb(o.color ?? 0x888888);
  const s = 8 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const g = N.fbm(x * s * 24, y * s * 24, 2) * 0.5 + 0.5;
    const v = 0.94 + g * 0.1;
    rgb[i * 3] = base[0] * v; rgb[i * 3 + 1] = base[1] * v; rgb[i * 3 + 2] = base[2] * v;
    h[i] = g;
    rough[i] = o.rough ?? 0.7;
  }
  return { rgb, h, rough, normalStrength: 0.4 };
};

export const TEXTURE_TYPES = Object.keys(GEN);

/**
 * Build (or fetch from cache) a full PBR texture set.
 * @param {string} type one of TEXTURE_TYPES
 * @param {object} opts { color, repeat, size, seed, ...type-specific }
 * @returns {{map, normalMap, roughnessMap}}
 */
export function makeTextureSet(type, opts = {}) {
  const size = opts.size ?? 512;
  const repeat = opts.repeat ?? 1;
  const key = type + '|' + JSON.stringify(opts);
  if (CACHE.has(key)) return CACHE.get(key);

  const gen = GEN[type] || GEN.flat;
  const N = makeNoise(opts.seed ?? 20260809);
  const R = makeRNG(opts.seed ?? 20260809);
  const { rgb, h, rough, normalStrength } = gen(size, opts, N, R);

  const set = {
    map: toTexture(rgbCanvas(rgb, size), { srgb: true, repeat }),
    normalMap: toTexture(heightToNormal(h, size, (opts.normalStrength ?? 1) * normalStrength), { repeat }),
    roughnessMap: toTexture(floatToCanvas(rough, size), { repeat }),
  };
  CACHE.set(key, set);
  return set;
}

/** Small helper: a 1x1 gradient sky-ish canvas texture, handy for backdrops. */
export function makeGradientTexture(top, bottom, height = 256) {
  const c = canvas(height);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, new THREE.Color(top).getStyle());
  g.addColorStop(1, new THREE.Color(bottom).getStyle());
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, height, height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function clearTextureCache() {
  for (const set of CACHE.values()) {
    set.map?.dispose(); set.normalMap?.dispose(); set.roughnessMap?.dispose();
  }
  CACHE.clear();
}
