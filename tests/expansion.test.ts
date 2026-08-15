import { describe, expect, it } from 'vitest';
import { RING_WIDTH, WORLD_BOUNDS, ZONE_RECTS, ringDefs, worldBounds } from '../src/content/map';
import { EXPEDITION_BASE } from '../src/content/balance';
import { applyExpansion, escalate, expeditionCost } from '../src/game/systems/expansion';
import { createInitialState } from '../src/game/init';
import { inRect } from '../src/game/math';

describe('worldBounds', () => {
  it('starts at the authored 10× map and grows a fixed ring per expedition', () => {
    expect(worldBounds(0)).toEqual(WORLD_BOUNDS);
    expect(worldBounds(1)).toEqual({
      x0: WORLD_BOUNDS.x0 - RING_WIDTH, z0: WORLD_BOUNDS.z0 - RING_WIDTH,
      x1: WORLD_BOUNDS.x1 + RING_WIDTH, z1: WORLD_BOUNDS.z1 + RING_WIDTH,
    });
    expect(worldBounds(3)).toEqual({ x0: -280, z0: -215, x1: 280, z1: 215 });
  });

  it('never shrinks below ring 0, whatever nonsense it is handed', () => {
    expect(worldBounds(-4)).toEqual(WORLD_BOUNDS);
  });
});

describe('expeditionCost', () => {
  it('escalates 200 → 320 → 512 → 819 …', () => {
    expect([0, 1, 2, 3, 4].map(expeditionCost)).toEqual([200, 320, 512, 819, 1310]);
    expect(expeditionCost(0)).toBe(EXPEDITION_BASE);
  });

  /**
   * The live pad escalates by calling `escalate` once per purchase; a load replays the whole
   * sequence from the ring count. Rounding compounds, so the two must agree exactly or a
   * reloaded camp would find its expedition re-priced.
   */
  it('replays exactly what stepwise escalation produces', () => {
    let live = EXPEDITION_BASE;
    for (let n = 0; n <= 8; n++) {
      expect(expeditionCost(n)).toBe(live);
      live = escalate(live);
    }
  });
});

describe('ringDefs', () => {
  it('is deterministic: the same ring generates the same world twice', () => {
    for (const ring of [1, 2, 5]) expect(ringDefs(ring)).toEqual(ringDefs(ring));
  });

  it('gives adjacent rings genuinely different layouts', () => {
    // Seeds are spread by a multiplicative hash precisely so ring n+1 is not a near-copy of n.
    const first = (ring: number): string => JSON.stringify(ringDefs(ring).trees.slice(0, 5));
    expect(first(1)).not.toBe(first(2));
    expect(first(2)).not.toBe(first(3));
  });

  it('seeds each ring with a wilderness worth walking out to', () => {
    for (let ring = 1; ring <= 4; ring++) {
      const defs = ringDefs(ring);
      expect(defs.trees.length).toBeGreaterThanOrEqual(300);
      expect(defs.trees.length).toBeLessThanOrEqual(500);
      expect(defs.bears.length).toBeGreaterThanOrEqual(12); // 3-4 packs of four
      expect(defs.bears.length).toBeLessThanOrEqual(16);
      expect(defs.seams.length).toBeGreaterThanOrEqual(3);
      expect(defs.seams.length).toBeLessThanOrEqual(4);
    }
  });

  it('puts every entity in the new band only, off the road and in open country', () => {
    for (let ring = 1; ring <= 4; ring++) {
      const defs = ringDefs(ring);
      const outer = worldBounds(ring), inner = worldBounds(ring - 1);
      for (const e of [...defs.trees, ...defs.bears, ...defs.seams]) {
        expect(inRect(e.pos, outer)).toBe(true);   // inside the world it just created
        expect(inRect(e.pos, inner)).toBe(false);  // and nothing dropped on top of the old one
        expect(Math.abs(e.pos.z)).toBeGreaterThanOrEqual(10); // clear of the road
        // An expedition opens country; it never adds a gate, so nothing can need one.
        expect(e.zone).toBe('start');
        for (const rect of Object.values(ZONE_RECTS)) expect(inRect(e.pos, rect)).toBe(false);
      }
    }
  });

  it('fills the whole ring rather than piling up on one side', () => {
    const trees = ringDefs(1).trees;
    const outer = worldBounds(1);
    for (const arm of [
      trees.filter((t) => t.pos.z < WORLD_BOUNDS.z0),
      trees.filter((t) => t.pos.z > WORLD_BOUNDS.z1),
      trees.filter((t) => t.pos.x < WORLD_BOUNDS.x0),
      trees.filter((t) => t.pos.x > WORLD_BOUNDS.x1),
    ]) expect(arm.length).toBeGreaterThan(20);
    expect(Math.min(...trees.map((t) => t.pos.x))).toBeLessThan(outer.x0 + RING_WIDTH);
    expect(Math.max(...trees.map((t) => t.pos.x))).toBeGreaterThan(outer.x1 - RING_WIDTH);
  });
});

describe('applyExpansion', () => {
  it('appends a ring without disturbing the world already there', () => {
    const state = createInitialState();
    const before = {
      trees: state.trees.length, bears: state.bears.length, seams: state.seams.length,
    };
    const firstTree = state.trees[0];
    const defs = ringDefs(1);

    applyExpansion(state, 1);

    expect(state.trees.length).toBe(before.trees + defs.trees.length);
    expect(state.bears.length).toBe(before.bears + defs.bears.length);
    expect(state.seams.length).toBe(before.seams + defs.seams.length);
    expect(state.trees[0]).toBe(firstTree); // appended, never rebuilt
    expect(state.trees[before.trees].pos).toEqual(defs.trees[0].pos);
  });

  it('gives ring entities stable, unique, ring-tagged ids', () => {
    const state = createInitialState();
    applyExpansion(state, 1);
    applyExpansion(state, 2);

    const ids = [...state.trees, ...state.bears, ...state.seams].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.trees.some((t) => t.id === 'ring1-tree0')).toBe(true);
    expect(state.bears.some((b) => b.id === 'ring2-bear0')).toBe(true);

    // The same ring applied to a fresh state lands in the same places under the same ids —
    // which is the whole reason a save can store a count instead of a world.
    const twin = createInitialState();
    applyExpansion(twin, 1);
    const mine = state.trees.filter((t) => t.id.startsWith('ring1-'));
    expect(twin.trees.filter((t) => t.id.startsWith('ring1-'))).toEqual(mine);
  });

  it('starts ring bears asleep at home and ring seams unmined', () => {
    const state = createInitialState();
    applyExpansion(state, 1);
    for (const bear of state.bears.filter((b) => b.id.startsWith('ring1-'))) {
      expect(bear.state).toBe('sleep');
      expect(bear.home).toEqual(bear.pos);
      expect(bear.hp).toBe(bear.maxHp);
    }
    for (const seam of state.seams.filter((s) => s.id.startsWith('ring1-'))) {
      expect(seam.respawn).toBe(0);
    }
  });
});
