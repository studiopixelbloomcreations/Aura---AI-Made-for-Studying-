let activeStream = null;
let captureCanvas = null;

function ensureVideoElement() {
  let video = window.__visVideoTarget || document.getElementById('vis-video');
  if (!video) {
    video = document.createElement('video');
    video.id = 'vis-video';
    video.setAttribute('aria-hidden', 'true');
    video.style.position = 'fixed';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.left = '-9999px';
    document.body.appendChild(video);
    window.__visVideoTarget = video;
  }
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  return video;
}

function waitForVideoReady(video) {
  if (!video) return Promise.resolve();
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) return Promise.resolve();
  return new Promise((resolve) => {
    const onReady = () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
      resolve();
    };
    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
  });
}

export async function initCamera() {
  if (activeStream) return activeStream.video;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    window.__VIS_CAMERA_ERROR = 'MEDIA_UNAVAILABLE';
    window.dispatchEvent(new CustomEvent('vis:camera-error', { detail: { reason: 'MEDIA_UNAVAILABLE' } }));
    return null;
  }

  const video = ensureVideoElement();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: 'user'
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    await waitForVideoReady(video);
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

export function captureFrame(video, options = {}) {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const maxWidth = Number(options.maxWidth || 640);
  const maxHeight = Number(options.maxHeight || 480);
  const mimeType = options.mimeType || 'image/jpeg';
  const quality = Number.isFinite(options.quality) ? options.quality : 0.82;
  const scale = Math.min(maxWidth / video.videoWidth, maxHeight / video.videoHeight, 1);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  if (!captureCanvas) captureCanvas = document.createElement('canvas');
  captureCanvas.width = width;
  captureCanvas.height = height;
  const ctx = captureCanvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return captureCanvas.toDataURL(mimeType, quality);
}

export async function captureFrames(video, count, intervalMs = 120, options = {}) {
  const frames = [];
  const total = Math.max(0, Number(count || 0));
  for (let i = 0; i < total; i += 1) {
    const frame = captureFrame(video, options);
    if (frame) frames.push(frame);
    if (i < total - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }
  }
  return frames;
}

export function stopCamera() {
  if (!activeStream) return;
  const { stream, video } = activeStream;
  if (stream && stream.getTracks) {
    for (const track of stream.getTracks()) track.stop();
  }
  if (video) video.srcObject = null;
  activeStream = null;
}
