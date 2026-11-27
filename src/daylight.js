// Local solar time in Aurelia Bay. One full day takes six minutes in free roam.
export const timeModes = ["Auto", "Day", "Afternoon", "Evening", "Night"];
export const cycleSeconds = 360;
const presets = { Day: 11, Afternoon: 16.25, Evening: 18.43, Night: 22 };
const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
function smooth(lo, hi, value) {
  const u = clamp((value - lo) / (hi - lo));
  return u * u * (3 - 2 * u);
}
const mix = (a, b, t) => a + (b - a) * t;
function rgbMix(a, b, t) {
  return [0, 1, 2].map((i) => mix(a[i], b[i], t));
}
export function solarHour(elapsed = 0, mode = "Auto", nightEvent = false) {
  if (Object.hasOwn(presets, mode)) return presets[mode];
  return (
    ((((elapsed * 24) / cycleSeconds + (nightEvent ? 20 : 11)) % 24) + 24) % 24
  );
}
export function streetlightPower(darkness) {
  return smooth(0.18, 0.54, darkness);
}
export function daylightAt(hour) {
  hour = ((hour % 24) + 24) % 24;
  const a = ((hour - 6.25) / 24) * TAU;
  // Summer coastal sun arcs east to west, with a small northerly component.
  const vertical = Math.sin(a) * 0.86;
  const night = 1 - smooth(-0.27, 0.15, vertical);
  const warmth =
    (1 - smooth(0.01, 0.78, vertical)) * smooth(-0.25, 0.075, vertical);
  const golden =
    (1 - smooth(0.05, 0.58, vertical)) * smooth(-0.32, -0.07, vertical);
  const horizontal = Math.sqrt(1 - vertical * vertical);
  const azimuth = 1.25 + ((hour - 6) * Math.PI) / 12;
  const direction = [
    Math.sin(azimuth) * horizontal,
    vertical,
    Math.cos(azimuth) * horizontal,
  ];
  const sky = rgbMix(
    rgbMix([83, 155, 206], [101, 139, 179], golden),
    [13, 25, 46],
    night,
  );
  const horizon = rgbMix(
    rgbMix([224, 231, 221], [254, 163, 98], golden),
    [58, 68, 91],
    night ** 1.65,
  );
  const haze = rgbMix(
    rgbMix([202, 213, 206], [234, 187, 153], golden),
    [58, 69, 85],
    night,
  );
  const sunColor = rgbMix(
    [255, 243, 210],
    [255, 149, 75],
    Math.max(warmth, golden * 0.79),
  );
  const sunStrength = 2.8 * smooth(-0.12, 0.5, vertical);
  const skyStrength = mix(1.85, 0.46, night) - golden * 0.14;
  const label =
    hour < 5.6 || hour >= 20.15
      ? "Night"
      : hour < 7.55
        ? "Dawn"
        : hour < 13
          ? "Day"
          : hour < 17.65
            ? "Afternoon"
            : "Evening";
  const minutes = Math.floor((hour * 60 + 1e-7) % 1440);
  const time =
    String(Math.floor(minutes / 60)).padStart(2, "0") +
    ":" +
    String(minutes % 60).padStart(2, "0");
  return {
    hour,
    time,
    label,
    night,
    warmth,
    golden,
    direction,
    sunColor,
    sunStrength,
    skyStrength,
    sky,
    horizon,
    haze,
    lamps: streetlightPower(night),
  };
}
