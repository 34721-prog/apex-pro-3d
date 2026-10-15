import * as THREE from "three";
export function makeCurve(track) {
  const c = new THREE.CatmullRomCurve3(
    track.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    "catmullrom",
    0.32,
  );
  c.arcLengthDivisions = 4000;
  c.updateArcLengths();
  return c;
}
const cross = (a, b, c) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function intersects(a, b, c, d) {
  return (
    cross(a, b, c) * cross(a, b, d) < -1e-8 &&
    cross(c, d, a) * cross(c, d, b) < -1e-8
  );
}
export function validateTrack(track) {
  const errors = [];
  if (
    !Array.isArray(track.points) ||
    track.points.length < 8 ||
    track.points.some(
      (p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)),
    )
  )
    return { valid: false, errors: ["Pontos inválidos"] };
  const c = makeCurve(track),
    L = c.getLength(),
    N = 384,
    pts = c.getSpacedPoints(N),
    width = track.width || 18;
  let crossings = 0,
    minSeparation = Infinity,
    maxCurvature = 0;
  for (let i = 0; i < N; i++)
    for (let j = i + 2; j < N; j++) {
      if (i === 0 && j === N - 1) continue;
      if (intersects(pts[i], pts[i + 1], pts[j], pts[j + 1])) crossings++;
      const gap = (Math.min(j - i, N - (j - i)) * L) / N;
      if (gap > 100)
        minSeparation = Math.min(minSeparation, pts[i].distanceTo(pts[j]));
    }
  for (let i = 0; i < N; i++) {
    const a = c.getTangentAt(i / N),
      b = c.getTangentAt((i / N + 8 / L) % 1);
    maxCurvature = Math.max(
      maxCurvature,
      Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) / 8,
    );
  }
  if (L < 2900 || L > 7000) errors.push("Comprimento fora de 2,9–7 km");
  if (crossings) errors.push("Cruzamento de segmentos");
  if (minSeparation < width + 8) errors.push("Trechos muito próximos");
  if (maxCurvature > 0.07) errors.push("Curva excessivamente fechada");
  if (width < 14 || width > 22) errors.push("Largura insegura");
  // Expanded pit buildings cannot intersect a remote section of the circuit.
  let pitClearance = Infinity;
  for (let s = -70; s <= 190; s += 13) {
    const u = (((s / L) % 1) + 1) % 1,
      p = c.getPointAt(u),
      d = c.getTangentAt(u),
      r = new THREE.Vector3(d.z, 0, -d.x);
    for (const off of [26, 36, 50, 60]) {
      const q = p.clone().addScaledVector(r, off);
      for (let i = 0; i < N; i++) {
        let gap = Math.abs((i / N) * L - s);
        gap = Math.min(gap, L - gap);
        if (gap > 180)
          pitClearance = Math.min(pitClearance, q.distanceTo(pts[i]));
      }
    }
  }
  if (pitClearance < width / 2 + 20)
    errors.push("Boxes próximos a outro trecho");
  return {
    valid: !errors.length,
    errors,
    length: L,
    width,
    crossings,
    minSeparation,
    maxCurvature,
    pitClearance,
  };
}
const cache = new WeakMap();
export function trackPreview(track) {
  if (cache.has(track)) return cache.get(track);
  const c = makeCurve(track),
    points = c.getSpacedPoints(160),
    xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    minX = Math.min(...xs),
    minZ = Math.min(...zs),
    w = Math.max(...xs) - minX,
    h = Math.max(...zs) - minZ,
    scale = Math.min(264 / w, 146 / h),
    ox = (300 - w * scale) / 2,
    oy = (180 - h * scale) / 2;
  const path = points
    .map(
      (p) =>
        `${(ox + (p.x - minX) * scale).toFixed(1)},${(oy + (p.z - minZ) * scale).toFixed(1)}`,
    )
    .join(" ");
  let corners = 0;
  for (let i = 0; i < track.points.length; i++) {
    const a = track.points[(i + track.points.length - 1) % track.points.length],
      b = track.points[i],
      d = track.points[(i + 1) % track.points.length];
    const angle = Math.atan2(
      (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]),
      (b[0] - a[0]) * (d[0] - b[0]) + (b[1] - a[1]) * (d[1] - b[1]),
    );
    if (Math.abs(angle) > 0.25) corners++;
  }
  const result = {
    length: c.getLength(),
    corners,
    svg: `<svg viewBox="0 0 300 180" role="img" aria-label="Traçado de ${track.name}"><rect width="300" height="180" rx="8" fill="${track.night ? "#111b31" : "#19252b"}"/><path d="M0 45H300 M0 90H300 M0 135H300 M75 0V180 M150 0V180 M225 0V180" stroke="#ffffff07"/><polyline points="${path}" fill="none" stroke="${track.grass}" stroke-opacity=".2" stroke-width="14" stroke-linejoin="round"/><polyline points="${path}" fill="none" stroke="#e4eaf1" stroke-width="3.5" stroke-linejoin="round"/><circle cx="${path.split(" ")[0].split(",")[0]}" cy="${path.split(" ")[0].split(",")[1]}" r="5" fill="#f83252" stroke="#fff" stroke-width="1.5"/></svg>`,
  };
  cache.set(track, result);
  return result;
}
export function generateCircuit(seed = 4107, { width = 18, stretch = 1 } = {}) {
  let state = Number(seed) >>> 0 || 1;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  width = Math.max(14, Math.min(22, width));
  stretch = Math.max(0.9, Math.min(1.2, stretch));
  for (let attempt = 0; attempt < 12; attempt++) {
    const base = [
      [-500, 420],
      [0, 420],
      [550, 420],
      [850, 220],
      [790, -130],
      [520, -420],
      [180, -600],
      [-220, -540],
      [-610, -380],
      [-950, -110],
      [-1000, 170],
      [-850, 420],
    ];
    const points = base.map(([x, z], i) =>
      i < 3 || i > 9
        ? [x, z]
        : [(x + (rand() - 0.5) * 130) * stretch, z + (rand() - 0.5) * 140],
    );
    const candidate = {
      id: "discovery",
      name: "Discovery Circuit",
      region: "Distrito de Novaterra",
      category: "Procedurais",
      kind: "Procedural validado",
      theme: "forest",
      description:
        "Traçado reproduzível com reta de boxes protegida e geometria validada.",
      feature: "Semente " + seed,
      seed,
      width,
      difficulty: 3,
      points,
      sky: "#b4c7d1",
      grass: "#98ae87",
    };
    const validation = validateTrack(candidate);
    if (validation.valid) return candidate;
  }
  throw Error("Nenhum circuito válido para a semente " + seed);
}
