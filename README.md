# ILMEK — Yeniden Örülen Dünya / A World Rewoven

A playable third-person 3D exploration and environmental puzzle game that runs
entirely in the browser. The player is the last **Weaver**, restoring a
fragmented world by rediscovering how its systems relate and reconnecting them.

> **Her bağlantı dünyaya yeniden hayat verir.**
> **Every connection brings the world to life.**

No accounts, no API keys, no paid services, no live model calls, no private
data. All geometry, texture and sound is generated procedurally at runtime.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build and local preview of the built site:

```bash
npm run build      # type-checks, then emits ./dist
npm run preview    # serves ./dist on http://localhost:4173
```

Full local verification (types, tests, production build):

```bash
npm run verify
```

### Deploying

`npm run build` emits a fully static `dist/` that can be served from any static
host. The prepared destination is **https://ilm.aserdargun.com**. Domain
registration, DNS and deployment are separate tasks for the owner to authorise;
no deployment has been performed by this repository.

---

## Art assets

Hero models are authored procedurally in **Blender** and exported as GLB.
The generator is committed, so every asset in the game is reproducible from
source rather than being opaque binary files:

```bash
# Rebuild public/models/*.glb (requires Blender 5.x)
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python tools/blender/build_assets.py

# Render one PNG per asset for visual review
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python tools/blender/render_preview.py
```

| File | Purpose |
| --- | --- |
| `tools/blender/common.py` | Loft / lathe / torus helpers, palette, PBR materials, AO bake |
| `tools/blender/weaver.py` | The player character and Spark |
| `tools/blender/landmarks.py` | The Synthesis Tree and the seven region landmarks |
| `tools/blender/render_preview.py` | Contact-sheet renders for review |
| `tools/blender/ground_texture.py` | Tiling normal + roughness maps for the terrain |

Twelve models ship, about 1.4 MB in total: the Weaver, Spark, the Synthesis
Tree, the tapestry, the puzzle console, and the landmark for each of the seven
regions. Most of the growth over the original set is baked vertex AO.

Geometry is built from **lofted cross-sections**, not stacked primitives, which
is what gives the coat, trunk and pump their tapering silhouettes. Flat shading
is intentional: the look is deliberately faceted low-poly.

### Light, shadow and occlusion

Three systems carry the lighting, and they were added together because none of
them works without the other two.

**A shadow-casting sun.** `<Canvas shadows>` was already on, but no light was
ever told to cast — every mesh in the world was lit purely by direction, so
nothing touched the ground. The key light in `src/world/Lighting.tsx` is
directional, so its shadow camera is a box, and the world is far too wide for
one useful shadow map. The box therefore **follows the player** and stays tight
around them: shadow detail is invisible far away and decisive up close. The
second light is a rim with no shadow map at all, because separating silhouettes
from the background does not require a second depth pass.

**A procedural environment probe.** Every material in the world is
`meshStandardMaterial`, and a PBR shader derives its specular response entirely
from what it can reflect. With nothing to reflect, copper and glass collapse
into flat dark shapes — the old look was not unlit, it was *unreflective*.
`src/world/environment.ts` builds a 128×64 float equirectangular probe on the
CPU at load time and hands it to `PMREMGenerator`, which pre-filters it so one
small image serves smooth glass and rough stone alike. It is float rather than
byte data because the sun has to exceed 1.0: clamping it away is exactly what
makes a procedural environment look plastic. The sun disc sits on the same
vector the key light comes from, which is what puts the highlight on the correct
side of a copper ring.

**Baked vertex occlusion.** `bake_vertex_ao` in `tools/blender/common.py` ray-
traces occlusion into a `Col` vertex colour layer. Every mesh in the game
carries it — the landmarks, the Weaver, and all fourteen props. It is baked
rather than computed at runtime for three reasons: it survives the **low
tier**, where shadows are switched off entirely; it darkens the *inside* of a
form — under a hat brim, between two arms, in the crook of a tree — which a
shadow map cannot do, since it records only where a light is blocked, not how
enclosed a point is; and it costs nothing per frame.

Props are baked **one at a time in an otherwise empty scene**. That isolation is
not tidiness, it is correctness: `Props.tsx` turns each prop into an
InstancedMesh, so anything occluding its neighbours at bake time would be
frozen into the vertices and then repeated at every one of the ~180 placements
— including the ones standing in open ground. The character bakes in its rest
pose, which is right for the same structural reason: the occlusion belongs to
the model's shape and rides through the skinning with the vertices.

Two export details decide whether any of this is actually visible, and both
fail silently when wrong:

- The glTF exporter must be told `export_vertex_color="ACTIVE"`. With
  `"NAME"` it writes a second, all-white `COLOR_0` beside the real data in
  `COLOR_1` — and three.js reads `COLOR_0`, so the bake loads and is never seen.
- The material must set `vertexColors` on load. glTF does not switch this on by
  itself, so the data arrives on a material that is ignoring it. In `Props.tsx`
  it is additionally gated on the geometry actually carrying the attribute,
  because a material expecting colours the geometry lacks renders as undefined
  output rather than falling back cleanly.

### Post-processing

`src/world/PostFx.tsx` runs N8AO ambient occlusion, bloom, tone mapping and a
vignette, plus SMAA on the high tier. Bloom's threshold is high (0.72) on
purpose: lowered, it starts blooming sunlit stone, which reads as haze rather
than as light sources.

Adding a composer introduces one trap. R3F sets `ACESFilmicToneMapping` on the
renderer by default, which is correct for a direct-to-canvas render and wrong
here — with a composer the scene is written to an offscreen target first, so a
renderer-side tone map would compress the range *before* bloom reads it, and
bloom would find nothing above its threshold. `PostProcessing.tsx` switches the
renderer's tone mapping off and restores it on unmount, and the composer's own
`ToneMapping` effect maps the final frame instead.

