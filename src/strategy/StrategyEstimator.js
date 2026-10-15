import { length, curvature, curve } from "../track.js";
import {
  pitPoint,
  PIT_ENTRY,
  PIT_EXIT,
  PIT_LIMIT,
  SERVICE_LANE,
  FAST_LANE,
} from "./PitLayout.js";
import { serviceEstimate } from "./PitStrategy.js";
import { compounds } from "./Resources.js";
import { difficulties } from "../ai.js";
const pace = { conserve: 0.9, balanced: 1, aggressive: 1.028, maximum: 1.04 };
// Only invariant geometry is cached; all car/weather/service inputs remain live.
let geometryCurve, bendSamples, laneDistance;
function geometry() {
  if (geometryCurve === curve) return;
  geometryCurve = curve;
  bendSamples = Float64Array.from({ length: 96 }, (_, i) =>
    curvature(i * (length / 96) + 25),
  );
  laneDistance = 0;
  let last = pitPoint(PIT_ENTRY);
  for (let i = 1; i <= 64; i++) {
    const p = pitPoint(PIT_ENTRY + ((PIT_EXIT - PIT_ENTRY) * i) / 64);
    laneDistance += Math.hypot(p.x - last.x, p.z - last.z);
    last = p;
  }
}
export function referenceLap(
  c,
  difficulty = "normal",
  compound = c.tires.compound,
  health = c.tires.health,
) {
  geometry();
  const wet = c.wetness ?? (c.weather === "rain" ? 1 : 0),
    t = compounds[compound],
    grip =
      (t.grip + ((compound === "wet" ? 1.15 : 0.78) - t.grip) * wet) *
      (0.58 + health * 0.42),
    ds = length / 96,
    speeds = [];
  for (let i = 0; i < 96; i++)
    speeds.push(
      Math.min(
        c.stats.maxSpeed,
        Math.sqrt(((15 - 5 * wet) * grip) / Math.max(0.002, bendSamples[i])) *
          (difficulties[difficulty]?.pace || 0.89) *
          (pace[c.managerPlan?.pace] || 1) *
          (0.94 +
            (c.personality?.precision || 0.8) * 0.035 +
            (c.personality?.skill || 0.8) * 0.025),
      ),
    );
  // Same acceleration/braking limits, approximate free-air envelope, not a second race.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 96; i++) {
      const prev = speeds[(i + 95) % 96];
      speeds[i] = Math.min(
        speeds[i],
        Math.sqrt(prev * prev + 2 * c.stats.acceleration * 0.7 * ds),
      );
    }
    for (let i = 95; i >= 0; i--) {
      const next = speeds[(i + 1) % 96];
      speeds[i] = Math.min(
        speeds[i],
        Math.sqrt(next * next + 2 * c.stats.braking * 0.65 * grip * ds),
      );
    }
  }
  return speeds.reduce((s, v) => s + ds / Math.max(8, v), 0);
}
export function pitLoss(c, race) {
  geometry();
  const distance = laneDistance;
  const speed = Math.max(
      18,
      length / (c.lastLap || referenceLap(c, race?.difficulty)),
    ),
    lane =
      distance / (PIT_LIMIT * 0.87) +
      (2 * Math.abs(SERVICE_LANE - FAST_LANE)) / 7;
  const braking =
    Math.max(
      0,
      (speed - PIT_LIMIT) / c.stats.braking +
        PIT_LIMIT / Math.max(1, c.stats.acceleration),
    ) / 2;
  const neutral =
    race?.control?.phase === "vsc" || race?.control?.phase === "sc";
  const trackSpeed = neutral ? Math.min(speed, c.controlLimit || 23) : speed;
  return Math.max(
    0,
    lane +
      serviceEstimate(c) +
      braking -
      (PIT_EXIT - PIT_ENTRY) / Math.max(12, trackSpeed),
  );
}
export function estimateStrategy(c, plan, race = {}) {
  const laps = Math.max(1, race.laps || c.plannedLaps),
    base = referenceLap(c, race.difficulty, plan.start, 1),
    loss = pitLoss(c, race),
    stops = plan.stops.filter((s) => s.from < laps);
  let health = 1,
    compound = plan.start,
    total = 0,
    risk = [],
    stop = 0;
  for (let lap = 1; lap <= laps; lap++) {
    const life = Math.max(
        compound === "soft" ? 2.2 : 4,
        laps * compounds[compound].life,
      ),
      wear =
        (c.stats.tireWear / life) *
        (c.realism === "realistic" ? 1 : 0.18) *
        (compound === "wet" && (c.wetness ?? 0) < 0.12 ? 1.8 : 1);
    total += referenceLap(
      c,
      race.difficulty,
      compound,
      Math.max(0.05, health - wear / 2),
    );
    health = Math.max(0.05, health - wear);
    if (health < 0.22 && !risk.includes("Desgaste elevado previsto"))
      risk.push("Desgaste elevado previsto");
    while (stops[stop] && lap === stops[stop].from) {
      total += loss;
      compound = stops[stop].compound;
      health = 1;
      stop++;
    }
  }
  if (plan.pace === "maximum" || plan.pace === "aggressive")
    risk.push("Margem menor para erros/temperatura");
  if (
    c.realism === "realistic" &&
    c.fuel / c.fuelPerLap < laps &&
    !stops.length
  )
    risk.push("Combustível insuficiente sem reabastecer");
  if ((c.wetness ?? 0) > 0.4 && plan.start !== "wet")
    risk.push("Composto inicial incompatível com pista molhada");
  const calibration =
    c.lastLap && c.pit.state === "track"
      ? c.lastLap / referenceLap(c, race.difficulty)
      : 1;
  return {
    total: total * Math.max(0.8, Math.min(1.3, calibration)),
    baseLap: base,
    pitLoss: loss,
    stops: stops.length,
    risk,
    model:
      "Envelope físico em ar livre; clima atual; parada no início da janela; sem previsão de incidentes ou garantia estatística",
  };
}
