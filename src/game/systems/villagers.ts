import {
  HAUL_AMOUNT, MINER_CAMP_TIER, MINER_DRAIN, MINER_RANGE, SEAM_RESPAWN, SEAM_YIELD,
  VILLAGER_RANGE, VILLAGER_SPEED, thawCost,
} from '../../content/balance';
import { CAMP_POS } from '../../content/map';
import { dist, toward, v } from '../math';
import { blockedByZones, pathBlocked } from './movement';
import { depositToStation } from './stations';
import type { GameState, GoldSeam, ResourceKind, Villager } from '../state';

export function villagersTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const vil of state.villagers) {
    if (vil.state === 'frozen') {
      const cost = thawCost(state.rescued);
      if (dist(p.pos, vil.pos) < VILLAGER_RANGE && p.carry.meat >= cost) {
        p.carry.meat -= cost;
        vil.state = 'walking';
        state.rescued++;
        state.events.push({ type: 'thaw', pos: v(vil.pos.x, vil.pos.z) });
      }
    } else if (vil.state === 'walking') {
      vil.pos = toward(vil.pos, CAMP_POS, VILLAGER_SPEED * dt);
      if (dist(vil.pos, CAMP_POS) < 0.5) vil.state = 'hauler';
    } else if (vil.kind === 'miner') {
      minerTick(state, vil, dt);
    } else {
      // The fort crew stands at its post until hired; rescued villagers always haul.
      if (vil.kind === 'crew' && !state.distributorActive) continue;
      haulerTick(state, vil, dt);
    }
  }
}

/** A seam worth walking to: standing, not on respawn, and not behind a gate that is still shut. */
function minable(state: GameState, seam: GoldSeam): boolean {
  return seam.respawn === 0 && seam.hp > 0
    && state.zonesOpen[seam.zone] && !blockedByZones(state, seam.pos);
}

/**
 * The seam a miner is working, claiming the nearest reachable free one if it has none. A claim
 * is held until the rock is worked out, so a miner does not swap targets every time it takes a
 * step, and two miners never drain the same seam at twice the rate.
 */
function claimSeam(state: GameState, vil: Villager): GoldSeam | null {
  const held = state.seams.find((s) => s.id === vil.target);
  if (held && minable(state, held)) return held;
  vil.target = null;
  const taken = new Set(
    state.villagers.filter((o) => o !== vil && o.target !== null).map((o) => o.target),
  );
  let best: GoldSeam | null = null;
  let bestD = Infinity;
  for (const seam of state.seams) {
    if (taken.has(seam.id) || !minable(state, seam)) continue;
    if (pathBlocked(state, vil.pos, seam.pos)) continue;
    const d = dist(vil.pos, seam.pos);
    if (d < bestD) { bestD = d; best = seam; }
  }
  if (best) vil.target = best.id;
  return best;
}

/**
 * The Grand Fort's gold crew (Amendment 3A): claim a seam, work it out, carry the gold home to
 * the depot, repeat. Dropping it at the depot rather than the bench is the point — from there
 * the distributor crew runs it out to the gold bench for the customers, so tier 4 closes a
 * hands-off pipeline from rock to cash.
 */
function minerTick(state: GameState, vil: Villager, dt: number): void {
  // Below tier 4 they simply stand at their posts in the yard, pickaxes in hand.
  if (state.campTier < MINER_CAMP_TIER) return;
  if (vil.carrying !== null) {
    vil.pos = toward(vil.pos, state.depotPos, VILLAGER_SPEED * dt);
    if (dist(vil.pos, state.depotPos) < 1) {
      state.depot[vil.carrying] += vil.amount;
      vil.carrying = null;
      vil.amount = 0;
    }
    return;
  }
  const seam = claimSeam(state, vil);
  // Every seam worked out or claimed: wait at the depot rather than loitering in the quarry.
  if (!seam) {
    vil.pos = toward(vil.pos, state.depotPos, VILLAGER_SPEED * dt);
    return;
  }
  if (dist(vil.pos, seam.pos) > MINER_RANGE) {
    vil.pos = toward(vil.pos, seam.pos, VILLAGER_SPEED * dt);
    return;
  }
  seam.hp -= MINER_DRAIN * dt;
  if (seam.hp <= 0) {
    // Same depletion semantics as a player swing (see `harvest.ts`), except the gold goes into
    // the miner's arms instead of onto the ground as a drop.
    seam.hp = 0;
    seam.respawn = SEAM_RESPAWN;
    vil.carrying = 'gold';
    vil.amount = SEAM_YIELD;
    vil.target = null;
  }
}

function haulerTick(state: GameState, vil: Villager, dt: number): void {
  if (vil.carrying === null) {
    vil.pos = toward(vil.pos, state.depotPos, VILLAGER_SPEED * dt);
    if (dist(vil.pos, state.depotPos) < 1) {
      const kinds: ResourceKind[] = ['wood', 'meat', 'gold'];
      kinds.sort((a, b) => state.depot[b] - state.depot[a]);
      const best = kinds[0];
      if (state.depot[best] > 0) {
        const n = Math.min(HAUL_AMOUNT, state.depot[best]);
        state.depot[best] -= n;
        vil.carrying = best;
        vil.amount = n;
      }
    }
  } else {
    const st = state.stations.find((s) => s.resource === vil.carrying);
    if (!st) { vil.carrying = null; vil.amount = 0; return; }
    vil.pos = toward(vil.pos, st.pos, VILLAGER_SPEED * dt);
    if (dist(vil.pos, st.pos) < 1.2) {
      depositToStation(st, vil.carrying, vil.amount);
      vil.carrying = null;
      vil.amount = 0;
    }
  }
}
