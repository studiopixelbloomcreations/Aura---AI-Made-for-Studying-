import { useEffect, useMemo, useState } from 'react'
import { Gemini } from './components/gemini'
import { Sidebar } from './components/sidebar'
import { AuraLive } from './components/aura-live'
import { StudyCenter } from './components/study-center'
import { ExamCenter } from './components/exam-center'
import { AuraLogo } from './components/icons/aura-logo'
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react"
import { askBackend, API_BASE_URL, getAuraIdentity, type AuraIdentity } from './lib/api'
import { useAppStore } from './store/useAppStore'
import {
  Camera,
  Plus,
  LogOut,
  X,
  PenSquare,
  ChevronDown,
  Gem,
} from 'lucide-react'

type GateStage = "login" | "checking" | "onboarding" | "loading" | "ready";

type BasicAnswers = {
  preferred_name: string;
  grade: string;
  school: string;
  preferred_language: string;
  favorite_subjects: string;
  hard_subjects: string;
  learning_style: string;
  preferred_tone: string;
  main_goal: string;
};

const BASIC_QUESTIONS: Array<{
  id: keyof BasicAnswers;
  label: string;
  kind?: "select";
  options?: string[];
  placeholder?: string;
}> = [
  { id: "preferred_name", label: "What should Aura call you?", placeholder: "Your name" },
  { id: "grade", label: "What grade are you in?", placeholder: "Grade 9" },
  { id: "school", label: "What school do you go to?", placeholder: "School name" },
  { id: "preferred_language", label: "Which language should Aura prefer?", kind: "select", options: ["English", "Sinhala", "English and Sinhala"] },
  { id: "favorite_subjects", label: "Favorite subjects?", placeholder: "Science, ICT, Math" },
  { id: "hard_subjects", label: "Subjects that feel hard right now?", placeholder: "Algebra, chemistry..." },
  { id: "learning_style", label: "How do you learn best?", kind: "select", options: ["Step by step", "Examples first", "Fast and direct", "Quiz me"] },
  { id: "preferred_tone", label: "What kind of Aura should help you?", kind: "select", options: ["Warm and calm", "Energetic", "Strict and focused", "Funny but useful"] },
  { id: "main_goal", label: "What is your main learning goal?", placeholder: "Improve marks, understand science..." },
];

function uniqueIdFromProfile(profile: any) {
  return String(profile?.unique_id || profile?.unique_identifier || profile?.user_config?.unique_id || "").trim();
}

function basicAnswersReady(profile: any) {
  const answers = profile?.personalization_data?.onboarding_answers;
  return !!(answers?.preferred_name && Object.keys(answers || {}).length >= 5);
}

function saveIdentity(identity: AuraIdentity) {
  localStorage.setItem("aura_identity", JSON.stringify(identity));
  localStorage.setItem("aura_email", identity.email || "");
  localStorage.setItem("aura_name", identity.name || "");
  (window as any).Auth = {
    getUser: () => ({
      uid: identity.user_id,
      user_id: identity.user_id,
      email: identity.email,
      name: identity.name,
      photoURL: identity.avatar,
      avatar: identity.avatar,
    }),
  };
}

function profileFileFor(identity: AuraIdentity, profile: any) {
  const safe = String(identity.user_id || identity.email || "user").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return String(profile?.profile_file || profile?.file_name || `${safe}.piuser.json`);
}

async function readProfile(identity: AuraIdentity) {
  const res = await fetch(`${API_BASE_URL}/personal-intelligence/config?user_id=${encodeURIComponent(identity.user_id)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Profile check failed (${res.status})`);
  return data?.profile || data?.data?.profile || null;
}

