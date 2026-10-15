import { MusicPlayer, sceneMusic } from "./audio/MusicPlayer.js";
import { CrowdMixer } from "./audio/CrowdMixer.js";
import { gearFor, rpmFor } from "./racing/Telemetry.js";
// Procedural local audio: a single engine voice plus short, disposable effect nodes.
export class AudioEngine {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.volume = 0.3;
    this.engineVolume = 0.65;
    this.effectsVolume = 0.6;
    this.lastLight = -1;
    this.lastGear = -1;
    this.lastImpact = 0;
    this.lastPit = "track";
    this.effectTimes = new Map();
    this.effectNodes = new Set();
    this.lastRace = null;
    this.settings = {
      audio: true,
      music: true,
      musicVolume: 0.45,
      crowdVolume: 0.7,
      raceMusic: false,
      musicDuck: true,
    };
    this.hidden = false;
    this.targets = new WeakMap();
    this.gesture = () => this.start();
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", this.gesture, { capture: true });
      window.addEventListener("keydown", this.gesture, { capture: true });
    }
  }
  start() {
    try {
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.output = this.context.createGain();
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.value = -8;
        this.limiter.knee.value = 12;
        this.limiter.ratio.value = 5;
        this.limiter.attack.value = 0.006;
        this.limiter.release.value = 0.18;
        this.output.connect(this.limiter);
        this.limiter.connect(this.context.destination);
        this.effectsBus = this.context.createGain();
        this.musicBus = this.context.createGain();
        this.crowdBus = this.context.createGain();
        for (const bus of [
          this.master,
          this.effectsBus,
          this.musicBus,
          this.crowdBus,
        ])
          bus.connect(this.output);
        this.music = new MusicPlayer(this.context, this.musicBus);
        this.crowd = new CrowdMixer(this.context, this.crowdBus);
        this.applyVolumes();
        this.osc = this.context.createOscillator();
        this.osc.type = "sawtooth";
        this.filter = this.context.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.frequency.value = 500;
        this.osc.connect(this.filter);
        this.filter.connect(this.master);
        this.osc.start();
      }
      if (!this.hidden && this.context.state !== "running")
        this.context.resume().catch(() => {});
      const p = this.presentation;
      this.music.update(
        sceneMusic(p?.race, p?.ui, this.settings),
        this.hidden || ["paused", "red"].includes(p?.race?.state),
      );
      if (!this.music.paused)
        for (const d of this.music.decks)
          if (d.key && d.element.paused) this.music.play(d);
    } catch (error) {
      this.error = String(error);
      this.context?.close().catch(() => {});
      this.context = null;
    }
  }
  configure(s) {
    Object.assign(this.settings, s);
    this.enabled = this.settings.audio !== false;
    this.volume = this.settings.volume ?? 0.3;
    this.engineVolume = s.engineVolume ?? 0.65;
    this.effectsVolume = s.effectsVolume ?? 0.6;
    this.applyVolumes();
    if (!this.enabled) {
      this.silenceEffects();
      this.music?.stop();
      this.crowd?.stop();
    }
  }
  gain(param, value, time, constant) {
    if (this.targets.get(param) === value) return;
    this.targets.set(param, value);
    param.setTargetAtTime(value, time, constant);
  }
  applyVolumes(race = null) {
    if (!this.context) return;
    const t = this.context.currentTime,
      s = this.settings;
    this.gain(
      this.output.gain,
      this.enabled && !this.hidden ? this.volume : 0,
      t,
      0.035,
    );
    this.gain(this.effectsBus.gain, this.effectsVolume, t, 0.035);
    const duck =
      s.musicDuck && race && !race.done && race.state !== "countdown"
        ? 0.25
        : 1;
    this.gain(
      this.musicBus.gain,
      (s.music === false ? 0 : (s.musicVolume ?? 0.45)) * 0.55 * duck,
      t,
      0.1,
    );
    this.gain(this.crowdBus.gain, s.crowdVolume ?? 0.7, t, 0.035);
  }
  setHidden(value) {
    this.hidden = value;
    if (!this.context) return;
    this.applyVolumes();
    if (value) this.music?.pause(true);
    if (value) {
      this.master.gain.value = 0;
      this.silenceEffects();
      this.crowd?.stop();
      this.context.suspend().catch(() => {});
    } else this.context.resume().catch(() => {});
  }
  dispose() {
    this.music?.dispose();
    this.crowd?.dispose();
    this.silenceEffects();
    if (this.context) {
      this.osc.stop();
      this.context.close();
    }
    window.removeEventListener("pointerdown", this.gesture, true);
    window.removeEventListener("keydown", this.gesture, true);
  }
  silenceEffects() {
    for (const o of this.effectNodes) {
      try {
        o.stop();
      } catch {}
    }
    this.effectNodes.clear();
  }
  tick(race, ui = null, venues = null) {
    this.presentation = { race, ui, venues };
    if (!this.context) return;
    this.applyVolumes(race);
    const suspended =
      this.hidden || race?.state === "paused" || race?.state === "red";
    this.music.update(sceneMusic(race, ui, this.settings), suspended);
    this.crowd.tick(
      race,
      venues,
      this.enabled &&
        !suspended &&
        (this.settings.crowdVolume ?? 0.7) > 0 &&
        this.volume > 0,
    );
    if (race !== this.lastRace) {
      this.lastRace = race;
      this.lastGear = -1;
      this.lastLight = -1;
      this.lastImpact = 0;
      this.lastPit = "track";
      this.effectTimes.clear();
      this.silenceEffects();
    }
    const p = race?.cars[0],
      active =
        race &&
        ["racing", "finishing"].includes(race.state) &&
        !p.finished &&
        !p.retired;
    if (!race || race.state === "paused" || race.state === "results")
      this.silenceEffects();
    this.master.gain.setTargetAtTime(
      this.enabled && active && !suspended ? this.engineVolume * 0.19 : 0,
      this.context.currentTime,
      0.04,
    );
    if (p) {
      const gear = Math.max(0, gearFor(p) - 1),
        timbre = (race.carIndex ?? 0) % 4;
      this.osc.type = ["sawtooth", "triangle", "square", "sawtooth"][timbre];
      this.osc.frequency.setTargetAtTime(
        (55 + (rpmFor(p) / 14000) * 125) * (1 + timbre * 0.06),
        this.context.currentTime,
        0.05,
      );
      this.filter.frequency.setTargetAtTime(
        230 + p.speed * 10 + p.throttle * 220,
        this.context.currentTime,
        0.06,
      );
      if (active) {
        if (gear !== this.lastGear && this.lastGear >= 0)
          this.effect("gear", race.time, 120 + gear * 25, 0.06, "triangle");
        this.lastGear = gear;
        if ((p.impactCount || 0) > this.lastImpact) {
          this.lastImpact = p.impactCount;
          this.effect("impact", race.time, 65, 0.19, "sawtooth");
        }
        if (p.brake > 0.7 && p.speed > 20)
          this.effect(
            "brake",
            race.time,
            900 + p.speed * 7,
            0.07,
            "triangle",
            0.8,
          );
        if (
          Math.abs(p.lateral) > 8.8 &&
          Math.abs(p.lateral) < 10.7 &&
          p.speed > 12
        )
          this.effect("kerb", race.time, 75, 0.06, "square", 0.25);
        if (p.pit.state !== this.lastPit) {
          this.lastPit = p.pit.state;
          this.effect(
            "pit",
            race.time,
            p.pit.state === "service" ? 580 : 840,
            0.12,
            "sine",
          );
        }
      }
    }
    if (race?.state === "countdown" && !suspended) {
      const light = Math.ceil(race.countdown);
      if (light !== this.lastLight) {
        this.lastLight = light;
        this.beep(light === 1 ? 700 : 400, 0.09);
      }
    }
  }
  effect(key, time, frequency, duration, wave = "sine", cooldown = 0.3) {
    if ((this.effectTimes.get(key) ?? -100) + cooldown > time) return;
    this.effectTimes.set(key, time);
    this.beep(frequency, duration, wave);
  }
  beep(frequency = 660, duration = 0.12, wave = "sine") {
    if (!this.context || !this.enabled || this.hidden) return;
    const o = this.context.createOscillator(),
      g = this.context.createGain(),
      t = this.context.currentTime;
    o.type = wave;
    o.frequency.value = frequency;
    g.gain.setValueAtTime(Math.max(0.0001, 0.18), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.effectsBus);
    this.effectNodes.add(o);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      this.effectNodes.delete(o);
    };
    o.start();
    o.stop(t + duration);
  }
}
