# Frostfall Camp — Design Spec (Phase 1)

**Date:** 2026-08-14
**Status:** Approved design, pending implementation plan
**Reference:** `ScreenRecording_08-13-2026 13-31-29_1.MP4` (Whiteout Survival playable ad, ~5.4 min)

## Summary

A desktop browser game recreating the arcade-idle loop from the reference video: a lone
character in a snowy camp harvests resources by proximity, sells them, unlocks tools,
gates, and machines, and progressively automates the camp with turrets, sawmills, and
minecarts while thawing frozen villagers. Original assets and name throughout — game
mechanics are recreated; no Whiteout Survival branding, art, or audio is copied.

The full project is phased. This spec fully defines **Phase 1 (core game)** and sketches
Phases 2–5 so the architecture anticipates them.

## Phases

1. **Phase 1 — Core game (this spec):** the video's loop with a win state.
2. **Phase 2 — Villager management:** thawed villagers become assignable workers
   (lumberjack, hunter, cart-loader); houses; efficiency.
3. **Phase 3 — Deeper automation:** production chains (wood→planks, meat→cooked food,
   ore→ingots) with player-routed cart/conveyor paths.
4. **Phase 4 — Camp defense:** periodic wolf/bear raids, walls, more turret types.
5. **Phase 5 — Survival pressure:** temperature, campfires, blizzards, food consumption.

Each later phase gets its own spec → plan → implementation cycle.

## Platform & Tech

- **Stack:** Vite + TypeScript + Three.js. Unit tests with Vitest.
- **Runs:** `npm run dev` during development; `npm run build` produces a static bundle
  the user can serve locally (`npm run preview`) to play.
- **Target:** desktop browser on macOS (Chrome/Safari), 60 fps, keyboard + mouse.

## World & Presentation

- **Map:** one hand-crafted map mirroring the video's layout:
  - A brown dirt **camp road/plaza** running diagonally through the middle, edged with
    picket fencing, wooden benches (sell stations), crates, and rocks.
  - **North-east:** blue pine forest dotted with sleeping polar bears.
  - **South-west:** snowfield with rows of frozen villagers standing in carved trenches.
  - **Gated sub-areas** opened by unlock pads: Deep Forest (more trees), Hunting Grounds
    (more bears), Gold Quarry (gold seams), plus a camp Depot yard where rails converge.
  - **Rails** are fixed, pre-designed routes that appear when their machine is unlocked.
- **Camera:** perspective camera at a fixed isometric-style angle (~45° yaw, ~50° pitch),
  smoothly following the player. No player camera control in Phase 1.
- **Art:** flat-shaded low-poly procedural meshes built in code (cone/dodecahedron trees,
  capsule bears, box-limbed people, simple machines). Snow-white/ice-blue/wood-brown
  palette with a soft directional light and light fog. Falling snow particles.
- **Audio:** small set of synthesized or original SFX (chop, pickup, deposit, unlock
  fanfare, bear growl, cart rattle). Optional gentle ambient loop. Mute toggle.

## Controls

