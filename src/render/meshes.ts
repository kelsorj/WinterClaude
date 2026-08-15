import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Currency, ToolId, VillagerKind } from '../game/state';

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

/**
 * Palette matched to the reference ad: warm tan road, near-white snow, saturated ice-blue
 * conifers. Everything is flat-shaded Lambert, so these read exactly as authored.
 */
export const COLORS = {
  trunk: 0x8a5738, trunkDark: 0x6d4327,
  foliage: 0x5fb0e6, foliage2: 0x7cc4f0, foliage3: 0x9bd6f7, snowCap: 0xffffff,
  snow: 0xfbfdff, trench: 0xdfeaf8,
  road: 0xd89a66, roadEdge: 0xeab98a,
  bear: 0xfcfbf7, bearSnout: 0xb9bcc2,
  skin: 0xf1c9a2, beard: 0xf8f8f5, fur: 0xf3e7d2,
  playerCoat: 0x2f6fbb, playerCoatDark: 0x24548f,
  villagerCoat: 0x2fb3c9, villagerCoatDark: 0x208d9e,
  crewCoat: 0xf07818, crewCoatDark: 0xbc560c,
  ice: 0x9adcf0, frost: 0xdff7ff,
  bench: 0xef9640, benchDark: 0xc4762c, mat: 0x33383d,
  wood: 0xb07a3f, meat: 0xdc5a52, gold: 0xf6c945, cash: 0x4fbf62,
  rail: 0x6b4a2b, machine: 0xb5834f,
  fence: 0xf6efe3, fenceShade: 0xdccfba,
  rock: 0x9aa2a9, crate: 0xb07a45, crateDark: 0x8a5c31,
} as const;

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

/** Stable 0..1 from an entity id, so per-instance art variation survives reloads and saves. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Shared geometry table. Meshes vary by scale/rotation/position only, never by geometry. */
const GEO = {
  unitBox: reg(new THREE.BoxGeometry(1, 1, 1)),
  /** Unit primitives (r = 0.5, h = 1): props scale these instead of minting new buffers. */
  unitCyl: reg(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
  unitCone: reg(new THREE.ConeGeometry(0.5, 1, 8)),
  unitSphere: reg(new THREE.SphereGeometry(0.5, 10, 8)),
  treeTrunk: reg(new THREE.CylinderGeometry(0.26, 0.36, 1.2, 7)),
  treeStump: reg(new THREE.CylinderGeometry(0.32, 0.38, 0.44, 7)),
  snowRing: reg(new THREE.CylinderGeometry(0.62, 0.7, 0.09, 10)),
  personBody: reg(new THREE.CylinderGeometry(0.33, 0.42, 0.86, 10)),
  personBelly: reg(new THREE.SphereGeometry(0.44, 10, 8)),
  personHead: reg(new THREE.SphereGeometry(0.28, 10, 8)),
  personHood: reg(new THREE.SphereGeometry(0.34, 10, 8)),
  hoodRim: reg(new THREE.TorusGeometry(0.27, 0.07, 6, 12)),
  personArm: reg(new THREE.CylinderGeometry(0.11, 0.095, 0.52, 6)),
  personBoot: reg(new THREE.BoxGeometry(0.22, 0.16, 0.3)),
  beard: reg(new THREE.SphereGeometry(0.22, 8, 6)),
  toolHandle: reg(new THREE.CylinderGeometry(0.055, 0.055, 1, 6)),
  bearBody: reg(new THREE.SphereGeometry(0.9, 12, 9)),
  bearHead: reg(new THREE.SphereGeometry(0.5, 10, 8)),
  bearSnout: reg(new THREE.SphereGeometry(0.3, 8, 6)),
  bearEar: reg(new THREE.SphereGeometry(0.16, 6, 6)),
  bearNose: reg(new THREE.SphereGeometry(0.11, 6, 6)),
  bearLeg: reg(new THREE.CylinderGeometry(0.24, 0.26, 0.55, 7)),
  bearTail: reg(new THREE.SphereGeometry(0.17, 6, 6)),
  villagerIce: reg(new THREE.BoxGeometry(1.02, 1.95, 1.02)),
  villagerLoad: reg(new THREE.BoxGeometry(0.5, 0.4, 0.5)),
  benchTop: reg(new THREE.BoxGeometry(2.4, 0.24, 1.05)),
  benchBase: reg(new THREE.BoxGeometry(2.1, 0.66, 0.85)),
  benchLeg: reg(new THREE.BoxGeometry(0.22, 0.7, 0.22)),
  mat: reg(new THREE.BoxGeometry(1.9, 0.07, 1.7)),
  padBase: reg(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 24)),
  padProgress: reg(new THREE.CylinderGeometry(1.45, 1.45, 0.06, 24)),
  padDashed: reg(new THREE.PlaneGeometry(4.2, 4.2)),
  turretBase: reg(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 8)),
  turretPost: reg(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 6)),
  turretBowA: reg(new THREE.BoxGeometry(1.6, 0.1, 0.14)),
  turretBowB: reg(new THREE.BoxGeometry(0.14, 0.1, 1.1)),
  millFrame: reg(new THREE.BoxGeometry(1.8, 1.0, 1.4)),
  millBlade: reg(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16)),
  cartBox: reg(new THREE.BoxGeometry(1.0, 0.5, 0.7)),
  cartLoad: reg(new THREE.BoxGeometry(0.8, 0.4, 0.5)),
  seamRock: reg(new THREE.SphereGeometry(1.1, 7, 5)),
  seamNugget: reg(new THREE.IcosahedronGeometry(0.25, 0)),
  railSleeper: reg(new THREE.BoxGeometry(0.14, 0.06, 0.9)),
  gatePost: reg(new THREE.CylinderGeometry(0.3, 0.3, 2.8, 8)),
  /** Picket: one board, repeated down the length of a fence run to form a dense palisade. */
  fencePost: reg(new THREE.BoxGeometry(0.3, 1.2, 0.12)),
  hpBg: reg(new THREE.BoxGeometry(1.4, 0.12, 0.02)),
  hpBar: reg(new THREE.BoxGeometry(1.36, 0.1, 0.03)),
  carryBox: reg(new THREE.BoxGeometry(0.55, 0.2, 0.4)),
  /** One bill/crate box; piles stack these in a grid rather than scaling a single block. */
  pileBox: reg(new THREE.BoxGeometry(0.46, 0.16, 0.34)),
  dropWood: reg(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 6)),
  dropMeat: reg(new THREE.BoxGeometry(0.5, 0.35, 0.4)),
  dropGold: reg(new THREE.BoxGeometry(0.5, 0.28, 0.3)),
  dropCash: reg(new THREE.BoxGeometry(0.5, 0.08, 0.3)),
};

