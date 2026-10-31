import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createWebAudioPlayback, withTimeout } from "../src/lib/webAudioPlayback.js";

const hookSource = readFileSync(new URL("../src/hooks/usePlaybackEngine.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export function ", "function ");
function harness({ mobile = true, serviceWorker } = {}) {
  let gesture = true;
  const contexts = [];
  const state = [];
  const timers = new Map();
  const played = [];
  const media = [];
  const gains = [];
  let id = 0;
  class MockContext {
    constructor() { this.state = "suspended"; this.sampleRate = 44100; this.currentTime = 10; this.sources = []; contexts.push(this); }
    resume() { assert.ok(gesture, "Audio must resume inside the original tap"); this.state = "running"; return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createBuffer() { return { length: 1, numberOfChannels: 1 }; }
    decodeAudioData(bytes) { return Promise.resolve({ length: 44100, numberOfChannels: 2, label: new Uint8Array(bytes)[0] }); }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start(time) { this.startTime = time; }, stop() { this.stopped = true; } };
      this.sources.push(source);
      return source;
    }
    createGain() {
      const events = [];
      gains.push(events);
      return { connect() {}, disconnect() {}, gain: { value: 1,
        cancelScheduledValues(time) { events.push(["cancel", time]); },
        setValueAtTime(value, time) { events.push(["set", value, time]); },
        linearRampToValueAtTime(value, time) { events.push(["ramp", value, time]); } } };
    }
  }
  class MockAudio {
    constructor(src) { this.src = src; this.volume = 1; media.push(this); }
    play() { this.played = true; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }
  const context = { createWebAudioPlayback, withTimeout, navigator: { platform: mobile ? "iPhone" : "Win32", userAgent: mobile ? "iPhone" : "Chrome", ...(serviceWorker ? { serviceWorker } : {}) },
    MessageChannel: class {
      constructor() {
        this.port1 = { close() {} };
        this.port2 = { postMessage: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })) };
      }
    },
    window: { AudioContext: MockContext, setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
      clearTimeout: (key) => timers.delete(key) }, Audio: MockAudio, AbortSignal, URL, fetch: (...args) => globalThis.fetch(...args),
    performance, useRef: (value) => ({ current: value }), useState: (value) => {
      const key = state.length; state.push(value); return [value, (next) => state[key] = typeof next === "function" ? next(state[key]) : next];
    }, useMemo: (fn) => fn(), useEffect() {} };
  const engine = vm.runInNewContext(`${hookSource}\nusePlaybackEngine({ onClipPlayed: (clip) => played.push(clip.id) })`, { ...context, played });
  return { engine, contexts, state, timers, played, media, gains, endGesture() { gesture = false; },
    get audibleSources() { return contexts.flatMap((ctx) => ctx.sources).filter((s) => s.buffer?.length > 1); } };
}
const clip = (id) => ({ id, label: id, src: `https://example.test/${id}.mp3` });
const audioResponse = (label = 2) => new Response(new Uint8Array([label]), { headers: { "Content-Type": "audio/mpeg" } });
async function withFetch(fetchImpl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { await run(); } finally { globalThis.fetch = original; }
}
async function until(predicate) {
  for (let i = 0; i < 30 && !predicate(); i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(predicate(), "Expected asynchronous operation did not start");
}

test("iPhone clip resumes during the tap and plays after its download", async () => {
  await withFetch(async () => audioResponse(), async () => {
    const h = harness();
    const playing = h.engine.playClipNow(clip("test"));
    assert.equal(h.contexts[0].state, "running");
    h.endGesture();
    await playing;
    assert.equal(h.audibleSources.length, 1);
    assert.equal(h.media.length, 0);
    assert.deepEqual(h.played, ["test"]);
  });
});
test("iPhone walkup schedules voice/song offsets without a second tap or re-arming", async () => {
  await withFetch(async () => audioResponse(), async () => {
    const h = harness();
    const playing = h.engine.playSequence({ id: "p", name: "Player", sequence: [
      { startMs: 0, clip: clip("voice") }, { startMs: 3600, clip: clip("song") },
    ] });
    h.endGesture();
    await playing;
    assert.equal(h.audibleSources.length, 2);
    assert.ok(Math.abs(h.audibleSources[1].startTime - h.audibleSources[0].startTime - 3.6) < 0.00001);
    assert.equal(h.state[1].loading, false);
    await h.engine.fadeOutAndStopAll({ fadeOut: false });
    assert.ok(h.audibleSources.every((s) => s.stopped));
    assert.equal(h.timers.size, 0);
  });
});
test("iPhone music ducks across adjacent announcer clips and restores after the last voice", async () => {
  await withFetch(async () => audioResponse(), async () => {
    const h = harness();
    await h.engine.playSequence({ id: "p", name: "Player", sequence: [
      { startMs: 0, clip: { ...clip("song"), group: "songs", durationMs: 10000 } },
      { startMs: 1000, clip: { ...clip("number"), group: "numbers", durationMs: 1000 } },
      { startMs: 2100, clip: { ...clip("name"), group: "names", durationMs: 1500 } },
    ] });
    const gain = h.gains[0];
    const start = h.audibleSources[0].startTime;
    assert.deepEqual(gain.map(([kind, volume]) => [kind, volume]),
      [["set", 1], ["ramp", 1], ["ramp", 0.25], ["ramp", 0.25], ["ramp", 1]]);
    assert.ok(Math.abs(gain.at(-1)[2] - start - 3.95) < 0.00001);
    assert.equal(h.gains[1].length, 0, "The announcer stays at full volume");
    await h.engine.fadeOutAndStopAll();
    assert.ok(gain.some(([kind]) => kind === "cancel"), "Stop cancels future ducking ramps");
    assert.ok(h.audibleSources.every((source) => source.stopped));
  });
});

test("Halloween song starting under the combined walkup starts ducked; nonoverlapping music stays full", async () => {
  await withFetch(async () => audioResponse(), async () => {
    for (const [songStart, initialVolume] of [[1000, 0.25], [4000, 1]]) {
      const h = harness();
      await h.engine.playSequence({ id: "p", name: "Player", sequence: [
        { startMs: 0, clip: { ...clip("walkup"), group: "halloween-walkups", durationMs: 3000 } },
        { startMs: songStart, clip: { ...clip("song"), group: "songs", durationMs: 10000 } },
      ] });
      assert.equal(h.gains[1][0][1], initialVolume);
      await h.engine.fadeOutAndStopAll({ fadeOut: false });
    }
  });
});

test("Desktop music starts ducked under speech and Reset cancels its volume timer", async () => {
  const h = harness({ mobile: false });
  await h.engine.playSequence({ id: "p", name: "Player", sequence: [
    { startMs: 0, clip: { ...clip("song"), group: "songs", durationMs: 10000 } },
    { startMs: 0, clip: { ...clip("voice"), group: "names", durationMs: 3000 } },
  ] });
  const triggers = [...h.timers.entries()];
  for (const [id, timer] of triggers) { h.timers.delete(id); await timer.fn(); }
  assert.equal(h.media[0].volume, 0.25);
  assert.equal(h.media[1].volume, 1);
  assert.ok(h.timers.size > 0);
  await h.engine.resetEngine();
  assert.equal(h.timers.size, 0);
  assert.ok(h.media.every((audio) => audio.paused));
});

test("Stop during a mobile download prevents the clip starting afterward", async () => {
  let complete;
  await withFetch(() => new Promise((resolve) => complete = resolve), async () => {
    const h = harness();
    const playing = h.engine.playClipNow(clip("slow"));
    await until(() => complete);
    await h.engine.fadeOutAndStopAll({ fadeOut: false });
    complete(audioResponse());
    await playing;
    assert.equal(h.audibleSources.length, 0);
    assert.equal(h.state[0], null);
  });
});
test("The latest mobile tap wins even when the older download completes last", async () => {
  const downloads = new Map();
  await withFetch((src) => new Promise((resolve) => downloads.set(src, resolve)), async () => {
    const h = harness();
    const first = h.engine.playClipNow(clip("first"), null, { fadeOutPrevious: false });
    await until(() => downloads.has(clip("first").src));
    const second = h.engine.playClipNow(clip("second"), null, { fadeOutPrevious: false });
    await until(() => downloads.has(clip("second").src));
    downloads.get(clip("second").src)(audioResponse(3));
    await second;
    downloads.get(clip("first").src)(audioResponse(2));
    await first;
    assert.deepEqual(h.played, ["second"]);
    assert.equal(h.audibleSources.length, 1);
    await h.engine.fadeOutAndStopAll({ fadeOut: false });
    assert.ok(h.audibleSources.every((s) => s.stopped));
  });
});
test("A failed mobile download shows an error and retries on the next tap", async () => {
  let requests = 0;
  await withFetch(async () => ++requests === 1 ? new Response("missing", { status: 404 }) : audioResponse(), async () => {
    const h = harness();
    await h.engine.playClipNow(clip("retry"));
    assert.equal(h.state[0], null);
    assert.match(h.state[2], /Could not play audio/);
    await h.engine.playClipNow(clip("retry"));
    assert.equal(requests, 2);
    assert.equal(h.state[2], "");
    assert.deepEqual(h.played, ["retry"]);
  });
});
test("Interrupted iPhone context is resumed on the next tap", async () => {
  await withFetch(async () => audioResponse(), async () => {
    const h = harness();
    await h.engine.playClipNow(clip("test"));
    h.contexts[0].state = "interrupted";
    await h.engine.playClipNow(clip("test"), null, { fadeOutPrevious: false });
    assert.equal(h.contexts[0].state, "running");
    assert.equal(h.audibleSources.length, 2);
  });
});
test("Desktop soundboard continues using media elements", async () => {
  const h = harness({ mobile: false });
  await h.engine.playClipNow(clip("desktop"));
  assert.equal(h.contexts.length, 0);
  assert.equal(h.media.length, 1);
  assert.equal(h.media[0].played, true);
  await h.engine.fadeOutAndStopAll({ fadeOut: false });
  assert.equal(h.media[0].paused, true);
});
test("Loading watchdog rejects an unresolved operation instead of hanging", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5, "Timed out"), /Timed out/);
});

