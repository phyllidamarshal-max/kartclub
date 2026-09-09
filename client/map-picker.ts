import { getLevel } from "../shared/levels.ts";
import {
  MAP_RATING_LABELS,
  mapProfile,
  type MapRating,
} from "../shared/map-profiles.ts";
import type { Track } from "../shared/track.ts";
import { tr } from "./i18n.ts";

export type MapRatingFilter = "all" | MapRating;

const RATINGS = [1, 2, 3, 4] as const;
const MECHANIC_LABELS = {
  flow: "Flowing bends",
  precision: "Precision turns",
  surface: "Variable grip",
  traffic: "Traffic crossings",
  timing: "Timed crossings",
} as const;

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export function parseMapRatingFilter(
  value: string | undefined,
): MapRatingFilter | undefined {
  if (value === "all") return value;
  if (value && /^[1-4]$/.test(value)) return Number(value) as MapRating;
  return undefined;
}

type TaggedTrack = {
  readonly id: string;
  readonly shortcut: readonly unknown[];
  readonly layout?: "circuit" | "ab";
  readonly movingObstacles?: readonly unknown[];
};

/** Shared by browser cards and the current-track lobby card. */
export function mapTagsMarkup(track: TaggedTrack): string {
  const profile = mapProfile(track.id);
  const rating = tr(MAP_RATING_LABELS[profile.rating]);
  const ab = track.layout === "ab" || profile.layout === "ab";
  return `<span class="map-tags"><span class="map-rating-tag" title="${escape(tr("Map rating"))}"><span dir="ltr">${profile.rating}/4</span> · ${escape(rating)}</span><span class="map-mechanic-tag">${escape(tr(MECHANIC_LABELS[profile.mechanic]))}</span>${ab ? `<span class="map-mechanic-tag">${escape(tr("A/B routes"))}</span>` : track.shortcut.length ? `<span class="map-mechanic-tag">${escape(tr("Shortcut"))}</span>` : ""}${track.movingObstacles?.length ? `<span class="map-mechanic-tag">${escape(tr("Moving obstacles"))}</span>` : ""}${profile.isNew ? `<span class="map-new-tag">${escape(tr("New"))}</span>` : ""}</span>`;
}

/** Filtering is a view operation: this helper never changes selectedId or race settings. */
export function mapPickerMarkup(
  tracks: readonly Track[],
  selectedId: string,
  filter: MapRatingFilter,
  trackImage: (track: Track) => string,
  widthLabel: (track: Track) => string,
): string {
  const visible = tracks.filter(
    (track) => filter === "all" || mapProfile(track.id).rating === filter,
  );
  const selected = tracks.find((track) => track.id === selectedId);
  const outside = selected && !visible.includes(selected);
  const buttons = (["all", ...RATINGS] as const)
    .map((rating) => {
      const count =
        rating === "all"
          ? tracks.length
          : tracks.filter((track) => mapProfile(track.id).rating === rating)
              .length;
      const label = tr(rating === "all" ? "All" : MAP_RATING_LABELS[rating]);
      return `<button type="button" class="map-rating-filter ${filter === rating ? "selected" : ""}" data-map-rating="${rating}" aria-pressed="${filter === rating}"><span>${escape(label)}</span><span class="map-filter-count" dir="ltr">${count}</span></button>`;
    })
    .join("");
  const cards = visible
    .map((track) => {
      const isSelected = selectedId === track.id;
      const index = tracks.indexOf(track) + 1;
      return `<button type="button" class="track-option ${isSelected ? "selected" : ""}" aria-pressed="${isSelected}" data-track="${escape(track.id)}">${trackImage(track)}<span class="track-card-body"><span class="track-card-title"><b>${escape(tr(track.name))}</b><span class="track-check" aria-label="${escape(tr(isSelected ? "Selected" : "Not selected"))}">${isSelected ? "✓" : String(index).padStart(2, "0")}</span></span>${mapTagsMarkup(track)}<small>${escape(tr("{n} km", { n: (track.length / 1000).toFixed(2) }))} · ${escape(widthLabel(track))}</small><span class="track-card-detail">${escape(tr(getLevel(track.id).brief))}</span><small>${escape(tr("约 {n} 分钟 · {laps} 圈", { n: track.raceMinutes ?? 3, laps: 3 }))} · ${escape(tr("V / S / U 技术弯"))}</small></span></button>`;
    })
    .join("");
  return `<div class="section-heading"><h3>${escape(tr("Track selection"))}</h3><span>${escape(tr("{n} tracks", { n: tracks.length }))}</span></div><div class="map-filter-heading"><b>${escape(tr("Map rating"))}</b><span class="map-filter-status" role="status">${escape(tr("Showing {n} of {total} tracks", { n: visible.length, total: tracks.length }))}</span></div><div class="map-rating-filters" role="group" aria-label="${escape(tr("Map rating"))}" aria-describedby="map-rating-help">${buttons}</div><p class="map-rating-help" id="map-rating-help">${escape(tr("Map ratings describe the road. AI difficulty controls your rivals."))}</p>${outside ? `<p class="map-filter-selection" role="status">${escape(tr("Your selected track is outside this filter: {track}", { track: tr(selected.name) }))}</p>` : ""}<div class="track-picker">${cards || `<p class="map-filter-empty">${escape(tr("No tracks at this rating."))}</p>`}</div>`;
}
