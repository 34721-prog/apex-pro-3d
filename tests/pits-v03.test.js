import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("tests/performance/v03", { recursive: true });
import { Race } from "../src/race.js";
import { at, curve, angle, configureTrack, length } from "../src/track.js";
import {
  bayFor,
  pitLayout,
  pitPoint,
  SERVICE_LANE,
} from "../src/strategy/PitLayout.js";
import { pitInput, mergeSafe, pitSession } from "../src/strategy/PitStop.js";
import {
  setPlan,
  serviceEstimate,
  strategyDecision,
} from "../src/strategy/PitStrategy.js";
import { overlap, collideBarrier } from "../src/racing/CollisionSystem.js";
import { defaults, validateSave } from "../src/save.js";
import { rewardRace } from "../src/progression.js";
import { graphicsConfig, observePerformance } from "../src/graphics/Quality.js";
const tracks = ["aurora", "veloce", "serpente", "neon", "titan", "vento"];
const measurements = [];
function fixture(track, same = false, weather = "dry") {
  configureTrack(track);
  const r = new Race({
    laps: 4,
    realism: "realistic",
    weather,
    tire: weather === "rain" ? "wet" : "medium",
  });
  r.state = "racing";
  for (const [i, c] of r.cars.entries()) {
    const s = length - 235 - i * 14,
      t = at(s);
    Object.assign(c, {
      x: t.p.x + t.right.x * 5,
      z: t.p.z + t.right.z * 5,
      s,
      previousS: s,
      index: -1,
      lateral: 5,
      heading: t.heading,
      velocityHeading: t.heading,
      speed: 28,
      vx: t.dir.x * 28,
      vz: t.dir.z * 28,
      progress: s - length,
    });
    c.pit.requested = true;
    if (same) c.teamId = 0;
  }
  return r;
}
for (const track of tracks)
  for (const mode of ["own", "same", "rain"])
    test(`physical garages ${track} / ${mode}: 6 cars, no pit overlap, queue drains`, () => {
      const r = fixture(
          track,
          mode === "same",
          mode === "rain" ? "rain" : "dry",
        ),
        prev = r.cars.map((c) => ({ x: c.x, z: c.z }));
      let services = 0,
        overlaps = 0,
        maxMotion = 0,
        maxAlignment = 0;
      for (let i = 0; i < 60 * 240; i++) {
        r.step(1 / 60, {}, true);
        const serviced = new Set();
        for (const c of r.cars) {
          const d = Math.hypot(c.x - prev[c.id].x, c.z - prev[c.id].z);
          maxMotion = Math.max(maxMotion, d);
          prev[c.id].x = c.x;
          prev[c.id].z = c.z;
          assert.ok(d < 1.4, "no teleport");
          if (c.pit.state === "service") {
            assert.ok(!serviced.has(c.teamId), "exclusive stall");
            serviced.add(c.teamId);
            const b = bayFor(c);
            assert.ok(Math.hypot(c.x - b.x, c.z - b.z) < 2.2);
            maxAlignment = Math.max(
              maxAlignment,
              Math.abs(angle(c.heading - b.heading)),
            );
            assert.ok(maxAlignment < 0.3);
            if (!c.checked) {
              services++;
              c.checked = true;
            }
            assert.equal(c.speed, 0);
          }
        }
        for (let a = 0; a < 6; a++)
          for (let b = a + 1; b < 6; b++)
            if (
              (r.cars[a].pit.state !== "track" ||
                r.cars[b].pit.state !== "track") &&
              overlap(r.cars[a], r.cars[b])
            )
              overlaps++;
        if (r.cars.every((c) => c.pit.stops === 1 && c.pit.state === "track"))
          break;
      }
      assert.equal(services, 6);
      assert.equal(overlaps, 0);
      assert.ok(
        r.cars.every((c) => c.pit.stops === 1 && c.pit.state === "track"),
      );
      assert.ok(r.cars.every((c) => c.pit.history.length === 1));
      assert.ok([...pitSession(r.cars).owners].every((n) => n === -1));
      measurements.push({
        track,
        mode,
        time: r.time,
        services,
        overlaps,
        maxMotion,
        maxAlignment,
      });
      fs.writeFileSync(
        "tests/performance/v03/pit-matrix.json",
        JSON.stringify(measurements, null, 2),
      );
    });
