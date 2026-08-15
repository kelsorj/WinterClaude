import { describe, expect, it } from 'vitest';
import { depotTick } from '../src/game/systems/depot';
import { DEPOSIT_RATE, DEPOT_RANGE, WITHDRAW_PAUSE } from '../src/content/balance';
import { carryTotal } from '../src/game/systems/pickup';
import { v } from '../src/game/math';
import type { GameState } from '../src/game/state';
import { blankState } from './helpers';

const DT = 1 / 60;

function ticks(state: GameState, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) depotTick(state, DT);
}

/** Player standing on the depot with room to spare. */
function atDepot(): GameState {
  const state = blankState();
  state.player.pos = v(state.depotPos.x, state.depotPos.z);
  return state;
}

describe('depotTick withdrawal', () => {
  it('streams the depot into the pack at the deposit rate', () => {
    const state = atDepot();
    state.depot.wood = 100;
    state.player.carryCap = 100;
    ticks(state, 1);
    // One second at DEPOSIT_RATE, give or take the whole unit still accruing.
    expect(state.player.carry.wood).toBeGreaterThanOrEqual(DEPOSIT_RATE - 1);
    expect(state.player.carry.wood).toBeLessThanOrEqual(DEPOSIT_RATE);
    expect(state.depot.wood).toBe(100 - state.player.carry.wood);
  });

  it('takes gold first, then meat, then wood', () => {
    const state = atDepot();
    state.player.carryCap = 100;
    state.depot = { wood: 40, meat: 10, gold: 3 };
    const order: string[] = [];
    const seen = { wood: 0, meat: 0, gold: 0 };
    for (let t = 0; t < 8; t += DT) {
      depotTick(state, DT);
      for (const kind of ['wood', 'meat', 'gold'] as const) {
        if (state.player.carry[kind] > seen[kind]) {
          seen[kind] = state.player.carry[kind];
          if (!order.includes(kind)) order.push(kind);
        }
      }
    }
    expect(order).toEqual(['gold', 'meat', 'wood']);
    expect(state.depot.gold).toBe(0);
    expect(state.depot.meat).toBe(0);
  });

  it('drains a pile completely before starting the next one', () => {
    const state = atDepot();
    state.player.carryCap = 100;
    state.depot = { wood: 50, meat: 4, gold: 0 };
    // Long enough to move more than the 4 meat, so wood only starts once meat is gone.
    ticks(state, 1);
    expect(state.player.carry.meat).toBe(4);
    expect(state.player.carry.wood).toBeGreaterThan(0);
  });

  it('pauses once the pack is 80% full and never exceeds the cap', () => {
    const state = atDepot();
    state.player.carryCap = 20; // pause threshold 16
    state.depot.wood = 500;
    ticks(state, 10);
    const total = carryTotal(state);
    expect(total).toBeGreaterThanOrEqual(WITHDRAW_PAUSE * state.player.carryCap);
    expect(total).toBeLessThanOrEqual(state.player.carryCap);
    // Nothing more comes across once the threshold is crossed.
    const settled = total;
    ticks(state, 10);
    expect(carryTotal(state)).toBe(settled);
  });

  it('does not fight a player already over the threshold on arrival', () => {
    const state = atDepot();
    state.player.carryCap = 20;
    state.player.carry.meat = 18; // heading out to a bench, not shopping
    state.depot.gold = 50;
    ticks(state, 5);
    expect(state.player.carry.gold).toBe(0);
    expect(state.depot.gold).toBe(50);
  });

  it('moves whole units only, leaving machine fractions in the depot', () => {
    const state = atDepot();
    state.player.carryCap = 100;
    state.depot.wood = 5.5;
    ticks(state, 3);
    expect(state.player.carry.wood).toBe(5);
    expect(state.depot.wood).toBeCloseTo(0.5);
    expect(Number.isInteger(state.player.carry.wood)).toBe(true);
  });

  it('does nothing at an empty depot, and banks no backlog against a later delivery', () => {
    const state = atDepot();
    state.player.carryCap = 100;
    ticks(state, 5);
    expect(carryTotal(state)).toBe(0);
    expect(state.events).toHaveLength(0);

    state.depot.gold = 20; // a cart finally rolls in
    depotTick(state, DT);
    expect(state.player.carry.gold).toBe(0); // one tick is worth a fraction of a unit, not five seconds
  });

  it('does nothing out of range', () => {
    const state = blankState();
    state.player.pos = v(state.depotPos.x + DEPOT_RANGE + 0.5, state.depotPos.z);
    state.player.carryCap = 100;
    state.depot.gold = 20;
    ticks(state, 3);
    expect(state.player.carry.gold).toBe(0);
    expect(state.depot.gold).toBe(20);
  });

  it('clicks a pickup event at the depot for every whole unit taken', () => {
    const state = atDepot();
    state.player.carryCap = 100;
    state.depot.gold = 4;
    ticks(state, 1);
    const pickups = state.events.filter((e) => e.type === 'pickup');
    expect(pickups.length).toBeGreaterThan(0);
    for (const e of pickups) expect(e).toMatchObject({ pos: state.depotPos });
  });
});
