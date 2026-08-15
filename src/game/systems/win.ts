import type { GameState } from '../state';

export function winTick(state: GameState): void {
  if (state.won) return;
  if (state.pads.length === 0) return;
  const allPads = state.pads.every((p) => p.done);
  // State-based, so the fort crew (never frozen) neither blocks nor shortcuts the win.
  const allThawed = state.villagers.every((v) => v.state !== 'frozen');
  if (allPads && allThawed) {
    state.won = true;
    state.events.push({ type: 'win' });
  }
}
