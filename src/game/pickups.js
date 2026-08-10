// Collectibles. Arenas declare positions via ctx.pickup(); this module builds
// the visuals, animates them, and handles collection.

import * as THREE from 'three';
import { POWERUPS } from './content.js';
import { audio } from '../engine/audio.js';

const COIN_GEO = new THREE.CylinderGeometry(0.17, 0.17, 0.035, 18);
COIN_GEO.rotateX(Math.PI / 2);
const BATTERY_GEO = new THREE.CylinderGeometry(0.085, 0.085, 0.26, 12);
const POWER_GEO = new THREE.OctahedronGeometry(0.24, 0);
const PUP_GEO = new THREE.IcosahedronGeometry(0.22, 1);

export class PickupSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'pickups';
    scene.add(this.group);
    this.items = [];
    this.collectedCoins = 0;
    this.totalCoins = 0;
    this.pupFound = false;
    this.onCollect = null;      // (item) => void
    this.revealUntil = 0;
    this._t = 0;
  }

  clear() {
    this.group.clear();
    this.items.length = 0;
    this.collectedCoins = 0;
    this.totalCoins = 0;
    this.pupFound = false;
    this.revealUntil = 0;
  }

  /** @param {Array} defs list from World.pickups */
  build(defs, { scarcity = false } = {}) {
    this.clear();
    let coinIndex = 0;
    for (const def of defs) {
      if (scarcity) {
        if (def.type === 'battery') continue;
        if (def.type === 'coin' && (coinIndex++ % 2 === 1)) continue;
      }
      const item = this._make(def);
      if (item) {
        this.items.push(item);
        this.group.add(item.mesh);
        if (def.type === 'coin') this.totalCoins++;
      }
    }
  }

  _make(def) {
    const type = def.type || 'coin';
    let mesh, color, value = 0, kind = type, powerId;

    if (type === 'coin') {
      color = 0xffd700;
      mesh = new THREE.Mesh(COIN_GEO, sharedMaterial('coin'));
      value = 1;
    } else if (type === 'battery') {
      color = 0x46e0ff;
      mesh = new THREE.Mesh(BATTERY_GEO, sharedMaterial('battery'));
    } else if (type === 'pup') {
      color = 0xff3fa4;
      mesh = new THREE.Mesh(PUP_GEO, sharedMaterial('pup'));
    } else if (type.startsWith('powerup:')) {
      const id = type.slice(8);
      const p = POWERUPS[id];
      if (!p) return null;
      color = p.color;
      kind = 'powerup';
      powerId = id;
      mesh = new THREE.Mesh(POWER_GEO, sharedMaterial('powerup:' + id, p.color));
      mesh.userData.powerId = id;
    } else {
      return null;
    }

    mesh.position.copy(def.pos);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.collide = false;

    // A soft halo billboard so pickups read from a distance and through fog.
    const halo = new THREE.Sprite(sharedHalo(color));
    halo.scale.setScalar(type === 'pup' ? 2.2 : 1.35);
    mesh.add(halo);

    return {
      mesh, halo, kind, color, value, powerId,
      matKey: kind === 'powerup' ? 'powerup:' + powerId : kind,
      baseY: def.pos.y,
      taken: false,
      phase: (def.pos.x * 0.7 + def.pos.z * 1.3) % 6.283,
    };
  }

  /** Ping every pickup within radius so they glow brightly for a while. */
  reveal(seconds = 20) { this.revealUntil = this._t + seconds; }

  update(dt, playerPos, radius = 1.6) {
    this._t += dt;
    const revealing = this._t < this.revealUntil;
    const r2 = radius * radius;

    // Materials are shared per kind, so the glow pulse is driven once here
    // rather than fought over by every instance in the loop below.
    const pulse = 1 + Math.sin(this._t * 3.4) * 0.18;
    for (const [key, m] of MATERIALS) {
      m.emissiveIntensity = (key === 'coin' ? 1.5 : 2.2) * pulse * (revealing ? 2.4 : 1);
    }
    for (const m of HALOS.values()) {
      m.opacity = (revealing ? 0.9 : 0.5) * pulse;
    }

    for (const it of this.items) {
      if (it.taken) continue;
      const m = it.mesh;
      const bob = Math.sin(this._t * 2.0 + it.phase) * 0.09;
      m.position.y = it.baseY + bob;
      m.rotation.y += dt * (it.kind === 'coin' ? 2.0 : 1.1);
      if (it.kind === 'pup') m.rotation.x += dt * 0.6;

      const dx = m.position.x - playerPos.x;
      const dy = m.position.y - playerPos.y - 0.85;
      const dz = m.position.z - playerPos.z;
      if (dx * dx + dy * dy + dz * dz < r2) this._take(it);
    }
  }

  _take(it) {
    it.taken = true;
    it.mesh.visible = false;
    if (it.kind === 'coin') { this.collectedCoins++; audio.pickup('coin'); }
    else if (it.kind === 'pup') { this.pupFound = true; audio.bark(); }
    else audio.pickup('power');
    this.onCollect?.(it);
  }

  /** Nearest un-taken pup, for the PUP COMPASS upgrade. */
  pupTarget() {
    const p = this.items.find(i => i.kind === 'pup' && !i.taken);
    return p ? p.mesh.position : null;
  }

  remaining(kind) {
    return this.items.filter(i => i.kind === kind && !i.taken).length;
  }
}

// One material per pickup kind — 45 coins should not mean 45 materials.
const MATERIALS = new Map();
function sharedMaterial(key, tint) {
  if (MATERIALS.has(key)) return MATERIALS.get(key);
  const spec = {
    coin:    { color: 0xffdf5a, emissive: 0xffb400, emissiveIntensity: 1.5, metalness: 0.9, roughness: 0.25 },
    battery: { color: 0x2a3a44, emissive: 0x2ec8ff, emissiveIntensity: 2.0, metalness: 0.7, roughness: 0.30 },
    pup:     { color: 0xffb2d8, emissive: 0xff3fa4, emissiveIntensity: 2.6, metalness: 0.2, roughness: 0.50, flatShading: true },
  }[key] ?? { color: 0x1a1f26, emissive: tint ?? 0xffffff, emissiveIntensity: 2.4, metalness: 0.4, roughness: 0.2 };
  const m = new THREE.MeshStandardMaterial(spec);
  MATERIALS.set(key, m);
  return m;
}

const HALOS = new Map();
function sharedHalo(color) {
  if (HALOS.has(color)) return HALOS.get(color);
  const m = new THREE.SpriteMaterial({
    map: haloTexture(), color,
    transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  HALOS.set(color, m);
  return m;
}

let _halo = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _halo = new THREE.CanvasTexture(c);
  _halo.colorSpace = THREE.SRGBColorSpace;
  return _halo;
}
