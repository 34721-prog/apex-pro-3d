import * as THREE from "three";
import { activeTrack, at, length, bounds } from "../track.js";
export function atmosphere(world) {
  const t = activeTrack;
  world.sun.color.set(t.sunset ? "#ffb587" : t.night ? "#a4c7ff" : "#fff0d1");
  world.sun.intensity = t.night ? 0.8 : t.sunset ? 2.2 : 3.1;
  world.fill.intensity = t.night ? 0.75 : 1.2;
  // Emissive fixtures instead of dozens of expensive dynamic shadow lights.
  if (t.night) {
    const count = Math.ceil(length / 90),
      geo = new THREE.BoxGeometry(1, 1, 1),
      poles = new THREE.InstancedMesh(
        geo,
        new THREE.MeshLambertMaterial({ color: "#4e6077" }),
        count,
      ),
      lamps = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({ color: "#c5e0ff" }),
        count,
      ),
      d = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const a = at((i / count) * length),
        offset = -20;
      d.position.copy(a.p).addScaledVector(a.right, offset);
      if (world.venues?.contains(d.position.x, d.position.z, 2)) continue;
      d.position.y = 5;
      d.scale.set(0.18, 10, 0.18);
      d.rotation.y = a.heading;
      d.updateMatrix();
      poles.setMatrixAt(placed, d.matrix);
      d.position.y = 10;
      d.scale.set(2, 0.2, 1);
      d.updateMatrix();
      lamps.setMatrixAt(placed++, d.matrix);
    }
    poles.count = lamps.count = placed;
    poles.name = "night-light-poles";
    lamps.name = "night-fixtures";
    world.scene.add(poles, lamps);
  }
}
