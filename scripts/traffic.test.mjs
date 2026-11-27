import test from "node:test";
import assert from "node:assert/strict";
import { newDriver, STEP } from "../src/physics.js";
import {
  trafficBody,
  collideTraffic,
  advanceTraffic,
  localContact,
} from "../src/traffic-physics.js";

const ground = () => ({ height: 0 });
function pair(x = 0, z = -4.3) {
  const driver = newDriver({ x: 0, z: 0, heading: 0 });
  driver.speed = 28;
  const target = { x, z, y: 0, heading: 0 };
  const car = trafficBody(target);
  car.vz = -7;
  return { driver, car, target };
}
test("a centred rear-end impact transfers momentum and dents the two facing bumpers", () => {
  const { driver, car } = pair();
  const momentum = 1520 * -driver.speed + car.mass * car.vz;
  const hit = collideTraffic(driver, car);
  assert.ok(
    hit.speed > 20 && hit.playerContact.z < -2 && hit.trafficContact.z > 2,
  );
  assert.ok(driver.speed < 28 && car.vz < -7);
  assert.ok(
    Math.abs(1520 * -driver.speed + car.mass * car.vz - momentum) < 0.00001,
  );
  assert.equal(car.spin, 0);
  assert.equal(collideTraffic(driver, car), null);
});
test("an offset bumper strike produces yaw and the traffic body keeps sliding across subsequent steps", () => {
  const { driver, car, target } = pair(0.8);
  const hit = collideTraffic(driver, car);
  assert.ok(hit.trafficContact.x < 0 && hit.playerContact.x > 0);
  assert.ok(Math.abs(car.spin) > 0.4);
  const separated = car.z;
  for (let i = 0; i < 24; i++) advanceTraffic(car, target, ground, STEP);
  assert.ok(car.z < separated - 1);
  assert.ok(Math.abs(car.heading) > 0.05);
  assert.ok(Math.abs(car.z - target.z) > 1);
  const before = car.z;
  advanceTraffic(car, target, ground, STEP);
  assert.ok(Math.abs(before - car.z) < 0.4);
});
test("displaced traffic returns smoothly to a moving lane", () => {
  const { driver, car, target } = pair(0.4);
  collideTraffic(driver, car);
  for (let i = 1; i <= 120 * 18; i++) {
    const oldZ = car.z;
    advanceTraffic(
      car,
      { ...target, z: target.z - 7 * i * STEP },
      ground,
      STEP,
    );
    assert.ok(Math.abs(oldZ - car.z) < 0.35);
  }
  assert.equal(car.displaced, false);
  assert.ok(Math.abs(car.z - (target.z - 7 * 18)) < 0.18);
});
test("cross traffic can shunt a parked driver from the side", () => {
  const { driver, car } = pair(2.95, 0);
  driver.speed = 0;
  car.heading = Math.PI / 2;
  car.vx = -17;
  car.vz = 0;
  const hit = collideTraffic(driver, car);
  assert.ok(hit.speed > 15 && hit.playerContact.x > 0.7);
  assert.ok(-Math.sin(driver.travel) * driver.speed < -4);
});
test("flyovers, clear side lanes and cars separating do not exchange impulses", () => {
  const { driver, car } = pair();
  car.y = 6;
  assert.equal(collideTraffic(driver, car), null);
  car.y = 0;
  car.x = 2.1;
  assert.equal(collideTraffic(driver, car), null);
  car.x = 0;
  car.vz = -39;
  assert.equal(collideTraffic(driver, car), null);
  assert.equal(driver.speed, 28);
  assert.deepEqual(
    localContact({ x: 5, z: 2, heading: Math.PI / 2 }, 3, 2).z,
    -2,
  );
});

test("a fixed driving step deforms only the struck instance and publishes damage to the player renderer", async () => {
  const THREE = await import("three");
  const { RaceGraphics } = await import("../src/graphics.js");
  const { routePoint } = await import("../src/world.js");
  const { lanePose } = await import("../src/traffic-physics.js");
  const { createTrafficModel, disposeTrafficModel } = await import(
    "../models/traffic.js"
  );
  const [hitCar, otherCar] = [0, 1].map(() =>
    createTrafficModel(0x768687, "wagon"),
  );
  const target = lanePose(routePoint(0, 100)),
    s = Math.sin(target.heading),
    c = Math.cos(target.heading);
  const driver = newDriver(
    {
      x: target.x + 4.2 * s + 0.3 * c,
      z: target.z + 4.2 * c - 0.3 * s,
      heading: target.heading,
    },
    target.y,
  );
  driver.speed = 35;
  const sim = Object.create(RaceGraphics.prototype);
  const body = trafficBody(target, 1450, hitCar.userData);
  Object.assign(sim, {
    playerBody: new THREE.Group(),
    world: { surface: () => ({ height: target.y - 0.07 }) },
    traffic: [{ mesh: hitCar, body, road: 0, dist: 100, speed: 9 }],
    rival: new THREE.Group(),
    interceptor: new THREE.Group(),
  });
  const paint = (group) =>
    group.levels[0].object.children.find(
      (mesh) => mesh.material.name === "Coachwork",
    ).geometry;
  try {
    const shared = paint(otherCar);
    assert.equal(paint(hitCar), shared);
    assert.ok(sim.stepTraffic(STEP, driver, null, 0) > 15);
    assert.equal(driver.dents.length, 1);
    assert.equal(hitCar.userData.dents.length, 1);
    assert.equal(otherCar.userData.dents.length, 0);
    assert.notEqual(paint(hitCar), shared);
    const moved = paint(hitCar).attributes.position.array,
      original = shared.attributes.position.array;
    let changes = 0;
    for (let i = 0; i < moved.length; i++)
      if (Math.abs(moved[i] - original[i]) > 0.001) changes++;
    assert.ok(changes > 0 && changes < moved.length * 0.25);
    for (let i = 0; i < 50; i++) sim.stepTraffic(STEP, driver, null, 0);
    assert.equal(hitCar.position.x, body.x);
    assert.equal(hitCar.rotation.y, body.heading);
    assert.ok(Math.hypot(body.x - body.target.x, body.z - body.target.z) > 1);
  } finally {
    disposeTrafficModel(hitCar);
    disposeTrafficModel(otherCar);
  }
});
