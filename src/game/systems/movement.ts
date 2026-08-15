import { add, norm, pushOut, scale, type Rect, type Vec2 } from '../math';
import { WORLD_BOUNDS, ZONE_RECTS } from '../../content/map';
import type { GameState, ZoneId } from '../state';

export function movePlayer(state: GameState, intent: Vec2, dt: number): void {
  const p = state.player;
  const dir = norm(intent);
  if (dir.x !== 0 || dir.z !== 0) p.facing = dir;
  let next = add(p.pos, scale(dir, p.speed * dt));
  next = add(next, scale(p.knockback, dt));
  p.knockback = scale(p.knockback, Math.max(0, 1 - 6 * dt));
  for (const [zone, rect] of Object.entries(ZONE_RECTS) as [ZoneId, Rect][]) {
    if (!state.zonesOpen[zone]) next = pushOut(next, rect);
  }
  next.x = Math.min(WORLD_BOUNDS.x1, Math.max(WORLD_BOUNDS.x0, next.x));
  next.z = Math.min(WORLD_BOUNDS.z1, Math.max(WORLD_BOUNDS.z0, next.z));
  p.pos = next;
}
