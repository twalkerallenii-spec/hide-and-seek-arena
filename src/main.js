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
import { Avatar, CHARACTERS, CROWD_VARIETY, preloadAvatars } from './game/avatar.js';
import { WaitRoom } from './game/waitroom.js';
import { makeRNG } from './engine/rng.js';
import { setAssetRenderer, loadManifest } from './engine/assets.js';
import { ProximityGrid } from './engine/proximity.js';
import { NetClient } from './net/client.js';
import { Voice } from './net/voice.js';
import { resolveServerUrl, wakeServer } from './net/config.js';

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
    // Draw-call culling by distance. See engine/proximity.js.
    this.proximity = new ProximityGrid({ cell: 24, radius: 90 });
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
    // Ghost, Stillness and Decoy act on whatever is actually hunting you, which
    // in round mode is the monster rather than the abstract sweep. This has to
    // happen after the Monster exists.
    this.powerups.refs.monster = this.monster;
    // The hider's own body, seen over their shoulder. The Seeker never needs it.
    this.avatar = new Avatar(this.world.scene, CHARACTERS[0]);
    // Somewhere for the Seeker to be during the hide phase. See waitroom.js.
    this.waitRoom = new WaitRoom(this.world.scene);
    /** id -> Avatar for everyone who is not the local player. */
    this.crowd = new Map();
    this._wireRound();

    // Multiplayer is strictly additive: if the server is asleep, unreachable or
    // switched off with ?server=off, everything below quietly does nothing and
    // the game runs its local round against AI.
    this.net = new NetClient();
    this.voice = new Voice((m) => this.net.sendRaw?.(m) ?? this.net.send(m.t, m));
    this._wireNet();
    wakeServer();

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
        if (this.controller.thirdPerson) this.avatar?.pickup();
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
        // Roles are known by now, so this is where the camera mode is decided:
        // the Seeker is the monster and plays first person; hiders play over
        // the shoulder and get a visible body.
        this._applyViewMode();
        this._buildCrowd();
        // Hide phase is the first moment the player controls their character,
        // so this is where the pointer gets captured.
        if (this.state === STATE.PLAY) this.controller.lock();
        // The monster is held at its spawn for the full thirty seconds. If the
        // player drew SEEKER they are held too — the cage overlay is the tell.
        this.monster.cage(true);
        if (this.round.localIsSeeker) {
          // A real room rather than a frozen camera: from in here you cannot
          // watch where anyone runs, which is the whole point of a hide phase.
          const spot = this.waitRoom.enter();
          this.controller.teleport(spot.x, spot.y, spot.z);
          this.controller.frozen = false;   // free to walk around in there
          this.hud.hint('YOU ARE THE SEEKER — HOLD', 3);
        } else {
          this.controller.frozen = false;
          this.hud.hint('THIRTY SECONDS. GO.', 3);
        }
      }
      if (phase === PHASE.HUNT) {
        // The player IS the monster when they drew Seeker, so the AI one stands
        // down entirely — two monsters in one arena reads as a bug.
        const playerIsIt = this.round.localIsSeeker;
        this.monster.root.visible = !playerIsIt;
        this.monster.enabled = !playerIsIt;
        this.monster.cage(playerIsIt);
        this.controller.frozen = false;
        if (this.round.localIsSeeker) {
          // Released: out of the holding cell and into the arena.
          const sp = this.currentMeta?.spawn ?? [0, 1, 0];
          this.waitRoom.leave();
          this.controller.teleport(sp[0], sp[1], sp[2]);
          this.renderer.setDamage(0);
        }
        this.hud.hint(this.round.localIsSeeker ? 'HUNT THEM' : 'IT IS COMING', 2.5);
      }
      if (phase === PHASE.OVER) this._endRound();
    });

    this.round.on('localCaught', () => {
      // Being found is a setback, not an ejection: a short blackout, then you
      // are back at the start area and in the round again.
      this.renderer.setDamage(1);
      this.controller.frozen = true;
      this.avatar?.hit();
      this._respawnAt = this.runTime + 3.0;
    });
    this.round.on('respawn', (p) => {
      if (!p.isLocal) return;
      const sp = this.currentMeta?.spawn ?? [0, 1, 0];
      this.controller.teleport(sp[0], sp[1], sp[2]);
      this.controller.frozen = false;
      this.renderer.setDamage(0);
      this.avatar?.respawn();
      this.hud.toast('BACK IN', 'gold');
    });

    this.monster.onCatch = () => {
      if (this.spectating || this.round.phase !== PHASE.HUNT) return;
      if (this.round.localIsSeeker) return;   // the player IS the monster
      this.round.catchParticipant('local', 'THE SEEKER');
    };
  }

  _wireNet() {
    const net = this.net;

    net.on('status', (st) => {
      this.online = st === 'connected';
      if (st === 'connected') this.hud.toast('CONNECTED — MULTIPLAYER', 'gold');
      if (st === 'error') this.hud.toast('OFFLINE — PLAYING VS AI');
    });

    // Any voice traffic is consumed by the voice client and goes no further.
    net.on('message', (msg) => {
      if (this.voice.handle(msg)) return;
    });

    // The server is the authority once it is talking to us.
    net.on('snapshot', (snap) => {
      try { this.round.applyState(snap); } catch (e) { console.warn('snapshot', e); }
    });
    net.on('roster', (r) => { try { this.round.applyState({ participants: r }); } catch { } });

    this.round.on('secret', () => { if (this.online) net.send('secret', {}); });
  }

  /** Geometry between two points muffles a voice. Used by the voice panner. */
  _voiceOccluded(a, b) {
    const oct = this.controller?.octree;
    if (!oct) return false;
    const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = dir.length();
    if (len < 1) return false;
    dir.divideScalar(len);
    const hit = oct.rayIntersect(new THREE.Ray(new THREE.Vector3(a.x, a.y, a.z), dir));
    return !!hit && hit.distance < len - 0.6;
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
      if (this.state !== STATE.PLAY || document.pointerLockElement === canvas) return;
      // Losing the pointer while an overlay owns the screen is expected, not a
      // pause: the lobby, the wheel and the death card all need a live cursor.
      if (this.roundMode && this._overlayPhase()) return;
      this.pause();
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
        case 'F3':
          e.preventDefault();
          this._diag = !this._diag;
          this.hud.diagnostics(this._diag ? () => this._diagText() : null);
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

  /**
   * First person for the Seeker, third person for everyone else. Solo explore
   * mode stays first person — there is no monster to embody and no one to see.
   */
  async _applyViewMode() {
    const seeker = this.roundMode && this.round.localIsSeeker;
    this.controller.thirdPerson = this.roundMode && !seeker;
    // Playing the Seeker means moving like it: 1.5x a hider, walking and
    // sprinting both. The AI monster derives the same numbers in monster.js.
    this.controller.speedScale = seeker ? 1.5 : 1;
    this.controller.octree = this.controller.octree;   // boom needs it; already set

    if (this.controller.thirdPerson) {
      if (!this.avatar.loaded) await this.avatar.load();
      this.avatar.setVisible(true);
      // The monster is somebody else's body now; keep it in the world.
      this.hud.hint('THIRD PERSON — YOU CAN SEE YOURSELF', 2.5);
    } else {
      this.avatar.setVisible(false);
      if (seeker) this.hud.hint('YOU ARE THE MONSTER — FIRST PERSON', 3);
    }
  }

  /**
   * What the game thinks is happening, for when the screen disagrees. F3.
   * This exists because the menu backdrop was reported rendering over a live
   * HUD and none of the headless tooling could reproduce it — next time, this
   * says why in one glance.
   */
  _diagText() {
    const c = this.controller, r = this.round;
    const cam = this.renderer.camera.position;
    const sceneName = this.renderer.scene === this.world.scene ? 'world'
      : this.renderer.scene === this.menuScene.scene ? 'MENU' : '?';
    let meshes = 0, visible = 0;
    this.world.root.traverse(o => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      meshes++;
      if (o.visible) visible++;
    });
    return [
      `state    ${this.state}${this.roundMode ? ' | round' : ' | solo'}`,
      `scene    ${sceneName}   arena ${this.currentArenaId || '-'}`,
      `phase    ${r?.phase || '-'}  role ${r?.local?.role || '-'}  alive ${r?.local?.alive}`,
      `camera   ${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.z.toFixed(1)}  ${c.thirdPerson ? '3rd' : '1st'}`,
      `player   ${c.position.x.toFixed(1)} ${c.position.y.toFixed(1)} ${c.position.z.toFixed(1)}  grounded ${c.onGround}`,
      `world    ${visible}/${meshes} meshes visible   prox ${this.proximity.shown}/${this.proximity.shown + this.proximity.hidden}`,
      `monster  ${this.monster?.loaded ? this.monster.state : 'not loaded'}   net ${this.net?.status || '-'}`,
      `draws    ${this.renderer.gl.info.render.calls}   tris ${(this.renderer.gl.info.render.triangles / 1000).toFixed(0)}k`,
    ].join('\n');
  }

  /**
   * Give every other participant a body.
   *
   * Without this the AI hiders are invisible: they walk to hiding spots as bare
   * coordinates, which is fine when you are one of them and only the monster
   * matters, and useless the moment you are the one doing the hunting. Ten
   * skinned characters at ~7.5k triangles each is a fair price for a game about
   * finding people.
   */
  async _buildCrowd() {
    const wanted = this.round.participants.filter(p => !p.isLocal);
    let i = 0;
    for (const p of wanted) {
      if (this.crowd.has(p.id)) continue;
      const which = CHARACTERS[i++ % CROWD_VARIETY];
      const av = new Avatar(this.world.scene, which);
      this.crowd.set(p.id, av);
      av.load();            // deliberately not awaited: they pop in as they land
    }
    for (const [id, av] of this.crowd) {
      if (!this.round.participants.some(p => p.id === id)) { av.dispose(); this.crowd.delete(id); }
    }
  }

  _updateCrowd(dt) {
    for (const p of this.round.participants) {
      if (p.isLocal) continue;
      const av = this.crowd.get(p.id);
      if (!av?.loaded) continue;
      const prev = av._prevPos || (av._prevPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z });
      const dx = p.pos.x - prev.x, dz = p.pos.z - prev.z;
      const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      const yaw = (Math.abs(dx) + Math.abs(dz)) > 1e-4
        ? Math.atan2(dx, dz) : (av._yaw ?? 0);
      prev.x = p.pos.x; prev.y = p.pos.y; prev.z = p.pos.z;
      av.update(dt, p.pos, yaw, { speed, onGround: true, crouching: !p.alive });
      av.setDead(!p.alive);
      av.setVisible(true);
    }
  }

  _clearCrowd() {
    for (const av of this.crowd.values()) av.dispose();
    this.crowd.clear();
  }

  /**
   * Catching, when the player is the one hunting. Reach, a facing check so you
   * have to actually look at them, and line of sight so you cannot grab someone
   * through a wall.
   */
  _seekerCatch(dt, here) {
    this._catchCd = Math.max(0, (this._catchCd || 0) - dt);
    if (this._catchCd > 0) return;

    const cam = this.renderer.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();

    for (const p of this.round.participants) {
      if (p.isLocal || !p.alive || p.role !== ROLE.HIDER) continue;
      const dx = p.pos.x - here.x, dy = p.pos.y - here.y, dz = p.pos.z - here.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 2.6) continue;
      const flat = new THREE.Vector3(dx, 0, dz);
      if (flat.lengthSq() > 1e-6 && fwd.dot(flat.normalize()) < 0.25) continue;
      if (!this._hasSight(here, p.pos)) continue;

      this.round.catchParticipant(p.id, this.round.local.name);
      this.crowd.get(p.id)?.setDead(true);
      this._catchCd = 0.8;
      this.hud.toast(`CAUGHT ${p.name}`, 'red');
      this.renderer.setDamage(0.5);
      audio.play({ type: 'sawtooth', freq: 220, freqEnd: 70, dur: 0.5, gain: 0.2, filter: 1500, q: 3 });
      this.monster?.oneShotEat?.();
      break;                                   // one at a time; it should feel deliberate
    }
  }

  _hasSight(from, to) {
    const oct = this.controller?.octree;
    if (!oct) return true;
    const a = new THREE.Vector3(from.x, from.y + 1.2, from.z);
    const dir = new THREE.Vector3(to.x - a.x, (to.y + 1.0) - a.y, to.z - a.z);
    const len = dir.length();
    if (len < 0.5) return true;
    dir.divideScalar(len);
    const hit = oct.rayIntersect(new THREE.Ray(a, dir));
    return !hit || hit.distance > len - 0.4;
  }

  /** True while a round-mode overlay owns the screen and needs the cursor. */
  _overlayPhase() {
    const p = this.round?.phase;
    return p === PHASE.LOBBY || p === PHASE.WHEEL || p === PHASE.OVER;
  }

  _initAudio() {
    if (this.audioReady) return;
    audio.init();
    audio.resume();
    audio.setVolume('master', save.settings.volMaster);
    audio.setVolume('music', save.settings.volMusic);
    audio.setVolume('sfx', save.settings.volSfx);
    this.audioReady = true;
    // The mic needs the same user gesture the AudioContext does.
    this.voice.isOccluded = (a, b) => this._voiceOccluded(a, b);
    this.voice.start(audio.ctx).then(ok => {
      if (ok && this.voice.micOk) this.hud.toast('MIC LIVE — PROXIMITY VOICE');
      else if (ok) this.hud.toast('VOICE: LISTEN ONLY (NO MIC)');
    });
    if (this.state === STATE.MENU) { audio.ambience('void', 0.6); audio.music('menu'); }
  }

  // ================================================================ STATES ==
  toMenu(first = false) {
    this.state = STATE.MENU;
    this.controller.enabled = false;
    this.controller.unlock();
    this.hud.show(false);
    this.proximity.showAll();     // never leave an arena half-hidden
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

    this.menu.loadStep('FETCHING ARENA');
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
    this.menu.loadStep('GENERATING SURFACES');
    await frame();
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
    this.menu.loadStep('BAKING COLLISION');
    await frame(); await frame();     // let the bar and the backdrop repaint
    const n = this.controller.buildCollision(this.world.root);
    console.info(`[${id}] collision meshes: ${n}`);
    this.menu.loadProgress(0.8);
    await frame();

    // ---- proximity meshing --------------------------------------------------
    this.menu.loadStep('PARTITIONING WORLD');
    await frame();
    this.proximity.build(this.world.root);
    const px = this.proximity.stats;
    console.info(`[${id}] proximity: ${px.buckets} buckets over ${px.objects} objects (${px.always} always-on)`);

    // ---- gameplay layers ---------------------------------------------------
    this.menu.loadStep('PLACING PICKUPS');
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
    this.controller.speedScale = 1;   // set per role at the hide phase
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
    this._clearCrowd();
    this.waitRoom?.leave();
    this.controller.thirdPerson = false;
    this.avatar?.setVisible(false);
    this._respawnAt = 0;
    this._secretClaimed = false;
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
      // Join the room for this arena. Fire and forget — if it never connects,
      // the local round is already running and nothing waits on it.
      const url = resolveServerUrl();
      if (url && this.net.status === 'offline') {
        // Every match is its own room. Previously the room code was the arena
        // id, so everyone who happened to roll the same map was dropped into
        // one shared game. A ?room=CODE in the URL still lets friends meet.
        let room;
        try { room = new URLSearchParams(location.search).get('room') || undefined; } catch { }
        this.net.connect(url, { name: save.data.name || 'PLAYER', room });
      }
      this.menu.loadStep('WAKING THE SEEKER');
      await frame();
      if (!this.monster.loaded) await this.monster.load();
      // Bodies for the other ten, fetched here rather than at the hide phase —
      // otherwise the round starts by stalling on several megabytes of model.
      this.menu.loadStep('GATHERING PLAYERS');
      await preloadAvatars(CROWD_VARIETY);
      // An arena can declare its tightest ceiling; otherwise infer from biome.
      // The monster scales to fit under it, so it never clips the roof.
      const ceiling = fullMeta.ceiling ?? (
        { space: 4.0, indoor: 2.9, underground: 2.9, surreal: 2.9, outdoor: 6.0 }[fullMeta.biome] ?? 2.9
      );
      this.monster.configure({
        octree: this.controller.octree,
        hidingSpots: this.world.hidingSpots,
        bounds: fullMeta.bounds ?? 100,
        difficulty: fullMeta.difficulty ?? 3,
        ceiling,
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

    this.menu.loadStep('READY');
    this.menu.loadProgress(1);
    await sleep(220);
    this.menu.hideLoading();
    this.hud.show(true);
    this.state = STATE.PLAY;
    this.controller.enabled = true;
    // Only grab the pointer when the player is actually in the world. In hunt
    // mode the round starts in LOBBY with an overlay up, and a locked pointer
    // would make its START button unclickable.
    if (!this.roundMode || this.round.phase !== PHASE.LOBBY) this.controller.lock();
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
        const inMenu = this.state === STATE.MENU || this.state === STATE.CREDITS || this.state === STATE.BOOT;
        if (inMenu) {
          this.menuScene.update(dt);
        } else {
          this._updatePlay(dt);
        }

        // Guard: the composer holds whichever scene it was last attached to, and
        // if that ever disagrees with the state we are in, the player gets the
        // menu backdrop with a live HUD over it — which reads as "the arena
        // failed to load" when the arena is fine and simply is not on screen.
        // Cheap to check, impossible to get wrong, and it says so out loud.
        const want = inMenu ? this.menuScene.scene : this.world.scene;
        if (this.renderer.scene !== want) {
          console.warn(`[render] scene out of sync in state "${this.state}" — reattaching`);
          this.renderer.attach(want);
          // The menu orbit and the player share one camera, so a stale scene
          // usually means a stale camera position too. Put it back on the body.
          if (!inMenu) this.controller.update(0);
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
      if (this.round.phase === PHASE.HIDE && this.round.localIsSeeker) {
        this.waitRoom.update(dt, this.round.timeLeft);
      }
      // During lobby and wheel the world is already loaded and lit behind the
      // overlay, which is the whole point — you watch the arena while you wait.
      const hunting = this.round.phase === PHASE.HUNT;
      this.monster.update(dt, {
        target: (hunting && !this.spectating && !this.round.localIsSeeker) ? here : null,
        crouching: c.crouching,
        sprinting: c.sprinting,
        moving: hSpeed > 0.6,
        silenced: !!c.silenced,
        lightOn: this.flashlight.on && this.flashlight.spot.intensity > 0.5,
        canCatch: !this.spectating,
      });
      this.hud.tick(dt);
      this.hud.time(this.runTime);
      this.hud.meters({
        stamina: c.stamina, battery: this.flashlight.battery, fear: this.seeker.fear,
        charging: c.sprintCharging, exhausted: c.exhausted,
      });
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
      this._updateCrowd(dt);
      if (hunting && this.round.localIsSeeker && !this.spectating) {
        this._seekerCatch(dt, here);
      }

      // The player's own body, when they can see it.
      if (this.controller.thirdPerson && this.avatar.loaded) {
        // Which way the body is travelling relative to its facing, so backing
        // off plays a reverse walk and sidestepping plays a strafe.
        const fwd = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
        const rgt = new THREE.Vector3(fwd.z, 0, -fwd.x);
        const vel = new THREE.Vector3(c.velocity.x, 0, c.velocity.z);
        const along = hSpeed > 0.1 ? vel.dot(fwd) / hSpeed : 0;
        const side = hSpeed > 0.1 ? vel.dot(rgt) / hSpeed : 0;
        this.avatar.update(dt, p, c.yaw + Math.PI, {
          speed: hSpeed, onGround: c.onGround, crouching: c.crouching,
          reversing: along < -0.5, strafe: side,
        });
        this.avatar.setDead(!this.round.local.alive);
      }

      // Spatial voice: listener at the player's head, each peer at their
      // character, so a voice arrives from where its owner actually is.
      if (this.voice.enabled) {
        const cam = this.renderer.camera;
        const fwd = new THREE.Vector3();
        cam.getWorldDirection(fwd);
        const positions = {};
        for (const part of this.round.participants) {
          if (part.isLocal || part.isAI) continue;
          positions[part.id] = part.pos;
        }
        this.voice.update(cam.position, fwd, cam.up, positions);
      }
      if (this.net.connected) {
        this.net.send('pos', { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +c.yaw.toFixed(2) });
      }

      // Hide everything the fog has already eaten. Free camera turns it off,
      // because the whole point of free camera is looking at the arena.
      this.proximity.enabled = !c.noclip;
      if (c.noclip) this.proximity.showAll();
      else this.proximity.update(p.x, p.z);

      if (this._respawnAt && this.runTime >= this._respawnAt) {
        this._respawnAt = 0;
        this.round.respawn('local');
      }
      // The dog is the hiders' escape hatch: find it and the round is theirs.
      if (this.foundPupThisRun && !this._secretClaimed) {
        this._secretClaimed = true;
        this.round.secretFound(this.round.local.name);
      }
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
        stamina: c.stamina, battery: this.flashlight.battery, fear: this.seeker.fear,
        charging: c.sprintCharging, exhausted: c.exhausted,
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
