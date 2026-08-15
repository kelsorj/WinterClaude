import { describe, expect, it } from 'vitest';
import { harvestTick, killBear } from '../src/game/systems/harvest';
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

  it('leaves felled trees as permanent stumps', () => {
    const state = blankState();
    state.trees.push(aTree()); // in range, hp 3
    ticks(state, 2.0);
    expect(state.trees[0].respawn).toBeGreaterThan(0);
    ticks(state, 35); // well past any old respawn window
    expect(state.trees[0].hp).toBeLessThanOrEqual(0);
    expect(state.trees[0].respawn).toBeGreaterThan(0);
    expect(state.drops.filter((d) => d.kind === 'wood')).toHaveLength(2); // felled exactly once
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
    expect(state.drops.filter((d) => d.kind === 'meat')).toHaveLength(4); // BEAR_MEAT
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

  it('killBear routes meat to a turret output when killed by a turret', () => {
    const state = blankState();
    const turret = { id: 'turret1', pos: v(0, 0), range: 10, cd: 0, active: true, output: 0 };
    state.turrets.push(turret);
    const bear = aBear();
    state.bears.push(bear);
    killBear(state, bear, { kind: 'turret', turret });
    expect(turret.output).toBe(4); // BEAR_MEAT
    expect(state.drops).toHaveLength(0);
    expect(bear.state).toBe('dead');
  });

  it('seams respawn after their timer', () => {
    const state = blankState();
    state.seams.push(aSeam({ pos: v(50, 0), hp: 0, respawn: 0.5 }));
    ticks(state, 1);
    expect(state.seams[0].respawn).toBe(0);
    expect(state.seams[0].hp).toBe(4);
  });

  it('stops chopping trees when carry is full', () => {
    const state = blankState();
    state.player.carry.wood = 12; // cap
    state.trees.push(aTree());
    ticks(state, 2);
    expect(state.drops).toHaveLength(0);
    expect(state.trees[0].hp).toBe(3);
  });
});
