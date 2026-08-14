# Frostfall Camp Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 core game of Frostfall Camp — a browser arcade-idle game (harvest, sell, unlock, automate, rescue villagers) per `docs/superpowers/specs/2026-08-14-frostfall-camp-design.md`.

**Architecture:** Plain-TypeScript game state mutated by pure-ish system functions on a fixed 60 Hz timestep; a Three.js render layer mirrors state into procedural low-poly meshes and never contains game rules; HTML overlay UI; WebAudio SFX; localStorage saves. All tunables/map layout live in `src/content/`.

**Tech Stack:** Vite, TypeScript (strict), Three.js, Vitest, WebAudio, localStorage.

**Repo note:** The repo is brand new and contains only docs, so execute directly on `main`. Run all commands from the repo root (`/Users/kelsorj/GitHub/WinterGame`). The reference video is gitignored; never `git add` it.

---

## File Structure

```
index.html                     — page shell + UI CSS
package.json / tsconfig.json / vite.config.ts
src/main.ts                    — bootstrap: input, fixed-timestep loop, autosave, wiring
src/game/math.ts               — Vec2/Rect helpers, polyline helpers, seeded RNG
src/game/state.ts              — ALL shared types (no logic)
src/game/init.ts               — createInitialState() from content defs
src/game/drops.ts              — spawnDrops helper
src/game/update.ts             — runs systems in fixed order
src/game/save.ts               — serialize/deserialize/localStorage
src/game/input.ts              — keyboard+drag capture, intent vector (camera-relative)
src/game/systems/movement.ts   — player movement, knockback, zone blocking
src/game/systems/harvest.ts    — swings: trees/seams/bears; tree+seam respawns; killBear
src/game/systems/bears.ts      — bear AI (sleep/aggro/dead), respawn
src/game/systems/pickup.ts     — drop magnet + pickup, carry cap
src/game/systems/stations.ts   — sell stations, cash mats, depositToStation
src/game/systems/pads.ts       — unlock pads: availability, payment stream, effects
src/game/systems/machines.ts   — turrets + sawmills
src/game/systems/carts.ts      — carts on rails, depot delivery
src/game/systems/villagers.ts  — thawing, walk-to-camp, hauler loop
src/game/systems/win.ts        — win condition
src/content/balance.ts         — all numeric tuning
src/content/map.ts             — world layout: zones, entity defs, pads, rails
src/render/meshes.ts           — procedural mesh builders (Three.js)
src/render/renderer.ts         — scene, camera follow, state→mesh sync, effects, snow
src/ui/ui.ts                   — HUD, pause menu, win overlay
src/audio/sfx.ts               — synthesized SFX + mute
tests/helpers.ts               — blankState() + entity factories
tests/*.test.ts                — one file per system (paths given per task)
```

Logic layer (`src/game`, `src/content`) never imports from `src/render`, `src/ui`, `src/audio`, or three.js. Communication to render/audio goes through `state.events`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`

- [ ] **Step 1: Verify toolchain**

Run: `node --version && npm --version`
Expected: Node ≥ 18. If missing, stop and report to the user.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "frostfall-camp",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "three": "^0.166.0"
  },
  "devDependencies": {
    "@types/three": "^0.166.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["vite/client"],
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: { environment: 'node' },
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Frostfall Camp</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #dfe9f0; font-family: system-ui, sans-serif; }
  #app { position: fixed; inset: 0; }
  #hud { position: fixed; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 6px; z-index: 10; }
  .res { background: rgba(255,255,255,.85); border-radius: 10px; padding: 4px 12px; min-width: 96px;
         display: flex; justify-content: space-between; gap: 10px; font-weight: 700; font-size: 18px;
         box-shadow: 0 2px 6px rgba(0,0,0,.15); transition: background .3s; }
  .res.flash-up { background: #c8f7c5; transition: none; }
  .res.flash-down { background: #f7c5c5; transition: none; }
  #rescued { position: fixed; bottom: 12px; left: 12px; background: rgba(255,255,255,.85); border-radius: 10px;
             padding: 6px 14px; font-weight: 700; font-size: 18px; z-index: 10; }
  .overlay { position: fixed; inset: 0; background: rgba(20,40,60,.55); display: flex; align-items: center;
             justify-content: center; z-index: 20; }
  .panel { background: #fff; border-radius: 16px; padding: 28px 36px; text-align: center; min-width: 280px; }
  .panel h1 { margin: 0 0 12px; }
  .panel p { margin: 6px 0; }
  .panel button { display: block; width: 100%; margin-top: 10px; padding: 10px; font-size: 16px; font-weight: 700;
                  border: 0; border-radius: 10px; background: #3aa655; color: #fff; cursor: pointer; }
  .panel button.secondary { background: #888; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Create placeholder `src/main.ts`**

```ts
console.log('Frostfall Camp booting…');
```

- [ ] **Step 7: Install and verify**

Run: `npm install`
Expected: completes without errors, `node_modules/` created (already gitignored).

Run: `npm test`
Expected: `No test files found` but exit code 0 (because of `--passWithNoTests`).

Run: `npm run build`
Expected: `tsc` passes, Vite writes `dist/`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts
git commit -m "chore: scaffold Vite + TypeScript + Three.js + Vitest project"
```

---

### Task 2: Math utilities

**Files:**
- Create: `src/game/math.ts`
- Test: `tests/math.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  dist, inRect, makeRng, norm, pointOnPolyline, polylineLength, pushOut, toward, v,
} from '../src/game/math';

describe('math', () => {
  it('dist measures euclidean distance on x/z', () => {
    expect(dist(v(0, 0), v(3, 4))).toBe(5);
  });

  it('norm normalizes and handles zero vector', () => {
    expect(norm(v(10, 0))).toEqual({ x: 1, z: 0 });
    expect(norm(v(0, 0))).toEqual({ x: 0, z: 0 });
  });

  it('toward steps at most maxStep and lands exactly on target', () => {
    expect(toward(v(0, 0), v(10, 0), 4)).toEqual({ x: 4, z: 0 });
    expect(toward(v(9, 0), v(10, 0), 4)).toEqual({ x: 10, z: 0 });
  });

  it('inRect/pushOut block a rectangle', () => {
    const r = { x0: 0, z0: 0, x1: 10, z1: 10 };
    expect(inRect(v(5, 5), r)).toBe(true);
    expect(inRect(v(-1, 5), r)).toBe(false);
    expect(pushOut(v(1, 5), r)).toEqual({ x: 0, z: 5 });   // nearest edge is x0
    expect(pushOut(v(5, 9), r)).toEqual({ x: 5, z: 10 });  // nearest edge is z1
    expect(pushOut(v(-1, 5), r)).toEqual({ x: -1, z: 5 }); // outside → unchanged
  });

  it('polyline length and interpolation', () => {
    const pts = [v(0, 0), v(10, 0), v(10, 5)];
    expect(polylineLength(pts)).toBe(15);
    expect(pointOnPolyline(pts, 0)).toEqual({ x: 0, z: 0 });
    expect(pointOnPolyline(pts, 12)).toEqual({ x: 10, z: 2 });
    expect(pointOnPolyline(pts, 99)).toEqual({ x: 10, z: 5 });
  });

  it('makeRng is deterministic in [0,1)', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const va = a();
    expect(va).toBe(b());
    expect(va).toBeGreaterThanOrEqual(0);
    expect(va).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/math.test.ts`
Expected: FAIL — cannot resolve `../src/game/math`.

- [ ] **Step 3: Implement `src/game/math.ts`**

```ts
export interface Vec2 { x: number; z: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export const v = (x: number, z: number): Vec2 => ({ x, z });

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function add(a: Vec2, b: Vec2): Vec2 { return v(a.x + b.x, a.z + b.z); }

export function scale(a: Vec2, s: number): Vec2 { return v(a.x * s, a.z * s); }

export function norm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.z);
  return l < 1e-6 ? v(0, 0) : v(a.x / l, a.z / l);
}

/** Move from→to by at most maxStep, landing exactly on the target when close. */
export function toward(from: Vec2, to: Vec2, maxStep: number): Vec2 {
  const d = dist(from, to);
  if (d <= maxStep) return v(to.x, to.z);
  return add(from, scale(norm(v(to.x - from.x, to.z - from.z)), maxStep));
}

export function inRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
}

/** If p is inside r, push it to the nearest edge; otherwise return it unchanged. */
export function pushOut(p: Vec2, r: Rect): Vec2 {
  if (!inRect(p, r)) return p;
  const dL = p.x - r.x0, dR = r.x1 - p.x, dT = p.z - r.z0, dB = r.z1 - p.z;
  const m = Math.min(dL, dR, dT, dB);
  if (m === dL) return v(r.x0, p.z);
  if (m === dR) return v(r.x1, p.z);
  if (m === dT) return v(p.x, r.z0);
  return v(p.x, r.z1);
}

export function polylineLength(pts: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** Point at arc-length s along the polyline (clamped to the ends). */
export function pointOnPolyline(pts: Vec2[], s: number): Vec2 {
  if (s <= 0) return v(pts[0].x, pts[0].z);
  let rest = s;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (rest <= seg) {
      const t = seg < 1e-6 ? 0 : rest / seg;
      return v(
        pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t,
      );
    }
    rest -= seg;
  }
  const last = pts[pts.length - 1];
  return v(last.x, last.z);
}

/** Deterministic LCG in [0,1) so the map layout is stable across runs. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/math.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/math.ts tests/math.test.ts
git commit -m "feat: vector, rect, polyline and rng math utilities"
```

---

### Task 3: Core state types + test helpers

**Files:**
- Create: `src/game/state.ts`
- Create: `tests/helpers.ts`

All types for the whole game are defined here once. Later tasks must use these exact names — do not rename fields.

- [ ] **Step 1: Create `src/game/state.ts`**

```ts
import type { Vec2 } from './math';

export type ResourceKind = 'wood' | 'meat' | 'gold';
export type Currency = ResourceKind | 'cash';
export type ToolId = 'hatchet' | 'axe' | 'scythe';

export interface Player {
  pos: Vec2;
  facing: Vec2;
  speed: number;
  tool: ToolId;
  hasPickaxe: boolean;
  carry: Record<ResourceKind, number>;
  carryCap: number;
  cash: number;
  swingTimer: number;
  knockback: Vec2;
}

export interface Tree { id: string; zone: string; pos: Vec2; hp: number; respawn: number }
export interface GoldSeam { id: string; zone: string; pos: Vec2; hp: number; respawn: number }

export type BearState = 'sleep' | 'aggro' | 'dead';
export interface Bear {
  id: string; zone: string; pos: Vec2; home: Vec2;
  hp: number; maxHp: number; state: BearState; respawn: number; attackCd: number;
}

export interface Drop { id: string; kind: Currency; amount: number; pos: Vec2 }

export interface SellStation {
  id: string; resource: ResourceKind; pos: Vec2; matPos: Vec2; matCash: number; timer: number;
}

export type UnlockEffect =
  | { type: 'tool'; tool: ToolId }
  | { type: 'pickaxe' }
  | { type: 'gate'; zone: string }
  | { type: 'machine'; machineId: string }
  | { type: 'speed'; mult: number }
  | { type: 'carry'; add: number };

export interface Pad {
  id: string; pos: Vec2; currency: Currency; cost: number;
  paid: number; done: boolean; effect: UnlockEffect; requires?: string;
}

export interface Turret { id: string; pos: Vec2; range: number; cd: number; active: boolean; output: number }
export interface Sawmill { id: string; pos: Vec2; radius: number; timer: number; active: boolean; output: number }

export interface Rail { id: string; points: Vec2[]; sourceType: 'turret' | 'sawmill'; sourceId: string }
export interface Cart { id: string; railId: string; s: number; dir: 1 | -1; load: number; cap: number }

export type VillagerState = 'frozen' | 'walking' | 'hauler';
export interface Villager {
  id: string; pos: Vec2; state: VillagerState;
  carrying: ResourceKind | null; amount: number;
}

export type GameEvent =
  | { type: 'chop'; pos: Vec2 }
  | { type: 'treeFall'; pos: Vec2 }
  | { type: 'pickup'; pos: Vec2 }
  | { type: 'deposit'; pos: Vec2 }
  | { type: 'sell'; pos: Vec2; cash: number }
  | { type: 'unlock'; pos: Vec2 }
  | { type: 'thaw'; pos: Vec2 }
  | { type: 'bearHit'; pos: Vec2 }
  | { type: 'playerHit'; pos: Vec2 }
  | { type: 'win' };

export interface GameState {
  time: number;
  player: Player;
  trees: Tree[];
  seams: GoldSeam[];
  bears: Bear[];
  drops: Drop[];
  pads: Pad[];
  stations: SellStation[];
  turrets: Turret[];
  sawmills: Sawmill[];
  rails: Rail[];
  carts: Cart[];
  depot: Record<ResourceKind, number>;
  depotPos: Vec2;
  villagers: Villager[];
  zonesOpen: Record<string, boolean>;
  rescued: number;
  won: boolean;
  stats: { chops: number; bearsKilled: number; earned: number };
  events: GameEvent[];
  nextDropId: number;
}
```

- [ ] **Step 2: Create `tests/helpers.ts`**

Factories keep the system tests independent of the real map content.

```ts
import { v } from '../src/game/math';
import type {
  Bear, Cart, GameState, GoldSeam, Pad, Rail, SellStation, Tree, Villager,
} from '../src/game/state';

export function blankState(): GameState {
  return {
    time: 0,
    player: {
      pos: v(0, 0), facing: v(0, 1), speed: 6, tool: 'hatchet', hasPickaxe: false,
      carry: { wood: 0, meat: 0, gold: 0 }, carryCap: 12, cash: 0,
      swingTimer: 0, knockback: v(0, 0),
    },
    trees: [], seams: [], bears: [], drops: [],
    pads: [], stations: [], turrets: [], sawmills: [], rails: [], carts: [],
    depot: { wood: 0, meat: 0, gold: 0 }, depotPos: v(18, 0),
    villagers: [],
    zonesOpen: { start: true, deepforest: false, hunting: false, quarry: false },
    rescued: 0, won: false,
    stats: { chops: 0, bearsKilled: 0, earned: 0 },
    events: [], nextDropId: 1,
  };
}

export const aTree = (over: Partial<Tree> = {}): Tree =>
  ({ id: 't1', zone: 'start', pos: v(1, 0), hp: 3, respawn: 0, ...over });

export const aSeam = (over: Partial<GoldSeam> = {}): GoldSeam =>
  ({ id: 'g1', zone: 'start', pos: v(1, 0), hp: 4, respawn: 0, ...over });

export const aBear = (over: Partial<Bear> = {}): Bear =>
  ({ id: 'b1', zone: 'start', pos: v(1, 0), home: v(1, 0), hp: 6, maxHp: 6,
     state: 'sleep', respawn: 0, attackCd: 0, ...over });

export const aStation = (over: Partial<SellStation> = {}): SellStation =>
  ({ id: 's1', resource: 'wood', pos: v(0, 1), matPos: v(2, 1), matCash: 0, timer: 0, ...over });

export const aPad = (over: Partial<Pad> = {}): Pad =>
  ({ id: 'p1', pos: v(0, 1), currency: 'cash', cost: 10, paid: 0, done: false,
     effect: { type: 'tool', tool: 'axe' }, ...over });

export const aRail = (over: Partial<Rail> = {}): Rail =>
  ({ id: 'r1', points: [v(0, 0), v(10, 0)], sourceType: 'sawmill', sourceId: 'm1', ...over });

export const aCart = (over: Partial<Cart> = {}): Cart =>
  ({ id: 'c1', railId: 'r1', s: 0, dir: -1, load: 0, cap: 6, ...over });

export const aVillager = (over: Partial<Villager> = {}): Villager =>
  ({ id: 'v1', pos: v(0, 1), state: 'frozen', carrying: null, amount: 0, ...over });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/game/state.ts tests/helpers.ts
git commit -m "feat: core game state types and test factories"
```

