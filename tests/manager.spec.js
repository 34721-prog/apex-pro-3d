import { test, expect } from "@playwright/test";
import fs from "node:fs";
const dir = "tests/performance/v08";
fs.mkdirSync(dir + "/visual", { recursive: true });
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto("/?test=1");
  await page.waitForFunction(() => __game.world.assetsReady);
  return errors;
}
const field = (page, id, k) =>
  page.locator(`[data-manager-car="${id}"][data-manager-field="${k}"]`);
async function shot(page, options) {
  await page.evaluate(() => {
    const g = __game;
    if (g.race) {
      g.world.cameraReady = false;
      g.world.render(0, g.race.cars, g.race.state);
      g.ui.lastHUD = -Infinity;
      g.ui.managerLast = -Infinity;
      g.ui.updateHUD(g.race, performance.now());
    }
  });
  await page.screenshot(options);
}
async function pump(page, n = 3000) {
  await page.evaluate((n) => {
    for (let i = 0; i < n && !__game.race.done; i++)
      __game.race.step(1 / 60, {}, false);
    __game.ui.updateHUD(__game.race, performance.now() + 1000);
    if (__game.race.done) __game.finish();
  }, n);
}
test("v08 plan both drivers, command live without pausing, physical stop, complete autonomous race and persist report", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = await boot(page);
  expect(await page.evaluate(() => __game.save.settings.controlMode)).toBe(
    "manager",
  );
  await page.evaluate(() => {
    __game.save.settings.realism = "realistic";
    __game.save.settings.laps = 5;
  });
  await page.locator("[data-nav=management]").click();
  await field(page, 0, "pace").selectOption("aggressive");
  await field(page, 1, "pace").selectOption("conserve");
  await page.locator('[data-manager-card="0"] .manager-plan>summary').click();
  await field(page, 0, "stopCount").selectOption("1");
  await page
    .locator('[data-manager-car="0"][data-manager-window="from"]')
    .fill("2");
  await page
    .locator('[data-manager-car="0"][data-manager-window="from"]')
    .press("Tab");
  await page
    .locator('[data-manager-car="0"][data-manager-window="compound"]')
    .selectOption("hard");
  await shot(page, {
    path: dir + "/visual/planning-two-drivers.jpg",
    type: "jpeg",
    quality: 85,
  });
  await page.locator("[data-nav=home]").first().click();
  await page.locator("[data-action=setup]").first().click();
  await page.locator("[data-action=start]").click();
  await expect(page.locator("[data-driving=manager]")).toBeVisible();
  await pump(page, 500);
  const before = await page.evaluate(() => __game.race.time);
  await field(page, 0, "pace").selectOption("balanced");
  await field(page, 0, "overtake").selectOption("aggressive");
  await page.locator("[data-action=pit-options]").click();
  expect(await page.evaluate(() => __game.race.state)).not.toBe("paused");
  await expect
    .poll(() => page.evaluate(() => __game.race.time))
    .toBeGreaterThan(before);
  expect(await page.evaluate(() => __game.race.cars[1].managerPlan.pace)).toBe(
    "conserve",
  );
  const rival = await page.evaluate(() =>
    JSON.stringify(__game.race.cars[2].managerPlan),
  );
  await field(page, 0, "pace").selectOption("maximum");
  expect(
    await page.evaluate(() => JSON.stringify(__game.race.cars[2].managerPlan)),
  ).toBe(rival);
  await page.locator("[data-manager-focus]").selectOption("1");
  for (const camera of ["overview", "battle", "chase", "pit-lane", "cockpit"]) {
    await page.locator("[data-pit-camera]").selectOption(camera);
    expect(await page.evaluate(() => __game.race.isDelegated())).toBe(true);
  }
  const cameraAttachment = await page.evaluate(() => {
    const g = __game;
    for (let i = 0; i < 120; i++) g.race.step(1 / 60, {});
    g.world.render(1 / 60, g.race.cars, g.race.state);
    const c = g.race.cars.find((c) => c.id === g.world.focusId);
    return Math.hypot(
      g.world.camera.position.x - c.x,
      g.world.camera.position.z - c.z,
    );
  });
  expect(cameraAttachment).toBeLessThan(0.5);
  await field(page, 0, "nextCompound").selectOption("hard");
  await page.locator('[data-action=manager-pit][data-id="0"]').click();
  expect(await page.evaluate(() => __game.race.cars[0].pit.requested)).toBe(
    true,
  );
  await page.evaluate(() => {
    const r = __game.race;
    r.manager.next = 0;
    r.manager.step(0);
    __game.action("manager-accept", { id: "0" });
  });
  expect(await page.evaluate(() => __game.race.cars[0].pit.requested)).toBe(
    true,
  );
  await page.locator('[data-action=manager-cancel][data-id="0"]').click();
  expect(await page.evaluate(() => __game.race.cars[0].pit.requested)).toBe(
    false,
  );
  await page.locator('[data-action=manager-pit][data-id="0"]').click();
  await shot(page, {
    path: dir + "/visual/live-orders.jpg",
    type: "jpeg",
    quality: 85,
  });
  for (let i = 0; i < 16; i++) {
    if (await page.evaluate(() => __game.race.done)) break;
    await pump(page);
  }
  expect(await page.evaluate(() => __game.race.done)).toBe(true);
  const result = await page.evaluate(() => ({
    manual: __game.race.manualControl,
    results: __game.race.results(),
    history: __game.save.managerHistory.at(-1),
  }));
  expect(result.manual).toBe(false);
  expect(result.results.find((c) => c.id === 0).stops).toBeGreaterThan(0);
  expect(result.history.initial[0].plan.pace).toBe("aggressive");
  expect(result.history.cars[0].stints.length).toBeGreaterThan(0);
  await page.locator("[data-action=manager-review]").click();
  await expect(page.locator(".manager-history")).toContainText("aurora");
  await page.reload();
  await page.waitForFunction(() => __game.world.assetsReady);
  expect(await page.evaluate(() => __game.save.managerHistory.length)).toBe(1);
  expect(errors).toEqual([]);
  fs.writeFileSync(dir + "/browser-race.json", JSON.stringify(result, null, 2));
});
test("v08 actual changing weather and controlled Safety Car support executable recommendations and simultaneous team changes", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const g = __game;
    g.frame = () => {};
    Object.assign(g.save.settings, {
      laps: 5,
      realism: "realistic",
      weatherProgram: "showers",
    });
    g.save.settings.managerPlans[0].automatic = false;
    g.save.settings.managerPlans[0].rain = "ask";
    g.start();
    for (let i = 0; i < 1500; i++) g.race.step(1 / 60, {});
    g.race.cars[0].tires.health = 0.5;
    g.race.control.neutralize(
      "sc",
      "Fixture de validação do diretor estratégico",
    );
    for (let i = 0; i < 120; i++) g.race.step(1 / 60, {});
    g.ui.updateHUD(g.race, performance.now() + 1000);
  });
  expect(await page.evaluate(() => __game.race.control.phase)).toBe("sc");
  await page.locator("[data-manager-focus]").selectOption("1");
  await field(page, 1, "pace").selectOption("conserve");
  await page.locator("[data-team-order]").selectOption("protect");
  await page.locator("[data-pit-camera]").selectOption("safety-car");
  await shot(page, {
    path: dir + "/visual/safety-car-strategy.jpg",
    type: "jpeg",
    quality: 85,
  });
  await page.evaluate(() => {
    const r = __game.race;
    for (let i = 0; i < 12000 && r.control.weather.wetness < 0.48; i++)
      r.step(1 / 60, {});
    r.manager.next = 0;
    r.manager.step(1 / 60);
    __game.ui.updateHUD(r, performance.now() + 2000);
  });
  const wet = await page.evaluate(() => ({
    wet: __game.race.control.weather.wetness,
    advice: __game.race.cars[0].strategyAdvice,
  }));
  expect(wet.wet).toBeGreaterThan(0.4);
  expect(wet.advice.key).toBe("rain");
  await field(page, 0, "nextCompound").selectOption("wet");
  await page.locator('[data-action=manager-accept][data-id="0"]').click();
  expect(await page.evaluate(() => __game.race.cars[0].pit.compound)).toBe(
    "wet",
  );
  expect(await page.evaluate(() => __game.race.cars[0].pit.requested)).toBe(
    true,
  );
  await shot(page, {
    path: dir + "/visual/weather-response.jpg",
    type: "jpeg",
    quality: 85,
  });
  fs.writeFileSync(dir + "/weather-browser.json", JSON.stringify(wet, null, 2));
  expect(errors).toEqual([]);
});
test("v08 explicit manual handover preserves physical state and management works on mobile", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    __game.start();
    __game.frame = () => {};
    for (let i = 0; i < 1200; i++) __game.race.step(1 / 60, {});
    __game.ui.updateHUD(__game.race, performance.now() + 1000);
  });
  await expect(page.locator("[data-touch=throttle]")).toBeHidden();
  const pose = await page.evaluate(() =>
    JSON.stringify(
      __game.race.cars.map((c) => [c.x, c.z, c.lap, c.managerPlan, c.pit]),
    ),
  );
  await page.locator("[data-action=manager-drive]").click();
  expect(await page.evaluate(() => __game.race.isDelegated())).toBe(false);
  expect(
    await page.evaluate(() =>
      JSON.stringify(
        __game.race.cars.map((c) => [c.x, c.z, c.lap, c.managerPlan, c.pit]),
      ),
    ),
  ).toBe(pose);
  await page.locator("[data-action=manager-drive]").click();
  expect(await page.evaluate(() => __game.race.isDelegated())).toBe(true);
  expect(
    await page.evaluate(() =>
      JSON.stringify(
        __game.race.cars.map((c) => [c.x, c.z, c.lap, c.managerPlan, c.pit]),
      ),
    ),
  ).toBe(pose);
  await field(page, 1, "pace").selectOption("aggressive");
  await page.locator("[data-manager-focus]").selectOption("1");
  expect(await page.evaluate(() => __game.race.manualControl)).toBe(false);
  const bounds = await page.locator(".manager-central").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  await shot(page, {
    path: dir + "/visual/mobile-manager.jpg",
    type: "jpeg",
    quality: 85,
  });
  expect(errors).toEqual([]);
});
test("v08 delegated championship reports survive reload and next session uses saved independent plans", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = await boot(page);
  await page.evaluate(() => {
    __game.frame = () => {};
    __game.save.settings.managerPlans[1].pace = "conserve";
    __game.store();
    __game.ui.navigate("competitions");
  });
  await page.locator("[data-action=league-open][data-id=sprint]").click();
  await page
    .locator("[data-action=league-start][data-id=sprint]:not([data-drive])")
    .click();
  await page.waitForFunction(() => __game.race?.manager);
  expect(await page.evaluate(() => __game.race.isDelegated())).toBe(true);
  for (let i = 0; i < 15; i++) {
    if (await page.evaluate(() => __game.race.done)) break;
    await pump(page);
  }
  expect(await page.evaluate(() => __game.race.done)).toBe(true);
  await expect(page.locator("[data-action=league-next]")).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => __game.world.assetsReady);
  const saved = await page.evaluate(
    () => __game.save.competitions.series.sprint.sessions[0],
  );
  expect(saved.strategy).toBeTruthy();
  expect(saved.strategy.initial[1].plan.pace).toBe("conserve");
  await page.evaluate(() => {
    __game.frame = () => {};
    __game.ui.navigate("competitions");
  });
  await page.locator("[data-action=league-open][data-id=sprint]").click();
  await page
    .locator("[data-action=league-start][data-id=sprint]:not([data-drive])")
    .click();
  await page.waitForFunction(() => __game.race?.manager);
  expect(await page.evaluate(() => __game.race.sessionType)).toBe("race");
  expect(await page.evaluate(() => __game.race.cars[1].managerPlan.pace)).toBe(
    "conserve",
  );
  for (let i = 0; i < 15; i++) {
    if (await page.evaluate(() => __game.race.done)) break;
    await pump(page);
  }
  expect(
    await page.evaluate(
      () => __game.save.competitions.series.sprint.results.length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() =>
      __game.save.competitions.series.sprint.results[0].results.some(
        (c) => c.points > 0,
      ),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
