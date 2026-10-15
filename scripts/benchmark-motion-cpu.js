import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
const roots = [process.argv[2], process.cwd()];
if (!roots[0]) throw Error("Pass baseline directory");
const mods = await Promise.all(
  roots.map((r) => import(pathToFileURL(path.resolve(r, "src/race.js")))),
);
const stats = (a) => {
  const s = [...a].sort((a, b) => a - b);
  return {
    n: a.length,
    mean: a.reduce((s, x) => s + x, 0) / a.length,
    p95: s[Math.ceil(s.length * 0.95) - 1],
    p99: s[Math.ceil(s.length * 0.99) - 1],
    max: s.at(-1),
  };
};
const rows = [[], []],
  outcomes = [[], []];
for (let run = 0; run < 6; run++)
  for (const index of run % 2 ? [1, 0] : [0, 1]) {
    const r = new mods[index].Race({
      laps: 20,
      mode: "manager",
      management: true,
    });
    r.state = "racing";
    const t = performance.now();
    for (let i = 0; i < 6000; i++) r.step(1 / 60, {});
    const ms = performance.now() - t;
    if (run) {
      rows[index].push(ms);
      outcomes[index].push(
        r.cars.map((c) => [c.progress, c.fuel, c.pit.state]),
      );
    }
  }
const data = {
  scenario:
    "Same Node process, alternating before/after, six runs (one warmup), 6000 ticks/100 simulation seconds per run, six manager cars; includes visual tick observer only in after.",
  before: { runs: rows[0], ...stats(rows[0]) },
  after: { runs: rows[1], ...stats(rows[1]) },
  sameOutcomes: JSON.stringify(outcomes[0]) === JSON.stringify(outcomes[1]),
};
fs.writeFileSync(
  "tests/performance/v09/cpu-comparison.json",
  JSON.stringify(data, null, 2),
);
console.log(data);
