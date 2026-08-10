// =============================================================================
// THE AQUEDUCTS  —  a drowned temple-aqueduct complex swallowed by jungle.
//
// Half Angkor Wat, half Roman waterworks. Deep teal + gunmetal, tidal glass,
// drowning mist. Five landmark zones:
//
//   1. THE GREAT AQUEDUCT   3-tier arcade, 27 m tall, walkable water channel
//   2. THE FLOODED GALLERY  pillared hall under 0.4 m of water, caustics
//   3. THE TEMPLE           stepped ziggurat, dark chamber, oculus, altar
//   4. THE CISTERN          vaulted reservoir at y = -6, black water, one grate
//   5. THE JUNGLE           canopy, roots, vines, buried fragments, cliffs
//
// Vertical stack: cistern floor -6.0 | basin floor -0.4 | ground 0.0 |
//                 temple summit 12.0 | aqueduct deck 26.0 | canopy ~34
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'aqueducts',
  name: 'THE AQUEDUCTS',
  tagline: 'The jungle took the waterworks back. Something still keeps the channels clear.',
  order: 5,
  difficulty: 3,
  biome: 'outdoor',
  seed: 50505,
  spawn: [-8, 0.0, -36],
  bounds: 104,
  colors: ['#3fbfa0', '#22301c'],
  music: 'calm',
};

// -----------------------------------------------------------------------------
// World constants
// -----------------------------------------------------------------------------

const HX = 104;              // half extent in X
const HZ = 95;               // half extent in Z
const GY = 0.0;              // dry ground height
const BY = -0.4;             // basin floor (player wades from GY down to BY)
const WY = 0.0;              // open water surface

// canal — runs the full length of the map directly under the aqueduct
const CANAL = { x0: -HX, z0: -30, x1: HX, z1: -16 };
// flooded gallery basin
const GAL = { x0: -90, z0: -16, x1: -24, z1: 58 };

// aqueduct
const AQ_Z = -23;            // centre line
const AQ_X0 = -96, AQ_SPAN = 16, AQ_PIERS = 13;   // piers at -96 .. +96
const T0_TOP = 11.0, T0_CORN = 11.6;
const T1_TOP = 21.0, T1_CORN = 21.5;
const T2_TOP = 25.6;
const DECK_Y = 26.0;         // walk surface of the channel
const DECK_WATER = 26.18;
const PARAPET_Y = 27.1;
const GAP_X0 = 18, GAP_X1 = 30;   // collapsed span

// temple
const TX = 36, TZ = 44;
const TIER_H = [0.0, 2.4, 5.4, 7.6, 9.8, 12.0];
const TIER_R = [23.0, 19.4, 15.8, 12.2, 8.6];
const CH_R = 7.0;            // chamber inner half-width
const CH_CEIL = 5.0;
const OC_R = 1.6;            // oculus / light chimney half-width

// cistern
const CY = -6.0;             // cistern floor
const CWY = -5.7;            // cistern water
const CCEIL = -1.4;          // underside of the vault slab
const CIS = { x0: -29, z0: -87, x1: 21, z1: -53 };   // outer wall footprint
const GRATE = { x: -6, z: -70, r: 2.5 };

// stairwell down to the cistern
const SW = { x0: 19, z0: -65, x1: 30, z1: -55 };

const TAU = Math.PI * 2;

