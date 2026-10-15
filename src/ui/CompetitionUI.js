import {
  seriesCatalog,
  seriesById,
  sessionNames,
  careerTeams,
} from "../championships/Catalog.js";
import { table, constructors } from "../championships/Seasons.js";
import { rules, regulationProfiles } from "../regulations/RuleBook.js";
import { trackById } from "../data/tracks.js";
import { pitTeams } from "../strategy/PitLayout.js";
import { clock } from "./RaceHUD.js";
const esc = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const button = (label, action, extra = "") =>
  `<button class="btn secondary" data-action="${action}" ${extra}>${label}</button>`;
function evidence(d) {
  return Object.entries(d.evidence || {})
    .map(
      ([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(2) : String(v)}`,
    )
    .join(" · ");
}
function decisionTable(items) {
  return items.length
    ? `<div class="decision-list">${items.map((d) => `<article><b>${esc(d.rule)} · ${esc(d.reason)}</b><span>#${d.car} / S${d.sector} / ${clock(d.time)} · ${d.kind === "warning" ? "advertência" : d.kind === "dsq" ? "desclassificação" : d.kind === "return" ? "devolver posição" : d.kind === "grid" ? "queda de grid" : d.seconds + " s"} · ${esc(d.status)}</span><small>${esc(evidence(d))}</small></article>`).join("")}</div>`
    : '<p class="subtle">Nenhuma decisão dos comissários nesta sessão.</p>';
}
function journal(events) {
  return `<ol class="session-journal">${events
    .slice(-80)
    .reverse()
    .map(
      (e) =>
        `<li><time>${clock(e.time)}</time><b>${esc(e.type)}</b><span>${esc(typeof e.detail === "object" ? JSON.stringify(e.detail) : e.detail)}</span></li>`,
    )
    .join("")}</ol>`;
}
function official(results, type = "race") {
  return `<div class="result-table"><table><thead><tr><th>P</th><th>Piloto</th><th>Tempo / volta</th><th>Intervalo</th><th>Δ grid</th><th>Boxes</th><th>Pen.</th><th>Pts</th></tr></thead><tbody>${results.map((r) => `<tr class="${r.id === 0 ? "player-row" : ""}"><td>${r.position}</td><td>${esc(r.name)}<small>${pitTeams[r.teamId]?.name || ""}</small></td><td>${r.disqualified ? "DSQ" : r.finished ? clock(type === "race" ? r.time : r.bestLap) : "DNF"}<small>${clock(r.bestLap)}${r.medal ? " · " + r.medal.toUpperCase() : ""}</small></td><td>${r.finished && results[0].finished ? (r.position === 1 ? "—" : "+" + ((type === "race" ? r.time : r.bestLap) - (type === "race" ? results[0].time : results[0].bestLap)).toFixed(3)) : "—"}</td><td>${r.positionsGained ?? r.gridPosition - r.position}</td><td>${r.stops}</td><td>${r.penalty || 0}s</td><td>${r.points || 0}</td></tr>`).join("")}</tbody></table></div>`;
}
export function extendCompetitionUI(UI) {
  const header = UI.prototype.header;
  UI.prototype.header = function () {
    return (
      header.call(this) +
      `<nav class="competition-nav" aria-label="Mundo Apex"><button data-nav="competitions">Competições</button><button data-nav="operations">Modo carreira</button><button data-nav="calendar">Calendário</button><button data-action="league-open" data-id="time-attack">Time Attack</button><button data-nav="regulations">Regulamento</button><button data-nav="news">Notícias e sessões</button></nav>`
    );
  };
  UI.prototype.competitions = function () {
    const save = this.game.save,
      id = save.competitions.active,
      def = seriesById(id) || seriesCatalog[0],
      state = save.competitions.series[def.id],
      rep = save.career.reputation + save.stats.seasons * 3,
      rank = state ? table(state, def) : [],
      teams = state ? constructors(state, def) : [];
    return `${this.title("COMPETIÇÕES / TEMPORADAS", "Uma temporada. Um objetivo.", "Sete competições com calendários, formatos, carros e pontuações próprios. O campeonato legado permanece disponível.")}<div class="series-grid">${seriesCatalog
      .map((d) => {
        const st = save.competitions.series[d.id];
        return `<button class="series-card ${def.id === d.id ? "selected" : ""}" style="--series:${d.color}" data-action="league-open" data-id="${d.id}"><span class="series-mark">${d.code}</span><small>${d.category}</small><strong>${d.name}</strong><span>${d.tracks.length} etapas · ${d.laps} voltas · ${(d.stats.maxSpeed * 3.6) | 0} km/h</span><em>${st ? (st.complete ? "TEMPORADA CONCLUÍDA" : "CONTINUAR · ETAPA " + (st.round + 1)) : rep >= d.minRep ? "INSCRIÇÕES ABERTAS" : "REQUER " + d.minRep + " REPUTAÇÃO"}</em></button>`;
      })
      .join(
        "",
      )}</div><section class="series-detail panel"><div><span class="tag">${def.code} / ${def.category}</span><h2>${def.name}</h2><p>${def.description}</p><div class="series-facts"><span>FORMATO<b>${def.sessions.map((s) => sessionNames[s]).join(" → ")}</b></span><span>PONTOS<b>${def.points.join(" / ")}${def.fastest ? " + " + def.fastest + " volta rápida no top 3" : ""}</b></span><span>META<b>${{ top3: "Top 3 na temporada", finish: "Terminar todas as etapas", clean: "Temporada sem punição de tempo", stops: "Parar em todas as corridas", win: "Conquistar o título", medals: "Medalha em cada circuito" }[def.goal]}</b></span><span>PRÊMIO DA META<b>${def.reward} CR</b></span></div><p>Regulamento fiscalizado · limite de boxes 65 km/h · carros equivalentes dentro da categoria · desempate por pontos, melhores colocações e poles.</p><div class="setting-actions">${!state?.complete ? button(state ? "CONTINUAR / CHEFE DE EQUIPE" : "INICIAR / CHEFE DE EQUIPE", "league-start", `data-id="${def.id}" ${rep < def.minRep ? "disabled" : ""}`) : ""}${!state?.complete ? button("SIMULAR SESSÃO", "league-sim", `data-id="${def.id}" ${rep < def.minRep ? "disabled" : ""}`) : ""}${!state?.complete ? button("PILOTAR SESSÃO", "league-start", `data-id="${def.id}" data-drive="manual" ${rep < def.minRep ? "disabled" : ""}`) : button("NOVA TEMPORADA", "league-new", `data-id="${def.id}"`)}<button class="btn secondary" data-nav="management">PLANEJAR EQUIPE</button><button class="btn secondary" data-nav="calendar">CALENDÁRIO</button><button class="btn secondary" data-nav="regulations">REGRAS</button></div>${state && !state.complete ? `<p class="next-session">Próxima: ${trackById(def.tracks[state.round]).name} · ${sessionNames[def.sessions[state.phase]]}</p>` : ""}</div><aside><h3>Calendário</h3>${def.tracks.map((t, i) => `<div class="calendar-row ${state?.round === i ? "current" : ""}"><b>${String(i + 1).padStart(2, "0")}</b><span>${trackById(t).name}</span><small>${state?.results.some((r) => r.round === i) ? "CONCLUÍDA" : def.laps + " VOLTAS"}</small></div>`).join("")}</aside></section>${state ? `<div class="standings-pair"><section class="panel"><h3>Pilotos / temporada ${state.season}</h3>${rank.map((r, i) => `<div class="champ-row"><b>${i + 1}</b><span>${r.name}<small>${r.wins} vitórias · ${r.podiums} pódios · ${r.poles} poles · ${r.dnf} abandonos</small></span><strong>${r.points}</strong></div>`).join("")}</section><section class="panel"><h3>Construtores</h3>${teams.map((t, i) => `<div class="champ-row"><b>${i + 1}</b><span>${pitTeams[t.id].name}</span><strong>${t.points}</strong></div>`).join("")}<h3>Temporadas anteriores</h3>${state.history.length ? state.history.map((h) => `<p>T${h.season} · ${esc(h.standings[0]?.name || "—")} · ${h.standings[0]?.points || 0} pts</p>`).join("") : "<p>A primeira temporada está sendo escrita.</p>"}</section></div>` : ""}`;
  };
  UI.prototype.calendar = function () {
    const s = this.game.save,
      def = seriesById(s.competitions.active),
      state = s.competitions.series[def.id];
    return `${this.title("CALENDÁRIO / " + def.code, def.name)}<div class="calendar-page panel">${def.tracks
      .map(
        (id, i) =>
          `<section><h3>${i + 1}. ${trackById(id).name}</h3><p>${def.sessions.map((t) => sessionNames[t]).join(" → ")} · corrida de ${def.laps} voltas</p>${
            state?.sessions
              .filter((r) => r.round === i)
              .map(
                (r) =>
                  `<details><summary>${sessionNames[r.type]} · resultado oficial</summary>${official(r.results, r.type)}${decisionTable(r.decisions)}</details>`,
              )
              .join("") || '<span class="tag">SESSÕES PENDENTES</span>'
          }</section>`,
      )
      .join(
        "",
      )}</div><button class="btn primary" data-nav="competitions">VOLTAR À COMPETIÇÃO</button>`;
  };
  const career = UI.prototype.operations;
  UI.prototype.operations = function () {
    const c = this.game.save.career;
    return `${this.title("CARREIRA / CONSEQUÊNCIAS", "Construa sua trajetória.")}<section class="career-v05 panel"><div><small>REPUTAÇÃO</small><strong>${c.reputation}</strong></div><div><small>EQUIPE ATUAL</small><strong>${pitTeams[c.team].name}</strong></div><div><small>TREINO DE CONSISTÊNCIA</small><strong>${c.training}/5</strong><p>+2 pontos por nível ao piloto delegado nas novas competições; não altera a física de monomarca.</p>${button("TREINAR · 1.200 CR", "career-training")}</div><div><small>CONTRATOS DE EQUIPE</small>${careerTeams.map((t) => button(t.name + " · REP " + t.rep, "career-contract", `data-id="${t.id}" ${c.team === t.id ? "disabled" : ""}`)).join("")}<p>500 CR para mudar. Garagem/equipe/companheiro e nível de serviço mudam na próxima temporada.</p></div></section><section class="panel achievement-strip"><h3>Metas conquistadas</h3>${c.achievements.map((id) => `<span class="tag">${seriesById(id).code}</span>`).join("") || "Conclua os objetivos das competições."}<button class="btn primary" data-nav="competitions">ESCOLHER COMPETIÇÃO</button></section>${career.call(this)}`;
  };
  UI.prototype.regulations = function () {
    return `${this.title("DIREÇÃO DE PROVA", "Regras claras. Disputas justas.", "Regulamentos originais simplificados, inspirados em automobilismo. Não são reprodução integral da FIA.")}<section class="panel regulation-intro"><p>Amarela setorial: 101 km/h. Dupla amarela: 50 km/h. VSC: 83 km/h. SC: aproximação controlada até formar a fila; não ultrapasse até a linha de relargada. Azul: facilitar a passagem de quem está dando volta. Vermelha: suspensão de 12 s com posições/relógio congelados, seguida de VSC. Quadriculada: chegada. Preta e branca: advertência. Preta: desclassificação por reincidência grave.</p><p>Saídas sem vantagem e forçadas por contato não geram punição automática; a volta fica inválida para recordes. Culpa de colisão só é atribuída automaticamente quando há contato traseiro claro. Punições de tempo podem ser cumpridas ANTES do serviço. Dano/reparo e reabastecimento são regras fictícias destas categorias.</p><p>Queima de largada exige deslocamento real antes do verde; acelerar prematuramente pode mover o carro. Grid de corrida usa a classificação física; sanções de grid são aplicadas na preparação, nunca por teletransporte em prova.</p></section><div class="rule-grid">${Object.entries(
      rules,
    )
      .map(
        ([id, r]) =>
          `<article class="panel"><small>${id} · ${r.severity}</small><h3>${r.name}</h3><p>${r.message}</p><p>${r.condition}</p><small>Evidências: ${r.evidence.join(" / ")}</small><b>${r.seconds} s / advertência conforme perfil</b><p>Aplicação: ${r.when}</p></article>`,
      )
      .join(
        "",
      )}</div><p class="subtle">Sem GT com carroceria própria, fantasmas gravados ou pódio 3D nesta versão. Time Attack tem medalhas reais; pódios são apresentados no resultado oficial.</p>`;
  };
  UI.prototype.news = function () {
    const s = this.game.save;
    return `${this.title("PADDOCK / FATOS REGISTRADOS", "A história da sua temporada.")}<div class="news-list">${s.career.news.map((n) => `<article class="panel">${esc(n)}</article>`).join("") || "<p>Nenhuma sessão de campeonato concluída ainda.</p>"}</div>${Object.entries(
      s.competitions.series,
    )
      .map(
        ([id, st]) =>
          `<section class="panel session-history"><h3>${seriesById(id).name}</h3>${st.sessions
            .slice()
            .reverse()
            .map(
              (r) =>
                `<details><summary>${trackById(r.track).name} · ${sessionNames[r.type]} · ${clock(r.time)}</summary>${official(r.results, r.type)}${decisionTable(r.decisions)}${journal(r.events)}</details>`,
            )
            .join("")}</section>`,
      )
      .join("")}`;
  };
  const oldStats = UI.prototype.stats;
  UI.prototype.stats = function () {
    const rows = Object.entries(this.game.save.competitions.series)
      .flatMap(([id, st]) => [
        table(st, seriesById(id)).find((r) => r.id === 0),
        ...st.history.map((h) => h.standings.find((r) => r.id === 0)),
      ])
      .filter(Boolean);
    return (
      oldStats.call(this) +
      `<section class="panel league-stats"><h3>Novas competições / histórico de temporadas</h3>${[
        ["Poles", "poles"],
        ["Voltas mais rápidas", "fastest"],
        ["Abandonos", "dnf"],
      ]
        .map(
          ([name, key]) =>
            `<div><span>${name}</span><b>${rows.reduce((n, r) => n + (r[key] || 0), 0)}</b></div>`,
        )
        .join(
          "",
        )}<small>Inclui a temporada atual e até cinco temporadas anteriores por competição.</small></section>`
    );
  };
  const show = UI.prototype.showModal;
  UI.prototype.showModal = function (type) {
    const g = this.game;
    let content = "";
    if (type === "league-new")
      content = `<h2>Nova temporada?</h2><p>A temporada concluída será arquivada. Carreira, créditos, recordes e conquistas serão mantidos.</p>${button("CONFIRMAR NOVA TEMPORADA", "league-new-confirm")}${button("CANCELAR", "close")}`;
    if (type === "league-results") {
      const r = g.sessionReport,
        def = seriesById(g.launchContext.series);
      content = `<span class="tag">${def.code} / ${sessionNames[r.type]}</span><h2>${trackById(r.track).name}</h2>${
        r.type === "race"
          ? `<div class="session-podium">${r.results
              .slice(0, 3)
              .filter((p) => p.finished && !p.disqualified)
              .map(
                (p) =>
                  `<div><small>PÓDIO / ${p.position}º</small><strong>${esc(p.name)}</strong><span>${pitTeams[p.teamId].name}</span></div>`,
              )
              .join("")}</div>`
          : ""
      }${official(r.results, r.type)}<div class="session-highlights">${r.news.map((n) => `<p>${esc(n)}</p>`).join("")}</div><details><summary>Comissários e incidentes</summary>${decisionTable(r.decisions)}${journal(r.events)}</details><div class="setting-actions">${button("VER CAMPEONATO", "league-home")}${!g.save.competitions.series[def.id].complete ? button("PRÓXIMA SESSÃO", "league-next") : ""}</div>`;
    }
    if (type === "race-journal") {
      const c = g.race?.control;
      content = `<h2>Direção de prova / registro</h2>${c ? decisionTable(c.decisions) + journal(c.journal) : "<p>Nenhuma sessão ativa.</p>"}${button("VOLTAR", "journal-back")}`;
    }
    if (type === "league-results")
      content +=
        '<button class="btn secondary full-width" data-action="manager-review">RELATÓRIO · PLANO × EXECUÇÃO</button>';
    if (content) {
      this.closeModal();
      this.modal = type;
      const node = document.createElement("div");
      node.id = "modal";
      node.className = "modal-backdrop";
      node.innerHTML = `<section class="modal results-modal" role="dialog" aria-modal="true" aria-label="${type}">${content}</section>`;
      this.root.appendChild(node);
      return;
    }
    show.call(this, type);
    if (type === "results" && g.race?.control) {
      document
        .querySelector("#modal .modal")
        .insertAdjacentHTML(
          "beforeend",
          `<details class="session-review"><summary>RELATÓRIO / COMISSÁRIOS E ACONTECIMENTOS</summary>${decisionTable(g.race.control.decisions)}${journal(g.race.control.journal)}</details>`,
        );
    }
  };
}
