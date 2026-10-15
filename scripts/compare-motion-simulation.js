// Exact authoritative-state comparison against an extracted, unmodified release.
// Usage: node scripts/compare-motion-simulation.js /path/to/reference
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const reference = process.argv[2];
if (!reference) throw Error("Pass the extracted baseline directory");
const load = async (root) => ({
  race: await import(pathToFileURL(path.resolve(root, "src/race.js"))),
  track: await import(pathToFileURL(path.resolve(root, "src/track.js"))),
});
const before = await load(reference),
  after = await load(".");
const { trackCatalog } = await import("../src/data/tracks.js");
const digest = (x) =>
  crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const results = [];
for (const track of trackCatalog) {
  const rows = [];
  for (const mod of [before, after]) {
    mod.track.configureTrack(track.id);
    const r = new mod.race.Race({
      mode: "manager",
      management: true,
      realism: "realistic",
      laps: 3,
      seed: 17,
    });
    let ticks = 0;
    while (!r.done && ticks < 72000) {
      r.step(1 / 60, {});
      ticks++;
    }
    rows.push({
      ticks,
      done: r.done,
      time: r.time,
      hash: digest({
        cars: r.cars,
        results: r.results(),
        events: r.events,
        manager: r.manager,
      }),
      results: r.results(),
      decisions: r.manager.decisions.length,
    });
  }
  assert.deepEqual(rows[0], rows[1], track.id);
  assert.ok(rows[1].done, track.id);
  results.push({ track: track.id, ...rows[1], exactMatch: true });
}
fs.writeFileSync(
  process.env.COMPARISON_OUTPUT || "tests/performance/v09/authoritative-comparison.json",
  JSON.stringify({ reference, results }, null, 2),
);
console.log(
  "Exact authoritative equality across",
  results.length,
  "complete 3-lap manager races",
);
