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

## Editions

The header switches between Regular and Halloween. Each edition remembers its own
batting order and timeline offsets, and exported settings identify their edition.
The scoreboard is shared. Switching editions stops playback and resets audio readiness;
tap Arm Audio in the selected edition to preload that edition's library for offline use.

Halloween currently includes the 16 supplied combined entrance/number/name recordings
on Track A. Gio Mortensen has no supplied recording and is omitted from this edition.
Matty's Deep End, Nate's Nightmare, Billy's Dragula, Tristan's Hush, Cam's Crypt, Brandon's Thriller, Alex Bonk's Halloween Theme, Mario's Beetlejuice, and Nick's Watching songs are on Track B, starting after each player's
combined walkup by default; their timing can be moved independently. Other song lanes are empty. Crowd effects are shared
with Regular. Source recordings go in the local `halloween/` inbox; published recordings
live in `public/assets/audio/halloween/walkups/` and are mapped in `src/lib/sampleData.js`.
The full Halloween skin lives in `src/halloween.css`, with bundled haunted-ballpark
artwork, pumpkin number badges, and the licensed Creepster display font. Artwork
generation details are in `../docs/halloween-art.md`.

## Audio reliability

During walkup sequences in both editions, songs automatically duck to 25% volume
under announcer clips and return to full volume over 350 ms. Adjacent spoken clips
keep the music ducked between calls. Saved timeline offsets and audio files are unchanged.

Clip durations are measured from the audio files and bundled in src/lib/audioDurations.json. After adding or replacing audio, regenerate them with npm run audio:durations -- <path-to-ffmpeg>. The production build does not require FFmpeg.

iPhone and iPad playback uses a tap-unlocked Web Audio context with a 32 MB decoded-buffer cache. Arm Audio caches the full compressed clips for offline use. Reset Audio recreates the playback context without changing the lineup or scores.

Run npm test for cached media ranges, mobile playback, cancellation, and duration coverage.