---

### Task 4: Content (balance + map) and createInitialState

**Files:**
- Create: `src/content/balance.ts`
- Create: `src/content/map.ts`
- Create: `src/game/init.ts`
- Test: `tests/init.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/init.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/init';
import { thawCost } from '../src/content/balance';

describe('createInitialState', () => {
  const state = createInitialState();

  it('spawns the expected entity populations', () => {
    expect(state.trees.length).toBeGreaterThanOrEqual(50);
    expect(state.bears.length).toBeGreaterThanOrEqual(15);
    expect(state.seams.length).toBe(6);
    expect(state.villagers.length).toBe(40);
    expect(state.stations.map((s) => s.resource).sort()).toEqual(['gold', 'meat', 'wood']);
    expect(state.turrets.length).toBe(2);
    expect(state.sawmills.length).toBe(1);
    expect(state.rails.length).toBe(3);
    expect(state.carts.length).toBe(3);
  });

  it('gives every entity a unique id', () => {
    const ids = [
      ...state.trees, ...state.seams, ...state.bears, ...state.pads,
      ...state.stations, ...state.turrets, ...state.sawmills, ...state.rails,
      ...state.carts, ...state.villagers,
    ].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pad requirements reference existing pads', () => {
    const padIds = new Set(state.pads.map((p) => p.id));
    for (const pad of state.pads) {
      if (pad.requires) expect(padIds.has(pad.requires)).toBe(true);
    }
  });

  it('machine pads and rails reference existing machines', () => {
    const machineIds = new Set([...state.turrets, ...state.sawmills].map((m) => m.id));
    for (const pad of state.pads) {
      if (pad.effect.type === 'machine') expect(machineIds.has(pad.effect.machineId)).toBe(true);
    }
    for (const rail of state.rails) expect(machineIds.has(rail.sourceId)).toBe(true);
  });

  it('every machine is covered by exactly one unlock pad', () => {
    const padMachineIds = state.pads
      .map((p) => (p.effect.type === 'machine' ? p.effect.machineId : null))
      .filter((x): x is string => x !== null);
    expect(padMachineIds.sort()).toEqual(['sawmill1', 'turret1', 'turret2']);
  });

  it('gate pads cover every closed zone', () => {
    const gateZones = state.pads
      .map((p) => (p.effect.type === 'gate' ? p.effect.zone : null))
      .filter((x): x is string => x !== null);
    const closed = Object.entries(state.zonesOpen).filter(([, open]) => !open).map(([z]) => z);
    expect(gateZones.sort()).toEqual(closed.sort());
  });

  it('rails end at the depot', () => {
    for (const rail of state.rails) {
      const end = rail.points[rail.points.length - 1];
      expect(end).toEqual(state.depotPos);
    }
  });

  it('machines start inactive, zones closed except start, player at spawn with hatchet', () => {
    expect(state.turrets.every((t) => !t.active)).toBe(true);
    expect(state.sawmills.every((s) => !s.active)).toBe(true);
    expect(state.zonesOpen).toEqual({ start: true, deepforest: false, hunting: false, quarry: false });
    expect(state.player.tool).toBe('hatchet');
    expect(state.player.hasPickaxe).toBe(false);
  });

  it('thaw cost rises 2→6 across 40 villagers', () => {
    expect(thawCost(0)).toBe(2);
    expect(thawCost(39)).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/init.test.ts`
Expected: FAIL — cannot resolve `../src/game/init`.

- [ ] **Step 3: Create `src/content/balance.ts`**

```ts
import type { ResourceKind, ToolId } from '../game/state';

export const TOOLS: Record<ToolId, { chopDmg: number; atkDmg: number; period: number; range: number; aoe: boolean }> = {
  hatchet: { chopDmg: 1, atkDmg: 1, period: 0.6, range: 1.8, aoe: false },
  axe:     { chopDmg: 2, atkDmg: 2, period: 0.45, range: 2.0, aoe: false },
  scythe:  { chopDmg: 2, atkDmg: 3, period: 0.35, range: 2.8, aoe: true },
};

export const SELL_RATE: Record<ResourceKind, number> = { wood: 2, meat: 3, gold: 10 };

export const PLAYER_BASE_SPEED = 6;
export const CARRY_BASE = 12;

export const PICKUP_RADIUS = 1.6;
export const MAGNET_RADIUS = 3.5;
export const MAGNET_SPEED = 8;

export const DEPOSIT_RATE = 8;   // items per second into sell stations
export const PAY_RATE = 12;      // currency per second into unlock pads
export const STATION_RANGE = 2.2;
export const PAD_RANGE = 1.8;

export const TREE_HP = 3;
export const TREE_YIELD = 2;
export const TREE_RESPAWN = 20;

export const SEAM_HP = 4;
export const SEAM_YIELD = 1;
export const SEAM_RESPAWN = 25;

export const BEAR_HP = 6;
export const BEAR_MEAT = 3;
export const BEAR_RESPAWN = 30;
export const BEAR_SPEED = 3.4;
export const BEAR_ATTACK_RANGE = 1.4;
export const BEAR_ATTACK_CD = 1.0;
export const BEAR_KNOCKBACK = 10;
export const BEAR_LEASH = 14;

export const TURRET_DMG = 2;
export const TURRET_PERIOD = 1.2;
export const SAWMILL_PERIOD = 4;

export const CART_SPEED = 5;
export const CART_CAP = 6;

export const VILLAGER_SPEED = 3;
export const VILLAGER_RANGE = 1.8;
export const HAUL_AMOUNT = 3;

/** Meat cost to thaw the next villager: 2,2,…,6 across the 40 rescues. */
export function thawCost(rescued: number): number {
  return 2 + Math.floor(rescued / 8);
}
```

- [ ] **Step 4: Create `src/content/map.ts`**

Axis-aligned layout: the camp road is a horizontal band around z∈[-6,6]; the starter
forest is north of it; gated zones east (deep forest, hunting) and west (quarry);
frozen villagers stand south-west of the road.

```ts
import { makeRng, v, type Rect, type Vec2 } from '../game/math';
import type { Pad, Rail, Sawmill, SellStation, Turret } from '../game/state';

export const WORLD_BOUNDS: Rect = { x0: -60, z0: -40, x1: 60, z1: 40 };

/** Rectangles that block movement until their zone is opened. */
export const ZONE_RECTS: Record<string, Rect> = {
  deepforest: { x0: 30, z0: -34, x1: 60, z1: -6 },
  hunting:    { x0: 30, z0: 6,   x1: 60, z1: 34 },
  quarry:     { x0: -60, z0: -34, x1: -30, z1: -6 },
};

export const PLAYER_SPAWN: Vec2 = v(0, 0);
export const DEPOT_POS: Vec2 = v(18, 0);
export const CAMP_POS: Vec2 = v(0, 2);

export function treeDefs(): { pos: Vec2; zone: string }[] {
  const rng = makeRng(42);
  const defs: { pos: Vec2; zone: string }[] = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 5; j++)
      defs.push({ zone: 'start', pos: v(-27 + i * 5 + rng() * 2, -30 + j * 5 + rng() * 2) });
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 5; j++)
      defs.push({ zone: 'deepforest', pos: v(33 + i * 4.5 + rng() * 2, -31 + j * 5 + rng() * 2) });
  return defs;
}

export function bearDefs(): { pos: Vec2; zone: string }[] {
  const rng = makeRng(7);
  const defs: { pos: Vec2; zone: string }[] = [];
  for (let i = 0; i < 4; i++)
    defs.push({ zone: 'start', pos: v(-24 + i * 12 + rng() * 3, -35 + rng() * 3) });
  for (let i = 0; i < 5; i++)
    defs.push({ zone: 'deepforest', pos: v(34 + i * 5 + rng() * 3, -12 + rng() * 4) });
  for (let i = 0; i < 8; i++)
    defs.push({ zone: 'hunting', pos: v(33 + (i % 4) * 7 + rng() * 3, 12 + Math.floor(i / 4) * 10 + rng() * 3) });
  return defs;
}

export function seamDefs(): { pos: Vec2; zone: string }[] {
  const defs: { pos: Vec2; zone: string }[] = [];
  for (let i = 0; i < 6; i++)
    defs.push({ zone: 'quarry', pos: v(-54 + (i % 3) * 9, -28 + Math.floor(i / 3) * 12) });
  return defs;
}

export function villagerDefs(): Vec2[] {
  const defs: Vec2[] = [];
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 5; j++)
      defs.push(v(-44 + i * 5, 12 + j * 5));
  return defs;
}

export function stationDefs(): SellStation[] {
  return [
    { id: 'st-wood', resource: 'wood', pos: v(-8, 6.5), matPos: v(-5.5, 6.5), matCash: 0, timer: 0 },
    { id: 'st-meat', resource: 'meat', pos: v(0, 6.5), matPos: v(2.5, 6.5), matCash: 0, timer: 0 },
    { id: 'st-gold', resource: 'gold', pos: v(8, 6.5), matPos: v(10.5, 6.5), matCash: 0, timer: 0 },
  ];
}

export function turretDefs(): Turret[] {
  return [
    { id: 'turret1', pos: v(36, -9), range: 10, cd: 0, active: false, output: 0 },
    { id: 'turret2', pos: v(36, 9), range: 10, cd: 0, active: false, output: 0 },
  ];
}

export function sawmillDefs(): Sawmill[] {
  return [{ id: 'sawmill1', pos: v(45, -20), radius: 8, timer: 0, active: false, output: 0 }];
}

export function railDefs(): Rail[] {
  return [
    { id: 'rail-t1', sourceType: 'turret', sourceId: 'turret1',
      points: [v(36, -9), v(28, -6), v(22, -2), v(DEPOT_POS.x, DEPOT_POS.z)] },
    { id: 'rail-t2', sourceType: 'turret', sourceId: 'turret2',
      points: [v(36, 9), v(28, 6), v(22, 2), v(DEPOT_POS.x, DEPOT_POS.z)] },
    { id: 'rail-s1', sourceType: 'sawmill', sourceId: 'sawmill1',
      points: [v(45, -20), v(34, -12), v(26, -4), v(DEPOT_POS.x, DEPOT_POS.z)] },
  ];
}

export function padDefs(): Pad[] {
  const p = (
    id: string, pos: Vec2, currency: Pad['currency'], cost: number,
    effect: Pad['effect'], requires?: string,
  ): Pad => ({ id, pos, currency, cost, paid: 0, done: false, effect, requires });
  return [
    p('p-axe',        v(-4, -4),   'cash', 10, { type: 'tool', tool: 'axe' }),
    p('p-carry1',     v(-10, -4),  'cash', 30, { type: 'carry', add: 12 }, 'p-axe'),
    p('p-speed1',     v(-16, -4),  'cash', 40, { type: 'speed', mult: 1.3 }, 'p-axe'),
    p('p-gate-deep',  v(24, -5),   'wood', 15, { type: 'gate', zone: 'deepforest' }, 'p-axe'),
    p('p-turret1',    v(31, -8),   'cash', 25, { type: 'machine', machineId: 'turret1' }, 'p-gate-deep'),
    p('p-sawmill1',   v(34, -16),  'cash', 30, { type: 'machine', machineId: 'sawmill1' }, 'p-gate-deep'),
    p('p-scythe',     v(4, -4),    'cash', 40, { type: 'tool', tool: 'scythe' }, 'p-turret1'),
    p('p-gate-hunt',  v(24, 5),    'meat', 20, { type: 'gate', zone: 'hunting' }, 'p-scythe'),
    p('p-turret2',    v(31, 8),    'cash', 50, { type: 'machine', machineId: 'turret2' }, 'p-gate-hunt'),
    p('p-gate-quarry', v(-24, -5), 'cash', 60, { type: 'gate', zone: 'quarry' }, 'p-sawmill1'),
    p('p-pickaxe',    v(-31, -8),  'cash', 30, { type: 'pickaxe' }, 'p-gate-quarry'),
    p('p-carry2',     v(-10, 4),   'gold', 8,  { type: 'carry', add: 24 }, 'p-pickaxe'),
    p('p-speed2',     v(-16, 4),   'gold', 10, { type: 'speed', mult: 1.3 }, 'p-pickaxe'),
  ];
}
```

- [ ] **Step 5: Create `src/game/init.ts`**

```ts
import { BEAR_HP, CARRY_BASE, CART_CAP, PLAYER_BASE_SPEED, SEAM_HP, TREE_HP } from '../content/balance';
import {
  DEPOT_POS, PLAYER_SPAWN, bearDefs, padDefs, railDefs, sawmillDefs, seamDefs,
  stationDefs, treeDefs, turretDefs, villagerDefs,
} from '../content/map';
import { v } from './math';
import type { GameState } from './state';

export function createInitialState(): GameState {
  return {
    time: 0,
    player: {
      pos: v(PLAYER_SPAWN.x, PLAYER_SPAWN.z), facing: v(0, 1),
      speed: PLAYER_BASE_SPEED, tool: 'hatchet', hasPickaxe: false,
      carry: { wood: 0, meat: 0, gold: 0 }, carryCap: CARRY_BASE, cash: 0,
      swingTimer: 0, knockback: v(0, 0),
    },
    trees: treeDefs().map((d, i) => ({ id: `tree${i}`, zone: d.zone, pos: d.pos, hp: TREE_HP, respawn: 0 })),
    seams: seamDefs().map((d, i) => ({ id: `seam${i}`, zone: d.zone, pos: d.pos, hp: SEAM_HP, respawn: 0 })),
    bears: bearDefs().map((d, i) => ({
      id: `bear${i}`, zone: d.zone, pos: v(d.pos.x, d.pos.z), home: v(d.pos.x, d.pos.z),
      hp: BEAR_HP, maxHp: BEAR_HP, state: 'sleep' as const, respawn: 0, attackCd: 0,
    })),
    drops: [],
    pads: padDefs(),
    stations: stationDefs(),
    turrets: turretDefs(),
    sawmills: sawmillDefs(),
    rails: railDefs(),
    carts: railDefs().map((r, i) => ({
      id: `cart${i}`, railId: r.id, s: 0, dir: -1 as const, load: 0, cap: CART_CAP,
    })),
    depot: { wood: 0, meat: 0, gold: 0 },
    depotPos: v(DEPOT_POS.x, DEPOT_POS.z),
    villagers: villagerDefs().map((p, i) => ({
      id: `vil${i}`, pos: v(p.x, p.z), state: 'frozen' as const, carrying: null, amount: 0,
    })),
    zonesOpen: { start: true, deepforest: false, hunting: false, quarry: false },
    rescued: 0, won: false,
    stats: { chops: 0, bearsKilled: 0, earned: 0 },
    events: [],
    nextDropId: 1,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/init.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add src/content/balance.ts src/content/map.ts src/game/init.ts tests/init.test.ts
git commit -m "feat: game balance, map content and initial state builder"
```

