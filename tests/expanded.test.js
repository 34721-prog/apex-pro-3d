import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { driverCatalog, pilotStats } from "../src/data/drivers.js";
import { vehicles, performance as stats } from "../src/garage.js";
import { defaults, validateSave } from "../src/save.js";
import { Race } from "../src/race.js";
import { configureTrack } from "../src/track.js";
import { rewardRace } from "../src/progression.js";
import { AdminPanel } from "../src/admin/AdminPanel.js";
import { RaceEngineer } from "../src/audio/RaceEngineer.js";
import { updateFlags } from "../src/racing/Flags.js";
import { assignTeam } from "../src/career/TeamManager.js";
test("31 unique pilots, 12 cars, portraits, helmets, thumbnails and GLB exist", () => {
  assert.equal(driverCatalog.length, 31);
  for (const [tier, n] of [
    ["normal", 10],
    ["mythic", 10],
    ["legendary", 10],
    ["mega", 1],
  ])
    assert.equal(driverCatalog.filter((d) => d.tier === tier).length, n);
  assert.equal(new Set(driverCatalog.map((d) => d.name)).size, 31);
  assert.equal(vehicles.length, 12);
  for (const d of driverCatalog) {
    assert.ok(fs.existsSync("public" + d.portrait));
    assert.ok(fs.existsSync("public" + d.helmet));
    assert.ok(Object.values(d.attributes).every(Number.isFinite));
  }
  for (let i = 0; i < 12; i++)
    assert.ok(fs.existsSync(`public/assets/cars/thumbnails/car-${i}.png`));
  assert.equal(
    fs
      .readdirSync("public/assets/cars/models")
      .filter((f) => f.endsWith(".glb")).length,
    12,
  );
});
test("Mega uses finite limits and realistic mode removes extreme multiplier", () => {
  const base = stats(defaults()),
    normal = pilotStats(base, 30, "mega", "realistic"),
    mega = pilotStats(base, 30, "mega", "arcade");
  assert.equal(driverCatalog[30].overall, "∞");
  assert.equal(normal.maxSpeed, base.maxSpeed);
  assert.ok(mega.maxSpeed > base.maxSpeed && mega.maxSpeed <= 110);
  assert.ok(Object.values(mega).every(Number.isFinite));
});
test("career data and custom paints survive validation, malformed arrays are rejected", () => {
  const s = defaults();
  s.customizations[7] = {
    primary: "#12acde",
    secondary: "#ed3267",
    detail: "#182331",
    number: 86,
  };
  s.unlockedDrivers = [0, 15, 30];
  s.selectedDriver = 30;
  s.team.partner = 15;
  s.unlockedCars.push(7);
  s.selectedCar = 7;
  s.history.push({
    track: "neon",
    position: 2,
    time: 250,
    mode: "quick",
    driver: 30,
    car: 7,
  });
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
});
test("admin login isolates career, restore and exit never mutate the normal save", () => {
  const original = defaults(),
    g = { save: original },
    admin = new AdminPanel();
  assert.equal(admin.enter(g, "wrong"), false);
  assert.equal(admin.enter(g, "123456789"), true);
  admin.unlock(g);
  g.save.credits = 999999;
  assert.equal(original.credits, 1200);
  assert.equal(original.unlockedCars.length, 1);
  admin.restore(g);
  assert.equal(g.save.credits, 1200);
  admin.exit(g);
  assert.equal(g.save, original);
});
test("radio priorities and cooldowns work without browser voice support", () => {
  const e = new RaceEngineer();
  assert.ok(e.say("Combustível baixo", 3, 30, "fuel"));
  assert.equal(e.say("Rotina", 1, 31, "routine"), false);
  assert.equal(e.say("Combustível baixo", 3, 32, "fuel"), false);
  assert.ok(e.say("Volta concluída", 1, 40, "lap"));
  assert.equal(e.message, "Volta concluída");
});
test("VSC actually slows traffic and returns green; pause freezes time and resources", () => {
  configureTrack("aurora");
  const r = new Race({ realism: "realistic" });
  r.state = "racing";
  r.time = 10;
  r.cars[1].impact = 30;
  updateFlags(r, 1 / 60);
  assert.equal(r.flag, "yellow");
  for (let i = 0; i < 60 * 4; i++) r.step(1 / 60, {}, true);
  assert.ok(r.cars.every((c) => c.speed < 25));
  r.pause();
  const t = r.time,
    fuel = r.cars[0].fuel,
    pit = r.cars[0].pit.remaining;
  for (let i = 0; i < 120; i++) r.step(1 / 60, {}, true);
  assert.equal(r.time, t);
  assert.equal(r.cars[0].fuel, fuel);
  assert.equal(r.cars[0].pit.remaining, pit);
  r.pause();
  for (let i = 0; i < 60 * 15; i++) r.step(1 / 60, {}, true);
  assert.equal(r.flag, "green");
});
test("8-lap realistic endurance finishes and bots actually use the pit lane", () => {
  configureTrack("aurora");
  const r = new Race({ mode: "manager", realism: "realistic", laps: 8 });
  for (let i = 0; i < 60 * 1400 && !r.done; i++) r.step(1 / 60, {}, true);
  assert.ok(r.done);
  assert.ok(r.cars.every((c) => c.finished));
  assert.ok(r.cars.every((c) => c.pit.stops > 0));
  assert.ok(r.cars.every((c) => c.fuel >= 0 && c.fuel <= 110));
  assert.ok(r.cars.every((c) => c.tires.health >= 0.05 && c.tires.health <= 1));
});
test("time trial does not grant a fake podium; manager assigns a hired teammate", () => {
  configureTrack("aurora");
  const s = defaults(),
    r = new Race({ mode: "time-trial", laps: 1 });
  for (let i = 0; i < 18000 && !r.done; i++) r.step(1 / 60, {}, true);
  rewardRace(s, r);
  assert.equal(s.stats.wins, 0);
  assert.equal(s.stats.podiums, 0);
  assert.equal(r.cars.length, 1);
  s.unlockedDrivers.push(15);
  s.team.partner = 15;
  const m = new Race({ mode: "manager" });
  assignTeam(m, s);
  assert.equal(m.cars[1].driverId, 15);
  assert.ok(m.cars[1].teammate);
});
