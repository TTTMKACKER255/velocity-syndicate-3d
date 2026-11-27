// All horizontal distances are metres. Heading zero points north (-Z).
import * as THREE from "three";
import { createArchitecture } from "./architecture.js";
import { streetlightPower } from "./daylight.js";
import { recordStreetlight } from "./streetlights.js";
import { aggregateMetres } from "./road-materials-art.js";
import { roadMaterial, paintMaterial, roadDetails } from "./road-materials.js";
import { architectureMaterial, textureFor } from "./environment-materials.js";

import { createVegetation, meadowMaterial } from "./vegetation.js";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function curve(anchors, closed, smoothCorners = true) {
  const pts = [];
  const count = anchors.length;
  const get = (n) =>
    anchors[closed ? (n + count) % count : clamp(n, 0, count - 1)];
  for (let i = 0; i < count - (closed ? 0 : 1); i++) {
    const a = get(i - 1),
      b = get(i),
      c = get(i + 1),
      d = get(i + 2);
    const steps = Math.max(
      2,
      Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 10),
    );
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      pts.push(
        [0, 1].map((j) =>
          smoothCorners
            ? 0.5 *
              (2 * b[j] +
                (-a[j] + c[j]) * t +
                (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t +
                (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t * t * t)
            : b[j] + (c[j] - b[j]) * t,
        ),
      );
    }
  }
  return [...pts, [...(closed ? anchors[0] : anchors[count - 1])]];
}

const coast = [
  [260, 330],
  [260, 180],
  [260, 0],
  [253, -190],
  [220, -380],
  [116, -560],
  [-90, -630],
  [-262, -550],
  [-340, -320],
  [-315, -110],
  [-290, 160],
  [-255, 380],
  [-90, 530],
  [110, 520],
  [220, 445],
];
const canyon = [
  [-315, -110],
  [-430, -180],
  [-535, -355],
  [-655, -510],
  [-760, -540],
  [-730, -390],
  [-860, -300],
  [-965, -430],
  [-1060, -230],
  [-943, -90],
  [-835, -50],
  [-960, 85],
  [-1040, 180],
  [-930, 350],
  [-770, 463],
  [-641, 530],
  [-505, 492],
  [-390, 360],
  [-290, 160],
  [-396, 84],
];
const harbour = [
  [116, -560],
  [193, -699],
  [240, -793],
  [252, -932],
  [165, -1045],
  [-70, -1050],
  [-220, -916],
  [-238, -765],
  [-90, -630],
];
const roadData = [
  ["Coastal Highway", 23, coast, true],
  ["Canyon Pass", 13, canyon, true],
  ["Harbour Loop", 18, harbour, true],
  [
    "Market Street",
    16,
    [
      [-325, -380],
      [-150, -380],
      [15, -380],
      [150, -380],
      [220, -380],
    ],
    false,
  ],
  [
    "Financial Avenue",
    19,
    [
      [-325, -190],
      [-150, -190],
      [15, -190],
      [150, -190],
      [253, -190],
    ],
    false,
  ],
  [
    "Festival Avenue",
    19,
    [
      [-303, 0],
      [-150, 0],
      [15, 0],
      [150, 0],
      [260, 0],
    ],
    false,
  ],
  [
    "Boardwalk Boulevard",
    16,
    [
      [-290, 160],
      [-150, 180],
      [15, 180],
      [150, 180],
      [260, 180],
    ],
    false,
  ],
  [
    "Foundry Street",
    13,
    [
      [-150, -598],
      [-150, -380],
      [-150, -190],
      [-150, 0],
      [-150, 180],
      [-150, 469],
    ],
    false,
  ],
  [
    "Grand Avenue",
    18,
    [
      [15, -620],
      [15, -380],
      [15, -190],
      [15, 0],
      [15, 180],
      [15, 535],
    ],
    false,
  ],
  [
    "Promenade",
    14,
    [
      [150, -506],
      [150, -380],
      [150, -190],
      [150, 0],
      [150, 180],
      [150, 495],
    ],
    false,
  ],
  [
    "Freight Way",
    12,
    [
      [-229, -819],
      [-110, -860],
      [80, -860],
      [249, -860],
    ],
    false,
  ],
  [
    "Lookout Drive",
    12,
    [
      [-862, -310],
      [-808, -154],
      [-696, -110],
      [-603, -185],
      [-503, -294],
    ],
    false,
  ],
  [
    "Skyline Expressway",
    16,
    [
      [-255, 380],
      [-210, 362],
      [-145, 310],
      [-75, 222],
      [-60, 125],
      [-60, -50],
      [-46, -250],
      [-14, -429],
      [55, -516],
      [116, -560],
    ],
    false,
  ],
];
export const roads = roadData.map(([name, width, anchors, closed], i) => ({
  name,
  width,
  points: curve(anchors, closed, i < 3 || i >= 11),
}));
const stations = roads.map(({ points }) => {
  let sum = 0;
  return points.map(([x, z], i) =>
    i ? (sum += Math.hypot(x - points[i - 1][0], z - points[i - 1][1])) : 0,
  );
});
export const roadLengths = stations.map((list) => list.at(-1));
const expressway = 12;
function deckHeight(distance) {
  return (
    9.6 * smooth(3, 140, Math.min(distance, roadLengths[expressway] - distance))
  );
}
export function routePoint(index, distance) {
  const pts = roads[index].points,
    sta = stations[index];
  const length = roadLengths[index];
  // Open routes bounce at their ends; closed circuits wrap seamlessly.
  let d = ((distance % length) + length) % length;
  const closed = roadData[index][3];
  let back = false;
  if (!closed) {
    const cycle = ((distance % (2 * length)) + 2 * length) % (2 * length);
    back = cycle >= length;
    d = back ? 2 * length - cycle : cycle;
  }
  let lo = 0,
    hi = pts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (sta[mid] <= d) lo = mid;
    else hi = mid;
  }
  const [x, z] = pts[lo],
    dx = pts[lo + 1][0] - x,
    dz = pts[lo + 1][1] - z;
  const t = clamp((d - sta[lo]) / (sta[lo + 1] - sta[lo] || 1), 0, 1);
  const px = x + dx * t,
    pz = z + dz * t;
  return {
    x: px,
    z: pz,
    height:
      groundHeight(px, pz) + (index === expressway ? deckHeight(d) : 0) + 0.25,
    heading: Math.atan2(-dx, -dz) + (back ? Math.PI : 0),
  };
}
export const spawn = routePoint(0, 5);

function coastX(z) {
  return (
    303 +
    8 * Math.sin(z * 0.005) +
    85 * smooth(-350, -820, z) +
    28 * smooth(370, 750, z)
  );
}
function shoreDepth(x, z) {
  const excessNorth = Math.max(0, -z - 930),
    excessSouth = Math.max(0, z - 650);
  return Math.min(
    coastX(z) -
      x -
      0.0014 * (excessNorth * excessNorth + excessSouth * excessSouth),
    x + 1240 + 38 * Math.sin(z * 0.006),
    z + 1190 + 54 * Math.sin(x * 0.0033),
    1010 - z + 40 * Math.sin(x * 0.004),
  );
}
export function groundHeight(x, z) {
  const inland = shoreDepth(x, z),
    hill = smooth(270, 1070, -x);
  const base = 5.4 + 0.55 * Math.sin(x * 0.0054) * Math.cos(z * 0.0067);
  const ridges =
    105 +
    47 * Math.sin(z * 0.0032 + x * 0.001) +
    22 * Math.sin(z * 0.0101 - x * 0.0016) +
    8 * Math.cos(x * 0.015 + z * 0.0049);
  return -6.5 + (6.5 + base + hill * ridges) * smooth(-18, 35, inland);
}

