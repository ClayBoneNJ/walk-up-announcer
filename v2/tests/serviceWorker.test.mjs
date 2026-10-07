import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const origin = "https://example.test";
const clipUrl = `${origin}/walk-up-announcer/assets/audio/clip.mp3?v=136`;
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker({ cached = null, fetchImpl = async () => { throw new Error("Offline"); }, putImpl } = {}) {
  const listeners = {};
  let puts = 0;
  const cache = { match: async () => cached?.clone(), addAll: async () => {},
    put: async (...args) => { puts++; await putImpl?.(...args); } };
  vm.runInNewContext(source, { Request, Response, Headers, URL, AbortController, setTimeout, clearTimeout,
    fetch: fetchImpl, caches: { open: async () => cache, keys: async () => [], delete: async () => {} },
    self: { location: { origin }, addEventListener: (type, callback) => listeners[type] = callback,
      skipWaiting: async () => {}, clients: { claim: async () => {} } } });
  return {
    async request(range, url = clipUrl) {
      let response;
      listeners.fetch({ request: new Request(url, { headers: range ? { Range: range } : {} }),
        respondWith: (result) => response = result });
      return response;
    },
    async cache(urls) {
      let done;
      const messages = [];
      listeners.message({ data: { type: "CACHE_URLS", urls }, ports: [{ postMessage: (value) => messages.push(value) }],
        waitUntil: (result) => done = result });
      await done;
      return messages.at(-1);
    },
    get puts() { return puts; },
  };
}

for (const [range, content, contentRange] of [
  ["bytes=0-1", "ab", "bytes 0-1/6"],
  ["bytes=2-", "cdef", "bytes 2-5/6"],
  ["bytes=-2", "ef", "bytes 4-5/6"],
  ["bytes=0-999", "abcdef", "bytes 0-5/6"],
]) {
  test(`Safari cached range ${range} returns partial bytes and length`, async () => {
    const response = await worker({ cached: new Response("abcdef", { headers: { "Content-Type": "audio/mpeg" } }) }).request(range);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Range"), contentRange);
    assert.equal(response.headers.get("Content-Length"), String(content.length));
    assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
    assert.equal(await response.text(), content);
  });
}
for (const range of ["bytes=6-", "bytes=3-1", "bytes=-0", "bytes=-", "garbage"]) {
  test(`Invalid range ${range} returns 416`, async () => {
    const response = await worker({ cached: new Response("abcdef") }).request(range);
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("Content-Range"), "bytes */6");
  });
}
test("Full-file downloads still receive full cached audio", async () => {
  const response = await worker({ cached: new Response("abcdef") }).request();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "abcdef");
});
test("Arming an already cached library works offline without network fetches", async () => {
  const result = await worker({ cached: new Response("abcdef") }).cache([clipUrl, clipUrl]);
  assert.equal(result.cachedCount, 1);
  assert.equal(result.failedCount, 0);
});
test("Partial streamed responses are played without unsupported Cache.put", async () => {
  const harness = worker({ fetchImpl: async () => new Response("ab", { status: 206 }) });
  const response = await harness.request("bytes=0-1");
  assert.equal(response.status, 206);
  assert.equal(harness.puts, 0);
});
test("Storage failure does not prevent online playback", async () => {
  const response = await worker({ fetchImpl: async () => new Response("abcdef"),
    putImpl: async () => { throw new Error("Quota exceeded"); } }).request();
  assert.equal(await response.text(), "abcdef");
});
test("Preloading limits network concurrency and reports individual failures", async () => {
  let active = 0;
  let maxActive = 0;
  const harness = worker({ fetchImpl: async (request) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return new Response("audio", { status: request.url.includes("bad") ? 404 : 200 });
  } });
  const result = await harness.cache([...Array.from({ length: 12 }, (_, i) => `${clipUrl}&clip=${i}`), `${clipUrl}&bad`]);
  assert.equal(maxActive, 4);
  assert.equal(result.cachedCount, 12);
  assert.equal(result.failedCount, 1);
});
test("Requests to other origins are left alone", async () => {
  assert.equal(await worker().request(null, "https://other.test/walk-up-announcer/a.mp3"), undefined);
});
