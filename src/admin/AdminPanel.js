import { defaults, validateSave } from "../save.js";
// LOCAL DEVELOPMENT TOOL ONLY. Client-side passwords do not secure accounts.
export class AdminPanel {
  constructor() {
    this.active = false;
    this.normalSave = null;
  }
  enter(game, password) {
    if (password !== "123456789") return false;
    if (this.active) return true;
    this.normalSave = game.save;
    let lab;
    try {
      lab = JSON.parse(localStorage.getItem("apex-dynasty-lab-v1"));
    } catch {}
    game.save = validateSave(lab || structuredClone(game.save));
    this.active = true;
    return true;
  }
  exit(game) {
    if (!this.active) return;
    game.save = this.normalSave;
    this.normalSave = null;
    this.active = false;
  }
  restore(game) {
    if (this.active) game.save = defaults();
  }
  unlock(game) {
    if (!this.active) return;
    game.save.unlockedDrivers = Array.from({ length: 31 }, (_, i) => i);
    game.save.unlockedCars = Array.from({ length: 12 }, (_, i) => i);
    game.save.unlockedPaints = ["signature", "carbon", "heritage"];
    game.save.baxterWon = true;
  }
}
