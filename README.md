# HIDE & SEEK — TWELVE ARENAS

A first-person 3D exploration game in the browser. Twelve large, hand-directed
arenas, a Seeker that hunts you with expanding rings of light, a shop, power-ups,
signatures to unlock — and one hidden dog per map.

**No image files. No model files. No audio files.** Every texture, every mesh and
every sound in this game is generated procedurally in your browser at runtime.
The entire download is source code.

---

## Play

Open `index.html` from any static web server (ES modules and `importmap` need
`http://`, not `file://`):

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

Or play the deployed build on GitHub Pages.

Requires **WebGL 2** and a desktop browser with pointer lock.

## Controls

| Key | Action |
|---|---|
| `W A S D` | Move |
| `Shift` | Sprint (costs stamina) |
| `Ctrl` / `C` | Crouch — quieter, and it deepens your hiding spots |
| `Space` | Jump |
| `F` | Flashlight (burns battery; also makes you easier to find) |
| `Q` | Use held power-up |
| `Tab` (hold) | Scan — reveals nearby loot, spikes your exposure |
| `M` | Toggle radar |
| `V` | Free camera / noclip — for looking at the arenas |
| `Shift+R` | Restart arena |
| `Esc` | Pause |

---

## The arenas

| # | Arena | Biome | Difficulty |
|---|---|---|---|
| 01 | **The Backrooms** — endless damp carpet and fluorescent hum | surreal | ●●○○○ |
| 02 | **Neon Metro** — a flooded three-level subway interchange in the rain | indoor | ●●●○○ |
| 03 | **Port Nine** — a container maze at golden hour, climbable to the top | outdoor | ●●○○○ |
| 04 | **The Undercroft** — cathedral-industrial abyss, 60 m down | underground | ●●●●○ |
| 05 | **The Aqueducts** — a drowned temple waterworks swallowed by jungle | outdoor | ●●●○○ |
| 06 | **Frostwatch** — a polar station in a whiteout, with ice tunnels below | outdoor | ●●●●○ |
| 07 | **Halo Nine** — a derelict orbital station wrapped around a planet | space | ●●●○○ |
| 08 | **Palisade Mall** — a dead 1994 shopping mall at 3 a.m. | indoor | ●●○○○ |
| 09 | **The Forge** — a still-running steel foundry, five levels of catwalks | indoor | ●●●●○ |
| 10 | **Abbadon Manor** — gothic manor, servants' warren, hedge maze | indoor | ●●●○○ |
| 11 | **Dust Bazaar** — a desert souk with a second city on the roofs | outdoor | ●●●○○ |
| 12 | **The Static** — every other arena, torn up and hung in the dark | surreal | ●●●●● |

---

## Systems

- **The Seeker.** No seeker character — the antagonist is a presence that sweeps
  the arena in expanding rings. Caught in a ring without cover and you're Spotted.
  It builds a model of where you probably are from your noise, your light and
  whether you're moving.
- **Fear.** 0–100. Rises near the sweep, bleeds off in cover. Past 60 your aim
  starts to drift; past 80 the screen closes in. It never kills you — it just
  makes you easy to find.
- **8 power-ups** — Ghost, Dash, Pulse, Decoy, Night Eyes, Silence, Stillness, Updraft.
- **10 signatures** — each reskins your flashlight (colour, cone, throw) and your
  HUD. Blackout has no beam at all and the sweep slides right past you.
- **8 upgrades** — battery cells, conditioning, soft soles, coin magnet, pup
  compass, steady nerve, a second power-up pocket.
- **6 mutators** — stackable round modifiers that multiply your payout.
- **12 dogs.** One per arena, genuinely hidden. Find them all to unlock GOOD BOY.

---

## Architecture

