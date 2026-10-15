export const rules = {
  PIT_SPEED: {
    name: "Velocidade no pit lane",
    severity: "média",
    seconds: 5,
    when: "resultado ou antes do serviço",
    message: "Excesso de velocidade nos boxes",
  },
  JUMP_START: {
    name: "Queima de largada",
    severity: "média",
    seconds: 5,
    when: "resultado ou boxes",
    message: "Movimento antes da luz verde",
  },
  TRACK_GAIN: {
    name: "Vantagem fora dos limites",
    severity: "progressiva",
    seconds: 5,
    when: "3ª vantagem ou seguintes",
    message: "Vantagem obtida fora dos limites",
  },
  ILLEGAL_PASS: {
    name: "Ultrapassagem sob neutralização",
    severity: "média",
    seconds: 5,
    when: "devolver em 20 s ou acréscimo",
    message: "Devolva a posição sob bandeira",
  },
  NEUTRAL_SPEED: {
    name: "Velocidade de neutralização",
    severity: "média",
    seconds: 5,
    when: "desobediência persistente",
    message: "Limite de neutralização excedido",
  },
  AVOIDABLE_CONTACT: {
    name: "Contato traseiro evitável",
    severity: "média",
    seconds: 5,
    when: "evidência de alinhamento e aproximação",
    message: "Contato traseiro evitável",
  },
  DANGEROUS_BLOCK: {
    name: "Bloqueio repetido",
    severity: "progressiva",
    seconds: 5,
    when: "advertência, depois reincidência",
    message: "Mudanças repetidas de linha em defesa",
  },
  IGNORE_ORDER: {
    name: "Desobedecer ordem de devolução",
    severity: "grave",
    seconds: 10,
    when: "reincidência / bandeira preta",
    message: "Ordem dos comissários ignorada",
  },
};
export const regulationProfiles = {
  club: {
    name: "Clube / assistido",
    collisionPenalty: false,
    disqualification: false,
    trackThreshold: 3,
    pitLimit: 18,
    vscLimit: 23,
  },
  formula: {
    name: "Fórmula / fiscalizado",
    collisionPenalty: true,
    disqualification: true,
    trackThreshold: 3,
    pitLimit: 18,
    vscLimit: 23,
  },
  junior: {
    name: "Junior / formação",
    collisionPenalty: true,
    disqualification: true,
    trackThreshold: 4,
    pitLimit: 18,
    vscLimit: 21,
  },
};
export function reportInfraction(car, id, evidence = {}) {
  if (car.stewards) return car.stewards.decide(car, id, evidence);
  // Standalone physics fixtures use the same catalogue, not a second rule set.
  if (id === "PIT_SPEED") car.penalty = (car.penalty || 0) + rules[id].seconds;
}
export function recordContact(a, b, closing, normal) {
  const control = a.stewards || b.stewards;
  if (!control || closing < 4) return;
  control.contact(a, b, closing, normal);
}
const conditions = {
  PIT_SPEED: [
    "Velocidade acima de 19 m/s por mais de 0,5 s na zona limitada",
    ["speed", "limit", "duration", "s"],
  ],
  JUMP_START: [
    "Deslocamento superior a 0,6 m antes do verde",
    ["displacement", "countdown"],
  ],
  TRACK_GAIN: [
    "Todas as rodas fora, vantagem de percurso/posição e ausência de contato forçador",
    ["advance", "path", "positions"],
  ],
  ILLEGAL_PASS: [
    "Adversário ativo ultrapassado por mais de 6 m sob restrição, após período de frenagem",
    ["to", "reason"],
  ],
  NEUTRAL_SPEED: [
    "Acima do limite +2 m/s, sem frenagem adequada por mais de 3 s",
    ["speed", "limit"],
  ],
  AVOIDABLE_CONTACT: [
    "Contato de aproximação traseira >12 m/s e alinhamento <0,35 rad",
    ["closing", "alignment", "other"],
  ],
  DANGEROUS_BLOCK: [
    "Quatro inversões de direção em defesa com rival próximo",
    ["changes", "seconds"],
  ],
  IGNORE_ORDER: [
    "Prazo de devolução expirado; reincidência pode desclassificar",
    ["owedTo"],
  ],
};
for (const [id, [condition, evidence]] of Object.entries(conditions))
  Object.assign(rules[id], { condition, evidence });
