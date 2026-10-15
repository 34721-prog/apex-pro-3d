import { Race } from "../src/race.js";
import { configureTrack, at, length, angle } from "../src/track.js";
import { pitLayout, bayFor } from "../src/strategy/PitLayout.js";
import { overlap } from "../src/racing/CollisionSystem.js";
for (const track of ["aurora", "veloce", "serpente", "neon", "titan", "vento"])
  for (const same of [false, true]) {
    configureTrack(track);
    const r = new Race({
      laps: 4,
      realism: "realistic",
      mode: same ? "manager" : "quick",
    });
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
      if (same) c.teamId = 0;
    }
    let overlaps = 0,
      maxMotion = 0,
      serviceErrors = 0,
      services = 0;
    const prev = r.cars.map((c) => ({ x: c.x, z: c.z }));
    for (let i = 0; i < 60 * 210; i++) {
      r.step(1 / 60, {}, true);
      for (const c of r.cars) {
        maxMotion = Math.max(
          maxMotion,
          Math.hypot(c.x - prev[c.id].x, c.z - prev[c.id].z),
        );
        prev[c.id] = { x: c.x, z: c.z };
        if (c.pit.state === "service" && !c._checked) {
          c._checked = true;
          services++;
          const b = bayFor(c);
          if (
            Math.hypot(c.x - b.x, c.z - b.z) > 2.2 ||
            Math.abs(angle(c.heading - b.heading)) > 0.3
          )
            serviceErrors++;
        }
      }
      for (let a = 0; a < 6; a++)
        for (let b = a + 1; b < 6; b++) {
          if (
            (r.cars[a].pit.state !== "track" ||
              r.cars[b].pit.state !== "track") &&
            overlap(r.cars[a], r.cars[b])
          )
            overlaps++;
        }
      if (r.cars.every((c) => c.pit.stops > 0 && c.pit.state === "track"))
        break;
    }
    console.log(
      track,
      same ? "ALL-SAME" : "OWN-BAYS",
      { time: r.time, services, overlaps, maxMotion, serviceErrors },
      r.cars.map((c) => [
        c.id,
        c.pit.state,
        c.pit.stops,
        Math.round(c.s),
        c.lateral.toFixed(1),
        c.damage.toFixed(2),
      ]),
    );
  }
