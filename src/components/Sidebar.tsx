import React, { useState } from "react";
import { LayoutDashboard, ChevronLeft, ChevronRight, Settings, LogOut, TableProperties, Users, FolderOpen, BarChart3, Mail, Brain, PencilLine, Pencil, X, GripVertical, Download, Upload, Save, Briefcase, Calendar, ClipboardList, Database, Trophy, Link, MapPin, Tag } from "lucide-react";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import { cn } from "../utils/cn";
import type { UserProfile, RolePermission, UnifiedEntryRegistry } from "../types";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  systemName: string;
  showSettings?: boolean;
  onLogout?: () => void;
  systemLanguage: Language;
  showMailIcon?: boolean;
  integrationsConfig?: any;
  showRagAi?: boolean;
  currentUser: UserProfile | null;
  roles: RolePermission[];
  canEditNav: boolean;
  onSaveUserLayout: (layout: string[]) => void;
  unifiedEntries?: UnifiedEntryRegistry[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  systemName,
  showSettings = true,
  onLogout,
  systemLanguage,
  showMailIcon = false,
  integrationsConfig,
  showRagAi = false,
  currentUser,
  roles,
  canEditNav,
  onSaveUserLayout,
  unifiedEntries = []
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true); // Default collapsed for the minimalist aesthetic
  const sidebarRef = React.useRef<HTMLElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Edit Mode states
  const [isEditingNav, setIsEditingNav] = useState(false);
  const [activeItems, setActiveItems] = useState<string[]>([]);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);

  // Drag states
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draggedSource, setDraggedSource] = useState<"active" | "hidden" | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Click outside sidebar listener to contract it
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isEditingNav) return;
      if (!isCollapsed && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsCollapsed(true);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCollapsed, isEditingNav]);
  
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

  // Dynamic Unified Entries Items mapping
  const dynamicUeItems = React.useMemo(() => {
    return unifiedEntries
      .filter(ue => !ue.archived)
      .map(ue => {
        let IconComponent = FolderOpen;
        switch (ue.icon) {
          case "Briefcase": IconComponent = Briefcase; break;
          case "Calendar": IconComponent = Calendar; break;
          case "ClipboardList": IconComponent = ClipboardList; break;
          case "Database": IconComponent = Database; break;
          case "FolderOpen": IconComponent = FolderOpen; break;
          case "Trophy": IconComponent = Trophy; break;
          case "Link": IconComponent = Link; break;
          case "MapPin": IconComponent = MapPin; break;
          case "Users": IconComponent = Users; break;
          case "Tag": IconComponent = Tag; break;
        }
        return {
          id: `ue_${ue.id}`,
          label: ue.name,
          icon: IconComponent,
          isCustomUE: true,
          customColor: ue.color
        };
      });
  }, [unifiedEntries]);

  // Layout resolution logic
  const defaultSystemLayout = React.useMemo(() => {
    return [
      "dashboard", 
      "overview", 
      "rag_ai", 
      "leads", 
      "clients", 
      "meetings", 
      ...dynamicUeItems.map(item => item.id),
      "files", 
      "email"
    ];
  }, [dynamicUeItems]);

  const userMetadata = React.useMemo(() => {
    if (!currentUser?.metadata_json) return null;
    try {
      return typeof currentUser.metadata_json === "string"
        ? JSON.parse(currentUser.metadata_json)
        : currentUser.metadata_json;
    } catch (e) {
      return null;
    }
  }, [currentUser]);

  const userRole = React.useMemo(() => {
    return roles.find(r => r.name === currentUser?.role);
  }, [roles, currentUser]);

  const resolvedLayout = React.useMemo(() => {
    if (canEditNav && userMetadata?.navLayout) {
      return userMetadata.navLayout;
    }
    if (userRole?.defaultNavLayout) {
      return userRole.defaultNavLayout;
    }
    return defaultSystemLayout;
  }, [canEditNav, userMetadata, userRole, defaultSystemLayout]);

  // Initialize active/hidden items when edit mode starts
  React.useEffect(() => {
    if (isEditingNav) {
      const active = resolvedLayout.filter((id: string) => defaultSystemLayout.includes(id));
      const hidden = defaultSystemLayout.filter((id: string) => !active.includes(id));
      setActiveItems(active);
      setHiddenItems(hidden);
      setIsCollapsed(false); // Force expand when editing
    }
  }, [isEditingNav, resolvedLayout, defaultSystemLayout]);

  // Close editing layout if sidebar collapses
  React.useEffect(() => {
    if (isCollapsed && isEditingNav) {
      setIsEditingNav(false);
    }
  }, [isCollapsed, isEditingNav]);

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent, id: string, source: "active" | "hidden") => {
    setDraggedItemId(id);
    setDraggedSource(source);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedSource === "active" || draggedSource === "hidden") {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, target: "active" | "hidden") => {
    e.preventDefault();
    if (!draggedItemId || !draggedSource) return;

    let newActive = [...activeItems];
    let newHidden = [...hiddenItems];

    if (target === "active") {
      if (draggedSource === "active") {
        // Reordering
        const currentIndex = newActive.indexOf(draggedItemId);
        if (currentIndex > -1) {
          newActive.splice(currentIndex, 1);
          const dropIdx = dragOverIndex !== null ? dragOverIndex : newActive.length;
          newActive.splice(dropIdx, 0, draggedItemId);
        }
      } else if (draggedSource === "hidden") {
        // Move from hidden to active
        const currentIndex = newHidden.indexOf(draggedItemId);
        if (currentIndex > -1) {
          newHidden.splice(currentIndex, 1);
          const dropIdx = dragOverIndex !== null ? dragOverIndex : newActive.length;
          newActive.splice(dropIdx, 0, draggedItemId);
        }
      }
    } else if (target === "hidden") {
      if (draggedSource === "active") {
        // Move from active to hidden
        const currentIndex = newActive.indexOf(draggedItemId);
        if (currentIndex > -1) {
          newActive.splice(currentIndex, 1);
          if (!newHidden.includes(draggedItemId)) {
            newHidden.push(draggedItemId);
          }
        }
      }
    }

    setActiveItems(newActive);
    setHiddenItems(newHidden);
    onSaveUserLayout(newActive);

    // Reset drag states
    setDraggedItemId(null);
    setDraggedSource(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDraggedSource(null);
    setDragOverIndex(null);
  };

  // Download Layout JSON file
  const handleDownloadLayout = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ layout: activeItems, hidden: hiddenItems }, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "ccrm-navigation-layout.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Upload Layout JSON file
  const handleUploadLayout = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = (event) => {
      try {
        const content = JSON.parse(event.target?.result as string);
        if (content && Array.isArray(content.layout)) {
          const newActive = content.layout.filter((id: string) => defaultSystemLayout.includes(id));
          const newHidden = Array.isArray(content.hidden)
            ? content.hidden.filter((id: string) => defaultSystemLayout.includes(id))
            : defaultSystemLayout.filter(id => !newActive.includes(id));

          setActiveItems(newActive);
          setHiddenItems(newHidden);
          onSaveUserLayout(newActive);
          (window as any).showToast("Layout imported successfully!");
        } else {
          alert("Invalid layout file format.");
        }
      } catch (err) {
        alert("Failed to parse JSON file.");
      }
    };
    fileReader.readAsText(file);
    e.target.value = "";
  };

  const allPossibleItems = React.useMemo(() => {
    return [
      { id: "dashboard", label: systemLanguage === "sk" ? "Panel úloh" : systemLanguage === "hu" ? "Feladat Irányítópult" : "Task Dashboard", icon: LayoutDashboard },
      { id: "overview", label: getTranslation(systemLanguage, "sidebar.dashboard"), icon: BarChart3 },
      { id: "rag_ai", label: systemLanguage === "sk" ? "RAG AI Asistent" : systemLanguage === "hu" ? "RAG AI Asszisztens" : "RAG AI Assistant", icon: Brain, isPurple: true },
      { id: "leads", label: getTranslation(systemLanguage, "sidebar.leads"), icon: TableProperties },
      { id: "clients", label: getTranslation(systemLanguage, "sidebar.clients"), icon: Users },
      { id: "meetings", label: getTranslation(systemLanguage, "sidebar.meetings"), icon: PencilLine, isNightBlue: true },
      ...dynamicUeItems,
      { id: "files", label: getTranslation(systemLanguage, "sidebar.files"), icon: FolderOpen },
      { id: "email", label: systemLanguage === "sk" ? "Pošta" : systemLanguage === "hu" ? "Levelezés" : "Mail Client", icon: Mail }
    ];
  }, [systemLanguage, dynamicUeItems]);

  const isItemVisibleInSystem = (id: string) => {
    if (id === "rag_ai") {
      return showRagAi && integrationsConfig?.vectorDbValidated === true && integrationsConfig?.vectorDb && integrationsConfig?.vectorDb !== "none";
    }
    if (id === "email") {
      return showMailIcon;
    }
    return true;
  };

  const activeLayout = isEditingNav ? activeItems : resolvedLayout;
  const menuItems = activeLayout
    .filter(isItemVisibleInSystem)
    .map((id: string) => allPossibleItems.find(item => item.id === id))
    .filter(Boolean) as any[];

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
          {menuItems.map((item: any, idx: number) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === "clients" && activeTab.startsWith("client-"));
            const isOver = dragOverIndex === idx;
            return (
              <React.Fragment key={item.id}>
                {isOver && isEditingNav && (
                  <div className="w-full h-1 bg-indigo-500 rounded-full my-1 animate-pulse" />
                )}
                <button
                  draggable={isEditingNav}
                  onDragStart={(e) => handleDragStart(e, item.id, "active")}
                  onDragEnter={(e) => handleDragEnter(e, idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, "active")}
                onClick={(e) => {
                  if (isEditingNav) {
                    e.preventDefault();
                    return;
                  }
                  setActiveTab(item.id);
                  setIsCollapsed(true);
                }}
                className={cn(
                  "w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all duration-200 group text-left relative",
                  isEditingNav
                    ? "bg-slate-50/50 border border-slate-200/80 hover:bg-slate-100/50 cursor-grab active:cursor-grabbing"
                    : item.isCustomUE
                      ? (isActive
                          ? "text-white font-bold"
                          : "text-slate-450 hover:text-slate-700 hover:bg-slate-100/50")
                      : item.isPurple
                        ? (isActive
                            ? "bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/30 border border-purple-500/20"
                            : "text-purple-600 hover:text-purple-700 hover:bg-purple-50/50")
                        : item.isNightBlue
                          ? (isActive
                              ? "bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/30 border border-slate-800/20"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/50")
                          : isActive 
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
                            : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/50",
                  isOver && "border-2 border-dashed border-indigo-400 bg-indigo-50/40 scale-[0.98]"
                )}
                style={(!isEditingNav && isActive && item.isCustomUE) ? { 
                  backgroundColor: item.customColor,
                  boxShadow: `0 10px 15px -3px ${item.customColor}4D, 0 4px 6px -4px ${item.customColor}4D`
                } : undefined}
              >
                {isEditingNav && (
                  <GripVertical className="h-4 w-4 text-slate-400 shrink-0" />
                )}
                <Icon 
                  className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-200",
                    isEditingNav
                      ? "text-slate-550"
                      : item.isCustomUE
                        ? (isActive ? "text-white" : "group-hover:scale-115")
                        : item.isPurple
                          ? (isActive ? "text-white" : "text-purple-600 group-hover:scale-110")
                          : item.isNightBlue
                            ? (isActive ? "text-white" : "text-slate-700 group-hover:scale-110")
                            : isActive ? "text-white" : "text-slate-400 group-hover:scale-105"
                  )}
                  style={(!isEditingNav && !isActive && item.isCustomUE) ? { color: item.customColor } : undefined}
                />
                
                {!isCollapsed && (
                  <span className={cn(
                    "text-sm font-heading font-medium tracking-wide",
                    isEditingNav
                      ? "text-slate-700 font-semibold"
                      : item.isCustomUE
                        ? (isActive ? "text-white font-bold" : "text-slate-500 font-semibold group-hover:text-slate-700")
                        : item.isPurple 
                          ? (isActive ? "text-white font-bold" : "text-purple-600 font-bold")
                          : item.isNightBlue
                            ? (isActive ? "text-white font-bold" : "text-slate-800 font-semibold")
                            : isActive ? "text-white font-bold" : "text-slate-500 font-semibold"
                  )}>
                    {item.label}
                  </span>
                )}
              </button>
            </React.Fragment>
            );
          })}

          {/* Collapse/Expand Toggle Button */}
          {!isEditingNav && (
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
          )}
        </nav>

        {/* Bottom Pinned Actions Footer */}
        <div className="p-4 flex flex-col gap-2 shrink-0 border-t border-slate-100/80 bg-slate-50/30">
          {/* Pencil Edit Icon Button - Only visible if permitted */}
          {canEditNav && (
            <button
              onClick={() => {
                if (isEditingNav) {
                  try {
                    onSaveUserLayout(activeItems);
                  } catch (err) {
                    console.error("Failed to save navigation layout", err);
                  }
                  setIsEditingNav(false);
                  setIsCollapsed(true);
                } else {
                  setIsEditingNav(true);
                  setIsCollapsed(false);
                }
              }}
              className={cn(
                "w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all duration-200 group text-left cursor-pointer",
                isEditingNav
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/50"
              )}
              title={
                isEditingNav
                  ? (systemLanguage === "sk" ? "Uložiť rozloženie menu" : systemLanguage === "hu" ? "Elrendezés mentése" : "Save navigation layout")
                  : (systemLanguage === "sk" ? "Upraviť štruktúru menu" : "Edit navigation layout")
              }
            >
              {isEditingNav ? (
                <Save className="h-5 w-5 shrink-0 transition-transform group-hover:scale-110" />
              ) : (
                <Pencil className="h-5 w-5 shrink-0 transition-transform group-hover:scale-110" />
              )}
              {!isCollapsed && (
                <span className="text-xs font-semibold tracking-wide">
                  {isEditingNav
                    ? (systemLanguage === "sk" ? "Uložiť rozloženie" : systemLanguage === "hu" ? "Elrendezés mentése" : "Save Layout")
                    : (systemLanguage === "sk" ? "Upraviť menu" : "Edit Navigation")}
                </span>
              )}
            </button>
          )}

          {/* Download and Upload Layout Buttons inside Edit Mode */}
          {isEditingNav && (
            <div className="flex gap-2 mt-1 mb-1 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={handleDownloadLayout}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-slate-105 hover:bg-slate-200 text-[10px] font-black text-slate-700 uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                title="Download Layout JSON"
              >
                <Download className="h-3.5 w-3.5 animate-bounce" />
                <span>{systemLanguage === "sk" ? "Export" : "Export"}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[10px] font-black text-indigo-750 uppercase tracking-wider transition-all border border-indigo-200 shadow-sm cursor-pointer"
                title="Upload Layout JSON"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{systemLanguage === "sk" ? "Import" : "Import"}</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                onChange={handleUploadLayout}
                className="hidden"
              />
            </div>
          )}

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
                (window as any).showToast("Sign out simulation active. Workspace locked.");
              }
            }}
            className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 transition-all duration-200 text-left group"
          >
            <LogOut className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-rose-500 transition-colors" />
            {!isCollapsed && <span className="text-xs font-semibold tracking-wide">{getTranslation(systemLanguage, "sidebar.logout")}</span>}
          </button>
        </div>
      </aside>

      {/* AVAILABLE MODULES DRAWER PANEL (Slides out to the right of the sidebar) */}
      {isEditingNav && (
        <div 
          className="fixed left-64 top-0 h-screen w-64 bg-slate-50 border-r border-slate-200/80 flex flex-col p-4 animate-in slide-in-from-left duration-300 z-[999] shadow-md select-none border-t border-slate-200"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, 'hidden')}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4 shrink-0">
            <div className="flex flex-col text-left">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                {systemLanguage === "sk" ? "Dostupné moduly" : systemLanguage === "hu" ? "Elérhető modulok" : "Available Modules"}
              </span>
              <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider mt-0.5">
                {systemLanguage === "sk" ? "Skryté položky menu" : "Hidden sidebar items"}
              </span>
            </div>
            <button 
              onClick={() => setIsEditingNav(false)}
              className="text-slate-400 hover:text-slate-650 transition-colors p-1 hover:bg-slate-200/50 rounded-lg cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {hiddenItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 select-none">
                <span className="text-2xl mb-1.5">✨</span>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  {systemLanguage === "sk" ? "Všetky moduly sú aktívne" : "All modules are active"}
                </p>
                <p className="text-[9px] font-semibold text-slate-400 mt-1">
                  {systemLanguage === "sk" ? "Presuňte sem položku pre skrytie" : "Drag a module here to hide it"}
                </p>
              </div>
            ) : (
              hiddenItems.map((id) => {
                const item = allPossibleItems.find((i) => i.id === id);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.id, 'hidden')}
                    onDragEnd={handleDragEnd}
                    className="w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm transition-all duration-200 cursor-grab active:cursor-grabbing hover:bg-slate-50 relative group"
                  >
                    <GripVertical className="h-4 w-4 text-slate-350 shrink-0" />
                    <Icon className="h-5 w-5 text-slate-405 shrink-0" />
                    <span className="text-xs font-semibold text-slate-700 tracking-wide text-left">
                      {item.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

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
            {menuItems.map((item: any) => {
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
                    item.isPurple
                      ? (isActive
                          ? "bg-purple-600 border-purple-700 text-white"
                          : (isMobileMenuOpen
                              ? "bg-purple-50 border-purple-200 text-purple-600"
                              : "bg-purple-50/50 border-purple-100 text-purple-500 hover:bg-purple-100 hover:text-purple-700"))
                      : item.isNightBlue
                        ? (isActive
                            ? "bg-slate-900 border-slate-950 text-white"
                            : (isMobileMenuOpen
                                ? "bg-slate-100 border-slate-200 text-slate-800"
                                : "bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900"))
                        : isActive
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
                  (window as any).showToast("Sign out simulation active. Workspace locked.");
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
