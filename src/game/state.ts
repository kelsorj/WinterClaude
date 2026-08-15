import type { Vec2 } from './math';

export type ResourceKind = 'wood' | 'meat' | 'gold';
export type Currency = ResourceKind | 'cash';
export type ToolId = 'hatchet' | 'axe' | 'scythe';
export type ZoneId = 'start' | 'deepforest' | 'hunting' | 'quarry';
/** Zones that begin sealed behind a gate — 'start' is always open, so it has no rect or wall. */
export type GateZone = Exclude<ZoneId, 'start'>;

export interface Player {
  pos: Vec2;
  facing: Vec2;
  speed: number;
  tool: ToolId;
  hasPickaxe: boolean;
  carry: Record<ResourceKind, number>;
  carryCap: number;
  cash: number;
  swingTimer: number;
  knockback: Vec2;
}

// For trees: any value > 0 means permanently felled (no countdown); seams still count down.
export interface Tree { id: string; zone: ZoneId; pos: Vec2; hp: number; respawn: number }
export interface GoldSeam { id: string; zone: ZoneId; pos: Vec2; hp: number; respawn: number }

/**
 * 'raiding' and 'feeding' are the camp raid (Amendment 6B): a raider walks in for the meat,
 * feeds where it finds it, and once sated walks home and goes back to sleep. Both are transient —
 * bears are never serialized (they are rebuilt from the map and the ring replay), so a save taken
 * mid-raid restores every bear asleep at home. That is an accepted loss: the meat already eaten
 * stays eaten, and the raid simply starts again on the next timer.
 */
export type BearState = 'sleep' | 'aggro' | 'dead' | 'raiding' | 'feeding';
export interface Bear {
  id: string; zone: ZoneId; pos: Vec2; home: Vec2;
  hp: number; maxHp: number; state: BearState; respawn: number; attackCd: number;
  /** Meat eaten on the current raid. Killing a raider drops this on top of the usual yield. */
  eaten: number;
  /**
   * Seconds this raider still waits at home before setting off. A raid recruits a pack at once
   * and staggers it here, so the bears break over the fence as a loose wave instead of setting
   * out in lockstep and walking the whole way superimposed on one another.
   */
  raidDelay: number;
}

export interface Drop { id: string; kind: Currency; amount: number; pos: Vec2 }

export interface SellStation {
  id: string; resource: ResourceKind; pos: Vec2; matPos: Vec2; matCash: number; timer: number;
  /** Goods waiting on the bench for customers to buy. Deposits add here; sales drain it. */
  stock: number;
  /** Seconds since this bench last drew a shopper. Transient — never saved. */
  spawnTimer: number;
}

/**
 * A shopper walking in off the road to buy from one bench: queue up, take up to
 * `CUSTOMER_TAKE` goods off its stock, leave the cash on the mat, walk back off the map.
 * Customers are transient — they are never saved.
 */
export type CustomerState = 'arriving' | 'queued' | 'buying' | 'leaving';
export interface Customer {
  id: string; stationId: string; pos: Vec2; state: CustomerState;
  /** Place in the bench's line; 0 stands at the counter. Ignored once leaving. */
  slot: number;
  /** Remaining waypoints, walked in order. Drives 'arriving' and 'leaving'; queueing steers by slot. */
  path: Vec2[];
  /** Seconds spent at the counter so far; the sale lands once it reaches `CUSTOMER_DWELL`. */
  timer: number;
  /** How much this shopper bought, so the renderer can hand it something to carry home. */
  bought: number;
}

export type UnlockEffect =
  | { type: 'tool'; tool: ToolId }
  | { type: 'pickaxe' }
  | { type: 'gate'; zone: ZoneId }
  | { type: 'machine'; machineId: string }
  | { type: 'speed'; mult: number }
  | { type: 'carry'; add: number }
  | { type: 'camp'; tier: number }
  | { type: 'distributor' }
  | { type: 'expedition' };

