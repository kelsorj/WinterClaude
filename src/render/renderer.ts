import * as THREE from 'three';
import { TOOLS } from '../content/balance';
import { WORLD_BOUNDS, ZONE_RECTS, queueLaneX } from '../content/map';
import { cartPos, railActive } from '../game/systems/carts';
import { padAvailable } from '../game/systems/pads';
import { hash01 } from '../game/math';
import type { Rect, Vec2 } from '../game/math';
import type { GameEvent, GameState, GateZone, SellStation } from '../game/state';
import type {
  BearRefs, CartRefs, CustomerRefs, PadRefs, PlayerRefs, SawmillRefs, VillagerRefs,
} from './meshes';
import {
  BEAR_BODY_SCALE, CAMP_TIERS, COLORS, CUSTOMER_COATS, SHARED, bubbleTexture, lam, makeBear,
  makeBench, makeCampTier, makeCarryBox, makeCart, makeCrate, makeCustomer, makeDropMesh,
  makeFenceRun, makeGateWall, makeIconTextLabel, makeMatMesh, makePadLabel, makePadMesh,
  makePileStack, makePlayer, makeRailMesh, makeRock, makeSawmill, makeSeam, makeSlab,
  makeBubbleLabel, makeTextLabel, makeTool, makeTurret, makeVillager, refsOf,
  snowflakeTexture, treeGeometries, treeMaterial,
} from './meshes';

const CAM_OFFSET = new THREE.Vector3(16, 20, 16);
/**
 * Where the sun sits relative to the camera target, so shadows stay crisp wherever you walk.
 * The azimuth deliberately opposes the camera's: a sun sharing the camera's bearing drops every
 * shadow directly behind its caster, where the caster itself hides it. Offset this way, shadows
 * fall to screen lower-left and read as the ad's do.
 */
const SUN_OFFSET = new THREE.Vector3(-22, 36, 26);
/** Half-extent of the orthographic shadow frustum — just wider than what the camera can see. */
const SHADOW_EXTENT = 30;
const ROAD_Z = 7;
/** Width of `GEO.hpBar`; the drain offset has to match the authored geometry. */
const HP_BAR_WIDTH = 1.36;
/** How long the player's coat stays tinted after a bear connects. */
const HIT_FLASH_TIME = 0.3;
const COAT_BASE = new THREE.Color(COLORS.playerCoat);
const COAT_HIT = new THREE.Color(0xff3b30);
const FENCE_FROM = -44, FENCE_TO = 44;
/** Half-extent of the snowfall volume carried along with the camera, and how high it starts. */
const SNOW_HALF = 42, SNOW_TOP = 26;
/** How far the ground slab runs past the walkable bounds — beyond the fog's far plane. */
const GROUND_MARGIN = 110;

/**
 * What a tree's instance pair is currently showing. Both instanced meshes hold an entry for
 * every tree, so exactly one of the two carries a real matrix and the other a zero scale.
 */
const enum TreeVisual { Unset = 0, Hidden = 1, Standing = 2, Stump = 3 }

/** Parked matrix for a tree instance that is not currently showing: scale 0 draws nothing. */
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** Wrap `val` into the window of half-width `half` centred on `centre`, however far out it is. */
function wrapAround(val: number, centre: number, half: number): number {
  const d = val - centre;
  if (Math.abs(d) <= half) return val;
  const span = half * 2;
  return centre + (((d + half) % span + span) % span) - half;
}

interface FloatingText { sprite: THREE.Sprite; life: number }
/** A stretch of road edge that must stay open: a bench, a pad, a rail crossing, the camp. */
interface FenceGap { x: number; z: number; half: number }

/**
 * Release every GPU resource under `root` that this subtree owns. Module-level shared
 * geometries/materials/textures (see `SHARED`) are skipped — they belong to the mesh library,
 * not to any one mesh, and other live meshes are still drawing with them.
 */
