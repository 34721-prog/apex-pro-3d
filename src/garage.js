import { BASE } from "./physics.js";
import { vehicles } from "./data/cars.js";
export { vehicles };
export const attributes = [
  {
    key: "maxSpeed",
    name: "Velocidade máxima",
    icon: "speed",
    description: "Mais potência no fim da reta.",
    gain: 3.2,
    unit: "km/h",
  },
  {
    key: "acceleration",
    name: "Aceleração",
    icon: "bolt",
    description: "Uma saída de curva mais rápida.",
    gain: 2.2,
    unit: "m/s²",
  },
  {
    key: "handling",
    name: "Controle nas curvas",
    icon: "curve",
    description: "Mais resposta a cada comando.",
    gain: 0.065,
    unit: "%",
  },
  {
    key: "braking",
    name: "Frenagem",
    icon: "brake",
    description: "Confiança para frear mais tarde.",
    gain: 4,
    unit: "m/s²",
  },
];
export const upgradeCost = (level) => 400 + level * 300;
export function performance(save, car = save.selectedCar) {
  const stats = { ...BASE },
    v = vehicles[car];
  stats.grip += ((car * 3) % 7) - 3;
  stats.stability = 1 + ((car % 4) - 1) * 0.05;
  stats.consumption = 0.9 + (car % 5) * 0.055;
  stats.durability = 0.85 + (car % 4) * 0.12;
  stats.tireWear = 0.88 + (car % 4) * 0.075;
  for (const a of attributes)
    stats[a.key] += v[a.key] + save.upgrades[a.key] * a.gain;
  return stats;
}
export function purchase(save, key) {
  const attr = attributes.find((a) => a.key === key);
  if (!attr) return { ok: false, message: "Melhoria inválida." };
  const level = save.upgrades[key];
  if (level >= 5) return { ok: false, message: "Nível máximo atingido." };
  const cost = upgradeCost(level);
  if (save.credits < cost)
    return {
      ok: false,
      message: "Créditos insuficientes. Complete uma corrida.",
    };
  save.credits -= cost;
  save.upgrades[key]++;
  save.stats.upgrades++;
  return {
    ok: true,
    message: attr.name + " aprimorada. A diferença já está na pista.",
  };
}
export function displayStat(key, value) {
  if (key === "maxSpeed") return Math.round(value * 3.6);
  if (key === "handling") return Math.round(value * 100);
  return value.toFixed(1);
}
