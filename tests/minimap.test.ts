import { test } from "node:test";
import assert from "node:assert/strict";
import { paintMinimap } from "../client/minimap.ts";
import { getTrack, trackWidth, shortcutWidthAt } from "../shared/track.ts";

function recordingCanvas() {
  let points: number[][] = [],
    closed = false;
  const strokes: { points: number[][]; closed: boolean; width: number }[] = [];
  const circles: number[][] = [];
  const fills: number[][][] = [];
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
    fill() {
      if (points.length) fills.push([...points]);
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    strokes,
    circles,
    fills,
  };
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
  assert.equal(branch.width, 1, 'thin open centreline remains visible at minimap scale');
  const shortcutEdges = canvas.fills[1];
  assert.equal(shortcutEdges.length, track.shortcut.length * 2);
  for (let i=0; i<track.shortcut.length; i+=10) {
    const a=shortcutEdges[i],b=shortcutEdges[shortcutEdges.length-1-i];
    assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-shortcutWidthAt(track.shortcut[i].t,track)*75/track.radius)<1e-8);
  }
  const edges = canvas.fills[0];
  assert.equal(edges.length, track.points.length * 2);
  for (const index of [0, 100, 200, 400]) {
    const left = edges[index],
      right = edges[edges.length - 1 - index];
    assert.ok(
      Math.abs(
        Math.hypot(left[0] - right[0], left[1] - right[1]) -
          (trackWidth(track.points[index].t, track) * 75) / track.radius,
      ) < 1e-8,
    );
  }
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