/** Props never move once placed: bake child matrices once and stop paying for them each frame. */
function freezeChildren(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o === root) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}

// ---------------------------------------------------------------------------
// Canvas iconography
// ---------------------------------------------------------------------------

/** The four commodities plus the rescued-villager marker used by the HUD's last row. */
export type IconKind = Currency | 'villager';

/**
 * Draws an icon centred on (x, y) inside a `size`-wide box. Emoji render
 * inconsistently across platforms and read as tiny grey blobs at world scale, so every world
 * label paints its icon here instead. Gold in particular has to be unmistakable: a bar with a
 * lit top face and a shine streak, never a coin that could be mistaken for cash.
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D, kind: IconKind, x: number, y: number, size: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const line = Math.max(2, size * 0.055);
  if (kind === 'wood') {
    // Log seen side-on: barrel body, shaded underside, pale cut end with growth rings.
    const w = size * 0.94, h = size * 0.5;
    ctx.rotate(-0.12);
    ctx.fillStyle = '#a8743d';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.36); ctx.fill();
    ctx.fillStyle = '#8b5a2b';
    ctx.beginPath(); ctx.roundRect(-w / 2, h * 0.02, w * 0.94, h * 0.46, h * 0.28); ctx.fill();
    const ex = w / 2 - h * 0.2, ry = h * 0.5;
    ctx.fillStyle = '#d3a068';
    ctx.beginPath(); ctx.ellipse(ex, 0, h * 0.22, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6f4522'; ctx.lineWidth = line;
    ctx.beginPath(); ctx.ellipse(ex, 0, h * 0.22, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ex, 0, h * 0.1, ry * 0.46, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'meat') {
    // Steak: red rounded cut with a marbled highlight and a white bone knuckle.
    const w = size * 0.86, h = size * 0.62;
    ctx.rotate(-0.2);
    ctx.fillStyle = '#d94f45';
    ctx.beginPath(); ctx.roundRect(-w * 0.36, -h / 2, w * 0.88, h, h * 0.42); ctx.fill();
    ctx.fillStyle = '#e8756a';
    ctx.beginPath(); ctx.roundRect(-w * 0.2, -h * 0.26, w * 0.44, h * 0.24, h * 0.14); ctx.fill();
    ctx.strokeStyle = '#a5342c'; ctx.lineWidth = line;
    ctx.beginPath(); ctx.roundRect(-w * 0.36, -h / 2, w * 0.88, h, h * 0.42); ctx.stroke();
    ctx.fillStyle = '#fdfbf4';
    ctx.beginPath(); ctx.arc(-w * 0.4, 0, h * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c9c3b2'; ctx.lineWidth = line * 0.8;
    ctx.beginPath(); ctx.arc(-w * 0.4, 0, h * 0.25, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'gold') {
    // Ingot: trapezoid front, lighter top face, hard shine streak. Unmistakably a gold bar.
    const w = size * 0.9, h = size * 0.44;
    const bl = -w / 2, br = w / 2, tl = -w * 0.33, tr = w * 0.33;
    ctx.fillStyle = '#e0a30c';
    ctx.beginPath();
    ctx.moveTo(bl, h * 0.62); ctx.lineTo(br, h * 0.62);
    ctx.lineTo(tr + w * 0.06, -h * 0.16); ctx.lineTo(tl - w * 0.06, -h * 0.16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(tl - w * 0.06, -h * 0.16); ctx.lineTo(tr + w * 0.06, -h * 0.16);
    ctx.lineTo(tr, -h * 0.86); ctx.lineTo(tl, -h * 0.86);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#9a6c04'; ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(bl, h * 0.62); ctx.lineTo(br, h * 0.62);
    ctx.lineTo(tr + w * 0.06, -h * 0.16); ctx.lineTo(tr, -h * 0.86);
    ctx.lineTo(tl, -h * 0.86); ctx.lineTo(tl - w * 0.06, -h * 0.16);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tl - w * 0.06, -h * 0.16); ctx.lineTo(tr + w * 0.06, -h * 0.16); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = line * 1.2;
    ctx.beginPath();
    ctx.moveTo(tl + w * 0.06, -h * 0.66); ctx.lineTo(tl + w * 0.3, -h * 0.66); ctx.stroke();
  } else if (kind === 'villager') {
    // Rescued villager: head-and-shoulders silhouette in the villagers' teal parka.
    const head = size * 0.21, sh = size * 0.34;
    ctx.fillStyle = '#2fb3c9';
    ctx.beginPath();
    ctx.arc(0, size * 0.42, sh, Math.PI, 0);
    ctx.lineTo(sh, size * 0.5);
    ctx.lineTo(-sh, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#208d9e'; ctx.lineWidth = line;
    ctx.stroke();
    ctx.fillStyle = '#2fb3c9';
    ctx.beginPath(); ctx.arc(0, -size * 0.14, head, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    // Cash: green bill with a paler field and a bold $.
    const w = size * 0.94, h = size * 0.58;
    ctx.fillStyle = '#3fae57';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.18); ctx.fill();
    ctx.fillStyle = '#63cd7a';
    ctx.beginPath(); ctx.roundRect(-w * 0.4, -h * 0.32, w * 0.8, h * 0.64, h * 0.12); ctx.fill();
    ctx.strokeStyle = '#24793a'; ctx.lineWidth = line;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.18); ctx.stroke();
    ctx.fillStyle = '#125c26';
    ctx.font = `bold ${Math.round(size * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, size * 0.02);
  }
  ctx.restore();
}

/**
 * Label canvases are expensive and repeat constantly (every "+6" float redraws the same art),
 * so textures are cached by key. Evicting the oldest entry disposes it: a still-live sprite
 * holding an evicted texture simply re-uploads from its canvas on the next frame.
 */
