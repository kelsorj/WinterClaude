import { makeRng, v, type Rect, type Vec2 } from '../game/math';
import type { GateZone, Pad, Rail, Sawmill, SellStation, Turret, ZoneId } from '../game/state';

export const WORLD_BOUNDS: Rect = { x0: -60, z0: -40, x1: 60, z1: 40 };

/** Rectangles that block movement until their zone is opened. */
export const ZONE_RECTS: Record<GateZone, Rect> = {
  deepforest: { x0: 30, z0: -34, x1: 60, z1: -6 },
  hunting:    { x0: 30, z0: 6,   x1: 60, z1: 34 },
  quarry:     { x0: -60, z0: -34, x1: -30, z1: -6 },
};

export const PLAYER_SPAWN: Vec2 = v(0, 0);
export const DEPOT_POS: Vec2 = v(18, 0);
export const CAMP_POS: Vec2 = v(0, 2);

export function treeDefs(): { pos: Vec2; zone: ZoneId }[] {
  const rng = makeRng(42);
  const defs: { pos: Vec2; zone: ZoneId }[] = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 5; j++)
      defs.push({ zone: 'start', pos: v(-27 + i * 5 + rng() * 2, -30 + j * 5 + rng() * 2) });
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 5; j++)
      defs.push({ zone: 'deepforest', pos: v(33 + i * 4.5 + rng() * 2, -31 + j * 5 + rng() * 2) });
  return defs;
}

export function bearDefs(): { pos: Vec2; zone: ZoneId }[] {
  const rng = makeRng(7);
  const defs: { pos: Vec2; zone: ZoneId }[] = [];
  for (let i = 0; i < 4; i++)
    defs.push({ zone: 'start', pos: v(-24 + i * 12 + rng() * 3, -35 + rng() * 3) });
  for (let i = 0; i < 5; i++)
    defs.push({ zone: 'deepforest', pos: v(34 + i * 5 + rng() * 3, -12 + rng() * 4) });
  for (let i = 0; i < 8; i++)
    defs.push({ zone: 'hunting', pos: v(33 + (i % 4) * 7 + rng() * 3, 12 + Math.floor(i / 4) * 10 + rng() * 3) });
  return defs;
}

export function seamDefs(): { pos: Vec2; zone: ZoneId }[] {
  const defs: { pos: Vec2; zone: ZoneId }[] = [];
  for (let i = 0; i < 6; i++)
    defs.push({ zone: 'quarry', pos: v(-54 + (i % 3) * 9, -28 + Math.floor(i / 3) * 12) });
  return defs;
}

export function villagerDefs(): Vec2[] {
  const defs: Vec2[] = [];
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 5; j++)
      defs.push(v(-44 + i * 5, 12 + j * 5));
  return defs;
}

export function stationDefs(): SellStation[] {
  return [
    { id: 'st-wood', resource: 'wood', pos: v(-8, 6.5), matPos: v(-5.5, 6.5), matCash: 0, timer: 0 },
    { id: 'st-meat', resource: 'meat', pos: v(0, 6.5), matPos: v(2.5, 6.5), matCash: 0, timer: 0 },
    { id: 'st-gold', resource: 'gold', pos: v(8, 6.5), matPos: v(10.5, 6.5), matCash: 0, timer: 0 },
  ];
}

export function turretDefs(): Turret[] {
  return [
    { id: 'turret1', pos: v(36, -9), range: 10, cd: 0, active: false, output: 0 },
    { id: 'turret2', pos: v(36, 9), range: 10, cd: 0, active: false, output: 0 },
  ];
}

export function sawmillDefs(): Sawmill[] {
  return [{ id: 'sawmill1', pos: v(45, -20), radius: 8, timer: 0, active: false, output: 0 }];
}

export function railDefs(): Rail[] {
  return [
    { id: 'rail-t1', sourceType: 'turret', sourceId: 'turret1',
      points: [v(36, -9), v(28, -6), v(22, -2), v(DEPOT_POS.x, DEPOT_POS.z)] },
    { id: 'rail-t2', sourceType: 'turret', sourceId: 'turret2',
      points: [v(36, 9), v(28, 6), v(22, 2), v(DEPOT_POS.x, DEPOT_POS.z)] },
    { id: 'rail-s1', sourceType: 'sawmill', sourceId: 'sawmill1',
      points: [v(45, -20), v(34, -12), v(26, -4), v(DEPOT_POS.x, DEPOT_POS.z)] },
  ];
}

export function padDefs(): Pad[] {
  const p = (
    id: string, pos: Vec2, currency: Pad['currency'], cost: number,
    effect: Pad['effect'], requires?: string,
  ): Pad => ({ id, pos, currency, cost, paid: 0, done: false, effect, requires, payTimer: 0 });
  return [
    p('p-axe',        v(-4, -4),   'cash', 10, { type: 'tool', tool: 'axe' }),
    p('p-carry1',     v(-10, -4),  'cash', 30, { type: 'carry', add: 12 }, 'p-axe'),
    p('p-speed1',     v(-16, -4),  'cash', 40, { type: 'speed', mult: 1.3 }, 'p-axe'),
    p('p-gate-deep',  v(24, -5),   'wood', 15, { type: 'gate', zone: 'deepforest' }, 'p-axe'),
    p('p-turret1',    v(31, -8),   'cash', 25, { type: 'machine', machineId: 'turret1' }, 'p-gate-deep'),
    p('p-sawmill1',   v(34, -16),  'cash', 30, { type: 'machine', machineId: 'sawmill1' }, 'p-gate-deep'),
    p('p-scythe',     v(4, -4),    'cash', 40, { type: 'tool', tool: 'scythe' }, 'p-turret1'),
    p('p-gate-hunt',  v(24, 5),    'meat', 20, { type: 'gate', zone: 'hunting' }, 'p-scythe'),
    p('p-turret2',    v(31, 8),    'cash', 50, { type: 'machine', machineId: 'turret2' }, 'p-gate-hunt'),
    p('p-gate-quarry', v(-24, -5), 'cash', 60, { type: 'gate', zone: 'quarry' }, 'p-sawmill1'),
    p('p-pickaxe',    v(-31, -8),  'cash', 30, { type: 'pickaxe' }, 'p-gate-quarry'),
    p('p-carry2',     v(-10, 4),   'gold', 8,  { type: 'carry', add: 24 }, 'p-pickaxe'),
    p('p-speed2',     v(-16, 4),   'gold', 10, { type: 'speed', mult: 1.3 }, 'p-pickaxe'),
  ];
}
