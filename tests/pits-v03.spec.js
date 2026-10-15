import { test, expect } from "@playwright/test";
import fs from "node:fs";
fs.mkdirSync("tests/performance/v03", { recursive: true });
async function boot(page) {
  const errors = [],
    failed = [],
    cancelledMedia = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  page.on("requestfailed", (r) => {
    const error = r.failure()?.errorText;
    // Releasing a streaming deck or reloading intentionally cancels its request.
    // Keep evidence; only this exact media cancellation is not a missing asset.
    if (r.resourceType() === "media" && error === "net::ERR_ABORTED")
      cancelledMedia.push({ url: r.url(), error });
    else failed.push({ url: r.url(), error });
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
  });
  await page.goto("/?test=1");
  await page.waitForFunction(() => __game?.world.assetsReady);
  return { errors, failed, cancelledMedia };
}
test("live presets/custom save, pit plan UI and optional cameras do not change simulation", async ({
  page,
}) => {
  const log = await boot(page);
  await page.evaluate(() => {
    __game.save.settings.controlMode = "manual";
  });
  await page.locator("[data-action=settings]").click();
  expect(await page.locator("[data-setting=quality]").inputValue()).toBe(
    "medium",
  );
  for (const q of ["low", "medium", "high", "custom"]) {
    await page.locator("[data-setting=quality]").selectOption(q);
    expect(await page.evaluate(() => __game.world.qualityLevel)).toBe(q);
  }
  await page.locator("[data-setting=resolution]").selectOption("0.65");
  await page.locator("[data-setting=shadows]").selectOption("0");
  await page.locator("[data-setting=particles]").selectOption("128");
  await page.locator("[data-setting=autoQuality]").check();
  await page.reload();
  await page.waitForFunction(() => __game?.world.assetsReady);
  expect(await page.evaluate(() => __game.world.graphics.resolution)).toBe(
    0.65,
  );
  await page.evaluate(() => {
    Object.assign(__game.save.settings, {
      laps: 8,
      mode: "manager",
      realism: "realistic",
    });
    __game.start();
  });
  await page.locator("[data-action=pit-options]").click();
  await page.locator("#pit-plan").fill("2, 5");
  await page.locator("[data-action=pit-plan-save]").click();
  expect(await page.evaluate(() => __game.race.cars[0].pit.plan)).toEqual([
    2, 5,
  ]);
  await page.locator("[data-action=pit-options]").click();
  await page.locator("#pit-fuel-target").selectOption("0.5");
  await page.locator("[data-action=pit-compound][data-key=hard]").click();
  expect(await page.evaluate(() => __game.race.cars[0].pit.compound)).toBe(
    "hard",
  );
  expect(await page.evaluate(() => __game.race.cars[0].pit.fuelTarget)).toBe(
    0.5,
  );
  for (const cam of [
    "pit-lane",
    "pit-garage",
    "pit-follow",
    "pit-wheels",
    "chase",
  ]) {
    await page.locator("[data-pit-camera]").selectOption(cam);
    expect(await page.evaluate(() => __game.world.cameraMode)).toBe(cam);
  }
  expect(log.errors).toEqual([]);
  expect(log.failed).toEqual([]);
});
test("maximum grid physical stop, coordinated crew, all camera/preset pairs, few-bot finish", async ({
  page,
}) => {
  const log = await boot(page);
  const result = await page.evaluate(async () => {
    const g = __game;
    g.frame = () => {};
    await new Promise(requestAnimationFrame);
    Object.assign(g.save.settings, {
      mode: "manager",
      laps: 8,
      bots: 5,
      realism: "realistic",
    });
    g.start();
    g.race.cars[0].pit.requested = true;
    for (let i = 0; i < 18000 && g.race.cars[0].pit.state !== "service"; i++)
      g.race.step(1 / 60, {}, true);
    const c = g.race.cars[0];
    if (c.pit.state !== "service") throw Error("physical stop not reached");
    for (let i = 0; i < Math.floor(c.pit.total * 0.35 * 60); i++)
      g.race.step(1 / 60, {}, true);
    g.world.cameraMode = "pit-garage";
    g.world.cameraReady = false;
    g.world.render(1 / 60, g.race.cars, "racing");
    g.ui.updateHUD(g.race, performance.now() + 500);
    return {
      phase: c.pit.phase,
      hidden: g.world.carMeshes[0]._wheels.every((w) => !w.visible),
      matrix: Array.from(g.world.crew.bodies.instanceMatrix.array).slice(
        5 * 16,
        6 * 16,
      ),
      count: g.race.cars.length,
    };
  });
  expect(result.phase).toBeGreaterThan(0.3);
  expect(result.hidden).toBe(true);
  expect(result.count).toBe(6);
  await page.screenshot({
    path: "tests/performance/v03/service-animation.png",
  });
  const matrix = await page.evaluate(() => {
    const g = __game;
    for (let i = 0; i < 60; i++) g.race.step(1 / 60, {}, true);
    g.world.render(0.1, g.race.cars, "racing");
    return Array.from(g.world.crew.bodies.instanceMatrix.array).slice(
      5 * 16,
      6 * 16,
    );
  });
  expect(matrix).not.toEqual(result.matrix);
  const metrics = [];
  for (const q of ["low", "medium", "high", "custom"])
    for (const cam of [
      "chase",
      "cockpit",
      "far",
      "broadcast",
      "pit-lane",
      "pit-garage",
      "pit-follow",
      "pit-wheels",
    ]) {
      metrics.push(
        await page.evaluate(
          ({ q, cam }) => {
            const g = __game;
            const snapshot = JSON.stringify(g.race);
            g.world.quality(q);
            g.world.cameraMode = cam;
            g.world.cameraReady = false;
            g.world.render(0.1, g.race.cars, "racing");
            if (JSON.stringify(g.race) !== snapshot)
              throw Error("Graphics changed simulation");
            return {
              q,
              cam,
              calls: g.world.renderer.info.render.calls,
              triangles: g.world.renderer.info.render.triangles,
            };
          },
          { q, cam },
        ),
      );
    }
  expect(metrics.every((m) => m.calls > 0)).toBe(true);
  fs.writeFileSync(
    "tests/performance/v03/camera-quality-matrix.json",
    JSON.stringify(metrics, null, 2),
  );
  const end = await page.evaluate(() => {
    const g = __game;
    for (let i = 0; i < 12000 && g.race.cars[0].pit.state !== "track"; i++)
      g.race.step(1 / 60, {}, true);
    const stop = g.race.cars[0].pit.history[0];
    g.race = null;
    Object.assign(g.save.settings, { laps: 1, bots: 1, mode: "quick" });
    g.start();
    for (let i = 0; i < 30000 && !g.race.done; i++)
      g.race.step(1 / 60, {}, true);
    return {
      stop,
      done: g.race.done,
      finished: g.race.cars.filter((c) => c.finished).length,
    };
  });
  expect(end.stop.service).toBeGreaterThan(3);
  expect(end.done).toBe(true);
  expect(end.finished).toBe(2);
  expect(log.errors).toEqual([]);
  expect(log.failed).toEqual([]);
});
test("repeated race/menu, car catalogue and six-circuit resource lifecycle reaches plateau", async ({
  page,
}) => {
  const log = await boot(page);
  const data = await page.evaluate(async () => {
    const g = __game;
    g.frame = () => {};
    await new Promise(requestAnimationFrame);
    g.world.quality("low");
    const rows = [];
    // Load all 12 templates once, then repeat identical race/menu allocations.
    for (let i = 0; i < 12; i++) {
      g.world.setPreview(i);
      g.world.render(0.1);
    }
    for (let n = 0; n < 8; n++) {
      g.start();
      g.world.quality("low");
      g.world.render(0.1, g.race.cars, "racing");
      g.race = null;
      g.world.setMode("showcase");
      g.world.setPreview(0);
      g.world.render(0.1);
      rows.push({
        kind: "race-menu",
        n,
        ...g.world.renderer.info.memory,
        canvases: document.querySelectorAll("#world canvas").length,
      });
    }
    for (let n = 0; n < 12; n++) {
      const id = ["veloce", "serpente", "neon", "titan", "vento", "aurora"][
        n % 6
      ];
      g.switchTrack(id);
      await new Promise((resolve, reject) => {
        const start = performance.now();
        function check() {
          if (g.world.assetsReady) resolve();
          else if (performance.now() - start > 10000)
            reject(Error("GLB load timeout"));
          else setTimeout(check, 30);
        }
        check();
      });
      g.world.quality("low");
      g.world.render(0.1);
      rows.push({
        kind: "track",
        id,
        n,
        ...g.world.renderer.info.memory,
        canvases: document.querySelectorAll("#world canvas").length,
      });
    }
    return rows;
  });
  fs.writeFileSync(
    "tests/performance/v03/resource-lifecycle.json",
    JSON.stringify(data, null, 2),
  );
  expect(data.every((d) => d.canvases === 1)).toBe(true);
  const cycles = data.filter((d) => d.kind === "race-menu");
  expect(cycles.at(-1).geometries).toBe(cycles[1].geometries);
  expect(cycles.at(-1).textures).toBe(cycles[1].textures);
  for (const id of ["aurora", "veloce", "serpente", "neon", "titan", "vento"]) {
    const rows = data.filter((d) => d.id === id);
    expect(rows[1].geometries).toBe(rows[0].geometries);
    expect(rows[1].textures).toBe(rows[0].textures);
  }
  expect(log.errors).toEqual([]);
  expect(log.failed).toEqual([]);
});
