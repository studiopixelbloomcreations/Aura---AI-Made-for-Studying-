import React from "react";
import { useAppStore } from "../store/useAppStore";
import {
  Menu,
  Search,
  Plus,
  MessageSquare,
  ChevronRight,
  Settings as SettingsIcon,
  Sparkles,
  PenSquare,
  Volume2,
  BookOpen,
  ClipboardCheck,
  HelpCircle,
} from "lucide-react";

interface SidebarProps {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isExpanded, setIsExpanded }) => {
  const {
    chats,
    addChat,
    activeTab,
    setActiveTab,
    activeChatId,
    setActiveChatId,
    intelligenceCreated,
    setIsPersonalizing,
    setIsLiveOpen
  } = useAppStore();

  const handleNewChat = () => {
    addChat("New Chat", "Ask Aura anything...");
    setActiveTab("chats");
  };

  const handleIntelligenceClick = () => {
    if (intelligenceCreated) {
      setIsLiveOpen(true);
    } else {
      setIsPersonalizing(true);
    }
  };

  return (
    <aside
      className={`h-full flex flex-col justify-between bg-[#f0f4f9] dark:bg-[#0f0f10] py-4 transition-all duration-300 ease-in-out shrink-0 select-none border-r border-[#dadce0]/20 dark:border-[#2d2f31]/20 ${
        isExpanded ? "w-[260px] px-3.5" : "w-[68px] px-2 items-center"
      }`}
    >
      {/* Top Section */}
      <div className="space-y-4 w-full flex flex-col items-stretch pt-0.5 min-h-0">
        
        {/* Toggle Hamburger & Search Row */}
        {isExpanded ? (
          <div className="flex items-center justify-between px-1 mb-1">
            <button
              onClick={() => setIsExpanded(false)}
              className="size-10 flex items-center justify-center rounded-full hover:bg-[#e3e3e3]/75 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] transition-all"
            >
              <Menu className="size-[20px]" />
            </button>
            <button
              className="size-10 flex items-center justify-center rounded-full hover:bg-[#e3e3e3]/75 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] transition-all"
              title="Search"
            >
              <Search className="size-[18px] opacity-80" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setIsExpanded(true)}
              className="size-11 flex items-center justify-center rounded-full hover:bg-[#e3e3e3]/75 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] transition-all"
              title="Expand menu"
            >
              <Menu className="size-[20px]" />
            </button>
            <button
              onClick={() => setIsExpanded(true)}
              className="size-11 flex items-center justify-center rounded-full hover:bg-[#e3e3e3]/75 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] transition-all"
              title="Search"
            >
              <Search className="size-[18px] opacity-80" />
            </button>
          </div>
        )}

        {/* New chat / My stuff Row */}
        {isExpanded ? (
          <div className="space-y-0.5 px-0.5">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center gap-3.5 hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#1f1f1f] dark:text-[#c4c7c5] text-[13px] font-medium py-3 px-4.5 rounded-full transition-all text-left"
            >
              <PenSquare className="size-[18px] text-[#444746] dark:text-[#c4c7c5] shrink-0" />
              <span>New chat</span>
            </button>
            <button
              className="w-full flex items-center gap-3.5 hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#1f1f1f] dark:text-[#c4c7c5] text-[13px] font-medium py-3 px-4.5 rounded-full transition-all text-left"
            >
              <Sparkles className="size-[18px] text-[#444746] dark:text-[#c4c7c5] shrink-0" />
              <span>My stuff</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 pt-1.5">
            <button
              onClick={handleNewChat}
              className="size-11 flex items-center justify-center bg-white hover:bg-[#f1f3f4] dark:bg-[#1e1f20] dark:hover:bg-[#2b2c2d] text-[#444746] dark:text-[#c4c7c5] rounded-full transition-all shadow-sm"
              title="New chat"
            >
              <PenSquare className="size-5" />
            </button>
          </div>
        )}

