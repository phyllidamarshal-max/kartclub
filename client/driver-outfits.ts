import * as THREE from "three";
import {
  type DriverOutfitId,
  type DriverColorId,
  getDriverColor,
} from "../shared/drivers.ts";
import { createKartModel } from "./kart-model.ts";

function meshList(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((n) => {
    if (n instanceof THREE.Mesh) meshes.push(n);
  });
  return meshes;
}
const materialList = (m: THREE.Mesh): THREE.Material[] =>
  Array.isArray(m.material) ? m.material : [m.material];

/** Extract the current authored pose; release only resources the discarded kart owns. */
function baseDriver() {
  const kart = createKartModel("#aec83e"),
    driver = kart.getObjectByName("driver") as THREE.Group;
  driver.removeFromParent();
  const keepGeometry = new Set(meshList(driver).map((m) => m.geometry)),
    keepMaterial = new Set(meshList(driver).flatMap(materialList));
  new Set(meshList(kart).map((m) => m.geometry)).forEach((g) => {
    if (!keepGeometry.has(g)) g.dispose();
  });
  new Set(meshList(kart).flatMap(materialList)).forEach((m) => {
    if (!keepMaterial.has(m)) m.dispose();
  });
  keepMaterial.forEach((m) => {
    delete m.userData.kartTint;
    if (m.name !== "kart-visor") m.name = `driver-style-base-${m.name}`;
  });
  const helmet = driver.getObjectByName("helmet") as THREE.Mesh;
  helmet.material = materialList(helmet)[0];
  helmet.material.name = "driver-style-helmet";
  helmet.material.userData.driverColorRole = "primary";
  return driver;
}

