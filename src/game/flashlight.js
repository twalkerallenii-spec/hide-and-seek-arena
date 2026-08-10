// The flashlight — the only "equipment" the player carries, and the thing every
// Signature (skin) reskins. It lags behind the camera slightly so sweeping the
// view feels weighty, and it burns a battery you have to top up in the arena.

import * as THREE from 'three';

export class Flashlight {
  constructor(scene, camera) {
    this.camera = camera;
    this.scene = scene;

    this.spot = new THREE.SpotLight(0xffe9c4, 0, 24, 0.42, 0.45, 1.4);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.2;
    this.spot.shadow.camera.far = 40;
    this.spot.shadow.bias = -0.0008;
    this.spot.shadow.normalBias = 0.03;
    this.target = new THREE.Object3D();
    scene.add(this.spot, this.target);
    this.spot.target = this.target;

    // A short fill light so the player isn't standing in a void when the
    // flashlight is off — reads as ambient bounce off their own body.
    this.fill = new THREE.PointLight(0xbfd0e0, 0.35, 4.5, 2);
    scene.add(this.fill);

    this.on = false;
    this.battery = 1;
    this.drain = 0.014;         // per second
    this.capacity = 1;
    this.enabled = true;

    this._aimPos = new THREE.Vector3();
    this._aimDir = new THREE.Vector3();
    this._lagPos = new THREE.Vector3();
    this._lagDir = new THREE.Vector3(0, 0, -1);
    this._flicker = 0;
    this.skin = null;
  }

  applySkin(skin) {
    this.skin = skin;
    this.spot.color.setHex(skin.light);
    this.spot.angle = skin.cone;
    this.spot.distance = skin.range;
    this.baseIntensity = skin.intensity;
    this.fill.color.setHex(skin.light);
  }

  setCapacity(mult) { this.capacity = mult; }

  toggle() {
    if (!this.enabled) return false;
    if (!this.on && this.battery <= 0.02) return false;
    this.on = !this.on;
    return this.on;
  }

  recharge(amount = 0.45) {
    this.battery = Math.min(1, this.battery + amount);
  }

  update(dt) {
    const cam = this.camera;
    cam.getWorldPosition(this._aimPos);
    cam.getWorldDirection(this._aimDir);

    // Lag the beam behind the camera for a hand-held feel.
    this._lagPos.lerp(this._aimPos, Math.min(1, dt * 22));
    this._lagDir.lerp(this._aimDir, Math.min(1, dt * 11)).normalize();

    // Offset to the right and slightly down, like it's actually being held.
    const right = new THREE.Vector3().crossVectors(this._lagDir, cam.up).normalize();
    this.spot.position.copy(this._lagPos).addScaledVector(right, 0.22).addScaledVector(cam.up, -0.14);
    this.target.position.copy(this.spot.position).addScaledVector(this._lagDir, 12);

    this.fill.position.copy(this._aimPos);

    if (this.on && this.enabled) {
      this.battery = Math.max(0, this.battery - (this.drain / this.capacity) * dt);
      if (this.battery <= 0) this.on = false;
    }

    // Dim and stutter as the cell dies — a real warning, not just a number.
    let target = 0;
    if (this.on) {
      const dying = this.battery < 0.18 ? this.battery / 0.18 : 1;
      this._flicker += dt * (dying < 1 ? 26 : 3);
      const stutter = dying < 1
        ? (Math.sin(this._flicker) * 0.5 + 0.5) * (1 - dying) + dying
        : 1;
      target = this.baseIntensity * (0.35 + dying * 0.65) * stutter;
    }
    this.spot.intensity += (target - this.spot.intensity) * Math.min(1, dt * 16);
    this.fill.intensity = 0.18 + (this.on ? 0.3 : 0) * this.battery;
  }

  dispose() {
    this.scene.remove(this.spot, this.target, this.fill);
    this.spot.dispose();
  }
}
