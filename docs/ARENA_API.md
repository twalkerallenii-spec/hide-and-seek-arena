# Arena API — the contract

Every arena is **one ES module** in `src/arenas/`. It exports `meta` and `build`.
Nothing else. It must not import from other arenas, must not touch the DOM, and
must not fetch anything over the network.

```js
// src/arenas/a07_example.js
import * as THREE from 'three';

export const meta = {
  id: 'example',                 // unique, kebab-case, matches filename suffix
  name: 'THE EXAMPLE',           // shown on the arena select card
  tagline: 'One line of flavour text.',
  order: 7,                      // position in the select screen
  difficulty: 3,                 // 1..5, drives Seeker aggression
  biome: 'indoor',               // indoor | outdoor | underground | surreal | space
  seed: 70707,                   // any int/string — makes the world deterministic
  spawn: [0, 1.0, 0],            // player start [x, y, z]; y = FLOOR height
  bounds: 160,                   // approx radius of playable area, metres
  colors: ['#c8b06a', '#3a2f1c'],// two hexes used for the menu card gradient
  music: 'tense',                // menu | tense | calm | dread | heroic | arcade
};

export async function build(ctx) {
  // ...populate the world...
}
```

`build` may be `async` (e.g. to `await` nothing in particular) but must return
within a couple of seconds. Generate, don't download.

---

## The `ctx` object

### Adding things

| Call | What it does |
|---|---|
| `ctx.add(obj, ...)` | Adds to the arena root. Collision follows each mesh's `userData.collide`. |
| `ctx.addSolid(obj, ...)` | Adds and forces the **whole subtree** collidable. |
| `ctx.addDecor(obj, ...)` | Adds and forces the whole subtree **non**-collidable. |

Collision is a capsule-vs-octree test built once, after `build` returns, from
every mesh with `userData.collide === true`.

**Budget rule.** Keep the collidable set under ~4000 triangles-worth of *simple*
meshes. Detailed geometry (rubble, foliage, greebles, pipes) should be
non-colliding decor; if the player must not walk through it, add an invisible
box proxy instead:

```js
const proxy = ctx.props.boxC(3, 4, 1, ctx.mat.solid({}), { shadow: false });
proxy.visible = false;
proxy.userData.collide = true;
proxy.position.set(x, 2, z);
ctx.add(proxy);
```

### Lights

```js
ctx.light(new THREE.HemisphereLight(0x9fb6d4, 0x2a2620, 0.45));
ctx.light(new THREE.AmbientLight(0x30363f, 0.6));

const sun = new THREE.DirectionalLight(0xffd9a8, 2.6);
sun.position.set(60, 90, 30);
ctx.light(sun, { shadow: true, range: 80, far: 300 });

const spot = new THREE.SpotLight(0xffe0b0, 12, 22, Math.PI / 5, 0.4, 1.6);
spot.position.set(0, 5, 0);
spot.target.position.set(0, 0, 0);
ctx.light(spot, { shadow: true, far: 30 });
```

**Shadow budget: at most 4 shadow-casting lights per arena, and at most one
directional.** Everything else must be `{ shadow: false }` (the default).
For "lots of lights" looks (a corridor of fluorescents), use *emissive geometry*
plus one or two real lights — bloom sells the rest for free.

Point/spot lights are expensive: **cap real lights at ~24 per arena.** Beyond
that, use emissive materials.

### Atmosphere

```js
ctx.fog(0xb9a969, 4, 70);                  // linear
ctx.fog(0x0a0d10, 0.022, 0, 'exp2');       // exponential
ctx.sky({ color: 0x0a0d10 });              // flat background
ctx.sky({ top: 0x1b3a6b, bottom: 0xd8c9a8, radius: 500 }); // gradient dome
ctx.useEnvironment(0.8);                   // IBL intensity (default 0.6)
ctx.grade({ exposure: 1.15, saturation: 0.9, contrast: 1.1,
            lift: [0.01, 0.0, -0.01], gain: [1.02, 1.0, 0.95],
            vignette: 1.1, grain: 0.05, bloom: 0.6, scanline: 0.0 });
ctx.soundscape('hum', 'dread', { size: 0.7, dark: 0.6, wet: 0.3 });
ctx.setSurface((x, z) => (Math.abs(x) < 20 ? 'carpet' : 'concrete'));
```

Surface names: `concrete carpet metal wood grass gravel water snow sand tile`.

### Gameplay hooks

