import { performance } from "node:perf_hooks";
import fs from "node:fs";
import { Race } from "../src/race.js";
const times = [];
for (let n = 0; n < 4; n++) {
  const r = new Race({ laps: 20 });
  r.state = "racing";
  let t = performance.now();
  for (let i = 0; i < 6000; i++) r.step(1 / 60, {}, true);
  times.push(performance.now() - t);
}
const data = {
  simulationSecondsPerRun: 100,
  grid: 6,
  runsMs: times,
  meanWarmMs: times.slice(1).reduce((a, b) => a + b) / 3,
};
console.log(data);
fs.writeFileSync(
  `tests/performance/v03/${process.argv[2] || "after"}-simulation.json`,
  JSON.stringify(data, null, 2),
);
