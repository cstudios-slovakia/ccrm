import React, { useState, useEffect, useRef, useMemo } from "react";
import * as Icons from "lucide-react";
import {
  LayoutDashboard, BarChart3, Briefcase, TableProperties, Users,
  Package, Coins, PencilLine, FolderOpen, Mail, Brain, Workflow,
  Globe, Sparkles, Settings, User, LogOut, Search, X, ChevronRight,
  Check, Pencil, GripVertical, Pin, RotateCcw, Plus,
  Archive, EyeOff, Trash2, FolderPlus
} from "lucide-react";
import type { UserProfile, RolePermission, UnifiedEntryRegistry, CustomDashboard } from "../types";
import type { Language } from "../utils/translations";
import { getTranslation } from "../utils/translations";
import { SOCIAL_MEDIA_ENABLED } from "../utils/featureFlags";

interface StartMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  systemName: string;
  systemLanguage: Language;
  currentUser: UserProfile | null;
  roles: RolePermission[];
  showSettings?: boolean;
  showMailIcon?: boolean;
  showRagAi?: boolean;
  customDashboards?: CustomDashboard[];
  unifiedEntries?: UnifiedEntryRegistry[];
  onOpenCreateDashboard?: () => void;
  pinnedSidebarItems?: string[];
  onTogglePinToSidebar?: (itemId: string) => void;
  onLogout?: () => void;
}