const labelTextures = new Map<string, THREE.CanvasTexture>();
const LABEL_CACHE_CAP = 64;

function labelTexture(
  key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const hit = labelTextures.get(key);
  if (hit) {
    labelTextures.delete(key);
    labelTextures.set(key, hit); // touch: most-recently-used goes last
    return hit;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = reg(new THREE.CanvasTexture(canvas));
  labelTextures.set(key, tex);
  if (labelTextures.size > LABEL_CACHE_CAP) {
    const oldestKey = labelTextures.keys().next().value as string;
    const oldest = labelTextures.get(oldestKey)!;
    labelTextures.delete(oldestKey);
    // Reclaim the GPU copy but keep the texture in SHARED: a long-lived label sprite may still
    // hold it, and dropping it from SHARED would let `disposeSubtree` free it a second time out
    // from under that sprite. three.js simply re-uploads from the canvas if it is drawn again.
    oldest.dispose();
  }
  return tex;
}

function sprite(tex: THREE.Texture, sx: number, sy: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(sx, sy, 1);
  return s;
}

/**
 * Ad-style bench bubble: a white disc with a pointer tail, the commodity icon, and the cash
 * waiting on that bench's mat. An empty mat shows the icon alone, centred and large — a bare
 * "0" is noise. Textures are cached per (kind, count), so a bench that keeps selling churns
 * through the label LRU rather than allocating without bound.
 */
export function bubbleTexture(kind: Currency, count: number): THREE.CanvasTexture {
  return labelTexture(`bubble|${kind}|${count}`, 256, 256, (ctx) => {
    const cx = 128, cy = 108, r = 92;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cfd8e2';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy + r - 16);
    ctx.lineTo(cx, cy + r + 62);
    ctx.lineTo(cx + 34, cy + r - 16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (count <= 0) {
      drawIcon(ctx, kind, cx, cy, 118);
      return;
    }
    drawIcon(ctx, kind, cx, cy - 30, 92);
    ctx.fillStyle = '#2b3440';
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), cx, cy + 52);
  });
}

export function makeBubbleLabel(kind: Currency, count: number): THREE.Sprite {
  return sprite(bubbleTexture(kind, count), 2.9, 2.9);
}

/** Unlock pad: a grey rounded card carrying the drawn icon and the price. */
export function makePadLabel(kind: Currency, price: number): THREE.Sprite {
  const tex = labelTexture(`pad|${kind}|${price}`, 256, 128, (ctx) => {
    ctx.fillStyle = '#e9edf2';
    ctx.strokeStyle = '#9aa6b4';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.roundRect(10, 24, 236, 82, 24); ctx.fill(); ctx.stroke();
    drawIcon(ctx, kind, 62, 65, 66);
    ctx.fillStyle = '#2b3440';
    ctx.font = 'bold 50px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(price), 106, 67);
  });
  return sprite(tex, 3.0, 1.5);
}

/** Plain white card used for the camp nameplate and non-commodity floats. */
export function makeTextLabel(text: string): THREE.Sprite {
  const tex = labelTexture(`text|${text}`, 256, 128, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = '#cfd8e2';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(8, 26, 240, 78, 22); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 66);
  });
  return sprite(tex, 3.2, 1.6);
}

/** Float shown when a sale lands: drawn icon plus the amount, no emoji. */
export function makeIconTextLabel(kind: Currency, text: string): THREE.Sprite {
  const tex = labelTexture(`icontext|${kind}|${text}`, 256, 128, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = '#cfd8e2';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(8, 26, 240, 78, 22); ctx.fill(); ctx.stroke();
    drawIcon(ctx, kind, 62, 65, 62);
    ctx.fillStyle = '#1e7a37';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 104, 67);
  });
  return sprite(tex, 2.8, 1.4);
}

/** Dashed build-site ring laid under an affordable pad, as in the ad's construction plots. */
let dashedTex: THREE.CanvasTexture | null = null;
function dashedRingTexture(): THREE.CanvasTexture {
  if (dashedTex) return dashedTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 12;
  ctx.setLineDash([26, 20]);
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.stroke();
  dashedTex = reg(new THREE.CanvasTexture(canvas));
  return dashedTex;
}

