import assert from "node:assert/strict";
import { test } from "node:test";
import { LANGUAGES, localize, setLanguage, tr } from "../client/i18n.ts";
import { MAP_CATALOG } from "../client/locales/maps.ts";
import { NEW_MAPS } from "../shared/map-expansion.ts";
import { MAP_RATING_LABELS } from "../shared/map-profiles.ts";

const tokens = (value: string) =>
  [...value.matchAll(/\{([a-z][a-z0-9]*)\}/gi)].map((match) => match[1]).sort();

test("all new map metadata, ratings and route labels have six complete translations", () => {
  const sources = [
    ...NEW_MAPS.flatMap(({ name, brief, landmark }) => [name, brief, landmark]),
    ...Object.values(MAP_RATING_LABELS),
    "Map rating",
    "A/B routes",
    "Route A",
    "Route B",
    "Moving obstacles",
    "A/B ROUTES",
    "ROUTE A",
    "ROUTE B",
    "WIDE ROUTE",
    "TECHNICAL ROUTE",
  ];
  for (const source of sources) assert.ok(MAP_CATALOG[source], source);
  for (const [source, entry] of Object.entries(MAP_CATALOG)) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      LANGUAGES.map(({ code }) => code).sort(),
    );
    for (const { code } of LANGUAGES) {
      assert.ok(entry[code].trim(), `${source}: ${code}`);
      assert.deepEqual(
        tokens(entry[code]),
        tokens(source),
        `${source}: ${code}`,
      );
      assert.equal(tr(source, {}, code), entry[code], `${source}: ${code}`);
      if (code !== "zh") assert.doesNotMatch(entry[code], /[\u3400-\u9fff]/u);
    }
  }
});

test("map counts and retained selections interpolate cleanly in every language", () => {
  for (const { code } of LANGUAGES) {
    assert.equal(
      tr("Showing 3 of 19 tracks", {}, code),
      tr("Showing {n} of {total} tracks", { n: 3, total: 19 }, code),
    );
    const selection = tr(
      "Your selected track is outside this filter: {track}",
      { track: tr("Orchard Run", {}, code) },
      code,
    );
    assert.doesNotMatch(selection, /\{[^}]+\}/);
    assert.match(selection, new RegExp(tr("Orchard Run", {}, code)));
  }
});

test("already displayed English map names and counts switch languages in place", () => {
  const name = { nodeType: 3, textContent: "Orchard Run", childNodes: [] };
  const count = {
    nodeType: 3,
    textContent: "Showing 3 of 19 tracks",
    childNodes: [],
  };
  const root = {
    nodeType: 1,
    tagName: "DIV",
    textContent: null,
    childNodes: [name, count],
  };
  for (const { code } of LANGUAGES) {
    setLanguage(code);
    localize(root as unknown as HTMLElement);
    assert.equal(name.textContent, tr("Orchard Run", {}, code));
    assert.equal(
      count.textContent,
      tr("Showing {n} of {total} tracks", { n: 3, total: 19 }, code),
    );
  }
  setLanguage("en");
});
