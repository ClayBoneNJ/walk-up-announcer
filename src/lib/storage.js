import {
  BUILT_IN_LIBRARIES,
  BUILT_IN_PLAYER_CLIPS,
  BUILT_IN_ROSTER,
  BUILT_IN_SONGS,
} from "./builtInAudio";
import defaultTeamData from "./defaultTeamData.json";

const STORAGE_KEY = "walk-up-announcer-state-v10";
export const WALKUP_TRIM_MS = 15000;
export const MIN_WALKUP_TRIM_MS = 1000;

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

function normalizeTimelineItem(item, index = 0, fallbackAnnouncementClipId = "") {
  const fallbackSlot = DEFAULT_SEQUENCE[index] ?? DEFAULT_SEQUENCE[0];
  const slot = PLAYER_SEQUENCE_OPTIONS.some((option) => option.id === item?.slot)
    ? item.slot
    : fallbackSlot;

  return {
    id: item?.id ?? crypto.randomUUID(),
    slot,
    startMs: Math.max(0, Number(item?.startMs) || 0),
    track: Math.max(0, Math.round(Number(item?.track) || 0)),
    clipId:
      slot === "announcement"
        ? item?.clipId ?? fallbackAnnouncementClipId ?? ""
        : item?.clipId ?? "",
  };
}

export function getClipEffectiveDurationMs(slot, clip = null) {
  if (slot === "song") {
    return getSongClipDurationMs(clip);
  }

  if (Number.isFinite(clip?.duration) && clip.duration > 0) {
    return Math.round(clip.duration * 1000);
  }

  return DEFAULT_SLOT_DURATION_MS[slot] ?? 1200;
}

export function buildTimelineFromSequence(playerLike = {}) {
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

  let resolvedClip = clip;

  if (clip.builtIn) {
    if (fallbackBuiltInClip && clip.group === fallbackBuiltInClip.group) {
      resolvedClip = fallbackBuiltInClip;
    } else if (clip.group === "songs") {
      const matchingBuiltInSong =
        BUILT_IN_LIBRARIES.songs.find((builtInClip) => builtInClip.id === clip.id) ?? null;
      const keepAssignedSongSource =
        matchingBuiltInSong &&
        (
          (clip.src && clip.src !== matchingBuiltInSong.src) ||
          (clip.fileName && clip.fileName !== matchingBuiltInSong.fileName) ||
          (clip.mimeType && clip.mimeType !== matchingBuiltInSong.mimeType)
        );

      resolvedClip = keepAssignedSongSource ? clip : matchingBuiltInSong ?? clip;
    }
  }

  if (resolvedClip.group === "songs") {
    const savedOverrides = {
      trimStartMs: clip.trimStartMs,
      trimEndMs: clip.trimEndMs,
      fadeInEndMs: clip.fadeInEndMs,
      fadeOutStartMs: clip.fadeOutStartMs,
      fadeOutEndMs: clip.fadeOutEndMs,
    };
    const songClip = {
      ...resolvedClip,
      ...savedOverrides,
    };
    const totalDurationMs = Number.isFinite(resolvedClip.duration) && resolvedClip.duration > 0
      ? Math.round(resolvedClip.duration * 1000)
      : 0;
    const trimStartMs = Math.max(0, Number(songClip.trimStartMs) || 0);
    const defaultTrimEndMs =
      totalDurationMs > 0 ? Math.min(totalDurationMs, trimStartMs + WALKUP_TRIM_MS) : trimStartMs + WALKUP_TRIM_MS;
    const trimEndMs = Math.max(
      trimStartMs + MIN_WALKUP_TRIM_MS,
      Number(songClip.trimEndMs) || defaultTrimEndMs,
    );
    const clampedTrimEndMs = totalDurationMs > 0 ? Math.min(trimEndMs, totalDurationMs) : trimEndMs;
    const defaultFadeInEndMs = Math.min(clampedTrimEndMs, trimStartMs + 800);
    const fadeInEndMs = Math.min(
      clampedTrimEndMs,
      Math.max(trimStartMs, Number(songClip.fadeInEndMs) || defaultFadeInEndMs),
    );
    const defaultFadeOutStartMs = Math.max(trimStartMs, clampedTrimEndMs - 1200);
    const fadeOutStartMs = Math.min(
      clampedTrimEndMs,
      Math.max(trimStartMs, Number(songClip.fadeOutStartMs) || defaultFadeOutStartMs),
    );
    const fadeOutEndMs = Math.min(
      clampedTrimEndMs,
      Math.max(fadeOutStartMs, Number(songClip.fadeOutEndMs) || clampedTrimEndMs),
    );

    return {
      ...songClip,
      trimStartMs,
      trimEndMs: clampedTrimEndMs,
      fadeInEndMs,
      fadeOutStartMs,
      fadeOutEndMs,
    };
  }

  return resolvedClip;
}

