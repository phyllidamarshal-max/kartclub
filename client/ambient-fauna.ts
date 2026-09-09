import * as THREE from "three";
import {
  trackPoint,
  trackWidth,
  shortcutWidthAt,
  type Track,
} from "../shared/track.ts";
import {
  ambientDirection,
  type AmbientDirection,
} from "./ambient-direction.ts";
import { coastalShoreMargin } from "./coast-details.ts";
import { terrainHeight } from "./level-scenery.ts";
import {
  FaunaModelLibrary,
  type FaunaModel,
  type CamelLeg,
} from "./fauna-models.ts";

type Species = "whale" | "camel" | "bird";
interface XZ {
  x: number;
  z: number;
}
export interface FaunaPath {
  species: Species;
  x: number;
  z: number;
  heading: number;
  /** Conservative complete animated body radius, excluding the path extent. */
  radius: number;
  major: number;
  minor: number;
  samples: XZ[];
  count: number;
}
interface Actor {
  model: FaunaModel;
  path: FaunaPath;
  index: number;
  phase: number;
}
const TAU = Math.PI * 2;
const SEA_HEIGHT = -7.2;
const positiveMod = (x: number, n: number) => ((x % n) + n) % n;
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Full segment-union clearance. Conservatively bounds a continuous path between
 * its samples by adding one metre; no nearest-point early-out or road assumptions. */
