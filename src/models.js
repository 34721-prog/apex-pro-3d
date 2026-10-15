import * as THREE from "three";
import { batchModel, batchWheel } from "./optimize.js";
const box = new THREE.BoxGeometry(1, 1, 1);
const mat = (c, metalness = 0, roughness = 0.7) =>
  new THREE.MeshStandardMaterial({
    color: c,
    metalness,
    roughness,
    flatShading: true,
  });
import { liveries } from "./data/liveries.js";
export { liveries };
export function makeCar(index = 0, custom = {}) {
  const l = {
      ...liveries[index],
      ...(custom.primary
        ? {
            color: custom.primary,
            accent: custom.secondary,
            number: custom.number,
          }
        : {}),
    },
    g = new THREE.Group();
  g.name = "formula-" + l.number;
  const body = mat(l.color, 0.55, 0.32),
    accent = mat(l.accent, 0.35, 0.38),
    black = mat(custom.detail || "#151a20", 0.15, 0.6),
    rubber = mat("#151718"),
    rim = mat("#5f6771", 0.75, 0.35),
    helmet = mat("#f3e6c8", 0.3, 0.3);
  helmet.name = "helmet";
  body.name = "body";
  accent.name = "accent";
  black.name = "carbon";
  function cube(name, x, y, z, sx, sy, sz, m) {
    let o = new THREE.Mesh(box, m);
    o.name = name;
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  }
  function wedge(name, w0, w1, h0, h1, z0, z1, y, m) {
    let p = new Float32Array([
      -w0 / 2,
      y,
      z0,
      w0 / 2,
      y,
      z0,
      -w1 / 2,
      y,
      z1,
      w1 / 2,
      y,
      z1,
      -w0 / 2,
      y + h0,
      z0,
      w0 / 2,
      y + h0,
      z0,
      -w1 / 2,
      y + h1,
      z1,
      w1 / 2,
      y + h1,
      z1,
    ]);
    let geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    geo.setIndex([
      0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0,
      4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5,
    ]);
    for (let i = 0; i < geo.index.count; i += 3) {
      const v = geo.index.array[i + 1];
      geo.index.array[i + 1] = geo.index.array[i + 2];
      geo.index.array[i + 2] = v;
    }
    geo.computeVertexNormals();
    let o = new THREE.Mesh(geo, m);
    o.name = name;
    o.castShadow = true;
    g.add(o);
  }
  if (index >= 6) {
    cube(
      "aero-fin",
      0,
      1.65,
      -1.3,
      0.09,
      0.35 + (index % 3) * 0.09,
      1.25,
      accent,
    );
    for (const side of [-1, 1]) {
      cube(
        "canard",
        side * 0.84,
        0.74,
        1.78,
        0.55,
        0.065,
        0.38,
        accent,
      ).rotation.y = side * 0.22;
      cube(
        "vent",
        side * 0.74,
        1.0,
        -0.67,
        0.37,
        0.045,
        0.75,
        index % 2 ? black : accent,
      );
    }
  }
  cube("carbon-floor", 0, 0.29, -0.15, 2.15, 0.1, 4.35, black);
  wedge(
    "chassis",
    1.35 + index * 0.025,
    0.58 - index * 0.012,
    0.64,
    0.18,
    -1.5,
    2.55,
    0.44,
    body,
  );
  wedge("nose-stripe", 0.3, 0.16, 0.035, 0.035, 0.55, 2.64, 0.67, accent);
  for (const side of [-1, 1]) {
    wedge(
      "sidepod",
      0.63 + (index % 3) * 0.06,
      0.57 - (index % 3) * 0.04,
      0.57 + (index % 4) * 0.035,
      0.29,
      -1.35,
      0.7,
      0.38,
      body,
    );
    let o = g.children[g.children.length - 1];
    o.position.x = side * 0.75;
    cube("sidepod-accent", side * 1.055, 0.65, -0.27, 0.04, 0.22, 1.7, accent);
    cube("air-inlet", side * 0.74, 0.79, 0.7, 0.49, 0.24, 0.06, black);
    for (const z of [-1.64, 1.61]) {
      cube(
        "suspension",
        side * 0.95,
        0.48,
        z,
        0.95,
        0.055,
        0.095,
        black,
      ).rotation.y = side * 0.18;
      cube(
        "wishbone",
        side * 0.95,
        0.61,
        z + 0.12,
        0.9,
        0.04,
        0.09,
        black,
      ).rotation.y = -side * 0.2;
      let wheel = new THREE.Group();
      wheel.name = "wheel";
      wheel.position.set(side * 1.35, 0.59, z);
      let t = new THREE.Mesh(
        new THREE.CylinderGeometry(0.58, 0.58, 0.62, 16),
        rubber,
      );
      t.rotation.z = Math.PI / 2;
      t.castShadow = true;
      wheel.add(t);
      let ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.39, 0.39, 0.636, 12),
        rim,
      );
      ring.rotation.z = Math.PI / 2;
      wheel.add(ring);
      let hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.65, 8),
        black,
      );
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);
      let line = new THREE.Mesh(
        new THREE.TorusGeometry(0.47, 0.018, 4, 20),
        accent,
      );
      line.rotation.y = Math.PI / 2;
      line.position.x = side * 0.317;
      wheel.add(line);
      g.add(wheel);
    }
  }
  cube("cockpit", 0, 1.03, -0.1, 0.67, 0.12, 1.12, black);
  let head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 8), helmet);
  head.position.set(0, 1.2, -0.12);
  g.add(head);
  cube("visor", 0, 1.23, 0.066, 0.36, 0.08, 0.15, black);
  cube("halo-top", 0, 1.43, 0.08, 0.81, 0.06, 0.89, black);
  cube("halo-opening", 0, 1.46, 0.08, 0.6, 0.02, 0.65, body);
  cube("halo-post", 0, 1.25, 0.56, 0.075, 0.4, 0.08, black);
  wedge(
    "engine-cover",
    0.66,
    0.37,
    0.72 + index * 0.022,
    0.91,
    -1.8,
    -0.72,
    0.83,
    body,
  );
  cube("airbox", 0, 1.69, -0.75, 0.31, 0.23, 0.34, black);
  cube("engine-stripe", 0, 1.56, -1.27, 0.16, 0.055, 1.0, accent).rotation.x =
    0.18;
  cube("front-wing", 0, 0.36, 2.48, 3.15, 0.11, 0.62, black);
  cube("front-flap", 0, 0.48, 2.37, 3.05, 0.06, 0.24, body).rotation.x = -0.12;
  cube("front-trim", 0, 0.42, 2.78, 3.1, 0.045, 0.1, accent);
  cube("rear-mount", 0, 0.89, -2.18, 0.14, 1.15, 0.15, black);
  cube(
    "rear-wing",
    0,
    1.55,
    -2.23,
    2.5 + index * 0.035,
    0.13,
    0.57,
    body,
  ).rotation.x = 0.08;
  cube("rear-flap", 0, 1.7, -2.36, 2.5, 0.055, 0.23, accent);
  for (const side of [-1, 1]) {
    cube("front-endplate", side * 1.57, 0.49, 2.47, 0.08, 0.35, 0.7, body);
    cube(
      "rear-endplate",
      side * 1.24,
      1.46,
      -2.23,
      0.075,
      0.62,
      0.7,
      index % 2 ? accent : black,
    );
  }
  cube("rear-light", 0, 0.46, -2.41, 0.19, 0.13, 0.035, accent);
  // Real number plate, using small seven-segment geometry rather than a baked presentation image.
  const segs = {
    0: "ab cdef".replaceAll(" ", ""),
    1: "bc",
    2: "abged",
    3: "abgcd",
    4: "fgbc",
    5: "afgcd",
    6: "afgecd",
    7: "abc",
    8: "abcdefg",
    9: "abfgcd",
  };
  const xy = {
    a: [0, 0.13, 0.14, 0.025],
    g: [0, 0, 0.14, 0.025],
    d: [0, -0.13, 0.14, 0.025],
    f: [-0.08, 0.065, 0.025, 0.11],
    b: [0.08, 0.065, 0.025, 0.11],
    e: [-0.08, -0.065, 0.025, 0.11],
    c: [0.08, -0.065, 0.025, 0.11],
  };
  String(l.number)
    .split("")
    .forEach((n, k, ar) => {
      for (const s of segs[n]) {
        const [x, z, w, h] = xy[s];
        cube(
          "number-" + n,
          x + (k - (ar.length - 1) / 2) * 0.22,
          0.798,
          1.26 - z,
          w,
          0.009,
          h,
          black,
        );
      }
    });
  const wheels = g.children.filter((o) => o.name === "wheel");
  wheels.forEach((o) => g.remove(o));
  const merged = batchModel(g);
  for (const wheel of wheels) {
    merged.add(batchWheel(wheel));
  }
  return merged;
}
export function makeBarrier() {
  let g = new THREE.Group();
  g.name = "concrete-barrier-4m";
  let m = new THREE.Mesh(new THREE.BoxGeometry(4, 1.15, 0.65), mat("#bbc1bd"));
  m.position.y = 0.575;
  g.add(m);
  let stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.85, 0.28, 0.67),
    mat("#ea2445"),
  );
  stripe.position.y = 0.83;
  g.add(stripe);
  return g;
}
export function makeSegment(curved = false) {
  let g = new THREE.Group();
  let vs = [],
    uv = [],
    ix = [];
  const n = curved ? 40 : 1;
  for (let i = 0; i <= n; i++) {
    const a = ((i / n) * Math.PI) / 2;
    for (let side of [-1, 1]) {
      let x = curved ? Math.sin(a) * (40 + side * 8) : side * 8,
        z = curved ? Math.cos(a) * (40 + side * 8) - 40 : i * 30;
      vs.push(x, 0, z);
      uv.push((side + 1) / 2, (i / n) * 5);
    }
  }
  for (let i = 0; i < n; i++) {
    let a = i * 2;
    ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vs, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(ix);
  geo.computeVertexNormals();
  let m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: "#44484c",
      side: THREE.DoubleSide,
    }),
  );
  g.add(m);
  return g;
}
