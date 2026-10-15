import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Race } from "../src/race.js";
import { configureTrack, at, length, TRACK_WIDTH } from "../src/track.js";
import { trackCatalog } from "../src/data/tracks.js";
import { defaults, validateSave } from "../src/save.js";
import {
  beginSeason,
  sessionConfig,
  recordSession,
  table,
  constructors,
} from "../src/championships/Seasons.js";
import { seriesCatalog } from "../src/championships/Catalog.js";
import { stepCar, createDriver } from "../src/physics.js";
import { overlap } from "../src/racing/CollisionSystem.js";
import { strategyDecision } from "../src/strategy/PitStrategy.js";
fs.mkdirSync("tests/performance/v05", { recursive: true });
function place(c, s, lane = 0, speed = 0) {
  s = (s + length) % length;
  const p = at(s);
  Object.assign(c, {
    s,
    previousS: s,
    progress: s - length,
    lateral: lane,
    x: p.p.x + p.right.x * lane,
    z: p.p.z + p.right.z * lane,
    heading: p.heading,
    velocityHeading: p.heading,
    speed,
    vx: p.dir.x * speed,
    vz: p.dir.z * speed,
    index: -1,
  });
}
test("central flags: sector yellow/double, VSC, blue, red freeze/restart, warnings and black", () => {
  configureTrack();
  const r = new Race({ laps: 4, realism: "realistic" });
  r.state = "racing";
  r.time = 25;
  place(r.cars[0], 100, 0, 40);
  place(r.cars[1], length / 2, 0, 40);
  r.control.neutralize("yellow", "Saída física", 10, 1);
  assert.equal(r.control.signal(r.cars[0]).limit, 28);
  assert.equal(r.control.signal(r.cars[1]).flag, "green");
  r.control.neutralize("double-yellow", "Carro imobilizado", 10, 1);
  assert.equal(r.control.signal(r.cars[0]).limit, 14);
  r.control.neutralize("vsc", "Impacto medido", 8);
  for (let i = 0; i < 240; i++) r.step(1 / 60, {}, true);
  assert.ok(r.cars.every((c) => c.speed < 25));
  r.control.neutralize("red", "Condição insegura");
  const frozen = r.cars.map((c) => [c.x, c.z, c.fuel]),
    time = r.time;
  for (let i = 0; i < 600; i++) r.step(1 / 60, {}, true);
  assert.equal(r.time, time);
  assert.deepEqual(
    r.cars.map((c) => [c.x, c.z, c.fuel]),
    frozen,
  );
  for (let i = 0; i < 130; i++) r.step(1 / 60, {}, true);
  assert.equal(r.control.phase, "vsc");
  r.control.phase = "green";
  r.control.sectors.fill(null);
  place(r.cars[0], 100, 0, 20);
  place(r.cars[1], 70, 0, 40);
  r.cars[1].progress = r.cars[0].progress + length - 30;
  r.control.inspect();
  assert.equal(r.cars[0].blueFor, 1);
  r.control.decide(r.cars[0], "DANGEROUS_BLOCK", { changes: 4 });
  assert.ok(r.cars[0].ruleState.blackWhite);
  r.control.decide(r.cars[0], "IGNORE_ORDER", { to: 1 });
  r.control.decide(r.cars[0], "IGNORE_ORDER", { to: 1 });
  assert.equal(r.cars[0].disqualified, true);
  assert.equal(r.control.signal(r.cars[0]).flag, "black");
});
test("actual jump-start displacement, no penalty for stationary throttle-free grid", () => {
  configureTrack();
  const r = new Race({ botCount: 1 });
  for (let i = 0; i < 90; i++) r.step(1 / 60, { throttle: 1 });
  assert.ok(
    r.control.decisions.some(
      (d) => d.rule === "JUMP_START" && d.evidence.displacement > 0.6,
    ),
  );
  const clean = new Race();
  for (let i = 0; i < 300; i++) clean.step(1 / 60, {}, true);
  assert.equal(clean.control.decisions.length, 0);
});
test("illegal passing orders position return; pit/service penalty held and recorded once", () => {
  configureTrack();
  const r = new Race({ laps: 4, realism: "realistic", botCount: 1 });
  r.state = "racing";
  place(r.cars[0], 100, 0, 25);
  place(r.cars[1], 120, 0, 25);
  r.control.neutralize("vsc", "Incidente");
  r.control.clock = 4;
  r.control.order = [1, 0];
  r.control.previousOrder = [1, 0];
  r.cars[0].progress = r.cars[1].progress + 10;
  r.control.inspect();
  assert.equal(r.cars[0].returnTo, 1);
  assert.ok(r.control.decisions.some((d) => d.rule === "ILLEGAL_PASS"));
  const q = new Race({ laps: 4, realism: "realistic", botCount: 1 });
  q.state = "racing";
  place(q.cars[0], length - 235, 5, 26);
  q.control.decide(q.cars[0], "PIT_SPEED", { speed: 22, limit: 18 });
  q.cars[0].pit.requested = true;
  let held = false;
  for (let i = 0; i < 12000; i++) {
    q.step(1 / 60, {}, true);
    const c = q.cars[0];
    if (c.pit.state === "service" && c.pit.total - c.pit.remaining < 4) {
      held = true;
      assert.equal(c.pit.phase, 0);
    }
    if (c.pit.stops && c.pit.state === "track") break;
  }
  assert.ok(held);
  assert.equal(q.cars[0].pit.stops, 1);
  assert.equal(q.control.decisions[0].status, "served");
  assert.equal(q.cars[0].penalty, 0);
});
test("weather changes grip gradually, forecasts match schedule, repairs restore real mechanical/wing loss", () => {
  configureTrack();
  const r = new Race({
    laps: 6,
    weatherProgram: "showers",
    realism: "realistic",
    mechanicalRate: 0.15,
    botCount: 1,
  });
  r.state = "racing";
  let damp = false,
    wet = false;
  for (let i = 0; i < 18000; i++) {
    r.step(1 / 60, {}, true);
    damp ||= r.control.weather.condition === "úmida";
    wet ||= r.control.weather.condition === "molhada";
  }
  assert.ok(damp && wet);
  assert.ok(r.control.journal.some((e) => e.type === "weather"));
  const a = createDriver(0, "healthy", 100),
    b = createDriver(1, "fault", 100);
  b.mechanical = 0.6;
  for (let i = 0; i < 240; i++) {
    stepCar(a, { throttle: 1 }, 1 / 60);
    stepCar(b, { throttle: 1 }, 1 / 60);
  }
  assert.ok(a.speed > b.speed + 5);
  const c = r.cars[0];
  c.mechanical = 0.4;
  c.wingDamage = 0.5;
  c.damage = 0.3;
  c.pit.work = {
    compound: "medium",
    jobs: { repair: true, tires: true, fuel: true },
  };
  return import("../src/strategy/Resources.js").then(({ service }) => {
    service(c);
    assert.equal(c.mechanical, 0);
    assert.equal(c.wingDamage, 0);
    assert.equal(c.damage, 0);
  });
});
test("track geometry limits: no punishment without advantage/forced exit; repeated proven advantage escalates", () => {
  for (const t of [trackCatalog[0], trackCatalog[2], trackCatalog[9]]) {
    configureTrack(t.id);
    const r = new Race({ botCount: 1, realism: "realistic" });
    r.state = "racing";
    const c = r.cars[0];
    place(c, 500, TRACK_WIDTH / 2 + 3, 20);
    r.control.inspect();
    r.control.clock += 0.5;
    place(c, 501, 0, 20);
    r.control.inspect();
    assert.equal(r.control.decisions.length, 0);
    for (let i = 0; i < 3; i++)
      r.control.decide(c, "TRACK_GAIN", { advance: 50, path: 20 });
    assert.equal(c.penalty, 5);
    assert.ok(c.lapInvalid);
  }
});
const scMatrix = [];
for (const track of trackCatalog)
  test(`SC physical deploy/train/return/restart: ${track.id}`, () => {
    configureTrack(track.id);
    const r = new Race({ laps: 12, mode: "manager" });
    for (let i = 0; i < 1000; i++) r.step(1 / 60, {}, true);
    r.control.neutralize("sc", "Teste de incidente físico");
    const states = new Set();
    let maxMove = 0,
      collisions = 0,
      prev = { ...r.control.sc.car };
    for (let i = 0; i < 60 * 1600 && !r.done; i++) {
      r.step(1 / 60, {}, true);
      const sc = r.control.sc,
        c = sc.car;
      states.add(sc.state);
      maxMove = Math.max(maxMove, Math.hypot(c.x - prev.x, c.z - prev.z));
      prev = { x: c.x, z: c.z };
      for (const o of r.cars) if (overlap(c, o)) collisions++;
      if (r.control.phase === "green" && sc.state === "parked") break;
    }
    assert.ok(
      states.has("deploy") && states.has("train") && states.has("return"),
    );
    assert.equal(r.control.phase, "green");
    assert.equal(r.control.sc.state, "parked");
    assert.ok(maxMove < 0.8);
    assert.equal(collisions, 0);
    assert.equal(
      r.control.journal.filter(
        (e) => e.type === "incident" && String(e.detail).includes("Safety Car"),
      ).length,
      0,
    );
    scMatrix.push({
      track: track.id,
      states: [...states],
      maxMove,
      collisions,
      time: r.time,
      decisions: r.control.decisions.length,
    });
    fs.writeFileSync(
      "tests/performance/v05/safety-car-matrix.json",
      JSON.stringify(scMatrix, null, 2),
    );
  });
