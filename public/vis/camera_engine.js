let activeStream = null;

export async function initCamera() {
  if (activeStream) return activeStream.video;
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24 }
    },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  activeStream = { stream, video };
  return video;
}
