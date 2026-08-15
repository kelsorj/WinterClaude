import { drawIcon, drawSpeaker, type IconKind } from '../render/meshes';
import type { Currency, GameState } from '../game/state';

export interface UICallbacks {
  onRestart(): void;
  onResume(): void;
  onToggleMute(): boolean; // returns new muted flag
}

export interface UIHandles {
  /**
   * Show or hide the pause overlay. `state` is read only on the way in, to refresh the lifetime
   * stats: the overlay is the one place they are shown now that there is no win screen
   * (Amendment 5A), and a paused game's numbers never move, so once per open is enough.
   */
  showPause(show: boolean, state: GameState): void;
  /**
   * The one place the muted flag is rendered. The M key, the pause-menu button and the sidebar
   * speaker all toggle audio and then land here, so no two of them can ever disagree about what
   * the game is doing (Amendment 4D).
   */
  setMuted(muted: boolean): void;
  update(state: GameState): void;
}

const RES_KEYS: Currency[] = ['cash', 'wood', 'meat', 'gold'];
const ICON_PX = 26;

/**
 * HUD icons are painted with the same `drawIcon` the world labels use, so a gold bar in the
 * sidebar is the same unmistakable gold bar seen on the bench bubbles (spec Amendment 1C/1D).
 * Emoji were dropped for exactly this reason: they render as grey blobs on some platforms.
 */
function blankIconCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ICON_PX * dpr);
  canvas.height = Math.round(ICON_PX * dpr);
  canvas.style.width = `${ICON_PX}px`;
  canvas.style.height = `${ICON_PX}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

function iconCanvas(kind: IconKind): HTMLCanvasElement {
  const { canvas, ctx } = blankIconCanvas();
  drawIcon(ctx, kind, ICON_PX / 2, ICON_PX / 2, ICON_PX * 0.86);
  return canvas;
}

/** The lifetime record, as one line: what the win screen used to show, now shown on demand. */
export function statsLine(state: GameState): string {
  const mins = Math.floor(state.time / 60);
  const secs = Math.floor(state.time % 60);
  return `Time ${mins}m ${secs}s · ${state.stats.chops} trees felled · `
    + `${state.stats.bearsKilled} bears defeated · $${Math.floor(state.stats.earned)} earned`;
}

export function initUI(cb: UICallbacks, initialMuted: boolean): UIHandles {
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
  // The mute toggle closes the sidebar: always visible, so the player can see at a glance whether
  // the game is meant to be silent instead of discovering it through the pause menu (4D).
  const soundBtn = document.createElement('button');
  soundBtn.className = 'iconbtn';
  soundBtn.type = 'button';
  const sound = blankIconCanvas();
  soundBtn.appendChild(sound.canvas);
  soundBtn.addEventListener('click', () => {
    setMuted(cb.onToggleMute());
    // Hand the keyboard straight back to the game: a focused button eats Space and Enter, so a
    // player who clicked the speaker once would toggle audio again the next time they hit Space.
    soundBtn.blur();
  });
  hud.appendChild(soundBtn);
  document.body.appendChild(hud);

  const pause = overlay();
  const pausePanel = panel('Paused');
  // The lifetime record used to be the reward for finishing; with no ending to hand it over at
  // (Amendment 5A) it lives here, where a player can look it up whenever they care to.
  const stats = document.createElement('p');
  pausePanel.appendChild(stats);
  pausePanel.appendChild(button('Resume', () => cb.onResume()));
  const muteBtn = button('Mute (M)', () => setMuted(cb.onToggleMute()));
  muteBtn.classList.add('secondary');
  pausePanel.appendChild(muteBtn);
  const restartBtn = button('Restart camp', () => {
    if (window.confirm('Erase your save and start over?')) cb.onRestart();
  });
  restartBtn.classList.add('secondary');
  pausePanel.appendChild(restartBtn);
  pause.appendChild(pausePanel);
  document.body.appendChild(pause);

  /**
   * The single place the muted flag becomes pixels. Every route that toggles audio — the M key
   * (via `main.ts`), the pause-menu button and the sidebar speaker — calls this with the new
   * flag, so the two controls can never drift out of step with each other or with the audio.
   */
  function setMuted(muted: boolean): void {
    muteBtn.textContent = muted ? 'Unmute (M)' : 'Mute (M)';
    sound.ctx.clearRect(0, 0, ICON_PX, ICON_PX);
    drawSpeaker(sound.ctx, muted, ICON_PX / 2, ICON_PX / 2, ICON_PX * 0.86);
    const label = muted ? 'Unmute (M)' : 'Mute (M)';
    soundBtn.title = label;
    soundBtn.setAttribute('aria-label', label);
    soundBtn.setAttribute('aria-pressed', String(muted));
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
  }

  // Both controls start from the same call, rather than each seeding its own initial look.
  setMuted(initialMuted);

  return {
    showPause: (show: boolean, state: GameState) => {
      if (show) stats.textContent = statsLine(state);
      pause.classList.toggle('hidden', !show);
    },
    setMuted,
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
