import { planDefaults, validPlan } from "./strategy/ManagerPlans.js";
import { validateReport } from "./strategy/ManagerHistory.js";
import {
  competitionsDefaults,
  validateCompetitionData,
} from "./championships/Seasons.js";
import { careerDefaults } from "./championships/Catalog.js";
import { defaultStrategy, validateStrategy } from "./strategy/RaceStrategy.js";
import { DEFAULT_KEYS } from "./controls.js";
import { trackCatalog } from "./data/tracks.js";
export const SAVE_KEY = "apex-dynasty-v1";
export const defaults = () => ({
  version: 1,
  competitions: competitionsDefaults(),
  career: careerDefaults(),
  xp: 0,
  selectedDriver: 0,
  unlockedDrivers: [0],
  driverStats: {},
  rivalries: {},
  records: {},
  history: [],
  managerHistory: [],
  customizations: {},
  baxterWon: false,
  team: {
    name: "Apex Motorsport",
    partner: 0,
    development: 0,
    pitStats: { stops: 0, bestService: null, laneSeconds: 0 },
  },
  credits: 1200,
  selectedCar: 0,
  selectedPaint: "signature",
  unlockedCars: [0],
  unlockedPaints: ["signature"],
  upgrades: { maxSpeed: 0, acceleration: 0, handling: 0, braking: 0 },
  stats: {
    races: 0,
    wins: 0,
    podiums: 0,
    laps: 0,
    upgrades: 0,
    seasons: 0,
    bestLap: null,
    distance: 0,
  },
  objectives: [],
  settings: {
    track: "aurora",
    weatherProgram: "fixed",
    mechanicalRate: 0,
    ruleSet: "auto",
    controlMode: "manager",
    managerPlans: [planDefaults(), planDefaults()],
    managerObjective: "both",
    mode: "manager",
    realism: "arcade",
    weather: "dry",
    laps: 3,
    bots: 5,
    tire: "medium",
    voice: true,
    voiceVolume: 0.6,
    radioFrequency: 25,
    sensitivity: 1,
    deadzone: 0.12,
    invert: false,
    steeringVersion: 2,
    hudMode: "standard",
    strategyOpen: false,
    aiStrategy: defaultStrategy(),
    assistance: true,
    bindings: { ...DEFAULT_KEYS },
    fps: false,
    fpsLimit: "auto",
    startOrderMode: "random",
    startOrder: null,
    difficulty: "normal",
    pitPlan: [],
    quality: "medium",
    resolution: 0.85,
    shadows: 512,
    particles: 64,
    effects: true,
    detail: 0.8,
    autoQuality: false,
    music: true,
    musicVolume: 0.45,
    crowdVolume: 0.7,
    raceMusic: false,
    musicDuck: true,
    audio: true,
    volume: 0.3,
    engineVolume: 0.65,
    effectsVolume: 0.6,
  },
  championship: { results: [], season: 1 },
});
const num = (v, min, max, fallback) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
const int = (v, min, max, fallback) => Math.floor(num(v, min, max, fallback));
export function validateSave(value) {
  const s = defaults();
  if (!value || typeof value !== "object" || value.version !== 1) return s;
  s.credits = int(value.credits, 0, 100000000, s.credits);
  for (const k of Object.keys(s.upgrades))
    s.upgrades[k] = int(value.upgrades?.[k], 0, 5, 0);
  for (const k of Object.keys(s.stats))
    s.stats[k] =
      k === "bestLap"
        ? num(value.stats?.[k], 5, 3600, null)
        : int(value.stats?.[k], 0, 1e9, 0);
  s.unlockedCars = [
    ...new Set([
      0,
      ...(Array.isArray(value.unlockedCars)
        ? value.unlockedCars.filter(
            (n) => Number.isInteger(n) && n >= 0 && n < 12,
          )
        : []),
    ]),
  ];
  s.selectedCar = s.unlockedCars.includes(value.selectedCar)
    ? value.selectedCar
    : 0;
  s.unlockedPaints = [
    ...new Set([
      "signature",
      ...(Array.isArray(value.unlockedPaints)
        ? value.unlockedPaints.filter((n) => ["carbon", "heritage"].includes(n))
        : []),
    ]),
  ];
  s.selectedPaint = s.unlockedPaints.includes(value.selectedPaint)
    ? value.selectedPaint
    : "signature";
  s.objectives = Array.isArray(value.objectives)
    ? [
        ...new Set(
          value.objectives.filter((n) =>
            ["finish", "podium", "win", "upgrade", "fast", "season"].includes(
              n,
            ),
          ),
        ),
      ]
    : [];
  s.managerHistory = (
    Array.isArray(value.managerHistory) ? value.managerHistory : []
  )
    .slice(-12)
    .map((v) => validateReport(v))
    .filter(Boolean);
  const settings = value.settings || {};
  s.settings.controlMode =
    settings.controlMode === "manual" ? "manual" : "manager";
  s.settings.managerPlans = [0, 1].map((i) =>
    validPlan(settings.managerPlans?.[i]),
  );
  s.settings.managerObjective = ["both", "drivers", "constructors"].includes(
    settings.managerObjective,
  )
    ? settings.managerObjective
    : "both";
  s.settings.difficulty = ["easy", "normal", "hard", "elite"].includes(
    settings.difficulty,
  )
    ? settings.difficulty
    : "normal";
  s.settings.quality = ["low", "medium", "high", "custom"].includes(
    settings.quality,
  )
    ? settings.quality
    : "medium";
  s.settings.audio =
    typeof settings.audio === "boolean" ? settings.audio : true;
  s.settings.volume = num(settings.volume, 0, 1, 0.3);

  s.xp = int(value.xp, 0, 1e9, 0);
  s.baxterWon = value.baxterWon === true;
  s.unlockedDrivers = [
    ...new Set([
      0,
      ...(Array.isArray(value.unlockedDrivers)
        ? value.unlockedDrivers.filter(
            (n) => Number.isInteger(n) && n >= 0 && n <= 30,
          )
        : []),
    ]),
  ];
  s.selectedDriver = s.unlockedDrivers.includes(value.selectedDriver)
    ? value.selectedDriver
    : 0;
  for (const [key, values] of Object.entries({
    track: trackCatalog.map((t) => t.id),
    mode: [
      "quick",
      "time-trial",
      "practice",
      "manager",
      "mega",
      "endurance",
      "recovery",
    ],
    realism: ["arcade", "realistic"],
    weather: ["dry", "rain"],
    tire: ["hard", "medium", "soft", "wet"],
  }))
    if (values.includes(settings[key])) s.settings[key] = settings[key];
  for (const [key, min, max] of [
    ["resolution", 0.5, 1.25],
    ["shadows", 0, 1024],
    ["particles", 0, 128],
    ["detail", 0.6, 1],
    ["laps", 1, 20],
    ["bots", 1, 5],
    ["radioFrequency", 10, 60],
    ["sensitivity", 0.4, 1.8],
    ["deadzone", 0.05, 0.35],
    ["voiceVolume", 0, 1],
    ["engineVolume", 0, 1],
    ["musicVolume", 0, 1],
    ["crowdVolume", 0, 1],
    ["effectsVolume", 0, 1],
  ])
    s.settings[key] = num(settings[key], min, max, s.settings[key]);
  s.settings.pitPlan = Array.isArray(settings.pitPlan)
    ? [
        ...new Set(
          settings.pitPlan.filter(
            (n) => Number.isInteger(n) && n > 0 && n < 20,
          ),
        ),
      ]
        .sort((a, b) => a - b)
        .slice(0, 6)
    : [];
  if (![0, 512, 1024].includes(s.settings.shadows)) s.settings.shadows = 512;
  if (![0, 64, 128].includes(s.settings.particles)) s.settings.particles = 64;
  s.settings.laps = Math.round(s.settings.laps);
  s.settings.bots = Math.round(s.settings.bots);
  for (const key of [
    "music",
    "raceMusic",
    "musicDuck",
    "voice",
    "invert",
    "assistance",
    "fps",
    "effects",
    "autoQuality",
  ])
    if (typeof settings[key] === "boolean") s.settings[key] = settings[key];
  for (const k of Object.keys(DEFAULT_KEYS)) {
    const v = settings.bindings?.[k];
    if (
      typeof v === "string" &&
      /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right))$/.test(v)
    )
      s.settings.bindings[k] = v;
  }
  if (settings.steeringVersion !== 2) {
    s.settings.invert = false;
    if (
      s.settings.bindings.left === "KeyD" &&
      s.settings.bindings.right === "KeyA"
    ) {
      s.settings.bindings.left = "KeyA";
      s.settings.bindings.right = "KeyD";
    }
  }
  s.settings.steeringVersion = 2;
  s.settings.hudMode = ["standard", "compact", "immersive"].includes(
    settings.hudMode,
  )
    ? settings.hudMode
    : "standard";
  const _fl = settings.fpsLimit;
  if (_fl === "auto" || _fl === "unlimited") s.settings.fpsLimit = _fl;
  else {
    const _n = Number(_fl);
    s.settings.fpsLimit = [30, 60, 120, 240].includes(_n) ? _n : "auto";
  }
  s.settings.startOrderMode =
    settings.startOrderMode === "standings" ? "standings" : "random";
  if (
    Array.isArray(settings.startOrder) &&
    settings.startOrder.length === 6 &&
    new Set(settings.startOrder).size === 6 &&
    settings.startOrder.every((n) => Number.isInteger(n) && n >= 0 && n < 6)
  )
    s.settings.startOrder = [...settings.startOrder];
  else s.settings.startOrder = null;
  s.settings.strategyOpen = settings.strategyOpen === true;
  s.settings.aiStrategy = validateStrategy(settings.aiStrategy);
  if (!Array.isArray(settings.managerPlans)) {
    const legacy = settings.aiStrategy || {},
      pace =
        {
          economy: "conserve",
          balanced: "balanced",
          attack: "aggressive",
          qualifying: "maximum",
          recovery: "balanced",
        }[legacy.pace] || "balanced";
    s.settings.managerPlans = [0, 1].map((i) =>
      validPlan({
        pace,
        overtake: legacy.overtake,
        defense: legacy.defense,
        start: s.settings.tire,
        stops:
          i === 0
            ? s.settings.pitPlan.map((l) => ({
                from: l,
                to: l,
                compound: s.settings.tire,
              }))
            : [],
      }),
    );
  }
  for (let id = 0; id < 12; id++) {
    const v = value.customizations?.[id];
    if (v && typeof v === "object") {
      const hex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
      if (hex(v.primary) && hex(v.secondary))
        s.customizations[id] = {
          primary: v.primary,
          secondary: v.secondary,
          detail: hex(v.detail) ? v.detail : "#151a20",
          number: int(v.number, 0, 99, 7),
        };
    }
  }
  for (let id = 0; id < 31; id++) {
    const v = value.driverStats?.[id];
    if (v)
      s.driverStats[id] = {
        races: int(v.races, 0, 1e7, 0),
        wins: int(v.wins, 0, 1e7, 0),
      };
    const r = value.rivalries?.[id];
    if (r)
      s.rivalries[id] = {
        score: num(r.score, 0, 10, 0),
        passed: int(r.passed, 0, 1e7, 0),
        lost: int(r.lost, 0, 1e7, 0),
      };
  }
  for (const track of trackCatalog)
    for (const realism of ["arcade", "realistic"])
      for (const weather of ["dry", "rain"]) {
        const key = track.id + ":" + realism + ":" + weather,
          t = num(value.records?.[key], 5, 5000, null);
        if (t !== null) s.records[key] = t;
      }
  if (Array.isArray(value.history))
    s.history = value.history
      .slice(-50)
      .filter((h) => h && trackCatalog.some((t) => t.id === h.track))
      .map((h) => ({
        track: h.track,
        position: int(h.position, 1, 6, 6),
        time: num(h.time, 0, 1e6, null),
        mode:
          typeof h.mode === "string" &&
          [
            "quick",
            "time-trial",
            "manager",
            "mega",
            "endurance",
            "recovery",
          ].includes(h.mode)
            ? h.mode
            : "quick",
        driver: int(h.driver, 0, 30, 0),
        car: int(h.car, 0, 11, 0),
        ...(h.stops !== undefined
          ? {
              stops: int(h.stops, 0, 100, 0),
              pitSeconds: num(h.pitSeconds, 0, 1e6, 0),
            }
          : {}),
      }));
  if (value.team) {
    s.team.partner = s.unlockedDrivers.includes(value.team.partner)
      ? value.team.partner
      : 0;
    s.team.development = int(value.team.development, 0, 5, 0);
    s.team.pitStats = {
      stops: int(value.team.pitStats?.stops, 0, 1e7, 0),
      bestService: num(value.team.pitStats?.bestService, 1, 300, null),
      laneSeconds: num(value.team.pitStats?.laneSeconds, 0, 1e9, 0),
    };
  }
  const c = value.championship;
  if (c && typeof c === "object") {
    s.championship.season = int(c.season, 1, 10000, 1);
    if (Array.isArray(c.results)) {
      for (const result of c.results.slice(0, 3)) {
        if (
          !Array.isArray(result) ||
          result.length !== 6 ||
          new Set(result.map((r) => r?.id)).size !== 6 ||
          !result.every(
            (r) => r && Number.isInteger(r.id) && r.id >= 0 && r.id < 6,
          )
        )
          break;
        s.championship.results.push(
          result.map((r, i) => ({
            id: r.id,
            position: i + 1,
            time: num(r.time, 1, 100000, null),
            points: int(r.points, 0, 25, [25, 18, 15, 12, 10, 8][i]),
          })),
        );
      }
    }
  }
  Object.assign(s, validateCompetitionData(value.competitions, value.career));
  s.settings.weatherProgram = ["fixed", "showers", "storm", "drying"].includes(
    settings.weatherProgram,
  )
    ? settings.weatherProgram
    : "fixed";
  s.settings.mechanicalRate = num(settings.mechanicalRate, 0, 0.15, 0);
  s.settings.ruleSet = ["auto", "club", "formula", "junior"].includes(
    settings.ruleSet,
  )
    ? settings.ruleSet
    : "auto";
  return s;
}
export function load() {
  try {
    return validateSave(JSON.parse(localStorage.getItem(SAVE_KEY)));
  } catch {
    return defaults();
  }
}
export function save(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
