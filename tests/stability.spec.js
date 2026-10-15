import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { trackCatalog } from "../src/data/tracks.js";
import { configureTrack, at } from "../src/track.js";
import { overlap } from "../src/racing/CollisionSystem.js";
import {
  pitLayout,
  pitPoint,
  pitFacilities,
  pitSolids,
} from "../src/strategy/PitLayout.js";
const dir = "tests/performance/v081";
fs.mkdirSync(dir + "/visual", { recursive: true });
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error" && !e.text().includes("net::ERR_ABORTED"))
      errors.push(e.text());
  });
  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  await expect(page.locator("#boot-loading")).toHaveCount(0);
  return errors;
}
test("v081 production assets and startup are local, complete and hash-identical", async ({
  page,
  request,
}) => {
  const errors = await boot(page);
  const html = await (await request.get("/")).text();
  expect(html).not.toContain("/src/main.js");
  expect(html).not.toContain("/@vite/client");
  const files = [];
  function walk(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, e.name);
      if (e.isDirectory()) walk(q);
      else files.push(q);
    }
  }
  walk("public");
  for (const f of files) {
    const response = await request.get("/" + f.slice(7));
    expect(response.status(), f).toBe(200);
    expect(
      crypto
        .createHash("sha256")
        .update(await response.body())
        .digest("hex"),
      f,
    ).toBe(
      crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"),
    );
  }
  const external = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((e) => new URL(e.name).origin !== location.origin)
      .map((e) => e.name),
  );
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  fs.writeFileSync(
    dir + "/production-assets.json",
    JSON.stringify(
      { files: files.length, allHashesMatch: true, external },
      null,
      2,
    ),
  );
});
test("v081 all circuits: one pit, matching physical walls, repeat init/camera/track lifecycle", async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await page.evaluate(() => {
    __game.frame = () => {};
  });
  const report = [];
  for (const track of trackCatalog) {
    configureTrack(track.id);
    const bays = pitLayout();
    const t = {
      p: {
        x: bays.reduce((n, b) => n + b.x, 0) / bays.length,
        z: bays.reduce((n, b) => n + b.z, 0) / bays.length,
      },
    };
    const data = await page.evaluate(
      async ({ id, pose }) => {
        const g = __game;
        g.race = null;
        await g.loadTrack(id, { page: true });
        const w = g.world;
        w.container.style.cssText =
          "position:fixed;inset:0;width:1280px;height:720px;display:block;z-index:999";
        w.resize();
        const count = () => {
          let meshes = 0;
          w.scene.traverse((o) => {
            if (o.isMesh) meshes++;
          });
          return meshes;
        };
        const before = count(),
          root = w.pitRoot;
        w.buildPit();
        w.buildPit();
        const instances = w.scene.getObjectByName(
            "pit-buildings-equipment-markings",
          ),
          walls = [],
          matrix = w.camera.matrix.clone(),
          p = w.camera.position.clone(),
          scale = p.clone(),
          q = w.camera.quaternion.clone();
        for (let i = 0; i < instances.count; i++) {
          instances.getMatrixAt(i, matrix);
          matrix.decompose(p, q, scale);
          walls.push({ x: p.x, z: p.z, width: scale.x, length: scale.z });
        }
        const resources = w.renderer.info.memory;
        const uuid = root.uuid;
        for (const camera of [
          "chase",
          "pit-garage",
          "pit-lane",
          "overview",
          "cockpit",
        ]) {
          w.cameraMode = camera;
          w.render(0);
        }
        w.camera.position.set(pose.x, 390, pose.z + 90);
        w.camera.lookAt(pose.x, 0, pose.z);
        w.camera.fov = 55;
        w.camera.updateProjectionMatrix();
        w.scene.updateMatrixWorld(true);
        w.renderer.render(w.scene, w.camera);
        w.renderer.getContext().finish(); // Diagnostic screenshot only; never in gameplay.
        return {
          id,
          before,
          after: count(),
          rootSame: root === w.pitRoot,
          roots: w.scene.children.filter((o) => o.name === "physical-pit")
            .length,
          uuid,
          walls,
          cityBuildings: w.cityBuildings,
          resources: { ...resources },
          canvases: document.querySelectorAll("#world canvas").length,
        };
      },
      { id: track.id, pose: { x: t.p.x, z: t.p.z } },
    );
    const structures = [
      ...pitFacilities(),
      ...pitLayout().map((b) => ({
        ...pitPoint(b.s, 50),
        heading: b.heading,
        halfWidth: 8.5,
        halfLength: b.garageLength / 2 + 0.2,
      })),
    ];
    for (const city of data.cityBuildings)
      for (const b of structures)
        expect(overlap(city, b), "city scenery outside pit " + track.id).toBe(
          null,
        );
    expect(data.after).toBe(data.before);
    expect(data.rootSame).toBe(true);
    expect(data.roots).toBe(1);
    expect(data.canvases).toBe(1);
    for (const b of pitSolids())
      expect(
        data.walls.some(
          (w) =>
            Math.hypot(w.x - b.x, w.z - b.z) < 0.001 &&
            Math.abs(w.width - b.halfWidth * 2) < 0.001 &&
            Math.abs(w.length - b.halfLength * 2) < 0.001,
        ),
        "visual/solid correspondence " + track.id,
      ).toBe(true);
    await page.locator("#world canvas").screenshot({
      path: dir + "/visual/pit-" + track.id + ".jpg",
      type: "jpeg",
      quality: 75,
    });
    report.push(data);
  }
  expect(errors).toEqual([]);
  fs.writeFileSync(dir + "/browser-pits.json", JSON.stringify(report, null, 2));
});
test("v081 texture/GLB failures show useful warning and keep original procedural fallback", async ({
  page,
}) => {
  await page.route("**/assets/cars/models/apex-07.glb", (r) =>
    r.fulfill({ status: 503, body: "controlled unavailable fixture" }),
  );
  await page.route("**/assets/tracks/textures/grass.png", (r) =>
    r.fulfill({ status: 503, body: "controlled unavailable fixture" }),
  );
  await page.goto("/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  await expect(page.locator("#toast")).toContainText("recursos não carregaram");
  expect(await page.evaluate(() => __game.world.assetErrors.length)).toBe(2);
  expect(
    await page.evaluate(
      () => !!__game.world.loadError && !!__game.world.showCar,
    ),
  ).toBe(true);
  await expect(page.locator("#boot-loading")).toHaveCount(0);
});

test("v081 pending texture blocks premature ready; one recurring RAF after races, pause and exit", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window),
      cancel = window.cancelAnimationFrame.bind(window);
    window.__pendingRAF = new Set();
    window.requestAnimationFrame = (cb) => {
      const id = request((t) => {
        __pendingRAF.delete(id);
        cb(t);
      });
      __pendingRAF.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      __pendingRAF.delete(id);
      cancel(id);
    };
  });
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**/assets/tracks/textures/grass.png", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator("#boot-loading")).toBeVisible();
  expect(await page.evaluate(() => !!__game.world.assetsReady)).toBe(false);
  release();
  await page.waitForFunction(() => __game.world.assetsReady);
  await expect(page.locator("#boot-loading")).toHaveCount(0);
  const rows = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      __game.start();
      __game.pause();
    });
    const before = await page.evaluate(() => __game.race.time);
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => __game.race.time)).toBe(before);
    await page.evaluate(() => __game.action("exit-race"));
    await page.locator('[data-action="confirm-exit"]').click();
    const row = await page.evaluate(() => ({
      pending: __pendingRAF.size,
      canvases: document.querySelectorAll("#world canvas").length,
      cars: __game.world.carMeshes.length,
    }));
    expect(row.pending).toBe(1);
    expect(row.canvases).toBe(1);
    expect(row.cars).toBe(0);
    rows.push(row);
  }
  fs.writeFileSync(dir + "/loop-lifecycle.json", JSON.stringify(rows, null, 2));
});
