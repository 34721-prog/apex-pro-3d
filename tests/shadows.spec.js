import { test, expect } from "@playwright/test";
import fs from "node:fs";
const dir = "tests/performance/shadows";
fs.mkdirSync(dir + "/visual", { recursive: true });
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?test=1");
  await page.waitForFunction(() => __game.world.assetsReady);
  await page.evaluate(() => {
    const g = __game;
    g.frame = () => {};
    g.save.settings.audio = false;
    g.save.settings.controlMode = "manual";
    g.save.settings.bots = 5;
    g.start();
    g.race.state = "racing";
    g.world.quality("medium");
    document.querySelector("#race-hud").style.visibility = "hidden";
    window.installShadowProbe = () => {
      window.depthPoses = new Map();
      window.colourPoses = new Map();
      for (const root of [...g.world.carMeshes, g.world.safetyMesh])
        root.traverse((o) => {
          if (o.isMesh) {
            o.onBeforeShadow = () =>
              depthPoses.set(o.uuid, {
                id: root.userData.driverId ?? "SC",
                matrix: o.matrixWorld.elements.slice(),
              });
            o.onBeforeRender = () =>
              colourPoses.set(o.uuid, {
                id: root.userData.driverId ?? "SC",
                matrix: o.matrixWorld.elements.slice(),
                casts: o.castShadow,
              });
          }
        });
    };
    window.shadowStep = (dt = 1 / 60, drivers = g.race.cars) => {
      depthPoses.clear();
      colourPoses.clear();
      g.world.render(dt, drivers, g.race.state);
      let errors = [],
        visible = [];
      for (const d of drivers) {
        const m = g.world.carById.get(d.id);
        if (
          m &&
          (Math.abs(m.matrixWorld.elements[12] - d.x) > 1e-6 ||
            Math.abs(m.matrixWorld.elements[14] - d.z) > 1e-6)
        )
          errors.push("Model differs from current physics: " + d.id);
      }

      for (const [id, c] of colourPoses) {
        if (c.casts) {
          const d = depthPoses.get(id);
          if (!d) errors.push("Missing current depth: " + c.id);
          else if (d.matrix.some((v, i) => Math.abs(v - c.matrix[i]) > 1e-9))
            errors.push("Stale matrix: " + c.id);
        }
        if (!visible.includes(c.id)) visible.push(c.id);
      }
      return {
        errors,
        visible,
        depthIds: [...new Set([...depthPoses.values()].map((d) => d.id))],
        draws: depthPoses.size,
        updates: g.world.dynamicShadows.updates,
        span: [g.world.dynamicShadows.spanX, g.world.dynamicShadows.spanY],
        resources: { ...g.world.renderer.info.memory },
      };
    };
    installShadowProbe();
  });
  return errors;
}

