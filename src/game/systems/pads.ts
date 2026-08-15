import { PAD_RANGE, PAY_RATE } from '../../content/balance';
import { dist, v } from '../math';
import type { GameState, Pad } from '../state';

export function padAvailable(state: GameState, pad: Pad): boolean {
  if (pad.done) return false;
  if (pad.requires && !state.pads.find((p) => p.id === pad.requires)?.done) return false;
  return true;
}

function deduct(state: GameState, pad: Pad, amount: number): void {
  if (pad.currency === 'cash') state.player.cash -= amount;
  else state.player.carry[pad.currency] -= amount;
}

export function activateMachine(state: GameState, machineId: string): void {
  const t = state.turrets.find((m) => m.id === machineId);
  if (t) t.active = true;
  const s = state.sawmills.find((m) => m.id === machineId);
  if (s) s.active = true;
}

/** Applied exactly once, when a pad completes. Never replay on save-load — deserialize restores player fields verbatim instead. */
export function applyEffect(state: GameState, pad: Pad): void {
  const e = pad.effect;
  if (e.type === 'tool') state.player.tool = e.tool;
  else if (e.type === 'pickaxe') state.player.hasPickaxe = true;
  else if (e.type === 'gate') state.zonesOpen[e.zone] = true;
  else if (e.type === 'speed') state.player.speed *= e.mult;
  else if (e.type === 'carry') state.player.carryCap += e.add;
  else if (e.type === 'camp') state.campTier = Math.max(state.campTier, e.tier);
  else activateMachine(state, e.machineId);
}

export function padsTick(state: GameState, dt: number): void {
  const p = state.player;
  for (const pad of state.pads) {
    if (!padAvailable(state, pad)) continue;
    if (dist(p.pos, pad.pos) >= PAD_RANGE) { pad.payTimer = 0; continue; }
    let pay: number;
    if (pad.currency === 'cash') {
      const want = Math.min(PAY_RATE * dt, pad.cost - pad.paid);
      pay = Math.min(want, state.player.cash);
    } else {
      pad.payTimer += PAY_RATE * dt;
      if (state.player.carry[pad.currency] <= 0) { pad.payTimer = 0; continue; }
      pay = Math.min(Math.floor(pad.payTimer), pad.cost - pad.paid, state.player.carry[pad.currency]);
      if (pay > 0) pad.payTimer -= pay;
    }
    if (pay <= 0) continue;
    deduct(state, pad, pay);
    pad.paid += pay;
    if (pad.paid >= pad.cost - 1e-9) {
      pad.paid = pad.cost;
      pad.done = true;
      applyEffect(state, pad);
      // Clear float dust from fractional cash streaming so the HUD's floor() shows the true total.
      state.player.cash = Math.round(state.player.cash * 1e6) / 1e6;
      state.events.push({ type: 'unlock', pos: v(pad.pos.x, pad.pos.z) });
    }
  }
}
