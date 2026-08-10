// ===========================================================================
// A07 — "HALO NINE"   (id: 'orbital')
//
// A derelict ring station in low orbit. Six zones hang off a single curved
// ring corridor that wraps a five-deck atrium; the whole thing is pointed at
// a blue-green planet through a 36-metre panoramic window.
//
// Construction notes
// ------------------
//  * Everything is laid out in POLAR coordinates. PX/PZ convert (radius, deg)
//    to world x/z. Two yaw conventions are used and they matter:
//      YAW_R(a)  local +X -> radial outward   (ribs, radial beams, spokes)
//      YAW_T(a)  local +X -> CCW tangent, local +Z -> inward  (wall fixtures)
//  * Curved geometry (corridor floors/walls, cove strips, the spiral ramp,
//    the window) is generated as real swept arc strips - `arcFloorGeo` /
//    `arcWallGeo` - one BufferGeometry per run. No straight ring corridors.
//  * Big static dressing goes into a per-zone `shell` Group that is
//    `freeze()`d into one mesh per material. Anything the player must not
//    walk through gets an invisible box proxy (invisible = zero draw calls).
//
// Layout (degrees, CCW from +X):
//    HUB              r < 15         atrium, 5 decks, spiral ramp   [landmark 2]
//    SPOKES           r 15 -> 37.5   at 0 / 90 / 180 / 270
//    RING CORRIDOR    r 37.5..42.5   full 360, curved
//    OBSERVATION HALL r 42.5..78     -42..+42                       [landmark 1]
//    CREW DECK        centred  80
//    HYDROPONICS      centred 130    the visual outlier
//    ENGINEERING      centred 180
//    THE BREACH       centred 236                                   [landmark 3]
//    DOCKING BAY      centred 292
// ===========================================================================

import * as THREE from 'three';

export const meta = {
  id: 'orbital',
  name: 'HALO NINE',
  tagline: 'Five decks, one window, and a very long way down.',
  order: 7,
  difficulty: 3,
  biome: 'space',
  seed: 90714,
  spawn: [39.66, 1.0, 5.22],
  bounds: 92,
  colors: ['#e2e9ee', '#0c2b3c'],
  music: 'tense',
};

// ---------------------------------------------------------------------------
// Polar + swept-arc geometry helpers
// ---------------------------------------------------------------------------

const D2R = Math.PI / 180;
const PX = (r, a) => Math.cos(a * D2R) * r;
const PZ = (r, a) => Math.sin(a * D2R) * r;
/** local +X -> radial outward. */
const YAW_R = (a) => -a * D2R;
/** local +X -> CCW tangent, local +Z -> inward (toward the axis). */
const YAW_T = (a) => -a * D2R - Math.PI / 2;

function buildGeo(pos, nor, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * Annular strip between two radii swept over an angle. yStart != yEnd makes a
 * helicoid, which is how the spiral ramp is built.
 */
function arcFloorGeo(r0, r1, aStart, aEnd, yStart, yEnd, segs, uvScale = 4, flip = false) {
  const pos = [], nor = [], uv = [], idx = [];
  const nY = flip ? -1 : 1;
  const rm = (r0 + r1) / 2;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = (aStart + (aEnd - aStart) * t) * D2R;
    const y = yStart + (yEnd - yStart) * t;
    const ca = Math.cos(a), sa = Math.sin(a), arc = a * rm;
    pos.push(ca * r0, y, sa * r0); nor.push(0, nY, 0); uv.push(arc / uvScale, 0);
    pos.push(ca * r1, y, sa * r1); nor.push(0, nY, 0); uv.push(arc / uvScale, (r1 - r0) / uvScale);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    if (flip) idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    else idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  return buildGeo(pos, nor, uv, idx);
}

/** Cylindrical band. `inward` faces the axis. lift0/lift1 ramp it vertically. */
function arcWallGeo(r, aStart, aEnd, y0, y1, segs, uvScale = 4, inward = false, lift0 = 0, lift1 = 0) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = (aStart + (aEnd - aStart) * t) * D2R;
    const lift = lift0 + (lift1 - lift0) * t;
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = inward ? -ca : ca, nz = inward ? -sa : sa;
    const arc = a * r;
    pos.push(ca * r, y0 + lift, sa * r); nor.push(nx, 0, nz); uv.push(arc / uvScale, 0);
    pos.push(ca * r, y1 + lift, sa * r); nor.push(nx, 0, nz); uv.push(arc / uvScale, (y1 - y0) / uvScale);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    if (inward) idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    else idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  return buildGeo(pos, nor, uv, idx);
}

/** The complement of a set of [from,to] gaps around a full circle. */
function spansWithGaps(gaps) {
  const g = gaps
    .map(([a, b]) => [((a % 360) + 360) % 360, ((b % 360) + 360) % 360])
    .flatMap(([a, b]) => (a <= b ? [[a, b]] : [[a, 360], [0, b]]))
    .sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = 0;
  for (const [a, b] of g) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < 360) out.push([cur, 360]);
  return out;
}

// ===========================================================================