const cellSize = 54;
const key = (x, z) => Math.floor(x / cellSize) + "," + Math.floor(z / cellSize);
const segments = new Map();
function indexBounds(map, minX, maxX, minZ, maxZ, item) {
  for (
    let x = Math.floor(minX / cellSize);
    x <= Math.floor(maxX / cellSize);
    x++
  )
    for (
      let z = Math.floor(minZ / cellSize);
      z <= Math.floor(maxZ / cellSize);
      z++
    ) {
      const k = x + "," + z;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
}
roads.forEach(({ points, width }, road) => {
  const pad = width / 2 + 9;
  for (let i = 1; i < points.length; i++) {
    const [x, z] = points[i - 1],
      [bx, bz] = points[i],
      dx = bx - x,
      dz = bz - z;
    indexBounds(
      segments,
      Math.min(x, bx) - pad,
      Math.max(x, bx) + pad,
      Math.min(z, bz) - pad,
      Math.max(z, bz) + pad,
      {
        x,
        z,
        dx,
        dz,
        length2: dx * dx + dz * dz,
        width,
        road,
        station: stations[road][i - 1],
      },
    );
  }
});
const empty = [];
function roadAt(x, z, extra = 0, exclude = -1, groundOnly = false) {
  const nearby = segments.get(key(x, z)) || empty;
  for (const s of nearby) {
    if (
      s.road === exclude ||
      (groundOnly && s.road === expressway && deckHeight(s.station) > 1)
    )
      continue;
    const u = clamp(((x - s.x) * s.dx + (z - s.z) * s.dz) / s.length2, 0, 1);
    const dist2 = (x - s.x - u * s.dx) ** 2 + (z - s.z - u * s.dz) ** 2;
    if (dist2 < (s.width / 2 + extra) ** 2) return true;
  }
  return false;
}

function stripBuilder() {
  const positions = [],
    colors = [],
    indices = [];
  return {
    quad(a, b, c, d, color) {
      const i = positions.length / 3;
      positions.push(...a, ...b, ...c, ...d);
      const colorsByPoint = Array.isArray(color)
        ? color
        : [color, color, color, color];
      for (const col of colorsByPoint) colors.push(col.r, col.g, col.b);
      indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    },
  };
}
function geometricMaterial(extra = {}) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.88,
    ...extra,
  });
}

function makeTerrain(root) {
  const build = stripBuilder(),
    color = new THREE.Color();
  function point(x, z) {
    return [x, groundHeight(x, z), z];
  }
  function tint(x, z) {
    const d = shoreDepth(x, z),
      y = groundHeight(x, z);
    const rough =
      Math.sin(x * 0.025 + z * 0.032) * 0.024 +
      Math.cos(z * 0.009 - x * 0.016) * 0.025;
    const hillside = smooth(20, 113, y),
      urban = x > -342 && z > -652 && z < 545 && x < 280;
    color.set(urban ? "#777f68" : "#718854");
    color.lerp(new THREE.Color("#b4a57d"), hillside * 0.89);
    if (!urban && y > 32)
      color.lerp(
        new THREE.Color("#94816c"),
        Math.max(0, Math.sin(z * 0.034 + x * 0.015)) * 0.23,
      );
    color.lerp(new THREE.Color("#dfc99a"), 1 - smooth(10, 41, d));
    color.offsetHSL(0, 0, rough);
    return color.clone();
  }
  // Shared grid rows keep the coast's gentle grade and mountain silhouettes continuous.
  const meshGeo = new THREE.BufferGeometry(),
    coords = [],
    rgb = [],
    ix = [];
  const size = 16,
    nx = 115,
    nz = 151;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = -1320 + i * size,
        z = -1290 + j * size,
        p = point(x, z),
        col = tint(x, z);
      coords.push(...p);
      rgb.push(col.r, col.g, col.b);
      if (i < nx - 1 && j < nz - 1) {
        const a = j * nx + i;
        ix.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
  meshGeo.setIndex(ix);
  meshGeo.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
  meshGeo.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
  meshGeo.computeVertexNormals();
  root.add(new THREE.Mesh(meshGeo, meadowMaterial(textureFor("meadow"))));
  const distant = [
    new THREE.Color("#827e78"),
    new THREE.Color("#9ca3a0"),
    new THREE.Color("#778884"),
  ];
  for (let k = 0; k < 2; k++) {
    const zbase = -1700 - k * 620;
    for (let i = 0; i < 67; i++) {
      const x = -2950 + i * 100;
      const mountain = (X) =>
        122 +
        Math.sin(X * 0.0029 + k) * 105 +
        Math.cos(X * 0.009 + k * 3) * 36 +
        Math.sin(X * 0.018) * 19;
      const h = mountain(x),
        n = mountain(x + 100);
      build.quad(
        [x, -7, zbase + 200],
        [x + 100, -7, zbase + 200],
        [x + 100, n, zbase - 170],
        [x, h, zbase - 170],
        distant[(i + k) % 3],
      );
      build.quad(
        [x, h, zbase - 170],
        [x + 100, n, zbase - 170],
        [x + 100, -10, zbase - 410],
        [x, -10, zbase - 410],
        distant[1],
      );
    }
  }
  root.add(new THREE.Mesh(build.finish(), geometricMaterial()));
}

function makeOcean(root) {
  const geo = new THREE.PlaneGeometry(14000, 14000);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uNight: { value: 0 } },
    ]),
    fog: true,
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 p;
      void main(){
        p=(modelMatrix*vec4(position,1.)).xyz;
        vec4 mvPosition=viewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime,uNight; varying vec3 p;
      float wave(vec2 q){
        return sin(dot(q,vec2(.44,.12))+uTime*1.42)*.38+
        sin(dot(q,vec2(-.19,.52))-uTime*.88)*.29+sin(q.y*1.6+sin(q.x*.26+uTime))*.15;
      }
      void main() {
        vec3 eye=normalize(cameraPosition-p);
        float dist=length(cameraPosition-p);
        float detail=1.-smoothstep(120.,1300.,dist);
        float h=wave(p.xz);
        vec3 n=normalize(vec3((h-wave(p.xz+vec2(.5,0.)))*detail,2.,(h-wave(p.xz+vec2(0.,.5)))*detail));
        float fres=pow(1.-max(dot(n,eye),0.),3.);
        vec3 col=mix(vec3(.035,.37,.39),vec3(.28,.54,.66),fres);
        col+=vec3(.022,.045,.04)*h*detail;
        float sun=pow(max(dot(reflect(-normalize(vec3(.7,.42,.3)),n),eye),0.),78.);
        col+=vec3(1.,.8,.48)*sun*.85;
        col=mix(col,col*vec3(.12,.18,.28),uNight);
        gl_FragColor=vec4(col,1.);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = -0.42;
  root.add(water);
  return (t, n) => {
    mat.uniforms.uTime.value = t;
    mat.uniforms.uNight.value = n;
  };
}

function roadCorner(s, d, height) {
  const x = s.x + Math.cos(s.heading) * d,
    z = s.z - Math.sin(s.heading) * d;
  return [x, groundHeight(x, z) + (s.elevation || 0) + height, z];
}
function routeStrip(builder, p, q, left, right, height, color) {
  builder.quad(
    roadCorner(p, left, height),
    roadCorner(p, right, height),
    roadCorner(q, right, height),
    roadCorner(q, left, height),
    color,
  );
}
function makeRoads(root) {
  const asphalt = stripBuilder(),
    roadUV = [],
    aggregateUV = [],
    details = roadDetails(),
    paintUV = [],
    pavingUV = [],
    stone = stripBuilder(),
    lines = stripBuilder();
  const wear = new THREE.Color(),
    sidewalk = new THREE.Color("#b9b6aa"),
    shoulder = new THREE.Color("#ad9a78");
  const white = new THREE.Color("#ffffff"),
    yellow = new THREE.Color("#ffcd5f");
  roads.forEach((rd, i) => {
    const length = roadLengths[i],
      half = rd.width / 2,
      step = 5.2,
      h = 0.19 + i * 0.006;
    const endpoint = (d) => {
      const p = routePoint(i, Math.min(d, length - 0.001));
      p.elevation = i === expressway ? deckHeight(d) : 0;
      return p;
    };
    for (let d = 0; d < length; d += step) {
      const p = endpoint(d),
        q = endpoint(d + step),
        mid = endpoint(d + step * 0.5);
      const corners = [
        roadCorner(p, -half, h),
        roadCorner(p, half, h),
        roadCorner(q, half, h),
        roadCorner(q, -half, h),
      ];
      const patina =
        (i === 1 || i === 11 ? 1.12 : i === 2 || i === 10 ? 0.8 : 0.98) +
        0.095 * Math.sin(d * 0.036 + i) +
        0.07 * Math.cos(d * 0.079);
      wear.setRGB(
        patina,
        patina * (i === 1 ? 0.97 : 1),
        patina * (i === 1 ? 0.9 : 1.014),
      );
      asphalt.quad(...corners, wear);
      const nextD = Math.min(length, d + step),
        v0 = d / 55,
        v1 = nextD / 55;
      roadUV.push(0, v0, 1, v0, 1, v1, 0, v1);
      const u1 = rd.width / aggregateMetres,
        ta = d / aggregateMetres,
        tb = nextD / aggregateMetres;
      aggregateUV.push(0, ta, u1, ta, u1, tb, 0, tb);
      if (mid.elevation < 1 && roadAt(mid.x, mid.z, 1, i, true)) continue;
      details.populate(corners, i, d, nextD - d, rd.width);
      const stripe = (left, right, lift, col) => {
        routeStrip(lines, p, q, left, right, h + lift, col);
        const va = d / 1.15,
          vb = nextD / 1.15;
        paintUV.push(0, va, 1, va, 1, vb, 0, vb);
      };
      const walk = i === expressway ? 0.65 : i === 1 || i === 11 ? 1.3 : 2.6;
      for (const s of [-1, 1]) {
        routeStrip(
          stone,
          p,
          q,
          s * half,
          s * (half + walk),
          h + 0.14,
          i === 1 || i === 11 ? shoulder : sidewalk,
        );
        stripe(s * (half - 0.68), s * (half - 0.51), 0.024, white);
        pavingUV.push(
          0,
          d / 6.4,
          walk / 6.4,
          d / 6.4,
          walk / 6.4,
          nextD / 6.4,
          0,
          nextD / 6.4,
        );
        if (i !== 1 && i !== 11) {
          // A kerb stone has its own top bevel and raised face.
          const edge = (r, t, y) => {
            const x = r.x + Math.cos(r.heading) * t,
              z = r.z - Math.sin(r.heading) * t;
            return [x, groundHeight(x, z) + (r.elevation || 0) + y, z];
          };
          const outside = s * (half + 0.19),
            inside = s * (half - 0.035);
          stone.quad(
            edge(p, inside, h + 0.035),
            edge(q, inside, h + 0.035),
            edge(q, s * half, h + 0.16),
            edge(p, s * half, h + 0.16),
            new THREE.Color("#8b897e"),
          );
          stone.quad(
            edge(p, s * half, h + 0.16),
            edge(q, s * half, h + 0.16),
            edge(q, outside, h + 0.14),
            edge(p, outside, h + 0.14),
            new THREE.Color("#d5d1c2"),
          );
          pavingUV.push(
            0,
            d / 6.4,
            0,
            nextD / 6.4,
            0.05,
            nextD / 6.4,
            0.05,
            d / 6.4,
            0,
            d / 6.4,
            0,
            nextD / 6.4,
            0.05,
            nextD / 6.4,
            0.05,
            d / 6.4,
          );
        }
        if (rd.width >= 18 && Math.floor(d / step) % 3 === 0)
          stripe(s * (half * 0.5 - 0.07), s * (half * 0.5 + 0.07), 0.03, white);
      }
      stripe(-0.21, -0.075, 0.03, yellow);
      stripe(0.075, 0.21, 0.03, yellow);
    }
  });
  const roadMat = roadMaterial();
  const roadGeo = asphalt.finish();
  roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(roadUV, 2));
  roadGeo.setAttribute("uv1", new THREE.Float32BufferAttribute(aggregateUV, 2));
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.name = "Wet asphalt";
  roadMesh.receiveShadow = true;
  root.add(roadMesh);
  const paving = stone.finish();
  paving.setAttribute("uv", new THREE.Float32BufferAttribute(pavingUV, 2));
  const pavement = new THREE.Mesh(
    paving,
    geometricMaterial({
      map: textureFor("pavement"),
      vertexColors: false,
      roughness: 0.86,
    }),
  );
  pavement.name = "Stone paving";
  root.add(pavement);
  const paintGeo = lines.finish();
  paintGeo.setAttribute("uv", new THREE.Float32BufferAttribute(paintUV, 2));
  const markings = new THREE.Mesh(paintGeo, paintMaterial());
  markings.name = "Road markings";
  markings.receiveShadow = true;
  root.add(markings, details.finish());
}

