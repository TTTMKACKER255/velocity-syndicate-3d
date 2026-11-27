// Perspective Canvas renderer for systems without WebGL2. The scene shares geometry,
// instance transforms and map coordinates with the hardware renderer.
import * as THREE from "three";
import { createVehicle } from "../models/vehicle.js";
import { createWorld, groundHeight } from "./world.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mod = (x, n) => ((x % n) + n) % n;
const hex = (r, g, b) =>
  Math.round(r) * 65536 + Math.round(g) * 256 + Math.round(b);
const components = (c) => [c >> 16, (c >> 8) & 255, c & 255];
const T = Math.PI * 2;
function spriteCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// A small, depth-buffered sprite cache preserves the actual car's curved coachwork,
// carbon aero, rims and light geometry without resubmitting a 100k-triangle model each frame.
function carSprites(look) {
  const model = createVehicle(look),
    meshes = [];
  model.group.updateMatrixWorld(true);
  const v = new THREE.Vector3(),
    n = new THREE.Vector3(),
    nm = new THREE.Matrix3();
  model.group.traverseVisible((o) => {
    if (!o.isMesh || o.material.opacity < 0.08 || o.material.name === "seat")
      return;
    const g = o.geometry,
      src = g.attributes.position,
      normals = g.attributes.normal,
      xyz = new Float32Array(src.count * 3),
      normal = new Float32Array(src.count * 3);
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i)
        .applyMatrix4(o.matrixWorld)
        .toArray(xyz, i * 3);
      n.fromBufferAttribute(normals, i)
        .applyMatrix3(nm)
        .normalize()
        .toArray(normal, i * 3);
    }
    meshes.push({
      xyz,
      normal,
      indices:
        g.index?.array || Uint32Array.from({ length: src.count }, (_, i) => i),
      rgb: components(o.material.color.getHex()),
      name: o.material.name,
    });
  });
  model.dispose();
  const cache = new Map(),
    W = 432,
    H = 272,
    scale = 75;
  function render(az, el, night) {
    const ka = mod(Math.round(az / (Math.PI / 24)), 48),
      ke = clamp(Math.round(el / 0.09), -5, 13),
      kn = Math.round(night * 2);
    const key = ka + "/" + ke + "/" + kn;
    if (cache.has(key)) return cache.get(key);
    const a = (ka * Math.PI) / 24,
      e = ke * 0.09,
      sa = Math.sin(a),
      ca = Math.cos(a),
      se = Math.sin(e),
      ce = Math.cos(e);
    const cv = spriteCanvas(W, H),
      ctx = cv.getContext("2d"),
      im = ctx.createImageData(W, H);
    const pixels = im.data,
      depth = new Float32Array(W * H).fill(-Infinity),
      nightLight = 1 - kn * 0.17;
    for (const { xyz, normal, indices, rgb, name } of meshes) {
      const vertices = new Float32Array(xyz.length),
        tones = new Float32Array(xyz.length);
      for (let i = 0; i < xyz.length; i += 3) {
        const x = xyz[i],
          y = xyz[i + 1] - 0.67,
          z = xyz[i + 2],
          cross = x * sa + z * ca;
        vertices[i] = W / 2 + (x * ca - z * sa) * scale;
        vertices[i + 1] = H / 2 - (y * ce - cross * se) * scale;
        vertices[i + 2] = cross * ce + y * se;
        const nx = normal[i],
          ny = normal[i + 1],
          nz = normal[i + 2],
          sun = Math.max(0, -0.42 * nx + 0.82 * ny - 0.36 * nz);
        const ndv = Math.max(0, nx * sa * ce + ny * se + nz * ca * ce);
        const reflectionY = 2 * ndv * ny - se,
          reflectionAz = Math.atan2(
            2 * ndv * nx - sa * ce,
            2 * ndv * nz - ca * ce,
          );
        const silhouette =
          0.025 +
          0.07 * Math.sin(reflectionAz * 7) +
          0.04 * Math.sin(reflectionAz * 19);
        const reflectsSky = clamp((reflectionY - silhouette) * 14 + 0.5, 0, 1);
        const shine = Math.pow(
          Math.max(0, -0.29 * nx + 0.76 * ny + 0.59 * nz),
          29,
        );
        let lip = 0,
          light = 0.56 + sun * 0.53 + Math.max(ny, 0) * 0.14;
        if (name === "Coachwork") {
          light =
            0.4 + sun * 0.46 + Math.max(0, ny) * 0.23 + 0.24 * reflectsSky;
          lip = 17 * (1 - ndv) ** 2 + 38 * shine;
        } else if (name === "glass") {
          light = 0.34 + reflectsSky * 0.44 + Math.max(0, reflectionY) * 0.5;
          lip = 8 * (1 - ndv) + 7;
        } else if (name === "red" || name === "light") {
          light = 1.15 + kn * 0.1;
          lip = 15 + kn * 10;
        } else if (name === "rim" || name === "metal") {
          light = 0.75 + sun * 0.48;
          lip = 40 * shine;
        }
        for (let k = 0; k < 3; k++)
          tones[i + k] = clamp(
            (rgb[k] * light + lip + (name === "glass" ? k * 3 : 0)) *
              nightLight,
            0,
            255,
          );
      }
      for (let t = 0; t < indices.length; t += 3) {
        const ai = indices[t] * 3,
          bi = indices[t + 1] * 3,
          ci = indices[t + 2] * 3;
        const ax = vertices[ai],
          ay = vertices[ai + 1],
          bx = vertices[bi],
          by = vertices[bi + 1],
          cx = vertices[ci],
          cy = vertices[ci + 1];
        const area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(area) < 0.035) continue;
        const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
          maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))),
          maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        const az = vertices[ai + 2],
          bz = vertices[bi + 2],
          cz = vertices[ci + 2],
          inv = 1 / area;
        for (let py = minY; py <= maxY; py++)
          for (let px = minX; px <= maxX; px++) {
            const k = (by - cy) * (px + 0.5 - cx) + (cx - bx) * (py + 0.5 - cy),
              u = k * inv;
            if (u < 0 || u > 1) continue;
            const vv =
                ((cy - ay) * (px + 0.5 - cx) + (ax - cx) * (py + 0.5 - cy)) *
                inv,
              w = 1 - u - vv;
            if (vv < 0 || w < 0) continue;
            const zz = u * az + vv * bz + w * cz,
              index = py * W + px;
            if (zz <= depth[index]) continue;
            depth[index] = zz;
            let out = index * 4;
            for (let c = 0; c < 3; c++)
              pixels[out++] =
                u * tones[ai + c] + vv * tones[bi + c] + w * tones[ci + c];
            pixels[out] = 255;
          }
      }
    }
    ctx.putImageData(im, 0, 0);
    if (cache.size >= 30) cache.delete(cache.keys().next().value);
    cache.set(key, cv);
    return cv;
  }
  return {
    render,
    scale,
    clear() {
      cache.clear();
      meshes.length = 0;
    },
  };
}

