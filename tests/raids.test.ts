import { describe, expect, it } from 'vitest';
import { bearsTick, raidInterval, raidPackSize } from '../src/game/systems/bears';
import { machinesTick } from '../src/game/systems/machines';
import { killBear } from '../src/game/systems/harvest';
import {
  BEAR_MEAT, RAID_INTERVAL, RAID_INTERVAL_MIN, RAID_PACK_BASE, RAID_PACK_MAX, RAID_RECRUIT_RADIUS,
  RAID_SATIETY, RAID_SPEED, RAID_SPEED_MULT, RAID_STAGGER,
} from '../src/content/balance';
import { createInitialState } from '../src/game/init';
import { deserialize, serialize } from '../src/game/save';
import { dist, v } from '../src/game/math';
import type { GameState } from '../src/game/state';
import { aBear, aStation, blankState } from './helpers';

const DT = 1 / 60;

function ticks(state: GameState, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) {
    bearsTick(state, DT);
    each?.();
  }
}

/** A camp with meat worth raiding and one bear parked well outside aggro range. */
function raidableCamp(over: Parameters<typeof aBear>[0] = {}): GameState {
  const state = blankState();
  state.player.pos = v(-40, -40); // far away: nothing here is about the player unless it says so
  state.depot.meat = 20;
  state.stations.push(aStation({ id: 'st-meat', resource: 'meat', pos: v(18, 11.5) }));
  state.bears.push(aBear({ pos: v(38, 0), home: v(38, 0), ...over }));
  return state;
}

describe('raid cadence', () => {
  it('wakes a bear near the camp once the interval is up', () => {
    const state = raidableCamp();
    ticks(state, RAID_INTERVAL - 1);
    expect(state.bears[0].state).toBe('sleep');
    ticks(state, 1.2);
    expect(state.bears[0].state).toBe('raiding');
  });

  it('raids an empty camp not at all, and a restocked one straight away', () => {
    const state = raidableCamp();
    state.depot.meat = 0;
    state.stations[0].stock = 0;
    ticks(state, RAID_INTERVAL * 3);
    expect(state.bears[0].state).toBe('sleep'); // nothing here a bear wants
    // The timer holds at the interval rather than resetting, so the first delivery that matters
    // draws a raider at once — the same rule the benches draw shoppers by.
    state.depot.meat = 8;
    ticks(state, 0.1);
    expect(state.bears[0].state).toBe('raiding');
  });

  it('leaves bears too far out, asleep behind a gate, or already busy alone', () => {
    const state = raidableCamp({ id: 'far', pos: v(120, 0), home: v(120, 0) });
    state.bears.push(aBear({ id: 'gated', zone: 'hunting', pos: v(40, 20), home: v(40, 20) }));
    ticks(state, RAID_INTERVAL * 2 + 2);
    expect(dist(state.bears[0].home, state.depotPos)).toBeGreaterThan(RAID_RECRUIT_RADIUS);
    expect(state.bears.every((b) => b.state === 'sleep')).toBe(true);
  });

  it('quickens mildly with the world and never past the floor', () => {
    expect(raidInterval(0)).toBe(RAID_INTERVAL);
    expect(raidInterval(3)).toBeLessThan(RAID_INTERVAL);
    expect(raidInterval(3)).toBeGreaterThan(RAID_INTERVAL / 2); // mildly
    expect(raidInterval(500)).toBe(RAID_INTERVAL_MIN);
  });

  it('sends a pack, not a single bear', () => {
    const state = raidableCamp();
    for (let i = 0; i < 8; i++) {
      state.bears.push(aBear({ id: `extra${i}`, pos: v(30 + i, 6), home: v(30 + i, 6) }));
    }
    ticks(state, RAID_INTERVAL + 0.5);
    const raiders = state.bears.filter((b) => b.state !== 'sleep');
    expect(raiders).toHaveLength(RAID_PACK_BASE);
  });

  it('grows the pack with the world, up to the cap', () => {
    expect(raidPackSize(0)).toBe(RAID_PACK_BASE);
    expect(raidPackSize(4)).toBe(RAID_PACK_BASE + 1);
    expect(raidPackSize(8)).toBe(RAID_PACK_BASE + 2);
    expect(raidPackSize(500)).toBe(RAID_PACK_MAX);
    // And the simulation actually fields the bigger pack.
    const state = raidableCamp();
    state.expansions = 8;
    for (let i = 0; i < 8; i++) {
      state.bears.push(aBear({ id: `extra${i}`, pos: v(30 + i, 6), home: v(30 + i, 6) }));
    }
    ticks(state, raidInterval(8) + 0.5);
    expect(state.bears.filter((b) => b.state !== 'sleep')).toHaveLength(raidPackSize(8));
  });

  it('staggers the pack so it breaks as a wave rather than setting off in lockstep', () => {
    const state = raidableCamp();
    for (let i = 0; i < 8; i++) {
      state.bears.push(aBear({ id: `extra${i}`, pos: v(30 + i, 6), home: v(30 + i, 6) }));
    }
    ticks(state, RAID_INTERVAL + 0.02);
    const delays = state.bears.filter((b) => b.state === 'raiding').map((b) => b.raidDelay).sort();
    expect(delays).toHaveLength(RAID_PACK_BASE);
    expect(delays[0]).toBeCloseTo(0, 1);                       // one sets off at once
    expect(delays[delays.length - 1]).toBeCloseTo(RAID_STAGGER * (RAID_PACK_BASE - 1), 1);

    // The held-back member really does hold: it is a raider that has not started walking.
    const waiting = state.bears.find((b) => b.raidDelay > 0.1)!;
    const where = { ...waiting.pos };
    ticks(state, 0.2);
    expect(waiting.pos).toEqual(where);
    ticks(state, RAID_STAGGER + 0.2);
    expect(waiting.pos).not.toEqual(where);
  });
});