const rotation = new THREE.Euler(),
  quaternion = new THREE.Quaternion(),
  vPos = new THREE.Vector3(),
  vScale = new THREE.Vector3();
function transform(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  rotation.set(rx, ry, rz, "YXZ");
  return new THREE.Matrix4().compose(
    vPos.set(x, y, z),
    quaternion.setFromEuler(rotation),
    vScale.set(sx, sy, sz),
  );
}
function beamMatrix(a, b, r) {
  const up = new THREE.Vector3(0, 1, 0),
    end = new THREE.Vector3(...b),
    start = new THREE.Vector3(...a),
    dir = end.clone().sub(start);
  return new THREE.Matrix4().compose(
    start.add(end).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()),
    new THREE.Vector3(r, dir.length(), r),
  );
}
function makeBatches(root) {
  const batches = [],
    standard = new THREE.MeshStandardMaterial({ roughness: 0.78 });
  function create(geometry, material = standard, cast = false) {
    const items = [];
    const b = {
      mesh: null,
      items,
      add(matrix, color = 0xffffff) {
        items.push({ matrix, color });
        return items.length - 1;
      },
    };
    batches.push({ b, geometry, material, cast });
    return b;
  }
  function finish() {
    for (const { b, geometry, material, cast } of batches) {
      if (!b.items.length) {
        geometry.dispose();
        continue;
      }
      const m = new THREE.InstancedMesh(geometry, material, b.items.length);
      const color = new THREE.Color();
      b.items.forEach((o, i) => {
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, color.set(o.color));
      });
      m.castShadow = cast;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      root.add(m);
      b.mesh = m;
      b.items.length = 0;
    }
  }
  return { create, finish, standard };
}