function scenery(group) {
  const data = { ground: [], strips: [], items: [], distance: [] },
    m = new THREE.Matrix4(),
    pos = new THREE.Vector3(),
    quat = new THREE.Quaternion(),
    scale = new THREE.Vector3(),
    color = new THREE.Color();
  const plane = (p, c, layer = 0) => {
    const x = p.reduce((v, a) => v + a[0], 0) / p.length,
      z = p.reduce((v, a) => v + a[2], 0) / p.length;
    return { p, c, x, z, layer };
  };
  const bounds = (geometry) => {
    geometry.computeBoundingBox();
    return geometry.boundingBox;
  };
  // Downsample the terrain before painting. A finer second coast strip follows its beach.
  const spacing = 64;
  const vert = (x, z) => [x, Math.max(-0.55, groundHeight(x, z)), z];
  for (let x = -1344; x < 448; x += spacing)
    for (let z = -1280; z < 1152; z += spacing) {
      const v = [
        vert(x, z),
        vert(x + spacing, z),
        vert(x + spacing, z + spacing),
        vert(x, z + spacing),
      ];
      const avg = v.reduce((sum, k) => sum + k[1], 0) * 0.25;
      if (avg < -0.48) continue;
      const y = groundHeight(x + 32, z + 32),
        dry = avg < 2,
        rock = y > 48;
      const base = dry
        ? [208, 191, 143]
        : rock
          ? [145, 140, 106]
          : x > -340 && z > -655 && z < 545
            ? [126, 135, 108]
            : [113, 138, 88];
      const light = clamp(
        (v[0][1] - v[2][1]) * 0.24 + 1.5 * Math.sin(x * 0.034 + z * 0.021),
        -9,
        9,
      );
      data.ground.push(plane(v, hex(...base.map((q) => q + light))));
    }
  const solids = group.children.filter((o) => o.isMesh && !o.isInstancedMesh);
  for (const [i, o] of solids.entries()) {
    if (
      !o.geometry.attributes.position ||
      i === 0 ||
      o.material.isShaderMaterial
    )
      continue;
    const source = o.geometry.attributes.position,
      cols = o.geometry.attributes.color;
    if (o.material.map?.image) {
      data.items.push({
        kind: "sign",
        x: o.position.x,
        y: o.position.y,
        z: o.position.z,
        a: o.rotation.y,
        w: o.geometry.parameters.width,
        h: o.geometry.parameters.height,
        img: o.material.map.image,
      });
      continue;
    }
    if (!cols || source.count % 4 !== 0) continue;
    for (let k = 0; k < source.count; k += 4) {
      const v = Array.from({ length: 4 }, (_, j) => [
        source.getX(k + j),
        source.getY(k + j),
        source.getZ(k + j),
      ]);
      color.fromBufferAttribute(cols, k);
      const element = plane(
        v,
        color.getHex(),
        i === 4 ? 3 : i === 3 ? 1 : i === 2 ? 2 : 4,
      );
      if (i === 1) data.distance.push(element);
      else data.strips.push(element);
    }
  }
  for (const o of group.children.filter((n) => n.isInstancedMesh)) {
    const type = o.geometry.type;
    for (let j = 0; j < o.count; j++) {
      o.getMatrixAt(j, m);
      m.decompose(pos, quat, scale);
      o.getColorAt(j, color);
      const x = pos.x,
        y = pos.y,
        z = pos.z,
        w = scale.x,
        h = scale.y,
        d = scale.z,
        c = color.getHex();
      if (type === "BoxGeometry") {
        if (Math.max(w, d) < 0.2 || (Math.min(w, d) < 0.11 && h < 5)) continue;
        const a = Math.atan2(m.elements[8], m.elements[10]);
        data.items.push({
          kind: "block",
          x,
          y,
          z,
          w,
          h,
          d,
          a,
          c,
          facade: o.material.hasOwnProperty("onBeforeCompile"),
          source: o,
          id: j,
        });
      } else if (type === "CylinderGeometry") {
        const E = m.elements;
        data.items.push({
          kind: "beam",
          x,
          y,
          z,
          v: [
            [x - E[4] / 2, y - E[5] / 2, z - E[6] / 2],
            [x + E[4] / 2, y + E[5] / 2, z + E[6] / 2],
          ],
          r: w,
          c,
          source: o,
          id: j,
        });
      } else if (type === "IcosahedronGeometry") {
        data.items.push({ kind: "bush", x, y, z, w, h, d, c });
      } else if (type === "BufferGeometry") {
        const bb = bounds(o.geometry);
        data.items.push({
          kind: "palm",
          x,
          y,
          z,
          h: 10.8 * h,
          w: (bb.max.x - bb.min.x) * w,
          c,
          seed: j,
        });
      }
    }
  }
  return data;
}

