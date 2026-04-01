import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Pause, Play, Plus, Trash2, Upload } from "lucide-react";
import { getAudioDuration, getAudioWaveformPeaks } from "../lib/audio";
import { BUILT_IN_PLAYER_CLIPS } from "../lib/builtInAudio";
import {
  buildTimelineFromSequence,
  CLIP_GROUP_OPTIONS,
  createClipRecord,
  deriveSequenceFromTimeline,
  fileToDataUrl,
  formatDuration,
  getClipEffectiveDurationMs,
  getPlayerStatus,
  getSongClipDurationMs,
  MIN_WALKUP_TRIM_MS,
  PLAYER_SEQUENCE_OPTIONS,
  resolvePlayerSequence,
  TIMELINE_SNAP_MS,
  WALKUP_TRIM_MS,
} from "../lib/storage";

const SETUP_TABS = [
  { id: "roster", label: "Roster" },
  { id: "events", label: "Events" },
  { id: "upload", label: "Upload Audio" },
];

const ROSTER_SEQUENCE_SLOTS = ["announcement", "number", "name", "nickname", "position", "song"];
const TIMELINE_PIXELS_PER_MS = 0.06;
const TIMELINE_MIN_DURATION_MS = 6000;
const TIMELINE_SIDE_PADDING_MS = 1500;
const TIMELINE_MOBILE_MIN_WIDTH = 280;
const SONG_EDITOR_SNAP_MS = 500;

const TRACK_CONFIG = [
  { id: 0, label: "Track 1" },
  { id: 1, label: "Track 2" },
];

const SLOT_TONES = {
  announcement: {
    block:
      "border-emerald-300/30 bg-[linear-gradient(135deg,rgba(34,197,94,0.9),rgba(16,185,129,0.72))] text-emerald-950 shadow-[0_16px_30px_rgba(16,185,129,0.22)]",
    chip: "bg-emerald-950/12 text-emerald-950/80",
  },
  number: {
    block:
      "border-sky-300/26 bg-[linear-gradient(135deg,rgba(56,189,248,0.78),rgba(14,165,233,0.62))] text-sky-950 shadow-[0_16px_30px_rgba(14,165,233,0.18)]",
    chip: "bg-sky-950/12 text-sky-950/80",
  },
  name: {
    block:
      "border-fuchsia-300/26 bg-[linear-gradient(135deg,rgba(232,121,249,0.8),rgba(217,70,239,0.62))] text-fuchsia-950 shadow-[0_16px_30px_rgba(217,70,239,0.18)]",
    chip: "bg-fuchsia-950/12 text-fuchsia-950/80",
  },
  nickname: {
    block:
      "border-rose-300/26 bg-[linear-gradient(135deg,rgba(251,113,133,0.8),rgba(244,63,94,0.62))] text-rose-950 shadow-[0_16px_30px_rgba(244,63,94,0.18)]",
    chip: "bg-rose-950/12 text-rose-950/80",
  },
  position: {
    block:
      "border-amber-300/26 bg-[linear-gradient(135deg,rgba(250,204,21,0.82),rgba(245,158,11,0.62))] text-amber-950 shadow-[0_16px_30px_rgba(245,158,11,0.18)]",
    chip: "bg-amber-950/12 text-amber-950/80",
  },
  song: {
    block:
      "border-red-300/28 bg-[linear-gradient(135deg,rgba(248,113,113,0.86),rgba(239,68,68,0.64))] text-red-950 shadow-[0_16px_30px_rgba(239,68,68,0.2)]",
    chip: "bg-red-950/12 text-red-950/80",
  },
};

function createTimelineItem(slot, startMs = 0, track = 0, clipId = "") {
  return {
    id: crypto.randomUUID(),
    slot,
    startMs,
    track,
    clipId,
  };
}

