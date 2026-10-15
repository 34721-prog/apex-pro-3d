import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
// Batch static pieces sharing a material; cars remain separate movable 3D objects.
export function batchModel(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material)) {
      let geo = o.geometry.clone();
      if (geo.index) geo = geo.toNonIndexed();
      geo.applyMatrix4(o.matrixWorld);
      for (const key of Object.keys(geo.attributes))
        if (!["position", "normal"].includes(key)) geo.deleteAttribute(key);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(geo);
    }
  });
  const group = new THREE.Group();
  group.name = root.name;
  for (const [material, geos] of buckets) {
    let g = mergeGeometries(geos, false);
    if (!g) continue;
    let mesh = new THREE.Mesh(g, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  return group;
}
export function batchScenery(scene, exclude = []) {
  scene.updateMatrixWorld(true);
  const buckets = new Map();
  const removed = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    let ancestor = o;
    while (ancestor) {
      if (exclude.includes(ancestor)) return;
      ancestor = ancestor.parent;
    }
    const key =
      o.material.uuid +
      "-" +
      Object.keys(o.geometry.attributes).sort().join("-");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  for (const group of buckets.values()) {
    if (group.length < 3) continue;
    const geos = group.map((o) => {
      let g = o.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(o.matrixWorld);
      return g;
    });
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, group[0].material);
    m.castShadow = group.some((o) => o.castShadow);
    m.receiveShadow = true;
    removed.push(...group);
    scene.add(m);
    geos.forEach((g) => g.dispose());
  }
  removed.forEach((o) => o.removeFromParent());
  const used = new Set();
  scene.traverse((o) => {
    if (o.geometry) used.add(o.geometry);
  });
  for (const g of new Set(removed.map((o) => o.geometry)))
    if (!used.has(g)) g.dispose();
}
// A wheel stays articulated, but its tire/rim/trim are baked into one colored mesh.
const wheelMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.63,
  metalness: 0.18,
  flatShading: true,
});
export function batchWheel(root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(),
    geos = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
    for (const key of Object.keys(g.attributes))
      if (!["position", "normal"].includes(key)) g.deleteAttribute(key);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = o.material.color.r;
      colors[i + 1] = o.material.color.g;
      colors[i + 2] = o.material.color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  });
  const geometry = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const wheel = new THREE.Group();
  wheel.name = "wheel";
  wheel.position.copy(root.position);
  wheel.userData.front = root.position.z > 0;
  const mesh = new THREE.Mesh(geometry, wheelMaterial);
  mesh.castShadow = true;
  wheel.add(mesh);
  return wheel;
}
