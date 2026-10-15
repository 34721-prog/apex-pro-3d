import { test, expect } from "@playwright/test";
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  return errors;
}
async function completeRace(page) {
  await page.evaluate(() => {
    const r = __game.race;
    for (let i = 0; i < 60000 && !r.done; i++)
      r.step(1 / 60, { throttle: 0, steer: 0, brake: 0 }, true);
  });
  await expect(
    page.getByRole("dialog", { name: "Resultados", exact: true }),
  ).toBeVisible();
}
test("desktop navigation, purchases, settings and persistent save", async ({
  page,
}) => {
  const errors = await boot(page);
  await expect(
    page.getByRole("heading", { name: "O próximo capítulo é seu." }),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/screenshots/01-central.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Melhorias", exact: true }).click();
  await page.locator("[data-action=upgrade][data-key=maxSpeed]").click();
  await expect(page.locator(".upgrade-card").first()).toContainText(
    "NÍVEL 1 / 5",
  );
  const save = await page.evaluate(() => ({
    credits: __game.save.credits,
    speed: __game.save.upgrades.maxSpeed,
  }));
  expect(save).toEqual({ credits: 950, speed: 1 });
  await page.reload();
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  expect(await page.evaluate(() => __game.save.credits)).toBe(950);
  await page.getByRole("button", { name: "Garagem", exact: true }).click();
  await expect(page.locator(".vehicle-card")).toHaveCount(12);
  await expect(page.locator(".vehicle-card:disabled")).toHaveCount(6);
  await page.screenshot({
    path: "tests/screenshots/02-garagem.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByLabel("Qualidade gráfica").selectOption("low");
  await page.locator("[data-setting=audio]").uncheck();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(await page.evaluate(() => __game.save.settings)).toMatchObject({
    quality: "low",
    audio: false,
  });
  await page.getByRole("button", { name: "Estatísticas", exact: true }).click();
  await expect(page.locator(".goal-card.complete")).toHaveCount(1);
  await page.getByRole("button", { name: "Campeonato", exact: true }).click();
  await expect(page.locator(".round-card")).toHaveCount(3);
  expect(errors).toEqual([]);
});
test("real keyboard input, camera, pause, recovery, three laps, results and restart", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    __game.save.settings.controlMode = "manual";
  });
  await page.getByRole("button", { name: "PREPARAR EQUIPE" }).click();
  await page.getByRole("button", { name: "Normal", exact: false }).click();
  await page
    .getByRole("button", { name: "INICIAR CORRIDA", exact: false })
    .click();
  await page.evaluate(() => {
    for (let i = 0; i < 310; i++) __game.race.step(1 / 60, {});
  });
  await page.keyboard.down("w");
  const before = await page.evaluate(() => {
    for (let i = 0; i < 120; i++)
      __game.race.step(1 / 60, __game.controls.input());
    const p = __game.race.cars[0];
    return { speed: p.speed, heading: p.heading, x: p.x };
  });
  expect(before.speed).toBeGreaterThan(30);
  await page.keyboard.down("a");
  const after = await page.evaluate(() => {
    for (let i = 0; i < 10; i++)
      __game.race.step(1 / 60, __game.controls.input());
    return __game.race.cars[0].heading;
  });
  // Yaw-positive projects left in the rear camera; A must turn that way.
  expect(after).toBeGreaterThan(before.heading);
  await page.keyboard.up("a");
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => __game.race.state)).toBe("paused");
  await page
    .getByRole("button", { name: "VOLTAR À PISTA", exact: false })
    .click();
  await page.keyboard.press("r");
  expect(await page.evaluate(() => __game.race.cars[0].recoveries)).toBe(1);
  await page.screenshot({ path: "tests/screenshots/03-corrida.png" });
  await completeRace(page);
  const result = await page.evaluate(() => ({
    races: __game.save.stats.races,
    finishers: __game.race.results().filter((r) => r.finished).length,
    assets: __game.world.assetsReady,
    reward: __game.lastReward.credits,
  }));
  expect(result.races).toBe(1);
  expect(result.finishers).toBe(6);
  expect(result.reward).toBeGreaterThan(0);
  await page.screenshot({ path: "tests/screenshots/04-resultados.png" });
  await page
    .getByRole("button", { name: "CORRER NOVAMENTE", exact: false })
    .click();
  expect(await page.evaluate(() => __game.race.state)).toBe("countdown");
  expect(await page.evaluate(() => __game.race.cars[0].lap)).toBe(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "SAIR PARA A CENTRAL", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ABANDONAR CORRIDA", exact: true })
    .click();
  expect(await page.evaluate(() => __game.save.stats.races)).toBe(1);
  expect(errors).toEqual([]);
});
test("championship continuity across reload, three stages and new season", async ({
  page,
}) => {
  const errors = await boot(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Campeonato", exact: true }).click();
    await page.locator("[data-action=champ-setup]").click();
    await page.locator("[data-action=start-champ]").click();
    await completeRace(page);
    expect(
      await page.evaluate(() => __game.save.championship.results.length),
    ).toBe(i + 1);
    await page.locator("[data-action=results-champ]").click();
    await page.reload();
    await page.waitForFunction(() => window.__game?.world.assetsReady);
  }
  await page.getByRole("button", { name: "Campeonato", exact: true }).click();
  await expect(page.locator(".champ-banner")).toContainText(
    "CAMPEÃO DA TEMPORADA",
  );
  await page.screenshot({
    path: "tests/screenshots/05-campeonato.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "NOVA TEMPORADA", exact: false })
    .click();
  await page
    .getByRole("button", { name: "INICIAR NOVA TEMPORADA", exact: true })
    .click();
  expect(
    await page.evaluate(() => __game.save.championship.results.length),
  ).toBe(0);
  expect(await page.evaluate(() => __game.save.stats.seasons)).toBe(1);
  expect(await page.evaluate(() => __game.save.unlockedCars.includes(5))).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
test("mobile layout, touch controls, GLB and texture loading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await boot(page);
  await page.evaluate(() => {
    __game.save.settings.controlMode = "manual";
  });
  await page.screenshot({
    path: "tests/screenshots/06-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const loaded = await page.evaluate(async () => {
    const loader = __game.world.loader;
    const models = [
      "apex-07",
      "ember-22",
      "azure-18",
      "solstice-44",
      "verdant-31",
      "orion-63",
    ];
    for (const m of models) {
      const d = await loader.loadAsync("/assets/cars/models/" + m + ".glb");
      if (!d.scene.children.length) return false;
    }
    for (const m of ["straight-30m", "curve-90deg", "barrier-concrete"])
      await loader.loadAsync("/assets/tracks/models/" + m + ".glb");
    return true;
  });
  expect(loaded).toBe(true);
  await page.locator("[data-action=setup]").first().click();
  await page.locator("[data-action=start]").click();
  await expect(page.locator(".touch-controls")).toBeVisible();
  await page
    .locator("[data-touch=throttle]")
    .dispatchEvent("pointerdown", { pointerId: 1 });
  expect(await page.evaluate(() => __game.controls.touch.throttle)).toBe(1);
  await page
    .locator("[data-touch=throttle]")
    .dispatchEvent("pointerup", { pointerId: 1 });
  expect(await page.evaluate(() => __game.controls.touch.throttle)).toBe(0);
  expect(errors).toEqual([]);
});
test("corrupted local save recovers defaults; no external runtime dependencies", async ({
  page,
}) => {
  const external = [];
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/))
      external.push(r.url());
  });
  await page.goto("/?test=1");
  await page.evaluate(() =>
    localStorage.setItem("apex-dynasty-v1", "{broken-json"),
  );
  await page.reload();
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  expect(await page.evaluate(() => __game.save.credits)).toBe(1200);
  expect(await page.evaluate(() => __game.save.selectedCar)).toBe(0);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("button", { name: "CONTROLES", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Sinta o asfalto." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ENTENDIDO", exact: false }).click();
  await expect(page.locator("#modal")).toHaveCount(0);
  expect(external).toEqual([]);
});
