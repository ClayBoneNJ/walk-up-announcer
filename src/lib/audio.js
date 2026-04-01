export async function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    };

    audio.preload = "metadata";
    audio.src = objectUrl;
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Unable to read audio metadata."));
    };
  });
}

const waveformCache = new Map();

export function createFallbackWaveformPeaks(sampleCount = 240) {
  return Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / Math.max(1, sampleCount - 1);
    const envelope = 0.35 + (Math.sin(progress * Math.PI * 3) + 1) * 0.18;
    return Math.max(0.18, Math.min(0.82, envelope));
  });
}

export async function getAudioWaveformPeaks(source, sampleCount = 240) {
  if (!source) {
    return [];
  }

  const cacheKey = `${source}::${sampleCount}`;
  if (waveformCache.has(cacheKey)) {
    return waveformCache.get(cacheKey);
  }

  let audioContext = null;

  try {
    const controller = new AbortController();
    const fetchTimeoutId = window.setTimeout(() => controller.abort(), 8000);

    const response = await fetch(source, { signal: controller.signal });
    window.clearTimeout(fetchTimeoutId);

    if (!response.ok) {
      throw new Error(`Unable to fetch audio source: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const audioBuffer = await Promise.race([
      audioContext.decodeAudioData(buffer.slice(0)),
      new Promise((_, reject) =>
        window.setTimeout(() => reject(new Error("Waveform decode timed out.")), 8000),
      ),
    ]);
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / sampleCount));
    const peaks = Array.from({ length: sampleCount }, (_, index) => {
      const start = index * blockSize;
      const end = Math.min(start + blockSize, channelData.length);
      let peak = 0;

      for (let cursor = start; cursor < end; cursor += 1) {
        peak = Math.max(peak, Math.abs(channelData[cursor]));
      }

      return peak;
    });

    const maxPeak = Math.max(...peaks, 0.0001);
    const normalizedPeaks = peaks.map((value) => value / maxPeak);
    waveformCache.set(cacheKey, normalizedPeaks);
    return normalizedPeaks;
  } catch {
    const fallbackPeaks = createFallbackWaveformPeaks(sampleCount);
    waveformCache.set(cacheKey, fallbackPeaks);
    return fallbackPeaks;
  } finally {
    await audioContext?.close().catch(() => {});
  }
}
