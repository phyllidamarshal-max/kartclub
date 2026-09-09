import * as THREE from "three";
import { getLevel } from "../../shared/levels.ts";
import { trackPoint, trackWidth, type Track } from "../../shared/track.ts";
import { RingLayer } from "./ring-layer.ts";

export interface CourseTarget {
  t: number;
  complete: boolean;
  kind: "gate" | "corner" | "practice";
}
export interface CourseFrame {
  active: boolean;
  paused: boolean;
  motion: number;
  quality: string;
  targets: readonly CourseTarget[];
  failed: boolean;
}
export function courseMarkers(
  track: Track,
  targets: readonly CourseTarget[],
  failed: boolean,
) {
  const markers: Array<{
    t: number;
    kind: CourseTarget["kind"] | "shortcut";
    state: "waiting" | "complete" | "failed";
  }> = targets.map((t) => ({
    t: t.t,
    kind: t.kind,
    state: failed ? "failed" : t.complete ? "complete" : "waiting",
  }));
  if (track.shortcut.length > 1)
    markers.push({
      t: track.shortcut[0].t,
      kind: "shortcut",
      state: "waiting",
    });
  return markers;
}
function surface(track: Track) {
  const positions: number[] = [],
    paths: number[] = [],
    kinds: number[] = [];
  const zones = getLevel(track.id).zones.filter((z) => z.kind !== "sand");
  for (const zone of zones) {
    const count = Math.max(
      2,
      Math.ceil(((zone.end - zone.start) * track.length) / 2),
    );
    for (let i = 0; i < count; i++)
      for (const [j, side] of [
        [i, 0],
        [i + 1, 0],
        [i, 1],
        [i + 1, 0],
        [i + 1, 1],
        [i, 1],
      ]) {
        const t = zone.start + ((zone.end - zone.start) * j) / count,
          p = trackPoint(t, track),
          half = trackWidth(t, track) / 2 - 0.18;
        const lateral = Math.max(
          -half,
          Math.min(half, zone.lateral + (side ? 1 : -1) * zone.halfWidth),
        );
        positions.push(
          p.x + Math.cos(p.heading) * lateral,
          p.y + 0.125,
          p.z - Math.sin(p.heading) * lateral,
        );
        paths.push(t * track.length, side);
        kinds.push(zone.kind === "ice" ? 1 : 0);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("path", new THREE.Float32BufferAttribute(paths, 2));
  geometry.setAttribute("kind", new THREE.Float32BufferAttribute(kinds, 1));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: { clock: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: `attribute vec2 path;attribute float kind;varying vec2 route;varying float icy;void main(){route=path;icy=kind;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float clock;varying vec2 route;varying float icy;
      void main(){float lane=abs(route.y-.5);float phase=fract((route.x-clock*5.)/4.);float arrow=1.-smoothstep(.035,.095,abs(phase-lane*.8-.2));float edge=smoothstep(.47,.5,lane);float mask=mix(arrow*(1.-smoothstep(.43,.5,lane))*.28,edge*.28,icy);
        gl_FragColor=vec4(mix(vec3(.25,1.,.72),vec3(.65,.9,1.),icy),mask);
        #include <colorspace_fragment>
      }`,
    }),
  );
  mesh.userData.dynamic = true;
  mesh.renderOrder = 1;
  return { mesh, count: zones.length };
}

export class CourseVfx {
  readonly group = new THREE.Group();
  readonly zoneCount: number;
  private flow: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private rings = new RingLayer(12);
  private posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    }),
    16,
  );
  private scratch = new THREE.Object3D();
  private color = new THREE.Color();
  private disposed = false;
  private elapsed = 0;
  private completed = new Map<string, { state: string; flash: number }>();
  constructor(
    scene: THREE.Scene,
    private track: Track,
  ) {
    const s = surface(track);
    this.flow = s.mesh;
    this.zoneCount = s.count;
    this.group.name = "course-vfx";
    this.group.userData.dynamic = true;
    this.posts.frustumCulled = false;
    this.posts.count = 0;
    this.posts.setColorAt(0, this.color.setHex(0xffffff));
    this.group.add(this.flow, this.rings.mesh, this.posts);
    scene.add(this.group);
  }
  get time() {
    return this.elapsed;
  }
  update(frame: CourseFrame, dt: number) {
    if (this.disposed || frame.paused) return;
    if (!frame.active || dt > 0.25 || !Number.isFinite(dt) || dt < 0) {
      this.reset();
      return;
    }
    this.group.visible = true;
    this.elapsed += dt;
    this.flow.visible = this.zoneCount > 0;
    this.flow.material.uniforms.clock.value =
      frame.motion > 0 ? this.elapsed : 0;
    this.rings.begin(frame.quality === "low" ? 8 : 12);
    this.posts.count = 0;
    for (const marker of courseMarkers(
      this.track,
      frame.targets,
      frame.failed,
    ).slice(0, 4)) {
      const key = marker.kind + marker.t,
        old = this.completed.get(key),
        flash =
          old &&
          old.state !== marker.state &&
          marker.state === "complete" &&
          frame.motion > 0
            ? 0.45
            : Math.max(0, (old?.flash ?? 0) - dt);
      this.completed.set(key, { state: marker.state, flash });
      const p = trackPoint(marker.t, this.track),
        half = trackWidth(marker.t, this.track) / 2 + 0.35;
      const color =
        marker.state === "failed"
          ? 0x8c7272
          : marker.state === "complete"
            ? 0x78d9af
            : marker.kind === "shortcut"
              ? 0xafd4a1
              : marker.kind === "gate"
                ? 0xffde8c
                : 0x8cdeff;
      for (const side of [-1, 1]) {
        const x = p.x + Math.cos(p.heading) * half * side,
          z = p.z - Math.sin(p.heading) * half * side;
        this.rings.add(
          x,
          p.y + 0.08,
          z,
          0.42 + flash,
          color,
          0.48,
          marker.kind === "corner",
        );
        this.scratch.position.set(
          x,
          p.y + (marker.kind === "gate" ? 1.25 : 0.55),
          z,
        );
        this.scratch.rotation.set(0, p.heading, 0);
        this.scratch.scale.set(0.1, marker.kind === "gate" ? 2.5 : 1.1, 0.1);
        this.scratch.updateMatrix();
        this.posts.setMatrixAt(this.posts.count, this.scratch.matrix);
        this.posts.setColorAt(this.posts.count++, this.color.setHex(color));
      }
      if (marker.kind === "gate" || marker.kind === "practice") {
        this.scratch.position.set(p.x, p.y + 0.1, p.z);
        this.scratch.rotation.set(0, p.heading, 0);
        this.scratch.scale.set(half * 2, 0.018, 0.07);
        this.scratch.updateMatrix();
        this.posts.setMatrixAt(this.posts.count, this.scratch.matrix);
        this.posts.setColorAt(this.posts.count++, this.color.setHex(color));
      }
    }
    this.rings.end();
    this.posts.visible = this.posts.count > 0;
    this.posts.instanceMatrix.needsUpdate = true;
    if (this.posts.instanceColor) this.posts.instanceColor.needsUpdate = true;
  }
  reset() {
    this.group.visible = false;
    this.elapsed = 0;
    this.completed.clear();
    this.rings.clear();
    this.posts.count = 0;
    this.posts.visible = false;
    this.flow.material.uniforms.clock.value = 0;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.rings.dispose();
    this.flow.geometry.dispose();
    this.flow.material.dispose();
    this.posts.geometry.dispose();
    this.posts.material.dispose();
    this.posts.dispose();
  }
}
