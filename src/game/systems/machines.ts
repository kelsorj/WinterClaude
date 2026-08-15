import { SAWMILL_PERIOD, TREE_YIELD, TURRET_DMG, TURRET_PERIOD } from '../../content/balance';
import { dist, v } from '../math';
import { FELLED, killBear } from './harvest';
import type { GameState } from '../state';

export function machinesTick(state: GameState, dt: number): void {
  for (const t of state.turrets) {
    if (!t.active) continue;
    t.cd -= dt;
    if (t.cd > 0) continue;
    const inRange = state.bears
      .filter((b) => b.state !== 'dead' && state.zonesOpen[b.zone] && dist(b.pos, t.pos) <= t.range)
      .sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos));
    const target = inRange[0];
    if (!target) { t.cd = 0; continue; }
    t.cd = TURRET_PERIOD;
    target.hp -= TURRET_DMG;
    state.events.push({ type: 'bearHit', pos: v(target.pos.x, target.pos.z) });
    if (target.hp <= 0) killBear(state, target, { kind: 'turret', turret: t });
  }

  for (const s of state.sawmills) {
    if (!s.active) continue;
    s.timer -= dt;
    if (s.timer > 0) continue;
    const tree = state.trees.find(
      (tr) => tr.respawn === 0 && state.zonesOpen[tr.zone] && dist(tr.pos, s.pos) <= s.radius,
    );
    if (!tree) { s.timer = 0; continue; }
    s.timer = SAWMILL_PERIOD;
    tree.respawn = FELLED; // sawmills clear their radius for good, then idle

    s.output += TREE_YIELD;
    state.stats.chops++;
    state.events.push({ type: 'treeFall', pos: v(tree.pos.x, tree.pos.z) });
  }
}
