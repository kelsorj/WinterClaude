import type { Vec2 } from './math';
import type { GameState } from './state';
import { movePlayer } from './systems/movement';
import { harvestTick } from './systems/harvest';
import { bearsTick } from './systems/bears';
import { pickupTick } from './systems/pickup';
import { stationsTick } from './systems/stations';
import { depotTick } from './systems/depot';
import { customersTick } from './systems/customers';
import { padsTick } from './systems/pads';
import { machinesTick } from './systems/machines';
import { cartsTick } from './systems/carts';
import { villagersTick } from './systems/villagers';

/** One fixed-timestep tick. Order matters: move → act → economy → automation. */
export function update(state: GameState, intent: Vec2, dt: number): void {
  state.time += dt;
  movePlayer(state, intent, dt);
  harvestTick(state, dt);
  bearsTick(state, dt);
  pickupTick(state, dt);
  stationsTick(state, dt);
  depotTick(state, dt);
  customersTick(state, dt);
  padsTick(state, dt);
  machinesTick(state, dt);
  cartsTick(state, dt);
  villagersTick(state, dt);
}
