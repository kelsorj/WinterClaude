import { describe, expect, it } from 'vitest';
import { customersTick } from '../src/game/systems/customers';
import {
  CUSTOMER_QUEUE_CAP, CUSTOMER_TAKE, SELL_RATE,
} from '../src/content/balance';
import { queueAnchor } from '../src/content/map';
import { v } from '../src/game/math';
import type { GameState, SellStation } from '../src/game/state';
import { aCustomer, aStation, blankState } from './helpers';

const DT = 1 / 60;

function ticks(state: GameState, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) {
    customersTick(state, DT);
    each?.();
  }
}

/** A shopper already standing at the counter, so tests need not walk one in from the road. */
function atCounter(state: GameState, st: SellStation, over = {}): void {
  const spot = queueAnchor(st, 0);
  state.customers.push(aCustomer({ stationId: st.id, pos: spot, slot: 0, ...over }));
}

describe('customersTick spawning', () => {
  it('draws shoppers to a stocked bench and none to an empty one', () => {
    const state = blankState();
    const stocked = aStation({ id: 'st-a', stock: 30 });
    const empty = aStation({ id: 'st-b', pos: v(20, 1), matPos: v(22, 1) });
    state.stations.push(stocked, empty);
    ticks(state, 3);
    expect(state.customers.filter((c) => c.stationId === 'st-a').length).toBeGreaterThan(0);
    expect(state.customers.filter((c) => c.stationId === 'st-b')).toHaveLength(0);
  });

  it('sends the first shopper the moment a bare shelf is stocked', () => {
    const state = blankState();
    const st = aStation();
    state.stations.push(st);
    ticks(state, 5); // idle: timer builds up but nothing to sell
    expect(state.customers).toHaveLength(0);
    st.stock = 4;
    customersTick(state, DT);
    expect(state.customers).toHaveLength(1);
  });

  it('never lets a bench queue exceed the cap', () => {
    const state = blankState();
    const st = aStation({ stock: 10000 });
    state.stations.push(st);
    let peak = 0;
    let peakSlot = 0;
    ticks(state, 60, () => {
      let queued = 0;
      for (const c of state.customers) {
        if (c.state === 'leaving') continue;
        queued++;
        peakSlot = Math.max(peakSlot, c.slot);
      }
      peak = Math.max(peak, queued);
    });
    expect(peak).toBe(CUSTOMER_QUEUE_CAP);
    // Only as many standing spots as the cap allows are ever addressed.
    expect(peakSlot).toBeLessThan(CUSTOMER_QUEUE_CAP);
  });
});

describe('customer purchases', () => {
  it('takes up to CUSTOMER_TAKE off the shelf and leaves the cash on the mat', () => {
    const state = blankState();
    const st = aStation({ stock: 10 });
    state.stations.push(st);
    atCounter(state, st);
    ticks(state, 1); // dwell is 0.8 s
    expect(st.stock).toBe(10 - CUSTOMER_TAKE);
    expect(st.matCash).toBe(CUSTOMER_TAKE * SELL_RATE.wood);
    expect(state.stats.earned).toBe(CUSTOMER_TAKE * SELL_RATE.wood);
    const sells = state.events.filter((e) => e.type === 'sell');
    expect(sells).toHaveLength(1);
    expect(sells[0]).toMatchObject({ cash: CUSTOMER_TAKE * SELL_RATE.wood });
  });

  it('takes only what is left when the shelf is nearly bare', () => {
    const state = blankState();
    const st = aStation({ resource: 'gold', stock: 2 });
    state.stations.push(st);
    atCounter(state, st);
    ticks(state, 1);
    expect(st.stock).toBe(0);
    expect(st.matCash).toBe(2 * SELL_RATE.gold);
  });

  it('leaves empty-handed rather than blocking the line when the shelf ran out', () => {
    const state = blankState();
    const st = aStation({ stock: 0 });
    state.stations.push(st);
    atCounter(state, st);
    ticks(state, 1);
    expect(st.matCash).toBe(0);
    expect(state.events.some((e) => e.type === 'sell')).toBe(false);
    expect(state.customers[0]?.state ?? 'gone').not.toBe('queued');
  });

  it('walks a bought shopper off the map and despawns it', () => {
    const state = blankState();
    const st = aStation({ stock: 3 });
    state.stations.push(st);
    atCounter(state, st);
    ticks(state, 40);
    expect(st.stock).toBe(0);
    expect(state.customers.some((c) => c.id === 'c1')).toBe(false);
  });

  it('shuffles the line forward when the front shopper leaves', () => {
    const state = blankState();
    const st = aStation({ stock: 30 });
    state.stations.push(st);
    for (let i = 0; i < 3; i++) {
      state.customers.push(aCustomer({
        id: `seed${i}`, stationId: st.id, pos: queueAnchor(st, i), slot: i,
      }));
    }
    const second = state.customers[1];
    const startZ = second.pos.z;
    ticks(state, 2);
    expect(second.slot).toBeLessThan(1);
    expect(second.pos.z).toBeLessThan(startZ); // moved up toward the counter
  });
});

describe('customer economics', () => {
  it('drains a stocked bench to empty', () => {
    const state = blankState();
    const st = aStation({ stock: 24 });
    state.stations.push(st);
    ticks(state, 120);
    expect(st.stock).toBe(0);
    expect(st.matCash).toBe(24 * SELL_RATE.wood);
  });

  it('keeps draining as the shelf is restocked, not just once', () => {
    const state = blankState();
    const st = aStation({ stock: 6 });
    state.stations.push(st);
    ticks(state, 60);
    expect(st.stock).toBe(0);
    st.stock = 9; // a later delivery
    ticks(state, 60);
    expect(st.stock).toBe(0);
    expect(st.matCash).toBe(15 * SELL_RATE.wood);
  });

  it('serves every bench in parallel', () => {
    const state = blankState();
    const wood = aStation({ id: 'st-wood', stock: 6 });
    const meat = aStation({ id: 'st-meat', resource: 'meat', pos: v(8, 1), matPos: v(10, 1), stock: 6 });
    state.stations.push(wood, meat);
    ticks(state, 90);
    expect(wood.stock).toBe(0);
    expect(meat.stock).toBe(0);
    expect(meat.matCash).toBe(6 * SELL_RATE.meat);
  });
});
