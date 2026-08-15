import {
  BEAR_ATTACK_CD, BEAR_ATTACK_RANGE, BEAR_KNOCKBACK, BEAR_LEASH, BEAR_SPEED, RAID_AGGRO_RANGE,
  RAID_FEED_RANGE, RAID_FEED_RATE, RAID_HOME_RANGE, RAID_INTERVAL, RAID_INTERVAL_MIN,
  RAID_INTERVAL_PER_RING, RAID_PACK_BASE, RAID_PACK_MAX, RAID_PACK_PER_RINGS,
  RAID_RECRUIT_RADIUS, RAID_SATIETY, RAID_SPEED, RAID_SPEED_MULT, RAID_STAGGER,
} from '../../content/balance';
import { add, dist, hash01, norm, scale, toward, v, type Vec2 } from '../math';
import type { Bear, GameState } from '../state';
import { blockedByZones } from './movement';

/**
 * How often an ambient raid fires. It quickens with the world — every expedition adds wilderness,
 * and wilderness is where the bears live — but only mildly, and never past `RAID_INTERVAL_MIN`.
 */
export function raidInterval(expansions: number): number {
  return Math.max(
    RAID_INTERVAL_MIN,
    RAID_INTERVAL / (1 + RAID_INTERVAL_PER_RING * Math.max(0, expansions)),
  );
}

/** How many of the nearest eligible bears a raid draws its pack from; see `triggerRaid`. */
const RAID_CANDIDATES = 12;

/**
 * How many bears come at once. A raid is a pack, not a bear: one at a time read as a nuisance
 * rather than the ad's siege. It grows by a whole bear every `RAID_PACK_PER_RINGS` expeditions —
 * the world's bear population grows with its rings — and stops at `RAID_PACK_MAX`, because a camp
 * far enough out would otherwise face a wall of bears that no four towers could answer.
 */
export function raidPackSize(expansions: number): number {
  const rings = Math.max(0, Math.floor(expansions));
  return Math.min(RAID_PACK_MAX, RAID_PACK_BASE + Math.floor(rings / RAID_PACK_PER_RINGS));
}

/** The meat bench, which is a raider's second choice after the depot itself. */
function meatStand(state: GameState): { pos: Vec2; stock: number } | undefined {
  return state.stations.find((s) => s.resource === 'meat');
}

/** Meat a raider can actually reach, in the order it prefers to eat it. */
function meatInCamp(state: GameState): number {
  return state.depot.meat + (meatStand(state)?.stock ?? 0);
}

type RaidGoal = { kind: 'depot' | 'stand' | 'home'; pos: Vec2 };

/**
 * Where a raider is walking. A raider that has eaten its fill, or that finds the camp bare, is
 * simply a raider whose goal is home again — which is what keeps the raid down to two states,
 * "walking somewhere" and "eating something", instead of needing a third for the retreat.
 */
function raidGoal(state: GameState, b: Bear): RaidGoal {
  if (b.eaten < RAID_SATIETY) {
    // Any meat at all, not a whole one: the depot carries fractions off the machines, and a
    // threshold of 1 left a raider walking away from the last 0.98 of a pile it was standing in.
    if (state.depot.meat > 0) return { kind: 'depot', pos: state.depotPos };
    const stand = meatStand(state);
    if (stand && stand.stock > 0) return { kind: 'stand', pos: stand.pos };
  }
  return { kind: 'home', pos: b.home };
}

/**
 * One step toward `to`, sliding per-axis along anything sealed. Shared by the aggro chase and the
 * raid walk: the fence is scenery and the gates are narrative, but a gated ZONE is still solid,
 * so a raider coming in from the deep forest rounds its wall the same way a chasing bear does.
 */
function stepToward(state: GameState, b: Bear, to: Vec2, speed: number, dt: number): void {
  const next = toward(b.pos, to, speed * dt);
  if (!blockedByZones(state, next)) { b.pos = next; return; }
  const xOnly = v(next.x, b.pos.z);
  const zOnly = v(b.pos.x, next.z);
  if (!blockedByZones(state, xOnly)) b.pos = xOnly;
  else if (!blockedByZones(state, zOnly)) b.pos = zOnly;
}

/**
 * Wake a pack of sleeping bears near the camp and send them in for the meat (Amendment 6B).
 *
 * Nothing is drawn from an empty camp: with no meat in the depot and none on the bench there is
 * nothing to raid, so the timer simply holds at the interval and the first delivery that matters
 * draws a pack soon after — the same "a bare shelf draws no shopper, a stocked one draws one at
 * once" rule the benches use. It is also what keeps the opening hour of a run alone: a hatchet
 * and no meat is not a camp worth raiding.
 *
 * The pack is taken from the nearest dozen rather than the nearest N, starting at an offset
 * hashed off the clock, so raiders still come from the country around the camp but the same bears
 * do not walk the same line every time. Each member's `raidDelay` staggers its departure, which
 * is what makes the pack read as a wave breaking rather than a column marching.
 */
