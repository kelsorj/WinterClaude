import { describe, expect, it } from 'vitest';
import { padAvailable, padsTick } from '../src/game/systems/pads';
import { EXPEDITION_BASE, PAY_RATE, TARGET_PAY_SECONDS } from '../src/content/balance';
import { worldBounds } from '../src/content/map';
import { v } from '../src/game/math';
import { aPad, blankState } from './helpers';

function ticks(state: ReturnType<typeof blankState>, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) padsTick(state, dt);
}

describe('padsTick', () => {
  it('streams cash into a nearby pad and applies the unlock', () => {
    const state = blankState();
    state.pads.push(aPad()); // cost 10 cash → axe
    state.player.cash = 25;
    ticks(state, 1); // 12/s → done within 1s
    expect(state.pads[0].done).toBe(true);
    expect(state.player.tool).toBe('axe');
    expect(state.player.cash).toBeCloseTo(15);
    expect(state.events.some((e) => e.type === 'unlock')).toBe(true);
  });

  it('pauses when the player leaves and resumes later', () => {
    const state = blankState();
    state.pads.push(aPad());
    state.player.cash = 5;
    ticks(state, 1); // pays all 5, then stalls broke
    expect(state.pads[0].done).toBe(false);
    expect(state.pads[0].paid).toBeCloseTo(5);
    expect(state.player.cash).toBeCloseTo(0);
    state.player.cash = 10;
    ticks(state, 1);
    expect(state.pads[0].done).toBe(true);
  });

  it('pays with resources when the pad price is a resource', () => {
    const state = blankState();
    state.pads.push(aPad({ currency: 'wood', cost: 5, effect: { type: 'gate', zone: 'deepforest' } }));
    state.player.carry.wood = 8;
    ticks(state, 1);
    expect(state.zonesOpen.deepforest).toBe(true);
    expect(state.player.carry.wood).toBeCloseTo(3);
  });

  it('honors the requires chain', () => {
    const state = blankState();
    state.pads.push(aPad({ id: 'first', done: false }));
    state.pads.push(aPad({ id: 'second', requires: 'first', effect: { type: 'carry', add: 12 } }));
    expect(padAvailable(state, state.pads[1])).toBe(false);
    state.player.cash = 100;
    ticks(state, 1); // only 'first' can accept payment
    expect(state.pads[0].done).toBe(true);
    expect(padAvailable(state, state.pads[1])).toBe(true);
    ticks(state, 1);
    expect(state.player.carryCap).toBe(24);
  });

  it('activates machines', () => {
    const state = blankState();
    state.turrets.push({ id: 'turret1', pos: v(5, 5), range: 10, cd: 0, active: false, output: 0 });
    state.pads.push(aPad({ effect: { type: 'machine', machineId: 'turret1' } }));
    state.player.cash = 20;
    ticks(state, 1);
    expect(state.turrets[0].active).toBe(true);
  });

  it('raises the camp tier and never lowers it', () => {
    const state = blankState();
    state.pads.push(aPad({ id: 'c3', effect: { type: 'camp', tier: 3 } }));
    state.player.cash = 40;
    ticks(state, 1);
    expect(state.campTier).toBe(3);

    state.pads.push(aPad({ id: 'c1', pos: v(0, 1), effect: { type: 'camp', tier: 1 } }));
    ticks(state, 1);
    expect(state.pads[1].done).toBe(true);
    expect(state.campTier).toBe(3); // an out-of-order lower tier must not demote the camp
  });

  it('applies speed multiplier', () => {
    const state = blankState();
    state.pads.push(aPad({ effect: { type: 'speed', mult: 1.3 } }));
    state.player.cash = 20;
    ticks(state, 1);
    expect(state.player.speed).toBeCloseTo(7.8);
  });

  it('applies pickaxe', () => {
    const state = blankState();
    state.pads.push(aPad({ effect: { type: 'pickaxe' } }));
    state.player.cash = 20;
    ticks(state, 1);
    expect(state.player.hasPickaxe).toBe(true);
  });

  it('applies the distributor, putting the fort crew to work', () => {
    const state = blankState();
    state.pads.push(aPad({ effect: { type: 'distributor' } }));
    state.player.cash = 20;
    expect(state.distributorActive).toBe(false);
    ticks(state, 1);
    expect(state.distributorActive).toBe(true);
  });

  it('never overpays past the cost', () => {
    const state = blankState();
    state.pads.push(aPad());
    state.player.cash = 100;
    ticks(state, 5);
    expect(state.player.cash).toBeCloseTo(90);
    expect(state.pads[0].paid).toBe(10);
  });

  it('resource payments stay in whole units', () => {
    const state = blankState();
    state.pads.push(aPad({ currency: 'wood', cost: 5, effect: { type: 'carry', add: 12 } }));
    state.player.carry.wood = 8;
    for (let i = 0; i < 20; i++) padsTick(state, 1 / 60);
    expect(Number.isInteger(state.player.carry.wood)).toBe(true);
    expect(state.pads[0].paid + state.player.carry.wood).toBe(8);
  });

  it('does not bank charge while the player is broke', () => {
    const state = blankState();
    state.pads.push(aPad({ currency: 'wood', cost: 12, effect: { type: 'carry', add: 12 } }));
    for (let i = 0; i < 60; i++) padsTick(state, 1 / 60); // a broke second on the pad
    state.player.carry.wood = 12;
    padsTick(state, 1 / 60);
    expect(state.pads[0].paid).toBeLessThanOrEqual(1);
  });

  /**
   * The expedition's price grows exponentially. Against a flat 12/s that would have turned into
   * exponential standing still — the sixteenth ring is ~230,000 cash, i.e. over five hours on
   * the pad. The stream scales with the price instead, so what gates an expensive pad is having
   * the money, not holding a key down.
   */
  it('fills an expensive pad in bounded time rather than at a flat rate', () => {
    const state = blankState();
    state.pads.push(aPad({ cost: 100_000, effect: { type: 'expedition' } }));
    state.player.cash = 100_000;
    ticks(state, TARGET_PAY_SECONDS + 1);
    expect(state.pads[0].done).toBe(true);
    expect(state.player.cash).toBeCloseTo(0);
  });

  it('leaves the campaign\'s own pads on the flat rate', () => {
    // Every campaign pad is priced under PAY_RATE × TARGET_PAY_SECONDS, so none of them changes
    // pace: the scaling only ever kicks in above 300.
    for (const cost of [10, 30, 100, 300]) {
      const state = blankState();
      state.pads.push(aPad({ cost }));
      state.player.cash = cost;
      ticks(state, cost / PAY_RATE - 0.05);
      expect(state.pads[0].done).toBe(false); // not one tick faster than the flat rate
      ticks(state, 0.2);
      expect(state.pads[0].done).toBe(true);
    }
  });

  it('leaves cash dust-free after completing a cash pad', () => {
    const state = blankState();
    state.pads.push(aPad()); // cost 10
    state.player.cash = 100;
    for (let i = 0; i < 120; i++) padsTick(state, 1 / 60);
    expect(state.player.cash).toBe(90);
  });
});

