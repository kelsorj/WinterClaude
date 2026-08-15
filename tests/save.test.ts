import { describe, expect, it } from 'vitest';
import { EXPANSIONS_MAX } from '../src/content/balance';
import { createInitialState } from '../src/game/init';
import { deserialize, serialize } from '../src/game/save';
import { applyExpansion, expeditionCost } from '../src/game/systems/expansion';
import { FELLED } from '../src/game/systems/harvest';

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
    state.depot.meat = 9;
    state.turrets[0].output = 5;
    state.stats = { chops: 10, bearsKilled: 3, earned: 200 };
    state.time = 321;

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

  it('loads a pre-5A save that had already been won, ignoring the flag', () => {
    const state = createInitialState();
    state.depot.gold = 3;
    const legacy = JSON.parse(serialize(state)) as Record<string, unknown>;
    legacy.won = true; // what a finished camp carried before the ending was removed

    const restored = deserialize(JSON.stringify(legacy));

    expect('won' in restored).toBe(false);
    expect(restored.depot.gold).toBe(3); // and the rest of the save comes through untouched
  });

  it('writes no won flag of its own', () => {
    expect(serialize(createInitialState())).not.toContain('won');
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

  it('derives the fort crew from the distributor pad', () => {
    const fresh = deserialize(serialize(createInitialState()));
    expect(fresh.distributorActive).toBe(false);
    expect(fresh.villagers.filter((v) => v.kind === 'crew')).toHaveLength(5);

    const state = createInitialState();
    const pad = state.pads.find((p) => p.effect.type === 'distributor')!;
    pad.done = true; pad.paid = pad.cost;
    const restored = deserialize(serialize(state));
    expect(restored.distributorActive).toBe(true);
    // Villagers are entirely derived: nothing about them is written to the save.
    expect(serialize(state)).not.toContain('crew0');
  });

  it('loads a pre-4C save with a snowfield in it, ignoring the field', () => {
    const state = createInitialState();
    state.depot.wood = 7;
    const legacy = JSON.parse(serialize(state)) as Record<string, unknown>;
    // Exactly what a save written before Amendment 4C carried: forty thawed villager ids.
    legacy.thawed = Array.from({ length: 40 }, (_, i) => `vil${i}`);

    const restored = deserialize(JSON.stringify(legacy));

    expect(restored.villagers.map((v) => v.kind).sort())
      .toEqual(['crew', 'crew', 'crew', 'crew', 'crew', 'miner', 'miner']);
    expect(restored.villagers.some((v) => v.id.startsWith('vil'))).toBe(false);
    expect(restored.depot.wood).toBe(7); // and the rest of the save comes through untouched
    expect('rescued' in restored).toBe(false);
  });

  it('writes no rescue field of its own', () => {
    const json = serialize(createInitialState());
    expect(json).not.toContain('thawed');
    expect(json).not.toContain('rescued');
  });

  it('folds carrier cargo back into the depot instead of evaporating it', () => {
    const state = createInitialState();
    state.depot.wood = 4;
    state.depot.meat = 1;
    const hauler = state.villagers.find((v) => v.kind === 'crew')!;
    hauler.carrying = 'wood'; hauler.amount = 3;
    const miner = state.villagers.find((v) => v.kind === 'miner')!;
    miner.carrying = 'meat'; miner.amount = 2;
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

  it('restores the miners from the camp tier without a save field of their own', () => {
    const state = createInitialState();
    const camp4 = state.pads.find((p) => p.effect.type === 'camp' && p.effect.tier === 4)!;
    camp4.done = true; camp4.paid = camp4.cost;
    state.campTier = 4;
    const miner = state.villagers.find((v) => v.kind === 'miner')!;
    miner.target = 'seam3'; // mid-cycle claims are transient, like a carrier's cargo route

    const restored = deserialize(serialize(state));

    expect(restored.campTier).toBe(4);
    const miners = restored.villagers.filter((v) => v.kind === 'miner');
    expect(miners).toHaveLength(2);
    expect(miners.every((v) => v.target === null)).toBe(true);
    expect(serialize(state)).not.toContain('miner0');
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

  it('replays expedition rings from the count, felled ring trees included', () => {
    const state = createInitialState();
    const pad = state.pads.find((p) => p.effect.type === 'expedition')!;
    applyExpansion(state, 1);
    applyExpansion(state, 2);
    state.expansions = 2;
    pad.cost = expeditionCost(2);
    pad.paid = 40; // part-paid toward the third expedition
    const ringTree = state.trees.find((t) => t.id === 'ring2-tree7')!;
    ringTree.respawn = 1; ringTree.hp = 0;
    const starterTree = state.trees[0];
    starterTree.respawn = 1; starterTree.hp = 0;

    const restored = deserialize(serialize(state));

    expect(restored.expansions).toBe(2);
    expect(restored.trees.length).toBe(state.trees.length);
    expect(restored.bears.length).toBe(state.bears.length);
    expect(restored.seams.length).toBe(state.seams.length);
    // The ring came back in the same places under the same ids, which is what lets a felled
    // ring tree stay felled — and only the two that were cut are down.
    expect(restored.trees.map((t) => t.id)).toEqual(state.trees.map((t) => t.id));
    expect(restored.trees.find((t) => t.id === 'ring2-tree7')?.respawn).toBe(FELLED);
    expect(restored.trees.filter((t) => t.respawn > 0).map((t) => t.id).sort())
      .toEqual([starterTree.id, 'ring2-tree7'].sort());

    const restoredPad = restored.pads.find((p) => p.effect.type === 'expedition')!;
    expect(restoredPad.cost).toBe(512); // priced for the third ring, not re-armed at 200
    expect(restoredPad.paid).toBe(40);
    expect(restoredPad.done).toBe(false);
  });

  it('loads a pre-5B save as an unexpanded world', () => {
    const state = createInitialState();
    const legacy = JSON.parse(serialize(state)) as Record<string, unknown>;
    delete legacy.expansions;

    const restored = deserialize(JSON.stringify(legacy));

    expect(restored.expansions).toBe(0);
    expect(restored.trees.length).toBe(state.trees.length);
    expect(restored.pads.find((p) => p.effect.type === 'expedition')?.cost).toBe(200);
  });

  it('clamps a corrupt expansion count instead of hanging the load', () => {
    // Loading replays applyExpansion once per ring, so an absurd count would sit there
    // generating millions of trees. Nothing reachable by play comes near the ceiling.
    const state = createInitialState();
    const broken = JSON.parse(serialize(state)) as Record<string, unknown>;
    broken.expansions = 1e6;

    const restored = deserialize(JSON.stringify(broken));

    expect(restored.expansions).toBe(EXPANSIONS_MAX);
  });

  it('shrugs off a negative or fractional expansion count', () => {
    const state = createInitialState();
    const broken = JSON.parse(serialize(state)) as Record<string, unknown>;
    broken.expansions = -7;
    expect(deserialize(JSON.stringify(broken)).expansions).toBe(0);
    broken.expansions = 2.8;
    expect(deserialize(JSON.stringify(broken)).expansions).toBe(2);
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