const seasons = [];
for (const def of seriesCatalog)
  test(`complete physical season, save, points and next season: ${def.id}`, () => {
    let s = defaults();
    s.career.reputation = 100;
    beginSeason(s, def.id);
    let total = 0;
    while (!s.competitions.series[def.id].complete) {
      const context = sessionConfig(s, def.id);
      configureTrack(context.track);
      const r = new Race(context.options);
      for (let n = 0; n < 60 * 2500 && !r.done; n++) r.step(1 / 60, {}, false);
      assert.ok(r.done, context.id);
      assert.ok(
        r.cars.every((c) => c.retirement !== "Tempo limite de encerramento"),
        context.id + ": no hidden pit deadlock",
      );
      const report = recordSession(s, r, context);
      assert.ok(report);
      const before = JSON.stringify(s);
      assert.equal(recordSession(s, r, context), null);
      assert.equal(JSON.stringify(s), before);
      s = validateSave(JSON.parse(JSON.stringify(s)));
      assert.ok(s.competitions.series[def.id]);
      total++;
      assert.ok(total < 30);
    }
    const st = s.competitions.series[def.id],
      ranking = table(st, def),
      teams = constructors(st, def);
    assert.equal(st.results.length, def.tracks.length);
    assert.equal(
      ranking.reduce((n, r) => n + r.points, 0),
      teams.reduce((n, t) => n + t.points, 0),
    );
    const summary = {
      id: def.id,
      sessions: total,
      races: st.results.length,
      points: ranking.map((r) => r.points),
      finishers: st.results.map(
        (r) => r.results.filter((c) => c.finished).length,
      ),
      decisions: st.sessions.reduce((n, r) => n + r.decisions.length, 0),
    };
    beginSeason(s, def.id);
    assert.equal(s.competitions.series[def.id].season, 2);
    assert.equal(s.competitions.series[def.id].history.length, 1);
    assert.equal(s.competitions.series[def.id].round, 0);
    seasons.push(summary);
    fs.writeFileSync(
      "tests/performance/v05/seasons.json",
      JSON.stringify(seasons, null, 2),
    );
  });
