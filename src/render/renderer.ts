import * as THREE from 'three';
import { TOOLS } from '../content/balance';
import { WORLD_BOUNDS, ZONE_RECTS } from '../content/map';
import { cartPos } from '../game/systems/carts';
import { padAvailable } from '../game/systems/pads';
import type { Rect } from '../game/math';
import type { GameEvent, GameState, ZoneId } from '../game/state';
import {
  COLORS, ICONS, makeBear, makeBench, makeCarryBox, makeCart, makeDepot, makeDropMesh,
  makeGateWall, makeLabel, makeMatMesh, makePadMesh, makePlayer, makeRailMesh, makeSawmill,
  makeSeam, makeTool, makeTree, makeTurret, makeVillager,
} from './meshes';

const CAM_OFFSET = new THREE.Vector3(16, 20, 16);

type GateZone = Exclude<ZoneId, 'start'>;

interface FloatingText { sprite: THREE.Sprite; life: number }

export class Renderer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private webgl: THREE.WebGLRenderer;
  private meshes = new Map<string, THREE.Object3D>();
  private gates = new Map<GateZone, THREE.Object3D>();
  private floats: FloatingText[] = [];
  private snow!: THREE.Points;
  private target = new THREE.Vector3();
  private t = 0;
  private lastToolKey = '';
  private lastCarryKey = '';

  constructor(container: HTMLElement) {
    this.webgl = new THREE.WebGLRenderer({ antialias: true });
    this.webgl.setSize(window.innerWidth, window.innerHeight);
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.webgl.domElement);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.webgl.setSize(window.innerWidth, window.innerHeight);
    });
    this.buildWorld();
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
    const depot = makeDepot();
    depot.position.set(state.depotPos.x, 0, state.depotPos.z);
    const depotLabel = makeLabel('📦');
    depotLabel.position.y = 2.6;
    depot.add(depotLabel);
    this.scene.add(depot);
    this.buildGates();
  }

  /** Full teardown + rebuild (used by Restart). */
  rebuild(state: GameState): void {
    for (const f of this.floats) this.dropFloat(f);
    while (this.scene.children.length > 0) this.scene.remove(this.scene.children[0]);
    this.meshes.clear();
    this.gates.clear();
    this.floats = [];
    this.lastToolKey = '';
    this.lastCarryKey = '';
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
      const m = this.ensure(tree.id, makeTree);
      m.position.set(tree.pos.x, 0, tree.pos.z);
      m.visible = state.zonesOpen[tree.zone];
      m.getObjectByName('full')!.visible = tree.respawn === 0;
      m.getObjectByName('stump')!.visible = tree.respawn > 0;
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
      const hurt = bear.hp < bear.maxHp && bear.state !== 'dead';
      m.getObjectByName('hpbg')!.visible = hurt;
      const bar = m.getObjectByName('hp')!;
      bar.visible = hurt;
      bar.scale.x = Math.max(bear.hp / bear.maxHp, 0.001);
    }
    const liveDrops = new Set<string>();
    for (const drop of state.drops) {
      liveDrops.add(drop.id);
      const m = this.ensure(drop.id, () => makeDropMesh(drop.kind));
      m.position.set(drop.pos.x, 0.3 + Math.sin(this.t * 4 + drop.pos.x) * 0.08, drop.pos.z);
      m.rotation.y += dt * 2;
    }
    for (const [id, m] of this.meshes) {
      if (id.startsWith('drop') && !liveDrops.has(id)) {
        this.scene.remove(m);
        this.meshes.delete(id);
      }
    }
    for (const pad of state.pads) {
      const m = this.meshes.get(pad.id)!;
      m.visible = padAvailable(state, pad);
      const f = Math.max(pad.paid / pad.cost, 0.001);
      m.getObjectByName('progress')!.scale.set(f, 1, f);
    }
    for (const st of state.stations) {
      const pile = this.ensure(`cash-${st.id}`, () => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 1, 1.0),
          new THREE.MeshLambertMaterial({ color: COLORS.cash }),
        );
        return mesh;
      });
      pile.visible = st.matCash > 0;
      const h = Math.min(0.15 + st.matCash * 0.015, 1.6);
      pile.scale.y = h;
      pile.position.set(st.matPos.x, h / 2, st.matPos.z);
    }
    for (const turret of state.turrets) {
      this.meshes.get(turret.id)!.visible = turret.active;
      this.syncOutputPile(`out-${turret.id}`, turret.pos.x + 1.2, turret.pos.z + 1.2, turret.output, COLORS.meat);
    }
    for (const mill of state.sawmills) {
      const m = this.meshes.get(mill.id)!;
      m.visible = mill.active;
      if (mill.active) m.getObjectByName('blade')!.rotation.x += dt * 6;
      this.syncOutputPile(`out-${mill.id}`, mill.pos.x + 1.4, mill.pos.z + 1.2, mill.output, COLORS.wood);
    }
    for (const rail of state.rails) {
      const machineOn =
        state.turrets.find((t) => t.id === rail.sourceId)?.active ??
        state.sawmills.find((s) => s.id === rail.sourceId)?.active ?? false;
      this.meshes.get(rail.id)!.visible = machineOn;
    }
    for (const cart of state.carts) {
      const rail = state.rails.find((r) => r.id === cart.railId)!;
      const machineOn =
        state.turrets.find((t) => t.id === rail.sourceId)?.active ??
        state.sawmills.find((s) => s.id === rail.sourceId)?.active ?? false;
      const m = this.ensure(cart.id, makeCart);
      m.visible = machineOn;
      const pos = cartPos(state, cart);
      m.position.set(pos.x, 0, pos.z);
      const load = m.getObjectByName('load')!;
      load.visible = cart.load > 0;
      load.scale.y = Math.max(cart.load / cart.cap, 0.2);
    }
    this.syncOutputPile('depot-wood', state.depotPos.x - 1.4, state.depotPos.z - 1.4, state.depot.wood, COLORS.wood);
    this.syncOutputPile('depot-meat', state.depotPos.x, state.depotPos.z - 1.4, state.depot.meat, COLORS.meat);
    this.syncOutputPile('depot-gold', state.depotPos.x + 1.4, state.depotPos.z - 1.4, state.depot.gold, COLORS.gold);
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
      m.getObjectByName('ice')!.visible = frozen;
      m.getObjectByName('load')!.visible = vil.carrying !== null;
    }
    for (const [zone, wall] of this.gates) wall.visible = !state.zonesOpen[zone];
    const p = state.player.pos;
    this.target.lerp(new THREE.Vector3(p.x, 0, p.z), 1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.target).add(CAM_OFFSET);
    this.camera.lookAt(this.target);
  }

  private syncOutputPile(id: string, x: number, z: number, count: number, color: number): void {
    const m = this.ensure(id, () => new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1, 1.0), new THREE.MeshLambertMaterial({ color }),
    ));
    m.visible = count > 0;
    const h = Math.min(0.15 + count * 0.05, 2.0);
    m.scale.y = h;
    m.position.set(x, h / 2, z);
  }

  private syncPlayer(state: GameState): void {
    const p = state.player;
    const m = this.ensure('player', makePlayer) as THREE.Group;
    m.position.set(p.pos.x, 0, p.pos.z);
    const toolMount = m.getObjectByName('toolMount')!;
    const toolKey = `${p.tool}|${p.hasPickaxe}`;
    if (toolKey !== this.lastToolKey) {
      this.lastToolKey = toolKey;
      toolMount.clear();
      toolMount.add(makeTool(p.tool));
      if (p.hasPickaxe) {
        const pick = makeTool('pickaxe');
        pick.position.set(-0.9, 0, -0.5);
        pick.rotation.z = 0.5;
        toolMount.add(pick);
      }
    }
    const period = TOOLS[p.tool].period;
    const swingFrac = Math.max(p.swingTimer, 0) / period;
    if (p.tool === 'scythe') {
      m.rotation.y = Math.atan2(p.facing.x, p.facing.z) + swingFrac * Math.PI * 2;
    } else {
      m.rotation.y = Math.atan2(p.facing.x, p.facing.z);
      toolMount.rotation.x = Math.sin(swingFrac * Math.PI) * 1.3;
    }
    const carryKey = `${p.carry.wood}|${p.carry.meat}|${p.carry.gold}`;
    if (carryKey !== this.lastCarryKey) {
      this.lastCarryKey = carryKey;
      const carry = m.getObjectByName('carry') as THREE.Group;
      carry.clear();
      let y = 0;
      const add = (count: number, color: number) => {
        for (let i = 0; i < Math.ceil(count / 2); i++) {
          const box = makeCarryBox(color);
          box.position.y = y;
          y += 0.22;
          carry.add(box);
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
        sprite.position.set(e.pos.x, 2.5, e.pos.z);
        this.scene.add(sprite);
        this.floats.push({ sprite, life: 1 });
      }
    }
  }

  /**
   * Every float owns a one-off canvas texture, and sells fire several times a second, so the
   * texture has to go back to the GPU when the float expires or long sessions climb without
   * bound. (Unlike the shared mesh resources, these are never reused.)
   */
  private dropFloat(f: FloatingText): void {
    this.scene.remove(f.sprite);
    const mat = f.sprite.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.dispose();
  }

  render(dt: number): void {
    for (const f of [...this.floats]) {
      f.life -= dt;
      f.sprite.position.y += 1.5 * dt;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(f.life, 0);
      if (f.life <= 0) {
        this.dropFloat(f);
        this.floats.splice(this.floats.indexOf(f), 1);
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
