import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  CirclePause,
  CirclePlay,
  GripVertical,
  Settings2,
  Square,
  Users,
  Volume2,
  Waves,
  Zap,
} from "lucide-react";
import { PlayerManager } from "./components/PlayerManager";
import { useAudioEngine } from "./hooks/useAudioEngine";
import {
  applyPublishedTeamSnapshot,
  createPublishedTeamSnapshot,
  createEmptyState,
  getFreestyleGroups,
  loadState,
  resolvePlayerSequence,
  saveState,
} from "./lib/storage";

const TABS = [
  { id: "walkups", label: "Walkups", shortLabel: "Walkups", icon: Users },
  { id: "soundboard", label: "Soundboard", shortLabel: "Board", icon: AudioLines },
  { id: "freestyle", label: "Freestyle", shortLabel: "Free", icon: Zap },
  { id: "setup", label: "Setup", shortLabel: "Setup", icon: Settings2 },
];

const FREESTYLE_GROUPS = [
  { id: "announcements", label: "Announcements" },
  { id: "positions", label: "Positions" },
  { id: "numbers", label: "Numbers" },
  { id: "names", label: "Names" },
  { id: "nicknames", label: "Nicknames" },
  { id: "songs", label: "Walk-Up Songs" },
];

const FREESTYLE_GROUP_STYLES = {
  announcements: {
    header: "text-amber-300",
    panel: "border-amber-300/12 bg-[linear-gradient(135deg,rgba(120,53,15,0.28),rgba(15,23,42,0.92))]",
    button:
      "border-amber-300/18 bg-[linear-gradient(135deg,rgba(251,191,36,0.14),rgba(120,53,15,0.12)_35%,rgba(2,6,23,0.88))] hover:border-amber-200/35",
    chip: "border-amber-300/18 bg-amber-300/10 text-amber-100",
    meta: "text-amber-100/70",
  },
  positions: {
    header: "text-emerald-300",
    panel: "border-emerald-300/12 bg-[linear-gradient(135deg,rgba(6,78,59,0.28),rgba(15,23,42,0.92))]",
    button:
      "border-emerald-300/18 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(6,78,59,0.12)_35%,rgba(2,6,23,0.88))] hover:border-emerald-200/35",
    chip: "border-emerald-300/18 bg-emerald-300/10 text-emerald-100",
    meta: "text-emerald-100/70",
  },
  numbers: {
    header: "text-sky-300",
    panel: "border-sky-300/12 bg-[linear-gradient(135deg,rgba(7,89,133,0.28),rgba(15,23,42,0.92))]",
    button:
      "border-sky-300/18 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(7,89,133,0.12)_35%,rgba(2,6,23,0.88))] hover:border-sky-200/35",
    chip: "border-sky-300/18 bg-sky-300/10 text-sky-100",
    meta: "text-sky-100/70",
  },
  names: {
    header: "text-fuchsia-300",
    panel: "border-fuchsia-300/12 bg-[linear-gradient(135deg,rgba(112,26,117,0.24),rgba(15,23,42,0.92))]",
    button:
      "border-fuchsia-300/18 bg-[linear-gradient(135deg,rgba(217,70,239,0.14),rgba(112,26,117,0.12)_35%,rgba(2,6,23,0.88))] hover:border-fuchsia-200/35",
    chip: "border-fuchsia-300/18 bg-fuchsia-300/10 text-fuchsia-100",
    meta: "text-fuchsia-100/70",
  },
  nicknames: {
    header: "text-rose-300",
    panel: "border-rose-300/12 bg-[linear-gradient(135deg,rgba(136,19,55,0.26),rgba(15,23,42,0.92))]",
    button:
      "border-rose-300/18 bg-[linear-gradient(135deg,rgba(251,113,133,0.14),rgba(136,19,55,0.12)_35%,rgba(2,6,23,0.88))] hover:border-rose-200/35",
    chip: "border-rose-300/18 bg-rose-300/10 text-rose-100",
    meta: "text-rose-100/70",
  },
  songs: {
    header: "text-cyan-300",
    panel: "border-cyan-300/12 bg-[linear-gradient(135deg,rgba(8,145,178,0.24),rgba(15,23,42,0.92))]",
    button:
      "border-cyan-300/18 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(8,145,178,0.12)_35%,rgba(2,6,23,0.88))] hover:border-cyan-200/35",
    chip: "border-cyan-300/18 bg-cyan-300/10 text-cyan-100",
    meta: "text-cyan-100/70",
  },
};

