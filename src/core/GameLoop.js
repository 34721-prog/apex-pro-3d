export class FixedStep {
  constructor(step = 1 / 60) {
    this.step = step;
    this.accumulator = 0;
    this.droppedTime = 0;
  }
  reset() {
    this.accumulator = 0;
  }
  advance(elapsed, update, paused = false) {
    if (paused) {
      this.reset();
      return 0;
    }
    if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
    const frame = Math.min(elapsed, 0.25);
    this.droppedTime += Math.max(0, elapsed - frame);
    this.accumulator += frame;
    let count = 0;
    while (this.accumulator + 1e-10 >= this.step) {
      update(this.step);
      this.accumulator -= this.step;
      count++;
    }
    return count;
  }
}