/** One material for every pad's ring — minting one per pad would grow SHARED on every build. */
let dashedMat: THREE.MeshBasicMaterial | null = null;
function dashedMaterial(): THREE.MeshBasicMaterial {
  if (!dashedMat) {
    dashedMat = reg(new THREE.MeshBasicMaterial({
      map: dashedRingTexture(), transparent: true, depthWrite: false, opacity: 0.9,
    }));
  }
  return dashedMat;
}

export function makeDashedDisc(): THREE.Mesh {
  const m = new THREE.Mesh(GEO.padDashed, dashedMaterial());
  m.rotation.x = -Math.PI / 2;
  // Clear of the road slab's top face (y = 0.04), or the road hides the ring entirely.
  m.position.y = 0.06;
  return m;
}

/** Soft round snowflake: a radial-gradient sprite, so particles are dots rather than squares. */
let snowTex: THREE.CanvasTexture | null = null;
export function snowflakeTexture(): THREE.CanvasTexture {
  if (snowTex) return snowTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  snowTex = reg(new THREE.CanvasTexture(canvas));
  return snowTex;
}

// ---------------------------------------------------------------------------
// Primitive helpers — every prop below scales a unit primitive, never a new buffer
// ---------------------------------------------------------------------------

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

const sph = (r: number, color: number, opacity = 1): THREE.Mesh => {
  const m = new THREE.Mesh(GEO.unitSphere, lam(color, opacity));
  m.scale.setScalar(r * 2);
  return m;
};

const at = <T extends THREE.Object3D>(m: T, x: number, y: number, z: number): T => {
  m.position.set(x, y, z);
  return m;
};

/** Typed child handles stashed on `userData.refs` by the builders below. */
export function refsOf<T>(o: THREE.Object3D): T {
  return o.userData.refs as T;
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

export interface TreeRefs { full: THREE.Object3D; stump: THREE.Object3D }

/**
 * Conifer tiers, bottom to top: an ice-blue cone, then a white snow cone whose base flares wider
 * than the blue cone is at that height. The flare is what you actually see — it rings each tier
 * as a white collar just below where the next tier starts. Tiers must therefore be tuned as a
 * set: if a tier is too wide at the collar below it, it swallows that collar and the tree turns
 * uniformly blue.
 */
interface TreeTier { r: number; h: number; baseY: number; capR: number; capH: number; capY: number }

const TREE_TIERS: TreeTier[] = [
  { r: 1.40, h: 1.90, baseY: 1.00, capR: 1.05, capH: 0.75, capY: 2.35 },
  { r: 1.02, h: 1.70, baseY: 2.50, capR: 0.78, capH: 0.62, capY: 3.75 },
  { r: 0.68, h: 1.50, baseY: 3.85, capR: 0.52, capH: 0.55, capY: 4.90 },
];

/** A transformed, flat-vertex-coloured copy of a unit primitive, ready to be merged. */
function part(geo: THREE.BufferGeometry, m: THREE.Matrix4, hex: number): THREE.BufferGeometry {
  const g = geo.clone().applyMatrix4(m);
  const c = new THREE.Color(hex);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const conePart = (r: number, h: number, cy: number, hex: number): THREE.BufferGeometry =>
  part(GEO.unitCone, new THREE.Matrix4().makeScale(r * 2, h, r * 2).setPosition(0, cy, 0), hex);

/**
 * The forest is by far the biggest thing on screen (295 trees), so a tree is baked down to ONE
 * merged, vertex-coloured buffer instead of seven separate meshes. Every tree in the world then
 * shares that single buffer and costs a single draw call, varying only by scale and rotation.
 */
let treeGeo: { full: THREE.BufferGeometry; stump: THREE.BufferGeometry } | null = null;
let treeMat: THREE.MeshLambertMaterial | null = null;

function treeParts(): { full: THREE.BufferGeometry; stump: THREE.BufferGeometry } {
  if (treeGeo) return treeGeo;
  const blues = [COLORS.foliage, COLORS.foliage2, COLORS.foliage3];
  const full = [part(GEO.treeTrunk, new THREE.Matrix4().makeTranslation(0, 0.6, 0), COLORS.trunk)];
  for (let i = 0; i < TREE_TIERS.length; i++) {
    const t = TREE_TIERS[i];
    full.push(conePart(t.r, t.h, t.baseY + t.h / 2, blues[i]));
    full.push(conePart(t.capR, t.capH, t.capY + t.capH / 2, COLORS.snowCap));
  }
  const stump = [
    part(GEO.treeStump, new THREE.Matrix4().makeTranslation(0, 0.22, 0), COLORS.trunkDark),
    part(GEO.snowRing, new THREE.Matrix4().makeTranslation(0, 0.045, 0), COLORS.snowCap),
  ];
  treeGeo = { full: reg(mergeGeometries(full)), stump: reg(mergeGeometries(stump)) };
  for (const g of [...full, ...stump]) g.dispose(); // merge copied the data out
  return treeGeo;
}

function treeMaterial(): THREE.MeshLambertMaterial {
  if (!treeMat) treeMat = reg(new THREE.MeshLambertMaterial({ vertexColors: true }));
  return treeMat;
}

export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const geo = treeParts();
  const mat = treeMaterial();
  const full = new THREE.Mesh(geo.full, mat);
  const stump = new THREE.Mesh(geo.stump, mat);
  g.add(full, stump);
  g.userData.refs = { full, stump } satisfies TreeRefs;
  freezeChildren(g);
  return g;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface PersonRefs { toolMount: THREE.Group; carry: THREE.Group }

/**
 * Hooded parka silhouette: barrel body, fur-rimmed hood with the face peeking out, stub arms.
 * The model faces +Z, matching `atan2(facing.x, facing.z)` in the renderer.
 */
function makePerson(coat: number, coatDark: number, beard: boolean): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.personBody, lam(coat));
  body.position.y = 0.63;
  const belly = new THREE.Mesh(GEO.personBelly, lam(coat));
  belly.scale.set(1.0, 0.62, 0.94);
  belly.position.y = 0.72;
  const hem = at(cyl(0.44, 0.2, coatDark), 0, 0.28, 0);
  const head = new THREE.Mesh(GEO.personHead, lam(COLORS.skin));
  head.position.set(0, 1.36, 0.06);
  const hood = new THREE.Mesh(GEO.personHood, lam(coat));
  hood.scale.set(1.05, 1.0, 1.05);
  hood.position.set(0, 1.42, -0.06);
  const rim = new THREE.Mesh(GEO.hoodRim, lam(COLORS.fur));
  rim.position.set(0, 1.38, 0.14);
  g.add(body, belly, hem, head, hood, rim);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(GEO.personArm, lam(coatDark));
    arm.position.set(sx * 0.4, 0.82, 0.1);
    arm.rotation.set(-0.5, 0, sx * 0.42);
    g.add(arm);
    const boot = new THREE.Mesh(GEO.personBoot, lam(0x3a3f45));
    boot.position.set(sx * 0.16, 0.08, 0.04);
    g.add(boot);
  }
  if (beard) {
    // Sits proud of the face: tucked any closer and the head sphere simply swallows it.
    const chin = new THREE.Mesh(GEO.beard, lam(COLORS.beard));
    chin.scale.set(1.15, 0.8, 0.9);
    chin.position.set(0, 1.19, 0.25);
    g.add(chin);
  }
  // Arm-forward mount, low enough that the (deliberately oversized) tool reads as held in the
  // hand rather than hovering over the hood.
  const toolMount = new THREE.Group();
  toolMount.position.set(0.42, 0.5, 0.3);
  const carry = new THREE.Group();
  carry.position.set(0, 0.7, -0.46);
  g.add(toolMount, carry);
  g.userData.refs = { toolMount, carry } satisfies PersonRefs;
  return g;
}

