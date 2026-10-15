export const DEFAULT_KEYS = {
  throttle: "KeyW",
  brake: "KeyS",
  left: "KeyA",
  right: "KeyD",
  recover: "KeyR",
  camera: "KeyC",
  pit: "KeyP",
  radio: "KeyQ",
};
export class Controls {
  constructor(onPause, onRecover, options = {}) {
    this.keys = new Set();
    this.touch = { throttle: 0, brake: 0, steer: 0 };
    this.onPause = onPause;
    this.onRecover = onRecover;
    this.options = options;
    this.settings = {
      sensitivity: 1,
      deadzone: 0.12,
      bindings: { ...DEFAULT_KEYS },
      invert: false,
    };
    this.capture = null;
    this.padPause = false;
    this.handlers = {
      keydown: (e) => this.keydown(e),
      keyup: (e) => this.keys.delete(e.code),
      blur: () => {
        this.clear();
        onPause(true);
      },
    };
    for (const [name, fn] of Object.entries(this.handlers))
      window.addEventListener(name, fn);
  }
  configure(settings) {
    this.settings = {
      ...this.settings,
      ...settings,
      bindings: { ...DEFAULT_KEYS, ...settings.bindings },
    };
  }
  keydown(e) {
    const field = e.target?.closest?.(
      "input,select,textarea,[contenteditable=true]",
    );
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      this.clear();
      cb(e.code);
      return;
    }
    if (field && e.code !== "Escape") return;
    const active = this.options.active?.() ?? true;
    if (
      active &&
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        e.code,
      )
    )
      e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Escape") this.onPause();
    if (!active) return;
    const b = this.settings.bindings;
    if (e.code === b.recover) this.onRecover();
    if (e.code === b.camera) this.options.camera?.();
    if (e.code === b.pit) this.options.pit?.();
    if (e.code === b.radio) this.options.radio?.();
  }
  clear() {
    this.keys.clear();
    this.touch = { throttle: 0, brake: 0, steer: 0 };
  }
  input() {
    const k = this.keys,
      b = this.settings.bindings;
    let throttle =
        k.has(b.throttle) || k.has("ArrowUp") ? 1 : this.touch.throttle,
      brake =
        k.has(b.brake) || k.has("ArrowDown") || k.has("Space")
          ? 1
          : this.touch.brake,
      steer =
        (k.has(b.right) || k.has("ArrowRight") ? 1 : 0) -
        (k.has(b.left) || k.has("ArrowLeft") ? 1 : 0) +
        this.touch.steer;
    const pad =
      typeof navigator !== "undefined" ? navigator.getGamepads?.()?.[0] : null;
    // Start must also work while the pause modal makes driving inactive.
    if (pad) {
      const pause = !!pad.buttons[9]?.pressed;
      if (pause && !this.padPause) this.onPause();
      this.padPause = pause;
    }
    if (pad && this.options.active?.()) {
      const dz = this.settings.deadzone,
        x = pad.axes[0] || 0;
      const axis =
        Math.abs(x) > dz ? (Math.sign(x) * (Math.abs(x) - dz)) / (1 - dz) : 0;
      if (Math.abs(axis) > Math.abs(steer)) steer = axis;
      throttle = Math.max(throttle, pad.buttons[7]?.value || 0);
      brake = Math.max(brake, pad.buttons[6]?.value || 0);
    }
    return {
      throttle,
      brake,
      // Human right is screen/vehicle right. Engine yaw-positive (+X from +Z)
      // projects LEFT in the rear camera. Convert once here; AI uses world yaw.
      steer:
        steer === 0
          ? 0
          : -Math.max(-1, Math.min(1, steer)) * (this.settings.invert ? -1 : 1),
      sensitivity: this.settings.sensitivity,
    };
  }
  dispose() {
    for (const [name, fn] of Object.entries(this.handlers))
      window.removeEventListener(name, fn);
    this.clear();
  }
}
