import { reportInfraction } from "../regulations/RuleBook.js";
import { length, angle, at } from "../track.js";
import { service } from "./Resources.js";
import { serviceEstimate, strategyDecision } from "./PitStrategy.js";
import {
  PIT_LIMIT,
  PIT_ENTRY,
  PIT_EXIT,
  FAST_LANE,
  SERVICE_LANE,
  signedPitS,
  smooth,
  pitOffset,
  pitPoint,
  pitZone,
  bayFor,
} from "./PitLayout.js";
export {
  PIT_LIMIT,
  signedPitS,
  pitOffset,
  pitPoint,
  pitZone,
} from "./PitLayout.js";
const sessions = new WeakMap();
export function pitSession(cars) {
  let v = sessions.get(cars);
  if (!v) {
    v = { owners: new Int16Array(6).fill(-1) };
    sessions.set(cars, v);
  }
  return v;
}
export function requestPit(car) {
  if (car.pit.state !== "track") return false;
  car.pit.requested = !car.pit.requested;
  car.pit.approachAuthorized = false;
  car.pit.reason = "Solicitação do piloto";
  return car.pit.requested;
}
export function mergeSafe(car, cars, s = signedPitS(car.s)) {
  // Test a swept time interval covering the entire conflict zone. The old
  // single-point projection could release a car in front of accelerating traffic.
  const margin = car.policy?.mergeMargin ?? 1.25;
  const etaEntry = Math.max(0, (265 - s) / 15.6 - 0.55 * margin);
  const etaClear = Math.max(0.7, (PIT_EXIT + 8 - s) / 13.5 + 0.45 * margin);
  for (const o of cars) {
    if (o === car || o.finished || o.retired) continue;
    if (
      o.pit.state !== "track" &&
      !(o.pit.state === "exit" && signedPitS(o.s) > 247)
    )
      continue;
    const pos = 265 + ((o.s - 265 + length * 1.5) % length) - length / 2;
    const first = pos + Math.max(0, o.speed - 4) * etaEntry;
    const last = pos + Math.min(o.stats.maxSpeed, o.speed + 10) * etaClear;
    if (first < PIT_EXIT + 22 * margin && last > 265 - 24 * margin)
      return false;
  }
  return true;
}
function releaseSafe(car, cars) {
  for (const o of cars) {
    if (o === car || o.finished || o.retired || o.pit.state === "track")
      continue;
    const d = signedPitS(o.s) - signedPitS(car.s);
    if (
      Math.abs(o.lateral - FAST_LANE) < 4 &&
      d > -Math.max(18, o.speed * 2.2) &&
      d < 16
    )
      return false;
  }
  return true;
}
const held = { throttle: 0, brake: 1, steer: 0 };
export function pitInput(car, dt, isBot = false, cars = []) {
  const p = car.pit,
    s = signedPitS(car.s),
    bay = bayFor(car),
    session = pitSession(cars);
  p.clock = (p.clock || 0) + dt;
  if (
    !car.managerControlled &&
    (isBot || p.plan.length > 0) &&
    p.clock >= (p.nextDecision || 0)
  ) {
    p.nextDecision = p.clock + 1;
    strategyDecision(car, cars);
  }
  // Retired owners cannot lock an entire team indefinitely.
  const owner = session.owners[bay.id];
  if (
    owner >= 0 &&
    !cars.some(
      (c) =>
        c.id === owner && !c.retired && !c.finished && c.pit.state !== "track",
    )
  )
    session.owners[bay.id] = -1;
  if (p.state === "track") {
    if (p.requested && s > PIT_ENTRY - 115 && s < -115 && car.lateral > 5)
      p.approachAuthorized = true;
    if (!p.requested || (s >= -115 && s < -65 && car.lateral > 21)) {
      // A car using the connected entry without a service request performs a
      // controlled drive-through. Crossing elsewhere is blocked by the divider.
      if (
        s > -140 &&
        s < -65 &&
        car.lateral > 12 &&
        car.lateral > pitOffset(s) - 3
      ) {
        p.state = "exit";
        p.through = true;
        p.laneElapsed = 0;
        p.speedingTime = 0;
        p.penalized = false;
        p.waitTime = 0;
        p.serviced = false;
        p.entryLap = car.lap;
      } else return null;
    }
    if (p.state === "track") {
      if (
        s > PIT_ENTRY - 115 &&
        s <= PIT_ENTRY &&
        (isBot || p.approachAuthorized)
      ) {
        const target = pitPoint(s + Math.max(8, car.speed * 0.4), 4.5);
        let targetSpeed = Math.min(
          38,
          Math.sqrt(Math.max(0, PIT_ENTRY - s) * 12 + 18 * 18),
        );
        for (const o of cars) {
          if (o === car || o.finished || o.retired) continue;
          const d = (o.s - car.s + length) % length;
          if (d < 35 && Math.abs(o.lateral - car.lateral) < 3.8)
            targetSpeed = Math.min(
              targetSpeed,
              Math.sqrt(Math.max(0, d - 9) * 10),
            );
        }
        return {
          throttle: car.speed < targetSpeed - 0.3 ? 0.6 : 0,
          brake:
            car.speed > targetSpeed
              ? Math.min(1, 0.3 + (car.speed - targetSpeed) * 0.25)
              : 0,
          steer: Math.max(
            -1,
            Math.min(
              1,
              angle(
                Math.atan2(target.x - car.x, target.z - car.z) - car.heading,
              ) * 3,
            ),
          ),
        };
      }
      if (s > PIT_ENTRY && s < -115 && (isBot || p.approachAuthorized)) {
        p.state = "entry";
        p.through = false;
        p.entrySpeed = car.speed;
        p.speedingTime = 0;
        p.penalized = false;
        p.laneElapsed = 0;
        p.serviced = false;
        p.entryLap = car.lap;
        p.waitTime = 0;
        p.dockingStart = null;
        p.reason ||= "Solicitação";
      } else return null;
    }
  }
  p.laneElapsed += dt;
  car.offroad = false;
  if (car.speed > PIT_LIMIT + 1 && s > -55 && s < 225) {
    p.speedingTime = (p.speedingTime || 0) + dt;
    if (p.speedingTime > 0.5 && !p.penalized) {
      reportInfraction(car, "PIT_SPEED", {
        speed: car.speed,
        limit: PIT_LIMIT,
        duration: p.speedingTime,
        s,
      });
      p.penalized = true;
      car.engineerEvent =
        "Excesso de velocidade nos boxes. Cinco segundos de penalidade.";
    }
  }
  if (p.state === "entry" || p.state === "queue") {
    if (session.owners[bay.id] < 0) session.owners[bay.id] = car.id;
    // Reservation before docking follows physical arrival order, not array/id order.
    // Never steal a stall once service/release has begun.
    const holder = cars.find((c) => c.id === session.owners[bay.id]);
    if (!holder || ["entry", "queue"].includes(holder.pit.state)) {
      let first = holder || car;
      for (const candidate of cars)
        if (
          !candidate.isSafetyCar &&
          !candidate.finished &&
          !candidate.retired &&
          candidate.teamId === car.teamId &&
          ["entry", "queue"].includes(candidate.pit.state) &&
          signedPitS(candidate.s) < bay.s + 2 &&
          signedPitS(candidate.s) > signedPitS(first.s) + 6
        )
          first = candidate;
      session.owners[bay.id] = first.id;
    }
    p.ownsBay = session.owners[bay.id] === car.id;
    if (p.state === "queue" && p.ownsBay) {
      p.dockingStart = s;
      p.dockingLateral = car.lateral;
    }
    p.state = p.ownsBay ? "entry" : "queue";
  }
  if (p.state === "service") {
    car.speed = car.vx = car.vz = 0;
    p.remaining = Math.max(0, p.remaining - dt);
    p.phase = Math.max(
      0,
      (p.total - p.remaining - (p.penaltyHold || 0)) /
        Math.max(0.1, p.total - (p.penaltyHold || 0)),
    );
    if (p.remaining === 0) {
      service(car);
      car.stewards?.serve(car, p.penaltyIds);
      p.serviced = true;
      p.state = "release";
      p.lastService = p.total;
      p.lastPlannedLap = Math.max(p.lastPlannedLap || 0, p.entryLap + 1);
      car.engineerEvent = "Serviço concluído. Aguardando liberação segura.";
    }
    return held;
  }
  if (p.state === "release") {
    car.speed = car.vx = car.vz = 0;
    if (!releaseSafe(car, cars)) {
      p.waitTime += dt;
      return held;
    }
    p.state = "exit";
    p.releaseS = s;
    car.engineerEvent = "Faixa livre. Saindo da garagem.";
  }
  if (
    p.state === "exit" &&
    s > bay.s + 38 &&
    session.owners[bay.id] === car.id
  ) {
    session.owners[bay.id] = -1;
    p.ownsBay = false;
  }
  if (p.state === "exit" && s > PIT_EXIT - 2 && Math.abs(car.lateral) < 3.5) {
    if (session.owners[bay.id] === car.id) session.owners[bay.id] = -1;
    p.state = "track";
    p.requested = false;
    p.approachAuthorized = false;
    p.ownsBay = false;
    car.targetLane = car.lateral;
    if (car.ai) {
      car.ai.lane = car.lateral;
      car.ai.until = (car.simTime || 0) + 2;
      car.ai.mode = "rejoin";
    }
    p.lastLaneTime = p.laneElapsed;
    p.lifetimeLaneTime = (p.lifetimeLaneTime || 0) + p.laneElapsed;
    if (p.serviced)
      p.history.push({
        lap: p.entryLap + 1,
        compound: car.tires.compound,
        service: p.total,
        lane: p.laneElapsed,
        wait: p.waitTime,
      });
    p.history = p.history.slice(-20);
    car.engineerEvent = "De volta à pista. Pneus " + car.tires.compound + ".";
    return null;
  }
  const entering = p.state === "entry",
    queued = p.state === "queue";
  const stop = queued ? bay.s - 26 : bay.s;
  // Each garage has an apron off the circulation lane. Double stacks wait in
  // the apron, not on top of the serviced car or in the through lane.
  const route = (pos) => {
    if (entering) {
      const start = p.dockingStart ?? bay.s - 58,
        lat = p.dockingStart === null ? FAST_LANE : p.dockingLateral;
      return (
        lat +
        (SERVICE_LANE - lat) *
          smooth((pos - start) / Math.max(8, bay.s - 10 - start))
      );
    }
    if (queued) return FAST_LANE + 5 * smooth((pos - (bay.s - 65)) / 27);
    if (p.state === "exit" && !p.through && pos < bay.s + 38)
      return (
        SERVICE_LANE - (SERVICE_LANE - FAST_LANE) * smooth((pos - bay.s) / 38)
      );
    return pitOffset(pos);
  };
  let speed = PIT_LIMIT * 0.87,
    look = 6 + car.speed * 0.25,
    targetS = s + look;
  if (s < -80) {
    targetS = s + Math.max(8, car.speed * 0.5);
  } else if (entering || queued) {
    speed = Math.min(
      speed,
      s > bay.s - 62 ? 8.5 : speed,
      Math.sqrt(Math.max(0, stop - s - 0.4) * 7),
    );
    if (stop - s < 0.8) speed = 0;
    // Look beyond the stopping mark so alignment remains tangent at zero speed.
  }
  let offset = s < -80 ? pitOffset(targetS) : route(targetS);
  const destination = pitPoint(targetS, offset),
    delta = angle(
      Math.atan2(destination.x - car.x, destination.z - car.z) - car.heading,
    );
  if (
    entering &&
    s >= bay.s - 1.1 &&
    s < bay.s + 2 &&
    Math.abs(car.lateral - SERVICE_LANE) < 1.5 &&
    Math.abs(angle(car.heading - bay.heading)) < 0.3 &&
    car.speed < 0.45
  ) {
    p.state = "service";
    p.errorDelay =
      (car.id * 31 + p.stops * 17 + p.entryLap * 7) % 13 === 0
        ? Math.max(0, 0.8 - (car.crewLevel || 0) * 0.12)
        : 0;
    p.work = {
      compound: p.compound,
      jobs: { ...p.jobs },
      fuelTarget: p.fuelTarget,
    };
    p.oldCompound = car.tires.compound;
    p.penaltyHold = car.boxPenaltySeconds || 0;
    p.penaltyIds =
      car.stewards?.decisions
        .filter(
          (d) =>
            d.car === car.id && d.kind === "time" && d.status === "pending",
        )
        .map((d) => d.id) || [];
    p.total = serviceEstimate(car) + p.errorDelay;
    p.remaining = p.total;
    p.phase = 0;
    car.speed = car.vx = car.vz = 0;
    return held;
  }
  // Predict intersecting swept corridors, not only track-distance: cars in
  // independent stalls do not block the fast lane. No coordinate snapping.
  for (const o of cars) {
    if (o === car || o.finished || o.retired) continue;
    const dx = o.x - car.x,
      dz = o.z - car.z,
      fwd = dx * Math.sin(car.heading) + dz * Math.cos(car.heading),
      side = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    if (fwd > 0 && fwd < 30 && Math.abs(side) < 3.4) {
      speed = Math.min(speed, Math.sqrt(Math.max(0, fwd - 8) * 8));
    }
  }
  p.mergeWaiting = false;
  if (p.state === "exit" && s > 195 && s < 251 && !mergeSafe(car, cars, s)) {
    speed = Math.min(speed, Math.sqrt(Math.max(0, 247 - s) * 7));
    if (s > 246) speed = 0;
    p.mergeWaiting = true;
    p.waitTime += dt;
  }
  if (queued && speed < 0.3) p.waitTime += dt;
  return {
    throttle:
      car.speed < speed - 0.15 ? Math.min(0.65, (speed - car.speed) * 0.28) : 0,
    brake:
      car.speed > speed ? Math.min(1, 0.25 + (car.speed - speed) * 0.3) : 0,
    steer: Math.max(-1, Math.min(1, delta * 3.3)),
  };
}
