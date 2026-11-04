import { test, expect } from "@playwright/test";

async function boot(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  await page.waitForFunction(() => window.__game?.authStatus !== "checking");
  return errors;
}

test("E-mail/password account is required before any career or multiplayer screen", async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator(".account-gate")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu legado acompanha você." })).toBeVisible();
  await expect(page.locator("[data-nav]")).toHaveCount(0);

  const state = await page.evaluate(() => ({
    status: __game.authStatus,
    configured: __game.multiplayer.state.configured,
    authView: __game.multiplayer.state.authView,
    profile: __game.multiplayer.state.profile,
    room: __game.multiplayer.state.room,
    publicRooms: __game.multiplayer.state.publicRooms.length,
  }));
  expect(["login-required", "unconfigured", "sync-error"]).toContain(state.status);
  expect(state).toMatchObject({ profile: null, room: null, publicRooms: 0 });
  if (state.status === "login-required" && state.configured) {
    await expect(page.locator("#auth-login-form")).toBeVisible();
    await expect(page.getByRole("button", { name: "ENTRAR" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CRIAR CONTA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ESQUECI MINHA SENHA" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Manter conectado/ })).toBeChecked();
    // No Google/OAuth button anywhere.
    await expect(page.getByRole("button", { name: /GOOGLE/i })).toHaveCount(0);
  } else if (state.status === "sync-error") {
    await expect(page.getByRole("button", { name: "TENTAR NOVAMENTE" })).toBeVisible();
  } else if (!state.configured) {
    await expect(page.getByRole("heading", { name: "Configure o acesso por conta." })).toBeVisible();
  }
  await expect(page.locator("#mp-create-form")).toHaveCount(0);
  await expect(page.locator(".mp-room-row")).toHaveCount(0);
  await expect(page.locator('[data-action="export-save"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("register view shows username, e-mail, password and confirmation fields", async ({ page }) => {
  const errors = await boot(page);
  const state = await page.evaluate(() => __game.multiplayer.state.configured && __game.authStatus);
  test.skip(!state || state === "unconfigured" || state === "sync-error", "requires a configured Supabase project");
  await page.getByRole("button", { name: "CRIAR CONTA" }).click();
  await expect(page.locator("#auth-register-form")).toBeVisible();
  await expect(page.locator('#auth-register-form [name="username"]')).toBeVisible();
  await expect(page.locator('#auth-register-form [name="email"]')).toBeVisible();
  await expect(page.locator('#auth-register-form [name="password"]')).toBeVisible();
  await expect(page.locator('#auth-register-form [name="confirm"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "CRIAR CONTA" })).toBeVisible();
  await page.getByRole("button", { name: "ENTRAR" }).click();
  await expect(page.locator("#auth-login-form")).toBeVisible();
  expect(errors).toEqual([]);
});

test("career actions and settings remain blocked without a confirmed account", async ({ page }) => {
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