        {/* Collapsible details like Notebooks, Gems, Study, Exam, Chats */}
        {isExpanded && (
          <div className="flex-1 overflow-y-auto pr-0.5 space-y-4 pt-2 max-h-[380px] scrollbar-thin">
            
            {/* Aura Live (Formerly Notebooks) row */}
            <div className="space-y-1">
              <div className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-bold text-[#1f1f1f] dark:text-[#c4c7c5]">
                <span>Aura Live</span>
                <ChevronRight className="size-4 opacity-75" />
              </div>
              <button
                onClick={handleIntelligenceClick}
                className="w-full flex items-center gap-3 px-7 py-2 rounded-xl text-left text-[12.5px] font-semibold text-[#0b57d0] dark:text-blue-400 hover:bg-[#e3e3e3]/50 dark:hover:bg-white/5 transition-all"
              >
                {intelligenceCreated ? (
                  <>
                    <Volume2 className="size-4 animate-bounce text-emerald-500" />
                    <span>Open Aura Live</span>
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse ml-auto mr-1" />
                  </>
                ) : (
                  <>
                    <Plus className="size-4" />
                    <span>Create Your Intelligence</span>
                  </>
                )}
              </button>
            </div>

            {/* Study Center Tab */}
            <div>
              <button
                onClick={() => setActiveTab("study")}
                className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-full text-[13px] font-semibold transition-all text-left ${
                  activeTab === "study"
                    ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c] text-blue-600 dark:text-blue-400"
                    : "hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]"
                }`}
              >
                <BookOpen className="size-[18px] opacity-80 shrink-0" />
                <span>Study Center</span>
              </button>
            </div>

            {/* Exam Center Tab */}
            <div>
              <button
                onClick={() => setActiveTab("exams")}
                className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-full text-[13px] font-semibold transition-all text-left ${
                  activeTab === "exams"
                    ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c] text-blue-600 dark:text-blue-400"
                    : "hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]"
                }`}
              >
                <ClipboardCheck className="size-[18px] opacity-80 shrink-0" />
                <span>Exam Center</span>
              </button>
            </div>

            {/* Gems row */}
            <div>
              <button className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#e3e3e3]/50 dark:hover:bg-white/5 rounded-xl text-[13px] font-bold text-[#1f1f1f] dark:text-[#c4c7c5] transition-all">
                <span>Gems</span>
                <ChevronRight className="size-4 opacity-75" />
              </button>
            </div>

            {/* Recent chats list */}
            {chats.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[12px] font-bold text-[#1f1f1f] dark:text-[#c4c7c5] px-4 pb-1">
                  Chats
                </div>
                <div className="space-y-0.5">
                  {chats.map((chat) => {
                    const isActive = chat.id === activeChatId && activeTab === "chats";
                    return (
                      <button
                        key={chat.id}
                        onClick={() => {
                          setActiveChatId(chat.id);
                          setActiveTab("chats");
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2 rounded-full text-[12.5px] font-semibold text-left truncate transition-all ${
                          isActive
                            ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c] text-blue-600 dark:text-blue-400"
                            : "hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]"
                        }`}
                      >
                        <MessageSquare className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{chat.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapsed sidebar icons for study/exam */}
        {!isExpanded && (
          <div className="flex flex-col items-center gap-1.5 pt-3">
            <button
              onClick={() => { setActiveTab("study"); setIsExpanded(false); }}
              className={`size-11 flex items-center justify-center rounded-full transition-all ${
                activeTab === "study"
                  ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c] text-blue-600 dark:text-blue-400"
                  : "hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]"
              }`}
              title="Study Center"
            >
              <BookOpen className="size-[18px]" />
            </button>
            <button
              onClick={() => { setActiveTab("exams"); setIsExpanded(false); }}
              className={`size-11 flex items-center justify-center rounded-full transition-all ${
                activeTab === "exams"
                  ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c] text-blue-600 dark:text-blue-400"
                  : "hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5]"
              }`}
              title="Exam Center"
            >
              <ClipboardCheck className="size-[18px]" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Section: Settings & help */}
      <div className="w-full mt-auto space-y-1">
        {isExpanded ? (
          <>
            <button
              onClick={() => setActiveTab("help")}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-full hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] text-[13px] font-semibold transition-all ${
                activeTab === "help" ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c]" : ""
              }`}
            >
              <HelpCircle className="size-[18px] opacity-80" />
              <span>Help</span>
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-full hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] text-[13px] font-semibold transition-all ${
                activeTab === "settings" ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c]" : ""
              }`}
            >
              <div className="flex items-center gap-3.5">
                <SettingsIcon className="size-[18px] opacity-80" />
                <span>Settings</span>
              </div>
              {/* Blue notification dot */}
              <span className="size-1.5 rounded-full bg-blue-600 dark:bg-blue-400 mr-1.5" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setActiveTab("help")}
              className={`size-11 flex items-center justify-center rounded-full hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] transition-all ml-1.5 ${
                activeTab === "help" ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c]" : ""
              }`}
              title="Help"
            >
              <HelpCircle className="size-[18px] opacity-80" />
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`size-11 flex items-center justify-center rounded-full hover:bg-[#e3e3e3]/60 dark:hover:bg-white/5 text-[#444746] dark:text-[#c4c7c5] transition-all ml-1.5 relative ${
                activeTab === "settings" ? "bg-[#d3e3fd]/60 dark:bg-[#1a2d4c]" : ""
              }`}
              title="Settings"
            >
              <SettingsIcon className="size-[18px] opacity-80" />
              <span className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
