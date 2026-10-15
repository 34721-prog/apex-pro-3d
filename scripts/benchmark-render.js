// Controlled render-only comparison: freeze after the exact same 600 simulation
// ticks, same six-car High preset, resolution, camera, weather and browser flags.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const [tag = "after", port = "5173"] = process.argv.slice(2);
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--enable-precise-memory-info",
  ],
});
const data = [];
for (let run = 0; run < 3; run++) {
  const p = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await p.addInitScript(() => localStorage.setItem("apex-dynasty-v1",JSON.stringify({version:1,settings:{quality:"high"}})));
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  let load = Date.now();
  await p.goto(`http://localhost:${port}/?test=1`);
  await p.waitForFunction(() => __game?.world.assetsReady);
  load = Date.now() - load;
  const row = await p.evaluate(async () => {
    const g = __game;
    g.frame = () => {};
    await new Promise(requestAnimationFrame);
    g.save.settings.bots = 5;
    g.save.settings.quality = "high";
    g.save.settings.audio = false;
    g.start();
    g.world.quality("high");
    g.race.state = "racing";
    for (let i = 0; i < 600; i++) g.race.step(1 / 60, {}, true);
    const r = g.race;
    g.world.render(0.2, r.cars, r.state);
    const samples = [],
      submission = [];
    let last = performance.now(),
      start = last;
    await new Promise((resolve) => {
      const f = (now) => {
        const dt = (now - last) / 1000;
        samples.push(now - last);
        last = now;
        const t = performance.now();
        g.world.render(Math.min(dt, 0.25), r.cars, r.state);
        submission.push(performance.now() - t);
        if (now - start < 8000) requestAnimationFrame(f);
        else resolve();
      };
      requestAnimationFrame(f);
    });
    const stats = (a) => {
      a = a.slice(5).sort((x, y) => x - y);
      return {
        mean: a.reduce((s, x) => s + x, 0) / a.length,
        p95: a[Math.floor(a.length * 0.95)],
      };
    };
    const gl = g.world.renderer.getContext(),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      frameMs: stats(samples),
      fps: 1000 / stats(samples).mean,
      submitMs: stats(submission),
      frames: samples.length,
      drawCalls: g.world.renderer.info.render.calls,
      triangles: g.world.renderer.info.render.triangles,
      geometries: g.world.renderer.info.memory.geometries,
      textures: g.world.renderer.info.memory.textures,
      heapBytes: performance.memory?.usedJSHeapSize,
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : "unavailable",
      pose: { x: r.cars[0].x, z: r.cars[0].z, heading: r.cars[0].heading },
      canvas: { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight },
    };
  });
  data.push({ ...row, loadMs: load, errors });
  await p.close();
}
await fs.writeFile(
  `tests/performance/v03/${tag}-render-controlled.json`,
  JSON.stringify(data, null, 2),
);
console.log(data);
await browser.close();
