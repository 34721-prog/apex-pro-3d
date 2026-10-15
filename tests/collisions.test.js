import { test } from "node:test";
import assert from "node:assert/strict";
import { createDriver, stepCar } from "../src/physics.js";
import {
  collidePair,
  overlap,
  collideBarrier,
  HITBOX,
  BARRIER_OFFSET,
} from "../src/racing/CollisionSystem.js";
import { at } from "../src/track.js";
import { FixedStep } from "../src/core/GameLoop.js";
function car(id, x, z, h, s) {
  const c = createDriver(id, "test", 0);
  Object.assign(c, {
    x,
    z,
    heading: h,
    speed: s,
    vx: Math.sin(h) * s,
    vz: Math.cos(h) * s,
  });
  return c;
}
test("oriented hitboxes: front, rear, side and angled corner contacts resolve; no velocity explosion", () => {
  for (const pair of [
    [car(0, 0, 0, 0, 45), car(1, 0, 4.8, Math.PI, 45)],
    [car(0, 0, 0, 0, 50), car(1, 0, 5, 0, 20)],
    [car(0, 0, 0, Math.PI / 2, 30), car(1, 3, 0, 0, 10)],
    [car(0, 0, 0, 0, 50), car(1, 2.8, 3.2, Math.PI / 4, 25)],
  ]) {
    assert.ok(collidePair(...pair));
    assert.equal(overlap(...pair), null);
    assert.ok(pair.every((c) => c.speed <= 50 && Number.isFinite(c.speed)));
    assert.ok(pair.some((c) => c.damage > 0));
  }
});
test("barrier collision respects actual rail edge including body extent", () => {
  const c = createDriver(0, "test", 500),
    t = at(500);
  c.x = t.p.x + t.right.x * 15;
  c.z = t.p.z + t.right.z * 15;
  c.vx = t.right.x * 40;
  c.vz = t.right.z * 40;
  c.speed = 40;
  assert.ok(collideBarrier(c));
  assert.ok(Math.abs(c.lateral) + HITBOX.halfWidth < BARRIER_OFFSET);
  assert.ok(c.damage > 0);
  const damage = c.damage;
  for (let i = 0; i < 60; i++) collideBarrier(c);
  assert.equal(c.damage, damage);
});
test("fixed-step simulation matches 30, 60 and 144 FPS", () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    let c = createDriver(0, "fps", 0),
      loop = new FixedStep();
    for (let i = 0; i < fps * 2; i++)
      loop.advance(1 / fps, (dt) => stepCar(c, { throttle: 1 }, dt));
    results.push([c.x, c.z, c.speed]);
  }
  for (let i = 1; i < results.length; i++)
    for (let j = 0; j < 3; j++)
      assert.ok(Math.abs(results[0][j] - results[i][j]) < 1e-8);
});