function mergeLibraryClips(builtIns, saved = []) {
  const savedCustom = saved.filter((clip) => !clip?.builtIn);
  return [...builtIns, ...savedCustom];
}

function dedupeClipsByIdentity(clips = []) {
  const byIdentity = new Map();

  clips.forEach((clip) => {
    const identity = [
      clip?.id || "",
      clip?.src || "",
      clip?.dataUrl || "",
      clip?.fileName || "",
      clip?.nickname || "",
    ].join("::");

    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, clip);
      return;
    }

    const existing = byIdentity.get(identity);
    const clipHasSongOverrides = clip?.group === "songs" && (
      Number.isFinite(Number(clip?.trimStartMs)) ||
      Number.isFinite(Number(clip?.trimEndMs)) ||
      Number.isFinite(Number(clip?.fadeInEndMs)) ||
      Number.isFinite(Number(clip?.fadeOutStartMs)) ||
      Number.isFinite(Number(clip?.fadeOutEndMs))
    );

    // Preserve assignment context and player-specific trim/fade overrides when a player-owned
    // duplicate matches a library clip.
    if ((!existing?.playerName && clip?.playerName) || clipHasSongOverrides) {
      byIdentity.set(identity, {
        ...existing,
        ...clip,
        playerId: clip.playerId ?? existing?.playerId,
        playerName: clip.playerName ?? existing?.playerName,
      });
    }
  });

  return [...byIdentity.values()];
}

