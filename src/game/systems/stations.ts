import { DEPOSIT_RATE, SELL_RATE, STATION_RANGE } from '../../content/balance';
import { dist, v } from '../math';
import type { GameState, ResourceKind, SellStation } from '../state';

/** Convert `amount` of `kind` into cash on the station's mat. Used by player deposits and villager haulers. */
export function depositToStation(state: GameState, st: SellStation, kind: ResourceKind, amount: number): void {
  if (amount <= 0) return;
  const cash = amount * SELL_RATE[kind];
  st.matCash += cash;
  // 'earned' counts cash created on mats (revenue), not cash collected.
  state.stats.earned += cash;
  state.events.push({ type: 'sell', pos: v(st.pos.x, st.pos.z), cash });
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
        depositToStation(state, st, st.resource, n);
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
