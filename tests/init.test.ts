import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/init';
import { MINER_CAMP_TIER, PAD_RANGE, SELL_RATE, TREE_YIELD, thawCost } from '../src/content/balance';
import type { ZoneId } from '../src/game/state';
import { ORIGINAL_MAP, WORLD_BOUNDS, ZONE_RECTS, villagerDefs } from '../src/content/map';
import { dist, inRect } from '../src/game/math';

describe('createInitialState', () => {
  const state = createInitialState();

  it('spawns the expected entity populations', () => {
    // The 10× world (Amendment 3B): a wilderness ring on top of the original map's stands.
    expect(state.trees.length).toBeGreaterThanOrEqual(2400); // finite forest: no respawns
    expect(state.trees.length).toBeLessThanOrEqual(3500);    // and an instanced-draw budget
    expect(state.pads.length).toBe(18);
    expect(state.bears.length).toBeGreaterThanOrEqual(55);
    expect(state.seams.length).toBeGreaterThanOrEqual(18);
    expect(state.villagers.filter((v) => v.kind === 'rescued').length).toBe(40);
    expect(state.villagers.filter((v) => v.kind === 'crew').length).toBe(3);
    expect(state.villagers.filter((v) => v.kind === 'miner').length).toBe(2);
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

  it('starts the fort crew idle inside the camp, never frozen', () => {
    const crew = state.villagers.filter((v) => v.kind === 'crew');
    expect(state.distributorActive).toBe(false);
    for (const c of crew) {
      expect(c.state).toBe('hauler');
      expect(dist(c.pos, state.depotPos)).toBeLessThan(4);
    }
    // Exactly one pad hires them, and it hangs off the Fort.
    const pads = state.pads.filter((p) => p.effect.type === 'distributor');
    expect(pads).toHaveLength(1);
    expect(pads[0].requires).toBe('p-camp3');
    expect(pads[0].currency).toBe('cash');
  });

  it('starts the miners idle inside the camp, waiting on the Grand Fort', () => {
    const miners = state.villagers.filter((v) => v.kind === 'miner');
    expect(state.campTier).toBeLessThan(MINER_CAMP_TIER);
    for (const m of miners) {
      expect(m.state).toBe('hauler');
      expect(m.target).toBeNull();
      expect(dist(m.pos, state.depotPos)).toBeLessThan(4);
    }
    // No pad of their own: the Grand Fort itself is what puts them to work.
    const camp4 = state.pads.filter((p) => p.effect.type === 'camp' && p.effect.tier === 4);
    expect(camp4).toHaveLength(1);
  });

  it('camp pads cover tiers 1-4 exactly once each', () => {
    const tiers = state.pads
      .map((p) => (p.effect.type === 'camp' ? p.effect.tier : null))
      .filter((x): x is number => x !== null);
    expect(tiers.sort()).toEqual([1, 2, 3, 4]);
    expect(state.campTier).toBe(0);
  });

  it('the whole forest yields more wood than the campaign can possibly need', () => {
    // Worst case: every cash pad is funded by selling wood too, since wood is the only income
    // available before the first gate. Nothing regrows, so the standing forest is the entire
    // budget for the run.
    const woodPadCosts = state.pads.filter((p) => p.currency === 'wood')
      .reduce((sum, p) => sum + p.cost, 0);
    const cashPadCosts = state.pads.filter((p) => p.currency === 'cash')
      .reduce((sum, p) => sum + p.cost, 0);
    const worstCaseWood = woodPadCosts + cashPadCosts / SELL_RATE.wood;
    expect(state.trees.length * TREE_YIELD).toBeGreaterThan(worstCaseWood * 1.5);
  });

  it('gate pads cover every closed zone', () => {
    const gateZones = state.pads
      .map((p) => (p.effect.type === 'gate' ? p.effect.zone : null))
      .filter((x): x is ZoneId => x !== null);
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

  it('pad requires graph is acyclic and every pad is reachable', () => {
    const done = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const pad of state.pads) {
        if (!done.has(pad.id) && (!pad.requires || done.has(pad.requires))) {
          done.add(pad.id);
          progress = true;
        }
      }
    }
    expect(done.size).toBe(state.pads.length);
  });

  it('gated-zone entities sit inside their declared rect', () => {
    for (const e of [...state.trees, ...state.seams, ...state.bears]) {
      if (e.zone === 'start') continue;
      expect(inRect(e.pos, ZONE_RECTS[e.zone])).toBe(true);
    }
  });

  it('start-zone entities are outside all gated rects', () => {
    for (const e of [...state.trees, ...state.seams, ...state.bears]) {
      if (e.zone !== 'start') continue;
      for (const rect of Object.values(ZONE_RECTS)) expect(inRect(e.pos, rect)).toBe(false);
    }
  });

  it('keeps the wilderness inside the world, off the road and out of the villager field', () => {
    const scenery = [...state.trees, ...state.bears, ...state.seams];
    for (const e of scenery) expect(inRect(e.pos, WORLD_BOUNDS)).toBe(true);

    const wilderness = scenery.filter((e) => !inRect(e.pos, ORIGINAL_MAP));
    expect(wilderness.length).toBeGreaterThan(2000);
    for (const e of wilderness) {
      expect(Math.abs(e.pos.z)).toBeGreaterThan(9); // clear of the road the shoppers walk
      expect(e.zone).toBe('start');                 // open country: no gate stands between
    }

    // Nothing may land in the snowfield the frozen villagers are laid out in.
    const field = villagerDefs();
    const bound = {
      x0: Math.min(...field.map((p) => p.x)) - 3, x1: Math.max(...field.map((p) => p.x)) + 3,
      z0: Math.min(...field.map((p) => p.z)) - 3, z1: Math.max(...field.map((p) => p.z)) + 3,
    };
    for (const e of scenery) expect(inRect(e.pos, bound)).toBe(false);
  });

  it('puts gold outcrops out in the open, not only behind the quarry gate', () => {
    const open = state.seams.filter((s) => s.zone === 'start');
    expect(open.length).toBeGreaterThanOrEqual(12);
    // They need the pickaxe, not a gate — so none of them may sit inside a gated rect.
    for (const seam of open)
      for (const rect of Object.values(ZONE_RECTS)) expect(inRect(seam.pos, rect)).toBe(false);
    expect(state.seams.filter((s) => s.zone === 'quarry')).toHaveLength(6);
  });

  it('gate pads sit outside the zone they open', () => {
    for (const pad of state.pads) {
      if (pad.effect.type !== 'gate') continue;
      expect(inRect(pad.pos, ZONE_RECTS[pad.effect.zone as keyof typeof ZONE_RECTS])).toBe(false);
    }
  });

  it('every pad has a positive cost', () => {
    for (const pad of state.pads) expect(pad.cost).toBeGreaterThan(0);
  });

  it('pads are spaced more than two pad-ranges apart', () => {
    for (const a of state.pads)
      for (const b of state.pads)
        if (a.id < b.id) expect(dist(a.pos, b.pos)).toBeGreaterThan(PAD_RANGE * 2);
  });
});
