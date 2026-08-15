import * as THREE from 'three';
import type { Currency, ToolId } from '../game/state';

const lam = (color: number) => new THREE.MeshLambertMaterial({ color });

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

export function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 20, 240, 88, 20);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(3.4, 1.7, 1);
  return sprite;
}

export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const full = new THREE.Group();
  full.name = 'full';
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.2, 6), lam(COLORS.trunk));
  trunk.position.y = 0.6;
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 7), lam(COLORS.foliage));
  c1.position.y = 2.1;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.8, 7), lam(COLORS.foliage2));
  c2.position.y = 3.3;
  full.add(trunk, c1, c2);
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.4, 6), lam(COLORS.trunk));
  stump.position.y = 0.2;
  stump.name = 'stump';
  g.add(full, stump);
  return g;
}

export function makePerson(coat: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 8), lam(coat));
  body.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), lam(COLORS.skin));
  head.position.y = 1.4;
  g.add(body, head);
  return g;
}

export function makePlayer(): THREE.Group {
  const g = makePerson(COLORS.playerCoat);
  const toolMount = new THREE.Group();
  toolMount.name = 'toolMount';
  toolMount.position.set(0.45, 1.0, 0.1);
  g.add(toolMount);
  const carry = new THREE.Group();
  carry.name = 'carry';
  carry.position.set(0, 1.05, -0.4);
  g.add(carry);
  return g;
}

export function makeTool(kind: ToolId | 'pickaxe'): THREE.Group {
  const g = new THREE.Group();
  const isLong = kind === 'scythe';
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, isLong ? 1.4 : 0.9, 6), lam(0x7a5230),
  );
  handle.position.y = isLong ? 0.7 : 0.45;
  g.add(handle);
  if (kind === 'scythe') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.18), lam(0xc0c8cc));
    blade.position.set(0.4, 1.4, 0);
    g.add(blade);
  } else if (kind === 'pickaxe') {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), lam(0x95a5a6));
    head.position.set(0, 0.85, 0);
    g.add(head);
  } else {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.12), lam(kind === 'axe' ? 0xc0392b : 0x95a5a6));
    head.position.set(0.12, 0.85, 0);
    g.add(head);
  }
  return g;
}

export function makeBear(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), lam(COLORS.bear));
  body.scale.set(1.1, 0.8, 1.5);
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), lam(COLORS.bear));
  head.position.set(0, 1.1, 1.2);
  const earGeo = new THREE.SphereGeometry(0.14, 6, 6);
  const e1 = new THREE.Mesh(earGeo, lam(COLORS.bear)); e1.position.set(0.25, 1.5, 1.1);
  const e2 = new THREE.Mesh(earGeo, lam(COLORS.bear)); e2.position.set(-0.25, 1.5, 1.1);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), lam(0x333333));
  nose.position.set(0, 1.05, 1.6);
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.02), lam(0x222222));
  barBg.position.y = 2.2; barBg.rotation.y = Math.PI / 4; barBg.name = 'hpbg';
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.1, 0.03), lam(0x44cc44));
  bar.position.y = 2.2; bar.rotation.y = Math.PI / 4; bar.name = 'hp';
  g.add(body, head, e1, e2, nose, barBg, bar);
  return g;
}

export function makeVillager(): THREE.Group {
  const g = makePerson(COLORS.villagerCoat);
  const ice = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.9, 1.0),
    new THREE.MeshLambertMaterial({ color: COLORS.ice, transparent: true, opacity: 0.55 }),
  );
  ice.position.y = 0.95;
  ice.name = 'ice';
  const load = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), lam(COLORS.wood));
  load.position.set(0, 1.1, -0.45);
  load.name = 'load';
  load.visible = false;
  g.add(ice, load);
  return g;
}

export function makeBench(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.0), lam(COLORS.bench));
  top.position.y = 0.8;
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.8), lam(0xc47a34));
  base.position.y = 0.35;
  g.add(top, base);
  return g;
}

export function makeMatMesh(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.6), lam(COLORS.mat));
  m.position.y = 0.03;
  return m;
}

export function makePadMesh(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 24), lam(0x555555));
  base.position.y = 0.025;
  const progress = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.06, 24), lam(0x3aa655));
  progress.position.y = 0.035;
  progress.scale.set(0.001, 1, 0.001);
  progress.name = 'progress';
  g.add(base, progress);
  return g;
}

export function makeTurret(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 8), lam(COLORS.machine));
  base.position.y = 0.25;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 6), lam(COLORS.trunk));
  post.position.y = 1.0;
  const bowA = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.14), lam(0x8a5a33));
  bowA.position.y = 1.7;
  const bowB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 1.1), lam(0x6b4a2b));
  bowB.position.y = 1.7;
  g.add(base, post, bowA, bowB);
  return g;
}

