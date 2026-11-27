// Local material plates are shared by WebGL and the perspective Canvas renderer.
import * as THREE from "three";

const definitions = {
  glass: [new URL("../assets/bay-glass.webp", import.meta.url), 18, 19],
  residence: [new URL("../assets/bay-residence.webp", import.meta.url), 16, 14],
  limestone: [new URL("../assets/bay-limestone.webp", import.meta.url), 13, 14],
  brick: [new URL("../assets/bay-brick.webp", import.meta.url), 14, 14],
  cafe: [new URL("../assets/bay-cafe.webp", import.meta.url), 18, 4],
  workshop: [new URL("../assets/bay-workshop.webp", import.meta.url), 21, 4.5],
  lobby: [new URL("../assets/bay-lobby.webp", import.meta.url), 17, 4],
  depot: [new URL("../assets/bay-depot.webp", import.meta.url), 19, 4],
  asphalt: [new URL("../assets/bay-asphalt.webp", import.meta.url), 23, 55],
  palm: [new URL("../assets/bay-palm.webp", import.meta.url), 0.6, 1],
  oak: [new URL("../assets/bay-oak.webp", import.meta.url), 1.09, 1],
  pavement: [new URL("../assets/bay-pavement.webp", import.meta.url), 6.4, 6.4],
};
const images = new Map();
export function materialPlate(name) {
  const [url, width, height] = definitions[name];
  if (!images.has(name)) {
    const plate = { width, height, image: null, listeners: [] };
    images.set(name, plate);
    if (typeof Image !== "undefined") {
      const image = new Image();
      image.onload = () => {
        plate.image = image;
        for (const cb of plate.listeners) cb(image);
        plate.listeners.length = 0;
      };
      image.src = url.href;
    }
  }
  return images.get(name);
}

export function textureFor(name) {
  const plate = materialPlate(name),
    tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  const ready = (image) => {
    tex.image = image;
    tex.needsUpdate = true;
  };
  if (plate.image) ready(plate.image);
  else plate.listeners.push(ready);
  return tex;
}

export function architectureMaterial(name, night) {
  const plate = materialPlate(name),
    store = ["cafe", "workshop", "lobby", "depot"].includes(name);
  const mat = new THREE.MeshStandardMaterial({
    map: textureFor(name),
    color: 0xffffff,
    roughness: name === "glass" ? 0.34 : 0.72,
    metalness: name === "glass" ? 0.13 : 0.025,
  });
  mat.userData.plate = name;
  mat.userData.store = store;
  mat.onBeforeCompile = (s) => {
    s.uniforms.bayNight = night;
    s.vertexShader =
      "varying vec3 bayLocal; varying vec3 bayWorld; varying vec3 bayNormal;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
      vec3 metres=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      vec3 local=(position+vec3(.5))*metres;
      vec2 facadeUV=vec2(abs(normal.x)>.5 ? local.z : local.x,local.y);
      float faceWidth=abs(normal.x)>.5?metres.z:metres.x;
      vMapUv=vec2(facadeUV.x/faceWidth*max(1.,floor(faceWidth/${plate.width.toFixed(1)}+.5)),facadeUV.y/metres.y*${store ? "1." : `max(1.,floor(metres.y/${plate.height.toFixed(1)}+.5))`});
      bayWorld=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;bayLocal=local;bayNormal=normal;`,
    );
    s.fragmentShader =
      "uniform float bayNight; varying vec3 bayNormal; varying vec3 bayLocal; varying vec3 bayWorld;\n" +
      s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      vec3 viewed=normalize(cameraPosition-bayWorld);
      float edge=pow(1.-abs(dot(viewed,normalize(bayNormal))),3.);
      float glazing=smoothstep(.015,.115,diffuseColor.b-diffuseColor.r*.88);
      diffuseColor.rgb+=vec3(.022,.04,.047)*edge*glazing*(1.-bayNight);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.27,.26,.24),abs(bayNormal.y));`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      vec2 cell=floor(vec2(abs(bayNormal.x)>.5?bayLocal.z:bayLocal.x,bayLocal.y)/vec2(2.1,3.45));
      float lamp=step(.68,fract(sin(dot(cell,vec2(14.7,83.1)))*1238.));
      totalEmissiveRadiance+=vec3(.28,.17,.071)*lamp*bayNight*glazing*(1.-abs(bayNormal.y));`,
    );
  };
  mat.customProgramCacheKey = () => name;
  return mat;
}