export function createEmptyState() {
  const defaultPlayers = Array.isArray(defaultTeamData?.players) && defaultTeamData.players.length > 0
    ? defaultTeamData.players
    : BUILT_IN_ROSTER;
  const defaultLibraries = defaultTeamData?.libraries ?? BUILT_IN_LIBRARIES;

  return {
    libraries: normalizeLibraries(defaultLibraries),
    players: defaultPlayers.map((player) => normalizePlayer({
      ...createPlayer(player.name, player.jerseyNumber, player.positionLabel),
      ...player,
    })),
    publishedRevision: defaultTeamData?.publishedRevision ?? "",
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

export function normalizePlayer(player) {
  const normalizedName = player.name ?? "";
  const builtInNameClip = getBuiltInPlayerClip(normalizedName);
  const normalizedSequence =
    Array.isArray(player.sequence) && player.sequence.length > 0
      ? player.sequence.filter((slot) =>
          PLAYER_SEQUENCE_OPTIONS.some((option) => option.id === slot),
        )
      : DEFAULT_SEQUENCE;
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
    sequence: normalizedSequence.length > 0 ? normalizedSequence : DEFAULT_SEQUENCE,
  };

  const normalizedTimeline =
    Array.isArray(player.timeline) && player.timeline.length > 0
      ? player.timeline.map((item, index) =>
          normalizeTimelineItem(item, index, normalizedPlayer.announcementClipId),
        )
      : buildTimelineFromSequence(normalizedPlayer);

  return {
    ...normalizedPlayer,
    sequence: deriveSequenceFromTimeline(normalizedTimeline),
    timeline: normalizedTimeline,
  };
}

function normalizeLibraries(libraries = {}) {
  return {
    announcements: mergeLibraryClips(
      BUILT_IN_LIBRARIES.announcements,
      libraries.announcements,
    ),
    positions: mergeLibraryClips(
      BUILT_IN_LIBRARIES.positions,
      libraries.positions,
    ),
    numbers: mergeLibraryClips(BUILT_IN_LIBRARIES.numbers, libraries.numbers),
    songs: mergeLibraryClips(BUILT_IN_LIBRARIES.songs, libraries.songs),
    effects: mergeLibraryClips(BUILT_IN_LIBRARIES.effects, libraries.effects),
  };
}

function createLocalPlayerOverride(player, index) {
  return {
    id: player.id ?? "",
    order: index,
    jerseyNumber: player.jerseyNumber ?? player.number ?? "",
    positionLabel: player.positionLabel ?? player.position ?? "",
    numberClipId: player.numberClipId ?? "",
    positionClipId: player.positionClipId ?? "",
  };
}

function applyLocalPlayerOverrides(basePlayers = [], savedOverrides = []) {
  const overridesById = new Map(
    (savedOverrides ?? [])
      .filter((override) => override?.id)
      .map((override, index) => [
        override.id,
        {
          order: Number.isFinite(Number(override.order)) ? Number(override.order) : index,
          jerseyNumber: override.jerseyNumber ?? override.number ?? "",
          positionLabel: override.positionLabel ?? override.position ?? "",
          numberClipId: override.numberClipId ?? "",
          positionClipId: override.positionClipId ?? "",
        },
      ]),
  );

  const mergedPlayers = (basePlayers ?? []).map((player, index) => {
    const override = overridesById.get(player.id);
    return {
      order: override?.order ?? index,
      player: normalizePlayer({
        ...player,
        jerseyNumber: override?.jerseyNumber ?? player.jerseyNumber,
        positionLabel: override?.positionLabel ?? player.positionLabel,
        numberClipId: override?.numberClipId ?? player.numberClipId,
        positionClipId: override?.positionClipId ?? player.positionClipId,
      }),
    };
  });

  return mergedPlayers
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.player);
}

export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyState();
    }

    const parsed = JSON.parse(raw);
    const empty = createEmptyState();
    const savedOverrides = parsed.playerOverrides ?? parsed.players ?? [];

    const loadedState = {
      ...empty,
      players: applyLocalPlayerOverrides(empty.players, savedOverrides),
      publishedRevision: empty.publishedRevision ?? parsed.publishedRevision ?? "",
      settings: empty.settings,
    };

    return loadedState;
  } catch {
    return createEmptyState();
  }
}

