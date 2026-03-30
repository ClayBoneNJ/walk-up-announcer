function builtInClip({ id, group, nickname, fileName, src }) {
  return {
    id,
    group,
    nickname,
    fileName,
    mimeType: "audio/mpeg",
    size: 0,
    duration: null,
    createdAt: 0,
    dataUrl: null,
    src,
    builtIn: true,
  };
}

function assetSrc(folder, fileName) {
  return `${import.meta.env.BASE_URL}assets/audio/${folder}/${encodeURIComponent(fileName)}`;
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
  effects: [],
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
  default_song: builtInClip({
    id: "song-stop-drop-roll",
    group: "songs",
    nickname: "Stop Drop Roll",
    fileName: "Can't Stop Won't Stop - Stop Drop Roll.mp3",
    src: assetSrc("songs", "Can't Stop Won't Stop - Stop Drop Roll.mp3"),
  }),
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
