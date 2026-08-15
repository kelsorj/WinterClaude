import { describe, expect, it } from 'vitest';
import { intentFrom, type InputState } from '../src/game/input';
import { movePlayer } from '../src/game/systems/movement';
import { WORLD_BOUNDS, ZONE_RECTS, worldBounds } from '../src/content/map';
import { inRect, v } from '../src/game/math';
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
    state.player.pos = v(WORLD_BOUNDS.x1 - 1, 0);
    movePlayer(state, v(1, 0), 10);
    expect(state.player.pos.x).toBe(WORLD_BOUNDS.x1);
    movePlayer(state, v(0, -1), 100);
    expect(state.player.pos.z).toBe(WORLD_BOUNDS.z0);
  });

  /**
   * The border is not a constant since Amendment 5B — it is where the expeditions have pushed it.
   * A player standing on the old edge must be able to walk straight out into the new ring.
   */
  it('clamps to the expanded border after an expedition, not the old one', () => {
    const state = blankState();
    state.expansions = 2;
    state.player.pos = v(WORLD_BOUNDS.x1, 0);
    movePlayer(state, v(1, 0), 3);
    expect(state.player.pos.x).toBeGreaterThan(WORLD_BOUNDS.x1);

    movePlayer(state, v(1, 0), 100);
    expect(state.player.pos.x).toBe(worldBounds(2).x1);
    movePlayer(state, v(0, -1), 100);
    expect(state.player.pos.z).toBe(worldBounds(2).z0);
  });

  // Since the 10× world this is a zone's edge rather than the map's — the gated rects now sit in
  // open country, so the player can walk right around them but still not into them.
  it('blocks sneaking along a sealed zone edge into it', () => {
    const state = blankState();
    state.player.pos = v(60, 0);
    for (let i = 0; i < 600; i++) movePlayer(state, v(0, -1), 1 / 60); // press toward deepforest for 10s
    expect(state.player.pos.z).toBeGreaterThanOrEqual(-6); // held at the zone edge
  });

  it('lets the player walk right around a sealed zone without ever entering it', () => {
    const state = blankState();
    const deep = ZONE_RECTS.deepforest;
    state.player.pos = v(deep.x1 + 4, deep.z1 + 4); // open wilderness off its south-east corner
    // Anticlockwise around the rect: north up its east side, west across its top, then back
    // south down its far side — ground that only exists because the world grew around it.
    const legs: [number, number, number][] = [[0, -1, 8], [-1, 0, 8], [0, 1, 8], [1, 0, 8]];
    let entered = false;
    for (const [ix, iz, seconds] of legs) {
      for (let i = 0; i < seconds * 60; i++) {
        movePlayer(state, v(ix, iz), 1 / 60);
        if (inRect(state.player.pos, deep)) entered = true;
      }
    }
    expect(entered).toBe(false);
    // …and the lap really did go around it, rather than being stopped short somewhere.
    expect(state.player.pos.x).toBeGreaterThan(deep.x1);
    expect(state.player.pos.z).toBeGreaterThan(deep.z1);
  });
});
