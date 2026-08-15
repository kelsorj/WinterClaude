import { createInitialState } from './game/init';
import { createInput, intentFrom } from './game/input';
import { update } from './game/update';
import { Renderer } from './render/renderer';
import { initUI } from './ui/ui';

const container = document.getElementById('app')!;
let state = createInitialState();
const input = createInput(container);
const renderer = new Renderer(container);
renderer.buildStatic(state);
let paused = false;

const ui = initUI({
  onResume: () => { paused = false; ui.showPause(false); },
  onRestart: () => {
    state = createInitialState();
    renderer.rebuild(state);
    ui.reset();
    paused = false;
    ui.showPause(false);
  },
  onToggleMute: () => false, // audio arrives in Task 17
}, false);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    paused = !paused;
    ui.showPause(paused);
  }
});

const FIXED = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused) {
    acc += dtReal;
    while (acc >= FIXED) {
      update(state, intentFrom(input), FIXED);
      acc -= FIXED;
    }
  }
  renderer.applyEvents(state.events.splice(0));
  renderer.sync(state, dtReal);
  renderer.render(dtReal);
  ui.update(state);
}
requestAnimationFrame(frame);