export function createSoftwareView(canvas, look = {}, worldGroup) {
  let ownWorld;
  if (!worldGroup) {
    ownWorld = createWorld(new THREE.Scene());
    worldGroup = ownWorld.group;
  }
  const map = scenery(worldGroup),
    car = carSprites(look),
    ctx = canvas.getContext("2d", { alpha: false });
  const grain = spriteCanvas(96, 96),
    gc = grain.getContext("2d"),
    gi = gc.createImageData(96, 96);
  for (let i = 0; i < gi.data.length; i += 4) {
    const bits = mod(Math.sin(i * 0.731 + 5.62) * 881.1, 1);
    gi.data[i] = gi.data[i + 1] = gi.data[i + 2] = bits > 0.5 ? 238 : 15;
    gi.data[i + 3] = 3 + Math.floor(bits * 12);
  }
  gc.putImageData(gi, 0, 0);
  const asphalt = ctx.createPattern(grain, "repeat");
  const clouds = spriteCanvas(768, 160),
    cc = clouds.getContext("2d"),
    ci = cc.createImageData(768, 160);
  const hash = (x, y) =>
    mod(Math.sin(mod(x, 32) * 19.232 + y * 73.321) * 4851.32, 1);
  function noise(x, y, period) {
    x = mod(x, period);
    const ix = Math.floor(x),
      iy = Math.floor(y);
    let u = x - ix,
      v = y - iy;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    const a = hash(ix, iy) * (1 - u) + hash(mod(ix + 1, period), iy) * u,
      b = hash(ix, iy + 1) * (1 - u) + hash(mod(ix + 1, period), iy + 1) * u;
    return a * (1 - v) + b * v;
  }
  for (let y = 0; y < 160; y++)
    for (let x = 0; x < 768; x++) {
      const u = x / 768,
        v = y / 160,
        n =
          0.55 * noise(u * 4, v * 3, 4) +
          0.28 * noise(u * 8, v * 6, 8) +
          0.13 * noise(u * 16, v * 12, 16) +
          0.04 * noise(u * 32, v * 24, 32);
      const a = clamp((n - 0.45) * 4.0, 0, 0.83) * Math.sin(v * Math.PI) ** 0.6,
        idx = (y * 768 + x) * 4;
      ci.data.set([247, 245, 226, Math.round(a * 150)], idx);
    }
  cc.putImageData(ci, 0, 0);
  const eye = { x: 0, y: 0, z: 0 },
    ahead = { x: 0, y: 0, z: -1 },
    right = { x: 1, z: 0 },
    up = { x: 0, y: 1, z: 0 };
  let w = 1,
    h = 1,
    f = 1,
    night = 0,
    fog = [199, 209, 196],
    clock = 0,
    previousHeading = 0,
    previousTime = -1;
  const near = 0.32,
    far = 1180;
  function cameraSpace(v) {
    const x = v[0] - eye.x,
      y = v[1] - eye.y,
      z = v[2] - eye.z;
    return [
      x * right.x + z * right.z,
      x * up.x + y * up.y + z * up.z,
      x * ahead.x + y * ahead.y + z * ahead.z,
    ];
  }
  function projection(v) {
    return [w * 0.5 + (f * v[0]) / v[2], h * 0.5 - (f * v[1]) / v[2]];
  }
  function projected(x, y, z) {
    const v = cameraSpace([x, y, z]);
    return v[2] > near ? projection(v) : null;
  }
  function depth(x, y, z) {
    return (
      (x - eye.x) * ahead.x + (y - eye.y) * ahead.y + (z - eye.z) * ahead.z
    );
  }
  function visible(x, z, r = 30, max = far) {
    const dx = x - eye.x,
      dz = z - eye.z,
      forward = dx * ahead.x + dz * ahead.z;
    return (
      forward > -r &&
      forward < max + r &&
      Math.abs(dx * right.x + dz * right.z) <
        Math.max(0, forward) * ((w / f) * 0.55 + 0.15) + r
    );
  }
  function tint(c, distance, shade = 1, glow = 0) {
    const mist = clamp((distance - 65) / 1150, 0, 0.8),
      r = c >> 16,
      g = (c >> 8) & 255,
      b = c & 255;
    const level = (1 - night * 0.68 + glow * night * 0.63) * shade;
    return (
      "rgb(" +
      [r, g, b]
        .map((k, i) =>
          Math.round(clamp(k * level * (1 - mist) + fog[i] * mist, 0, 255)),
        )
        .join(",") +
      ")"
    );
  }
  function screenPoly(pts, fill) {
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function poly(vertices, fill, asphaltStrip = false) {
    let p = vertices.map(cameraSpace),
      min = p[0][2],
      max = min;
    for (let k = 1; k < p.length; k++) {
      min = Math.min(min, p[k][2]);
      max = Math.max(max, p[k][2]);
    }
    if (max < near) return;
    if (min < near) {
      const clipped = [];
      for (let k = 0; k < p.length; k++) {
        const a = p[k],
          b = p[(k + 1) % p.length];
        if (a[2] >= near) clipped.push(a);
        if (a[2] >= near !== b[2] >= near) {
          const t = (near - a[2]) / (b[2] - a[2]);
          clipped.push([
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            near,
          ]);
        }
      }
      p = clipped;
    }
    if (p.length > 2) {
      screenPoly(p.map(projection), fill);
      if (asphaltStrip) {
        ctx.strokeStyle = fill;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        if (min < 135) {
          ctx.fillStyle = asphalt;
          ctx.fill();
        }
      }
    }
  }
  function line(a, b, fill, width) {
    const u = projected(...a),
      v = projected(...b);
    if (!u || !v) return;
    ctx.beginPath();
    ctx.moveTo(...u);
    ctx.lineTo(...v);
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function block(o, distance) {
    const { x, y, z, w: sx, h: sy, d: sz, a, c } = o,
      co = Math.cos(a),
      si = Math.sin(a);
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([i, j]) => [
      x + co * sx * 0.5 * i + si * sz * 0.5 * j,
      z - si * sx * 0.5 * i + co * sz * 0.5 * j,
    ]);
    const lower = corners.map(([x, z]) => [x, y - sy * 0.5, z]),
      upper = corners.map(([x, z]) => [x, y + sy * 0.5, z]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4,
        dx = corners[j][0] - corners[i][0],
        dz = corners[j][1] - corners[i][1];
      if ((eye.x - corners[i][0]) * dz - (eye.z - corners[i][1]) * dx < 0)
        continue;
      const shade = 1 + (dx * 0.12 - dz * 0.17) / (Math.hypot(dx, dz) || 1);
      poly([lower[i], lower[j], upper[j], upper[i]], tint(c, distance, shade));
      if (o.facade && distance < 440) {
        const point = (t, v) => [
          corners[i][0] + dx * t,
          y - sy * 0.5 + sy * v,
          corners[i][1] + dz * t,
        ];
        const rows = clamp(Math.floor(sy / 3.6), 1, 20),
          cols = clamp(Math.floor(Math.hypot(dx, dz) / 4), 1, 12);
        const window = tint(c, distance, shade * 0.62),
          edge = tint(0xafc0bd, distance, 0.86);
        const width = Math.max(
          0.5,
          Math.min(2, (0.25 * f) / Math.max(4, distance)),
        );
        for (let k = 1; k < rows; k++)
          line(point(0, k / rows), point(1, k / rows), window, width);
        for (let k = 1; k < cols; k++)
          line(point(k / cols, 0), point(k / cols, 1), edge, width * 0.6);
        if (night > 0.35 && distance < 235)
          for (let k = 1; k < rows; k += 3) {
            const off = ((k * 13) % cols) / cols;
            line(
              point(off, (k + 0.34) / rows),
              point(Math.min(1, off + 0.72 / cols), (k + 0.34) / rows),
              tint(0xffcc83, distance, 1, 1),
              width * 1.6,
            );
          }
      }
    }
    if (eye.y > y + sy * 0.5) poly(upper, tint(c, distance, 1.11));
  }
  function palm(o, distance) {
    const root = projected(o.x, o.y, o.z),
      top = projected(o.x + 0.5, o.y + o.h, o.z);
    if (!root || !top) return;
    const sz = f / Math.max(near, distance),
      ht = root[1] - top[1],
      span = Math.abs(ht) * 0.43;
    if (span < 1) return;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(...root);
    ctx.quadraticCurveTo(
      root[0] + span * 0.16,
      root[1] - ht * 0.5,
      top[0],
      top[1],
    );
    ctx.strokeStyle = tint(0x86795c, distance);
    ctx.lineWidth = Math.max(0.65, 0.35 * sz);
    ctx.stroke();
    const sway = Math.sin(clock * 1.1 + o.seed) * 0.025;
    for (let l = 0; l < 9; l++) {
      const ang = l * 2.4 + o.seed * 0.39,
        dx = Math.cos(ang) * (1.02 + 0.16 * Math.sin(ang * 3)) + sway;
      const dy = Math.sin(ang) * 0.27 + 0.11,
        xx = top[0],
        yy = top[1],
        x1 = xx + dx * span,
        y1 = yy + dy * span;
      ctx.fillStyle = tint(l % 2 ? 0x4e7141 : 0x64804c, distance);
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.quadraticCurveTo(xx + dx * span * 0.53, yy - span * 0.39, x1, y1);
      ctx.quadraticCurveTo(xx + dx * span * 0.58, yy - span * 0.19, xx, yy);
      ctx.fill();
      if (distance < 105) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = Math.max(0.58, sz * 0.065);
        ctx.beginPath();
        for (let k = 1; k < 8; k++) {
          const t = k / 9,
            mpx = xx + dx * span * t,
            mpy = yy + span * (dy * t - 0.99 * t * (1 - t));
          ctx.moveTo(mpx, mpy);
          ctx.lineTo(
            mpx + span * dx * 0.12,
            mpy + span * (0.05 + 0.12 * Math.sin(t * Math.PI)),
          );
        }
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }
  function item(o, dist) {
    if (o.source && o.source.instanceMatrix.array[o.id * 16 + 13] < -100)
      return;
    if (o.kind === "block") {
      block(o, dist);
      return;
    }
    if (o.kind === "beam") {
      const width = (f * o.r) / Math.max(near, dist);
      if (width > 0.45)
        line(o.v[0], o.v[1], tint(o.c, dist), clamp(width, 0.56, 70));
      return;
    }
    if (o.kind === "palm") {
      palm(o, dist);
      return;
    }
    if (o.kind === "sign") {
      const co = Math.cos(o.a),
        si = Math.sin(o.a),
        point = (dx, dy) => projected(o.x + dx * co, o.y + dy, o.z - dx * si);
      const ul = point(-o.w / 2, o.h / 2),
        ur = point(o.w / 2, o.h / 2),
        bl = point(-o.w / 2, -o.h / 2);
      if (!ul || !ur || !bl) return;
      ctx.save();
      ctx.transform(
        (ur[0] - ul[0]) / o.img.width,
        (ur[1] - ul[1]) / o.img.width,
        (bl[0] - ul[0]) / o.img.height,
        (bl[1] - ul[1]) / o.img.height,
        ...ul,
      );
      ctx.drawImage(o.img, 0, 0);
      ctx.restore();
      return;
    }
    if (o.kind === "bush") {
      const pp = projected(o.x, o.y, o.z);
      if (!pp) return;
      const scale = f / Math.max(near, dist),
        ww = Math.max(o.w, o.d) * scale,
        hh = o.h * scale;
      ctx.fillStyle = tint(o.c, dist);
      ctx.beginPath();
      ctx.ellipse(...pp, Math.max(0.4, ww), Math.max(0.4, hh), -0.12, 0, T);
      ctx.fill();
    }
  }

  function drawSky() {
    const horizon = clamp(
      h * 0.5 + (f * ahead.y) / Math.max(0.1, Math.hypot(ahead.x, ahead.z)),
      -h * 0.4,
      h * 1.4,
    );
    const color = (day, dusk) => {
      const a = components(day),
        b = components(dusk);
      return (
        "rgb(" +
        a.map((v, i) => Math.round(v * (1 - night) + b[i] * night)).join(",") +
        ")"
      );
    };
    const sky = ctx.createLinearGradient(
      0,
      Math.min(0, horizon - 2),
      0,
      Math.max(2, horizon),
    );
    sky.addColorStop(0, color(0x559cd0, 0x172944));
    sky.addColorStop(0.61, color(0x92c1d2, 0x273951));
    sky.addColorStop(1, color(0xe4deca, 0x58606e));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    if (night < 0.98) {
      const span = w * 1.45,
        xx = -mod(
          (Math.atan2(ahead.x, -ahead.z) * span) / T - clock * 0.58,
          span,
        ),
        hh = h * 0.43;
      ctx.globalAlpha = 0.82 - night * 0.72;
      for (let cx = xx; cx < w; cx += span)
        ctx.drawImage(clouds, cx, horizon - hh * 0.93, span, hh);
      ctx.globalAlpha = 1;
    }
    // Bright marine haze and the sun remain world-fixed as the camera turns.
    const sun = projected(eye.x - 1120, eye.y + 690, eye.z - 1940);
    if (sun && sun[0] > -w * 0.4 && sun[0] < w * 1.4) {
      const radius = h * 0.17,
        g = ctx.createRadialGradient(...sun, radius * 0.04, ...sun, radius);
      g.addColorStop(
        0,
        night > 0.7 ? "rgba(212,225,243,.7)" : "rgba(255,244,191,.94)",
      );
      g.addColorStop(
        0.11,
        night > 0.7 ? "rgba(179,213,248,.25)" : "rgba(255,236,166,.72)",
      );
      g.addColorStop(1, "rgba(255,240,187,0)");
      ctx.fillStyle = g;
      ctx.fillRect(sun[0] - radius, sun[1] - radius, radius * 2, radius * 2);
    }
    if (night > 0.55) {
      ctx.fillStyle = "rgba(217,231,242," + (night - 0.55) * 1.55 + ")";
      for (let i = 0; i < 50; i++) {
        const x = mod(i * 197.83 + Math.atan2(ahead.x, ahead.z) * w * 0.45, w),
          y = (Math.sin(i * 73.36) * 0.5 + 0.5) * Math.max(0, horizon - 16);
        ctx.fillRect(x, y, i % 6 === 0 ? 1.6 : 1, 1.35);
      }
    }
    if (horizon < h) {
      const sea = ctx.createLinearGradient(0, horizon, 0, h);
      sea.addColorStop(0, color(0x9bb9bd, 0x3b5266));
      sea.addColorStop(0.13, color(0x6ea7ae, 0x2b4859));
      sea.addColorStop(1, color(0x347d83, 0x173744));
      ctx.fillStyle = sea;
      ctx.fillRect(0, horizon, w, h - horizon);
      ctx.lineWidth = 1;
      ctx.strokeStyle = color(0xb0cccc, 0x425d68);
      ctx.beginPath();
      for (let k = 1; k < 28; k++) {
        const u = (k / 29) ** 2,
          y = horizon + u * (h - horizon),
          span = (0.025 + u * 0.12) * w;
        const x = mod(
          k * 133.43 +
            Math.sin(clock * 0.4 + k) * 9 +
            eye.x * 0.12 +
            ahead.x * 237,
          w,
        );
        ctx.moveTo(x, y);
        ctx.lineTo(x + span, y);
      }
      ctx.stroke();
    }
  }
  function setCamera(p, index, t, mission) {
    const dt = previousTime < 0 ? 1 / 30 : clamp(t - previousTime, 0, 0.12),
      nearCam = index === 1 || index === 2;
    const targetYaw = nearCam ? p.heading : (p.travel ?? p.heading);
    if (previousTime < 0 || dt === 0) previousHeading = targetYaw;
    else
      previousHeading +=
        Math.atan2(
          Math.sin(targetYaw - previousHeading),
          Math.cos(targetYaw - previousHeading),
        ) *
        (1 - Math.exp(-dt * (nearCam ? 22 : 7)));
    previousTime = t;
    const s = Math.sin(previousHeading),
      c = Math.cos(previousHeading),
      dist = [7.3 + Math.abs(p.speed || 0) * 0.02, -0.6, -2.18, 9.6][index];
    const side = index === 3 ? 5.1 * Math.sin(t * 0.21 + 1.1) : 0;
    eye.x = p.x + s * dist + c * side;
    eye.z = p.z + c * dist - s * side;
    eye.y = Math.max(
      p.y + [3.05, 1.18, 0.57, 2.3][index],
      groundHeight(eye.x, eye.z) + 0.44,
    );
    const forward = nearCam ? 18 : index === 3 ? 1.1 : 4.6;
    let tx = p.x - s * forward,
      tz = p.z - c * forward,
      ty = p.y + (nearCam ? 1.04 + Math.sin(p.pitch || 0) * forward : 0.96);
    if (mission?.status === "intro") {
      const a = p.heading + 0.55 + mission.intro * 0.6;
      eye.x = p.x + Math.sin(a) * 6;
      eye.z = p.z + Math.cos(a) * 6;
      eye.y = p.y + 1.9 + mission.intro * 0.22;
      tx = p.x;
      tz = p.z;
      ty = p.y + 0.78;
    }
    const len = Math.hypot(tx - eye.x, ty - eye.y, tz - eye.z);
    ahead.x = (tx - eye.x) / len;
    ahead.y = (ty - eye.y) / len;
    ahead.z = (tz - eye.z) / len;
    const horiz = Math.hypot(ahead.x, ahead.z) || 1;
    right.x = -ahead.z / horiz;
    right.z = ahead.x / horiz;
    up.x = (-ahead.x * ahead.y) / horiz;
    up.z = (-ahead.z * ahead.y) / horiz;
    up.y = horiz;
    const fov =
      (nearCam ? 70 : 53) +
      Math.abs(p.speed || 0) * 0.085 +
      (p.boostStage || 0) * 2.2;
    f = h / (2 * Math.tan((fov * Math.PI) / 360));
  }
  function trafficCar(o, dist, id) {
    const p = o.position,
      y = p.y ?? groundHeight(p.x, p.z),
      a = o.rotation?.y || 0;
    let c = [0x786c59, 0x7794a1, 0xb4b6a4, 0x943e32, 0x3a666d][id % 5];
    if (o.children?.[0]?.material?.color)
      c = o.children[0].material.color.getHex();
    block(
      { x: p.x, y: y + 0.55, z: p.z, w: 1.9, h: 0.65, d: 4.18, a, c },
      dist,
    );
    block(
      {
        x: p.x,
        y: y + 1.05,
        z: p.z,
        w: 1.57,
        h: 0.49,
        d: 2.08,
        a,
        c: 0x384952,
      },
      dist,
    );
    block(
      { x: p.x, y: y + 1.32, z: p.z, w: 1.58, h: 0.075, d: 1.7, a, c },
      dist,
    );
    const ss = Math.sin(a),
      cc = Math.cos(a);
    for (const sign of [-1, 1])
      for (const k of [-1, 1]) {
        const x = p.x + cc * k * 0.67 + ss * 2.11 * sign,
          z = p.z - ss * k * 0.67 + cc * 2.11 * sign;
        block(
          {
            x,
            y: y + 0.63,
            z,
            w: 0.43,
            h: 0.11,
            d: 0.075,
            a,
            c: sign > 0 ? 0xf05d45 : 0xf4dfb1,
          },
          dist,
        );
      }
  }
  function drawCar(p, index, mission) {
    if ((index === 1 || index === 2) && mission?.status !== "intro") {
      if (index === 1) {
        const hood = ctx.createLinearGradient(0, h * 0.88, 0, h);
        hood.addColorStop(0, tint(0xe3e6e4, 0));
        hood.addColorStop(
          0.22,
          tint(parseInt((look.paint || "#bfc4c9").slice(1), 16), 0),
        );
        hood.addColorStop(1, tint(0x535b60, 0));
        ctx.fillStyle = hood;
        ctx.beginPath();
        ctx.moveTo(w * 0.14, h);
        ctx.bezierCurveTo(w * 0.24, h * 0.91, w * 0.66, h * 0.91, w * 0.86, h);
        ctx.fill();
      }
      return;
    }
    const co = Math.cos(p.heading),
      si = Math.sin(p.heading),
      dx = eye.x - p.x,
      dz = eye.z - p.z;
    const az = Math.atan2(dx * co - dz * si, dx * si + dz * co),
      el = Math.atan2(eye.y - p.y - 0.67, Math.hypot(dx, dz));
    const center = projected(p.x, p.y + 0.67, p.z),
      dd = depth(p.x, p.y + 0.67, p.z);
    if (!center || dd < 1) return;
    const pix = (f / dd) * 1.08,
      gr = groundHeight(p.x, p.z);
    const shadow = Array.from({ length: 22 }, (_, i) => {
      const a = (T * i) / 22,
        x = 1.12 * Math.cos(a),
        z = 2.35 * Math.sin(a);
      return [
        p.x + co * x + si * z,
        Math.min(p.y + 0.02, Math.max(gr + 0.3, p.y - (p.airborne ? 4 : 0))),
        p.z - si * x + co * z,
      ];
    });
    poly(shadow, "rgba(20,25,24,.35)");
    const img = car.render(az, el, night),
      cw = (img.width * pix) / car.scale,
      ch = (img.height * pix) / car.scale;
    if (look.underglow) {
      const g = ctx.createRadialGradient(
        center[0],
        center[1] + pix * 0.35,
        0,
        center[0],
        center[1] + pix * 0.35,
        pix * 1.6,
      );
      g.addColorStop(0, "rgba(70,211,222,.4)");
      g.addColorStop(1, "rgba(70,211,222,0)");
      ctx.fillStyle = g;
      ctx.fillRect(
        center[0] - pix * 1.6,
        center[1] - pix * 0.9,
        pix * 3.2,
        pix * 2.5,
      );
    }
    ctx.save();
    ctx.translate(...center);
    ctx.rotate(-(p.roll || 0) * Math.cos(az));
    ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
    if (p.boosting) {
      for (const side of [-1, 1]) {
        const pt = projected(
          p.x + side * 0.64 * co + 2.12 * si,
          p.y + 0.34,
          p.z - side * 0.64 * si + 2.12 * co,
        );
        if (!pt) continue;
        const sz = pix * (0.18 + 0.045 * Math.sin(clock * 52 + side)),
          g = ctx.createRadialGradient(...pt, 0, ...pt, sz * 1.8);
        g.addColorStop(0, "#fff6d3");
        g.addColorStop(0.27, p.boostStage > 1 ? "#9cc3ff" : "#ffa65a");
        g.addColorStop(1, "rgba(180,100,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(pt[0] - sz * 2, pt[1] - sz * 2, sz * 4, sz * 4);
      }
    }
  }
  function gate(waypoint) {
    const { x, z, heading = 0 } = waypoint,
      y = waypoint.height ?? groundHeight(x, z),
      co = Math.cos(heading),
      si = Math.sin(heading);
    if (!visible(x, z, 16, 750)) return;
    const d = depth(x, y, z),
      px = clamp((f / Math.max(d, 1)) * 0.17, 1.1, 8);
    const left = [x - co * 8, y, z + si * 8],
      right = [x + co * 8, y, z - si * 8];
    const l = [left[0], y + 6.9, left[2]],
      r = [right[0], y + 6.9, right[2]];
    line(left, l, "#ff9a55", px);
    line(l, r, "#ffc77e", px);
    line(right, r, "#ff9a55", px);
    const pt = projected(x, y + 8.8 + Math.sin(clock * 2) * 0.24, z);
    if (pt) {
      const a = clamp((f / Math.max(d, 1)) * 0.83, 2, 27);
      screenPoly(
        [
          [pt[0], pt[1] - a],
          [pt[0] + a * 0.72, pt[1]],
          [pt[0], pt[1] + a],
          [pt[0] - a * 0.72, pt[1]],
        ],
        "#ffab67",
      );
    }
  }
  function render(
    p,
    index = 0,
    t = 0,
    nightness = 0,
    waypoint = null,
    traffic = [],
    mission = null,
    parts = [],
  ) {
    w = canvas.width || 1;
    h = canvas.height || 1;
    clock = t;
    night = clamp(nightness, 0, 1);
    fog = [201 - 137 * night, 208 - 135 * night, 197 - 108 * night];
    setCamera(p, index, t, mission);
    drawSky();
    const drawTerrain = (array, range, margin, sortedByLayer = false) => {
      const list = [];
      for (const o of array) {
        if (!visible(o.x, o.z, margin, range)) continue;
        const d = depth(o.x, o.p[0][1], o.z);
        if (o.layer === 3 && d > 390) continue;
        list.push({ o, d });
      }
      list.sort(
        (a, b) => (sortedByLayer ? a.o.layer - b.o.layer : 0) || b.d - a.d,
      );
      for (const { o, d } of list) poly(o.p, tint(o.c, d), o.layer === 2);
    };
    drawTerrain(map.distance, 4100, 220);
    drawTerrain(map.ground, 1200, 93);
    drawTerrain(map.strips, 720, 24, true);
    const visibleItems = [];
    for (const o of map.items) {
      const radius =
        o.kind === "block"
          ? Math.max(o.w, o.d) * 0.7 + 3
          : o.kind === "beam"
            ? 12
            : 8;
      if (!visible(o.x, o.z, radius, o.kind === "block" ? 1000 : 540)) continue;
      const d = depth(o.x, o.y, o.z);
      if (
        o.kind === "block" &&
        d > 135 &&
        (Math.max(o.w, o.h, o.d) * f) / d < 2
      )
        continue;
      if (o.kind === "palm" && d > 1 && d < 132 && night < 0.8) {
        const sx = -o.h * 0.54,
          sz = o.h * 0.22,
          sy = groundHeight(o.x + sx, o.z + sz) + 0.32;
        const a = [o.x, o.y + 0.28, o.z],
          b = [o.x + sx, sy, o.z + sz],
          shade = "rgba(31,40,32," + 0.19 * (1 - night) + ")";
        line(a, b, shade, clamp((0.33 * f) / d, 0.6, 9));
        const sh = projected(...b);
        if (sh)
          for (let i = 0; i < 7; i++) {
            const ang = i * 2.399 + o.seed,
              cx = b[0] + Math.cos(ang) * 3.7,
              cz = b[2] + Math.sin(ang) * 3.7;
            poly(
              [
                b,
                [
                  b[0] + Math.cos(ang) * 2 - Math.sin(ang) * 0.4,
                  sy,
                  b[2] + Math.sin(ang) * 2 + Math.cos(ang) * 0.4,
                ],
                [cx, groundHeight(cx, cz) + 0.32, cz],
              ],
              shade,
            );
          }
      }
      visibleItems.push({ o, d });
    }
    traffic.forEach(({ mesh }, id) => {
      if (
        mesh &&
        mesh.visible !== false &&
        visible(mesh.position.x, mesh.position.z, 3, 550)
      )
        visibleItems.push({
          mesh,
          id,
          d: depth(mesh.position.x, mesh.position.y, mesh.position.z),
        });
    });
    if (waypoint)
      visibleItems.push({
        gate: true,
        d: depth(waypoint.x, groundHeight(waypoint.x, waypoint.z), waypoint.z),
      });
    for (const entry of parts) {
      const m = entry.mesh || entry;
      if (
        m.visible !== false &&
        m.position &&
        visible(m.position.x, m.position.z, 3, 245)
      )
        visibleItems.push({
          part: m,
          d: depth(m.position.x, m.position.y, m.position.z),
        });
    }
    visibleItems.sort((a, b) => b.d - a.d);
    for (const el of visibleItems) {
      if (el.o) item(el.o, el.d);
      else if (el.mesh) trafficCar(el.mesh, el.d, el.id);
      else if (el.gate) gate(waypoint);
      else if (el.part) {
        const pp = el.part.position,
          q = projected(pp.x, pp.y, pp.z);
        if (!q) continue;
        const s = clamp((f / Math.max(1, el.d)) * 0.59, 2, 42);
        ctx.strokeStyle = "#ffd189";
        ctx.lineWidth = Math.max(1, s * 0.26);
        ctx.beginPath();
        ctx.ellipse(
          ...q,
          s * (0.46 + 0.46 * Math.abs(Math.sin(clock))),
          s,
          clock * 0.4,
          0,
          T,
        );
        ctx.stroke();
      }
    }
    drawCar(p, index, mission);
  }
  return {
    render,
    dispose() {
      car.clear();
      ownWorld?.dispose();
    },
  };
}
