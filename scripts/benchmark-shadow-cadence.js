// Artificial 60 Hz pose cadence: CPU submission/GL-call time, NOT GPU time or FPS.
// gl.finish may be queued by the browser GPU process; no GPU timing claim.
// Makes the old throttling cost visible even on a slow software renderer.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const b = await chromium.launch({
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const rows = [];
for (const [version, port] of [
  ["before", 5182],
  ["after", 5173],
])
  for (const quality of ["medium", "high"]) {
    const p = await b.newPage({ viewport: { width: 960, height: 540 } });
    await p.goto(`http://localhost:${port}/?test=1`);
    await p.waitForFunction(() => __game.world.assetsReady);
    const row = await p.evaluate((q) => {
      const g = __game;
      g.frame = () => {};
      g.save.settings.audio = false;
      g.start();
      g.race.state = "racing";
      g.world.quality(q);
      const w = g.world,
        gl = w.renderer.getContext(),
        samples = [];
      let shadowPasses = 0,
        calls = 0,
        tris = 0;
      let first;
      w.carMeshes[0].traverse((o) => {
        if (o.isMesh && o.castShadow && !first) first = o;
      });
      first.onBeforeShadow = () => shadowPasses++;
      for (let n = 0; n < 40; n++) {
        for (const c of g.race.cars) {
          c.x += Math.sin(c.heading) * 0.4;
          c.z += Math.cos(c.heading) * 0.4;
        }
        const start = performance.now();
        w.render(1 / 60, g.race.cars, "racing");
        gl.finish();
        if (n >= 10) {
          samples.push(performance.now() - start);
          calls += w.renderer.info.render.calls;
          tris += w.renderer.info.render.triangles;
        } else shadowPasses = 0;
      }
      samples.sort((a, b) => a - b);
      return {
        sampleFrames: 30,
        meanMs: samples.reduce((a, b) => a + b, 0) / 30,
        p95Ms: samples[28],
        shadowPasses,
        meanCalls: calls / 30,
        meanTriangles: tris / 30,
        resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      };
    }, quality);
    rows.push({ version, quality, ...row });
    await p.close();
  }
await fs.writeFile(
  "tests/performance/shadows/cadence-cost.json",
  JSON.stringify(rows, null, 2),
);
console.log(rows);
await b.close();
