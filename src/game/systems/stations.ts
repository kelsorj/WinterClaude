import { DEPOSIT_RATE, STATION_RANGE } from '../../content/balance';
import { dist, v } from '../math';
import type { GameState, ResourceKind, SellStation } from '../state';

/**
 * Put `amount` of `kind` on the bench's shelf. Used by player deposits, villager haulers and the
 * distributor crew alike. Since Amendment 2A this mints no cash: stock sits here until a customer
 * walks in and buys it (see `customersTick`), which is where the cash and the `sell` event come from.
 */
export function depositToStation(st: SellStation, kind: ResourceKind, amount: number): void {
  if (amount <= 0 || st.resource !== kind) return;
  st.stock += amount;
}

export function stationsTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const st of state.stations) {
    if (dist(p.pos, st.pos) < STATION_RANGE && p.carry[st.resource] > 0) {
      st.timer += DEPOSIT_RATE * dt;
      const n = Math.min(Math.floor(st.timer), p.carry[st.resource]);
      if (n > 0) {
        st.timer -= n;
        p.carry[st.resource] -= n;
        depositToStation(st, st.resource, n);
        state.events.push({ type: 'deposit', pos: v(st.pos.x, st.pos.z) });
      }
    } else {
      st.timer = 0;
    }
    if (st.matCash > 0 && dist(p.pos, st.matPos) < STATION_RANGE) {
      p.cash += st.matCash;
      st.matCash = 0;
      state.events.push({ type: 'pickup', pos: v(st.matPos.x, st.matPos.z) });
    }
  }
}
