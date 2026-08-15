import { dist, inRect, makeRng, v, type Rect, type Vec2 } from '../game/math';
import type { GateZone, Pad, Rail, Sawmill, SellStation, Turret, ZoneId } from '../game/state';

/**
 * The 10× world (Amendment 3B). Everything the campaign is made of — camp, road, gated zones,
 * rails, fences — stays exactly where it was authored, inside `ORIGINAL_MAP`; these bounds add
 * open snowy wilderness in a ring around it.
 */
export const WORLD_BOUNDS: Rect = { x0: -190, z0: -125, x1: 190, z1: 125 };

/** The area the campaign occupies. Wilderness scatter fills in around it, never inside it. */
export const ORIGINAL_MAP: Rect = { x0: -60, z0: -40, x1: 60, z1: 40 };

/**
 * Half-width of the road corridor left clear of wilderness scenery. The road now runs the full
 * width of the map, so this reaches out to both far edges: it is the strip the player and the
 * shoppers walk down, not just the paved part (ROAD_Z = 7 plus a verge).
 */
const ROAD_CLEAR = 10;

/** Where the wilderness scatter is allowed to put things. */
function inWilderness(p: Vec2): boolean {
  if (Math.abs(p.z) < ROAD_CLEAR) return false;
  if (inRect(p, ORIGINAL_MAP)) return false;
  // Wilderness entities are all zone 'start', so they must clear every gated rect — those are
  // inside ORIGINAL_MAP today, but this keeps the invariant true if a rect ever grows.
  for (const rect of Object.values(ZONE_RECTS)) if (inRect(p, rect)) return false;
  return true;
}

/**
 * Fill the wilderness on a jittered grid. The RNG is drawn before any rejection test so the
 * layout stays identical however the exclusions move — a scatter that only consumes randomness
 * for accepted points reshuffles the whole world when one rect changes.
 */
function scatterWilderness(
  rng: () => number, step: number, jitter: number,
): { pos: Vec2; zone: ZoneId }[] {
  const out: { pos: Vec2; zone: ZoneId }[] = [];
  const inset = jitter + 2;
  for (let x = WORLD_BOUNDS.x0 + inset; x <= WORLD_BOUNDS.x1 - inset; x += step) {
    for (let z = WORLD_BOUNDS.z0 + inset; z <= WORLD_BOUNDS.z1 - inset; z += step) {
      const p = v(x + (rng() - 0.5) * jitter, z + (rng() - 0.5) * jitter);
      if (inWilderness(p)) out.push({ zone: 'start', pos: p });
    }
  }
  return out;
}

/** Rectangles that block movement until their zone is opened. */
export const ZONE_RECTS: Record<GateZone, Rect> = {
  deepforest: { x0: 30, z0: -34, x1: 60, z1: -6 },
  hunting:    { x0: 30, z0: 6,   x1: 60, z1: 34 },
  quarry:     { x0: -60, z0: -34, x1: -30, z1: -6 },
};

export const PLAYER_SPAWN: Vec2 = v(0, 0);
export const DEPOT_POS: Vec2 = v(18, 0);

/**
 * The ground the camp building stands on, centred on the depot. This is the Grand Fort's plan —
 * ±4.3 in both axes, mirroring `campGrandFort`'s outermost log courses in `meshes.ts` — which is
 * the largest of the five tiers, so anything that clears this rect clears the camp at every tier.
 * Nothing may be routed through it: the fort is a solid building, not scenery.
 */
export const CAMP_FOOTPRINT: Rect = {
  x0: DEPOT_POS.x - 4.3, z0: -4.3, x1: DEPOT_POS.x + 4.3, z1: 4.3,
};

/**
 * The forest is finite: nothing regrows, so it has to be big enough that the whole campaign's
 * wood costs come out of it with room to spare. Every jitter range is chosen so start-zone trees
 * stay clear of the gated rects and gated trees stay inside theirs.
 *
 * The first four stands are the original map's, unchanged — they are what the campaign is
 * balanced against. The wilderness scatter on top of them (Amendment 3B) is scenery: a ~5-unit
 * grid over everything outside `ORIGINAL_MAP`, sparser than the starter forest so the ring reads
 * as open country rather than more of the same wall of trees.
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
  defs.push(...scatterWilderness(makeRng(1337), 5.0, 3.2));
  return defs;
}

/**
 * Wilderness bear packs (Amendment 3B). Hand-placed rather than scattered so the homes stay well
 * spaced — a pack that lands on top of another turns a ring of territories into one mob — and so
 * none of them sits astride the road the player walks out on.
 */
