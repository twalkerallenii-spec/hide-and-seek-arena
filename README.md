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

```bash
tools/check.sh     # syntax-check every module
tools/smoke.mjs    # headless: boot the game, load each arena, screenshot
```

## Credits

Art direction — palette language, the layered vertical world, the "hard cut"
between layers, and the pillar that says a city can lie — is adapted from the
author's own design notes.

Built with [three.js](https://threejs.org) (MIT). Everything else is in this repo.
