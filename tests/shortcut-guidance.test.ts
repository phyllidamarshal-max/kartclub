import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TRACKS } from "../shared/track.ts";
import {
  shortcutMarkers,
  buildShortcutGuidance,
} from "../client/shortcut-guidance.ts";
import { roadsideClear } from "../client/scenery.ts";
import { tr, LANGUAGES, setLanguage } from "../client/i18n.ts";
import { SHORTCUT_CATALOG } from "../client/locales/shortcuts.ts";

test("shortcut guidance precedes the decision and stays outside all drivable branches", () => {
  for (const track of TRACKS.filter((t) => t.shortcut.length)) {
    const markers = shortcutMarkers(track),
      entry = track.shortcut[0];
    assert.equal(
      markers.filter((m) => m.kind === "approach").length,
      1,
      track.id,
    );
    assert.ok(
      markers.some((m) => m.kind === "turn"),
      track.id,
    );
    for (const m of markers) {
      assert.ok(
        roadsideClear(track, m.x, m.z, m.kind === "approach" ? 3.1 : 1.7),
        track.id,
      );
      if (m.kind === "approach")
        assert.ok((entry.t - m.point.t) * track.length >= 37.9);
    }
  }
});
test("six-language signs update once when language changes and release old label resources", () => {
  const track = TRACKS.find((t) => t.id === "mountain")!;
  for (const source of Object.keys(SHORTCUT_CATALOG))
    for (const { code } of LANGUAGES)
      assert.ok(tr(source, {}, code).length > 0);
  setLanguage("en");
  let generated = 0,
    disposed = 0;
  const text: string[] = [];
  const guidance = buildShortcutGuidance(new THREE.Scene(), track, (copy) => {
    generated++;
    text.push(copy);
    const material = new THREE.MeshBasicMaterial();
    material.addEventListener("dispose", () => disposed++);
    return material;
  });
  const count = generated;
  guidance.updateLanguage();
  assert.equal(generated, count);
  setLanguage("zh");
  guidance.updateLanguage();
  assert.equal(generated, count * 2);
  assert.equal(disposed, count);
  assert.ok(text.includes("稳住走线"));
  setLanguage("en");
});
