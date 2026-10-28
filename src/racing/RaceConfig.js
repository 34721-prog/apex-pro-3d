export const MIN_RACE_LAPS = 8;
export const MAX_RACE_LAPS = 30;
export const MAX_GRID_CARS = 6;

// Saved single-player settings are migrated/clamped, while interactive input is
// rejected when it is outside the supported range.
export function clampRaceLaps(value, fallback = MIN_RACE_LAPS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_RACE_LAPS, Math.min(MAX_RACE_LAPS, Math.floor(n)));
}

export function assertRaceLaps(value) {
  if (
    !Number.isInteger(value) ||
    value < MIN_RACE_LAPS ||
    value > MAX_RACE_LAPS
  )
    throw new RangeError(
      `A corrida deve ter entre ${MIN_RACE_LAPS} e ${MAX_RACE_LAPS} voltas.`,
    );
  return value;
}

export function validateRoomSettings(input = {}) {
  const name = String(input.name ?? "").trim();
  const visibility = input.visibility;
  const laps = Number(input.lapCount ?? input.lap_count);
  const maxPlayers = Number(input.maxPlayers ?? input.max_players);
  const bots = Number(input.botCount ?? input.bot_count);
  const trackId = String(input.trackId ?? input.track_id ?? "");
  if (name.length < 3 || name.length > 40)
    throw new RangeError("O nome da sala deve ter entre 3 e 40 caracteres.");
  if (!["public", "private"].includes(visibility))
    throw new RangeError("Escolha uma sala pública ou privada.");
  assertRaceLaps(laps);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > MAX_GRID_CARS)
    throw new RangeError(`O limite de jogadores deve ser de 2 a ${MAX_GRID_CARS}.`);
  if (!Number.isInteger(bots) || bots < 0 || bots > MAX_GRID_CARS - 1)
    throw new RangeError(`A quantidade de bots deve ser de 0 a ${MAX_GRID_CARS - 1}.`);
  if (!/^[a-z0-9-]{2,32}$/i.test(trackId))
    throw new RangeError("Escolha uma pista válida.");
  return {
    name,
    visibility,
    trackId,
    lapCount: laps,
    maxPlayers,
    botCount: bots,
  };
}

function bounded(value, min, max) {
  return value === undefined || value === null ||
    (Number.isFinite(value) && value >= min && value <= max);
}

export function clampInput(input = {}) {
  return {
    throttle: Math.max(0, Math.min(1, Number(input.throttle) || 0)),
    brake: Math.max(0, Math.min(1, Number(input.brake) || 0)),
    steer: Math.max(-1, Math.min(1, Number(input.steer) || 0)),
  };
}

export function isSafeSnapshot(snapshot, maxCars = MAX_GRID_CARS) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (!Number.isSafeInteger(snapshot.seq) || snapshot.seq < 0) return false;
  if (!Array.isArray(snapshot.cars) || snapshot.cars.length > maxCars) return false;
  if (!Number.isFinite(snapshot.time) || snapshot.time < 0 || snapshot.time > 86400)
    return false;
  const entityIds = new Set();
  return snapshot.cars.every((car) => {
    if (!car || typeof car.entityId !== "string" || car.entityId.length > 48)
      return false;
    if (entityIds.has(car.entityId)) return false;
    entityIds.add(car.entityId);
    const fields = [
      "x", "z", "heading", "speed", "s", "lateral", "progress", "vx", "vz",
      "lapTime", "lap", "bestLap", "finishTime", "fuel", "fuelPerLap",
      "tireHealth", "tireTemperature", "damage", "wingDamage", "mechanical",
      "penalty", "throttle", "brake", "steer",
    ];
    for (const key of fields) {
      const value = car[key];
      if (value !== null && value !== undefined && !Number.isFinite(value)) return false;
    }
    if (car.pit !== undefined) {
      if (!car.pit || typeof car.pit !== "object") return false;
      if (!["track", "entry", "queue", "service", "release", "exit"].includes(car.pit.state))
        return false;
      if (![car.pit.requested, car.pit.through, car.pit.mergeWaiting].every((v) => typeof v === "boolean"))
        return false;
      if (!Number.isInteger(car.pit.stops) || car.pit.stops < 0 || car.pit.stops > 100)
        return false;
    }
    if (car.tireCompound !== undefined && !["hard", "medium", "soft", "wet"].includes(car.tireCompound))
      return false;
    if (car.retirement !== undefined && (typeof car.retirement !== "string" || car.retirement.length > 80))
      return false;
    if (["finished", "retired"].some((key) => car[key] !== undefined && typeof car[key] !== "boolean"))
      return false;
    return (
      Number.isFinite(car.x) &&
      Math.abs(car.x) <= 20000 &&
      Number.isFinite(car.z) &&
      Math.abs(car.z) <= 20000 &&
      Number.isFinite(car.progress) &&
      Math.abs(car.progress) <= 1e7 &&
      Number.isFinite(car.speed) &&
      car.speed >= 0 && car.speed <= 150 &&
      Number.isInteger(car.lap) && car.lap >= 0 && car.lap <= MAX_RACE_LAPS &&
      bounded(car.fuel, 0, 10000) &&
      bounded(car.fuelPerLap, 0, 1000) &&
      bounded(car.tireHealth, 0, 1) &&
      bounded(car.tireTemperature, 0, 300) &&
      bounded(car.damage, 0, 1) &&
      bounded(car.wingDamage, 0, 1) &&
      bounded(car.mechanical, 0, 1) &&
      bounded(car.penalty, 0, 3600) &&
      bounded(car.throttle, 0, 1) &&
      bounded(car.brake, 0, 1) &&
      bounded(car.steer, -1, 1)
    );
  });
}