```
index.html            importmap → three.js from a CDN; all UI markup
styles/ui.css         the whole front end
src/
  main.js             boot, state machine, frame loop, wiring
  engine/
    renderer.js       WebGLRenderer + ACES + SSAO + bloom + grade + SMAA
    world.js          scene host; builds the ctx every arena receives
    controller.js     capsule/octree FPS controller with the feel layer
    textures.js       21 procedural PBR surface generators (albedo+normal+rough)
    materials.js      cached material library
    props.js          ~45 shared prop builders + instancing/merge helpers
    audio.js          procedural WebAudio: SFX, 9 ambience beds, generative music
    rng.js            deterministic RNG, perlin/fbm/ridged/worley noise
  game/
    state.js          versioned localStorage save
    content.js        skins, power-ups, upgrades, mutators, ranks
    seeker.js         the sweep + the Fear model
    pickups.js        collectibles
    powerups.js       power-up runtime
    flashlight.js     the only equipment in the game
  ui/
    menu.js  hud.js  credits.js  menuscene.js  cardart.js
  arenas/
    index.js          lazy registry with per-arena failure isolation
    a01..a12          one self-contained module per arena
```

### Adding an arena

Write one file in `src/arenas/` exporting `meta` and `build(ctx)`, then add it to
the registry. The full contract is in [docs/ARENA_API.md](docs/ARENA_API.md) —
it documents the whole `ctx` surface, the prop and material libraries, the
performance budget, and the style bar.

### Determinism

Arenas must never call `Math.random()`. They take `ctx.rng` (mulberry32, seeded
from `meta.seed`) and `ctx.noise`, so every world is byte-identical on every
machine and every reload.

---

## Development

There is no build step. The browser loads the ES modules directly and pulls
three.js from a CDN via an `importmap`, so editing a file and reloading is the
whole loop.

The checks below need Node (18+) and `npm install` for a local copy of three.js
that the headless tooling can import.

```bash
npm run check      # syntax-check every module
npm run audit      # cross-arena consistency: ids, registry, determinism, API misuse
npm run uicheck    # every DOM id and selector the JS touches exists in index.html
npm run validate   # build all twelve arenas headlessly and test them
```

### The headless validator

`tools/validate.mjs` is the important one. It runs the **real engine** under
Node behind a Canvas2D shim (`tools/dom-stub.mjs`), and for each arena it:

- imports the module and checks the `meta` contract
- runs `build(ctx)` and walks the resulting scene graph — mesh, triangle,
  material, texture and light counts, shadow-caster budget, NaN transforms
- checks the gameplay contract: coin/battery/power-up counts, exactly one pup,
  hiding spots, valid power-up ids, finite pickup positions
- calls every `onUpdate` callback at three different timestamps to catch
  animation crashes
- bakes the collision octree, then **drops a player capsule at `meta.spawn` and
  simulates until it lands** — which catches spawns embedded in geometry, spawns
  floating in the air, and arenas with no floor
- fires eight capsule probes outward from spawn to find missing floor

This is what caught the two engine bugs in `props.js`, and it is why all twelve
arenas are known to be enterable rather than merely known to parse.

**Note on timings:** the numbers below were measured on a very slow machine
(roughly 20–50× slower than a laptop). Divide by ~25 for a realistic figure.

| Arena | build | meshes | tris | materials | lights | collision |
|---|---|---|---|---|---|---|
| Backrooms | 23.8s | 135 | 147k | 102 | 22 / 2 shadow | 1 merged proxy |
| Neon Metro | 74.5s | 705 | 88k | 160 | 25 / 3 | 429 |
| Port Nine | 38.0s | 287 | 200k | 125 | 12 / 1 | 11 merged |
| The Undercroft | 23.8s | 614 | 202k | 88 | 24 / 2 | 489 |
| The Aqueducts | 21.5s | 458 | 162k | 60 | 14 / 3 | 332 |
| Frostwatch | 16.4s | 561 | 160k | 117 | 24 / 3 | 188 |
| Halo Nine | 25.0s | 570 | 85k | 149 | 24 / 3 | 272 |
| Abbadon Manor | 29.6s | 1594 | 485k | 89 | 19 / 3 | 1221 |
| Dust Bazaar | 51.7s | 394 | 190k | 82 | 19 / 1 | 168 |
| The Static | 116.4s | 528 | 79k | 216 | 20 / 2 | 225 |

Every arena lands its player capsule on solid floor from `meta.spawn`, and every
one hides exactly one dog.

## Credits

Art direction — palette language, the layered vertical world, the "hard cut"
between layers, and the pillar that says a city can lie — is adapted from the
author's own design notes.

Built with [three.js](https://threejs.org) (MIT). Everything else is in this repo.
