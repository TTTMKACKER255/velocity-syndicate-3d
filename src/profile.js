export const cars = [
  {
    id: "coupe",
    name: "Veloce GT-R",
    make: "Veloce",
    kind: "Track coupé",
    top: 88,
    accel: 14.2,
    grip: 1.12,
    cost: 0,
    paint: "#bfc4c9",
  },
  {
    id: "wagon",
    name: "Nord V60-R",
    make: "Nord",
    kind: "Performance wagon",
    top: 76,
    accel: 13.3,
    grip: 1.18,
    cost: 5400,
    paint: "#597776",
  },
  {
    id: "sport",
    name: "Vier RS4",
    make: "Vier",
    kind: "All-wheel-drive coupé",
    top: 82,
    accel: 14.6,
    grip: 1.22,
    cost: 6600,
    paint: "#465b7e",
  },
  {
    id: "gt",
    name: "Bergwerk M4X",
    make: "Bergwerk",
    kind: "Track saloon",
    top: 86,
    accel: 14.9,
    grip: 1.14,
    cost: 7500,
    paint: "#bbb795",
  },
  {
    id: "muscle",
    name: "Maddox V8",
    make: "Maddox",
    kind: "American muscle",
    top: 91,
    accel: 15.8,
    grip: 0.92,
    cost: 7200,
    paint: "#ab482b",
  },
  {
    id: "tuner",
    name: "Kaido R32",
    make: "Kaido",
    kind: "Street tuner",
    top: 80,
    accel: 14.8,
    grip: 1.27,
    cost: 6200,
    paint: "#9488bd",
  },
  {
    id: "hyper",
    name: "Solare X1",
    make: "Solare",
    kind: "Mid-engine hypercar",
    top: 101,
    accel: 18.2,
    grip: 1.18,
    cost: 16500,
    paint: "#c09329",
  },
];
export const upgradeNames = {
  engine: "Engine",
  turbo: "Turbocharger",
  transmission: "Transmission",
  nitro: "Nitro capacity",
  tires: "Tires",
  suspension: "Suspension",
};
export const repCost = (level) => level * 20;
export const upgradeCost = (level) => (level + 1) * 850;
export const baseLook = (car) => ({
  body: car.id,
  paint: car.paint,
  finish: "metallic",
  rims: "alloy",
  spoiler: true,
  widebody: false,
  bumper: false,
  tint: false,
  underglow: false,
});
const key = "velocity-syndicate.profile.v1";
const defaults = () => ({
  version: 1,
  credits: 2500,
  rep: 0,
  repBalance: 0,
  car: "coupe",
  owned: ["coupe"],
  upgrades: {},
  looks: {},
  wins: {},
  best: {},
  parts: [],
  settings: {
    sound: true,
    voice: false,
    quality: "Balanced",
    units: "km/h",
    cycle: true,
  },
});
export function readProfile() {
  const fresh = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    if (!raw || raw.version !== 1) return fresh;
    const p = {
      ...fresh,
      ...raw,
      settings: { ...fresh.settings, ...raw.settings },
    };
    p.owned = Array.isArray(p.owned)
      ? p.owned.filter((id) => cars.some((c) => c.id === id))
      : ["coupe"];
    if (!p.owned.includes("coupe")) p.owned.push("coupe");
    if (!p.owned.includes(p.car)) p.car = "coupe";
    for (const k of ["best", "wins", "upgrades", "looks"])
      if (!p[k] || typeof p[k] !== "object") p[k] = {};
    if (!Array.isArray(p.parts)) p.parts = [];
    if (!Number.isFinite(raw.repBalance)) p.repBalance = p.rep;
    for (const k of ["rep", "repBalance", "credits"])
      p[k] = Number.isFinite(p[k]) ? Math.max(0, p[k]) : fresh[k];
    return p;
  } catch {
    return fresh;
  }
}
export function saveProfile(p) {
  try {
    localStorage.setItem(key, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
export function activeCar(p) {
  return cars.find((c) => c.id === p.car) || cars[0];
}
export function currentLook(p, car = activeCar(p)) {
  return { ...baseLook(car), ...p.looks[car.id] };
}
export const money = (n) => Math.round(n).toLocaleString("en-GB");
