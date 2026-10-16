import { managerPanel } from "./ManagerUI.js";
import { trackSelector } from "./TrackSelector.js";
import { strategyPanel } from "./RaceHUD.js";
import { graphicsConfig } from "../graphics/Quality.js";
import { estimatePitLoss, serviceEstimate } from "../strategy/PitStrategy.js";
import { bayFor } from "../strategy/PitLayout.js";
import { teamStandings } from "../career/TeamManager.js";
import { icon } from "../icons.js";
import { driverCatalog } from "../data/drivers.js";
import { trackCatalog, trackById } from "../data/tracks.js";
import { vehicles, performance, displayStat } from "../garage.js";
import { liveries } from "../models.js";
import { activeTrack, length, mapPoint } from "../track.js";
import { resolveStartOrder } from "../startOrder.js";
import { DEFAULT_KEYS } from "../controls.js";
import { compounds } from "../strategy/Resources.js";
const fmt = (n) => Math.round(n).toLocaleString("pt-BR"),
  tierNames = {
    normal: "Normal",
    mythic: "Mítico",
    legendary: "Lendário",
    mega: "Supremo",
  };
const opt = (values, current) =>
  values
    .map(
      ([v, n]) =>
        `<option value="${v}" ${String(v) === String(current) ? "selected" : ""}>${n}</option>`,
    )
    .join("");
const b = (text, action, extra = "") =>
  `<button class="btn secondary" data-action="${action}" ${extra}>${text}</button>`;
