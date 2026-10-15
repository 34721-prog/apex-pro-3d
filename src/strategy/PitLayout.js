// Metres. This is the sole layout used by traffic, barriers, garages and cameras.
import { at, length, activeTrack, barrierOffset } from "../track.js";
export const PIT_LIMIT = 18,
  PIT_ENTRY = -210,
  PIT_EXIT = 310,
  FAST_LANE = 26,
  SERVICE_LANE = 36;
export const pitTeams = [
  { name: "APEX MOTORSPORT", color: "#d52f50" },
  { name: "EMBER RACING", color: "#f58b3b" },
  { name: "AZURE GP", color: "#408bda" },
  { name: "SOLSTICE", color: "#e5be50" },
  { name: "VERDANT", color: "#4ca787" },
  { name: "ORION", color: "#9a79d5" },
];
export const signedPitS = (s) => (s > length / 2 ? s - length : s);
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function pitOffset(s) {
  const p = signedPitS(s);
  return p < -80
    ? FAST_LANE * smooth((p - PIT_ENTRY) / 130)
    : p > 210
      ? FAST_LANE * (1 - smooth((p - 210) / 100))
      : FAST_LANE;
}
export function pitPoint(s, offset = pitOffset(s)) {
  const t = at(s);
  return { x: t.p.x + t.right.x * offset, z: t.p.z + t.right.z * offset };
}
export function pitZone(s) {
  const p = signedPitS(s);
  return p > PIT_ENTRY - 5 && p < PIT_EXIT + 5;
}
export function apron(s) {
  const p = signedPitS(s);
  return smooth((p + 85) / 30) * (1 - smooth((p - 198) / 20));
}
export function pitOuter(s) {
  return Math.max(barrierOffset(), pitOffset(s) + 5.3 + 30 * apron(s));
}
let cached, track, solids;
export function pitLayout() {
  if (track !== activeTrack.id) {
    track = activeTrack.id;
    cached = pitTeams.map((t, i) => {
      const s = 26 + i * 26,
        pose = at(s),
        p = pitPoint(s, SERVICE_LANE);
      return { ...t, id: i, s, ...p, heading: pose.heading };
    });
    // Arc-length spacing on the track is compressed at the inside offset.
    // Fit each garage to the measured neighbouring centres, retaining every stall.
    const centres = cached.map((b) => pitPoint(b.s, 50));
    for (const b of cached) {
      let spacing = 27;
      for (const j of [b.id - 1, b.id + 1])
        if (centres[j])
          spacing = Math.min(
            spacing,
            Math.hypot(
              centres[j].x - centres[b.id].x,
              centres[j].z - centres[b.id].z,
            ),
          );
      b.garageLength = Math.min(25, spacing - 2);
    }
    solids = [];
    for (const b of cached) {
      for (const [lat, z, halfWidth, halfLength] of [
        [58, 0, 0.25, b.garageLength / 2],
        [50, -b.garageLength / 2, 8, 0.2],
        [50, b.garageLength / 2, 8, 0.2],
        [56, 0, 1, 6],
      ]) {
        const t = at(b.s);
        solids.push({
          x: t.p.x + t.right.x * lat + t.dir.x * z,
          z: t.p.z + t.right.z * lat + t.dir.z * z,
          heading: t.heading,
          halfWidth,
          halfLength,
        });
      }
    }
  }
  return cached;
}
export function bayFor(car) {
  return pitLayout()[Math.max(0, Math.min(5, car.teamId ?? car.id))];
}

export function pitSolids() {
  pitLayout();
  return solids;
}

// Support buildings behind the physical garages, in the LOCAL track frame.
// Extents include roofs. These are scenery outside the drivable outer barrier.
export function pitFacilities() {
  return [
    { id: "paddock", s: 100, offset: 80, halfWidth: 9, halfLength: 67 },
    { id: "tower", s: 11, offset: 80, halfWidth: 7.5, halfLength: 7.5 },
  ].map((b) => ({
    ...b,
    ...pitPoint(b.s, b.offset),
    heading: at(b.s).heading,
  }));
}

// Conservative footprint clearance for surrounding scenery, never a racing rule.
export function pitSceneryClear(x, z, radius) {
  const footprints = [
    ...pitFacilities(),
    ...pitLayout().map((b) => ({
      ...pitPoint(b.s, 50),
      heading: b.heading,
      halfWidth: 8.5,
      halfLength: b.garageLength / 2 + 0.2,
    })),
  ];
  return footprints.every((b) => {
    const dx = x - b.x,
      dz = z - b.z,
      cs = Math.cos(b.heading),
      sn = Math.sin(b.heading);
    return (
      Math.hypot(
        Math.max(0, Math.abs(dx * cs - dz * sn) - b.halfWidth),
        Math.max(0, Math.abs(dx * sn + dz * cs) - b.halfLength),
      ) > radius
    );
  });
}
