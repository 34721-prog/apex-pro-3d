import { overlap } from "../racing/CollisionSystem.js";
import * as THREE from "three";
import { closest, TRACK_WIDTH } from "../track.js";
import {
  pitOffset,
  apron,
  signedPitS,
  PIT_ENTRY,
  PIT_EXIT,
} from "../strategy/PitLayout.js";
import {
  createVisualPose,
  WHEEL_RADIUS,
  WHEEL_Y,
  WHEELBASE,
  WHEEL_X,
  WHEEL_Z,
  serviceLift,
} from "./VehicleMotion.js";
export const ROAD_HEIGHT = 0.12,
  KERB_RISE = 0.035,
  KERB_WIDTH = 1.5,
  PIT_HEIGHT = 0.14;

// Height of the existing flat ribbons, not invented corrugation. The footprint
// blends a 0.62 m tread across edges; this is visual support, not tire physics.
export function supportHeight(s, lateral) {
  const ps = signedPitS(s),
    off = pitOffset(s),
    half = TRACK_WIDTH / 2;
  const pit =
    ps >= PIT_ENTRY - 5 &&
    ps <= PIT_EXIT + 5 &&
    lateral >= off - 4.8 &&
    lateral <= off + 4.8 + 12 * apron(s);
  const tread = 0.62,
    lo = Math.abs(lateral) - tread / 2,
    hi = lo + tread;
  const fraction = (a, b) =>
    Math.max(0, Math.min(hi, b) - Math.max(lo, a)) / tread;
  let height =
    ROAD_HEIGHT * fraction(-100, half) +
    (ROAD_HEIGHT + KERB_RISE) * fraction(half, half + KERB_WIDTH) +
    0.095 * fraction(half + KERB_WIDTH, half + 3.5) -
    0.06 * fraction(half + 3.5, 1e6);
  if (pit) height = Math.max(height, PIT_HEIGHT);
  return height;
}
export function rigVehicle(root) {
  const wheels = [],
    meshes = [];
  root.traverse((o) => {
    if (!o.isMesh && typeof o.userData.front === "boolean") wheels.push(o);
  });
  // GLTFLoader's wheel_1/2/3 names are deliberately irrelevant.
  root.updateMatrixWorld(true);
  for (const wheel of wheels) root.attach(wheel);
  const body = new THREE.Group();
  body.name = "visual-body";
  body.position.y = 0.7;
  root.add(body);
  root.traverse((o) => {
    if (o.isMesh && !wheels.some((w) => o.parent === w)) meshes.push(o);
  });
  body.updateMatrixWorld(true);
  for (const mesh of meshes) body.attach(mesh);
  for (const wheel of wheels) {
    const spin = new THREE.Group();
    spin.name = "wheel-spin";
    for (const child of [...wheel.children]) spin.add(child);
    wheel.add(spin);
    wheel._spin = spin;
    wheel._slot =
      (wheel.position.x > 0 ? 2 : 0) + (wheel.userData.front ? 1 : 0);
  }
  root._wheels = wheels;
  root._body = body;
  root._pose = createVisualPose();
  root._support = new Float64Array(4);
  return root;
}
export function applyVehiclePose(root, car, pose) {
  const sn = Math.sin(pose.heading),
    cs = Math.cos(pose.heading),
    h = root._support;
  const ps = signedPitS(car.s),
    pitNearby =
      ps >= PIT_ENTRY - 10 &&
      ps <= PIT_EXIT + 10 &&
      car.lateral > pitOffset(car.s) - 7;
  const flat = Math.abs(car.lateral) < TRACK_WIDTH / 2 - 2.4 && !pitNearby;
  let avg = 0;
  for (let i = 0; i < 4; i++) {
    if (flat) h[i] = ROAD_HEIGHT;
    else {
      const near = closest(
        pose.x + cs * WHEEL_X[i] + sn * WHEEL_Z[i],
        pose.z - sn * WHEEL_X[i] + cs * WHEEL_Z[i],
        car.index,
      );
      h[i] = supportHeight(near.s, near.lateral);
    }
    avg += h[i] / 4;
  }
  const base = avg + WHEEL_RADIUS - WHEEL_Y,
    // Preserve established service plateau .28, ramp using authoritative phase.
    lift = (0.28 - base) * serviceLift(car.pit);
  root.position.set(pose.x, base + lift, pose.z);
  root.rotation.set(0, pose.heading, 0);
  root._body.rotation.set(
    pose.pitch + Math.atan2((h[0] + h[2] - h[1] - h[3]) * 0.5, WHEELBASE),
    0,
    pose.roll + Math.atan2((h[2] + h[3] - h[0] - h[1]) * 0.5, 2.7),
    "YXZ",
  );
  for (const wheel of root._wheels) {
    const i = wheel._slot;
    wheel.position.y = WHEEL_Y + h[i] - avg;
    wheel.rotation.set(0, wheel.userData.front ? pose.steer : 0, 0);
    wheel._spin.rotation.x = pose.spin[i] % (Math.PI * 2);
    wheel.visible = !(
      car.pit?.state === "service" &&
      car.pit.phase > 0.24 &&
      car.pit.phase < 0.84
    );
  }
}

// Interpolation is a display choice: if it introduces penetration beyond the
// actual corrected tick, show that tick for the entire grid. Never push models
// away from authoritative positions or hide real collision-system limitations.
export function interpolationAddsOverlap(views) {
  for (let i = 0; i < views.length; i++)
    for (let j = i + 1; j < views.length; j++) {
      const a = views[i],
        b = views[j];
      if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 45) continue;
      const visual = overlap(a, b);
      if (!visual || visual.depth < 0.005) continue;
      const physical = overlap(
        Object.getPrototypeOf(a),
        Object.getPrototypeOf(b),
      );
      if (!physical || visual.depth > physical.depth + 0.005) return true;
    }
  return false;
}
