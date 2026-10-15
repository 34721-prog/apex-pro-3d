import { drivers, points } from "./race.js";
export const rounds = [
  { track: "aurora", name: "Grande Prêmio Aurora", type: "ABERTURA", laps: 3 },
  { track: "serpente", name: "Serpente Masters", type: "DISPUTA", laps: 4 },
  { track: "titan", name: "Titan Grand Finale", type: "FINAL", laps: 5 },
];
export function newSeason() {
  return { results: [], season: 1 };
}
export function standings(champ) {
  const table = drivers.map((name, id) => ({ id, name, points: 0, wins: 0 }));
  for (const round of champ.results) {
    round.forEach((r, i) => {
      let d = table[r.id];
      if (d) {
        d.points += r.points ?? points[i];
        if (i === 0 && (r.points ?? 25) > 0) d.wins++;
      }
    });
  }
  return table.sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.id - b.id,
  );
}
export function recordRound(champ, results) {
  if (champ.results.length >= 3) return false;
  champ.results.push(
    results.map((r) => ({
      id: r.id,
      position: r.position,
      time: r.time,
      points: r.points,
    })),
  );
  return true;
}
export function resetSeason(champ) {
  return { results: [], season: champ.season + 1 };
}
