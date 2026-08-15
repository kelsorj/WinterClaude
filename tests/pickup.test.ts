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

  it('takes only what fits when several drops compete in one tick', () => {
    const state = blankState();
    state.player.carry.wood = 11; // one slot left
    state.drops.push(drop('d1', 'meat'), drop('d2', 'gold', v(0.4, 0)));
    pickupTick(state, 1 / 60);
    expect(carryTotal(state)).toBe(12);
    expect(state.drops).toHaveLength(1);
  });
});
