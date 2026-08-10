# What building twelve arenas taught us

Twelve arenas were authored independently against the same contract in
[ARENA_API.md](ARENA_API.md). They hit the same walls in the same order. This is
the accumulated debrief — read it before writing arena thirteen.

## Engine bugs the arenas found

**Rotated cylinder wraps were offset by their own length.** `props.cyl()` returns
a group whose mesh sits at local `+h/2` so the origin lands at the base. Rotating
that group 90° about Z maps `+h/2` to `−h/2` on X, so `pipes()`, `ladder()`,
`fence()` and `banner()` were placing their runs a full length away from where
the caller asked. Three separate arena authors independently wrote local
workarounds before anyone reported it. Fixed in `props.js`.

The lesson: a helper whose origin convention changes under rotation is a trap.
If you add a builder that produces a horizontal cylinder, centre the geometry
rather than offsetting the wrapper.

**Ladders were decorative.** `props.ladder()` set `userData.climbable`, and
nothing read it. Five arena reports flagged "ladders are flavour, not traversal"
as a compromise, and every one of them routed around it with stairs. Now
`collectClimbZones()` in `main.js` walks the built scene at load and feeds every
`climbable` object's bounding box to the controller. Ladders work.

## The collision budget was wrong

ARENA_API.md asks for under ~4000 collidable triangles. **Not one arena met it,**
and the ones that came closest did so by degrading the geometry. Actual figures
ranged from 4k to 15k.

The number was wrong, not the arenas. What actually matters is the *node count*
the octree has to partition, not the triangle count — and merging is what
controls that. The Backrooms ships ~13k collidable triangles as **one** merged
invisible proxy mesh and builds its octree faster than arenas with a tenth the
triangles spread across 500 objects.

**The real rule:** merge your collision geometry. One invisible proxy per zone,
built from simple boxes, is correct even at 15k triangles. Five hundred separate
colliding props is not, at any triangle count.

## Texture generation is the build-time bottleneck

Every arena that measured its build found the same thing: the cost is almost
entirely `surface()` calls generating 512² albedo + normal + roughness sets on
the main thread. Not geometry, not the octree.

What worked:
- **Drop to 256², and to 128² for props.** Several authors found 512 was buying
  nothing at high tiling rates — at `repeat: 8` you cannot see the difference.
- **Quantise your `repeat` values.** `surface()` keys its cache on the entire
  options object, so `{repeat: 4}` and `{repeat: 4.5}` are two full generations.
  Pick a small set of tiling rates and reuse them.
- **Clone, don't regenerate.** The Undercroft generates two concrete base sets
  and derives seven more scales and tints by cloning the material and texture and
  changing `repeat`/`color`. That took its build from 30 s-equivalent to ~1.5 s.

## Material count is the frame-rate bottleneck

three.js cannot batch across materials, so distinct material count is very close
to a lower bound on draw calls. Shipped arenas range from 60 to 1004. The one at
1004 is the only arena with a real performance problem.

`props.freeze()` merges per material — which means **it does nothing for you if
every object has its own material.** Cutting material count is what makes
freezing effective, in that order.

The trap is a loop like `mat.solid({ color: perItemColor })` over 80 storefronts
or 200 crates. Reduce to a palette of six to ten and reuse.

## Shadow casters multiply

The budget is four shadow-casting lights, and it is a hard one. Each shadow
light re-renders every shadow-casting mesh into its map, so an arena with 900
casters and 3 shadow lights pays 2700 extra draw calls before it draws anything
you can see. Two arenas exceeded the budget and both were visibly the slowest.

Pools of light do not require real lights. Emissive geometry plus bloom sells
almost all of it. Reserve real shadow casters for the one or two lights whose
shadows the player will actually read — the moon through mullions in Abbadon
Manor, the low sun down the container alleys in Port Nine.

## Verticality is where arenas break

Every arena with a second level had the same class of bug, caught by the spawn
simulation and the reachability pass:

- Railings that collide seal the stairs that land on them. Abbadon Manor and The
  Undercroft both shipped catwalk railings as non-colliding decor for exactly
  this reason.
- A stair tower that arrives on an isolated rooftop. Port Nine's generator
  produced this, and needed an explicit pass to force the stacks beside each
  entry to a bridgeable height.
- Roof-to-roof gaps that assume a jump the controller cannot make. Derive your
  limits from the controller constants — `jumpSpeed 8.2`, gravity `26` — not from
  what looks about right. That is a 1.29 m apex and roughly 2.5 m of horizontal
  clearance at sprint speed.

## Generated layouts need a connectivity proof

Four arenas generate their layout procedurally: the Backrooms maze, Abbadon's
hedge maze, Port Nine's container field, Dust Bazaar's organic street network.
All four authors wrote a separate connectivity checker — a BFS or a union-find
over the generated graph — and **three of the four found a real disconnection**
on the first run.

If you generate a layout, prove it is connected before you dress it. A spanning
tree gives you connectivity by construction; knocking extra holes afterwards only
ever adds it. Carving passages and hoping is how you ship a sealed pup.

## Determinism held

Zero `Math.random()` calls across 25,000 lines of arena code, verified by
`tools/audit-arenas.mjs`. The `ctx.rng.fork('tag')` pattern is why — forking a
named stream per subsystem means tweaking the prop scatter does not reshuffle the
maze. Use it.

## What the contract should have said

- Give a collision *node* budget, not a triangle budget, and mandate merging.
- Give a material budget. It matters more than the triangle budget.
- State the controller's real jump and step limits as numbers.
- Require a connectivity proof for any generated layout.
- Say that 256² is the default texture size and 512² needs a justification.
