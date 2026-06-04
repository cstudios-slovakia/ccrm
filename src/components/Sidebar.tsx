import React, { useState } from "react";
import { LayoutDashboard, ChevronLeft, ChevronRight, Settings, LogOut, TableProperties, Users, FolderOpen, BarChart3, Mail } from "lucide-react";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import { cn } from "../utils/cn";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  systemName: string;
  showSettings?: boolean;
  onLogout?: () => void;
  systemLanguage: Language;
  showMailIcon?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  systemName,
  showSettings = true,
  onLogout,
  systemLanguage,
  showMailIcon = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true); // Default collapsed for the minimalist aesthetic
  const sidebarRef = React.useRef<HTMLElement>(null);

  // Click outside sidebar listener to contract it
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isCollapsed && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsCollapsed(true);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCollapsed]);
  
  // Touch Swipe States for Mobile Menu drawer Gestures
  const [startY, setStartY] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endY = e.changedTouches[0].clientY;
    // Swipe Up (startY - endY > 40px)
    if (startY - endY > 40) {
      setIsMobileMenuOpen(true);
    }
    // Swipe Down (endY - startY > 40px)
    if (endY - startY > 40) {
      setIsMobileMenuOpen(false);
    }
  };

  const menuItems = [
    { id: "dashboard", label: systemLanguage === "sk" ? "Panel úloh" : systemLanguage === "hu" ? "Feladat Irányítópult" : "Task Dashboard", icon: LayoutDashboard },
    { id: "overview", label: getTranslation(systemLanguage, "sidebar.dashboard"), icon: BarChart3 },
    { id: "leads", label: getTranslation(systemLanguage, "sidebar.leads"), icon: TableProperties },
    { id: "clients", label: getTranslation(systemLanguage, "sidebar.clients"), icon: Users },
    { id: "files", label: getTranslation(systemLanguage, "sidebar.files"), icon: FolderOpen },
  ];

  if (showMailIcon) {
    menuItems.push({
      id: "email",
      label: systemLanguage === "sk" ? "Pošta" : systemLanguage === "hu" ? "Levelezés" : "Mail Client",
      icon: Mail
    });
  }

  return (
    <>
      {/* DESKTOP VIEWPORT SPACER: Always remains collapsed width (w-20) so the extended sidebar floats above the content */}
      <div className="h-screen w-20 shrink-0 select-none hidden lg:block" />
      
      {/* DESKTOP COLLAPSIBLE OVERLAY SIDEBAR */}
      <aside 
        ref={sidebarRef}
        className={cn(
          "h-screen fixed left-0 top-0 bg-white border-r border-slate-200/80 flex flex-col transition-all duration-300 z-[1000] select-none shrink-0 hidden lg:flex",
          isCollapsed 
            ? "w-20 shadow-none border-r-slate-200/80" 
            : "w-64 shadow-[10px_0_30px_rgba(0,0,0,0.06)] border-r-transparent"
        )}
      >
        {/* Brand Header */}
        <div className={cn(
          "h-20 flex items-center relative select-none transition-all duration-300",
          isCollapsed ? "justify-center px-0" : "px-6"
        )}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center gap-1 shrink-0">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="h-2 w-2 rounded-full bg-slate-300" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col animate-in fade-in duration-300">
                <span className="font-heading font-bold text-sm leading-none bg-gradient-to-r from-slate-800 to-slate-950 bg-clip-text text-transparent truncate max-w-[150px]">
                  {systemName}
                </span>
                <span className="text-[10px] text-slate-400 tracking-wider font-semibold uppercase mt-0.5">
                  {getTranslation(systemLanguage, "sidebar.command_center")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Nav List */}
        <nav className="flex-1 px-4 py-4 overflow-y-auto space-y-2 scrollbar-thin">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === "clients" && activeTab.startsWith("client-"));
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsCollapsed(true);
                }}
                className={cn(
                  "w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all duration-200 group text-left relative",
                  isActive 
                    ? (item.id === "leads"
                        ? "bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30 border border-blue-500/20"
                        : item.id === "clients"
                          ? "bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/30 border border-emerald-500/20"
                          : item.id === "files"
                            ? "bg-amber-700 text-white font-bold shadow-lg shadow-amber-700/30 border border-amber-600/20"
                            : item.id === "overview"
                              ? "bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-600/30 border border-cyan-500/20"
                              : item.id === "email"
                                ? "bg-pink-600 text-white font-bold shadow-lg shadow-pink-600/30 border border-pink-500/20"
                                : "bg-orange-500 text-white font-bold shadow-lg shadow-orange-500/30 border border-orange-400/20"
                        )
                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/50"
                )}
              >
                <Icon 
                  className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-200",
                    isActive ? "text-white" : "text-slate-400 group-hover:scale-105"
                  )} 
                />
                
                {!isCollapsed && (
                  <span className="text-sm font-heading font-medium tracking-wide">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}

          {/* Collapse/Expand Toggle Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all duration-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100/50 text-left cursor-pointer"
            aria-label="Toggle Navigation Sidebar"
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 animate-pulse" />
            ) : (
              <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400" />
            )}
            {!isCollapsed && (
              <span className="text-sm font-heading font-medium tracking-wide">
                {getTranslation(systemLanguage, "sidebar.collapse")}
              </span>
            )}
          </button>
        </nav>

        {/* Bottom Pinned Actions Footer */}
        <div className="p-4 flex flex-col gap-2 shrink-0 border-t border-slate-100/80 bg-slate-50/30">
          {/* Settings Button - Only visible if permitted */}
          {showSettings && (
            <button
              onClick={() => {
                setActiveTab("settings");
                setIsCollapsed(true);
              }}
              className={cn(
                "w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all duration-200 group text-left",
                (activeTab === "settings" || activeTab.startsWith("user-"))
                  ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/50"
              )}
            >
              <Settings className={cn("h-5 w-5 shrink-0 transition-transform", activeTab === "settings" ? "text-white" : "text-slate-400 group-hover:rotate-45")} />
              {!isCollapsed && <span className="text-xs font-semibold tracking-wide">{getTranslation(systemLanguage, "sidebar.settings")}</span>}
            </button>
          )}

          {/* Logout Button */}
          <button
            onClick={() => {
              if (onLogout) {
                onLogout();
              } else {
                alert("Sign out simulation active. Workspace locked.");
              }
            }}
            className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 transition-all duration-200 text-left group"
          >
            <LogOut className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-rose-500 transition-colors" />
            {!isCollapsed && <span className="text-xs font-semibold tracking-wide">{getTranslation(systemLanguage, "sidebar.logout")}</span>}
          </button>
        </div>
      </aside>

      {/* MOBILE INTEGRATED MORPHING NAVIGATION DRAWER PANEL */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "lg:hidden fixed left-0 right-0 bg-white/95 backdrop-blur-md transition-all duration-500 ease-in-out z-[20000] border-t border-slate-200/80 shadow-[0_-15px_42px_rgba(0,0,0,0.18),0_-5px_15px_rgba(0,0,0,0.08)] select-none shrink-0",
          isMobileMenuOpen 
            ? "top-0 bottom-0 h-screen w-full p-6 flex flex-col justify-between" 
            : "bottom-0 h-16 w-full px-4 py-2 flex flex-col justify-center"
        )}
      >
        {/* Swipe Handle Indicator / Close click target */}
        <button 
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="w-12 h-1 bg-slate-200 hover:bg-slate-350 rounded-full mx-auto mb-2 outline-none cursor-pointer transition-colors shrink-0"
          aria-label={isMobileMenuOpen ? "Collapse navigation drawer" : "Open fullscreen navigation drawer"}
        />

        {/* Brand Header: Only visible when fullscreen drawer is open */}
        {isMobileMenuOpen && (
          <div className="flex items-center gap-3.5 mb-8 animate-in fade-in slide-in-from-top-4 duration-300 shrink-0">
            <div className="h-10 w-10 flex items-center justify-center gap-1.5 shrink-0 select-none">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="h-2 w-2 rounded-full bg-slate-300" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-heading font-bold text-sm leading-none bg-gradient-to-r from-slate-800 to-slate-950 bg-clip-text text-transparent">
                {systemName}
              </span>
              <span className="text-[9px] text-slate-400 tracking-wider font-extrabold uppercase mt-0.5">
                {getTranslation(systemLanguage, "sidebar.command_center")}
              </span>
            </div>
          </div>
        )}

        {/* Reorganizing flex container */}
        <div className={cn(
          "flex transition-all duration-500 ease-in-out w-full",
          isMobileMenuOpen ? "flex-col flex-1 justify-between items-start" : "flex-row items-center justify-between"
        )}>
          
          {/* Main Navigation Links */}
          <div className={cn(
            "flex transition-all duration-300",
            isMobileMenuOpen ? "flex-col w-full space-y-3" : "flex-row items-center gap-2 flex-1 pr-2"
          )}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id || (item.id === "clients" && activeTab.startsWith("client-"));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "transition-all duration-300 flex items-center shrink-0 border select-none",
                    isMobileMenuOpen 
                      ? "w-full px-5 py-3.5 rounded-2xl gap-3 text-left font-black" 
                      : "h-11 w-11 rounded-xl justify-center",
                    isActive
                      ? (item.id === "dashboard"
                          ? "bg-[#ff5d00] border-[#ff5d00] text-white"
                          : item.id === "overview"
                            ? "bg-cyan-600 border-cyan-700 text-white"
                            : item.id === "leads"
                              ? "bg-blue-600 border-blue-700 text-white"
                              : item.id === "clients"
                                ? "bg-emerald-600 border-emerald-700 text-white"
                                : item.id === "email"
                                  ? "bg-pink-600 border-pink-700 text-white"
                                  : item.id === "tasks"
                                    ? "bg-violet-600 border-violet-700 text-white"
                                    : "bg-amber-700 border-amber-800 text-white"
                        )
                      : (isMobileMenuOpen 
                          ? "bg-transparent border-transparent text-slate-500 hover:text-slate-800" 
                          : "bg-slate-50/50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        )
                  )}
                  title={item.label}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {isMobileMenuOpen && (
                    <span className="text-xs font-bold tracking-wide">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Settings & Logout Controls at the bottom */}
          <div className={cn(
            "flex transition-all duration-300",
            isMobileMenuOpen ? "flex-col w-full space-y-3.5 mt-auto border-t border-slate-100/80 pt-5" : "flex-row items-center gap-2"
          )}>
            {/* Divider indicated only in horizontal bottom bar */}
            {!isMobileMenuOpen && showSettings && (
              <div className="h-6 w-[2px] bg-slate-200 shrink-0 mx-1" />
            )}

            {/* Settings Tab Button */}
            {showSettings && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("settings");
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "transition-all duration-300 flex items-center shrink-0 border select-none",
                  isMobileMenuOpen 
                    ? "w-full px-5 py-3.5 rounded-2xl gap-3 text-left font-black" 
                    : "h-11 w-11 rounded-xl justify-center",
                  (activeTab === "settings" || activeTab.startsWith("user-"))
                    ? "bg-indigo-600 border-indigo-700 text-white"
                    : (isMobileMenuOpen 
                        ? "bg-transparent border-transparent text-slate-500 hover:text-slate-800" 
                        : "bg-slate-50/50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      )
                )}
                title={getTranslation(systemLanguage, "sidebar.settings")}
              >
                <Settings className="h-4.5 w-4.5 shrink-0" />
                {isMobileMenuOpen && (
                  <span className="text-xs font-bold tracking-wide">{getTranslation(systemLanguage, "sidebar.settings")}</span>
                )}
              </button>
            )}

            {/* Logout Tab Button */}
            <button
              type="button"
              onClick={() => {
                if (onLogout) {
                  onLogout();
                } else {
                  alert("Sign out simulation active. Workspace locked.");
                }
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "transition-all duration-300 flex items-center shrink-0 border select-none",
                isMobileMenuOpen 
                  ? "w-full px-5 py-3.5 rounded-2xl gap-3 text-left font-black" 
                  : "h-11 w-11 rounded-xl justify-center",
                isMobileMenuOpen 
                  ? "bg-transparent border-transparent text-slate-500 hover:text-slate-800 hover:bg-rose-50" 
                  : "bg-slate-50/50 border-slate-200 text-slate-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-650"
              )}
              title={getTranslation(systemLanguage, "sidebar.logout")}
            >
              <LogOut className="h-4.5 w-4.5 shrink-0" />
              {isMobileMenuOpen && (
                <span className="text-xs font-bold tracking-wide">{getTranslation(systemLanguage, "sidebar.logout")}</span>
              )}
            </button>
          </div>

        </div>
      </div>
    </>
  );
};
