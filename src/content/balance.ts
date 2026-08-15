import type { ResourceKind, ToolId } from '../game/state';

export const TOOLS: Record<ToolId, { chopDmg: number; atkDmg: number; period: number; range: number; aoe: boolean }> = {
  hatchet: { chopDmg: 1, atkDmg: 1, period: 0.6, range: 1.8, aoe: false },
  axe:     { chopDmg: 2, atkDmg: 2, period: 0.45, range: 2.0, aoe: false },
  scythe:  { chopDmg: 2, atkDmg: 3, period: 0.35, range: 2.8, aoe: true },
};

export const SELL_RATE: Record<ResourceKind, number> = { wood: 2, meat: 3, gold: 10 };

export const PLAYER_BASE_SPEED = 6;
export const CARRY_BASE = 12;

export const PICKUP_RADIUS = 1.6;
export const MAGNET_RADIUS = 3.5;
export const MAGNET_SPEED = 8;

export const DEPOSIT_RATE = 8;   // items per second into sell stations
export const PAY_RATE = 12;      // currency per second into unlock pads
export const STATION_RANGE = 2.2;
export const PAD_RANGE = 1.8;

export const TREE_HP = 3;
export const TREE_YIELD = 2;
export const TREE_RESPAWN = 20;

export const SEAM_HP = 4;
export const SEAM_YIELD = 1;
export const SEAM_RESPAWN = 25;

export const BEAR_HP = 6;
export const BEAR_MEAT = 3;
export const BEAR_RESPAWN = 30;
export const BEAR_SPEED = 3.4;
export const BEAR_ATTACK_RANGE = 1.4;
export const BEAR_ATTACK_CD = 1.0;
export const BEAR_KNOCKBACK = 10;
export const BEAR_LEASH = 14;

export const TURRET_DMG = 2;
export const TURRET_PERIOD = 1.2;
export const SAWMILL_PERIOD = 4;

export const CART_SPEED = 5;
export const CART_CAP = 6;

export const VILLAGER_SPEED = 3;
export const VILLAGER_RANGE = 1.8;
export const HAUL_AMOUNT = 3;

/** Meat cost to thaw the next villager: 2,2,…,6 across the 40 rescues. */
export function thawCost(rescued: number): number {
  return 2 + Math.floor(rescued / 8);
}
