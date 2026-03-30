import {
  BUILT_IN_LIBRARIES,
  BUILT_IN_PLAYER_CLIPS,
  BUILT_IN_ROSTER,
  BUILT_IN_SONGS,
} from "./builtInAudio";

const STORAGE_KEY = "walk-up-announcer-state-v9";
export const WALKUP_TRIM_MS = 11000;

export const CLIP_GROUP_OPTIONS = [
  { id: "announcements", label: "Announcements" },
  { id: "positions", label: "Positions" },
  { id: "numbers", label: "Numbers" },
  { id: "effects", label: "Effects" },
];

export const PLAYER_SEQUENCE_OPTIONS = [
  { id: "announcement", label: "Announcement" },
  { id: "number", label: "Number" },
  { id: "name", label: "Name" },
  { id: "nickname", label: "Nickname" },
  { id: "position", label: "Position" },
  { id: "song", label: "Walk-Up Song" },
];

const DEFAULT_SEQUENCE = ["announcement", "number", "position", "name"];
export const TIMELINE_SNAP_MS = 100;
export const DEFAULT_TIMELINE_TRACKS = 2;
const DEFAULT_SLOT_DURATION_MS = {
  announcement: 1400,
  number: 900,
  name: 1100,
  nickname: 1100,
  position: 1300,
  song: WALKUP_TRIM_MS,
};

const DEFAULT_SLOT_RESET_SPACING_MS = {
  announcement: 1900,
  number: 1200,
  position: 1900,
  name: 2200,
  nickname: 1800,
  song: WALKUP_TRIM_MS,
};

export function deriveSequenceFromTimeline(timeline = []) {
  const sortedTimeline = [...timeline].sort((left, right) => left.startMs - right.startMs);
  return sortedTimeline.map((item) => item.slot);
}

function createTimelineItem(slot, startMs, track = 0, clipId = "") {
  return {
    id: crypto.randomUUID(),
    slot,
    startMs,
    track,
    clipId,
  };
}

export function getClipEffectiveDurationMs(slot, clip = null) {
  if (slot === "song") {
    return 15000;
  }

  if (Number.isFinite(clip?.duration) && clip.duration > 0) {
    return Math.round(clip.duration * 1000);
  }

  return DEFAULT_SLOT_DURATION_MS[slot] ?? 1200;
}

function buildTimelineFromSequence(playerLike = {}) {
  let cursorMs = 0;

  return (playerLike.sequence ?? DEFAULT_SEQUENCE).map((slot, index) => {
    const item = createTimelineItem(
      slot,
      cursorMs,
      index % DEFAULT_TIMELINE_TRACKS,
      slot === "announcement" ? playerLike.announcementClipId ?? "" : "",
    );
    cursorMs += DEFAULT_SLOT_RESET_SPACING_MS[slot] ?? DEFAULT_SLOT_DURATION_MS[slot] ?? 1500;
    return item;
  });
}

function createPlayer(name, jerseyNumber, positionLabel) {
  const timeline = buildTimelineFromSequence({ sequence: DEFAULT_SEQUENCE });
  return {
    id: crypto.randomUUID(),
    name,
    jerseyNumber,
    positionLabel,
    nameClip: null,
    nicknameClip: null,
    songClip: null,
    announcementClipId: "",
    numberClipId: "",
    positionClipId: "",
    sequence: deriveSequenceFromTimeline(timeline),
    timeline,
  };
}

function getPlayerClipBySlot(player, slot, libraries, item = null) {
  const libraryMap = {
    announcement: libraries.announcements.find(
      (clip) => clip.id === (item?.clipId || player.announcementClipId),
    ),
    number: libraries.numbers.find((clip) => clip.id === player.numberClipId),
    position: libraries.positions.find((clip) => clip.id === player.positionClipId),
    name: player.nameClip,
    nickname: player.nicknameClip,
    song: player.songClip,
  };

  return libraryMap[slot] ?? null;
}

function getBuiltInPlayerClip(playerName) {
  const key = playerName.toLowerCase().replace(/\s+/g, "_");
  return BUILT_IN_PLAYER_CLIPS[key] ?? null;
}

function normalizeOwnedClip(clip, fallbackBuiltInClip = null) {
  if (!clip) {
    return fallbackBuiltInClip;
  }

  if (clip.builtIn) {
    if (fallbackBuiltInClip && clip.group === fallbackBuiltInClip.group) {
      return fallbackBuiltInClip;
    }

    if (clip.group === "songs") {
      return BUILT_IN_LIBRARIES.songs.find((builtInClip) => builtInClip.id === clip.id) ?? clip;
    }
  }

  if (clip.group === "songs") {
    return {
      ...clip,
      trimStartMs: Math.max(0, Number(clip.trimStartMs) || 0),
    };
  }

  return clip;
}

function mergeLibraryClips(builtIns, saved = []) {
  const savedCustom = saved.filter((clip) => !clip?.builtIn);
  return [...builtIns, ...savedCustom];
}

export function createEmptyState() {
  return {
    libraries: BUILT_IN_LIBRARIES,
    players: BUILT_IN_ROSTER.map((player) => ({
      ...createPlayer(player.name, player.jerseyNumber, player.positionLabel),
      ...player,
    })),
    queue: [],
    settings: {
      volume: 0.82,
      fadeMs: 400,
      search: "",
      soundboardView: "players",
      libraryGroup: "announcements",
    },
  };
}

