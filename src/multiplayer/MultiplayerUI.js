import { trackById } from "../data/tracks.js";
import { MAX_RACE_LAPS, MIN_RACE_LAPS, MAX_GRID_CARS } from "../racing/RaceConfig.js";
import { icon } from "../icons.js";

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const lapOptions = [8, 9, 10, 12, 14, 20, 25, 30];
const trackSelect = (tracks, value, name = "track_id", disabled = false) =>
  `<select name="${name}" ${disabled ? "disabled" : ""}>${tracks
    .map((track) => `<option value="${esc(track.id)}" ${track.id === value ? "selected" : ""}>${esc(track.name)}</option>`)
    .join("")}</select>`;
const lapSelect = (value, name = "lap_count", disabled = false) =>
  `<select name="${name}" min="${MIN_RACE_LAPS}" max="${MAX_RACE_LAPS}" ${disabled ? "disabled" : ""}>${lapOptions
    .map((laps) => `<option value="${laps}" ${Number(value) === laps ? "selected" : ""}>${laps} voltas</option>`)
    .join("")}</select>`;
const maxPlayerSelect = (value, disabled = false) =>
  `<select name="max_players" ${disabled ? "disabled" : ""}>${Array.from({ length: MAX_GRID_CARS - 1 }, (_, i) => i + 2)
    .map((n) => `<option value="${n}" ${Number(value) === n ? "selected" : ""}>${n} jogadores</option>`)
    .join("")}</select>`;
const botSelect = (value, disabled = false) =>
  `<select name="bot_count" ${disabled ? "disabled" : ""}>${Array.from({ length: MAX_GRID_CARS }, (_, i) => i)
    .map((n) => `<option value="${n}" ${Number(value) === n ? "selected" : ""}>${n} ${n === 1 ? "bot" : "bots"} (máx. ${MAX_GRID_CARS})</option>`)
    .join("")}</select>`;

