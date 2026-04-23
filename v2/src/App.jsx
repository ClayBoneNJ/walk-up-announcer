import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CirclePlay,
  Library,
  RotateCcw,
  Sparkles,
  Square,
  Users,
  Volume2,
  Waves,
} from "lucide-react";
import { usePlaybackEngine } from "./hooks/usePlaybackEngine";
import { announcementOptions, clipLibrary, players, positionOptions, screenTabs } from "./lib/sampleData";

const APP_BUILD_LABEL = "v31";
const DISPLAY_TIMELINE_DURATION_MS = 20000;
const SONG_NUDGE_MS = 250;
const PLAYER_SEQUENCES_STORAGE_KEY = "walk-up-announcer-v2-player-sequences";
const V1_POSITION_OPTIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const V1_POSITION_BY_JERSEY = {
  9: "P",
  23: "SS",
  88: "LF",
};
const clipById = new Map(clipLibrary.map((clip) => [clip.id, clip]));

function getDefaultPosition(player) {
  return player.position || V1_POSITION_BY_JERSEY[player.jerseyNumber] || "";
}

function createInitialPlayerSequences() {
  return players.map((player) => ({
    ...player,
    position: getDefaultPosition(player),
    usePositionClip: player.usePositionClip ?? false,
    sequence: player.sequence.map((event) => ({ ...event })),
  }));
}

function serializePlayerSequences(playerSequences) {
  return playerSequences.map((player) => ({
    id: player.id,
    position: player.position ?? "",
    usePositionClip: player.usePositionClip ?? false,
    sequence: player.sequence.map((event) => ({
      id: event.id,
      track: event.track,
      startMs: event.startMs,
      clipId: event.clip?.id ?? "",
    })),
  }));
}

function hydrateSavedPlayerSequences(savedPlayers) {
  const basePlayers = createInitialPlayerSequences();
  const savedPlayerMap = new Map(
    Array.isArray(savedPlayers) ? savedPlayers.map((player) => [player.id, player]) : [],
  );

  return basePlayers.map((player) => {
    const savedPlayer = savedPlayerMap.get(player.id);

    if (!savedPlayer) {
      return player;
    }

    const savedSequenceMap = new Map(
      Array.isArray(savedPlayer.sequence) ? savedPlayer.sequence.map((event) => [event.id, event]) : [],
    );

    return {
      ...player,
      position: savedPlayer.position || player.position,
      usePositionClip: savedPlayer.usePositionClip ?? player.usePositionClip ?? false,
      sequence: player.sequence.map((event) => {
        const savedEvent = savedSequenceMap.get(event.id);
        const savedClip = savedEvent?.clipId ? clipById.get(savedEvent.clipId) : null;

        if (!savedEvent) {
          return event;
        }

        return {
          ...event,
          track: savedEvent.track ?? event.track,
          startMs: typeof savedEvent.startMs === "number" ? savedEvent.startMs : event.startMs,
          clip: savedClip ?? event.clip,
        };
      }),
    };
  });
}

