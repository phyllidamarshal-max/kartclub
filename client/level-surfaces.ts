import * as THREE from "three";
import { getLevel } from "../shared/levels.ts";
import { trackPoint, trackWidth, type Track } from "../shared/track.ts";

/** The rendered strip uses the exact progress/lateral bounds used by stepCar. */
export function buildDrivingSurfaces(scene: THREE.Scene, track: Track) {
  const colors = { boost: "#64e6ad", sand: "#cda266", ice: "#a5efff" };
  for (const zone of getLevel(track.id).zones) {
    const group = new THREE.Group();
    group.name = `surface-${zone.kind}`;
    scene.add(group);
    const vertices: number[] = [];
    const count = Math.max(
      2,
      Math.ceil(((zone.end - zone.start) * track.length) / 2),
    );
    const point = (t: number, lateral: number) => {
      const p = trackPoint(t, track);
      const half = trackWidth(t, track) / 2 - 0.12;
      lateral = Math.max(-half, Math.min(half, lateral));
      return [
        p.x + Math.cos(p.heading) * lateral,
        p.y + 0.095,
        p.z - Math.sin(p.heading) * lateral,
      ];
    };
    for (let i = 0; i < count; i++) {
      const a = zone.start + ((zone.end - zone.start) * i) / count,
        b = zone.start + ((zone.end - zone.start) * (i + 1)) / count;
      const l = zone.lateral - zone.halfWidth,
        r = zone.lateral + zone.halfWidth;
      vertices.push(
        ...point(a, l),
        ...point(b, l),
        ...point(a, r),
        ...point(b, l),
        ...point(b, r),
        ...point(a, r),
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: colors[zone.kind],
      roughness: zone.kind === "ice" ? 0.18 : 0.85,
      metalness: zone.kind === "ice" ? 0.3 : 0,
      side: THREE.DoubleSide,
      emissive: zone.kind === "boost" ? colors.boost : "#000000",
      emissiveIntensity: zone.kind === "boost" ? 0.2 : 0,
    });
    const strip = new THREE.Mesh(geometry, material);
    strip.receiveShadow = true;
    group.add(strip);
    if (zone.kind === "boost") {
      const arrowMat = new THREE.MeshBasicMaterial({
        color: "#164d50",
        side: THREE.DoubleSide,
      });
      const chevron = new THREE.Shape();
      chevron.moveTo(-1.25, -0.8);
      chevron.lineTo(0, 0.45);
      chevron.lineTo(1.25, -0.8);
      chevron.lineTo(1.25, -0.1);
      chevron.lineTo(0, 1.2);
      chevron.lineTo(-1.25, -0.1);
      chevron.closePath();
      const arrowGeo = new THREE.ShapeGeometry(chevron);
      arrowGeo.rotateX(Math.PI / 2);
      for (
        let t = zone.start + 2 / track.length;
        t < zone.end - 1 / track.length;
        t += 4 / track.length
      ) {
        const conforming = arrowGeo.clone();
        const positions = conforming.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const sampleT = Math.max(
            zone.start,
            Math.min(zone.end, t + positions.getZ(i) / track.length),
          );
          const p = trackPoint(sampleT, track),
            half = trackWidth(sampleT, track) / 2 - 0.18;
          const left = Math.max(-half, zone.lateral - zone.halfWidth),
            right = Math.min(half, zone.lateral + zone.halfWidth);
          const lateral = Math.max(
            -half,
            Math.min(
              half,
              Math.max(left, Math.min(right, zone.lateral + positions.getX(i))),
            ),
          );
          positions.setXYZ(
            i,
            p.x + Math.cos(p.heading) * lateral,
            p.y + 0.115,
            p.z - Math.sin(p.heading) * lateral,
          );
        }
        conforming.computeVertexNormals();
        const arrow = new THREE.Mesh(conforming, arrowMat);
        group.add(arrow);
      }
      arrowGeo.dispose();
    }
  }
}