---

### Task 5: Input intent + player movement

**Files:**
- Create: `src/game/input.ts`
- Create: `src/game/systems/movement.ts`
- Test: `tests/movement.test.ts`

The camera will sit toward +x/+z looking back at the player, so screen-up maps to
world (-1,-1)/√2 and screen-right to (+1,-1)/√2. `intentFrom` is pure and unit-tested;
`createInput` touches the DOM and is verified manually in Task 15.

- [ ] **Step 1: Write the failing tests**

Create `tests/movement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { intentFrom, type InputState } from '../src/game/input';
import { movePlayer } from '../src/game/systems/movement';
import { v } from '../src/game/math';
import { blankState } from './helpers';

const input = (over: Partial<InputState> = {}): InputState =>
  ({ keys: new Set(), drag: null, ...over });

describe('intentFrom', () => {
  it('maps W to screen-up in world space', () => {
    const i = intentFrom(input({ keys: new Set(['w']) }));
    expect(i.x).toBeCloseTo(-Math.SQRT1_2);
    expect(i.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it('maps D to screen-right in world space', () => {
    const i = intentFrom(input({ keys: new Set(['d']) }));
    expect(i.x).toBeCloseTo(Math.SQRT1_2);
    expect(i.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it('W+D combine to straight up-right (world -z)', () => {
    const i = intentFrom(input({ keys: new Set(['w', 'd']) }));
    expect(i.x).toBeCloseTo(0);
    expect(i.z).toBeCloseTo(-1);
  });

  it('uses drag vector when present (drag right = screen right)', () => {
    const i = intentFrom(input({ drag: v(100, 0) }));
    expect(i.x).toBeCloseTo(Math.SQRT1_2);
    expect(i.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it('returns zero with no input', () => {
    expect(intentFrom(input())).toEqual({ x: 0, z: 0 });
  });
});

describe('movePlayer', () => {
  it('moves at player speed', () => {
    const state = blankState();
    movePlayer(state, v(1, 0), 0.5);
    expect(state.player.pos.x).toBeCloseTo(3); // speed 6 * 0.5s
    expect(state.player.facing.x).toBeCloseTo(1);
  });

  it('applies and decays knockback', () => {
    const state = blankState();
    state.player.knockback = v(10, 0);
    movePlayer(state, v(0, 0), 0.1);
    expect(state.player.pos.x).toBeCloseTo(1); // 10 * 0.1
    expect(state.player.knockback.x).toBeCloseTo(4); // 10 * (1 - 6*0.1)
  });

  it('blocks closed zones and allows open ones', () => {
    const state = blankState();
    state.player.pos = v(29.9, -20);
    movePlayer(state, v(1, 0), 0.1); // deepforest rect starts at x=30
    expect(state.player.pos.x).toBeLessThanOrEqual(30);
    state.zonesOpen.deepforest = true;
    movePlayer(state, v(1, 0), 1);
    expect(state.player.pos.x).toBeGreaterThan(30);
  });

  it('clamps to world bounds', () => {
    const state = blankState();
    state.player.pos = v(59, 0);
    movePlayer(state, v(1, 0), 10);
    expect(state.player.pos.x).toBe(60);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/movement.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/game/input.ts`**

```ts
import { norm, v, type Vec2 } from './math';

export interface InputState {
  keys: Set<string>;
  drag: Vec2 | null; // pointer delta in screen px: x=right, z=down
}

/** Wire DOM listeners. Only used by main.ts; tests exercise intentFrom directly. */
export function createInput(el: HTMLElement): InputState {
  const input: InputState = { keys: new Set(), drag: null };
  window.addEventListener('keydown', (e) => input.keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  let anchor: { x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => { anchor = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { anchor = null; input.drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!anchor) return;
    const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
    input.drag = Math.hypot(dx, dy) < 4 ? null : v(dx, dy);
  });
  return input;
}

// Camera sits toward +x/+z looking back at the player.
const UP = v(-Math.SQRT1_2, -Math.SQRT1_2);
const RIGHT = v(Math.SQRT1_2, -Math.SQRT1_2);

export function intentFrom(input: InputState): Vec2 {
  let ix = 0, iy = 0;
  const k = input.keys;
  if (k.has('w') || k.has('arrowup')) iy += 1;
  if (k.has('s') || k.has('arrowdown')) iy -= 1;
  if (k.has('d') || k.has('arrowright')) ix += 1;
  if (k.has('a') || k.has('arrowleft')) ix -= 1;
  if (input.drag) { ix = input.drag.x; iy = -input.drag.z; }
  return norm(v(RIGHT.x * ix + UP.x * iy, RIGHT.z * ix + UP.z * iy));
}
```

- [ ] **Step 4: Create `src/game/systems/movement.ts`**

```ts
import { add, norm, pushOut, scale, type Vec2 } from '../math';
import { WORLD_BOUNDS, ZONE_RECTS } from '../../content/map';
import type { GameState } from '../state';

export function movePlayer(state: GameState, intent: Vec2, dt: number): void {
  const p = state.player;
  const dir = norm(intent);
  if (dir.x !== 0 || dir.z !== 0) p.facing = dir;
  let next = add(p.pos, scale(dir, p.speed * dt));
  next = add(next, scale(p.knockback, dt));
  p.knockback = scale(p.knockback, Math.max(0, 1 - 6 * dt));
  for (const [zone, rect] of Object.entries(ZONE_RECTS)) {
    if (!state.zonesOpen[zone]) next = pushOut(next, rect);
  }
  next.x = Math.min(WORLD_BOUNDS.x1, Math.max(WORLD_BOUNDS.x0, next.x));
  next.z = Math.min(WORLD_BOUNDS.z1, Math.max(WORLD_BOUNDS.z0, next.z));
  p.pos = next;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/movement.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/game/input.ts src/game/systems/movement.ts tests/movement.test.ts
git commit -m "feat: camera-relative input intent and player movement with zone blocking"
```

---

### Task 6: Drops + harvesting (trees, seams, bears)

**Files:**
- Create: `src/game/drops.ts`
- Create: `src/game/systems/harvest.ts`
- Test: `tests/harvest.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/harvest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { harvestTick } from '../src/game/systems/harvest';
import { v } from '../src/game/math';
import { aBear, aSeam, aTree, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) harvestTick(state, dt);
}

describe('harvestTick', () => {
  it('chops a nearby tree down over time and spawns wood drops', () => {
    const state = blankState();
    state.trees.push(aTree()); // hp 3, hatchet dmg 1 / 0.6s → 3 swings
    ticks(state, 2.0);
    const tree = state.trees[0];
    expect(tree.respawn).toBeGreaterThan(0);
    expect(state.drops.filter((d) => d.kind === 'wood')).toHaveLength(2); // TREE_YIELD
    expect(state.stats.chops).toBe(1);
    expect(state.events.some((e) => e.type === 'treeFall')).toBe(true);
  });

  it('ignores trees out of range, in closed zones, or stumps', () => {
    const state = blankState();
    state.trees.push(aTree({ id: 'far', pos: v(50, 0) }));
    state.trees.push(aTree({ id: 'closed', zone: 'deepforest', pos: v(1, 0) }));
    state.trees.push(aTree({ id: 'stump', pos: v(0, 1), respawn: 10 }));
    ticks(state, 1);
    expect(state.drops).toHaveLength(0);
  });

  it('respawns stumps after the timer', () => {
    const state = blankState();
    state.trees.push(aTree({ pos: v(50, 0), hp: 0, respawn: 0.5 }));
    ticks(state, 1);
    expect(state.trees[0].respawn).toBe(0);
    expect(state.trees[0].hp).toBe(3);
  });

  it('mines gold seams only with the pickaxe', () => {
    const state = blankState();
    state.seams.push(aSeam()); // hp 4
    ticks(state, 3);
    expect(state.drops).toHaveLength(0);
    state.player.hasPickaxe = true;
    ticks(state, 3); // hatchet dmg 1/0.6s → 4 swings = 2.4s
    expect(state.drops.filter((d) => d.kind === 'gold')).toHaveLength(1); // SEAM_YIELD
  });

  it('attacks a nearby bear, aggroes it, and kills it for meat', () => {
    const state = blankState();
    state.bears.push(aBear()); // hp 6, hatchet dmg 1
    ticks(state, 0.7);
    expect(state.bears[0].state).toBe('aggro');
    ticks(state, 4);
    expect(state.bears[0].state).toBe('dead');
    expect(state.drops.filter((d) => d.kind === 'meat')).toHaveLength(3); // BEAR_MEAT
    expect(state.stats.bearsKilled).toBe(1);
  });

  it('scythe hits multiple targets at once', () => {
    const state = blankState();
    state.player.tool = 'scythe';
    state.trees.push(aTree({ id: 'ta', pos: v(1, 0) }));
    state.trees.push(aTree({ id: 'tb', pos: v(-1, 0) }));
    harvestTick(state, 1 / 60);
    expect(state.trees[0].hp).toBeLessThan(3);
    expect(state.trees[1].hp).toBeLessThan(3);
  });

  it('hatchet hits only the nearest target', () => {
    const state = blankState();
    state.trees.push(aTree({ id: 'near', pos: v(1, 0) }));
    state.trees.push(aTree({ id: 'far2', pos: v(1.5, 0) }));
    harvestTick(state, 1 / 60);
    const hit = state.trees.filter((t) => t.hp < 3);
    expect(hit).toHaveLength(1);
    expect(hit[0].id).toBe('near');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/harvest.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/game/drops.ts`**

```ts
import { v, type Vec2 } from './math';
import type { Currency, GameState } from './state';

/** Scatter `count` single-unit drops in a small ring around a point. */
export function spawnDrops(state: GameState, kind: Currency, count: number, around: Vec2): void {
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(count, 1)) * Math.PI * 2;
    state.drops.push({
      id: `drop${state.nextDropId++}`,
      kind,
      amount: 1,
      pos: v(around.x + Math.cos(a) * 0.9, around.z + Math.sin(a) * 0.9),
    });
  }
}
```

- [ ] **Step 4: Create `src/game/systems/harvest.ts`**

```ts
import {
  BEAR_MEAT, BEAR_RESPAWN, SEAM_HP, SEAM_RESPAWN, SEAM_YIELD, TOOLS,
  TREE_HP, TREE_RESPAWN, TREE_YIELD,
} from '../../content/balance';
import { spawnDrops } from '../drops';
import { dist } from '../math';
import type { Bear, GameState, GoldSeam, Tree } from '../state';

type Target =
  | { kind: 'tree'; tree: Tree }
  | { kind: 'seam'; seam: GoldSeam }
  | { kind: 'bear'; bear: Bear };

export function harvestTick(state: GameState, dt: number): void {
  for (const t of state.trees)
    if (t.respawn > 0) { t.respawn -= dt; if (t.respawn <= 0) { t.respawn = 0; t.hp = TREE_HP; } }
  for (const s of state.seams)
    if (s.respawn > 0) { s.respawn -= dt; if (s.respawn <= 0) { s.respawn = 0; s.hp = SEAM_HP; } }

  const p = state.player;
  p.swingTimer -= dt;
  if (p.swingTimer > 0) return;
  const tool = TOOLS[p.tool];
  const targets = findTargets(state, tool.range, tool.aoe);
  if (targets.length === 0) return;
  p.swingTimer = tool.period;
  for (const target of targets) hit(state, target, tool.chopDmg, tool.atkDmg);
}

function findTargets(state: GameState, range: number, aoe: boolean): Target[] {
  const p = state.player;
  const found: { t: Target; d: number }[] = [];
  for (const tree of state.trees) {
    if (!state.zonesOpen[tree.zone] || tree.respawn > 0) continue;
    const d = dist(p.pos, tree.pos);
    if (d <= range) found.push({ t: { kind: 'tree', tree }, d });
  }
  if (p.hasPickaxe) {
    for (const seam of state.seams) {
      if (!state.zonesOpen[seam.zone] || seam.respawn > 0) continue;
      const d = dist(p.pos, seam.pos);
      if (d <= range) found.push({ t: { kind: 'seam', seam }, d });
    }
  }
  for (const bear of state.bears) {
    if (!state.zonesOpen[bear.zone] || bear.state === 'dead') continue;
    const d = dist(p.pos, bear.pos);
    if (d <= range) found.push({ t: { kind: 'bear', bear }, d });
  }
  if (found.length === 0) return [];
  if (aoe) return found.map((x) => x.t);
  found.sort((a, b) => a.d - b.d);
  return [found[0].t];
}

function hit(state: GameState, target: Target, chopDmg: number, atkDmg: number): void {
  if (target.kind === 'tree') {
    const t = target.tree;
    t.hp -= chopDmg;
    state.events.push({ type: 'chop', pos: t.pos });
    if (t.hp <= 0) {
      t.respawn = TREE_RESPAWN;
      state.stats.chops++;
      spawnDrops(state, 'wood', TREE_YIELD, t.pos);
      state.events.push({ type: 'treeFall', pos: t.pos });
    }
  } else if (target.kind === 'seam') {
    const s = target.seam;
    s.hp -= chopDmg;
    state.events.push({ type: 'chop', pos: s.pos });
    if (s.hp <= 0) {
      s.respawn = SEAM_RESPAWN;
      spawnDrops(state, 'gold', SEAM_YIELD, s.pos);
    }
  } else {
    const b = target.bear;
    b.hp -= atkDmg;
    b.state = 'aggro';
    state.events.push({ type: 'bearHit', pos: b.pos });
    if (b.hp <= 0) killBear(state, b, 'ground');
  }
}

/**
 * Kill a bear. `to` is 'ground' (meat drops at the corpse, for player kills) or a
 * turret id (meat goes straight to that turret's output pile, for turret kills).
 */
export function killBear(state: GameState, b: Bear, to: 'ground' | string): void {
  b.state = 'dead';
  b.respawn = BEAR_RESPAWN;
  state.stats.bearsKilled++;
  if (to === 'ground') {
    spawnDrops(state, 'meat', BEAR_MEAT, b.pos);
  } else {
    const t = state.turrets.find((m) => m.id === to);
    if (t) t.output += BEAR_MEAT;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/harvest.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/game/drops.ts src/game/systems/harvest.ts tests/harvest.test.ts
git commit -m "feat: proximity harvesting of trees, gold seams and bears with drops"
```

---

### Task 7: Bear AI

