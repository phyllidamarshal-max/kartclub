import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  TRACK_POINTS,
  trackPoint,
  ROAD_WIDTH,
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
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 1, 0.2, 2400);
  cars = new Map<string, THREE.Group>();
  elapsed = 0;
  quality = "high";
  private target = new THREE.Vector3();
  private perfStart = performance.now();
  private perfFrames = 0;
  private seeded = 531;
  private propellers: THREE.Group[] = [];
  private customDriver: THREE.Object3D | null = null;
  private skidCursor = 0;
  private skids: THREE.InstancedMesh;
  private scratch = new THREE.Object3D();
  private water: THREE.Mesh;
  private cameraReady = false;
  constructor(
    public canvas: HTMLCanvasElement,
    public content: Content,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.scene.background = new THREE.Color("#91cbd1");
    this.scene.fog = new THREE.Fog("#91cbd1", 450, 1100);
    this.scene.add(new THREE.HemisphereLight("#ecfaff", "#778c80", 1.7));
    const sun = new THREE.DirectionalLight("#fff0d6", 2.5);
    sun.position.set(80, 160, -80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -180,
      right: 180,
      top: 180,
      bottom: -180,
      near: 1,
      far: 450,
    });
    sun.shadow.normalBias = 0.25;
    sun.shadow.bias = -0.00015;
    this.scene.add(sun);
    this.water = mesh(
      new THREE.PlaneGeometry(3000, 3000),
      mat(content.ocean, 0.38),
      this.scene,
      0,
      -7,
      0,
    );
    this.water.rotation.x = -Math.PI / 2;
    mesh(
      new THREE.CylinderGeometry(156, 140, 12, 80),
      mat("#d9c9a6"),
      this.scene,
      0,
      -6.8,
      0,
    );
    mesh(
      new THREE.CylinderGeometry(153, 154, 2, 80),
      mat(content.grass),
      this.scene,
      0,
      -1.2,
      0,
    );
    this.buildTrack();
    this.decorate();
    this.skids = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.22, 1.15),
      new THREE.MeshBasicMaterial({
        color: "#263941",
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
      480,
    );
    this.skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skids.frustumCulled = false;
    for (let i = 0; i < 480; i++) {
      this.scratch.position.set(0, -100, 0);
      this.scratch.updateMatrix();
      this.skids.setMatrixAt(i, this.scratch.matrix);
    }
    this.scene.add(this.skids);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  async loadAssets() {
    const loader = new GLTFLoader();
    if (this.content.characterModel) {
      const gltf = await loader.loadAsync(this.content.characterModel);
      const b = new THREE.Box3().setFromObject(gltf.scene),
        size = b.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0 || size.y > 1000)
        throw Error("角色模型尺寸无效");
      this.customDriver = gltf.scene;
      this.customDriver.scale.setScalar(this.content.modelScale);
      for (const c of this.cars.values()) {
        const d = c.getObjectByName("driver");
        if (d) c.remove(d);
        const n = this.customDriver.clone();
        n.position.y = 0.9;
        c.add(n);
      }
    }
    if (this.content.sceneModel) {
      const gltf = await loader.loadAsync(this.content.sceneModel);
      gltf.scene.scale.setScalar(this.content.modelScale);
      this.scene.add(gltf.scene);
    }
  }
  setQuality(q: string) {
    this.quality = q;
    this.renderer.setPixelRatio(
      q === "low" ? 1 : Math.min(devicePixelRatio, 1.75),
    );
    this.renderer.shadowMap.enabled = q !== "low";
    this.resize();
  }
  private random() {
    this.seeded = (this.seeded * 1664525 + 1013904223) >>> 0;
    return this.seeded / 4294967296;
  }
  private buildTrack() {
    const roadMat = mat("#53616a"),
      curbA = mat("#f7ece2"),
      curbB = mat("#ea8a8f");
    const makeStrip = (
      inner: number,
      outer: number,
      m: THREE.Material,
      y: number,
      segmentFilter?: (i: number) => boolean,
    ) => {
      const vertices: number[] = [];
      for (let i = 0; i < 720; i++) {
        if (segmentFilter && !segmentFilter(i)) continue;
        const p = TRACK_POINTS[i],
          q = TRACK_POINTS[(i + 1) % 720];
        const v = (a: typeof p, d: number) => [
          a.x + Math.cos(a.heading) * d,
          y,
          a.z - Math.sin(a.heading) * d,
        ];
        vertices.push(
          ...v(p, inner),
          ...v(q, inner),
          ...v(p, outer),
          ...v(q, inner),
          ...v(q, outer),
          ...v(p, outer),
        );
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      g.computeVertexNormals();
      const o = mesh(g, m, this.scene);
      o.material.side = THREE.DoubleSide;
      return o;
    };
    makeStrip(-ROAD_WIDTH / 2, ROAD_WIDTH / 2, roadMat, 0.03);
    for (const side of [-1, 1]) {
      makeStrip(side * 8, side * 8.9, curbA, 0.05);
      makeStrip(
        side * 8,
        side * 8.9,
        curbB,
        0.065,
        (i) => Math.floor(i / 4) % 2 === 0,
      );
      makeStrip(side * 7.2, side * 7.35, mat("#d2dad0"), 0.055);
    }
    makeStrip(-0.075, 0.075, mat("#adbbb4"), 0.06, (i) => i % 12 < 5);
    const rail = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.45, 1.1, 3.9),
        mat("#e7dfca"),
        360,
      ),
      dummy = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < 720; i += 4)
      for (const side of [-1, 1]) {
        const p = TRACK_POINTS[i];
        dummy.position.set(
          p.x + Math.cos(p.heading) * 9.3,
          0.55,
          p.z - Math.sin(p.heading) * 9.3,
        );
        dummy.rotation.set(0, p.heading, 0);
        dummy.updateMatrix();
        rail.setMatrixAt(k++, dummy.matrix);
      }
    rail.castShadow = true;
    rail.receiveShadow = true;
    this.scene.add(rail);
    const start = trackPoint(0),
      gate = new THREE.Group();
    gate.position.set(start.x, 0, start.z);
    gate.rotation.y = start.heading;
    this.scene.add(gate);
    const white = mat("#ecf1d9"),
      dark = mat("#283944");
    for (const side of [-1, 1]) {
      box(gate, dark, side * 10, 4.5, 0, 1, 9, 1);
      box(gate, mat("#bcfa59"), side * 10, 3.5, 0, 1.2, 0.3, 1.2);
    }
    box(gate, dark, 0, 9, 0, 22, 2, 1.5, 0.3);
    mesh(
      new THREE.PlaneGeometry(18, 1.6),
      label("PONS  /  START", "#283944", "#c5ff66"),
      gate,
      0,
      9,
      0.8,
    );
    for (let x = -8; x < 8; x++)
      for (let z = 0; z < 2; z++) {
        const flag = box(
          gate,
          (x + z) % 2 === 0 ? white : dark,
          x + 0.5,
          0.08,
          z - 0.5,
          1,
          0.035,
          1,
        );
        flag.castShadow = false;
      }
    for (let i = 1; i < 12; i++) {
      const p = trackPoint(i / 12),
        g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.heading;
      this.scene.add(g);
      for (const s of [-1, 1]) {
        box(g, mat("#fff9dd"), s * 9.7, 1.8, 0, 0.15, 3.6, 0.15);
        mesh(
          new THREE.PlaneGeometry(1.9, 1.2),
          label(String(i).padStart(2, "0"), "#324f57", "#fff7d8", 160, 100),
          g,
          s * 9.7,
          3.3,
          0,
        );
      }
    }
  }
  private decorate() {
    const trunk = mat("#a48467"),
      leaf = mat("#639c73"),
      pink = mat("#eeabbc"),
      cream = mat("#f7efd7");
    for (let i = 0; i < 130; i++) {
      const x = (this.random() - 0.5) * 285,
        z = (this.random() - 0.5) * 260;
      if (
        Math.hypot(x, z) > 146 ||
        TRACK_POINTS.some((p) => Math.hypot(p.x - x, p.z - z) < 15)
      )
        continue;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.scene.add(g);
      const h = 3 + this.random() * 5;
      mesh(new THREE.CylinderGeometry(0.32, 0.5, h, 5), trunk, g, 0, h / 2, 0);
      if (i % 3 === 0) {
        for (let j = 0; j < 3; j++)
          mesh(
            new THREE.IcosahedronGeometry(h * 0.53, 1),
            pink,
            g,
            (j - 1) * 1.5,
            h + (j % 2),
            0,
          );
      } else {
        for (let j = 0; j < 6; j++) {
          const l = mesh(
            new THREE.ConeGeometry(1.3, h * 0.85, 4),
            leaf,
            g,
            0,
            h,
            0,
          );
          l.rotation.set(Math.sin(j) * 0.65, (j * Math.PI) / 3, Math.PI * 0.35);
        }
      }
    }
    // Small resort architecture and boardwalks are original procedural assets.
    for (let i = 0; i < 9; i++) {
      const x = 25 + (i % 3) * 13,
        z = 5 + Math.floor(i / 3) * 14;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.scene.add(g);
      box(g, mat(i % 2 ? "#e9b9a8" : "#eef0d7"), 0, 2.3, 0, 9, 4.6, 8, 0.25);
      const roof = mesh(
        new THREE.ConeGeometry(7.2, 3, 4),
        mat("#6798a6"),
        g,
        0,
        6,
        0,
      );
      roof.rotation.y = Math.PI / 4;
      box(g, mat("#344e60"), 0, 2.4, 4.03, 5, 2, 0.1);
      box(g, cream, 0, 0.2, 5.5, 11, 0.4, 3);
    }
    const lighthouse = new THREE.Group();
    lighthouse.position.set(-120, 0, -73);
    this.scene.add(lighthouse);
    mesh(
      new THREE.CylinderGeometry(2.5, 4, 23, 12),
      cream,
      lighthouse,
      0,
      11.5,
      0,
    );
    for (let y = 6; y < 20; y += 8)
      mesh(
        new THREE.CylinderGeometry(3.4 - y * 0.037, 3.7 - y * 0.037, 3, 12),
        mat("#e8888a"),
        lighthouse,
        0,
        y,
        0,
      );
    mesh(
      new THREE.CylinderGeometry(4, 4, 1, 12),
      mat("#354d5c"),
      lighthouse,
      0,
      23,
      0,
    );
    mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 4, 10),
      mat("#9edbdd"),
      lighthouse,
      0,
      25,
      0,
    );
    mesh(
      new THREE.ConeGeometry(4, 3, 12),
      mat("#e8888a"),
      lighthouse,
      0,
      28.5,
      0,
    );
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.set(-45 - i * 15, 0, -15 + i * 15);
      this.scene.add(g);
      mesh(new THREE.CylinderGeometry(0.65, 1.2, 20, 8), cream, g, 0, 10, 0);
      const p = new THREE.Group();
      p.position.y = 20;
      g.add(p);
      mesh(new THREE.SphereGeometry(1.2, 10, 8), cream, p);
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.Group();
        blade.rotation.z = (k * Math.PI * 2) / 3;
        box(blade, cream, 0, 5, 0, 0.9, 10, 0.25, 0.15);
        p.add(blade);
      }
      this.propellers.push(p);
    }
    for (let i = 0; i < 4; i++) {
      const p = trackPoint(0.14 + i * 0.22),
        g = new THREE.Group();
      g.position.set(
        p.x + Math.cos(p.heading) * 16,
        0,
        p.z - Math.sin(p.heading) * 16,
      );
      g.rotation.y = p.heading;
      this.scene.add(g);
      for (const x of [-3, 3]) box(g, mat("#50716e"), x, 2, 0, 0.25, 4, 0.25);
      mesh(
        new THREE.PlaneGeometry(9, 3.2),
        label(
          ["TAKE THE LEAD", "FEEL THE TIDE", "STAY IN FLOW", "PONS KART"][i],
          i % 2 ? "#c7ff68" : "#e9aac3",
          "#223b41",
        ),
        g,
        0,
        4,
        0,
      );
    }
    const waves = new THREE.Group();
    this.scene.add(waves);
    for (let i = 0; i < 100; i++) {
      const x = (this.random() - 0.5) * 650,
        z = (this.random() - 0.5) * 650;
      if (Math.hypot(x, z) < 164) continue;
      const o = mesh(
        new THREE.PlaneGeometry(2 + this.random() * 9, 0.25),
        new THREE.MeshBasicMaterial({
          color: "#ade2d8",
          transparent: true,
          opacity: 0.35,
        }),
        waves,
        x,
        -6.94,
        z,
      );
      o.rotation.x = -Math.PI / 2;
      o.castShadow = false;
    }
    for (let i = 0; i < 12; i++) {
      const cloud = new THREE.Group();
      cloud.position.set(
        (this.random() - 0.5) * 950,
        60 + this.random() * 80,
        -300 - this.random() * 250,
      );
      for (let j = 0; j < 3; j++)
        mesh(
          new THREE.IcosahedronGeometry(10 + this.random() * 12, 1),
          mat("#e6f2e9"),
          cloud,
          j * 16,
          0,
          0,
        ).scale.set(1.3, 0.5, 1);
      this.scene.add(cloud);
    }
  }
  private kart(color: string) {
    const g = new THREE.Group(),
      paint = mat(color, 0.35),
      dark = mat("#233541", 0.45),
      rubber = mat("#1b262c"),
      silver = mat("#cad7d3", 0.3);
    box(g, dark, 0, 0.46, 0, 1.95, 0.28, 2.75, 0.14);
    box(g, paint, 0, 0.73, 0.45, 1.72, 0.42, 2.5, 0.2);
    box(g, paint, 0, 0.92, 1.25, 1.7, 0.42, 0.85, 0.19);
    box(g, dark, 0, 0.57, 1.8, 2.2, 0.24, 0.3, 0.1);
    for (const x of [-1.03, 1.03])
      for (const z of [-0.85, 1]) {
        const wheel = mesh(
          new THREE.CylinderGeometry(0.53, 0.53, 0.48, 16),
          rubber,
          g,
          x,
          0.5,
          z,
        );
        wheel.rotation.z = Math.PI / 2;
        const hub = mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 0.49, 10),
          silver,
          g,
          x,
          0.5,
          z,
        );
        hub.rotation.z = Math.PI / 2;
      }
    box(g, paint, 0, 1, -1.3, 2.25, 0.16, 0.65, 0.07);
    for (const x of [-0.62, 0.62]) box(g, dark, x, 0.77, -1.3, 0.1, 0.45, 0.15);
    box(g, mat("#f9ffe3"), 0, 0.96, 1.69, 0.62, 0.18, 0.08, 0.04);
    box(g, dark, 0, 1, -0.25, 1.05, 0.75, 0.7, 0.12);
    const driver = new THREE.Group();
    driver.name = "driver";
    g.add(driver);
    mesh(
      new THREE.SphereGeometry(0.49, 16, 12),
      mat("#f3ece4"),
      driver,
      0,
      1.42,
      -0.13,
    ).scale.set(0.85, 1, 0.8);
    const helmet = mesh(
      new THREE.SphereGeometry(0.61, 20, 16),
      paint,
      driver,
      0,
      2.03,
      -0.08,
    );
    helmet.scale.set(1, 0.96, 1);
    mesh(
      new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI, 0, Math.PI),
      mat("#233646", 0.16),
      driver,
      0,
      2.06,
      0.12,
    ).scale.set(1, 0.58, 1);
    box(driver, mat("#f5f6de"), 0, 2.59, -0.07, 0.14, 0.06, 0.8, 0.03);
    for (const x of [-0.4, 0.4]) {
      const arm = mesh(
        new THREE.CapsuleGeometry(0.13, 0.46, 4, 8),
        mat("#f4ecd9"),
        driver,
        x,
        1.42,
        0.37,
      );
      arm.rotation.x = -0.8;
    }
    const wheel = mesh(
      new THREE.TorusGeometry(0.28, 0.055, 6, 16),
      dark,
      g,
      0,
      1.36,
      0.64,
    );
    wheel.rotation.x = -0.5;
    const flame = mesh(
      new THREE.ConeGeometry(0.36, 2, 10),
      new THREE.MeshBasicMaterial({
        color: "#a5fbff",
        transparent: true,
        opacity: 0.8,
      }),
      g,
      0,
      0.7,
      -2.35,
    );
    flame.rotation.x = -Math.PI / 2;
    flame.name = "flame";
    flame.visible = false;
    if (this.customDriver) {
      g.remove(driver);
      const d = this.customDriver.clone();
      d.position.y = 0.9;
      g.add(d);
    }
    return g;
  }
  resetCamera() {
    this.cameraReady = false;
  }
  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  render(cars: Car[], localId: string, dt: number, preview: boolean) {
    this.elapsed += dt;
    const seen = new Set<string>();
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      seen.add(c.id);
      let g = this.cars.get(c.id);
      if (!g) {
        g = this.kart(this.content.palette[c.slot % 4]);
        this.cars.set(c.id, g);
        this.scene.add(g);
      }
      g.position.set(
        c.x,
        Math.sin(this.elapsed * 22) *
          Math.min(0.035, Math.abs(c.speed) * 0.002),
        c.z,
      );
      g.rotation.set(
        0,
        c.heading,
        c.drifting ? Math.sin(this.elapsed * 10) * 0.025 : 0,
      );
      const flame = g.getObjectByName("flame")!;
      flame.visible = c.boostTime > 0;
      flame.scale.y = 0.8 + Math.sin(this.elapsed * 40) * 0.25;
      if (c.drifting && Math.abs(c.speed) > 10 && Math.random() < 0.6) {
        for (const side of [-0.83, 0.83]) {
          this.scratch.position.set(
            c.x + Math.cos(c.heading) * side,
            0.075,
            c.z - Math.sin(c.heading) * side,
          );
          this.scratch.rotation.set(-Math.PI / 2, 0, c.heading);
          this.scratch.updateMatrix();
          this.skids.setMatrixAt(this.skidCursor++ % 480, this.scratch.matrix);
        }
        this.skids.instanceMatrix.needsUpdate = true;
      }
    }
    for (const [id, g] of this.cars) g.visible = seen.has(id);
    for (const p of this.propellers) p.rotation.z += dt * 0.5;
    if (preview) {
      const a = this.elapsed * 0.025;
      this.camera.position.set(
        220 + Math.sin(a) * 15,
        205,
        245 + Math.cos(a) * 15,
      );
      this.target.set(-36, -30, 0);
      this.camera.lookAt(this.target);
      this.camera.fov = 46;
      this.cameraReady = false;
    } else {
      const c = cars.find((c) => c.id === localId);
      if (c) {
        const speed = Math.abs(c.speed),
          distance = 8.5 + speed * 0.035;
        const desired = new THREE.Vector3(
          c.x - Math.sin(c.heading) * distance,
          5.1 + speed * 0.018,
          c.z - Math.cos(c.heading) * distance,
        );
        const aim = new THREE.Vector3(
          c.x + Math.sin(c.heading) * 5,
          1.4,
          c.z + Math.cos(c.heading) * 5,
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
          ((c.boostTime > 0 ? 69 : 57) - this.camera.fov) * smooth;
      }
    }
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    if (import.meta.env.DEV) {
      this.perfFrames++;
      const now = performance.now();
      if (now - this.perfStart >= 2000) {
        this.canvas.dataset.fps = (
          (this.perfFrames * 1000) /
          (now - this.perfStart)
        ).toFixed(1);
        this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
        this.perfFrames = 0;
        this.perfStart = now;
      }
    }
  }
}
