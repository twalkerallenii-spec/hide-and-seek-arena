# HIDE & SEEK — TWELVE ARENAS

A first-person 3D multiplayer hide-and-seek game in the browser. Eleven slots,
a wheel that picks one Seeker and ten hiders, thirty seconds to disappear, then
a monster comes looking.

Twelve large hand-directed arenas. Proximity voice chat. A shop, power-ups,
signatures to unlock — and one hidden dog per map, which is also how the hiders
win.

**Play it:** https://hide-and-seek-arena-server.onrender.com

Every texture, every procedural mesh and every sound is generated in your
browser at runtime — there is not a single image or audio file in the build.
The authored models are the exception and they are deliberate: a rigged PSX
monster for the Seeker, rigged characters for the players, and a CC0 prop kit
for set dressing. Those live in `assets/` and total about 34 MB.

---

## Play

Open the link above. It needs **WebGL 2** and a desktop browser with pointer
lock. The server is on a free tier that sleeps when idle, so a cold start can
take up to a minute; a scheduled ping keeps it warm most of the time.

Running it locally:

```bash
npm install          # three.js, for the headless tooling
cd server && npm install && cd ..
node server/index.js # serves the game AND the multiplayer socket on :10000
```

The game and the server are one deployment — same origin, so the WebSocket
needs no CORS and there is no second URL to keep in sync.

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
| `F3` | Diagnostics overlay — state, scene, camera, draw calls |

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

## The round

1. **Lobby** — eleven slots. Press START and a thirty-second window opens for
   other people to join; empty slots fill with AI.
2. **The wheel** — spins and lands on one Seeker. Every slot is eligible.
3. **Hide** — thirty seconds. The Seeker is held in a holding cell above the
   map, with the countdown on the wall, so they cannot watch where anyone runs.
4. **The hunt** — the Seeker is released. It moves at 1.5x a hider, walking and
   sprinting both, and turns slower, so corners are the way out.
5. **The end** — when every hider has been found at least once, or when a hider
   finds the hidden dog, which ends it in the hiders' favour regardless.

Being caught is not elimination. You go down for three seconds, respawn at the
start area with six seconds of immunity, and rejoin — but you are marked found,
so you stop holding up the Seeker's win.

## Systems

- **Camera by role.** The Seeker plays first person — you *are* the monster.
  Everyone else plays over the shoulder with a visible, animated body.
- **Sprint is a charge, not a button.** ~3.8 s of sprint, ~12 s to refill, and
  it only starts refilling 1.4 s after you stop.
- **Proximity voice**, always on. Each player's voice comes from where their
  character actually is and fades to nothing by 35 m; walls muffle it.
- **Fear.** Rises near the Seeker, bleeds off in cover. Past 60 your aim drifts;
  past 80 the screen closes in. It never kills you — it makes you easy to find.
- **8 power-ups**, **10 signatures**, **8 upgrades**, **6 mutators**.
- **12 dogs.** One per arena. Find them all to unlock GOOD BOY.

## Architecture

```
index.html            importmap -> vendored three; all UI markup
styles/ui.css         the whole front end
vendor/three/         three.js + the 13 addons we use, served from our origin
assets/               CC0 models and textures (monster, characters, props)
src/
  main.js             boot, state machine, frame loop, wiring
  engine/
    renderer.js       WebGLRenderer + ACES + SSAO + bloom + grade + SMAA
    world.js          scene host; builds the ctx every arena receives
    controller.js     capsule/octree FPS controller, third-person boom camera
    proximity.js      distance culling by bucket
    assets.js         GLB/FBX loading, caching, cloning, instancing
    textures.js       21 procedural PBR surface generators
    materials.js      cached material library
    props.js          ~45 procedural prop builders + instancing/merge helpers
    audio.js          procedural WebAudio: SFX, 9 ambience beds, music
    rng.js            deterministic RNG, perlin/fbm/ridged/worley noise
  game/
    round.js          the round machine — shared by client AND server
    monster.js        the Seeker: senses, navigation, animation
    avatar.js         rigged bodies for every other participant
    waitroom.js       where the Seeker is held during the hide phase
    seeker.js         the abstract sweep + the Fear model (solo mode)
    state.js  content.js  pickups.js  powerups.js  flashlight.js
  net/
    client.js         offline-first network client
    voice.js          proximity voice over a WebRTC mesh
    config.js         where the server is
  ui/
    menu.js  hud.js  lobby.js  credits.js  menuscene.js  cardart.js
  arenas/
    index.js          lazy registry with per-arena failure isolation
    a01..a12          one self-contained module per arena
server/
  index.js            HTTP (serves the game) + WebSocket
  room.js  ai.js  signal.js
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

### The emulator

`tools/emulator/` boots the **actual game** — index.html, main.js, the whole
stack — inside a linkedom DOM with a stubbed WebGL2 context, then plays it:
clicks through the menu, loads an arena, presses READY, walks the player around
with real key and mouse events, runs a full round, pauses, returns to the menu.
It reports every error, unhandled rejection, NaN position, fall out of the
world and stuck state it finds.

It cannot see pixels — headless-gl only offers WebGL 1.0 and three r163+ needs
WebGL 2, so there is no real context available. It can see everything else,
which is where the bugs are. It has caught, among others: `location`
dereferenced outside its guard, a settings row that could take down the whole
boot, a seeker who could not catch anyone, and AI hiders with no bodies.

```bash
node tools/emulator/emulate.mjs backrooms 90   # one arena, 90s of play
node tools/emulator/emulate.mjs --all 14       # all twelve
```

### The validator

`tools/validate.mjs` runs the real engine under Node with a canvas shim and,
per arena: checks the `meta` contract, walks the scene graph for mesh/triangle/
material/light counts and NaN transforms, checks the gameplay contract, calls
every `onUpdate` at three timestamps, bakes the collision octree, then **drops a
player capsule at `meta.spawn` and simulates until it lands** — which catches
spawns embedded in geometry, spawns floating in the air, and arenas with no
floor.

### Other tools

```bash
node tools/measure-props.mjs     # bounds/tris/materials for all 185 props
node tools/asset-inspect.mjs f   # bounds, bones and clips of any FBX/GLB
node tools/fps-budget.mjs        # draw calls incl. shadow re-draws, per arena
node tools/vendor-three.mjs      # re-vendor three after a version bump
node tools/render-deploy.mjs     # create/deploy the Render service
```

### Performance notes

Two things dominated load time and neither was where I first looked:

- **The collision octree.** three's Octree recurses until a leaf holds 8
  triangles, and `split()` copies each triangle into every subtree it touches.
  On a flat 198x12x198 arena that reached depth 17, 370k nodes and 80x
  duplication — 42.5s to bake. Capping depth so leaves land near 6 m across cut
  it to 1.5s with identical collision results.
- **Menu boot.** Twelve procedural card arts plus 26 full PBR sets for
  background shards, all before the menu would appear: 29.9s down to 5.1s by
  making the gallery lazy and the shards cheap.

## Credits

Art direction — palette language, the layered vertical world, the "hard cut"
between layers, and the pillar that says a city can lie — is adapted from the
author's own design notes.

Built with [three.js](https://threejs.org) (MIT). Everything else is in this repo.