**Files:**
- Create: `src/game/systems/bears.ts`
- Test: `tests/bears.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/bears.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bearsTick } from '../src/game/systems/bears';
import { v } from '../src/game/math';
import { aBear, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) bearsTick(state, dt);
}

describe('bearsTick', () => {
  it('sleeping bears stay put', () => {
    const state = blankState();
    state.bears.push(aBear({ pos: v(5, 0), home: v(5, 0) }));
    ticks(state, 1);
    expect(state.bears[0].pos).toEqual({ x: 5, z: 0 });
  });

  it('aggro bears chase the player', () => {
    const state = blankState();
    state.bears.push(aBear({ state: 'aggro', pos: v(5, 0), home: v(5, 0) }));
    ticks(state, 0.5);
    expect(state.bears[0].pos.x).toBeLessThan(5); // moved toward player at origin
  });

  it('attacks in range: knockback + event, honoring cooldown', () => {
    const state = blankState();
    state.bears.push(aBear({ state: 'aggro', pos: v(1, 0), home: v(1, 0) }));
    ticks(state, 0.1);
    expect(state.player.knockback.x).toBeLessThan(0); // pushed away (player at origin, bear at +x)
    const hits = state.events.filter((e) => e.type === 'playerHit').length;
    expect(hits).toBe(1); // cooldown prevents a hit every tick
  });

  it('leashes back home and heals when the player is far away', () => {
    const state = blankState();
    state.player.pos = v(-30, 0);
    state.bears.push(aBear({ state: 'aggro', hp: 2, pos: v(5, 0), home: v(5, 0) }));
    ticks(state, 0.1);
    const b = state.bears[0];
    expect(b.state).toBe('sleep');
    expect(b.hp).toBe(b.maxHp);
    expect(b.pos).toEqual({ x: 5, z: 0 });
  });

  it('dead bears respawn at home after the timer', () => {
    const state = blankState();
    state.bears.push(aBear({ state: 'dead', respawn: 0.5, hp: 0, pos: v(9, 9), home: v(5, 0) }));
    ticks(state, 1);
    const b = state.bears[0];
    expect(b.state).toBe('sleep');
    expect(b.hp).toBe(b.maxHp);
    expect(b.pos).toEqual({ x: 5, z: 0 });
  });

  it('ignores bears in closed zones', () => {
    const state = blankState();
    state.bears.push(aBear({ zone: 'deepforest', state: 'aggro', pos: v(5, 0) }));
    ticks(state, 0.5);
    expect(state.bears[0].pos).toEqual({ x: 5, z: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bears.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/game/systems/bears.ts`**

```ts
import {
  BEAR_ATTACK_CD, BEAR_ATTACK_RANGE, BEAR_KNOCKBACK, BEAR_LEASH, BEAR_SPEED,
} from '../../content/balance';
import { dist, norm, scale, toward, v } from '../math';
import type { GameState } from '../state';

export function bearsTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const b of state.bears) {
    if (!state.zonesOpen[b.zone]) continue;
    if (b.state === 'dead') {
      b.respawn -= dt;
      if (b.respawn <= 0) {
        b.respawn = 0; b.state = 'sleep'; b.hp = b.maxHp; b.pos = v(b.home.x, b.home.z);
      }
      continue;
    }
    b.attackCd = Math.max(0, b.attackCd - dt);
    if (b.state !== 'aggro') continue;
    const d = dist(b.pos, p.pos);
    if (d > BEAR_LEASH) {
      b.state = 'sleep'; b.hp = b.maxHp; b.pos = v(b.home.x, b.home.z);
      continue;
    }
    if (d > BEAR_ATTACK_RANGE) {
      b.pos = toward(b.pos, p.pos, BEAR_SPEED * dt);
    } else if (b.attackCd === 0) {
      b.attackCd = BEAR_ATTACK_CD;
      p.knockback = scale(norm(v(p.pos.x - b.pos.x, p.pos.z - b.pos.z)), BEAR_KNOCKBACK);
      state.events.push({ type: 'playerHit', pos: v(p.pos.x, p.pos.z) });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bears.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/bears.ts tests/bears.test.ts
git commit -m "feat: bear AI with aggro chase, swipe knockback, leash and respawn"
```

---

### Task 8: Pickup & carry

**Files:**
- Create: `src/game/systems/pickup.ts`
- Test: `tests/pickup.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/pickup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { carryTotal, pickupTick } from '../src/game/systems/pickup';
import { v } from '../src/game/math';
import { blankState } from './helpers';

const drop = (id: string, kind: 'wood' | 'meat' | 'gold' | 'cash', pos = v(0.5, 0), amount = 1) =>
  ({ id, kind, amount, pos });

describe('pickupTick', () => {
  it('picks up resources within the pickup radius', () => {
    const state = blankState();
    state.drops.push(drop('d1', 'wood'));
    pickupTick(state, 1 / 60);
    expect(state.player.carry.wood).toBe(1);
    expect(state.drops).toHaveLength(0);
  });

  it('magnets drops toward the player from further out', () => {
    const state = blankState();
    state.drops.push(drop('d1', 'wood', v(3, 0)));
    pickupTick(state, 0.1);
    expect(state.drops[0].pos.x).toBeLessThan(3);
  });

  it('leaves far drops alone', () => {
    const state = blankState();
    state.drops.push(drop('d1', 'wood', v(10, 0)));
    pickupTick(state, 0.1);
    expect(state.drops[0].pos.x).toBe(10);
  });

  it('respects carry capacity', () => {
    const state = blankState();
    state.player.carry.wood = 12; // cap is 12
    state.drops.push(drop('d1', 'meat'));
    pickupTick(state, 1 / 60);
    expect(state.player.carry.meat).toBe(0);
    expect(state.drops).toHaveLength(1); // left on the ground
  });

  it('cash is weightless and always picked up', () => {
    const state = blankState();
    state.player.carry.wood = 12;
    state.drops.push(drop('d1', 'cash', v(0.5, 0), 5));
    pickupTick(state, 1 / 60);
    expect(state.player.cash).toBe(5);
    expect(state.drops).toHaveLength(0);
  });

  it('carryTotal sums all resources', () => {
    const state = blankState();
    state.player.carry = { wood: 1, meat: 2, gold: 3 };
    expect(carryTotal(state)).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pickup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/game/systems/pickup.ts`**

```ts
import { MAGNET_RADIUS, MAGNET_SPEED, PICKUP_RADIUS } from '../../content/balance';
import { dist, toward, v } from '../math';
import type { Drop, GameState } from '../state';

export function carryTotal(state: GameState): number {
  const c = state.player.carry;
  return c.wood + c.meat + c.gold;
}

export function pickupTick(state: GameState, dt: number): void {
  const p = state.player;
  const keep: Drop[] = [];
  for (const d of state.drops) {
    const away = dist(d.pos, p.pos);
    if (away < MAGNET_RADIUS && away >= PICKUP_RADIUS) {
      d.pos = toward(d.pos, p.pos, MAGNET_SPEED * dt);
    }
    if (dist(d.pos, p.pos) < PICKUP_RADIUS) {
      if (d.kind === 'cash') {
        p.cash += d.amount;
        state.events.push({ type: 'pickup', pos: v(d.pos.x, d.pos.z) });
        continue;
      }
      if (carryTotal(state) + d.amount <= p.carryCap) {
        p.carry[d.kind] += d.amount;
        state.events.push({ type: 'pickup', pos: v(d.pos.x, d.pos.z) });
        continue;
      }
    }
    keep.push(d);
  }
  state.drops = keep;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pickup.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/pickup.ts tests/pickup.test.ts
git commit -m "feat: drop magnet and pickup with carry capacity"
```

---

### Task 9: Sell stations

**Files:**
- Create: `src/game/systems/stations.ts`
- Test: `tests/stations.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/stations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stationsTick } from '../src/game/systems/stations';
import { v } from '../src/game/math';
import { aStation, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) stationsTick(state, dt);
}

describe('stationsTick', () => {
  it('deposits the matching resource at ~8/s and pays cash onto the mat', () => {
    const state = blankState();
    state.stations.push(aStation()); // wood station at (0,1), mat at (2,1)
    state.player.carry.wood = 10;
    ticks(state, 0.5);
    const st = state.stations[0];
    expect(state.player.carry.wood).toBeLessThanOrEqual(7); // ≥3 deposited
    expect(st.matCash).toBeGreaterThan(0);
    expect(st.matCash % 2).toBe(0); // wood sells at 2 each
    expect(state.stats.earned).toBe(st.matCash);
  });

  it('does nothing when the player has none of that resource', () => {
    const state = blankState();
    state.stations.push(aStation());
    state.player.carry.meat = 5; // wrong resource
    ticks(state, 1);
    expect(state.stations[0].matCash).toBe(0);
    expect(state.player.carry.meat).toBe(5);
  });

  it('does nothing when out of range', () => {
    const state = blankState();
    state.stations.push(aStation({ pos: v(20, 0), matPos: v(22, 0) }));
    state.player.carry.wood = 5;
    ticks(state, 1);
    expect(state.stations[0].matCash).toBe(0);
  });

  it('player collects mat cash by standing on the mat', () => {
    const state = blankState();
    state.stations.push(aStation({ matPos: v(0.5, 0), matCash: 12 }));
    ticks(state, 0.1);
    expect(state.player.cash).toBe(12);
    expect(state.stations[0].matCash).toBe(0);
  });

  it('empties the whole carry over enough time', () => {
    const state = blankState();
    state.stations.push(aStation());
    state.player.carry.wood = 10;
    ticks(state, 2);
    expect(state.player.carry.wood).toBe(0);
    expect(state.stations[0].matCash).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/stations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/game/systems/stations.ts`**

```ts
import { DEPOSIT_RATE, SELL_RATE, STATION_RANGE } from '../../content/balance';
import { dist, v } from '../math';
import type { GameState, ResourceKind, SellStation } from '../state';

/** Convert `amount` of `kind` into cash on the station's mat. Used by player deposits and villager haulers. */
export function depositToStation(state: GameState, st: SellStation, kind: ResourceKind, amount: number): void {
  const cash = amount * SELL_RATE[kind];
  st.matCash += cash;
  state.stats.earned += cash;
  state.events.push({ type: 'sell', pos: v(st.pos.x, st.pos.z), cash });
}

export function stationsTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const st of state.stations) {
    if (dist(p.pos, st.pos) < STATION_RANGE && p.carry[st.resource] > 0) {
      st.timer += DEPOSIT_RATE * dt;
      const n = Math.min(Math.floor(st.timer), p.carry[st.resource]);
      if (n > 0) {
        st.timer -= n;
        p.carry[st.resource] -= n;
        depositToStation(state, st, st.resource, n);
        state.events.push({ type: 'deposit', pos: v(st.pos.x, st.pos.z) });
      }
    } else {
      st.timer = 0;
    }
    if (st.matCash > 0 && dist(p.pos, st.matPos) < STATION_RANGE) {
      p.cash += st.matCash;
      st.matCash = 0;
      state.events.push({ type: 'pickup', pos: v(st.matPos.x, st.matPos.z) });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/stations.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/stations.ts tests/stations.test.ts
git commit -m "feat: sell stations with deposit streaming and cash mats"
```

---

### Task 10: Unlock pads

**Files:**
- Create: `src/game/systems/pads.ts`
- Test: `tests/pads.test.ts`

Note: pad payments stream fractionally (12/s), so `player.cash` can hold non-integer
values mid-payment. The HUD displays `Math.floor(cash)`; this is intentional.

- [ ] **Step 1: Write the failing tests**

Create `tests/pads.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { padAvailable, padsTick } from '../src/game/systems/pads';
import { v } from '../src/game/math';
import { aPad, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) padsTick(state, dt);
}

describe('padsTick', () => {
  it('streams cash into a nearby pad and applies the unlock', () => {
    const state = blankState();
    state.pads.push(aPad()); // cost 10 cash → axe
    state.player.cash = 25;
    ticks(state, 1); // 12/s → done within 1s
    expect(state.pads[0].done).toBe(true);
    expect(state.player.tool).toBe('axe');
    expect(state.player.cash).toBeCloseTo(15);
    expect(state.events.some((e) => e.type === 'unlock')).toBe(true);
  });

  it('pauses when the player leaves and resumes later', () => {
    const state = blankState();
    state.pads.push(aPad());
    state.player.cash = 5;
    ticks(state, 1); // pays all 5, then stalls broke
    expect(state.pads[0].done).toBe(false);
    expect(state.pads[0].paid).toBeCloseTo(5);
    expect(state.player.cash).toBeCloseTo(0);
    state.player.cash = 10;
    ticks(state, 1);
    expect(state.pads[0].done).toBe(true);
  });

  it('pays with resources when the pad price is a resource', () => {
    const state = blankState();
    state.pads.push(aPad({ currency: 'wood', cost: 5, effect: { type: 'gate', zone: 'deepforest' } }));
    state.player.carry.wood = 8;
    ticks(state, 1);
    expect(state.zonesOpen.deepforest).toBe(true);
    expect(state.player.carry.wood).toBeCloseTo(3);
  });

  it('honors the requires chain', () => {
    const state = blankState();
    state.pads.push(aPad({ id: 'first', done: false }));
    state.pads.push(aPad({ id: 'second', requires: 'first', effect: { type: 'carry', add: 12 } }));
    expect(padAvailable(state, state.pads[1])).toBe(false);
    state.player.cash = 100;
    ticks(state, 1); // only 'first' can accept payment
    expect(state.pads[0].done).toBe(true);
    expect(padAvailable(state, state.pads[1])).toBe(true);
    ticks(state, 1);
    expect(state.player.carryCap).toBe(24);
  });

  it('activates machines', () => {
    const state = blankState();
    state.turrets.push({ id: 'turret1', pos: v(5, 5), range: 10, cd: 0, active: false, output: 0 });
    state.pads.push(aPad({ effect: { type: 'machine', machineId: 'turret1' } }));
    state.player.cash = 20;
    ticks(state, 1);
    expect(state.turrets[0].active).toBe(true);
  });

  it('applies speed multiplier', () => {
    const state = blankState();
    state.pads.push(aPad({ effect: { type: 'speed', mult: 1.3 } }));
    state.player.cash = 20;
    ticks(state, 1);
    expect(state.player.speed).toBeCloseTo(7.8);
  });

  it('applies pickaxe', () => {
    const state = blankState();
    state.pads.push(aPad({ effect: { type: 'pickaxe' } }));
    state.player.cash = 20;
    ticks(state, 1);
    expect(state.player.hasPickaxe).toBe(true);
  });

  it('never overpays past the cost', () => {
    const state = blankState();
    state.pads.push(aPad());
    state.player.cash = 100;
    ticks(state, 5);
    expect(state.player.cash).toBeCloseTo(90);
    expect(state.pads[0].paid).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pads.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/game/systems/pads.ts`**

```ts
import { PAD_RANGE, PAY_RATE } from '../../content/balance';
import { dist, v } from '../math';
import type { GameState, Pad } from '../state';

export function padAvailable(state: GameState, pad: Pad): boolean {
  if (pad.done) return false;
  if (pad.requires && !state.pads.find((p) => p.id === pad.requires)?.done) return false;
  return true;
}

function balanceOf(state: GameState, pad: Pad): number {
  return pad.currency === 'cash' ? state.player.cash : state.player.carry[pad.currency];
}

function deduct(state: GameState, pad: Pad, amount: number): void {
  if (pad.currency === 'cash') state.player.cash -= amount;
  else state.player.carry[pad.currency] -= amount;
}

export function applyEffect(state: GameState, pad: Pad): void {
  const e = pad.effect;
  if (e.type === 'tool') state.player.tool = e.tool;
  else if (e.type === 'pickaxe') state.player.hasPickaxe = true;
  else if (e.type === 'gate') state.zonesOpen[e.zone] = true;
  else if (e.type === 'speed') state.player.speed *= e.mult;
  else if (e.type === 'carry') state.player.carryCap += e.add;
  else {
    const t = state.turrets.find((m) => m.id === e.machineId);
    if (t) t.active = true;
    const s = state.sawmills.find((m) => m.id === e.machineId);
    if (s) s.active = true;
  }
}

export function padsTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const pad of state.pads) {
    if (!padAvailable(state, pad)) continue;
    if (dist(p.pos, pad.pos) >= PAD_RANGE) continue;
    const want = Math.min(PAY_RATE * dt, pad.cost - pad.paid);
    const pay = Math.min(want, balanceOf(state, pad));
    if (pay <= 0) continue;
    deduct(state, pad, pay);
    pad.paid += pay;
    if (pad.paid >= pad.cost - 1e-9) {
      pad.paid = pad.cost;
      pad.done = true;
      applyEffect(state, pad);
      state.events.push({ type: 'unlock', pos: v(pad.pos.x, pad.pos.z) });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pads.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/pads.ts tests/pads.test.ts
git commit -m "feat: unlock pads with streamed payment and all effect types"
```

