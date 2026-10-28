import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const temporary = read("src/lib/temporaryPlayers/index.js").replace("export const ", "const ");
const data = read("src/lib/sampleData.js")
  .replace(/^import [\s\S]*?;\s*/gm, "").replaceAll("export const ", "const ")
  .replaceAll("import.meta.env.BASE_URL", '"/walk-up-announcer/"');
const app = read("src/App.jsx");
const helpers = app.slice(app.indexOf("function getDefaultPosition("), app.indexOf("function formatMs("));
const storage = new Map();
const model = vm.runInNewContext(`${temporary}\n${data}\n
  const V1_POSITION_BY_JERSEY = {9: "P"};
  const PLAYER_SEQUENCES_STORAGE_KEY = "walk-up-announcer-v2-player-sequences";
  const clipById = new Map([...clipLibrary, ...halloweenClipLibrary].map((clip) => [clip.id, clip]));
  ${helpers}
  ({players, halloweenPlayers, clipLibrary, halloweenClipLibrary,
    serializePlayerSequences, hydrateSavedPlayerSequences, loadSavedPlayerSequences,
    createPortablePlayerSequencesExport});`, {
  audioDurations: JSON.parse(read("src/lib/audioDurations.json")),
  AudioLines: {}, Library: {}, Sparkles: {}, Users: {},
  window: { localStorage: { getItem: (key) => storage.get(key) ?? null } },
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test("Halloween has 16 combined walkups on A and no borrowed songs", () => {
  assert.equal(model.players.length, 17);
  assert.equal(model.halloweenPlayers.length, 16);
  for (const player of model.halloweenPlayers) {
    assert.equal(player.sequence.length, 1, player.name);
    const [event] = player.sequence;
    assert.equal(event.track, "A");
    assert.equal(event.startMs, 0);
    assert.equal(event.clip.playerId, player.id);
    assert.equal(event.clip.group, "halloween-walkups");
    assert.ok(event.clip.durationMs > 0);
  }
  assert.equal(model.halloweenClipLibrary.filter((clip) => clip.group === "songs").length, 0);
});

test("Both editions use exactly the same crowd and game effects", () => {
  const effects = (library) => library.filter((clip) => ["crowd", "umpire-calls", "player-hype", "crowd-hype"].includes(clip.group));
  assert.deepEqual(plain(effects(model.halloweenClipLibrary)), plain(effects(model.clipLibrary)));
});

test("Edition settings reload their own order and timing without overwriting regular settings", () => {
  const regularKey = "walk-up-announcer-v2-player-sequences";
  const halloweenKey = "walk-up-announcer-halloween-player-sequences";
  const regular = plain(model.serializePlayerSequences(model.players));
  regular[0].sequence.find((event) => event.track === "B").startMs = 7250;
  const halloween = plain(model.serializePlayerSequences(model.halloweenPlayers)).reverse();
  halloween[0].sequence[0].startMs = 1250;
  storage.set(regularKey, JSON.stringify(regular));
  storage.set(halloweenKey, JSON.stringify(halloween));
  const restoredHalloween = model.loadSavedPlayerSequences(model.halloweenPlayers, model.halloweenClipLibrary, halloweenKey);
  const restoredRegular = model.loadSavedPlayerSequences(model.players, model.clipLibrary, regularKey);
  assert.equal(restoredHalloween[0].id, halloween[0].id);
  assert.equal(restoredHalloween[0].sequence[0].startMs, 1250);
  assert.equal(restoredRegular[0].id, regular[0].id);
  assert.equal(restoredRegular[0].sequence.find((event) => event.track === "B").startMs, 7250);
  assert.equal(storage.get(regularKey), JSON.stringify(regular));
  assert.equal(model.createPortablePlayerSequencesExport(restoredHalloween, "halloween").edition, "halloween");
});

test("Halloween hydration refuses clips from the regular edition", () => {
  const saved = plain(model.serializePlayerSequences(model.halloweenPlayers));
  saved[0].sequence[0].clipId = model.players[0].sequence[0].clip.id;
  const hydrated = model.hydrateSavedPlayerSequences(saved, model.halloweenPlayers, model.halloweenClipLibrary);
  assert.equal(hydrated[0].sequence[0].clip.group, "halloween-walkups");
});
