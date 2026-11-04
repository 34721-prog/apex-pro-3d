import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";

// Allow importing UI modules that pull in .css files.
register("./css-hooks.mjs", import.meta.url);

const { JSDOM } = await import("jsdom");

let uiModule;

async function setup(authView = "login", { error = "" } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="app"><div id="world"></div><div id="ui"></div><div id="toast"></div></div></body></html>`,
    { url: "http://localhost:5173/", pretendToBeVisual: true },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.location = dom.window.location;
  globalThis.history = dom.window.history;
  if (!uiModule) uiModule = await import("../src/ui.js");
  const { UI } = uiModule;
  const { defaults } = await import("../src/save.js");

  const calls = [];
  const game = {
    authStatus: "login-required",
    save: defaults(),
    multiplayer: {
      state: {
        configured: true,
        authView,
        busy: false,
        error,
        info: "",
        profile: null,
        room: null,
        players: [],
        publicRooms: [],
        results: [],
        connection: "offline",
        cloudSaveStatus: "idle",
      },
    },
    world: {
      container: document.getElementById("world"),
      resize() {},
      setMode() {},
      setPreview() {},
    },
    action(action, data = {}) {
      calls.push({ action, view: data.view ?? null });
    },
  };
  const ui = new UI(game);
  ui.page = "account";
  ui.render();
  return { dom, calls, game, ui };
}

function clickButton(action, view = null) {
  const btn = [...document.querySelectorAll(`[data-action="${action}"]`)]
    .find((b) => (view === null ? true : b.dataset.view === view));
  assert.ok(btn, `button [data-action="${action}"]${view ? ` view=${view}` : ""} must exist`);
  assert.notEqual(btn.disabled, true, `button ${action} must be enabled`);
  btn.click();
  return btn;
}

test("Game.action routes auth-* actions to the multiplayer handler", () => {
  const src = fs.readFileSync("src/core/Game.js", "utf8");
  assert.match(
    src,
    /action\.startsWith\("mp-"\) \|\| action\.startsWith\("auth-"\)/,
    "auth-login/auth-register/auth-forgot/auth-resend/auth-view/auth-logout must reach MultiplayerClient.handleAction",
  );
  assert.match(
    src,
    /!action\.startsWith\("auth-"\)/,
    "auth actions must be allowed while authStatus is not ready",
  );
});

test("every login-screen button is present, enabled and dispatches its action", async () => {
  const { calls } = await setup("login");
  assert.ok(document.querySelector(".account-gate"), "account gate renders");
  assert.ok(document.querySelector("#auth-login-form"), "login form renders");

  clickButton("auth-login");
  clickButton("auth-view", "forgot");
  clickButton("auth-view", "register");

  assert.deepEqual(
    calls.map((c) => [c.action, c.view]),
    [["auth-login", null], ["auth-view", "forgot"], ["auth-view", "register"]],
  );
});

test("login form submits via Enter (submit event) and not only via button click", async () => {
  const { calls } = await setup("login");
  const form = document.getElementById("auth-login-form");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.deepEqual(calls.map((c) => c.action), ["auth-login"]);
});

test("register screen renders all fields and its buttons dispatch actions", async () => {
  const { calls } = await setup("register");
  const form = document.querySelector("#auth-register-form");
  assert.ok(form, "register form renders");
  for (const name of ["username", "email", "password", "confirm"])
    assert.ok(form.querySelector(`[name="${name}"]`), `field ${name} exists`);

  clickButton("auth-register");
  clickButton("auth-view", "login");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  assert.deepEqual(
    calls.map((c) => [c.action, c.view]),
    [["auth-register", null], ["auth-view", "login"], ["auth-register", null]],
  );
});

test("confirm-email screen resends confirmation and returns to login", async () => {
  const { calls, game } = await setup("confirm");
  game.multiplayer.state.pendingEmail = "piloto@example.com";
  assert.equal(document.querySelector("#auth-login-form"), null);
  clickButton("auth-resend");
  clickButton("auth-view", "login");
  assert.deepEqual(
    calls.map((c) => [c.action, c.view]),
    [["auth-resend", null], ["auth-view", "login"]],
  );
});

test("forgot-password screen sends recovery e-mail, submits via Enter and goes back", async () => {
  const { calls } = await setup("forgot");
  const form = document.getElementById("auth-forgot-form");
  assert.ok(form?.querySelector('[name="email"]'), "e-mail field exists");
  clickButton("auth-forgot");
  clickButton("auth-view", "login");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.deepEqual(
    calls.map((c) => [c.action, c.view]),
    [["auth-forgot", null], ["auth-view", "login"], ["auth-forgot", null]],
  );
});

test("reset-sent screen returns to login; error alert close button dispatches", async () => {
  const { calls } = await setup("reset-sent");
  clickButton("auth-view", "login");
  assert.deepEqual(calls.map((c) => [c.action, c.view]), [["auth-view", "login"]]);

  const again = await setup("login", { error: "Erro de teste" });
  clickButton("mp-close-error");
  assert.deepEqual(again.calls.map((c) => c.action), ["mp-close-error"]);
});

test("auth controls are real enabled <button type=button> elements (no dead elements)", async () => {
  await setup("login");
  for (const action of ["auth-login", "auth-view"]) {
    for (const el of document.querySelectorAll(`[data-action="${action}"]`)) {
      assert.equal(el.tagName, "BUTTON", `${action} must be a <button>`);
      assert.equal(el.getAttribute("type"), "button");
      assert.equal(el.disabled, false);
    }
  }
});

test("MultiplayerClient.handleAction implements every auth-* action used by the UI", async () => {
  const { MultiplayerClient } = await import("../src/multiplayer/MultiplayerClient.js");
  const src = fs.readFileSync("src/multiplayer/MultiplayerClient.js", "utf8");
  for (const action of ["auth-login", "auth-register", "auth-logout", "auth-forgot", "auth-resend", "auth-view"]) {
    assert.match(src, new RegExp(`case "${action}"`), `handleAction must implement ${action}`);
  }
  const game = { ui: { page: "account", render() {}, toast() {} } };
  const mp = new MultiplayerClient(game, {
    client: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
    configured: true,
  });
  assert.equal(await mp.handleAction("auth-view", { view: "register" }), true);
  assert.equal(mp.state.authView, "register");
});

test("multiplayer screen has working JOGAR AGORA button and quick-play cancel banner", async () => {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="app"><div id="world"></div><div id="ui"></div><div id="toast"></div></div></body></html>`,
    { url: "http://localhost:5173/", pretendToBeVisual: true },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  if (!uiModule) uiModule = await import("../src/ui.js");
  const { UI } = uiModule;
  const { defaults } = await import("../src/save.js");
  const { MultiplayerClient } = await import("../src/multiplayer/MultiplayerClient.js");

  const calls = [];
  const game = {
    authStatus: "ready",
    save: defaults(),
    multiplayer: null,
    world: { container: document.getElementById("world"), resize() {}, setMode() {}, setPreview() {} },
    admin: { active: false },
    action(action, data = {}) { calls.push({ action, view: data.view ?? null }); },
  };
  const fakeClient = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    rpc: async () => ({ data: [], error: null }),
  };
  game.multiplayer = new MultiplayerClient(game, { client: fakeClient, configured: true });
  game.multiplayer.state.profile = { id: crypto.randomUUID(), username: "p1", display_name: "P1" };
  game.multiplayer.state.connection = "online";

  const ui = new UI(game);
  ui.page = "multiplayer";
  ui.render();

  // JOGAR AGORA presente, habilitado e despacha mp-quick-play
  const qp = [...document.querySelectorAll('[data-action="mp-quick-play"]')][0];
  assert.ok(qp, "botão JOGAR AGORA existe");
  assert.equal(qp.disabled, false);
  assert.match(qp.textContent, /JOGAR AGORA/);
  qp.click();
  assert.deepEqual(calls.map((c) => c.action), ["mp-quick-play"]);

  // durante a espera, o banner mostra indicador e o botão de cancelar
  game.multiplayer.state.quickPlayPhase = "waiting";
  game.multiplayer.state.quickPlayElapsed = 7;
  ui.render();
  const banner = document.querySelector(".mp-quickplay");
  assert.ok(banner, "banner de procura visível");
  assert.match(banner.textContent, /Aguardando outros jogadores/);
  assert.match(banner.textContent, /7s/);
  const cancel = banner.querySelector('[data-action="mp-quick-play-cancel"]');
  assert.ok(cancel, "botão CANCELAR BUSCA existe no banner");
  cancel.click();
  assert.deepEqual(calls.map((c) => c.action), ["mp-quick-play", "mp-quick-play-cancel"]);
});
