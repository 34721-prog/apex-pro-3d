import { validPlan } from "../strategy/ManagerPlans.js";
function refresh(g) {
  const open = [...document.querySelectorAll(".manager-plan[open]")].map(
      (n) => n.closest("[data-manager-card]").dataset.managerCard,
    ),
    scroll = document.querySelector(".manager-body")?.scrollTop || 0;
  if (g.ui.modal) g.ui.showModal(g.ui.modal);
  else {
    g.ui.render();
    g.bindTouch();
  }
  for (const id of open) {
    const n = document.querySelector(
      `[data-manager-card="${id}"] .manager-plan`,
    );
    if (n) n.open = true;
  }
  if (g.race) g.ui.updateHUD(g.race, performance.now() + 150);
  const body = document.querySelector(".manager-body");
  if (body) body.scrollTop = scroll;
}
export function managerChange(g, el) {
  if (el.hasAttribute("data-manager-focus")) {
    g.world.focusId = Number(el.value);
    g.world.cameraReady = false;
    return true;
  }
  if (el.hasAttribute("data-manager-priority")) {
    const c = g.race?.cars.find((c) => c.id === Number(el.value));
    if (g.race?.manager.owns(c)) {
      g.race.manager.priorityId = c.id;
      g.race.manager.log(
        c,
        "priority",
        "Prioridade estratégica escolhida pelo chefe",
      );
      refresh(g);
    }
    return true;
  }
  if (el.hasAttribute("data-manager-objective")) {
    g.save.settings.managerObjective = el.value;
    g.race?.manager?.setObjective(el.value);
    g.store();
    if (g.race) refresh(g);
    return true;
  }
  if (!el.hasAttribute("data-manager-car")) return false;
  const id = Number(el.dataset.managerCar),
    live = g.ui.page === "race",
    c = live ? g.race?.cars.find((c) => c.id === id) : null;
  if (live && !g.race.manager.owns(c)) return true;
  const slot = live
    ? g.race.cars.filter((c) => g.race.manager.owns(c)).indexOf(c)
    : id;
  let p = validPlan(
      live ? c.managerPlan : g.save.settings.managerPlans[slot],
      live ? g.race.laps : g.save.settings.laps,
    ),
    key = el.dataset.managerField;
  if (key === "nextCompound") {
    if (c.pit.state === "track" && !c.pit.approachAuthorized)
      c.pit.compound = el.value;
    else {
      g.ui.toast("Parada comprometida; composto de serviço bloqueado.");
      el.value = c.pit.compound;
    }
    return true;
  }
  if (key === "stopCount") {
    const n = Math.max(0, Math.min(6, Number(el.value)));
    p.stops = p.stops.slice(0, n);
    while (p.stops.length < n) {
      const lap = Math.max(
        1,
        Math.floor(
          ((p.stops.length + 1) * (live ? g.race.laps : g.save.settings.laps)) /
            (n + 1),
        ),
      );
      p.stops.push({ from: lap, to: lap, compound: "medium" });
    }
  } else if (el.dataset.managerWindow) {
    const i = Number(el.dataset.managerStop);
    if (p.stops[i])
      p.stops[i][el.dataset.managerWindow] =
        el.dataset.managerWindow === "compound" ? el.value : Number(el.value);
  } else if (key)
    p[key] =
      key === "automatic"
        ? el.value === "true"
        : key === "avoid"
          ? Number(el.value)
          : el.value;
  p = validPlan(p, live ? g.race.laps : g.save.settings.laps);
  if (live) {
    const patch =
      key === "stopCount" || el.dataset.managerWindow
        ? { stops: p.stops }
        : { [key]: p[key] };
    if (!g.race.manager.order(id, patch)) {
      g.ui.toast("Ordem indisponível; ataque máximo tem limite e recuperação.");
      refresh(g);
      return true;
    }
  }
  g.save.settings.managerPlans[slot] = p;
  g.store();
  refresh(g);
  return true;
}
export function managerAction(g, action, data) {
  if (!action.startsWith("manager-")) return false;
  const r = g.race,
    id = Number(data.id ?? g.world.focusId ?? 0),
    c = r?.cars.find((c) => c.id === id);
  if (action === "manager-review") {
    if (r?.done) {
      g.ui.closeModal();
      g.ui.navigate("management");
    }
    return true;
  }
  if (action === "manager-drive" && r && !r.done) {
    const manual = !r.manualControl;
    r.manualControl = manual;
    r.delegated = !manual;
    g.simulating = false;
    g.controls.clear();
    g.loop.reset();
    r.manager.log(
      r.cars[0],
      "control",
      manual
        ? "Direção manual voluntária do carro 1"
        : "Gerenciamento: IA retomou o carro 1",
    );
    g.ui.toast(
      manual
        ? "MANUAL · você pilota apenas o carro 1"
        : "GERENCIAMENTO · ambos os pilotos são autônomos",
    );
    refresh(g);
    return true;
  }
  if (action === "manager-focus" && c) {
    g.world.focusId = c.id;
    g.world.cameraReady = false;
    return true;
  }
  if (action === "manager-open") {
    if (r) {
      const p = document.querySelector(".manager-central");
      if (p) p.open = true;
    } else g.ui.navigate("management");
    return true;
  }
  if (r?.manager && c) {
    let cmd = action.slice(8),
      compound = c.pit.compound;
    if (cmd === "accept") {
      const a = c.strategyAdvice;
      if (a?.key === "hot") {
        const ok = r.manager.order(id, { tireCare: "temperature" });
        g.ui.toast(
          ok ? "Gestão de temperatura aplicada." : "Piloto indisponível.",
        );
        refresh(g);
        return true;
      }
      if (a?.action === "pit" || a?.action === "review") cmd = "pit";
      else if (["overcut", "traffic"].includes(a?.key)) cmd = "defer";
      else {
        g.ui.toast("Informação atual; não há nova ação a executar.");
        return true;
      }
      compound = a?.compound || compound;
    }
    const ok = r.manager.command(id, cmd, compound);
    g.ui.toast(
      ok
        ? "Ordem registrada para o carro " + (id + 1)
        : "Indisponível: carro de outra equipe, encerrado ou entrada já comprometida.",
    );
    g.controls.clear();
    return true;
  }
  return true;
}
