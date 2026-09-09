import {
  BoundedResultGate,
  HudVfxState,
  type HudVfxCues,
  type HudVfxFrame,
} from "./hud-state.ts";
import { CountdownVfx } from "./countdown.ts";

export type { HudVfxFrame } from "./hud-state.ts";

interface HudNodes {
  countdown: HTMLElement | null;
  speedometer: HTMLElement | null;
  nitro: HTMLElement | null;
  item: HTMLElement | null;
  skill: HTMLElement | null;
  lap: HTMLElement | null;
  objective: HTMLElement | null;
  feedback: HTMLElement | null;
}

const TARGET_CLASSES = [
  "vfx-charge-filled",
  "vfx-nitro-collected",
  "vfx-nitro-used",
  "vfx-nitro-chained",
  "vfx-energy-loss",
  "vfx-item-picked",
  "vfx-item-used",
  "vfx-item-boost",
  "vfx-hit-count",
  "vfx-block-count",
  "vfx-lap-change",
  "vfx-final-lap",
  "vfx-training-step",
  "vfx-objective-step",
  "vfx-sector-improved",
  "vfx-pb-saved",
  "vfx-failed",
  "vfx-mini-success",
  "vfx-impact-light",
  "vfx-impact-medium",
  "vfx-impact-heavy",
  "vfx-speedometer-launch",
  "vfx-speedometer-chain",
  "vfx-shield-open",
  "vfx-shield-block",
] as const;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function pulse(node: HTMLElement | null, className: string): void {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function clearTargetClasses(nodes: HudNodes | null): void {
  if (!nodes) return;
  const targets = Object.values(nodes);
  for (const target of targets) target?.classList.remove(...TARGET_CLASSES);
  nodes.nitro
    ?.querySelectorAll<HTMLElement>(".nitro-charge")
    .forEach((node) =>
      node.classList.remove("vfx-nitro-collected", "vfx-nitro-used"),
    );
}

function makeLayer(document: Document): {
  root: HTMLElement;
  mini: HTMLElement;
  threat: HTMLElement;
  burst: HTMLElement;
  marker: HTMLElement;
  shield: HTMLElement;
  impact: HTMLElement;
  trails: HTMLElement[];
} {
  const root = document.createElement("div");
  root.className = "vfx-hud-layer";
  root.setAttribute("aria-hidden", "true");

  const wind = document.createElement("div");
  wind.className = "vfx-hud-wind";
  for (let index = 0; index < 10; index++) {
    const line = document.createElement("i");
    line.style.setProperty("--vfx-line-top", `${7 + index * 8.4}%`);
    line.style.setProperty("--vfx-line-delay", `${index * -73}ms`);
    wind.append(line);
  }
  const mini = document.createElement("div");
  mini.className = "vfx-hud-mini-window";
  const threat = document.createElement("div");
  threat.className = "vfx-hud-threat";
  threat.append(document.createElement("i"));
  const burst = document.createElement("div");
  burst.className = "vfx-hud-burst";
  burst.append(document.createElement("i"), document.createElement("i"));
  const marker = document.createElement("div");
  marker.className = "vfx-hud-marker";
  const shield = document.createElement("div");
  shield.className = "vfx-hud-shield";
  const impact = document.createElement("div");
  impact.className = "vfx-hud-impact";
  const trails = [0, 1].map(() => {
    const trail = document.createElement("i");
    trail.className = "vfx-hud-energy-trail";
    return trail;
  });
  root.append(wind, mini, threat, burst, marker, shield, impact, ...trails);
  return { root, mini, threat, burst, marker, shield, impact, trails };
}

/** Adds motion around the existing race HUD without owning its content. */
export class HudVfx {
  private readonly state = new HudVfxState();
  private layer: ReturnType<typeof makeLayer> | null = null;
  private nodes: HudNodes | null = null;
  private countdown: CountdownVfx | null = null;
  private disposed = false;
  private trailIndex = 0;
  private miniSuccessRemaining = 0;
  private readonly onLayout = () => {
    this.layer?.trails.forEach((trail) => {
      if (trail.classList.contains("vfx-energy-trail-active"))
        this.positionTrail(trail);
    });
  };

  constructor(private readonly host: HTMLElement) {
    this.bind();
  }

  private bind(): void {
    this.countdown?.dispose();
    clearTargetClasses(this.nodes);
    this.layer?.root.remove();
    this.nodes = {
      countdown: this.host.querySelector(".countdown"),
      speedometer: this.host.querySelector(".speedometer"),
      nitro: this.host.querySelector(".nitro-box"),
      item: this.host.querySelector(".item-hud"),
      skill: this.host.querySelector(".skill-feedback"),
      lap: this.host.querySelector("#lap-count"),
      objective: this.host.querySelector("#objective"),
      feedback: this.host.querySelector(".race-feedback"),
    };
    this.layer = makeLayer(this.host.ownerDocument);
    this.countdown = this.nodes.countdown
      ? new CountdownVfx(this.nodes.countdown)
      : null;
    this.host.append(this.layer.root);
    this.host.classList.add("vfx-hud-host");
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.onLayout);
      window.addEventListener("resize", this.onLayout);
    }
  }

  private ensureBound(): void {
    if (!this.layer || this.layer.root.parentElement !== this.host) this.bind();
  }

  update(frame: HudVfxFrame, dt: number): void {
    if (this.disposed) return;
    this.ensureBound();
    const layer = this.layer!;
    const nodes = this.nodes!;
    const cues = this.state.update(frame, dt);
    const moving = frame.motion > 0 && !reducedMotion();
    const continuous = dt > 0 && dt <= 0.25;
    if (!frame.active || !moving || (!frame.paused && !continuous))
      this.miniSuccessRemaining = 0;
    else if (!frame.paused)
      this.miniSuccessRemaining = Math.max(0, this.miniSuccessRemaining - dt);
    if (moving && cues.miniSuccess && cues.primary === "mini-success") {
      this.miniSuccessRemaining = 0.28;
      pulse(layer.mini, "vfx-mini-success");
    } else if (!this.miniSuccessRemaining)
      layer.mini.classList.remove("vfx-mini-success");
    this.countdown?.update(frame, dt, cues.start, moving);

    this.host.classList.toggle("vfx-hud-active", frame.active);
    this.host.classList.toggle("vfx-hud-paused", frame.paused);
    layer.root.hidden = !frame.active;
    layer.root.dataset.motion = moving ? "on" : "off";
    layer.root.dataset.quality = frame.quality;
    layer.root.style.setProperty("--vfx-speed", cues.speed.toFixed(3));
    layer.root.classList.toggle("vfx-boost-sustain", frame.car.boostTime > 0);
    layer.root.style.setProperty(
      "--vfx-wind-length",
      `${(28 + cues.speed * 62).toFixed(1)}px`,
    );
    layer.root.style.setProperty(
      "--vfx-wind-opacity",
      String(Math.max(0, Math.min(0.72, (cues.speed - 0.38) * 1.45))),
    );
    layer.mini.hidden = cues.miniWindow <= 0 && this.miniSuccessRemaining <= 0;
    const miniWindow = Math.min(1, cues.miniWindow / 0.5);
    layer.mini.style.setProperty(
      "--vfx-mini-opacity",
      String(0.35 + miniWindow * 0.6),
    );
    layer.mini.style.setProperty(
      "--vfx-mini-scale",
      String(0.62 + miniWindow * 0.38),
    );
    layer.threat.hidden = cues.threatAngle === null;
    if (cues.threatAngle !== null) {
      layer.threat.style.setProperty(
        "--vfx-threat-angle",
        `${cues.threatAngle}deg`,
      );
      layer.threat.style.setProperty(
        "--vfx-threat-urgency",
        String(Math.max(0, 1 - (cues.threatTime ?? 2.25) / 2.25)),
      );
    }
    if (!moving || !frame.active || (!frame.paused && !continuous)) {
      clearTargetClasses(nodes);
      layer.burst.classList.remove("vfx-burst-active");
      layer.marker.classList.remove("vfx-marker-active");
      layer.impact.classList.remove("vfx-impact-active");
      layer.shield.classList.remove("vfx-shield-event");
      layer.trails.forEach((trail) =>
        trail.classList.remove("vfx-energy-trail-active"),
      );
      layer.root.classList.remove("vfx-boost-launch");
    }
    nodes.nitro?.classList.toggle("vfx-charge-full", cues.fullCharge);
    nodes.nitro?.classList.toggle("vfx-inventory-full", cues.inventoryFull);
    nodes.lap?.classList.toggle("vfx-final-lap", cues.finalLap);
    layer.shield.classList.toggle("vfx-shield-active", cues.shieldActive);
    if (cues.energyLoss > 0)
      nodes.nitro?.style.setProperty(
        "--vfx-energy-loss-left",
        `${Math.max(0, Math.min(100, frame.confirmed?.energy ?? 0))}%`,
      );
    if (cues.threatTime !== null) {
      layer.burst.classList.remove("vfx-burst-active");
      layer.root.classList.remove("vfx-boost-launch");
      nodes.speedometer?.classList.remove(
        "vfx-speedometer-launch",
        "vfx-speedometer-chain",
      );
    }

    if (moving && cues.primary) {
      layer.burst.classList.remove("vfx-burst-active");
      layer.marker.classList.remove("vfx-marker-active");
      layer.impact.classList.remove("vfx-impact-active");
      layer.shield.classList.remove("vfx-shield-event");
      layer.root.classList.remove("vfx-boost-launch");
      if (cues.primary !== "mini-success") {
        this.miniSuccessRemaining = 0;
        layer.mini.classList.remove("vfx-mini-success");
        layer.mini.hidden = cues.miniWindow <= 0;
      }
      nodes.speedometer?.classList.remove(
        "vfx-speedometer-launch",
        "vfx-speedometer-chain",
        "vfx-impact-light",
        "vfx-impact-medium",
        "vfx-impact-heavy",
      );
    }

    if (moving) this.applyEvents(cues, nodes, layer);
  }

  private applyEvents(
    cues: HudVfxCues,
    nodes: HudNodes,
    layer: NonNullable<HudVfx["layer"]>,
  ): void {
    if (cues.primary === "start" && !nodes.countdown)
      pulse(layer.burst, "vfx-burst-active");
    if (cues.release) layer.burst.dataset.kind = "release";
    if (cues.chargeFilled) pulse(nodes.nitro, "vfx-charge-filled");
    if (cues.nitro.collected) {
      const charge =
        cues.nitroLandedSlot === null
          ? null
          : (this.host.querySelectorAll<HTMLElement>(".nitro-charge")[
              cues.nitroLandedSlot
            ] ?? null);
      pulse(charge ?? nodes.nitro, "vfx-nitro-collected");
      this.energyTrail(cues.nitroLandedSlot);
    }
    if (cues.nitro.used) {
      const used =
        cues.nitroUsedSlot === null
          ? null
          : this.host.querySelectorAll<HTMLElement>(".nitro-charge")[
              cues.nitroUsedSlot
            ];
      pulse(used ?? nodes.nitro, "vfx-nitro-used");
    }
    if (cues.nitro.chained) pulse(nodes.nitro, "vfx-nitro-chained");
    if (cues.energyLoss > 0) {
      nodes.nitro?.style.setProperty(
        "--vfx-energy-loss-width",
        `${(Math.min(1, cues.energyLoss / 100) * 100).toFixed(1)}%`,
      );
      if (nodes.nitro)
        nodes.nitro.dataset.energyLoss = String(
          Number(cues.energyLoss.toFixed(1)),
        );
      pulse(nodes.nitro, "vfx-energy-loss");
    }
    if (cues.itemPicked) pulse(nodes.item, "vfx-item-picked");
    if (cues.itemUsed) {
      nodes.item?.classList.toggle("vfx-item-boost", cues.itemUsed === "boost");
      pulse(nodes.item, "vfx-item-used");
    }
    if (cues.hitDelta && cues.primary === "hit")
      this.marker(layer.marker, "hit", nodes.item, "vfx-hit-count");
    if (cues.receivedHit && cues.primary === "received-hit")
      this.marker(layer.marker, "received-hit", nodes.item, "vfx-hit-count");
    if (cues.blockDelta && cues.primary === "block")
      this.marker(layer.marker, "block", nodes.item, "vfx-block-count");
    if (cues.trainingDelta && cues.primary === "objective")
      this.marker(layer.marker, "check", nodes.objective, "vfx-training-step");
    if (cues.gateDelta || cues.cornerDelta)
      pulse(nodes.objective, "vfx-objective-step");
    if (cues.lapDelta) pulse(nodes.lap, "vfx-lap-change");
    if (cues.sector) pulse(nodes.objective, "vfx-sector-improved");
    if (cues.pb) pulse(nodes.objective, "vfx-pb-saved");
    if (cues.failed) pulse(nodes.feedback ?? nodes.objective, "vfx-failed");
    if (cues.shieldOpened && cues.primary === "shield-open") {
      layer.shield.dataset.kind = "open";
      pulse(layer.shield, "vfx-shield-event");
      pulse(nodes.item, "vfx-shield-open");
    }
    if (cues.blockDelta && cues.primary === "block") {
      layer.shield.dataset.kind = "block";
      pulse(layer.shield, "vfx-shield-event");
      pulse(nodes.item, "vfx-shield-block");
    }
    if (cues.miniSuccess) pulse(nodes.skill, "vfx-mini-success");
    if (cues.collision) {
      layer.impact.dataset.severity = cues.collision.severity;
      layer.impact.dataset.kind = cues.collision.kind;
      if (cues.primary?.startsWith("impact-"))
        pulse(layer.impact, "vfx-impact-active");
      pulse(nodes.speedometer, `vfx-impact-${cues.collision.severity}`);
    }
    if (cues.primary === "nitro-use") {
      if (cues.nitro.chained) pulse(nodes.speedometer, "vfx-speedometer-chain");
      else {
        layer.burst.dataset.kind = "nitro";
        pulse(layer.burst, "vfx-burst-active");
        pulse(layer.root, "vfx-boost-launch");
        pulse(nodes.speedometer, "vfx-speedometer-launch");
      }
    }
  }

  private energyTrail(slot: number | null): void {
    const trails = this.layer?.trails;
    if (!trails?.length) return;
    const trail = trails[this.trailIndex++ % trails.length];
    trail.dataset.target = slot === null ? "inventory" : "charge";
    if (slot === null) delete trail.dataset.slot;
    else trail.dataset.slot = String(slot);
    this.positionTrail(trail);
    pulse(trail, "vfx-energy-trail-active");
  }

  private positionTrail(trail: HTMLElement): void {
    const rect = (node: HTMLElement | null) => node?.getBoundingClientRect?.();
    const host = rect(this.host);
    const source = rect(this.host.querySelector(".nitro-track"));
    const targetNode =
      trail.dataset.target === "inventory"
        ? this.host.querySelector<HTMLElement>(".nitro-charges")
        : (this.host.querySelectorAll<HTMLElement>(".nitro-charge")[
            Number(trail.dataset.slot)
          ] ?? null);
    const target = rect(targetNode);
    if (!host || !source || !target) return;
    const x = source.right - host.left;
    const y = source.top + source.height / 2 - host.top;
    trail.style.setProperty("--vfx-trail-x", `${x}px`);
    trail.style.setProperty("--vfx-trail-y", `${y}px`);
    trail.style.setProperty(
      "--vfx-trail-dx",
      `${target.left + target.width / 2 - host.left - x}px`,
    );
    trail.style.setProperty(
      "--vfx-trail-dy",
      `${target.top + target.height / 2 - host.top - y}px`,
    );
  }

  private marker(
    marker: HTMLElement,
    kind: string,
    target: HTMLElement | null,
    targetClass: string,
  ): void {
    marker.dataset.kind = kind;
    pulse(marker, "vfx-marker-active");
    pulse(target, targetClass);
  }

  reset(): void {
    this.countdown?.reset();
    this.state.reset();
    this.miniSuccessRemaining = 0;
    clearTargetClasses(this.nodes);
    this.host.classList.remove("vfx-hud-paused", "vfx-hud-active");
    this.nodes?.nitro?.classList.remove(
      "vfx-charge-full",
      "vfx-inventory-full",
    );
    this.nodes?.nitro?.style.removeProperty("--vfx-energy-loss-width");
    if (this.nodes?.nitro) delete this.nodes.nitro.dataset.energyLoss;
    this.nodes?.nitro?.style.removeProperty("--vfx-energy-loss-left");
    if (this.layer) {
      this.layer.root.hidden = true;
      this.layer.root.style.removeProperty("--vfx-speed");
      this.layer.root.style.removeProperty("--vfx-wind-opacity");
      this.layer.root.style.removeProperty("--vfx-wind-length");
      this.layer.root.classList.remove("vfx-boost-sustain", "vfx-boost-launch");
      this.layer.mini.classList.remove("vfx-mini-success");
      delete this.layer.root.dataset.motion;
      delete this.layer.root.dataset.quality;
      this.layer.mini.hidden = true;
      this.layer.mini.style.removeProperty("--vfx-mini-opacity");
      this.layer.mini.style.removeProperty("--vfx-mini-scale");
      this.layer.threat.hidden = true;
      this.layer.threat.style.removeProperty("--vfx-threat-angle");
      this.layer.threat.style.removeProperty("--vfx-threat-urgency");
      this.layer.burst.classList.remove("vfx-burst-active");
      this.layer.marker.classList.remove("vfx-marker-active");
      this.layer.impact.classList.remove("vfx-impact-active");
      this.layer.shield.classList.remove(
        "vfx-shield-active",
        "vfx-shield-event",
      );
      this.layer.trails.forEach((trail) =>
        trail.classList.remove("vfx-energy-trail-active"),
      );
      delete this.layer.burst.dataset.kind;
      delete this.layer.marker.dataset.kind;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.countdown?.dispose();
    if (typeof window !== "undefined")
      window.removeEventListener("resize", this.onLayout);
    this.countdown = null;
    this.layer?.root.remove();
    this.layer = null;
    this.nodes = null;
    this.host.classList.remove("vfx-hud-host");
  }
}

