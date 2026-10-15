import {
  planDefaults,
  validPlan,
  paceNames,
  applySetup,
} from "../strategy/ManagerPlans.js";
import { estimateStrategy } from "../strategy/StrategyEstimator.js";
import { compounds, initializeResources } from "../strategy/Resources.js";
import {
  driverCatalog,
  pilotStats,
  pilotPersonality,
} from "../data/drivers.js";
import { performance as carStats } from "../garage.js";
import { activeTrack } from "../track.js";
export const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const time = (n) =>
  `${Math.floor(n / 60)}:${Math.round(n % 60)
    .toString()
    .padStart(2, "0")}`;
const tires = Object.entries(compounds).map(([k, v]) => [k, v.label]);
const select = (id, key, label, options, value, extra = "") =>
  `<label>${label}<select data-manager-car="${id}" data-manager-field="${key}" aria-label="${label} · carro ${id + 1}" ${extra}>${options.map(([v, t]) => `<option value="${v}" ${String(v) === String(value) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
function preview(g, slot, p) {
  const s = g.save,
    driver =
      slot === 0
        ? s.selectedDriver
        : s.team.partner !== s.selectedDriver
          ? s.team.partner
          : 1,
    c = {
      id: slot,
      driverId: driver,
      stats: applySetup(
        pilotStats(carStats(s), driver, s.settings.mode, s.settings.realism),
        p.setup,
      ),
      personality: pilotPersonality(driver),
      managerPlan: p,
      damage: 0,
      speed: 0,
      lap: 0,
    };
  initializeResources(c, { ...s.settings, tire: p.start });
  return c;
}
function card(g, slot, c, live) {
  const p = live
      ? c.managerPlan
      : validPlan(
          g.save.settings.managerPlans[slot] || planDefaults(),
          g.save.settings.laps,
        ),
    id = live ? c.id : slot;
  c = c || preview(g, slot, p);
  const r = live
      ? g.race
      : { laps: g.save.settings.laps, difficulty: g.save.settings.difficulty },
    e = estimateStrategy(c, p, r);
  return `<article class="manager-driver" data-manager-card="${id}"><header><span class="manager-number">0${slot + 1}</span><div><small>${live ? "COMANDO DE EQUIPE" : "PLANEJAMENTO INDIVIDUAL"}</small><h3>${esc(driverCatalog[c.driverId].name)}</h3></div>${live ? `<button data-action="manager-focus" data-id="${id}">ACOMPANHAR</button>` : ""}</header><output data-manager-status="${id}">${live ? "Aguardando telemetria…" : "Plano salvo para a próxima sessão"}</output><div class="manager-fields">
 ${select(id, "pace", "Ritmo", Object.entries(paceNames), p.pace)}
 ${select(
   id,
   "overtake",
   "Ultrapassagens",
   [
     ["conservative", "Conservadoras"],
     ["balanced", "Equilibradas"],
     ["aggressive", "Agressivas"],
     ["very-aggressive", "Alta iniciativa"],
   ],
   p.overtake,
 )}
 ${select(
   id,
   "defense",
   "Defesa",
   [
     ["conservative", "Conservadora"],
     ["balanced", "Equilibrada"],
     ["aggressive", "Ativa"],
     ["hold", "Priorizar posição"],
     ["exit", "Saída da curva"],
     ["avoid", "Prioridade à segurança"],
   ],
   p.defense,
 )}
 ${select(
   id,
   "tireCare",
   "Gestão de pneus",
   [
     ["normal", "Normal"],
     ["save", "Prolongar stint"],
     ["temperature", "Resfriar se >100 °C"],
   ],
   p.tireCare,
 )}
 ${select(
   id,
   "fuel",
   "Combustível",
   [
     ["normal", "Normal"],
     ["save", "Conservar"],
   ],
   p.fuel,
   c.realism === "realistic"
     ? ""
     : 'disabled title="Consumo assistido no Arcade"',
 )}
 ${select(id, "avoid", "Evitar disputa", [[-1, "Sem rival específico"], ...[0, 1, 2, 3, 4, 5].filter((n) => n !== id).map((n) => [n, "Carro " + (n + 1)])], p.avoid)}
 </div><details class="manager-plan"><summary>PLANO DE PNEUS E PARADAS</summary><div class="manager-fields">
 ${select(id, "start", "Composto inicial", tires, p.start, live ? "disabled" : "")}
 ${select(
   id,
   "setup",
   "Configuração",
   [
     ["balanced", "Equilibrada"],
     ["downforce", "Mais apoio · menor máxima"],
     ["low-drag", "Menos arrasto · menos aderência"],
   ],
   p.setup,
   live ? "disabled" : "",
 )}
 ${select(
   id,
   "stopCount",
   "Paradas previstas",
   [0, 1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]),
   p.stops.length,
 )}
 ${select(
   id,
   "automatic",
   "Assistente estratégico",
   [
     ["true", "Autorizar recomendações"],
     ["false", "Somente avisar / seguir janelas"],
   ],
   p.automatic,
 )}
 ${select(
   id,
   "rain",
   "Plano para chuva",
   [
     ["auto", "Adaptar aos dados atuais"],
     ["ask", "Aguardar minha decisão"],
   ],
   p.rain,
 )}
 ${select(
   id,
   "safety",
   "Safety Car / VSC",
   [
     ["opportunity", "Avaliar parada"],
     ["hold", "Manter plano"],
   ],
   p.safety,
 )}
 </div>${p.stops.map((w, n) => `<div class="manager-window"><b>PARADA ${n + 1}</b><label>De<input type="number" aria-label="Janela inicial ${n + 1} · carro ${id + 1}" min="1" max="19" value="${w.from}" data-manager-car="${id}" data-manager-stop="${n}" data-manager-window="from"></label><label>Até<input type="number" aria-label="Janela final ${n + 1} · carro ${id + 1}" min="1" max="19" value="${w.to}" data-manager-car="${id}" data-manager-stop="${n}" data-manager-window="to"></label><label>Composto<select data-manager-car="${id}" data-manager-stop="${n}" data-manager-window="compound">${tires.map(([v, t]) => `<option value="${v}" ${w.compound === v ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>`).join("")}
 <p class="manager-estimate">${live ? "Modelo de referência do plano" : "Estimativa em ar livre"}: <b>~${time(e.total)}</b> · ${e.stops} parada(s). Perda estimada nos boxes: <b>${e.pitLoss.toFixed(1)} s</b>.<br>${esc(e.risk.join(" · ") || "Sem alerta crítico no modelo")}<small>${esc(e.model)}. Filas, incidentes, clima futuro e rivais podem alterar o resultado.</small></p></details>
 ${live ? `<div class="manager-pit-controls">${select(id, "nextCompound", "Próximo composto", tires, c.pit.compound)}<button data-action="manager-pit" data-id="${id}">BOX AGORA</button><button data-action="manager-defer" data-id="${id}">ADIAR 1 VOLTA</button><button data-action="manager-cancel" data-id="${id}">CANCELAR</button></div><aside class="manager-advice"><b>ENGENHEIRO</b><p data-manager-advice="${id}">Analisando situação real…</p><button data-action="manager-accept" data-id="${id}" disabled>APLICAR RECOMENDAÇÃO</button></aside>` : ""}</article>`;
}
export function managerPanel(g, live = false) {
  const own = live ? g.race.cars.filter((c) => g.race.manager?.owns(c)) : [];
  return `<details class="race-strategy manager-central ${live ? "" : "strategy-preset"}" ${!live || g.race.isDelegated() || g.save.settings.strategyOpen ? "open" : ""}><summary>CENTRAL DE ESTRATÉGIA <span>● ${live ? "AO VIVO" : "PRÉ-CORRIDA"}</span></summary><div class="manager-body"><p class="manager-lead">${live ? "A prova continua enquanto você comanda. Pedais só são usados no modo manual explícito." : "Dois pilotos, dois planos. " + esc(activeTrack.name) + ": referência do circuito e carro selecionados. Campeonatos recalculam a situação na sessão."}</p><label>OBJETIVO DA EQUIPE<select data-manager-objective><option value="both" ${(live ? g.race.manager?.objective : g.save.settings.managerObjective) === "both" ? "selected" : ""}>Pilotos + construtores</option><option value="drivers" ${(live ? g.race.manager?.objective : g.save.settings.managerObjective) === "drivers" ? "selected" : ""}>Pilotos · priorizar um piloto</option><option value="constructors" ${(live ? g.race.manager?.objective : g.save.settings.managerObjective) === "constructors" ? "selected" : ""}>Construtores · evitar riscos internos</option></select></label>${
    live
      ? `<label>PILOTO PRIORITÁRIO<select data-manager-priority>${own.map((c) => `<option value="${c.id}" ${g.race.manager.priorityId === c.id ? "selected" : ""}>C${c.id + 1} · ${esc(driverCatalog[c.driverId].name)}</option>`).join("")}</select></label><label>ORDENS DE EQUIPE<select data-team-order>${[
          ["race", "Disputa livre"],
          ["protect", "Evitar riscos entre companheiros"],
          ["yield", "Ceder ao piloto prioritário"],
        ]
          .map(
            ([v, t]) =>
              `<option value="${v}" ${g.race.teamOrder === v ? "selected" : ""}>${t}</option>`,
          )
          .join(
            "",
          )}</select></label><p class="manager-note">Prioridade atual: carro ${(g.race.manager?.priorityId ?? 0) + 1}. Não ignora bandeiras, tráfego ou limites físicos.</p>`
      : ""
  }
 <div class="manager-snapshots">${live ? own.map((c) => `<p data-manager-overview="${c.id}">C${c.id + 1} · ${esc(driverCatalog[c.driverId].name)}</p>`).join("") : ""}</div><div class="manager-cards">${live ? own.map((c, i) => card(g, i, c, true)).join("") : [0, 1].map((i) => card(g, i, null, false)).join("")}</div>${live ? "<details><summary>DECISÕES E RIVAIS</summary><div data-manager-journal></div></details>" : '<p class="manager-note">O composto de largada e a configuração são fixados ao iniciar. Planos de até seis paradas; cada janela é limitada à duração real da sessão. Não há sistema de energia/ERS neste modelo.</p>'}</div></details>`;
}
export function managerHistory(g) {
  const reports = g.save.managerHistory || [];
  return `<section class="manager-history"><h2>Plano × execução</h2>${
    reports.length
      ? reports
          .slice()
          .reverse()
          .map(
            (r) =>
              `<details><summary>${esc(r.track)} · ${r.laps} voltas · ${time(r.time)}</summary><div class="manager-report">${r.initial
                .map((p) => {
                  const c = r.cars.find((c) => c.id === p.id);
                  return `<p><b>Carro ${p.id + 1}</b>: plano ${p.plan.start}, ${p.plan.stops.length} paradas → ${c?.stops || 0} realizadas, pneu ${Math.round((c?.health || 0) * 100)}%. Stints: ${(c?.stints || []).map((s) => esc(s.compound) + " " + (s.distance / 1000).toFixed(1) + " km").join(" / ") || "sem troca"}.</p>`;
                })
                .join(
                  "",
                )}<ol>${r.decisions.map((e) => `<li>${time(e.time)} · C${e.car + 1} · ${esc(e.detail)}</li>`).join("")}</ol></div></details>`,
          )
          .join("")
      : "<p>As sessões concluídas aparecerão aqui. Não há resultados fabricados.</p>"
  }</section>`;
}
export function updateManager(ui, race, now) {
  if (now - (ui.managerLast || 0) < 700) return;
  ui.managerLast = now;
  const root = document.getElementById("race-hud");
  if (!root || !race.manager) return;
  for (const c of race.cars) {
    const summary = root.querySelector(`[data-manager-overview="${c.id}"]`);
    if (summary)
      summary.textContent = `C${c.id + 1} · P${race.standings().indexOf(c) + 1} · V${Math.min(race.laps, c.lap + 1)} · ${compounds[c.tires.compound].label} ${Math.round(c.tires.health * 100)}% · última ${c.lastLap ? time(c.lastLap) : "—"}`;
    const status = root.querySelector(`[data-manager-status="${c.id}"]`),
      advice = root.querySelector(`[data-manager-advice="${c.id}"]`);
    if (status)
      status.textContent = `${compounds[c.tires.compound].label} · ${Math.round(c.tires.health * 100)}% · ${Math.round(c.tires.temperature)} °C · ${((c.tires.distance || 0) / 1000).toFixed(1)} km · ${c.pit.stops} parada(s) · ${c.pit.state}${c.pit.requested ? " / solicitado" : ""} · combustível ${c.fuel.toFixed(1)} L`;
    if (advice && c.strategyAdvice)
      advice.textContent =
        c.strategyAdvice.message +
        ` · Perda estimada ${c.strategyAdvice.loss.toFixed(1)} s · tráfego previsto ${c.strategyAdvice.traffic.length} carro(s)`;
    const locked =
      c.pit.state !== "track" ||
      c.pit.approachAuthorized ||
      c.finished ||
      c.retired;
    for (const action of ["pit", "cancel", "defer"]) {
      const button = root.querySelector(
        `[data-action="manager-${action}"][data-id="${c.id}"]`,
      );
      if (button) button.disabled = locked;
    }
    const next = root.querySelector(
      `[data-manager-car="${c.id}"][data-manager-field="nextCompound"]`,
    );
    if (next) {
      next.disabled = locked;
      if (document.activeElement !== next) next.value = c.pit.compound;
    }
    const accept = root.querySelector(
      `[data-action="manager-accept"][data-id="${c.id}"]`,
    );
    if (accept)
      accept.disabled =
        locked ||
        !(
          ["pit", "review"].includes(c.strategyAdvice?.action) ||
          ["overcut", "traffic", "hot"].includes(c.strategyAdvice?.key)
        );
    const pace = root.querySelector(
      `[data-manager-car="${c.id}"][data-manager-field="pace"]`,
    );
    if (pace && document.activeElement !== pace)
      pace.value = c.managerPlan.pace;
  }
  const journal = root.querySelector("[data-manager-journal]");
  if (journal) {
    journal.innerHTML = `<p>${race.cars
      .filter((c) => !race.manager.owns(c))
      .map(
        (c) =>
          `C${c.id + 1}: ${esc(c.strategyIdentity)} · ${compounds[c.tires.compound].label} · ${c.pit.stops} paradas`,
      )
      .join("<br>")}</p><ol>${race.manager.decisions
      .slice(-12)
      .reverse()
      .map((e) => `<li>${time(e.time)} · C${e.car + 1}: ${esc(e.detail)}</li>`)
      .join("")}</ol>`;
  }
}
