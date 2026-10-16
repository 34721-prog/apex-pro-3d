import { standings } from "./championship.js";

export function generateRandomStartOrder() {
  const ids = [0, 1, 2, 3, 4, 5];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export function standingsStartOrder(save) {
  const champ = save?.championship;
  if (!champ || !Array.isArray(champ.results) || champ.results.length === 0)
    return null;
  const table = standings(champ);
  return table.map((r) => r.id).slice(0, 6);
}

export function resolveStartOrder(save) {
  const mode = save?.settings?.startOrderMode === "standings" ? "standings" : "random";
  if (mode === "standings") {
    const order = standingsStartOrder(save);
    if (order && order.length === 6) return order;
    // First race / no previous points: fall back to a stable random order.
    if (!save.settings.startOrder || save.settings.startOrder.length !== 6)
      save.settings.startOrder = generateRandomStartOrder();
    return [...save.settings.startOrder];
  }
  if (!save.settings.startOrder || save.settings.startOrder.length !== 6)
    save.settings.startOrder = generateRandomStartOrder();
  return [...save.settings.startOrder];
}
