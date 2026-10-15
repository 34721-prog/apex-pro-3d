import { test, expect } from "@playwright/test";
import fs from "node:fs";
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
test("v0.4 real keyboard and camera projection, neutral/rebind/blur/pause", async ({
  page,
}) => {
  const log = await boot(page);
  await page.evaluate(() => {
    __game.save.settings.controlMode = "manual";
  });
  await page.evaluate(async () => {
    const g = __game;
    g.frame = () => {};
    await new Promise(requestAnimationFrame);
    g.save.settings.mode = "practice";
    g.start();
    g.race.state = "racing";
    g.world.cameraMode = "chase";
    g.world.cameraReady = false;
    g.world.render(0.1, g.race.cars, "racing");
    const c = g.race.cars[0];
    window.fixture = {
      x: c.x,
      z: c.z,
      s: c.s,
      previousS: c.s,
      progress: c.progress,
      lateral: c.lateral,
      heading: c.heading,
      velocityHeading: c.heading,
      speed: 20,
      vx: Math.sin(c.heading) * 20,
      vz: Math.cos(c.heading) * 20,
      steer: 0,
      throttle: 0,
      brake: 0,
      index: -1,
    };
    window.fixedCamera = g.world.camera.clone();
    fixedCamera.updateMatrixWorld();
  });
  for (const [key, sign] of [
    ["a", -1],
    ["d", 1],
    ["ArrowLeft", -1],
    ["ArrowRight", 1],
  ]) {
    await page.evaluate(() => {
      Object.assign(__game.race.cars[0], fixture);
      __game.controls.clear();
    });
    await page.keyboard.down(key);
    const x = await page.evaluate(() => {
      const g = __game;
      for (let i = 0; i < 25; i++) g.race.step(1 / 60, g.controls.input());
      const c = g.race.cars[0],
        v = g.world.camPoint.clone().set(c.x, 0, c.z).project(fixedCamera);
      g.world.render(0.1, g.race.cars, "racing");
      if (Math.abs(g.world.carMeshes[0].rotation.y - c.heading) > 1e-8)
        throw Error("visual orientation mismatch");
      return v.x;
    });
    await page.keyboard.up(key);
    expect(Math.sign(x)).toBe(sign);
    expect(await page.evaluate(() => __game.controls.input().steer)).toBe(0);
  }
  await page.evaluate(() =>
    __game.controls.configure({ bindings: { left: "KeyJ", right: "KeyL" } }),
  );
  await page.keyboard.down("j");
  expect(
    await page.evaluate(() => __game.controls.input().steer),
  ).toBeGreaterThan(0);
  await page.keyboard.up("j");
  await page.keyboard.down("w");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect(await page.evaluate(() => __game.controls.input().throttle)).toBe(0);
  expect(await page.evaluate(() => __game.race.state)).toBe("paused");
  await page.keyboard.up("w");
  expect(log.errors).toEqual([]);
  expect(log.failed).toEqual([]);
});
test("v0.4 HUD fits target resolutions, persistent modes/strategy, timing and event alerts", async ({
  page,
}) => {
  const log = await boot(page);
  await page.evaluate(() => {
    __game.save.settings.controlMode = "manual";
  });
  await page.evaluate(() => {
    __game.save.settings.laps = 3;
    __game.start();
    for (let i = 0; i < 301; i++) __game.race.step(1 / 60, {});
    __game.ui.updateHUD(__game.race, performance.now() + 500);
  });
  await expect(page.locator("#race-message")).toContainText("LARGADA");
  const panels = [
    ".hud-top",
    ".hud-tower",
    ".hud-map",
    ".hud-resources",
    ".hud-car",
    ".hud-strategy-slot",
    ".hud-toolbar",
  ];
  const matrix = [];
  for (const [w, h] of [
    [1920, 1080],
    [1600, 900],
    [1366, 768],
    [1280, 720],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const metrics = await page.evaluate((panels) => {
      const rows = panels.map((sel) => {
        const el = document.querySelector(sel),
          r = el.getBoundingClientRect();
        return {
          sel,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      });
      const overlaps = [];
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          const a = rows[i],
            b = rows[j];
          if (
            Math.min(a.right, b.right) - Math.max(a.x, b.x) > 2 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 2
          )
            overlaps.push([a.sel, b.sel]);
        }
      return {
        rows,
        overlaps,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    }, panels);
    expect(metrics.overflow).toBe(false);
    expect(
      metrics.rows.every(
        (r) => r.x >= 0 && r.y >= 0 && r.right <= w + 1 && r.bottom <= h + 1,
      ),
    ).toBe(true);
    expect(metrics.overlaps).toEqual([]);
    matrix.push({ w, h, ...metrics });
    await page.screenshot({ path: `tests/performance/v04/hud-${w}x${h}.png` });
  }
  fs.writeFileSync(
    "tests/performance/v04/resolution-matrix.json",
    JSON.stringify(matrix, null, 2),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator(".race-strategy").evaluate((n) => (n.open = true));
  await page
    .locator('[data-manager-car="0"][data-manager-field=overtake]')
    .selectOption("very-aggressive");
  await page
    .locator('[data-manager-car="0"][data-manager-field=defense]')
    .selectOption("exit");
  await page
    .locator('[data-manager-car="0"][data-manager-field=pace]')
    .selectOption("conserve");
  expect(
    await page.evaluate(
      () =>
        __game.race.cars[0].managerTarget.throttle === 0.83 &&
        __game.race.cars[2].managerPlan.pace === "balanced",
    ),
  ).toBe(true);
  await page.screenshot({ path: "tests/performance/v04/strategy-open.png" });
  await page.locator("[data-action=hud-mode]").click();
  expect(await page.locator("#race-hud").getAttribute("data-mode")).toBe(
    "compact",
  );
  await page.locator("[data-action=hud-mode]").click();
  expect(await page.locator("#race-hud").getAttribute("data-mode")).toBe(
    "immersive",
  );
  await expect(page.locator(".hud-tower")).toBeHidden();
  await page.locator("[data-action=hud-mode]").click();
  const timing = await page.evaluate(() => {
    const g = __game;
    const row = document.querySelector('[data-car="0"]');
    for (let i = 0; i < 20000 && g.race.cars[0].lap < 1; i++)
      g.race.step(1 / 60, {}, true);
    g.ui.updateHUD(g.race, performance.now() + 2000);
    return {
      same: row === document.querySelector('[data-car="0"]'),
      best: document.getElementById("hud-best").textContent,
      delta: document.getElementById("hud-delta").textContent,
      lap: g.race.cars[0].lap,
    };
  });
  expect(timing.same).toBe(true);
  expect(timing.lap).toBe(1);
  expect(timing.best).not.toBe("—");
  expect(timing.delta).not.toBe("—");
  await page.reload();
  await page.waitForFunction(() => __game?.world.assetsReady);
  expect(
    await page.evaluate(() => __game.save.settings.managerPlans[0].pace),
  ).toBe("conserve");
  expect(await page.evaluate(() => __game.save.settings.strategyOpen)).toBe(
    true,
  );
  expect(log.errors).toEqual([]);
  expect(log.failed).toEqual([]);
  fs.writeFileSync(
    "tests/performance/v07/media-navigation.json",
    JSON.stringify(log, null, 2),
  );
});
test("v0.4 all fourteen circuits select, load geometry, complete races, render minimaps and persist records", async ({
  page,
}) => {
  test.setTimeout(300000);
  const log = await boot(page);
  await page.getByRole("button", { name: "Circuitos", exact: true }).click();
  await expect(page.locator(".circuit-card")).toHaveCount(14);
  const ids = await page
    .locator(".circuit-card")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.trackId));
  const outlines = await page
    .locator(".circuit-thumb polyline:last-of-type")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("points")));
  expect(new Set(outlines).size).toBe(14);
  await page.screenshot({ path: "tests/performance/v04/circuit-selector.png" });
  await page.evaluate(async () => {
    __game.frame = () => {};
    await new Promise(requestAnimationFrame);
  });
  const results = [];
  for (const id of ids) {
    await page.locator(`[data-action=choose-track][data-id="${id}"]`).click();
    await page.waitForFunction(
      (id) => !__game.loadingTrack && __game.save.settings.track === id,
      id,
    );
    await expect(page.locator("#track-loading")).toHaveCount(0);
    const overview = await page.evaluate(() => {
      const g = __game;
      g.world.quality("low");
      g.world.render(0.1);
      return {
        mode: g.world.mode,
        far: g.world.camera.far,
        ready: g.world.assetsReady,
        calls: g.world.renderer.info.render.calls,
      };
    });
    expect(overview.mode).toBe("track-preview");
    expect(overview.far).toBe(6000);
    expect(overview.ready).toBe(true);
    expect(overview.calls).toBeGreaterThan(0);
    results.push(
      await page.evaluate(() => {
        const g = __game;
        Object.assign(g.save.settings, { laps: 1, bots: 5, mode: "manager" });
        g.start();
        g.world.quality("low");
        const r = g.race;
        for (let i = 0; i < 36000 && !r.done; i++) r.step(1 / 60, {}, true);
        g.world.render(0.1, r.cars, r.state);
        g.ui.updateHUD(r, performance.now() + 500);
        const map = g.ui.mapTrack,
          canvas = document.getElementById("minimap"),
          pixels = canvas.getContext("2d").getImageData(0, 0, 420, 270).data;
        const ink = pixels.some((v, i) => i % 4 === 3 && v > 0);
        const road = g.world.scene.children.find(
            (o) =>
              o.geometry?.attributes.position?.count > 3000 &&
              o.material === g.world.roadMaterial,
          ),
          pos = road.geometry.attributes.position,
          width = Math.hypot(
            pos.getX(0) - pos.getX(1),
            pos.getZ(0) - pos.getZ(1),
          );
        g.finish();
        const result = {
          id: r.trackId,
          finished: r.cars.filter((c) => c.finished).length,
          done: r.done,
          time: r.time,
          width,
          map,
          ink,
          record: g.save.records[r.trackId + ":arcade:dry"],
          canvases: document.querySelectorAll("#world canvas").length,
        };
        g.ui.closeModal();
        g.ui.navigate("tracks");
        return result;
      }),
    );
  }
  expect(
    results.every(
      (r) =>
        r.finished === 6 &&
        r.done &&
        r.ink &&
        r.map === r.id &&
        r.record > 0 &&
        r.canvases === 1,
    ),
  ).toBe(true);
  expect(
    new Set(results.map((r) => Math.round(r.width))).size,
  ).toBeGreaterThanOrEqual(4);
  fs.writeFileSync(
    "tests/performance/v04/browser-circuit-matrix.json",
    JSON.stringify(results, null, 2),
  );
  await page.reload();
  await page.waitForFunction(() => __game?.world.assetsReady);
  expect(
    await page.evaluate(() => Object.keys(__game.save.records).length),
  ).toBe(14);
  await page.getByRole("button", { name: "Circuitos", exact: true }).click();
  await page
    .locator('[data-action=track-filter][data-category="Noite"]')
    .click();
  await expect(page.locator(".circuit-card")).toHaveCount(2);
  await page
    .locator('[data-action=track-filter][data-category="Procedurais"]')
    .click();
  await expect(page.locator(".circuit-card")).toHaveCount(1);
  expect(log.errors).toEqual([]);
  expect(log.failed).toEqual([]);
});