```js
ctx.hidingSpot(x, y, z, radius = 1.2, quality01 = 1);  // Seeker can't see you here
ctx.pickup(x, y, z, 'coin');                            // currency
ctx.pickup(x, y, z, 'battery');                         // flashlight charge
ctx.pickup(x, y, z, 'powerup:ghost');                   // see POWERUPS below
ctx.pickup(x, y, z, 'pup');                             // the dog easter egg — EXACTLY ONE per arena
ctx.onUpdate((dt, elapsed) => { /* animate */ });
```

Powerup ids: `ghost` `dash` `pulse` `decoy` `nightvision` `silence` `timefreeze` `jumpjet`.

**Every arena must place:**
- 25–45 `coin` pickups, spread so no corner of the map is dead
- 3–6 `battery` pickups
- 2–4 `powerup:*` pickups
- **exactly one** `pup` pickup, genuinely hidden (behind/under/above something)
- 10–20 `hidingSpot`s

Place pickups at `y = floorHeight + 1.0`. They render as a floating icon added
by the game layer — do not model them yourself.

---

## Materials — `ctx.mat`

```js
ctx.mat.surface(type, opts)   // PBR w/ procedural albedo+normal+roughness
ctx.mat.solid(opts)           // untextured PBR
ctx.mat.emissive(color, intensity, opts)
ctx.mat.glass(opts) / ctx.mat.glassCheap(opts)
ctx.mat.metal(color, roughness)
ctx.mat.water(opts)           // animate with mat.userData.tick(dt)
ctx.mat.painted(w, h, drawFn, opts)     // canvas2D → material
ctx.mat.textMaterial(text, opts)        // → { material, aspect }
```

`surface` types:
`concrete plaster carpet ceilingTile tile brick metalPanel rustMetal wood grass
dirt sand rock marble asphalt fabric hexPanel snow wallpaper corrugated organic
flat`

Common options: `color` (base tint, hex), `repeat` (UV tiling), `size` (texture
px, default 512 — **use 256 for props**), `seed`, `roughness`, `metalness`,
`normalScale`, `emissive`, `side`, plus per-type extras (`tiles`, `grout`,
`rows`, `mortar`, `planks`, `panels`, `ribs`, `rep`, `motif`, `vein`, `dry`).

```js
const wallMat = ctx.mat.surface('plaster', { color: 0xd9c98c, repeat: 6, size: 512 });
const floorMat = ctx.mat.surface('carpet', { color: 0xb59a4a, repeat: 24 });
```

**Materials and textures are cached by their arguments** — asking for the same
material twice is free, so reuse aggressively. **Do not create more than ~28
distinct `surface()` calls per arena** (each is a 512² × 3 texture generation on
the main thread). Prefer `solid()` for small props.

---

## Props — `ctx.props`

All builders put the **origin at the base centre**, so `obj.position.y = floorY`
is correct. Everything is a `Group` unless noted.

**Primitives** — `box(w,h,d,mat)` `boxC(w,h,d,mat)` (origin at centre)
`cyl(rTop,rBot,h,mat,{seg,open})` `sphere(r,mat)` `ground(w,d,mat,{segs})`
`wallPlane(w,h,mat)`

**Architecture** — `wallBetween(x1,z1,x2,z2,h,thickness,mat)`
`roomShell({w,d,h,thickness,material,doors:[{side:'n'|'s'|'e'|'w',at:0..1,width,top}]})`
`ceiling(w,d,h,mat)` `stairs(steps,stepW,stepH,stepD,mat)`
`railing(len,h,mat)` `door(w,h,mat,frameMat)` `window(w,h,sill,frameMat,paneMat)`
`column(h,r,mat)` `girder(len,mat)` `catwalk(len,width,mat)` `ladder(h,mat)`
`archway(w,h,depth,mat)`

**Lights (geometry)** — `fluorescent(len,{color,intensity})`
`lightPanel(size,{...})` `wallLamp({...})` `pendant(cordLen,{...})`
`streetLight(h,{...})` `torch({...})`

**Clutter** — `crate(size,mat)` `barrel(r,h,mat)` `pallet(w,d,mat)`
`shelfRack(bays,levels,bayW,depth,levelH,mat)` `lockers(count,mat)`
`pipes(len,count,r,mat)` `vent(w,h,mat)` `acUnit(w,h,d)` `machine(w,h,d,seed)`
`rubble(radius,count,mat,seed)` `fence(len,h,'chain'|'wood',mat)`

