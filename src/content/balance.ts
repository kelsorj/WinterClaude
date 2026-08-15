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

/**
 * Ceiling on how long a cash pad can take to fill, in seconds of standing on it. A cash pad
 * streams at `max(PAY_RATE, cost / TARGET_PAY_SECONDS)`, so the campaign's small pads are
 * untouched (anything under 300 still runs at the flat `PAY_RATE`) while the expedition's
 * exponential price cannot turn into exponential standing still — at a flat 12/s the sixteenth
 * ring would be five hours of holding a key down.
 *
 * The gate on an expensive pad is meant to be HAVING the cash, which is the shop economy doing
 * its job; the pad itself is a till, and no till should take longer than this to count out.
 * Resource-priced pads keep the flat rate: they pay in whole units off a 12-48 item pack, so
 * they are all small by construction and a faster stream would just empty the pack in one gulp.
 */
export const TARGET_PAY_SECONDS = 25;
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
 * Spec allows 2–4. It went to the top of the range to pay for thawing forty villagers; that meat
 * sink is gone with the snowfield (Amendment 4C) and meat is now a pure commodity, but the value
 * stays at 4 because the rest of the campaign is balanced against it — the hunting gate costs 20
 * meat and the meat bench's shopper income is priced off this yield. Trimming it would be a
 * re-tune of the whole meat economy, not a tidy-up.
 */
export const BEAR_MEAT = 4;
export const BEAR_RESPAWN = 30;
export const BEAR_SPEED = 3.4;
export const BEAR_ATTACK_RANGE = 1.4;
export const BEAR_ATTACK_CD = 1.0;
export const BEAR_KNOCKBACK = 10;
export const BEAR_LEASH = 14;

/**
 * Bear raids (Amendment 6B). Bears want the meat, so the camp's stockpile is a standing
 * invitation: every so often one wilderness bear near the camp wakes up and walks in for it.
 *
 * Raids come in PACKS, on a cadence of `RAID_INTERVAL`. One bear every forty seconds read as a
 * nuisance rather than a siege, so the unit of a raid is a pack of `RAID_PACK_BASE` and the
 * cadence is 24 s. At `RAID_SATIETY` 5 and `RAID_FEED_RATE` 1/s that is 10 meat per raid and
 * 25 a minute out of an undefended camp — a real bite out of a meat pipeline that turns over a
 * few hundred, and a straight answer to "why would I buy arrow stations". It is still only a
 * tax: there is no lose state, and the worst outcome is eaten meat.
 *
 * Both the pack and the cadence scale with the world (more wilderness, more bears), the pack in
 * whole bears every four expeditions and the cadence mildly and never past `RAID_INTERVAL_MIN`.
 * The caps matter: without them a camp fifteen expeditions deep would be under permanent siege by
 * arithmetic rather than by design, and the shape the numbers are tuned to is that two stations
 * hold ring 0 and all four are wanted by the middle rings.
 *
 * `RAID_STAGGER` is the delay between pack members setting off. It is deliberately short — the
 * pack should break over the fence as a loose wave, not file in one bear at a time — and it is
 * what stops five bears walking the same line superimposed on each other.
 *
 * `RAID_RECRUIT_RADIUS` is how far out a raider can be drawn from. It reaches well past the
 * starter map into the wilderness packs, so raids keep coming once the near bears are dead or
 * sated, but not so far that a bear spends five minutes walking in from the edge of the world.
 */
export const RAID_INTERVAL = 24;
export const RAID_INTERVAL_MIN = 15;
export const RAID_INTERVAL_PER_RING = 0.12;
export const RAID_PACK_BASE = 2;
export const RAID_PACK_PER_RINGS = 4;
export const RAID_PACK_MAX = 5;
export const RAID_STAGGER = 0.7;
export const RAID_RECRUIT_RADIUS = 80;
export const RAID_SATIETY = 5;
export const RAID_FEED_RATE = 1;
/**
 * A bear's raid pace. The base is two thirds of a chase — a bear crossing open country is not
 * sprinting — but a raider with the camp in front of it hustles: `RAID_SPEED_MULT` applies only
 * while it is walking IN. A sated bear ambling home does it at the base pace, which is what makes
 * an arriving wave and a departing one read differently from across the map.
 */
export const RAID_SPEED = BEAR_SPEED * 0.66;
export const RAID_SPEED_MULT = 1.35;
/** How close a raider must get to the depot or a bench before it starts eating. */
export const RAID_FEED_RANGE = 2.4;
/** A raider this close to the player turns on them, interrupting a meal. */
export const RAID_AGGRO_RANGE = 3.6;
/** How close to its home a sated raider must get before it settles back down to sleep. */
export const RAID_HOME_RANGE = 1.5;

export const TURRET_DMG = 2;
export const TURRET_PERIOD = 1.2;
export const SAWMILL_PERIOD = 4;

export const CART_SPEED = 5;
export const CART_CAP = 6;

export const VILLAGER_SPEED = 3;
export const HAUL_AMOUNT = 3;

/**
 * The rotation a carrier walks around the depot, one pile per trip (Amendment 4B). Order is
 * arbitrary — what matters is that it is fixed, so a carrier resuming at the pile after the one
 * it last took visits every pile in turn rather than mobbing the biggest.
 */
export const HAUL_ORDER: ResourceKind[] = ['wood', 'meat', 'gold'];

/**
 * Grand Fort miners (Amendment 3A). They work a seam far slower than the player does with a
 * pickaxe (an axe swing lands 2 damage every 0.45 s, i.e. ~4.4/s) — at 1 hp/s a seam takes
 * `SEAM_HP` = 4 seconds, the "a few seconds" the amendment asks for.
 *
 * What actually paces the gold pipeline is the WALK, not `SEAM_RESPAWN`. A miner's round trip is
 * camp → nearest seam → camp: the quarry seams sit 55-75 units from the depot, so at
 * `VILLAGER_SPEED` 3 that is 36-54 s of walking against 4 s of mining, and two miners measure out
 * at roughly 2.6 gold/minute between them. The 25 s respawn never binds — by the time a miner is
 * back at the rock it has long since regrown. Speeding the drain up would not move the throughput;
 * only shortening the trip or hiring more miners would.
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

/**
 * The expedition pad (Amendment 5B) — the one repeatable pad, and the only thing late-game cash
 * has left to buy once the eighteen campaign unlocks are done.
 *
 * 200 is roughly a Grand Fort's worth of shop takings, so the first expedition lands as the
 * natural thing to do after the campaign rather than a grind alongside it. The 1.6 escalation
 * (200 → 320 → 512 → 819 → 1310 …) outruns any fixed income: the benches sell faster as the camp
 * grows, but not exponentially, so each ring is a longer haul than the last and the pad never
 * becomes free money. Both are data — the pad's price is `cost × GROWTH` rounded, applied per
 * completion, and replayed from the expansion count on load.
 */
export const EXPEDITION_BASE = 200;
export const EXPEDITION_GROWTH = 1.6;

/**
 * Hard ceiling on the ring count a save may claim. Loading replays `applyExpansion` once per
 * ring, so a corrupt or hand-edited `expansions` would otherwise hang the load generating
 * millions of trees. 200 rings is a 12,000-unit-wide world — far past anything reachable by
 * play — so the clamp can only ever fire on a broken save.
 */
export const EXPANSIONS_MAX = 200;
