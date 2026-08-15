import { describe, expect, it } from 'vitest';
import {
  dist, inRect, makeRng, norm, pointOnPolyline, polylineLength, pushOut, toward, v,
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