function clear(
  track: Track,
  x: number,
  z: number,
  radius: number,
  shore: boolean,
) {
  for (const [points, closed, shortcut] of [
    [track.points, track.layout !== "ab", false],
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
      const width = shortcut ? shortcutWidthAt(t, track) : trackWidth(t, track);
      if (
        Math.hypot(x - a.x - dx * f, z - a.z - dz * f) <
        width / 2 +
          radius +
          (shore && !shortcut ? coastalShoreMargin(t, track) : 0)
      )
        return false;
    }
  }
  return true;
}
function insideCourse(track: Track, x: number, z: number) {
  let inside = false;
  for (
    let i = 0, j = track.points.length - 1;
    i < track.points.length;
    j = i++
  ) {
    const a = track.points[i],
      b = track.points[j];
    if (
      a.z > z !== b.z > z &&
      x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function routePoint(path: FaunaPath, angle: number, target: XZ) {
  const along = path.major * Math.cos(angle),
    across = path.minor * Math.sin(angle);
  target.x =
    path.x + Math.sin(path.heading) * along + Math.cos(path.heading) * across;
  target.z =
    path.z + Math.cos(path.heading) * along - Math.sin(path.heading) * across;
}

function createPaths(
  scene: THREE.Scene,
  track: Track,
  species: Species,
): FaunaPath[] {
  const paths: FaunaPath[] = [];
  const count = species === "whale" ? 2 : 3;
  const radius = species === "whale" ? 6.8 : species === "camel" ? 2.65 : 1;
  // Small props matter to ground actors as much as landmarks: a cactus trunk
  // can bisect an animal even when its footprint is only a few metres wide.
  const landmarks: { x: number; z: number; radius: number }[] = [];
  scene.traverse((o) => {
    if (
      Number.isFinite(o.userData.footprintRadius) &&
      o.userData.footprintRadius > (species === "whale" ? 9.999 : 0)
    ) {
      const p = o.getWorldPosition(new THREE.Vector3());
      landmarks.push({ x: p.x, z: p.z, radius: o.userData.footprintRadius });
    }
  });
  for (let attempt = 0; attempt < 128; attempt++) {
    const t = positiveMod(0.11 + Math.floor(attempt / 4) * 0.037, 1),
      p = trackPoint(t, track);
    const side = species === "whale" ? 1 : attempt % 2 === 0 ? 1 : -1;
    const extra =
      species === "whale"
        ? 34 + 12 * (attempt % 4)
        : 17 + 10 * (Math.floor(attempt / 2) % 2);
    const distance =
      trackWidth(t, track) / 2 +
      (species === "whale" ? coastalShoreMargin(t, track) : 0) +
      extra;
    const path: FaunaPath = {
      species,
      x: p.x + Math.cos(p.heading) * distance * side,
      z: p.z - Math.sin(p.heading) * distance * side,
      heading: p.heading,
      radius,
      major: species === "whale" ? 4 : species === "camel" ? 5.5 : 7,
      minor: species === "whale" ? 0 : species === "camel" ? 3.5 : 3,
      samples: [],
      count: species === "whale" ? 1 : count,
    };
    let safe = true;
    for (let i = 0; i < 128; i++) {
      const q = { x: 0, z: 0 };
      routePoint(path, (i / 128) * TAU, q);
      path.samples.push(q);
      if (
        !clear(track, q.x, q.z, radius + 3, species === "whale") ||
        (species === "whale" && insideCourse(track, q.x, q.z)) ||
        landmarks.some(
          (l) => Math.hypot(q.x - l.x, q.z - l.z) < radius + l.radius + 2,
        )
      ) {
        safe = false;
        break;
      }
    }
    if (
      !safe ||
      paths.some((other) => Math.hypot(other.x - path.x, other.z - path.z) < 70)
    )
      continue;
    paths.push(path);
    if (species !== "whale" || paths.length === 2) break;
  }
  return paths;
}

/** Decorative mesh actors only. Absolute seconds allow scrubbing and repeatable
 * captures. Nothing registers global clocks, event handlers or gameplay bodies. */
export class AmbientFauna {
  readonly root = new THREE.Group();
  private readonly library = new FaunaModelLibrary();
  private readonly actors: Actor[] = [];
  private readonly direction: AmbientDirection | undefined;
  private readonly ground: (x: number, z: number) => number;
  private readonly scratch = { x: 0, z: 0 };
  private readonly delta = new THREE.Vector3();
  private readonly knee = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(0, 1, 0);
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    track: Track,
    options: { groundHeight?: (x: number, z: number) => number } = {},
  ) {
    this.root.name = "ambient-fauna";
    this.root.userData.dynamic = true;
    this.direction = ambientDirection(track.id);
    // Unknown/reference courses deliberately stay empty without calling getLevel.
    this.ground =
      options.groundHeight ??
      ((x, z) => (this.direction?.actor ? terrainHeight(track, x, z) : 0));
    const species = this.direction?.actor;
    const paths = species ? createPaths(scene, track, species) : [];
    this.root.userData = {
      dynamic: true,
      species: species ?? "none",
      paths,
      actors: [],
      countBudgets: {
        high: species === "whale" ? 2 : species ? 3 : 0,
        low: species === "camel" ? 2 : species ? 1 : 0,
      },
      cullDistances: {
        high: species === "whale" ? 350 : species === "camel" ? 160 : 130,
        low: species === "whale" ? 250 : species === "camel" ? 110 : 90,
      },
      timing: "absolute independent visual cycle; no audio synchronization",
      cycle: this.direction?.cycle ?? 0,
      active: this.direction?.active ?? 0,
    };
    for (const path of paths)
      for (let i = 0; i < path.count; i++) {
        const index = this.actors.length;
        const model =
          species === "whale"
            ? this.library.whale()
            : species === "camel"
              ? this.library.camel()
              : this.library.bird();
        const actor: Actor = {
          model,
          path,
          index,
          phase: species === "whale" ? index * 0.5 : i / path.count,
        };
        this.root.add(model.root);
        this.actors.push(actor);
        this.root.userData.actors.push({
          species,
          index,
          pathIndex: paths.indexOf(path),
          phase: actor.phase,
          x: path.x,
          z: path.z,
        });
      }
    scene.add(this.root);
    // Initialize authored calm poses even before the first frame/camera arrives.
    for (const actor of this.actors) this.pose(actor, 0, true);
  }

  private walkLeg(actor: Actor, leg: CamelLeg, gait: number, walking: number) {
    const root = actor.model.root;
    const phase = positiveMod(gait + leg.phase, 1);
    const lift =
      phase < 0.5 ? 0 : Math.sin((phase - 0.5) * TAU) * 0.13 * walking;
    const stride =
      (phase < 0.5
        ? 0.28 - 1.12 * phase
        : -0.28 + 0.56 * smooth((phase - 0.5) * 2)) * walking;
    const x = leg.hip.x,
      z = leg.hip.z + stride;
    const cos = Math.cos(root.rotation.y),
      sin = Math.sin(root.rotation.y);
    const worldX = root.position.x + x * cos + z * sin,
      worldZ = root.position.z - x * sin + z * cos;
    const y = this.ground(worldX, worldZ) - root.position.y + lift;
    leg.foot.position.set(x, y, z);
    // Equal two-bone lengths, forward bend, foot target placed on sampled terrain.
    // Small leg-length adaptation handles coarse terrain triangles at the verges.
    const dy = y - leg.hip.y,
      dz = z - leg.hip.z,
      d = Math.hypot(dy, dz);
    const length = Math.max(0.86, d * 0.515),
      bend = Math.sqrt(Math.max(0, length * length - (d * d) / 4));
    this.knee.set(
      x,
      leg.hip.y + dy * 0.5 + (dz / (d || 1)) * bend,
      leg.hip.z + dz * 0.5 - (dy / (d || 1)) * bend,
    );
    leg.knee.position.copy(this.knee);
    this.bone(leg.upper, leg.hip, this.knee);
    this.bone(leg.lower, this.knee, leg.foot.position);
  }
  private bone(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    this.delta.subVectors(b, a);
    const length = this.delta.length();
    mesh.position.copy(a).addScaledVector(this.delta, 0.5);
    mesh.scale.y = length;
    mesh.quaternion.setFromUnitVectors(
      this.axis,
      this.delta.multiplyScalar(1 / (length || 1)),
    );
  }

  private pose(actor: Actor, seconds: number, reduced: boolean) {
    const profile = this.direction!,
      { path, model } = actor,
      root = model.root;
    const phase = reduced
      ? profile.active
      : positiveMod(
          seconds +
            (path.species === "whale" ? actor.phase * profile.cycle : 0),
          profile.cycle,
        );
    const u = Math.min(1, phase / profile.active),
      moving = !reduced && phase < profile.active;
    const travel = moving ? smooth(u) : 0;
    if (path.species === "whale") {
      const along = moving ? (u - 0.5) * path.major * 2 : -path.major;
      root.position.set(
        path.x + Math.sin(path.heading) * along,
        SEA_HEIGHT -
          8 +
          (moving
            ? Math.pow(Math.sin(Math.PI * u), 1.3) * 12.2 * profile.amplitude
            : 0),
        path.z + Math.cos(path.heading) * along,
      );
      root.rotation.set(
        moving ? -0.87 * Math.sin(u * TAU) : 0,
        path.heading,
        moving ? 0.12 * Math.sin(Math.PI * u) : 0,
        "YXZ",
      );
      model.tail!.rotation.x = moving ? 0.2 * Math.sin(u * TAU * 2) : 0;
    } else {
      const angle = (travel + actor.phase) * TAU;
      routePoint(path, angle, this.scratch);
      root.position.set(
        this.scratch.x,
        this.ground(this.scratch.x, this.scratch.z),
        this.scratch.z,
      );
      const dx = -path.major * Math.sin(angle),
        dz = path.minor * Math.cos(angle);
      root.rotation.set(0, path.heading + Math.atan2(dz, dx), 0);
      if (path.species === "camel") {
        // Ground height stays authoritative; no body bob that would detach stance feet.
        const walking = moving
          ? Math.min(1, Math.sin(Math.PI * u) * 4) * profile.amplitude
          : 0;
        for (const leg of model.legs!)
          this.walkLeg(
            actor,
            leg,
            travel * (profile.amplitude < 1 ? 35 : 28),
            walking,
          );
        model.tail!.rotation.z = walking * 0.13 * Math.sin(travel * TAU * 4);
      } else {
        const arc = moving ? Math.sin(Math.PI * u) : 0;
        // Deploy/fold during the first/last 15% of flight, preserving the calm
        // wing pose at both ends. Banking uses the same envelope to avoid snaps.
        const deployed = moving
          ? smooth(Math.min(1, u / 0.15, (1 - u) / 0.15))
          : 0;
        root.position.y += 0.2 + profile.height * arc;
        root.rotation.z = deployed * 0.13 * Math.sin(angle);
        const flap = moving
          ? Math.sin(travel * TAU * (profile.active < 8 ? 8 : 4)) *
            0.38 *
            profile.amplitude *
            deployed
          : 0;
        model.wings![0].rotation.set(0, -1.18 * (1 - deployed), -flap);
        model.wings![1].rotation.set(0, 1.18 * (1 - deployed), flap);
      }
    }
  }

  update(
    seconds: number,
    cameraPosition: THREE.Vector3,
    low: boolean,
    reducedMotion = false,
  ): void {
    if (this.disposed) return;
    const time = Number.isFinite(seconds) ? seconds : 0;
    const budget = low
      ? this.root.userData.countBudgets.low
      : this.root.userData.countBudgets.high;
    const distance = low
      ? this.root.userData.cullDistances.low
      : this.root.userData.cullDistances.high;
    for (const actor of this.actors) {
      const visible =
        actor.index < budget &&
        Math.hypot(
          actor.path.x - cameraPosition.x,
          actor.path.z - cameraPosition.z,
        ) < distance;
      actor.model.root.visible = visible;
      if (visible) this.pose(actor, time, reducedMotion);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.library.dispose();
    this.actors.length = 0;
  }
}
