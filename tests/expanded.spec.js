import { test, expect } from "@playwright/test";
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  return errors;
}
test("driver catalogue, real paint application, persistence, admin isolation and contracts", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.getByRole("button", { name: "Pilotos", exact: true }).click();
  await expect(page.locator(".driver-card")).toHaveCount(31);
  await expect
    .poll(
      () =>
        page
          .locator(".driver-card img")
          .evaluateAll(
            (images) =>
              images.length === 31 &&
              images.every((img) => img.complete && img.naturalWidth > 0),
          ),
      { timeout: 15000 },
    )
    .toBe(true);
  await page.getByRole("button", { name: "Garagem", exact: true }).click();
  await page.locator("[data-action=paint-editor]").click();
  await page.locator("#paint-primary").fill("#123abc");
  await page.locator("#paint-secondary").fill("#eeac12");
  await page.locator("#paint-detail").fill("#212832");
  await page.locator("#paint-number").fill("81");
  await page.locator("[data-action=save-paint]").click();
  expect(
    await page.evaluate(() => {
      let c;
      __game.world.showCar.traverse((o) => {
        if (o.material?.name === "body") c = o.material.color.getHexString();
      });
      return c;
    }),
  ).toBe("123abc");
  await page.reload();
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  expect(await page.evaluate(() => __game.save.customizations[0].number)).toBe(
    81,
  );
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.locator("[data-action=admin-login]").click();
  await page.locator("#admin-password").fill("123456789");
  await page.locator("[data-action=admin-enter]").click();
  await expect(page.locator(".lab-banner")).toBeVisible();
  await page.locator("#admin-credits").fill("25000");
  await page.locator("[data-action=admin-credit]").click();
  await page.getByRole("button", { name: "Pilotos", exact: true }).click();
  await page.locator('[data-action=pilot][data-id="15"]').click();
  expect(await page.evaluate(() => __game.save.selectedDriver)).toBe(15);
  expect(await page.evaluate(() => __game.save.credits)).toBeLessThan(25000);
  await page.getByRole("button", { name: "Garagem", exact: true }).click();
  await page.locator('[data-action=buy-car][data-id="6"]').click();
  expect(await page.evaluate(() => __game.save.selectedCar)).toBe(6);
  await page.locator("[data-action=admin-exit]").click();
  expect(
    await page.evaluate(() => ({
      credits: __game.save.credits,
      car: __game.save.selectedCar,
      pilot: __game.save.selectedDriver,
    })),
  ).toEqual({ credits: 1200, car: 0, pilot: 0 });
  expect(errors).toEqual([]);
});
test("new circuit, solo race, keyboard camera, pit menu pause, radio and result persistence", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    __game.save.settings.controlMode = "manual";
  });
  await page.locator("[data-action=setup]").first().click();
  await page.locator("[data-setting=track]").selectOption("neon");
  await page.waitForFunction(() => window.__game.world.assetsReady);
  await page.locator("[data-setting=mode]").selectOption("time-trial");
  await page.locator("[data-setting=realism]").selectOption("realistic");
  await page.locator("[data-setting=weather]").selectOption("rain");
  await page.locator("[data-setting=laps]").selectOption("1");
  await page.locator("[data-action=start]").click();
  expect(await page.evaluate(() => __game.race.trackId)).toBe("neon");
  expect(await page.evaluate(() => __game.race.cars.length)).toBe(1);
  await page.evaluate(() => {
    for (let i = 0; i < 310; i++) __game.race.step(1 / 60, {});
  });
  await page.keyboard.press("c");
  expect(await page.evaluate(() => __game.world.cameraMode)).toBe("cockpit");
  await page.locator("[data-action=pit-options]").click();
  expect(await page.evaluate(() => __game.race.state)).toBe("paused");
  await page.locator("[data-action=pit-compound][data-key=wet]").click();
  expect(await page.evaluate(() => __game.race.state)).toBe("racing");
  expect(await page.evaluate(() => __game.race.cars[0].pit.requested)).toBe(
    true,
  );
  await page.locator("[data-action=radio]").click();
  await expect(page.locator("#engineer-radio")).toContainText("Combustível");
  await page.evaluate(() => {
    const r = __game.race;
    for (let i = 0; i < 36000 && !r.done; i++) r.step(1 / 60, {}, true);
  });
  await expect(
    page.getByRole("dialog", { name: "Resultados", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => __game.save.records["neon:realistic:rain"]),
  ).toBeGreaterThan(5);
  expect(await page.evaluate(() => __game.save.stats.wins)).toBe(0);
  await page.screenshot({
    path: "tests/screenshots/expanded-solo-results.png",
  });
  expect(errors).toEqual([]);
});