The module is **loaded lazily**. The low tier renders none of these effects, so
it should not download their ~162 KB of shader code. Splitting them out kept
the main bundle at 437 KB gzipped instead of the 596 KB it would otherwise be.

### Quality tiers

| | Low | Medium | High |
| --- | --- | --- | --- |
| Shadow map | off | 1024 | 2048 |
| Post-processing | none | AO, bloom, tone, vignette | + SMAA |
| AO resolution | — | half | full |
| Device pixel ratio cap | 1.25 | 1.5 | 1.75 |

Handhelds default to low; desktops default to high. An explicit choice always
wins over the default, including "high" on a phone.

### Ground texture

A lit but untextured plane reads as painted cardboard, and the terrain discs
cover most of the screen. `tools/blender/ground_texture.py` generates two maps
from periodic value noise:

| Map | Purpose |
| --- | --- |
| `ground_normal.png` | Surface tooth, so the sun has something to rake across |
| `ground_rough.png` | Dry/worn variation, from an independent noise field |

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python tools/blender/ground_texture.py
```

Both are **seamlessly tileable**, and that is not free. The first pass looked
correct in isolation and was not: it sampled one lattice axis from a fixed
column, so rows repeated every `cells` samples instead of every `period` and
the wrap only held on one axis. The tell is a seam error as large as the
interior variation — the check that catches it is `seam / interior`, which
should sit well below 1 and is now near 0.2.

Sampling the field is not the same as sampling the image: `image.pixels` is
bottom-up relative to the noise arrays, so the normal map's green channel is
flipped on write rather than by flipping the field twice.

Three things the material has to get right, each of which produces a
flat-looking ground rather than an error:

- **`flatShading` must be off.** three.js derives flat-shaded normals from the
  face, which bypasses the normal map entirely.
- **UVs are planar from world XZ**, not the cylinder's own — those wrap the
  side wall in 0..1 and collapse the cap into a circle, a radial smear exactly
  where the player looks most. The rim is projected by angle and height
  instead; a purely XZ projection collapses there into one texel streak, which
  showed as a bright band along the horizon.
- **Roughness stays in a narrow, high band (0.92–0.98).** The wider range the
  first version used put the low end near 0.57, and since the scene's turquoise
  rim is a grazing-angle light, that produced a coloured sheen sweeping across
  the ground. Dry stone should stay dry.

Terrain is otherwise colour-only. Walking is solved in 2D against a flat plane
(`navigation.ts` never reads a height), so displacing the ground would put the
mesh where the player is not standing. For the same reason the sky dome radius
has to stay inside the camera's far plane of 900: a dome beyond it is not drawn
at all, and the missing wedge shows up as a hard dark triangle in the corner of
the sky.

### Landmarks have a surface

Every landmark is built from lofted cross-sections and raw vertex lists, so
`export_glb` writes `COLOR_0` and `NORMAL` and **no UVs at all**. A conventional
`normalMap` reads `vNormalMapUv`, which without a `uv` attribute arrives as
(0, 0) for every fragment — the texture loads, the material compiles, the
parameter is set, and the surface looks exactly as it did before.

`src/world/detail.ts` projects `stone_normal.png` **triplanar** instead: three
samples, one per world axis, blended by how squarely the surface faces each, with
the weights raised to the fourth power so the blend stays hard across the 45°
corners of every box in the set. The other thing it buys is world-space texel
density — one tile covers the same number of units on a thirty-metre terrace and
on a hand-sized console, so grain never stretches to fit the object.

| Axis projection | U → | V → | N → | Tangent (x, y, z) becomes |
| --- | --- | --- | --- | --- |
| `.zy` | Z | Y | X | `(z, y, x)` |
| `.xz` | X | Z | Y | `(x, z, y)` |
| `.xy` | X | Y | Z | `(x, y, z)` |

Getting one of those swaps wrong is silent: the grain still appears, it just
leans the wrong way on one axis.

What is skipped, and why each one is a case where the map would be *wrong*
rather than merely unhelpful:

| Skipped | Reason |
| --- | --- |
| Instanced meshes | The per-instance transform lives in `instanceMatrix`, which `project_vertex` applies to `mvPosition` only. `modelMatrix` does not contain it, so every copy of a rock would sample the same spot |
| `flatShading` materials | Normals come from screen-space derivatives, not the attribute. The patch overwrites `normal`, so faceting would become smooth — the island cliff would stop looking like rock |
| Materials with a `normalMap` | The terrain disc already tiles correctly through planar UVs; a second projection just fights the first |
| Transparent and emissive | Grain on glass reads as dirt on the lens, and emission is added after the lighting, so the map cannot reach it |
| The player and its spark | The projection is world-space, so on anything that moves the grain would swim across it |

The pass runs from `useFrame` behind a quiet-frame latch, not from an effect.
This is not a style choice. The landmark assets patch their materials from a
layout effect and always have, because a GLTF scene is a plain three.js object
that exists as soon as the loader resolves — it does not need to be attached to
anything. The procedural geometry is different: R3F attaches its objects to the
scene graph asynchronously, and walking the live scene from an effect saw an
empty world. Worse, it saw one *once*: `[scene, detailMap]` never changes, so it
never looked again, and the bridge decks — a twelve-unit-wide slab of flat
colour running the length of every region — stayed plain for the rest of the
session. The latch reopens on progression, because restoring a region swaps a
bridge's stubs for a deck and creates fresh materials.

`flatShading` was dropped from the bridge deck, its copper rails and the
aqueduct segments to let the map through. On a `BoxGeometry` this is free:
the geometry builds four independent vertices per face with face-aligned normals,
so flat and smooth shading produce identical pixels.

### Landmarks sat in the ground

Two landmarks had wide flat bases authored at exactly `y = 0`, which is the
height of the terrain disc's top face. Coplanar geometry z-fights, and the
result read as a flat brown stain poured across the ground rather than a
structure standing on it. `build_collective_gardens` now starts its first
terrace at 0.6 and steps up from a shared `bed_height(distance)`, so the flower
beds and turbines sit on the terrace they belong to;
`build_terrace_map` lifts its table to 0.5.

The check that catches this is not a screenshot. Both files report their vertex
Y ranges straight out of the GLB JSON chunk:

```
collective_gardens.glb   terrace0    y: +0.600 .. +8.200
terrace_map.glb          terrace     y: +0.500 .. +1.700
```

A related trap, from the island undersides: adding geometry *below* the player
does nothing if the camera is above and looking slightly down — it all falls
under the eyeline. What made the edge read as an edge was the second ring of the
profile rising before it falls, not the forty units of depth beneath it.

### Large flat faces needed a second break-up

Vertex AO is the wrong tool for a thirty-unit terrace top. That face is
uniformly lit and uniformly unoccluded, so AO leaves it a single flat colour
across metres of screen. `common.mottle_vertex_tint` multiplies the baked layer by
two octaves of world-space noise, keyed to position rather than object space so
adjacent pieces of the same material never line up into a shared pattern.

The samples are normalised by the largest one actually produced, so `amount`
means what it says — a ±12% swing whatever range Blender's Perlin happens to
return. The earlier form trusted the raw range and would silently become a no-op
after a version bump.

The same trap shaped the normal maps. Multiplying the raw finite difference by a
fixed constant appears to work: the map is written, it is seamless, it tiles. It
also produces a **blue channel pinned at 1.0**, because fBm sampled over a
512-pixel lattice changes by roughly a thousandth of a unit between adjacent
pixels, so the "strength" has to be in the hundreds to be visible at all. Caught
by reading the PNG back and printing the channel range — `B 0.992..1.000` means
every normal points at the viewer. `normal_map` now normalises by the measured
peak gradient, so `peak_slope` is a tangent at the steepest point on the map.

Tiling is verified directly rather than inferred: every octave is sampled at
`SIZE + 1` and compared against index `SIZE`, where the wrap actually falls. All
22 octaves return a wrap error of exactly 0.

### Islands have an underside

Each island was a 1.2-unit cylinder, which reads as a plate laid on the sky
rather than as ground that continues below the horizon. `buildCliff` gives
every region a tapering, eroded chunk instead, with a per-region radius wobble
so no two share a silhouette.

The profile's **second ring rises** before the rest fall away. The player
stands at y=0 with the camera above them, so a cliff that only ever descends
sits entirely below the eyeline and the island keeps a hard flat silhouette
against the sky — the first version of this geometry looked identical to the
cylinder it replaced, because everything it added was hidden.

It is also safe to be dramatic down there, and that is checked rather than
assumed. `navigation.ts` clamps the player to `radius - 1.2` with a further
1.1 margin, so across every radius in the catalog the furthest anyone can
stand is **94.9%** of the way out; the cliff starts at 95.5%. Walking hard into
the edge from the middle of the hub settles at 31.78 against a 31.67 ceiling.

The cliff is flat-shaded and carries no normal map. That is not a compromise:
it is the one surface whose faceting reads as rock, and a normal map on a
flat-shaded face would be contradictory anyway.

### The restored hub was a swimming pool

Restoring every region lays all seven spans at once, and every span starts at
the hub origin. Within ~20 units of the centre they therefore overlap — and
because the runner was 40% opaque with an emissive glow, seven of them compounded
into a solid turquoise sheet across the whole island that buried the Synthesis
Tree. The game looked completely different depending on how far the player had
got, which is not a state worth shipping.

Two things fix it, and neither is "lower the opacity":

- **The rails are inset** from the shared hub end. They mark where a span stops
  being walkable, and they were the largest offender: opaque, emissive, and
  running the full length of every span.
- **The runner fades in along its length** via an `alphaMap` ramp.

The ramp took three attempts, and every failure was invisible in the sense that
the code looked right and the render did not change at all:

1. The gradient was written to the **alpha** channel. three.js samples
   `alphaMap`'s **green** channel — writing only `.a` leaves the texture white
   to the shader, which reads as "fully opaque everywhere".
2. Even correct, it did nothing, because `alphaMap` only fades the **diffuse**
   contribution. **Emissive is added after lighting and multiplied by nothing**,
   so the glowing runner stayed at full strength regardless. The glow had to
   move to the rails, which are solid.
3. With both fixed the ramp was simply too short — it completed inside the
   stacked region. It now stays clear for the first third of the span.

The lesson generalises: when a visual fix changes nothing at all, suspect a
channel convention or a term that bypasses the mechanism, before suspecting the
geometry.

### Spans only cross the gap

Fading the runner treated the symptom. The cause was that every span was drawn
from the hub origin all the way to the region centre, when the only thing it has
to cross is the space between two islands. All seven lay inside the 34-unit hub
disc at once, and each one laid a twelve-unit slab across its destination island
— on ground the player can already walk on.

The geometry is now derived from the same two distances `navigation.ts` places
its landing pads at, five units past each shoreline, so the deck and the walkable
corridor agree:

```ts
const start = hub.radius - 5;
const end = length - (region.radius - 5);
```

For the Collective Gardens span that is 29 → 115, an 86-unit deck instead of 152.
With nothing overlapping any more, the `alphaMap` ramp is gone, the rails lose
their inset, and the runner can simply be a woven strip — which it now is:
matte, narrow, and in the same copper as the rail caps. A solid turquoise runner
down a pale stone path read as a swimming pool, which is the thing the previous
section was about in the first place.

Removing the rails' inset and the alpha ramp deleted `hubFade` outright: 42 lines
of `DataTexture` ramp and its three documented failure modes are no longer
needed, because the situation they existed for no longer occurs.

### The opening had an invisible bridge

Auditing the restored hub turned up something worse. On a fresh game the opening
walked the player across a bridge with **nothing drawn on it**.

`openRegionIds` deliberately counts the frontier region as open — without it the
first region would be unreachable — and `initNavigation` is built from that set.
But the renderer asked the question a second time, its own way, and its answer
omitted the frontier:

```ts
// Renderer, before:
const open = completedRegions.has(region.id) || reached;
// Navigation, all along:
openRegions.has(region.id)   // ...plus the frontier
```

Measured on a fresh save: **0 bridge decks drawn, 14 stubs**, while the frontier
corridor reported `offWalkableBy = 0` at 60, 90, 120 and 150 units along the
span — walkable air over the void. An invisible bridge is precisely what
`navigation.ts` says it refuses to be. The renderer now reads the same set, so
there is one answer to the question rather than two that can drift.

This is the shape of bug that a scripted playthrough cannot catch, because the
test drives progression state directly and never looks at what was drawn.

### Character animation

The Weaver is **rigged and animated in Blender**, not animated by hand-tweaked
bone code. `tools/blender/rig.py` builds a 17-bone skeleton, parents each of the
25 mesh parts to its bone (rigid, which suits a faceted low-poly doll), and
authors four clips on that one rig:

| Clip | Frames | Trigger |
| --- | --- | --- |
| `idle` | 72 | standing still — breathing and weight shift |
| `walk` | 24 | moving below sprint speed |
| `run` | 16 | holding Shift |
| `turn` | 20 | turning on the spot |

Because all four are authored on the same skeleton with matching foot-plant
positions, `src/world/Scene.tsx` cross-fades between them on player speed and
nothing pops. The weights are interpolated explicitly rather than through
`fadeIn`/`fadeOut`, which silently does nothing when an action already sits at
weight zero.

Walking (3.7 u/s) and sprinting (7.6 u/s) are genuinely different speeds, so
the walk and run clips are two different gaits rather than the same clip played
faster.

### The player character is a CC0 asset

The player character is **not** generated here. It is the `Mage` from
**KayKit — Adventurers Character Pack 1.0** by Kay Lousberg:

* Source: <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0>
* Licence: **CC0 1.0 Universal** — commercial use permitted, no attribution required
* Provenance: `public/models/ATTRIBUTION.md`

```bash
git clone --depth 1 https://github.com/KayKit-Game-Assets/\
  KayKit-Character-Pack-Adventures-1.0.git /tmp/ilm-assets/KayKit-Character-Pack-Adventures-1.0
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python tools/blender/adopt_character.py
```

`adopt_character.py` imports the source GLB, keeps only the locomotion clips the
player can reach, downsamples the 1024px atlas to 256px, and re-exports a single
GLB: **3.5 MB → 478 KB**, 76 clips → 5.

The source ships 76 clips; the game uses five, all from the same rig, which is
what keeps the motion consistent:

| Game state | Source clip |
| --- | --- |
| standing | `Idle` |
| walking | `Walking_A` |
| sprinting (`Shift`) | `Running_A` |
| turning left / right | `Running_Strafe_Left` / `Running_Strafe_Right` |

Weights are interpolated explicitly in `src/world/Scene.tsx` rather than via
`fadeIn`/`fadeOut`, which silently does nothing when an action already sits at
weight zero.

### Assets that were checked and rejected

Other candidates were looked at and ruled out on licence grounds, not taste:

| Asset | Clips | Licence | Verdict |
| --- | --- | --- | --- |
| Khronos `BrainStem` | several | **Poser EULA** | Rejected — redistribution restricted |
| three.js `Soldier.glb` | Idle, Run, Walk | **No licence file in the repo** (Mixamo-derived) | Rejected — terms unclear |
| three.js `RobotExpressive.glb` | 14 clips | **No licence file in the repo** | Rejected — terms unclear |
| Khronos `CesiumMan` | Walk only | CC-BY-4.0 + Cesium trademark | Too few clips, attribution burden |
| Khronos `Fox` | Survey, Walk, Run | CC0-1.0 | Clean, but it is a fox |

### World props are CC0 too

The regions are dressed with props adopted from **KayKit — Prototype Bits 1.0**
(CC0-1.0): pillars, wall segments, stairs, barrels, crates, pallets, cans,
worktables and beams.

```bash
git clone --depth 1 https://github.com/KayKit-Game-Assets/\
  KayKit-Prototype-Bits-1.0.git /tmp/ilm-assets/KayKit-Prototype-Bits-1.0
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python tools/blender/adopt_props.py
```

Fourteen props merge into one 134 KB GLB. `src/world/Props.tsx` turns each child
mesh into an instanced mesh and scatters it deterministically per region, clear
of the landmark in the middle. About 180 placed objects across seven regions cost
fourteen draw calls.

Grounding happens at load time, not in the file: the glTF exporter writes the
source mesh data verbatim and drops a per-prop offset, so several models would
have been buried up to half their height. `Props.tsx` lifts each geometry by its
own bounding box and centres it on its footprint instead.

### Assets degrade, they do not break

`src/world/Models.tsx` loads every model through an error boundary and a
Suspense fallback. If a GLB is missing or unreadable the game renders the
procedural equivalent from `src/world/World.tsx` instead — the look softens,
but play never stops. The puzzle state colour of a console lives in code rather
than in the model, precisely so it can keep reacting to progress.

---

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Hareket / Move | `W A S D` or arrow keys | Virtual stick (bottom-left) |
| Bak / Look | Drag anywhere in the scene | Drag anywhere in the scene |
| Etkileşim / Interact | `E` | `E` button (bottom-right) |
| Sıçra / Jump | `Space` | `↑` button |
| Koş / Sprint | Hold `Shift` | — |
| Aleti değiştir / Switch tool | `Q` | Tap the tool bar (2×2, above the stick) |
| Ana merkeze dön / Go home | `H` | `⌂` button (bottom-right) |
| Bulmacayı sıfırla / Reset puzzle | `R` | `Bulmacayı sıfırla` |
| Duraklat / Pause | `Esc` | `Duraklat` |

Language switches instantly between **TR** and **EN** from the main menu, the
pause menu, the settings screen and the in-game HUD. A first visit defaults to
Turkish; later visits restore the chosen language. Switching language never
touches progression or the puzzle currently open.

---

## How the game is put together

| Layer | Location | Responsibility |
| --- | --- | --- |
| Puzzle systems | `src/systems/` | Six pure, deterministic, testable engines |
| Catalog | `src/catalog/` | 33 typed application records + region art direction |
| Game rules | `src/game/` | Stages, lessons, labels, progression, save/load, input, audio, store |
| Rendering | `src/world/` | Procedural geometry, player, camera, interaction, lighting |
| Interface | `src/ui/` | Menus, HUD, journal, puzzle panel, endings |
| Localisation | `src/i18n/` | Central TR/EN dictionaries with compile-time key parity |

Six reusable systems — **connection, placement, allocation, perception,
evidence, prediction** — express all thirty-three applications by varying
rules, layouts and combinations rather than building thirty-three engines.

Gameplay logic never reads translated text: systems manipulate ids and numbers
only, so switching language cannot change a single puzzle outcome.

### The teaching layer

A stage already says what to do (`objective`) and where to start (`prompt`).
What it does not say is the thing worth taking away, so `src/game/lessons.ts`
gives **every one of the 28 stages** four bilingual fields:

| Field | What it is |
| --- | --- |
| `principle` | The transferable idea, in one sentence |
| `misconception` | The tempting belief the stage is built to punish |
| `firstMove` | One concrete action that is *not* the answer |
| `hints` | Three escalating nudges, replacing the old generic hint tiers |

`misconception` is the one that matters. Naming the trap — "the widest lane does
not finish the loom, it waits for the slowest arm" — is what turns a solved
puzzle into a corrected belief. It is also what a failed attempt shows: the
failure line now reads **why**, not just what went wrong.

Three consequences in the panel:

- The **lesson card** opens with the board and can be collapsed to a single line,
  but collapsing keeps the idea on screen rather than hiding it.
- **Hints are stage-specific.** The previous three tiers ("Look here." / "Try
  this next.") were shared by all 28 stages and taught nothing.
- **Solving does not close the panel.** It swaps the board for a debrief naming
  the idea applied, the mistake punished, the fault that was actually there,
  and a link to the real application the stage stands for.

`src/game/labels.ts` is the other half. The systems work in stable ids — a stage
is solved by matching `arm-2` to `warp-c` — but a player should never *read*
those. Every id reachable from stage data is given a bilingual name there, in
one dictionary kept deliberately separate from `stages.ts`, so the interface can
improve without moving a single evaluator, solver or test contract.

### The vocabulary layer

A lesson teaches an idea without naming what the subject calls it. A player can
finish the loom stage understanding lane balance and never be told that
*makespan* is the word for it — the concept is taught, the language is withheld,
and the lesson does not survive leaving the game.

`src/game/terms.ts` closes that gap. For **each of the 33 applications** it
carries four terms from that application's own field, each bilingual:

| Field | What it is |
| --- | --- |
| `term` | Canonical spelling the field uses, left untranslated |
| `meaning` | What it means, stated without jargon |
| `inWorld` | Where the player has already met it in this world |

That is 132 terms, so every topic in the catalog has real vocabulary attached to
it rather than a metaphor and a source link. The definition is the teachable
part: *occupancy* alone teaches nothing, while "how much of the machine you
actually managed to keep busy" is the same fact in a form a player can carry to
the source application.

Terms surface in two places, on purpose:

- **In the lesson card**, under the stage's real-world counterpart, so the word
  arrives at the moment the idea does. The lesson shows the definition only — it
  sits under the board and the player is about to play.
- **In the journal entry**, with the world line as well, because the journal is
  the surface a player *re-reads* rather than acts from.

The `term` string stays in the field's own spelling on purpose. Turkish prose is
written as Turkish — the same rule the lessons and Spark follow, and
`tests/terms.test.ts` fails on any entry whose Turkish column is a copy of the
English one. But `kernel`, `warp` and `prefill` are not translated in Turkish
technical writing either, and translating them would break the lookup back to
the source rather than enable it.

### The six systems

- **Bağlantı / Connection** — flow propagation across compatible nodes. A relay
  forwards only its own capacity, so adding width past a narrow node buys
  nothing.
- **Sıralama / Placement** — ordering steps that depend on each other. The
  evaluator names the *first* step that broke, which is what makes "follow the
  execution trail and repair the failed step" a learnable mechanic.
- **Dağıtım / Allocation** — placing work onto lanes with slots, setup cost,
  delay and tolerance. Each used lane pays a setup once; idle capacity is waste.
- **Algı / Perception** — what a lens can and cannot show. Occluders hide what is
  behind them, depth collapses in poor light, and the motion lens needs two
  observations before it can compare anything.
- **Kanıt / Evidence** — capacity-limited context where *freshness* and
  *correctness* are deliberately separate fields, plus council consensus reported
  as agreement rather than truth.
- **Tahmin / Prediction** — models, previews and an honest comparison against
  what actually happened. Predictions are useful and fallible.

---

## The thirty-three applications

Every entry below has a recognisable in-world representation, a player action, an
observable effect on the world, a bilingual journal entry and a link to the
real source application. These are **creative gameplay adaptations**; they are
not claims that the source websites contain these mechanics.

INF, NXT and STK are absent from all gameplay, equipment, journals and links.


### The Cartographer's Terrace — Haritacının Terası

| Code | System | Stage | Source application |
| --- | --- | --- | --- |
| `AIA` | Bağlantı | `r1-scout-match` | [aia.aserdargun.com](https://aia.aserdargun.com/) |
| `POL` | Sıralama | `r1-equivalent-bridges` | [pol.aserdargun.com](https://pol.aserdargun.com/) |

### The Flow Foundry — Akış Dökümhanesi

| Code | System | Stage | Source application |
| --- | --- | --- | --- |
| `GPU` | Dağıtım | `r2-loom-distribution` | [gpu.aserdargun.com](https://gpu.aserdargun.com/) |
| `GEX` | Dağıtım | `r2-loom-distribution` | [gex.aserdargun.com](https://gex.aserdargun.com/) |
| `LLM` | Dağıtım | `r2-chamber-routing` | [llm.aserdargun.com](https://llm.aserdargun.com/) |
| `TFL` | Sıralama | `r2-caravan-schedule` | [tfl.aserdargun.com](https://tfl.aserdargun.com/) |

### The City of Memory and Council — Hafıza ve Meclis Şehri

| Code | System | Stage | Source application |
| --- | --- | --- | --- |
| `HNS` | Sıralama | `r3-task-sequence` | [hns.aserdargun.com](https://hns.aserdargun.com/) |
| `ARL` | Sıralama | `r3-task-sequence` | [arl.aserdargun.com](https://arl.aserdargun.com/) |
| `DPL` | Tahmin | `r3-junction-choice` | [dpl.aserdargun.com](https://dpl.aserdargun.com/) |
| `CUL` | Tahmin | `r3-junction-choice` | [cul.aserdargun.com](https://cul.aserdargun.com/) |
| `AOS` | Kanıt | `r3-worker-supervision` | [aos.aserdargun.com](https://aos.aserdargun.com/) |
| `AGR` | Kanıt | `r3-council-chamber` | [agr.aserdargun.com](https://agr.aserdargun.com/) |
| `CTX` | Kanıt | `r3-context-lantern` | [ctx.aserdargun.com](https://ctx.aserdargun.com/) |
| `MEM` | Kanıt | `r3-context-lantern` | [mem.aserdargun.com](https://mem.aserdargun.com/) |
| `SEC` | Bağlantı | `r3-permission-seals` | [sec.aserdargun.com](https://sec.aserdargun.com/) |
| `EVL` | Bağlantı | `r3-permission-seals` | [evl.aserdargun.com](https://evl.aserdargun.com/) |

### The Adaptation Workshop and Cloud Harbor — Uyarlama Atölyesi ve Bulut Limanı

| Code | System | Stage | Source application |
| --- | --- | --- | --- |
| `USL` | Dağıtım | `r4-example-patterns` | [usl.aserdargun.com](https://usl.aserdargun.com/) |
| `ADP` | Dağıtım | `r4-module-fit` | [adp.aserdargun.com](https://adp.aserdargun.com/) |
| `LCL` | Dağıtım | `r4-route-choice` | [lcl.aserdargun.com](https://lcl.aserdargun.com/) |
| `CLD` | Dağıtım | `r4-route-choice` | [cld.aserdargun.com](https://cld.aserdargun.com/) |
| `DCL` | Dağıtım | `r4-route-choice` | [dcl.aserdargun.com](https://dcl.aserdargun.com/) |

### The Collective Gardens — Kolektif Bahçeler

| Code | System | Stage | Source application |
| --- | --- | --- | --- |
| `SWI` | Dağıtım | `r5-trail-routing` | [swi.aserdargun.com](https://swi.aserdargun.com/) |
| `ANT` | Dağıtım | `r5-trail-routing` | [ant.aserdargun.com](https://ant.aserdargun.com/) |
| `BEE` | Dağıtım | `r5-dance-floor` | [bee.aserdargun.com](https://bee.aserdargun.com/) |

### The Observer's Mirrors — Gözlemcinin Aynaları

| Code | System | Stage | Source application |
| --- | --- | --- | --- |
| `VIS` | Algı | `r6-lens-layers` | [vis.aserdargun.com](https://vis.aserdargun.com/) |
| `CVL` | Algı | `r6-lens-layers` | [cvl.aserdargun.com](https://cvl.aserdargun.com/) |
| `WFM` | Tahmin | `r6-passage-model` | [wfm.aserdargun.com](https://wfm.aserdargun.com/) |
| `WML` | Tahmin | `r6-counterfactual` | [wml.aserdargun.com](https://wml.aserdargun.com/) |

### The Valley of Living Machines — Yaşayan Makineler Vadisi

| Code | System | Stage | Source application |
| --- | --- | --- | --- |
| `ITL` | Tahmin | `r7-water-model` | [itl.aserdargun.com](https://itl.aserdargun.com/) |
| `PDT` | Tahmin | `r7-pump-diagnosis` | [pdt.aserdargun.com](https://pdt.aserdargun.com/) |
| `DTR` | Tahmin | `r7-two-options` | [dtr.aserdargun.com](https://dtr.aserdargun.com/) |
| `ENG` | Sıralama | `r7-helper-design` | [eng.aserdargun.com](https://eng.aserdargun.com/) |
| `HEX` | Sıralama | `r7-helper-design` | [hex.aserdargun.com](https://hex.aserdargun.com/) |

Stages: 28 | apps: 33

### Cross-region puzzles

Three puzzles deliberately share real game state across regions:

| Stage | Combination |
| --- | --- |
| `cross-x1` — *From Leak to Pump* | VIS reveals the leak → ANT carries material through the narrow way → PDT restores the pump |
| `cross-x2` — *The Outdated Record* | MEM catches the stale record → WML compares the alternatives → DPL waits for the evidence |
| `cross-x3` — *The Timely Signal* | TFL improves the flow → DCL places the workload → HEX delivers the signal in time |

They unlock only once the regions they draw from are actually finished, and the
finale additionally requires all three.

---

## Interface

The interface is built on one token set: a midnight ground, warm ceramic text,
and a turquoise accent reserved for live state, with coral used sparingly so it
keeps meaning "interact". Surfaces are glass rather than solid panels, so the
world stays visible and slightly blurred behind every menu.

Every screen is keyed on its identity, so switching remounts it and its enter
transition runs — a short fade with a slight lift. There is no separate
transition controller to keep in sync with the router.

Details that carry weight:

- Buttons carry a sheen that sweeps on hover and lift by a pixel.
- The journal shows progress as a ring, not just a number, and locked entries
  render compact so they do not reserve the space a full entry needs.
- Scrollbars are themed; the default one is far too bright against this ground.
- Puzzle verdicts use shape (`●` / `○` / `?`) and border style, never colour
  alone.
- `prefers-reduced-motion` collapses every animation and transition, including
  the hover lift.

## Accessibility and comfort

- Visible focus states on every interactive control; all menus are keyboard
  operable.
- Shape as well as colour: puzzle verdicts use `●` / `○` / `?` alongside their
  colour coding, and cells differ by border style.
- Reduced motion is honoured from the OS preference and can be toggled in
  settings; it removes camera drift, walk bobbing and Spark's idle motion.
- Graphics quality (low / medium / high) and resolution scale are adjustable.
- Progressive hints in three tiers: direct attention, the relationship, then a
  concrete next action.
- Audio starts only after a real user gesture, and can be muted entirely.
- If WebGL cannot initialise, a readable fallback explains what to do instead of
  failing silently.

---

## Tests performed

`npm run test` — **237 tests across 17 files, all passing.**

| Suite | Tests | What it proves |
| --- | --- | --- |
| `connection` | 8 | Flow propagation, relay bottlenecking, cyclic graphs terminate, incompatible kinds never conduct |
| `placement` | 7 | Ordering, first-failed-step reporting, missing/duplicate steps, two spellings of one behaviour |
| `allocation` | 13 | Lane capacity, kind mismatch, unassigned work, setup cost, trail evaporation, shared-information delay |
| `perception` | 7 | Motion baseline requirement, low-light depth failure, occlusion, budget, weighted uncertainty |
| `evidence` | 15 | Lantern capacity and crowding, stale vs incorrect records, false consensus, observe-act-verify, worker lifecycle |
| `prediction` | — | Exercised through `stages` and `playthrough` |
| `lessons` | 14 | **Every stage has a complete bilingual lesson**, three distinct hints per stage, Turkish never copies English, hint tiers clamp, and **every player-visible id is named** |
| `terms` | 16 | **Every one of the 33 applications carries four terms**, both languages written, Turkish never copies English, and the lesson card actually renders them |
| `catalog` | 16 | Exactly 33 codes, INF/NXT/STK absent, every URL verified, both languages complete, catalog ⇄ stage agreement, progression reachability |
| `stages` | 31 | **Every one of the 28 stages is provably solvable**, none starts solved, each yields exactly its application codes |
| `playthrough` | 8 | The whole journey runs through the real store and finishes |
| `save` | 19 | Schema validation, corrupt/version recovery, reconciliation, language independence |
| `i18n` | 11 | Key parity, no empty strings, no untranslated prose, Turkish diacritics |
| `nav` | 8 | Walkable world, island discs, span crossing, boundary containment |
| `touch` | 27 | Staff strip clear of the sightline, home button, pointer capture, tap targets sized for a phone |
| `audio` | 12 | Chord voicing has a third, tremolo depth is proportional, no phase inversion, headroom |
| `spark` | 20 | Every moment line exists in both languages and reaches the player |
| `playtime` | 5 | The stated playtime estimate is derived, not guessed |

Two real defects were found and fixed by these tests during development: an
occlusion check that looked *behind* a cell instead of in front of it, and a set
of fault signatures under which one diagnosis could never be isolated. A third
came from `lessons`: `hintFor` returned `undefined` for tier `0`, so a stale save
asking for the weakest hint would have been shown nothing. A fourth came from
`terms`: the first draft carried English prose in the Turkish column of 128
entries — invisible to any check that only counted keys.

### Playability

`tests/playthrough.test.ts` drives the **real store** — the same actions the
interface calls — through the whole journey and asserts it can be finished:

- every one of the 28 stages plus the three cross-region puzzles and the finale
  completes in world order
- regions unlock strictly in sequence; region I stays locked until the opening
  is solved, and region III stays locked until region II is restored
- a region is marked restored only when all of its stages are done
- the cross-region puzzles stay locked until the regions they draw from are
  genuinely finished
- the finale stays locked until every region *and* every cross puzzle is done
- reaching into a later region early is refused, not silently accepted
- all 33 applications are discovered across the run
- the finished journey reloads correctly from the save

The full suite is 237 tests across 17 files.

Measured in the browser through the real interface, not simulated:

| Check | Result |
| --- | --- |
| Opening puzzle, start to solved | 4.15 s scripted; longer for a human reading the objective |
| Prediction stage (pump diagnosis) solved via the panel | 2.41 s |
| Evidence stage (council chamber) solved via the panel | seats and shared assumption both actionable |

### Staying on the road

The regions are separate islands with open sky between them, so
`src/world/navigation.ts` defines the walkable world: every island disc plus
**only the spans that have actually been built**. A position outside that set
is pulled to the nearest point inside it.

Three things this had to get right, each found by testing rather than by
reasoning:

- **Spans mirror the world.** An invisible bridge is not a road. Navigation is
  rebuilt from the same set that decides which bridges are drawn.
- **The frontier span is always laid.** Without this the opening puzzle left
  every bridge unbuilt, while the bridge to the first region required a stage
  completed *inside* that region — a deadlock.
- **Junctions need landing pads.** The union of a disc and a corridor has a
  concave corner, and a player walking diagonally into it gets wedged against
  an invisible edge. Each span now has a pad where it meets an island.

Bridge rails are emissive turquoise, so the boundary the player is stopped by is
never invisible.

### Wayfinding

`src/game/objective.ts` is the single source of truth for "where next", shared
by the HUD compass, the in-world beacon and the reachability test — three
copies of that rule had already drifted apart. The compass shows a needle, the
straight-line distance and the region the objective sits in.

Verified in the browser: with no spans built, sprinting from the hub rim in
every direction stops the player at radius 32.6 against an island radius of 34;
after the opening, the player crosses the terrace span and arrives at 38 units
from its centre.

### Collision

Everything solid in the world registers a disc in `src/world/collision.ts`:

| Source | Count | Notes |
| --- | --- | --- |
| Scattered props | 137 | one per placed instance, footprint taken from its own geometry |
| Region landmarks | 8 | trunk, loom, podium, workshop, terraces, mirror plinth, pump |
| Stage consoles | 28 | the player cannot stand inside a console |
| Boulders | 112 | larger rocks only; small scatter stays walkable |

The player is pushed out of the union each frame, with two passes so a single
push cannot leave them inside a neighbouring disc. Colliders carry a height so
the third-person camera only dodges geometry taller than its own 3.4-unit ride
height — walking between two waist-high pillars no longer yanks the camera in.

Measured in the browser:

- Dropping the player onto the centre of four different landmarks ejected them
  to exactly `radius + player radius` in every case (10.05 vs 9.5, 7.55 vs 7,
  7.05 vs 6.5, 3.95 vs 3.4).
- Walking through four prop-dense regions produced **zero penetration** across
  16 movement samples against 189 colliders.

### Performance

Measured on the **production `dist/` build** in Chromium via DevTools, sampling
real `requestAnimationFrame` deltas after all assets had streamed in.

| Environment | Viewport | Result |
| --- | --- | --- |
| Desktop, Apple M4 Pro, high tier | 2880×1610 @ DPR 1 | **111 FPS** on a bridge span, 108.5 in the restored hub |
| Desktop, Apple M4 Pro, medium tier | 2880×1610 @ DPR 1 | **104 FPS** |
| Desktop, Apple M4 Pro, low tier | 2880×1610 @ DPR 1 | **112 FPS** |
| Mobile emulation, low tier | 390×844 @ DPR 3 | **110 FPS**, drawing buffer capped to 487×1055 |
| Desktop, high tier, 1298×805 @ DPR 2 | 1298×805 @ DPR 2 | **120 FPS**, worst frame 9.4 ms |
| Desktop, walking with collision | 1298×805 @ DPR 2 | **120 FPS**, worst frame 10.4 ms |

The triplanar detail map costs three texture samples per fragment on stone
surfaces and is applied at every tier. Trimming the bridge decks to the gap
they actually cross also removed about 40% of their geometry and the overdraw
from seven overlapping decks, which is where the high tier gained the most: it
went from 97 FPS to 111 on a span. Frame
rate was also sampled in three different regions (hub, council city, flow
foundry) at 109–111 FPS in the dev build; the heaviest prop-dressed region is
within 1 FPS of the emptiest. Roughly 1,500 instanced objects across 17
instanced meshes keep the draw-call count low.

Hardware string as reported by WebGL:
`ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro)`.

### Playtime

`tests/helpers/playtime.ts` derives the estimate rather than guessing it:

- **Travel** comes from the real world coordinates of every stage console
  divided by the real walk (3.7 u/s) and sprint (7.6 u/s) speeds in the code.
- **Puzzle time** comes from counting the interactions each solver actually
  performs, times a stated per-interaction cost (6.5 s to read and think,
  1.1 s per action).

| Component | Estimate |
| --- | --- |
| Travel between consoles | 6.3 min |
| Puzzle interaction | 6.0 min |
| **Total main route** | **12.3 min** |

**This is below the 20–35 minute design target, and that gap is real.** The
model is if anything generous — it assumes an optimal path, no wrong attempts
and no exploration — but even doubling the pacing assumptions lands near 20
minutes. A first-time player will take longer because of reading the journal,
backtracking and wrong guesses, but the honest reading is that the route is
short of the target and would need more content, not more polish, to reach it.

## Known limitations

Reported honestly rather than presented as finished:

1. **The main route is short of its target.** Measured at ~12.3 minutes against
   a 20–35 minute target. Completeness is proven by tests, but the game is
   thin: reaching the design target means more stages or deeper ones.
2. **The playthrough is automated, not human.** The full journey is driven
   through the real store and real interface, and three representative stages
   were played by hand-scripted input in the browser. Nobody has sat and played
   it start to finish, so the feel of the pacing is unverified.
3. **Puzzle interaction is panel-based.** Traversal, world reaction and
   environmental transformation happen in 3D, but the puzzles themselves are
   resolved in an overlay panel rather than by manipulating 3D objects directly.
   This is a deliberate readability and precision trade-off.
4. **Regions are visible but lightly dressed.** All seven landmarks exist and
   every region is reachable, but interior detail is procedural and lighter than
   the hub's.
5. **Voice is text-only.** Spark uses short authored lines with deterministic
   behaviour; there is no speech synthesis or voice acting.
6. **Audio is a synthesised ambient pad, not a score.** Every voice is tuned to
   one chord (root, fifth, octave, twelfth) and passes through a lowpass and a
   generated reverb; each restored region adds one more voice. There is no
   melodic writing, no recorded sound and no adaptive scoring.
7. **Source-application descriptions are quoted verbatim** from the published
   pages, so the journal's factual descriptions retain those sites' own wording
   about hardware and pricing. Gameplay itself uses only fictional units and
   claims no real prices, benchmarks or training.

---

## Licence and scope

ILMEK is an original game. Every region is a playable adaptation of a public
application by Aserdargun; the applications themselves remain the property of
their author and are linked, not reproduced. Completing the game never requires
leaving it, and external links open only on deliberate player action in a new tab.
