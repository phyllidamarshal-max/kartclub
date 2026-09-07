import { test } from "node:test";
import assert from "node:assert/strict";
import { paintMinimap } from "../client/minimap.ts";
import { getTrack } from "../shared/track.ts";

function recordingCanvas() {
  let points: number[][] = [],
    closed = false;
  const strokes: { points: number[][]; closed: boolean; width: number }[] = [];
  const circles: number[][] = [];
  const ctx = {
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
    clearRect() {},
    beginPath() {
      points = [];
      closed = false;
    },
    moveTo(x: number, y: number) {
      points.push([x, y]);
    },
    lineTo(x: number, y: number) {
      points.push([x, y]);
    },
    closePath() {
      closed = true;
    },
    stroke() {
      if (points.length)
        strokes.push({ points: [...points], closed, width: this.lineWidth });
    },
    arc(x: number, y: number, r: number) {
      circles.push([x, y, r]);
    },
    fill() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes, circles };
}

test("mountain minimap draws the shared shortcut as an open, narrower branch with aligned car marker", () => {
  const track = getTrack("mountain"),
    canvas = recordingCanvas();
  const point = track.shortcut[40];
  paintMinimap(canvas.ctx, track, [{ ...point, id: "local" }], "local", [
    "red",
  ]);
  assert.equal(canvas.strokes.length, 3);
  const [road, , branch] = canvas.strokes;
  assert.equal(road.closed, true);
  assert.equal(branch.closed, false);
  assert.ok(branch.width < road.width);
  assert.equal(branch.points.length, track.shortcut.length);
  track.shortcut.forEach((p, i) => {
    assert.ok(
      Math.abs(branch.points[i][0] - ((p.x * 75) / track.radius + 115)) < 1e-9,
    );
    assert.ok(
      Math.abs(branch.points[i][1] - ((p.z * 75) / track.radius + 88)) < 1e-9,
    );
  });
  assert.deepEqual(canvas.circles[0], [...branch.points[40], 4]);
});

test("circuits without shortcuts retain closed minimap outlines", () => {
  for (const id of ["coast", "city"]) {
    const track = getTrack(id),
      canvas = recordingCanvas();
    paintMinimap(canvas.ctx, track, [], "local", []);
    assert.equal(canvas.strokes.length, 2);
    assert.ok(
      canvas.strokes.every(
        (path) => path.closed && path.points.length === track.points.length,
      ),
    );
  }
});
