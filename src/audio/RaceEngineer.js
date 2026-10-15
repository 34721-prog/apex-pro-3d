export class RaceEngineer {
  constructor() {
    this.settings = { voice: true, voiceVolume: 0.6, radioFrequency: 25 };
    this.cooldowns = new Map();
    this.lastRoutine = 0;
    this.message = "";
    this.until = 0;
    this.priority = 0;
    this.lastLap = 0;
    this.spoken = [];
  }
  configure(settings) {
    if (
      settings.volume !== this.settings.volume ||
      settings.voiceVolume !== this.settings.voiceVolume
    )
      this.stop();
    Object.assign(this.settings, settings);
    if (
      settings.audio === false ||
      settings.voice === false ||
      settings.volume === 0
    )
      this.stop();
  }
  reset() {
    this.stop();
    this.cooldowns.clear();
    this.lastRoutine = 0;
    this.lastLap = 0;
    this.message = "";
    this.until = 0;
    this.priority = 0;
  }
  stop() {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }
  say(text, priority = 1, time = 0, key = text) {
    if ((this.cooldowns.get(key) || -100) + 20 > time) return false;
    if (this.until > time && this.priority > priority) return false;
    this.cooldowns.set(key, time);
    this.message = text;
    this.until = time + 8;
    this.priority = priority;
    this.spoken.push(text);
    this.spoken = this.spoken.slice(-20);
    if (
      this.settings.voice &&
      this.settings.audio !== false &&
      (this.settings.volume ?? 1) > 0 &&
      typeof speechSynthesis !== "undefined"
    ) {
      const voice = speechSynthesis
        .getVoices()
        .find((v) => v.localService && v.lang.toLowerCase().startsWith("pt"));
      if (voice) {
        if (priority > 1) speechSynthesis.cancel();
        if (!speechSynthesis.speaking || priority > 1) {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = "pt-BR";
          u.voice = voice;
          u.volume = this.settings.voiceVolume * (this.settings.volume ?? 1);
          u.rate = 1.04;
          speechSynthesis.speak(u);
        }
      }
    }
    return true;
  }
  update(race) {
    if (!race || !["racing", "finishing"].includes(race.state)) {
      if (this.wasRacing) this.stop();
      this.wasRacing = false;
      return;
    }
    this.wasRacing = true;
    const c = race.cars[0],
      t = race.time;
    if (c.engineerEvent) {
      this.say(c.engineerEvent, 3, t);
      c.engineerEvent = null;
    }
    if (c.fuel < c.fuelPerLap * 1.2 && race.realism === "realistic")
      this.say(
        "Combustível baixo. Temos pouco mais de uma volta. Solicite os boxes.",
        3,
        t,
        "fuel",
      );
    if (c.tires.health < 0.3)
      this.say(
        "Pneus no limite. A aderência está caindo. Vamos preparar uma troca.",
        2,
        t,
        "tires",
      );
    if (c.damage > 0.5)
      this.say(
        "Danos relevantes no carro. Precisamos de reparos nos boxes.",
        3,
        t,
        "damage",
      );
    if (c.lap > this.lastLap) {
      this.lastLap = c.lap;
      this.say(
        "Volta concluída em " + c.lastLap.toFixed(1) + " segundos.",
        1,
        t,
        "lap-" + c.lap,
      );
    }
    if (t - this.lastRoutine > this.settings.radioFrequency) {
      this.lastRoutine = t;
      const order = race.standings(),
        i = order.indexOf(c),
        front = order[i - 1];
      if (front && race.timing?.gap(front, c, t) !== null)
        this.say(
          "Carro à frente a " +
            (race.timing?.gap(front, c, t) ?? 0).toFixed(1) +
            " segundos. Preserve a saída da curva.",
          1,
          t,
          "gap",
        );
      else if (!front)
        this.say(
          "Você lidera. Mantenha a consistência e cuide dos pneus.",
          1,
          t,
          "lead",
        );
    }
  }
  report(race) {
    if (!race) return;
    const c = race.cars[0];
    this.say(
      `Pneus com ${Math.round(c.tires.health * 100)} por cento. Combustível para ${(c.fuel / c.fuelPerLap).toFixed(1)} voltas. Danos ${Math.round(c.damage * 100)} por cento.`,
      3,
      race.time,
      "requested-" + Math.floor(race.time),
    );
  }
}