test("lookup geometry remains within 4 cm of source spline on all circuits", () => {
  for (const track of tracks) {
    configureTrack(track);
    for (let i = 0; i < 1100; i++) {
      const s = (length * i) / 1100;
      assert.ok(at(s).p.distanceTo(curve.getPointAt(i / 1100)) < 0.04);
    }
  }
});
test("safe merge predicts main-line arrivals and holds/releases without snapping", () => {
  configureTrack("aurora");
  const r = new Race({ laps: 3, botCount: 1 }),
    c = r.cars[0],
    other = r.cars[1];
  const t = at(247),
    p = pitPoint(247);
  Object.assign(c, {
    s: 247,
    x: p.x,
    z: p.z,
    heading: t.heading,
    lateral: 26,
    speed: 0,
  });
  c.pit.state = "exit";
  c.pit.laneElapsed = 20;
  other.s = 240;
  other.speed = 60;
  assert.equal(mergeSafe(c, r.cars), false);
  const pos = [c.x, c.z];
  const input = pitInput(c, 1 / 60, true, r.cars);
  assert.equal(input.throttle, 0);
  assert.equal(c.pit.mergeWaiting, true);
  assert.deepEqual([c.x, c.z], pos);
  other.s = 500;
  assert.equal(mergeSafe(c, r.cars), true);
  assert.ok(pitInput(c, 1 / 60, true, r.cars).throttle > 0);
});
test("pit speed penalty, entry gate, crew upgrades, locked work order and wear/weather plans", () => {
  const r = fixture("aurora"),
    c = r.cars[0];
  c.s = length - 80;
  c.pit.state = "track";
  assert.equal(
    pitInput(c, 1 / 60, false, r.cars),
    null,
    "late requests cannot cut across barrier",
  );
  c.pit.state = "entry";
  c.s = length - 40;
  c.speed = 26;
  c.pit.laneElapsed = 0;
  for (let i = 0; i < 40; i++) pitInput(c, 1 / 60, true, r.cars);
  assert.equal(c.penalty, 5);
  const slow = serviceEstimate(c);
  c.crewLevel = 5;
  assert.ok(serviceEstimate(c) < slow);
  assert.ok(slow - serviceEstimate(c) <= 1.21);
  c.pit.state = "service";
  c.pit.total = 1;
  c.pit.remaining = 0.01;
  c.pit.work = {
    compound: "hard",
    jobs: { tires: true, repair: false, fuel: false },
    fuelTarget: 1,
  };
  c.pit.compound = "soft";
  const fuel = c.fuel;
  c.damage = 0.3;
  pitInput(c, 1 / 60, true, r.cars);
  assert.equal(c.tires.compound, "hard");
  assert.equal(c.fuel, fuel);
  assert.equal(c.damage, 0.3);
  c.pit.state = "track";
  c.pit.requested = false;
  c.weather = "rain";
  c.lap = 0;
  strategyDecision(c, r.cars);
  assert.equal(c.pit.compound, "wet");
  assert.equal(c.pit.requested, true);
  setPlan(c, [0, 2, 2, 3, 99, NaN]);
  assert.deepEqual(c.pit.plan, [2, 3]);
});
test("main/pit separator and garage back wall are physical obstacles", () => {
  configureTrack("aurora");
  const r = new Race(),
    c = r.cars[0];
  let t = at(60),
    p = pitPoint(60, 15.2);
  Object.assign(c, { x: p.x, z: p.z, heading: t.heading, s: 60, index: -1 });
  collideBarrier(c);
  const distance = (c.x - t.p.x) * t.right.x + (c.z - t.p.z) * t.right.z;
  assert.ok(distance < 14);
  const bay = pitLayout()[0];
  t = at(bay.s);
  p = pitPoint(bay.s, 57);
  Object.assign(c, {
    x: p.x + t.dir.x * 9.2,
    z: p.z + t.dir.z * 9.2,
    heading: t.heading,
    s: bay.s,
    index: -1,
  });
  collideBarrier(c);
  assert.ok((c.x - t.p.x) * t.right.x + (c.z - t.p.z) * t.right.z < 56.5);
});
test("quality and strategy settings validate/persist; adaptive mode cannot mutate race", () => {
  const s = defaults();
  s.settings.quality = "custom";
  Object.assign(s.settings, {
    resolution: 0.65,
    shadows: 0,
    particles: 128,
    detail: 0.6,
    autoQuality: true,
    pitPlan: [2, 5],
  });
  s.team.pitStats = { stops: 4, bestService: 3.7, laneSeconds: 172 };
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
  const race = new Race(),
    before = JSON.stringify(race),
    world = {
      graphics: graphicsConfig(s.settings),
      adaptiveScale: 1,
      slowFrames: 0,
      perfSeconds: 0,
      applyResolution() {
        this.changed = true;
      },
    };
  for (let i = 0; i < 400; i++) observePerformance(world, 0.05, true);
  assert.ok(world.adaptiveScale < 1);
  assert.equal(JSON.stringify(race), before);
  assert.equal(graphicsConfig("low").shadows, 0);
  assert.equal(graphicsConfig("high").resolution, 1);
});
test("planned multistop run finishes and persists actual team service statistics once", () => {
  configureTrack("aurora");
  const r = new Race({ mode: "manager", laps: 5 });
  setPlan(r.cars[0], [2, 4]);
  r.cars[0].pit.compound = "hard";
  for (let i = 0; i < 60000 && !r.done; i++) r.step(1 / 60, {}, true);
  assert.ok(r.done);
  assert.ok(r.cars.every((c) => c.finished));
  assert.equal(r.cars[0].pit.stops, 2);
  const s = defaults();
  rewardRace(s, r);
  assert.equal(s.team.pitStats.stops, 2);
  assert.ok(s.team.pitStats.bestService >= 1.5);
  assert.equal(s.history[0].stops, 2);
  const old = s.team.pitStats.stops;
  rewardRace(s, r);
  assert.equal(s.team.pitStats.stops, old);
  assert.deepEqual(validateSave(s).team.pitStats, s.team.pitStats);
});
test("departing teammate cannot release a reservation already reassigned to another car", () => {
  configureTrack();
  const r = new Race({ mode: "manager" }),
    a = r.cars[0],
    b = r.cars[1];
  a.s = 309;
  a.lateral = 0;
  a.pit.state = "exit";
  a.pit.laneElapsed = 50;
  a.pit.waitTime = 0;
  b.pit.state = "service";
  pitSession(r.cars).owners[0] = b.id;
  pitInput(a, 1 / 60, false, r.cars);
  assert.equal(a.pit.state, "track");
  assert.equal(pitSession(r.cars).owners[0], b.id);
});
test("unrequested legal entry becomes a speed-controlled drive-through, not a free shortcut", () => {
  configureTrack();
  const r = new Race(),
    c = r.cars[0];
  c.s = length - 90;
  const t = at(c.s),
    p = pitPoint(c.s);
  Object.assign(c, { x: p.x, z: p.z, lateral: 25, heading: t.heading });
  assert.ok(pitInput(c, 1 / 60, false, r.cars));
  assert.equal(c.pit.state, "exit");
  assert.equal(c.pit.through, true);
  assert.equal(c.pit.stops, 0);
});
test("manual driver can authorize approach on the right once and complete physical service", () => {
  configureTrack();
  const r = new Race({ laps: 4, botCount: 1 }),
    c = r.cars[0];
  r.state = "racing";
  const s = length - 310,
    t = at(s);
  Object.assign(c, {
    s,
    previousS: s,
    progress: s - length,
    x: t.p.x + t.right.x * 6,
    z: t.p.z + t.right.z * 6,
    lateral: 6,
    heading: t.heading,
    velocityHeading: t.heading,
    speed: 30,
    index: -1,
  });
  c.pit.requested = true;
  for (let i = 0; i < 60 * 150 && c.pit.history.length === 0; i++)
    r.step(1 / 60, { throttle: 0.5, steer: 0 });
  assert.equal(c.pit.history.length, 1);
  assert.equal(c.pit.stops, 1);
  assert.equal(c.pit.state, "track");
  assert.equal(c.penalty, 0);
});
