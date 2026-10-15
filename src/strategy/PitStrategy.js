import { defaultStrategy, policyFor } from "./RaceStrategy.js";
import { length } from "../track.js";
import { PIT_ENTRY, PIT_EXIT, PIT_LIMIT } from "./PitLayout.js";
export function setPlan(car, laps = []) {
  car.pit.plan = [
    ...new Set(
      laps.filter((n) => Number.isInteger(n) && n > 0 && n < car.plannedLaps),
    ),
  ]
    .sort((a, b) => a - b)
    .slice(0, 6);
}
export function serviceEstimate(car) {
  const p = car.pit,
    level = Math.max(0, Math.min(5, car.crewLevel || 0));
  const fuel =
    p.jobs?.fuel && car.realism === "realistic"
      ? Math.max(0, car.capacity * (p.fuelTarget ?? 1) - car.fuel)
      : 0;
  const repair = p.jobs?.repair ? car.damage : 0;
  return (
    Math.max(1.5, (p.jobs?.tires === false ? 1.2 : 4.2) - level * 0.24) +
    fuel * 0.07 +
    repair * 7 +
    (car.mechanical || 0) * 6 +
    (car.boxPenaltySeconds || 0)
  );
}
export function estimatePitLoss(car) {
  return (
    Math.max(
      0,
      (PIT_EXIT - PIT_ENTRY) / (PIT_LIMIT * 0.87) - (PIT_EXIT - PIT_ENTRY) / 48,
    ) +
    serviceEstimate(car) +
    5
  );
}
// Deliberation at 1 Hz, not every physics tick. The controller still runs at 60 Hz.
export function strategyDecision(car, cars) {
  const p = car.pit,
    remaining = Math.max(0, car.plannedLaps - car.lap - car.s / length);
  if (p.state !== "track" || p.requested || remaining < 0.18) return;
  const policy = car.policy || policyFor(car.strategy || defaultStrategy());
  let closestGap = Infinity;
  for (const other of cars)
    if (
      other !== car &&
      !other.isSafetyCar &&
      !other.finished &&
      !other.retired
    )
      closestGap = Math.min(
        closestGap,
        Math.abs(other.progress - car.progress) / Math.max(22, car.speed),
      );
  p.rivalGap = Number.isFinite(closestGap) ? closestGap : null;
  p.estimatedLoss = estimatePitLoss(car);
  const due = p.plan?.some((l) => l > p.lastPlannedLap && car.lap >= l - 1);
  const emergency =
    (car.realism === "realistic" &&
      car.fuel < car.fuelPerLap * Math.min(policy.reserve, remaining + 0.13)) ||
    car.damage > 0.65 ||
    (car.mechanical || 0) > 0.2 ||
    car.boxPenaltySeconds > 0;
  const weather =
    (((car.wetness ?? (car.weather === "rain" ? 1 : 0)) > 0.4 &&
      car.tires.compound !== "wet") ||
      ((car.wetness ?? 1) < 0.12 && car.tires.compound === "wet")) &&
    remaining > 0.7;
  const wear =
    car.realism === "realistic" &&
    car.tires.health < policy.wear + (car.driverId % 5) * 0.012;
  // An undercut window can bring a worn-tire stop slightly earlier; no speed bonus.
  const opportunity =
    policy.opportunistic &&
    car.realism === "realistic" &&
    car.tires.health < policy.wear + 0.08 &&
    remaining > 1.2 &&
    (car.flag === "yellow" || closestGap < 1.5) &&
    car.id % 2 === car.lap % 2;
  // Avoid a nonurgent same-team double stack; emergency stops always remain possible.
  const busy = cars.some(
    (c) =>
      c !== car &&
      !c.isSafetyCar &&
      c.teamId === car.teamId &&
      (c.pit.requested || c.pit.state !== "track"),
  );
  if (
    emergency ||
    weather ||
    ((due || wear || opportunity) && (!busy || !policy.avoidStack))
  ) {
    p.requested = true;
    car.engineerEvent = "Preparando os boxes para esta volta.";
    p.reason = emergency
      ? "Recursos / danos"
      : weather
        ? "Chuva"
        : due
          ? "Plano de voltas"
          : opportunity
            ? "Janela / VSC"
            : "Desgaste";
    if (weather) p.compound = (car.wetness ?? 1) > 0.4 ? "wet" : "medium";
    else if (remaining > 4) p.compound = "hard";
    else if (!due) p.compound = remaining < 1.7 ? "soft" : "medium";
  }
}
