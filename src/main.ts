import { createInitialState } from './game/init';
import { createInput, intentFrom } from './game/input';
import { update } from './game/update';
import { Renderer } from './render/renderer';

const container = document.getElementById('app')!;
const state = createInitialState();
const input = createInput(container);
const renderer = new Renderer(container);
renderer.buildStatic(state);

const FIXED = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dtReal;
  while (acc >= FIXED) {
    update(state, intentFrom(input), FIXED);
    acc -= FIXED;
  }
  renderer.applyEvents(state.events.splice(0));
  renderer.sync(state, dtReal);
  renderer.render(dtReal);
}
requestAnimationFrame(frame);
