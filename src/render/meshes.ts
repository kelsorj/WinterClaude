import * as THREE from 'three';
import type { Currency, ToolId } from '../game/state';

/**
 * Every geometry, material and texture created at module scope is registered here. The renderer
 * tears whole subtrees down (rebuild, tier swaps, tool changes) with `disposeSubtree`, which
 * disposes anything it finds EXCEPT members of this set — shared resources outlive the meshes
 * that borrow them, so disposing one would leave every other user drawing against freed buffers.
 */
const shared = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
function reg<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T): T {
  shared.add(x);
  return x;
}
export const SHARED: ReadonlySet<THREE.BufferGeometry | THREE.Material | THREE.Texture> = shared;

export const COLORS = {
  trunk: 0x8a5a33, foliage: 0x9cc7e8, foliage2: 0xb8dbf2,
  snow: 0xf4f8fb, road: 0xc4996a,
  bear: 0xf0efe8, skin: 0xe8c39e,
  playerCoat: 0x2b6cb0, villagerCoat: 0x3bb2c4, ice: 0x9adcf0,
  bench: 0xe08a3c, mat: 0x3a3a3a,
  wood: 0xa9743f, meat: 0xd9534f, gold: 0xf2c14e, cash: 0x4caf50,
  rail: 0x6b4a2b, machine: 0xb5834f,
};

export const ICONS: Record<Currency, string> = { cash: '💵', wood: '🪵', meat: '🥩', gold: '🪙' };

/** Lambert materials are keyed by colour+opacity so every mesh of a kind shares one. */
const materials = new Map<string, THREE.MeshLambertMaterial>();
export function lam(color: number, opacity = 1): THREE.MeshLambertMaterial {
  const key = `${color}|${opacity}`;
  let m = materials.get(key);
  if (!m) {
    m = reg(new THREE.MeshLambertMaterial(
      opacity < 1 ? { color, transparent: true, opacity } : { color },
    ));
    materials.set(key, m);
  }
  return m;
}

