import * as THREE from "three";
import { clearPanelDents } from "./damage.js";

const bodyIds = ["coupe", "wagon", "sport", "gt", "muscle", "tuner", "hyper"];
// Length, half-track body width, roof apex, rear-glass rake and nose taper.
const profiles = {
  coupe: [4.4, 0.96, 1.35, 1.46, 0.84],
  wagon: [4.72, 0.97, 1.59, 2.08, 0.86],
  sport: [4.56, 0.96, 1.4, 1.55, 0.88],
  gt: [4.62, 0.99, 1.39, 1.62, 0.88],
  muscle: [4.84, 1.01, 1.41, 1.5, 0.92],
  tuner: [4.38, 0.94, 1.46, 1.49, 0.91],
  hyper: [4.53, 1.04, 1.18, 1.71, 0.75],
};
const TAU = Math.PI * 2;
const cache = new Map(),
  materials = new Map();

function material(name, paint) {
  const key = name === "paint" ? "paint:" + paint : name;
  const existing = materials.get(key);
  if (existing) return existing;
  const reflective = name === "paint" || name === "glass";
  const mat = new THREE.MeshStandardMaterial({
    name: name === "paint" ? "Coachwork" : name,
    color: name === "paint" ? paint : name === "glass" ? "#405665" : 0xffffff,
    vertexColors: name === "details" || name === "lights",
    side: THREE.DoubleSide,
    roughness: reflective ? 0.25 : 0.48,
    metalness: reflective ? 0.61 : 0.31,
    ...(name === "lights"
      ? { emissive: "#594038", emissiveIntensity: 0.3 }
      : {}),
  });
  materials.set(key, mat);
  return mat;
}

// One indexed mesh per material, independent of the number of lamps, spokes,
// window mouldings, wipers and grille slats on a given archetype.
class Shell {
  constructor() {
    this.vertices = [];
    this.indices = [];
    this.colors = [];
  }
  grid(columns, rows, sample, color, reverse = false) {
    const first = this.vertices.length / 3;
    const rgb = color ? new THREE.Color(color).toArray() : null;
    for (let i = 0; i <= columns; i++)
      for (let j = 0; j <= rows; j++) {
        this.vertices.push(...sample(i / columns, j / rows));
        if (rgb) this.colors.push(...rgb);
        if (i === columns || j === rows) continue;
        const a = first + i * (rows + 1) + j,
          b = a + rows + 1;
        this.indices.push(
          ...(reverse
            ? [a, a + 1, b, b, a + 1, b + 1]
            : [a, b, a + 1, b, b + 1, a + 1]),
        );
      }
  }
  sweep(points, radius, color, sides = 5) {
    const vectors = points.map((p) => new THREE.Vector3(...p));
    const path = new THREE.CatmullRomCurve3(vectors, false, "centripetal");
    const mesh = new THREE.TubeGeometry(
      path,
      Math.max(2, (points.length - 1) * 2),
      radius,
      sides,
      false,
    );
    this.add(mesh, [0, 0, 0], [0, 0, 0], [1, 1, 1], color);
  }
  add(geometry, position, rotation, scale, color) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    const first = this.vertices.length / 3;
    const pos = geometry.attributes.position;
    const rgb = color ? new THREE.Color(color).toArray() : null;
    for (let i = 0; i < pos.count; i++) {
      this.vertices.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (rgb) this.colors.push(...rgb);
    }
    for (const idx of geometry.index.array) this.indices.push(first + idx);
    geometry.dispose();
  }
  box(dim, pos, color, angles = [0, 0, 0]) {
    this.add(new THREE.BoxGeometry(...dim), pos, angles, [1, 1, 1], color);
  }
  ellipsoid(pos, scale, color, n = 12) {
    this.add(
      new THREE.SphereGeometry(1, n, Math.max(4, n >> 1)),
      pos,
      [0, 0, 0],
      scale,
      color,
    );
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.vertices, 3),
    );
    if (this.colors.length)
      g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

