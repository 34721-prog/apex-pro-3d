import { test, expect } from "@playwright/test";

async function boot(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  return errors;
}

test("multiplayer menu never fabricates an identity, room or race", async ({ page }) => {
  const errors = await boot(page);
  await page.locator('[data-nav="multiplayer"]').click();
  await expect(page.getByRole("heading", { name: "Corra com pessoas de verdade." })).toBeVisible();
  const state = await page.evaluate(() => ({
    configured: __game.multiplayer.state.configured,
    profile: __game.multiplayer.state.profile,
    room: __game.multiplayer.state.room,
    publicRooms: __game.multiplayer.state.publicRooms.length,
  }));
  expect(typeof state.configured).toBe("boolean");
  expect(state).toMatchObject({ profile: null, room: null, publicRooms: 0 });
  if (state.configured) {
    await expect(page.getByRole("heading", { name: "Escolha seu nome no grid." })).toBeVisible();
    await expect(page.locator("#mp-guest-form")).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Conecte um projeto Supabase." })).toBeVisible();
    await expect(page.locator(".mp-setup-required")).toContainText("Nenhuma sala fictícia é exibida");
  }
  await expect(page.locator("#mp-create-form")).toHaveCount(0);
  await expect(page.locator(".mp-room-row")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("interactive lap inputs and named presets clamp to 8–30 laps", async ({ page }) => {
  const errors = await boot(page);
  const settings = await page.evaluate(() => {
    const game = __game;
    game.setting("laps", 3);
    const belowMin = game.save.settings.laps;
    game.setting("laps", 30);
    const max = game.save.settings.laps;
    game.setting("raceDistancePreset", "short");
    const short = game.save.settings.laps;
    game.setting("raceDistancePreset", "endurance");
    return { belowMin, max, short, endurance: game.save.settings.laps };
  });
  expect(settings).toEqual({ belowMin: 8, max: 30, short: 8, endurance: 14 });
  expect(errors).toEqual([]);
});
