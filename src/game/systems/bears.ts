import {
  BEAR_ATTACK_CD, BEAR_ATTACK_RANGE, BEAR_KNOCKBACK, BEAR_LEASH, BEAR_SPEED,
} from '../../content/balance';
import { add, dist, norm, scale, toward, v } from '../math';
import type { GameState } from '../state';
import { blockedByZones } from './movement';

export function bearsTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const b of state.bears) {
    if (!state.zonesOpen[b.zone]) continue;
    if (b.state === 'dead') {
      b.respawn -= dt;
      if (b.respawn <= 0) {
        b.respawn = 0; b.state = 'sleep'; b.hp = b.maxHp; b.pos = v(b.home.x, b.home.z); b.attackCd = 0;
      }
      continue;
    }
    b.attackCd = Math.max(0, b.attackCd - dt);
    if (b.state !== 'aggro') continue;
    const d = dist(b.pos, p.pos);
    if (d > BEAR_LEASH) {
      b.state = 'sleep'; b.hp = b.maxHp; b.pos = v(b.home.x, b.home.z);
      continue;
    }
    if (d > BEAR_ATTACK_RANGE) {
      const next = toward(b.pos, p.pos, BEAR_SPEED * dt);
      if (!blockedByZones(state, next)) b.pos = next;
    } else if (b.attackCd === 0) {
      b.attackCd = BEAR_ATTACK_CD;
      p.knockback = add(p.knockback, scale(norm(v(p.pos.x - b.pos.x, p.pos.z - b.pos.z)), BEAR_KNOCKBACK));
      state.events.push({ type: 'playerHit', pos: v(p.pos.x, p.pos.z) });
    }
  }
}
