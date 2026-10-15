import { initializeResources } from "../strategy/Resources.js";
import {
  pilotPersonality,
  pilotStats,
  driverCatalog,
} from "../data/drivers.js";
export function assignTeam(race, save) {
  if (race.cars.length < 2 || race.cars[1].teamId !== race.cars[0].teamId)
    return;
  const c = race.cars[1],
    candidate = save.team.partner;
  const pilot =
    candidate !== save.selectedDriver &&
    save.unlockedDrivers.includes(candidate)
      ? candidate
      : c.driverId;
  c.driverId = pilot;
  c.name = driverCatalog[pilot].name + " · equipe";
  c.personality = pilotPersonality(pilot);
  c.stats = pilotStats(
    race.teamBaseStats || c.stats,
    pilot,
    race.mode,
    race.realism,
  );
  initializeResources(c, {
    laps: race.laps,
    realism: race.realism,
    weather: race.weather,
    tire: save.settings.tire,
  });
  c.teammate = true;
}
export function teamStandings(champ) {
  const teams = [
    { name: "Apex / Ember", ids: [0, 1], points: 0 },
    { name: "Azure / Solstice", ids: [2, 3], points: 0 },
    { name: "Verdant / Orion", ids: [4, 5], points: 0 },
  ];
  for (const result of champ.results)
    for (const [i, r] of result.entries()) {
      const t = teams.find((t) => t.ids.includes(r.id));
      t.points += r.points ?? [25, 18, 15, 12, 10, 8][i];
    }
  return teams.sort((a, b) => b.points - a.points);
}
