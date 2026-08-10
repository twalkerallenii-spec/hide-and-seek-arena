// ===========================================================================
// A07 — "HALO NINE"   (id: 'orbital')
//
// A derelict ring station in low orbit. Five zones hang off a single curved
// ring corridor that wraps a five-deck atrium; the whole thing is pointed at a
// blue-green planet through a 36-metre panoramic window.
//
// Construction notes
// ------------------
//  * Everything is laid out in POLAR coordinates. PX/PZ convert (radius, deg)
//    to world x/z; YAW_T / YAW_R give the two useful yaw conventions.
//  * Curved geometry (corridor floors, walls, coves, the spiral ramp, the
//    window) is generated as real swept arc strips — `arcFloorGeo` /
//    `arcWallGeo` — one BufferGeometry per run. No straight corridors anywhere
//    on the ring.
//  * Big static dressing is built into a detail Group and `freeze()`d into one
//    mesh per material; anything the player must not walk through gets an
//    invisible box proxy instead.
//
// Layout (angles in degrees, CCW from +X):
//    HUB              r < 15        atrium, 5 decks, spiral ramp
//    SPOKES           r 15 -> 37.5  at 0 / 90 / 180 / 270
//    RING CORRIDOR    r 37.5..42.5  full 360, curved
//    OBSERVATION HALL r 42.5..78    -42 .. +42     <- landmark 1
//    CREW DECK        centred 80
//    HYDROPONICS      centred 130                  <- the visual outlier
//    ENGINEERING      centred 180
//    THE BREACH       centred 236                  <- landmark 3
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
// Polar helpers
// ---------------------------------------------------------------------------

const D2R = Math.PI / 180;
const PX = (r, a) => Math.cos(a * D2R) * r;
const PZ = (r, a) => Math.sin(a * D2R) * r;
/** yaw so that local +X runs along the CCW tangent and local +Z points inward. */
const YAW_T = (a) => -a * D2R - Math.PI / 2;
/** yaw so that local +X points radially outward. */
const YAW_R = (a) => -a * D2R;

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
 * Horizontal (or ramping) annular strip between two radii, swept over an angle.
 * Set yStart != yEnd for a helicoid — that is how the spiral ramp is made.
 */
