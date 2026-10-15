import { beginVisualStep, endVisualStep, resetVisualHistory } from "./graphics/VehicleMotion.js";
import { StrategyDirector } from "./strategy/StrategyDirector.js";
import { RaceControl } from "./regulations/RaceControl.js";
import { RaceTiming } from "./racing/Timing.js";
import { assignStrategy, defaultStrategy } from "./strategy/RaceStrategy.js";
import { liveries } from "./data/liveries.js";
import { updateFlags } from "./racing/Flags.js";
import { updateBattles } from "./ai/Rivalries.js";
import { driverCatalog, pilotPersonality, pilotStats } from "./data/drivers.js";
import { initializeResources, updateResources } from "./strategy/Resources.js";
import { pitInput } from "./strategy/PitStop.js";
import { createDriver, stepCar, collisions, BASE } from "./physics.js";
import { botInput } from "./ai.js";
import { length, activeTrack, TRACK_WIDTH } from "./track.js";
export const drivers = [
  "Você",
  ...driverCatalog.slice(1, 6).map((d) => d.name),
];
export const points = [25, 18, 15, 12, 10, 8];
export function updateProgress(car, dt, raceTime, laps) {
  const old = car.previousS,
    s = car.s;
  let delta = s - old;
  if (delta > length / 2) delta -= length;
  if (delta < -length / 2) delta += length;
  if (Math.abs(delta) > 20) {
    car.previousS = s;
    return;
  } // Large displacements never award progress.
  car.progress += delta;
  car.lapTime += dt;
  const next = ((car.checkpoint + 1) * length) / 4;
  if (
    car.checkpoint < 3 &&
    old < next &&
    s >= next &&
    delta > 0 &&
    (Math.abs(car.lateral) < TRACK_WIDTH / 2 + 2 ||
      (car.pit?.state !== "track" && car.pit?.state))
  )
    car.checkpoint++;
  if (
    old > length * 0.85 &&
    s < length * 0.15 &&
    delta > 0 &&
    (Math.abs(car.lateral) < TRACK_WIDTH / 2 + 2 ||
      (car.pit?.state !== "track" && car.pit?.state))
  ) {
    if (!car.startedLap) {
      car.startedLap = true;
      car.lapTime = 0;
    }
    if (car.checkpoint === 3) {
      car.lap++;
      car.lastLap = car.lapTime;
      if (!car.lapInvalid)
        car.bestLap =
          car.bestLap === null
            ? car.lapTime
            : Math.min(car.bestLap, car.lapTime);
      car.lapInvalid = false;
      car.lapTime = 0;
      car.checkpoint = 0;
      if (car.lap >= laps) {
        car.finished = true;
        car.finishTime = raceTime;
        car.speed = 0;
      }
    }
  }
  car.previousS = s;
}
export class Race {
  constructor({
    difficulty = "normal",
    laps = 3,
    stats = BASE,
    championship = false,
    realism = "arcade",
    weather = "dry",
    tire = "medium",
    mode = "quick",
    botCount = 5,
    pilot = 0,
    rivalries = {},
    crewLevel = 0,
    strategy = defaultStrategy(),
    ruleSet,
    weatherProgram = "fixed",
    mechanicalRate = 0,
    seed = 17,
    delegated = false,
    management = false,
    managerOptions = {},
    gridOrder = null,
    roster = null,
    teamIds = null,
    specStats = null,
    sessionType = "race",
    modelIndex = null,
    training = 0,
    teamOrder = "race",
  } = {}) {
    this.trackId = activeTrack.id;
    this.trackName = activeTrack.name;
    this.trackLength = length;
    this.realism = realism;
    this.weather = weather;
    this.mode = mode;
    this.delegated = delegated;
    this.manualControl = null;
    this.weatherProgram = weatherProgram;
    this.sessionType = sessionType;
    this.teamOrder = teamOrder;
    this.flag = "green";
    this.events = [];
    this.eventSerial = 0;
    this.difficulty = difficulty;
    this.laps = laps;
    this.championship = championship;
    this.state = "countdown";
    this.countdown = 5;
    this.time = 0;
    this.finishWait = 0;
    this.done = false;
    this.cars = drivers
      .slice(0, ["time-trial", "practice"].includes(mode) ? 1 : botCount + 1)
      .map((name, i) => {
        const grid = gridOrder ? gridOrder.indexOf(i) : i === 0 ? 5 : i - 1,
          s = length - 15 - Math.floor(grid / 2) * 10,
          car = createDriver(
            i,
            name,
            s,
            grid % 2 ? 2.8 : -2.8,
            i === 0 ? stats : BASE,
          );
        car.progress = s - length;
        car.number = liveries[i].number;
        car.gridPosition = grid + 1;
        car.driverId =
          roster?.[i] ??
          (i === 0 ? pilot : mode === "mega" && i === 1 ? 30 : i);
        car.personality = pilotPersonality(car.driverId);
        if (i !== 0) car.name = driverCatalog[car.driverId].name;
        car.stats = specStats
          ? { ...BASE, ...specStats }
          : pilotStats(car.stats, car.driverId, mode, realism);
        if (modelIndex !== null) car.modelIndex = modelIndex;
        if (i === 0)
          car.personality.consistency = Math.min(
            0.99,
            car.personality.consistency + Math.min(5, training) * 0.02,
          );
        car.personality.aggression = Math.min(
          0.99,
          car.personality.aggression +
            (rivalries[car.driverId]?.score || 0) * 0.01,
        );
        car.teamId =
          championship || delegated || management || mode === "manager"
            ? Math.floor(i / 2) * 2
            : i;
        if (teamIds) car.teamId = teamIds[i];
        car.crewLevel = car.teamId === 0 ? crewLevel : i % 3;
        initializeResources(car, { laps, realism, weather, tire });
        return car;
      });
    assignStrategy(this, strategy);
    this.timing = new RaceTiming(this.cars, length);
    Object.defineProperty(this, "control", {
      value: new RaceControl(this, {
        ruleSet,
        weatherProgram,
        mechanicalRate,
        seed,
      }),
    });
    if (management) this.enableManagement(managerOptions);
  }
  enableManagement(options = {}) {
    if (!this.manager) this.manager = new StrategyDirector(this, options);
    return this.manager;
  }
  isDelegated() {
    return this.manualControl === null
      ? this.delegated || this.mode === "manager"
      : !this.manualControl;
  }
  emit(type, car = 0, detail = "") {
    this.events.push({
      id: ++this.eventSerial,
      type,
      car,
      detail,
      time: this.time,
    });
    this.control?.log(this.events[this.events.length - 1]);
    if (this.events.length > 150)
      this.events.splice(0, this.events.length - 150);
  }
  step(dt, input, autopilot = false) {
    if (!Number.isFinite(dt) || dt <= 0 || this.state === "paused" || this.state === "results") return;
    const previousState = this.state;
    for (const car of this.cars) beginVisualStep(car);
    this.advanceSimulation(dt, input, autopilot);
    for (const car of this.cars) endVisualStep(car, dt);
    if (previousState !== this.state)
      for (const car of this.cars) resetVisualHistory(car);
  }
  advanceSimulation(dt, input, autopilot = false) {
    if (this.state === "paused" || this.state === "results") return;
    if (this.state === "red") {
      this.control.redStep(dt);
      return;
    }
    if (this.state === "countdown") {
      if (
        !autopilot &&
        !this.isDelegated() &&
        (Number(input?.throttle) > 0 || this.cars[0].speed > 0)
      ) {
        const c = this.cars[0];
        stepCar(c, input, dt);
        let d = c.s - c.previousS;
        if (d < -length / 2) d += length;
        if (d > length / 2) d -= length;
        c.progress += d;
        c.previousS = c.s;
        collisions(this.control.traffic);
      }
      this.control.gridCheck();
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.state = "racing";
        this.countdown = 0;
        this.emit("start");
        for (const c of this.cars) if (c.s < length * 0.15) c.startedLap = true;
      }
      return;
    }
    this.time += dt;
    const flag = this.flag;
    updateFlags(this, dt);
    if (this.state === "red") return;
    if (flag !== this.flag) this.emit("flag", null, this.flag);
    this.manager?.step(dt);
    this.cars.forEach((c, i) => {
      if (c.finished || c.retired) return;
      c.simTime = this.time;
      const lap = c.lap,
        best = c.bestLap,
        pitState = c.pit.state,
        invalid = c.lapInvalid;
      const guided = i !== 0 || autopilot || this.isDelegated();
      const pit = pitInput(c, dt, guided, this.control.traffic);
      let inp =
        pit ||
        (guided
          ? botInput(
              c,
              this.control.traffic,
              this.time,
              i === 0 && autopilot ? "hard" : this.difficulty,
            )
          : input || {});
      if (guided && this.time < (1 - (c.personality.startSkill ?? 0.75)) * 0.6)
        inp = { throttle: 0, brake: 1, steer: 0 };
      inp = this.control.constrain(c, inp, dt);
      if (!["service", "release"].includes(c.pit.state)) stepCar(c, inp, dt);
      if (c.pit.state !== "track") c.offroad = false;
      updateResources(c, dt);
      updateProgress(
        c,
        dt,
        this.time,
        this.mode === "practice" ? 999 : this.laps,
      );
      this.timing.update(c, dt, this.time, invalid);
      if (c.lap > lap) {
        this.emit("lap", c.id, c.lastLap);
        if (c.lap === this.laps - 1) this.emit("last-lap", c.id);
        if (c.finished) this.emit("finish", c.id);
      }
      if (c.bestLap !== best && c.bestLap !== null)
        this.emit("personal-best", c.id, c.bestLap);
      if (c.pit.state !== pitState) this.emit("pit", c.id, c.pit.state);
      if (c.penalty !== (c.eventPenalty || 0)) {
        if (c.penalty > (c.eventPenalty || 0))
          this.emit("penalty", c.id, c.penalty);
        c.eventPenalty = c.penalty;
      }
    });
    collisions(this.control.traffic);
    updateBattles(this);
    if (this.cars[0].finished || this.cars[0].retired) {
      this.state = "finishing";
      this.finishWait += dt;
      if (
        this.cars.every((c) => c.finished || c.retired) ||
        this.finishWait > Math.max(90, length / 20 + 25)
      ) {
        for (const c of this.cars)
          if (!c.finished && !c.retired) {
            c.retired = true;
            c.retirement = "Tempo limite de encerramento";
            c.speed = c.vx = c.vz = 0;
          }
        this.state = "results";
        this.done = true;
      }
    }
  }
  physicalOrder() {
    return [...this.cars].sort(
      (a, b) => b.progress - a.progress || a.gridPosition - b.gridPosition,
    );
  }
  standings() {
    if (
      ["practice", "qualifying", "time-attack"].includes(this.sessionType) &&
      this.cars.some((c) => c.bestLap !== null)
    )
      return [...this.cars].sort(
        (a, b) =>
          (a.disqualified ? 1 : 0) - (b.disqualified ? 1 : 0) ||
          (a.bestLap ?? Infinity) - (b.bestLap ?? Infinity) ||
          a.gridPosition - b.gridPosition,
      );
    return [...this.cars].sort((a, b) =>
      a.disqualified !== b.disqualified
        ? a.disqualified
          ? 1
          : -1
        : a.finished && b.finished
          ? a.finishTime + a.penalty - (b.finishTime + b.penalty)
          : a.finished
            ? -1
            : b.finished
              ? 1
              : b.progress - a.progress || a.gridPosition - b.gridPosition,
    );
  }
  results() {
    return this.standings().map((c, i) => ({
      id: c.id,
      name: c.name,
      position: i + 1,
      time: c.finishTime === null ? null : c.finishTime + c.penalty,
      penalty: c.penalty,
      bestLap: c.bestLap,
      finished: c.finished,
      points: c.finished && !c.disqualified ? points[i] : 0,
      stops: c.pit.stops,
      pitSeconds: c.pit.lifetimeLaneTime || 0,
      driverId: c.driverId,
      teamId: c.teamId,
      gridPosition: c.gridPosition,
      retirement: c.retirement || null,
      disqualified: !!c.disqualified,
      serviceSeconds: c.pit.history.reduce((n, h) => n + h.service, 0),
    }));
  }
  pause() {
    for (const car of this.cars) resetVisualHistory(car);
    if (this.state === "paused") {
      this.state = this.previousState;
      return;
    }
    if (["countdown", "racing", "finishing", "red"].includes(this.state)) {
      this.previousState = this.state;
      this.state = "paused";
    }
  }
}
