import { DEPOSIT_RATE, DEPOT_RANGE, WITHDRAW_PAUSE } from '../../content/balance';
import { dist, v } from '../math';
import { carryTotal } from './pickup';
import type { GameState, ResourceKind } from '../state';

/**
 * Value-priority order (Amendment 4A). Gold first: it is the only thing the late pads take, it is
 * what the miners keep dropping off, and a pack filled with wood on the way to a gold pad is the
 * exact failure this system exists to fix. Wood is last because it is the one commodity the
 * player can always cut more of a few steps away.
 */
const WITHDRAW_ORDER: ResourceKind[] = ['gold', 'meat', 'wood'];

/**
 * Standing at the depot streams goods out of it and into the player's pack — the mirror of
 * `stationsTick`'s deposit, at the same rate and in whole units, so a withdrawal clicks along at
 * the same pace a deposit drains. Pauses entirely once the pack is `WITHDRAW_PAUSE` full, so it
 * never fights a player who walked in carrying goods bound for a bench.
 */
export function depotTick(state: GameState, dt: number): void {
  const p = state.player;
  if (dist(p.pos, state.depotPos) > DEPOT_RANGE) { state.depotTimer = 0; return; }
  const carried = carryTotal(state);
  // Room is measured against the hard cap, but the stream stops well below it: see WITHDRAW_PAUSE.
  const room = p.carryCap - carried;
  if (carried >= WITHDRAW_PAUSE * p.carryCap || room <= 0) { state.depotTimer = 0; return; }
  // A bare depot resets the clock rather than banking seconds against a future delivery, which
  // would otherwise dump a whole backlog into the pack the instant a cart rolled in.
  if (WITHDRAW_ORDER.every((kind) => Math.floor(state.depot[kind]) <= 0)) {
    state.depotTimer = 0;
    return;
  }
  state.depotTimer += DEPOSIT_RATE * dt;
  let budget = Math.min(Math.floor(state.depotTimer), room);
  if (budget <= 0) return;
  let moved = 0;
  for (const kind of WITHDRAW_ORDER) {
    if (budget <= 0) break;
    // Floored: the depot can hold a fraction left over from a machine's output, and the pack
    // only ever carries whole goods.
    const n = Math.min(budget, Math.floor(state.depot[kind]));
    if (n <= 0) continue;
    state.depot[kind] -= n;
    p.carry[kind] += n;
    budget -= n;
    moved += n;
  }
  if (moved > 0) {
    state.depotTimer -= moved;
    state.events.push({ type: 'pickup', pos: v(state.depotPos.x, state.depotPos.z) });
  }
}