export function extendMultiplayerUI(UI) {
  UI.prototype.multiplayer = function () {
    const mp = this.game.multiplayer;
    if (!mp) return this.title("APEX ONLINE", "Multiplayer indisponível.");
    const state = mp.state;
    return `${this.title("APEX ONLINE / CORRIDAS REAIS", "Corra com pessoas de verdade.", "Salas, convites e corridas sincronizadas. Sua carreira local continua intacta.")}
      ${state.error ? `<div class="mp-alert" role="alert"><span>${icon("alert")}</span><p>${esc(state.error)}</p><button data-action="mp-close-error" aria-label="Fechar">${icon("close")}</button></div>` : ""}
      ${state.info ? `<div class="mp-info" role="status"><span class="live-dot"></span>${esc(state.info)}</div>` : ""}
      ${!state.configured ? this.multiplayerUnconfigured() : !state.profile ? this.multiplayerIdentity() : state.room ? this.multiplayerLobby() : this.multiplayerRooms()}`;
  };

  UI.prototype.multiplayerUnconfigured = function () {
    return `<section class="panel mp-setup-required"><span class="mp-mark">${icon("wifi")}</span><div><div class="eyebrow">CONFIGURAÇÃO NECESSÁRIA</div><h2>Conecte um projeto Supabase.</h2><p>Este modo usa autenticação anônima real, Postgres com RLS e Supabase Realtime. Nenhuma sala fictícia é exibida.</p><ol><li>Crie o projeto e aplique as migrations de <code>supabase/migrations/</code>.</li><li>Ative <b>Anonymous Sign-Ins</b> em Authentication → Sign In / Providers.</li><li>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> e reinicie o Vite.</li></ol><p class="subtle">Não use a chave <code>service_role</code> no frontend.</p></div></section>`;
  };

  UI.prototype.multiplayerIdentity = function () {
    const mp = this.game.multiplayer;
    return `<section class="mp-identity-layout"><article class="panel mp-identity-card"><div class="eyebrow">ENTRADA RÁPIDA · CONVIDADO</div><h2>Escolha seu nome no grid.</h2><p>Sem e-mail, senha ou cadastro longo. O Supabase cria uma identidade anônima estável nesta sessão do navegador.</p><form id="mp-guest-form" class="mp-form" autocomplete="off" onsubmit="return false"><label>NOME DE EXIBIÇÃO<input id="mp-display-name" name="display_name" maxlength="24" minlength="2" placeholder="Ex.: Alex" required></label><button class="btn primary" data-action="mp-guest" ${mp.state.busy ? "disabled" : ""}>${mp.state.busy ? "CONECTANDO…" : "ENTRAR COMO CONVIDADO"} ${icon("arrow")}</button></form>${mp.state.googleEnabled ? `<div class="mp-divider"><span>OU</span></div><button class="btn secondary full-width" data-action="mp-google">${icon("user")} CONTINUAR COM GOOGLE</button><small class="subtle">OAuth real do Supabase. O provedor e as URLs precisam estar configurados.</small>` : `<small class="subtle">Google é opcional e só aparece quando o OAuth real estiver habilitado.</small>`}</article><article class="panel mp-guest-note"><span class="mp-kicker">IDENTIDADE DO JOGADOR</span><b>Sem conta tradicional.</b><p>O ID vem de Supabase Auth Anonymous. Nome e UUID não substituem a sessão autenticada nem dão permissão por si só.</p><div class="mp-connection-pill ${mp.state.connection}"><i></i>${connectionLabel(mp.state.connection)}</div></article></section>`;
  };

  UI.prototype.multiplayerRooms = function () {
    const mp = this.game.multiplayer;
    const state = mp.state;
    const profile = state.profile;
    const roomRows = state.publicRooms.map((room) => {
      const track = trackById(room.track_id);
      return `<article class="mp-room-row"><div class="mp-room-status"><i class="live-dot"></i><small>${esc(room.status === "waiting" ? "LOBBY" : room.status.toUpperCase())}</small></div><div class="mp-room-main"><b>${esc(room.name)}</b><span>${esc(track.name)} · ${room.lap_count} voltas · ${room.player_count}/${room.max_players} jogadores · até ${room.bot_count} bots</span></div><div class="mp-room-actions"><span class="mp-public-label">PÚBLICA</span><button class="btn secondary" data-action="mp-join-room" data-room-id="${esc(room.id)}" ${room.player_count >= room.max_players || state.busy ? "disabled" : ""}>ENTRAR ${icon("arrow")}</button></div></article>`;
    }).join("");
    return `<section class="mp-profile-strip panel"><div class="mp-avatar">${esc(profile.display_name.slice(0, 1).toUpperCase())}</div><div><small>JOGADOR ${profile.isAnonymous ? "CONVIDADO" : "GOOGLE"}</small><b>${esc(profile.display_name)}</b><span>${esc(profile.id.slice(0, 8))}… · salvo pelo Supabase Auth</span></div><form id="mp-profile-name-form" class="mp-profile-name" onsubmit="return false"><input id="mp-new-name" value="${esc(profile.display_name)}" maxlength="24" aria-label="Novo nome de exibição"><button class="btn secondary" data-action="mp-name">SALVAR NOME</button></form>${profile.isAnonymous && state.googleEnabled ? `<button class="btn text-btn mp-google-link" data-action="mp-google">VINCULAR GOOGLE</button>` : ""}</section>
      <div class="mp-workspace"><section class="panel mp-create-card"><div class="eyebrow">NOVO GRID</div><h2>Criar sala.</h2><p>O anfitrião controla pista e largada. O limite do grid real é ${MAX_GRID_CARS} carros.</p><form id="mp-create-form" class="mp-form mp-room-form" autocomplete="off" onsubmit="return false"><label>NOME DA SALA<input name="name" value="Sala Apex" maxlength="40" minlength="3" required></label><label>VISIBILIDADE<select name="visibility"><option value="public">Pública · aparece na busca</option><option value="private">Privada · somente convite</option></select></label><label>PISTA${trackSelect(mp.trackOptions, this.game.save.settings.track)}</label><label>VOLTAS${lapSelect(8)}</label><label>JOGADORES${maxPlayerSelect(6)}</label><label>BOTS${botSelect(5)}</label><small class="subtle">Bots preenchem as vagas restantes até o grid físico de seis; configurações inválidas são rejeitadas também pelo banco.</small><button class="btn primary" data-action="mp-create" ${state.busy ? "disabled" : ""}>CRIAR SALA ${icon("arrow")}</button></form><div class="mp-join-code"><div class="eyebrow">TEM UM CONVITE?</div><div class="mp-code-entry"><input id="mp-join-code-input" maxlength="8" minlength="8" placeholder="CÓDIGO DE 8 CARACTERES" aria-label="Código de convite" autocomplete="off" spellcheck="false"><button class="btn secondary" data-action="mp-join-code">ENTRAR PELO CÓDIGO</button></div></div></section><section class="panel mp-room-list"><div class="mp-section-head"><div><div class="eyebrow">SALAS PÚBLICAS</div><h2>Encontre uma corrida.</h2></div><button class="btn text-btn" data-action="mp-refresh" ${state.busy ? "disabled" : ""}>${icon("reset")} ATUALIZAR</button></div>${roomRows || `<div class="mp-empty"><span>${icon("flag")}</span><b>Nenhuma sala pública disponível.</b><small>Crie uma sala ou atualize a lista. Salas fechadas e privadas não aparecem.</small></div>`}</section></div>`;
  };

  UI.prototype.multiplayerLobby = function () {
    const mp = this.game.multiplayer;
    const { room, players, results, profile } = mp.state;
    if (!room) return this.multiplayerRooms();
    const isHost = room.host_id === profile?.id;
    const own = players.find((p) => p.player_id === profile?.id);
    const allReady = players.length > 0 && players.every((p) => p.ready && p.connection_status === "online");
    const effectiveBots = Math.min(Number(room.bot_count) || 0, Math.max(0, MAX_GRID_CARS - players.length));
    const track = trackById(room.track_id);
    const isWaiting = room.status === "waiting";
    const isResults = room.status === "results";
    const title = isWaiting ? "Preparação do grid." : room.status === "countdown" ? "Largada confirmada." : room.status === "racing" ? "Corrida em andamento." : isResults ? "Bandeirada final." : "Sala encerrada.";
    const statusText = {
      waiting: "AGUARDANDO PREPARAÇÃO",
      countdown: "CONTAGEM REGRESSIVA",
      racing: "CORRIDA AO VIVO",
      results: "RESULTADO FINAL",
      closed: "SALA ENCERRADA",
    }[room.status] || "SALA";
    const participantCards = players.map((p) => `<li class="mp-participant ${p.connection_status}"><span class="mp-avatar">${esc((p.display_name || "?").slice(0, 1).toUpperCase())}</span><div class="mp-participant-name"><b>${esc(p.display_name)}</b><small>${p.player_id === room.host_id ? "ANFITRIÃO" : "PILOTO"}${p.player_id === profile?.id ? " · VOCÊ" : ""}</small></div><span class="mp-ready-state ${p.ready ? "ready" : ""}"><i></i>${p.ready ? "PRONTO" : isWaiting ? "PREPARANDO" : "PRESENTE"}</span><span class="mp-presence ${p.connection_status}"><i></i>${connectionLabel(p.connection_status)}</span></li>`).join("");
    const resultRows = results.map((r) => `<tr><td>P${r.position}</td><td>${esc(r.driver_name)}${r.player_id ? "" : " <small>BOT</small>"}</td><td>${r.result_status === "finished" ? formatRaceTime(Number(r.finish_time) + Number(r.penalty_seconds || 0)) : esc(r.result_status === "disconnected" ? "Desconectado" : "DNF")}</td><td>${r.completed_laps}/${room.lap_count}</td><td>${r.best_lap ? formatRaceTime(Number(r.best_lap)) : "—"}</td></tr>`).join("");
    return `<div class="mp-lobby-header panel"><div><span class="mp-room-tag"><i></i>${esc(statusText)}</span><div class="eyebrow">${room.visibility === "private" ? "SALA PRIVADA" : "SALA PÚBLICA"} · ${esc(track.name.toUpperCase())}</div><h2>${esc(title)}</h2><p>${esc(room.name)} · ${room.lap_count} voltas · ${players.length}/${room.max_players} jogadores · ${effectiveBots} bots no grid</p></div><div class="mp-invite-box"><small>CÓDIGO PARA CONVIDAR</small><b>${esc(room.code)}</b><button class="btn secondary" data-action="mp-copy-code">${icon("copy")} COPIAR</button></div></div>
      <div class="mp-lobby-layout"><section class="panel mp-participants-card"><div class="mp-section-head"><div><div class="eyebrow">PARTICIPANTES REAIS</div><h3>${players.length} / ${room.max_players} pilotos</h3></div><span class="mp-connection-pill ${mp.state.connection}"><i></i>${connectionLabel(mp.state.connection)}</span></div><ul class="mp-participant-list">${participantCards || `<li class="mp-empty">Carregando participantes…</li>`}</ul>${isWaiting ? `<div class="mp-readiness"><div><b>${own?.ready ? "Você está pronto." : "Confirme quando estiver pronto."}</b><small>${mp.state.trackReady ? "Todos os pilotos conectados precisam confirmar antes da largada." : "Aguarde o carregamento local do circuito antes de confirmar presença."}</small></div><button class="btn ${own?.ready ? "secondary" : "primary"}" data-action="mp-ready" data-ready="${own?.ready ? "false" : "true"}" ${!own || mp.state.busy || (!own.ready && !mp.state.trackReady) ? "disabled" : ""}>${own?.ready ? "CANCELAR PRONTO" : mp.state.trackReady ? "ESTOU PRONTO" : "PREPARANDO CIRCUITO…"}</button></div>` : ""}</section>
      <section class="panel mp-config-card"><div class="eyebrow">CONFIGURAÇÃO ATUAL</div><h3>${isHost ? "Controle do anfitrião" : "Definida pelo anfitrião"}</h3>${isHost && isWaiting ? `<form id="mp-lobby-config" class="mp-form mp-room-form" onsubmit="return false"><label>NOME<input name="name" value="${esc(room.name)}" maxlength="40" required></label><label>VISIBILIDADE<select name="visibility"><option value="public" ${room.visibility === "public" ? "selected" : ""}>Pública</option><option value="private" ${room.visibility === "private" ? "selected" : ""}>Privada</option></select></label><label>PISTA${trackSelect(mp.trackOptions, room.track_id, "track_id")}</label><label>VOLTAS${lapSelect(room.lap_count)}</label><label>JOGADORES${maxPlayerSelect(room.max_players)}</label><label>BOTS${botSelect(room.bot_count)}</label><button class="btn secondary" data-action="mp-save-config">SALVAR CONFIGURAÇÃO</button></form>` : `<dl class="mp-config-values"><div><dt>PISTA</dt><dd>${esc(track.name)}</dd></div><div><dt>VOLTAS</dt><dd>${room.lap_count}</dd></div><div><dt>JOGADORES</dt><dd>${players.length} / ${room.max_players}</dd></div><div><dt>BOTS NO GRID</dt><dd>${effectiveBots}</dd></div><div><dt>STATUS</dt><dd>${esc(statusText)}</dd></div></dl>`}${isWaiting && isHost ? `<button class="btn primary mp-start-button" data-action="mp-start" ${!allReady || mp.state.busy ? "disabled" : ""}>${allReady ? "INICIAR CONTAGEM REGRESSIVA" : "AGUARDANDO TODOS PRONTOS"} ${icon("arrow")}</button>` : ""}${room.status === "countdown" ? `<div class="mp-countdown-box"><span class="live-dot"></span><b>Largada sincronizada</b><small>O relógio do Supabase coordena a saída.</small></div>` : ""}${isResults ? `<div class="mp-online-results"><div class="eyebrow">CLASSIFICAÇÃO FINAL · ${esc(track.name.toUpperCase())}</div>${resultRows ? `<div class="mp-results-table"><table><thead><tr><th>POS</th><th>PILOTO</th><th>TEMPO</th><th>VOLTAS</th><th>MELHOR</th></tr></thead><tbody>${resultRows}</tbody></table></div>` : `<p>Resultado indisponível para esta sessão.</p>`}${isHost ? `<button class="btn primary" data-action="mp-return-lobby">VOLTAR AO LOBBY / REMATCH ${icon("arrow")}</button>` : `<p class="subtle">O anfitrião poderá devolver a sala ao lobby para a próxima corrida.</p>`}</div>` : ""}<div class="mp-lobby-actions"><button class="btn text-btn" data-action="mp-leave">${icon("arrow")} SAIR DA SALA</button><small>Sair não encerra a sessão dos outros participantes.</small></div></section></div>`;
  };
}

function connectionLabel(status) {
  return ({ online: "CONECTADO", reconnecting: "RECONECTANDO", offline: "DESCONECTADO", unconfigured: "CONFIGURAÇÃO NECESSÁRIA" })[status] || "CONECTANDO";
}
function formatRaceTime(value) {
  if (!Number.isFinite(value)) return "—";
  const minutes = Math.floor(value / 60);
  return `${minutes}:${(value % 60).toFixed(3).padStart(6, "0")}`;
}
