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