export async function build(ctx) {
  const P = ctx.props;
  const M = ctx.mat;
  const R = ctx.rng;

  // One RNG stream per subsystem so tweaking one never reshuffles another.
  const rStar = R.fork('stars');
  const rCorr = R.fork('corridor');
  const rHall = R.fork('hall');
  const rCrew = R.fork('crew');
  const rHydro = R.fork('hydro');
  const rEng = R.fork('engineering');
  const rBreach = R.fork('breach');
  const rDock = R.fork('dock');

  // -------------------------------------------------------------------------
  // 1. ATMOSPHERE / GRADE / SOUND
  // -------------------------------------------------------------------------

  ctx.sky({ color: 0x01040a });
  ctx.fog(0x0a1018, 0.008, 0, 'exp2');
  ctx.useEnvironment(0.75);
  ctx.grade({
    exposure: 1.05, saturation: 1.1, contrast: 1.1,
    lift: [-0.004, 0.0, 0.012], gain: [0.97, 1.0, 1.06],
    vignette: 0.9, grain: 0.022, aberration: 0.0014,
    bloom: 0.7, bloomRadius: 0.85, bloomThreshold: 0.7,
    scanline: 0.08,
  });
  ctx.soundscape('electric', 'calm', { size: 0.6, dark: 0.25, wet: 0.2 });
  ctx.setSurface('metal');

  // -------------------------------------------------------------------------
  // 2. MATERIAL PALETTE — 17 surface() calls, 15 unique texture sets
  // -------------------------------------------------------------------------

  const MAT = {
    hull: M.surface('metalPanel', { color: 0xd7dde1, panels: 3, repeat: 3, roughness: 0.44, metalness: 0.32, normalScale: 0.8 }),
    hullDS: M.surface('metalPanel', { color: 0xd7dde1, panels: 3, repeat: 3, roughness: 0.44, metalness: 0.32, normalScale: 0.8, side: THREE.DoubleSide }),
    hullBig: M.surface('metalPanel', { color: 0xc9d2d8, panels: 2, repeat: 6, roughness: 0.48, metalness: 0.3 }),
    hex: M.surface('hexPanel', { color: 0x38434e, line: 0x63d4ff, scale: 8, repeat: 3, roughness: 0.38, metalness: 0.55 }),
    hexPale: M.surface('hexPanel', { color: 0xaeb9c2, line: 0x9fe8ff, scale: 11, repeat: 5, roughness: 0.42, metalness: 0.4 }),
    grate: M.surface('metalPanel', { color: 0x59636b, panels: 12, repeat: 10, roughness: 0.6, metalness: 0.62, normalScale: 1.4 }),
    grateDS: M.surface('metalPanel', { color: 0x59636b, panels: 12, repeat: 10, roughness: 0.6, metalness: 0.62, normalScale: 1.4, side: THREE.DoubleSide }),
    ceil: M.surface('metalPanel', { color: 0xc2cad0, panels: 5, repeat: 7, roughness: 0.52, metalness: 0.2 }),
    struct: M.surface('metalPanel', { color: 0x6b757e, panels: 2, repeat: 2, size: 256, roughness: 0.46, metalness: 0.72 }),
    stone: M.surface('marble', { color: 0xe6eaee, vein: 0x87a3b2, repeat: 12, rough: 0.16 }),
    burnt: M.surface('rustMetal', { color: 0x2c3237, rust: 0x4d2f1a, repeat: 3, roughness: 0.86, metalness: 0.45 }),
    engDeck: M.surface('metalPanel', { color: 0x4b5259, panels: 6, repeat: 7, roughness: 0.66, metalness: 0.58 }),
    hydroFloor: M.surface('tile', { color: 0xe9eff1, grout: 0x64757c, tiles: 6, repeat: 7, rough: 0.24 }),
    bayFloor: M.surface('concrete', { color: 0x878e95, repeat: 12, roughness: 0.86 }),
    corrug: M.surface('corrugated', { color: 0x8b949c, ribs: 14, repeat: 3, size: 256, roughness: 0.5 }),
    dust: M.surface('fabric', { color: 0xcfcabd, repeat: 2, size: 256 }),
    skin: M.surface('metalPanel', { color: 0xa8b2ba, panels: 3, repeat: 2, size: 256, roughness: 0.3, metalness: 0.82 }),
  };

  const S = {
    dark: M.solid({ color: 0x1b2127, roughness: 0.6, metalness: 0.4 }),
    darker: M.solid({ color: 0x0d1115, roughness: 0.8 }),
    white: M.solid({ color: 0xe7ecef, roughness: 0.45, metalness: 0.25 }),
    trim: M.metal(0x8d979f, 0.35),
    trimDark: M.metal(0x475059, 0.5),
    rubberBlack: M.solid({ color: 0x14181b, roughness: 0.95 }),
    cushion: M.solid({ color: 0x39424b, roughness: 0.8 }),
    linen: M.solid({ color: 0xb9b2a2, roughness: 0.95 }),
    soil: M.solid({ color: 0x2b2a1c, roughness: 1 }),
    deadLeaf: M.solid({ color: 0x4d4632, roughness: 0.95, flat: true }),
    leafHot: M.solid({ color: 0x4f8a35, roughness: 0.85, flat: true }),
    glass: M.glassCheap({ color: 0x9fd0e0, opacity: 0.11 }),
    glassFloor: M.glassCheap({ color: 0x8fd8ee, opacity: 0.2 }),
    glassPod: M.glassCheap({ color: 0xb9e6f5, opacity: 0.24 }),
    coveCyan: M.emissive(0xa9ecff, 3.0),
    coveWhite: M.emissive(0xe8f6ff, 3.6),
    coveAmber: M.emissive(0xffb14a, 3.0),
    emRed: M.emissive(0xff2f1c, 4.0),
    emGreen: M.emissive(0x54ffa0, 4.0),
    emCyan: M.emissive(0x63d4ff, 4.5),
    emMagenta: M.emissive(0xff54d0, 3.4),
    emBlue: M.emissive(0x4aa8ff, 4.0),
  };

  // -------------------------------------------------------------------------
  // 3. LOCAL HELPERS
  // -------------------------------------------------------------------------

  const meshOf = (geo, mat, collide = false, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.userData.collide = collide;
    return m;
  };

  /**
   * Bake an emissive-dressing group. freeze() merges per material, so a run of
   * eighteen identical light panels collapses to a single draw call; the
   * animated screens keep their own (unique) materials and keep animating,
   * because freeze reuses the material instance.
   */
  const addLit = (parent, grp) => {
    const f = P.freeze(grp);
    f.traverse(o => { if (o.isMesh) { o.castShadow = false; o.userData.collide = false; } });
    if (parent) parent.add(f); else ctx.addDecor(f);
    return f;
  };

  /** Invisible collision box, centre origin. Invisible => no draw call. */
  const proxy = (w, h, d, x, y, z) => {
    const b = P.boxC(w, h, d, S.dark, { shadow: false });
    b.visible = false;
    b.userData.collide = true;
    b.position.set(x, y, z);
    return b;
  };

  // Stencilled text is memoised so repeated strings share one material (and
  // therefore collapse into one draw call after freeze()).
  const stencilCache = new Map();
  const stencil = (text, h, color = 0x9fb3bf, glow) => {
    const key = `${text}|${color}|${glow ?? 'x'}`;
    let entry = stencilCache.get(key);
    if (!entry) {
      const { material, aspect } = M.textMaterial(text, {
        color, fontSize: 74, emissive: glow, emissiveIntensity: glow ? 1.4 : 0,
      });
      entry = { material, aspect };
      stencilCache.set(key, entry);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(h * entry.aspect, h), entry.material);
    m.castShadow = false;
    m.userData.collide = false;
    return m;
  };

  // --- animated canvas screens (repainted at ~6 fps) -----------------------
  const animScreens = [];
  const screen = (w, h, draw, o = {}) => {
    const cw = o.cw ?? 256, ch = o.ch ?? 128;
    const mtl = M.painted(cw, ch, (g, W, H) => draw(g, W, H, 0), {
      transparent: false, emissive: 0xffffff, emissiveIntensity: o.glow ?? 1.5,
      roughness: 0.28, side: THREE.FrontSide, depthWrite: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mtl);
    mesh.castShadow = false;
    mesh.userData.collide = false;
    if (o.animate !== false) {
      animScreens.push({ mtl, draw, g2: mtl.map.image.getContext('2d'), W: cw, H: ch });
    }
    return mesh;
  };

  const drawGrid = (g, W, H, tint) => {
    g.fillStyle = '#03121b'; g.fillRect(0, 0, W, H);
    g.strokeStyle = tint ?? 'rgba(70,190,255,0.16)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
    for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  };

  const drawDiag = (seed) => (g, W, H, t) => {
    drawGrid(g, W, H);
    const rr = (n) => { const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453; return x - Math.floor(x); };
    g.font = '11px monospace';
    const rows = Math.floor(H / 12) - 1;
    const scroll = Math.floor(t * 3);
    for (let i = 0; i < rows; i++) {
      const k = i + scroll;
      const ok = rr(k) > 0.22;
      g.fillStyle = ok ? 'rgba(120,225,255,0.9)' : 'rgba(255,120,70,0.95)';
      const code = (0x1000 + Math.floor(rr(k * 3.7) * 0xefff)).toString(16).toUpperCase();
      g.fillText(`H9.${code}  ${ok ? 'NOMINAL' : 'FAULT  '}  ${(rr(k * 5.1) * 100).toFixed(1)}%`, 8, 16 + i * 12);
    }
    g.fillStyle = 'rgba(160,240,255,0.35)';
    g.fillRect(0, 0, W, 3);
  };

  const drawWave = (seed) => (g, W, H, t) => {
    drawGrid(g, W, H, 'rgba(70,255,190,0.12)');
    g.strokeStyle = 'rgba(90,255,190,0.95)'; g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const u = x / W * 8 + t * 2.4 + seed;
      const v = Math.sin(u) * 0.4 + Math.sin(u * 2.7 + seed) * 0.24 + Math.sin(u * 6.1) * 0.1;
      const y = H / 2 + v * H * 0.38;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(90,255,190,0.75)';
    g.font = 'bold 12px monospace';
    g.fillText('COOLANT LOOP B', 8, 16);
  };

  const drawWire = (g, W, H, t) => {
    drawGrid(g, W, H, 'rgba(255,190,90,0.10)');
    const cx = W / 2, cy = H / 2 + 6, s = Math.min(W, H) * 0.26;
    const ct = Math.cos(t * 0.9), st = Math.sin(t * 0.9);
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const x = (i & 1 ? 1 : -1), y = (i & 2 ? 1 : -1), z = (i & 4 ? 1 : -1);
      const xr = x * ct - z * st, zr = x * st + z * ct;
      pts.push([cx + xr * s, cy - (y * 0.82 + zr * 0.34) * s]);
    }
    g.strokeStyle = 'rgba(255,205,120,0.9)'; g.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) for (let b = 1; b < 8; b <<= 1) {
      if (i & b) continue;
      g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i | b][0], pts[i | b][1]); g.stroke();
    }
    g.strokeStyle = 'rgba(120,225,255,0.5)';
    g.beginPath(); g.ellipse(cx, cy, s * 1.9, s * 0.62, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,225,170,0.9)';
    g.font = 'bold 12px monospace';
    g.fillText('HULL INTEGRITY 41%', 8, 16);
  };

  const drawStatus = (label, bad) => (g, W, H) => {
    g.fillStyle = bad ? '#1a0705' : '#04141c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = bad ? 'rgba(255,90,60,0.8)' : 'rgba(110,220,255,0.7)';
    g.lineWidth = 3; g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = bad ? 'rgba(255,120,90,0.95)' : 'rgba(150,235,255,0.95)';
    g.font = 'bold 24px monospace'; g.textAlign = 'center';
    g.fillText(label, W / 2, H / 2 + 8);
    g.textAlign = 'left';
  };

  // Shared chevron / hazard stripe materials (one canvas each, reused).
  const chevMat = M.painted(128, 32, (g, W, H) => {
    g.fillStyle = '#161206'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8a022';
    for (let x = -H; x < W + H; x += 22) {
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + 11, H); g.lineTo(x + 11 + H, 0); g.lineTo(x + H, 0);
      g.closePath(); g.fill();
    }
  }, { transparent: false, roughness: 0.7, emissive: 0x2a1e06, emissiveIntensity: 0.5 });

  const hazMat = M.painted(128, 32, (g, W, H) => {
    g.fillStyle = '#20180a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f0a92a';
    for (let x = -H; x < W + H; x += 26) {
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + 13, H); g.lineTo(x + 13 + H, 0); g.lineTo(x + H, 0);
      g.closePath(); g.fill();
    }
  }, { transparent: false, roughness: 0.75, emissive: 0x241a05, emissiveIntensity: 0.6 });

  const softCard = (rgbA, rgbB, emis) => M.painted(128, 128, (g, W, H) => {
    const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    grad.addColorStop(0, rgbA); grad.addColorStop(0.55, rgbB); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  }, { transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: emis, emissiveIntensity: emis ? 0.8 : 0 });

  // -------------------------------------------------------------------------
  // 4. SPACE — starfield, planet, atmosphere shells, distant sun
  // -------------------------------------------------------------------------

  {
    // Starfield: one Points draw call on an 800 m shell (camera far = 900).
    const N = 2600;
    const sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const u = rStar() * 2 - 1, th = rStar() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u)), rr = 800;
      sp[i * 3] = Math.cos(th) * s * rr;
      sp[i * 3 + 1] = u * rr;
      sp[i * 3 + 2] = Math.sin(th) * s * rr;
      col.setHSL(0.55 + (rStar() - 0.5) * 0.18, 0.35 * rStar(), 0.4 + 0.6 * Math.pow(rStar(), 3));
      sc[i * 3] = col.r; sc[i * 3 + 1] = col.g; sc[i * 3 + 2] = col.b;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 2.3, sizeAttenuation: false, vertexColors: true,
      fog: false, depthWrite: false, transparent: true, opacity: 0.95,
    }));
    stars.frustumCulled = false;
    stars.renderOrder = -20;
    ctx.addDecor(stars);

    // The planet. fog:false everywhere out here or exp2 fog would eat it.
    const pt = ctx.tex('organic', { size: 512, repeat: 4, color: 0x2f7d86, wet: 0x0a2a46, seed: 4242 });
    // Placed so that from the viewing tier (r 75, eye ~2.4 m) the disc sits
    // about 23 deg below the horizon with a ~26 deg angular radius: it fills
    // the lower two thirds of the window with the limb near eye level.
    const planetGrp = new THREE.Group();
    planetGrp.position.set(620, -230, 60);
    planetGrp.rotation.z = 0.22;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(260, 56, 34), new THREE.MeshStandardMaterial({
      map: pt.map, normalMap: pt.normalMap, roughnessMap: pt.roughnessMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      emissive: new THREE.Color(0x1c5c6e), emissiveMap: pt.map, emissiveIntensity: 0.9,
      roughness: 1, metalness: 0, fog: false,
    }));
    planet.castShadow = false; planet.userData.collide = false;
    planetGrp.add(planet);
    for (const [rad, colr, op, ro] of [[257, 0x8fe0ff, 0.24, -8], [274, 0x5fc4f0, 0.11, -9]]) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(rad, 36, 22), new THREE.MeshBasicMaterial({
        color: colr, transparent: true, opacity: op, side: THREE.BackSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      sh.userData.collide = false; sh.renderOrder = ro;
      planetGrp.add(sh);
    }
    ctx.addDecor(planetGrp);

    // Distant sun, deliberately framed by the breach (which faces 236 deg).
    const sunPos = new THREE.Vector3(PX(770, 236), 150, PZ(770, 236));
    const sunCore = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff6e2, fog: false, depthWrite: false }));
    sunCore.position.copy(sunPos);
    sunCore.castShadow = false; sunCore.userData.collide = false;
    const flareMat = M.painted(128, 128, (g, W, H) => {
      const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      grad.addColorStop(0, 'rgba(255,250,235,1)');
      grad.addColorStop(0.12, 'rgba(255,236,200,0.55)');
      grad.addColorStop(0.4, 'rgba(150,200,255,0.14)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
    }, { transparent: true, emissive: 0xffffff, emissiveIntensity: 2.4, side: THREE.DoubleSide, depthWrite: false });
    flareMat.blending = THREE.AdditiveBlending;
    flareMat.fog = false;
    const flare = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), flareMat);
    flare.position.copy(sunPos);
    flare.lookAt(0, 0, 0);
    flare.castShadow = false; flare.userData.collide = false; flare.renderOrder = -7;
    ctx.addDecor(sunCore, flare);

    ctx.onUpdate((dt) => { planetGrp.rotation.y += dt * 0.012; });
  }

  // -------------------------------------------------------------------------
  // 5. THE HUB (landmark 2) — 5-deck atrium, spiral ramp, glass bridge, holo
  // -------------------------------------------------------------------------

  const HUB_R = 15;
  const DECK_H = 4.4;
  const HUB_TOP = DECK_H * 5;          // 22 m
  const SPOKES = [0, 90, 180, 270];
  const RAMP_R0 = 9.9, RAMP_R1 = 13.35;
  const BRIDGE_Y = DECK_H * 4;         // 17.6 — deck E

  {
    const shell = new THREE.Group();   // frozen dressing
    const lit = new THREE.Group();     // emissives, kept out of the freeze

    // Deck A floor.
    ctx.add(meshOf(arcFloorGeo(0.001, HUB_R, 0, 360, 0, 0, 64, 5), MAT.stone, true, false));

    // Shaft wall, gapped at the four spoke mouths (lintels close them above).
    for (const [a0, a1] of spansWithGaps(SPOKES.map(a => [a - 9.5, a + 9.5]))) {
      const segs = Math.max(2, Math.round((a1 - a0) / 3));
      ctx.add(meshOf(arcWallGeo(HUB_R, a0, a1, 0, HUB_TOP, segs, 4.5, true), MAT.hexPale, true));
    }
    for (const a of SPOKES) {
      ctx.add(meshOf(arcWallGeo(HUB_R, a - 9.5, a + 9.5, 4.2, HUB_TOP, 6, 4.5, true), MAT.hexPale, false));
    }

    // Dome cap.
    ctx.addDecor(meshOf(arcFloorGeo(0.001, HUB_R + 0.6, 0, 360, HUB_TOP + 0.8, HUB_TOP + 0.8, 48, 6, true), MAT.ceil, false));
    ctx.addDecor(meshOf(arcWallGeo(HUB_R + 0.6, 0, 360, HUB_TOP, HUB_TOP + 0.8, 48, 3, true), MAT.struct, false));

    // --- balconies. Deck E is interrupted where the connector ramp climbs. --
    const deckSpans = {
      1: [[0, 360]], 2: [[0, 360]], 3: [[0, 360]], 4: [[0, 140], [200, 360]],
    };
    for (let d = 1; d <= 4; d++) {
      const y = d * DECK_H;
      for (const [a0, a1] of deckSpans[d]) {
        const segs = Math.max(4, Math.round((a1 - a0) / 6));
        ctx.add(meshOf(arcFloorGeo(13.4, HUB_R, a0, a1, y, y, segs, 3), MAT.grate, true, false));
        shell.add(meshOf(arcFloorGeo(13.4, HUB_R, a0, a1, y - 0.22, y - 0.22, segs, 3, true), MAT.hullBig, false));
        shell.add(meshOf(arcWallGeo(13.4, a0, a1, y - 0.24, y, segs, 2), MAT.struct, false));
        shell.add(meshOf(arcWallGeo(13.42, a0, a1, y + 1.0, y + 1.07, segs, 2), S.trim, false));
        lit.add(meshOf(arcWallGeo(13.38, a0, a1, y + 0.88, y + 1.0, segs, 2), S.coveCyan, false, false));
        // invisible barrier so a five-deck balcony isn't a five-deck drop
        const bar = meshOf(arcWallGeo(13.4, a0, a1, y, y + 1.1, Math.max(3, segs >> 1), 2), S.dark, true, false);
        bar.visible = false;
        ctx.add(bar);
      }
      // instanced rail posts
      const post = new THREE.CylinderGeometry(0.028, 0.028, 1.0, 6);
      post.translate(0, 0.5, 0);
      const posts = P.scatter(post, S.trim, 72, (i, dm) => {
        const a = i * 5;
        if (d === 4 && a > 140 && a < 200) return false;
        dm.position.set(PX(13.42, a), y, PZ(13.42, a));
      }, 7 + d);
      posts.castShadow = false;
      ctx.addDecor(posts);

      const pl = stencil(`DECK ${'ABCDE'[d]}`, 0.32, 0xbcd6e4, 0x2a4f66);
      pl.position.set(PX(14.85, 34), y + 2.0, PZ(14.85, 34));
      pl.rotation.y = YAW_T(34);
      shell.add(pl);
    }

    // --- spiral ramp: three helicoid turns, deck A -> deck D ----------------
    for (let turn = 0; turn < 3; turn++) {
      const y0 = turn * DECK_H, y1 = (turn + 1) * DECK_H;
      ctx.add(meshOf(arcFloorGeo(RAMP_R0, RAMP_R1, 0, 360, y0, y1, 48, 3), MAT.grateDS, true));
      ctx.add(meshOf(arcWallGeo(RAMP_R0, 0, 360, 0, 1.02, 48, 2, false, y0, y1), MAT.hullDS, true));
      lit.add(meshOf(arcWallGeo(RAMP_R0 - 0.03, 0, 360, 0.86, 0.98, 48, 2, false, y0, y1), S.coveCyan, false, false));
      shell.add(meshOf(arcWallGeo(RAMP_R1 + 0.01, 0, 360, 0, 0.16, 48, 2, false, y0, y1), S.trimDark, false));
    }
    for (let d = 1; d <= 3; d++) {
      ctx.add(meshOf(arcFloorGeo(RAMP_R1 - 0.05, 13.45, -7, 7, d * DECK_H, d * DECK_H, 6, 2), MAT.grate, true, false));
    }
    // deck D -> deck E connector ramp, riding the balcony annulus
    ctx.add(meshOf(arcFloorGeo(13.4, HUB_R, 140, 200, DECK_H * 3, BRIDGE_Y, 14, 3), MAT.grate, true));
    ctx.add(meshOf(arcWallGeo(13.4, 140, 200, 0, 1.05, 14, 2, false, DECK_H * 3, BRIDGE_Y), MAT.hullDS, true));
    lit.add(meshOf(arcWallGeo(13.37, 140, 200, 0.9, 1.02, 14, 2, false, DECK_H * 3, BRIDGE_Y), S.coveCyan, false, false));

    // --- glass bridge across the shaft at deck E ----------------------------
    {
      const bvis = new THREE.Group();
      for (let i = -6; i <= 6; i++) {
        const rib = P.boxC(3.3, 0.16, 0.12, S.trimDark, { shadow: false });
        rib.position.set(0, BRIDGE_Y - 0.2, i * 2.1);
        rib.userData.collide = false;
        bvis.add(rib);
      }
      for (const sx of [-1, 1]) {
        const rail = P.railing(26.8, 1.0, S.trim);
        rail.rotation.y = Math.PI / 2;
        rail.position.set(sx * 1.6, BRIDGE_Y, 0);
        bvis.add(rail);
      }
      ctx.addDecor(P.freeze(bvis));
      // glass deck stays a real mesh so it reads as transparent
      const deck = P.boxC(3.2, 0.14, 26.8, S.glassFloor, { shadow: false });
      deck.position.set(0, BRIDGE_Y - 0.07, 0);
      deck.userData.collide = true;
      ctx.add(deck);
      for (const sx of [-1, 1]) {
        const lr = P.boxC(0.06, 0.07, 26.8, S.coveWhite, { shadow: false });
        lr.position.set(sx * 1.62, BRIDGE_Y + 0.98, 0);
        lr.userData.collide = false;
        lit.add(lr);
        ctx.add(proxy(0.12, 1.1, 26.8, sx * 1.62, BRIDGE_Y + 0.55, 0));
      }
    }

    // --- holographic station schematic --------------------------------------
    {
      const holo = new THREE.Group();
      holo.position.set(0, 11.5, 0);
      const hm = M.emissive(0x7fe4ff, 2.6, { transparent: true, opacity: 0.42, side: THREE.DoubleSide });
      const hm2 = M.emissive(0xffd27f, 2.4, { transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.055, 6, 72), hm);
      ringOuter.rotation.x = Math.PI / 2;
      const ringMid = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.04, 6, 56), hm);
      ringMid.rotation.x = Math.PI / 2;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 14, 1, true), hm);
      holo.add(ringOuter, ringMid, core);
      for (let i = 0; i < 8; i++) {
        const a = i * 45;
        const spk = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 0.06), hm);
        spk.position.set(PX(2.8, a), 0, PZ(2.8, a));
        spk.rotation.y = YAW_R(a);
        holo.add(spk);
        const blk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.1), i === 5 ? hm2 : hm);
        blk.position.set(PX(4.6, a + 22), 0, PZ(4.6, a + 22));
        blk.rotation.y = YAW_R(a + 22);
        holo.add(blk);
      }
      const scan = new THREE.Mesh(new THREE.RingGeometry(0.8, 5.2, 40),
        M.emissive(0x9ff0ff, 1.6, { transparent: true, opacity: 0.13, side: THREE.DoubleSide }));
      scan.rotation.x = -Math.PI / 2;
      holo.add(scan);
      holo.traverse(o => { if (o.isMesh) { o.userData.collide = false; o.castShadow = false; } });
      ctx.addDecor(holo);
      ctx.onUpdate((dt, t) => {
        holo.rotation.y += dt * 0.22;
        scan.position.y = Math.sin(t * 0.5) * 1.5;
        scan.material.opacity = 0.09 + 0.07 * (0.5 + 0.5 * Math.sin(t * 1.3));
      });
      const ped = P.cyl(1.5, 1.9, 0.5, MAT.struct);
      ctx.addSolid(ped);
      const lens = P.cyl(1.25, 1.25, 0.06, S.emCyan, { collide: false, shadow: false });
      lens.position.y = 0.5;
      ctx.addDecor(lens);
    }

    // --- deck-A dressing -----------------------------------------------------
    for (let i = 0; i < 6; i++) {
      const a = 30 + i * 60;
      const b = P.boxC(2.2, 1.05, 0.7, MAT.hull, { shadow: false });
      b.position.set(PX(14.2, a), 0.52, PZ(14.2, a));
      b.rotation.y = YAW_T(a);
      b.userData.collide = false;
      shell.add(b);
      const bp = proxy(2.2, 1.05, 0.7, PX(14.2, a), 0.52, PZ(14.2, a));
      bp.rotation.y = YAW_T(a);
      ctx.add(bp);
      const sc = screen(1.7, 0.66, i % 2 ? drawDiag(i * 3 + 1) : drawWave(i * 1.7),
        { animate: i < 2, cw: 256, ch: 100, glow: 1.6 });
      sc.position.set(PX(14.72, a), 1.75, PZ(14.72, a));
      sc.rotation.y = YAW_T(a);
      lit.add(sc);
    }
    const sheet = P.boxC(2.6, 0.04, 1.6, MAT.dust, { shadow: false });
    sheet.position.set(PX(11.5, 205), 1.15, PZ(11.5, 205));
    sheet.rotation.set(0.05, YAW_T(205), -0.03);
    sheet.userData.collide = false;
    shell.add(sheet);
    ctx.add(proxy(2.6, 1.2, 1.6, PX(11.5, 205), 0.6, PZ(11.5, 205)));

    ctx.addDecor(P.freeze(shell));
    addLit(null, lit);
  }

  // -------------------------------------------------------------------------
  // 6. RING CORRIDOR + SPOKES — curved throughout, ribbed every ~3 m
  // -------------------------------------------------------------------------

  const RING_MID = 40, RING_IN = 37.5, RING_OUT = 42.5, CORR_H = 4.2;

  const ZONE_DOORS = [
    { a: 0, half: 10, label: 'OBSERVATION' },      // wide proscenium
    { a: 80, half: 3.0, label: 'CREW · A-DECK' },
    { a: 130, half: 3.0, label: 'HYDROPONICS' },
    { a: 180, half: 3.4, label: 'ENGINEERING' },
    { a: 236, half: 3.0, label: 'SEC 09 — SEALED' },
    { a: 292, half: 4.0, label: 'DOCKING 1' },
  ];

  // shared rib profile (an inverted U spanning the corridor radially)
  const ribW = RING_OUT - RING_IN + 0.1, ribH = CORR_H - 0.32, ribT = 0.22, ribD = 0.26;
  const ribGeo = P.mergeGeometries([
    new THREE.BoxGeometry(ribT, ribH, ribD).translate(-ribW / 2, ribH / 2, 0),
    new THREE.BoxGeometry(ribT, ribH, ribD).translate(ribW / 2, ribH / 2, 0),
    new THREE.BoxGeometry(ribW + ribT, ribT, ribD).translate(0, ribH + ribT / 2, 0),
  ]);

  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();

    ctx.add(meshOf(arcFloorGeo(RING_IN, RING_OUT, 0, 360, 0, 0, 128, 3), MAT.grate, true, false));
    ctx.addDecor(meshOf(arcFloorGeo(RING_IN, RING_OUT, 0, 360, CORR_H, CORR_H, 96, 3, true), MAT.ceil, false));

    // Inner wall, gapped at the spokes.
    for (const [a0, a1] of spansWithGaps(SPOKES.map(a => [a - 3.8, a + 3.8]))) {
      const segs = Math.max(2, Math.round((a1 - a0) / 2.2));
      ctx.add(meshOf(arcWallGeo(RING_IN, a0, a1, 0, CORR_H, segs, 3, false), MAT.hullDS, true));
    }
    for (const a of SPOKES) {
      shell.add(meshOf(arcWallGeo(RING_IN, a - 3.8, a + 3.8, 3.0, CORR_H, 4, 3, false), MAT.hull, false));
    }

    // Outer wall, gapped at the six zone doors. DoubleSide: the far face is
    // the inner wall of the observation hall.
    for (const [a0, a1] of spansWithGaps(ZONE_DOORS.map(d => [d.a - d.half, d.a + d.half]))) {
      const segs = Math.max(2, Math.round((a1 - a0) / 2.2));
      ctx.add(meshOf(arcWallGeo(RING_OUT, a0, a1, 0, CORR_H, segs, 3, true), MAT.hullDS, true));
    }
    for (const d of ZONE_DOORS) {
      if (d.a === 0) continue;   // the hall keeps a full-height proscenium
      shell.add(meshOf(arcWallGeo(RING_OUT, d.a - d.half, d.a + d.half, 3.0, CORR_H, 4, 3, true), MAT.hull, false));
    }

    // Cove lighting tucked behind the ribs, plus a floor guide line.
    lit.add(meshOf(arcFloorGeo(RING_IN + 0.06, RING_IN + 0.5, 0, 360, 3.42, 3.42, 96, 2, true), S.coveWhite, false, false));
    lit.add(meshOf(arcFloorGeo(RING_OUT - 0.5, RING_OUT - 0.06, 0, 360, 3.42, 3.42, 96, 2, true), S.coveWhite, false, false));
    lit.add(meshOf(arcWallGeo(RING_IN + 0.04, 0, 360, 3.42, 3.62, 96, 2, false), S.coveCyan, false, false));
    lit.add(meshOf(arcWallGeo(RING_OUT - 0.04, 0, 360, 3.42, 3.62, 96, 2, true), S.coveCyan, false, false));
    lit.add(meshOf(arcFloorGeo(RING_MID - 0.09, RING_MID + 0.09, 0, 360, 0.015, 0.015, 96, 2), S.emBlue, false, false));

    // --- instanced ribs, bolts, ceiling bars --------------------------------
    const RIBS = 84;   // 251 m circumference / 3 m
    const ribInst = P.scatter(ribGeo, MAT.struct, RIBS, (i, dm) => {
      const a = (i / RIBS) * 360;
      dm.position.set(PX(RING_MID, a), 0, PZ(RING_MID, a));
      dm.rotation.y = YAW_R(a);
    }, 11);
    ribInst.castShadow = false;
    ctx.addDecor(ribInst);

    const boltGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.035, 6);
    boltGeo.rotateZ(Math.PI / 2);           // axis -> +X, so YAW_R aims it radially
    const bolts = P.scatter(boltGeo, S.trimDark, RIBS * 4, (i, dm) => {
      const rib = Math.floor(i / 4), k = i % 4;
      const a = (rib / RIBS) * 360 + (k < 2 ? -0.35 : 0.35);
      const rr = (k % 2 === 0) ? RING_IN + 0.16 : RING_OUT - 0.16;
      dm.position.set(PX(rr, a), 0.9 + (k % 2) * 1.3, PZ(rr, a));
      dm.rotation.y = YAW_R(a);
    }, 12);
    bolts.castShadow = false;
    ctx.addDecor(bolts);

    const bars = P.scatter(new THREE.BoxGeometry(1.7, 0.05, 0.22), S.coveWhite, 60, (i, dm) => {
      const a = (i / 60) * 360 + 3;
      if (a > 200 && a < 250 && (i % 3 !== 0)) return false;   // dead stretch
      dm.position.set(PX(RING_MID, a), CORR_H - 0.09, PZ(RING_MID, a));
      dm.rotation.y = YAW_R(a);
    }, 13);
    bars.castShadow = false;
    ctx.addDecor(bars);

    // --- door panels, bulkhead stencils, status LEDs ------------------------
    const secNames = ['SEC 01', 'SEC 02', 'SEC 03', 'SEC 04', 'SEC 05', 'SEC 06'];
    for (let i = 0; i < 24; i++) {
      const a = i * 15 + 7.5;
      const inner = i % 2 === 0;
      const rr = inner ? RING_IN + 0.12 : RING_OUT - 0.12;
      const face = YAW_T(a) + (inner ? Math.PI : 0);   // inner wall faces outward
      const push = inner ? 0.06 : -0.06;

      const dp = P.boxC(2.0, 2.5, 0.1, MAT.hex, { shadow: false });
      dp.position.set(PX(rr, a), 1.25, PZ(rr, a));
      dp.rotation.y = face;
      dp.userData.collide = false;
      shell.add(dp);

      const seam = P.boxC(0.04, 2.4, 0.03, S.darker, { shadow: false });
      seam.position.set(PX(rr + push, a), 1.25, PZ(rr + push, a));
      seam.rotation.y = face;
      seam.userData.collide = false;
      shell.add(seam);

      const led = P.boxC(0.13, 0.05, 0.03, (i % 7 === 3) ? S.emRed : (i % 5 === 0 ? S.coveAmber : S.emGreen), { shadow: false });
      led.position.set(PX(rr + push * 1.4, a), 2.0, PZ(rr + push * 1.4, a));
      led.rotation.y = face;
      led.userData.collide = false;
      lit.add(led);

      const txt = (i % 4 === 1) ? 'H9-DECK-A' : secNames[(i >> 1) % secNames.length];
      const st = stencil(txt, 0.24, 0x8fa6b3);
      st.position.set(PX(rr + push * 1.4, a + 1.5), 2.5, PZ(rr + push * 1.4, a + 1.5));
      st.rotation.y = face;
      shell.add(st);
    }

    // hazard chevrons + over-door signage at every zone mouth
    for (const d of ZONE_DOORS) {
      for (const s of [-1, 1]) {
        const a = d.a + s * (d.half + 0.7);
        const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.0), chevMat);
        ch.position.set(PX(RING_OUT - 0.11, a), 1.55, PZ(RING_OUT - 0.11, a));
        ch.rotation.y = YAW_T(a);
        ch.castShadow = false; ch.userData.collide = false;
        shell.add(ch);
      }
      const sg = stencil(d.label, 0.3, 0xd6ecf7, 0x1d4a63);
      sg.position.set(PX(RING_OUT - 0.13, d.a), 3.55, PZ(RING_OUT - 0.13, d.a));
      sg.rotation.y = YAW_T(d.a);
      lit.add(sg);
    }

    // --- decay: the stretch where every ceiling panel has fallen ------------
    for (let i = 0; i < 16; i++) {
      const a = 206 + i * 2.6;
      const rr = RING_MID + rCorr.range(-1.2, 1.2);
      const pnl = P.boxC(2.0, 0.05, 1.3, MAT.ceil, { shadow: false });
      pnl.position.set(PX(rr, a), 0.06, PZ(rr, a));
      pnl.rotation.set(rCorr.range(-0.14, 0.14), YAW_R(a) + rCorr.range(-0.5, 0.5), rCorr.range(-0.1, 0.1));
      pnl.userData.collide = false;
      shell.add(pnl);
      const cd = P.boxC(2.4, 0.1, 0.1, S.trimDark, { shadow: false });
      cd.position.set(PX(RING_MID + 0.7, a), CORR_H - 0.28, PZ(RING_MID + 0.7, a));
      cd.rotation.y = YAW_T(a);
      cd.userData.collide = false;
      shell.add(cd);
    }
    // cabling spilling out of a sprung wall panel
    for (let i = 0; i < 9; i++) {
      const a = 214 + i * 0.35;
      const c = P.cyl(0.024, 0.024, rCorr.pick([1.2, 1.7, 2.2]),
        i % 3 ? S.rubberBlack : M.solid({ color: 0x8a2a2a, roughness: 0.9 }),
        { seg: 5, collide: false, shadow: false });
      c.position.set(PX(RING_OUT - 0.2, a), 2.6, PZ(RING_OUT - 0.2, a));
      c.rotation.set(rCorr.range(-0.5, 0.5), YAW_T(a), rCorr.range(0.6, 1.5));
      shell.add(c);
    }
    const hang = P.boxC(1.4, 1.6, 0.06, MAT.hex, { shadow: false });
    hang.position.set(PX(RING_OUT - 0.35, 215), 2.2, PZ(RING_OUT - 0.35, 215));
    hang.rotation.set(0, YAW_T(215), 0.55);
    hang.userData.collide = false;
    shell.add(hang);

    // emergency locker hanging open
    {
      const a = 118, face = YAW_T(a) + Math.PI;
      const lk = P.boxC(0.9, 1.5, 0.34, M.solid({ color: 0xc4342a, roughness: 0.55 }), { shadow: false });
      lk.position.set(PX(RING_IN + 0.28, a), 1.4, PZ(RING_IN + 0.28, a));
      lk.rotation.y = face;
      lk.userData.collide = false;
      shell.add(lk);
      const dr = P.boxC(0.86, 1.44, 0.05, S.white, { shadow: false });
      dr.position.set(PX(RING_IN + 0.8, a + 1.1), 1.4, PZ(RING_IN + 0.8, a + 1.1));
      dr.rotation.y = face + 1.05;
      dr.userData.collide = false;
      shell.add(dr);
      const st = stencil('EMERG', 0.16, 0xffffff);
      st.position.set(PX(RING_IN + 0.46, a), 1.95, PZ(RING_IN + 0.46, a));
      st.rotation.y = face;
      shell.add(st);
    }

    // --- the four spokes ----------------------------------------------------
    for (let si = 0; si < SPOKES.length; si++) {
      const a = SPOKES[si];
      const sg = new THREE.Group();
      sg.position.set(PX((HUB_R + RING_IN) / 2, a), 0, PZ((HUB_R + RING_IN) / 2, a));
      sg.rotation.y = YAW_R(a);          // local +X runs radially
      const len = RING_IN - HUB_R;       // 22.5 m
      const svis = new THREE.Group();

      const fl = P.boxC(len, 0.2, 5.0, MAT.grate, { shadow: false });
      fl.position.y = -0.1; fl.userData.collide = true;
      sg.add(fl);
      for (const sz of [-1, 1]) {
        const w = P.boxC(len, CORR_H, 0.3, MAT.hull, { shadow: false });
        w.position.set(0, CORR_H / 2, sz * 2.65);
        w.userData.collide = true;
        sg.add(w);
        const cove = P.boxC(len - 0.4, 0.1, 0.14, S.coveWhite, { shadow: false });
        cove.position.set(0, 3.45, sz * 2.42);
        cove.userData.collide = false;
        sg.add(cove);
      }
      const cl = P.boxC(len, 0.2, 5.3, MAT.ceil, { shadow: false });
      cl.position.y = CORR_H + 0.1; cl.userData.collide = false;
      sg.add(cl);
      for (let i = 0; i < 7; i++) {
        const rb = new THREE.Mesh(ribGeo, MAT.struct);
        rb.rotation.y = Math.PI / 2;
        rb.position.set(-len / 2 + 1.6 + i * 3.2, 0, 0);
        rb.castShadow = false; rb.userData.collide = false;
        svis.add(rb);
      }
      const sn = stencil(`SPOKE ${si + 1}`, 0.28, 0xbfd8e6, 0x1d4a63);
      sn.position.set(-len / 2 + 0.4, 3.4, 2.48);
      svis.add(sn);
      sg.add(P.NOCOLLIDE(P.freeze(svis)));
      ctx.add(sg);
    }

    ctx.addDecor(P.freeze(shell));
    addLit(null, lit);
  }

  // -------------------------------------------------------------------------
  // 7. THE OBSERVATION HALL (landmark 1)
  //    Curved gallery r 42.5..78, -42..+42, 9 m tall, all glass outboard.
  // -------------------------------------------------------------------------

  const HALL_A0 = -42, HALL_A1 = 42, HALL_R1 = 78, HALL_H = 9;

  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();

    ctx.add(meshOf(arcFloorGeo(RING_OUT, 64, HALL_A0, HALL_A1, 0, 0, 72, 5), MAT.stone, true, false));
    ctx.addDecor(meshOf(arcFloorGeo(RING_OUT, HALL_R1, HALL_A0, HALL_A1, HALL_H, HALL_H, 56, 6, true), MAT.ceil, false));
    // hall-side face of the corridor wall, above the corridor roof
    ctx.add(meshOf(arcWallGeo(RING_OUT, HALL_A0, HALL_A1, CORR_H, HALL_H, 48, 4, false), MAT.hexPale, false));

    for (const a of [HALL_A0, HALL_A1]) {
      ctx.addSolid(P.wallBetween(PX(RING_OUT, a), PZ(RING_OUT, a), PX(HALL_R1, a), PZ(HALL_R1, a), HALL_H, 0.5, MAT.hull));
    }

    // --- viewing tiers rising toward the glass, with an access ramp ---------
    const TIERS = [[64, 68, 0.28], [68, 72, 0.56], [72, 77.6, 0.84]];
    const TIER_SPANS = [[HALL_A0, 27], [39, HALL_A1]];
    for (const [r0, r1, y] of TIERS) {
      for (const [a0, a1] of TIER_SPANS) {
        const segs = Math.max(4, Math.round((a1 - a0) / 1.4));
        ctx.add(meshOf(arcFloorGeo(r0, r1, a0, a1, y, y, segs, 5), MAT.stone, true, false));
        ctx.add(meshOf(arcWallGeo(r0, a0, a1, y - 0.29, y, segs, 2, true), MAT.hull, true));
        lit.add(meshOf(arcWallGeo(r0 - 0.02, a0, a1, y - 0.1, y - 0.03, segs, 2, true), S.coveWhite, false, false));
      }
    }
    ctx.add(meshOf(arcFloorGeo(64, 77.6, 27, 39, 0, 0.84, 14, 5), MAT.grate, true, false));

    // --- THE WINDOW ----------------------------------------------------------
    // No shadow casting: this is where the planetshine gets in.
    const pane = meshOf(arcWallGeo(HALL_R1, HALL_A0, HALL_A1, 0, HALL_H, 96, 6, true), S.glass, true, false);
    pane.renderOrder = 2;
    ctx.add(pane);
    const mulGeo = new THREE.BoxGeometry(0.16, HALL_H, 0.4);
    mulGeo.translate(0, HALL_H / 2, 0);
    const muls = P.scatter(mulGeo, MAT.struct, 29, (i, dm) => {
      const a = HALL_A0 + (i / 28) * (HALL_A1 - HALL_A0);
      dm.position.set(PX(HALL_R1 - 0.22, a), 0, PZ(HALL_R1 - 0.22, a));
      dm.rotation.y = YAW_T(a);
    }, 21);
    muls.castShadow = false;
    ctx.addDecor(muls);
    shell.add(meshOf(arcWallGeo(HALL_R1 - 0.22, HALL_A0, HALL_A1, 0.84, 1.1, 72, 3, true), MAT.struct, false, false));
    shell.add(meshOf(arcWallGeo(HALL_R1 - 0.22, HALL_A0, HALL_A1, 8.4, 8.8, 72, 3, true), MAT.struct, false, false));
    lit.add(meshOf(arcWallGeo(HALL_R1 - 0.3, HALL_A0, HALL_A1, 0.9, 1.02, 72, 3, true), S.coveCyan, false, false));

    // --- dry fountain ---------------------------------------------------------
    {
      const fx = PX(53, 0), fz = PZ(53, 0);
      const basin = P.cyl(3.4, 3.6, 0.55, MAT.stone);
      basin.position.set(fx, 0, fz);
      ctx.addSolid(basin);
      const stalk = P.cyl(0.22, 0.4, 1.9, MAT.stone);
      stalk.position.set(fx, 0.55, fz);
      ctx.addSolid(stalk);
      const inner = P.cyl(2.9, 2.9, 0.12, M.solid({ color: 0x2f3a3e, roughness: 0.75 }), { collide: false, shadow: false });
      inner.position.set(fx, 0.44, fz);
      shell.add(inner);
      const bowl = P.cyl(1.15, 0.5, 0.3, MAT.stone, { collide: false, shadow: false });
      bowl.position.set(fx, 2.4, fz);
      shell.add(bowl);
      const grit = P.rubble(2.4, 12, M.solid({ color: 0x5e5b53, roughness: 0.95 }), 5);
      grit.position.set(fx, 0.5, fz);
      shell.add(P.NOCOLLIDE(grit));
      ctx.hidingSpot(PX(57, 0), 0, PZ(57, 0), 1.5, 0.7);
    }

    // --- planters with dead vegetation ---------------------------------------
    const planterAngles = [-33, -20, 20, 33, -27, 27];
    for (let i = 0; i < planterAngles.length; i++) {
      const a = planterAngles[i];
      const rr = i < 4 ? 49 : 60;
      const x = PX(rr, a), z = PZ(rr, a);
      const box = P.boxC(3.4, 0.7, 1.8, MAT.stone, { shadow: false });
      box.position.set(x, 0.35, z);
      box.rotation.y = YAW_T(a);
      box.userData.collide = false;
      shell.add(box);
      const bxp = proxy(3.4, 0.7, 1.8, x, 0.35, z);
      bxp.rotation.y = YAW_T(a);
      ctx.add(bxp);
      const soil = P.boxC(3.0, 0.06, 1.45, S.soil, { shadow: false });
      soil.position.set(x, 0.71, z);
      soil.rotation.y = YAW_T(a);
      soil.userData.collide = false;
      shell.add(soil);
      for (let k = 0; k < 5; k++) {
        const b = P.bush(rHall.pick([0.3, 0.4, 0.5]), 0x4a4130, 40 + i * 7 + k);
        b.position.set(x + rHall.range(-1.2, 1.2), 0.7, z + rHall.range(-0.5, 0.5));
        shell.add(P.NOCOLLIDE(b));
        const tw = P.cyl(0.015, 0.025, rHall.pick([0.7, 1.0, 1.3]), S.deadLeaf, { seg: 4, collide: false, shadow: false });
        tw.position.set(x + rHall.range(-1.2, 1.2), 0.72, z + rHall.range(-0.5, 0.5));
        tw.rotation.set(rHall.range(-0.3, 0.3), 0, rHall.range(-0.3, 0.3));
        shell.add(tw);
      }
      if (i % 3 === 0) ctx.hidingSpot(x, 0, z + (i < 4 ? 1.7 : -1.7), 1.3, 0.6);
    }

    // --- benches on the tiers -------------------------------------------------
    for (let i = 0; i < 12; i++) {
      const a = -36 + i * 6.5;
      const rr = 66 + (i % 3) * 4;
      const yb = rr < 68 ? 0.28 : (rr < 72 ? 0.56 : 0.84);
      const seat = P.boxC(2.6, 0.14, 0.5, MAT.stone, { shadow: false });
      seat.position.set(PX(rr, a), yb + 0.46, PZ(rr, a));
      seat.rotation.y = YAW_T(a);
      seat.userData.collide = false;
      shell.add(seat);
      const ped = P.boxC(2.2, 0.46, 0.34, S.trimDark, { shadow: false });
      ped.position.set(PX(rr, a), yb + 0.23, PZ(rr, a));
      ped.rotation.y = YAW_T(a);
      ped.userData.collide = false;
      shell.add(ped);
    }

    // --- drifting dust motes ---------------------------------------------------
    const motes = P.scatter(new THREE.IcosahedronGeometry(0.06, 0), S.white, 220, (i, dm, rr) => {
      const a = rr.range(HALL_A0 + 3, HALL_A1 - 3), rad = rr.range(46, 76);
      dm.position.set(PX(rad, a), rr.range(0.6, 8.0), PZ(rad, a));
      dm.scale.setScalar(rr.range(0.4, 1.4));
    }, 33);
    motes.castShadow = false;
    ctx.addDecor(motes);
    ctx.onUpdate((dt, t) => { motes.rotation.y = Math.sin(t * 0.05) * 0.006; });

    // --- signage, a big animated readout, pendant uplights --------------------
    const bigScreen = screen(4.2, 1.7, drawWire, { cw: 384, ch: 156, glow: 1.7 });
    bigScreen.position.set(PX(RING_OUT + 0.12, -26), 4.2, PZ(RING_OUT + 0.12, -26));
    bigScreen.rotation.y = YAW_T(-26) + Math.PI;
    lit.add(bigScreen);

    const hallSign = stencil('HALO NINE\nOBSERVATION GALLERY', 0.52, 0xe4f4ff, 0x2b6a86);
    hallSign.position.set(PX(RING_OUT + 0.12, 24), 5.4, PZ(RING_OUT + 0.12, 24));
    hallSign.rotation.y = YAW_T(24) + Math.PI;
    lit.add(hallSign);

    for (let i = 0; i < 9; i++) {
      const a = -32 + i * 8, rr = 52 + (i % 2) * 8;
      const cord = P.cyl(0.02, 0.02, 2.4, S.trimDark, { seg: 4, collide: false, shadow: false });
      cord.position.set(PX(rr, a), HALL_H - 2.4, PZ(rr, a));
      shell.add(cord);
      const disc = P.cyl(0.55, 0.55, 0.1, S.coveWhite, { seg: 14, collide: false, shadow: false });
      disc.position.set(PX(rr, a), HALL_H - 2.5, PZ(rr, a));
      lit.add(disc);
    }

    ctx.addDecor(P.freeze(shell));
    addLit(null, lit);
  }

  // -------------------------------------------------------------------------
  // Zone module helper — a rectangular room tangent to the ring at r = 42.5.
  // Local +X = CCW tangent, local +Z = inward (toward the corridor).
  // -------------------------------------------------------------------------

  function zoneModule(aDeg, w, d, h, doorW, mats, o = {}) {
    const g = new THREE.Group();
    const rc = RING_OUT + d / 2;
    g.position.set(PX(rc, aDeg), 0, PZ(rc, aDeg));
    g.rotation.y = YAW_T(aDeg);
    const walls = P.roomShell({
      w, d, h, thickness: 0.4, material: mats.wall,
      doors: [{ side: 's', at: 0.5, width: doorW, top: 3.0 }],
    });
    P.COLLIDE(walls);
    g.add(walls);
    if (!o.noFloor) {
      const fl = P.ground(w, d, mats.floor);
      fl.userData.collide = true;
      g.add(fl);
    }
    const cl = P.ceiling(w + 0.4, d + 0.4, h, mats.ceil ?? MAT.ceil);
    cl.userData.collide = false; cl.castShadow = false;
    g.add(cl);
    ctx.add(g);
    return g;
  }

  const _v = new THREE.Vector3();
  /** Zone-local (x,z) -> world position. */
  function l2w(g, x, z) {
    g.updateMatrixWorld(true);
    return _v.set(x, 0, z).applyMatrix4(g.matrixWorld).clone();
  }

  // -------------------------------------------------------------------------
  // 8. CREW DECK — six cabins, galley, med-bay
  // -------------------------------------------------------------------------

  const CREW_W = 34, CREW_D = 26, CREW_H = 4.4;
  const crew = zoneModule(80, CREW_W, CREW_D, CREW_H, 4, { wall: MAT.hull, floor: MAT.grate });
  {
    const shell = new THREE.Group();   // frozen visuals
    const lit = new THREE.Group();     // emissives
    const col = new THREE.Group();     // invisible collision proxies

    const CW = 4.6, CD = 4.4, CH = 2.9, T = 0.18;

    for (let i = 0; i < 6; i++) {
      const c = i % 3, row = Math.floor(i / 3);
      const cx = -CREW_W / 2 + 2.6 + c * (CW + 0.6) + CW / 2;   // -12.1 / -6.9 / -1.7
      const cz = row === 0 ? -8.2 : 1.6;
      const openZ = row === 0 ? 1 : -1;                          // side that faces the spine

      // three walls + ceiling; the fourth side is the open doorway
      const back = P.boxC(CW + T, CH, T, MAT.hull, { shadow: false });
      back.position.set(cx, CH / 2, cz - openZ * (CD / 2));
      back.userData.collide = false; shell.add(back);
      col.add(proxy(CW + T, CH, T, cx, CH / 2, cz - openZ * (CD / 2)));
      for (const sx of [-1, 1]) {
        const side = P.boxC(T, CH, CD, MAT.hull, { shadow: false });
        side.position.set(cx + sx * CW / 2, CH / 2, cz);
        side.userData.collide = false; shell.add(side);
        col.add(proxy(T, CH, CD, cx + sx * CW / 2, CH / 2, cz));
      }
      // a short return so the opening reads as a doorway, not a missing wall
      for (const sx of [-1, 1]) {
        const ret = P.boxC(1.5, CH, T, MAT.hull, { shadow: false });
        ret.position.set(cx + sx * (CW / 2 - 0.75), CH / 2, cz + openZ * (CD / 2));
        ret.userData.collide = false; shell.add(ret);
        col.add(proxy(1.5, CH, T, cx + sx * (CW / 2 - 0.75), CH / 2, cz + openZ * (CD / 2)));
      }
      const roof = P.boxC(CW + T, 0.16, CD + T, MAT.ceil, { shadow: false });
      roof.position.set(cx, CH, cz);
      roof.userData.collide = false; shell.add(roof);

      // bunk, locker, desk, clutter
      const bunk = P.boxC(1.05, 0.42, 2.1, S.cushion, { shadow: false });
      bunk.position.set(cx - CW / 2 + 0.75, 0.21, cz);
      bunk.userData.collide = false; shell.add(bunk);
      const mat2 = P.boxC(0.95, 0.16, 1.95, S.linen, { shadow: false });
      mat2.position.set(cx - CW / 2 + 0.75, 0.5, cz);
      mat2.userData.collide = false; shell.add(mat2);
      col.add(proxy(1.05, 0.6, 2.1, cx - CW / 2 + 0.75, 0.3, cz));

      const lk = P.lockers(1, MAT.hull);
      lk.position.set(cx + CW / 2 - 0.5, 0, cz - openZ * (CD / 2 - 0.6));
      lk.rotation.y = openZ > 0 ? 0 : Math.PI;
      shell.add(P.NOCOLLIDE(lk));
      col.add(proxy(0.5, 1.85, 0.5, cx + CW / 2 - 0.5, 0.93, cz - openZ * (CD / 2 - 0.6)));

      const desk = P.boxC(1.5, 0.06, 0.6, MAT.hull, { shadow: false });
      desk.position.set(cx + CW / 2 - 1.1, 0.74, cz + openZ * (CD / 2 - 0.9));
      desk.userData.collide = false; shell.add(desk);
      for (const sx of [-0.6, 0.6]) {
        const lg = P.boxC(0.06, 0.74, 0.5, S.trimDark, { shadow: false });
        lg.position.set(cx + CW / 2 - 1.1 + sx, 0.37, cz + openZ * (CD / 2 - 0.9));
        lg.userData.collide = false; shell.add(lg);
      }
      const psc = screen(0.6, 0.34, drawStatus(['OFFLINE', 'MAIL 3', 'LOG', 'IDLE', 'OFFLINE', 'SLEEP'][i], i === 4),
        { cw: 128, ch: 72, animate: false, glow: 1.1 });
      psc.position.set(cx + CW / 2 - 1.1, 1.22, cz + openZ * (CD / 2 - 1.2));
      psc.rotation.y = openZ > 0 ? 0 : Math.PI;
      lit.add(psc);
      for (let k = 0; k < 4; k++) {
        const it = P.boxC(rCrew.pick([0.1, 0.16, 0.22]), rCrew.pick([0.08, 0.14, 0.2]), rCrew.pick([0.1, 0.14, 0.18]),
          M.solid({ color: [0x7d4a3a, 0x35506b, 0x6d6a58, 0x8a8f95][k], roughness: 0.85 }), { shadow: false });
        it.position.set(cx + CW / 2 - 1.7 + rCrew.range(0, 1.2), 0.82, cz + openZ * (CD / 2 - 0.9) + rCrew.range(-0.2, 0.2));
        it.rotation.y = rCrew.range(0, 3);
        it.userData.collide = false; shell.add(it);
      }

      const cv = P.boxC(CW - 0.6, 0.06, 0.12, i === 3 ? S.coveAmber : S.coveWhite, { shadow: false });
      cv.position.set(cx, CH - 0.14, cz - openZ * (CD / 2 - 0.24));
      cv.userData.collide = false; lit.add(cv);
      const num = stencil(`A-${(i + 1) * 2}`, 0.2, 0x9db3c0);
      num.position.set(cx + CW / 2 - 0.45, 2.45, cz + openZ * (CD / 2 + 0.1));
      num.rotation.y = openZ > 0 ? 0 : Math.PI;
      shell.add(num);

      if (i !== 1 && i !== 4 && i !== 5) {
        const wp = l2w(crew, cx - CW / 2 + 0.75, cz);
        ctx.hidingSpot(wp.x, 0, wp.z, 1.5, 1.0);
      }
    }

    // --- galley ---------------------------------------------------------------
    {
      const gx = 5.0, gz = -8.0;
      const counter = P.boxC(7.0, 0.95, 0.8, MAT.hull, { shadow: false });
      counter.position.set(gx, 0.48, gz);
      counter.userData.collide = false; shell.add(counter);
      col.add(proxy(7.0, 0.95, 0.8, gx, 0.48, gz));
      const top = P.boxC(7.2, 0.08, 0.9, S.trim, { shadow: false });
      top.position.set(gx, 0.99, gz);
      top.userData.collide = false; shell.add(top);
      for (let i = 0; i < 4; i++) {
        const cab = P.boxC(1.5, 0.7, 0.4, MAT.hex, { shadow: false });
        cab.position.set(gx - 2.6 + i * 1.75, 2.1, gz - 0.3);
        cab.userData.collide = false; shell.add(cab);
      }
      const disp = P.boxC(0.8, 1.4, 0.6, MAT.struct, { shadow: false });
      disp.position.set(gx + 4.2, 0.7, gz);
      disp.userData.collide = false; shell.add(disp);
      col.add(proxy(0.8, 1.4, 0.6, gx + 4.2, 0.7, gz));
      const dled = P.boxC(0.5, 0.1, 0.04, S.emGreen, { shadow: false });
      dled.position.set(gx + 4.2, 1.2, gz + 0.32);
      dled.userData.collide = false; lit.add(dled);

      const tbl = P.table(4.4, 0.76, 1.3, MAT.hull);
      tbl.position.set(gx, 0, gz + 4.0);
      shell.add(P.NOCOLLIDE(tbl));
      col.add(proxy(4.4, 0.8, 1.3, gx, 0.4, gz + 4.0));
      for (let i = 0; i < 6; i++) {
        const ch = P.chair(M.solid({ color: 0x4d565f, roughness: 0.7 }));
        ch.position.set(gx - 1.7 + (i % 3) * 1.7, 0, gz + 4.0 + (i < 3 ? -1.1 : 1.1));
        ch.rotation.y = (i < 3 ? 0 : Math.PI) + rCrew.range(-0.3, 0.3);
        shell.add(P.NOCOLLIDE(ch));
      }
      const gs = stencil('GALLEY', 0.3, 0xd6ecf7, 0x1d4a63);
      gs.position.set(gx, 3.1, gz - 0.45);
      lit.add(gs);
      const wp = l2w(crew, gx - 3.2, gz + 0.9);
      ctx.hidingSpot(wp.x, 0, wp.z, 1.3, 0.8);
    }

    // --- med-bay ---------------------------------------------------------------
    {
      const mx = 8.0, mz = 7.0, mw = 13, md = 9.5, mh = 3.2;
      // three walls, open on the -X side toward the spine
      const backW = P.boxC(mw, mh, 0.2, MAT.hull, { shadow: false });
      backW.position.set(mx, mh / 2, mz + md / 2);
      backW.userData.collide = false; shell.add(backW);
      col.add(proxy(mw, mh, 0.2, mx, mh / 2, mz + md / 2));
      const frontW = P.boxC(mw, mh, 0.2, MAT.hull, { shadow: false });
      frontW.position.set(mx, mh / 2, mz - md / 2);
      frontW.userData.collide = false; shell.add(frontW);
      col.add(proxy(mw, mh, 0.2, mx, mh / 2, mz - md / 2));
      for (const [zc, dw] of [[mz - md / 4 - 0.6, md / 2 - 1.2], [mz + md / 4 + 0.6, md / 2 - 1.2]]) {
        const sw = P.boxC(0.2, mh, dw, MAT.hull, { shadow: false });
        sw.position.set(mx - mw / 2, mh / 2, zc);
        sw.userData.collide = false; shell.add(sw);
        col.add(proxy(0.2, mh, dw, mx - mw / 2, mh / 2, zc));
      }
      const mroof = P.boxC(mw, 0.18, md, MAT.ceil, { shadow: false });
      mroof.position.set(mx, mh, mz);
      mroof.userData.collide = false; shell.add(mroof);

      for (let i = 0; i < 4; i++) {
        const px2 = mx - 4.4 + i * 2.9, pz2 = mz - 1.4;
        const base = P.boxC(1.5, 0.7, 2.5, S.white, { shadow: false });
        base.position.set(px2, 0.35, pz2);
        base.userData.collide = false; shell.add(base);
        col.add(proxy(1.5, 0.7, 2.5, px2, 0.35, pz2));
        const lid = P.boxC(1.4, 0.7, 2.4, S.glassPod, { shadow: false });
        lid.position.set(px2, 1.0, pz2);
        lid.userData.collide = false;
        crew.add(lid);                       // transparent: keep out of freeze
        const gl = P.boxC(1.1, 0.03, 2.0, i === 2 ? S.emRed : S.emCyan, { shadow: false });
        gl.position.set(px2, 0.72, pz2);
        gl.userData.collide = false; lit.add(gl);
        const st = stencil(`POD ${i + 1}`, 0.16, 0x9fd8ea);
        st.position.set(px2, 1.5, pz2 - 1.28);
        st.rotation.y = Math.PI;
        shell.add(st);
      }
      const cart = P.machine(1.1, 1.0, 0.7, 91);
      cart.position.set(mx + 3.5, 0, mz + 2.6);
      shell.add(P.NOCOLLIDE(cart));
      col.add(proxy(1.6, 1.3, 1.0, mx + 3.5, 0.65, mz + 2.6));
      const msc = screen(1.9, 0.9, drawWave(4.2), { cw: 256, ch: 120, glow: 1.6 });
      msc.position.set(mx - 1.5, 2.0, mz + md / 2 - 0.12);
      msc.rotation.y = Math.PI;
      lit.add(msc);
      const ms = stencil('MED-BAY 1', 0.26, 0xd6f2f7, 0x1d5f63);
      ms.position.set(mx - mw / 2 + 0.12, 2.7, mz);
      ms.rotation.y = -Math.PI / 2;
      lit.add(ms);

      const w1 = l2w(crew, mx - 4.4, mz - 1.4);
      const w2 = l2w(crew, mx + 1.4, mz - 1.4);
      ctx.hidingSpot(w1.x, 0, w1.z, 1.2, 1.0);
      ctx.hidingSpot(w2.x, 0, w2.z, 1.2, 1.0);
    }

    // --- spine dressing ---------------------------------------------------------
    for (let i = 0; i < 8; i++) {
      const cv = P.boxC(0.12, 0.08, 2.6, S.coveWhite, { shadow: false });
      cv.position.set(-0.9, CREW_H - 0.5, -CREW_D / 2 + 3 + i * 3.2);
      cv.userData.collide = false; lit.add(cv);
    }
    const ds = screen(1.6, 0.8, drawDiag(9), { cw: 224, ch: 112, glow: 1.5 });
    ds.position.set(-6.5, 2.0, CREW_D / 2 - 0.32);
    ds.rotation.y = Math.PI;
    lit.add(ds);

    crew.add(P.freeze(shell));
    addLit(crew, lit);
    crew.add(P.COLLIDE(col));
  }

  // -------------------------------------------------------------------------
  // 9. HYDROPONICS — the visual outlier. Magenta grow-light jungle.
  // -------------------------------------------------------------------------

  const HY_W = 24, HY_D = 22, HY_H = 5.2;
  const HY_ROWS = 5, RACK_W = 14;
  const hydro = zoneModule(130, HY_W, HY_D, HY_H, 4, { wall: MAT.hull, floor: MAT.hydroFloor });
  const hydroFans = [];
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const col = new THREE.Group();

    // Rack rows run along local X with wide aisles either side, so the room
    // reads as a maze of foliage rather than an open box.
    for (let r = 0; r < HY_ROWS; r++) {
      const z = -HY_D / 2 + 3.2 + r * 3.9;
      col.add(proxy(RACK_W, 2.2, 1.5, 0, 1.1, z));
      for (let lvl = 0; lvl < 3; lvl++) {
        const y = 0.55 + lvl * 0.78;
        const tray = P.boxC(RACK_W, 0.1, 1.4, MAT.struct, { shadow: false });
        tray.position.set(0, y, z); tray.userData.collide = false; shell.add(tray);
        const soil = P.boxC(RACK_W - 0.6, 0.12, 1.15, S.soil, { shadow: false });
        soil.position.set(0, y + 0.1, z); soil.userData.collide = false; shell.add(soil);
        const bar = P.boxC(RACK_W - 0.4, 0.06, 0.3, S.emMagenta, { shadow: false });
        bar.position.set(0, y + 0.7, z); bar.userData.collide = false; lit.add(bar);
      }
      for (let i = 0; i <= 6; i++) {
        const up = P.boxC(0.1, 2.3, 0.1, S.trimDark, { shadow: false });
        up.position.set(-RACK_W / 2 + i * (RACK_W / 6), 1.15, z);
        up.userData.collide = false; shell.add(up);
      }
      if (r === 1 || r === 3) {
        const wp = l2w(hydro, r % 2 ? -5 : 5, z + 1.95);
        ctx.hidingSpot(wp.x, 0, wp.z, 1.4, 0.95);
      }
    }

    // Overgrown vegetation escaping the trays — 900 cross-quads, one draw call.
    const leafMat = M.painted(64, 64, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) {
        const x = (i * 37) % W, y1 = H - 12 - ((i * 53) % (H - 16));
        g.strokeStyle = `rgba(${60 + (i * 17) % 60},${140 + (i * 29) % 90},${50 + (i * 11) % 50},0.95)`;
        g.lineWidth = 3 + (i % 3);
        g.beginPath(); g.moveTo(x, H);
        g.quadraticCurveTo(x + ((i % 5) - 2) * 9, (H + y1) / 2, x + ((i % 7) - 3) * 7, y1);
        g.stroke();
      }
    }, { transparent: true, alphaTest: 0.4, roughness: 0.85, emissive: 0x1a2a10, emissiveIntensity: 0.6 });
    const foliage = P.scatter(P.billboardCross(0.55, 0.7), leafMat, 900, (i, dm, rr) => {
      const z = -HY_D / 2 + 3.2 + (i % HY_ROWS) * 3.9;
      dm.position.set(rr.range(-RACK_W / 2 + 0.2, RACK_W / 2 - 0.2), 0.66 + rr.int(0, 2) * 0.78, z + rr.range(-0.6, 0.6));
      dm.rotation.y = rr() * 6.283;
      dm.scale.setScalar(rr.range(0.7, 2.1));
    }, 55);
    foliage.castShadow = false;
    hydro.add(P.NOCOLLIDE(foliage));

    for (let i = 0; i < 26; i++) {
      const v = P.cyl(0.02, 0.03, rHydro.pick([1.0, 1.6, 2.2]), S.leafHot, { seg: 4, collide: false, shadow: false });
      v.position.set(rHydro.range(-RACK_W / 2, RACK_W / 2), rHydro.range(1.4, 2.1),
        -HY_D / 2 + 3.2 + rHydro.int(0, HY_ROWS - 1) * 3.9 + rHydro.range(-0.8, 0.8));
      v.rotation.set(rHydro.range(-0.3, 0.3), 0, rHydro.range(-0.3, 0.3));
      shell.add(v);
    }

    // Zero-g touch: a sphere of water hanging in the left aisle.
    const waterBall = P.sphere(0.85, M.glassCheap({ color: 0x6fd6ea, opacity: 0.42 }), { collide: false, shadow: false, seg: 20 });
    waterBall.position.set(-9.4, 2.6, 6.4);
    hydro.add(P.NOCOLLIDE(waterBall));
    ctx.onUpdate((dt, t) => {
      waterBall.position.y = 2.6 + Math.sin(t * 0.5) * 0.22;
      waterBall.scale.set(1 + Math.sin(t * 1.1) * 0.05, 1 - Math.sin(t * 1.1) * 0.05, 1 + Math.cos(t * 0.9) * 0.04);
    });
    {
      const wp = l2w(hydro, -9.4, 6.4);
      ctx.hidingSpot(wp.x, 0, wp.z, 1.2, 0.8);
    }

    // Extractor fans + humidity haze.
    for (let i = 0; i < 3; i++) {
      const fx = -7 + i * 7;
      const ring = P.cyl(0.72, 0.72, 0.2, MAT.struct, { seg: 16, open: true, collide: false, shadow: false });
      ring.position.set(fx, HY_H - 0.35, -HY_D / 2 + 0.4);
      ring.rotation.x = Math.PI / 2;
      shell.add(ring);
      const blades = new THREE.Group();
      for (let b = 0; b < 5; b++) {
        const bl = P.boxC(1.2, 0.03, 0.22, S.trimDark, { shadow: false });
        bl.rotation.y = (b / 5) * Math.PI * 2;
        bl.rotation.x = 0.35;
        bl.userData.collide = false;
        blades.add(bl);
      }
      blades.position.set(fx, HY_H - 0.35, -HY_D / 2 + 0.45);
      blades.rotation.x = Math.PI / 2;
      hydro.add(P.NOCOLLIDE(blades));
      hydroFans.push(blades);
    }
    const hazeMat = softCard('rgba(255,180,240,0.30)', 'rgba(210,140,220,0.12)', 0xff9fe0);
    for (let i = 0; i < 7; i++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), hazeMat);
      card.position.set(rHydro.range(-8, 8), rHydro.range(1.8, 3.6), rHydro.range(-9, 9));
      card.rotation.y = rHydro.range(0, 3.14);
      card.castShadow = false; card.userData.collide = false; card.renderOrder = 4;
      hydro.add(card);
    }

    const ctrl = P.deskComputer({ screen: 0xff6fd0, intensity: 2.2 });
    ctrl.position.set(9.4, 0, 8.8);
    ctrl.rotation.y = -1.9;
    shell.add(P.NOCOLLIDE(ctrl));
    col.add(proxy(1.6, 0.9, 1.0, 9.4, 0.45, 8.8));

    const hsc = screen(1.5, 0.8, drawDiag(21), { cw: 224, ch: 120, glow: 1.7 });
    hsc.position.set(-HY_W / 2 + 0.26, 2.2, 0);
    hsc.rotation.y = Math.PI / 2;
    lit.add(hsc);
    const hsg = stencil('BAY 3 · HYDROPONICS', 0.3, 0xffd9f4, 0x7a1f5e);
    hsg.position.set(0, 4.1, HY_D / 2 - 0.3);
    hsg.rotation.y = Math.PI;
    lit.add(hsg);

    hydro.add(P.freeze(shell));
    addLit(hydro, lit);
    hydro.add(P.COLLIDE(col));
  }
  ctx.onUpdate((dt) => { for (const f of hydroFans) f.rotation.z += dt * 5.2; });

  // -------------------------------------------------------------------------
  // 10. ENGINEERING — reactor spine, turbine, catwalks over a drop
  // -------------------------------------------------------------------------

  const EN_W = 34, EN_D = 28, EN_H = 10;
  const eng = zoneModule(180, EN_W, EN_D, EN_H, 4.6,
    { wall: MAT.corrug, floor: MAT.engDeck, ceil: MAT.struct }, { noFloor: true });
  const turbine = new THREE.Group();
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const col = new THREE.Group();

    // --- deck plate around a 18 x 12 drop -----------------------------------
    const pitW = 18, pitD = 12, pitZ = 2, pitY = -3.15;
    for (const [w, d, x, z] of [
      [EN_W, 10, 0, -9],          // north of the pit
      [EN_W, 6, 0, 11],           // south
      [8, pitD, -13, pitZ],       // west strip
      [8, pitD, 13, pitZ],        // east strip
    ]) {
      const dk = P.boxC(w, 0.35, d, MAT.engDeck, { shadow: false });
      dk.position.set(x, 0, z);
      dk.userData.collide = true;
      eng.add(dk);
    }
    const pf = P.boxC(pitW, 0.3, pitD, MAT.engDeck, { shadow: false });
    pf.position.set(0, pitY, pitZ);
    pf.userData.collide = true;
    eng.add(pf);
    for (const [w, d, x, z] of [[pitW, 0.3, 0, pitZ - pitD / 2], [pitW, 0.3, 0, pitZ + pitD / 2]]) {
      const pw = P.boxC(w, 3.3, d, MAT.struct, { shadow: false });
      pw.position.set(x, -1.65, z); pw.userData.collide = true; eng.add(pw);
    }
    for (const sx of [-1, 1]) {
      const pw = P.boxC(0.3, 3.3, pitD, MAT.struct, { shadow: false });
      pw.position.set(sx * pitW / 2, -1.65, pitZ); pw.userData.collide = true; eng.add(pw);
    }
    const lad = P.ladder(3.4, S.trim);
    lad.position.set(-pitW / 2 + 1.2, -3.0, pitZ - pitD / 2 + 0.35);
    eng.add(P.COLLIDE(lad));

    // hazard striping around the lip
    for (const [len, x, z, rz] of [
      [pitW, 0, pitZ - pitD / 2 - 0.35, 0], [pitW, 0, pitZ + pitD / 2 + 0.35, 0],
      [pitD, -pitW / 2 - 0.35, pitZ, Math.PI / 2], [pitD, pitW / 2 + 0.35, pitZ, Math.PI / 2],
    ]) {
      const hs = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.55), hazMat);
      hs.rotation.set(-Math.PI / 2, 0, rz);
      hs.position.set(x, 0.19, z);
      hs.castShadow = false; hs.userData.collide = false;
      shell.add(hs);
    }

    // --- reactor spine --------------------------------------------------------
    const spineZ = -EN_D / 2 + 4.5;
    const spine = P.cyl(1.8, 1.8, 8.4, MAT.struct, { seg: 20 });
    spine.position.set(0, 0.2, spineZ);
    eng.add(P.COLLIDE(spine));
    for (let i = 0; i < 5; i++) {
      const band = P.cyl(2.05, 2.05, 0.3, S.trimDark, { seg: 20, collide: false, shadow: false });
      band.position.set(0, 0.6 + i * 1.7, spineZ);
      shell.add(band);
      const glow = P.cyl(2.0, 2.0, 0.5, S.coveAmber, { seg: 20, collide: false, shadow: false });
      glow.position.set(0, 1.1 + i * 1.7, spineZ);
      lit.add(glow);
    }
    for (let i = 0; i < 8; i++) {
      const a = i * 45;
      const pp = P.pipes(9, 2, 0.14, S.trim);
      pp.position.set(Math.cos(a * D2R) * 2.2, 5.2 + (i % 3) * 1.2, spineZ + Math.sin(a * D2R) * 0.6);
      pp.rotation.y = a * D2R * 0.4;
      shell.add(P.NOCOLLIDE(pp));
    }
    const pipeRun = P.pipes(30, 4, 0.16, S.trim);
    pipeRun.position.set(0, 7.6, -EN_D / 2 + 1.4);
    shell.add(P.NOCOLLIDE(pipeRun));

    // --- turbine ---------------------------------------------------------------
    {
      const tx = EN_W / 2 - 6.5, ty = 4.6, tz = EN_D / 2 - 6.0;
      turbine.position.set(tx, ty, tz);
      const housing = P.cyl(3.5, 3.5, 1.4, MAT.struct, { seg: 24, open: true, collide: false, shadow: false });
      housing.rotation.x = Math.PI / 2;
      housing.position.set(tx, ty, tz + 0.7);
      shell.add(housing);
      col.add(proxy(7.4, 7.4, 1.8, tx, ty, tz));
      const blades = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const bl = P.boxC(6.2, 0.09, 0.75, S.trim, { shadow: false });
        bl.rotation.y = (i / 9) * Math.PI * 2;
        bl.rotation.x = 0.42;
        bl.userData.collide = false;
        blades.add(bl);
      }
      blades.rotation.x = Math.PI / 2;
      turbine.add(blades);
      const cone = P.cyl(0.1, 0.7, 0.9, S.trimDark, { seg: 14, collide: false, shadow: false });
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(0, 0, 0.2);
      turbine.add(cone);
      eng.add(P.NOCOLLIDE(turbine));
    }

    // --- catwalks over the drop, reached by a stair --------------------------
    // Visuals are frozen; walkable surfaces are invisible proxies.
    for (const [z, len] of [[2, 20], [6.5, 20]]) {
      const cw = P.catwalk(len, 1.7, MAT.grate, S.trim);
      cw.position.set(0, 5.2, z);
      shell.add(P.NOCOLLIDE(cw));
      col.add(proxy(len, 0.24, 1.7, 0, 5.12, z));
      // Guard the outboard edge only — the inboard edges are where the two
      // cross-links land, so railing them would seal the route.
      if (z < 4) {
        col.add(proxy(5.4, 1.05, 0.1, -7.3, 5.77, z - 0.85));    // west of the link
        col.add(proxy(10.4, 1.05, 0.1, 4.8, 5.77, z - 0.85));    // east of the link
      } else {
        col.add(proxy(len, 1.05, 0.1, 0, 5.77, z + 0.85));
      }
      for (let i = -2; i <= 2; i++) {
        const hg = P.boxC(0.09, 4.6, 0.09, S.trimDark, { shadow: false });
        hg.position.set(i * 4.6, 7.6, z);
        hg.userData.collide = false; shell.add(hg);
      }
    }
    for (const [x, z, len] of [[-8, 4.25, 4.5], [-6.8, -2.1, 9.2]]) {
      const lk2 = P.catwalk(len, 1.7, MAT.grate, S.trim);
      lk2.rotation.y = Math.PI / 2;
      lk2.position.set(x, 5.2, z);
      shell.add(P.NOCOLLIDE(lk2));
      col.add(proxy(1.7, 0.24, len, x, 5.12, z));
    }
    // stair: 26 x 0.2 rise over 7.8 m run, visual frozen + one tilted proxy
    {
      const st = P.stairs(26, 1.6, 0.2, 0.3, MAT.grate);
      st.position.set(-EN_W / 2 + 2.4, 0.18, -6.6);
      st.rotation.y = Math.PI / 2;
      shell.add(P.NOCOLLIDE(st));
      const ramp = proxy(9.3, 0.3, 1.6, -10.75, 2.62, -6.6);
      ramp.rotation.z = Math.atan2(5.2, 7.8);
      col.add(ramp);
      col.add(proxy(2.4, 0.3, 2.2, -6.6, 5.1, -6.0));   // top landing
    }

    // --- conduit, screens, clutter --------------------------------------------
    for (let i = 0; i < 5; i++) {
      const cd = P.boxC(0.28, 0.28, EN_D - 1, S.trimDark, { shadow: false });
      cd.position.set(-EN_W / 2 + 1.6 + i * 0.42, 8.6, 0);
      cd.userData.collide = false; shell.add(cd);
    }
    const esc = screen(2.6, 1.3, drawWave(1.3), { cw: 288, ch: 144, glow: 1.8 });
    esc.position.set(-EN_W / 2 + 0.28, 3.0, -8);
    esc.rotation.y = Math.PI / 2;
    lit.add(esc);
    const esc2 = screen(2.2, 1.1, drawDiag(6), { cw: 256, ch: 128, glow: 1.6 });
    esc2.position.set(EN_W / 2 - 0.28, 3.0, -8);
    esc2.rotation.y = -Math.PI / 2;
    lit.add(esc2);
    lit.add((() => {
      const s = stencil('ENGINEERING · REACTOR 1', 0.34, 0xffd6a0, 0x6a3c0a);
      s.position.set(0, 6.6, -EN_D / 2 + 0.28);
      return s;
    })());

    for (let i = 0; i < 9; i++) {
      const bx = rEng.range(-15, 15), bz = rEng.range(-12, 12);
      if (Math.abs(bx) < pitW / 2 + 1 && Math.abs(bz - pitZ) < pitD / 2 + 1) continue;
      const b = P.barrel(0.34, 0.95, M.surface('rustMetal', { repeat: 1, size: 256, color: 0x2f4c5c }));
      b.position.set(bx, 0.18, bz);
      b.rotation.y = rEng.range(0, 3);
      shell.add(P.NOCOLLIDE(b));
      col.add(proxy(0.68, 0.95, 0.68, bx, 0.65, bz));
    }
    const bench = P.table(3.2, 0.9, 1.0, MAT.struct);
    bench.position.set(-13, 0.18, 10);
    shell.add(P.NOCOLLIDE(bench));
    col.add(proxy(3.2, 0.95, 1.0, -13, 0.65, 10));

    ctx.hidingSpot(l2w(eng, -13, 10.9).x, 0, l2w(eng, -13, 10.9).z, 1.3, 0.85);
    ctx.hidingSpot(l2w(eng, 0, 2).x, -3.0, l2w(eng, 0, 2).z, 2.4, 1.0);

    eng.add(P.freeze(shell));
    addLit(eng, lit);
    eng.add(P.COLLIDE(col));
  }
  ctx.onUpdate((dt) => { turbine.rotation.z -= dt * 1.15; });

  // -------------------------------------------------------------------------
  // 11. THE BREACH (landmark 3) — impact damage behind an emergency field
  // -------------------------------------------------------------------------

  const BR_W = 30, BR_D = 26, BR_H = 8;
  const breach = zoneModule(236, BR_W, BR_D, BR_H, 4,
    { wall: MAT.burnt, floor: MAT.burnt, ceil: MAT.burnt }, { noFloor: true });
  const fieldMats = [];
  const sparks = [];
  let beaconMat = null;
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const col = new THREE.Group();
    const gashW = 17, gashH = 6.0, nz = -BR_D / 2;

    // Punch a hole in the outboard wall: hide the roomShell's 'n' panel and
    // rebuild it in three pieces around the gash.
    breach.traverse(o => {
      if (o.isMesh && o.geometry.parameters && o.geometry.parameters.width > BR_W - 1 &&
        Math.abs(o.position.z - nz) < 0.02) {
        o.visible = false;
        o.userData.collide = false;
      }
    });
    for (const [w, h, x, y] of [
      [(BR_W - gashW) / 2, BR_H, -(BR_W + gashW) / 4, BR_H / 2],
      [(BR_W - gashW) / 2, BR_H, (BR_W + gashW) / 4, BR_H / 2],
      [gashW, BR_H - gashH, 0, gashH + (BR_H - gashH) / 2],
    ]) {
      const wl = P.boxC(w, h, 0.4, MAT.burnt, { shadow: false });
      wl.position.set(x, y, nz);
      wl.userData.collide = true;
      breach.add(wl);
    }

    // --- the emergency force field -------------------------------------------
    const ffMat = M.painted(128, 128, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(150,235,255,0.85)'; g.lineWidth = 2;
      const s = 22;
      for (let row = 0; row * s * 0.75 < H + s; row++) {
        for (let c2 = 0; c2 * s < W + s; c2++) {
          const cx = c2 * s + (row % 2 ? s / 2 : 0), cy = row * s * 0.75;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = k * Math.PI / 3 + Math.PI / 6;
            const hx = cx + Math.cos(a) * s * 0.48, hy = cy + Math.sin(a) * s * 0.48;
            if (k === 0) g.moveTo(hx, hy); else g.lineTo(hx, hy);
          }
          g.closePath(); g.stroke();
        }
      }
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(120,220,255,0.30)');
      grad.addColorStop(0.5, 'rgba(60,150,220,0.06)');
      grad.addColorStop(1, 'rgba(120,220,255,0.30)');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
    }, {
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      emissive: 0x8fe6ff, emissiveIntensity: 2.6, alphaTest: 0,
    });
    ffMat.blending = THREE.AdditiveBlending;
    ffMat.opacity = 0.5;
    ffMat.map.wrapS = ffMat.map.wrapT = THREE.RepeatWrapping;
    ffMat.map.repeat.set(6, 2.4);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(gashW, gashH), ffMat);
    field.position.set(0, gashH / 2, nz);
    field.castShadow = false; field.userData.collide = false; field.renderOrder = 6;
    breach.add(field);
    fieldMats.push(ffMat);
    // hard, invisible seal — vacuum is never reachable
    col.add(proxy(gashW + 0.8, gashH + 1.0, 0.5, 0, gashH / 2, nz));

    for (const [w, h, x, y] of [
      [gashW + 0.6, 0.45, 0, gashH + 0.2],
      [0.45, gashH, -(gashW / 2 + 0.2), gashH / 2],
      [0.45, gashH, gashW / 2 + 0.2, gashH / 2],
    ]) {
      const fr = P.boxC(w, h, 0.6, MAT.struct, { shadow: false });
      fr.position.set(x, y, nz + 0.15);
      fr.userData.collide = false; shell.add(fr);
      const gl = P.boxC(w * 0.92, 0.08, 0.1, S.emCyan, { shadow: false });
      gl.position.set(x, y - h / 2 + 0.1, nz + 0.48);
      gl.userData.collide = false; lit.add(gl);
    }

    // --- collapsed sub-floor (fully sealed: no corner gaps) ------------------
    const sub = P.boxC(BR_W, 0.3, BR_D, MAT.burnt, { shadow: false });
    sub.position.set(0, -1.4, 0);
    sub.userData.collide = true;
    breach.add(sub);
    for (const [w, d, x, z] of [
      [BR_W, 0.4, 0, -BR_D / 2 + 0.2], [BR_W, 0.4, 0, BR_D / 2 - 0.2],
    ]) {
      const lip = P.boxC(w, 1.7, d, MAT.burnt, { shadow: false });
      lip.position.set(x, -0.55, z); lip.userData.collide = true; breach.add(lip);
    }
    for (const sx of [-1, 1]) {
      const lip = P.boxC(0.4, 1.7, BR_D, MAT.burnt, { shadow: false });
      lip.position.set(sx * (BR_W / 2 - 0.2), -0.55, 0);
      lip.userData.collide = true; breach.add(lip);
    }

    // --- the route: a threshold deck, then staggered floor plates ------------
    const thr = P.boxC(9, 0.4, 4.0, MAT.burnt, { shadow: false });
    thr.position.set(0, -0.04, 11.2);
    thr.userData.collide = true;
    breach.add(thr);

    const path = [
      [-2.2, 7.6, 0.55], [1.4, 4.8, 1.15], [-1.8, 2.0, 1.7],
      [1.9, -0.8, 2.15], [-1.2, -3.6, 2.5], [2.4, -6.2, 2.75], [0, -8.6, 3.0],
    ];
    let prev = [0, 10.0, 0.16];
    for (const [x, z, y] of path) {
      const slab = P.boxC(4.6, 0.32, 3.6, MAT.burnt, { shadow: false });
      slab.position.set(x, y, z);
      slab.rotation.y = rBreach.range(-0.28, 0.28);
      slab.userData.collide = true;
      breach.add(slab);
      const dx = x - prev[0], dz = z - prev[1];
      const len = Math.hypot(dx, dz);
      const br = P.boxC(1.9, 0.22, len, MAT.grate, { shadow: false });
      br.position.set((x + prev[0]) / 2, (y + prev[2]) / 2, (z + prev[1]) / 2);
      br.rotation.y = Math.atan2(dx, dz);
      br.rotation.x = -Math.atan2(y - prev[2], len);
      br.userData.collide = true;
      breach.add(br);
      prev = [x, z, y];
    }
    // a way back up out of the fallen floor
    const outRamp = P.boxC(3.0, 0.25, 3.4, MAT.grate, { shadow: false });
    outRamp.position.set(-7, -0.55, 10.2);
    outRamp.rotation.x = -0.44;
    outRamp.userData.collide = true;
    breach.add(outRamp);

    // --- twisted structure, torn panelling -----------------------------------
    for (let i = 0; i < 22; i++) {
      const g2 = P.girder(rBreach.pick([2.5, 3.5, 4.5, 6, 7]), MAT.struct, { scale: 1.5 });
      g2.position.set(rBreach.range(-13, 13), rBreach.range(0.4, 7), rBreach.range(-12, 6));
      g2.rotation.set(rBreach.range(-1.2, 1.2), rBreach.range(0, 3.14), rBreach.range(-1.2, 1.2));
      shell.add(P.NOCOLLIDE(g2));
    }
    for (let i = 0; i < 26; i++) {
      const pl = P.boxC(rBreach.pick([1.4, 2.2, 3.0]), 0.06, rBreach.pick([1.0, 1.6, 2.2]), MAT.burnt, { shadow: false });
      pl.position.set(rBreach.range(-13, 13), rBreach.range(0.1, 5), rBreach.range(-11, 10));
      pl.rotation.set(rBreach.range(-1.5, 1.5), rBreach.range(0, 3.14), rBreach.range(-1.5, 1.5));
      pl.userData.collide = false;
      shell.add(pl);
    }

    // --- debris frozen mid-drift (per-instance tumble) -----------------------
    const drift = P.scatter(new THREE.IcosahedronGeometry(0.28, 0), MAT.burnt, 54, (i, dm, rr) => {
      dm.position.set(rr.range(-13, 13), rr.range(0.8, 7.2), rr.range(-11, 11));
      dm.scale.set(rr.range(0.5, 2.6), rr.range(0.4, 1.6), rr.range(0.5, 2.2));
      dm.rotation.set(rr() * 3, rr() * 3, rr() * 3);
    }, 77);
    drift.castShadow = false;
    breach.add(P.NOCOLLIDE(drift));
    {
      const rr = R.fork('drift');
      const state = [];
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < drift.count; i++) {
        drift.getMatrixAt(i, m4);
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        m4.decompose(pos, q, sc);
        state.push({
          pos, q, sc,
          axis: new THREE.Vector3(rr.range(-1, 1), rr.range(-1, 1), rr.range(-1, 1)).normalize(),
          spd: rr.range(0.05, 0.32), bob: rr.range(0, 6.28),
        });
      }
      const tq = new THREE.Quaternion(), tm = new THREE.Matrix4(), tp = new THREE.Vector3();
      ctx.onUpdate((dt, t) => {
        for (let i = 0; i < state.length; i++) {
          const s = state[i];
          tq.setFromAxisAngle(s.axis, t * s.spd).multiply(s.q);
          tp.copy(s.pos);
          tp.y += Math.sin(t * 0.22 + s.bob) * 0.14;
          tp.x += Math.cos(t * 0.17 + s.bob) * 0.1;
          tm.compose(tp, tq, s.sc);
          drift.setMatrixAt(i, tm);
        }
        drift.instanceMatrix.needsUpdate = true;
      });
    }
    // drifting clipboard
    const clip = P.boxC(0.3, 0.02, 0.42, M.solid({ color: 0xc8c2ae, roughness: 0.9 }), { shadow: false });
    clip.position.set(4.5, 3.1, 3.0);
    clip.castShadow = false; clip.userData.collide = false;
    breach.add(clip);
    ctx.onUpdate((dt, t) => {
      clip.rotation.set(t * 0.3, t * 0.21, t * 0.11);
      clip.position.y = 3.1 + Math.sin(t * 0.4) * 0.35;
    });

    // --- sparking cables + beacon --------------------------------------------
    for (let i = 0; i < 12; i++) {
      const cx = rBreach.range(-12, 12), cy = rBreach.range(4.5, 7.4), cz = rBreach.range(-10, 9);
      const c = P.cyl(0.03, 0.03, rBreach.pick([1.6, 2.4, 3.2]), S.rubberBlack, { seg: 5, collide: false, shadow: false });
      c.position.set(cx, cy, cz);
      c.rotation.set(rBreach.range(-0.6, 0.6), rBreach.range(0, 3), rBreach.range(-0.4, 0.4));
      shell.add(c);
      if (i % 3 === 0) {
        const sm = M.emissive(0xbfe8ff, 6, { transparent: true, opacity: 0.9 });
        const tip = P.sphere(0.07, sm, { collide: false, shadow: false, seg: 8 });
        tip.position.set(cx, cy - 1.5, cz);
        breach.add(P.NOCOLLIDE(tip));
        sparks.push({ mat: sm, obj: tip, phase: rBreach.range(0, 6.28) });
      }
    }
    beaconMat = M.emissive(0xff2010, 5, {});
    const beacon = P.cyl(0.24, 0.3, 0.35, beaconMat, { seg: 12, collide: false, shadow: false });
    beacon.position.set(-11, 6.4, 6);
    breach.add(P.NOCOLLIDE(beacon));

    // --- drifting smoke --------------------------------------------------------
    const smokeMat = softCard('rgba(120,120,130,0.34)', 'rgba(80,80,92,0.14)');
    const cards = [];
    for (let i = 0; i < 12; i++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(11, 7), smokeMat);
      card.position.set(rBreach.range(-11, 11), rBreach.range(1.5, 6), rBreach.range(-10, 10));
      card.rotation.y = rBreach.range(0, 3.14);
      card.castShadow = false; card.userData.collide = false; card.renderOrder = 5;
      breach.add(card);
      cards.push({ card, base: card.position.x, sp: rBreach.range(0.06, 0.2) });
    }
    ctx.onUpdate((dt, t) => { for (const s of cards) s.card.position.x = s.base + Math.sin(t * s.sp) * 1.6; });

    // --- red emergency lighting + signage ------------------------------------
    for (let i = 0; i < 8; i++) {
      const l = P.boxC(1.6, 0.07, 0.2, S.emRed, { shadow: false });
      l.position.set(-12 + i * 3.4, BR_H - 0.5, (i % 2 ? -1 : 1) * (BR_D / 2 - 1.2));
      l.userData.collide = false; lit.add(l);
    }
    const bSign = stencil('SECTION 09\nHULL BREACH', 0.42, 0xffb0a0, 0x8a1a08);
    bSign.position.set(0, 6.9, BR_D / 2 - 0.3);
    bSign.rotation.y = Math.PI;
    lit.add(bSign);
    const bsc = screen(2.0, 1.0, drawStatus('DECOMPRESSION', true), { cw: 256, ch: 128, animate: false, glow: 2.0 });
    bsc.position.set(-BR_W / 2 + 0.28, 3.2, 5);
    bsc.rotation.y = Math.PI / 2;
    lit.add(bsc);

    for (const [lx, lz, ly] of [[-9, -6, -1.1], [9.5, 7, -1.1]]) {
      const wp = l2w(breach, lx, lz);
      ctx.hidingSpot(wp.x, ly, wp.z, 1.6, 1.0);
    }

    breach.add(P.freeze(shell));
    addLit(breach, lit);
    breach.add(P.COLLIDE(col));
  }

  // -------------------------------------------------------------------------
  // 12. DOCKING BAY — an enterable shuttle, cargo pods, control booth
  // -------------------------------------------------------------------------

  const DK_W = 34, DK_D = 28, DK_H = 12;
  const dock = zoneModule(292, DK_W, DK_D, DK_H, 5, { wall: MAT.hullBig, floor: MAT.bayFloor, ceil: MAT.struct });
  // shuttle cabin centre in dock-local space (shuttle sits at -3,0,0, yaw 0.25)
  const CABIN_LX = -3 + Math.cos(0.25) * -2.6;
  const CABIN_LZ = Math.sin(0.25) * 2.6;
  const cabinWorld = l2w(dock, CABIN_LX, CABIN_LZ);
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const col = new THREE.Group();

    // --- deck markings ---------------------------------------------------------
    const markMat = M.painted(256, 256, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(240,190,60,0.85)'; g.lineWidth = 7;
      g.strokeRect(18, 18, W - 36, H - 36);
      g.setLineDash([26, 20]);
      g.strokeStyle = 'rgba(230,235,240,0.7)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(W / 2, 26); g.lineTo(W / 2, H - 26); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(240,190,60,0.9)';
      g.font = 'bold 46px monospace'; g.textAlign = 'center';
      g.fillText('PAD 01', W / 2, H - 46);
      g.textAlign = 'left';
    }, { transparent: true, roughness: 0.85, emissive: 0x2a2408, emissiveIntensity: 0.5, depthWrite: false });
    const marks = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), markMat);
    marks.rotation.x = -Math.PI / 2;
    marks.position.set(-3, 0.02, 0);
    marks.castShadow = false; marks.userData.collide = false; marks.renderOrder = 1;
    dock.add(marks);

    // --- the shuttle -----------------------------------------------------------
    {
      const sh = new THREE.Group();
      sh.position.set(-3, 0, 0);
      sh.rotation.y = 0.25;
      const svis = new THREE.Group();      // frozen exterior

      const body = P.cyl(1.9, 2.2, 11, MAT.skin, { seg: 14, collide: false, shadow: false });
      body.rotation.z = Math.PI / 2; body.position.set(-5.5, 2.6, 0); svis.add(body);
      const nose = P.cyl(0.5, 1.9, 2.6, MAT.skin, { seg: 14, collide: false, shadow: false });
      nose.rotation.z = -Math.PI / 2; nose.position.set(5.5, 2.6, 0); svis.add(nose);
      const tail = P.cyl(2.2, 1.5, 1.6, MAT.struct, { seg: 14, collide: false, shadow: false });
      tail.rotation.z = Math.PI / 2; tail.position.set(-7.1, 2.6, 0); svis.add(tail);
      for (const sz of [-1, 1]) {
        const wing = P.boxC(4.6, 0.24, 3.2, MAT.skin, { shadow: false });
        wing.position.set(-3.5, 2.2, sz * 2.9); wing.rotation.x = sz * 0.12;
        wing.userData.collide = false; svis.add(wing);
        const nac = P.cyl(0.75, 0.75, 3.4, MAT.struct, { seg: 12, collide: false, shadow: false });
        nac.rotation.z = Math.PI / 2; nac.position.set(-5.0, 2.0, sz * 4.0); svis.add(nac);
        const leg = P.cyl(0.14, 0.14, 1.5, S.trimDark, { seg: 8, collide: false, shadow: false });
        leg.position.set(-4.0, 0, sz * 2.2); leg.rotation.z = sz * 0.16; svis.add(leg);
        const pad = P.cyl(0.45, 0.5, 0.16, S.trimDark, { seg: 10, collide: false, shadow: false });
        pad.position.set(-4.0 + sz * 0.2, 0, sz * 2.5); svis.add(pad);
        // engine bell stays emissive (out of the freeze)
        const bell = P.cyl(0.85, 0.62, 0.5, S.emBlue, { seg: 12, collide: false, shadow: false });
        bell.rotation.z = Math.PI / 2; bell.position.set(-6.9, 2.0, sz * 4.0);
        sh.add(P.NOCOLLIDE(bell));
      }
      const legF = P.cyl(0.14, 0.14, 1.5, S.trimDark, { seg: 8, collide: false, shadow: false });
      legF.position.set(3.6, 0, 0); svis.add(legF);
      svis.add(P.NOCOLLIDE((() => {
        const hn = stencil('H9-SHUTTLE 04', 0.34, 0x2b3138);
        hn.position.set(-1.0, 3.4, 2.02);
        return hn;
      })()));
      sh.add(P.NOCOLLIDE(P.freeze(svis)));

      const canopy = P.boxC(2.6, 1.0, 2.2, M.glassCheap({ color: 0x7fbcd8, opacity: 0.3 }), { shadow: false });
      canopy.position.set(4.4, 3.5, 0); canopy.userData.collide = false; sh.add(canopy);
      const nav = P.sphere(0.1, S.emRed, { collide: false, shadow: false, seg: 8 });
      nav.position.set(5.2, 3.9, 0); sh.add(P.NOCOLLIDE(nav));

      // walkable cabin: floor 1.63, ceiling 3.93, open at the rear
      const cabW = 3.2, cabL = 8.0, cabH = 2.3;
      const cabFloor = P.boxC(cabW, 0.16, cabL, MAT.grate, { shadow: false });
      cabFloor.position.set(-2.6, 1.55, 0); cabFloor.userData.collide = true; sh.add(cabFloor);
      for (const sz of [-1, 1]) {
        const w = P.boxC(cabL, cabH, 0.14, MAT.hull, { shadow: false });
        w.rotation.y = Math.PI / 2;
        w.position.set(-2.6, 1.63 + cabH / 2, sz * cabW / 2);
        w.userData.collide = true; sh.add(w);
        const bench = P.boxC(cabL - 1, 0.12, 0.55, MAT.hull, { shadow: false });
        bench.position.set(-2.6, 2.1, sz * (cabW / 2 - 0.36));
        bench.userData.collide = false; sh.add(bench);
        const cv = P.boxC(cabL - 1.2, 0.05, 0.1, S.coveWhite, { shadow: false });
        cv.position.set(-2.6, 3.72, sz * (cabW / 2 - 0.14));
        cv.userData.collide = false; sh.add(P.NOCOLLIDE(cv));
      }
      const cabCeil = P.boxC(cabW, 0.14, cabL, MAT.hull, { shadow: false });
      cabCeil.position.set(-2.6, 1.63 + cabH, 0); cabCeil.userData.collide = true; sh.add(cabCeil);
      const front = P.boxC(cabW, cabH, 0.14, MAT.hull, { shadow: false });
      front.position.set(1.5, 1.63 + cabH / 2, 0); front.userData.collide = true; sh.add(front);
      const ramp = P.boxC(2.8, 0.16, 3.4, MAT.grate, { shadow: false });
      ramp.position.set(-8.0, 0.85, 0); ramp.rotation.z = 0.42;
      ramp.userData.collide = true; sh.add(ramp);
      const lip = P.boxC(2.8, 0.16, 1.6, MAT.grate, { shadow: false });
      lip.position.set(-6.6, 1.5, 0); lip.userData.collide = true; sh.add(lip);

      dock.add(sh);
    }

    // --- cargo pods -------------------------------------------------------------
    for (let i = 0; i < 7; i++) {
      const px2 = DK_W / 2 - 4.5 - (i % 2) * 3.4;
      const pz2 = -DK_D / 2 + 4 + Math.floor(i / 2) * 4.6;
      const pod = P.container(3.0, [0x2f6f8f, 0x8a5a2f][i % 2], 100);
      pod.position.set(px2, 0, pz2);
      pod.rotation.y = rDock.range(-0.12, 0.12);
      shell.add(P.NOCOLLIDE(pod));
      col.add(proxy(3.0, 2.6, 2.5, px2, 1.3, pz2));
      if (i === 3) {
        const wp = l2w(dock, px2 - 2.3, pz2);
        ctx.hidingSpot(wp.x, 0, wp.z, 1.3, 0.95);
      }
    }
    const openPod = P.container(3.0, 0x8a3a3a, 100);
    openPod.position.set(DK_W / 2 - 4.5, 2.62, -DK_D / 2 + 4);
    shell.add(P.NOCOLLIDE(openPod));
    col.add(proxy(3.0, 2.6, 2.5, DK_W / 2 - 4.5, 3.92, -DK_D / 2 + 4));

    for (let i = 0; i < 8; i++) {
      const cx = rDock.range(1, 14), cz = rDock.range(6, 12);
      const cr = P.crate(rDock.pick([0.7, 0.9, 1.1]), MAT.hull);
      cr.position.set(cx, 0, cz);
      cr.rotation.y = rDock.range(0, 3);
      shell.add(P.NOCOLLIDE(cr));
      col.add(proxy(1.1, 1.1, 1.1, cx, 0.55, cz));
    }

    // --- control booth on a raised platform --------------------------------------
    {
      const bx = -DK_W / 2 + 6, bz = DK_D / 2 - 6;   // (-11, 8)
      const plat = P.boxC(9, 3.6, 7, MAT.hullBig, { shadow: false });
      plat.position.set(bx, 1.8, bz); plat.userData.collide = true;
      dock.add(plat);

      const st = P.stairs(20, 1.5, 0.18, 0.28, MAT.grate);
      st.position.set(-1.0, 0, 6.5);
      st.rotation.y = -Math.PI / 2;
      shell.add(P.NOCOLLIDE(st));
      const ramp = proxy(6.65, 0.3, 1.5, -3.8, 1.72, 6.5);
      ramp.rotation.z = -Math.atan2(3.6, 5.6);       // -X end is the high end
      col.add(ramp);

      const bInner = new THREE.Group();
      const bg = new THREE.Group();
      bg.position.set(bx, 3.6, bz);
      const bw = P.roomShell({
        w: 8.4, d: 6.4, h: 2.8, thickness: 0.2, material: MAT.hull,
        doors: [{ side: 'e', at: 0.5, width: 1.4, top: 2.2 }],
      });
      bg.add(P.COLLIDE(bw));
      const roof = P.ceiling(8.8, 6.8, 2.8, MAT.ceil);
      roof.userData.collide = false; bg.add(roof);
      const glassW = P.boxC(8.0, 1.7, 0.08, M.glassCheap({ color: 0x9fd0e0, opacity: 0.16 }), { shadow: false });
      glassW.position.set(0, 1.5, -3.2); glassW.userData.collide = false; bg.add(glassW);
      for (let i = 0; i < 3; i++) {
        const con = P.deskComputer({ screen: 0x63d4ff, intensity: 2.0 });
        con.position.set(-2.6 + i * 2.6, 0, -2.2);
        bInner.add(P.NOCOLLIDE(con));
      }
      bg.add(P.NOCOLLIDE(P.freeze(bInner)));
      const bsc2 = screen(2.0, 1.0, drawDiag(31), { cw: 256, ch: 128, glow: 1.7 });
      bsc2.position.set(0, 2.0, 3.1); bsc2.rotation.y = Math.PI;
      bg.add(P.NOCOLLIDE(bsc2));
      const cv = P.boxC(7.6, 0.06, 0.12, S.coveWhite, { shadow: false });
      cv.position.set(0, 2.66, 3.0); cv.userData.collide = false;
      bg.add(P.NOCOLLIDE(cv));
      dock.add(bg);

      const wp = l2w(dock, bx - 2.5, bz + 2.0);
      ctx.hidingSpot(wp.x, 3.6, wp.z, 1.4, 1.0);
    }

    // --- lighting rig + signage ----------------------------------------------------
    for (let i = 0; i < 6; i++) {
      const x = -13 + i * 5.2;
      const truss = P.girder(DK_D - 2, MAT.struct, { scale: 2.2 });
      truss.rotation.y = Math.PI / 2;
      truss.position.set(x, DK_H - 1.0, 0);
      shell.add(P.NOCOLLIDE(truss));
      for (let k = 0; k < 3; k++) {
        const lp = P.boxC(1.4, 0.1, 0.9, S.coveWhite, { shadow: false });
        lp.position.set(x, DK_H - 1.4, -8 + k * 8);
        lp.userData.collide = false; lit.add(lp);
      }
    }
    const dSign = stencil('DOCKING 1 · PAD 01', 0.44, 0xdcf0fa, 0x1d4a63);
    dSign.position.set(6, 8.2, -DK_D / 2 + 0.28);
    lit.add(dSign);
    const dHaz = stencil('H9-DECK-B', 0.3, 0x8fa6b3);
    dHaz.position.set(-10, 6.4, -DK_D / 2 + 0.28);
    shell.add(dHaz);

    dock.add(P.freeze(shell));
    addLit(dock, lit);
    dock.add(P.COLLIDE(col));
  }

  // -------------------------------------------------------------------------
  // 13. LIGHTING — 24 real lights, exactly 3 shadow casters.
  //     Everything else is emissive geometry carried by bloom.
  // -------------------------------------------------------------------------

  ctx.light(new THREE.HemisphereLight(0x5fb6d6, 0x0e1620, 0.55));   // planet-blue sky term
  ctx.light(new THREE.AmbientLight(0x1b2833, 0.5));

  // Planetshine: one wide directional, raked ~11 deg below horizontal so it
  // actually reaches through the 9 m window instead of skimming the floor.
  const planetLight = new THREE.DirectionalLight(0x9fd8ec, 1.55);
  planetLight.position.set(320, -60, 34);
  planetLight.target.position.set(0, 3.5, 0);
  ctx.light(planetLight, { shadow: true, range: 95, far: 820 });    // shadow 1

  // Hub — cyan wash down the shaft.
  const hubSpot = new THREE.SpotLight(0xa9ecff, 46, 34, Math.PI / 3.4, 0.55, 1.4);
  hubSpot.position.set(0, HUB_TOP - 0.6, 0);
  hubSpot.target.position.set(0, 0, 0);
  ctx.light(hubSpot, { shadow: true, far: 34 });                    // shadow 2
  const hubFill = new THREE.PointLight(0x8fd8ff, 22, 30, 1.8);
  hubFill.position.set(0, 6.5, 0);
  ctx.light(hubFill);
  const hubFill2 = new THREE.PointLight(0x6fc4ee, 16, 26, 1.8);
  hubFill2.position.set(0, 16.5, 0);
  ctx.light(hubFill2);

  // Ring corridor — four cool pools plus one amber emergency pool.
  for (let i = 0; i < 4; i++) {
    const a = 45 + i * 90;
    const l = new THREE.PointLight(0xd6f2ff, 14, 26, 1.9);
    l.position.set(PX(RING_MID, a), 3.2, PZ(RING_MID, a));
    ctx.light(l);
  }
  const corrAmber = new THREE.PointLight(0xffa040, 10, 22, 2.0);
  corrAmber.position.set(PX(RING_MID, 222), 3.0, PZ(RING_MID, 222));
  ctx.light(corrAmber);

  // Observation hall.
  for (const [rr, a, inten, rng] of [[56, 0, 34, 46], [66, -26, 26, 40], [66, 26, 26, 40]]) {
    const l = new THREE.PointLight(0xb6e2ff, inten, rng, 1.75);
    l.position.set(PX(rr, a), 6.2, PZ(rr, a));
    ctx.light(l);
  }

  // Crew deck.
  for (const [lx, lz, colr, inten, rng, y] of [
    [-6, 0, 0xdcecf5, 16, 26, 3.4], [5, -8, 0xffe0b8, 13, 20, 3.0], [8, 7, 0xbfe8f5, 13, 18, 2.7],
  ]) {
    const w = l2w(crew, lx, lz);
    const l = new THREE.PointLight(colr, inten, rng, 1.9);
    l.position.set(w.x, y, w.z);
    ctx.light(l);
  }

  // Hydroponics — hot magenta; the shadowed spot throws the rack silhouettes.
  {
    const c = l2w(hydro, 0, 0);
    const s1 = new THREE.SpotLight(0xff4fd0, 60, 26, Math.PI / 2.6, 0.6, 1.4);
    s1.position.set(c.x, HY_H - 0.4, c.z);
    s1.target.position.set(c.x, 0, c.z);
    ctx.light(s1, { shadow: true, far: 26 });                       // shadow 3
    const c2 = l2w(hydro, -8, 6);
    const l2 = new THREE.PointLight(0xff69c0, 18, 20, 1.8);
    l2.position.set(c2.x, 3.2, c2.z);
    ctx.light(l2);
  }

  // Engineering.
  {
    const c = l2w(eng, 0, -EN_D / 2 + 4.5);
    const l = new THREE.PointLight(0xffa53c, 40, 34, 1.8);
    l.position.set(c.x, 5.0, c.z);
    ctx.light(l);
    const c2 = l2w(eng, 0, 4);
    const l2 = new THREE.PointLight(0xbcd8ea, 18, 26, 1.9);
    l2.position.set(c2.x, 8.0, c2.z);
    ctx.light(l2);
  }

  // The breach — two reds, one strobing with the beacon.
  let breachStrobe = null;
  {
    const c = l2w(breach, 0, 2);
    const l = new THREE.PointLight(0xff3a20, 22, 30, 1.9);
    l.position.set(c.x, 4.5, c.z);
    ctx.light(l);
    const c2 = l2w(breach, -11, 6);
    breachStrobe = new THREE.PointLight(0xff2010, 6, 22, 2.0);
    breachStrobe.position.set(c2.x, 6.2, c2.z);
    ctx.light(breachStrobe);
  }

  // Docking bay.
  {
    const c = l2w(dock, -3, 0);
    const l = new THREE.PointLight(0xdff0fa, 46, 44, 1.7);
    l.position.set(c.x, DK_H - 2.0, c.z);
    ctx.light(l);
  }

  // -------------------------------------------------------------------------
  // 14. GAMEPLAY — 42 coins, 5 batteries, 4 powerups, one pup, 22 hiding spots
  // -------------------------------------------------------------------------

  const coinPolar = (r, a, y = 0) => ctx.pickup(PX(r, a), y + 1.0, PZ(r, a), 'coin');
  const coinLocal = (g, x, z, y = 0) => { const w = l2w(g, x, z); ctx.pickup(w.x, y + 1.0, w.z, 'coin'); };

  // ring corridor — 8, evenly spread so no arc is dead
  for (let i = 0; i < 8; i++) coinPolar(RING_MID, 22 + i * 45);
  // observation hall — 5, two up on the tiers
  coinPolar(48, -30); coinPolar(48, 30); coinPolar(58, 12);
  coinPolar(70, -8, 0.56); coinPolar(75, 18, 0.84);
  // hub — 7, three of them up the spiral (y = 4.4 * a/360 + turn * 4.4)
  coinPolar(6.5, 40); coinPolar(12.5, 200);
  coinPolar(11.6, 100, 1.22); coinPolar(11.6, 220, 7.09); coinPolar(11.6, 340, 12.96);
  coinPolar(14.2, 60, 8.8); coinPolar(14.2, 250, 17.6);
  // crew deck — 5
  for (const [x, z] of [[-12, -8], [-2, -3], [5, -8], [8, 4], [-12, 8]]) coinLocal(crew, x, z);
  // hydroponics — 3
  for (const [x, z] of [[-9, -6], [0, 2], [9, 8]]) coinLocal(hydro, x, z);
  // engineering — 4, incl. one in the pit and one on the catwalk
  coinLocal(eng, -13, -10); coinLocal(eng, 12, 11);
  coinLocal(eng, 0, 2, -3.0); coinLocal(eng, 5, 6.5, 5.24);
  // the breach — 6, clustered along the treacherous route
  for (const [x, z, y] of [
    [-2.2, 7.6, 0.55], [1.4, 4.8, 1.15], [-1.8, 2.0, 1.7],
    [1.9, -0.8, 2.15], [2.4, -6.2, 2.75], [0, -8.6, 3.0],
  ]) coinLocal(breach, x, z, y);
  // docking bay — 4
  for (const [x, z, y] of [[13, -8, 0], [-3, 9, 0], [-14, 4, 0], [-11, 8.5, 3.6]]) coinLocal(dock, x, z, y);

  // batteries (5)
  ctx.pickup(PX(6.5, 150), 1.0, PZ(6.5, 150), 'battery');
  for (const [g, x, z, y] of [[crew, 12, 10, 0], [eng, -14, 4, 0], [breach, -9, -6, -1.1], [dock, 14, 10, 0]]) {
    const w = l2w(g, x, z);
    ctx.pickup(w.x, y + 1.0, w.z, 'battery');
  }

  // powerups (4)
  ctx.pickup(PX(76, -36), 1.84, PZ(76, -36), 'powerup:ghost');
  ctx.pickup(PX(14.2, 300), 18.6, PZ(14.2, 300), 'powerup:jumpjet');
  {
    const b = l2w(breach, 9.5, 7); ctx.pickup(b.x, -0.1, b.z, 'powerup:nightvision');
    const h = l2w(hydro, 8, -7); ctx.pickup(h.x, 1.0, h.z, 'powerup:silence');
  }

  // the pup — tucked inside the docked shuttle's cabin
  ctx.pickup(cabinWorld.x, 2.63, cabinWorld.z, 'pup');

  // remaining hiding spots (the zones registered theirs as they were built)
  ctx.hidingSpot(0, BRIDGE_Y, 0, 2.0, 0.8);                              // the glass bridge
  ctx.hidingSpot(PX(14.2, 300), 13.2, PZ(14.2, 300), 1.4, 0.85);         // deck D balcony
  ctx.hidingSpot(PX(RING_MID, 214), 0, PZ(RING_MID, 214), 1.6, 0.6);     // fallen-ceiling stretch
  ctx.hidingSpot(cabinWorld.x, 1.63, cabinWorld.z, 1.8, 1.0);            // shuttle cabin

  // -------------------------------------------------------------------------
  // 15. ANIMATION DRIVER — screens at ~6 fps, field shimmer, sparks, strobe
  // -------------------------------------------------------------------------

  let screenAcc = 0, screenIdx = 0;
  ctx.onUpdate((dt, t) => {
    for (const fm of fieldMats) {
      fm.map.offset.y = (fm.map.offset.y + dt * 0.22) % 1;
      fm.map.offset.x = Math.sin(t * 0.6) * 0.02;
      fm.opacity = 0.34 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3.1))
        + 0.1 * Math.pow(Math.max(0, Math.sin(t * 11)), 8);
      fm.emissiveIntensity = 2.2 + Math.sin(t * 2.3) * 0.6;
    }
    for (const s of sparks) {
      const f = Math.pow(Math.max(0, Math.sin(t * 7 + s.phase)), 12);
      s.mat.emissiveIntensity = 0.2 + f * 14;
      s.obj.visible = f > 0.02;
    }
    if (beaconMat) beaconMat.emissiveIntensity = 0.5 + Math.pow(Math.max(0, Math.sin(t * 2.2)), 6) * 9;
    if (breachStrobe) breachStrobe.intensity = 1 + Math.pow(Math.max(0, Math.sin(t * 2.2)), 6) * 26;

    // Repaint two canvases per 1/6 s tick, round-robin, so the cost is spread.
    screenAcc += dt;
    if (screenAcc >= 1 / 6 && animScreens.length) {
      screenAcc -= 1 / 6;
      for (let k = 0; k < Math.min(2, animScreens.length); k++) {
        const s = animScreens[screenIdx++ % animScreens.length];
        s.draw(s.g2, s.W, s.H, t);
        s.mtl.map.needsUpdate = true;
      }
    }
  });
}