function templateParts(body, detail) {
  const [length, width, roof, tail, nose] = profiles[body],
    L = length * 0.5,
    axle = length * 0.303;
  const paint = new Shell(),
    glass = new Shell(),
    details = new Shell(),
    lights = new Shell();
  const close = detail === 0,
    solid = detail < 2,
    stripes = close ? 32 : solid ? 21 : 13;
  const N = close ? 38 : solid ? 22 : 12,
    tire = 0.344;
  const side = (z) =>
    width *
    (1 -
      0.085 * (Math.abs(z) / L) ** 4 -
      0.047 * Math.exp(-((z / 0.72) ** 2)) +
      0.024 * Math.exp(-((Math.abs(z) - axle) ** 2) / 0.13)) *
    (z < 0 ? 1 - (1 - nose) * (-z / L) ** 7 : 1 - 0.047 * (z / L) ** 7);
  const arch = (z) => {
    const d = Math.abs(Math.abs(z) - axle);
    return d < 0.368
      ? tire + Math.sqrt(0.368 ** 2 - d * d)
      : 0.202 + 0.13 * Math.exp(-(d - 0.368) * 18);
  };
  const top = (z, u) =>
    0.775 +
    (0.073 * z) / L -
    0.16 * (-Math.min(z, 0) / L) ** 4 +
    0.073 * Math.exp(-((Math.abs(z) - axle) ** 2) / 0.17) * Math.abs(u) ** 2 +
    0.041 * Math.exp(-((Math.abs(u) - 0.79) ** 2) / 0.037) -
    0.068 * Math.abs(u) ** 5;
  const sidePoint = (s, z, t) => [
    s * (side(z) + 0.019 * Math.sin(Math.PI * t) - 0.035 * t * t),
    top(z, 1) * (1 - t) + arch(z) * t,
    z,
  ];
  paint.grid(N, close ? 22 : solid ? 14 : 8, (u, v) => {
    const z = L * (u * 2 - 1),
      t = v * 2 - 1;
    return [side(z) * t, top(z, t), z];
  });
  for (const s of [-1, 1]) {
    paint.grid(
      N * 2,
      close ? 7 : 4,
      (u, v) => sidePoint(s, L * (u * 2 - 1), v),
      null,
      s < 0,
    );
    if (solid)
      for (const center of [-axle, axle]) {
        details.grid(
          stripes,
          2,
          (u, v) => {
            const a = u * Math.PI,
              z = center + 0.367 * Math.cos(a);
            return [
              s * (side(z) - 0.04 - 0.16 * v),
              tire + 0.367 * Math.sin(a),
              z,
            ];
          },
          "#1c2022",
          s > 0,
        );
      }
  }
  for (const end of [-1, 1]) {
    const z = L * end;
    paint.grid(
      close ? 16 : 10,
      close ? 6 : 4,
      (u, v) => {
        const t = u * 2 - 1;
        return [
          t * (side(z) + 0.019 * Math.sin(v * Math.PI) - 0.035 * v * v),
          top(z, t) * (1 - v) + arch(z) * v,
          z + end * 0.034 * (1 - t * t) * Math.sin(v * Math.PI),
        ];
      },
      null,
      end > 0,
    );
  }
  const front =
    ((body === "hyper" ? -1.19 : body === "muscle" ? -0.83 : -0.99) * length) /
    4.5;
  const roofStart = front + 0.61,
    roofEnd = body === "wagon" ? 1.15 : body === "muscle" ? 0.54 : 0.43;
  const sill = (z) => top(z, 0.82) - 0.012;
  const roofW = (z) => 0.6 * width + 0.015 * Math.cos(z * 1.2);
  function roofHeight(z) {
    if (z < roofStart) {
      const t = (z - front) / (roofStart - front);
      return sill(z) + (roof - sill(roofStart)) * (t * 0.78 + 0.22 * t * t);
    }
    if (z <= roofEnd)
      return (
        roof +
        0.028 * Math.sin((Math.PI * (z - roofStart)) / (roofEnd - roofStart))
      );
    const t = (z - roofEnd) / (tail - roofEnd);
    return (
      roof +
      (sill(tail) - roof) * (body === "wagon" ? t * t : t * (0.89 + 0.11 * t))
    );
  }
  const beltW = (z) => side(z) * 0.902;
  const railW = (z) => {
    const t =
      z < roofStart
        ? (z - front) / (roofStart - front)
        : z > roofEnd
          ? (tail - z) / (tail - roofEnd)
          : 1;
    return beltW(z) + (roofW(z) - beltW(z)) * t;
  };
  const edge = (s, z, t) => [
    s * (beltW(z) + (railW(z) - beltW(z)) * t),
    sill(z) + (roofHeight(z) - sill(z)) * t,
    z,
  ];
  const roofSurf = (which, from, to) =>
    which.grid(close ? 11 : 6, solid ? 10 : 6, (u, v) => {
      const z = from + (to - from) * u,
        x = 2 * v - 1;
      return [
        x * railW(z),
        roofHeight(z) +
          0.031 * (1 - x * x) * Math.min(1, (z - front) * 5, (tail - z) * 5),
        z,
      ];
    });
  roofSurf(glass, front, roofStart);
  roofSurf(paint, roofStart, roofEnd);
  roofSurf(glass, roofEnd, tail);
  const panelZ = (from, to, steps) =>
    Array.from(
      { length: steps + 1 },
      (_, i) => from + ((to - from) * i) / steps,
    );
  for (const s of [-1, 1]) {
    glass.grid(
      solid ? 22 : 12,
      4,
      (u, v) => edge(s, front + (tail - front) * u, v),
      null,
      s > 0,
    );
    for (const [a, b] of [
      [front, roofStart],
      [roofStart, roofEnd],
      [roofEnd, tail],
    ]) {
      paint.sweep(
        panelZ(a, b, solid ? 4 : 2).map((z) => edge(s, z, 1)),
        0.031,
      );
    }
    details.sweep(
      panelZ(front, tail, 6).map((z) => edge(s, z, 0)),
      0.016,
      "#21282d",
    );
    const pillar = body === "wagon" ? 0.01 : 0.2;
    details.sweep(
      [edge(s, pillar + 0.09, 0), edge(s, pillar, 1)],
      0.032,
      "#242b2f",
    );
    if (body === "wagon")
      details.sweep([edge(s, 0.86, 0), edge(s, 0.82, 1)], 0.024, "#242b2f");
    if (solid) {
      const mz = front + 0.24;
      details.sweep(
        [
          [s * 0.79, sill(mz), mz],
          [s * 0.999, sill(mz) + 0.062, mz + 0.01],
        ],
        0.026,
        "#252a2c",
      );
      paint.ellipsoid(
        [s * (width + 0.054), sill(mz) + 0.074, mz + 0.02],
        [0.119, 0.056, 0.083],
        null,
        close ? 14 : 8,
      );
      details.sweep(
        [
          [s * (width - 0.055), 0.204, -axle + 0.38],
          [s * (width - 0.024), 0.174, 0],
          [s * (width + 0.003), 0.211, axle - 0.36],
        ],
        0.035,
        "#242a2c",
      );
      const joint = [
        [-0.7, 0.21],
        [-0.63, 0.71],
        [-0.44, 0.9],
        [0.33, 0.89],
        [0.51, 0.68],
        [0.64, 0.19],
      ];
      details.sweep(
        joint.map(([z, t]) => {
          const q = sidePoint(s, z, t);
          q[0] += s * 0.004;
          return q;
        }),
        0.007,
        "#30373a",
      );
      details.ellipsoid(
        [s * (side(0.39) + 0.015), 0.713, 0.38],
        [0.013, 0.015, 0.07],
        "#3a4143",
        8,
      );
      if (body === "wagon" || body === "sport") {
        details.sweep(
          [
            [s * (side(0.63) + 0.003), 0.72, 0.63],
            [s * (side(0.73) + 0.012), 0.51, 0.73],
            [s * (side(0.82) + 0.009), 0.4, 0.82],
          ],
          0.006,
          "#303438",
        );
      }
      if (body === "wagon")
        details.sweep(
          [
            [s * 0.526, roofHeight(roofStart) + 0.031, roofStart],
            [s * 0.548, roofHeight(0.35) + 0.051, 0.35],
            [s * 0.53, roofHeight(roofEnd) + 0.04, roofEnd],
          ],
          0.022,
          "#525b60",
        );
    }
    const frontLamp = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6,
        z = -L + 0.018 + 0.19 * u * u,
        x = s * (0.4 + 0.39 * u) * width;
      frontLamp.push([x, top(z, x / side(z)) + 0.008, z]);
    }
    details.sweep(frontLamp, 0.047, "#252c30", solid ? 6 : 4);
    lights.sweep(
      frontLamp.map(([x, y, z]) => [x, y + 0.016, z - 0.026]),
      body === "muscle" ? 0.021 : 0.012,
      "#eff6e7",
      5,
    );
    const back = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6,
        x = s * (0.28 + 0.53 * u) * width,
        z = L + 0.015 * (1 - u) - 0.08 * u * u;
      back.push([x, top(Math.min(L, z), x / side(L)) - 0.08 + 0.017 * u, z]);
    }
    details.sweep(back, 0.046, "#342c2a", 5);
    lights.sweep(
      back.map(([x, y, z]) => [x, y + 0.006, z + 0.028]),
      0.021,
      "#fa4234",
      5,
    );
    if (solid && body === "wagon")
      lights.sweep(
        [
          [s * width * 0.796, 0.753, L - 0.065],
          [s * width * 0.815, 0.91, L - 0.2],
          [s * width * 0.804, 1.015, L - 0.31],
        ],
        0.029,
        "#e14a39",
      );
    for (const az of [-axle, axle]) {
      const wx = s * (width - 0.103);
      const ring = (points, color, segments) =>
        details.grid(
          segments,
          points.length - 1,
          (u, v) => {
            const [offset, r] = points[Math.round(v * (points.length - 1))],
              a = u * TAU;
            return [
              wx + s * offset,
              tire + r * Math.cos(a),
              az + r * Math.sin(a),
            ];
          },
          color,
          s < 0,
        );
      ring(
        [
          [-0.115, 0.22],
          [-0.125, 0.29],
          [-0.104, 0.332],
          [-0.074, 0.344],
          [0.074, 0.344],
          [0.105, 0.329],
          [0.126, 0.29],
          [0.128, 0.226],
        ],
        "#22262a",
        stripes,
      );
      ring(
        [
          [0.117, 0.214],
          [0.134, 0.22],
          [0.131, 0.233],
          [0.11, 0.235],
        ],
        "#b5b9bc",
        stripes,
      );
      const hubX = wx + s * 0.1;
      details.add(
        new THREE.CylinderGeometry(0.202, 0.202, 0.016, stripes),
        [hubX, tire, az],
        [0, 0, Math.PI / 2],
        [1, 1, 1],
        "#4e575d",
      );
      if (solid)
        details.ellipsoid(
          [wx + s * 0.112, tire + 0.025, az - 0.148],
          [0.023, 0.084, 0.036],
          "#b75537",
          8,
        );
      const spokes = body === "tuner" ? 8 : 5;
      for (let j = 0; j < spokes; j++) {
        const a = (TAU * j) / spokes + 0.13;
        if (close)
          for (const fork of [-1, 1]) {
            details.sweep(
              [
                [
                  wx + s * 0.13,
                  tire + Math.cos(a) * 0.025,
                  az + Math.sin(a) * 0.025,
                ],
                [
                  wx + s * 0.119,
                  tire + Math.cos(a) * 0.129,
                  az + Math.sin(a) * 0.129,
                ],
                [
                  wx + s * 0.132,
                  tire + Math.cos(a + fork * 0.14) * 0.216,
                  az + Math.sin(a + fork * 0.14) * 0.216,
                ],
              ],
              0.012,
              "#abb2b7",
              4,
            );
          }
        else {
          details.box(
            [0.025, 0.178, 0.027],
            [
              wx + s * 0.13,
              tire + Math.cos(a) * 0.122,
              az + Math.sin(a) * 0.122,
            ],
            "#a6adb1",
            [a, 0, 0],
          );
        }
      }
      details.add(
        new THREE.CylinderGeometry(0.049, 0.048, 0.024, solid ? 14 : 8),
        [wx + s * 0.132, tire, az],
        [0, 0, Math.PI / 2],
        [1, 1, 1],
        "#9ea6a9",
      );
    }
  }
  details.ellipsoid(
    [0, 0.39, -L - 0.019],
    [width * 0.47, 0.089, 0.034],
    "#182022",
    solid ? 18 : 10,
  );
  if (solid)
    for (let j = 0; j < 3; j++)
      details.box(
        [width * 0.72, 0.008, 0.014],
        [0, 0.35 + j * 0.03, -L - 0.051],
        "#42484a",
      );
  details.sweep(
    [
      [-0.74, 0.252, L - 0.022],
      [0, 0.222, L + 0.03],
      [0.74, 0.252, L - 0.022],
    ],
    0.044,
    "#262b2e",
  );
  details.box([0.31, 0.087, 0.022], [0, 0.517, L + 0.038], "#a2a6a1");
  if (solid) {
    for (const s of [-1, 1])
      details.add(
        new THREE.CylinderGeometry(0.042, 0.046, 0.107, 12),
        [s * 0.57, 0.239, L + 0.014],
        [Math.PI / 2, 0, 0],
        [1, 1, 1],
        "#676d71",
      );
    if (body === "hyper" || body === "muscle") {
      for (const s of [-1, 1])
        details.box(
          [0.034, 0.144, 0.053],
          [s * 0.54, 0.867, L - 0.21],
          "#33383a",
        );
      details.box(
        [1.66, 0.042, 0.174],
        [0, 0.949, L - 0.19],
        "#373d40",
        [0.07, 0, 0],
      );
    }
  }
  return {
    paint: paint.geometry(),
    glass: glass.geometry(),
    details: details.geometry(),
    lights: lights.geometry(),
  };
}

