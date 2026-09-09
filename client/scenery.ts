import * as THREE from "three";
import { createLevelSky } from './scene-style.ts';
import {
  nearestTrack,
  trackPoint,
  trackWidth,
  shortcutWidthAt,
  trackWidthRange,
  type Track,
} from "../shared/track.ts";
import type { LevelDefinition } from "../shared/levels.ts";
import {
  addCoastalContactShadows,
  addCoastalMeadow,
  coastalShoreMargin,
} from "./coast-details.ts";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { enhanceCoastCliff } from "./coast-rock.ts";
import { buildReferenceHeadland } from './reference-layout.ts';
import {createCoastSky} from './coast-sky.ts';
import { obstacleSceneryClear } from './obstacle-clearance.ts';

type Random = () => number;
const material = (color: string, roughness = 0.85) =>
  new THREE.MeshStandardMaterial({ color, roughness });

function solid(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const obj = new THREE.Mesh(geometry, mat);
  obj.position.set(x, y, z);
  obj.castShadow = obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}
export function worldUV(geometry: THREE.BufferGeometry, scale = 4) {
  const p = geometry.getAttribute("position"),
    uv: number[] = [];
  for (let i = 0; i < p.count; i++)
    uv.push(p.getX(i) / scale, p.getZ(i) / scale);
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
}

/** Clearance against the union of all road ribbons, not just the nearest centre. */
export function roadsideClear(
  track: Track,
  x: number,
  z: number,
  radius: number,
) {
  if (!obstacleSceneryClear(track, x, z, radius)) return false;
  const nearest = nearestTrack(x, z, track);
  if (
    nearest.distance >
    Math.max(trackWidthRange(track).max, track.shortcutWidth ?? 7) / 2 +
      radius +
      2
  )
    return true;
  for (const [points, closed, shortcut] of [
    [track.points, true, false],
    [track.shortcut, false, true],
  ] as const) {
    for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const f = Math.max(
        0,
        Math.min(
          1,
          ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
      const t = (a.t + ((b.t < a.t ? b.t + 1 : b.t) - a.t) * f) % 1;
      const width = shortcut
        ? shortcutWidthAt(t, track)
        : trackWidth(t, track);
      if (
        Math.hypot(x - a.x - dx * f, z - a.z - dz * f) <
        width / 2 + radius + 0.25
      )
        return false;
    }
  }
  return true;
}

export function buildLandscape(
  scene: THREE.Scene,
  track: Track,
  grass: THREE.Material,
) {
  const perimeter = track.points
    .filter((_, i) => i % 4 === 0)
    .map((p) => {
      const margin =
        trackWidth(p.t, track) / 2 +
        (track.theme === "coast" ? coastalShoreMargin(p.t,track) : 22);
      return new THREE.Vector2(
        p.x + Math.cos(p.heading) * margin,
        -p.z + Math.sin(p.heading) * margin,
      );
    });
  const shape = new THREE.Shape(perimeter);
  const surface = new THREE.ShapeGeometry(shape);
  surface.rotateX(-Math.PI / 2);
  // Terrain is below the driveable ribbon; the same route still owns collision and elevation.
  if (track.theme === "mountain") {
    surface.dispose();
    const resolution = 90,
      size = track.radius * 2.1;
    const geo = new THREE.PlaneGeometry(size, size, resolution, resolution);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        road = nearestTrack(x, z, track);
      pos.setY(i, road.y - 0.45 - Math.min(road.distance * 0.16, 14));
    }
    geo.computeVertexNormals();
    worldUV(geo, 7);
    solid(scene, geo, grass);
  } else {
    surface.translate(0, -0.18, 0);
    worldUV(surface, 6);
    solid(scene, surface, grass);
  }
  const cliffs = new THREE.ExtrudeGeometry(shape, {
    depth: 7,
    bevelEnabled: true,
    bevelSize: track.theme === "coast" ? 1.2 : 2.4,
    bevelThickness: 1.4,
    bevelSegments: 1,
    steps: 1,
  });
  cliffs.rotateX(-Math.PI / 2);
  // Keep the extrusion's top cap one centimetre below the grass: closing the
  // bevel seam must never lift the opaque rock cap over the meadow material.
  cliffs.translate(0, track.theme === "coast" ? -8.59 : -9, 0);
  const rock = material(track.theme === "city" ? "#6f7c79" : "#aa9876");
  rock.flatShading = true;
  if (track.theme === "coast") enhanceCoastCliff(rock);
  const cliff = solid(scene, cliffs, rock);
  if (track.theme === "coast") cliff.name = "coast-cliff";
  if(track.id==='reference-coast-v1')buildReferenceHeadland(scene,grass,track);
}

