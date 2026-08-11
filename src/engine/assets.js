// Asset layer.
//
// The twelve arenas generate their geometry procedurally, but the round mode
// needs real characters: a rigged monster for the Seeker, rigged hiders, and a
// kit of authored props to dress the worlds with. This module owns loading,
// caching, cloning and instancing for all of it.
//
// Everything here is CC0 — KayKit (Kay Lousberg) for the models and animations,
// Screaming Brain Studios for the image textures. See assets/manifest.json.
//
// Two rules that matter:
//  1. Nothing is fetched until something asks for it. A 200 m arena that uses
//     no props costs zero bytes.
//  2. A loaded file is parsed exactly once. `instance()` hands out clones, so
//     forty barrels share one geometry and one material.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const BASE = new URL('../../assets/', import.meta.url).href;

const gltf = new GLTFLoader();
const fbx = new FBXLoader();
const texLoader = new THREE.TextureLoader();

/** url -> Promise<Object3D> (the pristine original; never added to a scene) */
const CACHE = new Map();
/** url -> Promise<Texture> */
const TEX_CACHE = new Map();

let manifest = null;
let manifestPromise = null;
let renderer = null;

export function setAssetRenderer(r) { renderer = r; }

/** Load and cache assets/manifest.json. */
export function loadManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(BASE + 'manifest.json')
    .then(r => {
      if (!r.ok) throw new Error('manifest ' + r.status);
      return r.json();
    })
    .then(m => (manifest = m))
    .catch(e => {
      console.warn('asset manifest unavailable — props disabled', e);
      manifest = { props: [], propGroups: {}, chars: [], anims: [], textures: [] };
      return manifest;
    });
  return manifestPromise;
}

export function getManifest() { return manifest; }

// ---------------------------------------------------------------------------
// Raw loading
// ---------------------------------------------------------------------------

function loadGLB(url) {
  if (CACHE.has(url)) return CACHE.get(url);
  const p = new Promise((res, rej) => {
    gltf.load(url, (g) => {
      const root = g.scene || g.scenes[0];
      root.animations = g.animations || [];
      prepare(root);
      res(root);
    }, undefined, rej);
  }).catch(e => {
    console.warn('failed to load ' + url, e);
    return null;
  });
  CACHE.set(url, p);
  return p;
}

function loadFBX(url) {
  if (CACHE.has(url)) return CACHE.get(url);
  const p = new Promise((res, rej) => {
    fbx.load(url, (o) => { prepare(o); res(o); }, undefined, rej);
  }).catch(e => {
    console.warn('failed to load ' + url, e);
    return null;
  });
  CACHE.set(url, p);
  return p;
}

/** Shared post-load fixes: colour space, shadows, anisotropy, no collision. */
function prepare(root) {
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  root.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.collide = false;      // authored props are decor unless proxied
    o.frustumCulled = true;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      if (m.map) {
        m.map.colorSpace = THREE.SRGBColorSpace;
        m.map.anisotropy = Math.min(8, maxAniso);
      }
      // KayKit ships flat-shaded vertex-coloured kit pieces; keep them crisp.
      if (m.isMeshStandardMaterial) m.envMapIntensity = 0.7;
      m.side = THREE.FrontSide;
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const prop = (name) => loadGLB(`${BASE}models/props/${name}.glb`);
export const character = (name) => loadGLB(`${BASE}models/chars/${name}.glb`);
export const animSet = (name) => loadGLB(`${BASE}models/anims/${name}.glb`);
export const monster = () => loadFBX(`${BASE}models/monster/monster.fbx`);

/** A 512² CC0 image texture, tiled. */
export function imageTexture(file, repeat = 1) {
  const key = file + '|' + repeat;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const p = new Promise((res) => {
    texLoader.load(`${BASE}textures/${file}`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
      res(t);
    }, undefined, () => res(null));
  });
  TEX_CACHE.set(key, p);
  return p;
}

/**
 * A ready-to-place copy of a loaded model. Skinned meshes go through
 * SkeletonUtils so each copy gets its own bones and can animate independently;
 * everything else is a plain clone that shares geometry and material.
 */
export function instance(root) {
  if (!root) return null;
  let skinned = false;
  root.traverse(o => { if (o.isSkinnedMesh) skinned = true; });
  const copy = skinned ? skeletonClone(root) : root.clone(true);
  copy.animations = root.animations || [];
  return copy;
}

/** Load and instance in one step. */
export async function spawnProp(name) { return instance(await prop(name)); }

/**
 * Preload a batch, reporting progress. Returns when everything has settled —
 * a failed asset resolves to null rather than rejecting the batch.
 */
export async function preload(list, onProgress) {
  let done = 0;
  const total = list.length || 1;
  const results = await Promise.all(list.map(async (item) => {
    const r = await item;
    onProgress?.(++done / total);
    return r;
  }));
  return results;
}

/**
 * Collapse many copies of one prop into a single InstancedMesh per submesh.
 * The right way to scatter fifty barrels.
 *
 * @param {THREE.Object3D} root  a loaded prop
 * @param {Array<{position:THREE.Vector3, rotation?:number, scale?:number}>} placements
 */
export function instancedProp(root, placements) {
  if (!root || !placements.length) return null;
  const out = new THREE.Group();
  const dummy = new THREE.Object3D();
  root.updateMatrixWorld(true);

  const parts = [];
  root.traverse(o => {
    if (o.isMesh && !o.isSkinnedMesh) parts.push(o);
  });

  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    im.castShadow = true;
    im.receiveShadow = true;
    im.userData.collide = false;
    // Bake the part's own transform within the prop so multi-part props hold together.
    const local = part.matrixWorld.clone();
    const m = new THREE.Matrix4();
    placements.forEach((p, i) => {
      dummy.position.copy(p.position);
      dummy.rotation.set(0, p.rotation ?? 0, 0);
      dummy.scale.setScalar(p.scale ?? 1);
      dummy.updateMatrix();
      m.multiplyMatrices(dummy.matrix, local);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    out.add(im);
  }
  return out;
}

/** Scale a model so its bounding box is `height` metres tall, feet at y=0. */
export function normaliseHeight(obj, height) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.y <= 0) return obj;
  const s = height / size.y;
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= b2.min.y;
  return obj;
}

export function disposeAssets() {
  CACHE.clear();
  TEX_CACHE.clear();
}

export const assets = {
  loadManifest, getManifest, prop, character, animSet, monster,
  imageTexture, instance, spawnProp, preload, instancedProp, normaliseHeight,
};
