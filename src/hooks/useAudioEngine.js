import { useEffect, useRef, useState } from "react";
import { MIN_WALKUP_TRIM_MS, WALKUP_TRIM_MS } from "../lib/storage";
import { recordDiagnosticEvent } from "../lib/diagnostics";

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Playback cancelled", "AbortError"));
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
    };

    if (signal?.aborted) {
      cleanup();
      reject(new DOMException("Playback cancelled", "AbortError"));
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

const WALKUP_SONG_FADE_OUT_MS = 1800;
const MIN_STOP_FADE_MS = 750;

function getTargetPlaybackLevel(baseVolume, item = null) {
  const multiplier = Math.max(0, Number(item?.volumeMultiplier) || 1);
  return Math.max(0, Math.min(1.4, Number(baseVolume) * multiplier));
}

function createAudioElement(volume) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.loop = false;
  audio.playsInline = true;
  audio.volume = volume;
  return audio;
}

function getPlaybackLevel(audio) {
  if (audio?._gainNode) {
    return audio._gainNode.gain.value;
  }

  return Math.max(0, Number(audio?.volume) || 0);
}

function setPlaybackLevel(audio, value) {
  const nextValue = Math.max(0, Number(value) || 0);

  if (audio?._gainNode) {
    audio._gainNode.gain.value = nextValue;
  }

  if (audio) {
    audio.volume = nextValue;
  }
}

async function attachAudioGainNode(audio, initialVolume) {
  // iPhone Safari proved more reliable when walk-up songs stayed on the
  // native HTMLAudioElement path instead of spinning up a new AudioContext
  // for each song start.
  setPlaybackLevel(audio, initialVolume);
}

async function disposeAudioNodes(audio) {
  if (!audio) {
    return;
  }

  try {
    audio._sourceNode?.disconnect?.();
  } catch {}

  try {
    audio._gainNode?.disconnect?.();
  } catch {}

  if (audio._audioContext) {
    await audio._audioContext.close().catch(() => {});
  }

  delete audio._sourceNode;
  delete audio._gainNode;
  delete audio._audioContext;
}

async function destroyAudioElement(audio) {
  if (!audio) {
    return;
  }

  try {
    audio.pause();
  } catch {}

  try {
    audio.currentTime = 0;
  } catch {}

  try {
    audio.removeAttribute("src");
    audio.load();
  } catch {}

  await disposeAudioNodes(audio);
}

async function fadeOutAndStop(audio, signal, durationMs = MIN_STOP_FADE_MS) {
  if (!audio || !audio.src) {
    return;
  }

  const startVolume = getPlaybackLevel(audio);
  const fadeStart = performance.now();
  const fadeDuration = Math.max(40, durationMs);

  await new Promise((resolve) => {
    const tick = (now) => {
      if (signal?.aborted) {
        resolve();
        return;
      }

      const progress = Math.min(1, (now - fadeStart) / fadeDuration);
      setPlaybackLevel(audio, startVolume * (1 - progress));

      if (progress >= 1) {
        resolve();
        return;
      }

      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  });

  setPlaybackLevel(audio, 0);
  audio.pause();
  await wait(30, signal).catch(() => {});
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();
  await disposeAudioNodes(audio);
}

async function fadeVolume(audio, signal, fromVolume, toVolume, durationMs) {
  if (!audio || durationMs <= 0) {
    setPlaybackLevel(audio, toVolume);
    return;
  }

  const steps = 8;
  for (let index = 1; index <= steps; index += 1) {
    if (signal?.aborted) {
      return;
    }

    const progress = index / steps;
    setPlaybackLevel(audio, fromVolume + (toVolume - fromVolume) * progress);
    await wait(durationMs / steps, signal).catch(() => {});
  }
}

function clearTimer(timerId) {
  if (timerId) {
    window.clearTimeout(timerId);
  }
}

function isMobileSafari() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const isiPhoneOrIPad = /iPhone|iPad|iPod/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome/i.test(userAgent);
  return isiPhoneOrIPad && isSafari;
}

function disconnectNode(node) {
  try {
    node?.disconnect?.();
  } catch {}
}

function stopBufferSource(sourceNode) {
  try {
    sourceNode?.stop?.();
  } catch {}
}

function getEntryPlaybackLevel(entry) {
  if (!entry) {
    return 0;
  }

  if (entry.kind === "buffer") {
    return Math.max(0, Number(entry.gainNode?.gain?.value) || 0);
  }

  return getPlaybackLevel(entry.audio);
}