export function saveState(state) {
  try {
    const empty = createEmptyState();
    const normalizedState = {
      schemaVersion: 2,
      publishedRevision: state.publishedRevision ?? empty.publishedRevision ?? "",
      playerOverrides: (state.players ?? empty.players).map((player, index) =>
        createLocalPlayerOverride(normalizePlayer(player), index),
      ),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
    return true;
  } catch {
    return false;
  }
}

export function createClipRecord({ file, duration, group, nickname }) {
  const durationMs = Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : 0;
  const trimEndMs = group === "songs"
    ? durationMs > 0
      ? Math.min(durationMs, WALKUP_TRIM_MS)
      : WALKUP_TRIM_MS
    : undefined;

  return {
    id: crypto.randomUUID(),
    group,
    nickname: nickname?.trim() || file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    duration,
    trimStartMs: group === "songs" ? 0 : undefined,
    trimEndMs,
    fadeInEndMs: group === "songs" ? Math.min(trimEndMs ?? WALKUP_TRIM_MS, 800) : undefined,
    fadeOutStartMs: group === "songs" ? Math.max(0, (trimEndMs ?? WALKUP_TRIM_MS) - 1200) : undefined,
    fadeOutEndMs: group === "songs" ? trimEndMs : undefined,
    createdAt: Date.now(),
    dataUrl: null,
  };
}

export function getSongClipDurationMs(clip = null) {
  if (!clip) {
    return WALKUP_TRIM_MS;
  }

  const trimStartMs = Math.max(0, Number(clip.trimStartMs) || 0);
  const trimEndMs = Math.max(trimStartMs + MIN_WALKUP_TRIM_MS, Number(clip.trimEndMs) || (trimStartMs + WALKUP_TRIM_MS));
  return trimEndMs - trimStartMs;
}

export function createPublishedTeamSnapshot(state, publishedRevision = Date.now()) {
  return {
    schemaVersion: 1,
    publishedRevision,
    players: state.players ?? [],
    libraries: state.libraries ?? BUILT_IN_LIBRARIES,
  };
}

export function applyPublishedTeamSnapshot(currentState, snapshot) {
  if (!snapshot?.publishedRevision) {
    return currentState;
  }

  const empty = createEmptyState();
  const currentOverrides = (currentState?.players ?? []).map((player, index) =>
    createLocalPlayerOverride(normalizePlayer(player), index),
  );

  return {
    ...currentState,
    libraries: normalizeLibraries(snapshot.libraries ?? empty.libraries),
    players: applyLocalPlayerOverrides(snapshot.players ?? empty.players, currentOverrides),
    publishedRevision: snapshot.publishedRevision,
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
  const groupedPositions = new Map();

  players.forEach((player) => {
    const clip = libraries.positions.find((item) => item.id === player.positionClipId);
    if (!clip?.dataUrl && !clip?.src) {
      return;
    }

    const identity = [
      clip.id || "",
      clip.src || "",
      clip.dataUrl || "",
      clip.fileName || "",
      clip.nickname || "",
    ].join("::");

    const existing = groupedPositions.get(identity);
    if (existing) {
      existing.playerIds.push(player.id);
      existing.playerNames.push(player.name);
      existing.playerJerseyNumbers.push(player.jerseyNumber);
      return;
    }

    groupedPositions.set(identity, {
      ...clip,
      playerId: player.id,
      playerName: player.name,
      playerJerseyNumber: player.jerseyNumber,
      playerIds: [player.id],
      playerNames: [player.name],
      playerJerseyNumbers: [player.jerseyNumber],
    });
  });

  return {
    announcements: libraries.announcements,
    positions: [...groupedPositions.values()],
    numbers: players
      .map((player) => {
        const clip = libraries.numbers.find((item) => item.id === player.numberClipId);
        if (!clip?.dataUrl && !clip?.src) {
          return null;
        }
        return {
          ...clip,
          playerId: player.id,
          playerName: player.name,
          playerJerseyNumber: player.jerseyNumber,
        };
      })
      .filter(Boolean),
    names: players
      .filter((player) => player.nameClip?.dataUrl || player.nameClip?.src)
      .map((player) => ({
        ...player.nameClip,
        playerId: player.id,
        playerName: player.name,
        playerJerseyNumber: player.jerseyNumber,
      })),
    nicknames: players
      .filter((player) => player.nicknameClip?.dataUrl || player.nicknameClip?.src)
      .map((player) => ({
        ...player.nicknameClip,
        playerId: player.id,
        playerName: player.name,
        playerJerseyNumber: player.jerseyNumber,
      })),
    songs: dedupeClipsByIdentity(
      players
        .filter((player) => player.songClip?.dataUrl || player.songClip?.src)
        .map((player) => ({
          ...player.songClip,
          playerId: player.id,
          playerName: player.name,
          playerJerseyNumber: player.jerseyNumber,
        })),
    ),
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
