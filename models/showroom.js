import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createVehicle } from "./vehicle.js";

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

function addBox(parent, material, size, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeContactShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 22, 128, 128, 126);
  gradient.addColorStop(0, "rgba(0,0,0,.89)");
  gradient.addColorStop(0.51, "rgba(0,0,0,.76)");
  gradient.addColorStop(0.78, "rgba(0,0,0,.26)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6.0), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  return { shadow, texture };
}

function createStudio(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#22272b");
  scene.fog = new THREE.FogExp2("#283036", 0.047);
  const envStudio = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(envStudio, 0.035);
  scene.environment = environment.texture;
  scene.environmentIntensity = 1.24;
  envStudio.dispose();
  generator.dispose();

  const architecture = new THREE.Group();
  scene.add(architecture);
  const standard = (color, roughness = 0.6, metalness = 0.12) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const concrete = standard("#30373b", 0.81);
  const steel = standard("#252b2f", 0.38, 0.64);
  const curtain = standard("#3d4449", 0.52, 0.49);
  const black = standard("#151a1c", 0.48);
  const orange = standard("#c34c23", 0.51, 0.31);
  const lamp = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.0, 2.35, 2.46),
  });
  const warmLamp = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.75, 1.58, 0.85),
  });
  const floorMetal = standard("#444b4e", 0.52, 0.31);
  floorMetal.transparent = true;
  floorMetal.opacity = 0.91;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), floorMetal);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  architecture.add(floor);
  const mirror = new Reflector(new THREE.PlaneGeometry(32, 32), {
    color: 0x7e898a,
    textureWidth: 448,
    textureHeight: 448,
    clipBias: 0.004,
    multisample: 0,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = -0.023;
  scene.add(mirror);
  for (const side of [-1, 1]) {
    addBox(architecture, concrete, [0.25, 5.4, 20], [side * 8.2, 2.65, 0]);
    addBox(architecture, concrete, [16.5, 5.4, 0.25], [0, 2.65, side * 9.02]);
    addBox(architecture, black, [16, 0.25, 0.17], [0, 0.125, side * 8.85]);
    for (let i = -2; i <= 2; i++) {
      addBox(
        architecture,
        steel,
        [0.3, 5.45, 0.2],
        [i * 3.42, 2.65, side * 8.74],
      );
      addBox(
        architecture,
        black,
        [0.2, 5.45, 0.31],
        [side * 8.01, 2.65, i * 3.62],
      );
      addBox(
        architecture,
        curtain,
        [2.96, 0.1, 0.11],
        [i * 3.44, 3.28, side * 8.84],
      );
      addBox(
        architecture,
        side < 0 ? warmLamp : lamp,
        [2.8, 0.04, 0.13],
        [i * 3.44, 3.28, side * 8.74],
      );
    }
    for (let i = 0; i < 14; i++) {
      addBox(
        architecture,
        curtain,
        [6.72, 0.145, 0.14],
        [0, 0.34 + i * 0.183, side * 8.76],
      );
    }
    // Painted bay markings sit outside the wheel tracks.
    addBox(
      architecture,
      orange,
      [0.043, 0.006, 0.64],
      [side * 1.68, -0.003, -2.39],
    );
    addBox(
      architecture,
      orange,
      [0.38, 0.006, 0.043],
      [side * 1.51, -0.003, -2.69],
    );
    addBox(
      architecture,
      orange,
      [0.043, 0.006, 0.64],
      [side * 1.68, -0.003, 2.39],
    );
    addBox(
      architecture,
      orange,
      [0.38, 0.006, 0.043],
      [side * 1.51, -0.003, 2.69],
    );
  }
  for (let i = -2; i <= 2; i++) {
    addBox(architecture, black, [15, 0.004, 0.013], [0, -0.005, i * 2.7]);
  }
  const roof = addBox(architecture, black, [16.4, 0.22, 18], [0, 5.48, 0]);
  roof.receiveShadow = false;
  for (let i = -3; i <= 3; i++) {
    addBox(architecture, steel, [15.7, 0.15, 0.19], [0, 5.2, i * 2.42]);
    for (const s of [-1, 1]) {
      addBox(
        architecture,
        black,
        [3.6, 0.073, 0.27],
        [s * 3.45, 5.05, i * 2.42],
      );
      addBox(
        architecture,
        lamp,
        [3.48, 0.025, 0.185],
        [s * 3.45, 5.0, i * 2.42],
      );
    }
  }
  // The studio remains static. Merge long banks of shutter slats and ceiling
  // lights by material before rendering the mirrored floor's second view.
  const buckets = new Map();
  for (const part of [...architecture.children]) {
    part.updateMatrix();
    part.geometry.applyMatrix4(part.matrix);
    const parts = buckets.get(part.material) ?? [];
    parts.push(part.geometry);
    buckets.set(part.material, parts);
    architecture.remove(part);
  }
  for (const [material, parts] of buckets) {
    const joined = new THREE.Mesh(mergeGeometries(parts), material);
    joined.receiveShadow = true;
    architecture.add(joined);
    parts.forEach((part) => part.dispose());
  }
  const { shadow, texture } = makeContactShadow();
  architecture.add(shadow);
  scene.add(new THREE.HemisphereLight(0xe7f7ff, 0x524a43, 1.31));
  const key = new THREE.DirectionalLight(0xffead8, 3.4);
  key.position.set(-4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, {
    left: -4,
    right: 4,
    bottom: -4,
    top: 4,
    near: 0.1,
    far: 22,
  });
  key.shadow.normalBias = 0.015;
  key.shadow.bias = -0.00035;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbadfff, 2.3);
  rim.position.set(5, 4, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffcf9e, 0.8);
  fill.position.set(3, 1.5, 6);
  scene.add(fill);

  return {
    scene,
    dispose() {
      const materials = new Set();
      architecture.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.geometry.dispose();
        materials.add(obj.material);
      });
      for (const material of materials) material.dispose();
      texture.dispose();
      mirror.geometry.dispose();
      mirror.dispose();
      environment.dispose();
      key.shadow.dispose();
    },
  };
}

