import { norm, v, type Vec2 } from './math';

export interface InputState {
  keys: Set<string>;
  drag: Vec2 | null; // pointer delta in screen px: x=right, z=down
}

/** Wire DOM listeners. Only used by main.ts; tests exercise intentFrom directly. */
export function createInput(el: HTMLElement): InputState {
  const input: InputState = { keys: new Set(), drag: null };
  window.addEventListener('keydown', (e) => input.keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  let anchor: { x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => { anchor = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { anchor = null; input.drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!anchor) return;
    const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
    input.drag = Math.hypot(dx, dy) < 4 ? null : v(dx, dy);
  });
  return input;
}

// Camera sits toward +x/+z looking back at the player.
const UP = v(-Math.SQRT1_2, -Math.SQRT1_2);
const RIGHT = v(Math.SQRT1_2, -Math.SQRT1_2);

export function intentFrom(input: InputState): Vec2 {
  let ix = 0, iy = 0;
  const k = input.keys;
  if (k.has('w') || k.has('arrowup')) iy += 1;
  if (k.has('s') || k.has('arrowdown')) iy -= 1;
  if (k.has('d') || k.has('arrowright')) ix += 1;
  if (k.has('a') || k.has('arrowleft')) ix -= 1;
  if (input.drag) { ix = input.drag.x; iy = -input.drag.z; }
  return norm(v(RIGHT.x * ix + UP.x * iy, RIGHT.z * ix + UP.z * iy));
}
