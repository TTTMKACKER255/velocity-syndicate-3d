// Plant geometry is authored in metres. Both renderers consume the same rings,
// branches, leaf blades, wind coefficients and camera-distance detail levels.
import * as THREE from "three";

const TAU = 2 * Math.PI;
const clamp = THREE.MathUtils.clamp;
const mix = (a, b, t) => a + (b - a) * t;
const lerp = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
function generator(seed) {
  return () =>
    (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
}
function hash(x, z) {
  let h = Math.imul(x ^ 0x2b76, 2246822519) ^ Math.imul(z + 8317, 3266489917);
  h = Math.imul(h ^ (h >>> 16), 668265263);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

class SurfaceBuilder {
  constructor() {
    this.p = [];
    this.colors = [];
    this.uv = [];
    this.flex = [];
    this.indices = [];
  }
  point(p, color, uv = [0, 0], flex = [0, 0, 0]) {
    const id = this.p.length / 3;
    this.p.push(...p);
    this.colors.push(...color);
    this.uv.push(...uv);
    this.flex.push(...flex);
    return id;
  }
  triangle(a, b, c) {
    this.indices.push(a, b, c);
  }
  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }
  finish() {
    const g = new THREE.BufferGeometry();
    const attr = (name, a, size) =>
      g.setAttribute(name, new THREE.Float32BufferAttribute(a, size));
    attr("position", this.p, 3);
    attr(
      "color",
      this.colors.map((s) =>
        s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4,
      ),
      3,
    );
    attr("uv", this.uv, 2);
    attr("flex", this.flex, 3);
    g.setIndex(this.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // Keep sRGB colour values for the CPU lighting pass.
    g.userData.srgb = new Uint8Array(
      this.colors.map((v) => clamp(Math.round(v * 255), 0, 255)),
    );
    return g;
  }
}
function tone(hex, k = 1) {
  return [
    ((hex >> 16) * k) / 255,
    (((hex >> 8) & 255) * k) / 255,
    ((hex & 255) * k) / 255,
  ];
}
function curvedTube(out, centres, radii, radial, color, flexAt, grain = 0) {
  const prev = new THREE.Vector3(),
    next = new THREE.Vector3(),
    axis = new THREE.Vector3();
  const xAxis = new THREE.Vector3(),
    zAxis = new THREE.Vector3();
  let last = [],
    length = 0;
  for (let j = 0; j < centres.length; j++) {
    const center = centres[j],
      base = Math.max(0, j - 1),
      end = Math.min(centres.length - 1, j + 1);
    axis.fromArray(centres[end]).sub(prev.fromArray(centres[base])).normalize();
    const reference = Math.abs(axis.y) > 0.78 ? [1, 0, 0] : [0, 1, 0];
    xAxis.fromArray(reference).cross(axis).normalize();
    zAxis.crossVectors(axis, xAxis);
    if (j)
      length += next
        .fromArray(center)
        .distanceTo(prev.fromArray(centres[j - 1]));
    const ring = [];
    for (let k = 0; k <= radial; k++) {
      const a = (k * TAU) / radial,
        rx = Math.cos(a) * radii[j],
        rz = Math.sin(a) * radii[j];
      const rr = 1 + grain * 0.065 * Math.cos(5 * a + j * 0.16);
      const point = [
        center[0] + (rx * xAxis.x + rz * zAxis.x) * rr,
        center[1] + (rx * xAxis.y + rz * zAxis.y) * rr,
        center[2] + (rx * xAxis.z + rz * zAxis.z) * rr,
      ];
      ring.push(
        out.point(
          point,
          color,
          [(k / radial) * 2, length * 0.7],
          flexAt(j / (centres.length - 1), center),
        ),
      );
      if (j && k) out.quad(last[k - 1], last[k], ring[k], ring[k - 1]);
    }
    last = ring;
  }
  const cap = out.point(
    centres.at(-1),
    color,
    [0.5, 0.5],
    flexAt(1, centres.at(-1)),
  );
  for (let k = 1; k < last.length; k++) out.triangle(last[k - 1], last[k], cap);
}
const barkCache = new Map();
export function barkGrain(kind) {
  if (barkCache.has(kind)) return barkCache.get(kind);
  const w = 128,
    h = 256,
    bytes = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w,
        v = y / h,
        n = hash(x, y);
      let shade;
      if (kind === "palm") {
        const fy = v * 9,
          row = Math.floor(fy),
          fu = (u * 7 + (row % 2) * 0.5) % 1;
        const scar = Math.abs((fy % 1) - 0.23 - Math.abs(fu - 0.5) * 0.84);
        shade =
          0.85 +
          0.11 * Math.sin(fu * Math.PI) -
          0.27 * Math.exp(-scar * 23) +
          0.12 * Math.exp(-Math.abs(scar - 0.065) * 25);
        shade +=
          0.09 * Math.sin(x * 1.5 + Math.sin(y * 0.12)) + 0.11 * (n - 0.5);
      } else {
        const striation = Math.sin(
          TAU * u * 7 +
            1.2 * Math.sin(TAU * v) +
            0.65 * Math.sin(TAU * v * 3 + u * TAU * 2),
        );
        shade =
          0.75 +
          0.25 * Math.sqrt(Math.abs(striation)) -
          0.29 * Math.exp(-Math.abs(striation) * 8) +
          0.09 * Math.sin(x * 1.4 + y * 0.025) +
          0.12 * (n - 0.5);
      }
      const j = (y * w + x) * 4;
      bytes[j] = clamp((kind === "palm" ? 217 : 205) * shade, 0, 255);
      bytes[j + 1] = clamp((kind === "palm" ? 196 : 190) * shade, 0, 255);
      bytes[j + 2] = clamp((kind === "palm" ? 156 : 161) * shade, 0, 255);
      bytes[j + 3] = 255;
    }
  const result = { bytes, w, h };
  barkCache.set(kind, result);
  return result;
}
function palmModel(variant, level) {
  const bark = new SurfaceBuilder(),
    leaves = new SurfaceBuilder(),
    rng = generator(32371 + variant * 989);
  const H = 9.3 + variant * 0.24,
    curve = (t) => [
      0.54 * t * t + 0.14 * Math.sin(t * Math.PI),
      H * t,
      0.22 * t * t,
    ];
  const ringCount = [27, 14, 9][level],
    sides = [12, 9, 6][level],
    trunk = [],
    radius = [];
  for (let i = 0; i <= ringCount; i++) {
    const t = i / ringCount;
    trunk.push(curve(t));
    radius.push(
      0.226 +
        0.174 * (1 - t) ** 7 +
        0.075 * t ** 5 +
        0.016 * Math.sin(t * H * 14),
    );
  }
  const rooted = (_t, p) => [0.19 * (p[1] / H) ** 2, 0, 0];
  curvedTube(bark, trunk, radius, sides, tone(0xe1c69e), rooted, 1);
  // The crownshaft has interlocking solid stubs below the leaf bases.
  const center = curve(1),
    scarCount = [28, 16, 7][level];
  for (let k = 0; k < scarCount; k++) {
    const a = k * 2.39996,
      dy = (k / scarCount) * 1.12,
      sz = 0.25 + 0.12 * Math.sin(k);
    const p = [
      center[0] + 0.18 * Math.cos(a),
      H - 0.96 + dy,
      center[2] + 0.18 * Math.sin(a),
    ];
    const q = [p[0] + sz * Math.cos(a), p[1] - 0.12, p[2] + sz * Math.sin(a)];
    curvedTube(
      bark,
      [p, q],
      [0.15, 0.055],
      level ? 4 : 6,
      tone(0xbba277),
      rooted,
    );
  }
  const total = [23, 18, 13][level],
    segments = [12, 8, 6][level],
    pairs = [18, 10, 6][level];
  for (let n = 0; n < total; n++) {
    const a = n * 2.399963 + variant * 0.55 + (rng() - 0.5) * 0.2,
      angle = [Math.cos(a), Math.sin(a)],
      cross = [-angle[1], angle[0]];
    const tier = (n % 3) / 2,
      L = 3.9 + rng() * 1.2 - tier * 0.48,
      up = 1.22 + tier * 2.12 + rng() * 0.29;
    const drop = 2.53 - tier * 2.05 + rng() * 0.45,
      curl = (rng() - 0.5) * 1.08,
      phase = TAU * rng(),
      dry = n % 9 === 0 && tier === 0;
    const shade = dry
      ? 0x987b44
      : tier > 0.6
        ? 0x839943
        : n % 3
          ? 0x58723d
          : 0x668443;
    function mid(t) {
      const r = L * (0.86 * t + 0.14 * t * t);
      return [
        center[0] + angle[0] * r + cross[0] * curl * t * t,
        H + 0.2 + up * Math.sin(Math.PI * t * 0.86) - drop * t * t,
        center[2] + angle[1] * r + cross[1] * curl * t * t,
      ];
    }
    const points = [],
      rs = [];
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      points.push(mid(t));
      rs.push(0.093 * (1 - t) ** 0.78 + 0.009);
    }
    curvedTube(
      leaves,
      points,
      rs,
      level ? 3 : 5,
      tone(dry ? 0x9b7c43 : 0x849149),
      (t) => [0.19 + 0.54 * t * t, 0.028 * t, phase],
    );
    if (level === 2) {
      let last = [];
      for (let k = 0; k <= segments; k++) {
        const t = k / segments,
          m = mid(t),
          width =
            0.57 * Math.pow(Math.sin(t * Math.PI), 0.55) * (1.1 - 0.26 * t);
        const next = [-1, 0, 1].map((s) =>
          leaves.point(
            [
              m[0] + cross[0] * width * s,
              m[1] - 0.27 * Math.abs(s) * Math.sin(t * Math.PI),
              m[2] + cross[1] * width * s,
            ],
            tone(shade, s === 1 ? 0.85 : 1.05),
            [t, s],
            [0.19 + 0.55 * t * t, 0.04 * Math.abs(s), phase],
          ),
        );
        if (k) {
          leaves.quad(last[0], last[1], next[1], next[0]);
          leaves.quad(last[1], last[2], next[2], next[1]);
        }
        last = next;
      }
      continue;
    }
    for (let k = 0; k < pairs; k++)
      for (const side of [-1, 1]) {
        const t = (k + 0.42) / pairs,
          leafSpan =
            (0.19 + 0.93 * Math.pow(Math.sin(Math.PI * t), 0.63)) *
            (1.09 - 0.25 * t) *
            (1 + rng() * 0.16);
        const start = mid(t),
          end = mid(Math.min(1, t + 0.035 + 0.075 * (1 - t)));
        end[0] += cross[0] * side * leafSpan;
        end[2] += cross[1] * side * leafSpan;
        end[1] -= leafSpan * (0.39 + 0.47 * t + 0.19 * (n % 2));
        const fold = lerp(start, end, 0.42);
        fold[1] += 0.095;
        const width =
          (level ? 0.12 : 0.075) * (0.55 + Math.sin(Math.PI * t) * 0.57);
        const weight = 0.19 + 0.58 * t * t,
          flex = [weight, 0.035, phase];
        const root = leaves.point(start, tone(shade, 0.82), [0, 0], flex);
        const l = leaves.point(
          [fold[0] + angle[0] * width, fold[1], fold[2] + angle[1] * width],
          tone(shade, 0.91),
          [0, 0.5],
          [weight, 0.11, phase],
        );
        const r = leaves.point(
          [
            fold[0] - angle[0] * width,
            fold[1] - 0.014,
            fold[2] - angle[1] * width,
          ],
          tone(shade, 1.04),
          [1, 0.5],
          [weight, 0.11, phase],
        );
        const m = leaves.point(
          [fold[0], fold[1] + 0.055, fold[2]],
          tone(shade, 1.22),
          [0.5, 0.5],
          [weight, 0.11, phase],
        );
        const tip = leaves.point(
          end,
          tone(shade, 1.15),
          [0.5, 1],
          [weight + 0.13, 0.24, phase],
        );
        leaves.triangle(root, l, m);
        leaves.triangle(root, m, r);
        leaves.triangle(l, tip, m);
        leaves.triangle(m, tip, r);
      }
  }
  return [bark.finish(), leaves.finish()];
}
function oakModel(variant, level) {
  const bark = new SurfaceBuilder(),
    leaves = new SurfaceBuilder(),
    rng = generator(71593 + variant * 141);
  const top = [0.08, 3.36, -0.09],
    branches = [],
    clusters = [],
    sides = [10, 7, 5][level];
  const wind = (p) => [
    0.035 * Math.max(0, p[1] - 1) ** 1.45,
    0.0,
    p[0] * 0.4 + p[2] * 0.2,
  ];
  function branch(points, radii) {
    curvedTube(
      bark,
      points,
      radii,
      sides,
      tone(0xc1a689),
      (_t, p) => wind(p),
      1,
    );
  }
  branch(
    [
      [0, 0, 0],
      [-0.09, 0.34, 0.06],
      [-0.2, 1.18, 0.1],
      [-0.13, 2.15, 0.02],
      top,
    ],
    [0.53, 0.41, 0.31, 0.29, 0.24],
  );
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + variant;
    branch(
      [
        [0, 0.38, 0],
        [Math.cos(a) * 0.43, 0.14, Math.sin(a) * 0.43],
        [Math.cos(a) * 0.85, 0.01, Math.sin(a) * 0.85],
      ],
      [0.18, 0.14, 0.035],
    );
  }
  for (let i = 0; i < 10; i++) {
    const a = i * 2.399963 + 0.12 * variant,
      tier = i % 3,
      r = 1.9 + 0.35 * rng() + tier * 0.33,
      h = 5.2 + rng() * 1.75 + (2 - tier) * 0.48,
      base = [-0.12, 2.1 + (i % 4) * 0.26, 0.05];
    const p = [Math.cos(a) * r, h, Math.sin(a) * r],
      q = lerp(base, p, 0.48);
    q[1] -= 0.35;
    branch([base, q, p], [0.2 - 0.007 * i, 0.13, 0.077]);
    branches.push(p);
    for (let j = 0; j < 3; j++) {
      const b = a + (j - 1) * 0.66,
        dr = 0.85 + 0.6 * rng(),
        o = [
          p[0] + Math.cos(b) * dr,
          p[1] + 0.69 + rng() * 1.04,
          p[2] + Math.sin(b) * dr,
        ];
      branch([p, lerp(p, o, 0.48), o], [0.084, 0.052, 0.022]);
      clusters.push({ p: o, r: 1.05 + rng() * 0.55, seed: rng() * TAU });
      if (level === 0) {
        const tip = [
          o[0] + Math.cos(b + 0.95) * 0.54,
          o[1] + 0.49,
          o[2] + Math.sin(b + 0.95) * 0.54,
        ];
        branch([o, tip], [0.028, 0.009]);
      }
    }
  }
  // Lobed canopy masses sit on the ends of the actual scaffold branches. Their
  // surface leaves occupy many orientations and leave gaps between clusters.
  for (let n = 0; n < clusters.length; n++) {
    const { p, r, seed } = clusters[n],
      sides = level === 0 ? 9 : level === 1 ? 7 : 5,
      rings = level === 2 ? 3 : 5;
    let last = [];
    for (let row = 0; row <= rings; row++) {
      const lat = -Math.PI / 2 + (Math.PI * row) / rings,
        ring = [];
      for (let i = 0; i <= sides; i++) {
        const a = ((i % sides) * TAU) / sides + seed,
          wob =
            0.91 +
            0.15 * Math.sin(3 * a + seed + lat * 4) +
            0.095 * Math.cos(5 * a - lat * 5);
        const off = Math.cos(lat) * r * wob,
          pt = [
            p[0] + Math.cos(a) * off,
            p[1] + Math.sin(lat) * r * 0.76 * wob,
            p[2] + Math.sin(a) * off,
          ];
        const light =
          0.64 +
          0.32 * (0.5 + 0.5 * Math.sin(lat)) +
          0.13 * Math.sin(a * 2 + seed);
        ring.push(
          leaves.point(
            pt,
            tone(n % 4 ? 0x647e38 : 0x798646, light),
            [i / sides, row / rings],
            [wind(p)[0], 0.05, seed],
          ),
        );
        if (row && i) leaves.quad(last[i - 1], last[i], ring[i], ring[i - 1]);
      }
      last = ring;
    }
    if (level === 2) continue;
    const leafN = level === 0 ? 49 : 15;
    for (let k = 0; k < leafN; k++) {
      const a = rng() * TAU,
        ny = rng() * 1.65 - 0.65,
        rx = Math.sqrt(1 - ny * ny),
        sz = 0.15 + rng() * 0.22;
      const off = r * (0.95 + 0.12 * rng()),
        c = [
          p[0] + Math.cos(a) * rx * off,
          p[1] + ny * r * 0.8,
          p[2] + Math.sin(a) * rx * off,
        ];
      const ang = a + (rng() - 0.5) * 1.5,
        xx = Math.cos(ang),
        zz = Math.sin(ang),
        flex = [wind(p)[0], 0.16, seed + k * 0.13];
      const base = leaves.point(c, tone(0x4f6934), [0, 0], flex);
      const left = leaves.point(
        [
          c[0] + xx * sz * 0.45 - zz * sz * 0.24,
          c[1] + sz * 0.48,
          c[2] + zz * sz * 0.45 + xx * sz * 0.24,
        ],
        tone(n % 3 ? 0x77934a : 0x8c9950),
        [0, 0.5],
        flex,
      );
      const right = leaves.point(
        [
          c[0] + xx * sz * 0.54 + zz * sz * 0.24,
          c[1] + sz * 0.31,
          c[2] + zz * sz * 0.54 - xx * sz * 0.24,
        ],
        tone(0x68833e),
        [1, 0.5],
        flex,
      );
      const tip = leaves.point(
        [c[0] + xx * sz, c[1] + sz * 0.35, c[2] + zz * sz],
        tone(0x94a055),
        [0.5, 1],
        [flex[0], 0.25, flex[2]],
      );
      leaves.quad(base, left, tip, right);
    }
  }
  return [bark.finish(), leaves.finish()];
}
const modelCache = new Map();
export function treeModel(kind, variant, level) {
  const key = kind + variant + level;
  if (!modelCache.has(key))
    modelCache.set(
      key,
      (kind === "palm" ? palmModel : oakModel)(variant, level),
    );
  return modelCache.get(key);
}
export function treeScale(tree) {
  return tree.height / (tree.kind === "palm" ? 9.3 : 8.7);
}
export function windAt(time, phase) {
  return [
    0.61 * Math.sin(time * 1.42 + phase) +
      0.29 * Math.sin(time * 0.66 + phase * 0.42),
    Math.sin(time * 3.7 + phase),
    Math.cos(time * 2.13 + phase * 0.73),
  ];
}
function plantMaterial(kind, part, clock) {
  let map = null;
  if (part === "bark") {
    const g = barkGrain(kind);
    map = new THREE.DataTexture(g.bytes, g.w, g.h);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
  }
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: part === "bark" ? 0.95 : 0.77,
    map,
  });
  mat.userData.foliage = true;
  mat.onBeforeCompile = (s) => {
    s.uniforms.plantTime = clock;
    s.vertexShader =
      "attribute vec3 flex; uniform float plantTime;\n" + s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float seed=dot(instanceMatrix[3].xz,vec2(.057,.034));
      float gust=.61*sin(plantTime*1.42+seed)+.29*sin(plantTime*.66+seed*.42);
      float wave=sin(plantTime*3.7+seed+flex.z);
      transformed.x+=gust*flex.x+.40*wave*flex.y;
      transformed.z+=.48*gust*flex.x+.49*cos(plantTime*2.13+seed*.73+flex.z)*flex.y;
      transformed.y+=wave*flex.y*.22;`,
    );
  };
  return mat;
}

function grassModel(lod) {
  const out = new SurfaceBuilder(),
    rng = generator(55729 + lod),
    blades = [52, 24, 9][lod];
  for (let i = 0; i < blades; i++) {
    const direction = rng() * TAU,
      a = rng() * TAU,
      r = 0.94 * Math.sqrt(rng()),
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    const width = 0.018 + rng() * 0.032,
      len = 0.2 + rng() * 0.38,
      dx = Math.cos(direction),
      dz = Math.sin(direction);
    const green = [0x728641, 0x89924a, 0xa09d59, 0x586f38, 0x7b844a][i % 5],
      base = tone(green, 0.56),
      top = tone(green, 1.33);
    const l = out.point([x - dz * width, 0, z + dx * width], base),
      rr = out.point([x + dz * width, 0, z - dx * width], base);
    const m = [x + dx * len * 0.17, len * 0.61, z + dz * len * 0.17],
      fl = [0.055, 0.018, a];
    const ml = out.point(
        [m[0] - dz * width * 0.57, m[1], m[2] + dx * width * 0.57],
        tone(green, 1.02),
        [0, 0.5],
        fl,
      ),
      mr = out.point(
        [m[0] + dz * width * 0.57, m[1], m[2] - dx * width * 0.57],
        tone(green, 0.92),
        [1, 0.5],
        fl,
      );
    const tip = out.point(
      [x + dx * len * 0.68, len, z + dz * len * 0.68],
      top,
      [0.5, 1],
      [0.18, 0.025, a],
    );
    out.quad(l, rr, mr, ml);
    out.triangle(ml, mr, tip);
    if (i % 11 === 0) {
      const head = [x + dx * len * 0.42, len * 1.46, z + dz * len * 0.42];
      const seed = out.point(head, tone(0xc2a568), [0.5, 1], [0.21, 0.024, a]);
      out.triangle(ml, seed, mr);
    }
  }
  return out.finish();
}
const grassShapes = [];
export function tuftModel(lod) {
  return (grassShapes[lod] ??= grassModel(lod));
}

export function createVegetation(root, trees, habitat) {
  const clock = { value: 0 },
    group = new THREE.Group();
  group.name = "Trees and groundcover";
  root.add(group);
  const materials = {},
    batches = [],
    grassBatches = [];
  for (const kind of ["palm", "oak"]) {
    materials[kind] = ["bark", "leaf"].map((part) =>
      plantMaterial(kind, part, clock),
    );
    const capacity = Math.max(1, trees.filter((t) => t.kind === kind).length);
    for (let variant = 0; variant < 2; variant++)
      for (let lod = 0; lod < 3; lod++) {
        const models = treeModel(kind, variant, lod),
          pools = [];
        for (let j = 0; j < models.length; j++) {
          const mesh = new THREE.InstancedMesh(
            models[j],
            materials[kind][j],
            capacity,
          );
          mesh.name =
            kind + " " + (j ? "foliage" : "trunks and limbs") + " LOD " + lod;
          mesh.count = 0;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.castShadow = lod === 0;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          group.add(mesh);
          pools.push(mesh);
        }
        batches.push({ kind, variant, lod, pools });
      }
  }
  const tuftMaterial = plantMaterial("grass", "leaf", clock),
    maxClumps = 1400;
  for (let lod = 0; lod < 3; lod++) {
    const mesh = new THREE.InstancedMesh(
      tuftModel(lod),
      tuftMaterial,
      maxClumps,
    );
    mesh.name = "Grass tufts LOD " + lod;
    mesh.count = 0;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    grassBatches.push(mesh);
  }
  const grass = [],
    terrainCache = new Map(),
    dummy = new THREE.Object3D(),
    tint = new THREE.Color();
  const yaw = new THREE.Quaternion(),
    axis = new THREE.Vector3(),
    hinge = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  let lawnX = Infinity,
    lawnZ = Infinity,
    lastX = Infinity,
    lastZ = Infinity,
    fallingLast = false;
  function grassCell(cx, cz) {
    const key = cx + "," + cz;
    if (terrainCache.has(key)) return terrainCache.get(key);
    const local = [];
    // Sample the same positions at every speed and on repeated visits.
    for (let i = 0; i < 8; i++) {
      const rx = hash(cx * 13 + i * 73, cz * 17 + i),
        rz = hash(cx * 51 - i * 9, cz * 6 - i);
      const x = (cx + rx) * 9,
        z = (cz + rz) * 9,
        patch =
          0.5 +
          0.28 * Math.sin(x * 0.106 + Math.cos(z * 0.13)) +
          0.2 * Math.cos(z * 0.081 - x * 0.035);
      if (hash(cx + i * 197, cz - i * 197) > 0.43 + 0.55 * patch) continue;
      const habitatSample = habitat(x, z);
      if (!habitatSample) continue;
      const height = habitatSample.height,
        urban = habitatSample.urban,
        rich = hash(cx * 7 + i, cz * 11);
      const spin = rx * TAU,
        sy = (urban ? 0.52 : 0.93) * (0.61 + rich * 0.78),
        span = (urban ? 0.9 : 1.12) * (0.68 + patch * 0.67);
      const color = rich > 0.72 ? 0xb6ab81 : rich < 0.23 ? 0x90aa8b : 0xc0c398;
      local.push({
        x,
        y: height + 0.025,
        z,
        spin,
        sy,
        span,
        color,
        seed: rz * TAU,
        lod: 0,
      });
    }
    terrainCache.set(key, local);
    return local;
  }
  function updateGrass(x, z) {
    if (Math.hypot(x - lawnX, z - lawnZ) < 5) return;
    lawnX = x;
    lawnZ = z;
    grass.length = 0;
    const cx = Math.floor(x / 9),
      cz = Math.floor(z / 9);
    if (terrainCache.size > 3400) terrainCache.clear();
    const counts = [0, 0, 0];
    for (let rad = 0; rad <= 19; rad++) {
      for (let iz = -rad; iz <= rad; iz++)
        for (let ix = -rad; ix <= rad; ix++) {
          if (Math.max(Math.abs(ix), Math.abs(iz)) !== rad) continue;
          const d = Math.hypot(ix * 9, iz * 9);
          if (d > 166) continue;
          const lod = d < 31 ? 0 : d < 73 ? 1 : 2;
          if (lod === 2 && hash(ix + cx, iz + cz) > 0.42) continue;
          for (const tuft of grassCell(cx + ix, cz + iz)) {
            if (counts[lod] >= maxClumps) break;
            if (lod === 2 && tuft.seed > 3.9) continue;
            tuft.lod = lod;
            grass.push(tuft);
            dummy.position.set(tuft.x, tuft.y, tuft.z);
            dummy.rotation.set(0, tuft.spin, 0);
            dummy.scale.set(tuft.span, tuft.sy, tuft.span);
            dummy.updateMatrix();
            const mesh = grassBatches[lod],
              index = counts[lod]++;
            mesh.setMatrixAt(index, dummy.matrix);
            mesh.setColorAt(index, tint.set(tuft.color));
          }
        }
    }
    grassBatches.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }
  function updateTrees(x, z, force) {
    const stillFalling = trees.some((t) => t.fallen && t.progress < 1);
    if (
      !force &&
      !stillFalling &&
      !fallingLast &&
      Math.hypot(x - lastX, z - lastZ) < 6
    )
      return;
    fallingLast = stillFalling;
    lastX = x;
    lastZ = z;
    for (const b of batches) for (const m of b.pools) m.count = 0;
    for (const t of trees) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d > 890) continue;
      const lod = d < 95 ? 0 : d < 240 ? 1 : 2;
      const index = (t.kind === "palm" ? 0 : 6) + t.variant * 3 + lod,
        ms = batches[index].pools,
        at = ms[0].count;
      const scale = treeScale(t);
      dummy.position.set(t.x, t.y, t.z);
      yaw.setFromAxisAngle(up, t.rotation);
      if (t.angle) {
        hinge.setFromAxisAngle(axis.set(t.dz, 0, -t.dx), t.angle);
        dummy.quaternion.copy(hinge).multiply(yaw);
      } else dummy.quaternion.copy(yaw);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      for (const m of ms) {
        m.setMatrixAt(at, dummy.matrix);
        m.count++;
      }
    }
    for (const b of batches)
      for (const m of b.pools) m.instanceMatrix.needsUpdate = true;
  }
  const api = {
    trees,
    grass,
    group,
    update(time, player) {
      clock.value = time;
      const x = player?.x ?? (Number.isFinite(lastX) ? lastX : 260),
        z = player?.z ?? (Number.isFinite(lastZ) ? lastZ : 325);
      updateTrees(x, z, false);
      updateGrass(x, z);
    },
  };
  api.update(0);
  return api;
}

// Modulate the existing terrain colour with metre-scale turf, keeping the sand
// and bare ridgelines visible. Roads and urban paving remain separate surfaces.
export function meadowMaterial(texture) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  mat.userData.surfaceTexture = texture;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.meadowMap = { value: texture };
    shader.vertexShader = "varying vec3 meadowWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nmeadowWorld=(modelMatrix*vec4(position,1.)).xyz;",
    );
    shader.fragmentShader =
      "varying vec3 meadowWorld;uniform sampler2D meadowMap;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 turf=texture2D(meadowMap,meadowWorld.xz/4.5).rgb;
      float grit=clamp(dot(turf,vec3(.29,.54,.17))*7.3,.56,1.53);
      float green=smoothstep(-.025,.035,diffuseColor.g-diffuseColor.r);
      float nearTurf=(1.-smoothstep(100.,300.,distance(cameraPosition,meadowWorld)))*smoothstep(2.,5.,meadowWorld.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,mix(diffuseColor.rgb*grit,turf,.34),green*nearTurf);`,
    );
  };
  mat.addEventListener("dispose", () => texture.dispose());
  return mat;
}
