import * as THREE from "three";
import type { Car } from "../../shared/race.ts";
import {
  nearestTrack,
  trackPoint,
  trackWidth,
  type Track,
} from "../../shared/track.ts";
import { getLevel, type Biome } from "../../shared/levels.ts";
import { coastalShoreMargin } from "../coast-details.ts";
import { roadsideClear } from "../scenery.ts";
import { vfxBudget } from "./budgets.ts";
import { ParticleLayer } from "./particle-layer.ts";

export type EnvironmentAnchorKind =
  | "coast-spray"
  | "coast-petal"
  | "harbor-navigation"
  | "harbor-wake"
  | "harbor-exhaust"
  | "desert-dust"
  | "city-sign"
  | "city-steam"
  | "factory-smoke"
  | "factory-steam"
  | "factory-weld"
  | "space-energy"
  | "space-glimmer"
  | "forest-leaf"
  | "forest-mote"
  | "ice-snow"
  | "ice-aurora"
  | "ice-crystal"
  | "mine-ember"
  | "mine-dust"
  | "mine-crystal";

export interface EnvironmentAnchor {
  readonly id: string;
  readonly kind: EnvironmentAnchorKind;
  readonly source: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Radius kept clear of both the main ribbon and every shortcut. */
  readonly clearance: number;
  readonly heading: number;
  readonly quaternion: readonly [number, number, number, number];
  readonly visual: boolean;
  readonly far: boolean;
  readonly color: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly shape: 0 | 1 | 2;
}

export interface EnvironmentVfxFrame {
  active: boolean;
  paused: boolean;
  quality: string;
  motion: number;
  pixelHeight?: number;
  pressure?: boolean;
}

type AnchorOptions = Partial<
  Pick<
    EnvironmentAnchor,
    | "clearance"
    | "heading"
    | "quaternion"
    | "visual"
    | "far"
    | "color"
    | "scaleX"
    | "scaleY"
    | "shape"
  >
>;

const scratchPoint = new THREE.Vector3();
const scratchMatrix = new THREE.Matrix4();
const localMatrix = new THREE.Matrix4();

function named(root: THREE.Object3D, name: string) {
  const result: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.name === name) result.push(object);
  });
  return result;
}

function worldPoint(object: THREE.Object3D, x = 0, y = 0, z = 0) {
  object.updateWorldMatrix(true, false);
  return new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld);
}

function worldQuaternion(object: THREE.Object3D) {
  object.updateWorldMatrix(true, false);
  const q = object.getWorldQuaternion(new THREE.Quaternion());
  return [q.x, q.y, q.z, q.w] as const;
}

function instancePoints(object: THREE.InstancedMesh, maximum: number) {
  object.updateWorldMatrix(true, false);
  const result: THREE.Vector3[] = [];
  const step = Math.max(1, Math.ceil(object.count / maximum));
  for (let i = 0; i < object.count && result.length < maximum; i += step) {
    object.getMatrixAt(i, localMatrix);
    scratchMatrix.multiplyMatrices(object.matrixWorld, localMatrix);
    result.push(new THREE.Vector3().setFromMatrixPosition(scratchMatrix));
  }
  return result;
}

function childFrames(root: THREE.Object3D, maximum: number) {
  return root.children
    .filter((child) => child instanceof THREE.Group)
    .slice(0, maximum);
}

function chimneyMachine(machine: THREE.Object3D) {
  return machine.children.some(
    (child) =>
      child instanceof THREE.Mesh &&
      child.geometry.type === "CylinderGeometry" &&
      Math.abs(child.position.x - 3) < 0.01 &&
      Math.abs(child.position.y - 15) < 0.01 &&
      Math.abs(child.position.z - 3) < 0.01,
  );
}

function tunnelVolumes(scene: THREE.Scene) {
  return named(scene, "ice-crystal-tunnel").map((object) => {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      const p = worldPoint(object);
      box.setFromCenterAndSize(p, new THREE.Vector3(52, 24, 52));
    }
    return box.expandByScalar(5);
  });
}

