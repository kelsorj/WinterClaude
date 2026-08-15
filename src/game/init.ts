import {
  BEAR_HP, CARRY_BASE, CART_CAP, HAUL_ORDER, PLAYER_BASE_SPEED, SEAM_HP, TREE_HP,
} from '../content/balance';
import {
  DEPOT_POS, PLAYER_SPAWN, bearDefs, crewDefs, minerDefs, padDefs, railDefs, sawmillDefs,
  seamDefs, stationDefs, treeDefs, turretDefs,
} from '../content/map';
import { v } from './math';
import type { GameState } from './state';

export function createInitialState(): GameState {
  const rails = railDefs();
  return {
    time: 0,
    player: {
      pos: v(PLAYER_SPAWN.x, PLAYER_SPAWN.z), facing: v(0, 1),
      speed: PLAYER_BASE_SPEED, tool: 'hatchet', hasPickaxe: false,
      carry: { wood: 0, meat: 0, gold: 0 }, carryCap: CARRY_BASE, cash: 0,
      swingTimer: 0, knockback: v(0, 0),
    },
    trees: treeDefs().map((d, i) => ({ id: `tree${i}`, zone: d.zone, pos: d.pos, hp: TREE_HP, respawn: 0 })),
    seams: seamDefs().map((d, i) => ({ id: `seam${i}`, zone: d.zone, pos: d.pos, hp: SEAM_HP, respawn: 0 })),
    bears: bearDefs().map((d, i) => ({
      id: `bear${i}`, zone: d.zone, pos: v(d.pos.x, d.pos.z), home: v(d.pos.x, d.pos.z),
      hp: BEAR_HP, maxHp: BEAR_HP, state: 'sleep' as const, respawn: 0, attackCd: 0,
    })),
    drops: [],
    pads: padDefs(),
    stations: stationDefs(),
    customers: [],
    turrets: turretDefs(),
    sawmills: sawmillDefs(),
    rails,
    carts: rails.map((r, i) => ({
      id: `cart${i}`, railId: r.id, s: 0, dir: -1 as const, load: 0, cap: CART_CAP,
    })),
    depot: { wood: 0, meat: 0, gold: 0 },
    depotPos: v(DEPOT_POS.x, DEPOT_POS.z),
    depotTimer: 0,
    villagers: [
      // The crew is on site from the first frame — they simply have no job until the fort's
      // distributor pad is bought, which is what makes buying it read as hiring them. Their
      // hauling rotations start staggered so the very first round of trips already fans out
      // across the depot's piles rather than all five queueing at the same one.
      ...crewDefs().map((p, i) => ({
        id: `crew${i}`, kind: 'crew' as const, pos: v(p.x, p.z),
        carrying: null, amount: 0, target: null, rotation: i % HAUL_ORDER.length,
      })),
      // Likewise the miners: on site, pickaxes in hand, with nothing to mine for until the
      // Grand Fort goes up. Their activation is read off `campTier`, so it needs no save field.
      ...minerDefs().map((p, i) => ({
        id: `miner${i}`, kind: 'miner' as const, pos: v(p.x, p.z),
        carrying: null, amount: 0, target: null, rotation: i % HAUL_ORDER.length,
      })),
    ],
    campTier: 0,
    distributorActive: false,
    zonesOpen: { start: true, deepforest: false, hunting: false, quarry: false },
    won: false,
    stats: { chops: 0, bearsKilled: 0, earned: 0 },
    events: [],
    nextDropId: 1,
    nextCustomerId: 1,
  };
}
