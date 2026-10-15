import { validPlan } from "./ManagerPlans.js";
const num = (x, min = 0, max = 1e7) =>
  Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : 0;
const text = (x, n = 240) => (typeof x === "string" ? x.slice(0, n) : "");
export function validateReport(v, maxDecisions = 120) {
  if (!v || typeof v !== "object" || typeof v.track !== "string") return null;
  return {
    track: text(v.track, 40),
    laps: num(v.laps, 1, 20),
    time: num(v.time),
    objective: ["drivers", "constructors", "both"].includes(v.objective)
      ? v.objective
      : "both",
    initial: (Array.isArray(v.initial) ? v.initial : [])
      .slice(0, 6)
      .map((x) => ({
        id: num(x?.id, 0, 5),
        driverId: num(x?.driverId, 0, 30),
        plan: validPlan(x?.plan),
      })),
    cars: (Array.isArray(v.cars) ? v.cars : [])
      .slice(0, 6)
      .map((x) => ({
        id: num(x?.id, 0, 5),
        driverId: num(x?.driverId, 0, 30),
        teamId: num(x?.teamId, 0, 5),
        stops: num(x?.stops, 0, 99),
        lastLap: num(x?.lastLap),
        health: num(x?.health, 0, 1),
        finalPlan: validPlan(x?.finalPlan),
        stints: (Array.isArray(x?.stints) ? x.stints : [])
          .slice(-20)
          .map((s) => ({
            compound: text(s?.compound, 12),
            distance: num(s?.distance),
            health: num(s?.health, 0, 1),
            lap: num(s?.lap, 0, 20),
          })),
        pitHistory: (Array.isArray(x?.pitHistory) ? x.pitHistory : [])
          .slice(-20)
          .map((p) => ({
            lap: num(p?.lap, 0, 20),
            service: num(p?.service),
            lane: num(p?.lane),
            compound: text(p?.compound, 12),
          })),
      })),
    decisions: (Array.isArray(v.decisions) ? v.decisions : [])
      .slice(-maxDecisions)
      .map((e) => ({
        id: num(e?.id),
        time: num(e?.time),
        car: num(e?.car, 0, 5),
        lap: num(e?.lap, 0, 21),
        type: text(e?.type, 40),
        detail: text(e?.detail),
      })),
  };
}
export function recordManager(g) {
  if (!g.race?.manager || g.lastManagerReport) return;
  const report = validateReport(g.race.manager.report());
  g.lastManagerReport = report;
  g.save.managerHistory = [...(g.save.managerHistory || []), report].slice(-12);
}
