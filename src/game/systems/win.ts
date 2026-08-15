import type { GameState } from '../state';

/**
 * The camp is complete when every unlock pad is bought — all 18 of them (Amendment 4C). It used
 * to also require the snowfield emptied of frozen villagers; with the rescue mechanic cut, pad
 * completion is the whole condition.
 */
export function winTick(state: GameState): void {
  if (state.won) return;
  if (state.pads.length === 0) return;
  if (!state.pads.every((p) => p.done)) return;
  state.won = true;
  state.events.push({ type: 'win' });
}