const BEAR_PACKS: Vec2[] = [
  v(-150, -95), v(-70, -100), v(20, -105), v(110, -90), v(165, -55), v(-160, -30),
  v(160, 60), v(95, 100), v(0, 105), v(-90, 95), v(-165, 55),
];

export function bearDefs(): { pos: Vec2; zone: ZoneId }[] {
  const rng = makeRng(7);
  const defs: { pos: Vec2; zone: ZoneId }[] = [];
  for (let i = 0; i < 4; i++)
    defs.push({ zone: 'start', pos: v(-24 + i * 12 + rng() * 3, -35 + rng() * 3) });
  for (let i = 0; i < 5; i++)
    defs.push({ zone: 'deepforest', pos: v(34 + i * 5 + rng() * 3, -12 + rng() * 4) });
  for (let i = 0; i < 8; i++)
    defs.push({ zone: 'hunting', pos: v(33 + (i % 4) * 7 + rng() * 3, 12 + Math.floor(i / 4) * 10 + rng() * 3) });
  for (const home of BEAR_PACKS) {
    const size = 3 + Math.floor(rng() * 3); // 3-5 to a pack
    for (let i = 0; i < size; i++) {
      defs.push({
        zone: 'start',
        pos: v(home.x + (rng() - 0.5) * 8, home.z + (rng() - 0.5) * 8),
      });
    }
  }
  return defs;
}

/**
 * Wilderness gold outcrops (Amendment 3B): open-zone seams, so they need only the pickaxe rather
 * than the quarry gate. Spread right around the ring so a walk in any direction finds one, and
 * kept well off the road.
 */
const OUTCROPS: Vec2[] = [
  v(-120, -60), v(-40, -80), v(45, -95), v(120, -70), v(170, -25), v(-100, -25),
  v(150, 45), v(70, 85), v(-15, 95), v(-95, 70), v(-170, 35), v(100, 25),
  v(-140, 100), v(140, -110),
];

export function seamDefs(): { pos: Vec2; zone: ZoneId }[] {
  const defs: { pos: Vec2; zone: ZoneId }[] = [];
  for (let i = 0; i < 6; i++)
    defs.push({ zone: 'quarry', pos: v(-54 + (i % 3) * 9, -28 + Math.floor(i / 3) * 12) });
  for (const pos of OUTCROPS) defs.push({ zone: 'start', pos });
  return defs;
}

/**
 * The fort's hand-off crew (Amendment 2B), grown from three to five now that they are the camp's
 * only carriers and no rescued villagers haul alongside them (Amendment 4C). Posts inside the
 * camp yard where they stand idle until the distributor pad is bought: an arc south of centre
 * plus two deeper in the yard. All five clear the camp's south doorway (camp-local |x| < 1.9 at
 * z > 2.8 at the tiers that wall it), which is the way the player walks in, and the miners'
 * column on the west side.
 */
export function crewDefs(): Vec2[] {
  return [v(16.4, 1.7), v(18.0, 2.3), v(19.6, 1.7), v(16.6, -0.4), v(19.4, -0.4)];
}

/**
 * The Grand Fort's gold crew (Amendment 3A). Two posts along the west side of the camp yard,
 * where they wait for tier 4. The x is chosen to stand clear of every tier's west wall and of
 * the depot stockpiles, which move around the yard as the camp grows.
 */
export function minerDefs(): Vec2[] {
  return [v(15.4, 1.2), v(15.4, 2.8)];
}

export function stationDefs(): SellStation[] {
  const st = (id: string, resource: SellStation['resource'], x: number): SellStation =>
    ({ id, resource, pos: v(x, 6.5), matPos: v(x + 2.5, 6.5), matCash: 0, timer: 0, stock: 0, spawnTimer: 0 });
  return [st('st-wood', 'wood', -8), st('st-meat', 'meat', 0), st('st-gold', 'gold', 8)];
}