export interface Pad {
  id: string; pos: Vec2; currency: Currency; cost: number;
  paid: number; done: boolean; effect: UnlockEffect; requires?: string;
  payTimer: number;
  /**
   * A repeatable pad never completes (Amendment 5B): on payment it applies its effect, then
   * empties itself and raises its own price for the next round. Only the expedition pad is one.
   */
  repeat?: boolean;
}

export interface Turret {
  id: string; pos: Vec2; range: number; cd: number; active: boolean; output: number;
  /**
   * Arrow stations on the compound perimeter (Amendment 6B) drop their kills where the bear
   * fell instead of banking them: they defend the camp rather than farming it, and they have no
   * rail or cart to carry an output pile away. The hunting turrets out east leave this unset.
   */
  dropsOnGround?: boolean;
}
export interface Sawmill { id: string; pos: Vec2; radius: number; timer: number; active: boolean; output: number }

export interface Rail { id: string; points: Vec2[]; sourceType: 'turret' | 'sawmill'; sourceId: string }
export interface Cart { id: string; railId: string; s: number; dir: 1 | -1; load: number; cap: number }

/**
 * The fort's staff — present from the first frame, idle at their posts until the camp earns
 * them: 'crew' are the hand-off team the distributor pad hires (Amendment 2B), 'miner' the gold
 * crew the Grand Fort brings with it (Amendment 3A). Since Amendment 4C these are the only
 * villagers there are: the snowfield of frozen villagers, and rescuing them, is gone.
 */
export type VillagerKind = 'crew' | 'miner';
export interface Villager {
  id: string; kind: VillagerKind; pos: Vec2;
  carrying: ResourceKind | null; amount: number;
  /** Miners only: the seam this one has claimed, so no two ever work the same rock. */
  target: string | null;
  /**
   * Haulers only: index into the depot's resource rotation of the pile this carrier last loaded.
   * The next trip resumes scanning at the pile AFTER it, which is what spreads a crew's trips
   * across every pile instead of all of them mobbing the biggest one (Amendment 4B).
   */
  rotation: number;
}

export type GameEvent =
  | { type: 'chop'; pos: Vec2 }
  | { type: 'treeFall'; pos: Vec2 }
  | { type: 'pickup'; pos: Vec2 }
  | { type: 'deposit'; pos: Vec2 }
  | { type: 'sell'; pos: Vec2; cash: number }
  | { type: 'unlock'; pos: Vec2 }
  | { type: 'bearHit'; pos: Vec2 }
  | { type: 'playerHit'; pos: Vec2 };

export interface GameState {
  time: number;
  player: Player;
  trees: Tree[];
  seams: GoldSeam[];
  bears: Bear[];
  drops: Drop[];
  pads: Pad[];
  stations: SellStation[];
  customers: Customer[];
  turrets: Turret[];
  sawmills: Sawmill[];
  rails: Rail[];
  carts: Cart[];
  depot: Record<ResourceKind, number>;
  depotPos: Vec2;
  /** Fractional goods accrued toward the next whole unit of a player withdrawal. Transient. */
  depotTimer: number;
  villagers: Villager[];
  /** Highest camp building tier bought (0 = bare clearing, 4 = grand fort). */
  campTier: number;
  /** Whether the fort's hand-off crew has been hired; derived from the distributor pad on load. */
  distributorActive: boolean;
  zonesOpen: Record<ZoneId, boolean>;
  /**
   * Seconds since the last ambient raid was triggered (Amendment 6B). Transient — never saved,
   * so a reloaded camp gets a full interval's grace before the next bear comes calling.
   */
  raidTimer: number;
  /**
   * How many expedition rings have been bought (Amendment 5B). This one number is the whole of
   * the world's size: `worldBounds(expansions)` is the walkable rect, and each ring's content is
   * regenerated deterministically from its index rather than saved.
   */
  expansions: number;
  /**
   * Lifetime totals. Since Amendment 5A there is no ending for these to be the epitaph of — the
   * game is an infinite sandbox — so they are simply a running record, shown in the pause menu.
   */
  stats: { chops: number; bearsKilled: number; earned: number };
  events: GameEvent[];
  nextDropId: number;
  nextCustomerId: number;
}
