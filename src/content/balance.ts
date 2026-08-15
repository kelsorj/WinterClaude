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

/**
 * Player depot withdrawal (Amendment 4A). Standing by the depot streams goods back OUT of it at
 * the same `DEPOSIT_RATE` they go in, so the fort reads as a two-way counter rather than a hole.
 *
 * `DEPOT_RANGE` is a shade wider than `STATION_RANGE` because the depot's stockpiles move around
 * the yard as the camp grows through its five tiers, so the pickup spot has to be generous
 * enough to cover the pile wherever that tier parked it.
 *
 * `WITHDRAW_PAUSE` is the fraction of `carryCap` at which withdrawal stops. The player walks
 * through the fort on the way to the benches and the pads, and a depot that topped them up on
 * every pass would fight that: a pack over 80% full is one on its way somewhere to be emptied,
 * so the counter leaves it alone. Below that there is room for a useful haul (at the base cap of
 * 12 that is a 2-item margin, at the upgraded 48 a 9-item one) and topping up is what the player
 * came over for.
 */
export const DEPOT_RANGE = 2.5;
export const WITHDRAW_PAUSE = 0.8;

export const TREE_HP = 3;
export const TREE_YIELD = 2;

export const SEAM_HP = 4;
export const SEAM_YIELD = 1;
export const SEAM_RESPAWN = 25;

export const BEAR_HP = 6;
/**
 * Spec allows 2–4. Sits at the top of the range because thawing all 40 villagers costs 160 meat
 * that only the player's own kills can supply: at 3 that is 54 bear kills against a 30 s respawn,
 * which measured as an 11-minute endgame with nothing left to unlock. At 4 it is 40 kills.
 */
export const BEAR_MEAT = 4;
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

/**
 * Grand Fort miners (Amendment 3A). They work a seam far slower than the player does with a
 * pickaxe (an axe swing lands 2 damage every 0.45 s, i.e. ~4.4/s) — at 1 hp/s a seam takes
 * `SEAM_HP` = 4 seconds, the "a few seconds" the amendment asks for, and two miners against a
 * 25 s seam respawn keep the gold pipeline trickling rather than flooding it.
 */
export const MINER_CAMP_TIER = 4;
export const MINER_DRAIN = 1;
export const MINER_RANGE = 1.6;

/**
 * Shop customers (Amendment 2A). Benches no longer mint cash on deposit: they hold stock, and
 * these numbers set how fast a line of buyers converts it.
 *
 * The cap covers everyone committed to a bench — standing in its line AND still walking in.
 * It does NOT set throughput: as long as the line is never empty, a bench serves one shopper per
 * `DWELL + SPACING / SPEED ≈ 1.06 s` whatever the cap is, so a stocked bench sells about
 * `TAKE / 1.06 ≈ 2.8` goods per second. That outruns anything the player can gather or the
 * machines can feed the depot, while still leaving a backlog on the bubble — the ad's
 * counting-down bench label.
 *
 * What the cap buys is on-screen POPULATION, which is what the amendment is really about: a
 * bench carries up to `CAP` walking in or waiting, plus the ~12 it has already served and sent
 * back down the 50-unit road (a 12 s walk at one departure per 1.06 s), so the map holds roughly
 * `stations × (CAP + 12)` shoppers. The amendment's ~6 was tried first and looks wrong: with a
 * 12-second walk-in, shoppers reach the counter slower than the counter serves them, so no line
 * ever forms. At 12 the road carries a single-file stream (0.6 s apart is ~2.5 units of spacing)
 * and 4-6 shoppers stand waiting at a busy bench, matching the reference frames.
 */
export const CUSTOMER_INTERVAL = 0.6;
export const CUSTOMER_QUEUE_CAP = 12;
export const CUSTOMER_SPEED = 4.2;
export const CUSTOMER_DWELL = 0.8;
export const CUSTOMER_TAKE = 3;

/** Meat cost to thaw the next villager: 2,2,…,6 across the 40 rescues. */
export function thawCost(rescued: number): number {
  return 2 + Math.floor(rescued / 8);
}