describe('a raid', () => {
  it('walks to the depot and eats out of it', () => {
    const state = raidableCamp({ state: 'raiding' });
    ticks(state, 8); // 20 units at the charging pace is ~6.6 s
    const bear = state.bears[0];
    expect(bear.state).toBe('feeding');
    expect(dist(bear.pos, state.depotPos)).toBeLessThan(3);
    expect(state.depot.meat).toBeLessThan(20);
    expect(bear.eaten).toBeGreaterThan(0);
  });

  it('falls back to the meat bench when the depot is bare', () => {
    const state = raidableCamp({ state: 'raiding' });
    state.depot.meat = 0;
    state.stations[0].stock = 20;
    ticks(state, 9);
    expect(state.bears[0].state).toBe('feeding');
    expect(state.stations[0].stock).toBeLessThan(20);
    expect(state.depot.meat).toBe(0);
  });

  it('drains the depot first and only then the bench', () => {
    const state = raidableCamp({ state: 'raiding' });
    state.depot.meat = 2;
    state.stations[0].stock = 20;
    ticks(state, 20);
    expect(state.depot.meat).toBeCloseTo(0, 5);
    expect(state.stations[0].stock).toBeCloseTo(20 - (RAID_SATIETY - 2), 5);
  });

  it('leaves once it has eaten its fill, and goes back to sleep at home', () => {
    const state = raidableCamp({ state: 'raiding' });
    // In: 6.6 s charging. Eating: 5 s. Home: 8.9 s at the slower amble. Comfortably inside the
    // 24 s cadence, so the pack timer cannot send it back for seconds and confuse the count.
    ticks(state, 22);
    const bear = state.bears[0];
    expect(state.depot.meat).toBeCloseTo(20 - RAID_SATIETY, 5); // it took its five and no more
    expect(bear.state).toBe('sleep');
    expect(bear.pos).toEqual(bear.home);
    expect(bear.eaten).toBe(0);
  });

  it('gives up and goes home when the camp runs dry mid-meal', () => {
    const state = raidableCamp({ state: 'raiding' });
    state.depot.meat = 1;
    ticks(state, 10);
    expect(state.depot.meat).toBeCloseTo(0, 5);
    state.stations[0].stock = 0;
    ticks(state, 25);
    expect(state.bears[0].state).toBe('sleep');
  });

  it('turns on a player who walks up to it, and stops eating', () => {
    const state = raidableCamp({ state: 'raiding' });
    ticks(state, 8);
    expect(state.bears[0].state).toBe('feeding');
    const eatenBefore = state.bears[0].eaten;
    const leftBefore = state.depot.meat;
    state.player.pos = v(state.bears[0].pos.x + 1.6, state.bears[0].pos.z);
    ticks(state, 0.5);
    expect(state.bears[0].state).toBe('aggro');
    expect(state.bears[0].eaten).toBe(eatenBefore); // the meal is over
    expect(state.depot.meat).toBe(leftBefore);
  });

  it('charges the camp and ambles home, not the other way round', () => {
    const inbound = raidableCamp({ state: 'raiding' });
    const before = inbound.bears[0].pos.x;
    ticks(inbound, 1);
    const charge = before - inbound.bears[0].pos.x;
    expect(charge).toBeCloseTo(RAID_SPEED * RAID_SPEED_MULT, 1);

    // Sated, so its goal is home: same state, ordinary pace.
    const homeward = raidableCamp({ state: 'raiding', eaten: RAID_SATIETY, pos: v(28, 0) });
    const start = homeward.bears[0].pos.x;
    ticks(homeward, 1);
    expect(homeward.bears[0].pos.x - start).toBeCloseTo(RAID_SPEED, 1);
  });

  it('drops what it swallowed when it is killed', () => {
    const state = raidableCamp({ state: 'raiding' });
    ticks(state, 12);
    const bear = state.bears[0];
    const eaten = Math.floor(bear.eaten);
    expect(eaten).toBeGreaterThan(0);
    killBear(state, bear, { kind: 'ground' });
    expect(state.drops.filter((d) => d.kind === 'meat')).toHaveLength(BEAR_MEAT + eaten);
    expect(bear.eaten).toBe(0);
  });
});

