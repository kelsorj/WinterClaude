import { createInitialState } from './init';
import { activateMachine } from './systems/pads';
import type { GameState, ZoneId } from './state';

const KEY = 'frostfall-save-v1';

interface SaveData {
  time: number;
  won: boolean;
  player: GameState['player'];
  padsDone: string[];
  padsPaid: Record<string, number>;
  zonesOpen: Partial<Record<ZoneId, boolean>>;
  thawed: string[];
  depot: GameState['depot'];
  machineOutputs: Record<string, number>;
  matCash: Record<string, number>;
  stats: GameState['stats'];
}

export function serialize(state: GameState): string {
  const data: SaveData = {
    time: state.time,
    won: state.won,
    player: state.player,
    padsDone: state.pads.filter((p) => p.done).map((p) => p.id),
    padsPaid: Object.fromEntries(state.pads.filter((p) => !p.done && p.paid > 0).map((p) => [p.id, p.paid])),
    zonesOpen: state.zonesOpen,
    thawed: state.villagers.filter((v) => v.state !== 'frozen').map((v) => v.id),
    depot: state.depot,
    machineOutputs: Object.fromEntries([
      ...state.turrets.map((t) => [t.id, t.output]),
      ...state.sawmills.map((s) => [s.id, s.output]),
    ]),
    matCash: Object.fromEntries(state.stations.filter((s) => s.matCash > 0).map((s) => [s.id, s.matCash])),
    stats: state.stats,
  };
  return JSON.stringify(data);
}

/**
 * Rebuild fresh content, then overlay saved progress. Player numbers (speed,
 * carryCap, tool…) are restored verbatim rather than re-running pad effects, so
 * multiplicative upgrades are never double-applied. Machine `active` flags are
 * derived from completed machine pads.
 */
export function deserialize(json: string): GameState {
  const data = JSON.parse(json) as SaveData;
  if (!data || !data.player || !data.depot || !data.stats
    || !Array.isArray(data.padsDone) || !Array.isArray(data.thawed) || !data.machineOutputs) {
    throw new Error('unrecognized save shape');
  }
  const state = createInitialState();
  state.time = data.time;
  state.won = data.won;
  state.player = { ...state.player, ...data.player };
  state.zonesOpen = { ...state.zonesOpen, ...data.zonesOpen };
  for (const pad of state.pads) {
    if (data.padsDone.includes(pad.id)) { pad.done = true; pad.paid = pad.cost; }
  }
  for (const pad of state.pads) {
    if (!pad.done) pad.paid = data.padsPaid?.[pad.id] ?? 0;
  }
  for (const st of state.stations) st.matCash = data.matCash?.[st.id] ?? 0;
  // Machine activation and the camp tier are derived from completed pads rather than stored.
  for (const pad of state.pads) {
    if (!pad.done) continue;
    if (pad.effect.type === 'machine') activateMachine(state, pad.effect.machineId);
    if (pad.effect.type === 'camp') state.campTier = Math.max(state.campTier, pad.effect.tier);
  }
  for (const vil of state.villagers) {
    if (data.thawed.includes(vil.id)) {
      vil.state = 'hauler';
      vil.pos = { x: state.depotPos.x, z: state.depotPos.z };
    }
  }
  state.rescued = data.thawed.length;
  state.depot = data.depot;
  for (const t of state.turrets) t.output = data.machineOutputs?.[t.id] ?? 0;
  for (const s of state.sawmills) s.output = data.machineOutputs?.[s.id] ?? 0;
  state.stats = data.stats;
  return state;
}

export function saveGame(state: GameState): void {
  try { localStorage.setItem(KEY, serialize(state)); } catch { /* storage unavailable */ }
}

export function loadGame(): GameState | null {
  try {
    const json = localStorage.getItem(KEY);
    return json ? deserialize(json) : null;
  } catch { return null; }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
