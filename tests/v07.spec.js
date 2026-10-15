import { test, expect } from "@playwright/test";
import fs from "node:fs";
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?test=1");
  await page.waitForFunction(() => __game?.world.assetsReady);
  return errors;
}
test("v07 venue gallery, actual boards, populated quality levels and moving cars in spectator camera", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.locator("[data-nav=tracks]").click();
  await page.locator("[data-action=venue-tour]").click();
  expect(await page.evaluate(() => __game.world.mode)).toBe("venue-preview");
  await page.locator("[data-action=track-overview]").click();
  expect(await page.evaluate(() => __game.world.mode)).toBe("track-preview");
  const result = await page.evaluate(() => {
    const g = __game;
    g.frame = () => {};
    g.save.settings.bots = 5;
    g.start();
    g.race.state = "racing";
    g.world.cameraMode = "grandstands";
    g.world.venueFocus = 0;
    const counts = [];
    for (const q of ["low", "medium", "high"]) {
      g.world.quality(q);
      g.world.render(0.5, g.race.cars, "racing");
      counts.push(g.world.venues.parts.reduce((s, p) => s + p.crowd.count, 0));
    }
    const p = g.race.cars[0];
    p.x += 4;
    g.world.render(0.2, g.race.cars, "racing");
    g.world.venues.drawBoard(g.race);
    g.ui.updateHUD(g.race,performance.now());
    return {
      counts,
      meshX: g.world.carMeshes[0].position.x,
      x: p.x,
      rows: g.world.venues.boardState.rows.map((x) => x.id),
      actual: g.race
        .standings()
        .slice(0, 4)
        .map((c) => c.id),
      state: g.world.venues.boardState.state,
      lights: g.world.scene.children.filter((o) => o.isLight).length,
    };
  });
  expect(new Set(result.counts).size).toBe(1);
  expect(result.counts[0]).toBeGreaterThan(3700);
  expect(result.meshX).toBe(result.x);
  expect(result.rows).toEqual(result.actual);
  expect(result.state).toBe("racing");
  await page.screenshot({ path: "tests/performance/v07/live-board.png" });
  expect(errors).toEqual([]);
});
test("v07 streaming mixer: gesture, six cues, no restart, master/buses, pause/hidden/repeated race cleanup", async ({
  page,
}) => {
  const errors = await boot(page);
  expect(await page.evaluate(() => __game.audio.context)).toBeNull();
  await page.keyboard.press("Shift");
  await page.waitForFunction(
    () =>
      __game.audio.music?.current === "menu" &&
      __game.audio.music.decks.some((d) => d.element.currentTime > 0.1),
  );
  await page.evaluate(() => {
    const g = __game;
    g.frame = () => {};
    window.audioTestTimer = setInterval(
      () => g.audio.tick(g.race, g.ui, g.world.venues),
      50,
    );
    window.audioTap = (node) => {
      const a = g.audio.context.createAnalyser(),
        zero = g.audio.context.createGain();
      a.fftSize = 2048;
      zero.gain.value = 0;
      node.connect(a);
      a.connect(zero);
      zero.connect(g.audio.context.destination);
      return a;
    };
    window.musicTap = audioTap(g.audio.musicBus);
    window.masterTap = audioTap(g.audio.output);
    window.audioRMS = (a) => {
      const d = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(d);
      return Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);
    };
  });
  await expect
    .poll(() => page.evaluate(() => audioRMS(musicTap)))
    .toBeGreaterThan(0.001);
  const stamp = await page.evaluate(() => ({
    transitions: __game.audio.music.transitions,
    time: __game.audio.music.decks[__game.audio.music.active].element
      .currentTime,
  }));
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) __game.ui.render();
  });
  await page.waitForTimeout(250);
  const stable = await page.evaluate(() => ({
    transitions: __game.audio.music.transitions,
    time: __game.audio.music.decks[__game.audio.music.active].element
      .currentTime,
  }));
  expect(stable.transitions).toBe(stamp.transitions);
  expect(stable.time).toBeGreaterThan(stamp.time);
  for (const [pageName, cue] of [
    ["garage", "selection"],
    ["operations", "championship"],
  ]) {
    await page.evaluate((p) => __game.ui.navigate(p), pageName);
    await page.waitForFunction(
      (c) => __game.audio.music.current === c && !__game.audio.music.fade,
      cue,
    );
  }
  await page.evaluate(() => __game.setting("volume", 0));
  await expect
    .poll(() => page.evaluate(() => audioRMS(masterTap)))
    .toBeLessThan(0.00001);
  await page.evaluate(() => {
    __game.setting("volume", 0.6);
    __game.start();
    __game.world.render(0.1, __game.race.cars, "countdown");
  });
  await page.waitForFunction(
    () => __game.audio.music.current === "grid" && !__game.audio.music.fade,
  );
  await page.waitForFunction(() => __game.audio.crowd.beds.length === 2);
  await page.evaluate(() => {
    __game.race.state = "racing";
    __game.race.cars[0].speed = 35;
    window.engineTap = audioTap(__game.audio.master);
    __game.setting("raceMusic", true);
  });
  await page.waitForFunction(
    () => __game.audio.music.current === "race" && !__game.audio.music.fade,
  );
  await expect
    .poll(() => page.evaluate(() => audioRMS(engineTap)))
    .toBeGreaterThan(0.001);
  await page.evaluate(() => __game.setting("musicVolume", 0));
  await expect
    .poll(() => page.evaluate(() => audioRMS(musicTap)))
    .toBeLessThan(0.00001);
  expect(await page.evaluate(() => audioRMS(engineTap))).toBeGreaterThan(0.001);
  await page.evaluate(() => __game.setting("musicVolume", 0.45));
  await page.evaluate(() => {
    __game.race.state = "paused";
  });
  await page.waitForFunction(() =>
    __game.audio.music.decks.every((d) => d.element.paused),
  );
  const paused = await page.evaluate(
    () =>
      __game.audio.music.decks[__game.audio.music.active].element.currentTime,
  );
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(
      () =>
        __game.audio.music.decks[__game.audio.music.active].element.currentTime,
    ),
  ).toBeCloseTo(paused, 2);
  expect(await page.evaluate(() => __game.audio.crowd.beds.length)).toBe(0);
  await page.evaluate(() => __game.audio.setHidden(true));
  await page.waitForFunction(() => __game.audio.context.state === "suspended");
  await page.evaluate(() => __game.audio.setHidden(false));
  await page.waitForFunction(() => __game.audio.context.state === "running");
  expect(
    await page.evaluate(() =>
      __game.audio.music.decks.every((d) => d.element.paused),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    __game.race.state = "results";
    __game.race.done = true;
  });
  await page.waitForFunction(
    () => __game.audio.music.current === "victory" && !__game.audio.music.fade,
  );
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      __game.action("results-home");
      __game.start();
      __game.world.render(0.1, __game.race.cars, "countdown");
    });
    await page.waitForFunction(() => __game.audio.crowd.beds.length === 2);
    await page.evaluate(() => __game.action("results-home"));
    await page.waitForFunction(() => __game.audio.crowd.beds.length === 0);
  }
  await page.waitForFunction(
    () => __game.audio.music.current === "menu" && !__game.audio.music.fade,
  );
  const summary = await page.evaluate(() => ({
    streams: __game.audio.music.decks.length,
    maxStreams: __game.audio.music.maxConcurrent,
    playing: __game.audio.music.decks.filter((d) => !d.element.paused).length,
    crowdMaxSources: __game.audio.crowd.maxSources,
    errors: [...__game.audio.music.errors, ...__game.audio.crowd.errors],
    saved: JSON.parse(localStorage.getItem("apex-dynasty-v1")).settings,
  }));
  expect(summary.streams).toBe(2);
  expect(summary.maxStreams).toBeLessThanOrEqual(2);
  expect(summary.playing).toBe(1);
  expect(summary.crowdMaxSources).toBeLessThanOrEqual(3);
  expect(summary.errors).toEqual([]);
  expect(summary.saved.raceMusic).toBe(true);
  expect(errors).toEqual([]);
  fs.writeFileSync(
    "tests/performance/v07/audio-browser.json",
    JSON.stringify(summary, null, 2),
  );
});
test("v07 all tracks: actual mesh footprint/ground, safe venue disposal, repeat resource bounds", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    __game.frame = () => {};
  });
  const ids = [
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
    "aurora",
  ];
  const rows = [];
  for (const id of ids) {
    rows.push(
      await page.evaluate(async (id) => {
        const g = __game;
        await g.loadTrack(id, { page: true });
        const w = g.world;
        w.venueFocus = 4;
        w.setMode("venue-preview");
        w.render(0.1);
        let outside = 0,
          below = 0;
        for (const p of w.venues.parts) {
          const a = p.geometry.attributes.position;
          for (let i = 0; i < a.count; i++) {
            if (
              Math.abs(a.getX(i)) > p.venue.halfWidth + 0.01 ||
              Math.abs(a.getZ(i)) > p.venue.halfDepth + 0.01
            )
              outside++;
            if (a.getY(i) < -0.061) below++;
          }
        }
        return {
          id,
          outside,
          below,
          counts: w.venues.parts.map((p) => p.crowd.count),
          memory: { ...w.renderer.info.memory },
          programs: w.renderer.info.programs.length,
        };
      }, id),
    );
  }
  for (const r of rows) {
    expect(r.outside).toBe(0);
    expect(r.below).toBe(0);
    expect(r.counts).toHaveLength(10);
    expect(Math.min(...r.counts)).toBeGreaterThan(250);
  }
  expect(rows.at(-1).memory.geometries).toBeLessThanOrEqual(
    rows[0].memory.geometries,
  );
  expect(rows.at(-1).memory.textures).toBeLessThanOrEqual(
    rows[0].memory.textures,
  );
  expect(rows.at(-1).programs).toBeLessThanOrEqual(rows[0].programs);
  expect(errors).toEqual([]);
  fs.writeFileSync(
    "tests/performance/v07/resources-browser.json",
    JSON.stringify(rows, null, 2),
  );
});

