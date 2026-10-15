import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { makeCar, makeBarrier, makeSegment } from "../src/models.js";
import fs from "node:fs/promises";
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result =
        "data:application/octet-stream;base64," +
        Buffer.from(b).toString("base64");
      this.onloadend?.();
    });
  }
};
const exporter = new GLTFExporter();
async function save(path, model) {
  const result = await exporter.parseAsync(model, { binary: true });
  await fs.writeFile("public/assets/" + path, Buffer.from(result));
  console.log(path, result.byteLength);
}
for (let i = 0; i < 12; i++)
  await save(
    "cars/models/" +
      [
        "apex-07",
        "ember-22",
        "azure-18",
        "solstice-44",
        "verdant-31",
        "orion-63",
        "kestrel-14",
        "obsidian-27",
        "helix-36",
        "tempest-48",
        "stratos-59",
        "baxter-00",
      ][i] +
      ".glb",
    makeCar(i),
  );
await save("tracks/models/barrier-concrete.glb", makeBarrier());
await save("tracks/models/straight-30m.glb", makeSegment());
await save("tracks/models/curve-90deg.glb", makeSegment(true));
