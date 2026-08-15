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
    ticks(state, 35); // the stump is permanent, so the mill idles instead of re-felling it
    expect(state.trees[0].respawn).toBeGreaterThan(0);
    expect(state.sawmills[0].output).toBe(2);
  });

  it('does nothing when no standing tree is in radius', () => {
    const state = blankState();
    state.sawmills.push(sawmill());
    state.trees.push(aTree({ pos: v(30, 0) }));
    ticks(state, 5);
    expect(state.sawmills[0].output).toBe(0);
  });
});
