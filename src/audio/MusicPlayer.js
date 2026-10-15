import { musicTracks } from "./Tracks.js";
// Two reusable streaming decks: one steady stream, at most two during a fade.
export class MusicPlayer {
  constructor(ctx, bus) {
    this.ctx = ctx;
    this.bus = bus;
    this.decks = Array.from({ length: 2 }, () => {
      const element = new Audio();
      element.preload = "none";
      element.loop = true;
      const source = ctx.createMediaElementSource(element),
        gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(bus);
      return { element, source, gain, key: null };
    });
    this.active = -1;
    this.current = null;
    this.desired = null;
    this.fade = null;
    this.paused = false;
    this.transitions = 0;
    this.errors = [];
    this.maxConcurrent = 0;
  }
  release(d) {
    d.element.pause();
    d.element.removeAttribute("src");
    d.element.load();
    d.key = null;
    d.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    d.gain.gain.value = 0;
  }
  play(d) {
    d.element.play().catch((e) => {
      if (e.name !== "AbortError" && e.name !== "NotAllowedError")
        this.errors.push(String(e).slice(0, 160));
      this.errors = this.errors.slice(-10);
    });
  }
  pause(value) {
    if (this.paused === value) return;
    this.paused = value;
    for (const d of this.decks)
      if (d.key) {
        if (value) d.element.pause();
        else this.play(d);
      }
  }
  update(key, suspended = false) {
    this.desired = key;
    this.pause(suspended);
    if (this.paused) return;
    const t = this.ctx.currentTime;
    if (this.fade && t >= this.fade.end) {
      if (this.fade.old >= 0) this.release(this.decks[this.fade.old]);
      this.fade = null;
    }
    if (!this.fade && this.current !== this.desired) {
      const old = this.active;
      this.current = this.desired;
      this.transitions++;
      const next = this.current ? (old === 0 ? 1 : 0) : -1;
      this.active = next;
      if (old >= 0) {
        const p = this.decks[old].gain.gain;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(0, t + 0.8);
      }
      if (next >= 0) {
        const d = this.decks[next];
        d.key = this.current;
        d.element.src = musicTracks[this.current].file;
        d.gain.gain.setValueAtTime(0, t);
        d.gain.gain.linearRampToValueAtTime(1, t + 0.8);
        this.play(d);
      }
      this.fade = { old, end: t + 0.85 };
    }
    this.maxConcurrent = Math.max(
      this.maxConcurrent,
      this.decks.filter((d) => d.key && !d.element.paused).length,
    );
  }
  stop() {
    this.fade = null;
    this.current = null;
    this.desired = null;
    this.active = -1;
    for (const d of this.decks) this.release(d);
  }
  dispose() {
    this.stop();
    for (const d of this.decks) {
      d.source.disconnect();
      d.gain.disconnect();
    }
  }
}
export function sceneMusic(race, ui, settings) {
  if (!settings.audio || !settings.music) return null;
  if (race) {
    if (race.state === "countdown") return "grid";
    if (race.done || race.state === "results") return "victory";
    return settings.raceMusic ? "race" : null;
  }
  if (
    ["setup", "champ-setup", "paint-editor"].includes(ui?.modal) ||
    ["garage", "drivers", "tracks"].includes(ui?.page)
  )
    return "selection";
  if (
    [
      "operations",
      "calendar",
      "news",
      "upgrades",
      "career",
      "championship",
      "competitions",
      "league",
      "team",
      "contracts",
    ].includes(ui?.page)
  )
    return "championship";
  return "menu";
}