export interface PlayerRefs extends PersonRefs { coat: THREE.MeshLambertMaterial }

export function makePlayer(): THREE.Group {
  const g = makePerson(COLORS.playerCoat, COLORS.playerCoatDark, true);
  // `lam()` hands the same cached material to every mesh of a colour, so tinting it for the hit
  // flash would turn every teal-coated villager red too. The player gets a private copy. It is
  // deliberately NOT registered in SHARED: it belongs to this subtree and should be disposed
  // with it.
  const coat = lam(COLORS.playerCoat).clone();
  const cached = lam(COLORS.playerCoat);
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.material === cached) mesh.material = coat;
  });
  g.userData.refs = { ...refsOf<PersonRefs>(g), coat } satisfies PlayerRefs;
  return g;
}

export function makeTool(kind: ToolId | 'pickaxe'): THREE.Group {
  const g = new THREE.Group();
  const isLong = kind === 'scythe';
  const handle = new THREE.Mesh(GEO.toolHandle, lam(0x7a5230));
  handle.scale.y = isLong ? 1.4 : 0.95;
  handle.position.y = isLong ? 0.7 : 0.47;
  g.add(handle);
  if (kind === 'scythe') {
    const blade = at(box(0.95, 0.07, 0.2, 0xc7d0d6), 0.42, 1.4, 0);
    g.add(blade);
  } else if (kind === 'pickaxe') {
    g.add(at(box(0.78, 0.12, 0.12, 0x9aa8ad), 0, 0.9, 0));
    g.add(at(box(0.16, 0.2, 0.14, 0x7d8a90), 0, 0.9, 0));
  } else {
    const color = kind === 'axe' ? 0xc0392b : 0x9aa8ad;
    g.add(at(box(0.36, 0.26, 0.13, color), 0.13, 0.9, 0));
    g.add(at(box(0.12, 0.3, 0.15, 0x6f5033), 0, 0.9, 0));
  }
  // The ad's tools read big in the hand; a literal-scale hatchet disappears at this camera.
  g.scale.setScalar(1.5);
  freezeChildren(g);
  return g;
}

export interface VillagerRefs extends PersonRefs {
  ice: THREE.Object3D; frost: THREE.Object3D; load: THREE.Mesh;
}

/**
 * Rescued villagers wear the camp's teal; the fort's hand-off crew wears hi-vis orange so the
 * three of them read as staff at a glance, in the fort and out on the bench run.
 */
export function makeVillager(kind: VillagerKind = 'rescued'): THREE.Group {
  const crew = kind === 'crew';
  const g = makePerson(
    crew ? COLORS.crewCoat : COLORS.villagerCoat,
    crew ? COLORS.crewCoatDark : COLORS.villagerCoatDark,
    false,
  );
  const base = refsOf<PersonRefs>(g);
  const ice = new THREE.Mesh(GEO.villagerIce, lam(COLORS.ice, 0.45));
  ice.position.y = 0.97;
  // A second, slightly smaller box of frost inside sells the "frozen solid" read that a single
  // translucent shell cannot — you see depth through the ice.
  const frost = new THREE.Mesh(GEO.villagerIce, lam(COLORS.frost, 0.35));
  frost.scale.setScalar(0.82);
  frost.position.y = 0.97;
  const load = new THREE.Mesh(GEO.villagerLoad, lam(COLORS.wood));
  load.position.set(0, 1.1, -0.45);
  load.visible = false;
  g.add(ice, frost, load);
  g.userData.refs = { ...base, ice, frost, load } satisfies VillagerRefs;
  return g;
}