// =============================================================================
export async function build(ctx) {
  const { props: P, mat: M, rng } = ctx;

  const R = {
    stone: rng.fork('stone'),
    aq: rng.fork('aqueduct'),
    gal: rng.fork('gallery'),
    tmp: rng.fork('temple'),
    cis: rng.fork('cistern'),
    jun: rng.fork('jungle'),
    tex: rng.fork('textures'),
    dress: rng.fork('dressing'),
  };

  // ---------------------------------------------------------------------------
  // §0  MATERIALS. Only 12 surface() calls, all 256² except the hero stone at
  // 384² — procedural texture generation dominates arena load time, so the
  // three water bodies deliberately share one `repeat` (= one cached normal
  // map) and the root material reuses the exact opts props.tree() asks for.
  // ---------------------------------------------------------------------------

  const mStone = M.surface('concrete', { color: 0x7f8b78, repeat: 3, size: 384, seed: 5 });
  const mStoneWet = M.surface('concrete', { color: 0x53645a, repeat: 3, size: 256, seed: 7 });
  const mTemple = M.surface('marble', { color: 0x94a390, vein: 0x44573e, repeat: 3, size: 256, rough: 0.74 });
  const mTempleDk = M.surface('marble', { color: 0x6b7c6b, vein: 0x2e3c30, repeat: 2, size: 256, rough: 0.82 });
  const mColumn = M.surface('marble', { color: 0x8b9987, vein: 0x3c4c3b, repeat: 2, size: 256, rough: 0.8 });
  const mDark = M.surface('rock', { color: 0x3e4d47, repeat: 3, size: 256, seed: 9 });
  const mPave = M.surface('tile', { color: 0x78846f, grout: 0x3b4535, tiles: 5, repeat: 3, size: 256, seed: 3 });
  const mSoil = M.surface('dirt', { color: 0x4a4531, repeat: 4, size: 256, seed: 11 });
  const mBed = M.surface('rock', { color: 0x3a4842, repeat: 6, size: 256, seed: 37 });
  const mCliff = M.surface('rock', { color: 0x5c695b, repeat: 3, size: 256, seed: 17 });
  const mRubble = M.surface('concrete', { color: 0x8b9483, repeat: 1, size: 256, seed: 23 });
  // exact opts props.tree() uses for bark, so this is a free cache hit
  const mRoot = M.surface('wood', { color: 0x4a3524, repeat: 1, size: 256, planks: 2, rough: 0.95 });
  const mIron = M.metal(0x2a2f2c, 0.72);
  const mInvis = M.solid({ color: 0x000000 });

  // water — three separate instances so each can drift on its own clock
  // identical `repeat` => all three share one cached normal-map generation
  const wOpen = M.water({ color: 0x11424a, opacity: 0.90, transmission: 0.28, repeat: 14 });
  const wChannel = M.water({ color: 0x1a5a58, opacity: 0.82, transmission: 0.32, repeat: 14 });
  const wBlack = M.water({ color: 0x040f0e, opacity: 0.96, transmission: 0.10, repeat: 14 });

  // ---------------------------------------------------------------------------
  // §0.1  PAINTED TEXTURES  (canvas → texture, reused across many meshes)
  // ---------------------------------------------------------------------------

  /** Make a painted material, hand back its texture set to RepeatWrapping. */
  function paintTex(w, h, draw) {
    const m = M.painted(w, h, draw, { transparent: false });
    const t = m.map;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // --- invented glyph frieze -------------------------------------------------
  const glyphRng = R.tex.fork('glyph');
  function drawGlyphs(c, W, H) {
    c.fillStyle = '#707c68';
    c.fillRect(0, 0, W, H);
    // stone mottle
    for (let i = 0; i < 1400; i++) {
      const v = 90 + Math.floor(glyphRng() * 60);
      c.fillStyle = `rgba(${v},${v + 8},${v - 6},0.09)`;
      c.fillRect(glyphRng() * W, glyphRng() * H, glyphRng() * 22 + 2, glyphRng() * 10 + 2);
    }
    // top and bottom rails
    c.fillStyle = 'rgba(38,48,36,0.75)';
    c.fillRect(0, 0, W, H * 0.09);
    c.fillRect(0, H * 0.91, W, H * 0.09);
    // glyph cells
    const cols = 10;
    const cw = W / cols;
    for (let i = 0; i < cols; i++) {
      const x0 = i * cw + cw * 0.16;
      const y0 = H * 0.17, gw = cw * 0.68, gh = H * 0.66;
      c.strokeStyle = 'rgba(30,40,30,0.82)';
      c.fillStyle = 'rgba(30,40,30,0.7)';
      c.lineWidth = Math.max(2, H * 0.035);
      const kind = Math.floor(glyphRng() * 6);
      c.beginPath();
      if (kind === 0) {                       // stacked bars
        const n = 2 + Math.floor(glyphRng() * 3);
        for (let k = 0; k < n; k++) {
          const y = y0 + (gh / n) * (k + 0.5);
          c.moveTo(x0, y); c.lineTo(x0 + gw * (0.5 + glyphRng() * 0.5), y);
        }
      } else if (kind === 1) {                // chevron stack
        const n = 3;
        for (let k = 0; k < n; k++) {
          const y = y0 + (gh / n) * k + gh * 0.08;
          c.moveTo(x0, y + gh * 0.16); c.lineTo(x0 + gw * 0.5, y); c.lineTo(x0 + gw, y + gh * 0.16);
        }
      } else if (kind === 2) {                // eye / ring
        c.arc(x0 + gw * 0.5, y0 + gh * 0.5, Math.min(gw, gh) * 0.34, 0, TAU);
        c.moveTo(x0 + gw * 0.5, y0); c.lineTo(x0 + gw * 0.5, y0 + gh);
      } else if (kind === 3) {                // stepped fret
        let x = x0, y = y0 + gh;
        c.moveTo(x, y);
        for (let k = 0; k < 4; k++) { y -= gh / 4; c.lineTo(x, y); x += gw / 4; c.lineTo(x, y); }
      } else if (kind === 4) {                // lotus fan
        for (let k = -2; k <= 2; k++) {
          c.moveTo(x0 + gw * 0.5, y0 + gh);
          c.lineTo(x0 + gw * 0.5 + k * gw * 0.22, y0 + gh * 0.1);
        }
      } else {                                 // barred lozenge
        c.moveTo(x0 + gw * 0.5, y0);
        c.lineTo(x0 + gw, y0 + gh * 0.5);
        c.lineTo(x0 + gw * 0.5, y0 + gh);
        c.lineTo(x0, y0 + gh * 0.5);
        c.closePath();
      }
      c.stroke();
      // erosion — knock chunks out of the carving
      c.fillStyle = 'rgba(112,124,104,0.55)';
      for (let k = 0; k < 4; k++) {
        c.fillRect(x0 + glyphRng() * gw, y0 + glyphRng() * gh, glyphRng() * 9 + 2, glyphRng() * 9 + 2);
      }
    }
  }
  const glyphTexLong = paintTex(512, 96, drawGlyphs);
  glyphTexLong.repeat.set(11, 1);
  const glyphTexShort = paintTex(512, 96, drawGlyphs);
  glyphTexShort.repeat.set(2, 1);
  const mFriezeLong = new THREE.MeshStandardMaterial({ map: glyphTexLong, roughness: 0.92 });
  const mFriezeShort = new THREE.MeshStandardMaterial({ map: glyphTexShort, roughness: 0.92 });

  // --- caustic network (tiles seamlessly: every stroke drawn 9× wrapped) -----
  const cRng = R.tex.fork('caustic');
  const causticTex = paintTex(256, 256, (c, W, H) => {
    c.fillStyle = '#000000'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const x = cRng() * W, y = cRng() * H;
      const r = cRng.range(7, 30);
      const a0 = cRng() * TAU, a1 = a0 + cRng.range(0.9, 3.2);
      for (let pass = 0; pass < 2; pass++) {
        c.lineWidth = pass === 0 ? cRng.range(6, 11) : cRng.range(1.1, 2.4);
        c.strokeStyle = pass === 0 ? 'rgba(70,180,150,0.10)' : 'rgba(180,255,225,0.55)';
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          c.beginPath();
          c.arc(x + dx * W, y + dy * H, r, a0, a1);
          c.stroke();
        }
      }
    }
    c.globalCompositeOperation = 'source-over';
  });
  const mCaustic = () => new THREE.MeshBasicMaterial({
    map: causticTex.clone(), color: 0x74e0be, blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });

  // --- god-ray gradient ------------------------------------------------------
  const rayTex = ctx.gradient(0xcfe9a8, 0x08120e, 128);
  const mRay = new THREE.MeshBasicMaterial({
    map: rayTex, blending: THREE.AdditiveBlending, transparent: true,
    opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const poolTex = paintTex(128, 128, (c, W, H) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(200,240,180,0.95)');
    g.addColorStop(0.45, 'rgba(120,200,150,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });
  const mPool = new THREE.MeshBasicMaterial({
    map: poolTex, blending: THREE.AdditiveBlending, transparent: true,
    opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });

  // --- drifting mist ---------------------------------------------------------
  const mistRng = R.tex.fork('mist');
  const mistTex = paintTex(256, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) {
      const x = mistRng() * W, y = mistRng() * H, r = mistRng.range(18, 62);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(196,228,216,0.30)');
      g.addColorStop(1, 'rgba(196,228,216,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
  });
  const mMist = new THREE.MeshBasicMaterial({
    map: mistTex, color: 0xa8ccc2, transparent: true, opacity: 0.20,
    depthWrite: false, side: THREE.DoubleSide, fog: true,
  });

  // --- vines, ferns, canopy, moss, debris ------------------------------------
  const vRng = R.tex.fork('vine');
  function drawVines(c, W, H) {
    c.clearRect(0, 0, W, H);
    for (let s = 0; s < 5; s++) {
      const x0 = W * (0.1 + 0.2 * s) + vRng.range(-8, 8);
      const len = H * vRng.range(0.55, 1.0);
      c.strokeStyle = `rgb(${34 + vRng() * 20 | 0},${58 + vRng() * 34 | 0},${30 + vRng() * 18 | 0})`;
      c.lineWidth = vRng.range(2.5, 5);
      c.beginPath(); c.moveTo(x0, 0);
      for (let y = 0; y < len; y += 10) c.lineTo(x0 + Math.sin(y * 0.05 + s) * 7, y);
      c.stroke();
      for (let y = 14; y < len; y += vRng.range(14, 30)) {
        const lx = x0 + Math.sin(y * 0.05 + s) * 7;
        c.fillStyle = `rgba(${40 + vRng() * 40 | 0},${88 + vRng() * 50 | 0},${44 + vRng() * 22 | 0},0.95)`;
        c.beginPath();
        c.ellipse(lx + vRng.range(-9, 9), y, vRng.range(3, 7), vRng.range(6, 12), vRng.range(-1, 1), 0, TAU);
        c.fill();
      }
    }
  }
  const mVine = M.painted(128, 256, drawVines, { transparent: false, alphaTest: 0.42, roughness: 0.92 });

  const fRng = R.tex.fork('fern');
  const mFern = M.painted(96, 96, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let f = 0; f < 7; f++) {
      const a = -Math.PI / 2 + fRng.range(-1.0, 1.0);
      const len = H * fRng.range(0.5, 0.92);
      c.strokeStyle = `rgb(${30 + fRng() * 26 | 0},${76 + fRng() * 50 | 0},${34 + fRng() * 22 | 0})`;
      c.lineWidth = fRng.range(2, 3.6);
      c.beginPath(); c.moveTo(W / 2, H);
      c.quadraticCurveTo(W / 2 + Math.cos(a) * len * 0.5, H + Math.sin(a) * len * 0.6,
        W / 2 + Math.cos(a) * len, H + Math.sin(a) * len);
      c.stroke();
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        const px = W / 2 + Math.cos(a) * len * t, py = H + Math.sin(a) * len * t;
        c.beginPath();
        c.ellipse(px, py, 2.6, 5.2, a + Math.PI / 2, 0, TAU);
        c.fill();
      }
    }
  }, { transparent: false, alphaTest: 0.4, roughness: 0.95 });

  const cnRng = R.tex.fork('canopy');
  const mCanopy = M.painted(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 34; i++) {
      const x = cnRng() * W, y = cnRng() * H, r = cnRng.range(10, 28);
      c.fillStyle = `rgba(${18 + cnRng() * 26 | 0},${48 + cnRng() * 46 | 0},${24 + cnRng() * 20 | 0},1)`;
      c.beginPath();
      c.ellipse(x, y, r, r * cnRng.range(0.5, 0.9), cnRng() * TAU, 0, TAU);
      c.fill();
    }
  }, { transparent: false, alphaTest: 0.45, roughness: 0.95 });

  const msRng = R.tex.fork('moss');
  const mMoss = M.painted(96, 96, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 130; i++) {
      const x = W / 2 + msRng.gauss(0, W * 0.18), y = H / 2 + msRng.gauss(0, H * 0.18);
      const r = msRng.range(3, 13);
      c.fillStyle = `rgba(${34 + msRng() * 30 | 0},${72 + msRng() * 52 | 0},${34 + msRng() * 22 | 0},${msRng.range(0.35, 0.9)})`;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
  }, { transparent: true, alphaTest: 0.06, roughness: 0.95, depthWrite: false });

  const dRng = R.tex.fork('debris');
  const mDebris = M.painted(64, 64, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = `rgba(${70 + dRng() * 60 | 0},${74 + dRng() * 44 | 0},${38 + dRng() * 30 | 0},1)`;
      c.beginPath();
      c.ellipse(dRng() * W, dRng() * H, dRng.range(7, 18), dRng.range(4, 10), dRng() * TAU, 0, TAU);
      c.fill();
    }
  }, { transparent: false, alphaTest: 0.4, roughness: 0.85 });

  const ringTex = paintTex(96, 96, (c, W, H) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(190,240,225,0.9)';
    c.lineWidth = 4; c.beginPath(); c.arc(W / 2, H / 2, W * 0.38, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(150,220,205,0.4)';
    c.lineWidth = 9; c.beginPath(); c.arc(W / 2, H / 2, W * 0.30, 0, TAU); c.stroke();
  });

  // ---------------------------------------------------------------------------
  // §0.2  SHARED HELPERS
  // ---------------------------------------------------------------------------

  const proxies = new THREE.Group();      // invisible collision boxes
  proxies.name = 'collision-proxies';

  /** Invisible collidable box (origin = centre). */
  function solidBox(w, h, d, x, y, z, rotY = 0) {
    const b = P.boxC(w, h, d, mInvis, { shadow: false, receive: false });
    b.visible = false;
    b.castShadow = false; b.receiveShadow = false;
    b.userData.collide = true;
    b.userData.dims = [w, h, d];   // handy when auditing pickup placement
    b.position.set(x, y, z);
    if (rotY) b.rotation.y = rotY;
    proxies.add(b);
    return b;
  }

  /** Invisible collidable horizontal plane. */
  function solidFloor(x0, z0, x1, z1, y) {
    const g = P.ground(x1 - x0, z1 - z0, mInvis, { collide: true });
    g.visible = false;
    g.castShadow = false; g.receiveShadow = false;
    g.userData.collide = true;
    g.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    proxies.add(g);
    return g;
  }

  /** Bake a hand-built group down to one mesh per material. */
  function bake(group, { collide = false, cast = true, receive = true } = {}) {
    const f = P.freeze(group);
    f.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = cast;
      o.receiveShadow = receive;
      o.userData.collide = collide;
    });
    return f;
  }

  /** A masonry arch ring (voussoirs) standing in the XY plane, extruded in Z. */
  function archRing(r, thick, depth, material, segs = 9) {
    const g = new THREE.Group();
    const step = Math.PI / segs;
    const rc = r + thick / 2;
    const chord = 2 * rc * Math.tan(step / 2) * 1.04;
    for (let i = 0; i < segs; i++) {
      const a = step * (i + 0.5);
      const b = P.boxC(chord, thick, depth, material);
      b.position.set(Math.cos(a) * rc, Math.sin(a) * rc, 0);
      b.rotation.z = a + Math.PI / 2;
      g.add(b);
    }
    return g;
  }

  /** Coursed masonry filling the spandrel above an arch, up to `topY`. */
  function spandrel(halfSpan, r, springY, topY, depth, material, slices = 7, ringT = 1.05) {
    const g = new THREE.Group();
    const w = (halfSpan * 2) / slices;
    for (let i = 0; i < slices; i++) {
      const xc = -halfSpan + w * (i + 0.5);
      const inner = Math.max(0, r * r - xc * xc);
      const arch = springY + Math.sqrt(inner) + (inner > 0 ? ringT : 0);
      const y0 = Math.max(springY, arch);
      if (topY - y0 < 0.2) continue;
      const b = P.boxC(w * 1.02, topY - y0, depth, material);
      b.position.set(xc, (y0 + topY) / 2, 0);
      g.add(b);
    }
    return g;
  }

  /** Chain of tapered cylinders — jungle roots crawling over stone. */
  function rootChain(g, x, y, z, dirX, dirY, dirZ, segs, r0, segLen, rr, material) {
    let px = x, py = y, pz = z;
    let dx = dirX, dy = dirY, dz = dirZ;
    let r = r0;
    for (let i = 0; i < segs; i++) {
      const len = segLen * rr.range(0.8, 1.2);
      const nr = r * rr.range(0.76, 0.9);
      const c = P.cyl(nr, r, len, material, { seg: 6, shadow: true });
      const nx = px + dx * len, ny = py + dy * len, nz = pz + dz * len;
      c.position.set(px, py, pz);
      const dirLen = Math.hypot(dx, dy, dz) || 1;
      c.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx / dirLen, dy / dirLen, dz / dirLen));
      g.add(c);
      px = nx; py = ny; pz = nz; r = nr;
      dx += rr.range(-0.28, 0.28); dy += rr.range(-0.22, 0.16); dz += rr.range(-0.28, 0.28);
      const l2 = Math.hypot(dx, dy, dz) || 1;
      dx /= l2; dy /= l2; dz /= l2;
    }
  }

  /** Tiled ground patch — many small planes so texture scale stays constant. */
  function tiledFloor(x0, z0, x1, z1, y, material, cell = 12) {
    const g = new THREE.Group();
    const nx = Math.max(1, Math.round((x1 - x0) / cell));
    const nz = Math.max(1, Math.round((z1 - z0) / cell));
    const cw = (x1 - x0) / nx, cd = (z1 - z0) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const p = P.ground(cw, cd, material, { collide: false });
      p.position.set(x0 + cw * (i + 0.5), y, z0 + cd * (j + 0.5));
      g.add(p);
    }
    return g;
  }

  /** Coping / kerb stones along the lip of a basin. */
  function coping(g, x0, z0, x1, z1, rr) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.4));
    const ang = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const b = P.boxC((len / n) * 1.02, 0.62 + rr.range(-0.07, 0.07), 1.15,
        rr.chance(0.3) ? mStoneWet : mStone);
      b.position.set(x0 + (x1 - x0) * t, -0.16 + rr.range(-0.05, 0.05), z0 + (z1 - z0) * t);
      b.rotation.y = -ang + rr.range(-0.025, 0.025);
      g.add(b);
    }
  }

  const inRect = (x, z, r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const inWater = (x, z) => inRect(x, z, CANAL) || inRect(x, z, GAL);
  const nearSpawn = (x, z) => Math.hypot(x - meta.spawn[0], z - meta.spawn[2]) < 7;

  // ---------------------------------------------------------------------------
  // §1  ATMOSPHERE + LIGHTING
  // ---------------------------------------------------------------------------

  ctx.sky({ top: 0x16302a, bottom: 0x8ec6b0, radius: 480 });
  ctx.fog(0x6f8f88, 25, 160);
  ctx.useEnvironment(0.85);
  ctx.grade({
    exposure: 1.05, saturation: 1.2, contrast: 1.06,
    lift: [-0.012, 0.014, 0.008], gain: [0.96, 1.04, 1.01],
    vignette: 0.95, grain: 0.045, aberration: 0.0014,
    bloom: 0.55, bloomRadius: 0.9, bloomThreshold: 0.7, scanline: 0,
  });
  ctx.soundscape('forest', 'calm', { size: 0.85, dark: 0.35, wet: 0.32 });
  ctx.setSurface((x, z) => (inWater(x, z) ? 'water' : 'concrete'));

  ctx.light(new THREE.HemisphereLight(0x9fd8c8, 0x25301f, 0.8));
  ctx.light(new THREE.AmbientLight(0x1d2f2b, 0.55));

  const sun = new THREE.DirectionalLight(0xfff1cd, 2.5);
  sun.position.set(72, 150, -44);
  sun.target.position.set(-6, 0, 6);
  ctx.light(sun, { shadow: true, range: 95, far: 420, normalBias: 0.05 });

  // teal bounce out of the flooded gallery
  const gl1 = new THREE.PointLight(0x2ed3ae, 9, 46, 2.0); gl1.position.set(-58, 2.6, 8); ctx.light(gl1);
  const gl2 = new THREE.PointLight(0x2ed3ae, 8, 44, 2.0); gl2.position.set(-52, 2.6, 42); ctx.light(gl2);
  const cl1 = new THREE.PointLight(0x38c8b4, 7, 40, 2.0); cl1.position.set(-4, 2.2, -23); ctx.light(cl1);
  const tl1 = new THREE.PointLight(0xcfe6a0, 5, 30, 2.0); tl1.position.set(TX, 13.4, TZ); ctx.light(tl1);

  // the shaft through the temple oculus, landing on the altar
  const oculus = new THREE.SpotLight(0xe4f0b4, 150, 44, 0.105, 0.35, 1.4);
  oculus.position.set(TX + 1.2, 22, TZ - 1.0);
  oculus.target.position.set(TX, 0.9, TZ);
  ctx.light(oculus, { shadow: true, far: 36 });

  // daylight falling through the cistern grate — the bars make the grid
  const grateLight = new THREE.SpotLight(0xcfe8c0, 90, 40, 0.185, 0.28, 1.3);
  grateLight.position.set(GRATE.x + 1.6, 14, GRATE.z - 1.2);
  grateLight.target.position.set(GRATE.x, CWY, GRATE.z);
  ctx.light(grateLight, { shadow: true, far: 34 });

  // ---------------------------------------------------------------------------
  // §2  TERRAIN — basins, dry floors, coping, cliffs, boundary
  // ---------------------------------------------------------------------------

  const terrain = new THREE.Group();

  // basin floors (the wadeable bottom, 0.4 m below the dry stone)
  terrain.add(tiledFloor(CANAL.x0, CANAL.z0, CANAL.x1, CANAL.z1, BY, mBed, 14));
  terrain.add(tiledFloor(GAL.x0, GAL.z0, GAL.x1, GAL.z1, BY, mBed, 14));
  solidFloor(CANAL.x0, CANAL.z0, CANAL.x1, CANAL.z1, BY);
  solidFloor(GAL.x0, GAL.z0, GAL.x1, GAL.z1, BY);

  // dry ground patches — carefully split so the cistern stair and grate stay open
  const PATCH = [
    [-HX, -52, 19, -30, mPave],
    [30, -52, HX, -30, mPave],
    [19, -52, 30, -30, mPave],
    [-HX, -HZ, -8.5, -52, mSoil],
    [-3.5, -HZ, 19, -52, mSoil],
    [-8.5, -HZ, -3.5, -72.5, mSoil],
    [-8.5, -67.5, -3.5, -52, mSoil],
    [30, -HZ, HX, -52, mSoil],
    [19, -HZ, 30, -65, mSoil],
    [19, -55, 30, -52, mSoil],
    [-HX, 58, HX, HZ, mSoil],
    [-HX, -16, -90, 58, mSoil],
    [-24, -16, 66, 58, mPave],
    [66, -16, HX, 58, mSoil],
  ];
  for (const [x0, z0, x1, z1, m] of PATCH) terrain.add(tiledFloor(x0, z0, x1, z1, GY, m, 12));

  // matching invisible colliders (grate stays solid — it has bars over it)
  solidFloor(-HX, -HZ, 19, -30, GY);
  solidFloor(30, -HZ, HX, -30, GY);
  solidFloor(19, -HZ, 30, -65, GY);
  solidFloor(19, -55, 30, -30, GY);
  solidFloor(-HX, 58, HX, HZ, GY);
  solidFloor(-HX, -16, -90, 58, GY);
  solidFloor(-24, -16, HX, 58, GY);

  // coping around every waterline
  const cop = new THREE.Group();
  coping(cop, -HX, CANAL.z0, HX, CANAL.z0, R.stone);
  coping(cop, -HX, CANAL.z1, -90, CANAL.z1, R.stone);
  coping(cop, -24, CANAL.z1, HX, CANAL.z1, R.stone);
  coping(cop, GAL.x0, GAL.z0, GAL.x0, GAL.z1, R.stone);
  coping(cop, GAL.x1, GAL.z0, GAL.x1, GAL.z1, R.stone);
  coping(cop, GAL.x0, GAL.z1, GAL.x1, GAL.z1, R.stone);
  terrain.add(cop);

  // cliffs — a broken ring of rock slabs sealing the valley
  const cliffs = new THREE.Group();
  for (let i = 0; i < 92; i++) {
    const t = i / 92;
    const side = Math.floor(t * 4);
    let x, z, rot;
    const u = (t * 4) % 1;
    if (side === 0) { x = -HX + u * 2 * HX; z = -HZ - R.jun.range(1, 7); rot = 0; }
    else if (side === 1) { x = HX + R.jun.range(1, 7); z = -HZ + u * 2 * HZ; rot = Math.PI / 2; }
    else if (side === 2) { x = HX - u * 2 * HX; z = HZ + R.jun.range(1, 7); rot = 0; }
    else { x = -HX - R.jun.range(1, 7); z = HZ - u * 2 * HZ; rot = Math.PI / 2; }
    const h = R.jun.range(16, 32);
    const b = P.boxC(R.jun.range(10, 20), h, R.jun.range(8, 16), mCliff);
    b.position.set(x, h / 2 - 2 + R.jun.range(-2, 2), z);
    b.rotation.set(R.jun.range(-0.09, 0.09), rot + R.jun.range(-0.3, 0.3), R.jun.range(-0.09, 0.09));
    cliffs.add(b);
  }
  terrain.add(cliffs);

  ctx.addDecor(bake(terrain));

  // hard boundary — nothing gets out, at any altitude
  solidBox(2, 70, HZ * 2 + 20, -HX - 1, 24, 0);
  solidBox(2, 70, HZ * 2 + 20, HX + 1, 24, 0);
  solidBox(HX * 2 + 20, 70, 2, 0, 24, -HZ - 1);
  solidBox(HX * 2 + 20, 70, 2, 0, 24, HZ + 1);

  // ---------------------------------------------------------------------------
  // §3  THE GREAT AQUEDUCT — the silhouette landmark, 27 m of tiered arcade
  // ---------------------------------------------------------------------------

  const aq = new THREE.Group();
  const pierX = (k) => AQ_X0 + k * AQ_SPAN;
  const gapped = (x) => x > GAP_X0 - 1 && x < GAP_X1 + 1;

  for (let k = 0; k < AQ_PIERS; k++) {
    const x = pierX(k);
    const jig = R.aq.range(-0.06, 0.06);

    // --- tier 0 pier: batter it slightly, break it into courses --------------
    for (let c = 0; c < 7; c++) {
      const y0 = BY + c * ((T0_TOP - BY) / 7);
      const hgt = (T0_TOP - BY) / 7;
      const w = 5.4 - c * 0.06;
      const b = P.boxC(w, hgt * 1.01, 6.6 - c * 0.05, c < 2 ? mStoneWet : mStone);
      b.position.set(x + jig * c * 0.3, y0 + hgt / 2, AQ_Z);
      aq.add(b);
    }
    solidBox(5.6, T0_TOP - BY + 0.4, 6.8, x, (BY + T0_TOP) / 2, AQ_Z);

    // cutwater noses on the upstream face
    const nose = P.boxC(1.6, 6.2, 1.6, mStoneWet);
    nose.position.set(x, BY + 3.1, AQ_Z - 3.9);
    nose.rotation.y = Math.PI / 4;
    aq.add(nose);

    // glyph frieze band around each pier head
    for (const sz of [-1, 1]) {
      const band = P.boxC(5.0, 0.9, 0.12, mFriezeShort);
      band.position.set(x, 9.9, AQ_Z + sz * 3.36);
      band.rotation.y = sz > 0 ? 0 : Math.PI;
      aq.add(band);
    }

    // --- tier 1 pier ---------------------------------------------------------
    if (!gapped(x)) {
      const p1 = P.boxC(4.2, T1_TOP - T0_CORN, 5.6, mStone);
      p1.position.set(x, (T0_CORN + T1_TOP) / 2, AQ_Z);
      aq.add(p1);
      solidBox(4.4, T1_TOP - T0_CORN, 5.8, x, (T0_CORN + T1_TOP) / 2, AQ_Z);
    }

    if (k >= AQ_PIERS - 1) continue;

    const mid = x + AQ_SPAN / 2;
    const broken = mid > GAP_X0 && mid < GAP_X1;

    // --- tier 0 arch ---------------------------------------------------------
    // springing chosen so the extrados lands exactly on the tier top
    const a0 = archRing(5.5, 1.1, 6.4, mStone, 11);
    a0.position.set(mid, T0_TOP - 6.6, AQ_Z);
    if (broken) {
      // the crown has fallen — only the springing stones are left clinging on
      a0.children.slice(2, 9).slice().forEach(c => a0.remove(c));
    }
    aq.add(a0);

    if (broken) continue;   // no spandrel, no cornice: a clean 16 m breach

    // --- tier 0 cornice + spandrel -------------------------------------------
    const sp0 = spandrel(AQ_SPAN / 2, 5.5, T0_TOP - 6.6, T0_TOP, 6.4, mStone, 7, 1.1);
    sp0.position.set(mid, 0, AQ_Z);
    aq.add(sp0);
    const corn = P.boxC(AQ_SPAN + 1.2, 0.6, 7.2, mStone);
    corn.position.set(mid, T0_TOP + 0.3, AQ_Z);
    aq.add(corn);

    // --- tier 1 arch + spandrel ---------------------------------------------
    const a1 = archRing(5.5, 0.9, 5.4, mStone, 11);
    a1.position.set(mid, T1_TOP - 6.4, AQ_Z);
    aq.add(a1);
    const s1 = spandrel(AQ_SPAN / 2, 5.5, T1_TOP - 6.4, T1_TOP, 5.4, mStone, 7, 0.9);
    s1.position.set(mid, 0, AQ_Z);
    aq.add(s1);
    const c1 = P.boxC(AQ_SPAN + 1.0, 0.5, 6.2, mStone);
    c1.position.set(mid, T1_TOP + 0.25, AQ_Z);
    aq.add(c1);
  }

  // --- tier 2: the little arcade carrying the channel ------------------------
  for (let x = AQ_X0; x <= 96.01; x += 4) {
    if (x > GAP_X0 - 2 && x < GAP_X1 + 2) continue;
    const p = P.boxC(1.5, T2_TOP - T1_CORN, 4.6, mStone);
    p.position.set(x, (T1_CORN + T2_TOP) / 2, AQ_Z + R.aq.range(-0.05, 0.05));
    aq.add(p);
    if (x >= 96) continue;
    const mid = x + 2;
    if (mid > GAP_X0 - 2 && mid < GAP_X1 + 2) continue;
    const a = archRing(1.25, 0.55, 4.5, mStone, 7);
    a.position.set(mid, 22.9, AQ_Z);
    aq.add(a);
    const s = spandrel(2, 1.25, 22.9, T2_TOP, 4.5, mStone, 3, 0.55);
    s.position.set(mid, 0, AQ_Z);
    aq.add(s);
  }

  // --- deck slab, channel bed and parapets -----------------------------------
  for (let x = AQ_X0 - 8; x < 100; x += 8) {
    if (x + 4 > GAP_X0 && x + 4 < GAP_X1) continue;
    const slab = P.boxC(8.05, 0.4, 5.8, mStone);
    slab.position.set(x + 4, DECK_Y - 0.2, AQ_Z);
    aq.add(slab);
    solidBox(8.1, 0.5, 5.9, x + 4, DECK_Y - 0.25, AQ_Z);
    for (const sz of [-1, 1]) {
      // the two climbing routes arrive through the north balustrade
      if (sz < 0 && (Math.abs(x + 4 + 68) < 1 || Math.abs(x + 4 - 36) < 1)) continue;
      // leave gaps in the balustrade — no straight lines anywhere
      const missing = R.aq.chance(0.1);
      const h = missing ? 0.28 : 1.1 + R.aq.range(-0.06, 0.06);
      const par = P.boxC(8.05, h, 0.62, R.aq.chance(0.25) ? mStoneWet : mStone);
      par.position.set(x + 4, DECK_Y + h / 2, AQ_Z + sz * 2.6);
      par.rotation.z = R.aq.range(-0.008, 0.008);
      aq.add(par);
      if (!missing) solidBox(8.1, 1.15, 0.7, x + 4, DECK_Y + 0.57, AQ_Z + sz * 2.6);
    }
    // drip mouldings under the deck
    for (const sz of [-1, 1]) {
      const dm = P.boxC(8.05, 0.22, 0.3, mStoneWet);
      dm.position.set(x + 4, DECK_Y - 0.5, AQ_Z + sz * 3.0);
      aq.add(dm);
    }
  }

  // the fallen slab bridging the collapsed span — a nerve-test crossing
  const plank = P.boxC(14.4, 0.55, 1.35, mStone);
  plank.position.set((GAP_X0 + GAP_X1) / 2, DECK_Y - 0.28, AQ_Z + 0.35);
  plank.rotation.set(0.014, 0.02, -0.006);
  aq.add(plank);
  solidBox(14.4, 0.6, 1.45, (GAP_X0 + GAP_X1) / 2, DECK_Y - 0.3, AQ_Z + 0.35, 0.02);

  // rubble in the water below the collapse
  const collapse = new THREE.Group();
  for (let i = 0; i < 46; i++) {
    const s = R.aq.range(0.7, 2.6);
    const b = P.boxC(s * R.aq.range(0.8, 2.2), s * R.aq.range(0.5, 1.0), s * R.aq.range(0.8, 1.6),
      R.aq.chance(0.4) ? mRubble : mStoneWet);
    b.position.set(
      (GAP_X0 + GAP_X1) / 2 + R.aq.gauss(0, 5.5),
      BY + s * 0.3 + R.aq.range(0, 1.4),
      AQ_Z + R.aq.gauss(0, 3.6));
    b.rotation.set(R.aq() * 3, R.aq() * 3, R.aq() * 3);
    collapse.add(b);
  }
  for (let i = 0; i < 7; i++) {                   // fallen voussoirs, still curved
    const seg = archRing(5.5, 1.1, 2.2, mStoneWet, 5);
    seg.position.set(GAP_X0 + R.aq.range(-3, 12), BY + R.aq.range(0.2, 1.2), AQ_Z + R.aq.gauss(0, 4));
    seg.rotation.set(R.aq.range(-2.2, -1.0), R.aq() * 3, R.aq() * 3);
    seg.scale.setScalar(R.aq.range(0.5, 0.9));
    collapse.add(seg);
  }
  aq.add(collapse);
  solidBox(9, 2.4, 7, 24, BY + 1.0, AQ_Z);        // scramble-proof the rubble core

  ctx.addDecor(bake(aq));

  // ---------------------------------------------------------------------------
  // §4  CLIMBING ROUTES — the vine stair tower (west) and the ruined grand
  //     stair riding up the flank of the collapsed span (east)
  // ---------------------------------------------------------------------------

  /**
   * A run of steps baked into ONE collidable mesh: real per-step collision,
   * a single draw call. dir: +1 climbs +X, -1 climbs -X.
   */
  /**
   * `fill` closes the void under the steps so a flight never floats:
   *   { to: y }     solid masonry all the way down to y
   *   { under: d }  a raking soffit slab d metres thick
   */
  function fillUnder(g, cx, cy, cz, w, d, y0, fill, material) {
    if (!fill) return;
    const base = fill.to !== undefined ? fill.to : cy - fill.under;
    if (cy - base < 0.05) return;
    const b = P.boxC(w, cy - base, d, material);
    b.position.set(cx, (base + cy) / 2, cz);
    g.add(b);
  }

  // Treads bake into ONE collidable mesh (real per-step collision, one draw
  // call); the supporting mass bakes separately as pure decor so it never
  // enters the collision octree.
  function flightX(x0, y0, z, dir, steps, width, rise, run, material, fill) {
    const g = new THREE.Group(), sup = new THREE.Group();
    for (let i = 0; i < steps; i++) {
      const cx = x0 + dir * (run * (i + 0.5));
      const s = P.boxC(run * 1.02, rise, width, material);
      s.position.set(cx, y0 + rise * (i + 0.5), z);
      g.add(s);
      fillUnder(sup, cx, y0 + rise * i, z, run * 1.02, width * 0.98, y0, fill, material);
    }
    ctx.add(bake(g, { collide: true }));
    if (sup.children.length) ctx.addDecor(bake(sup));
    return { endX: x0 + dir * run * steps, endY: y0 + rise * steps };
  }

  function flightZ(x, y0, z0, dir, steps, width, rise, run, material, fill) {
    const g = new THREE.Group(), sup = new THREE.Group();
    for (let i = 0; i < steps; i++) {
      const cz = z0 + dir * (run * (i + 0.5));
      const s = P.boxC(width, rise, run * 1.02, material);
      s.position.set(x, y0 + rise * (i + 0.5), cz);
      g.add(s);
      fillUnder(sup, x, y0 + rise * i, cz, width * 0.98, run * 1.02, y0, fill, material);
    }
    ctx.add(bake(g, { collide: true }));
    if (sup.children.length) ctx.addDecor(bake(sup));
    return { endZ: z0 + dir * run * steps, endY: y0 + rise * steps };
  }

  /** Landing slab: visible stone + collider. */
  function landing(x0, z0, x1, z1, y, material = mStone) {
    const b = P.boxC(x1 - x0, 0.5, z1 - z0, material);
    b.position.set((x0 + x1) / 2, y - 0.25, (z0 + z1) / 2);
    ctx.addDecor(b);
    solidBox(x1 - x0, 0.55, z1 - z0, (x0 + x1) / 2, y - 0.27, (z0 + z1) / 2);
    return b;
  }

  // --- 4a. THE VINE STAIR TOWER (x ≈ -65) ------------------------------------
  const towerShell = new THREE.Group();
  // three walls, arched window slots, open toward the aqueduct
  for (const wall of [
    { x: -74.6, z: -35.5, w: 0.9, d: 13.5, rot: 0 },
    { x: -65.5, z: -42.1, w: 18.5, d: 0.9, rot: 0 },
    { x: -56.4, z: -35.5, w: 0.9, d: 13.5, rot: 0 },
  ]) {
    for (let c = 0; c < 9; c++) {
      const y0 = BY + c * 3.0;
      const b = P.boxC(wall.w, 3.0, wall.d, c < 2 ? mStoneWet : mStone);
      b.position.set(wall.x + R.aq.range(-0.05, 0.05), y0 + 1.5, wall.z);
      b.rotation.y = wall.rot + R.aq.range(-0.006, 0.006);
      towerShell.add(b);
    }
    solidBox(wall.w + 0.2, 28, wall.d + 0.2, wall.x, 13.5, wall.z);
  }
  ctx.addDecor(bake(towerShell));

  let fl;
  const SOFFIT = { under: 0.9 };
  fl = flightX(-74.0, BY, -39.0, +1, 22, 5.0, 0.30, 0.50, mStone, { to: BY });  // -> 6.2
  landing(-63.5, -41.6, -57.0, -30.0, fl.endY);
  fl = flightX(-57.6, fl.endY, -32.0, -1, 22, 5.0, 0.30, 0.50, mStone, SOFFIT); // -> 12.8
  landing(-74.2, -41.6, -68.0, -29.4, fl.endY);
  fl = flightX(-74.0, fl.endY, -39.0, +1, 22, 5.0, 0.30, 0.50, mStone, SOFFIT); // -> 19.4
  landing(-63.5, -41.6, -57.0, -30.0, fl.endY);
  fl = flightX(-57.6, fl.endY, -32.0, -1, 22, 5.0, 0.30, 0.50, mStone, SOFFIT); // -> 26.0
  // bridge from the top flight across to the channel deck (the parapet is
  // notched at x = -68 in §3 so this actually lands on the walkway)
  landing(-70.6, -33.4, -65.4, -25.0, DECK_Y);

  // --- 4b. THE RUINED GRAND STAIR (collapsed section, x 36..76) --------------
  fl = flightX(76.0, BY, -29.6, -1, 88, 6.0, 0.30, 0.455, mStoneWet, { under: 2.8 });
  landing(32.6, -31.0, 39.0, -24.8, DECK_Y);
  // squat piers holding the raking stair off the ground
  const stairPiers = new THREE.Group();
  for (let i = 1; i < 8; i++) {
    const px = 76 - i * 5.0;
    const top = BY + (76 - px) / 0.455 * 0.30 - 2.8;
    if (top <= BY + 0.4) continue;
    const b = P.boxC(2.6, top - BY, 5.2, mStoneWet);
    b.position.set(px, (BY + top) / 2, -29.6);
    b.rotation.y = R.aq.range(-0.02, 0.02);
    stairPiers.add(b);
    solidBox(2.7, top - BY, 5.3, px, (BY + top) / 2, -29.6);
  }
  ctx.addDecor(bake(stairPiers));
  // cheek walls, cracked and gap-toothed
  const cheeks = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const x = 76 - t * 40.0;
    const yTop = BY + t * 26.4 + 1.0;
    for (const sz of [-1, 1]) {
      if (R.aq.chance(0.16)) continue;
      const b = P.boxC(1.02, 1.1 + R.aq.range(-0.2, 0.4), 0.7, R.aq.chance(0.3) ? mStone : mStoneWet);
      b.position.set(x, yTop - 0.55, -29.6 + sz * 3.3);
      b.rotation.z = R.aq.range(-0.03, 0.03);
      cheeks.add(b);
    }
  }
  ctx.addDecor(bake(cheeks));

  // ---------------------------------------------------------------------------
  // §5  THE FLOODED GALLERY — a drowned hypostyle hall, half its roof gone
  // ---------------------------------------------------------------------------

  const gal = new THREE.Group();
  const GAL_TOP = 9.0, GAL_ROOF = 10.2;
  const colXs = [-84, -73, -62, -51, -40, -29];
  const colZs = [-10, 1, 12, 23, 34, 45, 56];
  const openings = [];        // roof holes → god rays + caustic hotspots

  // perimeter walls, with an arcade of openings onto the canal and the plaza
  for (const side of ['w', 'e', 's', 'n']) {
    const horiz = side === 's' || side === 'n';
    const len = horiz ? GAL.x1 - GAL.x0 : GAL.z1 - GAL.z0;
    const n = Math.round(len / 5.5);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = horiz ? GAL.x0 + len * t : (side === 'w' ? GAL.x0 - 0.7 : GAL.x1 + 0.7);
      const z = horiz ? (side === 'n' ? GAL.z0 - 0.7 : GAL.z1 + 0.7) : GAL.z0 + len * t;
      // north wall faces the canal: leave it as an open arcade at water level
      const pierOnly = side === 'n' || (side === 'e' && i % 3 === 1);
      const hgt = pierOnly ? GAL_TOP : GAL_TOP;
      const w = horiz ? (pierOnly ? 1.8 : 5.5 * 1.02) : 1.4;
      const d = horiz ? 1.4 : (pierOnly ? 1.8 : 5.5 * 1.02);
      for (let c = 0; c < 5; c++) {
        const ch = hgt / 5;
        const b = P.boxC(w, ch * 1.01, d, c < 1 ? mStoneWet : mColumn);
        b.position.set(x + R.gal.range(-0.05, 0.05), BY + ch * (c + 0.5), z + R.gal.range(-0.05, 0.05));
        gal.add(b);
      }
      if (pierOnly) {
        // lintel over the opening
        const l = P.boxC(horiz ? 5.6 : 1.4, 1.1, horiz ? 1.4 : 5.6, mColumn);
        l.position.set(x, BY + GAL_TOP + 0.55, z);
        gal.add(l);
      }
      solidBox(w + 0.2, GAL_TOP + 1.8, d + 0.2, x, BY + (GAL_TOP + 1.8) / 2, z);
    }
  }

  // carved columns — tilted, cracked, eight of them collapsed outright
  const standing = [];
  for (const cx of colXs) for (const cz of colZs) {
    const roll = R.gal();
    if (roll < 0.16) {
      // a fallen column lying in the water: a bridge, and a place to crouch
      const drum = P.cyl(0.92, 0.98, R.gal.range(6, 9.4), mColumn, { seg: 10 });
      drum.position.set(cx + R.gal.gauss(0, 1.4), BY + 0.95, cz + R.gal.gauss(0, 1.4));
      drum.rotation.set(Math.PI / 2 + R.gal.range(-0.06, 0.06), R.gal() * TAU, 0);
      gal.add(drum);
      const stump = P.cyl(0.95, 1.02, R.gal.range(1.1, 2.6), mStoneWet, { seg: 12 });
      stump.position.set(cx, BY, cz);
      gal.add(stump);
      const rub = P.rubble(2.4, 12, mRubble, Math.floor(R.gal() * 1e6));
      rub.position.set(cx + 1.2, BY, cz - 1.1);
      gal.add(rub);
      continue;
    }
    const col = P.column(GAL_TOP + 0.4, 0.95, mColumn, { seg: 12 });
    col.position.set(cx, BY, cz);
    col.rotation.z = R.gal.gauss(0, 0.016);
    col.rotation.x = R.gal.gauss(0, 0.016);
    gal.add(col);
    // carved collar just above the waterline
    const collar = P.cyl(1.12, 1.12, 0.85, mFriezeShort, { seg: 14 });
    collar.position.set(cx, BY + 1.5, cz);
    gal.add(collar);
    standing.push([cx, cz]);
    solidBox(1.95, GAL_TOP + 0.6, 1.95, cx, BY + (GAL_TOP + 0.6) / 2, cz);
  }

  // architraves between column heads, then a partly-fallen roof
  for (let i = 0; i < colXs.length; i++) for (let j = 0; j < colZs.length; j++) {
    if (i < colXs.length - 1) {
      const b = P.boxC(11.2, 1.0, 1.5, mColumn);
      b.position.set(colXs[i] + 5.5, BY + GAL_TOP + 0.5, colZs[j]);
      if (R.gal.chance(0.82)) gal.add(b);
    }
    if (j < colZs.length - 1) {
      const b = P.boxC(1.5, 1.0, 11.2, mColumn);
      b.position.set(colXs[i], BY + GAL_TOP + 0.5, colZs[j] + 5.5);
      if (R.gal.chance(0.82)) gal.add(b);
    }
  }
  for (let i = 0; i < colXs.length - 1; i++) for (let j = 0; j < colZs.length - 1; j++) {
    const cx = colXs[i] + 5.5, cz = colZs[j] + 5.5;
    const intact = ctx.noise.fbm(cx * 0.06, cz * 0.06, 3) > -0.1;
    if (intact) {
      const slab = P.boxC(11.4, 0.7, 11.4, mColumn);
      slab.position.set(cx, BY + GAL_ROOF, cz);
      gal.add(slab);
      // coffered underside
      for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) {
        const cof = P.boxC(2.6, 0.16, 2.6, mTempleDk);
        cof.position.set(cx + a * 3.4, BY + GAL_ROOF - 0.42, cz + b2 * 3.4);
        gal.add(cof);
      }
    } else {
      openings.push([cx + R.gal.gauss(0, 1.2), cz + R.gal.gauss(0, 1.2), R.gal.range(2.6, 4.6)]);
      // ragged broken edge around the hole
      for (let e = 0; e < 6; e++) {
        const b = P.boxC(R.gal.range(1.4, 3.6), 0.65, R.gal.range(1.4, 3.4), mRubble);
        const a = R.gal() * TAU;
        b.position.set(cx + Math.cos(a) * 5.1, BY + GAL_ROOF + R.gal.range(-0.2, 0.1), cz + Math.sin(a) * 5.1);
        b.rotation.y = R.gal() * TAU;
        gal.add(b);
      }
      // rubble mound where the roof landed in the water
      const rub = P.rubble(3.4, 16, mRubble, Math.floor(R.gal() * 1e6));
      rub.position.set(cx + R.gal.gauss(0, 2), BY, cz + R.gal.gauss(0, 2));
      gal.add(rub);
    }
  }

  // shallow altar-steps at the far (south) end so the hall has a focus
  for (let s = 0; s < 3; s++) {
    const b = P.boxC(24 - s * 4, 0.45, 3.2 - s * 0.6, mTemple);
    b.position.set(-57, BY + 0.225 + s * 0.45, 52 - s * 1.4);
    gal.add(b);
    solidBox(24 - s * 4, 0.5, 3.2 - s * 0.6, -57, BY + 0.225 + s * 0.45, 52 - s * 1.4);
  }
  const galIdol = P.boxC(3.2, 4.4, 1.8, mTempleDk);
  galIdol.position.set(-57, BY + 3.55, 51.2);
  gal.add(galIdol);
  const idolFrieze = P.boxC(3.24, 3.0, 0.1, mFriezeShort);
  idolFrieze.position.set(-57, BY + 3.4, 50.25);
  gal.add(idolFrieze);
  solidBox(3.4, 4.6, 2.0, -57, BY + 3.6, 51.2);

  ctx.addDecor(bake(gal));

  // ---------------------------------------------------------------------------
  // §6  THE TEMPLE — stepped ziggurat, light chimney, dark inner chamber
  // ---------------------------------------------------------------------------

  const tmp = new THREE.Group();
  const torches = [];

  /** One course of a hollow square ring, centred on the temple. */
  function ringCourse(g, y0, h, outer, inner, material, jitter = 0.05) {
    const j = () => R.tmp.range(-jitter, jitter);
    const add = (w, d, ox, oz) => {
      const b = P.boxC(w, h * 1.01, d, material);
      b.position.set(TX + ox + j(), y0 + h / 2, TZ + oz + j());
      g.add(b);
    };
    const t = outer - inner;
    add(outer * 2, t, 0, -(inner + t / 2));         // north
    add(outer * 2, t, 0, +(inner + t / 2));         // south
    add(t, inner * 2, -(inner + t / 2), 0);         // west
    add(t, inner * 2, +(inner + t / 2), 0);         // east
  }

  for (let ti = 0; ti < 5; ti++) {
    const y0 = TIER_H[ti], y1 = TIER_H[ti + 1];
    const outer = TIER_R[ti];
    const inner = ti < 2 ? CH_R : OC_R;
    const courses = 3;
    for (let c = 0; c < courses; c++) {
      const h = (y1 - y0) / courses;
      const shrink = c * 0.09;
      const mm = (ti === 0 && c === 0) ? mStoneWet : (ti % 2 ? mTempleDk : mTemple);
      if (ti === 0) {
        // the whole ground tier is split around the entry passage
        const t = outer - inner;
        const nb = P.boxC(outer * 2, h * 1.01, t, mm);
        nb.position.set(TX, y0 + h / 2, TZ - (inner + t / 2)); tmp.add(nb);
        for (const sx of [-1, 1]) {
          const w = outer - 1.7;
          const b = P.boxC(w, h * 1.01, t, mm);
          b.position.set(TX + sx * (1.7 + w / 2), y0 + h / 2, TZ + inner + t / 2);
          tmp.add(b);
        }
        for (const sx of [-1, 1]) {
          const b = P.boxC(t, h * 1.01, inner * 2, mm);
          b.position.set(TX + sx * (inner + t / 2), y0 + h / 2, TZ);
          tmp.add(b);
        }
      } else {
        ringCourse(tmp, y0, h, outer - shrink, inner, mm);
      }
    }
    // cornice lip between tiers — a RING, never a slab: the core stays hollow
    ringCourse(tmp, y1 - 0.28, 0.28, outer + 0.5, inner, mTempleDk, 0);
    // glyph band around every second tier
    if (ti % 2 === 0) {
      for (const [w, d, ox, oz] of [
        [outer * 2, 0.14, 0, -(outer + 0.06)],
        [outer * 2, 0.14, 0, +(outer + 0.06)],
        [0.14, outer * 2, -(outer + 0.06), 0],
        [0.14, outer * 2, +(outer + 0.06), 0],
      ]) {
        const band = P.boxC(w, 0.95, d, mFriezeLong);
        band.position.set(TX + ox, y1 - 0.75, TZ + oz);
        tmp.add(band);
      }
    }
    // tier colliders
    const t = outer - inner;
    if (ti === 0) {
      solidBox(outer * 2, y1 - y0, t, TX, (y0 + y1) / 2, TZ - (inner + t / 2));
      for (const sx of [-1, 1]) {
        const w = outer - 1.7;
        solidBox(w, y1 - y0, t, TX + sx * (1.7 + w / 2), (y0 + y1) / 2, TZ + inner + t / 2);
      }
    } else {
      solidBox(outer * 2, y1 - y0, t, TX, (y0 + y1) / 2, TZ - (inner + t / 2));
      solidBox(outer * 2, y1 - y0, t, TX, (y0 + y1) / 2, TZ + inner + t / 2);
    }
    solidBox(t, y1 - y0, inner * 2, TX - (inner + t / 2), (y0 + y1) / 2, TZ);
    solidBox(t, y1 - y0, inner * 2, TX + (inner + t / 2), (y0 + y1) / 2, TZ);
    // stepped terrace floor of each tier. Tiers 0–1 are ring-only so the
    // chamber void underneath stays genuinely open.
    if (ti < 2) {
      solidFloor(TX - outer, TZ - outer, TX + outer, TZ - inner, y1);
      solidFloor(TX - outer, TZ + inner, TX + outer, TZ + outer, y1);
      solidFloor(TX - outer, TZ - inner, TX - inner, TZ + inner, y1);
      solidFloor(TX + inner, TZ - inner, TX + outer, TZ + inner, y1);
    } else {
      solidFloor(TX - outer, TZ - outer, TX + outer, TZ + outer, y1);
    }
  }

  // --- chamber ceiling with the oculus ---------------------------------------
  for (const [w, d, ox, oz] of [
    [CH_R * 2, CH_R - OC_R, 0, -(OC_R + (CH_R - OC_R) / 2)],
    [CH_R * 2, CH_R - OC_R, 0, +(OC_R + (CH_R - OC_R) / 2)],
    [CH_R - OC_R, OC_R * 2, -(OC_R + (CH_R - OC_R) / 2), 0],
    [CH_R - OC_R, OC_R * 2, +(OC_R + (CH_R - OC_R) / 2), 0],
  ]) {
    const b = P.boxC(w, 0.4, d, mTempleDk);
    b.position.set(TX + ox, CH_CEIL + 0.2, TZ + oz);
    tmp.add(b);
    solidBox(w, 0.45, d, TX + ox, CH_CEIL + 0.2, TZ + oz);
  }

  // --- summit: paving around the oculus, carved lattice, corner pinnacles ----
  const SUM = TIER_R[4];
  for (const [w, d, ox, oz] of [
    [SUM * 2, SUM - OC_R, 0, -(OC_R + (SUM - OC_R) / 2)],
    [SUM * 2, SUM - OC_R, 0, +(OC_R + (SUM - OC_R) / 2)],
    [SUM - OC_R, OC_R * 2, -(OC_R + (SUM - OC_R) / 2), 0],
    [SUM - OC_R, OC_R * 2, +(OC_R + (SUM - OC_R) / 2), 0],
  ]) {
    const b = P.boxC(w, 0.36, d, mTemple);
    b.position.set(TX + ox, TIER_H[5] - 0.18, TZ + oz);
    tmp.add(b);
  }
  // stone grille over the oculus — casts a barred beam all the way to the altar
  const grille = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const a = P.boxC(0.2, 0.22, OC_R * 2, mTempleDk);
    a.position.set(TX + i * 0.62, TIER_H[5] - 0.1, TZ); grille.add(a);
    const b = P.boxC(OC_R * 2, 0.22, 0.2, mTempleDk);
    b.position.set(TX, TIER_H[5] - 0.1, TZ + i * 0.62); grille.add(b);
  }
  tmp.add(grille);
  const curb = new THREE.Group();
  for (const [ox, oz, w, d] of [
    [0, -(OC_R + 0.3), OC_R * 2 + 1.2, 0.6], [0, OC_R + 0.3, OC_R * 2 + 1.2, 0.6],
    [-(OC_R + 0.3), 0, 0.6, OC_R * 2], [OC_R + 0.3, 0, 0.6, OC_R * 2]]) {
    const b = P.boxC(w, 0.5, d, mTempleDk);
    b.position.set(TX + ox, TIER_H[5] + 0.25, TZ + oz);
    curb.add(b);
  }
  tmp.add(curb);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pin = P.boxC(1.5, 2.6, 1.5, mTemple);
    pin.position.set(TX + sx * (SUM - 1.2), TIER_H[5] + 1.3, TZ + sz * (SUM - 1.2));
    pin.rotation.y = R.tmp.range(-0.06, 0.06);
    tmp.add(pin);
    const cap = P.boxC(0.7, 1.4, 0.7, mTempleDk);
    cap.position.set(TX + sx * (SUM - 1.2), TIER_H[5] + 3.3, TZ + sz * (SUM - 1.2));
    tmp.add(cap);
    solidBox(1.6, 4.0, 1.6, TX + sx * (SUM - 1.2), TIER_H[5] + 2.0, TZ + sz * (SUM - 1.2));
  }

  // --- the inner chamber ------------------------------------------------------
  // relief-carved walls
  for (const [ox, oz, w, d] of [
    [0, -(CH_R - 0.08), CH_R * 2 - 1, 0.1], [0, CH_R - 0.08, CH_R * 2 - 1, 0.1],
    [-(CH_R - 0.08), 0, 0.1, CH_R * 2 - 1], [CH_R - 0.08, 0, 0.1, CH_R * 2 - 1]]) {
    const rel = P.boxC(w, 3.0, d, mFriezeLong);
    rel.position.set(TX + ox, 1.9, TZ + oz);
    tmp.add(rel);
  }
  // altar on a two-step podium, directly under the oculus
  for (let s = 0; s < 2; s++) {
    const b = P.boxC(4.6 - s * 1.2, 0.34, 3.4 - s * 1.0, mTempleDk);
    b.position.set(TX, 0.17 + s * 0.34, TZ);
    tmp.add(b);
    solidBox(4.6 - s * 1.2, 0.36, 3.4 - s * 1.0, TX, 0.17 + s * 0.34, TZ);
  }
  const altar = P.boxC(2.7, 1.05, 1.5, mTemple);
  altar.position.set(TX, 1.2, TZ);
  tmp.add(altar);
  const altarBand = P.boxC(2.74, 0.7, 1.54, mFriezeShort);
  altarBand.position.set(TX, 1.15, TZ);
  tmp.add(altarBand);
  solidBox(2.8, 1.2, 1.6, TX, 1.28, TZ);
  // toppled statuary and offering bowls in the corners
  for (let i = 0; i < 9; i++) {
    const b = P.boxC(R.tmp.range(0.5, 1.3), R.tmp.range(0.4, 1.6), R.tmp.range(0.5, 1.2), mRubble);
    b.position.set(TX + R.tmp.gauss(0, 4.4), R.tmp.range(0.2, 0.8), TZ + R.tmp.gauss(0, 4.4));
    b.rotation.set(R.tmp.range(-0.5, 0.5), R.tmp() * TAU, R.tmp.range(-0.5, 0.5));
    tmp.add(b);
  }
  // the entry passage: jamb reveals + a sagging lintel stone
  for (const sx of [-1, 1]) {
    const j2 = P.boxC(0.35, 2.2, 16, mTempleDk);
    j2.position.set(TX + sx * 1.72, 1.1, TZ + CH_R + 8);
    tmp.add(j2);
  }
  const lint = P.boxC(4.4, 0.65, 1.4, mTemple);
  lint.position.set(TX, 2.5, TZ + CH_R + 0.2);
  lint.rotation.z = 0.02;
  tmp.add(lint);

  ctx.addDecor(bake(tmp));

  // monumental north stair, ground → summit (solid masonry beneath)
  flightZ(TX, GY, TZ - TIER_R[0] - 16.8, +1, 40, 9.0, 0.30, 0.78, mTemple, { to: GY });
  // ruined balustrades flanking it
  const balus = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    for (const sx of [-1, 1]) {
      if (R.tmp.chance(0.2)) continue;
      const b = P.boxC(0.85, 1.15 + R.tmp.range(-0.25, 0.35), 1.3, mTempleDk);
      b.position.set(TX + sx * 5.1, GY + t * 12 + 0.7, TZ - TIER_R[0] - 16.8 + t * 31.2);
      b.rotation.set(R.tmp.range(-0.04, 0.04), R.tmp.range(-0.05, 0.05), R.tmp.range(-0.05, 0.05));
      balus.add(b);
    }
  }
  ctx.addDecor(bake(balus));

  // torches in the chamber and at the doorway
  for (const [tx, ty, tz, col] of [
    [TX - 5.6, 1.85, TZ - 4.4, 0xff9a34], [TX + 5.6, 1.85, TZ - 4.4, 0xff8420],
    [TX - 5.6, 1.85, TZ + 4.4, 0xffa845], [TX + 5.6, 1.85, TZ + 4.4, 0xff8c2a],
    [TX - 2.6, 1.85, TZ + CH_R + 15.2, 0xff9a34], [TX + 2.6, 1.85, TZ + CH_R + 15.2, 0xff8420],
  ]) {
    const t = P.torch({ color: col });
    t.position.set(tx, ty, tz);
    ctx.addDecor(t);
    torches.push(t);
  }
  const chamberLight = new THREE.PointLight(0xff9a44, 6.5, 22, 2.0);
  chamberLight.position.set(TX, 2.4, TZ - 1.6);
  ctx.light(chamberLight);
  const doorLight = new THREE.PointLight(0xff8c34, 4.5, 16, 2.0);
  doorLight.position.set(TX, 2.0, TZ + CH_R + 14);
  ctx.light(doorLight);

  // a raised reflecting tank east of the temple
  const tank = new THREE.Group();
  for (const [w, d, ox, oz] of [[18, 1.0, 0, -10.5], [18, 1.0, 0, 10.5], [1.0, 20, -8.5, 0], [1.0, 20, 8.5, 0]]) {
    const b = P.boxC(w, 0.95, d, mStoneWet);
    b.position.set(72 + ox, 0.475, 34 + oz);
    tank.add(b);
    solidBox(w, 1.0, d, 72 + ox, 0.5, 34 + oz);
  }
  ctx.addDecor(bake(tank));
  const tankWater = P.ground(16, 18, wChannel, { collide: false });
  tankWater.position.set(72, 0.62, 34);
  ctx.addDecor(tankWater);

  // ---------------------------------------------------------------------------
  // §7  THE CISTERN — vaulted reservoir at y = -6, black water, one grate
  // ---------------------------------------------------------------------------

  const cis = new THREE.Group();
  const IX0 = CIS.x0 + 1.2, IX1 = CIS.x1 - 1.2;
  const IZ0 = CIS.z0 + 1.2, IZ1 = CIS.z1 - 1.2;

  // floor
  cis.add((() => {
    const g = tiledFloor(IX0, IZ0, IX1, IZ1, CY, mDark, 10);
    return g;
  })());
  solidFloor(IX0, IZ0, IX1, IZ1, CY);

  // shell walls (east wall carries the stair opening)
  const WT = 1.2;
  const wallY = (CY + (-0.6)) / 2, wallH = (-0.6) - CY;
  function cisWall(x0, z0, x1, z1) {
    const w = Math.max(WT, x1 - x0), d = Math.max(WT, z1 - z0);
    const b = P.boxC(w, wallH, d, mDark);
    b.position.set((x0 + x1) / 2, wallY, (z0 + z1) / 2);
    cis.add(b);
    solidBox(w, wallH + 0.4, d, (x0 + x1) / 2, wallY, (z0 + z1) / 2);
  }
  cisWall(CIS.x0, CIS.z0, CIS.x1, CIS.z0 + WT);
  cisWall(CIS.x0, CIS.z1 - WT, CIS.x1, CIS.z1);
  cisWall(CIS.x0, CIS.z0, CIS.x0 + WT, CIS.z1);
  cisWall(CIS.x1 - WT, CIS.z0, CIS.x1, -62);
  cisWall(CIS.x1 - WT, -58, CIS.x1, CIS.z1);
  const eLint = P.boxC(WT, 2.0, 4.0, mDark);
  eLint.position.set(CIS.x1 - WT / 2, -1.6, -60);
  cis.add(eLint);
  solidBox(WT, 2.0, 4.0, CIS.x1 - WT / 2, -1.6, -60);

  // rows of low arches on stumpy piers
  const cisXs = [-21, -9, 3, 15];
  const cisZs = [-78, -70, -62];
  const PIER_TOP = -3.6, ARCH_R = 2.0;
  for (const cx of cisXs) for (const cz of cisZs) {
    const p = P.boxC(1.4, PIER_TOP - CY, 1.4, mDark);
    p.position.set(cx, (CY + PIER_TOP) / 2, cz);
    p.rotation.y = R.cis.range(-0.03, 0.03);
    cis.add(p);
    solidBox(1.5, PIER_TOP - CY + 0.2, 1.5, cx, (CY + PIER_TOP) / 2, cz);
    const cap = P.boxC(1.9, 0.3, 1.9, mStoneWet);
    cap.position.set(cx, PIER_TOP - 0.15, cz);
    cis.add(cap);
  }
  for (let i = 0; i < cisXs.length; i++) for (let j = 0; j < cisZs.length; j++) {
    if (i < cisXs.length - 1) {
      const a = archRing(ARCH_R, 0.5, 1.5, mDark, 7);
      a.position.set((cisXs[i] + cisXs[i + 1]) / 2, PIER_TOP, cisZs[j]);
      cis.add(a);
      const s = spandrel(6, ARCH_R, PIER_TOP, CCEIL, 1.5, mDark, 5, 0.5);
      s.position.set((cisXs[i] + cisXs[i + 1]) / 2, 0, cisZs[j]);
      cis.add(s);
    }
    if (j < cisZs.length - 1) {
      const a = archRing(ARCH_R, 0.5, 1.5, mDark, 7);
      a.position.set(cisXs[i], PIER_TOP, (cisZs[j] + cisZs[j + 1]) / 2);
      a.rotation.y = Math.PI / 2;
      cis.add(a);
      const s = spandrel(4, ARCH_R, PIER_TOP, CCEIL, 1.5, mDark, 5, 0.5);
      s.position.set(cisXs[i], 0, (cisZs[j] + cisZs[j + 1]) / 2);
      s.rotation.y = Math.PI / 2;
      cis.add(s);
    }
  }

  // vault slab with a rectangular void for the grate shaft
  const gx0 = GRATE.x - GRATE.r, gx1 = GRATE.x + GRATE.r;
  const gz0 = GRATE.z - GRATE.r, gz1 = GRATE.z + GRATE.r;
  for (const [x0, z0, x1, z1] of [
    [CIS.x0, CIS.z0, CIS.x1, gz0], [CIS.x0, gz1, CIS.x1, CIS.z1],
    [CIS.x0, gz0, gx0, gz1], [gx1, gz0, CIS.x1, gz1],
  ]) {
    const b = P.boxC(x1 - x0, 0.8, z1 - z0, mDark);
    b.position.set((x0 + x1) / 2, CCEIL + 0.4, (z0 + z1) / 2);
    cis.add(b);
    solidBox(x1 - x0, 0.85, z1 - z0, (x0 + x1) / 2, CCEIL + 0.4, (z0 + z1) / 2);
  }
  // the shaft lining + surface curb
  for (const [w, d, ox, oz] of [
    [GRATE.r * 2 + 1.2, 0.6, 0, -(GRATE.r + 0.3)], [GRATE.r * 2 + 1.2, 0.6, 0, GRATE.r + 0.3],
    [0.6, GRATE.r * 2, -(GRATE.r + 0.3), 0], [0.6, GRATE.r * 2, GRATE.r + 0.3, 0]]) {
    const b = P.boxC(w, 2.2, d, mStoneWet);
    b.position.set(GRATE.x + ox, -0.5, GRATE.z + oz);
    cis.add(b);
    const lip = P.boxC(w + 0.4, 0.5, d + 0.4, mStoneWet);
    lip.position.set(GRATE.x + ox, 0.25, GRATE.z + oz);
    cis.add(lip);
    solidBox(w + 0.4, 1.0, d + 0.4, GRATE.x + ox, 0.3, GRATE.z + oz);
  }

  ctx.addDecor(bake(cis));

  // iron bars — these are the shadow casters that paint the grid on the water
  const bars = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const a = P.boxC(0.13, 0.13, GRATE.r * 2, mIron);
    a.position.set(GRATE.x + i * 0.95, 0.02, GRATE.z); bars.add(a);
    const b = P.boxC(GRATE.r * 2, 0.13, 0.13, mIron);
    b.position.set(GRATE.x, -0.12, GRATE.z + i * 0.95); bars.add(b);
  }
  const barsBaked = bake(bars, { cast: true, receive: false });
  ctx.addDecor(barsBaked);

  // stair down, and its lightwell
  const swShell = new THREE.Group();
  for (const [w, d, ox, oz] of [[11.5, 1.0, 5.0, -5.5], [11.5, 1.0, 5.0, 5.5], [1.0, 12, 11.0, 0]]) {
    const b = P.boxC(w, 7.0, d, mDark);
    b.position.set(19 + ox, -2.9, -60 + oz);
    swShell.add(b);
    solidBox(w, 7.2, d, 19 + ox, -2.9, -60 + oz);
  }
  ctx.addDecor(bake(swShell));
  flightX(20.0, CY, -60.0, +1, 20, 4.0, 0.30, 0.45, mDark, { to: CY - 0.6 });

  // dressing: silt heaps, a broken arch, dripping columns of water
  const cisDress = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const b = P.boxC(R.cis.range(0.5, 2.4), R.cis.range(0.25, 0.9), R.cis.range(0.5, 2.0), mRubble);
    b.position.set(R.cis.range(IX0 + 1, IX1 - 1), CY + 0.2, R.cis.range(IZ0 + 1, IZ1 - 1));
    b.rotation.set(R.cis.range(-0.2, 0.2), R.cis() * TAU, R.cis.range(-0.2, 0.2));
    cisDress.add(b);
  }
  // collapsed arch in the far corner — the darkest place in the arena
  for (let i = 0; i < 10; i++) {
    const b = P.boxC(R.cis.range(1.0, 2.4), R.cis.range(0.5, 1.2), R.cis.range(0.8, 1.8), mDark);
    b.position.set(-24 + R.cis.gauss(0, 2.4), CY + R.cis.range(0.2, 1.6), -82 + R.cis.gauss(0, 2.4));
    b.rotation.set(R.cis() * 3, R.cis() * 3, R.cis() * 3);
    cisDress.add(b);
  }
  ctx.addDecor(bake(cisDress));
  solidBox(5.0, 2.2, 5.0, -24, CY + 1.1, -82);

  const drips = [];
  for (let i = 0; i < 6; i++) {
    const dx = R.cis.range(IX0 + 3, IX1 - 3), dz = R.cis.range(IZ0 + 3, IZ1 - 3);
    const col = P.cyl(0.014, 0.02, CCEIL - CWY, M.emissive(0x9fd8c8, 0.7, { transparent: true, opacity: 0.28 }), { seg: 5, collide: false, shadow: false });
    col.position.set(dx, CWY, dz);
    ctx.addDecor(col);
    drips.push([dx, dz, CWY]);
  }

  // two guttering torches by the stair foot, plus cold fill light
  for (const [tx, tz, col] of [[17.5, -58.4, 0xff8c2a], [17.5, -61.6, 0xffa040]]) {
    const t = P.torch({ color: col });
    t.position.set(tx, CY + 1.7, tz);
    ctx.addDecor(t);
    torches.push(t);
  }
  const cisTorchLight = new THREE.PointLight(0xff8c3a, 6, 20, 2.0);
  cisTorchLight.position.set(16.5, CY + 2.2, -60);
  ctx.light(cisTorchLight);
  const cisFill1 = new THREE.PointLight(0x1d5a58, 3.2, 26, 2.0);
  cisFill1.position.set(-6, CY + 2.4, -70); ctx.light(cisFill1);
  const cisFill2 = new THREE.PointLight(0x143f44, 2.4, 26, 2.0);
  cisFill2.position.set(-18, CY + 2.2, -78); ctx.light(cisFill2);

  // ---------------------------------------------------------------------------
  // §8  THE JUNGLE — canopy, instanced trees, roots, ferns, buried fragments
  // ---------------------------------------------------------------------------

  /** True where dense planting is allowed (never on paths, water or landmarks). */
  function plantable(x, z) {
    if (Math.abs(x) > HX - 3 || Math.abs(z) > HZ - 3) return false;
    if (inWater(x, z)) return false;
    if (nearSpawn(x, z)) return false;
    if (Math.abs(z - AQ_Z) < 12) return false;                      // under the arcade
    if (x > TX - 26 && x < TX + 26 && z > TZ - 40 && z < TZ + 26) return false;  // temple
    if (x > 14 && x < 34 && z > -70 && z < -50) return false;       // cistern stair
    if (Math.abs(x - GRATE.x) < 7 && Math.abs(z - GRATE.z) < 7) return false;
    if (x > 30 && x < 80 && z > -36 && z < -24) return false;       // grand stair
    if (x > -78 && x < -52 && z > -44 && z < -26) return false;     // stair tower
    return true;
  }
  const jungleDensity = (x, z) => {
    const edge = Math.min(HX - Math.abs(x), HZ - Math.abs(z)) / 38;
    const n = ctx.noise.fbm(x * 0.02, z * 0.02, 4) * 0.5 + 0.5;
    return Math.max(0, 1 - edge) * 0.8 + n * 0.5;
  };

  // --- instanced trees: three baked variants, two draw calls each ------------
  // Both parts of a variant use the same scatter seed and the same accept test,
  // so bark and canopy land on identical transforms.
  for (let v = 0; v < 3; v++) {
    const proto = P.tree(R.jun.range(13, 19), 'broad', 4000 + v * 77);
    const baked = P.freeze(proto);
    const parts = baked.children.filter(c => c.isMesh);
    for (const part of parts) {
      const inst = P.scatter(part.geometry, part.material, 46, (i, d, rr) => {
        let x = 0, z = 0, ok = false;
        for (let tryN = 0; tryN < 14 && !ok; tryN++) {
          x = rr.range(-HX + 4, HX - 4);
          z = rr.range(-HZ + 4, HZ - 4);
          ok = plantable(x, z) && rr() < jungleDensity(x, z);
        }
        if (!ok) return false;
        d.position.set(x, GY - 0.15, z);
        d.rotation.y = rr() * TAU;
        d.rotation.z = rr.gauss(0, 0.035);
        d.scale.setScalar(rr.range(0.72, 1.5));
        return true;
      }, 900 + v * 13);
      inst.castShadow = true;
      inst.receiveShadow = false;
      ctx.addDecor(inst);
    }
  }

  // --- canopy layer: seals the sky without reading as a lid ------------------
  const canopyGeo = new THREE.PlaneGeometry(16, 16);
  canopyGeo.rotateX(-Math.PI / 2);
  const canopy = P.scatter(canopyGeo, mCanopy, 300, (i, d, rr) => {
    const x = rr.range(-HX, HX), z = rr.range(-HZ, HZ);
    // leave a ragged corridor of open sky over the aqueduct and the temple
    const openAq = Math.abs(z - AQ_Z) < 9 && rr.chance(0.75);
    const openTmp = Math.hypot(x - TX, z - TZ) < 22 && rr.chance(0.7);
    if (openAq || openTmp) return false;
    if (rr() > 0.25 + jungleDensity(x, z)) return false;
    d.position.set(x, 30 + rr.range(0, 11), z);
    d.rotation.y = rr() * TAU;
    d.scale.setScalar(rr.range(0.9, 2.3));
    return true;
  }, 4242);
  canopy.castShadow = false;
  canopy.receiveShadow = false;
  ctx.addDecor(canopy);

  // --- ferns and undergrowth -------------------------------------------------
  const fernGeo = P.billboardCross(0.9, 1.0);
  const ferns = P.scatter(fernGeo, mFern, 2600, (i, d, rr) => {
    const x = rr.range(-HX + 2, HX - 2), z = rr.range(-HZ + 2, HZ - 2);
    if (!plantable(x, z)) return false;
    if (rr() > 0.25 + jungleDensity(x, z) * 1.1) return false;
    d.position.set(x, GY - 0.05, z);
    d.rotation.y = rr() * TAU;
    d.scale.set(rr.range(0.7, 1.9), rr.range(0.7, 2.1), rr.range(0.7, 1.9));
    return true;
  }, 777);
  ferns.castShadow = false;
  ctx.addDecor(ferns);

  // reeds standing in the shallows, right at the waterline
  const reeds = P.scatter(P.billboardCross(0.5, 1.3), mFern, 1200, (i, d, rr) => {
    const onCanal = rr.chance(0.55);
    const x = onCanal ? rr.range(-HX + 2, HX - 2) : rr.range(GAL.x0 + 1, GAL.x1 - 1);
    const z = onCanal ? (rr.chance(0.5) ? rr.range(-30, -27.5) : rr.range(-18.5, -16))
      : rr.range(GAL.z0 + 1, GAL.z1 - 1);
    if (!onCanal && rr.chance(0.6)) return false;
    d.position.set(x, BY, z);
    d.rotation.y = rr() * TAU;
    d.scale.set(rr.range(0.6, 1.3), rr.range(0.8, 1.8), rr.range(0.6, 1.3));
    return true;
  }, 313);
  reeds.castShadow = false;
  ctx.addDecor(reeds);

  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushMat = M.solid({ color: 0x24401f, roughness: 0.95, flat: true });
  const bushes = P.scatter(bushGeo, bushMat, 340, (i, d, rr) => {
    const x = rr.range(-HX + 3, HX - 3), z = rr.range(-HZ + 3, HZ - 3);
    if (!plantable(x, z)) return false;
    if (rr() > 0.2 + jungleDensity(x, z)) return false;
    d.position.set(x, GY + rr.range(0.4, 1.1), z);
    d.rotation.set(rr() * 3, rr() * 3, rr() * 3);
    d.scale.set(rr.range(0.8, 2.2), rr.range(0.5, 1.3), rr.range(0.8, 2.2));
    return true;
  }, 555);
  ctx.addDecor(bushes);

  // --- vines: hanging planes with a painted alpha, swaying in the shader -----
  const uTime = { value: 0 };
  /** sign = -1 for things that hang down, +1 for things that stand up. */
  function addSway(material, amp, sign) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float swayPhase = 0.0;
         #ifdef USE_INSTANCING
           swayPhase = instanceMatrix[3].x * 0.41 + instanceMatrix[3].z * 0.27;
         #endif
         float swayAmt = ${amp.toFixed(4)} * max(0.0, ${sign.toFixed(1)} * transformed.y);
         transformed.x += sin(uTime * 0.9 + swayPhase) * swayAmt;
         transformed.z += cos(uTime * 0.71 + swayPhase * 1.3) * swayAmt * 0.7;`
      );
    };
    material.customProgramCacheKey = () => 'sway' + amp + '_' + sign;
    return material;
  }
  addSway(mVine, 0.055, -1);    // vine planes hang below their origin
  addSway(mFern, 0.030, +1);    // fronds rise above theirs

  // vine geometry hangs DOWN from its origin so the sway ramps toward the tip
  const vineGeo = (() => {
    const a = new THREE.PlaneGeometry(1.5, 4.0);
    a.translate(0, -2.0, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    return P.mergeGeometries([a, b]);
  })();

  // every ledge in the arena gets a curtain of them
  const vineAnchors = [];
  for (let k = 0; k < AQ_PIERS - 1; k++) {
    const x = pierX(k) + AQ_SPAN / 2;
    if (x > GAP_X0 - 2 && x < GAP_X1 + 2) continue;
    for (const sz of [-3.2, 3.2]) {
      vineAnchors.push([x + R.jun.gauss(0, 3), DECK_Y - 0.6, AQ_Z + sz, 1.6]);
      vineAnchors.push([x + R.jun.gauss(0, 4), T1_CORN - 0.3, AQ_Z + sz, 1.2]);
      vineAnchors.push([x + R.jun.gauss(0, 4), T0_CORN - 0.3, AQ_Z + sz, 1.4]);
    }
  }
  for (const [cx, cz] of standing) {
    if (R.jun.chance(0.45)) vineAnchors.push([cx + R.jun.gauss(0, 0.9), BY + GAL_TOP, cz + R.jun.gauss(0, 0.9), 1.0]);
  }
  for (let i = 0; i < 40; i++) {
    vineAnchors.push([TX + R.jun.gauss(0, 20), TIER_H[R.jun.int(1, 4)] - 0.2, TZ + R.jun.gauss(0, 20), 1.1]);
  }
  for (let i = 0; i < 34; i++) {
    vineAnchors.push([R.jun.range(-74.6, -56.4), R.jun.range(4, 26), R.jun.range(-42, -29), 1.3]);
  }
  const vines = P.scatter(vineGeo, mVine, vineAnchors.length + 60, (i, d, rr) => {
    if (i >= vineAnchors.length) {
      const x = rr.range(-HX + 6, HX - 6), z = rr.range(-HZ + 6, HZ - 6);
      if (!plantable(x, z)) return false;
      d.position.set(x, GY + rr.range(6, 13), z);
      d.rotation.y = rr() * TAU;
      d.scale.setScalar(rr.range(0.8, 2.0));
      return true;
    }
    const [x, y, z, s] = vineAnchors[i];
    d.position.set(x, y, z);
    d.rotation.y = rr() * TAU;
    d.scale.set(s * rr.range(0.7, 1.3), s * rr.range(0.6, 1.6), s * rr.range(0.7, 1.3));
    return true;
  }, 1717);
  vines.castShadow = false;
  ctx.addDecor(vines);

  // --- roots swallowing the ruins --------------------------------------------
  const roots = new THREE.Group();
  const rootSites = [
    [GAL.x1 + 0.5, BY, 6], [GAL.x1 + 0.5, BY, 34], [GAL.x0 - 0.5, BY, 20],
    [TX - 23, 0, TZ + 12], [TX + 23, 0, TZ - 8], [TX + 4, 2.4, TZ + 23],
    [-74.6, 0, -34], [-56.4, 0, -38], [pierX(1), 0, AQ_Z - 3.4], [pierX(10), 0, AQ_Z + 3.4],
    [66, 0, 12], [-88, 0, 66], [26, 0, 74], [-40, 0, -78],
  ];
  for (const [rx, ry, rz] of rootSites) {
    for (let b = 0; b < 4; b++) {
      const a = R.jun() * TAU;
      rootChain(roots, rx + Math.cos(a) * 0.6, ry + R.jun.range(3, 9), rz + Math.sin(a) * 0.6,
        Math.cos(a) * 0.35, -0.85, Math.sin(a) * 0.35,
        7, R.jun.range(0.32, 0.62), R.jun.range(1.5, 2.6), R.jun, mRoot);
    }
  }
  ctx.addDecor(bake(roots));

  // --- buried temple fragments + boulders ------------------------------------
  const frags = new THREE.Group();
  for (let i = 0; i < 34; i++) {
    let x = 0, z = 0, ok = false;
    for (let t = 0; t < 20 && !ok; t++) {
      x = R.jun.range(-HX + 6, HX - 6); z = R.jun.range(-HZ + 6, HZ - 6);
      ok = plantable(x, z);
    }
    if (!ok) continue;
    const kind = R.jun.int(0, 2);
    if (kind === 0) {                                  // half-buried lintel
      const b = P.boxC(R.jun.range(3, 6), 1.0, 1.2, mTempleDk);
      b.position.set(x, GY + R.jun.range(-0.1, 0.4), z);
      b.rotation.set(R.jun.range(-0.2, 0.2), R.jun() * TAU, R.jun.range(-0.25, 0.25));
      frags.add(b);
      const band = P.boxC(R.jun.range(3, 5), 0.55, 1.24, mFriezeShort);
      band.position.copy(b.position); band.rotation.copy(b.rotation);
      frags.add(band);
      solidBox(4.5, 1.1, 1.6, x, GY + 0.5, z, b.rotation.y);
    } else if (kind === 1) {                            // toppled column drums
      for (let k = 0; k < R.jun.int(2, 4); k++) {
        const c = P.cyl(0.8, 0.85, R.jun.range(1.2, 2.4), mColumn, { seg: 10 });
        c.position.set(x + R.jun.gauss(0, 1.6), GY + 0.1, z + R.jun.gauss(0, 1.6));
        c.rotation.set(Math.PI / 2 + R.jun.range(-0.3, 0.3), R.jun() * TAU, 0);
        frags.add(c);
      }
      solidBox(3.4, 1.6, 3.4, x, GY + 0.8, z);
    } else {                                            // carved head / stele
      const s = P.boxC(1.5, R.jun.range(2.0, 3.4), 1.5, mTemple);
      s.position.set(x, GY + 1.2, z);
      s.rotation.set(R.jun.range(-0.15, 0.15), R.jun() * TAU, R.jun.range(-0.15, 0.15));
      frags.add(s);
      const f = P.boxC(1.54, 1.5, 1.54, mFriezeShort);
      f.position.copy(s.position); f.rotation.copy(s.rotation);
      frags.add(f);
      solidBox(1.7, 3.2, 1.7, x, GY + 1.5, z, s.rotation.y);
    }
  }
  ctx.addDecor(bake(frags));

  const boulderGeo = (() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const f = 1 + R.jun.range(-0.3, 0.3);
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.75, pos.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  })();
  ctx.addDecor(P.scatter(boulderGeo, mCliff, 260, (i, d, rr) => {
    const inCanal = rr.chance(0.3);
    const x = inCanal ? rr.range(-HX + 3, HX - 3) : rr.range(-HX + 3, HX - 3);
    const z = inCanal ? rr.range(-29, -17) : rr.range(-HZ + 3, HZ - 3);
    if (!inCanal && !plantable(x, z)) return false;
    if (nearSpawn(x, z)) return false;
    d.position.set(x, (inCanal ? BY : GY) + rr.range(0.1, 0.7), z);
    d.rotation.set(rr() * 3, rr() * 3, rr() * 3);
    d.scale.setScalar(rr.range(0.4, 1.9));
    return true;
  }, 8181));

  // --- moss: decal patches and a tinted shell creeping up every column -------
  const mossGeo = new THREE.PlaneGeometry(2.2, 2.2);
  mossGeo.rotateX(-Math.PI / 2);
  const mossPatches = P.scatter(mossGeo, mMoss, 900, (i, d, rr) => {
    const pick = rr();
    let x, z, y = GY + 0.02;
    if (pick < 0.4) {                     // canal lips
      x = rr.range(-HX, HX);
      z = rr.chance(0.5) ? rr.range(-32, -28.6) : rr.range(-17.4, -14);
    } else if (pick < 0.75) {             // gallery lips + interior shallows
      x = rr.range(GAL.x0 - 2, GAL.x1 + 2);
      z = rr.range(GAL.z0 - 2, GAL.z1 + 2);
      if (inRect(x, z, GAL)) y = BY + 0.02;
    } else {                              // temple terraces
      x = TX + rr.gauss(0, 18); z = TZ + rr.gauss(0, 18);
      y = GY + 0.02;
      for (let t = 4; t >= 0; t--) {
        if (Math.abs(x - TX) < TIER_R[t] && Math.abs(z - TZ) < TIER_R[t]) { y = TIER_H[t + 1] + 0.02; break; }
      }
    }
    if (Math.abs(x) > HX - 1 || Math.abs(z) > HZ - 1) return false;
    d.position.set(x, y, z);
    d.rotation.y = rr() * TAU;
    d.scale.setScalar(rr.range(0.6, 2.4));
    return true;
  }, 6060);
  mossPatches.castShadow = false;
  ctx.addDecor(mossPatches);

  const mossShellGeo = new THREE.CylinderGeometry(1.02, 1.09, 2.6, 12, 1, true);
  mossShellGeo.translate(0, 1.3, 0);
  const mMossShell = M.solid({
    color: 0x35592c, roughness: 1, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
  });
  const mossShells = P.scatter(mossShellGeo, mMossShell, standing.length + 40, (i, d, rr) => {
    if (i < standing.length) {
      d.position.set(standing[i][0], BY, standing[i][1]);
      d.scale.set(1, rr.range(0.7, 1.5), 1);
    } else {
      const k = rr.int(0, AQ_PIERS - 1);
      d.position.set(pierX(k) + rr.gauss(0, 1.6), BY, AQ_Z + rr.range(-3.2, 3.2));
      d.scale.set(rr.range(1.4, 2.4), rr.range(0.6, 1.4), rr.range(1.2, 2.0));
    }
    d.rotation.y = rr() * TAU;
    return true;
  }, 4747);
  mossShells.castShadow = false;
  ctx.addDecor(mossShells);

  // ---------------------------------------------------------------------------
  // §9  WATER, CAUSTICS, MIST, GOD RAYS, DEBRIS, BIRDS
  // ---------------------------------------------------------------------------

  // --- water surfaces --------------------------------------------------------
  const canalWater = P.ground(HX * 2, 14, wOpen, { collide: false });
  canalWater.position.set(0, WY, AQ_Z);
  ctx.addDecor(canalWater);

  const galWater = P.ground(GAL.x1 - GAL.x0, GAL.z1 - GAL.z0, wOpen, { collide: false });
  galWater.position.set((GAL.x0 + GAL.x1) / 2, WY, (GAL.z0 + GAL.z1) / 2);
  ctx.addDecor(galWater);

  for (const [cx, w] of [[(-HX + GAP_X0) / 2, GAP_X0 + HX], [(GAP_X1 + HX) / 2, HX - GAP_X1]]) {
    const chan = P.ground(w, 4.4, wChannel, { collide: false });
    chan.position.set(cx, DECK_WATER, AQ_Z);
    ctx.addDecor(chan);
  }

  const cisWater = P.ground(IX1 - IX0, IZ1 - IZ0, wBlack, { collide: false });
  cisWater.position.set((IX0 + IX1) / 2, CWY, (IZ0 + IZ1) / 2);
  ctx.addDecor(cisWater);

  // --- caustics: additive painted networks scrolling under the surface -------
  const causticMaps = [];
  function causticSheet(cx, cz, w, d, y, repX, repZ, opacity) {
    const m = mCaustic();
    m.opacity = opacity;
    m.map.repeat.set(repX, repZ);
    const p = P.ground(w, d, m, { collide: false });
    p.position.set(cx, y, cz);
    p.renderOrder = 2;
    ctx.addDecor(p);
    causticMaps.push(m.map);
    return m.map;
  }
  // NOTE: these sit just ABOVE the surface. The water material depth-writes, so
  // anything placed under it would be depth-rejected and never seen.
  causticSheet((GAL.x0 + GAL.x1) / 2, (GAL.z0 + GAL.z1) / 2,
    GAL.x1 - GAL.x0, GAL.z1 - GAL.z0, WY + 0.04, 7, 8, 0.62);
  causticSheet((GAL.x0 + GAL.x1) / 2, (GAL.z0 + GAL.z1) / 2,
    GAL.x1 - GAL.x0, GAL.z1 - GAL.z0, WY + 0.07, 4.5, 5, 0.34);
  causticSheet(0, AQ_Z, HX * 2, 14, WY + 0.04, 21, 1.5, 0.5);
  causticSheet((IX0 + IX1) / 2, (IZ0 + IZ1) / 2, IX1 - IX0, IZ1 - IZ0, CWY + 0.04, 5, 3.5, 0.22);

  // --- god rays + the pools of light they land in ----------------------------
  const RAY_EULER = new THREE.Euler(-0.27, 0, -0.49);
  const shafts = new THREE.Group();
  function shaft(x, yTop, z, h, rTop, rBot, floorY) {
    const g = new THREE.Group();
    g.position.set(x, yTop, z);
    g.rotation.copy(RAY_EULER);
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, 14, 1, true), mRay);
    cone.position.y = -h / 2;
    g.add(cone);
    shafts.add(g);
    if (floorY !== undefined) {
      const drop = new THREE.Vector3(0, -(yTop - floorY), 0).applyEuler(RAY_EULER);
      const pool = P.ground(rBot * 3.4, rBot * 3.4, mPool, { collide: false });
      pool.position.set(x + drop.x, floorY + 0.05, z + drop.z);
      shafts.add(pool);
    }
  }
  // Cones stop at the water line for the same depth-sort reason as the caustics.
  // gallery roof holes
  for (const [ox, oz, orad] of openings) {
    shaft(ox, BY + GAL_ROOF + 0.4, oz, GAL_ROOF, orad * 0.55, orad * 1.25, WY);
  }
  // canopy gaps over the canal and the plaza
  for (let i = 0; i < 7; i++) {
    const x = R.dress.range(-96, 96);
    if (x > GAP_X0 - 6 && x < GAP_X1 + 6) continue;
    shaft(x, 30, AQ_Z + R.dress.range(-9, 9), 29.8, 1.6, 4.6, WY);
  }
  for (let i = 0; i < 6; i++) {
    const x = R.dress.range(-HX + 12, HX - 12), z = R.dress.range(-HZ + 12, HZ - 12);
    if (inWater(x, z)) continue;
    shaft(x, 30, z, 30, 1.4, 4.0, GY);
  }
  // the temple chimney: a hard barred beam onto the altar
  shaft(TX, TIER_H[5] - 0.4, TZ, 11.2, 1.4, 2.1, 1.75);
  // the cistern grate
  shaft(GRATE.x, -0.9, GRATE.z, 4.7, GRATE.r * 0.85, GRATE.r * 1.15, CWY);
  const shaftsBaked = bake(shafts, { cast: false, receive: false });
  shaftsBaked.traverse(o => { if (o.isMesh) o.renderOrder = 1; });
  ctx.addDecor(shaftsBaked);

  // --- low mist layers over the water ----------------------------------------
  const mistPlanes = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.PlaneGeometry(130, 130);
    g.rotateX(-Math.PI / 2);
    const mm = mMist.clone();
    mm.opacity = 0.10 + i * 0.045;
    const p = new THREE.Mesh(g, mm);
    p.position.set(R.dress.range(-40, 40), 0.55 + i * 0.55, R.dress.range(-30, 30));
    p.renderOrder = 3;
    p.userData.collide = false;
    p.castShadow = false; p.receiveShadow = false;
    ctx.addDecor(p);
    mistPlanes.push({
      mesh: p,
      vx: R.dress.range(0.16, 0.42) * R.dress.sign(),
      vz: R.dress.range(0.10, 0.30) * R.dress.sign(),
      y: p.position.y,
    });
  }

  // --- floating debris drifting on the open water ----------------------------
  const debrisGeo = new THREE.PlaneGeometry(1.0, 0.7);
  debrisGeo.rotateX(-Math.PI / 2);
  const DEBRIS_N = 96;
  const debrisData = [];
  const debris = P.scatter(debrisGeo, mDebris, DEBRIS_N, (i, d, rr) => {
    const inGal = rr.chance(0.45);
    const x = inGal ? rr.range(GAL.x0 + 2, GAL.x1 - 2) : rr.range(-HX + 4, HX - 4);
    const z = inGal ? rr.range(GAL.z0 + 2, GAL.z1 - 2) : rr.range(-28.5, -17.5);
    const s = rr.range(0.5, 2.1);
    debrisData.push({
      x, z, s, rot: rr() * TAU,
      vx: rr.range(-0.16, 0.16), vz: rr.range(-0.1, 0.1),
      spin: rr.range(-0.12, 0.12), bob: rr() * TAU,
    });
    d.position.set(x, WY + 0.05, z);
    d.rotation.y = debrisData[debrisData.length - 1].rot;
    d.scale.setScalar(s);
    return true;
  }, 2626);
  debris.castShadow = false;
  debris.receiveShadow = false;
  ctx.addDecor(debris);
  const debrisDummy = new THREE.Object3D();

  // --- ripple rings where drips land -----------------------------------------
  const ringGeo = new THREE.PlaneGeometry(1, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  const ringSites = [
    ...drips.map(d => [d[0], d[2] + 0.02, d[1]]),
    [-52, WY + 0.03, 18], [-66, WY + 0.03, 36], [-38, WY + 0.03, -22],
    [12, WY + 0.03, -24], [72, 0.66, 34],
  ];
  ringSites.forEach((s, i) => {
    const m = new THREE.MeshBasicMaterial({
      map: ringTex, color: 0x9fe8d2, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(ringGeo, m);
    mesh.position.set(s[0], s[1], s[2]);
    mesh.userData.collide = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.renderOrder = 4;
    ctx.addDecor(mesh);
    rings.push({ mesh, m, phase: (i / ringSites.length) * 2.6, period: 2.2 + (i % 3) * 0.6 });
  });

  // --- a flock that startles off the parapet ---------------------------------
  const birdGeo = (() => {
    const a = new THREE.PlaneGeometry(0.55, 0.22);
    a.translate(0.28, 0, 0); a.rotateZ(0.35);
    const b = new THREE.PlaneGeometry(0.55, 0.22);
    b.translate(-0.28, 0, 0); b.rotateZ(-0.35);
    return P.mergeGeometries([a, b]);
  })();
  const mBird = M.solid({ color: 0x14191a, roughness: 0.9, flat: true, side: THREE.DoubleSide });
  const BIRDS = 18;
  const birdData = [];
  for (let i = 0; i < BIRDS; i++) {
    birdData.push({
      px: R.dress.range(-90, -40), py: DECK_Y + 1.3, pz: AQ_Z + (R.dress.chance(0.5) ? -2.6 : 2.6),
      a0: R.dress() * TAU, rad: R.dress.range(16, 34), h: R.dress.range(30, 42),
      spd: R.dress.range(0.35, 0.6), flap: R.dress() * TAU,
    });
  }
  const birds = P.scatter(birdGeo, mBird, BIRDS, (i, d) => {
    d.position.set(birdData[i].px, birdData[i].py, birdData[i].pz);
    return true;
  }, 31);
  birds.castShadow = false;
  ctx.addDecor(birds);
  const birdDummy = new THREE.Object3D();

  ctx.add(proxies);

  // ---------------------------------------------------------------------------
  // §10  MOTION — everything above breathes
  // ---------------------------------------------------------------------------

  const flames = torches.map((t, i) => ({
    obj: t.userData.flame,
    base: t.userData.flame ? t.userData.flame.scale.clone() : null,
    ph: i * 1.7,
  })).filter(f => f.obj);
  const torchLights = [chamberLight, doorLight, cisTorchLight];

  ctx.onUpdate((dt, elapsed) => {
    uTime.value = elapsed;

    // water normal drift
    wOpen.userData.tick(dt);
    wChannel.userData.tick(dt * 1.6);
    wBlack.userData.tick(dt * 0.35);

    // caustics scroll — two layers crossing gives the interference shimmer
    for (let i = 0; i < causticMaps.length; i++) {
      const s = i === 1 ? -1 : 1;
      causticMaps[i].offset.set(
        elapsed * 0.017 * s + Math.sin(elapsed * 0.21 + i) * 0.014,
        elapsed * 0.011 * s + Math.cos(elapsed * 0.17 + i) * 0.014);
    }

    // mist drift, wrapping softly around the valley
    for (const mp of mistPlanes) {
      mp.mesh.position.x += mp.vx * dt;
      mp.mesh.position.z += mp.vz * dt;
      if (mp.mesh.position.x > 70) mp.mesh.position.x = -70;
      if (mp.mesh.position.x < -70) mp.mesh.position.x = 70;
      if (mp.mesh.position.z > 60) mp.mesh.position.z = -60;
      if (mp.mesh.position.z < -60) mp.mesh.position.z = 60;
      mp.mesh.position.y = mp.y + Math.sin(elapsed * 0.12 + mp.vx * 10) * 0.22;
    }

    // shafts of light breathe as the canopy stirs
    mRay.opacity = 0.13 + Math.sin(elapsed * 0.33) * 0.03 + Math.sin(elapsed * 0.13) * 0.02;
    mPool.opacity = 0.44 + Math.sin(elapsed * 0.33 + 1) * 0.07;

    // torch flicker
    for (const f of flames) {
      const n = Math.sin(elapsed * 11 + f.ph) * 0.5 + Math.sin(elapsed * 23.3 + f.ph * 2) * 0.5;
      f.obj.scale.set(f.base.x * (1 + n * 0.16), f.base.y * (1 + n * 0.3), f.base.z * (1 + n * 0.16));
      f.obj.position.x = Math.sin(elapsed * 7.7 + f.ph) * 0.012;
    }
    for (let i = 0; i < torchLights.length; i++) {
      const base = [6.5, 4.5, 6][i];
      torchLights[i].intensity = base * (0.82 + Math.sin(elapsed * 9 + i * 2.1) * 0.1
        + Math.sin(elapsed * 19.7 + i) * 0.08);
    }

    // ripple rings expanding and fading where the drips land
    for (const r of rings) {
      const t = ((elapsed + r.phase) % r.period) / r.period;
      const s = 0.4 + t * 3.4;
      r.mesh.scale.set(s, 1, s);
      r.m.opacity = 0.55 * (1 - t) * (1 - t);
    }

    // floating debris
    for (let i = 0; i < debrisData.length; i++) {
      const d = debrisData[i];
      d.x += d.vx * dt; d.z += d.vz * dt;
      d.rot += d.spin * dt;
      if (d.x > HX - 3) d.x = -HX + 3;
      if (d.x < -HX + 3) d.x = HX - 3;
      const inGal = inRect(d.x, d.z, GAL);
      if (!inGal && (d.z < -29 || d.z > -17)) d.vz = -d.vz;
      debrisDummy.position.set(d.x, WY + 0.05 + Math.sin(elapsed * 1.3 + d.bob) * 0.02, d.z);
      debrisDummy.rotation.set(0, d.rot, 0);
      debrisDummy.scale.setScalar(d.s);
      debrisDummy.updateMatrix();
      debris.setMatrixAt(i, debrisDummy.matrix);
    }
    debris.instanceMatrix.needsUpdate = true;

    // the flock: perched most of the time, then startles and circles
    const CYCLE = 34;
    const t = elapsed % CYCLE;
    const fly = t > 8 && t < 26 ? Math.min(1, Math.min(t - 8, 26 - t) / 2.5) : 0;
    for (let i = 0; i < BIRDS; i++) {
      const b = birdData[i];
      const ang = b.a0 + elapsed * b.spd;
      const fx = Math.cos(ang) * b.rad - 30;
      const fz = Math.sin(ang) * b.rad + AQ_Z;
      const fyy = b.h + Math.sin(elapsed * 0.8 + b.a0) * 2.2;
      const k = fly * fly * (3 - 2 * fly);
      birdDummy.position.set(
        b.px + (fx - b.px) * k,
        b.py + (fyy - b.py) * k,
        b.pz + (fz - b.pz) * k);
      birdDummy.rotation.set(
        Math.sin(elapsed * 9 + b.flap) * 0.5 * k,
        -ang + Math.PI / 2,
        Math.sin(elapsed * 11 + b.flap) * 0.6 * k);
      birdDummy.scale.setScalar(1 + Math.sin(elapsed * 13 + b.flap) * 0.12 * k);
      birdDummy.updateMatrix();
      birds.setMatrixAt(i, birdDummy.matrix);
    }
    birds.instanceMatrix.needsUpdate = true;

    // the gallery bounce pulses with the caustics
    gl1.intensity = 9 + Math.sin(elapsed * 0.9) * 1.8;
    gl2.intensity = 8 + Math.sin(elapsed * 0.7 + 2) * 1.6;
    cl1.intensity = 7 + Math.sin(elapsed * 1.1 + 1) * 1.4;
  });

  // ---------------------------------------------------------------------------
  // §11  GAMEPLAY PLACEMENT — 42 coins, 5 batteries, 4 powerups, 1 pup, 22 spots
  // ---------------------------------------------------------------------------

  const coin = (x, y, z) => ctx.pickup(x, y + 1.0, z, 'coin');

  // -- ground level: plaza, canal, arcade (12) --------------------------------
  coin(-30, GY, -38); coin(-46, GY, -36); coin(-72, GY, -34);
  coin(6, BY, -23); coin(-22, BY, -26); coin(44, BY, -20);
  coin(88, GY, -40); coin(64, GY, -8); coin(24, GY, 4);
  coin(-96, GY, 12); coin(-14, GY, 46); coin(52, GY, 78);

  // -- the aqueduct top (8) ---------------------------------------------------
  coin(-88, DECK_Y, AQ_Z); coin(-60, DECK_Y, AQ_Z); coin(-34, DECK_Y, AQ_Z);
  coin(-8, DECK_Y, AQ_Z); coin(10, DECK_Y, AQ_Z); coin(38, DECK_Y, AQ_Z);
  coin(62, DECK_Y, AQ_Z); coin(90, DECK_Y, AQ_Z);
  // -- and the stair routes (3) -----------------------------------------------
  coin(-66, 4.4, -39); coin(-62, 19.4, -35); coin(58, 11.5, -29.6);

  // -- the flooded gallery (9) ------------------------------------------------
  coin(-84, BY, -6); coin(-70, BY, 15); coin(-59, BY, 4);
  coin(-51, BY, 23); coin(-37, BY, 30); coin(-32, BY, 41);
  coin(-57, BY + 1.35, 48); coin(-81, BY, 41); coin(-35, BY, -12);

  // -- the temple (7) ---------------------------------------------------------
  coin(TX, 3.0, TZ - 32); coin(TX - 7.5, GY, TZ - 26); coin(TX + 6.2, 7.6, TZ - 14);
  coin(TX, TIER_H[5], TZ - 6.4); coin(TX + 4.5, TIER_H[5], TZ + 4.5);
  coin(TX - 4.8, GY, TZ + 4.6); coin(TX, GY, TZ + 16);

  // -- the cistern (3) --------------------------------------------------------
  coin(10, CY, -58); coin(-4, CY, -66); coin(-16, CY, -76);

  // batteries — weighted to the dark
  ctx.pickup(6, CY + 1.0, -74, 'battery');
  ctx.pickup(-20, CY + 1.0, -60, 'battery');
  ctx.pickup(14, CY + 1.0, -82, 'battery');
  ctx.pickup(-66, BY + 1.0, 28, 'battery');
  ctx.pickup(TX + 4.4, GY + 1.0, TZ - 4.2, 'battery');

  // powerups
  ctx.pickup(-2, CY + 1.0, -80, 'powerup:ghost');
  ctx.pickup(-45, BY + 1.0, 8, 'powerup:nightvision');
  ctx.pickup(-20, DECK_Y + 1.0, AQ_Z, 'powerup:dash');
  ctx.pickup(TX - 6.0, GY + 1.0, TZ + 5.4, 'powerup:silence');

  // the dog — behind the fallen arch in the blackest corner of the cistern
  ctx.pickup(-27.2, CY + 1.0, -85.2, 'pup');

  // -- hiding spots -----------------------------------------------------------
  const spots = [
    // gallery: behind columns and under the fallen roof
    [-81.6, BY, 2.4, 1.6, 1.0], [-70.6, BY, 24.4, 1.6, 1.0], [-59.6, BY, 35.4, 1.6, 0.95],
    [-48.6, BY, 13.4, 1.6, 0.95], [-37.6, BY, 46.4, 1.6, 0.9], [-26.6, BY, 2.4, 1.6, 0.9],
    [-57, BY, 47, 2.0, 1.0],
    // cistern: the whole room is concealment
    [-27.0, CY, -85.4, 3.0, 1.0], [-10, CY, -78, 2.6, 1.0], [8, CY, -70, 2.6, 1.0],
    [-20, CY, -58, 2.4, 0.95], [12, CY, -84, 2.4, 0.95],
    // the temple chamber and its passage
    [TX - 5.2, GY, TZ + 4.6, 2.0, 1.0], [TX + 5.2, GY, TZ - 4.6, 2.0, 1.0],
    [TX, GY, TZ + 16, 1.4, 0.9],
    // under the collapsed span, in the rubble
    [24, BY, AQ_Z - 4.5, 2.2, 0.9], [18, BY, AQ_Z + 4.0, 2.0, 0.85],
    // behind aqueduct piers, at ground level
    [-96, BY, AQ_Z + 3.6, 1.6, 0.8], [-48, BY, AQ_Z - 3.6, 1.6, 0.8],
    [48, BY, AQ_Z + 3.6, 1.6, 0.8],
    // stair tower and undergrowth
    [-71, GY, -31, 2.0, 0.9], [-88, GY, 74, 2.6, 0.85], [86, GY, 66, 2.6, 0.85],
    [90, GY, -76, 2.6, 0.85], [79, GY, 46, 2.2, 0.75],
  ];
  for (const [x, y, z, r, q] of spots) ctx.hidingSpot(x, y, z, r, q);
}
