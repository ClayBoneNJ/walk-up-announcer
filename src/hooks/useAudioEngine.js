import { useEffect, useRef, useState } from "react";

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

const WALKUP_SONG_MAX_MS = 15000;
const WALKUP_SONG_FADE_OUT_MS = 800;
const STOP_FADE_MS = 140;

function createAudioElement(volume) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.loop = false;
  audio.volume = volume;
  return audio;
}

async function fadeOutAndStop(audio, signal, durationMs = STOP_FADE_MS) {
  if (!audio || !audio.src) {
    return;
  }

  const startVolume = audio.volume;
  const steps = 5;

  for (let index = steps - 1; index >= 0; index -= 1) {
    if (signal?.aborted) {
      break;
    }

    audio.volume = startVolume * (index / steps);
    await wait(durationMs / steps, signal).catch(() => {});
  }

  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();
}

function clearTimer(timerId) {
  if (timerId) {
    window.clearTimeout(timerId);
  }
}

export function useAudioEngine({ volume, fadeMs }) {
  const sessionRef = useRef(null);
  const progressFrameRef = useRef(null);
  const requestIdRef = useRef(0);
  const [activePlayback, setActivePlayback] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const [playbackTotalMs, setPlaybackTotalMs] = useState(0);

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

    session.pendingStarts.forEach((entry) => clearTimer(entry.timeoutId));
    session.pendingStarts = [];

    const stopController = new AbortController();
    const activeEntries = [...session.activeEntries.values()];

    activeEntries.forEach((entry) => {
      clearTimer(entry.endTimeoutId);
      clearTimer(entry.fadeTimeoutId);
      entry.audio.onended = null;
      entry.audio.onerror = null;
    });

    await Promise.all(
      activeEntries.map((entry) =>
        fadeOut ? fadeOutAndStop(entry.audio, stopController.signal) : Promise.resolve().then(() => {
          entry.audio.pause();
          entry.audio.currentTime = 0;
          entry.audio.removeAttribute("src");
          entry.audio.load();
        }),
      ),
    );

    session.activeEntries.clear();
  };

  const stopAll = async () => {
    const session = sessionRef.current;
    if (session) {
      session.controller.abort();
      sessionRef.current = null;
      if (!session.resolved) {
        session.resolved = true;
        session.reject?.(new DOMException("Playback cancelled", "AbortError"));
      }
      await teardownSession(session, true);
    }

    resetUiState();
  };

  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }

      session.controller.abort();
      if (!session.resolved) {
        session.resolved = true;
        session.reject?.(new DOMException("Playback cancelled", "AbortError"));
      }
      teardownSession(session, false);
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
    resetUiState();
    session.resolve();
  };

  const markItemComplete = (session, itemId) => {
    if (session.completedItemIds.has(itemId)) {
      return;
    }

    session.completedItemIds.add(itemId);
    finishSessionIfComplete(session);
  };

  const scheduleEntryTimeouts = (session, entry) => {
    const remainingMs = Math.max(0, entry.item.durationMs - entry.audio.currentTime * 1000);

    clearTimer(entry.endTimeoutId);
    clearTimer(entry.fadeTimeoutId);

    if (entry.item.slot === "song") {
      const fadeDelayMs = Math.max(0, remainingMs - WALKUP_SONG_FADE_OUT_MS);
      entry.fadeTimeoutId = window.setTimeout(async () => {
        await fadeOutAndStop(entry.audio, session.controller.signal, WALKUP_SONG_FADE_OUT_MS).catch(() => {});
        session.activeEntries.delete(entry.item.id);
        markItemComplete(session, entry.item.id);
      }, fadeDelayMs);
      return;
    }
  };

  const startItemPlayback = async (session, item, seekMs = 0) => {
    if (session.controller.signal.aborted || session.paused) {
      return;
    }

    const audio = createAudioElement(volume);
    audio.src = item.dataUrl ?? item.src;
    audio.volume = fadeMs > 0 ? 0 : volume;

    const entry = {
      item,
      audio,
      endTimeoutId: null,
      fadeTimeoutId: null,
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

    const finalize = () => {
      clearTimer(entry.endTimeoutId);
      clearTimer(entry.fadeTimeoutId);
      entry.audio.onended = null;
      entry.audio.onerror = null;
      session.activeEntries.delete(item.id);
      markItemComplete(session, item.id);
    };

    audio.onended = finalize;
    audio.onerror = finalize;

    try {
      const seekSeconds = Math.max(0, seekMs / 1000);
      if (seekSeconds > 0) {
        audio.currentTime = seekSeconds;
      }
      await audio.play();
    } catch {
      finalize();
      return;
    }

    if (fadeMs > 0) {
      const steps = 8;
      for (let index = 1; index <= steps; index += 1) {
        if (session.controller.signal.aborted || session.paused) {
          return;
        }

        audio.volume = volume * (index / steps);
        await wait(fadeMs / steps, session.controller.signal).catch(() => {});
      }
    } else {
      audio.volume = volume;
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

  const playSequence = async ({ items, descriptor, startOffsetMs = 0 }) => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    await stopAll();

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
              ? WALKUP_SONG_MAX_MS
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

    setActivePlayback(descriptor);
    setPlaybackTotalMs(totalDurationMs);
    setPlaybackTimeMs(Math.max(0, startOffsetMs));
    setPlaybackProgress(totalDurationMs > 0 ? Math.max(0, Math.min(1, startOffsetMs / totalDurationMs)) : 0);
    sessionRef.current = session;
    startProgressLoop(session);
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

    if (session.paused) {
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
      entry.audio.pause();
    });

    setIsPaused(true);
  };

  return {
    activePlayback,
    isPaused,
    playbackProgress,
    playbackTimeMs,
    playbackTotalMs,
    playSequence,
    stopAll,
    togglePause,
  };
}