test("shadows: same-frame depth/colour in stop, acceleration, braking, turns, spin, all bots and cameras", async ({
  page,
}) => {
  const errors = await boot(page),
    results = [];
  const grid = await page.evaluate(() => shadowStep());
  expect(grid.depthIds.filter((id) => typeof id === "number")).toHaveLength(6);
  await page.screenshot({
    path: dir + "/visual/grid-side-by-side.jpg",
    type: "jpeg",
    quality: 90,
  });
  for (const quality of ["medium", "high"])
    for (const [label, input, speed] of [
      ["stopped", {}, 0],
      ["acceleration", { throttle: 1 }, 20],
      ["braking", { brake: 1 }, 45],
      ["left", { throttle: 0.5, steer: 1 }, 25],
      ["right", { throttle: 0.5, steer: -1 }, 25],
      ["spin", { steer: 1, brake: 0.4 }, 40],
    ]) {
      const data = await page.evaluate(
        ({ quality, label, input, speed }) => {
          const g = __game,
            w = g.world,
            r = g.race,
            p = r.cars[0];
          w.quality(quality);
          p.speed = speed;
          p.vx = Math.sin(p.heading) * speed;
          p.vz = Math.cos(p.heading) * speed;
          const rows = [];
          for (let n = 0; n < 12; n++) {
            r.step(1 / 60, input, false);
            if (label === "spin") p.heading += 0.22;
            rows.push(shadowStep());
          }
          return { label, quality, rows };
        },
        { quality, label, input, speed },
      );
      for (const row of data.rows) {
        expect(row.errors).toEqual([]);
        expect(row.draws).toBeGreaterThan(0);
      }
      results.push(data);
      if (quality === "medium")
        await page.screenshot({
          path: `${dir}/visual/${label}.jpg`,
          type: "jpeg",
          quality: 90,
        });
    }
  for (const camera of [
    "chase",
    "far",
    "cockpit",
    "broadcast",
    "pit-garage",
    "pit-wheels",
    "pit-lane",
    "safety-car",
    "grandstands",
  ]) {
    const row = await page.evaluate((camera) => {
      __game.world.cameraMode = camera;
      __game.world.cameraReady = false;
      return shadowStep();
    }, camera);
    expect(row.errors).toEqual([]);
    results.push({ camera, ...row });
    await page.screenshot({
      path: `${dir}/visual/camera-${camera}.jpg`,
      type: "jpeg",
      quality: 85,
    });
  }
  expect(errors).toEqual([]);
  fs.writeFileSync(
    dir + "/motion-cameras.json",
    JSON.stringify(results, null, 2),
  );
});

test("shadows: stable IDs, reordered grid, removed casters, restart, dt=0 and all circuits", async ({
  page,
}) => {
  const errors = await boot(page),
    rows = [];
  const identity = await page.evaluate(() => {
    const g = __game,
      r = g.race;
    const original = g.world.carMeshes.map((m) => ({
      id: m.userData.driverId,
      uuid: m.uuid,
    }));
    const reverse = [...r.cars].reverse();
    shadowStep(0, reverse);
    const matched = reverse.every((c) => {
      const m = g.world.carById.get(c.id);
      return m.position.x === c.x && m.position.z === c.z;
    });
    const removed = shadowStep(
      0,
      r.cars.filter((c) => c.id !== 2),
    );
    const hidden = !g.world.carById.get(2).visible;
    return { original, matched, hidden, removed };
  });
  expect(identity.matched).toBe(true);
  expect(identity.hidden).toBe(true);
  expect(identity.removed.depthIds).not.toContain(2);
  expect(identity.removed.errors).toEqual([]);
  for (const track of [
    "aurora",
    "veloce",
    "serpente",
    "neon",
    "titan",
    "vento",
    "sahara",
    "alpine",
    "emerald",
    "oldtown",
    "sunset",
    "nordic",
    "desert-night",
    "discovery",
    "aurora",
  ]) {
    const row = await page.evaluate(async (track) => {
      const g = __game;
      g.race = null;
      g.save.settings.track = track;
      g.start();
      await g.world.ready;
      g.race.state = "racing";
      g.world.cameraMode = "broadcast";
      installShadowProbe();
      document.querySelector("#race-hud").style.visibility = "hidden";
      const initial = shadowStep();
      g.world.quality("high");
      shadowStep();
      g.world.quality("medium");
      const final = shadowStep();
      return { track, initial, final, carCount: g.world.carMeshes.length };
    }, track);
    expect(row.carCount).toBe(6);
    expect(row.initial.errors).toEqual([]);
    expect(row.final.errors).toEqual([]);
    rows.push(row);
    if (["neon", "nordic", "vento", "sahara"].includes(track))
      await page.screenshot({
        path: `${dir}/visual/track-${track}.jpg`,
        type: "jpeg",
        quality: 85,
      });
  }
  expect(errors).toEqual([]);
  fs.writeFileSync(
    dir + "/identity-tracks.json",
    JSON.stringify({ identity, rows }, null, 2),
  );
});

