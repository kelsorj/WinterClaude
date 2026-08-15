import { describe, expect, it } from 'vitest';
import { bearsTick } from '../src/game/systems/bears';
import { v } from '../src/game/math';
import { aBear, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) bearsTick(state, dt);
}

describe('bearsTick', () => {
  it('sleeping bears stay put', () => {
    const state = blankState();
    state.bears.push(aBear({ pos: v(5, 0), home: v(5, 0) }));
    ticks(state, 1);
    expect(state.bears[0].pos).toEqual({ x: 5, z: 0 });
  });

  it('aggro bears chase the player', () => {
    const state = blankState();
    state.bears.push(aBear({ state: 'aggro', pos: v(5, 0), home: v(5, 0) }));
    ticks(state, 0.5);
    expect(state.bears[0].pos.x).toBeLessThan(5); // moved toward player at origin
  });

  it('attacks in range: knockback + event, honoring cooldown', () => {
    const state = blankState();
    state.bears.push(aBear({ state: 'aggro', pos: v(1, 0), home: v(1, 0) }));
    ticks(state, 0.1);
    expect(state.player.knockback.x).toBeLessThan(0); // pushed away (player at origin, bear at +x)
    const hits = state.events.filter((e) => e.type === 'playerHit').length;
    expect(hits).toBe(1); // cooldown prevents a hit every tick
  });

  it('leashes back home and heals when the player is far away', () => {
    const state = blankState();
    state.player.pos = v(-30, 0);
    state.bears.push(aBear({ state: 'aggro', hp: 2, pos: v(5, 0), home: v(5, 0) }));
    ticks(state, 0.1);
    const b = state.bears[0];
    expect(b.state).toBe('sleep');
    expect(b.hp).toBe(b.maxHp);
    expect(b.pos).toEqual({ x: 5, z: 0 });
  });

  it('dead bears respawn at home after the timer', () => {
    const state = blankState();
    state.bears.push(aBear({ state: 'dead', respawn: 0.5, hp: 0, pos: v(9, 9), home: v(5, 0) }));
    ticks(state, 1);
    const b = state.bears[0];
    expect(b.state).toBe('sleep');
    expect(b.hp).toBe(b.maxHp);
    expect(b.pos).toEqual({ x: 5, z: 0 });
  });

  it('ignores bears in closed zones', () => {
    const state = blankState();
    state.bears.push(aBear({ zone: 'deepforest', state: 'aggro', pos: v(5, 0) }));
    ticks(state, 0.5);
    expect(state.bears[0].pos).toEqual({ x: 5, z: 0 });
  });
});
