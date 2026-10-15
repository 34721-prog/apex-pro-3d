import { test, expect } from "@playwright/test";
import fs from "node:fs";
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?test=1");
  await page.waitForFunction(() => __game?.world.assetsReady);
  return errors;
}
test("v0.5 full Sprint season via real menu/session/next/save/archive, no duplicate awards", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = await boot(page);
  await page.locator(".competition-nav [data-nav=competitions]").click();
  await expect(page.locator(".series-card")).toHaveCount(7);
  await page.locator("[data-action=league-open][data-id=sprint]").click();
  await page.screenshot({
    path: "tests/performance/v05/competitions.png",
    fullPage: true,
  });
  await page
    .locator("[data-action=league-start][data-id=sprint]")
    .filter({ hasText: "CHEFE" })
    .click();
  for (let session = 0; session < 6; session++) {
    await page.waitForFunction(
      () =>
        __game?.race && !__game.loadingTrack && __game.race.state !== "results",
    );
    const result = await page.evaluate(async () => {
      const g = __game;
      g.frame = () => {};
      await new Promise(requestAnimationFrame);
      for (let i = 0; i < 90000 && !g.race.done; i++)
        g.race.step(1 / 60, {}, false);
      g.finish();
      const before = JSON.stringify(g.save);
      g.finish();
      return {
        done: g.race.done,
        count: g.race.cars.filter((c) => c.finished).length,
        same: before === JSON.stringify(g.save),
        phase: g.race.sessionType,
      };
    });
    expect(result.done).toBe(true);
    expect(result.count).toBe(6);
    expect(result.same).toBe(true);
    await expect(page.locator("[aria-label=league-results]")).toBeVisible();
    if (session === 1)
      await page.screenshot({
        path: "tests/performance/v05/official-results.png",
      });
    if (session < 5) await page.locator("[data-action=league-next]").click();
  }
  expect(
    await page.evaluate(
      () => __game.save.competitions.series.sprint.results.length,
    ),
  ).toBe(3);
  await page.locator("[data-action=league-home]").click();
  await page.screenshot({
    path: "tests/performance/v05/season-complete.png",
    fullPage: true,
  });
  await page.reload();
  await page.waitForFunction(() => __game?.world.assetsReady);
  await page.locator(".competition-nav [data-nav=competitions]").click();
  await expect(page.locator("[data-action=league-new]")).toBeVisible();
  await page.locator("[data-action=league-new]").click();
  await page.locator("[data-action=league-new-confirm]").click();
  expect(
    await page.evaluate(() => __game.save.competitions.series.sprint.season),
  ).toBe(2);
  expect(
    await page.evaluate(
      () => __game.save.competitions.series.sprint.history.length,
    ),
  ).toBe(1);
  await page.locator(".competition-nav [data-nav=calendar]").click();
  await expect(page.locator(".calendar-page section")).toHaveCount(3);
  await page.locator(".competition-nav [data-nav=news]").click();
  await page.locator(".competition-nav [data-nav=regulations]").click();
  await expect(page.locator(".rule-grid article")).toHaveCount(8);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".competition-nav [data-nav=competitions]").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "tests/performance/v05/competitions-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("v0.5 physical Safety Car visible, live race control, weather, journal and team controls", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await page.evaluate(async () => {
    const g = __game;
    g.frame = () => {};
    await new Promise(requestAnimationFrame);
    Object.assign(g.save.settings, { mode: "manager", laps: 12 });
    g.start();
    for (let i = 0; i < 1000; i++) g.race.step(1 / 60, {}, false);
    g.race.control.neutralize("sc", "Intervenção identificada de teste");
    for (let i = 0; i < 18000 && g.race.control.sc.state !== "train"; i++)
      g.race.step(1 / 60, {}, false);
    g.world.cameraMode = "safety-car";
    g.world.cameraReady = false;
    g.world.render(0.1, g.race.cars, g.race.state);
    g.ui.updateHUD(g.race, performance.now() + 500);
  });
  expect(
    await page.evaluate(
      () =>
        __game.world.safetyMesh.visible &&
        __game.race.control.sc.state === "train",
    ),
  ).toBe(true);
  await expect(page.locator("#hud-director-flag")).toContainText("SAFETY CAR");
  const camera = await page.evaluate(() => {
    const w = __game.world,
      c = __game.race.control.sc.car;
    return Math.hypot(w.camera.position.x - c.x, w.camera.position.z - c.z);
  });
  expect(camera).toBeLessThan(20);
  await page.screenshot({ path: "tests/performance/v05/safety-car.png" });
  await page.locator(".race-strategy").evaluate((n) => (n.open = true));
  await page.locator("[data-team-order]").selectOption("yield");
  expect(await page.evaluate(() => __game.race.teamOrder)).toBe("yield");
  await page.locator("[data-action=race-journal]").click();
  await expect(page.locator(".session-journal")).toContainText("Safety Car");
  await page.locator("[data-action=journal-back]").click();
  expect(await page.evaluate(() => __game.race.state)).not.toBe("paused");
  await page.evaluate(() => {
    const r = __game.race;
    r.control.neutralize("red", "Suspensão de teste");
    __game.ui.updateHUD(r, performance.now() + 900);
  });
  await expect(page.locator("#hud-director-flag")).toContainText("VERMELHA");
  const frozen = await page.evaluate(() => {
    const r = __game.race,
      before = JSON.stringify(r.cars.map((c) => [c.x, c.z, c.fuel]));
    for (let i = 0; i < 100; i++) r.step(1 / 60, {}, false);
    return before === JSON.stringify(r.cars.map((c) => [c.x, c.z, c.fuel]));
  });
  expect(frozen).toBe(true);
  expect(errors).toEqual([]);
});
test("v0.5 settings, accelerated simulation, contracts/training and persistent filters", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await page.locator("[data-action=setup]").first().click();
  await page.locator("[data-setting=weatherProgram]").selectOption("showers");
  await page.locator("[data-setting=mechanicalRate]").selectOption("0.02");
  await page.locator("[data-setting=ruleSet]").selectOption("formula");
  await page.reload();
  await page.waitForFunction(() => __game?.world.assetsReady);
  expect(await page.evaluate(() => __game.save.settings.mechanicalRate)).toBe(
    0.02,
  );
  expect(await page.evaluate(() => __game.save.settings.weatherProgram)).toBe(
    "showers",
  );
  await page.evaluate(() => {
    __game.save.career.reputation = 10;
    __game.save.credits = 9000;
    __game.store();
  });
  await page.locator(".competition-nav [data-nav=operations]").click();
  await page.locator('[data-action=career-contract][data-id="2"]').click();
  await page.locator("[data-action=career-training]").click();
  expect(await page.evaluate(() => __game.save.career.team)).toBe(2);
  expect(await page.evaluate(() => __game.save.career.training)).toBe(1);
  await page
    .locator(".competition-nav [data-action=league-open][data-id=time-attack]")
    .click();
  await page.locator("[data-action=league-sim]").click();
  await page.waitForFunction(() => __game?.simulating && __game.race?.time > 2);
  const live = await page.evaluate(() => ({
    delegated: __game.race.delegated,
    grid: __game.race.cars.length,
    spec: __game.race.cars[0].stats.maxSpeed,
    team: __game.race.cars[0].teamId,
  }));
  expect(live).toEqual({ delegated: true, grid: 1, spec: 69, team: 2 });
  await page.waitForFunction(() => __game.race.done, {}, { timeout: 90000 });
  await expect(page.locator("[aria-label=league-results]")).toBeVisible();
  expect(await page.evaluate(() => __game.save.stats.wins)).toBe(0);
  expect(errors).toEqual([]);
});
