import test from "node:test";
import assert from "node:assert/strict";
import { treeModel, tuftModel, windAt } from "../src/vegetation.js";

function checkWindWeights(geometry, groundHeight) {
  const { position, flex } = geometry.attributes;
  let roots = 0;
  let moving = 0;
  for (let i = 0; i < position.count; i++) {
    assert.ok(
      Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i)),
    );
    if (position.getY(i) < groundHeight) {
      assert.equal(flex.getX(i), 0);
      assert.equal(flex.getY(i), 0);
      roots++;
    } else if (flex.getX(i) > 0) {
      moving++;
    }
  }
  assert.ok(roots > 0 && moving > 0);
}

test("palm and oak retain round rooted trunks and flexible three-dimensional crowns at every detail level", () => {
  for (const kind of ["palm", "oak"]) {
    let previousTriangles = Infinity;
    for (const lod of [0, 1, 2]) {
      const [bark, crown] = treeModel(kind, 0, lod);
      checkWindWeights(bark, 0.025);
      const { position } = bark.attributes;
      const roots = [];
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(position.getY(i)) < 0.1)
          roots.push([position.getX(i), position.getZ(i)]);
      }
      for (const dim of [0, 1]) {
        const coords = roots.map((p) => p[dim]);
        assert.ok(Math.max(...coords) - Math.min(...coords) > 0.5);
      }
      crown.computeBoundingBox();
      const { min, max } = crown.boundingBox;
      assert.ok(max.x - min.x > 4 && max.z - min.z > 4);
      assert.ok(
        crown.attributes.flex.array.some((v, i) => i % 3 === 1 && v > 0),
      );
      const triangles = (bark.index.count + crown.index.count) / 3;
      assert.ok(triangles < previousTriangles);
      previousTriangles = triangles;
    }
  }
});

test("grass roots stay fixed as the tips respond to a changing local gust", () => {
  for (const lod of [0, 1, 2]) checkWindWeights(tuftModel(lod), 0.001);
  assert.notDeepEqual(windAt(10, 0.5), windAt(11, 0.5));
  assert.notDeepEqual(windAt(10, 0.5), windAt(10, 1));
});
