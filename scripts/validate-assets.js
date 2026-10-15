import fs from "node:fs/promises";
import path from "node:path";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Box3, Vector3 } from "three";
const loader = new GLTFLoader();
const rows = [];
for (const dir of ["cars/models", "tracks/models"])
  for (const f of await fs.readdir("public/assets/" + dir)) {
    const p = path.join("public/assets", dir, f),
      buf = await fs.readFile(p);
    if (buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2)
      throw new Error("Invalid GLB: " + p);
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      "",
    );
    const bounds = new Box3().setFromObject(gltf.scene),
      size = bounds.getSize(new Vector3());
    let tris = 0,
      meshes = 0;
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        tris +=
          (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
      }
    });
    rows.push({
      file: p,
      bytes: buf.length,
      meshes,
      triangles: tris,
      dimensions_m: size.toArray().map((n) => +n.toFixed(3)),
      bounds_min: bounds.min.toArray().map((n) => +n.toFixed(3)),
    });
  }
await fs.writeFile(
  "tests/asset-validation.json",
  JSON.stringify(rows, null, 2),
);
console.table(
  rows.map((r) => ({
    file: r.file.split("/").pop(),
    bytes: r.bytes,
    triangles: r.triangles,
    dimensions: r.dimensions_m.join(" × "),
  })),
);
