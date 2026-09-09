import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  MUSIC_TRACKS,
  LOBBY_MUSIC,
  musicTrack,
} from "../client/music-catalog.ts";
import { TRACKS } from "../shared/track.ts";
import { getLevel } from "../shared/levels.ts";

const manifest = JSON.parse(
  readFileSync(
    new URL("../public/audio/music/manifest.json", import.meta.url),
    "utf8",
  ),
) as {
  version: number;
  sampleRate: number;
  tracks: {
    id: string;
    biome: string;
    landmark: string;
    description: string;
    title: string;
    bpm: number;
    bars: number;
    beatsPerBar: number;
    url: string;
    fallbackUrl: string;
    loopEnd: number;
    environment: { url: string; fallbackUrl: string; loopEnd: number };
    elements: string[];
  }[];
};

test("lobby theme has its own delivered sample-exact loop and two real formats", () => {
  const lobby = JSON.parse(
    readFileSync(
      new URL("../public/audio/music/lobby.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(lobby.id, LOBBY_MUSIC.id);
  assert.equal(lobby.title, LOBBY_MUSIC.title);
  assert.equal(lobby.bpm, LOBBY_MUSIC.bpm);
  assert.equal(lobby.loopEnd, LOBBY_MUSIC.loopEnd);
  assert.deepEqual(lobby.urls, LOBBY_MUSIC.urls);
  assert.ok(!MUSIC_TRACKS.some((cue) => cue.id === LOBBY_MUSIC.id));
  for (const url of lobby.urls) {
    const pathname = new URL(url, "https://kart.invalid").pathname;
    const bytes = readFileSync(
      new URL(`../public${pathname}`, import.meta.url),
    );
    assert.ok(bytes.length > 200_000);
    assert.equal(
      pathname.endsWith("ogg")
        ? bytes.subarray(0, 4).toString()
        : bytes.subarray(4, 8).toString(),
      pathname.endsWith("ogg") ? "OggS" : "ftyp",
    );
  }
});

test("every playable map resolves to a delivered theme score with matching loop metadata", () => {
  assert.deepEqual(
    new Set(MUSIC_TRACKS.map((t) => t.id)),
    new Set(
      TRACKS.map((t) => {
        const cue = musicTrack(t.id);
        assert.ok(cue, `Missing soundtrack for ${t.id}`);
        assert.equal(cue.id, t.id, `Map ${t.id} must have its own composition`);
        assert.equal(
          getLevel(t.id).biome,
          getLevel(cue.id).biome,
          `Wrong theme soundtrack for ${t.id}`,
        );
        return cue.id;
      }),
    ),
  );
  assert.equal(manifest.tracks.length, MUSIC_TRACKS.length);
  assert.equal(manifest.version, 8);
  for (const cue of MUSIC_TRACKS) {
    const asset = manifest.tracks.find((t) => t.id === cue.id);
    assert.ok(asset, `Missing soundtrack for ${cue.id}`);
    assert.equal(
      asset.biome,
      getLevel(cue.id).biome,
      `Music scene does not match ${cue.id}`,
    );
    assert.ok(asset.landmark.length > 10 && asset.description.length > 30);
    assert.ok(
      cue.urls.every(
        (url) =>
          new URL(url, "https://kart.invalid").searchParams.get("v") ===
          String(manifest.version),
      ),
    );
    assert.equal(cue.title, asset.title);
    assert.equal(cue.bpm, asset.bpm);
    assert.equal(cue.bars, asset.bars);
    assert.equal(cue.beatsPerBar, asset.beatsPerBar);
    assert.equal(cue.loopEnd, asset.loopEnd);
    assert.deepEqual(cue.urls, [asset.url, asset.fallbackUrl]);
    assert.ok(cue.environment);
    assert.deepEqual(cue.environment.urls, [
      asset.environment.url,
      asset.environment.fallbackUrl,
    ]);
    assert.equal(cue.environment.loopEnd, cue.loopEnd);
    assert.equal(asset.environment.loopEnd, asset.loopEnd);
    assert.ok(asset.elements.length >= 3);
    for (const url of cue.environment.urls) {
      assert.ok(url.includes(`/${cue.id}-environment.`));
      assert.ok(url.endsWith("?v=8"));
    }
    assert.ok(cue.loopEnd > 60 && cue.loopEnd <= 90);
    assert.ok(
      Math.abs(
        cue.loopEnd * manifest.sampleRate -
          Math.round(cue.loopEnd * manifest.sampleRate),
      ) < 0.00001,
    );
  }
});

test("all map audio assets are distinct real Ogg and AAC files", () => {
  const hashes = new Set<string>();
  for (const track of manifest.tracks) {
    for (const path of [
      track.url,
      track.fallbackUrl,
      track.environment.url,
      track.environment.fallbackUrl,
    ]) {
      const assetPath = new URL(path, "https://kart.invalid").pathname;
      assert.match(assetPath, /^\/audio\/music\/[a-z-]+\.(ogg|m4a)$/);
      const bytes = readFileSync(
        new URL(`../public${assetPath}`, import.meta.url),
      );
      assert.ok(bytes.length > 200_000, `${path} is unexpectedly small`);
      if (assetPath.endsWith("ogg"))
        assert.equal(bytes.subarray(0, 4).toString(), "OggS");
      else assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
      hashes.add(createHash("sha256").update(bytes).digest("hex"));
    }
  }
  assert.equal(hashes.size, manifest.tracks.length * 4);
});
