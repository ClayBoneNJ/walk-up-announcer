import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CirclePause,
  CirclePlay,
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
  getSongClipDurationMs,
  loadState,
  normalizePlayer,
  resolvePlayerSequence,
  saveState,
} from "./lib/storage";
import { downloadDiagnosticReport, recordDiagnosticEvent } from "./lib/diagnostics";

const TABS = [
  { id: "walkups", label: "Walkups", shortLabel: "Walkups", icon: Users },
  { id: "freestyle", label: "Team", shortLabel: "Team", icon: Zap },
  { id: "soundboard", label: "Events", shortLabel: "Events", icon: AudioLines },
  { id: "setup", label: "Roster", shortLabel: "Roster", icon: Settings2 },
];

const APP_BUILD_LABEL = "v c2b5f44";

const FREESTYLE_GROUP_STYLES = {
  announcements: {
    button:
      "border-emerald-200/55 bg-[linear-gradient(145deg,rgba(52,211,153,0.42),rgba(5,150,105,0.3)_42%,rgba(15,23,42,0.96))] shadow-[0_10px_22px_rgba(16,185,129,0.22)] hover:border-emerald-100/80",
    chip: "border-emerald-100/45 bg-emerald-200/20 text-emerald-50",
  },
  positions: {
    button:
      "border-pink-200/55 bg-[linear-gradient(145deg,rgba(244,114,182,0.4),rgba(219,39,119,0.28)_42%,rgba(15,23,42,0.96))] shadow-[0_10px_22px_rgba(236,72,153,0.2)] hover:border-pink-100/80",
    chip: "border-pink-100/45 bg-pink-200/18 text-pink-50",
  },
  numbers: {
    button:
      "border-yellow-200/60 bg-[linear-gradient(145deg,rgba(250,204,21,0.42),rgba(202,138,4,0.3)_42%,rgba(15,23,42,0.96))] shadow-[0_10px_22px_rgba(234,179,8,0.22)] hover:border-yellow-100/82",
    chip: "border-yellow-100/45 bg-yellow-200/22 text-yellow-50",
  },
  names: {
    button:
      "border-violet-200/55 bg-[linear-gradient(145deg,rgba(167,139,250,0.4),rgba(124,58,237,0.28)_42%,rgba(15,23,42,0.96))] shadow-[0_10px_22px_rgba(139,92,246,0.22)] hover:border-violet-100/82",
    chip: "border-violet-100/45 bg-violet-200/20 text-violet-50",
  },
  nicknames: {
    button:
      "border-rose-200/55 bg-[linear-gradient(145deg,rgba(251,113,133,0.38),rgba(225,29,72,0.26)_42%,rgba(15,23,42,0.96))] shadow-[0_10px_22px_rgba(251,113,133,0.2)] hover:border-rose-100/8",
    chip: "border-rose-100/45 bg-rose-200/20 text-rose-50",
  },
  songs: {
    button:
      "border-red-200/60 bg-[linear-gradient(145deg,rgba(248,113,113,0.44),rgba(220,38,38,0.3)_42%,rgba(15,23,42,0.96))] shadow-[0_10px_22px_rgba(239,68,68,0.24)] hover:border-red-100/85",
    chip: "border-red-100/48 bg-red-200/22 text-red-50",
  },
};

