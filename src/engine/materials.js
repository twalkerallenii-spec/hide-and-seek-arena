// Material library. Arenas ask for materials by name; identical requests share
// one THREE.Material instance so the renderer can batch aggressively.

import * as THREE from 'three';
import { makeTextureSet, makeGradientTexture } from './textures.js';

const MATS = new Map();

/**
 * Standard PBR surface backed by a procedural texture set.
 *
 * @param {string} type   texture generator name (see textures.js TEXTURE_TYPES)
 * @param {object} o      { color, repeat, size, seed, metalness, roughness,
 *                          emissive, emissiveIntensity, side, transparent,
 *                          opacity, normalScale, ...generator options }
 */
export function surface(type, o = {}) {
  const key = 'S|' + type + '|' + JSON.stringify(o);
  if (MATS.has(key)) return MATS.get(key);

  const texOpts = { ...o };
  delete texOpts.metalness; delete texOpts.roughness; delete texOpts.emissive;
  delete texOpts.emissiveIntensity; delete texOpts.side; delete texOpts.transparent;
  delete texOpts.opacity; delete texOpts.normalScale; delete texOpts.envMapIntensity;

  const set = makeTextureSet(type, texOpts);
  const m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    metalness: o.metalness ?? 0,
    roughness: o.roughness ?? 1,
    envMapIntensity: o.envMapIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
  });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  m.name = type;
  MATS.set(key, m);
  return m;
}

/** Untextured PBR — cheap, good for small props and instanced scatter. */
export function solid(o = {}) {
  const key = 'P|' + JSON.stringify(o);
  if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: o.color ?? 0xaaaaaa,
    metalness: o.metalness ?? 0,
    roughness: o.roughness ?? 0.8,
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    flatShading: !!o.flat,
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  MATS.set(key, m);
  return m;
}

/** Self-lit surface for lamps, signs, screens. Feeds the bloom pass. */
export function emissive(color = 0xffffff, intensity = 3, o = {}) {
  const key = 'E|' + color + '|' + intensity + '|' + JSON.stringify(o);
  if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: o.base ?? 0x0b0b0b,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0,
    toneMapped: o.toneMapped ?? true,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  MATS.set(key, m);
  return m;
}

/** Glass / plastic. Physical material so it picks up transmission + clearcoat. */
export function glass(o = {}) {
  const key = 'G|' + JSON.stringify(o);
  if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color ?? 0xbfd8e6,
    metalness: 0,
    roughness: o.roughness ?? 0.05,
    transmission: o.transmission ?? 0.92,
    thickness: o.thickness ?? 0.35,
    ior: o.ior ?? 1.45,
    transparent: true,
    opacity: o.opacity ?? 1,
    side: THREE.DoubleSide,
    clearcoat: o.clearcoat ?? 1,
    clearcoatRoughness: 0.06,
  });
  MATS.set(key, m);
  return m;
}

/** Cheap fake glass for when transmission is too expensive (low quality tier). */
export function glassCheap(o = {}) {
  return solid({
    color: o.color ?? 0x9fc4d8,
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: o.opacity ?? 0.28,
    side: THREE.DoubleSide,
  });
}

/** Polished / brushed metal without a texture map. */
export function metal(color = 0x9aa2ab, roughness = 0.3) {
  return solid({ color, metalness: 1, roughness });
}

/** Animated water plane material. Call `mat.userData.tick(dt)` each frame. */
export function water(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color ?? 0x18384a,
    roughness: 0.08,
    metalness: 0.0,
    transmission: o.transmission ?? 0.6,
    thickness: 2.0,
    ior: 1.33,
    transparent: true,
    opacity: o.opacity ?? 0.92,
    side: THREE.DoubleSide,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });
  const set = makeTextureSet('snow', { size: 256, repeat: o.repeat ?? 8, seed: 4 });
  m.normalMap = set.normalMap;
  m.normalScale = new THREE.Vector2(0.35, 0.35);
  let t = 0;
  m.userData.tick = (dt) => {
    t += dt;
    m.normalMap.offset.set(Math.sin(t * 0.06) * 0.5 + t * 0.012, t * 0.02);
  };
  return m;
}

/** Vertically graded sky dome material (BackSide sphere). */
export function skyDome(top = 0x2a4a78, bottom = 0xcfd9e6) {
  const m = new THREE.MeshBasicMaterial({
    map: makeGradientTexture(top, bottom),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  return m;
}

/** Decal-ish unlit sprite material from an arbitrary canvas painter fn. */
export function painted(width, height, draw, o = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  draw(c.getContext('2d'), width, height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  // Note: three warns on any explicitly-undefined constructor parameter, so the
  // emissive pair is attached after construction rather than passed as undefined.
  const m = new THREE.MeshStandardMaterial({
    map: t,
    transparent: o.transparent ?? true,
    roughness: o.roughness ?? 0.8,
    metalness: 0,
    side: o.side ?? THREE.DoubleSide,
    alphaTest: o.alphaTest ?? 0.02,
    depthWrite: o.depthWrite ?? true,
  });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
    m.emissiveMap = t;
  }
  return m;
}

/**
 * Text-on-a-plane material — exit signs, room numbers, graffiti, posters.
 * Returns { material, aspect } so callers can size the plane correctly.
 */
export function textMaterial(text, o = {}) {
  const fs = o.fontSize ?? 96;
  const font = o.font ?? `bold ${fs}px "Arial Black", Impact, sans-serif`;
  const pad = o.pad ?? fs * 0.35;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const lines = String(text).split('\n');
  const w = Math.ceil(Math.max(...lines.map(l => probe.measureText(l).width)) + pad * 2);
  const h = Math.ceil(lines.length * fs * 1.18 + pad * 2);
  const material = painted(Math.max(4, w), Math.max(4, h), (ctx, W, H) => {
    if (o.background !== undefined) {
      ctx.fillStyle = new THREE.Color(o.background).getStyle();
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.clearRect(0, 0, W, H);
    }
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = new THREE.Color(o.color ?? 0xffffff).getStyle();
    if (o.stroke !== undefined) {
      ctx.lineWidth = o.strokeWidth ?? fs * 0.08;
      ctx.strokeStyle = new THREE.Color(o.stroke).getStyle();
    }
    lines.forEach((l, i) => {
      const y = H / 2 + (i - (lines.length - 1) / 2) * fs * 1.18;
      if (o.stroke !== undefined) ctx.strokeText(l, W / 2, y);
      ctx.fillText(l, W / 2, y);
    });
  }, {
    transparent: o.background === undefined,
    emissive: o.emissive,
    emissiveIntensity: o.emissiveIntensity ?? 1.6,
    side: o.side,
  });
  return { material, aspect: w / h, width: w, height: h };
}

export function disposeMaterials() {
  for (const m of MATS.values()) m.dispose();
  MATS.clear();
}

// A convenience bundle passed into every arena as `ctx.mat`.
export const mat = {
  surface, solid, emissive, glass, glassCheap, metal, water, skyDome,
  painted, textMaterial,
};
