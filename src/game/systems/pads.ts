import { PAD_RANGE, PAY_RATE } from '../../content/balance';
import { dist, v } from '../math';
import type { GameState, Pad } from '../state';

export function padAvailable(state: GameState, pad: Pad): boolean {
  if (pad.done) return false;
  if (pad.requires && !state.pads.find((p) => p.id === pad.requires)?.done) return false;
  return true;
}

function balanceOf(state: GameState, pad: Pad): number {
  return pad.currency === 'cash' ? state.player.cash : state.player.carry[pad.currency];
}

function deduct(state: GameState, pad: Pad, amount: number): void {
  if (pad.currency === 'cash') state.player.cash -= amount;
  else state.player.carry[pad.currency] -= amount;
}

export function applyEffect(state: GameState, pad: Pad): void {
  const e = pad.effect;
  if (e.type === 'tool') state.player.tool = e.tool;
  else if (e.type === 'pickaxe') state.player.hasPickaxe = true;
  else if (e.type === 'gate') state.zonesOpen[e.zone] = true;
  else if (e.type === 'speed') state.player.speed *= e.mult;
  else if (e.type === 'carry') state.player.carryCap += e.add;
  else {
    const t = state.turrets.find((m) => m.id === e.machineId);
    if (t) t.active = true;
    const s = state.sawmills.find((m) => m.id === e.machineId);
    if (s) s.active = true;
  }
}

export function padsTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const pad of state.pads) {
    if (!padAvailable(state, pad)) continue;
    if (dist(p.pos, pad.pos) >= PAD_RANGE) continue;
    const want = Math.min(PAY_RATE * dt, pad.cost - pad.paid);
    const pay = Math.min(want, balanceOf(state, pad));
    if (pay <= 0) continue;
    deduct(state, pad, pay);
    pad.paid += pay;
    if (pad.paid >= pad.cost - 1e-9) {
      pad.paid = pad.cost;
      pad.done = true;
      applyEffect(state, pad);
      state.events.push({ type: 'unlock', pos: v(pad.pos.x, pad.pos.z) });
    }
  }
}
