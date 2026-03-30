import { Play, Plus, Sparkles } from "lucide-react";
import { getPlayerStatus, resolvePlayerSequence } from "../lib/storage";

const SOUNDBOARD_TABS = [
  { id: "players", label: "Player Intros" },
  { id: "effects", label: "Effects" },
  { id: "freestyle", label: "Freestyle" },
];

const FREESTYLE_ORDER = [
  { id: "announcements", label: "Announcements" },
  { id: "positions", label: "Positions" },
  { id: "numbers", label: "Numbers" },
  { id: "names", label: "Names" },
  { id: "songs", label: "Walk-Up Songs" },
];

export function SoundboardView({
  players,
  soundboardView,
  onSoundboardViewChange,
  freestyleGroups,
  activePlayback,
  onPlayPlayer,
  onPlayClip,
  onQueueClip,
}) {
  return (
    <div className="space-y-4">
      <section className="glass-panel rounded-[2rem] border border-white/8 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
              Soundboard
            </div>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
              Three Ways To Fire Audio
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Run full player intros, hit one-tap hype effects, or freestyle individual announcement, position, number, and name clips.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-slate-950/60 p-2">
            {SOUNDBOARD_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSoundboardViewChange(tab.id)}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  soundboardView === tab.id
                    ? "bg-sky-400 text-slate-950"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {soundboardView === "players" ? (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {players.map((player) => {
            const status = getPlayerStatus(player);
            const active = activePlayback?.playerId === player.id;
            const sequencePreview = resolvePlayerSequence(player, freestyleGroupsToLibraries(freestyleGroups));

            return (
              <article
                key={player.id}
                className={`relative overflow-hidden rounded-[2rem] border p-5 transition ${
                  active
                    ? "border-sky-300/60 bg-sky-400/15 shadow-2xl shadow-sky-500/20"
                    : "glass-panel border-white/8"
                }`}
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                      #{player.jerseyNumber || "--"} - {player.positionLabel || "Utility"}
                    </div>
                    <h3 className="mt-2 text-2xl font-black uppercase tracking-[0.04em] text-white">
                      {player.name}
                    </h3>
                  </div>
                  {active ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">
                      <Sparkles className="h-3.5 w-3.5" />
                      Live
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-400">
                  {status.configuredCount}/5 clip types assigned
                </div>

                <button
                  type="button"
                  onClick={() => onPlayPlayer(player)}
                  disabled={sequencePreview.length === 0}
                  className="mt-5 flex w-full items-center justify-center gap-3 rounded-[1.75rem] bg-white px-5 py-5 text-base font-black uppercase tracking-[0.18em] text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                >
                  <Play className="h-5 w-5" />
                  Play Player Intro
                </button>

                <div className="mt-5 space-y-2">
                  {sequencePreview.map((clip) => (
                    <button
                      key={`${player.id}-${clip.id}-${clip.slot}`}
                      type="button"
                      onClick={() =>
                        onQueueClip({
                          group:
                            clip.slot === "name"
                              ? "names"
                              : clip.slot === "song"
                                ? "songs"
                                : `${clip.slot}s`,
                          clip,
                          playerId: player.id,
                          playerName: player.name,
                        })
                      }
                      className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-3 text-left transition hover:border-sky-300/20 hover:bg-slate-900/70"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{clip.nickname}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                          {clip.slot}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                        <Plus className="h-3.5 w-3.5" />
                        Queue
                      </span>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {soundboardView === "effects" ? (
        <ClipGrid
          title="Hype And Game Moments"
          clips={freestyleGroups.effects}
          group="effects"
          onPlayClip={onPlayClip}
          onQueueClip={onQueueClip}
        />
      ) : null}

      {soundboardView === "freestyle" ? (
        <div className="space-y-4">
          {FREESTYLE_ORDER.map((group) => (
            <ClipGrid
              key={group.id}
              title={group.label}
              clips={freestyleGroups[group.id]}
              group={group.id}
              onPlayClip={onPlayClip}
              onQueueClip={onQueueClip}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ClipGrid({ title, clips, group, onPlayClip, onQueueClip }) {
  return (
    <section className="glass-panel rounded-[2rem] border border-white/8 p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">{title}</div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clips.map((clip) => (
          <button
            key={`${group}-${clip.playerId ?? "global"}-${clip.id}`}
            type="button"
            onClick={() =>
              onPlayClip({
                clip,
                group,
                playerId: clip.playerId ?? "",
                playerName: clip.playerName ?? "",
              })
            }
            className="rounded-[1.75rem] border border-white/8 bg-slate-950/55 p-5 text-left transition hover:border-sky-300/20 hover:bg-slate-900/75"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {clip.playerName || title}
            </div>
            <div className="mt-3 text-xl font-black uppercase tracking-[0.05em] text-white">
              {clip.nickname}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="secondary-button">Tap To Play</span>
              <span
                className="secondary-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onQueueClip({
                    group,
                    clip,
                    playerId: clip.playerId ?? "",
                    playerName: clip.playerName ?? "",
                  });
                }}
              >
                Queue
              </span>
            </div>
          </button>
        ))}

        {clips.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-white/10 px-6 py-10 text-sm text-slate-500">
            No clips loaded for this section yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function freestyleGroupsToLibraries(groups) {
  return {
    announcements: groups.announcements,
    numbers: groups.numbers,
    positions: groups.positions,
    songs: groups.songs,
  };
}