/** Shared geometry table. Meshes vary by scale/rotation/position only, never by geometry. */
const GEO = {
  unitBox: reg(new THREE.BoxGeometry(1, 1, 1)),
  treeTrunk: reg(new THREE.CylinderGeometry(0.22, 0.32, 1.2, 6)),
  treeCone1: reg(new THREE.ConeGeometry(1.5, 2.4, 7)),
  treeCone2: reg(new THREE.ConeGeometry(1.0, 1.8, 7)),
  treeStump: reg(new THREE.CylinderGeometry(0.3, 0.36, 0.4, 6)),
  personBody: reg(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 8)),
  personHead: reg(new THREE.SphereGeometry(0.3, 8, 8)),
  toolHandle: reg(new THREE.CylinderGeometry(0.05, 0.05, 1, 6)),
  bearBody: reg(new THREE.SphereGeometry(0.9, 10, 8)),
  bearHead: reg(new THREE.SphereGeometry(0.45, 8, 8)),
  bearEar: reg(new THREE.SphereGeometry(0.14, 6, 6)),
  bearNose: reg(new THREE.SphereGeometry(0.1, 6, 6)),
  villagerIce: reg(new THREE.BoxGeometry(1.0, 1.9, 1.0)),
  villagerLoad: reg(new THREE.BoxGeometry(0.5, 0.4, 0.5)),
  benchTop: reg(new THREE.BoxGeometry(2.2, 0.25, 1.0)),
  benchBase: reg(new THREE.BoxGeometry(2.0, 0.7, 0.8)),
  mat: reg(new THREE.BoxGeometry(1.6, 0.06, 1.6)),
  padBase: reg(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 24)),
  padProgress: reg(new THREE.CylinderGeometry(1.45, 1.45, 0.06, 24)),
  turretBase: reg(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 8)),
  turretPost: reg(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 6)),
  turretBowA: reg(new THREE.BoxGeometry(1.6, 0.1, 0.14)),
  turretBowB: reg(new THREE.BoxGeometry(0.14, 0.1, 1.1)),
  millFrame: reg(new THREE.BoxGeometry(1.8, 1.0, 1.4)),
  millBlade: reg(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16)),
  cartBox: reg(new THREE.BoxGeometry(1.0, 0.5, 0.7)),
  cartLoad: reg(new THREE.BoxGeometry(0.8, 0.4, 0.5)),
  /** Unit primitives: camp structures scale these instead of minting geometry per tier. */
  unitCyl: reg(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
  unitCone: reg(new THREE.ConeGeometry(0.5, 1, 8)),
  seamRock: reg(new THREE.SphereGeometry(1.1, 7, 5)),
  seamNugget: reg(new THREE.IcosahedronGeometry(0.25, 0)),
  /** Unit-length along X: scale.x carries the span so every wall/rail shares one buffer. */
  spanBar: reg(new THREE.BoxGeometry(1, 1, 1)),
  railSleeper: reg(new THREE.BoxGeometry(0.14, 0.06, 0.9)),
  gatePost: reg(new THREE.CylinderGeometry(0.3, 0.3, 2.8, 8)),
  hpBg: reg(new THREE.BoxGeometry(1.4, 0.12, 0.02)),
  hpBar: reg(new THREE.BoxGeometry(1.36, 0.1, 0.03)),
  carryBox: reg(new THREE.BoxGeometry(0.55, 0.2, 0.4)),
  pileBox: reg(new THREE.BoxGeometry(1.0, 1, 1.0)),
  dropWood: reg(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 6)),
  dropMeat: reg(new THREE.BoxGeometry(0.5, 0.35, 0.4)),
  dropGold: reg(new THREE.BoxGeometry(0.5, 0.28, 0.3)),
  dropCash: reg(new THREE.BoxGeometry(0.5, 0.08, 0.3)),
};

/**
 * Label canvases are expensive and repeat constantly (every "+$6" float redraws the same text),
 * so textures are cached by their text key. Evicting the oldest entry disposes it: a still-live
 * sprite holding an evicted texture simply re-uploads from its canvas on the next frame.
 */
const labelTextures = new Map<string, THREE.CanvasTexture>();
const LABEL_CACHE_CAP = 64;

function labelTexture(key: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = labelTextures.get(key);
  if (hit) {
    labelTextures.delete(key);
    labelTextures.set(key, hit); // touch: most-recently-used goes last
    return hit;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  draw(canvas.getContext('2d')!);
  const tex = reg(new THREE.CanvasTexture(canvas));
  labelTextures.set(key, tex);
  if (labelTextures.size > LABEL_CACHE_CAP) {
    const oldestKey = labelTextures.keys().next().value as string;
    const oldest = labelTextures.get(oldestKey)!;
    labelTextures.delete(oldestKey);
    shared.delete(oldest);
    oldest.dispose();
  }
  return tex;
}

export function makeLabel(text: string): THREE.Sprite {
  const tex = labelTexture(text, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(8, 20, 240, 88, 20);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 64);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(3.4, 1.7, 1);
  return sprite;
}

/** Typed child handles stashed on `userData.refs` by the builders below. */
export function refsOf<T>(o: THREE.Object3D): T {
  return o.userData.refs as T;
}

export interface TreeRefs { full: THREE.Object3D; stump: THREE.Object3D }

export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const full = new THREE.Group();
  const trunk = new THREE.Mesh(GEO.treeTrunk, lam(COLORS.trunk));
  trunk.position.y = 0.6;
  const c1 = new THREE.Mesh(GEO.treeCone1, lam(COLORS.foliage));
  c1.position.y = 2.1;
  const c2 = new THREE.Mesh(GEO.treeCone2, lam(COLORS.foliage2));
  c2.position.y = 3.3;
  full.add(trunk, c1, c2);
  const stump = new THREE.Mesh(GEO.treeStump, lam(COLORS.trunk));
  stump.position.y = 0.2;
  g.add(full, stump);
  g.userData.refs = { full, stump } satisfies TreeRefs;
  return g;
}

