let activeStream = null;

export async function initCamera() {
  if (activeStream) return activeStream.video;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    window.__VIS_CAMERA_ERROR = 'MEDIA_UNAVAILABLE';
    window.dispatchEvent(new CustomEvent('vis:camera-error', { detail: { reason: 'MEDIA_UNAVAILABLE' } }));
    return null;
  }
  let video = document.getElementById('vis-video');
  if (!video) {
    video = document.createElement('video');
  }
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  try {
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
    window.__VIS_CAMERA_ERROR = null;
    return video;
  } catch (err) {
    const reason = err && err.name ? err.name : 'CAMERA_DENIED';
    window.__VIS_CAMERA_ERROR = reason;
    window.dispatchEvent(new CustomEvent('vis:camera-error', { detail: { reason } }));
    return null;
  }
}
