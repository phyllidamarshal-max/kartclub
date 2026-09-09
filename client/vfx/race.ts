import * as THREE from "three";
import type { Car } from "../../shared/race.ts";
import type { ItemWorld } from "../../shared/items.ts";
import {
  continuousTrack,
  nearestTrack,
  type Track,
} from "../../shared/track.ts";
import { DRIVING_CONFIG as CFG } from "../../shared/driving-config.ts";
import { drivingZoneAt, getLevel } from "../../shared/levels.ts";
import { ParticlePool, EmissionClock, kartAnchor } from "./driving-state.ts";
import { ParticleLayer } from "./particle-layer.ts";
import { RingLayer } from "./ring-layer.ts";
import { vfxBudget } from "./budgets.ts";
import { CollisionVfxReader, ItemVfxReader } from "./events.ts";
import type { DrivingVfxFrame } from "./driving.ts";

function instances(
  geometry: THREE.BufferGeometry,
  capacity: number,
  wireframe = false,
) {
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.83,
      depthWrite: false,
      toneMapped: false,
      wireframe,
    }),
    capacity,
  );
  mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color(0xffffff));
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}
function shell() {
  const geometry = new THREE.SphereGeometry(1, 20, 12);
  geometry.setAttribute(
    "phase",
    new THREE.InstancedBufferAttribute(new Float32Array(16), 1),
  );
  geometry.setAttribute(
    "strength",
    new THREE.InstancedBufferAttribute(new Float32Array(16), 1),
  );
  const m = new THREE.InstancedMesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: { clock: { value: 0 } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `attribute float phase;attribute float strength;varying vec3 n;varying vec3 eye;varying vec3 tint;varying vec2 uvp;varying float style;varying float alpha;
      void main(){vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);n=normalize(mat3(modelViewMatrix*instanceMatrix)*normal);eye=normalize(-p.xyz);tint=instanceColor;style=phase;alpha=strength;uvp=uv;gl_Position=projectionMatrix*p;}`,
      fragmentShader: `uniform float clock;varying vec3 n;varying vec3 eye;varying vec3 tint;varying vec2 uvp;varying float style;varying float alpha;
      void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye))),2.5);float line=pow(.5+.5*sin(uvp.y*72.-clock*2.),12.);float mask=style>.5?step(.6,fract(uvp.x*16.))*step(.45,fract(uvp.y*12.)):1.;
        if(style>1.5){float wave=pow(1.-abs(dot(normalize(n),normalize(eye))),4.);gl_FragColor=vec4(mix(tint,vec3(1.),smoothstep(.68,1.,alpha)),(wave*.9+.09)*alpha);}
        else gl_FragColor=vec4(tint,(rim*.55+line*.06+.018)*alpha*mask);
        #include <colorspace_fragment>
      }`,
    }),
    16,
  );
  m.setColorAt(0, new THREE.Color(0x78deff));
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

