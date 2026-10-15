export const cameraModes = [
  "chase",
  "cockpit",
  "far",
  "broadcast",
  "pit-lane",
  "pit-garage",
  "pit-follow",
  "pit-wheels",
  "safety-car",
  "grandstands",
  "overview",
  "battle",
];
export const cameraLabels = {
  overview: "Visão geral do circuito",
  battle: "Disputa próxima",
  grandstands: "Arquibancadas",
  "safety-car": "Safety Car",
  "pit-lane": "Boxes · externa",
  "pit-garage": "Boxes · garagem",
  "pit-follow": "Boxes · entrada / saída",
  "pit-wheels": "Boxes · pneus",
  chase: "Perseguição",
  cockpit: "Cockpit",
  far: "Distante",
  broadcast: "Transmissão",
};
export function nextCamera(world) {
  const n = cameraModes.indexOf(world.cameraMode || "chase");
  world.cameraMode = cameraModes[(n + 1) % cameraModes.length];
  world.cameraReady = false;
  return cameraLabels[world.cameraMode];
}
