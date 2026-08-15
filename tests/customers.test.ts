import { describe, expect, it } from 'vitest';
import { customersTick } from '../src/game/systems/customers';
import {
  CUSTOMER_INTERVAL, CUSTOMER_QUEUE_CAP, CUSTOMER_TAKE, SELL_RATE,
} from '../src/content/balance';
import {
  CAMP_FOOTPRINT, ROAD_ENDS, ZONE_RECTS, compoundFencePosts, nearestRoadEnd, queueAnchor,
  roadLaneZ, stationRoadEnd,
} from '../src/content/map';
import { createInitialState } from '../src/game/init';
import { dist, inRect, v } from '../src/game/math';
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

describe('customer routing', () => {
  it('gives shoppers spawned together off one road end their own lane and pace', () => {
    const state = blankState();
    const a = aStation({ id: 'st-a', stock: 10, spawnTimer: CUSTOMER_INTERVAL });
    const b = aStation({
      id: 'st-b', pos: v(-6, 1), matPos: v(-4, 1), stock: 10, spawnTimer: CUSTOMER_INTERVAL,
    });
    state.stations.push(a, b);
    expect(nearestRoadEnd(a.pos)).toEqual(nearestRoadEnd(b.pos)); // same end of the road

    customersTick(state, DT); // both benches draw a shopper on the same tick
    expect(state.customers).toHaveLength(2);
    const [c1, c2] = state.customers;
    expect(Math.abs(c1.pos.z - c2.pos.z)).toBeGreaterThan(0.05); // spawned on separate lanes
    ticks(state, 0.5);
    expect(c1.pos.x).not.toBe(c2.pos.x); // and walking at slightly different paces
  });

  it('walks arrivals up a lane beside the line, never down it', () => {
    const state = blankState();
    const st = aStation({ stock: 10000 });
    state.stations.push(st);
    // A shopper standing on the line must never be in FRONT of its own slot: that space belongs
    // to the shoppers ahead of it, and walking through it is walking through the queue.
    let cutThroughLine = 0;
    ticks(state, 40, () => {
      for (const c of state.customers) {
        if (c.state === 'leaving') continue;
        const anchor = queueAnchor(st, c.slot);
        const onLine = Math.abs(c.pos.x - anchor.x) < 0.3;
        if (onLine && c.pos.z < anchor.z - 0.3) cutThroughLine++;
      }
    });
    expect(cutThroughLine).toBe(0);
  });

  it('sends departures out on a different road lane than arrivals come in on', () => {
    const state = blankState();
    const st = aStation({ stock: 10000 });
    state.stations.push(st);
    ticks(state, 20);
    const inbound = state.customers.filter((c) => c.state === 'arriving');
    const outbound = state.customers.filter((c) => c.state === 'leaving');
    expect(inbound.length).toBeGreaterThan(0);
    expect(outbound.length).toBeGreaterThan(0);
    // Both streams walk the road on the way to/from the same end; separating them in z is what
    // stops leaving shoppers passing through arriving ones head-on.
    const onRoad = (c: { pos: { z: number } }): boolean => c.pos.z < 5;
    for (const out of outbound.filter(onRoad))
      for (const inn of inbound.filter(onRoad))
        expect(Math.abs(out.pos.z - inn.pos.z)).toBeGreaterThan(0.15);
  });
});

describe('shoppers and the camp building', () => {
  /** The road's paved half-width; a lane outside this is walking on the snow. */
  const ROAD_Z = 7;

  it('keeps both of the east end\'s lanes on the road and out of the deep forest', () => {
    const east = ROAD_ENDS.find((e) => e.x > 0)!;
    // The jitter a shopper's id can produce is ±0.5 (see `laneJitter`); check both extremes of
    // both lanes rather than the nominal lane centres.
    for (const outbound of [false, true]) {
      for (const jitter of [-0.5, 0.5]) {
        const z = roadLaneZ(east, outbound, jitter);
        expect(z).toBeGreaterThan(-ROAD_Z);                     // still on the road
        expect(z).toBeGreaterThan(ZONE_RECTS.deepforest.z1);    // and clear of its gate wall
        expect(z).toBeLessThan(0);                              // on the north side of the road
      }
    }
  });

  /**
   * The compound sim-walk (Amendment 6A). With the stands wrapped around the fort, a shopper's
   * route is a bespoke polyline per bench rather than "down the road and turn", so the only
   * honest check is to run the whole thing and watch where forty-odd walkers actually put their
   * feet: through the building, through the compound's fence, or into a zone that is still gated.
   */
  it('never walks a shopper through the camp building, the fence or a gated zone', () => {
    const state = createInitialState();
    for (const st of state.stations) st.stock = 500;
    const posts = compoundFencePosts();
    // Half a picket plus half a shopper: closer than this and the walker is inside the fence.
    const FENCE_CLEAR = 0.35;
    let inside = 0;
    let throughFence = 0;
    let inGatedZone = 0;
    // Long enough for the far end of the road to deliver its shoppers to the counter and send
    // them home again: the walk in alone is ~13 s.
    ticks(state, 120, () => {
      for (const c of state.customers) {
        if (inRect(c.pos, CAMP_FOOTPRINT)) inside++;
        if (posts.some((p) => dist(p.pos, c.pos) < FENCE_CLEAR)) throughFence++;
        for (const rect of Object.values(ZONE_RECTS)) if (inRect(c.pos, rect)) inGatedZone++;
      }
    });
    expect(state.customers.length).toBeGreaterThan(0); // the sim actually ran
    expect(inside).toBe(0);
    expect(throughFence).toBe(0);
    expect(inGatedZone).toBe(0);
  });

  it('draws every bench a line of its own, from the end of the road it is served by', () => {
    const state = createInitialState();
    // Both ends carry traffic: the wood and meat stands from the west, the gold stand from the
    // east. The assignment is authored rather than nearest — every stand now sits east of centre,
    // so by distance alone all three would draw from the east end, and the east approach is the
    // pinched one (the hunting ground's rect walls off everything east of the compound).
    const byEnd = new Map<number, string[]>();
    for (const st of state.stations) {
      const end = stationRoadEnd(st).x;
      byEnd.set(end, [...(byEnd.get(end) ?? []), st.resource]);
      expect(ROAD_ENDS.some((e) => e.x === end)).toBe(true);
    }
    expect([...byEnd.keys()].length).toBe(2);
    expect(byEnd.get(58)).toEqual(['gold']);
    expect(byEnd.get(-58)?.sort()).toEqual(['meat', 'wood']);

    for (const st of state.stations) st.stock = 30;
    ticks(state, 90);
    for (const st of state.stations) {
      expect(st.stock).toBeLessThan(30);   // they all arrive and buy
      expect(st.matCash).toBeGreaterThan(0);
    }
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
