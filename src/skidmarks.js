import * as THREE from "three";

// Dimensions match the mounted rear wheels in models/vehicle.js. Both tread
// footprints use the model's local +Z rear axle and its +X right-hand side.
const bodyScale = {
  coupe: [1, 1], wagon: [0.98, 1.08], sport: [0.99, 1.03],
  gt: [1.01, 1.07], muscle: [1.045, 1.1], tuner: [0.98, 0.99], hyper: [1.11, 1.04],
};
const CAPACITY = 1536; // Individual tire segments, reused oldest first.
const SPACING = 0.48;
const SURFACE_OFFSET = 0.024;
const TREAD_WIDTHS = [-1, -0.73, 0.73, 1];
const TREAD_ALPHAS = [0.12, 0.77, 0.77, 0.12];
const VERTICES = 2 * TREAD_WIDTHS.length;
const INDICES = 6 * (TREAD_WIDTHS.length - 1);
const clamp = THREE.MathUtils.clamp;
const rgb = new THREE.Color("#1b1a18");
const inks = Array.from({ length: 32 }, (_, i) => `rgba(27,26,24,${((i + 1) / 32).toFixed(3)})`);

function allocateMesh(positions) {
  const colors = new Uint8Array(CAPACITY * VERTICES * 4);
  const indices = new Uint16Array(CAPACITY * INDICES);
  for (let slot = 0; slot < CAPACITY; slot++) {
    for (let band = 0; band < TREAD_WIDTHS.length - 1; band++) {
      const a = slot * VERTICES + band, b = a + TREAD_WIDTHS.length;
      indices.set([a, b, a + 1, a + 1, b, b + 1], slot * INDICES + band * 6);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4, true).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicMaterial({
    color: rgb, vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  material.forceSinglePass = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Rear tire marks";
  mesh.renderOrder = 1;
  // A ring buffer spans the world. Disable bounds calculated from one historic
  // buffer state, since subsequent writes may be in another district.
  mesh.frustumCulled = false;
  return mesh;
}

// Keep update ranges bounded even if a suspended renderer has accumulated more
// than one complete turn of the ring.
function dirtyRange(attribute, start, count) {
  const last = attribute.updateRanges.at(-1);
  if (last && last.start + last.count === start) last.count += count;
  else if (attribute.updateRanges.length >= 2) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, attribute.array.length);
  } else if (!last || start < last.start || start + count > last.start + last.count) {
    attribute.addUpdateRange(start, count);
  }
  attribute.needsUpdate = true;
}

export class DriftMarks {
  constructor(scene, surfaceAt, look = {}) {
    const [width, length] = bodyScale[look.body] || bodyScale.coupe;
    this.halfTrack = (0.876 + (look.widebody ? 0.018 : 0)) * width;
    this.axle = 1.335 * length;
    this.halfTread = 0.120 * width;
    this.surfaceAt = surfaceAt;
    this.positions = new Float32Array(CAPACITY * VERTICES * 3);
    this.ink = new Uint8Array(CAPACITY);
    this.mesh = scene ? allocateMesh(this.positions) : null;
    if (this.mesh) scene.add(this.mesh);
    this.count = 0;
    this.cursor = 0;
    this.disposed = false;
    this.breakTrail();
  }

  breakTrail() {
    this.previous = null;
    this.tires = [{ anchor: null, carry: 0 }, { anchor: null, carry: 0 }];
  }

  // Sample both edges independently so a banked road, ramp or flyover remains
  // under the entire tread. The car's height selects its active road level.
  contact(pose, side) {
    const { x, y, z, heading, slip } = pose;
    const lateral = side * this.halfTrack;
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const cx = x + this.axle * sin + lateral * cos;
    const cz = z + this.axle * cos - lateral * sin;
    const edge = (offset) => {
      const ex = cx + cos * offset, ez = cz - sin * offset;
      const ground = this.surfaceAt(ex, ez, y);
      if (!ground?.road || !Number.isFinite(ground.height) || Math.abs(ground.height - y) > 0.98) return null;
      return [ex, ground.height + SURFACE_OFFSET, ez];
    };
    const left = edge(-this.halfTread), right = edge(this.halfTread);
    if (!left || !right || Math.abs(left[1] - right[1]) > 0.20) return null;
    // Most of the deposited rubber occupies the central band. Load transfer
    // increases opacity on the outside tire during sustained cornering.
    const load = clamp(0.83 + 0.08 * side * pose.yaw, 0.7, 1.08);
    return { left, right, pressure: clamp((0.24 + slip * 0.046) * load, 0.17, 0.96) };
  }

  append(a, b) {
    const slot = this.cursor;
    this.cursor = (slot + 1) % CAPACITY;
    this.count = Math.min(CAPACITY, this.count + 1);
    this.ink[slot] = clamp(Math.round(32 * (a.pressure + b.pressure) * 0.5 * 0.65) - 1, 0, inks.length - 1);
    const geometry = this.mesh?.geometry;
    const color = geometry?.getAttribute("color");
    let vertex = slot * VERTICES;
    for (const point of [a, b]) {
      for (let band = 0; band < TREAD_WIDTHS.length; band++, vertex++) {
        const t = (1 + TREAD_WIDTHS[band]) * 0.5;
        for (let axis = 0; axis < 3; axis++)
          this.positions[3 * vertex + axis] = point.left[axis] + (point.right[axis] - point.left[axis]) * t;
        if (color) {
          const index = 4 * vertex;
          color.array[index] = color.array[index + 1] = color.array[index + 2] = 255;
          color.array[index + 3] = Math.round(255 * point.pressure * TREAD_ALPHAS[band]);
        }
      }
    }
    if (geometry) {
      dirtyRange(geometry.getAttribute("position"), slot * VERTICES * 3, VERTICES * 3);
      dirtyRange(color, slot * VERTICES * 4, VERTICES * 4);
      geometry.setDrawRange(0, this.count * INDICES);
    }
  }

  update(player) {
    if (this.disposed) return;
    const { x, y, z, heading, travel, speed } = player;
    const yaw = player.yawRate || 0;
    // Rear contact velocity is translation plus yaw-rate times rear overhang.
    // Turning a stationary steering wheel or holding drift with zero lateral
    // velocity produces no rubber.
    const slip = Math.abs(speed * Math.sin(heading - travel) + yaw * this.axle);
    if (player.airborne || !player.drift || Math.abs(speed) < 8 || !(slip > 1.65) ||
        !Number.isFinite(x + y + z + heading + travel)) {
      if (this.previous) this.breakTrail();
      return;
    }
    const center = this.surfaceAt(x, z, y);
    if (!center?.road || Math.abs(center.height - y) > 0.80) {
      if (this.previous) this.breakTrail();
      return;
    }
    const pose = { x, y, z, heading, slip, yaw };
    let old = this.previous;
    if (old) {
      const gap = Math.hypot(x - old.x, z - old.z);
      const turn = Math.atan2(Math.sin(heading - old.heading), Math.cos(heading - old.heading));
      if (gap > 2.4 || Math.abs(y - old.y) > 1.05 || Math.abs(turn) > 0.28) {
        this.breakTrail();
        old = null;
      }
    }
    this.previous = pose;
    const arc = old ? Math.atan2(Math.sin(heading - old.heading), Math.cos(heading - old.heading)) : 0;
    for (let i = 0; i < 2; i++) {
      const side = 2 * i - 1, tire = this.tires[i];
      const end = this.contact(pose, side);
      if (!end || !old || !tire.anchor) {
        tire.anchor = end;
        tire.carry = 0;
        continue;
      }
      // Each rear wheel travels a different distance around a corner. Sampling
      // by its own path length makes density independent of speed and yaw rate.
      const lateral = side * this.halfTrack;
      const wheelX = (p) => p.x + this.axle * Math.sin(p.heading) + lateral * Math.cos(p.heading);
      const wheelZ = (p) => p.z + this.axle * Math.cos(p.heading) - lateral * Math.sin(p.heading);
      const distance = Math.hypot(wheelX(pose) - wheelX(old), wheelZ(pose) - wheelZ(old));
      if (distance < 1e-7) continue;
      let next = SPACING - tire.carry;
      let interrupted = false;
      for (; next <= distance + 1e-9; next += SPACING) {
        const t = Math.min(1, next / distance);
        const point = t === 1 ? end : this.contact({
          x: old.x + (x - old.x) * t, y: old.y + (y - old.y) * t, z: old.z + (z - old.z) * t,
          heading: old.heading + arc * t, slip: old.slip + (slip - old.slip) * t, yaw: old.yaw + (yaw - old.yaw) * t,
        }, side);
        if (!point || Math.abs(point.left[1] - tire.anchor.left[1]) > 0.39) {
          interrupted = true;
          break;
        }
        this.append(tire.anchor, point);
        tire.anchor = point;
      }
      if (interrupted) {
        tire.anchor = end;
        tire.carry = 0;
      } else tire.carry = Math.max(0, distance + SPACING - next);
    }
  }

  drawSoftware(poly, player) {
    if (this.disposed) return;
    const points = this.positions;
    for (let i = 0; i < this.count; i++) {
      const slot = (this.cursor - this.count + i + CAPACITY) % CAPACITY;
      const base = slot * VERTICES * 3;
      const dx = points[base] - player.x, dz = points[base + 2] - player.z;
      if (dx * dx + dz * dz > 160 * 160) continue;
      // Coplanar asphalt is drawn first by the painter. At crossings, avoid
      // projecting a hidden strip on the wrong level of a nearby flyover.
      if (Math.abs(player.y - points[base + 1]) > 1.2) {
        const level = this.surfaceAt(points[base], points[base + 2], player.y)?.height;
        if (Number.isFinite(level) && Math.abs(level - points[base + 1]) > 1.15) continue;
      }
      const point = (vertex) => {
        const j = base + 3 * vertex;
        return [points[j], points[j + 1], points[j + 2]];
      };
      poly([point(0), point(3), point(7), point(4)], inks[this.ink[slot]]);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
    this.breakTrail();
    this.count = 0;
    this.positions = null;
    this.ink = null;
    this.mesh = null;
  }
}
