import React, { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  Menu,
  PenSquare,
  Search,
  Image,
  Library,
  Settings as SettingsIcon,
  Plus,
  FileText,
  Volume2,
  Sparkles,
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
    liveAgents,
    addLiveAgent,
    liveAgentChats,
    setIsLiveOpen,
    intelligenceCreated,
    setIsPersonalizing,
  } = useAppStore();

  const [notebooksOpen, setNotebooksOpen] = useState(true);
  const [recentsOpen, setRecentsOpen] = useState(true);

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

  // Collapsed state: only hamburger icon visible
  if (!isExpanded) {
    return (
      <div className="h-full flex flex-col items-start pt-2 pl-2 shrink-0 select-none">
        <button
          onClick={() => setIsExpanded(true)}
          className="size-12 flex items-center justify-center rounded-full hover:bg-[#393b3d] text-[#c4c7c5] transition-colors duration-150"
        >
          <Menu className="size-[22px]" />
        </button>
      </div>
    );
  }

  return (
    <aside className="h-full flex flex-col shrink-0 select-none bg-[#1b1b1d] w-[260px] animate-sidebar-in overflow-hidden">
      {/* Header: Menu + Aura branding */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1 shrink-0 h-[56px]">
        <button
          onClick={() => setIsExpanded(false)}
          className="size-12 flex items-center justify-center rounded-full hover:bg-[#393b3d] text-[#c4c7c5] transition-colors duration-150 shrink-0"
        >
          <Menu className="size-[22px]" />
        </button>
        <div className="flex items-center gap-2.5 ml-1">
          {/* Gemini-style colorful star logo */}
          <div className="size-6 relative">
            <Sparkles className="size-6 text-blue-400" style={{ filter: "drop-shadow(0 0 4px rgba(66,133,244,0.4))" }} />
          </div>
          <span className="text-[22px] font-normal text-[#e3e3e3] tracking-tight">Aura</span>
        </div>
      </div>

      {/* New chat button — Gemini's rounded pill style */}
      <div className="px-3 pt-2 pb-0.5 shrink-0">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-3 bg-[#282a2c] hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-medium py-2.5 px-4 rounded-full transition-colors duration-150"
        >
          <PenSquare className="size-[18px] text-[#e3e3e3] shrink-0" />
          <span>New chat</span>
        </button>
      </div>

      {/* Search chats */}
      <div className="px-3 pt-1 shrink-0">
        <button className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150">
          <Search className="size-[18px] text-[#e3e3e3] shrink-0" />
          <span>Search chats</span>
        </button>
      </div>

      {/* Nav: Images, Library */}
      <div className="px-3 space-y-0 shrink-0">
        <button className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150">
          <Image className="size-[18px] text-[#e3e3e3] shrink-0" />
          <span>Images</span>
        </button>
        <button className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150">
          <Library className="size-[18px] text-[#e3e3e3] shrink-0" />
          <span>Library</span>
        </button>
      </div>

      {/* Scrollable middle section */}
      <div className="flex-1 overflow-y-auto px-3 min-h-0">

        {/* Notebooks section — Gemini exact */}
        <div className="pt-4 pb-0.5">
          <div className="px-4 py-1.5 text-[12px] font-medium text-[#9aa0a6]">
            <span>Notebooks</span>
          </div>

          {notebooksOpen && (
            <div className="space-y-0 animate-fade-in">
              {/* + New Aura Live Agent */}
              <button
                onClick={handleNewAgent}
                className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150"
              >
                <Plus className="size-[18px] text-[#e3e3e3] shrink-0" />
                <span>New notebook</span>
              </button>

              {/* Live agent items */}
              {liveAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={handleAgentClick}
                  className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150 text-left"
                >
                  <Volume2 className="size-[16px] text-emerald-400 shrink-0" />
                  <span className="truncate">{agent.name}</span>
                  {agent.status === "active" && (
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse ml-auto shrink-0" />
                  )}
                </button>
              ))}

              {/* Live agent conversations */}
              {liveAgentChats.map((chat) => (
                <button
                  key={chat.id}
                  className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#c4c7c5] text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150 text-left"
                >
                  <FileText className="size-[16px] shrink-0 opacity-50" />
                  <span className="truncate">{chat.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recents section — Gemini style: section header + plain text list */}
        <div className="pt-3 pb-0.5">
          <div className="px-4 py-1.5 text-[12px] font-medium text-[#9aa0a6]">
            <span>Recents</span>
          </div>

          {recentsOpen && (
            <div className="space-y-0 animate-fade-in">
              {chats.length === 0 ? (
                <p className="text-[13px] text-[#9aa0a6] px-4 py-2">No recent chats yet</p>
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
                      className={`w-full text-left text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150 truncate ${
                        isActive
                          ? "bg-[#393b3d] text-[#e3e3e3]"
                          : "hover:bg-[#393b3d] text-[#e3e3e3]"
                      }`}
                    >
                      {chat.title}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: User avatar + name + Settings */}
      <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/5">
        <button
          onClick={() => setActiveTab("settings")}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-full text-[14px] font-normal transition-colors duration-150 text-left ${
            activeTab === "settings"
              ? "bg-[#393b3d] text-[#e3e3e3]"
              : "hover:bg-[#393b3d] text-[#e3e3e3]"
          }`}
        >
          <div className="size-7 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 overflow-hidden">
            <span>A</span>
          </div>
          <span className="truncate flex-1 text-[13px]">Student</span>
          <SettingsIcon className="size-[16px] text-[#9aa0a6] shrink-0" />
        </button>
      </div>
    </aside>
  );
};
