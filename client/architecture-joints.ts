import * as THREE from "three";
import { createChamferedBoxGeometry } from "./scene-prop-geometry.ts";

export interface PortalOptions {
  span: number;
  grounds: readonly [number, number];
  supports: readonly [boolean, boolean];
}

/** Scene-local kit. The containing World owns every returned mesh resource. */
export class ArchitectureJoints {
  private readonly block = new THREE.BoxGeometry();
  private readonly chamfer = createChamferedBoxGeometry([0.055, 0.055, 0.055]);
  private readonly round = new THREE.CylinderGeometry(1, 1, 1, 10);
  readonly steel: THREE.MeshStandardMaterial;
  readonly dark: THREE.MeshStandardMaterial;
  readonly stone: THREE.MeshStandardMaterial;
  constructor(
    materials: Partial<
      Record<"steel" | "dark" | "stone", THREE.MeshStandardMaterial>
    > = {},
  ) {
    this.steel =
      materials.steel ??
      new THREE.MeshStandardMaterial({
        color: "#818d88",
        roughness: 0.58,
        metalness: 0.32,
      });
    this.dark =
      materials.dark ??
      new THREE.MeshStandardMaterial({
        color: "#343f3d",
        roughness: 0.68,
        metalness: 0.38,
      });
    this.stone =
      materials.stone ??
      new THREE.MeshStandardMaterial({ color: "#aea38b", roughness: 0.94 });
  }
  private piece(
    parent: THREE.Object3D,
    name: string,
    p: readonly number[],
    s: readonly number[],
    material: THREE.Material,
    geometry: THREE.BufferGeometry = this.block,
  ) {
    const m = new THREE.Mesh(geometry, material);
    m.name = name;
    m.position.set(p[0], p[1], p[2]);
    m.scale.set(s[0], s[1], s[2]);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  private bolt(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    vertical = true,
  ) {
    const m = this.piece(
      parent,
      "anchor-bolt",
      [x, y, z],
      [0.07, 0.1, 0.07],
      this.dark,
      this.round,
    );
    if (!vertical) m.rotation.x = Math.PI / 2;
  }
  portal({ span, grounds, supports }: PortalOptions): THREE.Group {
    if (
      ![span, ...grounds].every(Number.isFinite) ||
      span < 3 ||
      grounds.some((v) => v > 7.4)
    )
      throw new Error("Invalid portal dimensions");
    const root = new THREE.Group();
    root.name = "supported-steel-portal";
    // A partial frame cannot carry an overhead rack. Its caller retains the
    // original named route anchor but skips this independent unsupported frame.
    if (!supports.every(Boolean)) return root;
    for (const side of [-1, 1]) {
      const x = side * span,
        ground = grounds[side < 0 ? 0 : 1];
      this.piece(
        root,
        `footing:${side}`,
        [x, ground + 0.26, 0],
        [1.55, 0.52, 1.55],
        this.stone,
        this.chamfer,
      );
      this.piece(
        root,
        "column-base-plate",
        [x, ground + 0.59, 0],
        [1.18, 0.14, 1.18],
        this.dark,
      );
      const bottom = ground + 0.64,
        top = 8.5;
      const column = new THREE.Group();
      column.name = `shaft:${side}`;
      root.add(column);
      this.piece(
        column,
        "column-web",
        [x, (bottom + top) / 2, 0],
        [0.16, top - bottom, 0.7],
        this.steel,
      );
      for (const z of [-0.39, 0.39])
        this.piece(
          column,
          "column-flange",
          [x, (bottom + top) / 2, z],
          [0.9, top - bottom, 0.13],
          this.steel,
        );
      for (const dx of [-0.46, 0.46])
        for (const dz of [-0.46, 0.46])
          this.bolt(root, x + dx, ground + 0.7, dz);
      this.piece(
        root,
        `bearing:${side}`,
        [x, 8.48, 0],
        [1.16, 0.16, 1.12],
        this.dark,
      );
      // External end plate, large bolts and a diagonal bearing brace are readable
      // from the road without filling the inner 6m vehicle clearance envelope.
      this.piece(
        root,
        "beam-end-plate",
        [x, 9.1, 0],
        [0.16, 1.3, 1.04],
        this.dark,
      );
      for (const dy of [-0.38, 0.38])
        for (const dz of [-0.3, 0.3]) {
          const b = this.piece(
            root,
            "beam-end-bolt",
            [x + side * 0.11, 9.1 + dy, dz],
            [0.075, 0.11, 0.075],
            this.dark,
            this.round,
          );
          b.rotation.z = Math.PI / 2;
        }
      const a = new THREE.Vector3(x, 7.28, 0),
        b = new THREE.Vector3(side * (span - 1.23), 8.49, 0),
        d = b.clone().sub(a);
      const brace = this.piece(
        root,
        "seated-knee-brace",
        a.clone().add(b).multiplyScalar(0.5).toArray(),
        [0.19, d.length(), 0.26],
        this.dark,
      );
      brace.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        d.normalize(),
      );
    }
    const length = span * 2 + 1.35;
    this.piece(
      root,
      "header-web",
      [0, 9.1, 0],
      [length, 0.98, 0.16],
      this.steel,
    );
    for (const y of [8.55, 9.65])
      this.piece(
        root,
        "header-flange",
        [0, y, 0],
        [length, 0.14, 1.08],
        this.steel,
      );
    for (const z of [-0.32, 0.32]) {
      const pipe = this.piece(
        root,
        "supported-process-pipe",
        [0, 10.12, z],
        [0.22, length, 0.22],
        this.steel,
        this.round,
      );
      pipe.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        this.piece(
          root,
          "pipe-saddle",
          [side * span, 9.9, z],
          [0.36, 0.37, 0.5],
          this.dark,
          this.chamfer,
        );
        const flange = this.piece(
          root,
          "pipe-flange",
          [side * (span - 0.9), 10.12, z],
          [0.3, 0.1, 0.3],
          this.dark,
          this.round,
        );
        flange.rotation.z = Math.PI / 2;
      }
    }
    root.userData.junction = {
      span,
      grounds: [...grounds],
      clearHeight: 7.18,
      footprintHalfWidth: 0.775,
      version: 1,
    };
    return root;
  }

  /** Connect two actual frame centers in local space; no free-floating pipe ends. */
  link(parent: THREE.Group, a: THREE.Vector3, b: THREE.Vector3) {
    const delta = b.clone().sub(a);
    if (delta.lengthSq() < 0.0001) return;
    const beam = this.piece(
      parent,
      "portal-longitudinal-tie",
      a.clone().add(b).multiplyScalar(0.5).toArray(),
      [0.2, delta.length(), 0.24],
      this.dark,
    );
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
  }
}
