import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto("http://localhost:5173/?test=1");
await page.waitForFunction(() => window.__game?.world.assetsReady);
const urls = await page.evaluate(async () => {
  const THREE = await import("/node_modules/three/build/three.module.js");
  const { makeCar } = await import("/src/models.js");
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(480, 300);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#e8f3ff", "#546779", 3));
  const light = new THREE.DirectionalLight("#fff4e5", 4);
  light.position.set(2, 7, 6);
  scene.add(light);
  const camera = new THREE.PerspectiveCamera(34, 480 / 300, 0.1, 100);
  camera.position.set(6.6, 4.6, 8.5);
  camera.lookAt(0, 0.55, 0);
  const data = [];
  for (let i = 0; i < 12; i++) {
    const car = makeCar(i);
    scene.add(car);
    renderer.render(scene, camera);
    data.push(renderer.domElement.toDataURL("image/png"));
    scene.remove(car);
  }
  renderer.dispose();
  return data;
});
for (let i = 0; i < urls.length; i++)
  await fs.writeFile(
    `public/assets/cars/thumbnails/car-${i}.png`,
    Buffer.from(urls[i].split(",")[1], "base64"),
  );
await page.screenshot({ path: "tests/home-desktop.png" });
console.log(
  await page.evaluate(() => ({
    draws: __game.world.renderer.info.render.calls,
    triangles: __game.world.renderer.info.render.triangles,
  })),
);
await browser.close();
