import {
  AudioLines,
  CirclePlay,
  Library,
  Sparkles,
  Users,
  Waves,
} from "lucide-react";

const APP_BUILD_LABEL = "v2-alpha-01";

const screens = [
  {
    id: "walkups",
    label: "Walkups",
    icon: Users,
    description: "Per-player walkup sequences built from timed soundboard events.",
  },
  {
    id: "freestyle",
    label: "Freestyle",
    icon: Waves,
    description: "Team voice clips and songs, all playable as one-tap buttons.",
  },
  {
    id: "crowd",
    label: "Crowd",
    icon: Sparkles,
    description: "Crowd hype, umpire calls, and game-day interrupt effects.",
  },
  {
    id: "roster",
    label: "Roster/Edit",
    icon: Library,
    description: "Players, clip assignment, preload status, and sequence defaults.",
  },
];

export default function App() {
  return (
    <div className="app-shell">
      <header className="hero-card">
        <div className="hero-topline">{APP_BUILD_LABEL}</div>
        <h1>Walk-Up Announcer V2</h1>
        <p>
          Clean-slate architecture focused on fast mobile playback, soundboard-first
          control, and simple walkup sequencing.
        </p>

        <div className="status-row">
          <span className="status-pill">Web First</span>
          <span className="status-pill">Offline After Preload</span>
          <span className="status-pill">2 Tracks + Manual Lane</span>
          <span className="status-pill">No Clip Editing</span>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel">
          <div className="panel-kicker">Core Screens</div>
          <div className="screen-grid">
            {screens.map((screen) => {
              const Icon = screen.icon;

              return (
                <article
                  key={screen.id}
                  className="screen-card"
                >
                  <div className="screen-icon-wrap">
                    <Icon className="screen-icon" />
                  </div>
                  <h2>{screen.label}</h2>
                  <p>{screen.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel two-col">
          <div>
            <div className="panel-kicker">Playback Rules</div>
            <ul className="rule-list">
              <li>Every playable thing is a soundboard clip.</li>
              <li>Sequences only schedule timed button fires.</li>
              <li>Manual taps fade all and play the requested clip.</li>
              <li>Crowd clips also fade all and take over cleanly.</li>
              <li>Voice stack is mostly fixed; song timing is the main overlap lane.</li>
            </ul>
          </div>

          <div>
            <div className="panel-kicker">First Build Priorities</div>
            <ul className="rule-list">
              <li>Reliable preload and offline-ready state.</li>
              <li>Snappy iPad/iPhone playback.</li>
              <li>Simple player sequence editor with track A and track B.</li>
              <li>Visible Arm Audio, Reset Audio, and Fade All controls.</li>
              <li>Minimal background work during game-day use.</li>
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel-kicker">Architecture Direction</div>
          <div className="stack-list">
            <div className="stack-row">
              <strong>Clip Library</strong>
              <span>Announcements, names, numbers, positions, songs, crowd effects</span>
            </div>
            <div className="stack-row">
              <strong>Roster</strong>
              <span>Players and assigned clips</span>
            </div>
            <div className="stack-row">
              <strong>Sequences</strong>
              <span>Per-player timed trigger events on two tracks</span>
            </div>
            <div className="stack-row">
              <strong>Playback Engine</strong>
              <span>Unified runtime for every clip type</span>
            </div>
            <div className="stack-row">
              <strong>Preload Manager</strong>
              <span>Load once, then run offline and stay ready</span>
            </div>
          </div>
        </section>

        <section className="panel callout">
          <CirclePlay className="callout-icon" />
          <div>
            <div className="panel-kicker">Starting Point</div>
            <p>
              This scaffold is intentionally small. The goal is to begin from the new
              rules, not drag old behavior forward by accident.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
