export const graphicsPresets = {
  low: {
    resolution: 0.65,
    shadows: 0,
    particles: 0,
    effects: false,
    detail: 0.6,
  },
  medium: {
    resolution: 0.85,
    shadows: 512,
    particles: 64,
    effects: true,
    detail: 0.8,
  },
  high: {
    resolution: 1,
    shadows: 1024,
    particles: 128,
    effects: true,
    detail: 1,
  },
};
export function graphicsConfig(value = "medium") {
  const s = typeof value === "string" ? { quality: value } : value;
  const base = graphicsPresets[s.quality] || graphicsPresets.medium;
  if (s.quality !== "custom")
    return { ...base, adaptive: s.autoQuality === true };
  return {
    resolution: Math.max(0.5, Math.min(1.25, Number(s.resolution) || 0.85)),
    shadows: [0, 512, 1024].includes(Number(s.shadows))
      ? Number(s.shadows)
      : 512,
    particles: [0, 64, 128].includes(Number(s.particles))
      ? Number(s.particles)
      : 64,
    effects: s.effects !== false,
    detail: Math.max(0.6, Math.min(1, Number(s.detail) || 0.8)),
    adaptive: s.autoQuality === true,
  };
}
export function applyQuality(world, value) {
  const config = graphicsConfig(value);
  world.qualityLevel = typeof value === "string" ? value : value.quality;
  world.graphics = config;
  world.adaptiveScale = 1;
  world.slowFrames = 0;
  world.perfSeconds = 0;
  world.applyResolution();
  const old = world.sun.shadow.mapSize.x;
  world.renderer.shadowMap.enabled = config.shadows > 0;
  world.renderer.shadowMap.autoUpdate = true;
  if (config.shadows && old !== config.shadows) {
    world.sun.shadow.dispose();
    world.sun.shadow.map = null;
    world.sun.shadow.mapSize.set(config.shadows, config.shadows);
  }
  world.renderer.shadowMap.needsUpdate = true;
  world.dynamicShadows?.reset();
  world.camera.far =
    world.mode === "track-preview" ? 6000 : 800 + 800 * config.detail;
  world.scene.fog.far = world.camera.far;
  world.camera.updateProjectionMatrix();
  world.resize();
  world.effects?.configure(config);
}
export function observePerformance(world, dt, active) {
  if (!world.graphics?.adaptive || !active || dt <= 0 || dt > 0.8) return;
  world.perfSeconds += dt;
  world.slowFrames += dt > 1 / 28 ? 1 : -1;
  if (world.perfSeconds < 3) return;
  const before = world.adaptiveScale;
  if (world.slowFrames > 4) world.adaptiveScale = Math.max(0.65, before - 0.1);
  else if (world.slowFrames < -70)
    world.adaptiveScale = Math.min(1, before + 0.05);
  world.slowFrames = world.perfSeconds = 0;
  if (before !== world.adaptiveScale) world.applyResolution();
}
