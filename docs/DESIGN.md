# Design notes — where this game came from

This is not a from-scratch invention. The art direction, the naming, and two of
the core systems are lifted from design material that already existed in the
author's GitHub account and Google Drive. This document records what came from
where, so the lineage is auditable.

## Sources

| Source | What it is | What this game took |
|---|---|---|
| `03_world/00_ACHERON_PRIME.yaml` (Drive, TARTARUS bible) | Level-design source for a superhero game | The five-layer vertical world, the layer palette/audio table, the "hard cut between layers" rule, `L1_SUB_PAVEMENT` and `L0_SUBTERRENE_RING` as arena briefs |
| `13_vfx_art/02_ART_BRIEFS.md` (Drive) | Twelve Titan colour/silhouette briefs | The rule that each arena must read from one silhouette and one colour; the coolant-cyan / forge-red / void-violet triad |
| `01_design/`, `00_overview/` (Drive) | Mechanics and pillars | The `scan_read` verb, "Abyssal Mutators" → the mutator system, the pillar **"a city that lies"** → arena 12 |
| "Steelheart proj. gameplan" (Drive) | A UE5 checklist | The **Fear** model, essentially verbatim: 0–100, >60 degrades control, >80 screen distortion, bleeds off in safety |
| "My App plans" (Drive) | Lobby/UI art direction | `#FFD700 → #C5A059` primary action, black 2–3 px text outline, condensed uppercase at −4° skew, the `PLAY \| LOCKER \| STORE` tab bar, the 5% safe-zone layout |
| `roomscan/docs/ui-style.md` (local repo) | A token-level design system | Panel/radius/shadow token structure, the one-accent-per-screen rule |
| `twalkerallenii-spec/toon-shooter` | Three.js wave shooter | Prop *taxonomy* — which objects make good cover — informed `props.js` |
| `twalkerallenii-spec/three-player-controller` | MIT capsule character controller | Confirmed the capsule-vs-octree approach used in `controller.js` |
| `twalkerallenii-spec/bulletheaven` | 2D roguelite | Module shape for `pickups` / `upgrades` / `economy` / `save` |

## What was deliberately *not* used

The recon surfaced a large amount of ready-made 3D content: ~90 glTF props in
`toon-shooter`, a modular city kit in Drive (`dist/city`), a 10-storey BIM office
building, HDRIs, and a 26 MB `ghoul.fbx`.

None of it ships here, for three reasons:

1. **Weight.** The Drive city textures are 1–9.6 MB PNGs each. Shipping them
   would mean a KTX2/Draco pipeline (`gltfpack -cc -tc`, per `roomscan/docs/plan.md`
   §4.4) before the game was playable at all.
2. **Licensing.** Several repos are forks with unverified upstream licences, and
   `blobl.io` is AGPL-3.0 — its assets cannot go into a differently-licensed game.
3. **It would have made a worse game.** Twelve arenas dressed from one prop kit
   look like one arena twelve times. Generating every surface procedurally is
   what lets Frostwatch and The Forge share zero pixels.

The one thing worth revisiting is `roomscan`'s `POST /api/scenes/<uuid>/game-ready/`
endpoint: a working video → GLB + V-HACD collision pipeline. "Film your room,
hide in it" would be arena 13, and the code for it already exists.

## Naming

- **ABBADON MANOR** — after `DANIEL ABBADON` / TARTARUS. His portrait hangs over
  the fireplace and his name is cut into a chest tomb in the family graveyard.
- **THE UNDERCROFT** — the `L0_SUBTERRENE_RING` layer, described in the bible as
  a "cathedral-industrial abyss".
- **THE STATIC** — the `VIS-P4` pillar, "a city that lies", plus the atmospheric
  event where the sky briefly de-renders.
- **HALO NINE**, **PORT NINE** — the bible's habit of numbering everything.

## Systems traceable to the source material

**Fear** (`src/game/seeker.js`). The Steelheart doc specifies a two-sided fear
system with thresholds at 30 / 60 / 90 and 50% propagation between NPCs. Single
player means no propagation, so the surviving parts are: the 0–100 scale, decay
over time, safe zones that bleed it off, degraded control past the middle
threshold, and screen distortion near the top. The doc's exact framing — that
fear should never kill the player, only make them worse at hiding — is the rule
the whole system is built around.

**The Seeker** (`src/game/seeker.js`). The bible's hunt loop is
`ACQUIRE → READ → BREAK → EXECUTE → ASSIMILATE`, with a timed vulnerable window
and the rule that *"a failed execute window does not kill; it resets Poise
partially and re-telegraphs."* Here: the sweep telegraphs with an audible ping
before the ring reaches you, being caught costs Fear rather than the run, and
the Seeker's confidence in your position (`suspicion`) rises and decays instead
of being binary. The seeker has no body — the design brief said no characters,
and a disembodied scan turned out to be more frightening than a monster.

**Mutators** (`src/game/content.js`). Directly the bible's "Abyssal Mutators":
stackable round modifiers that change the payout multiplier.