describe('arrow stations', () => {
  const arrow = (over = {}) => ({
    id: 'arrow1', pos: v(0, 0), range: 15, cd: 0, active: true, output: 0,
    dropsOnGround: true, ...over,
  });

  it('drops its kills on the spot instead of banking them', () => {
    const state = blankState();
    state.turrets.push(arrow());
    state.bears.push(aBear({ pos: v(3, 0), state: 'feeding', eaten: 3 }));
    for (let t = 0; t < 4; t += DT) machinesTick(state, DT);
    expect(state.bears[0].state).toBe('dead');
    expect(state.turrets[0].output).toBe(0);              // no pile, no cart
    expect(state.drops).toHaveLength(BEAR_MEAT + 3);      // yield plus the stolen meat
    for (const d of state.drops) expect(dist(d.pos, v(3, 0))).toBeLessThan(1.5);
  });

  it('leaves the hunting turrets banking their output as before', () => {
    const state = blankState();
    state.turrets.push(arrow({ id: 'turret1', range: 10, dropsOnGround: undefined }));
    state.bears.push(aBear({ pos: v(3, 0) })); // asleep: a hunting turret takes it regardless
    for (let t = 0; t < 4; t += DT) machinesTick(state, DT);
    expect(state.turrets[0].output).toBe(BEAR_MEAT);
    expect(state.drops).toHaveLength(0);
  });

  it('shoots raiders and leaves sleeping bears alone', () => {
    const state = blankState();
    state.turrets.push(arrow());
    state.bears.push(aBear({ id: 'asleep', pos: v(3, 0) }));
    state.bears.push(aBear({ id: 'raider', pos: v(4, 0), state: 'raiding' }));
    for (let t = 0; t < 5; t += DT) machinesTick(state, DT);
    expect(state.bears.find((b) => b.id === 'raider')!.state).toBe('dead');
    expect(state.bears.find((b) => b.id === 'asleep')!.state).toBe('sleep');
    // The hunting turrets still take whatever walks into them, sleeping or not.
    const hunting = blankState();
    hunting.turrets.push(arrow({ id: 'turret1', dropsOnGround: undefined }));
    hunting.bears.push(aBear({ pos: v(3, 0) }));
    for (let t = 0; t < 5; t += DT) machinesTick(hunting, DT);
    expect(hunting.bears[0].state).toBe('dead');
  });

  it('reaches the depot from the fence line it stands on', () => {
    const state = createInitialState();
    for (const t of state.turrets.filter((x) => x.dropsOnGround)) {
      expect(dist(t.pos, state.depotPos)).toBeLessThan(t.range);
    }
    // And between them they cover the whole compound, wherever a raider gets to.
    const stands = state.stations.map((s) => s.pos);
    for (const spot of [state.depotPos, ...stands]) {
      const covering = state.turrets.filter(
        (t) => t.dropsOnGround && dist(t.pos, spot) <= t.range,
      );
      expect(covering.length).toBeGreaterThan(0);
    }
  });
});

describe('raids and the save', () => {
  it('reverts a raider to sleep on load, losing only the raid in progress', () => {
    const state = createInitialState();
    state.depot.meat = 30;
    const bear = state.bears.find((b) => dist(b.home, state.depotPos) < RAID_RECRUIT_RADIUS)!;
    bear.state = 'feeding';
    bear.eaten = 3;
    const loaded = deserialize(serialize(state));
    expect(loaded.bears.every((b) => b.state === 'sleep')).toBe(true);
    expect(loaded.bears.every((b) => b.eaten === 0)).toBe(true);
    expect(loaded.raidTimer).toBe(0);
    // The meat that was already eaten stays eaten: the depot is saved as it stands.
    expect(loaded.depot.meat).toBe(30);
  });
});
