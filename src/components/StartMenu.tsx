import React, { useState, useEffect, useRef, useMemo } from "react";
import * as Icons from "lucide-react";
import {
  LayoutDashboard, BarChart3, Briefcase, TableProperties, Users,
  Package, Coins, PencilLine, FolderOpen, Mail, Brain, Workflow,
  Globe, Sparkles, Settings, User, Search, X, ChevronRight,
  Check, Pencil, Plus, ListTodo, Home
} from "lucide-react";
import type { UserProfile, RolePermission, UnifiedEntryRegistry, CustomDashboard } from "../types";
import type { Language } from "../utils/translations";
import { getTranslation } from "../utils/translations";
import { useUserPref } from "../utils/userPrefs";
import type { StartMenuGroup } from "../utils/startMenuLayout";
import { normalizeStartMenuLayout } from "../utils/startMenuLayout";
import { SOCIAL_MEDIA_ENABLED } from "../utils/featureFlags";
import { FlockIcon } from "./icons/FlockIcon";
import { EmployeeTieIcon } from "./icons/EmployeeTieIcon";
import { isHomeDashboard } from "../utils/dashboardWidgets";
import { applySectionVisual } from "../utils/sectionVisuals";
import { runUndoable } from "../utils/undoable";
import { PRODUCT_NAME } from "../utils/brand";
import { isInsideMenuEditLayer } from "./menuEdit/primitives";
import { menuEditStrings } from "./menuEdit/menuEditStrings";
import { StartMenuEditDialog } from "./menuEdit/StartMenuEditDialog";

interface StartMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  systemLanguage: Language;
  currentUser: UserProfile | null;
  roles: RolePermission[];
  showSettings?: boolean;
  showRagAi?: boolean;
  /** Route gate from the permission resolver; tiles for closed routes are not offered. */
  canOpenRoute: (routeId: string) => boolean;
  customDashboards?: CustomDashboard[];
  unifiedEntries?: UnifiedEntryRegistry[];
  onOpenCreateDashboard?: () => void;
  pinnedSidebarItems?: string[];
  onTogglePinToSidebar?: (itemId: string) => void;
  initialEditing?: boolean;
  onEditModeChange?: (editing: boolean) => void;
  /** Kept for the Sidebar call site; the Start menu edit dialog creates Start menu groups. */
  onAddSidebarGroup?: () => void;
  defaultPage?: string;
  onSaveDefaultPage?: (pageId: string) => void;
  disabledModules?: string[];
}

/** The stored group shape, defined next to the layout it is persisted in. */
export type MenuGroup = StartMenuGroup;

export interface NavMenuItem {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  bgColor?: string;
  badge?: string;
  defaultSection: string;
  isCustom?: boolean;
}

