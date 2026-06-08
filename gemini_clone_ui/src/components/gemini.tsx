"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useComposerRuntime,
} from "@assistant-ui/react";

import {
  Cross2Icon,
  Pencil1Icon,
  PlusIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import {
  CopyIcon,
  EllipsisVertical,
  Mic,
  SendHorizonal,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  ChevronDown,
  Info,
  X,
} from "lucide-react";
import { type FC, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { useAppStore } from "../store/useAppStore";
import { AuraLogo } from "./icons/aura-logo";

const GEMINI_STARTUP_MESSAGES = [
  "Where should we start?",
  "What shall we learn today?",
  "Ready to conquer your syllabus?",
  "What subject are we mastering today?",
  "Where shall we study today?",
  "Ready to ace your exams?",
  "Let's explore something new!",
  "How can I help you study today?"
];

export const Gemini: FC = () => {
  const {
    activeTab,
    setActiveTab,
    language,
    setLanguage,
    subject,
    setSubject,
    chatbotVoice,
    setChatbotVoice,
    piVoice,
    setPiVoice,
    chatbotModel,
    setChatbotModel,
    piModel,
    setPiModel,
    theme,
    setTheme,
    
    // Personalization 10 keys
    teachingStyle,
    setTeachingStyle,
    responseLength,
    setResponseLength,
    difficultyLevel,
    setDifficultyLevel,
    toneAdjustment,
    setToneAdjustment,
    memoryPreference,
    setMemoryPreference,
    learningSpeed,
    setLearningSpeed,
    
    // Aura Live States
    isPersonalizing,
    setIsPersonalizing,
    isInitializing,
    setIsInitializing,
    setIntelligenceCreated,
    setIntelligenceProfile
  } = useAppStore();

  const [startupMessage, setStartupMessage] = useState(GEMINI_STARTUP_MESSAGES[0]);
  const [settingsTab, setSettingsTab] = useState<"general" | "voices" | "models" | "personalization">("general");

  // Form states inside components
  const [liveProfileInput, setLiveProfileInput] = useState({
    agentName: "",
    preferredName: "",
    vocalStyle: "interactive",
    energyLevel: "balanced",
    correctionStyle: "kind-direct",
    motivationStyle: "steady",
    weakSubjects: "",
    strongSubjects: "",
    targetGrade: "Grade 9 - A Pass",
    interests: "",
    hobbies: "",
    memoryPriorities: "",
    boundaries: "",
  });
  
  // Loading screen text cycle states
  const [loaderText, setLoaderText] = useState("Generating unique student intelligence signature...");

  // Voice testing synthesis trigger
  const handleTestVoice = (voiceName: string, isPI: boolean) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const testPhrase = isPI
        ? `Testing Aura Personal Intelligence voice engine. Active subject set to ${subject}.`
        : `Testing Aura chatbot text to speech voice synthesis. Ready to assist with study materials.`;
      
      const utterance = new SpeechSynthesisUtterance(testPhrase);
      const voices = window.speechSynthesis.getVoices();
      const matchedVoice = voices.find(
        (v) => v.name.toLowerCase().includes(voiceName.toLowerCase()) || 
               v.lang.toLowerCase().includes(voiceName.toLowerCase())
      );
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech synthesis is not supported on this browser.");
    }
  };

  const handlePersonalizeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIntelligenceProfile({
      ...liveProfileInput,
    });
    
    // Trigger loading sequence
    setIsInitializing(true);
  };

  // Loading screen text cycler loop
  useEffect(() => {
    if (isInitializing) {
      const timers = [
        setTimeout(() => setLoaderText("Registering personal study voice profile..."), 1200),
        setTimeout(() => setLoaderText("Syncing nodes with Aura Swarm consensus..."), 2400),
        setTimeout(() => {
          setIsInitializing(false);
          setIsPersonalizing(false);
          setIntelligenceCreated(true);
        }, 3600)
      ];
      return () => timers.forEach(clearTimeout);
    } else {
      setLoaderText("Generating unique student intelligence signature...");
    }
  }, [isInitializing]);

  // Set random greeting on mount
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * GEMINI_STARTUP_MESSAGES.length);
    setStartupMessage(GEMINI_STARTUP_MESSAGES[randomIndex]!);
  }, []);

  return (
    <ThreadPrimitive.Root className="flex h-full flex-col items-stretch bg-black transition-all duration-300 relative select-none">
      
      <AuiIf condition={(s) => s.thread.isEmpty}>
        <div className="flex-1 flex flex-col pt-[90px] px-4 md:px-[72px]">
          <div className="mx-auto w-full max-w-[760px]">
            {/* Gemini-style greeting: plain white text, 32px, weight 400 */}
            <h1 className="text-[28px] md:text-[32px] leading-[36px] font-normal text-[#e3e3e3] mb-6 select-none animate-greeting-fade">
              {startupMessage}
            </h1>
          </div>
          {/* Suggestion Chips — vertical stack, left-aligned like Gemini */}
          <div className="mx-auto w-full max-w-[760px] mb-6">
            <div className="flex flex-col gap-2">
              {["Write", "Plan", "Research", "Learn"].map((label, i) => (
                <SuggestionChip key={label} delay={i * 80}>{label}</SuggestionChip>
              ))}
            </div>
          </div>
          {/* Composer at bottom */}
          <div className="mx-auto w-full max-w-[760px] mt-auto">
            <Composer />
            <p className="text-center text-[#c4c7c5] text-[12px] leading-[16px] mt-3 mb-4 select-none">
              Aura may display inaccurate info, including about people, so double-check its responses.
            </p>
          </div>
        </div>
      </AuiIf>

      <AuiIf condition={(s) => !s.thread.isEmpty}>
        <ThreadPrimitive.Viewport className="flex grow flex-col overflow-y-auto pt-6 px-4">
          <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
        </ThreadPrimitive.Viewport>
        <div className="px-4 md:px-[72px] pb-4 pt-2">
          <div className="mx-auto w-full max-w-[760px]">
            <Composer />
            <p className="text-center text-[#c4c7c5] text-[12px] leading-[16px] mt-3 select-none">
              Aura may display inaccurate info, including about people, so double-check its responses.
            </p>
          </div>
        </div>
      </AuiIf>

      {/* Spectacular Multi-Tab settings Dialog cloned exactly from Gemini */}
      {activeTab === "settings" && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-3xl h-[480px] bg-[#1e1f20] border border-[#2d2f31]/60 rounded-3xl shadow-2xl flex overflow-hidden animate-scale-up">
            
            {/* Modal Sidebar Tabs */}
            <div className="w-56 bg-[#0f0f10] border-r border-[#2d2f31]/45 p-4 flex flex-col justify-between shrink-0">
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-[#e3e3e3] px-3 mb-4">Settings</h3>
                {[
                  { id: "general" as const, label: "General" },
                  { id: "personalization" as const, label: "Personalization" },
                  { id: "voices" as const, label: "AI Voices" },
                  { id: "models" as const, label: "AI Models" },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setSettingsTab(id)}
                    className={`w-full flex items-center px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                      settingsTab === id
                        ? "bg-[#1a2d4c] text-blue-400"
                        : "hover:bg-white/5 text-[#c4c7c5]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => setActiveTab("chats")}
                className="w-full text-center text-xs font-bold py-2 rounded-xl border border-[#2d2f31] hover:bg-white/5 text-[#c4c7c5]"
              >
                Close Settings
              </button>
            </div>

            {/* Modal Main Content Pane */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#1e1f20]">
              <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                <h4 className="font-bold text-sm text-[#e3e3e3] uppercase tracking-wider">
                  {settingsTab === "general" ? "General Options" : settingsTab === "personalization" ? "Personalization" : settingsTab === "voices" ? "Voice Settings" : "AI Model Selection"}
                </h4>
                <button
                  onClick={() => setActiveTab("chats")}
                  className="size-7 flex items-center justify-center rounded-full hover:bg-white/5 text-[#c4c7c5] hover:text-[#e3e3e3] transition-all"
                >
                  <Cross2Icon className="size-4" />
                </button>
              </div>

              {/* Tab: General */}
              {settingsTab === "general" && (
                <div className="space-y-5 animate-fade-in">
                  {/* Language Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Study Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as any)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="English">English</option>
                      <option value="Sinhala">සිංහල (Sinhala)</option>
                    </select>
                  </div>

                  {/* Active Subject Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Active Subject</label>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="General">General</option>
                      <option value="Math">Math</option>
                      <option value="Science">Science</option>
                      <option value="History">History</option>
                      <option value="English">English</option>
                      <option value="Sinhala">Sinhala</option>
                    </select>
                  </div>

                  {/* Theme Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground font-sans">Aesthetic Theme</label>
                    <div className="flex gap-2.5">
                      {["light", "dark", "system"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t as any)}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                            theme === t
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "border-[#2d2f31]/50 hover:bg-white/5"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Personalization */}
              {settingsTab === "personalization" && (
                <div className="space-y-5 animate-fade-in">
                  {/* Teaching Style */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Teaching Style</label>
                    <select
                      value={teachingStyle}
                      onChange={(e) => setTeachingStyle(e.target.value as any)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="storyteller">Storyteller (Narrative explanations)</option>
                      <option value="socratic">Socratic (Question-guided discovery)</option>
                      <option value="analogy">Analogy-based (Real-world comparisons)</option>
                      <option value="strict">Strict Academic (Textbook-precise)</option>
                    </select>
                  </div>

                  {/* Response Length */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Response Length</label>
                    <div className="flex gap-2">
                      {(["concise", "balanced", "detailed"] as const).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setResponseLength(opt)}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                            responseLength === opt
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "border-[#2d2f31]/50 hover:bg-white/5"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Difficulty Level */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <label className="text-xs font-bold text-muted-foreground">Difficulty Level</label>
                      <span className="text-xs font-bold text-blue-500">{difficultyLevel}/5</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={difficultyLevel}
                      onChange={(e) => setDifficultyLevel(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  {/* Tone Adjustment */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Tone Adjustment</label>
                    <select
                      value={toneAdjustment}
                      onChange={(e) => setToneAdjustment(e.target.value as any)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="encouraging">Encouraging & Supportive</option>
                      <option value="analytical">Analytical & Precise</option>
                      <option value="casual">Casual & Friendly</option>
                      <option value="academic">Formal Academic</option>
                    </select>
                  </div>

                  {/* Learning Speed */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Learning Speed</label>
                    <div className="flex gap-2">
                      {(["slow", "normal", "fast"] as const).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setLearningSpeed(opt)}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                            learningSpeed === opt
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "border-[#2d2f31]/50 hover:bg-white/5"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Memory Preference */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground">Memory Preference</label>
                    <select
                      value={memoryPreference}
                      onChange={(e) => setMemoryPreference(e.target.value as any)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="deep">Deep Memory (Aura recalls all past sessions)</option>
                      <option value="session-only">Session Only (Forgets after closing)</option>
                      <option value="disabled">Disabled (No memory storage)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Tab: Voices */}
              {settingsTab === "voices" && (
                <div className="space-y-5 animate-fade-in">
                  {/* Chatbot Voice Dropdown */}
                  <div className="space-y-2.5 border-b border-white/5 pb-4">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-muted-foreground">Chatbot Voice (Text-to-Speech)</label>
                      <button
                        onClick={() => handleTestVoice(chatbotVoice, false)}
                        className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 font-bold text-[10px] px-2.5 py-1 rounded-full transition hover:opacity-85 active:scale-95 border border-blue-200/50"
                      >
                        <Volume2 className="size-3" />
                        <span>Test Voice</span>
                      </button>
                    </div>
                    <select
                      value={chatbotVoice}
                      onChange={(e) => setChatbotVoice(e.target.value)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="Google US English (Female)">Google US English (Female)</option>
                      <option value="Google UK English (Male)">Google UK English (Male)</option>
                      <option value="Microsoft David (US English)">Microsoft David (US English)</option>
                      <option value="Microsoft Zira (US English)">Microsoft Zira (US English)</option>
                    </select>
                  </div>

                  {/* Personal Intelligence Voice Dropdown */}
                  <div className="space-y-2.5 pb-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-muted-foreground">Personal Intelligence Voice</label>
                      <button
                        onClick={() => handleTestVoice(piVoice, true)}
                        className="flex items-center gap-1 bg-[#9b72cb]/10 text-[#9b72cb] font-bold text-[10px] px-2.5 py-1 rounded-full transition hover:opacity-85 active:scale-95 border border-[#9b72cb]/20"
                      >
                        <Volume2 className="size-3" />
                        <span>Test Voice</span>
                      </button>
                    </div>
                    <select
                      value={piVoice}
                      onChange={(e) => setPiVoice(e.target.value)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="Google UK English (Male)">Google UK English (Male)</option>
                      <option value="Google US English (Female)">Google US English (Female)</option>
                      <option value="Microsoft David (US English)">Microsoft David (US English)</option>
                      <option value="Microsoft Zira (US English)">Microsoft Zira (US English)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Tab: Models */}
              {settingsTab === "models" && (
                <div className="space-y-5 animate-fade-in">
                  {/* Chatbot Model Picker */}
                  <div className="space-y-1.5 border-b border-white/5 pb-4">
                    <label className="text-xs font-bold text-muted-foreground">Chatbot Processing Model</label>
                    <select
                      value={chatbotModel}
                      onChange={(e) => setChatbotModel(e.target.value)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="fast">Aura Fast (Quick homework assist)</option>
                      <option value="thinking">Aura Reasoning (Step-by-step reasoning)</option>
                      <option value="pro">Aura Swarm Consensus (Heavy consensus model)</option>
                    </select>
                  </div>

                  {/* Personal Intelligence Model Picker */}
                  <div className="space-y-1.5 pb-2">
                    <label className="text-xs font-bold text-muted-foreground font-sans">Personal Intelligence Processing Mode</label>
                    <select
                      value={piModel}
                      onChange={(e) => setPiModel(e.target.value)}
                      className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                    >
                      <option value="pi_dynamic">Personal dynamic (Auto-optimized)</option>
                      <option value="deep_research">Deep Research (Full Web crawl & Synthesis)</option>
                      <option value="agent_swarm">Agent Swarm (Multiple AI roles)</option>
                      <option value="research">Local Research Mode</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spectacular Custom Personalization Form Modal in style of Gemini */}
      {isPersonalizing && !isInitializing && (
        <div className="absolute inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-45 p-4 animate-fade-in select-none">
          <form
            onSubmit={handlePersonalizeSubmit}
            className="w-full max-w-xl bg-[#1e1f20] border border-[#2d2f31]/70 rounded-[28px] p-6 shadow-2xl space-y-5 animate-scale-up"
          >
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-4.5 text-blue-400 animate-pulse" />
                <h3 className="font-bold text-[16px] text-[#e3e3e3]">Create Your Custom Intelligence</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonalizing(false)}
                className="size-7 flex items-center justify-center rounded-full hover:bg-white/5 text-[#c4c7c5] transition"
              >
                <X className="size-4.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {[
                ["agentName", "What should your Aura Live agent be called?", "Nova, Lumen, Aura One"],
                ["preferredName", "What should the agent call you?", "Your preferred name"],
                ["weakSubjects", "Where should it be extra patient?", "Algebra, chemistry equations, Sinhala reading"],
                ["strongSubjects", "Where can it move faster?", "ICT, science, English speaking"],
                ["interests", "What interests should it connect lessons to?", "Robotics, cricket, games, music"],
                ["hobbies", "What hobbies should it remember?", "Coding, drawing, electronics"],
                ["memoryPriorities", "What should it always remember over time?", "Goals, weak areas, family schedule"],
                ["boundaries", "Any boundaries or things to avoid?", "No shouting, short answers at night"],
              ].map(([key, label, placeholder]) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">{label}</label>
                  <input
                    type="text"
                    required={key === "preferredName" || key === "weakSubjects"}
                    placeholder={placeholder}
                    value={(liveProfileInput as any)[key]}
                    onChange={(e) => setLiveProfileInput((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full bg-[#0f0f10] text-xs font-medium rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                  <span>Vocal Mentorship Style</span>
                  <Info className="size-3 opacity-60" />
                </label>
                <select
                  value={liveProfileInput.vocalStyle}
                  onChange={(e) => setLiveProfileInput((prev) => ({ ...prev, vocalStyle: e.target.value }))}
                  className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                >
                  <option value="interactive">Interactive Storyteller</option>
                  <option value="strict">Strict Academic Mentor</option>
                  <option value="helper">Supportive Helper</option>
                  <option value="gamer">Energetic Peer Coach</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Agent Energy</label>
                <select
                  value={liveProfileInput.energyLevel}
                  onChange={(e) => setLiveProfileInput((prev) => ({ ...prev, energyLevel: e.target.value }))}
                  className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                >
                  <option value="calm">Calm and steady</option>
                  <option value="balanced">Balanced</option>
                  <option value="energetic">Energetic and hype</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Correction Style</label>
                <select
                  value={liveProfileInput.correctionStyle}
                  onChange={(e) => setLiveProfileInput((prev) => ({ ...prev, correctionStyle: e.target.value }))}
                  className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                >
                  <option value="kind-direct">Kind but direct</option>
                  <option value="strict">Strict and precise</option>
                  <option value="gentle">Gentle hints first</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Target Learning Goal</label>
                <select
                  value={liveProfileInput.targetGrade}
                  onChange={(e) => setLiveProfileInput((prev) => ({ ...prev, targetGrade: e.target.value }))}
                  className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                >
                  <option value="Grade 9 - A Pass">Grade 9 - Standard A Pass target</option>
                  <option value="Grade 9 - Excellence">Grade 9 - Excellence target</option>
                  <option value="Grade 10 Prep">Advanced Grade 10 Preparation</option>
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-muted-foreground">Motivation Style</label>
                <select
                  value={liveProfileInput.motivationStyle}
                  onChange={(e) => setLiveProfileInput((prev) => ({ ...prev, motivationStyle: e.target.value }))}
                  className="w-full bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-[#e3e3e3]"
                >
                  <option value="steady">Steady confidence building</option>
                  <option value="challenge">Challenge me hard</option>
                  <option value="celebrate">Celebrate small wins</option>
                </select>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-3 pt-2.5 border-t border-white/5">
              <button
                type="button"
                onClick={() => setIsPersonalizing(false)}
                className="flex-1 py-2.5 border border-[#2d2f31] hover:bg-white/5 rounded-xl text-xs font-bold transition-all text-[#c4c7c5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95"
              >
                Continue
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Spectacular Loading Overlay in Gemini style */}
      {isInitializing && (
        <div className="absolute inset-0 bg-[#070708] flex flex-col justify-center items-center z-50 p-6 animate-fade-in select-none text-white">
          <div className="w-full max-w-sm flex flex-col items-center text-center space-y-6">
            
            {/* Spinning starry glow logo */}
            <div className="relative size-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 shadow-lg">
              <Sparkles className="size-8 text-blue-400 animate-spin-slow" />
              <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-ping" />
            </div>

            {/* Simulated cycler updates */}
            <div className="space-y-1.5">
              <h3 className="font-bold text-sm tracking-wide text-[#e3e3e3]">Aura SWARM CORE</h3>
              <p className="text-[12.5px] font-semibold text-blue-400 h-6 transition-all animate-pulse">
                {loaderText}
              </p>
            </div>

            {/* Shimmery progress bar */}
            <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full animate-progress-glow" />
            </div>

            <p className="text-[10px] text-white/30 tracking-widest uppercase">Initializing Node signature...</p>
          </div>
        </div>
      )}

    </ThreadPrimitive.Root>
  );
};

const SuggestionChip: FC<{
  children: string;
  delay?: number;
}> = ({ children, delay = 0 }) => {
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-full bg-[#0e0e0e] px-4 py-3 text-[#c4c7c5] text-[16px] leading-[24px] font-normal transition-all duration-200 hover:bg-[#1e1f20] active:scale-[0.97] animate-chip-stagger self-start"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {children}
    </button>
  );
};

const Composer: FC = () => {
  const isEmpty = useAuiState((s) => s.composer.isEmpty);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  return (
    <ComposerPrimitive.Root
      data-empty={isEmpty}
      data-running={isRunning}
      className="group/composer mx-auto flex w-full max-w-[760px] flex-col rounded-[32px] bg-[#1e1f20] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.16)] transition-all duration-300 focus-within:shadow-[0_4px_16px_-2px_rgba(66,133,244,0.15)]"
    >
      <AuiIf condition={(s) => s.composer.attachments.length > 0}>
        <div className="overflow-hidden rounded-t-2xl flex flex-col gap-2">
          <div className="overflow-x-auto p-3.5">
            <div className="flex flex-row gap-3">
              <ComposerPrimitive.Attachments
                components={{ Attachment: GeminiAttachment }}
              />
            </div>
          </div>
          <FileActionButtons />
        </div>
      </AuiIf>

      <div className="flex flex-col">
        <div className="relative px-3 pt-3">
          <div className="wrap-break-word max-h-96 w-full overflow-y-auto px-3 py-2.5">
            <ComposerPrimitive.Input
              placeholder="Ask Aura"
              className="block min-h-[24px] w-full resize-none bg-transparent text-[16px] leading-[24px] text-[#e3e3e3] outline-none placeholder:text-[#bdc1c6]"
            />
          </div>
        </div>

        <div className="flex w-full items-center px-3 pb-3 pt-1">
          {/* Left: Upload (+) and Tools */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ComposerPrimitive.AddAttachment className="flex h-[40px] w-[40px] items-center justify-center rounded-full transition-all hover:bg-white/8 active:scale-[0.96] text-[#c4c7c5]">
              <PlusIcon width={24} height={24} />
            </ComposerPrimitive.AddAttachment>
            <button className="flex h-[40px] w-[40px] items-center justify-center rounded-full transition-all hover:bg-white/8 text-[#c4c7c5]">
              <EllipsisVertical width={20} height={20} />
            </button>
          </div>

          {/* Right: Model selector, Mic, Send */}
          <div className="flex items-center gap-1">
            {/* Flash model selector pill — Gemini style */}
            <button className="flex items-center gap-1.5 h-[40px] px-3 rounded-full hover:bg-white/8 transition-all text-[#c4c7c5] text-[14px] font-medium">
              <Sparkles className="size-[20px]" />
              <span>Flash</span>
              <span className="size-[6px] rounded-full bg-[#3186FF] mt-0.5" />
              <ChevronDown className="size-[20px]" />
            </button>

            {/* Mic button */}
            <button
              type="button"
              className="flex h-[40px] w-[40px] items-center justify-center rounded-full transition-all hover:bg-white/8 text-[#c4c7c5] group-data-[empty=false]/composer:scale-0 group-data-[running=true]/composer:scale-0 group-data-[empty=false]/composer:opacity-0 group-data-[running=true]/composer:opacity-0 duration-300"
              aria-label="Voice mode"
            >
              <Mic width={24} height={24} />
            </button>

            {/* Send / Cancel */}
            <div className="relative h-[42px] w-[42px] shrink-0">
              <ComposerPrimitive.Send className="absolute inset-0 flex items-center justify-center rounded-full bg-[#1e1f20] text-[#e3e3e3] transition-all duration-300 ease-out hover:bg-[#2b2c2d] group-data-[empty=true]/composer:scale-0 group-data-[running=true]/composer:scale-0 group-data-[empty=true]/composer:opacity-0 group-data-[running=true]/composer:opacity-0">
                <SendHorizonal width={18} height={18} />
              </ComposerPrimitive.Send>
              <ComposerPrimitive.Cancel className="absolute inset-0 flex items-center justify-center rounded-full bg-[#1e1f20] text-[#e3e3e3] transition-all duration-300 ease-out hover:bg-[#2b2c2d] group-data-[running=false]/composer:scale-0 group-data-[running=false]/composer:opacity-0">
                <Square width={12} height={12} fill="currentColor" />
              </ComposerPrimitive.Cancel>
            </div>
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

const actionBtnClass =
  "flex size-7 items-center justify-center rounded-full text-[#c4c7c5] transition-colors hover:bg-white/8";

const ChatMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group/message relative mx-auto mb-6 flex w-full max-w-[760px] flex-col pb-0.5 animate-fade-in">
      <AuiIf condition={(s) => s.message.role === "user"}>
        <div className="flex items-center justify-end gap-2">
          <ActionBarPrimitive.Root className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100">
            <ActionBarPrimitive.Copy className={actionBtnClass}>
              <CopyIcon width={13} height={13} />
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Edit className={actionBtnClass}>
              <Pencil1Icon width={13} height={13} />
            </ActionBarPrimitive.Edit>
          </ActionBarPrimitive.Root>
          <div className="max-w-[78%] rounded-[20px] rounded-tr-[4px] bg-[#282a2c] px-[18px] py-3 text-sm text-[#e3e3e3] shadow-sm leading-relaxed break-words">
            <div className="prose prose-sm prose-invert wrap-break-word">
              <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
            </div>
          </div>
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.message.role === "assistant"}>
        <div className="flex items-start gap-4">
          <div className="mt-1 h-7 w-7 aspect-square rounded-full bg-gradient-to-tr from-[#4285f4] to-[#9b72cb] flex items-center justify-center text-white shadow-sm shrink-0 overflow-hidden">
            <AuraLogo className="size-5" state="responding" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="prose prose-sm prose-invert wrap-break-word prose-li:my-1 prose-ol:my-1 prose-p:my-2 prose-ul:my-1 text-sm text-[#e3e3e3] leading-relaxed">
              <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
            </div>
            <ActionBarPrimitive.Root className="mt-3 -ml-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-300 group-focus-within/message:opacity-100 group-hover/message:opacity-100">
              <ActionBarPrimitive.FeedbackPositive className={actionBtnClass}>
                <ThumbsUp width={13} height={13} />
              </ActionBarPrimitive.FeedbackPositive>
              <ActionBarPrimitive.FeedbackNegative className={actionBtnClass}>
                <ThumbsDown width={13} height={13} />
              </ActionBarPrimitive.FeedbackNegative>
              <ActionBarPrimitive.Reload className={actionBtnClass}>
                <ReloadIcon width={13} height={13} />
              </ActionBarPrimitive.Reload>
              <ActionBarPrimitive.Copy className={actionBtnClass}>
                <CopyIcon width={13} height={13} />
              </ActionBarPrimitive.Copy>
              <button type="button" className={actionBtnClass}>
                <EllipsisVertical width={13} height={13} />
              </button>
            </ActionBarPrimitive.Root>
          </div>
        </div>
      </AuiIf>
    </MessagePrimitive.Root>
  );
};

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow(({ attachment }): { file?: File; src?: string } => {
      if (attachment.type !== "image") return {};
      if (attachment.file) return { file: attachment.file };
      const src = attachment.content?.filter((c) => c.type === "image")[0]
        ?.image;
      if (!src) return {};
      return { src };
    }),
  );

  return useFileSrc(file) ?? src;
};

const FileActionButtons: FC = () => {
  const hasAttachments = useAuiState((s) => s.composer.attachments.length > 0);
  const composerRuntime = useComposerRuntime();

  if (!hasAttachments) return null;

  const actions = [
    { label: "Summarize File", prompt: "Summarize the attached file and explain its main concepts clearly." },
    { label: "Generate Flashcards", prompt: "Generate 5 interactive flashcards based on the attached file contents." },
    { label: "Quiz Me", prompt: "Quiz me step-by-step with 3 conceptual questions based on this attached file." },
    { label: "Generate Study Guide", prompt: "Create a detailed step-by-step study guide based on the attached file." }
  ];

  return (
    <div className="flex flex-wrap gap-2 px-3.5 pb-3.5 animate-fade-in border-b border-[#dadce0]/25 dark:border-[#2d2f31]/25">
      {actions.map((act) => (
        <button
          key={act.label}
          type="button"
          onClick={() => {
            composerRuntime.setText(act.prompt);
            composerRuntime.send();
          }}
          className="text-xs px-3 py-1.5 rounded-full border border-blue-200/50 bg-blue-50/30 text-blue-600 hover:bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/20 dark:text-blue-400 font-semibold cursor-pointer active:scale-95 transition-all"
        >
          {act.label}
        </button>
      ))}
    </div>
  );
};

const GeminiAttachment: FC = () => {
  const { name, type } = useAuiState(({ attachment }) => attachment);
  const isImage = type === "image";
  const src = useAttachmentSrc();

  // Get file icon based on name extension
  const getFileIcon = (fileName?: string) => {
    const ext = fileName?.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "PDF";
    if (ext === "docx" || ext === "doc") return "DOCX";
    if (ext === "txt") return "TXT";
    if (["wav", "mp3", "m4a", "webm", "ogg"].includes(ext || "")) return "AUDIO";
    return "FILE";
  };

  return (
    <AttachmentPrimitive.Root className="group/thumbnail relative">
      <div
        className="overflow-hidden rounded-xl border border-[#dadce0] shadow-sm hover:border-[#c4c7c5] hover:shadow-md dark:border-[#3c4043] dark:hover:border-[#5f6368] bg-[#f8f9fa] dark:bg-[#202124] flex flex-col justify-between"
        style={{
          width: "120px",
          height: "120px",
          minWidth: "120px",
          minHeight: "120px",
        }}
      >
        <button
          type="button"
          className="relative flex-1 flex flex-col items-center justify-center p-2 text-center"
          style={{ width: "100%", height: "100%" }}
        >
          {isImage && src ? (
            // biome-ignore lint/performance/noImgElement: example component
            <img
              className="h-full w-full object-cover transition duration-400 rounded-xl"
              alt="Attachment"
              src={src}
            />
          ) : (
            <div className="flex flex-col h-full w-full items-center justify-center text-[#70757a] dark:text-[#9aa0a6] p-1.5 select-none">
              <span className="text-xl mb-1.5">{getFileIcon(name)}</span>
              <span className="text-[10px] font-medium leading-tight truncate max-w-full text-[#444746] dark:text-[#c4c7c5]">
                {name || "File"}
              </span>
            </div>
          )}
        </button>
      </div>
      <AttachmentPrimitive.Remove
        className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#70757a] opacity-0 backdrop-blur-sm transition-all hover:bg-[#f1f3f4] hover:text-[#1f1f1f] group-focus-within/thumbnail:opacity-100 group-hover/thumbnail:opacity-100 dark:border-[#3c4043] dark:bg-[#1e1f20] dark:text-[#9aa0a6] dark:hover:bg-[#2b2c2f] dark:hover:text-[#e3e3e3] shadow-md cursor-pointer"
        aria-label="Remove attachment"
      >
        <Cross2Icon width={14} height={14} />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
};