export interface MenuGroup {
  id: string;
  name: string;
  iconName?: string;
  color?: string;
  isCustom?: boolean;
}

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
  systemName,
  systemLanguage,
  currentUser,
  roles: _roles,
  showSettings = true,
  showMailIcon = false,
  showRagAi = false,
  customDashboards = [],
  unifiedEntries = [],
  onOpenCreateDashboard,
  pinnedSidebarItems = [],
  onTogglePinToSidebar,
  onLogout
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const [searchQuery, setSearchQuery] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Group editing states
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  // Item drag & drop state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draggedFromGroup, setDraggedFromGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);

  // Column / Group reordering drag & drop state
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Storage key for user custom start menu layout
  const storageKey = `ccrm_start_menu_groups_v2_${currentUser?.id || "guest"}`;

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

  const [groups, setGroups] = useState<MenuGroup[]>(defaultGroups);
  const [groupItemsMap, setGroupItemsMap] = useState<Record<string, string[]>>({});
  const [unusedItemIds, setUnusedItemIds] = useState<string[]>([]);

  // Load saved groups & layout from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.groups) && parsed.groups.length > 0) {
          setGroups(parsed.groups);
        }
        if (parsed.groupItems) {
          setGroupItemsMap(parsed.groupItems);
        }
        if (Array.isArray(parsed.unused)) {
          setUnusedItemIds(parsed.unused);
        }
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  // Persist helper
  const persistLayout = (
    nextGroups: MenuGroup[],
    nextGroupItems: Record<string, string[]>,
    nextUnused: string[]
  ) => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          groups: nextGroups,
          groupItems: nextGroupItems,
          unused: nextUnused
        })
      );
    } catch {
      // ignore
    }
  };

  // Reset to default layout
  const handleResetLayout = () => {
    if (window.confirm(t("Reset Start Menu to default groups and layout?", "Obnoviť predvolené skupiny a rozloženie Štart menu?", "Visszaállítja a Start menü alapértelmezett csoportjait és elrendezését?"))) {
      setGroups(defaultGroups);
      setGroupItemsMap({});
      setUnusedItemIds([]);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  };

  // Animated opening & closing lifecycle
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      const frame = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      setTimeout(() => inputRef.current?.focus(), 80);
      return () => cancelAnimationFrame(frame);
    } else {
      setIsVisible(false);
      setSearchQuery("");
      setIsEditing(false);
      setEditingGroupId(null);
    }
  }, [isOpen]);

  const handleAnimatedClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 220);
  };

  // Keyboard shortcut listener (ESC to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleAnimatedClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && !isClosing && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleAnimatedClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isClosing]);

  // Build all available navigation items
  const allItems: NavMenuItem[] = useMemo(() => {
    const items: NavMenuItem[] = [
      // 1. BUSINESS & OPERATIONS
      {
        id: "dashboard",
        label: t("Task Dashboard", "Panel úloh", "Feladat Irányítópult"),
        description: t("Kanban workflow, sprints & team tasks", "Kanban nástenka, šprinty a tímové úlohy", "Kanban tábla, sprintek és feladatok"),
        icon: LayoutDashboard,
        color: "#ff5d00",
        bgColor: "rgba(255, 93, 0, 0.12)",
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
        label: t("Invoices & Price Offers", "Cenové ponuky & Faktúry", "Ajánlatok és számlák"),
        description: t("Price offers, PDF templates & accounting sync", "Cenové ponuky, PDF šablóny a fakturácia", "Árajánlatok, PDF sablonok és számlázás"),
        icon: Icons.FileText || Coins,
        color: "var(--color-indigo-500)",
        bgColor: "rgba(99, 102, 241, 0.12)",
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

      // 2. ANALYTICS & DASHBOARDS
      {
        id: "overview",
        label: getTranslation(systemLanguage, "sidebar.dashboard"),
        description: t("Executive BI overview & marketing funnel metrics", "Manažérske BI reporty a marketingové metriky", "Vezetői BI és marketing mutatók"),
        icon: BarChart3,
        color: "var(--color-cyan-600)",
        bgColor: "rgba(8, 145, 178, 0.12)",
        defaultSection: "analytics"
      },

      // Dynamic Custom Dashboards
      ...customDashboards
        .filter((d) => !d.archived)
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

    if (showMailIcon) {
      items.push({
        id: "email",
        label: t("Mail Client", "Pošta", "Levelezés"),
        description: t("Integrated IMAP/SMTP corporate email client", "Integrovaná firemná pošta a schránka", "Integrált vállalati levelezőkliens"),
        icon: Mail,
        color: "var(--color-pink-600)",
        bgColor: "rgba(219, 39, 119, 0.12)",
        defaultSection: "collaboration"
      });
    }

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

    return items;
  }, [
    systemLanguage,
    customDashboards,
    unifiedEntries,
    showMailIcon,
    showRagAi,
    showSettings,
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

  // Group Management Handlers
  const handleCreateGroup = () => {
    const newId = `group_${Date.now()}`;
    const newName = `${t("New Group", "Nová skupina", "Új csoport")} ${groups.length + 1}`;
    const newGroup: MenuGroup = {
      id: newId,
      name: newName,
      iconName: "FolderOpen",
      color: "text-indigo-600 ",
      isCustom: true
    };
    const nextGroups = [...groups, newGroup];
    setGroups(nextGroups);
    setEditingGroupId(newId);
    setEditingGroupName(newName);
    persistLayout(nextGroups, groupItemsMap, unusedItemIds);
  };

  const handleSaveGroupName = (groupId: string) => {
    if (!editingGroupName.trim()) {
      setEditingGroupId(null);
      return;
    }
    const nextGroups = groups.map((g) =>
      g.id === groupId ? { ...g, name: editingGroupName.trim() } : g
    );
    setGroups(nextGroups);
    setEditingGroupId(null);
    persistLayout(nextGroups, groupItemsMap, unusedItemIds);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (window.confirm(t("Delete this group and move its items to Unused?", "Vymazať túto skupinu a presunúť jej položky do Nepoužívaných?", "Törli ezt a csoportot, és áthelyezi elemeit a Nem használtak közé?"))) {
      const groupToDelete = resolvedGroupsData.groupsWithItems.find((g) => g.id === groupId);
      const itemsToMove = groupToDelete ? groupToDelete.items.map((i) => i.id) : [];

      const nextGroups = groups.filter((g) => g.id !== groupId);
      const nextGroupItems = { ...groupItemsMap };
      delete nextGroupItems[groupId];
      const nextUnused = Array.from(new Set([...unusedItemIds, ...itemsToMove]));

      setGroups(nextGroups);
      setGroupItemsMap(nextGroupItems);
      setUnusedItemIds(nextUnused);
      persistLayout(nextGroups, nextGroupItems, nextUnused);
    }
  };

  // Group Drag & Drop (Reordering whole columns)
  const handleGroupDragStart = (e: React.DragEvent, groupId: string) => {
    if (!isEditing) return;
    setDraggedGroupId(groupId);
    e.dataTransfer.setData("text/group-id", groupId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleGroupDragOver = (e: React.DragEvent, targetGroupId: string) => {
    if (!isEditing || !draggedGroupId || draggedGroupId === targetGroupId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroupId(targetGroupId);
  };

  const handleGroupDrop = (e: React.DragEvent, targetGroupId: string) => {
    if (!isEditing || !draggedGroupId || draggedGroupId === targetGroupId) return;
    e.preventDefault();

    const fromIdx = groups.findIndex((g) => g.id === draggedGroupId);
    const toIdx = groups.findIndex((g) => g.id === targetGroupId);
    if (fromIdx === -1 || toIdx === -1) return;

    const nextGroups = [...groups];
    const [moved] = nextGroups.splice(fromIdx, 1);
    nextGroups.splice(toIdx, 0, moved);

    setGroups(nextGroups);
    setDraggedGroupId(null);
    setDragOverGroupId(null);
    persistLayout(nextGroups, groupItemsMap, unusedItemIds);
  };

  // Item Drag & Drop Handlers
  const draggedItemObj = useMemo(() => {
    if (!draggedItemId) return null;
    return allItems.find((i) => i.id === draggedItemId) || null;
  }, [allItems, draggedItemId]);

  const handleItemDragStart = (e: React.DragEvent, id: string, fromGroup: string) => {
    if (!isEditing) return;
    setDraggedItemId(id);
    setDraggedFromGroup(fromGroup);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleItemDragOverContainer = (e: React.DragEvent, targetGroup: string) => {
    if (!isEditing || !draggedItemId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroup(targetGroup);
    if (dragOverGroup !== targetGroup) {
      setDragOverItemIndex(null);
    }
  };

  const handleItemDragOverItem = (e: React.DragEvent, targetGroup: string, targetIndex: number) => {
    if (!isEditing || !draggedItemId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroup(targetGroup);
    setDragOverItemIndex(targetIndex);
  };

  const handleItemDragEnd = () => {
    setDraggedItemId(null);
    setDraggedFromGroup(null);
    setDragOverGroup(null);
    setDragOverItemIndex(null);
  };

  const handleItemDropOnGroup = (e: React.DragEvent, targetGroupId: string, targetIndex?: number) => {
    if (!isEditing || !draggedItemId || !draggedFromGroup) return;
    e.preventDefault();
    e.stopPropagation();

    const nextGroupItems: Record<string, string[]> = {};
    resolvedGroupsData.groupsWithItems.forEach((g) => {
      nextGroupItems[g.id] = g.items.map((i) => i.id);
    });
    let nextUnused = resolvedGroupsData.unused.map((i) => i.id);

    // Remove from source
    if (draggedFromGroup === "unused") {
      nextUnused = nextUnused.filter((id) => id !== draggedItemId);
    } else if (nextGroupItems[draggedFromGroup]) {
      nextGroupItems[draggedFromGroup] = nextGroupItems[draggedFromGroup].filter((id) => id !== draggedItemId);
    }

    // Insert into target
    if (!nextGroupItems[targetGroupId]) {
      nextGroupItems[targetGroupId] = [];
    }
    const targetList = nextGroupItems[targetGroupId];
    const insertIdx = targetIndex !== undefined && targetIndex >= 0 ? targetIndex : targetList.length;
    targetList.splice(insertIdx, 0, draggedItemId);

    setGroupItemsMap(nextGroupItems);
    setUnusedItemIds(nextUnused);
    persistLayout(groups, nextGroupItems, nextUnused);

    setDraggedItemId(null);
    setDraggedFromGroup(null);
    setDragOverGroup(null);
    setDragOverItemIndex(null);
  };

  const handleDropOnUnused = (e: React.DragEvent) => {
    if (!isEditing || !draggedItemId || !draggedFromGroup) return;
    e.preventDefault();
    e.stopPropagation();

    if (draggedFromGroup === "unused") {
      setDraggedItemId(null);
      setDraggedFromGroup(null);
      setDragOverGroup(null);
      setDragOverItemIndex(null);
      return;
    }

    const nextGroupItems: Record<string, string[]> = {};
    resolvedGroupsData.groupsWithItems.forEach((g) => {
      nextGroupItems[g.id] = g.items.map((i) => i.id);
    });

    if (nextGroupItems[draggedFromGroup]) {
      nextGroupItems[draggedFromGroup] = nextGroupItems[draggedFromGroup].filter((id) => id !== draggedItemId);
    }

    const nextUnused = Array.from(new Set([...resolvedGroupsData.unused.map((i) => i.id), draggedItemId]));

    setGroupItemsMap(nextGroupItems);
    setUnusedItemIds(nextUnused);
    persistLayout(groups, nextGroupItems, nextUnused);

    setDraggedItemId(null);
    setDraggedFromGroup(null);
    setDragOverGroup(null);
    setDragOverItemIndex(null);
  };

  const handleHideItem = (itemId: string, fromGroupId: string) => {
    const nextGroupItems: Record<string, string[]> = {};
    resolvedGroupsData.groupsWithItems.forEach((g) => {
      nextGroupItems[g.id] = g.items.map((i) => i.id);
    });
    if (nextGroupItems[fromGroupId]) {
      nextGroupItems[fromGroupId] = nextGroupItems[fromGroupId].filter((id) => id !== itemId);
    }
    const nextUnused = Array.from(new Set([...resolvedGroupsData.unused.map((i) => i.id), itemId]));

    setGroupItemsMap(nextGroupItems);
    setUnusedItemIds(nextUnused);
    persistLayout(groups, nextGroupItems, nextUnused);
  };

  const handleRestoreItem = (item: NavMenuItem) => {
    const nextGroupItems: Record<string, string[]> = {};
    resolvedGroupsData.groupsWithItems.forEach((g) => {
      nextGroupItems[g.id] = g.items.map((i) => i.id);
    });
    const nextUnused = resolvedGroupsData.unused.map((i) => i.id).filter((id) => id !== item.id);

    const targetGroupId = groups.some((g) => g.id === item.defaultSection)
      ? item.defaultSection
      : groups[0]?.id || "operations";

    if (!nextGroupItems[targetGroupId]) {
      nextGroupItems[targetGroupId] = [];
    }
    nextGroupItems[targetGroupId].push(item.id);

    setGroupItemsMap(nextGroupItems);
    setUnusedItemIds(nextUnused);
    persistLayout(groups, nextGroupItems, nextUnused);
  };

  if (!isOpen && !isClosing) return null;

  const handleItemClick = (id: string) => {
    if (isEditing) return;
    onSelectTab(id);
    handleAnimatedClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 select-none">
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 bg-slate-950/40 backdrop-blur-md transition-opacity duration-250 ease-out ${
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => {
          if (!isEditing) handleAnimatedClose();
        }}
      />

      {/* Start Menu Container */}
      {/* 
        Dark Theme Preset for Container:
        className="... bg-slate-50  backdrop-blur-2xl border border-slate-200/90  ..."
      */}
      <div
        ref={menuRef}
        className={`relative z-10 w-full max-w-6xl bg-white backdrop-blur-2xl border border-slate-200/90 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col max-h-[92vh] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
          isVisible
            ? "scale-100 opacity-100 translate-y-0 translate-x-0"
            : "scale-95 opacity-0 pointer-events-none"
        }`}
      >
        {/* Top Header & Search Bar & Edit Button */}
        <div className="p-5 sm:p-6 border-b border-slate-100  bg-gradient-to-b from-slate-50/80  to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center gap-1 p-2 rounded-2xl bg-white  shadow-sm border border-slate-200/80 ">
              <div className="flex items-center justify-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shadow-xs animate-pulse" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs" />
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-xs" />
              </div>
              <span className="text-[7.5px] font-black tracking-widest text-indigo-600  uppercase leading-none">
                START
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-base text-slate-900  tracking-tight">
                  {systemName}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600  border border-indigo-500/20">
                  {t("Start Menu", "Štart menu", "Start menü")}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {(isEditing
                  ? t("Drag groups to reorder columns • Add new group • Pin 📌 items to left sidebar", "Presúvajte celé skupiny • Vytvorte novú skupinu • Pripnite 📌 položky na bočný panel", "Csoportok átrendezése • Új csoport • Kitűzés 📌 a bal oldalsávra")
                  : t("Quick access to all CRM modules & applications", "Rýchly prístup k modulom a evidenciám", "Gyors hozzáférés az összes modulhoz"))}
              </p>
            </div>
          </div>

          {/* Search Bar & Actions */}
          <div className="flex items-center gap-2 flex-1 max-w-xl justify-end">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search modules... (ESC)", "Hľadať v moduloch... (ESC)", "Keresés a modulok között...")}
                className="w-full pl-10 pr-9 py-2.5 bg-white  border border-slate-200  rounded-2xl text-xs text-slate-900  placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600  cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Create New Group Button (in Edit Mode) */}
            {isEditing && (
              <button
                type="button"
                onClick={handleCreateGroup}
                className="px-3 py-2 rounded-2xl text-xs font-bold bg-purple-50  hover:bg-purple-100  text-purple-700  border border-purple-200  transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                title={t("Create New Group Column", "Vytvoriť novú skupinu", "Új csoport létrehozása")}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>{t("New Group", "Nová skupina", "Új csoport")}</span>
              </button>
            )}

            {/* Edit / Customize Toggle Button */}
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                isEditing
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 ring-2 ring-indigo-400/30"
                  : "bg-slate-100  hover:bg-slate-200  text-slate-700 "
              }`}
              title={isEditing ? t("Finish Customization", "Ukončiť úpravy", "Módosítás befejezése") : t("Customize Order, Groups & Sidebar Pins", "Prispôsobiť menu a skupiny", "Menü és csoportok testreszabása")}
            >
              {isEditing ? (
                <>
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>{t("Done", "Hotovo", "Kész")}</span>
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  <span>{t("Edit", "Upraviť", "Szerkesztés")}</span>
                </>
              )}
            </button>

            {/* Reset to Default Button */}
            {isEditing && (
              <button
                type="button"
                onClick={handleResetLayout}
                className="p-2 rounded-2xl bg-slate-100  hover:bg-slate-200  text-slate-500 hover:text-slate-800  transition-colors cursor-pointer shrink-0"
                title={t("Reset to Default Layout", "Obnoviť predvolené", "Alapértelmezett visszaállítása")}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="p-2.5 rounded-2xl bg-slate-100  hover:bg-slate-200  text-slate-500 hover:text-slate-900  transition-colors cursor-pointer shrink-0"
              title="Close (ESC)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Edit Mode Instructions Banner */}
        {isEditing && (
          <div className="bg-indigo-50/90  border-b border-indigo-100  px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-indigo-900  animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-ping shrink-0" />
              <span className="font-bold shrink-0">
                {t("Edit Mode Active:", "Režim úprav aktívny:", "Szerkesztési mód aktív:")}
              </span>
              <span className="truncate">
                {t("Drag column headers to reorder whole groups • Rename with ✏️ • Pin 📌 to Left Sidebar", "Potiahnutím záhlavia zmeňte poradie skupín • Premenujte cez ✏️ • Pripnite 📌 na bočný panel", "Húzza a fejlécet a csoportok átrendezéséhez • Átnevezés ✏️ • Kitűzés 📌 az oldalsávra")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-xs font-bold text-indigo-600  hover:underline cursor-pointer shrink-0"
            >
              {t("Done Editing ➔", "Hotovo ➔", "Kész ➔")}
            </button>
          </div>
        )}

        {/* Dynamic Multi-Column Grouped Menu Grid */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
            {resolvedGroupsData.groupsWithItems.map((group) => {
              const IconComp = (Icons as any)[group.iconName || "FolderOpen"] || FolderOpen;
              const filteredItems = searchFilter(group.items);
              const isAnalyticsGroup = group.id === "analytics";

              return (
                <div
                  key={group.id}
                  onDragOver={(e) => {
                    if (draggedGroupId) {
                      handleGroupDragOver(e, group.id);
                    } else {
                      handleItemDragOverContainer(e, group.id);
                    }
                  }}
                  onDrop={(e) => {
                    if (draggedGroupId) {
                      handleGroupDrop(e, group.id);
                    } else {
                      handleItemDropOnGroup(e, group.id);
                    }
                  }}
                  /*
                    Dark Theme Preset for Group:
                    isEditing && dragOverGroupId === group.id
                      ? "bg-purple-50/60  ring-2 ring-purple-500 ring-dashed"
                      : isEditing && dragOverGroup === group.id
                      ? "bg-indigo-50/50  ring-2 ring-indigo-400/50 ring-dashed"
                      : "bg-white  border border-slate-200/50 "
                  */
                  className={`space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both flex flex-col p-3 rounded-3xl transition-all ${
                    isEditing && dragOverGroupId === group.id
                      ? "bg-purple-50/60 ring-2 ring-purple-500 ring-dashed"
                      : isEditing && dragOverGroup === group.id
                      ? "bg-indigo-50/50 ring-2 ring-indigo-400/50 ring-dashed"
                      : "bg-slate-50 border border-slate-200/50"
                  }`}
                >
                  {/* Group Column Header (Draggable & Editable in Edit Mode) */}
                  <div
                    draggable={isEditing}
                    onDragStart={(e) => handleGroupDragStart(e, group.id)}
                    className={`flex items-center justify-between pb-2.5 border-b border-slate-200/70  text-[11px] font-black uppercase tracking-wider ${
                      group.color || "text-slate-700 "
                    } ${isEditing ? "cursor-grab active:cursor-grabbing hover:opacity-80" : ""}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isEditing && (
                        <GripVertical className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      )}
                      <IconComp className="h-3.5 w-3.5 shrink-0" />

                      {/* Inline Group Name Editing */}
                      {editingGroupId === group.id ? (
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <input
                            type="text"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveGroupName(group.id);
                              if (e.key === "Escape") setEditingGroupId(null);
                            }}
                            autoFocus
                            className="w-full px-2 py-1 text-xs font-bold rounded-lg border border-indigo-400 bg-white  text-slate-800  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveGroupName(group.id)}
                            className="p-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shrink-0"
                            title="Save"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingGroupId(null)}
                            className="p-1 rounded-md bg-slate-200  text-slate-600  hover:bg-slate-300 cursor-pointer shrink-0"
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="truncate font-black">{group.name}</span>
                      )}
                    </div>

                    {/* Group Header Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-200/70  text-slate-600  font-bold">
                        {filteredItems.length}
                      </span>
                      {isEditing && editingGroupId !== group.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroupId(group.id);
                              setEditingGroupName(group.name);
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200  text-slate-400 hover:text-slate-700  transition-colors cursor-pointer"
                            title={t("Rename group", "Premenovať skupinu", "Csoport átnevezése")}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {groups.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(group.id)}
                              className="p-1 rounded-lg hover:bg-rose-100  text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title={t("Delete group", "Vymazať skupinu", "Csoport törlése")}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Group Items Container */}
                  <div className="space-y-1.5 flex-1 min-h-[50px]">
                    {filteredItems.map((item, idx) => {
                      const isBeingDragged = draggedItemId === item.id;
                      const isDropTargetBefore = isEditing && draggedItemId && dragOverGroup === group.id && dragOverItemIndex === idx && !isBeingDragged;

                      return (
                        <React.Fragment key={item.id}>
                          {/* Landing Target Slot matching card dimensions */}
                          {isDropTargetBefore && (
                            <div
                              onDragOver={(e) => handleItemDragOverItem(e, group.id, idx)}
                              onDrop={(e) => handleItemDropOnGroup(e, group.id, idx)}
                              className="w-full p-2.5 rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-50/90  shadow-sm flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 ring-2 ring-indigo-400/30"
                              style={{ minHeight: "72px" }}
                            >
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-xl bg-indigo-200/80  text-indigo-700  shrink-0 animate-bounce">
                                  {draggedItemObj ? <draggedItemObj.icon className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                </div>
                                <span className="text-xs font-bold text-indigo-900  truncate flex-1">
                                  {draggedItemObj?.label || t("Drop item here", "Pustiť sem", "Ide helyezés")}
                                </span>
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-200  text-indigo-800  shrink-0">
                                  {t("Landing slot", "Miesto vloženia", "Beillesztési hely")}
                                </span>
                              </div>
                              <div className="h-4 rounded-xl bg-indigo-200/40  w-full" />
                            </div>
                          )}

                          <StartMenuItemTile
                            item={item}
                            isActive={activeTab === item.id || activeTab.startsWith(item.id + "/")}
                            isEditing={isEditing}
                            isDragging={isBeingDragged}
                            isPinned={pinnedSidebarItems.includes(item.id)}
                            onTogglePin={() => onTogglePinToSidebar?.(item.id)}
                            onHide={() => handleHideItem(item.id, group.id)}
                            onDragStart={(e) => handleItemDragStart(e, item.id, group.id)}
                            onDragEnd={handleItemDragEnd}
                            onDragOver={(e) => handleItemDragOverItem(e, group.id, idx)}
                            onDrop={(e) => handleItemDropOnGroup(e, group.id, idx)}
                            onClick={() => handleItemClick(item.id)}
                          />
                        </React.Fragment>
                      );
                    })}

                    {/* Landing Target Slot at end of group list */}
                    {isEditing &&
                      draggedItemId &&
                      dragOverGroup === group.id &&
                      (dragOverItemIndex === null || dragOverItemIndex >= filteredItems.length) &&
                      !filteredItems.some((i) => i.id === draggedItemId) && (
                        <div
                          onDragOver={(e) => handleItemDragOverContainer(e, group.id)}
                          onDrop={(e) => handleItemDropOnGroup(e, group.id, filteredItems.length)}
                          className="w-full p-2.5 rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-50/90  shadow-sm flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 ring-2 ring-indigo-400/30"
                          style={{ minHeight: "72px" }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-xl bg-indigo-200/80  text-indigo-700  shrink-0 animate-bounce">
                              {draggedItemObj ? <draggedItemObj.icon className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </div>
                            <span className="text-xs font-bold text-indigo-900  truncate flex-1">
                              {draggedItemObj?.label || t("Drop item here", "Pustiť sem", "Ide helyezés")}
                            </span>
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-200  text-indigo-800  shrink-0">
                              {t("Landing slot", "Miesto vloženia", "Beillesztési hely")}
                            </span>
                          </div>
                          <div className="h-4 rounded-xl bg-indigo-200/40  w-full" />
                        </div>
                      )}

                    {filteredItems.length === 0 && isEditing && (
                      <div className="py-4 text-center border border-dashed border-slate-200  rounded-2xl text-[10px] text-slate-400">
                        {t("Drop items here", "Sem presuňte položky", "Húzza ide az elemeket")}
                      </div>
                    )}

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
                            <span className="text-xs font-bold truncate">
                              {t("New Dashboard", "Nový panel", "Új irányítópult")}
                            </span>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md bg-purple-100/80  text-purple-600 ">
                              +
                            </span>
                          </div>
                          <p className="text-[10px] text-purple-600/70  line-clamp-1 mt-0.5 leading-snug">
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

          {/* DEDICATED UNUSED / HIDDEN ITEMS DROP CARD */}
          {(isEditing || resolvedGroupsData.unused.length > 0) && (
            <div
              onDragOver={(e) => handleItemDragOverContainer(e, "unused")}
              onDrop={handleDropOnUnused}
              className={`p-4 rounded-3xl border-2 transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 ${
                dragOverGroup === "unused"
                  ? "bg-rose-50/70  border-rose-400 ring-4 ring-rose-400/20"
                  : "bg-slate-50/70  border-dashed border-slate-300 "
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200/80 ">
                <div className="flex items-center gap-2 text-slate-700 ">
                  <Archive className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    {t("Unused / Hidden Modules", "Nepoužívané / Skryté moduly", "Nem használt / Rejtett modulok")}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-200  text-slate-600 ">
                    {resolvedGroupsData.unused.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {t("Drop items here to hide them from the columns above.", "Presuňte sem položky, ktoré nechcete zobrazovať v stĺpcoch vyššie.", "Húzza ide azokat az elemeket, amelyeket el szeretne rejteni.")}
                </p>
              </div>

              {resolvedGroupsData.unused.length === 0 && (!isEditing || dragOverGroup !== "unused") ? (
                <div className="py-6 text-center text-xs text-slate-400 font-medium">
                  {t("No hidden items. Drag and drop any module here to hide it from the Start Menu.", "Žiadne skryté moduly. Presuňte sem ľubovoľný modul zo zoznamu pre jeho skrytie.", "Nincsenek rejtett elemek. Húzzon ide egy modult az elrejtéshez.")}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {/* Landing Placeholder Slot in Unused Card */}
                  {isEditing && draggedItemId && dragOverGroup === "unused" && (
                    <div className="p-3 rounded-2xl border-2 border-dashed border-rose-500 bg-rose-50/90  shadow-sm flex items-center gap-2.5 animate-in fade-in zoom-in-95 duration-150 ring-2 ring-rose-400/30">
                      <div className="p-1.5 rounded-xl bg-rose-200  text-rose-700  shrink-0 animate-bounce">
                        {draggedItemObj ? <draggedItemObj.icon className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-xs font-bold text-rose-800  truncate flex-1">
                        {draggedItemObj?.label || t("Hide item", "Skryť položku", "Elem elrejtése")}
                      </span>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-200  text-rose-800  shrink-0">
                        {t("Drop to hide", "Pustiť pre skrytie", "Elrejtés")}
                      </span>
                    </div>
                  )}

                  {searchFilter(resolvedGroupsData.unused).map((item) => {
                    const Icon = item.icon;
                    const isPinned = pinnedSidebarItems.includes(item.id);
                    const isBeingDragged = draggedItemId === item.id;
                    return (
                      <div
                        key={item.id}
                        draggable={isEditing}
                        onDragStart={(e) => handleItemDragStart(e, item.id, "unused")}
                        onDragEnd={handleItemDragEnd}
                        className={`p-3 rounded-2xl border shadow-2xs flex flex-col gap-2 group transition-all ${
                          isBeingDragged
                            ? "opacity-25 scale-95 border-2 border-dashed border-rose-400 bg-rose-50/20"
                            : "bg-white  border-slate-200  hover:border-slate-300 "
                        }`}
                      >
                        {/* Title Row (Full width) */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isEditing && (
                            <GripVertical className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0" />
                          )}
                          <div
                            className="p-1.5 rounded-xl shrink-0"
                            style={{
                              backgroundColor: item.bgColor || `${item.color}18`,
                              color: item.color
                            }}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-bold text-slate-700  truncate flex-1">
                            {item.label}
                          </span>
                        </div>

                        {/* Action Row Below Title */}
                        <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100 ">
                          {/* Pin to Sidebar button */}
                          {onTogglePinToSidebar && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTogglePinToSidebar(item.id);
                              }}
                              className={`flex-1 py-1.5 px-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                isPinned
                                  ? "bg-indigo-600 text-white shadow-xs"
                                  : "bg-slate-100  hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 "
                              }`}
                              title={isPinned ? t("Pinned to sidebar. Click to unpin.", "Pripnuté v bočnom paneli. Kliknite pre odopnutie.", "Kitűzve az oldalsávra.") : t("Pin to left sidebar", "Pripnúť na bočný panel", "Kitűzés a bal oldalsávra")}
                            >
                              <Pin className={`h-3 w-3 ${isPinned ? "fill-current" : ""}`} />
                              <span>{isPinned ? t("Pinned", "Pripnuté", "Kitűzve") : t("Pin", "Pripnúť", "Kitűzés")}</span>
                            </button>
                          )}

                          {/* Restore button */}
                          <button
                            type="button"
                            onClick={() => handleRestoreItem(item)}
                            className="py-1.5 px-2.5 rounded-xl bg-emerald-50  hover:bg-emerald-100  text-emerald-600  text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title={t("Restore to menu", "Vrátiť do menu", "Visszaállítás a menübe")}
                          >
                            <Plus className="h-3 w-3" />
                            <span>{t("Restore", "Vrátiť", "Vissza")}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: User Profile & Quick Actions */}
        <div className="p-4 sm:px-6 bg-slate-50/90  border-t border-slate-100  flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-bold flex items-center justify-center text-xs shadow-sm">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <span className="font-bold text-slate-800 block leading-tight">
                {currentUser?.name || "User"}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                {currentUser?.role || "Member"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleItemClick("personal-settings")}
              className="px-3 py-1.5 rounded-xl bg-white  border border-slate-200  hover:bg-slate-100 text-slate-700  font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span>{t("Profile", "Profil", "Profil")}</span>
            </button>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t("Sign Out", "Odhlásiť", "Kijelentkezés")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface StartMenuItemTileProps {
  item: NavMenuItem;
  isActive: boolean;
  isEditing?: boolean;
  isDragging?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onHide?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onClick: () => void;
}

const StartMenuItemTile: React.FC<StartMenuItemTileProps> = ({
  item,
  isActive,
  isEditing = false,
  isDragging = false,
  isPinned = false,
  onTogglePin,
  onHide,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onClick
}) => {
  const Icon = item.icon;

  if (isEditing) {
    // EDIT MODE: Full-width title on top, NO description, actions row placed cleanly BELOW the title!
    return (
      <div
        draggable={true}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`w-full p-2.5 rounded-2xl transition-all flex flex-col gap-2 cursor-grab active:cursor-grabbing group ${
          isDragging
            ? "opacity-25 scale-95 border-2 border-dashed border-indigo-400 bg-indigo-50/20 "
            : "bg-white  border border-slate-200/90  shadow-2xs hover:shadow-md hover:border-indigo-300 "
        }`}
      >
        {/* Top Row: Drag Handle + Icon + Full Title + Badge */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 text-slate-300  group-hover:text-slate-500">
            <GripVertical className="h-4 w-4" />
          </div>
          <div
            className="p-1.5 rounded-xl shrink-0 transition-transform group-hover:scale-105"
            style={{
              backgroundColor: item.bgColor || `${item.color}18`,
              color: item.color
            }}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold text-slate-900  truncate flex-1">
            {item.label}
          </span>
          {item.badge && (
            <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded-md bg-slate-100  text-slate-500  shrink-0">
              {item.badge}
            </span>
          )}
        </div>

        {/* Bottom Actions Row (Below the title) */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 ">
          {/* Pin to Sidebar button */}
          {onTogglePin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              className={`flex-1 py-1 px-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                isPinned
                  ? "bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-500 hover:bg-indigo-700"
                  : "bg-slate-100  hover:bg-indigo-50 hover:text-indigo-600  text-slate-600 "
              }`}
              title={isPinned ? "Pinned to left sidebar. Click to unpin." : "Pin to left sidebar"}
            >
              <Pin className={`h-3 w-3 ${isPinned ? "fill-current" : ""}`} />
              <span>{isPinned ? "Pinned" : "Pin"}</span>
            </button>
          )}

          {/* Hide button */}
          {onHide && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onHide();
              }}
              className="py-1 px-2.5 rounded-xl bg-slate-100  hover:bg-rose-50  hover:text-rose-600 text-slate-500  text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Hide item (move to Unused)"
            >
              <EyeOff className="h-3 w-3" />
              <span>Hide</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/*
        Dark Theme Preset for Tile:
        isActive
          ? "bg-indigo-50/90  border-indigo-400  shadow-xs ring-1 ring-indigo-500/20"
          : "bg-slate-50  border-transparent hover:border-slate-200  hover:bg-white  hover:shadow-md hover:scale-[1.015] hover:-translate-y-0.5 active:scale-[0.98]"
      */}
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
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold truncate transition-colors ${isActive ? "text-indigo-600 " : "text-slate-800  group-hover:text-slate-950 "}`}>
            {item.label}
          </span>
          {item.badge && (
            <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md bg-slate-100  text-slate-500 ">
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
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