test("Arm Audio unlocks iPhone audio while caching without decoding the whole library", async () => {
  const serviceWorker = { ready: Promise.resolve({ active: { postMessage(message, ports) {
    const count = message.urls.length;
    ports[0].postMessage({ type: "CACHE_URLS_COMPLETE", cachedCount: count, failedCount: 0, totalCount: count });
  } } }) };
  const h = harness({ serviceWorker });
  const arming = h.engine.primeSources([clip("one").src, clip("two").src]);
  h.endGesture();
  await arming;
  assert.equal(h.state[1].armed, true);
  assert.equal(h.state[1].offline, true);
  assert.equal(h.state[1].cachedCount, 2);
  assert.equal(h.audibleSources.length, 0);
});
test("Reset during iPhone arming ignores stale completion and preserves reset state", async () => {
  let port;
  const serviceWorker = { ready: Promise.resolve({ active: { postMessage(message, ports) { port = ports[0]; } } }) };
  const h = harness({ serviceWorker });
  const arming = h.engine.primeSources([clip("one").src]);
  await until(() => port);
  await h.engine.resetEngine();
  port.postMessage({ type: "CACHE_URLS_COMPLETE", cachedCount: 1, failedCount: 0, totalCount: 1 });
  await arming;
  assert.equal(h.state[1].loading, false);
  assert.equal(h.state[1].armed, false);
  assert.equal(h.state[1].totalCount, 0);
  assert.equal(h.contexts[0].state, "closed");
});
test("Stop during mobile walkup preparation cancels every future announcement and song", async () => {
  const downloads = new Map();
  await withFetch((src) => new Promise((resolve) => downloads.set(src, resolve)), async () => {
    const h = harness();
    const playing = h.engine.playSequence({ id: "p", name: "Player", sequence: [
      { startMs: 0, clip: clip("voice") }, { startMs: 3600, clip: clip("song") },
    ] });
    await until(() => downloads.size === 2);
    await h.engine.fadeOutAndStopAll({ fadeOut: false });
    downloads.forEach((resolve) => resolve(audioResponse()));
    await playing;
    assert.equal(h.audibleSources.length, 0);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.played, []);
  });
});

