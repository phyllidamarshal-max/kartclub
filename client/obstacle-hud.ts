import type { Car } from "../shared/race.ts";
import type { Track } from "../shared/track.ts";
import { tr } from "./i18n.ts";
import { selectObstacleWarning } from "./obstacle-hud-state.ts";

export interface ObstacleHudFrame {
  car: Car | null | undefined;
  track: Track;
  clock: number;
  active: boolean;
  paused?: boolean;
  countdown?: boolean;
}
const labels: Record<string, string> = {
  sheep: "Sheep crossing",
  deer: "Deer crossing",
  pendulum: "Swinging pendulum",
  shuttle: "Crossing barrier",
  sweeper: "Road sweeper",
  spinner: "Rotating arm",
  minecart: "Rail minecart",
  hauler: "Cargo carrier",
  static: "Road obstacle",
};
const directions = {
  left: "Moving left",
  right: "Moving right",
  rotating: "Rotating",
  waiting: "Waiting to move",
  fixed: "Fixed obstacle",
};
// All icons use the same stroke weight and view box; only the path changes.
const icons: Record<string, string> = {
  sheep: "M5 16v4m10-4v4M4 14c-3-4 1-8 4-6 1-4 7-3 7 1l4-1 2 3-3 4H6Z",
  deer: "M6 15v5m9-5v5M5 15V9h10l3-4 3 2-3 7H5M18 5V2m0 2-3-2m3 2 3-2",
  pendulum: "M3 3h18M12 3l5 12M13 18a4 4 0 1 0 8 0 4 4 0 1 0-8 0",
  shuttle: "M4 9h16v6H4ZM1 12h2m18 0h2M7 9l4 6m2-6 4 6",
  sweeper: "M4 7h16v6H4ZM6 13l-2 6m6-6-1 6m5-6 1 6m3-6 2 6",
  spinner:
    "M5 3l16 16-2 2L3 5ZM10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 3h6v6M3 15v6h6",
  minecart: "M3 7h18l-3 9H6ZM6 19h1m10 0h1M2 22h20M7 7l3-4 4 1 3 3",
  hauler: "M2 13h20v4H2ZM5 17v3h3v-3m8 0v3h3v-3M5 13V5h14v8M12 5v8",
  static: "M3 20h18L15 4H9ZM7 11h10M5 16h14",
};
function text(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

/** Fixed, noninteractive DOM; no live-region announcements in a frame loop. */
export class ObstacleHud {
  readonly element: HTMLElement;
  private readonly name: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly status: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly path: SVGPathElement;
  private kind = "";
  private destroyed = false;
  constructor(private readonly host: HTMLElement) {
    const doc = host.ownerDocument;
    this.element = doc.createElement("aside");
    this.element.className = "obstacle-hud";
    this.element.hidden = true;
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    this.path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.append(this.path);
    const body = doc.createElement("div");
    body.className = "obstacle-hud-copy";
    this.eyebrow = doc.createElement("small");
    this.name = doc.createElement("strong");
    this.detail = doc.createElement("span");
    this.status = doc.createElement("small");
    this.status.className = "obstacle-hud-risk";
    body.append(this.eyebrow, this.name, this.detail, this.status);
    this.element.append(svg, body);
    host.append(this.element);
  }
  update(frame: ObstacleHudFrame) {
    if (this.destroyed) return;
    if (this.element.parentElement !== this.host)
      this.host.append(this.element);
    const warning =
      frame.active && !frame.paused && !frame.countdown
        ? selectObstacleWarning(frame.car, frame.track, frame.clock)
        : null;
    this.element.hidden = !warning;
    if (!warning) return;
    if (this.kind !== warning.kind) {
      this.kind = warning.kind;
      this.path.setAttribute("d", icons[warning.kind] ?? icons.static);
    }
    if (this.element.dataset.risk !== warning.risk)
      this.element.dataset.risk = warning.risk;
    text(this.eyebrow, tr("UPCOMING"));
    text(this.name, tr(labels[warning.kind] ?? labels.static));
    text(
      this.detail,
      `${tr("{distance} m ahead", { distance: Math.round(warning.distance) })} · ${tr(directions[warning.direction])}`,
    );
    text(
      this.status,
      tr(warning.risk === "on-line" ? "ON YOUR LINE" : "WATCH"),
    );
  }
  destroy() {
    this.destroyed = true;
    this.element.remove();
  }
}
