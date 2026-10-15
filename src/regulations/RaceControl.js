import { length, TRACK_WIDTH, angle } from "../track.js";
import { rules, regulationProfiles } from "./RuleBook.js";
import { Weather } from "../events/Weather.js";
import { SafetyCar } from "../events/SafetyCar.js";
const sector = (s) => Math.min(3, Math.floor((s / length) * 3) + 1);
const gap = (a, b) => ((b.s - a.s + length * 1.5) % length) - length / 2;
export class RaceControl {
  constructor(
    race,
    { ruleSet, weatherProgram = "fixed", mechanicalRate = 0, seed = 17 } = {},
  ) {
    this.race = race;
    this.profile =
      regulationProfiles[ruleSet] ||
      regulationProfiles[race.realism === "realistic" ? "formula" : "club"];
    this.phase = "green";
    this.sectors = [null, null, null];
    this.decisions = [];
    this.journal = [];
    this.serial = 0;
    this.order = [];
    this.pairs = new Map();
    this.clock = 0;
    this.nextScan = 0;
    this.weather = new Weather(race.weather, weatherProgram, seed);
    this.mechanicalRate = Math.max(
      0,
      Math.min(0.15, Number(mechanicalRate) || 0),
    );
    this.randomState = seed >>> 0;
    this.sc = new SafetyCar();
    this.traffic = [...race.cars, this.sc.car];
    this.lastIncident = -100;
    for (const c of race.cars) {
      Object.defineProperty(c, "stewards", { value: this, configurable: true });
      c.ruleState = {
        warnings: 0,
        limits: 0,
        blackWhite: false,
        gridX: c.x,
        gridZ: c.z,
        gridCalled: false,
        off: null,
        lastContact: -100,
        lastMechanical: 0,
        prevProgress: c.progress,
        overspeed: 0,
        steerSign: 0,
        weaves: 0,
      };
      Object.defineProperty(c, "signalCache", { value: {} });
      c.boxPenaltySeconds = 0;
      c.controlLimit = Infinity;
    }
  }
  random() {
    this.randomState =
      (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  log(event) {
    this.journal.push(event);
    if (this.journal.length > 500) this.journal.shift();
  }
  decide(car, id, evidence = {}, override) {
    const rule = rules[id];
    if (!rule || car.disqualified) return null;
    const st = car.ruleState;
    if (id === "JUMP_START") car.lapInvalid = true;
    let kind = override || "time",
      seconds = rule.seconds;
    if (id === "TRACK_GAIN") {
      st.limits++;
      kind = st.limits < this.profile.trackThreshold ? "warning" : "time";
      car.lapInvalid = true;
    }
    if (id === "AVOIDABLE_CONTACT" && !this.profile.collisionPenalty)
      kind = "warning";
    if (id === "DANGEROUS_BLOCK") kind = st.warnings < 1 ? "warning" : "time";
    if (
      this.race.sessionType === "qualifying" &&
      id === "AVOIDABLE_CONTACT" &&
      this.profile.collisionPenalty
    ) {
      kind = "grid";
      seconds = 0;
    }
    if (kind === "warning") {
      seconds = 0;
      st.warnings++;
      st.blackWhite = true;
      st.blackWhiteUntil = this.clock + 12;
    }
    if (
      id === "IGNORE_ORDER" &&
      this.profile.disqualification &&
      this.decisions.filter((d) => d.car === car.id && d.rule === id).length >=
        1
    )
      kind = "dsq";
    const d = {
      id: ++this.serial,
      car: car.id,
      driver: car.driverId,
      rule: id,
      reason: rule.message,
      severity: rule.severity,
      time: this.race.time,
      sector: sector(car.s),
      evidence: { ...evidence },
      kind,
      seconds: kind === "time" ? seconds : 0,
      status: ["time", "return"].includes(kind) ? "pending" : "applied",
    };
    this.decisions.push(d);
    if (this.decisions.length > 128) this.decisions.shift();
    if (kind === "time") {
      car.penalty += seconds;
      car.boxPenaltySeconds += seconds;
      car.eventPenalty = car.penalty;
      this.race.emit("penalty", car.id, car.penalty);
    }
    if (kind === "dsq") {
      car.disqualified = true;
      car.retired = true;
      car.retirement = "Bandeira preta: ordens ignoradas";
      car.speed = car.vx = car.vz = 0;
    }
    this.race.emit("steward", car.id, d);
    car.engineerEvent =
      rule.message +
      (kind === "time"
        ? `. ${seconds} segundos.`
        : kind === "dsq"
          ? ". Desclassificado."
          : kind === "grid"
            ? ". Três posições no próximo grid."
            : kind === "return"
              ? ". Devolva em 20 segundos."
              : ". Advertência.");
    this.message = car.engineerEvent;
    return d;
  }
  serve(car, ids = null) {
    let served = 0;
    for (const d of this.decisions)
      if (
        d.car === car.id &&
        d.kind === "time" &&
        d.status === "pending" &&
        (!ids || ids.includes(d.id))
      ) {
        d.status = "served";
        d.servedAt = this.race.time;
        served += d.seconds;
      }
    car.penalty = Math.max(0, car.penalty - served);
    car.boxPenaltySeconds = this.decisions
      .filter(
        (d) => d.car === car.id && d.kind === "time" && d.status === "pending",
      )
      .reduce((n, d) => n + d.seconds, 0);
    if (served) this.race.emit("penalty-served", car.id, served);
  }
  contact(a, b, closing) {
    if (a.isSafetyCar || b.isSafetyCar) {
      this.race.emit("incident", null, "Contato com Safety Car");
      return;
    }
    const key = [a.id, b.id].sort().join(":");
    if (this.clock - (this.pairs.get(key) ?? -100) < 2) return;
    this.pairs.set(key, this.clock);
    a.ruleState.lastContact = b.ruleState.lastContact = this.clock;
    this.race.emit("contact", a.id, {
      other: b.id,
      closing: Number(closing.toFixed(2)),
      sector: sector(a.s),
    });
    if (closing > 12 && Math.abs(angle(a.heading - b.heading)) < 0.35) {
      const d = gap(a, b),
        culprit =
          d > 0 && a.speed > b.speed + 4
            ? a
            : d < 0 && b.speed > a.speed + 4
              ? b
              : null;
      if (culprit)
        this.decide(culprit, "AVOIDABLE_CONTACT", {
          other: culprit === a ? b.id : a.id,
          closing,
          alignment: Math.abs(angle(a.heading - b.heading)),
        });
    }
    if (closing > 8) {
      const dx = b.x - a.x,
        dz = b.z - a.z;
      if (dx * Math.sin(a.heading) + dz * Math.cos(a.heading) > 1)
        a.wingDamage = Math.min(1, (a.wingDamage || 0) + closing / 140);
      if (-dx * Math.sin(b.heading) - dz * Math.cos(b.heading) > 1)
        b.wingDamage = Math.min(1, (b.wingDamage || 0) + closing / 140);
    }
  }
  neutralize(phase, reason, seconds = 16, affected = 1) {
    if (phase === "red") {
      this.phaseBeforeRed = this.phase;
      this.phase = "red";
      this.redRemaining = 12;
      this.race.state = "red";
      this.sc.requested = false;
    } else if (phase === "yellow" || phase === "double-yellow") {
      this.sectors[affected - 1] = {
        type: phase,
        until: this.clock + seconds,
        reason,
      };
    } else {
      this.phase = phase;
      this.until = this.clock + seconds;
      this.order = this.race
        .physicalOrder()
        .filter((c) => !c.finished && !c.retired)
        .map((c) => c.id);
      if (phase === "sc") this.sc.request();
    }
    this.settleUntil = this.clock + 3;
    this.message = reason;
    this.race.cars[0].engineerEvent = reason;
    this.race.emit("race-control", null, { phase, reason, sector: affected });
    this.race.flag = "yellow";
    this.race.neutralization = seconds;
    this.race.flagOrder = this.order.slice();
  }
  redStep(dt) {
    this.clock += dt;
    this.weather.step(dt, this.race, this.clock);
    this.redRemaining -= dt;
    if (this.redRemaining <= 0) {
      this.race.state = "racing";
      this.phase = ["sc", "restart"].includes(this.phaseBeforeRed)
        ? "sc"
        : "vsc";
      this.until = this.clock + 12;
      this.order = this.race
        .physicalOrder()
        .filter((c) => !c.finished && !c.retired)
        .map((c) => c.id);
      this.race.emit("race-control", null, {
        phase: this.phase,
        reason: "Sessão retomada sob neutralização",
      });
    }
    return true;
  }
  update(dt) {
    const r = this.race;
    this.clock += dt;
    this.weather.step(dt, r, this.clock);
    this.sc.car.wetness = this.weather.wetness;
    this.sc.car.weather = this.weather.wetness > 0.3 ? "rain" : "dry";
    if (
      this.phase === "green" &&
      r.flag === "yellow" &&
      !this.sectors.some(Boolean)
    )
      this.neutralize(
        "vsc",
        "Neutralização solicitada",
        r.neutralization || 16,
      );
    for (let i = 0; i < 3; i++)
      if (this.sectors[i]?.until < this.clock) this.sectors[i] = null;
    if (this.phase === "vsc") {
      r.neutralization = this.until - this.clock;
      if (this.weather.rain > 0.9 && this.weather.wetness > 0.8)
        this.until = Math.max(this.until, this.clock + 3);
      if (this.clock >= this.until) {
        this.phase = "green";
        this.order = [];
        r.emit("race-control", null, { phase: "green", reason: "Fim do VSC" });
      }
    }
    if (this.phase === "sc") {
      this.sc.update(dt, r);
      if (
        this.sc.state === "return" &&
        this.sc.car.lateral > 14 &&
        this.sc.car.pit.state !== "track"
      ) {
        this.phase = "restart";
        this.restartS = this.leader()?.s || 0;
        r.emit("race-control", null, {
          phase: "restart",
          reason: "Relargada: não ultrapasse até a linha",
        });
      }
    } else if (this.sc.state !== "parked") this.sc.update(dt, r);
    if (this.phase === "restart") {
      const s = this.leader()?.s || 0;
      if (this.restartS > length * 0.85 && s < length * 0.15) {
        this.phase = "green";
        this.order = [];
        r.emit("race-control", null, {
          phase: "green",
          reason: "Relargada liberada",
        });
      }
      this.restartS = s;
    }
    if (
      r.time > 8 &&
      r.realism === "realistic" &&
      this.clock - this.lastIncident > 40
    ) {
      const hit = r.cars.find((c) => c.impact > 25 && !c.finished);
      if (hit) {
        this.lastIncident = this.clock;
        this.neutralize(
          hit.impact > 52 ? "sc" : "vsc",
          "Incidente: impacto medido de " + hit.impact.toFixed(1),
          16,
          sector(hit.s),
        );
      }
    }
    if (this.clock >= this.nextScan) {
      this.nextScan = this.clock + 0.25;
      this.inspect();
    }
    r.flag =
      this.phase === "green" && !this.sectors.some(Boolean)
        ? "green"
        : "yellow";
    for (const c of r.cars) {
      const signal = this.signal(c);
      c.flag = signal.noOvertake ? "yellow" : "green";
      c.controlLimit = signal.limit;
      c.blueFlag = signal.flag === "blue";
    }
  }
  leader() {
    return this.race
      .physicalOrder()
      .find((c) => !c.finished && !c.retired && c.pit.state === "track");
  }
  signal(c) {
    let flag = "green",
      instruction = "Corrida liberada",
      limit = Infinity,
      noOvertake = false,
      s = sector(c.s);
    const local = this.sectors[s - 1];
    if (local) {
      flag = local.type;
      limit = flag === "double-yellow" ? 14 : 28;
      noOvertake = true;
      instruction = "Setor " + s + " · reduza e não ultrapasse";
    }
    if (this.phase !== "green") {
      flag = this.phase;
      noOvertake = true;
      limit = Math.min(
        limit,
        this.phase === "red"
          ? 0
          : this.phase === "sc"
            ? 40
            : this.profile.vscLimit,
      );
      instruction =
        this.phase === "sc"
          ? "Safety Car · reagrupar sem ultrapassar"
          : this.phase === "restart"
            ? "Relargada na linha · mantenha ordem"
            : this.phase === "red"
              ? "SESSÃO SUSPENSA · posições congeladas"
              : "VSC · limite " + Math.round(limit * 3.6) + " km/h";
    }
    if (local && this.phase !== "green")
      instruction += " · " + local.type + " no setor " + s;
    if (c.blueFor !== undefined && flag === "green") {
      flag = "blue";
      instruction =
        "Retardatário · facilite passagem do #" +
        this.race.cars[c.blueFor]?.number;
    }
    if (
      c.ruleState?.blackWhite &&
      this.clock < c.ruleState.blackWhiteUntil &&
      flag === "green"
    ) {
      flag = "black-white";
      instruction = "Advertência dos comissários";
    }
    if (c.finished) {
      flag = "chequered";
      instruction = "Corrida concluída";
    }
    if (c.disqualified) {
      flag = "black";
      instruction = c.retirement;
    }
    if (c.returnTo !== undefined)
      instruction =
        "DEVOLVA AO #" +
        this.race.cars[c.returnTo]?.number +
        " · " +
        Math.max(0, Math.ceil(c.returnDeadline - this.clock)) +
        " s";
    if (this.race.state === "countdown") {
      flag = "grid";
      instruction = "Aguarde as luzes; não antecipe a largada";
    }
    const out = c.signalCache || {};
    out.flag = flag;
    out.instruction = instruction;
    out.sector = s;
    out.limit = limit;
    out.noOvertake = noOvertake;
    return out;
  }
  constrain(c, input, dt) {
    const signal = this.signal(c);
    let max = signal.limit;
    if (signal.noOvertake && c.pit.state === "track") {
      const order = this.order.filter((id) => {
          const o = this.race.cars[id];
          return o && !o.retired && !o.finished && o.pit.state === "track";
        }),
        index = order.indexOf(c.id),
        front =
          index > 0
            ? this.race.cars[order[index - 1]]
            : this.phase === "sc" &&
                ["train", "inlap", "return"].includes(this.sc.state)
              ? this.sc.car
              : null;
      if (front && front.speed > 1) {
        if (front.isSafetyCar && c.progress > front.progress - 14)
          max = Math.min(max, front.speed * 0.8);
        const d = (front.s - c.s + length) % length;
        max = Math.min(
          max,
          front.speed * (d < 14 ? 0.9 : 1) + Math.max(0, d - 18) * 0.28,
        );
      }
    }
    if (c.returnTo !== undefined) {
      const other = this.race.cars[c.returnTo];
      if (other && !other.retired) {
        max = Math.min(max, Math.max(8, other.speed * 0.83));
        if (c.progress < other.progress - 7) {
          for (const d of this.decisions)
            if (d.car === c.id && d.kind === "return" && d.status === "pending")
              d.status = "returned";
          delete c.returnTo;
          this.race.emit("position-returned", c.id, "Posição devolvida");
        }
      } else delete c.returnTo;
    }
    if (c.blueFor !== undefined) max = Math.min(max, c.stats.maxSpeed * 0.8);
    const mate =
      this.race.cars.find(
        (c) => c.id === (this.race.manager?.priorityId ?? 0),
      ) || this.race.cars[0];
    if (
      !signal.noOvertake &&
      c.id !== mate.id &&
      c.teamId === mate.teamId &&
      this.race.teamOrder === "yield" &&
      c.progress > mate.progress &&
      c.progress - mate.progress < 40
    )
      max = Math.min(max, Math.max(10, mate.speed * 0.88));
    c.controlLimit = max;
    if (c.speed > max + 0.3) {
      input = {
        ...input,
        throttle: 0,
        brake: Math.max(input.brake || 0, Math.min(1, (c.speed - max) / 5)),
      };
    }
    if (signal.noOvertake && c.speed > signal.limit + 2 && c.brake < 0.4) {
      c.ruleState.overspeed += dt;
      if (c.ruleState.overspeed > 3) {
        this.decide(c, "NEUTRAL_SPEED", {
          speed: c.speed,
          limit: signal.limit,
        });
        c.ruleState.overspeed = -12;
      }
    } else c.ruleState.overspeed = Math.max(0, c.ruleState.overspeed - dt);
    return input;
  }
  inspect() {
    const r = this.race;
    for (const c of r.cars) {
      if (c.finished || c.retired) continue;
      const st = c.ruleState;
      delete c.blueFor;
      if (c.pit.state === "track")
        for (const o of r.cars) {
          if (o === c || o.retired || o.finished || o.pit.state !== "track")
            continue;
          const d = gap(c, o);
          if (
            o.progress - c.progress > length * 0.8 &&
            d < 0 &&
            d > -65 &&
            o.speed > c.speed + 1
          ) {
            c.blueFor = o.id;
            break;
          }
        }
      const outside =
        c.pit.state === "track" && Math.abs(c.lateral) > TRACK_WIDTH / 2 + 1.69;
      if (outside && !st.off)
        st.off = {
          progress: c.progress,
          time: r.time,
          speed: c.speed,
          position: r.physicalOrder().indexOf(c),
          path: 0,
          x: c.x,
          z: c.z,
          forced: this.clock - st.lastContact < 3,
        };
      if (st.off) {
        st.off.path += Math.hypot(c.x - st.off.x, c.z - st.off.z);
        st.off.x = c.x;
        st.off.z = c.z;
        c.lapInvalid = true;
        if (!outside) {
          const e = st.off,
            advance = c.progress - e.progress,
            gain =
              advance > e.path * 1.1 + 5 ||
              r.physicalOrder().indexOf(c) < e.position;
          if (gain && !e.forced)
            this.decide(c, "TRACK_GAIN", {
              advance,
              path: e.path,
              positions: e.position - r.physicalOrder().indexOf(c),
            });
          r.emit("track-exit", c.id, {
            advantage: gain,
            forced: e.forced,
            seconds: r.time - e.time,
          });
          st.off = null;
        }
      }
      if (c.returnTo !== undefined && this.clock > c.returnDeadline) {
        this.decide(c, "IGNORE_ORDER", { owedTo: c.returnTo });
        for (const d of this.decisions)
          if (d.car === c.id && d.kind === "return" && d.status === "pending")
            d.status = "unserved";
        delete c.returnTo;
      }
      if (
        this.mechanicalRate > 0 &&
        (c.mechanical || 0) < 0.7 &&
        c.pit.state === "track" &&
        c.speed > 15 &&
        this.random() < (this.mechanicalRate * 0.25) / 60
      ) {
        c.mechanical = Math.min(0.7, (c.mechanical || 0) + 0.25);
        c.engineerEvent = "Falha de potência. Reparo solicitado nos boxes.";
        r.emit("mechanical", c.id, {
          loss: c.mechanical,
          reason: "Falha de potência",
          seed: this.randomState,
        });
        c.pit.requested = true;
        c.pit.reason = "Reparo mecânico";
      }
      if (
        Math.abs(c.slip) > 0.9 &&
        c.speed > 10 &&
        this.clock - (st.lastSpin || -100) > 15
      ) {
        st.lastSpin = this.clock;
        r.emit("spin", c.id, { slip: c.slip, speed: c.speed });
        this.neutralize("yellow", "Carro rodado no setor", 10, sector(c.s));
      }
      if (c.speed < 1 && c.offroad && r.time > 15) {
        st.stuck = (st.stuck || 0) + 0.25;
        if (st.stuck > 4 && this.clock - (st.lastStuck || -100) > 25) {
          st.lastStuck = this.clock;
          r.emit("stuck", c.id, "Carro lento/imobilizado fora da pista");
          this.neutralize(
            "yellow",
            "Carro imobilizado na área de escape",
            12,
            sector(c.s),
          );
        }
      } else st.stuck = 0;
      const sign = Math.abs(c.steer) > 0.25 ? Math.sign(c.steer) : 0,
        behind = r.cars.some(
          (o) => o !== c && !o.finished && gap(c, o) < -7 && gap(c, o) > -25,
        );
      if (sign && sign !== st.steerSign && behind && c.speed > 25) {
        if (this.clock - (st.weaveAt || -100) < 3) st.weaves++;
        else st.weaves = 1;
        st.weaveAt = this.clock;
        st.steerSign = sign;
        if (st.weaves >= 4) {
          this.decide(c, "DANGEROUS_BLOCK", { changes: st.weaves, seconds: 3 });
          st.weaves = 0;
        }
      }
    }
    if (
      this.weather.rain > 0.92 &&
      this.weather.wetness > 0.8 &&
      !this.stormRed &&
      this.phase !== "red"
    ) {
      this.stormRed = true;
      this.neutralize("red", "Chuva extrema e aderência insuficiente");
    }
    // Compare adjacent physical order, exempt pits, retirements and lap differences.
    const current = r
      .physicalOrder()
      .filter((c) => !c.finished && !c.retired && c.pit.state === "track");
    if (this.clock < (this.settleUntil || 0))
      this.order = current.map((c) => c.id);
    this.order = this.order.filter((id) => current.some((c) => c.id === id));
    if (
      this.phase !== "green" &&
      current.some((c) => !this.order.includes(c.id))
    )
      this.order = current.map((c) => c.id);
    if (this.phase !== "green")
      for (const car of current) {
        const old = this.order.indexOf(car.id);
        for (const id of this.order.slice(0, old)) {
          const other = r.cars[id];
          if (other?.speed < 1 && car.progress > other.progress + 6) {
            this.order.splice(this.order.indexOf(car.id), 1);
            this.order.splice(this.order.indexOf(id), 0, car.id);
            break;
          }
        }
      }
    const reference = this.phase !== "green" ? this.order : this.previousOrder;
    if (reference && this.clock >= (this.settleUntil || 0))
      for (let i = 0; i < current.length; i++) {
        const c = current[i],
          old = reference.indexOf(c.id);
        for (const id of reference.slice(0, Math.max(0, old))) {
          const o = r.cars[id];
          if (
            !o ||
            !current.includes(o) ||
            current.indexOf(o) < i ||
            c.progress - o.progress < 6 ||
            Math.abs(c.progress - o.progress) > 40 ||
            o.speed < 1
          )
            continue;
          if (this.signal(c).noOvertake && c.returnTo === undefined) {
            c.returnTo = id;
            c.returnDeadline = this.clock + 20;
            this.decide(
              c,
              "ILLEGAL_PASS",
              { to: id, reason: "Ultrapassagem durante neutralização" },
              "return",
            );
            this.race.emit("return-position", c.id, {
              to: id,
              reason: "Ultrapassagem durante neutralização",
            });
          }
        }
      }
    this.previousOrder = current.map((c) => c.id);
    const obstruction = r.cars.find(
      (c) =>
        c.retired &&
        Math.abs(c.lateral) < TRACK_WIDTH / 2 &&
        c.pit.state === "track",
    );
    if (obstruction && r.realism === "realistic") {
      const i = sector(obstruction.s) - 1;
      this.sectors[i] = {
        type: "double-yellow",
        until: this.clock + 4,
        reason: "Carro imobilizado na pista",
      };
    }
  }
  gridCheck() {
    for (const c of this.race.cars) {
      const st = c.ruleState;
      if (c.throttle < 0.1 && this.clock - st.lastContact < 1) continue;
      if (!st.gridCalled && Math.hypot(c.x - st.gridX, c.z - st.gridZ) > 0.6) {
        st.gridCalled = true;
        this.decide(c, "JUMP_START", {
          displacement: Math.hypot(c.x - st.gridX, c.z - st.gridZ),
          countdown: this.race.countdown,
        });
      }
    }
  }
}
