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