test("v07 crowd spatial response, bounded celebrations and independent engine/effects/crowd sliders", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.keyboard.press("Shift");
  await page.evaluate(() => {
    const g = __game;
    g.frame = () => {};
    g.start();
    g.race.state = "racing";
    g.save.settings.volume = 1;
    g.save.settings.music = false;
    g.audio.configure(g.save.settings);
    window.crowdTimer = setInterval(() => {
      g.world.venues.audience.update(g.race);
      g.audio.tick(g.race, g.ui, g.world.venues);
    }, 50);
  });
  await page.waitForFunction(() => __game.audio.crowd.beds.length === 2);
  const near = await page.evaluate(() => {
    const g = __game,
      v = g.world.venues.plan[0],
      p = g.race.cars[0];
    p.x = v.x + 20;
    p.z = v.z;
    p.heading = 0;
    p.speed = 30;
    g.race.emit("start");
    return { x: p.x, z: p.z };
  });
  await page.waitForTimeout(600);
  const initial = await page.evaluate(() => ({
    gains: __game.audio.crowd.beds.map((b) => b.gain.gain.value),
    pan: __game.audio.crowd.beds[0].pan.pan.value,
    cheer: !!__game.audio.crowd.cheer,
    sources: __game.audio.crowd.maxSources,
  }));
  expect(initial.gains[0]).toBeGreaterThan(0.1);
  expect(initial.pan).toBeLessThan(-0.5);
  expect(initial.cheer).toBe(true);
  expect(initial.sources).toBe(3);
  await page.evaluate(() => {
    const r = __game.race;
    r.cars[0].finished = true;
    r.cars[0].finishTime = 80;
    r.emit("finish", 0);
    r.state = "results";
    r.done = true;
  });
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() =>
      __game.world.venues.audience.events.some((e) => e.kind === "victory"),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => __game.audio.crowd.maxSources)).toBe(3);
  await page.evaluate(() => {
    __game.race.state = "racing";
    __game.race.done = false;
    __game.race.cars[0].finished = false;
    __game.race.cars[0].x = 10000;
    __game.race.cars[0].z = 10000;
  });
  await page.waitForTimeout(2400);
  expect(
    await page.evaluate(() =>
      Math.max(...__game.audio.crowd.beds.map((b) => b.gain.gain.value)),
    ),
  ).toBeLessThan(0.0001);
  // A tiny active probe keeps otherwise disconnected AudioParams processing;
  // .value on an idle Web Audio bus can legitimately retain its last sample.
  await page.evaluate(()=>{const a=__game.audio,o=a.context.createOscillator(),gain=a.context.createGain();gain.gain.value=.0001;o.connect(gain);gain.connect(a.effectsBus);gain.connect(a.crowdBus);o.start();window.volumeProbe=o;});
  for (const [setting, bus] of [
    ["engineVolume", "master"],
    ["effectsVolume", "effectsBus"],
    ["crowdVolume", "crowdBus"],
  ]) {
    await page.evaluate((k) => __game.setting(k, 0), setting);
    await page.waitForTimeout(500);
    expect(
      await page.evaluate((k) => __game.audio[k].gain.value, bus),
    ).toBeLessThan(0.00001);
    await page.evaluate((k) => __game.setting(k, 0.8), setting);
    await page.waitForTimeout(500);
    expect(
      await page.evaluate((k) => __game.audio[k].gain.value, bus),
    ).toBeGreaterThan(0.1);
  }
  await page.evaluate(() => __game.action("results-home"));
  await page.waitForFunction(
    () => __game.audio.crowd.beds.length === 0 && !__game.audio.crowd.cheer,
  );
  expect(errors).toEqual([]);
  await page.evaluate(()=>volumeProbe.stop());
  fs.writeFileSync(
    "tests/performance/v07/crowd-browser.json",
    JSON.stringify({ near, initial, errors }, null, 2),
  );
});