- **WASD / arrow keys** to move.
- **Mouse/trackpad drag** anywhere on the canvas to steer (mimics the ad's swipe).
- No action buttons: all interactions are proximity-based and automatic.
- `M` mute, `Esc` pause menu (resume / restart / mute).

## Resources & HUD

- **Resources:** Cash, Wood, Meat, Gold.
- HUD (HTML overlay, top-right): one row per resource with icon and count; counters
  pulse green on gain, red on spend. Bottom-left: rescued-villager count (e.g. 12/40).
- **Carry stack:** non-cash resources visually stack on the character's back; carry
  capacity limits total items carried (upgradeable). Cash is weightless and uncapped.

## Core Mechanics

### Proximity harvesting
- **Trees:** standing near one auto-chops (axe swing animation, tree shakes, tips over,
  1–3 logs pop out with a bounce, stump remains, respawns after ~20 s).
- **Bears:** sleeping in the forest; attacking wakes them. Bears have HP bars, lumber
  toward the player, and swipe (knockback + brief red flash; generous, no death — the
  player just gets pushed around). Killed bears drop 2–4 meat and respawn after ~30 s.
- **Gold seams:** in the quarry; require the pickaxe; mining pops out gold bars.
- **Ground drops** (logs, meat, gold, cash) are vacuumed to the player within a small
  radius, respecting carry capacity.

### Tools (player upgrades bought at unlock pads)
1. **Hatchet** (start): slow chop, weak attack.
2. **Axe:** faster chop, decent attack.
3. **Scythe:** spinning AoE attack/harvest (the video's whirlwind), hits trees and bears
   around the player.
4. **Pickaxe:** enables gold mining (carried alongside the current weapon).
Movement-speed and carry-capacity boosts are separate pad purchases.

### Sell stations (orange benches on the camp road)
- Each accepts one resource (wood / meat / gold). Standing beside it auto-deposits at
  ~8 items/s with an arcing fly-out animation; cash accumulates on an adjacent mat and
  is collected by walking over it.
- Exchange rates roughly: wood 1→2 cash, meat 1→3, gold 1→10 (tuned in data).

### Unlock pads
- Gray pads with an icon and price (cash or a resource). Standing on one streams the
  currency out of the player into the pad (~10/s) filling a radial indicator; leaving
  pauses progress. When filled, the unlock spawns with a scale-pop and fanfare.
- Pad types: tools, movement/carry upgrades, **gates** (fence section folds away
  revealing a new area), **machines**, and additional **sell stations**.

### Machines (automation)
- **Crossbow turret:** auto-fires at bears in range; kills produce meat drops that
  nearby carts (or the player) collect.
- **Sawmill:** periodically fells trees in its radius, producing logs onto its output
  pile.
- **Minecarts:** run fixed rail loops between machine output piles and the camp
  **Depot**; carts load automatically at machine piles and unload at the Depot.
- **Depot:** camp-side stockpile. Phase 1 keeps it simple: villager haulers (below) and
  the player can carry Depot goods to sell stations; machines never sell directly.

### Frozen villagers
- ~40 frozen villagers stand in the snowfield. Approaching one with enough **meat**
  spends it (cost rises gently over the campaign, e.g. 2→6), plays a thaw effect
  (ice shatters, villager stretches and cheers), and the villager walks to camp.
- Each rescued villager becomes a **hauler**: endlessly carries small loads from the
  Depot to the appropriate sell station. (Job assignment arrives in Phase 2.)

### Progression (mirrors the video)
Chop wood → sell → axe upgrade → hunt bears → sell meat → first gate (Deep Forest) →
crossbow turret + first rail/cart → sawmill → scythe → Hunting Grounds gate → second
turret → Gold Quarry gate + pickaxe → gold sales → carry/speed upgrades → remaining
stations/machines. Villager thawing is available from the moment meat exists and spans
the whole campaign.

### Win state & endgame
- **Win:** all villagers thawed **and** all pads purchased → "Camp Complete" overlay
  with stats (time, resources gathered, bears defeated), then free play continues.
- No lose state in Phase 1.

## Save System

- Autosave to `localStorage` every ~5 s and on tab close: resource counts, purchased
  unlocks, villagers rescued, machine states, respawn timers, player position, settings.
- Pause menu offers "Restart camp" (clears save after confirmation).

## Architecture

- **Logic/render split:** game state is plain TS data updated by systems on a fixed
  timestep (60 Hz accumulator); the Three.js layer only mirrors state into meshes and
  runs cosmetic animation. No game rules live in render code.
- **Systems (plain functions over shared `GameState`):** input, player movement,
  harvesting/combat, carry/pickup, stations (sell + unlock pads), machines (turret,
  sawmill), carts, villagers (thaw + hauling), bear AI, respawn, save, audio triggers.
- **Data-driven content:** `src/content/` holds typed definitions for the map layout,
  zones/gates, pad prices, tool stats, machine stats, rail paths, exchange rates, and
  villager costs. Phases 2–5 land mostly as new content files + new systems.
- **UI:** HTML/CSS overlay (HUD, pause menu, win screen) driven by state snapshots.
- **Entities:** lightweight typed records with ids (player, trees, bears, drops, pads,
  stations, machines, carts, villagers) in flat arrays — no heavyweight ECS framework.

## Testing

- **Vitest unit tests** for the logic layer: exchange-rate math, pad payment streaming
  and completion, carry-capacity enforcement, harvest/respawn timers, bear AI state
  transitions, cart load/unload cycles, villager thaw costs, save/load round-trip.
- **Manual browser verification** for rendering, feel, and performance at each
  milestone (the implementation plan will define per-milestone playable checks).

## Non-Goals (Phase 1)

- No mobile/touch layout, no multiplayer, no procedural maps, no player-built rails
  (fixed routes only — player routing is Phase 3), no villager jobs (Phase 2), no
  enemies attacking the camp (Phase 4), no weather/survival meters (Phase 5), no
  monetization mechanics of any kind from the ad (it's a real game, not an ad).

---

## Amendment 1 — Video-fidelity corrections (2026-08-14, user-directed)

After playing the first rendered build, the user re-grounded four areas in the
reference video. These supersede the corresponding sections above.

### A. Trees are finite; the forest is gigantic
Trees never respawn. A felled tree leaves a permanent stump, and deforestation
visibly spreads across the map, as in the ad. The forest is much larger:
target 250–350 trees (dense starter forest, denser deep forest, northern tree
band, sparse trees in the hunting grounds). Total wood comfortably exceeds the
sum of all wood costs. Gold seams keep respawning (gold is repeatedly mined in
the ad and gold sinks require more than one seam cycle). The sawmill will
eventually clear its radius and idle — accepted for Phase 1.

### B. Camp building tiers (the ad's "hut grows into a fort")
The depot is a growing structure, built by pouring wood into camp pads —
the ad's central spectacle. Four tiers, each a pad with effect
`{ type: 'camp'; tier: n }` setting `state.campTier`:

1. **Shelter Hut** — wood 12, first unlock in the game (no requires).
   Platform, corner posts, crates.
2. **Stockade** — wood 40, requires the deep-forest gate. Log walls and
   red barn doors around the platform.
3. **Fort** — wood 90, requires the scythe. Full red-walled fort; depot
   stockpiles render inside on shelves.
4. **Grand Fort** — gold 12, requires the pickaxe. Log-cabin walls, banner,
   cash-vault look.

Rewired requires-chain (single-parent, acyclic):
p-camp1 → p-axe → {p-carry1, p-speed1, p-gate-deep} → p-camp2 →
{p-turret1, p-sawmill1} → p-scythe (req turret1) → p-camp3 →
p-gate-hunt → p-turret2; p-gate-quarry (req sawmill1) → p-pickaxe →
{p-carry2, p-speed2, p-camp4}. Win = all 17 pads + all villagers thawed.

### C. Commodity iconography
The third commodity is unmistakably **gold**. Labels stop using emoji (which
render inconsistently) and use canvas-drawn icons: brown log, red steak with
white bone, yellow gold bar with shine, green bill with $ — used on benches,
pads, and the HUD.

### D. Money piles and sidebar HUD
Cash on station mats renders as a **grid stack of green bill boxes** growing
with the amount (capped mesh count), matching the ad's cash piles next to the
commodity benches. The HUD (Task 16) is a **left sidebar** listing cash and
carried wood/meat/gold plus the rescued counter — carried amounts always
visible at the side of the screen, per user preference (supersedes "top-right
HUD" above).

### E. Art quality bar (user-directed)
The first render pass read as too primitive next to the reference. Phase 1's
look must hold up beside the ad's while staying procedural:

- **Lighting:** shadows enabled (sun casts, ground/buildings receive), warm
  key light + cool ambient, soft contact feel; brighter palette matched to
  the reference (warm tan road, white-blue snow, saturated ice-blue trees).
- **Trees:** layered look — 2–3 stacked ice-blue cones each capped with a
  slightly larger white snow rim, chunky trunk; per-tree scale/rotation
  variation from the seeded RNG; shared geometry.
- **Character:** parka silhouette — hooded blue coat, white beard, stub arms,
  visible held tool at proper scale; villagers get the same body with teal
  coats; frozen villagers encased in translucent rounded ice.
- **Bears:** rounder, larger, with leg stubs and a gray snout.
- **World dressing:** picket fences lining the road and camp, snow-capped
  rocks, scattered crates/log props, road with lighter border edging, round
  soft snow particles (canvas sprite, not squares).
- **Stations/pads:** ad-style circular bubble labels (icon + live count, small
  pointer tail) above benches; unlock pads as gray rounded-card labels with
  drawn icon + price; build sites as dashed-outline pads (canvas texture).
- **Reference:** compare against the extracted ad frames side by side during
  browser verification; the target is "same genre of polish", not identical.

---

## Amendment 2 — Shop queues and the fort hand-off crew (2026-08-15, user-directed)

Two gaps versus the ad, reported from play:

### A. Sell benches become shops with customer queues
Benches no longer convert deposits into cash instantly. Each station holds
**stock**: deposits (from the player, haulers, or the crew below) add to it,
and the bench bubble's live count now shows stock. **Customers** — new NPC
entities in varied warm-coat colors — walk in from the road ends, join a
queue behind the bench (anchors extending away from the road, small shuffle
spacing), and when at the front take up to 3 items and leave
`amount × SELL_RATE` cash on the mat, then walk off and despawn. Customer
arrivals scale with available stock (roughly one every ~2.5 s per stocked
bench, queue capped ~6). Net economics are unchanged — the same cash arrives,
now visibly carried in by a line of buyers like the ad. Customers are
transient and not saved; station stock IS saved.

### B. Fort hand-off crew (the ad's "mover" upgrade)
A new unlock pad at the fort — **p-distributor, cash 100, requires p-camp3
(Fort)** — activates a permanent 3-person **crew** (distinct coat color,
present from game start but idle inside the camp until unlocked) who
continuously carry depot goods to the matching benches' stock, exactly like
rescued-villager haulers. This gives depot output an automatic path to sale
without requiring any thawed villagers, fixing "the fort fills up with meat
and nothing moves it." Crew members are not rescuable, don't count toward
the rescued total or the win condition; the win now requires all 18 pads.
Rescued-villager haulers keep working alongside the crew.

---

## Amendment 3 — Grand Fort gold mining and the 10× world (2026-08-15, user-directed)

### A. Grand Fort miners
Completing the **Grand Fort (camp tier 4)** activates **2 miner crew**
(pickaxe-carrying, distinct coat color, idle at the fort until tier 4). Each
miner cycles: walk to the nearest respawned gold seam, mine it (a few seconds,
seam respawn unchanged), carry the gold back to the depot, repeat. From the
depot the existing distributor crew / haulers move it to the gold bench where
customers buy it — completing an automated gold pipeline. Miners follow the
same crew rules as Amendment 2B (never rescuable, excluded from the rescued
count and win, saved by derivation from the camp tier).

### B. The 10× world
The world grows to at least 10× its current area (bounds roughly ±190 × ±125).
The existing camp, road, gated zones, rails, and fences stay exactly where
they are; everything beyond becomes open snowy wilderness: a vastly larger
forest (~2,500–3,500 trees, same layered look, still finite and permanently
felled), scattered bear packs (~60 total), and additional gold outcrops
(~20 seams, minable outside the quarry once the pickaxe is owned). The road
extends across the full width. Snowfall follows the camera rather than a
fixed volume; the ground plane and fog scale to match.

**Performance requirement:** trees (and their stumps) move to
`THREE.InstancedMesh` — two instanced draws for the entire forest — since
per-mesh trees at this population would blow the mesh budget. Per-instance
scale/rotation variation and shadow casting are preserved. All other entity
counts stay per-mesh.

---

## Amendment 4 — Depot access, fair hauling, no frozen field, visible mute (2026-08-15, user-directed)

### A. Player depot withdrawal
Standing at the depot (inside the fort) streams goods from the depot into the
player's pack at the deposit rate, respecting carry capacity, in value-priority
order **gold → meat → wood**. This lets the player collect mined gold and spend
it on gold-priced pads. Withdrawal pauses while the player is over 80% carry
so it can't fight their intent to deposit elsewhere.

### B. Fair crew hauling
Crew/hauler trips rotate across ALL non-empty depot piles (per-carrier
round-robin) instead of always taking the largest — fixes gold never reaching
its bench while meat dominates the depot.

### C. Remove the frozen villager field
The rescue mechanic is cut: no frozen villagers, no thawing, no rescued
counter. (The ad's queues of people are what our customers now are; the
frozen field duplicated that at the cost of an endgame meat grind.) The win
condition becomes **all 18 pads completed**. Meat is a pure commodity. The
distributor crew grows to **5** to cover the hauling the rescued villagers
provided. The snow-trench slabs and field fences go away with the field.
Old saves with thawed lists load cleanly (field ignored). thawCost and all
rescue balance constants are removed.

### D. Visible mute
A small always-visible speaker toggle (drawn icon, both states) joins the
sidebar, synced with the M key and the pause-menu button.

---

## Amendment 5 — No ending; the ever-expanding world (2026-08-15, user-directed)

### A. No end state
The win condition and "Camp Complete" overlay are removed entirely: no `won`
flag, no win event, no completion screen. The game is an infinite sandbox.
Lifetime stats remain tracked (shown in the pause menu instead of a win
screen).

### B. Expedition expansions
A repeatable **Expedition pad** near the fort keeps the world growing forever:

- Cost: cash, escalating per purchase (`EXPEDITION_BASE 200 × 1.6^n`,
  data-driven). After each completion the pad re-arms at the next price.
- Each purchase expands `WORLD_BOUNDS` outward by a ring (~+30 units per
  side) and procedurally seeds the new ring with wilderness content —
  trees at wilderness density, a few bear packs, a few gold seams — from a
  seeded RNG keyed by ring index, so generation is deterministic.
- Saves persist the expansion count (+ felled trees as today); loading
  replays ring generation deterministically, then applies felled state.
- Renderer: instanced forest grows with each ring (instanced meshes rebuilt
  or extended on expansion); ground plane, fog and snowfall adapt. Per-ring
  entity counts are capped so per-mesh populations (bears, seams) grow
  modestly while the instanced forest carries the scale.

This makes pads a mix of one-shot unlocks (the existing 18) and the
repeatable expedition, and gives late-game cash an unbounded purpose.
