import { buildMovingObstacles } from "./moving-obstacles.ts";
import { buildStaticObstacles } from './static-obstacle-models.ts';
import * as THREE from "three";
import { createKartModel } from "./kart-model.ts";
import { createKartVariant } from "./kart-variants.ts";
import { sanitizeKartId, type KartId } from "../shared/karts.ts";
import { DriverWardrobe } from './driver-wardrobe.ts';
import {AmbientStage} from './ambient-stage.ts';
import {AmbientFauna} from './ambient-fauna.ts';
import { GarageLighting } from "./garage-lighting.ts";
import { batchKartModel } from "./kart-batching.ts";
import { KartMotion } from "./kart-motion.ts";
import { separateRenderCars } from "./render-motion.ts";
import { fitKartPreview } from "./visual-camera.ts";
import { animalFenceOpening } from './obstacle-clearance.ts';
import { DrivingVfx, type DrivingVfxFrame } from "./vfx/driving.ts";
import { RaceVfx } from "./vfx/race.ts";
import { CourseVfx, type CourseTarget } from "./vfx/course.ts";
import { EnvironmentVfx } from "./vfx/environment.ts";
import { vfxBudget } from "./vfx/budgets.ts";
import { buildRoadReadability } from "./road-readability.ts";
import { buildShortcutGuidance } from "./shortcut-guidance.ts";
import { loadKartAsset, cloneKartAsset } from "./kart-asset.ts";
import { getLevel } from "../shared/levels.ts";
import { sceneStyle, enhanceWorldSurface } from './scene-style.ts';
import { buildVergeDetails, updateVergeDetails, terrainGroundSampler } from './verge-details.ts';
import { loadBiomeFoliage, updateBiomeFoliage, disposeBiomeFoliage } from './biome-foliage.ts';
import { buildLevelLandscape, decorateLevel } from "./level-scenery.ts";
import { buildDrivingSurfaces } from "./level-surfaces.ts";
import { addRoadWear, enhanceAsphalt } from "./road-surface.ts";
import { enhanceCoastTimber } from "./coast-timber.ts";
import {captureCoastReflection, type CoastReflectionProbe} from './coast-reflection.ts';
import {buildReferenceDressing} from './reference-dressing.ts';
import {createCoastLayout} from './coast-layout.ts';
import {createCoastGates} from './coast-gardens.ts';
import {
  loadCoastAssets,
  disposeCoastAssets,
  updateCoastAssets,
} from "./coast-assets.ts";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  buildLandscape,
  decorateLandscape,
  createSea,
  createSky,
  worldUV,
} from "./scenery.ts";
import {
  DEFAULT_TRACK,
  nearestTrack,
  type Track,
  trackPoint,
  trackWidth,
  shortcutWidthAt,
  shortcutSurfaceHeight,
  trackWidthRange,
  roadBoundaryOpen,
  type Point,
  angleDiff,
} from "../shared/track.ts";
import type { Car } from "../shared/race.ts";
import { validateContent, type Content } from "../shared/content.ts";
export type { Content } from "../shared/content.ts";
export async function loadContent(): Promise<Content> {
  const r = await fetch("/content.json");
  if (!r.ok) throw Error("无法加载赛道资源配置");
  return validateContent(await r.json());
}
const mat = (color: THREE.ColorRepresentation, roughness = 0.8) =>
  new THREE.MeshStandardMaterial({ color, roughness });
