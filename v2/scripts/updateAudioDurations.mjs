import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../public/assets/audio/", import.meta.url));
const ffmpeg = process.argv[2] || "ffmpeg";
const durations = {};
for (const entry of readdirSync(root, { recursive: true }).sort()) {
  if (!/\.(mp3|wav)$/i.test(entry)) continue;
  // Decode to 1 kHz mono PCM: each sample is exactly one millisecond.
  // This measures the audible data, excluding MP3 encoder padding.
  const result = spawnSync(ffmpeg, ["-v", "error", "-nostdin", "-i", join(root, entry),
    "-ac", "1", "-ar", "1000", "-f", "s16le", "pipe:1"], { maxBuffer: 10 * 1024 * 1024 });
  if (result.error || result.status !== 0 || !result.stdout.length) {
    throw new Error(`Unable to measure ${entry}: ${result.error?.message || result.stderr}`);
  }
  durations[entry.replaceAll("\\", "/")] = result.stdout.length / 2;
}
writeFileSync(new URL("../src/lib/audioDurations.json", import.meta.url),
  JSON.stringify(durations, null, 2) + "\n");
console.log(`Measured ${Object.keys(durations).length} audio clips.`);
