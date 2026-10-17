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

**Auditing what is actually deployed.** Two things make production awkward to
inspect, and both have cost time:

- **There is no `__ilm` hook on the deployed build.** Every scene-graph probe used
  in this README — `__ilm.audit()`, instance counts, world positions — is
  development-only, so none of them can be re-run against the live site. Those
  questions have to be answered against `npm run dev`, and the deployed bundle
  confirmed separately by comparing hashes.
- **World state cannot be reached on the live site.** The canal does not exist
  until the opening connection is made, the bridges are not laid until their
  regions are restored, and a finished console hides its own plinth by design
  (`visible={!done}`). Everything else in this README that describes a restored
  world was looked at in dev with the progression set directly; the live site can
  only confirm that it loads without errors and serves the right bytes.

What production *can* be checked for cheaply, and should be: that every asset it
serves is byte-identical to the one in `public/`, and that the console is clean.
At the last audit `water_normal.png` came back at 108,572 bytes, matching the
file exactly, and the only console message on the live build is three.js's
`THREE.Clock` deprecation notice.

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
| `tools/blender/measure_texture.py` | Measures texture anisotropy without Blender |
| `tools/measure_frame.py` | Compares two rendered frames, and refuses incomparable ones |

Eleven files are downloaded, about 1.4 MB in total: the Weaver, the puzzle
console, a landmark for each of the eight regions (the hub's is the Synthesis
Tree), and the props GLB. Most of the growth over the original set is baked
vertex AO.

Two more sit in `public/models/` and are not on that list: `spark.glb` (22 KB)
and `tapestry.glb` (16 KB). Both are build artefacts of the Blender scripts and
neither has a reader — they are kept because the scripts that produce them are
kept, and the loader lists decide what the game actually fetches.

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
`ToneMapping` effect maps the final frame instead — set to **ACES Filmic**, which
was chosen over AgX on measurement. See "The tone curve was the thing washing the
world out" below.

The module is **loaded lazily**. The low tier renders none of these effects, so
it should not download their ~162 KB of shader code. Splitting them out kept
the main bundle at 440 KB gzipped instead of the 596 KB it would otherwise be.

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
| `water_normal.png` | Canal ripples; integer wave numbers so the tile does not seam |

**All eight discs audited.** The discs carry their large-scale variation in vertex
colours rather than in a texture, so "is this island flat" is a question about
those attributes. Measured on the running build, per island's top surface:

| island | distinct colours | luminance range | as % of mean | sd |
| --- | --- | --- | --- | --- |
| hub | 458 | 0.185 | 61.4% | 0.043 |
| cartographers-terrace | 505 | 0.186 | 59.7% | 0.039 |
| flow-foundry | 451 | 0.145 | 63.4% | 0.030 |
| memory-council-city | 532 | 0.182 | 62.8% | 0.036 |
| adaptation-cloud-harbor | 541 | 0.170 | 65.2% | 0.033 |
| collective-gardens | 629 | 0.223 | **81.2%** | 0.042 |
| observers-mirrors | 577 | 0.230 | 60.7% | 0.053 |
| valley-living-machines | 523 | 0.144 | 75.8% | 0.028 |

There is no outlier: the flattest island is 59.7% and the fullest 81.2%, and the
standard deviations do not trend with radius the way a resolution shortfall would.
Mean luminance does vary a lot — 0.190 on the valley against 0.378 on the mirrors
— and that is the declared palettes, not a defect.

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

**The generator was under-reporting its own relief by exactly half.** The build
prints a `peak_tilt` for each normal map, and the check next to it is written in
the wrong units: the blue channel is stored as `nz * 0.5 + 0.5`, so `|B - 1|` is
half the tilt and cannot be compared with the `peak_slope` that produced it. It
was printing 0.071 for a soil map asked for a slope of 0.6 and 0.137 for a stone
map asked for 0.95 — the true values are 0.143 and 0.275, which is what
`1 − 1/√(1 + slope²)` gives. Nothing was wrong with the maps; the instrument was
wrong, and it was wrong in the direction that hides a problem: halving
`peak_slope` would have printed a number that still looked healthy. The log now
decodes the channel back and prints the requested slope next to the measured
one, and a roughness map — which has no normal in it — no longer gets a tilt
printed at all. The PNG checksums are identical before and after, which is the
proof that only the reporting moved.

**A negative result worth keeping.** The ground also shows a fine directional
streak up close that reads a little like brushed metal, and the obvious suspect
is a normal map with directional bias in it. It is not. `tools/blender/
measure_texture.py` measures the anisotropy of a field via the structure tensor
of its gradient, and stubs `bpy` so the generators can be imported without
Blender. Both height fields come out near-isotropic — 0.015 for the soil and
0.061 for the stone, with gradient energy spread across orientation bands at
1.17× and 1.10× of a uniform field. The first measurement suggested otherwise
(0.30 anisotropy, 18.7% of the energy in one 15° band) and was simply wrong: it
took the gradient of the gradient of the normal vector field. The tool exists so
that the next person asks the map rather than the screenshot.

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

### The ground had 66 vertices

Measured on the running build, not guessed: the terrain disc was a
`CircleGeometry(radius, 64)`, which is a **fan** — one centre vertex and a single
rim ring. A 68-unit disc with 66 vertices puts a wedge about 3.3 units wide at
the rim, and more to the point the colour could only vary *angularly* and never
*radially*. Every colour feature the ground's noise was capable of expressing
below that width simply could not appear, however the colour was computed.

`buildDisc` now builds concentric rings — 96+ segments scaled to the radius, 12
rings — which is what lets the ground carry the 12- and 7-unit wavelengths it
never had the vertices for. The winding is *measured* rather than assumed: the
triangles are built in one order and the resulting average normal is checked,
because getting it backwards makes the entire disc invisible from above with no
other symptom. Cost is 64 triangles per island becoming 2,806, which is noise.

The island undersides had the same class of problem. `buildCliff` sums the 3rd,
7th and 11th harmonic for its erosion, drawn at 44 sectors — four samples per
cycle on the shortest one, which aliased into a beat pattern that had nothing to
do with the intended silhouette. At 96 sectors the 11th harmonic gets 8.7
samples.

### The hub's floor was striped by a shadow

With the ground finally readable, a radial starburst appeared across it that
looked exactly like a colour artefact. It was not. Flipping `castShadow` off on
the sixteen aqueduct segments and re-shooting removed every band, which
identified the cause: sixteen slabs hanging 24–31 units over the hub, throwing
shadows onto the one piece of floor the player always spawns on.

A decorative sky structure casting a meaningless pattern over the spawn point is
clutter rather than depth, so they no longer cast. It was also worth more than it
looks: sixteen large shadow casters inside a 46-unit shadow extent is real cost.

### Painting state onto a model

The tapestry could not be rescued by editing its GLB, so it was rebuilt. The
tree could, and the difference is worth stating: **paint the model rather than
replace it.**

`Scene.tsx` claims the opening connection "turns the tree's first branch". It
did not. `SynthesisTree`'s only `restored`-dependent property is the colour and
emissive of its eight branches, and the hub renders the model with that
component as the `Suspense` fallback — so the beat was visible for the fraction
of a second the GLB took to download, and never after.

`synthesis_tree.glb` is a single mesh split into three primitives — copper
trunk, copper rings, ceramic crown — and the crown (y 13.0–17.4) is a mesh in
its own right, which means it can be lit in place. `Asset` gained a `paint`
callback for exactly this: called on load and again whenever `paintKey` changes,
which is how the rest of the codebase already handles a model that carries
static geometry next to state-driven geometry.

Verified in the running build, and verified in both directions:

```
before the opening   emissiveIntensity 0
opening completed    emissiveIntensity 0.55
progression reset    emissiveIntensity 0
```

The third line is the one that matters. A painter that only ever turns things on
is not a painter, it is a latch.

`StageConsole` had already solved this properly — the plinth is the GLB, and the
puzzle-state mark stays in code and changes colour with the puzzle — which is
why the tree follows the same shape rather than inventing a new one.

### The sky finally knew where the sun was

The sky dome was the largest surface in every frame — around 40% of the pixels —
and it was a three-stop gradient with no information in it at all. Meanwhile
`environment.ts` places the IBL's sun disc on `SUN_DIRECTION` and the key light
shines along that same vector, so the shadows had been saying "warm light from
up and to the right" while the backdrop the player is looking past said nothing.

The dome now takes the same constant, so the three agree by construction rather
than by coincidence:

```glsl
float sun = max(dot(d, normalize(uSun)), 0.0);
colour += uSunColour * (pow(sun, 90.0) * 0.9 + pow(sun, 6.0) * 0.1);
```

A tight core and a wide warmth around it, in the key light's own colour.

It also has high cloud now — four sine terms over the view direction rather than
a noise function. It is continuous everywhere, needs no texture, and costs a
handful of ALU on the one surface that never writes depth, which is why this is
in the shader instead of in a second PNG. It is masked to sit above the horizon
and to fade out before the zenith, at deliberately low contrast: this is
atmosphere, not a weather system.

### An unused model, and a misleading one

`spark.glb` was in the preload list and nothing ever loaded it — `Spark` in
`Scene.tsx` is built entirely from primitives. That cost 22 KB of download for
a file with no reader, and the worse part was its presence in `CREATURE_MODELS`,
which implied to the next reader that the companion was a GLB being kept away
from the stone detail pass. It is procedural, flat-shaded and 0.26 units across.

Declared models are now cross-checked against rendered ones: `weaver`,
`synthesis_tree` and `console` are named directly, and the other seven come from
`LANDMARK_MODELS`. `ALL_MODEL_NAMES` was carrying two names that matched neither.

### A note on reading these screenshots

One thing that cost real time this round: the tapestry panels *look* lit in a
fresh save, because the ceramic picks up the scene's strong turquoise rim light
and reads teal. Measured, it was `regions: []`, `stages: []`, and 0 of 14 panels
lit. The eye was wrong and the number was right — the same trap as the radial
banding in an earlier turn, and the reason each of these claims is a count.

### The tapestry had never actually been weaving

The tapestry is the game's central feedback device: "its woven panels brighten
one by one as regions are restored". It was not doing that, for two independent
reasons stacked on top of each other.

The drawn version was `tapestry.glb`, and that file is **one mesh** with two
materials and **no emissive channel**. There is nothing in it to light panel by
panel — the panels are not addressable at all.

The procedural version, which does have the panel-by-panel logic, was still in
the file and still being passed a count. It just was not on screen: it appeared
only as the `Suspense` fallback while the GLB downloaded, and then a second
time in a `<UnfinishedTapestry visible={false}>` that never rendered. So the
mechanic was present twice and visible for a fraction of a second.

And even then it would not have worked. The rule was

```ts
const lit = i / panels.length < restoredCount / 7;
```

— a ratio against the region total rather than a count — fed `restored ? 14 : 0`,
which is all-or-nothing by construction. The call site passes a boolean, because
`Landmark` was only ever given `restored`, so the number of regions restored
never reached the component at all.

Fixed by inverting the flow: the scene passes `completedRegions.size * 2`, the
panels light strictly left to right, and the tapestry is built from primitives
so it has something to light. Measured in the running build at three regions
restored:

```
x: -22.1 -18.7 -15.3 -11.9  -8.5  -5.1 | -1.7   1.7   5.1   8.5  11.9  15.3  18.7  22.1
   LIT  LIT  LIT  LIT  LIT  LIT  | dark dark dark dark dark dark dark dark
   #3fb6c8 × 6                      | #e2d6c2 … #eae2d3 × 8
```

The rule now lives in `src/world/tapestry.ts` with no React or three.js in it,
so `tests/tapestry.test.ts` can pin it. That suite includes the check that
matters for the next change someone makes: `TAPESTRY_PANELS / PANELS_PER_REGION`
must equal the number of non-hub regions, so adding an eighth region fails the
build until the tapestry grows with it.

`tapestry.glb` is no longer rendered and has been dropped from the preload list.
The file stays on disk because it is a build product of
`tools/blender/landmarks.py`.

### 1,408 objects, one colour each

