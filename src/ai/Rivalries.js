export function updateBattles(race) {
  const order = race.physicalOrder().map((c) => c.id);
  if (race.previousOrder && race.time > 8 && race.flag === "green") {
    for (let i = 0; i < order.length; i++) {
      const id = order[i],
        old = race.previousOrder.indexOf(id);
      if (old > i) {
        for (const passed of race.previousOrder.slice(i, old)) {
          const a = race.cars.find((c) => c.id === id),
            b = race.cars.find((c) => c.id === passed);
          if (
            a &&
            !a.finished &&
            b &&
            !b.finished &&
            Math.abs(a.progress - b.progress) < 18
          ) {
            race.events.push({
              id: ++race.eventSerial,
              type: "overtake",
              detail: a.name + " ultrapassou " + b.name,
              by: id,
              against: passed,
              time: race.time,
            });
            race.control?.log(race.events.at(-1));
            a.overtakes = (a.overtakes || 0) + 1;
            if (a.ai) a.ai.lastBattle = race.time;
            if (b.ai) b.ai.lastBattle = race.time;
          }
        }
      }
    }
  }
  race.previousOrder = order;
  if (race.events.length > 150) race.events.splice(0, race.events.length - 150);
}
export function rememberRivals(save, race) {
  for (const e of race.events) {
    if (e.type !== "overtake" || (e.by !== 0 && e.against !== 0)) continue;
    const other = e.by === 0 ? e.against : e.by,
      c = race.cars.find((c) => c.id === other),
      id = c?.driverId ?? other;
    const entry = save.rivalries[id] || { score: 0, passed: 0, lost: 0 };
    if (e.by === 0) entry.passed++;
    else entry.lost++;
    entry.score = Math.min(10, entry.score + 0.25);
    save.rivalries[id] = entry;
  }
  const leader = race.standings()[0];
  if (leader?.id !== 0) {
    const id = leader.driverId ?? leader.id,
      entry = save.rivalries[id] || { score: 0, passed: 0, lost: 0 };
    entry.score = Math.min(10, entry.score + 0.5);
    save.rivalries[id] = entry;
  }
}
