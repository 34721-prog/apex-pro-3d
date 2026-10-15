// Automatic gear / synthesized engine RPM, not a full transmission model.
export function gearFor(car) {
  return car.speed < 1 ? 0 : Math.min(8, Math.floor(car.speed / 10) + 1);
}
export function rpmFor(car) {
  const gear = gearFor(car);
  if (!gear) return 1500;
  return Math.round(
    3500 + Math.min(1, Math.max(0, (car.speed - (gear - 1) * 10) / 10)) * 10500,
  );
}
export function shiftNeeded(car) {
  return (
    gearFor(car) > 0 &&
    gearFor(car) <
      Math.min(
        8,
        Math.ceil(
          ((car.stats?.maxSpeed || 80) * (1 - (car.damage || 0) * 0.32)) / 10,
        ),
      ) &&
    rpmFor(car) > 12500
  );
}
