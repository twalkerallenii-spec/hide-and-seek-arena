// Proximity meshing.
//
// A 200 m arena renders every wall, prop and light fixture in it, including the
// eighty metres of corridor behind you that fog has already swallowed. This
// buckets the world into a horizontal grid once at load, then each frame shows
// only the buckets near the camera and hides the rest.
//
// It is deliberately NOT frustum culling — three already does that per object.
// This is about draw calls and shadow passes: an object that is behind you and
// beyond the fog contributes nothing but still costs a draw call, and worse,
// still gets re-drawn into every shadow map.
//
// Objects are only ever hidden, never unloaded, so there is no hitch when you
// turn round. Anything without a finite bounding box — sky domes, the void grid,
// instanced fields that span the whole map — is marked always-visible and left
// alone.

import * as THREE from 'three';

const _box = new THREE.Box3();
const _c = new THREE.Vector3();

export class ProximityGrid {
  /**
   * @param {number} cell    bucket size in metres
   * @param {number} radius  how far to keep things visible
   */
  constructor({ cell = 24, radius = 90 } = {}) {
    this.cell = cell;
    this.radius = radius;
    this.buckets = new Map();      // "x,z" -> { objects: [], visible: bool }
    this.always = [];              // too big to bucket, or explicitly exempt
    this.enabled = true;
    this.hidden = 0;
    this.shown = 0;
    this._lastKey = null;
  }

  key(x, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  /**
   * Bucket a built arena. Call once, after build, before play.
   * Only direct children of `root` are considered — arenas already merge their
   * geometry into a handful of frozen chunks, and splitting those apart would
   * undo the batching they were merged for.
   */
  build(root, { maxSpan = 70 } = {}) {
    this.buckets.clear();
    this.always.length = 0;
    root.updateMatrixWorld(true);

    for (const child of root.children) {
      if (child.isLight || child.userData.alwaysVisible) { this.always.push(child); continue; }

      _box.makeEmpty();
      try { _box.setFromObject(child); } catch { this.always.push(child); continue; }
      if (_box.isEmpty() || !isFinite(_box.min.x) || !isFinite(_box.max.x)) {
        this.always.push(child);
        continue;
      }
      const sx = _box.max.x - _box.min.x;
      const sz = _box.max.z - _box.min.z;
      // A merged zone shell can be 150 m across. Hiding it would blink half the
      // arena out at once, so anything that big stays on permanently.
      if (sx > maxSpan || sz > maxSpan) { this.always.push(child); continue; }

      _box.getCenter(_c);
      const k = this.key(_c.x, _c.z);
      let b = this.buckets.get(k);
      if (!b) { b = { objects: [], visible: true, x: _c.x, z: _c.z }; this.buckets.set(k, b); }
      b.objects.push(child);
      child.userData._proxBucket = k;
    }
    return this;
  }

  /** Show buckets within radius of (x,z); hide the rest. Cheap enough per frame. */
  update(x, z) {
    if (!this.enabled || !this.buckets.size) return;

    // Only recompute when the camera crosses into a new cell.
    const k = this.key(x, z);
    if (k === this._lastKey) return;
    this._lastKey = k;

    const r2 = this.radius * this.radius;
    let shown = 0, hidden = 0;
    for (const b of this.buckets.values()) {
      const dx = b.x - x, dz = b.z - z;
      const near = dx * dx + dz * dz <= r2;
      if (near !== b.visible) {
        b.visible = near;
        for (const o of b.objects) o.visible = near;
      }
      if (near) shown++; else hidden++;
    }
    this.shown = shown;
    this.hidden = hidden;
  }

  /** Put everything back — used when leaving an arena or entering free camera. */
  showAll() {
    for (const b of this.buckets.values()) {
      if (b.visible) continue;
      b.visible = true;
      for (const o of b.objects) o.visible = true;
    }
    this._lastKey = null;
  }

  clear() {
    this.buckets.clear();
    this.always.length = 0;
    this._lastKey = null;
  }

  get stats() {
    let objects = 0;
    for (const b of this.buckets.values()) objects += b.objects.length;
    return {
      buckets: this.buckets.size,
      objects,
      always: this.always.length,
      shown: this.shown,
      hidden: this.hidden,
    };
  }
}
