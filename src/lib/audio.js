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

export async function getAudioWaveformPeaks(source, sampleCount = 240) {
  if (!source) {
    return [];
  }

  const cacheKey = `${source}::${sampleCount}`;
  if (waveformCache.has(cacheKey)) {
    return waveformCache.get(cacheKey);
  }

  const response = await fetch(source);
  const buffer = await response.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  try {
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
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
  } finally {
    await audioContext.close().catch(() => {});
  }
}
