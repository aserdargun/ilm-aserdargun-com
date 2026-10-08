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
| `tools/blender/common.py` | Loft / lathe / torus helpers, palette, PBR materials |
| `tools/blender/weaver.py` | The player character and Spark |
| `tools/blender/landmarks.py` | The Synthesis Tree and the seven region landmarks |
| `tools/blender/render_preview.py` | Contact-sheet renders for review |

Twelve models ship, about 520 KB in total: the Weaver, Spark, the Synthesis
Tree, the tapestry, the puzzle console, and the landmark for each of the seven
regions.

Geometry is built from **lofted cross-sections**, not stacked primitives, which
is what gives the coat, trunk and pump their tapering silhouettes. Flat shading
is intentional: the look is deliberately faceted low-poly.

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
| Rendering | `src/world/` | Procedural geometry, player, camera, interaction |
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

`npm run test` — **183 tests across 15 files, all passing.**

| Suite | Tests | What it proves |
| --- | --- | --- |
| `connection` | 8 | Flow propagation, relay bottlenecking, cyclic graphs terminate, incompatible kinds never conduct |
| `placement` | 7 | Ordering, first-failed-step reporting, missing/duplicate steps, two spellings of one behaviour |
| `allocation` | 13 | Lane capacity, kind mismatch, unassigned work, setup cost, trail evaporation, shared-information delay |
| `perception` | 7 | Motion baseline requirement, low-light depth failure, occlusion, budget, weighted uncertainty |
| `evidence` | 15 | Lantern capacity and crowding, stale vs incorrect records, false consensus, observe-act-verify, worker lifecycle |
| `prediction` | — | Exercised through `stages` and `playthrough` |
| `lessons` | 14 | **Every stage has a complete bilingual lesson**, three distinct hints per stage, Turkish never copies English, hint tiers clamp, and **every player-visible id is named** |
| `catalog` | 16 | Exactly 33 codes, INF/NXT/STK absent, every URL verified, both languages complete, catalog ⇄ stage agreement, progression reachability |
| `stages` | 31 | **Every one of the 28 stages is provably solvable**, none starts solved, each yields exactly its application codes |
| `playthrough` | 8 | The whole journey runs through the real store and finishes |
| `save` | 19 | Schema validation, corrupt/version recovery, reconciliation, language independence |
| `i18n` | 11 | Key parity, no empty strings, no untranslated prose, Turkish diacritics |
| `nav` | 8 | Walkable world, island discs, span crossing, boundary containment |
| `touch` | 14 | Staff strip clear of the sightline, home button, pointer capture, tap targets sized for a phone |
| `audio` | 12 | Chord voicing has a third, tremolo depth is proportional, no phase inversion, headroom |
| `playtime` | 5 | The stated playtime estimate is derived, not guessed |

Two real defects were found and fixed by these tests during development: an
occlusion check that looked *behind* a cell instead of in front of it, and a set
of fault signatures under which one diagnosis could never be isolated. A third
came from `lessons`: `hintFor` returned `undefined` for tier `0`, so a stale save
asking for the weakest hint would have been shown nothing.

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

140 tests across 11 files pass.

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
| Desktop, Apple M4 Pro | 1298×805 @ DPR 2 | **120 FPS**, worst frame 9.4 ms |
| Mobile emulation | 390×844 @ DPR 3 | **120 FPS**, worst frame 9.4 ms |
| Desktop, walking with collision | 1298×805 @ DPR 2 | **120 FPS**, worst frame 10.4 ms |

Frame rate was also sampled in three different regions (hub, council city, flow
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
