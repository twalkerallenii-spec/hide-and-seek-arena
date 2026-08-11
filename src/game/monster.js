// The Seeker.
//
// A 1006-triangle PSX monster with 37 bones and seven clips, walking the same
// octree the player does. It patrols, it hears you, it sees you, and when it
// loses you it goes to where you were and searches before giving up.
//
// The abstract sweep-ring Seeker in seeker.js still runs alongside this in solo
// exploration mode; in round mode this is the thing that actually catches you.

import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { monster as loadMonsterFBX, instance, normaliseHeight } from '../engine/assets.js';
import { audio } from '../engine/audio.js';

const GRAVITY = 26;
const HEIGHT = 2.4;
const RADIUS = 0.45;

/** Clip names exactly as authored in the FBX. */
const CLIP = {
  idle: 'Armature|Idle_pose',
  idleRef: 'Armature|Idle_pose_ref',
  walk: 'Armature|Walk_Close',
  hunt: 'Armature|Walk_Open',
  jump: 'Armature|Jump',
  eat: 'Armature|Eat_Luz',
  spit: 'Armature|Spit_Luz',
};

export const MSTATE = {
  IDLE: 'idle', PATROL: 'patrol', HUNT: 'hunt',
  SEARCH: 'search', ATTACK: 'attack', CAGED: 'caged',
};

export class Monster {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'monster';
    scene.add(this.root);

    this.state = MSTATE.CAGED;
    this.loaded = false;
    this.mixer = null;
    this.actions = {};
    this.current = null;

    this.collider = new Capsule(
      new THREE.Vector3(0, RADIUS, 0),
      new THREE.Vector3(0, HEIGHT - RADIUS, 0),
      RADIUS
    );
    this.velocity = new THREE.Vector3();
    this.onGround = false;

    this.octree = null;
    this.hidingSpots = [];
    this.bounds = 100;
    this.speedPatrol = 2.6;
    this.speedHunt = 5.4;
    this.sightRange = 34;
    this.sightHalfAngle = Math.PI * 0.38;
    this.hearRange = 16;

    this.heading = 0;
    this.waypoint = null;
    this.lastKnown = null;
    this.searchTimer = 0;
    this.attackTimer = 0;
    this.onCatch = null;
    this.onRoar = null;

