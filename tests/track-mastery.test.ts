import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS, trackPoint, trackWidth, angleDiff } from "../shared/track.ts";

for (const track of TRACKS) {
  test(`${track.id}: authored V/S/U sections are real, sampled and drivable geometry`, () => {
    assert.ok(track.bends?.length, "missing authored bend sections");
    assert.ok(track.raceMinutes === 3 || track.raceMinutes === 5);
    assert.ok(track.length / track.points.length <= 2.001);
    for (const kind of ["V", "S", "U"] as const) {
      const bend: NonNullable<typeof track.bends>[number] | undefined =
        track.bends?.find((b) => b.kind === kind);
      assert.ok(bend, `missing ${kind}`);
      const headings = Array.from(
        { length: 101 },
        (_, i) =>
          trackPoint(bend.start + ((bend.end - bend.start) * i) / 100, track)
            .heading,
      );
      const turns = headings.slice(1).map((h, i) => angleDiff(h, headings[i]));
      const total = turns.reduce((a, b) => a + b, 0);
      if (kind === "S")
        assert.ok(Math.min(...turns) < -0.001 && Math.max(...turns) > 0.001);
      if (kind === "U")
        assert.ok(Math.abs(total) > 2.8, `U turns only ${total} rad`);
      if (kind === "V")
        assert.ok(Math.abs(total) > 1.65, `V turns only ${total} rad`);
    }
    const ds = track.length / track.points.length;
    for (let i = 0; i < track.points.length; i++) {
      const p = track.points[i];
      const k =
        Math.abs(
          angleDiff(
            track.points[(i + 1) % track.points.length].heading,
            track.points[(i + track.points.length - 1) % track.points.length]
              .heading,
          ),
        ) /
        (2 * ds);
      assert.ok(k < 1 / 17, `pinched bend at ${p.t}: radius ${1 / k}`);
      assert.ok(
        k * (trackWidth(p.t, track) / 2 + 1.1) < 0.8,
        `inside edge folds at ${p.t}`,
      );
    }
  });
}
