import { daylightAt, solarHour } from "./daylight.js";
import { STEP, newDriver, stepVehicle, vehicleStats } from "./physics.js";
import { RaceGraphics } from "./graphics.js";
import { activeCar, currentLook, saveProfile } from "./profile.js";
import {
  activities,
  newMission,
  startDistance,
  tickMission,
} from "./events.js";
import { roads, spawn, routePoint, roadLengths } from "./world.js";
import { locations, markerPoint } from "./locations.js";
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export class Session {
  constructor(container, profile, input, audio, hooks, origin = null) {
    this.input = input;
    this.profile = profile;
    this.audio = audio;
    this.hooks = hooks;
    this.graphics = new RaceGraphics(
      container,
      currentLook(profile),
      profile,
      activities,
    );
    this.world = this.graphics.world;
    this.tune = vehicleStats(activeCar(profile), profile.upgrades[profile.car]);
    this.clock = 0;
    this.paused = false;
    this.gps = null;
    this.lastPose = spawn;
    this.lastBump = -5;
    this.acc = 0;
    this.places = locations.map((item) => ({
      item,
      position: markerPoint(item, routePoint, roadLengths),
    }));
    const home = this.places.find((e) => e.item.id === "home");
    this.place(origin || (profile.startAtHome ? home.position : spawn));
    this.input.active = true;
    this.input.clear();
    this.headlights = true;
    this.audio.start();
    this.last = performance.now();
    this.hudAt = -1;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  place(pose) {
    this.p = newDriver(
      pose,
      this.world.surface(pose.x, pose.z, pose.height).height,
    );
    this.lastPose = { ...pose };
    this.graphics.resetEncounter(this.p);
  }
  start(event, teleport = true) {
    this.mission = newMission(event);
    if (event.boards) this.world.resetBoards(event.boards);
    this.startAt = startDistance(event, roadLengths);
    this.gps = null;
    const pose = routePoint(event.road, this.startAt);
    if (teleport) this.place(pose);
    else {
      this.p.speed = 0;
      this.p.driftScore = 0;
      this.p.rolls = 0;
      this.p.airtime = 0;
      this.graphics.resetEncounter(this.p);
    }
    this.audio.speak(event.dispatch, this.profile.settings.voice);
    this.hooks.radio(event.dispatch);
    this.hudAt = -1;
  }
  reset() {
    if (this.mission?.status === "running") {
      const m = this.mission;
      this.place(
        routePoint(m.event.road, this.startAt + m.passed * m.event.interval),
      );
    } else this.place(this.lastPose);
    this.hooks.notice("Back on the road");
  }
  waypoint() {
    const m = this.mission;
    if (m?.event.boards && m.passed < m.event.count) {
      const board = this.world.boardAt(
        m.event.boards.find((id) => !m.broken.includes(id)),
      );
      return { x: board.x, z: board.z, heading: 0 };
    }
    if (m && m.event.id !== "stunt" && ["intro", "running"].includes(m.status))
      return routePoint(
        m.event.road,
        this.startAt + (m.passed + 1) * m.event.interval,
      );
    return this.gps;
  }
  nearest() {
    if (this.mission) return null;
    let near = null,
      min = Infinity;
    for (const e of activities) {
      const point = routePoint(e.road, startDistance(e, roadLengths));
      const d = dist(this.p, point);
      if (d < min) {
        near = e;
        min = d;
      }
    }
    // Facilities operate at the kerb. Prioritise one within reach over a distant event.
    for (const { item, position } of this.places) {
      const distance = dist(this.p, position);
      if (
        distance < 19 &&
        Math.abs(this.p.y - position.height) < 4 &&
        distance < min
      )
        return item;
    }
    return min < 52 ? near : null;
  }
  interact() {
    const e = this.nearest();
    if (e?.landmark) this.hooks.visit(e);
    else if (e) this.start(e, false);
  }
  pause(value) {
    this.paused = value;
    this.input.active = !value;
    this.input.clear();
    this.last = performance.now();
    if (value) this.audio.quiet();
    else this.audio.start();
  }
  collect(i) {
    if (this.profile.parts.includes(i)) return;
    this.profile.parts.push(i);
    this.profile.credits += 650;
    this.profile.rep += 20;
    this.profile.repBalance += 20;
    saveProfile(this.profile);
    this.hooks.notice("Hidden car part found · +650 CR");
  }
  finish() {
    const m = this.mission,
      e = m.event;
    this.pause(true);
    let reward = 0,
      rep = 0;
    if (m.status === "won") {
      const p = this.profile;
      reward = e.reward;
      rep = e.rep;
      p.credits += reward;
      p.rep += rep;
      p.repBalance += rep;
      p.wins[e.id] = (p.wins[e.id] || 0) + 1;
      p.best[e.id] = Math.min(p.best[e.id] ?? Infinity, m.elapsed);
      if (
        ["coast", "city", "canyon"].every((id) => p.wins[id]) &&
        !p.owned.includes("hyper")
      ) {
        p.owned.push("hyper");
        m.unlocked = "Solare X1";
      }
      saveProfile(p);
    }
    this.hooks.result(m, reward, rep);
  }
  frame(now) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (this.paused || document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.2, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const inp = this.input.read();
    if (this.paused) return;
    let boardHit = null;
    const previousStage = this.p.boostStage;
    const p = this.p,
      m = this.mission;
    this.clock += dt;
    p.headlights = this.headlights;
    if (m?.status === "intro") {
      m.intro -= dt;
      if (m.intro <= 0) {
        m.status = "running";
        this.graphics.controller.snap = true;
        this.hooks.notice("Go!");
      }
    } else {
      this.acc += dt;
      while (this.acc >= STEP) {
        const oldX = p.x,
          oldZ = p.z,
          oldY = p.y;
        stepVehicle(p, inp, this.tune, this.world.surface);
        const hit = this.world.collide(p);
        const impactSpeed = Math.abs(p.speed);
        if (hit.material) this.audio.impact(impactSpeed, hit.material);
        if (hit.solid) {
          p.x = oldX;
          p.z = oldZ;
          p.y = oldY;
          p.speed *= -0.2;
          p.travel = p.heading;
        }
        if (hit.trees) {
          if (hit.tree) this.graphics.treeDent(p, hit.tree, impactSpeed);
          p.speed *= 0.68;
          this.audio.impact(impactSpeed, "tree");
          this.hooks.notice("Tree down");
        }
        const contact = this.graphics.stepTraffic(STEP, p, m, this.startAt);
        if (contact && this.clock - this.lastBump > 0.65) {
          this.audio.impact(contact, "car");
          this.hooks.notice("Traffic impact");
          this.lastBump = this.clock;
        }
        if (hit.boardId) boardHit = hit.boardId;
        if (hit.smashed) {
          p.nitro = Math.min(1, p.nitro + 0.06 * hit.smashed);
          this.hooks.notice("Prop smashed · nitro +6%");
        }
        if (hit.solid) this.graphics.marks.breakTrail();
        else this.graphics.marks.update(p);
        this.acc -= STEP;
      }
    }
    if (previousStage < 3 && p.boostStage === 3) this.hooks.shockwave();
    let wp = this.waypoint();
    const traffic = this.graphics.advance(dt, p, m, wp, (i) => this.collect(i));
    if (m?.status === "running") {
      const passed = m.passed;
      tickMission(m, dt, p, wp || p, traffic.pursuit, boardHit);
      if (m.status !== "running") {
        this.finish();
        return;
      }
      if (passed !== m.passed) {
        this.hooks.notice("Checkpoint " + m.passed + " / " + m.event.count);
        wp = this.waypoint();
      }
    }
    if (!m && this.gps && dist(p, this.gps) < 18) {
      this.gps = null;
      this.hooks.notice("Waypoint reached");
    }
    if (
      !m &&
      this.world.surface(p.x, p.z, p.y).road &&
      p.speed > 5 &&
      Math.floor(this.clock) % 3 === 0
    )
      this.lastPose = { x: p.x, z: p.z, heading: p.heading, height: p.y };
    this.audio.update(p, inp.throttle);
    const daylight = daylightAt(
      solarHour(
        this.clock,
        this.profile.settings.timeOfDay,
        m?.event.id === "city",
      ),
    );
    this.graphics.render(dt, p, daylight, wp, m);
    if (this.clock - this.hudAt > 0.084) {
      this.hudAt = this.clock;
      this.hooks.hud(p, m, wp, this.nearest(), this.district(), daylight);
    }
  }
  district() {
    const p = this.p;
    if (p.x < -395) return "Canyon Pass";
    if (p.z < -640) return "Aurelia Harbour";
    if (p.x < 180 && p.z < 250) return "Downtown District";
    return roads[0].name;
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.input.active = false;
    this.input.clear();
    this.audio.quiet();
    this.graphics.dispose();
  }
}
