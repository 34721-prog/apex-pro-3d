import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { Controls } from "../src/controls.js";
import { createDriver, stepCar } from "../src/physics.js";
import {
  configureTrack,
  at,
  length,
  barrierOffset,
  TRACK_WIDTH,
  angle,
} from "../src/track.js";
import { Race } from "../src/race.js";
import { defaults, validateSave } from "../src/save.js";
import { trackCatalog } from "../src/data/tracks.js";
import {
  validateTrack,
  trackPreview,
  generateCircuit,
} from "../src/data/TrackGeometry.js";
import { bayFor, pitPoint, signedPitS } from "../src/strategy/PitLayout.js";
import { mergeSafe } from "../src/strategy/PitStop.js";
import { overlap, collidePair } from "../src/racing/CollisionSystem.js";
import {
  defaultStrategy,
  validateStrategy,
  strategyOptions,
  policyFor,
  assignStrategy,
} from "../src/strategy/RaceStrategy.js";
import { botInput, laneClear, trafficRelevant } from "../src/ai.js";
import { strategyDecision } from "../src/strategy/PitStrategy.js";
import { RaceTiming } from "../src/racing/Timing.js";
import { gearFor, rpmFor, shiftNeeded } from "../src/racing/Telemetry.js";
const report = [];
function place(c, s, lane = 0, speed = 0) {
  s = (s + length) % length;
  const t = at(s);
  Object.assign(c, {
    s,
    previousS: s,
    progress: s - length,
    x: t.p.x + t.right.x * lane,
    z: t.p.z + t.right.z * lane,
    lateral: lane,
    heading: t.heading,
    velocityHeading: t.heading,
    speed,
    vx: t.dir.x * speed,
    vz: t.dir.z * speed,
    index: -1,
  });
}
test("human controls project left/right correctly through the real camera at 8/25/50 m/s", () => {
  configureTrack();
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const controls = new Controls(
    () => {},
    () => {},
  );
  const measurements = [];
  for (const speed of [8, 25, 50])
    for (const [key, sign] of [
      ["KeyA", -1],
      ["KeyD", 1],
      ["ArrowLeft", -1],
      ["ArrowRight", 1],
      ["neutral", 0],
    ]) {
      controls.clear();
      controls.keys.add(key);
      const c = createDriver(0, "human", 100);
      c.speed = speed;
      const t = at(c.s),
        camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
      camera.position.copy(t.p).addScaledVector(t.dir, -12);
      camera.position.y = 5;
      camera.lookAt(t.p.clone().addScaledVector(t.dir, 15));
      camera.updateMatrixWorld();
      for (let i = 0; i < 30; i++) stepCar(c, controls.input(), 1 / 60);
      const x = new THREE.Vector3(c.x, 0, c.z).project(camera).x;
      if (sign === 0) assert.ok(Math.abs(x) < 1e-8);
      else assert.equal(Math.sign(x), sign);
      measurements.push({ key, speed, screenX: x });
    }
  controls.configure({ bindings: { left: "KeyJ", right: "KeyL" } });
  controls.clear();
  controls.keys.add("KeyJ");
  assert.ok(controls.input().steer > 0);
  controls.clear();
  controls.keys.add("KeyL");
  assert.ok(controls.input().steer < 0);
  controls.clear();
  controls.touch.steer = -1;
  assert.ok(controls.input().steer > 0);
  controls.clear();
  assert.equal(controls.input().steer, 0);
  controls.keys.add("KeyW");
  assert.equal(controls.input().throttle, 1);
  controls.keys.add("KeyS");
  assert.equal(controls.input().brake, 1);
  controls.dispose();
  fs.writeFileSync(
    "tests/performance/v04/direction-after.json",
    JSON.stringify(measurements, null, 2),
  );
});
test("legacy steering workaround migrates once without erasing progression or alternate controls", () => {
  const s = defaults();
  s.credits = 8000;
  s.settings.invert = true;
  delete s.settings.steeringVersion;
  s.settings.bindings.left = "KeyD";
  s.settings.bindings.right = "KeyA";
  const migrated = validateSave(s);
  assert.equal(migrated.settings.invert, false);
  assert.equal(migrated.settings.bindings.left, "KeyA");
  assert.equal(migrated.credits, 8000);
  migrated.settings.invert = true;
  migrated.settings.bindings.left = "KeyJ";
  assert.deepEqual(validateSave(migrated), migrated);
});
test("AI retains world-yaw convention, slows for a stopped car and sees rejoining traffic", () => {
  configureTrack();
  const r = new Race({ botCount: 1 });
  place(r.cars[0], 100, -1.8, 45);
  place(r.cars[1], 150, -1.8, 0);
  const c = r.cars[0],
    o = r.cars[1];
  c.heading += 0.3;
  c.velocityHeading = c.heading;
  const input = botInput(c, r.cars, 1, "normal");
  assert.ok(input.steer < 0);
  assert.ok(input.brake > 0);
  o.pit.state = "exit";
  place(o, 275, 7, 15);
  assert.equal(trafficRelevant(o), true);
  place(o, 150, 26, 15);
  assert.equal(trafficRelevant(o), false);
});
test("all strategy fields validate, change operative policy, and persist", () => {
  const d = defaultStrategy();
  for (const [key, field] of Object.entries(strategyOptions))
    for (const [option] of field.options) {
      const s = defaults();
      s.settings.aiStrategy[key] = option;
      assert.deepEqual(
        validateSave(s).settings.aiStrategy,
        s.settings.aiStrategy,
      );
      assert.equal(validateStrategy({ [key]: "bad" })[key], d[key]);
      const p = policyFor(s.settings.aiStrategy);
      assert.ok(
        Object.values(p).every(
          (v) => typeof v === "boolean" || Number.isFinite(v),
        ),
      );
    }
  assert.ok(
    policyFor({ ...d, overtake: "very-aggressive" }).opportunity <
      policyFor({ ...d, overtake: "conservative" }).opportunity,
  );
  assert.ok(
    policyFor({ ...d, rejoin: "safe" }).mergeMargin >
      policyFor({ ...d, rejoin: "balanced" }).mergeMargin,
  );
});
function battle(strategy, behindDistance = 20) {
  configureTrack();
  const r = new Race({
    botCount: 1,
    strategy: { ...defaultStrategy(), ...strategy },
  });
  place(r.cars[0], 100, -1.8, 35);
  place(r.cars[1], 100 - behindDistance, -1.8, 43);
  r.cars[0].personality = {
    aggression: 0.85,
    precision: 0.85,
    overtaking: 0.75,
    consistency: 0.9,
    defense: 0.9,
    skill: 0.8,
  };
  botInput(r.cars[0], r.cars, 1);
  return r;
}
test("overtaking styles affect attempts, defense respects side-by-side space, no lane ping-pong", () => {
  const modes = [];
  for (const style of [
    "conservative",
    "balanced",
    "aggressive",
    "very-aggressive",
  ]) {
    const r = battle({ overtake: style }, -25);
    r.cars[0].ai = undefined;
    r.cars[1].speed = 35;
    botInput(r.cars[0], r.cars, 1);
    modes.push(r.cars[0].ai.mode);
  }
  assert.equal(modes[0], "line");
  assert.ok(modes.slice(1).includes("overtake"));
  const aggressive = battle({ defense: "aggressive" }, 24),
    avoid = battle({ defense: "avoid" }, 24),
    hold = battle({ defense: "hold" }, 32),
    balanced = battle({ defense: "balanced" }, 32),
    conservative = battle({ defense: "conservative" }, 11);
  assert.equal(aggressive.cars[0].ai.mode, "defend");
  assert.equal(avoid.cars[0].ai.mode, "line");
  assert.equal(hold.cars[0].ai.mode, "defend");
  assert.equal(balanced.cars[0].ai.mode, "line");
  assert.equal(conservative.cars[0].ai.mode, "defend");
  assert.equal(
    battle({ line: "defend", defense: "balanced" }, 25).cars[0].ai.mode,
    "defend",
  );
  assert.equal(
    battle({ line: "ideal", defense: "balanced" }, 25).cars[0].ai.mode,
    "line",
  );
  const r = battle({ defense: "aggressive" }, 3);
  place(r.cars[1], 103, 1.8, 43);
  assert.equal(laneClear(r.cars[0], r.cars, 3.5), false);
  const c = r.cars[0];
  for (let n = 0; n < 360; n++) botInput(c, r.cars, 1 + n / 60);
  assert.ok(c.ai.changes < 5);
  assert.ok(Math.abs(c.targetLane) <= TRACK_WIDTH / 2 - 2);
});
test("pace changes throttle/target speed without editing physical stats; line choices alter trajectories", () => {
  const targets = {};
  for (const pace of [
    "economy",
    "balanced",
    "attack",
    "recovery",
    "qualifying",
  ]) {
    const r = battle({ pace }, 60);
    place(r.cars[0], 700, -1.8, 35);
    r.cars[1].finished = true;
    r.cars[0].ai = undefined;
    const before = JSON.stringify(r.cars[0].stats),
      input = botInput(r.cars[0], r.cars, 1);
    targets[pace] = r.cars[0].aiTargetSpeed;
    assert.equal(JSON.stringify(r.cars[0].stats), before);
    if (pace === "economy") assert.ok(input.throttle <= 0.83);
  }
  assert.ok(
    targets.economy < targets.balanced &&
      targets.attack > targets.balanced &&
      targets.qualifying > targets.attack &&
      targets.recovery < targets.balanced,
  );
  const lanes = [];
  for (const line of ["ideal", "exit", "safe", "alternate", "defend"]) {
    const r = battle({ line }, 60);
    place(r.cars[0], 650, -1.8, 25);
    r.cars[1].finished = true;
    r.cars[0].ai = undefined;
    botInput(r.cars[0], r.cars, 1);
    lanes.push(r.cars[0].ai.lane);
  }
  assert.ok(new Set(lanes).size >= 3);
});
test("pit profiles/windows/traffic preferences produce different actual requests", () => {
  const request = (config, health, stack = false, flag = "green") => {
    const r = battle(config, 30),
      c = r.cars[0];
    c.realism = "realistic";
    c.plannedLaps = 8;
    c.tires.health = health;
    c.fuel = 100;
    c.flag = flag;
    if (stack) {
      r.cars[1].teamId = c.teamId;
      r.cars[1].pit.requested = true;
    }
    strategyDecision(c, r.cars);
    return c.pit.requested;
  };
  assert.equal(
    request({ pitProfile: "conservative", pitMode: "automatic" }, 0.29),
    true,
  );
  assert.equal(
    request({ pitProfile: "aggressive", pitMode: "automatic" }, 0.29),
    false,
  );
  assert.equal(
    request({ pitWindow: "early", pitMode: "automatic" }, 0.34),
    true,
  );
  assert.equal(
    request({ pitWindow: "late", pitMode: "automatic" }, 0.34),
    false,
  );
  assert.equal(request({ pitTraffic: "avoid-stack" }, 0.29, true), false);
  assert.equal(request({ pitTraffic: "queue" }, 0.29, true), true);
  assert.equal(request({ pitMode: "strategic" }, 0.37, false, "yellow"), true);
  assert.equal(request({ pitMode: "automatic" }, 0.37, false, "yellow"), false);
});
test("stationary service car is solid and cannot be pushed/ghosted through", () => {
  configureTrack();
  const r = new Race({ botCount: 1 }),
    a = r.cars[0],
    b = r.cars[1];
  place(a, 50, 36, 0);
  place(b, 45, 36, 25);
  a.pit.state = "service";
  const fixed = [a.x, a.z];
  assert.ok(collidePair(a, b));
  assert.deepEqual([a.x, a.z], fixed);
  assert.equal(overlap(a, b), null);
  assert.ok(b.speed < 25);
});
test("timed intervals and reference delta use timestamps, not a fixed speed divisor", () => {
  const a = { id: 0, progress: 0, s: 0, lap: 0 },
    b = { id: 1, progress: 0, s: 0, lap: 0 };
  const t = new RaceTiming([a, b], 1000);
  t.states[0].key[4] = 4;
  t.states[0].times[4] = 10;
  t.states[0].key[5] = 5;
  t.states[0].times[5] = 11;
  b.progress = 112.5;
  assert.equal(t.gap(a, b, 13), 2.5);
  b.speed = 999;
  assert.equal(t.gap(a, b, 13), 2.5);
  t.states[1].best = 100;
  t.states[1].reference[20] = 10;
  t.states[1].reference[21] = 10.5;
  b.s = 102.5;
  b.lapTime = 12;
  assert.equal(t.delta(b), 1.75);
  assert.equal(t.delta(a), null);
});
test("gear/RPM telemetry is bounded and shift indication corresponds to synthesized engine range", () => {
  const c = { speed: 0 };
  assert.equal(gearFor(c), 0);
  assert.equal(rpmFor(c), 1500);
  c.speed = 49;
  assert.equal(gearFor(c), 5);
  assert.ok(shiftNeeded(c));
  for (c.speed = 0; c.speed < 111; c.speed++) {
    assert.ok(rpmFor(c) <= 14000);
    assert.ok(gearFor(c) <= 8);
  }
});
test("procedural seeds reproduce geometry and reject/normalize unsafe parameters", () => {
  assert.deepEqual(generateCircuit(4107).points, generateCircuit(4107).points);
  assert.notDeepEqual(generateCircuit(4107).points, generateCircuit(42).points);
  for (const seed of [1, 42, 2718, 4107, 9001])
    assert.ok(
      validateTrack(generateCircuit(seed, { width: 11, stretch: 5 })).valid,
    );
  const invalid = {
    ...trackCatalog[0],
    points: [
      [0, 0],
      [100, 100],
      [0, 100],
      [100, 0],
    ],
  };
  assert.equal(validateTrack(invalid).valid, false);
});
for (const track of trackCatalog)
  test(`v0.4 circuit ${track.id}: geometry, own/shared pit, rain and high-traffic rejoin`, () => {
    const geometry = validateTrack(track);
    assert.ok(geometry.valid, geometry.errors.join(","));
    assert.ok(trackPreview(track).length > 2900);
    configureTrack(track.id);
    assert.equal(TRACK_WIDTH, track.width);
    for (const [key, direction] of [
      ["KeyA", -1],
      ["KeyD", 1],
    ]) {
      const ctl = new Controls(
        () => {},
        () => {},
      );
      ctl.keys.add(key);
      const c = createDriver(0, "track control", 100),
        t = at(100);
      c.speed = 20;
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
      camera.position.copy(t.p).addScaledVector(t.dir, -12);
      camera.position.y = 5;
      camera.lookAt(t.p.clone().addScaledVector(t.dir, 15));
      camera.updateMatrixWorld();
      for (let i = 0; i < 24; i++) stepCar(c, ctl.input(), 1 / 60);
      assert.equal(
        Math.sign(new THREE.Vector3(c.x, 0, c.z).project(camera).x),
        direction,
      );
      ctl.dispose();
    }

    for (const mode of ["own", "shared", "rain"]) {
      const r = new Race({
        laps: 4,
        realism: "realistic",
        weather: mode === "rain" ? "rain" : "dry",
        tire: mode === "rain" ? "wet" : "medium",
      });
      r.state = "racing";
      r.cars.forEach((c, i) => {
        place(c, length - 235 - i * 14, 5, 28);
        c.pit.requested = true;
        if (mode === "shared") c.teamId = 0;
      });
      let overlaps = 0,
        invasions = 0,
        maxMove = 0;
      const prev = r.cars.map((c) => ({ x: c.x, z: c.z }));
      for (let tick = 0; tick < 14400; tick++) {
        r.step(1 / 60, {}, true);
        for (const c of r.cars) {
          maxMove = Math.max(
            maxMove,
            Math.hypot(c.x - prev[c.id].x, c.z - prev[c.id].z),
          );
          prev[c.id].x = c.x;
          prev[c.id].z = c.z;
          const s = signedPitS(c.s);
          if (
            c.pit.state !== "track" &&
            s > -55 &&
            s < 195 &&
            c.lateral < barrierOffset() + 1.65
          )
            invasions++;
          if (c.pit.state === "service") {
            const bay = bayFor(c);
            assert.ok(Math.hypot(c.x - bay.x, c.z - bay.z) < 2.2);
          }
        }
        for (let i = 0; i < 6; i++)
          for (let j = i + 1; j < 6; j++)
            if (
              (r.cars[i].pit.state !== "track" ||
                r.cars[j].pit.state !== "track") &&
              overlap(r.cars[i], r.cars[j])
            )
              overlaps++;
        if (r.cars.every((c) => c.pit.stops > 0 && c.pit.state === "track"))
          break;
      }
      assert.ok(
        r.cars.every((c) => c.pit.stops > 0 && c.pit.state === "track"),
        JSON.stringify(r.cars.map((c) => [c.id, c.pit.state, c.s, c.speed])),
      );
      assert.equal(overlaps, 0);
      assert.equal(invasions, 0);
      assert.ok(maxMove < 1.4);
      report.push({
        id: track.id,
        mode,
        time: r.time,
        overlaps,
        invasions,
        maxMove,
        services: r.cars.reduce((n, c) => n + c.pit.stops, 0),
      });
    }
    const r = new Race({ laps: 4 });
    r.state = "racing";
    place(r.cars[0], 220, 26, 15);
    Object.assign(r.cars[0].pit, {
      state: "exit",
      through: true,
      laneElapsed: 0,
      waitTime: 0,
    });
    for (let i = 1; i < 6; i++) place(r.cars[i], 50 + (i - 1) * 65, 3.8, 62);
    let wait = false;
    for (let n = 0; n < 6000 && r.cars[0].pit.state !== "track"; n++) {
      r.step(1 / 60, {}, true);
      wait ||= r.cars[0].pit.mergeWaiting;
    }
    assert.equal(r.cars[0].pit.state, "track");
    assert.ok(wait);
    assert.equal(r.cars[0].damage, 0, "no merge contact");
    report.push({
      id: track.id,
      mode: "traffic",
      wait,
      time: r.time,
      damage: r.cars[0].damage,
    });
    fs.writeFileSync(
      "tests/performance/v04/track-pit-matrix.json",
      JSON.stringify(report, null, 2),
    );
  });
