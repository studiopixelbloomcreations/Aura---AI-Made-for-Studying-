import React from "react";
import { useAppStore } from "../store/useAppStore";
import {
  PenSquare,
  Search,
  Image,
  Library,
  Settings as SettingsIcon,
  Plus,
  FileText,
  Volume2,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

interface SidebarProps {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

// Exact shape and color gradient for the Gemini 4-pointed star logo
const GeminiStarLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-[22px] shrink-0">
    <path
      d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z"
      fill="url(#gemini-logo-grad)"
    />
    <defs>
      <linearGradient id="gemini-logo-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#4285f4" />
        <stop offset="35%" stopColor="#9b72cb" />
        <stop offset="70%" stopColor="#d96570" />
        <stop offset="100%" stopColor="#f4af67" />
      </linearGradient>
    </defs>
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({ isExpanded, setIsExpanded }) => {
  const {
    chats,
    addChat,
    activeTab,
    setActiveTab,
    activeChatId,
    setActiveChatId,
    liveAgents,
    addLiveAgent,
    liveAgentChats,
    setIsLiveOpen,
    intelligenceCreated,
    setIsPersonalizing,
  } = useAppStore();

  const handleNewChat = () => {
    addChat("New Chat", "Ask Aura anything...");
    setActiveTab("chats");
  };

  const handleNewAgent = () => {
    addLiveAgent(`Agent ${liveAgents.length + 1}`);
    if (intelligenceCreated) {
      setIsLiveOpen(true);
    } else {
      setIsPersonalizing(true);
    }
  };

  const handleAgentClick = () => {
    if (intelligenceCreated) {
      setIsLiveOpen(true);
    } else {
      setIsPersonalizing(true);
    }
  };

  // Get user identity for bottom profile segment
  const identity = (() => {
    try {
      return JSON.parse(localStorage.getItem("aura_identity") || "null") || {};
    } catch {
      return {};
    }
  })();

  const profileInitial = (identity?.name || identity?.email || "T").slice(0, 1).toUpperCase();

  // Collapsed state: vertical bar showing only the expand panel icon
  if (!isExpanded) {
    return (
      <div className="h-full flex flex-col items-center pt-3 w-[60px] bg-[#1e1f20] shrink-0 select-none border-r border-white/5">
        <button
          onClick={() => setIsExpanded(true)}
          className="size-10 flex items-center justify-center rounded-full hover:bg-[#393b3d] text-[#c4c7c5] transition-colors duration-150"
          title="Expand menu"
        >
          <PanelLeft className="size-[20px]" />
        </button>
      </div>
    );
  }

  return (
    <aside className="h-full flex flex-col shrink-0 select-none bg-[#1e1f20] w-[260px] animate-sidebar-in overflow-hidden border-r border-white/5">
      {/* Header: Gemini Logo + Collapse button */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <GeminiStarLogo />
          <span className="text-[20px] font-normal text-[#e3e3e3] tracking-normal font-sans">Gemini</span>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="size-10 flex items-center justify-center rounded-full hover:bg-[#393b3d] text-[#c4c7c5] transition-colors duration-150 shrink-0"
          title="Collapse menu"
        >
          <PanelLeftClose className="size-[20px]" />
        </button>
      </div>

      {/* New chat button — Gemini exact capsule style */}
      <div className="px-3 pt-2 pb-1.5 shrink-0">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-3 bg-[#131314]/30 hover:bg-[#393b3d] text-[#e3e3e3] text-[13px] font-medium py-2 px-4 rounded-full border border-white/10 transition-colors duration-150"
        >
          <PenSquare className="size-[16px] text-[#e3e3e3] shrink-0" />
          <span>New chat</span>
        </button>
      </div>

      {/* Nav Actions: Search chats, Images, Library */}
      <div className="px-3 space-y-0.5 shrink-0">
        <button className="w-full flex items-center gap-3 hover:bg-[#393b3d]/50 text-[#c4c7c5] text-[13px] font-normal py-2 px-4 rounded-full transition-colors duration-150">
          <Search className="size-[16px] shrink-0" />
          <span>Search chats</span>
        </button>
        <button className="w-full flex items-center gap-3 hover:bg-[#393b3d]/50 text-[#c4c7c5] text-[13px] font-normal py-2 px-4 rounded-full transition-colors duration-150">
          <Image className="size-[16px] shrink-0" />
          <span>Images</span>
        </button>
        <button className="w-full flex items-center gap-3 hover:bg-[#393b3d]/50 text-[#c4c7c5] text-[13px] font-normal py-2 px-4 rounded-full transition-colors duration-150">
          <Library className="size-[16px] shrink-0" />
          <span>Library</span>
        </button>
      </div>

      {/* Scrollable Center Pane */}
      <div className="flex-1 overflow-y-auto px-3 min-h-0 custom-scrollbar">
        {/* Notebooks Section */}
        <div className="pt-4 pb-1">
          <div className="px-4 py-1 text-[11px] font-semibold text-[#9aa0a6] uppercase tracking-wider">
            Notebooks
          </div>
          <div className="space-y-0.5 mt-1">
            <button
              onClick={handleNewAgent}
              className="w-full flex items-center gap-3 hover:bg-[#393b3d]/50 text-[#c4c7c5] text-[12.5px] font-normal py-2 px-4 rounded-full transition-colors duration-150"
            >
              <Plus className="size-[16px] shrink-0" />
              <span>New notebook</span>
            </button>

            <button
              onClick={handleAgentClick}
              className="w-full flex items-center gap-3 hover:bg-[#393b3d]/50 text-[#c4c7c5] text-[12.5px] font-normal py-2 px-4 rounded-full transition-colors duration-150 text-left"
            >
              <FileText className="size-[16px] shrink-0 text-[#9aa0a6]" />
              <span className="truncate">Untitled notebook</span>
            </button>

            {/* Live agents list */}
            {liveAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={handleAgentClick}
                className="w-full flex items-center gap-3 hover:bg-[#393b3d]/50 text-[#c4c7c5] text-[12.5px] font-normal py-2 px-4 rounded-full transition-colors duration-150 text-left"
              >
                <Volume2 className="size-[15px] text-emerald-400 shrink-0" />
                <span className="truncate">{agent.name}</span>
                {agent.status === "active" && (
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse ml-auto shrink-0" />
                )}
              </button>
            ))}

            {liveAgentChats.map((chat) => (
              <button
                key={chat.id}
                className="w-full flex items-center gap-3 hover:bg-[#393b3d]/50 text-[#c4c7c5] text-[12.5px] font-normal py-2 px-4 rounded-full transition-colors duration-150 text-left"
              >
                <FileText className="size-[15px] shrink-0 opacity-50" />
                <span className="truncate">{chat.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recents Section — Ultra Compact */}
        <div className="pt-3 pb-2">
          <div className="px-4 py-1 text-[11px] font-semibold text-[#9aa0a6] uppercase tracking-wider">
            Recents
          </div>
          <div className="space-y-0.5 mt-1">
            {chats.length === 0 ? (
              <div className="text-[12px] text-[#9aa0a6] px-4 py-2 italic">No recent chats</div>
            ) : (
              chats.map((chat) => {
                const isActive = chat.id === activeChatId && activeTab === "chats";
                return (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setActiveChatId(chat.id);
                      setActiveTab("chats");
                    }}
                    className={`w-full text-left text-[12.5px] font-normal py-1.5 px-4 rounded-full transition-colors duration-150 truncate ${
                      isActive
                        ? "bg-[#393b3d] text-[#e3e3e3]"
                        : "hover:bg-[#393b3d]/50 text-[#c4c7c5]"
                    }`}
                  >
                    {chat.title}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Profile card matching exact lowercase style in reference image */}
      <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/5">
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-full hover:bg-[#393b3d]/40 transition-colors duration-150 text-[#e3e3e3]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-6.5 rounded-full bg-gradient-to-tr from-purple-500 via-indigo-500 to-blue-500 flex items-center justify-center text-white text-[9.5px] font-bold shrink-0 overflow-hidden shadow-sm">
              {identity?.avatar ? (
                <img src={identity.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                profileInitial
              )}
            </div>
            <span className="truncate text-[12.5px] font-normal text-[#c4c7c5] tracking-tight">
              {String(identity?.name || "thenuja premasiri").toLowerCase()}
            </span>
          </div>
          <button
            onClick={() => setActiveTab("settings")}
            className="size-7 flex items-center justify-center rounded-full hover:bg-white/10 text-[#9aa0a6] hover:text-[#e3e3e3] transition-colors shrink-0"
            title="Settings"
          >
            <SettingsIcon className="size-[15px]" />
          </button>
        </div>
      </div>
    </aside>
  );
};
