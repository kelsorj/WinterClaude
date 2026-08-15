import { MAGNET_RADIUS, MAGNET_SPEED, PICKUP_RADIUS } from '../../content/balance';
import { dist, toward, v } from '../math';
import type { Drop, GameState } from '../state';

export function carryTotal(state: GameState): number {
  const c = state.player.carry;
  return c.wood + c.meat + c.gold;
}

export function pickupTick(state: GameState, dt: number): void {
  const p = state.player;
  const keep: Drop[] = [];
  for (const d of state.drops) {
    const away = dist(d.pos, p.pos);
    if (away < MAGNET_RADIUS && away >= PICKUP_RADIUS) {
      d.pos = toward(d.pos, p.pos, MAGNET_SPEED * dt);
    }
    if (dist(d.pos, p.pos) < PICKUP_RADIUS) {
      if (d.kind === 'cash') {
        p.cash += d.amount;
        state.events.push({ type: 'pickup', pos: v(d.pos.x, d.pos.z) });
        continue;
      }
      if (carryTotal(state) + d.amount <= p.carryCap) {
        p.carry[d.kind] += d.amount;
        state.events.push({ type: 'pickup', pos: v(d.pos.x, d.pos.z) });
        continue;
      }
    }
    keep.push(d);
  }
  state.drops = keep;
}
