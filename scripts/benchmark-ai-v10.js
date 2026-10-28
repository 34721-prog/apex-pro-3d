import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { Race } from "../src/race.js";
import { BASE } from "../src/physics.js";
import { configureTrack, racingLineOffset } from "../src/track.js";
import { trackCatalog } from "../src/data/tracks.js";

const laps = [];
const summary = {
  methodology:
    "17 built-in tracks; Race(laps=8, botCount=5, difficulty=normal, BASE spec stats, seed=17); fixed 60 Hz; AI autopilot for all six cars; same-process Node run; metrics sampled every simulation tick from bots 1-5. Events are counted incrementally to avoid the race event ring-buffer limit.",
  tracks: [],
  totalRuntimeMs: 0,
  completedTracks: 0,
  offroadTicks: 0,
  botContacts: 0,
  botOvertakes: 0,
  overtakeAttempts: 0,
  successfulOvertakeAttempts: 0,
  overtakeModeTicks: 0,
  samples: 0,
  lateralErrorM: 0,
  throttle: 0,
  brake: 0,
};
const start = performance.now();

for (const track of trackCatalog) {
  configureTrack(track.id);
  const race = new Race({
    laps: 8,
    botCount: 5,
    difficulty: "normal",
    stats: BASE,
    specStats: BASE,
    realism: "arcade",
    weather: "dry",
    seed: 17,
  });
  race.state = "racing";
  const trackStart = performance.now();
  let ticks = 0;
  let lastEventId = race.eventSerial || 0;
  let trackOvertakes = 0;
  let trackContacts = 0;
  let trackAttempts = 0;
  let trackSuccessfulAttempts = 0;
  const activeAttacks = new Map();

  for (; ticks < 240000 && !race.done; ticks++) {
    race.step(1 / 60, {}, true);

    const endedAttacks = [];
    for (let i = 1; i < race.cars.length; i++) {
      const car = race.cars[i];
      const attacking = car.ai?.mode === "overtake";
      if (attacking) {
        summary.overtakeModeTicks++;
        if (!activeAttacks.has(car.id)) {
          activeAttacks.set(car.id, {
            target: car.ai.target,
            successful: false,
          });
          summary.overtakeAttempts++;
          trackAttempts++;
        }
      } else if (activeAttacks.has(car.id)) {
        endedAttacks.push(car.id);
      }
    }

    for (const event of race.events) {
      if (event.id <= lastEventId) continue;
      if (
        event.type === "overtake" &&
        event.by > 0 &&
        event.against > 0
      ) {
        summary.botOvertakes++;
        trackOvertakes++;
        const attack = activeAttacks.get(event.by);
        if (attack && attack.target === event.against)
          attack.successful = true;
      }
      if (
        event.type === "contact" &&
        event.car > 0 &&
        Number(event.detail?.other) > 0
      ) {
        summary.botContacts++;
        trackContacts++;
      }
    }
    lastEventId = race.eventSerial || lastEventId;

    for (const id of endedAttacks) {
      const attack = activeAttacks.get(id);
      if (attack?.successful) {
        summary.successfulOvertakeAttempts++;
        trackSuccessfulAttempts++;
      }
      activeAttacks.delete(id);
    }

    for (let i = 1; i < race.cars.length; i++) {
      const car = race.cars[i];
      summary.lateralErrorM += Math.abs(
        car.lateral - racingLineOffset(car.s),
      );
      summary.throttle += car.throttle;
      summary.brake += car.brake;
      summary.samples++;
      if (car.offroad) summary.offroadTicks++;
    }
  }

  for (const attack of activeAttacks.values()) {
    if (attack.successful) {
      summary.successfulOvertakeAttempts++;
      trackSuccessfulAttempts++;
    }
  }

  const lapEvents = race.events.filter(
    (event) =>
      event.type === "lap" &&
      event.car !== 0 &&
      Number.isFinite(event.detail),
  );
  const trackLaps = lapEvents.map((event) => event.detail);
  laps.push(...trackLaps);
  summary.tracks.push({
    track: track.id,
    finished: race.done,
    ticks,
    runtimeMs: Number((performance.now() - trackStart).toFixed(2)),
    botLaps: trackLaps.length,
    fastestLap: trackLaps.length ? Math.min(...trackLaps) : null,
    slowestLap: trackLaps.length ? Math.max(...trackLaps) : null,
    botOvertakes: trackOvertakes,
    botContacts: trackContacts,
    overtakeAttempts: trackAttempts,
    successfulOvertakeAttempts: trackSuccessfulAttempts,
  });
  if (race.done) summary.completedTracks++;
}

summary.totalRuntimeMs = Number((performance.now() - start).toFixed(2));
summary.meanRuntimeMsPerTrack = Number(
  (summary.totalRuntimeMs / trackCatalog.length).toFixed(2),
);
summary.meanLapSeconds = Number(
  (
    laps.reduce((total, lap) => total + lap, 0) /
    Math.max(1, laps.length)
  ).toFixed(3),
);
summary.lapRangeSeconds = laps.length
  ? [Number(Math.min(...laps).toFixed(3)), Number(Math.max(...laps).toFixed(3))]
  : null;
summary.meanLateralErrorM = Number(
  (summary.lateralErrorM / Math.max(1, summary.samples)).toFixed(4),
);
summary.meanThrottle = Number(
  (summary.throttle / Math.max(1, summary.samples)).toFixed(4),
);
summary.meanBrake = Number(
  (summary.brake / Math.max(1, summary.samples)).toFixed(4),
);
summary.overtakeAttemptSuccessRate = Number(
  (
    summary.successfulOvertakeAttempts /
    Math.max(1, summary.overtakeAttempts)
  ).toFixed(4),
);
delete summary.lateralErrorM;
delete summary.throttle;
delete summary.brake;
delete summary.samples;

const output = process.argv[2] || "tests/performance/ai-v10/after.json";
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