/**
 * The two open ends of the camp road: shoppers walk on from the nearer one and leave the same
 * way. They sit on opposite sides of the road's centre line so the map's two ends do not feed
 * one shared file of walkers.
 *
 * These stayed at ±58 when the road grew to span the whole 10× world, rather than moving out to
 * the new bounds. ±58 is already far enough off-camera at this camera height that arrivals
 * appear out of nothing, and it is what the shop economy is tuned around: the ~12 s walk down
 * the road is what sets how many shoppers are on the map at once (see CUSTOMER_QUEUE_CAP).
 * Pushing them to ±188 would triple that walk and, with it, the on-screen crowd.
 *
 * The east end's z is the one number here with a hard constraint on it. Only the gold bench draws
 * from that end, and its shoppers walk the whole way from x = 58 to the bench's walk-in lane at
 * x ≈ 4.4 at a constant z — a line that passes straight through the camp at x ∈ [13.7, 22.3].
 * At the old z = -2 they walked through the Fort's walls. The lanes now thread the gap between
 * `CAMP_FOOTPRINT`'s south face (z = -4.3) and the road's south edge (z = -7):
 *
 *     arrivals   z = -6.25 ± 0.5  →  [-6.75, -5.75]
 *     departures z = -5.05 ± 0.5  →  [-5.55, -4.55]   (arrivals + ROAD_LANE_OFFSET)
 *
 * which leaves a quarter-unit either side — the widest the two lanes plus their jitter can be
 * spaced inside a 2.7-unit corridor. They cross the p-camp3 and p-gate-deep pads on the way,
 * which is cosmetic: pads only ever answer to the player.
 *
 * The west end needs no such care. Its lanes (z = 2 and 3.2) do sit inside the camp's z range,
 * but its shoppers serve the wood and meat benches at x ≤ 0 and turn off the road at x ≈ -3.6 at
 * the furthest east, so they never reach the camp's x range at all. `customers.test.ts` checks
 * the actual walked positions against the footprint rather than trusting that argument.
 */
export const ROAD_ENDS: Vec2[] = [v(-58, 2), v(58, -6.25)];

/**
 * How far a departing shopper's road lane sits from the arriving lane it walks beside. Both
 * directions used to share one line down the road, so buyers heading home walked head-on
 * through the buyers coming in. Wider than the ±0.5 spawn jitter, so the two lanes stay apart
 * even where a late arrival and an early departure jitter toward each other.
 */
export const ROAD_LANE_OFFSET = 1.2;

/** Road-lane z for a shopper with the given spawn jitter, walking in from / out to `end`. */
export function roadLaneZ(end: Vec2, outbound: boolean, jitter: number): number {
  return end.z + (outbound ? ROAD_LANE_OFFSET : 0) + jitter;
}

/**
 * Where a bench's line starts, relative to the bench, and how far apart shoppers stand in it.
 * The line runs AWAY from the road (+z, the snow side) so it never blocks the road, and is
 * offset in x to clear both the bench itself and the cash mat on the far side of it.
 */
export const QUEUE_OFFSET: Vec2 = v(-2.0, 1.2);
export const QUEUE_SPACING = 1.1;

/**
 * How far the walk-in lane runs to the side of the standing line. Arrivals come up this lane,
 * level with their slot, and only then step across into it — the line is entered from the side,
 * never walked down. Wide enough that a shopper in the lane and one standing in the line do not
 * overlap, and near enough the bench that the lane still crosses the road fence in its gap.
 */
export const QUEUE_LANE_DX = -1.6;

/** Standing spot for the `slot`-th shopper in a bench's line; slot 0 is at the counter. */
export function queueAnchor(st: SellStation, slot: number): Vec2 {
  return v(st.pos.x + QUEUE_OFFSET.x, st.pos.z + QUEUE_OFFSET.z + slot * QUEUE_SPACING);
}

/** x of the walk-in lane beside a bench's line — the same for every slot. */
export function queueLaneX(st: SellStation): number {
  return st.pos.x + QUEUE_OFFSET.x + QUEUE_LANE_DX;
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
