import { dist, makeRng, v, type Rect, type Vec2 } from '../game/math';
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
/**
 * Where thawed villagers walk to: outside the camp building's south face, which is the approach
 * at every tier. What sits there varies — tiers 0-1 have no south wall at all, tier 2 closes it
 * with a barn door, tier 3 leaves a gap at z ≈ 3.8 and tier 4 at z ≈ 4.3 — so this stands clear
 * of all five rather than aiming at any one doorway.
 */
export const CAMP_POS: Vec2 = v(18, 4.4);

/**
 * The forest is finite: nothing regrows, so it has to be big enough that the whole campaign's
 * wood costs come out of it with room to spare (~295 trees × 2 logs). Every jitter range is
 * chosen so start-zone trees stay clear of the gated rects and gated trees stay inside theirs.
 */
export function treeDefs(): { pos: Vec2; zone: ZoneId }[] {
  const rng = makeRng(42);
  const defs: { pos: Vec2; zone: ZoneId }[] = [];
  // Dense starter forest north of the camp road (x stays inside ±30, clear of quarry/deepforest).
  for (let i = 0; i < 17; i++)
    for (let j = 0; j < 8; j++)
      defs.push({ zone: 'start', pos: v(-28 + i * 3.4 + rng() * 1.6, -33 + j * 3.2 + rng() * 1.5) });
  // Northern tree band running the full width of the map, north of every gated rect.
  for (let i = 0; i < 33; i++)
    for (let j = 0; j < 2; j++)
      defs.push({ zone: 'start', pos: v(-58 + i * 3.6 + rng() * 1.6, -39 + j * 3.2 + rng() * 0.8) });
  // Deep forest: the densest stand, the reason to buy the first gate.
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++)
      defs.push({ zone: 'deepforest', pos: v(31 + i * 3.2 + rng() * 1.4, -33 + j * 3.0 + rng() * 1.4) });
  // A few strays in the hunting grounds, kept off the bear rows (z ≈ 12-15 and 22-25).
  for (let i = 0; i < 4; i++)
    for (const z of [8.5, 18.5, 29.5])
      defs.push({ zone: 'hunting', pos: v(32 + i * 6 + rng() * 1.2, z + rng() * 1.2) });
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

/**
 * The fort's hand-off crew (Amendment 2B). Three posts inside the camp yard, south of the depot
 * stockpiles at every tier, where they stand idle until the distributor pad is bought.
 */
export function crewDefs(): Vec2[] {
  return [v(16.4, 1.7), v(18.0, 2.3), v(19.6, 1.7)];
}

export function villagerDefs(): Vec2[] {
  const defs: Vec2[] = [];
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 5; j++)
      defs.push(v(-44 + i * 5, 12 + j * 5));
  return defs;
}

export function stationDefs(): SellStation[] {
  const st = (id: string, resource: SellStation['resource'], x: number): SellStation =>
    ({ id, resource, pos: v(x, 6.5), matPos: v(x + 2.5, 6.5), matCash: 0, timer: 0, stock: 0, spawnTimer: 0 });
  return [st('st-wood', 'wood', -8), st('st-meat', 'meat', 0), st('st-gold', 'gold', 8)];
}

/**
 * The two open ends of the camp road: shoppers walk on from the nearer one and leave the same
 * way. They sit just inside the world bounds so arrivals appear from off-camera, and just off
 * the road's centre line so the two directions of traffic do not share a lane.
 */
export const ROAD_ENDS: Vec2[] = [v(-58, 2), v(58, -2)];

/**
 * Where a bench's line starts, relative to the bench, and how far apart shoppers stand in it.
 * The line runs AWAY from the road (+z, the snow side) so it never blocks the road, and is
 * offset in x to clear both the bench itself and the cash mat on the far side of it.
 */
export const QUEUE_OFFSET: Vec2 = v(-2.0, 1.2);
export const QUEUE_SPACING = 1.1;

/** Standing spot for the `slot`-th shopper in a bench's line; slot 0 is at the counter. */
export function queueAnchor(st: SellStation, slot: number): Vec2 {
  return v(st.pos.x + QUEUE_OFFSET.x, st.pos.z + QUEUE_OFFSET.z + slot * QUEUE_SPACING);
}

/** Road end a shopper for this bench walks in from (and back out to). */
export function nearestRoadEnd(pos: Vec2): Vec2 {
  return ROAD_ENDS.reduce((best, end) => (dist(end, pos) < dist(best, pos) ? end : best));
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
  // The camp pads ring the depot yard; everything else hangs off the chain that grows the camp:
  // camp1 → axe → {carry1, speed1, gate-deep} → camp2 → {turret1, sawmill1} → scythe → camp3 →
  // {gate-hunt, distributor} → turret2, and sawmill1 → gate-quarry → pickaxe →
  // {carry2, speed2, camp4}.
  return [
    p('p-camp1',      v(11, -4),   'wood', 12, { type: 'camp', tier: 1 }),
    p('p-axe',        v(-4, -4),   'cash', 10, { type: 'tool', tool: 'axe' }, 'p-camp1'),
    p('p-carry1',     v(-10, -4),  'cash', 30, { type: 'carry', add: 12 }, 'p-axe'),
    p('p-speed1',     v(-16, -4),  'cash', 40, { type: 'speed', mult: 1.3 }, 'p-axe'),
    p('p-gate-deep',  v(24, -5),   'wood', 15, { type: 'gate', zone: 'deepforest' }, 'p-axe'),
    p('p-camp2',      v(11, 4),    'wood', 40, { type: 'camp', tier: 2 }, 'p-gate-deep'),
    p('p-turret1',    v(31, -8),   'cash', 25, { type: 'machine', machineId: 'turret1' }, 'p-camp2'),
    p('p-sawmill1',   v(34, -16),  'cash', 30, { type: 'machine', machineId: 'sawmill1' }, 'p-camp2'),
    p('p-scythe',     v(4, -4),    'cash', 40, { type: 'tool', tool: 'scythe' }, 'p-turret1'),
    p('p-camp3',      v(15, -6),   'wood', 90, { type: 'camp', tier: 3 }, 'p-scythe'),
    p('p-gate-hunt',  v(24, 5),    'meat', 20, { type: 'gate', zone: 'hunting' }, 'p-camp3'),
    p('p-turret2',    v(31, 8),    'cash', 50, { type: 'machine', machineId: 'turret2' }, 'p-gate-hunt'),
    // Sits off the fort's south-east corner, clear of the camp footprint, the rail gates and the
    // road fence, so the player walks past it on the way in from the benches.
    p('p-distributor', v(20, 9.5), 'cash', 100, { type: 'distributor' }, 'p-camp3'),
    p('p-gate-quarry', v(-24, -5), 'cash', 60, { type: 'gate', zone: 'quarry' }, 'p-sawmill1'),
    p('p-pickaxe',    v(-31, -8),  'cash', 30, { type: 'pickaxe' }, 'p-gate-quarry'),
    p('p-carry2',     v(-10, 4),   'gold', 8,  { type: 'carry', add: 24 }, 'p-pickaxe'),
    p('p-speed2',     v(-16, 4),   'gold', 10, { type: 'speed', mult: 1.3 }, 'p-pickaxe'),
    p('p-camp4',      v(15, 6),    'gold', 12, { type: 'camp', tier: 4 }, 'p-pickaxe'),
  ];
}
