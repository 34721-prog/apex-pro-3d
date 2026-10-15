import {
  activeTrack,
  at,
  samples,
  length,
  TRACK_WIDTH,
  bounds,
  curvature,
} from "../track.js";
import { pitPoint } from "../strategy/PitLayout.js";
const cache = new Map();
export const venueThemes = {
  forest: {
    roof: "#aebead",
    base: "#a5b0a4",
    accent: "#ba3652",
    format: "Clássica / bosque",
  },
  highland: {
    roof: "#70889b",
    base: "#c1c5c7",
    accent: "#b03b52",
    format: "Terraços / montanha",
  },
  coast: {
    roof: "#cfdfdf",
    base: "#bec8bd",
    accent: "#458dac",
    format: "Coberturas costeiras",
  },
  desert: {
    roof: "#d9c8a4",
    base: "#b6a284",
    accent: "#d77442",
    format: "Canopies do deserto",
  },
  city: {
    roof: "#798998",
    base: "#a7adb4",
    accent: "#d34973",
    format: "Temporária / urbana",
  },
  snow: {
    roof: "#dbe4e9",
    base: "#aebfc5",
    accent: "#6484a6",
    format: "Boreal / coberta",
  },
};
export function footprintDistance(v, x, z) {
  const dx = x - v.x,
    dz = z - v.z,
    cs = Math.cos(v.heading),
    sn = Math.sin(v.heading);
  return Math.hypot(
    Math.max(0, Math.abs(dx * cs - dz * sn) - v.halfWidth),
    Math.max(0, Math.abs(dx * sn + dz * cs) - v.halfDepth),
  );
}
export function overlapVenues(a, b, gap = 4) {
  const ca = Math.cos(a.heading),
    sa = Math.sin(a.heading),
    cb = Math.cos(b.heading),
    sb = Math.sin(b.heading);
  for (const [x, z] of [
    [ca, -sa],
    [sa, ca],
    [cb, -sb],
    [sb, cb],
  ]) {
    const ra =
        Math.abs(x * ca - z * sa) * a.halfWidth +
        Math.abs(x * sa + z * ca) * a.halfDepth,
      rb =
        Math.abs(x * cb - z * sb) * b.halfWidth +
        Math.abs(x * sb + z * cb) * b.halfDepth;
    if (Math.abs((b.x - a.x) * x + (b.z - a.z) * z) > ra + rb + gap)
      return false;
  }
  return true;
}
export function venueCorners(v) {
  const cs = Math.cos(v.heading),
    sn = Math.sin(v.heading);
  return [-1, 1].flatMap((x) =>
    [-1, 1].map((z) => ({
      x: v.x + x * v.halfWidth * cs + z * v.halfDepth * sn,
      z: v.z - x * v.halfWidth * sn + z * v.halfDepth * cs,
    })),
  );
}
export function venuePlan() {
  const key = activeTrack.id + ":" + length + ":" + TRACK_WIDTH;
  if (cache.has(key)) return cache.get(key);
  const pit = [];
  for (let s = -250; s <= 350; s += 10)
    for (const off of [0, 15, 26, 36, 50, 65, 80, 99, 112])
      pit.push(pitPoint(s, off));
  const result = [],
    theme = venueThemes[activeTrack.theme] || venueThemes.forest;
  const targets = [0.002, 0.055, 0.17, 0.28, 0.4, 0.51, 0.63, 0.74, 0.85, 0.94];
  for (let i = 0; i < targets.length; i++) {
    const main = i < 2,
      width = main
        ? 76
        : activeTrack.theme === "city"
          ? 44
          : activeTrack.theme === "desert"
            ? 72
            : 58 + (i % 2) * 8,
      rows = main ? 10 : activeTrack.theme === "city" ? 6 : 7 + (i % 3),
      depth = rows * 1.2 + 3;
    const ss = [0, -0.012, 0.012, -0.025, 0.025].map(
      (shift) => ((targets[i] + shift + 1) % 1) * length,
    );
    if (!main)
      ss.sort((a, b) =>
        i % 3 === 0 ? curvature(a) - curvature(b) : curvature(b) - curvature(a),
      );
    let found;
    search: for (const s of ss)
      for (const side of main ? [-1, 1] : i % 2 ? [1, -1] : [-1, 1])
        candidate: for (const front of [32, 43, 58, 76, 100]) {
          const t = at(s),
            heading = t.heading + (side * Math.PI) / 2,
            offset = side * (front + depth / 2),
            v = {
              id: activeTrack.id + "-" + i,
              index: i,
              s,
              x: t.p.x + t.right.x * offset,
              z: t.p.z + t.right.z * offset,
              heading,
              side,
              front,
              width,
              rows,
              depth,
              halfWidth: width / 2 + 2,
              halfDepth: depth / 2 + 2,
              sector: Math.min(3, Math.floor((s / length) * 3) + 1),
              main,
              night: !!activeTrack.night,
              theme: activeTrack.theme,
              colors: theme,
              roof: main || activeTrack.theme !== "city" || i % 2 === 0,
              screen: [0, 3, 6, 8].includes(i),
              label: main
                ? "RETA PRINCIPAL"
                : curvature(s) > 0.008
                  ? "CURVA / SETOR " + (Math.floor((s / length) * 3) + 1)
                  : "RETA / SETOR " + (Math.floor((s / length) * 3) + 1),
            };
          if (
            activeTrack.theme === "coast" &&
            venueCorners(v).some((c) => c.x > bounds().maxX + 53)
          )
            continue;
          if (result.some((o) => overlapVenues(v, o))) continue;
          let minRoad = Infinity;
          for (const p of samples) {
            const d = footprintDistance(v, p.x, p.z);
            if (d < TRACK_WIDTH / 2 + 8) continue candidate;
            minRoad = Math.min(minRoad, d);
          }
          let minPit = Infinity;
          for (const p of pit) {
            const d = footprintDistance(v, p.x, p.z);
            if (d < 8) continue candidate;
            minPit = Math.min(minPit, d);
          }
          v.minRoadClearance = minRoad;
          v.minPitClearance = minPit;
          v.columns = Math.floor((width - 4) / 0.85);
          v.capacity = v.columns * rows;
          v.spectators = 0;
          for (let row = 0; row < rows; row++)
            for (let col = 0; col < v.columns; col++)
              if (col % 21 !== 10) v.spectators++;
          found = v;
          break search;
        }
    if (!found)
      throw Error(
        "Não há posição segura para arquibancada " + activeTrack.id + "/" + i,
      );
    result.push(found);
  }
  cache.set(key, result);
  return result;
}
