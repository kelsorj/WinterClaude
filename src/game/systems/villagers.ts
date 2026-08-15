import { HAUL_AMOUNT, VILLAGER_RANGE, VILLAGER_SPEED, thawCost } from '../../content/balance';
import { CAMP_POS } from '../../content/map';
import { dist, toward, v } from '../math';
import { depositToStation } from './stations';
import type { GameState, ResourceKind, Villager } from '../state';

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
    } else {
      // The fort crew stands at its post until hired; rescued villagers always haul.
      if (vil.kind === 'crew' && !state.distributorActive) continue;
      haulerTick(state, vil, dt);
    }
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
