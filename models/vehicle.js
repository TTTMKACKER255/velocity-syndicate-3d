import * as THREE from "three";
import { clearPanelDents } from "./damage.js";

// Model coordinates are metres, with the nose facing -Z. Panel surfaces and wheel
// openings are sampled from continuous profiles so changes of wheelbase or roof
// style keep the glass, trim and bodywork aligned.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const styles = {
  coupe: { length: 1, width: 1, roof: 1, cabin: 0, tail: 1.24, round: 1 },
  wagon: {
    length: 1.08,
    width: 0.98,
    roof: 1.37,
    cabin: -0.05,
    tail: 1.86,
    round: 0.27,
  },
  sport: {
    length: 1.03,
    width: 0.99,
    roof: 1.12,
    cabin: 0.06,
    tail: 1.53,
    round: 0.45,
  },
  gt: {
    length: 1.07,
    width: 1.01,
    roof: 0.94,
    cabin: 0.19,
    tail: 1.49,
    round: 0.7,
  },
  muscle: {
    length: 1.1,
    width: 1.045,
    roof: 1.08,
    cabin: 0.22,
    tail: 1.48,
    round: 0.2,
  },
  tuner: {
    length: 0.99,
    width: 0.98,
    roof: 1.14,
    cabin: 0.11,
    tail: 1.37,
    round: 0.32,
  },
  hyper: {
    length: 1.04,
    width: 1.11,
    roof: 0.77,
    cabin: -0.22,
    tail: 1.46,
    round: 0.34,
  },
};

function smoothProfile(points, x) {
  let i = 0;
  while (i < points.length - 2 && x > points[i + 1][0]) i++;
  const p = points[i],
    q = points[i + 1];
  const a = points[Math.max(0, i - 1)],
    b = points[Math.min(points.length - 1, i + 2)];
  const dx = q[0] - p[0],
    t = clamp((x - p[0]) / dx, 0, 1),
    t2 = t * t;
  const left = ((q[1] - a[1]) * dx) / (q[0] - a[0]);
  const right = ((b[1] - p[1]) * dx) / (b[0] - p[0]);
  return (
    (2 * t2 * t - 3 * t2 + 1) * p[1] +
    (t2 * t - 2 * t2 + t) * left +
    (3 * t2 - 2 * t2 * t) * q[1] +
    (t2 * t - t2) * right
  );
}

function surface(uSteps, vSteps, position, reverse = false) {
  const points = [],
    triangles = [];
  for (let i = 0; i <= uSteps; i++) {
    for (let j = 0; j <= vSteps; j++) {
      points.push(...position(i / uSteps, j / vSteps));
      if (i === uSteps || j === vSteps) continue;
      const a = i * (vSteps + 1) + j,
        b = a + vSteps + 1;
      triangles.push(
        ...(reverse
          ? [a, a + 1, b, b, a + 1, b + 1]
          : [a, b, a + 1, b, b + 1, a + 1]),
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

// Collapse components that share a material into a single draw call. Batches
// for moving wheels remain separate from bodywork and fixed brake components.
class Batches {
  constructor() {
    this.buckets = new Map();
  }
  add(
    material,
    geometry,
    pos = [0, 0, 0],
    angles = [0, 0, 0],
    scale = [1, 1, 1],
  ) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles)),
      new THREE.Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    const bucket = this.buckets.get(material) || {
      positions: [],
      normals: [],
      indices: [],
    };
    const offset = bucket.positions.length / 3;
    const vertices = geometry.getAttribute("position");
    for (const v of vertices.array) bucket.positions.push(v);
    for (const n of geometry.getAttribute("normal").array)
      bucket.normals.push(n);
    if (geometry.index) {
      for (const index of geometry.index.array)
        bucket.indices.push(index + offset);
    } else {
      for (let i = 0; i < vertices.count; i++) bucket.indices.push(i + offset);
    }
    this.buckets.set(material, bucket);
    geometry.dispose();
  }
  box(material, x, y, z, w, h, l, rotation = [0, 0, 0]) {
    this.add(material, new THREE.BoxGeometry(w, h, l), [x, y, z], rotation);
  }
  oval(material, x, y, z, w, h, l, rotation = [0, 0, 0], segments = 28) {
    this.add(
      material,
      new THREE.SphereGeometry(1, segments, Math.ceil(segments / 2)),
      [x, y, z],
      rotation,
      [w, h, l],
    );
  }
  line(material, points, radius, segments = 20, sides = 6) {
    const path = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
    this.add(
      material,
      new THREE.TubeGeometry(path, segments, radius, sides, false),
    );
  }
  attach(target) {
    for (const [material, b] of this.buckets) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(b.positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(b.normals, 3),
      );
      geometry.setIndex(b.indices);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = material.name;
      mesh.castShadow = !material.transparent && !material.userData.noShadow;
      mesh.receiveShadow = !material.transparent;
      target.add(mesh);
    }
    this.buckets.clear();
  }
}

