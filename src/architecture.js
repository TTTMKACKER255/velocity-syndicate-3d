import * as THREE from "three";

// Transparent elevations and their opaque interiors share the same world-space
// records. In the Canvas renderer each pane participates in the street's depth
// ordering individually, so a distant mullion passes behind a near worker.
const tone = {
  metal: 0x34464a,
  edge: 0x8c9996,
  wall: 0xe1d8c7,
  floor: 0xb3a797,
  wood: 0xa67e54,
  dark: 0x484643,
  lamp: 0xffe1ab,
  denim: 0x414e58,
};
const clothes = [0x8b5949, 0x516e67, 0x476477, 0xc49352, 0x7c687d, 0x524c59];
const skins = [0xc19272, 0x96674b, 0xd3a384, 0x795542];
const unitBox = new THREE.BoxGeometry();
const unitEgg = new THREE.SphereGeometry(0.5, 9, 7);
const unitPane = new THREE.PlaneGeometry();
const up = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3(),
  v2 = new THREE.Vector3(),
  scale = new THREE.Vector3();
const q = new THREE.Quaternion(),
  mat = new THREE.Matrix4(),
  color = new THREE.Color();
const identity = new THREE.Quaternion();
const kindIndex = { block: 0, oval: 1, pane: 2, light: 3 };
const validKind = (kind) =>
  ["cafe", "workshop", "depot", "gallery", "lobby", "office", "home"].includes(
    kind,
  );