export default function App() {
  const [appState, setAppState] = useState(() => loadState());
  const [activeTab, setActiveTab] = useState("walkups");
  const [persistError, setPersistError] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [editingReturnTab, setEditingReturnTab] = useState("");
  const [lineupCursorId, setLineupCursorId] = useState("");

  useEffect(() => {
    setPersistError(!saveState(appState));
  }, [appState]);

  useEffect(() => {
    let cancelled = false;
    const isHostedPages =
      typeof window !== "undefined" && window.location.hostname.endsWith("github.io");

    fetch(`${import.meta.env.BASE_URL}published-team-data.json`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((snapshot) => {
        if (cancelled || !snapshot?.publishedRevision || !isHostedPages) {
          return;
        }

        setAppState((current) => {
          if (
            current.publishedRevision &&
            String(current.publishedRevision) >= String(snapshot.publishedRevision)
          ) {
            return current;
          }

          return applyPublishedTeamSnapshot(current, snapshot);
        });
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, []);

  const { libraries, players, settings } = appState;
  const {
    activePlayback,
    isPaused,
    playbackProgress,
    playbackTimeMs,
    playbackTotalMs,
    playSequence,
    stopAll,
    togglePause,
  } = useAudioEngine({
    volume: settings.volume,
    fadeMs: settings.fadeMs,
  });

  const filteredPlayers = useMemo(() => {
    const query = settings.search.trim().toLowerCase();
    if (!query) return players;

    return players.filter((player) =>
      [player.name, player.jerseyNumber, player.positionLabel].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [players, settings.search]);

  const freestyleGroups = useMemo(
    () => getFreestyleGroups(players, libraries),
    [players, libraries],
  );

  const updateState = (updater) => setAppState((current) => updater(current));

  const downloadTeamSnapshot = () => {
    const snapshot = createPublishedTeamSnapshot(appState);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "walk-up-team-snapshot.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const addPlayer = (player) => {
    updateState((current) => ({
      ...current,
      players: [player, ...current.players],
    }));
  };

  const updatePlayer = (playerId, updater) => {
    updateState((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? updater(player) : player,
      ),
    }));
  };

  const reorderPlayers = (fromPlayerId, toPlayerId, visiblePlayers) => {
    if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) {
      return;
    }

    updateState((current) => {
      const visibleIds = visiblePlayers.map((player) => player.id);
      const nextVisibleIds = [...visibleIds];
      const fromIndex = nextVisibleIds.indexOf(fromPlayerId);
      const toIndex = nextVisibleIds.indexOf(toPlayerId);

      if (fromIndex === -1 || toIndex === -1) {
        return current;
      }

      const [movedId] = nextVisibleIds.splice(fromIndex, 1);
      nextVisibleIds.splice(toIndex, 0, movedId);

      let visibleCursor = 0;
      const reorderedPlayers = current.players.map((player) => {
        if (!visibleIds.includes(player.id)) {
          return player;
        }

        const nextId = nextVisibleIds[visibleCursor];
        visibleCursor += 1;
        return current.players.find((candidate) => candidate.id === nextId) ?? player;
      });

      return {
        ...current,
        players: reorderedPlayers,
      };
    });
  };

  const removePlayer = async (playerId) => {
    await stopAll();
    updateState((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== playerId),
    }));
  };

  const addLibraryClip = (group, clip) => {
    updateState((current) => ({
      ...current,
      libraries: {
        ...current.libraries,
        [group]: [clip, ...current.libraries[group]],
      },
    }));
  };

  const removeLibraryClip = async (group, clipId) => {
    await stopAll();
    updateState((current) => ({
      ...current,
      libraries: {
        ...current.libraries,
        [group]: current.libraries[group].filter((clip) => clip.id !== clipId),
      },
      players: current.players.map((player) => ({
        ...player,
        announcementClipId:
          group === "announcements" && player.announcementClipId === clipId
            ? ""
            : player.announcementClipId,
        numberClipId:
          group === "numbers" && player.numberClipId === clipId ? "" : player.numberClipId,
        positionClipId:
          group === "positions" && player.positionClipId === clipId
            ? ""
            : player.positionClipId,
      })),
    }));
  };

  const playPlayer = async (player) => {
    const sequence = resolvePlayerSequence(player, libraries);
    await playSequence({
      items: sequence,
      descriptor: {
        type: "player",
        playerId: player.id,
        playerName: player.name,
      },
    });
  };

  useEffect(() => {
    if (!players.length) {
      setLineupCursorId("");
      return;
    }

    if (!lineupCursorId || !players.some((player) => player.id === lineupCursorId)) {
      setLineupCursorId(players[0].id);
    }
  }, [players, lineupCursorId]);

  const playPlayerFromWalkups = async (player, visiblePlayers = players) => {
    await playTrackedBatter(player, visiblePlayers);
  };

  const playTrackedBatter = async (player, visiblePlayers = players) => {
    if (!player || !visiblePlayers.length) {
      return;
    }

    setLineupCursorId(player.id);

    try {
      await playPlayer(player);
    } catch {
      return;
    }

    const currentIndex = visiblePlayers.findIndex((entry) => entry.id === player.id);
    if (currentIndex === -1) {
      return;
    }

    const followingPlayer = visiblePlayers[(currentIndex + 1) % visiblePlayers.length];
    setLineupCursorId(followingPlayer.id);
  };

  const playNextBatter = async (visiblePlayers = players) => {
    if (!visiblePlayers.length) {
      return;
    }

    const currentIndex = visiblePlayers.findIndex((player) => player.id === lineupCursorId);
    const nextPlayer = visiblePlayers[((currentIndex >= 0 ? currentIndex : 0) + 1) % visiblePlayers.length];
    await playTrackedBatter(nextPlayer, visiblePlayers);
  };

  const playClip = async ({ clip, playerId = "", playerName = "" }) => {
    await playSequence({
      items: [{ ...clip, playerId, playerName }],
      descriptor: {
        type: "clip",
        playerId,
        playerName: playerName || clip.nickname,
      },
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(21,91,185,0.2),transparent_32%),linear-gradient(180deg,_#08111f_0%,_#050914_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-56 pt-4 sm:px-6 sm:pb-48 lg:px-8">
        <header className="glass-panel mb-4 rounded-[2rem] border border-white/10 p-4 shadow-2xl shadow-sky-950/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-200">
                <Waves className="h-3.5 w-3.5" />
                Walk-Up Announcer
              </div>
              <h1 className="mt-3 text-3xl font-black uppercase tracking-[0.08em] text-white">
                {activeTab === "walkups" ? "Walkups" : activeTab === "soundboard" ? "Soundboard" : activeTab === "freestyle" ? "Freestyle" : "Setup"}
              </h1>
            </div>

            {activeTab !== "setup" ? (
              <div className="grid gap-3 sm:grid-cols-[1.1fr,180px,180px,auto]">
                <label className="panel-muted flex items-center gap-3 rounded-2xl px-4 py-3">
                  <Volume2 className="h-4 w-4 text-slate-400" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.volume}
                    onChange={(event) =>
                      updateState((current) => ({
                        ...current,
                        settings: { ...current.settings, volume: Number(event.target.value) },
                      }))
                    }
                    className="w-full accent-sky-400"
                  />
                </label>

                <label className="panel-muted rounded-2xl px-4 py-3">
                  <span className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-400">
                    <Waves className="h-3.5 w-3.5" />
                    Fade
                  </span>
                  <select
                    value={settings.fadeMs}
                    onChange={(event) =>
                      updateState((current) => ({
                        ...current,
                        settings: { ...current.settings, fadeMs: Number(event.target.value) },
                      }))
                    }
                    className="w-full rounded-xl border border-white/8 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value={0}>Off</option>
                    <option value={250}>Quick</option>
                    <option value={400}>Smooth</option>
                    <option value={700}>Long</option>
                  </select>
                </label>

                <div className="panel-muted rounded-2xl px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Now Playing</div>
                  <div className="mt-1 truncate text-sm font-semibold text-white">
                    {activePlayback ? activePlayback.playerName : "Ready"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button type="button" onClick={togglePause} className="icon-button">
                    {isPaused ? <CirclePlay className="h-5 w-5" /> : <CirclePause className="h-5 w-5" />}
                  </button>
                  <button type="button" onClick={stopAll} className="icon-button danger">
                    <Square className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {persistError ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              Browser storage is full. New audio may not persist after reload.
            </div>
          ) : null}
        </header>

        <main className="flex-1">
          {activeTab === "walkups" ? (
            <WalkupsView
              players={filteredPlayers}
              activePlayback={activePlayback}
              playbackProgress={playbackProgress}
              playbackTimeMs={playbackTimeMs}
              playbackTotalMs={playbackTotalMs}
              lineupCursorId={lineupCursorId}
              onPlayPlayer={playPlayerFromWalkups}
              onPlayCurrentBatter={playTrackedBatter}
              onPlayNextBatter={playNextBatter}
              onReorderPlayers={reorderPlayers}
              onEditPlayer={(playerId) => {
                setEditingPlayerId(playerId);
                setEditingReturnTab("walkups");
                setActiveTab("setup");
              }}
            />
          ) : null}

          {activeTab === "soundboard" ? (
            <SoundboardPage
              clips={freestyleGroups.effects}
              onPlayClip={playClip}
            />
          ) : null}

          {activeTab === "freestyle" ? (
            <FreestylePage
              groups={freestyleGroups}
              onPlayClip={playClip}
            />
          ) : null}

          {activeTab === "setup" ? (
            <PlayerManager
              players={filteredPlayers}
              libraries={libraries}
              searchValue={settings.search}
              libraryGroup={settings.libraryGroup}
              onLibraryGroupChange={(value) =>
                updateState((current) => ({
                  ...current,
                  settings: { ...current.settings, libraryGroup: value },
                }))
              }
              onSearchChange={(value) =>
                updateState((current) => ({
                  ...current,
                  settings: { ...current.settings, search: value },
                }))
              }
              onAddPlayer={addPlayer}
              onUpdatePlayer={updatePlayer}
              onRemovePlayer={removePlayer}
              onAddLibraryClip={addLibraryClip}
              onRemoveLibraryClip={removeLibraryClip}
              onQueueClip={() => {}}
              onPlayPlayer={playPlayer}
              onPreviewClip={playClip}
              onPreviewSequence={async ({ items, playerName = "" }) => {
                await playSequence({
                  items,
                  descriptor: {
                    type: "player",
                    playerId: "draft-player",
                    playerName: playerName || "Draft Sequence",
                  },
                });
              }}
              activePlayback={activePlayback}
              isPlaybackPaused={isPaused}
              playbackTimeMs={playbackTimeMs}
              onTogglePause={togglePause}
              onDownloadTeamSnapshot={downloadTeamSnapshot}
              editingPlayerId={editingPlayerId}
              onEditingPlayerHandled={() => setEditingPlayerId("")}
              editingReturnTab={editingReturnTab}
              onEditingReturnHandled={() => {
                if (editingReturnTab) {
                  setActiveTab(editingReturnTab);
                  setEditingReturnTab("");
                }
              }}
            />
          ) : null}
        </main>
      </div>

      <button
        type="button"
        onClick={stopAll}
        className="fixed bottom-[calc(4.6rem+env(safe-area-inset-bottom))] right-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-rose-300/35 bg-rose-500 text-white shadow-[0_14px_28px_rgba(244,63,94,0.3)] transition hover:bg-rose-400 sm:bottom-[calc(4.9rem+env(safe-area-inset-bottom))] sm:right-4 sm:h-12 sm:w-12"
        aria-label="Stop all audio"
        title="Stop all audio"
      >
        <Square className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/90 px-2 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-4 gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1.25rem] px-1 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] leading-none transition sm:px-3 sm:py-3 sm:text-xs sm:tracking-[0.12em] ${
                  active
                    ? "bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/30"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                <span className="max-w-full truncate">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function WalkupsView({
  players,
  activePlayback,
  playbackProgress,
  lineupCursorId,
  onPlayPlayer,
  onPlayCurrentBatter,
  onPlayNextBatter,
  onReorderPlayers,
  onEditPlayer,
}) {
  const [draggedPlayerId, setDraggedPlayerId] = useState("");
  const currentBatter =
    players.find((player) => player.id === lineupCursorId) ?? players[0] ?? null;
  const currentIndex = currentBatter
    ? players.findIndex((player) => player.id === currentBatter.id)
    : -1;
  const nextBatter =
    players.length > 1 && currentIndex >= 0
      ? players[(currentIndex + 1) % players.length]
      : currentBatter;

  const handleDragStart = (event, player) => {
    setDraggedPlayerId(player.id);
    event.dataTransfer.effectAllowed = "move";

    const sourceRow = event.currentTarget.closest("[data-lineup-row='true']");
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
    <div className="space-y-4">
    <section className="glass-panel rounded-[1.6rem] border border-white/8 p-3 sm:rounded-[2rem] sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-300 sm:text-xs sm:tracking-[0.3em]">
            Batting Order
          </div>
          <div className="mt-1.5 max-w-[15rem] text-[13px] leading-5 text-slate-400 sm:mt-2 sm:max-w-none sm:text-sm">
            Tap a player to run their walk-up sequence.
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:text-xs sm:tracking-[0.22em]">
          {players.length} Players
        </div>
      </div>
      <div className="space-y-3">
        {players.map((player) => {
          const active = activePlayback?.playerId === player.id;
          const isCurrentBatter = lineupCursorId === player.id;

          return (
            <div
              key={player.id}
              data-lineup-row="true"
              draggable
              onDragStart={(event) => handleDragStart(event, player)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!draggedPlayerId || draggedPlayerId === player.id) {
                  return;
                }

                onReorderPlayers(draggedPlayerId, player.id, players);
                setDraggedPlayerId(player.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDraggedPlayerId("");
              }}
              onDragEnd={() => setDraggedPlayerId("")}
              className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-[1.35rem] border px-2.5 py-2.5 text-left transition sm:gap-3 sm:rounded-[1.7rem] sm:px-3 sm:py-3 ${
                active
                  ? "border-cyan-300/70 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),rgba(14,165,233,0.14)_45%,rgba(8,47,73,0.65))] shadow-[0_22px_50px_rgba(14,165,233,0.2)]"
                  : isCurrentBatter
                    ? "border-emerald-300/45 bg-[linear-gradient(135deg,rgba(34,197,94,0.18),rgba(15,23,42,0.94)_45%,rgba(2,6,23,0.98))] shadow-[0_18px_40px_rgba(34,197,94,0.12)]"
                    : draggedPlayerId === player.id
                      ? "border-cyan-300/50 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(15,23,42,0.94)_45%,rgba(2,6,23,0.98))]"
                  : "border-sky-400/15 bg-[linear-gradient(135deg,rgba(8,47,73,0.9),rgba(15,23,42,0.94)_40%,rgba(2,6,23,0.98))] shadow-[0_14px_36px_rgba(2,6,23,0.45)] hover:border-cyan-300/30 hover:shadow-[0_18px_42px_rgba(14,165,233,0.14)]"
              }`}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(34,211,238,0.16),transparent_34%),linear-gradient(90deg,rgba(255,255,255,0.04),transparent_24%)]" />
              {active ? (
                <div
                  className="absolute inset-y-0 left-0 rounded-[1.6rem] bg-gradient-to-r from-cyan-200/34 via-sky-300/24 to-sky-200/8 transition-[width] duration-150 ease-out"
                  style={{ width: `${Math.max(0, Math.min(1, playbackProgress)) * 100}%` }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => onPlayPlayer(player, players)}
                className="relative z-10 flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border text-sm font-black uppercase tracking-[0.03em] sm:h-12 sm:w-12 sm:rounded-[1.15rem] sm:text-base ${
                    active
                      ? "border-cyan-100/70 bg-cyan-100 text-slate-950"
                      : isCurrentBatter
                        ? "border-emerald-200/35 bg-emerald-300/12 text-emerald-100"
                      : "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
                  }`}
                >
                  {player.jerseyNumber || "--"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-black tracking-[0.01em] text-white sm:text-xl">
                    {player.name}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-cyan-100/70 sm:text-[11px] sm:tracking-[0.18em]">
                    {player.positionLabel || "Utility"}
                  </div>
                </div>
                {active ? (
                  <div className="hidden rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-950 sm:block">
                    Live
                  </div>
                ) : isCurrentBatter ? (
                  <div className="hidden rounded-full bg-emerald-300/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 sm:block">
                    Current
                  </div>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onEditPlayer(player.id)}
                className="secondary-button relative z-10 h-9 rounded-full border-cyan-300/20 bg-slate-950/55 px-2.5 text-[11px] uppercase tracking-[0.12em] text-cyan-50 hover:bg-cyan-300/10 sm:h-10 sm:px-3 sm:text-xs sm:tracking-[0.14em]"
              >
                Edit
              </button>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.stopPropagation();
                  handleDragStart(event, player);
                }}
                className="icon-button relative z-10 hidden cursor-grab active:cursor-grabbing sm:flex"
                aria-label={`Drag ${player.name}`}
                title="Drag to reorder lineup"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        {players.length === 0 ? (
          <div className="rounded-[1.8rem] border border-dashed border-white/10 px-5 py-10 text-sm text-slate-500">
            Add players in Setup to build the batting order.
          </div>
        ) : null}
      </div>
    </section>
    {players.length && currentBatter && nextBatter ? (
      <div className="fixed inset-x-2 bottom-[4.4rem] z-20 mx-auto max-w-4xl sm:inset-x-4 sm:bottom-24">
        <div className="grid grid-cols-2 gap-1.5 rounded-[1rem] border border-white/8 bg-slate-950/84 p-1.5 shadow-[0_14px_34px_rgba(2,6,23,0.42)] backdrop-blur-xl sm:rounded-[1.7rem] sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div className="flex items-center gap-2 rounded-[0.95rem] border border-emerald-300/18 bg-[linear-gradient(135deg,rgba(34,197,94,0.16),rgba(15,23,42,0.96)_40%,rgba(2,6,23,0.98))] px-2 py-1.5 shadow-[0_14px_32px_rgba(34,197,94,0.1)] sm:gap-3 sm:rounded-[1.7rem] sm:px-3 sm:py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] bg-emerald-300/16 text-xs font-black text-emerald-100 sm:h-12 sm:w-12 sm:rounded-[1.1rem] sm:text-lg">
            {currentBatter.jerseyNumber || "--"}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300 sm:text-[11px] sm:tracking-[0.22em]">
              Current
            </div>
            <div className="truncate text-[13px] font-black text-white sm:text-base">{currentBatter.name}</div>
            <div className="hidden text-[11px] text-emerald-100/70 sm:block sm:text-xs">{currentBatter.positionLabel || "Utility"}</div>
          </div>
          <button
            type="button"
            onClick={() => onPlayCurrentBatter(currentBatter, players)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
          >
            <CirclePlay className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sr-only sm:not-sr-only sm:text-xs sm:font-black sm:uppercase sm:tracking-[0.14em]">Play</span>
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-[0.95rem] border border-orange-300/18 bg-[linear-gradient(135deg,rgba(251,146,60,0.16),rgba(15,23,42,0.96)_40%,rgba(2,6,23,0.98))] px-2 py-1.5 shadow-[0_14px_32px_rgba(251,146,60,0.1)] sm:gap-3 sm:rounded-[1.7rem] sm:px-3 sm:py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] bg-orange-300/16 text-xs font-black text-orange-100 sm:h-12 sm:w-12 sm:rounded-[1.1rem] sm:text-lg">
            {nextBatter.jerseyNumber || "--"}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-orange-300 sm:text-[11px] sm:tracking-[0.22em]">
              Next
            </div>
            <div className="truncate text-[13px] font-black text-white sm:text-base">{nextBatter.name}</div>
            <div className="hidden text-[11px] text-orange-100/70 sm:block sm:text-xs">Up next</div>
          </div>
          <button
            type="button"
            onClick={() => onPlayNextBatter(players)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-400 text-slate-950 shadow-lg shadow-orange-500/20 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
          >
            <CirclePlay className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sr-only sm:not-sr-only sm:text-xs sm:font-black sm:uppercase sm:tracking-[0.14em]">Next</span>
          </button>
        </div>
        </div>
      </div>
    ) : null}
    </div>
  );
}

function SoundboardPage({ clips, onPlayClip }) {
  return (
    <section className="glass-panel rounded-[2rem] border border-white/8 p-4 sm:p-5">
      <div className="mb-4 text-sm text-slate-400">
        One-tap effects for home runs, strikeouts, hype, and game moments.
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {clips.map((clip) => (
          <button
            key={clip.id}
            type="button"
            onClick={() => onPlayClip({ clip })}
            className="rounded-[1.8rem] border border-white/8 bg-slate-950/55 px-5 py-5 text-left transition hover:border-sky-300/20 hover:bg-slate-900/70"
          >
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Effect</div>
            <div className="mt-3 text-2xl font-black uppercase tracking-[0.05em] text-white">
              {clip.nickname}
            </div>
          </button>
        ))}

        {clips.length === 0 ? (
          <div className="rounded-[1.8rem] border border-dashed border-white/10 px-5 py-10 text-sm text-slate-500">
            Add effect clips in Setup.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FreestylePage({ groups, onPlayClip }) {
  return (
    <div className="space-y-3">
      {FREESTYLE_GROUPS.map((group) => (
        <section
          key={group.id}
          className={`glass-panel rounded-[1.7rem] border p-3 sm:p-4 ${FREESTYLE_GROUP_STYLES[group.id].panel}`}
        >
          <div className={`mb-3 text-[11px] font-semibold uppercase tracking-[0.28em] ${FREESTYLE_GROUP_STYLES[group.id].header}`}>
            {group.label}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
            {(groups[group.id] ?? []).map((clip) => (
              <button
                key={`${group.id}-${clip.playerId ?? "global"}-${clip.id}`}
                type="button"
                onClick={() =>
                  onPlayClip({
                    clip,
                    playerId: clip.playerId ?? "",
                    playerName: clip.playerName ?? "",
                  })
                }
                className={`rounded-[1.2rem] border px-3 py-3 text-left transition ${FREESTYLE_GROUP_STYLES[group.id].button}`}
              >
                <div className="line-clamp-2 text-sm font-black uppercase tracking-[0.04em] text-white">
                  {clip.playerName || clip.nickname}
                </div>
                {clip.playerName && clip.playerName !== clip.nickname ? (
                  <div
                    className={`mt-2 inline-flex max-w-full rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${FREESTYLE_GROUP_STYLES[group.id].chip}`}
                  >
                    <span className="truncate">{clip.playerName}</span>
                  </div>
                ) : null}
              </button>
            ))}

            {(groups[group.id] ?? []).length === 0 ? (
              <div className="rounded-[1.2rem] border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                No clips in this group yet.
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
