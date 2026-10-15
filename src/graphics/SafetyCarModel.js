import { batchModel } from "../optimize.js";
import * as THREE from "three";
// Original low-poly marshal coupe. Built once per World, never per frame.
export function makeSafetyCar() {
  const root = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: "#e3e9ec" });
  const glass = new THREE.MeshLambertMaterial({ color: "#253e53" });
  const rubber = new THREE.MeshLambertMaterial({ color: "#141920" });
  const amber = new THREE.MeshBasicMaterial({ color: "#ffad31" });
  const white = new THREE.MeshBasicMaterial({ color: "#edf7ff" });
  const red = new THREE.MeshBasicMaterial({ color: "#ef3753" });
  const box = (x, y, z, w, h, l, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  box(0, 0.59, 0, 2.65, 0.65, 4.8, body);
  box(0, 1.06, -0.15, 2.15, 0.62, 2.4, glass);
  box(0, 1.39, -0.22, 2.22, 0.12, 2.16, body);
  box(0, 0.85, 1.68, 2.5, 0.12, 1.2, body);
  box(0, 0.35, 2.42, 2.5, 0.18, 0.1, rubber);
  box(0, 0.37, -2.42, 2.5, 0.18, 0.1, rubber);
  for (const x of [-1.34, 1.34]) {
    box(x, 0.61, 0, 0.025, 0.13, 4.4, amber);
    box(x, 1.13, -0.3, 0.035, 0.52, 0.09, body);
    box(x * 1.065, 1.03, 0.8, 0.26, 0.15, 0.27, body);
  }
  for (const x of [-0.94, 0.94]) {
    box(x, 0.77, 2.42, 0.52, 0.16, 0.045, white);
    box(x, 0.77, -2.42, 0.5, 0.16, 0.045, red);
  }
  box(0, 1.5, -0.15, 1.7, 0.06, 0.4, rubber);
  root.userData.beacon = box(0, 1.59, -0.15, 1.65, 0.14, 0.35, amber);
  const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.28, 12);
  const hubGeometry = new THREE.CylinderGeometry(0.23, 0.23, 0.29, 8);
  for (const x of [-1.3, 1.3])
    for (const z of [-1.55, 1.55]) {
      const wheel = new THREE.Mesh(wheelGeometry, rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.43, z);
      const hub = new THREE.Mesh(hubGeometry, body);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      root.add(wheel, hub);
    }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#152332";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#ffbf52";
  ctx.textAlign = "center";
  ctx.font = "bold 47px sans-serif";
  ctx.fillText("SAFETY CAR", 256, 70);
  ctx.font = "20px sans-serif";
  ctx.fillStyle = "#ecf1f7";
  ctx.fillText("APEX / RACE CONTROL", 256, 106);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.85, 0.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) }),
  );
  plate.position.set(0, 0.68, -2.428);
  plate.rotation.y = Math.PI;
  root.add(plate);
  root.name = "physical-safety-car";
  // Batch solid parts once; retain the animated beacon and textured plate.
  const beacon = root.userData.beacon;
  root.remove(beacon, plate);
  const model = batchModel(root);
  model.add(beacon, plate);
  model.userData.beacon = beacon;
  beacon.castShadow = true;
  const obsolete = new Set();
  root.traverse((o) => {
    if (o.geometry) obsolete.add(o.geometry);
  });
  for (const geometry of obsolete) geometry.dispose();
  return model;
}
