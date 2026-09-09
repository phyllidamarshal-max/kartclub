import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { angleDiff, trackPoint, trackWidth, nearestTrack, type Track } from "../shared/track.ts";
import { roadsideClear } from "./scenery.ts";

export interface RoadTurnMarker { t: number; x: number; y: number; z: number; heading: number; turn: number; narrow?:boolean }

/** Sparse outside-bend cues derived from the existing route, never new obstacles. */
export function roadTurnMarkers(track: Track): RoadTurnMarker[] {
  const markers: RoadTurnMarker[] = [];
  if(track.id==='reference-coast-v1'){
    const p=nearestTrack(7.8,13.3,track);
    if(roadsideClear(track,7.8,13.3,1.2))markers.push({t:p.t,x:7.8,y:0,z:13.3,heading:p.heading+Math.PI,turn:-1,narrow:true});
  }
  let lastDistance = -40;
  for (let distance = 26; distance < track.length - 20; distance += 8) {
    const t = distance / track.length;
    if(track.id==='reference-coast-v1'&&t>.34&&t<.55)continue;
    const before = trackPoint(t - 9 / track.length, track);
    const after = trackPoint(t + 9 / track.length, track);
    const curve = angleDiff(after.heading, before.heading);
    if (Math.abs(curve) < 0.2 || distance - lastDistance < 42) continue;
    const p = trackPoint(t, track), turn = Math.sign(curve);
    const lateral = -turn * (trackWidth(t, track) / 2 + 2.9);
    const x = p.x + Math.cos(p.heading) * lateral;
    const z = p.z - Math.sin(p.heading) * lateral;
    // Includes adjacent returns and shortcuts; conservative board half diagonal.
    if (!roadsideClear(track, x, z, 1.7)) continue;
    markers.push({ t, x, y: p.y, z, heading: p.heading + Math.PI, turn });
    lastDistance = distance;
    if (markers.length === 24) break;
  }
  return markers;
}

export function buildRoadReadability(scene: THREE.Scene, track: Track) {
  const markers = roadTurnMarkers(track), group = new THREE.Group();
  group.name = "road-turn-signs";
  const ink = new THREE.MeshBasicMaterial({color: "#173e30", side: THREE.DoubleSide});
  const face = new THREE.MeshBasicMaterial({color: "#bad052", side: THREE.DoubleSide});
  const timber = new THREE.MeshStandardMaterial({color:"#b4a58b",roughness:0.88});
  const arrow = new THREE.Shape();
  arrow.moveTo(-0.62,-0.52); arrow.lineTo(-0.10,-0.52);
  arrow.lineTo(0.58,0); arrow.lineTo(-0.10,0.52);
  arrow.lineTo(-0.62,0.52); arrow.lineTo(0.06,0); arrow.closePath();
  const pieces = [
    {name:"turn-board", geometry:new RoundedBoxGeometry(3,1.7,0.16,1,0.1), material:ink, y:2.9, z:0},
    {name:"turn-face", geometry:new THREE.PlaneGeometry(2.78,1.48), material:ink, y:2.9, z:0.09},
    {name:"turn-chevron", geometry:new THREE.ShapeGeometry(arrow), material:face, y:2.9, z:0.10},
    {name:"turn-post", geometry:new THREE.BoxGeometry(0.15,2.15,0.15), material:timber, y:1.05, z:0},
  ];
  const dummy = new THREE.Object3D();
  for (const piece of pieces) {
    const mesh = new THREE.InstancedMesh(piece.geometry,piece.material,markers.length);
    mesh.name = piece.name;
    markers.forEach((marker,i) => {
      dummy.position.set(marker.x+Math.sin(marker.heading)*piece.z,marker.y+piece.y,marker.z+Math.cos(marker.heading)*piece.z);
      dummy.rotation.set(0,marker.heading,0);
      // Board faces approaching traffic, so local X is opposite the road's right.
      // Rotate the chevron 180° instead of reflecting an instance (negative scale
      // would invert winding and is unsupported by InstancedMesh).
      if (piece.name === "turn-chevron" && marker.turn > 0) dummy.rotation.z = Math.PI;
      dummy.scale.set(marker.narrow&&piece.name!=='turn-post'?.58:1,1,1);
      dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