// A bounded-resolution z-buffer keeps the garage usable on systems without
// WebGL. It reads the same indexed meshes as the hardware renderer, including
// every fitted wheel, paint colour and body panel.
function softwareStudio(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const raster = document.createElement("canvas");
  const rasterCtx = raster.getContext("2d");
  let meshes = [],
    depth,
    image,
    w,
    h;
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  const vector = new THREE.Vector3();
  let look = {};

  function prepare(vehicle, appearance) {
    look = appearance;
    meshes = [];
    vehicle.group.updateMatrixWorld(true);
    vehicle.group.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.visible) return;
      const geometry = mesh.geometry,
        material = mesh.material;
      const position = geometry.getAttribute("position"),
        normals = geometry.getAttribute("normal");
      const world = new Float32Array(position.count * 3),
        directions = new Float32Array(world.length);
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        vector
          .fromBufferAttribute(position, i)
          .applyMatrix4(mesh.matrixWorld)
          .toArray(world, i * 3);
        normal
          .fromBufferAttribute(normals, i)
          .applyNormalMatrix(normalMatrix)
          .toArray(directions, i * 3);
      }
      const glass = material.name === "glass";
      const emissive =
        material.name === "light" ||
        material.name === "red" ||
        material.name === "neon";
      meshes.push({
        world,
        directions,
        faces: geometry.index.array,
        projected: new Float32Array(world.length),
        shades: new Uint8ClampedArray(world.length),
        base: material.color
          .clone()
          .convertLinearToSRGB()
          .toArray()
          .map((c) => 255 * c),
        metallic: glass ? 0.8 : material.metalness,
        roughness: material.roughness,
        glass,
        emissive,
      });
    });
  }
  function resize(width, height) {
    const scale = Math.min(1, 640 / width, 440 / height);
    w = canvas.width = Math.max(2, Math.floor(width * scale));
    h = canvas.height = Math.max(2, Math.floor(height * scale));
    raster.width = w;
    raster.height = h;
    depth = new Float32Array(w * h);
    image = rasterCtx.createImageData(w, h);
  }
  function render(camera) {
    if (!depth) return;
    ctx.fillStyle = "#242b30";
    ctx.fillRect(0, 0, w, h);
    const horizon = h * 0.48;
    const wall = ctx.createLinearGradient(0, 0, 0, horizon);
    wall.addColorStop(0, "#1a2024");
    wall.addColorStop(1, "#41494c");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, horizon);
    const floor = ctx.createLinearGradient(0, horizon, 0, h);
    floor.addColorStop(0, "#363e43");
    floor.addColorStop(0.5, "#485053");
    floor.addColorStop(1, "#2d3439");
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, w, h);
    ctx.fillStyle = "rgba(229,235,225,.32)";
    ctx.fillRect(0, horizon * 0.56, w, h * 0.005);
    for (let i = 1; i < 8; i++) {
      ctx.fillStyle = "rgba(7,15,16,.17)";
      ctx.fillRect((w * i) / 8, 0, Math.max(1, w * 0.003), horizon);
    }
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    vector.set(0, 0, 0).project(camera);
    const shadowX = (1 + vector.x) * w * 0.5,
      shadowY = (1 - vector.y) * h * 0.5;
    ctx.save();
    ctx.translate(shadowX, shadowY);
    ctx.scale(w * 0.38, h * 0.135);
    const shadow = ctx.createRadialGradient(0, 0, 0.18, 0, 0, 1);
    shadow.addColorStop(0, "rgba(0,0,0,.83)");
    shadow.addColorStop(
      0.7,
      look.underglow ? "rgba(184,70,30,.27)" : "rgba(5,8,10,.44)",
    );
    shadow.addColorStop(1, "rgba(5,8,10,0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    const pixels = image.data;
    pixels.fill(0);
    depth.fill(Infinity);
    const e = matrix.elements;
    for (const mesh of meshes) {
      const {
        world,
        directions,
        faces,
        projected,
        shades,
        base,
        metallic,
        roughness,
        emissive,
        glass,
      } = mesh;
      for (let i = 0; i < world.length; i += 3) {
        const x = world[i],
          y = world[i + 1],
          z = world[i + 2];
        const d = e[3] * x + e[7] * y + e[11] * z + e[15];
        projected[i] =
          (1 + (e[0] * x + e[4] * y + e[8] * z + e[12]) / d) * w * 0.5;
        projected[i + 1] =
          (1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / d) * h * 0.5;
        projected[i + 2] = d;
        const nx = directions[i],
          ny = directions[i + 1],
          nz = directions[i + 2];
        const vx = camera.position.x - x,
          vy = camera.position.y - y,
          vz = camera.position.z - z;
        const vlen = Math.hypot(vx, vy, vz);
        const ndv = (nx * vx + ny * vy + nz * vz) / vlen;
        const ry = 2 * ndv * ny - vy / vlen,
          rx = 2 * ndv * nx - vx / vlen;
        const strip =
          Math.exp(-(((ry - 0.48) / (0.048 + roughness * 0.21)) ** 2)) * 0.82 +
          Math.exp(-(((rx + 0.62) / (0.055 + roughness * 0.19)) ** 2)) * 0.39;
        const sun = Math.max(0, -0.43 * nx + 0.79 * ny + 0.43 * nz);
        const lighting = emissive
          ? 1.16
          : 0.39 + 0.52 * sun + 0.22 * Math.max(0, ny) + 0.1 * Math.max(0, -nz);
        const reflection = emissive
          ? 0
          : (strip * 94 + Math.max(0, ry) * 40) *
            (metallic + 0.12) *
            (1 - roughness * 0.69);
        for (let channel = 0; channel < 3; channel++) {
          shades[i + channel] =
            base[channel] * lighting +
            reflection * (1 + 0.025 * channel) +
            (glass ? 5 : 0);
        }
      }
      for (let i = 0; i < faces.length; i += 3) {
        const a = faces[i] * 3,
          b = faces[i + 1] * 3,
          c = faces[i + 2] * 3;
        const ax = projected[a],
          ay = projected[a + 1],
          bx = projected[b],
          by = projected[b + 1];
        const cx = projected[c],
          cy = projected[c + 1];
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.abs(area) < 0.016) continue;
        const minX = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5));
        const maxX = Math.min(w - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
        const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5));
        const maxY = Math.min(h - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
        const inv = 1 / area,
          dxB = (cy - ay) * inv,
          dyB = (ax - cx) * inv;
        const dxC = (ay - by) * inv,
          dyC = (bx - ax) * inv;
        for (let yy = minY; yy <= maxY; yy++) {
          let u = (minX + 0.5 - ax) * dxB + (yy + 0.5 - ay) * dyB;
          let v = (minX + 0.5 - ax) * dxC + (yy + 0.5 - ay) * dyC;
          for (let xx = minX; xx <= maxX; xx++, u += dxB, v += dxC) {
            const t = 1 - u - v;
            if (t < 0 || u < 0 || v < 0) continue;
            const index = yy * w + xx,
              z =
                t * projected[a + 2] +
                u * projected[b + 2] +
                v * projected[c + 2];
            if (z >= depth[index]) continue;
            depth[index] = z;
            const p = index * 4;
            for (let k = 0; k < 3; k++)
              pixels[p + k] =
                t * shades[a + k] + u * shades[b + k] + v * shades[c + k];
            pixels[p + 3] = 255;
          }
        }
      }
    }
    rasterCtx.putImageData(image, 0, 0);
    ctx.drawImage(raster, 0, 0);
  }
  return { prepare, resize, render };
}

