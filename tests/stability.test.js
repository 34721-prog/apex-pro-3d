import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { trackCatalog } from "../src/data/tracks.js";
import {
  configureTrack,
  at,
  samples,
  length,
  TRACK_WIDTH,
  curve,
} from "../src/track.js";
import {
  pitLayout,
  pitFacilities,
  pitPoint,
  pitOffset,
  pitSolids,
  PIT_ENTRY,
  PIT_EXIT,
} from "../src/strategy/PitLayout.js";
import { footprintDistance, venuePlan } from "../src/venue/VenueLayout.js";
import { overlap } from "../src/racing/CollisionSystem.js";
import { Race } from "../src/race.js";
import { referenceLap, pitLoss } from "../src/strategy/StrategyEstimator.js";
const dir = "tests/performance/v081";
fs.mkdirSync(dir + "/pit-diagrams", { recursive: true });
const report = [];
for (const track of trackCatalog)
  test(
    "v081 full pit footprints, connections and six physical stops: " + track.id,
    () => {
      configureTrack(track.id);
      const bays = pitLayout();
      assert.equal(new Set(bays.map((b) => b.id)).size, 6);
      assert.equal(pitLayout(), bays);
      const buildings = [
        ...pitFacilities(),
        ...bays.map((b) => ({
          ...pitPoint(b.s, 50),
          heading: b.heading,
          halfWidth: 8.5,
          halfLength: b.garageLength / 2 + 0.2,
        })),
      ];
      let clearance = Infinity;
      for (const b of buildings) {
        for (const p of samples) {
          const d =
            footprintDistance({ ...b, halfDepth: b.halfLength }, p.x, p.z) -
            TRACK_WIDTH / 2;
          clearance = Math.min(clearance, d);
          assert.ok(d > 5, "full footprint outside main asphalt");
        }
        for (const v of venuePlan())
          assert.equal(
            overlap(b, { ...v, halfLength: v.halfDepth }),
            null,
            "no grandstand intersection",
          );
      }
      for (let i = 0; i < buildings.length; i++)
        for (let j = i + 1; j < buildings.length; j++)
          assert.equal(
            overlap(buildings[i], buildings[j]),
            null,
            "separate facilities/garages",
          );
      for (const s of [PIT_ENTRY, PIT_EXIT])
        assert.ok(
          Math.hypot(pitPoint(s).x - at(s).p.x, pitPoint(s).z - at(s).p.z) <
            1e-8,
        );
      let prev = pitPoint(PIT_ENTRY),
        maxRouteStep = 0;
      for (let s = PIT_ENTRY + 1; s <= PIT_EXIT; s++) {
        const p = pitPoint(s);
        maxRouteStep = Math.max(
          maxRouteStep,
          Math.hypot(p.x - prev.x, p.z - prev.z),
        );
        prev = p;
        if (s >= -70 && s <= 200)
          assert.ok(pitOffset(s) - 4.8 > TRACK_WIDTH / 2);
      }
      assert.ok(maxRouteStep < 2);
      assert.equal(pitSolids().length, 24);
      const r = new Race({ laps: 4, realism: "realistic", botCount: 5 });
      r.state = "racing";
      for (const [i, c] of r.cars.entries()) {
        const s = length - 235 - i * 14,
          t = at(s);
        Object.assign(c, {
          x: t.p.x + t.right.x * 5,
          z: t.p.z + t.right.z * 5,
          s,
          previousS: s,
          index: -1,
          lateral: 5,
          heading: t.heading,
          velocityHeading: t.heading,
          speed: 28,
          vx: t.dir.x * 28,
          vz: t.dir.z * 28,
          progress: s - length,
        });
        c.pit.requested = true;
      }
      const old = r.cars.map((c) => ({ x: c.x, z: c.z }));
      let maxMotion = 0;
      for (let n = 0; n < 60 * 240; n++) {
        r.step(1 / 60, {}, true);
        const service = new Set();
        for (const c of r.cars) {
          const d = Math.hypot(c.x - old[c.id].x, c.z - old[c.id].z);
          maxMotion = Math.max(maxMotion, d);
          assert.ok(d < 1.4, "no teleport");
          old[c.id] = { x: c.x, z: c.z };
          if (c.pit.state === "service") {
            assert.ok(!service.has(c.teamId));
            service.add(c.teamId);
          }
        }
        if (r.cars.every((c) => c.pit.stops >= 1 && c.pit.state === "track"))
          break;
      }
      assert.ok(
        r.cars.every((c) => c.pit.stops >= 1 && c.pit.state === "track"),
        "all six leave service and merge",
      );
      report.push({
        track: track.id,
        clearance,
        maxRouteStep,
        maxMotion,
        garageLengths: bays.map((b) => b.garageLength),
        stops: r.cars.map((c) => c.pit.stops),
      });
      fs.writeFileSync(
        dir + "/pit-matrix.json",
        JSON.stringify(report, null, 2),
      );
      const points = [];
      for (let s = -235; s <= 335; s += 2) points.push(at(s).p);
      for (const b of buildings)
        points.push({ x: b.x - 70, z: b.z - 70 }, { x: b.x + 70, z: b.z + 70 });
      const minX = Math.min(...points.map((p) => p.x)) - 15,
        minZ = Math.min(...points.map((p) => p.z)) - 15,
        maxX = Math.max(...points.map((p) => p.x)) + 15,
        maxZ = Math.max(...points.map((p) => p.z)) + 15;
      const path = (pts) => pts.map((p) => `${p.x},${p.z}`).join(" ");
      const polygons = buildings
        .map((b) => {
          const cs = Math.cos(b.heading),
            sn = Math.sin(b.heading);
          return `<polygon points="${path(
            [
              [-1, -1],
              [-1, 1],
              [1, 1],
              [1, -1],
            ].map(([x, z]) => ({
              x: b.x + x * b.halfWidth * cs + z * b.halfLength * sn,
              z: b.z - x * b.halfWidth * sn + z * b.halfLength * cs,
            })),
          )}" fill="${b.id ? "#64748b" : "#38bdf8"}" stroke="#fff" stroke-width=".4"/>`;
        })
        .join("");
      const route = [];
      for (let s = PIT_ENTRY; s <= PIT_EXIT; s += 2) route.push(pitPoint(s));
      fs.writeFileSync(
        dir + `/pit-diagrams/${track.id}.svg`,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}" style="background:#17251e"><title>${track.name} — geometria real; asfalto cinza, pit amarelo, garagens azuis, anexos cinza-azulado</title><polyline points="${path(samples)} ${samples[0].x},${samples[0].z}" fill="none" stroke="#555e62" stroke-width="${TRACK_WIDTH}"/><polyline points="${path(route)}" fill="none" stroke="#ddb957" stroke-width="9.6"/>${polygons}${bays.map((b) => `<circle cx="${b.x}" cy="${b.z}" r="2.5" fill="#34d399"/>`).join("")}</svg>`,
      );
    },
  );
test("v081 estimator cached geometry preserves exact values and changes with track/weather", () => {
  configureTrack("aurora");
  const r = new Race({ management: true }),
    c = r.cars[0];
  const a = pitLoss(c, r),
    lap = referenceLap(c);
  assert.equal(pitLoss(c, r), a);
  assert.equal(referenceLap(c), lap);
  configureTrack("neon");
  assert.notEqual(referenceLap(c), lap);
  configureTrack("aurora");
  assert.equal(pitLoss(c, r), a);
  assert.equal(referenceLap(c), lap);
  c.wetness = 1;
  assert.notEqual(referenceLap(c), lap);
});
