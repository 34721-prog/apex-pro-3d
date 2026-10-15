// Global race policy: all AI drivers, including delegated manager cars.
// Never changes physics stats, collision masks, teleports or human steering.
export const strategyOptions = {
  overtake: {
    label: "Ultrapassagem",
    options: [
      ["conservative", "Conservador"],
      ["balanced", "Equilibrado"],
      ["aggressive", "Agressivo"],
      ["very-aggressive", "Muito agressivo"],
    ],
  },
  defense: {
    label: "Defesa de posição",
    options: [
      ["conservative", "Defesa conservadora"],
      ["balanced", "Defesa equilibrada"],
      ["aggressive", "Defesa agressiva"],
      ["hold", "Manter posição"],
      ["exit", "Priorizar saída de curva"],
      ["avoid", "Evitar disputas"],
    ],
  },
  line: {
    label: "Trajetória",
    options: [
      ["ideal", "Linha ideal"],
      ["alternate", "Linhas alternativas"],
      ["defend", "Defesa de linha"],
      ["exit", "Saída de curva"],
      ["safe", "Evitar trechos inadequados"],
    ],
  },
  pace: {
    label: "Ritmo",
    options: [
      ["economy", "Economia"],
      ["balanced", "Equilibrado"],
      ["attack", "Ataque"],
      ["recovery", "Recuperação após disputa"],
      ["qualifying", "Volta lançada"],
    ],
  },
  pitMode: {
    label: "Decisão de parada",
    options: [
      ["automatic", "Automática por recursos"],
      ["strategic", "Estratégica / janelas"],
    ],
  },
  pitProfile: {
    label: "Perfil dos boxes",
    options: [
      ["conservative", "Conservador"],
      ["aggressive", "Agressivo"],
    ],
  },
  pitWindow: {
    label: "Janela automática",
    options: [
      ["early", "Antecipada"],
      ["balanced", "Equilibrada"],
      ["late", "Estendida"],
    ],
  },
  rejoin: {
    label: "Segurança na reentrada",
    options: [
      ["safe", "Margem ampliada"],
      ["balanced", "Margem padrão segura"],
    ],
  },
  pitTraffic: {
    label: "Tráfego nos boxes",
    options: [
      ["avoid-stack", "Evitar parada dupla"],
      ["queue", "Aceitar fila da equipe"],
    ],
  },
};
export const defaultStrategy = () => ({
  overtake: "balanced",
  defense: "balanced",
  line: "ideal",
  pace: "balanced",
  pitMode: "strategic",
  pitProfile: "conservative",
  pitWindow: "balanced",
  rejoin: "safe",
  pitTraffic: "avoid-stack",
});
export function validateStrategy(input = {}) {
  const value = defaultStrategy();
  for (const [key, field] of Object.entries(strategyOptions))
    if (field.options.some(([id]) => input?.[key] === id))
      value[key] = input[key];
  return value;
}
const attacks = {
  conservative: [23, 0.72, 4.5],
  balanced: [35, 0.52, 3],
  aggressive: [46, 0.35, 2.1],
  "very-aggressive": [56, 0.22, 1.5],
};
const defenseRange = {
  conservative: 12,
  balanced: 20,
  aggressive: 29,
  hold: 35,
  exit: 8,
  avoid: 0,
};
export function policyFor(strategy = defaultStrategy()) {
  const s = strategy,
    a = attacks[s.overtake];
  return {
    search: a[0],
    opportunity: a[1],
    commit: a[2],
    defendRange: defenseRange[s.defense],
    pace: {
      economy: 0.9,
      balanced: 1,
      attack: 1.028,
      recovery: 0.97,
      qualifying: 1.04,
    }[s.pace],
    throttle: s.pace === "economy" ? 0.83 : 1,
    maxPassCurvature:
      s.line === "safe" ? 0.008 : s.line === "alternate" ? 0.022 : 0.017,
    reserve:
      (s.pitProfile === "conservative" ? 1.5 : 1.15) +
      (s.pitWindow === "early" ? 0.18 : s.pitWindow === "late" ? -0.12 : 0),
    wear:
      (s.pitProfile === "conservative" ? 0.31 : 0.22) +
      (s.pitWindow === "early" ? 0.05 : s.pitWindow === "late" ? -0.04 : 0),
    mergeMargin: s.rejoin === "safe" ? 1.25 : 1,
    avoidStack: s.pitTraffic === "avoid-stack",
    opportunistic: s.pitMode === "strategic",
  };
}
export function assignStrategy(race, input) {
  const strategy = validateStrategy(input);
  race.strategy = strategy;
  for (const c of race.cars) {
    c.strategy = strategy;
    c.policy = policyFor(strategy);
    if (c.ai) c.ai.nextDecision = 0;
  }
  return strategy;
}
