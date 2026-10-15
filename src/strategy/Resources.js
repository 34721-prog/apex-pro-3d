import { length } from "../track.js";
export const compounds = {
  hard: { label: "Duro", color: "#dfe4e7", grip: 0.94, life: 1.35 },
  medium: { label: "Médio", color: "#e6bd52", grip: 1, life: 0.82 },
  soft: { label: "Macio", color: "#ef3856", grip: 1.08, life: 0.52 },
  wet: { label: "Chuva", color: "#5a9ccc", grip: 0.79, life: 0.92 },
};
export function initializeResources(
  car,
  { laps = 3, realism = "arcade", weather = "dry", tire = "medium" } = {},
) {
  car.realism = realism;
  car.weather = weather;
  car.capacity = 110;
  car.fuelRate = 0.00115 * car.stats.consumption;
  car.fuelPerLap = length * car.fuelRate;
  car.plannedLaps = laps;
  car.fuel = Math.min(
    car.capacity,
    car.fuelPerLap *
      (realism === "realistic" && laps >= 6 ? laps * 0.73 : laps + 1.25),
  );
  car.tires = {
    compound: compounds[tire] ? tire : "medium",
    health: 1,
    temperature: 60,
    distance: 0,
  };
  car.pit = {
    state: "track",
    requested: false,
    stops: 0,
    remaining: 0,
    total: 0,
    compound: car.tires.compound,
    jobs: { tires: true, repair: true, fuel: realism === "realistic" },
    fuelTarget: 1,
    plan: [],
    lastPlannedLap: 0,
    history: [],
  };
  car.penalty = 0;
  car.tireGrip = 1;
}
export function updateResources(car, dt) {
  if (car.finished || car.retired || car.pit.state === "service") return;
  const distance = car.speed * dt;
  car.tires.distance = (car.tires.distance || 0) + distance;
  if (car.realism === "realistic")
    car.fuel = Math.max(
      0,
      car.fuel -
        distance *
          car.fuelRate *
          (0.9 + car.throttle * 0.12 + Math.abs(car.slip) * 0.04),
    );
  const tire = compounds[car.tires.compound],
    lifeLaps = Math.max(
      car.tires.compound === "soft" ? 2.2 : 4,
      car.plannedLaps * tire.life,
    );
  const wear =
    (distance / (length * lifeLaps)) *
    car.stats.tireWear *
    (1 + Math.abs(car.slip) * 1.7 + (car.offroad ? 0.6 : 0)) *
    (car.tires.compound === "wet" && car.weather === "dry" ? 1.8 : 1);
  car.tires.health = Math.max(
    0.05,
    car.tires.health - wear * (car.realism === "realistic" ? 1 : 0.18),
  );
  car.tires.temperature +=
    (65 +
      car.speed * 0.33 +
      Math.abs(car.slip) * 30 -
      (car.weather === "rain" ? 12 : 0) -
      car.tires.temperature) *
    dt *
    0.045;
  const warm = Math.max(0.88, 1 - Math.abs(car.tires.temperature - 85) * 0.003);
  car.tireGrip =
    (tire.grip +
      ((car.tires.compound === "wet" ? 1.15 : 0.78) - tire.grip) *
        (car.wetness ?? (car.weather === "rain" ? 1 : 0))) *
    (0.58 + car.tires.health * 0.42) *
    warm;
  if (
    car.realism === "realistic" &&
    (car.damage >= 0.98 || (car.fuel === 0 && car.speed < 0.1))
  ) {
    car.retired = true;
    car.speed = 0;
    car.vx = car.vz = 0;
    car.retirement =
      car.damage >= 0.98 ? "Danos críticos" : "Combustível esgotado";
  }
}
export function service(car) {
  const work = car.pit.work || car.pit;
  if (work.jobs?.fuel && car.realism === "realistic")
    car.fuel = Math.max(car.fuel, car.capacity * (work.fuelTarget ?? 1));
  if (work.jobs?.tires !== false) {
    if (car.managerControlled) {
      car.stints.push({
        compound: car.tires.compound,
        health: car.tires.health,
        distance: car.tires.distance || 0,
        lap: car.lap + 1,
      });
      if (car.stints.length > 20) car.stints.shift();
    }
    car.tires = {
      compound: work.compound,
      health: 1,
      temperature: 70,
      distance: 0,
    };
  }
  if (work.jobs?.repair !== false) {
    car.damage = 0;
    car.mechanical = 0;
    car.wingDamage = 0;
  }
  car.tireGrip = 1;
  car.pit.stops++;
}