function makeRoom({
  x,
  y,
  z,
  w,
  d,
  h,
  kind = "lobby",
  seed = 0,
  upper = false,
}) {
  const room = {
    x,
    y,
    z,
    w,
    d,
    h,
    kind: validKind(kind) ? kind : "lobby",
    seed,
    upper,
    props: [],
    people: [],
  };
  const add = (type, lx, ly, lz, sw, sh, sd, c, range = 235) => {
    room.props.push({
      type,
      x: x + lx,
      y: y + ly,
      z: z + lz,
      w: sw,
      h: sh,
      d: sd,
      c,
      range,
    });
  };
  const box = (a, b, c, xw, yh, zd, t, r) =>
    add("block", a, b, c, xw, yh, zd, t, r);
  const light = (a, b, c, xw, yh, zd) =>
    add("light", a, b, c, xw, yh, zd, tone.lamp, 110);
  const egg = (a, b, c, xw, yh, zd, t, r = 115) =>
    add("oval", a, b, c, xw, yh, zd, t, r);
  const hw = w * 0.5,
    hd = d * 0.5,
    base = 0.19,
    head = h - 0.27;
  box(0, 0.125, 0, w, 0.25, d, upper ? 0x9c9385 : tone.floor, 510);
  box(
    0,
    h - 0.115,
    0,
    w + 0.1,
    0.23,
    d + 0.1,
    upper ? 0xbbafa0 : tone.wall,
    510,
  );
  // Individual corner posts and deep sill/head channels form recessed reveals.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      box(
        sx * (hw - 0.145),
        h * 0.5,
        sz * (hd - 0.145),
        0.29,
        h,
        0.29,
        tone.edge,
        450,
      );
  for (const axis of ["x", "z"])
    for (const side of [-1, 1]) {
      const along = axis === "x" ? d : w,
        bays = Math.max(2, Math.round(along / (upper ? 4.7 : 4.1)));
      const horizontal =
        axis === "x" ? [0.27, 0.12, along] : [along, 0.12, 0.27];
      const edge = side * ((axis === "x" ? hw : hd) - 0.15);
      const put = (p, ly, sw, sh, sd, c, range) => {
        if (axis === "x") box(edge, ly, p, sw, sh, sd, c, range);
        else box(p, ly, edge, sw, sh, sd, c, range);
      };
      put(0, 0.255, ...horizontal, tone.metal, 397);
      put(0, head, ...horizontal, tone.metal, 397);
      // Each elevation is glazed on a single thin plane without an opaque
      // backing. Furniture, people and the entire far elevation remain visible.
      const glassPlane = {
        type: "pane",
        x: x + (axis === "x" ? edge : 0),
        y: y + (head + base) * 0.5,
        z: z + (axis === "z" ? edge : 0),
        w: axis === "x" ? 0 : along - 0.44,
        h: head - base,
        d: axis === "x" ? along - 0.44 : 0,
        c: 0x8db8bb,
        range: 370,
      };
      // Short spans also order correctly against chairs and passers-by when
      // viewed down the façade at a grazing angle in the painter.
      for (let j = 0; j < bays; j++) {
        const span = (along - 0.44) / bays,
          alongCenter = span * (j + 0.5 - bays * 0.5);
        room.props.push({
          ...glassPlane,
          x: glassPlane.x + (axis === "z" ? alongCenter : 0),
          z: glassPlane.z + (axis === "x" ? alongCenter : 0),
          w: axis === "z" ? span : 0,
          d: axis === "x" ? span : 0,
        });
      }
      for (let j = 1; j < bays; j++) {
        const offset = along * (j / bays - 0.5);
        put(
          offset,
          (head + base) * 0.5,
          axis === "x" ? 0.17 : 0.09,
          head - base,
          axis === "x" ? 0.09 : 0.17,
          tone.metal,
          242,
        );
      }
      // A high transom catches a separate line of highlights in moving views.
      put(
        0,
        head - 0.52,
        axis === "x" ? 0.12 : along - 0.44,
        0.047,
        axis === "x" ? along - 0.44 : 0.12,
        tone.edge,
        150,
      );
    }
  if (!upper) {
    // The automatic entry is a pair of narrower panes with separate stiles,
    // rails and pull handles on the street-facing (+X) elevation.
    for (const side of [-1, 1]) {
      box(
        hw - 0.07,
        (head + base) * 0.5,
        side * 0.99,
        0.1,
        head - base,
        0.071,
        tone.edge,
        125,
      );
      box(hw + 0.015, 1.18, side * 0.18, 0.045, 0.54, 0.034, tone.edge, 65);
    }
    box(hw - 0.05, 2.46, 0, 0.18, 0.14, 2.08, tone.edge, 140);
  }
  const desk = (lx, lz, length = 2.15, standing = false) => {
    const top = standing ? 0.97 : 0.77;
    box(lx, top, lz, 0.88, 0.095, length, tone.wood);
    for (const s of [-1, 1])
      box(
        lx,
        top / 2,
        lz + s * (length * 0.43),
        0.64,
        top,
        0.085,
        tone.dark,
        140,
      );
    box(lx + 0.05, top + 0.31, lz, 0.055, 0.35, 0.62, 0x364245, 110);
    box(lx + 0.085, top + 0.31, lz, 0.014, 0.28, 0.52, 0x8bb0ad, 100);
    box(lx, top + 0.089, lz, 0.19, 0.055, 0.29, tone.metal, 80);
  };
  const chair = (lx, lz, side = 1) => {
    box(lx, 0.55, lz, 0.51, 0.14, 0.56, 0x776352, 122);
    box(lx + side * 0.224, 0.83, lz, 0.075, 0.5, 0.54, 0x9a8069, 122);
    box(lx, 0.3, lz, 0.11, 0.46, 0.12, tone.metal, 93);
    box(lx, 0.089, lz, 0.38, 0.06, 0.45, tone.dark, 72);
  };
  const plant = (lx, lz) => {
    box(lx, 0.46, lz, 0.61, 0.55, 0.62, 0xb7a58a, 105);
    box(lx, 0.89, lz, 0.06, 0.6, 0.06, 0x67573f, 86);
    egg(lx, 1.16, lz, 0.65, 0.91, 0.6, 0x667b50);
    egg(lx + 0.13, 1.41, lz - 0.07, 0.47, 0.61, 0.46, 0x7e8d66);
  };
  const actor = (lx, lz, job, index, range = 1.05) => {
    room.people.push({
      x: x + lx,
      y: y + base,
      z: z + lz,
      job,
      range,
      phase: seed * 0.593 + index * 2.716,
      shirt: clothes[(seed + index * 2) % clothes.length],
      skin: skins[(seed + index) % skins.length],
      hair: index % 2 ? 0x463b34 : 0x372c28,
    });
  };
  const aisle = Math.min(hw - 0.97, hw * 0.68),
    frontRow = hd * 0.48;
  for (const s of [-1, 1]) {
    light(s * hw * 0.38, h - 0.255, 0, 0.2, 0.035, Math.min(5.6, d * 0.39));
    box(
      s * hw * 0.38,
      h - 0.224,
      0,
      0.29,
      0.065,
      Math.min(5.72, d * 0.4),
      tone.edge,
      110,
    );
  }
  if (room.kind === "workshop" || room.kind === "depot") {
    const bench = aisle;
    box(bench, 0.99, frontRow, 1.04, 0.14, 3.45, 0xa8a5a0);
    box(bench, 0.57, frontRow, 0.81, 0.73, 3.2, 0x5a7073);
    for (let i = -1; i <= 1; i++)
      box(
        bench + 0.415,
        0.65,
        frontRow + i * 0.91,
        0.035,
        0.026,
        0.57,
        0xbfc2bb,
        78,
      );
    for (let i = 0; i < 3; i++)
      box(
        bench + 0.04,
        1.13,
        frontRow - 0.81 + i * 0.34,
        0.39,
        0.13,
        0.21,
        i === 1 ? 0xc06739 : 0x58655f,
        75,
      );
    for (const sx of [-1, 1]) {
      box(-aisle + sx * 0.8, 1.85, -frontRow, 0.085, 3.35, 0.1, 0x5e6460);
      box(
        -aisle + sx * 0.8,
        1.85,
        -frontRow + 1.99,
        0.085,
        3.35,
        0.1,
        0x5e6460,
      );
    }
    for (let i = 1; i <= 3; i++) {
      box(-aisle, i * 0.87, -frontRow + 0.99, 1.72, 0.095, 2.12, 0x85857d);
      box(
        -aisle - 0.21,
        i * 0.87 + 0.24,
        -frontRow + 0.69,
        0.89,
        0.38,
        0.71,
        0xae8d69,
        115,
      );
    }
    actor(bench - 0.8, frontRow, "work", 0);
    actor(aisle, -frontRow * 0.62, "walk", 1, Math.min(2.7, d * 0.17));
  } else if (room.kind === "cafe") {
    box(-aisle, 0.71, -frontRow, 1.21, 1.04, Math.min(4.4, d * 0.4), 0xb28b67);
    box(
      -aisle,
      1.24,
      -frontRow,
      1.34,
      0.105,
      Math.min(4.5, d * 0.42),
      0xd9c6a9,
    );
    box(-aisle, 1.47, -frontRow, 0.49, 0.43, 0.71, 0x586365, 100);
    for (const s of [-1, 1]) {
      const lz = s * frontRow;
      box(aisle, 0.92, lz, 1.05, 0.075, 1.42, 0xa97c54, 185);
      box(aisle, 0.55, lz, 0.14, 0.72, 0.14, tone.dark, 105);
      chair(aisle - 0.59, lz, -1);
      chair(aisle + 0.59, lz, 1);
    }
    actor(-aisle + 0.78, -frontRow, "work", 0);
    actor(aisle, 0.18, "walk", 1, Math.min(2.6, d * 0.18));
    plant(-aisle, frontRow);
  } else {
    desk(aisle - 0.42, frontRow, 2.5);
    chair(aisle + 0.27, frontRow, 1);
    actor(aisle + 0.2, frontRow, "seated", 0);
    if (room.kind === "home") {
      box(-aisle, 0.54, -frontRow, 1.01, 0.54, 2.48, 0xae856f);
      box(-aisle - 0.47, 0.88, -frontRow, 0.155, 0.64, 2.46, 0x97745e);
      box(-aisle + 1.23, 0.47, -frontRow, 0.72, 0.08, 1.51, tone.wood);
    } else {
      desk(-aisle + 0.3, -frontRow, 2.7, true);
      actor(-aisle - 0.35, -frontRow, "work", 2);
    }
    plant(-aisle, frontRow);
    if (!upper)
      actor(aisle, -frontRow * 0.47, "walk", 1, Math.min(2.25, d * 0.14));
  }
  return room;
}

