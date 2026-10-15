import { unlock } from "../progression.js";
import {
  beginSeason,
  sessionConfig,
  recordSession,
} from "../championships/Seasons.js";
import { seriesById, careerTeams } from "../championships/Catalog.js";
export async function launchCompetition(g, id, delegate = true, fast = false) {
  try {
    const def = seriesById(id);
    if (!def) return;
    let state = g.save.competitions.series[id];
    if (!state) state = beginSeason(g.save, id);
    if (state.complete) {
      g.ui.toast(
        "Temporada concluída. Inicie uma nova na página da competição.",
      );
      return;
    }
    g.save.competitions.active = id;
    const context = sessionConfig(g.save, id);
    context.options.mode =
      id === "time-attack" ? "time-trial" : delegate ? "manager" : "quick";
    context.options.delegated = delegate;
    context.fast = fast;
    context.managerPoints = {};
    for (const round of state.results)
      for (const row of round.results)
        context.managerPoints[row.id] =
          (context.managerPoints[row.id] || 0) + (row.points || 0);
    g.launchContext = context;
    g.race = null;
    g.ui.closeModal();
    const loaded = await g.loadTrack(context.track);
    if (loaded) {
      g.start(false);
      g.world.raceContext = g.race;
    }
    g.store();
  } catch (e) {
    g.ui.toast(e.message);
  }
}
export function competitionAction(g, action, data) {
  const s = g.save,
    ui = g.ui;
  switch (action) {
    case "league-open":
      s.competitions.active = data.id;
      g.store();
      ui.navigate("competitions");
      return true;
    case "league-sim":
      launchCompetition(g, data.id, true, true);
      return true;
    case "league-start":
      launchCompetition(g, data.id, data.drive !== "manual");
      return true;
    case "league-new":
      s.competitions.active = data.id;
      ui.showModal("league-new");
      return true;
    case "league-new-confirm":
      try {
        beginSeason(s, s.competitions.active);
        g.store();
        ui.closeModal();
        ui.navigate("competitions");
      } catch (e) {
        ui.toast(e.message);
      }
      return true;
    case "league-next":
      launchCompetition(
        g,
        s.competitions.active,
        g.launchContext?.options.mode !== "quick",
        !!g.launchContext?.fast,
      );
      return true;
    case "league-home":
      g.race = null;
      g.launchContext = null;
      ui.closeModal();
      ui.navigate("competitions");
      return true;
    case "race-journal":
      if (
        g.race &&
        !g.race.isDelegated() &&
        !["paused", "results"].includes(g.race.state)
      )
        g.pause(true);
      ui.showModal("race-journal");
      return true;
    case "journal-back":
      if (g.race?.done)
        ui.showModal(g.launchContext ? "league-results" : "results");
      else if (g.race?.state === "paused") g.pause();
      else ui.closeModal();
      return true;
    case "team-order":
      if (g.race) {
        g.race.teamOrder = data.order;
        ui.toast(
          "Ordem de equipe: " +
            {
              race: "disputa livre",
              protect: "proteger posição",
              yield: "ceder ao carro principal",
            }[data.order],
        );
      }
      return true;
    case "career-contract": {
      const t = careerTeams.find((t) => t.id === Number(data.id));
      if (!t || s.career.team === t.id) return true;
      if (s.career.reputation < t.rep || s.credits < 500) {
        ui.toast("Requer " + t.rep + " de reputação e 500 CR.");
        return true;
      }
      s.credits -= 500;
      s.career.team = t.id;
      s.career.contracts.push({ team: t.id, reputation: s.career.reputation });
      s.career.contracts = s.career.contracts.slice(-10);
      g.store();
      ui.render();
      return true;
    }
    case "career-training":
      if (s.credits >= 1200 && s.career.training < 5) {
        s.credits -= 1200;
        s.career.training++;
        g.store();
        ui.render();
      } else ui.toast("Requer 1.200 CR; limite de 5 níveis.");
      return true;
    case "incident-vsc":
    case "incident-sc":
    case "incident-red":
      if (g.admin.active && g.race) {
        g.race.control.neutralize(
          action.split("-").at(-1),
          "Intervenção de teste do laboratório",
        );
        ui.toast("Intervenção registrada como teste administrativo.");
      }
      return true;
    default:
      return false;
  }
}
export function finishCompetition(g) {
  const report = recordSession(g.save, g.race, g.launchContext);
  if (report) report.news.push(...unlock(g.save));
  g.sessionReport =
    report ||
    g.save.competitions.series[g.launchContext.series].sessions.find(
      (s) => s.id === g.launchContext.id,
    );
  g.lastReward = {
    credits: 0,
    position: g.race.results().find((r) => r.id === 0).position,
    messages: [],
    results: g.race.results(),
  };
  g.store();
  g.ui.showModal("league-results");
}