function insideXZ(point: THREE.Vector3, boxes: readonly THREE.Box3[]) {
  return boxes.some(
    (box) =>
      point.x >= box.min.x &&
      point.x <= box.max.x &&
      point.z >= box.min.z &&
      point.z <= box.max.z,
  );
}

/**
 * Capture this plan before World batches static meshes. The returned coordinates
 * remain valid after the named source groups have been emptied by batching.
 */
export function collectEnvironmentAnchors(
  scene: THREE.Scene,
  track: Track,
): EnvironmentAnchor[] {
  scene.updateMatrixWorld(true);
  const biome = getLevel(track.id).biome;
  const result: EnvironmentAnchor[] = [];
  const keys = new Set<string>();
  const add = (
    kind: EnvironmentAnchorKind,
    source: string,
    point: THREE.Vector3,
    options: AnchorOptions = {},
  ) => {
    if (![point.x, point.y, point.z].every(Number.isFinite)) return;
    const clearance = options.clearance ?? 0;
    // nearestTrack supplies the local route context; roadsideClear audits the
    // complete union, including a nearby shortcut or vertically adjacent leg.
    const road = nearestTrack(point.x, point.z, track);
    if (!Number.isFinite(road.y)) return;
    if (clearance > 0 && !roadsideClear(track, point.x, point.z, clearance))
      return;
    const key = `${kind}/${source}/${point.x.toFixed(2)}/${point.y.toFixed(2)}/${point.z.toFixed(2)}`;
    if (keys.has(key)) return;
    keys.add(key);
    const heading = options.heading ?? road.heading;
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      heading,
    );
    result.push({
      id: key,
      kind,
      source,
      x: point.x,
      y: point.y,
      z: point.z,
      clearance,
      heading,
      quaternion: options.quaternion ?? [q.x, q.y, q.z, q.w],
      visual: options.visual ?? false,
      far: options.far ?? false,
      color: options.color ?? 0xffffff,
      scaleX: options.scaleX ?? 1,
      scaleY: options.scaleY ?? options.scaleX ?? 1,
      shape: options.shape ?? 0,
    });
  };
  const addAt = (
    kind: EnvironmentAnchorKind,
    sourceName: string,
    object: THREE.Object3D,
    local: readonly [number, number, number],
    options?: AnchorOptions,
  ) =>
    add(kind, sourceName, worldPoint(object, ...local), {
      ...options,
      ...(options?.visual && !options.quaternion
        ? { quaternion: worldQuaternion(object) }
        : {}),
    });

  if (biome === "coast") {
    const authored = scene.getObjectByName("coast-authored-assets");
    if (authored) {
      for (const object of named(authored, "coast:rock-cluster"))
        if (object instanceof THREE.InstancedMesh)
          for (const point of instancePoints(object, 12)) {
            point.y = -6.65;
            add("coast-spray", object.name, point, {
              clearance: 0.8,
              color: 0xd8fbff,
            });
          }
      for (const object of named(authored, "coast:tree-blossom"))
        if (object instanceof THREE.InstancedMesh)
          for (const point of instancePoints(object, 8)) {
            point.y += 3.2;
            add("coast-petal", object.name, point, {
              clearance: 0.8,
              color: 0xffc9dd,
            });
          }
    } else {
      const cliff = scene.getObjectByName("coast-cliff");
      if (cliff)
        for (let i = 0; i < 10; i++) {
          const p = trackPoint((i + 0.45) / 10, track);
          const side = trackWidth(p.t, track) / 2 + coastalShoreMargin(p.t) + 2;
          scratchPoint.set(
            p.x + Math.cos(p.heading) * side,
            -6.65,
            p.z - Math.sin(p.heading) * side,
          );
          add("coast-spray", cliff.name, scratchPoint.clone(), {
            clearance: 0.8,
            color: 0xd8fbff,
          });
        }
      for (const tree of named(scene, "coast-blossom-tree").slice(0, 8))
        addAt("coast-petal", tree.name, tree, [0, 3.2, 0], {
          clearance: 0.8,
          color: 0xffc9dd,
        });
    }
  } else if (biome === "harbor") {
    for (const crane of named(scene, "harbor-cargo-crane").slice(0, 2))
      for (const x of [-8, 8])
        addAt("harbor-navigation", crane.name, crane, [x, 31.2, 9], {
          visual: true,
          color: x < 0 ? 0xff775e : 0x8effbc,
          scaleX: 0.75,
        });
    for (const ship of named(scene, "harbor-cargo-ship").slice(0, 1)) {
      for (const [x, z] of [
        [-10.5, -9],
        [10.5, -9],
        [-9.5, 18],
        [9.5, 18],
      ] as const)
        addAt("harbor-wake", ship.name, ship, [x, -0.15, z], {
          clearance: 1,
          color: 0xc5f5f6,
        });
      addAt("harbor-exhaust", ship.name, ship, [4, 22, -22], {
        clearance: 0.8,
        color: 0xb9bec3,
      });
    }
  } else if (biome === "desert") {
    for (const sourceName of [
      "desert-pyramid",
      "desert-stepped-temple",
      "desert-stone-arch",
    ])
      for (const object of named(scene, sourceName).slice(0, 8))
        for (const [x, z] of [
          [-4, 0],
          [4, 1.5],
        ] as const)
          addAt("desert-dust", object.name, object, [x, 0.5, z], {
            clearance: 1.2,
            color: 0xd8a45d,
          });
    for (const arch of named(scene, "desert-sandstone-arch"))
      for (const frame of childFrames(arch, 2)) {
        const p = worldPoint(frame);
        const road = nearestTrack(p.x, p.z, track);
        const side = trackWidth(road.t, track) / 2 + 4.2;
        for (const x of [-side, side])
          addAt("desert-dust", arch.name, frame, [x, 0.6, 0], {
            clearance: 1,
            color: 0xd8a45d,
          });
      }
  } else if (biome === "city") {
    for (const tower of named(scene, "city-neon-tower").slice(0, 1))
      addAt("city-sign", tower.name, tower, [0, 75, 6.1], {
        visual: true,
        color: 0xff71d0,
        scaleX: 7,
        scaleY: 2.8,
      });
    for (const sign of named(scene, "city-overhead-road-sign"))
      for (const frame of childFrames(sign, 3))
        addAt("city-sign", sign.name, frame, [0, 8.5, -0.75], {
          visual: true,
          color: 0x62efff,
          scaleX: 3.5,
          scaleY: 0.35,
        });
    for (const sidewalk of named(scene, "city-sidewalk").filter(
      (_, i) => i % 12 === 0,
    ))
      addAt("city-steam", sidewalk.name, sidewalk, [0.9, 0.35, 0], {
        clearance: 0.7,
        color: 0xcdd9e4,
      });
  } else if (biome === "factory") {
    for (const refinery of named(scene, "factory-refinery").slice(0, 1)) {
      for (const x of [-12, 0, 12])
        addAt("factory-smoke", refinery.name, refinery, [x, 48, 12], {
          clearance: 0.8,
          color: 0xaeb4b2,
        });
      addAt("factory-steam", refinery.name, refinery, [-10.75, 1.6, 5.94], {
        clearance: 0.6,
        color: 0xdde3df,
      });
    }
    for (const machine of named(scene, "factory-machinery")) {
      if (!chimneyMachine(machine)) continue;
      addAt("factory-smoke", machine.name, machine, [3, 23, 3], {
        clearance: 0.8,
        color: 0xaeb4b2,
      });
      addAt("factory-weld", machine.name, machine, [-4.8, 2, -2.6], {
        clearance: 0.5,
        color: 0xffc55f,
      });
    }
  } else if (biome === "space") {
    for (const planet of named(scene, "space-ring-planet").slice(0, 1)) {
      let belt: THREE.Mesh | undefined;
      planet.traverse((object) => {
        if (
          !belt &&
          object instanceof THREE.Mesh &&
          object.geometry.type === "RingGeometry"
        )
          belt = object;
      });
      if (belt)
        addAt("space-energy", planet.name, belt, [0, 0, 0], {
          visual: true,
          far: true,
          color: 0x7defff,
          scaleX: 200,
          scaleY: 200,
          shape: 1,
        });
    }
    for (const arch of named(scene, "space-station-arch"))
      for (const frame of childFrames(arch, 4))
        addAt("space-energy", arch.name, frame, [0, 8.4, -0.7], {
          visual: true,
          color: 0x64efff,
          scaleX: 2.2,
          scaleY: 0.32,
        });
    for (const module of named(scene, "space-station-module").filter(
      (_, i) => i % 4 === 0,
    )) {
      addAt("space-glimmer", module.name, module, [0, 7.8, 0], {
        visual: true,
        color: 0xc9fbff,
        scaleX: 0.65,
      });
      addAt("space-energy", module.name, module, [0, 4.5, 0], {
        visual: true,
        color: 0x6deaff,
        scaleX: 3.8,
        shape: 1,
      });
    }
  } else if (biome === "forest") {
    for (const tree of [
      ...named(scene, "forest-ancient-redwood"),
      ...named(scene, "forest-giant-tree").filter((_, i) => i % 18 === 0),
    ].slice(0, 16))
      addAt("forest-leaf", tree.name, tree, [0, 4.5, 0], {
        clearance: 1.2,
        color: 0xc68c42,
      });
    for (const camp of named(scene, "forest-timber-camp").slice(0, 2))
      addAt("forest-mote", camp.name, camp, [0, 3.2, 0], {
        clearance: 0.8,
        color: 0xffe0a0,
      });
  } else if (biome === "ice") {
    const tunnels = tunnelVolumes(scene);
    for (const { pine, point } of named(scene, "ice-snow-pine")
      .map((pine) => ({ pine, point: worldPoint(pine, 0, 4, 0) }))
      .filter(({ point }) => !insideXZ(point, tunnels))
      .filter((_, i) => i % 8 === 0))
      add("ice-snow", pine.name, point, {
        clearance: 1,
        color: 0xe9fbff,
      });
    for (const spire of named(scene, "ice-crystal-spire").slice(0, 1)) {
      addAt("ice-crystal", spire.name, spire, [0, 17, 0], {
        visual: true,
        color: 0xa7f4ff,
        scaleX: 1.3,
      });
      addAt("ice-aurora", spire.name, spire, [0, 95, -75], {
        visual: true,
        far: true,
        color: 0x6ce9c9,
        scaleX: 95,
        scaleY: 28,
        shape: 2,
      });
    }
    for (const crystal of named(scene, "ice-crystal-deposit").filter(
      (_, i) => i % 14 === 0,
    ))
      addAt("ice-crystal", crystal.name, crystal, [0, 4, 0], {
        visual: true,
        color: 0xa7f4ff,
        scaleX: 0.6,
      });
  } else if (biome === "mine") {
    for (const fissure of named(scene, "mine-lava-fissure").filter(
      (_, i) => i % 2 === 0,
    ))
      addAt("mine-ember", fissure.name, fissure, [0, 1.2, 0], {
        clearance: 0.8,
        color: 0xff7a32,
      });
    for (const portal of named(scene, "mine-portal"))
      for (const frame of childFrames(portal, 6)) {
        const p = worldPoint(frame);
        const road = nearestTrack(p.x, p.z, track);
        const side = trackWidth(road.t, track) / 2 + 3.2;
        for (const x of [-side, side])
          addAt("mine-dust", portal.name, frame, [x, 2.8, 0], {
            clearance: 0.8,
            color: 0xbda79c,
          });
      }
    for (const quarry of named(scene, "mine-crystal-quarry").slice(0, 1))
      addAt("mine-crystal", quarry.name, quarry, [0, 15, 0], {
        visual: true,
        color: 0xff8edb,
        scaleX: 1.4,
      });
  }
  return result;
}

