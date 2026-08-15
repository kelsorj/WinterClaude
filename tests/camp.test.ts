import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMP_FOOTPRINT, DEPOT_POS } from '../src/content/map';
import { CAMP_TIERS, makeCampTier } from '../src/render/meshes';

/**
 * Anything whose underside sits below this counts as something a walker can hit. A shopper is
 * about 1.6 units tall; the margin covers the bob in their walk cycle. Geometry that starts
 * ABOVE it is an eave — the tier-3 tower roofs and the Grand Fort's snow course both overhang
 * the walls slightly, which is what roofs do, and no shopper's head is up there to meet them.
 */
const WALK_HEIGHT = 2.0;

/** Every mesh in a built tier, with its world-space box, placed where the renderer places it. */
function tierParts(tier: number): { box: THREE.Box3; name: string }[] {
  const g = makeCampTier(tier);
  g.position.set(DEPOT_POS.x, 0, DEPOT_POS.z);
  g.updateWorldMatrix(true, true);
  const parts: { box: THREE.Box3; name: string }[] = [];
  g.traverse((o) => {
    if (o === g || !(o as THREE.Mesh).isMesh) return;
    const box = new THREE.Box3().setFromObject(o);
    if (Number.isFinite(box.min.x)) parts.push({ box, name: CAMP_TIERS[tier].name });
  });
  return parts;
}

/**
 * `CAMP_FOOTPRINT` is the rect the shoppers' road lanes are routed around, and the departure
 * lane passes within a quarter-unit of its north face. That only means anything if the building
 * actually fits inside the rect — `customers.test.ts` walks the simulation against it, but
 * nothing until this file checked it against the geometry the renderer really builds.
 */
describe('camp buildings fit inside CAMP_FOOTPRINT', () => {
  for (let tier = 0; tier < CAMP_TIERS.length; tier++) {
    it(`tier ${tier} (${CAMP_TIERS[tier].name}) keeps every walkable-height part inside the rect`, () => {
      const offenders = tierParts(tier)
        .filter((p) => p.box.min.y < WALK_HEIGHT)
        .filter((p) => p.box.min.x < CAMP_FOOTPRINT.x0 - 1e-6 || p.box.max.x > CAMP_FOOTPRINT.x1 + 1e-6
          || p.box.min.z < CAMP_FOOTPRINT.z0 - 1e-6 || p.box.max.z > CAMP_FOOTPRINT.z1 + 1e-6)
        .map((p) => `x[${p.box.min.x.toFixed(2)},${p.box.max.x.toFixed(2)}] `
          + `z[${p.box.min.z.toFixed(2)},${p.box.max.z.toFixed(2)}]`);
      expect(offenders).toEqual([]);
    });
  }

  it('still builds a fort worth the name — the Grand Fort fills the rect it fits in', () => {
    // The fix was to pull the walls in, not to shrink the building into the middle of the yard:
    // the outermost surfaces should land ON the rect, within a log's radius of it.
    const parts = tierParts(4).filter((p) => p.box.min.y < WALK_HEIGHT);
    const reach = (pick: (b: THREE.Box3) => number) => Math.max(...parts.map((p) => pick(p.box)));
    expect(reach((b) => b.max.x)).toBeGreaterThan(CAMP_FOOTPRINT.x1 - 0.3);
    expect(reach((b) => -b.min.x)).toBeGreaterThan(-CAMP_FOOTPRINT.x0 - 0.3);
    expect(reach((b) => b.max.z)).toBeGreaterThan(CAMP_FOOTPRINT.z1 - 0.3);
    expect(reach((b) => -b.min.z)).toBeGreaterThan(-CAMP_FOOTPRINT.z0 - 0.3);
  });

  it('keeps the Grand Fort doorway open for the player to walk in through', () => {
    // The south wall runs as two stubs with a gap at the middle; the crew posts are placed
    // against |x| < 1.9 (see init.test.ts), so the gap must be at least that wide.
    const southLogs = tierParts(4)
      .filter((p) => p.box.min.y < WALK_HEIGHT && p.box.min.z > DEPOT_POS.z + 3.5);
    expect(southLogs.length).toBeGreaterThan(0);
    const gapEdge = Math.min(...southLogs.map((p) => Math.abs(p.box.min.x - DEPOT_POS.x)));
    expect(gapEdge).toBeGreaterThanOrEqual(1.9 - 1e-6);
  });
});