export function createShowroom(container, look = {}) {
  const host = document.createElement("div");
  host.style.cssText =
    "width:100%;height:100%;position:relative;overflow:hidden;background:#262d32;touch-action:none";
  container.append(host);
  let canvas = document.createElement("canvas");
  let renderer, studio, software;
  try {
    const options = { antialias: true, powerPreference: "high-performance" },
      context = canvas.getContext("webgl2", options);
    if (!context) throw new Error("WebGL2 unavailable");
    renderer = new THREE.WebGLRenderer({ canvas, context, ...options });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    studio = createStudio(renderer);
  } catch {
    if (renderer) renderer.dispose();
    renderer = null;
    // A canvas that has already attempted a GL context cannot acquire 2D.
    canvas = document.createElement("canvas");
    software = softwareStudio(canvas);
    const status = document.createElement("small");
    status.textContent = "Software rendering";
    status.style.cssText =
      "position:absolute;right:10px;bottom:8px;color:#e6e9ea;background:#1d2227b3;padding:3px 6px;font:12px system-ui;pointer-events:none";
    host.append(status);
  }
  canvas.setAttribute(
    "aria-label",
    "3D garage vehicle. Drag to orbit. Use arrow keys to rotate and plus or minus to zoom.",
  );
  canvas.tabIndex = 0;
  canvas.style.cssText =
    "display:block;width:100%;height:100%;cursor:grab;touch-action:none";
  host.prepend(canvas);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.08, 80);
  const scene = studio?.scene ?? new THREE.Scene();
  let vehicle,
    closed = false,
    lastTime = performance.now(),
    lastRender = 0,
    holdUntil = 0;
  let yaw = 0.83,
    pitch = 0.24,
    zoom = 1,
    width = 0,
    height = 0,
    frame = 0,
    visible = true,
    dirty = true;
  let dragId = null,
    previousX = 0,
    previousY = 0;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const events = new AbortController();
  const listen = (target, event, callback, opts = {}) =>
    target.addEventListener(event, callback, {
      ...opts,
      signal: events.signal,
    });
  function setLook(next = {}) {
    if (closed) return;
    const nextVehicle = createVehicle(next);
    nextVehicle.update({ headlights: false }, 0);
    if (vehicle) vehicle.dispose();
    vehicle = nextVehicle;
    scene.add(vehicle.group);
    software?.prepare(vehicle, next);
    dirty = true;
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width < 1 || height < 1) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (renderer) renderer.setSize(width, height, false);
    else software.resize(width, height);
    dirty = true;
  }
  function orbit(dx, dy) {
    yaw -= dx * 0.008;
    pitch = clamp(pitch + dy * 0.005, 0.105, 0.88);
    dirty = true;
    holdUntil = performance.now() + 2600;
  }
  listen(canvas, "pointerdown", (event) => {
    if (dragId !== null || event.button !== 0) return;
    dragId = event.pointerId;
    previousX = event.clientX;
    previousY = event.clientY;
    canvas.setPointerCapture(dragId);
    canvas.style.cursor = "grabbing";
  });
  listen(canvas, "pointermove", (event) => {
    if (dragId !== event.pointerId) return;
    orbit(event.clientX - previousX, event.clientY - previousY);
    previousX = event.clientX;
    previousY = event.clientY;
  });
  const release = (event) => {
    if (event.pointerId === dragId) {
      dragId = null;
      canvas.style.cursor = "grab";
      holdUntil = performance.now() + 2600;
    }
  };
  listen(canvas, "pointerup", release);
  listen(canvas, "pointercancel", release);
  listen(canvas, "lostpointercapture", release);
  function changeZoom(factor) {
    zoom = clamp(zoom * factor, 0.84, 1.65);
    dirty = true;
    holdUntil = performance.now() + 2600;
  }
  listen(
    canvas,
    "wheel",
    (event) => {
      event.preventDefault();
      changeZoom(Math.exp(Math.sign(event.deltaY) * 0.07));
    },
    { passive: false },
  );
  listen(canvas, "keydown", (event) => {
    const controls = {
      ArrowLeft: () => orbit(10, 0),
      ArrowRight: () => orbit(-10, 0),
      ArrowUp: () => orbit(0, -8),
      ArrowDown: () => orbit(0, 8),
      "+": () => changeZoom(0.92),
      "=": () => changeZoom(0.92),
      "-": () => changeZoom(1.08),
    };
    if (controls[event.key]) {
      event.preventDefault();
      controls[event.key]();
    }
  });
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) dirty = true;
  });
  intersection.observe(host);
  function tick(time) {
    if (closed) return;
    frame = requestAnimationFrame(tick);
    const delta = Math.min((time - lastTime) / 1000, 0.07);
    lastTime = time;
    if (!visible || document.hidden || !width || !height) return;
    if (!motion.matches && dragId === null && time > holdUntil) {
      yaw = (yaw + delta * 0.071) % TAU;
      dirty = true;
    }
    if (!dirty || time - lastRender < (software ? 125 : 32)) return;
    lastRender = time;
    dirty = false;
    const distance = Math.max(6.7, 9.3 / camera.aspect) * zoom;
    const horizontal = Math.cos(pitch) * distance;
    camera.position.set(
      Math.sin(yaw) * horizontal,
      0.63 + Math.sin(pitch) * distance,
      Math.cos(yaw) * horizontal,
    );
    camera.lookAt(0, 0.59, 0);
    camera.updateMatrixWorld();
    if (renderer) renderer.render(scene, camera);
    else software.render(camera);
  }
  setLook(look);
  resize();
  frame = requestAnimationFrame(tick);
  return {
    setLook,
    dispose() {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      events.abort();
      vehicle?.dispose();
      studio?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      host.remove();
    },
  };
}
