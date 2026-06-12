import React, { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  Menu,
  PenSquare,
  Search,
  Image,
  Library,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight,
  Plus,
  MessageSquare,
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

  const [agentsOpen, setAgentsOpen] = useState(true);
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

  // Collapsed state: only hamburger icon visible (Gemini style)
  if (!isExpanded) {
    return (
      <div className="h-full flex flex-col items-start pt-2 pl-2 shrink-0 select-none">
        <button
          onClick={() => setIsExpanded(true)}
          className="size-12 flex items-center justify-center rounded-full hover:bg-[#393b3d] text-[#c4c7c5] transition-colors duration-150"
          title="Open sidebar"
        >
          <Menu className="size-[22px]" />
        </button>
      </div>
    );
  }

  return (
    <aside className="h-full flex flex-col shrink-0 select-none bg-[#1e1f20] w-[260px] animate-sidebar-in overflow-hidden">
      {/* Header: Menu + Aura branding */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1 shrink-0">
        <button
          onClick={() => setIsExpanded(false)}
          className="size-12 flex items-center justify-center rounded-full hover:bg-[#393b3d] text-[#c4c7c5] transition-colors duration-150"
          title="Close sidebar"
        >
          <Menu className="size-[22px]" />
        </button>
        <div className="flex items-center gap-2 ml-1">
          <div className="size-7 rounded-full bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 flex items-center justify-center">
            <Sparkles className="size-4 text-white" />
          </div>
          <span className="text-[22px] font-normal text-[#c4c7c5] tracking-tight">Aura</span>
        </div>
      </div>

      {/* New chat button */}
      <div className="px-3 pt-1 pb-1 shrink-0">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-3 bg-[#393b3d] hover:bg-[#484a4d] text-[#e3e3e3] text-[14px] font-normal py-3 px-4 rounded-full transition-colors duration-150"
        >
          <PenSquare className="size-[20px] text-[#e3e3e3] shrink-0" />
          <span>New chat</span>
        </button>
      </div>

      {/* Search chats */}
      <div className="px-3 pb-1 shrink-0">
        <button
          className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-3 px-4 rounded-full transition-colors duration-150"
        >
          <Search className="size-[20px] text-[#e3e3e3] shrink-0" />
          <span>Search chats</span>
        </button>
      </div>

      {/* Nav: Images, Library */}
      <div className="px-3 pb-2 shrink-0 space-y-0.5">
        <button className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-3 px-4 rounded-full transition-colors duration-150">
          <Image className="size-[20px] text-[#e3e3e3] shrink-0" />
          <span>Images</span>
        </button>
        <button className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-3 px-4 rounded-full transition-colors duration-150">
          <Library className="size-[20px] text-[#e3e3e3] shrink-0" />
          <span>Library</span>
        </button>
      </div>

      {/* Scrollable middle section */}
      <div className="flex-1 overflow-y-auto px-3 min-h-0">

        {/* Aura Live Agents section (replaces Notebooks) */}
        <div className="pt-3 pb-1">
          <button
            onClick={() => setAgentsOpen(!agentsOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-[#9aa0a6] hover:text-[#e3e3e3] transition-colors duration-150"
          >
            {agentsOpen ? <ChevronDown className="size-[16px]" /> : <ChevronRight className="size-[16px]" />}
            <span>Aura Live Agents</span>
          </button>

          {agentsOpen && (
            <div className="space-y-0.5 animate-fade-in">
              {/* + New Aura Live Agent */}
              <button
                onClick={handleNewAgent}
                className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150"
              >
                <Plus className="size-[18px] text-[#e3e3e3] shrink-0" />
                <span>New Aura Live Agent</span>
              </button>

              {/* Live agent items */}
              {liveAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={handleAgentClick}
                  className="w-full flex items-center gap-3 hover:bg-[#393b3d] text-[#e3e3e3] text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150 text-left"
                >
                  <Volume2 className="size-[18px] text-emerald-400 shrink-0" />
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
                  <MessageSquare className="size-[18px] shrink-0 opacity-60" />
                  <span className="truncate">{chat.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recents section */}
        <div className="pt-2 pb-1">
          <button
            onClick={() => setRecentsOpen(!recentsOpen)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-[#9aa0a6] hover:text-[#e3e3e3] transition-colors duration-150"
          >
            {recentsOpen ? <ChevronDown className="size-[16px]" /> : <ChevronRight className="size-[16px]" />}
            <span>Recents</span>
          </button>

          {recentsOpen && (
            <div className="space-y-0.5 animate-fade-in">
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
                      className={`w-full flex items-center gap-3 text-[14px] font-normal py-2.5 px-4 rounded-full transition-colors duration-150 text-left ${
                        isActive
                          ? "bg-[#393b3d] text-[#e3e3e3]"
                          : "hover:bg-[#393b3d] text-[#e3e3e3]"
                      }`}
                    >
                      <MessageSquare className="size-[18px] shrink-0 opacity-60" />
                      <span className="truncate">{chat.title}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Settings */}
      <div className="shrink-0 px-3 pb-3">
        <button
          onClick={() => setActiveTab("settings")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[14px] font-normal transition-colors duration-150 text-left ${
            activeTab === "settings"
              ? "bg-[#393b3d] text-[#e3e3e3]"
              : "hover:bg-[#393b3d] text-[#e3e3e3]"
          }`}
        >
          <SettingsIcon className="size-[20px] shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
