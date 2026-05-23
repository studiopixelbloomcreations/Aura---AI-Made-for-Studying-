(function (global) {
  "use strict";

  async function generateEmbedding() {
    throw new Error("Voice embeddings are generated on the Aura backend for security and performance.");
  }

  async function recognizeAudioBlob(blob) {
    if (!(blob instanceof Blob)) throw new Error("A recorded audio blob is required.");
    const form = new FormData();
    form.append("audio", blob, "aevra-voice.webm");
    const response = await fetch("/voice/recognize", {
      method: "POST",
      headers: { "x-aevra-csrf": sessionStorage.getItem("aevra_csrf") || "browser" },
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || "Voice recognition failed.");
    return data.data || data;
  }

  global.AuraVoiceEmbeddingEngine = { generateEmbedding, recognizeAudioBlob };
})(window);
