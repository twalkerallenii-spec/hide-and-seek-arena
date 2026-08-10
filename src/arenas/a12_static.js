// =============================================================================
// THE STATIC — arena 12 (final)
//
// A world that is visibly failing to render itself. Fragments of every other
// arena hang in an absolute black void, wired together by impossible geometry.
// Bone-white substrate, cyan/magenta/green debug accents, everything emissive.
//
// -----------------------------------------------------------------------------
// CONNECTION GRAPH  (verified — every island reachable from spawn, no dead ends)
// -----------------------------------------------------------------------------
//
//                       ERROR ZONE (y42)
//                        |          \
//            (square helix stair)    \ (falling ribbon)
//                        |            \
//   BACKROOMS(y10) --- HUB(y14) ------- \--- VICTORIAN(y22)
//      |      \          |               \      |       \
//      |       \      (rings)             \     |        \
//      |        \        |                 \    |         \
//   WHITE(y22)   METRO(y2) --------------- SCIFI(y12)   CONTAINERS(y0)
//      |            |                        |              |
//      |         (stair, 90 turn)            |           DESERT(y16)
//      |            |                        |              |
//      +------- VICTORIAN                 SNOW(y26)      FOUNDRY(y-8)
//                                            |              |
//                                         TEMPLE(y6) -------+
//
// Edge list (15 routes, all bidirectional, all barriered on both sides):
//   hub-backrooms      doorframe bridge      y14 -> y10
//   hub-desert         ribbon of road        y14 -> y16
//   hub-scifi          tunnel of rings       y14 -> y12
//   hub-error          square helix stair    y14 -> y42   (ends above its start)
//   backrooms-metro    road, long interior   y10 -> y2
//   metro-victorian    switchback stair      y2  -> y22
//   victorian-cont     descending ribbon     y22 -> y0
//   cont-desert        grated ramp           y0  -> y16
//   desert-foundry     switchback            y16 -> y-8
//   foundry-temple     switchback            y-8 -> y6
//   temple-snow        sweeping ribbon       y6  -> y26
//   snow-scifi         switchback            y26 -> y12
//   scifi-white        ramp                  y12 -> y22
//   white-backrooms    long loop east        y22 -> y10
//   error-victorian    falling ribbon        y42 -> y22
//
// Spanning check from HUB: hub->{back, desert, scifi, error}; back->{metro,
// white}; metro->{vict}; vict->{cont}; cont->{desert}; desert->{found};
// found->{temple}; temple->{snow}; snow->{scifi}; scifi->{white}. All 12 nodes
// covered, with 4 extra cycles so the map never feels like a tree.
//
// SAFETY: every walkable surface in this arena — island decks, bridge decks and
// landing pads — is enclosed by a 2.4-4.0 m barrier. Barriers are either real
// walls (backrooms/victorian/scifi/white/temple) or an invisible collision box
// paired with a visible emissive "containment field" panel, which reads as a
// debug clip volume and is diegetic here. There is no way to walk off an edge.
// =============================================================================

import * as THREE from 'three';

export const meta = {
  id: 'static',
  name: 'THE STATIC',
  tagline: 'The city lies. This is where it admits it.',
  order: 12,
  difficulty: 5,
  biome: 'surreal',
  seed: 1212120,
  spawn: [0, 14, 12],
  bounds: 110,
  colors: ['#07070a', '#ff2fd0'],
  music: 'dread',
};

