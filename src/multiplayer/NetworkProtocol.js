import { angle } from "../track.js";
import { clampInput, isSafeSnapshot, MAX_GRID_CARS } from "../racing/RaceConfig.js";

export const INPUT_INTERVAL_MS = 50;
export const SNAPSHOT_INTERVAL_MS = 50;
export const INTERPOLATION_DELAY_MS = 110;
export const MAX_PACKET_BYTES = 4096;

export function makeRaceSnapshot(race, raceId, seq, afterEventId = 0) {
  const cars = race.cars.map((car) => ({
    entityId: car.networkEntityId,
    x: rounded(car.x, 2),
    z: rounded(car.z, 2),
    heading: rounded(car.heading, 4),
    speed: rounded(car.speed, 2),
    s: rounded(car.s, 2),
    lateral: rounded(car.lateral, 2),
    progress: rounded(car.progress, 2),
    vx: rounded(car.vx, 2),
    vz: rounded(car.vz, 2),
    lap: car.lap,
    lapTime: rounded(car.lapTime, 3),
    bestLap: nullableRounded(car.bestLap, 3),
    finishTime: nullableRounded(car.finishTime, 3),
    fuel: rounded(car.fuel, 2),
    fuelPerLap: rounded(car.fuelPerLap, 3),
    tireCompound: String(car.tires?.compound || "medium").slice(0, 12),
    tireHealth: rounded(car.tires?.health, 3),
    tireTemperature: rounded(car.tires?.temperature, 1),
    damage: rounded(car.damage, 3),
    wingDamage: rounded(car.wingDamage, 3),
    mechanical: rounded(car.mechanical, 3),
    penalty: rounded(car.penalty, 3),
    throttle: rounded(car.throttle, 2),
    brake: rounded(car.brake, 2),
    steer: rounded(car.steer, 2),
    pit: {
      state: String(car.pit?.state || "track").slice(0, 12),
      requested: !!car.pit?.requested,
      stops: Number.isInteger(car.pit?.stops) ? car.pit.stops : 0,
      through: !!car.pit?.through,
      mergeWaiting: !!car.pit?.mergeWaiting,
    },
    retirement: String(car.retirement || "").slice(0, 80),
    finished: !!car.finished,
    retired: !!car.retired,
  }));
  const events = race.events
    .filter((event) => event.id > afterEventId)
    .slice(-8)
    .map((event) => ({
      id: event.id,
      type: event.type,
      entityId: race.cars[event.car]?.networkEntityId || null,
      againstEntityId:
        event.against == null
          ? null
          : race.cars[event.against]?.networkEntityId || null,
      detail: typeof event.detail === "string" ? event.detail.slice(0, 120) : "",
      time: rounded(event.time, 3),
    }));
  return {
    raceId,
    seq,
    time: rounded(race.time, 3),
    state: race.state,
    flag: race.flag,
    countdown: rounded(race.countdown, 2),
    cars,
    events,
  };
}

export function isValidRaceSnapshot(snapshot, raceId) {
  if (!snapshot || snapshot.raceId !== raceId) return false;
  if (!isSafeSnapshot(snapshot, MAX_GRID_CARS)) return false;
  if (!new Set(["countdown", "racing", "finishing", "results", "red"]).has(snapshot.state))
    return false;
  if (!new Set(["green", "yellow", "red", "checkered"]).has(snapshot.flag))
    return false;
  if (!Number.isFinite(snapshot.countdown) || snapshot.countdown < -1 || snapshot.countdown > 10)
    return false;
  if (snapshot.events !== undefined) {
    if (!Array.isArray(snapshot.events) || snapshot.events.length > 8) return false;
    for (const event of snapshot.events) {
      if (
        !event ||
        !Number.isSafeInteger(event.id) || event.id < 1 ||
        typeof event.type !== "string" || event.type.length > 40 ||
        (event.entityId !== null && typeof event.entityId !== "string") ||
        (event.againstEntityId !== null && typeof event.againstEntityId !== "string") ||
        typeof event.detail !== "string" || event.detail.length > 120 ||
        !Number.isFinite(event.time) || event.time < 0 || event.time > 86400
      ) return false;
    }
  }
  return true;
}

export function validateRaceInput(payload, raceId, allowedPlayerIds) {
  if (!payload || payload.raceId !== raceId) return null;
  if (typeof payload.playerId !== "string" || !allowedPlayerIds.has(payload.playerId))
    return null;
  if (!Number.isSafeInteger(payload.seq) || payload.seq < 0) return null;
  const input = payload.input;
  if (!input || ![input.throttle, input.brake, input.steer].every(Number.isFinite))
    return null;
  return { playerId: payload.playerId, seq: payload.seq, input: clampInput(input) };
}

export function applyInterpolatedState(car, previous, current, alpha) {
  const t = Math.max(0, Math.min(1, alpha));
  for (const field of ["x", "z", "speed", "s", "lateral", "progress", "vx", "vz", "lapTime"]) {
    if (Number.isFinite(previous[field]) && Number.isFinite(current[field]))
      car[field] = previous[field] + (current[field] - previous[field]) * t;
  }
  if (Number.isFinite(previous.heading) && Number.isFinite(current.heading))
    car.heading = previous.heading + angle(current.heading - previous.heading) * t;
  const discrete = t < 0.5 ? previous : current;
  car.lap = discrete.lap;
  car.bestLap = discrete.bestLap;
  car.finishTime = discrete.finishTime;
  car.finished = !!discrete.finished;
  car.retired = !!discrete.retired;
  applyRaceTelemetry(car, previous, current, t);
  if (car.finished || car.retired) car.speed = 0;
}

export function applyRaceTelemetry(car, previous, current, alpha) {
  const t = Math.max(0, Math.min(1, alpha));
  for (const [field, key] of [
    ["fuel", "fuel"],
    ["fuelPerLap", "fuelPerLap"],
    ["tireHealth", "health"],
    ["tireTemperature", "temperature"],
    ["damage", "damage"],
    ["wingDamage", "wingDamage"],
    ["mechanical", "mechanical"],
    ["penalty", "penalty"],
    ["throttle", "throttle"],
    ["brake", "brake"],
    ["steer", "steer"],
  ]) {
    if (Number.isFinite(previous[field]) && Number.isFinite(current[field])) {
      const value = previous[field] + (current[field] - previous[field]) * t;
      if ((key === "health" || key === "temperature") && car.tires)
        car.tires[key] = value;
      else car[key] = value;
    }
  }
  const discrete = t < 0.5 ? previous : current;
  if (discrete.tireCompound && car.tires) car.tires.compound = discrete.tireCompound;
  if (discrete.pit && car.pit) Object.assign(car.pit, discrete.pit);
  if (typeof discrete.retirement === "string") car.retirement = discrete.retirement;
}

export function measurePacketBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Infinity;
  }
}

function rounded(value, places) {
  return Number.isFinite(value) ? Number(value.toFixed(places)) : 0;
}
function nullableRounded(value, places) {
  return Number.isFinite(value) ? Number(value.toFixed(places)) : null;
}