test("shadows: real pit entry, queued approach, jacked service, release and merge", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const g = __game;
    g.race.cars[0].pit.requested = true;
    g.world.cameraMode = "pit-lane";
  });
  const phases = new Set(),
    rows = [];
  for (let chunk = 0; chunk < 140 && !phases.has("complete"); chunk++) {
    const data = await page.evaluate(() => {
      const g = __game,
        r = g.race,
        p = r.cars[0],
        states = [];
      for (let i = 0; i < 240; i++) {
        const old = p.pit.state;
        r.step(1 / 60, {}, true);
        if (old !== p.pit.state) {
          g.world.cameraReady = false;
          const result = shadowStep();
          states.push({
            state: p.pit.state,
            phase: p.pit.phase,
            x: p.x,
            z: p.z,
            result,
          });
          break;
        }
        if (
          p.pit.state === "service" &&
          p.pit.phase > 0.35 &&
          p.pit.phase < 0.7 &&
          !window.sawJacked
        ) {
          window.sawJacked = true;
          g.world.cameraMode = "pit-garage";
          g.world.cameraReady = false;
          states.push({
            state: "jacked",
            phase: p.pit.phase,
            y: (shadowStep(), g.world.carById.get(0).position.y),
            result: shadowStep(),
          });
          break;
        }
      }
      return { states, pit: p.pit.state, done: r.done };
    });
    for (const row of data.states) {
      expect(row.result.errors).toEqual([]);
      rows.push(row);
      if (!phases.has(row.state)) {
        phases.add(row.state);
        await page.screenshot({
          path: `${dir}/visual/pit-${row.state}.jpg`,
          type: "jpeg",
          quality: 90,
        });
      }
      if (row.state === "track" && phases.has("service"))
        phases.add("complete");
    }
    if (data.done) break;
  }
  expect(phases.has("entry")).toBe(true);
  expect(phases.has("service")).toBe(true);
  expect(phases.has("jacked")).toBe(true);
  expect(phases.has("exit")).toBe(true);
  expect(phases.has("complete")).toBe(true);
  expect(rows.find((r) => r.state === "jacked").y).toBeCloseTo(0.28);
  expect(errors).toEqual([]);
  fs.writeFileSync(dir + "/pit-shadows.json", JSON.stringify(rows, null, 2));
});

