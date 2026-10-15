import { serviceLift } from "./VehicleMotion.js";
import { PIT_HEIGHT } from "./VehiclePresentation.js";
import { batchScenery } from "../optimize.js";
import { compounds } from "../strategy/Resources.js";
import * as THREE from "three";
import { at, barrierOffset } from "../track.js";
import {
  pitLayout,
  pitPoint,
  pitOffset,
  apron,
  PIT_ENTRY,
  PIT_EXIT,
  SERVICE_LANE,
} from "../strategy/PitLayout.js";
const temp = new THREE.Object3D(),
  color = new THREE.Color();
export function buildPit(world) {
  if (world.pitRoot) return world.pitRoot;
  const root = (world.pitRoot = new THREE.Group());
  root.name = "physical-pit";
  world.scene.add(root);
  const vs = [],
    uv = [],
    ix = [],
    n = 270;
  for (let i = 0; i <= n; i++) {
    const s = PIT_ENTRY - 5 + (i * (PIT_EXIT - PIT_ENTRY + 10)) / n,
      t = at(s),
      off = pitOffset(s);
    for (const x of [off - 4.8, off + 4.8 + 12 * apron(s)]) {
      vs.push(t.p.x + t.right.x * x, PIT_HEIGHT, t.p.z + t.right.z * x);
      uv.push(x / 10, s / 6);
    }
    if (i < n) {
      const k = i * 2;
      ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vs, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(ix);
  geo.computeVertexNormals();
  const surface = new THREE.Mesh(geo, world.roadMaterial);
  surface.receiveShadow = true;
  surface.name = "pit-surface";
  root.add(surface);
  const boxes = [];
  const box = (s, x, y, w, h, d, c, z = 0) => {
    const t = at(s);
    boxes.push({
      x: t.p.x + t.right.x * x + t.dir.x * z,
      y,
      z: t.p.z + t.right.z * x + t.dir.z * z,
      w,
      h,
      d,
      c,
      heading: t.heading,
    });
  };
  for (const bay of pitLayout()) {
    // Open-front bay, back and partition walls, roof, recessed light, workbench,
    // cabinets, compressed-air tower and wheel racks. Physical walls share layout.
    box(bay.s, 50, 0.18, 17, 0.16, bay.garageLength, "#929c9c");
    box(bay.s, 58, 3.3, 0.5, 6.6, bay.garageLength, "#263745");
    for (const z of [-bay.garageLength / 2, bay.garageLength / 2])
      box(bay.s, 50, 3.3, 16, 6.6, 0.4, "#364656", z);
    box(bay.s, 50, 6.65, 17, 0.4, bay.garageLength, "#bcc4bd");
    box(bay.s, 41.8, 5.7, 0.35, 1.4, bay.garageLength - 1, bay.color);
    box(bay.s, 50, 6.25, 0.35, 0.15, 19, "#f9ecc6");
    box(bay.s, 56, 1.05, 2, 2, 12, bay.color);
    box(bay.s, 55, 2.1, 3, 0.16, 12, "#b4bac1");
    box(bay.s, 54, 2.9, 0.2, 1.3, 2, "#253b43");
    box(bay.s, 51, 1.3, 2, 2.6, 2.5, "#243546", 8);
    box(bay.s, 44, 1.2, 1, 2.4, 1, bay.color, -10);
    // Stall frame and front stop line, arrows on fast lane.
    for (const z of [-4.2, 4.2])
      box(bay.s, SERVICE_LANE, 0.17, 5.7, 0.035, 0.18, bay.color, z);
    for (const x of [-2.85, 2.85])
      box(bay.s, SERVICE_LANE + x, 0.17, 0.16, 0.035, 8.5, bay.color);
    box(bay.s, 26, 0.17, 0.15, 0.04, 7, "#f4eee1");
    box(bay.s, 26, 0.18, 1.5, 0.04, 0.3, "#f4eee1", 3);
  }
  for (let s = -53; s < 204; s += 4)
    box(s, barrierOffset(), 0.7, 0.32, 1.2, 4.1, "#c9cbc0");
  for (let s = -60; s < 205; s += 8)
    box(s, 30.3, 0.18, 0.15, 0.025, 3.5, "#e9deba");
  for (const s of [-65, 225]) {
    box(s, 26, 0.18, 9.5, 0.04, 0.35, "#f3cf59");
    box(s, 20.5, 1.4, 0.12, 2.8, 0.12, "#e8e8ce");
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    boxes.length,
  );
  boxes.forEach((b, i) => {
    temp.position.set(b.x, b.y, b.z);
    temp.rotation.set(0, b.heading, 0);
    temp.scale.set(b.w, b.h, b.d);
    temp.updateMatrix();
    mesh.setMatrixAt(i, temp.matrix);
    mesh.setColorAt(i, color.set(b.c));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = "pit-buildings-equipment-markings";
  mesh.computeBoundingSphere();
  root.add(mesh);
  // Six garage labels use one atlas/material (not six separate textures).
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  pitLayout().forEach((b, i) => {
    ctx.fillStyle = b.color;
    ctx.fillRect(0, i * 64, 1024, 64);
    ctx.fillStyle = "#fff4df";
    ctx.font = "bold 35px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${i + 1}  /  ${b.name}`, 512, i * 64 + 45);
  });
  const atlas = new THREE.CanvasTexture(canvas),
    material = new THREE.MeshBasicMaterial({
      map: atlas,
      side: THREE.DoubleSide,
    });
  pitLayout().forEach((b, i) => {
    const g = new THREE.PlaneGeometry(Math.min(22, b.garageLength - 2), 1.2),
      u = g.attributes.uv;
    for (let v = 0; v < u.count; v++)
      u.setY(v, 1 - (i + 1) / 6 + u.getY(v) / 6);
    const sign = new THREE.Mesh(g, material);
    const p = pitPoint(b.s, 41.55);
    sign.position.set(p.x, 5.7, p.z);
    sign.rotation.y = b.heading - Math.PI / 2;
    root.add(sign);
  });
  for (const [s, text] of [
    [-65, "65 km/h"],
    [225, "YIELD / SAÍDA"],
  ]) {
    const p = pitPoint(s, 20.5),
      sign = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 1.1),
        new THREE.MeshBasicMaterial({
          map: world.sign(text, 256, 64),
          side: THREE.DoubleSide,
        }),
      );
    sign.position.set(p.x, 2.7, p.z);
    sign.rotation.y = at(s).heading + Math.PI;
    root.add(sign);
  }
  world.crew = new PitCrew(root);
  world.pitCrew = world.crew.root;
  batchScenery(root, [world.pitCrew]);
  return root;
}
export class PitCrew {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = "pooled-pit-crew";
    scene.add(this.root);
    this.last = new Float64Array(6).fill(-100);
    this.states = new Array(6);
    this.active = new Array(6).fill(null);
    this.lastPhase = new Float64Array(6).fill(-1);
    this.base = { x: 0, z: 0, heading: 0 };
    // 6 people × 8 components × 6 bays; four wheel specialists, jack and release.
    this.bodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(),
      6 * 6 * 8 + 6 * 3,
    );
    this.wheels = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.56, 0.56, 0.4, 10),
      new THREE.MeshLambertMaterial({ color: "#202831" }),
      6 * 8,
    );
    this.bands = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.5, 0.028, 4, 10),
      new THREE.MeshLambertMaterial(),
      48,
    );
    this.bands.frustumCulled = false;
    this.root.add(this.bands);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.frustumCulled = this.wheels.frustumCulled = false;
    this.root.add(this.bodies, this.wheels);
    for (const b of pitLayout()) this.pose(b, null, 0);
  }
  part(index, b, x, y, z, w, h, d, c, turn = 0) {
    const sn = Math.sin(b.heading),
      cs = Math.cos(b.heading);
    temp.position.set(b.x + cs * x + sn * z, y, b.z - sn * x + cs * z);
    temp.rotation.set(0, b.heading + turn, 0);
    temp.scale.set(w, h, d);
    temp.updateMatrix();
    this.bodies.setMatrixAt(index, temp.matrix);
    this.bodies.setColorAt(index, color.set(c));
  }
  pose(b, car, time) {
    const service = car?.pit.state === "service",
      release = car && ["release", "exit"].includes(car.pit.state),
      phase = service ? car.pit.phase : 0;
    const work = service && phase > 0.12 && phase < 0.85,
      extension = work ? 1 : 0;
    // Follow the physically parked car's measured pose, not a snapped model.
    const base = this.base;
    const parked = car && (service || car.pit.state === "release");
    base.x = parked ? car.x : b.x;
    base.z = parked ? car.z : b.z;
    base.heading = parked ? car.heading : b.heading;
    for (let j = 0; j < 6; j++) {
      let x = j < 4 ? (j % 2 ? 2.5 : -2.5) : j === 4 ? 0 : 4,
        z = j < 4 ? (j < 2 ? 1.7 : -1.8) : j === 4 ? 3.5 : 5;
      if (!service && !release) {
        x = 10 + (j % 2) * 1.5;
        z = (Math.floor(j / 2) - 1) * 3;
      }
      const y = work && j < 4 ? 0.76 : 1,
        reach = work ? Math.sin(time * 13 + j) * 0.07 : 0,
        k = (b.id * 6 + j) * 8;
      this.part(k, base, x, y, z, 0.45, 0.65, 0.35, b.color);
      this.part(k + 1, base, x, y + 0.5, z, 0.4, 0.38, 0.38, "#e4e4d8");
      this.part(k + 2, base, x, y + 0.52, z - 0.2, 0.32, 0.1, 0.035, "#192b38");
      for (let leg = 0; leg < 2; leg++)
        this.part(
          k + 3 + leg,
          base,
          x + (leg ? -0.13 : 0.13),
          0.34,
          z,
          0.16,
          0.65,
          0.2,
          "#263544",
        );
      const inward = x > 0 ? -1 : 1;
      this.part(
        k + 5,
        base,
        x + inward * (0.27 + extension * 0.2),
        y - 0.08,
        z + reach,
        0.35 + extension * 0.35,
        0.16,
        0.17,
        b.color,
      );
      this.part(
        k + 6,
        base,
        x - inward * 0.28,
        y - 0.1,
        z,
        0.17,
        0.5,
        0.17,
        b.color,
      );
      this.part(
        k + 7,
        base,
        x + inward * (0.5 + extension * 0.4),
        j === 5 ? 2.45 : y - 0.08,
        z,
        0.2,
        j === 5 ? 0.65 : 0.23,
        j === 5 ? 0.6 : 0.18,
        j === 5 ? (release ? "#4ccca7" : "#f23857") : "#a6b4b9",
      );
    }
    const jack = 6 * 6 * 8 + b.id * 3;
    const jackX = service ? 0 : 12,
      jackZ = service ? 2.7 : 5;
    this.part(jack, base, jackX, 0.24, jackZ, 0.6, 0.16, 1.4, "#aa2b47");
    this.part(
      jack + 1,
      base,
      jackX,
      0.28 + 0.14 * serviceLift(car?.pit),
      jackZ - 0.4,
      0.45,
      0.18,
      0.5,
      "#adb7b4",
    );
    this.part(
      jack + 2,
      base,
      jackX,
      0.65,
      jackZ + 0.45,
      0.09,
      0.85,
      0.1,
      "#adb7b4",
    );
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1,
        z = i % 4 < 2 ? 1.7 : -1.8,
        old = i < 4;
      let x =
        side *
        (old
          ? 1.65 + smoothPhase(phase, 0.2, 0.6) * 1.65
          : 3.6 - smoothPhase(phase, 0.4, 0.8) * 1.95);
      if (!service) x = 12 + (i % 2) * 1.3;
      const cs = Math.cos(base.heading),
        sn = Math.sin(base.heading);
      temp.position.set(
        base.x + cs * x + sn * z,
        0.65,
        base.z - sn * x + cs * z,
      );
      temp.rotation.set(0, base.heading, Math.PI / 2);
      temp.scale.setScalar(service ? 1 : 0.95);
      temp.updateMatrix();
      this.wheels.setMatrixAt(b.id * 8 + i, temp.matrix);
      temp.position.x += cs * 0.21;
      temp.position.z -= sn * 0.21;
      temp.rotation.set(0, base.heading + Math.PI / 2, 0);
      temp.updateMatrix();
      this.bands.setMatrixAt(b.id * 8 + i, temp.matrix);
      this.bands.setColorAt(
        b.id * 8 + i,
        color.set(
          compounds[
            old
              ? car?.pit.oldCompound || "medium"
              : car?.pit.work?.compound || "medium"
          ].color,
        ),
      );
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.bodies.instanceColor.needsUpdate = true;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.bands.instanceMatrix.needsUpdate = true;
    this.bands.instanceColor.needsUpdate = true;
  }
  update(drivers, camera, time, detail = 1) {
    this.active.fill(null);
    for (const c of drivers) if (c.pit?.ownsBay) this.active[c.teamId] = c;
    let near = false;
    for (const b of pitLayout()) {
      const c = this.active[b.id],
        d = Math.hypot(camera.position.x - b.x, camera.position.z - b.z);
      if (d < 180 * detail) near = true;
      const state = c?.pit.state || "idle";
      const changed = this.states[b.id] !== state;
      if (
        changed ||
        (d < 180 * detail &&
          c?.pit.state === "service" &&
          c.pit.phase !== this.lastPhase[b.id] &&
          time - this.last[b.id] >
            (d < 65 ? 1 / (detail < 0.8 ? 15 : 30) : 0.2))
      ) {
        this.pose(
          b,
          c,
          c?.pit.state === "service" ? c.pit.total - c.pit.remaining : 0,
        );
        this.states[b.id] = state;
        this.last[b.id] = time;
        this.lastPhase[b.id] = c?.pit.phase ?? -1;
      }
    }
    this.root.visible = near;
  }
}
function smoothPhase(t, a, b) {
  return Math.max(0, Math.min(1, (t - a) / (b - a)));
}
