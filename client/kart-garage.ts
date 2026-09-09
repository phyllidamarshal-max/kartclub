import {
  DEFAULT_KART_ID,
  KARTS,
  getKart,
  sanitizeKartId,
  type KartId,
} from "../shared/karts.ts";
import { tr } from "./i18n.ts";
import { DEFAULT_DRIVER, type DriverAppearance } from "../shared/drivers.ts";
import { driverPickerMarkup } from "./driver-customization.ts";
export type GarageTab = "karts" | "driver";

export const KART_STORAGE_KEY = "kart-selected-model";
type KartStorage = Pick<Storage, "getItem" | "setItem">;
export function readSelectedKart(
  storage: Pick<KartStorage, "getItem"> | undefined,
): KartId {
  try {
    return sanitizeKartId(
      (storage ?? globalThis.localStorage)?.getItem(KART_STORAGE_KEY),
      DEFAULT_KART_ID,
    );
  } catch {
    return DEFAULT_KART_ID;
  }
}
export function saveSelectedKart(
  storage: Pick<KartStorage, "setItem"> | undefined,
  id: KartId,
): boolean {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(KART_STORAGE_KEY, sanitizeKartId(id));
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
export function garageMarkup(
  selected: KartId,
  view: string,
  options: {
    tab?: GarageTab;
    driver?: DriverAppearance;
    customDriver?: boolean;
  } = {},
): string {
  const kart = getKart(selected);
  const tab = options.tab === "driver" ? "driver" : "karts";
  return `<section class="garage-panel kart-garage" data-garage-active="${tab}" aria-label="${escape(tr(tab === "driver" ? "Your driver" : "Your kart"))}">
    <header><span class="eyebrow">KART CLUB / ${tr("GARAGE")}</span><h1 tabindex="-1">${tr(tab === "driver" ? "YOUR DRIVER" : "YOUR COLLECTION")}</h1><p>${tr(tab === "driver" ? "Choose an outfit, then a color." : "Choose a model. Make it yours.")}</p></header>
    <div class="garage-tabs" role="tablist" aria-label="${escape(tr("Customization"))}">${(["karts", "driver"] as const).map((t) => `<button type="button" role="tab" id="garage-tab-${t}" class="${tab === t ? "selected" : ""}" data-garage-tab="${t}" aria-selected="${tab === t}" aria-controls="garage-customization-panel" tabindex="${tab === t ? 0 : -1}">${tr(t === "karts" ? "KARTS" : "DRIVER")}</button>`).join("")}</div>
    <div class="kart-garage-content" id="garage-customization-panel" role="tabpanel" aria-labelledby="garage-tab-${tab}">${
      tab === "driver"
        ? driverPickerMarkup(
            options.driver ?? DEFAULT_DRIVER,
            options.customDriver,
          )
        : `<div class="field-heading"><span>${tr("KART MODELS")}</span><span dir="ltr">${KARTS.length}</span></div>
    <div class="kart-model-options" role="group" aria-label="${escape(tr("KART MODELS"))}">${KARTS.map((k) => `<button type="button" class="kart-model-option ${k.id === kart.id ? "selected" : ""}" data-kart="${k.id}" aria-pressed="${k.id === kart.id}"><i class="kart-paint-sample" style="--kart-paint:${k.color};--kart-trim:${k.accent}" aria-hidden="true"></i><span><b>${k.name}</b><small>${escape(tr(k.subtitle))}</small></span><span class="kart-option-check" aria-hidden="true">${k.id === kart.id ? "✓" : ""}</span></button>`).join("")}</div>
    <div class="kart-equipped"><span class="eyebrow">${tr("EQUIPPED")}</span><b>${kart.name}</b><p>${escape(tr(kart.description))}</p></div>`
    }
    </div><div class="kart-garage-views"><span class="field-heading">${tr("VIEWING ANGLE")}</span><div class="view-controls" role="group" aria-label="${escape(tr("VIEWING ANGLE"))}">${(["front", "side", "rear"] as const).map((v) => `<button type="button" class="button outline ${view === v ? "selected" : ""}" data-view="${v}" aria-pressed="${view === v}">${tr({ front: "Front", side: "Side", rear: "Rear" }[v])}</button>`).join("")}</div></div>
    <footer class="kart-garage-actions"><p>${tr("The same driving setup is used by every racer.")}</p><button type="button" class="button accent full" data-page="home">${tr("BACK TO LOBBY")} <span aria-hidden="true">→</span></button></footer></section>`;
}
