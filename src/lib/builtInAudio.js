function builtInClip({ id, group, nickname, fileName, src, duration = null }) {
  return {
    id,
    group,
    nickname,
    fileName,
    mimeType: "audio/mpeg",
    size: 0,
    duration,
    createdAt: 0,
    dataUrl: null,
    src,
    builtIn: true,
  };
}

function assetSrc(folder, fileName) {
  return `${import.meta.env.BASE_URL}assets/audio/${folder}/${encodeURIComponent(fileName)}`;
}

function assetRootSrc(fileName) {
  return `${import.meta.env.BASE_URL}assets/audio/${encodeURIComponent(fileName)}`;
}

function eventAssetSrc(category, fileName) {
  return `${import.meta.env.BASE_URL}assets/audio/events/${category}/${encodeURIComponent(fileName)}`;
}

function titleCaseFromFileName(fileName) {
  return fileName
    .replace(/\.mp3$/i, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      const normalized = part.toLowerCase();
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join(" ");
}

const BUILT_IN_NAME_FILES = [
  "ALEX BONK.mp3",
  "BENJAMIN YUNKER.mp3",
  "BILLY WANKO.mp3",
  "CAMDEN PAGODA.mp3",
  "GIOVANNI TURCHI.mp3",
  "LANDON HANRAHAN.mp3",
  "LOGAN HANRAHAN.mp3",
  "MARTY HAPPLE.mp3",
  "MATTY WANKO.mp3",
  "NATE CLAY.mp3",
  "TRISTAN AQUINO.mp3",
];

const BUILT_IN_NUMBER_FILES = ["2.mp3", "4.mp3", "9.mp3", "13.mp3", "16.mp3", "17.mp3", "23.mp3", "28.mp3", "33.mp3", "48.mp3", "88.mp3"];
const BUILT_IN_SONG_FILES = [];

const BUILT_IN_SONG_TITLES = {};

const BUILT_IN_SONG_SOURCE_FILES = {};

const BUILT_IN_SONG_DURATIONS = {};

const DEFAULT_ROSTER_ASSIGNMENTS = [
  { jerseyNumber: "9", positionLabel: "P" },
  { jerseyNumber: "48", positionLabel: "C" },
  { jerseyNumber: "28", positionLabel: "3B" },
  { jerseyNumber: "33", positionLabel: "2B" },
  { jerseyNumber: "2", positionLabel: "3B" },
  { jerseyNumber: "23", positionLabel: "SS" },
  { jerseyNumber: "88", positionLabel: "LF" },
  { jerseyNumber: "28", positionLabel: "CF" },
  { jerseyNumber: "33", positionLabel: "RF" },
  { jerseyNumber: "13", positionLabel: "P" },
  { jerseyNumber: "17", positionLabel: "C" },
];

export const BUILT_IN_LIBRARIES = {
  announcements: [
    builtInClip({
      id: "announcement-now-batting",
      group: "announcements",
      nickname: "Now Batting",
      fileName: "now batting.mp3",
      src: assetSrc("announcements", "now batting.mp3"),
    }),
    builtInClip({
      id: "announcement-up-next",
      group: "announcements",
      nickname: "Up Next",
      fileName: "UP NEXT.mp3",
      src: assetSrc("announcements", "UP NEXT.mp3"),
    }),
    builtInClip({
      id: "announcement-make-some-noise",
      group: "announcements",
      nickname: "Make Some Noise",
      fileName: "MAKE SOME NOISE.mp3",
      src: assetSrc("announcements", "MAKE SOME NOISE.mp3"),
    }),
    builtInClip({
      id: "announcement-coming-to-the-plat",
      group: "announcements",
      nickname: "Coming To The Plate",
      fileName: "COMING TO THE PLAT.mp3",
      src: assetSrc("announcements", "COMING TO THE PLAT.mp3"),
    }),
    builtInClip({
      id: "announcement-coming-to-the-mound",
      group: "announcements",
      nickname: "Coming To The Mound",
      fileName: "COMING TO THE MOUND.mp3",
      src: assetSrc("announcements", "COMING TO THE MOUND.mp3"),
    }),
    builtInClip({
      id: "announcement-lets-heare-it-for",
      group: "announcements",
      nickname: "Let's Hear It For",
      fileName: "LETS HEREE IT FOR.mp3",
      src: assetSrc("announcements", "LETS HEREE IT FOR.mp3"),
    }),
    builtInClip({
      id: "announcement-now-pitching",
      group: "announcements",
      nickname: "Now Pitching",
      fileName: "NOW PITCHING.mp3",
      src: assetSrc("announcements", "NOW PITCHING.mp3"),
    }),
  ],
  numbers: BUILT_IN_NUMBER_FILES.map((fileName) => {
    const number = fileName.replace(/\.mp3$/i, "");
    return builtInClip({
      id: `number-${number}`,
      group: "numbers",
      nickname: `#${number}`,
      fileName,
      src: assetSrc("numbers", fileName),
    });
  }),
  positions: [
    ["P", "PITCHER.mp3"],
    ["C", "CATCHER.mp3"],
    ["1B", "FIRST BASEMEN.mp3"],
    ["2B", "SECOND BASEMEN.mp3"],
    ["3B", "THIRD BASEMEN.mp3"],
    ["SS", "SHORT STOP.mp3"],
    ["LF", "LEFT FIELDER.mp3"],
    ["CF", "CENTER FIELDER.mp3"],
    ["RF", "RIGHT FIELDER.mp3"],
  ].map(([nickname, fileName]) =>
    builtInClip({
      id: `position-${nickname.toLowerCase()}`,
      group: "positions",
      nickname,
      fileName,
      src: assetSrc("positions", fileName),
    }),
  ),
  songs: BUILT_IN_SONG_FILES.map((fileName) => {
    const baseName = fileName.replace(/\.mp3$/i, "");
    const songId = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return builtInClip({
      id: `song-${songId}`,
      group: "songs",
      nickname: BUILT_IN_SONG_TITLES[fileName] ?? baseName,
      fileName,
      src: assetSrc("songs", BUILT_IN_SONG_SOURCE_FILES[fileName] ?? fileName),
      duration: BUILT_IN_SONG_DURATIONS[fileName] ?? null,
    });
  }),
  effects: [
    builtInClip({
      id: "effect-he-gone",
      group: "effects",
      nickname: "He Gone",
      fileName: "he gone.mp3",
      src: eventAssetSrc("umpire-calls", "he gone.mp3"),
    }),
    builtInClip({
      id: "effect-hes-outta-there",
      group: "effects",
      nickname: "He's Outta There",
      fileName: "hes outta there.mp3",
      src: eventAssetSrc("umpire-calls", "hes outta there.mp3"),
    }),
    builtInClip({
      id: "effect-strike-3-hes-out",
      group: "effects",
      nickname: "Strike 3 He's Out",
      fileName: "strike 3 hes out.mp3",
      src: eventAssetSrc("umpire-calls", "strike 3 hes out.mp3"),
    }),
    builtInClip({
      id: "effect-when-i-say",
      group: "effects",
      nickname: "When I Say",
      fileName: "when i say.mp3",
      src: eventAssetSrc("crowd-hype", "when i say.mp3"),
    }),
    builtInClip({
      id: "effect-here-we-go",
      group: "effects",
      nickname: "Here We Go",
      fileName: "Here We Go.mp3",
      src: eventAssetSrc("crowd-hype", "Here We Go.mp3"),
    }),
    builtInClip({
      id: "effect-organ-scale-chant",
      group: "effects",
      nickname: "Organ Scale Chant",
      fileName: "Organ Scale Chant.mp3",
      src: eventAssetSrc("crowd-hype", "Organ Scale Chant.mp3"),
    }),
    builtInClip({
      id: "effect-we-will-rock-you",
      group: "effects",
      nickname: "We Will Rock You",
      fileName: "we will rock you.mp3",
      src: eventAssetSrc("crowd-hype", "we will rock you.mp3"),
    }),
    builtInClip({
      id: "effect-bullfighter",
      group: "effects",
      nickname: "Bullfighter",
      fileName: "Bullfighter.mp3",
      src: eventAssetSrc("crowd-hype", "Bullfighter.mp3"),
    }),
    builtInClip({
      id: "effect-defence",
      group: "effects",
      nickname: "Defence",
      fileName: "defence.mp3",
      src: eventAssetSrc("crowd-hype", "defence.mp3"),
    }),
    builtInClip({
      id: "effect-whistle-bomb",
      group: "effects",
      nickname: "Whistle Bomb",
      fileName: "whistle bomb.mp3",
      src: eventAssetSrc("crowd-hype", "whistle bomb.mp3"),
    }),
    builtInClip({
      id: "effect-hes-safe",
      group: "effects",
      nickname: "He's Safe",
      fileName: "Hes SAFE!.mp3",
      src: eventAssetSrc("umpire-calls", "Hes SAFE!.mp3"),
    }),
    builtInClip({
      id: "effect-hasta-la-vista-baby",
      group: "effects",
      nickname: "Hasta La Vista, Baby",
      fileName: "hasta la vista baby.mp3",
      src: eventAssetSrc("umpire-calls", "hasta la vista baby.mp3"),
    }),
    builtInClip({
      id: "effect-bye-have-a-good-time",
      group: "effects",
      nickname: "Bye Have A Good Time",
      fileName: "bye have a good time.mp3",
      src: eventAssetSrc("umpire-calls", "bye have a good time.mp3"),
    }),
    builtInClip({
      id: "effect-eye-of-the-tiger",
      group: "effects",
      nickname: "Eye Of The Tiger",
      fileName: "eye of the tiger.mp3",
      src: eventAssetSrc("crowd-hype", "eye of the tiger.mp3"),
    }),
    builtInClip({
      id: "effect-clap-yo-hands",
      group: "effects",
      nickname: "Clap Yo Hands",
      fileName: "clap yo hands.mp3",
      src: eventAssetSrc("crowd-hype", "clap yo hands.mp3"),
    }),
    builtInClip({
      id: "effect-gta-sound-effect",
      group: "effects",
      nickname: "GTA",
      fileName: "GTA Sound Effect.mp3",
      src: eventAssetSrc("crowd-hype", "GTA Sound Effect.mp3"),
    }),
    builtInClip({
      id: "effect-wow",
      group: "effects",
      nickname: "WOW!",
      fileName: "WOW!.mp3",
      src: eventAssetSrc("crowd-hype", "WOW!.mp3"),
    }),
    builtInClip({
      id: "effect-1up",
      group: "effects",
      nickname: "1UP",
      fileName: "1up.mp3",
      src: eventAssetSrc("crowd-hype", "1up.mp3"),
    }),
    builtInClip({
      id: "effect-boom-goes-the-dynamite",
      group: "effects",
      nickname: "Boom Goes The...",
      fileName: "boom goes the dynamite.mp3",
      src: eventAssetSrc("crowd-hype", "boom goes the dynamite.mp3"),
    }),
    builtInClip({
      id: "effect-bill-bill-bill",
      group: "effects",
      nickname: "BILL! BILL! BILL!",
      fileName: "BILL! BILL! BILL!.mp3",
      src: eventAssetSrc("player-hype", "BILL! BILL! BILL!.mp3"),
    }),
    builtInClip({
      id: "effect-88-mph",
      group: "effects",
      nickname: "88 MPH",
      fileName: "88 mph.mp3",
      src: eventAssetSrc("player-hype", "88 mph.mp3"),
    }),
    builtInClip({
      id: "effect-my-homie-nate",
      group: "effects",
      nickname: "My Homie Nate",
      fileName: "my homie nate.mp3",
      src: eventAssetSrc("player-hype", "my homie nate.mp3"),
    }),
  ],
};

export const BUILT_IN_PLAYER_CLIPS = Object.fromEntries(
  BUILT_IN_NAME_FILES.map((fileName) => {
    const playerName = titleCaseFromFileName(fileName);
    const key = playerName.toLowerCase().replace(/\s+/g, "_");
    return [
      key,
      builtInClip({
        id: `name-${key}`,
        group: "names",
        nickname: playerName,
        fileName,
        src: assetSrc("names", fileName),
      }),
    ];
  }),
);

export const BUILT_IN_SONGS = {
  default_song:
    BUILT_IN_LIBRARIES.songs.find((clip) => clip.fileName === "Can't Stop Won't Stop - Stop Drop Roll.mp3") ??
    BUILT_IN_LIBRARIES.songs[0],
};

export const BUILT_IN_ROSTER = BUILT_IN_NAME_FILES.map((fileName, index) => {
  const name = titleCaseFromFileName(fileName);
  const key = name.toLowerCase().replace(/\s+/g, "_");
  const rosterAssignment = DEFAULT_ROSTER_ASSIGNMENTS[index] ?? {};
  const jerseyNumber = rosterAssignment.jerseyNumber ?? "";
  const positionLabel = rosterAssignment.positionLabel ?? "";
  const announcementClipId =
    index % 2 === 0 ? "announcement-now-batting" : "announcement-up-next";

  return {
    name,
    jerseyNumber,
    positionLabel,
    announcementClipId,
    numberClipId: jerseyNumber ? `number-${jerseyNumber}` : "",
    positionClipId: positionLabel ? `position-${positionLabel.toLowerCase()}` : "",
    nameClip: BUILT_IN_PLAYER_CLIPS[key],
    songClip: index === 0 ? BUILT_IN_SONGS.default_song : null,
    sequence: ["announcement", "number", "position", "name"],
  };
});
