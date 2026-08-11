// Game shell: boot, state machine, frame loop, and the wiring between the
// engine, the arenas and the front end.

import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { World } from './engine/world.js';
import { FirstPersonController } from './engine/controller.js';
import { audio } from './engine/audio.js';
import { save } from './game/state.js';
import { MUTATORS, POWERUPS } from './game/content.js';
import { PickupSystem } from './game/pickups.js';
import { Seeker } from './game/seeker.js';
import { Flashlight } from './game/flashlight.js';
import { PowerupSystem } from './game/powerups.js';
import { HUD } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { MenuScene } from './ui/menuscene.js';
import { buildCredits } from './ui/credits.js';
import { loadArena, metaIndex, ARENA_LIST } from './arenas/index.js';
import { Round, PHASE, ROLE } from './game/round.js';
import { Lobby } from './ui/lobby.js';
import { Monster } from './game/monster.js';
import { makeRNG } from './engine/rng.js';
import { setAssetRenderer, loadManifest } from './engine/assets.js';

const $ = (id) => document.getElementById(id);
const STATE = { BOOT: 'boot', MENU: 'menu', LOADING: 'loading', PLAY: 'play', PAUSE: 'pause', RESULTS: 'results', CREDITS: 'credits' };

class Game {
  constructor() {
    this.state = STATE.BOOT;
    this.currentArenaId = null;
    this.clock = new THREE.Clock();
    this._raf = null;
    this.runTime = 0;
    this.runCoins = 0;
    this.audioReady = false;
  }

  // ================================================================== BOOT ==
  async boot() {
    const canvas = $('gl');
    const status = (t, p) => { $('bootStatus').textContent = t; $('bootFill').style.width = (p * 100) + '%'; };

    status('CREATING CONTEXT', 0.1);
    try {
      this.renderer = new Renderer(canvas, save.settings.quality);
    } catch (e) {
      $('bootStatus').textContent = 'WEBGL 2 UNAVAILABLE';
      console.error(e);
      return;
    }
    await frame();

    status('BUILDING WORLD HOST', 0.3);
    this.world = new World(this.renderer);
    this.controller = new FirstPersonController(this.renderer.camera, canvas);
    this.controller.sensitivity = 0.0022 * save.settings.sensitivity;
    this.controller.invertY = save.settings.invertY;
    this.controller.baseFov = save.settings.fov;
    await frame();

    status('COMPOSING MENU', 0.55);
    this.menuScene = new MenuScene(this.renderer);
    this.renderer.attach(this.menuScene.scene);
    this.renderer.setGrade({
      exposure: 1.05, saturation: 1.1, contrast: 1.08,
      bloom: 0.6, bloomRadius: 0.8, bloomThreshold: 0.75,
      vignette: 1.0, grain: 0.03, aberration: 0.0018,
    });
    await frame();

    status('WIRING SYSTEMS', 0.75);
    this.hud = new HUD();
    this.menu = new Menu(this);
    this.pickups = new PickupSystem(this.world.scene);
    this.seeker = new Seeker(this.world.scene);
    this.flashlight = new Flashlight(this.world.scene, this.renderer.camera);
    this.flashlight.applySkin(save.equipped);
    this.powerups = new PowerupSystem({
      controller: this.controller,
      seeker: this.seeker,
      flashlight: this.flashlight,
      renderer: this.renderer,
      scene: this.world.scene,
      world: this.world,
      pickups: this.pickups,
      baseFearRate: 1,
    });
    // Round mode: eleven slots, a wheel, thirty seconds, then the monster.
    setAssetRenderer(this.renderer.gl);
    loadManifest();
    this.round = new Round(makeRNG('round-' + Date.now()));
    this.lobby = new Lobby(this.round, this);
    this.monster = new Monster(this.world.scene);
    this._wireRound();

    this._wireCallbacks();
    this._wireInput();
    await frame();

    status('READY', 1.0);
    await sleep(280);

    this.menu.init();
    this.toMenu(true);
    this.loop();
  }

