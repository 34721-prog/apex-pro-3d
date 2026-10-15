import { chromium } from "@playwright/test";
import fs from "node:fs";
const tag = process.argv[2] || "before",
  url = process.env.GAME_URL || "http://localhost:5200";
const dir = "tests/performance/v09";
fs.mkdirSync(dir + "/visual", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(url + "/?test=1");
await page.waitForFunction(() => window.__game?.world.assetsReady);
const data = await page.evaluate(async () => {
  const g = __game;
  g.frame = () => {};
  await new Promise(requestAnimationFrame);
  Object.assign(g.save.settings, {
    bots: 5,
    controlMode: "manager",
    autoQuality: false,
    quality: "medium",
  });
  g.start();
  g.race.state = "racing";
  g.world.quality("medium");
  const r = g.race,
    w = g.world,
    c = r.cars[0],
    m = w.carById.get(c.id);
  const wheel = () => m._wheels[0]._spin?.rotation.x ?? m._wheels[0].rotation.x;
  for (let i = 0; i < 300; i++) r.step(1 / 60, {});
  w.render(1 / 60, r.cars, r.state);
  const a = wheel(),
    time = r.time;
  for (let i = 0; i < 12; i++) w.render(1 / 60, r.cars, r.state);
  const unadvancedSpin = wheel() - a;
  const values = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 30; j++) r.step(1 / 60, {});
    w.render(1 / 60, r.cars, r.state);
    values.push({ time: r.time, speed: c.speed, spin: wheel() });
  }
  w.cameraMode = "pit-wheels";
  w.cameraReady = false;
  // Diagnostic side view of actual car; rendering remains the game's own renderer.
  const sn = Math.sin(c.heading),
    cs = Math.cos(c.heading);
  w.render(0, r.cars, r.state);
  w.camera.position.set(c.x + cs * 7 + sn * 5, 2.3, c.z - sn * 7 + cs * 5);
  w.camera.lookAt(c.x, 0.8, c.z);
  w.camera.fov = 48;
  w.camera.updateProjectionMatrix();
  w.dynamicShadows.update(w.camera, m.position, w.carMeshes, w.safetyMesh);
  w.renderer.render(w.scene, w.camera);
  w.renderer.getContext().finish();
  const roots = m._wheels.map((o) => ({
    name: o.name,
    front: o.userData.front,
    position: o.position.toArray(),
    rotation: o.rotation.toArray(),
  }));
  return {
    time,
    unadvancedSpin,
    values,
    wheels: roots,
    root: m.position.toArray(),
    bodyRotation: m.rotation.toArray(),
    glbWheelNames: w.getCar(0).children.map((o) => o.name),
    stats: { ...w.renderer.info.render },
    cars: r.cars.length,
  };
});
await page.screenshot({
  path: dir + "/visual/" + tag + "-wheel-contact.jpg",
  quality: 88,
});
fs.writeFileSync(
  dir + "/" + tag + "-motion-probe.json",
  JSON.stringify({ url, data, errors }, null, 2),
);
await browser.close();
console.log(JSON.stringify({ data, errors }, null, 2));
