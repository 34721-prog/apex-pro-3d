import { closest, at, angle, TRACK_WIDTH } from "../track.js";
import { collideBarrier } from "./CollisionSystem.js";
export { collisions } from "./CollisionSystem.js";
export const BASE = {
  maxSpeed: 69,
  acceleration: 23,
  handling: 1,
  braking: 44,
  grip: 25,
  stability: 1,
  consumption: 1,
  durability: 1,
  tireWear: 1,
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function createDriver(id, name, s, lane = 0, stats = BASE) {
  const a = at(s);
  return {
    id,
    name,
    x: a.p.x + a.right.x * lane,
    z: a.p.z + a.right.z * lane,
    heading: a.heading,
    speed: 0,
    vx: 0,
    vz: 0,
    velocityHeading: a.heading,
    steer: 0,
    throttle: 0,
    brake: 0,
    s,
    previousS: s,
    index: -1,
    lateral: lane,
    stats: { ...BASE, ...stats },
    lap: 0,
    checkpoint: 0,
    lapTime: 0,
    bestLap: null,
    finished: false,
    finishTime: null,
    progress: s,
    offroad: false,
    recoveries: 0,
    damage: 0,
    impact: 0,
    slip: 0,
    realism: "arcade",
    weather: "dry",
    assistance: true,
    load: 0,
  };
}
export function stepCar(car, raw = {}, dt) {
  if (car.finished || car.retired || dt <= 0 || !Number.isFinite(dt)) return;
  const input = {
    throttle: clamp(Number(raw?.throttle) || 0, 0, 1),
    brake: clamp(Number(raw?.brake) || 0, 0, 1),
    steer: clamp(Number(raw?.steer) || 0, -1, 1),
  };
  const st = car.stats,
    gripSurface = car.offroad
      ? 0.48
      : 1 - 0.32 * (car.wetness ?? (car.weather === "rain" ? 1 : 0)),
    tireGrip = car.tireGrip ?? 1;
  const grip = Math.max(
    0.25,
    gripSurface *
      tireGrip *
      (1 - car.damage * 0.2) *
      (1 - (car.wingDamage || 0) * 0.18),
  );
  car.throttle += (input.throttle - car.throttle) * (1 - Math.exp(-dt * 12));
  car.brake += (input.brake - car.brake) * (1 - Math.exp(-dt * 18));
  const sensitivity = clamp(raw.sensitivity || 1, 0.4, 1.8),
    highSpeed = 1 / (1 + Math.max(0, car.speed - 35) * 0.005);
  car.steer +=
    (input.steer * sensitivity * highSpeed - car.steer) *
    (1 - Math.exp(-dt * 8 * st.stability));
  let requestedYaw =
    car.steer * (0.35 + (Math.min(car.speed, 50) / 50) * 1.02) * st.handling;
  const yawLimit = (st.grip * grip) / Math.max(8, car.speed);
  let yaw =
    clamp(requestedYaw, -yawLimit, yawLimit) * Math.min(car.speed / 6, 1);
  // Grip-limited yaw gives understeer; trail braking loosens the rear slightly.
  const oversteer =
    (car.brake *
      Math.abs(car.steer) *
      clamp(car.speed / 50, 0, 1) *
      (car.realism === "realistic" ? 0.15 : 0.05)) /
    st.stability;
  yaw *= 1 + oversteer;
  car.heading += yaw * dt;
  const damagePower =
      (1 - car.damage * 0.32) * (1 - (car.mechanical || 0) * 0.5),
    fuelPower = car.realism === "realistic" && car.fuel === 0 ? 0 : 1;
  let accel =
    car.throttle *
      st.acceleration *
      (1 - (0.45 * car.speed) / st.maxSpeed) *
      damagePower *
      fuelPower -
    car.brake * st.braking * grip;
  accel -=
    0.65 +
    car.speed * 0.015 +
    car.speed * car.speed * 0.00018 +
    Math.abs(car.steer) * car.speed * 0.036;
  if (car.offroad) accel -= 11 + car.speed * 0.16;
  car.speed = clamp(car.speed + accel * dt, 0, st.maxSpeed * damagePower);
  if (car.offroad) car.speed = Math.min(car.speed, st.maxSpeed * 0.6);
  const actualDirection =
    Math.hypot(car.vx, car.vz) > 0.5
      ? Math.atan2(car.vx, car.vz)
      : car.velocityHeading;
  car.velocityHeading =
    actualDirection +
    angle(car.heading - actualDirection) *
      (1 - Math.exp(-dt * (car.assistance ? 16 : 10) * grip * st.stability));
  car.slip = angle(car.heading - car.velocityHeading);
  car.load +=
    (clamp(-accel / 50, -0.3, 0.45) - car.load) * (1 - Math.exp(-dt * 6));
  car.vx = Math.sin(car.velocityHeading) * car.speed;
  car.vz = Math.cos(car.velocityHeading) * car.speed;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  const near = closest(car.x, car.z, car.index);
  near.carX = car.x;
  near.carZ = car.z;
  car.projection = near;
  car.s = near.s;
  car.index = near.index;
  car.lateral = near.lateral;
  car.offroad = near.distance > TRACK_WIDTH / 2 + 0.8;
  car.impact = Math.max(0, car.impact - dt * 15);
  collideBarrier(car, near);
}
export function recover(car) {
  if (car.pit) {
    car.pit.state = "track";
    car.pit.requested = false;
    car.pit.ownsBay = false;
  }
  const t = at(car.s);
  car.x = t.p.x;
  car.z = t.p.z;
  car.heading = t.heading;
  car.velocityHeading = t.heading;
  car.speed = Math.min(car.speed, 8);
  car.vx = t.dir.x * car.speed;
  car.vz = t.dir.z * car.speed;
  car.steer = 0;
  car.offroad = false;
  car.recoveries++;
  car.lapInvalid = true;
  car.previousS = car.s;
}