---

### Task 11: Machines (turrets + sawmills)

**Files:**
- Create: `src/game/systems/machines.ts`
- Test: `tests/machines.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/machines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { machinesTick } from '../src/game/systems/machines';
import { v } from '../src/game/math';
import { aBear, aTree, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) machinesTick(state, dt);
}

const turret = (over = {}) =>
  ({ id: 'turret1', pos: v(0, 0), range: 10, cd: 0, active: true, output: 0, ...over });
const sawmill = (over = {}) =>
  ({ id: 'sawmill1', pos: v(0, 0), radius: 8, timer: 0, active: true, output: 0, ...over });

describe('turrets', () => {
  it('kills a bear in range over time and banks meat as output', () => {
    const state = blankState();
    state.turrets.push(turret());
    state.bears.push(aBear({ pos: v(3, 0) })); // hp 6, turret dmg 2 @ 1.2s
    ticks(state, 4);
    expect(state.bears[0].state).toBe('dead');
    expect(state.turrets[0].output).toBe(3); // BEAR_MEAT
    expect(state.stats.bearsKilled).toBe(1);
  });

  it('inactive turrets do nothing', () => {
    const state = blankState();
    state.turrets.push(turret({ active: false }));
    state.bears.push(aBear({ pos: v(3, 0) }));
    ticks(state, 4);
    expect(state.bears[0].state).not.toBe('dead');
  });

  it('ignores bears out of range or in closed zones', () => {
    const state = blankState();
    state.turrets.push(turret());
    state.bears.push(aBear({ id: 'far', pos: v(30, 0) }));
    state.bears.push(aBear({ id: 'closed', zone: 'hunting', pos: v(3, 0) }));
    ticks(state, 4);
    expect(state.bears.every((b) => b.state !== 'dead')).toBe(true);
  });
});

describe('sawmills', () => {
  it('fells a standing tree in radius every period, banking wood', () => {
    const state = blankState();
    state.sawmills.push(sawmill());
    state.trees.push(aTree({ pos: v(3, 0) }));
    ticks(state, 4.1); // SAWMILL_PERIOD = 4
    expect(state.trees[0].respawn).toBeGreaterThan(0);
    expect(state.sawmills[0].output).toBe(2); // TREE_YIELD
    expect(state.stats.chops).toBe(1);
  });

  it('does nothing when no standing tree is in radius', () => {
    const state = blankState();
    state.sawmills.push(sawmill());
    state.trees.push(aTree({ pos: v(30, 0) }));
    ticks(state, 5);
    expect(state.sawmills[0].output).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/machines.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/game/systems/machines.ts`**

```ts
import {
  SAWMILL_PERIOD, TREE_RESPAWN, TREE_YIELD, TURRET_DMG, TURRET_PERIOD,
} from '../../content/balance';
import { dist, v } from '../math';
import { killBear } from './harvest';
import type { GameState } from '../state';

export function machinesTick(state: GameState, dt: number): void {
  for (const t of state.turrets) {
    if (!t.active) continue;
    t.cd -= dt;
    if (t.cd > 0) continue;
    const inRange = state.bears
      .filter((b) => b.state !== 'dead' && state.zonesOpen[b.zone] && dist(b.pos, t.pos) <= t.range)
      .sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos));
    const target = inRange[0];
    if (!target) continue;
    t.cd = TURRET_PERIOD;
    target.hp -= TURRET_DMG;
    state.events.push({ type: 'bearHit', pos: v(target.pos.x, target.pos.z) });
    if (target.hp <= 0) killBear(state, target, t.id);
  }

  for (const s of state.sawmills) {
    if (!s.active) continue;
    s.timer -= dt;
    if (s.timer > 0) continue;
    const tree = state.trees.find(
      (tr) => tr.respawn === 0 && state.zonesOpen[tr.zone] && dist(tr.pos, s.pos) <= s.radius,
    );
    if (!tree) continue;
    s.timer = SAWMILL_PERIOD;
    tree.respawn = TREE_RESPAWN;
    s.output += TREE_YIELD;
    state.stats.chops++;
    state.events.push({ type: 'treeFall', pos: v(tree.pos.x, tree.pos.z) });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/machines.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/machines.ts tests/machines.test.ts
git commit -m "feat: crossbow turrets and sawmills producing machine output"
```

---

### Task 12: Rails, carts & depot

**Files:**
- Create: `src/game/systems/carts.ts`
- Test: `tests/carts.test.ts`

Cart lifecycle: `dir: -1` = sitting at / heading to the source machine (s→0);
at s=0 it loads from the machine's `output` and flips to `dir: 1` only when loaded;
at the far end (the depot) it unloads into `state.depot` and flips back.

- [ ] **Step 1: Write the failing tests**

Create `tests/carts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cartPos, cartsTick, railResource } from '../src/game/systems/carts';
import { v } from '../src/game/math';
import { aCart, aRail, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) cartsTick(state, dt);
}

function setup() {
  const state = blankState();
  // 10-unit rail from sawmill at (0,0) to depot end at (10,0); CART_SPEED = 5
  state.sawmills.push({ id: 'm1', pos: v(0, 0), radius: 8, timer: 0, active: true, output: 10 });
  state.rails.push(aRail());
  state.carts.push(aCart());
  return state;
}

describe('carts', () => {
  it('rail resource follows the source machine type', () => {
    expect(railResource(aRail())).toBe('wood');
    expect(railResource(aRail({ sourceType: 'turret' }))).toBe('meat');
  });

  it('loads at the source and departs', () => {
    const state = setup();
    ticks(state, 0.1);
    expect(state.carts[0].load).toBe(6); // cap
    expect(state.sawmills[0].output).toBe(4);
    expect(state.carts[0].dir).toBe(1);
  });

  it('delivers to the depot and returns', () => {
    const state = setup();
    ticks(state, 2.5); // load + 2s travel each way
    expect(state.depot.wood).toBeGreaterThanOrEqual(6);
  });

  it('waits at an empty source without departing', () => {
    const state = setup();
    state.sawmills[0].output = 0;
    ticks(state, 1);
    expect(state.carts[0].s).toBe(0);
    expect(state.carts[0].dir).toBe(-1);
    expect(state.carts[0].load).toBe(0);
  });

  it('shuttles continuously while output remains', () => {
    const state = setup();
    ticks(state, 10);
    expect(state.depot.wood).toBe(10); // everything delivered
    expect(state.sawmills[0].output).toBe(0);
  });

  it('cartPos maps s onto the rail polyline', () => {
    const state = setup();
    state.carts[0].s = 5;
    expect(cartPos(state, state.carts[0])).toEqual({ x: 5, z: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/carts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/game/systems/carts.ts`**

```ts
import { CART_SPEED } from '../../content/balance';
import { pointOnPolyline, polylineLength, type Vec2 } from '../math';
import type { Cart, GameState, Rail, ResourceKind } from '../state';

export function railResource(rail: Rail): ResourceKind {
  return rail.sourceType === 'turret' ? 'meat' : 'wood';
}

function takeFromSource(state: GameState, rail: Rail, n: number): number {
  const m = rail.sourceType === 'turret'
    ? state.turrets.find((t) => t.id === rail.sourceId)
    : state.sawmills.find((s) => s.id === rail.sourceId);
  if (!m) return 0;
  const got = Math.min(n, m.output);
  m.output -= got;
  return got;
}

export function cartPos(state: GameState, cart: Cart): Vec2 {
  const rail = state.rails.find((r) => r.id === cart.railId)!;
  return pointOnPolyline(rail.points, cart.s);
}

export function cartsTick(state: GameState, dt: number): void {
  for (const cart of state.carts) {
    const rail = state.rails.find((r) => r.id === cart.railId);
    if (!rail) continue;
    const len = polylineLength(rail.points);
    if (cart.dir === 1) {
      cart.s += CART_SPEED * dt;
      if (cart.s >= len) {
        cart.s = len;
        state.depot[railResource(rail)] += cart.load;
        cart.load = 0;
        cart.dir = -1;
      }
    } else {
      cart.s = Math.max(0, cart.s - CART_SPEED * dt);
      if (cart.s === 0) {
        cart.load += takeFromSource(state, rail, cart.cap - cart.load);
        if (cart.load > 0) cart.dir = 1;
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/carts.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/carts.ts tests/carts.test.ts
git commit -m "feat: minecarts shuttle machine output along rails to the depot"
```

---

### Task 13: Villagers (thaw + haul)

**Files:**
- Create: `src/game/systems/villagers.ts`
- Test: `tests/villagers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/villagers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { villagersTick } from '../src/game/systems/villagers';
import { v } from '../src/game/math';
import { aStation, aVillager, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) villagersTick(state, dt);
}

describe('villagersTick', () => {
  it('thaws a frozen villager for meat', () => {
    const state = blankState();
    state.villagers.push(aVillager()); // at (0,1), player at origin; cost = thawCost(0) = 2
    state.player.carry.meat = 5;
    ticks(state, 0.1);
    expect(state.villagers[0].state).toBe('walking');
    expect(state.player.carry.meat).toBe(3);
    expect(state.rescued).toBe(1);
    expect(state.events.some((e) => e.type === 'thaw')).toBe(true);
  });

  it('does not thaw without enough meat', () => {
    const state = blankState();
    state.villagers.push(aVillager());
    state.player.carry.meat = 1;
    ticks(state, 0.5);
    expect(state.villagers[0].state).toBe('frozen');
    expect(state.rescued).toBe(0);
  });

  it('walking villagers reach camp and become haulers', () => {
    const state = blankState();
    state.villagers.push(aVillager({ state: 'walking', pos: v(-3, 2) })); // CAMP_POS is (0,2)
    ticks(state, 2);
    expect(state.villagers[0].state).toBe('hauler');
  });

  it('haulers ferry depot stock to the matching station as mat cash', () => {
    const state = blankState();
    state.depotPos = v(3, 0); // short test route: depot (3,0) → wood station (0,1)
    state.depot.wood = 6;
    state.stations.push(aStation());
    state.villagers.push(aVillager({ state: 'hauler', pos: v(3, 0) })); // at depot
    ticks(state, 8); // two short round trips at speed 3
    expect(state.depot.wood).toBe(0);
    expect(state.stations[0].matCash).toBe(12); // 6 wood * 2
  });

  it('haulers idle at an empty depot', () => {
    const state = blankState();
    state.depotPos = v(3, 0);
    state.stations.push(aStation());
    state.villagers.push(aVillager({ state: 'hauler', pos: v(3, 0) }));
    ticks(state, 2);
    expect(state.villagers[0].carrying).toBeNull();
    expect(state.stations[0].matCash).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/villagers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/game/systems/villagers.ts`**

```ts
import { HAUL_AMOUNT, VILLAGER_RANGE, VILLAGER_SPEED, thawCost } from '../../content/balance';
import { CAMP_POS } from '../../content/map';
import { dist, toward, v } from '../math';
import { depositToStation } from './stations';
import type { GameState, ResourceKind, Villager } from '../state';

export function villagersTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const vil of state.villagers) {
    if (vil.state === 'frozen') {
      const cost = thawCost(state.rescued);
      if (dist(p.pos, vil.pos) < VILLAGER_RANGE && p.carry.meat >= cost) {
        p.carry.meat -= cost;
        vil.state = 'walking';
        state.rescued++;
        state.events.push({ type: 'thaw', pos: v(vil.pos.x, vil.pos.z) });
      }
    } else if (vil.state === 'walking') {
      vil.pos = toward(vil.pos, CAMP_POS, VILLAGER_SPEED * dt);
      if (dist(vil.pos, CAMP_POS) < 0.5) vil.state = 'hauler';
    } else {
      haulerTick(state, vil, dt);
    }
  }
}

function haulerTick(state: GameState, vil: Villager, dt: number): void {
  if (vil.carrying === null) {
    vil.pos = toward(vil.pos, state.depotPos, VILLAGER_SPEED * dt);
    if (dist(vil.pos, state.depotPos) < 1) {
      const kinds: ResourceKind[] = ['wood', 'meat', 'gold'];
      kinds.sort((a, b) => state.depot[b] - state.depot[a]);
      const best = kinds[0];
      if (state.depot[best] > 0) {
        const n = Math.min(HAUL_AMOUNT, state.depot[best]);
        state.depot[best] -= n;
        vil.carrying = best;
        vil.amount = n;
      }
    }
  } else {
    const st = state.stations.find((s) => s.resource === vil.carrying);
    if (!st) { vil.carrying = null; vil.amount = 0; return; }
    vil.pos = toward(vil.pos, st.pos, VILLAGER_SPEED * dt);
    if (dist(vil.pos, st.pos) < 1.2) {
      depositToStation(state, st, vil.carrying, vil.amount);
      vil.carrying = null;
      vil.amount = 0;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/villagers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/villagers.ts tests/villagers.test.ts
git commit -m "feat: villager thawing and depot-to-station hauling"
```

---

### Task 14: Win check, update loop and save/load

**Files:**
- Create: `src/game/systems/win.ts`
- Create: `src/game/update.ts`
- Create: `src/game/save.ts`
- Test: `tests/win.test.ts`, `tests/save.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/win.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { winTick } from '../src/game/systems/win';
import { update } from '../src/game/update';
import { v } from '../src/game/math';
import { aPad, aVillager, blankState } from './helpers';

describe('winTick', () => {
  it('wins when all pads are done and all villagers rescued', () => {
    const state = blankState();
    state.pads.push(aPad({ done: true }));
    state.villagers.push(aVillager({ state: 'hauler' }));
    winTick(state);
    expect(state.won).toBe(true);
    expect(state.events.filter((e) => e.type === 'win')).toHaveLength(1);
    winTick(state); // idempotent
    expect(state.events.filter((e) => e.type === 'win')).toHaveLength(1);
  });

  it('does not win early', () => {
    const state = blankState();
    state.pads.push(aPad({ done: true }));
    state.villagers.push(aVillager({ state: 'frozen' }));
    winTick(state);
    expect(state.won).toBe(false);
  });
});

describe('update integration', () => {
  it('runs a full tick without errors and advances time', () => {
    const state = blankState();
    update(state, v(1, 0), 1 / 60);
    expect(state.time).toBeCloseTo(1 / 60);
    expect(state.player.pos.x).toBeGreaterThan(0);
  });
});
```

