import { create } from "zustand";

export type TabType = "chats" | "study" | "exams" | "settings" | "help" | "activity" | "profile";

interface Chat {
  id: string;
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
  hobbies: string;
  weakSubjects: string;
  targetGrade: string;
  vocalStyle: string;
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
  addChat: (title: string, preview?: string) => void;
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
}

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

  activeChatId: "3", // default to Exact Image Prompt For AI
  setActiveChatId: (id) => set({ activeChatId: id }),
  chats: [
    { id: "1", title: "Temples Near Waba Campus", preview: "Temples in the area...", time: "Today" },
    { id: "2", title: "Project Ideas for User", preview: "AI projects for student...", time: "Today" },
    { id: "3", title: "Exact Image Prompt For AI", preview: "alight give me picture perfect identical prompt...", time: "Today" },
    { id: "4", title: "Professional broadcast lower third, tr...", preview: "Lower thirds styled graphics...", time: "Yesterday" },
    { id: "5", title: "3D golden text \"AWARD CERAMONY ...", preview: "3D rendering styles...", time: "Yesterday" },
    { id: "6", title: "luxury golden award trophy slightly le...", preview: "Trophy descriptions...", time: "Yesterday" },
    { id: "7", title: "App Development for Award Ceremony", preview: "Designing react app...", time: "2 days ago" },
    { id: "8", title: "Peaceful ocean horizon at sunset, wa...", preview: "Scenic layouts...", time: "2 days ago" },
  ],
  addChat: (title, preview = "No messages yet") =>
    set((state) => {
      const id = Date.now().toString();
      return {
        activeChatId: id,
        chats: [
          {
            id,
            title,
            preview,
            time: "Just now",
          },
          ...state.chats,
        ],
      };
    }),
  deleteChat: (id) =>
    set((state) => {
      const updatedChats = state.chats.filter((c) => c.id !== id);
      return {
        chats: updatedChats,
        activeChatId: updatedChats[0]?.id || "",
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
    hobbies: "",
    weakSubjects: "",
    targetGrade: "Grade 9 - A Pass",
    vocalStyle: "interactive"
  },
  setIntelligenceProfile: (profile) => set({ intelligenceProfile: profile })
}));
