import { useMemo, useRef, useState } from "react";

const STOP_FADE_MS = 700;

function createAudio(src) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.playsInline = true;
  return audio;
}

function fadeAudioOut(audio, durationMs = STOP_FADE_MS) {
  return new Promise((resolve) => {
    if (!audio) {
      resolve();
      return;
    }

    const startingVolume = Number.isFinite(audio.volume) ? audio.volume : 1;
    const fadeStart = performance.now();

    const tick = (now) => {
      const progress = Math.max(0, Math.min(1, (now - fadeStart) / Math.max(1, durationMs)));
      audio.volume = startingVolume * (1 - progress);

      if (progress >= 1) {
        resolve();
        return;
      }

      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  });
}

function stopAudioNow(audio) {
  if (!audio) {
    return;
  }

  audio.onended = null;
  audio.onerror = null;
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();
}

export function usePlaybackEngine() {
  const warmCacheRef = useRef(new Map());
  const objectUrlCacheRef = useRef(new Map());
  const activeAudiosRef = useRef([]);
  const sequenceTimeoutsRef = useRef([]);
  const playbackGenerationRef = useRef(0);
  const [activePlayback, setActivePlayback] = useState(null);
  const [audioReadyState, setAudioReadyState] = useState({
    offline: false,
    armed: false,
  });

  const clearSequenceTimeouts = () => {
    sequenceTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    sequenceTimeoutsRef.current = [];
  };

  const getPlayableSrc = async (src) => {
    if (!src) {
      return src;
    }

    if (objectUrlCacheRef.current.has(src)) {
      return objectUrlCacheRef.current.get(src);
    }

    const cachedPromise = warmCacheRef.current.get(src);

    if (!cachedPromise) {
      return src;
    }

    try {
      return await cachedPromise;
    } catch {
      return src;
    }
  };

  const fadeOutAndStopAll = async ({ fadeOut = true } = {}) => {
    playbackGenerationRef.current += 1;
    clearSequenceTimeouts();

    const activeAudios = [...activeAudiosRef.current];
    activeAudiosRef.current = [];

    await Promise.all(
      activeAudios.map(async (audio) => {
        try {
          if (fadeOut) {
            await fadeAudioOut(audio);
          }

          stopAudioNow(audio);
        } catch {}
      }),
    );

    setActivePlayback(null);
  };

  const primeSources = async (sources = []) => {
    const uniqueSources = [...new Set(sources.filter(Boolean))];

    await Promise.allSettled(
      uniqueSources.map(async (src) => {
        if (warmCacheRef.current.has(src)) {
          return warmCacheRef.current.get(src);
        }

        const loadPromise = fetch(src, { cache: "force-cache" })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Unable to preload ${src}`);
            }
            return response.blob();
          })
          .then((blob) => {
            const previousObjectUrl = objectUrlCacheRef.current.get(src);

            if (previousObjectUrl) {
              URL.revokeObjectURL(previousObjectUrl);
            }

            const objectUrl = URL.createObjectURL(blob);
            objectUrlCacheRef.current.set(src, objectUrl);
            return objectUrl;
          });

        warmCacheRef.current.set(src, loadPromise);
        return loadPromise;
      }),
    );

    setAudioReadyState({
      offline: true,
      armed: true,
    });
  };

  const playClipNow = async (clip, player = null, { fadeOutPrevious = true } = {}) => {
    await fadeOutAndStopAll({ fadeOut: fadeOutPrevious });

    const playableSrc = await getPlayableSrc(clip.src);
    const audio = createAudio(playableSrc);
    activeAudiosRef.current = [audio];
    setActivePlayback({
      type: "clip",
      clipId: clip.id,
      clipName: clip.label,
      playerId: player?.id || clip.playerId || "",
      playerName: player?.name || clip.playerName || "",
      relatedPlayerIds: Array.isArray(clip.playerIds)
        ? clip.playerIds.filter(Boolean)
        : player?.id || clip.playerId
          ? [player?.id || clip.playerId]
          : [],
    });

    audio.onended = () => {
      activeAudiosRef.current = activeAudiosRef.current.filter((entry) => entry !== audio);
      setActivePlayback(null);
    };

    await audio.play().catch(() => null);
  };

  const playSequence = async (player) => {
    await fadeOutAndStopAll();
    await primeSources(player.sequence.map((event) => event.clip?.src));

    const generation = playbackGenerationRef.current;
    setActivePlayback({
      type: "sequence",
      playerId: player.id,
      playerName: player.name,
      clipId: "",
      clipName: "",
    });

    player.sequence.forEach((event) => {
      const timeoutId = window.setTimeout(async () => {
        if (generation !== playbackGenerationRef.current) {
          return;
        }

        const playableSrc = await getPlayableSrc(event.clip.src);

        if (generation !== playbackGenerationRef.current) {
          return;
        }

        const audio = createAudio(playableSrc);
        activeAudiosRef.current = [...activeAudiosRef.current, audio];
        setActivePlayback({
          type: "sequence",
          playerId: player.id,
          playerName: player.name,
          clipId: event.clip.id,
          clipName: event.clip.label,
        });

        audio.onended = () => {
          activeAudiosRef.current = activeAudiosRef.current.filter((entry) => entry !== audio);
          if (!activeAudiosRef.current.length) {
            setActivePlayback(null);
          }
        };

        await audio.play().catch(() => null);
      }, event.startMs);

      sequenceTimeoutsRef.current.push(timeoutId);
    });
  };

  const resetEngine = async () => {
    objectUrlCacheRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    objectUrlCacheRef.current.clear();
    warmCacheRef.current.clear();
    await fadeOutAndStopAll();
    setAudioReadyState({
      offline: false,
      armed: false,
    });
  };

  return useMemo(
    () => ({
      activePlayback,
      audioReadyState,
      primeSources,
      resetEngine,
      playClipNow,
      playSequence,
      fadeOutAndStopAll,
    }),
    [activePlayback, audioReadyState],
  );
}
