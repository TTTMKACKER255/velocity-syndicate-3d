import { createRoadNavigator } from "../src/navigation.js";
import { roads, routePoint, roadLengths, groundHeight } from "../src/world.js";
import { locations, markerPoint } from "../src/locations.js";
import { drawMarker } from "./marker-art.js";
const bounds = { x: -1390, z: -1310, w: 2040, h: 2490 };
let atlas, navigator;
export function roadDirections(start, goal) {
  navigator ??= createRoadNavigator(
    roads,
    (road, station) => routePoint(road, station).height,
  );
  return navigator(start, goal);
}
function makeAtlas() {
  if (atlas) return atlas;
  atlas = document.createElement("canvas");
  atlas.width = 680;
  atlas.height = 830;
  const c = atlas.getContext("2d"),
    img = c.createImageData(atlas.width, atlas.height),
    d = img.data;
  for (let y = 0; y < atlas.height; y++)
    for (let x = 0; x < atlas.width; x++) {
      const wx = bounds.x + x * 3,
        wz = bounds.z + y * 3,
        h = groundHeight(wx, wz),
        n = (Math.sin(x * 17 + y * 11) * 0.5 + 0.5) * 2;
      const color =
        h < 0
          ? [23, 47, 49]
          : h < 3
            ? [86, 90, 73]
            : h < 17
              ? [52, 62, 54]
              : [57 + h * 0.08, 67 + h * 0.07, 52 + h * 0.06];
      const contour =
        h > 18 &&
        Math.floor(h / 9) !== Math.floor(groundHeight(wx + 3, wz + 3) / 9)
          ? 9
          : 0;
      let i = (y * atlas.width + x) * 4;
      d[i] = color[0] + n + contour;
      d[i + 1] = color[1] + n + contour;
      d[i + 2] = color[2] + n + contour;
      d[i + 3] = 255;
    }
  c.putImageData(img, 0, 0);
  return atlas;
}
export function mapView(w, h, p, local, zoom = 1) {
  const s = local ? zoom : Math.min(w / 1780, h / 1920) * zoom;
  const cx = local ? p.x : -390,
    cz = local ? p.z : -248;
  return {
    s,
    point: (x, z) => [(x - cx) * s + w / 2, (z - cz) * s + h / 2],
    world: (x, y) => ({ x: (x - w / 2) / s + cx, z: (y - h / 2) / s + cz }),
  };
}
export function drawMap(
  canvas,
  {
    player,
    waypoint,
    directions,
    events = [],
    local = false,
    scale = 1,
    traffic = [],
    selected = null,
  },
) {
  const w = canvas.width,
    h = canvas.height,
    c = canvas.getContext("2d"),
    v = mapView(w, h, player, local, scale),
    pt = v.point;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#142b2d";
  c.fillRect(0, 0, w, h);
  const corner = pt(bounds.x, bounds.z);
  c.drawImage(makeAtlas(), ...corner, bounds.w * v.s, bounds.h * v.s);
  c.lineWidth = 1;
  c.strokeStyle = "rgba(184,204,180,.082)";
  const step = local ? 45 : 60;
  for (let x = 0; x < w; x += step) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  for (let y = 0; y < h; y += step) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  for (const [i, road] of roads.entries()) {
    if (
      local &&
      !road.points.some(
        ([x, z]) =>
          Math.abs(x - player.x) < (w / v.s) * 0.64 &&
          Math.abs(z - player.z) < (h / v.s) * 0.65,
      )
    )
      continue;
    c.beginPath();
    road.points.forEach(([x, z], j) => {
      const [a, b] = pt(x, z);
      j ? c.lineTo(a, b) : c.moveTo(a, b);
    });
    c.lineJoin = "round";
    c.lineCap = "round";
    c.lineWidth = Math.max(2, road.width * v.s * (local ? 0.85 : 0.72));
    c.strokeStyle = i < 3 ? "#a1a293" : "#707c71";
    c.stroke();
    if (selected?.road === i) {
      c.lineWidth = Math.max(2, road.width * v.s * 0.33);
      c.strokeStyle = selected.color || "#ffa360";
      c.stroke();
    }
  }
  if (!local) {
    c.textAlign = "center";
    c.fillStyle = "#b8c3b0";
    c.font = "600 " + Math.max(10, w / 64) + "px Barlow, sans-serif";
    for (const [label, x, z] of [
      ["CANYON PASS", -835, 250],
      ["DOWNTOWN", -77, 335],
      ["HARBOUR", -3, -965],
      ["AURELIA BAY", 500, -100],
    ])
      c.fillText(label, ...pt(x, z));
  }
  if (waypoint) {
    const [x, y] = pt(waypoint.x, waypoint.z);
    c.save();
    c.strokeStyle = "#ff994e";
    c.setLineDash([4, 5]);
    c.beginPath();
    const route =
      directions === undefined ? roadDirections(player, waypoint) : directions;
    for (const [i, p] of (route?.points || []).entries()) {
      const xy = pt(p.x, p.z);
      if (i === 0) c.moveTo(...xy);
      else c.lineTo(...xy);
    }
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.arc(x, y, 6, 0, Math.PI * 2);
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }
  const markerHits = [];
  // Keep nearby map symbols individually selectable, even along the same block.
  const displayItems = [...locations, ...events];
  for (const item of displayItems) {
    const p = markerPoint(item, routePoint, roadLengths),
      point = pt(p.x, p.z);
    let [x, y] = point;
    const r = local ? (item.landmark ? 7.2 : 5.8) : 11;
    if (x < -r || y < -r || x > w + r || y > h + r) continue;
    if (!local) {
      for (
        let i = 0;
        i < 8 && markerHits.some((k) => Math.hypot(k.x - x, k.y - y) < 24);
        i++
      ) {
        const a = ((i % 4) * Math.PI) / 2,
          offset = 25 * (1 + Math.floor(i / 4));
        x = point[0] + Math.cos(a) * offset;
        y = point[1] + Math.sin(a) * offset;
      }
      if (x !== point[0] || y !== point[1]) {
        c.strokeStyle = item.color || "#ddbd93";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(...point);
        c.lineTo(x, y);
        c.stroke();
      }
    }
    drawMarker(
      c,
      x,
      y,
      r,
      item,
      selected?.id === item.id || waypoint?.id === item.id,
    );
    markerHits.push({ x, y, r, item });
  }
  for (const t of traffic) {
    c.fillStyle = "#8aabc5";
    c.beginPath();
    c.arc(...pt(t.x, t.z), 2.5, 0, 2 * Math.PI);
    c.fill();
  }
  c.save();
  c.translate(...pt(player.x, player.z));
  c.rotate(-player.heading);
  c.beginPath();
  c.moveTo(0, -8);
  c.lineTo(6, 7);
  c.lineTo(0, 4);
  c.lineTo(-6, 7);
  c.closePath();
  c.fillStyle = "#ff783d";
  c.strokeStyle = "#fff1d9";
  c.lineWidth = 1.3;
  c.fill();
  c.stroke();
  c.restore();
  return { ...v, markerHits };
}