function settingsExtra(s) {
  const gfx = graphicsConfig(s.settings);
  return `<div class="extras-settings"><div class="setting-row"><b>Apresentação do HUD</b><select data-setting="hudMode" aria-label="Apresentação do HUD">${opt(
    [
      ["standard", "Padrão"],
      ["compact", "Compacto"],
      ["immersive", "Imersivo"],
    ],
    s.settings.hudMode,
  )}</select></div><h3>Renderização / desempenho</h3><div class="setting-row"><b>Escala de resolução</b><select data-setting="resolution" aria-label="Escala de resolução">${opt(
    [
      [0.5, "50%"],
      [0.65, "65%"],
      [0.85, "85%"],
      [1, "100%"],
      [1.25, "125%"],
    ],
    gfx.resolution,
  )}</select></div><div class="setting-row"><b>Sombras</b><select data-setting="shadows" aria-label="Sombras">${opt(
    [
      [0, "Desligadas"],
      [512, "512 · 10 Hz"],
      [1024, "1024 · 20 Hz"],
    ],
    gfx.shadows,
  )}</select></div><div class="setting-row"><b>Partículas</b><select data-setting="particles" aria-label="Partículas">${opt(
    [
      [0, "Nenhuma"],
      [64, "64 · reduzidas"],
      [128, "128 · completas"],
    ],
    gfx.particles,
  )}</select></div><div class="setting-row"><b>Limite de FPS</b><select data-setting="fpsLimit" aria-label="Limite de FPS">${opt(
    [
      ["auto", "Automático"],
      [30, "30 FPS"],
      [60, "60 FPS"],
      [120, "120 FPS"],
      [240, "240 FPS"],
      ["unlimited", "Sem limite"],
    ],
    s.settings.fpsLimit,
  )}</select><small>Respeita as limitações do navegador e do monitor. Em 60 Hz, 120/240 FPS pode não ser atingível.</small></div><div class="setting-row"><b>Efeitos de chuva / poeira</b><input type="checkbox" data-setting="effects" ${gfx.effects ? "checked" : ""}></div><div class="setting-row"><b>Detalhe / alcance da equipe</b><select data-setting="detail">${opt(
    [
      [0.6, "Reduzido"],
      [0.8, "Médio"],
      [1, "Completo"],
    ],
    gfx.detail,
  )}</select></div><div class="setting-row"><div><b>Desempenho automático</b><small>Opcional. Ajusta apenas a resolução, com limite e recuperação gradual.</small></div><input type="checkbox" data-setting="autoQuality" ${s.settings.autoQuality ? "checked" : ""}></div><h3>Trilha sonora e torcida</h3><p class="subtle">Áudio original e local. Um clique ou tecla libera a reprodução no navegador. O volume geral também controla o rádio.</p><div class="setting-row"><b>Música ativada</b><input type="checkbox" data-setting="music" ${s.settings.music ? "checked" : ""}></div><div class="setting-row"><b>Volume da música</b><input aria-label="Volume da música" type="range" data-setting="musicVolume" min="0" max="1" step=".05" value="${s.settings.musicVolume}"></div><div class="setting-row"><b>Volume da torcida</b><input aria-label="Volume da torcida" type="range" data-setting="crowdVolume" min="0" max="1" step=".05" value="${s.settings.crowdVolume}"></div><div class="setting-row"><div><b>Música durante a corrida</b><small>Opcional; desligada por padrão. Não desativa motor ou efeitos.</small></div><input type="checkbox" data-setting="raceMusic" ${s.settings.raceMusic ? "checked" : ""}></div><div class="setting-row"><b>Reduzir música na corrida</b><input type="checkbox" data-setting="musicDuck" ${s.settings.musicDuck ? "checked" : ""}></div><h3>Pilotagem e rádio</h3><div class="setting-row"><b>Volume do motor</b><input aria-label="Volume do motor" type="range" data-setting="engineVolume" min="0" max="1" step=".05" value="${s.settings.engineVolume}"></div><div class="setting-row"><b>Volume dos efeitos</b><input aria-label="Volume dos efeitos" type="range" data-setting="effectsVolume" min="0" max="1" step=".05" value="${s.settings.effectsVolume}"></div><div class="setting-row"><div><b>Sensibilidade</b><small>Direção progressiva · 0,4 a 1,8</small></div><input type="range" aria-label="Sensibilidade" data-setting="sensitivity" min=".4" max="1.8" step=".1" value="${s.settings.sensitivity}"></div><div class="setting-row"><b>Assistência de estabilidade</b><input type="checkbox" data-setting="assistance" ${s.settings.assistance ? "checked" : ""}></div><div class="setting-row"><b>Espelhar direção (acessibilidade)</b><input type="checkbox" data-setting="invert" ${s.settings.invert ? "checked" : ""}></div><div class="setting-row"><b>Zona morta do gamepad</b><input type="range" aria-label="Zona morta" data-setting="deadzone" min=".05" max=".35" step=".01" value="${s.settings.deadzone}"></div><p class="subtle">v0.4: A vira à esquerda; D à direita. Inversões antigas de contorno foram normalizadas uma vez. Gamepad: eixo esquerdo, RT acelerar, LT frear, Start pausar. Disponibilidade depende do navegador/dispositivo.</p><div class="key-bindings">${Object.entries(
    DEFAULT_KEYS,
  )
    .map(([key, code]) =>
      b(key + " · " + s.settings.bindings[key], "rebind", `data-key="${key}"`),
    )
    .join(
      "",
    )}</div><div class="setting-row"><div><b>Voz do engenheiro</b><small>Somente voz local em português, se instalada. Texto sempre disponível.</small></div><input type="checkbox" data-setting="voice" ${s.settings.voice ? "checked" : ""}></div><div class="setting-row"><b>Volume de voz</b><input type="range" aria-label="Volume da voz" data-setting="voiceVolume" min="0" max="1" step=".05" value="${s.settings.voiceVolume}"></div><div class="setting-row"><b>Intervalo de rádio</b><select data-setting="radioFrequency">${opt(
    [
      [15, "15 s"],
      [25, "25 s"],
      [45, "45 s"],
    ],
    s.settings.radioFrequency,
  )}</select></div><div class="setting-row"><b>Exibir FPS</b><input type="checkbox" data-setting="fps" ${s.settings.fps ? "checked" : ""}></div><div class="setting-actions">${b("REINICIAR CARREIRA", "reset-career")}${b("LABORATÓRIO ADMIN", "admin-login")}</div></div>`;
}
function setupExtra(s, champ) {
  return (
    `<div class="race-config-grid"><label>CLIMA DINÂMICO<select data-setting="weatherProgram">${opt(
      [
        ["fixed", "Estável"],
        ["showers", "Pancadas"],
        ["storm", "Tempestade"],
        ["drying", "Secagem"],
      ],
      s.settings.weatherProgram,
    )}</select></label><label>AVARIAS / MINUTO<select data-setting="mechanicalRate">${opt(
      [
        [0, "Desligadas"],
        [0.02, "2% / minuto"],
        [0.08, "8% / minuto"],
      ],
      s.settings.mechanicalRate,
    )}</select></label><label>REGULAMENTO<select data-setting="ruleSet">${opt(
      [
        ["auto", "Conforme modo"],
        ["club", "Clube"],
        ["formula", "Fórmula"],
        ["junior", "Junior"],
      ],
      s.settings.ruleSet,
    )}</select></label></div>` +
    `<button class="btn secondary track-catalog-link" data-action="track-catalog" ${champ ? "disabled" : ""}>EXPLORAR ${trackCatalog.length} CIRCUITOS →</button>` +
    `<label class="setting-row">CONTROLE<select data-setting="controlMode"><option value="manager" ${s.settings.controlMode !== "manual" ? "selected" : ""}>Chefe de equipe · IA autônoma</option><option value="manual" ${s.settings.controlMode === "manual" ? "selected" : ""}>Direção manual · opcional</option></select></label>` +
    `<div class="race-config-grid"><label>MODALIDADE<select data-setting="mode" ${champ ? "disabled" : ""}>${opt([["quick", "Corrida rápida"], ["time-trial", "Contrarrelógio · solo"], ["practice", "Treino livre · sem prêmio"], ["endurance", "Resistência · 6+ voltas"], ["recovery", "Desafio de recuperação"], ["manager", "Chefe de equipe · IA pilota"], ...(s.stats.seasons || s.baxterWon ? [["mega", "Confronto Mega Baxter"]] : [])], champ ? "quick" : s.settings.mode)}</select></label><label>CIRCUITO<select data-setting="track" ${champ ? "disabled" : ""}>${opt(
      trackCatalog.map((t) => [t.id, t.name + " / " + t.kind]),
      activeTrack.id,
    )}</select></label><label>REGRAS<select data-setting="realism">${opt(
      [
        ["arcade", "Arcade · combustível assistido"],
        ["realistic", "Realista · danos e consumo"],
      ],
      s.settings.realism,
    )}</select></label><label>CONDIÇÃO<select data-setting="weather">${opt(
      [
        ["dry", "Pista seca"],
        ["rain", "Chuva · menor aderência"],
      ],
      s.settings.weather,
    )}</select></label><label>DURAÇÃO<select data-setting="laps" ${champ ? "disabled" : ""}>${opt(
      [1, 2, 3, 5, 8, 12, 20].map((n) => [n, n + " voltas"]),
      s.settings.laps,
    )}</select></label><label>ADVERSÁRIOS<select data-setting="bots" ${champ ? "disabled" : ""}>${opt(
      [1, 3, 5].map((n) => [n, n + " bots"]),
      s.settings.bots,
    )}</select></label><label>PNEUS<select data-setting="tire">${opt(
      Object.entries(compounds).map(([k, t]) => [k, t.label]),
      s.settings.tire,
    )}</select></label><div class="setting-row"><b>Ordem de largada</b><select data-setting="startOrderMode" aria-label="Ordem de largada">${opt(
    [
      ["standings", "Classificação anterior"],
      ["random", "Sorteio aleatório"],
    ],
    s.settings.startOrderMode,
  )}</select><small>${s.championship?.results?.length ? "Baseada na pontuação acumulada da temporada." : "Sem pontuação anterior; será usado sorteio aleatório."}</small></div><div class="start-order-preview"><b>Grid previsto</b><ol>${resolveStartOrder(s)
    .map((id, i) => {
      const name =
        id === 0
          ? driverCatalog[s.selectedDriver].name
          : driverCatalog[id]?.name || "Piloto " + (id + 1);
      return `<li>${i + 1}. ${name}</li>`;
    })
    .join("")}</ol></div><div class="config-pilot"><img src="${driverCatalog[s.selectedDriver].portrait}" alt=""><span>${driverCatalog[s.selectedDriver].name}<small>${vehicles[s.selectedCar].name} · piloto selecionado</small></span></div></div><p class="subtle">No gerenciamento, a IA conduz e entra nos boxes fisicamente. Limite: 65 km/h. C: câmera · Q: rádio. Pedais somente quando você escolher direção manual.</p>`
  );
}
export function extendUI(UI) {
  UI.prototype.tracks = function () {
    return trackSelector(this);
  };
  const header = UI.prototype.header;
  UI.prototype.header = function () {
    return (
      header
        .call(this)
        .replace(
          "</nav>",
          `<button class="nav-item ${this.page === "drivers" ? "active" : ""}" data-nav="drivers">Pilotos</button><button class="nav-item ${this.page === "operations" ? "active" : ""}" data-nav="operations">Carreira</button><button class="nav-item ${this.page === "tracks" ? "active" : ""}" data-nav="tracks">Circuitos</button></nav>`,
        ) +
      (this.game.admin.active
        ? '<div class="lab-banner">LABORATÓRIO DE DESENVOLVIMENTO · SAVE ISOLADO · NÃO É A CARREIRA NORMAL <button data-action="admin-exit">ENCERRAR TESTE</button></div>'
        : "")
    );
  };
  UI.prototype.drivers = function () {
    const s = this.game.save,
      d = driverCatalog[s.selectedDriver],
      stats = s.driverStats[d.id] || { races: 0, wins: 0 };
    return `${this.title("MERCADO / 31 IDENTIDADES", "Um piloto. Mil possibilidades.", "10 Normais · 10 Míticos · 10 Lendários · Mega Baxter. Contratos permanentes, sem sorteio.")}<div class="driver-profile panel"><img src="${d.portrait}" alt="Retrato de ${d.name}"><div><span class="tag tier-${d.tier}">${tierNames[d.tier]} / ${d.personality}</span><h2>${d.name}</h2><p>${d.description}</p><div class="driver-profile-stats"><span>ESPECIALIDADE<b>${d.specialty}</b></span><span>CORRIDAS<b>${stats.races}</b></span><span>VITÓRIAS<b>${stats.wins}</b></span><span>OVERALL<b>${d.overall}</b></span></div><div class="driver-attributes">${Object.entries(
      d.attributes,
    )
      .map(
        ([k, v]) =>
          `<span>${{ skill: "Habilidade", consistency: "Consistência", aggression: "Agressividade", precision: "Precisão", overtaking: "Ultrapassagem", defense: "Defesa", wetSkill: "Chuva", startSkill: "Largada", experience: "Experiência", tireManagement: "Gestão de pneus", fuelManagement: "Economia", pressure: "Pressão" }[k]} <b>${v}</b></span>`,
      )
      .join(
        "",
      )}</div></div><img class="helmet-profile" src="${d.helmet}" alt="Capacete exclusivo"></div><div class="section-label"><span>CATÁLOGO DE PILOTOS</span><i></i><span>${s.unlockedDrivers.length}/31 CONTRATADOS</span></div><div class="driver-grid">${driverCatalog.map((d) => `<article class="driver-card panel tier-${d.tier}"><div class="driver-card-top"><span>${tierNames[d.tier]}</span><b>${d.overall}</b></div><img src="${d.portrait}" alt="Retrato de ${d.name}" loading="lazy"><div class="driver-card-info"><small>#${String(d.number).padStart(2, "0")} / ${d.personality}</small><h3>${d.name}</h3><p>${d.specialty}</p><button class="btn ${s.selectedDriver === d.id ? "primary" : "secondary"}" data-action="pilot" data-id="${d.id}" ${s.selectedDriver === d.id ? "disabled" : ""}>${s.selectedDriver === d.id ? "SELECIONADO" : s.unlockedDrivers.includes(d.id) ? "SELECIONAR" : d.id === 30 ? "VENÇA BAXTER" : fmt(d.cost) + " CR"}</button></div></article>`).join("")}</div>`;
  };
  UI.prototype.operations = function () {
    const s = this.game.save,
      level = 1 + Math.floor(s.xp / 1000);
    return `${this.title("CARREIRA / OPERAÇÕES", "Construa algo maior que você.", "Reputação, equipe, rivalidades e recordes alimentados pelas suas corridas.")}<div class="ops-grid"><article class="panel ops-card"><div class="eyebrow">REPUTAÇÃO · NÍVEL ${level}</div><h2>${fmt(s.xp)} XP</h2><div class="performance-bar"><span style="width:${(s.xp % 1000) / 10}%"></span></div><p>${1000 - (s.xp % 1000)} XP para o próximo nível. Corra para ganhar experiência e créditos.</p>${b("PREPARAR CORRIDA", "setup")}</article><article class="panel ops-card"><div class="eyebrow">APEX MOTORSPORT / EQUIPE</div><h2>Desenvolvimento ${s.team.development}/5</h2><p>Melhora o controle dos carros, reduz até 1,2 s de troca e torna a equipe mais consistente. Custo: ${fmt(1200 + s.team.development * 700)} CR.</p>${b("INVESTIR NA ENGENHARIA", "team-upgrade", s.team.development >= 5 ? "disabled" : "")}<p>Boxes da equipe: ${s.team.pitStats.stops} serviços · melhor ${s.team.pitStats.bestService?.toFixed(2) || "—"} s · ${s.team.pitStats.laneSeconds.toFixed(1)} s em passagem.</p><p>Piloto de apoio contratado</p><div class="partner-list">${s.unlockedDrivers
      .slice(0, 12)
      .map((id) =>
        b(
          (s.team.partner === id ? "✓ " : "") + driverCatalog[id].name,
          "partner",
          `data-id="${id}"`,
        ),
      )
      .join(
        "",
      )}</div></article><article class="panel ops-card baxter-card"><span class="infinity">∞</span><div class="eyebrow">O ÚLTIMO DESAFIO</div><h2>Mega Baxter</h2><p>${s.baxterWon ? "Você venceu o impossível. Baxter e B-0 estão na sua coleção." : "Complete um campeonato. Depois enfrente Baxter em seu evento de elite para desbloquear o piloto supremo e o B-0."}</p>${b("DESAFIAR BAXTER", "mega-event", !s.stats.seasons && !this.game.admin.active ? "disabled" : "")}</article></div><div class="section-label"><span>MEMÓRIA DAS DISPUTAS</span><i></i><span>RIVALIDADES PERSISTENTES</span></div><div class="rival-grid">${
      Object.entries(s.rivalries).length
        ? Object.entries(s.rivalries)
            .map(
              ([id, r]) =>
                `<div class="panel rival-card"><img src="${driverCatalog[id].portrait}" alt=""><div><h3>${driverCatalog[id].name}</h3><p>${r.passed} ultrapassagens feitas · ${r.lost} sofridas</p><small>INTENSIDADE ${r.score.toFixed(1)} / 10</small></div></div>`,
            )
            .join("")
        : '<p class="subtle">Dispute posições na pista. Suas rivalidades serão registradas aqui.</p>'
    }</div><div class="section-label"><span>RECORDES POR CIRCUITO / REGRA / CLIMA</span><i></i></div><div class="panel table-panel"><table><thead><tr><th>CIRCUITO</th><th>REGRAS</th><th>TEMPO</th></tr></thead><tbody>${
      Object.entries(s.records)
        .map(([key, t]) => {
          const [track, rule, weather] = key.split(":");
          return `<tr><td>${trackById(track).name}</td><td>${rule === "arcade" ? "Arcade" : "Realista"} / ${weather === "rain" ? "Chuva" : "Seco"}</td><td>${t.toFixed(3)} s</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="3">Complete uma volta válida para registrar um tempo.</td></tr>'
    }</tbody></table></div><div class="section-label"><span>ÚLTIMOS RESULTADOS</span><i></i></div><div class="panel table-panel"><table><thead><tr><th>POS</th><th>CIRCUITO / PILOTO</th><th>MODALIDADE</th></tr></thead><tbody>${
      s.history
        .slice(-10)
        .reverse()
        .map(
          (h) =>
            `<tr><td>P${h.position}</td><td>${trackById(h.track).name}<small>${driverCatalog[h.driver].name}</small></td><td>${h.mode}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="3">Sua história começa na próxima largada.</td></tr>'
    }</tbody></table></div>`;
  };
  UI.prototype.admin = function () {
    if (!this.game.admin.active) return "<h2>Laboratório fechado.</h2>";
    const s = this.game.save;
    return `${this.title("ADMIN / DESENVOLVIMENTO LOCAL", "Laboratório de corrida.", "Senha no código não oferece segurança. Esta ferramenta usa um save separado, sem executar código arbitrário.")}<div class="ops-grid"><article class="panel ops-card"><h2>Dados de teste</h2><p>As alterações deste painel não são aplicadas à carreira normal.</p>${b("DESBLOQUEAR CATÁLOGOS", "admin-unlock")}${b("RESTAURAR DADOS DE TESTE", "admin-reset")}<label>CRÉDITOS <input type="number" id="admin-credits" min="0" max="100000000" value="${s.credits}"></label>${b("APLICAR CRÉDITOS", "admin-credit")}</article><article class="panel ops-card"><h2>Simulação</h2><p>Selecione circuito, regras, duração, dificuldade e modalidade na preparação. Use Chefe de equipe para acompanhar a IA.</p>${b("CONFIGURAR TESTE", "setup")}${b("INSPECIONAR ESTADO", "admin-inspect")}</article><article class="panel ops-card"><h2>Diagnóstico</h2><p>FPS atual: ${Math.round(this.game.fps)}<br>Draw calls: ${this.game.world.renderer.info.render.calls}<br>Triângulos: ${this.game.world.renderer.info.render.triangles}<br>Erros registrados: ${this.game.errors.length}</p>${b("VOLTAR À CARREIRA NORMAL", "admin-exit")}</article></div>`;
  };
  const champ = UI.prototype.championship;
  UI.prototype.championship = function () {
    return (
      champ.call(this) +
      `<div class="section-label"><span>CLASSIFICAÇÃO DE EQUIPES / DUPLAS DO CAMPEONATO</span><i></i></div><div class="ops-grid">${teamStandings(
        this.game.save.championship,
      )
        .map(
          (t, i) =>
            `<div class="panel ops-card"><span class="eyebrow">0${i + 1}</span><h2>${t.name}</h2><p>${t.points} PONTOS · pilotos emparelhados no campeonato</p></div>`,
        )
        .join("")}</div>`
    );
  };
  const garage = UI.prototype.garage;
  UI.prototype.garage = function () {
    const s = this.game.save;
    let html = garage
      .call(this)
      .replace(/DE 6 DESBLOQUEADOS/g, "DE 12 DESBLOQUEADOS");
    for (let i = 6; i < 11; i++)
      if (!s.unlockedCars.includes(i))
        html = html.replace(
          `data-action="car" data-id="${i}" disabled`,
          `data-action="buy-car" data-id="${i}"`,
        );
    const compare = this.compareCar ?? 1,
      a = performance(s),
      c = performance(s, compare);
    return (
      html +
      `<div class="garage-toolbar">${b("↶ ROTACIONAR", "rotate", 'data-direction="-1"')}${b("ROTACIONAR ↷", "rotate", 'data-direction="1"')}${b("EDITOR DE PINTURA", "paint-editor")}</div><section class="panel comparison"><h3>${vehicles[s.selectedCar].name} × <select id="compare-car">${opt(
        vehicles.map((v, i) => [i, v.name + " / " + v.title]),
        compare,
      )}</select></h3><div class="compare-grid">${[
        ["maxSpeed", "Velocidade", "km/h"],
        ["acceleration", "Aceleração", "m/s²"],
        ["braking", "Frenagem", "m/s²"],
        ["grip", "Aderência", "m/s²"],
        ["stability", "Estabilidade", "×"],
        ["handling", "Controle", "%"],
        ["consumption", "Consumo", "×"],
        ["durability", "Durabilidade", "×"],
      ]
        .map(
          ([k, n, u]) =>
            `<span>${n}<b>${displayStat(k, a[k])} / ${displayStat(k, c[k])}<small> ${u}</small></b></span>`,
        )
        .join(
          "",
        )}</div><p class="subtle">Piloto associado: ${driverCatalog[s.selectedDriver].name}. Consumo menor favorece autonomia.</p></section>`
    );
  };
  const render = UI.prototype.render;
  UI.prototype.render = function () {
    render.call(this);
    const select = document.getElementById("compare-car");
    if (select)
      select.onchange = () => {
        this.compareCar = Number(select.value);
        this.render();
      };
  };
  const show = UI.prototype.showModal;
  UI.prototype.showModal = function (type) {
    const s = this.game.save;
    let html = "";
    if (type === "paint-editor") {
      const l = liveries[s.selectedCar],
        p = s.customizations[s.selectedCar] || {
          primary: l.color,
          secondary: l.accent,
          detail: "#151a20",
          number: l.number,
        };
      html = `<div class="modal-eyebrow">OFICINA / IDENTIDADE</div><h2>Sua assinatura na pista.</h2><p>Cores e número aplicados à geometria real do carro.</p><div class="paint-editor"><label>COR PRINCIPAL<input id="paint-primary" type="color" value="${p.primary}"></label><label>COR SECUNDÁRIA<input id="paint-secondary" type="color" value="${p.secondary}"></label><label>DETALHES<input id="paint-detail" type="color" value="${p.detail}"></label><label>NÚMERO<input id="paint-number" type="number" min="0" max="99" value="${p.number}"></label></div><div class="setting-actions">${b("RESTAURAR ORIGINAL", "reset-paint")}${b("APLICAR AO CARRO", "save-paint")}</div>`;
    } else if (type === "reset-career")
      html = `<h2>Reiniciar a carreira?</h2><p>Créditos, carros, pilotos, contratos, recordes e campeonatos serão apagados deste save. Exporte seus dados antes, se desejar.</p>${b("CONFIRMAR REINÍCIO", "confirm-reset")}`;
    else if (type === "confirm-exit")
      html = `<h2>Abandonar esta corrida?</h2><p>A prova atual não concede recompensa nem registra uma etapa. Seu progresso anterior será mantido.</p><div class="setting-actions">${b("CONTINUAR CORRENDO", "resume")}${b("ABANDONAR CORRIDA", "confirm-exit")}</div>`;
    else if (type === "pit-options") {
      const c = this.game.race.cars[0],
        p = c.pit,
        bay = bayFor(c),
        locked = ["service", "release"].includes(p.state),
        rivals = this.game.race.standings();
      html = `<div class="modal-eyebrow">ESTRATÉGIA / GARAGEM ${bay.id + 1}</div><h2>Preparar os boxes.</h2><p>${bay.name} · Serviço estimado ${serviceEstimate(c).toFixed(1)} s · Perda estimada sem fila ${estimatePitLoss(c).toFixed(1)} s. A volta e o tráfego alteram o custo real.</p><div class="pit-plan-fields"><label>PARAR NAS VOLTAS<input id="pit-plan" aria-label="Voltas das paradas" value="${p.plan.join(", ")}" placeholder="Ex.: 2, 5" maxlength="40"></label><label><input id="pit-job-tires" type="checkbox" ${p.jobs.tires ? "checked" : ""} ${locked ? "disabled" : ""}> Trocar pneus</label><label><input id="pit-job-repair" type="checkbox" ${p.jobs.repair ? "checked" : ""} ${locked ? "disabled" : ""}> Reparar danos</label><label><input id="pit-job-fuel" type="checkbox" ${p.jobs.fuel ? "checked" : ""} ${locked || c.realism !== "realistic" ? "disabled" : ""}> Reabastecer (regra realista)</label><label>ALVO DE COMBUSTÍVEL<select id="pit-fuel-target" ${locked ? "disabled" : ""}>${opt(
        [
          [0.25, "25%"],
          [0.5, "50%"],
          [0.75, "75%"],
          [1, "100%"],
        ],
        p.fuelTarget,
      )}</select></label></div><div class="setting-actions">${b("SALVAR PLANO", "pit-plan-save")}${p.requested && p.state === "track" ? b("CANCELAR CHAMADA", "pit-cancel") : ""}</div><p>Escolha o composto e solicite a parada agora. ${locked ? "Serviço em andamento: trabalho contratado bloqueado." : ""}</p><div class="pit-choice">${Object.entries(
        compounds,
      )
        .map(([k, t]) =>
          b(
            t.label,
            "pit-compound",
            `data-key="${k}" ${locked ? "disabled" : ""} style="border-color:${t.color}"`,
          ),
        )
        .join(
          "",
        )}</div><p class="subtle">P: chamada rápida · entre pelo lado sinalizado dos boxes, 210–115 m antes da linha. Desaceleração assistida e faixa limitada a 65 km/h. Mesma garagem para companheiros de equipe; aguarde reserva e liberação. Plano salvo vale para próximas corridas de duração compatível.</p><div class="pit-rivals"><b>RIVAIS / estratégia observada</b>${rivals.map((r, i) => `<div><span>${i + 1}. ${r.name}</span><span>${compounds[r.tires.compound].label} ${Math.round(r.tires.health * 100)}%</span><span>${r.pit.stops} paradas · ${r.pit.requested ? "preparando" : r.pit.state === "track" ? "na pista" : r.pit.state}</span></div>`).join("")}</div><p>Último serviço: ${p.lastService?.toFixed(1) || "—"} s · Última passagem: ${p.lastLaneTime?.toFixed(1) || "—"} s · ${p.reason || "Sem chamada"}.</p>`;
    } else if (type === "admin-login")
      html = `<div class="modal-eyebrow">LABORATÓRIO LOCAL</div><h2>Ferramenta de desenvolvimento.</h2><p>Não é um sistema seguro de contas. A senha está no cliente. Os testes usam um save isolado.</p><input id="admin-password" type="password" placeholder="Senha de desenvolvimento" aria-label="Senha de desenvolvimento">${b("ENTRAR NO LABORATÓRIO", "admin-enter")}`;
    else if (type === "admin-inspect" && this.game.admin.active) {
      const r = this.game.race;
      html = `<h2>Inspeção da simulação.</h2><pre class="inspect-json">${JSON.stringify(r ? { state: r.state, track: r.trackId, time: r.time, flag: r.flag, car: r.cars.map((c) => ({ id: c.id, lap: c.lap, s: Math.round(c.s), speed: Math.round(c.speed * 3.6), damage: c.damage, fuel: c.fuel, pit: c.pit.state })) } : { state: "menu", fps: Math.round(this.game.fps), errors: this.game.errors }, null, 2).replaceAll("<", "&lt;")}</pre><div class="setting-actions">${b("TESTAR IMPACTO", "admin-damage", r ? "" : "disabled")}${b("TESTAR PEDIDO DE BOXES", "admin-pit", r ? "" : "disabled")}</div>`;
    }
    if (html) {
      this.closeModal();
      this.modal = type;
      const node = document.createElement("div");
      node.id = "modal";
      node.className = "modal-backdrop";
      node.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${type}"><button class="icon-btn modal-close" data-action="close" aria-label="Fechar">${icon("close")}</button>${html}</section>`;
      this.root.appendChild(node);
      return;
    }
    show.call(this, type);
    const modal = document.querySelector("#modal .modal");
    if (type === "settings")
      modal.insertAdjacentHTML("beforeend", settingsExtra(s));
    if (type === "setup" || type === "champ-setup") {
      modal
        .querySelector(".field-label")
        .insertAdjacentHTML(
          "beforebegin",
          setupExtra(s, type === "champ-setup"),
        );
      modal
        .querySelector(".setup-controls")
        .insertAdjacentHTML("beforebegin", managerPanel(this.game));
      modal.classList.add("setup-modal");
    }
    if (type === "pause" && this.game.admin.active)
      modal.insertAdjacentHTML(
        "beforeend",
        b("INSPEÇÃO ADMIN", "admin-inspect"),
      );
  };
}
