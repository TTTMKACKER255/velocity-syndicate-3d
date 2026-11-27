// Metres, seconds and radians throughout. Heading zero faces negative Z.
export const STEP = 1 / 120;
export const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

export function newDriver(pose, height = 0) {
  return { ...pose, y: height, speed: 0, steer: 0, travel: pose.heading, yawRate: 0,
    pitch: 0, roll: 0, airRoll: 0, vy: 0, distance: 0, airborne: false,
    nitro: 1, boostTime: 0, boostStage: 0, heatLock: false, boosting: false,
    drift: false, driftScore: 0, airtime: 0, rolls: 0, brake: 0, gear: 1, rpm: 1000 };
}

export function vehicleStats(car, upgrades = {}) {
  const level = name => clamp(Number(upgrades[name]) || 0, 0, 3);
  return {
    top: car.top + level('engine') * 3 + level('transmission') * 1.4,
    accel: car.accel * (1 + level('engine') * .045 + level('turbo') * .08 + level('transmission') * .04),
    grip: car.grip + level('tires') * .09 + level('suspension') * .055,
    capacity: 3.1 + level('nitro') * .8,
    suspension: level('suspension')
  };
}

export function stepVehicle(p, input, tune, surfaceAt, dt = STEP) {
  const surface = surfaceAt(p.x, p.z, p.y);
  const velocity = Math.abs(p.speed);
  const oldY = p.y;
  p.brake = input.brake;
  p.steer = damp(p.steer, input.steer, 10, dt);
  p.drift = !p.airborne && velocity > 10 && (input.drift || (p.drift && Math.abs(p.steer) > .42));
  if (!input.nitro) p.heatLock = false;
  p.boosting = input.nitro && !p.heatLock && p.nitro > 0 && p.speed > 1;
  p.boostTime = p.boosting ? p.boostTime + dt : 0;
  p.boostStage = p.boosting ? 1 + Number(p.boostTime > .75) + Number(p.boostTime > 1.7) : 0;
  const refill = .033 + (p.drift ? .095 : 0) + (p.airborne ? .08 : 0);
  p.nitro = clamp(p.nitro + dt * (p.boosting ? -1 / tune.capacity : refill), 0, 1);
  if (p.nitro === 0) p.heatLock = true;
  const upper = tune.top * (surface.road || p.airborne ? 1 : .63) + p.boostStage * 5;
  const thrust = tune.accel * Math.max(.12, 1 - .78 * velocity / tune.top);
  const drag = (.34 + .00046 * velocity * velocity + (surface.road ? 0 : 1.1)) * Math.sign(p.speed);
  const braking = input.brake * (p.speed > .5 ? 27 : p.speed < -12 ? 0 : 4.9);
  p.speed += (input.throttle * thrust - braking - drag + p.boostStage * 4.2 - (p.drift ? 1.6 : 0)) * dt;
  if (p.speed > upper) p.speed = Math.max(upper, p.speed - dt * 12);
  p.speed = clamp(p.speed, -13, tune.top + 17);
  if (Math.abs(p.speed) < .13 && !input.throttle && !input.brake) p.speed = 0;
  const turn = Math.min(velocity * .19, 1.75) / (1 + velocity * .013) * tune.grip;
  const targetYaw = p.steer * turn * Math.sign(p.speed) * (p.drift ? 1.72 : 1);
  p.yawRate = damp(p.yawRate, targetYaw * (p.airborne ? .18 : 1), 7, dt);
  p.heading += p.yawRate * dt;
  // A separate velocity heading preserves slip through a handbrake entry.
  const traction = p.airborne ? .12 : p.drift ? 1.65 : 7.9 * tune.grip;
  p.travel += angleDelta(p.heading, p.travel) * (1 - Math.exp(-traction * dt));
  p.x -= Math.sin(p.travel) * p.speed * dt;
  p.z -= Math.cos(p.travel) * p.speed * dt;
  p.distance += velocity * dt;
  if (p.drift) p.driftScore += velocity * Math.abs(angleDelta(p.heading, p.travel)) * dt * 3;
  const next = surfaceAt(p.x, p.z, p.y);
  if (!p.airborne && surface.ramp && !next.ramp && p.y > next.height + .5 && velocity > 12) {
    p.airborne = true; p.vy = Math.min(17, velocity * .34); p.airRoll = 0; p.airtime = 0;
  }
  if (p.airborne) {
    p.airtime += dt; p.vy -= 18.5 * dt; p.y += p.vy * dt;
    if (input.drift) p.airRoll += (Math.abs(p.steer) > .1 ? -Math.sign(p.steer) : 1) * 5.4 * dt;
    p.pitch = damp(p.pitch, .2 * Math.sign(p.vy), 2, dt);
    if (p.y <= next.height) {
      p.rolls += Math.floor((Math.abs(p.airRoll) + .25) / (2 * Math.PI));
      p.airborne = false; p.vy = 0; p.y = next.height; p.airRoll = 0;
    }
  } else {
    p.y = next.height;
    const slope = Math.abs(p.speed) > 2 ? Math.atan2(p.y - oldY, Math.max(.01, velocity * dt)) * Math.sign(p.speed) : 0;
    p.pitch = damp(p.pitch, clamp(slope,-.3,.3), 7, dt);
  }
  p.roll = damp(p.roll, p.airborne ? p.airRoll : -p.steer * Math.min(velocity * .0011, .045) / (1 + tune.suspension * .12), 10, dt);
  p.gear = p.speed < -.3 ? -1 : clamp(1 + Math.floor(velocity / (tune.top / 7)), 1, 7);
  p.rpm = Math.min(8600, 980 + Math.min(velocity * 165, 3300) + (velocity / (tune.top / 7) % 1) * 3950 + (p.boosting ? 300 : 0));
}
