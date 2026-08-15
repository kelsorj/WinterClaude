import { describe, expect, it } from 'vitest';
import { villagersTick } from '../src/game/systems/villagers';
import { MINER_CAMP_TIER, SEAM_YIELD } from '../src/content/balance';
import { ZONE_RECTS } from '../src/content/map';
import { v } from '../src/game/math';
import { aCrew, aMiner, aSeam, aStation, aVillager, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) villagersTick(state, dt);
}

describe('villagersTick', () => {
  it('thaws a frozen villager for meat', () => {
    const state = blankState();
    state.villagers.push(aVillager()); // at (0,1), player at origin; cost = thawCost(0) = 2
    state.player.carry.meat = 5;
    ticks(state, 0.1);
    expect(state.villagers[0].state).toBe('walking');
    expect(state.player.carry.meat).toBe(3);
    expect(state.rescued).toBe(1);
    expect(state.events.some((e) => e.type === 'thaw')).toBe(true);
  });

  it('does not thaw without enough meat', () => {
    const state = blankState();
    state.villagers.push(aVillager());
    state.player.carry.meat = 1;
    ticks(state, 0.5);
    expect(state.villagers[0].state).toBe('frozen');
    expect(state.rescued).toBe(0);
  });

  it('walking villagers reach camp and become haulers', () => {
    const state = blankState();
    state.villagers.push(aVillager({ state: 'walking', pos: v(15, 4.4) })); // CAMP_POS is (18,4.4)
    ticks(state, 2);
    expect(state.villagers[0].state).toBe('hauler');
  });

  it('haulers ferry depot goods onto the matching bench as stock', () => {
    const state = blankState();
    state.depotPos = v(3, 0); // short test route: depot (3,0) → wood station (0,1)
    state.depot.wood = 6;
    state.stations.push(aStation());
    state.villagers.push(aVillager({ state: 'hauler', pos: v(3, 0) })); // at depot
    ticks(state, 8); // two short round trips at speed 3
    expect(state.depot.wood).toBe(0);
    // Hauled goods go on the shelf; the cash arrives later, when customers buy them.
    expect(state.stations[0].stock).toBe(6);
    expect(state.stations[0].matCash).toBe(0);
  });

  it('the fort crew stays put until the distributor pad is bought', () => {
    const state = blankState();
    state.depotPos = v(3, 0);
    state.depot.wood = 6;
    state.stations.push(aStation());
    state.villagers.push(aCrew({ pos: v(8, 8) }));
    ticks(state, 8);
    expect(state.villagers[0].pos).toEqual(v(8, 8));
    expect(state.depot.wood).toBe(6);
    expect(state.stations[0].stock).toBe(0);
  });

  it('the crew hauls depot goods to the benches once hired', () => {
    const state = blankState();
    state.depotPos = v(3, 0);
    state.depot.wood = 6;
    state.distributorActive = true;
    state.stations.push(aStation());
    state.villagers.push(aCrew({ pos: v(3, 0) }));
    ticks(state, 8);
    expect(state.depot.wood).toBe(0);
    expect(state.stations[0].stock).toBe(6);
  });

  it('never counts crew as rescued, thawed or frozen', () => {
    const state = blankState();
    state.distributorActive = true;
    state.player.carry.meat = 20;
    state.villagers.push(aCrew({ pos: v(0, 0.5) })); // right on top of the player
    ticks(state, 2);
    expect(state.rescued).toBe(0);
    expect(state.player.carry.meat).toBe(20);
    expect(state.villagers[0].state).toBe('hauler');
  });

  it('never counts miners as rescued, thawed or frozen', () => {
    const state = blankState();
    state.campTier = MINER_CAMP_TIER;
    state.player.carry.meat = 20;
    state.villagers.push(aMiner({ pos: v(0, 0.5) })); // right on top of the player
    ticks(state, 2);
    expect(state.rescued).toBe(0);
    expect(state.player.carry.meat).toBe(20);
    expect(state.villagers[0].state).toBe('hauler');
  });

  it('rotates a carrier over every non-empty pile instead of always taking the biggest', () => {
    const state = blankState();
    state.depotPos = v(3, 0);
    // Meat and wood dominate; under the old largest-pile rule the 3 gold never moved.
    state.depot = { wood: 100, meat: 100, gold: 3 };
    state.stations.push(
      aStation({ id: 's-wood', resource: 'wood' }),
      aStation({ id: 's-meat', resource: 'meat', pos: v(0, -1), matPos: v(2, -1) }),
      aStation({ id: 's-gold', resource: 'gold', pos: v(1, 2), matPos: v(3, 2) }),
    );
    state.villagers.push(aVillager({ state: 'hauler', pos: v(3, 0) }));
    const vil = state.villagers[0];

    const trips: string[] = [];
    let last: string | null = null;
    for (let t = 0; t < 20; t += 1 / 60) {
      villagersTick(state, 1 / 60);
      if (vil.carrying !== null && vil.carrying !== last) trips.push(vil.carrying);
      last = vil.carrying;
    }

    expect(trips.length).toBeGreaterThanOrEqual(3);
    expect(new Set(trips.slice(0, 3)).size).toBe(3); // three different piles in three trips
  });

  it('gets gold onto the gold bench even when meat and wood dominate the depot', () => {
    const state = blankState();
    state.depotPos = v(3, 0);
    state.depot = { wood: 100, meat: 100, gold: 3 };
    state.stations.push(
      aStation({ id: 's-wood', resource: 'wood' }),
      aStation({ id: 's-meat', resource: 'meat', pos: v(0, -1), matPos: v(2, -1) }),
      aStation({ id: 's-gold', resource: 'gold', pos: v(1, 2), matPos: v(3, 2) }),
    );
    state.villagers.push(aVillager({ state: 'hauler', pos: v(3, 0) }));
    ticks(state, 30);
    expect(state.stations.find((s) => s.resource === 'gold')!.stock).toBe(3);
    expect(state.depot.gold).toBe(0);
  });

  it('skips empty piles rather than stalling a trip on them', () => {
    const state = blankState();
    state.depotPos = v(3, 0);
    state.depot = { wood: 0, meat: 0, gold: 6 };
    state.stations.push(aStation({ id: 's-gold', resource: 'gold' }));
    state.villagers.push(aVillager({ state: 'hauler', pos: v(3, 0) }));
    ticks(state, 12);
    expect(state.stations[0].stock).toBe(6);
  });

  it('haulers idle at an empty depot', () => {
    const state = blankState();
    state.depotPos = v(3, 0);
    state.stations.push(aStation());
    state.villagers.push(aVillager({ state: 'hauler', pos: v(3, 0) }));
    ticks(state, 2);
    expect(state.villagers[0].carrying).toBeNull();
    expect(state.stations[0].stock).toBe(0);
  });
});