export function createSea(scene: THREE.Scene, color: string, molten = false) {
  const seaMaterial = new THREE.ShaderMaterial({
    uniforms: { clock: { value: 0 }, deep: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vWorld;
      void main(){ vec4 world = modelMatrix * vec4(position,1.); vWorld=world.xyz;
      gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: molten
      ? `uniform float clock; varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz*.13;
        float bend=sin(p.y*.5+clock*.06)*.7;
        float seams=abs(sin(p.x+bend)*sin(p.y+sin(p.x*.7)*.9));
        float heat=1.-smoothstep(.03,.16,seams);
        vec3 crust=vec3(.055,.022,.029)+vec3(.022,.008,.0)*sin(p.x*2.);
        vec3 lava=mix(crust,vec3(1.7,.25,.035),heat);
        gl_FragColor=vec4(lava,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
      : `uniform float clock; uniform vec3 deep; varying vec3 vWorld;
      float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float waterNoise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(waterHash(i),waterHash(i+vec2(1.,0.)),f.x),
          mix(waterHash(i+vec2(0.,1.)),waterHash(i+vec2(1.,1.)),f.x),f.y);
      }
      void main(){
        vec2 p=vWorld.xz;
        float distanceToEye=length(cameraPosition-vWorld);
        float broad=waterNoise(p*.057+clock*.018);
        float broken=waterNoise(p*vec2(.37,.26)-clock*.037);
        float phaseA=dot(p,vec2(.22,.94))+(broad-.5)*11.+clock*.83;
        float phaseB=dot(p,vec2(1.27,-.61))+(broken-.5)*3.1-clock*1.16;
        float phaseC=dot(p,vec2(-1.73,1.04))+broad*5.4+clock*1.43;
        float swell=.55*sin(phaseA)+.28*sin(phaseB)+.17*sin(phaseC);
        float detail=1.-smoothstep(110.,560.,distanceToEye);
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        detail*=1.-smoothstep(.3,1.15,footprint);
        vec2 slope=.17*cos(phaseA)*vec2(.22,.94)
          +.065*cos(phaseB)*vec2(1.27,-.61)+.024*cos(phaseC)*vec2(-1.73,1.04);
        vec3 normal=normalize(vec3(-slope.x*detail,1.,-slope.y*detail));
        vec3 eye=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.-max(0.,dot(normal,eye)),4.);
        vec3 halfLight=normalize(eye+normalize(vec3(52.,54.,-33.)));
        float glint=pow(max(0.,dot(normal,halfLight)),68.);
        float crest=smoothstep(.74,.96,swell)*smoothstep(.46,.72,broken)*detail;
        float faraway=smoothstep(180.,1800.,distanceToEye);
        float longWave=sin(phaseA*.31+broken*.6);
        float broadDetail=(1.-smoothstep(700.,2600.,distanceToEye))
          *(1.-smoothstep(1.5,6.,footprint));
        vec3 water=mix(deep,vec3(.018,.27,.32),.35);
        water*=.88+.18*swell*detail;
        water=mix(water,vec3(.19,.37,.43),fresnel*.48+faraway*.35);
        water+=vec3(.43,.42,.33)*glint*.48*detail;
        water=mix(water,vec3(.68,.81,.76),crest*.52);
        water*=1.+longWave*.075*broadDetail;
        float longCrest=smoothstep(.89,.99,longWave)*smoothstep(.38,.7,broad)*broadDetail;
        water=mix(water,vec3(.60,.78,.77),longCrest*.32);
        gl_FragColor=vec4(water,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sea = solid(
    scene,
    new THREE.PlaneGeometry(7000, 7000),
    seaMaterial,
    0,
    -7.2,
    0,
  );
  sea.rotation.x = -Math.PI / 2;
  sea.castShadow = sea.receiveShadow = false;
  sea.userData.dynamic = true;
  return { sea, material: seaMaterial };
}

export function createSky(
  scene: THREE.Scene,
  theme: Track["theme"],
  level?: LevelDefinition,
) {
  if(level?.biome==='coast'||(!level&&theme==='coast'))return createCoastSky(scene);
  if(level)return createLevelSky(scene,level);
  const night = theme === "city";
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2100, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        coastLook: {
          value: 0,
        },
        cloudStrength: {
          value: night ? 0.16 : 1,
        },
        zenith: {
          value: new THREE.Color(night ? "#394e83" : "#299fce"),
        },
        horizon: {
          value: new THREE.Color(
            night ? "#e2b3a0" : "#dfebd8",
          ),
        },
      },
      vertexShader: `varying vec3 direction; void main(){direction=position;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 direction; uniform vec3 zenith; uniform vec3 horizon;
      uniform float cloudStrength; uniform float coastLook;
      float puff(vec2 p,vec2 c,vec2 r){return 1.-smoothstep(.84,1.,length((p-c)/r));}
      void main(){
      vec3 d=normalize(direction);
      float h=clamp(d.y*mix(1.8,2.7,coastLook)+.13,0.,1.);
      vec3 color=mix(horizon,zenith,pow(h,mix(.75,.65,coastLook)));
      // A handful of rounded, sunlit cloud silhouettes in the sky draw call.
      // An integer cloud-cell count closes the longitude seam in an empty gap.
      vec2 q=vec2((atan(d.z,d.x)+3.14159265)*(mix(8.,16.,coastLook)*3.8/6.2831853),d.y*mix(14.,19.,coastLook));
      float cell=floor(q.x/3.8);
      float variation=fract(sin(cell*127.1+3.7)*43758.5453);
      float silhouette=fract(sin(cell*311.7+19.1)*17341.317);
      vec2 c=vec2(mod(q.x,3.8)-1.9,q.y-2.3-sin(cell*7.3)*mix(.65,1.35,coastLook));
      // Unequal scale and lobe height keep the static cloud silhouettes from
      // looking like a repeated row of identical icons. No animated sky layer.
      c.x/=mix(1.,.62+variation*.75,coastLook);
      c.y/=mix(1.,.72+silhouette*.68,coastLook);
      float clouds=puff(c,vec2(-.62,0.),vec2(.53,.18));
      clouds=max(clouds,puff(c,vec2(-.2,.17),vec2(.39,.34)));
      clouds=max(clouds,puff(c,vec2(.18,.25),vec2(.35,mix(.43,.32+variation*.20,coastLook))));
      clouds=max(clouds,puff(c,vec2(.53,.07),vec2(.39,.22)));
      clouds*=smoothstep(-.12,.02,c.y)*cloudStrength;
      vec3 cloudColor=mix(mix(vec3(.73,.77,.72),vec3(.59,.65,.63),coastLook),vec3(1.,.97,.85),smoothstep(-.10,.31,c.y));
      color=mix(color,cloudColor,clouds*.91);
      float sunlight=pow(max(0.,dot(d,normalize(vec3(-.65,.18,-.55)))),24.);
      color+=vec3(.11,.072,.018)*sunlight*cloudStrength;
      gl_FragColor=vec4(color,1.);
      #include <colorspace_fragment>
      }`,
    }),
  );
  sky.userData.dynamic = true;
  scene.add(sky);
  return sky;
}