function triggerRaid(state: GameState, dt: number): void {
  const interval = raidInterval(state.expansions);
  state.raidTimer = Math.min(state.raidTimer + dt, interval);
  if (state.raidTimer < interval || meatInCamp(state) < 1) return;
  const eligible = state.bears
    .filter((b) => b.state === 'sleep' && state.zonesOpen[b.zone]
      && dist(b.home, state.depotPos) <= RAID_RECRUIT_RADIUS)
    .sort((a, b) => dist(a.home, state.depotPos) - dist(b.home, state.depotPos))
    .slice(0, RAID_CANDIDATES);
  if (eligible.length === 0) return;
  state.raidTimer = 0;
  const pack = Math.min(raidPackSize(state.expansions), eligible.length);
  const from = Math.floor(hash01(`raid${state.time.toFixed(1)}`) * eligible.length);
  for (let i = 0; i < pack; i++) {
    const bear = eligible[(from + i) % eligible.length];
    bear.state = 'raiding';
    bear.eaten = 0;
    bear.raidDelay = i * RAID_STAGGER;
  }
}

/** Eat from whatever the raider is standing at, and stop when full or when it runs out. */
function feed(state: GameState, b: Bear, dt: number): void {
  const goal = raidGoal(state, b);
  if (goal.kind === 'home' || dist(b.pos, goal.pos) > RAID_FEED_RANGE) {
    b.state = 'raiding';
    return;
  }
  const bite = Math.min(RAID_FEED_RATE * dt, RAID_SATIETY - b.eaten);
  if (goal.kind === 'depot') {
    const got = Math.min(bite, state.depot.meat);
    state.depot.meat -= got;
    b.eaten += got;
  } else {
    const stand = meatStand(state)!;
    const got = Math.min(bite, stand.stock);
    stand.stock -= got;
    b.eaten += got;
  }
  if (b.eaten >= RAID_SATIETY) b.state = 'raiding'; // sated: next tick it heads home
}

export function bearsTick(state: GameState, dt: number): void {
  const p = state.player;
  triggerRaid(state, dt);
  for (const b of state.bears) {
    if (!state.zonesOpen[b.zone]) continue;
    if (b.state === 'dead') {
      b.respawn -= dt;
      if (b.respawn <= 0) {
        b.respawn = 0; b.state = 'sleep'; b.hp = b.maxHp; b.pos = v(b.home.x, b.home.z);
        b.attackCd = 0; b.eaten = 0; b.raidDelay = 0;
      }
      continue;
    }
    b.attackCd = Math.max(0, b.attackCd - dt);
    if (b.state === 'raiding' || b.state === 'feeding') {
      // A raider that notices the player stops eating and goes for them; from there it is an
      // ordinary aggro bear, and killing it drops everything it has swallowed.
      if (dist(b.pos, p.pos) <= RAID_AGGRO_RANGE) {
        b.state = 'aggro';
      } else if (b.state === 'feeding') {
        feed(state, b, dt);
        continue;
      } else if (b.raidDelay > 0) {
        // Still waiting its turn to set off; it is a raider, it just has not started walking.
        b.raidDelay = Math.max(0, b.raidDelay - dt);
        continue;
      } else {
        const goal = raidGoal(state, b);
        // Charging the camp is faster than ambling home from it: the multiplier applies only on
        // the way in, which is what makes an arriving wave and a departing one read differently.
        const speed = goal.kind === 'home' ? RAID_SPEED : RAID_SPEED * RAID_SPEED_MULT;
        stepToward(state, b, goal.pos, speed, dt);
        if (goal.kind === 'home') {
          if (dist(b.pos, b.home) <= RAID_HOME_RANGE) {
            b.pos = v(b.home.x, b.home.z);
            b.state = 'sleep';
            b.eaten = 0;
            b.raidDelay = 0;
          }
        } else if (dist(b.pos, goal.pos) <= RAID_FEED_RANGE) {
          b.state = 'feeding';
        }
        continue;
      }
    }
    if (b.state !== 'aggro') continue;
    const d = dist(b.pos, p.pos);
    if (d > BEAR_LEASH) {
      b.state = 'sleep'; b.hp = b.maxHp; b.pos = v(b.home.x, b.home.z);
      b.eaten = 0; b.raidDelay = 0;
      continue;
    }
    if (d > BEAR_ATTACK_RANGE) {
      stepToward(state, b, p.pos, BEAR_SPEED, dt);
    } else if (b.attackCd === 0) {
      b.attackCd = BEAR_ATTACK_CD;
      const kb = add(p.knockback, scale(norm(v(p.pos.x - b.pos.x, p.pos.z - b.pos.z)), BEAR_KNOCKBACK));
      const mag = Math.hypot(kb.x, kb.z);
      p.knockback = mag > BEAR_KNOCKBACK * 2 ? scale(kb, (BEAR_KNOCKBACK * 2) / mag) : kb;
      state.events.push({ type: 'playerHit', pos: v(p.pos.x, p.pos.z) });
    }
  }
}