test("simulated gamepad axis sign/deadzone and Start toggle survive inactive pause UI", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let active = true,
    count = 0;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const pad = {
    axes: [0.8],
    buttons: Array.from({ length: 10 }, () => ({ value: 0, pressed: false })),
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [pad] },
  });
  try {
    const c = new Controls(
      () => {
        active = !active;
        count++;
      },
      () => {},
      { active: () => active },
    );
    assert.ok(c.input().steer < 0);
    pad.axes[0] = -0.8;
    assert.ok(c.input().steer > 0);
    pad.axes[0] = 0.03;
    assert.equal(c.input().steer, 0);
    pad.buttons[9].pressed = true;
    c.input();
    assert.equal(active, false);
    c.input();
    assert.equal(count, 1);
    pad.buttons[9].pressed = false;
    c.input();
    pad.buttons[9].pressed = true;
    c.input();
    assert.equal(active, true);
    assert.equal(count, 2);
    c.dispose();
  } finally {
    if (old) Object.defineProperty(globalThis, "navigator", old);
    else delete globalThis.navigator;
  }
});
test("AI recovers a moderate off-road excursion without relocation or permanent blockage", () => {
  configureTrack();
  const r = new Race({ botCount: 1 }),
    c = r.cars[0];
  r.state = "racing";
  r.cars[1].finished = true;
  place(c, 100, 12, 15);
  c.heading += 0.35;
  c.velocityHeading = c.heading;
  let last = { x: c.x, z: c.z };
  for (let i = 0; i < 60 * 9; i++) {
    r.step(1 / 60, {}, true);
    assert.ok(Math.hypot(c.x - last.x, c.z - last.z) < 1.4);
    last = { x: c.x, z: c.z };
  }
  assert.ok(Math.abs(c.lateral) < TRACK_WIDTH / 2 - 1);
  assert.ok(c.speed > 10);
});
