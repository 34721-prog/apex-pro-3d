import { trackCatalog, trackCategories, trackById } from "../data/tracks.js";
import { trackPreview } from "../data/TrackGeometry.js";
import { clock } from "./RaceHUD.js";
export function trackSelector(ui) {
  const s = ui.game.save,
    selected = trackById(s.settings.track),
    meta = trackPreview(selected),
    filter = ui.trackFilter || "Todos";
  const record = (t) =>
    s.records[`${t.id}:${s.settings.realism}:${s.settings.weather}`];
  return `${ui.title("CIRCUITOS / " + trackCatalog.length + " DESTINOS", "Escolha o próximo desafio.", "Traçados originais. Cada reta, cada curva, uma nova corrida.")}<section class="track-showcase panel"><div class="scene-slot track-scene"></div><div class="track-preview-info"><span class="tag">PRÉVIA 3D · ${selected.category.toUpperCase()}</span><h2>${selected.name}</h2><p>${selected.description}</p><div class="track-selected-facts"><b>${(meta.length / 1000).toFixed(2)} km</b><b>~${meta.corners} curvas</b><b>${selected.width} m largura</b></div><p>${selected.region} · dificuldade ${selected.difficulty}/5</p><small>Melhor · ${clock(record(selected))} · ${s.settings.realism === "realistic" ? "realista" : "arcade"} / ${s.settings.weather === "rain" ? "chuva" : "seco"}</small><div><button class="btn secondary" data-action="venue-tour">ARQUIBANCADAS · PRÓXIMA →</button><button class="btn secondary" data-action="track-overview">VISTA GERAL ↗</button></div><button class="btn primary" data-action="setup">PREPARAR CORRIDA →</button></div></section><nav class="track-filters" aria-label="Categorias de circuitos">${trackCategories.map((c) => `<button data-action="track-filter" data-category="${c}" class="${c === filter ? "selected" : ""}">${c}</button>`).join("")}</nav><section class="circuit-grid">${trackCatalog
    .filter(
      (t) =>
        filter === "Todos" ||
        t.category === filter ||
        (filter === "Noite" && t.night),
    )
    .map((t) => {
      const m = trackPreview(t);
      return `<article class="circuit-card panel ${t.id === selected.id ? "selected" : ""}" data-track-id="${t.id}"><div class="circuit-thumb">${m.svg}<span>${t.night ? "NOITE" : t.sunset ? "ENTARDECER" : t.kind.toUpperCase()}</span></div><div class="circuit-info"><small>${t.region}</small><h3>${t.name}</h3><p>${t.feature}</p><div class="circuit-specs"><span>${(m.length / 1000).toFixed(2)} km</span><span>~${m.corners} curvas</span><span>${t.width} m</span><span>DIF ${t.difficulty}/5</span></div><div class="circuit-record"><span>MELHOR TEMPO</span><b>${clock(record(t))}</b></div><button class="btn secondary" data-action="choose-track" data-id="${t.id}">${t.id === selected.id ? "SELECIONADO · VER 3D" : "SELECIONAR / VER 3D"} ↗</button></div></article>`;
    })
    .join("")}</section>`;
}
