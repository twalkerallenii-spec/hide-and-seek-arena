// The Seeker.
//
// There is no seeker *character* in this game — the antagonist is a presence
// that sweeps the arena in expanding rings of light. When a ring passes over
// you and you are not concealed, you are Spotted.
//
// The Fear model is lifted from the project's own design notes: a 0..100 meter
// that rises with proximity and exposure, degrades control past 60, and blooms
// the screen red past 80. Fear never kills you; it makes you easy to find.

import * as THREE from 'three';
import { audio } from '../engine/audio.js';

const RING_SEGMENTS = 96;

export class Seeker {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'seeker';
    scene.add(this.group);

    this.origin = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.rings = [];
    this.hidingSpots = [];
    this.bounds = 100;

    this.interval = 9.0;        // seconds between sweeps
    this.ringSpeed = 26;        // metres/second
    this.ringLife = 6.0;
    this.aggression = 1.0;

    this.timer = 3.0;
    this.enabled = true;
    this.paused = false;        // STILLNESS power-up
    this.ghosted = false;       // GHOST power-up
    this.stealth = 0;           // 0..1 from skin / SOFT SOLES
    this.decoy = null;
    this.verticalBand = 4.0;    // metres of height the sweep covers for free
    this.verticalFalloff = 9.0; // ...then it fades out over this much more


    this.fear = 0;              // 0..100
    this.fearRate = 1.0;
    this.spottedCount = 0;
    this.lastSpotted = -99;
    this.suspicion = 0;         // 0..1 — how well it knows where you are

    this.onSpotted = null;
    this.onPing = null;
    this._t = 0;

