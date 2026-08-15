import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/init';
import { PAD_RANGE, SELL_RATE, TREE_YIELD, thawCost } from '../src/content/balance';
import type { ZoneId } from '../src/game/state';
import { ZONE_RECTS } from '../src/content/map';
import { dist, inRect } from '../src/game/math';

describe('createInitialState', () => {
  const state = createInitialState();

  it('spawns the expected entity populations', () => {
    expect(state.trees.length).toBeGreaterThanOrEqual(250); // finite forest: no respawns
    expect(state.pads.length).toBe(18);
    expect(state.bears.length).toBeGreaterThanOrEqual(15);
    expect(state.seams.length).toBe(6);
    expect(state.villagers.filter((v) => v.kind === 'rescued').length).toBe(40);
    expect(state.villagers.filter((v) => v.kind === 'crew').length).toBe(3);
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
