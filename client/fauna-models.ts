import * as THREE from "three";

/** Editable, texture-free scene assets. All geometry and PBR materials belong to
 * one library, shared by its actors, and are released exactly once. +Z is front. */
export interface FaunaModel {
  root: THREE.Group;
  tail?: THREE.Group;
  wings?: THREE.Group[];
  legs?: CamelLeg[];
}
export interface CamelLeg {
  hip: THREE.Vector3;
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  knee: THREE.Mesh;
  foot: THREE.Group;
  phase: number;
}

type Section = [x: number, y: number, z: number, width: number, depth: number];
/** Continuous swept elliptical surface, rather than a stack of primitives. */
function sweep(
  sections: Section[],
  lengthSegments: number,
  sides: number,
  underside = false,
) {
  const curve = new THREE.CatmullRomCurve3(
    sections.map((s) => new THREE.Vector3(s[0], s[1], s[2])),
    false,
    "catmullrom",
    0.35,
  );
  const positions: number[] = [],
    indices: number[] = [],
    bellyIndices: number[] = [],
    uvs: number[] = [];
  const tangent = new THREE.Vector3(),
    across = new THREE.Vector3(),
    up = new THREE.Vector3();
  const geometry = new THREE.BufferGeometry();
  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments,
      p = curve.getPoint(t),
      f = t * (sections.length - 1),
      a = Math.min(sections.length - 2, Math.floor(f)),
      k = f - a;
    const w = THREE.MathUtils.lerp(sections[a][3], sections[a + 1][3], k);
    const h = THREE.MathUtils.lerp(sections[a][4], sections[a + 1][4], k);
    curve.getTangent(t, tangent);
    // This constant reference is safe for authored paths, none run along X.
    across.set(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
    up.crossVectors(tangent, across).normalize();
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      positions.push(
        p.x + across.x * w * Math.cos(angle) + up.x * h * Math.sin(angle),
        p.y + across.y * w * Math.cos(angle) + up.y * h * Math.sin(angle),
        p.z + across.z * w * Math.cos(angle) + up.z * h * Math.sin(angle),
      );
      uvs.push(j / sides, t);
    }
  }
  for (let i = 0; i < lengthSegments; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j,
        b = a + sides + 1;
      const list =
        underside && j >= sides / 2 && j < sides - 1 ? bellyIndices : indices;
      list.push(a, a + 1, b, b, a + 1, b + 1);
    }
  if (underside) {
    geometry.addGroup(0, indices.length, 0);
    geometry.addGroup(indices.length, bellyIndices.length, 1);
    indices.push(...bellyIndices);
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Rounded, tapered foil: span along X, elliptical chords on the YZ plane. */
function foil(
  span: number,
  chord: number,
  sweepBack: number,
  segments = 12,
  sides = 12,
) {
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments,
      width =
        chord *
        (0.17 + 0.83 * Math.sin(Math.PI * (0.1 + 0.9 * f))) *
        (1 - f * 0.8);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      positions.push(
        span * f,
        Math.sin(a) * width * 0.105,
        Math.cos(a) * width - sweepBack * f * f,
      );
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j,
        b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export class FaunaModelLibrary {
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private disposed = false;
  /** Bake only immutable direct children. Articulated groups and explicitly
   * animated limb meshes retain their identity and their pivot hierarchy. */
  private batchStatic(parent: THREE.Group, key: string) {
    const byMaterial = new Map<
      THREE.Material,
      { mesh: THREE.Mesh; start: number; count: number }[]
    >();
    const originals: THREE.Mesh[] = [];
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child.userData.ambientAnimated)
        continue;
      originals.push(child);
      child.updateMatrix();
      const groups = Array.isArray(child.material)
        ? child.geometry.groups
        : [
            {
              start: 0,
              count:
                child.geometry.index?.count ??
                child.geometry.attributes.position.count,
              materialIndex: 0,
            },
          ];
      for (const group of groups) {
        const material = Array.isArray(child.material)
          ? child.material[group.materialIndex ?? 0]
          : child.material;
        const list = byMaterial.get(material) ?? [];
        list.push({ mesh: child, start: group.start, count: group.count });
        byMaterial.set(material, list);
      }
    }
    let index = 0;
    for (const [material, parts] of byMaterial) {
      const geometry = this.geometry(`${key}-batch-${index++}`, () => {
        const positions: number[] = [],
          normals: number[] = [];
        const p = new THREE.Vector3(),
          n = new THREE.Vector3(),
          normalMatrix = new THREE.Matrix3();
        for (const part of parts) {
          const { mesh, start, count } = part,
            g = mesh.geometry;
          normalMatrix.getNormalMatrix(mesh.matrix);
          const reflected = mesh.matrix.determinant() < 0;
          for (let i = start; i < start + count; i += 3)
            for (const offset of reflected ? [0, 2, 1] : [0, 1, 2]) {
              const v = g.index ? g.index.getX(i + offset) : i + offset;
              p.fromBufferAttribute(g.attributes.position, v).applyMatrix4(
                mesh.matrix,
              );
              n.fromBufferAttribute(g.attributes.normal, v).applyNormalMatrix(
                normalMatrix,
              );
              positions.push(p.x, p.y, p.z);
              normals.push(n.x, n.y, n.z);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        return g;
      });
      this.mesh(parent, `${key}-static-material-${index}`, geometry, material);
    }
    for (const mesh of originals) parent.remove(mesh);
  }
  private material(key: string, color: string, roughness = 0.8) {
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      this.materials.set(key, m);
    }
    return m;
  }
  private geometry(key: string, create: () => THREE.BufferGeometry) {
    let g = this.geometries.get(key);
    if (!g) {
      g = create();
      this.geometries.set(key, g);
    }
    return g;
  }
  private mesh(
    parent: THREE.Object3D,
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = new THREE.Mesh(geometry, material);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  private ellipsoid(
    parent: THREE.Object3D,
    name: string,
    material: THREE.Material,
    position: number[],
    scale: number[],
    segments = 12,
  ) {
    const m = this.mesh(
      parent,
      name,
      this.geometry(
        `ellipsoid-${segments}`,
        () => new THREE.SphereGeometry(1, segments, 8),
      ),
      material,
      ...(position as [number, number, number]),
    );
    m.scale.set(...(scale as [number, number, number]));
    return m;
  }

  whale(): FaunaModel {
    const root = new THREE.Group();
    root.name = "ambient-whale";
    const blue = this.material("skin", "#326b80", 0.49),
      cream = this.material("belly", "#d0ddd7", 0.65),
      ink = this.material("ink", "#192f38", 0.6),
      accent = this.material("accent", "#61939d", 0.5);
    const body = this.geometry("whale-body", () =>
      sweep(
        [
          [0, 0, -3.5, 0.3, 0.32],
          [0, 0, -2.7, 0.64, 0.56],
          [0, 0, -1.1, 1.3, 0.97],
          [0, 0.03, 0.6, 1.48, 1.16],
          [0, 0.02, 2.5, 1.32, 0.91],
          [0, -0.04, 3.7, 0.77, 0.51],
          [0, -0.08, 4.05, 0.015, 0.015],
        ],
        30,
        32,
        true,
      ),
    );
    this.mesh(root, "whale-tapered-body", body, [blue, cream]);
    const tail = new THREE.Group();
    tail.name = "whale-tail-pivot";
    tail.position.set(0, 0, -3.1);
    root.add(tail);
    this.mesh(
      tail,
      "whale-tail-stock",
      this.geometry("whale-stock", () =>
        sweep(
          [
            [0, 0, -2.5, 0.09, 0.035],
            [0, 0, -1.85, 0.36, 0.13],
            [0, 0, -0.7, 0.44, 0.25],
            [0, 0, 0.2, 0.32, 0.3],
          ],
          10,
          20,
        ),
      ),
      blue,
    );
    const fin = this.geometry("whale-fluke", () => foil(2.75, 0.86, 0.33));
    for (const side of [-1, 1]) {
      const fluke = this.mesh(
        tail,
        "whale-horizontal-fluke",
        fin,
        blue,
        0,
        0,
        -2,
      );
      fluke.scale.x = side;
      fluke.rotation.z = side * 0.08;
      const flipper = this.mesh(
        root,
        "whale-pectoral-flipper",
        this.geometry("whale-flipper", () => foil(2.35, 0.63, 1.1)),
        blue,
        side * 1.07,
        -0.43,
        0.72,
      );
      flipper.scale.x = side;
      flipper.rotation.z = -side * 0.27;
      this.ellipsoid(
        root,
        "whale-eye",
        ink,
        [side * 1.26, 0.15, 2.05],
        [0.1, 0.1, 0.12],
      );
      this.ellipsoid(
        root,
        "whale-eye-glint",
        cream,
        [side * 1.33, 0.19, 2.1],
        [0.025, 0.028, 0.025],
        8,
      );
    }
    const dorsal = this.mesh(
      root,
      "whale-small-dorsal",
      this.geometry("whale-dorsal", () => foil(0.77, 0.58, 0.4, 8, 8)),
      blue,
      0,
      0.79,
      -1.25,
    );
    dorsal.rotation.z = Math.PI / 2;
    this.ellipsoid(
      root,
      "whale-blowhole",
      ink,
      [0, 1.075, 1.3],
      [0.17, 0.018, 0.27],
    );
    // Three subtle throat pleats are geometry, with no texture or shader dependency.
    for (const x of [-0.35, 0, 0.35])
      this.mesh(
        root,
        "whale-throat-pleat",
        this.geometry("whale-pleat", () =>
          sweep(
            [
              [0, 0, -0.6, 0.022, 0.022],
              [0, -0.12, 0, 0.025, 0.025],
              [0, 0, 0.9, 0.016, 0.016],
            ],
            8,
            6,
          ),
        ),
        accent,
        x,
        -1.02,
        0.95,
      );
    root.userData.asset = "editable-ts/whale";
    this.batchStatic(root, "whale-body");
    this.batchStatic(tail, "whale-tail");
    return { root, tail };
  }

  camel(): FaunaModel {
    const root = new THREE.Group();
    root.name = "ambient-camel";
    const coat = this.material("coat", "#bd8652"),
      sand = this.material("sand", "#d7ac71"),
      dark = this.material("dark", "#573d2a"),
      ink = this.material("ink", "#22292b");
    const sections: Section[] = [];
    for (let i = 0; i <= 24; i++) {
      const f = i / 24,
        z = -1.35 + 2.7 * f,
        envelope = Math.pow(Math.sin(Math.PI * f), 0.5);
      const hump =
        0.82 * Math.exp(-Math.pow((z + 0.61) / 0.33, 2)) +
        0.91 * Math.exp(-Math.pow((z - 0.45) / 0.32, 2));
      sections.push([
        0,
        2.05 + hump * 0.5,
        z,
        Math.max(0.01, 0.65 * envelope),
        Math.max(0.01, 0.55 * envelope + hump * 0.5),
      ]);
    }
    this.mesh(
      root,
      "camel-continuous-two-hump-body",
      this.geometry("camel-body", () => sweep(sections, 32, 28)),
      coat,
    );
    this.mesh(
      root,
      "camel-curved-neck",
      this.geometry("camel-neck", () =>
        sweep(
          [
            [0, 2.02, 0.72, 0.42, 0.42],
            [0, 2.2, 1.25, 0.32, 0.38],
            [0, 2.65, 1.51, 0.24, 0.3],
            [0, 3.19, 1.4, 0.21, 0.25],
            [0, 3.56, 1.53, 0.25, 0.25],
            [0, 3.62, 1.75, 0.21, 0.17],
          ],
          22,
          16,
        ),
      ),
      sand,
    );
    this.mesh(
      root,
      "camel-small-head",
      this.geometry("camel-head", () =>
        sweep(
          [
            [0, 3.63, 1.37, 0.025, 0.035],
            [0, 3.64, 1.58, 0.24, 0.26],
            [0, 3.57, 1.9, 0.23, 0.22],
            [0, 3.5, 2.23, 0.2, 0.15],
            [0, 3.5, 2.39, 0.025, 0.025],
          ],
          12,
          14,
        ),
      ),
      sand,
    );
    this.ellipsoid(
      root,
      "camel-soft-muzzle",
      coat,
      [0, 3.49, 2.2],
      [0.215, 0.13, 0.23],
    );
    for (const side of [-1, 1]) {
      const ear = this.ellipsoid(
        root,
        "camel-ear",
        coat,
        [side * 0.3, 3.79, 1.52],
        [0.12, 0.25, 0.1],
      );
      ear.rotation.z = -side * 0.5;
      this.ellipsoid(
        root,
        "camel-eye",
        ink,
        [side * 0.225, 3.69, 1.79],
        [0.044, 0.058, 0.07],
        8,
      );
      this.ellipsoid(
        root,
        "camel-nostril",
        dark,
        [side * 0.18, 3.54, 2.25],
        [0.025, 0.037, 0.045],
        8,
      );
    }
    const tail = new THREE.Group();
    tail.name = "camel-tail-pivot";
    tail.position.set(0, 2.1, -1.14);
    root.add(tail);
    this.mesh(
      tail,
      "camel-tail",
      this.geometry("camel-tail", () =>
        sweep(
          [
            [0, 0, 0, 0.075, 0.075],
            [0, -0.37, -0.22, 0.065, 0.065],
            [0, -0.8, -0.2, 0.05, 0.05],
          ],
          10,
          8,
        ),
      ),
      coat,
    );
    this.ellipsoid(
      tail,
      "camel-tail-tuft",
      dark,
      [0, -0.86, -0.2],
      [0.09, 0.18, 0.08],
      8,
    );
    const limb = this.geometry(
      "camel-limb",
      () => new THREE.CylinderGeometry(0.1, 0.075, 1, 10, 2),
    );
    const kneeGeo = this.geometry(
      "camel-knee",
      () => new THREE.SphereGeometry(1, 10, 6),
    );
    const legs: CamelLeg[] = [];
    for (const side of [-1, 1])
      for (const front of [-1, 1]) {
        // Ray-tested body underside at these XZ attachments is around Y=1.97.
        // Keep the joint buried inside the torso, rather than suspending it below.
        const hip = new THREE.Vector3(side * 0.45, 2.15, front * 0.81);
        const upper = this.mesh(root, "camel-upper-leg", limb, coat);
        const lower = this.mesh(root, "camel-lower-leg", limb, sand);
        const knee = this.mesh(root, "camel-knee", kneeGeo, coat);
        knee.scale.set(0.125, 0.15, 0.13);
        const foot = new THREE.Group();
        foot.name = "camel-foot-contact";
        root.add(foot);
        this.ellipsoid(
          foot,
          "camel-padded-foot",
          dark,
          [0, 0.09, 0.035],
          [0.155, 0.09, 0.225],
          10,
        );
        for (const animated of [upper, lower, knee])
          animated.userData.ambientAnimated = true;
        legs.push({
          hip,
          upper,
          lower,
          knee,
          foot,
          phase: side * front > 0 ? 0 : 0.5,
        });
      }
    root.userData.asset = "editable-ts/camel";
    this.batchStatic(root, "camel-body");
    this.batchStatic(tail, "camel-tail");
    return { root, tail, legs };
  }

  bird(): FaunaModel {
    const root = new THREE.Group();
    root.name = "ambient-bird";
    const teal = this.material("plumage", "#365a58"),
      cream = this.material("belly", "#d4c8a7"),
      gold = this.material("beak", "#c59049"),
      ink = this.material("ink", "#222b29");
    this.mesh(
      root,
      "bird-tapered-body",
      this.geometry("bird-body", () =>
        sweep(
          [
            [0, 0, -0.48, 0.015, 0.025],
            [0, 0.04, -0.2, 0.16, 0.17],
            [0, 0.08, 0.11, 0.17, 0.19],
            [0, 0.13, 0.34, 0.105, 0.12],
            [0, 0.12, 0.43, 0.005, 0.008],
          ],
          12,
          12,
          true,
        ),
      ),
      [teal, cream],
    );
    const wings: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.name = "bird-wing-pivot";
      wing.position.set(side * 0.1, 0.1, 0);
      root.add(wing);
      const m = this.mesh(
        wing,
        "bird-tapered-wing",
        this.geometry("bird-wing", () => foil(0.77, 0.24, 0.28, 8, 8)),
        teal,
      );
      m.scale.x = side;
      wings.push(wing);
      this.ellipsoid(
        root,
        "bird-eye",
        ink,
        [side * 0.091, 0.2, 0.32],
        [0.024, 0.024, 0.028],
        8,
      );
    }
    const beak = this.mesh(
      root,
      "bird-beak",
      this.geometry("bird-beak", () => new THREE.ConeGeometry(0.055, 0.18, 5)),
      gold,
      0,
      0.12,
      0.47,
    );
    beak.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const tail = this.mesh(
        root,
        "bird-tail-feather",
        this.geometry("bird-tail", () => foil(0.35, 0.11, 0.02, 5, 6)),
        teal,
        side * 0.055,
        0,
        -0.34,
      );
      tail.rotation.y = side * (Math.PI / 2 + 0.15);
      this.ellipsoid(
        root,
        "bird-resting-foot",
        gold,
        [side * 0.07, -0.175, 0.04],
        [0.022, 0.025, 0.085],
        8,
      );
    }
    root.userData.asset = "editable-ts/bird";
    this.batchStatic(root, "bird-body");
    return { root, wings };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}
