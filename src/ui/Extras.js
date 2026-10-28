import {
  downloadDriverPortrait,
  handlePortraitFileUpload,
} from "../core/ExtraActions.js";
import { managerPanel } from "./ManagerUI.js";
import { trackSelector } from "./TrackSelector.js";
import { strategyPanel } from "./RaceHUD.js";
import { graphicsConfig } from "../graphics/Quality.js";
import { estimatePitLoss, serviceEstimate } from "../strategy/PitStrategy.js";
import { bayFor } from "../strategy/PitLayout.js";
import { teamStandings } from "../career/TeamManager.js";
import { icon } from "../icons.js";
import {
  driverCatalog,
  EXCLUSIVE_SKILLS,
  STYLE_KEYS,
  ACADEMY_PROGRAMS,
  NATIONALITIES,
  ATTRIBUTE_LABELS,
  SHEET_ATTRIBUTE_LABELS,
  PLACEHOLDER_DRIVER_PORTRAIT,
  nationalityFlag,
  resolveDriverPortrait,
  activeDriverForSave,
  generateRandomAcademyPreset,
  createAcademyDriver,
} from "../data/drivers.js";
import { trackCatalog, trackById } from "../data/tracks.js";
import {
  vehicles,
  performance,
  displayStat,
  compareSetupChanges,
} from "../garage.js";
import { liveries } from "../models.js";
import { activeTrack } from "../track.js";
import { DEFAULT_KEYS } from "../controls.js";
import { compounds } from "../strategy/Resources.js";
import { powerUnits, powerUnitById } from "../data/powerUnits.js";
import {
  partCategories,
  partTier,
  aeroSetupPresets,
  aeroSetupById,
} from "../data/parts.js";
import {
  sponsorCatalog,
  sponsorById,
  teamPrincipals,
  teamPrincipalById,
} from "../data/sponsors.js";

const fmt = (n) => Math.round(n).toLocaleString("pt-BR"),
  tierNames = {
    normal: "Normal",
    mythic: "Mítico",
    legendary: "Lendário",
    mega: "Supremo",
    icons: "Ícone do Grid",
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
  )}</select></div><div class="setting-row"><b>Efeitos de chuva / poeira</b><input type="checkbox" data-setting="effects" ${gfx.effects ? "checked" : ""}></div><div class="setting-row"><b>Detalhe / alcance da equipe</b><select data-setting="detail">${opt(
    [
      [0.6, "Reduzido"],
      [0.8, "Médio"],
      [1, "Completo"],
    ],
    gfx.detail,
  )}</select></div><div class="setting-row"><div><b>Desempenho automático</b><small>Opcional. Ajusta apenas a resolução, com limite e recuperação gradual.</small></div><input type="checkbox" data-setting="autoQuality" ${s.settings.autoQuality ? "checked" : ""}></div><h3>Trilha sonora e torcida</h3><p class="subtle">Áudio original e local. Um clique ou tecla libera a reprodução no navegador. O volume geral também controla o rádio.</p><div class="setting-row"><b>Música ativada</b><input type="checkbox" data-setting="music" ${s.settings.music ? "checked" : ""}></div><div class="setting-row"><b>Volume da música</b><input aria-label="Volume da música" type="range" data-setting="musicVolume" min="0" max="1" step=".05" value="${s.settings.musicVolume}"></div><div class="setting-row"><b>Volume da torcida</b><input aria-label="Volume da torcida" type="range" data-setting="crowdVolume" min="0" max="1" step=".05" value="${s.settings.crowdVolume}"></div><div class="setting-row"><div><b>Música durante a corrida</b><small>Opcional; desligada por padrão. Não desativa motor ou efeitos.</small></div><input type="checkbox" data-setting="raceMusic" ${s.settings.raceMusic ? "checked" : ""}></div><div class="setting-row"><b>Reduzir música na corrida</b><input type="checkbox" data-setting="musicDuck" ${s.settings.musicDuck ? "checked" : ""}></div><h3>Pilotagem e rádio</h3><div class="setting-row"><b>Volume do motor</b><input aria-label="Volume do motor" type="range" data-setting="engineVolume" min="0" max="1" step=".05" value="${s.settings.engineVolume}"></div><div class="setting-row"><b>Volume dos efeitos</b><input aria-label="Volume dos efeitos" type="range" data-setting="effectsVolume" min="0" max="1" step=".05" value="${s.settings.effectsVolume}"></div><div class="setting-row"><div><b>Sensibilidade</b><small>Direção progressiva · 0,4 a 1,8</small></div><input type="range" aria-label="Sensibilidade" data-setting="sensitivity" min=".4" max="1.8" step=".1" value="${s.settings.sensitivity}"></div><div class="setting-row"><b>Assistência de estabilidade</b><input type="checkbox" data-setting="assistance" ${s.settings.assistance ? "checked" : ""}></div><div class="setting-row"><b>Espelhar direção (acessibilidade)</b><input type="checkbox" data-setting="invert" ${s.settings.invert ? "checked" : ""}></div><div class="setting-row"><b>Zona morta do gamepad</b><input type="range" aria-label="Zona morta" data-setting="deadzone" min=".05" max=".35" step=".01" value="${s.settings.deadzone}"></div><p class="subtle">Controles verificados: A / Seta Esquerda vira à esquerda; D / Seta Direita vira à direita. Gamepad: eixo esquerdo, RT acelerar, LT frear, Start pausar.</p><div class="key-bindings">${Object.entries(
    DEFAULT_KEYS,
  )
    .map(([key]) =>
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
    `<div class="race-config-grid"><label>MODALIDADE<select data-setting="mode" ${champ ? "disabled" : ""}>${opt([["quick", "Corrida rápida"], ["time-trial", "Contrarrelógio · solo"], ["practice", "Treino livre · sem prêmio"], ["endurance", "Resistência · 8+ voltas"], ["recovery", "Desafio de recuperação"], ["manager", "Chefe de equipe · IA pilota"], ...(s.stats.seasons || s.baxterWon ? [["mega", "Confronto Mega Baxter"]] : [])], champ ? "quick" : s.settings.mode)}</select></label><label>CIRCUITO<select data-setting="track" ${champ ? "disabled" : ""}>${opt(
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
    )}</select></label><label>DISTÂNCIA DA PROVA<select data-setting="raceDistancePreset" ${champ ? "disabled" : ""}>${opt(
      [
        ["short", "Curta · mínimo de 8 voltas"],
        ["medium", "Média · mínimo de 8 voltas"],
        ["long", "Longa · 9 voltas"],
        ["endurance", "Endurance · 14 voltas"],
        ["custom", "Personalizada"],
      ],
      s.settings.raceDistancePreset || "medium",
    )}</select></label><label>VOLTAS<select data-setting="laps" ${champ ? "disabled" : ""}>${opt(
      [8, 9, 12, 14, 20, 25, 30].map((n) => [n, n + " voltas"]),
      s.settings.laps,
    )}</select></label><label>ADVERSÁRIOS<select data-setting="bots" ${champ ? "disabled" : ""}>${opt(
      [1, 3, 5].map((n) => [n, n + " equipes rivais"]),
      s.settings.bots,
    )}</select></label><label>PNEUS<select data-setting="tire">${opt(
      Object.entries(compounds).map(([k, t]) => [k, t.label]),
      s.settings.tire,
    )}</select></label><div class="config-pilot"><img src="${activeDriverForSave(s).portrait}" alt=""><span>${activeDriverForSave(s).name}<small>${vehicles[s.selectedCar].name} · ${activeDriverForSave(s).isAcademy ? "piloto titular promovido da base" : "piloto titular da equipe"}</small></span></div></div><p class="subtle">No gerenciamento, a IA conduz seu carro titular e entra nos boxes fisicamente. Limite: 65 km/h. C: câmera · Q: rádio. Pedais somente quando você escolher direção manual.</p>`
  );
}

