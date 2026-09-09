import assert from "node:assert/strict";
import { test } from "node:test";
import { setLanguage, tr } from "../client/i18n.ts";
import { musicTrack } from "../client/music-catalog.ts";
import { NEW_MAPS } from "../shared/map-expansion.ts";

test("new map copy and rating guidance translate to Chinese", () => {
  for (const source of NEW_MAPS.flatMap(({ name, brief, landmark }) => [
    name,
    brief,
    landmark,
  ])) {
    assert.notEqual(tr(source, {}, "zh"), source, source);
  }
  assert.equal(tr("Map rating", {}, "zh"), "赛道等级");
  assert.equal(tr("{n} tracks", { n: 19 }, "zh"), "19 条赛道");
});

test("new maps resolve their dedicated soundtrack when selected", () => {
  for (const map of NEW_MAPS) {
    const music = musicTrack(map.id);
    assert.ok(music, map.id);
    assert.equal(music.id, map.id);
    assert.notEqual(music, musicTrack(map.baseId), map.id);
    assert.ok(music.urls.every(url => url.includes(`/music/${map.id}.`)), map.id);
  }
  assert.equal(musicTrack("unknown"), undefined);
});

test("rating filters preserve the selected map and show dynamic counts", async () => {
  const { mapPickerMarkup, parseMapRatingFilter } =
    await import("../client/map-picker.ts");
  const { TRACKS } = await import("../shared/track.ts");
  const { mapProfile } = await import("../shared/map-profiles.ts");
  setLanguage("en");
  const image = (track: (typeof TRACKS)[number]) =>
    `<div data-real-thumbnail="${track.id}"></div>`;
  const width = () => "12–18 m wide";
  const all = mapPickerMarkup(TRACKS, "city", "all", image, width);
  assert.equal(
    (all.match(/class="track-option /g) ?? []).length,
    TRACKS.length,
  );
  assert.match(all, new RegExp(`${TRACKS.length} tracks`));
  assert.equal(
    (all.match(/data-real-thumbnail=/g) ?? []).length,
    TRACKS.length,
  );
  assert.match(all, /data-map-rating="all"[^>]*aria-pressed="true"/);
  const beginner = mapPickerMarkup(TRACKS, "city", 1, image, width);
  assert.equal(
    (beginner.match(/class="track-option /g) ?? []).length,
    TRACKS.filter((track) => mapProfile(track.id).rating === 1).length,
  );
  assert.doesNotMatch(beginner, /data-track="city"/);
  assert.match(beginner, /Your selected track is outside this filter/);
  assert.match(beginner, /data-map-rating="1"[^>]*aria-pressed="true"/);
  assert.match(beginner, /Map ratings describe the road/);
  assert.equal(parseMapRatingFilter("3"), 3);
  assert.equal(parseMapRatingFilter("all"), "all");
  assert.equal(parseMapRatingFilter("5"), undefined);
  assert.equal(parseMapRatingFilter("1.0"), undefined);
});

test("map tags distinguish A/B routes from original shortcuts and expose hazards", async () => {
  const { mapTagsMarkup } = await import("../client/map-picker.ts");
  const { getTrack } = await import("../shared/track.ts");
  setLanguage("en");
  const ab = mapTagsMarkup({
    ...getTrack("coast"),
    id: "harbor-dual",
    layout: "ab",
    movingObstacles: [{ id: "shuttle" }],
  });
  assert.match(ab, /Advanced/);
  assert.match(ab, /A\/B routes/);
  assert.match(ab, /Moving obstacles/);
  assert.doesNotMatch(ab, />Shortcut</);
  const legacy = mapTagsMarkup({ ...getTrack("coast"), shortcut: [{}] });
  assert.match(legacy, />Shortcut</);
  assert.doesNotMatch(legacy, /Moving obstacles/);
});
