export class Weather {
  constructor(initial = "dry", program = "fixed", seed = 1) {
    this.program = ["fixed", "showers", "storm", "drying"].includes(program)
      ? program
      : "fixed";
    this.initial = initial;
    this.rain = initial === "rain" ? 0.55 : 0;
    this.wetness = initial === "rain" ? 1 : 0;
    this.seed = seed;
    this.phase = -1;
  }
  forecast(time) {
    if (this.program === "fixed")
      return {
        rain: this.initial === "rain" ? 0.55 : 0,
        next: null,
        label: "Condição estável",
      };
    const offset = Math.abs(this.seed % 17),
      stages =
        this.program === "showers"
          ? [
              [0, 0],
              [65 + offset, 0.35],
              [145 + offset, 0.7],
              [260 + offset, 0],
            ]
          : this.program === "storm"
            ? [
                [0, 0.2],
                [80 + offset, 0.7],
                [165 + offset, 1],
                [235 + offset, 0.35],
                [330 + offset, 0],
              ]
            : [
                [0, 0.65],
                [60 + offset, 0.3],
                [150 + offset, 0],
              ];
    let index = 0;
    for (let i = 0; i < stages.length; i++) if (time >= stages[i][0]) index = i;
    const next = stages[index + 1];
    return {
      rain: stages[index][1],
      index,
      next: next
        ? { in: Math.max(0, next[0] - time), intensity: next[1] }
        : null,
      label: next
        ? `${next[1] > 0 ? "Chuva" : "Estiagem"} em ~${Math.ceil(next[0] - time)} s`
        : "Condição estável",
    };
  }
  step(dt, race, clock = race.time) {
    const f = this.forecast(clock);
    this.rain += (f.rain - this.rain) * (1 - Math.exp(-dt / 9));
    if (this.program !== "fixed")
      this.wetness = Math.max(
        0,
        Math.min(
          1,
          this.wetness + dt * (this.rain * 0.009 - (1 - this.rain) * 0.0025),
        ),
      );
    const condition =
      this.wetness > 0.55 ? "molhada" : this.wetness > 0.12 ? "úmida" : "seca";
    if (condition !== this.condition) {
      this.condition = condition;
      race.emit("weather", null, `Pista ${condition}`);
    }
    for (const c of race.cars) {
      c.wetness = this.wetness;
      c.rainIntensity = this.rain;
      c.weather = this.wetness > 0.3 ? "rain" : "dry";
    }
    this.forecastText = f.label;
  }
}