**Furniture** — `table(w,h,d,mat)` `chair(mat)` `deskComputer({screen})`
`bookshelf(w,h,d,seed)` `sign(text,{background,color,height,emissive})`
`banner(w,h,color,emblem)` `trashBin(r,h)` `car(color,seed)`
`container(len,color,seed)`

**Nature** — `tree(h,'pine'|'broad',seed)` `bush(r,color,seed)`
`boulder(r,seed,mat)`

**Performance** — `scatter(geometry, material, count, placeFn, seed)` returns an
`InstancedMesh`; `billboardCross(w,h)`; `mergeGeometries([...])`;
`freeze(group)` bakes a group into one mesh per material.

```js
// 4000 grass tufts in one draw call
const tuft = ctx.props.billboardCross(0.45, 0.55);
const gm = ctx.mat.painted(64, 64, (c, W, H) => { /* draw blades */ },
  { transparent: true, alphaTest: 0.4 });
ctx.addDecor(ctx.props.scatter(tuft, gm, 4000, (i, d, r) => {
  d.position.set(r.range(-100, 100), 0, r.range(-100, 100));
  d.rotation.y = r() * 6.28;
  d.scale.setScalar(r.range(0.7, 1.4));
}, 42));
```

Use `scatter` for anything repeated more than ~30 times. Use `freeze` on large
static hand-built structures (a whole building shell) to collapse draw calls —
but call `props.COLLIDE()` on a *separate* low-poly proxy group before freezing,
since frozen output is non-colliding.

---

## RNG — `ctx.rng`, `ctx.noise`

```js
ctx.rng()                    // 0..1
ctx.rng.range(a, b)
ctx.rng.int(a, b)            // inclusive
ctx.rng.pick(array)
ctx.rng.chance(0.3)
ctx.rng.gauss(mean, dev)
ctx.rng.shuffle(array)
ctx.rng.fork('tag')          // independent stream — use one per subsystem so
                             // tweaking one part doesn't reshuffle everything

ctx.noise.fbm(x, y, octaves)     // ~[-1,1]
ctx.noise.ridged(x, y, octaves)
ctx.noise.worley(x, y, cells)    // { f1, f2, id }
```

**Never use `Math.random()`.** Worlds must be identical every load.

---

## Hard requirements checklist

- [ ] Exports exactly `meta` and `build`.
- [ ] Deterministic — `ctx.rng` / `ctx.noise` only.
- [ ] Player can never fall out of the world: the arena is sealed by walls,
      cliffs, or an invisible boundary. Floor exists everywhere reachable.
- [ ] `meta.spawn` is on solid floor with ≥2.5 m headroom and nothing inside the
      player capsule (radius 0.34 m, height 1.72 m).
- [ ] Ceilings/roofs where the biome implies them; the world must not read as an
      open-topped box.
- [ ] The arena is **big**: at least 120 × 120 m of walkable space, ideally with
      2+ vertical levels connected by stairs/ramps/ladders.
- [ ] Verticality: at least one place the player can get above ground level.
- [ ] Landmarks: 5+ visually distinct areas so the player can navigate by sight.
- [ ] Draw calls after build should be < ~900. Use `scatter`/`freeze`.
- [ ] Total build time < 2 s on a mid laptop.
- [ ] Pickups, hiding spots, and exactly one `pup` placed as specified above.
- [ ] Grade + fog + soundscape set (an arena with default grading looks flat).

## Style bar

Aim for "shipped AAA level", not "three.js example". Concretely:

1. **No untextured grey boxes.** Every large surface gets a `surface()` material
   with sensible `repeat`.
2. **Light with intent.** Pick a key light direction and a contrasting fill.
   Pools of light and pockets of dark — a uniformly lit room looks like a demo.
3. **Trim and detail at eye level.** Skirting boards, door frames, wall stains,
   pipe runs, signage, cable trays. The player's eye is at 1.6 m — put detail
   there.
4. **Depth cues.** Fog tuned so distant geometry desaturates. Foreground
   silhouettes (a pipe, a hanging cable) framing long views.
5. **Emissives + bloom** carry the "modern engine" read. Screens, strip lights,
   exit signs, warning lamps.
6. **Asymmetry and wear.** Perfectly regular grids look procedural. Jitter
   rotations, break up rows, damage a section, leave a collapsed corner.
7. **Motion.** Something must move: flickering lights, swinging pendants, a
   rotating fan, drifting dust, waving foliage, an animated screen.