/**
 * Shoppers' parkas, warm tones against the camp's teal and the player's blue so a queue reads as
 * outsiders coming in to buy. Picked per customer id, so one keeps its coat for its whole visit.
 */
export const CUSTOMER_COATS: { coat: number; dark: number }[] = [
  { coat: 0xe0a63c, dark: 0xb87f22 }, // mustard
  { coat: 0xcf5b4a, dark: 0xa8402f }, // brick
  { coat: 0xbb8a5c, dark: 0x93683f }, // camel
  { coat: 0xd06fa0, dark: 0xa54f7c }, // rose
];

export interface CustomerRefs extends PersonRefs { load: THREE.Mesh }

export function makeCustomer(coatIndex: number): THREE.Group {
  const palette = CUSTOMER_COATS[coatIndex % CUSTOMER_COATS.length];
  const g = makePerson(palette.coat, palette.dark, false);
  // Shown only on the way out, so a served shopper visibly carries its purchase off the map.
  const load = new THREE.Mesh(GEO.villagerLoad, lam(COLORS.wood));
  load.position.set(0, 1.1, -0.45);
  load.visible = false;
  g.add(load);
  g.userData.refs = { ...refsOf<PersonRefs>(g), load } satisfies CustomerRefs;
  return g;
}

// ---------------------------------------------------------------------------
// Bears
// ---------------------------------------------------------------------------

export interface BearRefs {
  body: THREE.Object3D; bars: THREE.Group; hpBg: THREE.Object3D; hp: THREE.Object3D;
}

/** Authored bear-body proportions; the sleeping breath pulse scales around these. */
export const BEAR_BODY_SCALE = { x: 1.3, y: 1.0, z: 1.75 } as const;

export function makeBear(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.bearBody, lam(COLORS.bear));
  body.scale.set(BEAR_BODY_SCALE.x, BEAR_BODY_SCALE.y, BEAR_BODY_SCALE.z);
  body.position.y = 0.95;
  const head = new THREE.Mesh(GEO.bearHead, lam(COLORS.bear));
  head.position.set(0, 1.28, 1.42);
  const snout = new THREE.Mesh(GEO.bearSnout, lam(COLORS.bearSnout));
  snout.scale.set(0.85, 0.66, 0.95);
  snout.position.set(0, 1.13, 1.78);
  const nose = new THREE.Mesh(GEO.bearNose, lam(0x33383d));
  nose.position.set(0, 1.2, 2.0);
  g.add(body, head, snout, nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(GEO.bearEar, lam(COLORS.bear));
    ear.position.set(sx * 0.3, 1.65, 1.32);
    g.add(ear);
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(GEO.bearLeg, lam(COLORS.bear));
      leg.position.set(sx * 0.62, 0.28, sz * 0.85);
      g.add(leg);
    }
  }
  const tail = new THREE.Mesh(GEO.bearTail, lam(COLORS.bear));
  tail.position.set(0, 1.05, -1.6);
  g.add(tail);
  // The HP bars live in their own group so aggro rotation of the body can be cancelled out and
  // the bars keep facing the camera.
  const bars = new THREE.Group();
  bars.position.y = 2.5;
  bars.rotation.y = Math.PI / 4;
  const hpBg = new THREE.Mesh(GEO.hpBg, lam(0x222222));
  const hp = new THREE.Mesh(GEO.hpBar, lam(0x44cc44));
  hp.position.z = 0.01;
  bars.add(hpBg, hp);
  g.add(bars);
  g.userData.refs = { body, bars, hpBg, hp } satisfies BearRefs;
  return g;
}

// ---------------------------------------------------------------------------
// Camp furniture and world dressing
// ---------------------------------------------------------------------------

export function makeBench(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(GEO.benchTop, lam(COLORS.bench));
  top.position.y = 0.82;
  const base = new THREE.Mesh(GEO.benchBase, lam(COLORS.benchDark));
  base.position.y = 0.36;
  g.add(top, base);
  for (const sx of [-0.95, 0.95]) {
    const leg = new THREE.Mesh(GEO.benchLeg, lam(COLORS.benchDark));
    leg.position.set(sx, 0.35, 0);
    g.add(leg);
  }
  freezeChildren(g);
  return g;
}

export function makeMatMesh(): THREE.Mesh {
  const m = new THREE.Mesh(GEO.mat, lam(COLORS.mat));
  m.position.y = 0.035;
  return m;
}

/** Snow-capped boulder: a squashed grey sphere wearing a smaller white one. */
export function makeRock(): THREE.Group {
  const g = new THREE.Group();
  const body = sph(0.95, COLORS.rock);
  body.scale.set(2.0, 1.4, 1.7);
  body.position.y = 0.55;
  const cap = sph(0.78, COLORS.snowCap);
  cap.scale.set(1.5, 0.7, 1.3);
  cap.position.y = 1.02;
  g.add(body, cap);
  freezeChildren(g);
  return g;
}

/** Supply crate: planked box with darker corner battens and a dusting of snow on the lid. */
export function makeCrate(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(box(1.0, 0.9, 1.0, COLORS.crate), 0, 0.45, 0));
  for (const sx of [-0.46, 0.46]) g.add(at(box(0.12, 0.94, 1.04, COLORS.crateDark), sx, 0.45, 0));
  g.add(at(box(1.04, 0.12, 0.14, COLORS.crateDark), 0, 0.45, 0.5));
  g.add(at(box(1.02, 0.07, 1.02, COLORS.snowCap), 0, 0.93, 0));
  freezeChildren(g);
  return g;
}

const FENCE_SPACING = 0.42;

