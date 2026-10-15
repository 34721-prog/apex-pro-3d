import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, validateSave } from "../src/save.js";
import { performance, purchase } from "../src/garage.js";
import { Race } from "../src/race.js";
import { rewardRace } from "../src/progression.js";
import { standings, resetSeason } from "../src/championship.js";
test("upgrades charge once, improve actual physics and respect cap", () => {
  let s = defaults(),
    before = performance(s);
  assert.equal(purchase(s, "maxSpeed").ok, true);
  assert.equal(s.credits, 800);
  assert.ok(performance(s).maxSpeed > before.maxSpeed);
  s.credits = 0;
  assert.equal(purchase(s, "braking").ok, false);
  s.credits = 100000;
  s.upgrades.maxSpeed = 5;
  assert.equal(purchase(s, "maxSpeed").ok, false);
});
test("save validation rejects malformed values and preserves valid state", () => {
  assert.deepEqual(validateSave(null), defaults());
  let s = validateSave({
    version: 1,
    credits: -900,
    upgrades: { handling: 99 },
    settings: { audio: false, difficulty: "invalid" },
    unlockedCars: [4, 99],
    selectedCar: 99,
    championship: { results: [[null]] },
  });
  assert.equal(s.credits, 0);
  assert.equal(s.upgrades.handling, 5);
  assert.equal(s.selectedCar, 0);
  assert.equal(s.settings.audio, false);
  assert.equal(s.settings.difficulty, "normal");
  assert.equal(s.championship.results.length, 0);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
});
test("three races, credits, objectives, championship continuity, winner, new season", () => {
  let s = defaults();
  for (let round = 0; round < 3; round++) {
    const race = new Race({ laps: round + 3, championship: true });
    for (let i = 0; i < 60000 && !race.done; i++) race.step(1 / 60, {}, true);
    assert.ok(race.done);
    let reward = rewardRace(s, race);
    assert.ok(reward.credits > 0);
    let credits = s.credits;
    assert.equal(rewardRace(s, race), null);
    assert.equal(s.credits, credits);
    assert.equal(s.championship.results.length, round + 1);
    s = validateSave(JSON.parse(JSON.stringify(s)));
  }
  assert.equal(s.stats.seasons, 1);
  assert.ok(s.unlockedCars.includes(5));
  assert.ok(s.objectives.includes("season"));
  const table = standings(s.championship);
  assert.equal(
    table.reduce((n, d) => n + d.points, 0),
    88 * 3,
  );
  assert.ok(table[0].points >= table[1].points);
  s.championship = resetSeason(s.championship);
  assert.equal(s.championship.results.length, 0);
  assert.equal(s.championship.season, 2);
  assert.equal(s.stats.races, 3);
});
