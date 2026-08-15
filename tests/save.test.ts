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

  it('derives the camp tier from completed camp pads', () => {
    const state = createInitialState();
    for (const pad of state.pads) {
      if (['p-camp1', 'p-camp2'].includes(pad.id)) { pad.done = true; pad.paid = pad.cost; }
    }
    state.campTier = 2;
    const restored = deserialize(serialize(state));
    expect(restored.campTier).toBe(2);
    expect(deserialize(serialize(createInitialState())).campTier).toBe(0);
  });

  it('preserves the won flag', () => {
    const state = createInitialState();
    state.won = true;
    expect(deserialize(serialize(state)).won).toBe(true);
  });

  it('preserves partial pad payments and uncollected mat cash', () => {
    const state = createInitialState();
    const pad = state.pads.find((p) => p.id === 'p-scythe')!;
    pad.paid = 33;
    state.stations[0].matCash = 44;
    const restored = deserialize(serialize(state));
    expect(restored.pads.find((p) => p.id === 'p-scythe')?.paid).toBe(33);
    expect(restored.stations[0].matCash).toBe(44);
  });

  it('drops in-transit cart cargo on reload (accepted loss)', () => {
    const state = createInitialState();
    state.carts[0].load = 5;
    state.carts[0].s = 10;
    const restored = deserialize(serialize(state));
    expect(restored.carts[0].load).toBe(0);
    expect(restored.carts[0].s).toBe(0);
  });

  it('rejects malformed saves', () => {
    expect(() => deserialize('{"depot": null, "stats": null}')).toThrow();
  });
});