Create `tests/save.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/init';
import { deserialize, serialize } from '../src/game/save';

describe('save round-trip', () => {
  it('preserves player, progress and stockpiles', () => {
    const state = createInitialState();
    state.player.cash = 123.4;
    state.player.pos = { x: 5, z: -3 };
    state.player.tool = 'scythe';
    state.player.hasPickaxe = true;
    state.player.speed = 7.8;
    state.player.carryCap = 24;
    state.player.carry.wood = 4;
    state.zonesOpen.deepforest = true;
    const padIds = ['p-axe', 'p-gate-deep', 'p-turret1'];
    for (const pad of state.pads) if (padIds.includes(pad.id)) { pad.done = true; pad.paid = pad.cost; }
    state.villagers[0].state = 'hauler';
    state.villagers[1].state = 'walking';
    state.rescued = 2;
    state.depot.meat = 9;
    state.turrets[0].output = 5;
    state.stats = { chops: 10, bearsKilled: 3, earned: 200 };
    state.time = 321;
    state.won = false;

    const restored = deserialize(serialize(state));

    expect(restored.player.cash).toBeCloseTo(123.4);
    expect(restored.player.pos).toEqual({ x: 5, z: -3 });
    expect(restored.player.tool).toBe('scythe');
    expect(restored.player.hasPickaxe).toBe(true);
    expect(restored.player.speed).toBeCloseTo(7.8);
    expect(restored.player.carryCap).toBe(24);
    expect(restored.player.carry.wood).toBe(4);
    expect(restored.zonesOpen.deepforest).toBe(true);
    expect(restored.pads.filter((p) => p.done).map((p) => p.id).sort()).toEqual([...padIds].sort());
    expect(restored.turrets.find((t) => t.id === 'turret1')?.active).toBe(true); // derived from pad
    expect(restored.rescued).toBe(2);
    // mid-walk villagers restore as haulers at the depot — acceptable per spec
    expect(restored.villagers.filter((v) => v.state !== 'frozen')).toHaveLength(2);
    expect(restored.depot.meat).toBe(9);
    expect(restored.turrets[0].output).toBe(5);
    expect(restored.stats.earned).toBe(200);
    expect(restored.time).toBe(321);
  });

  it('preserves the won flag', () => {
    const state = createInitialState();
    state.won = true;
    expect(deserialize(serialize(state)).won).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/win.test.ts tests/save.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/game/systems/win.ts`**

```ts
import type { GameState } from '../state';

export function winTick(state: GameState): void {
  if (state.won) return;
  if (state.pads.length === 0) return;
  const allPads = state.pads.every((p) => p.done);
  const allThawed = state.villagers.every((v) => v.state !== 'frozen');
  if (allPads && allThawed) {
    state.won = true;
    state.events.push({ type: 'win' });
  }
}
```

- [ ] **Step 4: Create `src/game/update.ts`**

```ts
import type { Vec2 } from './math';
import type { GameState } from './state';
import { movePlayer } from './systems/movement';
import { harvestTick } from './systems/harvest';
import { bearsTick } from './systems/bears';
import { pickupTick } from './systems/pickup';
import { stationsTick } from './systems/stations';
import { padsTick } from './systems/pads';
import { machinesTick } from './systems/machines';
import { cartsTick } from './systems/carts';
import { villagersTick } from './systems/villagers';
import { winTick } from './systems/win';

/** One fixed-timestep tick. Order matters: move → act → economy → automation → win. */
export function update(state: GameState, intent: Vec2, dt: number): void {
  state.time += dt;
  movePlayer(state, intent, dt);
  harvestTick(state, dt);
  bearsTick(state, dt);
  pickupTick(state, dt);
  stationsTick(state, dt);
  padsTick(state, dt);
  machinesTick(state, dt);
  cartsTick(state, dt);
  villagersTick(state, dt);
  winTick(state);
}
```

- [ ] **Step 5: Create `src/game/save.ts`**

```ts
import { createInitialState } from './init';
import type { GameState } from './state';

const KEY = 'frostfall-save-v1';

interface SaveData {
  time: number;
  won: boolean;
  player: GameState['player'];
  padsDone: string[];
  zonesOpen: Record<string, boolean>;
  thawed: string[];
  depot: GameState['depot'];
  machineOutputs: Record<string, number>;
  stats: GameState['stats'];
}

export function serialize(state: GameState): string {
  const data: SaveData = {
    time: state.time,
    won: state.won,
    player: state.player,
    padsDone: state.pads.filter((p) => p.done).map((p) => p.id),
    zonesOpen: state.zonesOpen,
    thawed: state.villagers.filter((v) => v.state !== 'frozen').map((v) => v.id),
    depot: state.depot,
    machineOutputs: Object.fromEntries([
      ...state.turrets.map((t) => [t.id, t.output]),
      ...state.sawmills.map((s) => [s.id, s.output]),
    ]),
    stats: state.stats,
  };
  return JSON.stringify(data);
}

/**
 * Rebuild fresh content, then overlay saved progress. Player numbers (speed,
 * carryCap, tool…) are restored verbatim rather than re-running pad effects, so
 * multiplicative upgrades are never double-applied. Machine `active` flags are
 * derived from completed machine pads.
 */
export function deserialize(json: string): GameState {
  const data = JSON.parse(json) as SaveData;
  const state = createInitialState();
  state.time = data.time;
  state.won = data.won;
  state.player = { ...state.player, ...data.player };
  state.zonesOpen = { ...state.zonesOpen, ...data.zonesOpen };
  for (const pad of state.pads) {
    if (data.padsDone.includes(pad.id)) { pad.done = true; pad.paid = pad.cost; }
  }
  for (const pad of state.pads) {
    if (!pad.done) continue;
    const eff = pad.effect;
    if (eff.type !== 'machine') continue;
    const t = state.turrets.find((m) => m.id === eff.machineId);
    if (t) t.active = true;
    const s = state.sawmills.find((m) => m.id === eff.machineId);
    if (s) s.active = true;
  }
  for (const vil of state.villagers) {
    if (data.thawed.includes(vil.id)) {
      vil.state = 'hauler';
      vil.pos = { x: state.depotPos.x, z: state.depotPos.z };
    }
  }
  state.rescued = data.thawed.length;
  state.depot = data.depot;
  for (const t of state.turrets) t.output = data.machineOutputs[t.id] ?? 0;
  for (const s of state.sawmills) s.output = data.machineOutputs[s.id] ?? 0;
  state.stats = data.stats;
  return state;
}

export function saveGame(state: GameState): void {
  try { localStorage.setItem(KEY, serialize(state)); } catch { /* storage unavailable */ }
}

export function loadGame(): GameState | null {
  try {
    const json = localStorage.getItem(KEY);
    return json ? deserialize(json) : null;
  } catch { return null; }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 6: Run the full logic suite**

Run: `npm test`
Expected: PASS — all test files green (math, init, movement, harvest, bears, pickup, stations, pads, machines, carts, villagers, win, save).

- [ ] **Step 7: Commit**

```bash
git add src/game/systems/win.ts src/game/update.ts src/game/save.ts tests/win.test.ts tests/save.test.ts
git commit -m "feat: win condition, system update order and save/load round-trip"
```

---

### Task 15: Renderer + playable bootstrap

**Files:**
- Create: `src/render/meshes.ts`
- Create: `src/render/renderer.ts`
- Modify: `src/main.ts` (replace placeholder)

No unit tests for rendering — Step 5 is a manual browser checklist. Keep ALL game
rules out of this layer; it only reads state and draws.

- [ ] **Step 1: Create `src/render/meshes.ts`**

```ts
import * as THREE from 'three';
import type { Currency, ToolId } from '../game/state';

const lam = (color: number) => new THREE.MeshLambertMaterial({ color });

export const COLORS = {
  trunk: 0x8a5a33, foliage: 0x9cc7e8, foliage2: 0xb8dbf2,
  snow: 0xf4f8fb, road: 0xc4996a,
  bear: 0xf0efe8, skin: 0xe8c39e,
  playerCoat: 0x2b6cb0, villagerCoat: 0x3bb2c4, ice: 0x9adcf0,
  bench: 0xe08a3c, mat: 0x3a3a3a,
  wood: 0xa9743f, meat: 0xd9534f, gold: 0xf2c14e, cash: 0x4caf50,
  rail: 0x6b4a2b, machine: 0xb5834f,
};

export const ICONS: Record<Currency, string> = { cash: '💵', wood: '🪵', meat: '🥩', gold: '🪙' };

export function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 20, 240, 88, 20);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(3.4, 1.7, 1);
  return sprite;
}

export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const full = new THREE.Group();
  full.name = 'full';
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.2, 6), lam(COLORS.trunk));
  trunk.position.y = 0.6;
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 7), lam(COLORS.foliage));
  c1.position.y = 2.1;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.8, 7), lam(COLORS.foliage2));
  c2.position.y = 3.3;
  full.add(trunk, c1, c2);
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.4, 6), lam(COLORS.trunk));
  stump.position.y = 0.2;
  stump.name = 'stump';
  g.add(full, stump);
  return g;
}

export function makePerson(coat: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 8), lam(coat));
  body.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), lam(COLORS.skin));
  head.position.y = 1.4;
  g.add(body, head);
  return g;
}

export function makePlayer(): THREE.Group {
  const g = makePerson(COLORS.playerCoat);
  const toolMount = new THREE.Group();
  toolMount.name = 'toolMount';
  toolMount.position.set(0.45, 1.0, 0.1);
  g.add(toolMount);
  const carry = new THREE.Group();
  carry.name = 'carry';
  carry.position.set(0, 1.05, -0.4);
  g.add(carry);
  return g;
}

export function makeTool(kind: ToolId | 'pickaxe'): THREE.Group {
  const g = new THREE.Group();
  const isLong = kind === 'scythe';
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, isLong ? 1.4 : 0.9, 6), lam(0x7a5230),
  );
  handle.position.y = isLong ? 0.7 : 0.45;
  g.add(handle);
  if (kind === 'scythe') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.18), lam(0xc0c8cc));
    blade.position.set(0.4, 1.4, 0);
    g.add(blade);
  } else if (kind === 'pickaxe') {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), lam(0x95a5a6));
    head.position.set(0, 0.85, 0);
    g.add(head);
  } else {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.12), lam(kind === 'axe' ? 0xc0392b : 0x95a5a6));
    head.position.set(0.12, 0.85, 0);
    g.add(head);
  }
  return g;
}

export function makeBear(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), lam(COLORS.bear));
  body.scale.set(1.1, 0.8, 1.5);
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), lam(COLORS.bear));
  head.position.set(0, 1.1, 1.2);
  const earGeo = new THREE.SphereGeometry(0.14, 6, 6);
  const e1 = new THREE.Mesh(earGeo, lam(COLORS.bear)); e1.position.set(0.25, 1.5, 1.1);
  const e2 = new THREE.Mesh(earGeo, lam(COLORS.bear)); e2.position.set(-0.25, 1.5, 1.1);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), lam(0x333333));
  nose.position.set(0, 1.05, 1.6);
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.02), lam(0x222222));
  barBg.position.y = 2.2; barBg.rotation.y = Math.PI / 4; barBg.name = 'hpbg';
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.1, 0.03), lam(0x44cc44));
  bar.position.y = 2.2; bar.rotation.y = Math.PI / 4; bar.name = 'hp';
  g.add(body, head, e1, e2, nose, barBg, bar);
  return g;
}

export function makeVillager(): THREE.Group {
  const g = makePerson(COLORS.villagerCoat);
  const ice = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.9, 1.0),
    new THREE.MeshLambertMaterial({ color: COLORS.ice, transparent: true, opacity: 0.55 }),
  );
  ice.position.y = 0.95;
  ice.name = 'ice';
  const load = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), lam(COLORS.wood));
  load.position.set(0, 1.1, -0.45);
  load.name = 'load';
  load.visible = false;
  g.add(ice, load);
  return g;
}

export function makeBench(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.0), lam(COLORS.bench));
  top.position.y = 0.8;
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.8), lam(0xc47a34));
  base.position.y = 0.35;
  g.add(top, base);
  return g;
}

export function makeMatMesh(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.6), lam(COLORS.mat));
  m.position.y = 0.03;
  return m;
}

export function makePadMesh(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 24), lam(0x555555));
  base.position.y = 0.025;
  const progress = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.06, 24), lam(0x3aa655));
  progress.position.y = 0.035;
  progress.scale.set(0.001, 1, 0.001);
  progress.name = 'progress';
  g.add(base, progress);
  return g;
}

export function makeTurret(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 8), lam(COLORS.machine));
  base.position.y = 0.25;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 6), lam(COLORS.trunk));
  post.position.y = 1.0;
  const bowA = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.14), lam(0x8a5a33));
  bowA.position.y = 1.7;
  const bowB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 1.1), lam(0x6b4a2b));
  bowB.position.y = 1.7;
  g.add(base, post, bowA, bowB);
  return g;
}

export function makeSawmill(): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.4), lam(COLORS.machine));
  frame.position.y = 0.5;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), lam(0xc0c8cc));
  blade.rotation.z = Math.PI / 2;
  blade.position.y = 1.3;
  blade.name = 'blade';
  g.add(frame, blade);
  return g;
}

export function makeCart(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.7), lam(0x555b61));
  box.position.y = 0.5;
  const load = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.5), lam(COLORS.wood));
  load.position.y = 0.85;
  load.name = 'load';
  g.add(box, load);
  return g;
}

export function makeDepot(): THREE.Group {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 4.5), lam(0x9a6b3f));
  slab.position.y = 0.15;
  g.add(slab);
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), lam(COLORS.trunk));
    post.position.set(px, 0.8, pz);
    g.add(post);
  }
  return g;
}

export function makeSeam(): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.SphereGeometry(1.1, 7, 5), lam(0x8f979e));
  rock.scale.y = 0.6;
  rock.position.y = 0.4;
  g.add(rock);
  for (const [px, pz] of [[-0.4, 0.2], [0.4, -0.1], [0, 0.5]] as const) {
    const nug = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), lam(COLORS.gold));
    nug.position.set(px, 0.95, pz);
    g.add(nug);
  }
  return g;
}

export function makeDropMesh(kind: Currency): THREE.Mesh {
  if (kind === 'wood') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 6), lam(COLORS.wood));
    m.rotation.z = Math.PI / 2;
    m.position.y = 0.3;
    return m;
  }
  if (kind === 'meat') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), lam(COLORS.meat));
    m.position.y = 0.3;
    return m;
  }
  if (kind === 'gold') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.3), lam(COLORS.gold));
    m.position.y = 0.3;
    return m;
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), lam(COLORS.cash));
  m.position.y = 0.3;
  return m;
}

export function makeRailMesh(points: { x: number; z: number }[]): THREE.Group {
  const g = new THREE.Group();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const seg = new THREE.Group();
    seg.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    seg.rotation.y = -Math.atan2(dz, dx);
    for (const off of [-0.3, 0.3]) {
      const railBar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), lam(0x777f86));
      railBar.position.set(0, 0.12, off);
      seg.add(railBar);
    }
    const nSleepers = Math.max(1, Math.floor(len / 0.9));
    for (let sIdx = 0; sIdx < nSleepers; sIdx++) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.9), lam(COLORS.rail));
      sleeper.position.set(-len / 2 + (sIdx + 0.5) * (len / nSleepers), 0.06, 0);
      seg.add(sleeper);
    }
    g.add(seg);
  }
  return g;
}

