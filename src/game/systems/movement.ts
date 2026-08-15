import { add, dist, inRect, norm, scale, v, type Rect, type Vec2 } from '../math';
import { WORLD_BOUNDS, ZONE_RECTS } from '../../content/map';
import type { GameState, ZoneId } from '../state';

export function blockedByZones(state: GameState, q: Vec2): boolean {
  for (const [zone, rect] of Object.entries(ZONE_RECTS) as [ZoneId, Rect][]) {
    if (!state.zonesOpen[zone] && inRect(q, rect)) return true;
  }
  return false;
}

/**
 * Does the straight walk from `a` to `b` cross a sealed zone? NPCs walk in straight lines with
 * no collision of their own, so anything sending one across the map has to check the whole route
 * rather than just the destination — a miner heading for a wilderness seam south-east of the
 * camp would otherwise stroll straight through the locked hunting-ground gate.
 *
 * Sampled every 2 units, which cannot miss a gated rect: the smallest is 28 units on its short
 * side.
 */
export function pathBlocked(state: GameState, a: Vec2, b: Vec2): boolean {
  const steps = Math.max(1, Math.ceil(dist(a, b) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (blockedByZones(state, v(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t))) return true;
  }
  return false;
}

export function movePlayer(state: GameState, intent: Vec2, dt: number): void {
  const p = state.player;
  const dir = norm(intent);
  if (dir.x !== 0 || dir.z !== 0) p.facing = dir;
  const step = add(scale(dir, p.speed * dt), scale(p.knockback, dt));
  p.knockback = scale(p.knockback, Math.max(0, 1 - 6 * dt));
  const clampX = (x: number) => Math.min(WORLD_BOUNDS.x1, Math.max(WORLD_BOUNDS.x0, x));
  const clampZ = (z: number) => Math.min(WORLD_BOUNDS.z1, Math.max(WORLD_BOUNDS.z0, z));
  // If a stale save ever restores a position inside a sealed zone, let the player walk out.
  const stuck = blockedByZones(state, p.pos);
  let next = v(clampX(p.pos.x + step.x), p.pos.z);
  if (!stuck && blockedByZones(state, next)) next = v(p.pos.x, p.pos.z);
  const withZ = v(next.x, clampZ(p.pos.z + step.z));
  if (stuck || !blockedByZones(state, withZ)) next = withZ;
  p.pos = next;
}