export function makePerson(coat: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.personBody, lam(coat));
  body.position.y = 0.65;
  const head = new THREE.Mesh(GEO.personHead, lam(COLORS.skin));
  head.position.y = 1.4;
  g.add(body, head);
  return g;
}

export interface PlayerRefs { toolMount: THREE.Group; carry: THREE.Group }

export function makePlayer(): THREE.Group {
  const g = makePerson(COLORS.playerCoat);
  const toolMount = new THREE.Group();
  toolMount.position.set(0.45, 1.0, 0.1);
  const carry = new THREE.Group();
  carry.position.set(0, 1.05, -0.4);
  g.add(toolMount, carry);
  g.userData.refs = { toolMount, carry } satisfies PlayerRefs;
  return g;
}

export function makeTool(kind: ToolId | 'pickaxe'): THREE.Group {
  const g = new THREE.Group();
  const isLong = kind === 'scythe';
  const handle = new THREE.Mesh(GEO.toolHandle, lam(0x7a5230));
  handle.scale.y = isLong ? 1.4 : 0.9;
  handle.position.y = isLong ? 0.7 : 0.45;
  g.add(handle);
  if (kind === 'scythe') {
    const blade = new THREE.Mesh(GEO.unitBox, lam(0xc0c8cc));
    blade.scale.set(0.9, 0.06, 0.18);
    blade.position.set(0.4, 1.4, 0);
    g.add(blade);
  } else if (kind === 'pickaxe') {
    const head = new THREE.Mesh(GEO.unitBox, lam(0x95a5a6));
    head.scale.set(0.7, 0.1, 0.1);
    head.position.set(0, 0.85, 0);
    g.add(head);
  } else {
    const head = new THREE.Mesh(GEO.unitBox, lam(kind === 'axe' ? 0xc0392b : 0x95a5a6));
    head.scale.set(0.34, 0.22, 0.12);
    head.position.set(0.12, 0.85, 0);
    g.add(head);
  }
  return g;
}

export interface BearRefs { bars: THREE.Group; hpBg: THREE.Object3D; hp: THREE.Object3D }

export function makeBear(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.bearBody, lam(COLORS.bear));
  body.scale.set(1.1, 0.8, 1.5);
  body.position.y = 0.75;
  const head = new THREE.Mesh(GEO.bearHead, lam(COLORS.bear));
  head.position.set(0, 1.1, 1.2);
  const e1 = new THREE.Mesh(GEO.bearEar, lam(COLORS.bear)); e1.position.set(0.25, 1.5, 1.1);
  const e2 = new THREE.Mesh(GEO.bearEar, lam(COLORS.bear)); e2.position.set(-0.25, 1.5, 1.1);
  const nose = new THREE.Mesh(GEO.bearNose, lam(0x333333));
  nose.position.set(0, 1.05, 1.6);
  // The HP bars live in their own group so aggro rotation of the body can be cancelled out and
  // the bars keep facing the camera.
  const bars = new THREE.Group();
  bars.position.y = 2.2;
  bars.rotation.y = Math.PI / 4;
  const hpBg = new THREE.Mesh(GEO.hpBg, lam(0x222222));
  const hp = new THREE.Mesh(GEO.hpBar, lam(0x44cc44));
  hp.position.z = 0.01;
  bars.add(hpBg, hp);
  g.add(body, head, e1, e2, nose, bars);
  g.userData.refs = { bars, hpBg, hp } satisfies BearRefs;
  return g;
}

export interface VillagerRefs { ice: THREE.Object3D; load: THREE.Object3D }

