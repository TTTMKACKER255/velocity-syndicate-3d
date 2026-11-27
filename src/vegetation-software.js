// Project the polygonal forest from the actual driving camera. Screen tiles limit
// the z buffer's size; no plant silhouette is baked into an image or camera-facing card.
import { barkGrain, treeModel, treeScale, windAt } from "./vegetation.js";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pack = (r, g, b) =>
  (255 << 24) |
  (clamp(b, 0, 255) << 16) |
  (clamp(g, 0, 255) << 8) |
  clamp(r, 0, 255);
const TAU = Math.PI * 2;
export function createSoftwarePlants(ctx) {
  const tile = document.createElement("canvas"),
    W = 275,
    H = 320;
  tile.width = W;
  tile.height = H;
  const tc = tile.getContext("2d"),
    im = tc.createImageData(W, H),
    pixels = new Uint32Array(im.data.buffer),
    zb = new Float32Array(W * H);
  let arrays = [];
  function drawTree(tree, view, d, time, night, lighting) {
    if (!tree || d < -0.1) return;
    const { eye, ahead, right, up, f, w, h } = view,
      height = treeScale(tree) * (tree.kind === "palm" ? 12 : 10),
      screenHeight = (height * f) / Math.max(1, d);
    const lod = screenHeight > 185 ? 0 : screenHeight > 64 ? 1 : 2;
    const model = treeModel(tree.kind, tree.variant, lod),
      scale = treeScale(tree);
    const sin = Math.sin(tree.rotation),
      cos = Math.cos(tree.rotation),
      sa = Math.sin(tree.angle),
      ca = Math.cos(tree.angle);
    const axisX = tree.dz || 0,
      axisZ = -tree.dx || 0,
      base = tree.x * 0.057 + tree.z * 0.034,
      gust = windAt(time, base)[0];
    const sinWave = Math.sin(time * 3.7 + base),
      cosWave = Math.cos(time * 3.7 + base),
      sinSlow = Math.sin(time * 2.13 + base * 0.73),
      cosSlow = Math.cos(time * 2.13 + base * 0.73);
    const cloud = clamp((d - 75) / 980, 0, 0.73),
      lit = 1 - night * 0.71;
    const [lx, ly, lz] = lighting?.direction || [-0.48, 0.75, -0.4];
    let minX = w,
      maxX = 0,
      minY = h,
      maxY = 0;
    for (let part = 0; part < model.length; part++) {
      const g = model[part],
        p = g.attributes.position.array,
        flex = g.attributes.flex.array,
        N = g.attributes.normal.array,
        n = p.length / 3;
      if (!arrays[part] || arrays[part].length < n * 4)
        arrays[part] = new Float32Array(n * 4);
      const output = arrays[part];
      // Cache per-model oscillation phases, shared by all trees and instances.
      if (!g.userData.flutter) {
        const data = (g.userData.flutter = new Float32Array(n * 2));
        for (let i = 0; i < n; i++) {
          data[i * 2] = Math.sin(flex[i * 3 + 2]);
          data[i * 2 + 1] = Math.cos(flex[i * 3 + 2]);
        }
      }
      const phases = g.userData.flutter;
      for (let i = 0; i < n; i++) {
        const a = i * 3,
          at = i * 4,
          sp = phases[i * 2],
          cp = phases[i * 2 + 1],
          am = flex[a + 1],
          wave = sinWave * cp + cosWave * sp;
        const vx = p[a] + gust * flex[a] + 0.4 * am * wave,
          vy = (p[a + 1] + 0.22 * am * wave) * scale;
        const vz =
          p[a + 2] +
          0.48 * gust * flex[a] +
          0.49 * am * (cosSlow * cp - sinSlow * sp);
        let xx = (vx * cos + vz * sin) * scale,
          zz = (-vx * sin + vz * cos) * scale,
          yy = vy;
        if (tree.angle) {
          const dot = xx * axisX + zz * axisZ;
          const vecX = xx * ca - axisZ * vy * sa + axisX * dot * (1 - ca),
            vecZ = zz * ca + axisX * vy * sa + axisZ * dot * (1 - ca);
          yy = vy * ca + (axisZ * xx - axisX * zz) * sa;
          xx = vecX;
          zz = vecZ;
        }
        const x = tree.x + xx - eye.x,
          y = tree.y + yy - eye.y,
          z = tree.z + zz - eye.z,
          depth = x * ahead.x + y * ahead.y + z * ahead.z;
        if (depth < 0.2) {
          output[at + 2] = -1;
          continue;
        }
        const q = 1 / depth,
          px = w * 0.5 + f * (x * right.x + z * right.z) * q,
          py = h * 0.5 - f * (x * up.x + y * up.y + z * up.z) * q;
        output[at] = px;
        output[at + 1] = py;
        output[at + 2] = q;
        const nx = N[a] * cos + N[a + 2] * sin,
          nz = -N[a] * sin + N[a + 2] * cos,
          ny = N[a + 1];
        output[at + 3] =
          part === 0
            ? 0.55 + 0.42 * Math.max(0, nx * lx + ny * ly + nz * lz)
            : 0.59 +
              0.2 * Math.max(0, ny) +
              0.34 * Math.abs(nx * lx + ny * ly + nz * lz);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    maxX = Math.min(w, Math.ceil(maxX));
    maxY = Math.min(h, Math.ceil(maxY));
    if (maxX <= minX || maxY <= minY) return;
    const sw = maxX - minX,
      sh = maxY - minY,
      pixelScale = Math.min(1.35, W / sw, H / sh),
      tw = Math.max(1, Math.floor(sw * pixelScale)),
      th = Math.max(1, Math.floor(sh * pixelScale));
    for (let y = 0; y < th; y++) {
      pixels.fill(0, y * W, y * W + tw);
      zb.fill(-Infinity, y * W, y * W + tw);
    }
    for (let part = 0; part < model.length; part++) {
      const g = model[part],
        src = arrays[part],
        indices = g.index.array,
        C = g.userData.srgb,
        uv = g.attributes.uv.array,
        bark = part === 0 ? barkGrain(tree.kind) : null;
      const grain = Boolean(bark && screenHeight > 44);
      const mistR = (190 - 127 * night) * cloud,
        mistG = (199 - 128 * night) * cloud,
        mistB = (181 - 105 * night) * cloud;
      for (let i = 0; i < g.attributes.position.count; i++) {
        src[i * 4] = (src[i * 4] - minX) * pixelScale;
        src[i * 4 + 1] = (src[i * 4 + 1] - minY) * pixelScale;
      }
      for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i],
          ib = indices[i + 1],
          ic = indices[i + 2],
          a = ia * 4,
          b = ib * 4,
          c = ic * 4;
        if (src[a + 2] < 0 || src[b + 2] < 0 || src[c + 2] < 0) continue;
        const ax = src[a],
          ay = src[a + 1],
          bx = src[b],
          by = src[b + 1],
          cx = src[c],
          cy = src[c + 1],
          area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(area) < 0.045) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
          x1 = Math.min(tw - 1, Math.ceil(Math.max(ax, bx, cx))),
          y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))),
          y1 = Math.min(th - 1, Math.ceil(Math.max(ay, by, cy)));
        if (x0 > x1 || y0 > y1) continue;
        const inv = 1 / area,
          du = (by - cy) * inv,
          dv = (cy - ay) * inv,
          eu = (cx - bx) * inv,
          ev = (ax - cx) * inv;
        const shade =
            ((src[a + 3] + src[b + 3] + src[c + 3]) / 3) * lit * (1 - cloud),
          baseR = ((C[ia * 3] + C[ib * 3] + C[ic * 3]) / 3) * shade,
          baseG = ((C[ia * 3 + 1] + C[ib * 3 + 1] + C[ic * 3 + 1]) / 3) * shade,
          baseB = ((C[ia * 3 + 2] + C[ib * 3 + 2] + C[ic * 3 + 2]) / 3) * shade;
        const col = pack(baseR + mistR, baseG + mistG, baseB + mistB);
        for (let yy = y0; yy <= y1; yy++) {
          let u = (x0 + 0.5 - cx) * du + (yy + 0.5 - cy) * eu,
            v = (x0 + 0.5 - cx) * dv + (yy + 0.5 - cy) * ev,
            at = yy * W + x0;
          for (let xx = x0; xx <= x1; xx++, at++, u += du, v += dv) {
            const wc = 1 - u - v;
            if (u < 0 || v < 0 || wc < 0) continue;
            const q = u * src[a + 2] + v * src[b + 2] + wc * src[c + 2];
            if (q <= zb[at]) continue;
            zb[at] = q;
            if (grain) {
              const texU = u * uv[ia * 2] + v * uv[ib * 2] + wc * uv[ic * 2],
                texV =
                  u * uv[ia * 2 + 1] + v * uv[ib * 2 + 1] + wc * uv[ic * 2 + 1];
              const j =
                4 *
                ((Math.floor(texV * bark.h) & (bark.h - 1)) * bark.w +
                  (Math.floor(texU * bark.w) & (bark.w - 1)));
              pixels[at] = pack(
                (baseR * bark.bytes[j]) / 246 + mistR,
                (baseG * bark.bytes[j + 1]) / 246 + mistG,
                (baseB * bark.bytes[j + 2]) / 246 + mistB,
              );
            } else pixels[at] = col;
          }
        }
      }
    }
    tc.putImageData(im, 0, 0, 0, 0, tw, th);
    ctx.drawImage(tile, 0, 0, tw, th, minX, minY, sw, sh);
  }
  // Render rooted, rising and curving 3D blades in four colour groups. Clumps are
  // deterministic and use fewer stems for the more distant meadow bands.
  function drawGroundcover(vegetation, view, time, night) {
    if (!vegetation) return;
    const { eye, ahead, right, up, w, h, f } = view,
      paths = [[], [], [], []],
      bases = [0x586c36, 0x75894a, 0x948e50, 0x7e8d4c];
    function project(x, y, z) {
      x -= eye.x;
      y -= eye.y;
      z -= eye.z;
      const d = x * ahead.x + y * ahead.y + z * ahead.z;
      if (d < 0.7) return null;
      return [
        w * 0.5 + (f * (x * right.x + z * right.z)) / d,
        h * 0.5 - (f * (x * up.x + y * up.y + z * up.z)) / d,
      ];
    }
    for (const t of vegetation.grass) {
      const dx = t.x - eye.x,
        dz = t.z - eye.z,
        d = dx * ahead.x + dz * ahead.z;
      if (
        d < 1 ||
        d > 123 ||
        Math.abs(dx * right.x + dz * right.z) > ((d * w) / f) * 0.55 + 2
      )
        continue;
      const count = d < 20 ? 22 : d < 46 ? 9 : d < 76 ? 5 : 3,
        phase = t.seed + time * 1.5,
        gust = Math.sin(phase) * 0.15;
      for (let j = 0; j < count; j++) {
        const a = j * 2.39996 + t.spin,
          r = Math.sqrt((j + 0.4) / count) * t.span,
          ca = Math.cos(a),
          sa = Math.sin(a),
          x = t.x + ca * r,
          z = t.z + sa * r;
        const hh =
            (0.22 + 0.3 * (0.5 + 0.5 * Math.cos(j * 3.12 + t.seed))) * t.sy,
          p = project(x, t.y, z),
          tip = project(
            x + ca * hh * 0.55 + gust * hh,
            t.y + hh,
            z + sa * hh * 0.55 + gust * hh * 0.4,
          );
        if (
          !p ||
          !tip ||
          Math.max(p[0], tip[0]) < 0 ||
          Math.min(p[0], tip[0]) > w ||
          Math.min(p[1], tip[1]) > h
        )
          continue;
        const wid = Math.min(3.6, Math.max(0.55, (0.054 * f * t.span) / d)),
          k = (j + Math.floor(t.seed)) % 4;
        paths[k].push(p[0] - wid, p[1], p[0] + wid, p[1], tip[0], tip[1]);
      }
    }
    for (let i = 0; i < 4; i++) {
      const path = paths[i];
      if (!path.length) continue;
      const color = bases[i],
        lit = 1 - night * 0.7;
      ctx.fillStyle =
        "rgb(" +
        Math.round((color >> 16) * lit) +
        "," +
        Math.round(((color >> 8) & 255) * lit) +
        "," +
        Math.round((color & 255) * lit) +
        ")";
      ctx.beginPath();
      for (let k = 0; k < path.length; k += 6) {
        ctx.moveTo(path[k], path[k + 1]);
        ctx.lineTo(path[k + 2], path[k + 3]);
        ctx.lineTo(path[k + 4], path[k + 5]);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  return { drawTree, drawGroundcover };
}