describe('Grand Fort miners', () => {
  /** A miner at the depot with one seam a short walk away. */
  function mining(over: Parameters<typeof aMiner>[0] = {}): ReturnType<typeof blankState> {
    const state = blankState();
    state.depotPos = v(0, 0);
    state.campTier = MINER_CAMP_TIER;
    state.seams.push(aSeam({ id: 'seam0', pos: v(6, 0) }));
    state.villagers.push(aMiner({ pos: v(0, 0), ...over }));
    return state;
  }

  it('stands idle below the Grand Fort and goes to work at it', () => {
    const idle = mining();
    idle.campTier = MINER_CAMP_TIER - 1;
    ticks(idle, 5);
    expect(idle.villagers[0].pos).toEqual(v(0, 0));
    expect(idle.villagers[0].target).toBeNull();
    expect(idle.seams[0].hp).toBe(4);

    const working = mining();
    ticks(working, 5);
    expect(working.villagers[0].target).toBe('seam0');
    expect(working.seams[0].hp).toBeLessThan(4);
  });

  it('runs the full seam → depot cycle and banks the gold', () => {
    const state = mining();
    // ~1.5 s out, 4 s mining, ~1.7 s back.
    ticks(state, 10);
    expect(state.depot.gold).toBe(SEAM_YIELD);
    expect(state.villagers[0].carrying).toBeNull();
    // The seam is on its respawn timer, exactly as if the player had mined it out.
    expect(state.seams[0].respawn).toBeGreaterThan(0);
    expect(state.seams[0].hp).toBe(0);
    // And it goes straight back out for the next one once the seam comes back.
    state.seams[0].respawn = 0;
    state.seams[0].hp = 4;
    ticks(state, 10);
    expect(state.depot.gold).toBe(SEAM_YIELD * 2);
  });

  it('never lets two miners drain one seam at twice the rate', () => {
    const state = mining();
    state.villagers.push(aMiner({ id: 'miner1', pos: v(0, 0) }));
    ticks(state, 3);
    const claims = state.villagers.map((m) => m.target);
    expect(claims.filter((t) => t === 'seam0')).toHaveLength(1);
    expect(claims).toContain(null); // the second miner found nothing free and went idle
    // 3 s of walking-then-mining can never have removed more than 3 hp at 1 hp/s.
    expect(state.seams[0].hp).toBeGreaterThan(1);
  });

  it('will not walk to a seam behind a gate that is still shut', () => {
    const state = mining();
    // Inside the quarry rect, which this save has not opened.
    state.seams[0] = aSeam({ id: 'seam0', zone: 'quarry', pos: v(-45, -20) });
    ticks(state, 5);
    expect(state.villagers[0].target).toBeNull();
    expect(state.seams[0].hp).toBe(4);
  });

  it('will not cross a sealed zone to reach a seam beyond it', () => {
    const state = mining();
    // Open ground on the far side of the sealed hunting grounds: reachable only by walking
    // straight through them, which a miner must not do.
    const hunt = ZONE_RECTS.hunting;
    state.depotPos = v(hunt.x0 - 10, (hunt.z0 + hunt.z1) / 2);
    state.seams[0] = aSeam({ id: 'seam0', pos: v(hunt.x1 + 10, (hunt.z0 + hunt.z1) / 2) });
    state.villagers[0].pos = v(state.depotPos.x, state.depotPos.z);
    ticks(state, 5);
    expect(state.villagers[0].target).toBeNull();
    expect(state.seams[0].hp).toBe(4);

    state.zonesOpen.hunting = true; // the gate opens and the route is on
    ticks(state, 1);
    expect(state.villagers[0].target).toBe('seam0');
  });

  it('waits at the depot when every seam is on respawn', () => {
    const state = mining({ pos: v(6, 0) });
    state.seams[0].respawn = 10;
    ticks(state, 5);
    expect(state.villagers[0].target).toBeNull();
    expect(state.villagers[0].pos).toEqual(v(0, 0)); // walked home
  });
});
