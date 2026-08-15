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
  depotSlab: reg(new THREE.BoxGeometry(4.5, 0.3, 4.5)),
  depotPost: reg(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6)),
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

export function makeDepot(): THREE.Group {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(GEO.depotSlab, lam(0x9a6b3f));
  slab.position.y = 0.15;
  g.add(slab);
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
    const post = new THREE.Mesh(GEO.depotPost, lam(COLORS.trunk));
    post.position.set(px, 0.8, pz);
    g.add(post);
  }
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