function getBuiltInNameClip(playerName = "") {
  const key = String(playerName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  return BUILT_IN_PLAYER_CLIPS[key] ?? null;
}

function createPlayerDraft(overrides = {}) {
  const incomingTimeline = Array.isArray(overrides.timeline) ? overrides.timeline : [];
  const normalizedTimeline =
    incomingTimeline.length > 0
      ? incomingTimeline
      : [
          createTimelineItem("announcement", 0, 0, overrides.announcementClipId ?? ""),
          createTimelineItem("number", 1400, 1),
          createTimelineItem("position", 2300, 0),
          createTimelineItem("name", 3600, 1),
        ];

  const nextDraft = {
    name: "",
    jerseyNumber: "",
    positionLabel: "",
    announcementClipId: "",
    numberClipId: "",
    positionClipId: "",
    nameClip: getBuiltInNameClip(overrides.name),
    nicknameClip: null,
    songClip: null,
    timeline: normalizedTimeline,
    sequence: deriveSequenceFromTimeline(normalizedTimeline),
    ...overrides,
    nameClip: overrides.nameClip ?? getBuiltInNameClip(overrides.name),
  };

  return {
    ...nextDraft,
    timeline: normalizedTimeline,
    sequence: deriveSequenceFromTimeline(normalizedTimeline),
  };
}

function getAnnouncementSeedClipId(timeline = [], fallbackClipId = "", libraries = null) {
  const explicitAnnouncement = [...timeline]
    .reverse()
    .find((item) => item.slot === "announcement" && item.clipId)?.clipId;

  return explicitAnnouncement || fallbackClipId || libraries?.announcements?.[0]?.id || "";
}

function slotLabel(slot) {
  return PLAYER_SEQUENCE_OPTIONS.find((option) => option.id === slot)?.label ?? "Slot";
}

function formatMsTimestamp(valueMs = 0) {
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function parseMsTimestampInput(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes(":")) {
    const [minsPart, secsPart] = normalized.split(":");
    const mins = Number(minsPart);
    const secs = Number(secsPart);

    if (!Number.isFinite(mins) || !Number.isFinite(secs)) {
      return null;
    }

    return Math.round((Math.max(0, mins) * 60 + Math.max(0, secs)) * 1000);
  }

  const seconds = Number(normalized);
  if (!Number.isFinite(seconds)) {
    return null;
  }

  return Math.round(Math.max(0, seconds) * 1000);
}

function getTimelineItemValue(item, draft) {
  switch (item.slot) {
    case "announcement":
      return item.nickname || "Select announcement";
    case "number":
      return draft.jerseyNumber ? `#${draft.jerseyNumber}` : "Choose jersey";
    case "name":
      return draft.nameClip?.nickname ?? "Upload name clip";
    case "nickname":
      return draft.nicknameClip?.nickname ?? "Upload nickname clip";
    case "position":
      return draft.positionLabel || "Choose position";
    case "song":
      return draft.songClip?.nickname ?? "Upload walk-up";
    default:
      return "Clip";
  }
}

function getDefaultTrackForSlot(slot) {
  return slot === "song" || slot === "announcement" ? 0 : 1;
}

function getTimelineItemDurationMs(item, draft, libraries, durationLookup = {}) {
  const clip = getDraftClipForItem(item, draft, libraries);
  const clipKey = clip?.dataUrl ?? clip?.src ?? clip?.id ?? "";
  const measuredDurationMs = clipKey ? durationLookup[clipKey] : null;

  if (item.slot === "song") {
    return getClipEffectiveDurationMs(item.slot, clip);
  }

  if (Number.isFinite(measuredDurationMs) && measuredDurationMs > 0) {
    return measuredDurationMs;
  }

  return getClipEffectiveDurationMs(item.slot, clip);
}

function getNextTimelineStartMs(
  timeline = [],
  draft,
  libraries,
  durationLookup = {},
  fallbackMs = 0,
  targetTrack = null,
) {
  const relevantTimeline =
    targetTrack == null ? timeline : timeline.filter((item) => item.track === targetTrack);

  if (!relevantTimeline.length) {
    return fallbackMs;
  }

  const furthestEndMs = relevantTimeline.reduce((maxValue, item) => {
    return Math.max(
      maxValue,
      item.startMs + getTimelineItemDurationMs(item, draft, libraries, durationLookup),
    );
  }, 0);

  return furthestEndMs + TIMELINE_SNAP_MS;
}

function getDraftClipForItem(item, draft, libraries) {
  switch (item.slot) {
    case "announcement":
      return (
        libraries.announcements.find((clip) => clip.id === (item.clipId || draft.announcementClipId)) ??
        null
      );
    case "number":
      return libraries.numbers.find((clip) => clip.id === draft.numberClipId) ?? null;
    case "position":
      return libraries.positions.find((clip) => clip.id === draft.positionClipId) ?? null;
    case "name":
      return draft.nameClip ?? null;
    case "nickname":
      return draft.nicknameClip ?? null;
    case "song":
      return draft.songClip ?? null;
    default:
      return null;
  }
}

function normalizeTimelineLayout(timeline, draft, libraries, durationLookup = {}) {
  const byTrack = TRACK_CONFIG.map((track) => {
    const trackItems = timeline
      .filter((item) => item.track === track.id)
      .sort((left, right) => left.startMs - right.startMs);

    return trackItems.reduce((accumulator, item, index) => {
      if (index === 0) {
        accumulator.push({ ...item, startMs: Math.max(0, item.startMs) });
        return accumulator;
      }

      const previous = accumulator[accumulator.length - 1];
      const previousEndMs =
        Math.max(0, previous.startMs) +
        getTimelineItemDurationMs(previous, draft, libraries, durationLookup);

      accumulator.push({
        ...item,
        startMs: Math.max(previousEndMs, item.startMs),
      });

      return accumulator;
    }, []);
  }).flat();

  return timeline.map((item) => byTrack.find((candidate) => candidate.id === item.id) ?? item);
}

function compactTimelineSequence(timeline, draft, libraries, durationLookup = {}) {
  const sortedTimeline = [...timeline].sort((left, right) => left.startMs - right.startMs);
  let cursorMs = 0;

  return sortedTimeline.map((item) => {
    const nextItem = {
      ...item,
      startMs: cursorMs,
    };

    cursorMs += getTimelineItemDurationMs(nextItem, draft, libraries, durationLookup);
    return nextItem;
  });
}

function retimeTimelineAfterDurationChange(
  timeline,
  previousDraft,
  nextDraft,
  libraries,
  durationLookup = {},
  matcher,
) {
  const sortedTimeline = [...timeline].sort((left, right) => left.startMs - right.startMs);
  const changedIndex = sortedTimeline.findIndex(matcher);

  if (changedIndex === -1) {
    return timeline;
  }

  const changedItem = sortedTimeline[changedIndex];
  const previousDurationMs = getTimelineItemDurationMs(
    changedItem,
    previousDraft,
    libraries,
    durationLookup,
  );
  const nextDurationMs = getTimelineItemDurationMs(
    changedItem,
    nextDraft,
    libraries,
    durationLookup,
  );
  const deltaMs = nextDurationMs - previousDurationMs;

  if (!deltaMs) {
    return timeline;
  }

  const shiftedIds = new Set(sortedTimeline.slice(changedIndex + 1).map((item) => item.id));

  return timeline.map((item) =>
    shiftedIds.has(item.id)
      ? { ...item, startMs: Math.max(0, item.startMs + deltaMs) }
      : item,
  );
}

export function PlayerManager({
  players,
  libraries,
  searchValue,
  libraryGroup,
  onLibraryGroupChange,
  onSearchChange,
  onAddPlayer,
  onUpdatePlayer,
  onRemovePlayer,
  onAddLibraryClip,
  onRemoveLibraryClip,
  onQueueClip,
  onPlayPlayer,
  onPreviewClip,
  onPreviewSequence,
  activePlayback,
  isPlaybackPaused,
  playbackTimeMs,
  onTogglePause,
  onDownloadTeamSnapshot,
  editingPlayerId,
  onEditingPlayerHandled,
  editingReturnTab,
  onEditingReturnHandled,
}) {
  const [setupTab, setSetupTab] = useState("roster");
  const [rosterModal, setRosterModal] = useState(null);
  const [playerDraft, setPlayerDraft] = useState(() => createPlayerDraft());
  const [libraryForm, setLibraryForm] = useState({
    nickname: "",
  });

  const activeLibrary = libraries[libraryGroup] ?? [];

  const openAddPlayerModal = () => {
    setPlayerDraft(createPlayerDraft());
    setRosterModal({ mode: "add", playerId: null });
  };

  const openEditPlayerModal = (player) => {
    setSetupTab("roster");
    setPlayerDraft(createPlayerDraft(player));
    setRosterModal({ mode: "edit", playerId: player.id });
  };

  const closeRosterModal = () => {
    setRosterModal(null);
    setPlayerDraft(createPlayerDraft());
    if (editingReturnTab) {
      onEditingReturnHandled?.();
    }
  };

  useEffect(() => {
    if (!editingPlayerId) {
      return;
    }

    const player = players.find((entry) => entry.id === editingPlayerId);
    if (!player) {
      onEditingPlayerHandled?.();
      return;
    }

    openEditPlayerModal(player);
    onEditingPlayerHandled?.();
  }, [editingPlayerId, players]);

  const handlePlayerSubmit = (event, submittedDraft = playerDraft) => {
    event.preventDefault();
    if (!submittedDraft.name.trim()) return;

    const trimmedName = submittedDraft.name.trim();
    const restoredNameClip = submittedDraft.nameClip ?? getBuiltInNameClip(trimmedName);
    const nextPlayerDraft = {
      ...submittedDraft,
      name: trimmedName,
      jerseyNumber: submittedDraft.jerseyNumber.trim(),
      positionLabel: submittedDraft.positionLabel.trim(),
      nameClip: restoredNameClip,
      sequence: deriveSequenceFromTimeline(submittedDraft.timeline ?? []),
    };

    if (rosterModal?.mode === "edit" && rosterModal.playerId) {
      onUpdatePlayer(rosterModal.playerId, (current) => ({
        ...current,
        ...nextPlayerDraft,
      }));
      closeRosterModal();
      return;
    }

    onAddPlayer({
      id: crypto.randomUUID(),
      ...nextPlayerDraft,
    });

    closeRosterModal();
  };

  const handleLibraryUpload = async (file) => {
    const duration = await getAudioDuration(file);
    const clip = createClipRecord({
      file,
      duration,
      group: libraryGroup,
      nickname: libraryForm.nickname,
    });
    clip.dataUrl = await fileToDataUrl(file);
    onAddLibraryClip(libraryGroup, clip);
    setLibraryForm({ nickname: "" });
  };

  return (
    <div className="space-y-4">
      <section className="glass-panel rounded-[2rem] border border-white/8 p-3">
        <div className="grid grid-cols-3 gap-2">
          {SETUP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSetupTab(tab.id)}
              className={`rounded-[1.4rem] px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition ${
                setupTab === tab.id
                  ? "bg-sky-400 text-slate-950"
                  : "bg-slate-950/50 text-slate-300 hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-[1.6rem] border border-white/8 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              Team Sync
            </div>
            <div className="mt-1 text-sm text-slate-400">
              App and code changes can ship anytime. Team data only changes on other devices when you download a snapshot and tell me to sync it.
            </div>
          </div>
          <button type="button" onClick={onDownloadTeamSnapshot} className="secondary-button">
            Download Team Snapshot
          </button>
        </div>
      </section>

      {setupTab === "roster" ? (
        <div className="space-y-4">
          <section className="glass-panel rounded-[2rem] border border-white/8 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
                  Team
                </div>
                <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
                  Roster
                </h2>
              </div>
              <input
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 sm:max-w-xs"
                placeholder="Filter players"
              />
            </div>

            <button
              type="button"
              onClick={openAddPlayerModal}
              className="primary-button mt-5 w-full justify-center rounded-[1.8rem] py-5 text-base"
            >
              <Plus className="h-5 w-5" />
              Add Player
            </button>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {players.map((player) => (
              <RosterRow
                key={player.id}
                player={player}
                onOpen={() => openEditPlayerModal(player)}
                onRemovePlayer={onRemovePlayer}
              />
            ))}

            {players.length === 0 ? (
              <div className="glass-panel rounded-[2rem] border border-dashed border-white/10 p-10 text-center text-slate-400">
                No players match the current filter.
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {setupTab === "events" ? (
        <section className="space-y-4">
          <div className="glass-panel rounded-[2rem] border border-white/8 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
                  Player Assignments
                </div>
                <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
                  Events And Sequences
                </h2>
              </div>
              <input
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 sm:max-w-xs"
                placeholder="Filter players"
              />
            </div>
          </div>

          <div className="grid gap-4">
            {players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                libraries={libraries}
                onUpdatePlayer={onUpdatePlayer}
                onRemovePlayer={onRemovePlayer}
                onQueueClip={onQueueClip}
                onPlayPlayer={onPlayPlayer}
              />
            ))}

            {players.length === 0 ? (
              <div className="glass-panel rounded-[2rem] border border-dashed border-white/10 p-10 text-center text-slate-400">
                No players match the current filter.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {setupTab === "upload" ? (
        <div className="grid gap-4 xl:grid-cols-[380px,1fr]">
          <section className="glass-panel rounded-[2rem] border border-white/8 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
                  Libraries
                </div>
                <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
                  Upload Audio
                </h2>
              </div>
              <select
                value={libraryGroup}
                onChange={(event) => onLibraryGroupChange(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
              >
                {CLIP_GROUP_OPTIONS.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
                Nickname
              </label>
              <input
                value={libraryForm.nickname}
                onChange={(event) => setLibraryForm({ nickname: event.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                placeholder="Now batting"
              />
            </div>

            <div className="mt-3">
              <Uploader buttonLabel={`Upload ${libraryGroup}`} onFile={handleLibraryUpload} />
            </div>
            <div className="mt-3 rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-3 text-sm text-slate-400">
              Built-in clips are preloaded from the project assets folder. Custom uploads are added after those and remain selectable.
            </div>
          </section>

          <section className="glass-panel rounded-[2rem] border border-white/8 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              Current Clips
            </div>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
              {CLIP_GROUP_OPTIONS.find((group) => group.id === libraryGroup)?.label}
            </h2>

            <div className="mt-4 space-y-3">
              {activeLibrary.map((clip) => (
                <LibraryRow
                  key={clip.id}
                  clip={clip}
                  onRemove={() => onRemoveLibraryClip(libraryGroup, clip.id)}
                  onQueue={() => onQueueClip({ group: libraryGroup, clip })}
                />
              ))}

              {activeLibrary.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
                  No clips loaded in this library yet.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {rosterModal ? (
        <RosterModal
          mode={rosterModal.mode}
          draft={playerDraft}
          setDraft={setPlayerDraft}
          libraries={libraries}
          onPreviewClip={onPreviewClip}
          onPreviewSequence={onPreviewSequence}
          activePlayback={activePlayback}
          isPlaybackPaused={isPlaybackPaused}
          playbackTimeMs={playbackTimeMs}
          onTogglePause={onTogglePause}
          onClose={closeRosterModal}
          onSubmit={handlePlayerSubmit}
        />
      ) : null}
    </div>
  );
}

function RosterRow({ player, onOpen, onRemovePlayer }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-panel rounded-[1.8rem] border border-white/8 p-4 text-left transition hover:border-sky-300/20 hover:bg-slate-900/70"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
            #{player.jerseyNumber || "--"} - {player.positionLabel || "Utility"}
          </div>
          <div className="mt-2 text-xl font-black uppercase tracking-[0.05em] text-white">
            {player.name}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemovePlayer(player.id);
          }}
          className="rounded-full border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20"
        >
          Remove
        </button>
      </div>
    </button>
  );
}

function RosterModal({
  mode,
  draft,
  setDraft,
  libraries,
  onPreviewClip,
  onPreviewSequence,
  activePlayback,
  isPlaybackPaused,
  playbackTimeMs,
  onTogglePause,
  onClose,
  onSubmit,
}) {
  const timelineScrollRef = useRef(null);
  const timelineViewportRef = useRef(null);
  const dragStateRef = useRef(null);
  const [draggedTimelineId, setDraggedTimelineId] = useState("");
  const [selectedTimelineId, setSelectedTimelineId] = useState("");
  const [clipDurationLookup, setClipDurationLookup] = useState({});
  const [sequenceAddValue, setSequenceAddValue] = useState("announcement");
  const [showSequenceAddPicker, setShowSequenceAddPicker] = useState(false);
  const [songTrimStartMs, setSongTrimStartMs] = useState(0);
  const [songTrimEndMs, setSongTrimEndMs] = useState(WALKUP_TRIM_MS);
  const [songFadeInEndMs, setSongFadeInEndMs] = useState(Math.min(WALKUP_TRIM_MS, 800));
  const [songFadeOutStartMs, setSongFadeOutStartMs] = useState(Math.max(0, WALKUP_TRIM_MS - 1200));
  const [songFadeOutEndMs, setSongFadeOutEndMs] = useState(WALKUP_TRIM_MS);
  const [showSongTrimModal, setShowSongTrimModal] = useState(false);
  const [timelineTouched, setTimelineTouched] = useState(mode === "edit");
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const jerseyOptions = useMemo(
    () =>
      libraries.numbers
        .map((clip) => clip.nickname.replace("#", ""))
        .filter(Boolean),
    [libraries.numbers],
  );

  const positionOptions = useMemo(
    () => libraries.positions.map((clip) => clip.nickname),
    [libraries.positions],
  );
  const draftBuiltInSongId = draft.songClip?.builtIn ? draft.songClip.id : "";

  const handleJerseyChange = (jerseyNumber) => {
    const matchingNumberClip = libraries.numbers.find(
      (clip) => clip.id === `number-${jerseyNumber}`,
    );

    setDraft((current) => {
      const nextDraft = {
        ...current,
        jerseyNumber,
        numberClipId: matchingNumberClip ? matchingNumberClip.id : "",
      };

      return {
        ...nextDraft,
        timeline: retimeTimelineAfterDurationChange(
          current.timeline ?? [],
          current,
          nextDraft,
          libraries,
          clipDurationLookup,
          (item) => item.slot === "number",
        ),
        sequence: deriveSequenceFromTimeline(
          retimeTimelineAfterDurationChange(
            current.timeline ?? [],
            current,
            nextDraft,
            libraries,
            clipDurationLookup,
            (item) => item.slot === "number",
          ),
        ),
      };
    });
  };

  const handlePositionChange = (positionLabel) => {
    const matchingPositionClip = libraries.positions.find(
      (clip) => clip.nickname === positionLabel,
    );

    setDraft((current) => {
      const nextDraft = {
        ...current,
        positionLabel,
        positionClipId: matchingPositionClip ? matchingPositionClip.id : "",
      };

      return {
        ...nextDraft,
        timeline: retimeTimelineAfterDurationChange(
          current.timeline ?? [],
          current,
          nextDraft,
          libraries,
          clipDurationLookup,
          (item) => item.slot === "position",
        ),
        sequence: deriveSequenceFromTimeline(
          retimeTimelineAfterDurationChange(
            current.timeline ?? [],
            current,
            nextDraft,
            libraries,
            clipDurationLookup,
            (item) => item.slot === "position",
          ),
        ),
      };
    });
  };

  const draftSequenceOptions = useMemo(() => {
    return [
      {
        id: "announcements",
        label: "Announcements",
        options: libraries.announcements.map((clip) => ({
          value: clip.id,
          label: clip.nickname,
        })),
      },
    ];
  }, [libraries.announcements]);

  const previewTimeline = useMemo(
    () => resolvePlayerSequence(draft, libraries),
    [draft, libraries],
  );

  const measuredTimeline = useMemo(
    () =>
      (draft.timeline ?? []).map((item) => {
        const clip = getDraftClipForItem(item, draft, libraries);
        const clipKey = clip?.dataUrl ?? clip?.src ?? clip?.id ?? "";
        const measuredDurationMs = clipDurationLookup[clipKey];
        const durationMs =
          item.slot !== "song" && Number.isFinite(measuredDurationMs) && measuredDurationMs > 0
            ? measuredDurationMs
            : getClipEffectiveDurationMs(item.slot, clip);

        return {
          ...(clip ?? {}),
          ...item,
          timelineItemId: item.id,
          timelineClipId: item.clipId ?? "",
          durationMs,
          endMs: item.startMs + durationMs,
        };
      }),
    [draft, libraries, clipDurationLookup],
  );

  const measuredPreviewTimeline = useMemo(
    () =>
      previewTimeline.map((item) => {
        const clipKey = item.dataUrl ?? item.src ?? item.id;
        const measuredDurationMs = clipDurationLookup[clipKey];
        const durationMs =
          item.slot !== "song" && Number.isFinite(measuredDurationMs) && measuredDurationMs > 0
            ? measuredDurationMs
            : item.durationMs;

        return {
          ...item,
          durationMs,
          endMs: item.startMs + durationMs,
        };
      }),
    [previewTimeline, clipDurationLookup],
  );

  useEffect(() => {
    let cancelled = false;

    const clipsToMeasure = measuredTimeline.filter((item) => {
      const clipKey = item.dataUrl ?? item.src ?? item.id;
      return clipKey && !clipDurationLookup[clipKey];
    });

    if (!clipsToMeasure.length) {
      return () => {
        cancelled = true;
      };
    }

    Promise.all(
      clipsToMeasure.map(
        (item) =>
          new Promise((resolve) => {
            const audio = new Audio();
            const clipKey = item.dataUrl ?? item.src ?? item.id;

            const cleanup = () => {
              audio.onloadedmetadata = null;
              audio.onerror = null;
              audio.removeAttribute("src");
              audio.load();
            };

            audio.onloadedmetadata = () => {
              const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
                ? Math.round(audio.duration * 1000)
                : item.durationMs;
              cleanup();
              resolve([clipKey, durationMs]);
            };

            audio.onerror = () => {
              cleanup();
              resolve([clipKey, item.durationMs]);
            };

            audio.src = item.dataUrl ?? item.src;
          }),
      ),
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      setClipDurationLookup((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [measuredTimeline, clipDurationLookup]);

  const timelineDurationMs = useMemo(() => {
    const maxEndMs = measuredTimeline.reduce((maxValue, item) => Math.max(maxValue, item.endMs), 0);
    return Math.max(TIMELINE_MIN_DURATION_MS, maxEndMs + TIMELINE_SIDE_PADDING_MS);
  }, [measuredTimeline]);
  const isCompactTimeline = timelineViewportWidth > 0 && timelineViewportWidth < 640;
  const desktopTimelineWidth = Math.max(
    Math.max(780, timelineViewportWidth || 0),
    Math.round(timelineDurationMs * TIMELINE_PIXELS_PER_MS),
  );
  const timelineWidth = isCompactTimeline
    ? Math.max(
        TIMELINE_MOBILE_MIN_WIDTH,
        (timelineViewportWidth || TIMELINE_MOBILE_MIN_WIDTH) - 8,
      )
    : desktopTimelineWidth;
  const timelinePixelsPerMs = Math.max(
    0.01,
    timelineWidth / Math.max(timelineDurationMs, 1),
  );
  const selectedTimelineItem =
    measuredTimeline.find((item) => item.timelineItemId === selectedTimelineId) ?? null;
  const selectedAnnouncementClipId =
    selectedTimelineItem?.slot === "announcement"
      ? selectedTimelineItem.timelineClipId || ""
      : "";
  const songClipKey = draft.songClip?.dataUrl ?? draft.songClip?.src ?? draft.songClip?.id ?? "";
  const measuredSongClipDurationMs = songClipKey ? clipDurationLookup[songClipKey] : 0;
  const songClipDurationMs = Math.max(
    0,
    Number.isFinite(measuredSongClipDurationMs) && measuredSongClipDurationMs > 0
      ? measuredSongClipDurationMs
      : Math.round((draft.songClip?.duration || 0) * 1000),
  );
  const draftSongTrimStartMs = Math.max(0, Number(draft.songClip?.trimStartMs) || 0);
  const draftSongTrimEndMs = Math.max(
    draftSongTrimStartMs + MIN_WALKUP_TRIM_MS,
    Number(draft.songClip?.trimEndMs) || Math.min(songClipDurationMs || WALKUP_TRIM_MS, draftSongTrimStartMs + WALKUP_TRIM_MS),
  );
  const draftSongFadeInEndMs = Math.min(
    draftSongTrimEndMs,
    Math.max(draftSongTrimStartMs, Number(draft.songClip?.fadeInEndMs) || Math.min(draftSongTrimEndMs, draftSongTrimStartMs + 800)),
  );
  const maxSongTrimStartMs = Math.max(0, songClipDurationMs - MIN_WALKUP_TRIM_MS);

  useEffect(() => {
    const updateTimelineViewportWidth = () => {
      const nextWidth = Math.round(timelineViewportRef.current?.clientWidth || 0);
      if (nextWidth > 0) {
        setTimelineViewportWidth(nextWidth);
      }
    };

    updateTimelineViewportWidth();
    window.addEventListener("resize", updateTimelineViewportWidth);

    return () => {
      window.removeEventListener("resize", updateTimelineViewportWidth);
    };
  }, []);

  useEffect(() => {
    const fallbackClipId = getAnnouncementSeedClipId(
      draft.timeline,
      draft.announcementClipId,
      libraries,
    );

    if (!fallbackClipId) {
      return;
    }

    const needsHydration = (draft.timeline ?? []).some(
      (item) => item.slot === "announcement" && !item.clipId,
    );

    if (!needsHydration) {
      return;
    }

    setDraft((current) => {
      const currentTimeline = current.timeline ?? [];
      const nextTimeline = currentTimeline.map((item) =>
        item.slot === "announcement" && !item.clipId
          ? { ...item, clipId: fallbackClipId }
          : item,
      );

      return {
        ...current,
        announcementClipId: current.announcementClipId || fallbackClipId,
        timeline: nextTimeline,
        sequence: deriveSequenceFromTimeline(nextTimeline),
      };
    });
  }, [draft.timeline, draft.announcementClipId, libraries, setDraft]);

  const updateDraftTimeline = (updater) => {
    setDraft((current) => {
      const nextTimeline = normalizeTimelineLayout(
        updater(current.timeline ?? []),
        current,
        libraries,
        clipDurationLookup,
      );
      return {
        ...current,
        timeline: nextTimeline,
        sequence: deriveSequenceFromTimeline(nextTimeline),
      };
    });
  };

  const uploadDraftClip = async ({ file, group, fallbackNickname, key }) => {
    const duration = await getAudioDuration(file);
    const clip = createClipRecord({
      file,
      duration,
      group,
      nickname: fallbackNickname,
    });
    clip.dataUrl = await fileToDataUrl(file);
    setDraft((current) => {
      const nextOwnedClip =
        group === "songs"
          ? {
              ...clip,
              trimStartMs: 0,
              trimEndMs:
                Number.isFinite(duration) && duration > 0
                  ? Math.min(Math.round(duration * 1000), WALKUP_TRIM_MS)
                  : WALKUP_TRIM_MS,
              fadeInEndMs:
                Number.isFinite(duration) && duration > 0
                  ? Math.min(Math.round(duration * 1000), 800)
                  : 800,
              fadeOutStartMs:
                Number.isFinite(duration) && duration > 0
                  ? Math.max(0, Math.min(Math.round(duration * 1000), WALKUP_TRIM_MS) - 1200)
                  : Math.max(0, WALKUP_TRIM_MS - 1200),
              fadeOutEndMs:
                Number.isFinite(duration) && duration > 0
                  ? Math.min(Math.round(duration * 1000), WALKUP_TRIM_MS)
                  : WALKUP_TRIM_MS,
            }
          : clip;
      const nextDraft = {
        ...current,
        [key]: nextOwnedClip,
      };
      const slot =
        key === "songClip" ? "song" : key === "nicknameClip" ? "nickname" : key === "nameClip" ? "name" : "";

      return {
        ...nextDraft,
        timeline: slot
          ? retimeTimelineAfterDurationChange(
              current.timeline ?? [],
              current,
              nextDraft,
              libraries,
              clipDurationLookup,
              (item) => item.slot === slot,
            )
          : current.timeline ?? [],
        sequence: deriveSequenceFromTimeline(
          slot
            ? retimeTimelineAfterDurationChange(
                current.timeline ?? [],
                current,
                nextDraft,
                libraries,
                clipDurationLookup,
                (item) => item.slot === slot,
              )
            : current.timeline ?? [],
        ),
      };
    });
  };

  const handleBuiltInSongChange = (clipId) => {
    const nextSongClip = libraries.songs.find((clip) => clip.id === clipId) ?? null;

    setDraft((current) => {
      const nextDraft = {
        ...current,
        songClip: nextSongClip,
      };

      return {
        ...nextDraft,
        timeline: retimeTimelineAfterDurationChange(
          current.timeline ?? [],
          current,
          nextDraft,
          libraries,
          clipDurationLookup,
          (item) => item.slot === "song",
        ),
        sequence: deriveSequenceFromTimeline(
          retimeTimelineAfterDurationChange(
            current.timeline ?? [],
            current,
            nextDraft,
            libraries,
            clipDurationLookup,
            (item) => item.slot === "song",
          ),
        ),
      };
    });
  };

  const presentTimelineSlots = useMemo(
    () => new Set(measuredTimeline.map((item) => item.slot)),
    [measuredTimeline],
  );

  const sequenceAddOptions = useMemo(() => {
    const uniqueSlots = ["number", "name", "nickname", "position", "song"];
    const options = [{ id: "announcement", label: slotLabel("announcement") }];

    uniqueSlots.forEach((slot) => {
      if (!presentTimelineSlots.has(slot)) {
        options.push({ id: slot, label: slotLabel(slot) });
      }
    });

    return options;
  }, [presentTimelineSlots]);

  const addSequenceItem = (nextSlot = sequenceAddValue) => {
    if (!nextSlot) {
      return;
    }

    setTimelineTouched(true);
    updateDraftTimeline((currentTimeline) => {
      if (
        nextSlot !== "announcement" &&
        ["number", "name", "nickname", "position", "song"].includes(nextSlot) &&
        presentTimelineSlots.has(nextSlot)
      ) {
        return currentTimeline;
      }

      const targetTrack = getDefaultTrackForSlot(nextSlot);
      const compactedTimeline = compactTimelineSequence(
        currentTimeline,
        draft,
        libraries,
        clipDurationLookup,
      );
      const visibleTrackTimeline = compactedTimeline.filter((item) => item.track === targetTrack);
      const nextStartMs = getNextTimelineStartMs(
        visibleTrackTimeline,
        draft,
        libraries,
        clipDurationLookup,
        nextSlot === "song" ? 1000 : 0,
        targetTrack,
      );

      return [
        ...compactedTimeline,
        createTimelineItem(
          nextSlot,
          nextStartMs,
          targetTrack,
          nextSlot === "announcement"
            ? getAnnouncementSeedClipId(compactedTimeline, draft.announcementClipId, libraries)
            : "",
        ),
      ];
    });
  };

  useEffect(() => {
    if (!sequenceAddOptions.length) {
      return;
    }

    if (!sequenceAddOptions.some((option) => option.id === sequenceAddValue)) {
      setSequenceAddValue(sequenceAddOptions[0].id);
    }
  }, [sequenceAddOptions, sequenceAddValue]);

  const previewSequenceItem = (timelineItemId) => {
    const item = measuredTimeline.find((entry) => entry.timelineItemId === timelineItemId);
    if (!item) {
      return;
    }

    if (!item.dataUrl && !item.src) {
      return;
    }

    onPreviewClip?.({
      clip: {
        ...item,
        id: item.timelineItemId,
        timelineItemId: item.timelineItemId,
        startMs: 0,
        playerId: draft.id ?? "draft-player",
        playerName: draft.name || item.nickname,
      },
      playerId: draft.id ?? "draft-player",
      playerName: draft.name || item.nickname,
    });
  };

  const updateAnnouncementSelection = (timelineItemId, clipId) => {
    setTimelineTouched(true);
    setDraft((current) => {
      const nextTimeline = current.timeline.map((item) =>
        item.id === timelineItemId ? { ...item, clipId } : item,
      );
      const nextDraft = {
        ...current,
        timeline: nextTimeline,
      };

      const retimedTimeline = normalizeTimelineLayout(
        retimeTimelineAfterDurationChange(
          nextTimeline,
          current,
          nextDraft,
          libraries,
          clipDurationLookup,
          (item) => item.id === timelineItemId,
        ),
        nextDraft,
        libraries,
        clipDurationLookup,
      );

      return {
        ...nextDraft,
        timeline: retimedTimeline,
        sequence: deriveSequenceFromTimeline(retimedTimeline),
      };
    });
  };

  useEffect(() => {
    if (!showSongTrimModal) {
      return;
    }

    setSongTrimStartMs(
      Math.min(draftSongTrimStartMs, maxSongTrimStartMs),
    );
    setSongTrimEndMs(Math.min(Math.max(draftSongTrimEndMs, draftSongTrimStartMs + MIN_WALKUP_TRIM_MS), songClipDurationMs || draftSongTrimEndMs));
    setSongFadeInEndMs(
      Math.min(
        draftSongTrimEndMs,
        Math.max(draftSongTrimStartMs, draftSongFadeInEndMs),
      ),
    );
    setSongFadeOutStartMs(
      Math.min(
        Math.max(draftSongTrimStartMs, Number(draft.songClip?.fadeOutStartMs) || Math.max(draftSongTrimStartMs, draftSongTrimEndMs - 1200)),
        draftSongTrimEndMs,
      ),
    );
    setSongFadeOutEndMs(
      Math.min(
        Math.max(Number(draft.songClip?.fadeOutEndMs) || draftSongTrimEndMs, Number(draft.songClip?.fadeOutStartMs) || Math.max(draftSongTrimStartMs, draftSongTrimEndMs - 1200)),
        draftSongTrimEndMs,
      ),
    );
  }, [showSongTrimModal, draft.songClip?.trimStartMs, draft.songClip?.trimEndMs, draft.songClip?.fadeInEndMs, draft.songClip?.fadeOutStartMs, draft.songClip?.fadeOutEndMs, draftSongTrimStartMs, draftSongTrimEndMs, draftSongFadeInEndMs, maxSongTrimStartMs, songClipDurationMs]);

  const openSongTrimModal = () => {
    if (!draft.songClip) {
      return;
    }

    setSongTrimStartMs(
      Math.min(draftSongTrimStartMs, maxSongTrimStartMs),
    );
    setSongTrimEndMs(draftSongTrimEndMs);
    setSongFadeInEndMs(
      Math.min(
        draftSongTrimEndMs,
        Math.max(draftSongTrimStartMs, draftSongFadeInEndMs),
      ),
    );
    setSongFadeOutStartMs(
      Math.min(
        Math.max(draftSongTrimStartMs, Number(draft.songClip?.fadeOutStartMs) || Math.max(draftSongTrimStartMs, draftSongTrimEndMs - 1200)),
        draftSongTrimEndMs,
      ),
    );
    setSongFadeOutEndMs(
      Math.min(
        Math.max(Number(draft.songClip?.fadeOutEndMs) || draftSongTrimEndMs, Number(draft.songClip?.fadeOutStartMs) || Math.max(draftSongTrimStartMs, draftSongTrimEndMs - 1200)),
        draftSongTrimEndMs,
      ),
    );
    setShowSongTrimModal(true);
  };

  const saveSongTrim = () => {
    const nextTrimStartMs = Math.min(Math.max(0, Number(songTrimStartMs) || 0), maxSongTrimStartMs);
    const nextTrimEndMs = Math.min(
      Math.max(nextTrimStartMs + MIN_WALKUP_TRIM_MS, Number(songTrimEndMs) || (nextTrimStartMs + WALKUP_TRIM_MS)),
      Math.max(nextTrimStartMs + MIN_WALKUP_TRIM_MS, songClipDurationMs || (nextTrimStartMs + WALKUP_TRIM_MS)),
    );
    const nextFadeInEndMs = Math.min(
      nextTrimEndMs,
      Math.max(nextTrimStartMs, Number(songFadeInEndMs) || Math.min(nextTrimEndMs, nextTrimStartMs + 800)),
    );
    const nextFadeOutStartMs = Math.min(
      nextTrimEndMs,
      Math.max(nextTrimStartMs, Number(songFadeOutStartMs) || Math.max(nextTrimStartMs, nextTrimEndMs - 1200)),
    );
    const nextFadeOutEndMs = Math.min(
      nextTrimEndMs,
      Math.max(nextFadeOutStartMs, Number(songFadeOutEndMs) || nextTrimEndMs),
    );

    setDraft((current) => ({
      ...current,
      songClip: current.songClip
        ? {
            ...current.songClip,
            trimStartMs: nextTrimStartMs,
            trimEndMs: nextTrimEndMs,
            fadeInEndMs: nextFadeInEndMs,
            fadeOutStartMs: nextFadeOutStartMs,
            fadeOutEndMs: nextFadeOutEndMs,
          }
        : current.songClip,
    }));
    setShowSongTrimModal(false);
  };

  const previewSongTrim = () => {
    if (!draft.songClip) {
      return;
    }

    onPreviewClip?.({
      clip: {
        ...draft.songClip,
        slot: "song",
        durationMs: Math.max(MIN_WALKUP_TRIM_MS, songTrimEndMs - songTrimStartMs),
        trimStartMs: Math.min(Math.max(0, songTrimStartMs), maxSongTrimStartMs),
        trimEndMs: Math.max(songTrimStartMs + MIN_WALKUP_TRIM_MS, songTrimEndMs),
        fadeInEndMs: Math.max(songTrimStartMs, Math.min(songFadeInEndMs, songTrimEndMs)),
        fadeOutStartMs: Math.max(songTrimStartMs, Math.min(songFadeOutStartMs, songTrimEndMs)),
        fadeOutEndMs: Math.max(
          Math.max(songTrimStartMs, Math.min(songFadeOutStartMs, songTrimEndMs)),
          Math.min(songFadeOutEndMs, songTrimEndMs),
        ),
        startMs: 0,
        playerId: draft.id ?? "draft-player",
        playerName: draft.name || draft.songClip.nickname,
      },
      playerId: "draft-song-trim",
      playerName: draft.name || draft.songClip.nickname,
    });
  };

  const isSongTrimPreviewActive = activePlayback?.playerId === "draft-song-trim";
  const songTrimPreviewTimeMs = isSongTrimPreviewActive ? Math.max(0, playbackTimeMs) : 0;

  const removeSequenceItem = (timelineItemId) => {
    setTimelineTouched(true);
    updateDraftTimeline((currentTimeline) =>
      currentTimeline.filter((item) => item.id !== timelineItemId),
    );
    setSelectedTimelineId((current) => (current === timelineItemId ? "" : current));
  };

  const moveSelectedTimelineItem = (deltaMs) => {
    if (!selectedTimelineId || !deltaMs) {
      return;
    }

    setTimelineTouched(true);
    updateDraftTimeline((currentTimeline) =>
      currentTimeline.map((item) =>
        item.id === selectedTimelineId
          ? {
              ...item,
              startMs: Math.max(
                0,
                Math.round((item.startMs + deltaMs) / TIMELINE_SNAP_MS) * TIMELINE_SNAP_MS,
              ),
            }
          : item,
      ),
    );
  };

  const moveSelectedTimelineTrack = (deltaTrack) => {
    if (!selectedTimelineId || !deltaTrack) {
      return;
    }

    setTimelineTouched(true);
    updateDraftTimeline((currentTimeline) =>
      currentTimeline.map((item) =>
        item.id === selectedTimelineId
          ? {
              ...item,
              track: Math.max(0, Math.min(TRACK_CONFIG.length - 1, item.track + deltaTrack)),
            }
          : item,
      ),
    );
  };

  const previewDraftSequence = () => {
    if (!measuredPreviewTimeline.length) {
      return;
    }

    onPreviewSequence?.({
      items: measuredPreviewTimeline,
      playerName: draft.name || "Draft Sequence",
    });
  };

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      const deltaMs =
        Math.round(deltaX / timelinePixelsPerMs / TIMELINE_SNAP_MS) * TIMELINE_SNAP_MS;
      const nextTrack = Math.max(0, Math.min(1, dragState.originTrack + Math.round(deltaY / 110)));

      updateDraftTimeline((currentTimeline) =>
        currentTimeline.map((item) =>
          item.id === dragState.itemId
            ? {
                ...item,
                startMs: Math.max(0, dragState.originStartMs + deltaMs),
                track: nextTrack,
              }
            : item,
        ),
      );
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setDraggedTimelineId("");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [timelinePixelsPerMs]);

  useEffect(() => {
    if (timelineTouched || !measuredTimeline.length) {
      return;
    }

    const compactedTimeline = compactTimelineSequence(
      draft.timeline ?? [],
      draft,
      libraries,
      clipDurationLookup,
    );

    const currentStarts = (draft.timeline ?? []).map((item) => item.startMs).join(",");
    const nextStarts = compactedTimeline.map((item) => item.startMs).join(",");

    if (currentStarts === nextStarts) {
      return;
    }

    setDraft((current) => ({
      ...current,
      timeline: compactedTimeline,
      sequence: deriveSequenceFromTimeline(compactedTimeline),
    }));
  }, [clipDurationLookup, draft, libraries, measuredTimeline, timelineTouched, setDraft]);

  const startTimelineDrag = (event, item) => {
    if (event.target.closest("[data-timeline-action='true']")) {
      return;
    }

    setTimelineTouched(true);
    dragStateRef.current = {
      kind: "item",
      itemId: item.timelineItemId,
      startX: event.clientX,
      startY: event.clientY,
      originStartMs: item.startMs,
      originTrack: item.track,
    };
    setDraggedTimelineId(item.timelineItemId);
    setSelectedTimelineId(item.timelineItemId);
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-950/70 p-2 backdrop-blur sm:flex sm:items-center sm:justify-center sm:p-4">
      <div className="glass-panel flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.4rem] border border-white/10 p-3 shadow-2xl shadow-sky-950/30 sm:my-6 sm:max-h-[90vh] sm:rounded-[2rem] sm:p-5">
        <div className="sticky top-0 z-10 -mx-3 -mt-3 flex items-start justify-between gap-3 border-b border-white/8 bg-slate-950/95 px-3 pb-3 pt-3 backdrop-blur sm:-mx-5 sm:-mt-5 sm:px-5 sm:pb-4 sm:pt-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              {mode === "edit" ? "Edit Player" : "New Player"}
            </div>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
              {mode === "edit" ? "Update Roster" : "Add To Roster"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="secondary-button">
            Close
          </button>
        </div>

        <form onSubmit={(event) => onSubmit(event, draft)} className="mt-4 flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto sm:mt-5">
          <div className="grid gap-3 xl:grid-cols-[1.1fr,1fr] xl:gap-4">
            <div className="min-w-0 space-y-3 sm:space-y-4">
              <div className="panel-muted rounded-[1.25rem] p-3 sm:rounded-[1.5rem] sm:p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Player Info
                </div>
                <div className="mt-4 space-y-3">
                  <Field
                    label="Player Name"
                    value={draft.name}
                    onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
                    placeholder="Mason Reed"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectInput
                      label="Jersey"
                      value={draft.jerseyNumber}
                      options={jerseyOptions}
                      onChange={handleJerseyChange}
                      emptyLabel="No number"
                    />
                    <SelectInput
                      label="Position"
                      value={draft.positionLabel}
                      options={positionOptions}
                      onChange={handlePositionChange}
                      emptyLabel="No position"
                    />
                  </div>
                </div>
              </div>

              <div className="panel-muted rounded-[1.25rem] p-3 sm:rounded-[1.5rem] sm:p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Walk-Up Song
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <SelectField
                    label="Built-In Walk-Up Song"
                    value={draftBuiltInSongId}
                    options={libraries.songs}
                    onChange={handleBuiltInSongChange}
                  />
                  {draft.songClip ? (
                    <button
                      type="button"
                      onClick={openSongTrimModal}
                      className="secondary-button justify-center md:min-w-[11rem]"
                    >
                      Trim Song
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="panel-muted min-w-0 rounded-[1.25rem] p-3 sm:rounded-[1.5rem] sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Walk-Up Timeline
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {selectedTimelineItem?.slot === "announcement" ? (
                    <div className="relative min-w-0 grow sm:grow-0">
                      <select
                        value={selectedAnnouncementClipId}
                        onChange={(event) =>
                          updateAnnouncementSelection(selectedTimelineItem.timelineItemId, event.target.value)
                        }
                        className="w-full rounded-2xl border border-cyan-300/30 bg-slate-900/85 px-3 py-3 text-sm text-white outline-none sm:w-44"
                      >
                        {libraries.announcements.map((clip) => (
                          <option key={clip.id} value={clip.id}>
                            {clip.nickname}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={previewDraftSequence}
                    className="secondary-button px-3"
                  >
                    <Play className="h-4 w-4" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTimelineId) {
                        removeSequenceItem(selectedTimelineId);
                      }
                    }}
                    disabled={!selectedTimelineId}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border transition sm:h-12 sm:w-12 ${
                      selectedTimelineId
                        ? "border-rose-300/40 bg-rose-400/15 text-rose-100 hover:bg-rose-400/20"
                        : "border-white/10 bg-slate-900/80 text-slate-500"
                    }`}
                    title={selectedTimelineId ? "Delete selected clip" : "Select a clip to delete"}
                  >
                    <Trash2 className="h-4.5 w-4.5" />
                  </button>
                  <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (sequenceAddOptions.length === 1) {
                        addSequenceItem(sequenceAddOptions[0].id);
                        return;
                      }

                      setShowSequenceAddPicker((current) => !current);
                    }}
                    className="secondary-button h-11 w-11 justify-center rounded-full p-0 sm:h-12 sm:w-12"
                    aria-label="Add sequence pill"
                    title="Add sequence pill"
                  >
                    <Plus className="h-5 w-5" />
                  </button>

                  {showSequenceAddPicker ? (
                    <div className="absolute right-0 top-14 z-10 w-[15rem] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-sky-950/30 backdrop-blur">
                      <div className="flex flex-wrap gap-2">
                        {sequenceAddOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              addSequenceItem(option.id);
                              setShowSequenceAddPicker(false);
                            }}
                            className="rounded-full border border-cyan-300/20 bg-slate-900/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-cyan-200/50 hover:bg-cyan-300/10 hover:text-cyan-50"
                          >
                            {option.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setShowSequenceAddPicker(false)}
                          className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:border-white/20 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {selectedTimelineItem ? (
                  <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/45 p-2.5 sm:rounded-[1.35rem] sm:p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                          Selected Pill
                        </div>
                        <div className="mt-1 truncate text-sm font-semibold text-white">
                          {slotLabel(selectedTimelineItem.slot)}:{" "}
                          <span className="text-slate-300">
                            {getTimelineItemValue(selectedTimelineItem, draft)}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-end sm:gap-2">
                        <button
                          type="button"
                          onClick={() => moveSelectedTimelineItem(-100)}
                          className="secondary-button min-w-0 justify-center px-2 text-[11px] tracking-[0.12em] sm:text-xs sm:tracking-[0.14em]"
                        >
                          -0.1s
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSelectedTimelineItem(100)}
                          className="secondary-button min-w-0 justify-center px-2 text-[11px] tracking-[0.12em] sm:text-xs sm:tracking-[0.14em]"
                        >
                          +0.1s
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSelectedTimelineTrack(-1)}
                          className="secondary-button min-w-0 justify-center px-2 text-[11px] tracking-[0.12em] sm:text-xs sm:tracking-[0.14em]"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSelectedTimelineTrack(1)}
                          className="secondary-button min-w-0 justify-center px-2 text-[11px] tracking-[0.12em] sm:text-xs sm:tracking-[0.14em]"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => previewSequenceItem(selectedTimelineItem.timelineItemId)}
                          className="secondary-button min-w-0 justify-center px-2 text-[11px] tracking-[0.12em] sm:text-xs sm:tracking-[0.14em]"
                        >
                          Preview
                        </button>
                        {selectedTimelineItem.slot === "song" ? (
                          <button
                            type="button"
                            onClick={openSongTrimModal}
                            className="secondary-button min-w-0 justify-center px-2 text-[11px] tracking-[0.12em] sm:text-xs sm:tracking-[0.14em]"
                          >
                            Trim
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="overflow-hidden pb-2" ref={timelineViewportRef}>
                  <div className="overflow-hidden" ref={timelineScrollRef}>
                  <div
                    className="relative"
                    style={{ width: `${timelineWidth}px`, maxWidth: "100%" }}
                  >
                    <TimelineScale durationMs={timelineDurationMs} pixelsPerMs={timelinePixelsPerMs} />
                    <div className="space-y-2">
                      {TRACK_CONFIG.map((track) => (
                        <TimelineTrack
                          key={track.id}
                          track={track}
                          durationMs={timelineDurationMs}
                          items={measuredTimeline.filter((item) => item.track === track.id)}
                          draft={draft}
                          draggedTimelineId={draggedTimelineId}
                          isCompactTimeline={isCompactTimeline}
                          pixelsPerMs={timelinePixelsPerMs}
                          selectedTimelineId={selectedTimelineId}
                          onSongDoubleClick={openSongTrimModal}
                          onRemove={removeSequenceItem}
                          onPointerDown={startTimelineDrag}
                          onSelect={setSelectedTimelineId}
                        />
                      ))}
                    </div>
                  </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="sticky bottom-0 -mx-3 -mb-3 mt-4 border-t border-white/8 bg-slate-950/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5 sm:py-4">
            <button type="submit" className="primary-button w-full justify-center">
              <Plus className="h-4 w-4" />
              {mode === "edit" ? "Save Player" : "Add Player"}
            </button>
          </div>
        </form>
      </div>

      {showSongTrimModal ? (
        <SongTrimModal
          clip={draft.songClip}
          clipDurationMs={songClipDurationMs}
          trimStartMs={songTrimStartMs}
          trimEndMs={songTrimEndMs}
          fadeInEndMs={songFadeInEndMs}
          fadeOutStartMs={songFadeOutStartMs}
          fadeOutEndMs={songFadeOutEndMs}
          maxTrimStartMs={maxSongTrimStartMs}
          onStartChange={setSongTrimStartMs}
          onEndChange={setSongTrimEndMs}
          onFadeInEndChange={setSongFadeInEndMs}
          onFadeOutStartChange={setSongFadeOutStartMs}
          onFadeOutEndChange={setSongFadeOutEndMs}
          onClose={() => setShowSongTrimModal(false)}
          onSave={saveSongTrim}
          onPreview={previewSongTrim}
          isPreviewActive={isSongTrimPreviewActive}
          isPreviewPaused={Boolean(isPlaybackPaused && isSongTrimPreviewActive)}
          previewTimeMs={songTrimPreviewTimeMs}
          onTogglePause={onTogglePause}
        />
      ) : null}
    </div>
  );
}

