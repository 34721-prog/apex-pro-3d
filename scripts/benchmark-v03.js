import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const tag = process.argv[2] || "after",
  browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--enable-precise-memory-info",
    ],
  });
const results = [];
for (const bots of [1, 5]) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const load = Date.now();
  await page.goto("http://localhost:5181/?test=1");
  await page.waitForFunction(() => window.__game?.world.assetsReady);
  const loadingMs = Date.now() - load;
  const metrics = await page.evaluate(async (bots) => {
    const g = __game;
    g.frame = () => {};
    await new Promise(requestAnimationFrame);
    g.save.settings.bots = bots;
    g.save.settings.quality = "high";
    g.save.settings.audio = false;
    g.start();
    g.frame = () => {};
    g.world.quality("high");
    const r = g.race;
    r.state = "racing";
    for (let i = 0; i < 600; i++) r.step(1 / 60, {}, true);
    const frames = [],
      renders = [],
      physics = [],
      ui = [];
    let last = performance.now(),
      start = last,
      count = 0;
    return await new Promise((resolve) => {
      function frame(now) {
        const elapsed = (now - last) / 1000;
        last = now;
        const t = performance.now();
        g.loop.advance(elapsed, (dt) => r.step(dt, {}, true));
        physics.push(performance.now() - t);
        const u = performance.now();
        g.ui.updateHUD(r, now);
        ui.push(performance.now() - u);
        const a = performance.now();
        g.world.render(Math.min(elapsed, 0.2), r.cars, r.state);
        renders.push(performance.now() - a);
        frames.push(elapsed * 1000);
        count++;
        if (now - start < 8000) {
          requestAnimationFrame(frame);
          return;
        }
        const stats = (arr) => {
          const sorted = arr.slice(5).sort((a, b) => a - b);
          return {
            mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
            p95: sorted[Math.floor(sorted.length * 0.95)],
          };
        };
        resolve({
          bots,
          quality: "high",
          viewport: "1280x720 DPR1",
          durationMs: now - start,
          frames: count,
          fps: 1000 / stats(frames).mean,
          frameMs: stats(frames),
          renderSubmitMs: stats(renders),
          physicsFrameMs: stats(physics),
          hudMs: stats(ui),
          drawCalls: g.world.renderer.info.render.calls,
          triangles: g.world.renderer.info.render.triangles,
          geometries: g.world.renderer.info.memory.geometries,
          textures: g.world.renderer.info.memory.textures,
          jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
        });
      }
      requestAnimationFrame(frame);
    });
  }, bots);
  results.push({ ...metrics, loadingMs, errors });
  await page.close();
}
await browser.close();
await fs.writeFile(
  `tests/performance/v03/${tag}-browser.json`,
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