export function makeVillager(): THREE.Group {
  const g = makePerson(COLORS.villagerCoat);
  const ice = new THREE.Mesh(GEO.villagerIce, lam(COLORS.ice, 0.55));
  ice.position.y = 0.95;
  const load = new THREE.Mesh(GEO.villagerLoad, lam(COLORS.wood));
  load.position.set(0, 1.1, -0.45);
  load.visible = false;
  g.add(ice, load);
  g.userData.refs = { ice, load } satisfies VillagerRefs;
  return g;
}

export function makeBench(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(GEO.benchTop, lam(COLORS.bench));
  top.position.y = 0.8;
  const base = new THREE.Mesh(GEO.benchBase, lam(0xc47a34));
  base.position.y = 0.35;
  g.add(top, base);
  return g;
}

export function makeMatMesh(): THREE.Mesh {
  const m = new THREE.Mesh(GEO.mat, lam(COLORS.mat));
  m.position.y = 0.03;
  return m;
}

export interface PadRefs { progress: THREE.Object3D }

export function makePadMesh(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(GEO.padBase, lam(0x555555));
  base.position.y = 0.025;
  const progress = new THREE.Mesh(GEO.padProgress, lam(0x3aa655));
  progress.position.y = 0.035;
  progress.scale.set(0.001, 1, 0.001);
  g.add(base, progress);
  g.userData.refs = { progress } satisfies PadRefs;
  return g;
}

export function makeTurret(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(GEO.turretBase, lam(COLORS.machine));
  base.position.y = 0.25;
  const post = new THREE.Mesh(GEO.turretPost, lam(COLORS.trunk));
  post.position.y = 1.0;
  const bowA = new THREE.Mesh(GEO.turretBowA, lam(0x8a5a33));
  bowA.position.y = 1.7;
  const bowB = new THREE.Mesh(GEO.turretBowB, lam(0x6b4a2b));
  bowB.position.y = 1.7;
  g.add(base, post, bowA, bowB);
  return g;
}

export interface SawmillRefs { blade: THREE.Object3D }

export function makeSawmill(): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(GEO.millFrame, lam(COLORS.machine));
  frame.position.y = 0.5;
  const blade = new THREE.Mesh(GEO.millBlade, lam(0xc0c8cc));
  blade.rotation.z = Math.PI / 2;
  blade.position.y = 1.3;
  g.add(frame, blade);
  g.userData.refs = { blade } satisfies SawmillRefs;
  return g;
}

export interface CartRefs { load: THREE.Object3D }

export function makeCart(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(GEO.cartBox, lam(0x555b61));
  box.position.y = 0.5;
  const load = new THREE.Mesh(GEO.cartLoad, lam(COLORS.wood));
  load.position.y = 0.85;
  g.add(box, load);
  g.userData.refs = { load } satisfies CartRefs;
  return g;
}

const box = (w: number, h: number, d: number, color: number): THREE.Mesh => {
  const m = new THREE.Mesh(GEO.unitBox, lam(color));
  m.scale.set(w, h, d);
  return m;
};

const cyl = (r: number, h: number, color: number): THREE.Mesh => {
  const m = new THREE.Mesh(GEO.unitCyl, lam(color));
  m.scale.set(r * 2, h, r * 2);
  return m;
};

const cone = (r: number, h: number, color: number): THREE.Mesh => {
  const m = new THREE.Mesh(GEO.unitCone, lam(color));
  m.scale.set(r * 2, h, r * 2);
  return m;
};

const at = <T extends THREE.Object3D>(m: T, x: number, y: number, z: number): T => {
  m.position.set(x, y, z);
  return m;
};

const CAMP_WOOD = 0xb07a45;
const CAMP_LOG = 0x9a6b3f;
const CAMP_RED = 0xc0392b;
const CAMP_RED_DARK = 0x8f2b20;

/** Where the depot stockpiles sit and how high the camp label floats, per tier. */
export interface CampTierInfo {
  labelY: number;
  floorY: number;
  piles: { x: number; z: number }[];
}

