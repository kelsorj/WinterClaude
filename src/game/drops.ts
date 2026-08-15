import { v, type Vec2 } from './math';
import type { Currency, GameState } from './state';

/** Scatter `count` single-unit drops in a small ring around a point. */
export function spawnDrops(state: GameState, kind: Currency, count: number, around: Vec2): void {
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(count, 1)) * Math.PI * 2;
    state.drops.push({
      id: `drop${state.nextDropId++}`,
      kind,
      amount: 1,
      pos: v(around.x + Math.cos(a) * 0.9, around.z + Math.sin(a) * 0.9),
    });
  }
}
