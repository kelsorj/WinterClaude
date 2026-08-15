import { EXPEDITION_BASE } from './balance';
import { dist, inRect, makeRng, v, type Rect, type Vec2 } from '../game/math';
import type { GateZone, Pad, Rail, Sawmill, SellStation, Turret, ZoneId } from '../game/state';

/**
 * The 10× world (Amendment 3B). Everything the campaign is made of — camp, road, gated zones,
 * rails, fences — stays exactly where it was authored, inside `ORIGINAL_MAP`; these bounds add
 * open snowy wilderness in a ring around it.
 *
 * Since Amendment 5B this is only ring 0 — the world the campaign starts in. Expeditions push
 * the border out from here, so anything that clamps to the edge of the world must ask
 * `worldBounds(state.expansions)` rather than reading this. It stays the authoring frame: the
 * starter wilderness scatter below, and every ring's inner edge, are measured against it.
 */
export const WORLD_BOUNDS: Rect = { x0: -190, z0: -125, x1: 190, z1: 125 };

/** How far each expedition pushes the world border out, on every side (Amendment 5B). */
export const RING_WIDTH = 30;

/** The walkable world after `expansions` expeditions. Ring 0 is `WORLD_BOUNDS` exactly. */
export function worldBounds(expansions: number): Rect {
  const grow = RING_WIDTH * Math.max(0, Math.floor(expansions));
  return {
    x0: WORLD_BOUNDS.x0 - grow, z0: WORLD_BOUNDS.z0 - grow,
    x1: WORLD_BOUNDS.x1 + grow, z1: WORLD_BOUNDS.z1 + grow,
  };
}

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

// ---------------------------------------------------------------------------
// Expedition rings (Amendment 5B)
// ---------------------------------------------------------------------------

/**
 * Ring content is generated, never stored: a save carries only how many expeditions were bought,
 * and `ringDefs` rebuilds each ring's trees, bears and seams identically from a seed keyed by the
 * ring index. That is what lets felled ring trees persist — their ids are stable because the
 * layout they are drawn from is.
 *
 * Ring seeds are spread with Knuth's multiplicative hash rather than being `base + ring`: the
 * LCG behind `makeRng` starts its sequence very close together for adjacent seeds, so
 * consecutive rings would have come out looking like near-copies of each other.
 */
const RING_SEED_MULT = 2654435761;

/**
 * Trees per ring, drawn from the band's area. The band grows every expedition (~41k units² at
 * ring 1, ~63k by ring 4), so the count grows with it and is then clamped: rings would otherwise
 * get steadily more expensive to generate and draw for no gameplay reason.
 *
 * The density is deliberately well below the starter wilderness's (25 units²/tree). At that
 * density a ring would seed ~1,650 trees and two expeditions would double the whole forest; the
 * amendment's per-ring budget is 300-500, so a new ring reads as thinner country than the
 * original wilderness. That trade is on purpose — the instanced forest carries the scale, but it
 * is rebuilt whole on every expansion, so a ring is kept to something the rebuild can swallow.
 */
const RING_AREA_PER_TREE = 100;
const RING_TREES_MIN = 300;
const RING_TREES_MAX = 500;

/** Bears come in packs of this size, 3-4 packs to a ring — 12-16 bears of new territory. */
const RING_PACK_SIZE = 4;
/** How far a pack's members scatter from its home, in each axis. */
const RING_PACK_SPREAD = 8;

const area = (r: Rect): number => (r.x1 - r.x0) * (r.z1 - r.z0);
const inset = (r: Rect, m: number): Rect =>
  ({ x0: r.x0 + m, z0: r.z0 + m, x1: r.x1 - m, z1: r.z1 - m });

function ringTreeCount(ring: number): number {
  const band = area(worldBounds(ring)) - area(worldBounds(ring - 1));
  return Math.min(RING_TREES_MAX, Math.max(RING_TREES_MIN, Math.round(band / RING_AREA_PER_TREE)));
}

/**
 * One uniform point in the band between `hole` and `box`, kept `clear` of the road.
 *
 * The band is sampled arm by arm — north, south, west, east — weighted by area, rather than by
 * rejecting points drawn from the whole rect. The band is a thinner and thinner sliver of the
 * world as rings accumulate (30% of it at ring 1, under 4% by ring 50), so rejection sampling
 * would get slower with every expedition; this is exact and constant-time whatever the ring is.
 * Only the west and east arms span the road at all, so only they retry.
 */
