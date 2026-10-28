# AI v0.10 benchmark

Reproducer from repository root:

```bash
node scripts/benchmark-ai-v10.js
```

`baseline-recomputed.json` used the baseline `src/ai.js` from commit `0781740fd081dfe8ddfe9c00ff081901bff3ac4b`; all other code and benchmark settings were held at the current working tree. `after.json` used the updated AI. Both runs use the same deterministic seed and measurement code.

## Method

17 built-in tracks, eight laps, five numbered bots (cars 1–5), plus the car-0 slot, all on autopilot; normal difficulty; `BASE` stats; arcade/dry conditions; seed 17; fixed 60 Hz. Each track finishes 40 bot laps (680 per run). Lateral error, throttle/brake, and off-road ticks are sampled every simulation tick. Pass/contact events are collected incrementally, avoiding the race event ring-buffer limit. The 34/31 successful attempts count an attack-mode run as successful only when the targeted opponent is passed while that attack remains active; it is a simulator metric, not a user-facing prediction.

## Result

| Metric | Baseline | Updated | Change |
|---|---:|---:|---:|
| Mean bot lap | 90.892 s | 85.755 s | −5.65% |
| Mean absolute lateral error from racing line | 2.3318 m | 1.8502 m | −20.65% |
| Bot-vs-bot position-change events | 173 | 149 | −13.87% |
| Overtake attack attempts | 721 | 740 | +2.64% |
| Attempts with a pass against the chosen target | 31 (4.30%) | 34 (4.59%) | +9.68% successful attempts; +0.29 pp rate |
| Bot-vs-bot contact events | 4 | 2 | −50% |
| Off-road ticks | 0 | 0 | unchanged |
| Mean throttle | 0.4751 | 0.4789 | +0.8% |
| Mean brake | 0.1228 | 0.1036 | −15.6% |

The lower raw position-change count is reported rather than presented as a passing increase: improved, more uniform pace changes the pack dynamics. The updated AI made more attempts and more target-matched attacks completed, with fewer total bot contacts, but the single-seed sample is small. It does not prove improvement across every difficulty, weather, car specification, or network race. Pace changes come from a local racing line and distance-aware corner/braking target, not from adding a per-bot speed bonus.

Single-run wall-clock timings are retained in the JSON files for reproducibility but are host-load sensitive; this benchmark does not claim a CPU-performance improvement.