function PlayerCard({ player, libraries, onUpdatePlayer, onRemovePlayer, onQueueClip, onPlayPlayer }) {
  const [nameClipNickname, setNameClipNickname] = useState("");
  const [nicknameClipNickname, setNicknameClipNickname] = useState("");
  const [songClipNickname, setSongClipNickname] = useState("");
  const status = getPlayerStatus(player);
  const sequencePreview = useMemo(
    () => resolvePlayerSequence(player, libraries),
    [player, libraries],
  );
  const builtInSongId = player.songClip?.builtIn ? player.songClip.id : "";

  const syncPlayerSequence = (current, nextSequence) => ({
    ...current,
    sequence: nextSequence,
    timeline: buildTimelineFromSequence({
      ...current,
      sequence: nextSequence,
      announcementClipId: current.announcementClipId,
    }),
  });

  const uploadNameClip = async (file) => {
    const duration = await getAudioDuration(file);
    const clip = createClipRecord({
      file,
      duration,
      group: "names",
      nickname: nameClipNickname || player.name,
    });
    clip.dataUrl = await fileToDataUrl(file);

    onUpdatePlayer(player.id, (current) => ({
      ...current,
      nameClip: clip,
    }));
    setNameClipNickname("");
  };

  const uploadSongClip = async (file) => {
    const duration = await getAudioDuration(file);
    const clip = createClipRecord({
      file,
      duration,
      group: "songs",
      nickname: songClipNickname || `${player.name} walk-up`,
    });
    clip.dataUrl = await fileToDataUrl(file);

    onUpdatePlayer(player.id, (current) => ({
      ...current,
      songClip: clip,
    }));
    setSongClipNickname("");
  };

  const uploadNicknameClip = async (file) => {
    const duration = await getAudioDuration(file);
    const clip = createClipRecord({
      file,
      duration,
      group: "nicknames",
      nickname: nicknameClipNickname || `${player.name} nickname`,
    });
    clip.dataUrl = await fileToDataUrl(file);

    onUpdatePlayer(player.id, (current) => ({
      ...current,
      nicknameClip: clip,
    }));
    setNicknameClipNickname("");
  };

  const updateSequenceItem = (index, nextValue) => {
    onUpdatePlayer(player.id, (current) => syncPlayerSequence(
      current,
      current.sequence.map((slot, slotIndex) =>
        slotIndex === index ? nextValue : slot,
      ),
    ));
  };

  const moveSequenceItem = (index, direction) => {
    onUpdatePlayer(player.id, (current) => {
      const next = [...current.sequence];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return syncPlayerSequence(current, next);
    });
  };

  const removeSequenceItem = (index) => {
    onUpdatePlayer(player.id, (current) => syncPlayerSequence(
      current,
      current.sequence.filter((_, slotIndex) => slotIndex !== index),
    ));
  };

  const addSequenceItem = () => {
    onUpdatePlayer(player.id, (current) => syncPlayerSequence(
      current,
      [...current.sequence, "announcement"],
    ));
  };

  return (
    <article className="glass-panel rounded-[2rem] border border-white/8 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
              #{player.jerseyNumber || "--"}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
              {player.positionLabel || "Utility"}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${status.isReady ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
              {status.configuredCount}/6 assigned
            </span>
          </div>
          <h3 className="mt-3 text-2xl font-black uppercase tracking-[0.04em] text-white">
            {player.name}
          </h3>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => onPlayPlayer(player)} className="primary-button">
            <Play className="h-4 w-4" />
            Play
          </button>
          <button
            type="button"
            onClick={() => onRemovePlayer(player.id)}
            className="rounded-full border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr,1fr]">
        <div className="panel-muted rounded-[1.5rem] p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
            Assign Clips
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SelectField
              label="Announcement"
              value={player.announcementClipId}
              options={libraries.announcements}
              onChange={(value) =>
                onUpdatePlayer(player.id, (current) => ({
                  ...current,
                  announcementClipId: value,
                  timeline: (current.timeline ?? []).map((item) =>
                    item.slot === "announcement" ? { ...item, clipId: value } : item,
                  ),
                }))
              }
            />
            <SelectField
              label="Number"
              value={player.numberClipId}
              options={libraries.numbers}
              onChange={(value) =>
                onUpdatePlayer(player.id, (current) => ({ ...current, numberClipId: value }))
              }
            />
            <SelectField
              label="Position"
              value={player.positionClipId}
              options={libraries.positions}
              onChange={(value) =>
                onUpdatePlayer(player.id, (current) => ({ ...current, positionClipId: value }))
              }
            />
            <SelectField
              label="Walk-Up Song"
              value={builtInSongId}
              options={libraries.songs}
              onChange={(value) =>
                onUpdatePlayer(player.id, (current) => ({
                  ...current,
                  songClip: libraries.songs.find((clip) => clip.id === value) ?? null,
                }))
              }
            />
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
                Name Clip Nickname
              </label>
              <input
                value={nameClipNickname}
                onChange={(event) => setNameClipNickname(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                placeholder={player.name}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
                Walk-Up Song Nickname
              </label>
              <input
                value={songClipNickname}
                onChange={(event) => setSongClipNickname(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                placeholder={`${player.name} walk-up`}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
                Nickname Clip Nickname
              </label>
              <input
                value={nicknameClipNickname}
                onChange={(event) => setNicknameClipNickname(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                placeholder={`${player.name} nickname`}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Uploader buttonLabel="Upload Name Clip" onFile={uploadNameClip} />
            <Uploader buttonLabel="Upload Nickname Clip" onFile={uploadNicknameClip} />
            <Uploader buttonLabel="Upload Walk-Up Song" onFile={uploadSongClip} />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {player.nameClip ? (
              <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
                <div className="text-sm font-semibold text-white">{player.nameClip.nickname}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {player.nameClip.fileName} - {formatDuration(player.nameClip.duration)} - Name
                </div>
              </div>
            ) : null}
            {player.nicknameClip ? (
              <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
                <div className="text-sm font-semibold text-white">{player.nicknameClip.nickname}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {player.nicknameClip.fileName} - {formatDuration(player.nicknameClip.duration)} - Nickname
                </div>
              </div>
            ) : null}
            {player.songClip ? (
              <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
                <div className="text-sm font-semibold text-white">{player.songClip.nickname}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {player.songClip.fileName} - {formatDuration(player.songClip.duration)} - Walk-Up Song
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel-muted rounded-[1.5rem] p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Editable Sequence
            </div>
            <button type="button" onClick={addSequenceItem} className="secondary-button">
              Add Slot
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {player.sequence.map((slot, index) => (
              <div
                key={`${player.id}-${index}`}
                className="rounded-2xl border border-white/8 bg-slate-950/55 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-950">
                    {index + 1}
                  </div>
                  <select
                    value={slot}
                    onChange={(event) => updateSequenceItem(index, event.target.value)}
                    className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white outline-none"
                  >
                    {PLAYER_SEQUENCE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => moveSequenceItem(index, "up")} className="icon-button">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => moveSequenceItem(index, "down")} className="icon-button">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => removeSequenceItem(index)} className="icon-button danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {sequencePreview.map((clip) => (
              <button
                key={`${player.id}-${clip.id}-${clip.slot}`}
                type="button"
                onClick={() =>
                  onQueueClip({
                    group:
                      clip.slot === "name"
                        ? "names"
                        : clip.slot === "nickname"
                          ? "nicknames"
                        : clip.slot === "song"
                          ? "songs"
                          : `${clip.slot}s`,
                    clip,
                    playerId: player.id,
                    playerName: player.name,
                  })
                }
                className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3 text-left transition hover:border-sky-300/20"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{clip.nickname}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                    {clip.slot}
                  </div>
                </div>
                <span className="secondary-button">Queue</span>
              </button>
            ))}

            {sequencePreview.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
                Assign clips above to build the player intro.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function LibraryRow({ clip, onRemove, onQueue }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{clip.nickname}</div>
          <div className="mt-1 text-xs text-slate-400">
            {clip.fileName} - {formatDuration(clip.duration)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onQueue} className="secondary-button">
            Queue
          </button>
          <button type="button" onClick={onRemove} className="secondary-button">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ClipMetaCard({ clip, label }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
      <div className="text-sm font-semibold text-white">{clip.nickname}</div>
      <div className="mt-1 text-xs text-slate-400">
        {clip.fileName} - {formatDuration(clip.duration)} - {label}
      </div>
    </div>
  );
}

function TimelineScale({ durationMs, pixelsPerMs }) {
  const seconds = Math.ceil(durationMs / 1000);

  return (
    <div className="mb-3 flex h-7 items-end sm:h-8">
      {Array.from({ length: seconds + 1 }, (_, index) => index).map((second) => (
        <div
          key={`scale-${second}`}
          className="relative h-full shrink-0"
          style={{ width: `${1000 * pixelsPerMs}px` }}
        >
          <div className="absolute inset-y-0 left-0 w-px bg-white/8" />
          <div className="absolute bottom-0 left-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:left-2 sm:text-[10px] sm:tracking-[0.18em]">
            {second}s
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineTrack({
  track,
  items,
  draft,
  draggedTimelineId,
  isCompactTimeline,
  onSongDoubleClick,
  onPointerDown,
  pixelsPerMs,
  selectedTimelineId,
  onSelect,
}) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] p-2 sm:rounded-[1.45rem] sm:p-2.5">
      <div
        className="relative overflow-hidden rounded-[1.35rem] border border-white/6 bg-[linear-gradient(180deg,rgba(8,47,73,0.22),rgba(2,6,23,0.9))]"
        style={{ height: "88px" }}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]"
          style={{ backgroundSize: `${TIMELINE_SNAP_MS * pixelsPerMs}px 100%` }}
        />
        {items.map((item) => (
          <TimelineBlock
            key={item.timelineItemId}
            item={item}
            draft={draft}
            isDragging={draggedTimelineId === item.timelineItemId}
            isCompactTimeline={isCompactTimeline}
            isSelected={selectedTimelineId === item.timelineItemId}
            onSongDoubleClick={onSongDoubleClick}
            onPointerDown={onPointerDown}
            pixelsPerMs={pixelsPerMs}
            onSelect={onSelect}
          />
        ))}
        {!items.length ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            Drop clips on this track
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TimelineBlock({
  item,
  draft,
  isDragging,
  isCompactTimeline,
  isSelected,
  onSongDoubleClick,
  onPointerDown,
  pixelsPerMs,
  onSelect,
}) {
  const tone = SLOT_TONES[item.slot] ?? SLOT_TONES.announcement;
  const label = getTimelineItemValue(item, draft);
  const durationWidth = item.durationMs * pixelsPerMs;
  const visualWidth =
    item.slot === "song"
      ? Math.max(isCompactTimeline ? 88 : 170, Math.min(isCompactTimeline ? 160 : 360, durationWidth))
      : Math.max(isCompactTimeline ? 30 : 40, durationWidth);
  const left = item.startMs * pixelsPerMs;
  const isTinyPill = visualWidth < 62;
  const isSmallPill = visualWidth < 92;
  const isMediumPill = visualWidth < 135;
  const isLargePill = visualWidth >= 220;
  const labelClassName = isTinyPill
    ? "line-clamp-4 text-[9px]"
    : isSmallPill
      ? "line-clamp-3 text-[11px]"
      : isMediumPill
        ? "line-clamp-3 text-[13px]"
        : isLargePill
          ? "line-clamp-2 text-base"
          : "line-clamp-2 text-[14px]";

  return (
    <div
      data-timeline-block="true"
      onPointerDown={(event) => onPointerDown(event, item)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item.timelineItemId);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onSelect(item.timelineItemId);
        if (item.slot === "song") {
          onSongDoubleClick?.();
        }
      }}
      className={`absolute top-2 flex h-[64px] select-none items-center rounded-[1.15rem] border px-3 py-2.5 transition sm:top-3 sm:h-[76px] sm:rounded-[1.5rem] sm:px-4 sm:py-3 ${
        tone.block
      } ${
        isDragging
          ? "z-20 scale-[1.02] cursor-grabbing ring-2 ring-white/40"
          : isSelected
            ? "z-20 ring-2 ring-cyan-100/80 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
            : "z-10 cursor-grab"
      }`}
      style={{ left: `${left}px`, width: `${visualWidth}px` }}
    >
      <div className="min-w-0 flex-1">
        <div
          title={label}
          className={`overflow-hidden whitespace-normal break-words pr-1 font-black leading-tight tracking-[0.01em] text-current ${labelClassName}`}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function LegacySongTrimModal({
  clip,
  clipDurationMs,
  trimStartMs,
  trimEndMs,
  fadeOutStartMs,
  fadeOutEndMs,
  maxTrimStartMs,
  onStartChange,
  onEndChange,
  onFadeStartChange,
  onFadeEndChange,
  onClose,
  onSave,
  onPreview,
}) {
  const totalDurationMs = Math.max(
    0,
    clipDurationMs || Math.round((clip?.duration || 0) * 1000),
  );
  const safeTrimStartMs = Math.max(0, Number(trimStartMs) || 0);
  const safeTrimEndMs = Math.min(
    Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, Number(trimEndMs) || (safeTrimStartMs + WALKUP_TRIM_MS)),
    Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, totalDurationMs || (safeTrimStartMs + WALKUP_TRIM_MS)),
  );
  const safeFadeStartMs = Math.min(
    safeTrimEndMs,
    Math.max(safeTrimStartMs, Number(fadeOutStartMs) || Math.max(safeTrimStartMs, safeTrimEndMs - 1200)),
  );
  const safeFadeEndMs = Math.min(
    safeTrimEndMs,
    Math.max(safeFadeStartMs, Number(fadeOutEndMs) || safeTrimEndMs),
  );
  const canTrim = totalDurationMs > MIN_WALKUP_TRIM_MS;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/70 p-2 backdrop-blur sm:flex sm:items-center sm:justify-center sm:p-4">
      <div className="glass-panel flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-[1.5rem] border border-white/10 p-4 shadow-2xl shadow-sky-950/30 sm:max-h-[90vh] sm:rounded-[2rem] sm:p-5">
        <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-3 border-b border-white/8 bg-slate-950/95 px-4 pb-3 pt-4 backdrop-blur sm:-mx-5 sm:-mt-5 sm:px-5 sm:pb-4 sm:pt-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              Walk-Up Trim
            </div>
            <h3 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
              15 Second Default Window
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Double-clicking the song pill opens this editor. Keep the full song, then set custom start, end, and fade-out points for the playback window.
            </p>
          </div>
          <button type="button" onClick={onClose} className="secondary-button">
            Close
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
        <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/55 p-4">
          <div className="text-sm font-semibold text-white">{clip?.nickname || "Walk-Up Song"}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
            {clip?.fileName} • original {formatDuration(totalDurationMs / 1000)} • playing {formatMsTimestamp(safeTrimStartMs)} to {formatMsTimestamp(safeTrimEndMs)}
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                <span>Window Start</span>
                <span>{formatMsTimestamp(safeTrimStartMs)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(0, totalDurationMs - MIN_WALKUP_TRIM_MS)}
                step="100"
                value={Math.min(safeTrimStartMs, Math.max(0, totalDurationMs - MIN_WALKUP_TRIM_MS))}
                onChange={(event) => onStartChange(Number(event.target.value))}
                disabled={!canTrim}
                className="w-full accent-cyan-300"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                <span>Window End</span>
                <span>{formatMsTimestamp(safeTrimEndMs)}</span>
              </div>
              <input
                type="range"
                min={safeTrimStartMs + MIN_WALKUP_TRIM_MS}
                max={Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, totalDurationMs)}
                step="100"
                value={safeTrimEndMs}
                onChange={(event) => onEndChange(Number(event.target.value))}
                disabled={!canTrim}
                className="w-full accent-cyan-300"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                <span>Fade Start</span>
                <span>{formatMsTimestamp(safeFadeStartMs)}</span>
              </div>
              <input
                type="range"
                min={safeTrimStartMs}
                max={safeTrimEndMs}
                step="100"
                value={safeFadeStartMs}
                onChange={(event) => onFadeStartChange(Number(event.target.value))}
                disabled={!canTrim}
                className="w-full accent-cyan-300"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                <span>Fade End</span>
                <span>{formatMsTimestamp(safeFadeEndMs)}</span>
              </div>
              <input
                type="range"
                min={safeFadeStartMs}
                max={safeTrimEndMs}
                step="100"
                value={safeFadeEndMs}
                onChange={(event) => onFadeEndChange(Number(event.target.value))}
                disabled={!canTrim}
                className="w-full accent-cyan-300"
              />
            </div>

            <input
              readOnly
              value=""
              className="hidden"
            />
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
              <span>Window {formatDuration((safeTrimEndMs - safeTrimStartMs) / 1000)}</span>
              <span>Fade {formatDuration((safeFadeEndMs - safeFadeStartMs) / 1000)}</span>
            </div>
          </div>

          {!canTrim ? (
            <div className="mt-3 rounded-2xl border border-white/8 bg-slate-900/80 px-4 py-3 text-sm text-slate-400">
              This clip is very short, so the available trim window is limited by the original file length.
            </div>
          ) : null}
        </div>
        </div>

        <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex gap-2 border-t border-white/8 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5 sm:py-4">
          <button type="button" onClick={onPreview} className="secondary-button">
            <Play className="h-4 w-4" />
            Preview Window
          </button>
          <button type="button" onClick={onSave} className="primary-button">
            Save Trim
          </button>
        </div>
      </div>
    </div>
  );
}

function SongTrimModal({
  clip,
  clipDurationMs,
  trimStartMs,
  trimEndMs,
  fadeInEndMs,
  fadeOutStartMs,
  fadeOutEndMs,
  maxTrimStartMs,
  onStartChange,
  onEndChange,
  onFadeInEndChange,
  onFadeOutStartChange,
  onFadeOutEndChange,
  onClose,
  onSave,
  onPreview,
  isPreviewActive,
  isPreviewPaused,
  previewTimeMs,
  onTogglePause,
}) {
  const editorRef = useRef(null);
  const dragHandleRef = useRef(null);
  const [waveformPeaks, setWaveformPeaks] = useState([]);
  const [trimStartInput, setTrimStartInput] = useState("0:00");
  const [fadeInEndInput, setFadeInEndInput] = useState("0:00");
  const [fadeOutStartInput, setFadeOutStartInput] = useState("0:00");
  const [fadeOutEndInput, setFadeOutEndInput] = useState("0:00");
  const [trimEndInput, setTrimEndInput] = useState("0:00");
  const [waveformZoom, setWaveformZoom] = useState(1);
  const totalDurationMs = Math.max(0, clipDurationMs || Math.round((clip?.duration || 0) * 1000));
  const safeTrimStartMs = Math.max(0, Number(trimStartMs) || 0);
  const safeTrimEndMs = Math.min(
    Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, Number(trimEndMs) || (safeTrimStartMs + WALKUP_TRIM_MS)),
    Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, totalDurationMs || (safeTrimStartMs + WALKUP_TRIM_MS)),
  );
  const safeFadeInEndMs = Math.min(
    safeTrimEndMs,
    Math.max(safeTrimStartMs, Number(fadeInEndMs) || Math.min(safeTrimEndMs, safeTrimStartMs + 800)),
  );
  const safeFadeStartMs = Math.min(
    safeTrimEndMs,
    Math.max(safeTrimStartMs, Number(fadeOutStartMs) || Math.max(safeTrimStartMs, safeTrimEndMs - 1200)),
  );
  const safeFadeEndMs = Math.min(
    totalDurationMs || safeTrimEndMs,
    Math.max(safeFadeStartMs, Number(fadeOutEndMs) || safeTrimEndMs),
  );
  const canTrim = totalDurationMs > MIN_WALKUP_TRIM_MS;
  const editorDurationMs = Math.max(totalDurationMs || 0, safeTrimEndMs, WALKUP_TRIM_MS);
  const liveSongTimeMs = Math.min(safeTrimEndMs, safeTrimStartMs + Math.max(0, previewTimeMs || 0));
  const liveWindowTimeMs = Math.max(0, previewTimeMs || 0);

  useEffect(() => {
    setTrimStartInput(formatMsTimestamp(safeTrimStartMs));
    setFadeInEndInput(formatMsTimestamp(safeFadeInEndMs));
    setFadeOutStartInput(formatMsTimestamp(safeFadeStartMs));
    setFadeOutEndInput(formatMsTimestamp(safeFadeEndMs));
    setTrimEndInput(formatMsTimestamp(safeTrimEndMs));
  }, [safeTrimStartMs, safeFadeInEndMs, safeFadeStartMs, safeFadeEndMs, safeTrimEndMs]);

  useEffect(() => {
    let cancelled = false;
    const clipSource = clip?.dataUrl ?? clip?.src;

    if (!clipSource) {
      setWaveformPeaks([]);
      return () => {
        cancelled = true;
      };
    }

    getAudioWaveformPeaks(clipSource, 240)
      .then((peaks) => {
        if (!cancelled) {
          setWaveformPeaks(peaks);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWaveformPeaks([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clip]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const activeHandle = dragHandleRef.current;
      if (!activeHandle || !editorRef.current) {
        return;
      }

      const rect = editorRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const nextMs =
        Math.round(((relativeX / Math.max(1, rect.width)) * editorDurationMs) / SONG_EDITOR_SNAP_MS) * SONG_EDITOR_SNAP_MS;

      if (activeHandle === "trimStart") {
        const clamped = Math.min(maxTrimStartMs, Math.max(0, nextMs));
        onStartChange(clamped);
        if (safeFadeInEndMs < clamped) onFadeInEndChange(clamped);
        if (safeFadeStartMs < clamped) onFadeOutStartChange(clamped);
        if (safeFadeEndMs < clamped) onFadeOutEndChange(clamped);
        return;
      }

      if (activeHandle === "trimEnd") {
        const clamped = Math.min(
          Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, nextMs),
          Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, totalDurationMs || nextMs),
        );
        onEndChange(clamped);
        if (safeFadeInEndMs > clamped) onFadeInEndChange(clamped);
        if (safeFadeStartMs > clamped) onFadeOutStartChange(clamped);
        if (safeFadeEndMs > clamped) onFadeOutEndChange(clamped);
        return;
      }

      if (activeHandle === "fadeInEnd") {
        onFadeInEndChange(Math.min(safeTrimEndMs, Math.max(safeTrimStartMs, nextMs)));
        return;
      }

      if (activeHandle === "fadeOutStart") {
        const clamped = Math.min(safeFadeEndMs, Math.max(safeTrimStartMs, nextMs));
        onFadeOutStartChange(clamped);
        if (safeFadeEndMs < clamped) onFadeOutEndChange(clamped);
        return;
      }

      if (activeHandle === "fadeOutEnd") {
        onFadeOutEndChange(
          Math.min(
            Math.max(safeFadeStartMs, nextMs),
            Math.max(safeFadeStartMs, totalDurationMs || nextMs),
          ),
        );
      }
    };

    const handlePointerUp = () => {
      dragHandleRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    editorDurationMs,
    maxTrimStartMs,
    onEndChange,
    onFadeInEndChange,
    onFadeOutEndChange,
    onFadeOutStartChange,
    onStartChange,
    safeFadeEndMs,
    safeFadeInEndMs,
    safeFadeStartMs,
    safeTrimEndMs,
    safeTrimStartMs,
    totalDurationMs,
  ]);

  const getHandlePosition = (valueMs) =>
    `${Math.max(0, Math.min(100, (valueMs / Math.max(1, editorDurationMs)) * 100))}%`;
  const livePlayheadPosition = getHandlePosition(liveSongTimeMs);

  const waveformPath = waveformPeaks.length
    ? waveformPeaks
        .map((peak, index) => {
          const x = (index / Math.max(1, waveformPeaks.length - 1)) * 100;
          const halfHeight = peak * 44;
          return `${x},${50 - halfHeight} ${x},${50 + halfHeight}`;
        })
        .join(" ")
    : "";

  const startHandleDrag = (handle) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragHandleRef.current = handle;
  };

  const commitTimestampInput = (rawValue, fallbackMs, minMs, maxMs, onCommit, setValue) => {
    const parsedMs = parseMsTimestampInput(rawValue);
    if (!Number.isFinite(parsedMs)) {
      setValue(formatMsTimestamp(fallbackMs));
      return;
    }

    const clampedMs = Math.min(maxMs, Math.max(minMs, parsedMs));
    const snappedMs = Math.round(clampedMs / SONG_EDITOR_SNAP_MS) * SONG_EDITOR_SNAP_MS;
    onCommit(snappedMs);
    setValue(formatMsTimestamp(snappedMs));
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/70 p-2 backdrop-blur sm:flex sm:items-center sm:justify-center sm:p-4">
      <div className="glass-panel flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.5rem] border border-white/10 p-4 shadow-2xl shadow-sky-950/30 sm:max-h-[90vh] sm:rounded-[2rem] sm:p-5">
        <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-3 border-b border-white/8 bg-slate-950/95 px-4 pb-3 pt-4 backdrop-blur sm:-mx-5 sm:-mt-5 sm:px-5 sm:pb-4 sm:pt-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              Walk-Up Trim
            </div>
            <h3 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
              Visual Song Editor
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Drag the trim and fade markers on the waveform to set the playback window.
            </p>
          </div>
          <button type="button" onClick={onClose} className="secondary-button">
            Close
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
        <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/55 p-4">
          <div className="text-sm font-semibold text-white">{clip?.nickname || "Walk-Up Song"}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
            {clip?.fileName} - original {formatDuration(totalDurationMs / 1000)} - window {formatMsTimestamp(safeTrimStartMs)} to {formatMsTimestamp(safeTrimEndMs)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs uppercase tracking-[0.18em] text-slate-400">
            <span>
              Track Time <span className="text-white">{formatMsTimestamp(liveSongTimeMs)}</span>
            </span>
            <span>
              Window Time <span className="text-white">{formatMsTimestamp(liveWindowTimeMs)}</span>
            </span>
            <span className={isPreviewActive ? "text-emerald-300" : "text-slate-500"}>
              {isPreviewActive ? (isPreviewPaused ? "Paused" : "Playing") : "Ready"}
            </span>
          </div>

          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2.5 py-1 text-rose-100">Trim</span>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">Fade In</span>
                <span className="rounded-full border border-sky-300/30 bg-sky-400/10 px-2.5 py-1 text-sky-100">Fade Out</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWaveformZoom((current) => Math.max(1, Number((current - 0.5).toFixed(1))))}
                  className="secondary-button h-10 w-10 justify-center rounded-full p-0"
                  title="Zoom out waveform"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="min-w-[4.25rem] text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {waveformZoom.toFixed(1)}x
                </div>
                <button
                  type="button"
                  onClick={() => setWaveformZoom((current) => Math.min(4, Number((current + 0.5).toFixed(1))))}
                  className="secondary-button h-10 w-10 justify-center rounded-full p-0"
                  title="Zoom in waveform"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
              <div
                ref={editorRef}
                className="relative h-44 min-w-full overflow-hidden sm:h-56 lg:h-64"
                style={{ width: `${waveformZoom * 100}%` }}
              >
                <div
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)]"
                  style={{ backgroundSize: "5% 100%" }}
                />
                {waveformPeaks.length ? (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                    <polyline
                      fill="none"
                      stroke="rgba(96,165,250,0.9)"
                      strokeWidth="0.32"
                      points={waveformPath}
                    />
                  </svg>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                    Loading waveform...
                  </div>
                )}

                <div
                  className="absolute inset-y-0 bg-slate-950/65"
                  style={{ left: 0, width: getHandlePosition(safeTrimStartMs) }}
                />
                <div
                  className="absolute inset-y-0 bg-lime-300/20"
                  style={{
                    left: getHandlePosition(safeTrimStartMs),
                    width: `calc(${getHandlePosition(safeTrimEndMs)} - ${getHandlePosition(safeTrimStartMs)})`,
                  }}
                />
                <div
                  className="absolute inset-y-0 bg-slate-950/65"
                  style={{ left: getHandlePosition(safeTrimEndMs), right: 0 }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 bg-[linear-gradient(90deg,rgba(34,211,238,0.78),rgba(34,211,238,0.06))]"
                  style={{
                    left: getHandlePosition(safeTrimStartMs),
                    width: `calc(${getHandlePosition(safeFadeInEndMs)} - ${getHandlePosition(safeTrimStartMs)})`,
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 bg-[linear-gradient(90deg,rgba(56,189,248,0.06),rgba(56,189,248,0.8))]"
                  style={{
                    left: getHandlePosition(safeFadeStartMs),
                    width: `calc(${getHandlePosition(safeFadeEndMs)} - ${getHandlePosition(safeFadeStartMs)})`,
                  }}
                />
                {isPreviewActive ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_14px_rgba(255,255,255,0.75)]"
                    style={{ left: livePlayheadPosition }}
                  >
                    <div className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full border border-slate-950/40 bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
                  </div>
                ) : null}

                {[
                  { key: "trimStart", value: safeTrimStartMs, color: "bg-rose-500", badge: "TS" },
                  { key: "fadeInEnd", value: safeFadeInEndMs, color: "bg-cyan-400", badge: "FI" },
                  { key: "fadeOutStart", value: safeFadeStartMs, color: "bg-sky-400", badge: "FO In" },
                  { key: "fadeOutEnd", value: safeFadeEndMs, color: "bg-sky-500", badge: "FO Out" },
                  { key: "trimEnd", value: safeTrimEndMs, color: "bg-rose-500", badge: "TE" },
                ].map((handle) => (
                  <button
                    key={handle.key}
                    type="button"
                    onPointerDown={startHandleDrag(handle.key)}
                    className="absolute top-0 z-20 h-full w-8 -translate-x-1/2 bg-transparent sm:w-6"
                    style={{ left: getHandlePosition(handle.value) }}
                    title={`${handle.badge} ${formatMsTimestamp(handle.value)}`}
                  >
                    <div className={`absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-full ${handle.color} shadow-[0_0_16px_rgba(255,255,255,0.2)] sm:w-1.5`} />
                    <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white sm:text-[10px]">
                      {handle.badge}
                    </div>
                  </button>
                ))}

                <div className="absolute inset-x-0 bottom-0 flex justify-between px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  <span>{formatMsTimestamp(0)}</span>
                  <span>{formatMsTimestamp(editorDurationMs)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  label: "Trim Start",
                  value: trimStartInput,
                  setValue: setTrimStartInput,
                  fallbackMs: safeTrimStartMs,
                  minMs: 0,
                  maxMs: Math.max(0, totalDurationMs - MIN_WALKUP_TRIM_MS),
                  onCommit: onStartChange,
                },
                {
                  label: "Fade In End",
                  value: fadeInEndInput,
                  setValue: setFadeInEndInput,
                  fallbackMs: safeFadeInEndMs,
                  minMs: safeTrimStartMs,
                  maxMs: safeTrimEndMs,
                  onCommit: onFadeInEndChange,
                },
                {
                  label: "Fade Out Start",
                  value: fadeOutStartInput,
                  setValue: setFadeOutStartInput,
                  fallbackMs: safeFadeStartMs,
                  minMs: safeTrimStartMs,
                  maxMs: safeFadeEndMs,
                  onCommit: onFadeOutStartChange,
                },
                {
                  label: "Fade Out End",
                  value: fadeOutEndInput,
                  setValue: setFadeOutEndInput,
                  fallbackMs: safeFadeEndMs,
                  minMs: safeFadeStartMs,
                  maxMs: Math.max(safeFadeStartMs, totalDurationMs),
                  onCommit: onFadeOutEndChange,
                },
                {
                  label: "Trim End",
                  value: trimEndInput,
                  setValue: setTrimEndInput,
                  fallbackMs: safeTrimEndMs,
                  minMs: safeTrimStartMs + MIN_WALKUP_TRIM_MS,
                  maxMs: Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, totalDurationMs),
                  onCommit: onEndChange,
                },
              ].map((field) => (
                <label
                  key={field.label}
                  className="rounded-2xl border border-white/8 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
                >
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    {field.label}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={field.value}
                    onChange={(event) => field.setValue(event.target.value)}
                    onBlur={() =>
                      commitTimestampInput(
                        field.value,
                        field.fallbackMs,
                        field.minMs,
                        field.maxMs,
                        field.onCommit,
                        field.setValue,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    onFocus={(event) => event.currentTarget.select()}
                    className="mt-1 w-full bg-transparent font-semibold text-white outline-none"
                  />
                </label>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
              <span>Window {formatDuration((safeTrimEndMs - safeTrimStartMs) / 1000)}</span>
              <span>Fade In {formatDuration((safeFadeInEndMs - safeTrimStartMs) / 1000)}</span>
              <span>Fade Out {formatDuration((safeFadeEndMs - safeFadeStartMs) / 1000)}</span>
            </div>

            <div className="mt-4 grid gap-3 sm:hidden">
              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Trim Start
                </span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, totalDurationMs - MIN_WALKUP_TRIM_MS)}
                  step={SONG_EDITOR_SNAP_MS}
                  value={Math.min(safeTrimStartMs, Math.max(0, totalDurationMs - MIN_WALKUP_TRIM_MS))}
                  onChange={(event) => onStartChange(Number(event.target.value))}
                  disabled={!canTrim}
                  className="w-full accent-rose-400"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Fade In End
                </span>
                <input
                  type="range"
                  min={safeTrimStartMs}
                  max={safeTrimEndMs}
                  step={SONG_EDITOR_SNAP_MS}
                  value={safeFadeInEndMs}
                  onChange={(event) => onFadeInEndChange(Number(event.target.value))}
                  disabled={!canTrim}
                  className="w-full accent-cyan-300"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Fade Out Start
                </span>
                <input
                  type="range"
                  min={safeTrimStartMs}
                  max={safeFadeEndMs}
                  step={SONG_EDITOR_SNAP_MS}
                  value={safeFadeStartMs}
                  onChange={(event) => onFadeOutStartChange(Number(event.target.value))}
                  disabled={!canTrim}
                  className="w-full accent-sky-300"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Fade Out End
                </span>
                <input
                  type="range"
                  min={safeFadeStartMs}
                  max={Math.max(safeFadeStartMs, totalDurationMs)}
                  step={SONG_EDITOR_SNAP_MS}
                  value={safeFadeEndMs}
                  onChange={(event) => onFadeOutEndChange(Number(event.target.value))}
                  disabled={!canTrim}
                  className="w-full accent-sky-400"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Trim End
                </span>
                <input
                  type="range"
                  min={safeTrimStartMs + MIN_WALKUP_TRIM_MS}
                  max={Math.max(safeTrimStartMs + MIN_WALKUP_TRIM_MS, totalDurationMs)}
                  step={SONG_EDITOR_SNAP_MS}
                  value={safeTrimEndMs}
                  onChange={(event) => onEndChange(Number(event.target.value))}
                  disabled={!canTrim}
                  className="w-full accent-rose-500"
                />
              </label>
            </div>
          </div>

          {!canTrim ? (
            <div className="mt-3 rounded-2xl border border-white/8 bg-slate-900/80 px-4 py-3 text-sm text-slate-400">
              This clip is very short, so the available trim window is limited by the original file length.
            </div>
          ) : null}
        </div>
        </div>

        <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex flex-wrap gap-2 border-t border-white/8 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5 sm:py-4">
          <button type="button" onClick={onPreview} className="secondary-button">
            <Play className="h-4 w-4" />
            Preview Window
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            disabled={!isPreviewActive}
            className={`secondary-button ${
              isPreviewActive ? "" : "cursor-not-allowed opacity-50"
            }`}
          >
            {isPreviewPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {isPreviewPaused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={onSave} className="primary-button">
            Save Trim
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
      >
        <option value="">Not assigned</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.nickname}
          </option>
        ))}
      </select>
    </div>
  );
}

function SequenceSelect({ value, optionGroups, onChange, className = "" }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white outline-none ${className}`}
    >
      <option value="">Empty slot</option>
      {optionGroups.map((group) => (
        <optgroup key={group.id} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectInput({ label, value, options, onChange, emptyLabel }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Uploader({ buttonLabel, onFile }) {
  return (
    <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15">
      <Upload className="h-4 w-4" />
      {buttonLabel}
      <input
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          await onFile(file);
          event.target.value = "";
        }}
      />
    </label>
  );
}
