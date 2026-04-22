import { useMemo, useRef, useState } from "react";

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createAudio(src) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.playsInline = true;
  return audio;
}

export function usePlaybackEngine() {
  const warmCacheRef = useRef(new Map());
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

  const fadeOutAndStopAll = async () => {
    playbackGenerationRef.current += 1;
    clearSequenceTimeouts();

    const activeAudios = [...activeAudiosRef.current];
    activeAudiosRef.current = [];

    await Promise.all(
      activeAudios.map(async (audio) => {
        try {
          const steps = 6;
          const startingVolume = Number.isFinite(audio.volume) ? audio.volume : 1;

          for (let index = steps - 1; index >= 0; index -= 1) {
            audio.volume = startingVolume * (index / steps);
            await wait(28);
          }

          audio.pause();
          audio.currentTime = 0;
          audio.removeAttribute("src");
          audio.load();
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
            return response.arrayBuffer();
          })
          .then(() => true);

        warmCacheRef.current.set(src, loadPromise);
        return loadPromise;
      }),
    );

    setAudioReadyState({
      offline: true,
      armed: true,
    });
  };

  const playClipNow = async (clip, player = null) => {
    await fadeOutAndStopAll();

    const audio = createAudio(clip.src);
    activeAudiosRef.current = [audio];
    setActivePlayback({
      type: "clip",
      clipId: clip.id,
      clipName: clip.label,
      playerId: player?.id || clip.playerId || "",
      playerName: player?.name || clip.playerName || "",
    });

    audio.onended = () => {
      activeAudiosRef.current = activeAudiosRef.current.filter((entry) => entry !== audio);
      setActivePlayback(null);
    };

    await audio.play().catch(() => null);
  };

  const playSequence = async (player) => {
    await fadeOutAndStopAll();

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

        const audio = createAudio(event.clip.src);
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