/**
 * A straight picket run from `a` to `b` along `axis`, at the given fixed coordinate. Posts share
 * one geometry and the two rails are scaled unit boxes, so a whole fence line costs two buffers
 * however long it is. Alternating post tints give the run the ad's hand-placed look.
 */
export function makeFenceRun(a: number, b: number, axis: 'x' | 'z', fixed: number): THREE.Group {
  const g = new THREE.Group();
  const len = b - a;
  if (len < FENCE_SPACING) return g;
  const n = Math.max(1, Math.round(len / FENCE_SPACING));
  const along = (t: number, y: number): [number, number, number] =>
    axis === 'x' ? [t, y, fixed] : [fixed, y, t];
  for (let i = 0; i <= n; i++) {
    const t = a + (i * len) / n;
    const post = new THREE.Mesh(GEO.fencePost, lam(i % 3 === 0 ? COLORS.fenceShade : COLORS.fence));
    post.position.set(...along(t, 0.6));
    if (axis === 'z') post.rotation.y = Math.PI / 2;
    g.add(post);
  }
  for (const y of [0.44, 0.9]) {
    const rail = new THREE.Mesh(GEO.unitBox, lam(COLORS.fenceShade));
    rail.scale.set(len, 0.09, 0.06);
    rail.position.set(...along((a + b) / 2, y));
    if (axis === 'z') rail.rotation.y = Math.PI / 2;
    g.add(rail);
  }
  freezeChildren(g);
  return g;
}

/** Flat scaled slab off the shared unit box — road edging, snow trenches, ground decals. */
export function makeSlab(w: number, h: number, d: number, color: number): THREE.Mesh {
  return box(w, h, d, color);
}

// ---------------------------------------------------------------------------
// Machines, rails, gates
// ---------------------------------------------------------------------------

export interface PadRefs { progress: THREE.Object3D }

export function makePadMesh(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(GEO.padBase, lam(0x60686f));
  base.position.y = 0.09;
  const progress = new THREE.Mesh(GEO.padProgress, lam(0x3aa655));
  progress.position.y = 0.12;
  progress.scale.set(0.001, 1, 0.001);
  g.add(base, progress, makeDashedDisc());
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
  freezeChildren(g);
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
  const boxMesh = new THREE.Mesh(GEO.cartBox, lam(0x555b61));
  boxMesh.position.y = 0.5;
  const load = new THREE.Mesh(GEO.cartLoad, lam(COLORS.wood));
  load.position.y = 0.85;
  g.add(boxMesh, load);
  g.userData.refs = { load } satisfies CartRefs;
  return g;
}

export function makeSeam(): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(GEO.seamRock, lam(COLORS.rock));
  rock.scale.y = 0.6;
  rock.position.y = 0.4;
  const cap = sph(0.75, COLORS.snowCap);
  cap.scale.set(1.6, 0.5, 1.4);
  cap.position.y = 0.82;
  g.add(rock, cap);
  for (const [px, pz] of [[-0.4, 0.2], [0.4, -0.1], [0, 0.5]] as const) {
    const nug = new THREE.Mesh(GEO.seamNugget, lam(COLORS.gold));
    nug.position.set(px, 0.95, pz);
    g.add(nug);
  }
  return g;
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
      const railBar = new THREE.Mesh(GEO.unitBox, lam(0x777f86));
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
  freezeChildren(g);
  return g;
}

export function makeGateWall(length: number): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(GEO.unitBox, lam(0xd9534f));
  wall.scale.set(length, 2.2, 0.5);
  wall.position.y = 1.1;
  g.add(wall);
  const snow = new THREE.Mesh(GEO.unitBox, lam(COLORS.snowCap));
  snow.scale.set(length, 0.16, 0.62);
  snow.position.y = 2.24;
  g.add(snow);
  for (const end of [-length / 2, length / 2]) {
    const post = new THREE.Mesh(GEO.gatePost, lam(0xffffff));
    post.position.set(end, 1.4, 0);
    g.add(post);
  }
  freezeChildren(g);
  return g;
}

// ---------------------------------------------------------------------------
// Drops, carry stack, resource piles
// ---------------------------------------------------------------------------

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

/** Grid stack layout: three boxes wide, two deep, then a new course on top. */
const PILE_COLS = 3;
const PILE_ROWS = 2;
const PILE_DX = 0.52, PILE_DZ = 0.4, PILE_DY = 0.17;

/**
 * A capped grid of boxes, all hidden until `syncPile` reveals as many as the stored amount
 * earns. Cash mats read as the ad's bundled bill stacks; machine and depot piles reuse the
 * same look in their commodity colour.
 */
export function makePileStack(color: number, cap: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < cap; i++) {
    const b = new THREE.Mesh(GEO.pileBox, lam(color));
    const layer = Math.floor(i / (PILE_COLS * PILE_ROWS));
    const within = i % (PILE_COLS * PILE_ROWS);
    const col = within % PILE_COLS;
    const row = Math.floor(within / PILE_COLS);
    b.position.set(
      (col - (PILE_COLS - 1) / 2) * PILE_DX,
      0.09 + layer * PILE_DY,
      (row - (PILE_ROWS - 1) / 2) * PILE_DZ,
    );
    b.visible = false;
    g.add(b);
  }
  freezeChildren(g);
  return g;
}

// ---------------------------------------------------------------------------
// Camp building tiers
// ---------------------------------------------------------------------------

const CAMP_WOOD = 0xb07a45;
const CAMP_LOG = 0x9a6b3f;
const CAMP_RED = 0xc0392b;
const CAMP_RED_DARK = 0x8f2b20;