function getFirstName(name = "") {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function getFreestyleEntries(groups) {
  const announcementEntries = [...(groups.announcements ?? [])]
    .map((clip) => ({ ...clip, groupId: "announcements" }))
    .sort((left, right) => {
      const leftIsPitching = ["coming to the mound", "now pitching"].includes(String(left.nickname || "").trim().toLowerCase());
      const rightIsPitching = ["coming to the mound", "now pitching"].includes(String(right.nickname || "").trim().toLowerCase());

      if (leftIsPitching === rightIsPitching) {
        return 0;
      }

      return leftIsPitching ? 1 : -1;
    });

  return [
    ...announcementEntries,
    ...(groups.positions ?? []).map((clip) => ({ ...clip, groupId: "positions" })),
    ...(groups.numbers ?? []).map((clip) => ({ ...clip, groupId: "numbers" })),
    ...(groups.names ?? []).map((clip) => ({ ...clip, groupId: "names" })),
    ...(groups.nicknames ?? []).map((clip) => ({ ...clip, groupId: "nicknames" })),
    ...(groups.songs ?? []).map((clip) => ({ ...clip, groupId: "songs" })),
  ];
}

function getFreestyleClipLabel(clip) {
  const nickname = String(clip.nickname || "").trim();

  if (clip.groupId === "announcements") {
    const normalized = nickname.toLowerCase();
    if (normalized === "coming to the plate") {
      return "to the plate";
    }
    if (normalized === "coming to the mound") {
      return "to the mound";
    }
  }

  return clip.groupId === "songs" ? nickname : clip.playerName || nickname;
}

function getFreestyleClipAccent(clip) {
  const normalized = String(clip.nickname || "").trim().toLowerCase();

  if (clip.groupId === "announcements" && normalized === "coming to the plate") {
    return "";
  }

  if (
    clip.groupId === "announcements" &&
    (normalized === "coming to the mound" || normalized === "now pitching")
  ) {
    return "before:absolute before:inset-0 before:bg-[linear-gradient(145deg,rgba(74,222,128,0.42),rgba(22,163,74,0.28))] before:content-['']";
  }

  return "";
}

export default function App() {
  const [appState, setAppState] = useState(() => loadState());
  const [activeTab, setActiveTab] = useState("walkups");
  const [persistError, setPersistError] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [editingReturnTab, setEditingReturnTab] = useState("");
  const [lineupCursorId, setLineupCursorId] = useState("");
  const [diagnosticTapCount, setDiagnosticTapCount] = useState(0);
  const diagnosticTapTimerRef = useRef(null);

  useEffect(() => {
    setPersistError(!saveState(appState));
  }, [appState]);

  useEffect(() => {
    recordDiagnosticEvent("app.loaded", {
      activeTab: "walkups",
      publishedRevision: appState?.publishedRevision ?? "",
    });
  }, []);

  useEffect(() => {
    const handleError = (event) => {
      recordDiagnosticEvent("window.error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    const handleRejection = (event) => {
      recordDiagnosticEvent("window.unhandledrejection", {
        reason: event.reason,
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("diagnostics") !== "download") {
      return;
    }

    downloadDiagnosticReport(appState);
    params.delete("diagnostics");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [appState]);

  useEffect(() => {
    return () => {
      if (diagnosticTapTimerRef.current) {
        window.clearTimeout(diagnosticTapTimerRef.current);
      }
    };
  }, []);

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
      players: [normalizePlayer(player), ...current.players],
    }));
  };

  const updatePlayer = (playerId, updater) => {
    updateState((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? normalizePlayer(updater(player)) : player,
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
    recordDiagnosticEvent("walkup.play.requested", {
      playerId: player.id,
      playerName: player.name,
      songId: player.songClip?.id || "",
      songName: player.songClip?.nickname || "",
    });
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
    recordDiagnosticEvent("clip.play.requested", {
      clipId: clip.id,
      clipName: clip.nickname,
      playerId,
      playerName,
    });
    const sequenceItem =
      clip.group === "songs"
        ? {
            ...clip,
            slot: "song",
            startMs: 0,
            durationMs: getSongClipDurationMs(clip),
            endMs: getSongClipDurationMs(clip),
            playerId,
            playerName,
          }
        : { ...clip, playerId, playerName };
    await playSequence({
      items: [sequenceItem],
      descriptor: {
        type: "clip",
        playerId,
        playerName: playerName || clip.nickname,
      },
      interruptFadeOut: false,
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(21,91,185,0.2),transparent_32%),linear-gradient(180deg,_#08111f_0%,_#050914_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-56 pt-4 sm:px-6 sm:pb-48 lg:px-8">
        <header className="glass-panel mb-4 rounded-[2rem] border border-white/10 p-4 shadow-2xl shadow-sky-950/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.28em] text-white/35">
                {APP_BUILD_LABEL}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-200">
                <Waves className="h-3.5 w-3.5" />
                Walk-Up Announcer
              </div>
              <h1
                className="mt-3 text-3xl font-black uppercase tracking-[0.08em] text-white"
                onClick={() => {
                  if (diagnosticTapTimerRef.current) {
                    window.clearTimeout(diagnosticTapTimerRef.current);
                  }

                  const nextCount = diagnosticTapCount + 1;
                  if (nextCount >= 7) {
                    setDiagnosticTapCount(0);
                    downloadDiagnosticReport(appState);
                    return;
                  }

                  setDiagnosticTapCount(nextCount);
                  diagnosticTapTimerRef.current = window.setTimeout(() => {
                    setDiagnosticTapCount(0);
                  }, 1800);
                }}
              >
                {activeTab === "walkups" ? "Walkups" : activeTab === "soundboard" ? "Events" : activeTab === "freestyle" ? "Team" : "Roster"}
              </h1>
            </div>

            {activeTab === "walkups" ? (
              <div
                className={`grid gap-3 ${
                  activeTab === "walkups"
                    ? "sm:grid-cols-[minmax(260px,1.1fr)]"
                    : "sm:grid-cols-[1.1fr,180px,180px,auto]"
                }`}
              >
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
              activePlayback={activePlayback}
              playbackProgress={playbackProgress}
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
        onClick={() => stopAll(true)}
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
  onReorderPlayers,
  onEditPlayer,
}) {
  const [isReorderMode, setIsReorderMode] = useState(false);
  const currentBatter =
    players.find((player) => player.id === lineupCursorId) ?? players[0] ?? null;
  const currentIndex = currentBatter
    ? players.findIndex((player) => player.id === currentBatter.id)
    : -1;

  const movePlayerByStep = (playerId, direction) => {
    const currentPlayerIndex = players.findIndex((player) => player.id === playerId);
    if (currentPlayerIndex === -1) {
      return;
    }

    const targetIndex = currentPlayerIndex + direction;
    if (targetIndex < 0 || targetIndex >= players.length) {
      return;
    }

    const targetPlayer = players[targetIndex];
    if (!targetPlayer) {
      return;
    }

    onReorderPlayers(playerId, targetPlayer.id, players);
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsReorderMode((current) => !current)}
            className={`icon-button h-9 w-9 p-0 sm:h-10 sm:w-10 ${
              isReorderMode
                ? "border-cyan-200/60 bg-cyan-100 text-slate-950"
                : "border-cyan-300/18 bg-slate-950/55 text-cyan-50"
            }`}
            aria-label={isReorderMode ? "Done reordering batting order" : "Edit batting order"}
            title={isReorderMode ? "Done reordering" : "Edit batting order"}
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:text-xs sm:tracking-[0.22em]">
            {players.length} Players
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {players.map((player) => {
          const active = activePlayback?.playerId === player.id;
          const isCurrentBatter = lineupCursorId === player.id;
          const playerIndex = players.findIndex((entry) => entry.id === player.id);
          const canMoveUp = playerIndex > 0;
          const canMoveDown = playerIndex < players.length - 1;

          return (
            <div
              key={player.id}
              data-lineup-row="true"
              data-player-id={player.id}
              className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-[1.35rem] border px-2.5 py-2.5 text-left transition sm:gap-3 sm:rounded-[1.7rem] sm:px-3 sm:py-3 ${
                active
                  ? "border-cyan-300/70 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),rgba(14,165,233,0.14)_45%,rgba(8,47,73,0.65))] shadow-[0_22px_50px_rgba(14,165,233,0.2)]"
                  : isCurrentBatter
                    ? "border-emerald-300/45 bg-[linear-gradient(135deg,rgba(34,197,94,0.18),rgba(15,23,42,0.94)_45%,rgba(2,6,23,0.98))] shadow-[0_18px_40px_rgba(34,197,94,0.12)]"
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
                style={isReorderMode ? { display: "none" } : undefined}
              >
                Edit
              </button>
              {isReorderMode ? (
                <div className="relative z-10 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => movePlayerByStep(player.id, -1)}
                    disabled={!canMoveUp}
                    className="icon-button h-9 w-9 p-0 disabled:cursor-not-allowed disabled:opacity-35 sm:h-10 sm:w-10"
                    aria-label={`Move ${player.name} up`}
                    title="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePlayerByStep(player.id, 1)}
                    disabled={!canMoveDown}
                    className="icon-button h-9 w-9 p-0 disabled:cursor-not-allowed disabled:opacity-35 sm:h-10 sm:w-10"
                    aria-label={`Move ${player.name} down`}
                    title="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
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
    {players.length && currentBatter ? (
      <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-4xl sm:inset-x-4 sm:bottom-24">
        <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/84 p-1.5 shadow-[0_14px_34px_rgba(2,6,23,0.42)] backdrop-blur-xl sm:rounded-[1.7rem] sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <button
            type="button"
            onClick={() => onPlayCurrentBatter(currentBatter, players)}
            className="flex w-full items-center gap-2 rounded-[1rem] border border-emerald-300/18 bg-[linear-gradient(135deg,rgba(34,197,94,0.16),rgba(15,23,42,0.96)_40%,rgba(2,6,23,0.98))] px-2.5 py-2 text-left shadow-[0_14px_32px_rgba(34,197,94,0.1)] transition hover:border-emerald-200/30 hover:bg-[linear-gradient(135deg,rgba(52,211,153,0.2),rgba(15,23,42,0.96)_40%,rgba(2,6,23,0.98))] active:scale-[0.99] sm:gap-3 sm:rounded-[1.7rem] sm:px-3 sm:py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.9rem] bg-emerald-300/16 text-sm font-black text-emerald-100 sm:h-12 sm:w-12 sm:rounded-[1.1rem] sm:text-lg">
              {currentBatter.jerseyNumber || "--"}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300 sm:text-[11px] sm:tracking-[0.22em]">
                Current
              </div>
              <div className="truncate text-[14px] font-black text-white sm:text-base">{currentBatter.name}</div>
              <div className="text-[11px] text-emerald-100/70 sm:text-xs">{currentBatter.positionLabel || "Utility"}</div>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2">
              <CirclePlay className="h-4 w-4 sm:h-4 sm:w-4" />
              <span className="sr-only sm:not-sr-only sm:text-xs sm:font-black sm:uppercase sm:tracking-[0.14em]">Play</span>
            </div>
          </button>
        </div>
      </div>
    ) : null}
    </div>
  );
}

function SoundboardPage({ clips, onPlayClip }) {
  const STRIKE_THREE_IDS = new Set([
    "effect-he-gone",
    "effect-hes-outta-there",
    "effect-strike-3-hes-out",
  ]);
  const strikeThreeClips = clips.filter((clip) => STRIKE_THREE_IDS.has(clip.id));
  const crowdHypeClips = clips.filter((clip) => !STRIKE_THREE_IDS.has(clip.id));

  return (
    <div className="space-y-3">
      <section className="glass-panel rounded-[1.25rem] border border-white/8 p-2.5 sm:rounded-[1.6rem] sm:p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">
          Strike 3
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {strikeThreeClips.map((clip) => (
            <button
              key={clip.id}
              type="button"
              onClick={() => onPlayClip({ clip })}
              className="aspect-square rounded-[0.22rem] border border-amber-200/65 bg-[linear-gradient(145deg,rgba(251,191,36,0.48),rgba(217,119,6,0.36)_42%,rgba(15,23,42,0.99))] px-1.5 py-1.5 text-center shadow-[0_10px_20px_rgba(245,158,11,0.2)] transition duration-150 hover:border-amber-100/85 active:translate-y-[2px] active:scale-[0.97]"
            >
              <div className="flex h-full flex-col items-center justify-center">
                <div className="line-clamp-3 text-[11px] font-extrabold uppercase leading-[0.92] tracking-[0.01em] text-white sm:text-[12px]">
                  {clip.nickname}
                </div>
              </div>
            </button>
          ))}

          {strikeThreeClips.length === 0 ? (
            <div className="col-span-full rounded-[1rem] border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
              No strike 3 clips loaded yet.
            </div>
          ) : null}
        </div>
      </section>

      <section className="glass-panel rounded-[1.25rem] border border-white/8 p-2.5 sm:rounded-[1.6rem] sm:p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
          Crowd Hype
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {crowdHypeClips.map((clip) => (
            <button
              key={clip.id}
              type="button"
              onClick={() => onPlayClip({ clip })}
              className="aspect-square rounded-[0.22rem] border border-cyan-200/65 bg-[linear-gradient(145deg,rgba(34,211,238,0.48),rgba(8,145,178,0.36)_42%,rgba(15,23,42,0.99))] px-1.5 py-1.5 text-center shadow-[0_10px_20px_rgba(8,145,178,0.2)] transition duration-150 hover:border-cyan-100/85 active:translate-y-[2px] active:scale-[0.97]"
            >
              <div className="flex h-full flex-col items-center justify-center">
                <div className="line-clamp-3 text-[11px] font-extrabold uppercase leading-[0.92] tracking-[0.01em] text-white sm:text-[12px]">
                  {clip.nickname}
                </div>
              </div>
            </button>
          ))}

          {crowdHypeClips.length === 0 ? (
            <div className="col-span-full rounded-[1rem] border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
              No crowd hype clips loaded yet.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function FreestylePage({ groups, onPlayClip, activePlayback, playbackProgress }) {
  const entries = getFreestyleEntries(groups);

  return (
    <div className="grid auto-rows-[4.3rem] grid-cols-6 grid-flow-dense gap-1 md:grid-cols-8 xl:grid-cols-12">
      {entries.map((clip) => {
        const isActive = activePlayback?.assetId === clip.id;
        const isCompact = clip.groupId === "positions" || clip.groupId === "numbers";
        const accentClass = getFreestyleClipAccent(clip);

        return (
          <button
            key={`${clip.groupId}-${clip.playerId ?? "global"}-${clip.id}`}
            type="button"
            onClick={() =>
              onPlayClip({
                clip,
                playerId: clip.playerId ?? "",
                playerName: clip.playerName ?? "",
              })
            }
            className={`group relative overflow-hidden rounded-[0.5rem] border text-center transition duration-150 active:scale-[0.94] active:translate-y-[2px] ${
              FREESTYLE_GROUP_STYLES[clip.groupId].button
            } ${
              isCompact ? "col-span-1 px-1 py-0.5" : "col-span-2 px-1 py-0.5"
            } ${
              isActive
                ? "border-white/70 bg-white/18 shadow-[0_0_0_1px_rgba(255,255,255,0.32),0_8px_16px_rgba(255,255,255,0.14),0_0_14px_rgba(255,255,255,0.12)] ring-2 ring-white/45"
                : ""
            } ${accentClass}`}
          >
            <div className="relative z-10 flex h-full flex-col items-center justify-center">
              <div
                className={`line-clamp-2 font-extrabold uppercase leading-[0.86] tracking-[0] text-white ${
                  clip.groupId === "positions" || clip.groupId === "numbers"
                    ? "text-[13px] sm:text-[14px]"
                    : isCompact
                      ? "text-[11px] sm:text-[12px]"
                      : "text-[13px] sm:text-[15px]"
                }`}
              >
                {getFreestyleClipLabel(clip)}
              </div>
              {clip.playerName && clip.playerName !== clip.nickname ? (
                <div
                  className={`mt-0.5 inline-flex max-w-full self-center rounded-[0.35rem] border px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.04em] ${FREESTYLE_GROUP_STYLES[clip.groupId].chip}`}
                >
                  <span className="truncate">{getFirstName(clip.playerName)}</span>
                </div>
              ) : null}
            </div>
          </button>
        );
      })}

      {entries.length === 0 ? (
        <div className="col-span-full rounded-[1rem] border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
          No clips in freestyle yet.
        </div>
      ) : null}
    </div>
  );
}
