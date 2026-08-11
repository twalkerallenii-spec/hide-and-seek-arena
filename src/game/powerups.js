// Power-up runtime. Holds what the player is carrying, applies effects to the
// controller / seeker / renderer while active, and cleans up on expiry.

import * as THREE from 'three';
import { POWERUPS } from './content.js';
import { audio } from '../engine/audio.js';

export class PowerupSystem {
  constructor(ctxRefs) {
    this.refs = ctxRefs;         // { controller, seeker, flashlight, renderer, scene, world }
    this.held = [];              // ids, max = slots
    this.slots = 1;
    this.active = new Map();     // id -> { until }
    this.onChange = null;
    this._t = 0;
    this._nvLight = null;
    this._decoyMesh = null;
    this.doubleJumpAvailable = false;
    this._wasGround = true;
  }

  reset() {
    this.held.length = 0;
    for (const id of [...this.active.keys()]) this._end(id);
    this.active.clear();
    this._removeDecoy();
    // A grade snapshot belongs to the arena it was taken in. Loading a new
    // arena builds a fresh grade pass, so a stale snapshot must never be
    // replayed into it.
    this._gradeBefore = null;
    if (this._nvLight) { this._nvLight.removeFromParent(); this._nvLight = null; }
    this.doubleJumpAvailable = false;
    this._airJumpUsed = false;
    const { seeker, controller, monster } = this.refs;
    if (seeker) { seeker.ghosted = false; seeker.paused = false; seeker.decoy = null; }
    if (monster) { monster.ghosted = false; monster.paused = false; monster.decoy = null; }
    if (controller) controller.silenced = false;
    this.onChange?.();
  }

  pick(id) {
    if (!POWERUPS[id]) return false;
    if (this.held.length >= this.slots) this.held.shift();
    this.held.push(id);
    this.onChange?.();
    return true;
  }

  get current() { return this.held[this.held.length - 1] || null; }

  isActive(id) { return this.active.has(id); }

  use() {
    const id = this.held.pop();
    if (!id) return null;
    this.onChange?.();
    this._begin(id);
    return id;
  }

  _begin(id) {
    const def = POWERUPS[id];
    const { controller, seeker, world, pickups, monster } = this.refs;
    audio.ui('confirm');

    switch (id) {
      case 'dash': {
        const dir = new THREE.Vector3();
        controller.camera.getWorldDirection(dir);
        dir.y = 0; dir.normalize();
        // Set rather than add, and lift hard enough to actually break ground
        // contact — at 2.2 m/s the capsule stayed grounded for two or three
        // frames and exp(-11*dt) friction ate most of the impulse.
        controller.velocity.x = dir.x * 18;
        controller.velocity.z = dir.z * 18;
        controller.velocity.y = Math.max(controller.velocity.y, 4.0);
        controller.onGround = false;
        audio.play({ noise: true, dur: 0.3, gain: 0.14, filter: 3000, filterEnd: 400, q: 2 });
        break;
      }
      case 'pulse': {
        pickups?.reveal(20);
        audio.play({ type: 'sine', freq: 220, freqEnd: 1600, dur: 0.7, gain: 0.12, filter: 4000 });
        break;
      }
      case 'decoy': {
        this._dropDecoy();
        break;
      }
      // Each of these has to hit BOTH antagonists: the abstract sweep used in
      // solo mode, and the monster that actually hunts you in round mode.
      case 'ghost':
        seeker.ghosted = true;
        if (monster) monster.ghosted = true;
        break;
      case 'silence':
        seeker.fearRate *= 0.5;
        controller.silenced = true;
        break;
      case 'timefreeze':
        seeker.paused = true;
        if (monster) monster.paused = true;
        break;
      case 'nightvision': this._enableNightVision(true); break;
      case 'jumpjet': this.doubleJumpAvailable = true; break;
    }

    if (def.duration > 0) {
      this.active.set(id, { until: this._t + def.duration });
    }
    this.onChange?.();
  }

