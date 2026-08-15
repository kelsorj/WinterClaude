import { createInitialState } from './init';
import { FELLED } from './systems/harvest';
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
  /** Ids of permanently felled trees — deforestation is progress and must persist (Amendment 1A). */
  felledTrees: string[];
  depot: GameState['depot'];
  machineOutputs: Record<string, number>;
  matCash: Record<string, number>;
  /** Goods sitting on each bench awaiting customers. Customers themselves are transient. */
  stock: Record<string, number>;
  stats: GameState['stats'];
}

/**
 * The depot as it should be written: every carrier's cargo folded back in. Carriers restore
 * empty-handed at the depot, so goods in transit would otherwise simply evaporate on reload —
 * with five crew and two miners each able to carry HAUL_AMOUNT, that is up to 21 goods per save.
 * Returns a copy: serializing a running game must never move its resources.
 */
function conservedDepot(state: GameState): GameState['depot'] {
  const depot = { ...state.depot };
  for (const vil of state.villagers) {
    if (vil.carrying !== null && vil.amount > 0) depot[vil.carrying] += vil.amount;
  }
  return depot;
}

export function serialize(state: GameState): string {
  const data: SaveData = {
    time: state.time,
    won: state.won,
    player: state.player,
    padsDone: state.pads.filter((p) => p.done).map((p) => p.id),
    padsPaid: Object.fromEntries(state.pads.filter((p) => !p.done && p.paid > 0).map((p) => [p.id, p.paid])),
    zonesOpen: state.zonesOpen,
    felledTrees: state.trees.filter((t) => t.respawn > 0).map((t) => t.id),
    depot: conservedDepot(state),
    machineOutputs: Object.fromEntries([
      ...state.turrets.map((t) => [t.id, t.output]),
      ...state.sawmills.map((s) => [s.id, s.output]),
    ]),
    matCash: Object.fromEntries(state.stations.filter((s) => s.matCash > 0).map((s) => [s.id, s.matCash])),
    stock: Object.fromEntries(state.stations.filter((s) => s.stock > 0).map((s) => [s.id, s.stock])),
    stats: state.stats,
  };
  return JSON.stringify(data);
}

/**
 * Rebuild fresh content, then overlay saved progress. Player numbers (speed,
 * carryCap, tool…) are restored verbatim rather than re-running pad effects, so
 * multiplicative upgrades are never double-applied. Machine `active` flags are
 * derived from completed machine pads.
 *
 * `previous` is the state being replaced, if a game is already running. Customers are transient
 * and unsaved, so a loaded state would otherwise start numbering shoppers from 1 again and mint
 * ids that the renderer still holds meshes for; pass the live state and numbering carries on
 * above it instead.
 */
export function deserialize(json: string, previous?: GameState): GameState {
  const data = JSON.parse(json) as SaveData;
  if (!data || !data.player || !data.depot || !data.stats
    || !Array.isArray(data.padsDone) || !data.machineOutputs) {
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
  // Saves written before benches held stock have no `stock` map; those benches load empty.
  for (const st of state.stations) {
    st.matCash = data.matCash?.[st.id] ?? 0;
    st.stock = data.stock?.[st.id] ?? 0;
  }
  // Machine activation, the camp tier and the crew are derived from completed pads, not stored.
  for (const pad of state.pads) {
    if (!pad.done) continue;
    if (pad.effect.type === 'machine') activateMachine(state, pad.effect.machineId);
    if (pad.effect.type === 'camp') state.campTier = Math.max(state.campTier, pad.effect.tier);
    if (pad.effect.type === 'distributor') state.distributorActive = true;
  }
  // Saves written before the finite forest landed have no felled list; they load with a full
  // forest rather than failing, which only costs the player some already-cut trees.
  const felled = new Set(Array.isArray(data.felledTrees) ? data.felledTrees : []);
  for (const tree of state.trees) {
    if (felled.has(tree.id)) { tree.respawn = FELLED; tree.hp = 0; }
  }
  // Villagers are entirely derived now — the crew from the distributor pad, the miners from the
  // camp tier — so nothing about them is read back. Saves written before Amendment 4C carry a
  // `thawed` list of snowfield villagers that no longer exist; it is simply ignored.
  state.depot = data.depot;
  for (const t of state.turrets) t.output = data.machineOutputs?.[t.id] ?? 0;
  for (const s of state.sawmills) s.output = data.machineOutputs?.[s.id] ?? 0;
  state.stats = data.stats;
  state.nextCustomerId = Math.max(state.nextCustomerId, previous?.nextCustomerId ?? 0);
  return state;
}

export function saveGame(state: GameState): void {
  try { localStorage.setItem(KEY, serialize(state)); } catch { /* storage unavailable */ }
}

export function loadGame(previous?: GameState): GameState | null {
  try {
    const json = localStorage.getItem(KEY);
    return json ? deserialize(json, previous) : null;
  } catch { return null; }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