export async function build(ctx) {
  const T = ctx.THREE || THREE;
  const TAU = Math.PI * 2;
  const R = ctx.rng;

  // ===========================================================================
  // 0. ATMOSPHERE
  // ===========================================================================
  ctx.sky({ color: 0x000000 });
  ctx.fog(0x000000, 0.012, 0, 'exp2');
  ctx.useEnvironment(0.12);
  ctx.grade({
    exposure: 1.0, saturation: 1.25, contrast: 1.25,
    lift: [-0.01, -0.012, -0.006], gain: [1.02, 0.99, 1.06],
    bloom: 0.8, bloomRadius: 0.85, bloomThreshold: 0.62,
    scanline: 0.25, aberration: 0.004, grain: 0.07, vignette: 1.2,
  });
  ctx.soundscape('void', 'dread', { size: 1.0, dark: 0.7, wet: 0.45 });

  // ===========================================================================
  // 1. PALETTE + MATERIALS
  // ===========================================================================
  const CY = 0x2ff0ff, MG = 0xff2fd0, GN = 0x86ff3c, BONE = 0xc8ccc6;

  const MAT = {
    // substrate / structure
    bone: ctx.mat.surface('plaster', { color: 0x9aa09c, repeat: 4 }),
    strataA: ctx.mat.surface('rock', { color: 0x24262a, repeat: 2, size: 256 }),
    strataB: ctx.mat.surface('concrete', { color: 0x33343a, repeat: 2, size: 256 }),
    strataC: ctx.mat.surface('dirt', { color: 0x2a2622, repeat: 2, size: 256 }),
    asphalt: ctx.mat.surface('asphalt', { color: 0x25272c, repeat: 5 }),
    metalP: ctx.mat.surface('metalPanel', { color: 0x4c545c, repeat: 3 }),
    rust: ctx.mat.surface('rustMetal', { color: 0x453c34, repeat: 3 }),
    // fragment skins
    carpet: ctx.mat.surface('carpet', { color: 0xb59a4a, repeat: 12 }),
    plasterY: ctx.mat.surface('plaster', { color: 0xd9c98c, repeat: 4 }),
    ceilT: ctx.mat.surface('ceilingTile', { color: 0xe6e1d2, repeat: 8, size: 256 }),
    tileW: ctx.mat.surface('tile', { color: 0xd2d4cc, repeat: 10, tiles: 6, grout: 0x3c3e46 }),
    concrete: ctx.mat.surface('concrete', { color: 0x67686c, repeat: 5 }),
    wallpaper: ctx.mat.surface('wallpaper', { color: 0x2b3524, motif: 0x8f8352, repeat: 2, rep: 5 }),
    wood: ctx.mat.surface('wood', { color: 0x5b3f24, repeat: 4, planks: 8 }),
    sand: ctx.mat.surface('sand', { color: 0xc6a97a, repeat: 7, size: 256 }),
    marble: ctx.mat.surface('marble', { color: 0xcfccc2, vein: 0x49505e, repeat: 4 }),
    snow: ctx.mat.surface('snow', { color: 0xdde8f4, repeat: 6 }),
    hex: ctx.mat.surface('hexPanel', { color: 0x1b2330, line: 0x63d4ff, repeat: 3 }),
    hexIn: ctx.mat.surface('hexPanel', { color: 0x1b2330, line: 0x63d4ff, repeat: 3, side: T.BackSide }),
    brick: ctx.mat.surface('brick', { color: 0x4e3230, repeat: 3, size: 256 }),
    fabric: ctx.mat.surface('fabric', { color: 0x7d2c44, repeat: 2, size: 256 }),
    white: ctx.mat.surface('flat', { color: 0xf2f2f2, repeat: 1, rough: 0.95, size: 256 }),
    // untextured
    black: ctx.mat.solid({ color: 0x050506, roughness: 0.55, metalness: 0.1 }),
    dark: ctx.mat.solid({ color: 0x14161a, roughness: 0.8 }),
    steel: ctx.mat.metal(0x6e767e, 0.42),
    greybox: ctx.mat.solid({ color: 0xdcdcdc, roughness: 1, flat: true }),
    glassC: ctx.mat.glassCheap({ color: 0x6fd8ff, opacity: 0.18 }),
    water: ctx.mat.water({ color: 0x0d3a4a, opacity: 0.8, repeat: 6 }),
    // emissive accents
    eCy: ctx.mat.emissive(CY, 3.0),
    eMg: ctx.mat.emissive(MG, 3.0),
    eGn: ctx.mat.emissive(GN, 2.6),
    eWt: ctx.mat.emissive(0xffffff, 2.4),
    eOr: ctx.mat.emissive(0xff7a1a, 5.0),
    eRd: ctx.mat.emissive(0xff2a20, 3.2),
  };

  // The containment-field panel that fences every ledge.
  MAT.field = ctx.mat.painted(128, 128, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(24,150,190,0.055)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(70,235,255,0.5)'; c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const p = i * (W / 4);
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, H); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(W, p); c.stroke();
    }
    c.strokeStyle = 'rgba(255,60,210,0.30)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(W, H); c.stroke();
  }, {
    transparent: true, side: T.DoubleSide, alphaTest: 0.0, depthWrite: false,
    emissive: 0x28d8ff, emissiveIntensity: 1.3, roughness: 1,
  });
  MAT.field.map.wrapS = MAT.field.map.wrapT = T.RepeatWrapping;

  // Placeholder checkerboard (the unfinished room).
  MAT.checker = ctx.mat.painted(256, 256, (c, W, H) => {
    const n = 8, s = W / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      c.fillStyle = ((x + y) & 1) ? '#ff00d0' : '#101014';
      c.fillRect(x * s, y * s, s, s);
    }
    c.fillStyle = '#ffffff'; c.font = 'bold 26px monospace';
    c.textAlign = 'center'; c.fillText('NO TEXTURE', W / 2, H / 2 + 8);
  }, { transparent: false, emissive: 0x901878, emissiveIntensity: 0.55, roughness: 1 });

  // Void substrate grid.
  MAT.grid = ctx.mat.painted(256, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(48,220,255,0.85)'; c.lineWidth = 3;
    c.strokeRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,47,208,0.28)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = i * (W / 4);
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, H); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(W, p); c.stroke();
    }
  }, {
    transparent: true, side: T.DoubleSide, alphaTest: 0.0, depthWrite: false,
    emissive: 0x30dcff, emissiveIntensity: 1.9, roughness: 1,
  });
  MAT.grid.map.wrapS = MAT.grid.map.wrapT = T.RepeatWrapping;
  MAT.grid.map.repeat.set(64, 64);

  // Wireframe materials — "geometry that never finished loading".
  const WIRE = new Map();
  function wire(color, opacity = 0.8) {
    const k = color + '|' + opacity;
    if (!WIRE.has(k)) WIRE.set(k, new T.MeshBasicMaterial({
      color, wireframe: true, transparent: true, opacity,
      depthWrite: false, toneMapped: false,
    }));
    return WIRE.get(k);
  }
  MAT.wC = wire(CY, 0.75); MAT.wM = wire(MG, 0.7); MAT.wG = wire(GN, 0.55);
  MAT.wB = wire(BONE, 0.5);

  // ===========================================================================
  // 2. GENERIC HELPERS
  // ===========================================================================
  function hash01(n) {
    let h = Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  function scaleUV(g, su, sv) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
    return g;
  }
  /** Clone any object as unrendered wireframe. Shares geometry, never collides. */
  function wireify(obj, mtl) {
    const c = obj.clone(true);
    c.traverse(o => {
      if (o.isMesh) {
        o.material = mtl; o.castShadow = false; o.receiveShadow = false;
        o.userData.collide = false;
      }
    });
    return c;
  }

  // --- regions: batch geometry so the whole arena stays under ~250 draw calls
  const REGIONS = [];
  function newRegion(name) {
    const rg = { name, solid: new T.Group(), barr: new T.Group(), decor: new T.Group() };
    REGIONS.push(rg);
    return rg;
  }
  function commitAll() {
    for (const rg of REGIONS) {
      if (rg.solid.children.length) {
        const f = ctx.props.freeze(rg.solid);
        f.traverse(o => {
          if (o.isMesh) { o.userData.collide = true; o.castShadow = false; o.receiveShadow = true; }
        });
        ctx.add(f);
      }
      if (rg.barr.children.length) {
        const f = ctx.props.freeze(rg.barr);
        f.traverse(o => {
          if (o.isMesh) { o.userData.collide = true; o.visible = false; o.castShadow = false; }
        });
        ctx.add(f);
      }
      if (rg.decor.children.length) {
        const f = ctx.props.freeze(rg.decor);
        f.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
        ctx.addDecor(f);
        // Everything breathes — but only the DECOR shell moves, never the
        // collidable deck, because the octree is baked once after build().
        if (rg.breathe) drift(f, rg.breathe, 0.11 + REGIONS.indexOf(rg) * 0.017);
      }
    }
  }

  // --- animation registries -------------------------------------------------
  const GLITCH = [];   // meshes that jitter / snap on noise
  const FLIP = [];     // meshes whose material flips textured <-> wireframe
  const SPIN = [];     // { o, ax, sp }
  const DRIFT = [];    // { o, base, amp, sp, ph } — island breathing
  let gid = 0;

  function glitch(obj, o = {}) {
    GLITCH.push({
      o: obj, p: obj.position.clone(), r: obj.rotation.clone(),
      amp: o.amp ?? 0.07, rot: o.rot ?? 0.05, sp: o.speed ?? 1,
      ph: R() * 90, snap: o.snap ?? 0.03, id: ++gid,
    });
    return obj;
  }
  function flip(mesh, alt, rate = 5) {
    FLIP.push({ o: mesh, a: mesh.material, b: alt, rate, ph: R.int(0, 999) });
    return mesh;
  }
  function spin(obj, ax, sp) { SPIN.push({ o: obj, ax, sp }); return obj; }
  function drift(obj, amp, sp) {
    DRIFT.push({ o: obj, base: obj.position.clone(), amp, sp, ph: R() * TAU });
    return obj;
  }

  // ===========================================================================
  // 3. BARRIER / FENCE PRIMITIVES  — nothing walkable is left unfenced
  // ===========================================================================
  /**
   * One barrier piece between two XZ points.
   * opts.material -> a real, visible, collidable wall of that material.
   * otherwise     -> invisible collision box + emissive containment-field panel.
   */
  function fenceSeg(rg, x1, z1, x2, z2, baseY, h, opts = {}) {
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 0.16) return;
    const th = opts.thickness ?? 0.34;
    const yaw = -Math.atan2(z2 - z1, x2 - x1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    if (opts.material) {
      const w = ctx.props.boxC(L, h, th, opts.material, { shadow: false });
      w.position.set(cx, baseY + h / 2, cz); w.rotation.y = yaw;
      rg.solid.add(w);
      if (opts.trim !== false) {
        const t = ctx.props.boxC(L, 0.06, th + 0.06, MAT.eCy, { shadow: false, collide: false });
        t.position.set(cx, baseY + h - 0.03, cz); t.rotation.y = yaw;
        rg.decor.add(t);
      }
    } else {
      const b = ctx.props.boxC(L, h, th, MAT.dark, { shadow: false });
      b.position.set(cx, baseY + h / 2, cz); b.rotation.y = yaw;
      rg.barr.add(b);
      const g = scaleUV(new T.PlaneGeometry(L, h), L / 3, h / 3);
      const p = new T.Mesh(g, MAT.field);
      p.position.set(cx, baseY + h / 2, cz); p.rotation.y = yaw;
      p.userData.collide = false;
      rg.decor.add(p);
      // hot top rail so the ledge reads at a glance
      const rail = ctx.props.boxC(L, 0.07, 0.1, MAT.eMg, { shadow: false, collide: false });
      rail.position.set(cx, baseY + h * 0.42, cz); rail.rotation.y = yaw;
      rg.decor.add(rail);
    }
  }

  /** Fence a rectangle, leaving gaps ("doors") where routes attach. */
  function perimeter(rg, cx, cz, w, d, baseY, h, doors, opts = {}) {
    const sides = [
      { k: 'n', ax: cx - w / 2, az: cz - d / 2, bx: cx + w / 2, bz: cz - d / 2 },
      { k: 's', ax: cx - w / 2, az: cz + d / 2, bx: cx + w / 2, bz: cz + d / 2 },
      { k: 'w', ax: cx - w / 2, az: cz - d / 2, bx: cx - w / 2, bz: cz + d / 2 },
      { k: 'e', ax: cx + w / 2, az: cz - d / 2, bx: cx + w / 2, bz: cz + d / 2 },
    ];
    for (const s of sides) {
      if (opts.sides && opts.sides.indexOf(s.k) < 0) continue;
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const cuts = doors.filter(x => x.side === s.k)
        .map(x => ({
          lo: Math.max(0, x.at * len - x.width / 2),
          hi: Math.min(len, x.at * len + x.width / 2),
        }))
        .sort((p, q) => p.lo - q.lo);
      const P = (t) => [s.ax + (s.bx - s.ax) * (t / len), s.az + (s.bz - s.az) * (t / len)];
      let cur = 0;
      for (const c of cuts) {
        if (c.lo > cur) { const a = P(cur), b = P(c.lo); fenceSeg(rg, a[0], a[1], b[0], b[1], baseY, h, opts); }
        cur = Math.max(cur, c.hi);
      }
      if (cur < len) { const a = P(cur), b = P(len); fenceSeg(rg, a[0], a[1], b[0], b[1], baseY, h, opts); }
    }
  }

  /** Where does a ray from a rect's centre toward (tx,tz) leave the rect? */
  function rectPort(I, tx, tz) {
    const dx = tx - I.x, dz = tz - I.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    const t1 = Math.abs(ux) > 1e-6 ? (I.w / 2) / Math.abs(ux) : 1e9;
    const t2 = Math.abs(uz) > 1e-6 ? (I.d / 2) / Math.abs(uz) : 1e9;
    if (t1 < t2) {
      const z = I.z + uz * t1, sx = ux > 0 ? 1 : -1;
      return { side: sx > 0 ? 'e' : 'w', at: (z - (I.z - I.d / 2)) / I.d, x: I.x + sx * I.w / 2, z, nx: sx, nz: 0 };
    }
    const x = I.x + ux * t2, sz = uz > 0 ? 1 : -1;
    return { side: sz > 0 ? 's' : 'n', at: (x - (I.x - I.w / 2)) / I.w, x, z: I.z + sz * I.d / 2, nx: 0, nz: sz };
  }

  /** Fence a circle, leaving angular gaps. Used by the hub ring. */
  function arcFence(rg, cx, cz, r, baseY, h, gaps, opts = {}) {
    const norm = (a) => { while (a < 0) a += TAU; while (a >= TAU) a -= TAU; return a; };
    const gs = gaps.map(g => ({ a0: norm(g.ang - g.half), a1: norm(g.ang + g.half) }))
      .sort((p, q) => p.a0 - q.a0);
    const arcs = [];
    if (!gs.length) arcs.push([0, TAU]);
    else for (let i = 0; i < gs.length; i++) {
      const a = gs[i].a1, b = gs[(i + 1) % gs.length].a0;
      arcs.push([a, b < a ? b + TAU : b]);
    }
    for (const [a0, a1] of arcs) {
      const span = a1 - a0;
      if (span < 0.01) continue;
      const n = Math.max(1, Math.ceil((span * r) / 2.4));
      for (let i = 0; i < n; i++) {
        const b0 = a0 + (span * i) / n, b1 = a0 + (span * (i + 1)) / n;
        fenceSeg(rg, cx + Math.cos(b0) * r, cz + Math.sin(b0) * r,
          cx + Math.cos(b1) * r, cz + Math.sin(b1) * r, baseY, h, opts);
      }
    }
  }

  // ===========================================================================
  // 4. THE TORN UNDERSIDE — every island is a chunk ripped out of somewhere
  // ===========================================================================
  function strata(rg, cx, cy, cz, w, d, tag) {
    const r = R.fork('strata' + tag);
    let ww = w * 0.98, dd = d * 0.98, y = cy - 0.35;
    const skins = [MAT.strataB, MAT.strataA, MAT.strataC, MAT.strataA];
    for (let i = 0; i < 4; i++) {
      const th = r.range(0.8, 1.9) * (1 + i * 0.55);
      y -= th;
      const b = ctx.props.boxC(ww, th, dd, skins[i], { shadow: false });
      b.position.set(cx + r.gauss(0, 0.45), y + th / 2, cz + r.gauss(0, 0.45));
      b.rotation.y = r.gauss(0, 0.045);
      rg.decor.add(b);
      ww *= r.range(0.74, 0.9); dd *= r.range(0.74, 0.9);
    }
    // dangling shards + a wireframe ghost of what got torn away
    for (let i = 0; i < 7; i++) {
      const s = r.range(0.6, 2.2);
      const m = new T.Mesh(new T.IcosahedronGeometry(s, 0), r.chance(0.35) ? MAT.wC : MAT.strataA);
      m.position.set(cx + r.gauss(0, w * 0.38), y - r.range(0.5, 7), cz + r.gauss(0, d * 0.38));
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      m.scale.set(1, r.range(0.4, 1.1), 1);
      m.userData.collide = false;
      rg.decor.add(m);
    }
    const ghost = ctx.props.boxC(w * 1.02, 0.9, d * 1.02, MAT.wB, { shadow: false, collide: false });
    ghost.position.set(cx, cy - 0.45, cz);
    rg.decor.add(ghost);
  }

  // ===========================================================================
  // 5. BRIDGES — sloped decks with sealed sides, in six impossible flavours
  // ===========================================================================
  const RINGS = [];

  function deckMat(style) {
    if (style === 'road') return MAT.asphalt;
    if (style === 'grate') return MAT.rust;
    if (style === 'stair') return MAT.dark;
    if (style === 'doors') return MAT.bone;
    if (style === 'rings') return MAT.metalP;
    return MAT.concrete;
  }

  /** One straight sloped span from p0 to p1 (both are WALKING-SURFACE points). */
  function span(rg, p0, p1, W, style) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const hl = Math.hypot(dx, dz);
    if (hl < 0.01) return;
    const L = Math.hypot(hl, dy);
    const yaw = -Math.atan2(dz, dx), pitch = Math.atan2(dy, hl);
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    const mk = (parent) => {
      const a = new T.Group();
      a.position.set(mid[0], mid[1], mid[2]); a.rotation.y = yaw;
      const b = new T.Group(); b.rotation.z = pitch; a.add(b);
      parent.add(a);
      return { a, b };
    };
    const S = mk(style === 'stair' ? rg.barr : rg.solid);
    const B = mk(rg.barr);
    const D = mk(rg.decor);

    // deck
    const deck = ctx.props.boxC(L + 0.25, 0.36, W, deckMat(style), { shadow: false });
    deck.position.y = -0.18;
    S.b.add(deck);

    // sealed sides (overlap the landing pads by 0.4 at each end)
    for (const s of [-1, 1]) {
      const b = ctx.props.boxC(L + 0.8, 2.4, 0.3, MAT.dark, { shadow: false });
      b.position.set(0, 1.2, s * (W / 2 + 0.15));
      B.b.add(b);
      const g = scaleUV(new T.PlaneGeometry(L + 0.8, 2.4), (L + 0.8) / 3, 0.8);
      const p = new T.Mesh(g, MAT.field);
      p.position.set(0, 1.2, s * (W / 2 + 0.15));
      p.userData.collide = false;
      D.b.add(p);
      const rail = ctx.props.boxC(L + 0.8, 0.08, 0.11, s > 0 ? MAT.eCy : MAT.eMg, { shadow: false, collide: false });
      rail.position.set(0, 1.02, s * (W / 2 + 0.15));
      D.b.add(rail);
    }

    // --- per-style dressing -------------------------------------------------
    if (style === 'road') {
      const n = Math.max(1, Math.floor(L / 3));
      for (let i = 0; i < n; i++) {
        const m = ctx.props.boxC(1.5, 0.02, 0.16, MAT.eWt, { shadow: false, collide: false });
        m.position.set(-L / 2 + 1.5 + i * 3, 0.02, 0);
        D.b.add(m);
      }
    } else if (style === 'grate') {
      const n = Math.max(2, Math.floor(L / 1.7));
      for (let i = 0; i <= n; i++) {
        const g = ctx.props.girder(W + 0.5, MAT.steel, { scale: 0.8 });
        g.position.set(-L / 2 + (L * i) / n, -0.45, 0);
        g.rotation.y = Math.PI / 2;
        ctx.props.NOCOLLIDE(g);
        D.b.add(g);
      }
    } else if (style === 'doors') {
      const n = Math.max(2, Math.floor(L / 2.1));
      for (let i = 0; i <= n; i++) {
        const fr = new T.Group();
        const jl = ctx.props.boxC(0.16, 2.6, 0.2, MAT.bone, { shadow: false, collide: false });
        jl.position.set(0, 1.3, -W / 2 + 0.5);
        const jr = jl.clone(); jr.position.z = W / 2 - 0.5;
        const lt = ctx.props.boxC(0.16, 0.22, W - 0.8, MAT.bone, { shadow: false, collide: false });
        lt.position.set(0, 2.6, 0);
        fr.add(jl, jr, lt);
        fr.position.x = -L / 2 + (L * i) / n;
        D.b.add(fr);
        if (i % 3 === 0) {
          const lamp = ctx.props.boxC(0.1, 0.1, W - 0.9, i % 6 === 0 ? MAT.eMg : MAT.eCy,
            { shadow: false, collide: false });
          lamp.position.set(-L / 2 + (L * i) / n, 2.44, 0);
          D.b.add(lamp);
        }
      }
    } else if (style === 'rings') {
      // tunnel of counter-rotating rings — live, so it can't be frozen
      const n = Math.max(3, Math.floor(L / 2.4));
      const holder = new T.Group();
      holder.position.set(mid[0], mid[1], mid[2]);
      holder.rotation.y = yaw;
      const inner = new T.Group(); inner.rotation.z = pitch; holder.add(inner);
      for (let i = 0; i <= n; i++) {
        const rr = W * 0.62 + (i % 3) * 0.16;
        const ring = new T.Mesh(new T.TorusGeometry(rr, 0.09, 5, 22),
          i % 3 === 0 ? MAT.eMg : (i % 3 === 1 ? MAT.eCy : MAT.eGn));
        ring.rotation.y = Math.PI / 2;
        ring.position.set(-L / 2 + (L * i) / n, 1.05, 0);
        ring.userData.collide = false;
        inner.add(ring);
        RINGS.push({ o: ring, sp: (i % 2 ? 1 : -1) * (0.25 + (i % 5) * 0.11) });
      }
      ctx.addDecor(holder);
    } else if (style === 'stair') {
      // Real treads sit just under an invisible ramp through the step noses,
      // so the capsule glides while the eye reads stairs.
      const n = Math.max(2, Math.round(Math.max(Math.abs(dy) / 0.27, hl / 0.9)));
      const run = hl / n, rise = dy / n;
      for (let i = 0; i < n; i++) {
        const x1 = -hl / 2 + (i + 1) * run, y1 = -dy / 2 + (i + 1) * rise;
        const tr = ctx.props.boxC(run + 0.03, 0.14, W, MAT.bone, { shadow: false, collide: false });
        tr.position.set(x1 - run / 2, y1 - 0.07, 0);
        D.a.add(tr);
        const ri = ctx.props.boxC(0.09, Math.abs(rise) + 0.16, W, MAT.dark, { shadow: false, collide: false });
        ri.position.set(x1 - run, y1 - Math.abs(rise) / 2 - 0.08, 0);
        D.a.add(ri);
        if (i % 6 === 0) {
          const g = ctx.props.boxC(0.05, 0.05, W - 0.2, MAT.eGn, { shadow: false, collide: false });
          g.position.set(x1 - run * 0.5, y1 + 0.02, 0);
          D.a.add(g);
        }
      }
    }
  }

  /** Landing pad at a route corner, fenced except toward its two neighbours. */
  function pad(rg, p, W, prev, next, style) {
    const size = W + 0.6;
    const I = { x: p[0], z: p[2], w: size, d: size };
    const doors = [];
    for (const q of [prev, next]) {
      if (!q) continue;
      const t = rectPort(I, q[0], q[2]);
      doors.push({ side: t.side, at: t.at, width: W + 0.5 });
    }
    const deck = ctx.props.boxC(size, 0.36, size, deckMat(style), { shadow: false });
    deck.position.set(p[0], p[1] - 0.18, p[2]);
    rg.solid.add(deck);
    perimeter(rg, p[0], p[2], size, size, p[1] - 0.3, 2.7, doors);
    const post = ctx.props.boxC(0.12, 0.5, 0.12, MAT.eGn, { shadow: false, collide: false });
    post.position.set(p[0], p[1] + 2.5, p[2]);
    rg.decor.add(post);
  }

  /** Chain spans + pads along a polyline of walking-surface points. */
  function route(rg, pts, W, style) {
    for (let i = 0; i < pts.length - 1; i++) span(rg, pts[i], pts[i + 1], W, style);
    for (let i = 1; i < pts.length - 1; i++) pad(rg, pts[i], W, pts[i - 1], pts[i + 1], style);
  }

  /** Plain sloped slab, for interior ramps where there is nothing to fall off. */
  function slab(rg, p0, p1, w, mtl) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const hl = Math.hypot(dx, dz), L = Math.hypot(hl, dy);
    const a = new T.Group();
    a.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    a.rotation.y = -Math.atan2(dz, dx);
    const b = new T.Group(); b.rotation.z = Math.atan2(dy, hl); a.add(b);
    const s = ctx.props.boxC(L + 0.2, 0.34, w, mtl, { shadow: false });
    s.position.y = -0.17; b.add(s);
    rg.solid.add(a);
  }

  /** Deck + torn strata + perimeter fence for one fragment island. */
  function islandBase(rg, I, mtl, o = {}) {
    const deck = ctx.props.boxC(I.w, 0.7, I.d, mtl, { shadow: false });
    deck.position.set(I.x, I.y - 0.35, I.z);
    rg.solid.add(deck);
    strata(rg, I.x, I.y - 0.7, I.z, I.w, I.d, I.key);
    rg.breathe = o.breathe ?? 0.05;
    if (o.wall) {
      perimeter(rg, I.x, I.z, I.w, I.d, I.y, o.wallH ?? 3.3, I.doors,
        { material: o.wall, thickness: 0.36, sides: o.sides });
      if (o.sides) {
        const rest = ['n', 's', 'e', 'w'].filter(k => o.sides.indexOf(k) < 0);
        perimeter(rg, I.x, I.z, I.w, I.d, I.y - 1.6, 4.0, I.doors, { sides: rest });
      }
    } else {
      perimeter(rg, I.x, I.z, I.w, I.d, I.y - 1.6, o.fenceH ?? 4.0, I.doors);
    }
    return deck;
  }

  // ===========================================================================
  // 6. ISLAND TABLE + LINK TABLE
  // ===========================================================================
  const ISL = {
    hub: { disc: true, x: 0, z: 0, y: 14, r: 17, ri: 7 },
    back: { x: 54, z: 6, y: 10, w: 26, d: 26 },
    metro: { x: 44, z: 44, y: 2, w: 32, d: 16 },
    vict: { x: 6, z: 46, y: 22, w: 13, d: 12 },
    cont: { x: -30, z: 48, y: 0, w: 26, d: 22 },
    desert: { x: -52, z: 16, y: 16, w: 22, d: 20 },
    found: { x: -58, z: -26, y: -8, w: 34, d: 12 },
    templ: { x: -26, z: -48, y: 6, w: 24, d: 16 },
    snow: { x: 4, z: -52, y: 26, w: 22, d: 20 },
    scifi: { x: 38, z: -44, y: 12, w: 28, d: 14 },
    white: { x: 66, z: -14, y: 22, w: 18, d: 14 },
    error: { x: 26, z: 24, y: 42, w: 24, d: 24 },
  };
  for (const k in ISL) { ISL[k].key = k; ISL[k].doors = []; }

  // via points are absolute [x, y, z] walking-surface waypoints
  const LINKS = [
    { a: 'hub', b: 'back', W: 5.0, style: 'doors', via: [] },
    { a: 'hub', b: 'desert', W: 5.0, style: 'road', via: [[-30, 15, 9]] },
    { a: 'hub', b: 'scifi', W: 5.0, style: 'rings', via: [[22, 13, -26]] },
    {
      a: 'hub', b: 'error', W: 3.4, style: 'stair', via: [
        [13, 15, 24], [13, 18.4, 11], [39, 25.1, 11],
        [39, 31.9, 37], [13, 38.6, 37], [13, 42, 24]],
    },
    { a: 'back', b: 'metro', W: 4.5, style: 'road', via: [[52, 7, 26]] },
    {
      a: 'metro', b: 'vict', W: 3.6, style: 'stair', via: [
        [26, 7, 30], [16, 11, 29], [14, 15, 40], [24, 19, 44]],
    },
    {
      a: 'vict', b: 'cont', W: 4.0, style: 'road', via: [
        [-10, 18, 54], [-22, 15, 58], [-32, 12, 52], [-34, 8, 40], [-30, 4, 30]],
    },
    {
      a: 'cont', b: 'desert', W: 4.5, style: 'grate', via: [
        [-54, 4, 40], [-62, 8, 34], [-70, 12, 26], [-72, 16, 16]],
    },
    {
      a: 'desert', b: 'found', W: 4.0, style: 'grate', via: [
        [-42, 12, -2], [-52, 8, -8], [-42, 4, -14], [-50, 0, -22],
        [-34, -4, -26], [-32, -8, -14]],
    },
    {
      a: 'found', b: 'templ', W: 4.0, style: 'stair', via: [
        [-36, -3.5, -38], [-48, 1, -44], [-44, 5.5, -54]],
    },
    {
      a: 'templ', b: 'snow', W: 4.5, style: 'road', via: [
        [-16, 11, -64], [-6, 16, -70], [6, 21, -70], [16, 25, -68]],
    },
    {
      a: 'snow', b: 'scifi', W: 4.0, style: 'grate', via: [
        [24, 21, -60], [34, 16.5, -58], [24, 12, -60], [20, 12, -48]],
    },
    { a: 'scifi', b: 'white', W: 4.0, style: 'road', via: [[56, 16, -32], [66, 20, -30]] },
    { a: 'white', b: 'back', W: 4.0, style: 'road', via: [[84, 19, -20], [86, 15, -6]] },
    {
      a: 'error', b: 'vict', W: 3.8, style: 'road', via: [
        [19, 37, 47], [22, 32, 58], [11, 27, 61], [1, 23.5, 55]],
    },
  ];

  // --- resolve ports, register doors ----------------------------------------
  for (const L of LINKS) {
    const A = ISL[L.a], B = ISL[L.b];
    const first = L.via.length ? L.via[0] : [B.x, B.y, B.z];
    const last = L.via.length ? L.via[L.via.length - 1] : [A.x, A.y, A.z];
    const mkPort = (I, t) => {
      if (I.disc) {
        const ang = Math.atan2(t[2] - I.z, t[0] - I.x);
        I.doors.push({ ang, half: Math.asin(Math.min(0.9, (L.W / 2 + 0.4) / I.r)) });
        return { p: [I.x + Math.cos(ang) * I.r, I.y, I.z + Math.sin(ang) * I.r], ang };
      }
      const t2 = rectPort(I, t[0], t[2]);
      I.doors.push({ side: t2.side, at: t2.at, width: L.W + 0.5 });
      return { p: [t2.x - t2.nx * 1.2, I.y, t2.z - t2.nz * 1.2] };
    };
    L.pa = mkPort(A, first);
    L.pb = mkPort(B, last);
    L.pts = [L.pa.p, ...L.via, L.pb.p];
  }

  // ===========================================================================
  // 7. THE VOID SUBSTRATE — an unreachable grid receding into nothing
  // ===========================================================================
  {
    const g = scaleUV(new T.PlaneGeometry(520, 520), 1, 1);
    g.rotateX(-Math.PI / 2);
    const floor = new T.Mesh(g, MAT.grid);
    floor.position.y = -38;
    floor.userData.collide = false;
    floor.frustumCulled = false;
    ctx.addDecor(floor);

    const g2 = new T.PlaneGeometry(900, 900);
    g2.rotateX(-Math.PI / 2);
    const m2 = MAT.grid.clone();
    m2.map = MAT.grid.map.clone();
    m2.map.repeat.set(18, 18);
    m2.map.wrapS = m2.map.wrapT = T.RepeatWrapping;
    m2.map.needsUpdate = true;
    m2.emissiveMap = m2.map;
    m2.emissiveIntensity = 0.85;
    const deep = new T.Mesh(g2, m2);
    deep.position.y = -96;
    deep.userData.collide = false;
    deep.frustumCulled = false;
    ctx.addDecor(deep);
    ctx.onUpdate((dt, t) => {
      MAT.grid.map.offset.set(t * 0.004, t * 0.0025);
      m2.map.offset.set(-t * 0.0015, t * 0.001);
    });
  }

  // ===========================================================================
  // 8. LIGHTING — 15 real lights, 2 shadow casters, everything else emissive
  // ===========================================================================
  ctx.light(new T.AmbientLight(0x0a1018, 0.55));

  function stage(x, y, z, color, intensity, dist, shadow = false) {
    const s = new T.SpotLight(color, intensity, dist, Math.PI / 4.4, 0.55, 1.5);
    s.position.set(x, y, z);
    s.target.position.set(x, y - 20, z);
    ctx.light(s, { shadow, far: dist + 6 });
    return s;
  }
  function lamp(x, y, z, color, intensity, dist) {
    const p = new T.PointLight(color, intensity, dist, 1.8);
    p.position.set(x, y, z);
    ctx.light(p, { shadow: false });
    return p;
  }

  // ===========================================================================
  // 9. THE CENTRE — ring platform + the obelisk that scrolls glyphs
  // ===========================================================================
  const rgHub = newRegion('hub');
  {
    const H = ISL.hub;
    const ring = new T.Mesh(scaleUV(
      (() => { const g = new T.RingGeometry(H.ri, H.r, 60, 1); g.rotateX(-Math.PI / 2); return g; })(),
      7, 7), MAT.bone);
    ring.position.y = H.y;
    ring.userData.collide = true;
    rgHub.solid.add(ring);

    // a black skirt so the ring reads as a slab from below
    const skirt = new T.Mesh(new T.CylinderGeometry(H.r, H.r * 0.86, 2.2, 48, 1, true), MAT.black);
    skirt.position.y = H.y - 1.1;
    skirt.userData.collide = false;
    rgHub.decor.add(skirt);

    arcFence(rgHub, 0, 0, H.r, H.y - 1.6, 4.0, H.doors);
    arcFence(rgHub, 0, 0, H.ri, H.y - 1.6, 4.0, []);

    // 12 obsidian pylons, alternate ones only half-rendered
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.26;
      const px = Math.cos(a) * 14.4, pz = Math.sin(a) * 14.4;
      const py = ctx.props.boxC(0.7, 3.6, 0.7, i % 2 ? MAT.black : MAT.bone, { shadow: false });
      py.position.set(px, H.y + 1.8, pz); py.rotation.y = -a;
      rgHub.solid.add(py);
      const cap = ctx.props.boxC(0.9, 0.12, 0.9, i % 3 === 0 ? MAT.eMg : MAT.eCy,
        { shadow: false, collide: false });
      cap.position.set(px, H.y + 3.7, pz); cap.rotation.y = -a;
      rgHub.decor.add(cap);
      if (i % 2) {
        const gh = wireify(py, MAT.wM);
        gh.position.y += 4.2; gh.scale.setScalar(1.02);
        rgHub.decor.add(gh);
      }
      if (i % 6 === 0) ctx.hidingSpot(px * 1.06, H.y, pz * 1.06, 1.2, 0.55);
    }

    // inner lip: a bright edge around the hole you must not fall into
    const lip = new T.Mesh(
      (() => { const g = new T.RingGeometry(H.ri - 0.35, H.ri + 0.05, 48, 1); g.rotateX(-Math.PI / 2); return g; })(),
      MAT.eCy);
    lip.position.y = H.y + 0.03; lip.userData.collide = false;
    rgHub.decor.add(lip);

    // --- the obelisk ------------------------------------------------------
    MAT.glyph = ctx.mat.painted(256, 512, (c, W, Hh) => {
      c.fillStyle = '#000000'; c.fillRect(0, 0, W, Hh);
      const gr = ctx.rng.fork('glyph0');
      c.font = 'bold 22px monospace'; c.textAlign = 'center';
      const chars = '01<>/\\|[]{}#*+=-_ABCDEF0x?!';
      for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 24; row++) {
          const v = gr();
          c.fillStyle = v > 0.86 ? 'rgba(255,47,208,0.95)'
            : v > 0.55 ? 'rgba(60,240,255,0.85)' : 'rgba(60,240,255,0.22)';
          c.fillText(chars[Math.floor(gr() * chars.length)], col * 32 + 16, row * 21.5 + 18);
        }
      }
    }, { transparent: false, emissive: 0x4ad8ff, emissiveIntensity: 1.7, roughness: 1 });
    MAT.glyph.map.wrapS = MAT.glyph.map.wrapT = T.RepeatWrapping;
    MAT.glyph.map.repeat.set(1, 3);

    const obelisk = new T.Group();
    const core = ctx.props.boxC(4.2, 26, 4.2, MAT.black, { shadow: false, collide: false });
    obelisk.add(core);
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const face = new T.Mesh(scaleUV(new T.PlaneGeometry(3.9, 25), 1, 1), MAT.glyph);
      face.position.set(ax * 2.13, 0, az * 2.13);
      face.rotation.y = ax ? (ax > 0 ? Math.PI / 2 : -Math.PI / 2) : (az > 0 ? 0 : Math.PI);
      face.userData.collide = false;
      obelisk.add(face);
    }
    const tip = new T.Mesh(new T.ConeGeometry(3.0, 3.4, 4), MAT.black);
    tip.position.y = 14.7; tip.rotation.y = Math.PI / 4; tip.userData.collide = false;
    obelisk.add(tip);
    const halo = new T.Mesh(new T.TorusGeometry(6.2, 0.11, 6, 40), MAT.eMg);
    halo.rotation.x = Math.PI / 2; halo.position.y = -6; halo.userData.collide = false;
    obelisk.add(halo);
    obelisk.position.set(0, 30, 0);
    ctx.addDecor(obelisk);
    spin(halo, 'z', 0.12);

    // the beam it stands in, falling forever
    const beam = new T.Mesh(new T.CylinderGeometry(1.5, 5.5, 120, 14, 1, true),
      ctx.mat.emissive(CY, 0.5, { transparent: true, opacity: 0.055, side: T.DoubleSide }));
    beam.position.set(0, -42, 0); beam.userData.collide = false;
    ctx.addDecor(beam);

    stage(0, 47, 0, 0xffffff, 95, 62, true);
    lamp(0, 20, 0, MG, 14, 26);

    ctx.onUpdate((dt, t) => {
      MAT.glyph.map.offset.y -= dt * 0.05;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.55);
      MAT.glyph.emissiveIntensity = 1.1 + pulse * 1.5;
      obelisk.scale.setScalar(1 + Math.sin(t * 0.55) * 0.012);
      obelisk.position.y = 30 + Math.sin(t * 0.31) * 0.6;
      obelisk.rotation.y = Math.sin(t * 0.07) * 0.09;
    });

    // signage
    const s1 = ctx.props.sign('THE CITY LIES', {
      background: 0x0a0a0c, color: 0xff2fd0, emissive: 0xff2fd0, height: 0.95, fontSize: 110,
    });
    s1.position.set(0, H.y + 3.1, 15.6); s1.rotation.y = Math.PI;
    ctx.addDecor(s1);
    const s2 = ctx.props.sign('ARENA 12 / ??\nSIGNAL LOST', {
      background: 0x0a0a0c, color: 0x86ff3c, emissive: 0x86ff3c, height: 1.5, fontSize: 84,
    });
    s2.position.set(-11.4, H.y + 3.0, -11.4); s2.rotation.y = Math.PI * 0.75;
    ctx.addDecor(s2);
    glitch(s2, { amp: 0.11, rot: 0.03, snap: 0.06, speed: 1.7 });

    ctx.pickup(-9, H.y + 1, 9, 'coin');
    ctx.pickup(9, H.y + 1, -9, 'coin');
    ctx.pickup(-13, H.y + 1, -4, 'coin');
    ctx.hidingSpot(0, H.y, 15.5, 1.6, 0.5);
  }

  // ===========================================================================
  // 10. FRAGMENT 1 — BACKROOMS CORRIDOR THAT LOOPS BACK ON ITSELF
  // ===========================================================================
  {
    const I = ISL.back, rg = newRegion('back');
    islandBase(rg, I, MAT.carpet, { wall: MAT.plasterY, wallH: 3.3 });

    // the inner block: the corridor is a closed 3.4 m ring around it
    const b = 9.6;
    const cor = [
      [I.x - b, I.z - b, I.x + b, I.z - b], [I.x - b, I.z + b, I.x + b, I.z + b],
      [I.x - b, I.z - b, I.x - b, I.z + b], [I.x + b, I.z - b, I.x + b, I.z + b],
    ];
    for (const [x1, z1, x2, z2] of cor) {
      fenceSeg(rg, x1, z1, x2, z2, I.y, 3.3, { material: MAT.plasterY, thickness: 0.3, trim: false });
    }
    const inner = ctx.props.boxC(b * 2, 3.3, b * 2, MAT.plasterY, { shadow: false, collide: false });
    inner.position.set(I.x, I.y + 1.65, I.z);
    rg.decor.add(inner);
    const ghost = wireify(inner, MAT.wM);
    ghost.position.set(I.x, I.y + 5.6, I.z);
    ghost.scale.set(1.01, 1.01, 1.01);
    rg.decor.add(ghost);

    // suspended ceiling + skirting, the two things that sell a Backroom
    const ceil = ctx.props.boxC(I.w, 0.2, I.d, MAT.ceilT, { shadow: false, collide: false });
    ceil.position.set(I.x, I.y + 3.4, I.z);
    rg.decor.add(ceil);
    for (const [x1, z1, x2, z2] of cor) {
      const sk = ctx.props.boxC(Math.hypot(x2 - x1, z2 - z1), 0.16, 0.36, MAT.dark,
        { shadow: false, collide: false });
      sk.position.set((x1 + x2) / 2, I.y + 0.08, (z1 + z2) / 2);
      sk.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      rg.decor.add(sk);
    }

    // fluorescents around the loop, every one of them buzzing
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * 4;
      const side = Math.floor(t), f = (t % 1) * 2 - 1;
      const r = 11.3;
      const px = I.x + (side === 0 ? f * r : side === 1 ? r : side === 2 ? -f * r : -r);
      const pz = I.z + (side === 0 ? -r : side === 1 ? f * r : side === 2 ? r : -f * r);
      const fl = ctx.props.fluorescent(2.0, { color: 0xfff2c8, intensity: 3.4 });
      fl.position.set(px, I.y + 3.22, pz);
      fl.rotation.y = (side % 2) ? Math.PI / 2 : 0;
      ctx.props.NOCOLLIDE(fl);
      rg.decor.add(fl);
    }
    lamp(I.x - 11.3, I.y + 2.6, I.z, 0xffe9b0, 9, 15);
    lamp(I.x + 11.3, I.y + 2.6, I.z, 0xffe9b0, 9, 15);

    // doors in the inner wall that open onto solid plaster
    for (const [dx, dz, ry] of [[0, -b, 0], [b, 0, -Math.PI / 2], [-2, b, Math.PI]]) {
      const dr = ctx.props.door(1.0, 2.1, MAT.wood, MAT.bone);
      dr.position.set(I.x + dx, I.y, I.z + dz); dr.rotation.y = ry;
      ctx.props.NOCOLLIDE(dr);
      rg.decor.add(dr);
    }
    const s = ctx.props.sign('NO DATA', {
      background: 0x141008, color: 0x86ff3c, emissive: 0x86ff3c, height: 0.5,
    });
    s.position.set(I.x - 6, I.y + 2.4, I.z - b + 0.2);
    rg.decor.add(s);

    for (const [cx, cz] of [[-11.3, -11.3], [11.3, -11.3], [11.3, 11.3], [-11.3, 11.3]]) {
      ctx.hidingSpot(I.x + cx, I.y, I.z + cz, 1.5, 0.95);
    }
    ctx.pickup(I.x - 11.3, I.y + 1, I.z - 6, 'coin');
    ctx.pickup(I.x + 11.3, I.y + 1, I.z + 6, 'coin');
    ctx.pickup(I.x + 4, I.y + 1, I.z - 11.3, 'coin');
    ctx.pickup(I.x - 4, I.y + 1, I.z + 11.3, 'coin');
    ctx.pickup(I.x + 11.3, I.y + 1, I.z - 11.3, 'coin');
    ctx.pickup(I.x - 11.3, I.y + 1, I.z + 11.3, 'powerup:ghost');
  }

  // ===========================================================================
  // 11. FRAGMENT 2 — METRO PLATFORM, TRAIN HALF-MATERIALISED
  // ===========================================================================
  {
    const I = ISL.metro, rg = newRegion('metro');
    strata(rg, I.x, I.y - 0.7, I.z, I.w, I.d, I.key);
    rg.breathe = 0.05;
    perimeter(rg, I.x, I.z, I.w, I.d, I.y - 1.6, 5.5, I.doors);

    // platform (south 10.5 m) + track trench (north 5.5 m, 0.9 m lower)
    const plat = ctx.props.boxC(I.w, 0.7, 10.5, MAT.tileW, { shadow: false });
    plat.position.set(I.x, I.y - 0.35, I.z + 2.75);
    rg.solid.add(plat);
    const trench = ctx.props.boxC(I.w, 0.7, 5.5, MAT.concrete, { shadow: false });
    trench.position.set(I.x, I.y - 1.25, I.z - 5.25);
    rg.solid.add(trench);
    slab(rg, [I.x + 13, I.y - 0.9, I.z - 6.5], [I.x + 13, I.y, I.z - 2.6], 2.6, MAT.concrete);
    const nose = ctx.props.boxC(I.w, 0.1, 0.5, MAT.eWt, { shadow: false, collide: false });
    nose.position.set(I.x, I.y + 0.02, I.z - 2.5);
    rg.decor.add(nose);

    for (const dz of [-1.0, 1.0]) {
      const rail = ctx.props.boxC(28, 0.12, 0.12, MAT.steel, { shadow: false, collide: false });
      rail.position.set(I.x, I.y - 0.82, I.z - 5.25 + dz);
      rg.decor.add(rail);
    }

    // the train: front half solid, rear half never finished loading
    const train = new T.Group();
    const body = ctx.props.boxC(13, 3.2, 3.0, MAT.metalP, { shadow: false });
    body.position.set(-6.5, 1.6, 0);
    train.add(body);
    for (let i = 0; i < 5; i++) {
      const w = ctx.props.boxC(1.5, 0.9, 3.06, MAT.eCy, { shadow: false, collide: false });
      w.position.set(-12 + i * 2.5, 2.1, 0);
      train.add(w);
    }
    const cab = ctx.props.boxC(0.3, 1.1, 2.6, MAT.eWt, { shadow: false, collide: false });
    cab.position.set(-13.1, 2.0, 0);
    train.add(cab);
    train.position.set(I.x + 5, I.y - 1.6, I.z - 5.25);
    rg.solid.add(train);
    const rear = wireify(body, MAT.wC);
    rear.position.set(I.x + 5 + 6.5, I.y, I.z - 5.25);
    rg.decor.add(rear);
    const rear2 = wireify(body, MAT.wM);
    rear2.position.set(I.x + 5 + 19, I.y, I.z - 5.25);
    rg.decor.add(rear2);

    // platform furniture + canopy
    const canopy = ctx.props.boxC(26, 0.25, 8, MAT.metalP, { shadow: false, collide: false });
    canopy.position.set(I.x, I.y + 4.0, I.z + 3.4);
    rg.decor.add(canopy);
    for (let i = 0; i < 5; i++) {
      const col = ctx.props.boxC(0.34, 4.0, 0.34, MAT.steel, { shadow: false });
      col.position.set(I.x - 11 + i * 5.5, I.y + 2, I.z + 6.6);
      rg.solid.add(col);
      const strip = ctx.props.boxC(5.2, 0.08, 0.3, MAT.eWt, { shadow: false, collide: false });
      strip.position.set(I.x - 11 + i * 5.5 + 2.7, I.y + 3.82, I.z + 2.0);
      rg.decor.add(strip);
    }
    for (let i = 0; i < 4; i++) {
      const bench = ctx.props.boxC(2.2, 0.12, 0.6, MAT.wood, { shadow: false });
      bench.position.set(I.x - 10 + i * 7, I.y + 0.48, I.z + 6.0);
      rg.solid.add(bench);
      const leg = ctx.props.boxC(2.0, 0.42, 0.12, MAT.steel, { shadow: false, collide: false });
      leg.position.set(I.x - 10 + i * 7, I.y + 0.21, I.z + 6.0);
      rg.decor.add(leg);
      if (i % 2 === 0) ctx.hidingSpot(I.x - 10 + i * 7, I.y, I.z + 6.9, 1.1, 0.6);
    }
    const s = ctx.props.sign('0x00000000', {
      background: 0x08131b, color: 0x2ff0ff, emissive: 0x2ff0ff, height: 0.62,
    });
    s.position.set(I.x - 4, I.y + 3.2, I.z + 7.3); s.rotation.y = Math.PI;
    rg.decor.add(s);
    lamp(I.x - 8, I.y + 3.4, I.z + 3, 0xbfe6ff, 10, 18);

    ctx.pickup(I.x - 13, I.y + 1, I.z + 4, 'coin');
    ctx.pickup(I.x + 2, I.y + 1, I.z + 4, 'coin');
    ctx.pickup(I.x + 12, I.y + 1, I.z + 7, 'coin');
    ctx.pickup(I.x - 8, I.y - 0.9 + 1, I.z - 5.25, 'coin');
    ctx.pickup(I.x + 12, I.y - 0.9 + 1, I.z - 5.25, 'battery');
    ctx.hidingSpot(I.x - 9, I.y - 0.9, I.z - 5.25, 1.8, 1.0);
  }

  // ===========================================================================
  // 12. FRAGMENT 3 — A VICTORIAN ROOM WITH ITS FOURTH WALL MISSING
  // ===========================================================================
  {
    const I = ISL.vict, rg = newRegion('vict');
    islandBase(rg, I, MAT.wood, { wall: MAT.wallpaper, wallH: 3.6, sides: ['n', 'e', 'w'] });

    const ceil = ctx.props.boxC(I.w, 0.24, I.d, MAT.plasterY, { shadow: false, collide: false });
    ceil.position.set(I.x, I.y + 3.7, I.z);
    rg.decor.add(ceil);
    for (const [x1, z1, x2, z2] of [
      [I.x - 6.5, I.z - 6, I.x + 6.5, I.z - 6], [I.x - 6.5, I.z - 6, I.x - 6.5, I.z + 6],
      [I.x + 6.5, I.z - 6, I.x + 6.5, I.z + 6]]) {
      const c = ctx.props.boxC(Math.hypot(x2 - x1, z2 - z1), 0.22, 0.3, MAT.plasterY,
        { shadow: false, collide: false });
      c.position.set((x1 + x2) / 2, I.y + 3.45, (z1 + z2) / 2);
      c.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      rg.decor.add(c);
    }
    // fireplace
    const fp = ctx.props.boxC(2.2, 1.5, 0.5, MAT.brick, { shadow: false });
    fp.position.set(I.x - 2, I.y + 0.75, I.z - 5.7);
    rg.solid.add(fp);
    const fire = ctx.props.boxC(1.1, 0.7, 0.16, MAT.eOr, { shadow: false, collide: false });
    fire.position.set(I.x - 2, I.y + 0.5, I.z - 5.4);
    rg.decor.add(fire);
    lamp(I.x - 2, I.y + 0.9, I.z - 5, 0xff8a30, 6, 9);
    // rug + furniture
    const rug = ctx.props.boxC(5, 0.03, 4, MAT.fabric, { shadow: false, collide: false });
    rug.position.set(I.x, I.y + 0.02, I.z + 0.5);
    rg.decor.add(rug);
    const tbl = ctx.props.table(1.7, 0.76, 0.9, MAT.wood);
    tbl.position.set(I.x, I.y, I.z + 0.5);
    rg.solid.add(tbl);
    for (const [dx, dz, ry] of [[-1.4, 0.5, 1.4], [1.4, 0.5, -1.4], [0, -1.4, 0]]) {
      const ch = ctx.props.chair(MAT.wood);
      ch.position.set(I.x + dx, I.y, I.z + dz); ch.rotation.y = ry;
      rg.solid.add(ch);
    }
    const bs = ctx.props.bookshelf(1.6, 2.4, 0.34, 12);
    bs.position.set(I.x + 5.4, I.y, I.z + 2.5); bs.rotation.y = -Math.PI / 2;
    rg.solid.add(bs);
    ctx.hidingSpot(I.x + 4.6, I.y, I.z + 2.5, 1.1, 0.9);
    // portraits — one of them is a magenta wireframe of a face that isn't there
    for (let i = 0; i < 3; i++) {
      const p = ctx.props.boxC(0.9, 1.2, 0.06, i === 1 ? MAT.checker : MAT.wood,
        { shadow: false, collide: false });
      p.position.set(I.x - 4 + i * 3.5, I.y + 2.2, I.z - 5.7);
      rg.decor.add(p);
    }
    // chandelier (live — it swings)
    const chand = new T.Group();
    const cord = ctx.props.boxC(0.04, 1.0, 0.04, MAT.dark, { shadow: false, collide: false });
    cord.position.y = -0.5; chand.add(cord);
    const hoop = new T.Mesh(new T.TorusGeometry(0.55, 0.035, 5, 20), ctx.mat.metal(0xb9a06a, 0.3));
    hoop.rotation.x = Math.PI / 2; hoop.position.y = -1.05; hoop.userData.collide = false;
    chand.add(hoop);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const bulb = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), MAT.eWt);
      bulb.position.set(Math.cos(a) * 0.55, -0.95, Math.sin(a) * 0.55);
      bulb.userData.collide = false;
      chand.add(bulb);
    }
    chand.position.set(I.x, I.y + 3.5, I.z + 0.5);
    ctx.addDecor(chand);
    lamp(I.x, I.y + 2.5, I.z + 0.5, 0xffd9a0, 10, 12);
    ctx.onUpdate((dt, t) => { chand.rotation.z = Math.sin(t * 0.8) * 0.05; chand.rotation.x = Math.cos(t * 0.63) * 0.04; });

    // the wall that keeps forgetting it exists
    const flick = ctx.props.boxC(0.1, 3.4, 11.6, MAT.wallpaper, { shadow: false, collide: false });
    flick.position.set(I.x - 6.45, I.y + 1.7, I.z);
    ctx.addDecor(flick);
    flip(flick, MAT.wM, 3.5);

    ctx.pickup(I.x - 4, I.y + 1, I.z + 4, 'coin');
    ctx.pickup(I.x + 4.5, I.y + 1, I.z - 4, 'coin');
    ctx.pickup(I.x, I.y + 1.1, I.z + 0.5, 'coin');
    ctx.hidingSpot(I.x, I.y, I.z + 0.5, 1.2, 0.7);
  }

  // ===========================================================================
  // 13. FRAGMENT 4 — CONTAINER STACK, HALF OF IT ONLY EDGES
  // ===========================================================================
  {
    const I = ISL.cont, rg = newRegion('cont');
    // 9 m fence: the stacks are climbable and the void is one jump away
    islandBase(rg, I, MAT.asphalt, { fenceH: 9.0 });
    const r = R.fork('cont');

    const solidSpots = [
      [-8, -6, 0, 0], [-8, -6, 2.59, 0.02], [-8, 1, 0, Math.PI / 2],
      [4, -5, 0, 0], [4, -5, 2.59, -0.03], [7, 4, 0, 0.1],
    ];
    for (let i = 0; i < solidSpots.length; i++) {
      const [dx, dz, dy, ry] = solidSpots[i];
      const c = ctx.props.container(6.06, i % 2 ? 0x2f6f8f : 0x8a3a2a, 20 + (i % 2));
      c.position.set(I.x + dx, I.y + dy, I.z + dz);
      c.rotation.y = ry;
      rg.solid.add(c);
      if (dy === 0 && i % 2 === 0) ctx.hidingSpot(I.x + dx, I.y, I.z + dz + 1.8, 1.4, 0.85);
    }
    // ghost stack — you can walk straight through geometry that never arrived
    const proto = ctx.props.container(6.06, 0x2f6f8f, 20);
    for (const [dx, dz, dy, ry] of [
      [-8, -6, 5.18, 0.05], [4, -5, 5.18, 0], [7, 4, 2.59, 0.08],
      [-6, 7, 0, 0.4], [-6, 7, 2.59, 0.36], [6, -9, 0, -0.2], [-1, 8, 0, 1.55]]) {
      const g = wireify(proto, r.chance(0.5) ? MAT.wC : MAT.wM);
      g.position.set(I.x + dx, I.y + dy, I.z + dz);
      g.rotation.y = ry;
      rg.decor.add(g);
    }
    // stairs onto the two-high stack
    slab(rg, [I.x - 1.6, I.y, I.z - 6], [I.x - 4.2, I.y + 2.59, I.z - 6], 1.6, MAT.steel);
    slab(rg, [I.x - 8, I.y + 2.59, I.z - 2.6], [I.x - 8, I.y + 5.18, I.z - 4.4], 1.6, MAT.steel);
    // gantry crane
    const gird = ctx.props.girder(26, MAT.steel, { scale: 3.4 });
    gird.position.set(I.x, I.y + 10.5, I.z - 2);
    ctx.props.NOCOLLIDE(gird);
    rg.decor.add(gird);
    for (const sx of [-11, 11]) {
      const leg = ctx.props.boxC(0.5, 10.5, 0.5, MAT.steel, { shadow: false });
      leg.position.set(I.x + sx, I.y + 5.25, I.z - 2);
      rg.solid.add(leg);
    }
    const hook = ctx.props.boxC(0.5, 2.4, 0.5, MAT.steel, { shadow: false, collide: false });
    hook.position.set(I.x + 2, I.y + 9, I.z - 2);
    ctx.addDecor(hook);
    ctx.onUpdate((dt, t) => { hook.position.x = I.x + Math.sin(t * 0.24) * 8; });
    for (let i = 0; i < 4; i++) {
      const bl = ctx.props.boxC(0.4, 0.1, 0.4, i % 2 ? MAT.eRd : MAT.eGn, { shadow: false, collide: false });
      bl.position.set(I.x - 10 + i * 7, I.y + 10.2, I.z - 2);
      rg.decor.add(bl);
    }
    for (let i = 0; i < 6; i++) {
      const br = ctx.props.barrel(0.34, 0.9, MAT.rust);
      br.position.set(I.x + r.range(-11, 11), I.y, I.z + r.range(-9, 9));
      rg.solid.add(br);
    }
    lamp(I.x - 6, I.y + 6, I.z, 0xbfd0e0, 12, 22);

    ctx.pickup(I.x - 8, I.y + 5.18 + 1, I.z - 6, 'coin');
    ctx.pickup(I.x + 4, I.y + 2.59 + 1, I.z - 5, 'coin');
    ctx.pickup(I.x - 11, I.y + 1, I.z + 9, 'coin');
    ctx.pickup(I.x + 11, I.y + 1, I.z - 9, 'coin');
    ctx.pickup(I.x + 0, I.y + 1, I.z + 4, 'coin');
    ctx.pickup(I.x - 11, I.y + 1, I.z - 9, 'battery');
    ctx.pickup(I.x + 10, I.y + 1, I.z + 8, 'powerup:dash');
    ctx.hidingSpot(I.x + 2, I.y, I.z - 8.5, 1.5, 0.9);
  }

  // ===========================================================================
  // 14. FRAGMENT 5 — DESERT ROOFTOP, SAND POURING OFF THE BROKEN EDGE
  // ===========================================================================
  {
    const I = ISL.desert, rg = newRegion('desert');
    islandBase(rg, I, MAT.concrete, { fenceH: 5.4 });
    // low parapet under the containment field
    perimeter(rg, I.x, I.z, I.w, I.d, I.y, 1.05, I.doors,
      { material: MAT.brick, thickness: 0.3, trim: false });
    const r = R.fork('desert');

    const dune = ctx.props.boxC(I.w - 1.4, 0.14, I.d - 1.4, MAT.sand, { shadow: false, collide: false });
    dune.position.set(I.x, I.y + 0.07, I.z);
    rg.decor.add(dune);

    // stair bulkhead — a door to a stairwell that no longer has a building
    const bulk = ctx.props.boxC(3.2, 2.6, 2.6, MAT.brick, { shadow: false });
    bulk.position.set(I.x - 6, I.y + 1.3, I.z - 6);
    rg.solid.add(bulk);
    const bdoor = ctx.props.door(1.0, 2.05, MAT.wood, MAT.steel);
    bdoor.position.set(I.x - 6, I.y, I.z - 4.65);
    ctx.props.NOCOLLIDE(bdoor);
    rg.decor.add(bdoor);
    ctx.hidingSpot(I.x - 6, I.y, I.z - 4.2, 1.3, 0.8);

    for (let i = 0; i < 3; i++) {
      const ac = ctx.props.acUnit(1.2, 0.95, 1.2);
      ac.position.set(I.x + 4 + i * 2.6, I.y, I.z - 7 + i * 1.4);
      rg.solid.add(ac);
    }
    // laundry: three lines of cloth, still drying in a place with no wind
    for (let l = 0; l < 3; l++) {
      const z0 = I.z - 2 + l * 3.4;
      const line = ctx.props.boxC(16, 0.03, 0.03, MAT.dark, { shadow: false, collide: false });
      line.position.set(I.x, I.y + 2.4, z0);
      rg.decor.add(line);
      for (let i = 0; i < 6; i++) {
        const w = r.range(0.5, 1.0), h = r.range(0.7, 1.3);
        const cloth = ctx.props.boxC(w, h, 0.02,
          r.chance(0.3) ? MAT.wG : MAT.fabric, { shadow: false, collide: false });
        cloth.position.set(I.x - 7 + i * 2.7 + r.gauss(0, 0.2), I.y + 2.4 - h / 2, z0);
        cloth.rotation.y = r.gauss(0, 0.15);
        rg.decor.add(cloth);
      }
      for (const sx of [-8, 8]) {
        const post = ctx.props.boxC(0.1, 2.5, 0.1, MAT.steel, { shadow: false });
        post.position.set(I.x + sx, I.y + 1.25, z0);
        rg.solid.add(post);
      }
    }
    const dish = new T.Mesh(new T.SphereGeometry(1.1, 14, 8, 0, TAU, 0, Math.PI / 2.6), MAT.bone);
    dish.rotation.set(-1.0, 0.6, 0); dish.position.set(I.x + 8, I.y + 2.2, I.z + 7);
    dish.userData.collide = false;
    rg.decor.add(dish);
    lamp(I.x, I.y + 3.4, I.z, 0xffcf90, 10, 20);
    const s = ctx.props.sign('SIGNAL LOST', {
      background: 0x160d06, color: 0xff7a1a, emissive: 0xff7a1a, height: 0.55,
    });
    s.position.set(I.x - 6, I.y + 2.9, I.z - 4.6);
    rg.decor.add(s);

    // sand falling off the south lip, forever
    const grain = new T.BoxGeometry(0.09, 0.09, 0.09);
    const fall = ctx.props.scatter(grain, ctx.mat.emissive(0xd8b57a, 0.9), 520, (i, d, rr) => {
      d.position.set(I.x + rr.range(-9, 9), rr.range(-26, 0), I.z + 9.6 + rr.range(-0.7, 0.7));
      d.scale.setScalar(rr.range(0.6, 1.8));
    }, 77);
    const fallG = new T.Group(); fallG.add(fall);
    ctx.addDecor(fallG);
    ctx.onUpdate((dt, t) => { fallG.position.y = I.y - ((t * 5.5) % 26); });

    ctx.pickup(I.x - 8, I.y + 1, I.z + 7, 'coin');
    ctx.pickup(I.x + 8, I.y + 1, I.z - 7, 'coin');
    ctx.pickup(I.x, I.y + 1, I.z + 8, 'coin');
    ctx.pickup(I.x + 6.5, I.y + 1, I.z + 2, 'coin');
    ctx.hidingSpot(I.x + 5.5, I.y, I.z - 6, 1.4, 0.85);
  }

  // ===========================================================================
  // 15. FRAGMENT 6 — FOUNDRY CATWALK, ORANGE AT ONE END, UNDRAWN AT THE OTHER
  // ===========================================================================
  {
    const I = ISL.found, rg = newRegion('found');
    strata(rg, I.x, I.y - 0.7, I.z, I.w, I.d, I.key);
    rg.breathe = 0.06;
    perimeter(rg, I.x, I.z, I.w, I.d, I.y - 1.6, 6.0, I.doors);

    // west 24 m of real grating, east 10 m rendered as edges only — and still
    // solid, so the player walks on floor that is not being drawn.
    const west = ctx.props.boxC(24, 0.7, I.d, MAT.rust, { shadow: false });
    west.position.set(I.x - 5, I.y - 0.35, I.z);
    rg.solid.add(west);
    const east = ctx.props.boxC(10, 0.7, I.d, MAT.wB, { shadow: false });
    east.position.set(I.x + 12, I.y - 0.35, I.z);
    rg.solid.add(east);

    // crucible
    const cru = ctx.props.cyl(2.2, 1.7, 2.4, MAT.rust, { seg: 16 });
    cru.position.set(I.x - 13, I.y, I.z);
    rg.solid.add(cru);
    const melt = ctx.props.cyl(2.0, 2.0, 0.2, MAT.eOr, { seg: 16, collide: false });
    melt.position.set(I.x - 13, I.y + 2.3, I.z);
    ctx.props.NOCOLLIDE(melt);
    rg.decor.add(melt);
    const pour = ctx.props.boxC(0.35, 9, 0.35, MAT.eOr, { shadow: false, collide: false });
    pour.position.set(I.x - 13, I.y - 4.6, I.z + 1.6);
    rg.decor.add(pour);
    const hot = lamp(I.x - 13, I.y + 3, I.z, 0xff7a20, 26, 26);

    // overhead girders + chains, fading from steel to wireframe west-to-east
    for (let i = 0; i < 9; i++) {
      const x = I.x - 15 + i * 4;
      const g = ctx.props.girder(I.d + 1, i > 5 ? MAT.wC : MAT.steel, { scale: 2.2 });
      g.rotation.y = Math.PI / 2;
      g.position.set(x, I.y + 5.4, I.z);
      ctx.props.NOCOLLIDE(g);
      rg.decor.add(g);
      const post = ctx.props.boxC(0.28, 5.4, 0.28, i > 5 ? MAT.wC : MAT.steel, { shadow: false });
      post.position.set(x, I.y + 2.7, I.z - 5.2);
      rg.solid.add(post);
      if (i % 3 === 1) {
        const ch = ctx.props.boxC(0.09, 3.4, 0.09, MAT.steel, { shadow: false, collide: false });
        ch.position.set(x, I.y + 3.7, I.z + 2.4);
        rg.decor.add(ch);
      }
    }
    for (let i = 0; i < 4; i++) {
      const m = ctx.props.machine(2.0, 1.5, 1.2, 30 + i);
      m.position.set(I.x - 10 + i * 6, I.y, I.z + 4.2);
      m.rotation.y = Math.PI;
      rg.solid.add(m);
      if (i % 2 === 0) ctx.hidingSpot(I.x - 10 + i * 6, I.y, I.z + 2.6, 1.2, 0.8);
    }
    const pp = ctx.props.pipes(30, 3, 0.14, MAT.steel);
    pp.position.set(I.x, I.y + 1.4, I.z - 5.4);
    ctx.props.NOCOLLIDE(pp);
    rg.decor.add(pp);
    const s = ctx.props.sign('RENDER FAULT\nSECTOR 6', {
      background: 0x140b04, color: 0xff7a1a, emissive: 0xff7a1a, height: 1.0,
    });
    s.position.set(I.x + 6, I.y + 3, I.z - 5.2);
    rg.decor.add(s);

    ctx.onUpdate((dt, t) => {
      const f = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2.1) * Math.sin(t * 5.3));
      hot.intensity = 26 * f;
    });

    ctx.pickup(I.x - 13, I.y + 1, I.z - 4, 'coin');
    ctx.pickup(I.x - 2, I.y + 1, I.z - 4, 'coin');
    ctx.pickup(I.x + 10, I.y + 1, I.z + 4, 'coin');
    ctx.pickup(I.x + 15, I.y + 1, I.z - 3, 'coin');
    ctx.pickup(I.x + 5, I.y + 1, I.z + 4.5, 'battery');
    ctx.hidingSpot(I.x + 15, I.y, I.z + 4, 1.6, 1.0);
  }

  // ===========================================================================
  // 16. FRAGMENT 7 — FLOODED TEMPLE ARCADE, THE WATER FROZEN MID-FALL
  // ===========================================================================
  {
    const I = ISL.templ, rg = newRegion('templ');
    islandBase(rg, I, MAT.marble, { fenceH: 5.0 });

    for (let i = 0; i < 6; i++) {
      for (const sz of [-4.5, 4.5]) {
        const x = I.x - 9 + i * 3.6;
        const col = ctx.props.column(4.6, 0.42, MAT.marble, { seg: 14 });
        col.position.set(x, I.y, I.z + sz);
        rg.solid.add(col);
        if (i < 5) {
          const arch = ctx.props.archway(2.6, 3.4, 0.5, MAT.marble);
          arch.position.set(x + 1.8, I.y, I.z + sz);
          arch.rotation.y = Math.PI / 2;
          ctx.props.NOCOLLIDE(arch);
          rg.decor.add(arch);
        }
      }
    }
    const roof = ctx.props.boxC(21, 0.5, 11, MAT.marble, { shadow: false, collide: false });
    roof.position.set(I.x, I.y + 4.9, I.z);
    rg.decor.add(roof);
    // a collapsed corner — the roof gave up here
    const brk = ctx.props.rubble(3.0, 12, MAT.marble, 9);
    brk.position.set(I.x + 9, I.y, I.z - 4);
    ctx.props.NOCOLLIDE(brk);
    rg.decor.add(brk);
    const ghostRoof = wireify(roof, MAT.wG);
    ghostRoof.position.set(I.x + 1.2, I.y + 6.4, I.z);
    rg.decor.add(ghostRoof);

    // standing water
    const wsurf = new T.Mesh(scaleUV(new T.PlaneGeometry(I.w - 1, I.d - 1), 4, 4), MAT.water);
    wsurf.rotateX(-Math.PI / 2);
    wsurf.position.set(I.x, I.y + 0.22, I.z);
    wsurf.userData.collide = false;
    ctx.addDecor(wsurf);
    // and the sheet of it pouring off the south lip, stopped dead
    const sheet = new T.Mesh(scaleUV(new T.PlaneGeometry(I.w - 1, 20), 4, 6), MAT.water);
    sheet.position.set(I.x, I.y + 0.22 - 10, I.z + I.d / 2 - 0.3);
    sheet.userData.collide = false;
    ctx.addDecor(sheet);
    ctx.onUpdate((dt) => { MAT.water.userData.tick?.(dt); });

    lamp(I.x - 6, I.y + 1.0, I.z, 0x30d8ff, 14, 18);
    for (let i = 0; i < 4; i++) {
      const t = ctx.props.torch({ color: 0x40e0ff, intensity: 6 });
      t.position.set(I.x - 8 + i * 5.5, I.y + 1.6, I.z - 5.6);
      ctx.props.NOCOLLIDE(t);
      rg.decor.add(t);
    }
    const s = ctx.props.sign('DEPTH BUFFER\nOVERFLOW', {
      background: 0x04141a, color: 0x2ff0ff, emissive: 0x2ff0ff, height: 0.95,
    });
    s.position.set(I.x - 10.6, I.y + 3.0, I.z);
    s.rotation.y = Math.PI / 2;
    rg.decor.add(s);

    ctx.pickup(I.x - 9, I.y + 1, I.z, 'coin');
    ctx.pickup(I.x - 2, I.y + 1, I.z + 6, 'coin');
    ctx.pickup(I.x + 6, I.y + 1, I.z - 6, 'coin');
    ctx.pickup(I.x + 10, I.y + 1, I.z + 5, 'coin');
    ctx.pickup(I.x + 9, I.y + 1, I.z - 4, 'powerup:silence');
    ctx.hidingSpot(I.x - 9, I.y, I.z - 4.5, 1.3, 0.85);
    ctx.hidingSpot(I.x + 9, I.y, I.z - 4, 1.7, 1.0);
  }

  // ===========================================================================
  // 17. FRAGMENT 8 — SNOW SHELF WHERE THE SNOW FALLS UPWARD
  // ===========================================================================
  {
    const I = ISL.snow, rg = newRegion('snow');
    islandBase(rg, I, MAT.snow, { fenceH: 5.2 });
    const r = R.fork('snow');

    // half-buried module, tipped, its door still lit
    const mod = new T.Group();
    const shell = ctx.props.boxC(7.5, 3.0, 4.0, MAT.metalP, { shadow: false });
    mod.add(shell);
    const win = ctx.props.boxC(3.2, 0.8, 0.1, MAT.eCy, { shadow: false, collide: false });
    win.position.set(-0.6, 0.5, 2.05); mod.add(win);
    mod.position.set(I.x - 4, I.y + 0.6, I.z - 4);
    mod.rotation.set(0.12, 0.34, -0.09);
    rg.solid.add(mod);
    const drifts = ctx.props.boxC(9.5, 1.3, 6, MAT.snow, { shadow: false, collide: false });
    drifts.position.set(I.x - 4, I.y + 0.4, I.z - 4);
    drifts.rotation.y = 0.34;
    rg.decor.add(drifts);
    const doorlite = ctx.props.boxC(1.0, 2.0, 0.08, MAT.eWt, { shadow: false, collide: false });
    doorlite.position.set(I.x - 0.6, I.y + 1.6, I.z - 2.2);
    rg.decor.add(doorlite);
    lamp(I.x - 0.6, I.y + 2.0, I.z - 1.6, 0xdfeaff, 12, 16);
    ctx.hidingSpot(I.x - 1.2, I.y, I.z - 2.6, 1.5, 1.0);

    // mast + guy wires
    const mast = ctx.props.boxC(0.28, 11, 0.28, MAT.steel, { shadow: false });
    mast.position.set(I.x + 6, I.y + 5.5, I.z + 4);
    rg.solid.add(mast);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const wire9 = ctx.props.boxC(0.05, 9.5, 0.05, MAT.dark, { shadow: false, collide: false });
      wire9.position.set(I.x + 6 + Math.cos(a) * 1.9, I.y + 5.2, I.z + 4 + Math.sin(a) * 1.9);
      wire9.rotation.set(Math.sin(a) * 0.36, 0, -Math.cos(a) * 0.36);
      rg.decor.add(wire9);
    }
    const beacon = ctx.props.boxC(0.4, 0.4, 0.4, MAT.eRd, { shadow: false, collide: false });
    beacon.position.set(I.x + 6, I.y + 11.2, I.z + 4);
    ctx.addDecor(beacon);
    ctx.onUpdate((dt, t) => { beacon.visible = (t % 1.6) < 0.5; });

    for (let i = 0; i < 5; i++) {
      const b = ctx.props.boulder(r.range(0.7, 1.5), 40 + i, MAT.snow);
      b.position.set(I.x + r.range(-9, 9), I.y, I.z + r.range(-8, 8));
      rg.solid.add(b);
    }
    // snow, going the wrong way
    const flake = new T.PlaneGeometry(0.13, 0.13);
    const up = ctx.props.scatter(flake, ctx.mat.emissive(0xe8f2ff, 1.1, { transparent: true, opacity: 0.85, side: T.DoubleSide }),
      900, (i, d, rr) => {
        d.position.set(I.x + rr.range(-13, 13), rr.range(0, 24), I.z + rr.range(-12, 12));
        d.rotation.set(rr() * 3, rr() * 3, 0);
        d.scale.setScalar(rr.range(0.6, 2.0));
      }, 91);
    const upG = new T.Group(); upG.add(up); ctx.addDecor(upG);
    ctx.onUpdate((dt, t) => { upG.position.y = I.y - 4 + ((t * 1.6) % 24); });

    const s = ctx.props.sign('GRAVITY: -1', {
      background: 0x081018, color: 0x9fe0ff, emissive: 0x9fe0ff, height: 0.5,
    });
    s.position.set(I.x + 7, I.y + 2.2, I.z - 6);
    rg.decor.add(s);

    ctx.pickup(I.x + 9, I.y + 1, I.z - 8, 'coin');
    ctx.pickup(I.x - 9, I.y + 1, I.z + 8, 'coin');
    ctx.pickup(I.x + 2, I.y + 1, I.z + 7, 'coin');
    ctx.pickup(I.x - 8, I.y + 1, I.z + 1, 'battery');
    ctx.pickup(I.x + 8, I.y + 1, I.z + 7, 'powerup:nightvision');
    ctx.hidingSpot(I.x + 6, I.y, I.z + 4, 1.2, 0.6);
  }

  // ===========================================================================
  // 18. FRAGMENT 9 — SCI-FI CORRIDOR TURNED INSIDE OUT
  // ===========================================================================
  {
    const I = ISL.scifi, rg = newRegion('scifi');
    strata(rg, I.x, I.y - 0.7, I.z, I.w, I.d, I.key);
    rg.breathe = 0.05;
    perimeter(rg, I.x, I.z, I.w, I.d, I.y - 1.6, 5.2, I.doors);
    const floor = ctx.props.boxC(I.w, 0.7, I.d, MAT.hex, { shadow: false });
    floor.position.set(I.x, I.y - 0.35, I.z);
    rg.solid.add(floor);

    // The walls are modelled with their normals pointing away from you, so the
    // corridor renders as its own exterior. You are outside the inside.
    for (const sz of [-4.6, 4.6]) {
      const w = new T.Mesh(scaleUV(new T.PlaneGeometry(26, 3.6), 6, 1), MAT.hexIn);
      w.position.set(I.x, I.y + 1.8, I.z + sz);
      w.rotation.y = sz > 0 ? 0 : Math.PI;
      w.userData.collide = false;
      rg.decor.add(w);
      const solidW = ctx.props.boxC(26, 3.6, 0.3, MAT.dark, { shadow: false });
      solidW.position.set(I.x, I.y + 1.8, I.z + sz);
      rg.solid.add(solidW);
      for (let i = 0; i < 7; i++) {
        const strip = ctx.props.boxC(2.6, 0.1, 0.1, i % 2 ? MAT.eCy : MAT.eMg,
          { shadow: false, collide: false });
        strip.position.set(I.x - 11 + i * 3.7, I.y + 2.9, I.z + sz - Math.sign(sz) * 0.2);
        rg.decor.add(strip);
      }
    }
    const ceil = new T.Mesh(scaleUV(new T.PlaneGeometry(26, 9.2), 6, 3), MAT.hexIn);
    ceil.rotateX(Math.PI / 2);
    ceil.position.set(I.x, I.y + 3.6, I.z);
    ceil.userData.collide = false;
    rg.decor.add(ceil);
    const ceilS = ctx.props.boxC(26, 0.3, 9.2, MAT.dark, { shadow: false, collide: false });
    ceilS.position.set(I.x, I.y + 3.75, I.z);
    rg.decor.add(ceilS);

    // ribs, blast door, pipe runs
    for (let i = 0; i < 6; i++) {
      const x = I.x - 11 + i * 4.4;
      const rib = ctx.props.archway(6.4, 3.2, 0.4, MAT.metalP);
      rib.position.set(x, I.y, I.z);
      rib.rotation.y = Math.PI / 2;
      ctx.props.NOCOLLIDE(rib);
      rg.decor.add(rib);
    }
    const blast = ctx.props.boxC(0.4, 3.2, 6.0, MAT.metalP, { shadow: false });
    blast.position.set(I.x - 12.6, I.y + 1.6, I.z);
    rg.solid.add(blast);
    const bl = ctx.props.boxC(0.1, 0.3, 5.2, MAT.eRd, { shadow: false, collide: false });
    bl.position.set(I.x - 12.35, I.y + 2.6, I.z);
    rg.decor.add(bl);
    const pp = ctx.props.pipes(24, 4, 0.11, MAT.steel);
    pp.position.set(I.x, I.y + 3.1, I.z - 3.6);
    ctx.props.NOCOLLIDE(pp);
    rg.decor.add(pp);
    const lk = ctx.props.lockers(5, MAT.metalP);
    lk.position.set(I.x + 8, I.y, I.z - 4.0);
    rg.solid.add(lk);
    ctx.hidingSpot(I.x + 8, I.y, I.z - 3.0, 1.4, 1.0);
    const dk = ctx.props.deskComputer({ screen: 0x2ff0ff });
    dk.position.set(I.x + 2, I.y, I.z + 3.4);
    dk.rotation.y = Math.PI;
    rg.solid.add(dk);

    lamp(I.x - 8, I.y + 3.0, I.z, 0x63d4ff, 12, 18);
    lamp(I.x + 8, I.y + 3.0, I.z, 0x63d4ff, 12, 18);

    const s = ctx.props.sign('GEOMETRY INVERTED', {
      background: 0x061018, color: 0x2ff0ff, emissive: 0x2ff0ff, height: 0.5,
    });
    s.position.set(I.x + 12, I.y + 2.6, I.z + 4.3); s.rotation.y = Math.PI;
    rg.decor.add(s);

    ctx.pickup(I.x - 10, I.y + 1, I.z, 'coin');
    ctx.pickup(I.x + 4, I.y + 1, I.z - 2, 'coin');
    ctx.pickup(I.x + 12, I.y + 1, I.z + 3, 'coin');
    ctx.pickup(I.x - 2, I.y + 1, I.z + 3.5, 'battery');
    ctx.hidingSpot(I.x - 11.5, I.y, I.z + 3, 1.3, 0.9);
  }

  // ===========================================================================
  // 19. FRAGMENT 10 — THE UNFINISHED ROOM  (the pup lives behind the checkers)
  // ===========================================================================
  {
    const I = ISL.white, rg = newRegion('white');
    islandBase(rg, I, MAT.white, { wall: MAT.white, wallH: 3.6 });
    const ceil = ctx.props.boxC(I.w, 0.3, I.d, MAT.white, { shadow: false, collide: false });
    ceil.position.set(I.x, I.y + 3.7, I.z);
    rg.decor.add(ceil);

    // partition with the placeholder texture; a 1.0 m slot at its north end is
    // the only way into the dead space behind it
    const part = ctx.props.boxC(0.35, 3.6, 13, MAT.white, { shadow: false });
    part.position.set(61.5, I.y + 1.8, -13.5);
    rg.solid.add(part);
    const chk = new T.Mesh(scaleUV(new T.PlaneGeometry(13, 3.5), 3, 1), MAT.checker);
    chk.position.set(61.69, I.y + 1.8, -13.5);
    chk.rotation.y = Math.PI / 2;
    chk.userData.collide = false;
    rg.decor.add(chk);

    // greybox props — nobody ever came back to model these
    for (const [dx, dy, dz, w, h, d2] of [
      [4, 0, -4, 2, 1, 2], [4, 1, -4, 1.2, 0.8, 1.2], [-1, 0, 3, 3, 0.6, 1.4],
      [6, 0, 4, 1, 2.2, 1]]) {
      const b = ctx.props.boxC(w, h, d2, MAT.greybox, { shadow: false });
      b.position.set(I.x + dx, I.y + dy + h / 2, I.z + dz);
      rg.solid.add(b);
    }
    const cap = ctx.props.cyl(0.8, 0.8, 1.6, MAT.greybox, { seg: 8 });
    cap.position.set(I.x - 4, I.y, I.z - 3);
    rg.solid.add(cap);
    const s = ctx.props.sign('PLACEHOLDER\nDO NOT SHIP', {
      background: 0xf2f2f2, color: 0x101014, height: 0.9, fontSize: 90,
    });
    s.position.set(I.x + 2, I.y + 2.4, I.z + 6.7); s.rotation.y = Math.PI;
    rg.decor.add(s);
    lamp(I.x + 3, I.y + 3.2, I.z, 0xffffff, 14, 16);

    ctx.pickup(I.x + 7, I.y + 1, I.z - 5, 'coin');
    ctx.pickup(I.x - 2, I.y + 1, I.z + 5, 'coin');
    ctx.pickup(59, I.y + 1, -12, 'pup');           // <-- the one and only
    ctx.hidingSpot(59, I.y, -14, 1.8, 1.0);
  }

  // ===========================================================================
  // 20. FRAGMENT 11 — THE ERROR ZONE  (best loot, worst place to stand)
  // ===========================================================================
  {
    const I = ISL.error, rg = newRegion('error');
    islandBase(rg, I, MAT.concrete, { fenceH: 7.0, breathe: 0.14 });
    const r = R.fork('error');

    // TV static, redrawn at 8 fps
    MAT.tv = ctx.mat.painted(64, 64, (c, W, H) => {
      c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    }, { transparent: false, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 1 });
    const tvC = MAT.tv.map.image, tvX = tvC.getContext('2d');
    const tvImg = tvX.createImageData(64, 64);
    let tvAcc = 0, tvSeed = 0x1a2b3c4d;
    ctx.onUpdate((dt) => {
      tvAcc += dt;
      if (tvAcc < 0.125) return;
      tvAcc = 0;
      const d = tvImg.data;
      for (let i = 0; i < 64 * 64; i++) {
        tvSeed = (Math.imul(tvSeed, 1664525) + 1013904223) >>> 0;
        const v = tvSeed >>> 24;
        const tint = (tvSeed & 63) === 0;
        d[i * 4] = tint ? 255 : v;
        d[i * 4 + 1] = tint ? 40 : v;
        d[i * 4 + 2] = tint ? 210 : v;
        d[i * 4 + 3] = 255;
      }
      tvX.putImageData(tvImg, 0, 0);
      MAT.tv.map.needsUpdate = true;
    });
    const tv = new T.Mesh(new T.PlaneGeometry(15, 6), MAT.tv);
    tv.position.set(I.x, I.y + 3.2, I.z - 11.2);
    tv.userData.collide = false;
    ctx.addDecor(tv);
    const tvFrame = ctx.props.boxC(15.6, 6.6, 0.4, MAT.black, { shadow: false });
    tvFrame.position.set(I.x, I.y + 3.2, I.z - 11.5);
    rg.solid.add(tvFrame);
    lamp(I.x, I.y + 3.2, I.z - 8, 0xffffff, 16, 18);

    // floor tiles that will not stay where they are put
    for (let i = 0; i < 10; i++) {
      const tile = ctx.props.boxC(r.range(2, 4), 0.22, r.range(2, 4), r.chance(0.5) ? MAT.tileW : MAT.bone,
        { shadow: false, collide: false });
      tile.position.set(I.x + r.range(-9, 9), I.y + 0.14, I.z + r.range(-9, 9));
      ctx.addDecor(tile);
      glitch(tile, { amp: r.range(0.1, 0.3), rot: 0.06, snap: 0.09, speed: r.range(0.8, 2.4) });
    }
    // blocks that cannot decide whether they exist
    for (let i = 0; i < 8; i++) {
      const b = ctx.props.boxC(r.range(1.2, 2.6), r.range(1.5, 4), r.range(1.2, 2.6),
        r.chance(0.5) ? MAT.metalP : MAT.brick, { shadow: false, collide: false });
      b.position.set(I.x + r.range(-10, 10), I.y + r.range(1, 4), I.z + r.range(-10, 10));
      b.rotation.y = r() * TAU;
      ctx.addDecor(b);
      glitch(b, { amp: r.range(0.15, 0.5), rot: 0.12, snap: 0.12, speed: r.range(0.6, 2.0) });
      flip(b, r.chance(0.5) ? MAT.wM : MAT.wG, r.range(2, 7));
    }
    // solid cover you can actually hide behind
    for (const [dx, dz] of [[-7, 6], [7, 7], [8, -5], [-8, -6]]) {
      const c = ctx.props.boxC(3.0, 2.2, 2.0, MAT.black, { shadow: false });
      c.position.set(I.x + dx, I.y + 1.1, I.z + dz);
      rg.solid.add(c);
      const edge = wireify(c, MAT.wM);
      edge.scale.setScalar(1.03);
      rg.decor.add(edge);
    }
    // rain of wireframe cubes
    const cube = new T.BoxGeometry(0.7, 0.7, 0.7);
    const rain = ctx.props.scatter(cube, MAT.wC, 260, (i, d, rr) => {
      d.position.set(I.x + rr.range(-12, 12), rr.range(0, 34), I.z + rr.range(-12, 12));
      d.rotation.set(rr() * 3, rr() * 3, rr() * 3);
      d.scale.setScalar(rr.range(0.5, 2.2));
    }, 55);
    const rainG = new T.Group(); rainG.add(rain); ctx.addDecor(rainG);
    ctx.onUpdate((dt, t) => { rainG.position.y = I.y + 6 - ((t * 3.4) % 34); });

    const s1 = ctx.props.sign('ERROR', {
      background: 0x1a0008, color: 0xff2020, emissive: 0xff2020, height: 1.4, fontSize: 130,
    });
    s1.position.set(I.x - 9, I.y + 3.4, I.z + 11); s1.rotation.y = Math.PI;
    ctx.addDecor(s1);
    glitch(s1, { amp: 0.25, rot: 0.09, snap: 0.2, speed: 3.1 });
    const s2 = ctx.props.sign('THE CITY LIES\nTHE CITY LIES\nTHE CITY L', {
      background: 0x000000, color: 0x86ff3c, emissive: 0x86ff3c, height: 1.6, fontSize: 80,
    });
    s2.position.set(I.x + 11.2, I.y + 3.2, I.z + 2); s2.rotation.y = -Math.PI / 2;
    ctx.addDecor(s2);
    glitch(s2, { amp: 0.18, rot: 0.05, snap: 0.14, speed: 2.2 });

    const red = lamp(I.x - 8, I.y + 4, I.z + 6, 0xff2020, 14, 20);
    const grn = lamp(I.x + 8, I.y + 4, I.z - 4, 0x86ff3c, 12, 20);
    stage(I.x, I.y + 14, I.z, 0xffffff, 40, 26, true);
    ctx.onUpdate((dt, t) => {
      red.intensity = 14 * (hash01(Math.floor(t * 9)) > 0.25 ? 1 : 0.15);
      grn.intensity = 12 * (hash01(Math.floor(t * 7) + 991) > 0.35 ? 1 : 0.1);
    });

    ctx.pickup(I.x - 7, I.y + 1, I.z + 8, 'coin');
    ctx.pickup(I.x + 7, I.y + 1, I.z + 9, 'coin');
    ctx.pickup(I.x + 9, I.y + 1, I.z - 7, 'coin');
    ctx.pickup(I.x - 9, I.y + 1, I.z - 8, 'coin');
    ctx.pickup(I.x, I.y + 1, I.z, 'coin');
    ctx.pickup(I.x - 2, I.y + 1, I.z - 9, 'battery');
    ctx.pickup(I.x + 4, I.y + 1, I.z + 4, 'powerup:timefreeze');
    ctx.hidingSpot(I.x - 7, I.y, I.z + 6, 1.5, 1.0);
    ctx.hidingSpot(I.x + 7, I.y, I.z + 7, 1.5, 1.0);
    ctx.hidingSpot(I.x + 8, I.y, I.z - 5, 1.5, 1.0);
  }

  // ===========================================================================
  // 21. THE CONNECTIONS — 15 impossible routes, every one of them fenced
  // ===========================================================================
  for (let i = 0; i < LINKS.length; i++) {
    const L = LINKS[i];
    const rg = newRegion('link' + i);
    route(rg, L.pts, L.W, L.style);
  }

  // A corridor whose interior is longer than its exterior: 8 m of box, 34 ribs.
  {
    const rg = newRegion('longbox');
    const L = LINKS[4];
    const p0 = L.pts[0], p1 = L.pts[1];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, mz = (p0[2] + p1[2]) / 2;
    const yaw = -Math.atan2(p1[2] - p0[2], p1[0] - p0[0]);
    const tube = new T.Group();
    tube.position.set(mx, my, mz); tube.rotation.y = yaw;
    for (const [dy, dz] of [[4.2, 0], [1.6, 3.0], [1.6, -3.0]]) {
      const wsz = dz ? 0.3 : 6.0;
      const p = ctx.props.boxC(8, dz ? 3.4 : 0.3, wsz, MAT.bone, { shadow: false, collide: false });
      p.position.set(0, dy - 1.6, dz);
      tube.add(p);
    }
    for (let k = 0; k < 34; k++) {
      const rib = ctx.props.boxC(0.1, 3.0, 5.4, k % 5 === 0 ? MAT.eCy : MAT.dark,
        { shadow: false, collide: false });
      rib.position.set(-3.9 + (k / 33) * 7.8, 1.5, 0);
      tube.add(rib);
    }
    rg.decor.add(tube);
    const s = ctx.props.sign('34 m', {
      background: 0x0a0a0c, color: 0x2ff0ff, emissive: 0x2ff0ff, height: 0.4,
    });
    s.position.set(mx, my + 3.4, mz);
    s.rotation.y = yaw + Math.PI / 2;
    rg.decor.add(s);
  }

  // A staircase that turns 90 degrees and keeps going, straight up a wall.
  {
    const rg = newRegion('wallstair');
    const wall = ctx.props.boxC(0.5, 26, 14, MAT.bone, { shadow: false, collide: false });
    wall.position.set(15.5, 16, 33);
    rg.decor.add(wall);
    for (let i = 0; i < 40; i++) {
      const st = ctx.props.boxC(1.6, 0.14, 1.1, i % 2 ? MAT.bone : MAT.dark,
        { shadow: false, collide: false });
      st.position.set(16.6, 5 + i * 0.62, 39 - i * 0.28);
      rg.decor.add(st);
    }
    const gh = ctx.props.boxC(0.5, 26, 14, MAT.wG, { shadow: false, collide: false });
    gh.position.set(15.5, 16, 33); gh.scale.setScalar(1.02);
    rg.decor.add(gh);
  }

  // ===========================================================================
  // 22. ORBITING DEBRIS + ASCENDING MOTES
  // ===========================================================================
  {
    const chunk = new T.IcosahedronGeometry(1, 0);
    const orbits = [
      { r0: 34, r1: 62, y0: -14, y1: 34, n: 200, m: MAT.strataA, sp: 0.011, tilt: 0.16 },
      { r0: 46, r1: 88, y0: -22, y1: 46, n: 170, m: MAT.wC, sp: -0.008, tilt: -0.22 },
      { r0: 24, r1: 76, y0: 4, y1: 56, n: 150, m: MAT.wM, sp: 0.015, tilt: 0.34 },
    ];
    for (let i = 0; i < orbits.length; i++) {
      const o = orbits[i];
      const inst = ctx.props.scatter(chunk, o.m, o.n, (k, d, rr) => {
        const a = rr() * TAU, rad = rr.range(o.r0, o.r1);
        d.position.set(Math.cos(a) * rad, rr.range(o.y0, o.y1), Math.sin(a) * rad);
        d.rotation.set(rr() * 3, rr() * 3, rr() * 3);
        const s = rr.range(0.35, 2.6);
        d.scale.set(s, s * rr.range(0.35, 1.1), s);
      }, 300 + i);
      const g = new T.Group();
      g.rotation.z = o.tilt;
      g.add(inst);
      ctx.addDecor(g);
      SPIN.push({ o: g, ax: 'y', sp: o.sp });
    }

    const mote = new T.PlaneGeometry(0.11, 0.11);
    const moteMat = ctx.mat.emissive(0x9ff0ff, 1.6,
      { transparent: true, opacity: 0.75, side: T.DoubleSide });
    for (let i = 0; i < 2; i++) {
      const inst = ctx.props.scatter(mote, moteMat, 700, (k, d, rr) => {
        d.position.set(rr.range(-95, 95), rr.range(0, 40), rr.range(-95, 95));
        d.rotation.set(rr() * 3, rr() * 3, 0);
        d.scale.setScalar(rr.range(0.5, 2.4));
      }, 410 + i);
      const g = new T.Group(); g.add(inst); ctx.addDecor(g);
      const sp = 0.55 + i * 0.4, base = -26 + i * 14;
      ctx.onUpdate((dt, t) => { g.position.y = base + ((t * sp) % 40); });
    }
  }

  // ===========================================================================
  // 23. FOOTSTEPS — mostly metal, because mostly nothing is really there
  // ===========================================================================
  const SURF = [
    [ISL.back, 'carpet'], [ISL.metro, 'tile'], [ISL.vict, 'wood'],
    [ISL.cont, 'concrete'], [ISL.desert, 'sand'], [ISL.found, 'metal'],
    [ISL.templ, 'water'], [ISL.snow, 'snow'], [ISL.scifi, 'metal'],
    [ISL.white, 'concrete'], [ISL.error, 'concrete'],
  ];
  ctx.setSurface((x, z) => {
    for (const [I, name] of SURF) {
      if (Math.abs(x - I.x) < I.w / 2 && Math.abs(z - I.z) < I.d / 2) return name;
    }
    if (Math.hypot(x, z) < ISL.hub.r) return 'concrete';
    return 'metal';
  });

  // ===========================================================================
  // 24. THE MASTER TICK — jitter, flip, spin, breathe
  // ===========================================================================
  const AX = { x: new T.Vector3(1, 0, 0), y: new T.Vector3(0, 1, 0), z: new T.Vector3(0, 0, 1) };
  ctx.onUpdate((dt, t) => {
    for (let i = 0; i < GLITCH.length; i++) {
      const g = GLITCH[i];
      const tt = t * g.sp + g.ph;
      const nx = ctx.noise.fbm(tt * 0.8, g.ph, 2);
      const ny = ctx.noise.fbm(tt * 0.9 + 13, g.ph, 2);
      const nz = ctx.noise.fbm(tt * 0.7 + 31, g.ph, 2);
      const bucket = Math.floor(t * 7) * 131 + g.id * 17;
      const h = hash01(bucket);
      const jump = h < g.snap;
      const sx = jump ? (hash01(bucket + 5) - 0.5) * 2.2 : 0;
      const sz = jump ? (hash01(bucket + 11) - 0.5) * 2.2 : 0;
      g.o.position.set(
        g.p.x + nx * g.amp + sx,
        g.p.y + ny * g.amp * 0.6,
        g.p.z + nz * g.amp + sz);
      g.o.rotation.set(g.r.x + nx * g.rot, g.r.y + nz * g.rot, g.r.z + ny * g.rot);
    }
    for (let i = 0; i < FLIP.length; i++) {
      const f = FLIP[i];
      f.o.material = hash01(Math.floor(t * f.rate) * 7919 + f.ph) > 0.3 ? f.a : f.b;
    }
    for (let i = 0; i < SPIN.length; i++) SPIN[i].o.rotateOnAxis(AX[SPIN[i].ax], SPIN[i].sp * dt);
    for (let i = 0; i < RINGS.length; i++) RINGS[i].o.rotateOnAxis(AX.z, RINGS[i].sp * dt);
    for (let i = 0; i < DRIFT.length; i++) {
      const d = DRIFT[i];
      d.o.position.set(
        d.base.x + Math.sin(t * d.sp + d.ph) * d.amp,
        d.base.y + Math.sin(t * d.sp * 0.73 + d.ph * 1.7) * d.amp * 1.7,
        d.base.z + Math.cos(t * d.sp * 0.61 + d.ph) * d.amp);
    }
  });

  // ===========================================================================
  // 25. BAKE
  // ===========================================================================
  commitAll();
}
