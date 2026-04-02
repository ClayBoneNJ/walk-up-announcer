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

function encodeWavFromAudioBuffer(audioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, channelIndex) =>
    audioBuffer.getChannelData(channelIndex),
  );

  let offset = 44;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][frameIndex] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function renderTrimmedClipToWav({
  source,
  trimStartMs = 0,
  trimEndMs = 0,
  fadeInEndMs = 0,
  fadeOutStartMs = 0,
  fadeOutEndMs = 0,
}) {
  if (!source) {
    throw new Error("Missing audio source.");
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to fetch audio source: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const decodeContext = new AudioContextCtor();

  try {
    const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer.slice(0));
    const sampleRate = audioBuffer.sampleRate;
    const safeTrimStartMs = Math.max(0, Number(trimStartMs) || 0);
    const safeTrimEndMs = Math.max(safeTrimStartMs + 1, Number(trimEndMs) || safeTrimStartMs + 1000);
    const durationSeconds = Math.max(0.001, (safeTrimEndMs - safeTrimStartMs) / 1000);
    const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      frameCount,
      sampleRate,
    );

    const sourceNode = offlineContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    const gainNode = offlineContext.createGain();
    sourceNode.connect(gainNode);
    gainNode.connect(offlineContext.destination);

    const fadeInSeconds = Math.max(0, (Math.max(safeTrimStartMs, Number(fadeInEndMs) || safeTrimStartMs) - safeTrimStartMs) / 1000);
    const fadeOutStartSeconds = Math.max(0, (Math.max(safeTrimStartMs, Number(fadeOutStartMs) || safeTrimEndMs) - safeTrimStartMs) / 1000);
    const fadeOutEndSeconds = Math.max(
      fadeOutStartSeconds,
      (Math.max(safeTrimStartMs, Number(fadeOutEndMs) || safeTrimEndMs) - safeTrimStartMs) / 1000,
    );
    const epsilon = 0.01;

    gainNode.gain.cancelScheduledValues(0);
    if (fadeInSeconds > 0) {
      gainNode.gain.setValueAtTime(0, 0);
      gainNode.gain.linearRampToValueAtTime(1, Math.min(durationSeconds, fadeInSeconds));
    } else {
      gainNode.gain.setValueAtTime(1, 0);
    }

    if (fadeOutEndSeconds > fadeOutStartSeconds) {
      gainNode.gain.setValueAtTime(1, Math.min(durationSeconds, fadeOutStartSeconds));
      gainNode.gain.linearRampToValueAtTime(0, Math.min(durationSeconds, fadeOutEndSeconds));
    } else if (fadeOutEndSeconds >= 0 && fadeOutEndSeconds <= durationSeconds) {
      const fadePoint = Math.max(0, Math.min(durationSeconds, fadeOutEndSeconds));
      gainNode.gain.setValueAtTime(1, Math.max(0, fadePoint - epsilon));
      gainNode.gain.linearRampToValueAtTime(0, fadePoint);
    }

    sourceNode.start(0, safeTrimStartMs / 1000, durationSeconds);
    const renderedBuffer = await offlineContext.startRendering();
    return encodeWavFromAudioBuffer(renderedBuffer);
  } finally {
    await decodeContext.close().catch(() => {});
  }
}

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
