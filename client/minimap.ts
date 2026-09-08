import { trackPoint, trackWidth, type Track } from "../shared/track.ts";

let cachedTheme: { paper: string; accent: string; brand: string } | undefined;
function minimapTheme() {
  if (!cachedTheme) {
    const style =
      typeof document === "undefined"
        ? null
        : getComputedStyle(document.documentElement);
    cachedTheme = {
      paper: style?.getPropertyValue("--color-bg").trim() || "#F5F1E6",
      accent: style?.getPropertyValue("--color-accent").trim() || "#CBF06B",
      brand: style?.getPropertyValue("--color-brand").trim() || "#173E30",
    };
  }
  return cachedTheme;
}

export function paintMinimap(
  ctx: CanvasRenderingContext2D,
  track: Track,
  cars: readonly { x: number; z: number; id: string }[],
  localId: string,
  palette: readonly string[],
  targets: readonly { t: number; complete: boolean }[] = [],
) {
  const theme = minimapTheme();
  ctx.clearRect(0, 0, 230, 180);
  const xy = (c: { x: number; z: number }) => [
    c.x * (75 / track.radius) + 115,
    c.z * (75 / track.radius) + 88,
  ];
  // Fill the actual two edges so passing zones and narrow necks stay visible.
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const points = side === -1 ? track.points : [...track.points].reverse();
    points.forEach((p, i) => {
      const half = trackWidth(p.t, track) / 2;
      const [x, y] = xy({
        x: p.x + Math.cos(p.heading) * half * side,
        z: p.z - Math.sin(p.heading) * half * side,
      });
      if (side === -1 && i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
  ctx.closePath();
  ctx.fillStyle = theme.paper + "5c";
  ctx.fill();
  ctx.beginPath();
  track.points.forEach((p, i) => {
    const [x, y] = xy(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = theme.paper + "28";
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.paper + "66";
  ctx.stroke();
  if (track.shortcut.length > 1) {
    ctx.beginPath();
    track.shortcut.forEach((p, i) => {
      const [x, y] = xy(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    // Highlight the alternate route with the same brand accent as the HUD.
    ctx.lineWidth = Math.max(
      1,
      ((track.shortcutWidth ?? 7) * 75) / track.radius,
    );
    ctx.strokeStyle = theme.accent;
    ctx.stroke();
  }
  targets.forEach((target, i) => {
    const [x, y] = xy(trackPoint(target.t, track));
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = theme.paper;
    ctx.fill();
    ctx.strokeStyle = target.complete ? theme.accent : theme.paper;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = theme.brand;
    ctx.font = "700 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(target.complete ? "✓" : String(i + 1), x, y);
  });
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i],
      [x, y] = xy(c);
    ctx.beginPath();
    ctx.arc(x, y, c.id === localId ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = c.id === localId ? theme.accent : palette[i % 4];
    ctx.fill();
    ctx.strokeStyle = theme.paper;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
