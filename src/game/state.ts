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

export type BearState = 'sleep' | 'aggro' | 'dead';
export interface Bear {
  id: string; zone: ZoneId; pos: Vec2; home: Vec2;
  hp: number; maxHp: number; state: BearState; respawn: number; attackCd: number;
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
 * Customers are transient — they are never saved and never affect the win condition.
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
  | { type: 'distributor' };

export interface Pad {
  id: string; pos: Vec2; currency: Currency; cost: number;
  paid: number; done: boolean; effect: UnlockEffect; requires?: string;
  payTimer: number;
}

export interface Turret { id: string; pos: Vec2; range: number; cd: number; active: boolean; output: number }
export interface Sawmill { id: string; pos: Vec2; radius: number; timer: number; active: boolean; output: number }

export interface Rail { id: string; points: Vec2[]; sourceType: 'turret' | 'sawmill'; sourceId: string }
export interface Cart { id: string; railId: string; s: number; dir: 1 | -1; load: number; cap: number }

export type VillagerState = 'frozen' | 'walking' | 'hauler';
/**
 * 'rescued' villagers start frozen in the snowfield and are thawed for meat; 'crew' are the
 * fort's own hand-off team (Amendment 2B) — present from the start, never frozen, never counted
 * toward the rescued total or the win, and idle until the distributor pad is bought.
 */
export type VillagerKind = 'rescued' | 'crew';
export interface Villager {
  id: string; kind: VillagerKind; pos: Vec2; state: VillagerState;
  carrying: ResourceKind | null; amount: number;
}

export type GameEvent =
  | { type: 'chop'; pos: Vec2 }
  | { type: 'treeFall'; pos: Vec2 }
  | { type: 'pickup'; pos: Vec2 }
  | { type: 'deposit'; pos: Vec2 }
  | { type: 'sell'; pos: Vec2; cash: number }
  | { type: 'unlock'; pos: Vec2 }
  | { type: 'thaw'; pos: Vec2 }
  | { type: 'bearHit'; pos: Vec2 }
  | { type: 'playerHit'; pos: Vec2 }
  | { type: 'win' };

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
  villagers: Villager[];
  /** Highest camp building tier bought (0 = bare clearing, 4 = grand fort). */
  campTier: number;
  /** Whether the fort's hand-off crew has been hired; derived from the distributor pad on load. */
  distributorActive: boolean;
  zonesOpen: Record<ZoneId, boolean>;
  rescued: number;
  won: boolean;
  stats: { chops: number; bearsKilled: number; earned: number };
  events: GameEvent[];
  nextDropId: number;
  nextCustomerId: number;
}
