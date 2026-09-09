import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readSelectedKart,
  saveSelectedKart,
  KART_STORAGE_KEY,
  garageMarkup,
} from "../client/kart-garage.ts";
import { KARTS, sanitizeKartId } from "../shared/karts.ts";
import { setLanguage, tr } from "../client/i18n.ts";

test("the garage restores valid selection and survives unavailable or corrupt storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.equal(readSelectedKart(storage), "apex");
  assert.equal(saveSelectedKart(storage, "rallye"), true);
  assert.equal(readSelectedKart(storage), "rallye");
  values.set(KART_STORAGE_KEY, "<img src=x onerror=alert(1)>");
  assert.equal(readSelectedKart(storage), "apex");
  assert.equal(
    readSelectedKart({
      getItem() {
        throw Error("denied");
      },
    }),
    "apex",
  );
  assert.equal(
    saveSelectedKart(
      {
        setItem() {
          throw Error("quota");
        },
      },
      "apex",
    ),
    false,
  );
  for (const invalid of [
    { id: "apex" },
    [],
    0,
    null,
    "__proto__",
    "APEX",
    "http://url",
  ])
    assert.equal(sanitizeKartId(invalid), "club");
});

test("all seven selectable models have clear equipped state and real shared catalog content", () => {
  setLanguage("en");
  const html = garageMarkup("tempest", "rear");
  assert.equal((html.match(/data-kart=/g) ?? []).length, 7);
  assert.match(html, /data-kart="tempest" aria-pressed="true"/);
  assert.match(html, /data-view="rear" aria-pressed="true"/);
  for (const kart of KARTS) assert.ok(html.includes(kart.name));
  assert.doesNotMatch(html, /disabled|unlock|price|purchase/i);
});

test("all added garage descriptions and labels are localized in the existing six languages", () => {
  for (const key of [
    "GARAGE",
    "YOUR COLLECTION",
    "Choose a model. Make it yours.",
    "KART MODELS",
    "EQUIPPED",
    ...KARTS.flatMap((k) => [k.subtitle, k.description]),
  ]) {
    for (const lang of ["fr", "hi", "es", "ar", "zh"] as const)
      assert.notEqual(tr(key, {}, lang), key, `${lang}: ${key}`);
  }
});
