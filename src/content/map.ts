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
 * ±4.3 in both axes — and the Grand Fort is the largest of the five tiers, so anything that
 * clears this rect clears the camp at every tier. Nothing may be routed through it: the fort is
 * a solid building, not scenery.
 *
 * The rect is the authority and the geometry is built to fit it, not the other way round:
 * `campGrandFort` and the tier-3 gate towers derive their outward dimensions from `CAMP_HALF`
 * so their outer SURFACES land on ±4.3 rather than their centre lines. `camp.test.ts` measures
 * every tier's real meshes against this rect, because the claim above was quietly false for a
 * while — walls centred on ±4.3 put log faces at ±4.56 and corner posts at ±4.74, and the
 * shoppers' departure lane comes within a quarter-unit of the rect's north face.
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

// ---------------------------------------------------------------------------
// The fort compound (Amendment 6A)
// ---------------------------------------------------------------------------

/**
 * The camp is a compound centred on the fort, not a row of benches along the road. Everything
 * below is derived from these three numbers so the layout can be re-tuned as a whole rather than
 * patched stand by stand.
 *
 * `COMPOUND_RADIUS` is where the fence ring runs; `STAND_RADIUS` puts the three stands just
 * inside it, so a stand's counter is in the compound and its line steps straight out through the
 * fence's gate gap. The 1.5 units between them is what keeps slot 0 — the shopper actually being
 * served — inside the ring while everyone still waiting stands outside it, which is what the
 * reference frame shows.
 *
 * 13 is also as wide as the ring can be: the hunting ground's rect starts at (30, 6) and the
 * deep forest's at (30, -6), and a ring of this radius passes x = 29.5 at both, so the compound
 * fence stops just short of both gate walls instead of running through them.
 */
export const COMPOUND_RADIUS = 13.0;
const STAND_RADIUS = 11.5;

/**
 * Where each stand sits on the arc, in degrees from +x toward +z (south). The fan is 45° apart
 * and centred on due south: the fort's north face is the road, so the arc can only occupy the
 * southern half, and 45° is the narrowest spacing that still leaves a bench, its mat and its
 * walk-in lane clear of its neighbour's (2 × 11.5 × sin 22.5° = 8.8 units between counters).
 */
const STAND_BEARINGS: Record<string, number> = { 'st-wood': 135, 'st-meat': 90, 'st-gold': 45 };

const onArc = (deg: number, r: number): Vec2 => v(
  DEPOT_POS.x + Math.cos((deg * Math.PI) / 180) * r,
  DEPOT_POS.z + Math.sin((deg * Math.PI) / 180) * r,
);

/**
 * How far behind its counter a stand's cash mat sits. The mat used to stand beside the bench,
 * which put it exactly where the next stand's walk-in lane wants to be once the benches are on an
 * arc; behind the counter it is inside the compound, where the player collects it on the way past
 * the fort, and the whole outward side of every stand is left to the queue.
 */
const MAT_BEHIND = 2.4;