At the time of that round the ground scatter was three instanced meshes — 208
boulders, 720 pebbles, 480 grass tufts, 1,408 in total — and every one of them
was rendering in a single flat colour. The totals have since changed (see "The
scatter gave every island the same number"); the defect described here was in
the colour path, and both are independent.

`buildInstances` computed a per-instance tint for all 1,408 of them. Then:

```js
if (!mesh.instanceColor) return;
for (let i = 0; i < colors.length; i += 1) mesh.setColorAt(i, colors[i]);
```

`setColorAt` is the call that *allocates* `instanceColor`. Guarding on the
attribute being non-null before calling it means the guard permanently blocks
the only thing that could ever set it. Measured after the fix, on that round's
counts: **200 distinct colours across 208 boulders**, 640 across 720 pebbles,
382 across 420 tufts.

This is the same shape of bug as the invisible opening bridge — a guard that
prevents the action which creates the thing it is guarding — and it is the kind
that no assertion catches, because the state before and after is "some colours
were computed" either way.

The tint base also had to move. `buildInstances` hardcoded a sandstone base and
a brown dark, which is right for boulders and turns green grass into mud, so it
now derives the dark end from whatever colour the material actually uses. The
pebble colour became a named constant shared between the material and the
scatter so the two cannot drift apart.

### Rocks that sit on the ground

The same three meshes had `castShadow` off, so 1,408 scattered objects floated
with nothing underneath them — visible immediately as boulders with a visible
gap under them. Boulders and pebbles now cast; grass does not, because a thin
double-sided cone's shadow is a hard speck rather than form and it is the
largest of the three groups.

Measured cost at 3.55 MP with all three toggling, worst case **104.2 → 99.0
FPS** in the dev build. The first attempt to measure this gave a *faster*
result with the shadows on, which is what a measurement taken before the shadow
program has finished recompiling looks like; four alternating runs after a
settle period is what produced the honest number.

On the deployed build the cost is not measurable at all: the high tier reads
**119 FPS** at 3.55 MP both before and after, twice each. The dev figure is the
upper bound; production has enough headroom at that resolution to absorb it.

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

**The bridge geometry, measured, because guessing it goes wrong.** A bridge is
diagonal, so an offset along world X is not an offset across the deck — and this
was got wrong twice while checking a different suspicion, both times producing a
confident wrong number. Reading the scene and projecting properly:

| | value | source |
| --- | --- | --- |
| deck, full width | 12 | `boxGeometry args={[width, 0.5, span]}` |
| deck, half-width | 6 | |
| central strip | 4.32 | `width * 0.36` |
| railings | ±5.8 | `width / 2 - 0.2`, emissive turquoise, 0.3 × 0.6 × span |
| walkable corridor | ±5.2 | derived: `width / 2 - 0.4` minus a 0.4 margin |

So the player can walk to 5.2, which is 0.6 short of a railing and 0.8 short of
the deck edge. `isWalkable` and `distanceToWalkable` agree with that, and
`__ilm.blocking.offWalkableBy` agrees with them — checked in one call, at the
player's *settled* position rather than the one the teleport asked for, which is
the third way that measurement went wrong.

**The corridor now follows the deck instead of restating it.** `buildAreas` used
to hold a literal `halfWidth: 5.6` while the deck was drawn from
`Bridge.width`. The two agreed, but by coincidence: the walkable surface was
not derived from the geometry, so the two could have drifted the way the opening
bridge did without anything noticing. `initNavigation` now takes the spans it
was given and computes `width / 2 - 0.4`, which for the only width in use is
exactly the 5.6 it held before. `tests/bridge-corridor.test.ts` pins that the
corridor scales with the deck it was built from, so the coupling is now a
property rather than a coincidence.

Rebuilding navigation also had the same class of guard bug as `instanceColor`:
the early return that skips an unchanged rebuild compared only the *set of open
regions*, not the spans, so a rebuild carrying different deck widths was skipped
while the areas kept the widths they were first built with. The signature covers
both now.

**Checked and found sound.** The suspicion was that `Bridge.width` is a full
width (`Player.ts` and `navigation.ts` read it as a half-width and as
`halfWidth` respectively), so the walkable surface might be twice the drawn
deck and the player might be able to stand off the side of a bridge in the air.
It is not: `navigation.ts` builds the corridor from `halfWidth` and subtracts a
margin, and measuring outward along the perpendicular from the deck's centre
line gives walkable to 5.2 and not-walkable beyond it, on both sides of all
seven spans. The glowing rails are decorative rather than colliders — nothing
pushes the player back at 5.8 — but since the corridor already ends at 5.2 that
never comes up in play. `groundHeight` in `Player.ts` does compare against
`path.width` as a half-width, which is inconsistent with the geometry, but every
bridge has `y: 0` and so does its fallback, so the threshold cannot change what
is drawn or where a player ends up. It was left alone rather than "fixed" into a
change with no observable effect.

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
GLB: **3.5 MB → 744 KB**, 76 clips → 5. The size grew from what the clip trim
alone left behind once the baked vertex AO went in — 609 vertices, one mesh, one
256×256 atlas.

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

Fourteen props merge into one 187 KB GLB. `src/world/Props.tsx` turns each child
mesh into an instanced mesh and scatters it deterministically per region, clear
of the landmark in the middle. 155 placed objects across seven regions cost
fourteen draw calls.

The hub carries none of them, and that one is deliberate rather than an
oversight: every entry in `REGION_DRESSING` is themed to the region's
*application* — the council city gets pillars and walls, the foundry gets beams
and worktables, the cloud harbour gets barrels and pallets — and the hub is not
an application site. It is the meeting point, and it is dressed with the things
that are not applications either: the synthesis tree, the canal, the aqueduct,
26 boulders, 90 pebbles and 60 grass tufts.

Grounding happens at load time, not in the file: the glTF exporter writes the
source mesh data verbatim and drops a per-prop offset, so several models would
have been buried up to half their height. `Props.tsx` lifts each geometry by its
own bounding box and centres it on its footprint instead.

### The ground was not being drawn

A radial starburst sat under the player's feet, on every frame, on every island.
It looked like a shadow and it was not: the aqueduct had already been stopped
casting shadows two rounds earlier, and the pattern survived that change intact.

It was the ground. Specifically, the terrain the player walks on was **not
rendered at all**, and what showed through the hole was the island's cliff
underside — a `DoubleSide`, flat-shaded bowl whose 96-sector apex fan converges
on a point directly below the hub centre. That apex is what the starburst was.
The player was standing on nothing at all.

Two independent faults, neither of which threw:

**1. The winding guard could not see the problem.** `buildDisc` emits in two
passes — an inner fan, then ring quads — and the two wound in opposite
directions. The existing guard checked `normal.getY(0) < 0`, and vertex 0 is the
fan's centre vertex, which is always correct. Measured on the running build:

```
triangles           2806
facing up            122   (the inner fan)
facing down         2684   (every ring quad — 95.7%)
```

`computeVertexNormals()` derives normals *from* the winding, so a single sample
can never disagree with its own mesh. The check was not weak, it was
vacuous. `faceUp()` in `src/world/disc.ts` now walks all 2,806 triangles and
flips any whose `uz * vx - ux * vz` is negative — the disc is flat, so that one
term is the whole question, and no square root is needed.

**2. Then the quads had to tile, which they did not.** The annulus between two
rings is a quad with corners `inner+s`, `outer+s`, `outer+next`, `inner+next`.
It was being split on `inner+next → outer+next` — which is the quad's own outer
edge, not a diagonal. Both triangles therefore sat on the *same* side of it:
they overlapped and left a wedge of nothing between them. Visible as a pinwheel
of ground alternating with cliff, converging on the centre.

The inner→outer diagonal puts the two apexes on opposite sides, which tiles.

**What the eye said and the number said.** Vertex colour was ruled out before
being blamed: angular luminance SD across each ring was 0.010–0.014 with a worst
adjacent-pair delta of 0.017, far too small to produce the contrast on screen.
Painting the disc magenta and the cliffs green at runtime is what actually
located it — the two interleaved into a pinwheel, which is not a shading bug at
any resolution.

`tests/disc.test.ts` now asserts what the old guard could not: every triangle
faces up, and the triangle areas sum to π·r² within 0.1% (the old split sat at
about 0.71 of the disc). A flatness test guards the other invariant — walking is
solved in 2D against y=0, so a vertex that leaves that plane is a surface the
player visibly floats above.

### The shadow box was following the wrong thing

With the ground finally rendering, shadows had something to land on, and a new
artefact appeared: the bridge's shadow stopped dead across open sand, along a
vertical line, with clean ground beyond it.

The obvious diagnosis — the shadow frustum is too small — was measured and
**half wrong**:

- A 100×100 sample of every visible ground point found only **0.2–0.3%** of
  them outside the ±46 box. By that measure there was no problem at all.
- Growing the box to ±90 in a runtime A/B did extend the shadows to the shore
  and did remove the hard edge, which is what made the frustum look guilty.

Both were true, and together they point somewhere the first measurement could
not see. The receivers were inside the box; the **casters** were not. A bridge
starts five units inside the rim and runs 86 units out to the next island, so
almost all of it sat outside a 92-unit box centred on the player — and a clipped
caster projects a truncated shadow, which lands on ground that is *well inside*
the frame. Sampling the receivers can never see that.

The actual defect was the centre, not the size. The box tracked the player, so
its edge sat *inside the island* whenever they stood off-centre. Measured at 26
units off-centre, the far 6 units of shoreline were outside even a ±54 box. The
player cannot walk out of an island, so following them only ever slid the
boundary around inside ground they could already see.

`Sun` now takes the island the player is standing on — centre and radius, from
`regionAt` — and fits the box to *that*. Verified by a controlled A/B: one
camera, one box size, only the centre toggled between the player and the island.
The player-centred frame has the hard vertical cut in the bridge shadow; the
island-centred frame does not, and the deck's shadow runs on to the shore.

Fitting to the island also means texels-per-unit no longer depends on where the
player stands. At 2048² the hub gets **23.3** texels/unit against the **22.4**
the old player-following box gave it — slightly better detail on the island
where play actually happens — and the medium map went 1024 → 1280 so that
no island, including the 46-unit one, drops below what it had before.

One thing this exercise also got wrong, and it is worth recording: a dark band
near the left of the frame looked exactly like the same clipping. Raising the
extent to ±80 left it untouched. It was a prop's shadow, with a hard edge
because the prop has one. Same symptom, different cause, and the fix that
"worked" for the first one would have looked like success while leaving the
second untouched.

### The grass was the same colour as the pebbles

Scattered across every island are, at the time of that round, 208 boulders, 720
pebbles and 480 grass tufts — the totals have since moved to 314 / 1,081 / 720
when the scatter became proportional to island area (see "The scatter gave every
island the same number"). The colours below are what was measured then.
Measured on the running build, the grass was rendering *darker than the pebbles
it sat beside*, and at the hue of wet earth:

| set | count | material | first instance | hue | mean linear luminance |
| --- | --- | --- | --- | --- | --- |
| boulders | 208 | `#c9b79a` | `#b8a78d` | 34.6° tan | 0.416 |
| pebbles | 720 | `#9a8a72` | `#988870` | 33.3° tan | 0.195 |
| **grass, before** | 420 | `#7fa06a` | `#b7ae9f` | **~45° brown** | **0.194** |
| **grass, after** | 420 | `#7fa06a` | **`#637d53`** | **100.3° green** | **0.227** |

`instanceColor` *multiplies* the material colour, so the base handed to
`buildInstances` and the colour written on the material have to be the same
value. They were not: `GroundDetail` serves both pebbles and grass and passed
the pebble's sandstone to `buildInstances` for both, while the material already
picked moss for grass. Green times sandstone is mud — which is exactly what the
comment inside `buildInstances` warned about, written by whoever fixed the
`instanceColor` guard two rounds earlier, while the call site underneath it was
doing the thing the comment described.

How it was found is the part worth keeping. Recovering the lerp alpha that maps
base to instance colour gives a clean per-channel number for a correct set
(rocks: 0.452 / 0.452 / 0.452; pebbles: 0.048 / 0.048 / 0.048). Grass returned
0.152 / 0.789 / 0.432, and across all 420 instances ranged down to **−0.72**. A
lerp between two colours cannot produce a negative alpha or disagree with itself
per channel, so those numbers were proof that the written colour had not come
from the lerp being inspected — which is what pointed at the wrong `base`.

The fix reads the colour into one variable and uses it in both places, so the
two cannot drift apart again. A unit test asserting `kind === 'pebble' ? a : b`
would only have tested the ternary; the invariant worth protecting is that both
call sites see one value, and that is now true by construction.

**Which brought up the second half of it.** With grass finally green, the hub
looked wrong for a different reason — measuring the scatter per island showed
the hub had **0** grass tufts against 60 on each of the other seven. The cause
is a `REGIONS.filter((r) => r.id !== 'hub')` that has been in the file since
the first commit. No commit has ever recorded a reason for it. And it could not
have been noticed: until two rounds ago the ground it stands on was not rendered
at all, so the exclusion was a judgement about something nobody had seen. The
hub is where the opening happens and where a player spends their first minutes;
it now gets 60 tufts on its own seed, leaving the seven islands that always had
grass with exactly the layout they had.

### The canal was a painted slab

The canal is the moment the game's title happens, and the restoration text for two
regions is literally *"water rises"*. It was also the least water-like thing the
world could draw: `FlowingCanal` was a single translucent plane, `normalMap:
false`, `roughness 0.15`, with no animation of any kind. One uniform turquoise
rectangle lying on the sand, static.

It is now two coplanar-ish layers carrying `water_normal.png` — 512×512, 106 KB,
generated by `water_height_field()` in the same script as the ground maps — and
scrolling along the channel at 0.05 UV/s (the second layer crosses it at 0.031
UV/s on the other axis, so the pair never returns to the same frame).

**The generator has to produce an integer-wave field.** The ripple crests are a sum
of diagonal sine trains — `(1,3) (1,5) (2,7) (1,9) (3,12) (5,16)` — over an fbm,
tilted toward +V so the crests stretch along the channel instead of across it.
Random frequencies look fine in isolation and then seam the instant the texture
repeats, which on a *moving* surface is the first thing an eye catches. The seam
test ranks each wrap step by its percentile position inside the interior steps:

| map | seam rank | interior rank |
| --- | --- | --- |
| water | 61. | 43. |
| soil | 15. | 17. |
| stone | 6. | 7. |
| *deliberately opened seam* | *99.9* | — |

The last row is the control that proves the test can fail.

**The settings that make it read were found by measurement, not by taste.** The
first instinct — that the relief was too weak — was wrong. Raising `normalScale`
from 0.9 to 2.5, nearly 3×, moved the block high-pass residual of the water surface
by **9%** (3.93 → 4.30). The relief was not short of amplitude; it was short of
light. A flat `emissiveIntensity` of 0.30 is added to every pixel whatever the
normal is, and at roughness 0.05–0.08 the environment reflection is a mirror image
of a smooth procedural sky, so almost nothing on the surface varies with its
angle. Dropping emissive to 0.08 and raising roughness to 0.35 raised the same
residual mean by **41%** (1.21 → 1.71), and the streaks now run the whole length of
the channel instead of appearing as a single hard specular sparkle near the middle.

| variant | high-pass std | residual mean |
| --- | --- | --- |
| ns 0.9 · rough 0.08 · emissive 0.30 | 3.93 | 1.21 |
| ns 2.5 · rough 0.08 · emissive 0.30 | 4.30 | 1.37 |
| ns 2.5 · rough 0.35 · emissive 0.08 | 3.86 | **1.71** |

**Proving the surface moves** takes a better test than "pixels differ". A water
surface that is being lit by a smooth gradient can change by a little every frame
without anything moving. Scrolling by a known 0.10 UV and correlating the surface
against itself finds the displacement instead of the noise: the ripple pattern
moves **(dx +35, dy +40) px**, correlation 0.80 against 0.73 at zero shift. The
same test on sunlit sand, which must not move, reports 0 shift — that control is
what makes the water result mean anything.

Two measurement mistakes from this round are worth recording, because both
produced confident nonsense. The first diff was taken against a strip of the
frame that turned out to be shadowed sand, not water: the water plane's corners
were projected from the scene rather than guessed. The second was worse — the
browser had been restarted and was sitting on the title menu, so three
screenshots "measured" the teal *Continue* button. Both said the same wrong thing
with high confidence. A measurement is only as good as the state it was taken in.

### The scatter gave every island the same number

The Collective Gardens reads as half-empty from the one viewpoint that looks
across it, and the ground takes up most of the frame on every island. The
scatter is uniform in angle and radius — `scatter()` draws `angle` uniformly and
`distance` uniformly between an inner and outer radius — so the distribution is
not the problem. The *count* is.

Every island was given a flat 26 boulders, 90 pebbles and 60 grass tufts. The
discs range from radius 34 to 46, so that is a **1.83× spread in area**, and the
hub — the smallest island, and the one the opening happens on — ended up the
densest in the game:

| island | r | boulders | pebbles | grass | density vs hub |
| --- | --- | --- | --- | --- | --- |
| hub | 34 | 26 | 90 | 60 | 1.00× |
| cartographers-terrace, observers-mirrors | 40 | 26 | 90 | 60 | 0.72× |
| flow-foundry, collective-gardens | 42 | 26 | 90 | 60 | 0.66× |
| adaptation-cloud-harbor, valley | 44 | 26 | 90 | 60 | 0.60× |
| memory-council-city | 46 | 26 | 90 | 60 | 0.55× |

Counts are now `base · (radius / 34)²`, floored at the base so no future island
smaller than the hub loses detail. The per-set radius factor cancels — both
sides scale by the same `f`, so only the ratio of radii survives — and the hub
returns exactly itself, so the opening keeps the layout it has had.

| island | r | boulders | pebbles | grass |
| --- | --- | --- | --- | --- |
| hub | 34 | 26 | 90 | 60 |
| cartographers-terrace | 40 | 36 | 125 | 83 |
| flow-foundry | 42 | 40 | 137 | 92 |
| memory-council-city | 46 | 48 | 165 | 110 |
| adaptation-cloud-harbor | 44 | 44 | 151 | 100 |
| collective-gardens | 42 | 40 | 137 | 92 |
| observers-mirrors | 40 | 36 | 125 | 83 |
| valley-living-machines | 44 | 44 | 151 | 100 |
| **total** | | **314** | **1,081** | **720** |

Verified on the rendered scene rather than on the arithmetic: reading
`instanceMatrix` back out of the three instanced meshes and bucketing each
instance by the island it sits on returns exactly the table above.

**The visible effect is real but modest, and worth stating honestly.** Counted as
the fraction of ground pixels differing from their local mean by more than
10/255, at the same pinned camera before and after: the left half of the gardens
goes 0.36% → 0.40% and the centre 4.09% → 5.24%, with block-9 high-pass std
rising 2.64 → 2.78 and 6.69 → 7.30. The count went up 1.5× on that island and the
coverage only 1.1–1.3×, because the added objects are small and a share of them
land beyond the sampled bands. The perceived emptiness was mostly real and mostly
perspective compression. The underlying inconsistency — a constant count spread
across a 1.83× range of areas — is now impossible to reintroduce by accident,
which is the durable part.

**Re-measured later against where the change actually landed**, by differencing
the two frames and taking the windows out of the biggest-changed cells rather
than out of convenient ones: ground coverage 5.96% → 7.01% (**×1.18**), with the
ground's high-pass std going 6.60 → 7.16. That confirms the figure above. It also
caught the weakness in how it was first taken — one of the two original boxes sat
in a region that did not change at all (×1.00), because the boxes were picked
before the diff showed where the new objects ended up.

### …and once the landmark was out of the frame, the islands read the same

The section above takes its numbers from the ground under the player. The
objection to every version of it is that a camera placed at a region's anchor is
looking at that region's **landmark**: measured, the plinth is 52 units across on
the hub, 30.4 on the Cartographers' Terrace, 30 on the Flow Foundry, 26.4 on the
Observer's Mirrors, and it is what fills the lower frame in each of those shots.
So the ground was being judged through the one object that covers it.

Measured with a fixed rig instead — every island viewed from **72% of its own
radius, on the same bearing, with the landmark behind the camera**, and the
numbers taken from the lower 45% of the frame, which is near ground in all eight:

| island | edge energy | vs hub | local contrast | vs hub |
| --- | --- | --- | --- | --- |
| hub | 1.283 | 1.00× | 6.880 | 1.00× |
| cartographers-terrace | 1.317 | **1.03×** | 7.185 | **1.04×** |
| flow-foundry | 1.218 | 0.95× | 6.403 | 0.93× |
| memory-council-city | 1.256 | 0.98× | 6.599 | 0.96× |
| adaptation-cloud-harbor | 1.284 | 1.00× | 6.932 | 1.01× |
| collective-gardens | 1.227 | 0.96× | 6.364 | 0.93× |
| observers-mirrors | 1.326 | **1.03×** | 7.223 | **1.05×** |
| valley-living-machines | 1.165 | **0.91×** | 6.105 | **0.89×** |

The whole spread is **0.91× to 1.03×**, the hub sits in the middle of the pack,
and the two regions that looked emptiest from the anchor — the Terrace and the
Collective Gardens — come out **above** and level with it. The worst island is
ten per cent below the hub, which is not a gap a player can see.

So the long-standing limitation "regions are visible but lightly dressed" is
**withdrawn rather than reworded**. What it actually measured was a landmark. The
remaining honest difference between the islands is hue, not density: the hub,
the Harbor and the Terrace read as warm sand and the Mirrors as pale grey-green,
and the Mirrors being the *brightest* and *most* detailed of the eight is the
clearest sign that "lighter" was never the right word.

### Eight islands, one ground colour

With the landmark out of frame the islands are indistinguishable from one
another, and the reason is a single line of data. Measured on the fixed rig
above — every island from 72% of its own radius on the same bearing, taking the
ground pixels of the lower 45% of the frame:

| island | ground hue | chroma |
| --- | --- | --- |
| hub | 37.0° | 0.419 |
| cartographers-terrace | 34.5° | 0.384 |
| flow-foundry | 39.0° | 0.351 |
| memory-council-city | 37.1° | 0.353 |
| adaptation-cloud-harbor | 36.8° | 0.382 |
| collective-gardens | 44.7° | 0.373 |
| observers-mirrors | 44.1° | 0.238 |
| valley-living-machines | 39.0° | 0.343 |

**A spread of 10.2°, and a mean pairwise distance of 4.1°.** Seven of the eight
sit within five degrees of each other. Every `palette.stone` in
`src/catalog/regions.ts` was the same warm grey — `#a89277`, `#b5a184`,
`#948977`, `#ab9d84`, `#a2907a`, `#9e9679`, `#aca798`, `#8b8172` — and the
accents were varied (turquoise, mint, coral, green, blue), which is why the
props read as different and the ground did not. Eight landmarks, eight sets of
rails, and one beach.

The hues were spread while each island kept its own lightness and saturation,
so nothing about the value structure changed:

| island | stone before | stone after | ground after |
| --- | --- | --- | --- |
| hub | `#a89277` | `#a89677` | 40.6° |
| cartographers-terrace | `#b5a184` | `#b5b284` | 49.4° |
| flow-foundry | `#948977` | `#948277` | 29.8° |
| memory-council-city | `#ab9d84` | `#8496ab` | 193.5° |
| adaptation-cloud-harbor | `#a2907a` | `#a28f7a` | 35.7° |
| collective-gardens | `#9e9679` | `#999e79` | 58.8° |
| observers-mirrors | `#aca798` | `#98abac` | 123.0° |
| valley-living-machines | `#8b8172` | `#8b7372` | 18.2° |

**Mean pairwise hue distance 4.1° → 63.3°**, closest pair 4.9°. The five warm
islands are now 18° to 59°, which is as far apart as eight pieces of earth can
be while still reading as earth; the other three carry the cool end — the
Council as blue stone, the Mirrors as cold pale, which is what an island of
mirrors should be.

**The tile-size audit finished here, and the ground was the only thing wrong with
it.** The other two maps were checked by the same arithmetic: `stone_normal.png`
tiles every **1.8** world units through `DETAIL_TILE`, and the canal's
`makeWaterNormal(2, 4)` over a `planeGeometry(3.2, 8)` is one repeat per **1.6 by
2.0** units. Both are already at the scale the ground should have been at. The
reason the ground stands out is that it was the only surface whose repeat was set
in the tens rather than the ones.

**Checked before shipping, because a new ground colour can swallow what was sitting
on it.** The Weaver is the third thing that lives on the ground, and it is the one
the player looks at most. Segmenting the robe by hue (250–320°, under 0.55 value)
and taking the luma against the local ground, on all eight islands:

| island | ground | Weaver | contrast |
| --- | --- | --- | --- |
| hub | 134.29 | 48.17 | 86.12 |
| cartographers-terrace | 138.47 | 48.20 | 90.28 |
| flow-foundry | 106.94 | 46.70 | 60.23 |
| memory-council-city | 115.56 | 58.03 | **57.53** |
| adaptation-cloud-harbor | 125.72 | 48.27 | 77.45 |
| collective-gardens | 125.93 | 47.32 | 78.61 |
| observers-mirrors | 141.37 | 48.42 | 92.95 |
| valley-living-machines | 93.60 | 40.38 | **53.21** |

The weakest is the Valley, and only because both its ground and its robe are dark;
the character is still 53 luma clear of it. **Nothing is lost on any island**, and
the new colours did not swallow the subject.

 On the same rig, separating the ground (within 18 luma of the local median)
from the props (more than 25 away):

| island | ground | props | prop − ground | prop hue |
| --- | --- | --- | --- | --- |
| hub | 90.6% | 6.57% | 80.0 | 128.5° |
| cartographers-terrace | 88.0% | 8.92% | 80.4 | 108.0° |
| flow-foundry | 91.7% | 6.27% | 63.4 | 127.5° |
| memory-council-city | 91.7% | 6.14% | 68.8 | 177.8° |
| adaptation-cloud-harbor | 91.3% | 6.56% | 75.6 | 129.2° |
| collective-gardens | 91.5% | 6.02% | 74.8 | 145.6° |
| observers-mirrors | 90.6% | 6.73% | 83.5 | 166.7° |
| valley-living-machines | 92.8% | 5.68% | 56.0 | 171.8° |

**No island lost its props**: prop coverage holds between 5.68% and 8.92% across
all eight, and the prop-to-ground separation stays between 56 and 84 luma. The
figure that looked at risk was the Mirrors — a near-white ground under the warm
`#9a8a72` pebbles — and it came out the highest contrast of the eight at 83.5.

The second risk was the bridges. `DECK_TOP`'s walking surface is a fixed
`#c9b79a` — a warm sand that was on every island in the world when that was the
only colour there was, and is now the one thing that is **not** per-region.
Measured on the deck mid-span, it reads **43.1°** on the Council bridge and
**43.6°** on the Mirrors bridge: unchanged, as intended.

That was worth checking, because a warm causeway running onto a blue-grey island
could have been the seam. It is the opposite. Walking it: the deck stays warm,
the Council stays blue, and the causeway reads as the thing that *carries you
from one to the other* — which is what a bridge is for. One constant across the
world is not a leftover here; it is the line between the eight places.

The widest seam a bridge can cross is the hub to the Council, warm 40.6° against
blue 193.5°, and it was walked rather than reasoned about: both islands read in
one frame with the turquoise canal and the Council's pillars between them, and
the transition reads as two places rather than as a seam.

Two things this round did **not** find, recorded so they are not looked for
again.

**The landmarks were already distinct.** They are what a camera at a region's
anchor is looking at, so if any part of the world were going to be visually
identical across the eight, it would be them. On the same rig, taking the band
above the ground and treating anything darker than the sky as built matter:

| island | silhouette | height (px) |
| --- | --- | --- |
| hub | 5.87% | 600 |
| cartographers-terrace | 1.79% | 445 |
| flow-foundry | 7.69% | 616 |
| memory-council-city | 2.07% | 616 |
| adaptation-cloud-harbor | 6.05% | 282 |
| collective-gardens | 4.36% | 458 |
| observers-mirrors | 8.29% | 321 |
| valley-living-machines | 7.32% | 422 |

Silhouette coverage runs from 1.79% to 8.29% — **a 4.6× range** — and the
structure heights from 282 to 616 pixels. Eight shapes, not one shape eight
times. The ground was the thing that was shared.

**The colour reads locally, and that is the honest limit of it.** The eight
discs are coplanar and the camera sits about five units above them, so from any
one island the others are seen at a shallow angle: standing on the hub, the
neighbouring islands enter the frame as bands along the left and right edges
rather than as fields you can look across. Measured from the hub, non-sky matter
first appears at y = 180 and is still edge-confined at y = 330 — the far islands
never occupy the middle of the frame.

So a player reads the new identity as the place they are standing, which is what
they are looking at for the whole of a visit, and sees the neighbours as colour
at the edge of vision rather than as landmarks. Widening that would mean raising
the discs or tilting the camera, which is a world-shape change and not a colour
one; it is worth a round of its own if the horizon ever looks empty.

Cost is nothing: the value lives in one hex per region and is read in
`Atmosphere.tsx` to build the vertex colours at load, so no draw call, no
material and no frame time changed. The props still read on the cool grounds,
which was the risk worth checking first — the warm rocks and dark grass hold
their contrast on blue stone and on the Mirrors' near-white.

### The horizon had nothing behind it

The eight discs are coplanar, which the section above already measured: from the
hub the furthest island never rises past y = 330 of 1610 and stays edge-confined.
Past the nearest island there is therefore **no geometry at all**, and the sky
dome carried a gradient, a sun and four sine terms of high cloud — and nothing
standing on the horizon at all. The line where land met sky was a hard edge with
no world behind it.

The sky shader already had the right idiom for this: sines over the view
direction, no texture, a handful of ALU on the one surface that never writes
depth. The ridge uses the same one. It is painted *into* the dome, so the islands
draw over it for free and no depth sorting is involved.

Measured on the hub, before and after, over the same frame:

| band | before | after | delta |
| --- | --- | --- | --- |
| sky, rows 60–150 | 36.83 | 36.83 | **+0.000** |
| ridge line, row 255 | 53.17 | 46.05 | −7.12 |
| ridge body, row 270 | 56.24 | 24.93 | −31.31 |
| ground, rows 600–900 | 78.64 | 78.48 | −0.16 |

**Surgical by measurement**: the sky above the ridge is unchanged to the third
decimal and the ground is unchanged, and all of the change is in the band where
the horizon is. The profile is three sine terms in azimuth, a two-tone body so
it is not one flat cut-out, and a fade below the discs so the void under an
island is not filled in.

Two ridges, because one band reads as a painted stripe and two read as land
going away. The far one is **higher** — on a flat world the horizon is eye level,
so distance lifts a silhouette toward it — and paler, which is what haze does to
it. Measured over the same crop, the far band comes down **14.9 and 18.9 luma**
at its own rows while the sky above the whole thing does not move.

**Free, and honestly below what three samples can resolve.** Same scene, on the
hub where the Great Loom fills the frame, three samples each:

| | samples | median |
| --- | --- | --- |
| no ridge | 84.4 / 77.7 / 78.5 | **78.5** |
| one ridge | 86.6 / 79.9 / 80.1 | **80.1** |
| two ridges | 78.1 / 74.4 / 79.9 | **78.1** |

The one-ridge build measures *faster* than no ridge at all, which is not a
result a shader can produce. All three medians sit inside each other's ranges:
the hub scene is noisy enough — an orbiting Spark, a moving camera — that a
handful of ALU on one surface that never writes depth cannot be resolved in three
samples. That is the honest reading, and it is the same one the medium-tier
shadow map took: **free, because it is not measurable.**

#### …and raising the islands is not a round of work, it is a rebuild

The obvious next move from a flat world is to give the discs different heights.
It was probed before any of it was built, by raising one island's groups **16
units at runtime and taking one screenshot**.

The world came apart in that frame. The player was left standing in open blue
with an island's underside hanging overhead like a ceiling. Nothing had been
implemented — no navigation change, no bridge, no ground sampler — because the
raise was applied to a live scene graph and the frame simply stopped making
sense.

That is the answer, and it cost one screenshot to get. **Everything in this world
assumes the discs are coplanar at y = 0**: the camera sits a fixed height above
it, `DECK_TOP_Y` is 0 because the island tops are, the ground sampler answers in
one plane, the sun's shadow target is that plane, and the bridges meet the
shores there. Per-island heights are not a world-shape tweak; they are a change
to every one of those at once, and the visual probe says the payoff is not
obvious enough to pay for that on faith.

The horizon ridge above is the version of this idea that costs nothing and was
therefore the one worth building.

### The ground was magnified five times where the player stands

`GROUND_TILE_SIZE` was 6: one repeat of the normal map every six world units.
The map is 512², the camera sits about 4.7 units up, and the ground underfoot is
about three units ahead — so at the player's feet one repeat spans **2540 screen
pixels** and the map lands at **0.20 texels per screen pixel**. That is a five-fold
magnification, and it is why the ground read as a painted surface exactly where
the player is looking down at it and got more convincing further away.

The map itself was fine. Its channels average **127.5 / 127.5 / 253.2** with a
spread of 15.4 / 15.2 / 1.9, which is a ground that tilts by about seven degrees
— real relief, laid down correctly. The roughness map alongside it has a 5th-to-95th percentile range of **9 of 255**,
which looks like a dead asset, and it is worth recording that it is not.

Regenerated through Blender to find out — and the four maps come back **byte for
byte identical**, so the shipped PNGs are exactly what the script writes and the
pipeline is reproducible. The fields behind that map measure as:

| field | p5 | median | p95 | full range |
| --- | --- | --- | --- | --- |
| height | 0.163 | 0.449 | 0.770 | 1.000 |
| grain | 0.288 | 0.490 | 0.715 | 0.839 |
| roughness | **0.934** | 0.953 | **0.971** | 0.073 |

`roughness_map` asks for `0.94 + 0.06 * grain - 0.04 * height`, and those are
small numbers: 0.06 plus 0.04 is a full range of 0.10, which is 26 of 255 and an
observed 18.6. **The amplitude was never being lost to the distribution** — a
normalising stretch was tried and moved the p5-to-p95 band from 9 to 10 of 255,
which is not a change worth shipping, so it was reverted.

What the docstring calls "the band 0.88–1.0" is the **clip bounds**, not the
result: the floor exists because the turquoise rim light is a grazing light and
anything under about 0.80 puts a wet-sand sheen across the horizon. So the map is
narrow on purpose, the ground is uniformly matte by design, and "dry stone should
stay dry" is a decision rather than a failure to reach a number.

The real finding from this round is the one above it: the map was not dead, but
the **tile size** it was being displayed at was wrong, and that was worth 13% of
the ground's surface detail on its own.

At a tile of 2 the same map lands at 0.60 texels per screen pixel close in and is
minified rather than blown up further out, where the anisotropy of 8 takes over.

| | near-ground local contrast | frame mean luma |
| --- | --- | --- |
| tile 6 | 6.608 | 114.49 |
| **tile 2** | **7.464 (+13%)** | 114.45 |

Exposure does not move; the gain is surface detail and nothing else. The obvious
way to lose this is a wallpaper — twenty repeats across an island — so it was
checked rather than assumed: the row autocorrelation of the ground at lags 200 to
600 is **flat and negative on both builds** (−0.05…−0.22), which is what a seamless
map looks like and is not what a visible motif looks like. Looked at side by side,
tile 6 is soft and tile 2 is grain.

The anisotropy of 8 that was already set was doing nothing at the old tile size,
because anisotropy only helps when a surface is *minified*, and at five times over
it never was.

**And the relief was re-tested, because its rejection was measured against the
broken tile.** `GROUND_NORMAL_SCALE` sat at 1.5 with a comment recording that 3.0
was worse — "the tooth reads as blotches rather than grain". That was measured
when the map was magnified five times, so it was worth re-running on the fixed
baseline rather than inherited:

| relief | fine (21 px) | coarse (45 px) | ratio | mean luma |
| --- | --- | --- | --- | --- |
| 1.5 | 7.46 | 9.32 | 1.25 | 114.45 |
| **2.2** | **9.79** | **11.94** | **1.22** | 112.55 |
| 3.0 | 12.47 | 14.85 | 1.19 | 110.26 |

**The old complaint does not reproduce.** The coarse-to-fine ratio is what blotching
would show, and it *improves* as the relief rises — 1.25 → 1.22 → 1.19 — so the map
is gaining tooth at both scales rather than gaining patches at one. 2.2 is +31% of
the fine detail over 1.5 and the ground still reads as sand.

3.0 is still wrong, for a reason that was not visible before: **+67%** of fine
detail with the map now resolving stops reading as sand and starts reading as
gravel. The comment that recorded the old rejection has been rewritten to say what
the numbers now say, because a stale measurement is worse than no measurement —
the next person would otherwise re-run the same experiment and reach for the same
wrong number.

#### …and the low tier, which this whole round never looked at

Every measurement above is the default tier. The low tier renders at a **dpr of
1.25** (canvas 1622×1006 against 2271×1408) and, by design, creates **no
shadow-casting light at all** — `shadowsOn` is `quality !== 'low'`. Walking it
after the ground work: the Weaver has no contact shadow, the Great Loom casts
none, and nothing on the hub is attached to the ground by a shadow. That is the
tier's stated trade and it has not been touched here.

What the round *did* change is not tier-gated. `GROUND_TILE_SIZE`,
`GROUND_NORMAL_SCALE`, the sky ridge and `palette.stone` are read the same on
every tier, so the ground gains its grain on low as well — which is the part of
this round that most helps a phone.

**What a shadow map would cost there was measured, and it does not license the
change.** The sun's `castShadow` was switched on at runtime with a **1280** map and
the box set to the island's ±44, on the low tier itself:

| low tier | samples | median |
| --- | --- | --- |
| as shipped, no shadows | 101.9 / 100.4 | **101.2** |
| **+ a 1280² shadow map** | 103.0 / 103.5 | **103.3** |

The shadows do render — **1.38% of the frame** moves, and the Weaver picks up a
contact shadow it does not have today. And the cost is not measurable: the shadowed
build reads *faster*, which is the same reading the sky ridge gave, and means both
numbers are this machine's noise rather than a result.

**That is exactly why it does not justify changing the tier.** This is a desktop
GPU. The low tier exists for hardware that is not this machine, and a frame rate
measured here says nothing about a phone's budget. What the measurement does say is
narrower and still useful: **cost is probably not what removed shadows from the low
tier.** Whoever revisits this should decide it on a phone, and should not assume the
shadow map is the expensive part.

One honest caveat on the numbers: the near-ground local contrast measured on low
reads **10.27 against 9.79** on high, and that is **not** low having more detail.
The window is a fixed 21 pixels, and low spends each pixel over more world, so
the same window simply covers more texture cycles. Comparing tiers needs a
world-space window, which was not taken. The within-tier comparison — 6.61 before
the tile and relief change against 9.79 after, on the same tier and the same
window — is the one that means anything.

### Twenty-eight puzzle consoles shared one plinth, at the wrong place

Every puzzle console in the world is supposed to stand on an authored plinth:
`<Asset name="console" visible={!done} …>` renders the GLB, and the state-driven
mark that floats above it stays in code. Walking up to one on the Cartographer's
Terrace showed the mark rotating in mid-air with nothing underneath it, and its
own shadow falling on the sand it was supposed to be standing on.

The cause is a cache. drei's `useModel` is memoised by name, so all 28 `<Asset>`
calls with `name="console"` were handed the **same Object3D**. Rendering one
three.js node from 28 `<primitive>` elements asks for 28 parents; the last one to
mount wins, and the rest are silently drawn in the wrong place. Measured on the
running build, before the fix:

| GLB | instances | distinct world positions |
| --- | --- | --- |
| the eight landmarks | 1 each | 1 each — all correct |
| `weaver.glb` (the player) | 1 | 1 — correct |
| **`console.glb`** | **28** | **1** |

All 28 plinths — 4 meshes, 657 vertices each — were stacked at world (4, 0, 30),
just east of the spawn point, spanning (2.1, 0, 28.35)–(5.9, 2.65, 31.65). Not
one of the 28 consoles had a plinth where the player stands. The console is the
only model in the game used more than once, which is exactly why the landmarks
were never affected: each of those is a different file, so each gets its own
cached scene and its own single parent.

`AssetMesh` now renders `scene.clone(true)` per instance. Geometry and materials
stay shared, so the cost is 28 transform trees over one 657-vertex mesh, and
`applySurfaceDetail` is still applied once because it is guarded by
`PATCH_FLAG` on the shared materials. After the fix the same probe returns
**28 plinths at 28 distinct positions**, the first of which is the hub console at
(0, 11) — where it had never been drawn at all.

**How it went unnoticed for so long.** The two states in which a console is on
screen are both wrong-looking, which is why it never read as a missing object:
when the stage is complete, `visible={!done}` hides the plinth entirely, so a
finished console legitimately has a floating mark; and when the stage is open,
the mark still floats, on the sand, looking like the same thing. Only standing
next to an *unfinished* console on an island other than the spawn shows a plinth
that should be there and is not. Two of the screens taken while chasing this were
also of the wrong state: `unlockAll()` completes every stage, which hides every
plinth in the game, so the first look at a console measured the finished state.

This one has no unit test, and it should be said plainly rather than papered
over with one: the defect is in how a cached Object3D is parented by the
renderer, and no amount of testing `three` would catch a regression here. What
does catch it is a scene-graph one — **a model drawn N times must occupy N
places** — and that is now permanent and tested.

`src/world/scene-audit.ts` holds the check. `placedModels` walks the graph
counting only GLB roots (`isGltfRoot`, which matches drei's `Scene` node), and
`findPiledModels` groups them by vertex signature and reports any whose distinct
position count is below their instance count. It is wired into the dev hook as
`__ilm.audit()` and returns `[]` when the scene is sound.

Ten tests in `tests/scene-audit.test.ts`, and they are checked in both
directions, because an audit that only ever reports a problem is as useless as
one that never does: a model wrongly reported as piled, two different GLBs that
happen to share a spot and are *not* a bug, positions inside the tolerance
counting as the same place, and a single instance which cannot be piled. It also
pins the mistake the first version of this probe made — walking every group
instead of only the GLB roots, which counts each model against its own parent
group and makes all eight healthy landmarks look piled.

Verified end to end in the browser, both ways:

| scene | `__ilm.audit()` |
| --- | --- |
| fixed | `[]` |
| clone reverted | `657v/4m — 28 instances, 1 distinct position, all at (4, 0, 30)` |

### The water under the Great Loom was a painted plank

Standing at the Flow Foundry, the loom's water channel is a thirty-unit bar
lying across the sand in front of the frame — and it was the least water-like
surface in the game. Measured from a frame at a settled camera, taking a tight
interior patch of its top face against the sand a few metres either side of it:

| surface | luminance std | mean luminance |
| --- | --- | --- |
| the channel, before | **2.77** | 156.2 |
| the sand just above it | 22.76 | 116.9 |
| the sand just below it | 16.55 | 109.8 |

Two point seven against twenty-three, and a mean brighter than the ground it lies
on, which is why the loom's own shadow barely showed as it crossed the bar.

**Correction: that window was measuring the wrong part of the surface.** The bar
is seen almost edge-on, and a window 24 rows tall near its middle sat on the
*front face and the shadow boundary* rather than the top. Re-measured on the top
face itself — rows 538-542, which scan the bar and find its own silhouette at
rows 528-544 — the same screenshots give:

| surface | mean luminance | std |
| --- | --- | --- |
| the channel top, before | **148.2** | 0.52 |
| the channel top, after the emission fix | 85.8 | 0.77 |
| the sand beside it | 108.6 | 23.96 |

So the real, and much larger, defect was **exposure, not relief**: the channel
was blown out to 148 against a ground of 109, which is why the shadow crossing it
disappeared. Dropping the emission and roughening the surface brought it to 85.8,
below the sand and with the shadow reading properly. That part is real and it is
what shipped.

The relief part is a different story, and it is not a bug: the top face is
genuinely flat (std 0.5-1.1) and **four separate mechanisms could not change it** —
the triplanar patch at its own strength (0.78), at eight times it (1.06), the same
patch with the surface turned into a rough dielectric (0.98), and an ordinary UV
normal map at scale 2.5 (0.77). A flat horizontal surface lit by a low sun gives a
tangent-space normal map almost nothing to modulate: `N·L` barely moves when the
normal is already pointing up. Relief on water like this needs a raking light, a
glossier environment, or geometry that is not flat — none of which this scene
provides at this hour.

The emission fix is painted in `World.tsx` rather than made in `landmarks.py`,
because that is a Blender material and changing it would mean regenerating the GLB.
It is the same recipe the canal uses, applied to the one mesh whose material is
called `water`. The channel is no longer a blown-out plank; it is a flat plank that
sits correctly in the light, which is what this round could honestly deliver.

### Comparing two frames, and refusing to compare the wrong ones

Rendering an A/B of a visual change is easy to get wrong in a way that produces
a confident, completely wrong number. Four times in three rounds of this project
that happened, each of them looking like a clean measurement:

| what went wrong | what it reported |
| --- | --- |
| diffed a strip of frame that was shadowed sand, not the water | "the water never changes" |
| the browser was sitting on the title menu | "the canal surface never changes" (it measured the teal *Continue* button) |
| a counter incremented only inside a guard, so one sample was taken | "every disc has exactly one colour" |
| an HMR remount moved the camera between the two shots | "SMAA changes 54% of the frame" |

None of these is detectable from the pixels: the frames genuinely differ. A diff
cannot tell a changed world from a moved camera, because both are a large
difference between two images. So `tools/measure_frame.py` refuses the
comparison instead, and the refusals are the feature:

```bash
# the ordinary case, with the camera recorded alongside each shot
/usr/bin/python3 tools/measure_frame.py a.png b.png --meta a.json b.json

# to ignore whatever animates, pass a third frame from one of the two states
/usr/bin/python3 tools/measure_frame.py a.png b.png --meta a.json b.json --control b1.png

# prove the tool can fail before trusting what it says
/usr/bin/python3 tools/measure_frame.py --selftest
```

It exits **2** and prints `INCOMPARABLE` when the cameras differ by more than
`--camera-tol` (0.001 world units by default), when either shot has no camera
metadata at all, when the quality tier or the drawing buffer differ, or when the
player moved. The metadata is the small JSON the browser probe already produces;
only `camera` is required. With `--control` it also reports how much of the frame
was animating and excludes it, which is the difference between "the change did
nothing" and "the change did nothing except where something was moving".

The self-test is ten checks and it earns its place: a camera move, missing
metadata and a quality change all have to be refused, a real change has to *not*
be refused, identical frames have to measure exactly zero, and the motion mask
has to demonstrably exclude what it claims to. One of those ten failed the first
time it ran, and it was the check that was wrong rather than the tool — it
expected a 12-pixel slide of a bright slab to change a large fraction of the
frame, but a slide moves only the slab's *edges*, since its interior is the same
colour either side. The assertion now measures the contrast that actually moved,
and the whole-frame-coverage case is tested separately with a tint. A test whose
failure means nothing is the same problem one level down from a measurement whose
failure means nothing.

Run against the SMAA pair from the antialiasing round, with the camera recorded:
`verdict: comparable`, `cameraOffset: 0.0`, 1.16% of pixels changed by more than
4/255, and the hard-silhouette fraction falling from 0.192% to 0.176% — the same
numbers that round reported by hand. Run against the pair that round got wrong,
with no camera metadata: `verdict: INCOMPARABLE`, exit 2, "do not quote these
numbers".

### Medium was rendering a softer image than the machine could draw

The medium tier capped `devicePixelRatio` at 1.5 while high ran at 1.75 — 36%
fewer pixels and a visibly softer image — because the scene used to be
frame-bound. The deployed build is refresh-bound, so that reasoning no longer
applies, and the ratio is the highest-leverage knob in the file: it multiplies
the pixel count directly, and every other post-processing setting is downstream
of it.

It was not a straight swap, because measuring it produced three answers rather
than one. All three on the deployed build at 1440×810:

| DPR | drawing buffer | FPS | worst frame |
| --- | --- | --- | --- |
| 1.5 (was) | 2160×1215 (2.62 MP) | 120.0 | 9.4 ms |
| **1.6 (now)** | **2304×1296 (2.99 MP)** | **120.0** | **9.4 ms** |
| 1.75 (tried) | 2520×1417 (3.57 MP) | 117.4 | 17.5 ms |

Going straight to 1.75 was wrong and the number said so: at a 17.5 ms worst
frame against an 8.33 ms budget the tier can no longer hold the 120 Hz cap
cleanly, and one dropped frame is worth more to a player than 14% more pixels.
1.6 buys a fifth more resolution than the tier had, at an identical worst frame.

Low keeps 1.25. It is the phone-first tier and the one whose fill rate genuinely
is the constraint — the mobile case at 390×844 DPR 3 is what still has to
survive.

The method is the point as much as the number. Each candidate was put on
production and measured there, because the dev-only `__ilm` hook walks the scene
graph every frame and swamps a difference this size; and when the first answer
came back "not catastrophic" rather than "correct", the middle was measured
instead of taken.

### Occlusion was halved for a frame-bound build

`PostFx.tsx` ran N8AO at `halfRes={!full}` with 8 samples outside the high tier,
on the reasoning that ambient occlusion is a low-frequency term and a halved
buffer is indistinguishable. That reasoning was priced against a build that was
frame-bound, and it is also the wrong term to halve: contact darkening is
exactly the signal that shows up as a hard contact edge, which is precisely what
a half-resolution buffer cannot resolve.

Both the AO pass and the SMAA pass were therefore measured on the deployed build
rather than asserted, because the dev-only `__ilm` hook swamps a difference this
size. The medium tier at 2160×1215:

| | FPS | worst frame |
| --- | --- | --- |
| before (half-res AO, 8 samples) | 120.0 | 9.4 ms |
| after (full-res AO, 16 samples) | 120.0 | 9.4 ms |

Free, to a tenth of a millisecond. The image difference is 3.35% of the frame by
more than 2/255 and 2.57% by more than 8/255, the contact-shadow pixel fraction
barely moves (0.2590 → 0.2595) and mean luminance is 95.32 against 95.39 — the
change lands where ambient occlusion acts and moves nothing else. That is what a
resolution change should look like; a global exposure shift would have meant the
pass had changed the scene's lighting rather than its contact term.

The pattern across these two rounds is the worth keeping: **every quality tier
setting that was chosen while the scene was frame-bound is now suspect**, because
the cost it was weighed against no longer exists. The tiers are not automatically
too conservative — but each one has to be re-priced on a build that is not the
build the number came from.

### Antialiasing: the price was quoted against the wrong world

`Scene.tsx` opens the canvas with `antialias: true`, and `PostFx.tsx` runs the
medium tier through an `EffectComposer` with `multisampling={0}` and no SMAA. The
comment beside that zero said: *"The canvas already antialiases; a multisampled
composer target would pay for it twice."*

**The premise is wrong and the decision is right.** With a composer the scene is
rendered into an offscreen render target; the canvas backbuffer's MSAA is never
applied to it, so the composer target is the only place edge antialiasing can
come from. The medium tier genuinely renders unantialiased. But both ways of
fixing that were priced, at 3840×2160 on the medium tier where the refresh cap
is not in the way:

| configuration | FPS | static pixels moved >4/255 |
| --- | --- | --- |
| `multisampling={0}` (shipped) | **67.4** | — |
| `multisampling={4}` | **41.5** | 0.93% |
| `multisampling={0}` + SMAA | **62.4** | 1.47% |

MSAA at 4 samples costs **38% of the frame rate** — about 9 ms a frame — to move
0.93% of the static pixels by more than 4/255. SMAA is far cheaper at **7.4%**,
and what it buys was measured on a camera-verified A/B pair: hard silhouette
steps (adjacent-column luminance jumps over 60/255) drop from 0.197% to 0.180%,
**8.6%**, while the ground's fine texture is left essentially alone
(block high-pass std 11.97 → 11.87, −0.8%). MSAA is five times worse than SMAA
and stays off.

**And then SMAA went on the medium tier anyway, because that 7.4% was priced
against the wrong world.** All of the above was measured while the scene was
frame-bound. Re-measuring the deployed build at a pinned viewport put every tier —
high, medium, low, mobile — pinned to the 120 Hz refresh with a worst frame of
9.3–10.4 ms. At that point the scene is no longer what decides the frame rate,
and a pass costing 7.4% of a frame the GPU was finishing early is absorbed by the
cap rather than paid for. Measured on production after the change:

| tier, 2160×1215 | before | after |
| --- | --- | --- |
| FPS | 120.0 | **120.0** |
| worst frame | 10.3 ms | **9.4 ms** |

Free. The medium tier now has edge antialiasing for the first time in its life,
and whole-frame hard edges on the live medium build read 0.00149 against 0.00200
without it. The lesson is bigger than the pass: **a cost measured against a
frame-bound build stops being a cost the moment the build is not frame-bound**,
and quality tiers tuned against the old number were quietly being held back.

**How the measurement nearly went wrong, three times.** The first A/B compared two
screenshots taken a few seconds apart and reported that SMAA changed **54%** of
the frame — far too much for an edge filter. The two shots were of *different
views*: an HMR remount had reset the camera between them. The second comparison
looked fine until the crop was inspected and the two panels turned out to show a
rock in one and the canal in the other. The third was not a screenshot problem at
all: measured in development, SMAA came out **10% faster than having no SMAA at
all**, because the dev-only `__ilm` hook walks the whole scene graph every frame
and swamps a difference this small. Every A/B now settles the camera first and
reads its position back, a pair is only compared when the two positions agree to
three decimals, and a performance question is only priced on a build with nothing
else rendering.

### There is nothing far away to fade

The obvious next depth cue after the canal is aerial perspective, and the scene
does have fog: `<fog args={[HORIZON_COLOR, 110, 520]} />` in `Scene.tsx`, matched
to the exact horizon tone the sky gradient uses. The range looked wrong, so it
was measured.

| | value |
| --- | --- |
| island radii | 34 – 46 |
| landmark anchors from the hub | 124 – 184 |
| furthest mesh in the scene | 202 |
| nearest edge-to-edge gap between two islands | ~65 |

three.js smoothsteps the fog factor, so at the far anchors
`smoothstep(110, 520, 181)` is **0.080**. The ramp really is calibrated past the
content. Retuning it to 70–330 gives 0.39 at the far anchors and 0.11 at 124 —
a real change in the arithmetic.

It changes almost nothing on screen. Measured as a pixel diff between the two
settings at a pinned camera:

| viewpoint | fraction of frame that moves |
| --- | --- |
| hub, looking north | 0.16% |
| collective gardens, looking back at the hub | 0.03% |

Connected components of the difference isolate one region — the undersides of two
far islands, 7,310 pixels. Everything else in the frame is either nearer than the
new `near` value or is sky.

The reason is geometric, and it is worth writing down so nobody spends a round
rediscovering it. **The eight walkable discs are coplanar and are always viewed
from about 4.7 m above a flat plane.** From any island, the others are seen
almost exactly edge-on, so their top surfaces foreshorten to nothing and their
bodies fall below the horizon line. The large surfaces in any frame are your own
ground (0–40 units) and the sky — there is no third distance for fog to work on.
The range stays at 110–520 with a comment saying why.

Two other suspicions from the same round died under measurement, and are recorded
for the same reason. The ground looked like a flat painted plain; its vertex
colours are in fact **451–629 distinct colours per disc** with a luminance range
of 61–81% of the mean. And the island rim read as a hard black outline; the 0.1
luminance percentile is 5.4 (hub), 10.6 (terrace), 10.1 (gardens), with only
0.02–0.04% of pixels below luminance 4 — it is a dark, detailed shadow, not a
crush. The Cartographer's Terrace does look paler than the hub, and that is its
declared palette: `stone: #b5a184` against the hub's `#a89277`.

**Three of this round's measurements were wrong, and all three failed the same
way: they were confident.** The first pixel diff was taken against a strip of the
frame that was shadowed sand rather than water — the water plane's corners now get
projected from the scene instead of guessed at. The second was taken after the
browser had restarted onto the title menu, so three screenshots measured the teal
*Continue* button while reporting that the canal's surface never changed. The
third was a bug in my own loop: a counter incremented only inside the guard that
decided whether to record a colour, so the unique-colour count was 1 for every
disc and the ground looked like a single flat fill. A number that agrees with your
hypothesis is not evidence for it — check what the instrument actually measured.

### A tapestry nobody could see was painting a stripe on the sand

The hub's sand had a hard, dead straight dark band running across it — about two
metres wide, twelve to fourteen units from the middle of the island, and roughly
half as bright as the sand on either side of it. Nothing in the frame explained
it. The player standing there sees no cause at all.

It was a correct shadow. The tapestry in `src/world/World.tsx` — fourteen 3×4.6
ceramic panels and a 52-unit crossbeam hung at `y = 17.5` — all had
`castShadow`, and with the sun at 57° a wall that size drops its shadow 7.8
units to one side. The panels' base sits 15.2 units up, which puts the caster at
57° above the horizon from where the player stands: well outside the 29°
half-frame of a 58° lens. Correct lighting, correct geometry, and a stripe that
reads as a stain on the ground.

The measurement that pinned it down — one camera, one column of hub terrain, the
vertex colour read at the same three points as the rendered pixel:

| | vertex colour | rendered luma |
| --- | --- | --- |
| Before the band | 0.411, 0.303, 0.183 | 125 |
| Inside the band | 0.412, 0.304, 0.183 | **59** |
| After the band | 0.426, 0.316, 0.187 | 126 |

The albedo never moved by more than 0.015 across the whole band and the edge took
three samples, so this was shadow and not paint. A ray fired from inside the band
toward the sun hit four panels in a row, each 3 units wide with a 0.4-unit gap,
23.9 units up the sun ray.

Switching the sixteen tapestry meshes off and re-measuring, same pose, same
drawing buffer:

| | hub terrain mean luma | terrain under 90/255 |
| --- | --- | --- |
| Casting | 84.71 | 44.17% |
| Not casting | **86.10** | **41.97%** |
| Casting again | 84.69 | 44.15% |

The third row is the control: switching them back on returned the original number,
so the difference is the flag and not a drifting scene. A frame diff over the
whole viewport, with `measure_frame.py` and the animated pixels masked out, moved
1.97% of the frame by more than 12/255 — the band, and nothing else.

`findOrphanShadowCasters` in `src/world/scene-audit.ts` now stands watch for the
class, exposed as `__ilm.orphanCasters()` in dev and covered by
`tests/orphan-shadow-casters.test.ts`. It reports casters whose base is more than
eight units off the ground, which is where the shadow lands too far away to be
read as its own. On the shipped world it reports one caster, and that one is
accepted: the synthesis tree's canopy, 20 metres across at 13 units, whose shadow
falls 11 units away onto a tree the player is looking straight at. It stayed in
the list under the tapestry for years without anyone reading it — which is the
argument for the check existing, and for reading what it says.

**No island's ground is clipping, and none of them ever was.** The same session
checked, because the mirrors island carries the brightest ground palette in the
world and that is the shape an exposure bug takes. All eight discs were measured
at one camera with the ground isolated by a raycast mask: brightest terrain mean
111.8 (observers-mirrors), darkest 93.7 (valley-living-machines), and **not one
pixel above 235/255** anywhere — the fraction of terrain at or above 245 was zero
on every island, and the single highest value in the whole sweep was 243. The
loom channel's old 148-against-109 reading was an emissive channel, not an
albedo one. If you go looking for a blown-out island, you are not going to find
one.

### The ground's normal map was doing nothing, and it was not the map's fault

**The ground texture is not under-resolved, and it is worth saying so before anyone
goes looking.** The runtime state of all eight island grounds is a 512² normal map and
a 512² roughness map, both with `repeat` left at 1 and `wrapS/wrapT` = `RepeatWrapping`
(1000). That reads at first like the map is stretched once across a 68–92 unit disc,
which would be **0.36–0.66 texels per world unit** and a strong case for re-baking it
four to sixteen times larger. It is not. `repeat` is 1 because the tiling lives in the
geometry: the disc UVs run −5.67…5.67 on the hub and scale with the radius, so one UV
unit is **6.0 world units** on every island and the map lands at a uniform
**85.3 texels per world unit** — about 1.2 cm per texel, with the player roughly 150
texels tall. Anisotropy is 8 of a supported 16, with mipmaps on.

The check that settles it is the number, not the property: `texelsPerUnit` computed from
the disc's measured UV span. Reading `wrapS: 1000` as ClampToEdge (it is 1001) would
have produced a confident, wrong, and very expensive recommendation.

`ground_normal.png` is 358 KB — the second-largest asset in the game — and it is
bound to all eight island grounds at `normalScale 0.55`. Raising that to 3.0,
five and a half times the authored strength, changed the rendered image by
**less than the difference between two consecutive frames of the same state**:

| view | normalScale 0.55 → 3.0 | two frames, no change at all |
| --- | --- | --- |
| resting camera | 0.88% of pixels differ | 0.72% |
| close, looking at the feet | 0.96% of pixels differ | 1.10% |

The standard deviation of lit terrain luminance did not move either: 5.98 →
5.17 on the hub, 12.34 → 12.29 on the mirrors. On flat ground under one
directional light, a working normal map raises both numbers at three times the
strength. Handing the same material a synthetic map settled where the fault was
not: it moved **13.04%** of the frame against a 0.22% baseline. The shader was
sampling a normal map the whole time.

The fault was one line of JSX. With `normalScale={new THREE.Vector2(0.55, 0.55)}`
written inline, **a `normalScale` set onto the material from outside was back to
0.55 within 50 ms** — measured by writing 8 and reading it back at 50, 300 and
1500 ms. Hoisted to a module constant, the same write survives 1200 ms
untouched. What exactly re-applies the declaration is not recorded here; only
those two measurements are.

That is why every attempt to price the map measured the unchanged scene and
concluded the map was the problem, and why 0.55 survived as a plausible number
for so long.

Once it could be tuned, the map turned out to be set far too weak as well.
At 1.5 it moves **5.3%** of the frame by more than 4/255, mean absolute
difference 1.08, at **104.9 FPS against 104.7** — the whole gain is free, same
shader, same texture, same bandwidth. 3.0 moves 17.1% and mean 2.66 and was
**rejected**: the tooth reads as blotches rather than grain, because the cool
rim light reaches the tilted faces and tints them. Half the measured gain is the
better image.

The risk a stronger ground map carries is minification shimmer at distance, and
it is bounded here by the shape of the world rather than by the strength. At the
resting camera, terrain beyond thirty units is **4.6% of the terrain pixels** and
past a hundred units is 0.4% — the eight discs are coplanar and read almost
edge-on, the same fact that made fog useless in "There is nothing far away to
fade". The high-frequency energy of the ground, measured as the mean step to the
right-hand neighbour, rises 47% underfoot between 0.55 and 1.5 but only **21% in
the thirty-to-hundred-unit band** — the increase is smallest exactly where
minification would hurt. At 3.0 it would be 30% there, which is one more reason
that value was not kept.

**Anisotropy is not the lever either.** Since the shimmer worry above is really about
minification, the obvious lever is the sampler's own filter: the ground map is set to 8
of a supported 16, so 16 was measured. Distance is not a screen-space guess here — the
ground is a flat plane under a pitched perspective camera, so image row maps to world
distance analytically (`h / tan(pitch + rowOffset·fov)`), which puts the visible sand
between 4 and 26 units from the player's eye.

| ground distance | anisotropy 8 | two frames, no change | noise floor | anisotropy 16 |
| --- | --- | --- | --- | --- |
| 4–8 units | 2.4001 | 2.4020 | 0.08% | +0.15% |
| 8–14 units | 6.4116 | 6.3633 | 0.75% | **−1.49%** |
| 14–20 units | 7.9237 | 7.9189 | 0.06% | −0.06% |
| 20–30 units | 8.3469 | 8.3447 | 0.03% | −0.01% |

High-frequency energy only moves in one band, by 1.49% against a 0.75% noise floor —
two times noise is not a result — and it costs **1.6% of the frame rate** (112.1 →
110.3 FPS). Past fourteen units the change is indistinguishable from two consecutive
frames of the same state. The far bands also cannot be read as shimmer at all: their
energy *rises* with distance because the shoreline rim, the rocks and the canal enter
the band, so what is being measured there is scene content rather than aliasing.

Kept at 8. The shimmer risk above was already bounded by the world's shape, and this
is the fourth measurement in a row to find the ground normal map is already at the
setting it should be.

The same question was then put to `stone_normal.png` — 281 KB, applied to 77
materials by a triplanar shader patch in `src/world/detail.ts`, with its
strength compiled into the fragment body rather than set as an R3F prop, so it
was never exposed to the inline-Vector2 problem in the first place. It is **not**
inert, and it is not mistuned either. Standing in front of the Great Loom with
every compiled program's strength uniform set together, switching it off moved
1.54% of the frame against a 0.47% baseline: the map is doing real work at its
authored 0.42. Raising it to 0.7 changes the stone by an amount that does not
survive looking at the two frames side by side.

The header's warning that anything past 0.5 shimmers along every silhouette is a
claim, not a measurement. It was not tested; there was nothing here to fix, so it
stays as written.

Two normal maps, one technique, opposite answers: the ground's was doing nothing
and was half a hidden number away from doing something, the landmarks' is doing
its job at the value it was given.

### The flat fill was the environment probe, not the hemisphere light

`Lighting.tsx` said the hemisphere light was left at its authored level "so the
ambient balance the art direction was authored against does not shift". Measured,
that was not where the flatness came from. At the hub, with the sun switched off,
the ambient still delivered **45–61%** of the terrain's brightness on every
island — but moving the hemisphere between 0.4 and 0.14, a 65% cut, changed
shadowed ground from 44.56 to 44.94. It moved up. The light that flattens the
scene is the environment probe.

Cutting the probe instead, and raising the sun to compensate, trades a flat fill
for a shaped key:

| | lit ÷ shadowed terrain | terrain spread | frame mean | FPS |
| --- | --- | --- | --- | --- |
| probe 1.0, sun 2.1 (was) | 2.722 | 38.56 | 75.94 | — |
| **probe 0.6, sun 2.4** | **2.920 (+7.3%)** | **41.18 (+6.8%)** | 76.93 (+1.3%) | 106.4 |
| probe 0.35, sun 2.6 | 3.051 (+12.1%) | 42.74 (+10.8%) | 77.50 | — |

Deeper shadows are what let a faceted low-poly form read as a solid rather than a
cut-out, and 0.6 buys that for a frame mean that barely moves. **0.35 was
measured and rejected**: it looks punchier, but it darkens every metallic surface
in the game along with everything else, and the last 5 points of contrast are not
worth a world full of dead copper. Checked at the Great Loom before deciding,
where the copper rings are the most environment-dependent surfaces there are.

Re-measured after a full reload, from source and not from a runtime override:
environmentIntensity 0.6, sun 2.4, hemisphere 0.4 and rim 0.62 untouched, and
2.920 / 41.18 / 76.93 — the same numbers the live sweep produced.

This is a global change, so it was not checked only where it was measured. The
City of Memory and Council and the Adaptation Cloud Harbor — two of the eight
islands this round had never actually looked at — were walked afterwards: the
towers read as solid rather than as cut-outs, the workshop bench and the sky
frame keep their form, the sand's shadows are deeper and still attached to the
thing throwing them, and no metallic surface visibly dies. Those two are a
judgement from looking, not a number. The figures above are the hub's alone.

#### What each light is actually worth

Cutting the probe 40% made the balance worth writing down. Measured at the
hub, each source removed from the rebalanced rig in turn, reading the ground the
player stands on:

| removed | ground brightness falls by | so it supplies |
| --- | --- | --- |
| sun | 28.88 | **42.3%** |
| environment probe | 3.34 | 4.9% |
| hemisphere | 2.73 | 4.0% |
| rim | 1.25 | 1.8% |

The contributions do not sum to 100% and should not: tone mapping is compressive
and the occlusion pass removes more before the curve is applied. The useful
reading is the ranking. The probe that used to be "45–61% of the ground's
brightness" is now 4.9%, and the key light is six times the next source.

**The rim cannot be judged on the ground.** At 1.8% it looks like a dead light,
and that is the wrong surface to measure it on: a rim exists to separate a
silhouette from the background, which is what happens on walls and towers, not on
a floor whose normal points up. Measured over the whole frame it touches **38.5%
of the pixels**, and switching it off moves **11.2%** of the frame by more than
4/255. It is the second most consequential light in the scene and a ground-band
statistic would have reported the opposite.

#### Bloom, which turned out to be doing exactly what its comment said

Every parameter in the post chain is a number somebody chose, and until this
round there was no way to ask the renderer what any of them did. `PostFx.tsx` now
publishes the effect instances to `window.__postfx` in dev — for the same reason
`scene-audit.ts` exists: the ground's normal map spent its life looking inert
because nobody could reach the uniform that controlled it.

The bloom threshold is live at **0.72**, with the blur pass and the mipmap blur
both on. It is fed by a very small population, which is the point. At the City of
Memory and Council, of 3.2 million pixels: **8** above 220/255, **124** above
200, **844** above 180 — 0.026% of the frame. That seed is what spreads into the
halo. The brightest pixel in the frame is 243, and only 35 pixels in 3.2 million
have a saturated channel, so nothing is clipping to produce the glow.

What could **not** be measured at first was the size of that halo. Reading the
intensity from 0.62 to zero moved 3–4% of the frame by more than 2/255 — but so
did putting it back to 0.62 again, because the Weaver, the water and the grass are
all moving, and averaging inside a state does not cancel a difference measured
minutes apart. That is what `tools/measure_frame.py` was built for, and it was
sitting there unused: with a control frame from the same state it masks whatever
moves and reports the rest.

| bloom 0.62 vs 0, animasyon maskeli | karesin %97,7'si |
| --- | --- |
| 4/255'ten fazla değişen | **%0,574** |
| 12/255'ten fazla değişen | %0,315 |
| en büyük fark | 115 |

The hand-rolled measurement said 3–4%. It was about six times too high, and all of
the difference was the animation it had failed to mask — the Weaver, the water
and the grass, in a scene where the thing being measured covers half a percent of
the frame. A seed population of 0.026% spreading to a 0.57% halo is a
twenty-fold glow for a handful of emissive accents, which is what a night world
wants and roughly a fifth of what the broken number claimed.

So the comment's claim is now a **verified** one rather than an assumed one, and
nothing about the bloom was changed, because there was nothing here to fix.

#### And the vignette was about to drive the corners onto the floor

Cutting the probe in the previous round darkened everything, and a vignette
multiplies whatever it is given. Measured at the hub, the pixels at or below
2/255 went from **0.172% of the frame to 0.472%** — a 2.7x rise in a change that
did not mean to touch that end of the range.

It was the corners, and it was the vignette rather than the lighting. Sorting the
frame by distance from its centre, the outer fifth — 13.2% of the area — carried
**1.958%** of its pixels at or below 2/255, against 0.001% in the 60-80% ring.
With the vignette's darkness at zero and the lighting untouched, the same corners
fell to **0.996%**: almost all of that black was the vignette, and the remainder
is the geometry actually standing in them.

| darkness | corner mean luma | corners at ≤2/255 |
| --- | --- | --- |
| 0.62 (was) | 47.8 | 1.958% |
| **0.42** | **61.3** | 1.189% |
| 0.28 | 67.4 | 1.011% |
| vignette off | — | 0.996% |

Below about 0.3 the corners stop responding, because what is left there is the
dark geometry rather than the effect — so turning it down further would spend
the vignette for nothing. 0.42 lifts corner detail by 28% and keeps the frame
reading towards its centre.

This is what touching one thing does to the next: the vignette had been
calibrated against an ambient fill twice the strength this world now has, and
nothing had measured that.

#### And occlusion, the other thing the ambient change touches, is fine

The same question asked of N8AO, whose `intensity={1.6}` has carried no
rationale and had no way to be questioned — the pass is a group pass rather than
an effect in the chain, so it was not reachable. It is now.

| AO intensity | frame mean | 1st percentile | under 10 | under 40 |
| --- | --- | --- | --- | --- |
| **1.6 (was)** | 82.55 | 5 | 3.21% | 16.26% |
| 1.0 | 83.23 | 6 | 2.96% | 15.49% |
| 0 (off) | 84.34 | 7 | 2.56% | 14.24% |

Occlusion at 1.6 darkens the frame by **2.1%**, pushes nothing to black — the
first percentile moves from 7 to 5 — and barely flattens anything, with the
standard deviation going 40.43 → 40.17. That is a proportionate contribution,
not the doubling the vignette was doing, so it stays where it is.

Two of the three numbers in this chain turned out to be mistuned and one did not.
That is the useful shape of an audit: the finding is not "everything was wrong",
it is *which* things were wrong and by how much.

The same inline-Vector2 footgun was on both of the canal's normal-scale props
and is fixed with them. It never broke the canal — those values were edited in
source, which is the one thing the prop could not undo — but it meant the canal
was untunable in exactly the same silent way.

### The shadow was too soft to name what was casting it

`shadow-radius` was 2.4 and had never been questioned. It is worth being precise
about what that number is even doing, because the chain has a trap in it: R3F's
`shadows={true}` asks for `PCFSoftShadowMap`, **three.js has removed that type** and
substitutes `PCFShadowMap` with a console warning
(`WebGLShadowMap.js:99`), and of the three remaining shader branches only `PCF` and
`VSM` read `shadow.radius` at all. So the value is live, and the shader spends it as
`radius * texelSize` across a five-tap Vogel disc. At 2.4 on a 2048 map covering 88
world units that is a sampling disc **0.10 units across** — a tenth of the player's
height.

Measured at the hub with a same-setting control pair, the difference is not subtle
once you look at what the shadow is of:

| radius | frame mean abs. diff | control pair | pixels past 4/255 | control |
| --- | --- | --- | --- | --- |
| **2.4 (was)** | — | 0.375 | — | 0.77% |
| **0.5** | **0.587** | — | **3.10%** | — |
| 0.25 | 0.751 | — | 3.40% | — |
| 6.0 | 0.336 | — | 0.61% | — |

At 2.4 the player's shadow on the sand is a smudge whose caster you cannot name. At
0.5 the hat, the brim and the edge of it are all legible. The change moves the hub
four times its noise floor, and Memory Council City confirms the direction at 1.238
against a 0.695 control — weaker there only because that frame animates more. Frame
standard deviation rises 46.19 → 46.94 at the council and high-frequency energy falls
3.6%, which is what a crisper edge on a soft term looks like numerically.

**It is free, and the first measurement said otherwise.** Five samples at 2.4 and
three at 0.5 measured 99.65 and 100.4 FPS, inside the 98–104 spread of a *single*
setting. A single reading at each had suggested a 5.7% gain, which was drift.

**0.5 rather than 0.25** because the two are indistinguishable — 0.335 mean against a
0.375 control, i.e. below noise — so 0.5 keeps a margin over the point where the
sampling disc drops below one shadow texel and the shadow goes hard. And **2.4 was
already the most softness this map can produce**: raising it to 6.0 lands at 0.336,
under the control, because past a certain point the disc is wider than the texels it
is sampling and there is nothing left to average.

#### And the other two shadow settings were already right

Sharpening the shadow edge is exactly when acne and peter-panning become visible, so
the other two numbers on that light were put through the same treatment.

**`bias` and `normalBias` are doing real work, and it is not on the ground.** Zeroing
both moves **25.5% of the frame** by more than 8/255, and a difference map puts it
almost entirely on the left-hand loom, where the change is *negative* — those pixels go
darker without the bias, which is self-shadowing. Open sunlit sand is unaffected
either way, checked at 3× magnification: the relief is the normal map's, with no
striping or stipple to attribute to acne.

| bias / normalBias | loom mean luma | vs source | shadowed ground area |
| --- | --- | --- | --- |
| **−0.0006 / 0.035 (source)** | 39.527 | — | 14.053% |
| −0.0003 / 0.018 | 39.436 | −0.091 | 14.103% (+0.35%) |
| 0 / 0 | 32.221 | **−7.305** | 14.320% (+1.90%) |

Half the bias produces **the same image** — 0.091 luma on the loom, 0.35% more shadow on
the ground — while removing it entirely costs 7.3 luma of acne. So there is headroom on
the axis of acne-versus-peter-panning and no reason to take it: the current values cost
about a third of one percent of shadow area, and there is no contact defect to buy back.
They also sit where the geometry puts them: at 2048 over an 88-unit box the texel is
0.043 units, so `normalBias` 0.035 is **0.8 of a texel**.

**Shadow resolution has headroom, and the only lever for it is expensive.** Doubling
the high tier's shadow map to 4096 is a real change — 0.4539 mean against a 0.1913
control, 2.4× the noise floor, with a maximum difference of 219 — and looking at it,
the wand and the brim edge *inside* the player's shadow read more clearly. It costs
**11.2% of the frame rate**: 2048 measured 102.9, 104.1, 103.8 and 4096 measured 91.4,
90.7, 93.8. A subtle gain for a double-digit price is the wrong trade at this tier.

The cheap alternative — trimming `SHADOW_SHOULDER`, which spends 20 of the hub's 88
units on margin — would buy about 13% more texels per unit, a quarter of what 4096
delivers, for a change that would be invisible by comparison and would reopen a shadow
box whose fit was deliberately reworked. Not taken.

#### The medium tier was the only one still paying for a smaller shadow map

The comment that scaled the shadow map by tier — "a phone rendering a 1024 map over
the same box is trading detail for frame rate whether it wants to or not" — stopped
being true when the low tier stopped drawing shadows at all. `shadowsOn` is false
there, so medium was left as the only tier paying for a smaller map with nothing
bought in return.

Measured on the medium tier itself rather than extrapolated from high, with a
same-setting control pair:

| | mean abs. diff | pixels past 4/255 | vs control |
| --- | --- | --- | --- |
| control (2048 → 2048) | 0.2124 | 0.388% | — |
| **1280 → 2048** | **0.3939** | **1.697%** | **1.85×** |

That is the same ratio high shows for the same step (0.3636 against a 0.1913 control,
1.9×), so the tier that was behind was not behind for a reason. It is free there:
three samples each measured **112.4 FPS at 1280 and 110.2 at 2048**, with the two
ranges almost entirely overlapping. Medium runs refresh-bound at 112, so there is
nothing here to spend.

The map size does more than remove stair-steps, which is worth knowing before
tuning it again: the shadow texel is the unit `shadow.radius` is counted in, so a
smaller map silently widens the penumbra as well. At 1280, `radius` 0.5 is 0.034
world units across; at 2048 it is 0.021. Medium was not just coarser, it was
blurrier by half again — and it inherited the fixed radius from the high tier without
that consequence being visible anywhere.

This is why it stops at 2048: 4096 costs **11.2% of the frame rate** on high.

#### The medium tier's resolution cap is also load-bearing

Medium caps device pixel ratio at 1.6 against high's 1.75, and at the same window
that is a real difference in what gets drawn: **2076×1288, 2.674M pixels, against
2271×1408 and 3.198M** — medium resolves 16.4% fewer pixels. Measured on the medium
tier by raising the cap in source and letting HMR apply it:

| | pixels | FPS samples | mean |
| --- | --- | --- | --- |
| dpr 1.6 (source) | 2,673,888 | 99.4 · 104.9 · 96.7 · 104.9 | 101.5 |
| dpr 1.75 | 3,197,568 | 82.3 · 96.6 · 97.9 · 96.0 · 97.8 · 102.1 · 103.2 | 96.6 |

**−4.8% of the frame rate**, for what the extra pixels buy: at the same window size
the higher render carries **+2.4% horizontal and +3.6% vertical edge energy** — real,
but small, and largely redundant with SMAA, which already runs on every tier. Left at
1.6.

The first sample at 1.75 came in at 82.3 and made the cost look like 9.1%. It was the
frame immediately after HMR rebuilt the framebuffers; the median of the seven is 97.8,
and it is the median that the decision should have used from the start.

### The environment probe is an ambient term, and its sun disc is not the highlight

The 128×64 procedural probe drives every metal surface in the world, and its
`environment.ts` comment claimed the shared sun direction "is what makes the
specular highlight on a copper ring land on the side the sun is actually on".
That was never measured. Measuring it, by switching `environmentIntensity` to zero
at a fixed camera and separating the band into its specular pixels and the fill
around them:

| probe | highlight pixels (luma > 150) | fill pixels (luma ≤ 150) |
| --- | --- | --- |
| 0.6 (source) | RGB 141.7 · 152.3 · 159.0 | RGB 28.7 · 29.0 · 29.3 |
| 0 | RGB 139.7 · 150.7 · 157.7 | RGB 22.7 · 22.7 · 22.7 |
| **contribution of the probe** | **+0.90** | **+7.11** |

The disc is worth almost nothing to the highlight and seven luma to the fill. The
highlight on that ring is the directional light's own specular plus the sky, and it
is *cooler* than the sun tint it was supposed to carry — RGB rises from red to blue,
not the other way round. The file's claim has been narrowed to what the measurement
supports; the probe is an ambient term in this world, and the comment now says so.

**Nothing is clipping.** The band's peak is 219 and the whole frame peaks at 233.9,
with zero pixels at or above 250 — so the disc's 2.6 energy is not blowing out a single
metal anywhere, which was the other thing worth checking before touching it. What the
probe *does* move is broad: switching it off changes 27.9% of the frame by more than
4/255, but only 0.24% by more than 60, which is the signature of a fill term.

### All eight islands, after a global tone-curve change

A change to the tone curve is a change to every island at once, and two of the three
values shipped this round — ACES Filmic and the shadow radius — are global. Neither had
been looked at anywhere but the hub and the council. Walking all eight discs at their
own arrival poses:

| island | frame mean | p99 | peak | ≥250/255 |
| --- | --- | --- | --- | --- |
| cartographers-terrace | 126.7 | 192.4 | 247.8 | 0% |
| flow-foundry | 79.3 | 202.4 | 245.3 | 0% |
| collective-gardens | 113.9 | 142.2 | 176.5 | 0% |
| adaptation-cloud-harbor | 80.5 | 132.1 | 245.1 | 0% |
| hub | 73.5 | 142.2 | 241.5 | 0% |
| valley-living-machines | 78.7 | 182.7 | 243.4 | 0% |
| observers-mirrors | 112.9 | 176.2 | 233.0 | 0% |
| memory-council-city | — | — | — | — |

**Nothing clips anywhere.** The brightest frame in the world peaks at 247.8 and not one
pixel reaches 250. The Mirrors island was the risk — it is the brightest ground here,
and ACES raises contrast — and it is in fact the *second darkest* by peak.

Two frames looked like findings and were not. Collective Gardens has the second-lowest
p99 in the world, and it is because the teleport lands the camera inside a dune: one
lit slope fills the screen and the player is off-frame. Cloud Harbor's p99 is the lowest
at all, and it is an even mid-tone sand field under an even sky. Neither is a rendering
problem; both are what the pose happens to contain. Low p99 is not a defect until you
have looked at what fills the frame.

### The tier nobody is given, and the device classes the detector has no name for

The auto-detection is one line — `handheld ? 'low' : 'high'` — so **the medium tier is
opt-in only**. It is reachable from the settings dropdown and nothing else. That matters
because medium is not a degraded tier any more; it carries full-resolution AO, SMAA and
the same 2048 shadow map as high.

How far apart the two are, at one camera with a control pair:

| | mean abs. diff | pixels past 4/255 | frame mean |
| --- | --- | --- | --- |
| high → high (control) | 0.297 | 0.70% | 73.50 / 73.47 |
| high → medium | 0.750 | 1.64% | 73.46 |

**2.5× the noise floor** — real, and about half the size of the shadow-radius change —
but the frame brightness is identical to two decimals. The difference is scattered
through the upper half of the frame, where the extra pixel ratio resolves distant
detail; nothing in the foreground moves.

Running the detector's predicate over device profiles shows what it has no name for:

| profile | coarse | touch | narrow | verdict | tier |
| --- | --- | --- | --- | --- | --- |
| phone, portrait | yes | 5 | yes | handheld | low |
| phone, landscape | yes | 5 | yes | handheld | low |
| **tablet, portrait (iPad)** | yes | 5 | **no** | not handheld | **high** |
| **tablet, landscape** | yes | 5 | **no** | not handheld | **high** |
| desktop, narrow window | no | 0 | yes | not handheld | high |
| **touch laptop, narrow window** | no | 10 | yes | **handheld** | **low** |
| desktop | no | 0 | no | not handheld | high |

A tablet never satisfies `min(w, h) <= 480` in either orientation, so both land on
`high` — 2048 shadow maps, full-resolution AO, SMAA and a 1.75 pixel ratio. And a
touch-capable laptop with a narrow window satisfies `touchPoints > 1 && narrow`, so a
desktop-class machine is dropped to `low` because someone resized the window.

Neither of those is corrected here. The visual gap between high and medium is
measured and small, but **the frame rate either class would get is not measured at
all**, and the rule this project has been holding is not to guess on behalf of devices
nobody has measured. What is recorded is the shape of the decision: the tiers are
close enough that the default is doing less than it looks, and the detector's two blind
spots are a tablet and a narrow window.

#### What the generated maps actually contain, and why regenerating them is not the answer

The soil's height field is `fbm(size, 8, 5)` — octaves at 8, 16, 32, 64 and **128** cells
across a 512-pixel image, which is four pixels per lattice cell at the finest and looks
like it should alias the moment the ground is minified. That is the obvious suspect for
the distance shimmer above, and it is worth measuring rather than assuming: take the
radial power spectrum of the three maps the generator writes.

| map | below 0.125 cyc/px | 0.45–0.50 cyc/px (at Nyquist) |
| --- | --- | --- |
| ground_normal | **95.98%** | **0.01%** |
| stone_normal | 98.79% | 0.00% |
| water_normal | 99.99% | 0.00% |

**The maps are extraordinarily low-pass.** A twentieth of a percent of the soil's energy
sits in the top eighth of the band, and a hundredth of a percent is within a hair of
Nyquist. The reason is the `gain=0.5` on each octave plus the normalisation to a peak
slope: the finest octave carries 1/16th the amplitude of the coarsest, and by the time
it is finite-differenced and rescaled the top of the band is empty.

So the shimmer cannot be coming from the maps' spectral content, and regenerating them
with a Nyquist rolloff would be a change with nothing to change. The height field is the
derivative's integral, so its spectrum is concentrated at low frequencies more tightly
still — the conclusion holds a fortiori. Combined with anisotropy 16 doing nothing, the
distance shimmer is mip selection, not the source texture, and it stays where it was
recorded: bounded by the world's shape, 4.6% of terrain beyond thirty units.

#### And the tiling claim holds

`ground_texture.py` says every map it writes is "seamlessly tileable", and the discs
repeat these eleven times across their radius, so a seam would be a grid of straight
lines running through the ground. That is a claim about a property of the image, and it
is testable: compare the step across the wrap (last column against first) with the step
between interior columns. A seamless tile scores about 1.0; a seam scores far above it.

| map | wrap / interior, X | wrap / interior, Y |
| --- | --- | --- |
| ground_normal | 0.98 | 0.98 |
| stone_normal | 0.48 | 0.72 |
| water_normal | 1.06 | 1.11 |
| ground_rough | 0.33 | 0.31 |

All four sit at or below 1.11. The stone map scores *below* 1 because its ridged term
puts its largest steps at creases that happen not to cross the border, and the ground's
roughness map scores 0.33 because it is a deliberately narrow 0.88–1.0 band whose
interior steps are steeper than the wrap is. Nothing here is a seam.

### The player's shadow stops two thirds of the way along the bridges

Walked to the bridge from the hub to the Cartographers' Terrace and the character has
**no shadow at all** on the deck. Not a faint one — none, while the same character on
the hub throws a crisp one two seconds earlier.

The deck is not the reason. The bridge is six `BoxGeometry` layers, and the walking
surface — `#c9b79a` at y = 0.6 — has `receiveShadow: true`. It is receiving. What is
missing is anything to receive *from*: **none of the six layers has `castShadow` set**,
the rails included.

The real cause is coverage. Unlocking every region builds **seven** bridges — six
radiating from the hub and one more — and each averages 163 units from rim to rim. With
the box half-width the code computes (`island.radius + SHADOW_SHOULDER` = 34 + 10 = 44),
projecting the walk onto the light's own axes:

| bridge | shadow ends at | shadowless share |
| --- | --- | --- |
| hub → cartographers | 36% | 64% |
| hub → flow-foundry | 32% | 68% |
| hub → council | 32% | 68% |
| hub → harbor | 34% | 66% |
| hub → gardens | 34% | 66% |
| hub → mirrors | 29% | 71% |
| **mean** | **33%** | **67%** |

**Two thirds of every hub bridge is walked with no shadow at all**, and it is worst on
the longest one. The box is fitted to the island and a bridge is over a hundred and sixty
units long, so this is not a fitting mistake — it is the fitting working as designed.
`SHADOW_SHOULDER`'s comment already concedes the limit: the shoulder "only catches the
small return cast of the next few units of deck".

The obvious repair is to widen the shoulder, and it is the wrong one. Taking it from 10
to 40 takes the box from ±44 to ±74 and drops the hub from **23.3 texels per unit to
13.9** — a 40% loss of shadow detail everywhere, to pay for the ribbon of deck where
the player spends a fraction of the time. Keeping the box on the island instead of
following the player is the fix already argued in `SHADOW_SHOULDER`, and re-opening it
to save a shadow on a bridge would trade the whole island for it.

So it stands, now measured rather than assumed: shadows end where the island ends, and
on a bridge that is two thirds of the way along.

The seventh bridge's two ends could not be resolved from the bounding spheres alone —
its long axis was estimated from a rail layer rather than the deck — so it is counted
but not measured. The six hub-radial ones are unambiguous.

#### …and the rails now cast, which was the free half of it

The player's shadow is the part that needs a wider box and cannot have one. The
bridge's *own* shadow could have been had for nothing, and was simply missing: of the
six layers that build a bridge, the deck had `receiveShadow` and **none of them had
`castShadow`**, the rails included. A turquoise rail that casts nothing reads as a
stripe painted onto the deck rather than a raised thing standing on it.

Measured at one bridge with a same-setting control pair:

| | mean abs. diff | past 4/255 | past 12/255 |
| --- | --- | --- | --- |
| rails casting → not | **2.148** | **3.34%** | **2.53%** |
| casting → casting (control) | 0.181 | 0.50% | 0.23% |

**11.9× the noise floor**, taking **65.8 luma** off the band the rail shadows onto,
and free: two samples each measured **97.2 FPS casting and 97.4 not** — both rails are
24-vertex boxes. It does not alias either; high-frequency energy on the distant bridges
moved by −0.0%, the near one by +0.1%.

The deck still does not cast, because it is half a unit thick over open sky with
nothing underneath to receive it.

#### Could occlusion stand in for the missing shadow? No — by a factor of twenty-seven

The obvious cheap fix is that the shadow map does not cover the bridge, but the
occlusion pass is screen-space and does not care about shadow boxes. On the bridge,
outside the box entirely, N8AO is doing real work: switching it off moves **9.11% of
the frame** past 4/255 and lifts the frame mean by 1.56.

It is not doing it where it is needed. In the window around the player, at the same
fraction of the frame:

| | luma |
| --- | --- |
| the player's cast shadow at the hub (2nd vs 98th percentile) | **135.97** |
| what AO contributes beside the player on the bridge | **5.00** |

**AO supplies 3.7% of what the cast shadow supplies** — a twentieth of a twentieth.
The bridge walk really is shadowless: the character is attached to the deck by nothing
but its own silhouette, and on the hub that silhouette has a dark shape beside it that
the bridge does not.

That closes the cheap hypothesis and leaves two that are not. Widening the shoulder is
the one already rejected, at 40% of the island's shadow resolution. Following the
player is rejected too, for cutting island shadows off-centre — though a *hybrid* that
recentres only once the player leaves the island's box is the obvious thing nobody has
measured. The other is a fake contact blob, which is free and would need suppressing
wherever the real shadow already lands.

None of those is a decision to take on the strength of one bridge — until the time it
costs was measured, which turned out to be the thing that changes the answer.

`Player.ts` walks at **3.7 units per second** and runs at 7.6, and `Scene.tsx` passes
no override, so those are the shipped numbers. A bridge averages 163 units and two
thirds of it is shadowless — 109 units:

| | per crossing | seven bridges, one full circuit |
| --- | --- | --- |
| walking (3.7/s) | **29.5 s** | **3.4 min** |
| running (7.6/s) | 14.4 s | 1.7 min |

Which is **9–23% of a session**, depending on how long it runs and how many circuits
the player makes. "A few seconds on a bridge" was the wrong estimate, and it was mine:
it came from counting how often the bridge is *seen* rather than how long it is
*walked*. The character spends real minutes out there with nothing tying it to the
deck.

So the priority is not "low, document and move on" after all. It is the largest
remaining visual defect in the world by the only measure that matters — how long a
player spends looking at it. The blob shadow is the one candidate that is both free
and free of artefacts, so it deserves its own measurement rather than a paragraph
inside this one. It was built twice.

#### The blob shadow was built twice, measured, and the camera is why it cannot work

A `ContactShadow` was written against the sun rather than the Weaver: same island,
same shoulder, same `distance > radius + SHADOW_SHOULDER` test the shadow box uses,
so it could never double-draw a real shadow. Two placements were measured on the
hub → Cartographers' deck:

| | frame mean abs. diff | share |
| --- | --- | --- |
| offset 0.5 × length | 0.3197 | 1.25% |
| **offset 0.9 × length, 2.4 wide, opacity 0.45** | **0.2351** | **0.60%** |

Moving it further from the hat made the number *smaller*, which is what a substitute
shadow should never do. `tools/diff_map.py` — which amplifies `|A − B|` into a heat
map instead of only summing it, because a sum is dominated by whatever else moved —
says plainly that the strong red in those captures is the **orbiting marker on the
bridge**, and that the character appears only as a one-pixel outline. The blob is in
neither picture.

Isolated in the same frame, with only the material toggled, its own contribution at
its own centre was **+0.02 luma**. Nothing.

**The mesh was fine, and part of that result was measured on a broken baseline.** The
deck's top face used to sit at y = 0.85 while the character walked at y = 0, so a
patch placed at `focus.y + 0.02` was **0.83 units inside the slab**. The deck is now
drawn with `DECK_TOP_Y = 0`, level with the island ground, and the patch was rebuilt
against it at the size the shadow implies rather than around the feet: the authored
key sits at **48.16°**, where `tan = 1.1168`, so the 1.78-unit Weaver throws a
shadow **1.59 units** long and the patch was cut from 2.4 × 2.95 down to
**1.05 × 1.34** — under the caster rather than around it. It then rendered, and the
ceiling turned out to be the finding:

| patch | centre delta | × the same-setting control |
| --- | --- | --- |
| radial texture, opacity 0.45 | −2.15 | 3.8× |
| radial texture, opacity 1.0 | −2.60 | 4.6× |
| **opaque black, no texture at all** | **−2.00** | — |

Doubling the opacity bought **0.45 luma**, and a quad with no texture and no alpha —
which cannot be accused of a blending subtlety — bought no more than the textured
one. The same quad on open ground reads 17, so the bridge's 2 is not a limit of the
material: it is the camera angle, measured below.

**The technique itself is not the limit — the camera angle and the texture are.** The
same size of solid black quad, dropped on **open hub ground** where nothing stands in
front of it and where the real cast shadow reads 135.97, measures:

| patch on open hub ground | centre delta | share of a real cast shadow |
| --- | --- | --- |
| no patch (baseline, luma 33) | — | — |
| **opaque black quad** | **−17.18** | **12.6%** |
| soft 128×128 radial texture, opacity 1.0 | −1.44 | 1.1% |

A substitute shadow **can** darken visibly. But the two rows also say the soft radial
version delivers **12× less** than the opaque one it was supposed to improve on: its
gradient reaches alpha 1.0 at the centre and 0.66 at the half-way stop, so a window
over the inner third should sit near 0.85 and land within a luma or two of the opaque
row. It does not. Whatever the cause — the canvas texture's alpha is not arriving at
the fragment the way the stops say it should — the consequence stands on its own: a
patch built from that texture is not a softer shadow, it is a shadow that is not
there.

**Why the bridge view hides it.** `SUN_DIRECTION` is `(0.579, 0.745, 0.331)`: its
horizontal part points toward **+x, +z**, and the play camera trails the player at +z,
so the camera sits on the **sun's side**. Every shadow in this world therefore falls
*away* from the viewer and *behind* the thing casting it. On open ground the ground
continues past the character and the patch's outer half is still there to read; on a
bridge the patch is 1.59 units long against a character 1.78 units tall standing
directly in front of it, and almost none of it survives. Offsetting it sideways until
it cleared would stop it being a shadow and make it a smudge beside the player — the
failure the code comment predicted when it said the patch should read as the shadow it
stands in for rather than as a mark under the player's feet.

**The sun's azimuth was measured before accepting that.** Rotating the key light about
its own axis, on the hub, with the player's screen position held fixed:

| azimuth | visible-shadow contrast | pixels 15+ below the local median |
| --- | --- | --- |
| **29.8° (source)** | **48.2** | **14 701** |
| 29.8° (same-setting control) | 48.2 | 14 794 |
| 119.8° | 39.3 | 13 059 |
| **−60.2°** | **55.0** | **19 010** |
| **209.8°** | **53.1** | **19 248** |

The metric says the other two buy **~30% more visible shadow** — and the metric is
wrong, because what it counts is everything darker than the local median, and those
azimuths put the **character itself** in shade. Caught by looking rather than by the
number: at −60.2° the Weaver's face and robe go dark and the scene loses its subject.
The source azimuth front-lights what the player is looking at, and the hidden shadow
is the price. That is the right trade for a game, and it is now measured rather than
assumed.

So the option is closed **for the bridge**, not in general. An opaque substitute is
worth **12.6%** of a cast shadow where the camera can see it and **1.9%** where the
camera puts it behind the character — roughly a seventh survives — and the bridge is
the one place in the world walked with no shadow at all. Both halves are known now,
which is more than the option had before it was built: the material can do the job,
the texture cannot, and the bridge view is the one view that will not show it.

#### …and the repair that was left unmeasured turned out to be free

The paragraph above used to end with the honest repair being the one option nobody
had costed: *"a box that follows the player off the island — or nothing."* It was
left as a note because widening `SHADOW_SHOULDER` is expensive, and following the
player everywhere is expensive. **Neither of those is what the fix does.** The box
stays on the island while the player is on it, and goes with the player only once
they are not:

| where the player is | box centre | half-width | texels per unit |
| --- | --- | --- | --- |
| on the island | the island | radius + 10 = 44 | 23.27 |
| off it, on a bridge | **the player** | 24 | **42.67** |

Measured on the hub before the change, a player standing on the bridge was **98
units from the box centre with a box of ±44** — not a soft shadow, none. The
hand-over is the part that makes it free: an island the player has left is one they
cannot see the shadow detail of, so taking the box away costs nothing they were
looking at. And a player on a bridge is closer to the ground than an island ever is,
so the travelling box is the *tighter* one and buys **nearly double the resolution**
(42.67 against 23.27) — the opposite of the shoulder trade that was rejected.

Measured on the hub → Flow Foundry deck at (0, −80), against the same frame with
the sun's `castShadow` switched off and a same-setting control pair for the floor:

| window around the player | shadows on | shadows off | delta | × the control |
| --- | --- | --- | --- | --- |
| r = 60 px | 52.86 | 76.05 | **−23.19** | **66×** |
| r = 120 px | 69.82 | 86.27 | −16.45 | 6.0× |
| r = 200 px | 86.04 | 91.62 | −5.58 | 5.2× |

The Weaver casts a shaped, soft-edged shadow onto the deck and is attached to it.
Before, they stood on the bridge attached to nothing.

**Free, and it stays free.** Three samples on the deck measured **94.9 / 96.5 /
96.5 FPS, median 96.5** — the map is still 2048² and a directional shadow costs the
same whether the box is tight or wide, so nothing was added. The island is
untouched: standing on the hub the box reads centre (0, 0), half-width 44, 23.27
texels per unit, exactly as before.

The hand-over is a hard switch, so it was looked at rather than assumed: captured
one step inside the boundary (z = −41) and four steps outside (z = −48), the
island's own shading reads the same in both, because at the crossing point the
player is already ten units past the shoreline and the island is behind them. The
rule is a value — `shadowBoxFor(focus, island)` — with eight tests pinning the
boundary, the inclusive edge, the null-island case and the property that matters
most: **the player is never left standing outside the box drawn for them.**

So the defect is closed by measurement rather than deferred: 29.5 seconds a
crossing, 3.4 minutes a circuit, now shaded. `diff_map.py` stays: the next
attempt's first reading is a location, not a total.


#### The audit that would have caught it

`findOrphanShadowCasters` asks whether a shadow lands where the player cannot connect
it to. The rails needed the complementary question — whether something the player is
looking at is **not attached to the ground at all**, because the tie is missing — and
it had no home until now. `findMissingShadowCasters` in `src/world/scene-audit.ts`
asks it, and `__ilm.missingCasters()` exposes it beside the orphan-caster screen.

It reports ten meshes on the shipped world, and all ten are deliberate exceptions:

| reported | why it is right |
| --- | --- |
| 7 bridge decks | half a unit thick over open sky, nothing underneath to receive |
| 2 canal steps | 0.4 tall; the shadow would be a hairline |
| 1 synthesis-tree column | a 24-unit turquoise light shaft at the hub — a beam, not an object |

The band is a **full unit** above the ground rather than half, and that is a finding
rather than a guess: a rail is two boxes. The turquoise post stands on the deck and
the copper cap stands on the post, at 0.75 units, so a band stopping at the deck would
have caught fourteen of the twenty-eight rails and declared the job finished. The
first version of this test said two of four where it should have said four, and that
was the threshold being wrong rather than the rails being partly innocent.

Ten tests, and the count is a contract: if a future prop lands on the sand without
`castShadow`, this is the check that says so.

### Four things this round ruled out

The same session chased the island palettes and found the measurement was wrong
before the finding was. A per-island sweep read **one frame through eight
masks**, so every island reported the same number to three decimals — a spread
of 1.006, which is what a mask bug looks like when you are unlucky enough for it
to be unremarkable. Redone at each island's own pose, with the camera read back
and compared before a single pixel was counted:

- **Nothing is clipping.** Across all eight discs, at one camera, behind a raycast
  mask: brightest terrain mean 111.8, darkest 92.3, and **not one pixel above
  235/255**. The mirrors island is the brightest ground in the world and it is
  not close to blown out.
- **The ambient is 45–61% of the ground's brightness**, at every island, measured
  by switching the sun off and reading what was left. That is a lot, but it does
  not flatten the islands: the ambient-only render actually spreads *wider*
  (1.76×) than the full one (1.57×).
- **The synthesis tree's shadow is not why the hub is dark.** Turning it off
  moves hub terrain mean luminance 85.78 → 87.11, about 1.5%, and costs the
  shadow's own explanation. The 42% of hub ground below 90/255 is not the tree.
- **The albedo-to-brightness link could not be measured.** On flat, unshadowed
  ground under the sun alone it must be near-perfect, and it came out near zero.
  The cause was the instrument: `face.a/b/c` index the *index buffer* on an
  indexed geometry, so the per-pixel albedo was read from the wrong vertices.
  Fixing that moved the number without making it meaningful, and the honest
  conclusion is that face-averaged albedo is not a per-pixel albedo at all.
  Measuring it properly needs barycentric interpolation, which is not written.

### The tone curve was the thing washing the world out

Every number in the light rig above was tuned against **AgX**, and that turned out to
be the constraint nobody had questioned. AgX is the better-behaved curve in
isolation — it holds shadow detail where ACES crushes it — but on a world lit like
this one it reads washed: the stone goes cream, the coral goes pale salmon, and the
midtones lose the separation that makes geometry legible at distance.

Measured at two fixed cameras on the **high** tier (2271×1408 drawing buffer,
2596×1610 captures) — the only tier where the full chain runs, so the numbers do not
carry over to medium, where bloom is at 0.42 instead of 0.62 and SMAA is absent. Each
carries a **same-mode control pair** so the frames could be proven repeatable before a
single pixel was counted:

| camera | control (AgX→AgX / ACES→ACES) | mean abs. diff | pixels past 4/255 |
| --- | --- | --- | --- |
| hub (0, 0) | ACES → ACES | 0.359 / 255 | 0.65% |
| council (138, −84) | ACES → ACES | 0.442 / 255 | 1.18% |

Sharpness matched to three decimals across each control pair (0.8012 vs 0.8011 at the
hub, 0.9353 vs 0.9376 at the council), so the A/B that follows is signal, not drift.

| | mean luma | 1st pct | chroma (all) | chroma (>40% luma) | midtone contrast | shadow contrast | clipped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **hub — AgX** | 82.58 | 5.35 | 0.4539 | 0.3065 | 0.0044 | 0.0031 | 0.0000% |
| **hub — ACES** | 73.70 | 2.35 | 0.5574 | 0.4193 | 0.0064 | 0.0022 | 0.0024% |
| | −10.8% | −56% | **+22.8%** | **+36.8%** | **+45.5%** | −29.4% | |
| **council — AgX** | 110.57 | 34.44 | 0.2331 | 0.1903 | 0.0039 | 0.0017 | 0.0001% |
| **council — ACES** | 107.96 | 18.01 | 0.3097 | 0.2522 | 0.0057 | 0.0013 | 0.0023% |
| | −2.4% | −47.7% | **+32.8%** | **+32.6%** | **+44.2%** | −28.0% | |

The change is global rather than regional: **66% of the hub frame and 82% of the
council frame** move by more than 4/255, and after excluding what animates — 1.0% and
1.3% of the frame — the numbers barely move (10.92 and 11.13 mean absolute
difference). Whole-frame local contrast rises 15% at the hub and **33%** at the
council.

**The cost is real and was kept on purpose.** Shadow local contrast falls about 29%
at both cameras and pixels below 8/255 go from 1.85% to 5.95% of the hub frame — ACES
has a harder toe than AgX, and this world is lit at night, so the toe is where it
lands. That was checked by looking rather than assumed: at the hub the loom's woven
texture still reads in the darkest third of the frame, and the floating island's
underside stays legible as a shape rather than becoming a hole. Highlights also newly
clip, but **0.0023% of the frame — about 100 pixels of 4,179,560** — which is the
number that decides it is not a highlight rolloff problem.

**There is no in-between setting, and the reason is worth recording.** The effect
exposes a `blendMode.opacity`, which reads like a dial for how much ACES to apply.
Writing 0.7 produced a frame that matched the full setting to three decimals on every
statistic — chroma 0.5579 vs 0.5574, midtone contrast 0.0065 vs 0.0064 — i.e. smaller
than the animation noise the control pair had just measured. A control that cannot be
reached is not a control, so the choice is the two curves or nothing.

One trap for anyone repeating this: `ToneMappingMode` is an enum whose AgX member is
**7**, not 8. `8` is `NEUTRAL`, and the failure is silent — the frame renders, it is
just the wrong curve. The live check is `__postfx.tone.defines.get('toneMapping(texel)')`,
which reads the shader define the switch actually wrote: `AgXToneMapping(texel)` vs
`ACESFilmicToneMapping(texel)`. The mode property on the effect instance is a
deprecated getter and does not track the change on its own.

#### What ACES did to the emissive accents

The 39 emissive materials in the world top out at a peak of 0.745 and 31 of them sit
at 0.3; **not one crosses bloom's 0.72 threshold on its own**, so the accents were
never the bloom seeds. What the tone curve changes is how they *read*, and it cuts
both ways:

| | accent luma | surrounding luma | ratio |
| --- | --- | --- | --- |
| turquoise, AgX | 107.5 | 89.2 | 1.206 |
| **turquoise, ACES** | 98.2 | 79.9 | **1.229** |

ACES renders the accents about 31% dimmer in absolute terms — it has a harder shoulder
— and *more* separated from what surrounds them, because it darkens the surround more
than the accent. The bloom seed population does not move at all: Bloom is upstream of
`ToneMapping` in the chain, so it reads the pre-curve HDR buffer either way.

What does move is the finished image: **0.0876% of the frame ends above 0.72 under ACES
against 0.0268% under AgX**, peaking at 236 rather than 215. That is the contrast
increase being spent where it was intended, and it is not clipping — nothing in the
world reaches 250.

### …and three ways of paying the shadow cost back, none of which is a good trade

The shadow cost above is a real number, so the next question is whether any of it can
be bought back without giving the gain up. Four candidates were measured at one camera
on the high tier. None passed.

**The vignette is not the culprit.** Sorting the frame by radius, the crush
concentrates in the 60–80% annulus — 34.6% of the frame — and that is not the corners:

| darkness | frame mean | 60–80% ring ≤2/255 | corner mean | corner ≤4/255 |
| --- | --- | --- | --- | --- |
| **0.42 (source)** | 73.5 | **1.8878%** | 56.0 | 3.0107% |
| 0.35 | 74.6 | 1.7115% | 59.8 | 1.4370% |
| 0.28 | 75.3 | 1.5691% | 62.8 | 0.8416% |
| 0 (off) | 75.9 | **1.4868%** | 66.7 | 0.5057% |

With the vignette switched off entirely the annulus still carries **1.4868%**. Only
0.401 of its 1.888 percentage points — **21%** — is the vignette, so turning it down
cannot fix the crush it appears to cause.

The rule that picked 0.42 has also stopped holding. It was "below about 0.3 the
corners stop responding", because what remained there was geometry rather than
effect. Under ACES the corners do not stop: 0.28 → 0 still lifts the corner mean from
62.8 to 66.7. The curve has no knee, so there is no floor to stop at.

**Where the black actually is.** Mapping every ≤2/255 pixel across the frame: the sky
carries **0.0000%** and the bottom quarter 0.0462%, while the middle half carries
1.1726%. A single 233×725 region at the left edge — the loom's overhang and the
panels under it — holds **82.7% of every near-black pixel in the frame**. Cropping it
shows what it is: a genuine void beneath the overhang, and panels whose weave still
reads. It is not a defect that a light can repair.

**The rim is the wrong light for it.** The rim is the one source whose job is vertical
faces, so it is the obvious candidate. Raising it:

| rim | dark face mean | lit sand mean | dark face ≤2/255 |
| --- | --- | --- | --- |
| **0.62 (source)** | 12.52 | 96.43 | 15.415% |
| 1.10 | 13.11 (+4.7%) | 99.37 (+3.0%) | 14.937% |
| 1.60 | 13.57 (+8.4%) | 102.23 (+6.0%) | 14.292% |

In absolute terms, taking the rim to 1.6 buys **+1.05 luma on the dark face and pays
+5.80 luma on the sunlit sand** — 5.5× less effective where it is needed than where it
is not. The percentage column makes it look like a win precisely because the dark face
started so low; only the absolute figures are comparable across the two surfaces. It is
the same trade already rejected for the environment probe at 0.35.

**The hemisphere was not re-measured**, because it was measured once already and the
answer was that it does nothing: moving it between 0.4 and 0.14 changed shadowed
ground by 0.38 luma. There is nothing there to recover.

So the shadow cost stands, deliberately, and 0.42 stands with it. The useful output of
this round is the negative one: the number that looked like a vignette problem is 79%
tone curve, the geometry underneath it is a void rather than a dark material, and the
only light that reaches it costs more than it returns.

### The opening frame had never been measured

Everything above was found by looking at a surface that had already been chosen
to look at. The first thing a desktop player actually sees had no numbers behind
it at all, so this round started there instead of starting with an idea.

**The picture is 59% ground.** Segmenting the opening frame by hue and lightness
puts sand at 59.3% of the pixels, sky and distance at 25.6%, water at 24.7% (the
masks overlap, so those last two are not a partition). Whatever the ground looks
like is what the game looks like, and it is not a detail.

**The ground has no structure at the scale structure is read at.** Measuring
local luminance variation of the sand over boxes of growing size gives a clean
log-linear rise — 4.3% at 8px, 8.2% at 64px, 9.4% at 128px — which is the
signature of a clean 1/f texture with no repeat to give it away. That part is
right. But it keeps rising at the same rate all the way out, and grouping the
frame into 400px cells shows their means vary by only **5.4%**. The visible
range of the entire foreground is p01–p99 = 0.43–0.59: forty-one levels of
luma across more than half the picture. The variation that exists at the largest
scale is the same amplitude as the grain of the tile underneath it.

**The cause is one number.** With the tiled maps capped at two units, a flat disc
that casts no shadow on itself, and no terrain to shade, the only thing left that
can produce large-scale ground structure is the per-vertex colour lerp between
two HSL offsets. That gap was **0.12**, which put the mottling at 4.82% in vertex
space — matching the 5.4% measured in the frame, from both ends. It was not a
rendering bug; it was a setting that had never been measured.

**Doubling it to 0.24 doubled the mottling's vertex-space amplitude, from 4.82%
to 8.47%.** What it did to the picture is a smaller claim than the one this
section originally made. The frame metric moved from 5.4% to 6.3% between
400px cells, but that measurement does not survive scrutiny: cells near the
bottom of the frame cover about two world units and cells near the horizon cover
forty, so a chunk of what it called "structure" was cells averaging different
numbers of tiles. Removing the per-row mean — rows are constant depth — leaves
the three states at 6.75%, 6.48% and 6.57% at 128px: no separation. The honest
figure is the vertex-space one, and an same-session difference map puts the
applied effect at about plus or minus 3 luma levels.

### The ground needed a second map, and the first version of it lied

If vertex colour tops out near plus or minus 4 luma levels, and 59% of the frame
is ground, then a painted texture has to carry that structure. The tiled normal
and roughness maps cannot: they repeat every two world units, which is below the
scale at which anything reads as form. So the ground now has a third map,
`ground_macro.png`, sampled in world space rather than tiled.

Two things about it are constraints rather than choices. Its period is 180 world
units against a 92-unit largest island, so no island can contain enough of the
field to repeat it and the eight islands each read a different part of it. And it
is sampled from a world-space varying, not the geometry's UVs, because every
disc is built at the origin and moved by its group — local UVs would hand all
eight islands the same patch.

**The first version of the map was mean-centred globally, and it did not work.**
The hub came out uniformly 5.5 luma levels darker with a 98th percentile of 0.0,
and the cell standard deviation *fell* from 4.74% to 4.15%: a global dimming
wearing the costume of structure. The cause is not subtle once stated — an island
only samples about 38% of the map's width, and nothing makes that patch average
0.5. The fix is structural rather than tuned: a periodic high-pass subtracts a
baseline longer than any island, which makes a local level mathematically
impossible instead of merely unlikely. The hub's patch now averages 0.5044.

**A second failure was hiding in the noise generator.** `fbm`'s usual gain of 0.5
is below 1/sqrt(2), so a field built with it carries *more* energy at short
wavelengths than at long ones — the cell standard deviation barely falls as the
cell grows, which is the signature of noise rather than of form. Raising the gain
to 0.8 puts the energy where a surface reads as a surface.

With both fixed, and the amplitude at 0.45, the same frame three times over:

| amplitude | 200px cell std | depth-normalised |
| --- | --- | --- |
| 0 | 3.72% | 5.16% |
| 0.28 | 4.40% | 5.67% |
| 0.45 | 4.82% | 5.86% |

The applied modulation reaches plus or minus 15 luma levels and is broad rather
than fine, which is the point. It costs one texture fetch.

**That table is history: the amplitude shipped at 0.45 and that was too timid.**
The 0.45 came from the sine probe that preceded the noise map, not from the map
itself. Re-swept against the real texture, measured from source on a fresh load:

| amplitude | 200px cell std | median sand luma | crushed pixels |
| --- | --- | --- | --- |
| 0.45 | 6.19% | 129.3 | 0.00% |
| 0.62 | 7.15% | 126.8 | 0.00% |
| **0.85** | **7.80%** | 124.2 | 0.00% |

The two columns that matter are the first and the last. Structure rises by a
quarter while the median barely moves — this is spatial variation, not a tonal
shift — and nothing crushes. At 0.85 the multiplier can still fall to 0.15 on the
darkest corner of the map and not one sand pixel lands below luma 12.

Higher amplitude is a better risk than it looks, because the high-pass that
removes each island's local level removed its DC — but it did nothing about the
tails. Past 0.85 the map's own extremes start doing the work instead of its
structure, which is where staining would begin rather than relief.

Both things that could have broken at the higher amplitude were re-measured
rather than assumed to carry over. Shimmer, across a 31-unit camera pan: **0.0000%
to 0.0003%** isolated pixels, unchanged. And the low tier, which most players
actually get, improves rather than suffers — the phone frame's 128px cell standard
deviation goes 6.10% to **8.58%**, with its p02–p98 range widening from 62 to 71
luma levels.

### All eight islands, not just the one the screenshot came from

The map applies to every disc, and it was tuned against the hub alone — which is
the same mistake as measuring one surface and generalising. Visiting all eight
answers two different questions, and they want different tools.

**Does it look wrong anywhere?** No. The palettes run from `#a89677` to
`#98abac`, so the islands are olive, brown, blue-grey, ice-blue and dark red as
well as sand, and the modulation is multiplicative and therefore the same ratio
on each. Nothing reads as a stain.

**Does it do the same amount of work on each?** That is answerable from the map
itself rather than from a screenshot, which is the better instrument: the macro
field's standard deviation over each island's footprint runs 0.151–0.199, a
spread of **1.31×**, putting every island between plus or minus 13.6% and 17.9%.
The high-pass equalised the amplitude as well as the level, which is a property
worth stating because it was not designed in — it is what removing a baseline
longer than every island happens to do to any one of them.

The screenshot-based tool could only confirm this on five of the eight. Its mask
finds the ground by taking the dominant hue of the lower frame, and on three
islands the frame is dominated by a landmark plinth or a canal, so the dominant
hue is not the ground's. `tools/ground_structure.py` now prints a warning when
the mask covers under a quarter of the frame rather than quietly reporting the
measurement of a fragment — the previous version hard-coded a warm sand window
and claimed four of the eight islands had between 3% and 19% sand, which was
simply wrong on the cool ones.

### The sky's clouds were a brightness slider wearing the costume of weather

The upper sky measured as the flattest thing left in the game after the ground:
in the emptiest 420×150 rectangle above the ridge, the whole area varied by 2.4
luma levels, and horizontal neighbours differed by 0.065. The shader already had
a cloud term, so the obvious move was to raise it. That does not work, at any
amplitude, and why is worth more than the change would have been.

At 4.4× amplitude the sky brightens by 5 luma levels — every pixel in step, since
the difference's 2nd percentile is +0.0 and its 98th is +34 — and the horizontal
structure barely moves: **2.121 to 2.139 across four regions, under one percent.**
A single region reported 0.065 to 0.130, which looked like a doubling; that
region happened to be the flattest rectangle in the frame, and believing it would
have meant shipping a global brightening on the strength of the one sample most
likely to exaggerate.

The cause is frequency, not amplitude. The term was four sines over the view
direction with coefficients from 3.1 to 11.3, which puts each feature tens of
degrees wide — wider than the sky a 58° camera can see. The whole visible sky is
less than one cloud cell, so raising the contrast of that cell brightens the
frame and decorrelates nothing.

**Three octaves of value noise, at a frequency the camera can resolve, fixes the
cause.** Measured over four regions of the frame, against the same base:

| | std | horizontal difference | autocorrelation at 64px |
| --- | --- | --- | --- |
| four sines | 13.43 | 2.121 | 0.629 |
| three octaves of noise | 13.93 | 2.180 | 0.478 |

The autocorrelation falling from 0.63 to 0.48 is the part that matters: 0.63 is a
ramp, 0.48 is a pattern. And the change is all structure and no brightness at
all — the sky moves between −9.7 and +7.9 luma with a **median of exactly +0.0**,
against the sines' +5 luma of uniform lift. At 3840×2160 the three octaves cost
0.1ms on a 24.8ms frame.

The projection divides by `(0.35 + d.y * 2.0)` rather than by `d.y`: a plane
projection that reaches the horizon without a floor compresses the cloud to
nothing in the last few degrees, which is exactly where the ridge sits and where
aliasing would show.

**The amplitude was then written at 0.5 without ever being swept** — the same
mistake the ground macro shipped with, and worth recording as a pattern rather
than as two coincidences. Re-swept against the real three-octave noise at 64-pixel
lag horizontal autocorrelation, across three sky regions:

| amplitude | autocorrelation at 64px | reading |
| --- | --- | --- |
| 0.50 | 0.568 | a ramp |
| 0.95 | 0.481 | a pattern |
| **1.50** | **0.471** | a pattern |

The plain "horizontal neighbour difference" barely moved across that sweep — and
that is the metric being misled, not the sky being flat. In a sky containing a
tower, a HUD and a ridge, that statistic is set by the hard edges and says
nothing about the clouds. The autocorrelation is the one that reads structure.

Shimmer, three frames across a full pan at 1.5: **0.0000%** isolated pixels in
all four bands including the horizon, which was the risk given that the
projection compresses toward it. Above 1 the mix factor passes one and `mix()`
extrapolates instead of clamping — linear, smooth across the cloud edge, and
what lets the sky carry more than the term was budgeted for.

### The default device had never been looked at

Every measurement in this section was taken on a 2596×1610 desktop frame. That is
not the default: a handheld is detected as `low` (`store.ts`), which is the tier
a phone opens on, and the low tier is the one this project has deliberately left
alone because it cannot be measured here. Two new per-fragment costs had just
been added to it, so it was at least worth rendering once.

At 393×851 CSS with the low tier, the ground is 48.5% of the frame and its 128px
cell standard deviation is **6.10%** — the high tier at desktop shows 6.32%. The
macro map does its job on the tier that most players actually get.

**The HUD covers a third of that frame, and most of it is the top third: 49%,
71% and 61% down the first 423 pixels.** That lands almost exactly where the sky
is. The obvious reading — that 45.6% of the sky, about 8.8% of the whole frame,
is being thrown away — does not survive checking. The panels are `var(--glass)`
with a 14px backdrop blur, not opaque fills, and under them the sky measures
*brighter* than outside (44.3 against 37.2) with a wider apparent range, because
the blur smears the panel's own text and border into the backdrop. The sky is
behind the HUD and still legible through it. `tools/hud_occlusion.py` is what
settled that, by diffing the frame against the same view with the HUD hidden
rather than by summing element rectangles, which double-counts nested containers
into a meaningless 679%.

### Two new surfaces, and the shimmer risk that came with them

Sampling a world-space map at a 180-unit period, and three octaves of noise on a
dome, both compress toward the horizon. The first version of each carried a note
saying the far field might alias — an untested worry, written down precisely
because it had not been checked. A single frame cannot check it: shimmer is a
property of *consecutive* frames, and a static capture looks clean whether or not
the surface is stable.

So the player is driven across the hub with real key events and three frames are
captured mid-pan, the camera travelling about 28 units between them. What is
being asked is not "do the frames differ" — of course they do, the camera moved —
but whether any pixel jumps on its own.

**The obvious discriminator does not work.** The ratio of a difference image's
standard deviation to its mean is 6.0 in the sky, which looks like heavy
flicker. It is not: panning a smooth gradient changes almost nothing, and the
ratio is then set by the handful of hard edges in the row — a tower silhouette, a
panel border. A metric that high on a still image is a metric reading edges, not
noise.

**What works is the direct definition**: a pixel that moves far more than its
eight neighbours. Measured that way, across all four bands and both frame pairs,
the scene shows **0.0000% to 0.0002%** isolated pixels.

**And the detector itself was broken the first time.** It averaged a 3×3
neighbourhood including the centre pixel, so a genuinely isolated spike of
+90/255 divided by nine came out at 10 and never cleared the threshold of six —
it reported 0.0000% on a frame with 1044 deliberately added isolated pixels. The
zero would have been reported as "no shimmer" on the strength of an instrument
that could not detect shimmer. `tools/shimmer_selfcheck.py` now injects known
pixels and confirms the detector reports them: at 0.009%–0.023% for 1044 pixels,
which is the 0.028% the injection rate predicts. The real scene sits about a
hundredfold below that.

Neither surface shimmers. The worry was written down, checked, and closed.

### Where the eye goes in the opening frame

The first task is "reconnect the dark canal to light", and the light is a beacon
at the top of the hub. "Is it the most eye-catching thing" is measurable, if
carefully: not as "the brightest region", but as the region that stands apart
from its surroundings.

The first version of that measurement was wrong in an instructive way. Scoring
cells by their distance from the frame's global mean ranks the **darkest** blocks
first, because the sky is furthest from the middle of the distribution — it
reports where the eye goes by pointing at the sky. Standing out is relative to
one's neighbours, not to the average of everything.

Scored against a five-block ring instead, the opening frame separates cleanly —
**but only at the right cell size, and the size has to be stated** or the
conclusion is an artefact:

| cell | most cyan-distinctive | B−R vs surroundings |
| --- | --- | --- |
| 60px | the beacon | **+114** |
| 90px | the beacon | **+89** |
| 130px | sky, then sand | +61 |
| 200px | sky | +79 |

At 60 and 90 pixels the beacon wins outright, and every one of its cells sits at
x 1260–1350 on a 2596-pixel frame — dead on the vertical axis rather than in a
corner. At 130 pixels it has left the list entirely. That is mechanical rather
than meaningful: the beam is about 60–90 pixels wide, so a coarser cell averages
it together with the dark tree behind it and the B−R collapses. Averaging an
object across a cell coarser than the object erases it. It is a limit of the
measurement, not a property of the frame, and it is recorded here so the claim is
not quoted without its condition.

By luminance — which is scale-stable, because the character's shadow is large —
the most distinctive cells are the player character and its own shadow, at −92
against the surrounding sand. That is the right answer for a third-person game:
you always know where you are.

Two different things win on two different channels — the avatar on value, the
objective on hue — and that is what a readable composition looks like.

### The progression's visual payoff, measured

The brief for the whole game is "every connection gives the world new life", which
is only true if progression is visible. Nothing had checked.

At the opening the scene contains **one real causeway and twelve stub boxes**.
There are seven spans in the world; one is built because `openRegionIds` always
counts the frontier region as open, and the six that are not built each leave two
shoreline stubs. So the picture the player starts with is a world with one
crossing and twelve little blocks marking six missing ones, and the opening stage
is one of those markers.

The payoff per stage is large enough to be worth stating as a number: a stub is
5 × 0.6 × 5 units, two of them is 50 square units, and the deck that replaces
them is 12 × 89.2 — **21× the area**. Nothing else in the game changes that
much when a puzzle is solved. It is also legible without being told: the stubs
are placed precisely so that "not built yet" reads differently from "the road
simply stops", which is why the first thing this investigation found was a large
flat box on the ground and mistook it for a bug.

### The bridges, and a slab that looks like a defect and is not

The causeways are the surface the player crosses between every region, and they
had never been looked at. Walking out to the hub shoreline produced a large flat
brown box sitting on the ground with no crossing attached — the most
placeholder-looking thing in the game.

It is a **stub**: the two blocks `Scene.tsx` places at each shoreline when a span
has not been built yet, so the missing crossing reads as unfinished work rather
than as a road that simply stops. It is doing its job.

The real deck next to it is textured and layered: the stone carries the triplanar
detail map, a copper runner runs down the middle, and the rails are turquoise
with a copper cap on top. The turquoise reads as a "swimming pool stripe" until
you know it is the rail — which is exactly what it is, and what the comment above
it says it is. The rails cast shadows on purpose, measured at 65.8 luma on the
band they shadow, because without that shadow a rail reads as paint on the deck
rather than a raised thing standing on it.

One correction to how I read it first: I checked `material.normalMap` to see
whether the deck had been given the detail map, and it had not — because
`applySurfaceDetail` injects into the shader rather than filling the map slot.
The deck carries the `ilmekSurfaceDetail` flag and is patched. Looking at the
wrong property is the same error as looking at the wrong mesh.

### Measurement tools, and every one of them was wrong first

This round added six tools under `tools/` and ran them over the frame. Between
them they got it wrong six times: a sand mask with a hard-coded warm hue window
that reported four of eight islands as 3–19% sand when they are cool; a shimmer
detector that averaged the centre pixel into its own neighbourhood and reported
zero on a frame carrying 1044 deliberately injected flicker pixels; a cell
standard deviation that was reading perspective depth rather than surface
structure; a HUD coverage figure of 679% from summing nested element rectangles;
a saliency score that ranked the sky because it ranked distance-from-the-mean;
and a cost measurement that timed the macro's amplitude instead of its texture
fetch.

None of those were caught by looking harder at the numbers. Each was caught by
asking what the instrument would report if the thing I hoped for were true, and
by finding that it would report the opposite. `tools/measure_frame.py` now runs
the whole battery in one command, and `tools/shimmer_selfcheck.py` and the mask
warning in `tools/ground_structure.py` are the pattern the rest should follow:
**an instrument that has never been shown a known positive has not been shown to
work.**

A seventh arrived with the octave experiment, in the same shape. `tools/crop_ab.py`
exists because the first look at a 5-octave-versus-4-octave pair was a stacked
contact sheet that had squeezed each 2596px frame into 407px — and a 6.4×
reduction deletes the frequency band under test before the eye reaches it. The
tool refuses a box that runs past either frame, and refuses a pair whose sizes
differ, because a crop comparison across two different cameras is not a comparison
at all. `tools/ground_structure.py` gained `--box` for the same reason: measuring
one region and generalising from it is how the sky scan once reported a doubled
value. Its own argument parser was broken while adding it — `--box 300,820,820,600`
put the coordinates in the *file* list, where the tool then tried to open them as
an image, and `--depth` was documented in the module docstring but did nothing.
Both were found by running the flags, not by reading the code.

### The tree is not what its bounding box suggests

The trunk occupies 39.55% of the frame by screen bounding box and its top is
clipped by the frame edge, which is the most likely thing in the picture to look
like a placeholder. At 464 triangles for something 52 units wide and 20.8 tall, it
was the obvious candidate for "plain procedural geometry", and the obvious
candidate for a Blender rebuild.

It is not that. Zoomed in, the bark carries a triplanar normal map with real
relief, the silhouette on the lit side is irregular rather than cylindrical, and
there are girdle bands at two heights. `applySurfaceDetail` already gives the
tree what the ground gets from its maps.

The measurement that sent me there was itself the misleading one: a projected
bounding box counts the sky between the branches, and the frame-wide summary of
low-triangle meshes — 38 of them under 120 triangles, together 14.11% of the frame
by box area — says nothing either way when the largest single contributor is
2.28%. Bounding boxes are for finding candidates, not for judging them.

### No two islands share a silhouette — measured, not assumed

Eight islands are eight flat discs with the same radius profile, which reads from
a distance like one asset drawn eight times. The repo had already solved the
*colour* half of that problem; the silhouette half looked like the same problem
left open.

The first measurement said they were identical: every cliff has 865 vertices and
a rim at exactly y=0.35 with a standard deviation of zero. That was true and it
was the wrong number. The rim *height* is constant by design — the walkable disc
has to meet it — and what varies is the rim *radius*, by a per-region wobble
seeded from the region id. The honest figure is a radius standard deviation of
1.55% of the mean on every island, absolute amplitude scaling with the island
(0.52 units on the 34-unit hub, 0.70 on the 46-unit region).

Amplitude on its own does not say whether the shapes read as different, so the
rim profiles were cross-correlated: 28 island pairs, **mean +0.056**, spanning
−0.144 to +0.246. Profiles that share a silhouette correlate near 1. These are
effectively independent — each island is a different piece of land, sharing a
technique rather than a shape. The wobble amplitude is identical everywhere and
only the phase moves, which is the right way round: same amount of erosion,
different history.

Which is the fourth time this round that a plausible reading of a screenshot was
wrong in a way a measurement caught. It is the reason the other three findings in
this section were allowed to stand.

### How much of the frame is empty ground is the player's setting, not ours

The resting camera sits 7.8 units back and 3.4 up, which is a pitch of 23.6°
down. From that, "most of the opening frame is bare sand" sounds like a framing
problem worth fixing.

It is not, because the framing is not fixed. `cameraPitch` is a mutable ref fed
by mouse drag and the right stick, clamped to −0.66…+0.34 radians and added to
the resting angle. That is a **57° swing** available to the player:

| player input | effective pitch | horizon |
| --- | --- | --- |
| PITCH_MIN | −14.2° (looking slightly up) | ~25% down the frame |
| resting | 23.6° down | ~9% |
| PITCH_MAX | 43.1° down | below the frame — a plan view |

The bare ground share ranges from mostly sky to entirely ground by player
choice. The lower clamp exists so the view cannot be dragged into the ground
plane and the upper one so it does not become a top-down map — both are
deliberate, and the resting value sits between them.

Which retires the third of the three candidate improvements. Of the things this
round proposed as "worth measuring next", one was already handled and is
measured (the island silhouettes), one is a documented player setting, and the
third — the tower being clipped by the top of the opening frame — is a framing
question where the tower's height is what sells the hub's scale.

### The panel where the player actually spends their time

Twenty-eight stages, and every one of them is resolved in an overlay rather than
in the world. That is the trade the Known Limitations section names, and it means
the panel is the surface with more player-minutes per square pixel than anything
else in the game. It had never been looked at.

It holds up. The hierarchy is legible without being loud — an eyebrow, a title,
a one-line restatement — and the teaching block underneath is the part that earns
its space: **FİKİR**, **TUZAK** and **NEREDEN BAŞLA** as three colour-coded rows
separated by hairlines, so the trap and the opening move read differently from
the explanation. The two endpoints are buttons rather than a diagram, the apply
button is correctly disabled until both are chosen, and the world behind is
blurred hard enough that nothing competes.

The one thing it gives up is the one it is documented as giving up: connecting
two ends of a broken canal is a two-click gesture, not a spatial act in the
world. That is a deliberate readability choice, and it is the correct one at
this word count — but it is the honest cost of the panel being this clear.

### Four things this round measured and did not change

- **The horizon ridge.** It reads: 8.5 luma under the sky above it on the left
  of the hub, 13.4 on the right, against a local sky range of 17–33. That is
  50–80% of the available separation, which is enough to read as distant land.
- **The teal patches in the sand.** They looked like a stain and a size problem
  at once. They are neither: 25% of the frame passes a naive "bluer than red"
  test, but that is the sky. The water itself is a few per cent.
- **Clipping.** Nothing is crushed to black or burned to white — 0.4% of the
  frame sits at exactly 255 and a comparable amount at 0. The histogram is
  bimodal by design, a dark sky against lit ground, with the 64–95 band thin
  and everything above 160 at 0.6%. That gap is the contrast the whole art
  direction is built on.
- **The brightest thing in frame.** There is one, and it is in the right place:
  the beacon reaches luma 204 against a sand ceiling of 156. For a game whose
  objective is to reconnect a dark canal to light, the light is the brightest
  pixel in the picture.

- **Undulating the ground.** A 0.25-unit wave, 12 units long, applied to the disc
  at runtime with recomputed normals. 256px cells improved (5.4% → 6.0%) and
  400px got worse (6.7% → 6.4%). No win, and it would fight
  `tests/disc.test.ts`, which already pins the disc flat on purpose — navigation
  solves movement in 2D against y=0.
- **A green cast in the sand.** The magnified crops show olive-grey streaks that
  read as contamination. They are not: across the sand G−R is −0.0755, hue holds
  39–44°, and saturation is flat at 0.39–0.41 from the darkest decile to the
  brightest. Darker sand simply loses saturation. This is the hue-on-dark-pixels
  trap again, in a new costume.
- **Black holes in the frame.** Connected-component analysis of everything below
  luma 12 finds 3.1% of the picture, and the largest such region is the sky
  (RGB 29/39/51), not a shadow. The near-black wedge beside the tower is a thin
  slice of the dark component it belongs to, about 4% of the frame.

### And what was ruled out on the ground and sky

- **Brightening the gradient to give the sky depth.** The dome mixes zenith to
  horizon by `pow(1 - h, 5)`. Lowering the exponent to 3 measured *worse* — the
  upper sky's standard deviation fell from 2.41 to 1.88 and the horizontal
  neighbour difference went 0.065 to 0.067. A vertical gradient has no horizontal
  structure at any exponent; changing it only slides brightness, and it slides
  the whole sky at once.
- **Pixel cost of the two new surfaces.** Both were measured at 3840×2160 —
  8.3 megapixels, 2.6× the desktop load, a 24.8ms frame with real headroom — and
  both came back inside the noise floor. The macro map, timed by swapping the
  patched shader for an unpatched one so the texture fetch is actually removed
  rather than merely scaled to zero: **24.9, 25.0, 24.9ms against 25.0, 24.9,
  24.9ms**. The three cloud octaves, timed against the four sines they replaced:
  24.8ms against 24.9ms.

  The first pass at this measured the macro's *amplitude* rather than the fetch
  and found no difference — which was true and beside the point, since the fetch
  happens whatever the amplitude is. Measuring the thing that actually costs
  something needed the sampler taken out of the shader.

  This matters because the low tier was deliberately left alone on the grounds
  that this machine cannot measure a phone, and two new per-fragment costs had
  just been added to it. A phone at the low tier's 1.25 dpr renders fewer pixels
  than the 8.3 megapixels used here, so neither addition has a price worth
  gating on quality — and low gets the same improved ground and sky as high.

### The empty band in the ground, and why filling it costs more than it returns

The macro map's octaves sit at 90, 45 and 22.5 world units. Below the 2-unit tiled
maps and above those, 11 units down to 2, there was nothing designed at all — and
the radial power spectrum says the 11.25-unit band really is empty rather than
weak: **8.9e-5 against 3.4e-3 for the band above it, thirty-eight times weaker**.
A fifth octave fills it. Measured on the shipped PNGs, that band goes to 1.2e-3,
a factor of 13.5. The gap is real and the fix is real.

It still does not ship, and the reason is not the one you would guess.

- **It is not `fbm`'s normalisation.** Adding the fifth octave as a separately
  weighted term on top of an untouched four-octave base — so the base cannot
  possibly be diluted — reproduces the same loss to the digit: 90 units ×0.61,
  45 units ×0.74, 22.5 units ×0.88.
- **The budget is the final fit.** `0.5 + field * (0.5 / max(abs(field)))` scales
  the whole field by its single most extreme pixel. Add high-frequency content and
  that peak grows, so every band shrinks with it. Renormalisation conserves total
  contrast and only moves it between scales; that *is* the trade. The map is
  pinned at both ends — min 0.008, max 1.000 — so its range is set by an outlier
  rather than by its structure. Fitting the 99.9th percentile instead of the max
  buys back 3% and costs 0.10% clipped pixels. It does not buy the band back.
- **On screen, the gain did not survive being looked at.** At the weight matching
  the naive version: sand median **122.6 → 126.6** luma, ground contrast
  **−4.7%** (rms 16.09 → 15.34), and the new band worth 2.33 luma rms with a
  horizontal autocorrelation of 0.72 at 100px, 0.43 at 200px and −0.02 at 400px.
  That last row is the point: the addition is genuinely coherent and genuinely at
  the right scale — and it was still not distinguishable at 1:1 in either of two
  non-adjacent regions. A cost paid on every ground pixel in every frame, for a
  gain that did not survive looking at it.

So the band stays empty on purpose. Anyone revisiting this should attack the
dynamic-range budget, not the octave count: a response curve in the shader
expands the mid-range without touching the tails that `GROUND_MACRO_AMPLITUDE`
already has to live inside, and that is the lever that was never tried.

Two things this round got wrong, both caught by measuring:

- **The comparison sheet was the wrong instrument.** Two 2596px frames squeezed
  into 407px panels is a 6.4× reduction, and the 11-unit band does not survive
  being downsampled 6.4×. The first read of the pair — "they look the same" — was
  being made on an image where the thing under test had been filtered away.
  `tools/crop_ab.py` now stacks paired 1:1 crops of the same box from both frames,
  and the box must fit inside both or the tool refuses rather than cropping.
- **A luma delta of exactly 0.00 on a ground that was measurably different.** The
  delta had been computed by slicing an array built from frame A and comparing it
  with itself. It was not a null result, it was a subtraction that never ran, and
  it would have been reported as a rigorous zero: "sıfır buldum" means nothing
  until the tool can be shown to see a non-zero. Corrected, the same two regions
  read +4.3 and +10.2 luma.

One thing worth keeping about the noise itself, because it is not obvious:
value noise with smoothstep interpolation has a spectral **null at its own cell
frequency**, so an octave does not deposit its energy where its nominal period
says. The fifth octave's content lands near *half* its period — which is why
adding it filled the 11.25-unit band rather than the 5.6-unit one it appears to
be for.

### Eight islands at once, and the ranking table that is not here

Every earlier round measured the hub, because the hub is where a session starts.
The other seven islands had been visited one at a time, if at all. This round
teleported to all eight. That is where both of the round's real defects came
from, and neither of them came from a number — the cell standard deviations were
never what found them. **Looking at the frames did.**

There is deliberately no cross-island ranking table in this section. Three were
built and all three had to be withdrawn:

1. The first sweep was invalid. `__ilm.teleport` places the player directly and
   then collision resolution pushes them out of whatever geometry they landed
   in — seven of the nine positions were displaced by 7.05 to 10.05 units, and
   one put the camera *inside* a sand wall with the character nowhere in frame.
2. The rebuilt table had the region names scrambled, because they were assigned
   from capture-file order rather than from the anchors in `catalog/regions.ts`.
   `cartographers-terrace` is at (-132, -96) and the file called `a2`; the
   published table listed a different island against each row.
3. The re-measured table was taken with the collider defect still present, so on
   five islands the player was standing *under* the platform being measured.

What survives is the seven rows that can be defended, and they are not worth
printing: seven islands with 200px depth-normalised cell std between 6.65 and
20.74, and two more that will not form a single 200px cell at any standing spot
tried because they hold that little contiguous ground. A ranking built from that
spread would have pointed at the best-looking island, not at the broken one.

The sweep's actual contribution is the sentence it made possible: the islands
had never been looked at *together*, and the one that read worst had never been
looked at at all.


### An instrument built for this and thrown away

The obvious move was to automate the readability check: label the dark connected
regions, measure each one's internal standard deviation and its separation from
the ring just outside it, rank them. It was written, and it was deleted in the
same session, twice over.

The first version indexed a subsampled label map with full-resolution pixel
coordinates and reported a standard deviation of 46.93 inside an `L < 24` mask —
arithmetically impossible, since nothing in that range can vary that far. It had
been measuring outside its own mask, and it said so with complete confidence.

The second version fixed the indexing and then found nothing at all, on the
frame where the panels are the subject. The cause is the rule meant to remove the
nuisance: components touching the frame edge are background. The panels touch
the sky along their top edge, so 4-connectivity folds them into the sky
component and the rule then discards them. **The rule built to remove noise
removed exactly the signal** — a dark object merging into the sky is the failure
mode being hunted, not an artefact.

Neither version passed the only check that matters: neither was shown the known
positive. A tool that reports confident verdicts about surfaces it is not
measuring is worse than no tool, and the defect was found by looking at a frame
in the first place.

### A landmark the player could stand inside, and the measurement that fixed it

Found by looking at a survey frame rather than by measuring one. Standing at
(-120, -96) — twelve units from the Cartographer's Terrace — the character was
**not in the picture at all**. Not small, not dark: absent. The scene graph said
it was there, and the pixels said it was not.

The evidence chain, each link measured:

- The character mesh reported `visible: true` and projected to screen (1298, 1168).
  A 460×460 crop at 1:1 centred there was **pure sand** — RGB (184.6, 171.0,
  147.1) at saturation 0.203, against 0.198 for the sand around it.
- The `terrace` mesh is a **15.2-unit-radius** platform whose surface sits at
  **y = 1.70** and whose base is at y = 0.50. The player at twelve units was
  under it, with their head 1.7 units below the floor.
- The landmark collider for that island declared **radius 9**
  (`landmarkRadii`, now `LANDMARK_RADII`), so nothing stopped the player
  entering the annulus between 9 and 15.2. Teleporting to radius 12 landed
  exactly where asked, un-pushed — which is the same fact in one number:
  collision considered the spot free.

The comment above those numbers said *"Landmark footprints. Radii match the
built structures"*, and it was false. Measuring each landmark from its own
vertices in the height band a player can walk under (0.4–4.0), keeping only
surfaces carrying real area rather than a beam's handful of points:

| landmark | old | measured | object | vertices |
| --- | --- | --- | --- | --- |
| cartographers-terrace | 9 | **15.2** | terrace | 240 |
| collective-gardens | 8 | 15.0 | terrace0 | 180 |
| memory-council-city | 9.5 | 14.3 | podium_3 | 72 |
| observers-mirrors | 7 | 13.2 | plinth001 | 72 |
| valley-living-machines | 6.5 | 12.8 | pump | 432 |

The hub, the Flow Foundry and the Adaptation Workshop measured no raised
platform in that band at all, so they keep the radii they had rather than being
grown to a number nothing was measured against.

**Widening a collider is safe until the island's own puzzle is inside it**, and
that was checked rather than assumed. `buildStagePositions()` is
`anchor + stage.offset`, so the console positions are plain data: every stage on
all eight islands already sits outside these rings, the tightest by **0.03
units** — the terrace consoles at 15.23 and 15.62 against a platform of 15.2.
That 0.03 is also the cross-check on the measurement: the offset was clearly
chosen to land just clear of the terrace, so the terrace really is 15.2 wide.

After the change, the same teleports land outside, each at the collider plus a
0.55-unit body:

| landmark | asked | landed |
| --- | --- | --- |
| cartographers-terrace | 12 | 15.75 |
| collective-gardens | 12 | 15.55 |
| memory-council-city | 12 | 14.85 |
| observers-mirrors | 10 | 13.75 |
| valley-living-machines | 10 | 13.35 |

The terrace frame now carries the character: the same box that held bare sand
reads RGB (92.1, 78.0, 54.7) at saturation 0.478, and the closest console is
**0.52** units away against an `INTERACT_RANGE` of 5.2 — reachable from where
the collider now leaves the player.

**A second island, found the same way.** The survey frames had been sitting in
`.shots/` with the defect in them all along. The Observer's Mirrors frame showed
the player at twelve units from its centre — buried to the shoulders under a
plinth whose top is at y=0.80 and whose footprint is 13.2 — the identical failure
on a different landmark, in a frame already captured. After the fix the same
teleport lands at **13.75** and the character stands. Two landmarks confirmed by
pixels; five corrected from the same measurement; all of it one line of data.

`tests/landmark-colliders.test.ts` pins all of it, and the radii moved to
`src/world/landmark-colliders.ts` so a node test can import them at all:
`Scene.tsx` touches `window` at module scope, and the numbers are the thing
under test. Reverting the terrace to 9 fails *"covers every landmark that has a
measured raised platform"*; pushing it to 16 fails *"leaves every stage console
outside its island ring"* and names both stranded consoles. Both were run.


### The tests were never typechecked, and a test that asserts nothing looks exactly like one that passes

Written while adding the landmark-collider test, and it is the more useful of the
two findings from that round.

`tsconfig.app.json` includes `["src"]`. `tsconfig.node.json` includes
`["vite.config.ts"]`. **Nothing included `tests/`**, and `npm run typecheck` is
`tsc -b --noEmit`, which walks those two references and stops. So every
"TypeScript is clean" claim in this file, made over many rounds, covered `src/`
and never once covered a test.

Vitest transpiles without typechecking, so a test with a broken import runs
happily. This one had been shipping exactly that: the reachability guard imported
`LANDMARK_PAD_RADIUS` from `bridge.ts`, where the export is
`LANDING_PAD_RADIUS`. The name was wrong, so the constant was `undefined`, so
`region.radius - undefined` was `NaN`, and `NaN <= radius` is `false` for every
island — the filter matched nothing and the test passed **having asserted
nothing at all**. It would have passed with the island radii doubled.

Caught by mutation, not by reading: the guard was proved with a radius of 32,
which leaves every console outside its ring and so should *not* have fired. It
did not fire. That is what a vacuous test looks like from the outside — green,
fast, and empty.

Fixed with `tsconfig.test.json` — bundler resolution, matching
`tsconfig.app.json`, because dropping `tests` into `tsconfig.node.json` produces
161 errors that are all `TS2835: relative imports need explicit extensions`. That
is a module-resolution complaint wearing a typecheck's clothes; none of the 161
were about a type. Two real ones were hiding behind them, both pre-existing and
both now removed: an unused `SHOULDER` in `shadow-box.test.ts` and an unused
`StageDefinition` in `stages.test.ts`.

`typecheck` is now `tsc -b --noEmit && tsc -p tsconfig.test.json --noEmit`, and
the guard was re-proved: importing `NOT_A_REAL_EXPORT` from `bridge.ts` exits 2
with `TS2305`, and exits 0 once the name is right.

The general form is the one already written above this section and repeated here
because it cost a whole round: **an instrument that has never been shown a known
positive has not been shown to work**, and a passing test that was never shown to
fail is not a test.

### The one surface in the game that was never given the grain

Found by looking at a frame the sweep had captured and nobody had opened. The
Flow Foundry's canal runs across a third of the picture as a slab of flat cyan,
and it looked like it.

Measuring flatness the way the rest of this file measures things — 40×40 blocks,
local luma standard deviation, connected components — put it outside everything
else in the frame:

| region | share of frame | mean local std |
| --- | --- | --- |
| **canal, front face** | **5.5%** | **0.12** |
| canal, top face | 8.1% | 3.77 |
| sky | 8.8% | 4.63 |

The sky being smooth is the point of a sky. The canal's front face measured
**0.035** over 72,000 pixels, against 0.0011 for 8-bit quantisation alone. It was
the flattest large surface in the picture.

The cause is one line in `applySurfaceDetail`:

```js
if (emissive && emissive.r + emissive.g + emissive.b > 0.001) return;
```

That is the rule that keeps grain off self-lit parts, and it is right in
principle — emission is added after the lighting, so a surface that lights itself
gains nothing from a normal-map tilt. But it reads the raw emissive colour, which
is the one thing the shader does *not* do: it multiplies by `emissiveIntensity`
first. The canal is authored with an emissive of `#5997a0` at intensity **0.1**,
so it contributes about a tenth of itself to the surface and is not lighting
anything, and it was excluded all the same.

Its three sibling beams made the omission obvious once looked for: `beam_low`,
`beam_low_1` and `beam_low_2` — metal, copper, copper_dark — all carry no UVs
either and all carry the patch. `beam_low_3`, the water, did not.

Weighted by intensity and thresholded at 0.1, two materials in the world become
eligible. Everything else stays skipped, which is the point: `turquoise_soft`
0.742 × 1, `coral` 0.252 × 1, three procedural meshes at 0.45 to 1.4. Glass stays
skipped for being transparent, and eleven flat-shaded materials stay skipped
because their faceting is the look.

**Only one of the two is visible.** The canal is at 0.076 and a leaf tint at
0.084, and the leaf turns out to be worth nothing. Measured by capturing the
Collective Gardens from clean page loads at each setting and excluding the
character and the HUD: **0 of 400 blocks** differ by more than 3%, and 1.33% of
pixels differ by more than 2 out of 255 — indistinguishable.

The first pair of captures appeared to show a change, because the mage's idle
animation sits at a different phase between two page loads and accounts for a
maximum per-pixel difference of **221**. That is worth writing down rather than
leaving to be rediscovered: an A/B pair attributed to the change it was meant to
test, because the one thing in the frame that moves on its own was not masked
out. The canal is the whole of this rule's visible effect.

| | before | after |
| --- | --- | --- |
| canal front face, local std | 0.035 | **8.11** |
| frame area in blocks under std 2 | 33.3% | **22.3%** |
| frame mean luma | 82.25 | 82.02 |
| crushed pixels | 14.61% | 14.60% |

The largest flat region is unchanged at 8.8%, and it is the sky, where that is
correct. The other two figures are the real argument: a third of the frame was
dead flat and now a fifth is, and the cost is a fifth of a luma level on the
whole image.

`tools/flatness.py` is the instrument that found it, and it is kept because it
was shown both answers: on the pre-fix frame it reports the canal's front face
as **4.29% of the frame at std 0.03**, and on the post-fix frame that region is
gone and only the sky remains at the same threshold. It deliberately does *not*
auto-eliminate every dark flat region. The Observer's Mirrors panels read luma
15–18, right inside the sky's range, and a rule that quietly dropped them would
hide exactly the defect class it exists to find.

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

`npm run test` — **320 tests across 28 files, all passing.**

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
| `scene-audit` | 10 | A model drawn N times occupies N places, and the check reports a pile in both directions |
| `orphan-shadow-casters` | 9 | **No shadow lands where the player cannot see what threw it** — the tapestry case, before and after the fix |
| `character` | 10 | The Weaver stands on y = 0 once the rig is composed, and a rigged scene is never cloned out from under its own mixer |
| `bridge-corridor` | 5 | The walkable corridor is derived from the drawn deck, measured across the span |
| `bridge-ground` | 8 | **The deck and the surface walked on it are one thing**: level with every island top, its drawn top face at that same height, a span read at its own half-width, and no walkable ground where there is no stone under it |
| `shadow-box` | 8 | **The shadow box is on the island while the player is on it and on the player once they are not** — the hand-over is at the shoulder, and the player is never left standing outside the box that is drawn for them |
| `tapestry` | 6 | Panels light proportionally to regions restored, never all-or-nothing |
| `disc` | 6 | Terrain discs are flat, face up, tiled rather than holed, and keep their measured vertex budget |

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

The full suite is 320 tests across 28 files.

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

Measured on the **production build as deployed**, in Chromium via DevTools at a
pinned viewport, sampling real `requestAnimationFrame` deltas after every asset
had streamed in.

| Tier | Viewport | Drawing buffer | Median FPS | Worst frame |
| --- | --- | --- | --- | --- |
| high | 1440×810 @ DPR 2 | 2520×1417 (3.57 MP) | **120 FPS** | 10.3 ms |
| medium | 1440×810 @ DPR 2 | 2304×1296 (2.99 MP) | **120 FPS** | 9.4 ms |
| low | 1440×810 @ DPR 2 | 1800×1012 (1.82 MP) | **120 FPS** | 10.4 ms |
| low, mobile emulation | 390×844 @ DPR 3 | 487×1055 (0.51 MP) | **120 FPS** | 9.4 ms |

Every tier reads exactly 120.0, which is the display's refresh cap: at a pinned
1440×810 the scene is not the thing deciding the frame rate any more. **The
informative number here is the worst frame**, 9.3–10.4 ms against an 8.33 ms
budget — every tier sustains the cap and none of them runs away from it.

Because the cap hides the real cost, the figure that moves when work is added
has to be taken above it. At 2560×1440 @ DPR 2 (4480×2520, 11.29 MP) the same
build falls to **30.9 FPS**, and that is the configuration used to price changes.
Adding 707 scattered instances (see "The scatter gave every island the same
number") measured 30.9 against 31.3 FPS for the old counts at the same camera:
about **1%**, below the run-to-run spread.

The earlier figures in this table (55.4, 61.2, 80.9, 92.0, 98.8, 100.7, 101.2)
were all below the cap, and none of them is comparable with the rows above — the
scene went from being frame-bound to being refresh-bound, and the two stateswere also measured under different machine load. They are left in place below
because each records what a particular change cost at the time, not because they
measure the same thing as this table.
| medium | 1440×810 @ DPR 2 | 2160×1215 (2.62 MP) | **80.9 FPS** | 18.6 ms |
| low | 1440×810 @ DPR 2 | 1800×1012 (1.82 MP) | **98.8 FPS** | 18.4 ms |
| low, mobile emulation | 390×844 @ DPR 3 | 487×1055 (0.51 MP) | **100.0 FPS** | 18.3 ms |

The DPR cap is what separates the tiers: 1.75, 1.5 and 1.25. Every tier is the
median of three 10-second runs; the high tier was 61.0 / 61.3 / 61.2.

**Where these numbers came from, and what moved them.** The 119 / 119 / 120.5 /
120.5 figures two rounds ago were measured on a world where the ground was not
being rendered at all (see "The ground was never being drawn"). Re-measuring
after that fix gave 69.1 / 91.6 / 101.8 / 103 — about 26,000 triangles of terrain
that had previously been culled, each sampling a normal map and a roughness map
and receiving shadows.

Fitting the shadow box to the island (see above) then cost the high tier another
~14 FPS, 69.1 → 55.4, and left the other three untouched. That is the expected
direction and the reason is not mysterious: a box centred on the player excluded
much of the island, so much of the island's casters never entered the shadow
pass. Covering the whole island means rendering more of them. The medium tier
paid nothing measurable despite its shadow map going from 1024 to 1280.

Every tier is still above 50 FPS and the medium and low tiers are effectively at
the refresh cap, so the right call is to keep the correctness rather than trade
it back.

**The canal round moved these too.** Two extra draw calls over 3.2 × 8 units are
not what cost or bought anything: high went 55.4 → **61.2** and medium 92.0 →
**80.9**, low and mobile stayed flat. Those two moved in opposite directions by
amounts no two-plane change can explain, so they are machine noise on a shared
box rather than a measurement of the canal. They are recorded because a table
that silently keeps old numbers when new ones are available is a table nobody
can trust; read the low and mobile rows, which were stable to within a frame.

Hardware string as reported by WebGL:
`ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro)`.

An earlier round of this table reported the high tier at **75.2 FPS**, and
identified the cause as neither the post-processing chain nor the aqueduct —
sixteen decorative slabs were casting shadows, and sixteen large casters inside a
46-unit shadow extent cost more than every effect in the composer combined.
Stopping them was worth it, but they were never the whole story either. Half of
what looked like "the high tier is fill-rate bound" was one `castShadow`
attribute, and the other half was terrain that was not there.

**A correction worth keeping.** An even earlier version of this table claimed the
high tier went from 97 to 111 FPS when the bridge decks were shortened. Both
numbers were real and the comparison was not: the viewport had not been pinned
between them, so they were measured at different resolutions. The honest figure
at a pinned 3.57 MP is the 75.2 FPS above, and part of what the bridge work
costs is simply that the opening now draws a bridge it previously did not draw
at all. Frame rates are only comparable when the drawing buffer is identical —
`canvas.width * canvas.height` belongs in the table next to them.

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

### The character was in the air, and in pieces

The Weaver rendered as its hat, torso, arms and staff floating apart in mid-air
above a shadow cast correctly on the floor. Two independent causes, both invisible
to every other check in the repo, and neither one a regression that any test was
looking for.

**The scene clone broke the rig.** `<Asset>` deep-clones every loaded scene so
landmarks placed N times do not share a single parent — that is what fixed the
twenty-eight puzzle consoles drawing at one spot, and it is not optional. A rigged
GLB cannot survive it. `SkinnedMesh.copy` hands the clone the *source's*
`Skeleton`, so the clone's own bone tree is never touched, while `Skeleton.update`
reads `bone.matrixWorld` off the source's bones. The source scene is not in the
render graph, so nothing ever calls `updateMatrixWorld` on those bones: they stay
frozen in the bind pose no matter what the mixer writes into their local
transforms. Every vertex is then skinned against a stale and internally
inconsistent bone frame. `instanceFor` now returns rigged scenes uncloned, which is
safe only because the one rigged model here is placed exactly once; a rigged GLB
placed twice would need `SkeletonUtils.clone`, which is not a thing `clone(true)`
does.

**The vertical offset came from the wrong number.** `CHARACTER_Y_OFFSET` was 0.7,
chosen because the lowest raw `POSITION` value in `weaver.glb` is y = -1.16. That
vertex is a cape — `Plane.030`, a cloth panel whose geometry hangs below its own
bone. Walk the node hierarchy instead and the soles of `Cube.153`/`Cube.154` sit at
y = 0 exactly, so the lift floated the character 0.7 units. The scale was right
throughout: the model is 3.00 units tall and 0.6 brings that to the 1.80 the
silhouette was designed around.

Both are now pinned by `tests/character.test.ts`, which parses the GLB, composes
the bind-pose world box through the rig, and asserts the soles land on zero — so
the number cannot drift back without a red test. Verified in the browser rather
than only in the suite: the rendered world box measures `min.y = 0` while idle and
while walking, `grounded` stays true, and the locomotion clip switches `Idle` →
`Walking_A` on movement, which is itself the proof the animation is reaching the
mesh that renders.

### The Weaver walked the causeways from underneath

The Weaver crossed every span buried to the waist. Three causes stacked, and each
one alone would have been a smaller bug than what shipped.

**The deck was drawn in the air.** A span is a `boxGeometry` of thickness 0.5 on a
group at y = 0.6, so its top face sat at **0.85**. Every island's ground is a disc
built flat at y = 0. The player stood on the island's level and the deck was a
waist-high slab over them — 0.85 of a 1.78-unit character, 48% of the body, inside
the stone. The same number is also a ledge: the causeway began and ended in a step
with nothing drawn to climb it.

**The deck overhung the islands by five units.** Each span started at
`hub.radius - 5`, so the first and last five units of it were drawn *over* ground
the player can already walk — a slab floating 0.85 above sand. Worse, the ground
query tests islands before spans and the island owns that land, so along those five
units the world correctly reported the island's height and the player walked
underneath the bridge that was drawn over them. This is the shape of the report as
it was first made, and it is why trimming the deck mattered as much as lowering it.

**The ground query was never called.** `useGroundSampler` was exported, and nothing
imported it. The controller held its own `useRef` that nothing assigned, and the
ref's default answered `0` — so the player's height was 0 for the entire game, on
every surface, and no correct geometry could have been corrected at runtime. The
same query also compared the distance from a span's centre line against the deck's
full width, describing a deck twice as wide as the one drawn; navigation's narrower
lane meant the player never reached those positions, so it changed nothing visible
— the same private copy of a dimension, one level down.

The deck and the walked surface are now one contract in `src/world/bridge.ts`:
`DECK_TOP_Y` is zero, level with the island tops, `DECK_CENTER_Y` is derived from
it so the runner and rails ride down with the slab, and the spans start and end
exactly at the two shorelines. `Player.ts` exposes the ground query as a pure
`groundAt()` and takes the sampler as a **required** controller prop, so a missing
ground query is now a type error rather than a character standing inside the
scenery. The landing pads are placed by their own radius, which stops each one at
the shoreline: they used to be centred five units inland under a fixed nine-unit
radius, reaching four units past the island edge — covered by deck while the deck
overhung, and open sky once the deck was trimmed to the gap it crosses.

Measured in the browser, not inferred. Walking the flow-foundry span from
z = -20.7 to z = -43.1, across the hub shoreline at z = -34 and out over the void,
the player's height sampled **0.000 at every step**, `min.y` of the rendered world
box is 0, `grounded` stays true, and the distance to walkable ground stays 0. The
deck's own numbers are pinned by `tests/bridge-ground.test.ts`, including the
arithmetic that has to hold (`DECK_CENTER_Y + DECK_THICKNESS / 2 === DECK_TOP_Y`),
the shoreline-to-shoreline extent, and a sweep asserting that no walkable point in
the world lacks stone under it.

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
4. **Voice is text-only.** Spark uses short authored lines with deterministic
   behaviour; there is no speech synthesis or voice acting.
5. **Audio is a synthesised ambient pad, not a score.** Every voice is tuned to
   one chord (root, fifth, octave, twelfth) and passes through a lowpass and a
   generated reverb; each restored region adds one more voice. There is no
   melodic writing, no recorded sound and no adaptive scoring.
6. **Source-application descriptions are quoted verbatim** from the published
   pages, so the journal's factual descriptions retain those sites' own wording
   about hardware and pricing. Gameplay itself uses only fictional units and
   claims no real prices, benchmarks or training.


---

## Licence and scope

ILMEK is an original game. Every region is a playable adaptation of a public
application by Aserdargun; the applications themselves remain the property of
their author and are linked, not reproduced. Completing the game never requires
leaving it, and external links open only on deliberate player action in a new tab.