  _wireCallbacks() {
    this.controller.onFootstep = (speed) => {
      const p = this.controller.position;
      this._dropTrail(p);
      if (this.controller.silenced) return;
      audio.footstep(this.world.surfaceAt(p.x, p.z), speed);
    };
    this.controller.onLand = (impact) => audio.land(impact);
    this.controller.onJump = () => audio.jump();

    this.pickups.onCollect = (item) => {
      if (item.kind === 'coin') {
        this.runCoins++;
        this.hud.coins(this.pickups.collectedCoins, this.pickups.totalCoins);
      } else if (item.kind === 'battery') {
        this.flashlight.recharge(0.5);
        this.hud.toast('BATTERY +50%', 'gold');
      } else if (item.kind === 'pup') {
        this.hud.toast('YOU FOUND THE PUP', 'pink');
        this.hud.pup(true);
        this.foundPupThisRun = true;
      } else if (item.kind === 'powerup') {
        this.powerups.pick(item.powerId);
        this.hud.toast(POWERUPS[item.powerId].name + ' ACQUIRED');
      }
    };

    this.seeker.onSpotted = () => {
      this.hud.spottedFlash();
      this._glitchHud();
      this.renderer.setDamage(1);
      this.spottedCount = (this.spottedCount || 0) + 1;
      save.data.stats.spotted++;
      if (this.mutatorOn('fragile')) {
        this.hud.toast('FRAGILE — RUN OVER', 'red');
        setTimeout(() => this.endRun(false), 900);
      }
    };
    this.seeker.onPing = () => this.hud.scanPulse();

    this.powerups.onChange = () => {
      this.hud.power(this.powerups.current, this.powerups.activeSummary());
    };
  }

  _wireRound() {
    this.round.on('phase', (phase) => {
      if (phase === PHASE.HIDE) {
        // The monster is held at its spawn for the full thirty seconds. If the
        // player drew SEEKER they are held too — the cage overlay is the tell.
        this.monster.cage(true);
        this.controller.frozen = this.round.localIsSeeker;
        this.hud.hint(this.round.localIsSeeker
          ? 'YOU ARE THE SEEKER — WAIT'
          : 'THIRTY SECONDS. GO.', 3);
      }
      if (phase === PHASE.HUNT) {
        this.monster.cage(false);
        this.controller.frozen = false;
        this.hud.hint(this.round.localIsSeeker ? 'HUNT THEM' : 'IT IS COMING', 2.5);
      }
      if (phase === PHASE.OVER) this._endRound();
    });

    this.round.on('localCaught', () => {
      this.spectating = true;
      this.controller.noclip = true;
      this.renderer.setDamage(1);
    });

    this.monster.onCatch = () => {
      if (this.spectating || this.round.phase !== PHASE.HUNT) return;
      if (this.round.localIsSeeker) return;   // the player IS the monster
      this.round.catchParticipant('local', 'THE SEEKER');
    };
  }

  _wireInput() {
    const canvas = $('gl');

    canvas.addEventListener('click', () => {
      this._initAudio();
      if (this.state === STATE.PLAY && document.pointerLockElement !== canvas) {
        this.controller.lock();
      }
    });
    window.addEventListener('keydown', () => this._initAudio(), { once: true });

    document.addEventListener('pointerlockchange', () => {
      if (this.state === STATE.PLAY && document.pointerLockElement !== canvas) {
        this.pause();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === STATE.PLAY) { e.preventDefault(); this.pause(); }
        else if (this.state === STATE.PAUSE) { e.preventDefault(); this.resume(); }
        else if (this.state === STATE.CREDITS) { this.toMenu(); }
        return;
      }
      if (this.state !== STATE.PLAY) return;

      switch (e.code) {
        case 'KeyF': {
          const on = this.flashlight.toggle();
          audio.play({ type: 'square', freq: on ? 900 : 520, dur: 0.05, gain: 0.06, filter: 4000 });
          if (!on && this.flashlight.battery <= 0.02) this.hud.toast('BATTERY DEAD', 'red');
          break;
        }
        case 'KeyQ': {
          const used = this.powerups.use();
          if (used) this.hud.toast(POWERUPS[used].name + ' ACTIVE');
          else audio.ui('error');
          break;
        }
        case 'KeyM':
          this.hud.setMinimap(!this.hud.mapEnabled);
          save.set('minimap', this.hud.mapEnabled);
          audio.ui('click');
          break;
        case 'KeyV':
          this.controller.noclip = !this.controller.noclip;
          this.hud.toast(this.controller.noclip ? 'FREE CAMERA ON' : 'FREE CAMERA OFF');
          break;
        case 'KeyR':
          if (e.shiftKey) this.startArena(this.currentArenaId);
          break;
      }
    });

