import { drawIcon, type IconKind } from '../render/meshes';
import type { Currency, GameState } from '../game/state';

export interface UICallbacks {
  onRestart(): void;
  onResume(): void;
  onToggleMute(): boolean; // returns new muted flag
}

export interface UIHandles {
  showPause(show: boolean): void;
  /** Keep the pause-menu button label in sync when mute is toggled by the M key. */
  setMuted(muted: boolean): void;
  /** Drop win-screen state so a fresh camp can win again. */
  reset(): void;
  update(state: GameState): void;
}

const RES_KEYS: Currency[] = ['cash', 'wood', 'meat', 'gold'];
const ICON_PX = 26;

/**
 * HUD icons are painted with the same `drawIcon` the world labels use, so a gold bar in the
 * sidebar is the same unmistakable gold bar seen on the bench bubbles (spec Amendment 1C/1D).
 * Emoji were dropped for exactly this reason: they render as grey blobs on some platforms.
 */
function iconCanvas(kind: IconKind): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ICON_PX * dpr);
  canvas.height = Math.round(ICON_PX * dpr);
  canvas.style.width = `${ICON_PX}px`;
  canvas.style.height = `${ICON_PX}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawIcon(ctx, kind, ICON_PX / 2, ICON_PX / 2, ICON_PX * 0.86);
  return canvas;
}

export function initUI(cb: UICallbacks, initialMuted: boolean, initialWon = false): UIHandles {
  const hud = document.createElement('div');
  hud.id = 'hud';
  type Row = { el: HTMLElement; value: HTMLElement; prev: number; timer?: ReturnType<typeof setTimeout> };
  const rows = new Map<Currency, Row>();
  for (const key of RES_KEYS) {
    const row = document.createElement('div');
    row.className = 'res';
    const value = document.createElement('span');
    value.textContent = '0';
    row.append(iconCanvas(key), value);
    hud.appendChild(row);
    rows.set(key, { el: row, value, prev: 0 });
  }
  // Rescued villagers close the sidebar as a final row, so every number the player tracks sits
  // in one column (spec Amendment 1D) with a drawn icon rather than an emoji (1C).
  const rescuedRow = document.createElement('div');
  rescuedRow.className = 'res';
  const rescuedValue = document.createElement('span');
  rescuedValue.textContent = '0/0';
  rescuedRow.append(iconCanvas('villager'), rescuedValue);
  hud.appendChild(rescuedRow);
  let rescuedText = '';
  document.body.appendChild(hud);

  const pause = overlay();
  const pausePanel = panel('Paused');
  pausePanel.appendChild(button('Resume', () => cb.onResume()));
  const muteBtn = button(initialMuted ? 'Unmute (M)' : 'Mute (M)', () => {
    setMuted(cb.onToggleMute());
  });
  muteBtn.classList.add('secondary');
  pausePanel.appendChild(muteBtn);
  const restartBtn = button('Restart camp', () => {
    if (window.confirm('Erase your save and start over?')) cb.onRestart();
  });
  restartBtn.classList.add('secondary');
  pausePanel.appendChild(restartBtn);
  pause.appendChild(pausePanel);
  document.body.appendChild(pause);

  const win = overlay();
  const winPanel = panel('Camp Complete!');
  const stats = document.createElement('p');
  winPanel.appendChild(stats);
  winPanel.appendChild(button('Keep playing', () => win.classList.add('hidden')));
  win.appendChild(winPanel);
  document.body.appendChild(win);
  // A save that was already won must not re-announce the win on every reload.
  let winShown = initialWon;

  function setMuted(muted: boolean): void {
    muteBtn.textContent = muted ? 'Unmute (M)' : 'Mute (M)';
  }

  function update(state: GameState): void {
    for (const key of RES_KEYS) {
      const row = rows.get(key)!;
      const val = key === 'cash' ? Math.floor(state.player.cash) : state.player.carry[key];
      if (val !== row.prev) {
        // One timer per row: a streaming pad payment ticks faster than 250 ms, and stacked
        // timers from earlier ticks would strip the class mid-flash and strobe the row.
        clearTimeout(row.timer);
        row.el.classList.remove('flash-up', 'flash-down');
        void row.el.offsetWidth; // restart the CSS transition
        row.el.classList.add(val > row.prev ? 'flash-up' : 'flash-down');
        row.timer = setTimeout(() => row.el.classList.remove('flash-up', 'flash-down'), 250);
        row.value.textContent = String(val);
        row.prev = val;
      }
    }
    // Only the snowfield's frozen villagers can be rescued; the fort crew is hired, not thawed.
    const rescuable = state.villagers.filter((vil) => vil.kind === 'rescued').length;
    const text = `${state.rescued}/${rescuable}`;
    if (text !== rescuedText) {
      rescuedText = text;
      rescuedValue.textContent = text;
    }
    if (state.won && !winShown) {
      winShown = true;
      const mins = Math.floor(state.time / 60);
      const secs = Math.floor(state.time % 60);
      stats.textContent =
        `Time ${mins}m ${secs}s · ${state.stats.chops} trees felled · ` +
        `${state.stats.bearsKilled} bears defeated · $${Math.floor(state.stats.earned)} earned`;
      win.classList.remove('hidden');
    }
  }

  return {
    showPause: (show: boolean) => pause.classList.toggle('hidden', !show),
    setMuted,
    reset: () => {
      winShown = false;
      win.classList.add('hidden');
    },
    update,
  };
}

function overlay(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'overlay hidden';
  return el;
}

function panel(title: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'panel';
  const h = document.createElement('h1');
  h.textContent = title;
  el.appendChild(h);
  return el;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}
