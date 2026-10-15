import { Race } from "../src/race.js";
import { pitLoss, referenceLap } from "../src/strategy/StrategyEstimator.js";
import { performance } from "node:perf_hooks";
import fs from "node:fs";
const r = new Race({
    laps: 8,
    mode: "manager",
    management: true,
    realism: "realistic",
  }),
  times = [];
let checksum = 0;
for (let run = 0; run < 5; run++) {
  let t = performance.now();
  for (let n = 0; n < 6000; n++) {
    const c = r.cars[n % 6];
    checksum += pitLoss(c, r) + referenceLap(c);
  }
  times.push(performance.now() - t);
}
const data = {
  runsMs: times,
  warmMeanMs: times.slice(1).reduce((s, v) => s + v, 0) / 4,
  checksum,
};
fs.writeFileSync(
  `tests/performance/v081/${process.argv[2] || "after"}-estimator.json`,
  JSON.stringify(data, null, 2),
);
console.log(data);
