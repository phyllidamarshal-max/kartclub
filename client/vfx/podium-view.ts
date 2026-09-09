import {
  isPodiumRace,
  PodiumGate,
  type PodiumContext,
  type PodiumRank,
} from "./podium.ts";

interface PodiumOptions {
  quality: "high" | "low";
  motion: number;
}

interface RankStyle {
  particles: { high: number; low: number };
  duration: number;
  particleLife: number;
  ornaments: number;
}

const RANK_STYLES: Record<PodiumRank, RankStyle> = {
  1: {
    particles: { high: 96, low: 24 },
    duration: 2.4,
    particleLife: 1.7,
    ornaments: 2,
  },
  2: {
    particles: { high: 64, low: 16 },
    duration: 1.8,
    particleLife: 1.2,
    ornaments: 2,
  },
  3: {
    particles: { high: 40, low: 12 },
    duration: 1.4,
    particleLife: 0.9,
    ornaments: 1,
  },
};

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function decorateRows(
  host: HTMLElement,
  context: PodiumContext,
): HTMLElement[] {
  const rows = Array.from(
    host.querySelector(".classification")?.children ?? [],
  ) as HTMLElement[];
  rows.forEach((row, index) => {
    const result = context.results[index];
    const rank = result?.rank;
    if (!result?.finished || (rank !== 1 && rank !== 2 && rank !== 3)) return;
    row.classList.add("vfx-podium-row");
    row.dataset.podiumRank = String(rank);
    row.classList.add(`vfx-podium-row-${rank}`);
  });
  return rows;
}

function createMedallion(
  document: Document,
  rank: PodiumRank,
  ornaments: number,
): HTMLElement {
  const medallion = document.createElement("div");
  medallion.className = `vfx-podium-medallion vfx-podium-medallion-${rank}`;
  medallion.dataset.rank = String(rank);
  const rays = document.createElement("span");
  rays.className = "vfx-podium-rays";
  rays.ariaHidden = "true";
  const rayCount = rank === 1 ? 12 : rank === 3 ? 6 : 0;
  for (let index = 0; index < rayCount; index++) {
    const ray = document.createElement("i");
    ray.style.setProperty("--ray-angle", `${(index * 360) / rayCount}deg`);
    rays.append(ray);
  }
  medallion.append(rays);

  const core = document.createElement("span");
  core.className = "vfx-podium-medallion-core";
  core.textContent = String(rank);
  medallion.append(core);
  for (let index = 0; index < ornaments; index++) {
    const ornament = document.createElement("span");
    ornament.className = `vfx-podium-ornament vfx-podium-ornament-${index + 1}`;
    medallion.append(ornament);
  }
  return medallion;
}

function createOverlay(
  document: Document,
  rank: PodiumRank,
  style: RankStyle,
  count: number,
): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = `vfx-podium-overlay vfx-podium-overlay-${rank}`;

  const halo = document.createElement("span");
  halo.className = "vfx-podium-halo";
  overlay.append(halo);

  for (let index = 0; index < count; index++) {
    const particle = document.createElement("i");
    const sideIndex = Math.floor(index / 2);
    const sideCount = Math.ceil(count / 2);
    const spread = sideCount > 1 ? sideIndex / (sideCount - 1) : 0;
    const left = index % 2 === 0 ? 3 + spread * 15 : 97 - spread * 15;
    const life = style.particleLife * (0.72 + (index % 6) * 0.056);
    particle.className = "vfx-podium-particle";
    particle.style.setProperty("--vfx-x", `${left.toFixed(2)}%`);
    particle.style.setProperty("--vfx-y", `${20 + (index % 5) * 3}%`);
    particle.style.setProperty(
      "--vfx-delay",
      `${(0.18 + (index % 9) * 0.025).toFixed(3)}s`,
    );
    particle.style.setProperty("--vfx-life", `${life.toFixed(3)}s`);
    particle.style.setProperty(
      "--vfx-drift",
      `${(index % 2 === 0 ? 1 : -1) * (18 + (index % 11))}px`,
    );
    particle.style.setProperty(
      "--vfx-spin",
      `${120 + ((index * 47) % 280)}deg`,
    );
    overlay.append(particle);
  }
  return overlay;
}

export function mountPodium(
  host: HTMLElement,
  context: PodiumContext,
  options: PodiumOptions,
  gate: PodiumGate,
): () => void {
  if (!isPodiumRace(context)) return () => {};
  const animateRows = gate.takeStandings(context);
  const result = gate.take(context);

  const document = host.ownerDocument;
  const anchor =
    (host.querySelector(".result-modal") as HTMLElement | null) ?? host;
  const style = result ? RANK_STYLES[result.rank] : null;
  const rankClass = result ? `vfx-podium-rank-${result.rank}` : null;
  const owned: HTMLElement[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let emblem: HTMLElement | null = null;
  let createdEmblem = false;

  host.classList.add("vfx-podium");
  if (rankClass) host.classList.add(rankClass);
  anchor.classList.add("vfx-podium-anchor");
  const rows = decorateRows(host, context);

  if (result && style) {
    emblem = host.querySelector(".result-emblem") as HTMLElement | null;
    if (!emblem) {
      emblem = document.createElement("div");
      emblem.className = "result-emblem";
      const heading = host.querySelector("h2");
      if (heading?.parentElement)
        heading.parentElement.insertBefore(emblem, heading);
      else anchor.prepend(emblem);
      createdEmblem = true;
    }
    emblem.classList.add(
      "vfx-podium-emblem",
      `vfx-podium-emblem-${result.rank}`,
    );

    const medallion = createMedallion(document, result.rank, style.ornaments);
    emblem.append(medallion);
    owned.push(medallion);
  }

  const motion = options.motion > 0 && !reducedMotion();
  const animateMedal = Boolean(result?.animate && motion);
  const animateStandings = animateRows && motion && rows.length > 0;
  if (animateMedal && result && style) {
    const overlay = createOverlay(
      document,
      result.rank,
      style,
      style.particles[options.quality],
    );
    anchor.append(overlay);
    owned.push(overlay);
    host.classList.add("vfx-podium-medal-animated");
    timers.push(
      setTimeout(() => {
        overlay.remove();
        host.classList.remove("vfx-podium-medal-animated");
      }, style.duration * 1000),
    );
  }
  if (animateStandings) {
    host.classList.add("vfx-podium-rows-animated");
    timers.push(
      setTimeout(() => {
        host.classList.remove("vfx-podium-rows-animated");
      }, 550),
    );
  }
  if (!animateMedal && !animateStandings) {
    host.classList.add("vfx-podium-static");
  }

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    timers.forEach(clearTimeout);
    owned.forEach((node) => node.remove());
    rows.forEach((row) => {
      row.classList.remove(
        "vfx-podium-row",
        "vfx-podium-row-1",
        "vfx-podium-row-2",
        "vfx-podium-row-3",
      );
      delete row.dataset.podiumRank;
    });
    if (createdEmblem) emblem?.remove();
    else if (result)
      emblem?.classList.remove(
        "vfx-podium-emblem",
        `vfx-podium-emblem-${result.rank}`,
      );
    anchor.classList.remove("vfx-podium-anchor");
    host.classList.remove(
      "vfx-podium",
      "vfx-podium-medal-animated",
      "vfx-podium-rows-animated",
      "vfx-podium-static",
    );
    if (rankClass) host.classList.remove(rankClass);
  };
}
