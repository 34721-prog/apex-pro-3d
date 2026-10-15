import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { configureTrack, samples, TRACK_WIDTH, length } from "../src/track.js";
import { trackCatalog } from "../src/data/tracks.js";
import {
  venuePlan,
  footprintDistance,
  overlapVenues,
} from "../src/venue/VenueLayout.js";
import { pitPoint } from "../src/strategy/PitLayout.js";
import { defaults, validateSave } from "../src/save.js";
import { sceneMusic } from "../src/audio/MusicPlayer.js";
import { AudienceEvents } from "../src/venue/AudienceEvents.js";
import { Race } from "../src/race.js";
const report = [];
for (const track of trackCatalog)
  test("v07 ten populated safe distributed venues: " + track.id, () => {
    configureTrack(track.id);
    const vs = venuePlan();
    assert.equal(vs.length, 10);
    assert.equal(new Set(vs.map((v) => v.sector)).size, 3);
    for (const v of vs) {
      assert.ok(v.spectators > 250);
      for (const p of samples)
        assert.ok(footprintDistance(v, p.x, p.z) >= TRACK_WIDTH / 2 + 7.8);
      for (let s = -250; s <= 350; s += 5)
        for (const off of [0, 15, 26, 36, 50, 65, 80, 99, 112]) {
          const p = pitPoint(s, off);
          assert.ok(footprintDistance(v, p.x, p.z) > 7.5);
        }
      for (const b of vs)
        if (b !== v) assert.equal(overlapVenues(v, b, 0), false);
    }
    report.push({
      track: track.id,
      length,
      venues: vs.length,
      spectators: vs.reduce((s, v) => s + v.spectators, 0),
      minRoad: Math.min(...vs.map((v) => v.minRoadClearance)),
      minPit: Math.min(...vs.map((v) => v.minPitClearance)),
      sectors: vs.map((v) => v.sector),
    });
    fs.mkdirSync("tests/performance/v07", { recursive: true });
    fs.writeFileSync(
      "tests/performance/v07/venue-clearance.json",
      JSON.stringify(report, null, 2),
    );
  });
test("v07 audio settings are additive and validated; race audio is opt-in", () => {
  const old = validateSave({
    version: 1,
    credits: 7821,
    settings: { volume: 0.4, voice: true },
  });
  assert.equal(old.credits, 7821);
  assert.equal(old.settings.music, true);
  assert.equal(old.settings.raceMusic, false);
  const s = validateSave({
    version: 1,
    settings: {
      music: false,
      raceMusic: true,
      musicDuck: false,
      musicVolume: 99,
      crowdVolume: -2,
    },
  }).settings;
  assert.equal(s.music, false);
  assert.equal(s.musicVolume, 1);
  assert.equal(s.crowdVolume, 0);
  assert.equal(s.raceMusic, true);
  assert.equal(s.musicDuck, false);
});
test("v07 scene routing respects race-music independence", () => {
  const s = defaults().settings;
  assert.equal(sceneMusic(null, { page: "home" }, s), "menu");
  for (const page of ["tracks", "garage", "drivers"])
    assert.equal(sceneMusic(null, { page }, s), "selection");
  assert.equal(sceneMusic(null, { page: "career" }, s), "championship");
  assert.equal(sceneMusic({ state: "countdown" }, null, s), "grid");
  assert.equal(sceneMusic({ state: "racing" }, null, s), null);
  assert.equal(
    sceneMusic({ state: "racing" }, null, { ...s, raceMusic: true }),
    "race",
  );
  assert.equal(sceneMusic({ state: "results" }, null, s), "victory");
  assert.equal(sceneMusic(null, null, { ...s, music: false }), null);
});
test("v07 audience observer follows actual events/order without mutating race", () => {
  configureTrack("aurora");
  const r = new Race({ botCount: 2 }),
    a = new AudienceEvents();
  r.state = "racing";
  const p = r.cars[0];
  p.speed = 30;
  p.progress = 10;
  r.cars[1].progress = 15;
  r.cars[2].progress = 2;
  a.update(r);
  p.progress = 17;
  r.time = 1;
  const before = JSON.stringify(r.cars);
  a.update(r);
  assert.equal(a.events.at(-1).kind, "overtake");
  assert.equal(JSON.stringify(r.cars), before);
  r.emit("finish", 0);
  p.finished = true;
  p.finishTime = 100;
  r.time = 101;
  a.update(r);
  assert.ok(a.events.some((e) => e.kind === "finish"));
  assert.ok(a.events.some((e) => e.kind === "victory"));
  const count = a.events.length;
  a.update(r);
  assert.equal(a.events.length, count);
});
test("v07 eight nonempty original compressed assets with hashes/real waveform metadata", () => {
  const m = JSON.parse(fs.readFileSync("public/assets/audio/manifest.json"));
  assert.equal(Object.keys(m.music).length, 6);
  assert.equal(Object.keys(m.crowd).length, 2);
  for (const info of [...Object.values(m.music), ...Object.values(m.crowd)]) {
    const b = fs.readFileSync("public" + info.file);
    assert.ok(b.length > 30000);
    assert.ok(info.rms > 0.01 && info.peak < 0.95);
    assert.equal(
      crypto.createHash("sha256").update(b).digest("hex"),
      info.sha256,
    );
  }
  assert.ok(fs.existsSync("public/assets/audio/LICENSE-AUDIO.txt"));
});

test("v07 native local radio multiplies voice by master and stops on mute", async () => {
  const { RaceEngineer } = await import("../src/audio/RaceEngineer.js");
  const previous = globalThis.speechSynthesis,
    oldUtterance = globalThis.SpeechSynthesisUtterance;
  const said = [];
  let stopped = 0;
  globalThis.speechSynthesis = {
    getVoices: () => [{ localService: true, lang: "pt-BR" }],
    cancel: () => stopped++,
    speak: (u) => said.push(u),
    speaking: false,
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  try {
    const e = new RaceEngineer();
    e.configure({ ...defaults().settings, volume: 0.4, voiceVolume: 0.5 });
    e.say("Teste local", 1, 30);
    assert.equal(said[0].volume, 0.2);
    e.configure({ volume: 0 });
    e.say("Texto continua disponível", 1, 60);
    assert.equal(said.length, 1);
    assert.ok(stopped > 0);
    assert.equal(e.message, "Texto continua disponível");
  } finally {
    globalThis.speechSynthesis = previous;
    globalThis.SpeechSynthesisUtterance = oldUtterance;
  }
});
