import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { Race } from "../src/race.js";
const times = [];
let sample;
for (let n = 0; n < 4; n++) {
  const r = new Race({
    laps: 8,
    mode: "manager",
    realism: "realistic",
    management: true,
  });
  r.state = "racing";
  const t = performance.now();
  for (let i = 0; i < 6000; i++) r.step(1 / 60, {}, false);
  times.push(performance.now() - t);
  sample = {
    lap: r.cars[0].lap,
    position: r.cars[0].progress,
    fuel: r.cars[0].fuel,
    cars: r.cars.length,
    decisions: r.manager?.decisions.length || 0,
  };
}
const data = {
  ticks: 6000,
  simulatedSeconds: 100,
  runsMs: times,
  warmMeanMs: times.slice(1).reduce((s, n) => s + n) / 3,
  sample,
};
fs.writeFileSync(
  `tests/performance/v08/${process.argv[2] || "after"}-simulation.json`,
  JSON.stringify(data, null, 2),
);
console.log(data);
