import { useEffect, useMemo, useRef, useState } from "react";
import { createWebAudioPlayback, withTimeout } from "../lib/webAudioPlayback";

const STOP_FADE_MS = 700;
const EMPTY_READY_STATE = {
  offline: false, armed: false, directPlayback: false,
  failedCount: 0, cachedCount: 0, totalCount: 0, loading: false,
};

async function cacheSourcesWithServiceWorker(sources = [], onProgress = () => {}) {
  const failed = { cachedCount: 0, failedCount: sources.length, totalCount: sources.length };
  if (!("serviceWorker" in navigator)) return failed;
  let registration;
  try {
    registration = await withTimeout(navigator.serviceWorker.ready, 5000, "Offline caching is unavailable.");
  } catch {
    return failed;
  }
  const worker = navigator.serviceWorker.controller || registration.active;
  if (!worker) return failed;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let lastProgress = failed;
    const finish = (result) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(result);
    };
    // Refresh the watchdog on each completed download, not on total library size.
    let timeout;
    const armTimeout = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => finish({
        ...lastProgress,
        failedCount: sources.length - lastProgress.cachedCount,
      }), 30000);
    };
    channel.port1.onmessage = (event) => {
      if (event.data?.type === "CACHE_URLS_PROGRESS") {
        lastProgress = event.data;
        onProgress(event.data);
        armTimeout();
      } else if (event.data?.type === "CACHE_URLS_COMPLETE") {
        finish(event.data);
      }
    };
    armTimeout();
    try { worker.postMessage({ type: "CACHE_URLS", urls: sources }, [channel.port2]); }
    catch { finish(failed); }
  });
}

