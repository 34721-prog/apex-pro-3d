import { validateReport } from "../strategy/ManagerHistory.js";
import { rememberRivals } from "../ai/Rivalries.js";
import { seriesCatalog, seriesById, careerDefaults } from "./Catalog.js";
import { driverCatalog } from "../data/drivers.js";
const clamp = (v, a, b, d = 0) =>
  Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : d;
export const competitionsDefaults = () => ({ active: "junior", series: {} });
export function beginSeason(save, id) {
  const def = seriesById(id);
  if (!def) throw Error("Competição desconhecida");
  if (save.career.reputation + save.stats.seasons * 3 < def.minRep)
    throw Error("Reputação insuficiente");
  const old = save.competitions.series[id];
  if (old && !old.complete) return old;
  const history = old
    ? [
        ...(old.history || []),
        {
          season: old.season,
          standings: table(old, def),
          teamStandings: constructors(old, def),
          champion: table(old, def)[0]?.driverId,
          rounds: old.results.map((r) => ({
            track: r.track,
            results: r.results,
          })),
        },
      ].slice(-5)
    : [];
  const roster = def.roster || [
    save.selectedDriver,
    ...driverCatalog
      .filter((d) => d.id !== save.selectedDriver && d.id < 10)
      .slice(0, 5)
      .map((d) => d.id),
  ];
  const team = save.career.team,
    teams = [
      team,
      team,
      (team + 2) % 6,
      (team + 2) % 6,
      (team + 4) % 6,
      (team + 4) % 6,
    ];
  const state = {
    season: (old?.season || 0) + 1,
    round: 0,
    phase: 0,
    complete: false,
    roster: roster.slice(0, id === "time-attack" ? 1 : 6),
    teams,
    results: [],
    sessions: [],
    history,
    records: { ...(old?.records || {}) },
    objectivePaid: false,
  };
  save.competitions.series[id] = state;
  save.competitions.active = id;
  return state;
}
export function sessionConfig(save, id) {
  const def = seriesById(id),
    state = save.competitions.series[id];
  if (!def || !state || state.complete) return null;
  const type = def.sessions[state.phase],
    qual = state.sessions.findLast(
      (s) => s.round === state.round && s.type === "qualifying",
    );
  let order = qual
    ? qual.results
        .slice()
        .sort((a, b) => (a.bestLap ?? Infinity) - (b.bestLap ?? Infinity))
        .map((r) => r.id)
    : state.roster.map((_, i) => i);
  // Grid drops from previous session are applied before staging, never mid-race.
  const penalties = state.sessions
    .filter((s) => s.round === state.round)
    .flatMap((s) => s.decisions || [])
    .filter((d) => d.kind === "grid");
  for (const p of penalties) {
    const i = order.indexOf(p.car);
    if (i >= 0) {
      order.splice(i, 1);
      order.splice(Math.min(order.length, i + 3), 0, p.car);
    }
  }
  return {
    id: `${id}:${state.season}:${state.round}:${type}`,
    series: id,
    round: state.round,
    type,
    track: def.tracks[state.round],
    options: {
      delegated: true,
      sessionType: type,
      laps:
        type === "practice"
          ? 1
          : type === "qualifying"
            ? id === "sprint"
              ? 1
              : 2
            : def.laps,
      mode: id === "time-attack" ? "time-trial" : "manager",
      botCount: state.roster.length - 1,
      realism: "realistic",
      weather: "dry",
      weatherProgram: type === "race" ? def.weather : "fixed",
      mechanicalRate: type === "race" && id === "endurance" ? 0.02 : 0,
      seed: state.season * 101 + state.round * 17,
      ruleSet: id === "junior" ? "junior" : "formula",
      gridOrder: type === "race" ? order : state.roster.map((_, i) => i),
      roster: state.roster,
      teamIds: state.teams,
      specStats: def.stats,
      modelIndex: def.model,
      training: save.career.training,
    },
  };
}
export function table(state, def) {
  const rows = state.roster.map((driverId, id) => ({
    id,
    driverId,
    name: driverCatalog[driverId].name,
    teamId: state.teams[id],
    points: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    fastest: 0,
    dnf: 0,
    finishes: [0, 0, 0, 0, 0, 0],
  }));
  for (const round of state.results)
    for (const result of round.results) {
      const row = rows[result.id];
      if (!row) continue;
      row.points += result.points || 0;
      row.wins +=
        def.id !== "time-attack" && result.position === 1 && result.finished
          ? 1
          : 0;
      row.podiums +=
        def.id !== "time-attack" && result.position <= 3 && result.finished
          ? 1
          : 0;
      row.dnf += !result.finished ? 1 : 0;
      row.fastest += result.fastest ? 1 : 0;
      row.finishes[result.position - 1]++;
    }
  for (const s of state.sessions)
    if (s.type === "qualifying" && s.results[0]?.bestLap)
      rows[s.pole ?? s.results[0].id].poles++;
  return rows.sort((a, b) => {
    let delta = b.points - a.points;
    for (let i = 0; i < 6 && !delta; i++) delta = b.finishes[i] - a.finishes[i];
    return delta || b.poles - a.poles || a.id - b.id;
  });
}
export function constructors(state, def) {
  const teams = new Map();
  for (const d of table(state, def)) {
    const t = teams.get(d.teamId) || { id: d.teamId, points: 0, wins: 0 };
    t.points += d.points;
    t.wins += d.wins;
    teams.set(d.teamId, t);
  }
  return [...teams.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.id - b.id,
  );
}
export function medal(time, trackLength, maxSpeed) {
  if (!time) return null;
  return time <= trackLength / (maxSpeed * 0.67)
    ? "ouro"
    : time <= trackLength / (maxSpeed * 0.57)
      ? "prata"
      : time <= trackLength / (maxSpeed * 0.47)
        ? "bronze"
        : null;
}
export function recordSession(save, race, context) {
  const def = seriesById(context.series),
    state = save.competitions.series[context.series];
  if (
    !def ||
    !state ||
    !race.done ||
    state.sessions.some((s) => s.id === context.id)
  )
    return null;
  const results = race.results().map((r) => ({
      ...r,
      points: 0,
      positionsGained: (r.gridPosition || r.position) - r.position,
    })),
    legalFast = results
      .filter((r) => r.finished && !r.disqualified && r.bestLap)
      .sort((a, b) => a.bestLap - b.bestLap)[0];
  if (context.type === "race")
    for (const r of results) {
      r.fastest = r.id === legalFast?.id;
      r.points =
        r.finished && !r.disqualified
          ? (def.points[r.position - 1] || 0) +
            (r.fastest && r.position <= 3 ? def.fastest : 0)
          : 0;
    }
  if (context.type === "time-attack") {
    results[0].medal = medal(
      results[0].bestLap,
      race.trackLength,
      def.stats.maxSpeed,
    );
    results[0].points =
      results[0].medal === "ouro"
        ? 10
        : results[0].medal === "prata"
          ? 6
          : results[0].medal === "bronze"
            ? 3
            : 0;
  }
  const report = {
    id: context.id,
    round: state.round,
    type: context.type,
    track: race.trackId,
    time: race.time,
    results,
    decisions: race.control.decisions.slice(-80),
    events: race.control.journal.slice(-80),
    weather: race.control.weather.condition,
    news: [],
    strategy: race.manager ? validateReport(race.manager.report(), 40) : null,
  };
  const winner = results[0],
    player = results.find((r) => r.id === 0);
  report.news.push(
    `${winner.name}: ${context.type === "qualifying" ? "melhor tempo de classificação" : context.type === "practice" ? "melhor tempo do treino" : context.type === "time-attack" ? "desafio concluído" : "primeiro no resultado oficial"}${winner.bestLap ? " · volta " + winner.bestLap.toFixed(3) + " s" : ""}.`,
  );
  if (player.positionsGained > 0)
    report.news.push(
      `Seu carro ganhou ${player.positionsGained} posições em relação ao grid.`,
    );
  if (player.stops)
    report.news.push(`Seu carro realizou ${player.stops} paradas.`);
  if (report.decisions.length)
    report.news.push(
      `${report.decisions.length} decisões dos comissários registradas.`,
    );
  for (const r of results)
    if (r.retirement)
      report.news.push(`${r.name}: abandono — ${r.retirement}.`);
  if (context.type === "qualifying" && results.some((r) => r.bestLap)) {
    const grid = results.map((r) => r.id);
    for (const d of report.decisions.filter((d) => d.kind === "grid")) {
      const i = grid.indexOf(d.car);
      if (i >= 0) {
        grid.splice(i, 1);
        grid.splice(Math.min(grid.length, i + 3), 0, d.car);
      }
    }
    report.pole = grid[0];
  }
  state.sessions.push(report);
  state.sessions = state.sessions.slice(-24);
  if (context.type === "race" || context.type === "time-attack") {
    if (context.type === "race") rememberRivals(save, race);
    state.results.push(report);
    save.career.reputation += player.finished ? 1 : 0;
    save.credits += player.finished ? 400 + (7 - player.position) * 80 : 80;
    save.xp += player.finished ? 150 : 20;
    save.stats.races += player.finished ? 1 : 0;
    if (context.type === "race" && player.finished) {
      save.stats.wins += player.position === 1 ? 1 : 0;
      save.stats.podiums += player.position <= 3 ? 1 : 0;
    }
    save.stats.laps += race.cars[0].lap;
    save.stats.distance += Math.round(Math.max(0, race.cars[0].progress));
    const recordKey = race.trackId + ":" + (race.weatherProgram || "fixed");
    if (
      player.bestLap &&
      (!save.stats.bestLap || player.bestLap < save.stats.bestLap)
    )
      save.stats.bestLap = player.bestLap;
    if (
      player.bestLap &&
      (!state.records[recordKey] || player.bestLap < state.records[recordKey])
    )
      state.records[recordKey] = player.bestLap;
  }
  state.phase++;
  if (state.phase >= def.sessions.length) {
    state.phase = 0;
    state.round++;
  }
  if (state.round >= def.tracks.length) {
    state.complete = true;
    if (def.id !== "time-attack") save.stats.seasons++;
    const standings = table(state, def),
      champion = standings[0];
    report.news.push(
      def.id === "time-attack"
        ? `Roteiro concluído: ${state.results.filter((r) => r.results[0].medal).length} medalhas.`
        : `Campeão da temporada ${state.season}: ${champion.name}.`,
    );
    const clean = state.sessions.every(
      (s) => !s.decisions.some((d) => d.car === 0 && d.kind === "time"),
    );
    const goal =
      def.goal === "finish"
        ? state.results.every(
            (r) => r.results.find((c) => c.id === 0)?.finished,
          )
        : def.goal === "clean"
          ? clean
          : def.goal === "stops"
            ? state.results.every(
                (r) => r.results.find((c) => c.id === 0)?.stops > 0,
              )
            : def.goal === "medals"
              ? state.results.every((r) => r.results[0].medal)
              : def.goal === "win"
                ? champion.id === 0
                : standings.findIndex((c) => c.id === 0) < 3;
    if (!state.objectivePaid) {
      state.objectivePaid = true;
      const reward = goal ? def.reward : Math.round(def.reward * 0.35);
      save.credits += reward;
      save.career.reputation += goal ? 3 : 1;
      report.news.push(
        `${goal ? "Meta alcançada" : "Temporada concluída"} · ${reward} CR.`,
      );
      if (goal && !save.career.achievements.includes(def.id))
        save.career.achievements.push(def.id);
    }
  }
  save.career.news = [...report.news, ...save.career.news].slice(0, 30);
  return report;
}
export function validateCompetitionData(raw = {}, career = {}) {
  const clean = competitionsDefaults(),
    c = careerDefaults();
  c.reputation = Math.floor(clamp(career?.reputation, 0, 9999));
  c.team = [0, 2, 4].includes(career?.team) ? career.team : 0;
  c.training = Math.floor(clamp(career?.training, 0, 5));
  c.achievements = Array.isArray(career?.achievements)
    ? [...new Set(career.achievements.filter((id) => seriesById(id)))]
    : [];
  c.news = Array.isArray(career?.news)
    ? career.news
        .filter((x) => typeof x === "string")
        .slice(0, 30)
        .map((x) => x.slice(0, 240))
    : [];
  c.contracts = Array.isArray(career?.contracts)
    ? career.contracts
        .slice(-10)
        .filter((x) => x && [0, 2, 4].includes(x.team))
        .map((x) => ({
          team: x.team,
          reputation: clamp(x.reputation, 0, 9999),
        }))
    : [];
  if (seriesById(raw?.active)) clean.active = raw.active;
  const result = (r) => ({
    id: Math.floor(clamp(r.id, 0, 5)),
    driverId: Math.floor(clamp(r.driverId, 0, 30)),
    teamId: Math.floor(clamp(r.teamId, 0, 5)),
    name: String(r.name || "Piloto").slice(0, 70),
    position: Math.floor(clamp(r.position, 1, 6, 6)),
    time: r.time == null ? null : clamp(r.time, 0, 1e7),
    penalty: clamp(r.penalty, 0, 10000),
    bestLap: r.bestLap == null ? null : clamp(r.bestLap, 5, 10000),
    finished: r.finished === true,
    points: clamp(r.points, 0, 40),
    stops: clamp(r.stops, 0, 100),
    pitSeconds: clamp(r.pitSeconds, 0, 10000),
    serviceSeconds: clamp(r.serviceSeconds, 0, 10000),
    gridPosition: Math.floor(clamp(r.gridPosition, 1, 6, 6)),
    retirement: r.retirement ? String(r.retirement).slice(0, 100) : null,
    disqualified: r.disqualified === true,
    positionsGained: clamp(r.positionsGained, -5, 5),
    fastest: r.fastest === true,
    ...(["ouro", "prata", "bronze"].includes(r.medal)
      ? { medal: r.medal }
      : {}),
  });
  for (const def of seriesCatalog) {
    const value = raw?.series?.[def.id];
    if (!value || !Array.isArray(value.roster) || !value.roster.length)
      continue;
    const state = {
      season: Math.floor(clamp(value.season, 1, 10000, 1)),
      round: Math.floor(clamp(value.round, 0, def.tracks.length)),
      phase: Math.floor(clamp(value.phase, 0, def.sessions.length - 1)),
      complete: value.complete === true,
      roster: value.roster
        .slice(0, def.id === "time-attack" ? 1 : 6)
        .map((v) => Math.floor(clamp(v, 0, 30))),
      teams: Array.from({ length: 6 }, (_, i) =>
        Math.floor(clamp(value.teams?.[i], 0, 5)),
      ),
      results: [],
      sessions: [],
      history: [],
      records: {},
      objectivePaid: value.objectivePaid === true,
    };
    const seen = new Set(),
      slots = new Set();
    for (const s of (Array.isArray(value.sessions) ? value.sessions : []).slice(
      -24,
    )) {
      if (
        !s ||
        typeof s.id !== "string" ||
        seen.has(s.id) ||
        !def.sessions.includes(s.type) ||
        !def.tracks.includes(s.track) ||
        !Array.isArray(s.results) ||
        s.results.length !== state.roster.length ||
        !s.results.every(
          (r) =>
            r &&
            Number.isInteger(r.id) &&
            r.id >= 0 &&
            r.id < state.roster.length,
        ) ||
        new Set(s.results.map((r) => r?.id)).size !== s.results.length
      )
        continue;
      const slot = s.round + ":" + s.type;
      if (slots.has(slot)) continue;
      slots.add(slot);
      seen.add(s.id);
      const report = {
        id: s.id.slice(0, 100),
        round: Math.floor(clamp(s.round, 0, def.tracks.length - 1)),
        type: s.type,
        track: s.track,
        time: clamp(s.time, 0, 1e7),
        results: s.results.map(result),
        decisions: [],
        events: [],
        news: [],
        strategy: validateReport(s.strategy, 40),
        weather: String(s.weather || "seca").slice(0, 20),
        ...(Number.isInteger(s.pole) &&
        s.pole >= 0 &&
        s.pole < state.roster.length
          ? { pole: s.pole }
          : {}),
      };
      // Bounded, JSON-only evidence. No executable code or DOM interpolation.
      for (const key of ["decisions", "events"])
        if (Array.isArray(s[key]))
          report[key] = s[key]
            .slice(-80)
            .map((e) => JSON.parse(JSON.stringify(e)))
            .filter(
              (e) =>
                e && typeof e === "object" && JSON.stringify(e).length < 2500,
            );
      report.news = Array.isArray(s.news)
        ? s.news
            .filter((x) => typeof x === "string")
            .slice(0, 15)
            .map((x) => x.slice(0, 240))
        : [];
      state.sessions.push(report);
      if (s.type === "race" || s.type === "time-attack")
        state.results.push(report);
    }
    for (const [key, time] of Object.entries(value.records || {}))
      if (
        def.tracks.some((t) => key.startsWith(t + ":")) &&
        Number.isFinite(time) &&
        time > 5 &&
        time < 10000
      )
        state.records[key] = time;
    if (Array.isArray(value.history))
      state.history = value.history
        .slice(-5)
        .filter((h) => h && Number.isInteger(h.season))
        .map((h) => ({
          season: Math.floor(clamp(h.season, 1, 10000)),
          champion: Math.floor(clamp(h.champion, 0, 30)),
          standings: Array.isArray(h.standings)
            ? h.standings.slice(0, 6).map((d) => ({
                id: Math.floor(clamp(d.id, 0, 5)),
                driverId: Math.floor(clamp(d.driverId, 0, 30)),
                name: String(d.name || "Piloto").slice(0, 70),
                points: clamp(d.points, 0, 10000),
                wins: clamp(d.wins, 0, 100),
                podiums: clamp(d.podiums, 0, 100),
                poles: clamp(d.poles, 0, 100),
                fastest: clamp(d.fastest, 0, 100),
                dnf: clamp(d.dnf, 0, 100),
              }))
            : [],
          rounds: Array.isArray(h.rounds)
            ? h.rounds
                .slice(0, 12)
                .filter(
                  (r) =>
                    r &&
                    def.tracks.includes(r.track) &&
                    Array.isArray(r.results),
                )
                .map((r) => ({
                  track: r.track,
                  results: r.results
                    .filter((v) => v && Number.isInteger(v.id))
                    .slice(0, 6)
                    .map(result),
                }))
            : [],
          teamStandings: Array.isArray(h.teamStandings)
            ? h.teamStandings.slice(0, 3).map((t) => ({
                id: Math.floor(clamp(t.id, 0, 5)),
                points: clamp(t.points, 0, 20000),
                wins: clamp(t.wins, 0, 100),
              }))
            : [],
        }));
    // Derive current round from recorded sessions rather than trusting arbitrary progress.
    const last = state.sessions.at(-1);
    if (last) {
      state.round = last.round;
      state.phase = def.sessions.indexOf(last.type) + 1;
      if (state.phase === def.sessions.length) {
        state.phase = 0;
        state.round++;
      }
    } else {
      state.round = 0;
      state.phase = 0;
    }
    state.complete = state.round >= def.tracks.length;
    clean.series[def.id] = state;
  }
  return { competitions: clean, career: c };
}
