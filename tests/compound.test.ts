import { describe, expect, it } from 'vitest';
import {
  CAMP_FOOTPRINT, COMPOUND_RADIUS, DEPOT_POS, PLAZA_RADIUS, ZONE_RECTS, arrivalPath,
  compoundFencePosts, compoundGaps, departurePath, padDefs, queueAnchor, queueLaneX, railDefs,
  stationDefs, stationRoadEnd, treeDefs, turretDefs,
} from '../src/content/map';
import { CUSTOMER_QUEUE_CAP, PAD_RANGE } from '../src/content/balance';
import { dist, inRect, v } from '../src/game/math';
import type { Vec2 } from '../src/game/math';

/** Every standing spot a bench's line can ever use, plus the lane beside it. */
function queueSpots(st: ReturnType<typeof stationDefs>[number]): Vec2[] {
  const spots: Vec2[] = [];
  for (let slot = 0; slot < CUSTOMER_QUEUE_CAP; slot++) {
    const anchor = queueAnchor(st, slot);
    spots.push(anchor, v(queueLaneX(st), anchor.z));
  }
  return spots;
}

const stations = stationDefs();

/**
 * The compound (Amendment 6A): the fort in the middle, the three stands on an arc at its feet
 * inside a fenced ring, and every line of shoppers running outward through a gate gap. The
 * numbers below are all derived from `COMPOUND_RADIUS` and the stands' bearings, so this file
 * measures the relationships the layout has to hold rather than the coordinates it happens to
 * produce.
 */
