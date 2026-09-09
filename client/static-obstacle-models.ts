import * as THREE from "three";
import { nearestTrack, type Track } from "../shared/track.ts";
import { getLevel } from "../shared/levels.ts";
import { obstacleModelKit } from "./obstacle-models.ts";

/** Every authored circle gets one grounded solid. Scene disposal owns the kit. */
export function buildStaticObstacles(scene: THREE.Scene, track: Track) {
  const root = new THREE.Group();
  root.name = "static-obstacles";
  scene.add(root);
  const kit = obstacleModelKit();
  const biome = getLevel(track.id).biome;
  const natural = biome === "forest" || biome === "mine";
  const stone = new THREE.IcosahedronGeometry(1, 2);
  const positions = stone.getAttribute("position");
  // Deterministic broad facets, with a full low shoulder matching the circle.
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const radial = 0.91 + 0.07 * Math.sin(x * 8 + z * 5) * Math.sin(y * 7);
    positions.setXYZ(i, x * radial, y * (0.8 + 0.07 * Math.sin(z * 9)), z * radial);
  }
  stone.computeVertexNormals();
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: biome === "mine" ? "#777985" : "#8a8872", roughness: 0.94 });
  for (const [index, spec] of track.obstacles.entries()) {
    const body = new THREE.Group();
    body.name = `static-obstacle:${index}`;
    body.position.set(spec.x, nearestTrack(spec.x, spec.z, track).y, spec.z);
    body.scale.setScalar(spec.radius);
    root.add(body);
    if (natural) {
      const rock = new THREE.Mesh(stone, stoneMaterial);
      rock.name = "faceted-boulder";
      rock.position.y = 0.91;
      rock.rotation.y = index * 2.399;
      rock.castShadow = rock.receiveShadow = true;
      body.add(rock);
      // Rock's skirt is stone too: complete low contact footprint, no air wall.
      const foot = kit.deck(body, 0, 0.995, 0.29, 0.5, "ore", "boulder-foot");
      foot.material = stoneMaterial;
      for (let j = 0; j < 3; j++) {
        const a = index + j * 2.1;
        const vein = kit.part(body, "box", "accent", Math.sin(a) * 0.4, 1.49, Math.cos(a) * 0.3, 0.22, 0.025, 0.07, "stone-inclusion");
        vein.rotation.y = a;
      }
    } else {
      kit.deck(body, 0, 0.995, 0.26, 0.44, "rubber", "bollard-foot");
      kit.part(body, "cylinder", "metal", 0, 0.5, 0, 0.92, 0.12, 0.92, "base-flange");
      kit.part(body, "cylinder", "paint", 0, 1.05, 0, 0.78, 1.02, 0.78, "bollard-shell");
      kit.part(body, "cylinder", "accent", 0, 1.26, 0, 0.79, 0.19, 0.79, "reflective-band");
      kit.part(body, "sphere", "paint", 0, 1.54, 0, 0.78, 0.15, 0.78, "rounded-cap");
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4;
        kit.part(body, "cylinder", "accent", Math.cos(a) * 0.84, 0.58, Math.sin(a) * 0.84, 0.038, 0.04, 0.038, "anchor-bolt");
        kit.part(body, "box", "metal", Math.cos(a) * 0.75, 0.83, Math.sin(a) * 0.75, 0.035, 0.24, 0.035, "panel-seam");
      }
    }
  }
  return root;
}
