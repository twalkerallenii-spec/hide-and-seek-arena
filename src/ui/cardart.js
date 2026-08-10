// Procedural cover art for the arena-select cards.
//
// Twelve hand-drawn key arts would be twelve image downloads. Instead each card
// paints itself: a stylised, poster-like abstraction of its arena, generated
// from the arena's two brand colours and a per-arena drawing routine.

import { makeRNG } from '../engine/rng.js';

const W = 480, H = 600;

function mk() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c;
}

function grad(ctx, a, b, angle = 90) {
  const rad = (angle * Math.PI) / 180;
  const g = ctx.createLinearGradient(
    W / 2 - Math.cos(rad) * W, H / 2 - Math.sin(rad) * H,
    W / 2 + Math.cos(rad) * W, H / 2 + Math.sin(rad) * H
  );
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}

function noiseOverlay(ctx, amount = 0.06) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function vignette(ctx, strength = 0.7) {
  const g = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.15, W / 2, H * 0.5, H * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** One-point-perspective corridor — used by several interior arenas. */
function corridor(ctx, { wall, floor, ceil, light, depth = 9, vpY = 0.46, glow }) {
  const vx = W / 2, vy = H * vpY;
  for (let i = depth; i >= 0; i--) {
    const t = i / depth;
    const k = Math.pow(1 - t, 1.7);
    const w = W * (0.08 + k * 1.15);
    const h = H * (0.10 + k * 0.95);
    const x = vx - w / 2, y = vy - h * 0.42;
    const shade = 0.32 + (1 - t) * 0.68;

    ctx.fillStyle = wall(shade);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = floor(shade);
    ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    ctx.fillStyle = ceil(shade);
    ctx.fillRect(x, y, w, h * 0.10);

    if (light && i % 2 === 0) {
      ctx.fillStyle = light(shade);
      ctx.fillRect(vx - w * 0.10, y + h * 0.03, w * 0.20, h * 0.026);
    }
  }
  if (glow) {
    const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, W * 0.5);
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

/** Silhouetted skyline / stack profile against a sky. */
function skyline(ctx, rng, { color, base = 0.72, minH = 0.08, maxH = 0.42, cols = 22, jitter = true }) {
  const cw = W / cols;
  for (let i = 0; i < cols; i++) {
    const h = H * (minH + rng() * (maxH - minH));
    const x = i * cw;
    ctx.fillStyle = color;
    ctx.fillRect(x, H * base - h, cw + 1, h + H * (1 - base));
    if (jitter && rng() < 0.4) {
      ctx.fillRect(x + cw * 0.2, H * base - h - H * 0.05, cw * 0.25, H * 0.05);
    }
  }
}

const PAINTERS = {

  backrooms(ctx, rng, [a, b]) {
    ctx.fillStyle = grad(ctx, '#c9b878', '#7a6733', 100);
    ctx.fillRect(0, 0, W, H);
    corridor(ctx, {
      wall: (s) => `rgb(${217 * s | 0},${201 * s | 0},${140 * s | 0})`,
      floor: (s) => `rgb(${161 * s | 0},${136 * s | 0},${70 * s | 0})`,
      ceil: (s) => `rgb(${228 * s | 0},${222 * s | 0},${200 * s | 0})`,
      light: (s) => `rgba(255,250,215,${0.35 + s * 0.6})`,
      depth: 11, vpY: 0.47,
      glow: 'rgba(255,246,200,0.30)',
    });
    // a lone doorway off to the side
    ctx.fillStyle = 'rgba(20,16,8,0.85)';
    ctx.fillRect(W * 0.13, H * 0.40, W * 0.075, H * 0.20);
    vignette(ctx, 0.72);
    noiseOverlay(ctx, 0.09);
  },

  neonmetro(ctx, rng, [a, b]) {
    ctx.fillStyle = grad(ctx, '#0d1524', '#04070d', 110);
    ctx.fillRect(0, 0, W, H);
    corridor(ctx, {
      wall: (s) => `rgb(${26 * s | 0},${34 * s | 0},${46 * s | 0})`,
      floor: (s) => `rgb(${14 * s | 0},${20 * s | 0},${28 * s | 0})`,
      ceil: (s) => `rgb(${18 * s | 0},${24 * s | 0},${34 * s | 0})`,
      depth: 8, vpY: 0.5,
    });
    // neon strips down both walls
    for (let i = 0; i < 9; i++) {
      const t = i / 9;
      const k = Math.pow(1 - t, 1.6);
      const w = W * (0.08 + k * 1.15);
      const y = H * 0.5 - H * (0.10 + k * 0.95) * 0.42;
      const h = H * (0.10 + k * 0.95);
      const c = i % 3 === 0 ? '#ff3fa4' : i % 3 === 1 ? '#46e0ff' : '#ffab2e';
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.85 - t * 0.5;
      ctx.fillRect(W / 2 - w / 2 - 3, y + h * 0.30, 5, h * 0.20);
      ctx.fillRect(W / 2 + w / 2 - 2, y + h * 0.30, 5, h * 0.20);
      ctx.globalAlpha = 1;
    }
    // wet floor reflection
    const g = ctx.createLinearGradient(0, H * 0.62, 0, H);
    g.addColorStop(0, 'rgba(255,63,164,0.20)');
    g.addColorStop(0.5, 'rgba(70,224,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.62, W, H * 0.38);
    // rain
    ctx.strokeStyle = 'rgba(180,220,255,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 160; i++) {
      const x = rng() * W, y = rng() * H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 16); ctx.stroke();
    }
    vignette(ctx, 0.8);
    noiseOverlay(ctx, 0.05);
  },

  cargoyard(ctx, rng, [a, b]) {
    ctx.fillStyle = grad(ctx, '#2c4d7a', '#f0a860', 90);
    ctx.fillRect(0, 0, W, H * 0.72);
    // sun
    ctx.fillStyle = 'rgba(255,230,170,0.85)';
    ctx.beginPath(); ctx.arc(W * 0.68, H * 0.60, 46, 0, 6.2832); ctx.fill();
    // crane silhouettes
    ctx.strokeStyle = 'rgba(20,16,14,0.85)';
    ctx.lineWidth = 5;
    for (const cx of [W * 0.22, W * 0.74]) {
      ctx.beginPath();
      ctx.moveTo(cx - 60, H * 0.72); ctx.lineTo(cx - 46, H * 0.26);
      ctx.lineTo(cx + 46, H * 0.26); ctx.lineTo(cx + 60, H * 0.72);
      ctx.moveTo(cx - 80, H * 0.26); ctx.lineTo(cx + 96, H * 0.26);
      ctx.stroke();
    }
    // container stacks
    const colors = ['#a8442c', '#2f6f8f', '#4d7a3a', '#8a6a2a', '#7a3d1c', '#3f5566'];
    ctx.fillStyle = '#2a2622';
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    for (let i = 0; i < 40; i++) {
      const cw = 62, ch = 26;
      const col = i % 8;
      const row = Math.floor(i / 8);
      const x = col * cw - 20 + (row % 2) * 14;
      const y = H * 0.72 - (row + 1) * ch;
      if (rng() < 0.18) continue;
      ctx.fillStyle = colors[(col + row * 3) % colors.length];
      ctx.fillRect(x, y, cw - 3, ch - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, y + ch - 6, cw - 3, 4);
    }
    // haze
    ctx.fillStyle = 'rgba(240,168,96,0.22)';
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    vignette(ctx, 0.6);
    noiseOverlay(ctx, 0.05);
  },

  undercroft(ctx, rng) {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);
    // reactor cylinder
    const cx = W / 2, cy = H * 0.55;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 220);
    g.addColorStop(0, 'rgba(255,90,20,0.9)');
    g.addColorStop(0.35, 'rgba(160,40,10,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(cx - 78, H * 0.22, 156, H * 0.62);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(255,${90 + i * 8},30,${0.55 + (i % 2) * 0.3})`;
      ctx.fillRect(cx - 78, H * 0.26 + i * 44, 156, 5);
    }
    // catwalk rails
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 6;
    for (const y of [H * 0.38, H * 0.56, H * 0.74]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y - 8); ctx.stroke();
      ctx.lineWidth = 2;
      for (let x = 8; x < W; x += 26) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.stroke(); }
      ctx.lineWidth = 6;
    }
    // cyan strip
    ctx.fillStyle = 'rgba(70,224,255,0.85)';
    ctx.fillRect(0, H * 0.14, W, 3);
    vignette(ctx, 0.9);
    noiseOverlay(ctx, 0.07);
  },

  aqueducts(ctx, rng) {
    ctx.fillStyle = grad(ctx, '#a9d8c4', '#22301c', 95);
    ctx.fillRect(0, 0, W, H);
    // aqueduct arch tiers
    ctx.fillStyle = 'rgba(74,82,66,0.95)';
    const tiers = [{ y: 0.24, h: 0.16, n: 4 }, { y: 0.40, h: 0.14, n: 6 }, { y: 0.54, h: 0.12, n: 9 }];
    for (const t of tiers) {
      const aw = W / t.n;
      for (let i = 0; i < t.n; i++) {
        const x = i * aw;
        ctx.fillRect(x, H * t.y, aw * 0.30, H * t.h);
      }
      ctx.fillRect(0, H * t.y, W, H * 0.022);
    }
    // water
    const g = ctx.createLinearGradient(0, H * 0.66, 0, H);
    g.addColorStop(0, 'rgba(30,90,86,0.9)');
    g.addColorStop(1, 'rgba(8,30,32,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.66, W, H * 0.34);
    ctx.strokeStyle = 'rgba(180,240,220,0.16)';
    for (let i = 0; i < 40; i++) {
      const y = H * 0.68 + rng() * H * 0.3;
      ctx.beginPath(); ctx.moveTo(rng() * W, y); ctx.lineTo(rng() * W, y); ctx.stroke();
    }
    // light shafts
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = W * (0.1 + i * 0.2);
      ctx.fillStyle = 'rgba(200,255,200,0.09)';
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 26, 0);
      ctx.lineTo(x + 78, H * 0.72); ctx.lineTo(x - 26, H * 0.72);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    vignette(ctx, 0.65);
    noiseOverlay(ctx, 0.05);
  },

  frostwatch(ctx, rng) {
    ctx.fillStyle = grad(ctx, '#e8f2fb', '#8fa8bf', 90);
    ctx.fillRect(0, 0, W, H);
    // module on stilts
    ctx.fillStyle = 'rgba(30,34,40,0.55)';
    for (const x of [W * 0.30, W * 0.44, W * 0.58, W * 0.72]) ctx.fillRect(x, H * 0.56, 8, H * 0.16);
    ctx.fillStyle = '#c4562a';
    ctx.fillRect(W * 0.22, H * 0.40, W * 0.58, H * 0.17);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(W * 0.22, H * 0.54, W * 0.58, H * 0.03);
    // lit windows
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === 2 ? 'rgba(255,205,130,0.95)' : 'rgba(255,205,130,0.35)';
      ctx.fillRect(W * 0.27 + i * W * 0.108, H * 0.45, W * 0.062, H * 0.055);
    }
    // drifts
    ctx.fillStyle = 'rgba(240,248,255,0.96)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) {
      ctx.lineTo(x, H * 0.70 + Math.sin(x * 0.017) * 22 + Math.sin(x * 0.006) * 30);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // blizzard
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 400; i++) {
      const x = rng() * W, y = rng() * H;
      ctx.fillRect(x, y, 2.4, 1.4);
    }
    ctx.fillStyle = 'rgba(226,238,250,0.42)';
    ctx.fillRect(0, 0, W, H);
    vignette(ctx, 0.5);
    noiseOverlay(ctx, 0.04);
  },

  orbital(ctx, rng) {
    ctx.fillStyle = '#03060c';
    ctx.fillRect(0, 0, W, H);
    // stars
    for (let i = 0; i < 260; i++) {
      const x = rng() * W, y = rng() * H, r = rng() * 1.4;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.8})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    // planet
    const px = W * 0.52, py = H * 0.78, pr = W * 0.62;
    const pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
    pg.addColorStop(0, '#7fe0d0');
    pg.addColorStop(0.45, '#2a7fae');
    pg.addColorStop(1, '#06172a');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.2832); ctx.fill();
    // atmosphere rim
    ctx.strokeStyle = 'rgba(150,230,255,0.55)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(px, py, pr + 3, 0, 6.2832); ctx.stroke();
    // window frame silhouette
    ctx.fillStyle = 'rgba(6,9,14,0.95)';
    ctx.fillRect(0, 0, W, H * 0.14);
    ctx.fillRect(0, H * 0.88, W, H * 0.12);
    for (const x of [W * 0.02, W * 0.32, W * 0.65, W * 0.95]) ctx.fillRect(x, 0, 16, H);
    // cove light
    ctx.fillStyle = 'rgba(70,224,255,0.75)';
    ctx.fillRect(0, H * 0.14, W, 3);
    ctx.fillRect(0, H * 0.87, W, 3);
    vignette(ctx, 0.65);
  },

  palisade(ctx, rng) {
    ctx.fillStyle = grad(ctx, '#2b2733', '#12111a', 90);
    ctx.fillRect(0, 0, W, H);
    // skylight moonlight
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(150,180,235,0.20)';
    ctx.beginPath();
    ctx.moveTo(W * 0.30, 0); ctx.lineTo(W * 0.70, 0);
    ctx.lineTo(W * 0.86, H * 0.78); ctx.lineTo(W * 0.14, H * 0.78);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // balcony rails
    ctx.strokeStyle = 'rgba(197,160,89,0.8)'; ctx.lineWidth = 4;
    for (const y of [H * 0.34, H * 0.52]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.lineWidth = 1.4;
      for (let x = 6; x < W; x += 12) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 20); ctx.stroke(); }
      ctx.lineWidth = 4;
    }
    // storefronts
    for (let i = 0; i < 6; i++) {
      const x = i * (W / 6);
      const lit = i === 1 || i === 4;
      ctx.fillStyle = lit ? 'rgba(255,190,120,0.30)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(x + 6, H * 0.56, W / 6 - 12, H * 0.20);
      ctx.fillStyle = lit ? '#ffb46b' : '#3d3a48';
      ctx.fillRect(x + 6, H * 0.545, W / 6 - 12, 5);
    }
    // tile floor
    ctx.fillStyle = '#3a3040';
    ctx.fillRect(0, H * 0.78, W, H * 0.22);
    ctx.strokeStyle = 'rgba(217,168,192,0.30)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const y = H * 0.78 + i * (H * 0.22 / 12);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // fountain silhouette
    ctx.fillStyle = 'rgba(10,8,14,0.9)';
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.84, 78, 22, 0, 0, 6.2832); ctx.fill();
    vignette(ctx, 0.85);
    noiseOverlay(ctx, 0.055);
  },

  forge(ctx, rng) {
    ctx.fillStyle = '#0a0503';
    ctx.fillRect(0, 0, W, H);
    // molten pour
    const g = ctx.createRadialGradient(W * 0.5, H * 0.72, 8, W * 0.5, H * 0.72, W * 0.7);
    g.addColorStop(0, 'rgba(255,240,190,1)');
    g.addColorStop(0.12, 'rgba(255,150,30,0.95)');
    g.addColorStop(0.4, 'rgba(190,50,10,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,200,90,0.9)';
    ctx.beginPath();
    ctx.moveTo(W * 0.46, H * 0.26); ctx.lineTo(W * 0.54, H * 0.26);
    ctx.lineTo(W * 0.58, H * 0.74); ctx.lineTo(W * 0.42, H * 0.74);
    ctx.closePath(); ctx.fill();
    // truss silhouette
    ctx.strokeStyle = 'rgba(0,0,0,0.92)'; ctx.lineWidth = 7;
    for (const y of [H * 0.14, H * 0.30]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.lineWidth = 4;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, H * 0.14); ctx.lineTo(x + 20, H * 0.30);
      ctx.lineTo(x + 40, H * 0.14); ctx.stroke();
    }
    // catwalks
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    for (const y of [H * 0.44, H * 0.60]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 6); ctx.stroke();
    }
    // sparks
    for (let i = 0; i < 90; i++) {
      const x = W * 0.5 + (rng() - 0.5) * 200, y = H * 0.72 - rng() * 180;
      ctx.fillStyle = `rgba(255,${180 + rng() * 70 | 0},80,${rng()})`;
      ctx.fillRect(x, y, 2, 2);
    }
    vignette(ctx, 0.9);
    noiseOverlay(ctx, 0.06);
  },

  abbadon(ctx, rng) {
    ctx.fillStyle = grad(ctx, '#1b2436', '#080a10', 90);
    ctx.fillRect(0, 0, W, H);
    // moon
    ctx.fillStyle = 'rgba(210,225,255,0.9)';
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.16, 30, 0, 6.2832); ctx.fill();
    // manor silhouette
    ctx.fillStyle = '#05070c';
    ctx.beginPath();
    ctx.moveTo(W * 0.10, H);
    ctx.lineTo(W * 0.10, H * 0.50);
    ctx.lineTo(W * 0.20, H * 0.38);
    ctx.lineTo(W * 0.30, H * 0.50);
    ctx.lineTo(W * 0.38, H * 0.50);
    ctx.lineTo(W * 0.50, H * 0.28);
    ctx.lineTo(W * 0.62, H * 0.50);
    ctx.lineTo(W * 0.70, H * 0.50);
    ctx.lineTo(W * 0.80, H * 0.38);
    ctx.lineTo(W * 0.90, H * 0.50);
    ctx.lineTo(W * 0.90, H);
    ctx.closePath(); ctx.fill();
    // chimneys
    for (const x of [0.24, 0.44, 0.66, 0.84]) ctx.fillRect(W * x, H * 0.30, 14, H * 0.14);
    // lit windows
    for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) {
      const x = W * (0.15 + i * 0.10), y = H * (0.56 + r * 0.11);
      const lit = rng() < 0.34;
      ctx.fillStyle = lit ? 'rgba(255,196,110,0.92)' : 'rgba(120,150,200,0.10)';
      ctx.fillRect(x, y, 18, 26);
      if (lit) {
        ctx.fillStyle = 'rgba(255,196,110,0.16)';
        ctx.fillRect(x - 8, y - 8, 34, 42);
      }
    }
    // hedge maze foreground
    ctx.fillStyle = '#0b1a10';
    ctx.fillRect(0, H * 0.84, W, H * 0.16);
    ctx.strokeStyle = '#122a18'; ctx.lineWidth = 7;
    for (let i = 0; i < 9; i++) {
      const x = i * (W / 9) + 12;
      ctx.beginPath(); ctx.moveTo(x, H * 0.86); ctx.lineTo(x, H); ctx.stroke();
      if (i % 2) { ctx.beginPath(); ctx.moveTo(x, H * 0.92); ctx.lineTo(x + W / 9, H * 0.92); ctx.stroke(); }
    }
    // mist
    ctx.fillStyle = 'rgba(140,165,205,0.13)';
    ctx.fillRect(0, H * 0.78, W, H * 0.14);
    vignette(ctx, 0.85);
    noiseOverlay(ctx, 0.05);
  },

  bazaar(ctx, rng) {
    ctx.fillStyle = grad(ctx, '#2f6fc0', '#f2e2be', 90);
    ctx.fillRect(0, 0, W, H * 0.5);
    ctx.fillStyle = '#e4cf9e';
    ctx.fillRect(0, H * 0.5, W, H * 0.5);
    // alley walls in perspective
    ctx.fillStyle = '#c9a86f';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(W * 0.30, H * 0.30);
    ctx.lineTo(W * 0.30, H * 0.86); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8e7145';
    ctx.beginPath();
    ctx.moveTo(W, 0); ctx.lineTo(W * 0.70, H * 0.30);
    ctx.lineTo(W * 0.70, H * 0.86); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // ground
    ctx.fillStyle = '#d8bd8a';
    ctx.beginPath();
    ctx.moveTo(W * 0.30, H * 0.86); ctx.lineTo(W * 0.70, H * 0.86);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    // deep shade
    ctx.fillStyle = 'rgba(20,26,50,0.55)';
    ctx.fillRect(W * 0.30, H * 0.30, W * 0.40, H * 0.56);
    // awnings across the alley
    const cols = ['#c0392b', '#2e86ab', '#d4a017', '#7d5ba6'];
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const y = H * (0.10 + t * 0.30);
      const inset = W * (0.30 - t * 0.16);
      ctx.fillStyle = cols[i % cols.length];
      ctx.globalAlpha = 0.9 - t * 0.25;
      ctx.fillRect(inset, y, W - inset * 2, 12 + (1 - t) * 8);
      ctx.globalAlpha = 1;
    }
    // hanging lanterns
    for (let i = 0; i < 7; i++) {
      const x = W * (0.34 + rng() * 0.32), y = H * (0.34 + rng() * 0.22);
      ctx.fillStyle = 'rgba(255,190,80,0.95)';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,190,80,0.18)';
      ctx.beginPath(); ctx.arc(x, y, 20, 0, 6.2832); ctx.fill();
    }
    // dust shafts
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,240,200,0.14)';
    ctx.beginPath();
    ctx.moveTo(W * 0.36, H * 0.12); ctx.lineTo(W * 0.46, H * 0.12);
    ctx.lineTo(W * 0.66, H * 0.90); ctx.lineTo(W * 0.44, H * 0.90);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    vignette(ctx, 0.55);
    noiseOverlay(ctx, 0.05);
  },

  static(ctx, rng) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // wireframe grid receding
    ctx.strokeStyle = 'rgba(70,224,255,0.35)'; ctx.lineWidth = 1;
    const hz = H * 0.52;
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 8, hz);
      ctx.lineTo(W / 2 + i * 90, H);
      ctx.stroke();
    }
    for (let i = 1; i < 16; i++) {
      const y = hz + Math.pow(i / 16, 2.4) * (H - hz);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // floating fragments
    const frags = [
      { x: 0.18, y: 0.30, w: 0.26, h: 0.10, c: '#d9c98c' },
      { x: 0.58, y: 0.20, w: 0.30, h: 0.08, c: '#2f6f8f' },
      { x: 0.36, y: 0.44, w: 0.34, h: 0.09, c: '#c4562a' },
      { x: 0.10, y: 0.56, w: 0.22, h: 0.07, c: '#3fbfa0' },
      { x: 0.66, y: 0.52, w: 0.24, h: 0.08, c: '#ff5a10' },
    ];
    for (const f of frags) {
      ctx.fillStyle = f.c;
      ctx.fillRect(W * f.x, H * f.y, W * f.w, H * f.h);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(W * f.x, H * (f.y + f.h) - 4, W * f.w, 8);
      ctx.strokeStyle = 'rgba(255,63,164,0.75)'; ctx.lineWidth = 1.4;
      ctx.strokeRect(W * f.x, H * f.y, W * f.w, H * f.h);
    }
    // obelisk
    ctx.fillStyle = '#050508';
    ctx.fillRect(W * 0.46, H * 0.12, W * 0.08, H * 0.56);
    ctx.strokeStyle = 'rgba(255,63,164,0.9)'; ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.46, H * 0.12, W * 0.08, H * 0.56);
    // static bands
    for (let i = 0; i < 6; i++) {
      const y = rng() * H, h = 3 + rng() * 14;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + rng() * 0.14})`;
      ctx.fillRect(0, y, W, h);
    }
    // chromatic tear
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255,0,120,0.10)'; ctx.fillRect(-4, 0, W, H);
    ctx.fillStyle = 'rgba(0,220,255,0.10)'; ctx.fillRect(4, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    vignette(ctx, 0.95);
    noiseOverlay(ctx, 0.13);
  },
};

const CACHE = new Map();

export function arenaCardArt(meta) {
  if (CACHE.has(meta.id)) return CACHE.get(meta.id);
  const c = mk();
  const ctx = c.getContext('2d');
  const rng = makeRNG(meta.id);
  const painter = PAINTERS[meta.id];
  if (painter) {
    painter(ctx, rng, meta.colors || ['#888', '#222']);
  } else {
    ctx.fillStyle = grad(ctx, meta.colors?.[0] || '#556', meta.colors?.[1] || '#111', 100);
    ctx.fillRect(0, 0, W, H);
    vignette(ctx, 0.7);
    noiseOverlay(ctx, 0.06);
  }
  CACHE.set(meta.id, c);
  return c;
}