function setEntryPlaybackLevel(entry, value) {
  if (!entry) {
    return;
  }

  const nextValue = Math.max(0, Number(value) || 0);

  if (entry.kind === "buffer") {
    if (entry.gainNode?.gain) {
      entry.gainNode.gain.value = nextValue;
    }
    return;
  }

  setPlaybackLevel(entry.audio, nextValue);
}

function getEntryCurrentTimeMs(entry) {
  if (!entry) {
    return 0;
  }

  if (entry.kind === "buffer") {
    if (!entry.context || !Number.isFinite(entry.startedAtContextTime)) {
      return Math.max(0, Number(entry.seekMs) || 0);
    }

    const elapsedMs = Math.max(0, (entry.context.currentTime - entry.startedAtContextTime) * 1000);
    return Math.max(0, (Number(entry.seekMs) || 0) + elapsedMs);
  }

  return Math.max(0, Math.round((entry.audio?.currentTime || 0) * 1000));
}

async function destroyBufferEntry(entry) {
  if (!entry) {
    return;
  }

  stopBufferSource(entry.sourceNode);
  disconnectNode(entry.sourceNode);
  disconnectNode(entry.gainNode);
}

async function fadeOutAndStopEntry(entry, signal, durationMs = MIN_STOP_FADE_MS) {
  if (!entry) {
    return;
  }

  if (entry.kind === "buffer") {
    const startVolume = getEntryPlaybackLevel(entry);
    const fadeStart = performance.now();
    const fadeDuration = Math.max(40, durationMs);

    await new Promise((resolve) => {
      const tick = (now) => {
        if (signal?.aborted) {
          resolve();
          return;
        }

        const progress = Math.min(1, (now - fadeStart) / fadeDuration);
        setEntryPlaybackLevel(entry, startVolume * (1 - progress));

        if (progress >= 1) {
          resolve();
          return;
        }

        window.requestAnimationFrame(tick);
      };

      window.requestAnimationFrame(tick);
    });

    setEntryPlaybackLevel(entry, 0);
    await destroyBufferEntry(entry);
    return;
  }

  await fadeOutAndStop(entry.audio, signal, durationMs);
}

function waitForAudioReady(audio, signal, timeoutMs = 1500) {
  if (!audio) {
    return Promise.resolve("missing-audio");
  }

  if (audio.readyState >= 1) {
    return Promise.resolve("ready");
  }

  return new Promise((resolve, reject) => {
    let timeoutId = null;

    const handleReady = () => {
      cleanup();
      resolve("ready");
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Audio failed to load."));
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Playback cancelled", "AbortError"));
    };

    const handleTimeout = () => {
      cleanup();
      resolve("timeout");
    };

    const cleanup = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      audio.removeEventListener("loadedmetadata", handleReady);
      audio.removeEventListener("canplay", handleReady);
      audio.removeEventListener("loadeddata", handleReady);
      audio.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    audio.addEventListener("loadedmetadata", handleReady, { once: true });
    audio.addEventListener("canplay", handleReady, { once: true });
    audio.addEventListener("loadeddata", handleReady, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
    timeoutId = window.setTimeout(handleTimeout, Math.max(250, timeoutMs));
  });
}

async function seekAudio(audio, timeSeconds) {
  if (!audio || !Number.isFinite(timeSeconds) || timeSeconds <= 0) {
    return;
  }

  if (Math.abs((audio.currentTime || 0) - timeSeconds) < 0.01) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      audio.removeEventListener("seeked", handleSettled);
      audio.removeEventListener("timeupdate", handleSettled);
      audio.removeEventListener("error", handleSettled);
    };

    const handleSettled = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };

    audio.addEventListener("seeked", handleSettled, { once: true });
    audio.addEventListener("timeupdate", handleSettled, { once: true });
    audio.addEventListener("error", handleSettled, { once: true });

    try {
      audio.currentTime = timeSeconds;
    } catch {
      handleSettled();
      return;
    }

    window.setTimeout(handleSettled, 250);
  });
}