export function decorateLandscape(
  scene: THREE.Scene,
  track: Track,
  random: Random,
) {
  // Local shared primitives live exactly as long as this scenery instance.
  // World batches them before rendering and disposes each source only once.
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const faceted = new THREE.IcosahedronGeometry(1, 0);
  const leafFaceted = new THREE.IcosahedronGeometry(1, 1);
  const leafPositions = leafFaceted.getAttribute("position");
  for (let i = 0; i < leafPositions.count; i++) {
    const x = leafPositions.getX(i),
      y = leafPositions.getY(i),
      z = leafPositions.getZ(i),
      variation = 1 + Math.sin(x * 8.3 + y * 5.7 + z * 11.1) * 0.11;
    leafPositions.setXYZ(
      i,
      x * variation,
      y * (0.92 + 0.08 * variation),
      z * variation,
    );
  }
  leafFaceted.computeVertexNormals();
  const block = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const mesh = solid(parent, cube, mat, x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  };
  const coast = track.theme === "coast",
    city = track.theme === "city";
  const wood = material("#8a6844"),
    paleWood = material("#c8b892"),
    bark = material("#685139");
  const leaves = [
    "#5f812b",
    "#84a344",
    "#476638",
    "#b5bb4b",
    "#e7769d",
    "#ce608b",
  ].map((c) => {
    const m = material(c);
    m.flatShading = true;
    return m;
  });
  const cream = material("#efdab0"),
    ivory = material("#f4ead1"),
    sandstone = material("#d7c7a1"),
    roof = material("#3e7084"),
    red = material("#c95843");
  const roofTiles = ["#335665", "#3c6272", "#496e7a", "#527985"].map((color) =>
    material(color),
  );
  const stoneTrim = material("#bb976f");
  const timber = material("#826342");
  const dark = material("#30444a"),
    glass = material(city ? "#bfe8de" : "#365d68", 0.4);
  const stone = ["#91866a", "#b1a385", "#657563"].map((c) => {
    const m = material(c);
    m.flatShading = true;
    return m;
  });
  const safe = (x: number, z: number, clearance: number) =>
    roadsideClear(track, x, z, clearance);
  const ground = (x: number, z: number) =>
    track.theme === "mountain" ? nearestTrack(x, z, track).y - 0.5 : -0.18;

  const tree = (
    x: number,
    z: number,
    h: number,
    pink: boolean,
    pine = false,
  ) => {
    if (!safe(x, z, h * 0.54)) return;
    const g = new THREE.Group();
    g.name = pink ? "coast-blossom-tree" : "landscape-branching-tree";
    g.position.set(x, ground(x, z), z);
    scene.add(g);
    solid(
      g,
      new THREE.CylinderGeometry(0.18, 0.38, h * 0.72, 6),
      bark,
      0,
      h * 0.36,
      0,
    );
    if (pine) {
      for (let j = 0; j < 3; j++)
        solid(
          g,
          new THREE.ConeGeometry(h * (0.36 - j * 0.07), h * 0.65, 7),
          leaves[j % 3],
          0,
          h * (0.55 + j * 0.19),
          0,
        );
    } else {
      for (let j = 0; j < 3; j++) {
        const a = j * 2.4;
        const branch = solid(
          g,
          new THREE.CylinderGeometry(0.1, 0.18, h * 0.42, 5),
          bark,
          Math.sin(a) * 0.55,
          h * 0.63,
          Math.cos(a) * 0.55,
        );
        branch.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
        const crown = solid(
          g,
          leafFaceted,
          leaves[pink ? 4 + (j % 2) : j % 4],
          Math.sin(a) * h * 0.17,
          h * (0.84 + (j % 2) * 0.18),
          Math.cos(a) * h * 0.17,
        );
        const crownRadius = h * (0.2 + random() * 0.045) * (pink ? 0.62 : 1);
        crown.scale.set(
          crownRadius * (0.88 + random() * 0.22),
          crownRadius * (1.08 + random() * 0.24),
          crownRadius * (0.88 + random() * 0.22),
        );
        crown.rotation.y = random() * 4;
      }
    }
  };
  const house = (x: number, z: number, heading: number, i: number) => {
    if (!safe(x, z, 6.4)) return;
    const g = new THREE.Group();
    g.name = "coast-slate-cottage";
    g.position.set(x, ground(x, z), z);
    g.rotation.y = heading;
    g.scale.set(
      0.88 + (i % 4) * 0.055,
      0.88 + (i % 3) * 0.07,
      0.92 + (i % 2) * 0.07,
    );
    scene.add(g);
    const walls = [cream, ivory, sandstone][i % 3];
    solid(g, new RoundedBoxGeometry(6, 6.2, 5.6, 2, 0.1), walls, 0, 3.1, 0);
    block(g, stoneTrim, 0, 0.27, 0, 6.14, 0.54, 5.74);
    // Gabled village cottages, with two slate slopes and a cream front gable.
    const gable = new THREE.Shape();
    gable.moveTo(-3, 6.18);
    gable.lineTo(0, 8.95);
    gable.lineTo(3, 6.18);
    gable.closePath();
    const gableGeometry = new THREE.ExtrudeGeometry(gable, {
      depth: 5.6,
      bevelEnabled: false,
    });
    gableGeometry.translate(0, 0, -2.8);
    solid(g, gableGeometry, walls);
    const slope = Math.atan2(2.95, 3.3);
    for (const side of [-1, 1]) {
      const panel = block(g, roof, side * 1.65, 7.61, 0, 4.55, 0.2, 6.4);
      panel.rotation.z = -side * slope;
      for (const front of [-3.23, 3.23]) {
        const fascia = block(
          g,
          roofTiles[2],
          side * 1.65,
          7.61,
          front,
          4.64,
          0.28,
          0.16,
        );
        fascia.rotation.z = -side * slope;
      }
      block(g, roofTiles[0], side * 3.38, 6.16, 0, 0.22, 0.28, 6.6);
      for (let row = 0; row < 4; row++)
        for (let column = 0; column < 6; column++) {
          const run = 0.45 + row * 0.82;
          const tile = block(
            g,
            roofTiles[(row + column + i) % 4],
            side * run,
            9.18 - run * Math.tan(slope),
            (column - 2.5) * 1.05,
            1.08,
            0.075,
            1.035,
          );
          tile.rotation.z = -side * slope;
        }
    }
    block(g, roofTiles[1], 0, 9.21, 0, 0.23, 0.2, 6.65);
    for (const front of [-2.94, 2.94])
      block(g, dark, 0, 6.2, front, 6.25, 0.16, 0.24);
    block(g, cream, 1.7, 8, 0, 0.7, 2.5, 0.8);
    block(g, stoneTrim, 1.7, 9.3, 0, 0.95, 0.25, 1.05);
    block(g, dark, 0, 1.48, 2.82, 1.72, 3, 0.16);
    block(g, timber, 0, 1.25, 2.93, 1.3, 2.5, 0.12);
    block(g, stoneTrim, 0, 2.62, 2.94, 1.8, 0.25, 0.3);
    for (const x of [-0.79, 0.79])
      block(g, stoneTrim, x, 1.25, 2.9, 0.21, 2.5, 0.25);
    block(g, dark, 0.38, 1.27, 2.93, 0.08, 0.16, 0.08);
    for (const x of [-0.32, 0.32])
      for (const y of [0.6, 1.67]) block(g, wood, x, y, 2.91, 0.48, 0.75, 0.04);
    for (const x of [-1.8, 1.8])
      for (const y of [1.8, 4.6]) {
        block(g, cream, x, y, 2.88, 1.45, 1.7, 0.12);
        block(g, glass, x, y, 2.98, 1.1, 1.35, 0.05);
        block(g, cream, x, y, 3.03, 0.1, 1.35, 0.06);
        block(g, cream, x, y, 3.04, 1.1, 0.1, 0.06);
        block(g, stoneTrim, x, y + 0.91, 2.98, 1.65, 0.23, 0.3);
        block(g, stoneTrim, x, y - 0.86, 3.02, 1.65, 0.23, 0.42);
        for (const side of [-1, 1]) {
          block(g, roof, x + side * 0.77, y, 3.01, 0.32, 1.37, 0.1);
          for (let slat = 0; slat < 5; slat++)
            block(
              g,
              roofTiles[2],
              x + side * 0.77,
              y - 0.5 + slat * 0.25,
              3.08,
              0.29,
              0.075,
              0.07,
            );
        }
      }
    // Side elevations remain modelled when the camera rounds the village bend.
    for (const side of [-1, 1]) {
      for (const z of [-1.6, 1.35])
        for (const y of [1.85, 4.6]) {
          block(g, stoneTrim, side * 3.05, y, z, 0.15, 1.72, 1.42);
          block(g, glass, side * 3.14, y, z, 0.08, 1.34, 1.08);
          block(g, ivory, side * 3.2, y, z, 0.08, 1.34, 0.08);
          block(g, ivory, side * 3.2, y, z, 0.08, 0.08, 1.08);
          block(g, stoneTrim, side * 3.18, y - 0.83, z, 0.42, 0.18, 1.62);
        }
      for (let row = 0; row < 7; row++) {
        block(
          g,
          stoneTrim,
          side * 3.02,
          0.7 + row * 0.77,
          (row % 2 ? 1 : -1) * 2.3,
          0.08,
          0.23,
          0.6,
        );
      }
    }
    block(g, glass, 0, 7, 2.82, 0.76, 1.2, 0.1);
    for (const x of [-0.49, 0.49])
      block(g, timber, x, 7, 2.9, 0.18, 1.47, 0.18);
    for (const y of [6.33, 7.67]) block(g, timber, 0, y, 2.9, 1.15, 0.18, 0.18);
    for (let j = 0; j < 9; j++) {
      const side = j % 2 ? -1 : 1;
      block(
        g,
        stoneTrim,
        side * (2.45 + (j % 3) * 0.16),
        0.65 + j * 0.58,
        2.83,
        0.48,
        0.23,
        0.08,
      );
    }
    // A small planter adds warm color without blocking the pavement.
    block(g, timber, -1.8, 0.97, 3.18, 1.65, 0.25, 0.42);
    for (let j = 0; j < 5; j++) {
      solid(
        g,
        new THREE.IcosahedronGeometry(0.19, 0),
        leaves[j % 3],
        -2.35 + j * 0.28,
        1.2,
        3.2,
      );
      solid(
        g,
        new THREE.IcosahedronGeometry(0.105, 0),
        red,
        -2.35 + j * 0.28,
        1.34,
        3.22,
      );
    }
    block(g, paleWood, 0, 0.15, 3.7, 6.8, 0.3, 2);
    block(g, stoneTrim, 0, 0.08, 4.94, 2.05, 0.16, 0.65);
    for (const x of [-2.8, 2.8]) block(g, wood, x, 1, 4.6, 0.15, 1.8, 0.15);
    // Deliberate porch beds restore flowers inside the village exclusion zone.
    for (const side of [-1, 1]) {
      const shrub = solid(
        g,
        leafFaceted,
        leaves[(i + 1) % 4],
        side * 2.25,
        0.42,
        3.55,
      );
      shrub.scale.set(0.62, 0.42, 0.52);
      for (let flower = 0; flower < 3; flower++) {
        block(
          g,
          bark,
          side * 2.25 + (flower - 1) * 0.28,
          0.5,
          3.88,
          0.035,
          0.42,
          0.035,
        );
        const bloom = solid(
          g,
          faceted,
          flower === 1 ? red : ivory,
          side * 2.25 + (flower - 1) * 0.28,
          0.76 + (flower % 2) * 0.08,
          3.88,
        );
        bloom.scale.set(0.14, 0.08, 0.14);
      }
    }
  };

  // Props are placed relative to each circuit rather than inside a fixed-size island.
  const count = coast ? 185 : city ? 72 : 150;
  for (let i = 0; i < count; i++) {
    const p = trackPoint((i + 0.25) / count, track),
      side = i % 4 === 0 ? 1 : -1;
    const offset =
      side *
      (trackWidth(p.t, track) / 2 +
        (side === 1 ? (coast ? 4.7 : 13) : 9 + random() * 24));
    const x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    if (!safe(x, z, 3)) continue;
    // Reserve the village frontage for deliberately spaced houses and trees.
    if (coast && side < 0 && p.t > 0.145 && p.t < 0.365) continue;
    if (!city) tree(x, z, 4.5 + random() * 4.5, coast && i % 5 === 0, !coast);
    else {
      const height = 10 + random() * 29,
        g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = p.heading;
      scene.add(g);
      const body = material(["#7796a0", "#637987", "#b1a797"][i % 3]);
      block(g, body, 0, height / 2, 0, 8, height, 8);
      block(g, dark, 0, height + 0.35, 0, 8.6, 0.7, 8.6);
      for (let y = 3; y < height - 1; y += 3.5)
        for (const wx of [-2.4, 0, 2.4]) {
          const windowMat = new THREE.MeshStandardMaterial({
            color: i % 3 ? "#bddec9" : "#efc991",
            emissive: i % 3 ? "#7aafaa" : "#bc7649",
            emissiveIntensity: 0.28,
          });
          block(g, windowMat, wx, y, 4.04, 1.2, 1.6, 0.05);
        }
      if (track.id === "city-factory") {
        solid(
          g,
          new THREE.CylinderGeometry(0.7, 1, height * 0.55, 8),
          dark,
          3,
          height * 1.1,
          0,
        );
        block(g, red, 0, 1, 4.5, 5, 2, 1);
      }
    }
  }

  if (coast) {
    // Large irregular stones break the extruded island outline into a rocky
    // shoreline. Their footprint follows the same expanded village headland.
    for (let i = 0; i < 62; i++) {
      const p = trackPoint((i + 0.4) / 62, track);
      const offset = trackWidth(p.t, track) / 2 + coastalShoreMargin(p.t) - 1;
      const x = p.x + Math.cos(p.heading) * offset,
        z = p.z - Math.sin(p.heading) * offset;
      if (!safe(x, z, 4.5)) continue;
      const boulder = solid(scene, faceted, stone[i % 2], x, -2.6, z);
      boulder.scale.set(
        2.8 + random() * 1.5,
        3 + random() * 1.5,
        2.8 + random() * 1.5,
      );
      boulder.rotation.set(0.1, p.heading + random() * 0.6, 0.15);
    }
    const village: { x: number; z: number; t: number }[] = [];
    for (let t = 0.17; t <= 0.35; t += 0.0015) {
      const p = trackPoint(t, track),
        offset = trackWidth(p.t, track) / 2 + 9.8 + (village.length % 4) * 1.45;
      const x = p.x - Math.cos(p.heading) * offset,
        z = p.z + Math.sin(p.heading) * offset;
      // Arc spacing contracts on the inside of a bend: test actual positions.
      if (
        !safe(x, z, 6.4) ||
        village.some((v) => Math.hypot(v.x - x, v.z - z) < 13.8)
      )
        continue;
      const i = village.length;
      house(x, z, p.heading + Math.PI / 2, i);
      village.push({ x, z, t });
      // Low hedges and rocks make a planted transition from doorstep to verge.
      for (const side of [-1, 1]) {
        const near = trackPoint(t + side * 0.0031, track);
        for (let j = 0; j < 3; j++) {
          const distance = trackWidth(near.t, track) / 2 + 4.2 + j * 1.1;
          const sx = near.x - Math.cos(near.heading) * distance,
            sz = near.z + Math.sin(near.heading) * distance;
          if (!safe(sx, sz, 1.1)) continue;
          const shrub = solid(
            scene,
            faceted,
            j === 0 ? stone[i % 3] : leaves[(i + j) % 3],
            sx,
            ground(sx, sz) + 0.4,
            sz,
          );
          shrub.scale.set(0.8 + j * 0.13, 0.55 + j * 0.12, 0.8);
          shrub.rotation.y = i * 0.8 + j;
        }
      }
    }
    // Taller crowns sit behind the gaps rather than obscuring the house fronts.
    for (let i = 1; i < village.length; i++) {
      const t = (village[i - 1].t + village[i].t) / 2,
        p = trackPoint(t, track),
        offset = trackWidth(t, track) / 2 + 20.5;
      const x = p.x - Math.cos(p.heading) * offset,
        z = p.z + Math.sin(p.heading) * offset;
      tree(x, z, 10.5 + (i % 3) * 1.1, i % 5 === 0);
    }
    const p = trackPoint(0.186, track);
    let offset = trackWidth(p.t, track) / 2 + 13;
    let x = p.x - Math.cos(p.heading) * offset,
      z = p.z + Math.sin(p.heading) * offset;
    while (!safe(x, z, 6)) {
      offset += 6;
      x = p.x - Math.cos(p.heading) * offset;
      z = p.z + Math.sin(p.heading) * offset;
    }
    const tower = new THREE.Group();
    tower.name = "coast-white-lighthouse";
    tower.position.set(x, 0, z);
    tower.scale.setScalar(0.85);
    scene.add(tower);
    solid(tower, new THREE.CylinderGeometry(1.7, 2.7, 18, 12), ivory, 0, 9, 0);
    solid(tower, new THREE.CylinderGeometry(2.8, 3, 2.5, 10), red, 0, 1.25, 0);
    solid(tower, new THREE.CylinderGeometry(3, 3, 0.55, 12), dark, 0, 18.2, 0);
    solid(tower, new THREE.CylinderGeometry(1.8, 1.8, 3, 10), glass, 0, 20, 0);
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4;
      block(
        tower,
        dark,
        Math.sin(a) * 1.9,
        20,
        Math.cos(a) * 1.9,
        0.14,
        3,
        0.14,
      );
      block(
        tower,
        dark,
        Math.sin(a) * 2.8,
        18.9,
        Math.cos(a) * 2.8,
        0.1,
        1.4,
        0.1,
      );
    }
    solid(
      tower,
      new THREE.TorusGeometry(2.8, 0.08, 5, 24),
      dark,
      0,
      19.5,
      0,
    ).rotation.x = Math.PI / 2;
    solid(tower, new THREE.ConeGeometry(2.5, 2, 10), red, 0, 22.5, 0);
    block(tower, dark, 0, 24, 0, 0.08, 2, 0.08);
    for (let y = 5; y < 17; y += 5)
      block(tower, glass, 0, y, 2.45 - y * 0.04, 0.55, 1.4, 0.15);
    block(tower, timber, 0, 1.3, 2.97, 1.1, 2.6, 0.15);
    block(tower, stoneTrim, 0, 2.7, 3.0, 1.5, 0.22, 0.22);
    addCoastalMeadow(scene, track, random, safe);
  }

  // Short verge grass uses a single vertex-colored mesh, so added density does
  // not add one draw call or one GPU allocation per blade.
  if (!city) {
    const positions: number[] = [],
      colors: number[] = [];
    const shades = ["#708b35", "#879c3e", "#4f7136", "#a5ae51"].map(
      (c) => new THREE.Color(c),
    );
    for (let i = 0; i < (coast ? 3600 : 1700); i++) {
      const p = trackPoint(
          coast && i % 3 === 0 ? 0.17 + random() * 0.15 : random(),
          track,
        ),
        side = i % 2 ? 1 : -1;
      if (coast && side < 0 && p.t > 0.115 && p.t < 0.425) continue;
      const offset = side * (trackWidth(p.t, track) / 2 + 1.5 + random() * 4.8);
      const x = p.x + Math.cos(p.heading) * offset;
      const z = p.z - Math.sin(p.heading) * offset;
      if (!safe(x, z, 1.1)) continue;
      const y = ground(x, z) + 0.02;
      for (let blade = 0; blade < 5; blade++) {
        const a = random() * Math.PI * 2,
          height = coast ? 0.14 + random() * 0.26 : 0.28 + random() * 0.5;
        const dx = Math.cos(a),
          dz = Math.sin(a),
          w = 0.045 + random() * 0.055;
        positions.push(
          x - dx * w,
          y,
          z - dz * w,
          x + dx * w,
          y,
          z + dz * w,
          x + dz * height * 0.4,
          y + height,
          z - dx * height * 0.4,
        );
        const color = shades[(i + blade) % shades.length];
        for (let vertex = 0; vertex < 3; vertex++)
          colors.push(color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const grass = solid(
      scene,
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    grass.castShadow = false;
    if (coast) grass.name = "coast-verge-grass";
  }

  // Roadside flowers and faceted shrubs share geometry/material batches.
  const flower = new THREE.MeshStandardMaterial({
    color: "#fff1c0",
    roughness: 1,
  });
  const gold = material("#efca51");
  for (let i = 0; i < (city ? 45 : coast ? 320 : 600); i++) {
    const p = trackPoint(random(), track),
      side = i % 2 ? 1 : -1;
    if (coast && side < 0 && p.t > 0.115 && p.t < 0.425) continue;
    const offset =
      side * (trackWidth(p.t, track) / 2 + 1.9 + random() * (coast ? 3 : 7));
    const x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    if (!safe(x, z, 2.9)) continue;
    const y = ground(x, z);
    if (coast || i % 6 === 0) {
      const rock = solid(
        scene,
        faceted,
        i % (coast ? 9 : 12) === 0 ? stone[i % 3] : leaves[i % 4],
        x,
        y + 0.35,
        z,
      );
      const size = coast ? 0.45 + random() * 0.7 : 0.7 + random() * 1.4;
      rock.scale.set(size * 1.3, size * 0.65, size);
      rock.rotation.y = random() * 6;
    } else if (!city && !coast) {
      for (let j = 0; j < 3; j++) {
        const obj = solid(
          scene,
          new THREE.SphereGeometry(0.1 + random() * 0.09, 5, 3),
          i % 3 ? flower : gold,
          x + random() * 0.8,
          y + 0.15 + random() * 0.18,
          z + random() * 0.8,
        );
        obj.scale.y = 0.35;
        obj.castShadow = false;
      }
    }
  }

  // Distant silhouette differs by biome and doesn't compete with the road.
  if (!coast && !city)
    for (let i = 0; i < 22; i++) {
      const a = (i * Math.PI * 2) / 22,
        r = track.radius + 50 + random() * 65,
        h = 28 + random() * 65;
      solid(
        scene,
        new THREE.ConeGeometry(25 + random() * 22, h, 6),
        stone[i % 3],
        Math.cos(a) * r,
        h / 2 - 12,
        Math.sin(a) * r,
      );
      solid(
        scene,
        new THREE.ConeGeometry(9, h * 0.32, 6),
        cream,
        Math.cos(a) * r,
        h * 0.85 - 12,
        Math.sin(a) * r,
      );
    }
  if (coast) addCoastalContactShadows(scene);
}
