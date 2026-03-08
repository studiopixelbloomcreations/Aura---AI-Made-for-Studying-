"use strict";

function topTopicsFromHistory(history) {
  const arr = Array.isArray(history) ? history : [];
  const counts = {};
  arr.forEach((h) => {
    const c = String(h && h.content || "").toLowerCase();
    if (!c) return;
    if (c.includes("homework") || c.includes("study") || c.includes("exam")) counts.study = (counts.study || 0) + 1;
    if (c.includes("spotify") || c.includes("music")) counts.music = (counts.music || 0) + 1;
    if (c.includes("direction") || c.includes("home") || c.includes("navigate")) counts.navigation = (counts.navigation || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}

const PersonalizationScorer = {
  score(memorySnapshot) {
    const m = memorySnapshot && typeof memorySnapshot === "object" ? memorySnapshot : {};
    const short = m.short_term_memory || {};
    const profile = m.user_profile_memory || {};
    const topics = topTopicsFromHistory(short.recent_conversation || []);

    let proactiveSuggestion = "";
    if (topics[0] === "study") {
      proactiveSuggestion = "You often ask study questions. I can proactively suggest a short revision plan.";
    } else if (topics[0] === "music") {
      proactiveSuggestion = "You often request music actions. I can proactively prepare quick playback shortcuts.";
    } else if (topics[0] === "navigation") {
      proactiveSuggestion = "You often request navigation help. I can proactively suggest fastest route checks.";
    }

    const personalizationScore = Math.min(1, ((topics.length * 0.2) + (profile && profile.name ? 0.2 : 0)));

    return {
      personalization_score: Number(personalizationScore.toFixed(2)),
      top_intent_topics: topics,
      proactive_suggestion: proactiveSuggestion,
    };
  },
};

module.exports = {
  PersonalizationScorer,
};
