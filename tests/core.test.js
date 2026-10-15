import { test } from "node:test";
import assert from "node:assert/strict";
import { length, at, closest, angle } from "../src/track.js";
import { createDriver, stepCar, recover, collisions } from "../src/physics.js";
test("closed circuit and projection agree", () => {
  assert.ok(length > 1000);
  for (let i = 0; i < 100; i++) {
    let s = (i / 100) * length,
      p = at(s).p,
      n = closest(p.x, p.z);
    let diff = Math.abs(n.s - s);
    assert.ok(Math.min(diff, length - diff) < 2);
    assert.ok(n.distance < 0.15);
  }
  assert.ok(at(0).p.distanceTo(at(length).p) < 0.001);
});
test("acceleration, brakes, progressive steering, offroad, recovery", () => {
  let p = createDriver(0, "Test", 0);
  for (let i = 0; i < 120; i++)
    stepCar(p, { throttle: 1, brake: 0, steer: 0 }, 1 / 60);
  assert.ok(p.speed > 30);
  let before = p.speed;
  for (let i = 0; i < 40; i++)
    stepCar(p, { throttle: 0, brake: 1, steer: 0 }, 1 / 60);
  assert.ok(p.speed < before - 20);
  p.speed = 30;
  let h = p.heading;
  stepCar(p, { throttle: 1, brake: 0, steer: 1 }, 1 / 60);
  assert.ok(angle(p.heading - h) > 0 && angle(p.heading - h) < 0.1);
  p.x += 30;
  stepCar(p, { throttle: 1, brake: 0, steer: 0 }, 1 / 60);
  recover(p);
  assert.ok(closest(p.x, p.z).distance < 0.1);
  assert.ok(p.speed <= 12);
});
test("collisions separate overlapping cars", () => {
  let a = createDriver(0, "a", 0),
    b = createDriver(1, "b", 1);
  collisions([a, b]);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2.24);
});
import { Race, updateProgress } from "../src/race.js";
test("checkpoint validation prevents start-line and wrong-way lap farming", () => {
  let c = createDriver(0, "a", length - 1);
  c.s = 1;
  updateProgress(c, 1 / 60, 1, 3);
  assert.equal(c.lap, 0);
  c.previousS = 1;
  c.s = length - 1;
  updateProgress(c, 1 / 60, 2, 3);
  assert.equal(c.lap, 0);
});
test("six physical cars complete 3 laps on all difficulties, no teleporting", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const race = new Race({ difficulty });
    let maxLateral = 0;
    for (let tick = 0; tick < 60 * 600 && !race.done; tick++) {
      race.step(1 / 60, { throttle: 0, brake: 0, steer: 0 }, true);
      maxLateral = Math.max(
        maxLateral,
        ...race.cars.map((c) => Math.abs(c.lateral)),
      );
    }
    console.log(
      difficulty,
      "duration",
      race.time.toFixed(2),
      "max lateral",
      maxLateral.toFixed(2),
      race.cars.map((c) => ({
        id: c.id,
        lap: c.lap,
        cp: c.checkpoint,
        time: c.finishTime,
      })),
    );
    assert.equal(race.done, true);
    assert.equal(race.cars[0].lap, 3);
    assert.ok(race.cars.filter((c) => c.finished).length >= 4);
    assert.ok(race.cars.every((c) => c.recoveries === 0));
    assert.ok(maxLateral < 12);
    assert.equal(race.standings().length, 6);
  }
});
test("missing input is neutral, never corrupts physics with NaN", () => {
  let c = createDriver(0, "safe", 0);
  stepCar(c, {}, 1 / 60);
  assert.equal(c.speed, 0);
  assert.ok(Number.isFinite(c.heading));
});
