// First-person controller.
//
// Capsule-vs-Octree collision (the three.js FPS-demo approach), plus the feel
// layer that separates a tech demo from a game: acceleration curves, air
// control, coyote time, head bob, landing dip, camera lean on strafe, sprint
// FOV kick, crouch, ladder climbing, and a spectator/noclip mode for looking
// at the arenas.

import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';

const GRAVITY = 26;


/**
 * An octree that stops splitting when it should.
 *
 * three's Octree recurses until a leaf holds 8 triangles or it hits level 16.
 * On a flat arena — the Backrooms is 198 x 12 x 198 — that drives it to depth
 * 17, 370,000 nodes and 80x triangle duplication, because split() copies every
 * triangle into every subtree it touches. Measured cost: 143 s to bake here and
 * 1.24 ms per capsule query, and the controller does up to six queries a frame.
 *
 * Capping depth and allowing fatter leaves trades a slightly longer narrow
 * phase for an enormously cheaper tree. The split logic below is three's own,
 * with the two stop conditions parameterised and the subtree type fixed so the
 * cap survives recursion.
 */
class CappedOctree extends Octree {
  constructor(box, maxLevel = 6, maxTriangles = 24) {
    super(box);
    this._maxLevel = maxLevel;
    this._maxTriangles = maxTriangles;
  }

  split(level) {
    if (!this.box) return this;
    const sub = [];
    const half = new THREE.Vector3().copy(this.box.max).sub(this.box.min).multiplyScalar(0.5);
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const b = new THREE.Box3();
          const v = new THREE.Vector3(x, y, z);
          b.min.copy(this.box.min).add(v.multiply(half));
          b.max.copy(b.min).add(half);
          sub.push(new CappedOctree(b, this._maxLevel, this._maxTriangles));
        }
      }
    }
    let tri;
    while ((tri = this.triangles.pop())) {
      for (let i = 0; i < sub.length; i++) {
        if (sub[i].box.intersectsTriangle(tri)) sub[i].triangles.push(tri);
      }
    }
    for (const s of sub) {
      // Read the count BEFORE splitting: split() drains `triangles` into the
      // next level, so testing it afterwards discards every node that split —
      // which silently produces an empty tree and no collision at all.
      const len = s.triangles.length;
      if (len > this._maxTriangles && level < this._maxLevel) s.split(level + 1);
      if (len !== 0) this.subTrees.push(s);
    }
    return this;
  }
}