export function makeGateWall(length: number): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 2.2, 0.5), lam(0xd9534f));
  wall.position.y = 1.1;
  g.add(wall);
  for (const end of [-length / 2, length / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.8, 8), lam(0xffffff));
    post.position.set(end, 1.4, 0);
    g.add(post);
  }
  return g;
}
```

- [ ] **Step 2: Create `src/render/renderer.ts`**

```ts
import * as THREE from 'three';
import { TOOLS } from '../content/balance';
import { ZONE_RECTS } from '../content/map';
import { cartPos } from '../game/systems/carts';
import { padAvailable } from '../game/systems/pads';
import type { GameEvent, GameState } from '../game/state';
import {
  COLORS, ICONS, makeBear, makeBench, makeCart, makeDepot, makeDropMesh, makeGateWall,
  makeLabel, makeMatMesh, makePadMesh, makePlayer, makeRailMesh, makeSawmill, makeSeam,
  makeTool, makeTree, makeTurret, makeVillager,
} from './meshes';

const CAM_OFFSET = new THREE.Vector3(16, 20, 16);

interface FloatingText { sprite: THREE.Sprite; life: number }

export class Renderer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private webgl: THREE.WebGLRenderer;
  private meshes = new Map<string, THREE.Object3D>();
  private gates = new Map<string, THREE.Object3D>();
  private floats: FloatingText[] = [];
  private snow!: THREE.Points;
  private target = new THREE.Vector3();
  private t = 0;
  private lastToolKey = '';
  private lastCarryKey = '';

  constructor(container: HTMLElement) {
    this.webgl = new THREE.WebGLRenderer({ antialias: true });
    this.webgl.setSize(window.innerWidth, window.innerHeight);
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.webgl.domElement);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.webgl.setSize(window.innerWidth, window.innerHeight);
    });
    this.buildWorld();
  }

  private buildWorld(): void {
    this.scene.background = new THREE.Color(0xdfe9f0);
    this.scene.fog = new THREE.Fog(0xdfe9f0, 60, 140);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x8899aa, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 160), new THREE.MeshLambertMaterial({ color: COLORS.snow }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 14), new THREE.MeshLambertMaterial({ color: COLORS.road }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    this.scene.add(road);
    const snowGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      pos[i * 3] = -60 + Math.random() * 120;
      pos[i * 3 + 1] = Math.random() * 25;
      pos[i * 3 + 2] = -40 + Math.random() * 80;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.8 }),
    );
    this.scene.add(this.snow);
  }

  /** Build once-per-game meshes from state (stations, pads, machines, rails, gates, depot). */
  buildStatic(state: GameState): void {
    for (const st of state.stations) {
      const bench = makeBench();
      bench.position.set(st.pos.x, 0, st.pos.z);
      const label = makeLabel(ICONS[st.resource]);
      label.position.y = 2.4;
      bench.add(label);
      this.scene.add(bench);
      const mat = makeMatMesh();
      mat.position.set(st.matPos.x, 0, st.matPos.z);
      this.scene.add(mat);
    }
    for (const pad of state.pads) {
      const g = makePadMesh();
      g.position.set(pad.pos.x, 0, pad.pos.z);
      const label = makeLabel(`${ICONS[pad.currency]} ${pad.cost}`);
      label.position.y = 2.2;
      g.add(label);
      this.meshes.set(pad.id, g);
      this.scene.add(g);
    }
    for (const turret of state.turrets) {
      const g = makeTurret();
      g.position.set(turret.pos.x, 0, turret.pos.z);
      this.meshes.set(turret.id, g);
      this.scene.add(g);
    }
    for (const mill of state.sawmills) {
      const g = makeSawmill();
      g.position.set(mill.pos.x, 0, mill.pos.z);
      this.meshes.set(mill.id, g);
      this.scene.add(g);
    }
    for (const rail of state.rails) {
      const g = makeRailMesh(rail.points);
      this.meshes.set(rail.id, g);
      this.scene.add(g);
    }
    const depot = makeDepot();
    depot.position.set(state.depotPos.x, 0, state.depotPos.z);
    const depotLabel = makeLabel('📦');
    depotLabel.position.y = 2.6;
    depot.add(depotLabel);
    this.scene.add(depot);
    for (const [zone, rect] of Object.entries(ZONE_RECTS)) {
      const alongZ = zone !== 'quarry' ? rect.x0 : rect.x1;
      const wall = makeGateWall(rect.z1 - rect.z0);
      wall.position.set(alongZ, 0, (rect.z0 + rect.z1) / 2);
      wall.rotation.y = Math.PI / 2;
      this.gates.set(zone, wall);
      this.scene.add(wall);
    }
  }

  /** Full teardown + rebuild (used by Restart). */
  rebuild(state: GameState): void {
    while (this.scene.children.length > 0) this.scene.remove(this.scene.children[0]);
    this.meshes.clear();
    this.gates.clear();
    this.floats = [];
    this.lastToolKey = '';
    this.lastCarryKey = '';
    this.buildWorld();
    this.buildStatic(state);
  }

  private ensure(id: string, make: () => THREE.Object3D): THREE.Object3D {
    let m = this.meshes.get(id);
    if (!m) {
      m = make();
      this.meshes.set(id, m);
      this.scene.add(m);
    }
    return m;
  }

  sync(state: GameState, dt: number): void {
    this.t += dt;
    this.syncPlayer(state);
    for (const tree of state.trees) {
      const m = this.ensure(tree.id, makeTree);
      m.position.set(tree.pos.x, 0, tree.pos.z);
      m.visible = state.zonesOpen[tree.zone];
      m.getObjectByName('full')!.visible = tree.respawn === 0;
      m.getObjectByName('stump')!.visible = tree.respawn > 0;
    }
    for (const seam of state.seams) {
      const m = this.ensure(seam.id, makeSeam);
      m.position.set(seam.pos.x, 0, seam.pos.z);
      m.visible = state.zonesOpen[seam.zone];
      m.scale.y = seam.respawn > 0 ? 0.35 : 1;
    }
    for (const bear of state.bears) {
      const m = this.ensure(bear.id, makeBear);
      m.position.set(bear.pos.x, 0, bear.pos.z);
      m.visible = state.zonesOpen[bear.zone] && bear.state !== 'dead';
      if (bear.state === 'aggro') {
        m.rotation.y = Math.atan2(state.player.pos.x - bear.pos.x, state.player.pos.z - bear.pos.z);
        m.position.y = Math.abs(Math.sin(this.t * 10)) * 0.15;
      }
      const hurt = bear.hp < bear.maxHp && bear.state !== 'dead';
      m.getObjectByName('hpbg')!.visible = hurt;
      const bar = m.getObjectByName('hp')!;
      bar.visible = hurt;
      bar.scale.x = Math.max(bear.hp / bear.maxHp, 0.001);
    }
    const liveDrops = new Set<string>();
    for (const drop of state.drops) {
      liveDrops.add(drop.id);
      const m = this.ensure(drop.id, () => makeDropMesh(drop.kind));
      m.position.set(drop.pos.x, 0.3 + Math.sin(this.t * 4 + drop.pos.x) * 0.08, drop.pos.z);
      m.rotation.y += dt * 2;
    }
    for (const [id, m] of this.meshes) {
      if (id.startsWith('drop') && !liveDrops.has(id)) {
        this.scene.remove(m);
        this.meshes.delete(id);
      }
    }
    for (const pad of state.pads) {
      const m = this.meshes.get(pad.id)!;
      m.visible = padAvailable(state, pad);
      const f = Math.max(pad.paid / pad.cost, 0.001);
      m.getObjectByName('progress')!.scale.set(f, 1, f);
    }
    for (const st of state.stations) {
      const pile = this.ensure(`cash-${st.id}`, () => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 1, 1.0),
          new THREE.MeshLambertMaterial({ color: COLORS.cash }),
        );
        return mesh;
      });
      pile.visible = st.matCash > 0;
      const h = Math.min(0.15 + st.matCash * 0.015, 1.6);
      pile.scale.y = h;
      pile.position.set(st.matPos.x, h / 2, st.matPos.z);
    }
    for (const turret of state.turrets) {
      this.meshes.get(turret.id)!.visible = turret.active;
      this.syncOutputPile(`out-${turret.id}`, turret.pos.x + 1.2, turret.pos.z + 1.2, turret.output, COLORS.meat);
    }
    for (const mill of state.sawmills) {
      const m = this.meshes.get(mill.id)!;
      m.visible = mill.active;
      if (mill.active) m.getObjectByName('blade')!.rotation.x += dt * 6;
      this.syncOutputPile(`out-${mill.id}`, mill.pos.x + 1.4, mill.pos.z + 1.2, mill.output, COLORS.wood);
    }
    for (const rail of state.rails) {
      const machineOn =
        state.turrets.find((t) => t.id === rail.sourceId)?.active ??
        state.sawmills.find((s) => s.id === rail.sourceId)?.active ?? false;
      this.meshes.get(rail.id)!.visible = machineOn;
    }
    for (const cart of state.carts) {
      const rail = state.rails.find((r) => r.id === cart.railId)!;
      const machineOn =
        state.turrets.find((t) => t.id === rail.sourceId)?.active ??
        state.sawmills.find((s) => s.id === rail.sourceId)?.active ?? false;
      const m = this.ensure(cart.id, makeCart);
      m.visible = machineOn;
      const pos = cartPos(state, cart);
      m.position.set(pos.x, 0, pos.z);
      const load = m.getObjectByName('load')!;
      load.visible = cart.load > 0;
      load.scale.y = Math.max(cart.load / cart.cap, 0.2);
    }
    this.syncOutputPile('depot-wood', state.depotPos.x - 1.4, state.depotPos.z - 1.4, state.depot.wood, COLORS.wood);
    this.syncOutputPile('depot-meat', state.depotPos.x, state.depotPos.z - 1.4, state.depot.meat, COLORS.meat);
    this.syncOutputPile('depot-gold', state.depotPos.x + 1.4, state.depotPos.z - 1.4, state.depot.gold, COLORS.gold);
    for (let i = 0; i < state.villagers.length; i++) {
      const vil = state.villagers[i];
      const m = this.ensure(vil.id, makeVillager);
      const bob = vil.state === 'frozen' ? 0 : Math.abs(Math.sin(this.t * 8 + i)) * 0.08;
      m.position.set(vil.pos.x, bob, vil.pos.z);
      m.getObjectByName('ice')!.visible = vil.state === 'frozen';
      m.getObjectByName('load')!.visible = vil.carrying !== null;
    }
    for (const [zone, wall] of this.gates) wall.visible = !state.zonesOpen[zone];
    const p = state.player.pos;
    this.target.lerp(new THREE.Vector3(p.x, 0, p.z), 1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.target).add(CAM_OFFSET);
    this.camera.lookAt(this.target);
  }

  private syncOutputPile(id: string, x: number, z: number, count: number, color: number): void {
    const m = this.ensure(id, () => new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1, 1.0), new THREE.MeshLambertMaterial({ color }),
    ));
    m.visible = count > 0;
    const h = Math.min(0.15 + count * 0.05, 2.0);
    m.scale.y = h;
    m.position.set(x, h / 2, z);
  }

  private syncPlayer(state: GameState): void {
    const p = state.player;
    const m = this.ensure('player', makePlayer) as THREE.Group;
    m.position.set(p.pos.x, 0, p.pos.z);
    const toolMount = m.getObjectByName('toolMount')!;
    const toolKey = `${p.tool}|${p.hasPickaxe}`;
    if (toolKey !== this.lastToolKey) {
      this.lastToolKey = toolKey;
      toolMount.clear();
      toolMount.add(makeTool(p.tool));
      if (p.hasPickaxe) {
        const pick = makeTool('pickaxe');
        pick.position.set(-0.9, 0, -0.5);
        pick.rotation.z = 0.5;
        toolMount.add(pick);
      }
    }
    const period = TOOLS[p.tool].period;
    const swingFrac = Math.max(p.swingTimer, 0) / period;
    if (p.tool === 'scythe') {
      m.rotation.y = Math.atan2(p.facing.x, p.facing.z) + swingFrac * Math.PI * 2;
    } else {
      m.rotation.y = Math.atan2(p.facing.x, p.facing.z);
      toolMount.rotation.x = Math.sin(swingFrac * Math.PI) * 1.3;
    }
    const carryKey = `${p.carry.wood}|${p.carry.meat}|${p.carry.gold}`;
    if (carryKey !== this.lastCarryKey) {
      this.lastCarryKey = carryKey;
      const carry = m.getObjectByName('carry') as THREE.Group;
      carry.clear();
      let y = 0;
      const add = (count: number, color: number) => {
        for (let i = 0; i < Math.ceil(count / 2); i++) {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.2, 0.4), new THREE.MeshLambertMaterial({ color }),
          );
          box.position.y = y;
          y += 0.22;
          carry.add(box);
        }
      };
      add(p.carry.wood, COLORS.wood);
      add(p.carry.meat, COLORS.meat);
      add(p.carry.gold, COLORS.gold);
    }
  }

  applyEvents(events: GameEvent[]): void {
    for (const e of events) {
      let text: string | null = null;
      if (e.type === 'sell') text = `+💵${e.cash}`;
      else if (e.type === 'unlock') text = 'Unlocked!';
      else if (e.type === 'thaw') text = '+1 rescued';
      if (text && 'pos' in e) {
        const sprite = makeLabel(text);
        sprite.scale.set(2.6, 1.3, 1);
        sprite.position.set(e.pos.x, 2.5, e.pos.z);
        this.scene.add(sprite);
        this.floats.push({ sprite, life: 1 });
      }
    }
  }

  render(dt: number): void {
    for (const f of [...this.floats]) {
      f.life -= dt;
      f.sprite.position.y += 1.5 * dt;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(f.life, 0);
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        this.floats.splice(this.floats.indexOf(f), 1);
      }
    }
    const pos = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 2;
      if (y < 0) y = 25;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.webgl.render(this.scene, this.camera);
  }
}
```

- [ ] **Step 3: Replace `src/main.ts` with the playable bootstrap**

```ts
import { createInitialState } from './game/init';
import { createInput, intentFrom } from './game/input';
import { update } from './game/update';
import { Renderer } from './render/renderer';

const container = document.getElementById('app')!;
const state = createInitialState();
const input = createInput(container);
const renderer = new Renderer(container);
renderer.buildStatic(state);