// Moving head, body, articulated forearms, hands and two independent legs. A
// mechanic reaches across a bench, a desk worker types, and a third person
// walks down the clear aisle. Poses are deterministic in both renderers.
function pose(person, time, out) {
  const { phase, job } = person,
    walk = job === "walk",
    sit = job === "seated",
    t = time + phase;
  const swing = walk ? Math.sin(t * 4.6) : 0,
    cycle = Math.sin(t * 0.37);
  const dx = walk ? 0.105 * Math.sin(t * 0.37) : 0,
    dz = walk ? person.range * cycle : 0;
  const x = person.x + dx,
    z = person.z + dz,
    floor = person.y;
  const direction = walk ? Math.tanh(5 * Math.cos(t * 0.37)) : 1;
  const base = sit ? -0.37 : walk ? 0.025 * Math.cos(t * 9.2) : 0;
  const ox = walk ? 0 : -0.06;
  const point = (px, py, pz) => [x + px, floor + py + base, z + pz];
  const oval = (p, w, h, d, c) =>
    out({ type: "oval", x: p[0], y: p[1], z: p[2], w, h, d, c });
  const limb = (a, b, r, c) =>
    out({
      type: "limb",
      a,
      b,
      w: r * 2,
      c,
      x: (a[0] + b[0]) * 0.5,
      y: (a[1] + b[1]) * 0.5,
      z: (a[2] + b[2]) * 0.5,
    });
  oval(point(ox, 1.17, 0), 0.39, 0.63, 0.32, person.shirt);
  oval(point(ox - 0.015, 1.68, 0.018), 0.255, 0.306, 0.247, person.skin);
  oval(point(ox - 0.011, 1.782, 0.002), 0.263, 0.132, 0.25, person.hair);
  for (const s of [-1, 1]) {
    const hip = point(s * 0.105, 0.91, 0),
      knee = point(
        s * 0.109,
        sit ? 0.66 : 0.51,
        sit ? -0.3 : direction * s * swing * 0.26,
      );
    const ankle = point(
      s * 0.106,
      sit ? 0.39 : 0.12,
      sit ? -0.32 : direction * s * swing * 0.43,
    );
    limb(hip, knee, 0.085, tone.denim);
    limb(knee, ankle, 0.066, 0x3a4750);
    oval(
      [ankle[0], ankle[1] - 0.027, ankle[2] - 0.048],
      0.155,
      0.11,
      0.253,
      0x3b3b36,
    );
    const shoulder = point(ox + s * 0.172, 1.39, 0);
    const elbow = walk
      ? point(s * 0.209, 1.11, -direction * s * swing * 0.18)
      : point(s * 0.204, 1.16, -0.11);
    const hand = walk
      ? point(s * 0.197, 0.93, -direction * s * swing * 0.27)
      : point(
          ox - 0.24 + 0.058 * Math.cos(t * 2.6 + s * 0.7),
          1.09 + 0.057 * Math.sin(t * 3 + s * 0.6),
          s * 0.153,
        );
    limb(shoulder, elbow, 0.069, person.shirt);
    limb(elbow, hand, 0.054, person.skin);
    oval(hand, 0.098, 0.119, 0.104, person.skin);
  }
}