function mesh(
  g: THREE.BufferGeometry,
  m: THREE.Material,
  parent: THREE.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  if (m.userData.sign) {
    const back = new THREE.Mesh(g, m);
    back.position.set(x, y, z);
    back.rotation.y = Math.PI;
    parent.add(back);
  }
  return o;
}
function box(
  parent: THREE.Object3D,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  r = 0,
) {
  return mesh(
    r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d),
    m,
    parent,
    x,
    y,
    z,
  );
}
function label(text: string, bg: string, fg: string, w = 512, h = 128) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `900 ${h * 0.56}px Arial`;
  const textWidth = ctx.measureText(text).width;
  if (textWidth > w * 0.9)
    ctx.font = `900 ${(h * 0.56 * w * 0.9) / textWidth}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h * 0.54);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: t,
    side: THREE.FrontSide,
  });
  material.userData.sign = true;
  return material;
}
function disposeObjectResources(...roots: THREE.Object3D[]) {
  const objects = new Set<THREE.Object3D>(),
    geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  for (const root of roots) root.traverse((o) => objects.add(o));
  for (const o of objects) {
    if (o instanceof THREE.InstancedMesh) o.dispose();
    if (
      o instanceof THREE.DirectionalLight ||
      o instanceof THREE.SpotLight ||
      o instanceof THREE.PointLight
    )
      o.shadow.dispose();
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  }
  for (const m of materials) {
    for (const v of Object.values(m))
      if (v instanceof THREE.Texture) textures.add(v);
    m.dispose();
  }
  textures.forEach((t) => t.dispose());
  geometries.forEach((g) => g.dispose());
}
/** Road, markings and guardrails share the same varying-width profile as physics. */
export function buildRoadGeometry(
  scene: THREE.Scene,
  track: Track,
  roadMaterial: THREE.Material,
) {
  const level = getLevel(track.id),
    curbA = mat("#f4e8cf"),
    curbB = mat(level.accent);
  const railMaterial = mat(level.rail),
    postMaterial = mat(level.rail),
    lineMaterial = mat("#edf0de");
  if (level.biome === "coast") {
    curbB.color.set('#c97764');
    lineMaterial.color.set('#dbd5bd');
    for (const material of [railMaterial, postMaterial]) {
      material.color.set("#9d907b");
      material.roughness = 0.9;
    }
    enhanceCoastTimber(railMaterial);
    enhanceCoastTimber(postMaterial, true);
  }
  const interpolate = (a: Point, b: Point, f: number): Point => ({
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
    heading: a.heading + angleDiff(b.heading, a.heading) * f,
    t: (a.t + ((b.t < a.t ? b.t + 1 : b.t) - a.t) * f) % 1,
  });
  for (const [points, branch, closed] of [
    [track.points, "main", true],
    [track.shortcut, "shortcut", false],
  ] as const) {
    if (points.length < 2) continue;
    const count = points.length - (closed ? 0 : 1);
    const width = (p: Point) =>
      branch === "main" ? trackWidth(p.t, track) : shortcutWidthAt(p.t, track);
    const edge = (p: Point, lateral: number, height: number) => {
      const x=p.x+Math.cos(p.heading)*lateral,z=p.z-Math.sin(p.heading)*lateral;
      const y=branch==='shortcut'?shortcutSurfaceHeight(x,z,p.t,p.y,track):p.y;
      return new THREE.Vector3(x,y+height,z);
    };
    const strip = (
      name: string,
      inner: (p: Point) => number,
      outer: (p: Point) => number,
      material: THREE.Material,
      height: number,
      side?: -1 | 1,
      alternate = false,
    ) => {
      const vertices: number[] = [];
      for (let i = 0; i < count; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if (alternate && Math.floor(i / 3) % 2) continue;
        const subdivisions = side
          ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.8))
          : 1;
        for (let j = 0; j < subdivisions; j++) {
          const p = interpolate(a, b, j / subdivisions),
            q = interpolate(a, b, (j + 1) / subdivisions);
          if (
            side &&
            roadBoundaryOpen(interpolate(p, q, 0.5), side, track, branch, 0.4)
          )
            continue;
          vertices.push(
            ...edge(p, inner(p), height).toArray(),
            ...edge(q, inner(q), height).toArray(),
            ...edge(p, outer(p), height).toArray(),
            ...edge(q, inner(q), height).toArray(),
            ...edge(q, outer(q), height).toArray(),
            ...edge(p, outer(p), height).toArray(),
          );
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.computeVertexNormals();
      worldUV(geometry, 4);
      material.side = THREE.DoubleSide;
      mesh(geometry, material, scene).name = name;
    };
    const branchRoad =
      branch === "shortcut" && level.biome === "forest"
        ? mat("#be925c")
        : roadMaterial;
    strip(
      `${branch}-road`,
      (p) => -width(p) / 2,
      (p) => width(p) / 2,
      branchRoad,
      branch === "main" ? 0.03 : 0.04,
    );
    for (const side of [-1, 1] as const) {
      strip(
        `${branch}-shoulder`,
        (p) => (side * width(p)) / 2,
        (p) => side * (width(p) / 2 + 0.85),
        curbA,
        0.05,
        side,
      );
      strip(
        `${branch}-curb`,
        (p) => (side * width(p)) / 2,
        (p) => side * (width(p) / 2 + 0.85),
        curbB,
        0.064,
        side,
        true,
      );
      strip(
        `${branch}-edge-line`,
        (p) => side * (width(p) / 2 - 0.5),
        (p) => side * (width(p) / 2 - 0.33),
        lineMaterial,
        0.055,
        side,
      );
    }
    if (branch === "main" && track.theme === "city")
      strip(
        "main-centre-line",
        () => -0.065,
        () => 0.065,
        mat("#dfcf99"),
        0.06,
        undefined,
        true,
      );

    // Short, end-to-end rail segments follow both the edge taper and road grade.
    // Opening checks run on both ends and midpoint, so a junction never has a
    // long beam sticking across its mouth; the maximum extra opening is 0.8 m.
    const spans: { a: THREE.Vector3; b: THREE.Vector3 }[] = [],
      posts: THREE.Vector3[] = [];
    let sincePost = 0;
    for (let i = 0; i < count; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const distance = Math.hypot(b.x - a.x, b.z - a.z),
        pieces = Math.max(1, Math.ceil(distance / 0.8));
      for (let j = 0; j < pieces; j++) {
        const p = interpolate(a, b, j / pieces),
          q = interpolate(a, b, (j + 1) / pieces),
          m = interpolate(p, q, 0.5);
        sincePost += distance / pieces;
        const putPost = sincePost >= 4;
        if (putPost) sincePost = 0;
        for (const side of [-1, 1] as const) {
          if(track.id==='reference-coast-v1'&&side===-1&&m.t>.34&&m.t<.73)continue;
          if (branch === 'main' && [p, m, q].some(point => {
            const edgePoint = edge(point, side * (width(point) / 2 + 1.25), 0);
            return animalFenceOpening(track, edgePoint.x, edgePoint.z, .3);
          })) continue;
          if (
            [p, m, q].some((point) =>
              roadBoundaryOpen(point, side, track, branch, 1.25),
            )
          )
            continue;
          spans.push({
            a: edge(p, side * (width(p) / 2 + 1.25), 0),
            b: edge(q, side * (width(q) / 2 + 1.25), 0),
          });
          if (putPost) posts.push(edge(p, side * (width(p) / 2 + 1.25), 0.8));
        }
      }
    }
    const rail = new THREE.InstancedMesh(
      level.biome === "coast"
        ? new RoundedBoxGeometry(1, 1, 1, 1, 0.035)
        : new THREE.BoxGeometry(1, 1, 1),
      railMaterial,
      spans.length * 2,
    );
    rail.name = `${branch}-guardrail`;
    rail.castShadow = rail.receiveShadow = true;
    const dummy = new THREE.Object3D(),
      direction = new THREE.Vector3(),
      axis = new THREE.Vector3(0, 0, 1);
    let index = 0;
    for (const { a, b } of spans) {
      direction.copy(b).sub(a);
      const length = direction.length();
      dummy.quaternion.setFromUnitVectors(axis, direction.normalize());
      dummy.scale.set(0.2, 0.26, length + 0.035);
      for (const height of [0.64, 1.23]) {
        dummy.position.copy(a).add(b).multiplyScalar(0.5);
        dummy.position.y += height;
        dummy.updateMatrix();
        rail.setMatrixAt(index++, dummy.matrix);
      }
    }
    rail.instanceMatrix.needsUpdate = true;
    rail.computeBoundingSphere();
    scene.add(rail);
    const supports = new THREE.InstancedMesh(
      level.biome === "coast"
        ? new RoundedBoxGeometry(0.28, 1.6, 0.28, 1, 0.018)
        : new THREE.BoxGeometry(0.28, 1.6, 0.28),
      postMaterial,
      posts.length,
    );
    supports.name = `${branch}-guardrail-posts`;
    supports.castShadow = supports.receiveShadow = true;
    dummy.quaternion.identity();
    dummy.scale.set(1, 1, 1);
    posts.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.updateMatrix();
      supports.setMatrixAt(i, dummy.matrix);
    });
    supports.instanceMatrix.needsUpdate = true;
    supports.computeBoundingSphere();
    scene.add(supports);
  }
  const warning = mat("#ffc857"),
    ink = mat("#29373c");
  let previousWarning = -100;
  for (let metres = 8; metres < track.length; metres += 8) {
    const stop = { t: metres / track.length, width: trackWidth(metres / track.length, track) };
    const before = { width: trackWidth((metres - 55) / track.length, track) };
    if (
      metres - previousWarning < 100 ||
      stop.width > before.width - 3 ||
      stop.width > trackWidthRange(track).max * 0.76
    )
      continue;
    previousWarning = metres;
    const p = trackPoint(stop.t - 25 / track.length, track);
    for (const side of [-1, 1] as const) {
      const offset = side * (trackWidth(p.t, track) / 2 + 4.3),
        x = p.x + Math.cos(p.heading) * offset,
        z = p.z - Math.sin(p.heading) * offset;
      const road = nearestTrack(x, z, track);
      if (
        road.distance < road.roadWidth / 2 + 2 ||
        roadBoundaryOpen(p, side, track, "main", 4.3)
      )
        continue;
      const sign = new THREE.Group();
      sign.name = "narrow-road-warning";
      sign.position.set(x, p.y, z);
      sign.rotation.y = p.heading;
      scene.add(sign);
      box(sign, ink, 0, 1.5, 0, 0.16, 3, 0.16);
      box(sign, warning, 0, 3.45, 0, 2.35, 2.35, 0.18).rotation.z = Math.PI / 4;
      for (const face of [-1, 1])
        for (const edgeSide of [-1, 1]) {
          box(sign, ink, edgeSide * 0.5, 3.15, face * 0.11, 0.15, 0.65, 0.035);
          box(
            sign,
            ink,
            edgeSide * 0.34,
            3.7,
            face * 0.11,
            0.15,
            0.65,
            0.035,
          ).rotation.z = edgeSide * 0.42;
        }
    }
  }
}
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 1, 0.2, 2400);
  cars = new Map<string, THREE.Group>();
  elapsed = 0;
  quality = "high";
  motion = 1;
  private shotMode: "rear" | "front" | "side" | "wide" | "top" = "rear";
  private target = new THREE.Vector3();
  private perfStart = performance.now();
  private perfFrames = 0;
  private frameIntervals: number[] = [];
  private seeded = 531;
  private propellers: THREE.Group[] = [];
  private customDriver: THREE.Object3D | null = null;
  private drivingVfx?: DrivingVfx;
  private raceVfx?: RaceVfx;
  private courseVfx?: CourseVfx;
  private environmentVfx?: EnvironmentVfx;
  private isItemBoost = (id:string) => this.raceVfx?.boostKind(id) === 'item';
  private reducedMotion = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
  private scratch = new THREE.Object3D();
  private water: THREE.Mesh;
  private seaMaterial: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private sunOffset = new THREE.Vector3(-45, 65, 30);
  private roadMaterial: THREE.MeshStandardMaterial;
  private grassMaterial: THREE.MeshStandardMaterial;
  private textureReady: Promise<void>;
  private cameraReady = false;
  private kartMotion = new WeakMap<THREE.Group, KartMotion>();
  private kartTemplate?: THREE.Group;
  private kartVariants?: Map<KartId, THREE.Group>;
  private driverWardrobe?: DriverWardrobe;
  private garageLighting?: GarageLighting;
  private kartLoad?: Promise<void>;
  private disposed = false;
  private shortcutGuidance: ReturnType<typeof buildShortcutGuidance> | null = null;
  private movingObstacles: ReturnType<typeof buildMovingObstacles> | null = null;
  private environmentTarget?: THREE.WebGLRenderTarget;
  private coastReflection?: CoastReflectionProbe;
  private referenceDressing?: THREE.Group;
  private coastFallback?: THREE.Scene;
  private coastAssets?: THREE.Group;
  private coastLoad?: Promise<void>;
  private biomeFallback?: THREE.Group;
  private biomeFoliage?: THREE.Group;
  private biomeLoad?: Promise<void>;
  private biomeLandmark?: {x:number;y:number;z:number;heading:number};
  private biomeGround?: (x:number,z:number)=>number;
  private vergeDetails?: THREE.Group;
  private ambientStage?: AmbientStage;
  private ambientFauna?: AmbientFauna;
  private ambientElapsed = 0;
  private decorativeMeshes: THREE.Mesh[] = [];
  constructor(
    public canvas: HTMLCanvasElement,
    public content: Content,
    public track: Track = DEFAULT_TRACK,
    private thumbnail = false,
    private externalViewport = false,
  ) {
    const level = getLevel(track.id);
    const style = sceneStyle(level);
    this.scene.userData.visualStyle = { ...style, biome: level.biome };
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    // The main scene canvas survives map switches. Reset the retained WebGL
    // bindings before scene textures or shadow targets are created.
    this.renderer.resetState();
    this.renderer.setPixelRatio(
      thumbnail ? 1 : Math.min(devicePixelRatio, 1.75),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = style.exposure;
    this.scene.background = new THREE.Color(level.horizon);
    this.scene.fog = new THREE.Fog(
      level.horizon,
      level.biome === "forest" ? 170 : 550,
      level.biome === "forest" ? 650 : 1700,
    );
    this.scene.add(
      new THREE.HemisphereLight(
        level.biome === "coast" ? "#dceaf5" : style.hemisphereSky,
        level.biome === "coast" ? "#b69c74" : style.hemisphereGround,
        level.biome === "coast" ? level.ambient * 0.80 : style.ambient,
      ),
    );
    const sun = (this.sun = new THREE.DirectionalLight(
      level.biome === "coast" ? "#ffe4bc" : style.sunColor,
      level.biome === "coast" ? level.sun * 0.89 : style.sun,
    ));
    this.sunOffset.set(52, 54, -33);
    sun.position.copy(this.sunOffset);
    sun.castShadow = true;
    const shadowResolution = level.biome === "coast" ? 4096 : 2048;
    sun.shadow.mapSize.set(shadowResolution, shadowResolution);
    Object.assign(sun.shadow.camera, {
      left: -46,
      right: 46,
      top: 46,
      bottom: -46,
      near: 1,
      far: 200,
    });
    // Keep self-shadowing outside the wide stochastic PCF footprint on sloped walls.
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.00015;
    sun.shadow.radius = level.biome === "coast" ? 1.6 : 2;
    this.scene.add(sun);
    this.scene.add(sun.target);
    const sea = createSea(
      this.scene,
      level.water ?? content.ocean,
      level.biome === "mine",
    );
    this.water = sea.sea;
    this.water.visible = level.water !== null;
    this.seaMaterial = sea.material;
    this.sky = createSky(this.scene, this.track.theme, level);
    // A small lighting-only scene supplies actual sky/ground reflections to paint
    // and visors. It is baked once per world, never captured every animation frame.
    const environment = new THREE.Scene();
    createSky(environment, this.track.theme, level);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(5000, 5000),
      new THREE.MeshBasicMaterial({ color: level.biome === 'coast' ? level.ground : style.hemisphereGround }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -12;
    environment.add(ground);
    const reflectionSun = new THREE.Mesh(
      new THREE.SphereGeometry(level.biome === "coast" ? 14 : 9, 12, 8),
      new THREE.MeshBasicMaterial({ color: level.biome === "coast"
        ? new THREE.Color(2.2, 2.05, 1.8) : new THREE.Color(3.5, 3.1, 2.5) }),
    );
    reflectionSun.position.copy(sun.position);
    environment.add(reflectionSun);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    try {
      this.environmentTarget = pmrem.fromScene(environment, 0, 0.1, 2500, {
        size: thumbnail ? 64 : 128,
      });
      this.scene.environment = this.environmentTarget.texture;
      this.scene.environmentIntensity = level.biome === "coast" ? 0.5 : style.environment;
    } finally {
      pmrem.dispose();
      disposeObjectResources(environment);
    }
    this.roadMaterial = mat(style.road, level.biome === "ice" ? 0.36 : level.biome === 'space' ? .56 : 0.94);
    // Reference asphalt is a readable warm charcoal, with aggregate visible in shade.
    if (level.biome === "coast") {
      this.roadMaterial.color.set("#c4b9aa");
      enhanceAsphalt(this.roadMaterial);
    }
    if (['harbor','city','factory','mine'].includes(level.biome)) enhanceAsphalt(this.roadMaterial);
    if (['desert','forest','ice','space'].includes(level.biome)) enhanceWorldSurface(this.roadMaterial,level.biome,'road');
    this.grassMaterial = mat(style.ground, 1);
    if (level.biome === "coast") {
      this.grassMaterial.color.set("#b2b765");
      this.grassMaterial.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          float meadowLuma = dot(diffuseColor.rgb, vec3(.2126,.7152,.0722));
          diffuseColor.rgb = mix(vec3(meadowLuma), diffuseColor.rgb, .8);`,
        );
      };
      this.grassMaterial.customProgramCacheKey = () =>
        "coastal-meadow-muted-v2";
    }
    if(track.id!=='reference-coast-v1')enhanceWorldSurface(this.grassMaterial,level.biome,'ground');
    // Texture objects exist before batching so UVs and material grouping remain valid.
    const loader = new THREE.TextureLoader();
    const pendingTextures: Promise<void>[] = [];
    const prepareTexture = (path: string) => {
      let complete!: () => void, fail!: (error: Error) => void;
      pendingTextures.push(
        new Promise<void>((resolve, reject) => {
          complete = resolve;
          fail = reject;
        }),
      );
      const texture = loader.load(path, complete, undefined, () =>
        fail(Error("无法加载场景贴图")),
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      return texture;
    };
    if (!["ice", "space", "desert", "forest"].includes(level.biome))
      this.roadMaterial.map = prepareTexture(
        content.roadTexture || "/textures/coast-asphalt.png",
      );
    if (["coast", "forest"].includes(level.biome))
      this.grassMaterial.map = prepareTexture(
        content.grassTexture || "/textures/coast-grass.png",
      );
    this.textureReady = Promise.all(pendingTextures).then(() => undefined);
    if (level.biome === "coast")
      buildLandscape(this.scene, this.track, this.grassMaterial);
    else buildLevelLandscape(this.scene, this.track, this.grassMaterial);
    this.buildTrack();
    if (level.biome === "coast") {
      addRoadWear(this.scene, this.track);
      this.scene.getObjectByName("coast-road-wear")!.userData.dynamic = true;
    }
    buildDrivingSurfaces(this.scene, this.track);
    buildRoadReadability(this.scene, this.track);
    if (level.biome === "coast") {
      const fallback = (this.coastFallback = new THREE.Scene());
      fallback.name = "coast-procedural-fallback";
      decorateLandscape(fallback, this.track, () => this.random());
      // These ground layers follow the physical shore and remain beneath either asset set.
      for (const name of ["coast-verge-grass", "coast-shore-foam"]) {
        const object = fallback.getObjectByName(name);
        if (object) this.scene.add(object);
      }
      fallback.traverse((object) => {
        object.userData.coastFallback = true;
      });
      this.scene.add(fallback);
    } else decorateLevel(this.scene, this.track, () => this.random());
    if (level.biome === 'forest') {
      this.biomeGround=terrainGroundSampler(this.scene);
      const landmark=this.scene.getObjectByName('forest-ancient-redwood');
      if(landmark)this.biomeLandmark={x:landmark.position.x,y:landmark.position.y,z:landmark.position.z,heading:landmark.rotation.y};
      const fallback=this.biomeFallback=new THREE.Group();fallback.name='forest-procedural-fallback';
      const materials=new Map<THREE.Material,THREE.Material>();
      for(const tree of [...this.scene.children].filter(o=>o.name==='forest-giant-tree'||o.name==='forest-ancient-redwood')){
        tree.traverse(o=>{if(o instanceof THREE.Mesh){o.userData.biomeFallback=true;
          const copy=(m:THREE.Material)=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m)!};
          o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);
        }});fallback.add(tree);
      }
      this.scene.add(fallback);
    }
    if(level.biome==='coast')this.scene.add(createCoastGates(this.track,createCoastLayout(this.track)));
    this.vergeDetails=buildVergeDetails(this.scene,this.track);
    const ambientGround=thumbnail?undefined:terrainGroundSampler(this.scene);
    // Capture authored emitter locations before static meshes are combined.
    if (!thumbnail) this.environmentVfx = new EnvironmentVfx(this.scene, this.track);
    this.batchStatic();
    if (!thumbnail) {
      this.ambientStage=new AmbientStage(this.scene,this.track,{groundHeight:ambientGround});
      this.ambientFauna=new AmbientFauna(this.scene,this.track,{groundHeight:ambientGround});
      this.drivingVfx = new DrivingVfx(this.scene, this.track);
      this.raceVfx = new RaceVfx(this.scene, this.track);
      this.courseVfx = new CourseVfx(this.scene, this.track);
    }
    this.resize();
    if (!thumbnail&&!externalViewport) window.addEventListener("resize", this.onResize);
  }
  async loadAssets() {
    if (this.disposed) return;
    await this.textureReady;
    if (this.disposed) return;
    if (!this.thumbnail) {
      this.kartLoad ??= this.loadKartScene();
      await this.kartLoad;
      if (this.disposed) return;
    }
    if (this.coastFallback) {
      this.coastLoad ??= this.loadCoastScene();
      await this.coastLoad;
      if (this.disposed) return;
    }
    if (this.biomeFallback) {
      this.biomeLoad ??= this.loadBiomeScene();
      await this.biomeLoad;
      if(this.disposed)return;
    }
    const loader = new GLTFLoader();
    if (this.content.characterModel) {
      const gltf = await loader.loadAsync(this.content.characterModel);
      if (this.disposed) {
        disposeObjectResources(gltf.scene);
        return;
      }
      const b = new THREE.Box3().setFromObject(gltf.scene),
        size = b.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0 || size.y > 1000) {
        disposeObjectResources(gltf.scene);
        throw Error("角色模型尺寸无效");
      }
      this.customDriver = gltf.scene;
      this.customDriver.scale.setScalar(this.content.modelScale);
      this.pruneCars(new Set());
    }
    if (this.content.sceneModel) {
      const gltf = await loader.loadAsync(this.content.sceneModel);
      if (this.disposed) {
        disposeObjectResources(gltf.scene);
        return;
      }
      gltf.scene.scale.setScalar(this.content.modelScale);
      this.scene.add(gltf.scene);
    }
    // Compile the bounded VFX materials during loading, before first use in a race.
    for (const fx of [this.drivingVfx, this.raceVfx, this.courseVfx, this.environmentVfx])
      if (fx) this.renderer.compile(fx.group, this.camera, this.scene);
  }
  private async loadKartScene() {
    try {
      const template = await loadKartAsset();
      if (this.disposed) {
        disposeObjectResources(template);
        return;
      }
      this.kartTemplate = template;
      // A track change may render before the asynchronous asset is ready.
      // Replace those temporary procedural models on the next render frame.
      this.pruneCars(new Set());
      this.scene.userData.kartAssetStatus = "ready";
    } catch (error) {
      if (this.disposed) return;
      this.scene.userData.kartAssetStatus = "fallback";
      console.warn("Kart asset unavailable; using the editable procedural model.", error);
    }
  }
  private async loadBiomeScene() {
    try {
      const assets=await loadBiomeFoliage(this.track,{landmark:this.biomeLandmark,groundHeight:this.biomeGround});
      if(this.disposed){disposeBiomeFoliage(assets);return;}
      this.biomeFoliage=assets;this.scene.add(assets);
      if(this.biomeFallback){this.biomeFallback.removeFromParent();disposeObjectResources(this.biomeFallback);this.biomeFallback.clear();this.biomeFallback=undefined;}
      this.scene.userData.biomeAssetStatus='ready';
    }catch(error){if(!this.disposed){this.scene.userData.biomeAssetStatus='fallback';console.warn('Forest asset unavailable; retaining route scenery.',error);}}
  }
  private async loadCoastScene() {
    try {
      const assets = await loadCoastAssets(this.track);
      if (this.disposed) {
        disposeCoastAssets(assets);
        return;
      }
      const anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      assets.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (
            material instanceof THREE.MeshStandardMaterial &&
            /cottage|lighthouse/.test(object.name)
          )
            material.normalScale.set(0.65, 0.65);
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) value.anisotropy = anisotropy;
        }
      });
      this.coastAssets = assets;
      this.scene.add(assets);
      if(this.track.id==='reference-coast-v1')this.referenceDressing=buildReferenceDressing(this.scene,this.track,createCoastLayout(this.track),this.quality==='low');
      const fallback = this.coastFallback;
      this.coastFallback = undefined;
      if (fallback) {
        fallback.removeFromParent();
        disposeObjectResources(fallback);
        fallback.clear();
      }
      this.scene.userData.coastAssetStatus = "ready";
      if(!this.thumbnail){
        const p=trackPoint(this.track.id==='reference-coast-v1'?.526:.281,this.track);
        const excluded:THREE.Object3D[]=[...this.cars.values(),...this.itemMeshes.values()];
        for(const fx of [this.drivingVfx,this.raceVfx,this.courseVfx,this.environmentVfx])if(fx)excluded.push(fx.group);
        try{
          const started=performance.now();
          this.coastReflection=captureCoastReflection(this.renderer,this.scene,{position:new THREE.Vector3(p.x,p.y+2.1,p.z),excluded});
          for(const kart of this.cars.values())this.coastReflection.applyToKart(kart);
          this.scene.userData.reflectionCaptureMs=performance.now()-started;
        }catch(error){console.warn('Coast reflection unavailable; retaining sky reflection.',error);}
      }
      this.environmentVfx?.refreshAnchors();
    } catch (error) {
      if (this.disposed) return;
      this.scene.userData.coastAssetStatus = "fallback";
      console.warn(
        "Coast assets could not load; retaining procedural scenery.",
        error,
      );
    }
  }
  setQuality(q: string) {
    if(this.referenceDressing&&this.quality!==q){
      this.referenceDressing.removeFromParent();disposeObjectResources(this.referenceDressing);this.referenceDressing.clear();
      this.referenceDressing=buildReferenceDressing(this.scene,this.track,createCoastLayout(this.track),q==='low');
    }
    this.quality = q;
    this.renderer.setPixelRatio(
      q === "low" ? 1 : Math.min(devicePixelRatio, 1.75),
    );
    const shadows = q !== "low";
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      // Three.js caches USE_SHADOWMAP in material programs, including imported GLBs.
      this.scene.traverse((object) => {
        if (object instanceof THREE.Mesh)
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.needsUpdate = true;
      });
    }
    this.resize();
  }
  private random() {
    this.seeded = (this.seeded * 1664525 + 1013904223) >>> 0;
    return this.seeded / 4294967296;
  }
  private buildTrack() {
    const level = getLevel(this.track.id);
    buildRoadGeometry(this.scene, this.track, this.roadMaterial);
    this.movingObstacles = buildMovingObstacles(this.scene, this.track);
    if (this.track.shortcut.length)
      this.shortcutGuidance = buildShortcutGuidance(this.scene, this.track, label);
    buildStaticObstacles(this.scene, this.track);
    const start = trackPoint(0, this.track),
      startWidth = trackWidth(0, this.track),
      gateHalf = startWidth / 2 + 2.2,
      gate = new THREE.Group();
    gate.position.set(start.x, start.y, start.z);
    gate.rotation.y = start.heading;
    this.scene.add(gate);
    const white = mat("#ecf1d9"),
      dark = mat("#283944");
    for (const side of [-1, 1]) {
      box(gate, dark, side * gateHalf, 4.5, 0, 1, 9, 1);
      box(gate, mat(level.accent), side * gateHalf, 3.5, 0, 1.2, 0.3, 1.2);
    }
    box(gate, dark, 0, 9, 0, gateHalf * 2 + 2, 2, 1.5, 0.3);
    mesh(
      new THREE.PlaneGeometry(gateHalf * 2 - 1, 1.6),
      label(`${level.biome.toUpperCase()}  /  START`, "#283944", level.accent),
      gate,
      0,
      9,
      0.8,
    );
    const columns = Math.ceil(startWidth),
      tileWidth = startWidth / columns;
    for (let x = 0; x < columns; x++)
      for (let z = 0; z < 2; z++) {
        const flag = box(
          gate,
          (x + z) % 2 === 0 ? white : dark,
          (x + 0.5) * tileWidth - startWidth / 2,
          0.08,
          z - 0.5,
          tileWidth,
          0.035,
          1,
        );
        flag.castShadow = false;
      }
    for (let i = 1; i < (this.track.id==='reference-coast-v1'?0:12); i++) {
      const p = trackPoint(i / 12, this.track),
        g = new THREE.Group();
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading;
      this.scene.add(g);
      for (const s of [-1, 1]) {
        const side = s as -1 | 1,
          lateral = side * (trackWidth(p.t, this.track) / 2 + 3.2);
        const road = nearestTrack(
          p.x + Math.cos(p.heading) * lateral,
          p.z - Math.sin(p.heading) * lateral,
          this.track,
        );
        if (
          roadBoundaryOpen(p, side, this.track, "main", 3.2) ||
          road.distance < road.roadWidth / 2 + 1.2
        )
          continue;
        box(g, mat("#fff9dd"), lateral, 1.8, 0, 0.15, 3.6, 0.15);
        mesh(
          new THREE.PlaneGeometry(1.9, 1.2),
          label(String(i).padStart(2, "0"), "#324f57", "#fff7d8", 160, 100),
          g,
          lateral,
          3.3,
          0,
        );
      }
    }
  }
  private batchStatic() {
    this.scene.updateMatrixWorld(true);
    const groups = new Map<
      string,
      {
        material: THREE.Material;
        geos: THREE.BufferGeometry[];
        objects: THREE.Mesh[];
      }
    >();
    this.scene.traverse((o) => {
      if (
        !(o instanceof THREE.Mesh) ||
        o.userData.dynamic ||
        o instanceof THREE.InstancedMesh ||
        Array.isArray(o.material)
      )
        return;
      for (let p: THREE.Object3D | null = o; p; p = p.parent)
        if (this.propellers.includes(p as THREE.Group)) return;
      const m = o.material as THREE.MeshStandardMaterial;
      const key = [
        Boolean(o.userData.coastFallback),
        Boolean(o.userData.biomeFallback),
        Boolean(o.userData.decorative),
        m.type,
        m.color?.getHexString(),
        m.roughness,
        m.metalness,
        m.emissive?.getHexString(),
        m.emissiveIntensity,
        m.opacity,
        m.transparent,
        m.depthWrite,
        m.vertexColors,
        m.flatShading,
        m.bumpMap?.uuid,
        m.normalMap?.uuid,
        o.castShadow,
        o.receiveShadow,
        m.side,
        m.map?.uuid,
        m.customProgramCacheKey(),
        Math.floor(o.matrixWorld.elements[12] / 100),
        Math.floor(o.matrixWorld.elements[14] / 100),
      ].join("/");
      const g = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      if (!m.map) g.deleteAttribute("uv");
      g.applyMatrix4(o.matrixWorld);
      const b = groups.get(key) || {
        material: o.material,
        geos: [] as THREE.BufferGeometry[],
        objects: [] as THREE.Mesh[],
      };
      b.geos.push(g);
      b.objects.push(o);
      groups.set(key, b);
    });
    const oldGeo = new Set<THREE.BufferGeometry>();
    const oldMaterials = new Set<THREE.Material>();
    for (const b of groups.values()) {
      const merged = mergeGeometries(b.geos);
      if (!merged) {
        b.geos.forEach((g) => g.dispose());
        continue;
      }
      const o = new THREE.Mesh(merged, b.material);
      o.castShadow = b.objects[0].castShadow;
      o.receiveShadow = b.objects[0].receiveShadow;
      if(b.objects[0].userData.decorative){merged.computeBoundingSphere();o.userData.decorative=true;(this.decorativeMeshes??=[]).push(o);}
      const isFallback = Boolean(b.objects[0].userData.coastFallback);
      o.userData.coastFallback = isFallback;
      (isFallback && this.coastFallback ? this.coastFallback : b.objects[0].userData.biomeFallback && this.biomeFallback ? this.biomeFallback : this.scene).add(
        o,
      );
      for (const old of b.objects) {
        old.removeFromParent();
        oldGeo.add(old.geometry);
        oldMaterials.add(old.material as THREE.Material);
      }
      b.geos.forEach((g) => g.dispose());
    }
    // Equivalent materials can merge while one instance is still used by a
    // different spatial cell, a dynamic mesh, or an instanced object.
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      oldGeo.delete(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        oldMaterials.delete(m);
    });
    oldGeo.forEach((g) => g.dispose());
    oldMaterials.forEach((m) => m.dispose());
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.coastReflection?.dispose();
    this.coastReflection=undefined;
    window.removeEventListener("resize", this.onResize);
    if (this.coastAssets) disposeCoastAssets(this.coastAssets);
    this.coastAssets = undefined;
    if(this.biomeFoliage)disposeBiomeFoliage(this.biomeFoliage);
    this.biomeFoliage=undefined;
    this.drivingVfx?.dispose();
    this.drivingVfx = undefined;
    this.raceVfx?.dispose();
    this.courseVfx?.dispose();
    this.environmentVfx?.dispose();
    this.ambientStage?.dispose();
    this.ambientStage=undefined;
    this.ambientFauna?.dispose();
    this.ambientFauna=undefined;
    this.raceVfx = undefined;
    this.courseVfx = undefined;
    this.environmentVfx = undefined;
    disposeObjectResources(
      this.scene,
      ...(this.customDriver ? [this.customDriver] : []),
      ...(this.kartTemplate ? [this.kartTemplate] : []),
      ...(this.kartVariants?.values() ?? []),
    );
    this.scene.clear();
    this.coastFallback = undefined;
    this.biomeFallback = undefined;
    this.biomeGround=undefined;
    this.vergeDetails=undefined;
    this.decorativeMeshes=[];
    this.referenceDressing = undefined;
    this.cars.clear();
    this.itemMeshes.clear();
    this.propellers.length = 0;
    this.customDriver = null;
    this.kartTemplate = undefined;
    this.kartVariants?.clear();
    this.driverWardrobe?.dispose();
    this.driverWardrobe = undefined;
    this.garageLighting = undefined;
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = undefined;
    // The next renderer creates internal 3D placeholder textures inside its
    // constructor. Restore unpack flags and bindings before handing over the
    // surviving canvas/context, not only after constructing that renderer.
    this.renderer.resetState();
    this.renderer.dispose();
  }
  private onResize = () => this.resize();
  private itemMeshes = new Map<string, THREE.InstancedMesh>();
  private pendingItems: import("../shared/items.ts").ItemWorld | null = null;
  renderItems(w: import("../shared/items.ts").ItemWorld | null) {
    this.pendingItems = w;
  }
  private updateItems() {
    const w = this.pendingItems;
    if (!w && this.itemMeshes.size === 0) return;
    const types = ["box", "trap", "missile", "shield"];
    for (const type of types) {
      let mesh = this.itemMeshes.get(type);
      if (!mesh) {
        const geo =
          type === "box"
            ? new THREE.OctahedronGeometry(1.1)
            : type === "trap"
              ? new THREE.ConeGeometry(1.4, 0.5, 3)
              : type === "shield"
                ? new THREE.SphereGeometry(2.1, 12, 8)
                : new THREE.SphereGeometry(0.5, 8, 6);
        const material = new THREE.MeshBasicMaterial({
          color: (
            {
              box: "#f7cf62",
              trap: "#ff7284",
              missile: "#f7a259",
              shield: "#87e7ff",
            } as Record<string, string>
          )[type],
          transparent: true,
          opacity: type === "shield" ? 0.23 : 0.9,
          wireframe: type === "box",
          depthWrite: false,
        });
        mesh = new THREE.InstancedMesh(geo, material, 64);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.itemMeshes.set(type, mesh);
      }
      const positions = w
        ? type === "box"
          ? w.boxes.filter((b) => b.readyAt <= w.time)
          : type === "trap"
            ? w.traps
            : type === "missile"
              ? w.missiles
              : [...this.cars]
                  .filter(([id]) => (w.players[id]?.shield || 0) > 0)
                  .map(([, g]) => ({ x: g.position.x, y: g.position.y, z: g.position.z }))
        : [];
      mesh.count = Math.min(positions.length, 64);
      mesh.visible = mesh.count > 0;
      positions.slice(0, 64).forEach((p, i) => {
        this.scratch.position.set(
          p.x,
          ("y" in p && typeof p.y === "number" ? p.y : nearestTrack(p.x, p.z, this.track).y) + (type === "trap" ? 0.3 : 1.4),
          p.z,
        );
        this.scratch.rotation.set(0, type === "box" ? this.elapsed : 0, 0);
        this.scratch.scale.setScalar(1);
        this.scratch.updateMatrix();
        mesh!.setMatrixAt(i, this.scratch.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  private kart(color: string, kartId: KartId = 'club') {
    let g: THREE.Group;
    if (kartId === 'club') {
      g = this.kartTemplate
        ? cloneKartAsset(this.kartTemplate, color)
        : batchKartModel(createKartModel(color));
    } else {
      this.kartVariants ??= new Map();
      let template = this.kartVariants.get(kartId);
      if (!template) {
        template = batchKartModel(createKartVariant(kartId, color));
        this.kartVariants.set(kartId, template);
      }
      g = cloneKartAsset(template, color);
    }
    g.userData.kartId = kartId;
    this.coastReflection?.applyToKart(g);
    return g;
  }
  private cloneDriver() {
    const d = this.customDriver!.clone(true);
    d.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry = o.geometry.clone();
        const clone = (m: THREE.Material) => {
          const n = m.clone();
          for (const [k, v] of Object.entries(n))
            if (v instanceof THREE.Texture)
              (n as unknown as Record<string, unknown>)[k] = v.clone();
          return n;
        };
        o.material = Array.isArray(o.material)
          ? o.material.map(clone)
          : clone(o.material);
      }
    });
    return d;
  }
  pruneCars(seen: ReadonlySet<string>) {
    for (const [id, g] of this.cars)
      if (!seen.has(id)) {
        this.coastReflection?.releaseKart(g);
        this.scene.remove(g);
        disposeObjectResources(g);
        this.cars.delete(id);
      }
  }
  resetCamera() {
    this.cameraReady = false;
  }
  resetVfx() {
    this.drivingVfx?.reset();
    this.raceVfx?.reset();
    this.courseVfx?.reset();
    this.environmentVfx?.reset();
    this.pendingItems = null;
    for (const mesh of this.itemMeshes.values()) mesh.visible = false;
  }
  setShotMode(mode: string) {
    this.shotMode = ["front", "side", "wide", "top", "rear"].includes(mode)
      ? (mode as "rear" | "front" | "side" | "wide" | "top")
      : "rear";
    this.cameraReady = false;
  }
  previewPoint() {
    return trackPoint(getLevel(this.track.id).preview.t, this.track);
  }
  captureThumbnail() {
    this.renderer.render(this.scene, this.camera);
    const output = document.createElement("canvas");
    output.width = 480;
    output.height = 270;
    output.getContext("2d")!.drawImage(this.canvas, 0, 0, 480, 270);
    return output.toDataURL("image/webp", 0.75);
  }
  resize() {
    const w = this.thumbnail ? 480 : window.innerWidth,
      h = this.thumbnail ? 270 : window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  render(
    cars: Car[],
    localId: string,
    dt: number,
    preview: boolean,
    measuredMs = dt * 1000,
    localSteer?: number,
    vfxFrame?: Pick<DrivingVfxFrame, "active" | "paused" | "authoritative"> & { targets?: readonly CourseTarget[]; failed?: boolean; raceClock?: number },
  ) {
    this.elapsed += dt;
    if(!vfxFrame?.paused&&Number.isFinite(dt))this.ambientElapsed+=Math.max(0,Math.min(.1,dt));
    this.shortcutGuidance?.updateLanguage();
    const raceClock = preview ? 0 : vfxFrame?.raceClock ?? cars.find(c => c.id === localId)?.time ?? 0;
    this.movingObstacles?.update(raceClock);
    if (!preview) cars = separateRenderCars(cars, this.track, raceClock);
    const seen = new Set<string>(cars.map((c) => c.id));
    this.pruneCars(seen);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      seen.add(c.id);
      let g = this.cars.get(c.id);
      const kartId = sanitizeKartId(c.kartId);
      if (g && g.userData.kartId !== kartId) {
        this.coastReflection?.releaseKart(g);
        this.scene.remove(g);
        disposeObjectResources(g);
        this.cars.delete(c.id);
        g = undefined;
      }
      if (!g) {
        g = this.kart(
          this.content.palette[c.slot % this.content.palette.length],
          kartId,
        );
        if (c.id === "ghost")
          g.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              const m = o.material as THREE.Material;
              m.transparent = true;
              m.opacity = 0.28;
              o.castShadow = false;
            }
          });
        this.cars.set(c.id, g);
        this.scene.add(g);
      }
      this.driverWardrobe ??= new DriverWardrobe();
      if(this.driverWardrobe.apply(g,c.driverOutfit===undefined?undefined:{outfitId:c.driverOutfit,colorId:c.driverColor!},this.content.palette[c.slot % this.content.palette.length],this.customDriver?()=>this.cloneDriver():undefined,driver=>this.coastReflection?.releaseKart(driver))){
        this.coastReflection?.applyToKart(g);
        if(c.id==='ghost')g.getObjectByName('driver')?.traverse(n=>{if(n instanceof THREE.Mesh){for(const m of Array.isArray(n.material)?n.material:[n.material]){m.transparent=true;m.opacity=.28;}n.castShadow=false;}});
      }
      g.position.set(c.x, nearestTrack(c.x, c.z, this.track).y, c.z);
      g.visible =
        c.id === "ghost" ||
        c.ghostTime <= 0 ||
        Math.floor(this.elapsed * 12) % 3 !== 0;
      g.rotation.set(0, c.heading, 0);
      let motion = this.kartMotion.get(g);
      if (!motion) {
        motion = new KartMotion(g);
        this.kartMotion.set(g, motion);
      }
      motion.update(c, dt, preview ? 0 : c.id === localId ? localSteer : undefined);
    }
    for (const [id, g] of this.cars) if (!seen.has(id)) g.visible = false;
    const inspectingKart = !this.thumbnail && preview && cars.length === 1 && !!document.querySelector('.garage-panel');
    if (inspectingKart && !this.garageLighting) {
      this.garageLighting = new GarageLighting((x, z) => nearestTrack(x, z, this.track).y);
      this.scene.add(this.garageLighting.group);
    }
    this.garageLighting?.update(inspectingKart, cars.length === 1 ? this.cars.get(cars[0].id) : undefined);
    for (const p of this.propellers) p.rotation.z += dt * 0.5;
    if (preview) {
      const p = this.previewPoint(),
        f = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading)),
        r = new THREE.Vector3(Math.cos(p.heading), 0, -Math.sin(p.heading));
      const anchor = new THREE.Vector3(p.x, p.y, p.z);
      const narrow = !this.thumbnail && window.innerWidth < 760;
      const screenRight = new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(anchor, this.camera.position),
          new THREE.Vector3(0, 1, 0),
        )
        .normalize();
      if (this.thumbnail) {
        const view = getLevel(this.track.id).preview;
        this.camera.position
          .copy(anchor)
          .addScaledVector(f, -view.forward * 1.5)
          .addScaledVector(r, view.side * 1.4);
        this.camera.position.y += view.height;
        this.target
          .copy(anchor)
          .addScaledVector(f, 30)
          .addScaledVector(r, -Math.sign(view.side) * 12);
        this.target.y += 5;
        this.camera.fov = 58;
      } else if (this.shotMode === "front") {
        this.camera.position
          .copy(anchor)
          .addScaledVector(f, 9.5)
          .addScaledVector(r, 0.6);
        this.camera.position.y += 3.9;
        this.target
          .copy(anchor)
          .addScaledVector(f, -1.8)
          .addScaledVector(r, 0.2);
        this.target.y += 1.5;
        this.camera.fov = narrow ? 52 : 48;
      } else if (this.shotMode === "side") {
        this.camera.position
          .copy(anchor)
          .addScaledVector(f, 5.8)
          .addScaledVector(r, 8.2);
        this.camera.position.y += 4.1;
        this.target
          .copy(anchor)
          .addScaledVector(screenRight, narrow ? 0.3 : -1.4);
        this.target.y += 1.4;
        this.camera.fov = narrow ? 50 : 46;
      } else if (this.shotMode === "top") {
        this.camera.position
          .copy(anchor)
          .addScaledVector(f, 1.8)
          .addScaledVector(r, 0.8);
        this.camera.position.y += 10.5;
        this.target.copy(anchor);
        this.target.y += 0.6;
        this.camera.fov = narrow ? 52 : 50;
      } else if (this.shotMode === "wide") {
        this.camera.position
          .copy(anchor)
          .addScaledVector(f, 7.1)
          .addScaledVector(r, 6.4);
        this.camera.position.y += 5.0;
        this.target.copy(anchor).addScaledVector(screenRight, -3.6);
        this.target.y += 1.3;
        this.camera.fov = narrow ? 56 : 54;
      } else {
        this.camera.position
          .copy(anchor)
          .addScaledVector(f, -10.5)
          .addScaledVector(r, -3.6);
        this.camera.position.y += 4.3;
        screenRight
          .crossVectors(
            new THREE.Vector3().subVectors(anchor, this.camera.position),
            new THREE.Vector3(0, 1, 0),
          )
          .normalize();
        this.target
          .copy(anchor)
          .addScaledVector(f, 3)
          .addScaledVector(
            screenRight,
            narrow ? -0.2 : document.documentElement.dir === "rtl" ? 2.9 : -2.9,
          );
        this.target.y += narrow ? 1.2 : 1.3;
        this.camera.fov = narrow ? 49 : 44;
      }
      this.camera.lookAt(this.target);
      // Inspect the one-car garage in the space left by its real panel bounds.
      // This only frames the visual model; race/chase camera and physics are unchanged.
      const garage = !this.thumbnail && cars.length === 1
        ? document.querySelector<HTMLElement>(".garage-panel") : null;
      const kart = cars.length === 1 ? this.cars.get(cars[0].id) : undefined;
      if (garage && kart) {
        const panel = garage.getBoundingClientRect();
        const header = document.querySelector(".header")?.getBoundingClientRect();
        const footer = document.querySelector(".footer")?.getBoundingClientRect();
        const width = window.innerWidth, height = window.innerHeight;
        const top = Math.max(90, header?.bottom ?? 0) + 28;
        const bottom = Math.min(height - 28, footer?.top ?? height) - 28;
        const region = width <= 600
          ? { left: 30, right: width - 30, top, bottom: Math.min(bottom, panel.top - 22) }
          : panel.left > width / 2
            ? { left: 48, right: panel.left - 44, top, bottom }
            : { left: panel.right + 44, right: width - 48, top, bottom };
        this.camera.fov = 40;
        const subject=garage.dataset.garageActive==='driver'?kart.getObjectByName('driver')??kart:kart;
        fitKartPreview(this.camera, new THREE.Box3().setFromObject(subject), { width, height }, region);
      }
      this.cameraReady = false;
    } else {
      const c = cars.find((c) => c.id === localId);
      if (c) {
        const speed = Math.abs(c.speed),
          distance = 7.8 + speed * 0.025;
        const pY = nearestTrack(c.x, c.z, this.track).y;
        const desired =
          this.shotMode === "front"
            ? new THREE.Vector3(
                c.x + Math.sin(c.heading) * (distance + 2.5),
                pY + 3.8 + speed * 0.01,
                c.z + Math.cos(c.heading) * (distance + 2.5),
              )
            : this.shotMode === "side"
              ? new THREE.Vector3(
                  c.x - Math.cos(c.heading) * (distance - 2.4),
                  pY + 4.0 + speed * 0.01,
                  c.z + Math.sin(c.heading) * (distance - 2.4),
                )
              : new THREE.Vector3(
                  c.x - Math.sin(c.heading) * distance,
                  pY + 5.25 + speed * 0.006,
                  c.z - Math.cos(c.heading) * distance,
                );
        const aim =
          this.shotMode === "front"
            ? new THREE.Vector3(
                c.x - Math.sin(c.heading) * 6,
                pY + 1.1,
                c.z - Math.cos(c.heading) * 6,
              )
            : this.shotMode === "side"
              ? new THREE.Vector3(
                  c.x + Math.cos(c.heading) * 6,
                  pY + 1.1,
                  c.z - Math.sin(c.heading) * 6,
                )
              : new THREE.Vector3(
                  c.x + Math.sin(c.heading) * 7,
                  pY + 1.3,
                  c.z + Math.cos(c.heading) * 7,
                );
        const smooth = 1 - Math.exp(-7 * dt);
        if (!this.cameraReady) {
          this.camera.position.copy(desired);
          this.target.copy(aim);
          this.cameraReady = true;
        } else {
          this.camera.position.lerp(desired, smooth);
          this.target.lerp(aim, smooth);
        }
        this.camera.lookAt(this.target);
        this.camera.fov +=
          (57 + (c.boostTime > 0 ? 8 : 0) * this.motion - this.camera.fov) *
          smooth;
      }
    }
    const shadowCenter = preview
      ? this.previewPoint()
      : cars.find((c) => c.id === localId);
    if (shadowCenter) {
      this.sun.target.position.set(
        shadowCenter.x,
        nearestTrack(shadowCenter.x, shadowCenter.z, this.track).y,
        shadowCenter.z,
      );
      this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
      this.sun.target.updateMatrixWorld();
    }
    this.seaMaterial.uniforms.clock.value = this.elapsed;
    this.sky.position.copy(this.camera.position);
    this.camera.updateProjectionMatrix();
    if (this.coastAssets)
      updateCoastAssets(
        this.coastAssets,
        this.camera.position,
        this.quality === "low",
      );
    if (this.biomeFoliage)updateBiomeFoliage(this.biomeFoliage,this.camera.position,this.quality==='low');
    if(this.vergeDetails)updateVergeDetails(this.vergeDetails,this.camera.position,this.quality==='low');
    this.ambientStage?.update(this.ambientElapsed,this.camera.position,this.quality==='low',this.reducedMotion?.matches||this.motion<=0);
    this.ambientFauna?.update(this.ambientElapsed,this.camera.position,this.quality==='low',this.reducedMotion?.matches||this.motion<=0);
    for(const mesh of this.decorativeMeshes){const sphere=mesh.geometry.boundingSphere!;mesh.visible=Math.hypot(this.camera.position.x-sphere.center.x,this.camera.position.z-sphere.center.z)<(this.quality==='low'?150:260)+sphere.radius;}
    if (!this.raceVfx) this.updateItems();
    const vfxDt = measuredMs > 0 ? measuredMs / 1000 : dt;
    this.courseVfx?.update({
      active: !preview, paused: false, ...vfxFrame,
      targets: vfxFrame?.targets ?? [], failed: vfxFrame?.failed ?? false,
      quality: this.quality, motion: this.reducedMotion?.matches ? 0 : this.motion,
    }, vfxDt);
    this.raceVfx?.setPixelHeight(this.canvas.height);
    this.raceVfx?.update(cars, localId, this.pendingItems, vfxDt, {
      active: !preview, paused: false, ...vfxFrame,
      quality: this.quality, motion: this.reducedMotion?.matches ? 0 : this.motion,
    });
    this.drivingVfx?.setPixelHeight(this.canvas.height);
    // Presentation follows wall time, including suspended-frame cleanup.
    this.drivingVfx?.update(cars, localId, vfxDt, {
      active: !preview,
      paused: false,
      ...vfxFrame,
      itemBoost: this.isItemBoost,
      priorityImpact: this.raceVfx?.impactPressure,
      quality: this.quality,
      motion: this.reducedMotion?.matches ? 0 : this.motion,
    });
    this.environmentVfx?.update(cars.find(c => c.id === localId), vfxDt, {
      active: !preview, paused: false, ...vfxFrame,
      quality: this.quality, motion: this.reducedMotion?.matches ? 0 : this.motion,
      pixelHeight: this.canvas.height,
      pressure: this.raceVfx?.impactPressure || this.drivingVfx?.impactPressure || (this.raceVfx?.stats.particles ?? 0) > vfxBudget(this.quality).combat * .35,
    });
    this.renderer.render(this.scene, this.camera);
    if (import.meta.env.DEV) {
      this.perfFrames++;
      if (measuredMs > 0) this.frameIntervals.push(measuredMs);
      const now = performance.now();
      if (now - this.perfStart >= 2000) {
        this.canvas.dataset.fps = (
          (this.perfFrames * 1000) /
          (now - this.perfStart)
        ).toFixed(1);
        this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
        const sorted = this.frameIntervals.sort((a, b) => a - b);
        this.canvas.dataset.frameP95 = String(
          sorted[Math.floor(sorted.length * 0.95)] || 0,
        );
        this.canvas.dataset.longFrames = String(
          sorted.filter((v) => v > 33.34).length,
        );
        this.frameIntervals = [];
        this.perfFrames = 0;
        this.perfStart = now;
      }
    }
  }
}
