(function () {
  // Shared voice catalog for Puter TTS across the full app.
  const OPENAI_VOICES = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "nova",
    "onyx",
    "sage",
    "shimmer",
  ];

  // Common AWS Polly voices (provider: aws-polly).
  // Puter defaults to AWS Polly when no provider is specified.
  const AWS_POLLY_VOICES = [
    "Joanna", "Matthew", "Ruth", "Stephen", "Danielle", "Gregory",
    "Ivy", "Justin", "Kendra", "Kimberly", "Salli", "Joey", "Kevin",
    "Nicole", "Russell", "Amy", "Emma", "Brian", "Arthur", "Olivia",
    "Aditi", "Kajal", "Raveena", "Hans", "Marlene", "Vicki",
    "Conchita", "Enrique", "Lucia", "Sergio", "Ines", "Cristiano",
    "Mia", "Penelope", "Lupe", "Miguel", "Lea", "Celine", "Mathieu",
    "Chantal", "Filiz", "Burcu", "Zeina", "Hala", "Zayd", "Naja",
    "Mads", "Ruben", "Takumi", "Mizuki", "Seoyeon", "Zhiyu",
    "Hiujin", "Arlet", "Pedro", "Kazuha", "Tomoko", "Liam",
  ];

  // Public sample ElevenLabs voices commonly used in Puter docs/tutorials.
  const ELEVENLABS_VOICES = [
    { name: "Rachel", id: "21m00Tcm4TlvDq8ikWAM" },
    { name: "Adam", id: "pNInz6obpgDQGcFmaJgB" },
    { name: "Alice", id: "Xb7hH8MSUJpSbSDYk0k2" },
  ];

  const voices = [];

  OPENAI_VOICES.forEach(function (voice) {
    const id = "openai:" + voice;
    voices.push({
      id: id,
      label: "OpenAI - " + voice,
      options: { provider: "openai", model: "gpt-4o-mini-tts", voice: voice },
    });
  });

  AWS_POLLY_VOICES.forEach(function (voice) {
    const id = "aws-polly:" + voice;
    voices.push({
      id: id,
      label: "AWS Polly - " + voice,
      options: { provider: "aws-polly", voice: voice, language: "en-US" },
    });
  });

  ELEVENLABS_VOICES.forEach(function (voice) {
    const id = "elevenlabs:" + voice.id;
    voices.push({
      id: id,
      label: "ElevenLabs - " + voice.name,
      options: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: voice.id },
    });
  });

  window.PuterVoiceCatalog = {
    storageKey: "g9_tts_voice",
    defaultId: "openai:alloy",
    voices: voices,
    getById: function (id) {
      const key = String(id || "");
      return voices.find(function (v) { return v.id === key; }) || null;
    },
    getDefault: function () {
      return this.getById(this.defaultId) || voices[0] || null;
    },
  };
})();