function buildMaterials(options) {
  const result = {};
  const standard = (key, color, metalness, roughness, props = {}) => {
    result[key] = new THREE.MeshStandardMaterial({
      name: key,
      color,
      metalness,
      roughness,
      ...props,
    });
  };
  result.paint = new THREE.MeshPhysicalMaterial({
    name: "Coachwork",
    color: options.paint ?? "#b7bdc2",
    metalness: options.finish === "matte" ? 0.3 : 0.65,
    roughness: options.finish === "matte" ? 0.71 : 0.245,
    clearcoat: options.finish === "matte" ? 0.07 : 0.87,
    clearcoatRoughness: 0.13,
    iridescence: options.finish === "iridescent" ? 0.93 : 0,
    side: THREE.DoubleSide,
  });
  standard("carbon", "#171b1e", 0.29, 0.43, { side: THREE.DoubleSide });
  standard("rubber", "#1c1e21", 0.02, 0.85);
  standard("tread", "#27292a", 0.04, 0.77);
  standard("grille", "#090e12", 0.25, 0.49, { side: THREE.DoubleSide });
  standard("seams", "#282c30", 0.4, 0.43);
  standard("accent", "#f35b1c", 0.43, 0.29);
  standard("metal", "#a5aaae", 0.86, 0.23);
  standard(
    "rim",
    options.rims === "silver" || options.rims === "mesh"
      ? "#c4c8c8"
      : options.rims === "bronze"
        ? "#957a55"
        : "#66717b",
    0.82,
    0.26,
  );
  standard("rotor", "#71777d", 0.76, 0.38);
  standard("seat", "#33363a", 0.08, 0.63);
  standard("glass", "#425363", 0.4, 0.135, {
    transparent: true,
    opacity: options.tint === "dark" || options.tint === true ? 0.93 : 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  standard("red", "#c91b1e", 0.21, 0.26, {
    emissive: "#ff1519",
    emissiveIntensity: 1.35,
  });
  standard("light", "#e7f4fa", 0.15, 0.17, {
    emissive: "#d8f2ff",
    emissiveIntensity: 1.45,
  });
  standard("flame", "#c4eaff", 0.02, 0.4, {
    emissive: "#5baeff",
    emissiveIntensity: 3,
  });
  const neonColor =
    typeof options.underglow === "string" &&
    /^#([a-f\d]{3}|[a-f\d]{6})$/i.test(options.underglow)
      ? options.underglow
      : "#ff692d";
  standard("neon", neonColor, 0.12, 0.3, {
    emissive: neonColor,
    emissiveIntensity: 2.6,
  });
  return result;
}

const axle = 1.335,
  radius = 0.342;
const widths = [
  [-2.18, 0.66],
  [-2.1, 0.84],
  [-1.8, 0.92],
  [-1.35, 0.975],
  [-0.8, 0.906],
  [0, 0.88],
  [0.65, 0.93],
  [1.3, 1.01],
  [1.78, 0.984],
  [2.04, 0.923],
  [2.18, 0.831],
];
const tops = [
  [-2.18, 0.48],
  [-2.07, 0.59],
  [-1.75, 0.64],
  [-1.05, 0.742],
  [-0.57, 0.772],
  [0, 0.785],
  [0.7, 0.798],
  [1.38, 0.832],
  [1.84, 0.786],
  [2.18, 0.724],
];
const lower = [
  [-2.18, 0.235],
  [-1.89, 0.192],
  [-0.6, 0.178],
  [0.4, 0.176],
  [1.85, 0.215],
  [2.18, 0.32],
];

function bodywork(batch, m, style, options) {
  const wide = options.widebody === true || options.widebody === "wide";
  const flare = (z) => Math.exp(-((Math.abs(z) - axle) ** 2) / 0.125);
  const width = (z) => smoothProfile(widths, z) + (wide ? 0.063 * flare(z) : 0);
  const crown = (z) => smoothProfile(tops, z);
  const top = (z, u) => {
    const t = Math.abs(u),
      arch = flare(z);
    const raised =
      (0.054 + 0.163 * arch) * Math.exp(-((t - 0.833) ** 2) / 0.049);
    return crown(z) + raised - 0.073 * t ** 5 + 0.018 * Math.cos(t * Math.PI);
  };
  const sill = (z) => {
    const d = Math.abs(Math.abs(z) - axle);
    if (d < 0.382) return radius + Math.sqrt(0.382 ** 2 - d * d);
    return smoothProfile(lower, z) + 0.14 * Math.exp(-(d - 0.382) * 23);
  };
  const side = (s, z, t) => {
    const y = top(z, 1) * (1 - t) + sill(z) * t;
    return [
      s * (width(z) + Math.sin(t * Math.PI) * 0.029 - 0.043 * t * t),
      y,
      z,
    ];
  };
  batch.add(
    m.paint,
    surface(138, 48, (u, v) => {
      const z = -2.18 + u * 4.36,
        x = 2 * v - 1;
      return [width(z) * x, top(z, x), z];
    }),
  );
  for (const s of [-1, 1]) {
    batch.add(
      m.paint,
      surface(184, 12, (u, v) => side(s, -2.18 + u * 4.36, v), s < 0),
    );
    // Return inside each arch, leaving space for the tire instead of burying it
    // in an uninterrupted side panel.
    for (const center of [-axle, axle]) {
      batch.add(
        m.grille,
        surface(
          52,
          6,
          (u, v) => {
            const theta = u * Math.PI,
              z = center + 0.381 * Math.cos(theta);
            return [
              s * (width(z) - 0.047 - 0.25 * v),
              radius + 0.381 * Math.sin(theta),
              z,
            ];
          },
          s > 0,
        ),
      );
      const lip = [];
      for (let i = 0; i <= 36; i++) {
        const a = (i * Math.PI) / 36,
          z = center + 0.384 * Math.cos(a);
        lip.push([s * (width(z) - 0.039), radius + 0.384 * Math.sin(a), z]);
      }
      batch.line(m.paint, lip, wide ? 0.021 : 0.012, 44);
    }
    batch.line(
      m.carbon,
      [
        [s * 0.904, 0.183, -0.95],
        [s * 0.931, 0.157, -0.55],
        [s * 0.94, 0.16, 0.45],
        [s * 0.99, 0.216, 0.94],
      ],
      0.041,
      32,
    );
    batch.line(
      m.accent,
      [
        [s * 0.929, 0.178, -0.87],
        [s * 0.951, 0.165, -0.55],
        [s * 0.958, 0.17, 0.42],
        [s * 0.982, 0.199, 0.85],
      ],
      0.009,
    );
    const seam = [
      [-0.73, 0.17],
      [-0.68, 0.44],
      [-0.63, 0.81],
      [-0.45, 0.88],
      [0.39, 0.87],
      [0.54, 0.65],
      [0.66, 0.17],
    ];
    batch.line(
      m.seams,
      seam.map(([z, t]) => {
        const p = side(s, z, t);
        p[0] += s * 0.003;
        return p;
      }),
      0.006,
      34,
      5,
    );
    batch.oval(
      m.carbon,
      s * (width(0.38) + 0.014),
      0.722,
      0.38,
      0.017,
      0.021,
      0.083,
    );
    batch.oval(
      m.paint,
      s * (width(0.37) + 0.027),
      0.729,
      0.37,
      0.012,
      0.011,
      0.061,
    );
    // Hood shutline follows the upper sheet-metal curvature.
    const hood = [];
    for (let i = 0; i <= 25; i++) {
      const z = -1.99 + (i * 1.08) / 25,
        u = 0.58 + (0.085 * i) / 25;
      hood.push([s * width(z) * u, top(z, u) + 0.003, z]);
    }
    batch.line(m.seams, hood, 0.005, 26, 5);
  }
  for (const end of [-1, 1]) {
    const z = end * 2.18;
    batch.add(
      m.paint,
      surface(
        48,
        12,
        (u, v) => {
          const x = u * 2 - 1;
          return [
            x * (width(z) + 0.029 * Math.sin(v * Math.PI) - 0.043 * v * v),
            top(z, x) * (1 - v) + sill(z) * v,
            z + end * (0.055 * (1 - x * x) * Math.sin(v * Math.PI)),
          ];
        },
        end > 0,
      ),
    );
  }
  batch.box(m.carbon, 0, 0.187, 0, 1.53, 0.078, 3.72);
  return { width, top };
}

function cabin(batch, m, style, shape) {
  const start = -0.99 + style.cabin,
    end = style.tail,
    wagon = end > 1.7;
  const roofStart = -0.31 + style.cabin,
    roofEnd = wagon ? 1.16 : 0.36 + style.cabin;
  const railProfile = [
    [start, 0.014],
    [start + 0.12, 0.085],
    [roofStart, 0.407],
    [(roofStart + roofEnd) / 2, 0.47],
    [roofEnd, 0.443],
    [end - 0.19, 0.109],
    [end, 0.017],
  ];
  const widthProfile = [
    [start, 0.75],
    [roofStart, 0.585],
    [(roofStart + roofEnd) / 2, 0.59],
    [roofEnd, 0.57],
    [end, 0.733],
  ];
  const ridge = (z) => smoothProfile(railProfile, z) * style.roof;
  const roofWidth = (z) => smoothProfile(widthProfile, z);
  const belt = (z) => shape.top(z, 0.822 / shape.width(z)) - 0.002;
  const roofY = (z, x) => {
    const blend = THREE.MathUtils.smoothstep(
      Math.min(z - start, end - z),
      0,
      0.34,
    );
    const deck = shape.top(z, (x * roofWidth(z)) / shape.width(z));
    return (
      THREE.MathUtils.lerp(deck, 0.817, blend) +
      ridge(z) +
      (0.025 + 0.009 * style.roof) * (1 - x * x) * blend
    );
  };
  const panel = (from, to, mat, steps) =>
    batch.add(
      mat,
      surface(steps, 32, (u, v) => {
        const z = from + (to - from) * u,
          x = 2 * v - 1;
        return [roofWidth(z) * x, roofY(z, x), z];
      }),
    );
  panel(start, roofStart, m.glass, 24);
  panel(roofStart, roofEnd, m.paint, 28);
  panel(roofEnd, end, m.glass, 32);
  for (const s of [-1, 1]) {
    const edge = (z, t = 1) => [
      s * THREE.MathUtils.lerp(0.822, roofWidth(z), t),
      THREE.MathUtils.lerp(belt(z) - 0.006, roofY(z, 1), t),
      z,
    ];
    batch.add(
      m.glass,
      surface(66, 12, (u, v) => edge(start + (end - start) * u, v), s > 0),
    );
    for (const [from, to, mat, thick] of [
      [start, roofStart, m.paint, 0.028],
      [roofStart, roofEnd, m.paint, 0.03],
      [roofEnd, end, m.paint, 0.034],
    ]) {
      const pts = [];
      for (let j = 0; j <= 16; j++)
        pts.push(edge(from + ((to - from) * j) / 16));
      batch.line(mat, pts, thick, 26);
    }
    batch.line(
      m.carbon,
      [edge(start, 0), edge(roofStart, 0), edge(roofEnd, 0), edge(end, 0)],
      0.015,
      35,
    );
    const post = roofStart + (roofEnd - roofStart) * 0.72;
    batch.line(
      m.carbon,
      [edge(post + 0.12, 0), edge(post + 0.05, 0.55), edge(post, 1)],
      0.024,
      12,
    );
    const mz = start + 0.24;
    batch.line(
      m.carbon,
      [
        [s * 0.813, belt(mz), mz],
        [s * 0.925, 0.89, mz - 0.06],
        [s * 0.98, 0.92, mz - 0.06],
      ],
      0.028,
      12,
    );
    batch.oval(m.paint, s * 1.008, 0.936, mz - 0.043, 0.128, 0.064, 0.104, [
      0,
      s * 0.17,
      s * 0.02,
    ]);
    batch.oval(m.metal, s * 1.015, 0.939, mz + 0.028, 0.104, 0.043, 0.025);
    if (wagon)
      batch.line(
        m.carbon,
        [
          [s * 0.57, roofY(roofStart, 1) + 0.04, roofStart],
          [s * 0.6, roofY(0.4, 1) + 0.034, 0.4],
          [s * 0.56, roofY(roofEnd, 1) + 0.042, roofEnd],
        ],
        0.019,
      );
  }
  for (const z of [start, roofStart, roofEnd, end]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = (2 * i) / 14 - 1;
      pts.push([roofWidth(z) * t, roofY(z, t) + 0.002, z]);
    }
    batch.line(m.seams, pts, 0.012, 20);
  }
  // Wipers, visible instruments and a pair of three-piece bucket seats.
  batch.line(
    m.carbon,
    [
      [-0.57, roofY(start + 0.05, -0.76) + 0.009, start + 0.05],
      [-0.29, roofY(start + 0.12, -0.4) + 0.01, start + 0.12],
      [0.08, roofY(start + 0.08, 0.1) + 0.012, start + 0.08],
    ],
    0.01,
    12,
  );
  const dashZ = start + 0.11,
    seatZ = 0.1 + style.cabin;
  batch.oval(m.carbon, 0, belt(dashZ) - 0.054, dashZ, 0.755, 0.109, 0.224);
  batch.box(m.seat, 0, 0.77, dashZ + 0.152, 0.25, 0.088, 0.033);
  batch.box(m.glass, 0, 0.78, dashZ + 0.173, 0.205, 0.057, 0.006);
  for (const x of [-0.36, 0.36]) {
    batch.oval(m.seat, x, 0.65, seatZ, 0.211, 0.102, 0.286);
    batch.oval(
      m.seat,
      x,
      0.831,
      seatZ + 0.16,
      0.197,
      0.231,
      0.079,
      [-0.15, 0, 0],
    );
    batch.oval(m.carbon, x, 0.996, seatZ + 0.19, 0.126, 0.101, 0.065);
    for (const s of [-1, 1])
      batch.oval(
        m.carbon,
        x + s * 0.166,
        0.804,
        seatZ + 0.1,
        0.047,
        0.17,
        0.105,
      );
  }
  batch.add(
    m.carbon,
    new THREE.TorusGeometry(0.12, 0.015, 10, 40),
    [-0.35, 0.86, dashZ + 0.183],
    [-0.22, 0, 0],
  );
  batch.box(m.seat, -0.35, 0.85, dashZ + 0.18, 0.201, 0.031, 0.025);
  batch.oval(m.accent, -0.35, 0.85, dashZ + 0.2, 0.03, 0.016, 0.009);
}

function wheel(batch, fixed, m, side, options) {
  // The tire shoulder rounds into a recessed wheel face. Every circular part
  // shares the axle axis, allowing the brake caliper to stay upright.
  const rotation = (profile, mat, segments = 72) => {
    batch.add(
      mat,
      surface(
        profile.length - 1,
        segments,
        (u, v) => {
          const [x, r] = profile[Math.round(u * (profile.length - 1))],
            a = TAU * v;
          return [side * x, r * Math.cos(a), r * Math.sin(a)];
        },
        side > 0,
      ),
    );
  };
  rotation(
    [
      [-0.137, 0.226],
      [-0.14, 0.27],
      [-0.135, 0.305],
      [-0.121, 0.33],
      [-0.105, 0.34],
      [-0.076, radius],
      [0.076, radius],
      [0.106, 0.339],
      [0.126, 0.328],
      [0.139, 0.298],
      [0.143, 0.26],
      [0.136, 0.23],
    ],
    m.rubber,
    88,
  );
  rotation(
    [
      [0.135, 0.237],
      [0.143, 0.249],
      [0.139, 0.256],
      [0.131, 0.258],
      [0.119, 0.249],
      [0.088, 0.243],
    ],
    m.rim,
  );
  rotation(
    [
      [-0.105, 0.238],
      [-0.105, 0.245],
      [0.124, 0.245],
      [0.13, 0.238],
    ],
    m.carbon,
  );
  for (const r of [0.27, 0.308]) {
    rotation(
      [
        [0.142 - (r - 0.27) * 0.29, r - 0.0018],
        [0.143 - (r - 0.27) * 0.29, r],
        [0.142 - (r - 0.27) * 0.29, r + 0.0018],
      ],
      m.tread,
    );
  }
  rotation(
    [
      [-0.08, 0.34],
      [-0.08, 0.343],
      [-0.072, 0.343],
      [-0.072, 0.34],
    ],
    m.tread,
  );
  rotation(
    [
      [0.07, 0.34],
      [0.07, 0.343],
      [0.078, 0.343],
      [0.078, 0.34],
    ],
    m.tread,
  );
  // Spin the rotor surface and drilled holes with the wheel.
  batch.add(
    m.rotor,
    new THREE.CylinderGeometry(0.201, 0.201, 0.02, 60),
    [side * 0.077, 0, 0],
    [0, 0, Math.PI / 2],
  );
  const polygon = (a, r, w, bend = 0) => [
    r * Math.cos(a + bend) - w * Math.sin(a + bend),
    r * Math.sin(a + bend) + w * Math.cos(a + bend),
  ];
  const spoke = (a, sign) => {
    const pts = [
      polygon(a, 0.047, -0.016),
      polygon(a, 0.137, -0.014, sign * 0.045),
      polygon(a, 0.237, -0.011, sign * 0.163),
      polygon(a, 0.238, 0.014, sign * 0.185),
      polygon(a, 0.138, 0.014, sign * 0.097),
      polygon(a, 0.047, 0.015),
    ];
    const positions = [],
      indices = [];
    for (const d of [0, 1])
      for (let j = 0; j < pts.length; j++) {
        const [y, z] = pts[j];
        const out =
          0.129 - 0.024 * Math.sin(((Math.hypot(y, z) - 0.04) / 0.2) * Math.PI);
        positions.push(side * (out - 0.023 * d), y, z);
      }
    const n = pts.length;
    for (let j = 1; j < n - 1; j++)
      indices.push(0, j, j + 1, n, n + j + 1, n + j);
    for (let j = 0; j < n; j++) {
      const q = (j + 1) % n;
      indices.push(j, j + n, q, q, j + n, q + n);
    }
    if (side < 0)
      for (let j = 0; j < indices.length; j += 3)
        [indices[j + 1], indices[j + 2]] = [indices[j + 2], indices[j + 1]];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    batch.add(m.rim, g);
  };
  const count = options.rims === "mesh" ? 9 : 5;
  for (let i = 0; i < count; i++) {
    const angle = (TAU * i) / count + 0.14;
    spoke(angle, -1);
    spoke(angle, 1);
  }
  for (let ring = 0; ring < 2; ring++)
    for (let i = 0; i < 18; i++) {
      const a = (i * TAU) / 18 + ring * 0.095,
        r = 0.14 + 0.034 * ring;
      batch.add(
        m.grille,
        new THREE.CircleGeometry(0.005, 6),
        [side * 0.088, r * Math.cos(a), r * Math.sin(a)],
        [0, (side * Math.PI) / 2, 0],
      );
    }
  batch.add(
    m.rim,
    new THREE.CylinderGeometry(0.059, 0.063, 0.031, 36),
    [side * 0.119, 0, 0],
    [0, 0, Math.PI / 2],
  );
  batch.add(
    m.accent,
    new THREE.CylinderGeometry(0.024, 0.024, 0.006, 24),
    [side * 0.139, 0, 0],
    [0, 0, Math.PI / 2],
  );
  for (let i = 0; i < 5; i++) {
    const a = (TAU * i) / 5;
    batch.add(
      m.metal,
      new THREE.CylinderGeometry(0.008, 0.008, 0.007, 6),
      [side * 0.137, 0.042 * Math.cos(a), 0.042 * Math.sin(a)],
      [0, 0, Math.PI / 2],
    );
  }
  fixed.oval(
    m.accent,
    side * 0.091,
    0.035,
    -0.16,
    0.035,
    0.103,
    0.046,
    [-0.17, 0, 0],
    18,
  );
}

function aero(batch, m, shape, style, options) {
  const hasWing =
    options.spoiler !== false && options.spoiler !== "none" && style.tail < 1.7;
  const reinforced = options.bumper === "race" || options.bumper === true;
  const nose = -2.18,
    tail = 2.18;
  batch.oval(
    m.carbon,
    0,
    0.226,
    nose + 0.01,
    0.86,
    0.027,
    reinforced ? 0.179 : 0.122,
  );
  batch.oval(m.grille, 0, 0.337, nose - 0.037, 0.41, 0.078, 0.025);
  for (const s of [-1, 1]) {
    batch.oval(m.grille, s * 0.641, 0.344, nose - 0.017, 0.171, 0.085, 0.027, [
      0,
      s * 0.12,
      s * 0.09,
    ]);
    for (let j = 0; j < 3; j++)
      batch.box(
        m.seams,
        s * 0.64,
        0.303 + j * 0.036,
        nose - 0.045,
        0.271,
        0.01,
        0.016,
        [0, s * 0.119, s * 0.07],
      );
    if (style.round > 0.5) {
      // An oval projector housing follows the raised front shoulder.
      const x = s * 0.737,
        z = -1.87,
        y = shape.top(z, x / shape.width(z)) + 0.014;
      const round = style.round,
        pitch = -0.695;
      batch.oval(
        m.carbon,
        x,
        y,
        z,
        0.135 + 0.033 * (1 - round),
        0.035,
        0.122 + 0.064 * round,
        [pitch, 0, s * 0.13],
      );
      batch.oval(
        m.glass,
        x,
        y + 0.012,
        z - 0.012,
        0.119 + 0.024 * (1 - round),
        0.031,
        0.109 + 0.05 * round,
        [pitch, 0, s * 0.13],
      );
      const ring = [];
      for (let i = 0; i <= 40; i++) {
        const a = (TAU * i) / 40,
          rx = (0.104 + 0.018 * (1 - round)) * Math.cos(a),
          rz = (0.104 + 0.04 * round) * Math.sin(a);
        ring.push([x + rx, y + 0.017 + 0.64 * rz, z + 0.755 * rz - 0.013]);
      }
      batch.line(m.light, ring, 0.0085, 45, 7);
      batch.oval(m.light, x, y + 0.025, z - 0.024, 0.052, 0.011, 0.045, [
        pitch,
        0,
        s * 0.13,
      ]);
    } else {
      const lamp = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18,
          x = s * (0.446 + 0.368 * t),
          z = -2.107 + 0.162 * t * t;
        lamp.push([x, shape.top(z, x / shape.width(z)) + 0.016, z]);
      }
      batch.line(m.carbon, lamp, 0.04, 24, 10);
      batch.line(
        m.light,
        lamp.map(([x, y, z]) => [x, y + 0.018, z - 0.023]),
        0.012,
        24,
      );
      if (options.body === "muscle" || options.body === "tuner") {
        for (const t of [0.31, 0.67]) {
          const [x, y, z] = lamp[Math.round(t * 18)];
          batch.oval(m.glass, x, y + 0.005, z - 0.021, 0.038, 0.025, 0.029);
        }
      }
    }
    const stripZ = 1.12;
    if (style.tail < 1.65)
      for (let j = 0; j < 8; j++) {
        const zz = stripZ + j * 0.055,
          u = 0.44;
        batch.box(
          m.carbon,
          s * 0.35,
          shape.top(zz, u) + 0.015,
          zz,
          0.369,
          0.01,
          0.014,
          [0, s * 0.11, 0],
        );
      }
    // Rear bumper air channels and a section of the undertray diffuser.
    batch.add(
      m.grille,
      surface(
        16,
        4,
        (u, v) => {
          const x = 0.42 + 0.37 * u,
            y = 0.345 + 0.067 * v + 0.024 * u - 0.037 * u ** 3;
          return [s * x, y, tail + 0.027 * (1 - u) + 0.009];
        },
        s > 0,
      ),
    );
    for (let j = 0; j < 3; j++)
      batch.line(
        m.seams,
        [
          [s * 0.45, 0.352 + j * 0.019, tail + 0.037],
          [s * 0.62, 0.359 + j * 0.019, tail + 0.024],
          [s * 0.77, 0.348 + j * 0.016, tail + 0.012],
        ],
        0.0035,
        10,
      );
    batch.oval(m.carbon, s * 0.73, 0.327, tail - 0.012, 0.179, 0.025, 0.063);
    batch.line(
      m.red,
      [
        [s * 0.826, 0.695, tail - 0.011],
        [s * 0.913, 0.71, 2.048],
        [s * 0.947, 0.719, 1.906],
      ],
      0.018,
      18,
    );
    for (let j = 0; j < 3; j++)
      batch.box(
        m.carbon,
        s * (0.24 + 0.119 * j),
        0.252,
        tail - 0.021,
        0.012,
        0.104,
        0.176,
        [-0.14, 0, 0],
      );
    batch.add(
      m.metal,
      new THREE.CylinderGeometry(0.063, 0.063, 0.177, 36, 1, true),
      [s * 0.185, 0.324, tail - 0.014],
      [Math.PI / 2, 0, 0],
    );
    batch.add(m.grille, new THREE.CircleGeometry(0.056, 32), [
      s * 0.185,
      0.324,
      tail + 0.07,
    ]);
    batch.add(m.metal, new THREE.TorusGeometry(0.059, 0.006, 8, 36), [
      s * 0.185,
      0.324,
      tail + 0.075,
    ]);
  }
  const back = [
    [-0.855, 0.693, 2.177],
    [-0.7, 0.704, 2.211],
    [0, 0.711, 2.229],
    [0.7, 0.704, 2.211],
    [0.855, 0.693, 2.177],
  ];
  batch.line(m.grille, back, 0.038, 54, 10);
  batch.line(
    m.red,
    back.map(([x, y, z]) => [x, y + 0.006, z + 0.032]),
    0.013,
    54,
    8,
  );
  batch.add(
    m.carbon,
    surface(
      48,
      8,
      (u, v) => {
        const t = 2 * u - 1;
        return [
          0.826 * t,
          0.242 + 0.101 * v + 0.06 * t * t,
          tail + 0.019 + 0.02 * v - 0.096 * t * t,
        ];
      },
      true,
    ),
  );
  batch.line(
    m.carbon,
    [
      [-0.85, 0.3, 2.115],
      [-0.64, 0.256, 2.18],
      [0, 0.237, 2.21],
      [0.64, 0.256, 2.18],
      [0.85, 0.3, 2.115],
    ],
    0.024,
    36,
  );
  batch.oval(m.carbon, 0, 0.312, tail + 0.023, 0.32, 0.083, 0.044);
  batch.box(m.grille, 0, 0.481, tail + 0.059, 0.329, 0.099, 0.014);
  // Geometric maker's mark, above the recessed plate.
  batch.line(
    m.metal,
    [
      [-0.044, 0.618, 2.239],
      [0, 0.591, 2.244],
      [0.044, 0.618, 2.239],
    ],
    0.006,
    6,
  );
  if (hasWing) {
    for (const s of [-1, 1]) {
      batch.line(
        m.carbon,
        [
          [s * 0.49, 0.843, 1.72],
          [s * 0.49, 0.983, 1.71],
          [s * 0.49, 1.065, 1.905],
        ],
        0.024,
        12,
      );
      batch.line(
        m.carbon,
        [
          [s * 0.49, 0.848, 1.83],
          [s * 0.49, 1.04, 1.907],
        ],
        0.013,
        8,
      );
      batch.box(
        m.carbon,
        s * 0.926,
        1.083,
        1.879,
        0.021,
        0.099,
        0.265,
        [0.08, 0, 0],
      );
      batch.box(
        m.accent,
        s * 0.936,
        1.112,
        1.884,
        0.008,
        0.013,
        0.225,
        [0.08, 0, 0],
      );
    }
    batch.add(
      m.carbon,
      surface(44, 28, (u, v) => {
        const x = (u * 2 - 1) * 0.929,
          a = v * TAU;
        return [
          x,
          1.062 + 0.012 * Math.cos(a) + 0.019 * Math.sin(a) + 0.022 * x * x,
          1.88 + 0.138 * Math.cos(a) + 0.023 * x * x,
        ];
      }),
    );
  }
  if (reinforced) {
    for (const s of [-1, 1]) {
      batch.line(
        m.carbon,
        [
          [s * 0.39, 0.224, -2.245],
          [s * 0.7, 0.237, -2.255],
          [s * 0.847, 0.272, -2.13],
        ],
        0.022,
        17,
      );
      batch.line(
        m.accent,
        [
          [s * 0.46, 0.218, -2.247],
          [s * 0.72, 0.236, -2.263],
          [s * 0.845, 0.269, -2.14],
        ],
        0.007,
        16,
      );
      batch.box(
        m.carbon,
        s * 0.672,
        0.236,
        2.11,
        0.024,
        0.135,
        0.297,
        [-0.24, 0, 0],
      );
      batch.line(
        m.accent,
        [
          [s * 0.337, 0.25, 2.213],
          [s * 0.64, 0.274, 2.201],
          [s * 0.805, 0.3, 2.135],
        ],
        0.009,
        16,
      );
    }
  }
  if (options.underglow && options.underglow !== "off") {
    for (const s of [-1, 1])
      batch.line(
        m.neon,
        [
          [s * 0.869, 0.148, -0.91],
          [s * 0.89, 0.15, 0],
          [s * 0.93, 0.166, 0.9],
        ],
        0.012,
        12,
      );
  }
}