function isIOSAudioHost() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function createMediaVoice(audio) {
  return {
    stop() {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
    fade(durationMs) {
      const startingVolume = audio.volume;
      const start = performance.now();
      return new Promise((resolve) => {
        const tick = () => {
          const progress = Math.min(1, (performance.now() - start) / durationMs);
          audio.volume = startingVolume * (1 - progress);
          if (progress === 1) resolve();
          else window.setTimeout(tick, 25);
        };
        tick();
      });
    },
  };
}

export function usePlaybackEngine({ onClipPlayed } = {}) {
  const warmCacheRef = useRef(new Map());
  const objectUrlCacheRef = useRef(new Map());
  const activeVoicesRef = useRef([]);
  const sequenceTimeoutsRef = useRef([]);
  const playbackGenerationRef = useRef(0);
  const preloadGenerationRef = useRef(0);
  const mobileBackendRef = useRef(null);
  const [activePlayback, setActivePlayback] = useState(null);
  const [audioReadyState, setAudioReadyState] = useState(EMPTY_READY_STATE);
  const [playbackError, setPlaybackError] = useState("");

  const getMobileBackend = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!isIOSAudioHost() || !AudioContextClass) return null;
    if (!mobileBackendRef.current) mobileBackendRef.current = createWebAudioPlayback(AudioContextClass);
    return mobileBackendRef.current;
  };

  const clearSequenceTimeouts = () => {
    sequenceTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    sequenceTimeoutsRef.current = [];
  };

  const fadeOutAndStopAll = async ({ fadeOut = true } = {}) => {
    playbackGenerationRef.current += 1;
    clearSequenceTimeouts();
    setActivePlayback(null);
    const voices = [...activeVoicesRef.current];
    await Promise.all(voices.map(async (voice) => {
      try {
        if (fadeOut) await voice.fade(STOP_FADE_MS);
      } finally {
        voice.stop();
        activeVoicesRef.current = activeVoicesRef.current.filter((entry) => entry !== voice);
      }
    }));
  };

  const reportFailure = (error, generation) => {
    if (generation !== playbackGenerationRef.current) return;
    void fadeOutAndStopAll({ fadeOut: false });
    setPlaybackError(error?.name === "NotAllowedError"
      ? "Audio was blocked. Tap Arm Audio, then try again."
      : "Could not play audio. Check your connection, or tap Reset Audio and try again.");
  };

  const resumeMobile = (backend) => {
    try {
      return backend ? backend.resume().then(() => null, (error) => error) : Promise.resolve(null);
    } catch (error) {
      return Promise.resolve(error);
    }
  };

  const primeSources = async (sources = []) => {
    const uniqueSources = [...new Set(sources.filter(Boolean))];
    const generation = ++preloadGenerationRef.current;
    const backend = getMobileBackend();
    // Resume before the first await so Arm Audio unlocks mobile playback too.
    const resumed = resumeMobile(backend);
    setPlaybackError("");
    setAudioReadyState((current) => ({ ...current, failedCount: 0, cachedCount: 0,
      totalCount: uniqueSources.length, loading: true }));
    if (isIOSAudioHost()) {
      const result = await cacheSourcesWithServiceWorker(uniqueSources, (progress) => {
        if (generation !== preloadGenerationRef.current) return;
        setAudioReadyState((current) => ({ ...current, cachedCount: progress.cachedCount,
          failedCount: progress.failedCount, totalCount: progress.totalCount, loading: true }));
      });
      const error = await resumed;
      if (generation !== preloadGenerationRef.current) return;
      if (error) setPlaybackError(error.message);
      setAudioReadyState({ offline: result.failedCount === 0, armed: Boolean(backend) && !error,
        directPlayback: !backend, ...result, loading: false });
      return;
    }
    const results = await Promise.allSettled(uniqueSources.map(async (src) => {
      if (warmCacheRef.current.has(src)) return warmCacheRef.current.get(src);
      const load = fetch(src, { cache: "force-cache", signal: AbortSignal.timeout(20000) })
        .then((response) => {
          if (!response.ok) throw new Error(`Unable to preload ${src}`);
          return response.blob();
        }).then((blob) => {
          if (generation !== preloadGenerationRef.current) return src;
          const url = URL.createObjectURL(blob);
          objectUrlCacheRef.current.set(src, url);
          return url;
        }).catch((error) => {
          if (warmCacheRef.current.get(src) === load) warmCacheRef.current.delete(src);
          throw error;
        });
      warmCacheRef.current.set(src, load);
      return load;
    }));
    if (generation !== preloadGenerationRef.current) return;
    const failedCount = results.filter((result) => result.status === "rejected").length;
    setAudioReadyState({ offline: failedCount === 0, armed: uniqueSources.length > 0 && failedCount === 0,
      directPlayback: false, failedCount, cachedCount: uniqueSources.length - failedCount,
      totalCount: uniqueSources.length, loading: false });
  };

  const getPlayableSrc = async (src) => {
    if (objectUrlCacheRef.current.has(src)) return objectUrlCacheRef.current.get(src);
    try { return await warmCacheRef.current.get(src) || src; }
    catch { return src; }
  };

  const retireVoice = (voice, generation) => {
    activeVoicesRef.current = activeVoicesRef.current.filter((entry) => entry !== voice);
    if (generation === playbackGenerationRef.current && !activeVoicesRef.current.length) {
      setActivePlayback(null);
    }
  };

  const startMedia = async (src, clip, generation) => {
    if (generation !== playbackGenerationRef.current) return;
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.crossOrigin = "anonymous";
    const voice = createMediaVoice(audio);
    audio.onended = () => retireVoice(voice, generation);
    audio.onerror = () => reportFailure(new Error("Audio loading failed"), generation);
    activeVoicesRef.current.push(voice);
    await audio.play();
    if (generation === playbackGenerationRef.current) onClipPlayed?.(clip);
  };

  const playClipNow = async (clip, player = null, { fadeOutPrevious = true } = {}) => {
    const backend = getMobileBackend();
    const resumed = resumeMobile(backend);
    const stopping = fadeOutAndStopAll({ fadeOut: fadeOutPrevious });
    const generation = playbackGenerationRef.current;
    setPlaybackError("");
    try {
      await stopping;
      const error = await resumed;
      if (generation !== playbackGenerationRef.current) return;
      if (error) throw error;
      const playable = backend ? await backend.prepare(clip.src) : await getPlayableSrc(clip.src);
      if (generation !== playbackGenerationRef.current) return;
      setActivePlayback({ type: "clip", clipId: clip.id, clipName: clip.label,
        playerId: player?.id || clip.playerId || "", playerName: player?.name || clip.playerName || "",
        relatedPlayerIds: Array.isArray(clip.playerIds) ? clip.playerIds.filter(Boolean)
          : player?.id || clip.playerId ? [player?.id || clip.playerId] : [] });
      if (backend) {
        const voice = backend.play(playable, () => retireVoice(voice, generation));
        activeVoicesRef.current.push(voice);
        onClipPlayed?.(clip);
      } else {
        await startMedia(playable, clip, generation);
      }
    } catch (error) { reportFailure(error, generation); }
  };

  const playSequence = async (player) => {
    const backend = getMobileBackend();
    const resumed = resumeMobile(backend);
    const stopping = fadeOutAndStopAll();
    const generation = playbackGenerationRef.current;
    setPlaybackError("");
    const sequence = player.sequence.filter((event) => event.clip?.src);
    try {
      await stopping;
      const error = await resumed;
      if (generation !== playbackGenerationRef.current) return;
      if (error) throw error;
      // Mobile playback fetches full cached files, never re-downloads the library
      // or attempts a new media-element play from a delayed timer.
      const prepared = backend
        ? await Promise.all(sequence.map((event) => backend.prepare(event.clip.src)))
        : await Promise.all(sequence.map((event) => getPlayableSrc(event.clip.src)));
      if (generation !== playbackGenerationRef.current || !sequence.length) return;
      setActivePlayback({ type: "sequence", playerId: player.id, playerName: player.name,
        clipId: "", clipName: "" });
      const startTime = backend ? backend.currentTime + 0.025 : 0;
      sequence.forEach((event, index) => {
        const delay = Math.max(0, Number.isFinite(event.startMs) ? event.startMs : 0);
        if (backend) {
          const voice = backend.play(prepared[index], () => retireVoice(voice, generation), startTime + delay / 1000);
          activeVoicesRef.current.push(voice);
        }
        const timeout = window.setTimeout(async () => {
          if (generation !== playbackGenerationRef.current) return;
          setActivePlayback({ type: "sequence", playerId: player.id, playerName: player.name,
            clipId: event.clip.id, clipName: event.clip.label });
          try {
            if (backend) onClipPlayed?.(event.clip);
            else await startMedia(prepared[index], event.clip, generation);
          } catch (error) { reportFailure(error, generation); }
        }, delay + (backend ? 25 : 0));
        sequenceTimeoutsRef.current.push(timeout);
      });
    } catch (error) { reportFailure(error, generation); }
  };

  const resetEngine = async () => {
    preloadGenerationRef.current += 1;
    await fadeOutAndStopAll({ fadeOut: false });
    mobileBackendRef.current?.reset();
    objectUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlCacheRef.current.clear();
    warmCacheRef.current.clear();
    setPlaybackError("");
    setAudioReadyState(EMPTY_READY_STATE);
  };

  useEffect(() => () => {
    playbackGenerationRef.current += 1;
    preloadGenerationRef.current += 1;
    clearSequenceTimeouts();
    activeVoicesRef.current.forEach((voice) => voice.stop());
    activeVoicesRef.current = [];
    mobileBackendRef.current?.reset();
    objectUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlCacheRef.current.clear();
    warmCacheRef.current.clear();
  }, []);

  return useMemo(() => ({ activePlayback, audioReadyState, playbackError, primeSources,
    resetEngine, playClipNow, playSequence, fadeOutAndStopAll }),
  [activePlayback, audioReadyState, playbackError]);
}