function transformPart(part) {
  if (part.type === "limb") {
    v1.fromArray(part.a);
    v2.fromArray(part.b).sub(v1);
    const len = v2.length();
    q.setFromUnitVectors(up, v2.divideScalar(len || 1));
    v1.set(part.x, part.y, part.z);
    return mat.compose(v1, q, scale.set(part.w, len + part.w * 0.46, part.w));
  }
  v1.set(part.x, part.y, part.z);
  q.identity();
  if (part.type === "pane") {
    if (part.w === 0) q.setFromAxisAngle(up, Math.PI * 0.5);
    return mat.compose(v1, q, scale.set(part.w || part.d, part.h, 1));
  }
  return mat.compose(v1, identity, scale.set(part.w, part.h, part.d));
}

export function createArchitecture(root) {
  const rooms = [];
  const node = new THREE.Group();
  node.name = "Glazed working interiors";
  root.add(node);
  root.userData.rooms = rooms;
  let actorsMesh = null,
    actorCount = 0;
  const materials = [
    new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.09 }),
    new THREE.MeshStandardMaterial({ roughness: 0.67 }),
    new THREE.MeshStandardMaterial({
      color: 0xc3e4e4,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      metalness: 0.12,
      roughness: 0.2,
    }),
    new THREE.MeshBasicMaterial({ color: 0xffe6bc }),
  ];
  materials[2].forceSinglePass = true;
  function meshFor(parts, geometry, material, name, parent) {
    if (!parts.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = name;
    parts.forEach((part, i) => {
      mesh.setMatrixAt(i, transformPart(part));
      if (part.type !== "pane") mesh.setColorAt(i, color.setHex(part.c));
    });
    mesh.computeBoundingSphere();
    parent.add(mesh);
    return mesh;
  }
  function bake() {
    // City-sized batches would defeat culling at street level. Group adjacent
    // lots into 180 m cells, with separate opaque, emissive and glazing draws.
    const cells = new Map();
    for (const room of rooms) {
      const key = Math.round(room.x / 180) + "/" + Math.round(room.z / 180);
      if (!cells.has(key)) cells.set(key, [[], [], [], []]);
      const lists = cells.get(key);
      for (const part of room.props) lists[kindIndex[part.type]].push(part);
      actorCount += room.people.length;
    }
    const geometries = [
      unitBox.clone(),
      unitEgg.clone(),
      unitPane.clone(),
      unitBox.clone(),
    ];
    for (const [key, lists] of cells)
      lists.forEach((parts, i) => {
        const m = meshFor(
          parts,
          geometries[i],
          materials[i],
          "Storefront " + key,
          node,
        );
        if (m) {
          // The interior stays visible through glass. Only solid furnishings and
          // window frames cast shadows into the room.
          m.castShadow = i < 2;
          m.receiveShadow = i < 2;
          if (i === 2) m.renderOrder = 2;
        }
      });
    if (actorCount) {
      // Only shells near the driver need live figures. Slots are compacted at
      // each update, and empty, distant slots issue no draw or vertex work.
      actorsMesh = new THREE.InstancedMesh(
        unitEgg.clone(),
        materials[1],
        actorCount * 15,
      );
      actorsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      actorsMesh.count = 0;
      actorsMesh.name = "Working residents";
      actorsMesh.frustumCulled = false;
      node.add(actorsMesh);
    }
  }
  function update(time, viewer, darkness = 0) {
    // Warm bounced light in occupied interiors remains after the sun sets.
    for (const material of materials.slice(0, 2)) {
      material.emissive.setHex(0xffc890);
      material.emissiveIntensity = darkness * 0.067;
    }
    if (!actorsMesh) return;
    let i = 0;
    const focus = viewer || { x: 260, z: 260 };
    for (const room of rooms) {
      if ((room.x - focus.x) ** 2 + (room.z - focus.z) ** 2 > 125 ** 2)
        continue;
      for (const p of room.people)
        pose(p, time, (part) => {
          actorsMesh.setMatrixAt(i, transformPart(part));
          actorsMesh.setColorAt(i, color.setHex(part.c));
          i++;
        });
    }
    actorsMesh.count = i;
    actorsMesh.instanceMatrix.needsUpdate = true;
    if (actorsMesh.instanceColor) actorsMesh.instanceColor.needsUpdate = true;
  }
  return {
    add(spec) {
      const room = makeRoom(spec);
      rooms.push(room);
      return room;
    },
    bake,
    update,
    rooms,
  };
}