// Silhouette changes are paired with mechanical details specific to each
// layout. These features are generated at the panel coordinates after shaping.
function variantDetails(batch, m, shape, options) {
  const type = options.body ?? "coupe";
  for (const s of [-1, 1]) {
    if (type === "muscle") {
      const scoop = [];
      for (let j = 0; j <= 15; j++) {
        const z = -1.89 + (j * 0.87) / 15,
          u = 0.237;
        scoop.push([s * shape.width(z) * u, shape.top(z, u) + 0.018, z]);
      }
      batch.line(m.paint, scoop, 0.032, 20, 10);
      batch.oval(
        m.grille,
        s * 0.218,
        0.693,
        -1.71,
        0.083,
        0.025,
        0.059,
        [-0.48, 0, 0],
      );
    }
    if (type === "wagon") {
      const rearX = s * 0.817;
      batch.line(
        m.grille,
        [
          [rearX, 0.638, 2.165],
          [s * 0.865, 0.747, 2.142],
          [s * 0.832, 0.855, 1.99],
        ],
        0.041,
        14,
      );
      batch.line(
        m.red,
        [
          [rearX, 0.638, 2.198],
          [s * 0.865, 0.752, 2.17],
          [s * 0.832, 0.865, 1.99],
        ],
        0.02,
        14,
      );
    }
    if (type === "tuner") {
      for (const x of [0.49, 0.676]) {
        batch.add(
          m.grille,
          new THREE.CylinderGeometry(0.056, 0.056, 0.022, 28),
          [s * x, 0.602, 2.219],
          [Math.PI / 2, 0, 0],
        );
        batch.add(m.red, new THREE.TorusGeometry(0.038, 0.009, 8, 32), [
          s * x,
          0.602,
          2.235,
        ]);
      }
    }
    if (type === "hyper") {
      const points = [
        [s * 0.91, 0.67, 0.25],
        [s * 0.931, 0.67, 0.53],
        [s * 0.948, 0.59, 0.77],
        [s * 0.944, 0.416, 0.67],
        [s * 0.928, 0.48, 0.44],
      ];
      const verts = [
        ...points[0],
        ...points[1],
        ...points[2],
        ...points[3],
        ...points[4],
      ];
      const intake = new THREE.BufferGeometry();
      intake.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(verts, 3),
      );
      intake.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
      intake.computeVertexNormals();
      batch.add(m.grille, intake);
      batch.line(
        m.carbon,
        [points[0], points[4], points[3], points[2]],
        0.019,
        18,
      );
    }
    if (type === "gt" || type === "sport") {
      for (let j = 0; j < 3; j++) {
        const z = -0.823 + j * 0.047,
          x = s * (shape.width(z) + 0.024);
        batch.line(
          m.grille,
          [
            [x, 0.515, z],
            [x + s * 0.002, 0.573, z + 0.013],
            [x - 0.012 * s, 0.651, z + 0.055],
          ],
          0.009,
          9,
        );
      }
    }
  }
}

