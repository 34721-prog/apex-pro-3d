const names = [
  "Luan Costa",
  "Mara Vega",
  "Sora Nakai",
  "Ari Morel",
  "Kai Vidal",
  "Nina Vale",
  "Davi Sarden",
  "Ines Corvo",
  "Téo Maren",
  "Yara Voss",
  "Nova Raze",
  "Ezra Flint",
  "Mila Solis",
  "Ravi Kade",
  "Kira Nox",
  "Luca Arden",
  "Aya Storm",
  "Otto Vey",
  "Zoe Astrid",
  "Ren Sable",
  "Atlas Varen",
  "Iris Volt",
  "Enzo Aster",
  "Lyra Senn",
  "Dante Orion",
  "Maya Riven",
  "Axel Nadir",
  "Vera Onyx",
  "Leon Aether",
  "Selene Knox",
  "Mega Baxter",
];
const specialties = [
  "Largadas",
  "Frenagem",
  "Curvas rápidas",
  "Gestão de pneus",
  "Ultrapassagens",
  "Chuva",
  "Consistência",
  "Economia",
  "Recuperação",
  "Pressão",
];
const traits = [
  "Audacioso",
  "Analítico",
  "Paciente",
  "Metódico",
  "Oportunista",
  "Adaptável",
  "Constante",
  "Eficiente",
  "Resiliente",
  "Competitivo",
];
const palette = [
  "#ee3554",
  "#49a1ba",
  "#e3b95c",
  "#698e72",
  "#a783bd",
  "#d57747",
  "#8bb9c0",
  "#879ddb",
  "#df7790",
  "#b2b982",
];
export const driverCatalog = names.map((name, id) => {
  const tier =
      id === 30
        ? "mega"
        : id < 10
          ? "normal"
          : id < 20
            ? "mythic"
            : "legendary",
    base = id === 30 ? 99 : 58 + Math.floor(id / 10) * 13 + ((id % 10) % 5);
  const score = (offset) => Math.min(99, base + ((id * offset) % 13));
  const color = palette[id % 10];
  return {
    id,
    name,
    tier,
    number:
      id === 30
        ? 0
        : [
            7, 22, 18, 44, 31, 63, 15, 26, 39, 52, 9, 24, 33, 45, 58, 66, 72,
            81, 93, 12, 3, 14, 27, 36, 48, 59, 67, 78, 86, 99,
          ][id],
    color,
    overall: id === 30 ? "∞" : Math.round(base + 5),
    specialty: id === 30 ? "Domínio absoluto" : specialties[id % 10],
    personality: id === 30 ? "Implacável" : traits[id % 10],
    description:
      id === 30
        ? "O último adversário. Sem atalhos, sem limites imaginários: vença Baxter no seu próprio evento."
        : `${name.split(" ")[0]} lê a pista através de ${specialties[id % 10].toLowerCase()}. ${id % 2 ? "Prefere construir a disputa volta após volta." : "Procura a oportunidade antes que ela apareça."}`,
    strength: specialties[id % 10],
    weakness: specialties[(id + 4) % 10],
    cost:
      id === 0
        ? 0
        : id < 10
          ? 1400 + id * 120
          : id < 20
            ? 4200 + (id - 10) * 250
            : id < 30
              ? 8500 + (id - 20) * 450
              : 0,
    attributes: {
      skill: score(3),
      consistency: score(5),
      aggression: score(7),
      precision: score(11),
      overtaking: score(2),
      defense: score(8),
      wetSkill: score(10),
      startSkill: score(12),
      experience: score(13),
      tireManagement: score(4),
      fuelManagement: score(6),
      pressure: score(9),
    },
    portrait: `/assets/drivers/${tier}/driver-${String(id).padStart(2, "0")}.png`,
    helmet: `/assets/drivers/${tier}/helmet-${String(id).padStart(2, "0")}.png`,
  };
});
export function pilotPersonality(id) {
  const d = driverCatalog[id] || driverCatalog[0];
  return Object.fromEntries(
    Object.entries(d.attributes).map(([k, v]) => [k, v / 100]),
  );
}
export function pilotStats(stats, id, mode = "quick", realism = "arcade") {
  const d = driverCatalog[id] || driverCatalog[0],
    p = pilotPersonality(d.id);
  const extreme = d.id === 30 && mode === "mega" && realism === "arcade";
  return {
    ...stats,
    maxSpeed: Math.min(110, stats.maxSpeed * (extreme ? 1.38 : 1)),
    acceleration: stats.acceleration * (extreme ? 1.3 : 1),
    grip: stats.grip * (extreme ? 1.35 : 1 + p.precision * 0.03),
    consumption: stats.consumption * (1 - p.fuelManagement * 0.1),
    tireWear: stats.tireWear * (1 - p.tireManagement * 0.13),
  };
}
