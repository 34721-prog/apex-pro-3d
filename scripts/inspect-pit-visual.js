import { chromium } from "@playwright/test";
const b = await chromium.launch({
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (e) => {
  if (e.type() === "warning" || e.type() === "error") errors.push(e.text());
});
await p.goto("http://localhost:5181/?test=1");
await p.waitForFunction(() => __game?.world.assetsReady);
console.log(
  await p.evaluate(async () => {
    const g = __game;
    g.frame = () => {};
    await new Promise(requestAnimationFrame);
    g.save.settings.mode = "manager";
    g.save.settings.realism = "realistic";
    g.save.settings.laps = 8;
    g.start();
    g.world.cameraMode = "pit-garage";
    g.race.cars[0].pit.requested = true;
    for (let i = 0; i < 18000 && g.race.cars[0].pit.state !== "service"; i++)
      g.race.step(1 / 60, {}, true);
    g.world.cameraReady = false;
    g.world.render(1 / 60, g.race.cars, "racing");
    g.ui.updateHUD(g.race, performance.now() + 100);
    return {
      time: g.race.time,
      pit: g.race.cars[0].pit,
      calls: g.world.renderer.info.render.calls,
      graphics: g.world.graphics,
    };
  }),
);
await p.screenshot({ path: "tests/performance/v03/pit-garage.png" });
await p.evaluate(() => {
  __game.action("pit-options");
});
await p.screenshot({ path: "tests/performance/v03/pit-strategy.png" });
console.log(errors);
await b.close();
