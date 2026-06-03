import React from "react";
import { createPortal } from "react-dom";
import { Search, User } from "lucide-react";
import type { UserProfile } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";

interface HeaderProps {
  activeTab: string;
  systemName: string;
  currentUser?: UserProfile;
  users?: UserProfile[];
  onSwitchUser?: (user: UserProfile) => void;
  onLogout?: () => void;
  systemLanguage: Language;
  setSystemLanguage: (lang: Language) => void;
  isDemoMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  systemName,
  currentUser,
  users,
  onSwitchUser,
  onLogout,
  systemLanguage,
  setSystemLanguage,
  isDemoMode
}) => {
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsProfileOpen(false);
      setIsClosing(false);
    }, 350);
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getPageTitle = (tab: string) => {
    if (tab.startsWith("client-")) {
      return getTranslation(systemLanguage, "header.title.clients");
    }
    if (tab.startsWith("lead-")) {
      return getTranslation(systemLanguage, "header.title.leads");
    }
    switch (tab) {
      case "dashboard": return getTranslation(systemLanguage, "header.title.dashboard");
      case "leads": return getTranslation(systemLanguage, "header.title.leads");
      case "clients": return getTranslation(systemLanguage, "header.title.clients");
      case "files": return getTranslation(systemLanguage, "header.title.files");
      case "settings": return getTranslation(systemLanguage, "header.title.settings");
      default: return systemName;
    }
  };

  return (
    <header className="h-20 border-b border-white/40 bg-white/25 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-50 select-none">
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* View Title */}
      <div className="flex flex-col">
        <h1 className="text-xl font-heading font-extrabold text-slate-900 tracking-tight leading-none uppercase">
          {getPageTitle(activeTab)}
        </h1>
        <p className="text-[10px] text-slate-500 font-bold tracking-wider mt-1.5 uppercase">
          {systemName} &bull; {getTranslation(systemLanguage, "header.active_node")}
        </p>
      </div>

      {/* Utilities */}
      <div className="flex items-center gap-6">
        {/* Pulsing DEMO MODE badge */}
        {isDemoMode && (
          <a 
            href="#settings"
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 border border-amber-600 text-white text-[10px] font-black uppercase tracking-wider shadow-md shadow-amber-500/25 transition-all flex items-center gap-1 hover:scale-[1.02] shrink-0"
          >
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            DEMO MODE
          </a>
        )}

        {/* Search Bar Simulator */}
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={getTranslation(systemLanguage, "header.search_placeholder")}
            className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* User Account Trigger Button */}
        <div>
          <button
            onClick={() => setIsProfileOpen(true)}
            className="h-10 w-10 rounded-xl bg-white/80 border border-slate-200 flex items-center justify-center hover:border-slate-350 text-slate-700 transition-colors shadow-sm cursor-pointer"
            aria-label="User Profile Menu"
          >
            <User className="h-5 w-5 text-indigo-600" />
          </button>

          {/* User Account Right Slideout Drawer */}
          {(isProfileOpen || isClosing) && typeof document !== "undefined" && (
            React.createElement(React.Fragment, null, [
              createPortal(
                <div 
                  className={`fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 ${isClosing ? "animate-fade-out" : "animate-fade-in"}`}
                  onClick={handleClose}
                  key="drawer-backdrop"
                />,
                document.body
              ),
              createPortal(
                <div
                  className={`fixed top-20 right-0 bottom-0 w-80 md:w-90 bg-white/95 backdrop-blur-lg border-l border-slate-200/80 shadow-2xl flex flex-col justify-between overflow-y-auto p-0 z-50 ${isClosing ? "animate-slide-out-right" : "animate-slide-in-right"}`}
                  onClick={(e) => e.stopPropagation()}
                  key="drawer-panel"
                >
                  {/* Upper Section */}
                  <div className="flex-1">
                    {/* Header info with Close Trigger */}
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                           className="h-10 w-10 rounded-full flex items-center justify-center font-heading font-extrabold text-sm shadow-lg border"
                          style={{
                            backgroundColor: `${currentUser?.color || "#6366f1"}15`,
                            color: currentUser?.color || "#6366f1",
                            borderColor: `${currentUser?.color || "#6366f1"}35`
                          }}
                        >
                          {currentUser ? currentUser.name.substring(0, 2).toUpperCase() : "US"}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-800">{currentUser ? currentUser.name : "Erik"}</span>
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                            {currentUser ? currentUser.role : "Global Systems Admin"}
                          </span>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={handleClose}
                        className="text-slate-400 hover:text-slate-700 transition-colors p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer"
                        title="Close Drawer"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Active Simulated User Switcher Dropdown */}
                    {users && users.length > 0 && onSwitchUser && (
                      <div className="p-5 border-b border-slate-100 space-y-2.5">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Simulated User Session
                        </div>
                        <select
                          value={currentUser?.name}
                          onChange={(e) => {
                            const found = users.find(u => u.name === e.target.value);
                            if (found) {
                              onSwitchUser(found);
                            }
                          }}
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-heading font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {users.map(u => (
                            <option key={u.name} value={u.name}>
                              👤 {u.name} ({u.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Language Selector Section */}
                    <div className="p-5 space-y-3 border-b border-slate-105">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        {getTranslation(systemLanguage, "header.drawer_title")}
                      </div>
                      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 gap-1 select-none w-full">
                        <button
                          type="button"
                          onClick={() => setSystemLanguage("en")}
                          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            systemLanguage === "en"
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 font-black"
                              : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                          }`}
                        >
                          <span className="text-base">🇬🇧</span> EN
                        </button>
                        <button
                          type="button"
                          onClick={() => setSystemLanguage("sk")}
                          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            systemLanguage === "sk"
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 font-black"
                              : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                          }`}
                        >
                          <span className="text-base">🇸🇰</span> SK
                        </button>
                        <button
                          type="button"
                          onClick={() => setSystemLanguage("hu")}
                          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            systemLanguage === "hu"
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 font-black"
                              : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                          }`}
                        >
                          <span className="text-base">🇭🇺</span> HU
                        </button>
                      </div>
                    </div>

                    {/* Future Placeholders */}
                    <div className="p-6 text-center space-y-3 select-none opacity-40 mt-8">
                      <span className="text-3xl block">⚙️</span>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">
                        {getTranslation(systemLanguage, "header.drawer_coming_soon")}
                      </span>
                      <p className="text-[9.5px] text-slate-500 max-w-[210px] mx-auto leading-relaxed">
                        {getTranslation(systemLanguage, "header.drawer_coming_soon_desc")}
                      </p>
                    </div>
                  </div>

                  {/* Lower Footer with Logout Option */}
                  <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-bold select-none uppercase tracking-wider">
                    <span>{systemName} CRM</span>
                    {onLogout ? (
                      <button
                        onClick={() => {
                          onLogout();
                          handleClose();
                        }}
                        className="text-rose-600 hover:text-rose-700 transition-colors uppercase font-black tracking-wider cursor-pointer"
                      >
                        {getTranslation(systemLanguage, "sidebar.logout")}
                      </button>
                    ) : (
                      <span>{getTranslation(systemLanguage, "header.active_node")}</span>
                    )}
                  </div>
                </div>,
                document.body
              )
            ])
          )}
        </div>
      </div>
    </header>
  );
};
