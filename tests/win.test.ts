import { describe, expect, it } from 'vitest';
import { winTick } from '../src/game/systems/win';
import { update } from '../src/game/update';
import { v } from '../src/game/math';
import { createInitialState } from '../src/game/init';
import { aCrew, aMiner, aPad, blankState } from './helpers';

describe('winTick', () => {
  it('wins when every pad is done', () => {
    const state = blankState();
    state.pads.push(aPad({ done: true }), aPad({ id: 'p2', done: true }));
    winTick(state);
    expect(state.won).toBe(true);
    expect(state.events.filter((e) => e.type === 'win')).toHaveLength(1);
    winTick(state); // idempotent
    expect(state.events.filter((e) => e.type === 'win')).toHaveLength(1);
  });

  it('does not win while a pad is unpaid', () => {
    const state = blankState();
    state.pads.push(aPad({ done: true }), aPad({ id: 'p2', done: false }));
    winTick(state);
    expect(state.won).toBe(false);
  });

  it('never wins an empty campaign', () => {
    const state = blankState();
    winTick(state);
    expect(state.won).toBe(false);
  });

  it('ignores the fort crews entirely — they are staff, not a win condition', () => {
    const state = blankState();
    state.pads.push(aPad({ done: true }));
    state.villagers.push(aCrew(), aMiner());
    winTick(state);
    expect(state.won).toBe(true);
  });

  it('takes all 18 campaign pads and nothing else', () => {
    const state = createInitialState();
    expect(state.pads).toHaveLength(18);
    for (const pad of state.pads.slice(0, -1)) { pad.done = true; pad.paid = pad.cost; }
    winTick(state);
    expect(state.won).toBe(false); // seventeen is not a finished camp

    const last = state.pads[state.pads.length - 1];
    last.done = true; last.paid = last.cost;
    winTick(state);
    expect(state.won).toBe(true);
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
