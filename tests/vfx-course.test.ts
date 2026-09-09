import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CourseVfx, courseMarkers } from "../client/vfx/course.ts";
import { TRACKS } from "../shared/track.ts";
import { getLevel } from "../shared/levels.ts";

test("course markers use provided current targets and actual shortcut entries", () => {
  const track = TRACKS.find((t) => t.shortcut.length > 0)!;
  const markers = courseMarkers(
    track,
    [{ t: 0.731, complete: false, kind: "corner" }],
    false,
  );
  assert.equal(markers.find((m) => m.kind === "corner")?.t, 0.731);
  assert.equal(
    markers.find((m) => m.kind === "shortcut")?.t,
    track.shortcut[0].t,
  );
  assert.equal(
    courseMarkers(
      track,
      [{ t: 0.731, complete: true, kind: "corner" }],
      true,
    ).find((m) => m.kind === "corner")?.state,
    "failed",
  );
});
test("every track surface overlay follows only its configured boost/ice zones and resets/disposes", () => {
  for (const track of TRACKS) {
    const scene = new THREE.Scene(),
      fx = new CourseVfx(scene, track);
    assert.equal(
      fx.zoneCount,
      getLevel(track.id).zones.filter((z) => z.kind !== "sand").length,
    );
    fx.update(
      {
        active: true,
        paused: false,
        motion: 1,
        quality: "high",
        targets: [],
        failed: false,
      },
      1 / 60,
    );
    const elapsed = fx.time;
    fx.update(
      {
        active: true,
        paused: true,
        motion: 1,
        quality: "high",
        targets: [],
        failed: false,
      },
      1,
    );
    assert.equal(fx.time, elapsed);
    fx.reset();
    assert.equal(fx.time, 0);
    fx.dispose();
    fx.dispose();
    assert.equal(fx.group.parent, null);
  }
});
