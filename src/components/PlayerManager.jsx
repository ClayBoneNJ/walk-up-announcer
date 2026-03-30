import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Play, Plus, Trash2, Upload } from "lucide-react";
import { getAudioDuration } from "../lib/audio";
import {
  CLIP_GROUP_OPTIONS,
  createClipRecord,
  deriveSequenceFromTimeline,
  fileToDataUrl,
  formatDuration,
  getClipEffectiveDurationMs,
  getPlayerStatus,
  PLAYER_SEQUENCE_OPTIONS,
  resolvePlayerSequence,
  TIMELINE_SNAP_MS,
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

  return {
    name: "",
    jerseyNumber: "",
    positionLabel: "",
    announcementClipId: "",
    numberClipId: "",
    positionClipId: "",
    nameClip: null,
    nicknameClip: null,
    songClip: null,
    timeline: normalizedTimeline,
    sequence: deriveSequenceFromTimeline(normalizedTimeline),
    ...overrides,
  };
}

function slotLabel(slot) {
  return PLAYER_SEQUENCE_OPTIONS.find((option) => option.id === slot)?.label ?? "Slot";
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

function getPlayheadMsFromPointer(event, scrollContainer, durationMs) {
  if (!scrollContainer) {
    return 0;
  }

  const rect = scrollContainer.getBoundingClientRect();
  const contentX = event.clientX - rect.left + scrollContainer.scrollLeft;
  const rawMs = contentX / TIMELINE_PIXELS_PER_MS;
  return Math.max(0, Math.min(durationMs, Math.round(rawMs / TIMELINE_SNAP_MS) * TIMELINE_SNAP_MS));
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
  playbackProgress,
  playbackTimeMs,
  playbackTotalMs,
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

  const handlePlayerSubmit = (event) => {
    event.preventDefault();
    if (!playerDraft.name.trim()) return;

    if (rosterModal?.mode === "edit" && rosterModal.playerId) {
      onUpdatePlayer(rosterModal.playerId, (current) => ({
        ...current,
        ...playerDraft,
        name: playerDraft.name.trim(),
        jerseyNumber: playerDraft.jerseyNumber.trim(),
        positionLabel: playerDraft.positionLabel.trim(),
      }));
      closeRosterModal();
      return;
    }

    onAddPlayer({
      id: crypto.randomUUID(),
      ...playerDraft,
      name: playerDraft.name.trim(),
      jerseyNumber: playerDraft.jerseyNumber.trim(),
      positionLabel: playerDraft.positionLabel.trim(),
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
          playbackProgress={playbackProgress}
          playbackTimeMs={playbackTimeMs}
          playbackTotalMs={playbackTotalMs}
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
  playbackProgress,
  playbackTimeMs,
  playbackTotalMs,
  onClose,
  onSubmit,
}) {
  const timelineScrollRef = useRef(null);
  const dragStateRef = useRef(null);
  const [draggedTimelineId, setDraggedTimelineId] = useState("");
  const [selectedTimelineId, setSelectedTimelineId] = useState("");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [previewPlayheadMs, setPreviewPlayheadMs] = useState(null);
  const [clipDurationLookup, setClipDurationLookup] = useState({});
  const [sequenceAddValue, setSequenceAddValue] = useState("announcement");
  const [showSequenceAddPicker, setShowSequenceAddPicker] = useState(false);
  const [timelineTouched, setTimelineTouched] = useState(false);
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

  const handleJerseyChange = (jerseyNumber) => {
    const matchingNumberClip = libraries.numbers.find(
      (clip) => clip.id === `number-${jerseyNumber}`,
    );

    setDraft((current) => ({
      ...current,
      jerseyNumber,
      numberClipId: matchingNumberClip ? matchingNumberClip.id : "",
    }));
  };

  const handlePositionChange = (positionLabel) => {
    const matchingPositionClip = libraries.positions.find(
      (clip) => clip.nickname === positionLabel,
    );

    setDraft((current) => ({
      ...current,
      positionLabel,
      positionClipId: matchingPositionClip ? matchingPositionClip.id : "",
    }));
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

  const resolvedTimeline = useMemo(
    () => resolvePlayerSequence(draft, libraries),
    [draft, libraries],
  );

  const measuredTimeline = useMemo(
    () =>
      resolvedTimeline.map((item) => {
        const clipKey = item.dataUrl ?? item.src ?? item.id;
        const measuredDurationMs = clipDurationLookup[clipKey];
        const durationMs =
          Number.isFinite(measuredDurationMs) && measuredDurationMs > 0
            ? measuredDurationMs
            : item.durationMs;

        return {
          ...item,
          durationMs,
          endMs: item.startMs + durationMs,
        };
      }),
    [resolvedTimeline, clipDurationLookup],
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

  const timelineWidth = Math.max(780, Math.round(timelineDurationMs * TIMELINE_PIXELS_PER_MS));
  const isDraftSequencePlaying =
    activePlayback?.type === "player" && activePlayback?.playerId === "draft-player";
  const renderedPlayheadMs = previewPlayheadMs ?? playheadMs;
  const selectedTimelineItem =
    measuredTimeline.find((item) => item.timelineItemId === selectedTimelineId) ?? null;
  const selectedAnnouncementClipId =
    selectedTimelineItem?.slot === "announcement"
      ? selectedTimelineItem.timelineClipId || draft.announcementClipId || libraries.announcements[0]?.id || ""
      : "";

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
    setDraft((current) => ({
      ...current,
      [key]: clip,
      }));
  };

  const sequenceAddOptions = useMemo(() => {
    const uniqueSlots = ["number", "name", "nickname", "position", "song"];
    const options = [{ id: "announcement", label: slotLabel("announcement") }];

    uniqueSlots.forEach((slot) => {
      if (!(draft.timeline ?? []).some((item) => item.slot === slot)) {
        options.push({ id: slot, label: slotLabel(slot) });
      }
    });

    return options;
  }, [draft.timeline]);

  const addSequenceItem = (nextSlot = sequenceAddValue) => {
    if (!nextSlot) {
      return;
    }

    setTimelineTouched(true);
    updateDraftTimeline((currentTimeline) => {
      if (
        nextSlot !== "announcement" &&
        ["number", "name", "nickname", "position", "song"].includes(nextSlot) &&
        currentTimeline.some((item) => item.slot === nextSlot)
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
            ? draft.announcementClipId || libraries.announcements[0]?.id || ""
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
    updateDraftTimeline((currentTimeline) =>
      currentTimeline.map((item) =>
        item.id === timelineItemId ? { ...item, clipId } : item,
      ),
    );

    setDraft((current) => ({
      ...current,
      announcementClipId: clipId || current.announcementClipId,
    }));
  };

  const removeSequenceItem = (timelineItemId) => {
    setTimelineTouched(true);
    updateDraftTimeline((currentTimeline) =>
      currentTimeline.filter((item) => item.id !== timelineItemId),
    );
    setSelectedTimelineId((current) => (current === timelineItemId ? "" : current));
  };

  const previewDraftSequence = () => {
    if (!measuredTimeline.length) {
      return;
    }

    onPreviewSequence?.({
      items: measuredTimeline,
      playerName: draft.name || "Draft Sequence",
      startOffsetMs: playheadMs,
    });
  };

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      if (dragState.kind === "playhead") {
        setPlayheadMs(getPlayheadMsFromPointer(event, timelineScrollRef.current, timelineDurationMs));
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      const deltaMs = Math.round(deltaX / TIMELINE_PIXELS_PER_MS / TIMELINE_SNAP_MS) * TIMELINE_SNAP_MS;
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
  }, [timelineDurationMs]);

  useEffect(() => {
    if (isDraftSequencePlaying) {
      setPreviewPlayheadMs(
        Math.max(
          0,
          Math.min(
            timelineDurationMs,
            Number.isFinite(playbackTimeMs)
              ? playbackTimeMs
              : playbackTotalMs > 0
                ? playbackProgress * playbackTotalMs
                : 0,
          ),
        ),
      );
      return;
    }

    setPreviewPlayheadMs(null);
  }, [isDraftSequencePlaying, playbackProgress, playbackTimeMs, playbackTotalMs, timelineDurationMs]);

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

  const movePlayheadToPointer = (event) => {
    setPlayheadMs(getPlayheadMsFromPointer(event, timelineScrollRef.current, timelineDurationMs));
  };

  const startPlayheadDrag = (event) => {
    event.stopPropagation();
    dragStateRef.current = { kind: "playhead" };
    movePlayheadToPointer(event);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur sm:items-center">
      <div className="glass-panel max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/10 p-5 shadow-2xl shadow-sky-950/30">
        <div className="flex items-start justify-between gap-3">
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

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <div className="grid gap-4 xl:grid-cols-[1.1fr,1fr]">
            <div className="space-y-4">
              <div className="panel-muted rounded-[1.5rem] p-4">
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

              <div className="panel-muted rounded-[1.5rem] p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Player-Owned Uploads
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Uploader
                    buttonLabel="Upload Nickname"
                    onFile={(file) =>
                      uploadDraftClip({
                        file,
                        group: "nicknames",
                        fallbackNickname: `${draft.name || "Player"} nickname`,
                        key: "nicknameClip",
                      })
                    }
                  />
                  <Uploader
                    buttonLabel="Upload Song"
                    onFile={(file) =>
                      uploadDraftClip({
                        file,
                        group: "songs",
                        fallbackNickname: `${draft.name || "Player"} walk-up`,
                        key: "songClip",
                      })
                    }
                  />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {draft.nameClip ? <ClipMetaCard clip={draft.nameClip} label="Name" /> : null}
                  {draft.nicknameClip ? (
                    <ClipMetaCard clip={draft.nicknameClip} label="Nickname" />
                  ) : null}
                  {draft.songClip ? <ClipMetaCard clip={draft.songClip} label="Song" /> : null}
                </div>
              </div>
            </div>

            <div className="panel-muted rounded-[1.5rem] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Walk-Up Timeline
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTimelineItem?.slot === "announcement" ? (
                    <div className="relative">
                      <select
                        value={selectedAnnouncementClipId}
                        onChange={(event) =>
                          updateAnnouncementSelection(selectedTimelineItem.timelineItemId, event.target.value)
                        }
                        className="w-44 rounded-2xl border border-cyan-300/30 bg-slate-900/85 px-3 py-3 text-sm text-white outline-none"
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
                    onClick={() => setPlayheadMs(0)}
                    className="secondary-button"
                    title="Back to start"
                  >
                    |&lt;
                  </button>
                  <button
                    type="button"
                    onClick={previewDraftSequence}
                    className="secondary-button"
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
                    className={`flex h-12 w-12 items-center justify-center rounded-full border transition ${
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
                    className="secondary-button h-12 w-12 justify-center rounded-full p-0"
                    aria-label="Add sequence pill"
                    title="Add sequence pill"
                  >
                    <Plus className="h-5 w-5" />
                  </button>

                  {showSequenceAddPicker ? (
                    <div className="absolute right-0 top-14 z-10 w-52 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-sky-950/30 backdrop-blur">
                      <select
                        value={sequenceAddValue}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setSequenceAddValue(nextValue);
                          addSequenceItem(nextValue);
                          setShowSequenceAddPicker(false);
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-3 text-sm text-white outline-none"
                        autoFocus
                      >
                        {sequenceAddOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div className="overflow-x-auto pb-2" ref={timelineScrollRef}>
                  <div
                    className="relative min-w-full"
                    style={{ width: `max(100%, ${timelineWidth}px)` }}
                    onPointerDown={(event) => {
                      if (event.target.closest("[data-timeline-block='true']") || event.target.closest("[data-playhead='true']")) {
                        return;
                      }
                      movePlayheadToPointer(event);
                    }}
                  >
                    <TimelineScale durationMs={timelineDurationMs} />
                    <TimelinePlayhead
                      left={renderedPlayheadMs * TIMELINE_PIXELS_PER_MS}
                      onPointerDown={startPlayheadDrag}
                      isPlaying={isDraftSequencePlaying}
                    />
                    <div className="space-y-2">
                      {TRACK_CONFIG.map((track) => (
                        <TimelineTrack
                          key={track.id}
                          track={track}
                          durationMs={timelineDurationMs}
                          items={measuredTimeline.filter((item) => item.track === track.id)}
                          draft={draft}
                          draggedTimelineId={draggedTimelineId}
                          selectedTimelineId={selectedTimelineId}
                          onRemove={removeSequenceItem}
                          onPointerDown={startTimelineDrag}
                          onSelect={setSelectedTimelineId}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {measuredTimeline
                    .slice()
                    .sort((left, right) => left.startMs - right.startMs)
                    .map((item) => (
                      <div
                        key={`legend-${item.timelineItemId}`}
                        className="rounded-2xl border border-white/8 bg-slate-950/45 px-3 py-2 text-sm text-slate-300"
                      >
                        <span className="font-semibold text-white">{slotLabel(item.slot)}</span>
                        <span className="ml-2 text-slate-400">
                          {getTimelineItemValue(item, draft)}
                        </span>
                        <span className="ml-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {item.startMs / 1000}s
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>

          <button type="submit" className="primary-button w-full justify-center">
            <Plus className="h-4 w-4" />
            {mode === "edit" ? "Save Player" : "Add Player"}
          </button>
        </form>
      </div>
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
    onUpdatePlayer(player.id, (current) => ({
      ...current,
      sequence: current.sequence.map((slot, slotIndex) =>
        slotIndex === index ? nextValue : slot,
      ),
    }));
  };

  const moveSequenceItem = (index, direction) => {
    onUpdatePlayer(player.id, (current) => {
      const next = [...current.sequence];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, sequence: next };
    });
  };

  const removeSequenceItem = (index) => {
    onUpdatePlayer(player.id, (current) => ({
      ...current,
      sequence: current.sequence.filter((_, slotIndex) => slotIndex !== index),
    }));
  };

  const addSequenceItem = () => {
    onUpdatePlayer(player.id, (current) => ({
      ...current,
      sequence: [...current.sequence, "announcement"],
    }));
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
                onUpdatePlayer(player.id, (current) => ({ ...current, announcementClipId: value }))
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

function TimelineScale({ durationMs }) {
  const seconds = Math.ceil(durationMs / 1000);

  return (
    <div className="mb-3 flex h-8 items-end">
      {Array.from({ length: seconds + 1 }, (_, index) => index).map((second) => (
        <div
          key={`scale-${second}`}
          className="relative h-full shrink-0"
          style={{ width: `${1000 * TIMELINE_PIXELS_PER_MS}px` }}
        >
          <div className="absolute inset-y-0 left-0 w-px bg-white/8" />
          <div className="absolute bottom-0 left-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
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
  onPointerDown,
  selectedTimelineId,
  onSelect,
}) {
  return (
    <div className="rounded-[1.45rem] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] p-2.5">
      <div
        className="relative overflow-hidden rounded-[1.35rem] border border-white/6 bg-[linear-gradient(180deg,rgba(8,47,73,0.22),rgba(2,6,23,0.9))]"
        style={{ height: "102px" }}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]"
          style={{ backgroundSize: `${TIMELINE_SNAP_MS * TIMELINE_PIXELS_PER_MS}px 100%` }}
        />
        {items.map((item) => (
          <TimelineBlock
            key={item.timelineItemId}
            item={item}
            draft={draft}
            isDragging={draggedTimelineId === item.timelineItemId}
            isSelected={selectedTimelineId === item.timelineItemId}
            onPointerDown={onPointerDown}
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
  isSelected,
  onPointerDown,
  onSelect,
}) {
  const tone = SLOT_TONES[item.slot] ?? SLOT_TONES.announcement;
  const label = getTimelineItemValue(item, draft);
  const durationWidth = item.durationMs * TIMELINE_PIXELS_PER_MS;
  const visualWidth =
    item.slot === "song"
      ? Math.max(220, Math.min(360, durationWidth * 0.38))
      : Math.max(42, durationWidth);
  const left = item.startMs * TIMELINE_PIXELS_PER_MS;
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
      className={`absolute top-3 flex h-[76px] select-none items-center rounded-[1.5rem] border px-4 py-3 transition ${
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

function TimelinePlayhead({ left, onPointerDown, isPlaying }) {
  return (
    <button
      type="button"
      data-playhead="true"
      onPointerDown={onPointerDown}
      className={`absolute z-30 h-[244px] w-6 -translate-x-1/2 bg-transparent transition-[left] ${
        isPlaying ? "duration-100 ease-linear" : "duration-75"
      }`}
      style={{ left: `${left}px`, top: "0px" }}
      title="Drag playhead"
    >
      <div
        className={`absolute left-1/2 top-0 h-5 w-5 -translate-x-1/2 rounded-full border border-cyan-200/70 bg-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.35)] ${
          isPlaying ? "scale-110" : ""
        }`}
      />
      <div
        className={`absolute left-1/2 top-5 h-[219px] w-[3px] -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.45)] ${
          isPlaying ? "opacity-100" : "opacity-85"
        }`}
      />
    </button>
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