/** Where the depot stockpiles sit, how high the label floats, and what the camp is called. */
export interface CampTierInfo {
  name: string;
  labelY: number;
  floorY: number;
  piles: { x: number; z: number }[];
}

export const CAMP_TIERS: CampTierInfo[] = [
  { name: 'Camp Site', labelY: 2.4, floorY: 0,
    piles: [{ x: -1.6, z: 2.2 }, { x: 0, z: 2.2 }, { x: 1.6, z: 2.2 }] },
  { name: 'Shelter Hut', labelY: 4.1, floorY: 0.3,
    piles: [{ x: -1.6, z: 3.4 }, { x: 0, z: 3.4 }, { x: 1.6, z: 3.4 }] },
  { name: 'Stockade', labelY: 4.4, floorY: 0.3,
    piles: [{ x: -1.7, z: 1.4 }, { x: 0.2, z: 1.4 }, { x: 2.0, z: 1.4 }] },
  { name: 'Fort', labelY: 6.0, floorY: 1.1,
    piles: [{ x: -2.0, z: -3.2 }, { x: 0, z: -3.2 }, { x: 2.0, z: -3.2 }] },
  { name: 'Grand Fort', labelY: 7.0, floorY: 0.4,
    piles: [{ x: -2.3, z: -1.2 }, { x: 0, z: -1.2 }, { x: 2.3, z: -1.2 }] },
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
  // Snow drifted on the middle of the roof, leaving a broad band of red eaves showing.
  g.add(at(box(3.6, 0.14, 3.6, COLORS.snowCap), 0, 2.62, 0));
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
  g.add(at(box(6.8, 0.16, 0.6, COLORS.snowCap), 0, 2.5, -3.1));
  g.add(at(box(0.6, 0.16, 6.8, COLORS.snowCap), -3.1, 2.5, 0));
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
    const battens = Math.max(2, Math.round(w / 1.1));
    for (let i = 0; i < battens; i++)
      seg.add(at(box(0.18, 3.2, 0.5, CAMP_RED_DARK), -w / 2 + (i + 0.5) * (w / battens), 0, 0));
    seg.add(at(box(w, 0.18, 0.56, COLORS.snowCap), 0, 1.68, 0));
    seg.position.set(x, 1.95, z);
    seg.rotation.y = rotY;
    g.add(seg);
  };
  wall(8, 0, -3.8, 0);
  wall(8, -3.8, 0, Math.PI / 2);
  // The east face carries both rail entrances and so runs as three stubs with a gate either
  // side of centre: rail-t1 and rail-s1 converge at camp-local z ≈ -1.9, rail-t2 comes in at
  // z ≈ +1.9. A solid wall at either spot has carts driving straight through it.
  wall(1.0, 3.8, -3.5, Math.PI / 2);
  wall(1.6, 3.8, 0, Math.PI / 2);
  wall(1.0, 3.8, 3.5, Math.PI / 2);
  wall(2.6, -2.7, 3.8, 0); // the south face keeps a gap: that is the way in
  wall(2.6, 2.7, 3.8, 0);
  for (const tx of [-3.8, 3.8]) {
    g.add(at(box(1.5, 4.4, 1.5, 0xb0492b), tx, 2.2, 3.8));
    g.add(at(cone(1.3, 1.4, CAMP_RED_DARK), tx, 5.1, 3.8));
  }
  // Shelving on the north wall: the depot stockpiles sit on the lower shelf.
  for (const sy of [1.0, 2.0]) g.add(at(box(6.4, 0.18, 1.5, CAMP_WOOD), 0, sy, -3.2));
  g.add(at(box(1.0, 0.9, 1.0, CAMP_WOOD), 3.0, 0.8, 2.6));
}

/** Tier 4 — Grand Fort: log-cabin courses, banner and a cash vault in the yard. */
function campGrandFort(g: THREE.Group): void {
  g.add(at(box(9, 0.4, 9, CAMP_LOG), 0, 0.2, 0));
  for (let course = 0; course < 7; course++) {
    const y = 0.6 + course * 0.52;
    const tint = course % 2 === 0 ? CAMP_LOG : CAMP_WOOD;
    const len = course % 2 === 0 ? 9 : 8.6;
    for (const [x, z, axis] of [[0, -4.3, 'x'], [-4.3, 0, 'z']] as const) {
      const log = at(cyl(0.26, len, tint), x, y, z);
      if (axis === 'x') log.rotation.z = Math.PI / 2; else log.rotation.x = Math.PI / 2;
      g.add(log);
    }
    // East face is broken by both rail gates (see `campFort`), so it runs as three stubs.
    for (const [zc, zlen] of [[-3.9, 1.2], [0, 2.0], [3.9, 1.2]] as const) {
      const log = at(cyl(0.26, zlen * (len / 9), tint), 4.3, y, zc);
      log.rotation.x = Math.PI / 2;
      g.add(log);
    }
    for (const sx of [-3.2, 3.2]) {
      const log = at(cyl(0.26, 2.6, tint), sx, y, 4.3);
      log.rotation.z = Math.PI / 2;
      g.add(log);
    }
  }
  g.add(at(box(9.3, 0.2, 0.7, COLORS.snowCap), 0, 4.3, -4.3));
  for (const [px, pz] of [[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]] as const)
    g.add(at(cyl(0.34, 4.6, COLORS.trunk), px, 2.3, pz));
  g.add(at(cyl(0.12, 5.4, 0xd8d2c4), 0, 3.1, -4.3));
  g.add(at(box(2.2, 1.3, 0.12, COLORS.playerCoat), 1.1, 5.1, -4.3));
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
  freezeChildren(g);
  return g;
}
