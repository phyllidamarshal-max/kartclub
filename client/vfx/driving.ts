import * as THREE from "three";
import { createParticleMesh, uploadParticles } from "./particle-layer.ts";
import { vfxBudget } from "./budgets.ts";
import type { Car } from "../../shared/race.ts";
import { continuousTrack, angleDiff, type Track } from "../../shared/track.ts";
import {
  EmissionClock,
  DrivingCues,
  ParticlePool,
  kartAnchor,
  driftSparkColor,
} from "./driving-state.ts";

export interface DrivingVfxFrame {
  active: boolean;
  paused: boolean;
  quality: string;
  motion: number;
  /** Online caller supplies confirmed cars; an empty array means no confirmation yet. */
  authoritative?: readonly Car[];
  itemBoost?: (id: string) => boolean;
  priorityImpact?: boolean;
}
type Trail = {
  x: number;
  z: number;
  heading: number;
  branch: string;
  distance: number;
  clock: EmissionClock;
  boostClock: EmissionClock;
  drift: boolean;
  ignition: number;
  impulse: number;
  boosting: boolean;
  itemBoost: boolean;
};

export class DrivingVfx {
  readonly group = new THREE.Group();
  private readonly smoke = new ParticlePool(512);
  private readonly sparks = new ParticlePool(256);
  private readonly marks = new ParticlePool(480);
  private readonly smokeMesh = createParticleMesh(this.smoke, false);
  private readonly sparkMesh = createParticleMesh(this.sparks, true);
  private readonly skidMesh: THREE.InstancedMesh;
  private readonly flameMesh: THREE.InstancedMesh;
  private readonly scratch = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly trails = new Map<string, Trail>();
  private readonly cues = new DrivingCues();
  private elapsed = 0;
  private seed = 1931;
  private disposed = false;
  private wasActive = false;
  private localImpact = false;

