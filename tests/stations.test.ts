import { describe, expect, it } from 'vitest';
import { stationsTick } from '../src/game/systems/stations';
import { v } from '../src/game/math';
import { aStation, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) stationsTick(state, dt);
}

describe('stationsTick', () => {
  it('deposits the matching resource at ~8/s and pays cash onto the mat', () => {
    const state = blankState();
    state.stations.push(aStation()); // wood station at (0,1), mat at (2,1)
    state.player.carry.wood = 10;
    ticks(state, 0.5);
    const st = state.stations[0];
    expect(state.player.carry.wood).toBeLessThanOrEqual(7); // ≥3 deposited
    expect(st.matCash).toBeGreaterThan(0);
    expect(st.matCash % 2).toBe(0); // wood sells at 2 each
    expect(state.stats.earned).toBe(st.matCash);
  });

  it('does nothing when the player has none of that resource', () => {
    const state = blankState();
    state.stations.push(aStation());
    state.player.carry.meat = 5; // wrong resource
    ticks(state, 1);
    expect(state.stations[0].matCash).toBe(0);
    expect(state.player.carry.meat).toBe(5);
  });

  it('does nothing when out of range', () => {
    const state = blankState();
    state.stations.push(aStation({ pos: v(20, 0), matPos: v(22, 0) }));
    state.player.carry.wood = 5;
    ticks(state, 1);
    expect(state.stations[0].matCash).toBe(0);
  });

  it('player collects mat cash by standing on the mat', () => {
    const state = blankState();
    state.stations.push(aStation({ matPos: v(0.5, 0), matCash: 12 }));
    ticks(state, 0.1);
    expect(state.player.cash).toBe(12);
    expect(state.stations[0].matCash).toBe(0);
  });

  it('empties the whole carry over enough time', () => {
    const state = blankState();
    state.stations.push(aStation());
    state.player.carry.wood = 10;
    ticks(state, 2);
    expect(state.player.carry.wood).toBe(0);
    expect(state.stations[0].matCash).toBe(20);
  });
});
