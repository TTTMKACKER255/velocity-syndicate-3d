import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createWorld } from "../src/world.js";

test("tree contacts use front corners, hinge away from travel and settle once", () => {
  const documentBefore = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }),
    }),
  };
  let world;
  try {
    world = createWorld(new THREE.Scene());
    for (const kind of ["palm", "oak"]) {
      const tree = world.trees.find((t) => t.kind === kind);
      const heading = 0.64,
        travel = -0.37,
        c = Math.cos(heading),
        s = Math.sin(heading);
      const car = {
        x: tree.x - (1.15 * c - 2.39 * s),
        z: tree.z - (-1.15 * s - 2.39 * c),
        y: tree.y,
        heading,
        travel,
        speed: 3,
      };
      world.update(3, 0);
      assert.equal(world.collide(car).solid, true);
      assert.equal(tree.fallen, false);
      const hit = world.collide({ ...car, speed: 25 });
      assert.equal(hit.trees, 1);
      assert.deepEqual(hit.tree, { x: tree.x, z: tree.z });
      assert.ok(Math.abs(tree.dx + Math.sin(travel)) < 1e-9);
      assert.ok(Math.abs(tree.dz + Math.cos(travel)) < 1e-9);
      world.update(3.4, 0);
      const early = tree.angle;
      assert.ok(early > 0 && early < 0.8);
      world.update(4.3, 0);
      assert.equal(tree.progress, 1);
      assert.ok(tree.angle > early);
      const settled = tree.angle;
      world.update(6, 0);
      assert.equal(tree.angle, settled);
      assert.equal(world.collide({ ...car, speed: 25 }).trees, 0);
    }
  } finally {
    world?.dispose();
    globalThis.document = documentBefore;
  }
});
