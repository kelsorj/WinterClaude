import {
  BEAR_MEAT, BEAR_RESPAWN, SEAM_HP, SEAM_RESPAWN, SEAM_YIELD, TOOLS,
  TREE_HP, TREE_RESPAWN, TREE_YIELD,
} from '../../content/balance';
import { spawnDrops } from '../drops';
import { dist } from '../math';
import type { Bear, GameState, GoldSeam, Tree } from '../state';

type Target =
  | { kind: 'tree'; tree: Tree }
  | { kind: 'seam'; seam: GoldSeam }
  | { kind: 'bear'; bear: Bear };

export function harvestTick(state: GameState, dt: number): void {
  for (const t of state.trees)
    if (t.respawn > 0) { t.respawn -= dt; if (t.respawn <= 0) { t.respawn = 0; t.hp = TREE_HP; } }
  for (const s of state.seams)
    if (s.respawn > 0) { s.respawn -= dt; if (s.respawn <= 0) { s.respawn = 0; s.hp = SEAM_HP; } }

  const p = state.player;
  p.swingTimer -= dt;
  if (p.swingTimer > 0) return;
  const tool = TOOLS[p.tool];
  const targets = findTargets(state, tool.range, tool.aoe);
  if (targets.length === 0) return;
  p.swingTimer = tool.period;
  for (const target of targets) hit(state, target, tool.chopDmg, tool.atkDmg);
}

function findTargets(state: GameState, range: number, aoe: boolean): Target[] {
  const p = state.player;
  const found: { t: Target; d: number }[] = [];
  for (const tree of state.trees) {
    if (!state.zonesOpen[tree.zone] || tree.respawn > 0) continue;
    const d = dist(p.pos, tree.pos);
    if (d <= range) found.push({ t: { kind: 'tree', tree }, d });
  }
  if (p.hasPickaxe) {
    for (const seam of state.seams) {
      if (!state.zonesOpen[seam.zone] || seam.respawn > 0) continue;
      const d = dist(p.pos, seam.pos);
      if (d <= range) found.push({ t: { kind: 'seam', seam }, d });
    }
  }
  for (const bear of state.bears) {
    if (!state.zonesOpen[bear.zone] || bear.state === 'dead') continue;
    const d = dist(p.pos, bear.pos);
    if (d <= range) found.push({ t: { kind: 'bear', bear }, d });
  }
  if (found.length === 0) return [];
  if (aoe) return found.map((x) => x.t);
  found.sort((a, b) => a.d - b.d);
  return [found[0].t];
}

function hit(state: GameState, target: Target, chopDmg: number, atkDmg: number): void {
  if (target.kind === 'tree') {
    const t = target.tree;
    t.hp -= chopDmg;
    state.events.push({ type: 'chop', pos: t.pos });
    if (t.hp <= 0) {
      t.respawn = TREE_RESPAWN;
      state.stats.chops++;
      spawnDrops(state, 'wood', TREE_YIELD, t.pos);
      state.events.push({ type: 'treeFall', pos: t.pos });
    }
  } else if (target.kind === 'seam') {
    const s = target.seam;
    s.hp -= chopDmg;
    state.events.push({ type: 'chop', pos: s.pos });
    if (s.hp <= 0) {
      s.respawn = SEAM_RESPAWN;
      spawnDrops(state, 'gold', SEAM_YIELD, s.pos);
    }
  } else {
    const b = target.bear;
    b.hp -= atkDmg;
    b.state = 'aggro';
    state.events.push({ type: 'bearHit', pos: b.pos });
    if (b.hp <= 0) killBear(state, b, 'ground');
  }
}

/**
 * Kill a bear. `to` is 'ground' (meat drops at the corpse, for player kills) or a
 * turret id (meat goes straight to that turret's output pile, for turret kills).
 */
export function killBear(state: GameState, b: Bear, to: 'ground' | string): void {
  b.state = 'dead';
  b.respawn = BEAR_RESPAWN;
  state.stats.bearsKilled++;
  if (to === 'ground') {
    spawnDrops(state, 'meat', BEAR_MEAT, b.pos);
  } else {
    const t = state.turrets.find((m) => m.id === to);
    if (t) t.output += BEAR_MEAT;
  }
}