test("measured severe rear collision really deploys SC and bypasses stationary wrecks", () => {
  configureTrack();
  const r = new Race({ laps: 6, mode: "manager", realism: "realistic" });
  r.state = "racing";
  r.time = 25;
  place(r.cars[1], 500, 0, 65);
  place(r.cars[2], 505, 0, 0);
  return import("../src/racing/CollisionSystem.js").then(({ collidePair }) => {
    collidePair(r.cars[1], r.cars[2]);
    r.step(1 / 60, {}, false);
    assert.equal(r.control.phase, "sc");
    assert.ok(
      r.control.decisions.some(
        (d) => d.rule === "AVOIDABLE_CONTACT" && d.evidence.closing > 52,
      ),
    );
    let train = false;
    for (let i = 0; i < 72000 && !r.done; i++) {
      r.step(1 / 60, {}, false);
      train ||= r.control.sc.state === "train";
      if (
        train &&
        r.control.phase === "green" &&
        r.control.sc.state === "parked"
      )
        break;
    }
    assert.ok(train);
    assert.equal(r.control.phase, "green");
    assert.equal(r.control.sc.state, "parked");
    assert.equal(
      r.control.journal.filter(
        (e) => e.type === "incident" && String(e.detail).includes("Safety Car"),
      ).length,
      0,
    );
  });
});
test("spec cars identical, delegated fast/normal batches use identical physics, optional failures are real", () => {
  configureTrack();
  const s = defaults();
  beginSeason(s, "one-make");
  const cfg = sessionConfig(s, "one-make");
  const a = new Race(cfg.options),
    b = new Race(cfg.options);
  assert.ok(
    a.cars.every(
      (c) => JSON.stringify(c.stats) === JSON.stringify(a.cars[0].stats),
    ),
  );
  for (let i = 0; i < 1200; i++) a.step(1 / 60, {}, false);
  for (let batch = 0; batch < 10; batch++)
    for (let i = 0; i < 120; i++) b.step(1 / 60, {}, false);
  assert.deepEqual(
    a.cars.map((c) => [c.x, c.z, c.speed, c.fuel, c.penalty]),
    b.cars.map((c) => [c.x, c.z, c.speed, c.fuel, c.penalty]),
  );
  a.control.mechanicalRate = 0.15;
  a.control.random = () => 0;
  place(a.cars[0], 100, 0, 25);
  a.control.inspect();
  assert.ok(a.cars[0].mechanical > 0);
  assert.ok(a.cars[0].pit.requested);
  assert.ok(a.control.journal.some((e) => e.type === "mechanical"));
});
test("qualifying grid penalty and time-adjusted official points are applied without duplicated sessions", () => {
  let s = defaults();
  beginSeason(s, "sprint");
  let ctx = sessionConfig(s, "sprint");
  configureTrack(ctx.track);
  const q = new Race(ctx.options);
  for (let i = 0; i < 18000 && !q.done; i++) q.step(1 / 60, {}, false);
  const fastest = q.results()[0].id;
  q.control.decide(q.cars[fastest], "AVOIDABLE_CONTACT", {
    other: (fastest + 1) % 6,
    closing: 20,
    alignment: 0.1,
  });
  recordSession(s, q, ctx);
  ctx = sessionConfig(s, "sprint");
  assert.equal(ctx.options.gridOrder.indexOf(fastest), 3);
  const r = new Race(ctx.options);
  for (let i = 0; i < 36000 && !r.done; i++) r.step(1 / 60, {}, false);
  const winner = r.results()[0].id;
  r.control.decide(r.cars[winner], "IGNORE_ORDER", { owedTo: 1 });
  const report = recordSession(s, r, ctx);
  assert.ok(
    report.results.every(
      (c, i) => c.points === (c.finished ? [8, 7, 6, 5, 4, 3][i] : 0),
    ),
  );
  s.competitions.series.sprint.sessions.push({
    ...report,
    id: report.id + "duplicate",
  });
  s = validateSave(s);
  assert.equal(s.competitions.series.sprint.results.length, 1);
});
test("shared pit reservation follows actual arrival, including the higher-id car arriving first", () => {
  configureTrack();
  const r = new Race({ laps: 4, mode: "manager", botCount: 1 });
  r.state = "racing";
  place(r.cars[0], length - 205, 8, 14);
  place(r.cars[1], length - 190, 10, 18);
  r.cars.forEach((c) => (c.pit.requested = true));
  const seen = [];
  for (let i = 0; i < 12000; i++) {
    r.step(1 / 60, {}, false);
    for (const c of r.cars)
      if (c.pit.state === "service" && !seen.includes(c.id)) seen.push(c.id);
    if (r.cars.every((c) => c.pit.stops > 0 && c.pit.state === "track")) break;
  }
  assert.deepEqual(seen, [1, 0]);
  assert.ok(r.cars.every((c) => c.pit.stops === 1 && c.pit.state === "track"));
});
