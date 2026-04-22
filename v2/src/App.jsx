import { useMemo, useState } from "react";
import {
  AudioLines,
  CirclePlay,
  Library,
  RotateCcw,
  Sparkles,
  Square,
  Users,
  Waves,
} from "lucide-react";
import { usePlaybackEngine } from "./hooks/usePlaybackEngine";
import { clipLibrary, players, screenTabs } from "./lib/sampleData";

const APP_BUILD_LABEL = "v2-alpha-10";
const TIMELINE_LEFT_SCALE = 24;
const TIMELINE_WIDTH_SCALE = 120;

function formatMs(ms) {
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

function getTrackAccent(track) {
  return track === "B" ? "track-b" : "track-a";
}

export default function App() {
  const [activeTab, setActiveTab] = useState("walkups");
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

  const handleArmAudio = async () => {
    await primeSources(warmSources);
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
            onClick={fadeOutAndStopAll}
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
            </div>

            <div className="player-grid">
              {players.map((player) => (
                <article
                  key={player.id}
                  className={`player-card ${activePlayerId === player.id ? "player-card-live" : ""}`}
                >
                  <div className="player-meta">
                    <div>
                      <div className="player-topline">
                        #{player.jerseyNumber} • {player.role}
                      </div>
                      <h3>{player.name}</h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => playSequence(player)}
                      className="primary-action compact"
                    >
                      <CirclePlay className="button-icon" />
                      Play Walkup
                    </button>
                  </div>

                  <div className="timeline-shell">
                    <div className="timeline-lane">
                      {player.sequence
                        .filter((event) => event.track === "A")
                        .map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => playClipNow(event.clip, player)}
                            className={`timeline-event ${getTrackAccent(event.track)}`}
                            style={{
                              left: `${Math.min(360, event.startMs / TIMELINE_LEFT_SCALE)}px`,
                              width: `${Math.max(74, event.clip.durationMs / TIMELINE_WIDTH_SCALE)}px`,
                            }}
                            title={`${event.clip.label} at ${formatMs(event.startMs)}`}
                          >
                            <span>{event.clip.label}</span>
                            <small>{formatMs(event.startMs)}</small>
                          </button>
                        ))}
                    </div>

                    <div className="timeline-lane">
                      {player.sequence
                        .filter((event) => event.track === "B")
                        .map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => playClipNow(event.clip, player)}
                            className={`timeline-event ${getTrackAccent(event.track)}`}
                            style={{
                              left: `${Math.min(360, event.startMs / TIMELINE_LEFT_SCALE)}px`,
                              width: `${Math.max(74, event.clip.durationMs / TIMELINE_WIDTH_SCALE)}px`,
                            }}
                            title={`${event.clip.label} at ${formatMs(event.startMs)}`}
                          >
                            <span>{event.clip.label}</span>
                            <small>{formatMs(event.startMs)}</small>
                          </button>
                        ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "freestyle" ? (
          <ClipBoard
            title="Freestyle"
            description="Team voice clips and songs. Every tap fades all, then fires the selected clip."
            groups={["announcements", "numbers", "names", "songs"]}
            activePlayback={activePlayback}
            onPlayClip={(clip) => playClipNow(clip)}
          />
        ) : null}

        {activeTab === "crowd" ? (
          <ClipBoard
            title="Crowd"
            description="Crowd hype and interruptive game-day moments."
            groups={["crowd"]}
            activePlayback={activePlayback}
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
              {players.map((player) => (
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
    </div>
  );
}

function ClipBoard({ title, description, groups, activePlayback, onPlayClip }) {
  const groupedClips = groups.flatMap((groupId) => {
    const titleCase = groupId === "crowd" ? "Crowd Effects" : groupId[0].toUpperCase() + groupId.slice(1);
    return [
      {
        id: groupId,
        title: titleCase,
        clips: clipLibrary.filter((clip) => clip.group === groupId),
      },
    ];
  });

  return (
    <section className="panel">
      <div className="panel-kicker">{title}</div>
      <h2>{title} Soundboard</h2>
      <p>{description}</p>

      <div className="clip-group-grid">
        {groupedClips.map((group) => (
          <section
            key={group.id}
            className="clip-group"
          >
            <h3>{group.title}</h3>

            <div className="clip-grid">
              {group.clips.map((clip) => {
                const live = activePlayback?.clipId === clip.id;
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => onPlayClip(clip)}
                    className={`clip-card ${live ? "clip-card-live" : ""}`}
                  >
                    <div className="clip-card-topline">{clip.playerName || clip.group}</div>
                    <strong>{clip.label}</strong>
                    <span>{formatMs(clip.durationMs)}</span>
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
