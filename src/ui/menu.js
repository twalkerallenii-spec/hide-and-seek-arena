// Front end: arena select, locker, store, settings, pause and results screens.

import { ARENA_LIST } from '../arenas/index.js';
import { SKINS, UPGRADES, MUTATORS, POWERUPS, LOADING_TIPS } from '../game/content.js';
import { save } from '../game/state.js';
import { audio } from '../engine/audio.js';
import { arenaCardArt } from './cardart.js';

const $ = (id) => document.getElementById(id);

function screen(id, on) {
  const el = $(id);
  if (el) el.classList.toggle('active', on);
}

export class Menu {
  constructor(game) {
    this.game = game;
    this.selected = ARENA_LIST[0]?.id || 'backrooms';
    this._built = false;
  }

  // ------------------------------------------------------------------ setup
  init() {
    if (this._built) return;
    this._built = true;

    // tabs
    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        audio.ui('click');
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
        const name = tab.dataset.tab;
        document.querySelectorAll('.tabpage').forEach(p => {
          p.classList.toggle('active', p.id === 'page-' + name);
        });
      });
      tab.addEventListener('mouseenter', () => audio.ui('hover'));
    }

    $('btnPlay').addEventListener('click', () => {
      audio.ui('confirm');
      this.game.startArena(this.selected);
    });
    $('btnCredits').addEventListener('click', () => { audio.ui('click'); this.game.rollCredits(); });
    $('btnWipe').addEventListener('click', () => {
      if (!confirm('Erase all coins, unlocks and records? This cannot be undone.')) return;
      save.wipe();
      audio.ui('error');
      this.refresh();
    });

    $('btnResume').addEventListener('click', () => { audio.ui('click'); this.game.resume(); });
    $('btnRestart').addEventListener('click', () => { audio.ui('click'); this.game.startArena(this.game.currentArenaId); });
    $('btnQuit').addEventListener('click', () => { audio.ui('back'); this.game.toMenu(); });
    $('btnResMenu').addEventListener('click', () => { audio.ui('back'); this.game.toMenu(); });
    $('btnNextArena').addEventListener('click', () => {
      audio.ui('confirm');
      const i = ARENA_LIST.findIndex(a => a.id === this.game.currentArenaId);
      const next = ARENA_LIST[(i + 1) % ARENA_LIST.length];
      this.game.startArena(next.id);
    });
    $('btnCreditSkip').addEventListener('click', () => { audio.ui('back'); this.game.toMenu(); });

    this._buildSettings();
    this._buildModeToggle();
    this._buildMutators();
    this.refresh();
  }

  refresh() {
    this._renderHeader();
    this._renderArenas();
    this._renderSkins();
    this._renderStore();
    this._renderPupBoard();
  }

  show(on) {
    screen('menu', on);
    if (on) this.refresh();
  }

  // ----------------------------------------------------------------- header
  _renderHeader() {
    const r = save.rank;
    $('coinCount').textContent = save.coins.toLocaleString();
    $('pupCount').textContent = save.pupCount;
    $('rankLabel').textContent = `${r.name} LVL ${r.level}`;
    $('xpFill').style.width = (r.progress * 100).toFixed(0) + '%';
    $('playerName').textContent = save.data.name;
    const skin = save.equipped;
    $('avatarChip').style.background = `linear-gradient(150deg, ${skin.accent}, #1a1d24)`;
    $('avatarChip').style.color = '#fff';
    document.documentElement.style.setProperty('--accent', skin.accent);
  }

  // ----------------------------------------------------------------- arenas
  _renderArenas() {
    const grid = $('arenaGrid');
    grid.innerHTML = '';
    for (const meta of ARENA_LIST) {
      const rec = save.arena(meta.id);
      const card = document.createElement('div');
      card.className = 'arena-card' + (meta.id === this.selected ? ' selected' : '');
      card.tabIndex = 0;

      const art = document.createElement('div');
      art.className = 'art';
      art.appendChild(arenaCardArt(meta));
      card.appendChild(art);

      const scrim = document.createElement('div');
      scrim.className = 'scrim';
      card.appendChild(scrim);

      const idx = document.createElement('div');
      idx.className = 'idx';
      idx.textContent = String(meta.order).padStart(2, '0');
      card.appendChild(idx);

      if (save.foundPup(meta.id)) {
        const b = document.createElement('div');
        b.className = 'badge pup';
        b.textContent = 'PUP';
        card.appendChild(b);
      } else if (rec.cleared) {
        const b = document.createElement('div');
        b.className = 'badge';
        b.textContent = 'CLEARED';
        card.appendChild(b);
      }

      const body = document.createElement('div');
      body.className = 'body';
      body.innerHTML = `
        <h3>${meta.name}</h3>
        <div class="tagline">${meta.tagline}</div>
        <div class="meta">
          <div class="diff">${[1, 2, 3, 4, 5].map(i =>
        `<i class="${i <= meta.difficulty ? 'on' : ''}"></i>`).join('')}</div>
          <div class="prog">${rec.coinsMax ? `${rec.coins}/${rec.coinsMax}` : 'UNEXPLORED'}</div>
        </div>`;
      card.appendChild(body);

      const pick = () => {
        audio.ui('click');
        this.selected = meta.id;
        this._renderArenas();
        this.game.previewArena?.(meta);
      };
      card.addEventListener('click', pick);
      card.addEventListener('dblclick', () => this.game.startArena(meta.id));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
      card.addEventListener('mouseenter', () => audio.ui('hover'));

      grid.appendChild(card);
    }
  }

  // ------------------------------------------------------------------ skins
  _skinCard(skin, { store = false } = {}) {
    const owned = save.owns(skin.id);
    const equipped = save.data.equipped === skin.id;
    const reason = save.skinLockReason(skin);

    const el = document.createElement('div');
    el.className = 'skin-card'
      + (equipped ? ' equipped' : '')
      + (!owned && reason ? ' locked' : '');

    const sw = document.createElement('div');
    sw.className = 'skin-swatch';
    const hex = '#' + skin.light.toString(16).padStart(6, '0');
    sw.style.background =
      `radial-gradient(120% 90% at 50% 118%, ${hex} 0%, ${skin.accent} 34%, #0a0d12 76%)`;
    el.appendChild(sw);

    // a little beam graphic so each signature reads differently
    const beam = document.createElement('canvas');
    beam.width = 300; beam.height = 190;
    beam.style.cssText = 'position:absolute;inset:0;width:100%;height:96px;';
    const c = beam.getContext('2d');
    const g = c.createLinearGradient(150, 190, 150, 0);
    g.addColorStop(0, hex + 'ee');
    g.addColorStop(1, hex + '00');
    c.fillStyle = g;
    const spread = 60 + skin.cone * 190;
    c.beginPath();
    c.moveTo(150, 190); c.lineTo(150 - spread, 0); c.lineTo(150 + spread, 0);
    c.closePath(); c.fill();
    sw.appendChild(beam);

    const body = document.createElement('div');
    body.className = 'skin-body';
    body.innerHTML = `
      <b>${skin.name}</b>
      <span class="rar rar-${skin.rarity}">${skin.rarity.toUpperCase()}</span>
      <div class="desc">${skin.desc}</div>`;

    if (store) {
      const price = document.createElement('div');
      price.className = 'skin-price';
      if (owned) price.innerHTML = `<span style="color:var(--green)">OWNED</span>`;
      else if (skin.unlock && reason && !reason.startsWith('NOT ENOUGH')) price.innerHTML = `<span style="color:var(--ink-faint);font-size:.7em">${reason}</span>`;
      else price.innerHTML = `<span class="coin-ico"></span>${skin.price.toLocaleString()}`;
      body.appendChild(price);
    }
    el.appendChild(body);

    if (equipped) {
      const tick = document.createElement('div');
      tick.className = 'tickmark';
      tick.textContent = '✓';
      el.appendChild(tick);
    }

    el.addEventListener('mouseenter', () => audio.ui('hover'));
    el.addEventListener('click', () => {
      if (owned) {
        save.equip(skin.id);
        audio.ui('confirm');
        this.game.applySkin?.(save.equipped);
        this.refresh();
        return;
      }
      const err = save.buySkin(skin);
      if (err) { audio.ui('error'); this.game.toastMenu?.(err); return; }
      audio.ui('confirm');
      save.equip(skin.id);
      this.game.applySkin?.(save.equipped);
      this.refresh();
    });
    return el;
  }

  _renderSkins() {
    const grid = $('skinGrid');
    grid.innerHTML = '';
    for (const s of SKINS) {
      if (!save.owns(s.id)) continue;
      grid.appendChild(this._skinCard(s));
    }
    if (!grid.children.length) {
      grid.innerHTML = '<p class="hint">Nothing unlocked yet. Visit the STORE.</p>';
    }
  }

  _renderStore() {
    const sg = $('storeSkins');
    sg.innerHTML = '';
    for (const s of SKINS) {
      if (s.price === 0 && !s.unlock) continue;
      sg.appendChild(this._skinCard(s, { store: true }));
    }

    const ug = $('storeUpgrades');
    ug.innerHTML = '';
    for (const u of UPGRADES) {
      const owned = save.hasUpgrade(u.id);
      const reason = save.upgradeLockReason(u);
      const el = document.createElement('div');
      el.className = 'skin-card' + (owned ? ' equipped' : reason ? ' locked' : '');
      el.innerHTML = `
        <div class="skin-body">
          <b>${u.name}</b>
          <div class="desc">${u.desc}</div>
          <div class="skin-price">${owned
          ? '<span style="color:var(--green)">OWNED</span>'
          : `<span class="coin-ico"></span>${u.price.toLocaleString()}`}</div>
        </div>`;
      el.addEventListener('mouseenter', () => audio.ui('hover'));
      el.addEventListener('click', () => {
        if (owned) return;
        const err = save.buyUpgrade(u);
        if (err) { audio.ui('error'); this.game.toastMenu?.(err); return; }
        audio.ui('confirm');
        this.refresh();
      });
      ug.appendChild(el);
    }
  }

  _renderPupBoard() {
    const b = $('pupBoard');
    b.innerHTML = '';
    for (const a of ARENA_LIST) {
      const d = document.createElement('div');
      d.className = 'pupdot' + (save.foundPup(a.id) ? ' found' : '');
      d.textContent = save.foundPup(a.id) ? '🐕' : '·';
      d.title = a.name;
      b.appendChild(d);
    }
  }

  // ------------------------------------------------------------------- mode
  /**
   * Two ways to play the same twelve arenas: the eleven-slot hunt, or solo
   * exploration with the abstract sweep. The hunt is the default.
   */
  _buildModeToggle() {
    const strip = $('mutatorStrip');
    const btn = document.createElement('button');
    btn.className = 'mutator mode';
    btn.style.cssText = 'border-color:var(--gold-1);color:var(--gold-1);' +
      'background:rgba(255,215,0,.08);margin-right:10px';
    const paint = () => {
      const round = save.settings.mode !== 'solo';
      btn.textContent = round ? 'MODE · THE HUNT (11)' : 'MODE · SOLO EXPLORE';
      btn.title = round
        ? 'Eleven slots, one seeker, ten hiders. Thirty seconds to hide.'
        : 'No monster. Explore the arena and collect at your own pace.';
    };
    btn.addEventListener('click', () => {
      save.set('mode', save.settings.mode === 'solo' ? 'round' : 'solo');
      audio.ui('click');
      paint();
    });
    paint();
    strip.parentNode.insertBefore(btn, strip);
  }

  // -------------------------------------------------------------- mutators
  _buildMutators() {
    const strip = $('mutatorStrip');
    strip.innerHTML = '';
    for (const m of MUTATORS) {
      const el = document.createElement('button');
      el.className = 'mutator' + (save.mutators.includes(m.id) ? ' on' : '');
      el.textContent = m.name;
      el.title = `${m.desc}  ·  ×${m.mult} coins`;
      el.addEventListener('click', () => {
        const on = save.toggleMutator(m.id);
        el.classList.toggle('on', on);
        audio.ui(on ? 'confirm' : 'back');
      });
      strip.appendChild(el);
    }
  }

  // -------------------------------------------------------------- settings
  _buildSettings() {
    const s = save.settings;

    /**
     * Each setting declares how it converts between the widget and the model,
     * and how it prints. The previous version guessed from magnitude, which
     * meant volMaster (0.8) was written straight into a 0-100 slider, clamped
     * to 1, and then persisted back as 0.01 — the game muted itself on first
     * load. Never infer; declare.
     */
    const SETTINGS = [
      { id: 'setSens', key: 'sensitivity', label: 'setSensVal',
        toUi: v => Math.round(v * 100), fromUi: v => v / 100,
        fmt: v => v.toFixed(2), apply: v => this.game.setSensitivity?.(v) },
      { id: 'setFov', key: 'fov', label: 'setFovVal',
        toUi: v => Math.round(v), fromUi: v => v,
        fmt: v => String(Math.round(v)), apply: v => this.game.setFov?.(v) },
      { id: 'setVolMaster', key: 'volMaster', label: 'setVolMasterVal',
        toUi: v => Math.round(v * 100), fromUi: v => v / 100,
        fmt: v => String(Math.round(v * 100)), apply: v => audio.setVolume('master', v) },
      { id: 'setVolMusic', key: 'volMusic', label: 'setVolMusicVal',
        toUi: v => Math.round(v * 100), fromUi: v => v / 100,
        fmt: v => String(Math.round(v * 100)), apply: v => audio.setVolume('music', v) },
      { id: 'setVolSfx', key: 'volSfx', label: 'setVolSfxVal',
        toUi: v => Math.round(v * 100), fromUi: v => v / 100,
        fmt: v => String(Math.round(v * 100)), apply: v => audio.setVolume('sfx', v) },
      { id: 'setInvert', key: 'invertY', check: true,
        apply: v => this.game.setInvertY?.(v) },
      { id: 'setGrain', key: 'grain', check: true,
        apply: v => this.game.setGrain?.(v) },
    ];

    for (const cfg of SETTINGS) {
      const el = $(cfg.id);
      if (!el) continue;                       // row may not exist in this build
      const lab = cfg.label ? $(cfg.label) : null;

      if (cfg.check) {
        el.checked = !!s[cfg.key];
        const upd = () => { save.set(cfg.key, el.checked); cfg.apply?.(el.checked); };
        el.addEventListener('change', upd);
        cfg.apply?.(!!s[cfg.key]);
        continue;
      }

      // Clamp on the way in, so a corrupt save cannot park a slider off-range.
      const lo = Number(el.min ?? 0), hi = Number(el.max ?? 100);
      const ui = Math.max(lo, Math.min(hi, cfg.toUi(s[cfg.key])));
      el.value = String(ui);
      const model = cfg.fromUi(ui);
      if (model !== s[cfg.key]) save.set(cfg.key, model);   // repair, don't corrupt
      if (lab) lab.textContent = cfg.fmt(model);
      cfg.apply?.(model);

      const upd = () => {
        const v = cfg.fromUi(Number(el.value));
        save.set(cfg.key, v);
        if (lab) lab.textContent = cfg.fmt(v);
        cfg.apply?.(v);
      };
      el.addEventListener('input', upd);
    }

    // GRAPHICS is a <select>, so it stays off the numeric path entirely.
    const q = $('setQuality');
    if (q) {
      const valid = [...q.options].map(o => o.value);
      q.value = valid.includes(s.quality) ? s.quality : 'high';
      if (q.value !== s.quality) save.set('quality', q.value);
      q.addEventListener('change', (e) => {
        save.set('quality', e.target.value);
        this.game.setQuality?.(e.target.value);
        audio.ui('click');
      });
    }
  }


  // -------------------------------------------------------------- loading
  showLoading(meta) {
    screen('loading', true);
    $('loadTag').textContent = `ARENA ${String(meta.order).padStart(2, '0')} · ${(meta.biome || '').toUpperCase()}`;
    $('loadTitle').textContent = meta.name;
    $('loadSub').textContent = meta.tagline;
    $('loadTip').textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    $('loadFill').style.width = '0%';
  }
  loadProgress(p) { $('loadFill').style.width = (p * 100).toFixed(0) + '%'; }
  hideLoading() { screen('loading', false); }

  // -------------------------------------------------------------- pause
  showPause(stats) {
    screen('pause', true);
    $('pauseStats').innerHTML = stats.map(([k, v]) =>
      `<div class="rrow"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  hidePause() { screen('pause', false); }

  // -------------------------------------------------------------- results
  showResults({ title, tag, rows }) {
    screen('results', true);
    $('resTitle').textContent = title;
    $('resTag').textContent = tag;
    $('resRows').innerHTML = rows.map(r =>
      `<div class="rrow ${r.hero ? 'hero' : ''}"><span>${r.k}</span><b>${r.v}</b></div>`).join('');
  }
  hideResults() { screen('results', false); }
}
