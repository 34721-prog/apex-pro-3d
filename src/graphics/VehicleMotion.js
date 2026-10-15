import { angle, length } from "../track.js";

// Read-only observer of authoritative ticks. Not serialized, not a second physics
// state: these are the two completed samples used solely by presentation.
const records = new WeakMap();
export const WHEEL_RADIUS = 0.58,
  WHEEL_Y = 0.59,
  WHEELBASE = 3.25;
export const WHEEL_X = [-1.35, -1.35, 1.35, 1.35];
export const WHEEL_Z = [-1.64, 1.61, -1.64, 1.61];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function sample(c) {
  return {
    x: c.x,
    z: c.z,
    heading: c.heading,
    speed: c.speed,
    s: c.s,
    steer: 0,
    roll: 0,
    pitch: 0,
    spin: new Float64Array(4),
    recoveries: c.recoveries || 0,
    impactCount: c.impactCount || 0,
  };
}
function copyCar(p, c) {
  p.x = c.x;
  p.z = c.z;
  p.heading = c.heading;
  p.speed = c.speed;
  p.s = c.s;
  p.recoveries = c.recoveries || 0;
  p.impactCount = c.impactCount || 0;
}
export function beginVisualStep(c) {
  let r = records.get(c);
  if (!r) {
    r = { previous: sample(c), current: sample(c), cut: true };
    records.set(c, r);
  }
  const p = r.previous,
    q = r.current;
  // Recover/restart/tooling may have repositioned the authoritative car outside step.
  r.cut =
    c.x !== q.x ||
    c.z !== q.z ||
    c.heading !== q.heading ||
    (c.recoveries || 0) !== q.recoveries;
  copyCar(p, c);
  p.steer = q.steer;
  p.roll = q.roll;
  p.pitch = q.pitch;
  p.spin.set(q.spin);
}
export function endVisualStep(c, dt) {
  const r = records.get(c),
    p = r.previous,
    q = r.current;
  const dx = c.x - p.x,
    dz = c.z - p.z,
    dh = angle(c.heading - p.heading);
  r.cut ||=
    (c.recoveries || 0) !== p.recoveries ||
    (c.impactCount || 0) !== p.impactCount ||
    Math.hypot(dx, dz) > Math.max(4, (p.speed + c.speed) * dt * 2 + 0.1) ||
    Math.abs(dh) > Math.PI / 2;
  // Constraint corrections are discontinuities, not suspension/rolling motion.
  r.cut ||= Math.hypot(dx - (c.vx || 0) * dt, dz - (c.vz || 0) * dt) > 0.1;
  copyCar(q, c);
  const yaw = dh / dt,
    speed = (p.speed + c.speed) * 0.5;
  q.steer =
    r.cut || speed < 0.2
      ? 0
      : clamp(Math.atan((WHEELBASE * yaw) / speed), -0.45, 0.45);
  q.roll = r.cut
    ? 0
    : p.roll +
      (clamp(speed * yaw * 0.0009, -0.026, 0.026) - p.roll) *
        (1 - Math.exp(-dt * 8));
  const targetPitch =
    c.pit?.state === "service" || c.pit?.state === "release"
      ? 0
      : clamp((c.load || 0) * 0.035, -0.018, 0.018);
  q.pitch = r.cut
    ? 0
    : p.pitch + (targetPitch - p.pitch) * (1 - Math.exp(-dt * 12));
  // Share the rigid pose basis across all four wheels, rather than repeating
  // eight trigonometric evaluations per wheel in every authoritative tick.
  if (r.cut) {
    q.spin.set(p.spin);
    return;
  }
  const dc = Math.cos(c.heading) - Math.cos(p.heading),
    ds = Math.sin(c.heading) - Math.sin(p.heading),
    rearHeading = p.heading + dh * 0.5,
    frontHeading = rearHeading + (p.steer + q.steer) * 0.5,
    rearSin = Math.sin(rearHeading),
    rearCos = Math.cos(rearHeading),
    frontSin = Math.sin(frontHeading),
    frontCos = Math.cos(frontHeading);
  for (let i = 0; i < 4; i++) {
    const x = WHEEL_X[i],
      z = WHEEL_Z[i],
      wx = dx + dc * x + ds * z,
      wz = dz - ds * x + dc * z;
    q.spin[i] =
      p.spin[i] +
      (wx * (z > 0 ? frontSin : rearSin) + wz * (z > 0 ? frontCos : rearCos)) /
        WHEEL_RADIUS;
  }
}
// Collapse presentation history at a time-domain transition, preserving wheel phase.
export function resetVisualHistory(c) {
  const r = records.get(c);
  if (!r) return;
  copyCar(r.current, c);
  copyCar(r.previous, c);
  r.previous.steer = r.current.steer;
  r.previous.roll = r.current.roll;
  r.previous.pitch = r.current.pitch;
  r.previous.spin.set(r.current.spin);
  r.cut = true;
}
export function visualCut(c) {
  const r = records.get(c);
  return (
    !r ||
    r.cut ||
    c.x !== r.current.x ||
    c.z !== r.current.z ||
    c.heading !== r.current.heading
  );
}
export function createVisualPose() {
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    s: 0,
    steer: 0,
    roll: 0,
    pitch: 0,
    spin: new Float64Array(4),
  };
}
export function readVisualPose(c, out, alpha = 1) {
  const r = records.get(c);
  if (
    !r ||
    c.x !== r.current.x ||
    c.z !== r.current.z ||
    c.heading !== r.current.heading
  ) {
    copyCar(out, c);
    out.steer = out.roll = out.pitch = 0;
    if (r) out.spin.set(r.current.spin);
    else out.spin.fill(0);
    return out;
  }
  const a = visualCut(c) ? 1 : clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1),
    p = r.previous,
    q = r.current;
  out.x = p.x + (q.x - p.x) * a;
  out.z = p.z + (q.z - p.z) * a;
  out.heading = p.heading + angle(q.heading - p.heading) * a;
  // Wrap camera path coordinate without ever writing progress/lap state.
  let ds = q.s - p.s;
  if (ds > length / 2) ds -= length;
  if (ds < -length / 2) ds += length;
  out.s = (p.s + ds * a + length) % length;
  out.speed = p.speed + (q.speed - p.speed) * a;
  out.steer = p.steer + (q.steer - p.steer) * a;
  out.roll = p.roll + (q.roll - p.roll) * a;
  out.pitch = p.pitch + (q.pitch - p.pitch) * a;
  for (let i = 0; i < 4; i++)
    out.spin[i] = p.spin[i] + (q.spin[i] - p.spin[i]) * a;
  return out;
}
export function serviceLift(pit) {
  if (pit?.state !== "service") return 0;
  const smooth = (a, b) => {
    const t = clamp((pit.phase - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  return smooth(0.06, 0.14) * (1 - smooth(0.86, 0.94));
}
