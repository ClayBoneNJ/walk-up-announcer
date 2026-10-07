import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
const root = new URL("../", import.meta.url);
const audioDurations = JSON.parse(readFileSync(new URL("src/lib/audioDurations.json", root), "utf8"));
const temporary = readFileSync(new URL("src/lib/temporaryPlayers/index.js", root), "utf8").replace("export const ", "const ");
const source = readFileSync(new URL("src/lib/sampleData.js", root), "utf8")
  .replace(/^import [\s\S]*?;\s*/gm, "").replaceAll("export const ", "const ")
  .replaceAll("import.meta.env.BASE_URL", '"/walk-up-announcer/"');
const { clipLibrary } = vm.runInNewContext(`${temporary}\n${source}\n({clipLibrary})`,
  { audioDurations, AudioLines: {}, Library: {}, Sparkles: {}, Users: {} });
test("Every soundboard clip has its measured duration immediately", () => {
  for (const clip of clipLibrary) {
    const path = decodeURIComponent(clip.src.split("assets/audio/")[1].split("?")[0]);
    assert.ok(existsSync(new URL(`public/assets/audio/${path}`, root)), path);
    assert.ok(Number.isFinite(audioDurations[path]) && audioDurations[path] > 0, path);
    assert.equal(clip.durationMs, audioDurations[path], path);
  }
});
test("Measured durations retain the boosted short and crowd clips", () => {
  assert.ok(audioDurations["events/crowd-hype/boom goes the dynamite.mp3"] > 1200);
  assert.ok(audioDurations["events/crowd-hype/boom goes the dynamite.mp3"] < 1400);
  assert.ok(audioDurations["events/crowd-hype/defence.mp3"] > 6200);
  assert.ok(audioDurations["events/crowd-hype/defence.mp3"] < 6400);
});
