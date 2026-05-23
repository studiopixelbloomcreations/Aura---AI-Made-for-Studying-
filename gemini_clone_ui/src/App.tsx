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
  Sparkles,
  Share2,
  MoreVertical,
  Folder,
  Pin,
  Pencil,
  Trash2,
  Shield,
  ShieldCheck,
  Camera,
  Plus,
  LogOut,
  X,
  LayoutGrid
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shared/dropdown-menu"

type GateStage = "landing" | "login" | "checking" | "onboarding" | "loading" | "ready";

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
  await loadScriptOnce("/firebase_runtime_config.js", "firebase-runtime-config");
  return (window as any).FirebaseRuntimeConfig?.ensureInitialized?.();
}

export default function App() {
  const [gateStage, setGateStage] = useState<GateStage>("landing")
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
  const {
    chats,
    activeChatId,
    deleteChat,
    isTemporaryChat,
    setTemporaryChat,
    isLiveOpen,
    activeTab,
    setActiveTab,
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

  const launchLogin = async () => {
    setGateError("");
    setGateStage("login");
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
    setGateStage("landing");
  };

  // Find active chat details
  const activeChat = chats.find(c => c.id === activeChatId) || { id: "New Chat", title: "New Chat", preview: "", time: "" }
  
  // Decide whether a chat is active or not (we can check if it is "New Chat" or has started)
  const isChatStarted = activeChat.id !== "New Chat" && activeChat.title !== "New Chat"

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

      const response = await askBackend(text);
      return {
        content: [{ type: "text", text: response }],
      };
    }
  });

  const handleDeleteActiveChat = () => {
    if (activeChat.id) {
      deleteChat(activeChat.id);
    }
  };

  // Determine the view title for header based on activeTab
  const getHeaderTitle = () => {
    switch (activeTab) {
      case "study": return "Study Center";
      case "exams": return "Exam Center";
      case "settings": return "";
      case "help": return "";
      default: return isChatStarted ? activeChat.title : "";
    }
  };

  const gateScreen = useMemo(() => {
    if (gateStage === "ready") return null;
    if (gateStage === "landing") {
      return (
        <div className="min-h-screen bg-white dark:bg-[#0e0e0f] text-[#1f1f1f] dark:text-[#e3e3e3] flex flex-col">
          <header className="h-16 px-6 flex items-center justify-between border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <AuraLogo className="size-8" />
              <span className="text-xl font-semibold">Aura</span>
            </div>
            <button onClick={launchLogin} className="h-10 px-5 rounded-full bg-[#d3e3fd] text-[#0b57d0] text-sm font-bold">Log in</button>
          </header>
          <main className="flex-1 flex items-center px-6 py-12">
            <div className="mx-auto max-w-5xl grid md:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950/30 px-4 py-2 text-xs font-bold text-blue-600 dark:text-blue-300">
                  <Sparkles className="size-4" /> Grade 9 Personal Intelligence
                </div>
                <h1 className="text-5xl md:text-7xl font-medium tracking-tight leading-none bg-gradient-to-r from-[#4285f4] via-[#9b72cb] to-[#d96570] text-transparent bg-clip-text">
                  Aura AI
                </h1>
                <p className="text-lg text-[#5f6368] dark:text-[#bdc1c6] leading-8 max-w-2xl">
                  A personal study AI that remembers your learning style, routes every answer through Harmony, and builds a private intelligence profile for your Google account.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={launchLogin} className="h-12 px-6 rounded-full bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/20">
                    Start with Google
                  </button>
                  <button onClick={launchLogin} className="h-12 px-6 rounded-full border border-[#dadce0] dark:border-[#2d2f31] font-bold">
                    Continue to Aura
                  </button>
                </div>
              </div>
              <div className="rounded-[28px] border border-[#dadce0]/70 dark:border-[#2d2f31] bg-[#f8fafd] dark:bg-[#1e1f20] p-6 shadow-2xl">
                <img src="/aura-logo.png" alt="Aura AI" className="w-full rounded-2xl object-contain bg-white/60 dark:bg-black/20 p-8" />
              </div>
            </div>
          </main>
        </div>
      );
    }
    if (gateStage === "login") {
      return (
        <GateShell title="Log in to continue" subtitle="Aura must bind your unique intelligence to your Google account before the UI opens.">
          <button onClick={signInWithGoogle} className="w-full h-12 rounded-full bg-blue-600 text-white font-bold">Continue with Google</button>
          <button onClick={() => setGateStage("landing")} className="w-full h-11 rounded-full border border-[#dadce0] dark:border-[#2d2f31] text-sm font-bold">Back</button>
          {gateError && <p className="text-xs text-red-500">{gateError}</p>}
        </GateShell>
      );
    }
    if (gateStage === "checking" || gateStage === "loading") {
      return (
        <GateShell title="Preparing your Aura" subtitle={gateStatus}>
          <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-progress-glow" />
          </div>
          <p className="text-xs text-[#70757a] dark:text-[#9aa0a6]">This screen will not continue until the unique id and profile file are retrieved.</p>
        </GateShell>
      );
    }
    return (
      <GateShell title="Personalize Aura" subtitle="Answer these once so Harmony can create the first version of your private profile.">
        <form onSubmit={submitBasicOnboarding} className="grid gap-3">
          {BASIC_QUESTIONS.map((question) => (
            <label key={question.id} className="grid gap-1.5 text-xs font-bold text-[#5f6368] dark:text-[#bdc1c6]">
              <span>{question.label}</span>
              {question.kind === "select" ? (
                <select
                  value={basicAnswers[question.id]}
                  onChange={(e) => setBasicAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  className="h-10 rounded-xl border border-[#dadce0] dark:border-[#2d2f31] bg-[#f8fafd] dark:bg-[#0f0f10] px-3 text-sm text-foreground"
                >
                  {(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  required={question.id === "preferred_name"}
                  value={basicAnswers[question.id]}
                  placeholder={question.placeholder}
                  onChange={(e) => setBasicAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  className="h-10 rounded-xl border border-[#dadce0] dark:border-[#2d2f31] bg-[#f8fafd] dark:bg-[#0f0f10] px-3 text-sm text-foreground"
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
    <div className="h-screen w-full flex bg-white dark:bg-[#0e0e0f] font-sans overflow-hidden relative">
      <AssistantRuntimeProvider runtime={runtime}>
        {/* Collapsible Sidebar */}
        <Sidebar isExpanded={isSidebarExpanded} setIsExpanded={setIsSidebarExpanded} />

        {/* Integrated Chat Canvas */}
        <div className="flex-1 h-full flex flex-col min-w-0 bg-white dark:bg-[#0e0e0f] relative">
          
          {/* Combined App Header (Seamless background, fixed logos) */}
          <header className="h-[56px] w-full flex items-center justify-between px-6 bg-transparent shrink-0 z-30 select-none">
            {/* Left Header: Fixed Logo word "Aura" immediately next to the sidebar strip */}
            <div className="flex items-center gap-1.5 min-w-[120px]">
              <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveTab("chats")}>
                <AuraLogo className="size-7" />
                <span className="text-[20px] tracking-tight text-[#1f1f1f] dark:text-white font-medium select-none">Aura</span>
                <Sparkles className="size-4 text-blue-600 animate-pulse mt-0.5" />
              </div>
            </div>

            {/* Center Header: Active Chat Name or Feature Tab Title */}
            <div className="text-sm font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] truncate max-w-[280px] md:max-w-[400px]">
              {getHeaderTitle()}
            </div>

            {/* Right Header: Upgrade, Temporary Chat, Share, Three Dots, Profile */}
            <div className="flex items-center gap-2.5">
              {/* Upgrade Button */}
              <button className="h-9 px-4 rounded-full bg-[#d3e3fd] hover:bg-[#c2d7fb] text-[#0b57d0] text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 active:scale-95">
                <Sparkles className="size-3.5" />
                <span>Upgrade</span>
              </button>

              {/* DYNAMIC: Conditional temporary chat or active chat indicators */}
              {activeTab === "chats" && !isChatStarted ? (
                /* Temporary Chat toggle shown next to Upgrade when in a empty / new chat */
                <button
                  onClick={() => setTemporaryChat(!isTemporaryChat)}
                  className={`h-9 px-3 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95 ${
                    isTemporaryChat
                      ? "bg-amber-50 border-amber-300 text-amber-600 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400"
                      : "bg-transparent border-[#dadce0] hover:bg-black/5 text-[#444746] dark:border-[#2d2f31] dark:text-[#c4c7c5]"
                  }`}
                  title="Toggle Temporary Chat Mode"
                >
                  {isTemporaryChat ? <ShieldCheck className="size-4" /> : <Shield className="size-4 opacity-75" />}
                  <span>{isTemporaryChat ? "Temporary chat (On)" : "Temporary chat"}</span>
                </button>
              ) : activeTab === "chats" && isChatStarted ? (
                /* Share & Three Dots shown ONLY when chat has started or past chat selected */
                <div className="flex items-center gap-1.5 animate-fade-in">
                  {/* Share Icon */}
                  <button className="size-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] transition-all">
                    <Share2 className="size-4 opacity-80" />
                  </button>

                  {/* Three Dots dropdown menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="size-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] transition-all">
                      <MoreVertical className="size-4 opacity-80" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48 rounded-xl shadow-xl border border-[#dadce0] dark:border-[#2d2f31] p-1.5 bg-white dark:bg-[#1e1f20] z-50">
                      <DropdownMenuItem className="flex items-center gap-2.5 text-xs font-semibold hover:bg-[#f1f3f4] dark:hover:bg-[#2d2f31] rounded-lg px-3 py-2 cursor-default transition-all">
                        <Folder className="size-4 text-muted-foreground" />
                        <span>Files in this chat</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="flex items-center gap-2.5 text-xs font-semibold hover:bg-[#f1f3f4] dark:hover:bg-[#2d2f31] rounded-lg px-3 py-2 cursor-default transition-all">
                        <Pin className="size-4 text-muted-foreground" />
                        <span>Pin</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="flex items-center gap-2.5 text-xs font-semibold hover:bg-[#f1f3f4] dark:hover:bg-[#2d2f31] rounded-lg px-3 py-2 cursor-default transition-all">
                        <Pencil className="size-4 text-muted-foreground" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={handleDeleteActiveChat}
                        className="flex items-center gap-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg px-3 py-2 cursor-default transition-all"
                      >
                        <Trash2 className="size-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}

              {/* Layout grid utility icon */}
              <button className="size-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]">
                <LayoutGrid className="size-4 opacity-80" />
              </button>

              {/* Profile Avatar trigger */}
              <button
                onClick={() => setIsProfileOpen(true)}
                className="h-9 w-9 aspect-square shrink-0 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white text-[13px] font-bold shadow-md shadow-purple-500/10 hover:opacity-90 active:scale-95 transition-all overflow-hidden"
              >
                {identity.avatar ? <img src={identity.avatar} alt="" className="h-full w-full object-cover" /> : profileInitial}
              </button>
            </div>
          </header>

          {/* Main Content Area — switches between Chat, Study, Exam */}
          <div className="flex-1 min-h-0">
            {activeTab === "chats" || activeTab === "settings" ? (
              <Gemini />
            ) : activeTab === "study" ? (
              <StudyCenter />
            ) : activeTab === "exams" ? (
              <ExamCenter />
            ) : (
              /* Default fallback for help/other tabs */
              <Gemini />
            )}
          </div>
        </div>
      </AssistantRuntimeProvider>

      {/* Spectacular Google Profile expanded dialog card cloned exactly from screenshot 2 */}
      {isProfileOpen && (
        <div className="absolute inset-0 bg-transparent flex justify-end p-4 z-50 animate-fade-in pointer-events-none">
          <div className="w-[380px] h-[340px] bg-[#e9eef6] dark:bg-[#1a1b1f] border border-[#dadce0]/50 dark:border-[#2d2f31]/50 rounded-[28px] p-5 shadow-2xl space-y-4 pointer-events-auto flex flex-col justify-between mt-12 mr-6 animate-scale-up">
            
            {/* Header: User Email and X close */}
            <div className="flex justify-between items-center text-[#444746] dark:text-[#c4c7c5]">
              <span className="text-[12.5px] font-medium tracking-wide">{identity.email}</span>
              <button
                onClick={() => setIsProfileOpen(false)}
                className="size-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* Center Profile Section */}
            <div className="flex flex-col items-center text-center space-y-2.5">
              {/* Large circular avatar with camera change icon */}
              <div className="relative">
                <div className="h-20 w-20 aspect-square rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-purple-500/20 overflow-hidden">
                  {identity.avatar ? <img src={identity.avatar} alt="" className="h-full w-full object-cover" /> : profileInitial}
                </div>
                <button
                  className="absolute bottom-0 right-0 h-[26px] w-[26px] aspect-square bg-white dark:bg-[#1e1f20] border border-[#dadce0]/70 dark:border-[#2d2f31]/70 rounded-full flex items-center justify-center text-[#444746] dark:text-[#c4c7c5] shadow-md hover:bg-[#f1f3f4]"
                  title="Change profile photo"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Greeting */}
              <h3 className="text-[17px] font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">
                Hi, {identity.name || "Student"}!
              </h3>

              {/* Manage Aura Account button */}
              <button
                onClick={() => window.open("https://myaccount.google.com/", "_blank", "noopener")}
                className="bg-transparent border border-[#747775] hover:bg-[#0b57d0]/5 dark:border-[#8e918f] dark:hover:bg-white/5 text-[#0b57d0] dark:text-blue-400 font-bold text-xs py-2 px-6 rounded-full transition-all"
              >
                Manage your Google Account
              </button>
            </div>

            {/* Add account / Sign out capsule container */}
            <div className="bg-white dark:bg-[#1e1f20] rounded-2xl flex border border-[#dadce0]/50 dark:border-[#2d2f31]/50 overflow-hidden shadow-sm">
              <button onClick={signInWithGoogle} className="hover:bg-black/5 dark:hover:bg-white/5 flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-r border-[#dadce0]/50 dark:border-[#2d2f31]/50 text-[#444746] dark:text-[#c4c7c5]">
                <Plus className="size-4 text-muted-foreground" />
                <span>Add account</span>
              </button>
              <button onClick={signOut} className="hover:bg-black/5 dark:hover:bg-white/5 flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 text-[#444746] dark:text-[#c4c7c5]">
                <LogOut className="size-4 text-muted-foreground" />
                <span>Sign out</span>
              </button>
            </div>

            {/* Footer Terms */}
            <div className="text-[11px] text-[#747775] dark:text-[#8e918f] text-center select-none">
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
    <div className="min-h-screen bg-white dark:bg-[#0e0e0f] text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-center p-5">
      <div className="w-full max-w-[560px] rounded-[28px] border border-[#dadce0]/70 dark:border-[#2d2f31] bg-white dark:bg-[#1e1f20] shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <AuraLogo className="size-9" />
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-[#70757a] dark:text-[#9aa0a6] leading-6">{subtitle}</p>
          </div>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}
