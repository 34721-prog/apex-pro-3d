import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const [tag = "before", port = "5173"] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/?test=1`);
await page.waitForFunction(() => __game.world.assetsReady);
const rows = [];
for (const quality of ["medium", "high"]) {
  await page.evaluate((q) => {
    const g = __game;
    g.frame = () => {};
    g.save.settings.audio = false;
    g.start();
    g.race.state = "racing";
    g.world.quality(q);
    g.world.elapsed = 0;
    g.world.nextShadow = 0;
    g.world.render(0.001, g.race.cars, "racing");
    window.shadowCalls = [];
    g.world.carMeshes.forEach((m, i) =>
      m.traverse((o) => {
        if (o.isMesh)
          o.onBeforeShadow = () =>
            shadowCalls.push({
              id: g.race.cars[i]?.id,
              x: m.matrixWorld.elements[12],
              z: m.matrixWorld.elements[14],
            });
      }),
    );
  }, quality);
  for (let frame = 0; frame < 12; frame++) {
    const row = await page.evaluate(() => {
      const g = __game,
        w = g.world;
      for (const c of g.race.cars) {
        c.x += Math.sin(c.heading) * 0.8;
        c.z += Math.cos(c.heading) * 0.8;
      }
      shadowCalls.length = 0;
      w.render(1 / 60, g.race.cars, "racing");
      return {
        calls: shadowCalls.slice(),
        player: { x: g.race.cars[0].x, z: g.race.cars[0].z },
        map: w.sun.shadow.mapSize.x,
        projection: w.sun.shadow.camera.projectionMatrix.elements.slice(),
        sun: w.sun.position.toArray(),
        scCasters: (() => {
          let n = 0;
          w.safetyMesh.traverse((o) => {
            if (o.castShadow) n++;
          });
          return n;
        })(),
      };
    });
    rows.push({ quality, frame, ...row });
    if (frame === 0 || frame === 4)
      await page.screenshot({
        path: `tests/performance/shadows/visual/${tag}-${quality}-${frame}.jpg`,
        type: "jpeg",
        quality: 90,
      });
  }
}
await fs.writeFile(
  `tests/performance/shadows/${tag}-sync.json`,
  JSON.stringify({ rows, errors }, null, 2),
);
console.log(
  rows.map((r) => ({
    quality: r.quality,
    frame: r.frame,
    shadowDraws: r.calls.length,
  })),
);
await browser.close();
