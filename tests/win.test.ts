import { describe, expect, it } from 'vitest';
import { winTick } from '../src/game/systems/win';
import { update } from '../src/game/update';
import { v } from '../src/game/math';
import { aCrew, aPad, aVillager, blankState } from './helpers';

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

  it('ignores the fort crew when checking the snowfield is empty', () => {
    const state = blankState();
    state.pads.push(aPad({ done: true }));
    state.villagers.push(aCrew(), aVillager({ id: 'v1', state: 'frozen' }));
    winTick(state);
    expect(state.won).toBe(false); // the crew must not stand in for the last frozen villager

    state.villagers[1].state = 'hauler';
    winTick(state);
    expect(state.won).toBe(true); // nor block the win once the snowfield is clear
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
