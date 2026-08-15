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
    expect(restored.villagers.filter((v) => v.kind === 'rescued' && v.state !== 'frozen'))
      .toHaveLength(2);
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

  it('round-trips bench stock, defaulting pre-stock saves to an empty shelf', () => {
    const state = createInitialState();
    state.stations[0].stock = 17;
    const restored = deserialize(serialize(state));
    expect(restored.stations[0].stock).toBe(17);

    const legacy = JSON.parse(serialize(state)) as Record<string, unknown>;
    delete legacy.stock;
    expect(deserialize(JSON.stringify(legacy)).stations[0].stock).toBe(0);
  });

  it('derives the fort crew from the distributor pad and keeps them out of the rescue count', () => {
    const fresh = deserialize(serialize(createInitialState()));
    expect(fresh.distributorActive).toBe(false);
    expect(fresh.rescued).toBe(0);
    expect(fresh.villagers.filter((v) => v.kind === 'crew')).toHaveLength(3);

    const state = createInitialState();
    const pad = state.pads.find((p) => p.effect.type === 'distributor')!;
    pad.done = true; pad.paid = pad.cost;
    state.villagers[0].state = 'hauler';
    state.rescued = 1;
    const restored = deserialize(serialize(state));
    expect(restored.distributorActive).toBe(true);
    expect(restored.rescued).toBe(1); // the three crew are not rescues
    expect(restored.villagers.filter((v) => v.kind === 'crew').every((v) => v.state === 'hauler'))
      .toBe(true);
  });

  it('folds hauler cargo back into the depot instead of evaporating it', () => {
    const state = createInitialState();
    state.depot.wood = 4;
    state.depot.meat = 1;
    const hauler = state.villagers.find((v) => v.kind === 'rescued')!;
    hauler.state = 'hauler'; hauler.carrying = 'wood'; hauler.amount = 3;
    const crew = state.villagers.find((v) => v.kind === 'crew')!;
    crew.carrying = 'meat'; crew.amount = 2;
    const goods = (s: typeof state): number => s.depot.wood + s.depot.meat + s.depot.gold
      + s.villagers.reduce((n, v) => n + (v.carrying ? v.amount : 0), 0);

    const json = serialize(state);
    const restored = deserialize(json);

    // Haulers restore empty-handed at the depot, so their cargo has to land in the depot.
    expect(goods(restored)).toBe(goods(state));
    expect(restored.depot.wood).toBe(7);
    expect(restored.depot.meat).toBe(3);
    expect(restored.villagers.every((v) => v.carrying === null)).toBe(true);
    // Saving must not move the running game's goods around.
    expect(state.depot.wood).toBe(4);
    expect(hauler.amount).toBe(3);
  });

  it('keeps customer numbering above a game that is already running', () => {
    const json = serialize(createInitialState());
    const live = createInitialState();
    live.nextCustomerId = 57;
    // Customers are transient, so ids would otherwise restart at 1 and collide with the
    // shoppers the renderer still has meshes for.
    expect(deserialize(json, live).nextCustomerId).toBe(57);
    expect(deserialize(json).nextCustomerId).toBe(1);
  });

  it('does not save customers — they are transient', () => {
    const state = createInitialState();
    state.stations[0].stock = 5;
    state.customers.push({
      id: 'cust1', stationId: 'st-wood', pos: { x: 0, z: 0 },
      state: 'queued', slot: 0, path: [], timer: 0, bought: 0,
    });
    const json = serialize(state);
    expect(json).not.toContain('cust1');
    expect(deserialize(json).customers).toEqual([]);
  });

  it('keeps felled trees felled and standing trees standing', () => {
    const state = createInitialState();
    const cut = [state.trees[0], state.trees[5], state.trees[200]];
    for (const tree of cut) { tree.respawn = 1; tree.hp = 0; }

    const restored = deserialize(serialize(state));

    const felled = restored.trees.filter((t) => t.respawn > 0);
    expect(felled.map((t) => t.id).sort()).toEqual(cut.map((t) => t.id).sort());
    expect(felled.every((t) => t.hp === 0)).toBe(true);
    expect(restored.trees.length - felled.length).toBe(state.trees.length - cut.length);
  });

  it('loads pre-forest saves with a full forest', () => {
    const state = createInitialState();
    state.trees[0].respawn = 1;
    const legacy = JSON.parse(serialize(state)) as Record<string, unknown>;
    delete legacy.felledTrees;

    const restored = deserialize(JSON.stringify(legacy));

    expect(restored.trees.every((t) => t.respawn === 0)).toBe(true);
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