export class FirstPersonController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    this.height = 1.72;
    this.crouchHeight = 0.95;
    this.radius = 0.34;

    this.collider = new Capsule(
      new THREE.Vector3(0, this.radius, 0),
      new THREE.Vector3(0, this.height - this.radius, 0),
      this.radius
    );

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;

    this.speedWalk = 4.4;
    this.speedSprint = 8.1;
    this.speedCrouch = 2.0;
    this.jumpSpeed = 8.2;
    this.accelGround = 60;
    this.accelAir = 12;
    this.frictionGround = 11;

    this.stamina = 1;
    this.staminaDrain = 0.20;
    this.staminaRegen = 0.16;
    this.exhausted = false;

    this.crouching = false;
    this.sprinting = false;
    this.noclip = false;

    // Third person. The Seeker plays first person — you are the monster — and
    // everyone else plays over the shoulder, so they can see their own body
    // and read what it is doing behind cover.
    this.thirdPerson = false;
    this.boom = 3.4;            // how far back the camera sits
    this.boomHeight = 0.35;     // ...and how far above the eye line
    this.boomSide = 0.55;       // over-the-shoulder offset
    this._boomNow = 0;
    this.frozen = false;
    this.enabled = false;

    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;
    this.invertY = false;

    this.baseFov = 75;
    this._fov = 75;
    this._bobT = 0;
    this._bobAmp = 0;
    this._lean = 0;
    this._landDip = 0;
    this._eyeY = this.height;
    this._stepDist = 0;
    this.onFootstep = null;      // (speed, material) => void
    this.onLand = null;          // (impactSpeed) => void
    this.onJump = null;

    this.octree = new Octree();
    this.climbZones = [];        // [{box: THREE.Box3}]
    this.ladderTimer = 0;

    this.keys = Object.create(null);
    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') this.jumpBuffer = 0.16;
      if (e.code === 'Tab') e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouseMove = (e) => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= (this.invertY ? -1 : 1) * e.movementY * this.sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, this.pitch));
    };
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
  }

  lock() { this.dom.requestPointerLock?.(); }
  unlock() { document.exitPointerLock?.(); }

  /**
   * Build the collision octree from a scene subtree.
   *
   * Octree.split() pushes every triangle into every subtree it intersects, so a
   * single 200 m floor quad ends up duplicated into thousands of leaves and the
   * tree explodes — the Backrooms measured 42 s to bake and 4.6 ms per capsule
   * query, which is unplayable on its own.
   *
   * Chopping big triangles down first fixes it at the root: each piece then
   * lands in one or two leaves instead of hundreds. It costs more triangles and
   * saves an order of magnitude of nodes.
   */
  buildCollision(root, { leafMetres = 6 } = {}) {
    const collidable = new THREE.Group();
    let meshes = 0;
    const bounds = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      if (o.userData.collide !== true) return;
      meshes++;
      const c = new THREE.Mesh(o.geometry, o.material);
      c.matrixAutoUpdate = false;
      c.matrix.copy(o.matrixWorld);
      collidable.add(c);
      bounds.expandByObject(o);
    });
    collidable.updateMatrixWorld(true);

    // Pick a depth that lands leaves near `leafMetres` across, rather than
    // letting the tree run to 17 levels chasing 8 triangles per leaf.
    const span = Math.max(1, Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.z - bounds.min.z));
    const depth = Math.max(3, Math.min(7, Math.ceil(Math.log2(span / leafMetres))));

    this.octree = new CappedOctree(undefined, depth, 24);
    this.octree.fromGraphNode(collidable);
    this.collisionMeshCount = meshes;
    this.octreeDepthCap = depth;
    return meshes;
  }

  teleport(x, y, z) {
    const h = this.crouching ? this.crouchHeight : this.height;
    this.collider.start.set(x, y + this.radius, z);
    this.collider.end.set(x, y + h - this.radius, z);
    this.collider.radius = this.radius;
    this.velocity.set(0, 0, 0);
  }

  get position() {
    return new THREE.Vector3(
      this.collider.start.x,
      this.collider.start.y - this.radius,
      this.collider.start.z
    );
  }

  _forwardVector(v) {
    this.camera.getWorldDirection(v);
    v.y = 0;
    v.normalize();
    return v;
  }

  _sideVector(v) {
    this._forwardVector(v);
    v.cross(this.camera.up);
    return v;
  }

  _collide() {
    const result = this.octree.capsuleIntersect(this.collider);
    this.onGround = false;
    if (result) {
      this.onGround = result.normal.y > 0.35;
      if (!this.onGround) {
        // Slide along walls instead of sticking to them.
        this.velocity.addScaledVector(result.normal, -result.normal.dot(this.velocity));
      } else if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
      if (result.depth >= 1e-6) {
        this.collider.translate(result.normal.multiplyScalar(result.depth));
      }
    }
  }

  update(dt) {
    if (!this.enabled || this.frozen) { this._applyCamera(dt, 0); return; }
    dt = Math.min(dt, 1 / 30);

    const k = this.keys;
    const wantSprint = (k['ShiftLeft'] || k['ShiftRight']) && !this.crouching && !this.exhausted;
    const wantCrouch = k['ControlLeft'] || k['KeyC'];

    // --- crouch (with a headroom check before standing up) -------------------
    if (wantCrouch !== this.crouching) {
      if (!wantCrouch) {
        const probe = this.collider.clone();
        probe.end.y = probe.start.y + this.height - this.radius * 2;
        if (!this.octree.capsuleIntersect(probe)) this.crouching = false;
      } else {
        this.crouching = true;
      }
    }
    const targetH = this.crouching ? this.crouchHeight : this.height;
    this.collider.end.y += ((this.collider.start.y + targetH - this.radius) - this.collider.end.y) * Math.min(1, dt * 14);

    // --- input direction -----------------------------------------------------
    const fwd = new THREE.Vector3(), side = new THREE.Vector3();
    this._forwardVector(fwd); this._sideVector(side);
    const wish = new THREE.Vector3();
    if (k['KeyW'] || k['ArrowUp']) wish.add(fwd);
    if (k['KeyS'] || k['ArrowDown']) wish.sub(fwd);
    if (k['KeyD'] || k['ArrowRight']) wish.add(side);
    if (k['KeyA'] || k['ArrowLeft']) wish.sub(side);
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();

    this.sprinting = wantSprint && moving && (k['KeyW'] || k['ArrowUp']);

    // --- stamina -------------------------------------------------------------
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - this.staminaDrain * dt);
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.stamina = Math.min(1, this.stamina + this.staminaRegen * dt);
      if (this.stamina > 0.32) this.exhausted = false;
    }

    // --- noclip / spectator --------------------------------------------------
    if (this.noclip) {
      const spd = (this.sprinting ? 26 : 11);
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const move = new THREE.Vector3();
      if (k['KeyW']) move.add(dir);
      if (k['KeyS']) move.sub(dir);
      if (k['KeyD']) move.add(new THREE.Vector3().crossVectors(dir, this.camera.up).normalize());
      if (k['KeyA']) move.sub(new THREE.Vector3().crossVectors(dir, this.camera.up).normalize());
      if (k['Space']) move.y += 1;
      if (k['ControlLeft']) move.y -= 1;
      if (move.lengthSq()) move.normalize().multiplyScalar(spd * dt);
      this.collider.translate(move);
      this.velocity.set(0, 0, 0);
      this._applyCamera(dt, 0);
      return;
    }

    // --- ladders -------------------------------------------------------------
    const pos = this.position;
    let onLadder = false;
    for (const z of this.climbZones) {
      if (z.box.containsPoint(new THREE.Vector3(pos.x, pos.y + 0.9, pos.z))) { onLadder = true; break; }
    }
    if (onLadder) {
      this.velocity.y = 0;
      if (k['KeyW'] || k['Space']) this.velocity.y = 3.4;
      else if (k['KeyS']) this.velocity.y = -3.4;
      this.velocity.x *= 0.75; this.velocity.z *= 0.75;
    }

    // --- horizontal acceleration --------------------------------------------
    const maxSpeed = this.crouching ? this.speedCrouch
      : this.sprinting ? this.speedSprint : this.speedWalk;
    const accel = this.onGround ? this.accelGround : this.accelAir;
    if (moving) {
      const cur = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
      const wishVel = wish.clone().multiplyScalar(maxSpeed);
      const delta = wishVel.sub(cur).clampLength(0, accel * dt);
      this.velocity.x += delta.x;
      this.velocity.z += delta.z;
    }
    if (this.onGround) {
      const damping = Math.exp(-this.frictionGround * dt) - 1;
      if (!moving) {
        this.velocity.x += this.velocity.x * damping;
        this.velocity.z += this.velocity.z * damping;
      }
    } else if (!onLadder) {
      this.velocity.y -= GRAVITY * dt;
      this.velocity.x += this.velocity.x * (Math.exp(-0.5 * dt) - 1);
      this.velocity.z += this.velocity.z * (Math.exp(-0.5 * dt) - 1);
    }

    // --- jump with coyote time + input buffering -----------------------------
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && (this.coyote > 0 || onLadder) && !this.crouching) {
      this.velocity.y = this.jumpSpeed;
      this.coyote = 0; this.jumpBuffer = 0;
      this.onJump?.();
    }

    // --- integrate + resolve, substepped so fast movement can't tunnel -------
    const wasAir = !this.onGround;
    const fallSpeed = this.velocity.y;
    const steps = Math.min(5, 1 + Math.floor(this.velocity.length() * dt / (this.radius * 0.6)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.collider.translate(this.velocity.clone().multiplyScalar(sdt));
      this._collide();
    }

    // Fell out of the world — respawn at the arena start.
    if (this.collider.start.y < -60 && this.respawnPoint) {
      this.teleport(...this.respawnPoint);
    }

    if (wasAir && this.onGround && fallSpeed < -4) {
      this._landDip = Math.min(0.22, -fallSpeed * 0.016);
      this.onLand?.(-fallSpeed);
    }

    // --- footsteps -----------------------------------------------------------
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && hSpeed > 0.6) {
      this._stepDist += hSpeed * dt;
      const stride = this.crouching ? 1.35 : this.sprinting ? 1.85 : 1.55;
      if (this._stepDist > stride) {
        this._stepDist = 0;
        this.onFootstep?.(hSpeed);
      }
    } else {
      this._stepDist = Math.min(this._stepDist, 1.0);
    }

    this._applyCamera(dt, hSpeed, wish, side);
  }

  _applyCamera(dt, hSpeed = 0, wish = null, side = null) {
    // Head bob — amplitude follows speed, frequency follows stride.
    const targetAmp = this.onGround ? Math.min(1, hSpeed / this.speedSprint) : 0;
    this._bobAmp += (targetAmp - this._bobAmp) * Math.min(1, dt * 8);
    this._bobT += dt * (6.2 + hSpeed * 0.85);
    const bobY = Math.sin(this._bobT * 2) * 0.031 * this._bobAmp;
    const bobX = Math.cos(this._bobT) * 0.022 * this._bobAmp;
    const bobRoll = Math.cos(this._bobT) * 0.0055 * this._bobAmp;

    this._landDip = Math.max(0, this._landDip - dt * 0.9);

    // Lean into strafes.
    let strafe = 0;
    if (wish && side && wish.lengthSq() > 0) strafe = wish.dot(side);
    this._lean += (-strafe * 0.028 - this._lean) * Math.min(1, dt * 7);

    // Sprint FOV kick.
    const targetFov = this.baseFov + (this.sprinting ? 8 : 0) + (this.crouching ? -3 : 0);
    this._fov += (targetFov - this._fov) * Math.min(1, dt * 6);
    if (Math.abs(this.camera.fov - this._fov) > 0.01) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }

    const eyeOffset = (this.crouching ? this.crouchHeight : this.height) - 0.12;
    this._eyeY += ((this.collider.start.y - this.radius + eyeOffset) - this._eyeY) * Math.min(1, dt * 18);

    const eye = new THREE.Vector3(
      this.collider.start.x + bobX * 0.4,
      this._eyeY + bobY - this._landDip,
      this.collider.start.z
    );

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(this._lean + bobRoll);

    if (!this.thirdPerson) {
      this.camera.position.copy(eye);
      this._boomNow = 0;
      return;
    }

    // Pull the camera back along its own view axis, then shorten the boom until
    // it is clear of geometry — otherwise it sits inside the wall behind you
    // and you see the inside of the world.
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const pivot = eye.clone().addScaledVector(right, this.boomSide);
    pivot.y += this.boomHeight;

    let want = this.boom;
    if (this.octree) {
      const probe = new Capsule(pivot.clone(), pivot.clone(), 0.28);
      for (let step = want; step > 0.4; step -= 0.35) {
        probe.start.copy(pivot).addScaledVector(back, step);
        probe.end.copy(probe.start);
        if (!this.octree.capsuleIntersect(probe)) { want = step; break; }
        want = step - 0.35;
      }
      want = Math.max(0.4, want);
    }
    // Snap in fast when something blocks, ease out slowly when it clears, so
    // the camera never lurches through a doorway.
    const rate = want < this._boomNow ? 30 : 6;
    this._boomNow += (want - this._boomNow) * Math.min(1, dt * rate);
    this.camera.position.copy(pivot).addScaledVector(back, this._boomNow);
  }
}