export function stationDefs(): SellStation[] {
  const st = (id: string, resource: SellStation['resource']): SellStation => {
    const pos = onArc(STAND_BEARINGS[id], STAND_RADIUS);
    return {
      id, resource, pos, matPos: v(pos.x, pos.z - MAT_BEHIND),
      matCash: 0, timer: 0, stock: 0, spawnTimer: 0,
    };
  };
  return [st('st-wood', 'wood'), st('st-meat', 'meat'), st('st-gold', 'gold')];
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
 * The east end's z is the one number here with a hard constraint on it, and since Amendment 6A it
 * is a different constraint. Its shoppers no longer thread the corridor between the fort's north
 * face and the road's edge — the gold stand's lane is at x = 24.3, east of the whole building, so
 * they never reach the camp's x range at all. What they DO cross is the deep forest's rect, whose
 * south face (z = -6) reaches over the road's north side for every x ≥ 30. At the old z = -6.25
 * both lanes ran inside that rect, i.e. through a gate wall that is still standing when the
 * shoppers first arrive. The lanes now sit south of it, in the open half of the road:
 *
 *     arrivals   z = -5.4 ± 0.5  →  [-5.9, -4.9]
 *     departures z = -4.2 ± 0.5  →  [-4.7, -3.7]   (arrivals + ROAD_LANE_OFFSET)
 *
 * The west end needs no such care: its shoppers turn off the road at x ≤ 11.8, west of the
 * camp's x range, so they never reach it either. `customers.test.ts` walks the whole simulation
 * and checks the positions against the fort, the compound fence and every gated rect rather than
 * trusting any of these arguments.
 */
export const ROAD_ENDS: Vec2[] = [v(-58, 2), v(58, -5.4)];

/**
 * How each stand's shoppers get between the road and the head of its walk-in lane (Amendment 6A).
 *
 * With the stands wrapped around the fort, "walk down the road to the lane's x and turn" is no
 * longer enough on its own: the meat stand is due south of the fort, so a straight turn off the
 * road into its lane walks through the building. Each stand therefore carries an explicit route.
 *
 * `end` is which end of the road the stand draws from — the wood and meat stands from the west,
 * the gold stand from the east, so the two road ends both carry traffic and the compound is
 * approached from both sides like the reference frame. It is authored rather than taken from
 * `nearestRoadEnd` because every stand now sits east of centre: by distance alone all three would
 * draw from the east end, and the east approach is the pinched one (the hunting ground's rect
 * walls off everything east of x = 30 south of z = 6).
 *
 * `in` and `out` are the corners walked between the road and the lane head, in walk order. They
 * are separate lists so the two directions thread the 2.6-unit corridor between the wood stand
 * and the fort's west face on their own lines rather than head-on: `in` hugs the stand side,
 * `out` the fort side.
 */
interface StationRoute { end: Vec2; in: Vec2[]; out: Vec2[] }

const STATION_ROUTES: Record<string, StationRoute> = {
  // The two flanking stands need no corners: their lanes are clear of `CAMP_FOOTPRINT` in x, so
  // a shopper turns off the road straight into the lane exactly as it always did.
  'st-wood': { end: ROAD_ENDS[0], in: [], out: [] },
  'st-gold': { end: ROAD_ENDS[1], in: [], out: [] },
  // The meat stand is due south of the fort, so its shoppers thread the 2.6-unit corridor between
  // the wood stand's bench and the fort's west face (x = 13.7) and only then turn east under the
  // fort's south wall. The two lines sit 1.2 apart — the same spacing the road lanes use.
  'st-meat': {
    end: ROAD_ENDS[0],
    in: [v(11.8, 7.6)],
    out: [v(13.0, 8.8)],
  },
};

/** Route for a bench; benches with no authored route walk straight in off the nearest end. */
function routeOf(st: SellStation): StationRoute {
  return STATION_ROUTES[st.id] ?? { end: nearestRoadEnd(st.pos), in: [], out: [] };
}

/** Which end of the road this bench's shoppers arrive from and leave to. */
export function stationRoadEnd(st: SellStation): Vec2 {
  return routeOf(st).end;
}

/**
 * The walk in: down the road at the shopper's own lane z, then around the compound by the route's
 * corners, ending at the head of the bench's walk-in lane. From there `customersTick` steers the
 * shopper down the lane to its slot.
 */
export function arrivalPath(st: SellStation, roadZ: number): Vec2[] {
  const corners = routeOf(st).in;
  const laneX = queueLaneX(st);
  if (corners.length === 0) return [v(laneX, roadZ)];
  const path = [v(corners[0].x, roadZ), ...corners.map((c) => v(c.x, c.z))];
  const last = corners[corners.length - 1];
  path.push(v(laneX, last.z));
  return path;
}

/**
 * The walk home: out of the compound by the route's corners (reversed for the outbound side),
 * then onto the departure lane and off the end of the road. A served shopper starts at the
 * counter with the whole line standing behind it, so nothing is between it and the first corner.
 */
export function departurePath(st: SellStation, from: Vec2, roadZ: number): Vec2[] {
  const route = routeOf(st);
  const path = route.out.map((c) => v(c.x, c.z));
  const last = route.out[route.out.length - 1];
  path.push(v(last ? last.x : from.x, roadZ), v(route.end.x, roadZ));
  return path;
}

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
 * The line runs due south (+z), straight out from the counter and away from the fort behind it —
 * the compound is north of every stand, so south is "outward" for all three (Amendment 6A).
 *
 * The old -2.0 x-offset is gone with the mat that caused it: the line now runs squarely out from
 * the counter, which is what lets three fanned stands each keep a clear column of snow to queue
 * in. Due south rather than radially outward is deliberate — the hunting ground's rect starts at
 * x = 30, and a gold queue splayed to the south-east would file straight through its gate wall.
 */
export const QUEUE_OFFSET: Vec2 = v(0, 1.2);
export const QUEUE_SPACING = 1.1;

/**
 * How far the walk-in lane runs to the side of the standing line. Arrivals come up this lane,
 * level with their slot, and only then step across into it — the line is entered from the side,
 * never walked down. Wide enough that a shopper in the lane and one standing in the line do not
 * overlap, and narrow enough that the lane and the line share one gate gap in the fence ring.
 */
export const QUEUE_LANE_DX = -1.8;

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

// ---------------------------------------------------------------------------
// The compound fence ring (Amendment 6A)
// ---------------------------------------------------------------------------

/** Half-width of the road corridor the fence ring opens for, road edging included. */
const ROAD_GATE_HALF = 7.4;
/** Spacing of the ring's pickets. Matches the roadside fence's, so the two read as one fence. */
export const COMPOUND_POST_SPACING = 0.42;

/** An opening in the fence ring: everything within `half` of `pos` is left unbuilt. */
export interface FenceGap { pos: Vec2; half: number }

/** Where a straight run from `a` to `b` crosses the ring, if it does. */
function ringCrossings(a: Vec2, b: Vec2): Vec2[] {
  // |a + t(b-a) - centre|² = R², solved for t ∈ [0, 1].
  const dx = b.x - a.x, dz = b.z - a.z;
  const fx = a.x - DEPOT_POS.x, fz = a.z - DEPOT_POS.z;
  const qa = dx * dx + dz * dz;
  if (qa < 1e-9) return [];
  const qb = 2 * (fx * dx + fz * dz);
  const qc = fx * fx + fz * fz - COMPOUND_RADIUS * COMPOUND_RADIUS;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  const out: Vec2[] = [];
  for (const t of [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]) {
    if (t >= 0 && t <= 1) out.push(v(a.x + dx * t, a.z + dz * t));
  }
  return out;
}

/**
 * Every opening in the compound's fence: the road passing through east and west, each stand's
 * queue and walk-in lane heading out south, and every rail that reaches the fort.
 *
 * They are derived from the same data the walkers and the carts are driven by rather than
 * authored as numbers, so a stand or a rail that moves takes its gate with it. The road openings
 * are wide — a fourteen-unit road crossing a twenty-five-unit-wide compound is most of two of its
 * faces — which is exactly what the reference frame shows: fence between the buildings, open
 * where the traffic runs.
 */
export function compoundGaps(): FenceGap[] {
  const gaps: FenceGap[] = [];
  for (const sx of [-1, 1]) {
    // Chord from the ring's east/west pole to the ring point level with the road's edge.
    const inset = COMPOUND_RADIUS - Math.sqrt(COMPOUND_RADIUS ** 2 - ROAD_GATE_HALF ** 2);
    gaps.push({
      pos: v(DEPOT_POS.x + sx * COMPOUND_RADIUS, DEPOT_POS.z),
      half: Math.hypot(inset, ROAD_GATE_HALF) + 0.2,
    });
  }
  for (const st of stationDefs()) {
    // The line and the lane both run due south at a fixed x, so each crosses the ring where that
    // vertical meets it — NOT where the fort's radius through the stand does. Their two gaps sit
    // ~2.6 apart and merge into one shopper gate per stand.
    for (const x of [st.pos.x, queueLaneX(st)]) {
      const dx = x - DEPOT_POS.x;
      gaps.push({
        pos: v(x, DEPOT_POS.z + Math.sqrt(Math.max(0, COMPOUND_RADIUS ** 2 - dx * dx))),
        half: 1.4,
      });
    }
  }
  for (const rail of railDefs()) {
    for (let i = 1; i < rail.points.length; i++) {
      for (const p of ringCrossings(rail.points[i - 1], rail.points[i])) gaps.push({ pos: p, half: 1.8 });
    }
  }
  // The arrow stations stand ON the ring (Amendment 6B), so the fence opens around each tower's
  // base and the palisade reads as running into it — the reference frame's turrets on the wall.
  for (const t of turretDefs()) {
    if (t.dropsOnGround) gaps.push({ pos: t.pos, half: 1.6 });
  }
  return gaps;
}

/**
 * The ring's pickets, as world positions with the facing of the fence at that point. Emitting
 * posts rather than runs is what lets the ring be a circle at all — the roadside fence's runs are
 * axis-aligned — and it gives the tests something exact to measure a shopper's clearance against.
 */
export function compoundFencePosts(): { pos: Vec2; angle: number }[] {
  const circumference = 2 * Math.PI * COMPOUND_RADIUS;
  const n = Math.round(circumference / COMPOUND_POST_SPACING);
  const gaps = compoundGaps();
  const posts: { pos: Vec2; angle: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const pos = v(
      DEPOT_POS.x + Math.cos(a) * COMPOUND_RADIUS,
      DEPOT_POS.z + Math.sin(a) * COMPOUND_RADIUS,
    );
    if (gaps.some((g) => dist(g.pos, pos) < g.half)) continue;
    // The picket board is authored across x, so it faces outward when turned by the bearing.
    posts.push({ pos, angle: -a });
  }
  return posts;
}

/**
 * How far the plaza disc reaches. A shade past the fence so the ring stands ON the paving rather
 * than beside it, and the queues' first step out of the gate is still on the compound's ground.
 */
export const PLAZA_RADIUS = COMPOUND_RADIUS + 1.2;

/**
 * The compound's arrow stations (Amendment 6B), standing on the fence line itself at bearings
 * that fall in the ring's fenced arcs rather than in its gates: two on the short southern runs
 * between the shopper gates, two along the long northern run.
 *
 * Both southern stations are there for a reason — a raider's second course is the meat bench,
 * and the benches are all on the southern arc. Four towers all clustered north covered the depot
 * and left a bear eating out of the meat stand untouchable.
 *
 * The range is deliberately larger than the hunting turrets' 10, and just as deliberately not
 * much larger. A tower on the ring is `COMPOUND_RADIUS` from the fort, so anything under 13
 * cannot reach the depot — the one thing raiders actually come for — and a station that cannot
 * defend the depot is not a defence. Beyond that the number is what sets how much of the walk in
 * a raider spends under fire, and it was measured against the raid economics rather than guessed:
 * at 15, two stations hold ring 0 outright, leak ~9 meat a minute by ring 4 and ~14 by ring 8,
 * and all four hold every ring tested. At 17 two stations held everything and the second pair was
 * decoration; at 14 they leaked 15/min at ring 4, which reads as the towers not working.
 */
const ARROW_BEARINGS = [70, 110, 245, 295];
const ARROW_RANGE = 15;
/** How far from its tower an arrow station's pad stands, so the two never overlap. */
const ARROW_PAD_OFF = 3.5;

/**
 * Where the pad that arms arrow station `index` stands. The southern pair sits INSIDE the ring,
 * in the clear bays between the stands, because outside it is queue: the shopper columns run out
 * from that arc and a pad among them is a pad being walked over. The northern pair sits outside,
 * on the open snow its towers look out over.
 */
export function arrowPadPos(index: number): Vec2 {
  const inward = index < 2;
  return onArc(ARROW_BEARINGS[index], COMPOUND_RADIUS + (inward ? -ARROW_PAD_OFF : ARROW_PAD_OFF));
}

export function turretDefs(): Turret[] {
  const arrows: Turret[] = ARROW_BEARINGS.map((deg, i) => ({
    id: `arrow${i + 1}`,
    pos: onArc(deg, COMPOUND_RADIUS),
    range: ARROW_RANGE,
    cd: 0,
    active: false,
    output: 0,
    // No rail, no cart, no output pile: an arrow station drops what it kills where it falls.
    dropsOnGround: true,
  }));
  return [
    { id: 'turret1', pos: v(36, -9), range: 10, cd: 0, active: false, output: 0 },
    { id: 'turret2', pos: v(36, 9), range: 10, cd: 0, active: false, output: 0 },
    ...arrows,
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
    // The camp pads ring the fort's yard the way they always did, but the yard is now a compound:
    // the arc south of the fort belongs to the stands, their mats and three columns of shoppers,
    // so the pads that used to stand there moved to the shelf north of the road and to the two
    // clear bays between the queues. Every one of them is still inside the fence ring.
    p('p-camp1',      v(11, -4),   'wood', 12, { type: 'camp', tier: 1 }),
    p('p-axe',        v(-4, -4),   'cash', 10, { type: 'tool', tool: 'axe' }, 'p-camp1'),
    p('p-carry1',     v(-10, -4),  'cash', 30, { type: 'carry', add: 12 }, 'p-axe'),
    p('p-speed1',     v(-16, -4),  'cash', 40, { type: 'speed', mult: 1.3 }, 'p-axe'),
    p('p-gate-deep',  v(21.5, -6.5), 'wood', 15, { type: 'gate', zone: 'deepforest' }, 'p-axe'),
    p('p-camp2',      v(15.5, -10.5), 'wood', 40, { type: 'camp', tier: 2 }, 'p-gate-deep'),
    p('p-turret1',    v(31, -8),   'cash', 25, { type: 'machine', machineId: 'turret1' }, 'p-camp2'),
    p('p-sawmill1',   v(34, -16),  'cash', 30, { type: 'machine', machineId: 'sawmill1' }, 'p-camp2'),
    p('p-scythe',     v(4, -4),    'cash', 40, { type: 'tool', tool: 'scythe' }, 'p-turret1'),
    p('p-camp3',      v(15, -6),   'wood', 90, { type: 'camp', tier: 3 }, 'p-scythe'),
    p('p-gate-hunt',  v(28.5, 1), 'meat', 20, { type: 'gate', zone: 'hunting' }, 'p-camp3'),
    p('p-turret2',    v(31, 8),    'cash', 50, { type: 'machine', machineId: 'turret2' }, 'p-gate-hunt'),
    // Sits off the fort's south-east corner, clear of the camp footprint, the rail gates and the
    // road fence, so the player walks past it on the way in from the benches.
    p('p-distributor', v(25, -8), 'cash', 100, { type: 'distributor' }, 'p-camp3'),
    // The camp's defence (Amendment 6B). Each pad stands a couple of units in from the tower it
    // arms, so buying one is done from inside the compound looking out. The first pair comes with
    // the Stockade and the second with the Fort: a camp with meat worth raiding is exactly a camp
    // that has built something to keep it in.
    p('p-arrow1', arrowPadPos(0), 'cash', 60, { type: 'machine', machineId: 'arrow1' }, 'p-camp2'),
    p('p-arrow2', arrowPadPos(1), 'cash', 60, { type: 'machine', machineId: 'arrow2' }, 'p-camp2'),
    p('p-arrow3', arrowPadPos(2), 'cash', 90, { type: 'machine', machineId: 'arrow3' }, 'p-camp3'),
    p('p-arrow4', arrowPadPos(3), 'cash', 90, { type: 'machine', machineId: 'arrow4' }, 'p-camp3'),
    p('p-gate-quarry', v(-24, -5), 'cash', 60, { type: 'gate', zone: 'quarry' }, 'p-sawmill1'),
    p('p-pickaxe',    v(-31, -8),  'cash', 30, { type: 'pickaxe' }, 'p-gate-quarry'),
    p('p-carry2',     v(-10, 4),   'gold', 8,  { type: 'carry', add: 24 }, 'p-pickaxe'),
    p('p-speed2',     v(-16, 4),   'gold', 10, { type: 'speed', mult: 1.3 }, 'p-pickaxe'),
    p('p-camp4',      v(27.5, -11.5), 'gold', 12, { type: 'camp', tier: 4 }, 'p-pickaxe'),
    // The one repeatable pad (Amendment 5B). It mirrors the distributor across the road, off the
    // fort's south-west corner: outside `CAMP_FOOTPRINT`, south of the shoppers' corridor (which
    // threads z ∈ [-6.75, -4.55] on its way to the gold bench), and inside the south fence's
    // depot gap, so the player walks past it coming and going from the camp. It hangs off the
    // Fort rather than standing open from the first frame — an expedition is what a camp mounts
    // once it is a camp, and the price is priced for a late-game economy.
    p('p-expedition', v(20, -10.5), 'cash', EXPEDITION_BASE, { type: 'expedition' }, 'p-camp3', true),
  ];
}