const FIXED = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dtReal;
  while (acc >= FIXED) {
    update(state, intentFrom(input), FIXED);
    acc -= FIXED;
  }
  renderer.applyEvents(state.events.splice(0));
  renderer.sync(state, dtReal);
  renderer.render(dtReal);
}
requestAnimationFrame(frame);
```

- [ ] **Step 4: Typecheck and run the logic suite**

Run: `npx tsc --noEmit && npm test`
Expected: both pass.

- [ ] **Step 5: Manual browser verification**

Run: `npm run dev` and open the printed URL (or drive it with the browser preview tools).
Check each item:

- World renders: snowy ground, brown road band, blue pine forest to the north, red gate walls east and west, benches with 🪵/🥩/🪙 labels on the road, gray pads with cost labels, falling snow.
- WASD/arrows move the character; W goes up-screen. Click-dragging steers too.
- Walking next to a tree swings the tool; after ~3 swings the tree becomes a stump and two logs pop out, get vacuumed up, and appear stacked on the character's back.
- Standing by the 🪵 bench streams logs away and a green cash pile grows on the mat; stepping on the mat collects it.
- Standing on the axe pad drains cash into a growing green disc; at 10 it pops, the tool changes, and "Unlocked!" floats up.
- Poking a bear wakes it; it chases and knocks the player back; killing it yields meat; its health bar shows while hurt.
- The east gate wall blocks movement; after buying the wood gate pad the wall disappears and the deep forest is reachable.
- Buying the turret pad makes the turret, its rail and cart appear; the turret kills nearby bears, meat piles up beside it, and the cart shuttles it to the depot.
- Buying the sawmill pad shows a spinning blade felling trees; wood rides the cart to the depot.
- Carrying enough meat near a frozen villager shatters the ice (visually: ice disappears), "+1 rescued" floats, and the villager walks to camp and starts hauling depot goods to benches.
- Camera follows smoothly; no console errors; frame rate feels smooth.

Fix anything broken before committing (rendering-only fixes belong in `src/render/`).

- [ ] **Step 6: Commit**

```bash
git add src/render/meshes.ts src/render/renderer.ts src/main.ts
git commit -m "feat: three.js renderer with procedural low-poly world and playable bootstrap"
```

---

### Task 16: HUD, pause menu and win screen

**Files:**
- Create: `src/ui/ui.ts`
- Modify: `src/main.ts` (full replacement shown below)

- [ ] **Step 1: Create `src/ui/ui.ts`**

```ts
import type { GameState } from '../game/state';

export interface UICallbacks {
  onRestart(): void;
  onResume(): void;
  onToggleMute(): boolean; // returns new muted flag
}

export interface UIHandles {
  showPause(show: boolean): void;
  update(state: GameState): void;
}

const RES_KEYS = ['cash', 'wood', 'meat', 'gold'] as const;
const RES_ICONS: Record<(typeof RES_KEYS)[number], string> = {
  cash: '💵', wood: '🪵', meat: '🥩', gold: '🪙',
};

export function initUI(cb: UICallbacks, initialMuted: boolean): UIHandles {
  const hud = document.createElement('div');
  hud.id = 'hud';
  const rows = new Map<string, { el: HTMLElement; value: HTMLElement; prev: number }>();
  for (const key of RES_KEYS) {
    const row = document.createElement('div');
    row.className = 'res';
    const icon = document.createElement('span');
    icon.textContent = RES_ICONS[key];
    const value = document.createElement('span');
    value.textContent = '0';
    row.append(icon, value);
    hud.appendChild(row);
    rows.set(key, { el: row, value, prev: 0 });
  }
  document.body.appendChild(hud);

  const rescued = document.createElement('div');
  rescued.id = 'rescued';
  document.body.appendChild(rescued);

  const pause = overlay();
  const pausePanel = panel('Paused');
  pausePanel.appendChild(button('Resume', () => cb.onResume()));
  const muteBtn = button(initialMuted ? 'Unmute (M)' : 'Mute (M)', () => {
    muteBtn.textContent = cb.onToggleMute() ? 'Unmute (M)' : 'Mute (M)';
  });
  muteBtn.classList.add('secondary');
  pausePanel.appendChild(muteBtn);
  const restartBtn = button('Restart camp', () => {
    if (window.confirm('Erase your save and start over?')) cb.onRestart();
  });
  restartBtn.classList.add('secondary');
  pausePanel.appendChild(restartBtn);
  pause.appendChild(pausePanel);
  document.body.appendChild(pause);

  const win = overlay();
  const winPanel = panel('🏕️ Camp Complete!');
  const stats = document.createElement('p');
  winPanel.appendChild(stats);
  winPanel.appendChild(button('Keep playing', () => win.classList.add('hidden')));
  win.appendChild(winPanel);
  document.body.appendChild(win);
  let winShown = false;

  function update(state: GameState): void {
    for (const key of RES_KEYS) {
      const row = rows.get(key)!;
      const val = key === 'cash' ? Math.floor(state.player.cash) : state.player.carry[key];
      if (val !== row.prev) {
        row.el.classList.remove('flash-up', 'flash-down');
        void row.el.offsetWidth; // restart the CSS transition
        row.el.classList.add(val > row.prev ? 'flash-up' : 'flash-down');
        setTimeout(() => row.el.classList.remove('flash-up', 'flash-down'), 250);
        row.value.textContent = String(val);
        row.prev = val;
      }
    }
    rescued.textContent = `👤 ${state.rescued}/${state.villagers.length} rescued`;
    if (state.won && !winShown) {
      winShown = true;
      const mins = Math.floor(state.time / 60);
      const secs = Math.floor(state.time % 60);
      stats.textContent =
        `Time ${mins}m ${secs}s · ${state.stats.chops} trees felled · ` +
        `${state.stats.bearsKilled} bears defeated · 💵${Math.floor(state.stats.earned)} earned`;
      win.classList.remove('hidden');
    }
  }

  return {
    showPause: (show: boolean) => pause.classList.toggle('hidden', !show),
    update,
  };
}

function overlay(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'overlay hidden';
  return el;
}

function panel(title: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'panel';
  const h = document.createElement('h1');
  h.textContent = title;
  el.appendChild(h);
  return el;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}
```

- [ ] **Step 2: Replace `src/main.ts` (adds UI + pause; audio still stubbed)**

```ts
import { createInitialState } from './game/init';
import { createInput, intentFrom } from './game/input';
import { update } from './game/update';
import { Renderer } from './render/renderer';
import { initUI } from './ui/ui';

const container = document.getElementById('app')!;
let state = createInitialState();
const input = createInput(container);
const renderer = new Renderer(container);
renderer.buildStatic(state);
let paused = false;

const ui = initUI({
  onResume: () => { paused = false; ui.showPause(false); },
  onRestart: () => {
    state = createInitialState();
    renderer.rebuild(state);
    paused = false;
    ui.showPause(false);
  },
  onToggleMute: () => false, // audio arrives in Task 17
}, false);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    paused = !paused;
    ui.showPause(paused);
  }
});

const FIXED = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused) {
    acc += dtReal;
    while (acc >= FIXED) {
      update(state, intentFrom(input), FIXED);
      acc -= FIXED;
    }
  }
  renderer.applyEvents(state.events.splice(0));
  renderer.sync(state, dtReal);
  renderer.render(dtReal);
  ui.update(state);
}
requestAnimationFrame(frame);
```

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: pass.

- [ ] **Step 4: Manual verification**

With `npm run dev`:
- HUD shows 💵🪵🥩🪙 counters top-right that update and flash green/red on change.
- Bottom-left shows `👤 0/40 rescued` and counts up on thaws.
- Esc pauses (game freezes, overlay shows); Resume works; Restart resets the world after a confirm dialog.
- Cash displays as a whole number even while a pad payment is streaming.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ui.ts src/main.ts
git commit -m "feat: HUD counters, rescued tracker, pause menu and win screen"
```

---

### Task 17: Sound effects

**Files:**
- Create: `src/audio/sfx.ts`
- Modify: `src/main.ts` (full replacement shown below)

- [ ] **Step 1: Create `src/audio/sfx.ts`**

```ts
import type { GameEvent } from '../game/state';

let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem('frostfall-muted') === '1'; } catch { /* ignore */ }

/** Must be called from a user-gesture handler once (browser autoplay policy). */
export function initAudio(): void {
  if (!ctx) ctx = new AudioContext();
}

export function isMuted(): boolean { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem('frostfall-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

function beep(freq: number, dur: number, type: OscillatorType, vol = 0.12, slide = 0, delay = 0): void {
  if (!ctx || muted) return;
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slide !== 0) osc.frequency.linearRampToValueAtTime(freq + slide, at + dur);
  gain.gain.setValueAtTime(vol, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur);
}

export function playFor(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'chop': beep(180, 0.06, 'square', 0.07); break;
      case 'treeFall': beep(140, 0.25, 'triangle', 0.14, -60); break;
      case 'pickup': beep(700, 0.07, 'sine', 0.09, 200); break;
      case 'deposit': beep(500, 0.06, 'sine', 0.07, 100); break;
      case 'sell': beep(880, 0.09, 'sine', 0.11, 120); break;
      case 'unlock':
        beep(523, 0.1, 'sine', 0.14);
        beep(659, 0.1, 'sine', 0.14, 0, 0.09);
        beep(784, 0.16, 'sine', 0.14, 0, 0.18);
        break;
      case 'thaw': beep(660, 0.15, 'triangle', 0.14, 180); break;
      case 'bearHit': beep(140, 0.08, 'sawtooth', 0.09); break;
      case 'playerHit': beep(90, 0.15, 'sawtooth', 0.13, -30); break;
      case 'win':
        beep(523, 0.15, 'sine', 0.18);
        beep(659, 0.15, 'sine', 0.18, 0, 0.13);
        beep(784, 0.15, 'sine', 0.18, 0, 0.26);
        beep(1047, 0.35, 'sine', 0.18, 0, 0.39);
        break;
    }
  }
}
```

- [ ] **Step 2: Replace `src/main.ts` (wires audio in)**

```ts
import { initAudio, isMuted, playFor, toggleMute } from './audio/sfx';
import { createInitialState } from './game/init';
import { createInput, intentFrom } from './game/input';
import { update } from './game/update';
import { Renderer } from './render/renderer';
import { initUI } from './ui/ui';

const container = document.getElementById('app')!;
let state = createInitialState();
const input = createInput(container);
const renderer = new Renderer(container);
renderer.buildStatic(state);
let paused = false;

const ui = initUI({
  onResume: () => { paused = false; ui.showPause(false); },
  onRestart: () => {
    state = createInitialState();
    renderer.rebuild(state);
    paused = false;
    ui.showPause(false);
  },
  onToggleMute: () => toggleMute(),
}, isMuted());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    paused = !paused;
    ui.showPause(paused);
  }
  if (e.key.toLowerCase() === 'm') toggleMute();
});
window.addEventListener('pointerdown', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });

const FIXED = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused) {
    acc += dtReal;
    while (acc >= FIXED) {
      update(state, intentFrom(input), FIXED);
      acc -= FIXED;
    }
  }
  const events = state.events.splice(0);
  renderer.applyEvents(events);
  playFor(events);
  renderer.sync(state, dtReal);
  renderer.render(dtReal);
  ui.update(state);
}
requestAnimationFrame(frame);
```

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: pass.

- [ ] **Step 4: Manual verification**

With `npm run dev` (click the page once first — audio needs a user gesture):
- Chopping ticks, pickups blip, selling chimes, unlocks play a rising arpeggio, bear swipes thud.
- `M` and the pause-menu button both silence everything; the preference survives a reload.

- [ ] **Step 5: Commit**

```bash
git add src/audio/sfx.ts src/main.ts
git commit -m "feat: synthesized sound effects with persistent mute"
```

---

### Task 18: Autosave, load-on-start, production build & full playthrough

**Files:**
- Modify: `src/main.ts` (full final version shown below)

- [ ] **Step 1: Replace `src/main.ts` (final version — adds save/load/restart-clear)**

```ts
import { initAudio, isMuted, playFor, toggleMute } from './audio/sfx';
import { createInitialState } from './game/init';
import { createInput, intentFrom } from './game/input';
import { clearSave, loadGame, saveGame } from './game/save';
import { update } from './game/update';
import { Renderer } from './render/renderer';
import { initUI } from './ui/ui';

const container = document.getElementById('app')!;
let state = loadGame() ?? createInitialState();
const input = createInput(container);
const renderer = new Renderer(container);
renderer.buildStatic(state);
let paused = false;

const ui = initUI({
  onResume: () => { paused = false; ui.showPause(false); },
  onRestart: () => {
    clearSave();
    state = createInitialState();
    renderer.rebuild(state);
    paused = false;
    ui.showPause(false);
  },
  onToggleMute: () => toggleMute(),
}, isMuted());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    paused = !paused;
    ui.showPause(paused);
  }
  if (e.key.toLowerCase() === 'm') toggleMute();
});
window.addEventListener('pointerdown', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });
window.addEventListener('beforeunload', () => saveGame(state));

const FIXED = 1 / 60;
let acc = 0;
let last = performance.now();
let saveTimer = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused) {
    acc += dtReal;
    while (acc >= FIXED) {
      update(state, intentFrom(input), FIXED);
      acc -= FIXED;
    }
    saveTimer += dtReal;
    if (saveTimer >= 5) {
      saveTimer = 0;
      saveGame(state);
    }
  }
  const events = state.events.splice(0);
  renderer.applyEvents(events);
  playFor(events);
  renderer.sync(state, dtReal);
  renderer.render(dtReal);
  ui.update(state);
}
requestAnimationFrame(frame);
```

- [ ] **Step 2: Typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: pass.

- [ ] **Step 3: Verify save/load in the browser**

With `npm run dev`:
- Earn some cash, buy the axe, reload the page → cash, tool and pad state persist; the axe pad stays gone.
- Pause → Restart camp → confirm → world resets fresh; reload again → still fresh (save cleared).
- Thaw a villager, reload → rescued count persists and the villager is a hauler at camp.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: clean build into `dist/`.

Run: `npm run preview` and open the printed URL.
Expected: the built game plays identically to dev.

- [ ] **Step 5: Full playthrough checklist**

Play from a fresh save (Restart first). Verify the whole arc:

1. Chop starter trees → sell wood → buy axe (10) → carry1 (30) / speed1 (40) become available.
2. Bank 15 wood → open the deep-forest gate → buy turret1 (25) and sawmill1 (30); watch meat and wood arrive at the depot by cart.
3. Buy scythe (40) → spin attack works → hunt bears for meat.
4. Open hunting grounds (20 meat) → buy turret2 (50).
5. Open quarry (60) → buy pickaxe (30) → mine gold → gold sells at 10 → buy carry2 (8 gold) and speed2 (10 gold).
6. Thaw villagers steadily (cost climbs 2→6); haulers keep the economy moving on their own.
7. Complete all 13 pads and all 40 villagers → "Camp Complete!" shows correct stats → Keep playing works.
8. Performance stays smooth (~60 fps) with everything unlocked; no console errors over a 5-minute session.

Note anything that feels off (tuning lives in `src/content/balance.ts` — adjust and note changes in the commit).

- [ ] **Step 6: Final commit and tag**

```bash
git add -A
git commit -m "feat: autosave, load on start and production build verified"
git tag phase1-complete
```

---

## Plan Self-Review Notes

- **Spec coverage:** every Phase 1 spec section maps to a task — world/controls (5, 15), harvesting/combat (6, 7), carry (8), stations (9), pads/gates/tools (10), machines (11), carts/depot (12), villagers (13), win/save (14), rendering/art/camera/snow (15), HUD/pause/win screen (16), audio/mute (17), autosave/build (18). Non-goals are excluded.
- **Known simplifications (intentional, spec-compatible):** thawed-mid-walk villagers restore as haulers at the depot after load; the win overlay reappears when loading an already-won save; cash may be fractional internally (HUD floors it).
- **Type consistency:** all system code uses the exact types from Task 3; helpers in `tests/helpers.ts` are the single source for test fixtures.