function renderAcademySection(ui, s) {
  const titular = driverCatalog[s.selectedDriver] || driverCatalog[0];
  const academy = s.academy || [];
  return `<div class="section-label"><span>ACADEMIA & PILOTOS PERSONALIZADOS · FORMAÇÃO (${academy.length}/8)</span><i></i><span><button class="btn primary" data-action="open-academy-creator">+ CRIAR PILOTO DA BASE</button></span></div>
  ${
    academy.length
      ? `<div class="academy-grid">${academy
          .map((a) => {
            const isPromoted = s.promotedAcademyId === a.uid;
            const flag = nationalityFlag(a.nationality);
            const pInfo = resolveDriverPortrait(a, s);
            const dSpeed = a.attributes.speed - titular.attributes.speed;
            const dCorner = a.attributes.cornering - titular.attributes.cornering;
            const dCons = a.attributes.consistency - titular.attributes.consistency;
            return `<article class="panel academy-card ${isPromoted ? "promoted" : ""}" style="border-top:3px solid ${a.suitColor}">
              <div class="academy-card-head">
                <div class="academy-portrait-wrap">
                  <img class="academy-portrait-2d" src="${pInfo.src}" alt="Retrato de ${a.name}" onerror="this.onerror=null;this.src='${PLACEHOLDER_DRIVER_PORTRAIT}'">
                  ${pInfo.isPlaceholder ? '<span class="portrait-placeholder-badge">SUBSTITUTA</span>' : ""}
                </div>
                <div>
                  <span class="tag">${isPromoted ? "TITULAR PROMOVIDO ATIVO" : "BASE · NÍVEL " + (a.level || 1)} · #${String(a.number).padStart(2, "0")}</span>
                  <h3>${a.name}</h3>
                  <small>${flag.flag} ${a.nationality} (${flag.code}) · ${a.age} anos · Equipe: <b>${a.teamName || s.team?.name || "Apex Motorsport"}</b></small>
                  <p class="subtle" style="margin:4px 0"><b>Programa:</b> ${a.programName} · <b>Estilo:</b> ${a.styleKey} · <b>Habilidade:</b> ${a.exclusiveSkill?.name}</p>
                </div>
                <div class="academy-ovr-box">
                  <small>HABILIDADE / POT</small>
                  <b>${a.overall}<span>/${a.attributes.potential}</span></b>
                </div>
              </div>
              <div class="driver-attributes academy-attrs">${SHEET_ATTRIBUTE_LABELS.map(
                ([k, label]) =>
                  `<span>${label} <b>${a.attributes[k] ?? a.attributes.speed}</b><i class="attr-bar"><em style="width:${a.attributes[k] ?? a.attributes.speed}%"></em></i></span>`,
              ).join("")}</div>
              <div class="academy-compare">
                <small>COMPARAÇÃO VS ${titular.name.toUpperCase()} (OVR ${titular.overall}):</small>
                <span>VEL <b>${dSpeed >= 0 ? "+" + dSpeed : dSpeed}</b></span>
                <span>CUR <b>${dCorner >= 0 ? "+" + dCorner : dCorner}</b></span>
                <span>CON <b>${dCons >= 0 ? "+" + dCons : dCons}</b></span>
                <span>CORRIDAS <b>${a.races || 0} (${a.wins || 0}V)</b></span>
              </div>
              <div class="academy-actions">
                <button class="btn secondary" data-action="academy-train" data-uid="${a.uid}" data-kind="pace">TREINAR RITMO · 350 CR</button>
                <button class="btn secondary" data-action="academy-train" data-uid="${a.uid}" data-kind="racecraft">TREINAR DISPUTA · 350 CR</button>
                <button class="btn secondary" data-action="academy-train" data-uid="${a.uid}" data-kind="consistency">SIMULADOR · 350 CR</button>
                <button class="btn ${isPromoted ? "secondary" : "primary"}" data-action="academy-promote" data-uid="${a.uid}">${isPromoted ? "RETORNAR À RESERVA" : "PROMOVER A TITULAR"}</button>
                <button class="btn secondary" data-action="change-driver-image" data-driver-key="${a.uid}">TROCAR RETRATO</button>
                <button class="btn secondary" data-action="download-driver-image" data-driver-key="${a.uid}">⬇ Baixar imagem</button>
              </div>
            </article>`;
          })
          .join("")}</div>`
      : `<div class="panel academy-empty"><p>Nenhum jovem talento inscrito no programa de formação da escuderia. Crie um piloto personalizado da base com retrato 2D, configure seus atributos e promova-o à vaga titular!</p><button class="btn primary" data-action="open-academy-creator">CRIAR PILOTO DA BASE →</button></div>`
  }`;
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
      d = activeDriverForSave(s),
      stats = d.isAcademy
        ? { races: d.races || 0, wins: d.wins || 0 }
        : s.driverStats[d.id] || { races: 0, wins: 0 },
      skill = d.exclusiveSkill || EXCLUSIVE_SKILLS[0],
      flag = nationalityFlag(d.nationality),
      pInfo = resolveDriverPortrait(d, s),
      currentTeam = d.isAcademy
        ? s.team?.name || d.teamName || "Apex Motorsport"
        : d.id === s.selectedDriver
          ? s.team?.name || d.teamName || "Apex Motorsport"
          : d.teamName || "Apex Motorsport";
    return `${this.title("MERCADO & ACADEMIA / " + driverCatalog.length + " FICHAS OFICIAIS + BASE", "Fichas técnicas 2D · Atributos reais de corrida, estilo de pilotagem e Academia da Base.", "10 Normais · 10 Míticos · 10 Lendários · Mega Baxter · 12 Ícones do Grid + Criação de Piloto Personalizado.")}
    <input id="driver-portrait-upload-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
    <section class="driver-profile panel driver-sheet-hero" style="border-top:4px solid ${d.suitColor || d.color || "#e63956"}">
      <div class="driver-sheet-portrait-col">
        <div class="driver-portrait-frame">
          <span class="driver-number-pill" style="background:${d.suitColor || d.color || "#e63956"}">#${String(d.number).padStart(2, "0")}</span>
          <span class="driver-flag-pill" title="${d.nationality}">${flag.flag} ${flag.code}</span>
          <img id="active-driver-portrait-img" src="${pInfo.src}" alt="Retrato de ${d.name}" onerror="this.onerror=null;this.src='${PLACEHOLDER_DRIVER_PORTRAIT}'">
          <img class="driver-sheet-helmet" src="${d.helmet}" alt="Capacete de ${d.name}" onerror="this.style.display='none'">
          ${pInfo.isPlaceholder ? '<span class="portrait-placeholder-tag">IMAGEM SUBSTITUTA · SEM FOTO OFICIAL</span>' : pInfo.isCustom ? '<span class="portrait-custom-tag">RETRATO PERSONALIZADO</span>' : ""}
        </div>
        <div class="driver-portrait-actions">
          <button class="btn primary" data-action="download-driver-image" data-driver-key="${d.uid || d.id}">⬇ Baixar imagem</button>
          <button class="btn secondary" data-action="change-driver-image" data-driver-key="${d.uid || d.id}">Trocar retrato</button>
        </div>
      </div>
      <div class="driver-sheet-details-col">
        <div class="driver-sheet-header-row">
          <div>
            <span class="tag tier-${d.tier}">${d.isAcademy ? "PILOTO PERSONALIZADO · TITULAR" : (tierNames[d.tier] || d.tier)} · ESTILO: ${(d.styleKey || d.aiProfile || "Equilibrado").toUpperCase()}</span>
            <h2>${d.name} <small>#${String(d.number).padStart(2, "0")}</small></h2>
            <div class="driver-meta-pills">
              <span><b>Nacionalidade:</b> ${flag.flag} ${d.nationality || "Internacional"}</span>
              <span><b>Equipe atual:</b> <i class="team-dot" style="background:${d.suitColor || d.color || "#e63956"}"></i>${currentTeam}</span>
              <span><b>Idade:</b> ${d.age || 24} anos</span>
              <span><b>Personalidade:</b> ${d.personality || d.styleKey || "Competitivo"}</span>
            </div>
          </div>
          <div class="driver-ovr-badge">
            <small>HABILIDADE GERAL</small>
            <strong>${d.overall}</strong>
            <span>POT ${d.attributes.potential}</span>
          </div>
        </div>
        <p class="driver-bio-text">${d.description}</p>
        <div class="driver-skill-banner">
          <div>
            <small>HABILIDADE EXCLUSIVA · ${skill.name.toUpperCase()}</small>
            <b>${skill.bonusLabel}</b>
            <span>Limite: ${skill.limitation}</span>
          </div>
          <div>
            <small>ESTILO DE PILOTAGEM & PERSONALIDADE</small>
            <b>${d.styleKey || "Consistente"} · ${d.personality || "Calculista"}</b>
            <span>${d.drivingStyle}</span>
          </div>
        </div>
        <div class="driver-profile-stats">
          <span>EQUIPE ATUAL<b>${currentTeam}</b></span>
          <span>ESPECIALIDADE<b>${d.specialty}</b></span>
          <span>CORRIDAS / VITÓRIAS<b>${stats.races} / ${stats.wins}</b></span>
          <span>HABILIDADE / POTENCIAL<b>${d.overall} / ${d.attributes.potential}</b></span>
        </div>
        <div class="driver-attributes">${SHEET_ATTRIBUTE_LABELS.map(
          ([k, label]) =>
            `<span>${label} <b>${d.attributes[k] ?? d.attributes.speed}</b><i class="attr-bar"><em style="width:${d.attributes[k] ?? d.attributes.speed}%"></em></i></span>`,
        ).join("")}</div>
      </div>
    </section>
    ${renderAcademySection(this, s)}
    <div class="section-label"><span>FICHAS DE PILOTOS DO CAMPEONATO (${driverCatalog.length} PILOTOS)</span><i></i><span>${s.unlockedDrivers.length}/${driverCatalog.length} CONTRATADOS</span></div>
    <div class="driver-grid">${driverCatalog.map((cDriver) => {
      const isActiveTitular = !s.promotedAcademyId && s.selectedDriver === cDriver.id;
      const cFlag = nationalityFlag(cDriver.nationality);
      const cPort = resolveDriverPortrait(cDriver, s);
      const cTeam =
        cDriver.id === s.selectedDriver
          ? s.team?.name || cDriver.teamName || "Apex Motorsport"
          : cDriver.teamName || "Escuderia Independente";
      return `<article class="driver-card driver-sheet-card panel tier-${cDriver.tier}" style="border-top:3px solid ${cDriver.suitColor || cDriver.color}">
        <div class="driver-card-top">
          <span>${cFlag.flag} ${cDriver.nationality} · ${cDriver.age} anos</span>
          <b>OVR ${cDriver.overall}</b>
        </div>
        <div class="driver-card-media">
          <img src="${cPort.src}" alt="Retrato de ${cDriver.name}" onerror="this.onerror=null;this.src='${PLACEHOLDER_DRIVER_PORTRAIT}'">
          <span class="driver-card-num" style="background:${cDriver.suitColor || cDriver.color}">#${String(cDriver.number).padStart(2, "0")}</span>
          <img class="driver-card-helmet" src="${cDriver.helmet}" alt="" onerror="this.style.display='none'">
        </div>
        <div class="driver-card-info">
          <small class="driver-card-team"><i class="team-dot" style="background:${cDriver.suitColor || cDriver.color}"></i>${cTeam} · ${tierNames[cDriver.tier] || cDriver.tier}</small>
          <h3>${cDriver.name}</h3>
          <p class="driver-card-style"><b>${cDriver.styleKey || cDriver.aiProfile}</b> · ${cDriver.exclusiveSkill?.name || cDriver.specialty}</p>
          <div class="driver-card-mini-stats">
            <span title="Ritmo de classificação">CLAS <b>${cDriver.attributes.qualifyingPace}</b></span>
            <span title="Ritmo de corrida">CORR <b>${cDriver.attributes.racePace}</b></span>
            <span title="Capacidade de ultrapassagem">ULT <b>${cDriver.attributes.overtaking}</b></span>
            <span title="Defesa de posição">DEF <b>${cDriver.attributes.defense}</b></span>
            <span title="Controle de pneus">PNEU <b>${cDriver.attributes.tireControl}</b></span>
            <span title="Consistência">CON <b>${cDriver.attributes.consistency}</b></span>
            <span title="Experiência">EXP <b>${cDriver.attributes.experience}</b></span>
            <span title="Potencial">POT <b>${cDriver.attributes.potential}</b></span>
          </div>
          <div class="driver-card-actions">
            <button class="btn ${isActiveTitular ? "primary" : "secondary"}" data-action="pilot" data-id="${cDriver.id}" ${isActiveTitular ? "disabled" : ""}>${isActiveTitular ? "TITULAR ATIVO" : s.unlockedDrivers.includes(cDriver.id) ? "SELECIONAR" : cDriver.id === 30 ? "VENÇA BAXTER" : fmt(cDriver.cost) + " CR"}</button>
            <button class="btn secondary btn-download-mini" data-action="download-driver-image" data-driver-key="${cDriver.id}" title="Baixar retrato de ${cDriver.name}">⬇ Baixar imagem</button>
          </div>
        </div>
      </article>`;
    }).join("")}</div>`;
  };

  UI.prototype.operations = function () {
    const s = this.game.save,
      level = 1 + Math.floor(s.xp / 1000),
      principal = teamPrincipalById(s.teamPrincipal ?? 0),
      primarySponsor = sponsorById(s.sponsors?.primary || "aether_ai"),
      secondarySponsor = sponsorById(s.sponsors?.secondary || "pirex_tires"),
      activePilot = activeDriverForSave(s);
    return `${this.title("CARREIRA / OPERAÇÕES DE EQUIPE", "Lidere sua escuderia rumo ao título.", "Reputação, chefe de equipe, Academia de Pilotos da Base, patrocinadores e histórico.")}<div class="ops-grid"><article class="panel ops-card"><div class="eyebrow">REPUTAÇÃO · NÍVEL ${level}</div><h2>${fmt(s.xp)} XP</h2><div class="performance-bar"><span style="width:${(s.xp % 1000) / 10}%"></span></div><p>${1000 - (s.xp % 1000)} XP para o próximo nível. Piloto titular ativo: <b>${activePilot.name}</b> (${activePilot.isAcademy ? "Promovido da Base · OVR " + activePilot.overall : "Titular · OVR " + activePilot.overall}).</p><div style="display:flex;gap:8px;flex-wrap:wrap">${b("PREPARAR CORRIDA", "setup")}${b("CRIAR PILOTO DA BASE", "open-academy-creator")}</div></article><article class="panel ops-card"><div class="eyebrow">${s.team.name.toUpperCase()} · ENGENHARIA</div><h2>Desenvolvimento ${s.team.development}/5</h2><p>Melhora o controle do carro titular, reduz até 1,2 s de troca nos boxes e torna a equipe mais consistente. Custo: ${fmt(1200 + s.team.development * 700)} CR.</p>${b("INVESTIR NA ENGENHARIA", "team-upgrade", s.team.development >= 5 ? "disabled" : "")}<p>Boxes da equipe: ${s.team.pitStats.stops} serviços · melhor ${s.team.pitStats.bestService?.toFixed(2) || "—"} s · ${s.team.pitStats.laneSeconds.toFixed(1)} s em passagem.</p><p>Chefe de Equipe: <b>${principal.name}</b> (${principal.specialty})</p><label>ALTERAR CHEFE DE EQUIPE<select data-action-select="team-principal">${teamPrincipals.map((tp) => `<option value="${tp.id}" ${tp.id === principal.id ? "selected" : ""}>${tp.name} — ${tp.role}</option>`).join("")}</select></label></article><article class="panel ops-card baxter-card"><span class="infinity">∞</span><div class="eyebrow">O ÚLTIMO DESAFIO</div><h2>Mega Baxter</h2><p>${s.baxterWon ? "Você venceu o impossível. Baxter e B-0 estão na sua coleção." : "Complete um campeonato. Depois enfrente Baxter em seu evento de elite para desbloquear o piloto supremo e o B-0."}</p>${b("DESAFIAR BAXTER", "mega-event", !s.stats.seasons && !this.game.admin.active ? "disabled" : "")}</article></div>
    ${renderAcademySection(this, s)}
    <div class="section-label"><span>PATROCINADORES OFICIAIS (10 SETORES)</span><i></i><span>${s.sponsors?.goalsCompleted || 0} METAS CUMPRIDAS · +${fmt(s.sponsors?.totalEarned || 0)} CR</span></div>
    <div class="ops-grid">
      <article class="panel ops-card" style="border-top:3px solid ${primarySponsor.primaryColor}">
        <div class="eyebrow">PATROCINADOR MASTER · ${primarySponsor.sector.toUpperCase()}</div>
        <h2>${primarySponsor.name}</h2>
        <p>${primarySponsor.tagline}</p>
        <p><b>Meta de Corrida:</b> ${primarySponsor.goalLabel}<br><b>Pagamento Fixo:</b> +${primarySponsor.basePayout} CR · <b>Bônus de Meta:</b> +${primarySponsor.goalBonus} CR</p>
        <label>ESCOLHER PATROCINADOR MASTER<select data-action-select="sponsor-primary">${sponsorCatalog.map((sp) => `<option value="${sp.id}" ${sp.id === primarySponsor.id ? "selected" : ""}>${sp.name} (${sp.sector}) — Meta: +${sp.goalBonus} CR</option>`).join("")}</select></label>
      </article>
      <article class="panel ops-card" style="border-top:3px solid ${secondarySponsor.primaryColor}">
        <div class="eyebrow">PATROCINADOR TÉCNICO · ${secondarySponsor.sector.toUpperCase()}</div>
        <h2>${secondarySponsor.name}</h2>
        <p>${secondarySponsor.tagline}</p>
        <p><b>Meta de Corrida:</b> ${secondarySponsor.goalLabel}<br><b>Pagamento Fixo:</b> +${Math.round(secondarySponsor.basePayout * 0.6)} CR · <b>Bônus de Meta:</b> +${Math.round(secondarySponsor.goalBonus * 0.6)} CR</p>
        <label>ESCOLHER PATROCINADOR TÉCNICO<select data-action-select="sponsor-secondary">${sponsorCatalog.map((sp) => `<option value="${sp.id}" ${sp.id === secondarySponsor.id ? "selected" : ""}>${sp.name} (${sp.sector})</option>`).join("")}</select></label>
      </article>
      <article class="panel ops-card">
        <div class="eyebrow">IDENTIDADE VISUAL DA ESCUDERIA</div>
        <h2>${s.team.name}</h2>
        <p>Personalize o nome da sua equipe, cores de carroceria e número oficial no grid.</p>
        <div class="sponsor-strip">
          <span class="sponsor-pill" style="background:${primarySponsor.secondaryColor};color:${primarySponsor.primaryColor}">${primarySponsor.short}</span>
          <span class="sponsor-pill" style="background:${secondarySponsor.secondaryColor};color:${secondarySponsor.primaryColor}">${secondarySponsor.short}</span>
        </div>
        ${b("EDITOR DE PINTURA E EQUIPE", "paint-editor")}
      </article>
    </div>
    <div class="section-label"><span>MEMÓRIA DAS DISPUTAS</span><i></i><span>RIVALIDADES PERSISTENTES</span></div><div class="rival-grid">${
      Object.entries(s.rivalries).length
        ? Object.entries(s.rivalries)
            .map(
              ([id, r]) =>
                `<div class="panel rival-card"><img src="${driverCatalog[id]?.portrait || driverCatalog[0].portrait}" alt=""><div><h3>${driverCatalog[id]?.name || "Rival"}</h3><p>${r.passed} ultrapassagens feitas · ${r.lost} sofridas</p><small>INTENSIDADE ${r.score.toFixed(1)} / 10</small></div></div>`,
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
            `<tr><td>P${h.position}</td><td>${trackById(h.track).name}<small>${driverCatalog[h.driver]?.name || driverCatalog[0].name}</small></td><td>${h.mode}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="3">Sua história começa na próxima largada.</td></tr>'
    }</tbody></table></div>`;
  };

  const baseUpgrades = UI.prototype.upgrades;
  UI.prototype.upgrades = function () {
    const s = this.game.save;
    const baseHtml = baseUpgrades.call(this);
    const activePU = powerUnitById(s.selectedPowerUnit ?? 0);
    const previewOverrides = this.previewOverrides || {};
    const comparison = compareSetupChanges(s, previewOverrides);
    return (
      baseHtml +
      `<div class="section-label"><span>SIMULADOR DE BANCADA · COMPARADOR ANTES × DEPOIS</span><i></i><span>IMPACTO REAL NA FÍSICA</span></div>
      <section class="panel" style="padding:16px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div><b>ACERTO AERODINÂMICO ATUAL: ${aeroSetupById(s.aeroSetup).name.toUpperCase()}</b><p class="subtle" style="margin:4px 0">${aeroSetupById(s.aeroSetup).description}</p></div>
          <label>ACERTO DE PISTA <select data-action-select="aero-setup">${aeroSetupPresets.map((a) => `<option value="${a.id}" ${a.id === (s.aeroSetup || "balanced") ? "selected" : ""}>${a.name}</option>`).join("")}</select></label>
        </div>
        <div class="comparator-grid">${comparison
          .map(
            (m) =>
              `<div class="comparator-item"><small>${m.label}</small><div><span>${m.before} ${m.displayUnit}</span> → <b class="${m.status}">${m.after} ${m.displayUnit} ${m.delta !== 0 ? `(${m.delta > 0 ? "+" : ""}${m.delta})` : ""}</b></div></div>`,
          )
          .join("")}</div>
      </section>
      <div class="section-label"><span>FORNECEDORES DE UNIDADE DE POTÊNCIA (MOTORES)</span><i></i><span>MOTOR ATIVO: ${activePU.name.toUpperCase()} · DESGASTE ${Math.round((s.engineWear || 0) * 100)}%</span></div>
      <div class="parts-workshop-grid">${powerUnits
        .map((pu) => {
          const unlocked = (s.unlockedPowerUnits || [0]).includes(pu.id);
          const selected = (s.selectedPowerUnit || 0) === pu.id;
          return `<article class="panel part-card" style="border-top:3px solid ${pu.color}">
            <div class="eyebrow">${pu.supplier.toUpperCase()} · ${pu.code}</div>
            <h3>${pu.name}</h3>
            <p class="subtle" style="margin:2px 0"><b>Foco:</b> ${pu.focus} · <b>Peso:</b> ${pu.weight} kg · <b>Confiabilidade:</b> ${Math.round(pu.reliability * 100)}%</p>
            <p style="font-size:11px;color:#94a3b8">${pu.description}</p>
            <div style="display:flex;gap:6px;margin-top:auto">
              <button class="btn secondary" data-action="preview-pu" data-id="${pu.id}">COMPARAR</button>
              <button class="btn ${selected ? "primary" : "secondary"}" data-action="select-pu" data-id="${pu.id}" ${selected ? "disabled" : ""}>${selected ? "INSTALADO" : unlocked ? "INSTALAR" : fmt(pu.cost) + " CR"}</button>
            </div>
          </article>`;
        })
        .join("")}</div>
      <div class="section-label"><span>OFICINA DE COMPONENTES · 11 SISTEMAS CONFIGURÁVEIS</span><i></i><span>PESO, CUSTO, DESGASTE E GANHO REAL</span></div>
      <div class="parts-workshop-grid">${partCategories
        .map((cat) => {
          const level = s.carParts?.[cat.key] || 0;
          const currentTier = partTier(cat.key, level);
          const nextTier = level < cat.tiers.length - 1 ? partTier(cat.key, level + 1) : null;
          const wear = Math.round((s.partWear?.[cat.key] || 0) * 100);
          return `<article class="panel part-card">
            <div class="eyebrow">${cat.short.toUpperCase()} · NÍVEL ${level + 1}/${cat.tiers.length} · DESGASTE ${wear}%</div>
            <h3>${cat.name}</h3>
            <p style="font-size:11px;color:#cbd5e1"><b>Instalado:</b> ${currentTier.label}</p>
            <p style="font-size:11px;color:#8498b3">${cat.description}</p>
            <div style="display:flex;gap:6px;margin-top:auto">
              ${nextTier ? `<button class="btn secondary" data-action="preview-part" data-key="${cat.key}" data-level="${level + 1}">COMPARAR</button><button class="btn primary" data-action="buy-part" data-key="${cat.key}">${fmt(nextTier.cost)} CR → SPEC ${String.fromCharCode(65 + level + 1)}</button>` : `<button class="btn secondary" disabled>SPEC MÁXIMA INSTALADA</button>`}
            </div>
          </article>`;
        })
        .join("")}</div>`
    );
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
      `<div class="section-label"><span>CLASSIFICAÇÃO DE EQUIPES DO CAMPEONATO (1 PILOTO POR EQUIPE)</span><i></i></div><div class="ops-grid">${teamStandings(
        this.game.save.championship,
      )
        .map(
          (t, i) =>
            `<div class="panel ops-card"><span class="eyebrow">0${i + 1}</span><h2>${t.name}</h2><p>${t.points} PONTOS · 1 piloto titular por equipe</p></div>`,
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
        )}</div><p class="subtle">Piloto titular associado: ${driverCatalog[s.selectedDriver].name} · Unidade de Potência: ${powerUnitById(s.selectedPowerUnit).name}. Consumo menor favorece autonomia.</p></section>`
    );
  };

  const render = UI.prototype.render;
  UI.prototype.render = function () {
    if (this.game && !this.game.handlePortraitFileUpload) {
      this.game.handlePortraitFileUpload = (file, targetKey, cb) =>
        handlePortraitFileUpload(this.game, file, targetKey, cb);
      this.game.downloadDriverPortrait = (key) =>
        downloadDriverPortrait(this.game, key);
    }
    render.call(this);
    const select = document.getElementById("compare-car");
    if (select)
      select.onchange = () => {
        this.compareCar = Number(select.value);
        this.render();
      };
    const uploadInput = document.getElementById("driver-portrait-upload-input");
    if (uploadInput && !uploadInput.dataset.bound) {
      uploadInput.dataset.bound = "1";
      uploadInput.addEventListener("change", (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        this.game.handlePortraitFileUpload(
          file,
          this.pendingPortraitTargetKey || null,
        );
        ev.target.value = "";
      });
    }
  };

  const show = UI.prototype.showModal;
  UI.prototype.showModal = function (type) {
    const s = this.game.save;
    let html = "";
    if (type === "academy-creator") {
      const preset =
        this.academyDraft ||
        (this.academyDraft = generateRandomAcademyPreset(
          (s.academy?.length || 0) * 97 + 17,
        ));
      const previewDoc = createAcademyDriver(preset, s.academy || []);
      const pInfo = resolveDriverPortrait(previewDoc, s);
      const teamOptions = [
        s.team?.name || "Apex Motorsport",
        "Academia Apex Motorsport",
        "Vortex Racing",
        "Scuderia Veloce",
        "Chronos Racing",
        "Aether GP",
        "Titan Motorsport",
      ];
      html = `<div class="modal-eyebrow">ACADEMIA DE PILOTOS / CRIAR PILOTO PERSONALIZADO</div><h2>Inscrever Novo Talento na Equipe</h2><p>Configure identidade, equipe, retrato 2D (do seu dispositivo ou do catálogo), habilidades individuais e estilo de pilotagem.</p><div class="academy-creator-layout"><div class="academy-creator-preview"><div class="academy-creator-2d-frame"><img id="acad-creator-portrait-img" src="${pInfo.src}" alt="Prévia 2D do piloto" onerror="this.onerror=null;this.src='${PLACEHOLDER_DRIVER_PORTRAIT}'"><span id="acad-creator-num-badge" class="driver-card-num" style="background:${previewDoc.suitColor}">#${String(previewDoc.number).padStart(2, "0")}</span></div><div class="academy-creator-summary"><b>OVR INICIAL ${previewDoc.overall} · POTENCIAL ${previewDoc.attributes.potential}</b><small>${previewDoc.programName}</small></div><label class="btn secondary file-upload-label" style="width:100%;text-align:center;box-sizing:border-box;cursor:pointer">📁 ENVIAR FOTO DO DISPOSITIVO<input id="acad-portrait-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label><small id="acad-portrait-status" class="subtle" style="font-size:10px;text-align:center">${preset.customPortrait ? "Imagem personalizada carregada" : preset.usePlaceholder ? "Usando imagem substituta" : "Usando retrato local #" + ((preset.portraitIndex ?? 0) + 1)}</small></div><div class="paint-editor academy-form"><label>NOME<input id="acad-first-name" type="text" maxlength="18" value="${preset.firstName}"></label><label>SOBRENOME<input id="acad-last-name" type="text" maxlength="18" value="${preset.lastName}"></label><label>NACIONALIDADE<select id="acad-nationality">${opt(
        NATIONALITIES.map((n) => [n, `${nationalityFlag(n).flag} ${n}`]),
        preset.nationality,
      )}</select></label><label>IDADE INICIAL (16–23)<input id="acad-age" type="number" min="16" max="23" value="${preset.age}"></label><label>NÚMERO DO CARRO<input id="acad-number" type="number" min="2" max="99" value="${preset.number}"></label><label>EQUIPE ATUAL<select id="acad-team">${opt(
        [...new Set(teamOptions)].map((t) => [t, t]),
        preset.teamName || s.team?.name || "Apex Motorsport",
      )}</select></label><label>PROGRAMA DE FORMAÇÃO<select id="acad-program">${opt(
        ACADEMY_PROGRAMS.map((p) => [p.id, p.name]),
        preset.program,
      )}</select></label><label>ESTILO DE PILOTAGEM<select id="acad-style">${opt(
        STYLE_KEYS.map((k) => [k, k]),
        preset.styleKey,
      )}</select></label><label>HABILIDADE EXCLUSIVA<select id="acad-skill">${opt(
        EXCLUSIVE_SKILLS.map((sk) => [sk.id, sk.name]),
        preset.skillId,
      )}</select></label><label>RETRATO PADRÃO / SUBSTITUTO<select id="acad-portrait-select">${opt(
        [
          ...Array.from({ length: 10 }, (_, i) => [
            String(i),
            `Retrato Oficial 0${i + 1}`,
          ]),
          ["placeholder", "Sem foto (Imagem substituta)"],
        ],
        preset.usePlaceholder ? "placeholder" : String(preset.portraitIndex ?? 0),
      )}</select></label><label>RITMO DE CLASSIFICAÇÃO (45–85)<input id="acad-attr-speed" type="number" min="45" max="85" value="${previewDoc.attributes.speed}"></label><label>RITMO DE CORRIDA (45–85)<input id="acad-attr-racecraft" type="number" min="45" max="85" value="${previewDoc.attributes.racecraft}"></label><label>ULTRAPASSAGEM (45–85)<input id="acad-attr-overtaking" type="number" min="45" max="85" value="${previewDoc.attributes.overtaking}"></label><label>DEFESA DE POSIÇÃO (45–85)<input id="acad-attr-defense" type="number" min="45" max="85" value="${previewDoc.attributes.defense}"></label><label>CONTROLE DE PNEUS (45–85)<input id="acad-attr-tire" type="number" min="45" max="85" value="${previewDoc.attributes.tireControl}"></label><label>CONSISTÊNCIA (45–85)<input id="acad-attr-consistency" type="number" min="45" max="85" value="${previewDoc.attributes.consistency}"></label><label>COR DO MACACÃO / EQUIPE<input id="acad-suit-color" type="color" value="${preset.suitColor}"></label><label>COR DO CAPACETE<input id="acad-helmet-color" type="color" value="${preset.helmetColor}"></label></div></div><div class="setting-actions">${b("GERAR TALENTO ALEATÓRIO", "academy-randomize")}${b("CRIAR E INTEGRAR À BASE", "academy-create")}</div>`;
    } else if (type === "paint-editor") {
      const l = liveries[s.selectedCar],
        p = s.customizations[s.selectedCar] || {
          primary: l.color,
          secondary: l.accent,
          detail: "#151a20",
          number: l.number,
        };
      html = `<div class="modal-eyebrow">OFICINA / IDENTIDADE DA ESCUDERIA</div><h2>Sua assinatura na pista.</h2><p>Nome da equipe, cores e número aplicados ao seu carro titular.</p><div class="paint-editor"><label>NOME DA EQUIPE<input id="team-custom-name" type="text" maxlength="30" value="${s.team.name || "Apex Motorsport"}"></label><label>COR PRINCIPAL<input id="paint-primary" type="color" value="${p.primary}"></label><label>COR SECUNDÁRIA<input id="paint-secondary" type="color" value="${p.secondary}"></label><label>DETALHES<input id="paint-detail" type="color" value="${p.detail}"></label><label>NÚMERO<input id="paint-number" type="number" min="0" max="99" value="${p.number}"></label></div><div class="setting-actions">${b("RESTAURAR ORIGINAL", "reset-paint")}${b("APLICAR AO CARRO", "save-paint")}</div>`;
    } else if (type === "reset-career")
      html = `<h2>Reiniciar a carreira?</h2><p>Créditos, carros, pilotos, contratos, recordes e campeonatos serão apagados deste save. Exporte seus dados antes, se desejar.</p>${b("CONFIRMAR REINÍCIO", "confirm-reset")}`;
    else if (type === "confirm-exit")
      html = `<h2>Abandonar esta corrida?</h2><p>A prova atual não concede recompensa nem registra uma etapa. Seu progresso anterior será mantido.</p><div class="setting-actions">${b("CONTINUAR CORRENDO", "resume")}${b("ABANDONAR CORRIDA", "confirm-exit")}</div>`;
    else if (type === "pit-options") {
      const c = this.game.race.localCar || this.game.race.cars[0],
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
        )}</div><p class="subtle">P: chamada rápida · entre pelo lado sinalizado dos boxes, 210–115 m antes da linha. Desaceleração assistida e faixa limitada a 65 km/h. Plano salvo vale para próximas corridas de duração compatível.</p><div class="pit-rivals"><b>RIVAIS / estratégia observada</b>${rivals.map((r, i) => `<div><span>${i + 1}. ${r.name}</span><span>${compounds[r.tires.compound].label} ${Math.round(r.tires.health * 100)}%</span><span>${r.pit.stops} paradas · ${r.pit.requested ? "preparando" : r.pit.state === "track" ? "na pista" : r.pit.state}</span></div>`).join("")}</div><p>Último serviço: ${p.lastService?.toFixed(1) || "—"} s · Última passagem: ${p.lastLaneTime?.toFixed(1) || "—"} s · ${p.reason || "Sem chamada"}.</p>`;
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
      if (type === "academy-creator") {
        const updateCreatorPreview = () => {
          const portraitSel = document.getElementById("acad-portrait-select")?.value;
          const usePlaceholder = portraitSel === "placeholder";
          const portraitIndex = usePlaceholder ? 0 : Number(portraitSel) || 0;
          const draft = {
            ...this.academyDraft,
            firstName: document.getElementById("acad-first-name")?.value,
            lastName: document.getElementById("acad-last-name")?.value,
            nationality: document.getElementById("acad-nationality")?.value,
            age: Number(document.getElementById("acad-age")?.value),
            number: Number(document.getElementById("acad-number")?.value),
            teamName: document.getElementById("acad-team")?.value,
            program: document.getElementById("acad-program")?.value,
            styleKey: document.getElementById("acad-style")?.value,
            skillId: document.getElementById("acad-skill")?.value,
            suitColor: document.getElementById("acad-suit-color")?.value,
            helmetColor: document.getElementById("acad-helmet-color")?.value,
            portraitIndex,
            usePlaceholder,
            customAttributes: {
              speed: Number(document.getElementById("acad-attr-speed")?.value),
              racecraft: Number(document.getElementById("acad-attr-racecraft")?.value),
              overtaking: Number(document.getElementById("acad-attr-overtaking")?.value),
              defense: Number(document.getElementById("acad-attr-defense")?.value),
              tireControl: Number(document.getElementById("acad-attr-tire")?.value),
              consistency: Number(document.getElementById("acad-attr-consistency")?.value),
            },
          };
          this.academyDraft = draft;
          const doc = createAcademyDriver(draft, s.academy || []);
          const imgEl = document.getElementById("acad-creator-portrait-img");
          if (imgEl) imgEl.src = doc.portrait;
          const numEl = document.getElementById("acad-creator-num-badge");
          if (numEl) {
            numEl.textContent = "#" + String(doc.number).padStart(2, "0");
            numEl.style.background = doc.suitColor;
          }
          const statusEl = document.getElementById("acad-portrait-status");
          if (statusEl) {
            statusEl.textContent = draft.customPortrait
              ? "Imagem personalizada carregada"
              : draft.usePlaceholder
                ? "Usando imagem substituta"
                : "Usando retrato oficial #" + (portraitIndex + 1);
          }
          const sum = node.querySelector(".academy-creator-summary");
          if (sum) {
            sum.innerHTML = `<b>OVR INICIAL ${doc.overall} · POTENCIAL ${doc.attributes.potential}</b><small>${doc.programName}</small>`;
          }
        };
        updateCreatorPreview();
        node
          .querySelectorAll("input:not([type='file']), select")
          .forEach((el) => el.addEventListener("input", updateCreatorPreview));
        const fileIn = document.getElementById("acad-portrait-file");
        if (fileIn) {
          fileIn.addEventListener("change", (ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            this.game.handlePortraitFileUpload(file, "__academy_draft__", (dataUrl) => {
              this.academyDraft = {
                ...(this.academyDraft || {}),
                customPortrait: dataUrl,
                usePlaceholder: false,
              };
              updateCreatorPreview();
            });
          });
        }
      }
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
    if (type === "results" && this.game.lastReward?.results) {
      const top3 = this.game.lastReward.results.slice(0, 3);
      const sponsorSummary = this.game.lastReward.sponsorReport;
      const podiumHtml = `<div class="podium-stage" aria-label="Pódio da Corrida">
        ${[top3[1], top3[0], top3[2]]
          .filter(Boolean)
          .map(
            (r) =>
              `<div class="podium-step p${r.position}"><span>🏆 P${r.position}</span><strong>${r.name}</strong><small>${r.time ? r.time.toFixed(2) + " s" : "Finalizado"} · +${r.points} pts</small></div>`,
          )
          .join("")}
      </div>${sponsorSummary ? `<p class="subtle" style="text-align:center"><b>Patrocinadores (${sponsorSummary.primaryName}):</b> ${sponsorSummary.met ? "Meta cumprida! +" + sponsorSummary.total + " CR" : "Base +" + sponsorSummary.total + " CR"}</p>` : ""}`;
      const tableEl = modal.querySelector(".results-table");
      if (tableEl) tableEl.insertAdjacentHTML("beforebegin", podiumHtml);
    }
    if (type === "pause" && this.game.admin.active)
      modal.insertAdjacentHTML(
        "beforeend",
        b("INSPEÇÃO ADMIN", "admin-inspect"),
      );
  };
}
