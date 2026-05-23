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
  const [hobbiesInput, setHobbiesInput] = useState("");
  const [weakSubjectsInput, setWeakSubjectsInput] = useState("");
  const [gradeInput, setGradeInput] = useState("Grade 9 - A Pass");
  const [vocalStyleInput, setVocalStyleInput] = useState("interactive");
  
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
      hobbies: hobbiesInput,
      weakSubjects: weakSubjectsInput,
      targetGrade: gradeInput,
      vocalStyle: vocalStyleInput
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
    <ThreadPrimitive.Root className="flex h-full flex-col items-stretch bg-white dark:bg-[#0e0e0f] transition-all duration-300 relative select-none">
      
      <AuiIf condition={(s) => s.thread.isEmpty}>
        <div className="flex-1 flex flex-col justify-center px-4 md:px-8">
          <div className="mx-auto w-full max-w-3xl">
            {/* Hi Studio Pixel (Subtext) */}
            <h2 className="text-2xl md:text-3xl text-[#c4c7c5] dark:text-[#444746] font-medium mb-1 tracking-tight select-none">
              Hi Studio Pixel
            </h2>
            {/* Where should we start? (Gradient Bold text) */}
            <h1 className="text-[38px] md:text-[56px] leading-tight font-medium tracking-tight mb-8 select-none text-transparent bg-clip-text bg-gradient-to-r from-[#4285f4] via-[#9b72cb] to-[#d96570]">
              {startupMessage}
            </h1>
          </div>
          <Composer />
          {/* Exact Suggestion Chips */}
          <div className="mx-auto mt-6 flex w-full max-w-3xl flex-wrap justify-center md:justify-start gap-2.5">
            <SuggestionChip>Create image</SuggestionChip>
            <SuggestionChip>Create music</SuggestionChip>
            <SuggestionChip>Boost my day</SuggestionChip>
            <SuggestionChip>Write anything</SuggestionChip>
            <SuggestionChip>Help me learn</SuggestionChip>
          </div>
        </div>
      </AuiIf>

      <AuiIf condition={(s) => !s.thread.isEmpty}>
        <ThreadPrimitive.Viewport className="flex grow flex-col overflow-y-auto pt-6 px-4">
          <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
        </ThreadPrimitive.Viewport>
        <div className="space-y-3 px-6 pb-6 pt-2 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-[#0e0e0f] dark:via-[#0e0e0f]/90 dark:to-transparent">
          <Composer />
          <p className="text-center text-[#70757a] text-[11px] dark:text-[#9aa0a6] font-medium">
            Aura may display inaccurate info, including about people, so double-check its responses.
          </p>
        </div>
      </AuiIf>

      {/* Spectacular Multi-Tab settings Dialog cloned exactly from Gemini */}
      {activeTab === "settings" && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="w-full max-w-3xl h-[480px] bg-white dark:bg-[#1e1f20] border border-[#dadce0]/60 dark:border-[#2d2f31]/60 rounded-3xl shadow-2xl flex overflow-hidden animate-scale-up">
            
            {/* Modal Sidebar Tabs */}
            <div className="w-56 bg-[#f0f4f9] dark:bg-[#0f0f10] border-r border-[#dadce0]/45 dark:border-[#2d2f31]/45 p-4 flex flex-col justify-between shrink-0">
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-foreground px-3 mb-4">Settings</h3>
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
                        ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c] text-blue-600 dark:text-blue-400"
                        : "hover:bg-black/5 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => setActiveTab("chats")}
                className="w-full text-center text-xs font-bold py-2 rounded-xl border border-[#dadce0] dark:border-[#2d2f31] hover:bg-black/5 dark:hover:bg-white/5"
              >
                Close Settings
              </button>
            </div>

            {/* Modal Main Content Pane */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-white dark:bg-[#1e1f20]">
              <div className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-2.5">
                <h4 className="font-bold text-sm text-foreground uppercase tracking-wider">
                  {settingsTab === "general" ? "General Options" : settingsTab === "personalization" ? "Personalization" : settingsTab === "voices" ? "Voice Settings" : "AI Model Selection"}
                </h4>
                <button
                  onClick={() => setActiveTab("chats")}
                  className="size-7 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all"
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
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
                              : "border-[#dadce0]/50 dark:border-[#2d2f31]/50 hover:bg-black/5 dark:hover:bg-white/5"
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
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
                              : "border-[#dadce0]/50 dark:border-[#2d2f31]/50 hover:bg-black/5 dark:hover:bg-white/5"
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
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
                              : "border-[#dadce0]/50 dark:border-[#2d2f31]/50 hover:bg-black/5 dark:hover:bg-white/5"
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
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
                  <div className="space-y-2.5 border-b border-black/5 dark:border-white/5 pb-4">
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
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
                  <div className="space-y-1.5 border-b border-black/5 dark:border-white/5 pb-4">
                    <label className="text-xs font-bold text-muted-foreground">Chatbot Processing Model</label>
                    <select
                      value={chatbotModel}
                      onChange={(e) => setChatbotModel(e.target.value)}
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
                      className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
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
            className="w-full max-w-xl bg-white dark:bg-[#1e1f20] border border-[#dadce0]/70 dark:border-[#2d2f31]/70 rounded-[28px] p-6 shadow-2xl space-y-5 animate-scale-up"
          >
            <div className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-4.5 text-blue-600 animate-pulse" />
                <h3 className="font-bold text-[16px] text-[#1f1f1f] dark:text-[#e3e3e3]">Create Your Custom Intelligence</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonalizing(false)}
                className="size-7 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition"
              >
                <X className="size-4.5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
              
              {/* Vocal Mentorship style */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                  <span>Vocal Mentorship Style</span>
                  <Info className="size-3 opacity-60" />
                </label>
                <select
                  value={vocalStyleInput}
                  onChange={(e) => setVocalStyleInput(e.target.value)}
                  className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
                >
                  <option value="interactive">Interactive Storyteller (Great for understanding history/science)</option>
                  <option value="strict">Strict Academic Mentor (High discipline homework review)</option>
                  <option value="helper">Supportive Helper (Calm study companion)</option>
                  <option value="gamer">Energetic Gamer Buddy (Relaxed peer-learning style)</option>
                </select>
              </div>

              {/* Weak Subject areas */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">What are your weak subject areas?</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Science Chemistry equations, Algebra Geometry, Sinhala reading"
                  value={weakSubjectsInput}
                  onChange={(e) => setWeakSubjectsInput(e.target.value)}
                  className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-medium rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-foreground"
                />
              </div>

              {/* Target study grade */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Target Learning Goal</label>
                <select
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                  className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-semibold rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500"
                >
                  <option value="Grade 9 - A Pass">Grade 9 - Standard A Pass target</option>
                  <option value="Grade 9 - Excellence">Grade 9 - District Rank/Excellence target</option>
                  <option value="Grade 10 Prep">Advanced Grade 10 Preparation</option>
                </select>
              </div>

              {/* Hobbies & Hopes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Your Hobbies & Interests</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Building electronic kits, coding, playing video games, cricket"
                  value={hobbiesInput}
                  onChange={(e) => setHobbiesInput(e.target.value)}
                  className="w-full bg-[#f0f4f9] dark:bg-[#0f0f10] text-xs font-medium rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-2.5 outline-none focus:border-blue-500 text-foreground"
                />
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-3 pt-2.5 border-t border-black/5 dark:border-white/5">
              <button
                type="button"
                onClick={() => setIsPersonalizing(false)}
                className="flex-1 py-2.5 border border-[#dadce0]/70 dark:border-[#2d2f31] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-xs font-bold transition-all text-foreground"
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
}> = ({ children }) => {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-full bg-white dark:bg-[#1e1f20] px-4.5 py-2 text-[#444746] text-xs font-semibold shadow-sm hover:bg-[#f1f3f4] dark:text-[#c4c7c5] dark:hover:bg-[#2b2c2d] border border-[#dadce0]/70 dark:border-[#2d2f31] transition-all hover:scale-[1.01] active:scale-[0.99]"
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
      className="group/composer mx-auto flex w-full max-w-3xl flex-col rounded-[32px] border border-[#dadce0]/80 dark:border-[#2d2f31]/80 bg-white py-5 px-6 shadow-[0_12px_42px_rgba(0,0,0,0.12)] transition-all duration-300 dark:bg-[#1e1f20] hover:shadow-[0_16px_56px_rgba(0,0,0,0.16)] focus-within:border-blue-500 dark:focus-within:border-blue-500"
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

      <div className="flex flex-col gap-3">
        <div className="relative">
          <div className="wrap-break-word max-h-96 w-full overflow-y-auto">
            <ComposerPrimitive.Input
              placeholder="Ask Aura..."
              className="block min-h-12 w-full resize-none bg-transparent px-3 py-2 text-sm text-[#1f1f1f] outline-none placeholder:text-[#70757a] dark:text-[#e3e3e3] dark:placeholder:text-[#9aa0a6] leading-relaxed"
            />
          </div>
        </div>

        <div className="flex w-full items-center text-[#444746] dark:text-[#c4c7c5] pt-2.5 border-t border-[#dadce0]/25 dark:border-[#2d2f31]/25">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ComposerPrimitive.AddAttachment className="flex size-9.5 items-center justify-center rounded-full transition-all hover:bg-[#444746]/8 active:scale-[0.96] dark:hover:bg-[#c4c7c5]/8">
              <PlusIcon width={20} height={20} />
            </ComposerPrimitive.AddAttachment>
            <span className="text-xs text-muted-foreground opacity-60 font-semibold px-1">Tools</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Thinking / Model Selector Pill matching the photo perfectly */}
            <button className="text-xs text-[#444746] dark:text-[#c4c7c5] font-semibold hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 rounded-full flex items-center gap-1 transition-all">
              <span>Thinking</span>
              <ChevronDown className="size-3.5" />
            </button>
            
            <div className="relative size-9.5 shrink-0">
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center rounded-full transition-all duration-300 ease-out hover:bg-[#444746]/8 group-data-[empty=false]/composer:scale-0 group-data-[running=true]/composer:scale-0 group-data-[empty=false]/composer:opacity-0 group-data-[running=true]/composer:opacity-0 dark:hover:bg-[#c4c7c5]/8"
                aria-label="Voice mode"
              >
                <Mic width={20} height={20} />
              </button>
              <ComposerPrimitive.Send className="absolute inset-0 flex items-center justify-center rounded-full bg-blue-600 text-white transition-all duration-300 ease-out hover:bg-blue-700 group-data-[empty=true]/composer:scale-0 group-data-[running=true]/composer:scale-0 group-data-[empty=true]/composer:opacity-0 group-data-[running=true]/composer:opacity-0 shadow-sm shadow-blue-500/20 active:scale-[0.96]">
                <SendHorizonal width={16} height={16} />
              </ComposerPrimitive.Send>
              <ComposerPrimitive.Cancel className="absolute inset-0 flex items-center justify-center rounded-full bg-[#d3e3fd] text-[#1f1f1f] transition-all duration-300 ease-out hover:bg-[#c2d7fb] group-data-[running=false]/composer:scale-0 group-data-[running=false]/composer:opacity-0 dark:bg-[#1f3760] dark:text-[#e3e3e3] dark:hover:bg-[#2a4a7a]">
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
  "flex size-7 items-center justify-center rounded-full text-[#444746] transition-colors hover:bg-[#444746]/8 dark:text-[#c4c7c5] dark:hover:bg-[#c4c7c5]/8";

const ChatMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group/message relative mx-auto mb-6 flex w-full max-w-3xl flex-col pb-0.5 animate-fade-in">
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
          <div className="max-w-[78%] rounded-[20px] rounded-tr-[4px] bg-[#f0f4f9] px-4.5 py-3 text-sm text-[#1f1f1f] dark:bg-[#282a2c] dark:text-[#e3e3e3] shadow-sm leading-relaxed">
            <div className="prose prose-sm dark:prose-invert wrap-break-word">
              <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
            </div>
          </div>
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.message.role === "assistant"}>
        <div className="flex items-start gap-4">
          <div className="mt-1 size-7 rounded-full bg-gradient-to-tr from-[#4285f4] to-[#9b72cb] flex items-center justify-center text-white shadow-sm shrink-0 overflow-hidden">
            <AuraLogo className="size-5" state="responding" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="prose prose-sm dark:prose-invert wrap-break-word prose-li:my-1 prose-ol:my-1 prose-p:my-2 prose-ul:my-1 text-sm text-[#1f1f1f] dark:text-[#e3e3e3] leading-relaxed">
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
