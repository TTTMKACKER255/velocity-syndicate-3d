import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { DriftMarks } from "../src/skidmarks.js";
import { createVehicle } from "../models/vehicle.js";

const flat = () => ({ height: 0, road: true });
const driver = (patch = {}) => ({
  x: 0, z: 0, y: 0, speed: 40, heading: 0.30, travel: 0,
  yawRate: 0, drift: true, airborne: false, ...patch,
});
const close = (actual, expected, tolerance = 2e-5) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const average = (a, b) => a.map((n, i) => (n + b[i]) * 0.5);
const start = (quad) => average(quad[0], quad[1]);
const end = (quad) => average(quad[2], quad[3]);
const d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
function read(marks, player = driver()) {
  const quads = [];
  marks.drawSoftware((quad, ink) => {
    assert.match(ink, /^rgba\(/);
    quads.push(quad);
  }, player);
  return quads;
}
function move(marks, list, patch = {}) {
  for (const z of list) marks.update(driver({ z, ...patch }));
}

test("treads align with mounted rear wheels on all seven configurations", () => {
  for (const body of ["coupe", "wagon", "sport", "gt", "muscle", "tuner", "hyper"]) {
    const look = { body, widebody: true };
    const marks = new DriftMarks(null, flat, look);
    const vehicle = createVehicle(look);
    const p = driver();
    vehicle.group.rotation.y = p.heading;
    vehicle.group.updateMatrixWorld(true);
    const mounts = vehicle.group.children.filter((obj) => obj.name === "Rear upright");
    move(marks, [0, -0.51]);
    const quads = read(marks);
    assert.equal(quads.length, 2);
    for (let i = 0; i < 2; i++) {
      const wheel = mounts[i].getWorldPosition(new THREE.Vector3());
      const contact = start(quads[i]);
      close(contact[0], wheel.x);
      close(contact[2], wheel.z);
      close(d(quads[i][0], quads[i][1]), 0.24 * vehicle.group.scale.x);
    }
    vehicle.dispose();
    marks.dispose();
  }
});

test("cornering generates separate curved wheel paths with shared seam vertices", () => {
  const marks = new DriftMarks(null, flat);
  const radius = 14, rate = 2.2;
  for (let i = 0; i <= 160; i++) {
    const a = (i * rate) / 120, travel = a - 0.28;
    marks.update(driver({
      x: radius * (Math.cos(travel) - Math.cos(-0.28)),
      z: -radius * (Math.sin(travel) - Math.sin(-0.28)),
      heading: a, travel, speed: radius * rate, yawRate: rate,
    }));
  }
  const quads = read(marks);
  const active = [null, null], n = [0, 0];
  for (const quad of quads) {
    const s = start(quad), e = end(quad);
    const side = active.findIndex((prev) => prev && d(prev, s) < 0.00003);
    const index = side >= 0 ? side : active.findIndex((p) => !p);
    assert.notEqual(index, -1, "missing previous trail endpoint");
    active[index] = e;
    n[index]++;
    assert.ok(d(s, e) > 0.475 && d(s, e) < 0.485);
    assert.ok(d(quad[0], quad[1]) > 0.235);
  }
  assert.ok(Math.abs(n[0] - n[1]) >= 6, "outer tire must travel farther");
});

test("ground-reference sampling follows slopes and both levels of a flyover", () => {
  const queried = [];
  const road = (x, z, ref) => {
    queried.push(ref);
    return { height: 0.18 * x + 0.09 * z + (ref > 4 ? 8 : 0), road: true };
  };
  const marks = new DriftMarks(null, road);
  for (const deck of [0, 8]) {
    marks.breakTrail();
    for (const z of [0, -0.5, -1, -1.5]) marks.update(driver({ z, y: 0.09 * z + deck }));
  }
  assert.ok(queried.every(Number.isFinite));
  // Marks directly below the active deck are occluded in the software pass.
  const above = read(marks, driver({ y: 8 }));
  assert.equal(above.length, 6);
  for (const quad of above)
    for (const [x, y, z] of quad) close(y, 8 + 0.18 * x + 0.09 * z + 0.024);
  const all = read(marks);
  assert.equal(all.length, 6);
  for (const quad of all.filter((q) => q[0][1] < 4))
    for (const [x, y, z] of quad) close(y, 0.18 * x + 0.09 * z + 0.024);
});

test("stops on grass, in the air, without slip and after a teleport or collision reset", () => {
  const surface = (_x, z) => ({ height: 0, road: z > -4 || z < -8 });
  const marks = new DriftMarks(null, surface);
  move(marks, [0, -0.6, -1.2]);
  const first = marks.count;
  move(marks, [-2, -3], { travel: 0.30 });
  move(marks, [-3.5, -4.0], { airborne: true });
  move(marks, [-5, -6, -7]);
  assert.equal(marks.count, first);
  move(marks, [-10, -10.6]);
  assert.equal(marks.count, first + 2);
  marks.breakTrail();
  move(marks, [-17]);
  assert.equal(marks.count, first + 2);
  move(marks, [-17.6, -18.2]);
  const beforeTeleport = marks.count;
  move(marks, [-57]);
  assert.equal(marks.count, beforeTeleport);
  move(marks, [-57.6]);
  for (const quad of read(marks)) {
    assert.ok(d(start(quad), end(quad)) < 0.51);
    assert.ok(quad.every((p) => surface(p[0], p[2]).road));
  }
});

test("dropped tire contact breaks only that trail and no diagonal crosses the grass", () => {
  const surface = (x, z) => ({ height: 0, road: x > -0.3 || z > -1 || z < -5 });
  const marks = new DriftMarks(null, surface);
  for (let i = 0; i < 50; i++) marks.update(driver({ z: -i * 0.25 }));
  const result = read(marks);
  const left = result.filter((q) => start(q)[0] < 0), right = result.filter((q) => start(q)[0] > 0);
  assert.ok(left.length > 3 && left.length + 6 < right.length);
  for (const q of left) {
    for (let j = 0; j <= 4; j++) {
      const a = start(q), b = end(q);
      assert.equal(surface(a[0], a[2] + (b[2] - a[2]) * j / 4).road, true);
    }
  }
});

test("sampling density follows distance at both 30 and 200+ mph", () => {
  const result = (step, speed) => {
    const marks = new DriftMarks(null, flat);
    for (let i = 0; i <= Math.round(96 / step); i++) marks.update(driver({ z: -i * step, speed }));
    return read(marks).map((quad) => quad.flat()).sort((a, b) => a[0] - b[0] || b[2] - a[2]);
  };
  const slow = result(0.125, 15), fast = result(0.8, 96);
  assert.equal(slow.length, 400);
  assert.equal(slow.length, fast.length);
  slow.forEach((quad, i) => quad.forEach((value, k) => close(value, fast[i][k])));
});

test("WebGL and software share bounded geometry and wrap without corrupting old seams", () => {
  const scene = new THREE.Scene(), marks = new DriftMarks(scene, flat);
  const mesh = scene.getObjectByName("Rear tire marks"), geometry = mesh.geometry;
  const capacity = geometry.index.count / 18;
  const buffer = geometry.getAttribute("position").array;
  const source = Array.from({ length: 17 }, (_, i) => -i * 0.5);
  move(marks, source);
  const initial = buffer.slice(0, 24);
  move(marks, [-8.5, -9, -9.5]);
  assert.deepEqual(buffer.slice(0, 24), initial);
  const quads = read(marks);
  for (let i = 0; i < quads.length; i++) {
    for (const [j, index] of [0, 3, 7, 4].entries())
      assert.deepEqual(quads[i][j], Array.from(buffer.subarray(i * 24 + index * 3, i * 24 + index * 3 + 3)));
  }
  for (let i = 20; i < capacity * 2; i++) marks.update(driver({ z: -i * 0.5 }));
  assert.equal(marks.count, capacity);
  assert.equal(geometry.drawRange.count, geometry.index.count);
  assert.equal(geometry.getAttribute("position").array, buffer);
  assert.ok(geometry.getAttribute("position").updateRanges.length <= 2);
  assert.notDeepEqual(buffer.slice(0, 24), initial);
  assert.equal(read(marks).length, 0, "the old start line should have been overwritten");
  const nearby = read(marks, driver({ z: -(capacity * 2 - 1) * 0.5 }));
  assert.ok(nearby.length > 150);
  assert.ok(nearby.every((q) => d(start(q), end(q)) < 0.49));
  marks.dispose();
  marks.dispose();
  assert.equal(scene.children.length, 0);
});
