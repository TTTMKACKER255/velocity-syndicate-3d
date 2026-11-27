import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createArchitecture, queueArchitecture } from "../src/architecture.js";

test("a gallery has four sides of glazing and separate front, rear and interior depths", () => {
  const world = new THREE.Group(),
    architecture = createArchitecture(world);
  const room = architecture.add({
    x: 20,
    y: 2,
    z: 11,
    w: 12,
    d: 19,
    h: 4,
    kind: "workshop",
    seed: 32,
  });
  architecture.bake();
  const panes = room.props.filter((p) => p.type === "pane");
  assert.equal(new Set(panes.filter((p) => !p.w).map((p) => p.x)).size, 2);
  assert.equal(new Set(panes.filter((p) => !p.d).map((p) => p.z)).size, 2);
  assert.ok(panes.every((p) => Math.max(p.w, p.d) < 6));
  const eye = { x: 36, z: 11.63 };
  const queue = [];
  queueArchitecture(queue, world.userData.rooms, {
    visible: () => true,
    depth: (x) => eye.x - x,
    time: 1,
  });
  queue.sort((a, b) => b.d - a.d);
  const sequence = queue.filter(
    ({ interior: p }) =>
      (p.type === "pane" && p.w === 0) ||
      (p.type === "oval" && p.c === room.people[0].skin),
  );
  assert.equal(sequence.at(0).interior.type, "pane");
  assert.equal(sequence.at(-1).interior.type, "pane");
  assert.ok(sequence.some((entry) => entry.interior.type === "oval"));
  // A ray across the central aisle crosses both transparent elevations. No
  // full-width textured podium or substitute interior wall occludes that path.
  const opaque = room.props.filter(
    (p) =>
      p.type === "block" &&
      Math.abs(p.z - eye.z) < p.d * 0.5 &&
      Math.abs(p.y - (room.y + 1.65)) < p.h * 0.5,
  );
  assert.equal(opaque.length, 0);
});

test("worker poses animate in both rendering paths and distant figures are culled", () => {
  const root = new THREE.Group(),
    architecture = createArchitecture(root);
  const room = architecture.add({
    x: 0,
    y: 0,
    z: 0,
    w: 14,
    d: 24,
    h: 4.6,
    kind: "cafe",
    seed: 3,
  });
  architecture.bake();
  const workers = root.getObjectByName("Working residents");
  const positions = (time) => {
    architecture.update(time, { x: 0, z: 0 });
    const matrix = new THREE.Matrix4(),
      worldPosition = new THREE.Vector3();
    const queue = [];
    queueArchitecture(queue, [room], {
      depth: () => 8,
      visible: () => true,
      time,
    });
    const firstHead = queue.find(
      ({ interior: p }) => p.type === "oval" && p.c === room.people[0].skin,
    );
    workers.getMatrixAt(1, matrix);
    worldPosition.setFromMatrixPosition(matrix);
    assert.ok(
      Math.hypot(
        firstHead.interior.x - worldPosition.x,
        firstHead.interior.y - worldPosition.y,
        firstHead.interior.z - worldPosition.z,
      ) < 0.0001,
    );
    return [...workers.instanceMatrix.array.slice(0, workers.count * 16)];
  };
  assert.notDeepEqual(positions(0), positions(1.25));
  assert.equal(workers.count, room.people.length * 15);
  architecture.update(2, { x: 900, z: 500 });
  assert.equal(workers.count, 0);
  const glazing = [];
  root.traverse((obj) => {
    if (obj.isMesh && obj.material.transparent) glazing.push(obj);
  });
  assert.ok(glazing.length);
  assert.ok(
    glazing.every(
      (obj) => obj.material.opacity < 0.25 && !obj.material.depthWrite,
    ),
  );
});
