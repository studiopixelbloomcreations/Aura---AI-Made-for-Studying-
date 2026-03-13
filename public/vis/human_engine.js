export async function initHuman() {
  if (window.__visHuman) return window.__visHuman;
  if (!window.Human || !window.Human.Human) throw new Error('Human.js not loaded');
  const humanConfig = {
    backend: 'webgl',
    modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
    cacheModels: true,
    face: {
      enabled: true,
      detector: { rotation: true },
      mesh: false,
      iris: false,
      description: true
    },
    emotion: { enabled: true },
    body: { enabled: false },
    hand: { enabled: false }
  };
  const human = new window.Human.Human(humanConfig);
  if (human.load) await human.load();
  if (human.warmup) await human.warmup();
  window.__visHuman = human;
  return human;
}

export async function detectFace(video) {
  const human = await initHuman();
  if (human.tf && human.tf.engine && human.tf.engine().startScope) human.tf.engine().startScope();
  const result = await human.detect(video);
  if (human.tf && human.tf.engine && human.tf.engine().endScope) human.tf.engine().endScope();
  if (human.tf && human.tf.nextFrame) await human.tf.nextFrame();
  const face = result && result.face && result.face[0] ? result.face[0] : null;
  return { result, face };
}
