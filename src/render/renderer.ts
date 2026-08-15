import * as THREE from 'three';
import { TOOLS } from '../content/balance';
import { WORLD_BOUNDS, ZONE_RECTS } from '../content/map';
import { cartPos, railActive } from '../game/systems/carts';
import { padAvailable } from '../game/systems/pads';
import type { Rect } from '../game/math';
import type { GameEvent, GameState, GateZone } from '../game/state';
import type {
  BearRefs, CartRefs, PadRefs, PlayerRefs, SawmillRefs, TreeRefs, VillagerRefs,
} from './meshes';
import {
  CAMP_TIERS, COLORS, ICONS, SHARED, makeBear, makeBench, makeCampTier, makeCarryBox, makeCart,
  makeDropMesh, makeGateWall, makeLabel, makeMatMesh, makePadMesh, makePile, makePlayer,
  makeRailMesh, makeSawmill, makeSeam, makeTool, makeTree, makeTurret, makeVillager, refsOf,
} from './meshes';

const CAM_OFFSET = new THREE.Vector3(16, 20, 16);
const PILE_BOX_H = 0.14;

interface FloatingText { sprite: THREE.Sprite; life: number }

/**
 * Release every GPU resource under `root` that this subtree owns. Module-level shared
 * geometries/materials/textures (see `SHARED`) are skipped — they belong to the mesh library,
 * not to any one mesh, and other live meshes are still drawing with them.
 */
function disposeSubtree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const withGeo = obj as Partial<THREE.Mesh>;
    if (withGeo.geometry && !SHARED.has(withGeo.geometry)) withGeo.geometry.dispose();
    const raw = (obj as Partial<THREE.Mesh>).material;
    if (!raw) return;
    for (const mat of Array.isArray(raw) ? raw : [raw]) {
      if (SHARED.has(mat)) continue;
      const map = (mat as THREE.SpriteMaterial).map;
      if (map && !SHARED.has(map)) map.dispose();
      mat.dispose();
    }
  });
}

