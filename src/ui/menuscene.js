// The living backdrop behind the main menu.
//
// A slow orbit around a floating cluster of arena "shards" in a dark volume,
// with drifting dust, a rotating light rig and a sweep ring that echoes the
// Seeker. Selecting an arena in the UI re-tints the whole rig to that arena's
// palette, so the menu feels connected to what you're about to load.

import * as THREE from 'three';
import { makeRNG } from '../engine/rng.js';
import { mat } from '../engine/materials.js';
import { props } from '../engine/props.js';

export class MenuScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070b);
    this.scene.fog = new THREE.FogExp2(0x05070b, 0.021);
    this.scene.environment = renderer.roomEnv;
    this.scene.environmentIntensity = 0.35;

    this.t = 0;
    this.shards = [];
    this.targetTint = new THREE.Color(0x46e0ff);
    this.tint = new THREE.Color(0x46e0ff);

    this._build();
  }

  _build() {
    const rng = makeRNG('menu-2026');
    const g = new THREE.Group();
    this.scene.add(g);
    this.root = g;

    // --- floor: a wet black plane that catches every highlight --------------
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.16, metalness: 0.65, envMapIntensity: 1.4 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -9;
    floor.receiveShadow = true;
    g.add(floor);

    // --- the shard cluster ---------------------------------------------------
    const palettes = [
      0xd9c98c, 0xff3fa4, 0xf0a860, 0x46e0ff, 0x3fbfa0, 0xdbe8f5,
      0xe8f0f8, 0xd9a8c0, 0xff5a10, 0x8fa8d8, 0xe8c884, 0xb46cff,
    ];
    const surfaces = ['concrete', 'metalPanel', 'tile', 'brick', 'plaster', 'corrugated', 'rock', 'hexPanel'];

    for (let i = 0; i < 26; i++) {
      const w = rng.range(2.5, 9), h = rng.range(0.4, 1.4), d = rng.range(2.5, 9);
      // These are background shards a few metres across, seen from thirty
      // metres away in a dark room. A full procedural PBR set each — three
      // canvases plus a Sobel pass, 26 times — was seconds of boot for detail
      // nobody can resolve. Six shared textures give the same read.
      const m = i < 6
        ? mat.surface(surfaces[i % surfaces.length], {
            color: palettes[i % palettes.length], repeat: 2, size: 128, seed: i,
          })
        : mat.solid({
            color: palettes[i % palettes.length],
            roughness: rng.range(0.45, 0.9),
            metalness: i % 3 === 0 ? 0.5 : 0.05,
          });
      const shard = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      const a = (i / 26) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const r = rng.range(9, 30);
      shard.position.set(Math.cos(a) * r, rng.range(-7, 9), Math.sin(a) * r);
      shard.rotation.set(rng.range(-0.24, 0.24), rng() * 6.28, rng.range(-0.24, 0.24));
      shard.castShadow = true;
      shard.receiveShadow = true;
      g.add(shard);
      this.shards.push({
        mesh: shard,
        baseY: shard.position.y,
        speed: rng.range(0.12, 0.42),
        phase: rng() * 6.28,
        spin: rng.range(-0.035, 0.035),
      });

      // a few shards get a wireframe twin — the STATIC arena's language
      if (rng.chance(0.28)) {
        const wire = new THREE.Mesh(
          new THREE.BoxGeometry(w * 1.02, h * 1.02, d * 1.02),
          new THREE.MeshBasicMaterial({ color: 0x46e0ff, wireframe: true, transparent: true, opacity: 0.18, fog: true })
        );
        shard.add(wire);
      }
    }

    // --- the eye: a slowly rotating ring cluster at the centre ---------------
    const eye = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.6 + i * 1.5, 0.035, 8, 96),
        new THREE.MeshBasicMaterial({ color: 0x46e0ff, transparent: true, opacity: 0.55 - i * 0.12, fog: false })
      );
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.34;
      ring.rotation.z = i * 0.6;
      eye.add(ring);
    }
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.8, 1),
      new THREE.MeshStandardMaterial({ color: 0x0a0e14, emissive: 0x46e0ff, emissiveIntensity: 3.2, roughness: 0.3, flatShading: true })
    );
    eye.add(core);
    eye.position.y = 1;
    g.add(eye);
    this.eye = eye;
    this.eyeCore = core;
    this.eyeRings = eye.children.filter(c => c.geometry?.type === 'TorusGeometry');

    // --- sweep ring on the floor --------------------------------------------
    const sweepGeo = new THREE.RingGeometry(0.96, 1.0, 128);
    sweepGeo.rotateX(-Math.PI / 2);
    this.sweep = new THREE.Mesh(sweepGeo, new THREE.MeshBasicMaterial({
      color: 0x46e0ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.sweep.position.y = -8.9;
    g.add(this.sweep);

    // --- dust ----------------------------------------------------------------
    const dustGeo = new THREE.PlaneGeometry(0.045, 0.045);
    const dustMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    });
    this.dust = props.scatter(dustGeo, dustMat, 900, (i, dm, r) => {
      dm.position.set(r.range(-42, 42), r.range(-10, 20), r.range(-42, 42));
      dm.scale.setScalar(r.range(0.5, 2.2));
    }, 7);
    this.dust.frustumCulled = false;
    g.add(this.dust);

    // --- lighting rig ---------------------------------------------------------
    this.key = new THREE.DirectionalLight(0xffffff, 1.5);
    this.key.position.set(18, 26, 12);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.left = -40; this.key.shadow.camera.right = 40;
    this.key.shadow.camera.top = 40; this.key.shadow.camera.bottom = -40;
    this.key.shadow.camera.far = 120;
    this.key.shadow.normalBias = 0.04;
    g.add(this.key);

    this.rim = new THREE.PointLight(0x46e0ff, 60, 70, 2);
    this.rim.position.set(-16, 6, -14);
    g.add(this.rim);

    this.fill = new THREE.HemisphereLight(0x2a3a4c, 0x07080b, 0.4);
    g.add(this.fill);

    this.accentLight = new THREE.PointLight(0xffd700, 30, 46, 2);
    this.accentLight.position.set(0, 2, 0);
    g.add(this.accentLight);

    this.camera = this.renderer.camera;
  }

  /** Re-tint the rig to an arena's palette. */
  setPalette(hexA, hexB) {
    this.targetTint = new THREE.Color(hexA);
    this._bgTarget = new THREE.Color(hexB).multiplyScalar(0.18);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;

    // camera: a slow, drifting orbit with a gentle breathing height
    const r = 40 + Math.sin(t * 0.07) * 5;
    const a = t * 0.045;
    this.camera.position.set(
      Math.cos(a) * r,
      6 + Math.sin(t * 0.11) * 3.4,
      Math.sin(a) * r
    );
    this.camera.lookAt(Math.sin(t * 0.05) * 3, 1.5 + Math.sin(t * 0.09) * 1.5, 0);

    // colour drift toward the selected arena's palette
    this.tint.lerp(this.targetTint, Math.min(1, dt * 1.4));
    this.rim.color.copy(this.tint);
    this.accentLight.color.copy(this.tint);
    this.eyeCore.material.emissive.copy(this.tint);
    for (const ring of this.eyeRings) ring.material.color.copy(this.tint);
    this.sweep.material.color.copy(this.tint);
    if (this._bgTarget) {
      this.scene.background.lerp(this._bgTarget, Math.min(1, dt * 1.2));
      this.scene.fog.color.copy(this.scene.background);
    }

    // shards bob and spin
    for (const s of this.shards) {
      s.mesh.position.y = s.baseY + Math.sin(t * s.speed + s.phase) * 0.7;
      s.mesh.rotation.y += s.spin * dt;
    }

    // the eye
    this.eye.rotation.y = t * 0.22;
    this.eyeRings[0].rotation.z = t * 0.5;
    this.eyeRings[1].rotation.z = -t * 0.34;
    this.eyeRings[2].rotation.x = Math.PI / 2 + Math.sin(t * 0.4) * 0.3;
    this.eyeCore.rotation.set(t * 0.4, t * 0.6, 0);
    this.eyeCore.material.emissiveIntensity = 2.6 + Math.sin(t * 1.8) * 0.9;

    // sweep pulse, echoing the in-game Seeker
    const sweepT = (t * 0.28) % 1;
    this.sweep.scale.setScalar(1 + sweepT * 46);
    this.sweep.material.opacity = Math.sin(sweepT * Math.PI) * 0.35;

    // dust drift
    this.dust.rotation.y = t * 0.012;
    this.dust.position.y = Math.sin(t * 0.2) * 0.6;

    // key light sway
    this.key.position.set(Math.cos(t * 0.08) * 26, 26, Math.sin(t * 0.08) * 20);
  }

  dispose() {
    this.scene.traverse(o => { o.geometry?.dispose?.(); });
  }
}
