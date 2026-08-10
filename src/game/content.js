// Static game content: signatures (skins), power-ups, upgrades, mutators, ranks.
// Kept data-only so the UI and the 3D layer can both read from one source.

export const SKINS = [
  {
    id: 'standard', name: 'STANDARD ISSUE', rarity: 'common', price: 0,
    desc: 'Service-grade lamp. Warm, wide, unremarkable.',
    light: 0xffe9c4, cone: 0.42, range: 24, intensity: 5.5,
    accent: '#46e0ff', trail: 0x6fd8ff, aura: 0.0,
  },
  {
    id: 'coldsteel', name: 'COLD STEEL', rarity: 'common', price: 250,
    desc: 'A narrow, clinical white beam. Sees further, reveals less.',
    light: 0xdfeeff, cone: 0.30, range: 34, intensity: 7.0,
    accent: '#c9dcff', trail: 0x9fc4ff, aura: 0.0,
  },
  {
    id: 'amberwatch', name: 'AMBERWATCH', rarity: 'rare', price: 600,
    desc: 'Sodium-orange. Warms the dark; the dark stays dark.',
    light: 0xffab2e, cone: 0.50, range: 22, intensity: 6.2,
    accent: '#ffab2e', trail: 0xff9a1f, aura: 0.15,
  },
  {
    id: 'coolant', name: 'COOLANT', rarity: 'rare', price: 750,
    desc: 'Undercroft issue. Cyan wash, faint sub-bass hum.',
    light: 0x46e0ff, cone: 0.46, range: 27, intensity: 6.0,
    accent: '#46e0ff', trail: 0x46e0ff, aura: 0.28,
  },
  {
    id: 'voidviolet', name: 'VOID VIOLET', rarity: 'epic', price: 1400,
    desc: 'Light that arrives a fraction late. Nothing reflects quite right.',
    light: 0xa06cff, cone: 0.55, range: 26, intensity: 6.6,
    accent: '#b46cff', trail: 0xb46cff, aura: 0.45,
  },
  {
    id: 'forge', name: 'FORGE RED', rarity: 'epic', price: 1400,
    desc: 'Cut from a tap-hole glow. Runs hot.',
    light: 0xff5a10, cone: 0.60, range: 20, intensity: 8.0,
    accent: '#ff6a2a', trail: 0xff5a10, aura: 0.5,
  },
  {
    id: 'oracle', name: 'ORACLE', rarity: 'legendary', price: 2600,
    unlock: { type: 'arenas', count: 6 },
    desc: 'Pale gold. Leaves a precognitive after-image of where you have been.',
    light: 0xffe9a8, cone: 0.40, range: 30, intensity: 7.2,
    accent: '#ffd700', trail: 0xffd700, aura: 0.6,
  },
  {
    id: 'mnemosyne', name: 'MNEMOSYNE', rarity: 'legendary', price: 3200,
    unlock: { type: 'coins', count: 400 },
    desc: 'Magenta through smoked glass. The HUD scrambles when you are seen.',
    light: 0xff3fa4, cone: 0.52, range: 25, intensity: 7.0,
    accent: '#ff3fa4', trail: 0xff3fa4, aura: 0.7, glitchHud: true,
  },
  {
    id: 'blackout', name: 'BLACKOUT', rarity: 'legendary', price: 4000,
    desc: 'No beam at all. The Seeker scan passes over you 40% faster.',
    light: 0x101418, cone: 0.28, range: 6, intensity: 0.6,
    accent: '#5d6675', trail: 0x2a3038, aura: 0.0, stealth: 0.4,
  },
  {
    id: 'goodboy', name: 'GOOD BOY', rarity: 'secret', price: 0,
    unlock: { type: 'pups', count: 12 },
    desc: 'You found every last one of them. They insisted.',
    light: 0xffd9a0, cone: 0.62, range: 30, intensity: 7.5,
    accent: '#ff3fa4', trail: 0xffc46b, aura: 0.9, pupMode: true,
  },
];

