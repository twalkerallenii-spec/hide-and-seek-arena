// Persistent save state. One localStorage key, versioned, defensive about
// corrupt or partial data so a bad write can never brick the game.

import { SKINS, UPGRADES, rankFor } from './content.js';

const KEY = 'hns.save.v1';

const DEFAULTS = () => ({
  version: 1,
  coins: 0,
  xp: 0,
  name: 'OPERATIVE',
  equipped: 'standard',
  owned: ['standard'],
  upgrades: [],
  pups: {},            // arenaId -> true
  arenas: {},          // arenaId -> { visited, coins, coinsMax, best, cleared, time }
  settings: {
    quality: 'high',
    sensitivity: 1.0,
    fov: 75,
    volMaster: 0.8,
    volMusic: 0.5,
    volSfx: 0.9,
    invertY: false,
    grain: true,
    minimap: true,
  },
  stats: { runs: 0, coinsAllTime: 0, distance: 0, spotted: 0, playtime: 0 },
  mutators: [],
  seenCredits: false,
});

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (over[k] === undefined) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = deepMerge(base[k], over[k]);
    } else {
      base[k] = over[k];
    }
  }
  // preserve unknown map-like keys (arena ids, pup ids)
  for (const k of ['pups', 'arenas']) {
    if (over[k] && typeof over[k] === 'object') base[k] = { ...base[k], ...over[k] };
  }
  return base;
}

class SaveState {
  constructor() {
    this.data = DEFAULTS();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = deepMerge(DEFAULTS(), JSON.parse(raw));
    } catch (e) {
      console.warn('Save corrupt, starting fresh:', e);
      this.data = DEFAULTS();
    }
    if (!Array.isArray(this.data.owned) || !this.data.owned.includes('standard')) {
      this.data.owned = ['standard', ...(this.data.owned || [])];
    }
    return this.data;
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
    catch (e) { console.warn('Could not save:', e); }
  }

  wipe() {
    this.data = DEFAULTS();
    try { localStorage.removeItem(KEY); } catch { }
  }

  // --- currency ------------------------------------------------------------
  get coins() { return this.data.coins; }
  addCoins(n) {
    this.data.coins += n;
    this.data.stats.coinsAllTime += n;
    this.save();
  }
  spend(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.save();
    return true;
  }

  addXP(n) { this.data.xp += n; this.save(); }
  get rank() { return rankFor(this.data.xp); }

  // --- skins ---------------------------------------------------------------
  owns(id) { return this.data.owned.includes(id); }
  get equipped() {
    return SKINS.find(s => s.id === this.data.equipped) || SKINS[0];
  }
  equip(id) {
    if (!this.owns(id)) return false;
    this.data.equipped = id;
    this.save();
    return true;
  }
  /** null if buyable, otherwise a reason string. */
  skinLockReason(skin) {
    if (this.owns(skin.id)) return null;
    const u = skin.unlock;
    if (u) {
      if (u.type === 'pups' && this.pupCount < u.count) return `FIND ${u.count} PUPS (${this.pupCount}/${u.count})`;
      if (u.type === 'arenas' && this.clearedCount < u.count) return `CLEAR ${u.count} ARENAS (${this.clearedCount}/${u.count})`;
      if (u.type === 'coins' && this.data.stats.coinsAllTime < u.count) return `EARN ${u.count} COINS TOTAL`;
    }
    if (this.data.coins < skin.price) return 'NOT ENOUGH COINS';
    return null;
  }
  buySkin(skin) {
    if (this.owns(skin.id)) return 'owned';
    const reason = this.skinLockReason(skin);
    if (reason) return reason;
    if (skin.price > 0 && !this.spend(skin.price)) return 'NOT ENOUGH COINS';
    this.data.owned.push(skin.id);
    this.save();
    return null;
  }

  // --- upgrades ------------------------------------------------------------
  hasUpgrade(id) { return this.data.upgrades.includes(id); }
  upgradeLockReason(u) {
    if (this.hasUpgrade(u.id)) return null;
    if (u.requires && !this.hasUpgrade(u.requires)) {
      const req = UPGRADES.find(x => x.id === u.requires);
      return `NEEDS ${req ? req.name : u.requires}`;
    }
    if (this.data.coins < u.price) return 'NOT ENOUGH COINS';
    return null;
  }
  buyUpgrade(u) {
    if (this.hasUpgrade(u.id)) return 'owned';
    const reason = this.upgradeLockReason(u);
    if (reason) return reason;
    if (!this.spend(u.price)) return 'NOT ENOUGH COINS';
    this.data.upgrades.push(u.id);
    this.save();
    return null;
  }

  // --- arena progress ------------------------------------------------------
  arena(id) {
    if (!this.data.arenas[id]) {
      this.data.arenas[id] = { visited: false, coins: 0, coinsMax: 0, best: 0, cleared: false, time: 0 };
    }
    return this.data.arenas[id];
  }
  recordRun(id, { coins, coinsMax, time, cleared, pup }) {
    const a = this.arena(id);
    a.visited = true;
    a.coins = Math.max(a.coins, coins);
    a.coinsMax = Math.max(a.coinsMax, coinsMax);
    if (cleared) {
      a.cleared = true;
      if (!a.time || time < a.time) a.time = time;
    }
    if (pup) this.data.pups[id] = true;
    this.data.stats.runs++;
    this.save();
  }
  get clearedCount() { return Object.values(this.data.arenas).filter(a => a.cleared).length; }
  get visitedCount() { return Object.values(this.data.arenas).filter(a => a.visited).length; }
  get pupCount() { return Object.keys(this.data.pups).length; }
  foundPup(id) { return !!this.data.pups[id]; }

  // --- settings ------------------------------------------------------------
  get settings() { return this.data.settings; }
  set(key, value) { this.data.settings[key] = value; this.save(); }

  // --- mutators ------------------------------------------------------------
  get mutators() { return this.data.mutators; }
  toggleMutator(id) {
    const i = this.data.mutators.indexOf(id);
    if (i >= 0) this.data.mutators.splice(i, 1);
    else this.data.mutators.push(id);
    this.save();
    return this.data.mutators.includes(id);
  }
}

export const save = new SaveState();
