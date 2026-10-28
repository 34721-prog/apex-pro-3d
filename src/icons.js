const paths = {
  flag: "M4 21V3m0 1c5-4 10 4 16 0v10c-6 4-11-4-16 0",
  trophy:
    "M8 3h8v8a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 3v6m-4 0h8",
  car: "m4 14 2-6h12l2 6M3 14h18v5H3v-5Zm3 5v2m12-2v2M6 16h2m8 0h2M9 8V5h6v3",
  bolt: "m13 2-9 12h7l-1 8L21 9h-8l0-7Z",
  stats: "M4 20V10m8 10V4m8 16v-7M2 22h20",
  settings:
    "m9 3-1 3-3 1-2 4 2 3 1 3 4 2 3-1 3 0 3-3-1-3 1-3-3-3-3 0-3-3Zm6 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  left: "m15 5-7 7 7 7",
  speed: "M4 18a9 9 0 1 1 16 0M12 14l5-6M4 13h2m0-6 2 2m4-5v3m6 6h2",
  curve: "M4 21V11a7 7 0 0 1 14 0v9m-4-4 4 4 4-4",
  brake:
    "M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-6-3v4m0 2v.1",
  timer:
    "M9 2h6m-3 0v3m6 1 2 2M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5v6l3 2",
  check: "m5 12 4 4L20 5",
  close: "m6 6 12 12M6 18 18 6",
  lock: "M6 11h12v10H6V11Zm2 0V7a4 4 0 0 1 8 0v4m-4 4v3",
  audio: "m3 9 5 0 5-5v16l-5-5H3V9Zm13-1c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  mute: "m3 9 5 0 5-5v16l-5-5H3V9Zm13 0 6 6m0-6-6 6",
  pause: "M8 4v16M16 4v16",
  play: "m8 4 12 8-12 8V4Z",
  credit: "m12 2 9 5v10l-9 5-9-5V7l9-5Zm3 6h-5v8h5",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
  pin: "M19 9c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 14 0ZM15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  podium: "M3 21V11h6v10m0 0V5h6v16m0-7h6v7M1 21h22",
  crown: "m3 6 5 5 4-8 4 8 5-5-2 13H5L3 6Z",
  help: "M9 8a3 3 0 0 1 6 0c0 3-3 3-3 6m0 3v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  reset: "M4 9a8 8 0 1 1 0 7M4 3v6h6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  wifi: "M5 9a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-5 4h.1",
  user: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  copy: "M8 8V4h12v12h-4M4 8h12v12H4z",
  alert: "M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3v.1",
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.flag}"/></svg>`;
