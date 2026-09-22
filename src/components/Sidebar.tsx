import React, { useState, useRef, useEffect, useMemo } from "react";
import * as Icons from "lucide-react";
import {
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Settings,
  LogOut,
  TableProperties,
  Users,
  FolderOpen,
  BarChart3,
  Mail,
  Brain,
  PencilLine,
  Pencil,
  X,
  Sparkles,
  Coins,
  ListTodo,
  Pin,
  Plus
} from "lucide-react";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import { cn } from "../utils/cn";
import { SOCIAL_MEDIA_ENABLED } from "../utils/featureFlags";
import type { UserProfile, RolePermission, UnifiedEntryRegistry, CustomDashboard } from "../types";
import { StartMenu } from "./StartMenu";
import { FlockIcon } from "./icons/FlockIcon";
import { isHomeDashboard } from "../utils/dashboardWidgets";
import { useUserPref } from "../utils/userPrefs";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue
} from "framer-motion";
import { normalizeSidebarGroups, flattenSidebarGroups, type SidebarGroup } from "../utils/sidebarLayout";

/**
 * `dashboard` used to BE the task panel — the tasks section was split out of it
 * and the id now belongs to the widget dashboard. A navigation layout saved
 * before the split lists only "dashboard", which would leave its owner with no
 * way back to their tasks, so the new item is slotted in right behind it.
 */
const withTasksSection = (layout: string[]): string[] => {
  if (layout.includes("tasks")) return layout;
  const at = layout.indexOf("dashboard");
  if (at === -1) return layout;
  const next = [...layout];
  next.splice(at + 1, 0, "tasks");
  return next;
};

const ALL_LUCIDE_ICONS = Object.keys(Icons).filter((key) => {
  return (
    /^[A-Z][a-zA-Z0-9]*$/.test(key) &&
    key !== "createReactComponent" &&
    key !== "Icon"
  );
});

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
  /** Route gate from the permission resolver — the sidebar never reads roles itself. */
  canOpenRoute: (routeId: string) => boolean;
  onSaveUserLayout: (layout: string[], hidden?: string[]) => void;
  unifiedEntries?: UnifiedEntryRegistry[];
  customDashboards?: CustomDashboard[];
  onSaveCustomDashboards?: (dashboards: CustomDashboard[]) => void;
  defaultPage?: string;
  onSaveDefaultPage?: (pageId: string) => void;
}

interface SidebarDockButtonProps {
  entry: {
    type: "item";
    item: any;
    group: SidebarGroup;
    indexInGroup: number;
  };
  isActive: boolean;
  isExpanded: boolean;
  isDockMode: boolean;
  mouseY: MotionValue<number>;
  widthClasses: {
    collapsed: string;
    expanded: string;
    itemPad: string;
    iconSize: string;
    textSize: string;
    spacing: string;
    headerHeight: string;
  };
  dragOverIndex: number | null;
  isStartMenuOpen: boolean;
  startMenuEditMode: boolean;
  onItemClick: (itemId: string) => void;
  onHoverStart: (itemId: string, rect: DOMRect) => void;
  onHoverEnd: () => void;
  onDrop: (e: React.DragEvent, groupId: string, indexInGroup: number) => void;
  onDragOver: (e: React.DragEvent, indexInGroup: number) => void;
  onTogglePinItem: (itemId: string) => void;
  t: (en: string, sk: string, hu: string) => string;
}

