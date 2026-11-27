// One set of symbols is shared by the road beacons and both navigation maps.
const drawings = {
  garage: "M3 20V8l9-5 9 5v12M6 20V10h12v10M6 14h12M6 17h12",
  home: "M2 11L12 3l10 8M5 10v11h5v-7h4v7h5V10",
  anchor:
    "M12 7v14M7 10h10M3 14c1 4 4 6 9 7 5-1 8-3 9-7M3 14v4m0-4 4 1m14-1v4m0-4-4 1M14 5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z",
  mountain:
    "M2 20 9 7l3 5 3-7 7 15zM6.7 11.2l2.3 2.3 2-2m2.5-3 1.6 1.8 1.4-1.3",
  flag: "M5 21V4c5-3 9 3 15 0v10c-6 3-10-3-15 0M10 4v9m5-8v9M5 9c6-3 9 3 15 0",
  timer:
    "M13 10v5l3 1M9 2h6m-3 0v4m6 2 2-2M20 14a8 8 0 1 1-16 0 8 8 0 1 1 16 0z",
  siren: "M6 17v-5a6 6 0 0 1 12 0v5M4 17h16v4H4zM12 1v2M3 5l2 1m14 0 2-1",
  bolt: "M14 2 4 14h7l-1 8L21 9h-8z",
  gauge: "M3 18a10 10 0 1 1 18 0zM12 14l5-6",
  layers: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4",
  pin: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0zM14.2 10a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 1 1 4.4 0z",
};
const pathCache = new Map();
export function markerPath(name) {
  return drawings[name] || drawings.pin;
}
export function drawMarker(ctx, x, y, r, item, selected = false) {
  ctx.save();
  ctx.translate(x, y);
  if (selected) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 3, 0, 2 * Math.PI);
    ctx.strokeStyle = "#fff5df";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.43);
  ctx.fillStyle = "#162021";
  ctx.fill();
  ctx.strokeStyle = item.color || "#ff995e";
  ctx.lineWidth = Math.max(1.3, r * 0.105);
  ctx.stroke();
  const scale = (r * 1.43) / 24;
  ctx.scale(scale, scale);
  ctx.translate(-12, -12);
  const key = item.icon || "pin";
  if (!pathCache.has(key)) pathCache.set(key, new Path2D(markerPath(key)));
  ctx.lineWidth = 1.95;
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.stroke(pathCache.get(key));
  ctx.restore();
}
export function beaconBadge(item) {
  const canvas = document.createElement("canvas");
  canvas.width = 352;
  canvas.height = 152;
  const c = canvas.getContext("2d");
  c.fillStyle = "#101a1de6";
  c.beginPath();
  c.roundRect(7, 61, 338, 59, 12);
  c.fill();
  c.strokeStyle = item.color;
  c.lineWidth = 2;
  c.stroke();
  drawMarker(c, 176, 37, 32, item);
  c.fillStyle = "#fffdf4";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "700 30px Barlow, Arial, sans-serif";
  c.fillText(item.short || item.name, 176, 94, 312);
  c.fillStyle = item.color;
  c.beginPath();
  c.moveTo(162, 119);
  c.lineTo(190, 119);
  c.lineTo(176, 137);
  c.closePath();
  c.fill();
  return canvas;
}
