// Presentation-only observer: never writes race state or consumes the physics RNG.
export class AudienceEvents {
  constructor() {
    this.serial = 0;
    this.events = [];
    this.race = null;
  }
  push(kind, car, strength) {
    const e = {
      serial: ++this.serial,
      kind,
      x: car.x,
      z: car.z,
      strength,
      time: this.race?.time || 0,
    };
    this.events.push(e);
    this.events = this.events.slice(-12);
    return e;
  }
  update(race) {
    if (race !== this.race) {
      this.race = race;
      this.events = [];
      this.lastId = 0;
      this.previous = null;
      this.won = false;
      this.nextCheck = 0;
    }
    if (!race) return;
    const p = race.cars[0];
    for (const e of race.events)
      if (e.id > this.lastId) {
        if (e.type === "start") this.push("start", p, 0.55);
        if (e.type === "finish" && e.car === 0) this.push("finish", p, 0.85);
      }
    this.lastId = race.eventSerial;
    const order = race.physicalOrder();
    if (race.time >= this.nextCheck) {
      this.nextCheck = race.time + 0.15;
      const ids = order.map((c) => c.id);
      if (
        this.previous &&
        race.state === "racing" &&
        !p.finished &&
        !p.retired &&
        p.pit.state === "track" &&
        p.speed > 10
      ) {
        const old = this.previous.indexOf(p.id),
          now = ids.indexOf(p.id);
        if (now < old) {
          const passed = order
            .slice(now + 1, old + 1)
            .find(
              (c) =>
                !c.retired &&
                !c.finished &&
                c.pit.state === "track" &&
                Math.abs(c.progress - p.progress) < 40,
            );
          if (passed) this.push("overtake", p, now === 0 ? 0.9 : 0.65);
        }
      }
      this.previous = ids;
    }
    if (
      !this.won &&
      p.finished &&
      !p.disqualified &&
      !["practice", "qualifying"].includes(race.sessionType) &&
      race.standings()[0] === p
    ) {
      this.won = true;
      this.push("victory", p, 1);
    }
  }
}
