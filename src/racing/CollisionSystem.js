import { recordContact } from "../regulations/RuleBook.js";
import { pitOuter, pitSolids, signedPitS } from "../strategy/PitLayout.js";
import { pitZone, pitOffset } from "../strategy/PitStop.js";
import { at, closest, angle, barrierOffset } from "../track.js";
export const HITBOX = { halfWidth: 1.69, halfLength: 2.73 };
export const BARRIER_OFFSET = 15.3,
  BARRIER_HALF_WIDTH = 0.14;
const dot = (a, b) => a.x * b.x + a.z * b.z;
function axes(car) {
  return [
    { x: Math.cos(car.heading), z: -Math.sin(car.heading) },
    { x: Math.sin(car.heading), z: Math.cos(car.heading) },
  ];
}
function radius(car, n) {
  const [r, f] = axes(car);
  return (
    Math.abs(dot(r, n)) * (car.halfWidth ?? HITBOX.halfWidth) +
    Math.abs(dot(f, n)) * (car.halfLength ?? HITBOX.halfLength)
  );
}
function velocity(car) {
  return {
    x: car.vx ?? Math.sin(car.heading) * car.speed,
    z: car.vz ?? Math.cos(car.heading) * car.speed,
  };
}
function applyVelocity(car, v) {
  car.vx = v.x;
  car.vz = v.z;
  car.speed = Math.min(car.stats.maxSpeed, Math.hypot(v.x, v.z));
}
export function damageFromImpact(car, impact) {
  if (impact < 2.5) return;
  car.impact = Math.max(car.impact || 0, impact);
  car.impactCount = (car.impactCount || 0) + 1;
  const factor = car.realism === "realistic" ? 1 : 0.24;
  car.damage = Math.min(
    1,
    (car.damage || 0) +
      ((impact / 55) ** 2 * factor) / Math.max(0.6, car.stats.durability || 1),
  );
}
const broadRadius = (c) =>
  c.halfWidth === undefined && c.halfLength === undefined
    ? 3.2107631491594018
    : Math.hypot(
        c.halfWidth ?? HITBOX.halfWidth,
        c.halfLength ?? HITBOX.halfLength,
      );
export function overlap(a, b) {
  const delta = { x: b.x - a.x, z: b.z - a.z };
  const reach = broadRadius(a) + broadRadius(b);
  if (delta.x * delta.x + delta.z * delta.z > reach * reach + 1e-9) return null;
  let depth = Infinity,
    normal = null;
  for (let n of [...axes(a), ...axes(b)]) {
    let distance = dot(delta, n),
      penetration = radius(a, n) + radius(b, n) - Math.abs(distance);
    if (penetration <= 0) return null;
    if (penetration < depth) {
      depth = penetration;
      normal = distance < 0 ? { x: -n.x, z: -n.z } : n;
    }
  }
  return { depth, normal };
}
export function collidePair(a, b) {
  const hit = overlap(a, b);
  if (!hit) return false;
  const pinned = (c) =>
    c.retired || ["service", "release"].includes(c.pit?.state);
  const ia = pinned(a) ? 0 : 1,
    ib = pinned(b) ? 0 : 1;
  if (!ia && !ib) return false;
  const n = hit.normal,
    shift = (hit.depth + 0.002) / (ia + ib);
  a.x -= n.x * shift * ia;
  a.z -= n.z * shift * ia;
  b.x += n.x * shift * ib;
  b.z += n.z * shift * ib;
  let va = velocity(a),
    vb = velocity(b),
    closing = dot({ x: va.x - vb.x, z: va.z - vb.z }, n);
  if (closing > 0) {
    recordContact(a, b, closing, n);
    let impulse = (closing * 1.06) / (ia + ib);
    va.x -= n.x * impulse * ia;
    va.z -= n.z * impulse * ia;
    vb.x += n.x * impulse * ib;
    vb.z += n.z * impulse * ib;
    if (ia) applyVelocity(a, va);
    if (ib) applyVelocity(b, vb);
    damageFromImpact(a, closing);
    damageFromImpact(b, closing);
    a.lastContact = b.id;
    b.lastContact = a.id;
  }
  return true;
}
export function collideBarrier(car, known = null) {
  const cached = known || car.projection;
  const near =
      cached?.carX === car.x && cached?.carZ === car.z
        ? cached
        : closest(car.x, car.z, car.index),
    t = at(near.s),
    extent = radius(car, t.right),
    outer =
      near.lateral > 0 && pitZone(near.s) ? pitOuter(near.s) : barrierOffset(),
    edge = outer - BARRIER_HALF_WIDTH - extent;
  const ps = signedPitS(near.s);
  if (
    ps > -55 &&
    ps < 205 &&
    Math.abs(near.lateral - barrierOffset()) < extent + 0.16
  ) {
    const sign = near.lateral < barrierOffset() ? -1 : 1,
      depth = extent + 0.16 - Math.abs(near.lateral - barrierOffset());
    car.x += t.right.x * sign * (depth + 0.002);
    car.z += t.right.z * sign * (depth + 0.002);
    const v = velocity(car),
      closing = -(v.x * t.right.x + v.z * t.right.z) * sign;
    if (closing > 0) {
      v.x += t.right.x * sign * closing * 1.03;
      v.z += t.right.z * sign * closing * 1.03;
      applyVelocity(car, v);
      damageFromImpact(car, closing);
    }
  }
  if (ps > -10 && ps < 190 && near.lateral > 39)
    for (const solid of pitSolids()) {
      const hit = overlap(car, solid);
      if (!hit) continue;
      car.x -= hit.normal.x * (hit.depth + 0.002);
      car.z -= hit.normal.z * (hit.depth + 0.002);
      const v = velocity(car),
        closing = dot(v, hit.normal);
      if (closing > 0) {
        v.x -= hit.normal.x * closing * 1.03;
        v.z -= hit.normal.z * closing * 1.03;
        applyVelocity(car, v);
        damageFromImpact(car, closing);
      }
    }
  if (Math.abs(near.lateral) <= edge) return false;
  const sign = Math.sign(near.lateral) || 1,
    n = { x: t.right.x * sign, z: t.right.z * sign },
    depth = Math.abs(near.lateral) - edge;
  car.x -= n.x * (depth + 0.002);
  car.z -= n.z * (depth + 0.002);
  const v = velocity(car),
    closing = dot(v, n);
  if (closing > 0) {
    v.x -= n.x * closing * 1.03;
    v.z -= n.z * closing * 1.03;
    applyVelocity(car, v);
    damageFromImpact(car, closing);
  }
  car.lateral = sign * edge;
  return true;
}
export function collisions(cars) {
  for (let iteration = 0; iteration < 3; iteration++) {
    for (let i = 0; i < cars.length; i++)
      for (let j = i + 1; j < cars.length; j++) {
        if (cars[i].finished || cars[j].finished) continue;
        collidePair(cars[i], cars[j]);
      }
  }
  for (const c of cars) if (!c.finished) collideBarrier(c);
}
