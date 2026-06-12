import {
  AudioLines,
  Library,
  Sparkles,
  Users,
} from "lucide-react";

function assetSrc(folder, fileName) {
  return `${import.meta.env.BASE_URL}assets/audio/${folder}/${encodeURIComponent(fileName)}`;
}

function clip({ id, group, label, src, durationMs, playerId = "", playerName = "", ...extra }) {
  return {
    id,
    group,
    label,
    src,
    durationMs,
    playerId,
    playerName,
    ...extra,
  };
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function eventClip(group, fileName, durationMs = 6000) {
  const label = fileName.replace(/\.(mp3|wav)$/i, "");
  return clip({
    id: `${group}-${slugify(label)}`,
    group,
    label,
    src: assetSrc(`events/${group}`, fileName),
    durationMs,
  });
}

const announcementNowBatting = clip({
  id: "announcement-now-batting",
  group: "announcements",
  label: "Now Bat",
  src: assetSrc("announcements", "now batting.mp3"),
  durationMs: 1313,
});

const announcementMakeSomeNoise = clip({
  id: "announcement-make-some-noise",
  group: "announcements",
  label: "Make Noise",
  src: assetSrc("announcements", "MAKE SOME NOISE.mp3"),
  durationMs: 2126,
});

const announcementComingToPlate = clip({
  id: "announcement-coming-to-plate",
  group: "announcements",
  label: "To Plate",
  src: assetSrc("announcements", "COMING TO THE PLAT.mp3"),
  durationMs: 1682,
});

const announcementComingToMound = clip({
  id: "announcement-coming-to-mound",
  group: "announcements",
  label: "To Mound",
  src: assetSrc("announcements", "COMING TO THE MOUND.mp3"),
  durationMs: 1700,
});

const announcementLetsHearItFor = clip({
  id: "announcement-lets-hear-it-for",
  group: "announcements",
  label: "Lets Hear",
  src: assetSrc("announcements", "LETS HEREE IT FOR.mp3"),
  durationMs: 1627,
});

const announcementUpNext = clip({
  id: "announcement-up-next",
  group: "announcements",
  label: "Up Next",
  src: assetSrc("announcements", "UP NEXT.mp3"),
  durationMs: 1152,
});

const positionPitcher = clip({
  id: "position-p",
  group: "positions",
  label: "P",
  src: assetSrc("positions", "PITCHER.mp3"),
  durationMs: 1000,
});

const positionCatcher = clip({
  id: "position-c",
  group: "positions",
  label: "C",
  src: assetSrc("positions", "CATCHER.mp3"),
  durationMs: 1000,
});

const positionFirstBase = clip({
  id: "position-1b",
  group: "positions",
  label: "1B",
  src: assetSrc("positions", "FIRST BASEMEN.mp3"),
  durationMs: 1000,
});

const positionSecondBase = clip({
  id: "position-2b",
  group: "positions",
  label: "2B",
  src: assetSrc("positions", "SECOND BASEMEN.mp3"),
  durationMs: 1000,
});

const positionThirdBase = clip({
  id: "position-3b",
  group: "positions",
  label: "3B",
  src: assetSrc("positions", "THIRD BASEMEN.mp3"),
  durationMs: 1000,
});

const positionShortStop = clip({
  id: "position-ss",
  group: "positions",
  label: "SS",
  src: assetSrc("positions", "SHORT STOP.mp3"),
  durationMs: 1000,
});

const positionLeftField = clip({
  id: "position-lf",
  group: "positions",
  label: "LF",
  src: assetSrc("positions", "LEFT FIELDER.mp3"),
  durationMs: 1000,
});

const positionCenterField = clip({
  id: "position-cf",
  group: "positions",
  label: "CF",
  src: assetSrc("positions", "CENTER FIELDER.mp3"),
  durationMs: 1000,
});

const positionRightField = clip({
  id: "position-rf",
  group: "positions",
  label: "RF",
  src: assetSrc("positions", "RIGHT FIELDER.mp3"),
  durationMs: 1000,
});

const basePositionClips = [
  positionPitcher,
  positionCatcher,
  positionFirstBase,
  positionSecondBase,
  positionThirdBase,
  positionShortStop,
  positionLeftField,
  positionCenterField,
  positionRightField,
];

const teamPlayerData = [
  {
    id: "alex",
    name: "Alex Bonk",
    jerseyNumber: "9",
    position: "",
    role: "Walkup",
    songLabel: "Centuries",
    songFileName: "alex-bonk-mobile.mp3",
    songDurationMs: 18250,
  },
  {
    id: "benjamin",
    name: "Benjamin Yunker",
    jerseyNumber: "24",
    position: "SS",
    role: "Walkup",
    songLabel: "Feel Me Flow",
    songFileName: "benjamin-yunker-mobile.mp3",
    songDurationMs: 19000,
  },
  {
    id: "billy",
    name: "Billy Wanko",
    jerseyNumber: "28",
    position: "3B",
    role: "Walkup",
    songLabel: "Headstrong",
    songFileName: "billy-wanko-mobile.mp3",
    songDurationMs: 11925,
  },
  {
    id: "camden",
    name: "Camden Pagoda",
    jerseyNumber: "33",
    position: "CF",
    role: "Walkup",
    songLabel: "Toxicity",
    songFileName: "camden-pagoda-mobile.mp3",
    songDurationMs: 17000,
  },
  {
    id: "giovanni",
    name: "Giovanni Turchi",
    jerseyNumber: "2",
    position: "2B",
    role: "Walkup",
    songLabel: "Hypnotize",
    songFileName: "giovanni-turchi-mobile.mp3",
    songDurationMs: 17750,
  },
  {
    id: "landon",
    name: "Landon Hanrahan",
    jerseyNumber: "23",
    position: "C",
    role: "Walkup",
    songLabel: "Fireball",
    songFileName: "landon-hanrahan-mobile.mp3",
    songDurationMs: 13000,
  },
  {
    id: "logan",
    name: "Logan Hanrahan",
    jerseyNumber: "88",
    position: "1B",
    role: "Walkup",
    songLabel: "All I Do Is Win",
    songFileName: "logan-hanrahan-mobile.mp3",
    songDurationMs: 20750,
  },
  {
    id: "marty",
    name: "Marty Happle",
    jerseyNumber: "16",
    position: "CF",
    role: "Walkup",
    songLabel: "Savior",
    songFileName: "marty-happle-mobile.mp3",
    songDurationMs: 17704,
  },
  {
    id: "matty",
    name: "Matty Wanko",
    jerseyNumber: "4",
    position: "P",
    role: "Walkup",
    songLabel: "Everlong",
    songFileName: "matty-wanko-mobile.mp3",
    songDurationMs: 26841,
  },
  {
    id: "nate",
    name: "Nate Clay",
    jerseyNumber: "13",
    position: "LF",
    role: "Walkup",
    songLabel: "Hooligan",
    songFileName: "nate-clay-mobile.mp3",
    songDurationMs: 19250,
  },
  {
    id: "tristan",
    name: "Tristan Aquino",
    jerseyNumber: "17",
    position: "RF",
    role: "Walkup",
    songLabel: "EoO",
    songFileName: "tristan-aquino-mobile.mp3",
    songDurationMs: 18000,
  },
];

const numberClips = ["2", "4", "9", "13", "16", "17", "23", "24", "28", "33", "48", "88"].map((number) =>
  clip({
    id: `number-${number}`,
    group: "numbers",
    label: `#${number}`,
    src: assetSrc("numbers", `${number}.mp3`),
    durationMs: 1000,
    playerIds: teamPlayerData.filter((player) => player.jerseyNumber === number).map((player) => player.id),
    playerNames: teamPlayerData.filter((player) => player.jerseyNumber === number).map((player) => player.name),
  }),
);

const positionClips = basePositionClips.map((positionClip) => ({
  ...positionClip,
  playerIds: teamPlayerData.filter((player) => player.position === positionClip.label).map((player) => player.id),
  playerNames: teamPlayerData.filter((player) => player.position === positionClip.label).map((player) => player.name),
}));

const nameClips = teamPlayerData.map((player) =>
  clip({
    id: `name-${player.id}`,
    group: "names",
    label: player.name,
    src: assetSrc("names", `${player.name.toUpperCase()}.mp3`),
    durationMs: 1300,
    playerId: player.id,
    playerName: player.name,
  }),
);

const songClips = teamPlayerData.map((player) =>
  clip({
    id: `song-${player.id}`,
    group: "songs",
    label: player.songLabel,
    src: assetSrc("songs", player.songFileName),
    durationMs: player.songDurationMs,
    playerId: player.id,
    playerName: player.name,
  }),
);

const numberClipByValue = Object.fromEntries(numberClips.map((numberClip) => [numberClip.label.slice(1), numberClip]));
const nameClipByPlayerId = Object.fromEntries(nameClips.map((nameClip) => [nameClip.playerId, nameClip]));
const songClipByPlayerId = Object.fromEntries(songClips.map((songClip) => [songClip.playerId, songClip]));

const crowdHereWeGo = clip({
  id: "crowd-here-we-go",
  group: "crowd",
  label: "Here We Go",
  src: assetSrc("events/crowd-hype", "Here We Go.mp3"),
  durationMs: 6000,
});

const umpireCallClips = [
  "play ball!!.mp3",
  "he gone.mp3",
  "strike 3 hes out.mp3",
  "hes outta there.mp3",
  "Hes SAFE!.mp3",
  "hasta la vista baby.mp3",
  "bye have a good time.mp3",
  "whip-wipe-wipe.mp3",
  "fresh and clean.mp3",
  "sweeping.mp3",
].map((fileName) => eventClip("umpire-calls", fileName, 5500));

const ourTimePlayerHype = clip({
  id: "player-hype-our-time-goonies",
  group: "player-hype",
  label: "our time goonies",
  src: assetSrc("events/crowd-hype", "our time goonies.mp3"),
  durationMs: 6500,
});

const playerHypeClips = [
  "HOMERUN!.mp3",
  "BILL! BILL! BILL!.mp3",
  "my homie nate.mp3",
  "Benny Jet.mp3",
  "Chicken Hawk.mp3",
  "Run Marty.mp3",
  "Weapon X.mp3",
].map((fileName) => eventClip("player-hype", fileName, 4500)).concat([
  eventClip("player-hype", "88 mph.mp3", 4500),
  ourTimePlayerHype,
  eventClip("player-hype", "Eat it!.mp3", 4500),
  eventClip("player-hype", "Shake it Off.mp3", 4500),
  eventClip("player-hype", "new challenger!.mp3", 4500),
]);

const crowdHypeClips = [
  "when i say.mp3",
  "Here We Go.mp3",
  "Organ Scale Chant.mp3",
  "Bullfighter.mp3",
  "we will rock you.mp3",
  "Seven Nation.mp3",
  "clap yo hands.mp3",
  "Hands Clap.mp3",
  "defence.mp3",
  "eye of the tiger.mp3",
  "1up.mp3",
  "WOW!.mp3",
  "whistle bomb.mp3",
  "boom goes the dynamite.mp3",
  "three best friends.mp3",
  "GTA Sound Effect.mp3",
].map((fileName) => eventClip("crowd-hype", fileName, 6500));

export const clipLibrary = [
  announcementNowBatting,
  announcementMakeSomeNoise,
  announcementComingToPlate,
  announcementComingToMound,
  announcementLetsHearItFor,
  announcementUpNext,
  ...numberClips,
  ...positionClips,
  ...nameClips,
  ...songClips,
  crowdHereWeGo,
  ...umpireCallClips,
  ...playerHypeClips,
  ...crowdHypeClips,
];

function event(id, track, startMs, clip) {
  return {
    id,
    track,
    startMs,
    clip,
  };
}

export const players = teamPlayerData.map((player) => ({
  id: player.id,
  name: player.name,
  jerseyNumber: player.jerseyNumber,
  role: player.role,
  position: player.position,
  usePositionClip: false,
  sequence: [
    event(`${player.id}-announcement`, "A", 0, announcementNowBatting),
    event(`${player.id}-number`, "A", 1250, numberClipByValue[player.jerseyNumber]),
    event(`${player.id}-name`, "A", 2600, nameClipByPlayerId[player.id]),
    event(`${player.id}-song`, "B", 3600, songClipByPlayerId[player.id]),
  ],
}));

export const screenTabs = [
  { id: "walkups", label: "Walkups", icon: Users },
  { id: "freestyle", label: "Freestyle", icon: AudioLines },
  { id: "crowd", label: "Crowd", icon: Sparkles },
  { id: "roster", label: "Roster/Edit", icon: Library },
];

export const announcementOptions = [
  announcementNowBatting,
  announcementMakeSomeNoise,
  announcementComingToPlate,
  announcementComingToMound,
  announcementLetsHearItFor,
  announcementUpNext,
];

export const positionOptions = [
  ...positionClips,
];