test("iPhone declares media playback before creating/resuming audio and reapplies it after reset", async () => {
  const events = [];
  const audioHost = { audioSession: { set type(value) { events.push(value); } } };
  class Context {
    constructor() { events.push("create"); this.state = "suspended"; this.sampleRate = 44100; }
    resume() { events.push("resume"); this.state = "running"; return Promise.resolve(); }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {} }; }
    createBuffer() { return {}; }
    close() { return Promise.resolve(); }
  }
  const backend = createWebAudioPlayback(Context, audioHost);
  await backend.resume();
  await backend.resume();
  backend.reset();
  await backend.resume();
  assert.deepEqual(events, ["playback", "create", "resume", "playback", "resume", "playback", "create", "resume"]);
  backend.reset();
});

test("Unsupported audio sessions do not prevent audio from resuming", async () => {
  class Context {
    constructor() { this.state = "suspended"; this.sampleRate = 44100; }
    resume() { this.state = "running"; return Promise.resolve(); }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {} }; }
    createBuffer() { return {}; }
    close() { return Promise.resolve(); }
  }
  for (const host of [undefined, {}, { audioSession: { set type(_) { throw new Error("Unsupported"); } } }]) {
    const backend = createWebAudioPlayback(Context, host);
    await backend.resume();
    backend.reset();
  }
});
