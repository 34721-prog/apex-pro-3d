// Offline, deterministic real-engine frames. Playback FPS is NOT measured FPS.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const tag = process.argv[2] || "after",
  url = process.env.GAME_URL || "http://localhost:5201",
  ffmpeg = process.env.FFMPEG;
if (!ffmpeg)
  throw Error("Set FFMPEG to an installed ffmpeg executable with VP9 support");
const frames = path.resolve(".cache/motion-frames/" + tag),
  dir = "tests/performance/v09";
fs.mkdirSync(frames, { recursive: true });
fs.mkdirSync(dir + "/visual", { recursive: true });
const browser = await chromium.launch({
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(url + "/?test=1");
await page.waitForFunction(() => window.__game?.world.assetsReady);
await page.evaluate(async () => {
  const g = __game;
  g.frame = () => {};
  await new Promise(requestAnimationFrame);
  Object.assign(g.save.settings, {
    bots: 5,
    controlMode: "manager",
    quality: "medium",
    autoQuality: false,
    audio: false,
  });
  g.start();
  g.race.state = "racing";
  g.world.quality("medium");
  document.querySelector("#race-hud").style.visibility = "hidden";
  const label = document.createElement("div");
  label.id = "capture-label";
  label.style.cssText =
    "position:fixed;bottom:12px;left:12px;color:white;background:#101722df;font:14px sans-serif;padding:12px;z-index:9999";
  document.body.append(label);
});
const rows = [];
for (let i = 0; i < 192; i++) {
  const row = await page.evaluate((i) => {
    const g = __game,
      r = g.race,
      w = g.world,
      c = r.cars[0];
    if (i === 96) {
      let n = 0;
      while (n++ < 3000 && !(c.brake > 0.5 && c.speed > 25)) r.step(1 / 60, {});
    }
    if (i >= 24) {
      for (let j = 0; j < 2; j++) r.step(1 / 60, {});
    }
    w.render(1 / 30, r.cars, r.state, 0, 0.5);
    const m = w.carById.get(0),
      h = m.rotation.y,
      sn = Math.sin(h),
      cs = Math.cos(h);
    w.camera.position.set(
      m.position.x + cs * 7 + sn * 4,
      2.2,
      m.position.z - sn * 7 + cs * 4,
    );
    w.camera.lookAt(m.position.x, 0.8, m.position.z);
    w.camera.fov = 48;
    w.camera.updateProjectionMatrix();
    w.dynamicShadows.update(w.camera, m.position, w.carMeshes, w.safetyMesh);
    w.renderer.render(w.scene, w.camera);
    w.renderer.getContext().finish();
    const phase =
      i < 24 ? "Parado" : i < 96 ? "Largada autônoma" : "Frenagem / curva";
    document.getElementById("capture-label").textContent =
      `QA offline • ${phase} • t=${r.time.toFixed(2)} s • reprodução 30 fps (não é benchmark)`;
    return {
      frame: i,
      phase,
      time: r.time,
      speed: c.speed,
      brake: c.brake,
      steer: c.steer,
      heading: c.heading,
      x: c.x,
      z: c.z,
      wheelCount: m._wheels.length,
      spins: m._wheels.map((o) => o._spin?.rotation.x ?? o.rotation.x),
    };
  }, i);
  rows.push(row);
  const file = frames + "/" + String(i).padStart(4, "0") + ".jpg";
  await page.screenshot({ path: file, quality: 82 });
  if ([23, 72, 120, 180].includes(i))
    fs.copyFileSync(file, `${dir}/visual/${tag}-sequence-${i}.jpg`);
}
await browser.close();
fs.writeFileSync(
  `${dir}/${tag}-capture.json`,
  JSON.stringify(
    {
      url,
      scenario:
        "Offline real-engine captures; same deterministic 60Hz ticks; 960x540 medium six cars; 192 frames played at 30fps. No measured-FPS claim. Explicit scene cut at frame 96 seeks actual braking.",
      rows,
      errors,
    },
    null,
    2,
  ),
);
const result = spawnSync(
  ffmpeg,
  [
    "-y",
    "-f",
    "image2pipe",
    "-r",
    "30",
    "-c:v",
    "mjpeg",
    "-i",
    "pipe:0",
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "1300k",
    "-deadline",
    "realtime",
    "-pix_fmt",
    "yuv420p",
    `${dir}/${tag}-motion.webm`,
  ],
  {
    encoding: "utf8",
    input: Buffer.concat(
      fs
        .readdirSync(frames)
        .filter((f) => f.endsWith(".jpg"))
        .sort()
        .map((f) => fs.readFileSync(path.join(frames, f))),
    ),
    maxBuffer: 10 * 1024 * 1024,
  },
);
if (result.status !== 0) throw Error(result.stderr);
console.log(tag, "frames", rows.length, "errors", errors);
