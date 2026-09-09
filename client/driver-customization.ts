import {
  DEFAULT_DRIVER,
  DRIVER_COLORS,
  DRIVER_OUTFITS,
  getDriverColor,
  getDriverOutfit,
  sanitizeDriverAppearance,
  type DriverAppearance,
} from "../shared/drivers.ts";
import { tr } from "./i18n.ts";

export const DRIVER_STORAGE_KEY = "kart-driver-appearance";
type DriverStorage = Pick<Storage, "getItem" | "setItem">;
export function readDriverAppearance(
  storage?: Pick<DriverStorage, "getItem">,
): DriverAppearance {
  try {
    return sanitizeDriverAppearance(
      JSON.parse(
        (storage ?? globalThis.localStorage)?.getItem(DRIVER_STORAGE_KEY) ??
          "null",
      ),
    );
  } catch {
    return { ...DEFAULT_DRIVER };
  }
}
export function saveDriverAppearance(
  storage: Pick<DriverStorage, "setItem"> | undefined,
  appearance: DriverAppearance,
): boolean {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(
      DRIVER_STORAGE_KEY,
      JSON.stringify(sanitizeDriverAppearance(appearance)),
    );
    return true;
  } catch {
    return false;
  }
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function driverPickerMarkup(
  appearance: DriverAppearance,
  customDriver = false,
): string {
  const selected = sanitizeDriverAppearance(appearance),
    outfit = getDriverOutfit(selected.outfitId),
    color = getDriverColor(selected.colorId);
  const custom = customDriver && outfit.id === "club";
  return `<div class="driver-colors"><div class="field-heading"><span>${tr("COLOR")}</span><span>${escape(tr(color.name))}</span></div><div class="driver-color-options" role="group" aria-label="${escape(tr("Driver color"))}">${DRIVER_COLORS.map((c) => `<button type="button" class="driver-color-option ${c.id === color.id ? "selected" : ""}" data-driver-color="${c.id}" aria-pressed="${c.id === color.id}" aria-label="${escape(tr(c.name))}" title="${escape(tr(c.name))}" ${custom ? 'disabled aria-describedby="custom-driver-note"' : ""}><span style="--driver-color:${c.color}" aria-hidden="true">${c.id === color.id ? "✓" : ""}</span></button>`).join("")}</div>${custom ? `<p id="custom-driver-note">${tr("Custom driver is active. Choose another outfit to edit colors.")}</p>` : ""}</div>
  <div class="field-heading"><span>${tr("OUTFITS")}</span><span>${DRIVER_OUTFITS.length}</span></div><div class="driver-outfit-options" role="group" aria-label="${escape(tr("Driver outfit"))}">${DRIVER_OUTFITS.map((o) => `<button type="button" class="driver-outfit-option ${o.id === outfit.id ? "selected" : ""}" data-driver-outfit="${o.id}" aria-pressed="${o.id === outfit.id}"><span class="driver-outfit-mark" style="--driver-color:${getDriverColor(o.recommendedColor).color}" aria-hidden="true">${o.id === "neko" ? "✦" : "◆"}</span><b>${escape(tr(o.name))}</b><span class="kart-option-check" aria-hidden="true">${o.id === outfit.id ? "✓" : ""}</span></button>`).join("")}</div><div class="driver-equipped"><span class="eyebrow">${tr("EQUIPPED")}</span><b>${escape(tr(outfit.name))}</b><p>${escape(tr(outfit.description))}</p></div>`;
}
