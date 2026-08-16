import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SEAM_HP } from '../src/content/balance';
import { goldMinePos, seamDefs, compoundFencePosts } from '../src/content/map';
import {
  SHARED, billMaterial, billTexture, ingotGeometry, makeCommodity, makeCommodityStack,
  makeCompoundFence, makeDropMesh, makeGoldMine, makeMineCart, makePileStack, refsOf,
  steakGeometry, vertexColorMaterial,
} from '../src/render/meshes';
import type { MineRefs } from '../src/render/meshes';
import { dist } from '../src/game/math';

/**
 * The bill texture is painted on a canvas, and these tests run in node. Rather than pull in a DOM
 * implementation for one 128px square nobody looks at, stand up the two calls `labelTexture` and
 * `billTexture` actually make: a canvas with a 2D context that swallows every drawing command.
 * What is under test is which material and geometry a mesh gets, not what the paint looks like.
 */
beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
});

/** Every mesh under `root`, including `root` itself if it is one. */
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
}

/**
 * The high-detail commodities (Amendment 6C). These are the most numerous objects in the game
 * after the forest — a stocked camp has hundreds of them between the piles, the carried loads and
 * the drops — so what this file mostly guards is that they are SHARED: one geometry and one
 * material apiece, however many are on screen.
 */
describe('money, meat and gold', () => {
  it('draws bills, steaks and ingots off shared resources', () => {
    expect(SHARED.has(steakGeometry())).toBe(true);
    expect(SHARED.has(ingotGeometry())).toBe(true);
    expect(SHARED.has(billTexture())).toBe(true);
    expect(SHARED.has(billMaterial())).toBe(true);
    // Repeat calls hand back the same instances rather than minting per mesh.
    expect(steakGeometry()).toBe(steakGeometry());
    expect(billMaterial()).toBe(billMaterial());
    expect(billMaterial().map).toBe(billTexture());
  });

  it('gives every commodity its own read, from one unit mesh', () => {
    const steak = makeCommodity('meat');
    const ingot = makeCommodity('gold');
    const bill = makeCommodity('cash');
    expect(steak.geometry).toBe(steakGeometry());
    expect(ingot.geometry).toBe(ingotGeometry());
    expect(bill.material).toBe(billMaterial());
    // Meat and gold are merged, vertex-coloured buffers: one draw each, two tints apiece.
    expect(steak.material).toBe(vertexColorMaterial());
    expect(steak.geometry.getAttribute('color')).toBeTruthy();
    expect(ingot.geometry.getAttribute('color')).toBeTruthy();
    // A ministeak is a flat slab, wider than it is thick — not a cube.
    steak.geometry.computeBoundingBox();
    const size = steak.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(size.y * 2);
    expect(size.z).toBeGreaterThan(size.y);
  });

  it('stacks a pile in the style of what it holds', () => {
    // Twelve: a pile is six to a course (three wide, two deep), so this is two courses.
    const crates = makePileStack(0xb07a3f, 12, 'crate');
    const bills = makePileStack(0x4fbf62, 12, 'bills');
    const steaks = makePileStack(0xdc5a52, 12, 'steak');
    for (const pile of [crates, bills, steaks]) expect(pile.children).toHaveLength(12);
    expect(meshes(bills).every((m) => m.material === billMaterial())).toBe(true);
    expect(meshes(steaks).every((m) => m.geometry === steakGeometry())).toBe(true);
    expect(meshes(crates).every((m) => m.geometry !== steakGeometry())).toBe(true);
    // Steaks are thin, so their courses stack closer together than crates do.
    const courseY = (p: THREE.Group) => p.children[6].position.y - p.children[0].position.y;
    expect(courseY(steaks)).toBeGreaterThan(0);
    expect(courseY(steaks)).toBeLessThan(courseY(crates));
  });

  it('drops the same commodity on the ground that the piles are made of', () => {
    expect((makeDropMesh('meat') as THREE.Mesh).geometry).toBe(steakGeometry());
    expect((makeDropMesh('gold') as THREE.Mesh).geometry).toBe(ingotGeometry());
    expect((makeDropMesh('cash') as THREE.Mesh).material).toBe(billMaterial());
  });

  it('builds a carried armful out of the same units', () => {
    const armful = makeCommodityStack('meat', 3);
    expect(armful.children).toHaveLength(3);
    expect(meshes(armful).every((m) => m.geometry === steakGeometry())).toBe(true);
    // Stacked, not co-located.
    const ys = armful.children.map((c) => c.position.y);
    expect(new Set(ys).size).toBe(3);
  });
});

describe('the gold mine', () => {
  it('stands in the middle of the quarry block, clear of every seam', () => {
    const at = goldMinePos();
    const quarry = seamDefs().filter((d) => d.zone === 'quarry');
    expect(quarry.length).toBeGreaterThan(0);
    for (const seam of quarry) {
      // A seam is ~2.2 across and the headframe ~2.5: nothing may be built on top of the rock.
      expect(dist(at, seam.pos)).toBeGreaterThan(3);
      // ...and the frame belongs to this cluster, not to some other corner of the map.
      expect(dist(at, seam.pos)).toBeLessThan(12);
    }
    expect(SEAM_HP).toBeGreaterThan(0); // the seams it is built over are still minable rock
  });

  it('gives the cart an ore block that grows from its floor', () => {
    const cart = makeMineCart();
    const fill = refsOf<MineRefs>(cart).fill;
    expect(fill).toBeTruthy();
    const box = new THREE.Box3().setFromObject(fill);
    // Authored full: the renderer scales this down toward the floor, so a full cart is the
    // authored size and an empty one is nothing.
    expect(box.max.y).toBeGreaterThan(0.6);
    expect(meshes(makeGoldMine()).length).toBeGreaterThan(6); // legs, head, braces, deck
  });
});

describe('draw-call discipline', () => {
  it('draws the whole compound palisade as one mesh', () => {
    const posts = compoundFencePosts();
    expect(posts.length).toBeGreaterThan(40);
    const fence = makeCompoundFence(posts);
    expect(meshes(fence)).toHaveLength(1);
    expect(fence.material).toBe(vertexColorMaterial());
    // Every picket really is in there: the merged buffer scales with the post count.
    const small = makeCompoundFence(posts.slice(0, 10));
    expect(fence.geometry.getAttribute('position').count)
      .toBeGreaterThan(small.geometry.getAttribute('position').count);
  });
});