const SidebarDockButton: React.FC<SidebarDockButtonProps> = ({
  entry,
  isActive,
  isExpanded,
  isDockMode,
  mouseY,
  widthClasses,
  dragOverIndex,
  isStartMenuOpen,
  startMenuEditMode,
  onItemClick,
  onHoverStart,
  onHoverEnd,
  onDrop,
  onDragOver,
  onTogglePinItem,
  t,
}) => {
  const item = entry.item;
  const Icon = item.icon;
  const btnRef = useRef<HTMLButtonElement>(null);

  // Magic UI Framer Motion distance & physics spring animation
  const distanceCalc = useTransform(mouseY, (val: number) => {
    if (!isDockMode || isExpanded || val === Infinity) return Infinity;
    const bounds = btnRef.current?.getBoundingClientRect();
    if (!bounds) return Infinity;
    return val - (bounds.y + bounds.height / 2);
  });

  const scaleTransform = useTransform(
    distanceCalc,
    [-140, 0, 140],
    [1.0, 1.85, 1.0]
  );

  const springScale = useSpring(scaleTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  // Lateral projection (moves slightly out into canvas when magnified)
  const xTransform = useTransform(springScale, (s) => (s > 1.02 ? (s - 1) * 8 : 0));
  const zIndexTransform = useTransform(springScale, (s) => (s > 1.02 ? Math.round(s * 100) : 1));

  // Dynamic push-away displacement: moves items above cursor upward (-y) and items below downward (+y)
  const yDisplacement = useTransform(
    distanceCalc,
    [-140, -70, 0, 70, 140],
    [0, 16, 0, -16, 0]
  );

  const springY = useSpring(yDisplacement, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  return (
    <motion.button
      ref={btnRef}
      type="button"
      onClick={() => {
        if (isStartMenuOpen && startMenuEditMode) return;
        onItemClick(item.id);
      }}
      onMouseEnter={() => {
        if (isDockMode && !isExpanded && btnRef.current) {
          onHoverStart(item.id, btnRef.current.getBoundingClientRect());
        }
      }}
      onMouseMove={() => {
        if (isDockMode && !isExpanded && btnRef.current) {
          onHoverStart(item.id, btnRef.current.getBoundingClientRect());
        }
      }}
      onMouseLeave={() => {
        if (isDockMode && !isExpanded) {
          onHoverEnd();
        }
      }}
      onDragOver={(e) => onDragOver(e, entry.indexInGroup)}
      onDrop={(e) => onDrop(e, entry.group.id, entry.indexInGroup)}
      style={{
        scale: !isExpanded && isDockMode ? springScale : 1,
        x: !isExpanded && isDockMode ? xTransform : 0,
        y: !isExpanded && isDockMode ? springY : 0,
        zIndex: !isExpanded && isDockMode ? zIndexTransform : undefined,
        transformOrigin: "center left",
        ...(isActive && (item.isCustomUE || item.isCustomDash)
          ? {
              backgroundColor: item.customColor,
              boxShadow: `0 10px 15px -3px ${item.customColor}4D, 0 4px 6px -4px ${item.customColor}4D`
            }
          : {})
      }}
      className={cn(
        "w-full flex items-center gap-3.5 rounded-2xl transition-colors duration-150 group text-left relative cursor-pointer",
        widthClasses.itemPad,
        dragOverIndex === entry.indexInGroup && "ring-2 ring-indigo-400 bg-indigo-50/50",
        item.isCustomUE || item.isCustomDash
          ? isActive
            ? "text-white font-bold"
            : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/50"
          : item.isPurpleToGreen
            ? isActive
              ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 text-white font-bold shadow-lg shadow-purple-600/30 border border-purple-500/20"
              : "text-purple-600 hover:text-emerald-600 hover:bg-gradient-to-r hover:from-purple-50/60 hover:to-emerald-50/60"
            : item.isPurple
              ? isActive
                ? "bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/30 border border-purple-500/20"
                : "text-purple-600 hover:text-purple-700 hover:bg-purple-50/50"
              : item.isLavender
                ? isActive
                  ? "bg-purple-500 text-white font-bold shadow-lg shadow-purple-500/30 border border-purple-400/20"
                  : "text-purple-500 hover:text-purple-600 hover:bg-purple-50/50"
                : item.isNavy
                  ? isActive
                    ? "bg-blue-950 text-white font-bold shadow-lg shadow-blue-950/30 border border-blue-900/20"
                    : "text-blue-950 hover:text-blue-900 hover:bg-blue-50/50"
                  : item.isIndigo
                    ? isActive
                      ? "bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30 border border-indigo-500/20"
                      : "text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50/50"
                    : item.isEmerald
                      ? isActive
                        ? "bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/30 border border-emerald-500/20"
                        : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50"
                      : item.isNightBlue
                        ? isActive
                          ? "bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/30 border border-slate-800/20"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/50"
                        : isActive
                          ? item.id === "leads"
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
                          : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/50"
      )}
      title={!isDockMode || isExpanded ? item.label : undefined}
    >
      <Icon
        className={cn(
          widthClasses.iconSize,
          "shrink-0 transition-transform duration-200",
          isActive ? "text-white" : "group-hover:scale-105"
        )}
        style={!isActive ? { color: item.color || item.customColor } : undefined}
      />

      {isExpanded && (
        <span
          className={cn(
            "font-heading font-medium tracking-wide truncate min-w-0 flex-1",
            widthClasses.textSize,
            item.isCustomUE || item.isCustomDash
              ? isActive
                ? "text-white font-bold"
                : "text-slate-500 font-semibold group-hover:text-slate-700"
              : item.isPurpleToGreen
                ? isActive
                  ? "text-white font-bold"
                  : "text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-emerald-600 font-bold"
                : item.isPurple
                  ? isActive
                    ? "text-white font-bold"
                    : "text-purple-600 font-bold"
                  : item.isLavender
                    ? isActive
                      ? "text-white font-bold"
                      : "text-purple-500 font-semibold"
                    : item.isNavy
                      ? isActive
                        ? "text-white font-bold"
                        : "text-blue-950 font-semibold"
                      : item.isNightBlue
                        ? isActive
                          ? "text-white font-bold"
                          : "text-slate-800 font-semibold"
                        : isActive
                          ? "text-white font-bold"
                          : "text-slate-500 font-semibold"
          )}
        >
          {item.label}
        </span>
      )}

      {/* Quick Unpin Button in Edit Mode */}
      {isStartMenuOpen && startMenuEditMode && isExpanded && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePinItem(item.id);
          }}
          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0 ml-auto"
          title={t("Remove from sidebar", "Odstrániť z bočného menu", "Eltávolítás az oldalsávról")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </motion.button>
  );
};

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
  canOpenRoute,
  onSaveUserLayout,
  unifiedEntries = [],
  customDashboards = [],
  onSaveCustomDashboards,
  defaultPage: _defaultPage,
  onSaveDefaultPage: _onSaveDefaultPage
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // Preferences
  const [sidebarPinned, setSidebarPinned] = useUserPref("sidebarPinned");
  const [sidebarCompactness] = useUserPref("sidebarCompactness");
  const [sidebarUnpinnedStyle] = useUserPref("sidebarUnpinnedStyle");
  const [storedSidebarGroups, setStoredSidebarGroups] = useUserPref("sidebarGroups");

  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const [startMenuEditMode, setStartMenuEditMode] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Magic UI Dynamic Dock states
  const dockMouseY = useMotionValue(Infinity);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoveredItemPos, setHoveredItemPos] = useState<{ top: number; left: number } | null>(null);

  // Drag states
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Mobile Drawer states
  const [startY, setStartY] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Custom Dashboard Modal
  const [isDashModalOpen, setIsDashModalOpen] = useState(false);
  const [dashName, setDashName] = useState("");
  const [dashIcon, setDashIcon] = useState("LayoutDashboard");
  const [dashColor, setDashColor] = useState("#4f46e5");
  const [isIconSearchOpen, setIsIconSearchOpen] = useState(false);
  const [iconSearchQuery, setIconSearchQuery] = useState("");

  const dashColors = [
    "#2563eb",
    "#4f46e5",
    "#059669",
    "#8b5cf6",
    "#b45309",
    "#e11d48",
    "#0891b2",
    "#db2777"
  ];

  // Dynamic Dashboards
  const dynamicDashItems = useMemo(() => {
    return (customDashboards || [])
      .filter((dash) => !dash.archived && !isHomeDashboard(dash.id))
      .map((dash) => {
        const IconComponent = (Icons as any)[dash.icon] || LayoutDashboard;
        return {
          id: `dash_${dash.id}`,
          label: dash.name,
          icon: IconComponent,
          isCustomDash: true,
          customColor: dash.color
        };
      });
  }, [customDashboards]);

  // Dynamic Unified Entries
  const dynamicUeItems = useMemo(() => {
    return (unifiedEntries || [])
      .filter((ue) => !ue.archived)
      .map((ue) => {
        const IconComponent = (Icons as any)[ue.icon] || FolderOpen;
        return {
          id: `ue_${ue.id}`,
          label: ue.name,
          icon: IconComponent,
          isCustomUE: true,
          customColor: ue.color
        };
      });
  }, [unifiedEntries]);

  // Default system layout
  const defaultSystemLayout = useMemo(() => {
    return [
      "dashboard",
      "tasks",
      "overview",
      "projects",
      "rag_ai",
      "sai",
      "leads",
      "clients",
      "invoices",
      "warehouse",
      "financial",
      "meetings",
      ...dynamicUeItems.map((item) => item.id),
      ...dynamicDashItems.map((item) => item.id),
      "files",
      "email",
      "automation",
      "social_media",
      "updates"
    ];
  }, [dynamicUeItems, dynamicDashItems]);

  const userMetadata = useMemo(() => {
    if (!currentUser?.metadata_json) return null;
    try {
      return typeof currentUser.metadata_json === "string"
        ? JSON.parse(currentUser.metadata_json)
        : currentUser.metadata_json;
    } catch (e) {
      return null;
    }
  }, [currentUser]);

  const userRole = useMemo(() => {
    return roles.find((r) => r.name === currentUser?.role);
  }, [roles, currentUser]);

  const resolvedLayout = useMemo(() => {
    if (canEditNav && Array.isArray(userMetadata?.navLayout) && userMetadata.navLayout.length > 0) {
      const stored: string[] = userMetadata.navLayout;
      return withTasksSection(stored);
    }
    if (userRole?.defaultNavLayout && Array.isArray(userRole.defaultNavLayout) && userRole.defaultNavLayout.length > 0) {
      return withTasksSection(userRole.defaultNavLayout);
    }
    return defaultSystemLayout;
  }, [canEditNav, userMetadata, userRole, defaultSystemLayout]);

  const allPossibleItems = useMemo(() => {
    return [
      { id: "dashboard", label: getTranslation(systemLanguage, "sidebar.dashboard"), icon: LayoutDashboard, color: "var(--color-indigo-600)" },
      { id: "tasks", label: getTranslation(systemLanguage, "sidebar.tasks"), icon: ListTodo, color: "#ff5d00" },
      { id: "overview", label: getTranslation(systemLanguage, "sidebar.analytics"), icon: BarChart3, color: "var(--color-cyan-600)" },
      { id: "projects", label: systemLanguage === "sk" ? "Projekty" : systemLanguage === "hu" ? "Projektek" : "Projects", icon: Icons.Briefcase || LayoutDashboard, color: "var(--color-purple-500)", isLavender: true },
      { id: "rag_ai", label: systemLanguage === "sk" ? "RAG AI Asistent" : systemLanguage === "hu" ? "RAG AI Asszisztens" : "RAG AI Assistant", icon: Brain, color: "var(--color-violet-500)", isPurple: true },
      { id: "sai", label: "SAI", icon: FlockIcon, color: "#8b5cf6", isPurpleToGreen: true },
      { id: "leads", label: getTranslation(systemLanguage, "sidebar.leads"), icon: TableProperties, color: "var(--color-blue-600)" },
      { id: "clients", label: getTranslation(systemLanguage, "sidebar.clients"), icon: Users, color: "var(--color-emerald-600)" },
      { id: "invoices", label: systemLanguage === "sk" ? "Cenové ponuky & Faktúry" : systemLanguage === "hu" ? "Ajánlatok és számlák" : "Invoices & Offers", icon: Icons.FileText || Coins, color: "var(--color-indigo-500)", isIndigo: true },
      { id: "warehouse", label: getTranslation(systemLanguage, "sidebar.warehouse"), icon: Icons.Package || Icons.Boxes || FolderOpen, color: "var(--color-blue-900)", isNavy: true },
      { id: "financial", label: getTranslation(systemLanguage, "sidebar.financial"), icon: Coins, color: "var(--color-emerald-500)", isEmerald: true },
      { id: "meetings", label: getTranslation(systemLanguage, "sidebar.meetings"), icon: PencilLine, color: "var(--color-indigo-600)", isNightBlue: true },
      ...dynamicUeItems,
      ...dynamicDashItems,
      { id: "files", label: getTranslation(systemLanguage, "sidebar.files"), icon: FolderOpen, color: "var(--color-amber-700)" },
      { id: "email", label: systemLanguage === "sk" ? "Pošta" : systemLanguage === "hu" ? "Levelezés" : "Mail Client", icon: Mail, color: "var(--color-pink-600)" },
      { id: "automation", label: systemLanguage === "sk" ? "Automatizácia" : systemLanguage === "hu" ? "Automatizálás" : "Automation", icon: Icons.Workflow || Icons.Network || Icons.GitFork || FolderOpen, color: "var(--color-purple-800)", isPurple: true },
      { id: "social_media", label: systemLanguage === "sk" ? "Sociálne siete" : systemLanguage === "hu" ? "Közösségi média" : "Social Media", icon: Icons.Share2 || Icons.Globe, color: "var(--color-rose-500)", isRose: true },
      { id: "updates", label: systemLanguage === "sk" ? "Novinky" : systemLanguage === "hu" ? "Újdonságok" : "Updates", icon: Sparkles, color: "var(--color-amber-600)" }
    ];
  }, [systemLanguage, dynamicUeItems, dynamicDashItems]);

  const isItemVisibleInSystem = (id: string) => {
    if (!canOpenRoute(id)) return false;
    if (id === "rag_ai") {
      return (
        showRagAi &&
        integrationsConfig?.vectorDbValidated === true &&
        integrationsConfig?.vectorDb &&
        integrationsConfig?.vectorDb !== "none"
      );
    }
    if (id === "email") {
      return showMailIcon;
    }
    if (id === "social_media") {
      return SOCIAL_MEDIA_ENABLED;
    }
    return true;
  };

  const activeVisibleLayout = useMemo(() => {
    return resolvedLayout.filter(isItemVisibleInSystem);
  }, [resolvedLayout, canOpenRoute, showRagAi, integrationsConfig, showMailIcon]);

  // Normalized Groups
  const sidebarGroups = useMemo(() => {
    return normalizeSidebarGroups(storedSidebarGroups, activeVisibleLayout);
  }, [storedSidebarGroups, activeVisibleLayout]);

  // Dimensions & Density Tokens
  const compactness = sidebarCompactness || "comfortable";
  const isPinned = sidebarPinned === true;
  const isDockMode = !isPinned && sidebarUnpinnedStyle === "dock";
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  // When pinned or editing navigation, sidebar stays expanded
  const isExpanded = isPinned || !isCollapsed || (isStartMenuOpen && startMenuEditMode);

  const widthClasses = {
    compact: {
      collapsed: "w-16",
      expanded: "w-56",
      itemPad: "px-2.5 py-1.5",
      iconSize: "h-4 w-4",
      textSize: "text-xs",
      spacing: "space-y-1",
      headerHeight: "h-16"
    },
    comfortable: {
      collapsed: "w-20",
      expanded: "w-64",
      itemPad: "px-3 py-2.5",
      iconSize: "h-5 w-5",
      textSize: "text-sm",
      spacing: "space-y-2",
      headerHeight: "h-20"
    },
    spacious: {
      collapsed: "w-24",
      expanded: "w-72",
      itemPad: "px-4 py-3.5",
      iconSize: "h-6 w-6",
      textSize: "text-base",
      spacing: "space-y-3",
      headerHeight: "h-24"
    }
  }[compactness];


  // Click outside to collapse unpinned overlay
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isPinned) return;
      if (!isCollapsed && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsCollapsed(true);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCollapsed, isPinned]);

  // Touch Swipe for Mobile Menu
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endY = e.changedTouches[0].clientY;
    if (startY - endY > 40) setIsMobileMenuOpen(true);
    if (endY - startY > 40) setIsMobileMenuOpen(false);
  };

  // Toggle Pin item to Sidebar
  const handleTogglePinItem = (itemId: string) => {
    const currentActive = resolvedLayout;
    const isAlreadyPinned = currentActive.includes(itemId);
    let newActive: string[];
    let newHidden: string[];

    if (isAlreadyPinned) {
      newActive = currentActive.filter((id: string) => id !== itemId);
      const currentHidden = userMetadata?.navHidden || defaultSystemLayout.filter((id: string) => !newActive.includes(id));
      newHidden = Array.from(new Set([...currentHidden, itemId]));
    } else {
      newActive = [...currentActive, itemId];
      const currentHidden = userMetadata?.navHidden || [];
      newHidden = currentHidden.filter((id: string) => id !== itemId);
    }

    onSaveUserLayout(newActive, newHidden);

    if (storedSidebarGroups) {
      const updated = normalizeSidebarGroups(storedSidebarGroups, newActive);
      setStoredSidebarGroups(updated);
    }
  };

  // Drag & Drop onto sidebar
  const handleDropOnSidebar = (e: React.DragEvent, targetGroupId?: string, targetIndex?: number) => {
    e.preventDefault();
    let droppedId = draggedItemId;

    if (!droppedId) {
      try {
        const json = e.dataTransfer.getData("application/json");
        if (json) {
          const parsed = JSON.parse(json);
          if (parsed.id) droppedId = parsed.id;
        }
      } catch (err) {}
    }
    if (!droppedId) {
      droppedId = e.dataTransfer.getData("text/plain");
    }

    if (!droppedId || !isItemVisibleInSystem(droppedId)) {
      setDraggedItemId(null);
      setDragOverIndex(null);
      return;
    }

    const currentGroups = normalizeSidebarGroups(storedSidebarGroups, activeVisibleLayout);
    const grpId = targetGroupId || currentGroups[0]?.id || "group_main";

    const nextGroups = currentGroups.map((g) => ({
      ...g,
      items: g.items.filter((id) => id !== droppedId)
    }));

    const targetGrp = nextGroups.find((g) => g.id === grpId);
    if (targetGrp) {
      const insertAt = targetIndex !== undefined && targetIndex >= 0 ? targetIndex : targetGrp.items.length;
      targetGrp.items.splice(insertAt, 0, droppedId);
    } else if (nextGroups.length > 0) {
      nextGroups[0].items.push(droppedId);
    }

    const newActiveLayout = flattenSidebarGroups(nextGroups);
    setStoredSidebarGroups(nextGroups);
    onSaveUserLayout(newActiveLayout);

    setDraggedItemId(null);
    setDragOverIndex(null);
  };

  const handleCreateDashboard = () => {
    if (!dashName.trim()) {
      alert(t("Name is required", "Názov je povinný", "A név megadása kötelező"));
      return;
    }
    const safeId =
      dashName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^[^a-z]+/, "") ||
      "dash_" + Date.now();
    if ((customDashboards || []).some((d) => d.id === safeId)) {
      alert(
        t(
          "A dashboard with this name/id already exists.",
          "Nástenka s týmto názvom/ID už existuje.",
          "Ilyen nevű/azonosítójú irányítópult már létezik."
        )
      );
      return;
    }

    const newDash: CustomDashboard = {
      id: safeId,
      name: dashName.trim(),
      icon: dashIcon,
      color: dashColor,
      prompts: [],
      layout: { widgets: [] },
      activeModel: "gpt-5.6-terra",
      archived: false
    };

    const nextDashboards = [...(customDashboards || []), newDash];
    if (onSaveCustomDashboards) {
      onSaveCustomDashboards(nextDashboards);
    }

    const itemNavId = `dash_${safeId}`;
    const storedLayout: unknown = userMetadata?.navLayout;
    if (
      canEditNav &&
      Array.isArray(storedLayout) &&
      storedLayout.length > 0 &&
      !storedLayout.includes(itemNavId)
    ) {
      onSaveUserLayout([...storedLayout, itemNavId]);
    }

    setDashName("");
    setIsDashModalOpen(false);
    setIsStartMenuOpen(false);
    setActiveTab(itemNavId);
  };

  // Flattened active items with group boundaries for direct nav button rendering
  const flattenedNavItems = useMemo(() => {
    const list: Array<
      | { type: "item"; item: any; group: SidebarGroup; indexInGroup: number }
      | { type: "header"; title: string; groupId: string }
      | { type: "divider"; groupId: string }
      | { type: "dropzone"; groupId: string }
    > = [];

    sidebarGroups.forEach((group, gIdx) => {
      const groupItemObjs = group.items
        .map((id) => allPossibleItems.find((i) => i.id === id))
        .filter(Boolean) as any[];

      if (groupItemObjs.length === 0 && !(isStartMenuOpen && startMenuEditMode)) return;

      if (!isExpanded && gIdx > 0) {
        list.push({ type: "divider", groupId: group.id });
      }

      if (isExpanded && group.title) {
        list.push({ type: "header", title: group.title, groupId: group.id });
      }

      groupItemObjs.forEach((item, iIdx) => {
        list.push({ type: "item", item, group, indexInGroup: iIdx });
      });

      if (isStartMenuOpen && startMenuEditMode) {
        list.push({ type: "dropzone", groupId: group.id });
      }
    });

    return list;
  }, [sidebarGroups, allPossibleItems, isExpanded, isStartMenuOpen, startMenuEditMode]);

  return (
    <>
      {/* DESKTOP VIEWPORT SPACER:
          - If Pinned: Matches the expanded width, shifting content to the right.
          - If Unpinned: Matches the collapsed width, allowing sidebar to float over content on hover. */}
      <div
        className={cn(
          "h-screen shrink-0 select-none hidden lg:block transition-all duration-300",
          isPinned ? widthClasses.expanded : widthClasses.collapsed
        )}
      />

      {/* DESKTOP SIDEBAR */}
      <aside
        ref={sidebarRef}
        onMouseEnter={() => {
          if (!isPinned && sidebarUnpinnedStyle === "overlay") {
            setIsCollapsed(false);
          }
        }}
        onMouseMove={(e) => {
          if (isDockMode && !isExpanded) {
            dockMouseY.set(e.clientY);
          }
        }}
        onMouseLeave={() => {
          if (!isPinned) {
            setIsCollapsed(true);
          }
          if (isDockMode && !isExpanded) {
            dockMouseY.set(Infinity);
            setHoveredItemId(null);
          }
        }}
        className={cn(
          "h-screen fixed left-0 top-0 bg-white flex flex-col transition-all duration-300 select-none shrink-0 hidden lg:flex",
          isStartMenuOpen ? "z-[100001]" : "z-[1000]",
          isDockMode && !isExpanded && "overflow-visible",
          isExpanded ? widthClasses.expanded : widthClasses.collapsed,
          isPinned
            ? "shadow-[inset_-10px_0_16px_-6px_rgba(0,0,0,0.08)] border-r border-slate-200/90"
            : isCollapsed && !(isStartMenuOpen && startMenuEditMode)
              ? "shadow-none border-r border-slate-200/80"
              : "shadow-[10px_0_30px_rgba(0,0,0,0.06)] border-r-transparent"
        )}
      >
        {/* Brand Header / Start Menu Launcher */}
        <div
          className={cn(
            "flex items-center relative select-none transition-all duration-300",
            widthClasses.headerHeight,
            !isExpanded ? "justify-center px-0" : "px-3"
          )}
        >
          <button
            type="button"
            onClick={() => {
              setStartMenuEditMode(false);
              setIsStartMenuOpen(true);
            }}
            className={cn(
              "flex items-center gap-3 p-2 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-xs hover:border-slate-300 hover:bg-slate-100 active:scale-[0.98] transition-all cursor-pointer group mx-auto focus:outline-none focus:ring-2 focus:ring-indigo-500/30",
              !isExpanded ? "justify-center flex-col gap-1.5 w-[82%]" : "text-left w-[90%]"
            )}
            title={t("Start Menu (All Modules)", "Štart menu (Všetky moduly)", "Start menü (Összes modul)")}
          >
            {/* 3 Dots with START label */}
            <div
              className={cn(
                "flex items-center justify-center",
                !isExpanded ? "flex-col gap-1" : "gap-1 flex-col shrink-0"
              )}
            >
              <div className="flex items-center justify-center gap-1">
                <span className="h-2 w-2 rounded-full bg-orange-500 transition-transform" />
                <span className="h-2 w-2 rounded-full bg-emerald-500 transition-transform" />
                <span className="h-2 w-2 rounded-full bg-indigo-500 transition-transform" />
              </div>
              <span className="text-[7.5px] font-black tracking-widest text-slate-600 group-hover:text-slate-800 transition-colors uppercase leading-none">
                START
              </span>
            </div>

            {isExpanded && (
              <div className="flex flex-col animate-in fade-in duration-300 min-w-0 flex-1">
                <span className="font-heading font-bold text-sm leading-snug text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                  {systemName}
                </span>
                <span className="text-[10px] text-slate-500 tracking-wider font-semibold uppercase mt-0.5 truncate">
                  {getTranslation(systemLanguage, "sidebar.command_center")}
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Nav List with Direct Button Children for e2e test compatibility */}
        <nav
          ref={navRef}
          onMouseMove={(e) => {
            if (isDockMode && !isExpanded) {
              dockMouseY.set(e.clientY);
            }
          }}
          onMouseLeave={() => {
            if (isDockMode && !isExpanded) {
              dockMouseY.set(Infinity);
              setHoveredItemId(null);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDropOnSidebar(e)}
          className={cn(
            "flex-1 px-3 py-3",
            isDockMode && !isExpanded ? "overflow-visible" : "overflow-y-auto scrollbar-thin",
            widthClasses.spacing
          )}
        >
          {/* Editing Navigation Mode Indicator Banner */}
          {isStartMenuOpen && startMenuEditMode && (
            <div className="p-3 mb-2 rounded-2xl bg-indigo-50 border border-indigo-200/90 flex flex-col gap-1.5 animate-in fade-in duration-200 select-none">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5 text-indigo-600" />
                  {t("Edit Navigation", "Úprava menu", "Menü szerkesztése")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsStartMenuOpen(false);
                    setStartMenuEditMode(false);
                    if (!isPinned) setIsCollapsed(true);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition-colors cursor-pointer shadow-xs"
                >
                  {t("Done", "Hotovo", "Kész")}
                </button>
              </div>
              <p className="text-[10px] text-indigo-600/90 leading-snug">
                {t(
                  "Drag modules from the Start Menu onto any group below to pin them.",
                  "Presuňte moduly zo Štart menu na skupiny nižšie pre pripnutie.",
                  "Húzzon modulokat a Start menüből az alábbi csoportokba."
                )}
              </p>
            </div>
          )}

          {flattenedNavItems.map((entry, idx) => {
            if (entry.type === "divider") {
              return (
                <div
                  key={`div_${entry.groupId}_${idx}`}
                  className="w-8 h-px bg-slate-200/80 my-2 mx-auto shrink-0"
                />
              );
            }

            if (entry.type === "header") {
              return (
                <div
                  key={`hdr_${entry.groupId}_${idx}`}
                  className="px-3 pt-2 pb-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate"
                >
                  {entry.title}
                </div>
              );
            }

            if (entry.type === "dropzone") {
              return (
                <div
                  key={`dropzone_${entry.groupId}_${idx}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverIndex(-1);
                    setDragOverGroupId(entry.groupId);
                  }}
                  onDragLeave={() => {
                    if (dragOverGroupId === entry.groupId) setDragOverGroupId(null);
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleDropOnSidebar(e, entry.groupId);
                    setDragOverGroupId(null);
                  }}
                  className={cn(
                    "p-2.5 my-1.5 rounded-xl border-2 border-dashed transition-all text-center flex items-center justify-center gap-1.5 select-none",
                    dragOverGroupId === entry.groupId
                      ? "border-indigo-500 bg-indigo-50/90 text-indigo-700 font-bold scale-[1.02]"
                      : "border-slate-200/90 hover:border-indigo-300 text-slate-400 hover:text-indigo-600 bg-slate-50/50"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold">
                    {t("Drop module here", "Presuňte sem modul", "Húzza ide a modult")}
                  </span>
                </div>
              );
            }

            const item = entry.item;
            const isActive =
              activeTab === item.id ||
              activeTab.startsWith(item.id + "/") ||
              activeTab.startsWith(item.id + "?") ||
              (item.id === "clients" && activeTab.startsWith("client-"));

            return (
              <SidebarDockButton
                key={item.id}
                entry={entry}
                isActive={isActive}
                isExpanded={isExpanded}
                isDockMode={isDockMode}
                mouseY={dockMouseY}
                widthClasses={widthClasses}
                dragOverIndex={dragOverIndex}
                isStartMenuOpen={isStartMenuOpen}
                startMenuEditMode={startMenuEditMode}
                onItemClick={(id) => {
                  setActiveTab(id);
                  if (!isPinned) setIsCollapsed(true);
                }}
                onHoverStart={(id, rect) => {
                  setHoveredItemId(id);
                  setHoveredItemPos({
                    top: rect.top + rect.height / 2,
                    left: rect.left + rect.width + 16
                  });
                }}
                onHoverEnd={() => {
                  setHoveredItemId(null);
                }}
                onDragOver={(e, indexInGrp) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverIndex(indexInGrp);
                }}
                onDrop={(e, grpId, indexInGrp) => {
                  e.stopPropagation();
                  handleDropOnSidebar(e, grpId, indexInGrp);
                }}
                onTogglePinItem={(id) => {
                  handleTogglePinItem(id);
                }}
                t={t}
              />
            );
          })}

          {/* Collapse/Expand Toggle Button (matching e2e selector aside nav button[aria-label]) */}
          <button
            type="button"
            onClick={() => {
              if (isPinned) setSidebarPinned(false);
              setIsCollapsed(!isCollapsed);
            }}
            className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl transition-all duration-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100/50 text-left cursor-pointer"
            aria-label={t("Toggle Navigation Sidebar", "Prepnúť navigačný panel", "Navigációs oldalsáv váltása")}
          >
            {!isExpanded ? (
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 animate-pulse" />
            ) : (
              <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400" />
            )}
            {isExpanded && (
              <span className="text-sm font-heading font-medium tracking-wide truncate min-w-0 flex-1">
                {getTranslation(systemLanguage, "sidebar.collapse")}
              </span>
            )}
          </button>
        </nav>

        {/* Dynamic Dock Floating Tooltip */}
        {hoveredItemId && hoveredItemPos && isDockMode && !isExpanded && (
          <div
            className="fixed z-[3000] px-3.5 py-2 rounded-xl bg-slate-900/95 text-white text-xs font-bold shadow-2xl border border-white/10 pointer-events-none -translate-y-1/2 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md whitespace-nowrap"
            style={{ top: hoveredItemPos.top, left: hoveredItemPos.left }}
          >
            {(() => {
              const item = allPossibleItems.find((i) => i.id === hoveredItemId);
              if (!item) return null;
              return (
                <>
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: (item as any).color || (item as any).customColor || "#6366f1" }}
                  />
                  <span>{item.label}</span>
                </>
              );
            })()}
          </div>
        )}

        {/* Bottom Actions Footer */}
        <div className="p-3 flex flex-col gap-1.5 shrink-0 border-t border-slate-100/80 bg-slate-50/40">
          {/* Pin Sidebar Toggle Button */}
          <button
            type="button"
            onClick={() => setSidebarPinned(!sidebarPinned)}
            className={cn(
              "w-full flex items-center gap-3.5 px-3 py-2 rounded-xl transition-all duration-200 group text-left cursor-pointer",
              sidebarPinned
                ? "bg-indigo-50 text-indigo-600 font-bold border border-indigo-200"
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/50"
            )}
            title={
              sidebarPinned
                ? t("Unpin sidebar from left", "Odopnúť bočné menu", "Oldalsáv rögzítésének feloldása")
                : t("Pin sidebar to left", "Pripnúť bočné menu vľavo", "Oldalsáv rögzítése balra")
            }
          >
            <Pin
              className={cn(
                "h-4.5 w-4.5 shrink-0 transition-transform",
                sidebarPinned ? "fill-indigo-600 text-indigo-600 rotate-45" : "group-hover:scale-110"
              )}
            />
            {isExpanded && (
              <span className="text-xs font-semibold tracking-wide truncate min-w-0 flex-1">
                {sidebarPinned
                  ? t("Pinned", "Pripnuté", "Rögzítve")
                  : t("Pin Sidebar", "Pripnúť menu", "Oldalsáv rögzítése")}
              </span>
            )}
          </button>

          {/* Edit Navigation Button -> Opens Start Menu in Edit Mode */}
          {canEditNav && (
            <button
              type="button"
              onClick={() => {
                setIsCollapsed(false);
                setStartMenuEditMode(true);
                setIsStartMenuOpen(true);
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all duration-200 group text-left cursor-pointer"
              title={t("Edit navigation layout", "Upraviť štruktúru menu", "Navigációs elrendezés szerkesztése")}
            >
              <Pencil className="h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-110" />
              {isExpanded && (
                <span className="text-xs font-semibold tracking-wide truncate min-w-0 flex-1">
                  {t("Edit Navigation", "Upraviť menu", "Navigáció szerkesztése")}
                </span>
              )}
            </button>
          )}

          {/* Settings Button */}
          {showSettings && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("settings");
                if (!isPinned) setIsCollapsed(true);
              }}
              className={cn(
                "w-full flex items-center gap-3.5 px-3 py-2 rounded-xl transition-all duration-200 group text-left cursor-pointer",
                activeTab.startsWith("settings") || activeTab.startsWith("user-")
                  ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100/50"
              )}
            >
              <Settings
                className={cn(
                  "h-4.5 w-4.5 shrink-0 transition-transform",
                  activeTab.startsWith("settings")
                    ? "text-white"
                    : "text-slate-400 group-hover:rotate-45"
                )}
              />
              {isExpanded && (
                <span className="text-xs font-semibold tracking-wide truncate min-w-0 flex-1">
                  {getTranslation(systemLanguage, "sidebar.settings")}
                </span>
              )}
            </button>
          )}

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => {
              if (onLogout) {
                onLogout();
              } else {
                (window as any).showToast(
                  t(
                    "Sign out simulation active. Workspace locked.",
                    "Simulácia odhlásenia je aktívna. Pracovný priestor je uzamknutý.",
                    "Kijelentkezési szimuláció aktív. A munkaterület zárolva."
                  )
                );
              }
            }}
            className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 transition-all duration-200 text-left group cursor-pointer"
            title={getTranslation(systemLanguage, "sidebar.logout")}
          >
            <LogOut className="h-4.5 w-4.5 shrink-0 text-slate-400 group-hover:text-rose-500 transition-colors" />
            {isExpanded && (
              <span className="text-xs font-semibold tracking-wide truncate min-w-0 flex-1">
                {getTranslation(systemLanguage, "sidebar.logout")}
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* MOBILE INTEGRATED DRAWER */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "lg:hidden fixed left-0 right-0 bg-white/95 backdrop-blur-md transition-all duration-500 ease-in-out z-[20000] border-t border-slate-200/80 shadow-[0_-15px_42px_rgba(0,0,0,0.18)] select-none shrink-0",
          isMobileMenuOpen
            ? "top-0 bottom-0 h-screen w-full p-6 flex flex-col justify-between"
            : "bottom-0 h-16 w-full px-2 sm:px-4 py-2 flex flex-col justify-center"
        )}
      >
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="w-12 h-1 bg-slate-200 hover:bg-slate-300 rounded-full mx-auto mb-2 outline-none cursor-pointer transition-colors shrink-0"
          aria-label={
            isMobileMenuOpen
              ? t("Collapse navigation drawer", "Zbaliť navigačnú zásuvku", "Navigációs fiók összecsukása")
              : t("Open fullscreen navigation drawer", "Otvoriť navigáciu na celú obrazovku", "Teljes képernyős navigáció megnyitása")
          }
        />

        {isMobileMenuOpen && (
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              setStartMenuEditMode(false);
              setIsStartMenuOpen(true);
            }}
            className="flex items-center gap-3.5 mb-6 animate-in fade-in slide-in-from-top-4 duration-300 shrink-0 text-left p-2 rounded-2xl hover:bg-slate-100 transition-colors cursor-pointer w-full"
          >
            <div className="h-10 w-10 flex items-center justify-center gap-1.5 shrink-0 select-none rounded-2xl bg-slate-100 border border-slate-200">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-heading font-bold text-sm leading-none text-slate-800">
                {systemName}
              </span>
              <span className="text-[9px] text-indigo-600 tracking-wider font-extrabold uppercase mt-1">
                {t("Open Start Menu", "Otvoriť Štart menu", "Start menü megnyitása")} ➔
              </span>
            </div>
          </button>
        )}

        <div
          className={cn(
            "flex transition-all duration-500 ease-in-out w-full",
            isMobileMenuOpen ? "flex-col flex-1 justify-between items-start" : "flex-row items-center justify-between gap-1"
          )}
        >
          <div
            className={cn(
              "flex transition-all duration-300",
              isMobileMenuOpen
                ? "flex-col w-full space-y-2 overflow-y-auto max-h-[65vh]"
                : "flex-row items-center gap-1 sm:gap-2 flex-1 pr-1 sm:pr-2 overflow-x-auto scrollbar-none"
            )}
          >
            {activeVisibleLayout.map((id) => {
              const item = allPossibleItems.find((i) => i.id === id);
              if (!item) return null;
              const Icon = item.icon;
              const isActive =
                activeTab === item.id ||
                activeTab.startsWith(item.id + "/") ||
                activeTab.startsWith(item.id + "?") ||
                (item.id === "clients" && activeTab.startsWith("client-"));

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
                      ? "w-full px-4 py-3 rounded-2xl gap-3 text-left font-bold"
                      : "h-10 w-10 sm:h-11 sm:w-11 rounded-xl justify-center",
                    isActive
                      ? "bg-indigo-600 border-indigo-700 text-white shadow-md"
                      : "bg-slate-50/50 border-slate-200 text-slate-500 hover:bg-slate-100"
                  )}
                  title={item.label}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {isMobileMenuOpen && <span className="text-xs font-bold tracking-wide">{item.label}</span>}
                </button>
              );
            })}
          </div>

          {/* Bottom Actions for Mobile */}
          <div
            className={cn(
              "flex transition-all duration-300",
              isMobileMenuOpen
                ? "flex-col w-full space-y-2 mt-auto border-t border-slate-100 pt-4"
                : "flex-row items-center gap-1 sm:gap-2 shrink-0"
            )}
          >
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
                    ? "w-full px-4 py-3 rounded-2xl gap-3 text-left font-bold"
                    : "h-10 w-10 sm:h-11 sm:w-11 rounded-xl justify-center",
                  activeTab.startsWith("settings")
                    ? "bg-indigo-600 border-indigo-700 text-white"
                    : "bg-slate-50/50 border-slate-200 text-slate-500 hover:bg-slate-100"
                )}
                title={getTranslation(systemLanguage, "sidebar.settings")}
              >
                <Settings className="h-4.5 w-4.5 shrink-0" />
                {isMobileMenuOpen && (
                  <span className="text-xs font-bold tracking-wide">
                    {getTranslation(systemLanguage, "sidebar.settings")}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (onLogout) onLogout();
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "transition-all duration-300 flex items-center shrink-0 border select-none",
                isMobileMenuOpen
                  ? "w-full px-4 py-3 rounded-2xl gap-3 text-left font-bold text-rose-600 border-rose-200 bg-rose-50/50"
                  : "h-10 w-10 sm:h-11 sm:w-11 rounded-xl justify-center bg-slate-50/50 border-slate-200 text-slate-500 hover:text-rose-600"
              )}
              title={getTranslation(systemLanguage, "sidebar.logout")}
            >
              <LogOut className="h-4.5 w-4.5 shrink-0" />
              {isMobileMenuOpen && (
                <span className="text-xs font-bold tracking-wide">
                  {getTranslation(systemLanguage, "sidebar.logout")}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Start Menu Modal Launcher */}
      <StartMenu
        isOpen={isStartMenuOpen}
        onClose={() => {
          setIsStartMenuOpen(false);
          setStartMenuEditMode(false);
        }}
        activeTab={activeTab}
        onSelectTab={(tabId) => {
          setActiveTab(tabId);
          if (!isPinned) setIsCollapsed(true);
        }}
        systemName={systemName}
        systemLanguage={systemLanguage}
        currentUser={currentUser}
        roles={roles}
        showSettings={showSettings}
        showMailIcon={showMailIcon}
        showRagAi={showRagAi}
        canOpenRoute={canOpenRoute}
        customDashboards={customDashboards}
        unifiedEntries={unifiedEntries}
        onOpenCreateDashboard={() => setIsDashModalOpen(true)}
        pinnedSidebarItems={resolvedLayout}
        onTogglePinToSidebar={handleTogglePinItem}
        initialEditing={startMenuEditMode}
      />

      {/* New Custom Dashboard Modal */}
      {isDashModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden flex flex-col p-6 space-y-6 animate-in zoom-in-95 duration-200 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Brain className="h-4.5 w-4.5 animate-pulse" />
                </div>
                <span className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  {t("Create New Dashboard", "Vytvoriť nový panel", "Új irányítópult létrehozása")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDashModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  {t("Dashboard Name", "Názov panela", "Irányítópult neve")}
                </label>
                <input
                  type="text"
                  value={dashName}
                  onChange={(e) => setDashName(e.target.value)}
                  placeholder={t("Enter dashboard name...", "Zadajte názov panela...", "Adja meg az irányítópult nevét...")}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  {t("Select Icon", "Vybrať ikonu", "Ikon kiválasztása")}
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700 shrink-0">
                    {(() => {
                      const IconComp = (Icons as any)[dashIcon] || Icons.LayoutDashboard;
                      return <IconComp className="h-6 w-6" />;
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsIconSearchOpen(true)}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 tracking-wide text-center transition-colors cursor-pointer"
                  >
                    {t("Choose from 1000+ icons...", "Vybrať z 1000+ ikon...", "Válasszon több mint 1000 ikon közül...")}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t("Select Color", "Vybrať farbu", "Szín kiválasztása")}
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {dashColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDashColor(color)}
                      className={cn(
                        "h-6 w-6 rounded-full transition-all cursor-pointer relative flex items-center justify-center scale-95 hover:scale-100",
                        dashColor === color ? "ring-2 ring-indigo-500/30 scale-105" : ""
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {dashColor === color && (
                        <span className="block h-2 w-2 rounded-full bg-white shadow-sm" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDashModalOpen(false)}
                className="flex-1 px-4 py-3 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider transition-colors cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                type="button"
                onClick={handleCreateDashboard}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
              >
                {t("Create", "Vytvoriť", "Létrehozás")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Icon Search Modal */}
      {isIconSearchOpen && (
        <div className="fixed inset-0 z-[100005] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col text-left overflow-hidden m-4 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  {t("Select Icon", "Výber ikony", "Ikon kiválasztása")}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                  {t("Search from over 1000+ icons", "Prehliadajte a hľadajte z viac ako 1000+ ikon", "Böngésszen és keressen több mint 1000 ikon között")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsIconSearchOpen(false);
                  setIconSearchQuery("");
                }}
                className="p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50/50 border-b border-slate-100">
              <input
                type="text"
                value={iconSearchQuery}
                onChange={(e) => setIconSearchQuery(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                placeholder={t("Search icons (e.g. settings, chart, file)...", "Vyhľadajte ikonu (napr. settings, chart, file)...", "Ikonok keresése...")}
                autoFocus
              />
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-white">
              {(() => {
                const query = iconSearchQuery.toLowerCase().trim();
                const filtered = ALL_LUCIDE_ICONS.filter((name) => name.toLowerCase().includes(query));
                const displayed = filtered.slice(0, 100);

                if (displayed.length === 0) {
                  return (
                    <div className="py-8 text-center text-slate-400">
                      <p className="text-xs font-semibold">{t("No icons found", "Nenašli sa žiadne ikony", "Nem található ikon")}</p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                    {displayed.map((name) => {
                      const IconComponent = (Icons as any)[name];
                      if (!IconComponent) return null;
                      const isSelected = dashIcon === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setDashIcon(name);
                            setIsIconSearchOpen(false);
                            setIconSearchQuery("");
                          }}
                          className={`p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-purple-600 border-purple-600 text-white"
                              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:scale-[1.03]"
                          }`}
                          title={name}
                        >
                          <IconComponent className="h-5 w-5" />
                          <span className="text-[8px] font-semibold truncate w-full text-center">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
