import { useMemo, useRef, useState } from "react";

const STOP_FADE_MS = 700;

function waitForAudioReady(audio) {
  return new Promise((resolve) => {
    if (!audio || audio.readyState >= 2) {
      resolve();
      return;
    }

    const handleReady = () => {
      audio.removeEventListener("canplay", handleReady);
      audio.removeEventListener("loadeddata", handleReady);
      audio.removeEventListener("error", handleReady);
      resolve();
    };

    audio.addEventListener("canplay", handleReady, { once: true });
    audio.addEventListener("loadeddata", handleReady, { once: true });
    audio.addEventListener("error", handleReady, { once: true });
    audio.load();
  });
}

function createAudioController(src, audioContext = null) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.playsInline = true;

  if (!audioContext) {
    return {
      audio,
      gainNode: null,
      sourceNode: null,
    };
  }

  const gainNode = audioContext.createGain();
  gainNode.gain.value = 1;
  const sourceNode = audioContext.createMediaElementSource(audio);
  sourceNode.connect(gainNode);
  gainNode.connect(audioContext.destination);

  return {
    audio,
    gainNode,
    sourceNode,
  };
}

function fadeAudioOut(audioController, durationMs = STOP_FADE_MS) {
  return new Promise((resolve) => {
    const audio = audioController?.audio;
    const gainNode = audioController?.gainNode;

    if (!audio) {
      resolve();
      return;
    }

    const startingVolume = gainNode
      ? gainNode.gain.value
      : Number.isFinite(audio.volume)
        ? audio.volume
        : 1;
    const fadeStart = performance.now();

    const tick = (now) => {
      const progress = Math.max(0, Math.min(1, (now - fadeStart) / Math.max(1, durationMs)));
      const nextLevel = startingVolume * (1 - progress);

      if (gainNode) {
        gainNode.gain.value = nextLevel;
      } else {
        audio.volume = nextLevel;
      }

      if (progress >= 1) {
        resolve();
        return;
      }

      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  });
}

function stopAudioNow(audioController) {
  const audio = audioController?.audio;

  if (!audio) {
    return;
  }

  audio.onended = null;
  audio.onerror = null;
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();

  try {
    audioController?.sourceNode?.disconnect();
  } catch {}

  try {
    audioController?.gainNode?.disconnect();
  } catch {}
}

export function usePlaybackEngine() {
  const audioContextRef = useRef(null);
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

  const ensureAudioContext = async () => {
    if (typeof window === "undefined") {
      return null;
    }

    const ContextCtor = window.AudioContext || window.webkitAudioContext;

    if (!ContextCtor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new ContextCtor();
    }

    if (audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch {}
    }

    return audioContextRef.current;
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
    await ensureAudioContext();

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
    const audioContext = await ensureAudioContext();
    const audioController = createAudioController(playableSrc, audioContext);
    const audio = audioController.audio;
    activeAudiosRef.current = [audioController];
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
      activeAudiosRef.current = activeAudiosRef.current.filter((entry) => entry !== audioController);
      setActivePlayback(null);
    };

    await waitForAudioReady(audio);
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

        const audioContext = await ensureAudioContext();

        if (generation !== playbackGenerationRef.current) {
          return;
        }

        const audioController = createAudioController(playableSrc, audioContext);
        const audio = audioController.audio;
        activeAudiosRef.current = [...activeAudiosRef.current, audioController];
        setActivePlayback({
          type: "sequence",
          playerId: player.id,
          playerName: player.name,
          clipId: event.clip.id,
          clipName: event.clip.label,
        });

        audio.onended = () => {
          activeAudiosRef.current = activeAudiosRef.current.filter((entry) => entry !== audioController);
          if (!activeAudiosRef.current.length) {
            setActivePlayback(null);
          }
        };

        await waitForAudioReady(audio);
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
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
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
