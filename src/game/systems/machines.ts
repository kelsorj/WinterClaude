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
      // An arrow station shoots what is coming for the camp — a raider walking in, one feeding,
      // one the player has pulled — and lets sleeping bears sleep. The hunting turrets out east
      // are the ones that farm, and they have the rails to carry it home.
      //
      // Without this the compound's south-east tower reaches into the hunting ground and shoots
      // its bears on their respawn timer forever: 17 units of range past a wall of sleeping meat
      // turned four defence pads into the best meat mine in the game (measured: 284 meat in ten
      // minutes, against the 70 an undefended camp loses).
      .filter((b) => !t.dropsOnGround || b.state !== 'sleep')
      .sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos));
    const target = inRange[0];
    if (!target) { t.cd = 0; continue; }
    t.cd = TURRET_PERIOD;
    target.hp -= TURRET_DMG;
    state.events.push({ type: 'bearHit', pos: v(target.pos.x, target.pos.z) });
    // An arrow station has no rail and no output pile: its kills fall where the bear did, for
    // the player (or a hauler passing) to pick up (Amendment 6B).
    if (target.hp <= 0) {
      killBear(state, target, t.dropsOnGround ? { kind: 'ground' } : { kind: 'turret', turret: t });
    }
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
