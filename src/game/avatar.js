// A visible character.
//
// The Seeker plays in first person — you ARE the monster, and seeing your own
// arms would only get in the way. Everyone else plays in third person, which
// means the hider needs a body: something to see, something to recognise other
// players by, and something that reads as "hiding" when it crouches behind a
// crate.
//
// The KayKit characters all share one 23-bone skeleton, and the animation packs
// are authored against that same rig, so a clip lifted from `Rig_Medium_General`
// plays correctly on `Rogue` with no retargeting. That is the whole reason this
// is cheap enough to run eleven of.

import * as THREE from 'three';
import { character, animSet, instance, normaliseHeight } from '../engine/assets.js';

const CLIP = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  walkBack: 'Walking_Backwards',
  run: 'Running_A',
  strafeL: 'Running_Strafe_Left',
  strafeR: 'Running_Strafe_Right',
  crouch: 'Crouching',
  sneak: 'Sneaking',
  jump: 'Jump_Idle',
  land: 'Jump_Land',
  death: 'Death_A',
  hit: 'Hit_A',
  spawn: 'Spawn_Ground',
  pickup: 'PickUp',
};

/**
 * The roster.
 *
 * Only the first few are used for the crowd. Each distinct name is a separate
 * GLB fetch and parse, so ten different characters meant ten downloads at the
 * exact moment the round starts. Three read as a varied crowd at hiding
 * distance and cost a third of the load.
 */
export const CROWD_VARIETY = 3;

export const CHARACTERS = [
  'Rogue', 'Rogue_Hooded', 'Knight', 'Mage', 'Barbarian', 'Ranger',
  'Skeleton_Rogue', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Minion',
];

/** Clips are shared across every avatar — parsed once, reused by every mixer. */
let clipCache = null;
async function loadClips() {
  if (clipCache) return clipCache;
  // MovementAdvanced carries crouch, sneak and the strafes. It shipped in the
  // asset pack and was sitting unloaded, which is why crouch was being faked.
  const [basic, general, advanced] = await Promise.all([
    animSet('Rig_Medium_MovementBasic'),
    animSet('Rig_Medium_General'),
    animSet('Rig_Medium_MovementAdvanced'),
  ]);
  const all = [
    ...(basic?.animations || []),
    ...(general?.animations || []),
    ...(advanced?.animations || []),
  ];
  clipCache = new Map(all.map(c => [c.name, c]));
  return clipCache;
}

/**
 * Fetch and parse everything the crowd needs, once, ahead of time. Called from
 * the arena loading screen so it is paid for behind the progress bar instead of
 * stalling the first second of a round.
 */
export async function preloadAvatars(variety = CROWD_VARIETY) {
  const names = CHARACTERS.slice(0, variety);
  await Promise.all([loadClips(), ...names.map(n => character(n))]);
  return names;
}

export class Avatar {
  /**
   * @param {THREE.Object3D} parent  scene or group to live in
   * @param {string} which           a name from CHARACTERS
   */
  constructor(parent, which = 'Rogue') {
    this.parent = parent;
    this.which = which;
    this.root = new THREE.Group();
    this.root.name = 'avatar:' + which;
    parent.add(this.root);
    this.loaded = false;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.height = 1.72;
    this._yaw = 0;
    this._speed = 0;
    this.dead = false;
    this._oneShot = 0;
  }

  async load() {
    const [src, clips] = await Promise.all([character(this.which), loadClips()]);
    if (!src) return false;

    const model = instance(src);
    normaliseHeight(model, this.height);
    model.traverse(o => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;     // skinned bounds lie; never pop out
      o.userData.collide = false;
    });
    this.model = model;
    this.root.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of clips) {
      const a = this.mixer.clipAction(clip);
      if (clip.duration <= 0.001) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[name] = a;
    }
    this.loaded = true;
    this._play(CLIP.idle, 0);
    return true;
  }

  _play(name, fade = 0.2, timeScale = 1) {
    const next = this.actions[name];
    if (!next) return;
    if (next === this.current) { next.timeScale = timeScale; return; }
    next.reset();
    next.timeScale = timeScale;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
  }

  /** Play a clip that takes the body over briefly, then hand control back. */
  oneShot(name, seconds) {
    const clip = CLIP[name] || name;
    const a = this.actions[clip];
    if (!a) return;
    this._play(clip, 0.1);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.reset().play();
    this._oneShot = seconds ?? 1.0;
  }

  respawn() { this.dead = false; this.oneShot('spawn', 1.2); }
  pickup() { this.oneShot('pickup', 0.9); }
  hit() { this.oneShot('hit', 0.6); }

  setDead(on) {
    if (on === this.dead) return;
    this.dead = on;
    if (on) this._play(CLIP.death, 0.15);
    else this._play(CLIP.idle, 0.2);
  }

  /**
   * @param {number} dt
   * @param {{x,y,z}} pos    feet position
   * @param {number} yaw     facing, radians
   * @param {object} state   { speed, onGround, crouching }
   */
  update(dt, pos, yaw, state = {}) {
    if (!this.loaded) return;
    this.root.position.set(pos.x, pos.y, pos.z);

    // Ease the facing so the body does not snap when the camera whips around.
    let d = yaw - this._yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this._yaw += d * Math.min(1, dt * 12);
    this.root.rotation.y = this._yaw;

    const speed = state.speed ?? 0;
    this._speed += (speed - this._speed) * Math.min(1, dt * 10);

    // A one-shot (respawn, pickup, being hit) owns the body until it finishes.
    if (this._oneShot > 0) {
      this._oneShot -= dt;
      this.mixer.update(dt);
      return;
    }

    if (!this.dead) {
      const moving = this._speed > 0.35;
      if (state.onGround === false) {
        this._play(CLIP.jump, 0.12);
      } else if (state.crouching) {
        // A real crouch clip. This used to squash the model's Y scale, which
        // looked like a bug because it was one — the pack HAS a crouch, it just
        // lives in the animation set nobody had loaded.
        moving
          ? this._play(CLIP.sneak, 0.2, Math.max(0.7, Math.min(1.8, this._speed / 1.6)))
          : this._play(CLIP.crouch, 0.22);
      } else if (this._speed > 5.2) {
        const strafe = state.strafe ?? 0;
        if (strafe > 0.6) this._play(CLIP.strafeR, 0.18, this._speed / 6.2);
        else if (strafe < -0.6) this._play(CLIP.strafeL, 0.18, this._speed / 6.2);
        else this._play(CLIP.run, 0.18, Math.max(0.6, Math.min(1.8, this._speed / 6.2)));
      } else if (moving) {
        // Backing away plays backwards rather than moonwalking forwards.
        state.reversing
          ? this._play(CLIP.walkBack, 0.2, Math.max(0.6, Math.min(1.7, this._speed / 2.6)))
          : this._play(CLIP.walk, 0.18, Math.max(0.6, Math.min(1.9, this._speed / 2.6)));
      } else {
        this._play(CLIP.idle, 0.25);
      }
    }

    this.mixer.update(dt);
  }

  setVisible(v) { this.root.visible = v; }

  dispose() {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
