import { useState } from 'react'
import { Gemini } from './components/gemini'
import { Sidebar } from './components/sidebar'
import { AuraLive } from './components/aura-live'
import { StudyCenter } from './components/study-center'
import { ExamCenter } from './components/exam-center'
import { AuraLogo } from './components/icons/aura-logo'
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react"
import { askBackend, API_BASE_URL } from './lib/api'
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

export default function App() {
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
                className="size-8.5 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white text-[13px] font-bold shadow-md shadow-purple-500/10 hover:opacity-90 active:scale-95 transition-all"
              >
                A
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
              <span className="text-[12.5px] font-medium tracking-wide">studiopixelbloomcreations@gmail.com</span>
              <button
                onClick={() => setIsProfileOpen(false)}
                className="size-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]"
              >
                <X className="size-4.5" />
              </button>
            </div>

            {/* Center Profile Section */}
            <div className="flex flex-col items-center text-center space-y-2.5">
              {/* Large circular avatar with camera change icon */}
              <div className="relative">
                <div className="size-20 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-purple-500/20">
                  A
                </div>
                <button
                  className="absolute bottom-0 right-0 size-6.5 bg-white dark:bg-[#1e1f20] border border-[#dadce0]/70 dark:border-[#2d2f31]/70 rounded-full flex items-center justify-center text-[#444746] dark:text-[#c4c7c5] shadow-md hover:bg-[#f1f3f4]"
                  title="Change profile photo"
                >
                  <Camera className="size-3.5" />
                </button>
              </div>

              {/* Greeting */}
              <h3 className="text-[17px] font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">
                Hi, Studio Pixel!
              </h3>

              {/* Manage Aura Account button */}
              <button className="bg-transparent border border-[#747775] hover:bg-[#0b57d0]/5 dark:border-[#8e918f] dark:hover:bg-white/5 text-[#0b57d0] dark:text-blue-400 font-bold text-xs py-2 px-6 rounded-full transition-all">
                Manage your Google Account
              </button>
            </div>

            {/* Add account / Sign out capsule container */}
            <div className="bg-white dark:bg-[#1e1f20] rounded-2xl flex border border-[#dadce0]/50 dark:border-[#2d2f31]/50 overflow-hidden shadow-sm">
              <button className="hover:bg-black/5 dark:hover:bg-white/5 flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-r border-[#dadce0]/50 dark:border-[#2d2f31]/50 text-[#444746] dark:text-[#c4c7c5]">
                <Plus className="size-4 text-muted-foreground" />
                <span>Add account</span>
              </button>
              <button className="hover:bg-black/5 dark:hover:bg-white/5 flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 text-[#444746] dark:text-[#c4c7c5]">
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
