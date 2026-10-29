import { test, expect } from "@playwright/test";

async function boot(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  await page.waitForFunction(() => window.__game?.authStatus !== "checking");
  return errors;
}

test("Google account is required before any career or multiplayer screen", async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator(".account-gate")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu legado acompanha você." })).toBeVisible();
  await expect(page.locator("[data-nav]")).toHaveCount(0);

  const state = await page.evaluate(() => ({
    status: __game.authStatus,
    configured: __game.multiplayer.state.configured,
    googleEnabled: __game.multiplayer.state.googleEnabled,
    profile: __game.multiplayer.state.profile,
    room: __game.multiplayer.state.room,
    publicRooms: __game.multiplayer.state.publicRooms.length,
  }));
  expect(["login-required", "unconfigured", "sync-error"]).toContain(state.status);
  expect(state).toMatchObject({ profile: null, room: null, publicRooms: 0 });
  if (state.status === "login-required" && state.configured && state.googleEnabled)
    await expect(page.getByRole("button", { name: /ENTRAR COM GOOGLE|VINCULAR CONTA GOOGLE/ })).toBeVisible();
  else if (state.status === "sync-error")
    await expect(page.getByRole("button", { name: "TENTAR NOVAMENTE" })).toBeVisible();
  else if (!state.configured)
    await expect(page.getByRole("heading", { name: "Configure o acesso Google." })).toBeVisible();
  await expect(page.locator("#mp-create-form")).toHaveCount(0);
  await expect(page.locator(".mp-room-row")).toHaveCount(0);
  await expect(page.locator('[data-action="export-save"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("career actions and settings remain blocked without a Google session", async ({ page }) => {
  const errors = await boot(page);
  const state = await page.evaluate(() => {
    const game = __game;
    const before = {
      laps: game.save.settings.laps,
      credits: game.save.credits,
      page: game.ui.page,
    };
    game.setting("laps", 30);
    game.setting("quality", "low");
    game.action("start");
    game.ui.navigate("garage");
    return {
      before,
      after: {
        laps: game.save.settings.laps,
        credits: game.save.credits,
        page: game.ui.page,
        race: !!game.race,
      },
    };
  });
  expect(state.after).toEqual({ ...state.before, race: false });
  expect(state.before).toMatchObject({ laps: 8, page: "account" });
  await expect(page.locator(".account-gate")).toBeVisible();
  expect(errors).toEqual([]);
});
