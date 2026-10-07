# Walk-Up Announcer V2

Fresh-start `v2` app scaffold for the simplified game-day workflow.

## Product Direction

- Primary devices: `iPad` and `iPhone`
- Web app first
- Offline after initial preload
- Everything is a soundboard clip
- Walkup sequences are timed button triggers
- No in-app trim, fade, or clip editing
- Two sequence tracks plus one manual interrupt lane

## Screens

- `Walkups`
- `Freestyle`
- `Crowd`
- `Roster/Edit`

## Current Status

This folder is the clean `v2` starting point.

The existing root app remains the stable `v1` reference.

## Commands

```bash
npm install
npm run dev
npm run build
```

## Audio reliability

Clip durations are measured from the audio files and bundled in src/lib/audioDurations.json. After adding or replacing audio, regenerate them with npm run audio:durations -- <path-to-ffmpeg>. The production build does not require FFmpeg.

iPhone and iPad playback uses a tap-unlocked Web Audio context with a 32 MB decoded-buffer cache. Arm Audio caches the full compressed clips for offline use. Reset Audio recreates the playback context without changing the lineup or scores.

Run npm test for cached media ranges, mobile playback, cancellation, and duration coverage.
