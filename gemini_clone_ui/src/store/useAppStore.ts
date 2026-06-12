import { create } from "zustand";

export type TabType = "chats" | "study" | "exams" | "settings" | "help" | "activity" | "profile";

interface Chat {
  id: string;
  title: string;
  preview: string;
  time: string;
}

interface LiveAgent {
  id: string;
  name: string;
  status: "active" | "idle" | "ended";
  createdAt: string;
}

interface LiveAgentChat {
  id: string;
  agentId: string;
  title: string;
  preview: string;
  time: string;
}

export interface SubjectMastery {
  subject: string;
  readiness: number; // percentage (0-100)
  syllabusCompletion: number; // percentage (0-100)
  weakAreas: string[];
}

export interface IntelligenceProfile {
  agentName: string;
  preferredName: string;
  hobbies: string;
  interests: string;
  weakSubjects: string;
  strongSubjects: string;
  targetGrade: string;
  vocalStyle: string;
  energyLevel: string;
  correctionStyle: string;
  motivationStyle: string;
  memoryPriorities: string;
  boundaries: string;
}

interface AppState {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  language: "English" | "Sinhala";
  setLanguage: (lang: "English" | "Sinhala") => void;
  subject: string;
  setSubject: (sub: string) => void;
  
  // Learning Analytics & Readiness Metrics (Replaces Gamification)
  readinessScore: number; // overall syllabus readiness (e.g. 78)
  weeklyStudyHours: number; // hours studied this week (e.g. 14.5)
  syllabusCompletion: number; // total syllabus completion % (e.g. 62)
  subjectMastery: SubjectMastery[];
  updateMastery: (subject: string, correct: boolean) => void;

  chats: Chat[];
  activeChatId: string;
  setActiveChatId: (id: string) => void;
  addChat: (title: string, preview?: string) => string;
  updateChat: (id: string, patch: Partial<Omit<Chat, "id">>) => void;
  deleteChat: (id: string) => void;
  
  // Personalization Systems (10 Premium Keys)
  teachingStyle: "storyteller" | "socratic" | "analogy" | "strict";
  setTeachingStyle: (val: "storyteller" | "socratic" | "analogy" | "strict") => void;
  responseLength: "concise" | "balanced" | "detailed";
  setResponseLength: (val: "concise" | "balanced" | "detailed") => void;
  difficultyLevel: number; // 1 to 5
  setDifficultyLevel: (val: number) => void;
  toneAdjustment: "encouraging" | "analytical" | "casual" | "academic";
  setToneAdjustment: (val: "encouraging" | "analytical" | "casual" | "academic") => void;
  memoryPreference: "deep" | "session-only" | "disabled";
  setMemoryPreference: (val: "deep" | "session-only" | "disabled") => void;
  learningSpeed: "slow" | "normal" | "fast";
  setLearningSpeed: (val: "slow" | "normal" | "fast") => void;

  chatbotVoice: string;
  setChatbotVoice: (voice: string) => void;
  piVoice: string;
  setPiVoice: (voice: string) => void;
  chatbotModel: string;
  setChatbotModel: (model: string) => void;
  piModel: string;
  setPiModel: (model: string) => void;
  
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  
  // Temporary chat state
  isTemporaryChat: boolean;
  setTemporaryChat: (val: boolean) => void;

  // Aura Live - Custom Personal Intelligence States
  intelligenceCreated: boolean;
  setIntelligenceCreated: (val: boolean) => void;
  isPersonalizing: boolean;
  setIsPersonalizing: (val: boolean) => void;
  isInitializing: boolean;
  setIsInitializing: (val: boolean) => void;
  isLiveOpen: boolean;
  setIsLiveOpen: (val: boolean) => void;
  intelligenceProfile: IntelligenceProfile;
  setIntelligenceProfile: (profile: IntelligenceProfile) => void;

  // Aura Live Agents
  liveAgents: LiveAgent[];
  addLiveAgent: (name: string) => string;
  activeAgentId: string;
  setActiveAgentId: (id: string) => void;
  liveAgentChats: LiveAgentChat[];
  addLiveAgentChat: (agentId: string, title: string, preview?: string) => string;
}

function loadChats(): { chats: Chat[]; activeChatId: string } {
  try {
    const chats = JSON.parse(localStorage.getItem("aura_chats") || "[]");
    const activeChatId = String(localStorage.getItem("aura_active_chat") || "");
    return { chats: Array.isArray(chats) ? chats : [], activeChatId };
  } catch {
    return { chats: [], activeChatId: "" };
  }
}

function saveChats(chats: Chat[], activeChatId: string) {
  try {
    localStorage.setItem("aura_chats", JSON.stringify(chats.slice(0, 40)));
    localStorage.setItem("aura_active_chat", activeChatId || "");
  } catch {}
}

const storedChats = loadChats();