function loadSavedPlayerSequences() {
  if (typeof window === "undefined") {
    return createInitialPlayerSequences();
  }

  try {
    const raw = window.localStorage.getItem(PLAYER_SEQUENCES_STORAGE_KEY);

    if (!raw) {
      return createInitialPlayerSequences();
    }

    const parsed = JSON.parse(raw);
    return hydrateSavedPlayerSequences(parsed);
  } catch {
    return createInitialPlayerSequences();
  }
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

function getTrackAccent(track) {
  return track === "B" ? "track-b" : "track-a";
}

function getClipDurationMs(clip, durationBySrc) {
  return durationBySrc[clip.src] ?? clip.durationMs;
}

function getDisplayEventsForTrack(sequence, track, totalDurationMs, durationBySrc) {
  const trackEvents = sequence.filter((event) => event.track === track);

  return trackEvents.map((event) => ({
    ...event,
    displayLeft: (event.startMs / totalDurationMs) * 100,
    displayWidth: (getClipDurationMs(event.clip, durationBySrc) / totalDurationMs) * 100,
  }));
}

function getTimelineTextSizeClass(width) {
  if (width <= 7.5) {
    return "timeline-event-xs";
  }

  if (width <= 12) {
    return "timeline-event-sm";
  }

  return "timeline-event-md";
}

function getTrackACalloutEvent(sequence = []) {
  return [...sequence]
    .filter((event) => event.track === "A" && event.startMs > 0 && event.clip.group !== "names")
    .sort((left, right) => left.startMs - right.startMs)[0] ?? null;
}

function getPositionClip(positionLabel) {
  return positionOptions.find((clip) => clip.label === positionLabel) ?? null;
}

function movePlayerByDirection(playerList, playerId, direction) {
  if (!playerId || !direction) {
    return playerList;
  }

  const fromIndex = playerList.findIndex((player) => player.id === playerId);
  const toIndex = fromIndex + direction;

  if (fromIndex < 0 || toIndex < 0 || toIndex >= playerList.length) {
    return playerList;
  }

  const nextPlayers = [...playerList];
  const [movedPlayer] = nextPlayers.splice(fromIndex, 1);
  nextPlayers.splice(toIndex, 0, movedPlayer);
  return nextPlayers;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("walkups");
  const [playerSequences, setPlayerSequences] = useState(() => loadSavedPlayerSequences());
  const [isEditingBattingOrder, setIsEditingBattingOrder] = useState(false);
  const [collapsedPlayers, setCollapsedPlayers] = useState(() =>
    Object.fromEntries(players.map((player) => [player.id, true])),
  );
  const [selectedTrackAEventByPlayer, setSelectedTrackAEventByPlayer] = useState(() =>
    Object.fromEntries(
      players.map((player) => [
        player.id,
        player.sequence.find((event) => event.track === "A")?.id ?? "",
      ]),
    ),
  );
  const [durationBySrc, setDurationBySrc] = useState({});
  const warmSources = useMemo(
    () => [...new Set(clipLibrary.map((clip) => clip.src).filter(Boolean))],
    [],
  );
  const {
    activePlayback,
    audioReadyState,
    primeSources,
    resetEngine,
    playClipNow,
    playSequence,
    fadeOutAndStopAll,
  } = usePlaybackEngine();

  useEffect(() => {
    let cancelled = false;

    const loadDurations = async () => {
      const durationEntries = await Promise.all(
        clipLibrary.map(
          (clip) =>
            new Promise((resolve) => {
              if (!clip?.src) {
                resolve([clip.src, clip.durationMs]);
                return;
              }

              const audio = new Audio();

              const finish = (durationMs) => {
                audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
                audio.removeEventListener("error", handleError);
                resolve([clip.src, durationMs]);
              };

              const handleLoadedMetadata = () => {
                const durationMs =
                  Number.isFinite(audio.duration) && audio.duration > 0
                    ? Math.round(audio.duration * 1000)
                    : clip.durationMs;
                finish(durationMs);
              };

              const handleError = () => {
                finish(clip.durationMs);
              };

              audio.preload = "metadata";
              audio.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
              audio.addEventListener("error", handleError, { once: true });
              audio.src = clip.src;
            }),
        ),
      );

      if (cancelled) {
        return;
      }

      setDurationBySrc(Object.fromEntries(durationEntries));
    };

    loadDurations();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleArmAudio = async () => {
    await primeSources(warmSources);
  };

  const persistPlayerSequences = (nextPlayerSequences) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PLAYER_SEQUENCES_STORAGE_KEY,
      JSON.stringify(serializePlayerSequences(nextPlayerSequences)),
    );
  };

  const handleBattingOrderToggle = () => {
    if (isEditingBattingOrder) {
      persistPlayerSequences(playerSequences);
    }

    setIsEditingBattingOrder((current) => !current);
  };

  const movePlayerInOrder = (playerId, direction) => {
    if (!isEditingBattingOrder) {
      return;
    }

    setPlayerSequences((currentPlayers) =>
      movePlayerByDirection(currentPlayers, playerId, direction),
    );
  };

  const updateAnnouncement = (playerId, announcementId) => {
    const nextAnnouncement = announcementOptions.find((clip) => clip.id === announcementId);

    if (!nextAnnouncement) {
      return;
    }

    setPlayerSequences((currentPlayers) =>
      currentPlayers.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        const currentAnnouncement = player.sequence.find(
          (event) => event.track === "A" && event.startMs === 0,
        );

        if (!currentAnnouncement) {
          return player;
        }

        const startShiftMs =
          getClipDurationMs(nextAnnouncement, durationBySrc) -
          getClipDurationMs(currentAnnouncement.clip, durationBySrc);

        return {
          ...player,
          sequence: player.sequence.map((event) =>
            event.track === "A" && event.startMs === 0
              ? {
                  ...event,
                  clip: nextAnnouncement,
                }
              : event.startMs > 0
                ? {
                    ...event,
                    startMs: Math.max(0, event.startMs + startShiftMs),
                  }
              : event,
          ),
        };
      }),
    );
  };

  const nudgeSongStart = (playerId, direction) => {
    setPlayerSequences((currentPlayers) =>
      currentPlayers.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        const songEvent = player.sequence.find((event) => event.track === "B");

        if (!songEvent) {
          return player;
        }

        const nudgedSongStart = Math.max(0, songEvent.startMs + (direction * SONG_NUDGE_MS));

        return {
          ...player,
          sequence: player.sequence.map((event) =>
            event.id === songEvent.id
              ? {
                  ...event,
                  startMs: nudgedSongStart,
                }
              : event,
          ),
        };
      }),
    );
  };

  const nudgeTrackAEvent = (playerId, eventId, direction) => {
    if (!eventId) {
      return;
    }

    setPlayerSequences((currentPlayers) =>
      currentPlayers.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        return {
          ...player,
          sequence: player.sequence.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  startMs: Math.max(0, event.startMs + (direction * SONG_NUDGE_MS)),
                }
              : event,
          ),
        };
      }),
    );
  };

  const updatePlayerPosition = (playerId, position) => {
    setPlayerSequences((currentPlayers) =>
      currentPlayers.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        const nextPositionClip = getPositionClip(position);

        if (!player.usePositionClip || !nextPositionClip) {
          return {
            ...player,
            position,
          };
        }

        const currentCalloutEvent = getTrackACalloutEvent(player.sequence);

        if (!currentCalloutEvent) {
          return {
            ...player,
            position,
          };
        }

        const startShiftMs =
          getClipDurationMs(nextPositionClip, durationBySrc) -
          getClipDurationMs(currentCalloutEvent.clip, durationBySrc);

        return {
          ...player,
          position,
          sequence: player.sequence.map((event) =>
            event.id === currentCalloutEvent.id
              ? {
                  ...event,
                  clip: nextPositionClip,
                }
              : event.startMs > currentCalloutEvent.startMs
                ? {
                    ...event,
                    startMs: Math.max(0, event.startMs + startShiftMs),
                  }
              : event,
          ),
        };
      }),
    );
  };

  const updatePositionCalloutUsage = (playerId, usePositionClip) => {
    setPlayerSequences((currentPlayers) =>
      currentPlayers.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        const nextPosition = player.position || getDefaultPosition(player);
        const currentCalloutEvent = getTrackACalloutEvent(player.sequence);
        const nextPositionClip = getPositionClip(nextPosition);
        const nextNumberClip = clipLibrary.find(
          (clip) => clip.group === "numbers" && clip.label === `#${player.jerseyNumber}`,
        );
        const replacementClip = usePositionClip ? nextPositionClip : nextNumberClip;

        if (!currentCalloutEvent || !replacementClip) {
          return {
            ...player,
            position: nextPosition,
            usePositionClip,
          };
        }

        const startShiftMs =
          getClipDurationMs(replacementClip, durationBySrc) -
          getClipDurationMs(currentCalloutEvent.clip, durationBySrc);

        return {
          ...player,
          position: nextPosition,
          usePositionClip,
          sequence: player.sequence.map((event) =>
            event.id === currentCalloutEvent.id
              ? {
                  ...event,
                  clip: replacementClip,
                }
              : event.startMs > currentCalloutEvent.startMs
                ? {
                    ...event,
                    startMs: Math.max(0, event.startMs + startShiftMs),
                  }
              : event,
          ),
        };
      }),
    );
  };

  const activePlayerId =
    activePlayback?.type === "sequence" ? activePlayback.playerId : activePlayback?.playerId || "";

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div className="hero-topline">{APP_BUILD_LABEL}</div>
        <h1>Walk-Up Announcer V2</h1>
        <p>
          Soundboard-first, mobile-first, and sequence-aware. Every live action is a button
          trigger, and every player walkup is just timed soundboard events across two tracks.
        </p>

        <div className="control-row">
          <button
            type="button"
            onClick={handleArmAudio}
            className="primary-action"
          >
            <Waves className="button-icon" />
            Arm Audio
          </button>
          <button
            type="button"
            onClick={resetEngine}
            className="secondary-action"
          >
            <RotateCcw className="button-icon" />
            Reset Audio
          </button>
          <button
            type="button"
            onClick={() => fadeOutAndStopAll()}
            className="danger-action"
          >
            <Square className="button-icon" />
            Fade All
          </button>
        </div>

        <div className="ready-row">
          <span className={`ready-pill ${audioReadyState.offline ? "ready-pill-on" : ""}`}>
            {audioReadyState.offline ? "Offline Ready" : "Offline Loading"}
          </span>
          <span className={`ready-pill ${audioReadyState.armed ? "ready-pill-on" : ""}`}>
            {audioReadyState.armed ? "Audio Armed" : "Tap Arm Audio"}
          </span>
          <span className={`ready-pill ${activePlayback ? "ready-pill-live" : ""}`}>
            {activePlayback
              ? activePlayback.type === "sequence"
                ? `Live Sequence: ${activePlayback.playerName}`
                : `Live Clip: ${activePlayback.clipName}`
              : "Idle"}
          </span>
        </div>
      </header>

      <nav className="tab-bar">
        {screenTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`tab-button ${activeTab === tab.id ? "tab-button-active" : ""}`}
            >
              <Icon className="tab-icon" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="content-grid">
        {activeTab === "walkups" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Walkups</div>
                <h2>Player Sequences</h2>
                <p>
                  Voice clips live on Track A. Songs start on Track B when you want the overlap
                  to kick in.
                </p>
              </div>

              <button
                type="button"
                onClick={handleBattingOrderToggle}
                className={`player-edit-button ${isEditingBattingOrder ? "player-edit-button-active" : ""}`}
              >
                <Library className="button-icon" />
                <span>{isEditingBattingOrder ? "Done Order" : "Edit Batting Order"}</span>
              </button>
            </div>

            <div className="batting-order-shell">
              <div className="batting-order-header">
                <span className="panel-kicker">Batting Order</span>
                <span className="batting-order-hint">
                  {isEditingBattingOrder ? "Tap the arrows on each pill, then tap Done Order." : "Tap Edit Batting Order to rearrange."}
                </span>
              </div>

              <div className="batting-order-pills">
                {playerSequences.map((player, index) => {
                  return (
                    <div
                      key={player.id}
                      className={`batting-order-pill ${isEditingBattingOrder ? "batting-order-pill-editing" : ""}`}
                      aria-label={`Batting order ${index + 1}: ${player.name}`}
                    >
                      <span className="batting-order-pill-index">{index + 1}</span>
                      <span className="batting-order-pill-number">#{player.jerseyNumber}</span>
                      <span className="batting-order-pill-name">{player.name}</span>

                      {isEditingBattingOrder ? (
                        <span className="batting-order-pill-controls">
                          <button
                            type="button"
                            onClick={() => movePlayerInOrder(player.id, -1)}
                            className="batting-order-arrow"
                            aria-label={`Move ${player.name} up in batting order`}
                            disabled={index === 0}
                          >
                            <ChevronUp className="button-icon" />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePlayerInOrder(player.id, 1)}
                            className="batting-order-arrow"
                            aria-label={`Move ${player.name} down in batting order`}
                            disabled={index === playerSequences.length - 1}
                          >
                            <ChevronDown className="button-icon" />
                          </button>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="player-grid">
              {playerSequences.map((player) => {
                const trackAEvents = getDisplayEventsForTrack(
                  player.sequence,
                  "A",
                  DISPLAY_TIMELINE_DURATION_MS,
                  durationBySrc,
                );
                const trackBEvents = getDisplayEventsForTrack(
                  player.sequence,
                  "B",
                  DISPLAY_TIMELINE_DURATION_MS,
                  durationBySrc,
                );
                const selectedTrackAEventId = selectedTrackAEventByPlayer[player.id] ?? "";
                const selectedTrackAEvent =
                  player.sequence.find((event) => event.id === selectedTrackAEventId && event.track === "A") ??
                  trackAEvents[0] ??
                  null;
                const songEvent = player.sequence.find((event) => event.track === "B");
                const isCollapsed = collapsedPlayers[player.id] ?? false;

                return (
                  <article
                    key={player.id}
                    className={`player-card ${isCollapsed ? "player-card-collapsed" : "player-card-expanded"} ${activePlayerId === player.id ? "player-card-live" : ""}`}
                  >
                  <div className="player-meta">
                    <div className="player-identity">
                      <div className="player-number-badge">
                        #{player.jerseyNumber}
                      </div>
                      <div className="player-copy">
                        <div className="player-name-row">
                          <h3>{player.name}</h3>
                          <label className="player-callout-toggle">
                            <input
                              type="checkbox"
                              checked={player.usePositionClip ?? false}
                              onChange={(event) =>
                                updatePositionCalloutUsage(player.id, event.target.checked)
                              }
                            />
                            <span>Use Pos</span>
                          </label>
                          <span className="player-position-label">Pos</span>
                          <select
                            value={player.position ?? ""}
                            onChange={(event) => updatePlayerPosition(player.id, event.target.value)}
                            className="player-position-select"
                            aria-label={`${player.name} position`}
                          >
                            {V1_POSITION_OPTIONS.map((position) => (
                              <option key={position} value={position}>
                                {position}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="player-actions">
                      {activePlayerId === player.id ? <span className="player-status-pill">Current</span> : null}

                      <button
                        type="button"
                        onClick={() => playSequence(player)}
                        className="primary-action compact"
                      >
                        <CirclePlay className="button-icon" />
                        Play Walkup
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isCollapsed) {
                            persistPlayerSequences(playerSequences);
                          }

                          setCollapsedPlayers((current) => ({
                            ...current,
                            [player.id]: !isCollapsed,
                          }));
                        }}
                        className="player-edit-button"
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${player.name} sequence editor`}
                      >
                        <span>{isCollapsed ? "Edit" : "Done"}</span>
                        {isCollapsed ? <ChevronDown className="button-icon" /> : <ChevronUp className="button-icon" />}
                      </button>
                    </div>
                  </div>

                    <div className="player-config-row">
                      <div className={`player-config-field ${isCollapsed ? "player-config-field-collapsed" : ""}`}>
                        {!isCollapsed ? <span>Announcement</span> : null}
                        <div
                          className={`announcement-button-row ${isCollapsed ? "announcement-button-row-collapsed" : ""}`}
                          role="group"
                          aria-label={`${player.name} announcement`}
                        >
                          {announcementOptions.map((clip) => {
                            const selected =
                              player.sequence.find((event) => event.track === "A" && event.startMs === 0)?.clip.id ===
                              clip.id;

                            return (
                              <button
                                key={clip.id}
                                type="button"
                                onClick={() => updateAnnouncement(player.id, clip.id)}
                                className={`announcement-option-button ${selected ? "announcement-option-button-active" : ""}`}
                              >
                                {clip.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {!isCollapsed ? (
                    <>
                    <div className="timeline-shell">
                      <div className="timeline-lane">
                        <div className="timeline-lane-toolbar">
                          <button
                            type="button"
                            onClick={() => nudgeTrackAEvent(player.id, selectedTrackAEvent?.id, -1)}
                            className="timeline-arrow-button"
                            aria-label={`Move selected ${player.name} announcement clip earlier`}
                            disabled={!selectedTrackAEvent}
                          >
                            <ChevronLeft className="button-icon" />
                          </button>
                          <span className="timeline-lane-readout">
                            {selectedTrackAEvent
                              ? `${selectedTrackAEvent.clip.label} starts ${formatMs(selectedTrackAEvent.startMs)}`
                              : "Select an announcement clip"}
                          </span>
                          <button
                            type="button"
                            onClick={() => nudgeTrackAEvent(player.id, selectedTrackAEvent?.id, 1)}
                            className="timeline-arrow-button"
                            aria-label={`Move selected ${player.name} announcement clip later`}
                            disabled={!selectedTrackAEvent}
                          >
                            <ChevronRight className="button-icon" />
                          </button>
                        </div>
                        <div className="timeline-canvas">
                          {trackAEvents.map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() =>
                              setSelectedTrackAEventByPlayer((current) => ({
                                ...current,
                                [player.id]: event.id,
                              }))
                            }
                            className={`timeline-event ${getTrackAccent(event.track)} ${getTimelineTextSizeClass(event.displayWidth)} ${selectedTrackAEvent?.id === event.id ? "timeline-event-selected" : ""}`}
                            style={{
                              left: `${event.displayLeft}%`,
                              width: `${event.displayWidth}%`,
                            }}
                            title={`Select ${event.clip.label} at ${formatMs(event.startMs)}`}
                          >
                            <span>{event.clip.label}</span>
                            <small>{formatMs(event.startMs)}</small>
                          </button>
                        ))}
                        </div>
                      </div>

                      <div className="timeline-lane">
                        <div className="timeline-lane-toolbar">
                          <button
                            type="button"
                            onClick={() => nudgeSongStart(player.id, -1)}
                            className="timeline-arrow-button"
                            aria-label={`Move ${player.name} song earlier`}
                          >
                            <ChevronLeft className="button-icon" />
                          </button>
                          <span className="timeline-lane-readout">
                            Song starts {formatMs(songEvent?.startMs || 0)}
                          </span>
                          <button
                            type="button"
                            onClick={() => nudgeSongStart(player.id, 1)}
                            className="timeline-arrow-button"
                            aria-label={`Move ${player.name} song later`}
                          >
                            <ChevronRight className="button-icon" />
                          </button>
                        </div>
                        <div className="timeline-canvas">
                          {trackBEvents.map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => playClipNow(event.clip, player)}
                            className={`timeline-event ${getTrackAccent(event.track)} ${getTimelineTextSizeClass(event.displayWidth)}`}
                            style={{
                              left: `${event.displayLeft}%`,
                              width: `${event.displayWidth}%`,
                            }}
                            title={`${event.clip.label} at ${formatMs(event.startMs)}`}
                          >
                            <span>{event.clip.label}</span>
                            <small>{formatMs(event.startMs)}</small>
                          </button>
                        ))}
                        </div>
                      </div>
                    </div>
                    </>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeTab === "freestyle" ? (
          <ClipBoard
            title="Freestyle"
            description="Team voice clips and songs. Every tap cuts the current clip, then fires the selected clip."
            groups={["announcements", "numbers", "positions", "names", "songs"]}
            variant="sampler"
            activePlayback={activePlayback}
            durationBySrc={durationBySrc}
            onPlayClip={(clip) => playClipNow(clip, null, { fadeOutPrevious: false })}
          />
        ) : null}

        {activeTab === "crowd" ? (
          <ClipBoard
            title="Crowd"
            description="Crowd hype and interruptive game-day moments."
            groups={["umpire-calls", "player-hype", "crowd-hype"]}
            variant="sampler"
            activePlayback={activePlayback}
            durationBySrc={durationBySrc}
            onPlayClip={(clip) => playClipNow(clip)}
          />
        ) : null}

        {activeTab === "roster" ? (
          <section className="panel">
            <div className="panel-kicker">Roster / Edit</div>
            <h2>First Slice Data Model</h2>
            <p>
              This first pass focuses on a clean player + clip + timed-event model before we
              build the full editor.
            </p>

            <div className="stack-list">
              {playerSequences.map((player) => (
                <div
                  key={player.id}
                  className="stack-row"
                >
                  <strong>{player.name}</strong>
                  <span>
                    {player.sequence.length} events • song overlap starts at{" "}
                    {formatMs(player.sequence.find((event) => event.track === "B")?.startMs || 0)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <button
        type="button"
        onClick={() => fadeOutAndStopAll()}
        className="floating-fade-button"
        aria-label="Fade out audio"
        title="Fade out audio"
      >
        <Square className="button-icon" />
        <span>Fade All</span>
      </button>
    </div>
  );
}

function getClipGroupTitle(groupId) {
  const titles = {
    announcements: "Vox",
    numbers: "Number",
    positions: "Position",
    names: "Name",
    songs: "Songs",
    "umpire-calls": "Umpire Calls",
    "player-hype": "Player Hype",
    "crowd-hype": "Crowd Hype",
    crowd: "Crowd Effects",
  };

  return titles[groupId] ?? groupId[0].toUpperCase() + groupId.slice(1);
}

function getSamplerPadClass(groupId) {
  const groupClasses = {
    announcements: "sampler-pad-vox",
    numbers: "sampler-pad-numbers",
    positions: "sampler-pad-positions",
    names: "sampler-pad-names",
    songs: "sampler-pad-songs",
    "umpire-calls": "sampler-pad-numbers",
    "player-hype": "sampler-pad-vox",
    "crowd-hype": "sampler-pad-names",
  };

  return groupClasses[groupId] ?? "sampler-pad-vox";
}

function getClipPlayerIds(clip) {
  if (Array.isArray(clip.playerIds)) {
    return clip.playerIds.filter(Boolean);
  }

  return clip.playerId ? [clip.playerId] : [];
}

function getFreestyleDisplayLabel(clip) {
  if (clip.group !== "songs") {
    return clip.label;
  }

  const normalized = String(clip.label || "").trim().toLowerCase();
  if (normalized === "all i do is win") {
    return "Fireball";
  }
  if (normalized === "fireball") {
    return "All I Do Is Win";
  }

  return clip.label;
}

const SPECIAL_CROWD_HYPE_IDS = new Set([
  "crowd-hype-gta-sound-effect",
  "crowd-hype-wow",
  "crowd-hype-1up",
  "crowd-hype-boom-goes-the-dynamite",
  "crowd-hype-three-best-friends",
]);

function getNumberPlayerLabel(clip) {
  if (clip.group !== "numbers") {
    return "";
  }

  if (Array.isArray(clip.playerNames) && clip.playerNames.length) {
    return clip.playerNames.map((name) => String(name || "").trim().split(/\s+/)[0]).filter(Boolean).join(" + ");
  }

  return clip.playerName ? String(clip.playerName).trim().split(/\s+/)[0] : "";
}

function ClipBoard({ title, description, groups, variant = "board", activePlayback, onPlayClip, durationBySrc }) {
  const groupedClips = groups.flatMap((groupId) => {
    return [
      {
        id: groupId,
        title: getClipGroupTitle(groupId),
        clips: clipLibrary.filter((clip) => clip.group === groupId),
      },
    ];
  });
  const isSampler = variant === "sampler";
  const [lingerPlayback, setLingerPlayback] = useState(null);
  const highlightPlayback = isSampler ? activePlayback ?? lingerPlayback : activePlayback;

  useEffect(() => {
    if (!isSampler) {
      return undefined;
    }

    if (activePlayback) {
      setLingerPlayback(activePlayback);
      return undefined;
    }

    if (!lingerPlayback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setLingerPlayback(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [activePlayback, isSampler, lingerPlayback]);

  return (
    <section className={`panel ${isSampler ? "sampler-panel" : ""}`}>
      {!isSampler ? (
        <>
          <div className="panel-kicker">{title}</div>
          <h2>{title} Soundboard</h2>
          <p>{description}</p>
        </>
      ) : null}

      <div className={isSampler ? "sampler-pad-grid" : "clip-group-grid"}>
        {groupedClips.map((group) => (
          <section
            key={group.id}
            className={isSampler ? "sampler-pad-group" : "clip-group"}
          >
            <h3>{group.title}</h3>

            <div className={isSampler ? "sampler-grid" : "clip-grid"}>
              {group.clips.map((clip, index) => {
                const clipPlayerIds = getClipPlayerIds(clip);
                const activePlayerIds = Array.isArray(highlightPlayback?.relatedPlayerIds)
                  ? highlightPlayback.relatedPlayerIds.filter(Boolean)
                  : highlightPlayback?.playerId
                    ? [highlightPlayback.playerId]
                    : [];
                const associated = clipPlayerIds.length > 0
                  ? activePlayerIds.some((playerId) => clipPlayerIds.includes(playerId))
                  : false;
                const live = isSampler ? associated || highlightPlayback?.clipId === clip.id : activePlayback?.clipId === clip.id;
                const numberPlayerLabel = getNumberPlayerLabel(clip);
                const padClass =
                  clip.group === "crowd-hype" && SPECIAL_CROWD_HYPE_IDS.has(clip.id)
                    ? "sampler-pad-special-crowd"
                    : getSamplerPadClass(group.id);
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => onPlayClip(clip)}
                    className={
                      isSampler
                        ? `sampler-pad ${padClass} ${live ? "sampler-pad-live" : ""}`
                        : `clip-card ${live ? "clip-card-live" : ""}`
                    }
                  >
                    {isSampler ? (
                      <>
                        <Volume2 className="sampler-pad-icon" />
                        <strong>{getFreestyleDisplayLabel(clip)}</strong>
                        <small>{numberPlayerLabel || clip.playerName || formatMs(getClipDurationMs(clip, durationBySrc))}</small>
                        <span className="sampler-pad-level">
                          <span className={live ? "sampler-pad-level-live" : ""} />
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="clip-card-topline">{clip.playerName || clip.group}</div>
                        <strong>{getFreestyleDisplayLabel(clip)}</strong>
                        <span>{formatMs(getClipDurationMs(clip, durationBySrc))}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