export const CAMP_TIERS: CampTierInfo[] = [
  { labelY: 2.0, floorY: 0, piles: [{ x: -1.6, z: 2.2 }, { x: 0, z: 2.2 }, { x: 1.6, z: 2.2 }] },
  { labelY: 3.4, floorY: 0.3, piles: [{ x: -1.6, z: 3.3 }, { x: 0, z: 3.3 }, { x: 1.6, z: 3.3 }] },
  { labelY: 4.2, floorY: 0.3, piles: [{ x: -1.7, z: 1.4 }, { x: 0.2, z: 1.4 }, { x: 2.0, z: 1.4 }] },
  { labelY: 5.6, floorY: 0.35, piles: [{ x: -2.0, z: -1.0 }, { x: 0, z: -1.0 }, { x: 2.0, z: -1.0 }] },
  { labelY: 6.4, floorY: 0.4, piles: [{ x: -2.3, z: -1.2 }, { x: 0, z: -1.2 }, { x: 2.3, z: -1.2 }] },
];

/** Snowy clearing with survey stakes: the camp site before any wood is poured in. */
function campClearing(g: THREE.Group): void {
  g.add(at(cyl(3.6, 0.08, 0xe9f2f9), 0, 0.04, 0));
  for (const [sx, sz] of [[-2.7, -2.7], [2.7, -2.7], [-2.7, 2.7], [2.7, 2.7]] as const) {
    g.add(at(cyl(0.09, 1.3, 0xd8d2c4), sx, 0.65, sz));
    g.add(at(box(0.34, 0.3, 0.1, CAMP_RED), sx, 1.35, sz));
  }
  g.add(at(box(0.8, 0.55, 0.8, CAMP_WOOD), 2.2, 0.28, 1.4));
}

/** Tier 1 — Shelter Hut: platform, corner posts, half-walls, red roof, crates. */
function campHut(g: THREE.Group): void {
  g.add(at(box(5, 0.3, 5, CAMP_LOG), 0, 0.15, 0));
  for (const [px, pz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]] as const)
    g.add(at(cyl(0.16, 2.0, COLORS.trunk), px, 1.3, pz));
  g.add(at(box(5, 1.5, 0.25, CAMP_WOOD), 0, 1.05, -2.3));
  g.add(at(box(0.25, 1.5, 5, CAMP_WOOD), -2.3, 1.05, 0));
  const roof = at(box(5.8, 0.28, 5.8, CAMP_RED), 0, 2.44, 0);
  roof.rotation.x = 0.06;
  g.add(roof);
  for (const [cx, cz] of [[1.5, 1.5], [2.0, 0.7], [1.2, 0.6]] as const)
    g.add(at(box(0.8, 0.7, 0.8, CAMP_WOOD), cx, 0.65, cz));
}

/** Tier 2 — Stockade: stacked log walls on two sides, red barn doors on the others. */
function campStockade(g: THREE.Group): void {
  g.add(at(box(6.6, 0.3, 6.6, CAMP_LOG), 0, 0.15, 0));
  for (let course = 0; course < 4; course++) {
    const y = 0.55 + course * 0.46;
    const tint = course % 2 === 0 ? CAMP_LOG : CAMP_WOOD;
    const north = at(cyl(0.23, 6.6, tint), 0, y, -3.1);
    north.rotation.z = Math.PI / 2;
    g.add(north);
    const west = at(cyl(0.23, 6.6, tint), -3.1, y, 0);
    west.rotation.x = Math.PI / 2;
    g.add(west);
  }
  for (const [dx, dz, rotY] of [[0, 3.2, 0], [3.2, 0, Math.PI / 2]] as const) {
    const door = new THREE.Group();
    door.add(box(3.0, 2.3, 0.25, CAMP_RED));
    door.add(at(box(0.22, 2.3, 0.32, CAMP_RED_DARK), -0.7, 0, 0));
    door.add(at(box(0.22, 2.3, 0.32, CAMP_RED_DARK), 0.7, 0, 0));
    door.position.set(dx, 1.45, dz);
    door.rotation.y = rotY;
    g.add(door);
  }
  for (const [px, pz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]] as const)
    g.add(at(cyl(0.26, 2.9, COLORS.trunk), px, 1.45, pz));
  g.add(at(box(0.9, 0.75, 0.9, CAMP_WOOD), 2.4, 0.68, -2.3));
}

