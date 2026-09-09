import * as THREE from "three";
import {
  trackPoint,
  trackWidth,
  shortcutWidthAt,
  angleDiff,
  type Track,
  type Point,
} from "../shared/track.ts";
import { roadsideClear } from "./scenery.ts";
import { language, tr } from "./i18n.ts";

export interface ShortcutMarker {
  point: Point;
  x: number;
  z: number;
  turn: number;
  kind: "approach" | "turn";
}
/** Sparse, visible guidance lives outside the actual road union. */
export function shortcutMarkers(track: Track): ShortcutMarker[] {
  if (!track.shortcut.length) return [];
  const result: ShortcutMarker[] = [];
  const entry = track.shortcut[0],
    after = track.shortcut[Math.min(20, track.shortcut.length - 1)];
  const side =
    Math.sign(
      (after.x - entry.x) * Math.cos(entry.heading) -
        (after.z - entry.z) * Math.sin(entry.heading),
    ) || 1;
  const approach = trackPoint(entry.t - 38 / track.length, track);
  for (const s of [side, -side]) {
    const offset = s * (trackWidth(approach.t, track) / 2 + 4.5);
    const x = approach.x + Math.cos(approach.heading) * offset,
      z = approach.z - Math.sin(approach.heading) * offset;
    if (roadsideClear(track, x, z, 3.1)) {
      result.push({ point: approach, x, z, turn: side, kind: "approach" });
      break;
    }
  }
  let distance = 0,
    last = -40;
  for (let i = 1; i < track.shortcut.length - 7; i++) {
    const p = track.shortcut[i],
      prev = track.shortcut[i - 1];
    distance += Math.hypot(p.x - prev.x, p.z - prev.z);
    if (distance < 28 || distance - last < 34) continue;
    const turn = angleDiff(track.shortcut[i + 7].heading, prev.heading);
    if (Math.abs(turn) < 0.075) continue;
    const offset = -Math.sign(turn) * (shortcutWidthAt(p.t, track) / 2 + 2.2);
    const x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    if (!roadsideClear(track, x, z, 1.7)) continue;
    result.push({ point: p, x, z, turn: Math.sign(turn), kind: "turn" });
    last = distance;
  }
  return result;
}

type Label = (text: string, bg: string, fg: string) => THREE.Material;
export function buildShortcutGuidance(
  scene: THREE.Scene,
  track: Track,
  label: Label,
) {
  const group = new THREE.Group();
  group.name = "shortcut-guidance";
  scene.add(group);
  const labels: { mesh: THREE.Mesh; source: string; accent: boolean }[] = [];
  const ink = new THREE.MeshBasicMaterial({ color: "#173e30" });
  const accent = new THREE.MeshBasicMaterial({
    color: "#cbf06b",
    side: THREE.DoubleSide,
  });
  const post = new THREE.MeshStandardMaterial({
    color: "#aaa18a",
    roughness: 0.9,
  });
  const arrow = new THREE.Shape();
  arrow.moveTo(-0.6, -0.45);
  arrow.lineTo(-0.1, -0.45);
  arrow.lineTo(0.5, 0);
  arrow.lineTo(-0.1, 0.45);
  arrow.lineTo(-0.6, 0.45);
  arrow.lineTo(0, 0);
  arrow.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(arrow);
  function text(
    parent: THREE.Group,
    source: string,
    y: number,
    width: number,
    height: number,
    bright: boolean,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      label(
        tr(source),
        bright ? "#cbf06b" : "#173e30",
        bright ? "#173e30" : "#f5f1e6",
      ),
    );
    mesh.position.set(0, y, 0.11);
    parent.add(mesh);
    labels.push({ mesh, source, accent: bright });
  }
  for (const marker of shortcutMarkers(track)) {
    const g = new THREE.Group();
    g.position.set(marker.x, marker.point.y, marker.z);
    g.rotation.y = marker.point.heading + Math.PI;
    group.add(g);
    const approach = marker.kind === "approach",
      width = approach ? 5.4 : 2.8,
      height = approach ? 2.1 : 1.5;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.18),
      ink,
    );
    board.position.y = 3.2;
    g.add(board);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.16), post);
    pole.position.y = 1.25;
    g.add(pole);
    if (approach) {
      text(
        g,
        track.layout === "ab" ? "A/B ROUTES" : "SHORTCUT",
        3.7,
        4.8,
        0.65,
        true,
      );
      text(
        g,
        track.shortcutDesign?.cue ?? "HOLD YOUR LINE",
        3.0,
        4.9,
        0.55,
        false,
      );
    } else {
      const chevron = new THREE.Mesh(arrowGeometry, accent);
      chevron.position.set(0, 3.2, 0.11);
      if (marker.turn > 0) chevron.rotation.z = Math.PI;
      g.add(chevron);
    }
  }
  if (track.shortcut.length) {
    const entry =
        track.layout === "ab"
          ? track.shortcut[Math.floor(track.shortcut.length * 0.18)]
          : track.shortcut[0],
      banner = new THREE.Group();
    banner.name = "shortcut-entry-banner";
    banner.position.set(entry.x, entry.y, entry.z);
    banner.rotation.y = entry.heading + Math.PI;
    group.add(banner);
    text(
      banner,
      track.layout === "ab" ? "ROUTE B" : "SHORTCUT",
      6.4,
      6.4,
      1.1,
      true,
    );
    if (track.layout === "ab") {
      const a = trackPoint(entry.t, track),
        main = new THREE.Group();
      main.name = "route-a-banner";
      main.position.set(a.x, a.y, a.z);
      main.rotation.y = a.heading + Math.PI;
      group.add(main);
      text(main, "ROUTE A", 6.4, 6.4, 1.1, false);
      text(main, "WIDE ROUTE", 5.4, 6.4, 0.65, false);
    }
  }
  let locale = language();
  return {
    group,
    updateLanguage() {
      if (locale === language()) return;
      locale = language();
      for (const item of labels) {
        const old = item.mesh.material as THREE.MeshBasicMaterial;
        item.mesh.material = label(
          tr(item.source),
          item.accent ? "#cbf06b" : "#173e30",
          item.accent ? "#173e30" : "#f5f1e6",
        );
        old.map?.dispose();
        old.dispose();
      }
    },
  };
}
