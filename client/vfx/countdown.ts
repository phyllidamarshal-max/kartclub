import type { HudVfxFrame } from "./hud-state.ts";

/** Presentation only: the race owns the countdown and the confirmed release cue. */
export class CountdownVfx {
  private readonly value: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly lights: HTMLElement;
  private raceId: string | null = null;
  private shown = "";
  private goRemaining = 0;

  constructor(private readonly root: HTMLElement) {
    const document = root.ownerDocument;
    this.frame = document.createElement("span");
    this.frame.className = "vfx-countdown-frame";
    this.frame.setAttribute("aria-hidden", "true");
    for (const side of ["left", "right"]) {
      const half = document.createElement("i");
      half.className = `vfx-countdown-side vfx-countdown-${side}`;
      this.frame.append(half);
    }
    this.value = document.createElement("span");
    this.value.className = "vfx-countdown-value";
    this.value.setAttribute("data-no-i18n", "");
    this.value.setAttribute("dir", "ltr");
    // A single outline echo; it shares the numeral without adding another label.
    this.value.setAttribute("data-echo", "");
    this.lights = document.createElement("span");
    this.lights.className = "vfx-countdown-lights";
    this.lights.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i++) this.lights.append(document.createElement("i"));
    for (let i = 0; i < 6; i++) {
      const ray = document.createElement("i");
      ray.className = `vfx-countdown-ray vfx-countdown-ray-${i}`;
      this.frame.append(ray);
    }
    root.textContent = "";
    root.classList.add("vfx-countdown");
    root.append(this.frame, this.value, this.lights);
    root.hidden = true;
  }

  update(
    frame: HudVfxFrame,
    dt: number,
    start: boolean,
    moving: boolean,
  ): void {
    if (this.raceId !== frame.raceId) {
      this.reset();
      this.raceId = frame.raceId;
    }
    this.root.dataset.motion = moving ? "on" : "off";
    if (!moving) {
      this.root.classList.remove("vfx-countdown-enter");
      this.root.dataset.compress = "off";
    }
    if (!frame.active || frame.failed || !frame.confirmed) {
      this.clear();
      return;
    }
    if (frame.paused) return;

    const continuous = Number.isFinite(dt) && dt > 0 && dt <= 0.25;
    if (!continuous) this.goRemaining = 0;
    else if (start) this.goRemaining = 0.72;
    else this.goRemaining = Math.max(0, this.goRemaining - dt);

    const count = Number.isFinite(frame.countdown)
      ? Math.ceil(frame.countdown)
      : 0;
    if (count > 0) this.goRemaining = 0;
    const next = count > 0 ? String(count) : this.goRemaining > 0 ? "GO" : "";
    this.root.dataset.compress =
      moving && continuous && frame.countdown > 0 && frame.countdown <= 0.12
        ? "on"
        : "off";
    this.root.hidden = !next;
    if (next === this.shown) return;
    this.shown = next;
    this.value.textContent = next;
    this.value.setAttribute("data-echo", next);
    this.root.dataset.phase = next === "GO" ? "go" : "count";
    this.root.dataset.step = next;
    this.root.classList.remove("vfx-countdown-enter");
    if (next && continuous && moving) {
      // Restart two small compositor animations only on a changed beat.
      void this.root.offsetWidth;
      this.root.classList.add("vfx-countdown-enter");
    }
  }

  private clear(): void {
    this.goRemaining = 0;
    this.shown = "";
    this.value.textContent = "";
    this.value.setAttribute("data-echo", "");
    this.root.hidden = true;
    this.root.classList.remove("vfx-countdown-enter");
    delete this.root.dataset.phase;
    delete this.root.dataset.step;
    delete this.root.dataset.compress;
  }

  reset(): void {
    this.clear();
    this.raceId = null;
    delete this.root.dataset.motion;
  }

  dispose(): void {
    this.reset();
    this.frame.remove();
    this.value.remove();
    this.lights.remove();
    this.root.classList.remove("vfx-countdown");
  }
}
