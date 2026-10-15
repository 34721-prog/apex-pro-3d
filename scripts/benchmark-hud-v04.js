import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const [tag = "after", port = "5173"] = process.argv.slice(2);
const b = await chromium.launch({
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://localhost:${port}/?test=1`);
await p.waitForFunction(() => __game?.world.assetsReady);
const result = await p.evaluate(async () => {
  const g = __game;
  g.frame = () => {};
  await new Promise(requestAnimationFrame);
  g.start();
  g.race.state = "racing";
  const times = [];
  let now = performance.now() + 1000;
  for (let i = 0; i < 240; i++) {
    for (let n = 0; n < 6; n++) g.race.step(1 / 60, {}, true);
    const t = performance.now();
    g.ui.updateHUD(g.race, (now += 101));
    times.push(performance.now() - t);
  }
  const a = times.slice(40).sort((a, b) => a - b);
  return {
    samples: a.length,
    meanMs: a.reduce((s, x) => s + x, 0) / a.length,
    p95Ms: a[Math.floor(a.length * 0.95)],
    method:
      "200 warmed dynamic HUD updates (each after 6 physical ticks), 1280x720; CPU only, not paint or total FPS",
  };
});
console.log(result);
await fs.writeFile(
  `tests/performance/v04/${tag}-hud.json`,
  JSON.stringify(result, null, 2),
);
await b.close();