export function useAudioEngine({ volume, fadeMs }) {
  const sessionRef = useRef(null);
  const progressFrameRef = useRef(null);
  const requestIdRef = useRef(0);
  const preloadRequestIdRef = useRef(0);
  const songAudioContextRef = useRef(null);
  const songBufferCacheRef = useRef(new Map());
  const useScheduledMobileSongs = isMobileSafari();
  const [activePlayback, setActivePlayback] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const [playbackTotalMs, setPlaybackTotalMs] = useState(0);
  const [songPreloadStatus, setSongPreloadStatus] = useState({
    total: 0,
    loaded: 0,
    ready: !useScheduledMobileSongs,
    needsGesture: useScheduledMobileSongs,
  });
  const stopFadeMs = Math.max(MIN_STOP_FADE_MS, Number(fadeMs) || 0);

  const getSongAudioContext = async () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!songAudioContextRef.current || songAudioContextRef.current.state === "closed") {
      songAudioContextRef.current = new AudioContextCtor();
    }

    if (songAudioContextRef.current.state === "suspended") {
      await songAudioContextRef.current.resume().catch(() => {});
    }

    return songAudioContextRef.current;
  };

  const getDecodedSongBuffer = async (src) => {
    if (!src) {
      throw new Error("Missing audio source.");
    }

    const cached = songBufferCacheRef.current.get(src);
    if (cached) {
      return cached;
    }

    const loadPromise = (async () => {
      const context = await getSongAudioContext();
      if (!context) {
        throw new Error("Web Audio unavailable.");
      }

      const response = await fetch(src, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Unable to fetch audio source: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      return context.decodeAudioData(buffer.slice(0));
    })();

    songBufferCacheRef.current.set(src, loadPromise);

    try {
      return await loadPromise;
    } catch (error) {
      songBufferCacheRef.current.delete(src);
      throw error;
    }
  };

  const primeSongSources = async (sources = [], options = {}) => {
    const { userInitiated = false } = options;

    if (!useScheduledMobileSongs) {
      setSongPreloadStatus({
        total: 0,
        loaded: 0,
        ready: true,
        needsGesture: false,
      });
      return;
    }

    const uniqueSources = [...new Set(sources.filter(Boolean))];
    const requestId = ++preloadRequestIdRef.current;

    if (!uniqueSources.length) {
      setSongPreloadStatus({
        total: 0,
        loaded: 0,
        ready: true,
        needsGesture: false,
      });
      return;
    }

    if (!userInitiated && !songAudioContextRef.current) {
      setSongPreloadStatus({
        total: uniqueSources.length,
        loaded: 0,
        ready: false,
        needsGesture: true,
      });
      return;
    }

    setSongPreloadStatus({
      total: uniqueSources.length,
      loaded: 0,
      ready: false,
      needsGesture: false,
    });

    let settledCount = 0;

    await Promise.allSettled(
      uniqueSources.map(async (src) => {
        try {
          await getDecodedSongBuffer(src);
        } finally {
          settledCount += 1;
          if (requestId === preloadRequestIdRef.current) {
            setSongPreloadStatus({
              total: uniqueSources.length,
              loaded: settledCount,
              ready: settledCount >= uniqueSources.length,
              needsGesture: false,
            });
          }
        }
      }),
    );
  };

  const stopProgressLoop = () => {
    if (progressFrameRef.current) {
      window.cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
  };

  const resetUiState = () => {
    stopProgressLoop();
    setActivePlayback(null);
    setIsPaused(false);
    setPlaybackProgress(0);
    setPlaybackTimeMs(0);
    setPlaybackTotalMs(0);
  };

  const teardownSession = async (session, fadeOut = true) => {
    if (!session) {
      return;
    }

    recordDiagnosticEvent("audio.session.teardown", {
      sessionId: session.id,
      fadeOut,
      activeEntryCount: session.activeEntries.size,
      pendingCount: session.pendingStarts.length,
    });

    session.pendingStarts.forEach((entry) => clearTimer(entry.timeoutId));
    session.pendingStarts = [];

    const stopController = new AbortController();
    const activeEntries = [...session.activeEntries.values()];

    activeEntries.forEach((entry) => {
      clearTimer(entry.endTimeoutId);
      clearTimer(entry.fadeTimeoutId);
      clearTimer(entry.audibleTimeoutId);
      if (entry.kind === "buffer") {
        entry.sourceNode.onended = null;
      } else {
        entry.audio.onended = null;
        entry.audio.onerror = null;
      }
    });

    await Promise.all(
      activeEntries.map((entry) =>
        fadeOut ? fadeOutAndStopEntry(entry, stopController.signal, stopFadeMs) : Promise.resolve().then(() => {
          if (entry.kind === "buffer") {
            return destroyBufferEntry(entry);
          }

          entry.audio.pause();
          entry.audio.currentTime = 0;
          entry.audio.removeAttribute("src");
          entry.audio.load();
          return disposeAudioNodes(entry.audio);
        }),
      ),
    );

    session.activeEntries.clear();
  };

  const stopAll = async (fadeOut = true) => {
    const session = sessionRef.current;
    if (session) {
      recordDiagnosticEvent("audio.stop_all", {
        sessionId: session.id,
        fadeOut,
        activeEntryCount: session.activeEntries.size,
      });
      session.controller.abort();
      sessionRef.current = null;
      if (!session.resolved) {
        session.resolved = true;
        session.reject?.(new DOMException("Playback cancelled", "AbortError"));
      }
      await teardownSession(session, fadeOut);
    }

    resetUiState();
  };

  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (!session) {
        if (songAudioContextRef.current?.state && songAudioContextRef.current.state !== "closed") {
          songAudioContextRef.current.close().catch(() => {});
        }
        return;
      }

      session.controller.abort();
      if (!session.resolved) {
        session.resolved = true;
        session.reject?.(new DOMException("Playback cancelled", "AbortError"));
      }
      teardownSession(session, false);
      if (songAudioContextRef.current?.state && songAudioContextRef.current.state !== "closed") {
        songAudioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const startProgressLoop = (session) => {
    stopProgressLoop();

    const tick = () => {
      if (!sessionRef.current || sessionRef.current.id !== session.id || session.paused) {
        return;
      }

      const elapsedMs = performance.now() - session.anchorMs;
      const nextProgress =
        session.totalDurationMs > 0 ? Math.max(0, Math.min(1, elapsedMs / session.totalDurationMs)) : 0;
      setPlaybackTimeMs(Math.max(0, Math.min(session.totalDurationMs, elapsedMs)));
      setPlaybackProgress(nextProgress);

      if (nextProgress < 1) {
        progressFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    progressFrameRef.current = window.requestAnimationFrame(tick);
  };

  const finishSessionIfComplete = (session) => {
    if (session.completedItemIds.size < session.items.length) {
      return;
    }

    if (session.resolved) {
      return;
    }

    session.resolved = true;
    sessionRef.current = null;
    recordDiagnosticEvent("audio.session.completed", {
      sessionId: session.id,
      itemCount: session.items.length,
    });
    resetUiState();
    session.resolve();
  };

  const markItemComplete = (session, itemId) => {
    if (session.completedItemIds.has(itemId)) {
      return;
    }

    session.completedItemIds.add(itemId);
    recordDiagnosticEvent("audio.item.completed", {
      sessionId: session.id,
      itemId,
      completedCount: session.completedItemIds.size,
      totalCount: session.items.length,
    });
    finishSessionIfComplete(session);
  };

  const scheduleEntryTimeouts = (session, entry) => {
    const trimStartMs = Math.max(0, Number(entry.item.trimStartMs) || 0);
    const trimEndMs = Math.max(
      trimStartMs + MIN_WALKUP_TRIM_MS,
      Number(entry.item.trimEndMs) || (trimStartMs + entry.item.durationMs),
    );

    clearTimer(entry.endTimeoutId);
    clearTimer(entry.fadeTimeoutId);
    clearTimer(entry.audibleTimeoutId);

    if (entry.item.slot === "song") {
      const fadeStartMs = Math.min(
        trimEndMs,
        Math.max(trimStartMs, Number(entry.item.fadeOutStartMs) || Math.max(trimStartMs, trimEndMs - WALKUP_SONG_FADE_OUT_MS)),
      );
      const fadeEndMs = Math.min(
        trimEndMs,
        Math.max(fadeStartMs, Number(entry.item.fadeOutEndMs) || trimEndMs),
      );
      const fadeReferenceMs = Math.max(trimStartMs, getEntryCurrentTimeMs(entry));
      const fadeDelayMs = Math.max(0, fadeStartMs - fadeReferenceMs);
      const fadeDurationMs = Math.max(0, fadeEndMs - Math.max(fadeReferenceMs, fadeStartMs));

      entry.fadeTimeoutId = window.setTimeout(async () => {
        if (!session.activeEntries.has(entry.item.id) || session.controller.signal.aborted) {
          return;
        }

        recordDiagnosticEvent("audio.song.fadeout.start", {
          sessionId: session.id,
          itemId: entry.item.id,
          playerName: entry.item.playerName || "",
          songName: entry.item.nickname || "",
          fadeStartMs,
          fadeEndMs,
        });
        await fadeOutAndStopEntry(entry, session.controller.signal, fadeDurationMs || Math.max(0, trimEndMs - fadeStartMs) || MIN_STOP_FADE_MS).catch(() => {});
        session.activeEntries.delete(entry.item.id);
        markItemComplete(session, entry.item.id);
      }, fadeDelayMs);

      const trimEndReferenceMs = Math.max(trimStartMs, getEntryCurrentTimeMs(entry));
      const trimEndDelayMs = Math.max(0, trimEndMs - trimEndReferenceMs);
      entry.endTimeoutId = window.setTimeout(async () => {
        if (!session.activeEntries.has(entry.item.id) || session.controller.signal.aborted) {
          return;
        }

        recordDiagnosticEvent("audio.song.trim_end.stop", {
          sessionId: session.id,
          itemId: entry.item.id,
          playerName: entry.item.playerName || "",
          songName: entry.item.nickname || "",
          trimEndMs,
        });

        await fadeOutAndStopEntry(entry, session.controller.signal, Math.max(80, Math.min(220, stopFadeMs))).catch(() => {});
        session.activeEntries.delete(entry.item.id);
        markItemComplete(session, entry.item.id);
      }, trimEndDelayMs + 60);
      return;
    }
  };

  const finalizeEntry = (entry, session) => {
    clearTimer(entry.endTimeoutId);
    clearTimer(entry.fadeTimeoutId);
    clearTimer(entry.audibleTimeoutId);
    if (entry.kind === "buffer") {
      entry.sourceNode.onended = null;
    } else {
      entry.audio.onended = null;
      entry.audio.onerror = null;
    }
    session.activeEntries.delete(entry.item.id);
    recordDiagnosticEvent("audio.item.finalized", {
      sessionId: session.id,
      itemId: entry.item.id,
      slot: entry.item.slot,
      playerName: entry.item.playerName || "",
      clipName: entry.item.nickname || "",
    });
    markItemComplete(session, entry.item.id);
  };

  const startItemPlayback = async (session, item, seekMs = 0) => {
    if (session.controller.signal.aborted || session.paused) {
      return;
    }

    recordDiagnosticEvent("audio.item.starting", {
      sessionId: session.id,
      itemId: item.id,
      slot: item.slot,
      playerName: item.playerName || "",
      clipName: item.nickname || "",
      startMs: item.startMs,
      seekMs,
      trimStartMs: item.trimStartMs ?? null,
      trimEndMs: item.trimEndMs ?? null,
    });

    if (item.slot === "song" && useScheduledMobileSongs) {
      try {
        const context = await getSongAudioContext();
        const audioBuffer = await getDecodedSongBuffer(item.dataUrl ?? item.src);

        if (!context || session.controller.signal.aborted || session.paused) {
          return;
        }

        const seekOffsetMs = Math.max(0, Number(seekMs) || 0);
        const playStartDelayMs = Math.max(0, item.startMs - session.offsetMs);
        const clipDurationMs = Math.max(
          MIN_WALKUP_TRIM_MS,
          Math.min(
            Number(item.durationMs) || MIN_WALKUP_TRIM_MS,
            Math.max(0, Math.round(audioBuffer.duration * 1000) - seekOffsetMs),
          ),
        );
        const sourceNode = context.createBufferSource();
        const gainNode = context.createGain();
        const targetVolume = getTargetPlaybackLevel(volume, item);
        sourceNode.buffer = audioBuffer;
        gainNode.gain.value = targetVolume;
        sourceNode.connect(gainNode);
        gainNode.connect(context.destination);

        const startAtContextTime = context.currentTime + playStartDelayMs / 1000;
        sourceNode.start(startAtContextTime, seekOffsetMs / 1000, clipDurationMs / 1000);

        const entry = {
          kind: "buffer",
          item,
          context,
          sourceNode,
          gainNode,
          endTimeoutId: null,
          fadeTimeoutId: null,
          audibleTimeoutId: null,
          seekMs: seekOffsetMs,
          startedAtContextTime: startAtContextTime,
        };

        session.activeEntries.set(item.id, entry);
        session.startedItemIds.add(item.id);
        sourceNode.onended = () => finalizeEntry(entry, session);

        recordDiagnosticEvent("audio.item.ready", {
          sessionId: session.id,
          itemId: item.id,
          slot: item.slot,
          playerName: item.playerName || "",
          clipName: item.nickname || "",
          readiness: "buffered",
          readyState: 4,
          networkState: 1,
          attempt: "scheduled",
          preRollMs: 0,
        });

        entry.audibleTimeoutId = window.setTimeout(() => {
          if (!session.activeEntries.has(item.id) || session.controller.signal.aborted) {
            return;
          }

          setActivePlayback({
            ...session.descriptor,
            playerId: item.playerId ?? session.descriptor.playerId,
            playerName: item.playerName ?? session.descriptor.playerName,
            assetId: item.id,
            assetLabel: item.nickname,
            track: item.track,
          });

          recordDiagnosticEvent("audio.item.playing", {
            sessionId: session.id,
            itemId: item.id,
            slot: item.slot,
            playerName: item.playerName || "",
            clipName: item.nickname || "",
            currentTimeMs: seekOffsetMs,
            attempt: "scheduled",
            preRollMs: 0,
          });
        }, playStartDelayMs);

        scheduleEntryTimeouts(session, entry);
        return;
      } catch (error) {
        recordDiagnosticEvent("audio.item.play_failed", {
          sessionId: session.id,
          itemId: item.id,
          slot: item.slot,
          playerName: item.playerName || "",
          clipName: item.nickname || "",
          src: item.src || "",
          attempt: "scheduled",
          reason: error instanceof Error ? error.message : String(error || ""),
        });
        markItemComplete(session, item.id);
        return;
      }
    }

    const createConfiguredAudio = async () => {
      const targetVolume = Math.min(1, getTargetPlaybackLevel(volume, item));
      const nextAudio = createAudioElement(targetVolume);
      nextAudio.src = item.dataUrl ?? item.src;
      nextAudio.load();
      if (item.slot === "song") {
        await attachAudioGainNode(nextAudio, fadeMs > 0 ? 0 : targetVolume);
      } else {
        setPlaybackLevel(nextAudio, fadeMs > 0 ? 0 : targetVolume);
      }
      return nextAudio;
    };

    const audio = await createConfiguredAudio();

    const entry = {
      item,
      kind: "element",
      audio,
      endTimeoutId: null,
      fadeTimeoutId: null,
      audibleTimeoutId: null,
    };

    session.activeEntries.set(item.id, entry);
    session.startedItemIds.add(item.id);
    setActivePlayback({
      ...session.descriptor,
      playerId: item.playerId ?? session.descriptor.playerId,
      playerName: item.playerName ?? session.descriptor.playerName,
      assetId: item.id,
      assetLabel: item.nickname,
      track: item.track,
    });

    const bindEntryAudioHandlers = () => {
      entry.audio.onended = () => finalizeEntry(entry, session);
      entry.audio.onerror = () => finalizeEntry(entry, session);
    };

    bindEntryAudioHandlers();

    const attemptPlayback = async (attempt = "initial") => {
      const activeAudio = entry.audio;
      const trimStartMs = Math.max(0, Number(item.trimStartMs) || 0);
      const seekSeconds = Math.max(0, (trimStartMs + seekMs) / 1000);
      const readiness = await waitForAudioReady(activeAudio, session.controller.signal);
      recordDiagnosticEvent("audio.item.ready", {
        sessionId: session.id,
        itemId: item.id,
        slot: item.slot,
        playerName: item.playerName || "",
        clipName: item.nickname || "",
        readiness,
        readyState: activeAudio.readyState,
        networkState: activeAudio.networkState,
        attempt,
        preRollMs: 0,
      });
      if (seekSeconds > 0) {
        await seekAudio(activeAudio, seekSeconds);
      }
      await activeAudio.play();
      recordDiagnosticEvent("audio.item.playing", {
        sessionId: session.id,
        itemId: item.id,
        slot: item.slot,
        playerName: item.playerName || "",
        clipName: item.nickname || "",
        currentTimeMs: Math.round((activeAudio.currentTime || 0) * 1000),
        attempt,
        preRollMs: 0,
      });
    };

    try {
      await attemptPlayback("initial");
    } catch (error) {
      if (item.slot === "song" && !session.controller.signal.aborted) {
        recordDiagnosticEvent("audio.item.retrying", {
          sessionId: session.id,
          itemId: item.id,
          slot: item.slot,
          playerName: item.playerName || "",
          clipName: item.nickname || "",
          src: item.src || "",
          reason: error instanceof Error ? error.message : String(error || ""),
        });

        entry.audio.onended = null;
        entry.audio.onerror = null;
        await destroyAudioElement(entry.audio);

        try {
          entry.audio = await createConfiguredAudio();
          bindEntryAudioHandlers();
          await attemptPlayback("retry");
        } catch (retryError) {
          recordDiagnosticEvent("audio.item.play_failed", {
            sessionId: session.id,
            itemId: item.id,
            slot: item.slot,
            playerName: item.playerName || "",
            clipName: item.nickname || "",
            src: item.src || "",
            attempt: "retry",
            reason: retryError instanceof Error ? retryError.message : String(retryError || ""),
          });
          finalizeEntry(entry, session);
          return;
        }
      } else {
        recordDiagnosticEvent("audio.item.play_failed", {
          sessionId: session.id,
          itemId: item.id,
          slot: item.slot,
          playerName: item.playerName || "",
          clipName: item.nickname || "",
          src: item.src || "",
          attempt: "initial",
          reason: error instanceof Error ? error.message : String(error || ""),
        });
        finalizeEntry(entry, session);
        return;
      }
    }

    if (item.slot === "song") {
      const targetVolume = Math.min(1, getTargetPlaybackLevel(volume, item));
      const trimStartMs = Math.max(0, Number(item.trimStartMs) || 0);
      const trimEndMs = Math.max(
        trimStartMs + MIN_WALKUP_TRIM_MS,
        Number(item.trimEndMs) || (trimStartMs + item.durationMs),
      );
      const fadeInEndMs = Math.min(
        trimEndMs,
        Math.max(trimStartMs, Number(item.fadeInEndMs) || Math.min(trimEndMs, trimStartMs + 800)),
      );
      const currentPositionMs = Math.max(trimStartMs, audio.currentTime * 1000);

      if (fadeInEndMs > trimStartMs && currentPositionMs < fadeInEndMs) {
        const fadeInDurationMs = Math.max(0, fadeInEndMs - currentPositionMs);
        const startingVolume =
          fadeInEndMs === trimStartMs
            ? targetVolume
            : targetVolume * ((currentPositionMs - trimStartMs) / Math.max(1, fadeInEndMs - trimStartMs));

        setPlaybackLevel(audio, Math.max(0, Math.min(targetVolume, startingVolume)));
        await fadeVolume(audio, session.controller.signal, getPlaybackLevel(audio), targetVolume, fadeInDurationMs);
      } else {
        setPlaybackLevel(audio, targetVolume);
      }
    } else if (fadeMs > 0) {
      const targetVolume = Math.min(1, getTargetPlaybackLevel(volume, item));
      const steps = 8;
      for (let index = 1; index <= steps; index += 1) {
        if (session.controller.signal.aborted || session.paused) {
          return;
        }

        setPlaybackLevel(audio, targetVolume * (index / steps));
        await wait(fadeMs / steps, session.controller.signal).catch(() => {});
      }
    } else {
      setPlaybackLevel(audio, Math.min(1, getTargetPlaybackLevel(volume, item)));
    }

    scheduleEntryTimeouts(session, entry);
  };

  const schedulePendingStarts = (session) => {
    session.pendingStarts.forEach((entry) => clearTimer(entry.timeoutId));

    session.pendingStarts = session.pendingStarts.map((entry) => {
      if (session.startedItemIds.has(entry.item.id)) {
        return entry;
      }

      const remainingMs = Math.max(0, entry.item.startMs - session.offsetMs);
      const timeoutId = window.setTimeout(() => {
        startItemPlayback(session, entry.item, entry.seekMs);
      }, remainingMs);

      return {
        ...entry,
        remainingMs,
        timeoutId,
      };
    });
  };

  const playSequence = async ({
    items,
    descriptor,
    startOffsetMs = 0,
    interruptFadeOut = true,
  }) => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    recordDiagnosticEvent("audio.sequence.requested", {
      requestId,
      descriptor,
      itemCount: items.length,
      startOffsetMs,
      interruptFadeOut,
    });

    await stopAll(interruptFadeOut);

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (!items.length) {
      return;
    }

    const normalizedItems = [...items]
      .map((item, index) => ({
        ...item,
        id: item.timelineItemId ?? item.id ?? `${descriptor.playerId || "clip"}-${index}`,
        startMs: Math.max(0, Number(item.startMs) || 0),
        durationMs:
          Number.isFinite(item.durationMs) && item.durationMs > 0
            ? item.durationMs
            : item.slot === "song"
            ? Math.max(
                  MIN_WALKUP_TRIM_MS,
                  (Number(item.trimEndMs) || ((Number(item.trimStartMs) || 0) + WALKUP_TRIM_MS)) -
                    (Number(item.trimStartMs) || 0),
                )
              : Math.max(400, Math.round((item.duration || 1.2) * 1000)),
      }))
      .sort((left, right) => left.startMs - right.startMs);

    const filteredItems = normalizedItems.filter(
      (item) => item.startMs + item.durationMs > startOffsetMs,
    );

    const totalDurationMs = normalizedItems.reduce(
      (maxValue, item) => Math.max(maxValue, item.startMs + item.durationMs),
      0,
    );

    const session = {
      id: crypto.randomUUID(),
      controller: new AbortController(),
      descriptor,
      items: filteredItems,
      totalDurationMs,
      offsetMs: Math.max(0, startOffsetMs),
      anchorMs: performance.now() - Math.max(0, startOffsetMs),
      paused: false,
      pendingStarts: filteredItems.map((item) => ({
        item,
        seekMs: Math.max(0, startOffsetMs - item.startMs),
        remainingMs: Math.max(0, item.startMs - startOffsetMs),
        timeoutId: null,
      })),
      activeEntries: new Map(),
      startedItemIds: new Set(),
      completedItemIds: new Set(
        normalizedItems
          .filter((item) => item.startMs + item.durationMs <= startOffsetMs)
          .map((item) => item.id),
      ),
      resolved: false,
      resolve: null,
      reject: null,
    };

    recordDiagnosticEvent("audio.session.created", {
      sessionId: session.id,
      requestId,
      descriptor,
      itemCount: filteredItems.length,
      totalDurationMs,
      songItems: filteredItems
        .filter((item) => item.slot === "song")
        .map((item) => ({
          itemId: item.id,
          playerName: item.playerName || "",
          clipName: item.nickname || "",
          startMs: item.startMs,
          trimStartMs: item.trimStartMs ?? null,
          trimEndMs: item.trimEndMs ?? null,
        })),
    });

    setActivePlayback(descriptor);
    setPlaybackTotalMs(totalDurationMs);
    setPlaybackTimeMs(Math.max(0, startOffsetMs));
    setPlaybackProgress(totalDurationMs > 0 ? Math.max(0, Math.min(1, startOffsetMs / totalDurationMs)) : 0);
    sessionRef.current = session;
    startProgressLoop(session);

    const scheduledSongStarts = session.pendingStarts.filter(
      (entry) => useScheduledMobileSongs && entry.item.slot === "song",
    );

    for (const entry of scheduledSongStarts) {
      await startItemPlayback(session, entry.item, entry.seekMs);
    }

    schedulePendingStarts(session);

    return new Promise((resolve, reject) => {
      session.resolve = resolve;
      session.reject = reject;
    });
  };

  const togglePause = async () => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    if ([...session.activeEntries.values()].some((entry) => entry.kind === "buffer")) {
      await stopAll(true);
      return;
    }

    if (session.paused) {
      recordDiagnosticEvent("audio.resume", {
        sessionId: session.id,
      });
      session.paused = false;
      session.anchorMs = performance.now() - session.offsetMs;

      session.activeEntries.forEach((entry) => {
        entry.audio.play().catch(() => null);
        scheduleEntryTimeouts(session, entry);
      });

      schedulePendingStarts(session);
      startProgressLoop(session);
      setIsPaused(false);
      return;
    }

    session.offsetMs = performance.now() - session.anchorMs;
    session.paused = true;
    recordDiagnosticEvent("audio.pause", {
      sessionId: session.id,
      offsetMs: Math.round(session.offsetMs),
    });
    stopProgressLoop();

    session.pendingStarts.forEach((entry) => {
      if (session.startedItemIds.has(entry.item.id)) {
        return;
      }

      clearTimer(entry.timeoutId);
      entry.remainingMs = Math.max(0, entry.item.startMs - session.offsetMs);
    });

    session.activeEntries.forEach((entry) => {
      clearTimer(entry.endTimeoutId);
      clearTimer(entry.fadeTimeoutId);
      clearTimer(entry.audibleTimeoutId);
      if (entry.kind !== "buffer") {
        entry.audio.pause();
      }
    });

    setIsPaused(true);
  };

  return {
    activePlayback,
    isPaused,
    playbackProgress,
    playbackTimeMs,
    playbackTotalMs,
    songPreloadStatus,
    playSequence,
    primeSongSources,
    stopAll,
    togglePause,
  };
}