/** The expedition pad — the one pad that is never finished with (Amendment 5B). */
describe('repeatable pads', () => {
  const expeditionPad = () =>
    aPad({ id: 'p-expedition', cost: EXPEDITION_BASE, effect: { type: 'expedition' }, repeat: true });

  it('empties and re-arms at the next price instead of completing', () => {
    const state = blankState();
    state.pads.push(expeditionPad());
    state.player.cash = 200;
    ticks(state, 20);

    const pad = state.pads[0];
    expect(pad.done).toBe(false);          // never done, so never off the map
    expect(padAvailable(state, pad)).toBe(true);
    expect(pad.paid).toBe(0);              // and empty, ready for the next round
    expect(pad.cost).toBe(320);
    expect(state.expansions).toBe(1);
    expect(state.player.cash).toBe(0);
  });

  it('escalates 200 → 320 → 512 across three expeditions', () => {
    const state = blankState();
    state.pads.push(expeditionPad());
    const prices: number[] = [];
    for (let i = 0; i < 3; i++) {
      prices.push(state.pads[0].cost);
      state.player.cash = state.pads[0].cost;
      ticks(state, 60);
    }
    expect(prices).toEqual([200, 320, 512]);
    expect(state.expansions).toBe(3);
    expect(state.pads[0].cost).toBe(819);
  });

  it('grows the world and seeds it on every purchase', () => {
    const state = blankState();
    state.pads.push(expeditionPad());
    expect(state.trees).toHaveLength(0);

    state.player.cash = 200;
    ticks(state, 20);
    const afterFirst = state.trees.length;
    expect(afterFirst).toBeGreaterThan(300);
    expect(state.bears.length).toBeGreaterThanOrEqual(12);
    expect(state.seams.length).toBeGreaterThanOrEqual(3);
    // The new country is beyond the old border, which has itself moved out.
    expect(worldBounds(state.expansions).x1).toBeGreaterThan(worldBounds(0).x1);

    state.player.cash = 320;
    ticks(state, 40);
    expect(state.expansions).toBe(2);
    expect(state.trees.length).toBeGreaterThan(afterFirst);
  });

  it('announces each expedition, so the fanfare fires every time', () => {
    const state = blankState();
    state.pads.push(expeditionPad());
    state.player.cash = 520;
    ticks(state, 60);
    expect(state.events.filter((e) => e.type === 'unlock')).toHaveLength(2);
  });
});