  constructor(
    scene: THREE.Scene,
    private readonly track: Track,
  ) {
    this.group.name = "driving-vfx";
    this.group.userData.dynamic = true;
    const skidGeometry = new THREE.PlaneGeometry(0.24, 1.05);
    skidGeometry.setAttribute(
      "fade",
      new THREE.InstancedBufferAttribute(new Float32Array(480), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.skidMesh = new THREE.InstancedMesh(
      skidGeometry,
      new THREE.ShaderMaterial({
        vertexShader: `attribute float fade; varying float vFade; varying vec2 vUv;
        void main(){vFade=fade;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
        fragmentShader: `varying float vFade; varying vec2 vUv;
        void main(){float edge=smoothstep(0.,.13,vUv.x)*smoothstep(0.,.13,1.-vUv.x);
          gl_FragColor=vec4(.035,.045,.052,edge*vFade*.32);}`,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        side: THREE.DoubleSide,
      }),
      480,
    );
    this.flameMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 10),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      16,
    );
    this.flameMesh.setColorAt(0, this.color.setHex(0xffffff));
    for (const m of [this.skidMesh, this.flameMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
    }
    this.group.add(
      this.skidMesh,
      this.smokeMesh,
      this.sparkMesh,
      this.flameMesh,
    );
    scene.add(this.group);
  }

  get stats() {
    return {
      particles: this.smoke.count + this.sparks.count,
      skids: this.marks.count,
      flames: this.flameMesh.count,
    };
  }
  get impactPressure() {
    return this.localImpact;
  }
  setPixelHeight(height: number) {
    this.smokeMesh.material.uniforms.pixelHeight.value = height;
    this.sparkMesh.material.uniforms.pixelHeight.value = height;
  }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private ground(x: number, z: number, c: Car) {
    return continuousTrack(x, z, c.lastT, this.track, c.routeBranch).y;
  }

  update(
    cars: readonly Car[],
    localId: string,
    dt: number,
    frame: DrivingVfxFrame,
  ) {
    if (this.disposed || frame.paused) return;
    const ids = new Set(cars.map((c) => c.id));
    this.cues.prune(ids);
    for (const id of this.trails.keys())
      if (!ids.has(id)) this.trails.delete(id);
    if (!frame.active || !(dt > 0) || dt > 0.25) {
      if (this.wasActive) this.reset();
      for (const c of frame.authoritative ?? cars) this.cues.take(c, false);
      this.wasActive = false;
      return;
    }
    this.wasActive = true;
    this.localImpact = false;
    const low = frame.quality === "low",
      reduced = frame.motion <= 0;
    this.smoke.limit = vfxBudget(frame.quality).smoke;
    this.sparks.limit = vfxBudget(frame.quality).sparks;
    this.marks.limit = low ? 256 : 480;
    this.elapsed += dt;
    this.smoke.tick(dt);
    this.sparks.tick(dt);
    this.marks.tick(dt);
    if (reduced) {
      this.smoke.clear();
      this.sparks.clear();
    }
    this.flameMesh.count = 0;
    const selected = cars
      .filter((c) => c.id !== "ghost")
      .toSorted((a, b) => {
        if (a.id === localId) return -1;
        if (b.id === localId) return 1;
        const local = cars.find((c) => c.id === localId);
        return local
          ? Math.hypot(a.x - local.x, a.z - local.z) -
              Math.hypot(b.x - local.x, b.z - local.z)
          : a.slot - b.slot;
      })
      .slice(0, low ? 3 : 8);
    const selectedIds = new Set(selected.map((c) => c.id));
    for (const id of this.trails.keys())
      if (!selectedIds.has(id)) this.trails.delete(id);
    const frameCues = new Map<string, number>();
    // Even culled racers advance their event cursor: entering the visual budget
    // later must not replay a boost that finished while they were omitted.
    for (const source of frame.authoritative ?? cars) {
      const cue = this.cues.take(
        source,
        selectedIds.has(source.id) &&
          !source.finished &&
          source.resetTime <= 0 &&
          source.ghostTime <= 0,
      );
      if (cue) frameCues.set(source.id, cue);
    }
    for (const c of selected) {
      const valid = !c.finished && c.resetTime <= 0 && c.ghostTime <= 0;
      const cue = frameCues.get(c.id) ?? 0;
      const previous = this.trails.get(c.id);
      const distance = previous
        ? Math.hypot(c.x - previous.x, c.z - previous.z)
        : 0;
      const continuous =
        !!previous &&
        distance < 8 &&
        previous.branch === c.routeBranch &&
        Math.abs(angleDiff(c.heading, previous.heading)) < 0.8;
      const drifting =
        valid &&
        c.drifting &&
        Math.abs(c.speed) > 10 &&
        Math.abs(c.slipAngle) > 0.12;
      const trail = previous ?? {
        x: c.x,
        z: c.z,
        heading: c.heading,
        branch: c.routeBranch,
        distance: 0,
        clock: new EmissionClock(),
        boostClock: new EmissionClock(),
        drift: false,
        ignition: 0,
        impulse: 0,
        boosting: false,
        itemBoost: false,
      };
      if (!continuous || !drifting || !trail.drift) {
        trail.distance = 0;
        trail.clock.clear();
      }
      if (drifting && continuous && trail.drift) {
        const spacing = low ? 1 : 0.7;
        const total = trail.distance + distance;
        const count = Math.min(12, Math.floor(total / spacing));
        for (let n = 0; n < count; n++) {
          const t =
            distance > 0 ? (spacing * (n + 1) - trail.distance) / distance : 1;
          const pose = {
            x: trail.x + (c.x - trail.x) * t,
            z: trail.z + (c.z - trail.z) * t,
            heading: trail.heading + angleDiff(c.heading, trail.heading) * t,
          };
          for (const side of [-1.18, 1.18]) {
            const p = kartAnchor(pose, side, -1.12);
            this.marks.emit(
              p.x,
              this.ground(p.x, p.z, c) + 0.045,
              p.z,
              0,
              0,
              0,
              low ? 5 : 8,
              1,
              0,
              Math.atan2(c.x - trail.x, c.z - trail.z),
              true,
            );
          }
        }
        trail.distance = total % spacing;
      }
      const secondary =
        c.id !== localId && (frame.priorityImpact || this.localImpact);
      if (drifting && continuous && !reduced) {
        const count = trail.clock.take(
          (low ? 14 : 28) * (secondary ? 0.35 : 1),
          dt,
        );
        const sparkColor = driftSparkColor(c);
        for (let n = 0; n < count; n++)
          for (const side of [-1.18, 1.18]) {
            const p = kartAnchor(c, side, -1.12),
              y = this.ground(p.x, p.z, c);
            this.smoke.emit(
              p.x,
              y + 0.18,
              p.z,
              (this.random() - 0.5) * 0.8,
              0.45,
              (this.random() - 0.5) * 0.8,
              0.6 + this.random() * 0.35,
              0.32 + Math.abs(c.slipAngle) * 0.28,
              0xcbd7da,
            );
            if (sparkColor !== null)
              this.sparks.emit(
                p.x,
                y + 0.13,
                p.z,
                -Math.sin(c.heading) * 3 + (this.random() - 0.5) * 2,
                0.6 + this.random(),
                -Math.cos(c.heading) * 3 + (this.random() - 0.5) * 2,
                0.16 + this.random() * 0.16,
                0.065,
                sparkColor,
              );
          }
      }
      const itemBoost = frame.itemBoost?.(c.id) === true;
      const ignition =
        valid &&
        continuous &&
        !reduced &&
        (cue > 0 || (itemBoost && !trail.itemBoost && c.boostTime > 0));
      trail.ignition =
        continuous && valid && !reduced ? Math.max(0, trail.ignition - dt) : 0;
      if (ignition) {
        trail.ignition = trail.boosting ? 0.12 : 0.2;
        trail.impulse = trail.boosting ? 0.24 : 0.72;
      }
      const impulse = trail.impulse * Math.min(1, trail.ignition / 0.1);
      if (c.id === localId && trail.ignition > 0) this.localImpact = true;
      if (valid && (c.boostTime > 0 || c.miniTime > 0)) {
        this.flame(c, reduced, itemBoost, impulse);
        if (continuous && !reduced) {
          const count = trail.boostClock.take(
              (low ? 18 : 30) * (secondary ? 0.35 : 1),
              dt,
            ),
            p = kartAnchor(c, -0.48, -1.95);
          for (let i = 0; i < count; i++)
            this.sparks.emit(
              p.x,
              this.ground(c.x, c.z, c) + 0.5,
              p.z,
              -Math.sin(c.heading) * 2,
              0,
              -Math.cos(c.heading) * 2,
              0.12,
              0.09,
              itemBoost ? 0x6affcb : c.boostTime > 0 ? 0x75e6ff : 0xffd18b,
            );
        }
      } else trail.boostClock.clear();
      if (ignition) {
        const p = kartAnchor(c, -0.48, -1.64),
          y = this.ground(p.x, p.z, c) + 0.5;
        for (
          let n = 0;
          n <
          Math.ceil(
            (low ? 8 : 18) *
              (trail.boosting ? 0.35 : 1) *
              (secondary ? 0.4 : 1),
          );
          n++
        )
          this.sparks.emit(
            p.x,
            y,
            p.z,
            (this.random() - 0.5) * 3 - Math.sin(c.heading) * 9,
            (this.random() - 0.3) * 3,
            (this.random() - 0.5) * 3 - Math.cos(c.heading) * 9,
            0.25 + this.random() * 0.2,
            0.09,
            itemBoost ? 0x88ffce : cue & 1 ? 0x8af3ff : 0xffce74,
          );
      }
      trail.x = c.x;
      trail.z = c.z;
      trail.heading = c.heading;
      trail.branch = c.routeBranch;
      trail.drift = drifting;
      trail.boosting = valid && (c.boostTime > 0 || c.miniTime > 0);
      trail.itemBoost = itemBoost;
      this.trails.set(c.id, trail);
    }
    uploadParticles(this.smoke, this.smokeMesh, false);
    uploadParticles(this.sparks, this.sparkMesh, true);
    const fade = this.skidMesh.geometry.getAttribute("fade");
    let markIndex = 0;
    for (let i = 0; i < this.marks.limit; i++)
      if (this.marks.life[i] > 0) {
        this.scratch.position.set(
          this.marks.x[i],
          this.marks.y[i],
          this.marks.z[i],
        );
        this.scratch.rotation.set(-Math.PI / 2, 0, this.marks.angle[i]);
        this.scratch.scale.set(1, 1, 1);
        this.scratch.updateMatrix();
        this.skidMesh.setMatrixAt(markIndex, this.scratch.matrix);
        fade.setX(
          markIndex++,
          Math.min(1, (1 - this.marks.age[i] / this.marks.life[i]) * 3),
        );
      }
    this.skidMesh.count = markIndex;
    this.skidMesh.visible = markIndex > 0;
    fade.needsUpdate = true;
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.flameMesh.visible = this.flameMesh.count > 0;
    this.flameMesh.instanceMatrix.needsUpdate = true;
    if (this.flameMesh.instanceColor)
      this.flameMesh.instanceColor.needsUpdate = true;
  }

  private flame(c: Car, reduced: boolean, itemBoost: boolean, impulse: number) {
    const nitro = c.boostTime > 0;
    const length =
      (nitro ? (itemBoost ? 1.6 : 2.1) : 1.05) *
      (1 + impulse) *
      (reduced
        ? 1
        : (0.93 + Math.sin(this.elapsed * (itemBoost ? 24 : 38)) * 0.07) *
          Math.min(
            1,
            Math.max(0.25, (nitro ? c.boostTime : c.miniTime) / 0.16),
          ));
    for (let layer = 0; layer < 2; layer++) {
      const len = length * (layer ? 0.62 : 1),
        p = kartAnchor(c, -0.48, -1.64 - len * 0.5);
      this.scratch.position.set(p.x, this.ground(c.x, c.z, c) + 0.5, p.z);
      this.scratch.rotation.set(0, c.heading, 0);
      this.scratch.rotateX(-Math.PI / 2);
      const radius = (layer ? 0.12 : 0.22) * (1 + impulse * 0.4);
      this.scratch.scale.set(radius, len, radius);
      this.scratch.updateMatrix();
      this.flameMesh.setMatrixAt(this.flameMesh.count, this.scratch.matrix);
      this.flameMesh.setColorAt(
        this.flameMesh.count++,
        this.color.setHex(
          layer
            ? 0xeaffff
            : nitro
              ? itemBoost
                ? 0x39ffc1
                : 0x23bfff
              : 0xffae45,
        ),
      );
    }
  }
  reset() {
    this.smoke.clear();
    this.sparks.clear();
    this.marks.clear();
    this.trails.clear();
    this.cues.clear();
    this.flameMesh.count = this.skidMesh.count = 0;
    for (const child of this.group.children) child.visible = false;
    this.elapsed = 0;
    this.wasActive = false;
    this.localImpact = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const mesh of [
      this.smokeMesh,
      this.sparkMesh,
      this.skidMesh,
      this.flameMesh,
    ]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
    }
    this.reset();
  }
}