const particleRate: Partial<Record<EnvironmentAnchorKind, number>> = {
  "coast-spray": 1.3,
  "coast-petal": 0.45,
  "harbor-wake": 0.8,
  "harbor-exhaust": 1,
  "desert-dust": 0.45,
  "city-steam": 0.8,
  "factory-smoke": 1,
  "factory-steam": 0.75,
  "factory-weld": 1.2,
  "forest-leaf": 0.38,
  "forest-mote": 0.7,
  "ice-snow": 0.55,
  "mine-ember": 0.9,
  "mine-dust": 0.45,
};

function createGlowLayer(capacity: number) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute(
    "vfxAlpha",
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
  );
  geometry.setAttribute(
    "vfxPhase",
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
  );
  geometry.setAttribute(
    "vfxShape",
    new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
  );
  const material = new THREE.ShaderMaterial({
    uniforms: { clock: { value: 0 } },
    vertexShader: `attribute float vfxAlpha;attribute float vfxPhase;attribute float vfxShape;
      varying vec2 p;varying vec3 tint;varying float alpha;varying float phase;varying float shape;
      void main(){p=uv;tint=instanceColor;alpha=vfxAlpha;phase=vfxPhase;shape=vfxShape;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float clock;varying vec2 p;varying vec3 tint;varying float alpha;varying float phase;varying float shape;
      void main(){vec2 q=p-.5;float r=length(q)*2.;float pulse=.72+.28*sin(clock*1.7+phase);
        float point=1.-smoothstep(.08,1.,r);float edge=max(fwidth(r),.002);
        float ring=1.-smoothstep(edge,edge*2.5,abs(r-.78));
        float curtain=(1.-smoothstep(.36,.5,abs(q.y)))*(.32+.28*sin((p.x*3.+clock*.025+phase)*6.283));
        float mask=shape<.5?point:(shape<1.5?ring:curtain);float a=mask*alpha*pulse;
        if(a<.008)discard;gl_FragColor=vec4(tint,a);
        #include <colorspace_fragment>}`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(0xffffff));
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.dynamic = true;
  return mesh;
}