function createSign(
  root,
  text,
  sub,
  x,
  y,
  z,
  heading,
  width = 8,
  height = 2.7,
  bg = "#153d43",
) {
  const cv = document.createElement("canvas");
  cv.width = 768;
  cv.height = Math.round((768 * height) / width);
  const c = cv.getContext("2d");
  c.fillStyle = bg;
  c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = "#cbdedc";
  c.lineWidth = 5;
  c.strokeRect(9, 9, cv.width - 18, cv.height - 18);
  c.fillStyle = "#f1f2eb";
  c.font = "bold " + Math.round(cv.height * 0.33) + "px sans-serif";
  c.fillText(text, 31, cv.height * 0.54, cv.width - 62);
  c.font = "600 " + Math.round(cv.height * 0.18) + "px sans-serif";
  c.fillStyle = "#c7d8ce";
  c.fillText(sub, 32, cv.height * 0.83, cv.width - 62);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.14,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = heading;
  root.add(mesh);
}
function createScenery(root, night) {
  const architecture = createArchitecture(root);
  const rng = randomSource(671041),
    batches = makeBatches(root);
  const box = new THREE.BoxGeometry(),
    blocks = batches.create(box);
  const buildings = Object.fromEntries(
    ["glass", "residence", "brick", "limestone"].map((name) => [
      name,
      batches.create(box.clone(), architectureMaterial(name, night), true),
    ]),
  );
  const posts = batches.create(new THREE.CylinderGeometry(0.5, 0.5, 1, 7));
  const boulder = batches.create(
    new THREE.IcosahedronGeometry(1, 0),
    batches.standard,
    true,
  );
  const shrubs = batches.create(
    new THREE.IcosahedronGeometry(1, 1),
    batches.standard,
  );
  const fence = batches.create(box.clone());
  const collisions = new Map(),
    ramps = [],
    forest = [],
    falling = [];
  let simulationTime = 0;
  const garageRoad = routePoint(0, 78),
    homeRoad = routePoint(9, 872);
  const frontage = [
    {
      name: "Bayline Garage",
      x: garageRoad.x - 26,
      z: garageRoad.z,
      w: 12,
      d: 27,
      h: 4.9,
      base: "workshop",
      upper: null,
    },
    {
      name: "Promenade Home",
      x: homeRoad.x - 19,
      z: homeRoad.z,
      w: 11,
      d: 17,
      h: 3.8,
      base: "lobby",
      upper: "residence",
    },
  ];
  function solid(
    x,
    z,
    rx,
    rz = rx,
    y = groundHeight(x, z),
    h = 20,
    smash = null,
  ) {
    const record = { x, z, rx, rz, y, h, smash };
    const pad = smash?.tree ? 2.52 : 2;
    indexBounds(
      collisions,
      x - rx - pad,
      x + rx + pad,
      z - rz - pad,
      z + rz + pad,
      record,
    );
  }
  function palm(x, z, h = 1, rotation = rng() * 6.28) {
    const y = groundHeight(x, z);
    if (y < 1) return;
    treeRecord("palm", x, y, z, 10.8 * h, rotation, 0.34 * h);
  }
  function treeRecord(kind, x, y, z, height, rotation, radius) {
    const tree = {
      kind,
      x,
      y,
      z,
      height,
      rotation,
      variant: forest.length % 2,
      visualHeight: height * (kind === "palm" ? 1.24 : 1),
      fallen: false,
      progress: 0,
      angle: 0,
      dx: 0,
      dz: 0,
      started: 0,
    };
    forest.push(tree);
    solid(x, z, radius, radius, y, height, { tree });
    return tree;
  }
  const stone = ["#b5b5a9", "#a99b8b", "#cec8b4", "#b7aa95"];
  const glass = [
    "#638394",
    "#567582",
    "#79939c",
    "#646e77",
    "#947f74",
    "#75888c",
    "#718fa4",
  ];
  // Grid lots reserve a verge around every carriageway, including diagonal junctions.
  for (let x = -263; x < 247; x += 41)
    for (let z = -555; z < 492; z += 49) {
      const cx = x + (rng() - 0.5) * 10,
        cz = z + (rng() - 0.5) * 12;
      const w = 16 + rng() * 13,
        d = 20 + rng() * 15;
      if (shoreDepth(cx, cz) < 37 || roadAt(cx, cz, 16)) continue;
      if (
        frontage.some(
          (v) =>
            Math.abs(cx - v.x) < (v.w + w) * 0.5 + 1.5 &&
            Math.abs(cz - v.z) < (v.d + d) * 0.5 + 1.5,
        )
      )
        continue;
      if (
        [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ].some(([a, b]) => roadAt(cx + (a * w) / 2, cz + (b * d) / 2, 2))
      )
        continue;
      const base = groundHeight(cx, cz);
      const central = Math.exp(
        -((cx + 48) ** 2 / 180 ** 2 + (cz + 205) ** 2 / 245 ** 2),
      );
      const h = 6 + Math.pow(rng(), 1.5) * 16 + central * (23 + rng() * 83);
      const tone = stone[Math.floor(rng() * stone.length)],
        glaze = glass[Math.floor(rng() * glass.length)];
      const style =
        h > 44
          ? "glass"
          : cz < -432
            ? "brick"
            : cx > 74
              ? "residence"
              : Math.floor(Math.abs(cx + cz)) % 3 === 0
                ? "limestone"
                : "glass";
      const facade = buildings[style];
      const seed = Math.floor(Math.abs(cx * 17 + cz * 9));
      const podium = Math.min(4.6, Math.max(3.05, h * 0.24));
      architecture.add({
        x: cx,
        y: base,
        z: cz,
        w: w + 1.8,
        d: d + 1.8,
        h: podium,
        seed,
        kind:
          style === "residence"
            ? "cafe"
            : style === "brick"
              ? "depot"
              : "lobby",
      });
      const galleryHeight =
        h - podium > 6 && (seed % 3 === 0 || cx > 165) ? 3.15 : 0;
      if (galleryHeight)
        architecture.add({
          x: cx,
          y: base + podium,
          z: cz,
          w,
          d,
          h: galleryHeight,
          kind: style === "residence" ? "home" : "office",
          seed: seed + 7,
          upper: true,
        });
      const upperBase = podium + galleryHeight;
      facade.add(
        transform(cx, base + (h + upperBase) * 0.5, cz, w, h - upperBase, d),
        "#fcfbf3",
      );
      blocks.add(
        transform(cx, base + h + 0.42, cz, w + 0.6, 0.84, d + 0.6),
        h > 39 ? glaze : tone,
      );
      if (h > 39) {
        if (style === "glass" && h > 64) {
          // Projecting vertical fins catch grazing light on the taller office blocks.
          for (const side of [-1, 1])
            for (const frac of [-0.34, 0, 0.34])
              blocks.add(
                transform(
                  cx + side * (w * 0.5 + 0.18),
                  base + h * 0.52,
                  cz + d * frac,
                  0.4,
                  h * 0.91,
                  0.27,
                ),
                "#a9b6b8",
              );
        }
        const crown = h * (0.09 + rng() * 0.21);
        facade.add(
          transform(
            cx,
            base + h + 0.7 + crown / 2,
            cz,
            w * 0.77,
            crown,
            d * 0.84,
          ),
          "#f0f4f4",
        );
        blocks.add(
          transform(cx, base + h + crown + 1, cz, w * 0.8, 1, d * 0.86),
          tone,
        );
        if (h > 66 && rng() > 0.52)
          posts.add(
            transform(cx, base + h + crown + 5, cz, 0.24, 9, 0.24),
            "#889096",
          );
        if (rng() > 0.62)
          for (const s of [-1, 1])
            blocks.add(
              transform(
                cx + w * 0.5 * s,
                base + h * 0.51,
                cz,
                1.1,
                h * 0.96,
                d * 0.18,
              ),
              tone,
            );
      } else if (h > 13) {
        for (let y = 7.5; y < h; y += 5.3)
          blocks.add(transform(cx, base + y, cz, w + 1.3, 0.45, d + 1.3), tone);
      } else {
        blocks.add(
          transform(cx + 2, base + h + 1.1, cz - 1, w * 0.23, 1.3, d * 0.21),
          "#777d80",
        );
      }
      // Paving and narrow landscaped setbacks connect the shops to the public sidewalk.
      blocks.add(
        transform(cx, base + 0.03, cz, w + 6.8, 0.12, d + 6.4),
        "#a59e8c",
      );
      if (h > 22)
        for (const side of [-1, 1]) {
          blocks.add(
            transform(
              cx + side * (w * 0.5 + 1.7),
              base + 0.23,
              cz,
              0.9,
              0.44,
              d * 0.45,
            ),
            "#999789",
          );
          shrubs.add(
            transform(
              cx + side * (w * 0.5 + 1.7),
              base + 0.65,
              cz,
              0.54,
              0.51,
              d * 0.22,
            ),
            "#5a6a41",
          );
        }
      solid(cx, cz, w * 0.5 + 0.9, d * 0.5 + 0.9, base, h);
    }

  for (const v of frontage) {
    const { x, z, w, d, h } = v,
      y = groundHeight(x, z);
    architecture.add({
      x,
      y,
      z,
      w,
      d,
      h,
      kind: v.upper ? "lobby" : "workshop",
      seed: v.upper ? 131 : 32,
    });
    blocks.add(
      transform(x, y + h + 0.16, z, w + 0.8, 0.34, d + 0.9),
      "#a59c8e",
    );
    if (v.upper) {
      architecture.add({
        x,
        y: y + h,
        z,
        w: w - 0.6,
        d: d - 1,
        h: 2.92,
        kind: "home",
        seed: 133,
        upper: true,
      });
      buildings[v.upper].add(
        transform(x, y + h + 4.21, z, w - 0.6, 2.58, d - 1.0),
        "#fff8e8",
      );
      blocks.add(transform(x, y + h + 5.7, z, w, 0.35, d - 0.4), "#c4b9a0");
    }
    const face = x + w * 0.5;
    blocks.add(
      transform(face + 0.7, y + h - 0.3, z, 1.75, 0.19, d * 0.86),
      v.upper ? "#baab91" : "#3e4748",
    );
    // The forecourt reaches the shoulder, leaving the marker and entrance clear.
    blocks.add(
      transform(face + 3.2, y + 0.06, z, 6.35, 0.12, d * 0.85),
      "#a5a29a",
    );
    for (const end of [-1, 1])
      blocks.add(
        transform(face + 1.3, y + 0.53, z + d * 0.46 * end, 0.72, 1.06, 0.72),
        "#8d8c80",
      );
    createSign(
      root,
      v.name.toUpperCase(),
      v.upper ? "RESIDENT ENTRANCE" : "PERFORMANCE  /  SERVICE",
      face + 0.04,
      y + h - 0.38,
      z,
      Math.PI / 2,
      Math.min(d * 0.64, 10),
      1.04,
      v.upper ? "#474641" : "#2c393a",
    );
    solid(x, z, w * 0.5, d * 0.5, y, h + (v.upper ? 5.7 : 0.4));
  }
  const streetlamps = [];
  root.userData.streetlamps = streetlamps;
  const lampHeadMaterial = new THREE.MeshStandardMaterial({
    color: "#f1eadc",
    emissive: "#ffe6be",
    emissiveIntensity: 0.4,
    roughness: 0.55,
  });
  const lampHead = batches.create(box.clone(), lampHeadMaterial);
  function lamp(x, z, heading) {
    const y = groundHeight(x, z),
      dx = -Math.sin(heading),
      dz = -Math.cos(heading),
      h = 7.7;
    const parts = [
      [posts, posts.add(transform(x, y + h / 2, z, 0.17, h, 0.17), "#666b69")],
      [
        posts,
        posts.add(
          beamMatrix(
            [x, y + h - 0.6, z],
            [x + dx * 1.75, y + h + 0.35, z + dz * 1.75],
            0.11,
          ),
          "#767a76",
        ),
      ],
      [
        lampHead,
        lampHead.add(
          transform(
            x + dx * 1.83,
            y + h + 0.3,
            z + dz * 1.83,
            0.48,
            0.17,
            0.87,
            heading,
          ),
          "#f6efd2",
        ),
      ],
    ];
    const obj = { alive: true, parts, x, z };
    recordStreetlight(streetlamps, obj, y, dx, dz, groundHeight);
    solid(x, z, 0.28, 0.28, y, h, obj);
  }
  function barrier(x, z, a, y = groundHeight(x, z)) {
    const parts = [
      [
        blocks,
        blocks.add(transform(x, y + 0.46, z, 2.6, 0.86, 0.48, a), "#e28b3e"),
      ],
      [
        blocks,
        blocks.add(transform(x, y + 0.55, z, 1.2, 0.35, 0.5, a), "#eee6d1"),
      ],
    ];
    const obj = { alive: true, parts, x, z };
    solid(x, z, 1.12, 0.65, y, 1.1, obj);
  }
  roads.forEach((rd, i) => {
    const length = roadLengths[i];
    if (i === expressway) return;
    for (let d = 17; d < length - 8; d += i < 3 ? 48 : 70) {
      const p = routePoint(i, d),
        offset = rd.width / 2 + 1.25,
        s = Math.round(d / 48) % 2 ? 1 : -1;
      const x = p.x + s * Math.cos(p.heading) * offset,
        z = p.z - s * Math.sin(p.heading) * offset;
      if (roadAt(x, z, 4, i) || groundHeight(x, z) < 1) continue;
      if (i !== 1 && i !== 11) lamp(x, z, p.heading + (s * Math.PI) / 2);
      if (i === 0 || i === 5 || i === 6 || i === 9) {
        for (const side of [-1, 1]) {
          const k = rd.width / 2 + 4.9,
            px = p.x + Math.cos(p.heading) * k * side,
            pz = p.z - Math.sin(p.heading) * k * side;
          if (!roadAt(px, pz, 1.6, i) && groundHeight(px, pz) > 1)
            palm(px, pz, 0.77 + rng() * 0.34);
        }
      }
      if ((i === 0 || i === 1) && d % 192 < 50)
        barrier(
          p.x + Math.cos(p.heading) * (rd.width / 2 + 0.35),
          p.z - Math.sin(p.heading) * (rd.width / 2 + 0.35),
          p.heading + Math.PI / 2,
        );
    }
  });

  // Girders and columns follow the same elevation profile as the upper carriageway.
  // Omit supports at ground-level carriageways to leave the underpasses clear.
  const deck = stripBuilder(),
    concrete = new THREE.Color("#aba99c");
  const de = roadLengths[expressway],
    half = roads[expressway].width / 2;
  for (let station = 3; station < de - 3; station += 5) {
    const end = Math.min(de - 3, station + 5),
      p = routePoint(expressway, station),
      q = routePoint(expressway, end);
    function side(s, d, offset, dy) {
      const x = s.x + Math.cos(s.heading) * offset,
        z = s.z - Math.sin(s.heading) * offset;
      return [x, groundHeight(x, z) + deckHeight(d) + dy, z];
    }
    // Leave the merging lanes open where the elevated road meets street level.
    if (deckHeight(station) < 2.1) continue;
    const l = half + 0.65;
    for (const sign of [-1, 1]) {
      const a = side(p, station, sign * l, 1.36),
        b = side(q, end, sign * l, 1.36);
      const c = side(q, end, sign * l, -0.75),
        d = side(p, station, sign * l, -0.75);
      deck.quad(a, b, c, d, concrete);
      const e = side(p, station, sign * (l - 0.33), 1.36),
        f = side(q, end, sign * (l - 0.33), 1.36);
      deck.quad(e, f, b, a, concrete);
      deck.quad(
        e,
        f,
        side(q, end, sign * (l - 0.33), 0.25),
        side(p, station, sign * (l - 0.33), 0.25),
        concrete,
      );
      const mx = (a[0] + b[0]) * 0.5,
        mz = (a[2] + b[2]) * 0.5,
        rad = 0.38;
      solid(
        mx,
        mz,
        Math.abs(b[0] - a[0]) * 0.5 + rad,
        Math.abs(b[2] - a[2]) * 0.5 + rad,
        Math.min(a[1], b[1]) - 1.2,
        1.25,
      );
    }
    deck.quad(
      side(p, station, -l, -0.75),
      side(q, end, -l, -0.75),
      side(q, end, l, -0.75),
      side(p, station, l, -0.75),
      concrete,
    );
    if ((station - 3) % 40 === 0 && !roadAt(p.x, p.z, 2.1, expressway)) {
      const base = groundHeight(p.x, p.z),
        h = deckHeight(station);
      blocks.add(
        transform(p.x, base + h * 0.47, p.z, 2.5, h * 0.94, 1.8, p.heading),
        "#a6a89e",
      );
      blocks.add(
        transform(
          p.x,
          base + h - 0.95,
          p.z,
          half * 1.65,
          0.95,
          2.25,
          p.heading,
        ),
        "#b6b6a8",
      );
      solid(p.x, p.z, 1.4, 1.1, base, h - 0.9);
    }
  }
  root.add(new THREE.Mesh(deck.finish(), geometricMaterial()));

  // Powder-coated steel rail, beachcomber palms, and short piers line the ocean side.
  for (let z = -464; z < 452; z += 15) {
    const x = coastX(z) - 17,
      y = groundHeight(x, z),
      z2 = z + 15,
      x2 = coastX(z2) - 17,
      y2 = groundHeight(x2, z2);
    if (roadAt(x, z, 1.2)) continue;
    posts.add(transform(x, y + 0.68, z, 0.14, 1.36, 0.14), "#e2e3d8");
    for (const h of [0.62, 1.17])
      posts.add(beamMatrix([x, y + h, z], [x2, y2 + h, z2], 0.1), "#c7d2cf");
    if (z % 45 === 1 && !roadAt(x - 5, z, 1))
      palm(x - 5, z, 0.63 + rng() * 0.27);
  }
  for (let j = 0; j < 3; j++) {
    const z = 198 - j * 233,
      x = coastX(z) + 18,
      y = 2.1;
    blocks.add(transform(x, y, z, 72, 0.43, 4.4), "#977e61");
    for (let i = 0; i < 8; i++)
      for (const s of [-1, 1])
        posts.add(
          transform(x - 32 + i * 9, -1, z + s * 1.7, 0.46, 6.2, 0.46),
          "#5d605b",
        );
    for (let i = 0; i < 6; i++)
      blocks.add(
        transform(x - 30 + i * 12, y + 0.72, z - 2.1, 0.17, 1.25, 0.17),
        "#c2bda6",
      );
    blocks.add(transform(x, y + 1.37, z - 2.1, 65, 0.16, 0.16), "#b6ad93");
  }

  // The container terminal has stacked, ribbed freight boxes, gantries and mooring bollards.
  const containerColors = [
    "#a9533b",
    "#416c77",
    "#8b9575",
    "#cea45a",
    "#b7bcb2",
    "#4d6881",
  ];
  function container(x, y, z, heading, tone) {
    const w = 2.55,
      h = 2.6,
      l = 11.2;
    blocks.add(transform(x, y + h * 0.5, z, w, h, l, heading), tone);
    const shade = new THREE.Color(tone).multiplyScalar(0.73);
    for (let k = -5; k <= 5; k += 1.04)
      for (const s of [-1, 1]) {
        const localX = s * 1.29;
        blocks.add(
          transform(
            x + Math.cos(heading) * localX + Math.sin(heading) * k,
            y + h * 0.5,
            z - Math.sin(heading) * localX + Math.cos(heading) * k,
            0.08,
            2.4,
            0.095,
            heading,
          ),
          shade,
        );
      }
  }
  for (let j = 0; j < 8; j++)
    for (let k = 0; k < 11; k++) {
      const x = -133 + j * 37,
        z = -1005 + k * 28;
      if (roadAt(x, z, 10) || rng() > 0.77) continue;
      const y = groundHeight(x, z),
        a = j % 3 === 0 ? Math.PI / 2 : 0,
        stack = rng() > 0.55 ? 2 : 1;
      for (let n = 0; n < stack; n++)
        container(x, y + n * 2.6, z, a, containerColors[Math.floor(rng() * 6)]);
      solid(x, z, a ? 5.7 : 1.45, a ? 1.45 : 5.7, y, 2.6 * stack);
    }
  for (let j = 0; j < 4; j++) {
    const x = coastX(-710 - j * 72) - 31,
      z = -710 - j * 72,
      y = groundHeight(x, z),
      tone = "#c27b43";
    for (const s of [-1, 1])
      for (const t of [-1, 1]) {
        posts.add(
          transform(x + s * 6, y + 15, z + t * 5, 0.93, 30, 0.93),
          tone,
        );
        posts.add(
          beamMatrix(
            [x + s * 6, y + 4, z + t * 5],
            [x - s * 6, y + 16, z + t * 5],
            0.49,
          ),
          tone,
        );
      }
    blocks.add(transform(x + 10, y + 31, z, 42, 1.4, 3), tone);
    for (let k = 0; k < 9; k++)
      posts.add(
        beamMatrix(
          [x - 11 + k * 4.8, y + 31.2, z],
          [x - 8.6 + k * 4.8, y + 34, z],
          0.31,
        ),
        tone,
      );
    blocks.add(transform(x + 10, y + 34.1, z, 43, 0.55, 1.6), tone);
    posts.add(transform(x + 23, y + 23, z, 0.11, 16, 0.11), "#3d464b");
    blocks.add(transform(x + 23, y + 15, z, 3, 0.6, 1.4), "#4c5658");
    blocks.add(transform(x - 7, y + 29.4, z, 4, 3, 5), "#d3cbb9");
  }
  // Sailboats give the camera a scale reference on the bay.
  const sailG = stripBuilder();
  for (let j = 0; j < 25; j++) {
    const x = 385 + rng() * 460,
      z = -990 + rng() * 2000,
      h = 6 + rng() * 8;
    const hull = "#d9dcd4",
      heading = (rng() - 0.5) * 0.5;
    boulder.add(transform(x, 0.12, z, 1.1, 0.82, 3.3, heading), hull);
    posts.add(transform(x, h * 0.5, z, 0.09, h, 0.09), "#a5a9a0");
    const wm = new THREE.Color(j % 3 === 0 ? "#d9a980" : "#efe9d7");
    sailG.quad(
      [x + 0.07, 1.5, z],
      [x + 0.08, 1.6, z + h * 0.36],
      [x + 0.07, h - 0.6, z + 0.1],
      [x + 0.07, h, z],
      wm,
    );
  }
  root.add(new THREE.Mesh(sailG.finish(), geometricMaterial()));

  const trees = ["#475c39", "#536a3c", "#586e43", "#607449"];
  for (let k = 0; k < 1320; k++) {
    const x = -1185 + rng() * 1340,
      z = -1100 + rng() * 2050,
      y = groundHeight(x, z);
    if ((x > -355 && z < 535 && z > -1080) || y < 3 || roadAt(x, z, 4.8))
      continue;
    const size = 1.5 + rng() * 3.4,
      tone = trees[Math.floor(rng() * trees.length)];
    if (rng() > 0.77) {
      const h = size * 1.4;
      treeRecord("oak", x, y, z, h + size * 0.82, rng() * 6, 0.35);
    } else if (rng() > 0.36)
      boulder.add(
        transform(
          x,
          y + 0.23,
          z,
          size * 1.06,
          size * 0.46,
          size * 0.84,
          rng() * 6,
          0,
          rng() * 0.19,
        ),
        "#a39276",
      );
    else
      shrubs.add(
        transform(x, y + 0.45, z, size * 0.78, size * 0.42, size * 0.71),
        tone,
      );
  }
  for (let i = 0; i < roadLengths[1]; i += 13) {
    const p = routePoint(1, i),
      q = routePoint(1, i + 13);
    if (groundHeight(p.x, p.z) < 37 || roadAt(p.x, p.z, 3, 1)) continue;
    function edge(s) {
      const offset = roads[1].width / 2 + 1.3;
      return [
        s.x + Math.cos(s.heading) * offset,
        s.z - Math.sin(s.heading) * offset,
      ];
    }
    const [x, z] = edge(p),
      [ex, ez] = edge(q),
      y = groundHeight(x, z),
      ey = groundHeight(ex, ez);
    fence.add(transform(x, y + 0.54, z, 0.15, 1.08, 0.14), "#898b81");
    posts.add(
      beamMatrix([x, y + 0.83, z], [ex, ey + 0.83, ez], 0.28),
      "#b9b8a9",
    );
  }

  // A compact festival paddock on the first straight anchors the player's starting vista.
  const tentG = stripBuilder(),
    bannerG = stripBuilder();
  const flagTones = ["#e46c38", "#347b7d", "#e7d8b5"];
  function tent(x, z, r, color) {
    const y = groundHeight(x, z),
      top = [x, y + 4.7, z],
      shade = new THREE.Color(color);
    for (let k = 0; k < 4; k++) {
      const a = 0.25 * Math.PI + (k * Math.PI) / 2,
        b = a + Math.PI / 2;
      const p = [x + Math.cos(a) * r, y + 2.8, z + Math.sin(a) * r],
        q = [x + Math.cos(b) * r, y + 2.8, z + Math.sin(b) * r];
      // A repeated apex is intentional for a triangular face in the shared quad batch.
      tentG.quad(p, q, top, top, shade);
      posts.add(transform(p[0], y + 1.4, p[2], 0.085, 2.8, 0.085), "#d3d6c6");
    }
  }
  for (let i = 0; i < 6; i++) {
    const z = 300 - i * 15,
      x = 231 + (i % 2) * 5;
    if (roadAt(x, z, 4)) continue;
    if (
      frontage.some(
        (v) =>
          Math.abs(x - v.x) < v.w * 0.5 + 4.3 &&
          Math.abs(z - v.z) < v.d * 0.5 + 4.3,
      )
    )
      continue;
    tent(x, z, 4.3, flagTones[i % 3]);
    blocks.add(
      transform(x, groundHeight(x, z) + 0.56, z, 2.6, 1.12, 1.1),
      "#51514c",
    );
  }
  for (let d = 30; d < 138; d += 14) {
    const p = routePoint(0, d);
    for (const s of [-1, 1]) {
      const offset = roads[0].width / 2 + 1.4,
        x = p.x + s * Math.cos(p.heading) * offset,
        z = p.z - s * Math.sin(p.heading) * offset,
        y = groundHeight(x, z);
      posts.add(transform(x, y + 2.85, z, 0.085, 5.7, 0.085), "#484e4e");
      const tip = [x + 0.14, y + 5.5, z + 0.25],
        edge = [x + 0.36, y + 5.17, z + 1.04],
        low = [x + 0.3, y + 2.4, z + 0.9];
      bannerG.quad(
        [x + 0.04, y + 1.94, z],
        low,
        edge,
        tip,
        new THREE.Color(
          flagTones[(Math.round(d / 14) + (s === 1 ? 1 : 0)) % 3],
        ),
      );
    }
  }
  root.add(new THREE.Mesh(tentG.finish(), geometricMaterial()));
  root.add(new THREE.Mesh(bannerG.finish(), geometricMaterial()));

  function gantry(index, station, text, sub, color) {
    const p = routePoint(index, station),
      w = roads[index].width + 3,
      cos = Math.cos(p.heading),
      sin = Math.sin(p.heading);
    const left = [p.x - (cos * w) / 2, p.z + (sin * w) / 2],
      right = [p.x + (cos * w) / 2, p.z - (sin * w) / 2];
    const y = groundHeight(p.x, p.z),
      h = 8.1;
    for (const [x, z] of [left, right]) {
      blocks.add(
        transform(x, y + h / 2, z, 0.42, h, 0.48, p.heading),
        "#555e60",
      );
      for (const s of [-1, 1])
        blocks.add(
          transform(
            x + s * cos * 0.32,
            y + 0.38,
            z - s * sin * 0.32,
            0.3,
            0.72,
            0.85,
            p.heading,
          ),
          "#b6b2a2",
        );
    }
    for (const dh of [0, 1.1])
      posts.add(
        beamMatrix(
          [left[0], y + h + dh, left[1]],
          [right[0], y + h + dh, right[1]],
          0.21,
        ),
        "#727b78",
      );
    for (let i = 0; i < 12; i++) {
      const l = -w / 2 + (w * i) / 12,
        r = l + w / 12;
      posts.add(
        beamMatrix(
          [p.x + cos * l, y + h, p.z - sin * l],
          [p.x + cos * r, y + h + 1.1, p.z - sin * r],
          0.13,
        ),
        "#89918c",
      );
    }
    createSign(
      root,
      text,
      sub,
      p.x + sin * 0.22,
      y + h + 0.36,
      p.z + cos * 0.22,
      p.heading,
      Math.min(14.5, w * 0.78),
      2.4,
      color,
    );
  }
  gantry(
    0,
    77,
    "AURELIA BAY",
    "COASTAL HIGHWAY     /     NORTHBOUND",
    "#255557",
  );
  gantry(
    0,
    687,
    "HARBOUR DISTRICT",
    "CONTAINER TERMINAL     /     KEEP RIGHT",
    "#31585a",
  );
  gantry(
    1,
    453,
    "CANYON PASS",
    "SCENIC ROUTE     /     WINDING ROAD",
    "#755a43",
  );
  gantry(
    2,
    212,
    "PORT AURELIA",
    "FREIGHT TERMINAL     /     EAST DOCKS",
    "#435861",
  );
  // Angled metal launch decks have matching analytic collision planes.
  const rampG = stripBuilder(),
    paintG = stripBuilder();
  function ramp(index, station, offset, width, length, lift) {
    const p = routePoint(index, station),
      a = p.heading;
    const x = p.x + Math.cos(a) * offset,
      z = p.z - Math.sin(a) * offset;
    const fx = -Math.sin(a),
      fz = -Math.cos(a),
      rx = Math.cos(a),
      rz = -Math.sin(a);
    const rec = { x, z, fx, fz, rx, rz, width, length, lift };
    ramps.push(rec);
    function at(u, v, dy = 0) {
      const px = x + fx * u + rx * v,
        pz = z + fz * u + rz * v;
      return [
        px,
        groundHeight(px, pz) + 0.25 + lift * (u / length + 0.5) + dy,
        pz,
      ];
    }
    rampG.quad(
      at(-length / 2, -width / 2),
      at(-length / 2, width / 2),
      at(length / 2, width / 2),
      at(length / 2, -width / 2),
      new THREE.Color("#646965"),
    );
    for (const s of [-1, 1]) {
      const l = at(-length / 2, s * width * 0.5),
        r = at(length / 2, s * width * 0.5);
      rampG.quad(
        l,
        r,
        [r[0], r[1] - lift, r[2]],
        l,
        new THREE.Color("#8e5b3a"),
      );
      paintG.quad(
        at(-length * 0.5, s * width * 0.49, 0.025),
        at(-length * 0.5, s * width * 0.45, 0.025),
        at(length * 0.5, s * width * 0.45, 0.025),
        at(length * 0.5, s * width * 0.49, 0.025),
        new THREE.Color("#eeb447"),
      );
    }
    for (let j = 0; j < 3; j++)
      for (const s of [-1, 1]) {
        const u = -length * 0.29 + j * length * 0.25;
        paintG.quad(
          at(u, s * width * 0.34, 0.04),
          at(u + 1.4, 0, 0.04),
          at(u + 1.9, 0, 0.04),
          at(u + 0.5, s * width * 0.34, 0.04),
          new THREE.Color("#d8b04d"),
        );
      }
  }
  ramp(2, 148, 3.2, 4.7, 15, 3.6);
  ramp(2, 415, -3.8, 5.0, 18, 4.8);
  ramp(0, 772, 6.7, 5.6, 21, 4.2);
  ramp(1, 1360, 4.4, 4.4, 17, 3.7);
  root.add(
    new THREE.Mesh(
      rampG.finish(),
      geometricMaterial({ roughness: 0.57, metalness: 0.2 }),
    ),
  );
  root.add(new THREE.Mesh(paintG.finish(), geometricMaterial()));

  // Glass festival boards can be driven through. Hide all parts in the same collision step.
  const glassBoardMat = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0.72,
    roughness: 0.24,
    metalness: 0.16,
  });
  const boards = batches.create(box.clone(), glassBoardMat),
    trialBoards = new Map();
  for (const [i, station] of [
    [0, 404],
    [0, 1078],
    [1, 328],
    [1, 1880],
    [2, 231],
    [2, 548],
    [5, 142],
  ]) {
    const p = routePoint(i, station),
      off = roads[i].width * 0.5 + 2.6,
      x = p.x + Math.cos(p.heading) * off,
      z = p.z - Math.sin(p.heading) * off,
      y = groundHeight(x, z);
    const parts = [
      [
        boards,
        boards.add(
          transform(x, y + 1.45, z, 3.6, 2.4, 0.12, p.heading),
          "#66bcbf",
        ),
      ],
    ];
    for (const s of [-1, 1]) {
      const px = x + Math.cos(p.heading) * 1.67 * s,
        pz = z - Math.sin(p.heading) * 1.67 * s;
      parts.push([
        blocks,
        blocks.add(
          transform(px, y + 0.8, pz, 0.12, 1.6, 0.14, p.heading),
          "#717774",
        ),
      ]);
    }
    const prop = { alive: true, parts, x, z, boardId: i + "/" + station };
    prop.original = parts.map(([batch, id]) => batch.items[id].matrix.clone());
    trialBoards.set(prop.boardId, prop);
    solid(x, z, 1.65, 1.65, y, 2.8, prop);
  }
  architecture.bake();
  batches.finish();
  root.userData.trees = forest;
  const vegetation = createVegetation(root, forest, (x, z) => {
    if (shoreDepth(x, z) < 26 || roadAt(x, z, 4.5)) return null;
    // Concrete container yards, public forecourts and the landscaped building
    // setbacks are kept clear of wild grass, regardless of camera distance.
    if (x > -245 && x < 322 && z < -645 && z > -1055) return null;
    if (
      frontage.some(
        (v) =>
          Math.abs(x - v.x) < v.w * 0.5 + 8 &&
          Math.abs(z - v.z) < v.d * 0.5 + 3,
      )
    )
      return null;
    for (const o of collisions.get(key(x, z)) || empty) {
      if (
        !o.smash &&
        Math.abs(o.x - x) < o.rx + 4 &&
        Math.abs(o.z - z) < o.rz + 4
      )
        return null;
    }
    return {
      height: groundHeight(x, z),
      urban: x > -320 && x < 285 && z > -645 && z < 550,
    };
  });
  root.userData.vegetation = vegetation;
  function animateTrees(time) {
    simulationTime = time;
    for (let i = falling.length - 1; i >= 0; i--) {
      const tree = falling[i],
        t = clamp((time - tree.started) / 1.08, 0, 1);
      tree.progress = t;
      // Accelerate under gravity, then settle on the terrain.
      const ax = tree.x + tree.dx * tree.height,
        az = tree.z + tree.dz * tree.height;
      const inclination = Math.atan2(
        groundHeight(ax, az) - tree.y,
        tree.height,
      );
      tree.angle = (Math.PI * 0.47 - inclination) * (t * t * (2 - t));
      if (t >= 1) falling.splice(i, 1);
    }
  }
  const hidden = transform(0, -200, 0, 0.001, 0.001, 0.001);
  function collide(p) {
    let smashed = 0,
      trees = 0,
      tree = null,
      boardId = null;
    const py = p.y ?? groundHeight(p.x, p.z);
    let solidHit = shoreDepth(p.x, p.z) < -3 && py < 2;
    for (const item of collisions.get(key(p.x, p.z)) || empty) {
      if (py > item.y + item.h + 0.35 || py < item.y - 2) continue;
      if (item.smash?.tree) {
        const hit = item.smash.tree;
        if (hit.fallen) continue;
        // Closest point on the oriented vehicle hull to a cylindrical trunk.
        const yaw = p.heading || 0,
          dx = item.x - p.x,
          dz = item.z - p.z,
          c = Math.cos(yaw),
          s = Math.sin(yaw);
        const lateral = dx * c - dz * s,
          longitudinal = dx * s + dz * c;
        const ex = Math.max(0, Math.abs(lateral) - 0.99),
          ez = Math.max(0, Math.abs(longitudinal) - 2.28);
        if (ex * ex + ez * ez > item.rx * item.rx) continue;
        tree = { x: hit.x, z: hit.z };
        if (Math.abs(p.speed || 0) < 7) {
          solidHit = true;
          continue;
        }
        const sign = Math.sign(p.speed || 1),
          a = p.travel ?? yaw;
        hit.fallen = true;
        hit.started = simulationTime;
        hit.dx = -Math.sin(a) * sign;
        hit.dz = -Math.cos(a) * sign;
        falling.push(hit);
        trees++;
        continue;
      }
      if (
        Math.abs(p.x - item.x) > item.rx + 0.78 ||
        Math.abs(p.z - item.z) > item.rz + 0.78
      )
        continue;
      if (item.smash) {
        if (!item.smash.alive) continue;
        item.smash.alive = false;
        boardId = item.smash.boardId || boardId;
        for (const [batch, id] of item.smash.parts) {
          batch.mesh.setMatrixAt(id, hidden);
          batch.mesh.instanceMatrix.needsUpdate = true;
        }
        smashed++;
      } else solidHit = true;
    }
    return { solid: solidHit, smashed, boardId, trees, tree };
  }
  function surface(x, z, vehicleY) {
    const terrain = groundHeight(x, z),
      onRoad = roadAt(x, z, 0, -1, true),
      base = terrain + (onRoad ? 0.25 : 0.015);
    // A reference height preserves the active level at flyovers and permits landing on the deck.
    let closest = Infinity,
      flyoverHeight;
    for (const s of segments.get(key(x, z)) || empty) {
      if (s.road !== expressway) continue;
      const u = clamp(((x - s.x) * s.dx + (z - s.z) * s.dz) / s.length2, 0, 1);
      const dsq = (x - s.x - u * s.dx) ** 2 + (z - s.z - u * s.dz) ** 2;
      if (dsq >= (s.width * 0.5 + 0.2) ** 2 || dsq >= closest) continue;
      closest = dsq;
      flyoverHeight =
        terrain + 0.265 + deckHeight(s.station + u * Math.sqrt(s.length2));
    }
    if (
      flyoverHeight !== undefined &&
      (vehicleY ?? terrain) >= flyoverHeight - 1.7
    )
      return { height: flyoverHeight, road: true, ramp: false };
    for (const r of ramps) {
      const dx = x - r.x,
        dz = z - r.z,
        u = dx * r.fx + dz * r.fz,
        v = dx * r.rx + dz * r.rz;
      if (Math.abs(u) <= r.length / 2 && Math.abs(v) <= r.width / 2)
        return {
          height: base + r.lift * (u / r.length + 0.5),
          road: true,
          ramp: true,
        };
    }
    return { height: base, road: onRoad, ramp: false };
  }
  function resetBoards(ids) {
    for (const id of ids) {
      const b = trialBoards.get(id);
      if (!b) continue;
      b.alive = true;
      b.parts.forEach(([batch, i], n) => {
        batch.mesh.setMatrixAt(i, b.original[n]);
        batch.mesh.instanceMatrix.needsUpdate = true;
      });
    }
  }
  return {
    collide,
    surface,
    resetBoards,
    boardAt: (id) => trialBoards.get(id),
    trees: forest,
    update(n, time, player) {
      animateTrees(time);
      vegetation.update(time, player);
      architecture.update(time, player, n);
      lampHeadMaterial.emissiveIntensity = streetlightPower(n) * 3.4;
    },
  };
}

export function createWorld(scene) {
  const root = new THREE.Group();
  root.name = "Aurelia Bay";
  scene.add(root);
  const night = { value: 0 };
  makeTerrain(root);
  makeRoads(root);
  const ocean = makeOcean(root),
    scenery = createScenery(root, night);
  return {
    group: root,
    trees: scenery.trees,
    collide: scenery.collide,
    surface: scenery.surface,
    resetBoards: scenery.resetBoards,
    boardAt: scenery.boardAt,
    update(time, nightBlend = 0, player) {
      night.value = clamp(Number(nightBlend) || 0, 0, 1);
      ocean(time, night.value);
      scenery.update(night.value, time, player);
    },
    dispose() {
      const geometries = new Set(),
        materials = new Set(),
        maps = new Set();
      root.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material)
          ? o.material
          : o.material
            ? [o.material]
            : []) {
          materials.add(m);
          if (m.map) maps.add(m.map);
        }
        if (o.isInstancedMesh) o.dispose();
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of maps) t.dispose();
      scene.remove(root);
    },
  };
}
