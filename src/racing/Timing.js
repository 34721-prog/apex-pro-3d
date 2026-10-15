const SIZE = 1024,
  SECTORS = 200;
const slot = (k) => ((k % SIZE) + SIZE) % SIZE;
export class RaceTiming {
  constructor(cars, length) {
    this.length = length;
    this.states = cars.map((c) => ({
      progress: c.progress,
      s: c.s,
      lap: c.lap,
      started: false,
      key: new Int32Array(SIZE).fill(-2147483648),
      times: new Float64Array(SIZE),
      current: new Float64Array(SECTORS + 1).fill(NaN),
      reference: new Float64Array(SECTORS + 1).fill(NaN),
      best: null,
    }));
  }
  update(c, dt, time, invalid = false) {
    const st = this.states[c.id],
      advance = c.progress - st.progress;
    if (advance > 0 && advance <= 20) {
      const from = Math.floor(st.progress / 25) + 1,
        to = Math.floor(c.progress / 25);
      for (let k = from; k <= to; k++) {
        const i = slot(k);
        st.key[i] = k;
        st.times[i] = time - dt + (dt * (k * 25 - st.progress)) / advance;
      }
    }
    if (c.startedLap && !st.started) {
      st.started = true;
      st.current.fill(NaN);
      st.current[0] = 0;
    }
    if (c.lap > st.lap) {
      st.current[SECTORS] = c.lastLap;
      if (!invalid && c.bestLap === c.lastLap) {
        st.reference.set(st.current);
        st.best = c.lastLap;
      }
      st.current.fill(NaN);
      st.current[0] = 0;
    } else if (st.started && advance > 0 && c.s >= st.s) {
      const from = Math.floor((st.s / this.length) * SECTORS) + 1,
        to = Math.floor((c.s / this.length) * SECTORS);
      for (let k = from; k <= to; k++)
        st.current[k] =
          c.lapTime -
          dt +
          (dt * ((k * this.length) / SECTORS - st.s)) / (c.s - st.s);
    }
    st.progress = c.progress;
    st.s = c.s;
    st.lap = c.lap;
  }
  stamp(c, k) {
    const st = this.states[c.id],
      i = slot(k);
    return st.key[i] === k ? st.times[i] : null;
  }
  gap(leader, car, time) {
    if (leader === car) return 0;
    if (car.finished && leader.finished)
      return car.finishTime + car.penalty - leader.finishTime - leader.penalty;
    const k = Math.floor(car.progress / 25),
      a = this.stamp(leader, k),
      b = this.stamp(leader, k + 1);
    if (a === null) return null;
    if (b !== null)
      return Math.max(0, time - (a + (b - a) * (car.progress / 25 - k)));
    const own = this.stamp(car, k);
    return own === null ? null : Math.max(0, own - a);
  }
  delta(car) {
    const st = this.states[car.id],
      f = (car.s / this.length) * SECTORS,
      i = Math.floor(f),
      a = st.reference[i],
      b = st.reference[Math.min(SECTORS, i + 1)];
    return st.best !== null && Number.isFinite(a) && Number.isFinite(b)
      ? car.lapTime - (a + (b - a) * (f - i))
      : null;
  }
}
