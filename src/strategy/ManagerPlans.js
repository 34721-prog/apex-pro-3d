// Serializable plans only. No Race, renderer or future weather dependencies.
export const paceNames = {
  conserve: "Conservar",
  balanced: "Equilibrado",
  aggressive: "Agressivo",
  maximum: "Ataque máximo · 30 s",
};
export const planDefaults = () => ({
  start: "medium",
  pace: "balanced",
  overtake: "balanced",
  defense: "balanced",
  tireCare: "normal",
  fuel: "normal",
  avoid: -1,
  setup: "balanced",
  automatic: true,
  rain: "auto",
  safety: "opportunity",
  stops: [],
});
export function validPlan(raw = {}, laps = 20) {
  const p = planDefaults();
  const enums = {
    start: ["hard", "medium", "soft", "wet"],
    pace: Object.keys(paceNames),
    overtake: ["conservative", "balanced", "aggressive", "very-aggressive"],
    defense: [
      "conservative",
      "balanced",
      "aggressive",
      "hold",
      "exit",
      "avoid",
    ],
    tireCare: ["normal", "save", "temperature"],
    fuel: ["normal", "save"],
    setup: ["balanced", "downforce", "low-drag"],
    rain: ["auto", "ask"],
    safety: ["opportunity", "hold"],
  };
  for (const [k, a] of Object.entries(enums))
    if (a.includes(raw?.[k])) p[k] = raw[k];
  p.automatic = raw?.automatic !== false;
  p.avoid =
    Number.isInteger(raw?.avoid) && raw.avoid >= 0 && raw.avoid < 6
      ? raw.avoid
      : -1;
  const seen = new Set();
  const n = (v, d) =>
    Number.isFinite(Number(v))
      ? Math.max(1, Math.min(Math.max(1, laps - 1), Math.round(Number(v))))
      : d;
  p.stops = (Array.isArray(raw?.stops) ? raw.stops : [])
    .slice(0, Math.min(6, Math.max(0, laps - 1)))
    .map((s) => {
      const from = n(s?.from, 1);
      return {
        from,
        to: Math.max(from, n(s?.to, from)),
        compound: ["hard", "medium", "soft", "wet"].includes(s?.compound)
          ? s.compound
          : "medium",
      };
    })
    .sort((a, b) => a.from - b.from)
    .filter((s) => {
      if (seen.has(s.from)) return false;
      seen.add(s.from);
      return true;
    });
  return p;
}
export function applySetup(stats, setup) {
  const s = { ...stats };
  if (setup === "downforce") {
    s.maxSpeed *= 0.97;
    s.grip *= 1.06;
    s.handling *= 1.03;
  }
  if (setup === "low-drag") {
    s.maxSpeed *= 1.015;
    s.grip *= 0.94;
    s.handling *= 0.98;
  }
  return s;
}
export const rivalProfiles = [
  { name: "Atacante", pace: "aggressive", wear: 0.26, wet: 0.5, start: "soft" },
  {
    name: "Conservadora",
    pace: "conserve",
    wear: 0.42,
    wet: 0.32,
    start: "hard",
  },
  {
    name: "Ritmo de prova",
    pace: "balanced",
    wear: 0.32,
    wet: 0.42,
    start: "medium",
  },
  {
    name: "Classificação",
    pace: "aggressive",
    wear: 0.3,
    wet: 0.4,
    start: "soft",
  },
  {
    name: "Gestão de pneus",
    pace: "balanced",
    wear: 0.38,
    wet: 0.36,
    start: "hard",
  },
  {
    name: "Risco no clima",
    pace: "aggressive",
    wear: 0.23,
    wet: 0.58,
    start: "soft",
  },
];
export function rivalPlan(c, race) {
  const p = rivalProfiles[c.teamId % 6],
    v = planDefaults();
  v.start =
    race.weather === "rain"
      ? "wet"
      : c.id % 2 && p.start === "soft"
        ? "medium"
        : p.start;
  v.pace =
    race.sessionType === "qualifying" && p.name === "Classificação"
      ? "maximum"
      : p.pace;
  v.overtake = p.pace === "aggressive" ? "aggressive" : "balanced";
  v.tireCare = p.name === "Gestão de pneus" ? "save" : "normal";
  v.setup =
    c.teamId % 3 === 1
      ? "downforce"
      : c.teamId % 3 === 2
        ? "low-drag"
        : "balanced";
  if (race.laps >= 4) {
    const lap = Math.max(
      1,
      Math.min(race.laps - 1, Math.floor(race.laps * 0.48) + (c.id % 2)),
    );
    v.stops = [
      {
        from: lap,
        to: Math.min(race.laps - 1, lap + 1),
        compound:
          race.weather === "rain"
            ? "wet"
            : race.laps - lap > 4
              ? "hard"
              : "medium",
      },
    ];
  }
  return validPlan(v, race.laps);
}
