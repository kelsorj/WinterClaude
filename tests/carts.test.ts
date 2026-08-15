import { describe, expect, it } from 'vitest';
import { cartPos, cartsTick, railActive, railResource } from '../src/game/systems/carts';
import { v } from '../src/game/math';
import { aCart, aRail, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) cartsTick(state, dt);
}

function setup() {
  const state = blankState();
  // 10-unit rail from sawmill at (0,0) to depot end at (10,0); CART_SPEED = 5
  state.sawmills.push({ id: 'm1', pos: v(0, 0), radius: 8, timer: 0, active: true, output: 10 });
  state.rails.push(aRail());
  state.carts.push(aCart());
  return state;
}

describe('carts', () => {
  it('rail resource follows the source machine type', () => {
    expect(railResource(aRail())).toBe('wood');
    expect(railResource(aRail({ sourceType: 'turret' }))).toBe('meat');
  });

  it('loads at the source and departs', () => {
    const state = setup();
    ticks(state, 0.1);
    expect(state.carts[0].load).toBe(6); // cap
    expect(state.sawmills[0].output).toBe(4);
    expect(state.carts[0].dir).toBe(1);
  });

  it('delivers to the depot and returns', () => {
    const state = setup();
    ticks(state, 2.5); // load + 2s travel each way
    expect(state.depot.wood).toBeGreaterThanOrEqual(6);
  });

  it('waits at an empty source without departing', () => {
    const state = setup();
    state.sawmills[0].output = 0;
    ticks(state, 1);
    expect(state.carts[0].s).toBe(0);
    expect(state.carts[0].dir).toBe(-1);
    expect(state.carts[0].load).toBe(0);
  });

  it('shuttles continuously while output remains', () => {
    const state = setup();
    ticks(state, 10);
    expect(state.depot.wood).toBe(10); // everything delivered
    expect(state.sawmills[0].output).toBe(0);
  });

  it('railActive follows the source machine of either type', () => {
    const state = setup();
    expect(railActive(state, state.rails[0])).toBe(true);
    state.sawmills[0].active = false;
    expect(railActive(state, state.rails[0])).toBe(false);

    state.turrets.push({ id: 'tu1', pos: v(0, 0), range: 10, cd: 0, active: true, output: 0 });
    const turretRail = aRail({ id: 'r2', sourceType: 'turret', sourceId: 'tu1' });
    expect(railActive(state, turretRail)).toBe(true);
    expect(railActive(state, aRail({ id: 'r3', sourceId: 'missing' }))).toBe(false);
  });

  it('cartPos maps s onto the rail polyline', () => {
    const state = setup();
    state.carts[0].s = 5;
    expect(cartPos(state, state.carts[0])).toEqual({ x: 5, z: 0 });
  });
});
