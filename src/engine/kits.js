// Curated prop kits.
//
// `assets.js` can load any of the 185 authored GLBs, but a filename is not a
// design decision. This layer turns the pile into sets a level author reaches
// for by intent — COVER, CLUTTER, LIGHTING — with real measured dimensions
// attached, biome tags so a dungeon barrel never lands on an orbital station,
// and scatter helpers that respect the draw-call budget by default.
//
// Three things this exists to get right, all of them learned the hard way (see
// docs/LESSONS.md):
//
//  1. **Instancing is the default, not an option.** Forty individually cloned
//     crates is forty draw calls. `scatterKit` always goes through
//     `assets.instancedProp`.
//  2. **Authored meshes never collide.** Collision comes from cheap invisible
//     boxes sized from the measured bounds, merged into one proxy per scatter.
//  3. **Origins are not at the base.** 51 of the 185 props are modelled around
//     their centre or worse — the barrel is off by 0.40 m, one banner by 2.53 m.
//     Placing them naively buries or floats them. Every placement re-seats the
//     prop using its measured `minY`.
//
// Everything degrades: with `assets/` missing, every call resolves to an empty
// result and the arena still builds.

import * as THREE from 'three';
import { prop, instancedProp, instance } from './assets.js';
import { makeRNG } from './rng.js';

const BASE = new URL('../../assets/', import.meta.url).href;

/** Measured at build time by tools/measure-props.mjs. */
let METRICS = null;
let metricsPromise = null;