  _end(id) {
    const { seeker, controller, monster } = this.refs;
    switch (id) {
      case 'ghost':
        seeker.ghosted = false;
        if (monster) monster.ghosted = false;
        break;
      case 'silence':
        seeker.fearRate = this.refs.baseFearRate ?? 1;
        controller.silenced = false;
        break;
      case 'timefreeze':
        seeker.paused = false;
        if (monster) monster.paused = false;
        break;
      case 'nightvision': this._enableNightVision(false); break;
      case 'jumpjet': this.doubleJumpAvailable = false; break;
      case 'decoy': this._removeDecoy(); break;
    }
    this.active.delete(id);
    this.onChange?.();
  }

  _enableNightVision(on) {
    const { renderer, scene } = this.refs;
    if (on) {
      if (!this._nvLight) {
        this._nvLight = new THREE.HemisphereLight(0x9effc0, 0x224030, 1.5);
        scene.add(this._nvLight);
      }
      // Snapshot whatever grade the arena chose so we can put it back exactly,
      // rather than resetting to a generic default and flattening the look.
      // Guard against a double-apply overwriting the saved grade with the
      // night-vision grade itself, which would make it permanent.
      if (!this._gradeBefore) this._gradeBefore = renderer.getGrade();
      renderer.setGrade({ exposure: 1.6, saturation: 0.35, gain: [0.55, 1.25, 0.7], lift: [0.02, 0.06, 0.02] });
    } else {
      if (this._nvLight) { scene.remove(this._nvLight); this._nvLight = null; }
      if (this._gradeBefore) renderer.setGrade(this._gradeBefore);
      this._gradeBefore = null;
    }
  }

  _dropDecoy() {
    const { controller, seeker, scene } = this.refs;
    this._removeDecoy();
    const pos = controller.position;
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshStandardMaterial({ color: 0x2a1020, emissive: 0xff3fa4, emissiveIntensity: 3 })
    );
    m.position.set(pos.x, pos.y + 0.9, pos.z);
    m.userData.collide = false;
    const l = new THREE.PointLight(0xff3fa4, 3, 9, 2);
    m.add(l);
    scene.add(m);
    this._decoyMesh = m;
    this._decoyLight = l;
    seeker.dropDecoy(m.position);
    if (this.refs.monster) this.refs.monster.decoy = m.position.clone();
  }

  _removeDecoy() {
    if (this._decoyMesh) {
      this._decoyMesh.removeFromParent();
      this._decoyMesh.geometry.dispose();
      this._decoyMesh.material.dispose();
      if (this._decoyLight) { this._decoyLight.dispose?.(); this._decoyLight = null; }
      this._decoyMesh = null;
    }
    if (this.refs.seeker) this.refs.seeker.decoy = null;
    if (this.refs.monster) this.refs.monster.decoy = null;
  }

  update(dt) {
    this._t += dt;
    for (const [id, s] of this.active) {
      if (this._t >= s.until) this._end(id);
    }
    if (this._decoyMesh) {
      this._decoyMesh.rotation.y += dt * 2;
      this._decoyMesh.position.y += Math.sin(this._t * 3) * 0.002;
    }

    // UPDRAFT: grant a mid-air jump.
    const c = this.refs.controller;
    if (this.doubleJumpAvailable && c) {
      if (c.onGround) { this._wasGround = true; this._airJumpUsed = false; }
      else if (this._wasGround) { this._wasGround = false; }
      if (!c.onGround && !this._airJumpUsed && c.jumpBuffer > 0) {
        c.velocity.y = c.jumpSpeed * 0.92;
        c.jumpBuffer = 0;
        this._airJumpUsed = true;
        audio.play({ type: 'sine', freq: 500, freqEnd: 900, dur: 0.2, gain: 0.09 });
      }
    }
  }

  /** For the HUD: remaining seconds on the longest-running effect. */
  activeSummary() {
    let best = null;
    for (const [id, s] of this.active) {
      const left = s.until - this._t;
      if (!best || left > best.left) best = { id, left, def: POWERUPS[id] };
    }
    return best;
  }
}
