// World host. Owns the scene graph for whichever arena is loaded, hands every
// arena the same build context, and drives per-frame updates.

import * as THREE from 'three';
import { mat } from './materials.js';
import { props } from './props.js';
import { makeRNG, makeNoise } from './rng.js';
import { makeTextureSet, makeGradientTexture } from './textures.js';
import { audio } from './audio.js';

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.updates = [];
    this.hidingSpots = [];
    this.pickups = [];
    this.elapsed = 0;
    this.meta = null;
    this.surfaceResolver = null;
    this.lights = [];
  }

  clear() {
    const dispose = (o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    };
    this.root.traverse(dispose);
    this.root.clear();
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.environment = null;
    this.updates.length = 0;
    this.hidingSpots.length = 0;
    this.pickups.length = 0;
    this.lights.length = 0;
    this.elapsed = 0;
    this.surfaceResolver = null;
  }

  /** Build the context object every arena module receives. */
  makeContext(meta, quality) {
    const rng = makeRNG(meta.seed ?? meta.id);
    const noise = makeNoise(rng.int(1, 1e9));
    const self = this;

    return {
      THREE,
      scene: this.scene,
      root: this.root,
      meta,
      quality,                       // 'low' | 'medium' | 'high' | 'ultra'
      lod: { low: 0, medium: 1, high: 2, ultra: 3 }[quality] ?? 2,
      rng,
      noise,
      mat,
      props,
      tex: makeTextureSet,
      gradient: makeGradientTexture,
      audio,

      /** Add an object to the arena root. */
      add(...objs) { objs.forEach(o => o && self.root.add(o)); return objs[0]; },

      /** Add and force the whole subtree to be collidable. */
      addSolid(...objs) {
        objs.forEach(o => { if (!o) return; props.COLLIDE(o); self.root.add(o); });
        return objs[0];
      },

      /** Add without any collision (decor, fog cards, distant scenery). */
      addDecor(...objs) {
        objs.forEach(o => { if (!o) return; props.NOCOLLIDE(o); self.root.add(o); });
        return objs[0];
      },

      /** Add a light; configures sane shadow defaults for the quality tier. */
      light(l, o = {}) {
        if (o.shadow) {
          const size = { low: 512, medium: 1024, high: 2048, ultra: 2048 }[quality] ?? 1024;
          l.castShadow = true;
          l.shadow.mapSize.set(o.mapSize ?? size, o.mapSize ?? size);
          l.shadow.bias = o.bias ?? -0.0006;
          l.shadow.normalBias = o.normalBias ?? 0.035;
          if (l.isDirectionalLight) {
            const r = o.range ?? 60;
            l.shadow.camera.left = -r; l.shadow.camera.right = r;
            l.shadow.camera.top = r; l.shadow.camera.bottom = -r;
            l.shadow.camera.near = 0.5;
            l.shadow.camera.far = o.far ?? 300;
          } else if (l.isSpotLight || l.isPointLight) {
            l.shadow.camera.near = 0.2;
            l.shadow.camera.far = o.far ?? 40;
          }
        }
        self.root.add(l);
        if (l.target) self.root.add(l.target);
        self.lights.push(l);
        return l;
      },

      /** Fog. mode 'linear' | 'exp2'. */
      fog(color, a, b, mode = 'linear') {
        self.scene.fog = mode === 'exp2'
          ? new THREE.FogExp2(color, a)
          : new THREE.Fog(color, a, b);
        return self.scene.fog;
      },

      /** Solid background colour, gradient sky dome, or cube-less env tint. */
      sky(o = {}) {
        if (o.color !== undefined) self.scene.background = new THREE.Color(o.color);
        if (o.top !== undefined) {
          const dome = new THREE.Mesh(
            new THREE.SphereGeometry(o.radius ?? 480, 32, 20),
            mat.skyDome(o.top, o.bottom ?? 0xcfd9e6)
          );
          dome.userData.collide = false;
          dome.frustumCulled = false;
          self.root.add(dome);
          self.scene.background = null;
          return dome;
        }
        return null;
      },

      /** Use the built-in IBL so metals reflect something plausible. */
      useEnvironment(intensity = 1) {
        self.scene.environment = self.renderer.roomEnv;
        self.scene.environmentIntensity = intensity;
      },

      /** Register a per-frame callback: fn(dt, elapsed). */
      onUpdate(fn) { self.updates.push(fn); return fn; },

      /** Mark a spot the Seeker sweep treats as concealment. */
      hidingSpot(x, y, z, radius = 1.2, quality01 = 1) {
        self.hidingSpots.push({ pos: new THREE.Vector3(x, y, z), radius, quality: quality01 });
      },

      /** Register a collectible. type: 'coin' | 'battery' | 'powerup:<id>' | 'pup' */
      pickup(x, y, z, type = 'coin', extra = {}) {
        self.pickups.push({ pos: new THREE.Vector3(x, y, z), type, taken: false, ...extra });
      },

      /** Tell the footstep system what the floor sounds like. fn(x,z) => name */
      setSurface(fnOrName) {
        self.surfaceResolver = typeof fnOrName === 'function' ? fnOrName : () => fnOrName;
      },

      /** Colour grade preset for this arena. */
      grade(o) { self.renderer.setGrade(o); },

      /** Ambience + music mood. */
      soundscape(ambience, mood, space) {
        self.pendingSound = { ambience, mood, space };
      },
    };
  }

  async load(meta, buildFn, quality) {
    this.clear();
    this.meta = meta;
    const ctx = this.makeContext(meta, quality);
    // Defaults every arena inherits unless it overrides them.
    ctx.useEnvironment(0.6);
    this.renderer.setGrade({
      vignette: 0.85, grain: 0.035, aberration: 0.0016,
      saturation: 1.06, contrast: 1.04, scanline: 0,
      lift: [0, 0, 0], gain: [1, 1, 1], exposure: 1.0,
      bloom: 0.42, bloomRadius: 0.75, bloomThreshold: 0.82,
    });
    await buildFn(ctx);
    this.root.updateMatrixWorld(true);
    return ctx;
  }

  surfaceAt(x, z) {
    return this.surfaceResolver ? (this.surfaceResolver(x, z) || 'concrete') : 'concrete';
  }

  update(dt) {
    this.elapsed += dt;
    for (let i = 0; i < this.updates.length; i++) {
      try { this.updates[i](dt, this.elapsed); } catch (e) { /* one bad arena tick shouldn't kill the frame */ }
    }
  }
}