export class RaceVfx {
  readonly group = new THREE.Group();
  private particles = new ParticleLayer(192, true);
  private rings = new RingLayer(48);
  private pulses = new ParticlePool(24);
  private boxes = instances(new THREE.OctahedronGeometry(0.85), 24, true);
  private missiles = instances(new THREE.ConeGeometry(0.3, 1.2, 8), 64);
  private traps = instances(new THREE.TorusGeometry(1.3, 0.07, 4, 3), 16);
  private shells = shell();
  private itemEvents = new ItemVfxReader();
  private collisionEvents = new CollisionVfxReader();
  private clock = new EmissionClock();
  private previous = new Map<
    string,
    {
      shield: number;
      reset: number;
      ghost: number;
      boost: number;
      nitro: number;
    }
  >();
  private boxReady = new Map<number, boolean>();
  private propellant = new Map<string, number>();
  private missileRoutes = new Map<
    number,
    { t: number; branch: Car["routeBranch"] }
  >();
  private elapsed = 0;
  private disposed = false;
  private seed = 421;
  private pixelHeight = 900;
  private scratch = new THREE.Object3D();
  private color = new THREE.Color();
  private shieldCount = 0;
  private protectionCount = 0;
  private blockWaves = new Map<string, number>();
  private impactUntil = 0;
  constructor(
    scene: THREE.Scene,
    private track: Track,
  ) {
    this.group.name = "race-vfx";
    this.group.userData.dynamic = true;
    this.group.add(
      this.particles.mesh,
      this.rings.mesh,
      this.boxes,
      this.missiles,
      this.traps,
      this.shells,
    );
    scene.add(this.group);
  }
  get stats() {
    return {
      particles: this.particles.pool.count,
      rings: this.rings.mesh.count,
      shields: this.shieldCount,
      protection: this.protectionCount,
    };
  }
  get impactPressure() {
    return this.impactUntil > this.elapsed;
  }
  setPixelHeight(height: number) {
    this.pixelHeight = height;
  }
  boostKind(id: string): "item" | "nitro" {
    return (this.propellant.get(id) ?? 0) > this.elapsed ? "item" : "nitro";
  }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private y(c: Car) {
    return continuousTrack(c.x, c.z, c.lastT, this.track, c.routeBranch).y;
  }
  private burst(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    spread = 4,
  ) {
    for (let i = 0; i < count; i++)
      this.particles.pool.emit(
        x,
        y,
        z,
        (this.random() - 0.5) * spread,
        this.random() * 2 + 0.2,
        (this.random() - 0.5) * spread,
        0.25 + this.random() * 0.25,
        0.06 + this.random() * 0.06,
        color,
      );
  }
  private pulse(
    x: number,
    y: number,
    z: number,
    color: number,
    radius: number,
    life = 0.4,
  ) {
    this.pulses.emit(x, y, z, 0, 0, 0, life, radius, color, 0, true);
  }
  private place(
    mesh: THREE.InstancedMesh,
    x: number,
    y: number,
    z: number,
    scale: number,
    color: number,
    heading = 0,
    tilt = 0,
  ) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    this.scratch.position.set(x, y, z);
    this.scratch.rotation.set(0, heading, 0);
    this.scratch.rotateX(tilt);
    this.scratch.scale.setScalar(scale);
    this.scratch.updateMatrix();
    mesh.setMatrixAt(mesh.count, this.scratch.matrix);
    mesh.setColorAt(mesh.count++, this.color.setHex(color));
  }
  update(
    cars: readonly Car[],
    localId: string,
    w: ItemWorld | null,
    dt: number,
    frame: DrivingVfxFrame,
  ) {
    if (this.disposed || frame.paused) return;
    const source = frame.authoritative ?? cars;
    if (!frame.active || dt > 0.25 || !(dt > 0)) {
      this.reset();
      this.itemEvents.read(w, false);
      this.collisionEvents.read(source, false);
      return;
    }
    const low = frame.quality === "low",
      motion = frame.motion > 0,
      budget = vfxBudget(frame.quality);
    this.elapsed += dt;
    for (const [id, until] of this.blockWaves)
      if (!motion || until <= this.elapsed || !cars.some((c) => c.id === id))
        this.blockWaves.delete(id);
    if (!motion) this.impactUntil = 0;
    this.particles.pool.limit = budget.combat;
    this.particles.pool.tick(dt);
    this.pulses.tick(dt);
    if (!motion) {
      this.particles.clear();
      this.pulses.clear();
    }
    this.rings.begin(low ? 24 : 48);
    this.boxes.count =
      this.missiles.count =
      this.traps.count =
      this.shells.count =
        0;
    this.shieldCount = this.protectionCount = 0;
    const local = cars.find((c) => c.id === localId);
    const nearby = (x: number, z: number) =>
      !local || Math.hypot(x - local.x, z - local.z) < (low ? 60 : 100);
    const ordered = [...cars].sort((a, b) =>
      a.id === localId ? -1 : b.id === localId ? 1 : 0,
    );
    const events = this.itemEvents.read(w, true);
    for (const cue of this.collisionEvents.read(source, true))
      if (motion && nearby(cue.car.x, cue.car.z)) {
        if (cue.car.id === localId && cue.strength >= 3)
          this.impactUntil = this.elapsed + 0.35;
        const c = cars.find((c) => c.id === cue.car.id) ?? cue.car,
          strength = Math.min(1, Math.max(0, cue.strength / 10)),
          y = this.y(c),
          p = kartAnchor(
            c,
            cue.kind === "wall" ? (c.slipAngle < 0 ? -1 : 1) : 0,
            cue.kind === "obstacle" ? 1.25 : 0,
          );
        this.burst(
          p.x,
          y + 0.6,
          p.z,
          cue.kind === "kart" ? 0xd4f2ff : 0xffca79,
          Math.round((low ? 5 : 9) + strength * (low ? 6 : 14)),
          2 + strength * 4,
        );
        this.pulse(c.x, y + 0.09, c.z, 0xffd29a, 0.9 + strength * 1.2, 0.3);
        if (cue.loss > 0)
          this.burst(c.x, y + 0.9, c.z, 0x55d7ff, low ? 5 : 10, 3);
      }
    for (const event of events) {
      if (event.kind === "use" && event.item === "boost")
        this.propellant.set(
          event.actor,
          this.elapsed +
            (source.find((c) => c.id === event.actor)?.boostTime ?? 2.3),
        );
      if (!motion || !nearby(event.x, event.z)) continue;
      const blocked = event.kind === "block",
        hit = event.kind === "hit";
      if ((blocked || hit) && event.target === localId)
        this.impactUntil = this.elapsed + 0.42;
      if (
        blocked &&
        event.target &&
        cars.some((c) => c.id === event.target && !c.finished)
      )
        this.blockWaves.set(event.target, this.elapsed + 0.36);
      const color = blocked
        ? 0x9cf5ff
        : event.item === "trap"
          ? 0xe997ff
          : hit
            ? 0xffbb68
            : event.item === "boost"
              ? 0x65ffc4
              : 0xffe8a0;
      if (hit || blocked) {
        this.burst(
          event.x,
          event.y + 0.7,
          event.z,
          blocked ? 0xf3ffff : color,
          blocked ? (low ? 5 : 10) : low ? 10 : 24,
        );
        this.pulse(
          event.x,
          event.y + 0.09,
          event.z,
          color,
          event.item === "trap" ? 2.45 : 2.2,
          0.45,
        );
      } else if (["pickup", "launch", "deploy"].includes(event.kind)) {
        this.burst(event.x, event.y + 0.7, event.z, color, low ? 6 : 12, 2);
        this.pulse(
          event.x,
          event.y + 0.09,
          event.z,
          color,
          event.kind === "deploy" ? 1.4 : 1,
          0.35,
        );
      } else if (event.kind === "use" && event.item === "boost") {
        this.pulse(event.x, event.y + 0.09, event.z, color, 1.8, 0.4);
        this.pulse(event.x, event.y + 0.095, event.z, color, 1.1, 0.28);
        this.burst(event.x, event.y + 0.45, event.z, color, low ? 6 : 14);
      }
    }
    for (let i = 0; i < this.pulses.limit; i++)
      if (this.pulses.life[i] > 0) {
        const t = this.pulses.age[i] / this.pulses.life[i];
        this.rings.add(
          this.pulses.x[i],
          this.pulses.y[i],
          this.pulses.z[i],
          this.pulses.size[i] * (0.3 + 0.7 * t),
          this.pulses.color[i],
          (1 - t) * 0.75,
        );
      }
    const rate = this.clock.take(low ? 12 : 24, dt);
    for (const c of ordered) {
      if (c.id === "ghost" || !nearby(c.x, c.z)) continue;
      const surface = continuousTrack(
        c.x,
        c.z,
        c.lastT,
        this.track,
        c.routeBranch,
      );
      const state = w?.players[c.id],
        y = surface.y,
        old = this.previous.get(c.id),
        nitro = source.find((s) => s.id === c.id)?.nitroUses ?? old?.nitro ?? 0;
      const blockLeft = (this.blockWaves.get(c.id) ?? 0) - this.elapsed;
      if (blockLeft > 0 && !c.finished && c.resetTime <= 0) {
        const progress = 1 - blockLeft / 0.36,
          i = this.shells.count;
        // Contact normals are unavailable: expand around the confirmed target.
        this.place(
          this.shells,
          c.x,
          y + 1,
          c.z,
          1.6 + progress * 1.2,
          0x64ddff,
        );
        if (this.shells.count > i) {
          this.shells.geometry.getAttribute("phase").setX(i, 2);
          this.shells.geometry.getAttribute("strength").setX(i, 1 - progress);
        }
      }
      if (old && nitro > old.nitro) this.propellant.delete(c.id);
      if (c.boostTime <= 0) this.propellant.delete(c.id);
      if (c.resetTime > 0)
        this.rings.add(
          c.x,
          y + 0.08,
          c.z,
          1 + (1.1 * c.resetTime) / CFG.reset.wait,
          0xacd6ff,
          0.55,
          true,
        );
      if (old && old.reset > 0 && c.resetTime <= 0 && c.ghostTime > 0 && motion)
        this.pulse(c.x, y + 0.08, c.z, 0xbdeaff, 2.1, 0.35);
      if (!c.finished && (state?.shield ?? 0) > 0) {
        const value = state!.shield;
        const expand = motion ? Math.min(1, (5 - value) / 0.18 + 0.25) : 1;
        const i = this.shells.count;
        this.place(this.shells, c.x, y + 1, c.z, 2.05 * expand, 0x6cddff);
        if (this.shells.count > i) {
          this.shells.geometry.getAttribute("phase").setX(i, 0);
          this.shells.geometry
            .getAttribute("strength")
            .setX(i, Math.min(1, value / 0.7));
          this.shieldCount++;
        }
      } else if (
        !c.finished &&
        ((state?.hitProtection ?? 0) > 0 || c.ghostTime > 0)
      ) {
        const i = this.shells.count;
        this.place(this.shells, c.x, y + 1, c.z, 2.07, 0xc3e5ed);
        if (this.shells.count > i) {
          this.shells.geometry.getAttribute("phase").setX(i, 1);
          this.shells.geometry.getAttribute("strength").setX(i, 0.55);
          this.protectionCount++;
        }
      }
      if (
        old &&
        state &&
        old.shield > 0 &&
        state.shield <= 0 &&
        motion &&
        !events.some((e) => e.kind === "block" && e.target === c.id)
      )
        this.pulse(c.x, y + 0.08, c.z, 0x6da7b9, 2, 0.2);
      if ((state?.slow ?? 0) > 0)
        this.rings.add(c.x, y + 0.07, c.z, 1.6, 0xee8dfb, 0.58, true);
      if (
        c.miniWindow > 0 &&
        c.boostTime <= 0 &&
        c.resetTime <= 0 &&
        !c.finished
      )
        this.rings.add(
          c.x,
          y + 0.08,
          c.z,
          1.1 + (0.65 * c.miniWindow) / CFG.mini.window,
          0xffce7f,
          0.5,
          true,
        );
      const zone = drivingZoneAt(
        this.track.id,
        surface.t,
        surface.lateral,
        c.routeBranch,
      );
      if (
        zone &&
        c.speed > 3 &&
        !c.finished &&
        c.resetTime <= 0 &&
        c.ghostTime <= 0
      ) {
        if (zone.kind === "boost" && c.throttleHeld)
          this.rings.add(c.x, y + 0.08, c.z, 1.4, 0x70ffca, 0.48);
        if (
          motion &&
          zone.kind !== "boost" &&
          (c.id === localId || !this.impactPressure)
        )
          for (let n = 0; n < rate; n++)
            for (const side of [-1.18, 1.18]) {
              const p = kartAnchor(c, side, -1.12),
                ice = zone.kind === "ice";
              this.particles.pool.emit(
                p.x,
                y + 0.12,
                p.z,
                this.random() - 0.5,
                ice ? 0.4 : 0.65,
                this.random() - 0.5,
                ice ? 0.25 : 0.45,
                ice ? 0.055 : 0.19,
                ice
                  ? 0xc4f8ff
                  : getLevel(this.track.id).biome === "desert"
                    ? 0xc99c62
                    : 0x9ca09b,
              );
            }
      }
      this.previous.set(c.id, {
        shield: state?.shield ?? 0,
        reset: c.resetTime,
        ghost: c.ghostTime,
        boost: c.boostTime,
        nitro,
      });
    }
    const ids = new Set(cars.map((c) => c.id));
    for (const id of this.previous.keys())
      if (!ids.has(id)) {
        this.previous.delete(id);
        this.propellant.delete(id);
      }
    if (w) {
      const localState = local ? w.players[localId] : null;
      w.boxes.forEach((b, index) => {
        const ready = b.readyAt <= w.time,
          old = this.boxReady.get(index);
        this.boxReady.set(index, ready);
        if (!ready || !nearby(b.x, b.z)) return;
        const eligible =
          !local ||
          !localState ||
          (localState.pickedLaps[b.band] < Math.floor(local.progress) &&
            !localState.held);
        this.place(
          this.boxes,
          b.x,
          b.y + 1.4 + (motion ? Math.sin(this.elapsed * 2 + index) * 0.12 : 0),
          b.z,
          1,
          eligible ? 0xffdc83 : 0x9d9990,
          motion ? this.elapsed : 0,
        );
        this.rings.add(
          b.x,
          b.y + 0.06,
          b.z,
          0.85,
          eligible ? 0xffd677 : 0x8c9595,
          eligible ? 0.4 : 0.22,
          !eligible,
        );
        if (old === false && motion)
          this.pulse(b.x, b.y + 0.06, b.z, 0xffdf8d, 1.1, 0.3);
      });
      for (const t of w.traps)
        if (nearby(t.x, t.z)) {
          const y = t.y ?? nearestTrack(t.x, t.z, this.track).y,
            armed = t.ttl <= 14.3;
          this.place(
            this.traps,
            t.x,
            y + 0.1,
            t.z,
            armed ? 1 : Math.max(0.4, (15 - t.ttl) / 0.7),
            armed ? 0xd67eff : 0x7f7393,
            0,
            -Math.PI / 2,
          );
          this.rings.add(
            t.x,
            y + 0.065,
            t.z,
            1.6,
            armed ? 0xd981ff : 0x978ea0,
            armed ? 0.48 : 0.28,
            !armed,
          );
        }
      const missileIds = new Set(w.missiles.map((m) => m.visualId));
      for (const id of this.missileRoutes.keys())
        if (!missileIds.has(id)) this.missileRoutes.delete(id);
      for (const m of w.missiles)
        if (nearby(m.x, m.z)) {
          const target = cars.find((c) => c.id === m.target);
          if (!target) continue;
          const owner = source.find((c) => c.id === m.owner),
            old =
              m.visualId === undefined
                ? undefined
                : this.missileRoutes.get(m.visualId);
          const branch = old?.branch ?? owner?.routeBranch ?? "main";
          let surface = continuousTrack(
            m.x,
            m.z,
            old?.t ?? owner?.lastT ?? nearestTrack(m.x, m.z, this.track).t,
            this.track,
            branch,
          );
          // Rejoined/first-seen missiles can already be far from their launcher.
          if (surface.distance > 12)
            surface = continuousTrack(
              m.x,
              m.z,
              nearestTrack(m.x, m.z, this.track).t,
              this.track,
            );
          if (m.visualId !== undefined)
            this.missileRoutes.set(m.visualId, { t: surface.t, branch });
          const heading = Math.atan2(target.x - m.x, target.z - m.z),
            y = surface.y + 1.25;
          this.place(
            this.missiles,
            m.x,
            y,
            m.z,
            1,
            0xffcc81,
            heading,
            Math.PI / 2,
          );
          if (motion)
            for (let n = 0; n < rate; n++)
              this.particles.pool.emit(
                m.x - Math.sin(heading) * 0.7,
                y,
                m.z - Math.cos(heading) * 0.7,
                -Math.sin(heading) * 3,
                0,
                -Math.cos(heading) * 3,
                0.16,
                0.1,
                0xffa960,
              );
        }
    }
    this.rings.end();
    // The shared auxiliary budget includes shields and the course marker reserve.
    this.rings.mesh.count = Math.min(
      this.rings.mesh.count,
      Math.max(
        0,
        budget.rings -
          (low ? 8 : 12) -
          this.shells.count -
          budget.environmentInstances,
      ),
    );
    this.rings.mesh.visible = this.rings.mesh.count > 0;
    this.particles.upload(this.pixelHeight);
    this.shells.material.uniforms.clock.value = motion ? this.elapsed : 0;
    for (const key of ["phase", "strength"])
      this.shells.geometry.getAttribute(key).needsUpdate = true;
    for (const mesh of [this.boxes, this.traps, this.missiles, this.shells]) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  reset() {
    this.particles.clear();
    this.rings.clear();
    this.pulses.clear();
    this.itemEvents.reset();
    this.collisionEvents.reset();
    this.previous.clear();
    this.boxReady.clear();
    this.propellant.clear();
    this.missileRoutes.clear();
    this.clock.clear();
    this.elapsed = 0;
    this.impactUntil = 0;
    this.blockWaves.clear();
    for (const mesh of [this.boxes, this.traps, this.missiles, this.shells]) {
      mesh.count = 0;
      mesh.visible = false;
    }
    this.shieldCount = this.protectionCount = 0;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.group.removeFromParent();
    this.particles.dispose();
    this.rings.dispose();
    for (const mesh of [this.boxes, this.traps, this.missiles, this.shells]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
  }
}
