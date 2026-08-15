export interface Vec2 { x: number; z: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export const v = (x: number, z: number): Vec2 => ({ x, z });

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function add(a: Vec2, b: Vec2): Vec2 { return v(a.x + b.x, a.z + b.z); }

export function scale(a: Vec2, s: number): Vec2 { return v(a.x * s, a.z * s); }

export function norm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.z);
  return l < 1e-6 ? v(0, 0) : v(a.x / l, a.z / l);
}

/** Move from→to by at most maxStep, landing exactly on the target when close. */
export function toward(from: Vec2, to: Vec2, maxStep: number): Vec2 {
  const d = dist(from, to);
  if (d <= maxStep) return v(to.x, to.z);
  return add(from, scale(norm(v(to.x - from.x, to.z - from.z)), maxStep));
}

export function inRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
}

/** If p is inside r, push it to the nearest edge; otherwise return it unchanged. */
export function pushOut(p: Vec2, r: Rect): Vec2 {
  if (!inRect(p, r)) return v(p.x, p.z);
  const dL = p.x - r.x0, dR = r.x1 - p.x, dT = p.z - r.z0, dB = r.z1 - p.z;
  const m = Math.min(dL, dR, dT, dB);
  if (m === dL) return v(r.x0, p.z);
  if (m === dR) return v(r.x1, p.z);
  if (m === dT) return v(p.x, r.z0);
  return v(p.x, r.z1);
}

export function polylineLength(pts: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** Point at arc-length s along the polyline (clamped to the ends). */
export function pointOnPolyline(pts: Vec2[], s: number): Vec2 {
  if (s <= 0) return v(pts[0].x, pts[0].z);
  let rest = s;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (rest <= seg) {
      const t = seg < 1e-6 ? 0 : rest / seg;
      return v(
        pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t,
      );
    }
    rest -= seg;
  }
  const last = pts[pts.length - 1];
  return v(last.x, last.z);
}

/**
 * Stable 0..1 from an entity id (FNV-1a). Per-entity variation derived from this needs no state
 * field and no RNG call order, so it survives saves, reloads and being computed out of sequence —
 * used for both art variation (coat colour, gait) and simulation jitter (walk lanes, speeds).
 */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // FNV's low bits hardly move when two ids differ only near the end — reading them straight
  // (the old `% 100000`) put 'cust1z' and 'cust2z' 0.003 apart, i.e. two shoppers spawning on
  // top of each other. One avalanche round spreads the difference over the whole word first,
  // and the value is taken from the top bits.
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 8) / 0x1000000;
}

/** Deterministic LCG in [0,1) so the map layout is stable across runs. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