    this._senseTimer = 0;
    this._stuckTimer = 0;
    this._lastPos = new THREE.Vector3();
    this._growlTimer = 0;
    this._stepTimer = 0;
    this._ray = new THREE.Ray();
    this._probe = new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS * 0.8);

    // A moving pool of light so it announces itself before it rounds a corner.
    this.light = new THREE.PointLight(0xff4422, 0, 16, 2);
    this.light.castShadow = false;
    this.root.add(this.light);
  }

  async load() {
    const src = await loadMonsterFBX();
    if (!src) { console.warn('monster model unavailable'); return false; }

    const model = instance(src);
    normaliseHeight(model, HEIGHT);
    model.traverse(o => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;         // skinned bounds lie; never pop out
      o.userData.collide = false;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!m) continue;
        m.side = THREE.DoubleSide;     // PSX meshes are often single-sided shells
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        // Faint self-glow so it reads in a pitch-black corridor.
        m.emissive = new THREE.Color(0x330800);
        m.emissiveIntensity = 1;
      }
    });
    this.model = model;
    this.root.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of src.animations || []) {
      const action = this.mixer.clipAction(clip);
      this.actions[clip.name] = action;
      // The two idle clips are single-frame poses (duration 0). Looping a
      // zero-length clip does nothing useful, so they are played once and held.
      if (clip.duration <= 0.001) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
    }
    this.loaded = true;
    this._play(CLIP.idle, 0);
    return true;
  }

  configure({ octree, hidingSpots = [], bounds = 100, difficulty = 3 } = {}) {
    this.octree = octree;
    this.hidingSpots = hidingSpots;
    this.bounds = bounds;
    this.speedPatrol = 2.2 + difficulty * 0.18;
    this.speedHunt = 4.2 + difficulty * 0.42;
    this.sightRange = 24 + difficulty * 4;
    this.hearRange = 11 + difficulty * 2.2;
  }

  spawn(x, y, z) {
    this.collider.start.set(x, y + RADIUS, z);
    this.collider.end.set(x, y + HEIGHT - RADIUS, z);
    this.velocity.set(0, 0, 0);
    this.waypoint = null;
    this.lastKnown = null;
    this._lastPos.set(x, y, z);
    this.root.position.set(x, y, z);
  }

  get position() {
    return new THREE.Vector3(
      this.collider.start.x,
      this.collider.start.y - RADIUS,
      this.collider.start.z
    );
  }

  /** Hold it in place — used during the 30-second hide phase. */
  cage(on) {
    this.state = on ? MSTATE.CAGED : MSTATE.PATROL;
    if (on) this.velocity.set(0, 0, 0);
  }

  // ------------------------------------------------------------------ senses
  _hasLineOfSight(from, to) {
    if (!this.octree) return true;
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.01) return true;
    dir.divideScalar(len);
    this._ray.set(from, dir);
    const hit = this.octree.rayIntersect(this._ray);
    return !hit || hit.distance > len - 0.5;
  }

  _canSee(targetPos, opts) {
    const eye = this.position;
    eye.y += HEIGHT * 0.8;
    const to = targetPos.clone();
    to.y += 1.2;
    const d = eye.distanceTo(to);

    if (d < 2.2) return true;                      // it is on top of you
    if (d > this.sightRange) return false;

    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const flat = to.clone().sub(eye); flat.y = 0; flat.normalize();
    if (fwd.dot(flat) < Math.cos(this.sightHalfAngle)) return false;

    return this._hasLineOfSight(eye, to);
  }

  _canHear(targetPos, opts = {}) {
    let r = this.hearRange;
    if (opts.sprinting) r *= 1.9;
    else if (opts.crouching) r *= 0.45;
    else if (!opts.moving) r *= 0.25;
    if (opts.lightOn) r *= 1.25;
    return this.position.distanceTo(targetPos) < r;
  }

  // -------------------------------------------------------------- navigation
  _pickWaypoint(near) {
    const pool = this.hidingSpots.length
      ? this.hidingSpots
      : [{ pos: new THREE.Vector3(0, 0, 0) }];
    let best = null, bestScore = -Infinity;
    const here = this.position;
    for (let i = 0; i < Math.min(pool.length, 24); i++) {
      const s = pool[(Math.random() * pool.length) | 0];
      const d = here.distanceTo(s.pos);
      if (d < 6) continue;
      // Prefer somewhere a fair walk away, biased toward `near` if given.
      let score = -Math.abs(d - 28) * 0.1 + Math.random() * 3;
      if (near) score -= s.pos.distanceTo(near) * 0.08;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    this.waypoint = best ? best.pos.clone() : null;
  }

  /** Steer toward `to`, sliding off anything directly ahead. */
  _steer(to, dt, speed) {
    const here = this.position;
    const want = to.clone().sub(here);
    want.y = 0;
    const d = want.length();
    if (d < 0.01) return 0;
    want.divideScalar(d);

    // Three short probes: straight, and 40 degrees either side.
    let chosen = want;
    if (this.octree && this._blocked(want, 2.2)) {
      const left = want.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);
      const right = want.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.7);
      const lOK = !this._blocked(left, 2.0);
      const rOK = !this._blocked(right, 2.0);
      if (lOK && rOK) chosen = (this._sideBias ?? 1) > 0 ? left : right;
      else if (lOK) chosen = left;
      else if (rOK) chosen = right;
      else {
        chosen = want.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.75);
        this._sideBias = -(this._sideBias ?? 1);
      }
    }

    const targetHeading = Math.atan2(chosen.x, chosen.z);
    let delta = targetHeading - this.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.heading += Math.max(-3.4 * dt, Math.min(3.4 * dt, delta));

    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.velocity.x = fwd.x * speed;
    this.velocity.z = fwd.z * speed;
    return d;
  }

  _blocked(dir, reach) {
    const from = this.position;
    this._probe.start.set(from.x + dir.x * reach, from.y + RADIUS + 0.3, from.z + dir.z * reach);
    this._probe.end.set(from.x + dir.x * reach, from.y + HEIGHT - RADIUS, from.z + dir.z * reach);
    this._probe.radius = RADIUS * 0.85;
    return !!this.octree?.capsuleIntersect(this._probe);
  }

  _collide() {
    if (!this.octree) { this.onGround = true; return; }
    const hit = this.octree.capsuleIntersect(this.collider);
    this.onGround = false;
    if (!hit) return;
    this.onGround = hit.normal.y > 0.35;
    if (!this.onGround) {
      this.velocity.addScaledVector(hit.normal, -hit.normal.dot(this.velocity));
    } else if (this.velocity.y < 0) {
      this.velocity.y = 0;
    }
    if (hit.depth >= 1e-6) this.collider.translate(hit.normal.multiplyScalar(hit.depth));
  }

  // -------------------------------------------------------------------- tick
  update(dt, ctxIn = {}) {
    if (!this.loaded) return;
    dt = Math.min(dt, 1 / 20);
    const { target, crouching, sprinting, moving, lightOn, canCatch = true } = ctxIn;

    if (this.state !== MSTATE.CAGED) {
      this._senseTimer -= dt;
      if (this._senseTimer <= 0 && target) {
        this._senseTimer = 0.12;                 // ~8 Hz; raycasts are not cheap
        const seen = this._canSee(target, ctxIn);
        const heard = !seen && this._canHear(target, { crouching, sprinting, moving, lightOn });
        if (seen || heard) {
          this.lastKnown = target.clone();
          if (this.state !== MSTATE.ATTACK) {
            if (this.state !== MSTATE.HUNT) this._roar();
            this.state = MSTATE.HUNT;
          }
          this.searchTimer = 0;
        } else if (this.state === MSTATE.HUNT) {
          this.state = MSTATE.SEARCH;
          this.searchTimer = 7;
        }
      }
      this._think(dt, target, canCatch);
    }

    // --- integrate ---------------------------------------------------------
    if (!this.onGround) this.velocity.y -= GRAVITY * dt;
    if (this.state === MSTATE.CAGED || this.state === MSTATE.ATTACK) {
      this.velocity.x = 0; this.velocity.z = 0;
    }
    const steps = Math.min(4, 1 + Math.floor(this.velocity.length() * dt / (RADIUS * 0.7)));
    for (let i = 0; i < steps; i++) {
      this.collider.translate(this.velocity.clone().multiplyScalar(dt / steps));
      this._collide();
    }
    if (this.collider.start.y < -80) this.spawn(0, 2, 0);

    // --- stuck detector ----------------------------------------------------
    const here = this.position;
    if (here.distanceTo(this._lastPos) < 0.12 * dt * 60 && this.state === MSTATE.PATROL) {
      this._stuckTimer += dt;
      if (this._stuckTimer > 1.5) { this.waypoint = null; this._stuckTimer = 0; }
    } else {
      this._stuckTimer = 0;
    }
    this._lastPos.copy(here);

    // --- present -----------------------------------------------------------
    this.root.position.copy(here);
    this.root.rotation.y = this.heading;
    this.mixer.update(dt);
    this._audio(dt, target);

    const hunting = this.state === MSTATE.HUNT || this.state === MSTATE.ATTACK;
    this.light.intensity += ((hunting ? 6 : 1.6) - this.light.intensity) * Math.min(1, dt * 3);
    this.light.color.setHex(hunting ? 0xff2200 : 0x7a1a08);
    this.light.position.set(0, HEIGHT * 0.7, 0);
  }

  _think(dt, target, canCatch) {
    const here = this.position;

    if (this.state === MSTATE.ATTACK) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.onCatch?.(here.clone());
        this.state = MSTATE.SEARCH;
        this.searchTimer = 3;
      }
      return;
    }

    if (this.state === MSTATE.HUNT && target) {
      const d = here.distanceTo(target);
      if (canCatch && d < 1.9) {
        this.state = MSTATE.ATTACK;
        // Give the player the half-second of "it has me" before the round ends.
        this.attackTimer = 0.55;
        this._play(CLIP.eat, 0.08, 1.0);
        audio.play({ type: 'sawtooth', freq: 190, freqEnd: 60, dur: 0.6, gain: 0.22, filter: 1400, q: 3 });
        return;
      }
      this._steer(target, dt, this.speedHunt);
      this._setLocomotion(this.speedHunt, true);
      return;
    }

    if (this.state === MSTATE.SEARCH) {
      this.searchTimer -= dt;
      const goal = this.lastKnown;
      if (goal && here.distanceTo(goal) > 2.0) {
        this._steer(goal, dt, this.speedHunt * 0.8);
        this._setLocomotion(this.speedHunt * 0.8, true);
      } else {
        // Cast around at the last known position rather than standing on it.
        this.heading += dt * 1.6;
        this.velocity.x = this.velocity.z = 0;
        this._play(CLIP.idle, 0.25);
      }
      if (this.searchTimer <= 0) { this.state = MSTATE.PATROL; this.waypoint = null; }
      return;
    }

    // PATROL
    if (!this.waypoint || here.distanceTo(this.waypoint) < 2.5) this._pickWaypoint(this.lastKnown);
    if (this.waypoint) {
      this._steer(this.waypoint, dt, this.speedPatrol);
      this._setLocomotion(this.speedPatrol, false);
    } else {
      this._play(CLIP.idle, 0.3);
    }
  }

  // --------------------------------------------------------------- animation
  _play(name, fade = 0.2, timeScale = 1) {
    const next = this.actions[name];
    if (!next || next === this.current) {
      if (next) next.timeScale = timeScale;
      return;
    }
    next.reset();
    next.timeScale = timeScale;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
  }

  /** Match the 0.63 s walk cycle to real ground speed so the feet don't skate. */
  _setLocomotion(speed, hunting) {
    const clip = hunting ? CLIP.hunt : CLIP.walk;
    const cycleDistance = 2.2;                       // metres covered per loop
    const scale = Math.max(0.35, Math.min(2.4, (speed * 0.63) / cycleDistance));
    this._play(clip, 0.22, scale);
  }

  // ------------------------------------------------------------------- audio
  _roar() {
    audio.play({ type: 'sawtooth', freq: 90, freqEnd: 220, dur: 0.9, gain: 0.2, filter: 900, q: 4 });
    audio.play({ type: 'square', freq: 46, dur: 1.2, gain: 0.14 });
    this.onRoar?.();
  }

  _audio(dt, target) {
    if (!target) return;
    const d = this.position.distanceTo(target);
    if (d > 42) return;
    const near = 1 - d / 42;

    this._growlTimer -= dt;
    if (this._growlTimer <= 0) {
      this._growlTimer = 2.2 + (1 - near) * 5;
      audio.play({
        type: 'sawtooth', freq: 62 + near * 28, freqEnd: 44,
        dur: 1.1, gain: 0.03 + near * 0.11, filter: 420 + near * 500, q: 3,
      });
    }

    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (hSpeed > 0.5 && this.onGround) {
      this._stepTimer -= dt * hSpeed;
      if (this._stepTimer <= 0) {
        this._stepTimer = 1.6;
        audio.play({
          noise: true, dur: 0.16, gain: 0.03 + near * 0.13,
          filter: 700, filterEnd: 180, q: 1.4,
        });
      }
    }
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
