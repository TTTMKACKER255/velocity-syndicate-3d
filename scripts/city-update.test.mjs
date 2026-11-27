import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pavementIndex, clippedQuads } from "../src/junctions.js";
import { createRoadNavigator } from "../src/navigation.js";
import { upperStoreys } from "../src/upper-storeys.js";
import {
  createWorld,
  roads,
  roadLengths,
  routePoint,
  spawn,
} from "../src/world.js";
import { locations, markerPoint } from "../src/locations.js";
import * as THREE from "three";
import { RadioStation } from "../audio/radio.js";
import { tracks } from "../audio/tracks.js";

test("every upper floor has opposite clear windows and physically separate floor plates", () => {
  for (const style of ["glass", "residence", "limestone", "brick"]) {
    const shell = upperStoreys({
      x: 0,
      y: 4,
      z: 0,
      w: 21,
      h: 47,
      d: 18,
      style,
      seed: 15,
    });
    const panes = shell.props.filter((p) => p.type === "pane");
    for (let i = 0; i < shell.levels; i++) {
      const row = panes.slice(4 * i, 4 * i + 4),
        y = row[0].y;
      assert.equal(
        new Set(row.filter((p) => p.w === 0).map((p) => p.x)).size,
        2,
      );
      assert.equal(
        new Set(row.filter((p) => p.d === 0).map((p) => p.z)).size,
        2,
      );
      assert.ok(row.every((p) => p.h > 2 && p.y === y));
      const solids = shell.props.filter(
        (p) => p.type === "block" && Math.abs(p.y - y) < p.h / 2,
      );
      // Trace two central rays between the mullions, across each storey.
      for (const [axis, span] of [
        ["z", "d"],
        ["x", "w"],
      ]) {
        const rays = Array.from(
          { length: 41 },
          (_, j) => (j / 40 - 0.5) * shell[span] * 0.78,
        );
        const clear = rays.filter(
          (ray) => !solids.some((p) => Math.abs(p[axis] - ray) < p[span] / 2),
        );
        assert.ok(clear.length / rays.length > 0.36);
      }
    }
  }
});

test("crossing road quads cut paving and paint at both edges, including oblique crossings; flyovers stay intact", () => {
  const poly = [
    [0, 0, -5],
    [2, 0, -5],
    [2, 0, 5],
    [0, 0, 5],
  ];
  const uv = poly.flatMap(([x, , z]) => [x, z]);
  for (const slope of [0, 0.5, -1.5]) {
    const corners = [
      [-5, 0, -1 - 5 * slope],
      [5, 0, -1 + 5 * slope],
      [5, 0, 1 + 5 * slope],
      [-5, 0, 1 - 5 * slope],
    ];
    const lookup = pavementIndex([{ road: 1, elevation: 0, corners }]);
    const quads = [];
    clippedQuads(poly, uv, lookup(poly, 2, 0), (p, tex) => {
      quads.push(p);
      p.forEach(([x, , z], i) => {
        assert.ok(
          Math.abs(x - tex[2 * i]) < 1e-8 &&
            Math.abs(z - tex[2 * i + 1]) < 1e-8,
        );
      });
    });
    let area = 0;
    for (const p of quads) {
      const mean = p.reduce((s, [x, , z]) => s + z - x * slope, 0) / p.length;
      assert.ok(Math.abs(mean) >= 0.99999);
      area +=
        Math.abs(
          p.reduce((s, a, i) => {
            const b = p[(i + 1) % p.length];
            return s + a[0] * b[2] - a[2] * b[0];
          }, 0),
        ) / 2;
    }
    assert.ok(Math.abs(area - 16) < 1e-7);
    assert.equal(lookup(poly, 2, 9).length, 0);
    assert.equal(lookup(poly, 1, 0).length, 0);
  }
});

