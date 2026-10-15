import { TRACK_WIDTH } from "../track.js";
import { createDriver, stepCar, BASE } from "../physics.js";
import { initializeResources } from "../strategy/Resources.js";
import { at, length, angle, curvature, closest } from "../track.js";
import {
  pitPoint,
  pitOffset,
  signedPitS,
  smooth,
} from "../strategy/PitLayout.js";
import { mergeSafe } from "../strategy/PitStop.js";
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export class SafetyCar {
  constructor() {
    const c = (this.car = createDriver(6, "Safety Car", 180, 36, {
      ...BASE,
      maxSpeed: 24,
      acceleration: 18,
      braking: 48,
      grip: 30,
    }));
    initializeResources(c);
    const near = closest(c.x, c.z);
    near.carX = c.x;
    near.carZ = c.z;
    c.projection = near;
    c.index = near.index;
    c.isSafetyCar = true;
    c.teamId = 5;
    c.pit.state = "service";
    this.state = "parked";
    this.requested = false;
    this.elapsed = 0;
  }
  request() {
    this.requested = true;
  }
  update(dt, race) {
    const c = this.car,
      leader = race
        .physicalOrder()
        .find((c) => !c.finished && !c.retired && c.pit.state === "track");
    if (!leader) return;
    const ps = signedPitS(c.s);
    if (this.state === "parked") {
      if (!this.requested) return;
      const distance = (310 - leader.s + length) % length;
      if (distance < 420 || distance > 750 || !mergeSafe(c, race.cars, 180))
        return;
      this.state = "deploy";
      this.requested = false;
      c.pit.state = "exit";
      c.pit.through = true;
      this.elapsed = 0;
      race.emit("safety-car", null, "Safety Car saindo dos boxes");
    }
    this.elapsed += dt;
    let targetSpeed = 20,
      offset = 0,
      look = 10 + c.speed * 0.25,
      targetS = ps + look;
    if (this.state === "deploy") {
      offset =
        ps < 210 ? 36 - 10 * smooth((targetS - 180) / 30) : pitOffset(targetS);
      targetSpeed = 15;
      if (ps > 210 && ps < 250 && !mergeSafe(c, race.cars, ps))
        targetSpeed = Math.sqrt(Math.max(0, 247 - ps) * 6);
      if (ps > 308 && Math.abs(c.lateral) < 3.5) {
        this.state = "train";
        c.pit.state = "track";
        this.elapsed = 0;
        c.progress = leader.progress + ((c.s - leader.s + length) % length);
        race.emit("safety-car", null, "Safety Car na pista · reagrupar");
      }
    } else if (this.state === "train" || this.state === "inlap") {
      targetS = c.s + look;
      const obstacle = race.cars.find(
        (o) =>
          !o.finished &&
          o.speed < 1 &&
          ((o.s - c.s + length * 1.5) % length) - length / 2 > -9 &&
          ((o.s - c.s + length * 1.5) % length) - length / 2 < 75 &&
          Math.abs(o.lateral) < 3.6,
      );
      let desired = 0;
      if (obstacle) {
        const lane = Math.min(4.2, TRACK_WIDTH / 2 - 2);
        for (const candidate of [
          obstacle.lateral >= 0 ? -lane : lane,
          obstacle.lateral >= 0 ? lane : -lane,
        ])
          if (
            !race.cars.some(
              (o) =>
                o !== obstacle &&
                !o.finished &&
                Math.abs(((o.s - c.s + length * 1.5) % length) - length / 2) <
                  15 &&
                Math.abs(o.lateral - candidate) < 3.6,
            )
          ) {
            desired = candidate;
            break;
          }
      }
      this.trackLane ??= 0;
      this.trackLane += clamp(desired - this.trackLane, -0.025, 0.025);
      offset = this.trackLane;
      targetSpeed = Math.min(
        22,
        Math.sqrt(
          8 / Math.max(0.003, curvature(c.s + 20), curvature(c.s + 50)),
        ),
      );
      const gap = (c.s - leader.s + length) % length,
        field = race.cars.filter(
          (o) => !o.finished && !o.retired && o.pit.state === "track",
        );
      if (
        this.state === "train" &&
        this.elapsed > 18 &&
        gap < 65 &&
        field.every((o) => (c.s - o.s + length) % length < 260)
      ) {
        this.state = "inlap";
        race.emit("safety-car", null, "Safety Car recolhe nesta volta");
      }
      if (this.state === "inlap" && ps > -310 && ps < -230) {
        this.state = "return";
        c.pit.state = "entry";
        race.emit("safety-car", null, "Safety Car entrando no pit lane");
      }
    }
    if (this.state === "return") {
      targetS = ps + 8;
      offset =
        ps < 130 ? pitOffset(targetS) : 26 + 10 * smooth((targetS - 130) / 38);
      targetSpeed = Math.min(
        15,
        ps > 125 ? 8 : 15,
        Math.sqrt(Math.max(0, 180 - ps) * 6),
      );
      if (
        ps > 179 &&
        ps < 183 &&
        Math.abs(c.lateral - 36) < 1.5 &&
        c.speed < 0.45
      ) {
        this.state = "parked";
        c.pit.state = "service";
        c.speed = c.vx = c.vz = 0;
        race.emit("safety-car", null, "Safety Car estacionado");
        return;
      }
    }
    const caution =
      race.control.sectors[Math.min(2, Math.floor((c.s / length) * 3))];
    if (caution && c.pit.state === "track")
      targetSpeed = Math.min(
        targetSpeed,
        caution.type === "double-yellow" ? 14 : 28,
      );
    const p = pitPoint(targetS, offset),
      delta = angle(Math.atan2(p.x - c.x, p.z - c.z) - c.heading);
    for (const o of race.cars) {
      if (o.finished) continue;
      const dx = o.x - c.x,
        dz = o.z - c.z,
        f = dx * Math.sin(c.heading) + dz * Math.cos(c.heading),
        side = dx * Math.cos(c.heading) - dz * Math.sin(c.heading);
      if (f > 0 && f < 25 && Math.abs(side) < 3.5)
        targetSpeed = Math.min(targetSpeed, Math.sqrt(Math.max(0, f - 8) * 7));
    }
    const old = c.s;
    stepCar(
      c,
      {
        steer: clamp(delta * 3.3, -1, 1),
        throttle: c.speed < targetSpeed - 0.2 ? 0.65 : 0,
        brake:
          c.speed > targetSpeed
            ? clamp(0.25 + (c.speed - targetSpeed) * 0.3, 0, 1)
            : 0,
      },
      dt,
    );
    c.offroad = false;
    let ds = c.s - old;
    if (ds < -length / 2) ds += length;
    if (ds > length / 2) ds -= length;
    c.progress += ds;
  }
}
