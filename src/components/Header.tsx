import React from "react";
import { createPortal } from "react-dom";
import { User, PencilLine, Mic, Plus, List, CheckSquare, Search, Mail, Database, FileText, Loader2, X } from "lucide-react";
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
  onOpenPersonalSettings: () => void;
  onNavigateMeetings?: (action: "list" | "new") => void;
  onAddTask?: () => void;
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
  isDemoMode,
  onOpenPersonalSettings,
  onNavigateMeetings,
  onAddTask
}) => {
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const [isMeetingsOpen, setIsMeetingsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const meetingsDropdownRef = React.useRef<HTMLDivElement>(null);

  // Universal Search states
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);
  const searchTimeoutRef = React.useRef<any>(null);

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
      if (meetingsDropdownRef.current && !meetingsDropdownRef.current.contains(event.target as Node)) {
        setIsMeetingsOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Hotkey listener (Cmd+K or Ctrl+K) and escape key listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setShowSearchDropdown(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchSearchResults = async (val: string) => {
    if (val.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/universal_search.php?query=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
        setShowSearchDropdown(true);
        setSelectedIndex(-1);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error("Error running universal search", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      fetchSearchResults(val);
    }, 250);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchDropdown || searchResults.length === 0) return;
    
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < searchResults.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        handleSelectSearchResult(searchResults[selectedIndex]);
      }
    }
  };

  const handleSelectSearchResult = (item: any) => {
    window.location.hash = item.url;
    setShowSearchDropdown(false);
    setSearchQuery("");
    setSearchResults([]);
    searchInputRef.current?.blur();
  };

  const getSearchIcon = (type: string) => {
    switch (type) {
      case "client":
        return <User className="h-4 w-4 text-emerald-600" />;
      case "lead":
        return <User className="h-4 w-4 text-indigo-500" />;
      case "email":
        return <Mail className="h-4 w-4 text-pink-500" />;
      case "meeting":
        return <PencilLine className="h-4 w-4 text-amber-500" />;
      case "unified_entry":
        return <Database className="h-4 w-4 text-purple-500" />;
      default:
        return <FileText className="h-4 w-4 text-slate-450" />;
    }
  };

  const getSearchTypeLabel = (type: string) => {
    switch (type) {
      case "client":
        return systemLanguage === "sk" ? "Klient" : systemLanguage === "hu" ? "Ügyfél" : "Client";
      case "lead":
        return systemLanguage === "sk" ? "Záujemca" : systemLanguage === "hu" ? "Érdeklődő" : "Lead";
      case "email":
        return "Email";
      case "meeting":
        return systemLanguage === "sk" ? "Stretnutie" : systemLanguage === "hu" ? "Megbeszélés" : "Meeting";
      case "unified_entry":
        return systemLanguage === "sk" ? "Záznam" : systemLanguage === "hu" ? "Bejegyzés" : "Registry";
      default:
        return "Item";
    }
  };

  const getSearchTypeBadgeColor = (type: string) => {
    switch (type) {
      case "client": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "lead": return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "email": return "bg-pink-50 text-pink-700 border-pink-200";
      case "meeting": return "bg-amber-50 text-amber-700 border-amber-200";
      case "unified_entry": return "bg-purple-50 text-purple-700 border-purple-200";
      default: return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

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

      {/* Universal Search bar in the center */}
      <div ref={searchContainerRef} className="relative w-72 md:w-96 mx-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
            ) : (
              <Search className="h-4 w-4 text-slate-400" />
            )}
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (searchQuery.trim().length >= 2) {
                setShowSearchDropdown(true);
              }
            }}
            placeholder={
              systemLanguage === "sk" 
                ? "Hľadať všade... (Cmd + K)" 
                : systemLanguage === "hu" 
                  ? "Keresés mindenhol... (Cmd + K)" 
                  : "Search everywhere... (Cmd + K)"
            }
            className="w-full pl-9 pr-10 py-2 text-xs font-semibold rounded-xl bg-white/70 border border-slate-200 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-slate-800"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setShowSearchDropdown(false);
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Suggestions */}
        {showSearchDropdown && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl max-h-[380px] overflow-y-auto z-[999] p-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
            {searchResults.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 font-semibold">
                {systemLanguage === "sk" ? "Žiadne výsledky pre \"" + searchQuery + "\"" : systemLanguage === "hu" ? "Nincs találat a következőre: \"" + searchQuery + "\"" : "No results found for \"" + searchQuery + "\""}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {searchResults.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => handleSelectSearchResult(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`px-3 py-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-3 border ${
                        isSelected 
                          ? "bg-slate-50/90 border-slate-200 text-slate-900 shadow-xs" 
                          : "bg-transparent border-transparent text-slate-700 hover:bg-slate-50/50"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0 bg-slate-100 p-1.5 rounded-lg border border-slate-200/50">
                        {getSearchIcon(item.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs truncate text-slate-800">{item.title}</span>
                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0 ${getSearchTypeBadgeColor(item.type)}`}>
                            {getSearchTypeLabel(item.type)}
                          </span>
                        </div>
                        {item.subtitle && (
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5 truncate">{item.subtitle}</div>
                        )}
                        {item.excerpt && (
                          <div className="text-[10px] text-slate-550 font-semibold mt-1 leading-relaxed border-l-2 border-slate-200 pl-2 italic truncate">
                            {item.excerpt}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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

        {/* Create Task Top-Bar Action Button */}
        <button
          onClick={onAddTask}
          className="h-10 w-10 rounded-xl border bg-white/80 border-slate-200 text-[#0b1329] hover:border-slate-350 hover:bg-slate-50 flex items-center justify-center transition-colors shadow-sm cursor-pointer shrink-0"
          title={systemLanguage === "sk" ? "Vytvoriť novú úlohu" : systemLanguage === "hu" ? "Új feladat" : "Create New Task"}
        >
          <CheckSquare className="h-5 w-5 text-indigo-600" />
        </button>

        {/* Meeting Room Popover Utilities */}
        <div className="relative" ref={meetingsDropdownRef}>
          <button
            onClick={() => setIsMeetingsOpen(!isMeetingsOpen)}
            className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-colors shadow-sm cursor-pointer ${
              isMeetingsOpen 
                ? "bg-[#0b1329] border-[#0b1329] text-white" 
                : "bg-white/80 border-slate-200 text-[#0b1329] hover:border-slate-350 hover:bg-slate-50"
            }`}
            aria-label="Meeting Room Menu"
            title={systemLanguage === "sk" ? "Zasadačka a stretnutia" : systemLanguage === "hu" ? "Tárgyaló és megbeszélések" : "Meetings & Notes"}
          >
            <PencilLine className="h-5 w-5" />
          </button>

          {/* Popover Dropdown Panel */}
          {isMeetingsOpen && (
            <div className="absolute right-0 mt-2.5 w-60 bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-2xl rounded-2xl p-2.5 z-50 flex flex-col gap-1 select-none animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1">
                {systemLanguage === "sk" ? "Rýchle akcie zasadačky" : systemLanguage === "hu" ? "Gyors tárgyaló műveletek" : "Meeting Room Quick Actions"}
              </div>

              {/* Record Meeting */}
              <button
                onClick={() => {
                  setIsMeetingsOpen(false);
                  if (typeof (window as any).showToast === "function") {
                    (window as any).showToast(
                      systemLanguage === "sk" 
                        ? "Nahrávanie stretnutia: Audio nahrávanie bude k dispozícii v ďalšej aktualizácii." 
                        : systemLanguage === "hu" 
                          ? "Megbeszélés rögzítése: A hangfelvétel a következő frissítésben érhető el." 
                          : "Record Meeting: Audio recording feature will be implemented in the next update."
                    );
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all cursor-pointer group"
              >
                <Mic className="h-4 w-4 text-slate-400 group-hover:text-slate-500" />
                <div className="flex flex-col">
                  <span>{systemLanguage === "sk" ? "Nahrať stretnutie" : systemLanguage === "hu" ? "Megbeszélés rögzítése" : "Record Meeting"}</span>
                  <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{systemLanguage === "sk" ? "Pripravuje sa" : systemLanguage === "hu" ? "Fejlesztés alatt" : "Coming soon"}</span>
                </div>
              </button>

              {/* New Meeting */}
              <button
                onClick={() => {
                  setIsMeetingsOpen(false);
                  if (onNavigateMeetings) {
                    onNavigateMeetings("new");
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-[#0b1329] hover:bg-slate-100/60 transition-all cursor-pointer group"
              >
                <Plus className="h-4 w-4 text-[#0b1329]" />
                <span>{systemLanguage === "sk" ? "Nové stretnutie" : systemLanguage === "hu" ? "Új megbeszélés" : "New Meeting"}</span>
              </button>

              {/* Show Meetings */}
              <button
                onClick={() => {
                  setIsMeetingsOpen(false);
                  if (onNavigateMeetings) {
                    onNavigateMeetings("list");
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-[#0b1329] hover:bg-slate-100/60 transition-all cursor-pointer group"
              >
                <List className="h-4 w-4 text-slate-400 group-hover:text-[#0b1329]" />
                <span>{systemLanguage === "sk" ? "Zobraziť stretnutia" : systemLanguage === "hu" ? "Megbeszélések mutatása" : "Show Meetings"}</span>
              </button>
            </div>
          )}
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

                    {/* Personal Settings Button */}
                    <div className="p-5">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenPersonalSettings();
                          handleClose();
                        }}
                        className="w-full py-3.5 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 hover:text-indigo-850 transition-all text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {systemLanguage === "sk" ? "Osobné nastavenia" : systemLanguage === "hu" ? "Személyes beállítások" : "Personal Settings"}
                      </button>
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
