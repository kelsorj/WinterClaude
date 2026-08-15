import { initAudio, isMuted, playFor, toggleMute } from './audio/sfx';
import { createInitialState } from './game/init';
import { createInput, intentFrom } from './game/input';
import { clearSave, loadGame, saveGame } from './game/save';
import { update } from './game/update';
import { Renderer } from './render/renderer';
import { initUI } from './ui/ui';

const container = document.getElementById('app')!;
let state = loadGame() ?? createInitialState();
const input = createInput(container);
const renderer = new Renderer(container);
renderer.buildStatic(state);
let paused = false;

const ui = initUI({
  onResume: () => { paused = false; ui.showPause(false, state); },
  onRestart: () => {
    clearSave();
    state = createInitialState();
    renderer.rebuild(state);
    paused = false;
    ui.showPause(false, state);
  },
  onToggleMute: () => toggleMute(),
}, isMuted());

window.addEventListener('keydown', (e) => {
  if (e.repeat) return; // holding M must not strobe the mute flag
  if (e.key === 'Escape') {
    paused = !paused;
    ui.showPause(paused, state);
  }
  if (e.key.toLowerCase() === 'm') ui.setMuted(toggleMute());
});
// Not `once`: the first keypress may be an Escape, which grants no audio activation, and a
// backgrounded tab suspends the context. initAudio is a cheap no-op once the clock is running.
window.addEventListener('pointerdown', initAudio);
window.addEventListener('keydown', initAudio);
document.addEventListener('visibilitychange', initAudio);
window.addEventListener('beforeunload', () => saveGame(state));

const FIXED = 1 / 60;

/**
 * Dev-only handle on the live simulation, for verifying behaviour in the browser: what a shopper
 * actually walks through, whether that bear is raiding, what a save restored. `step` runs the
 * same fixed tick the frame loop does, which is what makes a browser check reproducible — a
 * backgrounded tab throttles `requestAnimationFrame` to a crawl, so waiting for a queue to form
 * in real time is not a test, it is a hope.
 *
 * `import.meta.env.DEV` is a compile-time constant, so the production bundle drops all of this.
 */
if (import.meta.env.DEV) {
  (window as unknown as { frostfall: unknown }).frostfall = {
    state: () => state,
    step: (seconds: number) => {
      for (let t = 0; t < seconds; t += FIXED) update(state, { x: 0, z: 0 }, FIXED);
      return state.time;
    },
  };
}
let acc = 0;
let last = performance.now();
let saveTimer = 0;

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
    saveTimer += dtReal;
    if (saveTimer >= 5) {
      saveTimer = 0;
      saveGame(state);
    }
  }
  const events = state.events.splice(0);
  renderer.applyEvents(events);
  playFor(events);
  renderer.sync(state, dtReal);
  renderer.render(dtReal);
  ui.update(state);
}
requestAnimationFrame(frame);
