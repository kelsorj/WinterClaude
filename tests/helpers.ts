import { v } from '../src/game/math';
import type {
  Bear, Cart, GameState, GoldSeam, Pad, Rail, SellStation, Tree, Villager,
} from '../src/game/state';

export function blankState(): GameState {
  return {
    time: 0,
    player: {
      pos: v(0, 0), facing: v(0, 1), speed: 6, tool: 'hatchet', hasPickaxe: false,
      carry: { wood: 0, meat: 0, gold: 0 }, carryCap: 12, cash: 0,
      swingTimer: 0, knockback: v(0, 0),
    },
    trees: [], seams: [], bears: [], drops: [],
    pads: [], stations: [], turrets: [], sawmills: [], rails: [], carts: [],
    depot: { wood: 0, meat: 0, gold: 0 }, depotPos: v(18, 0),
    villagers: [],
    campTier: 0,
    zonesOpen: { start: true, deepforest: false, hunting: false, quarry: false },
    rescued: 0, won: false,
    stats: { chops: 0, bearsKilled: 0, earned: 0 },
    events: [], nextDropId: 1,
  };
}

export const aTree = (over: Partial<Tree> = {}): Tree =>
  ({ id: 't1', zone: 'start', pos: v(1, 0), hp: 3, respawn: 0, ...over });

export const aSeam = (over: Partial<GoldSeam> = {}): GoldSeam =>
  ({ id: 'g1', zone: 'start', pos: v(1, 0), hp: 4, respawn: 0, ...over });

export const aBear = (over: Partial<Bear> = {}): Bear =>
  ({ id: 'b1', zone: 'start', pos: v(1, 0), home: v(1, 0), hp: 6, maxHp: 6,
     state: 'sleep', respawn: 0, attackCd: 0, ...over });

export const aStation = (over: Partial<SellStation> = {}): SellStation =>
  ({ id: 's1', resource: 'wood', pos: v(0, 1), matPos: v(2, 1), matCash: 0, timer: 0, ...over });

export const aPad = (over: Partial<Pad> = {}): Pad =>
  ({ id: 'p1', pos: v(0, 1), currency: 'cash', cost: 10, paid: 0, done: false,
     effect: { type: 'tool', tool: 'axe' }, payTimer: 0, ...over });

export const aRail = (over: Partial<Rail> = {}): Rail =>
  ({ id: 'r1', points: [v(0, 0), v(10, 0)], sourceType: 'sawmill', sourceId: 'm1', ...over });

export const aCart = (over: Partial<Cart> = {}): Cart =>
  ({ id: 'c1', railId: 'r1', s: 0, dir: -1, load: 0, cap: 6, ...over });

export const aVillager = (over: Partial<Villager> = {}): Villager =>
  ({ id: 'v1', pos: v(0, 1), state: 'frozen', carrying: null, amount: 0, ...over });
