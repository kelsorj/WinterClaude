import type { GameEvent } from '../game/state';

let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem('frostfall-muted') === '1'; } catch { /* ignore */ }

/** Must be called from a user-gesture handler once (browser autoplay policy). */
export function initAudio(): void {
  if (!ctx) ctx = new AudioContext();
}

export function isMuted(): boolean { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem('frostfall-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

function beep(freq: number, dur: number, type: OscillatorType, vol = 0.12, slide = 0, delay = 0): void {
  if (!ctx || muted) return;
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slide !== 0) osc.frequency.linearRampToValueAtTime(freq + slide, at + dur);
  gain.gain.setValueAtTime(vol, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur);
}

export function playFor(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'chop': beep(180, 0.06, 'square', 0.07); break;
      case 'treeFall': beep(140, 0.25, 'triangle', 0.14, -60); break;
      case 'pickup': beep(700, 0.07, 'sine', 0.09, 200); break;
      case 'deposit': beep(500, 0.06, 'sine', 0.07, 100); break;
      case 'sell': beep(880, 0.09, 'sine', 0.11, 120); break;
      case 'unlock':
        beep(523, 0.1, 'sine', 0.14);
        beep(659, 0.1, 'sine', 0.14, 0, 0.09);
        beep(784, 0.16, 'sine', 0.14, 0, 0.18);
        break;
      case 'thaw': beep(660, 0.15, 'triangle', 0.14, 180); break;
      case 'bearHit': beep(140, 0.08, 'sawtooth', 0.09); break;
      case 'playerHit': beep(90, 0.15, 'sawtooth', 0.13, -30); break;
      case 'win':
        beep(523, 0.15, 'sine', 0.18);
        beep(659, 0.15, 'sine', 0.18, 0, 0.13);
        beep(784, 0.15, 'sine', 0.18, 0, 0.26);
        beep(1047, 0.35, 'sine', 0.18, 0, 0.39);
        break;
    }
  }
}
