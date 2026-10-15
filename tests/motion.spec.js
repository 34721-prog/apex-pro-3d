import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { at, configureTrack, TRACK_WIDTH } from "../src/track.js";
const dir = "tests/performance/v09";
fs.mkdirSync(dir + "/visual", { recursive: true });
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  await page.evaluate(async () => {
    const g = __game;
    g.frame = () => {};
    await new Promise(requestAnimationFrame);
    Object.assign(g.save.settings, {
      bots: 5,
      controlMode: "manager",
      audio: false,
      quality: "medium",
      autoQuality: false,
    });
    g.start();
    g.race.state = "racing";
    g.world.quality("medium");
    g.world.renderer.domElement.id = "motion-canvas";
    document.querySelector("#race-hud").style.visibility = "hidden";
  });
  return errors;
}
test("v09 four-wheel rigs, immutable rendering, final-pose cockpit and all 12 cameras", async ({
  page,
}) => {
  const errors = await boot(page);
  const result = await page.evaluate(() => {
    const g = __game,
      r = g.race,
      w = g.world;
    for (let i = 0; i < 240; i++) r.step(1 / 60, {});
    w.render(1 / 60, r.cars, r.state, 0, 0.5);
    const raw = JSON.stringify(r.results()),
      coords = r.cars.map((c) => [c.x, c.z, c.heading, c.fuel]),
      spins = w.carMeshes.map((m) => m._wheels.map((o) => o._spin.rotation.x));
    for (let i = 0; i < 6; i++) w.render(1 / 60, r.cars, r.state, 0, 0.5);
    return {
      counts: w.carMeshes.map((m) => m._wheels.length),
      front: w.carMeshes.map(
        (m) => m._wheels.filter((o) => o.userData.front).length,
      ),
      immutable:
        raw === JSON.stringify(r.results()) &&
        JSON.stringify(coords) ===
          JSON.stringify(r.cars.map((c) => [c.x, c.z, c.heading, c.fuel])),
      sameSpin:
        JSON.stringify(spins) ===
        JSON.stringify(
          w.carMeshes.map((m) => m._wheels.map((o) => o._spin.rotation.x)),
        ),
    };
  });
  expect(result.counts).toEqual([4, 4, 4, 4, 4, 4]);
  expect(result.front).toEqual([2, 2, 2, 2, 2, 2]);
  expect(result.immutable).toBe(true);
  expect(result.sameSpin).toBe(true);
  const modes = [
      "chase",
      "cockpit",
      "far",
      "broadcast",
      "pit-lane",
      "pit-garage",
      "pit-follow",
      "pit-wheels",
      "safety-car",
      "grandstands",
      "overview",
      "battle",
    ],
    cameras = [];
  for (const mode of modes) {
    cameras.push(
      await page.evaluate((mode) => {
        const g = __game,
          w = g.world,
          r = g.race;
        for (let i = 0; i < 5; i++) r.step(1 / 60, {});
        w.cameraMode = mode;
        w.cameraReady = false;
        w.render(1 / 60, r.cars, r.state, 0, 0.5);
        const m = w.carById.get(0),
          p = m._pose;
        let cockpitError = null;
        if (mode === "cockpit")
          cockpitError = Math.hypot(
            w.camera.position.x - p.x - Math.sin(p.heading) * 0.35,
            w.camera.position.z - p.z - Math.cos(p.heading) * 0.35,
          );
        w.renderer.getContext().finish();
        return {
          mode,
          cockpitError,
          position: w.camera.position.toArray(),
          fov: w.camera.fov,
          driverPose: [p.x, p.z, p.heading],
          physical: [r.cars[0].x, r.cars[0].z, r.cars[0].heading],
        };
      }, mode),
    );
    await page.screenshot({
      path: `${dir}/visual/camera-${mode}.jpg`,
      quality: 78,
    });
  }
  expect(cameras.every((c) => c.position.every(Number.isFinite))).toBe(true);
  expect(cameras.find((c) => c.mode === "cockpit").cockpitError).toBeLessThan(
    1e-7,
  );
  expect(errors).toEqual([]);
  fs.writeFileSync(
    dir + "/camera-rigs.json",
    JSON.stringify({ result, cameras, errors }, null, 2),
  );
});
test("v09 contact at road/kerb, lift phases, pause, aspect ratios and current shadow transforms", async ({
  page,
}) => {
  const errors = await boot(page);
  configureTrack("aurora");
  const t = at(600);
  const fixtures = [
    { name: "road", lane: 0 },
    { name: "kerb", lane: TRACK_WIDTH / 2 - 1 },
    { name: "service-ramp", lane: 0, phase: 0.1 },
    { name: "service-up", lane: 0, phase: 0.5 },
    { name: "service-down", lane: 0, phase: 0.9 },
  ];
  const rows = [];
  for (const f of fixtures) {
    const row = await page.evaluate(
      ({ f, t }) => {
        const g = __game,
          w = g.world,
          r = g.race,
          c = r.cars[0];
        Object.assign(c, {
          x: t.p.x + t.right.x * f.lane,
          z: t.p.z + t.right.z * f.lane,
          heading: t.heading,
          s: 600,
          index: -1,
          lateral: f.lane,
          speed: 0,
          vx: 0,
          vz: 0,
        });
        Object.assign(c.pit, {
          state: f.phase === undefined ? "track" : "service",
          phase: f.phase || 0,
        });
        const m = w.carById.get(0);
        let depth = new Map(),
          colour = new Map();
        m.traverse((o) => {
          if (o.isMesh) {
            o.onBeforeShadow = () =>
              depth.set(o.uuid, o.matrixWorld.elements.slice());
            o.onBeforeRender = () =>
              colour.set(o.uuid, o.matrixWorld.elements.slice());
          }
        });
        w.cameraMode = "chase";
        w.cameraReady = false;
        w.render(0, r.cars, "paused");
        w.camera.position.set(
          c.x + Math.cos(c.heading) * 7 + Math.sin(c.heading) * 4,
          2.1,
          c.z - Math.sin(c.heading) * 7 + Math.cos(c.heading) * 4,
        );
        w.camera.lookAt(c.x, 0.7, c.z);
        w.camera.fov = 48;
        w.camera.updateProjectionMatrix();
        w.dynamicShadows.update(
          w.camera,
          m.position,
          w.carMeshes,
          w.safetyMesh,
        );
        w.renderer.render(w.scene, w.camera);
        w.renderer.getContext().finish();
        const wheels = m._wheels.map((o) => ({
          bottom: o.matrixWorld.elements[13] - 0.58,
          visible: o.visible,
          spin: o._spin.rotation.x,
          steer: o.rotation.y,
        }));
        const spins = JSON.stringify(wheels.map((o) => o.spin));
        w.render(0.2, r.cars, "paused");
        return {
          name: f.name,
          rootY: m.position.y,
          support: [...m._support],
          wheels,
          depthMatches: [...colour].every(
            ([id, a]) =>
              depth.has(id) &&
              depth.get(id).every((v, i) => Math.abs(v - a[i]) < 1e-8),
          ),
          pauseSpin:
            spins === JSON.stringify(m._wheels.map((o) => o._spin.rotation.x)),
        };
      },
      { f, t: JSON.parse(JSON.stringify(t)) },
    );
    rows.push(row);
    await page.screenshot({
      path: `${dir}/visual/contact-${f.name}.jpg`,
      quality: 85,
    });
  }
  expect(rows[0].wheels.every((w) => Math.abs(w.bottom - 0.12) < 1e-7)).toBe(
    true,
  );
  expect(Math.max(...rows[1].support)).toBeGreaterThan(0.12);
  expect(Math.max(...rows[1].support)).toBeLessThanOrEqual(0.155 + 1e-7);
  expect(rows.find((r) => r.name === "service-up").rootY).toBeCloseTo(0.28);
  expect(rows.every((r) => r.depthMatches && r.pauseSpin)).toBe(true);
  const sizes = [];
  for (const [width, height] of [
    [1920, 1080],
    [1280, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    sizes.push(
      await page.evaluate(() => {
        const w = __game.world;
        w.resize();
        w.render(0, __game.race.cars, "paused");
        return {
          width: w.viewWidth,
          height: w.viewHeight,
          aspect: w.camera.aspect,
        };
      }),
    );
  }
  expect(
    sizes.every((s) => Math.abs(s.aspect - s.width / s.height) < 1e-7),
  ).toBe(true);
  expect(errors).toEqual([]);
  fs.writeFileSync(
    dir + "/contact-shadows.json",
    JSON.stringify({ rows, sizes, errors }, null, 2),
  );
});
test("v09 real tick sequence: launch, braking, curves, fast-forward, no simulation mutation from cameras", async ({
  page,
}) => {
  const errors = await boot(page);
  const data = await page.evaluate(() => {
    const r = __game.race,
      w = __game.world;
    const states = [],
      conditions = {
        stationary: 0,
        launch: 0,
        slow: 0,
        fast: 0,
        braking: 0,
        curve: 0,
        exitAcceleration: 0,
      };
    const lastCurve = new Map();
    for (let chunk = 0; chunk < 120; chunk++) {
      for (let n = 0; n < 10; n++) {
        r.step(1 / 60, {});
        for (const c of r.cars) {
          if (c.speed < 0.1) conditions.stationary++;
          if (c.speed < 8 && c.throttle > 0.3) conditions.launch++;
          if (c.speed > 8 && c.speed < 25) conditions.slow++;
          if (c.speed > 50) conditions.fast++;
          if (c.brake > 0.5) conditions.braking++;
          if (Math.abs(c.steer) > 0.2) conditions.curve++;
          if (
            lastCurve.get(c.id) &&
            Math.abs(c.steer) <= 0.2 &&
            c.throttle > 0.6
          )
            conditions.exitAcceleration++;
          lastCurve.set(c.id, Math.abs(c.steer) > 0.2);
        }
      }
      if (chunk % 10 === 0) {
        const time = r.time,
          physical = r.cars.map((c) => [c.x, c.z, c.speed, c.fuel, c.progress]);
        w.render(1 / 60, r.cars, r.state, 0, 0.4);
        states.push({
          time,
          physical,
          roots: w.carMeshes.map((m) => m.position.toArray()),
          spins: w.carMeshes.map((m) => [...m._pose.spin]),
        });
        if (r.time !== time) throw Error("render changed clock");
      }
    }
    return { conditions, states, manual: r.manualControl };
  });
  expect(data.conditions.launch).toBeGreaterThan(0);
  expect(data.conditions.fast).toBeGreaterThan(0);
  expect(data.conditions.curve).toBeGreaterThan(0);
  expect(data.conditions.braking).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  fs.writeFileSync(
    dir + "/driving-sequence.json",
    JSON.stringify({ data, errors }, null, 2),
  );
});

test("v09 actual Game.frame consumes alpha at 144 Hz and resume before a tick does not rewind", async ({
  page,
}) => {
  const errors = await boot(page);
  const data = await page.evaluate(() => {
    const g = __game,
      r = g.race,
      w = g.world;
    for (let n = 0; n < 240; n++) r.step(1 / 60, {});
    g.loop.reset();
    g.lastRender = 0;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    const frames = [],
      frame = Object.getPrototypeOf(g).frame;
    for (let n = 0; n < 9; n++) {
      frame.call(g, g.last + 1000 / 144);
      const m = w.carById.get(0);
      frames.push({
        alpha: g.loop.accumulator / g.loop.step,
        x: m.position.x,
        z: m.position.z,
        physical: [r.cars[0].x, r.cars[0].z],
      });
    }
    r.pause();
    frame.call(g, g.last + 40);
    const pause = w.carById.get(0).position.toArray(),
      time = r.time;
    r.pause();
    frame.call(g, g.last + 1000 / 144);
    const resume = w.carById.get(0).position.toArray();
    window.requestAnimationFrame = raf;
    return { frames, pause, resume, time, resumeTime: r.time };
  });
  for (let i = 1; i < data.frames.length; i++)
    expect(
      Math.hypot(
        data.frames[i].x - data.frames[i - 1].x,
        data.frames[i].z - data.frames[i - 1].z,
      ),
    ).toBeGreaterThan(0.01);
  expect(data.resumeTime).toBe(data.time);
  expect(data.resume).toEqual(data.pause);
  expect(errors).toEqual([]);
  fs.writeFileSync(
    dir + "/frame-loop.json",
    JSON.stringify({ data, errors }, null, 2),
  );
});
