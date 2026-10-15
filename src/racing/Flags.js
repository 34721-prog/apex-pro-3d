// Compatibility entry point: the sole owner of flags/rules is RaceControl.
export function updateFlags(race, dt) {
  race.control?.update(dt);
}