    // Hold Tab to scan: reveals nearby pickups but spikes your exposure.
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.state === STATE.PLAY && !this._scanning) {
        e.preventDefault();
        this._scanning = true;
        this.pickups.reveal(3);
        this.seeker.suspicion = Math.min(1, this.seeker.suspicion + 0.25);
        this.hud.hint('SCANNING — YOU ARE EASIER TO FIND', 1.2);
        audio.play({ type: 'sine', freq: 900, freqEnd: 1500, dur: 0.25, gain: 0.06 });
      }
    });
    document.addEventListener('keyup', (e) => { if (e.code === 'Tab') this._scanning = false; });

    window.addEventListener('blur', () => { if (this.state === STATE.PLAY) this.pause(); });
  }

  _initAudio() {
    if (this.audioReady) return;
    audio.init();
    audio.resume();
    audio.setVolume('master', save.settings.volMaster);
    audio.setVolume('music', save.settings.volMusic);
    audio.setVolume('sfx', save.settings.volSfx);
    this.audioReady = true;
    if (this.state === STATE.MENU) { audio.ambience('void', 0.6); audio.music('menu'); }
  }

  // ================================================================ STATES ==
  toMenu(first = false) {
    this.state = STATE.MENU;
    this.controller.enabled = false;
    this.controller.unlock();
    this.hud.show(false);
    this.menu.hidePause();
    this.menu.hideResults();
    this.menu.hideLoading();
    $('boot').classList.remove('active');
    $('credits').classList.remove('active');
    this.menu.show(true);
    this.renderer.attach(this.menuScene.scene);
    this.renderer.setGrade({
      exposure: 1.05, saturation: 1.1, contrast: 1.08,
      bloom: 0.6, bloomRadius: 0.8, bloomThreshold: 0.75,
      vignette: 1.0, grain: save.settings.grain ? 0.03 : 0, aberration: 0.0018,
      lift: [0, 0, 0], gain: [1, 1, 1], scanline: 0,
    });
    this.renderer.setDamage(0);
    const sel = metaIndex[this.menu?.selected] || ARENA_LIST[0];
    if (sel) this.menuScene.setPalette(sel.colors[0], sel.colors[1]);
    if (this.audioReady && !first) { audio.ambience('void', 0.6); audio.music('menu'); }
  }

  previewArena(meta) {
    this.menuScene.setPalette(meta.colors[0], meta.colors[1]);
  }

  toastMenu(text) {
    // Reuse the HUD toast rail even on the menu — it's already positioned well.
    this.hud.el.root.classList.add('active');
    this.hud.toast(text, 'red');
    setTimeout(() => { if (this.state !== STATE.PLAY) this.hud.el.root.classList.remove('active'); }, 2600);
  }

  mutatorOn(id) { return save.mutators.includes(id); }

  // ================================================================= LOAD ==
  async startArena(id) {
    if (this._loading) return;
    this._loading = true;
    this._initAudio();

    const meta = metaIndex[id] || { id, name: id.toUpperCase(), order: 0, tagline: '', colors: ['#888', '#111'] };
    this.menu.show(false);
    this.menu.hidePause();
    this.menu.hideResults();
    this.hud.show(false);
    this.menu.showLoading(meta);
    this.menu.loadProgress(0.08);
    audio.stopAmbience();
    audio.stopMusic();
    await frame();

    let mod;
    try {
      mod = await loadArena(id);
    } catch (e) {
      console.error(e);
      this.menu.hideLoading();
      this.toMenu();
      this._loading = false;
      return;
    }
    this.menu.loadProgress(0.28);
    await frame();

    const fullMeta = { ...meta, ...mod.meta, id };
    this.currentArenaId = id;
    this.currentMeta = fullMeta;

    // ---- build the world ---------------------------------------------------
    this.renderer.attach(this.world.scene);
    let ctx;
    try {
      ctx = await this.world.load(fullMeta, mod.build, this.renderer.quality);
    } catch (e) {
      console.error(`Arena "${id}" threw while building:`, e);
      const fb = await import('./arenas/_fallback.js');
      ctx = await this.world.load({ ...fb.meta, id }, fb.build, this.renderer.quality);
    }
    this.menu.loadProgress(0.62);
    await frame();

    // ---- collision ---------------------------------------------------------
    const n = this.controller.buildCollision(this.world.root);
    console.info(`[${id}] collision meshes: ${n}`);
    this.menu.loadProgress(0.8);
    await frame();

    // ---- gameplay layers ---------------------------------------------------
    this.pickups.build(this.world.pickups, { scarcity: this.mutatorOn('scarcity') });
    this.seeker.configure({
      difficulty: fullMeta.difficulty ?? 3,
      bounds: fullMeta.bounds ?? 100,
      spawn: fullMeta.spawn ?? [0, 1, 0],
      hidingSpots: this.world.hidingSpots,
      hunted: this.mutatorOn('hunted'),
    });
    this.powerups.reset();
    this.powerups.slots = save.hasUpgrade('slot2') ? 2 : 1;
    this._applyUpgrades();
    this.flashlight.applySkin(save.equipped);
    this._syncAura(save.equipped);
    this._barkTimer = 0;
    document.body.classList.remove('hud-glitch');
    this.flashlight.battery = 1;
    this.flashlight.on = false;
    this.flashlight.enabled = !this.mutatorOn('blackout');

    // Make sure the scene the flashlight/pickups live in is the world scene.
    if (this.flashlight.spot.parent !== this.world.scene) {
      this.world.scene.add(this.flashlight.spot, this.flashlight.target, this.flashlight.fill);
    }
    if (this.seeker.group.parent !== this.world.scene) this.world.scene.add(this.seeker.group);
    if (this.pickups.group.parent !== this.world.scene) this.world.scene.add(this.pickups.group);

    // ---- player ------------------------------------------------------------
    const sp = fullMeta.spawn ?? [0, 1, 0];
    this.controller.teleport(sp[0], sp[1], sp[2]);
    this.controller.respawnPoint = sp;
    this.controller.yaw = fullMeta.spawnYaw ?? 0;
    this.controller.pitch = 0;
    this.controller.crouching = false;
    this.controller.noclip = false;
    this.controller.baseFov = save.settings.fov;
    this.controller.sensitivity = 0.0022 * save.settings.sensitivity;
    this.controller.invertY = save.settings.invertY;
    this.controller.speedSprint = this.mutatorOn('nosprint') ? this.controller.speedWalk : 8.1;
    this.controller.jumpSpeed = this.mutatorOn('featherfoot') ? 10.5 : 8.2;
    this.controller.climbZones = collectClimbZones(this.world.root);

    // ---- audio -------------------------------------------------------------
    const snd = this.world.pendingSound;
    if (snd) {
      if (snd.space) audio.setSpace(snd.space.size, snd.space.dark, snd.space.wet);
      audio.ambience(snd.ambience || 'void', 1);
      audio.music(snd.mood || fullMeta.music || 'tense');
    } else {
      audio.ambience('void', 0.8);
      audio.music(fullMeta.music || 'tense');
    }

    // ---- HUD ---------------------------------------------------------------
    this.hud.setArena(fullMeta.name);
    this.hud.setAccent(save.equipped.accent);
    this.hud.coins(0, this.pickups.totalCoins);
    this.hud.pup(false);
    this.hud.power(null, null);
    this.hud.setMinimap(save.settings.minimap);
    this.runTime = 0;
    this.runCoins = 0;
    this.spottedCount = 0;
    this.foundPupThisRun = false;
    this._baseGrade = null;

    // ---- round mode --------------------------------------------------------
    this.roundMode = save.settings.mode !== 'solo';
    this.spectating = false;
    if (this.roundMode) {
      this.round.rng = makeRNG(`${id}-${Date.now()}`);
      this.round.configure({
        arenaId: id,
        hidingSpots: this.world.hidingSpots,
        bounds: fullMeta.bounds ?? 100,
        spawn: sp,
        localName: (save.data.name || 'YOU').toUpperCase(),
      });
      // Scatter the AI hiders around the spawn so they don't start stacked.
      const rr = makeRNG(id + '-spread');
      for (const p of this.round.participants) {
        if (p.isLocal) continue;
        const a = rr() * Math.PI * 2, d = 4 + rr() * 14;
        p.pos.x = sp[0] + Math.cos(a) * d;
        p.pos.y = sp[1];
        p.pos.z = sp[2] + Math.sin(a) * d;
      }
      if (!this.monster.loaded) await this.monster.load();
      this.monster.configure({
        octree: this.controller.octree,
        hidingSpots: this.world.hidingSpots,
        bounds: fullMeta.bounds ?? 100,
        difficulty: fullMeta.difficulty ?? 3,
      });
      const ma = rr() * Math.PI * 2;
      this.monster.spawn(sp[0] + Math.cos(ma) * 26, sp[1] + 1, sp[2] + Math.sin(ma) * 26);
      this.monster.cage(true);
      if (this.monster.root.parent !== this.world.scene) this.world.scene.add(this.monster.root);
      this.round.start();
      this.seeker.enabled = false;      // the abstract sweep steps aside
    } else {
      this.seeker.enabled = true;
      this.monster.root.removeFromParent();
    }

    this.menu.loadProgress(1);
    await sleep(220);
    this.menu.hideLoading();
    this.hud.show(true);
    this.state = STATE.PLAY;
    this.controller.enabled = true;
    this.controller.lock();
    this.hud.hint('CLICK TO LOOK · WASD TO MOVE · F FOR LIGHT', 4);
    // State the objective once the control hint has cleared.
    setTimeout(() => {
      if (this.state === STATE.PLAY) {
        this.hud.hint(`FIND ALL ${this.pickups.totalCoins} COINS — OR THE PUP AND MOST OF THEM`, 5);
      }
    }, 4600);
    this._loading = false;
  }

  _applyUpgrades() {
    const c = this.controller, f = this.flashlight, s = this.seeker;
    f.setCapacity(1 * (save.hasUpgrade('lamp1') ? 1.4 : 1) * (save.hasUpgrade('lamp2') ? 1.4 : 1));
    c.staminaDrain = 0.20 / (save.hasUpgrade('lungs1') ? 1.35 : 1);
    this.pickupRadius = save.hasUpgrade('magnet') ? 3.5 : 1.6;
    s.stealth = Math.min(0.85, (save.equipped.stealth || 0) + (save.hasUpgrade('boots') ? 0.3 : 0));
    s.fearRate = save.hasUpgrade('nerve') ? 0.6 : 1.0;
    this.powerups.refs.baseFearRate = s.fearRate;
    this.showPupCompass = save.hasUpgrade('compass');
  }

  // ================================================================ PAUSE ==
  pause() {
    if (this.state !== STATE.PLAY) return;
    this.state = STATE.PAUSE;
    this.controller.enabled = false;
    this.controller.unlock();
    this.menu.showPause([
      ['ARENA', this.currentMeta?.name || '—'],
      ['TIME', fmtTime(this.runTime)],
      ['COINS', `${this.pickups.collectedCoins} / ${this.pickups.totalCoins}`],
      ['PUP', this.foundPupThisRun ? 'FOUND' : 'STILL HIDDEN'],
      ['SPOTTED', String(this.spottedCount || 0)],
    ]);
  }

  resume() {
    if (this.state !== STATE.PAUSE) return;
    this.menu.hidePause();
    this.state = STATE.PLAY;
    this.controller.enabled = true;
    this.controller.lock();
  }

  // ============================================================== RESULTS ==
  endRun(cleared = true) {
    if (this.state === STATE.RESULTS) return;
    this.state = STATE.RESULTS;
    this.controller.enabled = false;
    this.controller.unlock();
    this.hud.show(false);

    let mult = 1;
    for (const m of MUTATORS) if (this.mutatorOn(m.id)) mult *= m.mult;
    const base = this.pickups.collectedCoins;
    const pupBonus = this.foundPupThisRun ? 250 : 0;
    const clearBonus = cleared ? 100 : 0;
    const earned = Math.round((base * 10 + pupBonus + clearBonus) * mult);

    save.addCoins(earned);
    save.addXP(Math.round(earned * 0.6));
    save.recordRun(this.currentArenaId, {
      coins: this.pickups.collectedCoins,
      coinsMax: this.pickups.totalCoins,
      time: this.runTime,
      cleared,
      pup: this.foundPupThisRun,
    });

    const rows = [
      { k: 'COINS COLLECTED', v: `${this.pickups.collectedCoins} / ${this.pickups.totalCoins}` },
      { k: 'TIME', v: fmtTime(this.runTime) },
      { k: 'TIMES SPOTTED', v: String(this.spottedCount || 0) },
      { k: 'THE PUP', v: this.foundPupThisRun ? 'FOUND' : 'STILL OUT THERE' },
    ];
    if (mult > 1) rows.push({ k: 'MUTATOR BONUS', v: `×${mult.toFixed(2)}` });
    rows.push({ k: 'COINS EARNED', v: '+' + earned.toLocaleString(), hero: true });

    this.menu.showResults({
      tag: cleared ? 'ARENA CLEARED' : 'RUN ENDED',
      title: cleared ? 'COMPLETE' : 'CAUGHT',
      rows,
    });

    if (save.pupCount >= 12 && !save.data.seenCredits) {
      save.data.seenCredits = true;
      save.save();
      setTimeout(() => this.rollCredits(), 2600);
    }
  }

  /** Round mode's own results screen — survival, not collection. */
  _endRound() {
    if (this.state === STATE.RESULTS) return;
    this.state = STATE.RESULTS;
    this.controller.enabled = false;
    this.controller.unlock();
    this.hud.show(false);
    this.lobby.showDead(false);

    const r = this.round;
    const survived = r.local.alive;
    const asSeeker = r.localIsSeeker;
    const caught = r.hiders.filter(h => !h.alive).length;

    let mult = 1;
    for (const m of MUTATORS) if (this.mutatorOn(m.id)) mult *= m.mult;
    const base = asSeeker
      ? caught * 60                              // paid per hider brought down
      : (survived ? 700 : 180) + Math.floor(this.runTime) * 2;
    const coinBonus = this.pickups.collectedCoins * 6;
    const pupBonus = this.foundPupThisRun ? 250 : 0;
    const earned = Math.round((base + coinBonus + pupBonus) * mult);

    save.addCoins(earned);
    save.addXP(Math.round(earned * 0.6));
    save.recordRun(this.currentArenaId, {
      coins: this.pickups.collectedCoins,
      coinsMax: this.pickups.totalCoins,
      time: this.runTime,
      cleared: asSeeker ? caught >= 10 : survived,
      pup: this.foundPupThisRun,
    });

    const rows = [
      { k: 'YOUR ROLE', v: asSeeker ? 'SEEKER' : 'HIDER' },
      asSeeker
        ? { k: 'HIDERS CAUGHT', v: `${caught} / 10` }
        : { k: 'OUTCOME', v: survived ? 'SURVIVED' : 'CAUGHT' },
      { k: 'TIME', v: fmtTime(this.runTime) },
      { k: 'SURVIVORS', v: r.aliveHiders.map(h => h.name).join(', ') || 'NONE' },
    ];
    if (this.pickups.collectedCoins) rows.push({ k: 'COINS FOUND', v: String(this.pickups.collectedCoins) });
    if (this.foundPupThisRun) rows.push({ k: 'THE PUP', v: 'FOUND' });
    if (mult > 1) rows.push({ k: 'MUTATOR BONUS', v: `x${mult.toFixed(2)}` });
    rows.push({ k: 'COINS EARNED', v: '+' + earned.toLocaleString(), hero: true });

    this.menu.showResults({
      tag: asSeeker ? 'THE HUNT IS OVER' : (survived ? 'YOU LIVED' : 'YOU WERE CAUGHT'),
      title: asSeeker ? (caught >= 10 ? 'PERFECT HUNT' : 'HUNT ENDED') : (survived ? 'SURVIVED' : 'CAUGHT'),
      rows,
    });
  }

  rollCredits() {
    this.state = STATE.CREDITS;
    this.controller.enabled = false;
    this.menu.show(false);
    this.menu.hideResults();
    this.hud.show(false);
    buildCredits();
    $('credits').classList.add('active');
    this.renderer.attach(this.menuScene.scene);
    if (this.audioReady) audio.music('heroic');
  }

  // ============================================================== SETTINGS ==
  // --- signature flourishes ------------------------------------------------
  /** A soft coloured halo the player carries — the `aura` field on a skin. */
  _syncAura(skin) {
    const want = skin.aura || 0;
    if (want <= 0) {
      if (this._aura) { this._aura.removeFromParent(); this._aura = null; }
      return;
    }
    if (!this._aura) {
      this._aura = new THREE.PointLight(0xffffff, 0, 7, 2);
      this.world.scene.add(this._aura);
    }
    this._aura.color.setHex(skin.trail ?? skin.light);
    this._aura.intensity = want * 2.4;
    this._aura.distance = 4 + want * 5;
  }

  /** Fading footprints in the skin's colour — the `trail` field. */
  _dropTrail(pos) {
    const skin = save.equipped;
    if (!skin.aura || !skin.trail) return;
    if (!this._trailPool) {
      const geo = new THREE.CircleGeometry(0.20, 10);
      geo.rotateX(-Math.PI / 2);
      this._trailPool = [];
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: skin.trail, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending, fog: false,
        }));
        m.visible = false;
        m.userData.collide = false;
        this.world.scene.add(m);
        this._trailPool.push(m);
      }
      this._trailNext = 0;
    }
    const m = this._trailPool[this._trailNext = (this._trailNext + 1) % this._trailPool.length];
    m.material.color.setHex(skin.trail);
    m.position.set(pos.x, pos.y + 0.02, pos.z);
    m.visible = true;
    m.userData.life = 1.6;
  }

  _updateTrail(dt) {
    if (!this._trailPool) return;
    for (const m of this._trailPool) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      if (m.userData.life <= 0) { m.visible = false; continue; }
      const t = m.userData.life / 1.6;
      m.material.opacity = t * 0.5 * (save.equipped.aura ?? 0);
      m.scale.setScalar(1 + (1 - t) * 1.4);
    }
  }

  /**
   * GOOD BOY: the dog you already found twelve of will tell you where this
   * one is. A bark that gets more frequent the closer you get.
   */
  _updatePupSense(dt, playerPos) {
    if (!save.equipped.pupMode) return;
    const target = this.pickups.pupTarget();
    if (!target) return;
    const d = target.distanceTo(playerPos);
    if (d > 45) return;
    this._barkTimer = (this._barkTimer ?? 0) - dt;
    if (this._barkTimer <= 0) {
      this._barkTimer = 0.8 + (d / 45) * 6.5;
      audio.bark();
      if (d < 12) this.hud.hint('THE PUP IS CLOSE', 1.4);
    }
  }

  /** MNEMOSYNE: being seen corrupts your interface for a moment. */
  _glitchHud() {
    if (!save.equipped.glitchHud) return;
    document.body.classList.add('hud-glitch');
    clearTimeout(this._glitchTimer);
    this._glitchTimer = setTimeout(() => document.body.classList.remove('hud-glitch'), 900);
  }

  setQuality(q) { this.renderer.setQuality(q); }
  setSensitivity(v) { this.controller.sensitivity = 0.0022 * v; }
  setFov(v) { this.controller.baseFov = v; }
  setInvertY(v) { this.controller.invertY = v; }
  setGrain(on) { this.renderer.setGrade({ grain: on ? 0.035 : 0 }); }
  applySkin(skin) {
    this.flashlight.applySkin(skin);
    this.hud.setAccent(skin.accent);
    this._syncAura(skin);
    this.seeker.stealth = Math.min(0.85, (skin.stealth || 0) + (save.hasUpgrade('boots') ? 0.3 : 0));
  }

  // ================================================================== LOOP ==
  loop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.1);

      try {
        if (this.state === STATE.MENU || this.state === STATE.CREDITS || this.state === STATE.BOOT) {
          this.menuScene.update(dt);
        } else {
          this._updatePlay(dt);
        }
        this.renderer.render(dt);
      } catch (e) {
        console.error('Frame error:', e);
      }
    };
    tick();
  }

  _updatePlay(dt) {
    const playing = this.state === STATE.PLAY;
    const c = this.controller;

    if (playing) {
      this.runTime += dt;
      save.data.stats.playtime += dt;
    }

    c.update(playing ? dt : 0);
    this.world.update(playing ? dt : 0);
    this.flashlight.update(dt);

    const p = c.position;
    this.pickups.update(playing ? dt : 0, p, this.pickupRadius ?? 1.6);
    this.powerups.update(playing ? dt : 0);

    if (playing && this.roundMode) {
      const here = new THREE.Vector3(p.x, p.y, p.z);
      const hSpeed = Math.hypot(c.velocity.x, c.velocity.z);
      this.round.update(dt);
      this.lobby.update();
      // During lobby and wheel the world is already loaded and lit behind the
      // overlay, which is the whole point — you watch the arena while you wait.
      const hunting = this.round.phase === PHASE.HUNT;
      this.monster.update(dt, {
        target: (hunting && !this.spectating && !this.round.localIsSeeker) ? here : null,
        crouching: c.crouching,
        sprinting: c.sprinting,
        moving: hSpeed > 0.6,
        lightOn: this.flashlight.on && this.flashlight.spot.intensity > 0.5,
        canCatch: !this.spectating,
      });
      this.hud.tick(dt);
      this.hud.time(this.runTime);
      this.hud.meters({ stamina: c.stamina, battery: this.flashlight.battery, fear: this.seeker.fear });
      this.hud.power(this.powerups.current, this.powerups.activeSummary());
      this.hud.concealed(this.seeker.concealed(here, c.crouching));
      this._updateTrail(dt);
      if (this._aura) this._aura.position.set(p.x, p.y + 1.1, p.z);
      // Proximity dread: the closer it is, the higher your Fear climbs.
      if (hunting) {
        const md = this.monster.position.distanceTo(here);
        const pressure = Math.max(0, 1 - md / 30);
        this.seeker.fear = Math.min(100, Math.max(0,
          this.seeker.fear + (pressure > 0.1 ? pressure * 26 : -9) * dt));
      }
      const dmg = Math.max(0, 1 - (this.runTime - (this._lastHit ?? -99)) / 1.2);
      this.renderer.setDamage(this.spectating ? 0.45 : dmg * 0.8);
      return;
    }

    if (playing) {
      const hSpeed = Math.hypot(c.velocity.x, c.velocity.z);
      const here = new THREE.Vector3(p.x, p.y, p.z);
      this.hud.concealed(this.seeker.ghosted || this.seeker.concealed(here, c.crouching));
      this.seeker.update(dt, here, {
        crouching: c.crouching,
        sprinting: c.sprinting,
        moving: hSpeed > 0.6,
        silenced: !!c.silenced,
        lightOn: this.flashlight.on && this.flashlight.spot.intensity > 0.5,
      });

      // Fear degrades control: your aim drifts and your legs get heavy.
      const panic = this.seeker.panic;
      if (panic > 0) {
        c.yaw += Math.sin(this.runTime * 7.3) * 0.0009 * panic;
        c.pitch += Math.cos(this.runTime * 5.1) * 0.0007 * panic;
      }

      this._updateTrail(dt);
      this._updatePupSense(dt, here);
      if (this._aura) this._aura.position.set(p.x, p.y + 1.1, p.z);

      // damage flash decay
      const dmg = Math.max(0, 1 - (this.seeker._t - this.seeker.lastSpotted) / 1.2);
      this.renderer.setDamage(dmg * 0.8);

      // HUD
      this.hud.tick(dt);
      this.hud.time(this.runTime);
      this.hud.meters({
        stamina: c.stamina,
        battery: this.flashlight.battery,
        fear: this.seeker.fear,
      });
      this.hud.power(this.powerups.current, this.powerups.activeSummary());
      this.hud.drawMinimap({
        player: p,
        yaw: -c.yaw,
        pickups: this.pickups.items,
        rings: this.seeker.rings,
        bounds: this.currentMeta?.bounds ?? 100,
        pupTarget: this.showPupCompass ? this.pickups.pupTarget() : null,
        accent: save.equipped.accent,
      });

      // Win condition: every coin found, or the pup plus 80% of the coins.
      const allCoins = this.pickups.collectedCoins >= this.pickups.totalCoins && this.pickups.totalCoins > 0;
      const enough = this.foundPupThisRun && this.pickups.collectedCoins >= this.pickups.totalCoins * 0.8;
      if (allCoins || enough) this.endRun(true);
    }
  }
}

// ---------------------------------------------------------------- helpers --
/**
 * Ladders. Any object an arena tags `userData.climbable` becomes a volume the
 * controller treats as climbable — props.ladder() sets the flag, so a ladder
 * dropped into a scene just works.
 */
function collectClimbZones(root) {
  const zones = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.userData?.climbable) return;
    const box = new THREE.Box3().setFromObject(o);
    if (!isFinite(box.min.x) || box.isEmpty()) return;
    // Widen so you don't have to be pixel-perfect on the rungs.
    box.expandByVector(new THREE.Vector3(0.55, 0.2, 0.55));
    zones.push({ box });
  });
  return zones;
}

function frame() { return new Promise(r => requestAnimationFrame(() => r())); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ start --
const game = new Game();
window.__game = game;   // handy in the console
game.boot();

window.addEventListener('beforeunload', () => save.save());
setInterval(() => save.save(), 20000);
