// The waiting area.
//
// During the thirty-second hide phase the Seeker has to be somewhere, and
// freezing them in place in the middle of the arena is the wrong answer: they
// can still see where people run. So they get an actual room — a sealed holding
// cell built far above the map, with the countdown on the wall.
//
// It is a real place rather than a black screen because being able to walk two
// steps and look around makes thirty seconds feel like anticipation instead of
// a loading pause.

import * as THREE from 'three';
import { mat } from '../engine/materials.js';
import { props } from '../engine/props.js';

/** Parked well above any arena so nothing can see in and nothing leaks out. */
export const WAIT_ORIGIN = new THREE.Vector3(0, 4000, 0);

export class WaitRoom {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'waitroom';
    this.root.position.copy(WAIT_ORIGIN);
    this.root.visible = false;
    scene.add(this.root);
    this.built = false;
    this._t = 0;
  }

  build() {
    if (this.built) return this;
    const W = 9, D = 9, H = 4.2;

    const wall = mat.surface('concrete', { color: 0x2a2d33, repeat: 3, size: 256 });
    const floor = mat.surface('metalPanel', { color: 0x22262b, repeat: 4, size: 256, panels: 3 });

    this.root.add(props.ground(W, D, floor));
    this.root.add(props.ceiling(W, D, H, wall));
    for (const [x1, z1, x2, z2] of [
      [-W / 2, -D / 2, W / 2, -D / 2], [-W / 2, D / 2, W / 2, D / 2],
      [-W / 2, -D / 2, -W / 2, D / 2], [W / 2, -D / 2, W / 2, D / 2],
    ]) this.root.add(props.wallBetween(x1, z1, x2, z2, H, 0.4, wall));

    // Bars on the far wall — you are being held, not stored.
    const barMat = mat.metal(0x6a4038, 0.55);
    for (let i = -3; i <= 3; i++) {
      const bar = props.cyl(0.05, 0.05, H - 0.2, barMat, { seg: 8, collide: false });
      bar.position.set(i * 0.62, 0.1, -D / 2 + 0.5);
      this.root.add(bar);
    }

    // A single caged lamp, swinging.
    this.lamp = props.wallLamp({ color: 0xff6a3a, intensity: 5 });
    this.lamp.position.set(0, H - 0.5, D / 2 - 0.4);
    this.lamp.rotation.y = Math.PI;
    this.root.add(this.lamp);

    this.light = new THREE.PointLight(0xff5a2a, 6, 16, 2);
    this.light.position.set(0, H - 0.8, 0);
    this.root.add(this.light);
    this.root.add(new THREE.AmbientLight(0x241a18, 1.2));

    // The countdown, painted on the wall and repainted each second.
    this._canvas = document.createElement('canvas');
    this._canvas.width = 512; this._canvas.height = 256;
    this._ctx = this._canvas.getContext('2d');
    this._tex = new THREE.CanvasTexture(this._canvas);
    this._tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 2.2),
      new THREE.MeshStandardMaterial({
        map: this._tex, emissive: 0xffffff, emissiveMap: this._tex,
        emissiveIntensity: 1.1, roughness: 0.7,
      })
    );
    panel.position.set(0, 2.1, -D / 2 + 0.26);
    panel.userData.collide = false;
    this.root.add(panel);
    this._paint('--');

    // Everything here is solid so the Seeker cannot wander out of the world.
    this.root.traverse(o => { if (o.isMesh && o.userData.collide !== false) o.userData.collide = true; });
    this.built = true;
    return this;
  }

  _paint(text, sub = 'THE HUNT BEGINS IN') {
    const c = this._ctx, W = 512, H = 256;
    c.fillStyle = '#0a0608';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,90,40,.5)';
    c.lineWidth = 6;
    c.strokeRect(10, 10, W - 20, H - 20);
    c.textAlign = 'center';
    c.fillStyle = '#ff8a5a';
    c.font = '600 26px ui-monospace, monospace';
    c.fillText(sub, W / 2, 62);
    c.fillStyle = '#ffd7c0';
    c.font = 'bold 130px "Arial Black", Impact, sans-serif';
    c.fillText(String(text), W / 2, 190);
    this._tex.needsUpdate = true;
  }

  /** Put the player in. Returns the spot to teleport them to. */
  enter() {
    this.build();
    this.root.visible = true;
    return WAIT_ORIGIN.clone().add(new THREE.Vector3(0, 0.1, 2.5));
  }

  leave() { this.root.visible = false; }

  update(dt, secondsLeft) {
    if (!this.built || !this.root.visible) return;
    this._t += dt;
    const n = Math.max(0, Math.ceil(secondsLeft));
    if (n !== this._shown) { this._shown = n; this._paint(n); }
    if (this.lamp) this.lamp.rotation.z = Math.sin(this._t * 1.1) * 0.08;
    this.light.intensity = 5 + Math.sin(this._t * 3.1) * 0.7 + (n <= 5 ? Math.sin(this._t * 14) * 1.6 : 0);
  }

  dispose() { this.root.removeFromParent(); this.built = false; }
}