function cloth(name: string, color: string, role?: string) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.91,
    metalness: 0,
  });
  m.name = `driver-style-${name}`;
  if (role) m.userData.driverColorRole = role;
  return m;
}
function add(
  parent: THREE.Object3D,
  name: string,
  g: THREE.BufferGeometry,
  m: THREE.Material,
) {
  // Shared attribute layouts allow the renderer to merge each material into one draw.
  if (
    (m as THREE.MeshStandardMaterial).vertexColors &&
    !g.hasAttribute("color")
  )
    g.setAttribute(
      "color",
      new THREE.Uint8BufferAttribute(
        new Uint8Array(g.getAttribute("position").count * 3).fill(255),
        3,
        true,
      ),
    );
  const n = g.getAttribute("normal");
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(n, i);
    if (v.lengthSq() < 1e-10) v.set(0, 1, 0);
    else v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  const mesh = new THREE.Mesh(g, m);
  mesh.name = `outfit-${name}`;
  mesh.userData.outfitDetail = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Clip the actual surface at each sewing boundary before lifting the panel.
 * Whole-triangle centroid selection creates visible sawtooth edges on bent sleeves.
 */
function panel(
  source: THREE.Mesh,
  name: string,
  m: THREE.Material,
  planes: ((p: THREE.Vector3) => number)[],
  lift = 0.008,
) {
  const g = source.geometry,
    p = g.getAttribute("position"),
    n = g.getAttribute("normal"),
    ix = g.index,
    points: number[] = [],
    normals: number[] = [];
  for (let t = 0; t < (ix?.count ?? p.count); t += 3) {
    const ids = [0, 1, 2].map((k) => (ix ? ix.getX(t + k) : t + k));
    let polygon = ids.map((i) => ({
      point: new THREE.Vector3().fromBufferAttribute(p, i),
      normal: new THREE.Vector3().fromBufferAttribute(n, i),
    }));
    for (const plane of planes) {
      const clipped: typeof polygon = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length],
          da = plane(a.point),
          db = plane(b.point);
        if (da >= 0) clipped.push(a);
        if (da >= 0 !== db >= 0) {
          const f = da / (da - db);
          clipped.push({
            point: a.point.clone().lerp(b.point, f),
            normal: a.normal.clone().lerp(b.normal, f),
          });
        }
      }
      polygon = clipped;
      if (polygon.length < 3) break;
    }
    for (let i = 1; i < polygon.length - 1; i++) {
      const triangle = [polygon[0], polygon[i], polygon[i + 1]];
      if (
        triangle[1].point
          .clone()
          .sub(triangle[0].point)
          .cross(triangle[2].point.clone().sub(triangle[0].point))
          .lengthSq() < 1e-14
      )
        continue;
      triangle.forEach((vertex) => {
        const normal = vertex.normal.clone().normalize(),
          v = vertex.point.clone().addScaledVector(normal, lift);
        points.push(...v.toArray());
        normals.push(...normal.toArray());
      });
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  const mesh = add(source, name, geometry, m);
  if (source.name === "helmet") mesh.userData.headAccessory = true;
  return mesh;
}

/** Complete cloth rings in the base sleeve's longitudinal/radial parameterization. */
function sleeveBand(
  source: THREE.Mesh,
  name: string,
  m: THREE.Material,
  start: number,
  end: number,
  lift: number,
) {
  const p = source.geometry.getAttribute("position"),
    n = source.geometry.getAttribute("normal"),
    points: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  const rings = [
    start,
    ...Array.from({ length: 25 }, (_, i) => i).filter(
      (i) => i > start && i < end,
    ),
    end,
  ];
  rings.forEach((ring, r) => {
    const low = Math.floor(ring),
      high = Math.min(24, Math.ceil(ring)),
      fraction = ring - low;
    for (let j = 0; j <= 12; j++) {
      const a = low * 13 + j,
        b = high * 13 + j,
        normal = new THREE.Vector3()
          .fromBufferAttribute(n, a)
          .lerp(new THREE.Vector3().fromBufferAttribute(n, b), fraction)
          .normalize(),
        point = new THREE.Vector3()
          .fromBufferAttribute(p, a)
          .lerp(new THREE.Vector3().fromBufferAttribute(p, b), fraction)
          .addScaledVector(normal, lift);
      points.push(...point.toArray());
      normals.push(...normal.toArray());
      if (r < rings.length - 1 && j < 12) {
        const k = r * 13 + j;
        indices.push(k, k + 13, k + 1, k + 1, k + 13, k + 14);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  // Match the source TubeGeometry winding (a reversed band would disappear on its outside).
  const a = new THREE.Vector3().fromArray(points, indices[0] * 3),
    b = new THREE.Vector3().fromArray(points, indices[1] * 3),
    c = new THREE.Vector3().fromArray(points, indices[2] * 3);
  if (
    b
      .sub(a)
      .cross(c.sub(a))
      .dot(new THREE.Vector3().fromArray(normals, indices[0] * 3)) < 0
  ) {
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    geometry.setIndex(indices);
  }
  return add(source, name, geometry, m);
}

/** Project every stitch onto the actual torso, so z remains correct as the chest curves. */
function chestLine(
  torso: THREE.Mesh,
  name: string,
  m: THREE.Material,
  points: [number, number][],
  radius = 0.008,
  lift = 0.01,
  face = 1,
) {
  const surface = new THREE.Mesh(torso.geometry, torso.material);
  surface.updateMatrixWorld();
  const curvePoints: THREE.Vector3[] = [];
  for (let segment = 0; segment < points.length - 1; segment++)
    for (let j = 0; j <= 8; j++) {
      const t = j / 8,
        x = THREE.MathUtils.lerp(points[segment][0], points[segment + 1][0], t),
        y = THREE.MathUtils.lerp(points[segment][1], points[segment + 1][1], t);
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, y, 2 * face),
        new THREE.Vector3(0, 0, -face),
      ).intersectObject(surface)[0];
      if (hit)
        curvePoints.push(hit.point.add(new THREE.Vector3(0, 0, lift * face)));
    }
  return add(
    torso,
    name,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(curvePoints),
      32,
      radius,
      6,
      false,
    ),
    m,
  );
}

function collar(
  driver: THREE.Group,
  name: string,
  m: THREE.Material,
  radius: number,
  tube: number,
  y: number,
  open = false,
) {
  const torso = driver.getObjectByName("driver-torso") as THREE.Mesh,
    surface = new THREE.Mesh(torso.geometry, torso.material);
  surface.updateMatrixWorld();
  const points: THREE.Vector3[] = [],
    thickness = Math.min(tube, 0.022);
  for (let i = 0; i <= 40; i++) {
    const a =
        (open ? 0.55 : 0) + (i / 40) * (open ? Math.PI * 2 - 1.1 : Math.PI * 2),
      direction = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const height =
      0.205 +
      (y - 1.75) * 1.2 +
      (radius - 0.27) * 0.3 +
      Math.max(0, -Math.cos(a)) * 0.015;
    const origin = direction.clone().multiplyScalar(2);
    origin.y = height;
    const hit = new THREE.Raycaster(
      origin,
      direction.clone().negate(),
    ).intersectObject(surface)[0];
    if (hit) points.push(hit.point.addScaledVector(direction, 0.006));
  }
  return add(
    torso,
    name,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      40,
      thickness,
      8,
      !open,
    ),
    m,
  );
}

export function createDriverOutfit(id: DriverOutfitId): THREE.Group {
  const driver = baseDriver();
  driver.userData.driverOutfit = id;
  if (id === "club") return driver;
  const oldMaterials = new Set(meshList(driver).flatMap(materialList));
  const primary = cloth(
      "fabric",
      "#aec83e",
      id === "aviator" ? "shade" : "primary",
    ),
    cream = cloth("ivory-knit", "#eee4cb"),
    dark = cloth("forest-trim", "#203c37"),
    accent = cloth("colored-trim", "#aec83e", "primary");
  const brass = cloth("brass", "#b99150");
  brass.metalness = 0.42;
  brass.roughness = 0.42;
  const torso = driver.getObjectByName("driver-torso") as THREE.Mesh,
    helmet = driver.getObjectByName("helmet") as THREE.Mesh;
  primary.vertexColors = true;
  for (const mesh of meshList(driver))
    if (
      mesh.name === "driver-torso" ||
      mesh.name === "driver-hips" ||
      mesh.name.startsWith("driver-leg")
    )
      mesh.material = primary;
  for (const side of ["left", "right"]) {
    const sleeve = driver.getObjectByName(
      `driver-sleeve-${side}`,
    ) as THREE.Mesh;
    sleeve.material = id === "varsity" ? cream : primary;
    // Extra fabric follows the original normals; hand and arm transforms stay exact.
    const inflation =
      id === "street"
        ? 0.012
        : id === "neko"
          ? 0.018
          : id === "rally"
            ? 0.005
            : 0;
    const p = sleeve.geometry.getAttribute("position"),
      n = sleeve.geometry.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const taper = THREE.MathUtils.clamp((0.49 - v.z) / 0.18, 0, 1);
      v.addScaledVector(
        new THREE.Vector3().fromBufferAttribute(n, i),
        inflation * taper,
      );
      p.setXYZ(i, v.x, v.y, v.z);
    }
    sleeve.geometry.computeVertexNormals();
    sleeveBand(
      sleeve,
      `${id}-${side}-cuff`,
      id === "varsity" ? dark : cream,
      20,
      22,
      0.01,
    );
    if (id === "circuit" || id === "rally")
      panel(
        sleeve,
        `${side}-shoulder-guard`,
        id === "circuit" ? cream : dark,
        [(p) => p.y - 1.5, (p) => 0.05 - p.z],
        id === "rally" ? 0.022 : 0.008,
      );
    if (id === "rally")
      panel(
        sleeve,
        `${side}-forearm-pad`,
        dark,
        [(p) => p.z - 0.18, (p) => 0.33 - p.z, (p) => p.y - 1.37],
        0.02,
      );
    if (id === "rally")
      panel(
        driver.getObjectByName(`driver-glove-${side}`) as THREE.Mesh,
        `${side}-glove-pad`,
        dark,
        [(p) => -0.025 - p.z, (p) => p.y - 0.035],
        0.008,
      );
    if (id === "varsity" || id === "street")
      sleeveBand(sleeve, `${side}-knit-cuff-stripe`, accent, 20.7, 21.3, 0.017);
    if (id === "neko")
      panel(
        sleeve,
        `${side}-soft-elbow`,
        cream,
        [
          (p) => p.z - 0.05,
          (p) => 0.18 - p.z,
          (p) => p.x * (side === "left" ? -1 : 1) - 0.7,
        ],
        0.006,
      );
  }
  // Lower bands lie on the oval jacket surface, including its back.
  panel(
    torso,
    `${id}-waist-band`,
    id === "circuit" ? cream : dark,
    [(p) => -0.19 - p.y, (p) => p.y + 0.3],
    0.012,
  );
  const back = (
    name: string,
    material: THREE.Material,
    points: [number, number][],
    radius = 0.008,
  ) => chestLine(torso, `rear-${name}`, material, points, radius, 0.01, -1);
  if (id === "circuit") {
    for (const side of [-1, 1])
      back(`racing-seam-${side}`, cream, [
        [side * 0.22, -0.15],
        [side * 0.28, 0.13],
        [side * 0.15, 0.26],
      ]);
    collar(driver, "racing-collar", dark, 0.26, 0.028, 1.75);
    for (const side of [-1, 1]) {
      chestLine(
        torso,
        `racing-side-piping-${side}`,
        cream,
        [
          [side * 0.26, -0.18],
          [side * 0.31, 0.12],
          [side * 0.19, 0.25],
        ],
        0.009,
      );
      panel(helmet, `paired-crown-stripe-${side}`, cream, [
        (p) => p.x - side * 0.2 + 0.035,
        (p) => side * 0.2 + 0.035 - p.x,
        (p) => p.y - 0.12,
      ]);
    }
    chestLine(
      torso,
      "racing-zip",
      dark,
      [
        [0, -0.2],
        [0, 0.28],
      ],
      0.009,
    );
  } else if (id === "street") {
    panel(
      torso,
      "rear-bomber-yoke",
      cream,
      [(p) => -0.18 - p.z, (p) => p.y - 0.13, (p) => 0.24 - p.y],
      0.008,
    );
    collar(driver, "bomber-rib-collar", dark, 0.27, 0.042, 1.76, true);
    collar(driver, "bomber-collar-edge", cream, 0.275, 0.012, 1.799, true);
    chestLine(
      torso,
      "diagonal-metal-zip",
      cream,
      [
        [-0.1, -0.21],
        [0.17, 0.24],
      ],
      0.01,
    );
    panel(
      driver.getObjectByName("driver-sleeve-left") as THREE.Mesh,
      "asymmetric-sleeve-panel",
      cream,
      [(p) => p.y - 1.49, (p) => 0.015 - p.z],
      0.016,
    );
    chestLine(
      torso,
      "bomber-pocket",
      dark,
      [
        [-0.28, -0.08],
        [-0.12, -0.02],
      ],
      0.013,
    );
  } else if (id === "varsity") {
    back(
      "varsity-chevron",
      cream,
      [
        [-0.27, 0.16],
        [0, 0.035],
        [0.27, 0.16],
      ],
      0.013,
    );
    collar(driver, "varsity-knit-collar", cream, 0.27, 0.035, 1.76, true);
    collar(driver, "varsity-neck-stripe", accent, 0.279, 0.009, 1.79, true);
    chestLine(
      torso,
      "varsity-placket",
      cream,
      [
        [0, -0.2],
        [0, 0.28],
      ],
      0.017,
    );
    chestLine(
      torso,
      "original-diamond-patch",
      cream,
      [
        [0.15, 0.03],
        [0.22, 0.11],
        [0.15, 0.19],
        [0.08, 0.11],
        [0.15, 0.03],
      ],
      0.014,
    );
    for (const side of [-1, 1])
      panel(helmet, `varsity-side-stripe-${side}`, cream, [
        (p) => p.x * side - 0.48,
        (p) => p.y - 0.1,
        (p) => 0.18 - p.y,
      ]);
  } else if (id === "aviator") {
    back(
      "flight-yoke",
      dark,
      [
        [-0.29, 0.15],
        [0, 0.09],
        [0.29, 0.15],
      ],
      0.01,
    );
    back(
      "flight-seam",
      dark,
      [
        [0, -0.15],
        [0, 0.09],
      ],
      0.007,
    );
    collar(driver, "shearling-collar", cream, 0.29, 0.048, 1.76, true);
    for (const side of [-1, 1]) {
      chestLine(
        torso,
        `flight-panel-${side}`,
        dark,
        [
          [side * 0.1, -0.16],
          [side * 0.29, -0.13],
          [side * 0.27, 0.12],
        ],
        0.009,
      );
      chestLine(
        torso,
        `brass-buckle-${side}`,
        brass,
        [
          [side * 0.12, 0.13],
          [side * 0.18, 0.13],
          [side * 0.18, 0.19],
          [side * 0.12, 0.19],
          [side * 0.12, 0.13],
        ],
        0.009,
      );
    }
    chestLine(
      torso,
      "scarf-left",
      accent,
      [
        [-0.12, 0.29],
        [-0.12, 0.13],
        [-0.19, 0.08],
      ],
      0.023,
      0.025,
    );
    chestLine(
      torso,
      "scarf-right",
      accent,
      [
        [0.09, 0.28],
        [0.12, 0.18],
        [0.15, 0.15],
      ],
      0.022,
      0.026,
    );
    chestLine(
      torso,
      "flight-zip",
      brass,
      [
        [0, -0.2],
        [0, 0.27],
      ],
      0.007,
    );
  } else if (id === "rally") {
    back(
      "harness-left",
      dark,
      [
        [-0.24, -0.14],
        [0.2, 0.24],
      ],
      0.018,
    );
    back(
      "harness-right",
      dark,
      [
        [0.24, -0.14],
        [-0.2, 0.24],
      ],
      0.018,
    );
    collar(driver, "rally-protection-collar", dark, 0.27, 0.036, 1.76);
    for (const side of [-1, 1]) {
      chestLine(
        torso,
        `utility-strap-${side}`,
        dark,
        [
          [side * 0.23, -0.2],
          [side * 0.23, 0.1],
          [side * 0.15, 0.28],
        ],
        0.018,
      );
      panel(
        torso,
        `utility-pocket-${side}`,
        cream,
        [
          (p) => p.x - side * 0.15 + 0.068,
          (p) => side * 0.15 + 0.068 - p.x,
          (p) => p.y + 0.12,
          (p) => 0.055 - p.y,
          (p) => p.z - 0.18,
        ],
        0.024,
      );
    }
    panel(
      helmet,
      "rally-brow",
      dark,
      [(p) => p.y - 0.16, (p) => 0.23 - p.y, (p) => p.z - 0.35],
      0.017,
    );
    for (const side of [-1, 1])
      panel(
        helmet,
        `helmet-vent-${side}`,
        dark,
        [
          (p) => p.x - side * 0.32 + 0.034,
          (p) => side * 0.32 + 0.034 - p.x,
          (p) => p.y - 0.28,
          (p) => 0.43 - p.y,
          (p) => p.z - 0.2,
        ],
        0.012,
      );
  } else if (id === "neko") {
    back(
      "hood-drape",
      cream,
      [
        [-0.26, 0.23],
        [-0.21, 0.075],
        [0, 0.025],
        [0.21, 0.075],
        [0.26, 0.23],
      ],
      0.018,
    );
    collar(driver, "hood-outer-fold", primary, 0.32, 0.065, 1.735, true);
    collar(driver, "hood-ivory-lining", cream, 0.3, 0.023, 1.79, true);
    for (const side of [-1, 1]) {
      // Rounded tapered ears, restrained enough to preserve the full-face helmet silhouette.
      const shape = new THREE.Shape();
      shape.moveTo(-0.09, 0);
      shape.quadraticCurveTo(-0.06, 0.12, 0, 0.21);
      shape.quadraticCurveTo(0.015, 0.23, 0.035, 0.18);
      shape.quadraticCurveTo(0.08, 0.1, 0.09, 0);
      shape.quadraticCurveTo(0, -0.025, -0.09, 0);
      const ear = add(
        driver,
        `cat-ear-${side}`,
        new THREE.ExtrudeGeometry(shape, {
          depth: 0.055,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.016,
          bevelThickness: 0.016,
          curveSegments: 8,
        }),
        accent,
      );
      ear.position.set(side * 0.39, 2.63, -0.14);
      ear.rotation.z = -side * 0.23;
      ear.userData.headAccessory = true;
      chestLine(
        torso,
        `hood-cord-${side}`,
        cream,
        [
          [side * 0.12, 0.26],
          [side * 0.14, 0.08],
        ],
        0.008,
      );
    }
    chestLine(
      torso,
      "paw-pad",
      cream,
      [
        [-0.07, -0.02],
        [0, 0.03],
        [0.07, -0.02],
        [0.05, -0.09],
        [-0.05, -0.09],
        [-0.07, -0.02],
      ],
      0.014,
    );
    for (const x of [-0.075, 0, 0.075])
      chestLine(
        torso,
        `paw-toe-${x}`,
        cream,
        [
          [x, 0.065],
          [x, 0.09],
        ],
        0.012,
        0.021,
      );
  }
  // Neutral sleeves may carry the base suit's AO colors, but their neutral material
  // does not consume them. Strip these attributes to keep batches compatible.
  meshList(driver).forEach((mesh) => {
    if (!(mesh.material as THREE.MeshStandardMaterial).vertexColors)
      mesh.geometry.deleteAttribute("color");
  });
  const retained = new Set(meshList(driver).flatMap(materialList));
  oldMaterials.forEach((m) => {
    if (!retained.has(m)) m.dispose();
  });
  [primary, cream, dark, accent, brass].forEach((m) => {
    if (!retained.has(m)) m.dispose();
  });
  tintDriverOutfit(driver, "lime");
  return driver;
}

/** Change only tagged driver paint/fabric; preserve authored trim and geometry. */
export function tintDriverOutfit(driver: THREE.Group, id: DriverColorId): void {
  const color = new THREE.Color(getDriverColor(id).color);
  for (const m of new Set(meshList(driver).flatMap(materialList))) {
    if (!m.userData.driverColorRole) continue;
    const material = m as THREE.MeshStandardMaterial;
    material.color.copy(color);
    if (m.userData.driverColorRole === "shade")
      material.color.multiplyScalar(0.43);
  }
  driver.userData.driverColor = id;
}
