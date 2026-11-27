// Build one graph for both maps. Crossing centre lines connect only where their
// decks meet. Project positions onto actual road segments, including at flyovers.
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const side = (ax, az, bx, bz) => ax * bz - az * bx;
function projection(p, s) {
  const u = Math.max(
    0,
    Math.min(
      1,
      ((p.x - s.a.x) * s.dx + (p.z - s.a.z) * s.dz) / (s.len * s.len),
    ),
  );
  return {
    x: s.a.x + u * s.dx,
    z: s.a.z + u * s.dz,
    height: s.a.height + u * (s.b.height - s.a.height),
    u,
  };
}
export function createRoadNavigator(roads, heightAt) {
  const nodes = [],
    segments = [],
    ends = [],
    index = new Map(),
    size = 48;
  const cell = (x, z) => Math.floor(x / size) + "," + Math.floor(z / size);
  function node(x, z, height) {
    const p = { x, z, height, id: nodes.length, links: [] };
    nodes.push(p);
    return p;
  }
  function link(a, b) {
    if (a === b) return;
    const length = Math.max(0.00001, dist(a, b));
    a.links.push([b.id, length]);
    b.links.push([a.id, length]);
  }
  for (const [road, data] of roads.entries()) {
    let station = 0,
      first,
      previous;
    for (const [i, [x, z]] of data.points.entries()) {
      if (previous) station += Math.hypot(x - previous.x, z - previous.z);
      const current =
        i > 0 && x === first.x && z === first.z
          ? first
          : node(x, z, heightAt(road, station));
      if (!previous) first = current;
      else {
        const len = dist(previous, current);
        if (len > 0)
          segments.push({
            a: previous,
            b: current,
            road,
            width: data.width,
            dx: x - previous.x,
            dz: z - previous.z,
            len,
            stops: [
              [0, previous],
              [1, current],
            ],
          });
      }
      previous = current;
    }
    if (previous !== first) ends.push([road, first], [road, previous]);
  }
  for (const s of segments) {
    const nearby = new Set(),
      padding = s.width / 2 + 2;
    for (
      let x = Math.floor((Math.min(s.a.x, s.b.x) - padding) / size);
      x <= Math.floor((Math.max(s.a.x, s.b.x) + padding) / size);
      x++
    )
      for (
        let z = Math.floor((Math.min(s.a.z, s.b.z) - padding) / size);
        z <= Math.floor((Math.max(s.a.z, s.b.z) + padding) / size);
        z++
      ) {
        const key = x + "," + z;
        if (!index.has(key)) index.set(key, []);
        const list = index.get(key);
        for (const other of list) if (other.road !== s.road) nearby.add(other);
        list.push(s);
      }
    for (const other of nearby) {
      const denom = side(s.dx, s.dz, other.dx, other.dz);
      if (Math.abs(denom) < 1e-8) continue;
      const dx = other.a.x - s.a.x,
        dz = other.a.z - s.a.z;
      const u = side(dx, dz, other.dx, other.dz) / denom,
        v = side(dx, dz, s.dx, s.dz) / denom;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const height = s.a.height + u * (s.b.height - s.a.height);
      if (
        Math.abs(
          height - other.a.height - v * (other.b.height - other.a.height),
        ) > 1.5
      )
        continue;
      const crossing = node(s.a.x + u * s.dx, s.a.z + u * s.dz, height);
      s.stops.push([u, crossing]);
      other.stops.push([v, crossing]);
    }
  }
  // A few T-junctions terminate inside the receiving road's outer lane.
  for (const [road, end] of ends) {
    let best = Infinity,
      match;
    for (const s of index.get(cell(end.x, end.z)) || []) {
      if (s.road === road) continue;
      const p = projection(end, s),
        d = dist(end, p);
      if (
        d < best &&
        d < s.width / 2 + 1 &&
        Math.abs(end.height - p.height) < 1.5
      ) {
        best = d;
        match = [s, p];
      }
    }
    if (match) {
      const [s, p] = match,
        junction = node(p.x, p.z, p.height);
      s.stops.push([p.u, junction]);
      link(end, junction);
    }
  }
  for (const s of segments) {
    s.stops.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < s.stops.length; i++)
      link(s.stops[i - 1][1], s.stops[i][1]);
  }
  function snap(pos) {
    let best = Infinity,
      hit;
    // The neighbouring cells also matter when a driver is off-road near a cell boundary.
    const local = new Set();
    for (const dx of [-size, 0, size])
      for (const dz of [-size, 0, size])
        for (const s of index.get(cell(pos.x + dx, pos.z + dz)) || [])
          local.add(s);
    for (const s of local.size ? local : segments) {
      const p = projection(pos, s),
        dy = Math.abs((pos.height ?? pos.y ?? p.height) - p.height);
      const score = dist(pos, p) ** 2 + (dy > 1.5 ? 3 * dy : 0) ** 2;
      if (score < best) {
        best = score;
        hit = { p, s };
      }
    }
    return hit;
  }
  let targetKey = "",
    target,
    distances,
    next;
  function setTarget(goal) {
    const key = goal.x + "/" + goal.z + "/" + (goal.height ?? goal.y ?? "");
    if (key === targetKey) return;
    targetKey = key;
    target = snap(goal);
    distances = new Float64Array(nodes.length).fill(Infinity);
    next = new Int32Array(nodes.length).fill(-1);
    const visited = new Uint8Array(nodes.length);
    for (const [, n] of target.s.stops) distances[n.id] = dist(n, target.p);
    // The destination changes at a checkpoint or on a map click. Distances are
    // reused as the driver moves, so rerouting needs no new graph search.
    for (;;) {
      let id = -1,
        closest = Infinity;
      for (let i = 0; i < nodes.length; i++)
        if (!visited[i] && distances[i] < closest) {
          id = i;
          closest = distances[i];
        }
      if (id < 0) break;
      visited[id] = 1;
      for (const [j, length] of nodes[id].links)
        if (closest + length < distances[j]) {
          distances[j] = closest + length;
          next[j] = id;
        }
    }
  }
  return function route(start, goal) {
    setTarget(goal);
    const source = snap(start),
      points = [source.p];
    if (source.s !== target.s) {
      let id = -1,
        best = Infinity;
      for (const [, n] of source.s.stops) {
        const cost = dist(source.p, n) + distances[n.id];
        if (cost < best) {
          best = cost;
          id = n.id;
        }
      }
      if (id === -1) return null;
      while (id !== -1) {
        points.push(nodes[id]);
        id = next[id];
      }
    }
    points.push(target.p);
    if (dist(target.p, goal) < target.s.width * 0.5 + 4) points.push(goal);
    const distance = points.reduce(
      (sum, p, i) => sum + dist(i ? points[i - 1] : start, p),
      0,
    );
    const ahead = points.find((p) => dist(start, p) > 18) || points.at(-1);
    return { points, distance, ahead };
  };
}