/** Tier 3 — Fort: tall red plank walls, gate towers, interior shelves for the stockpiles. */
function campFort(g: THREE.Group): void {
  g.add(at(box(8, 0.35, 8, CAMP_LOG), 0, 0.18, 0));
  const wall = (w: number, x: number, z: number, rotY: number): void => {
    const seg = new THREE.Group();
    seg.add(box(w, 3.2, 0.4, CAMP_RED));
    for (let i = 0; i < Math.max(2, Math.round(w / 1.1)); i++)
      seg.add(at(box(0.18, 3.2, 0.5, CAMP_RED_DARK), -w / 2 + (i + 0.5) * (w / Math.round(w / 1.1)), 0, 0));
    seg.position.set(x, 1.95, z);
    seg.rotation.y = rotY;
    g.add(seg);
  };
  wall(8, 0, -3.8, 0);
  wall(8, -3.8, 0, Math.PI / 2);
  wall(8, 3.8, 0, Math.PI / 2);
  wall(2.6, -2.7, 3.8, 0); // the south face keeps a gap: that is the way in
  wall(2.6, 2.7, 3.8, 0);
  for (const tx of [-3.8, 3.8]) {
    g.add(at(box(1.5, 4.4, 1.5, 0xb0492b), tx, 2.2, 3.8));
    g.add(at(cone(1.3, 1.4, CAMP_RED_DARK), tx, 5.1, 3.8));
  }
  for (const sy of [1.0, 2.0]) g.add(at(box(6.4, 0.18, 0.8, CAMP_WOOD), 0, sy, -3.2));
  g.add(at(box(1.0, 0.9, 1.0, CAMP_WOOD), 3.0, 0.8, -2.6));
}

/** Tier 4 — Grand Fort: log-cabin courses, banner and a cash vault in the yard. */
function campGrandFort(g: THREE.Group): void {
  g.add(at(box(9, 0.4, 9, CAMP_LOG), 0, 0.2, 0));
  for (let course = 0; course < 7; course++) {
    const y = 0.6 + course * 0.52;
    const tint = course % 2 === 0 ? CAMP_LOG : CAMP_WOOD;
    const len = course % 2 === 0 ? 9 : 8.6;
    for (const [x, z, axis] of [[0, -4.3, 'x'], [-4.3, 0, 'z'], [4.3, 0, 'z']] as const) {
      const log = at(cyl(0.26, len, tint), x, y, z);
      if (axis === 'x') log.rotation.z = Math.PI / 2; else log.rotation.x = Math.PI / 2;
      g.add(log);
    }
    for (const sx of [-3.2, 3.2]) {
      const log = at(cyl(0.26, 2.6, tint), sx, y, 4.3);
      log.rotation.z = Math.PI / 2;
      g.add(log);
    }
  }
  for (const [px, pz] of [[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]] as const)
    g.add(at(cyl(0.34, 4.6, COLORS.trunk), px, 2.3, pz));
  g.add(at(cyl(0.12, 5.4, 0xd8d2c4), 0, 3.1, -4.3));
  const flag = at(box(2.2, 1.3, 0.12, COLORS.playerCoat), 1.1, 5.1, -4.3);
  g.add(flag);
  g.add(at(box(2.2, 0.3, 0.16, 0xf4f8fb), 1.1, 4.7, -4.3));
  // Cash vault: dark strongbox with gold trim, plus loose bars on the counter.
  g.add(at(box(2.4, 1.7, 1.5, 0x3a4046), 2.6, 1.25, 2.2));
  g.add(at(box(2.5, 0.22, 1.6, COLORS.gold), 2.6, 2.2, 2.2));
  g.add(at(box(0.7, 0.7, 0.12, COLORS.gold), 2.6, 1.3, 2.98));
  for (const bx of [-2.6, -1.9]) g.add(at(box(0.6, 0.22, 0.35, COLORS.gold), bx, 0.51, 2.6));
}

