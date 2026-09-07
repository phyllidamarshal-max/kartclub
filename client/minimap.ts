import type { Track } from "../shared/track.ts";

export function paintMinimap(
  ctx: CanvasRenderingContext2D,
  track: Track,
  cars: readonly { x: number; z: number; id: string }[],
  localId: string,
  palette: readonly string[],
) {
  ctx.clearRect(0, 0, 230, 180);
  const xy = (c: { x: number; z: number }) => [
    c.x * (75 / track.radius) + 115,
    c.z * (75 / track.radius) + 88,
  ];
  ctx.beginPath();
  track.points.forEach((p, i) => {
    const [x, y] = xy(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#ffffff28";
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#e1eee866";
  ctx.stroke();
  if (track.shortcut.length > 1) {
    ctx.beginPath();
    track.shortcut.forEach((p, i) => {
      const [x, y] = xy(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    // A narrow amber open branch communicates the risky alternate route.
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffcc63cc";
    ctx.stroke();
  }
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i],
      [x, y] = xy(c);
    ctx.beginPath();
    ctx.arc(x, y, c.id === localId ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = c.id === localId ? "#c0ff59" : palette[i % 4];
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
