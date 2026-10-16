import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Race } from "../src/race.js";
import { defaults, validateSave } from "../src/save.js";
import {
  validPlan,
  applySetup,
  rivalProfiles,
} from "../src/strategy/ManagerPlans.js";
import {
  referenceLap,
  pitLoss,
  estimateStrategy,
} from "../src/strategy/StrategyEstimator.js";
import { validateReport } from "../src/strategy/ManagerHistory.js";
import { BASE } from "../src/physics.js";
import { configureTrack } from "../src/track.js";
import { botInput } from "../src/ai.js";
import {
  beginSeason,
  sessionConfig,
  recordSession,
  table,
} from "../src/championships/Seasons.js";
fs.mkdirSync("tests/performance/v08", { recursive: true });
const race = (extra = {}) =>
  new Race({
    mode: "manager",
    management: true,
    realism: "realistic",
    laps: 5,
    ...extra,
  });
const ticks = (r, n) => {
  for (let i = 0; i < n && !r.done; i++) r.step(1 / 60, {});
};
test("v08 default and additive save migration make management primary; plans and histories are bounded", () => {
  let s = validateSave({
    version: 1,
    credits: 9876,
    settings: { mode: "quick" },
    managerHistory: [
      {
        track: "aurora",
        decisions: Array(300).fill({ detail: "x".repeat(800) }),
      },
    ],
  });
  assert.equal(s.credits, 9876);
  assert.equal(s.settings.controlMode, "manager");
  assert.equal(defaults().settings.mode, "manager");
  assert.equal(s.managerHistory[0].decisions.length, 120);
  assert.equal(s.managerHistory[0].decisions[0].detail.length, 240);
  assert.equal(
    validateSave({ ...s, settings: { controlMode: "manual" } }).settings
      .controlMode,
    "manual",
  );
  let p = validPlan(
    {
      pace: "hack",
      stops: [
        { from: -5, to: Infinity },
        { from: 1, to: 19 },
        { from: 8, to: 12 },
      ],
    },
    3,
  );
  assert.equal(p.pace, "balanced");
  assert.ok(p.stops.every((s) => s.to <= 2));
  assert.equal(new Set(p.stops.map((s) => s.from)).size, p.stops.length);
});
test("v08 team orders cannot change rivals, model stats or create speed; pace ramps and maximum expires", () => {
  const r = race(),
    c = r.cars[0],
    rival = JSON.stringify(r.cars[2].managerPlan),
    stats = { ...c.stats };
  assert.equal(r.manager.order(2, { pace: "maximum" }), false);
  r.manager.order(0, { pace: "conserve" });
  assert.equal(c.policy.pace, 1);
  r.time = 1;
  r.manager.step(1 / 60);
  assert.ok(c.policy.pace < 1 && c.policy.pace > 0.99);
  for (let i = 0; i < 600; i++) {
    r.time += 1 / 60;
    r.manager.step(1 / 60);
  }
  const slow = botInput(c, [c], r.time).throttle;
  assert.ok(r.manager.order(0, { pace: "maximum" }));
  for (let i = 0; i < 600; i++) {
    r.time += 1 / 60;
    r.manager.step(1 / 60);
  }
  const fast = botInput(c, [c], r.time).throttle;
  assert.ok(fast > slow);
  assert.ok(c.aiTargetSpeed <= c.stats.maxSpeed);
  assert.deepEqual(c.stats, stats);
  assert.equal(JSON.stringify(r.cars[2].managerPlan), rival);
  r.time += 31;
  r.manager.step(1 / 60);
  assert.equal(c.managerPlan.pace, "balanced");
  assert.equal(r.manager.order(0, { pace: "maximum" }), false);
});
test("v08 cancellation holds programmed pit requests and commitment locks service", () => {
  const r = race({
      managerOptions: {
        plans: [{ stops: [{ from: 1, to: 2, compound: "hard" }] }],
      },
    }),
    c = r.cars[0];
  r.state = "racing";
  r.manager.step(1 / 60);
  assert.ok(c.pit.requested);
  assert.ok(r.manager.command(0, "cancel"));
  for (let i = 0; i < 120; i++) {
    r.time += 1 / 60;
    r.manager.step(1 / 60);
  }
  assert.equal(c.pit.requested, false);
  c.lap = 1;
  r.time += 2;
  r.manager.step(1 / 60);
  assert.equal(c.pit.requested, true);
  c.pit.approachAuthorized = true;
  assert.equal(r.manager.command(0, "cancel"), false);
  assert.equal(r.manager.command(0, "pit", "soft"), false);
});
test("v08 grip, fuel and tire outputs differ from physically applied pace choices, not only HUD text", () => {
  const rows = [];
  for (const pace of ["conserve", "aggressive"]) {
    const r = race({
      managerOptions: {
        plans: [
          {
            pace,
            tireCare: pace === "conserve" ? "save" : "normal",
            fuel: pace === "conserve" ? "save" : "normal",
          },
        ],
      },
    });
    ticks(r, 6000);
    const c = r.cars[0];
    rows.push({
      pace,
      progress: c.progress,
      fuel: c.fuel,
      health: c.tires.health,
      temperature: c.tires.temperature,
      grip: c.tireGrip,
      stats: c.stats,
    });
  }
  assert.notEqual(rows[0].progress, rows[1].progress);
  assert.ok(rows[0].fuel > rows[1].fuel);
  assert.ok(rows[0].health > rows[1].health);
  assert.deepEqual(rows[0].stats, rows[1].stats);
  fs.writeFileSync(
    "tests/performance/v08/tactical-effects.json",
    JSON.stringify(rows, null, 2),
  );
});
test("v08 physical configuration tradeoffs and honest estimators respond to geometry/tires/loss", () => {
  const r = race(),
    c = r.cars[0];
  assert.ok(applySetup(BASE, "downforce").grip > BASE.grip);
  assert.ok(applySetup(BASE, "downforce").maxSpeed < BASE.maxSpeed);
  assert.ok(applySetup(BASE, "low-drag").grip < BASE.grip);
  assert.ok(
    referenceLap(c, "normal", "medium", 0.25) >
      referenceLap(c, "normal", "medium", 1),
  );
  let a = estimateStrategy(c, validPlan({}), r),
    b = estimateStrategy(
      c,
      validPlan({ stops: [{ from: 2, to: 3, compound: "medium" }] }),
      r,
    );
  assert.ok(a.total > 0 && b.total > 0);
  assert.equal(b.stops, 1);
  const dry = pitLoss(c, r);
  r.control.phase = "vsc";
  c.controlLimit = 23;
  assert.ok(pitLoss(c, r) < dry);
});
test("v08 rivals do not read future weather; observed rain/SC advice is executable", () => {
  const r = race(),
    c = r.cars[0];
  r.control.weather.forecast = () => {
    throw Error("future access forbidden");
  };
  c.wetness = 0.8;
  assert.equal(r.manager.recommend(c).key, "rain");
  assert.equal(r.manager.recommend(c).compound, "wet");
  c.wetness = 0;
  c.tires.health = 0.5;
  c.controlLimit = 23;
  r.control.phase = "vsc";
  assert.equal(r.manager.recommend(c).key, "neutral");
  assert.ok(r.manager.command(0, "pit", r.manager.recommend(c).compound));
});
test("v08 autonomous dry and changing-weather races finish with real opponent strategies, service and stint evidence", () => {
  const rows = [];
  for (const weatherProgram of ["fixed", "showers"]) {
    const r = race({ weatherProgram });
    ticks(r, 160000);
    assert.ok(r.done);
    assert.ok(r.cars.every((c) => c.finished));
    assert.ok(r.cars.every((c) => c.pit.stops > 0));
    assert.ok(new Set(r.cars.map((c) => c.managerPlan.start)).size > 1);
    for (const c of r.cars) {
      assert.ok(c.stints.length > 0);
      assert.ok(c.pit.history.every((h) => h.service > 0));
      assert.ok(c.stints.every((s) => s.distance > 100));
    }
    const report = validateReport(r.manager.report());
    assert.equal(report.cars.length, 6);
    rows.push({ weatherProgram, results: r.results(), report });
  }
  fs.writeFileSync(
    "tests/performance/v08/full-races.json",
    JSON.stringify(rows, null, 2),
  );
});
test("v08 manual/manager handover preserves race pose, lap, timers and plans", () => {
  const r = race();
  ticks(r, 1400);
  const c = r.cars[0],
    before = JSON.stringify([c.x, c.z, c.lap, c.managerPlan, c.pit]);
  r.manualControl = true;
  r.delegated = false;
  assert.equal(r.isDelegated(), false);
  assert.equal(JSON.stringify([c.x, c.z, c.lap, c.managerPlan, c.pit]), before);
  r.manualControl = false;
  assert.equal(r.isDelegated(), true);
  ticks(r, 60);
  assert.notEqual(c.x, JSON.parse(before)[0]);
});
test("v08 championship objective chooses actual points priority and constrains teammate risk", () => {
  const r = race({
    managerOptions: { objective: "drivers", points: { 0: 10, 1: 30 } },
  });
  assert.equal(r.teamOrder, "yield");
  r.manager.setObjective("constructors");
  assert.equal(r.teamOrder, "protect");
});
test("v08 full autonomous Sprint season saves strategy reports and standings and resumes between sessions", () => {
  let s = defaults();
  beginSeason(s, "sprint");
  let count = 0;
  while (!s.competitions.series.sprint.complete && count < 8) {
    const ctx = sessionConfig(s, "sprint");
    configureTrack(ctx.track);
    const r = new Race({ ...ctx.options, management: true });
    ticks(r, 160000);
    assert.ok(r.done);
    recordSession(s, r, ctx);
    s = validateSave(JSON.parse(JSON.stringify(s)));
    assert.ok(s.competitions.series.sprint.sessions.at(-1).strategy);
    count++;
  }
  const state = s.competitions.series.sprint;
  assert.ok(state.complete);
  assert.equal(state.results.length, 3);
  assert.ok(table(state, { fastest: false }).some((c) => c.points > 0));
  fs.writeFileSync(
    "tests/performance/v08/season.json",
    JSON.stringify(
      {
        sessions: count,
        complete: state.complete,
        results: state.results.map((r) => ({
          id: r.id,
          strategicDecisions: r.strategy.decisions.length,
          results: r.results,
        })),
      },
      null,
      2,
    ),
  );
});
test("v08 avoid-rival and protect-team orders actually change safe overtake selection", () => {
  const r = race(),
    c = r.cars[0],
    o = r.cars[1];
  o.s = c.s + 20;
  o.lateral = c.lateral;
  r.manager.order(0, { overtake: "aggressive", avoid: 1 });
  botInput(c, [c, o], 1);
  assert.notEqual(c.ai.mode, "overtake");
  r.manager.order(0, { avoid: -1 });
  botInput(c, [c, o], 2);
  assert.equal(c.ai.mode, "overtake");
  // With a single player pilot, protect-team no longer blocks a rival overtake.
});
test("v08 undercut and overcut require public rival evidence and an actionable stop horizon", () => {
  const r = race({
      managerOptions: {
        plans: [{ stops: [{ from: 2, to: 3, compound: "medium" }] }],
      },
    }),
    c = r.cars[0],
    o = r.cars[2];
  for (const x of r.cars) x.progress = 0;
  c.progress = 1000;
  o.progress = 1020;
  c.speed = 40;
  c.tires.health = 0.5;
  assert.equal(r.manager.recommend(c).key, "undercut");
  o.pit.state = "entry";
  c.tires.health = 0.8;
  c.lastLap = 70;
  o.lastLap = 80;
  assert.equal(r.manager.recommend(c).key, "overcut");
  c.lastLap = 90;
  assert.notEqual(r.manager.recommend(c).key, "overcut");
});
test("v08 player team orders never constrain rival teammate battles; rivals may use public championship points", () => {
  configureTrack("aurora");
  const r = race(),
    c = r.cars[2],
    o = r.cars[3];
  o.s = c.s + 20;
  o.lateral = c.lateral;
  c.managerPlan.overtake = "aggressive";
  r.manager.applyPolicy(c);
  r.teamOrder = "protect";
  botInput(c, [c, o], 1);
  assert.equal(c.ai.mode, "overtake");
  assert.doesNotThrow(() => JSON.stringify(r));
  const points = race({ managerOptions: { points: { 2: 30, 3: 8 } } });
  assert.equal(points.cars[2].managerPlan.overtake, "conservative");
  assert.equal(points.cars[3].managerPlan.overtake, "aggressive");
});
test("v08 autonomous overcut actually delays a due stop within its window", () => {
  const r = race({
      managerOptions: {
        plans: [{ stops: [{ from: 1, to: 2, compound: "medium" }] }],
      },
    }),
    c = r.cars[0],
    o = r.cars[2];
  for (const x of r.cars) x.progress = 0;
  c.progress = 1000;
  o.progress = 1020;
  o.pit.state = "entry";
  c.speed = 40;
  c.lastLap = 70;
  o.lastLap = 80;
  c.tires.health = 0.8;
  r.manager.step(1 / 60);
  assert.equal(c.strategyAdvice.key, "overcut");
  assert.equal(c.pit.requested, false);
  assert.equal(c.managerHoldLap, 2);
  assert.ok(r.manager.decisions.some((d) => d.type === "overcut"));
});