function loadMetrics() {
  if (metricsPromise) return metricsPromise;
  metricsPromise = fetch(BASE + 'prop-metrics.json')
    .then(r => (r.ok ? r.json() : {}))
    .then(m => (METRICS = m))
    .catch(() => (METRICS = {}));
  return metricsPromise;
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------
//
// `cover` marks something worth hiding behind — it registers a hiding spot and
// gets a collision proxy. `solid` marks something you cannot walk through even
// if it is not cover. Everything else is pure decor and costs no collision.

const A_INDOOR = ['indoor', 'underground', 'surreal'];
const A_ALL = ['indoor', 'underground', 'surreal', 'outdoor', 'space'];
const A_GRIM = ['indoor', 'underground'];

export const KITS = {
  COVER: [
    { n: 'crate', cover: 1.0, biomes: A_ALL },
    { n: 'crateDark', cover: 1.0, biomes: A_ALL },
    { n: 'barrel', cover: 0.9, biomes: A_ALL },
    { n: 'barrelDark', cover: 0.9, biomes: A_ALL },
    { n: 'chest', cover: 0.7, biomes: A_INDOOR },
    { n: 'bookcase', cover: 1.0, biomes: A_INDOOR },
    { n: 'bookcaseFilled', cover: 1.0, biomes: A_INDOOR },
    { n: 'bookcaseWide', cover: 1.1, biomes: A_INDOOR },
    { n: 'bookcaseWideFilled', cover: 1.1, biomes: A_INDOOR },
    { n: 'bookcase_broken', cover: 0.8, biomes: A_INDOOR },
  ],
  CONTAINERS: [
    { n: 'chest', solid: true, biomes: A_INDOOR },
    { n: 'chestLarge', solid: true, biomes: A_INDOOR },
    { n: 'barrel', solid: true, biomes: A_ALL },
    { n: 'crate', solid: true, biomes: A_ALL },
    { n: 'bucket', biomes: A_ALL },
  ],
  FURNITURE: [
    { n: 'bench', solid: true, biomes: A_INDOOR },
    { n: 'table', solid: true, cover: 0.8, biomes: A_INDOOR },
    { n: 'tableSmall', solid: true, biomes: A_INDOOR },
    { n: 'chair', biomes: A_INDOOR },
    { n: 'stool', biomes: A_INDOOR },
  ],
  CLUTTER: [
    { n: 'bookA', biomes: A_INDOOR }, { n: 'bookB', biomes: A_INDOOR },
    { n: 'bookC', biomes: A_INDOOR }, { n: 'bookD', biomes: A_INDOOR },
    { n: 'bookOpenA', biomes: A_INDOOR }, { n: 'bookOpenB', biomes: A_INDOOR },
    { n: 'bottle_A_brown', biomes: A_INDOOR }, { n: 'bottle_A_green', biomes: A_INDOOR },
    { n: 'pot_A', biomes: A_ALL }, { n: 'pot_B', biomes: A_ALL },
    { n: 'coin', biomes: A_INDOOR }, { n: 'coinStack', biomes: A_INDOOR },
  ],
  LIGHTING: [
    { n: 'torch', light: 0xff9040, biomes: A_GRIM },
    { n: 'candleA', light: 0xffc880, biomes: A_INDOOR },
    { n: 'candleB', light: 0xffc880, biomes: A_INDOOR },
    { n: 'lantern', light: 0xffb060, biomes: A_ALL },
  ],
  DEBRIS: [
    { n: 'bricks', biomes: A_ALL },
    { n: 'rocks', biomes: A_ALL },
    { n: 'bones_A', biomes: A_GRIM },
    { n: 'skull', biomes: A_GRIM },
    { n: 'woodPlanks', biomes: A_ALL },
  ],
};

/** Which names actually exist on disk — set once the manifest is known. */
let AVAILABLE = null;
export function setAvailable(names) { AVAILABLE = new Set(names || []); }

function pickNames(kit, biome) {
  const list = KITS[kit] || [];
  return list.filter(e => {
    if (AVAILABLE && !AVAILABLE.has(e.n)) return false;
    if (METRICS && !METRICS[e.n]) return false;
    return !biome || e.biomes.includes(biome);
  });
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Scatter one kit across an area, instanced, with merged collision.
 *
 * @param {object} ctx    the arena build context
 * @param {object} o
 *   kit        'COVER' | 'CLUTTER' | ...
 *   count      how many to attempt
 *   area       (rng) => ({x,y,z}) | null   where to try putting one
 *   accept     (pos, entry) => bool        veto a position (walls, voids)
 *   biome      restrict to props suited to this biome (defaults to meta.biome)
 *   seed       deterministic stream
 *   scale      [min,max] multiplier
 *   hide       register cover props as hiding spots (default true)
 *   collide    build collision proxies (default true)
 *   shadows    let these cast shadows (default false — see LESSONS)
 * @returns {Promise<{placed:number, groups:THREE.Object3D[]}>}
 */
export async function scatterKit(ctx, o = {}) {
  await loadMetrics();
  const kit = o.kit || 'CLUTTER';
  const biome = o.biome ?? ctx.meta?.biome;
  const entries = pickNames(kit, biome);
  if (!entries.length) return { placed: 0, groups: [] };

  const rng = makeRNG(o.seed ?? `${ctx.meta?.id}-${kit}`);
  const count = o.count ?? 20;
  const [sMin, sMax] = o.scale ?? [0.9, 1.15];

  // Decide every placement first, bucketed by prop, so each prop can be
  // instanced in one go rather than one InstancedMesh per object.
  const buckets = new Map();
  const proxies = [];
  for (let i = 0; i < count; i++) {
    const pos = o.area ? o.area(rng) : null;
    if (!pos) continue;
    const entry = entries[Math.floor(rng() * entries.length)];
    if (o.accept && !o.accept(pos, entry)) continue;

    const m = METRICS[entry.n];
    const scale = sMin + rng() * (sMax - sMin);
    // Re-seat: the model's own origin is often not at its feet.
    const y = pos.y - (m.minY * scale);

    if (!buckets.has(entry.n)) buckets.set(entry.n, { entry, list: [] });
    buckets.get(entry.n).list.push({
      position: new THREE.Vector3(pos.x, y, pos.z),
      rotation: rng() * Math.PI * 2,
      scale,
    });

    if (o.collide !== false && (entry.solid || entry.cover)) {
      proxies.push({ m, scale, x: pos.x, y: pos.y, z: pos.z });
    }
    if (o.hide !== false && entry.cover) {
      const r = Math.max(m.w, m.d) * scale * 0.8 + 0.5;
      ctx.hidingSpot(pos.x, pos.y, pos.z, r, entry.cover);
    }
    o.onPlace?.(pos, entry);
  }

  // Load every distinct prop concurrently — never await inside the loop.
  const groups = [];
  const loaded = await Promise.all([...buckets.values()].map(async (b) => {
    const src = await prop(b.entry.n);
    return src ? { src, ...b } : null;
  }));

  for (const b of loaded) {
    if (!b) continue;
    const im = instancedProp(b.src, b.list);
    if (!im) continue;
    // Clutter casting shadows is pure cost: each shadow light re-renders it.
    if (!o.shadows) im.traverse(x => { if (x.isMesh) x.castShadow = false; });
    ctx.addDecor(im);
    groups.push(im);
  }

  // One merged invisible collision mesh for the whole scatter, not N boxes.
  if (proxies.length) {
    const geos = proxies.map(p => {
      const g = new THREE.BoxGeometry(
        Math.max(0.3, p.m.w * p.scale * 0.85),
        Math.max(0.3, p.m.h * p.scale),
        Math.max(0.3, p.m.d * p.scale * 0.85)
      );
      g.translate(p.x, p.y + (p.m.h * p.scale) / 2, p.z);
      return g;
    });
    const merged = ctx.props.mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    const proxy = new THREE.Mesh(merged, ctx.mat.solid({ color: 0x000000 }));
    proxy.visible = false;
    proxy.userData.collide = true;
    ctx.add(proxy);
    groups.push(proxy);
  }

  return { placed: [...buckets.values()].reduce((n, b) => n + b.list.length, 0), groups };
}

/**
 * A single hero prop, placed and oriented by hand. Returns the object so the
 * caller can parent lights to it or animate it.
 */
export async function placeProp(ctx, name, { x = 0, y = 0, z = 0, rotY = 0, scale = 1, collide = false, hide = 0 } = {}) {
  await loadMetrics();
  const src = await prop(name);
  if (!src) return null;
  const obj = instance(src);
  if (!obj) return null;
  const m = METRICS[name];
  obj.position.set(x, y - (m ? m.minY * scale : 0), z);
  obj.rotation.y = rotY;
  obj.scale.setScalar(scale);
  ctx.addDecor(obj);

  if (collide && m) {
    const box = ctx.props.boxC(
      Math.max(0.3, m.w * scale * 0.85),
      Math.max(0.3, m.h * scale),
      Math.max(0.3, m.d * scale * 0.85),
      ctx.mat.solid({ color: 0x000000 }), { shadow: false });
    box.visible = false;
    box.userData.collide = true;
    box.position.set(x, y + (m.h * scale) / 2, z);
    ctx.add(box);
  }
  if (hide && m) ctx.hidingSpot(x, y, z, Math.max(m.w, m.d) * scale * 0.8 + 0.5, hide);
  return obj;
}

/** Measured dimensions for a prop, or null if unknown. */
export function metrics(name) { return METRICS?.[name] ?? null; }

/**
 * Bound to a world by `makeContext`, so arenas reach this as `ctx.kits`.
 * Constructs synchronously and cheaply: an arena that never touches it pays
 * nothing, and nothing is fetched until the first scatter.
 */
export function makeKits() {
  return { scatterKit, placeProp, metrics, KITS, setAvailable };
}
