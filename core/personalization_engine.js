function asText(value) {
  return String(value || "").trim();
}

function listFrom(value) {
  return asText(value)
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function inferTraits(answers) {
  const traits = [];
  const tone = asText(answers.preferred_tone).toLowerCase();
  const style = asText(answers.learning_style).toLowerCase();
  if (tone) traits.push(tone);
  if (style.includes("step")) traits.push("structured");
  if (style.includes("visual")) traits.push("visual_learner");
  if (style.includes("example")) traits.push("example_driven");
  if (!traits.length) traits.push("adaptive");
  return Array.from(new Set(traits)).slice(0, 8);
}

function buildPersonalizationPrompt(input = {}) {
  const answers = input.answers && typeof input.answers === "object" ? input.answers : {};
  return [
    "User Profile:",
    `- Interests: ${asText(answers.interests) || "unknown"}`,
    `- Communication style: ${asText(answers.preferred_tone) || "adaptive"}`,
    `- Preferences: ${asText(answers.favorite_subjects) || "unknown"}`,
    `- Behavior patterns: ${asText(answers.learning_style) || "adaptive"}`,
    `- Goals: ${asText(answers.goals) || "unknown"}`,
    "Generate a structured user_config.json object.",
  ].join("\n");
}

function buildUserConfig(input = {}) {
  const answers = input.answers && typeof input.answers === "object" ? input.answers : {};
  const profile = input.profile && typeof input.profile === "object" ? input.profile : {};
  const userId = asText(input.user_id || (profile.user_identity && profile.user_identity.username) || profile.file_name || "user");
  return {
    user_id: userId,
    prompt: buildPersonalizationPrompt(input),
    personality_traits: inferTraits(answers),
    interests: listFrom(answers.interests),
    communication_style: {
      tone: asText(answers.preferred_tone) || "adaptive",
      learning_style: asText(answers.learning_style) || "adaptive",
      preferred_language: asText(answers.preferred_language) || "English",
      preferred_name: asText(answers.preferred_name) || asText(answers.full_name),
    },
    ai_behavior: {
      response_style: asText(answers.learning_style) || "adaptive",
      tone: asText(answers.preferred_tone) || "balanced",
      goals: listFrom(answers.goals),
    },
    memory: {
      facts: input.known_facts && typeof input.known_facts === "object" ? input.known_facts : {},
      profile_file: asText(profile.file_name),
      personalization_answers: { ...answers },
    },
    preferences: {
      favorite_subjects: listFrom(answers.favorite_subjects),
      hobbies: listFrom(answers.hobbies),
      timezone_or_city: asText(answers.timezone_or_city),
    },
  };
}

module.exports = {
  buildPersonalizationPrompt,
  buildUserConfig,
};

