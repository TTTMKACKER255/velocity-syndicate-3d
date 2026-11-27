// Horizontal rigid bodies use the same heading convention as the driveline: the nose faces -Z.
import { angleDelta, clamp, damp } from "./physics.js";

export function trafficBody(target, mass = 1480, shape = {}) {
  return {
    ...target,
    vx: 0,
    vz: 0,
    spin: 0,
    mass,
    halfWidth: shape.halfWidth ?? 0.94,
    halfLength: shape.halfLength ?? 2.22,
    displaced: false,
    skidTime: 0,
    touching: false,
    target,
  };
}

export function lanePose(point, lane = 3.1, direction = 1) {
  const heading = point.heading + (direction < 0 ? Math.PI : 0);
  return {
    x: point.x + Math.cos(heading) * lane,
    z: point.z - Math.sin(heading) * lane,
    y: point.height + 0.07,
    heading,
  };
}

// The same follower accepts a road station or a pursuit target. After an impact,
// the body first slides freely, then steers back with bounded acceleration.
export function advanceTraffic(body, target, surface, dt) {
  const old = body.target;
  let tx = (target.x - old.x) / dt,
    tz = (target.z - old.z) / dt;
  const limit = Math.max(1, Math.hypot(tx, tz) / 55);
  tx /= limit;
  tz /= limit;
  body.target = target;
  if (!body.displaced) {
    Object.assign(body, target, { vx: tx, vz: tz });
    return;
  }
  body.skidTime = Math.max(0, body.skidTime - dt);
  if (body.skidTime > 0) {
    const drag = Math.exp(-1.15 * dt);
    body.vx *= drag;
    body.vz *= drag;
    body.spin *= Math.exp(-2.6 * dt);
  } else {
    const ax = (target.x - body.x) * 2.2 + (tx - body.vx) * 2.8;
    const az = (target.z - body.z) * 2.2 + (tz - body.vz) * 2.8;
    const scale = dt / Math.max(1, Math.hypot(ax, az) / 10);
    body.vx += ax * scale;
    body.vz += az * scale;
    const moving = Math.hypot(body.vx, body.vz) > 2;
    const heading = moving ? Math.atan2(-body.vx, -body.vz) : target.heading;
    body.spin = damp(
      body.spin,
      clamp(angleDelta(heading, body.heading) * 3, -2, 2),
      5,
      dt,
    );
  }
  body.x += body.vx * dt;
  body.z += body.vz * dt;
  body.heading += body.spin * dt;
  body.y = surface(body.x, body.z, body.y).height + 0.07;
  if (
    body.skidTime === 0 &&
    Math.hypot(body.x - target.x, body.z - target.z) < 0.16 &&
    Math.hypot(body.vx - tx, body.vz - tz) < 0.45 &&
    Math.abs(angleDelta(body.heading, target.heading)) < 0.08
  ) {
    body.displaced = false;
  }
}

const playerShape = { halfWidth: 0.99, halfLength: 2.28 };
const cross = (rx, rz, nx, nz) => rz * nx - rx * nz;

export function localContact(body, x, z) {
  const dx = x - body.x,
    dz = z - body.z;
  const s = Math.sin(body.heading),
    c = Math.cos(body.heading);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

function axes(heading) {
  const c = Math.cos(heading),
    s = Math.sin(heading);
  return [
    { x: c, z: -s },
    { x: s, z: c },
  ];
}
const dot = (a, b) => a.x * b.x + a.z * b.z;
function radius(shape, basis, n) {
  return (
    shape.halfWidth * Math.abs(dot(basis[0], n)) +
    shape.halfLength * Math.abs(dot(basis[1], n))
  );
}

function collisionPatch(p, b) {
  const delta = { x: b.x - p.x, z: b.z - p.z };
  if (
    Math.abs(b.y - p.y) > 1.48 ||
    Math.abs(delta.x) > 5.3 ||
    Math.abs(delta.z) > 5.3
  )
    return null;
  const pa = axes(p.heading),
    ba = axes(b.heading);
  let depth = Infinity,
    n;
  for (const axis of [...pa, ...ba]) {
    const separation = dot(delta, axis);
    const overlap =
      radius(playerShape, pa, axis) +
      radius(b, ba, axis) -
      Math.abs(separation);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const sign = separation < 0 ? -1 : 1;
      n = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  // Centre of the overlap on the contact tangent gives centered bumper hits no spin.
  const tangent = { x: -n.z, z: n.x };
  const pr = radius(playerShape, pa, tangent),
    br = radius(b, ba, tangent);
  const lateral = dot(delta, tangent);
  const along =
    (Math.max(-pr, lateral - br) + Math.min(pr, lateral + br)) * 0.5;
  const normal = radius(playerShape, pa, n) - depth * 0.5;
  return {
    ...n,
    depth,
    cx: p.x + n.x * normal + tangent.x * along,
    cz: p.z + n.z * normal + tangent.z * along,
  };
}

// Returns the first damaging impulse of a contact, with a point on each car in
// local metres. Resting contacts still resolve penetration without accumulating dents.
export function collideTraffic(p, b) {
  const patch = collisionPatch(p, b);
  if (!patch) {
    b.touching = false;
    return null;
  }
  const { x: nx, z: nz, depth, cx, cz } = patch;
  const previousContact = b.touching;
  b.touching = true;
  const playerMass = 1520,
    ip = 1 / playerMass,
    ib = 1 / b.mass;
  const playerContact = localContact(p, cx, cz),
    trafficContact = localContact(b, cx, cz);
  const rp = cross(cx - p.x, cz - p.z, nx, nz),
    rb = cross(cx - b.x, cz - b.z, nx, nz);
  const correct = Math.min(depth + 0.001, 0.85) / (ip + ib);
  p.x -= nx * correct * ip;
  p.z -= nz * correct * ip;
  b.x += nx * correct * ib;
  b.z += nz * correct * ib;
  b.displaced = true;
  const pvx = -Math.sin(p.travel) * p.speed,
    pvz = -Math.cos(p.travel) * p.speed;
  const relative =
    (pvx - b.vx) * nx + (pvz - b.vz) * nz + p.yawRate * rp - b.spin * rb;
  if (relative < 0.025) return null;
  const playerInertia = 1 / (playerMass * 2.13),
    trafficInertia = 1 / (b.mass * 1.98);
  const impulse =
    ((relative > 3 ? 1.18 : 1) * relative) /
    (ip + ib + rp * rp * playerInertia + rb * rb * trafficInertia);
  b.vx += nx * impulse * ib;
  b.vz += nz * impulse * ib;
  b.spin = clamp(b.spin + rb * impulse * trafficInertia, -5.5, 5.5);
  p.yawRate = clamp(p.yawRate - rp * impulse * playerInertia, -3.1, 3.1);
  const vx = pvx - nx * impulse * ip,
    vz = pvz - nz * impulse * ip;
  const speed = Math.hypot(vx, vz);
  // Preserve reverse gear on a rearward shunt, including a stationary driver.
  const reverse = -Math.sin(p.heading) * vx - Math.cos(p.heading) * vz < 0;
  p.speed = reverse ? -speed : speed;
  if (speed > 0.03) p.travel = Math.atan2(-vx, -vz) + (reverse ? Math.PI : 0);
  b.skidTime = Math.max(b.skidTime, clamp(relative * 0.045, 0.15, 1.8));
  if (previousContact || relative < 2.8) return null;
  return {
    speed: relative,
    severity: clamp((relative - 1.8) / 32, 0.08, 1),
    playerContact,
    trafficContact,
  };
}