export const POWERUPS = {
  ghost: {
    name: 'GHOST', icon: '◌', duration: 12, color: 0x9fd8ff,
    hint: 'Invisible to the scan',
    desc: 'The Seeker sweep passes straight through you.',
  },
  dash: {
    name: 'DASH', icon: '»', duration: 0, color: 0x46e0ff,
    hint: 'Burst of speed',
    desc: 'An instant forward surge. Also cancels fall damage on landing.',
  },
  pulse: {
    name: 'PULSE', icon: '◉', duration: 0, color: 0xffd700,
    hint: 'Reveal nearby loot',
    desc: 'Pings every collectible within 60 m onto your HUD for 20 s.',
  },
  decoy: {
    name: 'DECOY', icon: '◊', duration: 18, color: 0xff3fa4,
    hint: 'Drop a false signal',
    desc: 'Leaves a beacon the Seeker sweep prefers over you.',
  },
  nightvision: {
    name: 'NIGHT EYES', icon: '◈', duration: 25, color: 0x45e08a,
    hint: 'See in the dark',
    desc: 'Lifts the blacks and outlines geometry. Costs no battery.',
  },
  silence: {
    name: 'SILENCE', icon: '∅', duration: 20, color: 0xb0b8c4,
    hint: 'Move unheard',
    desc: 'No footsteps. Halves the rate your Fear rises.',
  },
  timefreeze: {
    name: 'STILLNESS', icon: '⏛', duration: 8, color: 0x8fe0ff,
    hint: 'Stop the sweep',
    desc: 'The Seeker sweep halts entirely. The clock does not.',
  },
  jumpjet: {
    name: 'UPDRAFT', icon: '↟', duration: 15, color: 0xffab2e,
    hint: 'Double jump',
    desc: 'A second jump in mid-air, for as long as it lasts.',
  },
};

export const UPGRADES = [
  { id: 'lamp1',   name: 'LAMP CELL I',   price: 400,  desc: 'Flashlight lasts 40% longer.' },
  { id: 'lamp2',   name: 'LAMP CELL II',  price: 900,  desc: 'Flashlight lasts another 40% longer.', requires: 'lamp1' },
  { id: 'lungs1',  name: 'CONDITIONING',  price: 500,  desc: 'Sprint 35% longer before you tire.' },
  { id: 'boots',   name: 'SOFT SOLES',    price: 700,  desc: 'Footsteps are far quieter; the sweep finds you slower.' },
  { id: 'magnet',  name: 'COIN MAGNET',   price: 850,  desc: 'Collect pickups from 3.5 m instead of 1.6 m.' },
  { id: 'compass', name: 'PUP COMPASS',   price: 1500, desc: 'A faint pull toward the hidden dog on every map.' },
  { id: 'nerve',   name: 'STEADY NERVE',  price: 1100, desc: 'Fear builds 40% slower and bleeds off faster.' },
  { id: 'slot2',   name: 'SECOND POCKET', price: 2000, desc: 'Carry two power-ups at once.' },
];

// Round modifiers. Named after the "Abyssal Mutators" idea in the design bible.
export const MUTATORS = [
  { id: 'blackout',   name: 'BLACKOUT',    mult: 1.5, desc: 'No flashlight. At all.' },
  { id: 'hunted',     name: 'HUNTED',      mult: 1.4, desc: 'The sweep is twice as fast.' },
  { id: 'nosprint',   name: 'NO SPRINT',   mult: 1.3, desc: 'You walk. That is it.' },
  { id: 'fragile',    name: 'FRAGILE',     mult: 1.6, desc: 'One sighting ends the run.' },
  { id: 'scarcity',   name: 'SCARCITY',    mult: 1.4, desc: 'Half the coins, none of the batteries.' },
  { id: 'featherfoot',name: 'FEATHERFOOT', mult: 1.2, desc: 'Low gravity. Long falls.' },
];

export const RANKS = [
  'RECRUIT', 'SCOUT', 'PROWLER', 'SHADE', 'GHOST', 'PHANTOM',
  'REVENANT', 'WRAITH', 'ECLIPSE', 'THE UNSEEN',
];

export function rankFor(xp) {
  const level = Math.floor(Math.sqrt(xp / 120)) + 1;
  const name = RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 3))];
  const cur = Math.pow(level - 1, 2) * 120;
  const next = Math.pow(level, 2) * 120;
  return { level, name, progress: (xp - cur) / Math.max(1, next - cur) };
}

export const LOADING_TIPS = [
  'Crouching under a table breaks line of sight. Standing next to one does not.',
  'The scan sweeps in a ring. Move perpendicular to it, not away from it.',
  'Every arena hides exactly one dog.',
  'Sprinting is loud. Fear rises faster when you are heard.',
  'Batteries are worth more than coins when the lights go out.',
  'You can climb further than you think. Look for crates, ladders and low roofs.',
  'A high vantage point is safe, but there is usually only one way down.',
  'Stillness stops the sweep, not the clock.',
  'The map is bigger than the route you keep taking.',
  'Fear does not kill you. It makes you easier to find.',
  'Blackout has no beam — and the sweep slides right past you.',
  'Coins in dead ends are worth the detour.',
];
