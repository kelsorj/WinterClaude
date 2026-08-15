import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/init';
import { thawCost } from '../src/content/balance';
import type { ZoneId } from '../src/game/state';

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
});