describe('camp compound layout', () => {
  it('stands on an arc around the fort, inside the fence ring', () => {
    for (const st of stations) {
      const r = dist(st.pos, DEPOT_POS);
      expect(r).toBeLessThan(COMPOUND_RADIUS);          // inside the ring
      expect(r).toBeGreaterThan(CAMP_FOOTPRINT.x1 - DEPOT_POS.x + 2); // clear of the building
      expect(st.pos.z).toBeGreaterThan(CAMP_FOOTPRINT.z1); // and south of it, at its feet
    }
    // The three of them are spread around the arc, not bunched on one bearing.
    for (const a of stations)
      for (const b of stations)
        if (a.id < b.id) expect(dist(a.pos, b.pos)).toBeGreaterThan(6);
  });

  it('keeps every counter, mat and standing spot out of the fort', () => {
    for (const st of stations) {
      expect(inRect(st.pos, CAMP_FOOTPRINT)).toBe(false);
      expect(inRect(st.matPos, CAMP_FOOTPRINT)).toBe(false);
      for (const spot of queueSpots(st)) expect(inRect(spot, CAMP_FOOTPRINT)).toBe(false);
    }
  });

  it('puts each mat inside the compound and each queue outside it', () => {
    for (const st of stations) {
      // The mat sits behind the counter, on the plaza, where the player collects it.
      expect(dist(st.matPos, DEPOT_POS)).toBeLessThan(COMPOUND_RADIUS);
      // Slot 0 is the shopper being served, at the counter; everyone still waiting stands out
      // beyond the fence, which is what the reference frame shows.
      expect(dist(queueAnchor(st, 0), DEPOT_POS)).toBeLessThan(COMPOUND_RADIUS);
      for (let slot = 2; slot < CUSTOMER_QUEUE_CAP; slot++) {
        expect(dist(queueAnchor(st, slot), DEPOT_POS)).toBeGreaterThan(COMPOUND_RADIUS);
      }
    }
  });

  it('runs every line outward, away from the fort', () => {
    for (const st of stations) {
      let last = dist(st.pos, DEPOT_POS);
      for (let slot = 0; slot < CUSTOMER_QUEUE_CAP; slot++) {
        const r = dist(queueAnchor(st, slot), DEPOT_POS);
        expect(r).toBeGreaterThan(last);
        last = r;
      }
    }
  });

  it('keeps stands, mats and queues out of every gated zone', () => {
    for (const st of stations) {
      for (const p of [st.pos, st.matPos, ...queueSpots(st)]) {
        for (const rect of Object.values(ZONE_RECTS)) expect(inRect(p, rect)).toBe(false);
      }
    }
  });

  it('opens the fence for the road, for every shopper lane and for every rail', () => {
    const posts = compoundFencePosts();
    expect(posts.length).toBeGreaterThan(40); // there is still a fence, not just gates
    const clear = (p: Vec2, room: number): void => {
      const near = posts.filter((post) => dist(post.pos, p) < room);
      expect(near.map((n) => `${n.pos.x.toFixed(1)},${n.pos.z.toFixed(1)}`)).toEqual([]);
    };
    // The road, at both edges and both crossings.
    for (const sx of [-1, 1])
      for (const z of [-7, 0, 7]) clear(v(DEPOT_POS.x + sx * COMPOUND_RADIUS, z), 1.0);
    // Each stand's line and lane, where they cross the ring.
    for (const st of stations) {
      for (const x of [st.pos.x, queueLaneX(st)]) {
        const dx = x - DEPOT_POS.x;
        clear(v(x, Math.sqrt(COMPOUND_RADIUS ** 2 - dx * dx)), 1.0);
      }
    }
    // Every rail that reaches the fort.
    for (const rail of railDefs()) {
      for (const p of rail.points) {
        if (Math.abs(dist(p, DEPOT_POS) - COMPOUND_RADIUS) < 1.5) clear(p, 1.2);
      }
    }
  });

  it('rings the compound with fence rather than a token stretch of it', () => {
    const posts = compoundFencePosts();
    // Posts on all four quadrants: a ring, not one wall.
    const quadrants = new Set(posts.map((p) => {
      const dx = p.pos.x - DEPOT_POS.x, dz = p.pos.z - DEPOT_POS.z;
      return `${dx > 0 ? 'e' : 'w'}${dz > 0 ? 's' : 'n'}`;
    }));
    expect(quadrants.size).toBe(4);
    for (const post of posts) {
      expect(dist(post.pos, DEPOT_POS)).toBeCloseTo(COMPOUND_RADIUS, 6);
      expect(compoundGaps().some((g) => dist(g.pos, post.pos) < g.half)).toBe(false);
    }
  });

  it('paves a plaza wide enough to carry the fence and the gate mouths', () => {
    expect(PLAZA_RADIUS).toBeGreaterThan(COMPOUND_RADIUS);
    for (const st of stations) expect(dist(st.pos, DEPOT_POS)).toBeLessThan(PLAZA_RADIUS);
  });

  it('routes each stand off a road end and never through the fort', () => {
    const ends = new Set(stations.map((st) => stationRoadEnd(st).x));
    expect(ends.size).toBe(2); // both ends of the road carry traffic
    for (const st of stations) {
      const end = stationRoadEnd(st);
      // Walk the whole authored route, in and out, and check every metre of it.
      const inbound = [v(end.x, end.z), ...arrivalPath(st, end.z)];
      const outbound = [queueAnchor(st, 0), ...departurePath(st, queueAnchor(st, 0), end.z + 1.2)];
      for (const path of [inbound, outbound]) {
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          const steps = Math.max(1, Math.ceil(dist(a, b) / 0.25));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const p = v(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
            expect(inRect(p, CAMP_FOOTPRINT)).toBe(false);
          }
        }
      }
    }
  });

  it('stands its arrow towers on the fence line, out of the gates and off the queues', () => {
    const arrows = turretDefs().filter((t) => t.dropsOnGround);
    expect(arrows).toHaveLength(4);
    const posts = compoundFencePosts();
    for (const t of arrows) {
      // On the ring itself, in a stretch the fence actually runs along (its own gap aside).
      expect(dist(t.pos, DEPOT_POS)).toBeCloseTo(COMPOUND_RADIUS, 6);
      const nearestPost = Math.min(...posts.map((p) => dist(p.pos, t.pos)));
      expect(nearestPost).toBeLessThan(3.5);
      // Clear of everything a walker occupies: a tower base is 0.9 across, a walker 0.4.
      for (const st of stations) {
        for (const spot of queueSpots(st)) expect(dist(t.pos, spot)).toBeGreaterThan(1.3);
        expect(dist(t.pos, st.pos)).toBeGreaterThan(2.0);
      }
    }
    // North and south, so the depot and the meat bench are both under cover.
    expect(arrows.filter((t) => t.pos.z > DEPOT_POS.z).length).toBeGreaterThanOrEqual(2);
    expect(arrows.filter((t) => t.pos.z < DEPOT_POS.z).length).toBeGreaterThanOrEqual(2);
  });

  it('stands the compound in a clearing, with nothing growing through it', () => {
    // Browser verification found conifers growing up through the plaza paving and burying the
    // north palisade and both towers on it: the starter forest's rows and the wilderness scatter
    // both reach z = -9.5, well inside a ring of radius 13.
    for (const tree of treeDefs()) {
      expect(dist(tree.pos, DEPOT_POS)).toBeGreaterThan(PLAZA_RADIUS);
    }
    // The clearing is a clearing, not a deforestation: the forest is still all but intact.
    expect(treeDefs().length).toBeGreaterThan(3000);
  });

  it('keeps every pad clear of the stands, their mats and their queues', () => {
    // A pad the player stands on is 1.5 across, and the things below are furniture a shopper
    // queues at: overlapping them would put the pad's card inside a bench.
    const ROOM = PAD_RANGE + 0.8;
    for (const pad of padDefs()) {
      for (const st of stations) {
        expect(dist(pad.pos, st.pos)).toBeGreaterThan(ROOM);
        expect(dist(pad.pos, st.matPos)).toBeGreaterThan(ROOM);
        for (const spot of queueSpots(st)) expect(dist(pad.pos, spot)).toBeGreaterThan(ROOM);
      }
    }
  });
});
