const MAX_DECODED_BYTES = 32 * 1024 * 1024;
const LOAD_TIMEOUT_MS = 20000;

export function withTimeout(promise, durationMs, message) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), durationMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

// Unlock on the user's tap, then reuse the context for downloaded and timed
// clips. Bound decoded memory rather than decoding the entire mobile library.
export function createWebAudioPlayback(AudioContextClass, audioHost = globalThis.navigator) {
  let context = null;
  const decoded = new Map();
  const pending = new Map();
  let decodedBytes = 0;

  const resume = () => {
    // Safari's default Web Audio session follows the Silent switch. Declare
    // media playback before creating/resuming the context, as HTMLAudio does.
    try {
      if (audioHost?.audioSession) audioHost.audioSession.type = "playback";
    } catch { /* Older hosts may expose an unsupported or read-only session. */ }
    if (!context || context.state === "closed") context = new AudioContextClass();
    const current = context;
    // Keep this synchronous: Safari needs the original user gesture.
    const resumed = current.resume();
    const silent = current.createBufferSource();
    silent.buffer = current.createBuffer(1, 1, current.sampleRate);
    silent.connect(current.destination);
    silent.onended = () => silent.disconnect();
    silent.start();
    return withTimeout(resumed, 5000, "Audio could not start. Tap Reset Audio, then try again.")
      .then(() => {
        if (current !== context || current.state !== "running") {
          throw new Error("Audio is paused. Tap Reset Audio, then try again.");
        }
      });
  };

  const prepare = (src) => {
    if (decoded.has(src)) {
      const buffer = decoded.get(src);
      decoded.delete(src);
      decoded.set(src, buffer);
      return Promise.resolve(buffer);
    }
    if (pending.has(src)) return pending.get(src);
    const current = context;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    const load = Promise.resolve().then(async () => {
      try {
        const response = await fetch(src, { cache: "force-cache", signal: controller.signal });
        if (!response.ok || response.status === 206) throw new Error("The audio clip could not be downloaded.");
        const bytes = await response.arrayBuffer();
        const buffer = await withTimeout(current.decodeAudioData(bytes), LOAD_TIMEOUT_MS, "The audio clip took too long to load.");
        if (current !== context) throw new Error("Audio preparation was cancelled.");
        const size = buffer.length * buffer.numberOfChannels * 4;
        while (decoded.size && decodedBytes + size > MAX_DECODED_BYTES) {
          const oldest = decoded.keys().next().value;
          const previous = decoded.get(oldest);
          decodedBytes -= previous.length * previous.numberOfChannels * 4;
          decoded.delete(oldest);
        }
        if (size <= MAX_DECODED_BYTES) {
          decoded.set(src, buffer);
          decodedBytes += size;
        }
        return buffer;
      } finally {
        clearTimeout(timeout);
        if (pending.get(src) === load) pending.delete(src);
      }
    });
    pending.set(src, load);
    return load;
  };

  const play = (buffer, onEnded, startTime = context.currentTime) => {
    const current = context;
    const source = current.createBufferSource();
    const gain = current.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(current.destination);
    let stopped = false;
    const disconnect = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.onended = () => {
      disconnect();
      if (!stopped) onEnded?.();
    };
    source.start(startTime);
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        source.onended = null;
        try { source.stop(); } catch { /* The source may have already ended. */ }
        disconnect();
      },
      fade(durationMs) {
        const now = current.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
        return new Promise((resolve) => setTimeout(resolve, durationMs));
      },
    };
  };

  const reset = () => {
    const previous = context;
    context = null;
    decoded.clear();
    pending.clear();
    decodedBytes = 0;
    previous?.close().catch(() => {});
  };

  return { resume, prepare, play, reset, get currentTime() { return context.currentTime; } };
}
