// UV0 carries road-wide tyre paths and weathering. UV1 is measured in metres
// so the aggregate, binder and their lighting keep their scale on every road.
import * as THREE from "three";
import { textureFor } from "./environment-materials.js";

export function roadMaterial() {
  const chip = textureFor("roadChip");
  const normal = textureFor("roadNormal");
  const roughness = textureFor("roadRoughness");
  for (const texture of [normal, roughness]) {
    texture.colorSpace = THREE.NoColorSpace;
    texture.channel = 1;
  }
  const material = new THREE.MeshStandardMaterial({
    map: textureFor("asphalt"),
    normalMap: normal,
    normalScale: new THREE.Vector2(0.67, 0.67),
    roughnessMap: roughness,
    vertexColors: true,
    roughness: 1,
    metalness: 0.015,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (s) => {
    s.uniforms.roadChip = { value: chip };
    s.fragmentShader = "uniform sampler2D roadChip;\n" + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float fleck = texture2D(roadChip,vNormalMapUv).r;
      diffuseColor.rgb *= clamp(0.6+fleck*5.6,0.71,1.65);
    `,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      // Pockets of moisture sit in the wheel runs and cured binder.
      float wheelRun=pow(abs(sin(vMapUv.x*25.13)),7.);
      float damp=smoothstep(.25,.72,.51+.24*sin(vMapUv.y*7.1+vMapUv.x*6.0)+.17*cos(vMapUv.y*16.2));
      roughnessFactor=clamp(roughnessFactor-.33*wheelRun*damp,.31,1.);
    `,
    );
  };
  material.addEventListener("dispose", () => {
    chip.dispose();
    normal.dispose();
    roughness.dispose();
  });
  return material;
}

export function paintMaterial() {
  return new THREE.MeshStandardMaterial({
    map: textureFor("roadIvory"),
    vertexColors: true,
    alphaTest: 0.46,
    roughness: 0.71,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

// A single batched atlas stores service covers, slotted drains, rolled patches
// and tar seams. Detail vertices are interpolated on each rendered road triangle.
export function roadDetails() {
  const positions = [],
    uvs = [],
    colors = [],
    indices = [];
  const salts = [0.16, 0.84, 0.55, 0.31];
  function emit(corners, kind, lateral, span, width, t, length, segmentLength) {
    const u0 = lateral - span / width / 2,
      u1 = lateral + span / width / 2;
    const t0 = t - length / segmentLength / 2,
      t1 = t + length / segmentLength / 2;
    // Tessellated road quads have a diagonal from the start-left to end-right.
    const at = (u, v) => {
      const [a, b, c, d] = corners;
      const tri = u >= v ? [a, b, c] : [a, c, d];
      const w = u >= v ? [1 - u, u - v, v] : [1 - v, u, v - u];
      return [0, 1, 2].map(
        (j) =>
          tri[0][j] * w[0] +
          tri[1][j] * w[1] +
          tri[2][j] * w[2] +
          (j === 1 ? 0.012 : 0),
      );
    };
    const start = positions.length / 3;
    positions.push(...at(u0, t0), ...at(u1, t0), ...at(u1, t1), ...at(u0, t1));
    const col = kind % 2,
      row = Math.floor(kind / 2);
    const l = col / 2 + 0.001,
      r = (col + 1) / 2 - 0.001,
      top = 1 - row / 2 - 0.001,
      bottom = 1 - (row + 1) / 2 + 0.001;
    uvs.push(l, bottom, r, bottom, r, top, l, top);
    for (let i = 0; i < 4; i++) colors.push(1, 1, 1);
    indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  }
  function populate(corners, index, distance, segmentLength, width) {
    if (segmentLength < 4.9) return;
    const section = Math.round(distance / 5.2);
    const hash = (n) => {
      const v = Math.sin(n * 57.17 + index * 36.31 + 3.1) * 41738.51;
      return v - Math.floor(v);
    };
    const urban = index !== 1 && index !== 11 && index !== 12;
    if (urban && (section + index * 11) % 19 === 2) {
      emit(
        corners,
        1,
        (section + index) % 2 ? 0.96 : 0.04,
        0.56,
        width,
        0.49,
        0.89,
        segmentLength,
      );
    }
    if (urban && (section + index * 7) % 31 === 4) {
      emit(
        corners,
        0,
        0.26 + 0.46 * hash(section),
        0.94,
        width,
        0.5,
        0.94,
        segmentLength,
      );
    }
    if ((section + index * 3) % 17 === 3) {
      const r = hash(section + 7),
        s = hash(section + 4);
      emit(
        corners,
        2,
        0.25 + 0.49 * s,
        1.3 + 2.7 * r,
        width,
        0.5,
        2.2 + 2.5 * s,
        segmentLength,
      );
    }
    if ((section + index * 9) % 9 === 5 && index !== 12) {
      emit(
        corners,
        3,
        0.13 + 0.73 * hash(section + 3),
        0.6 + salts[index % 4],
        width,
        0.5,
        3.5 + hash(section),
        segmentLength,
      );
    }
  }
  function finish() {
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      map: textureFor("roadWorks"),
      alphaTest: 0.33,
      roughness: 0.74,
      metalness: 0.13,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = "Road service details";
    mesh.receiveShadow = true;
    return mesh;
  }
  return { populate, finish };
}

// Cache directional relief for the software renderer. One byte per texel avoids
// decoding a normal and taking a dot product for every road pixel every frame.
export function softwareAggregate(appearance) {
  const slices = new Map();
  let albedo, normals, size;
  return (worldRight, solar) => {
    if (!albedo) {
      const diffuse = appearance("roadChip", 10, 160)?.image;
      const normal = appearance("roadNormal", 10, 160)?.image;
      if (!diffuse || !normal) return null;
      size = diffuse.width;
      const pixels = (image) =>
        image.getContext("2d").getImageData(0, 0, size, size).data;
      albedo = pixels(diffuse);
      normals = pixels(normal);
    }
    const [sx, sy, sz] = solar.direction;
    const [rx, rz] = worldRight;
    const azimuth = Math.atan2(sx * rz - sz * rx, sx * rx + sz * rz);
    const sector = ((Math.round((azimuth * 4) / Math.PI) % 8) + 8) % 8;
    const elevation = sy > 0.46 ? 1 : 0;
    const key = sector * 2 + elevation;
    if (!slices.has(key)) {
      const values = new Int8Array(size * size);
      const angle = (sector * Math.PI) / 4,
        contrast = elevation ? 0.24 : 0.48;
      const dx = Math.cos(angle) * contrast,
        dy = Math.sin(angle) * contrast;
      for (let i = 0; i < values.length; i++) {
        const k = 4 * i,
          relief = (normals[k] - 128) * dx + (normals[k + 1] - 128) * dy;
        values[i] = Math.max(-70, Math.min(70, albedo[k] - 81 + relief));
      }
      slices.set(key, { values, size });
    }
    return slices.get(key);
  };
}