export const useAppStore = create<AppState>((set) => ({
  activeTab: "chats",
  setActiveTab: (tab) => set({ activeTab: tab }),
  language: "English",
  setLanguage: (lang) => set({ language: lang }),
  subject: "General",
  setSubject: (sub) => set({ subject: sub }),
  
  // Learning Analytics & Readiness Initial States
  readinessScore: 78,
  weeklyStudyHours: 14.5,
  syllabusCompletion: 62,
  subjectMastery: [
    { subject: "Math", readiness: 82, syllabusCompletion: 68, weakAreas: ["Algebra Geometry", "Quadratic equations"] },
    { subject: "Science", readiness: 68, syllabusCompletion: 55, weakAreas: ["Chemical equilibrium", "Newtonian forces"] },
    { subject: "History", readiness: 90, syllabusCompletion: 80, weakAreas: ["Kandyan Kingdom treaties"] },
    { subject: "English", readiness: 74, syllabusCompletion: 60, weakAreas: ["Passive voice construction"] },
    { subject: "Sinhala", readiness: 85, syllabusCompletion: 70, weakAreas: ["Liyana Basha spelling"] },
  ],
  updateMastery: (subName, correct) =>
    set((state) => {
      const updated = state.subjectMastery.map((sm) => {
        if (sm.subject.toLowerCase() === subName.toLowerCase()) {
          const delta = correct ? 2 : -1;
          const newReadiness = Math.max(0, Math.min(100, sm.readiness + delta));
          return { ...sm, readiness: newReadiness };
        }
        return sm;
      });
      // Recalculate overall readiness score
      const totalReadiness = updated.reduce((acc, curr) => acc + curr.readiness, 0);
      const avgReadiness = Math.round(totalReadiness / updated.length);

      return {
        subjectMastery: updated,
        readinessScore: avgReadiness,
      };
    }),

  activeChatId: storedChats.activeChatId,
  setActiveChatId: (id) => set((state) => {
    saveChats(state.chats, id);
    return { activeChatId: id };
  }),
  chats: storedChats.chats,
  addChat: (title, preview = "No messages yet") =>
    {
      const id = Date.now().toString();
      set((state) => {
        const chats = [
          {
            id,
            title,
            preview,
            time: "Just now",
          },
          ...state.chats,
        ];
        saveChats(chats, id);
        return {
          activeChatId: id,
          chats,
        };
      });
      return id;
    },
  updateChat: (id, patch) =>
    set((state) => {
      const chats = state.chats.map((chat) => chat.id === id ? { ...chat, ...patch } : chat);
      saveChats(chats, state.activeChatId);
      return { chats };
    }),
  deleteChat: (id) =>
    set((state) => {
      const updatedChats = state.chats.filter((c) => c.id !== id);
      const activeChatId = updatedChats[0]?.id || "";
      saveChats(updatedChats, activeChatId);
      return {
        chats: updatedChats,
        activeChatId,
      };
    }),
  
  // Personalization 10 Premium Keys Defaults
  teachingStyle: "socratic",
  setTeachingStyle: (val) => set({ teachingStyle: val }),
  responseLength: "balanced",
  setResponseLength: (val) => set({ responseLength: val }),
  difficultyLevel: 3,
  setDifficultyLevel: (val) => set({ difficultyLevel: val }),
  toneAdjustment: "encouraging",
  setToneAdjustment: (val) => set({ toneAdjustment: val }),
  memoryPreference: "deep",
  setMemoryPreference: (val) => set({ memoryPreference: val }),
  learningSpeed: "normal",
  setLearningSpeed: (val) => set({ learningSpeed: val }),

  chatbotVoice: "Google US English (Female)",
  setChatbotVoice: (voice) => set({ chatbotVoice: voice }),
  piVoice: "Google UK English (Male)",
  setPiVoice: (voice) => set({ piVoice: voice }),
  chatbotModel: "thinking",
  setChatbotModel: (model) => set({ chatbotModel: model }),
  piModel: "pi_dynamic",
  setPiModel: (model) => set({ piModel: model }),
  
  theme: "light",
  setTheme: (theme) => {
    set({ theme });
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (systemDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  },
  
  // Temporary chat state
  isTemporaryChat: false,
  setTemporaryChat: (val) => set({ isTemporaryChat: val }),

  // Aura Live Custom Personalization States
  intelligenceCreated: false,
  setIntelligenceCreated: (val) => set({ intelligenceCreated: val }),
  isPersonalizing: false,
  setIsPersonalizing: (val) => set({ isPersonalizing: val }),
  isInitializing: false,
  setIsInitializing: (val) => set({ isInitializing: val }),
  isLiveOpen: false,
  setIsLiveOpen: (val) => set({ isLiveOpen: val }),
  intelligenceProfile: {
    agentName: "",
    preferredName: "",
    hobbies: "",
    interests: "",
    weakSubjects: "",
    strongSubjects: "",
    targetGrade: "Grade 9 - A Pass",
    vocalStyle: "interactive",
    energyLevel: "balanced",
    correctionStyle: "kind-direct",
    motivationStyle: "steady",
    memoryPriorities: "",
    boundaries: ""
  },
  setIntelligenceProfile: (profile) => set({ intelligenceProfile: profile }),

  // Aura Live Agents
  liveAgents: [],
  addLiveAgent: (name) => {
    const id = `agent-${Date.now()}`;
    set((state) => ({
      liveAgents: [
        { id, name, status: "idle" as const, createdAt: new Date().toISOString() },
        ...state.liveAgents,
      ],
    }));
    return id;
  },
  activeAgentId: "",
  setActiveAgentId: (id) => set({ activeAgentId: id }),
  liveAgentChats: [],
  addLiveAgentChat: (agentId, title, preview = "No messages yet") => {
    const id = `agent-chat-${Date.now()}`;
    set((state) => ({
      liveAgentChats: [
        { id, agentId, title, preview, time: "Just now" },
        ...state.liveAgentChats,
      ],
    }));
    return id;
  },
}));
