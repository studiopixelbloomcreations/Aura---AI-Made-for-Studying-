import React from "react";
import { useAppStore } from "../store/useAppStore";
import {
  Menu,
  MessageSquare,
  Settings as SettingsIcon,
  Sparkles,
  PenSquare,
  Volume2,
  BookOpen,
  ClipboardCheck,
  Package,
  Briefcase,
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

  // Collapsed state: only hamburger icon visible
  if (!isExpanded) {
    return (
      <aside className="h-full flex flex-col items-center pt-3 shrink-0 select-none bg-transparent">
        <button
          onClick={() => setIsExpanded(true)}
          className="size-10 flex items-center justify-center rounded-full hover:bg-[#1e1f20] text-[#c4c7c5] transition-all duration-200"
          title="Open sidebar"
        >
          <Menu className="size-[20px]" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="h-full flex flex-col shrink-0 select-none bg-[#1e1f20] w-[308px] rounded-r-2xl relative overflow-hidden animate-sidebar-in"
    >
      {/* Top gradient overlay */}
      <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-[#1e1f20] to-transparent z-10 pointer-events-none" />

      {/* Header: Hamburger + "Aura" */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
        <button
          onClick={() => setIsExpanded(false)}
          className="size-10 flex items-center justify-center rounded-full hover:bg-white/8 text-[#c4c7c5] transition-all duration-200"
        >
          <Menu className="size-[20px]" />
        </button>
        <span className="text-[20px] font-medium leading-[26px] text-[#c4c7c5] select-none">Aura</span>
      </div>

      {/* New chat button */}
      <div className="px-4 py-2 shrink-0">
        <button
          onClick={handleNewChat}
          className="w-[272px] flex items-center gap-3 bg-white/8 hover:bg-white/12 text-[#e3e3e3] text-[14px] font-medium py-3 px-5 rounded-[30px] transition-all duration-200"
        >
          <PenSquare className="size-[18px] text-[#e3e3e3] shrink-0" />
          <span>New chat</span>
        </button>
      </div>

      {/* Chats section heading */}
      <div className="px-4 pt-2 pb-1 shrink-0">
        <span className="text-[14px] font-medium leading-[20px] text-[#c4c7c5]">Chats</span>
      </div>

      {/* Scrollable middle section */}
      <div className="flex-1 overflow-y-auto px-3 min-h-0 scrollbar-thin">
        {/* Sign-in prompt card (shown when no chats) */}
        {chats.length === 0 && (
          <div className="mx-1 mb-3 rounded-2xl bg-white/5 p-4 space-y-2">
            <p className="text-[14px] font-medium text-[#c4c7c5]">Sign in to start saving your chats</p>
            <p className="text-[14px] text-[#c4c7c5] leading-[20px]">
              Once you're signed in, you can access your recent chats here.
            </p>
            <button className="text-[14px] font-medium text-[#a8c7fa] hover:underline">
              Sign in
            </button>
          </div>
        )}

        {/* Aura Live section */}
        <div className="mb-2">
          <button
            onClick={handleIntelligenceClick}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-medium text-[#e3e3e3] hover:bg-white/8 transition-all duration-200 text-left"
          >
            {intelligenceCreated ? (
              <>
                <Volume2 className="size-[18px] text-emerald-400 shrink-0" />
                <span>Aura Live</span>
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse ml-auto mr-1" />
              </>
            ) : (
              <>
                <Sparkles className="size-[18px] text-[#c4c7c5] shrink-0" />
                <span>Aura Live</span>
              </>
            )}
          </button>
        </div>

        {/* Study Center */}
        <div className="mb-1">
          <button
            onClick={() => setActiveTab("study")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-medium transition-all duration-200 text-left ${
              activeTab === "study"
                ? "bg-white/12 text-[#e3e3e3]"
                : "hover:bg-white/8 text-[#e3e3e3]"
            }`}
          >
            <BookOpen className="size-[18px] shrink-0" />
            <span>Study Center</span>
          </button>
        </div>

        {/* Exam Center */}
        <div className="mb-1">
          <button
            onClick={() => setActiveTab("exams")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-medium transition-all duration-200 text-left ${
              activeTab === "exams"
                ? "bg-white/12 text-[#e3e3e3]"
                : "hover:bg-white/8 text-[#e3e3e3]"
            }`}
          >
            <ClipboardCheck className="size-[18px] shrink-0" />
            <span>Exam Center</span>
          </button>
        </div>

        {/* Recent chats list */}
        {chats.length > 0 && (
          <div className="pt-2 space-y-0.5">
            {chats.map((chat) => {
              const isActive = chat.id === activeChatId && activeTab === "chats";
              return (
                <button
                  key={chat.id}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setActiveTab("chats");
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-medium text-left truncate transition-all duration-200 ${
                    isActive
                      ? "bg-white/12 text-[#e3e3e3]"
                      : "hover:bg-white/8 text-[#e3e3e3]"
                  }`}
                >
                  <MessageSquare className="size-[18px] shrink-0 opacity-70" />
                  <span className="truncate">{chat.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom section: About Aura + Settings */}
      <div className="shrink-0 px-3 pb-3 space-y-0.5">
        {/* About Aura heading */}
        <div className="px-4 py-2">
          <span className="text-[14px] font-medium text-[#c4c7c5]">About Aura</span>
        </div>

        {/* Settings & help */}
        <button
          onClick={() => setActiveTab("settings")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-medium text-[#e3e3e3] hover:bg-white/8 transition-all duration-200 text-left ${
            activeTab === "settings" ? "bg-white/12" : ""
          }`}
        >
          <SettingsIcon className="size-[18px] shrink-0" />
          <span>Settings & help</span>
        </button>

        {/* Aura App */}
        <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-medium text-[#e3e3e3] hover:bg-white/8 transition-all duration-200 text-left">
          <Sparkles className="size-[18px] shrink-0" />
          <span>Aura App</span>
        </button>

        {/* Subscriptions */}
        <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-medium text-[#e3e3e3] hover:bg-white/8 transition-all duration-200 text-left">
          <Package className="size-[18px] shrink-0" />
          <span>Subscriptions</span>
        </button>

        {/* For Business */}
        <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-medium text-[#e3e3e3] hover:bg-white/8 transition-all duration-200 text-left">
          <Briefcase className="size-[18px] shrink-0" />
          <span>For Business</span>
        </button>
      </div>

      {/* Bottom gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-[#1e1f20] to-transparent z-10 pointer-events-none" />
    </aside>
  );
};
