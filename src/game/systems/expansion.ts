import { BEAR_HP, EXPEDITION_BASE, EXPEDITION_GROWTH, SEAM_HP, TREE_HP } from '../../content/balance';
import { ringDefs } from '../../content/map';
import { v } from '../math';
import type { GameState } from '../state';

/**
 * The expedition's price after each completion. One rule, in one place: the live pad escalates by
 * calling this once, and a loading save replays it once per ring bought. Rounding compounds, so
 * the two have to be the same arithmetic or a reloaded camp would quietly re-price the pad.
 */
export const escalate = (cost: number): number => Math.round(cost * EXPEDITION_GROWTH);

/** What the expedition pad costs with `expansions` rings already bought: 200, 320, 512, 819… */
export function expeditionCost(expansions: number): number {
  let cost = EXPEDITION_BASE;
  for (let i = 0; i < Math.max(0, Math.floor(expansions)); i++) cost = escalate(cost);
  return cost;
}

/**
 * Append ring `ring`'s wilderness to the world. Purely additive: nothing already in `state` is
 * touched, so this is equally correct applied to a running game the moment the pad is paid and
 * replayed against a fresh state while a save loads.
 *
 * The ids carry the ring index, which is what makes the replay work. `ringDefs` is deterministic,
 * so `ring1-tree42` is the same tree in the same place in every session — and a save's felled
 * list can name ring trees exactly the way it names the starter forest's.
 */
export function applyExpansion(state: GameState, ring: number): void {
  const defs = ringDefs(ring);
  for (let i = 0; i < defs.trees.length; i++) {
    const d = defs.trees[i];
    state.trees.push({ id: `ring${ring}-tree${i}`, zone: d.zone, pos: d.pos, hp: TREE_HP, respawn: 0 });
  }
  for (let i = 0; i < defs.bears.length; i++) {
    const d = defs.bears[i];
    state.bears.push({
      id: `ring${ring}-bear${i}`, zone: d.zone, pos: v(d.pos.x, d.pos.z), home: v(d.pos.x, d.pos.z),
      hp: BEAR_HP, maxHp: BEAR_HP, state: 'sleep', respawn: 0, attackCd: 0,
    });
  }
  for (let i = 0; i < defs.seams.length; i++) {
    const d = defs.seams[i];
    state.seams.push({ id: `ring${ring}-seam${i}`, zone: d.zone, pos: d.pos, hp: SEAM_HP, respawn: 0 });
  }
}