test("shadows: GPU image differential follows the vehicle; removal leaves no shadow pixels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const errors = await boot(page);
  const result = await page.evaluate(async () => {
    const g = __game,
      w = g.world,
      p = g.race.cars[0];
    p.speed = 0;
    w.cameraMode = "chase";
    w.cameraReady = false;
    w.quality("high");
    shadowStep(0.1, [p]);
    const meshes = [];
    w.carById.get(0).traverse((o) => {
      if (o.isMesh && o.castShadow) {
        meshes.push(o);
        o.material.colorWrite = false;
        o.material.depthWrite = false;
      }
    });
    const capture = (casters, drivers) => {
      for (const m of meshes) m.castShadow = casters;
      shadowStep(0, drivers);
      return w.renderer.domElement.toDataURL("image/png");
    };
    const projection = () => {
      const v = w.carById.get(0).position.clone();
      v.y = 0.12;
      v.project(w.camera);
      return {
        x: ((v.x + 1) / 2) * w.renderer.domElement.width,
        y: ((1 - v.y) / 2) * w.renderer.domElement.height,
      };
    };
    const empty = capture(true, []),
      onA = capture(true, [p]),
      offA = capture(false, [p]),
      a = projection();
    p.x += Math.cos(p.heading) * 2;
    p.z -= Math.sin(p.heading) * 2;
    const onB = capture(true, [p]),
      offB = capture(false, [p]),
      b = projection(),
      removed = capture(true, []);
    async function pixels(url) {
      const im = new Image();
      im.src = url;
      await im.decode();
      const c = document.createElement("canvas");
      c.width = im.width;
      c.height = im.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(im, 0, 0);
      return {
        width: im.width,
        data: ctx.getImageData(0, 0, im.width, im.height).data,
      };
    }
    const imgs = await Promise.all(
      [onA, offA, onB, offB, empty, removed].map(pixels),
    );
    function centroid(shadow, reference) {
      let count = 0,
        x = 0,
        y = 0;
      for (let i = 0; i < shadow.data.length; i += 4) {
        const delta =
          (reference.data[i] +
            reference.data[i + 1] +
            reference.data[i + 2] -
            shadow.data[i] -
            shadow.data[i + 1] -
            shadow.data[i + 2]) /
          3;
        if (delta > 12) {
          count++;
          x += (i / 4) % shadow.width;
          y += Math.floor(i / 4 / shadow.width);
        }
      }
      return { count, x: x / count, y: y / count };
    }
    const ca = centroid(imgs[0], imgs[1]),
      cb = centroid(imgs[2], imgs[3]);
    let ghostPixels = 0;
    for (let i = 0; i < imgs[4].data.length; i += 4)
      if (
        Math.max(
          ...[0, 1, 2].map((c) =>
            Math.abs(imgs[4].data[i + c] - imgs[5].data[i + c]),
          ),
        ) > 8
      )
        ghostPixels++;
    function worldPoint(c) {
      const v = w.camera.position
        .clone()
        .set(
          (c.x / w.renderer.domElement.width) * 2 - 1,
          1 - (c.y / w.renderer.domElement.height) * 2,
          0.5,
        )
        .unproject(w.camera)
        .sub(w.camera.position)
        .normalize();
      return w.camera.position
        .clone()
        .addScaledVector(v, (0.12 - w.camera.position.y) / v.y);
    }
    const wa = worldPoint(ca),
      wb = worldPoint(cb),
      delta = wb.clone().sub(wa);
    const worldError = Math.hypot(
      delta.x - Math.cos(p.heading) * 2,
      delta.z + Math.sin(p.heading) * 2,
    );
    return { ca, cb, a, b, worldError, ghostPixels, onA, onB, empty, removed };
  });
  for (const key of ["onA", "onB", "empty", "removed"]) {
    fs.writeFileSync(
      `${dir}/visual/pixels-${key}.png`,
      Buffer.from(result[key].split(",")[1], "base64"),
    );
    delete result[key];
  }
  fs.writeFileSync(dir + "/gpu-pixels.json", JSON.stringify(result, null, 2));
  expect(result.ca.count).toBeGreaterThan(100);
  expect(result.cb.count).toBeGreaterThan(100);
  expect(
    Math.hypot(result.cb.x - result.ca.x, result.cb.y - result.ca.y),
  ).toBeGreaterThan(15);
  expect(result.worldError).toBeLessThan(0.12);
  expect(result.ghostPixels).toBeLessThan(15);
  expect(errors).toEqual([]);
  fs.writeFileSync(dir + "/gpu-pixels.json", JSON.stringify(result, null, 2));
});

test("shadows: physical collision and surviving/retired vehicle use the current pose", async ({
  page,
}) => {
  const errors = await boot(page);
  const result = await page.evaluate(() => {
    const g = __game,
      r = g.race,
      p = r.cars[0],
      o = r.cars[1],
      sn = Math.sin(p.heading),
      cs = Math.cos(p.heading);
    o.x = p.x + sn * 6;
    o.z = p.z + cs * 6;
    o.s = p.s + 6;
    o.heading = p.heading;
    o.speed = o.vx = o.vz = 0;
    p.speed = 55;
    p.vx = sn * 55;
    p.vz = cs * 55;
    const before = p.impactCount || 0,
      frames = [];
    for (let i = 0; i < 45; i++) {
      r.step(1 / 60, { throttle: 1 }, false);
      if (i % 3 === 0) frames.push(shadowStep());
    }
    return {
      before,
      after: p.impactCount || 0,
      retired: !!p.retired,
      frames,
      modelVisible: g.world.carById.get(0).visible,
    };
  });
  expect(result.after).toBeGreaterThan(result.before);
  expect(result.modelVisible).toBe(true);
  for (const r of result.frames) expect(r.errors).toEqual([]);
  await page.screenshot({
    path: dir + "/visual/collision.jpg",
    type: "jpeg",
    quality: 90,
  });
  expect(errors).toEqual([]);
  fs.writeFileSync(dir + "/collision.json", JSON.stringify(result, null, 2));
});
