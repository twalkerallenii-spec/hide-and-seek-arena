// Arena registry. Modules are loaded lazily — the menu only needs `meta`, and
// a 200 m map's build code is only fetched when you actually pick it.
//
// Each entry's loader is wrapped so a single broken arena degrades to a
// playable placeholder instead of taking down the whole game.

const MODULES = [
  { id: 'backrooms', path: './a01_backrooms.js' },
  { id: 'neonmetro', path: './a02_neonmetro.js' },
  { id: 'cargoyard', path: './a03_cargoyard.js' },
  { id: 'undercroft', path: './a04_undercroft.js' },
  { id: 'aqueducts', path: './a05_aqueducts.js' },
  { id: 'frostwatch', path: './a06_frostwatch.js' },
  { id: 'orbital', path: './a07_orbital.js' },
  { id: 'palisade', path: './a08_palisade.js' },
  { id: 'forge', path: './a09_forge.js' },
  { id: 'abbadon', path: './a10_abbadon.js' },
  { id: 'bazaar', path: './a11_bazaar.js' },
  { id: 'static', path: './a12_static.js' },
];

// Static import map — bundler-free dynamic import needs literal-ish specifiers,
// so we keep an explicit table of thunks.
const LOADERS = {
  './a01_backrooms.js':  () => import('./a01_backrooms.js'),
  './a02_neonmetro.js':  () => import('./a02_neonmetro.js'),
  './a03_cargoyard.js':  () => import('./a03_cargoyard.js'),
  './a04_undercroft.js': () => import('./a04_undercroft.js'),
  './a05_aqueducts.js':  () => import('./a05_aqueducts.js'),
  './a06_frostwatch.js': () => import('./a06_frostwatch.js'),
  './a07_orbital.js':    () => import('./a07_orbital.js'),
  './a08_palisade.js':   () => import('./a08_palisade.js'),
  './a09_forge.js':      () => import('./a09_forge.js'),
  './a10_abbadon.js':    () => import('./a10_abbadon.js'),
  './a11_bazaar.js':     () => import('./a11_bazaar.js'),
  './a12_static.js':     () => import('./a12_static.js'),
};

const cache = new Map();

export async function loadArena(id) {
  if (cache.has(id)) return cache.get(id);
  const entry = MODULES.find(m => m.id === id);
  if (!entry) throw new Error(`Unknown arena: ${id}`);
  let mod;
  try {
    mod = await LOADERS[entry.path]();
    if (!mod?.meta || typeof mod.build !== 'function') {
      throw new Error('module missing meta/build');
    }
  } catch (err) {
    console.error(`Arena "${id}" failed to load — using placeholder.`, err);
    mod = await import('./_fallback.js');
    mod = {
      meta: { ...mod.meta, id, name: (metaIndex[id]?.name || id.toUpperCase()) + ' (UNAVAILABLE)' },
      build: mod.build,
      broken: true,
    };
  }
  cache.set(id, mod);
  return mod;
}

/**
 * Lightweight metadata for the menu, so we don't have to parse every arena
 * module up front. Kept in sync by hand with each module's exported `meta`.
 */
export const metaIndex = {
  backrooms: {
    id: 'backrooms', order: 1, name: 'THE BACKROOMS', difficulty: 2, biome: 'surreal',
    tagline: 'Six hundred million square miles of damp carpet, and the hum of fluorescent light.',
    colors: ['#d9c98c', '#4a3d1c'],
  },
  neonmetro: {
    id: 'neonmetro', order: 2, name: 'NEON METRO', difficulty: 3, biome: 'indoor',
    tagline: 'Three levels down, still raining. The last train never came.',
    colors: ['#ff3fa4', '#0b1622'],
  },
  cargoyard: {
    id: 'cargoyard', order: 3, name: 'PORT NINE', difficulty: 2, biome: 'outdoor',
    tagline: 'A maze you can climb on top of, at the hour when every shadow is a mile long.',
    colors: ['#f0a860', '#2c4d7a'],
  },
  undercroft: {
    id: 'undercroft', order: 4, name: 'THE UNDERCROFT', difficulty: 4, biome: 'underground',
    tagline: 'Sixty metres of ordinary infrastructure — until you find the seams.',
    colors: ['#46e0ff', '#0a0d12'],
  },
  aqueducts: {
    id: 'aqueducts', order: 5, name: 'THE AQUEDUCTS', difficulty: 3, biome: 'outdoor',
    tagline: 'The jungle took the waterworks back. Something still keeps the channels clear.',
    colors: ['#3fbfa0', '#22301c'],
  },
  frostwatch: {
    id: 'frostwatch', order: 6, name: 'FROSTWATCH', difficulty: 4, biome: 'outdoor',
    tagline: 'Whiteout. Navigate by the windows, and hope the tunnels are still open.',
    colors: ['#dbe8f5', '#5d7a99'],
  },
  orbital: {
    id: 'orbital', order: 7, name: 'HALO NINE', difficulty: 3, biome: 'space',
    tagline: 'Gravity still works. The hull is a different question.',
    colors: ['#e8f0f8', '#1b4f8f'],
  },
  palisade: {
    id: 'palisade', order: 8, name: 'PALISADE MALL', difficulty: 2, biome: 'indoor',
    tagline: 'Closed since 1994. The fountain is dry and the music never stopped.',
    colors: ['#d9a8c0', '#2f6b6b'],
  },
  forge: {
    id: 'forge', order: 9, name: 'THE FORGE', difficulty: 4, biome: 'indoor',
    tagline: 'Nobody works here any more. The furnaces did not get the message.',
    colors: ['#ff5a10', '#140a06'],
  },
  abbadon: {
    id: 'abbadon', order: 10, name: 'ABBADON MANOR', difficulty: 3, biome: 'indoor',
    tagline: 'Forty rooms, a hedge maze, and a passage behind the library shelf.',
    colors: ['#8fa8d8', '#1a2214'],
  },
  bazaar: {
    id: 'bazaar', order: 11, name: 'DUST BAZAAR', difficulty: 3, biome: 'outdoor',
    tagline: 'High noon in the souk. The roofs are a second city.',
    colors: ['#e8c884', '#2f6fc0'],
  },
  static: {
    id: 'static', order: 12, name: 'THE STATIC', difficulty: 5, biome: 'surreal',
    tagline: 'Every other arena, torn up and hung in the dark. The city lies.',
    colors: ['#ff3fa4', '#000000'],
  },
};

export const ARENA_LIST = MODULES
  .map(m => metaIndex[m.id])
  .filter(Boolean)
  .sort((a, b) => a.order - b.order);
