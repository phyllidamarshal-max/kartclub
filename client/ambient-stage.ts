import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { trackPoint, trackWidth, type Track } from "../shared/track.ts";
import { getLevel } from "../shared/levels.ts";
import { roadsideClear } from "./scenery.ts";
import { terrainHeight } from "./level-scenery.ts";
import { createChamferedBoxGeometry } from "./scene-prop-geometry.ts";
import {
  ambientDirection,
  ambientTravel,
  type AmbientDirection,
  type AmbientStageKind,
} from "./ambient-direction.ts";

type StageActor = {
  root: THREE.Group;
  pose: (travel: number, angle: number, time: number) => void;
  phase: number;
};
type GroundOptions = { groundHeight?: (x: number, z: number) => number };

/** Small, supported scenic mechanisms. Owns no timers, audio or gameplay state. */
export class AmbientStage {
  readonly root = new THREE.Group();
  private actors: StageActor[] = [];
  private geometries = new Set<THREE.BufferGeometry>();
  private materials: THREE.MeshStandardMaterial[] = [];
  private direction?: AmbientDirection;
  private disposed = false;
  constructor(scene: THREE.Scene, track: Track, options: GroundOptions = {}) {
    this.root.name = "ambient-stage";
    this.direction = ambientDirection(track.id);
    const kind = this.direction?.stage;
    if (!kind) return;
    const level = getLevel(track.id),
      ground =
        options.groundHeight ??
        ((x: number, z: number) => terrainHeight(track, x, z));
    const blockers: { x: number; z: number; radius: number }[] = [];
    scene.traverse((o) => {
      if (o.userData.footprintRadius) {
        const p = o.getWorldPosition(new THREE.Vector3());
        blockers.push({ x: p.x, z: p.z, radius: o.userData.footprintRadius });
      }
    });
    // Entire assembly (including both ends of the cart travel) fits inside radius.
    const radius = kind === "minecart" ? 6 : kind === "winch" ? 4.4 : 3.2;
    for (let slot = 0; slot < 2; slot++) {
      let site:
        { x: number; y: number; z: number; heading: number } | undefined;
      search: for (let attempt = 0; attempt < 20; attempt++) {
        const p = trackPoint(
          level.preview.t +
            0.012 +
            slot * 0.07 +
            Math.floor(attempt / 4) * 0.008,
          track,
        );
        const side = attempt % 2 ? 1 : -1,
          offset =
            trackWidth(p.t, track) / 2 +
            radius +
            3 +
            Math.floor((attempt % 4) / 2) * 7;
        const x = p.x + Math.cos(p.heading) * offset * side,
          z = p.z - Math.sin(p.heading) * offset * side;
        if (
          !roadsideClear(track, x, z, radius + 1) ||
          blockers.some(
            (b) => Math.hypot(x - b.x, z - b.z) < b.radius + radius + 1,
          )
        )
          continue;
        const y = ground(x, z);
        if (!Number.isFinite(y)) continue;
        site = { x, y, z, heading: p.heading };
        break search;
      }
      if (!site) continue;
      const actor = this.build(kind);
      const feet =
        kind === "minecart"
          ? [5, 1.05]
          : kind === "winch"
            ? [2.3, 1.1]
            : kind === "wind-banner"
              ? [0.42, 0.42]
              : [1.5, 0.65];
      const samples = [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => {
          const x = sx * feet[0],
            z = sz * feet[1];
          return {
            x,
            z,
            y: ground(
              site!.x +
                x * Math.cos(site!.heading) +
                z * Math.sin(site!.heading),
              site!.z -
                x * Math.sin(site!.heading) +
                z * Math.cos(site!.heading),
            ),
          };
        }),
      );
      site.y = Math.max(
        site.y,
        ...samples.map((p) => (Number.isFinite(p.y) ? p.y : site!.y)),
      );
      // Independent feet reach the actual sloping terrain; the machine deck is level.
      const pedestal = this.own(new THREE.BoxGeometry());
      for (const p of samples) {
        const height = site.y - p.y;
        if (!Number.isFinite(height) || height < 0.015) continue;
        const foot = new THREE.Mesh(pedestal, this.materials[2]);
        foot.name = "terrain-bearing";
        foot.position.set(p.x, -height / 2, p.z);
        foot.scale.set(0.55, height, 0.55);
        foot.castShadow = foot.receiveShadow = true;
        actor.root.add(foot);
      }
      actor.root.position.set(site.x, site.y, site.z);
      actor.root.rotation.y = site.heading;
      actor.phase = slot * this.direction!.cycle * 0.47;
      actor.root.userData.placement = { ...site, radius };
      actor.root.name = `ambient:${kind}:${slot}`;
      this.actors.push(actor);
      this.root.add(actor.root);
      blockers.push({ x: site.x, z: site.z, radius });
    }
    this.root.userData = {
      kind,
      highCount: this.actors.length,
      lowCount: Math.min(1, this.actors.length),
      direction: this.direction,
      source: "client/ambient-stage.ts",
    };
    scene.add(this.root);
  }
  private build(kind: AmbientStageKind): StageActor {
    const root = new THREE.Group();
    const palette =
      kind === "orrery"
        ? ["#273c54", "#83bbc4", "#d0dce2", "#152433"]
        : kind === "wind-banner"
          ? ["#477284", "#d99a5c", "#d1dee1", "#273e4b"]
          : ["#52696c", "#d0a253", "#b1aaa0", "#26363b"];
    if (!this.materials.length)
      this.materials = palette.map(
        (color, i) =>
          new THREE.MeshStandardMaterial({
            color,
            roughness: i === 2 ? 0.85 : 0.48,
            metalness: i === 2 ? 0 : 0.42,
          }),
      );
    const box = this.own(createChamferedBoxGeometry([0.05, 0.05, 0.05]));
    const cylinder = this.own(new THREE.CylinderGeometry(1, 1, 1, 12));
    const ring = this.own(new THREE.TorusGeometry(1, 0.07, 6, 32));
    const add = (
      g: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      m: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      const o = new THREE.Mesh(geometry, this.materials[m]);
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      o.castShadow = o.receiveShadow = true;
      o.userData.dynamic = true;
      g.add(o);
      return o;
    };
    const b = (
      g: THREE.Object3D,
      m: number,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => add(g, box, m, x, y, z, w, h, d);
    const c = (
      g: THREE.Object3D,
      m: number,
      x: number,
      y: number,
      z: number,
      r: number,
      h: number,
    ) => add(g, cylinder, m, x, y, z, r, h, r);
    const pivot = (x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      root.add(g);
      return g;
    };
    const bearing = (x: number, y: number, z: number) => {
      b(root, 0, x, y, z, 0.55, 0.66, 0.42);
      const hub = c(root, 2, x, y, z, 0.22, 0.5);
      hub.rotation.x = Math.PI / 2;
    };
    let pose: StageActor["pose"] = () => {};
    if (kind === "winch") {
      b(root, 2, 0, 0.2, 0, 5.3, 0.4, 2.9);
      for (const x of [-2, 2]) {
        b(root, 0, x, 2, 0, 0.35, 3.6, 0.4);
        b(root, 3, x, 0.48, 0, 0.75, 0.16, 0.8);
        b(root, 1, x, 3.9, 0, 0.55, 0.2, 0.65);
      }
      b(root, 0, 0, 4.1, 0, 4.65, 0.35, 0.5);
      bearing(-0.45, 3.7, 0);
      bearing(0.45, 3.7, 0);
      const drum = pivot(0, 3.65, 0);
      const barrel = c(drum, 1, 0, 0, 0, 0.45, 1.05);
      barrel.rotation.z = Math.PI / 2;
      for (const x of [-0.57, 0.57]) {
        const rim = c(drum, 0, x, 0, 0, 0.6, 0.1);
        rim.rotation.z = Math.PI / 2;
      }
      const rope = c(root, 3, 0, 2.1, 0.42, 0.035, 2.65),
        load = pivot(0, 0.9, 0.42);
      rope.name = "hoist-rope";
      rope.userData.ambientAnimated = true;
      b(load, 0, 0, 0, 0, 1.1, 0.7, 1);
      b(load, 1, 0, 0.37, 0, 1.15, 0.08, 1.05);
      b(load, 3, 0, 0.64, 0, 0.12, 0.5, 0.12);
      pose = (u, a) => {
        const y = 0.9 + u * 1.6;
        load.position.y = y;
        rope.position.y = (3.45 + y + 0.8) / 2;
        rope.scale.y = 3.45 - y - 0.8;
        drum.rotation.x = a;
      };
    } else if (kind === "ventilation") {
      b(root, 2, 0, 0.18, 0, 4.2, 0.36, 1.8);
      b(root, 0, 0, 1.95, 0, 3.9, 3.55, 1.35);
      b(root, 3, 0, 2.2, 0.72, 2.75, 2.75, 0.08);
      const rim = add(root, ring, 2, 0, 2.2, 0.79, 1.3, 1.3, 1);
      rim.rotation.z = Math.PI / 8;
      const fan = pivot(0, 2.2, 0.84);
      const hub = c(fan, 1, 0, 0, 0, 0.25, 0.2);
      hub.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        const blade = b(
          fan,
          0,
          Math.sin(a) * 0.65,
          Math.cos(a) * 0.65,
          0,
          0.36,
          1.1,
          0.09,
        );
        blade.rotation.z = -a + 0.25;
      }
      for (const x of [-1.1, 1.1]) {
        b(root, 2, x, 2.2, 0.98, 0.055, 2.4, 0.055);
      }
      b(root, 1, 1.4, 0.6, 0.75, 0.6, 0.28, 0.12);
      pose = (_u, a) => {
        fan.rotation.z = a;
      };
    } else if (kind === "piston" || kind === "gears") {
      b(root, 2, 0, 0.22, 0, 4.6, 0.44, 2.8);
      b(root, 0, 0, 0.6, 0, 4.15, 0.32, 2.3);
      if (kind === "piston") {
        for (const x of [-1.45, 1.45]) {
          c(root, 0, x, 2, 0, 0.12, 2.8);
          b(root, 1, x, 3.43, 0, 0.4, 0.22, 0.5);
        }
        b(root, 0, 0, 3.65, 0, 3.6, 0.35, 1.1);
        c(root, 0, 0, 3.15, 0, 0.65, 0.9);
        const rod = c(root, 2, 0, 2.25, 0, 0.16, 2.2),
          head = b(root, 1, 0, 1.4, 0, 1.35, 0.5, 1.15);
        rod.name = "piston-rod";
        head.name = "piston-head";
        rod.userData.ambientAnimated = head.userData.ambientAnimated = true;
        const wheel = pivot(1.65, 1.35, 0.7);
        add(wheel, ring, 1, 0, 0, 0, 0.75, 0.75, 1);
        for (let i = 0; i < 4; i++)
          b(wheel, 0, 0, 0, 0, 0.1, 1.4, 0.14).rotation.z = (i * Math.PI) / 4;
        bearing(1.65, 1.35, 0.7);
        pose = (u, a) => {
          rod.position.y = 2.25 - u * 0.6;
          head.position.y = 1.4 - u * 0.6;
          wheel.rotation.z = a;
        };
      } else {
        b(root, 0, 0, 1.8, -0.5, 4, 2.6, 0.25);
        const wheels: THREE.Group[] = [];
        for (const [x, y, r] of [
          [-0.9, 1.8, 0.9],
          [0.76, 1.8, 0.72],
          [1.5, 2.8, 0.45],
        ]) {
          bearing(x, y, -0.1);
          const wheel = pivot(x, y, 0.1);
          wheels.push(wheel);
          const disc = c(wheel, 1, 0, 0, 0, r * 0.86, 0.18);
          disc.rotation.x = Math.PI / 2;
          const teeth = Math.round(r / 0.045);
          for (let i = 0; i < teeth; i++) {
            const a = (i * Math.PI * 2) / teeth;
            const tooth = b(
              wheel,
              0,
              Math.sin(a) * r,
              Math.cos(a) * r,
              0,
              0.19,
              0.24,
              0.22,
            );
            tooth.rotation.z = -a;
          }
          const cap = c(wheel, 2, 0, 0, 0.16, 0.13, 0.22);
          cap.rotation.x = Math.PI / 2;
        }
        pose = (_u, a) => {
          wheels[0].rotation.z = a;
          wheels[1].rotation.z = -a * 1.25;
          wheels[2].rotation.z = a * 2;
        };
      }
    } else if (kind === "orrery") {
      c(root, 2, 0, 0.18, 0, 2.2, 0.36);
      c(root, 0, 0, 0.65, 0, 1.15, 0.6);
      c(root, 1, 0, 1.4, 0, 0.22, 1.25);
      const orbit = pivot(0, 3, 0);
      add(orbit, ring, 0, 0, 0, 0, 1.8, 1.8, 1.8);
      const inner = new THREE.Group();
      orbit.add(inner);
      add(inner, ring, 1, 0, 0, 0, 1.4, 1.4, 1.4);
      const core = c(inner, 2, 0, 0, 0, 0.4, 0.7);
      core.rotation.z = Math.PI / 4;
      b(orbit, 1, 0, 1.8, 0, 0.3, 0.3, 0.3);
      pose = (_u, a) => {
        orbit.rotation.y = a * 0.15;
        orbit.rotation.z = 0.3;
        inner.rotation.x = a * 0.22;
      };
    } else if (kind === "wind-banner") {
      c(root, 2, 0, 0.15, 0, 0.8, 0.3);
      c(root, 0, 0, 2.7, 0, 0.075, 5.1);
      c(root, 1, 0, 5.32, 0, 0.15, 0.18);
      const sections: THREE.Group[] = [];
      let parent: THREE.Group = root;
      for (let i = 0; i < 6; i++) {
        const g = new THREE.Group();
        g.position.set(i === 0 ? 0.02 : 0.36, i === 0 ? 4.4 : 0, 0);
        parent.add(g);
        sections.push(g);
        b(g, i % 2 ? 1 : 0, 0.18, 0, 0, 0.365, 1 - i * 0.085, 0.035);
        parent = g;
      }
      pose = (u, _a, t) => {
        sections.forEach((g, i) => {
          g.rotation.y =
            Math.sin(t * 1.6 - i * 0.55) *
            (0.06 + u * 0.11) *
            this.direction!.amplitude;
        });
      };
    } else {
      b(root, 2, 0, 0.12, 0, 10.8, 0.24, 2.7);
      for (let x = -5; x <= 5; x += 0.8)
        b(root, 3, x, 0.31, 0, 0.22, 0.14, 2.3);
      for (const z of [-0.8, 0.8]) {
        b(root, 0, 0, 0.47, z, 10.5, 0.2, 0.12);
        for (const x of [-5, 5]) b(root, 1, x, 0.66, z, 0.3, 0.3, 0.3);
      }
      const cart = pivot(-3, 0.88, 0);
      cart.name = 'rail-cart';
      b(cart, 0, 0, 0.43, 0, 2.3, 0.45, 1.7);
      for (const z of [-0.85, 0.85]) b(cart, 1, 0, 1.05, z, 2.55, 1, 0.12);
      for (const x of [-1.22, 1.22]) b(cart, 1, x, 1.05, 0, 0.12, 1, 1.75);
      const wheels: THREE.Mesh[] = [];
      for (const x of [-0.85, 0.85])
        for (const z of [-0.86, 0.86]) {
          const wheel = c(cart, 3, x, 0, z, 0.31, 0.16);
          wheel.rotation.x = Math.PI / 2;
          wheel.userData.ambientAnimated = true;
          wheels.push(wheel);
        }
      for (let i = 0; i < 5; i++)
        b(
          cart,
          3,
          Math.sin(i * 6) * 0.7,
          0.95 + Math.cos(i * 3) * 0.15,
          Math.cos(i * 6) * 0.4,
          0.75,
          0.65,
          0.6,
        ).rotation.z = i * 0.3;
      pose = (u) => {
        cart.position.x = -3 + 6 * u;
        for (const wheel of wheels) wheel.rotation.y = (-6 * u) / 0.31;
      };
    }
    // Combine fixed parts by parent and material, retaining only true moving pivots.
    this.batch(root);
    return { root, pose, phase: 0 };
  }
  private own<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.add(g);
    return g;
  }
  private batch(parent: THREE.Group) {
    for (const child of [...parent.children])
      if (child instanceof THREE.Group) this.batch(child);
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children)
      if (
        child instanceof THREE.Mesh &&
        !child.userData.ambientAnimated &&
        !Array.isArray(child.material)
      ) {
        const arr = groups.get(child.material) || [];
        arr.push(child);
        groups.set(child.material, arr);
      }
    for (const [material, meshes] of groups) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((m) => {
        m.updateMatrix();
        return m.geometry.clone().applyMatrix4(m.matrix).toNonIndexed();
      });
      const merged = mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(this.own(merged), material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.dynamic = true;
      meshes.forEach((m) => parent.remove(m));
      parent.add(mesh);
    }
  }
  update(
    seconds: number,
    camera: THREE.Vector3,
    low: boolean,
    reducedMotion = false,
  ) {
    if (this.disposed || !this.direction) return;
    const d = this.direction,
      t = Number.isFinite(seconds) ? seconds : 0,
      range = low ? 130 : 220;
    this.actors.forEach((a, i) => {
      a.root.visible =
        (!low || i === 0) &&
        a.root.position.distanceToSquared(camera) < range * range;
      if (!a.root.visible) return;
      const time = reducedMotion ? 0 : t + a.phase,
        phase = ((time % d.cycle) + d.cycle) % d.cycle;
      const u = Math.min(1, phase / d.active),
        turn =
          (Math.floor(time / d.cycle) +
            u -
            Math.sin(u * Math.PI * 2) / (Math.PI * 2)) *
          Math.PI *
          8;
      a.pose(
        reducedMotion ? 0 : ambientTravel(time, d.cycle, d.active),
        reducedMotion ? 0 : turn,
        reducedMotion ? 0 : time,
      );
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.actors = [];
    this.geometries.forEach((g) => g.dispose());
    this.geometries.clear();
    this.materials.forEach((m) => m.dispose());
    this.materials = [];
  }
}
