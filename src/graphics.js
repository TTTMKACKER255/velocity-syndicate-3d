import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createVehicle } from "../models/vehicle.js";
import { createTrafficModel, disposeTrafficModel } from "../models/traffic.js";
import { applyPanelDent, clearPanelDents } from "../models/damage.js";
import {
  advanceTraffic,
  collideTraffic,
  lanePose,
  localContact,
  trafficBody,
} from "./traffic-physics.js";
import { DrivingCamera } from "./camera.js";
import { createWorld, routePoint, groundHeight, roadLengths } from "./world.js";
import { createSoftwareView } from "./software-view.js";
import { DriftMarks } from "./skidmarks.js";
import { RoadBeacons } from "./beacons.js";
import { DriveEffects } from "./postfx.js";

const skyVertex =
  "varying vec3 ray; void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}";
const skyFragment = `varying vec3 ray;uniform float night;uniform float clock;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.545);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){vec3 d=normalize(ray);float h=max(0.,d.y);vec3 day=mix(vec3(.83,.84,.76),vec3(.12,.44,.73),pow(h,.44));
vec2 uv=d.xz/max(.08,d.y)*2.6+clock*.006;float clouds=noise(uv)*.54+noise(uv*2.1)*.29+noise(uv*4.7)*.17;day=mix(day,vec3(.97,.94,.84),smoothstep(.56,.73,clouds)*.53*smoothstep(.02,.17,h));
float sun=max(0.,dot(d,normalize(vec3(-.44,.49,-.74))));day+=vec3(1.,.75,.41)*(pow(sun,35.)*.29+smoothstep(.9990,.9998,sun));
vec3 dusk=mix(vec3(.16,.17,.23),vec3(.012,.024,.061),pow(h,.55));float star=step(.998,hash(floor(d.xz/max(.1,h)*380.)))*smoothstep(.1,.5,h);gl_FragColor=vec4(mix(day,dusk+star*.65,night),1.);}`;
function place(obj, point, offset = 0) {
  obj.position.set(
    point.x + Math.cos(point.heading) * offset,
    (point.height ?? groundHeight(point.x, point.z)) + 0.08,
    point.z - Math.sin(point.heading) * offset,
  );
  obj.rotation.y = point.heading;
}
function gate() {
  const g = new THREE.Group(),
    m = new THREE.MeshBasicMaterial({
      color: 0xff873d,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
  for (const x of [-8, 8]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 7, 0.22), m);
    pole.position.set(x, 3.5, 0);
    g.add(pole);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(16, 0.19, 0.22), m);
  lintel.position.y = 7;
  g.add(lintel);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.85),
    new THREE.MeshBasicMaterial({ color: 0xffa14c, wireframe: true }),
  );
  diamond.position.y = 8.7;
  g.add(diamond);
  return g;
}
function exhaust(scene) {
  const count = 100,
    positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    particles = Array.from({ length: count }, () => ({
      ttl: 0,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      kind: 0,
    }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.26,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let idx = 0,
    carry = 0;
  return (p, dt) => {
    carry += dt * (p.boosting ? 88 : p.drift ? 40 : 0);
    while (carry >= 1) {
      carry--;
      const a = particles[idx++ % count],
        s = Math.sin(p.heading),
        c = Math.cos(p.heading),
        side = (Math.random() - 0.5) * (p.drift ? 1.8 : 0.4);
      Object.assign(a, {
        x: p.x + s * 2 + c * side,
        y: p.y + 0.35,
        z: p.z + c * 2 - s * side,
        vx: s * 3 + Math.random() - 0.5,
        vz: c * 3 + Math.random() - 0.5,
        vy: Math.random() * 1.1,
        ttl: 0.2 + Math.random() * 0.4,
        kind: p.boostStage,
      });
    }
    for (let i = 0; i < count; i++) {
      const a = particles[i];
      a.ttl -= dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.z += a.vz * dt;
      positions.set([a.x, a.ttl > 0 ? a.y : -500, a.z], i * 3);
      colors.set(
        a.kind === 0
          ? [0.22, 0.22, 0.22]
          : a.kind === 3
            ? [0.72, 0.32, 1]
            : [1, 0.48, 0.1],
        i * 3,
      );
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
}
export class RaceGraphics {
  constructor(container, look, profile, activities) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.profile = profile;
    this.time = 0;
    this.itemMeshes = new Map();
    const s = this.scene;
    this.world = createWorld(s);
    this.activities = activities;
    this.canvas = document.createElement("canvas");
    container.append(this.canvas);
    try {
      const options = {
        antialias: profile.settings.quality !== "Low",
        powerPreference: "high-performance",
      };
      const context = this.canvas.getContext("webgl2", options);
      if (!context) throw new Error("WebGL2 unavailable");
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        context,
        ...options,
      });
    } catch {
      this.canvas.remove();
      this.canvas = document.createElement("canvas");
      container.append(this.canvas);
      this.software = createSoftwareView(this.canvas, look, this.world.group);
    }
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.13, 4600);
    this.controller = new DrivingCamera(this.camera);
    if (this.renderer) {
      const r = this.renderer;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      const env = new RoomEnvironment(),
        pm = new THREE.PMREMGenerator(r);
      this.envTarget = pm.fromScene(env, 0.04);
      s.environment = this.envTarget.texture;
      s.environmentIntensity = 0.67;
      env.dispose();
      pm.dispose();
      s.fog = new THREE.FogExp2(0xcad2cc, 0.0011);
      this.sky = new THREE.Mesh(
        new THREE.SphereGeometry(3300, 34, 16),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          vertexShader: skyVertex,
          fragmentShader: skyFragment,
          uniforms: { night: { value: 0 }, clock: { value: 0 } },
        }),
      );
      s.add(this.sky);
      this.hemi = new THREE.HemisphereLight(0xe3f1ff, 0xb49f86, 1.9);
      s.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xffe5bb, 2.7);
      s.add(this.sun, this.sun.target);
      this.car = createVehicle(look);
      s.add(this.car.group);
      this.fx = exhaust(s);
      const shadowCanvas = document.createElement("canvas");
      shadowCanvas.width = shadowCanvas.height = 64;
      const c = shadowCanvas.getContext("2d"),
        grad = c.createRadialGradient(32, 32, 5, 32, 32, 32);
      grad.addColorStop(0, "rgba(0,0,0,.85)");
      grad.addColorStop(1, "transparent");
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 64);
      this.shadowTexture = new THREE.CanvasTexture(shadowCanvas);
      this.shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 5.8),
        new THREE.MeshBasicMaterial({
          map: this.shadowTexture,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
        }),
      );
      this.shadow.rotation.x = -Math.PI / 2;
      s.add(this.shadow);
    }
    this.playerBody = this.car?.group ?? new THREE.Group();
    this.playerBody.userData.body = look.body;
    const palette = [
      0x46586a, 0x77958e, 0xd3ccc0, 0x913a32, 0x355765, 0xb4a684, 0x727388,
    ];
    this.traffic = Array.from({ length: 18 }, (_, i) => {
      const road = i < 9 ? 0 : i < 12 ? 1 : i < 15 ? 2 : i - 12;
      const dist = roadLengths[road] * ((i * 0.181 + 0.13) % 1);
      const mesh = createTrafficModel(palette[i % palette.length], i % 7);
      const body = trafficBody(
        lanePose(routePoint(road, dist)),
        1320 + (i % 5) * 115,
        mesh.userData,
      );
      mesh.position.set(body.x, body.y, body.z);
      mesh.rotation.y = body.heading;
      s.add(mesh);
      return { mesh, body, road, dist, speed: 9 + (i % 6) * 2 };
    });
    this.rival = createTrafficModel(0xb83228, "hyper");
    this.interceptor = createTrafficModel(0x222b37, "gt");
    const lightbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.13, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x338aff }),
    );
    lightbar.position.y = 1.48;
    this.interceptor.add(lightbar);
    this.lightbar = lightbar;
    s.add(this.rival, this.interceptor);
    this.rival.visible = this.interceptor.visible = false;
    this.gate = gate();
    s.add(this.gate);
    this.gate.visible = false;
    this.parts = Array.from({ length: 7 }, (_, i) => {
      const point = routePoint(i % 3, 215 + i * 197);
      const mesh = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.48, 0.14, 48, 8),
        new THREE.MeshStandardMaterial({
          color: 0xfcb34c,
          emissive: 0x9d4c13,
          metalness: 0.65,
        }),
      );
      place(mesh, point, i % 2 ? 7 : -7);
      mesh.position.y += 1.3;
      s.add(mesh);
      mesh.visible = !profile.parts.includes(i);
      return { id: i, mesh };
    });
    this.beacons = new RoadBeacons(this.renderer ? s : null, activities);
    this.marks = new DriftMarks(
      this.renderer ? s : null,
      this.world.surface,
      look,
    );
    this.overlays = { marks: this.marks, beacons: this.beacons };
    this.fallbackTraffic = [
      ...this.traffic,
      { mesh: this.rival },
      { mesh: this.interceptor },
    ];
    this.size = new ResizeObserver(() => this.resize());
    this.size.observe(container);
    this.resize();
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.renderer) {
      this.renderer.setPixelRatio(
        Math.min(
          devicePixelRatio,
          this.profile.settings.quality === "High"
            ? 1.75
            : this.profile.settings.quality === "Low"
              ? 0.85
              : 1.2,
        ),
      );
      this.renderer.setSize(w, h, false);
      if (this.profile.settings.quality === "High") {
        this.effects ??= new DriveEffects(
          this.renderer,
          this.scene,
          this.camera,
        );
        this.effects.resize(w, h);
      } else if (this.effects) {
        this.effects.dispose();
        this.effects = null;
      }
    } else {
      const q = Math.min(
        1,
        (this.profile.settings.quality === "High" ? 1200 : 920) / w,
      );
      this.canvas.width = Math.round(w * q);
      this.canvas.height = Math.round(h * q);
    }
  }
  resetEncounter(p) {
    this.marks.breakTrail();
    p.dents = this.playerBody.userData.dents || [];
    for (const a of this.traffic) a.body.touching = false;
    this.trail = [{ x: p.x, y: p.y, z: p.z }];
    this.chaseTarget = {
      x: p.x + Math.sin(p.heading) * 35,
      y: p.y,
      z: p.z + Math.cos(p.heading) * 35,
      heading: p.heading,
    };
    this.rivalBody = null;
    this.pursuitBody = trafficBody(
      this.chaseTarget,
      1770,
      this.interceptor.userData,
    );
    this.controller.snap = true;
  }
  playerDent(p, contact, severity) {
    applyPanelDent(this.playerBody, { ...contact, severity });
    p.dents = this.playerBody.userData.dents || [];
  }
  treeDent(p, tree, speed) {
    this.playerDent(
      p,
      localContact(p, tree.x, tree.z),
      Math.min(1, speed / 36),
    );
  }
  stepTraffic(dt, p, mission, start) {
    let hardest = 0;
    const update = (mesh, body, target) => {
      advanceTraffic(body, target, this.world.surface, dt);
      const hit = collideTraffic(p, body);
      if (hit) {
        this.playerDent(p, hit.playerContact, hit.severity);
        applyPanelDent(mesh, { ...hit.trafficContact, severity: hit.severity });
        hardest = Math.max(hardest, hit.speed);
      }
      mesh.position.set(body.x, body.y, body.z);
      mesh.rotation.y = body.heading;
    };
    for (const car of this.traffic) {
      car.dist += dt * car.speed;
      update(car.mesh, car.body, lanePose(routePoint(car.road, car.dist)));
    }
    this.rival.visible = mission?.event.id === "canyon";
    if (this.rival.visible) {
      mission.rival += dt * (19 + Math.min(10, mission.elapsed * 0.2));
      const target = lanePose(routePoint(1, start + mission.rival), -2.5);
      this.rivalBody ??= trafficBody(target, 1410, this.rival.userData);
      update(this.rival, this.rivalBody, target);
      const lag =
        (target.x - this.rivalBody.x) * -Math.sin(target.heading) +
        (target.z - this.rivalBody.z) * -Math.cos(target.heading);
      mission.rivalProgress = mission.rival - lag;
    }
    this.interceptor.visible = mission?.event.id === "city";
    if (this.interceptor.visible) {
      const v = this.chaseTarget,
        tail = this.trail.at(-1);
      if (Math.hypot(p.x - tail.x, p.z - tail.z) > 3)
        this.trail.push({ x: p.x, y: p.y, z: p.z });
      const target = this.trail[0],
        dx = target.x - v.x,
        dz = target.z - v.z;
      const gap = Math.hypot(dx, dz);
      const amount = Math.min(
        gap,
        (18 + Math.min(17, mission.elapsed * 0.3)) * dt,
      );
      const ratio = gap > 0.001 ? amount / gap : 0;
      this.chaseTarget = {
        x: v.x + dx * ratio,
        y: v.y + (target.y - v.y) * ratio,
        z: v.z + dz * ratio,
        heading: gap > 0.01 ? Math.atan2(-dx, -dz) : v.heading,
      };
      if (gap < 2 && this.trail.length > 1) this.trail.shift();
      update(this.interceptor, this.pursuitBody, this.chaseTarget);
    }
    return hardest;
  }
  advance(dt, p, mission, waypoint, onCollect) {
    this.time += dt;
    const t = this.time;
    const pursuit = this.interceptor.visible
      ? Math.hypot(this.pursuitBody.x - p.x, this.pursuitBody.z - p.z)
      : Infinity;
    if (this.interceptor.visible)
      this.lightbar.material.color.setHex(
        Math.floor(t * 5) % 2 ? 0xfb3c34 : 0x388bff,
      );
    this.gate.visible = Boolean(mission && waypoint);
    if (waypoint) {
      place(this.gate, waypoint);
      this.gate.children[3].rotation.y = t;
    }
    this.beacons.update(p, mission, waypoint, t);
    for (const part of this.parts) {
      const m = part.mesh;
      if (!m.visible) continue;
      m.rotation.set(t * 0.4, t, 0.3);
      if (Math.hypot(p.x - m.position.x, p.z - m.position.z) < 3.8) {
        m.visible = false;
        onCollect(part.id);
      }
    }
    return { pursuit };
  }
  render(dt, p, night, waypoint, mission) {
    const t = this.time;
    this.world.update(t, night, p);
    if (!this.renderer) {
      this.software.render(
        p,
        this.controller.index,
        t,
        night,
        mission ? waypoint : null,
        this.fallbackTraffic,
        mission,
        this.parts,
        this.overlays,
      );
      return;
    }
    const s = this.scene;
    this.sky.position.set(p.x, p.y, p.z);
    this.sky.material.uniforms.night.value = night;
    this.sky.material.uniforms.clock.value = t;
    this.hemi.intensity = 1.9 - night * 1.43;
    this.sun.intensity = 2.7 - night * 2.5;
    this.sun.position.set(p.x - 100, p.y + 130, p.z - 145);
    this.sun.target.position.set(p.x, p.y, p.z);
    s.fog.color.setRGB(
      0.58 - night * 0.52,
      0.65 - night * 0.58,
      0.65 - night * 0.53,
    );
    s.environmentIntensity = 0.67 - night * 0.38;
    this.car.group.position.set(p.x, p.y + 0.06, p.z);
    this.car.group.rotation.order = "YXZ";
    this.car.group.rotation.set(p.pitch, p.heading, p.roll, "YXZ");
    this.car.group.visible = ![1, 2].includes(this.controller.index);
    this.car.update(p, dt);
    this.shadow.rotation.z = p.heading;
    this.shadow.position.set(
      p.x,
      this.world.surface(p.x, p.z).height + 0.075,
      p.z,
    );
    this.shadow.visible = this.car.group.visible;
    this.fx(p, dt);
    this.controller.update(p, dt, t, this.world.surface);
    if (mission?.status === "intro") {
      const a = p.heading + 0.5 + mission.intro * 0.6;
      this.camera.position.set(
        p.x + Math.sin(a) * 6,
        p.y + 1.8 + mission.intro * 0.25,
        p.z + Math.cos(a) * 6,
      );
      this.camera.lookAt(p.x, p.y + 0.75, p.z);
      this.car.group.visible = true;
      this.controller.snap = true;
    }
    if (this.effects) this.effects.render(p, night);
    else this.renderer.render(s, this.camera);
  }
  dispose() {
    this.size.disconnect();
    this.software?.dispose();
    this.marks.dispose();
    this.beacons.dispose();
    this.effects?.dispose();
    clearPanelDents(this.playerBody);
    this.car?.dispose();
    for (const mesh of [
      ...this.traffic.map((a) => a.mesh),
      this.rival,
      this.interceptor,
    ]) {
      mesh.removeFromParent();
      disposeTrafficModel(mesh);
    }
    this.lightbar.geometry.dispose();
    this.lightbar.material.dispose();
    this.world.dispose?.();
    const mats = new Set(),
      geos = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          mats.add(m),
        );
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    this.shadowTexture?.dispose();
    this.envTarget?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.canvas.remove();
  }
}