/** The camp building at a given tier, centred on the depot position. */
export function makeCampTier(tier: number): THREE.Group {
  const g = new THREE.Group();
  const builders = [campClearing, campHut, campStockade, campFort, campGrandFort];
  builders[Math.max(0, Math.min(builders.length - 1, Math.round(tier)))](g);
  return g;
}

export function makeSeam(): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(GEO.seamRock, lam(0x8f979e));
  rock.scale.y = 0.6;
  rock.position.y = 0.4;
  g.add(rock);
  for (const [px, pz] of [[-0.4, 0.2], [0.4, -0.1], [0, 0.5]] as const) {
    const nug = new THREE.Mesh(GEO.seamNugget, lam(COLORS.gold));
    nug.position.set(px, 0.95, pz);
    g.add(nug);
  }
  return g;
}

const DROP_PARTS: Record<Currency, { geo: THREE.BufferGeometry; color: number; rotZ: number }> = {
  wood: { geo: GEO.dropWood, color: COLORS.wood, rotZ: Math.PI / 2 },
  meat: { geo: GEO.dropMeat, color: COLORS.meat, rotZ: 0 },
  gold: { geo: GEO.dropGold, color: COLORS.gold, rotZ: 0 },
  cash: { geo: GEO.dropCash, color: COLORS.cash, rotZ: 0 },
};

export function makeDropMesh(kind: Currency): THREE.Mesh {
  const parts = DROP_PARTS[kind];
  const m = new THREE.Mesh(parts.geo, lam(parts.color));
  m.rotation.z = parts.rotZ;
  m.position.y = 0.3;
  return m;
}

export function makeCarryBox(color: number): THREE.Mesh {
  return new THREE.Mesh(GEO.carryBox, lam(color));
}

/** One resource pile mesh; the renderer's `syncPile` drives its height from the stored amount. */
export function makePile(color: number): THREE.Mesh {
  return new THREE.Mesh(GEO.pileBox, lam(color));
}

export function makeRailMesh(points: { x: number; z: number }[]): THREE.Group {
  const g = new THREE.Group();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const seg = new THREE.Group();
    seg.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    seg.rotation.y = -Math.atan2(dz, dx);
    for (const off of [-0.3, 0.3]) {
      const railBar = new THREE.Mesh(GEO.spanBar, lam(0x777f86));
      railBar.scale.set(len, 0.08, 0.08);
      railBar.position.set(0, 0.12, off);
      seg.add(railBar);
    }
    const nSleepers = Math.max(1, Math.floor(len / 0.9));
    for (let sIdx = 0; sIdx < nSleepers; sIdx++) {
      const sleeper = new THREE.Mesh(GEO.railSleeper, lam(COLORS.rail));
      sleeper.position.set(-len / 2 + (sIdx + 0.5) * (len / nSleepers), 0.06, 0);
      seg.add(sleeper);
    }
    g.add(seg);
  }
  return g;
}

export function makeGateWall(length: number): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(GEO.spanBar, lam(0xd9534f));
  wall.scale.set(length, 2.2, 0.5);
  wall.position.y = 1.1;
  g.add(wall);
  for (const end of [-length / 2, length / 2]) {
    const post = new THREE.Mesh(GEO.gatePost, lam(0xffffff));
    post.position.set(end, 1.4, 0);
    g.add(post);
  }
  return g;
}
