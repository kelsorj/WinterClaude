import { describe, expect, it } from 'vitest';
import { villagersTick } from '../src/game/systems/villagers';
import { v } from '../src/game/math';
import { aCrew, aStation, aVillager, blankState } from './helpers';

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
