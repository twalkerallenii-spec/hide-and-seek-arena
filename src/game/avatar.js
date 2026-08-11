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
  run: 'Running_A',
  jump: 'Jump_Idle',
  land: 'Jump_Land',
  death: 'Death_A',
};

/** The roster, in the order slots are handed out. */
export const CHARACTERS = [
  'Rogue', 'Rogue_Hooded', 'Knight', 'Mage', 'Barbarian', 'Ranger',
  'Skeleton_Rogue', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Minion',
];

/** Clips are shared across every avatar — parsed once, reused by every mixer. */
let clipCache = null;
async function loadClips() {
  if (clipCache) return clipCache;
  const [basic, general] = await Promise.all([
    animSet('Rig_Medium_MovementBasic'),
    animSet('Rig_Medium_General'),
  ]);
  const all = [...(basic?.animations || []), ...(general?.animations || [])];
  clipCache = new Map(all.map(c => [c.name, c]));
  return clipCache;
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

    if (!this.dead) {
      if (state.onGround === false) {
        this._play(CLIP.jump, 0.12);
      } else if (this._speed > 5.2) {
        // Match the cycle to the ground speed so the feet do not skate.
        this._play(CLIP.run, 0.18, Math.max(0.6, Math.min(1.8, this._speed / 6.2)));
      } else if (this._speed > 0.35) {
        this._play(CLIP.walk, 0.18, Math.max(0.6, Math.min(1.9, this._speed / 2.6)));
      } else {
        this._play(CLIP.idle, 0.25);
      }
    }

    // Crouching is a squash rather than a clip — the pack has no crouch, and a
    // squashed idle reads correctly enough from behind at third-person range.
    const squash = state.crouching ? 0.62 : 1;
    const cur = this.model.scale.y;
    const s = cur + (squash - cur) * Math.min(1, dt * 10);
    this.model.scale.y = s;

    this.mixer.update(dt);
  }

  setVisible(v) { this.root.visible = v; }

  dispose() {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