export function queueArchitecture(queue, rooms, view) {
  const { visible, depth, time } = view;
  for (const room of rooms || []) {
    if (!visible(room.x, room.z, Math.max(room.w, room.d) * 0.7, 510)) continue;
    const roomDepth = depth(room.x, room.y + room.h * 0.5, room.z);
    for (const part of room.props) {
      if (roomDepth > part.range) continue;
      const d = depth(part.x, part.y, part.z);
      if (d < -Math.max(part.w, part.d, part.h) * 0.6) continue;
      queue.push({ interior: part, d });
    }
    if (roomDepth < 98)
      for (const person of room.people)
        pose(person, time, (part) => {
          queue.push({ interior: part, d: depth(part.x, part.y, part.z) });
        });
  }
}

export function paintArchitecture(part, d, view) {
  const { ctx, block, poly, projected, tint, line, f, night } = view;
  if (part.type === "pane") {
    const { x, y, z, w, h, d: span } = part,
      hw = w * 0.5,
      hd = span * 0.5,
      hh = h * 0.5;
    poly(
      [
        [x - hw, y - hh, z - hd],
        [x + hw, y - hh, z + hd],
        [x + hw, y + hh, z + hd],
        [x - hw, y + hh, z - hd],
      ],
      "rgba(130,182,189," + (0.105 + night * 0.05) + ")",
    );
    return;
  }
  if (part.type === "limb") {
    line(
      part.a,
      part.b,
      tint(part.c, d, 1.02, 0.41),
      Math.max(0.6, (part.w * f) / Math.max(d, 0.2)),
    );
    return;
  }
  if (part.type === "oval") {
    const screen = projected(part.x, part.y, part.z);
    if (!screen) return;
    const px = f / Math.max(1, d);
    ctx.fillStyle = tint(part.c, d, 1.0, 0.41);
    ctx.beginPath();
    ctx.ellipse(
      screen[0],
      screen[1],
      Math.max(0.42, Math.max(part.w, part.d) * px * 0.49),
      Math.max(0.42, part.h * px * 0.49),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    return;
  }
  block({ ...part, a: 0, glow: part.type === "light" ? 1.4 : 0.32 }, d);
}
