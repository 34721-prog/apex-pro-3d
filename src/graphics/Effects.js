import * as THREE from "three";
// Fixed buffers: no sprites, timers, textures or allocations spawned per frame.
export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(128 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.material = new THREE.PointsMaterial({
      color: "#c5deea",
      size: 0.13,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.configure({ particles: 64, effects: true });
  }
  configure(config) {
    this.count = config.effects ? config.particles : 0;
    this.geometry.setDrawRange(0, this.count);
  }
  update(car, time, weather, intensity = 1) {
    const wet = weather === "rain";
    this.points.visible =
      !!car && this.count > 0 && (wet || car.offroad || car.impact > 4);
    if (!this.points.visible) return;
    this.material.color.set(wet ? "#b7d6ea" : "#c4b691");
    this.material.size = wet ? 0.08 + 0.07 * (intensity ?? 1) : 0.24;
    this.geometry.setDrawRange(
      0,
      wet
        ? Math.max(4, Math.floor(this.count * (0.2 + 0.8 * (intensity ?? 1))))
        : this.count,
    );
    for (let i = 0; i < this.count; i++) {
      const k = i * 3,
        t = (time * (wet ? 13 : 2) + i * 0.41) % 16;
      this.positions[k] = car.x + (Math.sin(i * 127.1) * 0.5 + 0.5) * 28 - 14;
      this.positions[k + 1] = wet ? 16 - t : 0.2 + t * 0.1;
      this.positions[k + 2] =
        car.z + (Math.cos(i * 311.7) * 0.5 + 0.5) * 28 - 14;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}
