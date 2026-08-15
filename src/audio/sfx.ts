import type { GameEvent } from '../game/state';

let ctx: AudioContext | null = null;
/** Every voice lands here: one gain into a compressor, so stacked blips duck instead of clipping. */
let master: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem('frostfall-muted') === '1'; } catch { /* ignore */ }

/**
 * Safe to call on any input event, repeatedly. A context created outside a real user gesture
 * (Escape as the very first keypress does not count as activation) starts suspended and stays
 * silent, so every later gesture — and a tab regaining focus — gets a chance to resume it.
 */
export function initAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    gain.connect(comp).connect(ctx.destination);
    master = gain;
  }
  // Autoplay policy can reject this if the call did not come from a real gesture; a rejected
  // promise here is expected, not an error worth surfacing.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function isMuted(): boolean { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem('frostfall-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

function beep(freq: number, dur: number, type: OscillatorType, vol = 0.12, slide = 0, delay = 0): void {
  // A suspended context still accepts scheduled nodes and fires them all at once on resume,
  // so refuse to build voices unless the clock is actually running.
  if (!ctx || !master || muted || ctx.state !== 'running') return;
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slide !== 0) osc.frequency.linearRampToValueAtTime(freq + slide, at + dur);
  gain.gain.setValueAtTime(vol, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
  osc.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + dur);
}

function playOne(type: GameEvent['type'], scale: number): void {
  switch (type) {
    case 'chop': beep(180, 0.06, 'square', 0.07 * scale); break;
    case 'treeFall': beep(140, 0.25, 'triangle', 0.14 * scale, -60); break;
    case 'pickup': beep(700, 0.07, 'sine', 0.09 * scale, 200); break;
    case 'deposit': beep(500, 0.06, 'sine', 0.07 * scale, 100); break;
    case 'sell': beep(880, 0.09, 'sine', 0.11 * scale, 120); break;
    case 'unlock':
      beep(523, 0.1, 'sine', 0.14 * scale);
      beep(659, 0.1, 'sine', 0.14 * scale, 0, 0.09);
      beep(784, 0.16, 'sine', 0.14 * scale, 0, 0.18);
      break;
    case 'bearHit': beep(140, 0.08, 'sawtooth', 0.09 * scale); break;
    case 'playerHit': beep(90, 0.15, 'sawtooth', 0.13 * scale, -30); break;
  }
}

/**
 * Forty synced haulers deposit on the same tick: playing one voice per event stacked a dozen
 * identical oscillators into hard clipping. Duplicates within a batch collapse to a single
 * louder voice instead, capped so a busy camp cannot run away with the mix.
 */
export function playFor(events: GameEvent[]): void {
  if (events.length === 0) return;
  const counts = new Map<GameEvent['type'], number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  for (const [type, count] of counts) playOne(type, Math.min(count, 3));
}
