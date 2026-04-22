# Walk-Up Announcer V2 Spec

## Product Goal

Build a fresh, mobile-first walk-up and game-day audio app that is faster, simpler, and more reliable than `v1`.

`v2` removes runtime clip editing and treats every playable thing as a soundboard event.

## Target Devices

- Primary: `iPad`
- Secondary: `iPhone`

## Platform Direction

- Stay web-based
- Load assets first, then support offline use
- Design with a future packaged app path in mind, but do not require it now

## Core Principles

- Everything playable is a `clip`
- Sequences are only timed trigger events
- No runtime trimming
- No runtime fades
- No runtime clip slicing
- One unified playback engine for every clip type
- Mobile responsiveness is a first-class requirement

## Screens

1. `Walkups`
2. `Freestyle`
3. `Crowd`
4. `Roster/Edit`

## Clip Categories

- Announcements
- Names
- Numbers
- Positions
- Songs
- Crowd / Hype / Effects

Nicknames are out of scope for initial `v2`.

## Playback Model

- Two sequence tracks
- One manual interrupt lane
- Manual clip tap behavior:
  - fade all
  - play requested clip
- Crowd clip behavior:
  - fade all
  - play requested clip

## Sequence Model

Sequences are per-player.

Practical structure:

- Track A: standard voice stack
- Track B: song timing / overlap lane

Typical voice order:

1. announcement
2. number
3. name

The song may begin earlier or overlap, which is the main reason for the second track.

## Editing Direction

- Soundboard-style event model
- Visual sequence editing
- Two-track timeline
- Keep the current snap feel for the first pass
- No in-clip editing tools

## Reliability Requirements

- Visible preload / offline-ready state
- Visible audio-ready state
- `Arm Audio` control
- `Reset Audio Engine` control
- `Fade All` control
- Minimize background work during game-day use
- Reduce unnecessary storage writes during playback

## Suggested Architecture

- `clip library`
- `player roster`
- `player sequence config`
- `playback engine`
- `offline/preload manager`

## Non-Goals For First Pass

- Nickname workflow
- Clip trimming UI
- Fade editing UI
- Audio slicing UI
- Overly general DAW-style editing

## Definition Of Better Than V1

- Faster tap-to-sound response
- Better mobile reliability
- Simpler operator workflow
- Less historical behavior baggage
- Easier to reason about and extend
