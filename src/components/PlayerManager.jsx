import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Play, Plus, Trash2, Upload } from "lucide-react";
import { getAudioDuration } from "../lib/audio";
import {
  CLIP_GROUP_OPTIONS,
  createClipRecord,
  fileToDataUrl,
  formatDuration,
  getPlayerStatus,
  PLAYER_SEQUENCE_OPTIONS,
  resolvePlayerSequence,
} from "../lib/storage";

const SETUP_TABS = [
  { id: "roster", label: "Roster" },
  { id: "events", label: "Events" },
  { id: "upload", label: "Upload Audio" },
];

const SEQUENCE_GROUPS = [
  { id: "announcements", label: "Announcements", slot: "announcement" },
  { id: "numbers", label: "Numbers", slot: "number" },
  { id: "positions", label: "Positions", slot: "position" },
  { id: "names", label: "Names", slot: "name" },
  { id: "nicknames", label: "Nicknames", slot: "nickname" },
  { id: "songs", label: "Songs", slot: "song" },
];

const ROSTER_SEQUENCE_SLOTS = ["announcement", "number", "name", "nickname", "position", "song"];

function createPlayerDraft(overrides = {}) {
  const incomingSequence = Array.isArray(overrides.sequence) ? overrides.sequence : [];
  const normalizedSequence = [
    ...incomingSequence.filter((slot, index) => {
      return ROSTER_SEQUENCE_SLOTS.includes(slot) && incomingSequence.indexOf(slot) === index;
    }),
    ...ROSTER_SEQUENCE_SLOTS.filter((slot) => !incomingSequence.includes(slot)),
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
    sequence: normalizedSequence,
    ...overrides,
  };
}

function normalizeRosterSequence(sequence) {
  const incomingSequence = Array.isArray(sequence) ? sequence : [];

  return [
    ...incomingSequence.filter((slot, index) => {
      return ROSTER_SEQUENCE_SLOTS.includes(slot) && incomingSequence.indexOf(slot) === index;
    }),
    ...ROSTER_SEQUENCE_SLOTS.filter((slot) => !incomingSequence.includes(slot)),
  ];
}

function getSequenceSelectValue(draft, slot) {
  switch (slot) {
    case "announcement":
      return draft.announcementClipId ? `announcements:${draft.announcementClipId}` : "";
    case "number":
      return draft.numberClipId ? `numbers:${draft.numberClipId}` : "";
    case "position":
      return draft.positionClipId ? `positions:${draft.positionClipId}` : "";
    case "name":
      return draft.nameClip ? `names:${draft.nameClip.id}` : "";
    case "nickname":
      return draft.nicknameClip ? `nicknames:${draft.nicknameClip.id}` : "";
    case "song":
      return draft.songClip ? `songs:${draft.songClip.id}` : "";
    default:
      return "";
  }
}

function applySequenceSelection(draft, selection) {
  if (!selection) {
    return draft;
  }

  const [group, clipId] = selection.split(":");
  const next = { ...draft };

  if (group === "announcements") {
    next.announcementClipId = clipId;
    return next;
  }

  if (group === "numbers") {
    next.numberClipId = clipId;
    return next;
  }

  if (group === "positions") {
    next.positionClipId = clipId;
    return next;
  }

  return next;
}

function slotLabel(slot) {
  return PLAYER_SEQUENCE_OPTIONS.find((option) => option.id === slot)?.label ?? "Slot";
}

