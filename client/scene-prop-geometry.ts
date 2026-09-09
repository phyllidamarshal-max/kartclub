import * as THREE from "three";

type Bevel = readonly [number, number, number];

// Only substantial masses need a light-catching chamfer. Quantized normalized
// insets let different building heights share scene-local geometry, while the
// bevel is never wider than 18 cm after the mesh is scaled to world dimensions.
export function boxBevel(
  width: number,
  height: number,
  depth: number,
): Bevel | undefined {
  const dimensions = [width, height, depth];
  if (Math.min(...dimensions) < 0.65 || width * height * depth < 2)
    return undefined;
  return dimensions.map((dimension) => {
    const inset = Math.min(0.075, 0.18 / dimension);
    return 2 ** Math.floor(Math.log2(inset));
  }) as [number, number, number];
}

export function createChamferedBoxGeometry(bevel: Bevel): THREE.BufferGeometry {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const inner = bevel.map((value) => 0.5 - value);
  const face = (points: number[][]) => {
    const vertices = points.map((point) => new THREE.Vector3(...point));
    const normal = vertices[1]
      .clone()
      .sub(vertices[0])
      .cross(vertices[2].clone().sub(vertices[0]));
    const center = vertices.reduce(
      (sum, point) => sum.add(point),
      new THREE.Vector3(),
    );
    if (normal.dot(center) < 0) {
      vertices.reverse();
      normal.negate();
    }
    normal.normalize();
    const offset = positions.length / 3;
    const major =
      Math.abs(normal.x) > Math.abs(normal.y)
        ? Math.abs(normal.x) > Math.abs(normal.z)
          ? 0
          : 2
        : Math.abs(normal.y) > Math.abs(normal.z)
          ? 1
          : 2;
    for (const point of vertices) {
      positions.push(...point.toArray());
      normals.push(...normal.toArray());
      uvs.push(
        point.getComponent((major + 1) % 3) + 0.5,
        point.getComponent((major + 2) % 3) + 0.5,
      );
    }
    for (let i = 1; i < vertices.length - 1; i++)
      indices.push(offset, offset + i, offset + i + 1);
  };
  // Six central rectangles, twelve edge rectangles, eight triangular corners.
  // This is 44 triangles / 96 flat-normal vertices, rather than a rounded cube
  // with subdivisions on every rail and mullion.
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    for (const sign of [-1, 1])
      face(
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sa, sb]) => {
          const point = [0, 0, 0];
          point[axis] = sign * 0.5;
          point[a] = sa * inner[a];
          point[b] = sb * inner[b];
          return point;
        }),
      );
    for (const sa of [-1, 1])
      for (const sb of [-1, 1])
        face(
          [
            [0, -1],
            [1, -1],
            [1, 1],
            [0, 1],
          ].map(([edge, end]) => {
            const point = [0, 0, 0];
            point[axis] = end * inner[axis];
            point[a] = sa * (edge ? inner[a] : 0.5);
            point[b] = sb * (edge ? 0.5 : inner[b]);
            return point;
          }),
        );
  }
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const signs = [sx, sy, sz];
        face(
          [0, 1, 2].map((outer) =>
            signs.map(
              (sign, axis) => sign * (axis === outer ? 0.5 : inner[axis]),
            ),
          ),
        );
      }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "scene-chamfered-mass";
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// Three reusable outcrops replace regular prism silhouettes. Every layer stays
// within the unit-radius cylinder, so existing roadside clearance remains valid.
export function createStratifiedRockGeometry(
  variant: number,
): THREE.BufferGeometry {
  const layers = [-0.5, -0.24, 0.13, 0.5],
    taper = [0.86, 1, 0.82, 0.64];
  const vertices = layers.map((y, layer) =>
    Array.from({ length: 8 }, (_, side) => {
      const angle = (side * Math.PI) / 4;
      const radius =
        taper[layer] *
        (0.93 + 0.07 * Math.sin(side * 2.7 + layer * 1.8 + variant * 2.1));
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      );
    }),
  );
  const positions: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const center = a.clone().add(b).add(c);
    positions.push(
      ...a.toArray(),
      ...(normal.dot(center) < 0 ? c : b).toArray(),
      ...(normal.dot(center) < 0 ? b : c).toArray(),
    );
  };
  for (let layer = 0; layer < layers.length - 1; layer++)
    for (let side = 0; side < 8; side++) {
      const next = (side + 1) % 8;
      triangle(
        vertices[layer][side],
        vertices[layer][next],
        vertices[layer + 1][side],
      );
      triangle(
        vertices[layer][next],
        vertices[layer + 1][next],
        vertices[layer + 1][side],
      );
    }
  for (const layer of [0, layers.length - 1])
    for (let side = 1; side < 7; side++)
      triangle(
        vertices[layer][0],
        vertices[layer][side],
        vertices[layer][side + 1],
      );
  const geometry = new THREE.BufferGeometry();
  geometry.name = "scene-stratified-outcrop";
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      positions.flatMap((value, i) => (i % 3 === 1 ? [] : [value * 0.5 + 0.5])),
      2,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}
