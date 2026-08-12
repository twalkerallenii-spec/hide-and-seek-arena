// In-game HUD. Pure DOM — cheap, crisp at any resolution, and keeps text out of
// the 3D pipeline. Everything here is driven from main.js's frame loop.

import { POWERUPS } from '../game/content.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      root: $('hud'),
      arena: $('hudArena'),
      timer: $('hudTimer'),
      coins: $('hudCoins'),
      coinsMax: $('hudCoinsMax'),
      pup: $('hudPup'),
      stamina: $('mStamina'),
      battery: $('mBattery'),
      fear: $('mFear'),
      staminaM: document.querySelector('.meter.stamina'),
      batteryM: document.querySelector('.meter.battery'),
      fearM: document.querySelector('.meter.fear'),
      slot: $('powerSlot'),
      powerIcon: $('powerIcon'),
      powerName: $('powerName'),
      powerHint: $('powerHint'),
      hint: $('hintLine'),
      toasts: $('toasts'),
      scan: $('scanwave'),
      spotted: $('spottedOverlay'),
      fearVig: $('fearVignette'),
      crosshair: $('crosshair'),
      minimap: $('minimap'),
      conceal: $('concealBadge'),
    };
    this._concealed = false;
    this._hintTimer = 0;
    this.mapCtx = this.el.minimap.getContext('2d');
    this.mapEnabled = true;
  }

  show(on) { this.el.root.classList.toggle('active', on); }

  setArena(name) { this.el.arena.textContent = name; }

  setAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
  }

  time(seconds) {
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    this.el.timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  coins(n, max) {
    this.el.coins.textContent = n;
    this.el.coinsMax.textContent = '/' + max;
  }

  pup(found) {
    this.el.pup.textContent = found ? 'FOUND' : '—';
    this.el.pup.style.color = found ? 'var(--magenta)' : '';
  }

  meters({ stamina, battery, fear, charging, exhausted }) {
    this.el.stamina.style.width = (stamina * 100).toFixed(1) + '%';
    // Three readable states: spending it, waiting for it, and empty.
    this.el.staminaM.classList.toggle('charging', !!charging);
    this.el.staminaM.classList.toggle('empty', !!exhausted);
    this.el.battery.style.width = (battery * 100).toFixed(1) + '%';
    this.el.fear.style.width = fear.toFixed(1) + '%';
    this.el.staminaM.classList.toggle('low', stamina < 0.2 && !charging);
    this.el.batteryM.classList.toggle('low', battery < 0.18);
    this.el.fearM.classList.toggle('low', fear > 75);
    this.el.fearVig.style.opacity = fear > 55 ? ((fear - 55) / 45 * 0.85).toFixed(2) : 0;
  }

  power(heldId, activeSummary) {
    const slot = this.el.slot;
    if (activeSummary) {
      const d = activeSummary.def;
      slot.className = 'powerslot active';
      this.el.powerIcon.textContent = d.icon;
      this.el.powerName.textContent = d.name;
      this.el.powerHint.textContent = `${activeSummary.left.toFixed(1)}s remaining`;
      return;
    }
    if (heldId) {
      const d = POWERUPS[heldId];
      slot.className = 'powerslot ready';
      this.el.powerIcon.textContent = d.icon;
      this.el.powerName.textContent = d.name;
      this.el.powerHint.textContent = d.hint;
    } else {
      slot.className = 'powerslot empty';
      this.el.powerIcon.textContent = '·';
      this.el.powerName.textContent = 'NO POWER-UP';
      this.el.powerHint.textContent = 'Find one in the arena';
    }
  }

  hint(text, seconds = 2.4) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    this._hintTimer = seconds;
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2200);
    // never let toasts stack off-screen
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
  }

  /** Tell the player, unambiguously, whether the sweep can currently see them. */
  concealed(on) {
    if (on === this._concealed) return;
    this._concealed = on;
    this.el.conceal.classList.toggle('show', on);
  }

  scanPulse() {
    const e = this.el.scan;
    e.classList.remove('go');
    void e.offsetWidth;
    e.classList.add('go');
  }

  spottedFlash() {
    const e = this.el.spotted;
    e.classList.remove('go');
    void e.offsetWidth;
    e.classList.add('go');
  }

  /** Show a live text readout in the corner. Pass null to hide it. */
  diagnostics(fn) {
    this._diagFn = fn;
    if (!this._diagEl) {
      const el = document.createElement('pre');
      el.className = 'hud-diag';
      document.body.appendChild(el);
      this._diagEl = el;
    }
    this._diagEl.style.display = fn ? 'block' : 'none';
  }

  tick(dt) {
    if (this._diagFn && this._diagEl) {
      this._diagAcc = (this._diagAcc || 0) + dt;
      if (this._diagAcc > 0.25) {           // 4 Hz is plenty and costs nothing
        this._diagAcc = 0;
        try { this._diagEl.textContent = this._diagFn(); }
        catch (e) { this._diagEl.textContent = String(e); }
      }
    }
    if (this._hintTimer > 0) {
      this._hintTimer -= dt;
      if (this._hintTimer <= 0) this.el.hint.classList.remove('show');
    }
  }

  // --- minimap -------------------------------------------------------------
  setMinimap(on) {
    this.mapEnabled = on;
    this.el.minimap.classList.toggle('on', on);
  }

  /**
   * Top-down radar. Not a floorplan — deliberately abstract: you get pickups,
   * the sweep origin, and your own heading, and you work the rest out yourself.
   */
  drawMinimap({ player, yaw, pickups, rings, bounds, pupTarget, accent }) {
    if (!this.mapEnabled) return;
    const c = this.mapCtx, W = 260, H = 260, R = 120;
    const scale = R / Math.max(30, bounds * 0.85);
    c.clearRect(0, 0, W, H);

    c.save();
    c.translate(W / 2, H / 2);

    // grid
    c.strokeStyle = 'rgba(255,255,255,0.055)';
    c.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      const p = i * (R / 3);
      c.beginPath(); c.moveTo(p, -R); c.lineTo(p, R); c.stroke();
      c.beginPath(); c.moveTo(-R, p); c.lineTo(R, p); c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.beginPath(); c.arc(0, 0, R, 0, 6.2832); c.stroke();

    c.rotate(yaw);   // rotate the world so "up" is always where you face

    // seeker rings
    for (const r of rings) {
      const x = (r.mesh.position.x - player.x) * scale;
      const z = (r.mesh.position.z - player.z) * scale;
      c.strokeStyle = 'rgba(111,228,255,0.5)';
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(x, z, r.radius * scale, 0, 6.2832); c.stroke();
    }

    // pickups
    for (const it of pickups) {
      if (it.taken) continue;
      const x = (it.mesh.position.x - player.x) * scale;
      const z = (it.mesh.position.z - player.z) * scale;
      if (x * x + z * z > R * R) continue;
      c.fillStyle = it.kind === 'coin' ? 'rgba(255,215,0,0.85)'
        : it.kind === 'battery' ? 'rgba(70,224,255,0.9)'
          : it.kind === 'pup' ? 'rgba(255,63,164,0.95)' : 'rgba(180,108,255,0.9)';
      c.beginPath(); c.arc(x, z, it.kind === 'coin' ? 2 : 3, 0, 6.2832); c.fill();
    }

    // pup compass needle
    if (pupTarget) {
      const dx = pupTarget.x - player.x, dz = pupTarget.z - player.z;
      const len = Math.hypot(dx, dz) || 1;
      c.strokeStyle = 'rgba(255,63,164,0.5)';
      c.setLineDash([4, 5]);
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, 0);
      c.lineTo((dx / len) * (R - 12), (dz / len) * (R - 12));
      c.stroke();
      c.setLineDash([]);
    }

    c.restore();

    // player arrow
    c.save();
    c.translate(W / 2, H / 2);
    c.fillStyle = accent || '#46e0ff';
    c.beginPath();
    c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6);
    c.closePath(); c.fill();
    c.restore();
  }
}
