import { CART_SPEED } from '../../content/balance';
import { pointOnPolyline, polylineLength, v, type Vec2 } from '../math';
import type { Cart, GameState, Rail, ResourceKind } from '../state';

export function railResource(rail: Rail): ResourceKind {
  return rail.sourceType === 'turret' ? 'meat' : 'wood';
}

function takeFromSource(state: GameState, rail: Rail, n: number): number {
  const m = rail.sourceType === 'turret'
    ? state.turrets.find((t) => t.id === rail.sourceId)
    : state.sawmills.find((s) => s.id === rail.sourceId);
  if (!m) return 0;
  const got = Math.min(n, m.output);
  m.output -= got;
  return got;
}

export function cartPos(state: GameState, cart: Cart): Vec2 {
  const rail = state.rails.find((r) => r.id === cart.railId);
  return rail ? pointOnPolyline(rail.points, cart.s) : v(0, 0);
}

export function cartsTick(state: GameState, dt: number): void {
  for (const cart of state.carts) {
    const rail = state.rails.find((r) => r.id === cart.railId);
    if (!rail) continue;
    const len = polylineLength(rail.points);
    if (cart.dir === 1) {
      cart.s += CART_SPEED * dt;
      if (cart.s >= len) {
        cart.s = len;
        state.depot[railResource(rail)] += cart.load;
        cart.load = 0;
        cart.dir = -1;
      }
    } else {
      cart.s = Math.max(0, cart.s - CART_SPEED * dt);
      if (cart.s === 0) {
        cart.load += takeFromSource(state, rail, cart.cap - cart.load);
        if (cart.load > 0) cart.dir = 1;
      }
    }
  }
}
