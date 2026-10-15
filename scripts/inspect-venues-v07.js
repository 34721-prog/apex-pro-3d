import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const port = process.argv[2] || 5181;
const b = await chromium.launch({
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1000, height: 650 } });
let errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await p.goto(`http://localhost:${port}/?test=1`);
await p.waitForFunction(() => __game.world.assetsReady);
await p.evaluate(() => {
  __game.frame = () => {};
  __game.ui.navigate("tracks");
});
const tracks = [
  "aurora",
  "veloce",
  "serpente",
  "neon",
  "titan",
  "vento",
  "sahara",
  "alpine",
  "emerald",
  "oldtown",
  "sunset",
  "nordic",
  "desert-night",
  "discovery",
];
const records = [];
for (const track of tracks) {
  await p.evaluate(async (id) => {
    const g = __game;
    await g.loadTrack(id, { page: true });
    g.world.container.style.cssText =
      "display:block;position:fixed;inset:0;width:100vw;height:100vh;z-index:9999;border-radius:0";
    g.world.resize();
  }, track);
  for (const sector of [0, 4, 7]) {
    const result = await p.evaluate((index) => {
      const w = __game.world;
      w.venueFocus = index;
      w.setMode("venue-preview");
      w.cameraReady = false;
      w.render(0.1);
      return {
        track: w.venues.plan[0].id.split("-0")[0],
        index,
        people: w.venues.parts.reduce((s, p) => s + p.crowd.count, 0),
        stats: { ...w.renderer.info.render },
        resources: { ...w.renderer.info.memory },
        board: w.venues.boardState,
        venue: w.venues.plan[index],
      };
    }, sector);
    await p.screenshot({type:"jpeg",quality:88,
      path: `tests/performance/v07/visual/${track}-${sector}.jpg`,
    });
    records.push(result);
  }
  console.log(track, records.at(-1).people);
}
await fs.writeFile(
  "tests/performance/v07/venue-inspection.json",
  JSON.stringify({ records, errors }, null, 2),
);
console.log("ERRORS", errors);
await b.close();
