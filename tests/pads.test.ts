import { describe, expect, it } from 'vitest';
import { padAvailable, padsTick } from '../src/game/systems/pads';
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

  it('leaves cash dust-free after completing a cash pad', () => {
    const state = blankState();
    state.pads.push(aPad()); // cost 10
    state.player.cash = 100;
    for (let i = 0; i < 120; i++) padsTick(state, 1 / 60);
    expect(state.player.cash).toBe(90);
  });
});