function normalizePlayer(player) {
  const normalizedName = player.name ?? "";
  const builtInNameClip = getBuiltInPlayerClip(normalizedName);
  const normalizedPlayer = {
    id: player.id ?? crypto.randomUUID(),
    name: normalizedName,
    jerseyNumber: player.jerseyNumber ?? player.number ?? "",
    positionLabel: player.positionLabel ?? player.position ?? "",
    nameClip: normalizeOwnedClip(player.nameClip, builtInNameClip),
    nicknameClip: normalizeOwnedClip(player.nicknameClip, null),
    songClip: normalizeOwnedClip(player.songClip, null),
    announcementClipId: player.announcementClipId ?? "",
    numberClipId: player.numberClipId ?? "",
    positionClipId: player.positionClipId ?? "",
    sequence:
      Array.isArray(player.sequence) && player.sequence.length > 0
        ? player.sequence
        : DEFAULT_SEQUENCE,
  };

  const resetSequencePlayer = {
    ...normalizedPlayer,
    sequence: DEFAULT_SEQUENCE,
  };
  const normalizedTimeline = buildTimelineFromSequence(resetSequencePlayer);

  return {
    ...resetSequencePlayer,
    sequence: deriveSequenceFromTimeline(normalizedTimeline),
    timeline: normalizedTimeline,
  };
}

export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyState();
    }

    const parsed = JSON.parse(raw);
    const empty = createEmptyState();

    return {
      ...empty,
      ...parsed,
      libraries: {
        announcements: mergeLibraryClips(
          BUILT_IN_LIBRARIES.announcements,
          parsed.libraries?.announcements,
        ),
        positions: mergeLibraryClips(
          BUILT_IN_LIBRARIES.positions,
          parsed.libraries?.positions,
        ),
        numbers: mergeLibraryClips(BUILT_IN_LIBRARIES.numbers, parsed.libraries?.numbers),
        songs: mergeLibraryClips(BUILT_IN_LIBRARIES.songs, parsed.libraries?.songs),
        effects: mergeLibraryClips(BUILT_IN_LIBRARIES.effects, parsed.libraries?.effects),
      },
      players: (parsed.players ?? empty.players).map(normalizePlayer),
      settings: {
        ...empty.settings,
        ...(parsed.settings ?? {}),
      },
    };
  } catch {
    return createEmptyState();
  }
}

export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function createClipRecord({ file, duration, group, nickname }) {
  return {
    id: crypto.randomUUID(),
    group,
    nickname: nickname?.trim() || file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    duration,
    trimStartMs: group === "songs" ? 0 : undefined,
    createdAt: Date.now(),
    dataUrl: null,
  };
}

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "--:--";
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${mins}:${secs}`;
}

export function resolvePlayerSequence(player, libraries) {
  const timeline = Array.isArray(player.timeline) && player.timeline.length > 0
    ? player.timeline
    : buildTimelineFromSequence(player);

  return [...timeline]
    .sort((left, right) => left.startMs - right.startMs)
    .map((item) => {
      const clip = getPlayerClipBySlot(player, item.slot, libraries, item);
      const durationMs = getClipEffectiveDurationMs(item.slot, clip);
      return clip
        ? {
            ...clip,
            slot: item.slot,
            timelineItemId: item.id,
            timelineClipId: item.clipId ?? "",
            startMs: item.startMs,
            track: item.track,
            durationMs,
            endMs: item.startMs + durationMs,
            playerId: player.id,
            playerName: player.name,
          }
        : null;
    })
    .filter(Boolean);
}

export function getPlayerStatus(player) {
  const filled = [
    Boolean(player.announcementClipId),
    Boolean(player.numberClipId),
    Boolean(player.positionClipId),
    Boolean(player.nameClip),
    Boolean(player.nicknameClip),
    Boolean(player.songClip),
  ].filter(Boolean).length;

  return {
    configuredCount: filled,
    isReady: filled > 0,
  };
}

export function getFreestyleGroups(players, libraries) {
  return {
    announcements: libraries.announcements,
    positions: libraries.positions,
    numbers: libraries.numbers,
    names: players
      .filter((player) => player.nameClip?.dataUrl || player.nameClip?.src)
      .map((player) => ({
        ...player.nameClip,
        playerId: player.id,
        playerName: player.name,
      })),
    nicknames: players
      .filter((player) => player.nicknameClip?.dataUrl || player.nicknameClip?.src)
      .map((player) => ({
        ...player.nicknameClip,
        playerId: player.id,
        playerName: player.name,
      })),
    songs: [
      ...libraries.songs,
      ...players
        .filter((player) => player.songClip?.dataUrl || player.songClip?.src)
        .map((player) => ({
          ...player.songClip,
          playerId: player.id,
          playerName: player.name,
        })),
    ],
    effects: libraries.effects,
  };
}

export function getClipByReference({ group, clipId, playerId, libraries, players }) {
  if (group === "names") {
    return players.find((player) => player.id === playerId)?.nameClip ?? null;
  }

  if (group === "songs") {
    return players.find((player) => player.id === playerId)?.songClip ??
      libraries.songs?.find((clip) => clip.id === clipId) ??
      null;
  }

  if (group === "nicknames") {
    return players.find((player) => player.id === playerId)?.nicknameClip ?? null;
  }

  return libraries[group]?.find((clip) => clip.id === clipId) ?? null;
}