export interface ResultFeedbackOptions {
  raceId: string;
  finished: boolean;
  failed: boolean;
  stars: number;
  motion: number;
  podium: boolean;
  /** True only when this run successfully persisted a new personal best. */
  pb?: boolean;
}

const resultGate = new BoundedResultGate(64);

export function mountResultFeedback(
  host: HTMLElement,
  options: ResultFeedbackOptions,
): () => void {
  if (!options.finished && !options.failed) return () => {};
  const document = host.ownerDocument;
  const anchor =
    (host.querySelector(".result-modal") as HTMLElement | null) ?? host;
  const layer = document.createElement("div");
  layer.className = "vfx-result-feedback";
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.result = options.failed ? "failed" : "finished";
  const motion = options.motion > 0 && !reducedMotion();
  const cue = options.failed ? "failure" : "finish";
  const fresh = resultGate.take(options.raceId, cue);
  const animate = motion && fresh;
  layer.classList.toggle("vfx-result-animated", animate);
  layer.classList.toggle("vfx-result-static", !animate);

  if (options.pb && options.finished && !options.failed) {
    const freshPb = resultGate.take(options.raceId, "pb");
    const badge = document.createElement("span");
    badge.className = "vfx-result-pb";
    badge.textContent = "PB";
    badge.classList.toggle("vfx-result-pb-animated", motion && freshPb);
    layer.append(badge);
  }

  if (!options.podium || options.failed) {
    const emblem = document.createElement("i");
    emblem.className = "vfx-result-status-mark";
    layer.append(emblem);
  }
  const timers: ReturnType<typeof setTimeout>[] = [];
  if (animate && options.finished && !options.failed && !options.podium) {
    const fragments = document.createElement("span");
    fragments.className = "vfx-result-fragments";
    for (let index = 0; index < 18; index++) {
      const fragment = document.createElement("i");
      fragment.style.setProperty("--vfx-x", `${13 + (index % 6) * 15}%`);
      fragment.style.setProperty("--vfx-y", `${16 + (index % 3) * 6}%`);
      fragment.style.setProperty("--vfx-delay", `${(index % 6) * 28}ms`);
      fragment.style.setProperty("--vfx-drift", `${(index - 8) * 3}px`);
      fragments.append(fragment);
    }
    layer.append(fragments);
    timers.push(setTimeout(() => fragments.remove(), 1200));
  }
  anchor.append(layer);

  const starHost = host.querySelector(".stars");
  const stars = Array.from(
    starHost?.querySelectorAll<HTMLElement>(".ui-icon") ?? [],
  );
  const starFresh =
    options.finished && !options.failed
      ? resultGate.take(options.raceId, "stars")
      : false;
  const starAnimation = animate && starFresh;
  stars.forEach((star, index) => {
    const earned =
      options.finished &&
      !options.failed &&
      index < options.stars &&
      star.classList.contains("earned");
    star.classList.add("vfx-result-star");
    star.classList.toggle("vfx-result-star-earned", earned);
    star.classList.toggle("vfx-result-star-animated", starAnimation && earned);
    if (starAnimation)
      star.style.setProperty(
        "--vfx-star-delay",
        `${((options.podium ? 0.55 : 0.18) + index * 0.2).toFixed(2)}s`,
      );
  });

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    timers.forEach(clearTimeout);
    layer.remove();
    stars.forEach((star) => {
      star.classList.remove(
        "vfx-result-star",
        "vfx-result-star-earned",
        "vfx-result-star-animated",
      );
      star.style.removeProperty("--vfx-star-delay");
    });
  };
}