function bandPoint(rng: () => number, box: Rect, hole: Rect, clear: number): Vec2 {
  const arms: { rect: Rect; road: boolean }[] = [
    { rect: { x0: box.x0, z0: box.z0, x1: box.x1, z1: hole.z0 }, road: false },
    { rect: { x0: box.x0, z0: hole.z1, x1: box.x1, z1: box.z1 }, road: false },
    { rect: { x0: box.x0, z0: hole.z0, x1: hole.x0, z1: hole.z1 }, road: true },
    { rect: { x0: hole.x1, z0: hole.z0, x1: box.x1, z1: hole.z1 }, road: true },
  ];
  const areas = arms.map((a) => Math.max(0, a.rect.x1 - a.rect.x0) * Math.max(0, a.rect.z1 - a.rect.z0));
  let pick = rng() * areas.reduce((sum, a) => sum + a, 0);
  let idx = arms.length - 1;
  for (let i = 0; i < arms.length; i++) {
    if (pick < areas[i]) { idx = i; break; }
    pick -= areas[i];
  }
  const { rect, road } = arms[idx];
  const spanX = rect.x1 - rect.x0, spanZ = rect.z1 - rect.z0;
  for (let i = 0; i < 50; i++) {
    const p = v(rect.x0 + rng() * spanX, rect.z0 + rng() * spanZ);
    if (road && Math.abs(p.z) < clear) continue;
    return p;
  }
  // Only reachable in a west/east arm, and only if fifty draws all landed on the road. Park the
  // point just off the verge rather than on it.
  return v(rect.x0 + rng() * spanX, clear);
}

export interface RingDefs {
  trees: { pos: Vec2; zone: ZoneId }[];
  bears: { pos: Vec2; zone: ZoneId }[];
  seams: { pos: Vec2; zone: ZoneId }[];
}

/**
 * Everything ring `ring` (1-based) adds to the world: open-country trees, bear packs and gold
 * outcrops in the new band only. All of it is zone 'start' — an expedition opens country, it does
 * not add gates — so none of it can land inside a gated rect, which lives back in `ORIGINAL_MAP`.
 *
 * The margins are what keep pack members honest: a home is drawn 6 units clear of both the
 * previous ring and the road, and members scatter at most 4 from it, so every bear still lands in
 * the band and off the road without a second test.
 */
export function ringDefs(ring: number): RingDefs {
  const rng = makeRng(ring * RING_SEED_MULT);
  const outer = worldBounds(ring);
  const prev = worldBounds(ring - 1);
  const grow = (m: number): Rect => inset(prev, -m);
  const defs: RingDefs = { trees: [], bears: [], seams: [] };
  for (let i = 0; i < ringTreeCount(ring); i++) {
    defs.trees.push({ zone: 'start', pos: bandPoint(rng, inset(outer, 2), prev, ROAD_CLEAR) });
  }
  const packs = 3 + Math.floor(rng() * 2);
  for (let p = 0; p < packs; p++) {
    const home = bandPoint(rng, inset(outer, 6), grow(6), ROAD_CLEAR + 6);
    for (let i = 0; i < RING_PACK_SIZE; i++) {
      defs.bears.push({
        zone: 'start',
        pos: v(
          home.x + (rng() - 0.5) * RING_PACK_SPREAD,
          home.z + (rng() - 0.5) * RING_PACK_SPREAD,
        ),
      });
    }
  }
  const seams = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < seams; i++) {
    defs.seams.push({ zone: 'start', pos: bandPoint(rng, inset(outer, 3), grow(3), ROAD_CLEAR + 3) });
  }
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
    effect: Pad['effect'], requires?: string, repeat?: boolean,
  ): Pad => ({ id, pos, currency, cost, paid: 0, done: false, effect, requires, payTimer: 0, repeat });
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
    // The one repeatable pad (Amendment 5B). It mirrors the distributor across the road, off the
    // fort's south-west corner: outside `CAMP_FOOTPRINT`, south of the shoppers' corridor (which
    // threads z ∈ [-6.75, -4.55] on its way to the gold bench), and inside the south fence's
    // depot gap, so the player walks past it coming and going from the camp. It hangs off the
    // Fort rather than standing open from the first frame — an expedition is what a camp mounts
    // once it is a camp, and the price is priced for a late-game economy.
    p('p-expedition', v(20, -9.5), 'cash', EXPEDITION_BASE, { type: 'expedition' }, 'p-camp3', true),
  ];
}