export const StartMenu: React.FC<StartMenuProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  systemLanguage,
  currentUser,
  roles: _roles,
  showSettings = true,
  showRagAi = false,
  canOpenRoute,
  customDashboards = [],
  unifiedEntries = [],
  onOpenCreateDashboard,
  pinnedSidebarItems = [],
  onTogglePinToSidebar,
  initialEditing = false,
  onEditModeChange,
  defaultPage,
  onSaveDefaultPage,
  disabledModules = []
}) => {
  const brand = PRODUCT_NAME;
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const [storedDefaultPage, setStoredDefaultPage] = useUserPref("defaultPage");
  const effectiveDefaultPage = defaultPage || storedDefaultPage || "dashboard";

  const editStrings = useMemo(() => menuEditStrings(systemLanguage), [systemLanguage]);

  const handleSetDefaultPage = (pageId: string) => {
    if (onSaveDefaultPage) {
      onSaveDefaultPage(pageId);
    }
    setStoredDefaultPage(pageId);
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(editStrings.startScreenUpdated);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(initialEditing);

  const setEditingMode = (editing: boolean) => {
    setIsEditing(editing);
    onEditModeChange?.(editing);
  };

  useEffect(() => {
    if (isOpen && initialEditing !== undefined) {
      setIsEditing(initialEditing);
    }
  }, [initialEditing, isOpen]);

  // Whether the Start menu was opened straight into edit mode: "Done" then closes it.
  const openedInEditRef = useRef(initialEditing);
  // True while a confirmation outside the dialog is open (click-outside must ignore it).
  const editLayerBusyRef = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchStartScrollTop, setTouchStartScrollTop] = useState<number>(0);

  // Default initial groups configuration
  const defaultGroups: MenuGroup[] = useMemo(() => [
    {
      id: "operations",
      name: t("Operations & CRM", "Operatíva & CRM", "Operáció & CRM"),
      iconName: "Briefcase",
      color: "text-indigo-600 "
    },
    {
      id: "analytics",
      name: t("Analytics & Registries", "Analytika & Evidencie", "Analitika & Nyilvántartások"),
      iconName: "BarChart3",
      color: "text-cyan-600 "
    },
    {
      id: "collaboration",
      name: t("Collaboration & AI", "Spolupráca & AI", "Együttműködés & AI"),
      iconName: "Brain",
      color: "text-purple-600 "
    },
    {
      id: "system",
      name: t("System & Tools", "Systém & Nástroje", "Rendszer & Eszközök"),
      iconName: "Settings",
      color: "text-slate-600 "
    }
  ], [systemLanguage, t]);

  // The layout is per user and follows the account to any browser: it lives in
  // the user's row (metadata_json.preferences.startMenuLayout), the same home as
  // the default landing page and the sidebar nav order this menu already saved
  // there. On the login screen there is no row to write to, and useUserPref
  // keeps the change in memory for the session rather than needing a "guest"
  // branch of its own.
  const [storedLayout, setStoredLayout] = useUserPref("startMenuLayout");
  const layout = useMemo(() => normalizeStartMenuLayout(storedLayout), [storedLayout]);

  // Derived, not mirrored into state: a layout saved on another device arrives
  // through a sync and has to show up here, which a copy taken once on mount
  // would not do. No stored groups means the built-in ones, in the interface
  // language currently selected.
  const groups: MenuGroup[] = layout && layout.groups.length > 0 ? layout.groups : defaultGroups;
  const groupItemsMap = layout?.groupItems ?? {};
  const unusedItemIds = layout?.unused ?? [];

  // Persist helper
  const persistLayout = (
    nextGroups: MenuGroup[],
    nextGroupItems: Record<string, string[]>,
    nextUnused: string[]
  ) => {
    setStoredLayout({
      groups: nextGroups,
      groupItems: nextGroupItems,
      unused: nextUnused
    });
  };

  // Animated opening & closing lifecycle
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      if (initialEditing) {
        setEditingMode(true);
      }
      const frame = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      setTimeout(() => inputRef.current?.focus(), 80);
      return () => cancelAnimationFrame(frame);
    } else {
      setIsVisible(false);
      setSearchQuery("");
      setEditingMode(false);
    }
  }, [isOpen, initialEditing]);

  useEffect(() => {
    if (isOpen) openedInEditRef.current = initialEditing;
  }, [isOpen]);

  const handleAnimatedClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 220);
  };

  // Touch handlers for mobile swipe-down to dismiss
  const handleModalTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
    setTouchStartScrollTop(scrollContainerRef.current?.scrollTop || 0);
  };

  const handleModalTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - touchStartY;
    // Dismiss if swiped down by > 50px while scrolled near top
    if (deltaY > 50 && touchStartScrollTop <= 10) {
      handleAnimatedClose();
    }
    setTouchStartY(null);
  };

  // "Done" in the edit dialog: back to the launcher, or out entirely when the menu was opened to edit.
  const handleDoneEditing = () => {
    if (openedInEditRef.current) handleAnimatedClose();
    else setEditingMode(false);
  };

  // Keyboard shortcut listener (ESC closes; in edit mode it is "Done", menus and dialogs swallow it first)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (isEditing) handleDoneEditing();
        else handleAnimatedClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isEditing]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Below lg the edit dialog is hidden; the mobile editor owns the screen.
      if (isEditing && !window.matchMedia("(min-width: 1024px)").matches) return;
      if (editLayerBusyRef.current) return;
      if (isOpen && !isClosing && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Do NOT close if clicking inside the sidebar navigation (aside or [data-sidebar])
        const target = e.target as HTMLElement | null;
        if (target && target.closest("aside, [data-sidebar]")) {
          return;
        }
        // Menus, sheets, dialogs and the drag ghost of the edit mode live in portals.
        if (isInsideMenuEditLayer(e.target)) return;
        handleAnimatedClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isClosing, isEditing]);

  // Build all available navigation items
  const allItems: NavMenuItem[] = useMemo(() => {
    const items: NavMenuItem[] = [
      // 1. BUSINESS & OPERATIONS
      {
        id: "tasks",
        label: getTranslation(systemLanguage, "sidebar.tasks"),
        description: t("Kanban workflow, sprints & team tasks", "Kanban nástenka, šprinty a tímové úlohy", "Kanban tábla, sprintek és feladatok"),
        icon: ListTodo,
        color: "#ff5d00",
        bgColor: "rgba(255, 93, 0, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "time-tracking",
        label: t("Time tracking", "Evidencia času", "Időkövetés"),
        description: t("Timer, daily log & the real cost of every hour", "Časovač, denný záznam a skutočná cena každej hodiny", "Időzítő, napi napló és minden óra valós költsége"),
        icon: Icons.Timer || ListTodo,
        color: "#0d9488",
        bgColor: "rgba(13, 148, 136, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "projects",
        label: t("Projects", "Projekty", "Projektek"),
        description: t("Project timelines, budget & milestones", "Časové osy, rozpočty a míľniky projektov", "Projekt ütemtervek, költségvetések"),
        icon: Briefcase,
        color: "var(--color-purple-500)",
        bgColor: "rgba(168, 85, 247, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "tickets",
        label: getTranslation(systemLanguage, "sidebar.tickets"),
        description: t("Support tickets, SLA tracking, widget reports & email polling", "Tikety podpory, SLA, hlásenia z widgetu a e-maily", "Támogatási jegyek, SLA követés, widget jelentések és e-mail"),
        icon: Icons.LifeBuoy || Icons.Ticket || Briefcase,
        color: "#6366f1",
        bgColor: "rgba(99, 102, 241, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "leads",
        label: getTranslation(systemLanguage, "sidebar.leads"),
        description: t("Pipeline stages, conversions & leads datagrid", "Fázy predaja, konverzie a datagrid leadov", "Értékesítési tölcsér és leadek"),
        icon: TableProperties,
        color: "var(--color-blue-600)",
        bgColor: "rgba(37, 99, 235, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "clients",
        label: getTranslation(systemLanguage, "sidebar.clients"),
        description: t("Client profiles, address book & contract history", "Profily klientov, adresár a história zmlúv", "Ügyfélprofilok és előzmények"),
        icon: Users,
        color: "var(--color-emerald-600)",
        bgColor: "rgba(5, 150, 105, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "warehouse",
        label: getTranslation(systemLanguage, "sidebar.warehouse"),
        description: t("Inventory stock, FEFO batches & material movements", "Skladové zásoby, FEFO šarže a pohyby materiálu", "Raktárkészlet, FEFO tételek és mozgások"),
        icon: Package,
        color: "var(--color-blue-900)",
        bgColor: "rgba(30, 58, 138, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "invoices",
        label: t("Price Offers", "Cenové ponuky", "Árajánlatok"),
        description: t("Price offers, PDF templates & accounting sync", "Cenové ponuky, PDF šablóny a prepojenie na účtovníctvo", "Árajánlatok, PDF sablonok és könyvelési kapcsolat"),
        icon: Icons.FileText || Coins,
        color: "var(--color-indigo-500)",
        bgColor: "rgba(99, 102, 241, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "orders",
        label: t("Orders", "Objednávky", "Rendelések"),
        description: t("E-shop & commercial orders, guest checkout, deliveries & status pipeline", "E-shop a obchodné objednávky, nákup bez registrácie, doprava a stavy", "Webáruház és kereskedelmi rendelések, vendég vásárlás, szállítás"),
        icon: Icons.ShoppingCart || Coins,
        color: "#0284c7",
        bgColor: "rgba(2, 132, 199, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "financial",
        label: getTranslation(systemLanguage, "sidebar.financial"),
        description: t("Cash flow trend, matrix table, ledger & recurring rules", "Trend cashflow, tabuľka, pohyby a trvalé príkazy", "Cashflow trend, mátrix tábla, mozgások"),
        icon: Coins,
        color: "var(--color-emerald-500)",
        bgColor: "rgba(16, 185, 129, 0.12)",
        defaultSection: "operations"
      },
      {
        id: "employees",
        label: getTranslation(systemLanguage, "sidebar.employees"),
        description: t("Your employment, staff directory, payroll, time tracking & leave", "Vaše zamestnanie, zoznam zamestnancov, mzdy, meranie času a dovolenky", "Munkaviszonya, munkatársak, bérek, időkövetés és szabadságok"),
        icon: EmployeeTieIcon,
        color: "#c29b62",
        bgColor: "rgba(194, 155, 98, 0.12)",
        defaultSection: "operations"
      },

      // 2. ANALYTICS & DASHBOARDS
      {
        id: "dashboard",
        label: getTranslation(systemLanguage, "sidebar.dashboard"),
        description: t("Widget board of live metrics, charts & tables", "Nástenka so živými metrikami, grafmi a tabuľkami", "Élő mutatók, diagramok és táblázatok"),
        icon: LayoutDashboard,
        color: "var(--color-indigo-600)",
        bgColor: "rgba(79, 70, 229, 0.12)",
        defaultSection: "analytics"
      },
      {
        id: "overview",
        label: getTranslation(systemLanguage, "sidebar.analytics"),
        description: t("Executive BI overview & marketing funnel metrics", "Manažérske BI reporty a marketingové metriky", "Vezetői BI és marketing mutatók"),
        icon: BarChart3,
        color: "var(--color-cyan-600)",
        bgColor: "rgba(8, 145, 178, 0.12)",
        defaultSection: "analytics"
      },

      // Dynamic Custom Dashboards
      ...customDashboards
        // The built-in Dashboard lives in the same list but has its own entry.
        .filter((d) => !d.archived && !isHomeDashboard(d.id))
        .map((d) => {
          const IconComp = (Icons as any)[d.icon] || LayoutDashboard;
          return {
            id: `dash_${d.id}`,
            label: d.name,
            description: t("Custom AI & Widget Dashboard", "Vlastná AI nástenka", "Egyéni AI irányítópult"),
            icon: IconComp,
            color: d.color || "#4f46e5",
            bgColor: `${d.color || "#4f46e5"}1f`,
            badge: "Custom",
            defaultSection: "analytics",
            isCustom: true
          };
        }),

      // Dynamic Unified Entries (Custom Tables)
      ...unifiedEntries
        .filter((ue) => !ue.archived)
        .map((ue) => {
          const IconComp = (Icons as any)[ue.icon] || FolderOpen;
          return {
            id: `ue_${ue.id}`,
            label: ue.name,
            description: t("Custom Database Registry", "Vlastná databázová evidencia", "Egyéni adatbázis-nyilvántartás"),
            icon: IconComp,
            color: ue.color || "#6366f1",
            bgColor: `${ue.color || "#6366f1"}1f`,
            badge: "DB",
            defaultSection: "analytics",
            isCustom: true
          };
        }),

      // 3. COLLABORATION & INTELLIGENCE
      {
        id: "meetings",
        label: getTranslation(systemLanguage, "sidebar.meetings"),
        description: t("Voice recordings, AI notes & meeting minutes", "Hlasové nahrávky, AI poznámky a zápisy zo stretnutí", "Hangfelvételek, AI jegyzetek és memók"),
        icon: PencilLine,
        color: "var(--color-indigo-600)",
        bgColor: "rgba(79, 70, 229, 0.12)",
        defaultSection: "collaboration"
      },
      {
        id: "files",
        label: getTranslation(systemLanguage, "sidebar.files"),
        description: t("Central cloud document repository & attachments", "Centrálne úložisko dokumentov a príloh", "Központi dokumentumtár és csatolmányok"),
        icon: FolderOpen,
        color: "var(--color-amber-700)",
        bgColor: "rgba(180, 83, 9, 0.12)",
        defaultSection: "collaboration"
      }
    ];

    // Listed even before the mailbox is connected — the view explains the setup.
    items.push({
      id: "email",
      label: t("Mail Client", "Pošta", "Levelezés"),
      description: t("Integrated IMAP/SMTP corporate email client", "Integrovaná firemná pošta a schránka", "Integrált vállalati levelezőkliens"),
      icon: Mail,
      color: "var(--color-pink-600)",
      bgColor: "rgba(219, 39, 119, 0.12)",
      defaultSection: "collaboration"
    });

    if (showRagAi) {
      items.push({
        id: "rag_ai",
        label: t("RAG AI Assistant", "RAG AI Asistent", "RAG AI Asszisztens"),
        description: t("Vector-indexed company knowledge AI chat", "Firemný znalostný AI asistent s vektorovou DB", "Vállalati tudásbázis AI asszisztens"),
        icon: Brain,
        color: "var(--color-violet-500)",
        bgColor: "rgba(139, 92, 246, 0.12)",
        defaultSection: "collaboration"
      });
    }

    items.push({
      id: "sai",
      label: "SAI",
      description: t("Swarm AI predictive market rehearsals & strategic simulation", "Prediktívna simulácia trhu a strategický nácvik so Swarm AI", "Prediktív szimuláció és stratégiai próba Swarm AI-val"),
      icon: FlockIcon,
      color: "#8b5cf6",
      bgColor: "rgba(139, 92, 246, 0.12)",
      defaultSection: "collaboration"
    });

    items.push({
      id: "automation",
      label: t("Automation", "Automatizácia", "Automatizálás"),
      description: t("Event triggers, webhook integrations & rule builder", "Udalosťové spúšťače, webhooky a automatické pravidlá", "Eseményvezérelt munkafolyamatok és webhookok"),
      icon: Workflow,
      color: "var(--color-purple-800)",
      bgColor: "rgba(107, 33, 168, 0.12)",
      defaultSection: "collaboration"
    });

    if (SOCIAL_MEDIA_ENABLED) {
      items.push({
        id: "social_media",
        label: t("Social Media", "Sociálne siete", "Közösségi média"),
        description: t("Social post scheduling & cross-platform publishing", "Plánovanie príspevkov a publikovanie na sociálne siete", "Közösségi média bejegyzések időzítése"),
        icon: Globe,
        color: "var(--color-rose-500)",
        bgColor: "rgba(244, 63, 94, 0.12)",
        defaultSection: "collaboration"
      });
    }

    items.push({
      id: "whatsapp",
      label: "WhatsApp",
      description: t(`Your WhatsApp chats, digest & tasks inside ${PRODUCT_NAME}`, `Vaše WhatsApp chaty, prehľad a úlohy priamo v ${PRODUCT_NAME}`, `WhatsApp-csevegések, összefoglaló és feladatok a ${PRODUCT_NAME}-ben`),
      icon: Icons.MessageCircle || Icons.Mail,
      color: "#16a34a",
      bgColor: "rgba(22, 163, 74, 0.12)",
      defaultSection: "collaboration"
    });

    items.push({
      id: "newsletter",
      label: t("Newsletter", "Newsletter", "Hírlevél"),
      description: t("E-mail campaigns to your clients, with your own design", "E-mailové kampane pre klientov vo vlastnom dizajne", "E-mail kampányok az ügyfeleknek, saját dizájnnal"),
      icon: Icons.Send || Icons.Mail,
      color: "#0284c7",
      bgColor: "rgba(2, 132, 199, 0.12)",
      defaultSection: "collaboration"
    });

    // 4. SYSTEM & PERSONAL
    items.push({
      id: "personal-settings",
      label: t("Personal Settings", "Osobné nastavenia", "Személyes beállítások"),
      description: t("Theme mode, error sidebar & user profile", "Vzhľad aplikácie, panel chýb a osobný profil", "Téma, hibaoldalsáv és személyes profil"),
      icon: User,
      color: "var(--color-sky-600)",
      bgColor: "rgba(2, 132, 199, 0.12)",
      defaultSection: "system"
    });

    if (showSettings) {
      items.push({
        id: "settings",
        label: getTranslation(systemLanguage, "sidebar.settings"),
        description: t("Roles & permissions, lead stages, branding & DB", "Roly a oprávnenia, fázy leadov, branding a DB", "Szerepkörök, jogosultságok, branding és DB"),
        icon: Settings,
        color: "var(--color-slate-600)",
        bgColor: "rgba(71, 85, 105, 0.12)",
        defaultSection: "system"
      });
    }

    items.push({
      id: "updates",
      label: t("Updates & What's New", "Novinky a verzie", "Újdonságok"),
      description: t("System changelog, release notes & improvements", "História verzií, novinky a vylepšenia systému", "Verziótörténet és újdonságok"),
      icon: Sparkles,
      color: "var(--color-amber-600)",
      bgColor: "rgba(217, 119, 6, 0.12)",
      defaultSection: "system"
    });

    // Drop disabled modules and items the role may not open
    return items
      .filter((item) => {
        if (disabledModules.includes(item.id)) return false;
        return canOpenRoute(item.id);
      })
      .map(applySectionVisual);
  }, [
    systemLanguage,
    customDashboards,
    unifiedEntries,
    showRagAi,
    showSettings,
    canOpenRoute,
    disabledModules,
    t
  ]);

  // Resolve grouped items
  const resolvedGroupsData = useMemo(() => {
    const itemMap = new Map(allItems.map((item) => [item.id, item]));
    const unused: NavMenuItem[] = [];

    // Assign unused items
    unusedItemIds.forEach((id) => {
      const item = itemMap.get(id);
      if (item) {
        unused.push(item);
        itemMap.delete(id);
      }
    });

    // Populate each group
    const groupsWithItems = groups.map((g) => {
      const customIds = groupItemsMap[g.id] || [];
      const itemsInGroup: NavMenuItem[] = [];

      customIds.forEach((id) => {
        const item = itemMap.get(id);
        if (item) {
          itemsInGroup.push(item);
          itemMap.delete(id);
        }
      });

      return {
        ...g,
        items: itemsInGroup
      };
    });

    // Any remaining items fall into their default section or first available group
    itemMap.forEach((item) => {
      const targetGroup = groupsWithItems.find((g) => g.id === item.defaultSection) || groupsWithItems[0];
      if (targetGroup) {
        targetGroup.items.push(item);
      } else {
        unused.push(item);
      }
    });

    return { groupsWithItems, unused };
  }, [allItems, groups, groupItemsMap, unusedItemIds]);

  // Search filter
  const searchFilter = (items: NavMenuItem[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  };

  // Layout editing. The edit dialog reports intent; every change is persisted here.
  const handleCreateGroup = () => {
    const newId = `group_${Date.now()}`;
    const newName = editStrings.newGroupName(groups.length + 1);
    const newGroup: MenuGroup = {
      id: newId,
      name: newName,
      iconName: "FolderOpen",
      color: "text-indigo-600 ",
      isCustom: true
    };
    persistLayout([...groups, newGroup], groupItemsMap, unusedItemIds);
    return { id: newId, name: newName };
  };

  const handleRenameGroup = (groupId: string, name: string) => {
    if (!name.trim()) return;
    persistLayout(
      groups.map((g) => (g.id === groupId ? { ...g, name: name.trim() } : g)),
      groupItemsMap,
      unusedItemIds
    );
  };

  const handleDeleteGroup = (groupId: string) => {
    const groupToDelete = resolvedGroupsData.groupsWithItems.find((g) => g.id === groupId);
    const itemsToMove = groupToDelete ? groupToDelete.items.map((i) => i.id) : [];

    const nextGroups = groups.filter((g) => g.id !== groupId);
    const nextGroupItems = { ...groupItemsMap };
    delete nextGroupItems[groupId];
    const nextUnused = Array.from(new Set([...unusedItemIds, ...itemsToMove]));

    // The layout as it is now: Undo writes exactly this back. The group's items
    // were moved to Hidden, so nothing is lost either way.
    const before = { groups, groupItems: groupItemsMap, unused: unusedItemIds };
    runUndoable({
      message: editStrings.groupDeleted,
      undoLabel: editStrings.undo,
      apply: () => persistLayout(nextGroups, nextGroupItems, nextUnused),
      revert: () => persistLayout(before.groups, before.groupItems, before.unused),
    });
  };

  // Group columns: reorder by moving one step or by dropping a header on another group.
  const handleReorderGroups = (fromId: string, toId: string) => {
    const fromIdx = groups.findIndex((g) => g.id === fromId);
    const toIdx = groups.findIndex((g) => g.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const nextGroups = [...groups];
    const [moved] = nextGroups.splice(fromIdx, 1);
    nextGroups.splice(toIdx, 0, moved);
    persistLayout(nextGroups, groupItemsMap, unusedItemIds);
  };

  const handleMoveGroup = (groupId: string, direction: -1 | 1) => {
    const idx = groups.findIndex((g) => g.id === groupId);
    const target = groups[idx + direction];
    if (idx !== -1 && target) handleReorderGroups(groupId, target.id);
  };

  // Reorder one step inside a group (indexes are positions in the unfiltered group).
  const handleMoveMenuItem = (groupId: string, indexInGroup: number, direction: -1 | 1) => {
    const grp = resolvedGroupsData.groupsWithItems.find((g) => g.id === groupId);
    if (!grp) return;
    const newIndex = indexInGroup + direction;
    if (newIndex < 0 || newIndex >= grp.items.length) return;

    const nextItems = grp.items.map((i) => i.id);
    const [moved] = nextItems.splice(indexInGroup, 1);
    nextItems.splice(newIndex, 0, moved);

    const nextGroupItems: Record<string, string[]> = {};
    resolvedGroupsData.groupsWithItems.forEach((g) => {
      nextGroupItems[g.id] = g.id === groupId ? nextItems : g.items.map((i) => i.id);
    });
    persistLayout(groups, nextGroupItems, resolvedGroupsData.unused.map((i) => i.id));
  };

  // The one place a module changes group: drag & drop, "Move to group", "Add module",
  // "Hide" and "Show" all come through here. `target` is a group id or "unused" (hidden);
  // `index` is the drop position among the group's current items (before removal).
  const handleMoveItemTo = (itemId: string, target: string, index?: number) => {
    const nextGroupItems: Record<string, string[]> = {};
    resolvedGroupsData.groupsWithItems.forEach((g) => {
      nextGroupItems[g.id] = g.items.map((i) => i.id);
    });
    let insertAt = index;
    const sourceGroup = Object.keys(nextGroupItems).find((gid) => nextGroupItems[gid].includes(itemId));
    if (sourceGroup === target && insertAt !== undefined && nextGroupItems[sourceGroup].indexOf(itemId) < insertAt) {
      insertAt -= 1;
    }
    Object.keys(nextGroupItems).forEach((gid) => {
      nextGroupItems[gid] = nextGroupItems[gid].filter((id) => id !== itemId);
    });
    const nextUnused = resolvedGroupsData.unused.map((i) => i.id).filter((id) => id !== itemId);

    if (target === "unused") {
      nextUnused.push(itemId);
    } else {
      const list = nextGroupItems[target] ?? (nextGroupItems[target] = []);
      list.splice(insertAt ?? list.length, 0, itemId);
    }
    persistLayout(groups, nextGroupItems, nextUnused);
  };


  if (!isOpen && !isClosing) return null;

  const handleItemClick = (id: string) => {
    onSelectTab(id);
    handleAnimatedClose();
  };

  if (isEditing) {
    return (
      <StartMenuEditDialog
        language={systemLanguage}
        visible={isVisible}
        dialogRef={menuRef}
        busyRef={editLayerBusyRef}
        groups={resolvedGroupsData.groupsWithItems}
        hidden={resolvedGroupsData.unused}
        modules={allItems}
        defaultPageId={effectiveDefaultPage}
        pinnedIds={pinnedSidebarItems}
        canPin={!!onTogglePinToSidebar}
        onCreateDashboard={onOpenCreateDashboard}
        onSetDefaultPage={handleSetDefaultPage}
        onTogglePin={(id) => onTogglePinToSidebar?.(id)}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onMoveGroup={handleMoveGroup}
        onReorderGroups={handleReorderGroups}
        onDeleteGroup={handleDeleteGroup}
        onMoveItem={handleMoveMenuItem}
        onMoveItemTo={handleMoveItemTo}
        onResetLayout={() => setStoredLayout(null)}
        onDone={handleDoneEditing}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-6 lg:pl-72 lg:pr-8 select-none">
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 bg-slate-950/40 backdrop-blur-md transition-opacity duration-250 ease-out ${
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleAnimatedClose}
      />

      {/* Start Menu Container */}
      <div
        ref={menuRef}
        data-start-menu="true"
        onTouchStart={handleModalTouchStart}
        onTouchEnd={handleModalTouchEnd}
        className={`relative z-10 w-full max-w-6xl bg-white backdrop-blur-2xl border-t sm:border border-slate-200/90 rounded-t-3xl sm:rounded-3xl shadow-[0_-15px_50px_rgba(0,0,0,0.3)] sm:shadow-[0_25px_70px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col h-[90vh] sm:h-auto sm:max-h-[92vh] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
          isVisible
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-95 sm:scale-95 opacity-0 translate-y-12 sm:translate-y-0 pointer-events-none"
        }`}
      >
        {/* Mobile Top Grab Pill Handle */}
        <div
          className="sm:hidden w-full pt-3 pb-1 flex justify-center items-center cursor-pointer shrink-0"
          onClick={handleAnimatedClose}
          title={t("Swipe down or tap to close", "Potiahnutím nadol zatvoríte", "Húzza le a bezáráshoz")}
        >
          <div className="w-12 h-1.5 bg-slate-300 active:bg-slate-400 rounded-full transition-colors" />
        </div>

        {/* Top Header & Search Bar & Edit Button */}
        <div className="p-4 sm:p-6 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl bg-white shadow-sm border border-slate-200/80">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shadow-xs animate-pulse" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs" />
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-xs" />
                </div>
                <span className="type-overline text-indigo-600 leading-none">
                  START
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold text-title-sm text-slate-900 tracking-tight">
                    {PRODUCT_NAME}
                  </span>
                  <span className="type-overline px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                    {t("Start Menu", "Štart menu", "Start menü")}
                  </span>
                </div>
                <p className="text-caption text-slate-400 font-medium hidden sm:block">
                  {(isEditing
                    ? t("Drag groups to reorder columns • Add new group to sidebar • Pin 📌 items to left sidebar", "Presúvajte celé skupiny • Vytvorte novú skupinu pre bočný panel • Pripnite 📌 položky na bočný panel", "Csoportok átrendezése • Új csoport az oldalsávhoz • Kitűzés 📌 a bal oldalsávra")
                    : t(`Quick access to all ${PRODUCT_NAME} modules & applications`, "Rýchly prístup k modulom a evidenciám", "Gyors hozzáférés az összes modulhoz"))}
                </p>
              </div>
            </div>

            {/* Mobile close button top-right */}
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="sm:hidden p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search Bar & Actions */}
          <div className="flex items-center gap-2 w-full sm:flex-1 sm:max-w-xl justify-between sm:justify-end">
            <div className="relative w-full sm:max-w-xs flex-1 sm:flex-initial">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search modules... (ESC)", "Hľadať v moduloch... (ESC)", "Keresés a modulok között...")}
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-2xl text-ui text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Enter edit mode: opens the edit dialog (and the sidebar's edit state) */}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setEditingMode(true);
              }}
              className="px-3.5 py-2 rounded-2xl text-ui font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700"
              title={t("Customize Order, Groups & Sidebar Pins", "Prispôsobiť menu a skupiny", "Menü és csoportok testreszabása")}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("Edit", "Upraviť", "Szerkesztés")}</span>
            </button>

            {/* Close Button on Desktop */}
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="hidden sm:flex p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
              title={t("Close (ESC)", "Zavrieť (ESC)", "Bezárás (ESC)")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>


        {/* Dynamic Multi-Column Grouped Menu Grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 items-start">
            {resolvedGroupsData.groupsWithItems.map((group) => {
              const IconComp = (Icons as any)[group.iconName || "FolderOpen"] || FolderOpen;
              const filteredItems = searchFilter(group.items);
              const isAnalyticsGroup = group.id === "analytics";

              return (
                <div
                  key={group.id}
                  className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both flex flex-col p-3 rounded-3xl bg-slate-50 border border-slate-200/50"
                >
                  <div className={`flex items-center justify-between pb-2.5 border-b border-slate-200/70 type-overline ${group.color || "text-slate-700 "}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <IconComp className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-bold">{group.name}</span>
                    </div>
                    <span className="ml-2 shrink-0 text-micro px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-600 font-bold">
                      {filteredItems.length}
                    </span>
                  </div>

                  <div className="space-y-1.5 flex-1 min-h-12.5">
                    {filteredItems.map((item) => (
                      <StartMenuItemTile
                        key={item.id}
                        item={item}
                        isActive={activeTab === item.id || activeTab.startsWith(item.id + "/")}
                        isDefault={item.id === effectiveDefaultPage}
                        onClick={() => handleItemClick(item.id)}
                        systemLanguage={systemLanguage}
                      />
                    ))}

                    {/* Skeleton New Dashboard Button inside Analytics Group */}
                    {isAnalyticsGroup && onOpenCreateDashboard && (
                      <button
                        type="button"
                        onClick={() => onOpenCreateDashboard()}
                        className="w-full p-2.5 rounded-2xl text-left border-2 border-dashed border-purple-300/80  hover:border-purple-500  bg-purple-50/30 hover:bg-purple-50/80   text-purple-700  hover:scale-[1.015] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 cursor-pointer flex items-center gap-3 group shadow-2xs hover:shadow-sm"
                      >
                        <div className="p-2 rounded-xl bg-purple-100/70  text-purple-600  shrink-0 group-hover:scale-110 transition-transform">
                          <Brain className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-ui font-bold truncate">
                              {t("New Dashboard", "Nový panel", "Új irányítópult")}
                            </span>
                            <span className="type-overline px-1.5 py-0.2 rounded-md bg-purple-100/80  text-purple-600 ">
                              +
                            </span>
                          </div>
                          <p className="text-micro text-purple-600/70  line-clamp-1 mt-0.5 leading-snug">
                            {t("Create custom dashboard", "Vytvoriť vlastný panel", "Új irányítópult létrehozása")}
                          </p>
                        </div>
                        <div className="shrink-0 text-purple-400 group-hover:text-purple-600  transition-colors">
                          <Plus className="h-4 w-4" />
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Footer: User Profile & Default Start Screen Quick Selector */}
        <div className="p-3.5 sm:px-6 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between gap-2 sm:gap-3 text-ui">
          <button
            type="button"
            onClick={() => handleItemClick("personal-settings")}
            title={t("Profile", "Profil", "Profil")}
            className="flex items-center gap-2.5 sm:gap-3 -mx-1 sm:-mx-2 px-2 py-1.5 rounded-xl text-left hover:bg-white border border-transparent hover:border-slate-200 transition-colors cursor-pointer group shrink-0"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-bold flex items-center justify-center text-ui shadow-sm shrink-0">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="min-w-0">
              <span className="font-bold text-slate-800 block leading-tight truncate max-w-25 sm:max-w-none">
                {currentUser?.name || "User"}
              </span>
              <span className="type-overline text-slate-400 block truncate">
                {currentUser?.role || "Member"}
              </span>
            </div>
            <User className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0 hidden sm:block" />
          </button>

          {/* Quick Start Screen Selector */}
          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors shrink-0">
            <Home className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-caption font-semibold text-slate-500 hidden md:inline">
              {t("Start Screen:", "Úvodná obrazovka:", "Kezdőképernyő:")}
            </span>
            <select
              value={effectiveDefaultPage}
              onChange={(e) => handleSetDefaultPage(e.target.value)}
              className="bg-transparent text-ui font-bold text-slate-800 focus:outline-none cursor-pointer pr-1 max-w-27.5 sm:max-w-45 truncate"
              title={t(`Screen that opens when launching ${brand}`, `Obrazovka, ktorá sa otvorí pri spustení ${brand}`, `A ${brand} indításakor megnyíló képernyő`)}
            >
              {allItems
                .filter((m) => canOpenRoute(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id} className="text-slate-800 bg-white">
                    {m.label}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StartMenuItemTileProps {
  item: NavMenuItem;
  isActive: boolean;
  isDefault?: boolean;
  onClick: () => void;
  systemLanguage?: Language;
}

const StartMenuItemTile: React.FC<StartMenuItemTileProps> = ({
  item,
  isActive,
  isDefault = false,
  onClick,
  systemLanguage = "en"
}) => {
  const Icon = item.icon;

  return (
    <>
      <div
        onClick={onClick}
        className={`w-full p-2.5 rounded-2xl text-left transition-all duration-200 flex items-start gap-2.5 group relative border cursor-pointer ${
          isActive
            ? "bg-indigo-50/90 border-indigo-400 shadow-xs ring-1 ring-indigo-500/20"
            : "bg-white border-transparent hover:border-slate-200 hover:bg-slate-50 hover:shadow-md hover:scale-[1.015] hover:-translate-y-0.5 active:scale-[0.98]"
        }`}
      >
      {/* Icon Badge with micro-bounce on tile hover */}
      <div
        className="p-2 rounded-xl shrink-0 transition-transform duration-200 group-hover:scale-110 shadow-2xs"
        style={{
          backgroundColor: item.bgColor || `${item.color}18`,
          color: item.color
        }}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-ui font-bold truncate transition-colors ${isActive ? "text-indigo-600 " : "text-slate-800  group-hover:text-slate-950 "}`}>
            {item.label}
          </span>
          {isDefault && (
            <span
              className="text-micro font-bold px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 flex items-center gap-1 shrink-0 shadow-2xs"
              title={
                systemLanguage === "sk"
                  ? "Predvolená úvodná obrazovka"
                  : systemLanguage === "hu"
                  ? "Alapértelmezett kezdőképernyő"
                  : "Default start screen"
              }
            >
              <Home className="h-2.5 w-2.5 text-amber-600 fill-current" />
              <span className="hidden sm:inline">
                {systemLanguage === "sk"
                  ? "Úvodná"
                  : systemLanguage === "hu"
                  ? "Kezdő"
                  : "Start"}
              </span>
            </span>
          )}
          {item.badge && (
            <span className="type-overline px-1.5 py-0.2 rounded-md bg-slate-100  text-slate-500 ">
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-micro text-slate-400 line-clamp-2 mt-0.5 leading-snug">
          {item.description}
        </p>
      </div>

      {/* Active Indicator or Hover Arrow */}
      <div className="shrink-0 pt-1 text-slate-300  group-hover:text-indigo-500  transition-all group-hover:translate-x-0.5">
        {isActive ? (
          <Check className="h-3.5 w-3.5 text-indigo-600 " />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-all" />
        )}
      </div>
    </div>
    </>
  );
};

