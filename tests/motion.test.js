import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { makeCar } from "../src/models.js";
import { createDriver, stepCar, recover } from "../src/racing/Physics.js";
import { Race } from "../src/race.js";
import { configureTrack, at, length, TRACK_WIDTH } from "../src/track.js";
import { FixedStep } from "../src/core/GameLoop.js";
import {
  beginVisualStep,
  endVisualStep,
  readVisualPose,
  createVisualPose,
  visualCut,
  serviceLift,
  resetVisualHistory,
  WHEEL_RADIUS,
} from "../src/graphics/VehicleMotion.js";
import {
  rigVehicle,
  applyVehiclePose,
  supportHeight,
  interpolationAddsOverlap,
  ROAD_HEIGHT,
  KERB_RISE,
} from "../src/graphics/VehiclePresentation.js";
const near = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const tick = (c, dt = 1 / 60) => {
  beginVisualStep(c);
  c.x += (c.vx || 0) * dt;
  c.z += (c.vz || 0) * dt;
  endVisualStep(c, dt);
};
const car = () => {
  const c = createDriver(0, "Probe", 600);
  Object.assign(c, { x: 0, z: 0, heading: 0, speed: 12, vx: 0, vz: 12 });
  return c;
};

test("motion observer is absent from save/authoritative car properties", () => {
  const c = car(),
    keys = Object.keys(c);
  tick(c);
  assert.deepEqual(Object.keys(c), keys);
  const before = JSON.stringify(c);
  for (let i = 0; i < 30; i++) readVisualPose(c, createVisualPose(), i / 30);
  assert.equal(JSON.stringify(c), before);
});
test("signed spin equals actual longitudinal travel / radius and does not advance on render", () => {
  const c = car();
  for (let i = 0; i < 60; i++) tick(c);
  let p = readVisualPose(c, createVisualPose());
  for (const s of p.spin) near(s, 12 / WHEEL_RADIUS);
  const s = p.spin[0];
  for (let i = 0; i < 100; i++) readVisualPose(c, p);
  near(p.spin[0], s);
  c.vz = -12;
  for (let i = 0; i < 60; i++) tick(c);
  near(readVisualPose(c, p).spin[0], 0);
});
test("stationary car has no rotation or invented oscillation", () => {
  const c = car();
  c.speed = c.vz = 0;
  for (let i = 0; i < 60; i++) tick(c);
  const p = readVisualPose(c, createVisualPose());
  assert.deepEqual([...p.spin], [0, 0, 0, 0]);
  near(p.roll, 0);
  near(p.pitch, 0);
});
test("interpolation uses exactly adjacent samples, has no accumulated lag", () => {
  const c = car();
  tick(c);
  const p = createVisualPose();
  near(readVisualPose(c, p, 0).z, 0);
  near(readVisualPose(c, p, 0.5).z, 0.1);
  near(readVisualPose(c, p, 1).z, 0.2);
  tick(c);
  near(readVisualPose(c, p, 0.5).z, 0.3);
});
test("angle and track-coordinate seams use shortest arcs", () => {
  const c = car();
  c.heading = Math.PI - 0.01;
  c.s = length - 0.1;
  c.vz = 0;
  c.speed = 0;
  beginVisualStep(c);
  c.heading = -Math.PI + 0.01;
  c.s = 0.1;
  endVisualStep(c, 1 / 60);
  const p = readVisualPose(c, createVisualPose(), 0.5);
  near(p.heading, Math.PI);
  assert.ok(Math.min(p.s, length - p.s) < 1e-7);
});
test("recover, external teleport and impact never interpolate through a discontinuity", () => {
  const c = car();
  tick(c);
  recover(c);
  assert.ok(visualCut(c));
  near(readVisualPose(c, createVisualPose(), 0.1).x, c.x);
  tick(c);
  beginVisualStep(c);
  c.x += 50;
  endVisualStep(c, 1 / 60);
  assert.ok(visualCut(c));
  near(readVisualPose(c, createVisualPose(), 0.1).x, c.x);
  beginVisualStep(c);
  c.impactCount = 1;
  endVisualStep(c, 1 / 60);
  assert.ok(visualCut(c));
});
test("30/60/144 Hz and batched ticks produce identical authoritative state and spin", () => {
  const out = [];
  for (const hz of [30, 60, 144]) {
    const c = car(),
      loop = new FixedStep();
    for (let i = 0; i < hz * 3; i++) loop.advance(1 / hz, (d) => tick(c, d));
    out.push({ z: c.z, spin: [...readVisualPose(c, createVisualPose()).spin] });
  }
  assert.deepEqual(out[0], out[1]);
  assert.deepEqual(out[0], out[2]);
});
test("real steering and acceleration/roll are bounded, rear pivots stay straight", () => {
  configureTrack("aurora");
  const c = createDriver(0, "Probe", 600),
    m = rigVehicle(makeCar());
  for (let i = 0; i < 45; i++) {
    beginVisualStep(c);
    stepCar(c, { throttle: 1, steer: 0.3 }, 1 / 60);
    endVisualStep(c, 1 / 60);
  }
  const p = readVisualPose(c, createVisualPose());
  assert.ok(p.steer > 0);
  assert.ok(Math.abs(p.roll) <= 0.026);
  assert.ok(Math.abs(p.pitch) <= 0.018);
  applyVehiclePose(m, c, p);
  for (const w of m._wheels) near(w.rotation.y, w.userData.front ? p.steer : 0);
  near(m.rotation.x, 0);
  near(m.rotation.z, 0);
});
test("steered wheel axle does not wobble over a full spin", () => {
  const m = rigVehicle(makeCar()),
    w = m._wheels.find((w) => w.userData.front);
  w.rotation.y = 0.3;
  const expected = new THREE.Vector3(1, 0, 0).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    0.3,
  );
  for (let i = 0; i <= 64; i++) {
    w._spin.rotation.x = (i * Math.PI) / 32;
    m.updateMatrixWorld(true);
    const axle = new THREE.Vector3(1, 0, 0).transformDirection(
      w._spin.matrixWorld,
    );
    near(axle.distanceTo(expected), 0);
  }
});
test("all 12 loaded GLBs retain all four articulated wheels and same geometry count", async () => {
  for (const file of fs.readdirSync("public/assets/cars/models")) {
    const b = fs.readFileSync("public/assets/cars/models/" + file);
    const loaded = await new GLTFLoader().parseAsync(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      "",
    );
    const m = loaded.scene;
    let meshes = 0;
    m.traverse((o) => {
      if (o.isMesh) meshes++;
    });
    rigVehicle(m);
    assert.equal(m._wheels.length, 4, file);
    assert.equal(new Set(m._wheels.map((w) => w._slot)).size, 4, file);
    let after = 0;
    m.traverse((o) => {
      if (o.isMesh) after++;
    });
    assert.equal(after, meshes);
    for (const w of m._wheels) assert.equal(w._spin.children.length, 1);
  }
});
test("procedural rig retains meshes, actual radius and four contact centers independent of body attitude", () => {
  const m = rigVehicle(makeCar()),
    c = car();
  c.lateral = 0;
  c.s = 600;
  const p = createVisualPose();
  Object.assign(p, { x: c.x, z: c.z, heading: 1.2, pitch: 0.018, roll: 0.026 });
  applyVehiclePose(m, c, p);
  m.updateMatrixWorld(true);
  for (const w of m._wheels) {
    const center = w.getWorldPosition(new THREE.Vector3());
    near(center.y - WHEEL_RADIUS, ROAD_HEIGHT);
    const box = new THREE.Box3().setFromObject(w);
    assert.ok(Math.abs(box.min.y - ROAD_HEIGHT) < 0.012);
  }
  near(m.position.y, 0.11);
});
test("kerb contact is footprint-local, only 3.5 cm, no texture-driven vibration; pit is .14", () => {
  configureTrack("aurora");
  near(supportHeight(600, 0), 0.12);
  near(supportHeight(600, TRACK_WIDTH / 2 + 0.75), 0.155);
  near(supportHeight(600, TRACK_WIDTH / 2 + 2.5), 0.095);
  near(supportHeight(26, 36), 0.14);
  near(supportHeight(600, 40), -0.06);
  for (let l = TRACK_WIDTH / 2 - 0.5; l < TRACK_WIDTH / 2 + 2; l += 0.01) {
    const h = supportHeight(600, l);
    assert.ok(h <= ROAD_HEIGHT + KERB_RISE + 1e-9);
    assert.ok(h >= 0.095 - 1e-9);
  }
});
test("service lift is continuous, bounded, shares real phase, retains established .28 plateau", () => {
  let prev = 0;
  for (let i = 0; i <= 1000; i++) {
    const l = serviceLift({ state: "service", phase: i / 1000 });
    assert.ok(l >= 0 && l <= 1);
    assert.ok(Math.abs(l - prev) < 0.02);
    prev = l;
  }
  near(serviceLift({ state: "track", phase: 0.5 }), 0);
  const m = rigVehicle(makeCar()),
    c = car();
  c.pit = { state: "service", phase: 0.5 };
  c.lateral = 0;
  c.s = 600;
  applyVehiclePose(m, c, createVisualPose());
  near(m.position.y, 0.28);
  assert.ok(m._wheels.every((w) => !w.visible));
});
test("invalid delta, pause and results cannot advance the authoritative race or odometer", () => {
  const r = new Race({ mode: "manager", management: true });
  r.state = "racing";
  r.step(1 / 60, {});
  for (const state of ["paused", "results"]) {
    r.state = state;
    const before = JSON.stringify(r.results()),
      time = r.time,
      p = readVisualPose(r.cars[0], createVisualPose());
    for (const dt of [NaN, -1, Infinity, 0, 1 / 60]) r.step(dt, {});
    assert.equal(r.time, time);
    assert.equal(JSON.stringify(r.results()), before);
    assert.deepEqual(readVisualPose(r.cars[0], createVisualPose()), p);
  }
});

test("pause/resume before the next tick cannot rewind the presented car or wheel phase", () => {
  const r = new Race({ mode: "manager", management: true });
  r.state = "racing";
  for (let i = 0; i < 150; i++) r.step(1 / 60, {});
  const c = r.cars[0],
    before = readVisualPose(c, createVisualPose());
  r.pause();
  r.pause();
  const after = readVisualPose(c, createVisualPose(), 0.01);
  near(after.x, c.x);
  near(after.z, c.z);
  assert.deepEqual(after.spin, before.spin);
});
test("interpolation cannot invent pair penetration or suppress real physical overlap", () => {
  const a = { x: -2, z: 0, heading: 0 },
    b = { x: 2, z: 0, heading: 0 };
  const va = Object.assign(Object.create(a), { x: -1 }),
    vb = Object.assign(Object.create(b), { x: 1 });
  assert.equal(interpolationAddsOverlap([va, vb]), true);
  va.x = a.x;
  vb.x = b.x;
  assert.equal(interpolationAddsOverlap([va, vb]), false);
  a.x = va.x = -1;
  b.x = vb.x = 1;
  assert.equal(interpolationAddsOverlap([va, vb]), false);
});
