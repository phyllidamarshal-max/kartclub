import { MUSIC_SCORE_DATA } from "./music-score-data.ts";

export interface MusicCue {
  id: string;
  title: string;
  urls: readonly string[];
  loopEnd?: number;
  environment?: { urls: readonly string[]; loopEnd: number };
}

export interface MusicTrack extends MusicCue {
  bpm: number;
  bars: number;
  beatsPerBar: number;
  loopEnd: number;
}

const SAMPLE_RATE = 44_100;
export const MUSIC_REVISION = 8;
const loopEnd = (bpm: number) =>
  Math.round((32 * 4 * 60 * SAMPLE_RATE) / bpm) / SAMPLE_RATE;

export const MUSIC_TRACKS = MUSIC_SCORE_DATA.map((score): MusicTrack => ({
  ...score,
  urls: [
    `/audio/music/${score.id}.ogg?v=${MUSIC_REVISION}`,
    `/audio/music/${score.id}.m4a?v=${MUSIC_REVISION}`,
  ],
  environment: {
    urls: [
      `/audio/music/${score.id}-environment.ogg?v=${MUSIC_REVISION}`,
      `/audio/music/${score.id}-environment.m4a?v=${MUSIC_REVISION}`,
    ],
    loopEnd: score.loopEnd,
  },
}));

const TRACK_BY_ID = new Map<string, MusicTrack>(
  MUSIC_TRACKS.map((entry) => [entry.id, entry]),
);

export const LOBBY_MUSIC: MusicTrack = {
  id: "lobby",
  title: "Clubhouse Sunshine",
  bpm: 132,
  bars: 32,
  beatsPerBar: 4,
  loopEnd: loopEnd(132),
  urls: ["/audio/music/lobby.ogg?v=1", "/audio/music/lobby.m4a?v=1"],
};

export function musicTrack(id: string): MusicTrack | undefined {
  return TRACK_BY_ID.get(id);
}

export function externalMusicCue(url: string): MusicCue {
  return {
    id: `external:${url}`,
    title: "Custom soundtrack",
    urls: [url],
  };
}