function arcFloorGeo(r0, r1, aStart, aEnd, yStart, yEnd, segs, uvScale = 4, flip = false) {
  const pos = [], nor = [], uv = [], idx = [];
  const nY = flip ? -1 : 1;
  const rm = (r0 + r1) / 2;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = (aStart + (aEnd - aStart) * t) * D2R;
    const y = yStart + (yEnd - yStart) * t;
    const ca = Math.cos(a), sa = Math.sin(a);
    const arc = a * rm;
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

/** Vertical cylindrical band. `inward` flips the facing toward the axis. */
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

/** Angular spans of a full circle minus a list of [from,to] gaps (degrees). */
function spansWithGaps(gaps) {
  const g = gaps.map(([a, b]) => [((a % 360) + 360) % 360, ((b % 360) + 360) % 360])
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

  // Independent RNG streams so tweaking one system never reshuffles another.
  const rStar = R.fork('stars');
  const rCorr = R.fork('corridor');
  const rCrew = R.fork('crew');
  const rHydro = R.fork('hydro');
  const rEng = R.fork('engineering');
  const rBreach = R.fork('breach');
  const rDock = R.fork('dock');
  const rHall = R.fork('hall');

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
  // 2. MATERIAL PALETTE  (17 surface() calls — well inside the 28 budget)
  // -------------------------------------------------------------------------

  const MAT = {
    // bone-white composite panelling: the station's default read
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

  // Cheap untextured props / emissives.
  const S = {
    dark: M.solid({ color: 0x1b2127, roughness: 0.6, metalness: 0.4 }),
    darker: M.solid({ color: 0x0d1115, roughness: 0.8 }),
    white: M.solid({ color: 0xe7ecef, roughness: 0.45, metalness: 0.25 }),
    trim: M.metal(0x8d979f, 0.35),
    trimDark: M.metal(0x475059, 0.5),
    rubberBlack: M.solid({ color: 0x14181b, roughness: 0.95 }),
    hazard: M.solid({ color: 0xe8a022, roughness: 0.6 }),
    hazardDark: M.solid({ color: 0x2a2418, roughness: 0.8 }),
    glass: M.glassCheap({ color: 0x9fd0e0, opacity: 0.11 }),
    glassFloor: M.glassCheap({ color: 0x8fd8ee, opacity: 0.2 }),
    deadLeaf: M.solid({ color: 0x4d4632, roughness: 0.95, flat: true }),
    leafHot: M.solid({ color: 0x4f8a35, roughness: 0.85, flat: true }),
    coveCyan: M.emissive(0xa9ecff, 3.0),
    coveWhite: M.emissive(0xe8f6ff, 3.6),
    coveAmber: M.emissive(0xffb14a, 3.0),
    emRed: M.emissive(0xff2f1c, 4.0),
    emGreen: M.emissive(0x54ffa0, 4.0),
    emCyan: M.emissive(0x63d4ff, 4.5),
    emMagenta: M.emissive(0xff54d0, 3.4),
    emBlue: M.emissive(0x4aa8ff, 4.0),
    emWhiteHot: M.emissive(0xffffff, 6.0),
  };

  // -------------------------------------------------------------------------
  // 3. LOCAL BUILD HELPERS
  // -------------------------------------------------------------------------

  const meshOf = (geo, mat, collide = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false; m.receiveShadow = true;
    m.userData.collide = collide;
    return m;
  };

  /** Invisible collision box (centre origin). */
  const proxy = (w, h, d, x, y, z, ry = 0) => {
    const b = P.boxC(w, h, d, S.dark, { shadow: false });
    b.visible = false;
    b.userData.collide = true;
    b.position.set(x, y, z);
    b.rotation.y = ry;
    return b;
  };

  /** Emissive strip light run along +X, origin centre. */
  const strip = (len, mat, thick = 0.09) => {
    const b = P.boxC(len, thick, 0.16, mat, { shadow: false });
    b.userData.collide = false;
    return b;
  };

  /** Stencilled alphanumeric plate. Faces +Z of the returned group. */
  const stencil = (text, h, color = 0x9fb3bf, glow) => {
    const { material, aspect } = M.textMaterial(text, {
      color, fontSize: 74, emissive: glow, emissiveIntensity: glow ? 1.4 : 0,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), material);
    m.userData.collide = false;
    return m;
  };

  // --- animated canvas screens ---------------------------------------------
  const animScreens = [];

  /**
   * A wall screen. `draw(g, W, H, t)` is re-run at ~6 fps if animate is true.
   */
  const screen = (w, h, draw, o = {}) => {
    const cw = o.cw ?? 256, ch = o.ch ?? 128;
    const mtl = M.painted(cw, ch, (g, W, H) => draw(g, W, H, 0), {
      transparent: false, emissive: 0xffffff, emissiveIntensity: o.glow ?? 1.5,
      roughness: 0.28, side: THREE.FrontSide, depthWrite: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mtl);
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

  /** Scrolling diagnostic text dump. */
  const drawDiag = (seed) => (g, W, H, t) => {
    drawGrid(g, W, H);
    const rr = (n) => {
      const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    g.font = '11px monospace';
    const rows = Math.floor(H / 12) - 1;
    const scroll = Math.floor(t * 3);
    for (let i = 0; i < rows; i++) {
      const k = i + scroll;
      const ok = rr(k) > 0.22;
      g.fillStyle = ok ? 'rgba(120,225,255,0.9)' : 'rgba(255,120,70,0.95)';
      const code = (0x1000 + Math.floor(rr(k * 3.7) * 0xefff)).toString(16).toUpperCase();
      const val = (rr(k * 5.1) * 100).toFixed(1);
      g.fillText(`H9.${code}  ${ok ? 'NOMINAL' : 'FAULT  '}  ${val}%`, 8, 16 + i * 12);
    }
    g.fillStyle = 'rgba(160,240,255,0.35)';
    g.fillRect(0, 0, W, 3);
  };

  /** Oscilloscope waveform. */
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
    g.fillText('REACTOR / COOLANT LOOP B', 8, 16);
  };

  /** Rotating wireframe cube-in-a-ring. */
  const drawWire = (g, W, H, t) => {
    drawGrid(g, W, H, 'rgba(255,190,90,0.10)');
    const cx = W / 2, cy = H / 2 + 6, s = Math.min(W, H) * 0.26;
    const ct = Math.cos(t * 0.9), st = Math.sin(t * 0.9);
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const x = (i & 1 ? 1 : -1), y = (i & 2 ? 1 : -1), z = (i & 4 ? 1 : -1);
      const xr = x * ct - z * st, zr = x * st + z * ct;
      const yr = y * 0.82 + zr * 0.34;
      pts.push([cx + xr * s, cy - yr * s]);
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

  /** Static status board (not animated). */
  const drawStatus = (label, bad) => (g, W, H) => {
    g.fillStyle = bad ? '#1a0705' : '#04141c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = bad ? 'rgba(255,90,60,0.8)' : 'rgba(110,220,255,0.7)';
    g.lineWidth = 3; g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = bad ? 'rgba(255,120,90,0.95)' : 'rgba(150,235,255,0.95)';
    g.font = 'bold 26px monospace'; g.textAlign = 'center';
    g.fillText(label, W / 2, H / 2 + 9);
    g.textAlign = 'left';
  };

  // -------------------------------------------------------------------------
  // 4. SPACE — starfield, planet, atmosphere shell, distant sun
  // -------------------------------------------------------------------------

  {
    // --- starfield: one Points draw call on an 800 m shell (camera far = 900)
    const N = 2600;
    const sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const u = rStar() * 2 - 1, th = rStar() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u)), rr = 800;
      sp[i * 3] = Math.cos(th) * s * rr;
      sp[i * 3 + 1] = u * rr;
      sp[i * 3 + 2] = Math.sin(th) * s * rr;
      const bright = Math.pow(rStar(), 3);
      col.setHSL(0.55 + (rStar() - 0.5) * 0.18, 0.35 * rStar(), 0.4 + 0.6 * bright);
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

    // --- the planet ---------------------------------------------------------
    const pt = ctx.tex('organic', { size: 512, repeat: 4, color: 0x2f7d86, wet: 0x0a2a46, seed: 4242 });
    const planetMat = new THREE.MeshStandardMaterial({
      map: pt.map, normalMap: pt.normalMap, roughnessMap: pt.roughnessMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      emissive: new THREE.Color(0x1c5c6e), emissiveMap: pt.map, emissiveIntensity: 0.9,
      roughness: 1, metalness: 0, fog: false,
    });
    const planetGrp = new THREE.Group();
    planetGrp.position.set(432, -302, 44);
    planetGrp.rotation.z = 0.22;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(250, 56, 34), planetMat);
    planet.userData.collide = false;
    planetGrp.add(planet);

    // thin emissive atmosphere + an outer haze halo
    const atmoA = new THREE.Mesh(new THREE.SphereGeometry(257, 40, 24), new THREE.MeshBasicMaterial({
      color: 0x8fe0ff, transparent: true, opacity: 0.24, side: THREE.BackSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    const atmoB = new THREE.Mesh(new THREE.SphereGeometry(274, 32, 20), new THREE.MeshBasicMaterial({
      color: 0x5fc4f0, transparent: true, opacity: 0.11, side: THREE.BackSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    atmoA.userData.collide = false; atmoB.userData.collide = false;
    atmoA.renderOrder = -8; atmoB.renderOrder = -9;
    planetGrp.add(atmoA, atmoB);
    ctx.addDecor(planetGrp);

    // --- distant sun, framed by the breach (which faces 236 deg) ------------
    const sunDir = new THREE.Vector3(PX(1, 236), 0.15, PZ(1, 236)).normalize();
    const sunPos = sunDir.multiplyScalar(770);
    sunPos.y = 150;
    const sunCore = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({
      color: 0xfff6e2, fog: false, depthWrite: false,
    }));
    sunCore.position.copy(sunPos);
    sunCore.userData.collide = false;
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
    flare.userData.collide = false;
    flare.renderOrder = -7;
    ctx.addDecor(sunCore, flare);

    ctx.onUpdate((dt) => { planetGrp.rotation.y += dt * 0.012; });
  }

  // -------------------------------------------------------------------------
  // 5. THE HUB — cylindrical atrium, spiral ramp, glass bridge, holo schematic
  // -------------------------------------------------------------------------

  const HUB_R = 15;
  const DECK_H = 4.4;
  const HUB_TOP = DECK_H * 5;            // 22
  const SPOKES = [0, 90, 180, 270];

  {
    const shell = new THREE.Group();     // frozen dressing
    const lit = new THREE.Group();       // emissive dressing (kept separate)

    // Deck A floor
    const floorA = meshOf(arcFloorGeo(0.001, HUB_R, 0, 360, 0, 0, 64, 5), MAT.stone, true);
    ctx.add(floorA);

    // Shaft wall, gapped at the four spokes.
    const hubGaps = SPOKES.map(a => [a - 9.5, a + 9.5]);
    for (const [a0, a1] of spansWithGaps(hubGaps)) {
      const segs = Math.max(2, Math.round((a1 - a0) / 3));
      const w = meshOf(arcWallGeo(HUB_R, a0, a1, 0, HUB_TOP, segs, 4.5, true), MAT.hexPale, true);
      ctx.add(w);
    }
    // Lintels over the spoke mouths so the shaft reads as sealed above deck A.
    for (const a of SPOKES) {
      const w = meshOf(arcWallGeo(HUB_R, a - 9.5, a + 9.5, 4.2, HUB_TOP, 6, 4.5, true), MAT.hexPale, false);
      ctx.add(w);
    }

    // Dome cap
    const cap = meshOf(arcFloorGeo(0.001, HUB_R + 0.6, 0, 360, HUB_TOP + 0.8, HUB_TOP + 0.8, 48, 6, true), MAT.ceil, false);
    ctx.addDecor(cap);
    const capRing = meshOf(arcWallGeo(HUB_R + 0.6, 0, 360, HUB_TOP, HUB_TOP + 0.8, 48, 3, true), MAT.struct, false);
    ctx.addDecor(capRing);

    // --- balconies on decks B..E -------------------------------------------
    for (let d = 1; d <= 4; d++) {
      const y = d * DECK_H;
      const bf = meshOf(arcFloorGeo(13.4, HUB_R, 0, 360, y, y, 56, 3), MAT.grate, true);
      ctx.add(bf);
      // soffit + fascia
      shell.add(meshOf(arcFloorGeo(13.4, HUB_R, 0, 360, y - 0.22, y - 0.22, 40, 3, true), MAT.hullBig, false));
      shell.add(meshOf(arcWallGeo(13.4, 0, 360, y - 0.24, y, 40, 2), MAT.struct, false));
      // glowing handrail cove under the rail
      const cove = meshOf(arcWallGeo(13.38, 0, 360, y + 0.9, y + 1.02, 40, 2), S.coveCyan, false);
      lit.add(cove);
      // instanced rail posts
      const post = new THREE.CylinderGeometry(0.028, 0.028, 1.0, 6);
      post.translate(0, 0.5, 0);
      const posts = P.scatter(post, S.trim, 72, (i, dm) => {
        const a = i * 5;
        dm.position.set(PX(13.42, a), y, PZ(13.42, a));
      }, 7 + d);
      posts.castShadow = false;
      ctx.addDecor(posts);
      // continuous top rail
      shell.add(meshOf(arcWallGeo(13.42, 0, 360, y + 1.0, y + 1.07, 48, 2), S.trim, false));

      // deck placard
      const pl = stencil(`DECK ${'ABCDE'[d]}`, 0.32, 0xbcd6e4, 0x2a4f66);
      pl.position.set(PX(14.85, 34), y + 2.0, PZ(14.85, 34));
      pl.rotation.y = YAW_R(34) + Math.PI;
      shell.add(pl);
    }

    // --- spiral ramp: four turns of helicoid, y = 4.4 per revolution --------
    const RAMP_R0 = 9.9, RAMP_R1 = 13.35;
    for (let turn = 0; turn < 4; turn++) {
      const y0 = turn * DECK_H, y1 = (turn + 1) * DECK_H;
      const deck = meshOf(arcFloorGeo(RAMP_R0, RAMP_R1, 0, 360, y0, y1, 44, 3), MAT.grateDS, true);
      ctx.add(deck);
      // kerb / balustrade on the inner (void) edge, and a rub-rail outboard
      const kerb = meshOf(arcWallGeo(RAMP_R0, 0, 360, 0, 1.02, 44, 2, false, y0, y1), MAT.hullDS, true);
      ctx.add(kerb);
      lit.add(meshOf(arcWallGeo(RAMP_R0 - 0.02, 0, 360, 0.86, 0.98, 44, 2, false, y0, y1), S.coveCyan, false));
      shell.add(meshOf(arcWallGeo(RAMP_R1 + 0.01, 0, 360, 0, 0.16, 44, 2, false, y0, y1), S.trimDark, false));
    }
    // landing plates where the ramp meets each balcony
    for (let d = 1; d <= 4; d++) {
      const y = d * DECK_H;
      const lp = meshOf(arcFloorGeo(RAMP_R1 - 0.05, 13.45, -7, 7, y, y, 6, 2), MAT.grate, true);
      ctx.add(lp);
    }

    // --- glass bridge across the shaft at deck E ---------------------------
    const bridgeY = HUB_TOP - DECK_H;   // 17.6, where the ramp tops out
    {
      const bg = new THREE.Group();
      const deck = P.boxC(3.2, 0.14, 26.8, S.glassFloor, { shadow: false });
      deck.position.set(0, bridgeY - 0.07, 0);
      deck.userData.collide = true;
      bg.add(deck);
      // structural ribs under the glass
      for (let i = -6; i <= 6; i++) {
        const rib = P.boxC(3.3, 0.16, 0.12, S.trimDark, { shadow: false });
        rib.position.set(0, bridgeY - 0.2, i * 2.1);
        rib.userData.collide = false;
        bg.add(rib);
      }
      for (const sx of [-1, 1]) {
        const rail = P.railing(26.8, 1.0, S.trim);
        rail.rotation.y = Math.PI / 2;
        rail.position.set(sx * 1.6, bridgeY, 0);
        bg.add(rail);
        const lightRail = P.boxC(0.06, 0.07, 26.8, S.coveWhite, { shadow: false });
        lightRail.position.set(sx * 1.62, bridgeY + 0.98, 0);
        lightRail.userData.collide = false;
        bg.add(lightRail);
      }
      bg.rotation.y = YAW_R(0);
      ctx.add(bg);
    }

    // --- holographic station schematic, spinning in the void ---------------
    const holo = new THREE.Group();
    holo.position.set(0, 11.5, 0);
    {
      const holoMat = M.emissive(0x7fe4ff, 2.6, { transparent: true, opacity: 0.42, side: THREE.DoubleSide });
      const holoMat2 = M.emissive(0xffd27f, 2.4, { transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.055, 6, 72), holoMat);
      ringOuter.rotation.x = Math.PI / 2;
      const ringMid = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.04, 6, 56), holoMat);
      ringMid.rotation.x = Math.PI / 2;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 14, 1, true), holoMat);
      holo.add(ringOuter, ringMid, core);
      // radial spokes + zone blocks
      for (let i = 0; i < 8; i++) {
        const a = i * 45;
        const sp2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 0.06), holoMat);
        sp2.position.set(PX(2.8, a), 0, PZ(2.8, a));
        sp2.rotation.y = YAW_R(a);
        holo.add(sp2);
        const blk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.1), i === 5 ? holoMat2 : holoMat);
        blk.position.set(PX(4.6, a + 22), 0, PZ(4.6, a + 22));
        blk.rotation.y = YAW_R(a + 22);
        holo.add(blk);
      }
      // a scan plane sweeping the schematic
      const scan = new THREE.Mesh(new THREE.RingGeometry(0.8, 5.2, 40), M.emissive(0x9ff0ff, 1.6, { transparent: true, opacity: 0.13, side: THREE.DoubleSide }));
      scan.rotation.x = -Math.PI / 2;
      holo.add(scan);
      holo.traverse(o => { if (o.isMesh) { o.userData.collide = false; o.castShadow = false; } });
      ctx.addDecor(holo);
      ctx.onUpdate((dt, t) => {
        holo.rotation.y += dt * 0.22;
        scan.position.y = Math.sin(t * 0.5) * 1.5;
        scan.material.opacity = 0.09 + 0.07 * (0.5 + 0.5 * Math.sin(t * 1.3));
      });
      // holo emitter pedestal on deck A
      const ped = P.cyl(1.5, 1.9, 0.5, MAT.struct);
      ped.position.set(0, 0, 0);
      ctx.addSolid(ped);
      const lens = P.cyl(1.25, 1.25, 0.06, S.emCyan, { collide: false, shadow: false });
      lens.position.y = 0.5;
      ctx.addDecor(lens);
    }

    // --- deck-A dressing ----------------------------------------------------
    for (let i = 0; i < 6; i++) {
      const a = 30 + i * 60;
      const b = P.boxC(2.2, 1.05, 0.7, MAT.hull, { shadow: false });
      b.position.set(PX(14.2, a), 0.52, PZ(14.2, a));
      b.rotation.y = YAW_R(a);
      shell.add(b);
      const sc2 = screen(1.7, 0.66, i % 2 ? drawDiag(i * 3 + 1) : drawWave(i * 1.7), { animate: i < 2, cw: 256, ch: 100, glow: 1.6 });
      sc2.position.set(PX(14.7, a), 1.75, PZ(14.7, a));
      sc2.rotation.y = YAW_R(a) + Math.PI;
      lit.add(sc2);
    }
    // fallen ceiling panel + dust sheet over a console
    const sheet = P.boxC(2.6, 0.04, 1.6, MAT.dust, { shadow: false });
    sheet.position.set(PX(11.5, 205), 1.15, PZ(11.5, 205));
    sheet.rotation.set(0.05, YAW_R(205), -0.03);
    shell.add(sheet);

    ctx.addDecor(P.freeze(shell));
    ctx.addDecor(lit);
  }

  // -------------------------------------------------------------------------
  // 6. RING CORRIDOR + SPOKES
  //    Curved: floors and walls are swept arcs, ribs are instanced.
  // -------------------------------------------------------------------------

  const RING_MID = 40, RING_IN = 37.5, RING_OUT = 42.5, CORR_H = 4.2;

  // zone doorways in the OUTER ring wall
  const ZONE_DOORS = [
    { a: 0, half: 10 },    // observation hall (wide proscenium)
    { a: 80, half: 3.0 },  // crew deck
    { a: 130, half: 3.0 }, // hydroponics
    { a: 180, half: 3.4 }, // engineering
    { a: 236, half: 3.0 }, // breach
    { a: 292, half: 4.0 }, // docking bay
  ];

  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();

    // Floor + ceiling: two continuous swept rings.
    ctx.add(meshOf(arcFloorGeo(RING_IN, RING_OUT, 0, 360, 0, 0, 128, 3), MAT.grate, true));
    ctx.addDecor(meshOf(arcFloorGeo(RING_IN, RING_OUT, 0, 360, CORR_H, CORR_H, 96, 3, true), MAT.ceil, false));

    // Inner wall — gaps at the four spokes.
    for (const [a0, a1] of spansWithGaps(SPOKES.map(a => [a - 3.8, a + 3.8]))) {
      const segs = Math.max(2, Math.round((a1 - a0) / 2.2));
      ctx.add(meshOf(arcWallGeo(RING_IN, a0, a1, 0, CORR_H, segs, 3, false), MAT.hullDS, true));
    }
    for (const a of SPOKES) {
      shell.add(meshOf(arcWallGeo(RING_IN, a - 3.8, a + 3.8, 3.0, CORR_H, 4, 3, false), MAT.hull, false));
    }

    // Outer wall — gaps at the six zone doors.
    for (const [a0, a1] of spansWithGaps(ZONE_DOORS.map(d => [d.a - d.half, d.a + d.half]))) {
      const segs = Math.max(2, Math.round((a1 - a0) / 2.2));
      ctx.add(meshOf(arcWallGeo(RING_OUT, a0, a1, 0, CORR_H, segs, 3, true), MAT.hullDS, true));
    }
    for (const d of ZONE_DOORS) {
      if (d.a === 0) continue;  // the hall keeps a full-height proscenium
      shell.add(meshOf(arcWallGeo(RING_OUT, d.a - d.half, d.a + d.half, 3.0, CORR_H, 4, 3, true), MAT.hull, false));
    }

    // Cove lighting: continuous glowing strips tucked behind the ribs.
    lit.add(meshOf(arcFloorGeo(RING_IN + 0.06, RING_IN + 0.5, 0, 360, 3.42, 3.42, 96, 2, true), S.coveWhite, false));
    lit.add(meshOf(arcFloorGeo(RING_OUT - 0.5, RING_OUT - 0.06, 0, 360, 3.42, 3.42, 96, 2, true), S.coveWhite, false));
    lit.add(meshOf(arcWallGeo(RING_IN + 0.04, 0, 360, 3.42, 3.62, 96, 2, false), S.coveCyan, false));
    lit.add(meshOf(arcWallGeo(RING_OUT - 0.04, 0, 360, 3.42, 3.62, 96, 2, true), S.coveCyan, false));
    // floor guide line
    lit.add(meshOf(arcFloorGeo(RING_MID - 0.09, RING_MID + 0.09, 0, 360, 0.015, 0.015, 96, 2), S.emBlue, false));

    // --- instanced structural ribs every ~3 m -------------------------------
    const ribW = RING_OUT - RING_IN + 0.1, ribH = CORR_H - 0.32, ribT = 0.22, ribD = 0.26;
    const ribGeo = P.mergeGeometries([
      new THREE.BoxGeometry(ribT, ribH, ribD).translate(-ribW / 2, ribH / 2, 0),
      new THREE.BoxGeometry(ribT, ribH, ribD).translate(ribW / 2, ribH / 2, 0),
      new THREE.BoxGeometry(ribW + ribT, ribT, ribD).translate(0, ribH + ribT / 2, 0),
    ]);
    const RIBS = 84;   // circumference 251 m / 3 m
    const ribInst = P.scatter(ribGeo, MAT.struct, RIBS, (i, dm) => {
      const a = (i / RIBS) * 360;
      dm.position.set(PX(RING_MID, a), 0, PZ(RING_MID, a));
      dm.rotation.y = YAW_R(a);
    }, 11);
    ribInst.castShadow = false;
    ctx.addDecor(ribInst);

    // hex bolt heads at each rib foot
    const boltGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.035, 6);
    const bolts = P.scatter(boltGeo, S.trimDark, RIBS * 4, (i, dm) => {
      const rib = Math.floor(i / 4), k = i % 4;
      const a = (rib / RIBS) * 360 + (k < 2 ? -0.35 : 0.35);
      const rr = (k % 2 === 0) ? RING_IN + 0.18 : RING_OUT - 0.18;
      dm.position.set(PX(rr, a), 0.9 + (k % 2) * 1.3, PZ(rr, a));
      dm.rotation.set(Math.PI / 2, 0, YAW_R(a));
    }, 12);
    bolts.castShadow = false;
    ctx.addDecor(bolts);

    // ceiling light bars (instanced emissive)
    const barGeo = new THREE.BoxGeometry(1.7, 0.05, 0.22);
    const bars = P.scatter(barGeo, S.coveWhite, 60, (i, dm) => {
      const a = (i / 60) * 360 + 3;
      dm.position.set(PX(RING_MID, a), CORR_H - 0.09, PZ(RING_MID, a));
      dm.rotation.y = YAW_R(a);
      // a stretch of dead fixtures approaching the breach
      if (a > 200 && a < 250 && (i % 3 !== 0)) return false;
    }, 13);
    bars.castShadow = false;
    ctx.addDecor(bars);

    // --- door panels, bulkhead numbers, status LEDs -------------------------
    const secNames = ['SEC 01', 'SEC 02', 'SEC 03', 'SEC 04', 'SEC 05', 'SEC 06',
      'SEC 07', 'SEC 08', 'H9-DECK-A', 'SEC 10', 'SEC 11', 'SEC 12'];
    for (let i = 0; i < 24; i++) {
      const a = i * 15 + 7.5;
      const inner = i % 2 === 0;
      const rr = inner ? RING_IN + 0.12 : RING_OUT - 0.12;
      const face = inner ? YAW_R(a) : YAW_R(a) + Math.PI;

      // recessed door plate
      const dp = P.boxC(2.0, 2.5, 0.1, MAT.hex, { shadow: false });
      dp.position.set(PX(rr, a), 1.25, PZ(rr, a));
      dp.rotation.y = face;
      dp.userData.collide = false;
      shell.add(dp);
      const dSeam = P.boxC(0.04, 2.4, 0.03, S.darker, { shadow: false });
      dSeam.position.set(PX(rr - (inner ? -0.06 : 0.06), a), 1.25, PZ(rr - (inner ? -0.06 : 0.06), a));
      dSeam.rotation.y = face;
      dSeam.userData.collide = false;
      shell.add(dSeam);

      // status LED
      const ledMat = (i % 7 === 3) ? S.emRed : (i % 5 === 0 ? S.coveAmber : S.emGreen);
      const led = P.boxC(0.13, 0.05, 0.03, ledMat, { shadow: false });
      const lr = rr + (inner ? 0.08 : -0.08);
      led.position.set(PX(lr, a), 2.0, PZ(lr, a));
      led.rotation.y = face;
      led.userData.collide = false;
      lit.add(led);

      // stencilled bulkhead code
      if (i % 2 === 0) {
        const st = stencil(secNames[(i / 2) % secNames.length], 0.26, 0x8fa6b3);
        st.position.set(PX(lr, a + 1.6), 2.55, PZ(lr, a + 1.6));
        st.rotation.y = face;
        shell.add(st);
      } else if (i % 6 === 1) {
        const st = stencil('H9-DECK-A', 0.22, 0x7d94a2);
        st.position.set(PX(lr, a + 1.4), 2.45, PZ(lr, a + 1.4));
        st.rotation.y = face;
        shell.add(st);
      }
    }

    // hazard chevrons flanking each zone door
    const chevMat = M.painted(128, 32, (g, W, H) => {
      g.fillStyle = '#161206'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#e8a022';
      for (let x = -H; x < W + H; x += 22) {
        g.beginPath();
        g.moveTo(x, H); g.lineTo(x + 11, H); g.lineTo(x + 11 + H, 0); g.lineTo(x + H, 0);
        g.closePath(); g.fill();
      }
    }, { transparent: false, roughness: 0.7, emissive: 0x2a1e06, emissiveIntensity: 0.5 });
    for (const d of ZONE_DOORS) {
      for (const s of [-1, 1]) {
        const a = d.a + s * (d.half + 0.7);
        const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.0), chevMat);
        ch.position.set(PX(RING_OUT - 0.11, a), 1.55, PZ(RING_OUT - 0.11, a));
        ch.rotation.y = YAW_R(a) + Math.PI;
        ch.userData.collide = false;
        shell.add(ch);
      }
      // over-door sign
      const nameByAngle = { 0: 'OBSERVATION', 80: 'CREW · A-DECK', 130: 'HYDROPONICS', 180: 'ENGINEERING', 236: 'SECTION 09 — SEALED', 292: 'DOCKING 1' };
      const sg = stencil(nameByAngle[d.a], 0.3, 0xd6ecf7, 0x1d4a63);
      sg.position.set(PX(RING_OUT - 0.13, d.a), 3.55, PZ(RING_OUT - 0.13, d.a));
      sg.rotation.y = YAW_R(d.a) + Math.PI;
      lit.add(sg);
    }

    // --- decay: a stretch where the ceiling panels have all come down ------
    for (let i = 0; i < 16; i++) {
      const a = 206 + i * 2.6;
      const pnl = P.boxC(2.0, 0.05, 1.3, MAT.ceil, { shadow: false });
      pnl.position.set(PX(RING_MID + rCorr.range(-1.2, 1.2), a), 0.06, PZ(RING_MID + rCorr.range(-1.2, 1.2), a));
      pnl.rotation.set(rCorr.range(-0.14, 0.14), YAW_R(a) + rCorr.range(-0.5, 0.5), rCorr.range(-0.1, 0.1));
      pnl.userData.collide = false;
      shell.add(pnl);
      // exposed ceiling conduit above
      const cd = P.boxC(2.4, 0.1, 0.1, S.trimDark, { shadow: false });
      cd.position.set(PX(RING_MID + 0.7, a), CORR_H - 0.28, PZ(RING_MID + 0.7, a));
      cd.rotation.y = YAW_R(a) + 1.57;
      cd.userData.collide = false;
      shell.add(cd);
    }
    // cabling spilling out of an opened wall panel
    for (let i = 0; i < 9; i++) {
      const a = 214 + i * 0.35;
      const c = P.cyl(0.024, 0.024, rCorr.range(1.2, 2.4), i % 3 ? S.rubberBlack : M.solid({ color: 0x8a2a2a, roughness: 0.9 }), { seg: 5, collide: false, shadow: false });
      c.position.set(PX(RING_OUT - 0.2, a), 2.6, PZ(RING_OUT - 0.2, a));
      c.rotation.set(rCorr.range(-0.5, 0.5), YAW_R(a), rCorr.range(0.6, 1.5));
      shell.add(c);
    }
    const hangPanel = P.boxC(1.4, 1.6, 0.06, MAT.hex, { shadow: false });
    hangPanel.position.set(PX(RING_OUT - 0.35, 215), 2.2, PZ(RING_OUT - 0.35, 215));
    hangPanel.rotation.set(0, YAW_R(215) + Math.PI, 0.55);
    hangPanel.userData.collide = false;
    shell.add(hangPanel);

    // emergency locker hanging open
    {
      const a = 118;
      const lk = P.boxC(0.9, 1.5, 0.34, M.solid({ color: 0xc4342a, roughness: 0.55 }), { shadow: false });
      lk.position.set(PX(RING_IN + 0.28, a), 1.4, PZ(RING_IN + 0.28, a));
      lk.rotation.y = YAW_R(a);
      lk.userData.collide = false;
      shell.add(lk);
      const dr = P.boxC(0.86, 1.44, 0.05, S.white, { shadow: false });
      dr.position.set(PX(RING_IN + 0.75, a + 1.0), 1.4, PZ(RING_IN + 0.75, a + 1.0));
      dr.rotation.y = YAW_R(a) + 1.05;
      dr.userData.collide = false;
      shell.add(dr);
      const st = stencil('EMERG', 0.16, 0xffffff);
      st.position.set(PX(RING_IN + 0.46, a), 1.95, PZ(RING_IN + 0.46, a));
      st.rotation.y = YAW_R(a);
      shell.add(st);
    }

    // --- spokes -------------------------------------------------------------
    for (const a of SPOKES) {
      const sg = new THREE.Group();
      sg.position.set(PX((HUB_R + RING_IN) / 2, a), 0, PZ((HUB_R + RING_IN) / 2, a));
      sg.rotation.y = YAW_R(a);
      const len = RING_IN - HUB_R;   // 22.5
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
      // ribs down the spoke
      for (let i = 0; i < 7; i++) {
        const x = -len / 2 + 1.6 + i * 3.2;
        const rb = new THREE.Mesh(ribGeo, MAT.struct);
        rb.rotation.y = Math.PI / 2;
        rb.position.set(x, 0, 0);
        rb.userData.collide = false; rb.castShadow = false;
        sg.add(rb);
      }
      const sn = stencil(`SPOKE ${1 + SPOKES.indexOf(a)}`, 0.28, 0xbfd8e6, 0x1d4a63);
      sn.position.set(-len / 2 + 0.4, 3.4, 2.5);
      sn.rotation.y = Math.PI;
      sg.add(sn);
      P.NOCOLLIDE(sn);
      ctx.add(sg);
    }

    ctx.addDecor(P.freeze(shell));
    ctx.addDecor(lit);
  }

  // -------------------------------------------------------------------------
  // 7. THE OBSERVATION HALL  (landmark 1)
  //    Curved gallery, r 42.5..78, -42..+42, 9 m tall, all glass outboard.
  // -------------------------------------------------------------------------

  const HALL_A0 = -42, HALL_A1 = 42, HALL_R1 = 78, HALL_H = 9;

  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();

    // Floor (flat part) + ceiling
    ctx.add(meshOf(arcFloorGeo(RING_OUT, 64, HALL_A0, HALL_A1, 0, 0, 72, 5), MAT.stone, true));
    ctx.addDecor(meshOf(arcFloorGeo(RING_OUT, HALL_R1, HALL_A0, HALL_A1, HALL_H, HALL_H, 56, 6, true), MAT.ceil, false));

    // Inner wall above the corridor roof
    ctx.add(meshOf(arcWallGeo(RING_OUT, HALL_A0, HALL_A1, CORR_H, HALL_H, 48, 4, true), MAT.hexPale, false));
    // full-height flanks either side of the proscenium
    for (const [a0, a1] of [[HALL_A0, -10], [10, HALL_A1]]) {
      ctx.add(meshOf(arcWallGeo(RING_OUT, a0, a1, 0, CORR_H, 16, 4, true), MAT.hexPale, false));
    }

    // Radial side walls
    for (const a of [HALL_A0, HALL_A1]) {
      const w = P.wallBetween(PX(RING_OUT, a), PZ(RING_OUT, a), PX(HALL_R1, a), PZ(HALL_R1, a), HALL_H, 0.5, MAT.hull);
      ctx.addSolid(w);
    }

    // --- viewing tiers rising toward the glass ------------------------------
    const TIERS = [[64, 68, 0.28], [68, 72, 0.56], [72, 77.6, 0.84]];
    for (const [r0, r1, y] of TIERS) {
      ctx.add(meshOf(arcFloorGeo(r0, r1, HALL_A0, HALL_A1, y, y, 60, 5), MAT.stone, true));
      ctx.add(meshOf(arcWallGeo(r0, HALL_A0, HALL_A1, y - 0.29, y, 60, 2, true), MAT.hull, true));
      lit.add(meshOf(arcWallGeo(r0 - 0.02, HALL_A0, HALL_A1, y - 0.1, y - 0.03, 60, 2, true), S.coveWhite, false));
    }
    // accessible ramp up the tiers on the +side
    ctx.add(meshOf(arcFloorGeo(64, 77.6, 30, 40, 0, 0.84, 10, 5), MAT.grate, true));

    // --- THE WINDOW ---------------------------------------------------------
    const pane = meshOf(arcWallGeo(HALL_R1, HALL_A0, HALL_A1, 0, HALL_H, 96, 6, true), S.glass, true);
    pane.renderOrder = 2;
    ctx.add(pane);
    // mullions: instanced verticals + two swept horizontal bands
    const mulGeo = new THREE.BoxGeometry(0.16, HALL_H, 0.4);
    mulGeo.translate(0, HALL_H / 2, 0);
    const muls = P.scatter(mulGeo, MAT.struct, 29, (i, dm) => {
      const a = HALL_A0 + (i / 28) * (HALL_A1 - HALL_A0);
      dm.position.set(PX(HALL_R1 - 0.22, a), 0, PZ(HALL_R1 - 0.22, a));
      dm.rotation.y = YAW_R(a);
    }, 21);
    muls.castShadow = false;
    ctx.addDecor(muls);
    shell.add(meshOf(arcWallGeo(HALL_R1 - 0.22, HALL_A0, HALL_A1, 0.84, 1.1, 72, 3, true), MAT.struct, false));
    shell.add(meshOf(arcWallGeo(HALL_R1 - 0.22, HALL_A0, HALL_A1, 8.4, 8.8, 72, 3, true), MAT.struct, false));
    lit.add(meshOf(arcWallGeo(HALL_R1 - 0.3, HALL_A0, HALL_A1, 0.9, 1.02, 72, 3, true), S.coveCyan, false));

    // --- dry fountain at the hall's heart -----------------------------------
    {
      const fx = PX(53, 0), fz = PZ(53, 0);
      const basin = P.cyl(3.4, 3.6, 0.55, MAT.stone);
      basin.position.set(fx, 0, fz);
      ctx.addSolid(basin);
      const inner = P.cyl(2.9, 2.9, 0.12, M.solid({ color: 0x2f3a3e, roughness: 0.75 }), { collide: false, shadow: false });
      inner.position.set(fx, 0.44, fz);
      ctx.addDecor(inner);
      const stalk = P.cyl(0.22, 0.4, 1.9, MAT.stone);
      stalk.position.set(fx, 0.55, fz);
      ctx.addSolid(stalk);
      const bowl = P.cyl(1.15, 0.5, 0.3, MAT.stone, { collide: false, shadow: false });
      bowl.position.set(fx, 2.4, fz);
      ctx.addDecor(bowl);
      // scorch + grit in the dry basin
      const grit = P.rubble(2.4, 12, M.solid({ color: 0x5e5b53, roughness: 0.95 }), 5);
      grit.position.set(fx, 0.5, fz);
      ctx.addDecor(grit);
      ctx.hidingSpot(fx + 3.6, 0, fz + 1.2, 1.5, 0.7);
    }

    // --- planters with dead vegetation --------------------------------------
    const planterAngles = [-33, -20, 20, 33, -27, 27];
    for (let i = 0; i < planterAngles.length; i++) {
      const a = planterAngles[i];
      const rr = i < 4 ? 49 : 60;
      const x = PX(rr, a), z = PZ(rr, a);
      const box = P.boxC(3.4, 0.7, 1.8, MAT.stone, { shadow: false });
      box.position.set(x, 0.35, z);
      box.rotation.y = YAW_R(a);
      box.userData.collide = true;
      ctx.add(box);
      const soil = P.boxC(3.0, 0.06, 1.45, M.solid({ color: 0x30291f, roughness: 1 }), { shadow: false });
      soil.position.set(x, 0.71, z);
      soil.rotation.y = YAW_R(a);
      soil.userData.collide = false;
      shell.add(soil);
      for (let k = 0; k < 5; k++) {
        const b = P.bush(rHall.range(0.28, 0.55), 0x4a4130, 40 + i * 7 + k);
        b.position.set(x + rHall.range(-1.2, 1.2), 0.7, z + rHall.range(-0.5, 0.5));
        shell.add(b);
        // bare twigs
        const tw = P.cyl(0.015, 0.025, rHall.range(0.6, 1.3), S.deadLeaf, { seg: 4, collide: false, shadow: false });
        tw.position.set(x + rHall.range(-1.2, 1.2), 0.72, z + rHall.range(-0.5, 0.5));
        tw.rotation.set(rHall.range(-0.3, 0.3), 0, rHall.range(-0.3, 0.3));
        shell.add(tw);
      }
      ctx.hidingSpot(x, 0, z + (i < 4 ? 1.6 : -1.6), 1.3, 0.6);
    }

    // --- benches along the tiers --------------------------------------------
    for (let i = 0; i < 12; i++) {
      const a = -36 + i * 6.5;
      const rr = 66 + (i % 3) * 4;
      const bx = P.boxC(2.6, 0.14, 0.5, MAT.stone, { shadow: false });
      const yb = rr < 68 ? 0.28 : (rr < 72 ? 0.56 : 0.84);
      bx.position.set(PX(rr, a), yb + 0.46, PZ(rr, a));
      bx.rotation.y = YAW_R(a);
      bx.userData.collide = false;
      shell.add(bx);
      for (const s of [-1, 1]) {
        const lg = P.boxC(0.1, 0.46, 0.42, S.trimDark, { shadow: false });
        lg.position.set(PX(rr, a) + Math.cos(YAW_R(a)) * 0 + s * 1.1 * Math.cos(YAW_R(a) + 0), yb + 0.23, PZ(rr, a) - s * 1.1 * Math.sin(YAW_R(a)));
        lg.userData.collide = false;
        shell.add(lg);
      }
    }

    // --- drifting debris inside the hall (zero-g dust motes) ----------------
    const moteGeo = new THREE.IcosahedronGeometry(0.06, 0);
    const motes = P.scatter(moteGeo, S.white, 220, (i, dm, rr) => {
      const a = rr.range(HALL_A0 + 3, HALL_A1 - 3);
      const rad = rr.range(46, 76);
      dm.position.set(PX(rad, a), rr.range(0.6, 8.0), PZ(rad, a));
      dm.scale.setScalar(rr.range(0.4, 1.4));
    }, 33);
    motes.castShadow = false;
    ctx.addDecor(motes);
    ctx.onUpdate((dt, t) => { motes.rotation.y = Math.sin(t * 0.05) * 0.006; });

    // --- signage + a big hall screen ---------------------------------------
    const bigScreen = screen(4.2, 1.7, drawWire, { cw: 384, ch: 156, glow: 1.7 });
    bigScreen.position.set(PX(RING_OUT + 0.12, -26), 4.2, PZ(RING_OUT + 0.12, -26));
    bigScreen.rotation.y = YAW_R(-26);
    lit.add(bigScreen);

    const hallSign = stencil('HALO NINE\nOBSERVATION GALLERY', 0.52, 0xe4f4ff, 0x2b6a86);
    hallSign.position.set(PX(RING_OUT + 0.12, 24), 5.4, PZ(RING_OUT + 0.12, 24));
    hallSign.rotation.y = YAW_R(24);
    lit.add(hallSign);

    // pendant uplights hanging in the gallery volume
    for (let i = 0; i < 9; i++) {
      const a = -32 + i * 8;
      const rr = 52 + (i % 2) * 8;
      const cord = P.cyl(0.02, 0.02, 2.4, S.trimDark, { seg: 4, collide: false, shadow: false });
      cord.position.set(PX(rr, a), HALL_H - 2.4, PZ(rr, a));
      shell.add(cord);
      const disc = P.cyl(0.55, 0.55, 0.1, S.coveWhite, { seg: 14, collide: false, shadow: false });
      disc.position.set(PX(rr, a), HALL_H - 2.5, PZ(rr, a));
      lit.add(disc);
    }

    ctx.addDecor(P.freeze(shell));
    ctx.addDecor(lit);
  }

  // -------------------------------------------------------------------------
  // Zone helper — a rectangular module tangent to the ring at radius 42.5.
  // Local +X = tangential (CCW), local +Z = inward (toward the corridor).
  // -------------------------------------------------------------------------

  function zoneModule(aDeg, w, d, h, doorW, mats) {
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
    const fl = P.ground(w, d, mats.floor);
    fl.userData.collide = true;
    g.add(fl);
    const cl = P.ceiling(w + 0.4, d + 0.4, h, mats.ceil ?? MAT.ceil);
    cl.userData.collide = false; cl.castShadow = false;
    g.add(cl);
    ctx.add(g);
    return g;
  }

  /** Convert a zone-local (x,z) into world coordinates. */
  function local2world(g, x, z) {
    const v = new THREE.Vector3(x, 0, z);
    g.updateMatrixWorld(true);
    return v.applyMatrix4(g.matrixWorld);
  }

  // -------------------------------------------------------------------------
  // 8. CREW DECK — cabins, galley, med-bay
  // -------------------------------------------------------------------------

  const CREW_W = 34, CREW_D = 26, CREW_H = 4.4;
  const crew = zoneModule(80, CREW_W, CREW_D, CREW_H, 4, { wall: MAT.hull, floor: MAT.grate });
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const solid = new THREE.Group();

    // spine corridor down local Z at x=0; cabins along the -X side, galley and
    // med-bay on +X.
    const partMat = MAT.hull;

    // --- 6 cabins ------------------------------------------------------------
    const cabinW = 4.6, cabinD = 4.4;
    for (let i = 0; i < 6; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const cx = -CREW_W / 2 + 2.6 + col * (cabinW + 0.6);
      const cz = -CREW_D / 2 + 2.6 + row * (cabinD + 5.4);
      const cg = new THREE.Group();
      cg.position.set(cx + cabinW / 2, 0, cz + cabinD / 2);
      const cw = P.roomShell({
        w: cabinW, d: cabinD, h: 2.9, thickness: 0.16, material: partMat,
        doors: [{ side: row === 0 ? 's' : 'n', at: 0.62, width: 1.1, top: 2.2 }],
      });
      P.COLLIDE(cw);
      cg.add(cw);
      const cc = P.ceiling(cabinW, cabinD, 2.9, MAT.ceil);
      cc.userData.collide = false;
      cg.add(cc);

      // bunk
      const bunk = P.boxC(1.05, 0.42, 2.1, M.solid({ color: 0x39424b, roughness: 0.7 }), { shadow: false });
      bunk.position.set(-cabinW / 2 + 0.75, 0.35, 0);
      bunk.userData.collide = false;
      cg.add(bunk);
      const mattress = P.boxC(0.95, 0.16, 1.95, M.solid({ color: 0xb9b2a2, roughness: 0.95 }), { shadow: false });
      mattress.position.set(-cabinW / 2 + 0.75, 0.62, 0);
      mattress.userData.collide = false;
      cg.add(mattress);
      // locker
      const lk = P.lockers(1, MAT.hull);
      lk.position.set(cabinW / 2 - 0.45, 0, -cabinD / 2 + 0.6);
      lk.rotation.y = Math.PI;
      P.NOCOLLIDE(lk);
      cg.add(lk);
      // desk + a personal screen
      const desk = P.boxC(1.5, 0.06, 0.6, MAT.hull, { shadow: false });
      desk.position.set(cabinW / 2 - 1.0, 0.74, cabinD / 2 - 0.9);
      desk.userData.collide = false;
      cg.add(desk);
      for (const sx of [-0.6, 0.6]) {
        const lg = P.boxC(0.06, 0.74, 0.5, S.trimDark, { shadow: false });
        lg.position.set(cabinW / 2 - 1.0 + sx, 0.37, cabinD / 2 - 0.9);
        lg.userData.collide = false;
        cg.add(lg);
      }
      const psc = screen(0.6, 0.34, drawStatus(['OFFLINE', 'MAIL 3', 'LOG', 'IDLE', 'OFFLINE', 'SLEEP'][i], i === 4), { cw: 128, ch: 72, animate: false, glow: 1.1 });
      psc.position.set(cabinW / 2 - 1.0, 1.22, cabinD / 2 - 1.16);
      cg.add(psc);
      // personal clutter
      for (let k = 0; k < 4; k++) {
        const it = P.boxC(rCrew.range(0.08, 0.22), rCrew.range(0.06, 0.2), rCrew.range(0.08, 0.18),
          M.solid({ color: [0x7d4a3a, 0x35506b, 0x6d6a58, 0x8a8f95][k], roughness: 0.85 }), { shadow: false });
        it.position.set(cabinW / 2 - 1.6 + rCrew.range(0, 1.2), 0.82, cabinD / 2 - 0.9 + rCrew.range(-0.2, 0.2));
        it.rotation.y = rCrew.range(0, 3);
        it.userData.collide = false;
        cg.add(it);
      }
      // cabin cove light + number
      const cv = P.boxC(cabinW - 0.6, 0.06, 0.12, i === 3 ? S.coveAmber : S.coveWhite, { shadow: false });
      cv.position.set(0, 2.74, -cabinD / 2 + 0.22);
      cv.userData.collide = false;
      cg.add(P.NOCOLLIDE(cv));
      const num = stencil(`A-${(i + 1) * 2}`, 0.2, 0x9db3c0);
      num.position.set(cabinW / 2 - 0.6, 2.4, (row === 0 ? 1 : -1) * (cabinD / 2 + 0.09));
      num.rotation.y = row === 0 ? 0 : Math.PI;
      cg.add(num);

      crew.add(cg);
      const wp = local2world(crew, cx + 0.8, cz + cabinD / 2);
      ctx.hidingSpot(wp.x, 0, wp.z, 1.5, 1.0);
    }

    // --- galley --------------------------------------------------------------
    {
      const gx = 5.0, gz = -CREW_D / 2 + 5.0;
      const counter = P.boxC(7.0, 0.95, 0.8, MAT.hull, { shadow: false });
      counter.position.set(gx, 0.48, gz);
      counter.userData.collide = true;
      solid.add(counter);
      const top = P.boxC(7.2, 0.08, 0.9, S.trim, { shadow: false });
      top.position.set(gx, 0.99, gz);
      top.userData.collide = false;
      shell.add(top);
      for (let i = 0; i < 4; i++) {
        const cab = P.boxC(1.5, 0.7, 0.4, MAT.hex, { shadow: false });
        cab.position.set(gx - 2.6 + i * 1.75, 2.1, gz - 0.3);
        cab.userData.collide = false;
        shell.add(cab);
      }
      // dispenser + trays + a long table
      const disp = P.boxC(0.8, 1.4, 0.6, MAT.struct, { shadow: false });
      disp.position.set(gx + 4.2, 0.7, gz);
      disp.userData.collide = true;
      solid.add(disp);
      const dled = P.boxC(0.5, 0.1, 0.04, S.emGreen, { shadow: false });
      dled.position.set(gx + 4.2, 1.2, gz + 0.32);
      dled.userData.collide = false;
      lit.add(dled);
      const tbl = P.table(4.4, 0.76, 1.3, MAT.hull);
      tbl.position.set(gx, 0, gz + 4.0);
      P.NOCOLLIDE(tbl);
      shell.add(tbl);
      solid.add(proxy(4.4, 0.78, 1.3, gx, 0.39, gz + 4.0));
      for (let i = 0; i < 6; i++) {
        const ch = P.chair(M.solid({ color: 0x4d565f, roughness: 0.7 }));
        ch.position.set(gx - 1.7 + (i % 3) * 1.7, 0, gz + 4.0 + (i < 3 ? -1.1 : 1.1));
        ch.rotation.y = (i < 3 ? 0 : Math.PI) + rCrew.range(-0.3, 0.3);
        P.NOCOLLIDE(ch);
        shell.add(ch);
      }
      const gs = stencil('GALLEY', 0.3, 0xd6ecf7, 0x1d4a63);
      gs.position.set(gx, 3.1, gz - 0.42);
      lit.add(gs);
      const wp = local2world(crew, gx - 3.0, gz + 0.7);
      ctx.hidingSpot(wp.x, 0, wp.z, 1.3, 0.8);
    }

    // --- med-bay with pods ---------------------------------------------------
    {
      const mx = 8.0, mz = CREW_D / 2 - 6.0;
      const bay = P.roomShell({
        w: 13, d: 9.5, h: 3.2, thickness: 0.18, material: MAT.hull,
        doors: [{ side: 'w', at: 0.5, width: 2.2, top: 2.4 }],
      });
      P.COLLIDE(bay);
      const bg = new THREE.Group();
      bg.position.set(mx, 0, mz);
      bg.add(bay);
      const bc = P.ceiling(13, 9.5, 3.2, MAT.ceil);
      bc.userData.collide = false;
      bg.add(bc);
      // pods
      for (let i = 0; i < 4; i++) {
        const px2 = -4.4 + i * 2.9;
        const base = P.boxC(1.5, 0.7, 2.5, S.white, { shadow: false });
        base.position.set(px2, 0.35, -1.4);
        base.userData.collide = true;
        bg.add(base);
        const lid = P.boxC(1.4, 0.7, 2.4, M.glassCheap({ color: 0xb9e6f5, opacity: 0.24 }), { shadow: false });
        lid.position.set(px2, 1.0, -1.4);
        lid.userData.collide = false;
        bg.add(lid);
        const gl = P.boxC(1.1, 0.03, 2.0, i === 2 ? S.emRed : S.emCyan, { shadow: false });
        gl.position.set(px2, 0.72, -1.4);
        gl.userData.collide = false;
        bg.add(P.NOCOLLIDE(gl));
        const st = stencil(`POD ${i + 1}`, 0.16, 0x9fd8ea);
        st.position.set(px2, 1.5, -0.16);
        bg.add(st);
      }
      const cart = P.machine(1.1, 1.0, 0.7, 91);
      cart.position.set(3.5, 0, 2.6);
      P.NOCOLLIDE(cart);
      bg.add(cart);
      const msc = screen(1.9, 0.9, drawWave(4.2), { cw: 256, ch: 120, glow: 1.6 });
      msc.position.set(-1.5, 2.0, 4.6);
      msc.rotation.y = Math.PI;
      bg.add(msc);
      const ms = stencil('MED-BAY 1', 0.26, 0xd6f2f7, 0x1d5f63);
      ms.position.set(-6.6, 2.7, 0);
      ms.rotation.y = -Math.PI / 2;
      bg.add(ms);
      crew.add(bg);
      const wp1 = local2world(crew, mx - 4.4, mz - 1.4);
      const wp2 = local2world(crew, mx + 1.4, mz - 1.4);
      ctx.hidingSpot(wp1.x, 0, wp1.z, 1.2, 1.0);
      ctx.hidingSpot(wp2.x, 0, wp2.z, 1.2, 1.0);
    }

    // --- corridor dressing in the crew spine --------------------------------
    for (let i = 0; i < 8; i++) {
      const z = -CREW_D / 2 + 3 + i * 3.2;
      const cv = P.boxC(0.12, 0.08, 2.6, S.coveWhite, { shadow: false });
      cv.position.set(-0.9, CREW_H - 0.5, z);
      cv.userData.collide = false;
      lit.add(cv);
    }
    const ds = screen(1.6, 0.8, drawDiag(9), { cw: 224, ch: 112, glow: 1.5 });
    ds.position.set(-0.1, 2.0, CREW_D / 2 - 0.32);
    ds.rotation.y = Math.PI;
    lit.add(ds);

    crew.add(P.freeze(shell));
    crew.add(P.NOCOLLIDE(lit));
    crew.add(P.COLLIDE(solid));
  }

  // -------------------------------------------------------------------------
  // 9. HYDROPONICS — the visual outlier: magenta grow-light jungle
  // -------------------------------------------------------------------------

  const HY_W = 24, HY_D = 22, HY_H = 5.2;
  const hydro = zoneModule(130, HY_W, HY_D, HY_H, 4, { wall: MAT.hull, floor: MAT.hydroFloor });
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const solid = new THREE.Group();

    // rack rows running along local X
    const ROWS = 5;
    for (let r = 0; r < ROWS; r++) {
      const z = -HY_D / 2 + 3.2 + r * 3.9;
      // rack frame (collidable proxy, visual is instanced below)
      solid.add(proxy(18, 2.2, 1.5, 0, 1.1, z));
      for (let lvl = 0; lvl < 3; lvl++) {
        const y = 0.55 + lvl * 0.78;
        const tray = P.boxC(18, 0.1, 1.4, MAT.struct, { shadow: false });
        tray.position.set(0, y, z);
        tray.userData.collide = false;
        shell.add(tray);
        const soil = P.boxC(17.4, 0.12, 1.15, M.solid({ color: 0x2b2a1c, roughness: 1 }), { shadow: false });
        soil.position.set(0, y + 0.1, z);
        soil.userData.collide = false;
        shell.add(soil);
        // grow bar under each shelf above
        const bar = P.boxC(17.6, 0.06, 0.3, S.emMagenta, { shadow: false });
        bar.position.set(0, y + 0.7, z);
        bar.userData.collide = false;
        lit.add(bar);
      }
      // uprights
      for (let i = 0; i <= 6; i++) {
        const up = P.boxC(0.1, 2.3, 0.1, S.trimDark, { shadow: false });
        up.position.set(-9 + i * 3, 1.15, z);
        up.userData.collide = false;
        shell.add(up);
      }
      const wp = local2world(hydro, r % 2 ? -6 : 6, z + 1.9);
      ctx.hidingSpot(wp.x, 0, wp.z, 1.4, 0.95);
    }

    // --- overgrown vegetation escaping the trays (instanced) ----------------
    const leaf = P.billboardCross(0.55, 0.7);
    const leafMat = M.painted(64, 64, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) {
        const x = (i * 37) % W, y0 = H;
        const y1 = H - 12 - ((i * 53) % (H - 16));
        g.strokeStyle = `rgba(${60 + (i * 17) % 60},${140 + (i * 29) % 90},${50 + (i * 11) % 50},0.95)`;
        g.lineWidth = 3 + (i % 3);
        g.beginPath(); g.moveTo(x, y0);
        g.quadraticCurveTo(x + ((i % 5) - 2) * 9, (y0 + y1) / 2, x + ((i % 7) - 3) * 7, y1);
        g.stroke();
      }
    }, { transparent: true, alphaTest: 0.4, roughness: 0.85, emissive: 0x1a2a10, emissiveIntensity: 0.6 });
    const foliage = P.scatter(leaf, leafMat, 900, (i, dm, rr) => {
      const row = i % ROWS;
      const z = -HY_D / 2 + 3.2 + row * 3.9;
      const lvl = rr.int(0, 2);
      dm.position.set(rr.range(-8.8, 8.8), 0.66 + lvl * 0.78, z + rr.range(-0.6, 0.6));
      dm.rotation.y = rr() * 6.283;
      dm.scale.setScalar(rr.range(0.7, 2.1));
    }, 55);
    foliage.castShadow = false;
    hydro.add(P.NOCOLLIDE(foliage));

    // vines spilling down the ends of the racks
    for (let i = 0; i < 26; i++) {
      const v = P.cyl(0.02, 0.03, rHydro.range(0.9, 2.4), S.leafHot, { seg: 4, collide: false, shadow: false });
      v.position.set(rHydro.range(-9, 9), rHydro.range(1.4, 2.1), -HY_D / 2 + 3.2 + rHydro.int(0, ROWS - 1) * 3.9 + rHydro.range(-0.8, 0.8));
      v.rotation.set(rHydro.range(-0.3, 0.3), 0, rHydro.range(-0.3, 0.3));
      shell.add(v);
    }

    // --- suspended sphere of water (zero-g touch) ---------------------------
    const waterBall = P.sphere(0.85, M.glassCheap({ color: 0x6fd6ea, opacity: 0.42 }), { collide: false, shadow: false, seg: 20 });
    waterBall.position.set(-7.0, 2.6, HY_D / 2 - 4.2);
    hydro.add(P.NOCOLLIDE(waterBall));
    ctx.onUpdate((dt, t) => {
      waterBall.position.y = 2.6 + Math.sin(t * 0.5) * 0.22;
      waterBall.scale.set(1 + Math.sin(t * 1.1) * 0.05, 1 - Math.sin(t * 1.1) * 0.05, 1 + Math.cos(t * 0.9) * 0.04);
    });
    {
      const wp = local2world(hydro, -7.0, HY_D / 2 - 4.6);
      ctx.hidingSpot(wp.x, 0, wp.z, 1.2, 0.8);
    }

    // --- fans, humidity haze, control station -------------------------------
    const fans = [];
    for (let i = 0; i < 3; i++) {
      const fx = -7 + i * 7;
      const ring = P.cyl(0.72, 0.72, 0.2, MAT.struct, { seg: 16, collide: false, shadow: false, open: true });
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
      fans.push(blades);
    }
    ctx.onUpdate((dt) => { for (const f of fans) f.rotation.z += dt * 5.2; });

    const hazeMat = M.painted(128, 128, (g, W, H) => {
      const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      grad.addColorStop(0, 'rgba(255,180,240,0.30)');
      grad.addColorStop(0.55, 'rgba(210,140,220,0.12)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
    }, { transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0xff9fe0, emissiveIntensity: 0.8 });
    for (let i = 0; i < 7; i++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), hazeMat);
      card.position.set(rHydro.range(-8, 8), rHydro.range(1.8, 3.6), rHydro.range(-9, 9));
      card.rotation.y = rHydro.range(0, 3.14);
      card.userData.collide = false;
      card.renderOrder = 4;
      hydro.add(card);
    }

    const ctrl = P.deskComputer({ screen: 0xff6fd0, intensity: 2.2 });
    ctrl.position.set(9.4, 0, HY_D / 2 - 2.2);
    ctrl.rotation.y = -1.9;
    P.NOCOLLIDE(ctrl);
    shell.add(ctrl);
    solid.add(proxy(1.5, 0.8, 0.8, 9.4, 0.4, HY_D / 2 - 2.2));

    const hsc = screen(1.5, 0.8, drawDiag(21), { cw: 224, ch: 120, glow: 1.7 });
    hsc.position.set(-HY_W / 2 + 0.28, 2.2, 0);
    hsc.rotation.y = Math.PI / 2;
    lit.add(hsc);
    const hsg = stencil('BAY 3 · HYDROPONICS', 0.3, 0xffd9f4, 0x7a1f5e);
    hsg.position.set(0, 4.1, HY_D / 2 - 0.3);
    hsg.rotation.y = Math.PI;
    lit.add(hsg);

    hydro.add(P.freeze(shell));
    hydro.add(P.NOCOLLIDE(lit));
    hydro.add(P.COLLIDE(solid));
  }

  // -------------------------------------------------------------------------
  // 10. ENGINEERING — reactor spine, turbine, catwalks over a drop
  // -------------------------------------------------------------------------

  const EN_W = 34, EN_D = 28, EN_H = 10;
  const eng = zoneModule(180, EN_W, EN_D, EN_H, 4.6, { wall: MAT.corrug, floor: MAT.engDeck, ceil: MAT.struct });
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const solid = new THREE.Group();

    // The drop: cut the floor by covering it with a dark pit box, then rebuild
    // walkable deck around it. (The zone floor plane stays as the pit bottom.)
    const pitW = 18, pitD = 12;
    const pitFloor = P.boxC(pitW, 0.3, pitD, MAT.engDeck, { shadow: false });
    pitFloor.position.set(0, -3.15, 2);
    pitFloor.userData.collide = true;
    solid.add(pitFloor);
    for (const [w, d, x, z] of [
      [EN_W, (EN_D - pitD) / 2 - 2, 0, -EN_D / 2 + ((EN_D - pitD) / 2 - 2) / 2],
      [EN_W, EN_D / 2 - (2 + pitD / 2), 0, EN_D / 2 - (EN_D / 2 - (2 + pitD / 2)) / 2],
      [(EN_W - pitW) / 2, pitD, -EN_W / 2 + (EN_W - pitW) / 4, 2],
      [(EN_W - pitW) / 2, pitD, EN_W / 2 - (EN_W - pitW) / 4, 2],
    ]) {
      const dk = P.boxC(w, 0.35, d, MAT.engDeck, { shadow: false });
      dk.position.set(x, 0.0, z);
      dk.userData.collide = true;
      solid.add(dk);
    }
    // pit walls
    for (const [w, d, x, z, ry] of [[pitW, 0.3, 0, 2 - pitD / 2, 0], [pitW, 0.3, 0, 2 + pitD / 2, 0]]) {
      const pw = P.boxC(w, 3.3, 0.3, MAT.struct, { shadow: false });
      pw.position.set(x, -1.65, z);
      pw.userData.collide = true;
      solid.add(pw);
    }
    for (const sx of [-1, 1]) {
      const pw = P.boxC(0.3, 3.3, pitD, MAT.struct, { shadow: false });
      pw.position.set(sx * pitW / 2, -1.65, 2);
      pw.userData.collide = true;
      solid.add(pw);
    }
    // ladder down into the pit
    const lad = P.ladder(3.4, S.trim);
    lad.position.set(-pitW / 2 + 1.2, -3.0, 2 - pitD / 2 + 0.35);
    P.COLLIDE(lad);
    eng.add(lad);

    // --- reactor spine -------------------------------------------------------
    const spine = P.cyl(1.8, 1.8, 8.4, MAT.struct, { seg: 20 });
    spine.position.set(0, 0.2, -EN_D / 2 + 4.5);
    P.COLLIDE(spine);
    eng.add(spine);
    for (let i = 0; i < 5; i++) {
      const band = P.cyl(2.05, 2.05, 0.3, S.trimDark, { seg: 20, collide: false, shadow: false });
      band.position.set(0, 0.6 + i * 1.7, -EN_D / 2 + 4.5);
      shell.add(band);
      const glow = P.cyl(2.0, 2.0, 0.5, S.coveAmber, { seg: 20, collide: false, shadow: false });
      glow.position.set(0, 1.1 + i * 1.7, -EN_D / 2 + 4.5);
      lit.add(glow);
    }
    // coolant pipes fanning out of the spine
    for (let i = 0; i < 8; i++) {
      const a = i * 45;
      const pp = P.pipes(9, 2, 0.14, S.trim);
      pp.position.set(Math.cos(a * D2R) * 2.2, 5.2 + (i % 3) * 1.2, -EN_D / 2 + 4.5 + Math.sin(a * D2R) * 0.6);
      pp.rotation.y = a * D2R * 0.4;
      P.NOCOLLIDE(pp);
      shell.add(pp);
    }
    const pipeRun = P.pipes(30, 4, 0.16, S.trim);
    pipeRun.position.set(0, 7.6, -EN_D / 2 + 1.4);
    P.NOCOLLIDE(pipeRun);
    shell.add(pipeRun);

    // --- big rotating turbine -----------------------------------------------
    const turbHub = new THREE.Group();
    turbHub.position.set(EN_W / 2 - 6.5, 4.6, EN_D / 2 - 6.0);
    {
      const housing = P.cyl(3.5, 3.5, 1.4, MAT.struct, { seg: 24, open: true, collide: false, shadow: false });
      housing.rotation.x = Math.PI / 2;
      housing.position.set(EN_W / 2 - 6.5, 4.6, EN_D / 2 - 6.0 + 0.7);
      shell.add(housing);
      solid.add(proxy(7.4, 7.4, 1.6, EN_W / 2 - 6.5, 4.6, EN_D / 2 - 6.0));
      const blades = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const bl = P.boxC(6.2, 0.09, 0.75, S.trim, { shadow: false });
        bl.rotation.y = (i / 9) * Math.PI * 2;
        bl.rotation.x = 0.42;
        bl.userData.collide = false;
        blades.add(bl);
      }
      blades.rotation.x = Math.PI / 2;
      turbHub.add(blades);
      const cone = P.cyl(0.1, 0.7, 0.9, S.trimDark, { seg: 14, collide: false, shadow: false });
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(0, 0, 0.2);
      turbHub.add(cone);
      eng.add(P.NOCOLLIDE(turbHub));
      ctx.onUpdate((dt) => { turbHub.rotation.z -= dt * 1.15; });
    }

    // --- catwalks over the drop ---------------------------------------------
    for (const [z, len] of [[2, 20], [6.5, 20]]) {
      const cw = P.catwalk(len, 1.7, MAT.grate, S.trim);
      cw.position.set(0, 5.2, z);
      P.COLLIDE(cw);
      eng.add(cw);
      // support hangers
      for (let i = -2; i <= 2; i++) {
        const hg = P.boxC(0.09, 4.6, 0.09, S.trimDark, { shadow: false });
        hg.position.set(i * 4.6, 7.6, z);
        hg.userData.collide = false;
        shell.add(hg);
      }
    }
    const link = P.catwalk(4.5, 1.5, MAT.grate, S.trim);
    link.rotation.y = Math.PI / 2;
    link.position.set(-8, 5.2, 4.25);
    P.COLLIDE(link);
    eng.add(link);
    // stairs up to catwalk level
    const st = P.stairs(26, 1.6, 0.2, 0.3, MAT.grate);
    st.position.set(-EN_W / 2 + 2.4, 0.18, -6.6);
    st.rotation.y = Math.PI / 2 + 0.0;
    P.COLLIDE(st);
    eng.add(st);
    solid.add(proxy(2.2, 0.4, 8.5, -EN_W / 2 + 2.4, 5.3, -1.0));

    // --- hazard striping, conduit, screens ----------------------------------
    const hazMat = M.painted(128, 32, (g, W, H) => {
      g.fillStyle = '#20180a'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#f0a92a';
      for (let x = -H; x < W + H; x += 26) {
        g.beginPath();
        g.moveTo(x, H); g.lineTo(x + 13, H); g.lineTo(x + 13 + H, 0); g.lineTo(x + H, 0);
        g.closePath(); g.fill();
      }
    }, { transparent: false, roughness: 0.75, emissive: 0x241a05, emissiveIntensity: 0.6 });
    for (const [x, z, ry, len] of [
      [0, 2 - pitD / 2 - 0.35, 0, pitW], [0, 2 + pitD / 2 + 0.35, 0, pitW],
      [-pitW / 2 - 0.35, 2, Math.PI / 2, pitD], [pitW / 2 + 0.35, 2, Math.PI / 2, pitD],
    ]) {
      const hs = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.55), hazMat);
      hs.rotation.set(-Math.PI / 2, 0, ry);
      hs.position.set(x, 0.19, z);
      hs.userData.collide = false;
      shell.add(hs);
    }
    for (let i = 0; i < 5; i++) {
      const cd = P.boxC(0.28, 0.28, EN_D - 1, S.trimDark, { shadow: false });
      cd.position.set(-EN_W / 2 + 1.6 + i * 0.42, 8.6, 0);
      cd.userData.collide = false;
      shell.add(cd);
    }
    const esc = screen(2.6, 1.3, drawWave(1.3), { cw: 288, ch: 144, glow: 1.8 });
    esc.position.set(-EN_W / 2 + 0.3, 3.0, -8);
    esc.rotation.y = Math.PI / 2;
    lit.add(esc);
    const esc2 = screen(2.2, 1.1, drawDiag(6), { cw: 256, ch: 128, glow: 1.6 });
    esc2.position.set(EN_W / 2 - 0.3, 3.0, -8);
    esc2.rotation.y = -Math.PI / 2;
    lit.add(esc2);
    const eName = stencil('ENGINEERING · REACTOR 1', 0.34, 0xffd6a0, 0x6a3c0a);
    eName.position.set(0, 6.6, -EN_D / 2 + 0.3);
    lit.add(eName);

    // clutter: barrels, crates, a toolbench
    for (let i = 0; i < 9; i++) {
      const b = P.barrel(0.34, 0.95, M.surface('rustMetal', { repeat: 1, size: 256, color: 0x2f4c5c }));
      b.position.set(rEng.range(-15, 15), 0.18, rEng.range(-12, 12));
      if (Math.abs(b.position.x) < pitW / 2 + 1 && Math.abs(b.position.z - 2) < pitD / 2 + 1) continue;
      b.rotation.y = rEng.range(0, 3);
      P.NOCOLLIDE(b);
      shell.add(b);
      solid.add(proxy(0.68, 0.95, 0.68, b.position.x, 0.65, b.position.z));
    }
    const bench = P.table(3.2, 0.9, 1.0, MAT.struct);
    bench.position.set(-13, 0.18, 10);
    P.NOCOLLIDE(bench);
    shell.add(bench);
    solid.add(proxy(3.2, 0.92, 1.0, -13, 0.64, 10));
    {
      const wp = local2world(eng, -13, 10.9);
      ctx.hidingSpot(wp.x, 0, wp.z, 1.3, 0.85);
      const wp2 = local2world(eng, 0, 2);
      ctx.hidingSpot(wp2.x, -3.0, wp2.z, 2.4, 1.0);
    }

    eng.add(P.freeze(shell));
    eng.add(P.NOCOLLIDE(lit));
    eng.add(P.COLLIDE(solid));
  }

  // -------------------------------------------------------------------------
  // 11. THE BREACH  (landmark 3) — impact damage sealed by an emergency field
  // -------------------------------------------------------------------------

  const BR_W = 30, BR_D = 26, BR_H = 8;
  const breach = zoneModule(236, BR_W, BR_D, BR_H, 4, { wall: MAT.burnt, floor: MAT.burnt, ceil: MAT.burnt });
  const fieldMats = [];
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const solid = new THREE.Group();

    // --- tear the outer wall open: an 18 x 6 gash -------------------------
    // The module's own 'n' wall is solid; punch through it with a matching
    // burnt frame and hide the original behind torn plating.
    const gashW = 17, gashH = 6.0;
    const nz = -BR_D / 2;
    // remove the original wall by covering the hole region: build a new wall
    // in four pieces around the gash and push the original out of the way.
    breach.traverse(o => {
      // the roomShell 'n' wall is the mesh nearest z = -BR_D/2 with big width
      if (o.isMesh && o.geometry && o.geometry.parameters &&
        Math.abs(o.position.z - nz) < 0.01 && o.geometry.parameters.width > BR_W - 1) {
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
      solid.add(wl);
    }

    // --- the emergency force field ------------------------------------------
    const ffDraw = (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(150,235,255,0.85)';
      g.lineWidth = 2;
      const s = 22;
      for (let row = 0; row * s * 0.75 < H + s; row++) {
        for (let col = 0; col * s < W + s; col++) {
          const cx = col * s + (row % 2 ? s / 2 : 0), cy = row * s * 0.75;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = k * Math.PI / 3 + Math.PI / 6;
            const px2 = cx + Math.cos(a) * s * 0.48, py = cy + Math.sin(a) * s * 0.48;
            if (k === 0) g.moveTo(px2, py); else g.lineTo(px2, py);
          }
          g.closePath(); g.stroke();
        }
      }
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(120,220,255,0.30)');
      grad.addColorStop(0.5, 'rgba(60,150,220,0.06)');
      grad.addColorStop(1, 'rgba(120,220,255,0.30)');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
    };
    const ffMat = M.painted(128, 128, ffDraw, {
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      emissive: 0x8fe6ff, emissiveIntensity: 2.6, alphaTest: 0,
    });
    ffMat.blending = THREE.AdditiveBlending;
    ffMat.opacity = 0.5;
    ffMat.map.wrapS = ffMat.map.wrapT = THREE.RepeatWrapping;
    ffMat.map.repeat.set(6, 2.4);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(gashW, gashH), ffMat);
    field.position.set(0, gashH / 2, nz);
    field.userData.collide = false;
    field.renderOrder = 6;
    breach.add(field);
    fieldMats.push(ffMat);
    // invisible collider so the player can never step into vacuum
    solid.add(proxy(gashW + 0.6, gashH + 0.4, 0.5, 0, gashH / 2, nz));
    solid.add(proxy(gashW + 0.6, 4, 0.5, 0, gashH + 2, nz));

    // emitter frame around the gash
    for (const [w, h, x, y] of [[gashW + 0.6, 0.45, 0, gashH + 0.2], [0.45, gashH, -(gashW / 2 + 0.2), gashH / 2], [0.45, gashH, gashW / 2 + 0.2, gashH / 2]]) {
      const fr = P.boxC(w, h, 0.6, MAT.struct, { shadow: false });
      fr.position.set(x, y, nz + 0.15);
      fr.userData.collide = false;
      shell.add(fr);
      const gl = P.boxC(w * 0.92, 0.08, 0.1, S.emCyan, { shadow: false });
      gl.position.set(x, y - h / 2 + 0.1, nz + 0.48);
      gl.userData.collide = false;
      lit.add(gl);
    }

    // --- twisted structure + torn panelling ---------------------------------
    for (let i = 0; i < 22; i++) {
      const g2 = P.girder(rBreach.range(2.5, 7), MAT.struct, { scale: 1.5 });
      g2.position.set(rBreach.range(-13, 13), rBreach.range(0.4, 7), rBreach.range(-12, 6));
      g2.rotation.set(rBreach.range(-1.2, 1.2), rBreach.range(0, 3.14), rBreach.range(-1.2, 1.2));
      P.NOCOLLIDE(g2);
      shell.add(g2);
    }
    for (let i = 0; i < 26; i++) {
      const pl = P.boxC(rBreach.range(1.2, 3.2), 0.06, rBreach.range(0.9, 2.4), MAT.burnt, { shadow: false });
      pl.position.set(rBreach.range(-13, 13), rBreach.range(0.1, 5), rBreach.range(-11, 10));
      pl.rotation.set(rBreach.range(-1.5, 1.5), rBreach.range(0, 3.14), rBreach.range(-1.5, 1.5));
      pl.userData.collide = false;
      shell.add(pl);
    }

    // --- walkable route over collapsed floor plates -------------------------
    // A staggered path of tilted slabs from the door (+Z) to the gash (-Z).
    const path = [
      [0, 0.0, 10.5], [-2.2, 0.55, 7.6], [1.4, 1.15, 4.8], [-1.8, 1.7, 2.0],
      [1.9, 2.15, -0.8], [-1.2, 2.5, -3.6], [2.4, 2.75, -6.2], [0, 3.0, -8.6],
    ];
    for (let i = 0; i < path.length; i++) {
      const [x, y, z] = path[i];
      const slab = P.boxC(4.6, 0.32, 3.6, MAT.burnt, { shadow: false });
      slab.position.set(x, y, z);
      slab.rotation.set(rBreach.range(-0.05, 0.05), rBreach.range(-0.3, 0.3), rBreach.range(-0.05, 0.05));
      slab.userData.collide = true;
      solid.add(slab);
      // connective ramp between plates
      if (i > 0) {
        const [px2, py, pz] = path[i - 1];
        const dx = x - px2, dz = z - pz;
        const len = Math.hypot(dx, dz);
        const bridge = P.boxC(1.9, 0.22, len, MAT.grate, { shadow: false });
        bridge.position.set((x + px2) / 2, (y + py) / 2, (z + pz) / 2);
        bridge.rotation.y = Math.atan2(dx, dz);
        bridge.rotation.x = -Math.atan2(y - py, len);
        bridge.userData.collide = true;
        solid.add(bridge);
      }
    }
    // the collapsed floor below the route (a shallow, non-lethal pit floor)
    const sub = P.boxC(BR_W - 1, 0.3, BR_D - 1, MAT.burnt, { shadow: false });
    sub.position.set(0, -1.4, 0);
    sub.userData.collide = true;
    solid.add(sub);
    for (const [w, d, x, z] of [[BR_W - 1, 0.3, 0, -BR_D / 2 + 0.4], [BR_W - 1, 0.3, 0, BR_D / 2 - 0.4]]) {
      const lip = P.boxC(w, 1.7, 0.4, MAT.burnt, { shadow: false });
      lip.position.set(x, -0.55, z);
      lip.userData.collide = true;
      solid.add(lip);
    }
    for (const sx of [-1, 1]) {
      const lip = P.boxC(0.4, 1.7, BR_D - 1, MAT.burnt, { shadow: false });
      lip.position.set(sx * (BR_W / 2 - 0.4), -0.55, 0);
      lip.userData.collide = true;
      solid.add(lip);
    }
    // a ramp back up to the door threshold
    const outRamp = P.boxC(3.2, 0.25, 3.0, MAT.grate, { shadow: false });
    outRamp.position.set(0, -0.5, BR_D / 2 - 2.6);
    outRamp.rotation.x = -0.32;
    outRamp.userData.collide = true;
    solid.add(outRamp);

    // --- debris frozen mid-drift (zero-g) -----------------------------------
    const chunkGeo = new THREE.IcosahedronGeometry(0.28, 0);
    const DRIFT = 54;
    const drift = P.scatter(chunkGeo, MAT.burnt, DRIFT, (i, dm, rr) => {
      dm.position.set(rr.range(-13, 13), rr.range(0.8, 7.2), rr.range(-11, 11));
      dm.scale.set(rr.range(0.5, 2.6), rr.range(0.4, 1.6), rr.range(0.5, 2.2));
      dm.rotation.set(rr() * 3, rr() * 3, rr() * 3);
    }, 77);
    drift.castShadow = false;
    breach.add(P.NOCOLLIDE(drift));
    // per-instance slow tumble
    const driftState = [];
    {
      const rr = R.fork('drift');
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < drift.count; i++) {
        drift.getMatrixAt(i, m4);
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        m4.decompose(pos, q, sc);
        driftState.push({
          pos, q, sc,
          axis: new THREE.Vector3(rr.range(-1, 1), rr.range(-1, 1), rr.range(-1, 1)).normalize(),
          spd: rr.range(0.05, 0.32),
          bob: rr.range(0, 6.28),
        });
      }
      const tmpQ = new THREE.Quaternion();
      const tmpM = new THREE.Matrix4();
      const tmpP = new THREE.Vector3();
      ctx.onUpdate((dt, t) => {
        for (let i = 0; i < driftState.length; i++) {
          const s = driftState[i];
          tmpQ.setFromAxisAngle(s.axis, t * s.spd);
          tmpQ.multiply(s.q);
          tmpP.copy(s.pos);
          tmpP.y += Math.sin(t * 0.22 + s.bob) * 0.14;
          tmpP.x += Math.cos(t * 0.17 + s.bob) * 0.1;
          tmpM.compose(tmpP, tmpQ, s.sc);
          drift.setMatrixAt(i, tmpM);
        }
        drift.instanceMatrix.needsUpdate = true;
      });
    }
    // a drifting clipboard
    const clip = P.boxC(0.3, 0.02, 0.42, M.solid({ color: 0xc8c2ae, roughness: 0.9 }), { shadow: false });
    clip.position.set(4.5, 3.1, 3.0);
    clip.userData.collide = false;
    breach.add(clip);
    ctx.onUpdate((dt, t) => {
      clip.rotation.set(t * 0.3, t * 0.21, t * 0.11);
      clip.position.y = 3.1 + Math.sin(t * 0.4) * 0.35;
    });

    // --- sparking cables + strobing beacon ----------------------------------
    const sparkMats = [];
    for (let i = 0; i < 12; i++) {
      const c = P.cyl(0.03, 0.03, rBreach.range(1.5, 3.4), S.rubberBlack, { seg: 5, collide: false, shadow: false });
      c.position.set(rBreach.range(-12, 12), rBreach.range(4.5, 7.4), rBreach.range(-10, 9));
      c.rotation.set(rBreach.range(-0.6, 0.6), rBreach.range(0, 3), rBreach.range(-0.4, 0.4));
      shell.add(c);
      if (i % 3 === 0) {
        const sm = M.emissive(0xbfe8ff, 6, { transparent: true, opacity: 0.9 });
        const tip = P.sphere(0.07, sm, { collide: false, shadow: false, seg: 8 });
        tip.position.set(c.position.x, c.position.y - 1.5, c.position.z);
        breach.add(P.NOCOLLIDE(tip));
        sparkMats.push({ mat: sm, obj: tip, phase: rBreach.range(0, 6.28) });
      }
    }
    const beaconMat = M.emissive(0xff2010, 5, {});
    const beacon = P.cyl(0.24, 0.3, 0.35, beaconMat, { seg: 12, collide: false, shadow: false });
    beacon.position.set(-11, 6.4, 6);
    breach.add(P.NOCOLLIDE(beacon));

    // --- drifting smoke ------------------------------------------------------
    const smokeMat = M.painted(128, 128, (g, W, H) => {
      const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      grad.addColorStop(0, 'rgba(120,120,130,0.34)');
      grad.addColorStop(0.5, 'rgba(80,80,92,0.14)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
    }, { transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const smokeCards = [];
    for (let i = 0; i < 12; i++) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(11, 7), smokeMat);
      card.position.set(rBreach.range(-11, 11), rBreach.range(1.5, 6), rBreach.range(-10, 10));
      card.rotation.y = rBreach.range(0, 3.14);
      card.userData.collide = false;
      card.renderOrder = 5;
      breach.add(card);
      smokeCards.push({ card, base: card.position.x, sp: rBreach.range(0.06, 0.2) });
    }
    ctx.onUpdate((dt, t) => {
      for (const s of smokeCards) s.card.position.x = s.base + Math.sin(t * s.sp) * 1.6;
    });

    // --- red emergency lighting geometry ------------------------------------
    for (let i = 0; i < 8; i++) {
      const x = -12 + i * 3.4;
      const l = P.boxC(1.6, 0.07, 0.2, S.emRed, { shadow: false });
      l.position.set(x, BR_H - 0.5, (i % 2 ? -1 : 1) * (BR_D / 2 - 1.2));
      l.userData.collide = false;
      lit.add(l);
    }
    const bSign = stencil('SECTION 09\nHULL BREACH', 0.42, 0xffb0a0, 0x8a1a08);
    bSign.position.set(0, 6.9, BR_D / 2 - 0.32);
    bSign.rotation.y = Math.PI;
    lit.add(bSign);
    const bsc = screen(2.0, 1.0, drawStatus('DECOMPRESSION', true), { cw: 256, ch: 128, animate: false, glow: 2.0 });
    bsc.position.set(-BR_W / 2 + 0.3, 3.2, 5);
    bsc.rotation.y = Math.PI / 2;
    lit.add(bsc);

    // hiding spots in the wreckage
    for (const [lx, lz, ly] of [[-9, -6, 0], [9.5, 7, 0], [-6.5, 8.5, 0]]) {
      const wp = local2world(breach, lx, lz);
      ctx.hidingSpot(wp.x, ly - 1.2, wp.z, 1.6, 1.0);
    }

    breach.add(P.freeze(shell));
    breach.add(P.NOCOLLIDE(lit));
    breach.add(P.COLLIDE(solid));

    ctx.onUpdate((dt, t) => {
      for (const s of sparkMats) {
        const f = Math.pow(Math.max(0, Math.sin(t * 7 + s.phase)), 12);
        s.mat.emissiveIntensity = 0.2 + f * 14;
        s.obj.visible = f > 0.02;
      }
      beaconMat.emissiveIntensity = 0.5 + Math.pow(Math.max(0, Math.sin(t * 2.2)), 6) * 9;
    });
  }

  // -------------------------------------------------------------------------
  // 12. DOCKING BAY — shuttle, cargo pods, control booth
  // -------------------------------------------------------------------------

  const DK_W = 34, DK_D = 28, DK_H = 12;
  const dock = zoneModule(292, DK_W, DK_D, DK_H, 5, { wall: MAT.hullBig, floor: MAT.bayFloor, ceil: MAT.struct });
  let shuttleWorld = null;
  {
    const shell = new THREE.Group();
    const lit = new THREE.Group();
    const solid = new THREE.Group();

    // --- deck markings -------------------------------------------------------
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
    marks.userData.collide = false;
    marks.renderOrder = 1;
    dock.add(marks);

    // --- the shuttle (enterable) --------------------------------------------
    const sh = new THREE.Group();
    sh.position.set(-3, 0, 0);
    sh.rotation.y = 0.25;
    {
      // hull: two tapered cylinders + a cockpit
      const body = P.cyl(1.9, 2.2, 11, MAT.skin, { seg: 14, collide: false, shadow: false });
      body.rotation.z = Math.PI / 2;
      body.position.set(-5.5, 2.6, 0);
      sh.add(body);
      const nose = P.cyl(0.5, 1.9, 2.6, MAT.skin, { seg: 14, collide: false, shadow: false });
      nose.rotation.z = -Math.PI / 2;
      nose.position.set(5.5, 2.6, 0);
      sh.add(nose);
      const tail = P.cyl(2.2, 1.5, 1.6, MAT.struct, { seg: 14, collide: false, shadow: false });
      tail.rotation.z = Math.PI / 2;
      tail.position.set(-7.1, 2.6, 0);
      sh.add(tail);
      // wings + engines
      for (const sz of [-1, 1]) {
        const wing = P.boxC(4.6, 0.24, 3.2, MAT.skin, { shadow: false });
        wing.position.set(-3.5, 2.2, sz * 2.9);
        wing.rotation.x = sz * 0.12;
        wing.userData.collide = false;
        sh.add(wing);
        const nac = P.cyl(0.75, 0.75, 3.4, MAT.struct, { seg: 12, collide: false, shadow: false });
        nac.rotation.z = Math.PI / 2;
        nac.position.set(-5.0, 2.0, sz * 4.0);
        sh.add(nac);
        const bell = P.cyl(0.85, 0.62, 0.5, S.emBlue, { seg: 12, collide: false, shadow: false });
        bell.rotation.z = Math.PI / 2;
        bell.position.set(-6.9, 2.0, sz * 4.0);
        lit.add(bell.clone().translateX(0));
        sh.add(bell);
        // landing legs
        const leg = P.cyl(0.14, 0.14, 1.5, S.trimDark, { seg: 8, collide: false, shadow: false });
        leg.position.set(-4.0, 0, sz * 2.2);
        leg.rotation.z = sz * 0.16;
        sh.add(leg);
        const pad = P.cyl(0.45, 0.5, 0.16, S.trimDark, { seg: 10, collide: false, shadow: false });
        pad.position.set(-4.0 + sz * 0.2, 0, sz * 2.5);
        sh.add(pad);
      }
      const legF = P.cyl(0.14, 0.14, 1.5, S.trimDark, { seg: 8, collide: false, shadow: false });
      legF.position.set(3.6, 0, 0);
      sh.add(legF);
      // cockpit glazing
      const canopy = P.boxC(2.6, 1.0, 2.2, M.glassCheap({ color: 0x7fbcd8, opacity: 0.3 }), { shadow: false });
      canopy.position.set(4.4, 3.5, 0);
      canopy.userData.collide = false;
      sh.add(canopy);
      // interior: a hollow cabin the player can walk into via the rear ramp
      const cabW = 3.2, cabL = 8.0, cabH = 2.3;
      const cabFloor = P.boxC(cabW, 0.16, cabL, MAT.grate, { shadow: false });
      cabFloor.position.set(-2.6, 1.55, 0);
      cabFloor.userData.collide = true;
      sh.add(cabFloor);
      for (const sz of [-1, 1]) {
        const w = P.boxC(cabL, cabH, 0.14, MAT.hull, { shadow: false });
        w.rotation.y = Math.PI / 2;
        w.position.set(-2.6, 1.63 + cabH / 2, sz * cabW / 2);
        w.userData.collide = true;
        sh.add(w);
        const bench = P.boxC(cabL - 1, 0.12, 0.55, MAT.hull, { shadow: false });
        bench.position.set(-2.6, 2.1, sz * (cabW / 2 - 0.36));
        bench.userData.collide = false;
        sh.add(bench);
        const cv = P.boxC(cabL - 1.2, 0.05, 0.1, S.coveWhite, { shadow: false });
        cv.position.set(-2.6, 3.72, sz * (cabW / 2 - 0.14));
        cv.userData.collide = false;
        sh.add(P.NOCOLLIDE(cv));
      }
      const cabCeil = P.boxC(cabW, 0.14, cabL, MAT.hull, { shadow: false });
      cabCeil.position.set(-2.6, 1.63 + cabH, 0);
      cabCeil.userData.collide = true;
      sh.add(cabCeil);
      const front = P.boxC(cabW, cabH, 0.14, MAT.hull, { shadow: false });
      front.position.set(1.5, 1.63 + cabH / 2, 0);
      front.userData.collide = true;
      sh.add(front);
      // rear boarding ramp
      const ramp = P.boxC(2.8, 0.16, 3.4, MAT.grate, { shadow: false });
      ramp.position.set(-8.0, 0.85, 0);
      ramp.rotation.x = 0.0;
      ramp.rotation.z = -0.42;
      ramp.userData.collide = true;
      sh.add(ramp);
      const rampLip = P.boxC(2.8, 0.16, 1.6, MAT.grate, { shadow: false });
      rampLip.position.set(-6.6, 1.5, 0);
      rampLip.userData.collide = true;
      sh.add(rampLip);
      // hull number + a running light
      const hn = stencil('H9-SHUTTLE 04', 0.34, 0x2b3138);
      hn.position.set(-1.0, 3.4, 2.05);
      hn.rotation.y = 0.0;
      sh.add(hn);
      const nav = P.sphere(0.1, S.emRed, { collide: false, shadow: false, seg: 8 });
      nav.position.set(5.2, 3.9, 0);
      sh.add(nav);
      dock.add(sh);
      P.NOCOLLIDE(hn);
      shuttleWorld = local2world(dock, -5.6, 0);
    }

    // --- cargo pods ----------------------------------------------------------
    for (let i = 0; i < 7; i++) {
      const px2 = DK_W / 2 - 4.5 - (i % 2) * 3.4;
      const pz2 = -DK_D / 2 + 4 + Math.floor(i / 2) * 4.6;
      const pod = P.container(3.0, [0x2f6f8f, 0x8a5a2f, 0x37704f, 0x6b4a70][i % 4], 100 + i);
      pod.position.set(px2, 0, pz2);
      pod.rotation.y = rDock.range(-0.12, 0.12) + (i % 2 ? 0 : 0.05);
      P.NOCOLLIDE(pod);
      shell.add(pod);
      solid.add(proxy(3.0, 2.6, 2.5, px2, 1.3, pz2));
      if (i < 2) {
        const wp = local2world(dock, px2 - 2.2, pz2);
        ctx.hidingSpot(wp.x, 0, wp.z, 1.3, 0.95);
      }
    }
    // one pod stacked and open
    const openPod = P.container(3.0, 0x8a3a3a, 130);
    openPod.position.set(DK_W / 2 - 4.5, 2.62, -DK_D / 2 + 4);
    P.NOCOLLIDE(openPod);
    shell.add(openPod);
    solid.add(proxy(3.0, 2.6, 2.5, DK_W / 2 - 4.5, 3.92, -DK_D / 2 + 4));

    for (let i = 0; i < 8; i++) {
      const cr = P.crate(rDock.range(0.6, 1.1), MAT.hull);
      cr.position.set(rDock.range(-14, 14), 0, rDock.range(6, 12));
      cr.rotation.y = rDock.range(0, 3);
      P.NOCOLLIDE(cr);
      shell.add(cr);
      solid.add(proxy(1.0, 1.0, 1.0, cr.position.x, 0.5, cr.position.z));
    }

    // --- control booth on a raised platform ---------------------------------
    {
      const bx = -DK_W / 2 + 6, bz = DK_D / 2 - 6;
      const plat = P.boxC(9, 3.6, 7, MAT.hullBig, { shadow: false });
      plat.position.set(bx, 1.8, bz);
      plat.userData.collide = true;
      solid.add(plat);
      const st2 = P.stairs(20, 1.5, 0.18, 0.28, MAT.grate);
      st2.position.set(bx + 5.2, 0, bz - 3.0);
      st2.rotation.y = -Math.PI / 2;
      P.COLLIDE(st2);
      dock.add(st2);
      solid.add(proxy(2.0, 0.4, 6.0, bx + 5.2, 3.6, bz - 0.2));
      // booth walls + glazing
      const bw = P.roomShell({
        w: 8.4, d: 6.4, h: 2.8, thickness: 0.2, material: MAT.hull,
        doors: [{ side: 'e', at: 0.5, width: 1.4, top: 2.2 }],
      });
      const bg = new THREE.Group();
      bg.position.set(bx, 3.6, bz);
      P.COLLIDE(bw);
      bg.add(bw);
      const glassW = P.boxC(8.0, 1.7, 0.08, M.glassCheap({ color: 0x9fd0e0, opacity: 0.16 }), { shadow: false });
      glassW.position.set(0, 1.5, -3.2);
      glassW.userData.collide = false;
      bg.add(glassW);
      const roof = P.ceiling(8.8, 6.8, 2.8, MAT.ceil);
      roof.userData.collide = false;
      bg.add(roof);
      for (let i = 0; i < 3; i++) {
        const con = P.deskComputer({ screen: 0x63d4ff, intensity: 2.0 });
        con.position.set(-2.6 + i * 2.6, 0, -2.2);
        P.NOCOLLIDE(con);
        bg.add(con);
      }
      const bsc2 = screen(2.0, 1.0, drawDiag(31), { cw: 256, ch: 128, glow: 1.7 });
      bsc2.position.set(0, 2.0, 3.1);
      bsc2.rotation.y = Math.PI;
      P.NOCOLLIDE(bsc2);
      bg.add(bsc2);
      const cv = P.boxC(7.6, 0.06, 0.12, S.coveWhite, { shadow: false });
      cv.position.set(0, 2.66, 3.0);
      cv.userData.collide = false;
      bg.add(P.NOCOLLIDE(cv));
      dock.add(bg);
      const wp = local2world(dock, bx - 2.5, bz + 2.0);
      ctx.hidingSpot(wp.x, 3.6, wp.z, 1.4, 1.0);
    }

    // --- bay lighting rig + signage ------------------------------------------
    for (let i = 0; i < 6; i++) {
      const x = -13 + i * 5.2;
      const truss = P.girder(DK_D - 2, MAT.struct, { scale: 2.2 });
      truss.rotation.y = Math.PI / 2;
      truss.position.set(x, DK_H - 1.0, 0);
      P.NOCOLLIDE(truss);
      shell.add(truss);
      for (let k = 0; k < 3; k++) {
        const lp = P.boxC(1.4, 0.1, 0.9, S.coveWhite, { shadow: false });
        lp.position.set(x, DK_H - 1.4, -8 + k * 8);
        lp.userData.collide = false;
        lit.add(lp);
      }
    }
    const dSign = stencil('DOCKING 1 · PAD 01', 0.44, 0xdcf0fa, 0x1d4a63);
    dSign.position.set(6, 8.2, -DK_D / 2 + 0.3);
    lit.add(dSign);
    const dHaz = stencil('H9-DECK-B', 0.3, 0x8fa6b3);
    dHaz.position.set(-10, 6.4, -DK_D / 2 + 0.3);
    shell.add(dHaz);

    dock.add(P.freeze(shell));
    dock.add(P.NOCOLLIDE(lit));
    dock.add(P.COLLIDE(solid));
  }

  // -------------------------------------------------------------------------
  // 13. LIGHTING — 22 real lights, 3 shadow casters, everything else emissive
  // -------------------------------------------------------------------------

  ctx.light(new THREE.HemisphereLight(0x5fb6d6, 0x0e1620, 0.55));         // 1
  ctx.light(new THREE.AmbientLight(0x1b2833, 0.5));                        // 2

  // Planetshine: one wide directional aimed inward through the window.
  const planetLight = new THREE.DirectionalLight(0x9fd8ec, 1.55);
  planetLight.position.set(300, -170, 30);
  planetLight.target.position.set(0, 3, 0);
  ctx.light(planetLight, { shadow: true, range: 95, far: 820 });           // 3 (shadow 1)

  // Hub: cyan wash down the shaft.
  const hubSpot = new THREE.SpotLight(0xa9ecff, 46, 34, Math.PI / 3.4, 0.55, 1.4);
  hubSpot.position.set(0, HUB_TOP - 0.6, 0);
  hubSpot.target.position.set(0, 0, 0);
  ctx.light(hubSpot, { shadow: true, far: 34 });                           // 4 (shadow 2)
  const hubFill = new THREE.PointLight(0x8fd8ff, 22, 30, 1.8);
  hubFill.position.set(0, 6.5, 0);
  ctx.light(hubFill);                                                      // 5
  const hubFill2 = new THREE.PointLight(0x6fc4ee, 16, 26, 1.8);
  hubFill2.position.set(0, 16.5, 0);
  ctx.light(hubFill2);                                                     // 6

  // Ring corridor: four soft cool pools.
  for (let i = 0; i < 4; i++) {
    const a = 45 + i * 90;
    const l = new THREE.PointLight(0xd6f2ff, 14, 26, 1.9);
    l.position.set(PX(RING_MID, a), 3.2, PZ(RING_MID, a));
    ctx.light(l);                                                          // 7..10
  }
  // one amber emergency pool in the dead-ceiling stretch
  const corrAmber = new THREE.PointLight(0xffa040, 10, 22, 2.0);
  corrAmber.position.set(PX(RING_MID, 222), 3.0, PZ(RING_MID, 222));
  ctx.light(corrAmber);                                                    // 11

  // Observation hall: cool fill + a warm accent at the fountain.
  const hallA = new THREE.PointLight(0xbfe6ff, 34, 46, 1.7);
  hallA.position.set(PX(56, 0), 6.5, PZ(56, 0));
  ctx.light(hallA);                                                        // 12
  const hallB = new THREE.PointLight(0x9fd4f0, 26, 40, 1.8);
  hallB.position.set(PX(66, -26), 6.0, PZ(66, -26));
  ctx.light(hallB);                                                        // 13
  const hallC = new THREE.PointLight(0x9fd4f0, 26, 40, 1.8);
  hallC.position.set(PX(66, 26), 6.0, PZ(66, 26));
  ctx.light(hallC);                                                        // 14

  // Crew deck.
  {
    const c = local2world(crew, -6, 0);
    const l = new THREE.PointLight(0xdcecf5, 16, 26, 1.9);
    l.position.set(c.x, 3.4, c.z);
    ctx.light(l);                                                          // 15
    const g = local2world(crew, 7, -8);
    const l2 = new THREE.PointLight(0xffe0b8, 13, 20, 1.9);
    l2.position.set(g.x, 3.0, g.z);
    ctx.light(l2);                                                         // 16
    const m = local2world(crew, 8, 7);
    const l3 = new THREE.PointLight(0xbfe8f5, 13, 18, 1.9);
    l3.position.set(m.x, 2.7, m.z);
    ctx.light(l3);                                                         // 17
  }

  // Hydroponics: hot magenta, one shadowed spot to throw rack shadows.
  {
    const c = local2world(hydro, 0, 0);
    const s1 = new THREE.SpotLight(0xff4fd0, 60, 26, Math.PI / 2.6, 0.6, 1.4);
    s1.position.set(c.x, HY_H - 0.4, c.z);
    s1.target.position.set(c.x, 0, c.z);
    ctx.light(s1, { shadow: true, far: 26 });                              // 18 (shadow 3)
    const c2 = local2world(hydro, -8, 6);
    const l2 = new THREE.PointLight(0xff69c0, 18, 20, 1.8);
    l2.position.set(c2.x, 3.2, c2.z);
    ctx.light(l2);                                                         // 19
  }

  // Engineering: amber reactor glow + a cool catwalk light.
  {
    const c = local2world(eng, 0, -EN_D / 2 + 4.5);
    const l = new THREE.PointLight(0xffa53c, 40, 34, 1.8);
    l.position.set(c.x, 5.0, c.z);
    ctx.light(l);                                                          // 20
    const c2 = local2world(eng, 0, 4);
    const l2 = new THREE.PointLight(0xbcd8ea, 18, 26, 1.9);
    l2.position.set(c2.x, 8.0, c2.z);
    ctx.light(l2);                                                         // 21
  }

  // Breach: two reds, one of which strobes with the beacon.
  let breachStrobe = null;
  {
    const c = local2world(breach, 0, 2);
    const l = new THREE.PointLight(0xff3a20, 22, 30, 1.9);
    l.position.set(c.x, 4.5, c.z);
    ctx.light(l);                                                          // 22
    const c2 = local2world(breach, -11, 6);
    breachStrobe = new THREE.PointLight(0xff2010, 6, 22, 2.0);
    breachStrobe.position.set(c2.x, 6.2, c2.z);
    ctx.light(breachStrobe);                                               // 23
  }

  // Docking bay.
  {
    const c = local2world(dock, -3, 0);
    const l = new THREE.PointLight(0xdff0fa, 46, 44, 1.7);
    l.position.set(c.x, DK_H - 2.0, c.z);
    ctx.light(l);                                                          // 24
  }

  // -------------------------------------------------------------------------
  // 14. GAMEPLAY — pickups & hiding spots
  // -------------------------------------------------------------------------

  const coin = (r, a, y = 0) => ctx.pickup(PX(r, a), y + 1.0, PZ(r, a), 'coin');

  // ring corridor (8)
  for (let i = 0; i < 8; i++) coin(RING_MID, 22 + i * 45);
  // observation hall (5)
  coin(48, -30); coin(48, 30); coin(58, 12); coin(70, -8, 0.56); coin(75, 18, 0.84);
  // hub, including up the spiral (7)
  coin(6.5, 40); coin(12.5, 200);
  coin(11.6, 100, 1.22); coin(11.6, 220, 2.69); coin(11.6, 340, 4.16);
  coin(14.2, 60, 8.8); coin(14.2, 240, 17.6);
  // crew deck (5)
  {
    const pts = [[-12, -8], [-2, 0], [6, -8], [8, 6], [-12, 8]];
    for (const [x, z] of pts) { const w = local2world(crew, x, z); ctx.pickup(w.x, 1.0, w.z, 'coin'); }
  }
  // hydroponics (3)
  {
    for (const [x, z] of [[-9, -6], [0, 2], [9, 8]]) { const w = local2world(hydro, x, z); ctx.pickup(w.x, 1.0, w.z, 'coin'); }
  }
  // engineering (4) — one down in the pit, one on the catwalk
  {
    const a1 = local2world(eng, -13, -10); ctx.pickup(a1.x, 1.0, a1.z, 'coin');
    const a2 = local2world(eng, 12, 11); ctx.pickup(a2.x, 1.0, a2.z, 'coin');
    const a3 = local2world(eng, 0, 2); ctx.pickup(a3.x, -2.0, a3.z, 'coin');
    const a4 = local2world(eng, 5, 6.5); ctx.pickup(a4.x, 6.2, a4.z, 'coin');
  }
  // the breach (6, clustered — the risky wing)
  {
    const bp = [[-2.2, 7.6, 1.55], [1.4, 4.8, 2.15], [-1.8, 2.0, 2.7], [1.9, -0.8, 3.15], [2.4, -6.2, 3.75], [0, -8.6, 4.0]];
    for (const [x, z, y] of bp) { const w = local2world(breach, x, z); ctx.pickup(w.x, y, w.z, 'coin'); }
  }
  // docking bay (4)
  {
    for (const [x, z, y] of [[13, -8, 1.0], [-3, 9, 1.0], [-14, 4, 1.0], [-11, 8.5, 4.6]]) {
      const w = local2world(dock, x, z); ctx.pickup(w.x, y, w.z, 'coin');
    }
  }

  // --- batteries (5) --------------------------------------------------------
  ctx.pickup(PX(13.0, 150), 1.0, PZ(13.0, 150), 'battery');
  {
    const w = local2world(crew, 12, 10); ctx.pickup(w.x, 1.0, w.z, 'battery');
    const e = local2world(eng, -14, 4); ctx.pickup(e.x, 1.0, e.z, 'battery');
    const b = local2world(breach, -9, -6); ctx.pickup(b.x, 0.2, b.z, 'battery');
    const d = local2world(dock, 14, 10); ctx.pickup(d.x, 1.0, d.z, 'battery');
  }

  // --- powerups (4) ---------------------------------------------------------
  ctx.pickup(PX(76, -36), 1.84, PZ(76, -36), 'powerup:ghost');
  ctx.pickup(PX(14.2, 150), 18.6, PZ(14.2, 150), 'powerup:jumpjet');
  {
    const b = local2world(breach, 9.5, 7); ctx.pickup(b.x, 0.2, b.z, 'powerup:nightvision');
    const h = local2world(hydro, 8, -7); ctx.pickup(h.x, 1.0, h.z, 'powerup:silence');
  }

  // --- the pup: tucked inside the docked shuttle's cabin --------------------
  if (shuttleWorld) ctx.pickup(shuttleWorld.x, 2.4, shuttleWorld.z, 'pup');

  // --- remaining hiding spots ----------------------------------------------
  ctx.hidingSpot(0, 17.6, 0, 2.0, 0.8);                       // on the glass bridge
  ctx.hidingSpot(PX(12.0, 120), 4.4, PZ(12.0, 120), 1.4, 0.7); // deck B ramp shoulder
  ctx.hidingSpot(PX(14.2, 300), 13.2, PZ(14.2, 300), 1.4, 0.85); // deck D balcony
  ctx.hidingSpot(PX(RING_MID, 214), 0, PZ(RING_MID, 214), 1.6, 0.6); // fallen-ceiling stretch
  if (shuttleWorld) ctx.hidingSpot(shuttleWorld.x, 1.7, shuttleWorld.z, 1.8, 1.0); // shuttle cabin

  // -------------------------------------------------------------------------
  // 15. ANIMATION — screens at ~6 fps, force field shimmer, strobe
  // -------------------------------------------------------------------------

  let screenAcc = 0;
  let screenIdx = 0;
  ctx.onUpdate((dt, t) => {
    // force field
    for (const fm of fieldMats) {
      fm.map.offset.y = (fm.map.offset.y + dt * 0.22) % 1;
      fm.map.offset.x = Math.sin(t * 0.6) * 0.02;
      fm.opacity = 0.34 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3.1)) + 0.1 * Math.pow(Math.max(0, Math.sin(t * 11)), 8);
      fm.emissiveIntensity = 2.2 + Math.sin(t * 2.3) * 0.6;
    }
    // strobing breach beacon light
    if (breachStrobe) breachStrobe.intensity = 1 + Math.pow(Math.max(0, Math.sin(t * 2.2)), 6) * 26;

    // screens: repaint at ~6 fps, one per tick so the cost is spread out
    screenAcc += dt;
    const period = 1 / 6;
    if (screenAcc >= period && animScreens.length) {
      screenAcc -= period;
      const n = Math.min(2, animScreens.length);
      for (let k = 0; k < n; k++) {
        const s = animScreens[screenIdx % animScreens.length];
        screenIdx++;
        s.draw(s.g2, s.W, s.H, t);
        s.mtl.map.needsUpdate = true;
      }
    }
  });
}
