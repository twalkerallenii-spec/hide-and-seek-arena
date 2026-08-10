// Deterministic RNG + noise toolkit. Every arena gets a seeded RNG so worlds
// are identical across reloads (and across machines) but still procedurally rich.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — fast, tiny, good enough distribution for level gen. */
export function makeRNG(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
  const rng = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  /** Gaussian-ish via sum of uniforms; cheap and stable. */
  rng.gauss = (mean = 0, dev = 1) =>
    mean + ((rng() + rng() + rng() + rng() + rng() + rng() - 3) / 3) * dev;
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  rng.fork = (tag) => makeRNG(hashString(String(tag)) ^ Math.floor(rng() * 0xffffffff));
  return rng;
}

// ---------------------------------------------------------------------------
// Noise. Value-noise based fBm + worley. Deterministic on an integer seed.
// ---------------------------------------------------------------------------

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

export function makeNoise(seed = 1337) {
  const perm = new Uint8Array(512);
  const r = makeRNG(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  r.shuffle(p);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad2 = (hash, x, y) => {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  };

  /** 2D perlin-ish gradient noise, range approx [-1,1]. */
  function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    return lerp(
      lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
      lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
      v
    ) * 0.5;
  }

  /** Fractal brownian motion. Returns roughly [-1,1]. */
  function fbm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Billowy ridged noise — good for rock, rust, clouds. */
  function ridged(x, y, octaves = 5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * (1 - Math.abs(noise2(x * freq, y * freq) * 2));
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** Worley / cellular. Returns { f1, f2, id } — f2-f1 gives crack lines. */
  function worley(x, y, cells = 1) {
    const xi = Math.floor(x * cells), yi = Math.floor(y * cells);
    const xf = x * cells - xi, yf = y * cells - yi;
    let f1 = 9, f2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const h = perm[(perm[(xi + dx) & 255] + ((yi + dy) & 255)) & 511];
        const px = dx + (h & 15) / 15, py = dy + ((h >> 4) & 15) / 15;
        const d = Math.hypot(px - xf, py - yf);
        if (d < f1) { f2 = f1; f1 = d; id = h; }
        else if (d < f2) { f2 = d; }
      }
    }
    return { f1, f2, id };
  }

  return { noise2, fbm, ridged, worley };
}

export const defaultNoise = makeNoise(20260809);