async function createProfile(identity: AuraIdentity, answers: BasicAnswers) {
  const res = await fetch(`${API_BASE_URL}/personal-intelligence/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity,
      user: identity,
      user_id: identity.user_id,
      email: identity.email,
      name: identity.name,
      avatar: identity.avatar,
      answers,
      onboarding_answers: answers,
      personalization_answers: answers,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(data?.error || `Profile creation failed (${res.status})`);
  return data?.profile || data?.data?.profile || null;
}

async function waitForUniqueProfile(identity: AuraIdentity, seedProfile: any) {
  let profile = seedProfile;
  for (let i = 0; i < 28; i += 1) {
    const uniqueId = uniqueIdFromProfile(profile);
    if (profile && uniqueId) {
      return {
        profile,
        unique_id: uniqueId,
        profile_file: profileFileFor(identity, profile),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    profile = await readProfile(identity).catch(() => null);
  }
  throw new Error("Aura did not receive the unique id/profile file yet.");
}

function loadScriptOnce(src: string, key: string) {
  if ((window as any)[key]) return Promise.resolve(true);
  const existing = document.querySelector(`script[data-aura-loader="${key}"]`) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-aura-loader", key);
    script.addEventListener("load", () => resolve(true), { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });
}

async function ensureFirebaseAuthRuntime() {
  await loadScriptOnce("https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js", "firebase-app");
  await loadScriptOnce("https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js", "firebase-auth");
  await loadScriptOnce("/firebase_config.js", "firebase-runtime-config");
  return (window as any).FirebaseRuntimeConfig?.ensureInitialized?.();
}

export default function App() {
  const [gateStage, setGateStage] = useState<GateStage>("login")
  const [gateIdentity, setGateIdentity] = useState<AuraIdentity | null>(null)
  const [gateError, setGateError] = useState("")
  const [gateStatus, setGateStatus] = useState("Checking your Aura identity...")
  const [basicAnswers, setBasicAnswers] = useState<BasicAnswers>({
    preferred_name: "",
    grade: "Grade 9",
    school: "",
    preferred_language: "English",
    favorite_subjects: "",
    hard_subjects: "",
    learning_style: "Step by step",
    preferred_tone: "Warm and calm",
    main_goal: "",
  })
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const { isTemporaryChat, setTemporaryChat } = useAppStore()
  const {
    activeChatId,
    isLiveOpen,
    activeTab,
  } = useAppStore()
  const identity = gateIdentity || getAuraIdentity()
  const profileInitial = (identity.name || identity.email || "Aura").slice(0, 1).toUpperCase()
  useEffect(() => {
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem("aura_identity") || "null");
      } catch {
        return null;
      }
    })();
    if (stored?.user_id && stored?.email) {
      const identity = { user_id: stored.user_id, email: stored.email, name: stored.name || "Student", avatar: stored.avatar || "" };
      setGateIdentity(identity);
      saveIdentity(identity);
      verifyStrictProfile(identity);
    }
  }, []);

  const skipAsGuest = () => {
    setGateError("");
    const guestId = `guest-${Date.now()}`;
    const guestIdentity: AuraIdentity = {
      user_id: guestId,
      email: `guest@aura.local`,
      name: "Guest Student",
      avatar: "",
    };
    saveIdentity(guestIdentity);
    setGateIdentity(guestIdentity);
    setGateStage("ready");
  };

  const signInWithGoogle = async () => {
    setGateError("");
    setGateStatus("Connecting your Google account...");
    try {
      const runtime = await ensureFirebaseAuthRuntime();
      const firebase = runtime?.firebase || (window as any).firebase;
      const auth = runtime?.auth || firebase?.auth?.();
      if (!firebase || !auth) throw new Error("Firebase auth is not ready. Check /public-config and authorized domains.");
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => undefined);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope("email");
      const result = await auth.signInWithPopup(provider);
      const user = result?.user || auth.currentUser;
      if (!user?.uid || !user?.email) throw new Error("Google did not return account details.");
      const nextIdentity: AuraIdentity = {
        user_id: String(user.uid),
        email: String(user.email || ""),
        name: String(user.displayName || user.email || "Student"),
        avatar: String(user.photoURL || ""),
      };
      saveIdentity(nextIdentity);
      setGateIdentity(nextIdentity);
      await verifyStrictProfile(nextIdentity);
    } catch (error: any) {
      setGateError(error?.message || "Google sign in failed.");
      setGateStage("login");
    }
  };

  const verifyStrictProfile = async (identity: AuraIdentity) => {
    setGateStage("checking");
    setGateStatus("Checking for your unique Aura profile...");
    setGateError("");
    const profile = await readProfile(identity).catch(() => null);
    const uniqueId = uniqueIdFromProfile(profile);
    if (profile && uniqueId && basicAnswersReady(profile)) {
      const strictProfile = await waitForUniqueProfile(identity, profile);
      localStorage.setItem(`aura_onboarding_ready:${identity.user_id}`, JSON.stringify(strictProfile));
      setGateStage("ready");
      return;
    }
    setBasicAnswers((prev) => ({
      ...prev,
      preferred_name: prev.preferred_name || identity.name.split(" ")[0] || "",
    }));
    setGateStage("onboarding");
  };

  const submitBasicOnboarding = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!gateIdentity) return;
    setGateStage("loading");
    setGateStatus("Sending your basic profile through Harmony...");
    setGateError("");
    try {
      const profile = await createProfile(gateIdentity, {
        ...basicAnswers,
        preferred_name: basicAnswers.preferred_name || gateIdentity.name.split(" ")[0] || "Student",
      });
      setGateStatus("Waiting for the actual unique id and LUMEN profile file...");
      const strictProfile = await waitForUniqueProfile(gateIdentity, profile);
      localStorage.setItem(`aura_onboarding_ready:${gateIdentity.user_id}`, JSON.stringify(strictProfile));
      setGateStatus("Your unique Aura intelligence is ready.");
      setGateStage("ready");
    } catch (error: any) {
      setGateError(error?.message || "Aura setup could not finish.");
      setGateStage("onboarding");
    }
  };

  const signOut = async () => {
    try {
      const auth = (window as any).FirebaseRuntimeConfig?.getAuth?.() || (window as any).firebase?.auth?.();
      await auth?.signOut?.();
    } catch {}
    localStorage.removeItem("aura_identity");
    localStorage.removeItem("aura_email");
    localStorage.removeItem("aura_name");
    setGateIdentity(null);
    setGateStage("login");
  };

  const runtime = useLocalRuntime({
    async run({ messages }: any) {
      const lastMessage = messages[messages.length - 1];
      let text = lastMessage?.content?.[0]?.type === "text" ? lastMessage.content[0].text : "";
      
      // Task 10: Handle file uploads
      const attachments = lastMessage.attachments || [];
      if (attachments.length > 0) {
        let fileContext = "";
        for (const attachment of attachments) {
          if (attachment.file) {
            try {
              const formData = new FormData();
              formData.append("file", attachment.file);
              const uploadUrl = API_BASE_URL.replace(/\/$/, '') + '/multimodal/upload_file';
              const uploadRes = await fetch(uploadUrl, {
                method: "POST",
                body: formData,
              });
              if (uploadRes.ok) {
                const data = await uploadRes.json();
                if (data.ok) {
                  fileContext += `\n\n[Attached File: ${data.filename}]\nFile Contents:\n${data.text}\n`;
                }
              }
            } catch (err) {
              console.error("Failed to upload/parse attachment:", attachment.name, err);
            }
          }
        }
      if (fileContext) {
          text = `${text}\n${fileContext}`;
        }
      }

      const store = useAppStore.getState();
      let chatId = store.activeChatId;
      if (!chatId) {
        chatId = store.addChat("New Chat", text.slice(0, 72) || "Ask Aura anything...");
      }
      const compactTitle = text.replace(/\s+/g, " ").trim().slice(0, 46) || "New Chat";
      store.updateChat(chatId, {
        title: compactTitle,
        preview: text.replace(/\s+/g, " ").trim().slice(0, 90) || "Aura conversation",
        time: "Just now",
      });

      const response = await askBackend(text);
      useAppStore.getState().updateChat(chatId, {
        preview: response.replace(/\s+/g, " ").trim().slice(0, 90) || "Aura replied",
        time: "Just now",
      });
      return {
        content: [{ type: "text", text: response }],
      };
    }
  });

  const gateScreen = useMemo(() => {
    if (gateStage === "ready") return null;
    if (gateStage === "login") {
      return (
        <GateShell title="Log in to continue" subtitle="Aura must bind your unique intelligence to your Google account before the UI opens.">
          <button onClick={signInWithGoogle} className="w-full h-12 rounded-full bg-blue-600 text-white font-bold">Continue with Google</button>
          <button onClick={skipAsGuest} className="w-full h-11 rounded-full bg-white/5 text-[#a8c7fa] text-sm font-bold hover:bg-white/10">Continue as Guest</button>
          {gateError && <p className="text-xs text-red-500">{gateError}</p>}
        </GateShell>
      );
    }
    if (gateStage === "checking" || gateStage === "loading") {
      return (
        <GateShell title="Preparing your Aura" subtitle={gateStatus}>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-progress-glow" />
          </div>
          <p className="text-xs text-[#9aa0a6]">This screen will not continue until the unique id and profile file are retrieved.</p>
        </GateShell>
      );
    }
    return (
      <GateShell title="Personalize Aura" subtitle="Answer these once so Harmony can create the first version of your private profile.">
        <form onSubmit={submitBasicOnboarding} className="grid gap-3">
          {BASIC_QUESTIONS.map((question) => (
            <label key={question.id} className="grid gap-1.5 text-xs font-bold text-[#bdc1c6]">
              <span>{question.label}</span>
              {question.kind === "select" ? (
                <select
                  value={basicAnswers[question.id]}
                  onChange={(e) => setBasicAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  className="h-10 rounded-xl border border-[#2d2f31] bg-[#0f0f10] px-3 text-sm text-[#e3e3e3]"
                >
                  {(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  required={question.id === "preferred_name"}
                  value={basicAnswers[question.id]}
                  placeholder={question.placeholder}
                  onChange={(e) => setBasicAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  className="h-10 rounded-xl border border-[#2d2f31] bg-[#0f0f10] px-3 text-sm text-[#e3e3e3]"
                />
              )}
            </label>
          ))}
          <button type="submit" className="mt-2 h-12 rounded-full bg-blue-600 text-white font-bold">Continue</button>
          {gateError && <p className="text-xs text-red-500">{gateError}</p>}
        </form>
      </GateShell>
    );
  }, [gateStage, gateStatus, gateError, basicAnswers, gateIdentity]);

  if (gateScreen) return gateScreen;

  return (
    <div className="h-screen w-full flex bg-black font-sans overflow-hidden relative">
      <AssistantRuntimeProvider runtime={runtime}>
        {/* Collapsible Sidebar — Gemini style */}
        <Sidebar isExpanded={isSidebarExpanded} setIsExpanded={setIsSidebarExpanded} />

        {/* Main Content Area */}
        <div className="flex-1 h-full flex flex-col min-w-0 bg-black relative gemini-gradient-bg">
          
          {/* Gemini-style top bar: model selector left, Upgrade + settings + profile right */}
          <header className="h-[52px] w-full flex items-center justify-between px-4 bg-transparent shrink-0 z-30 select-none">
            {/* Left: Model name dropdown */}
            <button className="flex items-center gap-1 text-[18px] font-normal text-[#c4c7c5] hover:text-[#e3e3e3] transition-colors duration-150">
              <span>Aura</span>
              <ChevronDown className="size-[16px] opacity-60" />
            </button>

            {/* Right: Upgrade + Temp chat toggle + Profile */}
            <div className="flex items-center gap-2">
              {/* Upgrade button — Gemini style */}
              <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#1a2d4c] hover:bg-[#1f3560] text-blue-400 text-[13px] font-medium transition-colors duration-150">
                <Gem className="size-[14px]" />
                <span>Upgrade</span>
              </button>

              {/* Temporary chat toggle icon */}
              <button
                onClick={() => setTemporaryChat(!isTemporaryChat)}
                className={`size-9 flex items-center justify-center rounded-full transition-colors duration-150 ${
                  isTemporaryChat
                    ? "bg-[#1a2d4c] text-blue-400"
                    : "hover:bg-[#393b3d] text-[#c4c7c5]"
                }`}
                title={isTemporaryChat ? "Turn off temporary chat" : "Turn on temporary chat"}
              >
                <PenSquare className="size-[18px]" />
              </button>

              {/* Profile Avatar */}
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="h-8 w-8 aspect-square shrink-0 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white text-[12px] font-bold shadow-md hover:opacity-90 active:scale-95 transition-all overflow-hidden"
              >
                {identity.avatar ? <img src={identity.avatar} alt="" className="h-full w-full object-cover" /> : profileInitial}
              </button>
            </div>
          </header>

          {/* Main Content Area — switches between Chat, Study, Exam */}
          <div className="flex-1 min-h-0">
            {activeTab === "chats" || activeTab === "settings" ? (
              <Gemini key={activeChatId || "empty-chat"} />
            ) : activeTab === "study" ? (
              <StudyCenter />
            ) : activeTab === "exams" ? (
              <ExamCenter />
            ) : (
              <Gemini />
            )}
          </div>
        </div>
      </AssistantRuntimeProvider>

      {/* Google Profile expanded dialog card — Gemini dark style */}
      {isProfileOpen && (
        <div className="absolute inset-0 bg-transparent flex justify-end p-4 z-50 animate-fade-in pointer-events-none">
          <div className="w-[380px] h-[340px] bg-[#1e1f20] border border-[#2d2f31]/50 rounded-[28px] p-5 shadow-2xl space-y-4 pointer-events-auto flex flex-col justify-between mt-12 mr-6 animate-scale-up">
            
            {/* Header: User Email and X close */}
            <div className="flex justify-between items-center text-[#c4c7c5]">
              <span className="text-[12.5px] font-medium tracking-wide">{identity.email}</span>
              <button
                onClick={() => setIsProfileOpen(false)}
                className="size-8 flex items-center justify-center rounded-full hover:bg-white/8 text-[#c4c7c5]"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* Center Profile Section */}
            <div className="flex flex-col items-center text-center space-y-2.5">
              <div className="relative">
                <div className="h-20 w-20 aspect-square rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-purple-500/20 overflow-hidden">
                  {identity.avatar ? <img src={identity.avatar} alt="" className="h-full w-full object-cover" /> : profileInitial}
                </div>
                <button
                  className="absolute bottom-0 right-0 h-[26px] w-[26px] aspect-square bg-[#2b2c2d] border border-[#2d2f31]/70 rounded-full flex items-center justify-center text-[#c4c7c5] shadow-md hover:bg-[#3c4043]"
                  title="Change profile photo"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              <h3 className="text-[17px] font-medium text-[#e3e3e3]">
                Hi, {identity.name || "Student"}!
              </h3>

              <button
                onClick={() => window.open("https://myaccount.google.com/", "_blank", "noopener")}
                className="bg-transparent border border-[#8e918f] hover:bg-white/5 text-[#a8c7fa] font-bold text-xs py-2 px-6 rounded-full transition-all"
              >
                Manage your Google Account
              </button>
            </div>

            {/* Add account / Sign out capsule container */}
            <div className="bg-[#0e0e0e] rounded-2xl flex border border-[#2d2f31]/50 overflow-hidden shadow-sm">
              <button onClick={signInWithGoogle} className="hover:bg-white/5 flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-r border-[#2d2f31]/50 text-[#c4c7c5]">
                <Plus className="size-4 text-[#c4c7c5]" />
                <span>Add account</span>
              </button>
              <button onClick={signOut} className="hover:bg-white/5 flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 text-[#c4c7c5]">
                <LogOut className="size-4 text-[#c4c7c5]" />
                <span>Sign out</span>
              </button>
            </div>

            {/* Footer Terms */}
            <div className="text-[11px] text-[#8e918f] text-center select-none">
              Privacy Policy • Terms of Service
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN Aura LIVE INTERACTIVE OVERLAY */}
      {isLiveOpen && <AuraLive />}
    </div>
  )
}

function GateShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-[#e3e3e3] flex items-center justify-center p-5">
      <div className="w-full max-w-[560px] rounded-[28px] border border-[#2d2f31] bg-[#1e1f20] shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <AuraLogo className="size-9" />
          <div>
            <h1 className="text-xl font-bold text-[#e3e3e3]">{title}</h1>
            <p className="text-sm text-[#9aa0a6] leading-6">{subtitle}</p>
          </div>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}