test("actual downtown pavements stop at the cross street and painted dividers leave the intersection open", () => {
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ fillRect() {}, fillText() {}, strokeRect() {} }),
    }),
  };
  let world;
  try {
    world = createWorld(new THREE.Scene());
    for (const name of ["Stone paving", "Road markings"]) {
      const vertices =
        world.group.getObjectByName(name).geometry.attributes.position;
      let outside = 0;
      for (let j = 0; j < vertices.count; j += 4) {
        let x = 0,
          z = 0;
        for (let k = 0; k < 4; k++) {
          x += vertices.getX(j + k) / 4;
          z += vertices.getZ(j + k) / 4;
        }
        if (Math.abs(x - 15) > 20 || Math.abs(z) > 23) continue;
        assert.ok(
          !(Math.abs(x - 15) < 8.98 && Math.abs(z) < 9.48),
          name + " at " + x + "," + z,
        );
        if (name === "Stone paving")
          assert.ok(Math.abs(x - 15) > 8.94 && Math.abs(z) > 9.44);
        outside++;
      }
      assert.ok(outside > 5);
    }
    const tall = world.group.userData.rooms.filter((room) => room.levels >= 4);
    assert.ok(tall.length > 20);
    const t = world.trees[0],
      b = world.boardAt("2/231");
    assert.equal(
      world.collide({ ...t, heading: 0, speed: 2 }).material,
      "wood",
    );
    assert.equal(
      world.collide({ x: b.x, z: b.z, speed: 15 }).material,
      "glass",
    );
  } finally {
    world?.dispose();
    globalThis.document = old;
  }
});

test("GPS follows connected streets, never turns up onto an overlapping bridge and reaches the real destinations", () => {
  const paths = [
    {
      points: [
        [-30, 0],
        [30, 0],
      ],
      width: 6,
    },
    {
      points: [
        [0, -30],
        [0, 30],
      ],
      width: 6,
    },
    {
      points: [
        [-28, -30],
        [-28, 30],
      ],
      width: 6,
    },
  ];
  const route = createRoadNavigator(paths, (road) => (road === 2 ? 9 : 0));
  const r = route({ x: 25, z: 0, height: 0 }, { x: 0, z: 25, height: 0 });
  assert.ok(r.points.some((p) => Math.hypot(p.x, p.z) < 0.01));
  assert.equal(r.distance, 50);
  assert.equal(
    route({ x: -28, z: 10, height: 9 }, { x: 0, z: 25, height: 0 }),
    null,
  );
  const bay = createRoadNavigator(roads, (i, d) => routePoint(i, d).height);
  for (const place of locations)
    assert.ok(
      bay(spawn, markerPoint(place, routePoint, roadLengths)).points.length > 1,
    );
});

class TestMedia extends EventTarget {
  paused = true;
  src = "";
  urls = [];
  canPlayType() {
    return "probably";
  }
  play() {
    this.urls.push(this.src);
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
test("drive gesture plays recorded music, honours a mute, advances on end and recovers with MP3", async () => {
  const media = new TestMedia(),
    r = new RadioStation(
      media,
      tracks,
      () => {},
      () => {},
    );
  r.startDrive(false);
  assert.equal(media.urls.length, 0);
  await r.startDrive(true);
  assert.equal(r.playing, true);
  assert.equal(media.urls[0], tracks[0].src);
  media.dispatchEvent(new Event("ended"));
  await Promise.resolve();
  assert.equal(r.index, 1);
  r.pause();
  await r.startDrive(false);
  assert.equal(r.playing, false);
  assert.ok(media.paused);
  media.play = () => {
    media.urls.push(media.src);
    return media.src.endsWith(".ogg")
      ? Promise.reject(new Error("Codec unavailable"))
      : Promise.resolve();
  };
  await r.play(2);
  assert.equal(media.src, tracks[2].fallbackSrc);
  assert.ok(r.playing);
  for (const t of tracks)
    for (const url of [t.src, t.fallbackSrc])
      assert.ok(readFileSync(new URL(url)).length > 100000);
});
