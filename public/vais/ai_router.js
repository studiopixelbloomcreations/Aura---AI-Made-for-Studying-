(function (global) {
  "use strict";

  function buildSystemPrompt(profile, config) {
    const c = config || {};
    return `You are Aura, an AI study assistant. The user's name is ${profile.displayName || profile.name || "Student"}. Use a ${c.tone || "friendly"} tone. Humor level: ${c.humor_level || c.humor || 5}/10. Be ${c.verbosity || "medium"} in your responses. Teaching style: ${c.teaching_style || c.style || "socratic"}. The user is a Grade ${profile.grade || 9} student.`;
  }

  class AuraAIRouter {
    constructor() {
      this.profile = {};
      this.config = {};
    }

    async initialize(profile) {
      this.profile = profile || {};
      try {
        const res = await fetch(`/personal-intelligence/config?user_id=${encodeURIComponent(this.profile.userId || this.profile.user_id || "")}`);
        const data = await res.json();
        this.config = data.config || data.profile && data.profile.ai_config || {};
      } catch (error) {
        this.config = {};
      }
    }

    async sendMessage(userMessage, sessionId) {
      const systemPrompt = buildSystemPrompt(this.profile, this.config);
      const body = { userId: this.profile.userId || this.profile.user_id, message: userMessage, sessionId, systemPrompt };
      const res = await fetch("/personal-intelligence/ask", {
        method: "POST",
        headers: { "content-type": "application/json", "x-aevra-csrf": sessionStorage.getItem("aevra_csrf") || "browser" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Aura could not answer right now.");
      return data.response || data.answer || "";
    }
  }

  global.AuraAIRouter = { AuraAIRouter, buildSystemPrompt };
})(window);
