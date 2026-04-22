import {
  AudioLines,
  Library,
  Sparkles,
  Users,
} from "lucide-react";

function clip({ id, group, label, src, durationMs, playerId = "", playerName = "" }) {
  return {
    id,
    group,
    label,
    src,
    durationMs,
    playerId,
    playerName,
  };
}

const announcementNowBatting = clip({
  id: "announcement-now-batting",
  group: "announcements",
  label: "Now Batting",
  src: "/assets/audio/announcements/now batting.mp3",
  durationMs: 1000,
});

const number23 = clip({
  id: "number-23",
  group: "numbers",
  label: "#23",
  src: "/assets/audio/numbers/23.mp3",
  durationMs: 1000,
});

const number88 = clip({
  id: "number-88",
  group: "numbers",
  label: "#88",
  src: "/assets/audio/numbers/88.mp3",
  durationMs: 1000,
});

const landonName = clip({
  id: "name-landon",
  group: "names",
  label: "Landon Hanrahan",
  src: "/assets/audio/names/LANDON HANRAHAN.mp3",
  durationMs: 1300,
  playerId: "landon",
  playerName: "Landon Hanrahan",
});

const loganName = clip({
  id: "name-logan",
  group: "names",
  label: "Logan Hanrahan",
  src: "/assets/audio/names/LOGAN HANRAHAN.mp3",
  durationMs: 1300,
  playerId: "logan",
  playerName: "Logan Hanrahan",
});

const landonSong = clip({
  id: "song-landon",
  group: "songs",
  label: "All I Do Is Win",
  src: "/assets/audio/songs/landon-hanrahan-mobile.wav",
  durationMs: 13000,
  playerId: "landon",
  playerName: "Landon Hanrahan",
});

const loganSong = clip({
  id: "song-logan",
  group: "songs",
  label: "Fireball",
  src: "/assets/audio/songs/logan-hanrahan-mobile.wav",
  durationMs: 13000,
  playerId: "logan",
  playerName: "Logan Hanrahan",
});

const crowdHereWeGo = clip({
  id: "crowd-here-we-go",
  group: "crowd",
  label: "Here We Go",
  src: "/assets/audio/events/crowd-hype/Here We Go.mp3",
  durationMs: 6000,
});

export const clipLibrary = [
  announcementNowBatting,
  number23,
  number88,
  landonName,
  loganName,
  landonSong,
  loganSong,
  crowdHereWeGo,
];

function event(id, track, startMs, clip) {
  return {
    id,
    track,
    startMs,
    clip,
  };
}

export const players = [
  {
    id: "landon",
    name: "Landon Hanrahan",
    jerseyNumber: "23",
    role: "Walkup A",
    sequence: [
      event("landon-announcement", "A", 0, announcementNowBatting),
      event("landon-number", "A", 1200, number23),
      event("landon-name", "A", 2550, landonName),
      event("landon-song", "B", 3400, landonSong),
    ],
  },
  {
    id: "logan",
    name: "Logan Hanrahan",
    jerseyNumber: "88",
    role: "Walkup B",
    sequence: [
      event("logan-announcement", "A", 0, announcementNowBatting),
      event("logan-number", "A", 1200, number88),
      event("logan-name", "A", 2550, loganName),
      event("logan-song", "B", 3400, loganSong),
    ],
  },
];

export const screenTabs = [
  { id: "walkups", label: "Walkups", icon: Users },
  { id: "freestyle", label: "Freestyle", icon: AudioLines },
  { id: "crowd", label: "Crowd", icon: Sparkles },
  { id: "roster", label: "Roster/Edit", icon: Library },
];
