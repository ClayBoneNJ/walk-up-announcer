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

function createAudioElement(volume) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = volume;
  return audio;
}

const WALKUP_SONG_MAX_MS = 15000;
const WALKUP_SONG_FADE_OUT_MS = 800;

async function fadeOutAndStop(audio, signal, durationMs = 140) {
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

export function useAudioEngine({ volume, fadeMs }) {
  const primaryRef = useRef(null);
  const secondaryRef = useRef(null);
  const abortRef = useRef(null);
  const progressFrameRef = useRef(null);
  const [activePlayback, setActivePlayback] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);

  useEffect(() => {
    primaryRef.current = createAudioElement(volume);
    secondaryRef.current = createAudioElement(volume);

    return () => {
      primaryRef.current?.pause();
      secondaryRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (primaryRef.current) {
      primaryRef.current.volume = volume;
    }

    if (secondaryRef.current) {
      secondaryRef.current.volume = volume;
    }
  }, [volume]);

  const stopAll = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (progressFrameRef.current) {
      window.cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }

    const stopController = new AbortController();
    await Promise.all(
      [primaryRef.current, secondaryRef.current].map((audio) =>
        fadeOutAndStop(audio, stopController.signal),
      ),
    );

    setActivePlayback(null);
    setIsPaused(false);
    setPlaybackProgress(0);
  };

  const playAsset = async (audio, asset, signal, onProgress) => {
    audio.src = asset.dataUrl ?? asset.src;
    audio.loop = false;
    audio.currentTime = 0;
    audio.volume = 0;
    const maxPlaybackSeconds =
      asset.slot === "song" ? WALKUP_SONG_MAX_MS / 1000 : Number.POSITIVE_INFINITY;

    const playbackEnded = new Promise((resolve, reject) => {
      let clipEndTimeoutId = null;
      let clipFadeTimeoutId = null;
      let clipDuration = Math.min(
        audio.duration || asset.duration || maxPlaybackSeconds,
        maxPlaybackSeconds,
      );

      const handleEnded = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error(`Could not play ${asset.fileName}.`));
      };

      const handleAbort = () => {
        cleanup();
        reject(new DOMException("Playback cancelled", "AbortError"));
      };

      const updateProgress = () => {
        const nextDuration = Math.min(
          audio.duration || asset.duration || maxPlaybackSeconds,
          maxPlaybackSeconds,
        );
        clipDuration = nextDuration;
        const clipProgress = clipDuration > 0 ? audio.currentTime / clipDuration : 0;
        onProgress?.(Math.max(0, Math.min(1, clipProgress)));

        if (!audio.paused && !audio.ended) {
          progressFrameRef.current = window.requestAnimationFrame(updateProgress);
        }
      };

      const handleLoadedMetadata = () => {
        if (!Number.isFinite(maxPlaybackSeconds)) {
          if (progressFrameRef.current) {
            window.cancelAnimationFrame(progressFrameRef.current);
          }
          progressFrameRef.current = window.requestAnimationFrame(updateProgress);
          return;
        }

        const cappedDurationMs = Math.max(
          0,
          Math.min(audio.duration || maxPlaybackSeconds, maxPlaybackSeconds) * 1000,
        );

        window.clearTimeout(clipEndTimeoutId);
        window.clearTimeout(clipFadeTimeoutId);

        if (asset.slot === "song") {
          const fadeDelayMs = Math.max(0, cappedDurationMs - WALKUP_SONG_FADE_OUT_MS);

          clipFadeTimeoutId = window.setTimeout(async () => {
            await fadeOutAndStop(audio, signal, WALKUP_SONG_FADE_OUT_MS).catch(() => {});
            cleanup();
            resolve();
          }, fadeDelayMs);
        } else {
          clipEndTimeoutId = window.setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
            cleanup();
            resolve();
          }, cappedDurationMs);
        }

        if (progressFrameRef.current) {
          window.cancelAnimationFrame(progressFrameRef.current);
        }
        progressFrameRef.current = window.requestAnimationFrame(updateProgress);
      };

      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
        audio.onloadedmetadata = null;
        window.clearTimeout(clipEndTimeoutId);
        window.clearTimeout(clipFadeTimeoutId);
        if (progressFrameRef.current) {
          window.cancelAnimationFrame(progressFrameRef.current);
          progressFrameRef.current = null;
        }
        signal.removeEventListener("abort", handleAbort);
      };

      audio.onended = handleEnded;
      audio.onerror = handleError;
      audio.onloadedmetadata = handleLoadedMetadata;
      signal.addEventListener("abort", handleAbort, { once: true });
    });

    await audio.play();

    if (audio.readyState >= 1) {
      audio.onloadedmetadata?.();
    }

    if (fadeMs > 0) {
      const steps = 8;
      for (let index = 1; index <= steps; index += 1) {
        if (signal.aborted) {
          throw new DOMException("Playback cancelled", "AbortError");
        }

        audio.volume = volume * (index / steps);
        await wait(fadeMs / steps, signal);
      }
    } else {
      audio.volume = volume;
    }

    await playbackEnded;
  };

  const playSequence = async ({ items, descriptor }) => {
    await stopAll();

    if (!items.length) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setActivePlayback(descriptor);
    setPlaybackProgress(0);

    try {
      // Alternate between two audio elements so we can swap sources cleanly and
      // leave room for future crossfades without changing the public hook API.
      for (let index = 0; index < items.length; index += 1) {
        const asset = items[index];
        const activeAudio = index % 2 === 0 ? primaryRef.current : secondaryRef.current;
        const inactiveAudio = index % 2 === 0 ? secondaryRef.current : primaryRef.current;

        inactiveAudio.pause();
        inactiveAudio.currentTime = 0;
        inactiveAudio.removeAttribute("src");
        inactiveAudio.load();

        setActivePlayback({
          ...descriptor,
          playerId: asset.playerId ?? descriptor.playerId,
          playerName: asset.playerName ?? descriptor.playerName,
          assetId: asset.id,
          assetLabel: asset.nickname,
          index,
          total: items.length,
        });

        setPlaybackProgress(index / items.length);

        await playAsset(activeAudio, asset, controller.signal, (clipProgress) => {
          setPlaybackProgress((index + clipProgress) / items.length);
        });

        setPlaybackProgress((index + 1) / items.length);
      }
    } finally {
      if (!controller.signal.aborted) {
        setActivePlayback(null);
        setIsPaused(false);
        setPlaybackProgress(0);
      }
    }
  };

  const togglePause = async () => {
    const audios = [primaryRef.current, secondaryRef.current].filter(Boolean);
    const playing = audios.find((audio) => !audio.paused && !audio.ended);

    if (!playing && !isPaused) {
      return;
    }

    if (isPaused) {
      await Promise.all(
        audios
          .filter((audio) => audio.src)
          .map(async (audio) => {
            try {
              await audio.play();
            } catch {
              return null;
            }
            return null;
          }),
      );
      setIsPaused(false);
      return;
    }

    audios.forEach((audio) => audio.pause());
    setIsPaused(true);
  };

  return {
    activePlayback,
    isPaused,
    playbackProgress,
    playSequence,
    stopAll,
    togglePause,
  };
}
