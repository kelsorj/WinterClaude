import { describe, expect, it } from 'vitest';
import { update } from '../src/game/update';
import { v } from '../src/game/math';
import { createInitialState } from '../src/game/init';
import { statsLine } from '../src/ui/ui';
import { blankState } from './helpers';

describe('update integration', () => {
  it('runs a full tick without errors and advances time', () => {
    const state = blankState();
    update(state, v(1, 0), 1 / 60);
    expect(state.time).toBeCloseTo(1 / 60);
    expect(state.player.pos.x).toBeGreaterThan(0);
  });

  /**
   * The camp used to end when every pad was bought. Amendment 5A cut that: a finished campaign is
   * just a well-equipped sandbox, so completing the last pad must produce no state and no event
   * that anything downstream could treat as an ending.
   */
  it('has no ending: a fully bought campaign keeps ticking like any other', () => {
    const state = createInitialState();
    for (const pad of state.pads) { pad.done = true; pad.paid = pad.cost; }
    state.events.length = 0;

    for (let i = 0; i < 120; i++) update(state, v(0, 0), 1 / 60);

    expect(state.time).toBeCloseTo(2);
    expect('won' in state).toBe(false);
    expect(state.events.map((e) => e.type)).not.toContain('win');
  });
});

describe('statsLine', () => {
  it('reports the lifetime record the win screen used to', () => {
    const state = blankState();
    state.time = 125.9;
    state.stats = { chops: 42, bearsKilled: 7, earned: 1234.6 };
    expect(statsLine(state)).toBe('Time 2m 5s · 42 trees felled · 7 bears defeated · $1234 earned');
  });

  it('starts a fresh camp at zero', () => {
    expect(statsLine(createInitialState()))
      .toBe('Time 0m 0s · 0 trees felled · 0 bears defeated · $0 earned');
  });
});
