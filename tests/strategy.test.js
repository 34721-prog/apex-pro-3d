import { test } from "node:test";
import assert from "node:assert/strict";
import { Race } from "../src/race.js";
import { at, length, configureTrack } from "../src/track.js";
import { trackCatalog } from "../src/data/tracks.js";
test("all distinct full-scale circuits; AI completes two laps on each", () => {
  const sizes = [];
  for (const track of trackCatalog) {
    configureTrack(track.id);
    sizes.push(Math.round(length));
    const r = new Race({ laps: 2 });
    for (let tick = 0; tick < 60 * 800 && !r.done; tick++)
      r.step(1 / 60, {}, true);
    console.log(
      track.id,
      Math.round(length),
      "m",
      r.time.toFixed(1) + "s",
      r.cars.map((c) => c.lap),
    );
    assert.ok(length > 2900);
    assert.ok(r.done, track.id);
    assert.ok(
      r.cars.every((c) => c.finished),
      track.id,
    );
  }
  assert.equal(new Set(sizes).size, trackCatalog.length);
  configureTrack("aurora");
});
test("real physical pit entry, stop, service and exit; resources bounded", () => {
  configureTrack("aurora");
  const r = new Race({ laps: 2, realism: "realistic", mode: "manager" });
  r.state = "racing";
  const c = r.cars[0],
    t = at(length - 220);
  Object.assign(c, {
    x: t.p.x,
    z: t.p.z,
    s: length - 220,
    previousS: length - 220,
    heading: t.heading,
    velocityHeading: t.heading,
    speed: 20,
    vx: t.dir.x * 20,
    vz: t.dir.z * 20,
    progress: -220,
  });
  c.pit.requested = true;
  c.tires.health = 0.1;
  c.damage = 0.25;
  c.fuel = 2;
  let seen = new Set();
  for (let i = 0; i < 60 * 90; i++) {
    r.step(1 / 60, {});
    seen.add(c.pit.state);
    if (c.pit.stops && c.pit.state === "track") break;
  }
  console.log(
    "pit states",
    seen,
    "stops",
    c.pit.stops,
    "s",
    c.s,
    "speed",
    c.speed,
  );
  assert.ok(seen.has("entry"));
  assert.ok(seen.has("service"));
  assert.ok(seen.has("exit"));
  assert.equal(c.pit.stops, 1);
  assert.equal(c.pit.state, "track");
  assert.ok(c.fuel > 80 && c.fuel <= 110);
  assert.ok(c.tires.health > 0.9);
  assert.equal(c.damage, 0);
});
