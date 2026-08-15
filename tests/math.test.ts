import { describe, expect, it } from 'vitest';
import {
  dist, hash01, inRect, makeRng, norm, pointOnPolyline, polylineLength, pushOut, toward, v,
} from '../src/game/math';

describe('math', () => {
  it('dist measures euclidean distance on x/z', () => {
    expect(dist(v(0, 0), v(3, 4))).toBe(5);
  });

  it('norm normalizes and handles zero vector', () => {
    expect(norm(v(10, 0))).toEqual({ x: 1, z: 0 });
    expect(norm(v(0, 0))).toEqual({ x: 0, z: 0 });
  });

  it('toward steps at most maxStep and lands exactly on target', () => {
    expect(toward(v(0, 0), v(10, 0), 4)).toEqual({ x: 4, z: 0 });
    expect(toward(v(9, 0), v(10, 0), 4)).toEqual({ x: 10, z: 0 });
  });

  it('inRect/pushOut block a rectangle', () => {
    const r = { x0: 0, z0: 0, x1: 10, z1: 10 };
    expect(inRect(v(5, 5), r)).toBe(true);
    expect(inRect(v(-1, 5), r)).toBe(false);
    expect(pushOut(v(1, 5), r)).toEqual({ x: 0, z: 5 });   // nearest edge is x0
    expect(pushOut(v(5, 9), r)).toEqual({ x: 5, z: 10 });  // nearest edge is z1
    expect(pushOut(v(-1, 5), r)).toEqual({ x: -1, z: 5 }); // outside → unchanged
  });

  it('polyline length and interpolation', () => {
    const pts = [v(0, 0), v(10, 0), v(10, 5)];
    expect(polylineLength(pts)).toBe(15);
    expect(pointOnPolyline(pts, 0)).toEqual({ x: 0, z: 0 });
    expect(pointOnPolyline(pts, 12)).toEqual({ x: 10, z: 2 });
    expect(pointOnPolyline(pts, 99)).toEqual({ x: 10, z: 5 });
  });

  it('hash01 is stable, in range, and spreads sequential ids apart', () => {
    expect(hash01('cust7')).toBe(hash01('cust7'));
    const ids = Array.from({ length: 64 }, (_, i) => hash01(`cust${i + 1}z`));
    for (const x of ids) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    // Sequential ids must not be CORRELATED: shoppers derive their walk lane from this and
    // neighbouring ids spawn a fraction of a second apart, so `hash01('cust1z')` and
    // `hash01('cust2z')` landing together means two shoppers walking inside each other. Two
    // independent uniforms average 1/3 apart; reading FNV's low bits straight averaged ~0.003.
    // (The minimum gap is deliberately not asserted — for a uniform hash, some neighbouring
    // pair being close is expected, not a defect.)
    let gap = 0;
    for (let i = 1; i < ids.length; i++) gap += Math.abs(ids[i] - ids[i - 1]);
    expect(gap / (ids.length - 1)).toBeGreaterThan(0.25);
    // Spread across the range, not clustered in one corner of it.
    const buckets = new Set(ids.map((x) => Math.floor(x * 4)));
    expect(buckets.size).toBe(4);
  });

  it('makeRng is deterministic in [0,1)', () => {
    const a = makeRng(42), b = makeRng(42), c = makeRng(43);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(new Set(seqA).size).toBe(3);
    expect(seqA).not.toEqual([c(), c(), c()]);
    for (const x of seqA) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