export class Renderer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private webgl: THREE.WebGLRenderer;
  private meshes = new Map<string, THREE.Object3D>();
  private dropMeshes = new Map<string, THREE.Object3D>();
  private gates = new Map<GateZone, THREE.Object3D>();
  private floats: FloatingText[] = [];
  private snow!: THREE.Points;
  private target = new THREE.Vector3();
  private scratch = new THREE.Vector3();
  private t = 0;
  private floatSeq = 0;
  private lastToolKey = '';
  private lastCarryKey = '';
  private lastCampTier = -1;
  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.webgl.setSize(window.innerWidth, window.innerHeight);
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };

  constructor(container: HTMLElement) {
    this.webgl = new THREE.WebGLRenderer({ antialias: true });
    this.webgl.setSize(window.innerWidth, window.innerHeight);
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.webgl.domElement);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
    window.addEventListener('resize', this.onResize);
    this.buildWorld();
  }

  /** Detach from the window and release the WebGL context (page teardown / hot restart). */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.webgl.dispose();
  }

  private buildWorld(): void {
    this.scene.background = new THREE.Color(0xdfe9f0);
    this.scene.fog = new THREE.Fog(0xdfe9f0, 60, 140);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x8899aa, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 160), new THREE.MeshLambertMaterial({ color: COLORS.snow }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 14), new THREE.MeshLambertMaterial({ color: COLORS.road }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    this.scene.add(road);
    const snowGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      pos[i * 3] = -60 + Math.random() * 120;
      pos[i * 3 + 1] = Math.random() * 25;
      pos[i * 3 + 2] = -40 + Math.random() * 80;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.8 }),
    );
    this.scene.add(this.snow);
  }

  /**
   * Collision blocks a sealed zone on every side, so wall off every face of the rect that
   * touches reachable ground. Faces flush with the world bounds are skipped — nothing can
   * stand beyond them.
   */
  private buildGates(): void {
    const entries = Object.entries(ZONE_RECTS) as [GateZone, Rect][];
    for (const [zone, rect] of entries) {
      const midX = (rect.x0 + rect.x1) / 2;
      const midZ = (rect.z0 + rect.z1) / 2;
      const spanX = rect.x1 - rect.x0;
      const spanZ = rect.z1 - rect.z0;
      const faces = [
        { x: rect.x0, z: midZ, length: spanZ, rotY: Math.PI / 2, outside: rect.x0 === WORLD_BOUNDS.x0 },
        { x: rect.x1, z: midZ, length: spanZ, rotY: Math.PI / 2, outside: rect.x1 === WORLD_BOUNDS.x1 },
        { x: midX, z: rect.z0, length: spanX, rotY: 0, outside: rect.z0 === WORLD_BOUNDS.z0 },
        { x: midX, z: rect.z1, length: spanX, rotY: 0, outside: rect.z1 === WORLD_BOUNDS.z1 },
      ];
      const group = new THREE.Group();
      for (const face of faces) {
        if (face.outside) continue;
        const wall = makeGateWall(face.length);
        wall.position.set(face.x, 0, face.z);
        wall.rotation.y = face.rotY;
        group.add(wall);
      }
      this.gates.set(zone, group);
      this.scene.add(group);
    }
  }

  /** Build once-per-game meshes from state (stations, pads, machines, rails, gates, depot). */
  buildStatic(state: GameState): void {
    for (const st of state.stations) {
      const bench = makeBench();
      bench.position.set(st.pos.x, 0, st.pos.z);
      const label = makeLabel(ICONS[st.resource]);
      label.position.y = 2.4;
      bench.add(label);
      this.scene.add(bench);
      const mat = makeMatMesh();
      mat.position.set(st.matPos.x, 0, st.matPos.z);
      this.scene.add(mat);
    }
    for (const pad of state.pads) {
      const g = makePadMesh();
      g.position.set(pad.pos.x, 0, pad.pos.z);
      const label = makeLabel(`${ICONS[pad.currency]} ${pad.cost}`);
      label.position.y = 2.2;
      g.add(label);
      this.meshes.set(pad.id, g);
      this.scene.add(g);
    }
    for (const turret of state.turrets) {
      const g = makeTurret();
      g.position.set(turret.pos.x, 0, turret.pos.z);
      this.meshes.set(turret.id, g);
      this.scene.add(g);
    }
    for (const mill of state.sawmills) {
      const g = makeSawmill();
      g.position.set(mill.pos.x, 0, mill.pos.z);
      this.meshes.set(mill.id, g);
      this.scene.add(g);
    }
    for (const rail of state.rails) {
      const g = makeRailMesh(rail.points);
      this.meshes.set(rail.id, g);
      this.scene.add(g);
    }
    this.buildGates();
  }

  /** Full teardown + rebuild (used by Restart). */
  rebuild(state: GameState): void {
    for (const f of this.floats) this.dropFloat(f);
    this.floats = [];
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      this.scene.remove(child);
      disposeSubtree(child);
    }
    this.meshes.clear();
    this.dropMeshes.clear();
    this.gates.clear();
    this.lastToolKey = '';
    this.lastCarryKey = '';
    this.lastCampTier = -1;
    this.buildWorld();
    this.buildStatic(state);
  }

  private ensure(id: string, make: () => THREE.Object3D): THREE.Object3D {
    let m = this.meshes.get(id);
    if (!m) {
      m = make();
      this.meshes.set(id, m);
      this.scene.add(m);
    }
    return m;
  }

  sync(state: GameState, dt: number): void {
    this.t += dt;
    this.syncPlayer(state);
    for (const tree of state.trees) {
      // Trees never move: place once, then freeze the matrix and only toggle visibility.
      const m = this.ensure(tree.id, () => {
        const g = makeTree();
        g.position.set(tree.pos.x, 0, tree.pos.z);
        g.updateMatrix();
        g.matrixAutoUpdate = false;
        return g;
      });
      m.visible = state.zonesOpen[tree.zone];
      const refs = refsOf<TreeRefs>(m);
      refs.full.visible = tree.respawn === 0;
      refs.stump.visible = tree.respawn > 0;
    }
    for (const seam of state.seams) {
      const m = this.ensure(seam.id, makeSeam);
      m.position.set(seam.pos.x, 0, seam.pos.z);
      m.visible = state.zonesOpen[seam.zone];
      m.scale.y = seam.respawn > 0 ? 0.35 : 1;
    }
    for (const bear of state.bears) {
      const m = this.ensure(bear.id, makeBear);
      m.position.set(bear.pos.x, 0, bear.pos.z);
      m.visible = state.zonesOpen[bear.zone] && bear.state !== 'dead';
      if (bear.state === 'aggro') {
        m.rotation.y = Math.atan2(state.player.pos.x - bear.pos.x, state.player.pos.z - bear.pos.z);
        m.position.y = Math.abs(Math.sin(this.t * 10)) * 0.15;
      }
      const refs = refsOf<BearRefs>(m);
      // Keep the bars square to the camera no matter which way the bear turned.
      refs.bars.rotation.y = Math.PI / 4 - m.rotation.y;
      const hurt = bear.hp < bear.maxHp && bear.state !== 'dead';
      refs.hpBg.visible = hurt;
      refs.hp.visible = hurt;
      refs.hp.scale.x = Math.max(bear.hp / bear.maxHp, 0.001);
    }
    const liveDrops = new Set<string>();
    for (const drop of state.drops) {
      liveDrops.add(drop.id);
      let m = this.dropMeshes.get(drop.id);
      if (!m) {
        m = makeDropMesh(drop.kind);
        this.dropMeshes.set(drop.id, m);
        this.scene.add(m);
      }
      m.position.set(drop.pos.x, 0.3 + Math.sin(this.t * 4 + drop.pos.x) * 0.08, drop.pos.z);
      m.rotation.y += dt * 2;
    }
    for (const [id, m] of this.dropMeshes) {
      if (liveDrops.has(id)) continue;
      this.scene.remove(m);
      this.dropMeshes.delete(id);
    }
    for (const pad of state.pads) {
      const m = this.meshes.get(pad.id);
      if (!m) continue;
      m.visible = padAvailable(state, pad);
      const f = Math.max(pad.paid / pad.cost, 0.001);
      refsOf<PadRefs>(m).progress.scale.set(f, 1, f);
    }
    for (const st of state.stations) {
      this.syncPile(`cash-${st.id}`, st.matPos.x, st.matPos.z, st.matCash, COLORS.cash, 10, 12);
    }
    for (const turret of state.turrets) {
      const m = this.meshes.get(turret.id);
      if (!m) continue;
      m.visible = turret.active;
      this.syncPile(
        `out-${turret.id}`, turret.pos.x + 1.2, turret.pos.z + 1.2, turret.output, COLORS.meat, 3, 14,
      );
    }
    for (const mill of state.sawmills) {
      const m = this.meshes.get(mill.id);
      if (!m) continue;
      m.visible = mill.active;
      if (mill.active) refsOf<SawmillRefs>(m).blade.rotation.x += dt * 6;
      this.syncPile(
        `out-${mill.id}`, mill.pos.x + 1.4, mill.pos.z + 1.2, mill.output, COLORS.wood, 3, 14,
      );
    }
    for (const rail of state.rails) {
      const m = this.meshes.get(rail.id);
      if (!m) continue;
      m.visible = railActive(state, rail);
    }
    for (const cart of state.carts) {
      const rail = state.rails.find((r) => r.id === cart.railId);
      if (!rail) continue;
      const m = this.ensure(cart.id, makeCart);
      m.visible = railActive(state, rail);
      const pos = cartPos(state, cart);
      m.position.set(pos.x, 0, pos.z);
      const load = refsOf<CartRefs>(m).load;
      load.visible = cart.load > 0;
      load.scale.y = Math.max(cart.load / cart.cap, 0.2);
    }
    this.syncCamp(state);
    for (let i = 0; i < state.villagers.length; i++) {
      const vil = state.villagers[i];
      const m = this.ensure(vil.id, makeVillager);
      const frozen = vil.state === 'frozen';
      // Haulers all converge on the same logic positions; nudge each one off the pile so the
      // crowd reads as individuals. Frozen rows stay on their exact grid.
      const jx = frozen ? 0 : (((i * 37) % 11) - 5) * 0.12;
      const jz = frozen ? 0 : (((i * 53) % 11) - 5) * 0.12;
      const bob = frozen ? 0 : Math.abs(Math.sin(this.t * 8 + i)) * 0.08;
      m.position.set(vil.pos.x + jx, bob, vil.pos.z + jz);
      const refs = refsOf<VillagerRefs>(m);
      refs.ice.visible = frozen;
      refs.load.visible = vil.carrying !== null;
    }
    for (const [zone, wall] of this.gates) wall.visible = !state.zonesOpen[zone];
    const p = state.player.pos;
    this.target.lerp(this.scratch.set(p.x, 0, p.z), 1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.target).add(CAM_OFFSET);
    this.camera.lookAt(this.target);
  }

  /**
   * The camp is one structure that is swapped wholesale when a camp pad completes; the depot
   * stockpiles and label follow the tier's layout (outside the hut, inside the fort).
   */
  private syncCamp(state: GameState): void {
    const tier = Math.max(0, Math.min(CAMP_TIERS.length - 1, Math.round(state.campTier)));
    if (tier !== this.lastCampTier) {
      this.lastCampTier = tier;
      const old = this.meshes.get('camp');
      if (old) {
        this.scene.remove(old);
        disposeSubtree(old);
        this.meshes.delete('camp');
      }
      const g = makeCampTier(tier);
      g.position.set(state.depotPos.x, 0, state.depotPos.z);
      const label = makeLabel('📦');
      label.position.y = CAMP_TIERS[tier].labelY;
      g.add(label);
      this.meshes.set('camp', g);
      this.scene.add(g);
    }
    const info = CAMP_TIERS[tier];
    const kinds = ['wood', 'meat', 'gold'] as const;
    const colors = [COLORS.wood, COLORS.meat, COLORS.gold];
    for (let i = 0; i < kinds.length; i++) {
      const spot = info.piles[i];
      this.syncPile(
        `depot-${kinds[i]}`, state.depotPos.x + spot.x, state.depotPos.z + spot.z,
        state.depot[kinds[i]], colors[i], 3, 14, info.floorY,
      );
    }
  }

  /**
   * One pile renderer for station cash, machine outputs and depot stockpiles: `unitsPerBox`
   * resources make one box and the stack is capped at `cap` boxes so a runaway stockpile can
   * never grow without bound. `baseY` lifts a pile onto a camp platform.
   */
  private syncPile(
    id: string, x: number, z: number, count: number, color: number,
    unitsPerBox: number, cap: number, baseY = 0,
  ): void {
    const m = this.ensure(id, () => makePile(color));
    m.visible = count > 0;
    if (count <= 0) return;
    const boxes = Math.min(Math.ceil(count / unitsPerBox), cap);
    const h = 0.06 + boxes * PILE_BOX_H;
    m.scale.y = h;
    m.position.set(x, baseY + h / 2, z);
  }

  private syncPlayer(state: GameState): void {
    const p = state.player;
    const m = this.ensure('player', makePlayer) as THREE.Group;
    m.position.set(p.pos.x, 0, p.pos.z);
    const refs = refsOf<PlayerRefs>(m);
    const toolKey = `${p.tool}|${p.hasPickaxe}`;
    if (toolKey !== this.lastToolKey) {
      this.lastToolKey = toolKey;
      for (const child of [...refs.toolMount.children]) disposeSubtree(child);
      refs.toolMount.clear();
      refs.toolMount.add(makeTool(p.tool));
      if (p.hasPickaxe) {
        const pick = makeTool('pickaxe');
        pick.position.set(-0.9, 0, -0.5);
        pick.rotation.z = 0.5;
        refs.toolMount.add(pick);
      }
    }
    const period = TOOLS[p.tool].period;
    const swingFrac = Math.max(p.swingTimer, 0) / period;
    if (p.tool === 'scythe') {
      m.rotation.y = Math.atan2(p.facing.x, p.facing.z) + swingFrac * Math.PI * 2;
    } else {
      m.rotation.y = Math.atan2(p.facing.x, p.facing.z);
      refs.toolMount.rotation.x = Math.sin(swingFrac * Math.PI) * 1.3;
    }
    const carryKey = `${p.carry.wood}|${p.carry.meat}|${p.carry.gold}`;
    if (carryKey !== this.lastCarryKey) {
      this.lastCarryKey = carryKey;
      refs.carry.clear();
      let y = 0;
      const add = (count: number, color: number) => {
        for (let i = 0; i < Math.ceil(count / 2); i++) {
          const box = makeCarryBox(color);
          box.position.y = y;
          y += 0.22;
          refs.carry.add(box);
        }
      };
      add(p.carry.wood, COLORS.wood);
      add(p.carry.meat, COLORS.meat);
      add(p.carry.gold, COLORS.gold);
    }
  }

  applyEvents(events: GameEvent[]): void {
    for (const e of events) {
      let text: string | null = null;
      if (e.type === 'sell') text = `+💵${e.cash}`;
      else if (e.type === 'unlock') text = 'Unlocked!';
      else if (e.type === 'thaw') text = '+1 rescued';
      if (text && 'pos' in e) {
        const sprite = makeLabel(text);
        sprite.scale.set(2.6, 1.3, 1);
        // Concurrent floats from the same bench would overlap into an unreadable smear;
        // fan them out deterministically instead.
        const lane = ((this.floatSeq++ % 3) - 1) * 0.7;
        sprite.position.set(e.pos.x + lane, 2.5, e.pos.z);
        this.scene.add(sprite);
        this.floats.push({ sprite, life: 1 });
      }
    }
  }

  /**
   * A float's SpriteMaterial is its own (it fades independently), but its texture comes from the
   * shared label cache — dispose the material only, or the next float reusing that text would
   * draw against a freed texture.
   */
  private dropFloat(f: FloatingText): void {
    this.scene.remove(f.sprite);
    f.sprite.material.dispose();
  }

  render(dt: number): void {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.sprite.position.y += 1.5 * dt;
      f.sprite.material.opacity = Math.max(f.life, 0);
      if (f.life <= 0) {
        this.dropFloat(f);
        this.floats.splice(i, 1);
      }
    }
    const pos = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 2;
      if (y < 0) y = 25;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.webgl.render(this.scene, this.camera);
  }
}