export class EnvironmentVfx {
  readonly group = new THREE.Group();
  private readonly particles = new ParticleLayer(128, false);
  private readonly glows = createGlowLayer(8);
  private anchors: EnvironmentAnchor[];
  private readonly remainders = new Map<string, number>();
  private emissions: Partial<Record<EnvironmentAnchorKind, number>> = {};
  private readonly object = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private seed = 0x45e371;
  private elapsed = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    private readonly track: Track,
  ) {
    this.anchors = collectEnvironmentAnchors(scene, track);
    this.group.name = "environment-vfx";
    this.group.userData.dynamic = true;
    this.particles.mesh.name = "environment-particles";
    this.particles.mesh.userData.dynamic = true;
    this.glows.name = "environment-pulses";
    this.group.add(this.particles.mesh, this.glows);
    scene.add(this.group);
  }

  get stats() {
    const anchorsByKind: Partial<Record<EnvironmentAnchorKind, number>> = {};
    for (const anchor of this.anchors)
      anchorsByKind[anchor.kind] = (anchorsByKind[anchor.kind] ?? 0) + 1;
    return {
      biome: getLevel(this.track.id).biome,
      time: this.elapsed,
      anchors: this.anchors.length,
      anchorsByKind,
      sources: [...new Set(this.anchors.map((anchor) => anchor.source))].sort(),
      emissionsByKind: { ...this.emissions },
      particles: this.particles.pool.count,
      instances: this.glows.count,
      limit: this.particles.pool.limit,
      drawCalls:
        (this.particles.mesh.visible ? 1 : 0) + (this.glows.visible ? 1 : 0),
    };
  }

  /** Replace procedural coast sources after authored instancing arrives. */
  refreshAnchors() {
    if (this.disposed || getLevel(this.track.id).biome !== "coast") return;
    const scene = this.group.parent;
    if (!(scene instanceof THREE.Scene)) return;
    const refreshed = collectEnvironmentAnchors(scene, this.track);
    if (!refreshed.length) return;
    this.anchors = refreshed;
    this.remainders.clear();
    this.particles.clear();
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private selected(local: Car | undefined, low: boolean) {
    const maximum = low ? 10 : 30;
    if (!local)
      return this.anchors
        .toSorted((a, b) => Number(b.far) - Number(a.far))
        .slice(0, maximum);
    const distance = low ? 105 : 175;
    return this.anchors
      .filter(
        (anchor) =>
          anchor.far ||
          Math.hypot(anchor.x - local.x, anchor.z - local.z) <= distance,
      )
      .toSorted((a, b) => {
        if (a.far !== b.far) return a.far ? -1 : 1;
        return (
          Math.hypot(a.x - local.x, a.z - local.z) -
          Math.hypot(b.x - local.x, b.z - local.z)
        );
      })
      .slice(0, maximum);
  }

  private emit(anchor: EnvironmentAnchor) {
    const r = () => this.random() - 0.5;
    let vx = r() * 0.7,
      vy = 0.5 + this.random() * 0.5,
      vz = r() * 0.7,
      life = 0.8 + this.random() * 0.6,
      size = 0.18 + this.random() * 0.14,
      y = anchor.y;
    if (anchor.kind === "coast-spray") {
      vy = 2.5 + this.random() * 2;
      life = 0.65 + this.random() * 0.35;
      size = 0.16;
    } else if (anchor.kind === "coast-petal") {
      vx = r() * 0.9;
      vy = -0.35 - this.random() * 0.25;
      vz = r() * 0.9;
      life = 2.2 + this.random();
      size = 0.1;
    } else if (anchor.kind === "harbor-wake") {
      vy = 0.08;
      life = 1.2;
      size = 0.24;
    } else if (/smoke|exhaust/.test(anchor.kind)) {
      vx = r() * 0.45;
      vy = 0.65 + this.random() * 0.65;
      vz = r() * 0.45;
      life = 2 + this.random() * 1.2;
      size = 0.35 + this.random() * 0.25;
    } else if (/dust/.test(anchor.kind)) {
      vx = Math.sin(anchor.heading) * 0.8 + r() * 0.5;
      vy = 0.12 + this.random() * 0.2;
      vz = Math.cos(anchor.heading) * 0.8 + r() * 0.5;
      life = 1.2 + this.random() * 0.8;
      size = 0.28 + this.random() * 0.18;
    } else if (/steam/.test(anchor.kind)) {
      vy = 1.3 + this.random();
      life = 1.1 + this.random() * 0.7;
      size = 0.25 + this.random() * 0.2;
    } else if (anchor.kind === "factory-weld") {
      vx = r() * 4;
      vy = 0.7 + this.random() * 2;
      vz = r() * 4;
      life = 0.22 + this.random() * 0.2;
      size = 0.07;
    } else if (anchor.kind === "forest-leaf") {
      vx = r() * 0.5;
      vy = -0.45 - this.random() * 0.25;
      vz = r() * 0.5;
      life = 2.4 + this.random();
      size = 0.13;
    } else if (anchor.kind === "forest-mote") {
      vy = 0.08 + r() * 0.15;
      life = 2 + this.random() * 1.5;
      size = 0.07;
    } else if (anchor.kind === "ice-snow") {
      vx = -0.35 + r() * 0.3;
      vy = -0.45 - this.random() * 0.3;
      vz = r() * 0.25;
      life = 2.5 + this.random();
      size = 0.09;
      y += 2 + this.random() * 5;
    } else if (anchor.kind === "mine-ember") {
      vy = 1 + this.random() * 1.8;
      life = 0.8 + this.random();
      size = 0.08;
    }
    if (
      this.particles.pool.emit(
        anchor.x + r() * 0.7,
        y,
        anchor.z + r() * 0.7,
        vx,
        vy,
        vz,
        life,
        size,
        anchor.color,
      )
    )
      this.emissions[anchor.kind] = (this.emissions[anchor.kind] ?? 0) + 1;
  }

  private updateGlows(
    anchors: readonly EnvironmentAnchor[],
    low: boolean,
    reduced: boolean,
  ) {
    this.glows.count = 0;
    const limit = low ? 4 : 8;
    const alpha = this.glows.geometry.getAttribute("vfxAlpha");
    const phase = this.glows.geometry.getAttribute("vfxPhase");
    const shape = this.glows.geometry.getAttribute("vfxShape");
    for (const anchor of anchors) {
      if (
        !anchor.visual ||
        (reduced && !anchor.far) ||
        this.glows.count >= limit
      )
        continue;
      const i = this.glows.count;
      this.object.position.set(anchor.x, anchor.y, anchor.z);
      this.object.quaternion.fromArray(anchor.quaternion);
      this.object.scale.set(anchor.scaleX, anchor.scaleY, 1);
      this.object.updateMatrix();
      this.glows.setMatrixAt(i, this.object.matrix);
      this.glows.setColorAt(i, this.color.setHex(anchor.color));
      alpha.setX(
        i,
        reduced
          ? 0.18
          : anchor.shape === 2
            ? 0.2
            : anchor.shape === 1 && anchor.scaleX > 50
              ? 0.16
              : 0.55,
      );
      phase.setX(i, i * 1.618);
      shape.setX(i, anchor.shape);
      this.glows.count++;
    }
    this.glows.visible = this.glows.count > 0;
    this.glows.instanceMatrix.needsUpdate = true;
    this.glows.instanceColor!.needsUpdate = true;
    alpha.needsUpdate = phase.needsUpdate = shape.needsUpdate = true;
    this.glows.material.uniforms.clock.value = reduced ? 0 : this.elapsed;
  }

  update(local: Car | undefined, dt: number, frame: EnvironmentVfxFrame) {
    if (this.disposed || frame.paused) return;
    if (!frame.active || !(dt > 0) || dt > 0.25 || !Number.isFinite(dt)) {
      this.reset();
      return;
    }
    const low = frame.quality === "low";
    this.particles.pool.limit = vfxBudget(frame.quality).environment;
    if (frame.pressure) {
      this.particles.clear();
      this.remainders.clear();
      this.glows.count = 0;
      this.glows.visible = false;
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.elapsed += dt;
    const selected = this.selected(local, low);
    if (frame.motion <= 0) {
      this.particles.clear();
      this.remainders.clear();
    } else {
      this.particles.pool.tick(dt);
      const rateScale = low ? 0.35 : 1;
      for (const anchor of selected) {
        const rate = particleRate[anchor.kind];
        if (!rate) continue;
        const amount =
          (this.remainders.get(anchor.id) ?? 0) + rate * rateScale * dt;
        const count = Math.min(3, Math.floor(amount));
        this.remainders.set(anchor.id, amount - count);
        for (let i = 0; i < count; i++) this.emit(anchor);
      }
    }
    this.updateGlows(selected, low, frame.motion <= 0);
    this.particles.upload(frame.pixelHeight ?? 900);
  }

  reset() {
    this.particles.clear();
    this.remainders.clear();
    this.emissions = {};
    this.glows.count = 0;
    this.glows.visible = false;
    this.group.visible = false;
    this.elapsed = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.particles.dispose();
    this.glows.geometry.dispose();
    this.glows.material.dispose();
    this.glows.dispose();
    this.reset();
    this.group.clear();
  }
}
