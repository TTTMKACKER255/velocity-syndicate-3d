// Subtract the actual ribbons of crossing streets from kerbs, paving and paint.
// Vertices carry x, y, z, u, v so new edges keep their texture and surface grade.
const cellSize = 36;
function bounds(points) {
  const x = points.map((p) => p[0]),
    z = points.map((p) => p[2]);
  return [Math.min(...x), Math.max(...x), Math.min(...z), Math.max(...z)];
}
function cells([x0, x1, z0, z1], visit) {
  for (let x = Math.floor(x0 / cellSize); x <= Math.floor(x1 / cellSize); x++)
    for (let z = Math.floor(z0 / cellSize); z <= Math.floor(z1 / cellSize); z++)
      visit(x + "," + z);
}
export function pavementIndex(spans) {
  const grid = new Map();
  for (const span of spans) {
    const b = bounds(span.corners);
    const area = span.corners.reduce((sum, a, i, pts) => {
      const next = pts[(i + 1) % pts.length];
      return sum + a[0] * next[2] - next[0] * a[2];
    }, 0);
    const sign = Math.sign(area);
    const edges = span.corners.map((a, i, points) => {
      const p = points[(i + 1) % points.length];
      const nx = -(p[2] - a[2]) * sign,
        nz = (p[0] - a[0]) * sign;
      return [nx, nz, -(nx * a[0] + nz * a[2])];
    });
    const entry = { road: span.road, elevation: span.elevation, b, edges };
    cells(b, (key) => {
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(entry);
    });
  }
  return (points, road, elevation) => {
    const b = bounds(points),
      hits = new Set();
    cells(b, (key) => {
      for (const other of grid.get(key) || []) {
        if (other.road === road || Math.abs(other.elevation - elevation) > 1.5)
          continue;
        const [x0, x1, z0, z1] = other.b;
        if (b[0] < x1 && b[1] > x0 && b[2] < z1 && b[3] > z0) hits.add(other);
      }
    });
    return [...hits];
  };
}

function outsideParts(polygon, edges) {
  const distance = ([nx, nz, c], p) => nx * p[0] + nz * p[2] + c;
  if (edges.some((edge) => polygon.every((p) => distance(edge, p) <= 1e-7)))
    return [polygon];
  const result = [];
  let inside = polygon;
  for (const edge of edges) {
    const keep = [],
      reject = [];
    let prev = inside.at(-1),
      a = distance(edge, prev);
    for (const curr of inside) {
      const b = distance(edge, curr);
      if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
        const t = a / (a - b);
        const cross = prev.map((v, i) => v + (curr[i] - v) * t);
        keep.push(cross);
        reject.push(cross);
      }
      if (b >= 0) keep.push(curr);
      if (b <= 0) reject.push(curr);
      prev = curr;
      a = b;
    }
    if (reject.length >= 3) result.push(reject);
    if (keep.length < 3) break;
    inside = keep;
  }
  return result;
}
export function clippedQuads(points, uv, cuts, emit) {
  if (!cuts.length) {
    emit(points, uv);
    return;
  }
  const vertices = points.map((p, i) => [...p, uv[i * 2], uv[i * 2 + 1]]);
  let fragments = [vertices];
  for (const cut of cuts)
    fragments = fragments.flatMap((p) => outsideParts(p, cut.edges));
  function write(quad) {
    emit(
      quad.map((p) => p.slice(0, 3)),
      quad.flatMap((p) => p.slice(3)),
    );
  }
  for (const p of fragments) {
    // Neighbouring masks share edges. A surviving line has no paved area.
    const twiceArea = p.reduce((sum, a, i) => {
      const b = p[(i + 1) % p.length];
      return (
        sum +
        (a[0] - p[0][0]) * (b[2] - p[0][2]) -
        (a[2] - p[0][2]) * (b[0] - p[0][0])
      );
    }, 0);
    if (Math.abs(twiceArea) < 1e-8) continue;
    if (p.length === 4) write(p);
    else
      for (let i = 1; i < p.length - 1; i++)
        write([p[0], p[i], p[i + 1], p[i + 1]]);
  }
}
