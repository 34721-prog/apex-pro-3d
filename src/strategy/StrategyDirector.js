import { driverCatalog } from "../data/drivers.js";
import {
  validPlan,
  applySetup,
  rivalPlan,
  rivalProfiles,
} from "./ManagerPlans.js";
import { defaultStrategy, policyFor } from "./RaceStrategy.js";
import { referenceLap, pitLoss } from "./StrategyEstimator.js";
import { requestPit } from "./PitStop.js";
import { length } from "../track.js";
const paceMap = {
  conserve: "economy",
  balanced: "balanced",
  aggressive: "attack",
  maximum: "qualifying",
};
const copy = (x) => JSON.parse(JSON.stringify(x));
export class StrategyDirector {
  constructor(race, { plans = [], objective = "both", points = {} } = {}) {
    Object.defineProperty(this, "race", { value: race });
    this.teamId = race.cars[0].teamId;
    this.objective = ["both", "drivers", "constructors"].includes(objective)
      ? objective
      : "both";
    this.points = { ...points };
    this.priorityId = race.cars
      .filter((c) => c.teamId === this.teamId)
      .sort((a, b) => (points[b.id] || 0) - (points[a.id] || 0))[0].id;
    this.decisions = [];
    this.next = 0;
    this.serial = 0;
    this.initial = [];
    let slot = 0;
    for (const c of race.cars) {
      c.name = driverCatalog[c.driverId].name;
      c.managerPlan =
        c.teamId === this.teamId
          ? validPlan(plans[slot++], race.laps)
          : rivalPlan(c, race);
      if (c.teamId !== this.teamId) {
        const mate = race.cars.find((o) => o !== c && o.teamId === c.teamId),
          lead = (points[c.id] || 0) - (points[mate?.id] || 0);
        c.rivalProtect = lead > 8;
        if (lead > 8) {
          c.managerPlan.overtake = "conservative";
          c.managerPlan.defense = "hold";
        } else if (lead < -8) c.managerPlan.overtake = "aggressive";
      }
      c.managerControlled = true;
      c.strategyIdentity =
        c.teamId === this.teamId
          ? "Sua equipe"
          : rivalProfiles[c.teamId % 6].name;
      c.stats = applySetup(c.stats, c.managerPlan.setup);
      c.tires.compound = c.managerPlan.start;
      c.pit.compound = c.managerPlan.stops[0]?.compound || c.managerPlan.start;
      c.tires.distance = 0;
      c.stints = [];
      c.pit.plan = [];
      c.managerHoldLap = 0;
      c.nextStop = 0;
      c.seenStops = 0;
      c.observedPit = "track";
      c.managerSmooth = { pace: 1, throttle: 1 };
      this.applyPolicy(c);
      this.initial.push({
        id: c.id,
        driverId: c.driverId,
        plan: copy(c.managerPlan),
      });
    }
    this.setObjective(this.objective);
  }
  owns(c) {
    return !!c && c.teamId === this.teamId;
  }
  log(c, type, detail) {
    this.decisions.push({
      id: ++this.serial,
      time: this.race.time,
      car: c.id,
      lap: c.lap + 1,
      type,
      detail: String(detail).slice(0, 240),
    });
    if (this.decisions.length > 120) this.decisions.shift();
  }
  applyPolicy(c) {
    const p = c.managerPlan;
    c.strategy = {
      ...defaultStrategy(),
      pace: paceMap[p.pace],
      overtake: p.overtake,
      defense: p.defense,
      line: p.defense === "avoid" ? "safe" : "ideal",
    };
    const target = policyFor(c.strategy);
    c.managerTarget = { pace: target.pace, throttle: target.throttle };
    if (p.tireCare === "save") {
      c.managerTarget.pace *= 0.95;
      c.managerTarget.throttle = Math.min(0.9, c.managerTarget.throttle);
    }
    if (p.fuel === "save" && c.realism === "realistic") {
      c.managerTarget.pace *= 0.97;
      c.managerTarget.throttle = Math.min(0.8, c.managerTarget.throttle);
    }
    c.policy = target;
    c.policy.pace = c.managerSmooth.pace;
    c.policy.throttle = c.managerSmooth.throttle;
    if (c.ai) {
      c.ai.nextDecision = 0;
      c.ai.until = 0;
    }
    if (p.pace === "maximum" && !c.attackUntil) {
      c.attackUntil = this.race.time + 30;
      c.attackCooldown = this.race.time + 60;
    }
  }
  order(id, patch) {
    const c = this.race.cars.find((c) => c.id === id);
    if (!this.owns(c) || c.finished || c.retired) return false;
    if (patch.pace === "maximum" && this.race.time < (c.attackCooldown || 0))
      return false;
    const p = validPlan({ ...c.managerPlan, ...patch }, this.race.laps);
    p.start = c.managerPlan.start;
    p.setup = c.managerPlan.setup;
    c.managerPlan = p;
    this.applyPolicy(c);
    this.log(c, "order", JSON.stringify(patch));
    return true;
  }
  setObjective(value) {
    if (!["both", "drivers", "constructors"].includes(value)) return;
    this.objective = value;
    this.race.teamOrder =
      value === "drivers"
        ? "yield"
        : value === "constructors"
          ? "protect"
          : "race";
    this.log(
      this.race.cars[0],
      "objective",
      value + "; prioridade #" + this.priorityId,
    );
  }
  command(id, action, compound) {
    const c = this.race.cars.find((c) => c.id === id);
    if (!this.owns(c)) return false;
    return this.pitCommand(c, action, compound);
  }
  pitCommand(c, action, compound) {
    const p = c.pit;
    if (c.finished || c.retired || p.state !== "track" || p.approachAuthorized)
      return false;
    if (action === "cancel" || action === "defer") {
      p.requested = false;
      p.approachAuthorized = false;
      c.managerHoldLap = c.lap + 2;
      this.log(
        c,
        action,
        "Segurar até a próxima volta; pedido cancelado antes do compromisso",
      );
      return true;
    }
    if (action !== "pit") return false;
    if (["hard", "medium", "soft", "wet"].includes(compound))
      p.compound = compound;
    if (!p.requested) requestPit(c);
    p.reason = "Central de estratégia";
    c.managerHoldLap = 0;
    this.log(c, "pit-request", p.compound);
    return true;
  }
  step(dt) {
    const r = this.race;
    for (const c of r.cars) {
      if (c.finished || c.retired) continue;
      if (c.attackUntil && r.time >= c.attackUntil) {
        c.attackUntil = 0;
        c.managerPlan.pace = "balanced";
        this.applyPolicy(c);
        this.log(
          c,
          "attack-ended",
          "Janela de 30 s encerrada; resfriamento até 60 s",
        );
      }
      const smooth = 1 - Math.exp(-dt / 4);
      let target = c.managerTarget.pace;
      if (c.managerPlan.tireCare === "temperature" && c.tires.temperature > 100)
        target *= 0.94;
      c.managerSmooth.pace += (target - c.managerSmooth.pace) * smooth;
      c.managerSmooth.throttle +=
        (c.managerTarget.throttle - c.managerSmooth.throttle) * smooth;
      c.policy.pace = c.managerSmooth.pace;
      c.policy.throttle = c.managerSmooth.throttle;
    }
    if (r.time < this.next) return;
    this.next = r.time + 1;
    for (const c of r.cars) {
      if (c.finished || c.retired) continue;
      if (c.pit.state !== c.observedPit) {
        this.log(c, "pit-phase", c.pit.state);
        c.observedPit = c.pit.state;
      }
      if (c.pit.stops > c.seenStops) {
        c.nextStop += c.pit.stops - c.seenStops;
        c.seenStops = c.pit.stops;
      }
      const rec = this.recommend(c);
      c.strategyAdvice = rec;
      c.pit.estimatedLoss = rec.loss;
      if (
        rec.key !== c.lastAdviceKey &&
        r.time - (c.lastAdviceTime ?? -100) > 8
      ) {
        this.log(c, "advice", rec.message);
        c.lastAdviceKey = rec.key;
        c.lastAdviceTime = r.time;
        if (this.owns(c)) c.engineerEvent = rec.message;
      }
      const own = this.owns(c),
        p = c.managerPlan,
        window = p.stops[c.nextStop],
        lap = c.lap + 1;
      if (c.pit.state !== "track" || c.pit.requested || lap < c.managerHoldLap)
        continue;
      const due = window && lap >= window.from && lap < this.race.laps;
      const busy = r.cars.some(
        (o) =>
          o !== c &&
          o.teamId === c.teamId &&
          !o.retired &&
          !o.finished &&
          (o.pit.requested || o.pit.state !== "track"),
      );
      if (
        (!own || p.automatic) &&
        rec.key === "overcut" &&
        due &&
        lap < window.to
      ) {
        c.managerHoldLap = lap + 1;
        this.log(
          c,
          "overcut",
          "Prolongar uma volta dentro da janela; rival nos boxes e ritmo recente melhor",
        );
        continue;
      }
      const urgent = ["fuel", "damage"].includes(rec.key);
      const deadline = due && lap >= window.to;
      const automatic =
        (!own || p.automatic) && rec.action === "pit" && (!busy || urgent);
      if ((due && (!busy || deadline)) || automatic) {
        const compound = automatic ? rec.compound : window.compound;
        this.pitCommand(c, "pit", compound);
        this.log(
          c,
          "strategy-executed",
          due
            ? "Janela programada " + window.from + "–" + window.to
            : rec.message,
        );
      }
    }
  }
  recommend(c) {
    const r = this.race,
      p = c.managerPlan,
      own = this.owns(c),
      profile = rivalProfiles[c.teamId % 6],
      remaining = r.laps - c.lap - (c.startedLap ? c.s / length : 0),
      loss = pitLoss(c, r),
      order = r.standings(),
      idx = order.indexOf(c),
      ahead = order[idx - 1],
      behind = order[idx + 1],
      gap = ahead
        ? Math.max(0, (ahead.progress - c.progress) / Math.max(15, c.speed))
        : null,
      wet = c.wetness ?? 0,
      lap = c.lap + 1,
      win = p.stops[c.nextStop];
    const predicted = c.progress - Math.max(15, c.speed) * loss,
      traffic = r.cars
        .filter(
          (o) =>
            o !== c &&
            !o.finished &&
            !o.retired &&
            Math.abs(o.progress - predicted) < Math.max(25, c.speed) * 3,
        )
        .map((o) => o.id);
    const result = (
      key,
      message,
      action = "stay",
      compound = win?.compound || c.pit.compound,
    ) => ({
      key,
      message,
      action,
      compound,
      loss,
      traffic,
      gap,
      behindGap: behind
        ? Math.max(
            0,
            (c.progress - behind.progress) / Math.max(15, behind.speed),
          )
        : null,
      lap,
    });
    if (c.pit.state !== "track")
      return result("committed", "Parada comprometida: " + c.pit.state, "wait");
    if (c.pit.requested)
      return result(
        "requested",
        "Boxes preparados · próximo composto " + c.pit.compound,
        "wait",
      );
    if (
      c.realism === "realistic" &&
      c.fuel < c.fuelPerLap * Math.min(1.15, remaining + 0.1)
    )
      return result("fuel", "Reserva de combustível baixa: abastecer", "pit");
    if (c.damage > 0.6 || (c.mechanical || 0) > 0.2 || c.boxPenaltySeconds > 0)
      return result(
        "damage",
        "Reparos ou penalidade a cumprir nos boxes",
        "pit",
      );
    if (remaining < 0.7)
      return result(
        "finish",
        "Trecho final: evitar perda de posição por parada não essencial",
      );
    if (wet > (own ? 0.4 : profile.wet) && c.tires.compound !== "wet")
      return result(
        "rain",
        "Pista molhada observada: considerar pneus de chuva",
        p.rain === "auto" ? "pit" : "review",
        "wet",
      );
    if (wet < 0.12 && c.tires.compound === "wet")
      return result(
        "dry",
        "Pista secou: pneus de chuva aquecem e desgastam",
        p.rain === "auto" ? "pit" : "review",
        "medium",
      );
    const due = win && lap >= win.from && lap <= win.to;
    const neutral = ["vsc", "sc"].includes(r.control.phase);
    if (
      neutral &&
      loss <
        pitLoss(c, { difficulty: r.difficulty, control: { phase: "green" } }) -
          2 &&
      p.safety === "opportunity" &&
      (c.tires.health < 0.65 || due) &&
      remaining > 1
    )
      return result(
        "neutral",
        "Neutralização atual: menor perda relativa estimada nos boxes",
        "pit",
      );
    if (
      c.realism === "realistic" &&
      c.tires.health < (own ? 0.3 : profile.wear)
    )
      return result(
        "wear",
        "Pneus perdendo desempenho: troca recomendada",
        "pit",
        remaining > 4 ? "hard" : "medium",
      );
    if (
      ahead &&
      ahead.teamId !== c.teamId &&
      ahead.pit.state !== "track" &&
      (!win || lap < win.to) &&
      c.tires.health > 0.6 &&
      c.lastLap &&
      ahead.lastLap &&
      c.lastLap < ahead.lastLap &&
      remaining > 1.5
    )
      return result(
        "overcut",
        "Rival nos boxes; seu último ritmo foi melhor: prolongar este stint",
      );
    if (
      ahead &&
      ahead.teamId !== c.teamId &&
      gap < 3 &&
      win &&
      win.from <= lap + 1 &&
      c.tires.health < 0.6 &&
      remaining > 1.5
    ) {
      const gain =
        referenceLap(c, r.difficulty) -
        referenceLap(c, r.difficulty, win.compound, 1);
      if (gain > gap)
        return result(
          "undercut",
          "Undercut possível se o rival também parar; ganho de pneu estimado " +
            gain.toFixed(1) +
            " s/volta",
          "pit",
          win.compound,
        );
    }
    if (due)
      return result(
        "window",
        "Janela de parada aberta: volta " + win.from + "–" + win.to,
        "pit",
        win.compound,
      );
    if (c.tires.temperature > 105)
      return result(
        "hot",
        "Temperatura alta: conservar ou ativar controle de temperatura",
      );
    if (traffic.length)
      return result(
        "traffic",
        "Uma parada agora projeta saída perto de " +
          traffic.length +
          " carro(s); considerar prolongar",
      );
    return result(
      "hold",
      "Manter plano; " +
        (ahead
          ? "intervalo aproximado à frente " + gap.toFixed(1) + " s"
          : "pista livre à frente") +
        " · sem oportunidade comprovada",
    );
  }
  report() {
    return {
      track: this.race.trackId,
      laps: this.race.laps,
      time: this.race.time,
      objective: this.objective,
      initial: copy(this.initial),
      cars: this.race.cars.map((c) => ({
        id: c.id,
        driverId: c.driverId,
        teamId: c.teamId,
        stops: c.pit.stops,
        lastLap: c.lastLap,
        health: c.tires.health,
        stints: copy(c.stints || []),
        pitHistory: copy(c.pit.history),
        finalPlan: copy(c.managerPlan),
      })),
      decisions: copy(this.decisions),
    };
  }
}
