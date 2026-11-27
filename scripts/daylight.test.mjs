import test from "node:test";
import assert from "node:assert/strict";
import {
  daylightAt,
  solarHour,
  cycleSeconds,
  timeModes,
} from "../src/daylight.js";
import { readProfile } from "../src/profile.js";
import { recordStreetlight, drawLampPools } from "../src/streetlights.js";

test("one driving day wraps continuously; each selectable period stays fixed", () => {
  for (const mode of timeModes.slice(1)) {
    const hour = solarHour(0, mode);
    assert.equal(solarHour(180, mode, true), hour);
    assert.equal(daylightAt(hour).label, mode);
  }
  assert.equal(solarHour(0, "Auto"), solarHour(cycleSeconds, "Auto"));
  assert.equal(daylightAt(solarHour(0, "Auto", true)).label, "Evening");
  const a = daylightAt(23.999),
    b = daylightAt(0);
  assert.ok(
    Math.hypot(...a.direction.map((c, i) => c - b.direction[i])) < 0.001,
  );
});
test("low angled light warms the afternoon and streetlamps fade on at dusk", () => {
  const [day, afternoon, evening, night] = timeModes
    .slice(1)
    .map((m) => daylightAt(solarHour(0, m)));
  assert.ok(
    day.direction[1] > afternoon.direction[1] &&
      afternoon.direction[1] > evening.direction[1],
  );
  assert.ok(afternoon.warmth > day.warmth && evening.golden > 0.5);
  assert.equal(day.lamps, 0);
  assert.equal(afternoon.lamps, 0);
  assert.ok(evening.lamps > 0.2);
  assert.equal(night.lamps, 1);
  for (let h = 16; h <= 24; h += 0.02)
    assert.ok(daylightAt(h).lamps <= daylightAt(h + 0.01).lamps + 1e-6);
});
test("existing saves retain the old daylight preference and new presets persist", () => {
  const previous = globalThis.localStorage;
  try {
    for (const [settings, want] of [
      [{ cycle: false }, "Day"],
      [{ cycle: true }, "Auto"],
      [{ timeOfDay: "Evening" }, "Evening"],
      [{}, "Auto"],
    ]) {
      globalThis.localStorage = {
        getItem: () => JSON.stringify({ version: 1, settings }),
      };
      assert.equal(readProfile().settings.timeOfDay, want);
    }
  } finally {
    if (previous) globalThis.localStorage = previous;
    else delete globalThis.localStorage;
  }
});
test("a streetlamp pool follows terrain grade and turns off when the pole is struck", () => {
  const lamps = [];
  const pole = { x: 12, z: 3, alive: true };
  const l = recordStreetlight(
    lamps,
    pole,
    4,
    0,
    -1,
    (x, z) => 0.12 * x + 0.06 * z,
  );
  assert.ok(
    l.cz < pole.z &&
      Math.abs(l.gx - 0.12) < 1e-8 &&
      Math.abs(l.gz - 0.06) < 1e-8,
  );
  let painted = 0;
  const ctx = {
    save() {},
    restore() {},
    transform() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    fillRect() {
      painted++;
    },
  };
  const project = (x, y, z) => [3 * x, z + y],
    visible = () => true;
  drawLampPools(ctx, lamps, 0, visible, project);
  assert.equal(painted, 0);
  drawLampPools(ctx, lamps, 1, visible, project);
  assert.equal(painted, 1);
  pole.alive = false;
  drawLampPools(ctx, lamps, 1, visible, project);
  assert.equal(painted, 1);
});
