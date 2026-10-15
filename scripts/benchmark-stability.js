// Comparable production benchmark; no game code instrumentation in releases.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const url = process.env.GAME_URL || "http://localhost:5190";
const tag = process.argv[2] || "before";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const results = [];
for (const track of ["aurora", "neon"])
  for (const shadows of [1024, 0]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await page.addInitScript(
      ({ track, shadows }) => {
        localStorage.clear();
        localStorage.setItem("apex-dynasty-save", JSON.stringify({}));
        window.__benchConfig = { track, shadows };
      },
      { track, shadows },
    );
    const start = Date.now();
    await page.goto(url + "/?test=1");
    await page.waitForFunction(() => window.__game?.world.assetsReady);
    const initialMs = Date.now() - start;
  await page.waitForFunction(() => __game.world.renderer.info.render.frame > 0);
  const firstSubmissionMs = Date.now() - start;
    const data = await page.evaluate(async () => {
      const g = __game;
      g.frame = () => {};
      await new Promise(requestAnimationFrame);
      const start = performance.now();
      g.switchTrack(__benchConfig.track);
      await g.world.ready;
      const switchMs = performance.now() - start;
      Object.assign(g.save.settings, {
        track: __benchConfig.track,
        quality: "custom",
        resolution: 1,
        shadows: __benchConfig.shadows,
        particles: 128,
        effects: true,
        detail: 1,
        autoQuality: false,
        bots: 5,
        laps: 8,
        realism: "realistic",
        weather: "rain",
        weatherProgram: "stable",
        controlMode: "manager",
      });
      g.world.quality(g.save.settings);
      g.start();
      g.race.state = "racing";
      g.audio.stop?.();
      const r = g.race,
        w = g.world;
      w.cameraMode = "chase";
    w.elapsed = 0; w.venues.clock = 0; w.venues.nextBoard = 0;
      const sim = [],
        render = [],
        ui = [],
        strategy = [],
        venue = [],
        intervals = [];
      let last = 0;
      const wrap = (obj, key, arr) => {
        const fn = obj[key];
        obj[key] = function (...args) {
          const t = performance.now();
          const v = fn.apply(this, args);
          arr.push(performance.now() - t);
          return v;
        };
      };
      wrap(r.manager, "recommend", strategy);
      wrap(w.venues, "update", venue);
      for (let i = 0; i < 100; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        if (i >= 20) intervals.push(now - last);
        last = now;
        let t = performance.now();
        for (let n = 0; n < 6; n++) r.step(1 / 60, {}, false);
        const sm = performance.now() - t;
        t = performance.now();
        g.ui.updateHUD(r, i * 100);
        const um = performance.now() - t;
        t = performance.now();
        w.render(0.1, r.cars, r.state);
        const rm = performance.now() - t;
        if (i >= 20) {
          sim.push(sm);
          ui.push(um);
          render.push(rm);
        }
      }
      const stats = (a) => {
        const s = [...a].sort((a, b) => a - b);
        return {
          n: s.length,
          mean: s.reduce((x, y) => x + y, 0) / s.length,
          p95: s[Math.ceil(s.length * 0.95) - 1],
          p99: s[Math.ceil(s.length * 0.99) - 1],
          max: s.at(-1),
        };
      };
      return {
        switchMs,
        frame: stats(intervals),
        simulationSixTicks: stats(sim),
        renderSubmission: stats(render),
        ui: stats(ui),
        recommend: stats(strategy),
        venues: stats(venue),
        calls: w.renderer.info.render.calls,
        triangles: w.renderer.info.render.triangles,
        ...w.renderer.info.memory,
        carCount: r.cars.length,
        spectators: w.venues.plan.reduce((s, v) => s + v.spectators, 0),
        heap: performance.memory?.usedJSHeapSize,
        programs: w.renderer.info.programs.length,
        progress: r.cars.map((c) => c.progress),
      };
    });
    results.push({ track, shadows, initialMs, firstSubmissionMs, ...data });
    await page.close();
    console.log(track, shadows, data.frame);
  }
await browser.close();
fs.mkdirSync("tests/performance/v081", { recursive: true });
fs.writeFileSync(
  `tests/performance/v081/${tag}-browser.json`,
  JSON.stringify(
    {
      url,
      scenario:
        "1280x720, high-equivalent custom, six cars, rain, populated stands; 20 warm + 80 measured frames, six fixed ticks per frame; audio excluded; SwiftShader",
      results,
    },
    null,
    2,
  ),
);
