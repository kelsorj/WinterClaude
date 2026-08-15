import {
  CUSTOMER_DWELL, CUSTOMER_INTERVAL, CUSTOMER_QUEUE_CAP, CUSTOMER_SPEED, CUSTOMER_TAKE, SELL_RATE,
} from '../../content/balance';
import { arrivalPath, departurePath, queueAnchor, roadLaneZ, stationRoadEnd } from '../../content/map';
import { dist, hash01, toward, v } from '../math';
import type { Customer, GameState, SellStation } from '../state';

/** Close enough to count as standing on a spot; one frame of walking covers 0.07 at 60 Hz. */
const ARRIVED = 0.05;

/**
 * Deterministic per-shopper variation, derived from the id so it costs no state and stays put
 * across a save. Without it every shopper spawned in the same tick from the same road end walks
 * the identical line at the identical pace and they render as one superimposed body; ±0.5 of
 * lane and ±5% of pace is enough to pull a co-spawned group apart within a couple of strides.
 */
function laneJitter(id: string): number { return hash01(`${id}z`) - 0.5; }
function speedOf(id: string): number { return CUSTOMER_SPEED * (0.95 + hash01(`${id}v`) * 0.1); }

/** Shoppers committed to a bench: standing in its line plus still walking in. */
function pipeline(state: GameState, stationId: string): Customer[] {
  return state.customers.filter((c) => c.stationId === stationId && c.state !== 'leaving');
}

/**
 * Walk `step` metres along the remaining path, consuming waypoints. Returns true once the path
 * is exhausted — a step can cross several short legs, so this is not one-waypoint-per-tick.
 */
function advance(c: Customer, step: number): boolean {
  let left = step;
  while (left > 0 && c.path.length > 0) {
    const target = c.path[0];
    const d = dist(c.pos, target);
    if (d <= left) {
      c.pos = v(target.x, target.z);
      c.path.shift();
      left -= d;
    } else {
      c.pos = toward(c.pos, target, left);
      left = 0;
    }
  }
  return c.path.length === 0;
}

/**
 * One shopper per bench per `CUSTOMER_INTERVAL`, while that bench has something to sell and its
 * queue has room. The timer keeps running (clamped) on an empty bench, so the first deposit onto
 * a bare shelf draws a buyer immediately instead of after a dead interval.
 */
function spawnCustomers(state: GameState, dt: number): void {
  for (const st of state.stations) {
    st.spawnTimer = Math.min(st.spawnTimer + dt, CUSTOMER_INTERVAL);
    if (st.stock <= 0 || st.spawnTimer < CUSTOMER_INTERVAL) continue;
    const waiting = pipeline(state, st.id);
    if (waiting.length >= CUSTOMER_QUEUE_CAP) continue;
    st.spawnTimer = 0;
    const end = stationRoadEnd(st);
    const id = `cust${state.nextCustomerId++}`;
    const z = roadLaneZ(end, false, laneJitter(id));
    state.customers.push({
      id,
      stationId: st.id,
      pos: v(end.x, z),
      state: 'arriving',
      slot: waiting.length,
      // Down the road, then around the compound to the head of the bench's walk-in lane; the
      // steering below takes it from there. The route is the bench's own (see `arrivalPath`) —
      // a line straight from the road end would cut through the fort or through the stands.
      path: arrivalPath(st, z),
      timer: 0,
      bought: 0,
    });
  }
}

function buy(state: GameState, st: SellStation, c: Customer): void {
  const take = Math.min(CUSTOMER_TAKE, st.stock);
  if (take > 0) {
    st.stock -= take;
    const cash = take * SELL_RATE[st.resource];
    st.matCash += cash;
    // 'earned' counts cash created on mats (revenue), not cash collected.
    state.stats.earned += cash;
    c.bought = take;
    state.events.push({ type: 'sell', pos: v(st.pos.x, st.pos.z), cash });
  }
  // A shopper that reached the counter after the shelf emptied leaves empty-handed rather than
  // blocking the line forever: queues must always drain.
  c.state = 'leaving';
  const end = stationRoadEnd(st);
  // Out from the counter and back around the compound the way it came, on the outbound side of
  // the route: the line stands BEHIND the counter, so nothing is between a served shopper and
  // its way out, and the outbound lanes keep it clear of the arrivals still walking in.
  const z = roadLaneZ(end, true, laneJitter(c.id));
  c.path = departurePath(st, c.pos, z);
}

function stepCustomer(state: GameState, c: Customer, dt: number): void {
  const st = state.stations.find((s) => s.id === c.stationId);
  if (!st) { c.state = 'leaving'; c.path = []; return; }
  const step = speedOf(c.id) * dt;
  if (c.state === 'arriving') {
    if (!advance(c, step)) return;
    c.state = 'queued';
  }
  if (c.state === 'queued') {
    const anchor = queueAnchor(st, c.slot);
    // A shopper still out in the walk-in lane closes the gap in z first and steps across only
    // once it is level with its slot. Steering straight at the anchor instead would walk it
    // diagonally through everyone standing between the lane mouth and that slot — and the slot
    // moves forward while it walks, so the target row has to be re-read every tick rather than
    // baked into the arrival path.
    const inLane = Math.abs(c.pos.x - anchor.x) > ARRIVED;
    const goal = inLane && Math.abs(c.pos.z - anchor.z) > ARRIVED ? v(c.pos.x, anchor.z) : anchor;
    c.pos = toward(c.pos, goal, step);
    if (c.slot === 0 && dist(c.pos, anchor) <= ARRIVED) {
      c.state = 'buying';
      c.timer = 0;
    }
    return;
  }
  if (c.state === 'buying') {
    c.timer += dt;
    if (c.timer >= CUSTOMER_DWELL) buy(state, st, c);
    return;
  }
  advance(c, step);
}

/** Renumber each bench's line so everyone behind a departing shopper shuffles up one place. */
function reindexQueues(state: GameState): void {
  for (const st of state.stations) {
    const waiting = pipeline(state, st.id).sort((a, b) => a.slot - b.slot);
    for (let i = 0; i < waiting.length; i++) waiting[i].slot = i;
  }
}

export function customersTick(state: GameState, dt: number): void {
  spawnCustomers(state, dt);
  for (const c of state.customers) stepCustomer(state, c, dt);
  state.customers = state.customers.filter((c) => c.state !== 'leaving' || c.path.length > 0);
  reindexQueues(state);
}
