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
  onResume: () => { paused = false; ui.showPause(false); },
  onRestart: () => {
    clearSave();
    state = createInitialState();
    renderer.rebuild(state);
    ui.reset();
    paused = false;
    ui.showPause(false);
  },
  onToggleMute: () => toggleMute(),
}, isMuted());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    paused = !paused;
    ui.showPause(paused);
  }
  if (e.key.toLowerCase() === 'm') ui.setMuted(toggleMute());
});
window.addEventListener('pointerdown', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });
window.addEventListener('beforeunload', () => saveGame(state));

const FIXED = 1 / 60;
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