function disposeSubtree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    // An InstancedMesh owns a per-instance matrix buffer on top of its (here shared) geometry,
    // and nothing in the traversal below reaches it: only `dispose()` releases it.
    if ((obj as Partial<THREE.InstancedMesh>).isInstancedMesh) (obj as THREE.InstancedMesh).dispose();
    const withGeo = obj as Partial<THREE.Mesh>;
    // Every THREE.Sprite draws off one module-level geometry owned by three.js itself. It is not
    // in SHARED and it is not ours to free — disposing it would pull the buffer out from under
    // every other live sprite in the scene.
    const isSprite = (obj as Partial<THREE.Sprite>).isSprite === true;
    if (withGeo.geometry && !isSprite && !SHARED.has(withGeo.geometry)) withGeo.geometry.dispose();
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

/** Shadow flags live on meshes, not groups, so they have to be pushed down a built subtree. */
function setShadow(root: THREE.Object3D, cast: boolean, receive = false): THREE.Object3D {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
  return root;
}

export class Renderer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private webgl: THREE.WebGLRenderer;
  private sun!: THREE.DirectionalLight;
  private meshes = new Map<string, THREE.Object3D>();
  private dropMeshes = new Map<string, THREE.Object3D>();
  /** Shoppers come and go constantly, so they get their own spawn/despawn map like drops. */
  private customerMeshes = new Map<string, THREE.Object3D>();
  private gates = new Map<GateZone, THREE.Object3D>();
  /** The whole forest, as two instanced draws. Index into both is `treeIndex.get(tree.id)`. */
  private standingTrees: THREE.InstancedMesh | null = null;
  private stumpTrees: THREE.InstancedMesh | null = null;
  private treeIndex = new Map<string, number>();
  private treeVisual = new Uint8Array(0);
  private floats: FloatingText[] = [];
  private snowLayers: THREE.Points[] = [];
  private target = new THREE.Vector3();
  private scratch = new THREE.Vector3();
  private treeMatrix = new THREE.Matrix4();
  private treeSpin = new THREE.Quaternion();
  private treeScale = new THREE.Vector3();
  private t = 0;
  private floatSeq = 0;
  private lastToolKey = '';
  private lastCarryKey = '';
  private lastCampTier = -1;
  private stationBubbles = new Map<string, THREE.Sprite>();
  private lastStock = new Map<string, number>();
  private hitFlash = 0;
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
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.webgl.domElement);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
    window.addEventListener('resize', this.onResize);
    this.buildWorld();
  }

  /** Detach from the window and release every GPU resource, including the context itself. */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.clearScene();
    this.webgl.domElement.parentNode?.removeChild(this.webgl.domElement);
    this.webgl.dispose();
    // dispose() releases three's own objects but leaves the live context; without this the
    // browser keeps the WebGL context alive until GC, and contexts are a hard-capped resource.
    this.webgl.forceContextLoss();
  }

  private buildWorld(): void {
    this.scene.background = new THREE.Color(0xe6f1fa);
    // Pushed out for the 10× world: at the old 70/160 the wilderness dissolved into haze barely
    // past the camp, which read as a small map in a fog bank rather than a big one.
    this.scene.fog = new THREE.Fog(0xe6f1fa, 90, 200);
    // Cool sky bounce over warm snow-lit ground, plus a warm key that actually casts. The fill
    // is kept well under the key so shadows stay legible instead of washing out.
    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0xc9b08e, 0.52));
    const sun = new THREE.DirectionalLight(0xfff3e2, 1.45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -SHADOW_EXTENT; sc.right = SHADOW_EXTENT;
    sc.top = SHADOW_EXTENT; sc.bottom = -SHADOW_EXTENT;
    sc.near = 1; sc.far = 120;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    // Sized off the world bounds plus a margin wide enough that the ground's own edge is out
    // past the fog when you stand at the far corner: walking to the boundary should read as
    // country receding into haze, not as the lip of a table. Two triangles either way.
    const worldW = (WORLD_BOUNDS.x1 - WORLD_BOUNDS.x0) + GROUND_MARGIN * 2;
    const worldD = (WORLD_BOUNDS.z1 - WORLD_BOUNDS.z0) + GROUND_MARGIN * 2;
    const ground = setShadow(makeSlab(worldW, 0.1, worldD, COLORS.snow), false, true);
    ground.position.y = -0.05;
    this.scene.add(ground);
    // The road runs the full width of the 10× world (Amendment 3B), not just the camp's stretch.
    const road = setShadow(makeSlab(worldW, 0.06, ROAD_Z * 2, COLORS.road), false, true);
    road.position.y = 0.01;
    this.scene.add(road);
    for (const sz of [-1, 1]) {
      const edge = makeSlab(worldW, 0.05, 0.9, COLORS.roadEdge);
      edge.position.set(0, 0.025, sz * (ROAD_Z - 0.45));
      this.scene.add(edge);
    }
    // Carved trenches the frozen villagers stand in, as in the ad's snowfield. They sit above
    // the ground slab, so they have to receive shadows themselves or the villagers standing in
    // them appear to cast onto nothing.
    for (let row = 0; row < 5; row++) {
      const trench = setShadow(makeSlab(40, 0.04, 2.8, COLORS.trench), false, true);
      trench.position.set(-26, 0.02, 12 + row * 5);
      this.scene.add(trench);
    }
    this.buildProps();
    this.buildSnow();
  }

  /** Boulders and crates dressing the roadside; deterministic so screenshots stay comparable. */
  private buildProps(): void {
    const rocks: [number, number, number][] = [
      [-30, -10.5, 1.0], [-14, 9.6, 0.8], [12, -10.2, 1.15], [27, 10.4, 0.9],
      [-42, -9.8, 0.95], [40, -10.8, 1.05], [-6, -11.2, 0.7], [4, 10.8, 0.85],
    ];
    for (const [x, z, s] of rocks) {
      const rock = setShadow(makeRock(), true, true);
      rock.position.set(x, 0, z);
      rock.scale.setScalar(s);
      rock.rotation.y = hash01(`rock${x}${z}`) * Math.PI * 2;
      this.scene.add(rock);
    }
    const crates: [number, number][] = [
      [13.5, -8.6], [14.6, -9.4], [22.5, 8.8], [23.6, 9.5], [-11, -9.2], [9.5, 9.4],
    ];
    for (const [x, z] of crates) {
      const crate = setShadow(makeCrate(), true);
      crate.position.set(x, 0, z);
      crate.rotation.y = hash01(`crate${x}${z}`) * 0.9;
      this.scene.add(crate);
    }
  }

  /**
   * Three layers of round soft flakes; one Points per size keeps it to three draw calls. The
   * volume is only ±`SNOW_HALF` across — covering the whole 10× world at this density would cost
   * a hundred thousand particles — so `render` carries it along with the camera instead.
   */
  private buildSnow(): void {
    this.snowLayers = [];
    for (const [count, size] of [[260, 0.26], [200, 0.38], [140, 0.55]] as const) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * SNOW_HALF * 2;
        pos[i * 3 + 1] = Math.random() * SNOW_TOP;
        pos[i * 3 + 2] = (Math.random() - 0.5) * SNOW_HALF * 2;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const points = new THREE.Points(geo, new THREE.PointsMaterial({
        map: snowflakeTexture(), size, transparent: true, opacity: 0.9, depthWrite: false,
      }));
      this.snowLayers.push(points);
      this.scene.add(points);
    }
  }

  /**
   * Collision blocks a sealed zone on every side, so wall off every face of the rect that
   * touches reachable ground. Faces flush with the world bounds are skipped — nothing can
   * stand beyond them.
   *
   * Since the 10× world nothing is flush any more: the gated rects used to back onto the edge
   * of the map and now sit in open wilderness, so all four faces are built and each zone reads
   * as a walled compound you can walk right around. That is exactly what the collision has
   * always done — the walls simply tell the truth about it now.
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
      setShadow(group, true);
      this.gates.set(zone, group);
      this.scene.add(group);
    }
  }

  /** X positions where a rail polyline crosses the given road edge. */
  private static crossings(points: Vec2[], fenceZ: number): number[] {
    const xs: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (a.z === b.z || (a.z - fenceZ) * (b.z - fenceZ) > 0) continue;
      xs.push(a.x + ((fenceZ - a.z) / (b.z - a.z)) * (b.x - a.x));
    }
    return xs;
  }

  /**
   * Fences line the road but must not run through the things the player walks up to. Gaps are
   * collected from live state (benches, mats, pads, the camp, rail crossings), merged, and the
   * fence is emitted as runs between them.
   */
  private buildFences(state: GameState): void {
    // Shared across both edges. The camp is entered from either side of the road, so it
    // contributes a gap on each edge at its own z — an entry at the camp's centre (z = 0) would
    // be filtered out as too far from both fence lines and open nothing.
    const common: FenceGap[] = [];
    for (const st of state.stations) {
      common.push({ x: st.pos.x, z: st.pos.z, half: 2.2 });
      common.push({ x: st.matPos.x, z: st.matPos.z, half: 2.0 });
      // The shoppers' walk-in lane crosses the fence line to the west of the bench, outside the
      // bench's own gap; without this they file straight through the pickets.
      common.push({ x: queueLaneX(st), z: st.pos.z, half: 1.0 });
    }
    for (const pad of state.pads) common.push({ x: pad.pos.x, z: pad.pos.z, half: 2.8 });
    for (const sz of [-1, 1]) {
      const fenceZ = sz * ROAD_Z;
      // Built fresh per edge: appending to one shared array leaked the -Z edge's rail crossings
      // into the +Z edge's gap set.
      const gaps: FenceGap[] = [...common, { x: state.depotPos.x, z: fenceZ, half: 7.5 }];
      for (const rail of state.rails)
        for (const x of Renderer.crossings(rail.points, fenceZ)) gaps.push({ x, z: fenceZ, half: 1.8 });
      const blocked = gaps
        .filter((g) => Math.abs(g.z - fenceZ) < 5.5)
        .map((g) => [g.x - g.half, g.x + g.half] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      const line = new THREE.Group();
      // Runs shorter than one picket produce nothing; adding those empty groups just grows the
      // scene graph the renderer walks every frame.
      const addRun = (a: number, b: number): void => {
        const run = makeFenceRun(a, b, 'x', fenceZ);
        if (run.children.length > 0) line.add(run);
      };
      let cursor = FENCE_FROM;
      for (const [b0, b1] of blocked) {
        if (b1 <= cursor) continue;
        if (b0 >= FENCE_TO) break;
        if (b0 > cursor) addRun(cursor, Math.min(b0, FENCE_TO));
        cursor = b1;
        if (cursor >= FENCE_TO) break;
      }
      if (cursor < FENCE_TO) addRun(cursor, FENCE_TO);
      setShadow(line, true, true);
      this.scene.add(line);
    }
    // The villager field is bounded by the road fence on its camp side; these close the far
    // west and south edges so the snowfield does not just run off into nothing.
    const field = new THREE.Group();
    field.add(makeFenceRun(9, 35, 'z', -48));
    field.add(makeFenceRun(-48, -6, 'x', 35));
    setShadow(field, true, true);
    this.scene.add(field);
  }

  /**
   * The forest, as two `InstancedMesh` — standing trees and stumps — off the two merged tree
   * buffers. At ~3,250 trees the old one-Group-per-tree approach put 9,750 objects in the scene
   * graph for three-js to walk and cull every frame; this is two draws and two culls, with the
   * same deterministic per-tree scale and spin baked into each instance matrix.
   *
   * Both meshes carry an entry for every tree so an id maps to one index in both, and the state
   * a tree is NOT in is parked at zero scale (a degenerate instance draws nothing and casts no
   * shadow). Felling a tree is then two matrix writes at one index.
   */
  private buildForest(state: GameState): void {
    const geo = treeGeometries();
    const mat = treeMaterial();
    const count = state.trees.length;
    this.standingTrees = new THREE.InstancedMesh(geo.full, mat, count);
    this.stumpTrees = new THREE.InstancedMesh(geo.stump, mat, count);
    this.treeIndex.clear();
    this.treeVisual = new Uint8Array(count);
    for (const inst of [this.standingTrees, this.stumpTrees]) {
      inst.castShadow = true;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // three derives an InstancedMesh's bounding sphere from the instance matrices ONCE and
      // caches it. The stump mesh starts with every instance parked at zero scale on the origin,
      // so that cached sphere is a point at the origin and every stump the player cuts anywhere
      // else gets frustum-culled out of existence. Both meshes span the whole world and would
      // never be culled anyway, so the mesh-level test is simply switched off.
      inst.frustumCulled = false;
      this.scene.add(inst);
    }
    for (let i = 0; i < count; i++) this.treeIndex.set(state.trees[i].id, i);
    this.syncTrees(state);
  }

  /** Push every tree whose visible state changed into both instance matrices. */
  private syncTrees(state: GameState): void {
    const standing = this.standingTrees, stumps = this.stumpTrees;
    if (!standing || !stumps) return;
    let dirty = false;
    for (let i = 0; i < state.trees.length; i++) {
      const tree = state.trees[i];
      const want = !state.zonesOpen[tree.zone]
        ? TreeVisual.Hidden
        : tree.respawn === 0 ? TreeVisual.Standing : TreeVisual.Stump;
      if (this.treeVisual[i] === want) continue;
      this.treeVisual[i] = want;
      dirty = true;
      if (want === TreeVisual.Hidden) {
        standing.setMatrixAt(i, HIDDEN_MATRIX);
        stumps.setMatrixAt(i, HIDDEN_MATRIX);
        continue;
      }
      const s = 0.85 + hash01(`${tree.id}size`) * 0.4;
      this.treeMatrix.compose(
        this.scratch.set(tree.pos.x, 0, tree.pos.z),
        this.treeSpin.setFromAxisAngle(UP, hash01(`${tree.id}rot`) * Math.PI * 2),
        this.treeScale.set(s, s, s),
      );
      const shown = want === TreeVisual.Standing ? standing : stumps;
      const hidden = want === TreeVisual.Standing ? stumps : standing;
      shown.setMatrixAt(i, this.treeMatrix);
      hidden.setMatrixAt(i, HIDDEN_MATRIX);
    }
    if (!dirty) return;
    standing.instanceMatrix.needsUpdate = true;
    stumps.instanceMatrix.needsUpdate = true;
  }

  /** Build once-per-game meshes from state (stations, pads, machines, rails, gates, fences). */
  buildStatic(state: GameState): void {
    this.buildForest(state);
    for (const st of state.stations) {
      const bench = setShadow(makeBench(), true);
      bench.position.set(st.pos.x, 0, st.pos.z);
      // The bubble counts the goods on the shelf, the way the ad's benches count down as buyers
      // take them; the cash they leave behind is the bill stack on the mat instead.
      const count = Math.floor(st.stock);
      const label = makeBubbleLabel(st.resource, count);
      label.position.y = 3.1;
      bench.add(label);
      this.stationBubbles.set(st.id, label);
      this.lastStock.set(st.id, count);
      this.scene.add(bench);
      const mat = makeMatMesh();
      mat.position.set(st.matPos.x, 0, st.matPos.z);
      this.scene.add(mat);
    }
    for (const pad of state.pads) {
      const g = makePadMesh();
      g.position.set(pad.pos.x, 0, pad.pos.z);
      const label = makePadLabel(pad.currency, pad.cost);
      label.position.y = 2.2;
      g.add(label);
      this.meshes.set(pad.id, g);
      this.scene.add(g);
    }
    for (const turret of state.turrets) {
      const g = setShadow(makeTurret(), true);
      g.position.set(turret.pos.x, 0, turret.pos.z);
      this.meshes.set(turret.id, g);
      this.scene.add(g);
    }
    for (const mill of state.sawmills) {
      const g = setShadow(makeSawmill(), true);
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
    this.buildFences(state);
  }

  /** Drop every scene object and the GPU resources it owns. */
  private clearScene(): void {
    for (const f of this.floats) this.dropFloat(f);
    this.floats = [];
    // The sun owns a 2048² shadow map render target, which no scene-graph traversal reaches.
    this.sun.dispose();
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      this.scene.remove(child);
      disposeSubtree(child);
    }
    this.meshes.clear();
    this.dropMeshes.clear();
    this.customerMeshes.clear();
    // The instanced meshes were disposed by the traversal above; drop the index alongside them
    // so a rebuild cannot address a freed buffer.
    this.standingTrees = null;
    this.stumpTrees = null;
    this.treeIndex.clear();
    this.treeVisual = new Uint8Array(0);
    this.gates.clear();
    this.stationBubbles.clear();
    this.lastStock.clear();
    this.snowLayers = [];
    this.hitFlash = 0;
  }

  /** Full teardown + rebuild (used by Restart). */
  rebuild(state: GameState): void {
    this.clearScene();
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
    this.syncPlayer(state, dt);
    this.syncTrees(state);
    for (const seam of state.seams) {
      const m = this.ensure(seam.id, () => setShadow(makeSeam(), true));
      m.position.set(seam.pos.x, 0, seam.pos.z);
      m.visible = state.zonesOpen[seam.zone];
      m.scale.y = seam.respawn > 0 ? 0.35 : 1;
    }
    for (const bear of state.bears) {
      const m = this.ensure(bear.id, () => setShadow(makeBear(), true));
      m.position.set(bear.pos.x, 0, bear.pos.z);
      m.visible = state.zonesOpen[bear.zone] && bear.state !== 'dead';
      if (bear.state === 'aggro') {
        m.rotation.y = Math.atan2(state.player.pos.x - bear.pos.x, state.player.pos.z - bear.pos.z);
        m.position.y = Math.abs(Math.sin(this.t * 10)) * 0.15;
      }
      const refs = refsOf<BearRefs>(m);
      // Sleeping bears breathe. Purely cosmetic: the pulse never touches game state.
      const breath = bear.state === 'sleep'
        ? 1 + Math.sin(this.t * 1.7 + hash01(bear.id) * Math.PI * 2) * 0.035
        : 1;
      refs.body.scale.set(
        BEAR_BODY_SCALE.x * breath, BEAR_BODY_SCALE.y * breath, BEAR_BODY_SCALE.z,
      );
      // Keep the bars square to the camera no matter which way the bear turned.
      refs.bars.rotation.y = Math.PI / 4 - m.rotation.y;
      const hurt = bear.hp < bear.maxHp && bear.state !== 'dead';
      refs.hpBg.visible = hurt;
      refs.hp.visible = hurt;
      // Scaling a centred box shrinks it from both ends; slide it left by half the loss so the
      // bar drains from the right like a health bar should.
      const frac = Math.max(bear.hp / bear.maxHp, 0.001);
      refs.hp.scale.x = frac;
      refs.hp.position.x = -(1 - frac) * HP_BAR_WIDTH / 2;
    }
    const liveDrops = new Set<string>();
    for (const drop of state.drops) {
      liveDrops.add(drop.id);
      let m = this.dropMeshes.get(drop.id);
      if (!m) {
        m = setShadow(makeDropMesh(drop.kind), true);
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
      this.syncPile(`cash-${st.id}`, st.matPos.x, st.matPos.z, st.matCash, COLORS.cash, 10, 24, 0.07);
      // Repainting a 256² canvas every frame would be wasteful and pointless: only redraw when
      // the whole-goods figure the bubble actually shows has moved.
      const count = Math.floor(st.stock);
      const bubble = this.stationBubbles.get(st.id);
      if (bubble && this.lastStock.get(st.id) !== count) {
        this.lastStock.set(st.id, count);
        bubble.material.map = bubbleTexture(st.resource, count);
      }
    }
    for (const turret of state.turrets) {
      const m = this.meshes.get(turret.id);
      if (!m) continue;
      m.visible = turret.active;
      this.syncPile(
        `out-${turret.id}`, turret.pos.x + 1.4, turret.pos.z + 1.4, turret.output, COLORS.meat, 3, 18,
      );
    }
    for (const mill of state.sawmills) {
      const m = this.meshes.get(mill.id);
      if (!m) continue;
      m.visible = mill.active;
      if (mill.active) refsOf<SawmillRefs>(m).blade.rotation.x += dt * 6;
      this.syncPile(
        `out-${mill.id}`, mill.pos.x + 1.6, mill.pos.z + 1.4, mill.output, COLORS.wood, 3, 18,
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
      const m = this.ensure(cart.id, () => setShadow(makeCart(), true));
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
      const m = this.ensure(vil.id, () => setShadow(makeVillager(vil.kind), true));
      const frozen = vil.state === 'frozen';
      // Haulers all converge on the same logic positions; nudge each one off the pile so the
      // crowd reads as individuals. Frozen rows stay on their exact grid.
      const jx = frozen ? 0 : (((i * 37) % 11) - 5) * 0.12;
      const jz = frozen ? 0 : (((i * 53) % 11) - 5) * 0.12;
      const bob = frozen ? 0 : Math.abs(Math.sin(this.t * 8 + i)) * 0.08;
      m.position.set(vil.pos.x + jx, bob, vil.pos.z + jz);
      const refs = refsOf<VillagerRefs>(m);
      refs.ice.visible = frozen;
      refs.frost.visible = frozen;
      refs.load.visible = vil.carrying !== null;
      if (vil.carrying) refs.load.material = lam(COLORS[vil.carrying]);
    }
    this.syncCustomers(state);
    for (const [zone, wall] of this.gates) wall.visible = !state.zonesOpen[zone];
    const p = state.player.pos;
    this.target.lerp(this.scratch.set(p.x, 0, p.z), 1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.target).add(CAM_OFFSET);
    this.camera.lookAt(this.target);
    // Walk the sun with the camera so the shadow frustum always covers what is on screen.
    this.sun.position.copy(this.target).add(SUN_OFFSET);
    this.sun.target.position.copy(this.target);
    this.sun.target.updateMatrixWorld();
  }

  /**
   * Shoppers, spawned and despawned against `state.customers`. Every position here is state's —
   * the queue and its shuffle are simulated, not animated. All this adds is the walk cycle and a
   * facing derived from where the shopper moved since the last frame, so a line all faces the
   * bench and departing buyers turn around.
   *
   * There can be forty-odd of these on screen at once, every frame, so everything that is fixed
   * for a shopper's whole visit — its bench, its gait phase — is resolved once at spawn and
   * cached on the mesh, the last-position vector is mutated in place rather than reallocated,
   * and the carried-goods material is assigned on the transition instead of every frame.
   */
  private syncCustomers(state: GameState): void {
    const live = new Set<string>();
    for (const c of state.customers) {
      live.add(c.id);
      let m = this.customerMeshes.get(c.id);
      if (!m) {
        const h = hash01(c.id);
        m = setShadow(makeCustomer(Math.floor(h * CUSTOMER_COATS.length)), true);
        m.userData.station = state.stations.find((s) => s.id === c.stationId) ?? null;
        m.userData.phase = h * 6;
        m.userData.last = { x: c.pos.x, z: c.pos.z };
        m.userData.carrying = false;
        this.customerMeshes.set(c.id, m);
        this.scene.add(m);
      }
      const last = m.userData.last as Vec2;
      const dx = c.pos.x - last.x;
      const dz = c.pos.z - last.z;
      last.x = c.pos.x;
      last.z = c.pos.z;
      const moved = Math.hypot(dx, dz);
      if (moved > 1e-4) m.rotation.y = Math.atan2(dx, dz);
      const bob = moved > 1e-4
        ? Math.abs(Math.sin(this.t * 8 + (m.userData.phase as number))) * 0.08
        : 0;
      m.position.set(c.pos.x, bob, c.pos.z);
      const carrying = c.bought > 0;
      if (carrying !== m.userData.carrying) {
        m.userData.carrying = carrying;
        const refs = refsOf<CustomerRefs>(m);
        refs.load.visible = carrying;
        const st = m.userData.station as SellStation | null;
        if (carrying && st) refs.load.material = lam(COLORS[st.resource]);
      }
    }
    for (const [id, m] of this.customerMeshes) {
      if (live.has(id)) continue;
      this.scene.remove(m);
      this.customerMeshes.delete(id);
    }
  }

  /**
   * The camp is one structure that is swapped wholesale when a camp pad completes; the depot
   * stockpiles and nameplate follow the tier's layout (outside the hut, on shelves in the fort).
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
      const g = setShadow(makeCampTier(tier), true, true);
      g.position.set(state.depotPos.x, 0, state.depotPos.z);
      const label = makeTextLabel(CAMP_TIERS[tier].name);
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
        state.depot[kinds[i]], colors[i], 3, 18, info.floorY,
      );
    }
  }

  /**
   * One pile renderer for station cash, machine outputs and depot stockpiles. Every pile is a
   * capped grid of boxes — three wide, two deep, stacking upward — so a cash mat reads as the
   * ad's bundled bills and a stockpile as crates. `unitsPerBox` sets how fast it grows and
   * `cap` bounds the mesh count; `baseY` lifts a pile onto a camp platform or shelf.
   */
  private syncPile(
    id: string, x: number, z: number, count: number, color: number,
    unitsPerBox: number, cap: number, baseY = 0,
  ): void {
    const g = this.ensure(id, () => setShadow(makePileStack(color, cap), true));
    const boxes = count > 0 ? Math.min(Math.ceil(count / unitsPerBox), cap) : 0;
    g.visible = boxes > 0;
    g.position.set(x, baseY, z);
    for (let i = 0; i < g.children.length; i++) g.children[i].visible = i < boxes;
  }

  private syncPlayer(state: GameState, dt: number): void {
    const p = state.player;
    const m = this.ensure('player', () => setShadow(makePlayer(), true)) as THREE.Group;
    m.position.set(p.pos.x, 0, p.pos.z);
    const refs = refsOf<PlayerRefs>(m);
    // Hit flash: full red on impact, decaying back to the coat colour over HIT_FLASH_TIME.
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      refs.coat.color.copy(COAT_BASE).lerp(COAT_HIT, this.hitFlash / HIT_FLASH_TIME);
    } else if (!refs.coat.color.equals(COAT_BASE)) {
      refs.coat.color.copy(COAT_BASE);
    }
    const toolKey = `${p.tool}|${p.hasPickaxe}`;
    if (toolKey !== this.lastToolKey) {
      this.lastToolKey = toolKey;
      for (const child of [...refs.toolMount.children]) disposeSubtree(child);
      refs.toolMount.clear();
      refs.toolMount.add(setShadow(makeTool(p.tool), true));
      if (p.hasPickaxe) {
        // Slung across the back-left, clear of both the swinging tool and the carry stack.
        const pick = setShadow(makeTool('pickaxe'), true);
        pick.position.set(-0.62, -0.2, -0.38);
        pick.rotation.set(0, 0, 0.62);
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
          box.castShadow = true;
          box.position.y = y;
          y += 0.19;
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
      if (e.type === 'playerHit') this.hitFlash = HIT_FLASH_TIME;
      let sprite: THREE.Sprite | null = null;
      if (e.type === 'sell') sprite = makeIconTextLabel('cash', `+${e.cash}`);
      else if (e.type === 'unlock') sprite = makeTextLabel('Unlocked!');
      else if (e.type === 'thaw') sprite = makeTextLabel('+1 rescued');
      if (sprite && 'pos' in e) {
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
    // Flakes stay in world space — they fall past the scenery with real parallax — but any that
    // the camera has left behind wrap round to the other side of the volume, so the snowfall
    // travels with the player across a world far larger than the particle budget covers.
    for (let layer = 0; layer < this.snowLayers.length; layer++) {
      const pos = this.snowLayers[layer].geometry.getAttribute('position') as THREE.BufferAttribute;
      const fall = dt * (1.4 + layer * 0.7);
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - fall;
        if (y < 0) y = SNOW_TOP;
        pos.setY(i, y);
        pos.setX(i, wrapAround(pos.getX(i), this.target.x, SNOW_HALF));
        pos.setZ(i, wrapAround(pos.getZ(i), this.target.z, SNOW_HALF));
      }
      pos.needsUpdate = true;
    }
    this.webgl.render(this.scene, this.camera);
  }
}