export function createVehicle(options = {}) {
  const style = styles[options.body] || styles.coupe;
  const materials = buildMaterials(options);
  const group = new THREE.Group(),
    chassis = new THREE.Group();
  group.name = "Aurelia performance vehicle";
  chassis.name = "Paintwork and cockpit";
  group.scale.set(style.width, 1, style.length);
  const body = new Batches();
  const shape = bodywork(body, materials, style, options);
  cabin(body, materials, style, shape);
  aero(body, materials, shape, style, options);
  variantDetails(body, materials, shape, options);
  body.attach(chassis);
  group.add(chassis);

  const wheels = [],
    geometrySet = new Set();
  for (const s of [-1, 1]) {
    const moving = new Batches(),
      fixed = new Batches();
    wheel(moving, fixed, materials, s, options);
    const spinningTemplate = new THREE.Group(),
      brakeTemplate = new THREE.Group();
    moving.attach(spinningTemplate);
    fixed.attach(brakeTemplate);
    for (const front of [true, false]) {
      const mount = new THREE.Group(),
        spin = spinningTemplate.clone();
      mount.name = front ? "Front upright" : "Rear upright";
      mount.position.set(
        s * (front ? 0.841 : 0.876) + s * (options.widebody ? 0.018 : 0),
        radius,
        front ? -axle : axle,
      );
      mount.add(brakeTemplate.clone(), spin);
      group.add(mount);
      wheels.push({ mount, spin, front });
    }
  }
  const plumes = [];
  for (const s of [-1, 1]) {
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.046, 0.43, 15),
      materials.flame,
    );
    plume.position.set(s * 0.185, 0.324, 2.44);
    plume.rotation.x = Math.PI / 2;
    plume.visible = false;
    group.add(plume);
    plumes.push(plume);
  }
  // A single broad beam covers both low-beam lamps. Its target follows the
  // chassis, including pitch changes on ramps and downhill sections.
  const lowBeam = new THREE.SpotLight(0xe1eeff, 72, 53, 0.63, 0.57, 1.38);
  lowBeam.name = "Low beam";
  lowBeam.position.set(0, 0.63, -1.83);
  lowBeam.target.position.set(0, -0.31, -19);
  group.add(lowBeam, lowBeam.target);
  let triangles = 0;
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    geometrySet.add(obj.geometry);
    triangles +=
      (obj.geometry.index?.count ?? obj.geometry.attributes.position.count) / 3;
  });
  group.userData.body = options.body || "coupe";
  group.userData.triangles = triangles;
  group.userData.forward = "-Z";
  let rotation = 0,
    steering = 0,
    clock = 0;
  return {
    group,
    update(state = {}, dt = 0) {
      const speed = Number.isFinite(state.speed) ? state.speed : 0;
      rotation = (rotation - (speed * dt) / radius) % TAU;
      steering = THREE.MathUtils.damp(
        steering,
        clamp(state.steer || 0, -1, 1) * 0.48,
        12,
        dt,
      );
      for (const w of wheels) {
        w.spin.rotation.x = rotation;
        if (w.front) w.mount.rotation.y = steering;
      }
      materials.red.emissiveIntensity =
        state.brake > 0.01 || state.braking ? 3.1 : 1.35;
      lowBeam.visible = state.headlights !== false;
      materials.light.emissiveIntensity = lowBeam.visible ? 1.45 : 0.1;
      clock += dt;
      for (const plume of plumes) {
        plume.visible = Boolean(state.boosting || state.boost);
        plume.scale.y = 0.74 + 0.23 * Math.sin(clock * 91);
      }
    },
    dispose() {
      clearPanelDents(group);
      for (const geometry of geometrySet) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      group.removeFromParent();
    },
  };
}