    this._ringGeo = new THREE.RingGeometry(0.94, 1.0, RING_SEGMENTS);
    this._ringGeo.rotateX(-Math.PI / 2);
  }

  configure({ difficulty = 3, bounds = 100, spawn = [0, 0, 0], hidingSpots = [], hunted = false }) {
    this.bounds = bounds;
    this.hidingSpots = hidingSpots;
    this.aggression = 0.6 + difficulty * 0.18;
    this.interval = (13.5 - difficulty * 1.35) / (hunted ? 2 : 1);
    this.ringSpeed = (18 + difficulty * 3.4) * (hunted ? 1.6 : 1);
    this.ringLife = Math.max(3.5, bounds / this.ringSpeed * 1.15);
    this.origin.set(spawn[0] + bounds * 0.55, spawn[1], spawn[2] - bounds * 0.4);
    this.target.copy(this.origin);
    this.timer = 4.0;
    this.fear = 0;
    this.spottedCount = 0;
    this.suspicion = 0.25;
    this._t = 0;
    this.lastSpotted = -99;
    this.paused = false;
    this.ghosted = false;
    this.decoy = null;
    this.clearRings();
  }

  clearRings() {
    for (const r of this.rings) { this.group.remove(r.mesh); r.mesh.geometry?.dispose?.(); }
    this.rings.length = 0;
  }

  reset() { this.clearRings(); this.fear = 0; this.spottedCount = 0; this.timer = 4; }

  dropDecoy(pos) {
    this.decoy = { pos: pos.clone(), until: this._t + 18 };
  }

  /** True if the player's position counts as concealed. */
  concealed(p, crouching) {
    for (const s of this.hidingSpots) {
      const d = s.pos.distanceTo(p);
      if (d < s.radius * (crouching ? 1.35 : 1.0)) return true;
    }
    return false;
  }

  _spawnRing() {
    // The sweep originates from wherever the Seeker currently believes you are,
    // blended with a wandering point so it never becomes perfectly predictable.
    const mesh = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({
      color: 0x6fe4ff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
    mesh.position.copy(this.origin);
    mesh.position.y += 0.06;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.rings.push({ mesh, radius: 0.5, age: 0, hit: false });
    audio.ping(0.5);
    this.onPing?.(this.origin.clone());
  }

  update(dt, player, opts = {}) {
    if (!this.enabled) return;
    this._t += dt;
    const { crouching = false, sprinting = false, moving = false, lightOn = false } = opts;

    // --- where does it think you are? ---------------------------------------
    // Noise makes it hunt loosely; sprinting, lights and open ground sharpen it.
    const { silenced = false } = opts;
    let exposure = 0.18;
    if (moving) exposure += 0.14;
    if (sprinting) exposure += 0.42;
    if (lightOn) exposure += 0.30;
    if (crouching) exposure -= 0.18;
    // SILENCE removes the noise you make; it cannot hide your light.
    if (silenced) exposure = Math.min(exposure, 0.18 + (lightOn ? 0.30 : 0)) * 0.45;
    exposure *= (1 - this.stealth);
    exposure = Math.max(0, exposure);

    this.suspicion += (exposure - this.suspicion) * Math.min(1, dt * 0.35);
    this.suspicion = Math.max(0, Math.min(1, this.suspicion));

    const aim = (this.decoy && this._t < this.decoy.until) ? this.decoy.pos : player;
    // Blend between a wandering point and the player's actual position.
    const wander = new THREE.Vector3(
      Math.sin(this._t * 0.13) * this.bounds * 0.6,
      aim.y,
      Math.cos(this._t * 0.097) * this.bounds * 0.6
    );
    this.target.lerpVectors(wander, aim, this.suspicion * 0.85);
    this.origin.lerp(this.target, Math.min(1, dt * 0.55));
    this.origin.y = aim.y;

    // --- sweep cadence -------------------------------------------------------
    if (!this.paused) {
      this.timer -= dt * this.aggression;
      if (this.timer <= 0) {
        this.timer = this.interval * (0.8 + this.suspicion * 0.0 + 0.4 * (1 - this.suspicion));
        this._spawnRing();
      }
    }

    // --- advance rings and test the player ----------------------------------
    const conceal = this.concealed(player, crouching);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      if (!this.paused) {
        r.age += dt;
        r.radius += this.ringSpeed * dt;
      }
      const t = r.age / this.ringLife;
      r.mesh.scale.setScalar(r.radius);
      r.mesh.material.opacity = Math.max(0, Math.sin(Math.min(1, t) * Math.PI)) * 0.45;

      if (!r.hit) {
        const d = Math.hypot(player.x - r.mesh.position.x, player.z - r.mesh.position.z);
        const band = 1.6 + this.ringSpeed * dt;
        if (Math.abs(d - r.radius) < band) {
          r.hit = true;
          // The ring is a horizontal wave, so height is real cover: it loses
          // grip on you the further you are above or below the plane it was
          // cast on. Vertical arenas would be pointless otherwise.
          const dy = Math.abs(player.y - r.mesh.position.y);
          const grip = 1 - Math.min(1, Math.max(0, dy - this.verticalBand) / this.verticalFalloff);
          if (grip <= 0) {
            this.fear = Math.min(100, this.fear + 2);      // heard it pass, far below
          } else if (!conceal && !this.ghosted && grip > 0.35) {
            this._spot(d);
          } else {
            this.fear = Math.min(100, this.fear + 6 * grip);  // near miss still rattles you
          }
        }
      }

      if (r.age > this.ringLife || r.radius > this.bounds * 2.4) {
        this.group.remove(r.mesh);
        this.rings.splice(i, 1);
      }
    }

    // --- fear ----------------------------------------------------------------
    const nearest = this.rings.reduce((best, r) => {
      const d = Math.abs(Math.hypot(player.x - r.mesh.position.x, player.z - r.mesh.position.z) - r.radius);
      return Math.min(best, d);
    }, 999);

    let dFear = -7 * dt;                                  // baseline decay
    if (nearest < 30) dFear += (1 - nearest / 30) * 16 * dt;
    if (!conceal && this.suspicion > 0.5) dFear += 5 * dt;
    if (conceal) dFear -= 9 * dt;
    dFear *= this.fearRate;
    this.fear = Math.max(0, Math.min(100, this.fear + dFear));
  }

  _spot(distance) {
    this.spottedCount++;
    this.lastSpotted = this._t;
    this.suspicion = 1.0;
    this.fear = Math.min(100, this.fear + 42);
    audio.spotted();
    this.onSpotted?.(distance);
  }

  /** 0..1 control-degradation factor driven by fear. */
  get panic() {
    return this.fear <= 60 ? 0 : (this.fear - 60) / 40;
  }
}