function getRosterSequenceValue(slot, draft) {
  switch (slot) {
    case "number":
      return draft.jerseyNumber ? `#${draft.jerseyNumber}` : "Choose jersey number";
    case "name":
      return draft.nameClip?.nickname ?? "Upload name clip";
    case "nickname":
      return draft.nicknameClip?.nickname ?? "Upload nickname clip";
    case "song":
      return draft.songClip?.nickname ?? "Upload walk-up song";
    case "position":
      return draft.positionLabel || "Choose position";
    default:
      return "";
  }
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

function RosterModal({ mode, draft, setDraft, libraries, onClose, onSubmit }) {
  const [draggedSequenceIndex, setDraggedSequenceIndex] = useState(null);
  const [sequenceAddValue, setSequenceAddValue] = useState("announcement");
  const [showSequenceAddPicker, setShowSequenceAddPicker] = useState(false);
  const jerseyOptions = useMemo(
    () => Array.from({ length: 99 }, (_, index) => String(index + 1)),
    [],
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
          value: `announcements:${clip.id}`,
          label: clip.nickname,
        })),
      },
    ];
  }, [libraries.announcements]);

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

  const updateSequenceItem = (index, nextValue) => {
    setDraft((current) => ({
      ...applySequenceSelection(
        current,
        nextValue,
      ),
      sequence: current.sequence.map((slot, slotIndex) => {
        if (slotIndex !== index) {
          return slot;
        }

        if (!nextValue) {
          return "announcement";
        }

        const [group] = nextValue.split(":");
        return SEQUENCE_GROUPS.find((item) => item.id === group)?.slot ?? "";
      }),
    }));
  };

  const removeSequenceItem = (index) => {
    setDraft((current) => ({
      ...current,
      sequence: current.sequence.filter((_, slotIndex) => slotIndex !== index),
    }));
  };

  const reorderSequenceItem = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) {
      return;
    }

    setDraft((current) => {
      const next = [...current.sequence];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...current, sequence: next };
    });
  };

  const sequenceAddOptions = useMemo(() => {
    const uniqueSlots = ["number", "name", "nickname", "position", "song"];
    const options = [{ id: "announcement", label: slotLabel("announcement") }];

    uniqueSlots.forEach((slot) => {
      if (!draft.sequence.includes(slot)) {
        options.push({ id: slot, label: slotLabel(slot) });
      }
    });

    return options;
  }, [draft.sequence]);

  const addSequenceItem = (nextSlot = sequenceAddValue) => {
    if (!nextSlot) {
      return;
    }

    setDraft((current) => {
      if (
        nextSlot !== "announcement" &&
        ["number", "name", "nickname", "position", "song"].includes(nextSlot) &&
        current.sequence.includes(nextSlot)
      ) {
        return current;
      }

      return {
        ...current,
        sequence: [...current.sequence, nextSlot],
      };
    });
  };

  const previewSequenceItem = (slot) => {
    let clip = null;

    if (slot === "announcement") {
      clip = libraries.announcements.find((item) => item.id === draft.announcementClipId) ?? null;
    } else if (slot === "number") {
      clip = libraries.numbers.find((item) => item.id === draft.numberClipId) ?? null;
    } else if (slot === "position") {
      clip = libraries.positions.find((item) => item.id === draft.positionClipId) ?? null;
    } else if (slot === "name") {
      clip = draft.nameClip;
    } else if (slot === "nickname") {
      clip = draft.nicknameClip;
    } else if (slot === "song") {
      clip = draft.songClip;
    }

    if (!clip) {
      return;
    }

    onPreviewClip?.({
      clip: {
        ...clip,
        slot,
        playerId: draft.id ?? "draft-player",
        playerName: draft.name || clip.nickname,
      },
      playerId: draft.id ?? "draft-player",
      playerName: draft.name || clip.nickname,
    });
  };

  const handleSequenceDragStart = (event, index, slot) => {
    setDraggedSequenceIndex(index);
    event.dataTransfer.effectAllowed = "move";

    const sourceRow = event.currentTarget.closest("[data-sequence-row='true']");
    if (!sourceRow) {
      return;
    }

    const rowRect = sourceRow.getBoundingClientRect();
    const ghost = sourceRow.cloneNode(true);
    ghost.style.width = `${rowRect.width}px`;
    ghost.style.maxWidth = `${rowRect.width}px`;
    ghost.style.position = "fixed";
    ghost.style.top = "-9999px";
    ghost.style.left = "-9999px";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    ghost.style.opacity = "0.95";
    ghost.style.transform = "scale(1)";
    ghost.style.boxShadow = "0 24px 60px rgba(8, 47, 73, 0.45)";
    ghost.classList.add("border-sky-300/40", "bg-sky-400/10");

    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, rowRect.width - 36, rowRect.height / 2);

    requestAnimationFrame(() => {
      if (ghost.parentNode) {
        ghost.parentNode.removeChild(ghost);
      }
    });
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
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Uploader
                    buttonLabel="Upload Name"
                    onFile={(file) =>
                      uploadDraftClip({
                        file,
                        group: "names",
                        fallbackNickname: draft.name || "Player name",
                        key: "nameClip",
                      })
                    }
                  />
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
                    Walk-Up Sequence
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    Add, remove, and arrange pills. Announcement can repeat. Number, name, nickname, position, and walk-up stay unique.
                  </div>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSequenceAddPicker((current) => !current)}
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

              <div className="mt-4 space-y-3">
                {draft.sequence.map((slot, index) => (
                  <div
                    key={`draft-sequence-${index}`}
                    data-sequence-row="true"
                    draggable
                    onDragStart={(event) => handleSequenceDragStart(event, index, slot)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (draggedSequenceIndex == null || draggedSequenceIndex === index) {
                        return;
                      }

                      reorderSequenceItem(draggedSequenceIndex, index);
                      setDraggedSequenceIndex(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDraggedSequenceIndex(null);
                    }}
                    onDragEnd={() => setDraggedSequenceIndex(null)}
                    className={`rounded-2xl border bg-slate-950/55 p-3 transition ${
                      draggedSequenceIndex === index
                        ? "border-sky-300/40 bg-sky-400/10"
                        : "border-white/8"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-[7.5rem] rounded-2xl border border-sky-300/20 bg-sky-400/10 px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-sky-100">
                        {slotLabel(slot)}
                      </div>
                      {slot === "announcement" ? (
                        <SequenceSelect
                          value={getSequenceSelectValue(draft, slot)}
                          optionGroups={draftSequenceOptions}
                          onChange={(value) => updateSequenceItem(index, value)}
                        />
                      ) : (
                        <LockedSequencePill value={getRosterSequenceValue(slot, draft)} />
                      )}
                      <button
                        type="button"
                        draggable={false}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          previewSequenceItem(slot);
                        }}
                        className="icon-button"
                        aria-label={`Preview ${slotLabel(slot)}`}
                        title="Preview pill"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSequenceItem(index)}
                        className="icon-button danger"
                        aria-label={`Remove ${slotLabel(slot)}`}
                        title="Remove pill"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.stopPropagation();
                          handleSequenceDragStart(event, index, slot);
                        }}
                        className="icon-button cursor-grab active:cursor-grabbing"
                        aria-label={`Drag ${slotLabel(slot)}`}
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
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

function SequenceSelect({ value, optionGroups, onChange }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white outline-none"
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

function LockedSequencePill({ value }) {
  return (
    <div className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
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
