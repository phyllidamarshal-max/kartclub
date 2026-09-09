import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readDriverAppearance,
  saveDriverAppearance,
  driverPickerMarkup,
} from "../client/driver-customization.ts";
import { garageMarkup } from "../client/kart-garage.ts";

test("wardrobe selection persists both IDs and handles corrupt or blocked storage", () => {
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
  assert.deepEqual(readDriverAppearance(storage), {
    outfitId: "club",
    colorId: "lime",
  });
  assert.equal(
    saveDriverAppearance(storage, { outfitId: "varsity", colorId: "sky" }),
    true,
  );
  assert.deepEqual(readDriverAppearance(storage), {
    outfitId: "varsity",
    colorId: "sky",
  });
  for (const invalid of [
    "broken",
    "null",
    '{"outfitId":"free-money","colorId":"url(x)"}',
  ]) {
    value = invalid;
    assert.deepEqual(readDriverAppearance(storage), {
      outfitId: "club",
      colorId: "lime",
    });
  }
  const blocked = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("quota");
    },
  };
  assert.equal(
    saveDriverAppearance(blocked, { outfitId: "rally", colorId: "gold" }),
    false,
  );
  assert.deepEqual(readDriverAppearance(blocked), {
    outfitId: "club",
    colorId: "lime",
  });
});

test("the existing garage exposes independent kart and driver choices with real selection", () => {
  const html = Reflect.apply(garageMarkup, undefined, [
    "vesper",
    "front",
    { tab: "driver", driver: { outfitId: "neko", colorId: "coral" } },
  ]);
  assert.match(html, /data-garage-tab="driver"[^>]*aria-selected="true"/);
  assert.equal((html.match(/data-driver-outfit=/g) ?? []).length, 7);
  assert.equal((html.match(/data-driver-color=/g) ?? []).length, 8);
  assert.match(html, /data-driver-outfit="neko"[^>]*aria-pressed="true"/);
  assert.match(html, /data-driver-color="coral"[^>]*aria-pressed="true"/);
  assert.equal((html.match(/data-view=/g) ?? []).length, 3);
  assert.match(
    garageMarkup("vesper", "front"),
    /data-kart="vesper"[^>]*aria-pressed="true"/,
  );
});

test("custom imported drivers have an honest disabled recoloring state", () => {
  const custom = driverPickerMarkup({ outfitId: "club", colorId: "red" }, true);
  assert.equal(
    (custom.match(/data-driver-color="[^"]+"[^>]*disabled/g) ?? []).length,
    8,
  );
  assert.match(custom, /Custom driver is active/);
  const editable = driverPickerMarkup(
    { outfitId: "neko", colorId: "red" },
    true,
  );
  assert.doesNotMatch(editable, /disabled/);
});
import { DRIVER_CATALOG } from "../client/locales/drivers.ts";
import { DRIVER_COLORS, DRIVER_OUTFITS } from "../shared/drivers.ts";
import { tr } from "../client/i18n.ts";

test("wardrobe labels and outfit descriptions cover all six supported languages", () => {
  for (const color of DRIVER_COLORS) assert.ok(DRIVER_CATALOG[color.name]);
  for (const outfit of DRIVER_OUTFITS)
    assert.ok(DRIVER_CATALOG[outfit.description]);
  for (const [key, entry] of Object.entries(DRIVER_CATALOG))
    for (const lang of ["en", "fr", "hi", "es", "ar", "zh"] as const) {
      assert.ok(entry[lang].trim());
      assert.equal(tr(key, {}, lang), entry[lang]);
    }
});