export function createTrafficModel(paint, variant = 0) {
  const body =
    typeof variant === "string" && profiles[variant]
      ? variant
      : bodyIds[Math.abs(Number(variant) || 0) % bodyIds.length] || "coupe";
  const color = new THREE.Color(paint).getHex();
  const root = new THREE.LOD();
  root.name = "Traffic " + body;
  Object.assign(root.userData, {
    trafficModel: true,
    body,
    color,
    dents: [],
    dentRevision: 0,
    halfWidth: profiles[body][1],
    halfLength: profiles[body][0] * 0.5,
  });
  let cached = cache.get(body);
  if (!cached) {
    cached = {
      parts: [0, 1, 2].map((detail) => templateParts(body, detail)),
      users: 0,
    };
    cache.set(body, cached);
  }
  cached.users++;
  for (let i = 0; i < 3; i++) {
    const level = new THREE.Group();
    level.name = ["Detailed bodywork", "Road distance", "Distant silhouette"][
      i
    ];
    for (const [name, geometry] of Object.entries(cached.parts[i])) {
      const mesh = new THREE.Mesh(geometry, material(name, color));
      mesh.name = mesh.material.name;
      mesh.userData.deformable =
        name === "paint" || name === "glass" || name === "lights";
      mesh.castShadow = i === 0 && name !== "lights";
      mesh.receiveShadow = name !== "lights";
      level.add(mesh);
    }
    root.addLevel(level, [0, 47, 126][i], 0.08);
    level.visible = i === 0;
  }
  return root;
}

export function disposeTrafficModel(root) {
  if (!root?.userData.trafficModel || root.userData.trafficDisposed) return;
  root.userData.trafficDisposed = true;
  clearPanelDents(root);
  const owner = cache.get(root.userData.body);
  if (owner && --owner.users === 0) {
    owner.parts.forEach((level) =>
      Object.values(level).forEach((geometry) => geometry.dispose()),
    );
    cache.delete(root.userData.body);
  }
  if (!cache.size) {
    for (const mat of materials.values()) mat.dispose();
    materials.clear();
  }
  root.removeFromParent();
}
