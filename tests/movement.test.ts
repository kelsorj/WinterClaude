import { describe, expect, it } from 'vitest';
import { intentFrom, type InputState } from '../src/game/input';
import { movePlayer } from '../src/game/systems/movement';
import { v } from '../src/game/math';
import { blankState } from './helpers';

const input = (over: Partial<InputState> = {}): InputState =>
  ({ keys: new Set(), drag: null, ...over });

describe('intentFrom', () => {
  it('maps W to screen-up in world space', () => {
    const i = intentFrom(input({ keys: new Set(['w']) }));
    expect(i.x).toBeCloseTo(-Math.SQRT1_2);
    expect(i.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it('maps D to screen-right in world space', () => {
    const i = intentFrom(input({ keys: new Set(['d']) }));
    expect(i.x).toBeCloseTo(Math.SQRT1_2);
    expect(i.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it('W+D combine to straight up-right (world -z)', () => {
    const i = intentFrom(input({ keys: new Set(['w', 'd']) }));
    expect(i.x).toBeCloseTo(0);
    expect(i.z).toBeCloseTo(-1);
  });

  it('uses drag vector when present (drag right = screen right)', () => {
    const i = intentFrom(input({ drag: v(100, 0) }));
    expect(i.x).toBeCloseTo(Math.SQRT1_2);
    expect(i.z).toBeCloseTo(-Math.SQRT1_2);
  });

  it('returns zero with no input', () => {
    expect(intentFrom(input())).toEqual({ x: 0, z: 0 });
  });
});

describe('movePlayer', () => {
  it('moves at player speed', () => {
    const state = blankState();
    movePlayer(state, v(1, 0), 0.5);
    expect(state.player.pos.x).toBeCloseTo(3); // speed 6 * 0.5s
    expect(state.player.facing.x).toBeCloseTo(1);
  });

  it('applies and decays knockback', () => {
    const state = blankState();
    state.player.knockback = v(10, 0);
    movePlayer(state, v(0, 0), 0.1);
    expect(state.player.pos.x).toBeCloseTo(1); // 10 * 0.1
    expect(state.player.knockback.x).toBeCloseTo(4); // 10 * (1 - 6*0.1)
  });

  it('blocks closed zones and allows open ones', () => {
    const state = blankState();
    state.player.pos = v(29.9, -20);
    movePlayer(state, v(1, 0), 0.1); // deepforest rect starts at x=30
    expect(state.player.pos.x).toBeLessThanOrEqual(30);
    state.zonesOpen.deepforest = true;
    movePlayer(state, v(1, 0), 1);
    expect(state.player.pos.x).toBeGreaterThan(30);
  });

  it('clamps to world bounds', () => {
    const state = blankState();
    state.player.pos = v(59, 0);
    movePlayer(state, v(1, 0), 10);
    expect(state.player.pos.x).toBe(60);
  });
});