export function makeSawmill(): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.4), lam(COLORS.machine));
  frame.position.y = 0.5;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), lam(0xc0c8cc));
  blade.rotation.z = Math.PI / 2;
  blade.position.y = 1.3;
  blade.name = 'blade';
  g.add(frame, blade);
  return g;
}

export function makeCart(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.7), lam(0x555b61));
  box.position.y = 0.5;
  const load = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.5), lam(COLORS.wood));
  load.position.y = 0.85;
  load.name = 'load';
  g.add(box, load);
  return g;
}

export function makeDepot(): THREE.Group {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 4.5), lam(0x9a6b3f));
  slab.position.y = 0.15;
  g.add(slab);
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), lam(COLORS.trunk));
    post.position.set(px, 0.8, pz);
    g.add(post);
  }
  return g;
}

export function makeSeam(): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.SphereGeometry(1.1, 7, 5), lam(0x8f979e));
  rock.scale.y = 0.6;
  rock.position.y = 0.4;
  g.add(rock);
  for (const [px, pz] of [[-0.4, 0.2], [0.4, -0.1], [0, 0.5]] as const) {
    const nug = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), lam(COLORS.gold));
    nug.position.set(px, 0.95, pz);
    g.add(nug);
  }
  return g;
}

/**
 * Ground drops are created and destroyed constantly during idle play, so every drop of a
 * given kind shares one geometry and one material instead of allocating its own.
 *
 * NOTE: these shared instances outlive any individual mesh — never dispose() them, and never
 * run a blanket recursive dispose over the scene graph, or the next drop/carry mesh will draw
 * against freed GPU buffers.
 */
interface DropParts { geo: THREE.BufferGeometry; mat: THREE.Material; rotZ: number }
const dropParts = new Map<Currency, DropParts>();

function dropPartsFor(kind: Currency): DropParts {
  let parts = dropParts.get(kind);
  if (!parts) {
    if (kind === 'wood') {
      parts = { geo: new THREE.CylinderGeometry(0.18, 0.18, 0.8, 6), mat: lam(COLORS.wood), rotZ: Math.PI / 2 };
    } else if (kind === 'meat') {
      parts = { geo: new THREE.BoxGeometry(0.5, 0.35, 0.4), mat: lam(COLORS.meat), rotZ: 0 };
    } else if (kind === 'gold') {
      parts = { geo: new THREE.BoxGeometry(0.5, 0.28, 0.3), mat: lam(COLORS.gold), rotZ: 0 };
    } else {
      parts = { geo: new THREE.BoxGeometry(0.5, 0.08, 0.3), mat: lam(COLORS.cash), rotZ: 0 };
    }
    dropParts.set(kind, parts);
  }
  return parts;
}

export function makeDropMesh(kind: Currency): THREE.Mesh {
  const parts = dropPartsFor(kind);
  const m = new THREE.Mesh(parts.geo, parts.mat);
  m.rotation.z = parts.rotZ;
  m.position.y = 0.3;
  return m;
}

/**
 * The player's carry stack is torn down and rebuilt on every change to the carried totals —
 * many times a second while depositing — so the boxes share one geometry and one material per
 * colour. Same rule as the drop meshes above: shared, never disposed.
 */
const carryGeo = new THREE.BoxGeometry(0.55, 0.2, 0.4);
const carryMats = new Map<number, THREE.Material>();

export function makeCarryBox(color: number): THREE.Mesh {
  let mat = carryMats.get(color);
  if (!mat) {
    mat = lam(color);
    carryMats.set(color, mat);
  }
  return new THREE.Mesh(carryGeo, mat);
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
      const railBar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), lam(0x777f86));
      railBar.position.set(0, 0.12, off);
      seg.add(railBar);
    }
    const nSleepers = Math.max(1, Math.floor(len / 0.9));
    for (let sIdx = 0; sIdx < nSleepers; sIdx++) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.9), lam(COLORS.rail));
      sleeper.position.set(-len / 2 + (sIdx + 0.5) * (len / nSleepers), 0.06, 0);
      seg.add(sleeper);
    }
    g.add(seg);
  }
  return g;
}

export function makeGateWall(length: number): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 2.2, 0.5), lam(0xd9534f));
  wall.position.y = 1.1;
  g.add(wall);
  for (const end of [-length / 2, length / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.8, 8), lam(0xffffff));
    post.position.set(end, 1.4, 0);
    g.add(post);
  }
  return g;
}
