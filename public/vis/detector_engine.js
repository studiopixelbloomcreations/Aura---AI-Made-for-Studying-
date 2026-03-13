// VIS Detector Engine (MediaPipe Face Detection)
(function () {
  const VIS = (window.VIS = window.VIS || {});
  let detector = null;

  async function initDetector() {
    if (detector) return detector;
    if (!window.FaceDetection) throw new Error('MediaPipe FaceDetection not loaded');
    detector = new window.FaceDetection({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
    });
    detector.setOptions({
      model: 'short',
      minDetectionConfidence: 0.6
    });
    return detector;
  }

  VIS.detectorEngine = {
    async init() {
      return initDetector();
    },
    async detect(video) {
      const det = await initDetector();
      const result = await det.send({ image: video });
      const detections = (result && result.detections) ? result.detections : [];
      return detections.map((d) => ({
        boundingBox: d.boundingBox,
        detectionConfidence: d.score ? d.score[0] : 0,
        keypoints: d.keypoints || []
      }));
    }
  };
})();
