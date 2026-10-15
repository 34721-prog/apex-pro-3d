import { crowdTracks } from "./Tracks.js";
export class CrowdMixer {
  constructor(ctx, bus) {
    this.ctx = ctx;
    this.bus = bus;
    this.beds = [];
    this.buffers = null;
    this.pending = null;
    this.active = false;
    this.lastSerial = 0;
    this.lastCheer = -20;
    this.variation = 0;
    this.reactions = [];
    this.maxSources = 0;
    this.errors = [];
    this.abort = new AbortController();
  }
  load() {
    if (this.pending) return;
    this.pending = Promise.all(
      ["crowd-bed", "crowd-cheer"].map(async (id) => {
        const r = await fetch(crowdTracks[id].file, {
          signal: this.abort.signal,
        });
        if (!r.ok) throw Error("Crowd HTTP " + r.status);
        return this.ctx.decodeAudioData(await r.arrayBuffer());
      }),
    )
      .then((b) => {
        this.buffers = b;
      })
      .catch((e) => {
        if (e.name !== "AbortError") this.errors.push(String(e));
      });
  }
  stop() {
    for (const b of this.beds) {
      try {
        b.source.stop();
      } catch {}
      b.source.disconnect();
      b.gain.disconnect();
      b.pan.disconnect();
    }
    this.beds = [];
    if (this.cheer) {
      try {
        this.cheer.source.stop();
      } catch {}
      this.cheer.source.disconnect();
      this.cheer.gain.disconnect();
      this.cheer.pan.disconnect();
      this.cheer = null;
    }
    this.active = false;
  }
  node(buffer, loop = false) {
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain(),
      pan = this.ctx.createStereoPanner();
    source.buffer = buffer;
    source.loop = loop;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(pan);
    pan.connect(this.bus);
    return { source, gain, pan };
  }
  tick(race, venues, enabled) {
    if (race?.state === "results" && this.previousState !== "results")
      this.tailUntil = this.ctx.currentTime + 5;
    this.previousState = race?.state;
    const active =
      enabled &&
      race &&
      (["countdown", "racing", "finishing"].includes(race.state) ||
        (race.state === "results" && this.ctx.currentTime < this.tailUntil));
    if (race !== this.race) {
      this.stop();
      this.race = race;
      this.lastSerial = 0;
      this.lastCheer = -20;
    }
    if (!active) {
      if (this.active) this.stop();
      return;
    }
    this.active = true;
    this.load();
    if (!this.buffers || !venues) return;
    if (!this.beds.length)
      for (let i = 0; i < 2; i++) {
        const b = this.node(this.buffers[0], true);
        b.source.start(0, i * 6.7);
        this.beds.push(b);
      }
    const p = race.cars[0],
      near = venues.plan
        .map((v) => ({ v, d: Math.hypot(v.x - p.x, v.z - p.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2),
      t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const b = this.beds[i],
        n = near[i],
        pan = Math.max(
          -1,
          Math.min(
            1,
            ((n.v.x - p.x) * Math.cos(p.heading) -
              (n.v.z - p.z) * Math.sin(p.heading)) /
              Math.max(1, n.d),
          ),
        ),
        gain =
          race.state === "results" || n.d > 230
            ? 0
            : (0.17 + Math.min(1, p.speed / 55) * 0.13) / (1 + (n.d / 48) ** 2);
      b.gain.gain.setTargetAtTime(gain, t, 0.22);
      b.pan.pan.setTargetAtTime(pan, t, 0.2);
      b.source.playbackRate.setTargetAtTime(
        0.95 + (n.v.index % 5) * 0.018,
        t,
        0.5,
      );
    }
    for (const e of venues.audience.race === race ? venues.audience.events : [])
      if (e.serial > this.lastSerial) {
        this.lastSerial = e.serial;
        if (race.time - e.time > 4) continue;
        const important = ["finish", "victory"].includes(e.kind);
        const attenuation =
          near[0].d > 300 ? 0 : Math.min(1, 80 / Math.max(80, near[0].d));
        if (t - this.lastCheer < (important ? 3 : 8) && !this.cheer) continue;
        if (this.cheer) {
          if (important)
            this.cheer.gain.gain.setTargetAtTime(
              e.strength * 0.5 * attenuation,
              t,
              0.15,
            );
          continue;
        }
        if (t - this.lastCheer < 8 && !important) continue;
        this.lastCheer = t;
        const b = this.node(this.buffers[1]);
        b.gain.gain.value = e.strength * 0.5 * attenuation;
        b.pan.pan.value = near[0]
          ? Math.max(
              -0.8,
              Math.min(
                0.8,
                ((near[0].v.x - p.x) * Math.cos(p.heading) -
                  (near[0].v.z - p.z) * Math.sin(p.heading)) /
                  Math.max(1, near[0].d),
              ),
            )
          : 0;
        b.source.playbackRate.value = 0.92 + (++this.variation % 5) * 0.037;
        b.source.onended = () => {
          b.source.disconnect();
          b.gain.disconnect();
          b.pan.disconnect();
          if (this.cheer === b) this.cheer = null;
        };
        b.source.start();
        this.cheer = b;
        this.reactions.push({ kind: e.kind, time: t });
        this.reactions = this.reactions.slice(-30);
      }
    this.maxSources = Math.max(
      this.maxSources,
      this.beds.length + (this.cheer ? 1 : 0),
    );
  }
  dispose() {
    this.stop();
    this.abort.abort();
    this.buffers = null;
  }
}
